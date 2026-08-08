import { runNextJob } from "@/services/ai";
import { enqueueCreatedBookmarkIfEnabled } from "@/services/automaticTagging";
import { resolveChromeFolderPath } from "@/services/automaticTagging";
import {
  deleteBookmarkHealthRecords,
  enqueueBookmarkHealthJob,
  requestBookmarkHealthPump,
  runNextBookmarkHealthJob,
} from "@/services/bookmarkHealth";
import { flattenBookmarkTree } from "@/services/runtime";
import {
  loadSettings,
  saveSettings,
  setTrustedStorageAccess,
} from "@/services/storage";
import type { BookmarkRecord } from "@/domain/types";
import {
  hasAllWebHostPermissions,
  hasHostPermission,
} from "@/services/hostPermissions";
import { defineBackground } from "wxt/utils/define-background";

// Stable alarm names prevent duplicate schedules after the SmartAINewTab rename.
const ALARM_NAME = "smart-new-tab-ai-queue";
const HEALTH_QUEUE_ALARM = "smart-new-tab-health-queue";
const HEALTH_SCHEDULE_ALARM = "smart-new-tab-health-schedule";

export default defineBackground(() => {
  void setTrustedStorageAccess().catch(() => undefined);

  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  chrome.alarms.create(HEALTH_QUEUE_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(HEALTH_SCHEDULE_ALARM, { periodInMinutes: 60 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void pumpQueue();
    if (alarm.name === HEALTH_QUEUE_ALARM) void pumpHealthQueue();
    if (alarm.name === HEALTH_SCHEDULE_ALARM) void scheduleHealthScanIfDue();
  });
  chrome.runtime.onStartup.addListener(() => {
    void pumpQueue();
    void pumpHealthQueue();
    void scheduleHealthScanIfDue();
  });
  chrome.runtime.onInstalled.addListener(() => {
    void pumpQueue();
    void pumpHealthQueue();
    void scheduleHealthScanIfDue();
  });
  chrome.bookmarks.onCreated.addListener((_id, node) => {
    void enqueueCreatedBookmarkIfEnabled(node)
      .then((job) => {
        if (job) void pumpQueue();
      })
      .catch(() => undefined);
    void enqueueHealthForNodeIfEnabled(node).catch(() => undefined);
  });
  chrome.bookmarks.onChanged.addListener((id, changes) => {
    if (!changes.url) return;
    void chrome.bookmarks
      .get(id)
      .then(([node]) => node && enqueueHealthForNodeIfEnabled(node))
      .catch(() => undefined);
  });
  chrome.bookmarks.onRemoved.addListener((id) => {
    void deleteBookmarkHealthRecords([id]).catch(() => undefined);
  });
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "ai:pump"
    ) {
      void pumpQueue();
    }
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "health:pump"
    ) {
      void pumpHealthQueue();
    }
  });
});

async function pumpQueue(): Promise<void> {
  try {
    const hasMore = await runNextJob();
    if (hasMore) setTimeout(() => void pumpQueue(), 250);
  } catch {
    // The next alarm or runtime message will retry transient storage failures.
  }
}

async function pumpHealthQueue(): Promise<void> {
  try {
    const hasMore = await runNextBookmarkHealthJob();
    if (hasMore) setTimeout(() => void pumpHealthQueue(), 300);
  } catch {
    // The durable job will resume on the next alarm.
  }
}

async function enqueueHealthForNodeIfEnabled(
  node: chrome.bookmarks.BookmarkTreeNode,
): Promise<void> {
  if (!node.url) return;
  const settings = await loadSettings();
  if (!settings.bookmarkHealth.autoCheckNewBookmarks) return;
  if (!(await hasHostPermission(node.url))) return;
  const bookmark: BookmarkRecord = {
    id: node.id,
    parentId: node.parentId,
    title: node.title || node.url,
    url: node.url,
    source: "chrome",
    folderPath: await resolveChromeFolderPath(node.parentId),
    tags: [],
    aiTags: [],
    dateAdded: node.dateAdded,
  };
  const job = await enqueueBookmarkHealthJob([bookmark], "all", "all");
  if (job) await requestBookmarkHealthPump();
}

async function scheduleHealthScanIfDue(): Promise<void> {
  const settings = await loadSettings();
  const preferences = settings.bookmarkHealth;
  if (!preferences.scheduledScanEnabled) return;
  if (!(await hasAllWebHostPermissions())) return;
  const now = Date.now();
  const interval = preferences.scheduleIntervalDays * 24 * 60 * 60 * 1_000;
  if (
    preferences.lastScheduledScanAt &&
    now - preferences.lastScheduledScanAt < interval
  ) {
    return;
  }
  const bookmarks = flattenBookmarkTree(await chrome.bookmarks.getTree());
  const job = await enqueueBookmarkHealthJob(bookmarks, "stale", "all", now);
  await saveSettings({
    ...settings,
    bookmarkHealth: {
      ...preferences,
      lastScheduledScanAt: now,
    },
  });
  if (job) await requestBookmarkHealthPump();
}
