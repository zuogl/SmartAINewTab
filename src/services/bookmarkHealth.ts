import { nanoid } from "nanoid";
import type {
  BookmarkHealthCredentialsMode,
  BookmarkHealthJob,
  BookmarkHealthRecord,
  BookmarkHealthRedirectHop,
  BookmarkHealthRequestLog,
  BookmarkHealthScanLimit,
  BookmarkHealthScanScope,
  BookmarkRecord,
  BookmarkRecoverySnapshot,
} from "@/domain/types";
import {
  classifyBookmarkRedirect,
  differsOnlyByFragment,
  isLikelyLoginRedirect,
} from "@/domain/bookmarkHealth";
import { database } from "./database";
import { hasHostPermission } from "./hostPermissions";
import { loadSettings } from "./storage";
import { safePublicHttpUrl } from "./networkSecurity";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 8;
const LEASE_MS = 30_000;
const DEAD_CONFIRMATION_MS = 24 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const DETECTOR_VERSION = 3;

let healthWorkerBusy = false;
let previewPumpActive = false;
export async function loadBookmarkHealthRecords(): Promise<BookmarkHealthRecord[]> {
  return database.health.toArray();
}

export async function listBookmarkHealthJobs(): Promise<BookmarkHealthJob[]> {
  return database.healthJobs.orderBy("createdAt").reverse().toArray();
}

export async function listBookmarkRecoverySnapshots(): Promise<BookmarkRecoverySnapshot[]> {
  return database.healthRecovery.orderBy("createdAt").reverse().toArray();
}

export async function createBookmarkRecoverySnapshot(
  action: BookmarkRecoverySnapshot["action"],
  bookmarks: BookmarkRecord[],
  placements: BookmarkRecoverySnapshot["placements"],
): Promise<BookmarkRecoverySnapshot> {
  const snapshot: BookmarkRecoverySnapshot = {
    id: `recovery-${nanoid(10)}`,
    action,
    createdAt: Date.now(),
    bookmarks: structuredClone(bookmarks),
    placements: structuredClone(placements),
  };
  await database.healthRecovery.add(snapshot);
  const history = await database.healthRecovery.orderBy("createdAt").reverse().toArray();
  if (history.length > 10) {
    await database.healthRecovery.bulkDelete(history.slice(10).map((item) => item.id));
  }
  return snapshot;
}

export async function deleteBookmarkRecoverySnapshot(id: string): Promise<void> {
  await database.healthRecovery.delete(id);
}

export async function enqueueBookmarkHealthJob(
  bookmarks: BookmarkRecord[],
  scope: BookmarkHealthScanScope,
  limit: BookmarkHealthScanLimit,
  now = Date.now(),
  options: {
    credentialsMode?: BookmarkHealthCredentialsMode;
    authenticatedRetry?: boolean;
    summaryMode?: BookmarkHealthJob["summaryMode"];
    resetResults?: boolean;
  } = {},
): Promise<BookmarkHealthJob | undefined> {
  const [records, activeJobs, settings] = await Promise.all([
    database.health.bulkGet(bookmarks.map((bookmark) => bookmark.id)),
    database.healthJobs
      .filter((job) => job.status === "queued" || job.status === "running")
      .toArray(),
    loadSettings(),
  ]);
  const queuedIds = new Set(
    activeJobs.flatMap((job) =>
      job.items
        .filter((item) => item.status === "queued" || item.status === "checking")
        .map((item) => item.bookmarkId),
    ),
  );
  const staleBefore =
    now - settings.bookmarkHealth.staleAfterDays * DAY_MS;
  const candidates = bookmarks.filter((bookmark, index) => {
    if (queuedIds.has(bookmark.id)) return false;
    const record = records[index];
    const changed = record?.checkedUrl !== bookmark.url;
    if (scope === "all") return true;
    if (scope === "unchecked") return !record || changed;
    return (
      !record ||
      changed ||
      record.checkedAt <= staleBefore ||
      (record.nextCheckAt !== undefined && record.nextCheckAt <= now)
    );
  });
  const selected = limit === "all" ? candidates : candidates.slice(0, limit);
  if (selected.length === 0) return undefined;

  const job: BookmarkHealthJob = {
    id: `health-${nanoid(10)}`,
    status: "queued",
    scope,
    bookmarkIds: selected.map((bookmark) => bookmark.id),
    processed: 0,
    failed: 0,
    createdAt: now,
    updatedAt: now,
    credentialsMode: options.credentialsMode ?? "omit",
    authenticatedRetry: options.authenticatedRetry ?? false,
    summaryMode: options.summaryMode,
    items: selected.map((bookmark) => ({
      bookmarkId: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      status: "queued",
      requests: [],
    })),
  };
  await database.transaction(
    "rw",
    database.health,
    database.healthJobs,
    async () => {
      if (options.resetResults) {
        await database.health.clear();
      }
      await database.healthJobs.add(job);
    },
  );
  return job;
}

