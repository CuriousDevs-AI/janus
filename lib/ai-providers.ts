export type ProviderCategory = "general" | "cloud-platform" | "inference" | "specialized";
export type AuthType = "api-key" | "cloud-credentials" | "endpoint-key";
export type ModelCapability = "chat" | "vision" | "tools" | "embeddings" | "streaming";

export interface ProviderDef {
  id: string;
  name: string;
  shortName: string;
  category: ProviderCategory;
  authType: AuthType;
  freeTier: boolean;
  openaiCompatible: boolean;
  supports: ModelCapability[];
  baseUrl: string;
  docsUrl: string;
  keyUrl: string;
  pricingUrl: string;
  authFields: AuthField[];
  color: string;
}

export interface AuthField {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "password" | "url";
  required?: boolean;
}

export interface ModelDef {
  id: string;
  name: string;
  providerId: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  inputPricePer1M: number | null;
  outputPricePer1M: number | null;
  freeTier: boolean;
}

const keyField = (placeholder = "sk-..."): AuthField => ({ key: "apiKey", label: "API key", placeholder, type: "password", required: true });
const endpointField: AuthField = { key: "baseUrl", label: "Endpoint URL", placeholder: "https://your-endpoint.example.com/v1", type: "url", required: true };

export const AI_PROVIDERS: ProviderDef[] = [
  // --- Free-tier cloud providers ---
  {
    id: "google-ai", name: "Google AI Studio / Gemini API", shortName: "Gemini", category: "general", authType: "api-key", freeTier: true,
    openaiCompatible: false, supports: ["chat", "vision", "tools", "streaming", "embeddings"],
    baseUrl: "https://generativelanguage.googleapis.com", docsUrl: "https://ai.google.dev/docs", keyUrl: "https://aistudio.google.com/apikey", pricingUrl: "https://ai.google.dev/pricing",
    authFields: [keyField("AIza...")], color: "#4285F4",
  },
  {
    id: "groq", name: "Groq", shortName: "Groq", category: "inference", authType: "api-key", freeTier: true,
    openaiCompatible: true, supports: ["chat", "vision", "tools", "streaming"],
    baseUrl: "https://api.groq.com/openai/v1", docsUrl: "https://console.groq.com/docs", keyUrl: "https://console.groq.com/keys", pricingUrl: "https://groq.com/pricing",
    authFields: [keyField("gsk_...")], color: "#F55036",
  },
  {
    id: "openrouter", name: "OpenRouter", shortName: "OpenRouter", category: "inference", authType: "api-key", freeTier: true,
    openaiCompatible: true, supports: ["chat", "vision", "tools", "streaming"],
    baseUrl: "https://openrouter.ai/api/v1", docsUrl: "https://openrouter.ai/docs", keyUrl: "https://openrouter.ai/keys", pricingUrl: "https://openrouter.ai/models",
    authFields: [keyField("sk-or-...")], color: "#6366F1",
  },
  {
    id: "huggingface", name: "Hugging Face Inference", shortName: "HF", category: "inference", authType: "api-key", freeTier: true,
    openaiCompatible: true, supports: ["chat", "embeddings", "streaming"],
    baseUrl: "https://api-inference.huggingface.co", docsUrl: "https://huggingface.co/docs/api-inference", keyUrl: "https://huggingface.co/settings/tokens", pricingUrl: "https://huggingface.co/pricing",
    authFields: [keyField("hf_...")], color: "#FFD21E",
  },
  {
    id: "cerebras", name: "Cerebras", shortName: "Cerebras", category: "inference", authType: "api-key", freeTier: true,
    openaiCompatible: true, supports: ["chat", "streaming"],
    baseUrl: "https://api.cerebras.ai/v1", docsUrl: "https://inference-docs.cerebras.ai", keyUrl: "https://cloud.cerebras.ai/", pricingUrl: "https://cerebras.ai/pricing",
    authFields: [keyField("csk-...")], color: "#00C853",
  },
  {
    id: "mistral-free", name: "Mistral (free tier)", shortName: "Mistral Free", category: "general", authType: "api-key", freeTier: true,
    openaiCompatible: true, supports: ["chat", "tools", "streaming", "embeddings"],
    baseUrl: "https://api.mistral.ai/v1", docsUrl: "https://docs.mistral.ai", keyUrl: "https://console.mistral.ai/api-keys", pricingUrl: "https://mistral.ai/pricing",
    authFields: [keyField()], color: "#FF7000",
  },
  {
    id: "cloudflare-ai", name: "Cloudflare Workers AI", shortName: "CF AI", category: "inference", authType: "api-key", freeTier: true,
    openaiCompatible: true, supports: ["chat", "embeddings", "streaming"],
    baseUrl: "https://api.cloudflare.com/client/v4/accounts", docsUrl: "https://developers.cloudflare.com/workers-ai", keyUrl: "https://dash.cloudflare.com/profile/api-tokens", pricingUrl: "https://developers.cloudflare.com/workers-ai/pricing",
    authFields: [keyField(), { key: "accountId", label: "Account ID", placeholder: "Your Cloudflare account ID", required: true }], color: "#F48120",
  },
  {
    id: "github-models", name: "GitHub Models", shortName: "GitHub", category: "inference", authType: "api-key", freeTier: true,
    openaiCompatible: true, supports: ["chat", "vision", "tools", "streaming", "embeddings"],
    baseUrl: "https://models.inference.ai.azure.com", docsUrl: "https://docs.github.com/en/github-models", keyUrl: "https://github.com/settings/tokens", pricingUrl: "https://docs.github.com/en/github-models",
    authFields: [keyField("ghp_...")], color: "#24292E",
  },

  // --- Paid providers ---
  {
    id: "openai", name: "OpenAI", shortName: "OpenAI", category: "general", authType: "api-key", freeTier: false,
    openaiCompatible: true, supports: ["chat", "vision", "tools", "streaming", "embeddings"],
    baseUrl: "https://api.openai.com/v1", docsUrl: "https://platform.openai.com/docs", keyUrl: "https://platform.openai.com/api-keys", pricingUrl: "https://openai.com/api/pricing",
    authFields: [keyField("sk-...")], color: "#10A37F",
  },
  {
    id: "anthropic", name: "Anthropic (Claude)", shortName: "Anthropic", category: "general", authType: "api-key", freeTier: false,
    openaiCompatible: false, supports: ["chat", "vision", "tools", "streaming"],
    baseUrl: "https://api.anthropic.com", docsUrl: "https://docs.anthropic.com", keyUrl: "https://console.anthropic.com/settings/keys", pricingUrl: "https://www.anthropic.com/pricing",
    authFields: [keyField("sk-ant-...")], color: "#D97706",
  },
  {
    id: "google-vertex", name: "Google Vertex AI", shortName: "Vertex", category: "cloud-platform", authType: "cloud-credentials", freeTier: false,
    openaiCompatible: false, supports: ["chat", "vision", "tools", "streaming", "embeddings"],
    baseUrl: "https://us-central1-aiplatform.googleapis.com", docsUrl: "https://cloud.google.com/vertex-ai/docs", keyUrl: "https://console.cloud.google.com/apis/credentials", pricingUrl: "https://cloud.google.com/vertex-ai/pricing",
    authFields: [{ key: "projectId", label: "GCP Project ID", placeholder: "my-project-123", required: true }, { key: "region", label: "Region", placeholder: "us-central1", required: true }, keyField("Service account JSON key")], color: "#4285F4",
  },
  {
    id: "azure-openai", name: "Azure OpenAI", shortName: "Azure", category: "cloud-platform", authType: "endpoint-key", freeTier: false,
    openaiCompatible: true, supports: ["chat", "vision", "tools", "streaming", "embeddings"],
    baseUrl: "", docsUrl: "https://learn.microsoft.com/en-us/azure/ai-services/openai", keyUrl: "https://portal.azure.com", pricingUrl: "https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service",
    authFields: [{ key: "baseUrl", label: "Endpoint URL", placeholder: "https://your-resource.openai.azure.com", type: "url", required: true }, keyField(), { key: "deploymentName", label: "Deployment name", placeholder: "gpt-4o", required: true }, { key: "apiVersion", label: "API version", placeholder: "2024-08-01-preview", required: true }], color: "#0078D4",
  },
  {
    id: "aws-bedrock", name: "AWS Bedrock", shortName: "Bedrock", category: "cloud-platform", authType: "cloud-credentials", freeTier: false,
    openaiCompatible: false, supports: ["chat", "vision", "tools", "streaming", "embeddings"],
    baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com", docsUrl: "https://docs.aws.amazon.com/bedrock", keyUrl: "https://console.aws.amazon.com/iam", pricingUrl: "https://aws.amazon.com/bedrock/pricing",
    authFields: [{ key: "region", label: "AWS Region", placeholder: "us-east-1", required: true }, { key: "accessKeyId", label: "Access Key ID", placeholder: "AKIA...", required: true }, { key: "secretAccessKey", label: "Secret Access Key", placeholder: "Secret key", type: "password", required: true }], color: "#FF9900",
  },
  {
    id: "mistral", name: "Mistral AI", shortName: "Mistral", category: "general", authType: "api-key", freeTier: false,
    openaiCompatible: true, supports: ["chat", "vision", "tools", "streaming", "embeddings"],
    baseUrl: "https://api.mistral.ai/v1", docsUrl: "https://docs.mistral.ai", keyUrl: "https://console.mistral.ai/api-keys", pricingUrl: "https://mistral.ai/pricing",
    authFields: [keyField()], color: "#FF7000",
  },
  {
    id: "cohere", name: "Cohere", shortName: "Cohere", category: "general", authType: "api-key", freeTier: false,
    openaiCompatible: false, supports: ["chat", "tools", "streaming", "embeddings"],
    baseUrl: "https://api.cohere.ai/v2", docsUrl: "https://docs.cohere.com", keyUrl: "https://dashboard.cohere.com/api-keys", pricingUrl: "https://cohere.com/pricing",
    authFields: [keyField()], color: "#39594D",
  },
  {
    id: "xai", name: "xAI (Grok)", shortName: "xAI", category: "general", authType: "api-key", freeTier: false,
    openaiCompatible: true, supports: ["chat", "vision", "tools", "streaming"],
    baseUrl: "https://api.x.ai/v1", docsUrl: "https://docs.x.ai", keyUrl: "https://console.x.ai", pricingUrl: "https://docs.x.ai",
    authFields: [keyField("xai-...")], color: "#1DA1F2",
  },
  {
    id: "deepseek", name: "DeepSeek", shortName: "DeepSeek", category: "general", authType: "api-key", freeTier: false,
    openaiCompatible: true, supports: ["chat", "vision", "tools", "streaming"],
    baseUrl: "https://api.deepseek.com/v1", docsUrl: "https://platform.deepseek.com/api-docs", keyUrl: "https://platform.deepseek.com/api_keys", pricingUrl: "https://platform.deepseek.com/api-docs/pricing",
    authFields: [keyField("sk-...")], color: "#4D6BFE",
  },
  {
    id: "together", name: "Together AI", shortName: "Together", category: "inference", authType: "api-key", freeTier: false,
    openaiCompatible: true, supports: ["chat", "vision", "tools", "streaming", "embeddings"],
    baseUrl: "https://api.together.xyz/v1", docsUrl: "https://docs.together.ai", keyUrl: "https://api.together.xyz/settings/api-keys", pricingUrl: "https://www.together.ai/pricing",
    authFields: [keyField()], color: "#0EA5E9",
  },
  {
    id: "fireworks", name: "Fireworks AI", shortName: "Fireworks", category: "inference", authType: "api-key", freeTier: false,
    openaiCompatible: true, supports: ["chat", "vision", "tools", "streaming", "embeddings"],
    baseUrl: "https://api.fireworks.ai/inference/v1", docsUrl: "https://docs.fireworks.ai", keyUrl: "https://fireworks.ai/api-keys", pricingUrl: "https://fireworks.ai/pricing",
    authFields: [keyField("fw_...")], color: "#FF4500",
  },
  {
    id: "perplexity", name: "Perplexity", shortName: "Perplexity", category: "specialized", authType: "api-key", freeTier: false,
    openaiCompatible: true, supports: ["chat", "streaming"],
    baseUrl: "https://api.perplexity.ai", docsUrl: "https://docs.perplexity.ai", keyUrl: "https://www.perplexity.ai/settings/api", pricingUrl: "https://docs.perplexity.ai/guides/pricing",
    authFields: [keyField("pplx-...")], color: "#20808D",
  },
  {
    id: "sarvam", name: "Sarvam AI", shortName: "Sarvam", category: "specialized", authType: "api-key", freeTier: false,
    openaiCompatible: true, supports: ["chat", "streaming"],
    baseUrl: "https://api.sarvam.ai/v1", docsUrl: "https://docs.sarvam.ai", keyUrl: "https://dashboard.sarvam.ai", pricingUrl: "https://www.sarvam.ai/pricing",
    authFields: [keyField()], color: "#FF6B2B",
  },
  {
    id: "custom", name: "Custom OpenAI-compatible endpoint", shortName: "Custom", category: "general", authType: "endpoint-key", freeTier: false,
    openaiCompatible: true, supports: ["chat", "streaming"],
    baseUrl: "", docsUrl: "", keyUrl: "", pricingUrl: "",
    authFields: [endpointField, keyField("Your API key")], color: "#6B7280",
  },
];

