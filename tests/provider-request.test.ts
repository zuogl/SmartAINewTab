import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import {
  buildChatCompletionUrl,
  buildStructuredCompletionBody,
} from "@/services/providerRequest";

const messages = [{ role: "user", content: "return JSON" }];

describe("provider request compatibility", () => {
  it("builds standard and MiniMax request URLs without double-appending paths", () => {
    expect(buildChatCompletionUrl("https://api.openai.com/v1/")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(buildChatCompletionUrl("https://api.minimax.io/v1")).toBe(
      "https://api.minimax.io/v1/text/chatcompletion_v2",
    );
    expect(
      buildChatCompletionUrl(
        "https://provider.example.com/v1/chat/completions",
      ),
    ).toBe("https://provider.example.com/v1/chat/completions");
  });

  it("keeps DeepSeek structured output and disables thinking for tag jobs", () => {
    const body = buildStructuredCompletionBody(DEFAULT_SETTINGS.provider, {
      messages,
      maxTokens: 1200,
      temperature: 0.1,
    });
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.temperature).toBe(0.1);
  });

  it("avoids unsupported JSON mode for Claude compatibility", () => {
    const body = buildStructuredCompletionBody(
      {
        ...DEFAULT_SETTINGS.provider,
        endpoint: "https://api.anthropic.com/v1",
        model: "claude-sonnet-4-6",
      },
      { messages, maxTokens: 1200, temperature: 0.1 },
    );
    expect(body.response_format).toBeUndefined();
    expect(body.temperature).toBe(0.1);
  });

  it("uses GPT-5-compatible completion limits and omits temperature", () => {
    const body = buildStructuredCompletionBody(
      {
        ...DEFAULT_SETTINGS.provider,
        endpoint: "https://api.openai.com/v1",
        model: "gpt-5.4-mini",
      },
      { messages, maxTokens: 1200, temperature: 0.1 },
    );
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBe(1200);
  });

  it("rejects cleartext remote and private provider endpoints", () => {
    expect(() => buildChatCompletionUrl("http://provider.example.com/v1")).toThrow(
      "不安全",
    );
    expect(() => buildChatCompletionUrl("https://127.0.0.1/v1")).toThrow(
      "不安全",
    );
    expect(() => buildChatCompletionUrl("https://[::ffff:127.0.0.1]/v1")).toThrow(
      "不安全",
    );
  });

  it("keeps explicit loopback HTTP support for local development", () => {
    expect(buildChatCompletionUrl("http://localhost:11434/v1")).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
  });
});