export async function pauseBookmarkHealthJob(id: string): Promise<void> {
  const job = await database.healthJobs.get(id);
  if (!job || (job.status !== "queued" && job.status !== "running")) return;
  await database.healthJobs.update(id, {
    status: "paused",
    leaseUntil: 0,
    updatedAt: Date.now(),
  });
}

export async function resumeBookmarkHealthJob(id: string): Promise<void> {
  const job = await database.healthJobs.get(id);
  if (!job || (job.status !== "paused" && job.status !== "failed")) return;
  await database.healthJobs.update(id, {
    status: "queued",
    leaseUntil: 0,
    error: undefined,
    updatedAt: Date.now(),
  });
}

export async function cancelBookmarkHealthJob(id: string): Promise<void> {
  await database.healthJobs.update(id, {
    status: "cancelled",
    leaseUntil: 0,
    updatedAt: Date.now(),
  });
}

export async function retryBookmarkHealthJob(id: string): Promise<void> {
  const job = await database.healthJobs.get(id);
  if (!job) return;
  const items = job.items.map((item) =>
    item.status === "failed"
      ? { ...item, status: "queued" as const, error: undefined }
      : item,
  );
  await database.healthJobs.update(id, {
    status: "queued",
    processed: items.filter((item) => item.status === "completed").length,
    failed: 0,
    items,
    error: undefined,
    leaseUntil: 0,
    updatedAt: Date.now(),
  });
}

export async function deleteBookmarkHealthRecords(
  bookmarkIds: string[],
): Promise<void> {
  await database.health.bulkDelete(bookmarkIds);
}

export async function clearBookmarkHealthResults(): Promise<void> {
  await database.transaction(
    "rw",
    database.health,
    database.healthJobs,
    async () => {
      await database.health.clear();
      await database.healthJobs.clear();
    },
  );
}

export async function runNextBookmarkHealthJob(): Promise<boolean> {
  if (healthWorkerBusy) return false;
  healthWorkerBusy = true;
  try {
    return await runNextBookmarkHealthJobWithLease();
  } finally {
    healthWorkerBusy = false;
  }
}

export async function requestBookmarkHealthPump(): Promise<void> {
  if (
    typeof chrome !== "undefined" &&
    Boolean(chrome.runtime?.id) &&
    location.protocol === "chrome-extension:"
  ) {
    await chrome.runtime.sendMessage({ type: "health:pump" });
    return;
  }
  if (previewPumpActive) return;
  previewPumpActive = true;
  const pump = async () => {
    const hasMore = await runNextBookmarkHealthJob();
    if (hasMore) {
      window.setTimeout(() => void pump(), 80);
    } else {
      previewPumpActive = false;
    }
  };
  void pump();
}