export function getProvider(id: string): ProviderDef | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

export const FREE_PROVIDERS = AI_PROVIDERS.filter((p) => p.freeTier);
export const PAID_PROVIDERS = AI_PROVIDERS.filter((p) => !p.freeTier);
export const CLOUD_PLATFORMS = AI_PROVIDERS.filter((p) => p.category === "cloud-platform");

export type ProviderTab = "all" | "free" | "paid" | "cloud";
export function filterProviders(tab: ProviderTab, search: string): ProviderDef[] {
  const q = search.toLowerCase().trim();
  let list = AI_PROVIDERS;
  if (tab === "free") list = FREE_PROVIDERS;
  else if (tab === "paid") list = PAID_PROVIDERS;
  else if (tab === "cloud") list = CLOUD_PLATFORMS;
  if (!q) return list;
  return list.filter((p) => p.name.toLowerCase().includes(q) || p.shortName.toLowerCase().includes(q) || p.id.includes(q));
}

const MODELS_BY_PROVIDER: Record<string, ModelDef[]> = {
  "google-ai": [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", providerId: "google-ai", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 1048576, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", providerId: "google-ai", capabilities: ["chat", "vision", "streaming"], contextWindow: 1048576, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", providerId: "google-ai", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 2097152, inputPricePer1M: 1.25, outputPricePer1M: 5.0, freeTier: false },
    { id: "text-embedding-004", name: "Text Embedding 004", providerId: "google-ai", capabilities: ["embeddings"], contextWindow: 2048, inputPricePer1M: 0, outputPricePer1M: null, freeTier: true },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", providerId: "groq", capabilities: ["chat", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", providerId: "groq", capabilities: ["chat", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", providerId: "groq", capabilities: ["chat", "streaming"], contextWindow: 32768, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "gemma2-9b-it", name: "Gemma 2 9B", providerId: "groq", capabilities: ["chat", "streaming"], contextWindow: 8192, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
  ],
  openrouter: [
    { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash (free)", providerId: "openrouter", capabilities: ["chat", "vision", "streaming"], contextWindow: 1048576, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (free)", providerId: "openrouter", capabilities: ["chat", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1 (free)", providerId: "openrouter", capabilities: ["chat", "vision", "streaming"], contextWindow: 131072, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
  ],
  huggingface: [
    { id: "meta-llama/Llama-3.1-8B-Instruct", name: "Llama 3.1 8B Instruct", providerId: "huggingface", capabilities: ["chat", "streaming"], contextWindow: 131072, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "mistralai/Mistral-7B-Instruct-v0.3", name: "Mistral 7B Instruct", providerId: "huggingface", capabilities: ["chat", "streaming"], contextWindow: 32768, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
  ],
  cerebras: [
    { id: "llama3.3-70b", name: "Llama 3.3 70B", providerId: "cerebras", capabilities: ["chat", "streaming"], contextWindow: 131072, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "llama-3.1-8b", name: "Llama 3.1 8B", providerId: "cerebras", capabilities: ["chat", "streaming"], contextWindow: 131072, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
  ],
  "mistral-free": [
    { id: "open-mistral-nemo", name: "Mistral Nemo", providerId: "mistral-free", capabilities: ["chat", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "mistral-small-latest", name: "Mistral Small", providerId: "mistral-free", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
  ],
  "cloudflare-ai": [
    { id: "@cf/meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B Instruct", providerId: "cloudflare-ai", capabilities: ["chat", "streaming"], contextWindow: 131072, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "@cf/mistral/mistral-7b-instruct-v0.2-lora", name: "Mistral 7B Instruct", providerId: "cloudflare-ai", capabilities: ["chat", "streaming"], contextWindow: 32768, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
  ],
  "github-models": [
    { id: "gpt-4o-mini", name: "GPT-4o Mini", providerId: "github-models", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 128000, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
    { id: "Phi-3.5-mini-instruct", name: "Phi-3.5 Mini", providerId: "github-models", capabilities: ["chat", "streaming"], contextWindow: 131072, inputPricePer1M: 0, outputPricePer1M: 0, freeTier: true },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o", providerId: "openai", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 128000, inputPricePer1M: 2.5, outputPricePer1M: 10, freeTier: false },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", providerId: "openai", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 128000, inputPricePer1M: 0.15, outputPricePer1M: 0.6, freeTier: false },
    { id: "o3-mini", name: "o3-mini", providerId: "openai", capabilities: ["chat", "tools", "streaming"], contextWindow: 200000, inputPricePer1M: 1.1, outputPricePer1M: 4.4, freeTier: false },
    { id: "text-embedding-3-small", name: "Text Embedding 3 Small", providerId: "openai", capabilities: ["embeddings"], contextWindow: 8191, inputPricePer1M: 0.02, outputPricePer1M: null, freeTier: false },
    { id: "text-embedding-3-large", name: "Text Embedding 3 Large", providerId: "openai", capabilities: ["embeddings"], contextWindow: 8191, inputPricePer1M: 0.13, outputPricePer1M: null, freeTier: false },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", providerId: "anthropic", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 200000, inputPricePer1M: 3, outputPricePer1M: 15, freeTier: false },
    { id: "claude-haiku-3-5-20241022", name: "Claude 3.5 Haiku", providerId: "anthropic", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 200000, inputPricePer1M: 0.8, outputPricePer1M: 4, freeTier: false },
    { id: "claude-opus-4-20250514", name: "Claude Opus 4", providerId: "anthropic", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 200000, inputPricePer1M: 15, outputPricePer1M: 75, freeTier: false },
  ],
  "google-vertex": [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", providerId: "google-vertex", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 1048576, inputPricePer1M: 0.1, outputPricePer1M: 0.4, freeTier: false },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", providerId: "google-vertex", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 2097152, inputPricePer1M: 1.25, outputPricePer1M: 5.0, freeTier: false },
  ],
  "azure-openai": [
    { id: "gpt-4o", name: "GPT-4o (Azure)", providerId: "azure-openai", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 128000, inputPricePer1M: 2.5, outputPricePer1M: 10, freeTier: false },
    { id: "gpt-4o-mini", name: "GPT-4o Mini (Azure)", providerId: "azure-openai", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 128000, inputPricePer1M: 0.15, outputPricePer1M: 0.6, freeTier: false },
  ],
  "aws-bedrock": [
    { id: "anthropic.claude-3-5-sonnet-20241022-v2:0", name: "Claude 3.5 Sonnet (Bedrock)", providerId: "aws-bedrock", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 200000, inputPricePer1M: 3, outputPricePer1M: 15, freeTier: false },
    { id: "amazon.titan-text-express-v1", name: "Amazon Titan Text Express", providerId: "aws-bedrock", capabilities: ["chat", "streaming"], contextWindow: 8192, inputPricePer1M: 0.2, outputPricePer1M: 0.6, freeTier: false },
  ],
  mistral: [
    { id: "mistral-large-latest", name: "Mistral Large", providerId: "mistral", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 2, outputPricePer1M: 6, freeTier: false },
    { id: "mistral-small-latest", name: "Mistral Small", providerId: "mistral", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 0.1, outputPricePer1M: 0.3, freeTier: false },
    { id: "codestral-latest", name: "Codestral", providerId: "mistral", capabilities: ["chat", "tools", "streaming"], contextWindow: 262144, inputPricePer1M: 0.3, outputPricePer1M: 0.9, freeTier: false },
    { id: "mistral-embed", name: "Mistral Embed", providerId: "mistral", capabilities: ["embeddings"], contextWindow: 8192, inputPricePer1M: 0.1, outputPricePer1M: null, freeTier: false },
  ],
  cohere: [
    { id: "command-r-plus", name: "Command R+", providerId: "cohere", capabilities: ["chat", "tools", "streaming"], contextWindow: 128000, inputPricePer1M: 2.5, outputPricePer1M: 10, freeTier: false },
    { id: "command-r", name: "Command R", providerId: "cohere", capabilities: ["chat", "tools", "streaming"], contextWindow: 128000, inputPricePer1M: 0.15, outputPricePer1M: 0.6, freeTier: false },
    { id: "embed-english-v3.0", name: "Embed English v3", providerId: "cohere", capabilities: ["embeddings"], contextWindow: 512, inputPricePer1M: 0.1, outputPricePer1M: null, freeTier: false },
  ],
  xai: [
    { id: "grok-2", name: "Grok 2", providerId: "xai", capabilities: ["chat", "vision", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 2, outputPricePer1M: 10, freeTier: false },
    { id: "grok-2-mini", name: "Grok 2 Mini", providerId: "xai", capabilities: ["chat", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 0.3, outputPricePer1M: 1, freeTier: false },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek V3", providerId: "deepseek", capabilities: ["chat", "tools", "streaming"], contextWindow: 65536, inputPricePer1M: 0.27, outputPricePer1M: 1.1, freeTier: false },
    { id: "deepseek-reasoner", name: "DeepSeek R1", providerId: "deepseek", capabilities: ["chat", "streaming"], contextWindow: 65536, inputPricePer1M: 0.55, outputPricePer1M: 2.19, freeTier: false },
  ],
  together: [
    { id: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", name: "Llama 3.1 70B Turbo", providerId: "together", capabilities: ["chat", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 0.88, outputPricePer1M: 0.88, freeTier: false },
    { id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", name: "Llama 3.1 8B Turbo", providerId: "together", capabilities: ["chat", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 0.18, outputPricePer1M: 0.18, freeTier: false },
  ],
  fireworks: [
    { id: "accounts/fireworks/models/llama-v3p1-70b-instruct", name: "Llama 3.1 70B", providerId: "fireworks", capabilities: ["chat", "tools", "streaming"], contextWindow: 131072, inputPricePer1M: 0.9, outputPricePer1M: 0.9, freeTier: false },
    { id: "accounts/fireworks/models/llama-v3p1-8b-instruct", name: "Llama 3.1 8B", providerId: "fireworks", capabilities: ["chat", "streaming"], contextWindow: 131072, inputPricePer1M: 0.2, outputPricePer1M: 0.2, freeTier: false },
  ],
  perplexity: [
    { id: "sonar-pro", name: "Sonar Pro", providerId: "perplexity", capabilities: ["chat", "streaming"], contextWindow: 200000, inputPricePer1M: 3, outputPricePer1M: 15, freeTier: false },
    { id: "sonar", name: "Sonar", providerId: "perplexity", capabilities: ["chat", "streaming"], contextWindow: 128000, inputPricePer1M: 1, outputPricePer1M: 1, freeTier: false },
  ],
  sarvam: [
    { id: "sarvam-2b-v0.5", name: "Sarvam 2B", providerId: "sarvam", capabilities: ["chat", "streaming"], contextWindow: 4096, inputPricePer1M: 0.1, outputPricePer1M: 0.3, freeTier: false },
  ],
  custom: [],
};

export function getModelsForProvider(providerId: string): ModelDef[] {
  return MODELS_BY_PROVIDER[providerId] ?? [];
}

export function getAllModels(): ModelDef[] {
  return Object.values(MODELS_BY_PROVIDER).flat();
}

export type UseCaseId = "assistant" | "agents" | "workflows" | "summaries" | "embeddings";
export const USE_CASES: { id: UseCaseId; label: string; description: string }[] = [
  { id: "assistant", label: "AI Assistant", description: "Chat conversations and Q&A" },
  { id: "agents", label: "AI Agents", description: "Autonomous agent workflows" },
  { id: "workflows", label: "Workflows", description: "Automated business processes" },
  { id: "summaries", label: "Summaries", description: "Document and data summaries" },
  { id: "embeddings", label: "Embeddings", description: "Search and semantic matching" },
];
