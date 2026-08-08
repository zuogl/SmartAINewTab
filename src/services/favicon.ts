import { fetchPageHeadMetadata } from "@/services/pageMetadata";
import { hasHostPermission } from "@/services/hostPermissions";
import { safePublicHttpUrl } from "@/services/networkSecurity";

// v2 invalidates legacy misses that treated every raster below 96px as unusable.
const CACHE_KEY = "smartNewTab.faviconHints.v2";
const SUCCESS_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 500;
const MIN_RASTER_SIZE = 96;
const SITE_ICON_TIMEOUT_MS = 3_000;
const FALLBACK_ICON_TIMEOUT_MS = 1_500;
const DEFAULT_COLLECTION_CONCURRENCY = 12;
const DEFAULT_DISPLAY_SIZE = 48;
const MIN_LOW_RES_DISPLAY_SIZE = 20;
const CHROME_FALLBACK_DISPLAY_SIZE = 28;
const MAX_ICON_BYTES = 256 * 1024;
const MAX_ICON_REDIRECTS = 3;

export interface FaviconCandidate {
  kind: "site" | "chrome";
  url: string;
}

export type FaviconQuality = "vector" | "high" | "low" | "fallback";

export type FaviconResolution =
  | {
      status: "success";
      url: string;
      quality: FaviconQuality;
      displaySize: number;
      naturalWidth: number;
      naturalHeight: number;
    }
  | { status: "failed" };

interface LoadedFaviconCandidate {
  candidate: FaviconCandidate;
  displayUrl: string;
  quality: FaviconQuality;
  naturalWidth: number;
  naturalHeight: number;
}

export interface FaviconCollectionTarget {
  pageUrl: string;
  chromeFaviconUrl?: string;
  hasStaticIcon: boolean;
}

export interface FaviconLoadProgress {
  status: "loading" | "complete";
  total: number;
  processed: number;
  success: number;
  failed: number;
}

interface PreloadOptions {
  concurrency?: number;
  resolver?: (
    pageUrl: string,
    chromeFaviconUrl?: string,
  ) => Promise<FaviconResolution>;
}

interface FaviconHint {
  checkedAt: number;
  url?: string;
}

type FaviconHints = Record<string, FaviconHint>;

const resolutionCache = new Map<string, Promise<FaviconResolution>>();

export function buildFaviconCandidates(
  pageUrl: string,
  chromeFaviconUrl?: string,
  now = Date.now(),
): FaviconCandidate[] {
  const candidates: FaviconCandidate[] = [];

  try {
    const url = safePublicHttpUrl(pageUrl);
    if (url) {
      const cached = readFaviconHint(url.hostname, now);
      if (cached?.url && isSamePublicOrigin(cached.url, url)) {
        candidates.push({ kind: "site", url: cached.url });
      }

      if (cached?.url !== undefined || cached === undefined) {
        candidates.push(
          ...siteIconUrls(url.origin)
            .filter((candidate) => candidate !== cached?.url)
            .map((candidate) => ({
              kind: "site" as const,
              url: candidate,
            })),
        );
      }
    }
  } catch {
    // Non-web bookmarks can still use Chrome's internal favicon cache.
  }

  if (chromeFaviconUrl) {
    candidates.push({ kind: "chrome", url: chromeFaviconUrl });
  }

  return uniqueCandidates(candidates);
}

export function resolveFavicon(
  pageUrl: string,
  chromeFaviconUrl?: string,
): Promise<FaviconResolution> {
  const key = resolutionKey(pageUrl);
  const cached = resolutionCache.get(key);
  if (cached) return cached;

  const pending = resolveFaviconCandidates(pageUrl, chromeFaviconUrl).catch(
    () => ({ status: "failed" as const }),
  );
  resolutionCache.set(key, pending);
  return pending;
}