export async function probeBookmarkUrl(
  value: string,
  previous?: BookmarkHealthRecord,
  options: {
    now?: number;
    staleAfterDays?: number;
    fetcher?: typeof fetch;
    observer?: BookmarkHealthProbeObserver;
    credentialsMode?: BookmarkHealthCredentialsMode;
    authenticatedRetry?: boolean;
  } = {},
): Promise<BookmarkHealthRecord> {
  const now = options.now ?? Date.now();
  const staleAfterDays = options.staleAfterDays ?? 14;
  const initial = safePublicHttpUrl(value);
  if (!initial) {
    return {
      bookmarkId: previous?.bookmarkId ?? "",
      checkedUrl: value,
      status: "unsupported",
      redirectCount: 0,
      consecutiveFailures: 0,
      checkedAt: now,
      detectorVersion: DETECTOR_VERSION,
      error: "仅检测公开 HTTP(S) 地址；内网、file:// 和 chrome:// 不会联网检测",
    };
  }

  const fetcher = options.fetcher ?? fetch;
  const credentialsMode = options.credentialsMode ?? "omit";
  let probe: BookmarkHealthRequestChain | undefined;
  let verifiedBy: "HEAD" | "GET" = options.authenticatedRetry ? "GET" : "HEAD";

  if (!options.authenticatedRetry) {
    try {
      probe = await requestWithRedirects(
        fetcher,
        initial,
        "HEAD",
        credentialsMode,
        options.observer,
      );
    } catch {
      // HEAD is an optimization only. A timeout, CORS failure or method rejection
      // must not decide the bookmark's health; the representative GET below does.
    }
  }

  if (
    options.authenticatedRetry ||
    !probe ||
    probe.response.status < 200 ||
    probe.response.status >= 300 ||
    probe.redirectChain.length > 0
  ) {
    if (probe) await cancelResponseBody(probe.response);
    verifiedBy = "GET";
    try {
      probe = await requestWithRedirects(
        fetcher,
        initial,
        "GET",
        credentialsMode,
        options.observer,
      );
    } catch (error) {
      return errorRecord(
        "network-error",
        value,
        previous,
        now,
        undefined,
        requestErrorText(error),
        0,
        undefined,
        "GET",
        credentialsMode === "include",
      );
    }
  }

  const response = probe.response;
  const finalUrl = normalizedFinalUrl(
    initial,
    probe.finalUrl,
    probe.redirectChain,
  );
  const allowedFinalUrl = safePublicHttpUrl(finalUrl);
  if (!allowedFinalUrl) {
    await cancelResponseBody(response);
    return {
      bookmarkId: previous?.bookmarkId ?? "",
      checkedUrl: value,
      status: "unsupported",
      httpStatus: response.status || undefined,
      finalUrl,
      redirectCount: response.redirected ? 1 : 0,
      consecutiveFailures: 0,
      checkedAt: now,
      verifiedBy,
      detectorVersion: DETECTOR_VERSION,
      checkedWithCookies: credentialsMode === "include",
      error: "最终地址不是允许检测的公开 HTTP(S) 地址",
    };
  }

  const redirectCount = probe.redirectChain.length;
  const redirectKind = redirectCount
    ? classifyBookmarkRedirect(
        initial.toString(),
        allowedFinalUrl.toString(),
        probe.redirectChain,
      )
    : undefined;
  const result = classifyResponse({
    value,
    previous,
    now,
    staleAfterDays,
    response,
    finalUrl: allowedFinalUrl.toString(),
    redirectCount,
    redirectKind,
    redirectChain: probe.redirectChain,
    verifiedBy,
    checkedWithCookies: credentialsMode === "include",
    authenticatedRetry: options.authenticatedRetry ?? false,
  });
  await cancelResponseBody(response);
  return result;
}

export interface BookmarkHealthProbeObserver {
  onRequestStart(request: BookmarkHealthRequestLog): Promise<void>;
  onRequestResponse(
    requestId: string,
    response: NonNullable<BookmarkHealthRequestLog["response"]>,
  ): Promise<void>;
  onRequestError(requestId: string, error: string): Promise<void>;
}

