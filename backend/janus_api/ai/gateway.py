import asyncio
import logging
import re
from decimal import Decimal
from time import monotonic

import httpx
import litellm
from litellm.exceptions import (
    APIConnectionError,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    PaymentRequiredError,
    PermissionDeniedError,
    RateLimitError,
    ServiceUnavailableError,
    Timeout,
)
from litellm.llms.custom_httpx.http_handler import AsyncHTTPHandler
from openai import AsyncOpenAI

from janus_api.ai import catalog, schemas
from janus_api.ai.models import AICredential, AIUsage
from janus_api.core.db import session_factory
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.core.tenancy import set_context

# Credentials and prompts must never enter SDK debug output or callbacks.
litellm.suppress_debug_info = True
litellm.turn_off_message_logging = True
logging.getLogger("LiteLLM").disabled = True

BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
}


def usage_out(row: AIUsage) -> schemas.UsageOut:
    return schemas.UsageOut(
        id=str(row.id),
        tenantId=str(row.tenant_id),
        date=row.created_at,
        provider=row.provider,
        model=row.model,
        feature=row.feature,
        status=row.status,
        inputTokens=row.input_tokens,
        outputTokens=row.output_tokens,
        units=row.total_tokens,
        costUsd=row.cost_usd,
        costEstimated=row.cost_usd is not None,
        errorCode=row.error_code,
        latencyMs=row.latency_ms,
        finishedAt=row.finished_at,
    )


async def provider_call(
    credential: AICredential,
    key: str,
    messages: list[schemas.Message],
    max_tokens: int,
) -> litellm.ModelResponse:
    provider = credential.provider if credential.provider in ("anthropic", "gemini") else "openai"
    base_url = (
        credential.base_url
        or catalog.COMPATIBLE.get(credential.provider)
        or BASE_URLS[credential.provider]
    )
    client: AsyncOpenAI | AsyncHTTPHandler
    if provider == "openai":
        client = AsyncOpenAI(
            api_key=key,
            base_url=base_url,
            max_retries=0,
            http_client=httpx.AsyncClient(follow_redirects=False, trust_env=False),
        )
    else:
        client = AsyncHTTPHandler(timeout=30, follow_redirects=False, ssl_verify=True)
    try:
        async with asyncio.timeout(35):
            response = await litellm.acompletion(
                model=f"{provider}/{credential.model}",
                custom_llm_provider=provider,
                api_key=key,
                api_base=base_url,
                client=client,
                messages=[message.model_dump() for message in messages],
                max_tokens=max_tokens,
                timeout=30,
                num_retries=0,
                stream=False,
                caching=False,
            )
        if not isinstance(response, litellm.ModelResponse):
            raise ApiError("ai_invalid_response", "The provider returned an invalid response.", 502)
        return response
    finally:
        await client.close()


def capture_usage(row: AIUsage, response: litellm.ModelResponse) -> None:
    usage = response.model_dump().get("usage")
    if not isinstance(usage, dict):
        return
    counts = [usage.get(key) for key in ("prompt_tokens", "completion_tokens", "total_tokens")]
    if not all(type(count) is int and 0 <= count < 2**63 for count in counts):
        return
    if counts[2] == 0:
        return  # Some compatible providers omit usage; the SDK supplies zero defaults.
    row.input_tokens, row.output_tokens, row.total_tokens = counts
    if row.provider not in BASE_URLS:
        return  # A custom deployment's prices cannot be inferred from its model name.
    try:
        amount = litellm.completion_cost(
            completion_response=response, model=f"{row.provider}/{row.model}"
        )
        cost = Decimal(str(amount))
        if cost.is_finite() and 0 <= cost < 10**10:
            row.cost_usd = cost.quantize(Decimal("0.0000000001"))
    except Exception:
        pass  # Unknown model prices remain NULL; successful calls still return their output.


def _reason(error: Exception) -> str:
    """The provider's own words, without LiteLLM's prefixes, short, and with nothing like a key."""
    text = str(getattr(error, "message", None) or error)
    # Some providers (Google) answer in JSON: their own "message" is the part worth reading.
    found = re.search(r'"message"\s*:\s*"((?:[^"\\]|\\.)*)"', text)
    if found:
        text = found.group(1)
    text = re.sub(r"^(litellm\.)?\w+Error:\s*", "", text)
    text = re.sub(r"^(\w+Error:\s*)?\w*Exception\s*-\s*", "", text)
    text = re.sub(r"(sk|rk|gsk|csk|nvapi|hf|ghp|github_pat)[-_][A-Za-z0-9_-]{8,}", "[key]", text)
    return text.strip().splitlines()[0][:180] if text.strip() else ""