export async function preloadFaviconCollection(
  targets: FaviconCollectionTarget[],
  onProgress: (progress: FaviconLoadProgress) => void,
  options: PreloadOptions = {},
): Promise<FaviconLoadProgress> {
  const total = targets.length;
  const staticCount = targets.filter(({ hasStaticIcon }) => hasStaticIcon).length;
  const groups = groupDynamicTargets(targets);
  let progress: FaviconLoadProgress = {
    status:
      staticCount === total && groups.length === 0 ? "complete" : "loading",
    total,
    processed: staticCount,
    success: staticCount,
    failed: 0,
  };
  onProgress({ ...progress });

  if (groups.length === 0) return progress;

  const resolver = options.resolver ?? resolveFavicon;
  const requestedConcurrency =
    options.concurrency ?? DEFAULT_COLLECTION_CONCURRENCY;
  const concurrency = Math.max(
    1,
    Math.min(requestedConcurrency, groups.length),
  );
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < groups.length) {
      const group = groups[cursor];
      cursor += 1;
      if (!group) return;

      let resolution: FaviconResolution;
      try {
        resolution = await resolver(
          group.representative.pageUrl,
          group.representative.chromeFaviconUrl,
        );
      } catch {
        resolution = { status: "failed" };
      }

      const weight = group.count;
      const processed = progress.processed + weight;
      progress = {
        status: processed >= total ? "complete" : "loading",
        total,
        processed,
        success:
          progress.success +
          (resolution.status === "success" ? weight : 0),
        failed:
          progress.failed +
          (resolution.status === "failed" ? weight : 0),
      };
      onProgress({ ...progress });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return progress;
}

export function isFaviconSharpEnough(
  source: string,
  naturalWidth: number,
  naturalHeight: number,
): boolean {
  if (isSvgUrl(source)) return true;
  return naturalWidth >= MIN_RASTER_SIZE && naturalHeight >= MIN_RASTER_SIZE;
}

export function faviconDisplaySize(
  quality: FaviconQuality,
  naturalWidth: number,
  naturalHeight: number,
  devicePixelRatio = currentDevicePixelRatio(),
): number {
  if (quality === "vector" || quality === "high") {
    return DEFAULT_DISPLAY_SIZE;
  }
  if (quality === "fallback") return CHROME_FALLBACK_DISPLAY_SIZE;

  const intrinsicSize = Math.min(naturalWidth, naturalHeight);
  if (!Number.isFinite(intrinsicSize) || intrinsicSize <= 0) {
    return MIN_LOW_RES_DISPLAY_SIZE;
  }
  const density = Math.max(1, devicePixelRatio || 1);
  return Math.max(
    MIN_LOW_RES_DISPLAY_SIZE,
    Math.min(DEFAULT_DISPLAY_SIZE, Math.round(intrinsicSize / density)),
  );
}

export function rememberFaviconSuccess(
  pageUrl: string,
  faviconUrl: string,
  now = Date.now(),
): void {
  updateFaviconHint(pageUrl, { checkedAt: now, url: faviconUrl });
}

export function rememberFaviconMiss(
  pageUrl: string,
  now = Date.now(),
): void {
  updateFaviconHint(pageUrl, { checkedAt: now });
}

export function clearFaviconHint(pageUrl: string): void {
  const hostname = hostnameFor(pageUrl);
  if (!hostname) return;
  const hints = readHints();
  delete hints[hostname];
  writeHints(hints);
}

function siteIconUrls(origin: string): string[] {
  return [
    `${origin}/favicon.svg`,
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
    `${origin}/favicon-192x192.png`,
    `${origin}/favicon.png`,
    `${origin}/favicon.ico`,
  ];
}

function readFaviconHint(
  hostname: string,
  now: number,
): FaviconHint | undefined {
  const hint = readHints()[hostname.toLowerCase()];
  if (!hint) return undefined;
  const ttl = hint.url ? SUCCESS_TTL_MS : MISS_TTL_MS;
  return now - hint.checkedAt <= ttl ? hint : undefined;
}

function updateFaviconHint(pageUrl: string, hint: FaviconHint): void {
  const hostname = hostnameFor(pageUrl);
  if (!hostname) return;
  const hints = readHints();
  hints[hostname] = hint;
  const entries = Object.entries(hints);
  if (entries.length > MAX_CACHE_ENTRIES) {
    entries
      .sort(([, left], [, right]) => right.checkedAt - left.checkedAt)
      .slice(MAX_CACHE_ENTRIES)
      .forEach(([key]) => delete hints[key]);
  }
  writeHints(hints);
}