async function runNextBookmarkHealthJobWithLease(): Promise<boolean> {
  const now = Date.now();
  const jobs = await database.healthJobs
    .filter(
      (job) =>
        job.status === "queued" ||
        (job.status === "running" && (job.leaseUntil ?? 0) < now),
    )
    .sortBy("createdAt");
  const job = jobs[0];
  if (!job) return false;
  const item = job.items.find(
    (candidate) =>
      candidate.status === "queued" || candidate.status === "checking",
  );
  if (!item) {
    const failed = job.items.filter((candidate) => candidate.status === "failed").length;
    await database.healthJobs.update(job.id, {
      status: failed > 0 ? "failed" : "completed",
      processed: job.items.filter((candidate) => candidate.status === "completed").length,
      failed,
      leaseUntil: 0,
      updatedAt: now,
    });
    await pruneBookmarkHealthJobHistory(job.id);
    return hasRunnableHealthJob();
  }

  const checkingItems = job.items.map((candidate) =>
    candidate.bookmarkId === item.bookmarkId
      ? { ...candidate, status: "checking" as const, error: undefined }
      : candidate,
  );
  await database.healthJobs.update(job.id, {
    status: "running",
    items: checkingItems,
    leaseUntil: now + LEASE_MS,
    updatedAt: now,
  });

  try {
    if (!(await hasHostPermission(item.url))) {
      throw new Error(
        "未授权访问该网站，请在书签体检中重新开始任务或手动复检",
      );
    }
    const [previous, settings] = await Promise.all([
      database.health.get(item.bookmarkId),
      loadSettings(),
    ]);
    const result = await probeBookmarkUrl(item.url, previous, {
      staleAfterDays: settings.bookmarkHealth.staleAfterDays,
      observer: createBookmarkHealthTraceObserver(job.id, item.bookmarkId),
      credentialsMode: job.credentialsMode ?? "omit",
      authenticatedRetry: job.authenticatedRetry ?? false,
    });
    result.bookmarkId = item.bookmarkId;
    const latest = await database.healthJobs.get(job.id);
    if (latest?.status === "cancelled" || latest?.status === "paused") {
      return hasRunnableHealthJob();
    }
    await database.health.put(result);
    const completedItems = (latest?.items ?? checkingItems).map((candidate) =>
      candidate.bookmarkId === item.bookmarkId
        ? {
            ...candidate,
            status: "completed" as const,
            resultStatus: result.status,
            error: undefined,
          }
        : candidate,
    );
    const processed = completedItems.filter((candidate) => candidate.status === "completed").length;
    const failed = completedItems.filter((candidate) => candidate.status === "failed").length;
    const done = processed + failed >= completedItems.length;
    await database.healthJobs.update(job.id, {
      status: done ? (failed > 0 ? "failed" : "completed") : "queued",
      items: completedItems,
      processed,
      failed,
      leaseUntil: 0,
      updatedAt: Date.now(),
    });
    await notifyHealthUpdated(item.bookmarkId);
    if (done) await pruneBookmarkHealthJobHistory(job.id);
    return done ? hasRunnableHealthJob() : true;
  } catch (error) {
    const latest = (await database.healthJobs.get(job.id)) ?? job;
    const failedItems = latest.items.map((candidate) =>
      candidate.bookmarkId === item.bookmarkId
        ? {
            ...candidate,
            status: "failed" as const,
            error: error instanceof Error ? error.message : "检测任务失败",
          }
        : candidate,
    );
    await database.healthJobs.update(job.id, {
      status: "failed",
      items: failedItems,
      processed: failedItems.filter((candidate) => candidate.status === "completed").length,
      failed: failedItems.filter((candidate) => candidate.status === "failed").length,
      error: error instanceof Error ? error.message : "检测任务失败",
      leaseUntil: 0,
      updatedAt: Date.now(),
    });
    return hasRunnableHealthJob();
  }
}

interface BookmarkHealthRequestChain {
  response: Response;
  finalUrl: string;
  redirectChain: BookmarkHealthRedirectHop[];
}