def provider_error(error: Exception) -> ApiError:
    """What went wrong, in words a person can act on. Providers answer a wrong key or model in
    different ways (Groq says 400 "Invalid API Key"), so the reason is read, not only the type."""
    if isinstance(error, ApiError):
        return error
    reason = _reason(error)
    lowered = reason.lower()
    if isinstance(error, (AuthenticationError, PermissionDeniedError)) or any(
        word in lowered
        for word in ("api key", "api_key", "authentication", "unauthorized", "auth header")
    ):
        return ApiError(
            "ai_authentication_failed",
            "The provider rejected the API key. Check it was copied whole and is still active.",
            502,
        )
    if isinstance(error, NotFoundError) or (
        "model" in lowered
        and any(
            word in lowered
            for word in (
                "not found",
                "does not exist",
                "not a valid model",
                "decommissioned",
                "no endpoints",
                "not supported",
                "unknown model",
            )
        )
    ):
        return ApiError(
            "ai_model_not_found",
            "The provider has no model by that name. Pick one from its list."
            + (f" It said: {reason}" if reason else ""),
            502,
        )
    if isinstance(error, PaymentRequiredError) or "credit" in lowered or "billing" in lowered:
        return ApiError(
            "ai_billing", "The provider wants credit or billing set up on this key first.", 402
        )
    if isinstance(error, ServiceUnavailableError) or any(
        word in lowered for word in ("high demand", "overloaded", "unavailable", "try again later")
    ):
        return ApiError(
            "ai_busy",
            "The provider is busy with this model right now. Try again shortly, or pick another.",
            503,
        )
    if isinstance(error, RateLimitError):
        return ApiError("ai_rate_limited", "The provider's rate or usage limit was reached.", 429)
    if isinstance(error, (TimeoutError, Timeout)):
        return ApiError("ai_timeout", "The provider did not respond in time.", 504)
    if isinstance(error, APIConnectionError):
        return ApiError("ai_unreachable", "The provider could not be reached.", 502)
    if isinstance(error, BadRequestError) and reason:
        return ApiError("ai_provider_error", f"The provider refused the request: {reason}", 502)
    return ApiError(
        "ai_provider_error", "The AI request failed. Check the provider and model settings.", 502
    )


async def finish_usage(row: AIUsage) -> None:
    # Separate commits preserve the call record if the caller's transaction rolls back.
    async with session_factory()() as db, db.begin():
        await set_context(db, tenant_id=row.tenant_id)
        await db.merge(row)


async def complete(
    credential: AICredential,
    key: str,
    messages: list[schemas.Message],
    *,
    feature: str,
    max_tokens: int,
) -> schemas.CompletionOut:
    if (
        not re.fullmatch(r"[a-z][a-z0-9_]{0,79}", feature)
        or not 1 <= max_tokens <= 4096
        or not 1 <= len(messages) <= 20
        or sum(len(m.content) for m in messages) > 64000
    ):
        raise ApiError("invalid_ai_request", "Invalid AI request limits or feature.", 422)
    row = AIUsage(
        tenant_id=credential.tenant_id,
        provider=credential.provider,
        model=credential.model,
        feature=feature,
    )
    async with session_factory()() as db, db.begin():
        await set_context(db, tenant_id=row.tenant_id)
        db.add(row)
        await db.flush()
    started = monotonic()
    try:
        response = await provider_call(credential, key, messages, max_tokens)
        capture_usage(row, response)
        value = response.model_dump()["choices"][0]["message"].get("content")
        if not isinstance(value, str) or not value.strip():
            raise ApiError("ai_empty_response", "The provider returned no text.", 502)
        row.status = "succeeded"
    except asyncio.CancelledError:
        row.status, row.error_code = "failed", "request_cancelled"
        raise
    except Exception as error:
        safe = provider_error(error)
        row.status, row.error_code = "failed", safe.code
        raise safe from None
    finally:
        row.latency_ms = round((monotonic() - started) * 1000)
        row.finished_at = now()
        await asyncio.shield(finish_usage(row))
    return schemas.CompletionOut(text=value, usage=usage_out(row))
