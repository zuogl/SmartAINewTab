import { z } from "zod";
import type {
  AppSettings,
  BookmarkRecord,
  WorkspaceLayout,
} from "@/domain/types";
import { CATEGORY_ICON_VALUES, LAYOUT_VERSION } from "@/domain/types";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import { normalizeBookmarkHealthPreferences } from "@/domain/bookmarkHealth";
import { normalizeScreenDisplayPreferences } from "@/domain/timeDisplay";
import {
  DEFAULT_WIDGET_PREFERENCES,
  normalizeWidgetPreferences,
} from "@/domain/widgets";
import {
  buildWorkspaceFromBookmarks,
  reconcileWorkspace,
} from "@/domain/layout";
import { buildAiOrganizedWorkspace } from "./organization";
import { database } from "./database";

// Stable wire-format identifier: changing it would invalidate existing local and cloud backups.
export const BACKUP_FORMAT = "smart-new-tab-backup";
export const BACKUP_SCHEMA_VERSION = 1;

interface BackupBookmark {
  bookmarkId: string;
  title: string;
  url: string;
  manualTags: string[];
  aiTags: string[];
  summary?: string;
  suggestedCategory?: string;
  suggestedGroup?: string;
  updatedAt: number;
}

export interface BackupDocument {
  format: typeof BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  layout: WorkspaceLayout;
  settings: Omit<AppSettings, "provider"> & {
    provider: Omit<AppSettings["provider"], "apiKey">;
  };
  bookmarks: BackupBookmark[];
}

export interface BackupRestoreResult {
  layout: WorkspaceLayout;
  settings: AppSettings;
  matched: number;
  unmatched: number;
  ambiguous: number;
}

const bookmarkRecordSchema = z.object({
  id: z.string().max(500),
  parentId: z.string().max(500).optional(),
  title: z.string().max(5_000),
  url: z.string().max(20_000),
  source: z.enum(["chrome", "custom", "preview"]),
  folderPath: z.array(z.string().max(2_000)).max(100),
  tags: z.array(z.string().max(500)).max(100),
  aiTags: z.array(z.string().max(500)).max(100),
  summary: z.string().max(20_000).optional(),
  aiCategory: z.string().max(2_000).optional(),
  aiGroup: z.string().max(2_000).optional(),
  dateAdded: z.number().optional(),
});

const workspaceSchema = z.object({
  version: z.number().int(),
  activeCategoryId: z.string().max(500),
  categories: z
    .array(
      z.object({
        id: z.string().max(500),
        title: z.string().max(2_000),
        icon: z.enum(CATEGORY_ICON_VALUES),
        bookmarkIds: z
          .array(z.string().max(500))
          .max(200_000)
          .optional()
          .default([]),
        groups: z
          .array(
            z.object({
              id: z.string().max(500),
              title: z.string().max(2_000),
              collapsed: z.boolean(),
              bookmarkIds: z.array(z.string().max(500)).max(200_000),
            }),
          )
          .max(10_000),
        rootOrder: z
          .array(z.string().max(500))
          .max(210_000)
          .optional(),
      }),
    )
    .min(1)
    .max(10_000),
  customBookmarks: z.array(bookmarkRecordSchema).max(200_000),
  hiddenBookmarkIds: z.array(z.string().max(500)).max(200_000),
  placementOverrides: z
    .record(
      z.string().max(500),
      z.object({
        source: z.enum(["manual", "command"]),
        locked: z.boolean(),
        updatedAt: z.number(),
      }),
    )
    .optional(),
  updatedAt: z.number(),
});

