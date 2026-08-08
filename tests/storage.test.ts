import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CLOUD_API_BASE_URL,
  DEFAULT_SETTINGS,
} from "@/domain/constants";
import { buildWorkspaceFromBookmarks } from "@/domain/layout";
import {
  clearCommandHistory,
  loadSettings,
  recordCommandExecution,
  redoCommandExecution,
  saveSettings,
  undoCommandExecution,
} from "@/services/storage";

describe("cloud endpoint defaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses the production Worker when an older settings record stored an empty endpoint", async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      cloudApiBaseUrl: "",
    });

    await expect(loadSettings()).resolves.toMatchObject({
      cloudApiBaseUrl: DEFAULT_CLOUD_API_BASE_URL,
    });
  });

  it("preserves a non-empty custom Worker endpoint", async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      cloudApiBaseUrl: "https://sync.example.test",
    });

    await expect(loadSettings()).resolves.toMatchObject({
      cloudApiBaseUrl: "https://sync.example.test",
    });
  });

  it("adds default screen display preferences to legacy settings", async () => {
    localStorage.setItem(
      "smart-new-tab:smartNewTab.settings.v1",
      JSON.stringify({
        engineId: "baidu",
        openInNewTab: true,
      }),
    );

    await expect(loadSettings()).resolves.toMatchObject({
      engineId: "baidu",
      language: "system",
      openInNewTab: true,
      screenDisplay: DEFAULT_SETTINGS.screenDisplay,
      bookmarkHealth: DEFAULT_SETTINGS.bookmarkHealth,
    });
  });

  it("migrates legacy time styles while preserving older display switches", async () => {
    localStorage.setItem(
      "smart-new-tab:smartNewTab.settings.v1",
      JSON.stringify({
        engineId: "google",
        screenDisplay: {
          showTime: false,
          showDailyQuote: false,
          timeStyle: "chinese",
        },
      }),
    );

    await expect(loadSettings()).resolves.toMatchObject({
      screenDisplay: {
        showTime: false,
        showDailyQuote: false,
        alwaysShowCategoryRail: true,
        timeStyle: "serif",
        showDate: true,
        showWeekday: true,
        showLunarDate: false,
      },
    });
  });

  it("persists bounded command undo and redo snapshots", async () => {
    await clearCommandHistory();
    const before = buildWorkspaceFromBookmarks([]);
    const after = structuredClone(before);
    after.categories[0]!.title = "变更后的分类";

    await recordCommandExecution(before, "测试整理命令");
    const undone = await undoCommandExecution(after);
    expect(undone?.layout.categories[0]?.title).toBe("未分类");
    expect(undone?.label).toBe("测试整理命令");

    const redone = await redoCommandExecution(undone!.layout);
    expect(redone?.layout.categories[0]?.title).toBe("变更后的分类");
    expect(await redoCommandExecution(redone!.layout)).toBeUndefined();
  });
});
