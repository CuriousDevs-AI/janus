import hashlib
import hmac
import html
import json
from datetime import timedelta

from fastapi import Request
from sqlalchemy import case, delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from janus_api.core.config import get_settings
from janus_api.core.deps import request_ip
from janus_api.core.errors import ApiError
from janus_api.core.security import now
from janus_api.sources.ingest import (
    event_key,
    parse_json,
    read_body,
    resolve_connection,
    store_event,
)
from janus_api.sources.models import FormRateLimit, SourceConnection
from janus_api.sources.schemas import ReceiptOut
from janus_api.sources.service import get_connection


async def allowed_connection(
    db: AsyncSession, public_key: str, request: Request
) -> SourceConnection:
    connection = await resolve_connection(db, public_key, "embed")
    origin = request.headers.get("Origin", "")
    if origin not in connection.allowed_origins:
        raise ApiError("origin_denied", "This website is not allowed to submit this form.", 403)
    request.state.website_origin = origin
    return connection


async def preflight(db: AsyncSession, public_key: str, request: Request) -> None:
    await allowed_connection(db, public_key, request)
    headers = {
        part.strip().lower()
        for part in request.headers.get("Access-Control-Request-Headers", "").split(",")
        if part.strip()
    }
    if request.headers.get("Access-Control-Request-Method") != "POST" or not headers <= {
        "content-type",
        "idempotency-key",
    }:
        raise ApiError("cors_denied", "Unsupported form request.", 403)


async def rate_limit(db: AsyncSession, connection: SourceConnection, ip: str) -> None:
    current = now().replace(second=0, microsecond=0)
    hashed_ip = hmac.new(
        get_settings().jwt_secret.get_secret_value().encode(), ip.encode(), hashlib.sha256
    ).hexdigest()
    await db.execute(
        delete(FormRateLimit).where(
            FormRateLimit.connection_id == connection.id,
            FormRateLimit.window_start < current - timedelta(days=1),
        )
    )
    same_window = FormRateLimit.window_start == current
    count = await db.scalar(
        insert(FormRateLimit)
        .values(
            tenant_id=connection.tenant_id,
            connection_id=connection.id,
            ip_hash=hashed_ip,
            window_start=current,
            count=1,
        )
        .on_conflict_do_update(
            index_elements=["tenant_id", "connection_id", "ip_hash"],
            set_={
                "window_start": current,
                "count": case((same_window, FormRateLimit.count + 1), else_=1),
            },
        )
        .returning(FormRateLimit.count)
    )
    if count is not None and count > get_settings().form_limit_per_minute:
        raise ApiError(
            "rate_limited", "Too many submissions. Try again in a minute.", 429, commit=True
        )


async def receive(db: AsyncSession, public_key: str, request: Request) -> ReceiptOut:
    body = await read_body(request)
    connection = await allowed_connection(db, public_key, request)
    await rate_limit(db, connection, request_ip(request))
    try:
        payload = parse_json(body)
        if payload.pop("_janus_hp", ""):
            raise ApiError("invalid_submission", "Unable to accept this submission.", 422)
        key = event_key(request.headers.get("Idempotency-Key"))
        clean_body = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()
        return await store_event(db, connection, payload, clean_body, key)
    except ApiError as error:
        error.commit = True  # Invalid submissions must still consume the abuse quota.
        raise


async def embed(db: AsyncSession, connection_id: int) -> dict[str, str]:
    connection = await get_connection(db, connection_id)
    if connection.kind != "embed":
        raise ApiError("invalid_source", "Only website sources have an embed form.", 422)
    endpoint = (
        str(get_settings().public_api_url).rstrip("/") + f"/v1/ingest/forms/{connection.public_key}"
    )
    # No secrets in the snippet: this is a public form protected by origin checks and an IP quota.
    snippet = (
        '<form data-janus-endpoint="'
        + html.escape(endpoint, quote=True)
        + '">\n'
        + """<label>Name <input name="name" autocomplete="name" required maxlength="160"></label>
<label>Email <input name="email" type="email" autocomplete="email" maxlength="320"></label>
<label>Phone <input name="phone" type="tel" autocomplete="tel" maxlength="64"></label>
<label>Requirement <textarea name="requirement" maxlength="4000"></textarea></label>
<div hidden aria-hidden="true"><label>Leave blank
<input name="_janus_hp" tabindex="-1" autocomplete="off"></label></div>
<button type="submit">Send enquiry</button>
<p role="status" aria-live="polite"></p>
</form>
<script>
(() => {
  const form = document.currentScript.previousElementSibling;
  const button = form.querySelector('button');
  const status = form.querySelector('[role="status"]');
  let submission;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(form));
    if (!fields.phone.trim() && !fields.email.trim()) {
      status.textContent = 'Enter a phone number or email.';
      return;
    }
    const body = JSON.stringify(fields);
    if (!submission || submission.body !== body) submission = {body, key: crypto.randomUUID()};
    button.disabled = true;
    status.textContent = 'Sending…';
    try {
      const response = await fetch(form.dataset.janusEndpoint, {
        method: 'POST', credentials: 'omit',
        headers: {'Content-Type': 'application/json', 'Idempotency-Key': submission.key},
        body: submission.body
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Unable to send enquiry.');
      status.textContent = 'Enquiry received.';
      submission = undefined;
      form.reset();
    } catch (error) {
      status.textContent = error.message || 'Unable to send. Please try again.';
    } finally {
      button.disabled = false;
    }
  });
})();
</script>"""
    )
    return {"html": snippet}
