"""Providers that give a free API key, with their official endpoints and some of their free models.

Each is a built-in provider with a fixed official HTTPS endpoint, as OpenAI and Anthropic are, so a
company can keep a key for every one and the operator lists nothing. Gemini has its own adapter;
the rest speak the OpenAI chat format. Free tiers have rate limits, and model names change as
providers retire them, so the page lets a person type another.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class FreeProvider:
    id: str
    name: str
    provider: str
    # The fixed endpoint, for a provider in the OpenAI format; None for Gemini's own adapter.
    base_url: str | None
    models: tuple[str, ...]
    limits: str
    key_url: str


FREE: tuple[FreeProvider, ...] = (
    FreeProvider(
        "openrouter",
        "OpenRouter",
        "openrouter",
        "https://openrouter.ai/api/v1",
        (
            "meta-llama/llama-3.3-70b-instruct:free",
            "deepseek/deepseek-chat-v3-0324:free",
            "qwen/qwen-2.5-72b-instruct:free",
            "google/gemma-3-27b-it:free",
            "mistralai/mistral-small-3.1-24b-instruct:free",
        ),
        "Models ending in :free cost nothing; about 50 requests a day, more with credit.",
        "https://openrouter.ai/keys",
    ),
    FreeProvider(
        "gemini",
        "Google Gemini",
        "gemini",
        None,
        ("gemini-2.5-flash", "gemini-2.5-flash-lite"),
        "Free tier with per-minute and daily limits.",
        "https://aistudio.google.com/apikey",
    ),
    FreeProvider(
        "groq",
        "Groq",
        "groq",
        "https://api.groq.com/openai/v1",
        ("llama-3.3-70b-versatile", "llama-3.1-8b-instant"),
        "Free tier, very fast, with per-minute and daily limits.",
        "https://console.groq.com/keys",
    ),
    FreeProvider(
        "cerebras",
        "Cerebras",
        "cerebras",
        "https://api.cerebras.ai/v1",
        ("llama-3.3-70b", "llama3.1-8b"),
        "Free tier with daily token limits.",
        "https://cloud.cerebras.ai",
    ),
    FreeProvider(
        "mistral",
        "Mistral",
        "mistral",
        "https://api.mistral.ai/v1",
        ("mistral-small-latest", "open-mistral-nemo"),
        "Free Experiment plan with rate limits.",
        "https://console.mistral.ai/api-keys",
    ),
    FreeProvider(
        "sambanova",
        "SambaNova",
        "sambanova",
        "https://api.sambanova.ai/v1",
        ("Meta-Llama-3.3-70B-Instruct", "Meta-Llama-3.1-8B-Instruct"),
        "Free tier with rate limits.",
        "https://cloud.sambanova.ai/apis",
    ),
    FreeProvider(
        "github",
        "GitHub Models",
        "github",
        "https://models.github.ai/inference",
        ("openai/gpt-4.1-mini", "meta/Llama-3.3-70B-Instruct"),
        "Free with a GitHub token, with daily limits.",
        "https://github.com/settings/tokens",
    ),
    FreeProvider(
        "nvidia",
        "NVIDIA",
        "nvidia",
        "https://integrate.api.nvidia.com/v1",
        ("meta/llama-3.3-70b-instruct", "deepseek-ai/deepseek-r1"),
        "Free credits for developers.",
        "https://build.nvidia.com",
    ),
    FreeProvider(
        "huggingface",
        "Hugging Face",
        "huggingface",
        "https://router.huggingface.co/v1",
        ("meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct"),
        "Free monthly credits.",
        "https://huggingface.co/settings/tokens",
    ),
)

# Built-in providers that speak the OpenAI chat format at a fixed endpoint.
COMPATIBLE: dict[str, str] = {item.provider: item.base_url for item in FREE if item.base_url}
PROVIDERS = ("openai", "anthropic", "gemini", "openai_compatible", *COMPATIBLE)
