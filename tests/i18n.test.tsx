import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeClock } from "@/app/HomeClock";
import { SettingsPanel } from "@/app/SettingsPanel";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import { createPreviewWorkspace, PREVIEW_BOOKMARKS } from "@/domain/seed";
import type { AppSettings, CloudState } from "@/domain/types";
import {
  I18nProvider,
  localizeText,
  resolveLanguage,
  TRANSLATION_KEYS,
  translate,
} from "@/i18n";
import jaMessages from "@/i18n/locales/ja.json";
import koMessages from "@/i18n/locales/ko.json";
import zhTwMessages from "@/i18n/locales/zh-TW.json";

function settingsPanelProps(onSave: (settings: AppSettings) => Promise<boolean>) {
  return {
    initialSection: "general" as const,
    settings: DEFAULT_SETTINGS,
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
  };
}

describe("extension localization", () => {
  afterEach(cleanup);

  it("resolves browser language while allowing an explicit override", () => {
    expect(resolveLanguage("system", "zh-CN")).toBe("zh-CN");
    expect(resolveLanguage("system", "zh-Hans-SG")).toBe("zh-CN");
    expect(resolveLanguage("system", "zh-TW")).toBe("zh-TW");
    expect(resolveLanguage("system", "zh-HK")).toBe("zh-TW");
    expect(resolveLanguage("system", "zh-MO")).toBe("zh-TW");
    expect(resolveLanguage("system", "zh-Hant")).toBe("zh-TW");
    expect(resolveLanguage("system", "ja-JP")).toBe("ja");
    expect(resolveLanguage("system", "ko-KR")).toBe("ko");
    expect(resolveLanguage("system", "en-US")).toBe("en");
    expect(resolveLanguage("system", "fr-FR")).toBe("en");
    expect(resolveLanguage("zh-CN", "en-US")).toBe("zh-CN");
    expect(translate("en", "找到 {count} 个相关书签", { count: 3 })).toBe(
      "Found 3 related bookmarks",
    );
    expect(translate("zh-TW", "设置")).toBe("設定");
    expect(translate("ja", "设置")).toBe("設定");
    expect(translate("ko", "设置")).toBe("설정");
    expect(localizeText("ja", "天气预报", "Weather")).toBe("天気");
  });

  it("keeps every added locale complete and preserves dynamic placeholders", () => {
    const catalogs = [zhTwMessages, jaMessages, koMessages] as Array<Record<string, string>>;
    const placeholders = (value: string) =>
      [...value.matchAll(/\{[a-zA-Z][a-zA-Z0-9]*\}/g)]
        .map((match) => match[0])
        .sort();

    for (const catalog of catalogs) {
      for (const key of TRANSLATION_KEYS) {
        expect(catalog[key], `missing translation for ${key}`).toBeTruthy();
        expect(placeholders(catalog[key]!)).toEqual(placeholders(key));
      }
    }
  });

  it("formats the home date and document language in English", async () => {
    render(
      <I18nProvider language="en">
        <HomeClock
          date={new Date(2026, 7, 3, 16, 28, 9)}
          preferences={DEFAULT_SETTINGS.screenDisplay}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Aug 3, 2026 · Monday")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
  });

  it("persists the selected interface language", async () => {
    const onSave = vi.fn(async (_settings: AppSettings) => true);
    render(
      <I18nProvider language="zh-CN">
        <SettingsPanel {...settingsPanelProps(onSave)} />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText("界面语言"), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0].language).toBe("en");
  });

  it("renders English settings navigation after the language is applied", () => {
    render(
      <I18nProvider language="en">
        <SettingsPanel
          {...settingsPanelProps(async () => true)}
          settings={{ ...DEFAULT_SETTINGS, language: "en" }}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByLabelText("Interface language")).toHaveValue("en");
    expect(screen.getByRole("option", { name: "简体中文" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "繁體中文" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "日本語" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "한국어" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument();
  });

  it("renders Japanese settings and Korean document language", async () => {
    const { unmount } = render(
      <I18nProvider language="ja">
        <SettingsPanel
          {...settingsPanelProps(async () => true)}
          settings={{ ...DEFAULT_SETTINGS, language: "ja" }}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "一般" })).toBeInTheDocument();
    expect(screen.getByLabelText("インターフェース言語")).toHaveValue("ja");
    unmount();

    render(
      <I18nProvider language="ko">
        <HomeClock
          date={new Date(2026, 7, 3, 16, 28, 9)}
          preferences={DEFAULT_SETTINGS.screenDisplay}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(document.documentElement.lang).toBe("ko"));
  });
});
