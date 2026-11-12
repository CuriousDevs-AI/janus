"""Providers that give a free API key, with their official endpoints and some of their free models.

Each is a built-in provider with a fixed official HTTPS endpoint, as OpenAI and Anthropic are, so a
company can keep a key for every one and the operator lists nothing. Gemini has its own adapter;
the rest speak the OpenAI chat format. Free tiers have rate limits, and model names change as
providers retire them: the models here are examples, the page links to each provider's own list
and lets a person type another, and Test checks a key and model against the provider itself. The
limits are described, not counted: each provider sets and changes its own.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class FreeProvider:
    id: str
    name: str
    # Its own provider id; Gemini uses the built-in Gemini adapter.
    provider: str
    # The fixed endpoint, for a provider in the OpenAI format; None for Gemini's own adapter.
    base_url: str | None
    # Examples of free models; the provider's own list is at models_url.
    models: tuple[str, ...]
    limits: str
    key_url: str
    models_url: str


FREE: tuple[FreeProvider, ...] = (
    FreeProvider(
        id="openrouter",
        name="OpenRouter",
        provider="openrouter",
        base_url="https://openrouter.ai/api/v1",
        models=(
            "google/gemma-4-31b-it:free",
            "nvidia/nemotron-3-ultra-550b-a55b:free",
            "google/gemma-4-26b-a4b-it:free",
            "nvidia/nemotron-3.5-lightning:free",
        ),
        limits="Models whose name ends in :free cost nothing, within OpenRouter's daily limits.",
        key_url="https://openrouter.ai/keys",
        models_url="https://openrouter.ai/models?max_price=0",
    ),
    FreeProvider(
        id="gemini",
        name="Google Gemini",
        provider="gemini",
        base_url=None,
        models=(
            # Google's "-latest" names follow its current models; dated names retire.
            "gemini-flash-latest",
            "gemini-flash-lite-latest",
            "gemini-3.5-flash-lite",
        ),
        limits="Free tier with Google's rate limits.",
        key_url="https://aistudio.google.com/apikey",
        models_url="https://ai.google.dev/gemini-api/docs/models",
    ),
    FreeProvider(
        id="groq",
        name="Groq",
        provider="groq",
        base_url="https://api.groq.com/openai/v1",
        models=(
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
        ),
        limits="Free tier with Groq's rate limits.",
        key_url="https://console.groq.com/keys",
        models_url="https://console.groq.com/docs/models",
    ),
    FreeProvider(
        id="cerebras",
        name="Cerebras",
        provider="cerebras",
        base_url="https://api.cerebras.ai/v1",
        models=(
            "llama-3.3-70b",
            "llama3.1-8b",
        ),
        limits="Free tier with Cerebras's rate limits.",
        key_url="https://cloud.cerebras.ai",
        models_url="https://inference-docs.cerebras.ai/models/overview",
    ),
    FreeProvider(
        id="mistral",
        name="Mistral",
        provider="mistral",
        base_url="https://api.mistral.ai/v1",
        models=(
            "mistral-small-latest",
            "open-mistral-nemo",
        ),
        limits="Free plan with Mistral's rate limits.",
        key_url="https://console.mistral.ai/api-keys",
        models_url="https://docs.mistral.ai/getting-started/models/",
    ),
    FreeProvider(
        id="sambanova",
        name="SambaNova",
        provider="sambanova",
        base_url="https://api.sambanova.ai/v1",
        models=(
            "Meta-Llama-3.3-70B-Instruct",
            "Meta-Llama-3.1-8B-Instruct",
        ),
        limits="Free tier with SambaNova's rate limits.",
        key_url="https://cloud.sambanova.ai/apis",
        models_url="https://docs.sambanova.ai/cloud/docs/get-started/supported-models",
    ),
    FreeProvider(
        id="github",
        name="GitHub Models",
        provider="github",
        base_url="https://models.github.ai/inference",
        models=(
            "openai/gpt-4.1-mini",
            "meta/Llama-3.3-70B-Instruct",
        ),
        limits="Free with a GitHub token, within GitHub's rate limits.",
        key_url="https://github.com/settings/tokens",
        models_url="https://github.com/marketplace?type=models",
    ),
    FreeProvider(
        id="nvidia",
        name="NVIDIA",
        provider="nvidia",
        base_url="https://integrate.api.nvidia.com/v1",
        models=(
            "meta/llama-3.3-70b-instruct",
            "deepseek-ai/deepseek-r1",
        ),
        limits="Free credits for developers.",
        key_url="https://build.nvidia.com",
        models_url="https://build.nvidia.com/models",
    ),
    FreeProvider(
        id="huggingface",
        name="Hugging Face",
        provider="huggingface",
        base_url="https://router.huggingface.co/v1",
        models=(
            "meta-llama/Llama-3.3-70B-Instruct",
            "Qwen/Qwen2.5-72B-Instruct",
        ),
        limits="Free monthly credits.",
        key_url="https://huggingface.co/settings/tokens",
        models_url="https://huggingface.co/models?inference_provider=all",
    ),
)

# Built-in providers that speak the OpenAI chat format at a fixed endpoint.
COMPATIBLE: dict[str, str] = {item.provider: item.base_url for item in FREE if item.base_url}
PROVIDERS = ("openai", "anthropic", "gemini", "openai_compatible", *COMPATIBLE)
