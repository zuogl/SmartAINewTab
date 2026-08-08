import { nanoid } from "nanoid";
import { z } from "zod";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import type {
  BackgroundAsset,
  BackgroundPreferences,
  BackgroundRotationInterval,
} from "@/domain/types";
import { database, type StoredBackgroundAsset } from "./database";

export const MAX_BACKGROUND_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BACKGROUND_EDGE = 3_840;
const THUMBNAIL_EDGE = 480;
const ACCEPTED_BACKGROUND_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export const BUILTIN_BACKGROUNDS: readonly BackgroundAsset[] = [
  {
    id: "builtin:misty-mountains",
    name: "云雾群山",
    source: "builtin",
    category: "nature",
    url: "/assets/misty-mountains.png",
    thumbnailUrl: "/assets/misty-mountains.png",
    attribution: "OpenAI ImageGen 为 SmartAINewTab 生成",
    license: "Project-generated asset",
  },
  {
    id: "builtin:sea-cliffs",
    name: "晨曦海崖",
    source: "builtin",
    category: "ocean",
    url: "/assets/backgrounds/sea-cliffs.webp",
    thumbnailUrl: "/assets/backgrounds/sea-cliffs.webp",
    attribution: "OpenAI ImageGen 为 SmartAINewTab 生成（2026-08-08）",
    license: "Project-generated asset",
  },
  {
    id: "builtin:emerald-forest",
    name: "翡翠森林",
    source: "builtin",
    category: "nature",
    url: "/assets/backgrounds/emerald-forest.webp",
    thumbnailUrl: "/assets/backgrounds/emerald-forest.webp",
    attribution: "OpenAI ImageGen 为 SmartAINewTab 生成（2026-08-08）",
    license: "Project-generated asset",
  },
  {
    id: "builtin:snow-peaks",
    name: "雪域群峰",
    source: "builtin",
    category: "nature",
    url: "/assets/backgrounds/snow-peaks.webp",
    thumbnailUrl: "/assets/backgrounds/snow-peaks.webp",
    attribution: "OpenAI ImageGen 为 SmartAINewTab 生成（2026-08-08）",
    license: "Project-generated asset",
  },
  {
    id: "builtin:copper-dunes",
    name: "暮色沙丘",
    source: "builtin",
    category: "minimal",
    url: "/assets/backgrounds/copper-dunes.webp",
    thumbnailUrl: "/assets/backgrounds/copper-dunes.webp",
    attribution: "OpenAI ImageGen 为 SmartAINewTab 生成（2026-08-08）",
    license: "Project-generated asset",
  },
  {
    id: "builtin:alpine-milky-way",
    name: "高山银河",
    source: "builtin",
    category: "space",
    url: "/assets/backgrounds/alpine-milky-way.webp",
    thumbnailUrl: "/assets/backgrounds/alpine-milky-way.webp",
    attribution: "OpenAI ImageGen 为 SmartAINewTab 生成（2026-08-08）",
    license: "Project-generated asset",
  },
] as const;

const cloudBackgroundSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  category: z
    .enum(["nature", "ocean", "city", "space", "minimal"])
    .default("nature"),
  url: z.string().url(),
  thumbnailUrl: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  attribution: z.string().max(500).optional(),
  license: z.string().max(200).optional(),
});

const cloudCatalogSchema = z.object({
  backgrounds: z.array(cloudBackgroundSchema).max(500),
});

export interface LoadedBackgroundLibrary {
  assets: BackgroundAsset[];
  revoke(): void;
}

export async function loadBackgroundLibrary(
  cloudApiBaseUrl: string,
): Promise<LoadedBackgroundLibrary> {
  const objectUrls: string[] = [];
  const stored = await database.backgrounds.orderBy("createdAt").reverse().toArray();
  const localAssets = stored.map((item) => {
    const url = URL.createObjectURL(item.blob);
    const thumbnailUrl = URL.createObjectURL(item.thumbnailBlob);
    objectUrls.push(url, thumbnailUrl);
    return storedBackgroundToAsset(item, url, thumbnailUrl);
  });
  const cloudAssets = await fetchCloudBackgrounds(cloudApiBaseUrl).catch(
    () => [] as BackgroundAsset[],
  );
  const seen = new Set<string>();
  const assets = [...BUILTIN_BACKGROUNDS, ...localAssets, ...cloudAssets].filter(
    (asset) => {
      if (seen.has(asset.id)) return false;
      seen.add(asset.id);
      return true;
    },
  );
  return {
    assets,
    revoke() {
      for (const url of objectUrls) URL.revokeObjectURL(url);
    },
  };
}

export async function fetchCloudBackgrounds(
  cloudApiBaseUrl: string,
): Promise<BackgroundAsset[]> {
  const base = normalizeApiBase(cloudApiBaseUrl);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(`${base}/v1/backgrounds`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`云端图库加载失败（${response.status}）`);
    const parsed = cloudCatalogSchema.parse(await response.json());
    return parsed.backgrounds.map((asset) => ({
      ...asset,
      id: `cloud:${asset.id}`,
      source: "cloud" as const,
    }));
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") {
      throw new Error("云端图库连接超时");
    }
    throw reason;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function validateBackgroundFile(file: Pick<File, "size" | "type">): void {
  if (!ACCEPTED_BACKGROUND_TYPES.has(file.type)) {
    throw new Error("仅支持 JPG、PNG、WebP 或 AVIF 图片");
  }
  if (file.size <= 0) throw new Error("图片文件为空");
  if (file.size > MAX_BACKGROUND_FILE_BYTES) {
    throw new Error("单张背景图片不能超过 20 MB");
  }
}

