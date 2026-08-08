import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "@/app/SettingsPanel";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import { createPreviewWorkspace, PREVIEW_BOOKMARKS } from "@/domain/seed";
import type { AppSettings, CloudState } from "@/domain/types";

describe("AI provider selection", () => {
  afterEach(cleanup);

  it("switches providers safely, selects a preset model and supports custom IDs", async () => {
    const onSave = vi.fn(async (_settings: AppSettings) => true);
    render(
      createElement(SettingsPanel, {
        initialSection: "provider",
        settings: {
          ...DEFAULT_SETTINGS,
          provider: {
            ...DEFAULT_SETTINGS.provider,
            apiKey: "old-provider-key",
          },
        },
        bookmarks: PREVIEW_BOOKMARKS,
        jobs: [],
        cloudState: { revision: 0 } as CloudState,
        onSave,
        onStartTagging: vi.fn(async () => undefined),
        onUndoAiOrganization: vi.fn(async () => undefined),
        onCancelJob: vi.fn(async () => undefined),
        onRetryJob: vi.fn(async () => undefined),
        onExportBackup: vi.fn(async () => undefined),
        onRestoreBackup: vi.fn(),
        onGoogleLogin: vi.fn(async () => undefined),
        onCloudLogout: vi.fn(async () => undefined),
        onCloudUpload: vi.fn(async () => undefined),
        onCloudRestore: vi.fn(async () => ({
          matched: 0,
          unmatched: 0,
          ambiguous: 0,
          layout: createPreviewWorkspace(),
          settings: DEFAULT_SETTINGS,
        })),
      }),
    );

    const providerSelect = screen.getByLabelText("模型服务商");
    expect(providerSelect).toHaveValue("deepseek");
    expect(screen.getByLabelText("模型")).toHaveValue("deepseek-v4-flash");

    fireEvent.change(providerSelect, { target: { value: "openai" } });
    expect(screen.getByLabelText("模型")).toHaveValue("gpt-5.4-mini");
    expect(screen.getByLabelText("API Endpoint（高级配置）")).toHaveValue(
      "https://api.openai.com/v1",
    );
    expect(screen.getByLabelText("API Key")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("模型"), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("自定义模型 ID"), {
      target: { value: "gpt-custom-team-model" },
    });
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "new-provider-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0].provider).toMatchObject({
      endpoint: "https://api.openai.com/v1",
      model: "gpt-custom-team-model",
      apiKey: "new-provider-key",
    });
  });
});
