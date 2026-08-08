import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_PRESETS,
  applyAiProviderPreset,
  CUSTOM_PROVIDER_ID,
  getAiProviderPreset,
  inferAiProviderPresetId,
} from "@/domain/aiProviders";
import { DEFAULT_SETTINGS } from "@/domain/constants";

describe("AI provider presets", () => {
  it("offers distinct domestic and international provider presets", () => {
    expect(AI_PROVIDER_PRESETS).toHaveLength(10);
    expect(new Set(AI_PROVIDER_PRESETS.map((preset) => preset.id)).size).toBe(
      AI_PROVIDER_PRESETS.length,
    );
    expect(AI_PROVIDER_PRESETS.some((preset) => preset.region === "国内")).toBe(
      true,
    );
    expect(AI_PROVIDER_PRESETS.some((preset) => preset.region === "海外")).toBe(
      true,
    );
    expect(
      AI_PROVIDER_PRESETS.every((preset) =>
        preset.models.some((model) => model.id === preset.defaultModel),
      ),
    ).toBe(true);
  });

  it("infers known endpoints and keeps custom compatible endpoints custom", () => {
    expect(inferAiProviderPresetId("https://api.deepseek.com/")).toBe(
      "deepseek",
    );
    expect(inferAiProviderPresetId("https://provider.example.com/v1")).toBe(
      CUSTOM_PROVIDER_ID,
    );
  });

  it("clears a previous provider key when switching companies", () => {
    const openAi = getAiProviderPreset("openai");
    expect(openAi).toBeDefined();
    const next = applyAiProviderPreset(
      {
        ...DEFAULT_SETTINGS.provider,
        apiKey: "deepseek-key-must-not-leak",
      },
      openAi!,
    );
    expect(next.endpoint).toBe("https://api.openai.com/v1");
    expect(next.model).toBe("gpt-5.4-mini");
    expect(next.apiKey).toBe("");
  });

  it("preserves the key when reselecting the same provider", () => {
    const deepSeek = getAiProviderPreset("deepseek");
    expect(deepSeek).toBeDefined();
    const next = applyAiProviderPreset(
      {
        ...DEFAULT_SETTINGS.provider,
        apiKey: "same-provider-key",
      },
      deepSeek!,
    );
    expect(next.apiKey).toBe("same-provider-key");
  });
});