const settingsSchema = z.object({
  language: z
    .enum(["system", "zh-CN", "zh-TW", "ja", "ko", "en"])
    .optional()
    .default("system"),
  engineId: z.enum(["google", "baidu", "bing", "duckduckgo"]),
  provider: z.object({
    enabled: z.boolean(),
    endpoint: z.string().max(20_000),
    model: z.string().max(2_000),
    batchSize: z.number().int().min(1).max(1_000),
  }),
  cloudApiBaseUrl: z.string().max(20_000),
  autoTagNewBookmarks: z.boolean(),
  autoOrganizeBookmarks: z.boolean().optional().default(true),
  includeSummaries: z.boolean(),
  openInNewTab: z.boolean(),
  bookmarkHealth: z
    .object({
      scheduledScanEnabled: z.boolean(),
      scheduleIntervalDays: z.union([
        z.literal(7),
        z.literal(14),
        z.literal(30),
      ]),
      autoCheckNewBookmarks: z.boolean(),
      staleAfterDays: z.union([
        z.literal(7),
        z.literal(14),
        z.literal(30),
      ]),
      lastScheduledScanAt: z.number().optional(),
      ignoredDuplicateKeys: z.array(z.string().max(20_000)).max(200_000),
      ignoredDeadBookmarkIds: z.array(z.string().max(500)).max(200_000),
    })
    .optional()
    .default(DEFAULT_SETTINGS.bookmarkHealth),
  screenDisplay: z
    .object({
      showTime: z.boolean().optional(),
      showDailyQuote: z.boolean().optional(),
      alwaysShowCategoryRail: z.boolean().optional(),
      showEmptyUncategorizedCategory: z.boolean().optional(),
      timeStyle: z
        .enum([
          "minimal",
          "bold",
          "split",
          "flip",
          "neon",
          "terminal",
          "serif",
          "outline",
          "boxed",
          "stacked",
          "compact",
          "soft",
          "digital",
          "date",
          "chinese",
        ])
        .optional(),
      showDate: z.boolean().optional(),
      showWeekday: z.boolean().optional(),
      showLunarDate: z.boolean().optional(),
    })
    .optional()
    .default(DEFAULT_SETTINGS.screenDisplay),
  widgets: z
    .object({
      enabled: z.boolean(),
      activeIds: z
        .array(
          z.enum([
            "weather",
            "calendar",
            "world-clock",
            "currency",
            "hot-search",
            "bookmark-stats",
            "ai-progress",
            "bookmark-health",
            "recent-bookmarks",
            "tag-overview",
            "focus-timer",
            "quick-note",
            "daily-quote",
          ]),
        )
        .min(2)
        .max(8),
      weatherLocationId: z.enum([
        "beijing",
        "shanghai",
        "shenzhen",
        "hong-kong",
        "singapore",
        "tokyo",
        "london",
        "new-york",
      ]),
      currencyBase: z.enum(["CNY", "USD", "EUR", "GBP", "JPY", "HKD", "SGD"]),
      currencyQuote: z.enum(["CNY", "USD", "EUR", "GBP", "JPY", "HKD", "SGD"]),
    })
    .optional()
    .default(DEFAULT_WIDGET_PREFERENCES),
  background: z
    .object({
      currentAssetId: z.string().max(500),
      rotationEnabled: z.boolean(),
      rotationInterval: z.enum(["newtab", "15m", "1h", "daily"]),
      rotationOrder: z.enum(["random", "sequential"]),
      playlistIds: z.array(z.string().max(500)).max(500),
      shuffleRemainingIds: z.array(z.string().max(500)).max(500),
      lastRotatedAt: z.number().nonnegative(),
      overlayOpacity: z.number().min(0).max(70),
      blur: z.number().min(0).max(16),
    })
    .optional()
    .default(DEFAULT_SETTINGS.background),
});

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: z.string(),
  layout: workspaceSchema,
  settings: settingsSchema,
  bookmarks: z
    .array(
      z.object({
        bookmarkId: z.string().max(500),
        title: z.string().max(5_000),
        url: z.string().max(20_000),
        manualTags: z.array(z.string().max(500)).max(100),
        aiTags: z.array(z.string().max(500)).max(100),
        summary: z.string().max(20_000).optional(),
        suggestedCategory: z.string().max(2_000).optional(),
        suggestedGroup: z.string().max(2_000).optional(),
        updatedAt: z.number(),
      }),
    )
    .max(200_000),
});

export async function createBackupDocument(
  layout: WorkspaceLayout,
  settings: AppSettings,
  bookmarks: BookmarkRecord[],
): Promise<BackupDocument> {
  const { apiKey: _excludedApiKey, ...safeProvider } = settings.provider;
  const metadata = new Map(
    (await database.metadata.toArray()).map((item) => [item.bookmarkId, item]),
  );
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    layout: structuredClone(layout),
    settings: {
      ...settings,
      provider: safeProvider,
    },
    bookmarks: bookmarks.map((bookmark) => {
      const stored = metadata.get(bookmark.id);
      return {
        bookmarkId: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        manualTags: stored?.manualTags ?? bookmark.tags,
        aiTags: stored?.tags ?? bookmark.aiTags,
        summary: stored?.summary ?? bookmark.summary,
        suggestedCategory:
          stored?.suggestedCategory ?? bookmark.aiCategory,
        suggestedGroup: stored?.suggestedGroup ?? bookmark.aiGroup,
        updatedAt: stored?.updatedAt ?? Date.now(),
      };
    }),
  };
}

export function serializeBackup(document: BackupDocument): string {
  return JSON.stringify(document, null, 2);
}