async function requestWithRedirects(
  fetcher: typeof fetch,
  initial: URL,
  method: "HEAD" | "GET",
  credentialsMode: BookmarkHealthCredentialsMode,
  observer?: BookmarkHealthProbeObserver,
): Promise<BookmarkHealthRequestChain> {
  let current = withoutHash(initial);
  const confirmedOrigin = current.origin;
  const redirectChain: BookmarkHealthRedirectHop[] = [];
  for (let index = 0; index <= MAX_REDIRECTS; index += 1) {
    const response = await requestOnce(
      fetcher,
      current,
      method,
      credentialsMode,
      "manual",
      observer,
    );
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location) {
        await cancelResponseBody(response);
        throw new Error("跳转响应未提供可读取的 Location，无法安全确认最终地址");
      }
      if (index === MAX_REDIRECTS) {
        await cancelResponseBody(response);
        throw new Error(`跳转次数超过 ${MAX_REDIRECTS} 次`);
      }
      const next = safePublicHttpUrl(new URL(location, current).toString());
      if (!next) {
        await cancelResponseBody(response);
        throw new Error("跳转目标不是允许检测的公开 HTTP(S) 地址");
      }
      if (credentialsMode === "include" && next.origin !== confirmedOrigin) {
        await cancelResponseBody(response);
        throw new Error("Cookie 复检不会跨站跟随跳转；请单独确认目标网站");
      }
      redirectChain.push({
        status: response.status,
        fromUrl: current.toString(),
        toUrl: next.toString(),
      });
      await cancelResponseBody(response);
      current = withoutHash(next);
      continue;
    }

    const responseUrl = safePublicHttpUrl(response.url || current.toString());
    if (
      response.redirected &&
      responseUrl &&
      responseUrl.toString() !== current.toString()
    ) {
      redirectChain.push({
        status: 0,
        fromUrl: current.toString(),
        toUrl: responseUrl.toString(),
      });
    }
    return {
      response,
      finalUrl: responseUrl?.toString() ?? current.toString(),
      redirectChain,
    };
  }
  throw new Error(`跳转次数超过 ${MAX_REDIRECTS} 次`);
}

