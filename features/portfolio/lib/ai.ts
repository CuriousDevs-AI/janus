import type { AiProvider, PortfolioFreeProvider } from "@/features/portfolio/types";

/** A provider to set up: its models, where to get a key, and what using it costs. */
export type AiChoice = { provider: AiProvider; name: string; models: string[]; keyUrl: string; modelsUrl: string; note: string; free: boolean };

/** Paid providers: billed by the provider to whichever company's key it is. Model names are the
 * providers' own; the list links to theirs, and any other name can be typed. */
export const paidProviders: AiChoice[] = [
  { provider: "openai", name: "OpenAI", models: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1", "gpt-4o"], keyUrl: "https://platform.openai.com/api-keys", modelsUrl: "https://platform.openai.com/docs/models", note: "Billed by OpenAI per use, to the key's account.", free: false },
  { provider: "anthropic", name: "Anthropic Claude", models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"], keyUrl: "https://console.anthropic.com/settings/keys", modelsUrl: "https://docs.anthropic.com/en/docs/about-claude/models", note: "Billed by Anthropic per use, to the key's account.", free: false },
  { provider: "gemini", name: "Google Gemini (paid)", models: ["gemini-pro-latest", "gemini-flash-latest"], keyUrl: "https://aistudio.google.com/apikey", modelsUrl: "https://ai.google.dev/gemini-api/docs/models", note: "Billed by Google once billing is on for the key's project.", free: false },
];

export const providerName: Record<AiProvider, string> = { openai: "OpenAI", anthropic: "Anthropic Claude", gemini: "Google Gemini", openai_compatible: "Custom (OpenAI-compatible)", openrouter: "OpenRouter", groq: "Groq", cerebras: "Cerebras", mistral: "Mistral", sambanova: "SambaNova", github: "GitHub Models", nvidia: "NVIDIA", huggingface: "Hugging Face" };

export const freeChoices = (free: PortfolioFreeProvider[]): AiChoice[] =>
  free.map((item) => ({ provider: item.provider as AiProvider, name: item.name, models: item.models, keyUrl: item.keyUrl, modelsUrl: item.modelsUrl, note: item.limits, free: true }));

/** Whether a provider's keys are offered as free ones (a free tier exists). */
export const isFree = (free: PortfolioFreeProvider[], provider: AiProvider) => free.some((item) => item.provider === provider);