export async function importBackgroundFile(file: File): Promise<string> {
  validateBackgroundFile(file);
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("图片无法解码，请换一张图片重试");
  });
  try {
    if (bitmap.width < 640 || bitmap.height < 360) {
      throw new Error("背景图片至少需要 640 × 360 像素");
    }
    const full = await renderBitmap(bitmap, MAX_BACKGROUND_EDGE, 0.9);
    const thumbnail = await renderBitmap(bitmap, THUMBNAIL_EDGE, 0.82);
    const now = Date.now();
    const id = `upload:${nanoid(12)}`;
    await database.backgrounds.put({
      id,
      name: backgroundNameFromFile(file.name),
      mimeType: "image/webp",
      blob: full.blob,
      thumbnailBlob: thumbnail.blob,
      width: full.width,
      height: full.height,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  } finally {
    bitmap.close();
  }
}

export async function deleteLocalBackground(id: string): Promise<void> {
  if (!id.startsWith("upload:")) {
    throw new Error("只能删除自己上传的背景");
  }
  await database.backgrounds.delete(id);
}

export function normalizeBackgroundPreferences(
  preferences: BackgroundPreferences,
  assets: readonly BackgroundAsset[],
): BackgroundPreferences {
  const available = new Set(assets.map((asset) => asset.id));
  const playlistIds = uniqueIds(preferences.playlistIds).filter((id) =>
    available.has(id),
  );
  const fallbackId =
    assets.find((asset) => asset.id === DEFAULT_SETTINGS.background.currentAssetId)
      ?.id ?? assets[0]?.id ?? DEFAULT_SETTINGS.background.currentAssetId;
  const currentAssetId = available.has(preferences.currentAssetId)
    ? preferences.currentAssetId
    : playlistIds[0] ?? fallbackId;
  return {
    ...preferences,
    currentAssetId,
    playlistIds: playlistIds.length > 0 ? playlistIds : [currentAssetId],
    shuffleRemainingIds: uniqueIds(preferences.shuffleRemainingIds).filter(
      (id) => available.has(id) && id !== currentAssetId,
    ),
    overlayOpacity: clamp(preferences.overlayOpacity, 0, 70),
    blur: clamp(preferences.blur, 0, 16),
  };
}

export function rotateBackground(
  preferences: BackgroundPreferences,
  assets: readonly BackgroundAsset[],
  now = Date.now(),
  random = Math.random,
): BackgroundPreferences {
  const normalized = normalizeBackgroundPreferences(preferences, assets);
  const available = normalized.playlistIds;
  if (!normalized.rotationEnabled || available.length <= 1) {
    return { ...normalized, lastRotatedAt: now };
  }
  if (normalized.rotationOrder === "sequential") {
    const currentIndex = Math.max(0, available.indexOf(normalized.currentAssetId));
    return {
      ...normalized,
      currentAssetId: available[(currentIndex + 1) % available.length]!,
      shuffleRemainingIds: [],
      lastRotatedAt: now,
    };
  }
  const remaining = normalized.shuffleRemainingIds.filter(
    (id) => available.includes(id) && id !== normalized.currentAssetId,
  );
  const queue = remaining.length > 0
    ? remaining
    : shuffle(
        available.filter((id) => id !== normalized.currentAssetId),
        random,
      );
  const [nextId, ...rest] = queue;
  return {
    ...normalized,
    currentAssetId: nextId ?? normalized.currentAssetId,
    shuffleRemainingIds: rest,
    lastRotatedAt: now,
  };
}

export function shouldRotateBackground(
  preferences: BackgroundPreferences,
  reason: "newtab" | "timer",
  now = Date.now(),
): boolean {
  if (!preferences.rotationEnabled || preferences.playlistIds.length <= 1) {
    return false;
  }
  if (preferences.rotationInterval === "newtab") return reason === "newtab";
  return now - preferences.lastRotatedAt >= rotationIntervalMs(
    preferences.rotationInterval,
  );
}

export function rotationIntervalMs(
  interval: Exclude<BackgroundRotationInterval, "newtab">,
): number {
  if (interval === "15m") return 15 * 60_000;
  if (interval === "1h") return 60 * 60_000;
  return 24 * 60 * 60_000;
}

function storedBackgroundToAsset(
  item: StoredBackgroundAsset,
  url: string,
  thumbnailUrl: string,
): BackgroundAsset {
  return {
    id: item.id,
    name: item.name,
    source: "upload",
    category: "custom",
    url,
    thumbnailUrl,
    width: item.width,
    height: item.height,
    attribution: "我的背景",
    license: "用户本地图片",
    cloudSynced: Boolean(item.cloudSyncedAt),
  };
}

async function renderBitmap(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("浏览器无法处理这张图片");
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("图片压缩失败")),
      "image/webp",
      quality,
    );
  });
  return { blob, width, height };
}

function backgroundNameFromFile(fileName: string): string {
  const name = fileName.replace(/\.[^.]+$/, "").trim();
  return name.slice(0, 80) || "我的背景";
}

function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  const url = new URL(trimmed);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("云端地址必须使用 HTTPS");
  }
  return url.toString().replace(/\/$/, "");
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function shuffle(ids: string[], random: () => number): string[] {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