function hostnameFor(pageUrl: string): string | undefined {
  try {
    return new URL(pageUrl).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

function readHints(): FaviconHints {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    return value ? (JSON.parse(value) as FaviconHints) : {};
  } catch {
    return {};
  }
}

function writeHints(hints: FaviconHints): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(hints));
  } catch {
    // Favicon caching is optional; rendering should continue without it.
  }
}

function isSvgUrl(source: string): boolean {
  try {
    return new URL(source).pathname.toLowerCase().endsWith(".svg");
  } catch {
    return (source.toLowerCase().split(/[?#]/, 1)[0] ?? "").endsWith(".svg");
  }
}

function uniqueCandidates(
  candidates: FaviconCandidate[],
): FaviconCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

async function resolveFaviconCandidates(
  pageUrl: string,
  chromeFaviconUrl?: string,
): Promise<FaviconResolution> {
  if (typeof Image === "undefined") return { status: "failed" };

  const candidates = buildFaviconCandidates(pageUrl, chromeFaviconUrl);
  const siteCandidates = candidates.filter(({ kind }) => kind === "site");
  const fallbackCandidates = candidates.filter(({ kind }) => kind === "chrome");

  if (siteCandidates.length > 0) {
    let siteResult = await bestLoadedCandidate(
      siteCandidates,
      SITE_ICON_TIMEOUT_MS,
    );
    if (!siteResult) {
      const metadata = await fetchPageHeadMetadata(pageUrl);
      const declaredCandidates = uniqueCandidates(
        (metadata?.iconUrls ?? []).map((url) => ({
          kind: "site" as const,
          url,
        })),
      ).filter(
        ({ url }) => !siteCandidates.some((candidate) => candidate.url === url),
      );
      siteResult = await bestLoadedCandidate(
        declaredCandidates,
        SITE_ICON_TIMEOUT_MS,
      );
    }
    if (siteResult) {
      rememberFaviconSuccess(pageUrl, siteResult.candidate.url);
      return successfulResolution(siteResult);
    }
    rememberFaviconMiss(pageUrl);
  }

  const fallbackResult = await bestLoadedCandidate(
    fallbackCandidates,
    FALLBACK_ICON_TIMEOUT_MS,
  );
  return fallbackResult
    ? successfulResolution(fallbackResult)
    : { status: "failed" };
}

async function bestLoadedCandidate(
  candidates: FaviconCandidate[],
  timeoutMs: number,
): Promise<LoadedFaviconCandidate | undefined> {
  if (candidates.length === 0) return undefined;

  return new Promise((resolve) => {
    let remaining = candidates.length;
    let settled = false;
    let bestLowResolution: LoadedFaviconCandidate | undefined;

    for (const candidate of candidates) {
      void loadCandidate(candidate, timeoutMs).then((loaded) => {
        if (settled) return;
        if (loaded && (loaded.quality === "vector" || loaded.quality === "high")) {
          settled = true;
          resolve(loaded);
          return;
        }
        if (
          loaded &&
          (!bestLowResolution ||
            loaded.naturalWidth * loaded.naturalHeight >
              bestLowResolution.naturalWidth * bestLowResolution.naturalHeight)
        ) {
          bestLowResolution = loaded;
        }
        remaining -= 1;
        if (remaining === 0) resolve(bestLowResolution);
      });
    }
  });
}

async function loadCandidate(
  candidate: FaviconCandidate,
  timeoutMs: number,
): Promise<LoadedFaviconCandidate | undefined> {
  const displayUrl =
    candidate.kind === "site"
      ? await fetchIconBlobUrl(candidate.url, timeoutMs)
      : candidate.url;
  if (!displayUrl) return undefined;
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (loaded?: LoadedFaviconCandidate) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(loaded);
    };
    const timeout = window.setTimeout(() => finish(), timeoutMs);

    image.referrerPolicy = "no-referrer";
    image.decoding = "async";
    image.onload = () => {
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        finish();
        return;
      }
      finish({
        candidate,
        displayUrl,
        quality: faviconQuality(
          candidate,
          image.naturalWidth,
          image.naturalHeight,
        ),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      });
    };
    image.onerror = () => finish();
    image.src = displayUrl;
  });
}

