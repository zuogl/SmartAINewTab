import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPageHeadMetadata,
  inferSiteIdentity,
  pagePermissionOrigins,
  parsePageHeadMetadata,
} from "@/services/pageMetadata";

describe("page head metadata", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts useful head fields without retaining markup", () => {
    const metadata = parsePageHeadMetadata(
      `<!doctype html><html><head>
        <title>Google &amp; Search</title>
        <meta content="Google" property="og:site_name">
        <meta name="description" content="Search the world &amp; find answers">
        <meta content="search, 搜索， information; tools" name="keywords">
        <meta property="og:title" content="Google Search">
      </head><body>secret body</body></html>`,
      "https://www.google.com/",
    );

    expect(metadata).toEqual({
      finalUrl: "https://www.google.com/",
      title: "Google & Search",
      description: "Search the world & find answers",
      keywords: ["search", "搜索", "information", "tools"],
      iconUrls: [],
      siteName: "Google",
      applicationName: undefined,
      ogTitle: "Google Search",
      ogDescription: undefined,
    });
  });

  it("resolves declared favicon links and ignores unrelated link tags", () => {
    const metadata = parsePageHeadMetadata(
      `<html><head>
        <link rel="stylesheet" href="/styles.css">
        <link rel="shortcut icon" href="/assets/favicon.ico">
        <link href="icons/touch.png" rel="apple-touch-icon">
        <link rel="mask-icon" href="https://cdn.example.com/brand.svg">
        <link rel="icon" href="javascript:alert(1)">
      </head></html>`,
      "https://example.com/account/page",
    );

    expect(metadata.iconUrls).toEqual([
      "https://example.com/assets/favicon.ico",
      "https://example.com/account/icons/touch.png",
    ]);
  });

  it("recognizes known site identities and rejects local/private permission targets", () => {
    expect(inferSiteIdentity("https://www.google.com/search?q=test")).toBe(
      "Google",
    );
    expect(
      pagePermissionOrigins([
        "https://github.com/openai",
        "http://example.com/path",
        "http://127.0.0.1/admin",
        "http://192.168.1.1/",
        "chrome://settings",
      ]),
    ).toEqual([
      "https://github.com/*",
      "http://example.com/*",
      "https://example.com/*",
    ]);
  });

  it("fetches anonymously and stops at head metadata", async () => {
    const contains = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("chrome", {
      runtime: { id: "test-extension" },
      permissions: { contains },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<html><head><title>Example</title><meta name="keywords" content="alpha,beta"></head><body>private</body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPageHeadMetadata("https://example.com/path"),
    ).resolves.toMatchObject({
      title: "Example",
      keywords: ["alpha", "beta"],
    });
    expect(contains).toHaveBeenCalledWith({
      origins: ["https://example.com/*"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/path",
      expect.objectContaining({
        credentials: "omit",
        redirect: "manual",
        referrerPolicy: "no-referrer",
      }),
    );
  });

  it("does not fetch a page without permission", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test-extension" },
      permissions: { contains: vi.fn().mockResolvedValue(false) },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPageHeadMetadata("https://example.com"),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
