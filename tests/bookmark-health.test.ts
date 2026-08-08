import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectDuplicateGroups,
  exactUrlKey,
  migrateLegacyBookmarkHealthRecord,
  trackingUrlKey,
} from "@/domain/bookmarkHealth";
import type { BookmarkHealthRecord, BookmarkRecord } from "@/domain/types";
import {
  enqueueBookmarkHealthJob,
  pauseBookmarkHealthJob,
  probeBookmarkUrl,
  runNextBookmarkHealthJob,
  resumeBookmarkHealthJob,
} from "@/services/bookmarkHealth";
import { database } from "@/services/database";

function bookmark(id: string, url: string, folderPath: string[] = []): BookmarkRecord {
  return {
    id,
    title: id,
    url,
    source: "chrome",
    folderPath,
    tags: [],
    aiTags: [],
  };
}

function redirectAt(status: number, location: string): Response {
  return new Response(null, { status, headers: { Location: location } });
}

describe("bookmark health and duplicate detection", () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.restoreAllMocks();
    await Promise.all([
      database.health.clear(),
      database.healthJobs.clear(),
    ]);
  });

  it("separates exact, tracking-equivalent and business-query URLs", () => {
    expect(exactUrlKey("https://EXAMPLE.com/a#top")).toBe(
      "https://example.com/a",
    );
    expect(trackingUrlKey("https://example.com/a?utm_source=x&id=42")).toBe(
      "https://example.com/a?id=42",
    );

    const groups = detectDuplicateGroups([
      bookmark("exact-a", "https://example.com/a#top", ["A"]),
      bookmark("exact-b", "https://example.com/a#bottom", ["B"]),
      bookmark("tracked", "https://example.com/a?utm_source=newsletter"),
      bookmark("business-a", "https://example.com/item?id=1"),
      bookmark("business-b", "https://example.com/item?id=2"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      confidence: "tracking",
      bookmarks: [{ id: "exact-a" }, { id: "exact-b" }, { id: "tracked" }],
    });
    expect(
      groups.some((group) =>
        group.bookmarks.some((item) => item.id === "business-a"),
      ),
    ).toBe(false);
  });

  it("uses verified final destinations as a lower-confidence duplicate signal", () => {
    const bookmarks = [
      bookmark("short", "https://short.example/a"),
      bookmark("final", "https://example.com/article"),
    ];
    const records: BookmarkHealthRecord[] = [
      {
        bookmarkId: "short",
        checkedUrl: bookmarks[0]!.url,
        status: "redirected",
        finalUrl: "https://example.com/article",
        redirectCount: 1,
        consecutiveFailures: 0,
        checkedAt: 1,
      },
      {
        bookmarkId: "final",
        checkedUrl: bookmarks[1]!.url,
        status: "healthy",
        finalUrl: "https://example.com/article",
        redirectCount: 0,
        consecutiveFailures: 0,
        checkedAt: 1,
      },
    ];

    expect(detectDuplicateGroups(bookmarks, records)).toMatchObject([
      { confidence: "destination", bookmarks: [{ id: "short" }, { id: "final" }] },
    ]);
  });

  it("downgrades legacy dead-link conclusions that were never GET-verified", () => {
    const migrated = migrateLegacyBookmarkHealthRecord({
      bookmarkId: "legacy",
      checkedUrl: "https://example.com/legacy",
      status: "confirmed-dead",
      httpStatus: 404,
      redirectCount: 0,
      consecutiveFailures: 2,
      firstFailureAt: 1,
      checkedAt: 2,
    });
    expect(migrated).toMatchObject({
      status: "network-error",
      consecutiveFailures: 0,
      nextCheckAt: 0,
      error: expect.stringContaining("GET 复核"),
    });
  });

  it("does not call 403 a dead link and requires three spaced GET failures for confirmed death", async () => {
    const forbidden = await probeBookmarkUrl("https://example.com/private", undefined, {
      now: 1_000,
      fetcher: vi.fn(async () => new Response(null, { status: 403 })),
    });
    expect(forbidden.status).toBe("auth-required");

    const first = await probeBookmarkUrl("https://example.com/missing", undefined, {
      now: 10_000,
      fetcher: vi.fn(async () => new Response(null, { status: 404 })),
    });
    expect(first).toMatchObject({ status: "http-error", verifiedBy: "GET" });

    const tooSoon = await probeBookmarkUrl("https://example.com/missing", first, {
      now: 20_000,
      fetcher: vi.fn(async () => new Response(null, { status: 404 })),
    });
    expect(tooSoon).toMatchObject({
      status: "http-error",
      consecutiveFailures: 1,
    });

    const suspected = await probeBookmarkUrl("https://example.com/missing", first, {
      now: 10_000 + 24 * 60 * 60 * 1_000,
      fetcher: vi.fn(async () => new Response(null, { status: 410 })),
    });
    expect(suspected).toMatchObject({
      status: "suspected-dead",
      consecutiveFailures: 2,
      httpStatus: 410,
    });

    const confirmed = await probeBookmarkUrl("https://example.com/missing", suspected, {
      now: 10_000 + 48 * 60 * 60 * 1_000,
      fetcher: vi.fn(async () => new Response(null, { status: 404 })),
    });
    expect(confirmed).toMatchObject({
      status: "confirmed-dead",
      consecutiveFailures: 3,
      httpStatus: 404,
    });

    const previousTimeout: BookmarkHealthRecord = {
      ...first,
      status: "temporary-error",
      firstFailureAt: 10_000,
      consecutiveFailures: 4,
    };
    const firstReal404 = await probeBookmarkUrl(
      "https://example.com/missing",
      previousTimeout,
      {
        now: 10_000 + 48 * 60 * 60 * 1_000,
        fetcher: vi.fn(async () => new Response(null, { status: 404 })),
      },
    );
    expect(firstReal404).toMatchObject({
      status: "http-error",
      consecutiveFailures: 1,
    });
  });

  it("records redirect status codes and verifies redirected HEAD results with GET", async () => {
    const redirectFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirectAt(301, "https://www.example.com/old"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(redirectAt(301, "https://www.example.com/old"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const redirected = await probeBookmarkUrl("http://example.com/old", undefined, {
      fetcher: redirectFetcher,
    });
    expect(redirected).toMatchObject({
      status: "redirected",
      finalUrl: "https://www.example.com/old",
      redirectCount: 1,
      redirectKind: "permanent-canonical",
      verifiedBy: "GET",
      redirectChain: [{
        status: 301,
        fromUrl: "http://example.com/old",
        toUrl: "https://www.example.com/old",
      }],
    });

    expect(redirectFetcher).toHaveBeenCalledWith(
      "http://example.com/old",
      expect.objectContaining({ method: "HEAD", redirect: "manual" }),
    );

    const fallbackFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const recovered = await probeBookmarkUrl("https://example.com/headless", undefined, {
      fetcher: fallbackFetcher,
    });
    expect(recovered.status).toBe("healthy");
    expect(fallbackFetcher).toHaveBeenNthCalledWith(
      2,
      "https://example.com/headless",
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "manual",
        headers: expect.objectContaining({ Accept: expect.any(String) }),
      }),
    );

    const headFailureFetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("HEAD blocked"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const recoveredFromHeadFailure = await probeBookmarkUrl(
      "https://example.com/head-blocked",
      undefined,
      { fetcher: headFailureFetcher },
    );
    expect(recoveredFromHeadFailure.status).toBe("healthy");
    expect(headFailureFetcher).toHaveBeenNthCalledWith(
      2,
      "https://example.com/head-blocked",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps fragment-only URLs healthy and preserves the complete bookmark address", async () => {
    const result = await probeBookmarkUrl(
      "https://example.com/guide#install",
      undefined,
      { fetcher: vi.fn(async () => new Response(null, { status: 200 })) },
    );

    expect(result).toMatchObject({
      status: "healthy",
      finalUrl: "https://example.com/guide#install",
      redirectCount: 0,
    });
  });

  it("classifies temporary, same-site and cross-domain redirects conservatively", async () => {
    async function probeRedirect(status: number, from: string, to: string) {
      return probeBookmarkUrl(from, undefined, {
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(redirectAt(status, to))
          .mockResolvedValueOnce(new Response(null, { status: 200 }))
          .mockResolvedValueOnce(redirectAt(status, to))
          .mockResolvedValueOnce(new Response(null, { status: 200 })),
      });
    }

    await expect(
      probeRedirect(302, "https://example.com/old", "https://example.com/new"),
    ).resolves.toMatchObject({ redirectKind: "temporary" });
    await expect(
      probeRedirect(308, "https://example.com/old", "https://example.com/new"),
    ).resolves.toMatchObject({ redirectKind: "same-site-path" });
    await expect(
      probeRedirect(301, "https://example.com/old", "https://other.example/new"),
    ).resolves.toMatchObject({ redirectKind: "cross-domain" });
  });

  it("detects login redirects and only marks a successful authenticated retry healthy", async () => {
    const loginFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirectAt(302, "/login"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(redirectAt(302, "/login"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const restricted = await probeBookmarkUrl(
      "https://example.com/account",
      undefined,
      { fetcher: loginFetcher },
    );
    expect(restricted).toMatchObject({
      status: "auth-required",
      restrictionReason: "login-redirect",
      finalUrl: "https://example.com/login",
    });

    const authenticatedFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const authenticated = await probeBookmarkUrl(
      "https://example.com/account",
      restricted,
      {
        fetcher: authenticatedFetcher,
        credentialsMode: "include",
        authenticatedRetry: true,
      },
    );
    expect(authenticated).toMatchObject({
      status: "healthy",
      checkedWithCookies: true,
      checkedUrl: "https://example.com/account",
    });
    expect(authenticatedFetcher).toHaveBeenNthCalledWith(
      1,
      "https://example.com/account",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("separates HTTP, server and network failures instead of using one temporary bucket", async () => {
    const clientError = await probeBookmarkUrl("https://example.com/bad", undefined, {
      fetcher: vi.fn(async () => new Response(null, { status: 400 })),
    });
    expect(clientError.status).toBe("http-error");

    const serverError = await probeBookmarkUrl("https://example.com/down", undefined, {
      fetcher: vi.fn(async () => new Response(null, { status: 503 })),
    });
    expect(serverError.status).toBe("server-error");

    const networkError = await probeBookmarkUrl("https://example.com/offline", undefined, {
      fetcher: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    expect(networkError.status).toBe("network-error");
  });

  it("persists progress after every item so a health job can resume", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const job = await enqueueBookmarkHealthJob(
      [
        bookmark("one", "https://one.example.com"),
        bookmark("two", "https://two.example.com"),
      ],
      "all",
      "all",
    );
    expect(job?.items).toHaveLength(2);

    expect(await runNextBookmarkHealthJob()).toBe(true);
    expect(await database.healthJobs.get(job!.id)).toMatchObject({
      status: "queued",
      processed: 1,
      items: [
        expect.objectContaining({
          requests: [
            expect.objectContaining({
              method: "HEAD",
              response: expect.objectContaining({ status: 200 }),
            }),
          ],
        }),
        expect.any(Object),
      ],
    });
    expect(await database.health.count()).toBe(1);

    expect(await runNextBookmarkHealthJob()).toBe(false);
    expect(await database.healthJobs.get(job!.id)).toMatchObject({
      status: "completed",
      processed: 2,
    });
    expect(await database.health.count()).toBe(2);
  });

  it("atomically clears previous results when a new full scan starts", async () => {
    await database.health.put({
      bookmarkId: "old",
      checkedUrl: "https://old.example.com",
      status: "confirmed-dead",
      redirectCount: 0,
      consecutiveFailures: 3,
      checkedAt: Date.now() - 1_000,
    });

    const job = await enqueueBookmarkHealthJob(
      [bookmark("new", "https://new.example.com")],
      "all",
      "all",
      Date.now(),
      { summaryMode: "full-scan", resetResults: true },
    );

    expect(job).toMatchObject({
      summaryMode: "full-scan",
      processed: 0,
      bookmarkIds: ["new"],
    });
    expect(await database.health.count()).toBe(0);
    expect(await database.healthJobs.get(job!.id)).toBeDefined();
  });

  it("pauses without losing queued items and resumes the same durable job", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const job = await enqueueBookmarkHealthJob(
      [bookmark("one", "https://one.example.com")],
      "all",
      "all",
    );
    await pauseBookmarkHealthJob(job!.id);
    expect(await runNextBookmarkHealthJob()).toBe(false);
    expect(await database.health.count()).toBe(0);

    await resumeBookmarkHealthJob(job!.id);
    expect(await runNextBookmarkHealthJob()).toBe(false);
    expect(await database.healthJobs.get(job!.id)).toMatchObject({
      status: "completed",
      processed: 1,
    });
  });

  it("uses manual redirects and refuses cross-origin Cookie hops", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://other.example.com/tool" },
      }),
    );

    const result = await probeBookmarkUrl(
      "https://example.com/tool",
      undefined,
      {
        fetcher,
        credentialsMode: "include",
        authenticatedRetry: true,
      },
    );

    expect(result.status).toBe("network-error");
    expect(result.error).toContain("不会跨站跟随跳转");
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.com/tool",
      expect.objectContaining({ redirect: "manual", credentials: "include" }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
