import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import { buildWorkspaceFromBookmarks } from "@/domain/layout";
import type { AppSettings, BookmarkRecord } from "@/domain/types";
import {
  createBackupDocument,
  restoreBackupDocument,
  serializeBackup,
} from "@/services/backup";
import { database } from "@/services/database";

const original: BookmarkRecord = {
  id: "old-id",
  title: "Domain Analyzer",
  url: "https://example.com/tools#overview",
  source: "chrome",
  folderPath: ["Research"],
  tags: ["手动"],
  aiTags: ["域名分析"],
  summary: "分析域名",
};

describe("full backup and restore", () => {
  beforeEach(async () => {
    await database.metadata.clear();
  });

  it("exports layout and metadata without the provider API key", async () => {
    await database.metadata.put({
      bookmarkId: original.id,
      tags: original.aiTags,
      manualTags: original.tags,
      summary: original.summary,
      updatedAt: 123,
    });
    const backup = await createBackupDocument(
      buildWorkspaceFromBookmarks([original]),
      {
        ...DEFAULT_SETTINGS,
        provider: {
          ...DEFAULT_SETTINGS.provider,
          apiKey: "must-never-be-exported",
        },
      },
      [original],
    );
    const raw = serializeBackup(backup);

    expect(raw).not.toContain("must-never-be-exported");
    expect(backup.bookmarks[0]).toMatchObject({
      manualTags: ["手动"],
      aiTags: ["域名分析"],
      summary: "分析域名",
    });
  });

  it("remaps changed bookmark IDs by normalized URL and preserves current secrets", async () => {
    const backup = await createBackupDocument(
      buildWorkspaceFromBookmarks([original]),
      DEFAULT_SETTINGS,
      [original],
    );
    const current: BookmarkRecord = {
      ...original,
      id: "new-id",
      url: "https://example.com/tools",
      tags: [],
      aiTags: [],
    };
    const settings = {
      ...DEFAULT_SETTINGS,
      provider: {
        ...DEFAULT_SETTINGS.provider,
        apiKey: "current-local-key",
      },
    };
    const result = await restoreBackupDocument(
      serializeBackup(backup),
      [current],
      settings,
    );
    const metadata = await database.metadata.get("new-id");

    expect(result).toMatchObject({ matched: 1, unmatched: 0, ambiguous: 0 });
    expect(result.settings.provider.apiKey).toBe("current-local-key");
    expect(result.layout.categories[0]?.bookmarkIds).toContain("new-id");
    expect(metadata).toMatchObject({
      manualTags: ["手动"],
      tags: ["域名分析"],
    });
  });

  it("does not let imported endpoints retarget local credentials", async () => {
    const backup = await createBackupDocument(
      buildWorkspaceFromBookmarks([original]),
      DEFAULT_SETTINGS,
      [original],
    );
    backup.settings.provider = {
      ...backup.settings.provider,
      enabled: true,
      endpoint: "https://attacker.example/v1",
    };
    backup.settings.cloudApiBaseUrl = "https://attacker.example";
    backup.settings.autoTagNewBookmarks = true;
    backup.settings.autoOrganizeBookmarks = true;
    const currentSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      cloudApiBaseUrl: "https://sync.example.com",
      provider: { ...DEFAULT_SETTINGS.provider, apiKey: "local-secret" },
    };

    const result = await restoreBackupDocument(
      serializeBackup(backup),
      [original],
      currentSettings,
    );

    expect(result.settings.cloudApiBaseUrl).toBe("https://sync.example.com");
    expect(result.settings.provider).toMatchObject({
      endpoint: "https://attacker.example/v1",
      enabled: false,
      apiKey: "",
    });
    expect(result.settings.autoTagNewBookmarks).toBe(false);
    expect(result.settings.autoOrganizeBookmarks).toBe(false);
  });

  it("migrates old folder-based backup layouts to the unclassified model", async () => {
    const backup = await createBackupDocument(
      buildWorkspaceFromBookmarks([original]),
      DEFAULT_SETTINGS,
      [original],
    );
    backup.layout.version = 2;
    backup.layout.categories[0]!.id = "folder-bookmarks-bar";
    backup.layout.categories[0]!.title = "书签栏";

    const result = await restoreBackupDocument(
      serializeBackup(backup),
      [original],
      DEFAULT_SETTINGS,
    );

    expect(result.layout.version).toBe(3);
    expect(result.layout.categories[0]?.title).toBe("未分类");
    expect(
      result.layout.categories.some((category) => category.title === "书签栏"),
    ).toBe(false);
  });

  it("restores legacy backups with default screen display preferences", async () => {
    const backup = await createBackupDocument(
      buildWorkspaceFromBookmarks([original]),
      DEFAULT_SETTINGS,
      [original],
    );
    delete (backup.settings as Partial<AppSettings>).screenDisplay;

    const result = await restoreBackupDocument(
      serializeBackup(backup),
      [original],
      DEFAULT_SETTINGS,
    );

    expect(result.settings.screenDisplay).toEqual(
      DEFAULT_SETTINGS.screenDisplay,
    );
  });

  it("restores legacy backups with the system language preference", async () => {
    const backup = await createBackupDocument(
      buildWorkspaceFromBookmarks([original]),
      DEFAULT_SETTINGS,
      [original],
    );
    delete (backup.settings as Partial<AppSettings>).language;

    const result = await restoreBackupDocument(
      serializeBackup(backup),
      [original],
      DEFAULT_SETTINGS,
    );

    expect(result.settings.language).toBe("system");
  });

  it("round-trips the expanded interface language preferences", async () => {
    for (const language of ["zh-TW", "ja", "ko"] as const) {
      const backup = await createBackupDocument(
        buildWorkspaceFromBookmarks([original]),
        { ...DEFAULT_SETTINGS, language },
        [original],
      );
      const result = await restoreBackupDocument(
        serializeBackup(backup),
        [original],
        DEFAULT_SETTINGS,
      );
      expect(result.settings.language).toBe(language);
    }
  });

  it("restores legacy backups with safe bookmark-health defaults", async () => {
    const backup = await createBackupDocument(
      buildWorkspaceFromBookmarks([original]),
      DEFAULT_SETTINGS,
      [original],
    );
    delete (backup.settings as Partial<AppSettings>).bookmarkHealth;

    const result = await restoreBackupDocument(
      serializeBackup(backup),
      [original],
      DEFAULT_SETTINGS,
    );

    expect(result.settings.bookmarkHealth).toEqual(
      DEFAULT_SETTINGS.bookmarkHealth,
    );
  });

  it("restores legacy clock styles and fills independent content switches", async () => {
    const backup = await createBackupDocument(
      buildWorkspaceFromBookmarks([original]),
      DEFAULT_SETTINGS,
      [original],
    );
    backup.settings.screenDisplay = {
      showTime: true,
      showDailyQuote: false,
      timeStyle: "date",
    } as unknown as AppSettings["screenDisplay"];

    const result = await restoreBackupDocument(
      serializeBackup(backup),
      [original],
      DEFAULT_SETTINGS,
    );

    expect(result.settings.screenDisplay).toEqual({
      showTime: true,
      showDailyQuote: false,
      alwaysShowCategoryRail: true,
      timeStyle: "minimal",
      showDate: true,
      showWeekday: true,
      showLunarDate: false,
    });
  });
});
