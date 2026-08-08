import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookmarkIcon } from "@/app/BookmarkIcon";
import type { BookmarkRecord } from "@/domain/types";
import {
  buildFaviconCandidates,
  clearFaviconHint,
  faviconDisplaySize,
  isFaviconSharpEnough,
  preloadFaviconCollection,
  rememberFaviconMiss,
  rememberFaviconSuccess,
  resolveFavicon,
} from "@/services/favicon";

const PAGE_URL = "https://docs.example.com/guide";
const CHROME_URL =
  "chrome-extension://test/_favicon/?pageUrl=https%3A%2F%2Fdocs.example.com&size=256";

describe("favicon resolution", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(URL, "createObjectURL");
  });

  it("tries high-resolution site icons before Chrome's cached favicon", () => {
    const candidates = buildFaviconCandidates(PAGE_URL, CHROME_URL);

    expect(candidates[0]).toEqual({
      kind: "site",
      url: "https://docs.example.com/favicon.svg",
    });
    expect(candidates.at(-1)).toEqual({
      kind: "chrome",
      url: CHROME_URL,
    });
  });

  it("renders crisp local vectors for brands visible in the reported screenshot", () => {
    const hosts = [
      "resend.com",
      "fonts.google.com",
      "supabase.com",
      "fontawesome.com",
      "tailwindcss.com",
      "search.google.com",
      "developer.mozilla.org",
      "gitee.com",
      "vuejs.org",
      "vite.dev",
      "vitest.dev",
      "vueuse.org",
    ];

    for (const host of hosts) {
      const bookmark: BookmarkRecord = {
        id: host,
        title: host,
        url: `https://${host}/`,
        source: "chrome",
        folderPath: [],
        tags: [],
        aiTags: [],
      };
      const { container, unmount } = render(
        createElement(BookmarkIcon, {
          bookmark,
          source: CHROME_URL,
        }),
      );
      expect(container.querySelector("svg"), host).not.toBeNull();
      expect(container.querySelector("img"), host).toBeNull();
      unmount();
    }
  });

  it("reuses a successful site icon first", () => {
    rememberFaviconSuccess(
      PAGE_URL,
      "https://docs.example.com/assets/icon-192.png",
      1_000,
    );

    expect(buildFaviconCandidates(PAGE_URL, CHROME_URL, 2_000)[0]).toEqual({
      kind: "site",
      url: "https://docs.example.com/assets/icon-192.png",
    });
  });

  it("skips repeated site probes for a recent miss", () => {
    rememberFaviconMiss(PAGE_URL, 1_000);

    expect(buildFaviconCandidates(PAGE_URL, CHROME_URL, 2_000)).toEqual([
      { kind: "chrome", url: CHROME_URL },
    ]);
  });

  it("retries site probes after a miss expires", () => {
    rememberFaviconMiss(PAGE_URL, 1_000);

    const eightDaysLater = 1_000 + 8 * 24 * 60 * 60 * 1_000;
    expect(
      buildFaviconCandidates(PAGE_URL, CHROME_URL, eightDaysLater)[0]!.kind,
    ).toBe("site");
  });

  it("rejects small raster icons but accepts SVGs", () => {
    expect(
      isFaviconSharpEnough("https://example.com/favicon.ico", 32, 32),
    ).toBe(false);
    expect(
      isFaviconSharpEnough("https://example.com/favicon.png", 64, 64),
    ).toBe(false);
    expect(
      isFaviconSharpEnough("https://example.com/favicon.png", 128, 128),
    ).toBe(true);
    expect(
      isFaviconSharpEnough("https://example.com/favicon.svg?v=2", 16, 16),
    ).toBe(true);
  });

  it("shrinks low-resolution and provenance-unknown fallback icons", () => {
    expect(faviconDisplaySize("high", 128, 128, 2)).toBe(48);
    expect(faviconDisplaySize("vector", 16, 16, 2)).toBe(48);
    expect(faviconDisplaySize("low", 48, 48, 2)).toBe(24);
    expect(faviconDisplaySize("low", 32, 32, 2)).toBe(20);
    expect(faviconDisplaySize("fallback", 256, 256, 2)).toBe(28);
  });

  it("prefers a site's original low-resolution icon over Chrome's upscaled fallback", async () => {
    class MockImage {
      naturalWidth = 0;
      naturalHeight = 0;
      decoding = "auto";
      referrerPolicy = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(value: string) {
        queueMicrotask(() => {
          if (value === "blob:low-res-icon") {
            this.naturalWidth = 48;
            this.naturalHeight = 48;
            this.onload?.();
          } else {
            this.onerror?.();
          }
        });
      }
    }
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("devicePixelRatio", 2);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith("/favicon.ico")
          ? new Response(new Uint8Array([1, 2, 3]), {
              status: 200,
              headers: { "Content-Type": "image/x-icon" },
            })
          : new Response(null, { status: 404 }),
      ),
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:low-res-icon"),
    });

    await expect(
      resolveFavicon("https://low-res.example/dashboard", CHROME_URL),
    ).resolves.toEqual({
      status: "success",
      url: "blob:low-res-icon",
      quality: "low",
      displaySize: 24,
      naturalWidth: 48,
      naturalHeight: 48,
    });
  });

  it("can clear a stale cached success", () => {
    rememberFaviconSuccess(
      PAGE_URL,
      "https://docs.example.com/assets/icon.png",
      1_000,
    );
    clearFaviconHint(PAGE_URL);

    expect(buildFaviconCandidates(PAGE_URL, CHROME_URL, 2_000)[0]!.url).toBe(
      "https://docs.example.com/favicon.svg",
    );
  });

  it("reports collection progress and counts duplicate domains once", async () => {
    const snapshots: Array<{
      status: "loading" | "complete";
      total: number;
      processed: number;
      success: number;
      failed: number;
    }> = [];
    const resolver = vi.fn(async (pageUrl: string) =>
      pageUrl.includes("good.example")
        ? ({
            status: "success" as const,
            url: "https://good.example/icon.svg",
            quality: "vector" as const,
            displaySize: 48,
            naturalWidth: 16,
            naturalHeight: 16,
          })
        : ({ status: "failed" as const }),
    );

    const final = await preloadFaviconCollection(
      [
        {
          pageUrl: "https://github.com/",
          hasStaticIcon: true,
        },
        {
          pageUrl: "https://good.example/one",
          hasStaticIcon: false,
        },
        {
          pageUrl: "https://good.example/two",
          hasStaticIcon: false,
        },
        {
          pageUrl: "https://missing.example/",
          hasStaticIcon: false,
        },
      ],
      (progress) => snapshots.push(progress),
      { concurrency: 2, resolver },
    );

    expect(snapshots[0]).toEqual({
      status: "loading",
      total: 4,
      processed: 1,
      success: 1,
      failed: 0,
    });
    expect(final).toEqual({
      status: "complete",
      total: 4,
      processed: 4,
      success: 3,
      failed: 1,
    });
    expect(snapshots.at(-1)).toEqual(final);
    expect(resolver).toHaveBeenCalledTimes(2);
  });
});