export function downloadBackup(document: BackupDocument): void {
  const date = document.exportedAt.slice(0, 10);
  const blob = new Blob([serializeBackup(document)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = documentElement("a");
  anchor.href = url;
  anchor.download = `smart-ai-new-tab-backup-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function restoreBackupDocument(
  raw: string | BackupDocument,
  currentBookmarks: BookmarkRecord[],
  currentSettings: AppSettings,
): Promise<BackupRestoreResult> {
  if (typeof raw === "string" && raw.length > 20_000_000) {
    throw new Error("备份文件超过 20 MB，已拒绝导入");
  }
  const parsed = backupSchema.parse(
    typeof raw === "string" ? JSON.parse(raw) : raw,
  ) as BackupDocument;
  const byId = new Map(currentBookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const byUrl = new Map<string, BookmarkRecord[]>();
  for (const bookmark of currentBookmarks) {
    const key = normalizeUrl(bookmark.url);
    byUrl.set(key, [...(byUrl.get(key) ?? []), bookmark]);
  }

  const idMap = new Map<string, string>();
  let matched = 0;
  let unmatched = 0;
  let ambiguous = 0;
  const metadataToRestore = [];
  for (const item of parsed.bookmarks) {
    const exact = byId.get(item.bookmarkId);
    const candidates = exact ? [exact] : byUrl.get(normalizeUrl(item.url)) ?? [];
    if (candidates.length === 0) {
      unmatched += 1;
      continue;
    }
    if (candidates.length > 1) ambiguous += 1;
    const target = candidates[0]!;
    idMap.set(item.bookmarkId, target.id);
    metadataToRestore.push({
      bookmarkId: target.id,
      tags: unique(item.aiTags),
      manualTags: unique(item.manualTags),
      summary: item.summary,
      suggestedCategory: item.suggestedCategory,
      suggestedGroup: item.suggestedGroup,
      updatedAt: item.updatedAt,
    });
    matched += 1;
  }
  await database.metadata.bulkPut(metadataToRestore);

  const remappedLayout = remapLayout(parsed.layout, idMap);
  const restoredMetadata = new Map(
    metadataToRestore.map((item) => [item.bookmarkId, item] as const),
  );
  const restoredBookmarks = currentBookmarks.map((bookmark) => {
    const metadata = restoredMetadata.get(bookmark.id);
    return metadata
      ? {
          ...bookmark,
          tags: metadata.manualTags,
          aiTags: metadata.tags,
          summary: metadata.summary,
          aiCategory: metadata.suggestedCategory,
          aiGroup: metadata.suggestedGroup,
        }
      : bookmark;
  });
  const layout =
    parsed.layout.version < LAYOUT_VERSION
      ? buildAiOrganizedWorkspace(
          {
            ...buildWorkspaceFromBookmarks(restoredBookmarks),
            hiddenBookmarkIds: remappedLayout.hiddenBookmarkIds,
          },
          restoredBookmarks,
        )
      : reconcileWorkspace(remappedLayout, restoredBookmarks);
  const importedProviderEndpoint = canonicalEndpoint(
    parsed.settings.provider.endpoint,
  );
  const currentProviderEndpoint = canonicalEndpoint(
    currentSettings.provider.endpoint,
  );
  const providerEndpointChanged =
    !importedProviderEndpoint ||
    !currentProviderEndpoint ||
    importedProviderEndpoint !== currentProviderEndpoint;
  const settings: AppSettings = {
    ...currentSettings,
    ...parsed.settings,
    // A portable backup is data, not authority to retarget an authenticated
    // cloud session. Cloud endpoints stay bound to the current installation.
    cloudApiBaseUrl: currentSettings.cloudApiBaseUrl,
    autoTagNewBookmarks: providerEndpointChanged
      ? false
      : parsed.settings.autoTagNewBookmarks,
    autoOrganizeBookmarks: providerEndpointChanged
      ? false
      : parsed.settings.autoOrganizeBookmarks,
    screenDisplay: normalizeScreenDisplayPreferences(
      parsed.settings.screenDisplay,
    ),
    widgets: normalizeWidgetPreferences(parsed.settings.widgets),
    bookmarkHealth: normalizeBookmarkHealthPreferences(
      parsed.settings.bookmarkHealth,
    ),
    provider: {
      ...currentSettings.provider,
      ...parsed.settings.provider,
      enabled: providerEndpointChanged
        ? false
        : parsed.settings.provider.enabled,
      apiKey: providerEndpointChanged ? "" : currentSettings.provider.apiKey,
    },
  };
  return {
    layout,
    settings,
    matched,
    unmatched,
    ambiguous,
  };
}

function canonicalEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return undefined;
  }
}

function remapLayout(
  source: WorkspaceLayout,
  idMap: Map<string, string>,
): WorkspaceLayout {
  const layout = structuredClone(source);
  layout.version = LAYOUT_VERSION;
  layout.customBookmarks = [];
  layout.hiddenBookmarkIds = layout.hiddenBookmarkIds
    .map((id) => idMap.get(id))
    .filter((id): id is string => Boolean(id));
  for (const category of layout.categories) {
    const groupIds = new Set(category.groups.map((group) => group.id));
    category.bookmarkIds = unique(
      (category.bookmarkIds ?? [])
        .map((id) => idMap.get(id))
        .filter((id): id is string => Boolean(id)),
    );
    for (const group of category.groups) {
      group.bookmarkIds = unique(
        group.bookmarkIds
          .map((id) => idMap.get(id))
          .filter((id): id is string => Boolean(id)),
      );
    }
    category.rootOrder = unique(
      (category.rootOrder ?? [])
        .map((id) => (groupIds.has(id) ? id : idMap.get(id)))
        .filter((id): id is string => Boolean(id)),
    );
  }
  layout.updatedAt = Date.now();
  return layout;
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().replace(/\/$/, "").toLowerCase();
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function documentElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
): HTMLElementTagNameMap[K] {
  return window.document.createElement(tag);
}
