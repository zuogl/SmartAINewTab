import Dexie, { type EntityTable } from "dexie";
import type {
  AiJob,
  BookmarkHealthJob,
  BookmarkHealthRecord,
  BookmarkRecoverySnapshot,
  BookmarkRecord,
} from "@/domain/types";
import { migrateLegacyBookmarkHealthRecord } from "@/domain/bookmarkHealth";

export interface BookmarkMetadata {
  bookmarkId: string;
  tags: string[];
  manualTags?: string[];
  summary?: string;
  suggestedCategory?: string;
  suggestedGroup?: string;
  updatedAt: number;
}

export interface StoredBackgroundAsset {
  id: string;
  name: string;
  mimeType: "image/webp";
  blob: Blob;
  thumbnailBlob: Blob;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  cloudSyncedAt?: number;
}

class SmartAINewTabDatabase extends Dexie {
  metadata!: EntityTable<BookmarkMetadata, "bookmarkId">;
  jobs!: EntityTable<AiJob, "id">;
  backgrounds!: EntityTable<StoredBackgroundAsset, "id">;
  health!: EntityTable<BookmarkHealthRecord, "bookmarkId">;
  healthJobs!: EntityTable<BookmarkHealthJob, "id">;
  healthRecovery!: EntityTable<BookmarkRecoverySnapshot, "id">;

  constructor() {
    // Keep the legacy database name so existing users retain local AI metadata after the product rename.
    super("smart-new-tab");
    this.version(1).stores({
      metadata: "bookmarkId,updatedAt",
      jobs: "id,status,updatedAt",
    });
    this.version(2).stores({
      metadata: "bookmarkId,updatedAt",
      jobs: "id,status,updatedAt",
      backgrounds: "id,createdAt,updatedAt,cloudSyncedAt",
    });
    this.version(3).stores({
      metadata: "bookmarkId,updatedAt",
      jobs: "id,status,updatedAt",
      backgrounds: "id,createdAt,updatedAt,cloudSyncedAt",
      health: "bookmarkId,status,checkedAt,nextCheckAt",
      healthJobs: "id,status,createdAt,updatedAt",
    });
    this.version(4).stores({
      metadata: "bookmarkId,updatedAt",
      jobs: "id,status,updatedAt",
      backgrounds: "id,createdAt,updatedAt,cloudSyncedAt",
      health: "bookmarkId,status,checkedAt,nextCheckAt",
      healthJobs: "id,status,createdAt,updatedAt",
      healthRecovery: "id,action,createdAt",
    });
    this.version(5)
      .stores({
        metadata: "bookmarkId,updatedAt",
        jobs: "id,status,updatedAt",
        backgrounds: "id,createdAt,updatedAt,cloudSyncedAt",
        health: "bookmarkId,status,checkedAt,nextCheckAt",
        healthJobs: "id,status,createdAt,updatedAt",
        healthRecovery: "id,action,createdAt",
      })
      .upgrade((transaction) =>
        transaction
          .table<BookmarkHealthRecord, string>("health")
          .toCollection()
          .modify((record) => {
            Object.assign(record, migrateLegacyBookmarkHealthRecord(record));
          }),
      );
    this.version(6)
      .stores({
        metadata: "bookmarkId,updatedAt",
        jobs: "id,status,updatedAt",
        backgrounds: "id,createdAt,updatedAt,cloudSyncedAt",
        health: "bookmarkId,status,checkedAt,nextCheckAt",
        healthJobs: "id,status,createdAt,updatedAt",
        healthRecovery: "id,action,createdAt",
      })
      .upgrade((transaction) =>
        transaction
          .table<BookmarkHealthRecord, string>("health")
          .toCollection()
          .modify((record) => {
            Object.assign(record, migrateLegacyBookmarkHealthRecord(record));
          }),
      );
  }
}

export const database = new SmartAINewTabDatabase();

export async function enrichWithMetadata(
  bookmarks: BookmarkRecord[],
): Promise<BookmarkRecord[]> {
  const metadata = await database.metadata.bulkGet(
    bookmarks.map((item) => item.id),
  );
  return bookmarks.map((bookmark, index) => {
    const stored = metadata[index];
    return stored
      ? {
          ...bookmark,
          tags: stored.manualTags ?? bookmark.tags,
          aiTags: stored.tags,
          summary: stored.summary ?? bookmark.summary,
          aiCategory: stored.suggestedCategory,
          aiGroup: stored.suggestedGroup,
        }
      : bookmark;
  });
}

export async function saveBookmarkMetadata(
  bookmarkId: string,
  tags: string[],
  summary?: string,
  suggestedCategory?: string,
  suggestedGroup?: string,
): Promise<void> {
  await database.transaction("rw", database.metadata, async () => {
    const existing = await database.metadata.get(bookmarkId);
    await database.metadata.put({
      bookmarkId,
      tags,
      manualTags: existing?.manualTags,
      summary,
      suggestedCategory,
      suggestedGroup,
      updatedAt: Date.now(),
    });
  });
}

export async function saveSuggestedGroups(
  entries: Array<{ bookmarkId: string; group?: string }>,
): Promise<void> {
  await database.transaction("rw", database.metadata, async () => {
    const updatedAt = Date.now();
    for (const entry of entries) {
      const updated = await database.metadata.update(entry.bookmarkId, {
        suggestedGroup: entry.group,
        updatedAt,
      });
      if (updated === 0) {
        throw new Error(`缺少书签 ${entry.bookmarkId} 的 AI 元数据`);
      }
    }
  });
}

export async function saveSuggestedOrganization(
  entries: Array<{ bookmarkId: string; category: string; group?: string }>,
): Promise<void> {
  await database.transaction("rw", database.metadata, async () => {
    const updatedAt = Date.now();
    for (const entry of entries) {
      const updated = await database.metadata.update(entry.bookmarkId, {
        suggestedCategory: entry.category,
        suggestedGroup: entry.group,
        updatedAt,
      });
      if (updated === 0) {
        throw new Error(`缺少书签 ${entry.bookmarkId} 的 AI 元数据`);
      }
    }
  });
}

export async function saveManualTags(
  bookmarkId: string,
  manualTags: string[],
): Promise<void> {
  const existing = await database.metadata.get(bookmarkId);
  await saveEditableTags(bookmarkId, manualTags, existing?.tags ?? []);
}

export async function saveEditableTags(
  bookmarkId: string,
  manualTags: string[],
  aiTags: string[],
): Promise<{ manualTags: string[]; aiTags: string[] }> {
  const existing = await database.metadata.get(bookmarkId);
  const normalizedManualTags = normalizeTags(manualTags);
  const normalizedAiTags = normalizeTags(aiTags);
  await database.metadata.put({
    bookmarkId,
    tags: normalizedAiTags,
    manualTags: normalizedManualTags,
    summary: existing?.summary,
    suggestedCategory: existing?.suggestedCategory,
    suggestedGroup: existing?.suggestedGroup,
    updatedAt: Date.now(),
  });
  return {
    manualTags: normalizedManualTags,
    aiTags: normalizedAiTags,
  };
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag) return false;
      const key = tag.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