async function requestOnce(
  fetcher: typeof fetch,
  url: URL,
  method: "HEAD" | "GET",
  credentialsMode: BookmarkHealthCredentialsMode,
  redirectMode: "follow" | "manual",
  observer?: BookmarkHealthProbeObserver,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = {
    Accept: "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5",
  };
  const request: BookmarkHealthRequestLog = {
    id: `health-request-${nanoid(8)}`,
    method,
    url: url.toString(),
    startedAt: Date.now(),
    headers,
    credentialsMode,
    redirectMode,
  };
  await observer?.onRequestStart(request);
  try {
    const response = await fetcher(url.toString(), {
      method,
      credentials: credentialsMode,
      cache: "no-store",
      redirect: redirectMode,
      referrerPolicy: "no-referrer",
      headers,
      signal: controller.signal,
    });
    await observer?.onRequestResponse(request.id, {
      status: response.status,
      statusText: response.statusText || undefined,
      finalUrl: response.url || url.toString(),
      redirected:
        response.redirected ||
        Boolean(response.url && response.url !== url.toString()),
      location: response.headers.get("Location") || undefined,
    });
    return response;
  } catch (error) {
    await observer?.onRequestError(request.id, requestErrorText(error));
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function withoutHash(value: URL): URL {
  const next = new URL(value);
  next.hash = "";
  return next;
}

function normalizedFinalUrl(
  initial: URL,
  finalValue: string,
  redirectChain: BookmarkHealthRedirectHop[],
): string {
  if (
    redirectChain.length === 0 &&
    differsOnlyByFragment(initial.toString(), finalValue)
  ) {
    return initial.toString();
  }
  return finalValue;
}

function createBookmarkHealthTraceObserver(
  jobId: string,
  bookmarkId: string,
): BookmarkHealthProbeObserver {
  return {
    onRequestStart: (request) =>
      updateBookmarkHealthJobItem(jobId, bookmarkId, (item) => {
        item.requests = [...(item.requests ?? []), request];
      }),
    onRequestResponse: (requestId, response) =>
      updateBookmarkHealthJobItem(jobId, bookmarkId, (item) => {
        const request = item.requests?.find((entry) => entry.id === requestId);
        if (!request) return;
        request.completedAt = Date.now();
        request.response = response;
      }),
    onRequestError: (requestId, error) =>
      updateBookmarkHealthJobItem(jobId, bookmarkId, (item) => {
        const request = item.requests?.find((entry) => entry.id === requestId);
        if (!request) return;
        request.completedAt = Date.now();
        request.error = error;
      }),
  };
}

async function updateBookmarkHealthJobItem(
  jobId: string,
  bookmarkId: string,
  update: (item: BookmarkHealthJob["items"][number]) => void,
): Promise<void> {
  const job = await database.healthJobs.get(jobId);
  if (!job) return;
  const items = structuredClone(job.items);
  const item = items.find((candidate) => candidate.bookmarkId === bookmarkId);
  if (!item) return;
  update(item);
  await database.healthJobs.update(jobId, { items, updatedAt: Date.now() });
}

function classifyResponse({
  value,
  previous,
  now,
  staleAfterDays,
  response,
  finalUrl,
  redirectCount,
  redirectKind,
  redirectChain,
  verifiedBy,
  checkedWithCookies,
  authenticatedRetry,
}: {
  value: string;
  previous?: BookmarkHealthRecord;
  now: number;
  staleAfterDays: number;
  response: Response;
  finalUrl: string;
  redirectCount: number;
  redirectKind?: BookmarkHealthRecord["redirectKind"];
  redirectChain: BookmarkHealthRedirectHop[];
  verifiedBy: "HEAD" | "GET";
  checkedWithCookies: boolean;
  authenticatedRetry: boolean;
}): BookmarkHealthRecord {
  const base = {
    bookmarkId: previous?.bookmarkId ?? "",
    checkedUrl: value,
    httpStatus: response.status,
    finalUrl,
    redirectCount,
    redirectKind,
    redirectChain,
    checkedAt: now,
    verifiedBy,
    detectorVersion: DETECTOR_VERSION,
    checkedWithCookies,
  };
  if (
    response.status >= 200 &&
    response.status < 300 &&
    redirectCount > 0 &&
    isLikelyLoginRedirect(value, finalUrl)
  ) {
    return {
      ...base,
      status: "auth-required",
      restrictionReason: "login-redirect",
      consecutiveFailures: 0,
      nextCheckAt: now + staleAfterDays * DAY_MS,
      error: checkedWithCookies
        ? "带 Cookie 复检后仍跳转到疑似登录页，原书签地址保持不变"
        : "网页跳转到疑似登录页，可在确认后带当前登录态复检",
    };
  }
  if (response.status >= 200 && response.status < 300) {
    return {
      ...base,
      status:
        authenticatedRetry || redirectCount === 0 ? "healthy" : "redirected",
      consecutiveFailures: 0,
      lastSuccessAt: now,
      nextCheckAt: now + staleAfterDays * DAY_MS,
    };
  }
  if (response.status === 401 || response.status === 403 || response.status === 451) {
    return {
      ...base,
      status: "auth-required",
      restrictionReason: "http-status",
      consecutiveFailures: 0,
      nextCheckAt: now + staleAfterDays * DAY_MS,
      error:
        response.status === 451
          ? "站点因地区或政策限制拒绝访问，不判定为死链"
          : checkedWithCookies
            ? "带 Cookie 复检后仍被拒绝，原书签地址保持不变"
            : "站点存在，但需要登录或拒绝自动检测",
    };
  }
  if (response.status === 429) {
    return {
      ...base,
      status: "rate-limited",
      consecutiveFailures: previousFailureCount(previous, value) + 1,
      firstFailureAt: previousFailureStart(previous, value, now),
      nextCheckAt: now + 6 * 60 * 60 * 1_000,
      error: "站点限制请求频率，稍后重试",
    };
  }
  if (response.status === 404 || response.status === 410) {
    const previousWasDeadCandidate =
      previous?.checkedUrl === value &&
      previous.verifiedBy === "GET" &&
      (previous.httpStatus === 404 || previous.httpStatus === 410) &&
      (previous.status === "http-error" ||
        previous.status === "suspected-dead" ||
        previous.status === "confirmed-dead");
    const firstFailureAt =
      previousWasDeadCandidate && previous.firstFailureAt
        ? previous.firstFailureAt
        : now;
    const separatedObservation =
      previousWasDeadCandidate && now - previous.checkedAt >= DEAD_CONFIRMATION_MS;
    const consecutiveFailures = previousWasDeadCandidate
      ? separatedObservation
        ? previous.consecutiveFailures + 1
        : previous.consecutiveFailures
      : 1;
    const suspected =
      consecutiveFailures >= 2 && now - firstFailureAt >= DEAD_CONFIRMATION_MS;
    const confirmed =
      consecutiveFailures >= 3 && now - firstFailureAt >= 2 * DEAD_CONFIRMATION_MS;
    return {
      ...base,
      status: confirmed
        ? "confirmed-dead"
        : suspected
          ? "suspected-dead"
          : "http-error",
      consecutiveFailures,
      firstFailureAt,
      nextCheckAt: confirmed ? now + 30 * DAY_MS : now + DEAD_CONFIRMATION_MS,
      error: confirmed
        ? `至少间隔 24 小时的 ${consecutiveFailures} 次 GET 均返回 HTTP ${response.status}`
        : suspected
          ? `至少间隔 24 小时的 ${consecutiveFailures} 次 GET 返回 HTTP ${response.status}；再次复检失败才会确认死链`
          : `首次 GET 返回 HTTP ${response.status}；当前只归为 HTTP 异常，24 小时后复检仍失败才会进入疑似死链`,
    };
  }
  if (response.status >= 500 && response.status < 600) {
    return errorRecord(
      "server-error",
      value,
      previous,
      now,
      response.status,
      `服务器返回 HTTP ${response.status}，不判定为死链`,
      redirectCount,
      finalUrl,
      verifiedBy,
      checkedWithCookies,
    );
  }
  if (response.status >= 400 && response.status < 500) {
    return errorRecord(
      "http-error",
      value,
      previous,
      now,
      response.status,
      `网页 GET 复核返回 HTTP ${response.status}，不判定为死链`,
      redirectCount,
      finalUrl,
      verifiedBy,
      checkedWithCookies,
    );
  }
  return errorRecord(
    "network-error",
    value,
    previous,
    now,
    response.status || undefined,
    response.status === 0
      ? "浏览器没有返回可读取的 HTTP 状态"
      : `HTTP ${response.status} 暂无法确认`,
    redirectCount,
    finalUrl,
    verifiedBy,
    checkedWithCookies,
  );
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (!response.body) return;
  await response.body.cancel().catch(() => undefined);
}

function errorRecord(
  status: "http-error" | "server-error" | "network-error",
  value: string,
  previous: BookmarkHealthRecord | undefined,
  now: number,
  httpStatus: number | undefined,
  error: string,
  redirectCount: number,
  finalUrl?: string,
  verifiedBy?: "HEAD" | "GET",
  checkedWithCookies = false,
): BookmarkHealthRecord {
  return {
    bookmarkId: previous?.bookmarkId ?? "",
    checkedUrl: value,
    status,
    httpStatus,
    finalUrl,
    redirectCount,
    consecutiveFailures: previousFailureCount(previous, value) + 1,
    firstFailureAt: previousFailureStart(previous, value, now),
    checkedAt: now,
    nextCheckAt: now + DAY_MS,
    verifiedBy,
    detectorVersion: DETECTOR_VERSION,
    checkedWithCookies,
    error,
  };
}

function requestErrorText(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "请求超时";
  }
  return error instanceof Error ? error.message : "网络请求失败";
}

function previousFailureCount(
  previous: BookmarkHealthRecord | undefined,
  value: string,
): number {
  return previous?.checkedUrl === value ? previous.consecutiveFailures : 0;
}

function previousFailureStart(
  previous: BookmarkHealthRecord | undefined,
  value: string,
  now: number,
): number {
  return previous?.checkedUrl === value && previous.firstFailureAt
    ? previous.firstFailureAt
    : now;
}

async function hasRunnableHealthJob(): Promise<boolean> {
  const now = Date.now();
  return Boolean(
    await database.healthJobs
      .filter(
        (job) =>
          job.status === "queued" ||
          (job.status === "running" && (job.leaseUntil ?? 0) < now),
      )
      .first(),
  );
}

async function pruneBookmarkHealthJobHistory(currentJobId: string) {
  const completed = await database.healthJobs
    .filter((job) => job.status === "completed" || job.status === "cancelled")
    .sortBy("updatedAt");
  const removable = completed
    .filter((job) => job.id !== currentJobId)
    .slice(0, Math.max(0, completed.length - 9));
  if (removable.length) {
    await database.healthJobs.bulkDelete(removable.map((job) => job.id));
  }
}

async function notifyHealthUpdated(bookmarkId: string) {
  if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
  await chrome.runtime
    .sendMessage({ type: "health:updated", bookmarkId })
    .catch(() => undefined);
}
