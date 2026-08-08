import type { ProviderConfig } from "@/domain/types";
import { isLoopbackHostname, isPublicHostname } from "./networkSecurity";

interface StructuredCompletionOptions {
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
}

export function parseProviderEndpoint(endpoint: string): URL {
  const normalized = endpoint.trim();
  if (!normalized) throw new Error("AI Provider 地址不能为空");
  try {
    const url = new URL(normalized);
    if (url.username || url.password) {
      throw new Error("AI Provider 地址不能包含用户名或密码");
    }
    if (url.protocol === "http:" && isLoopbackHostname(url.hostname)) {
      return url;
    }
    if (url.protocol !== "https:") {
      throw new Error("AI Provider 仅支持 HTTPS；本机调试可使用 HTTP localhost");
    }
    if (!isPublicHostname(url.hostname)) {
      throw new Error("AI Provider 不能使用内网、保留或本机地址");
    }
    return url;
  } catch {
    throw new Error("AI Provider 地址格式无效或不安全");
  }
}

export function buildChatCompletionUrl(endpoint: string): string {
  const url = parseProviderEndpoint(endpoint);
  const path = url.pathname.replace(/\/+$/, "");
  if (
    path.endsWith("/chat/completions") ||
    path.endsWith("/text/chatcompletion_v2")
  ) {
    url.pathname = path;
    return url.toString();
  }
  url.pathname =
    url.hostname === "api.minimax.io"
      ? `${path}/text/chatcompletion_v2`
      : `${path}/chat/completions`;
  return url.toString();
}

export function buildStructuredCompletionBody(
  provider: ProviderConfig,
  options: StructuredCompletionOptions,
): Record<string, unknown> {
  const endpoint = parseProviderEndpoint(provider.endpoint);
  const normalizedModel = provider.model.trim().toLowerCase();
  const isAnthropicCompatibility =
    endpoint.hostname === "api.anthropic.com" ||
    normalizedModel.startsWith("anthropic/claude-");
  const isMiniMax = endpoint.hostname === "api.minimax.io";
  const isOpenAiReasoningModel =
    (endpoint.hostname === "api.openai.com" ||
      endpoint.hostname === "openrouter.ai") &&
    /(?:^|\/)gpt-5(?:\.|-|$)/.test(normalizedModel);

  const body: Record<string, unknown> = {
    model: provider.model.trim(),
    messages: options.messages,
  };
  if (isOpenAiReasoningModel) {
    body.max_completion_tokens = options.maxTokens;
  } else {
    body.max_tokens = options.maxTokens;
  }
  if (!isOpenAiReasoningModel) body.temperature = options.temperature;
  if (!isAnthropicCompatibility && !isMiniMax) {
    body.response_format = { type: "json_object" };
  }
  if (endpoint.hostname === "api.deepseek.com") {
    body.thinking = { type: "disabled" };
  }
  return body;
}