async function fetchIconBlobUrl(
  value: string,
  timeoutMs: number,
): Promise<string | undefined> {
  const initial = safePublicHttpUrl(value);
  if (!initial || !(await hasHostPermission(initial.toString()))) return undefined;
  const origin = initial.origin;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = initial;
    for (let redirect = 0; redirect <= MAX_ICON_REDIRECTS; redirect += 1) {
      if (!(await hasHostPermission(current.toString()))) return undefined;
      const response = await fetch(current.toString(), {
        method: "GET",
        credentials: "omit",
        cache: "force-cache",
        redirect: "manual",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("Location");
        if (!location || redirect === MAX_ICON_REDIRECTS) return undefined;
        const next = safePublicHttpUrl(new URL(location, current));
        if (!next || next.origin !== origin) return undefined;
        current = next;
        continue;
      }
      if (!response.ok || !isSupportedIconType(response.headers.get("Content-Type"))) {
        await response.body?.cancel().catch(() => undefined);
        return undefined;
      }
      const bytes = await readBoundedIconBytes(response);
      if (!bytes) return undefined;
      const type = response.headers.get("Content-Type")?.split(";", 1)[0] || "image/png";
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return URL.createObjectURL(new Blob([copy.buffer], { type }));
    }
  } catch {
    return undefined;
  } finally {
    globalThis.clearTimeout(timeout);
  }
  return undefined;
}

async function readBoundedIconBytes(response: Response): Promise<Uint8Array | undefined> {
  const declared = Number(response.headers.get("Content-Length") ?? 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_ICON_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength <= MAX_ICON_BYTES ? bytes : undefined;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_ICON_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isSupportedIconType(value: string | null): boolean {
  if (!value) return true;
  const type = value.split(";", 1)[0]?.trim().toLowerCase();
  return Boolean(type?.startsWith("image/") || type === "application/octet-stream");
}

function isSamePublicOrigin(value: string, page: URL): boolean {
  const url = safePublicHttpUrl(value);
  return Boolean(url && url.origin === page.origin);
}

function faviconQuality(
  candidate: FaviconCandidate,
  naturalWidth: number,
  naturalHeight: number,
): FaviconQuality {
  if (candidate.kind === "chrome") return "fallback";
  if (isSvgUrl(candidate.url)) return "vector";
  return naturalWidth >= MIN_RASTER_SIZE && naturalHeight >= MIN_RASTER_SIZE
    ? "high"
    : "low";
}

function successfulResolution(
  loaded: LoadedFaviconCandidate,
): Extract<FaviconResolution, { status: "success" }> {
  return {
    status: "success",
    url: loaded.displayUrl,
    quality: loaded.quality,
    displaySize: faviconDisplaySize(
      loaded.quality,
      loaded.naturalWidth,
      loaded.naturalHeight,
    ),
    naturalWidth: loaded.naturalWidth,
    naturalHeight: loaded.naturalHeight,
  };
}

function currentDevicePixelRatio(): number {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

function groupDynamicTargets(targets: FaviconCollectionTarget[]): Array<{
  representative: FaviconCollectionTarget;
  count: number;
}> {
  const groups = new Map<
    string,
    { representative: FaviconCollectionTarget; count: number }
  >();

  for (const target of targets) {
    if (target.hasStaticIcon) continue;
    const key = resolutionKey(target.pageUrl);
    const current = groups.get(key);
    if (current) current.count += 1;
    else groups.set(key, { representative: target, count: 1 });
  }

  return [...groups.values()];
}

function resolutionKey(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    return url.origin === "null"
      ? pageUrl
      : `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return pageUrl;
  }
}
