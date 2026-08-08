import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import { buildWorkspaceFromBookmarks } from "@/domain/layout";
import {
  rankSearchCandidates,
  type AiSearchPlan,
} from "@/domain/search";
import type { AppSettings, BookmarkRecord } from "@/domain/types";
import { resolveSmartSearch } from "@/services/ai";

const domainBookmarks: BookmarkRecord[] = [
  {
    id: "aliyun-domain",
    title: "阿里云域名注册",
    url: "https://wanwang.aliyun.com/domain",
    source: "preview",
    folderPath: ["书签栏"],
    tags: ["阿里云"],
    aiTags: ["域名注册", "注册商"],
    summary: "提供域名注册、购买、续费和转入服务",
  },
  {
    id: "namesilo",
    title: "NameSilo",
    url: "https://www.namesilo.com/",
    source: "preview",
    folderPath: ["书签栏"],
    tags: [],
    aiTags: ["域名注册商", "域名购买"],
    summary: "用于注册和购买域名",
  },
  {
    id: "ahrefs",
    title: "Ahrefs",
    url: "https://ahrefs.com/",
    source: "preview",
    folderPath: ["书签栏"],
    tags: [],
    aiTags: ["SEO", "外链分析", "域名分析"],
    summary: "用于分析域名流量、关键词和外链",
  },
  {
    id: "tubebuddy",
    title: "TubeBuddy",
    url: "https://www.tubebuddy.com/",
    source: "preview",
    folderPath: ["书签栏"],
    tags: [],
    aiTags: ["YouTube SEO"],
    summary: "帮助创作者优化视频 SEO",
  },
];

const domainWorkspace = buildWorkspaceFromBookmarks(domainBookmarks);

const domainPurchasePlan: AiSearchPlan = {
  searchMode: "precise",
  interpretation: "查找可以注册或购买域名的服务",
  exactTerms: ["域名购买"],
  equivalentTerms: [],
  relatedTerms: [],
  requiredConcepts: [
    { label: "对象", terms: ["域名", "domain"] },
    { label: "动作", terms: ["购买", "注册", "注册商", "registrar"] },
  ],
  downrankTerms: ["SEO", "外链", "流量分析", "域名分析"],
};

const seoPlan: AiSearchPlan = {
  searchMode: "topic",
  interpretation: "浏览 SEO 及其直接相关工具与资料",
  exactTerms: ["SEO"],
  equivalentTerms: ["Search Engine Optimization", "搜索引擎优化"],
  relatedTerms: ["关键词研究", "排名监控", "外链分析", "SEO审计"],
  requiredConcepts: [],
  downrankTerms: [],
};

function settingsWithAi(enabled = true): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    provider: {
      ...DEFAULT_SETTINGS.provider,
      enabled,
      endpoint: "https://provider.example.com/v1",
      model: "test-model",
      apiKey: enabled ? "test-secret" : "",
    },
  };
}

function completion(content: unknown) {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(content) },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("evidence-grounded bookmark search", () => {
  it("keeps precise intent strict across every required concept", () => {
    const candidates = rankSearchCandidates(
      "域名购买",
      domainPurchasePlan,
      domainBookmarks,
      domainWorkspace,
    );

    expect(candidates.map((candidate) => candidate.bookmark.id)).toEqual([
      "aliyun-domain",
      "namesilo",
    ]);
    expect(candidates.every((candidate) => candidate.strictMatch)).toBe(true);
    expect(candidates.every((candidate) => candidate.matchKind === "precise")).toBe(
      true,
    );
    expect(candidates.map((candidate) => candidate.bookmark.id)).not.toContain(
      "ahrefs",
    );
  });

  it("orders direct, equivalent and related SEO evidence and excludes tutorials", () => {
    const seoBookmarks: BookmarkRecord[] = [
      {
        id: "dajuseo",
        title: "大橙SEO",
        url: "https://www.dajuseo.com/",
        source: "preview",
        folderPath: ["书签栏"],
        tags: [],
        aiTags: ["SEO", "搜索引擎优化", "营销工具"],
        summary: "用于搜索引擎优化",
      },
      {
        id: "search-optimization",
        title: "Organic Search Guide",
        url: "https://search-guide.example.com/",
        source: "preview",
        folderPath: ["书签栏"],
        tags: [],
        aiTags: [],
        summary: "Search Engine Optimization reference",
      },
      {
        id: "keyword-research",
        title: "Keyword Explorer",
        url: "https://keywords.example.com/",
        source: "preview",
        folderPath: ["书签栏"],
        tags: [],
        aiTags: ["关键词研究"],
        summary: "分析关键词难度与搜索需求",
      },
      {
        id: "css",
        title: "CSS",
        url: "https://developer.example.com/css",
        source: "preview",
        folderPath: ["书签栏"],
        tags: [],
        aiTags: ["前端开发", "CSS教程"],
        summary: "CSS 技巧与知识参考手册",
      },
      {
        id: "w3school",
        title: "w3school",
        url: "https://www.w3school.com.cn/",
        source: "preview",
        folderPath: ["书签栏"],
        tags: [],
        aiTags: ["编程学习", "HTML教程"],
        summary: "提供 HTML、CSS 和 JavaScript 教程",
      },
    ];

    const candidates = rankSearchCandidates(
      "SEO",
      seoPlan,
      seoBookmarks,
      buildWorkspaceFromBookmarks(seoBookmarks),
    );

    expect(candidates.map((candidate) => candidate.bookmark.id)).toEqual([
      "dajuseo",
      "search-optimization",
      "keyword-research",
    ]);
    expect(candidates.map((candidate) => candidate.matchKind)).toEqual([
      "direct",
      "equivalent",
      "related",
    ]);
    expect(candidates[0]?.reason).toContain("直接包含");
    expect(candidates.map((candidate) => candidate.bookmark.id)).not.toContain(
      "css",
    );
    expect(candidates.map((candidate) => candidate.bookmark.id)).not.toContain(
      "w3school",
    );
  });

  it("does not run or fall back locally when AI is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveSmartSearch(
      "域名购买",
      domainBookmarks,
      domainWorkspace,
      settingsWithAi(false),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.action).toBe("unavailable");
    expect(result.hits).toEqual([]);
    expect(result.message).toContain("启用 Provider");
  });

  it("does not run or fall back locally when the API key is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const settings = settingsWithAi();
    settings.provider.apiKey = "   ";

    const result = await resolveSmartSearch(
      "NameSilo",
      domainBookmarks,
      domainWorkspace,
      settings,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.action).toBe("unavailable");
    expect(result.hits).toEqual([]);
  });

  it("uses one AI planning call and cannot omit direct bookmark evidence", async () => {
    const seoBookmarks: BookmarkRecord[] = [
      {
        id: "dajuseo",
        title: "大橙SEO",
        url: "https://www.dajuseo.com/",
        source: "preview",
        folderPath: ["书签栏"],
        tags: [],
        aiTags: ["SEO", "搜索引擎优化"],
        summary: "用于搜索引擎优化",
      },
      {
        id: "css",
        title: "CSS",
        url: "https://developer.example.com/css",
        source: "preview",
        folderPath: ["书签栏"],
        tags: [],
        aiTags: ["前端开发"],
        summary: "CSS 技巧与知识参考手册",
      },
    ];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(JSON.parse(body.messages[1]!.content)).toEqual({ query: "SEO" });
      return completion(seoPlan);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveSmartSearch(
      "SEO",
      seoBookmarks,
      buildWorkspaceFromBookmarks(seoBookmarks),
      settingsWithAi(),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.searchMode).toBe("topic");
    expect(result.hits.map((hit) => hit.bookmark.id)).toEqual(["dajuseo"]);
    expect(result.hits[0]).toMatchObject({
      matchKind: "direct",
      evidenceField: "title",
      score: 100,
    });
  });

  it("returns every direct topic match without an artificial result cap", async () => {
    const vpnBookmarks: BookmarkRecord[] = Array.from(
      { length: 45 },
      (_, index) => ({
        id: `vpn-${index + 1}`,
        title: `VPN Service ${index + 1}`,
        url: `https://vpn-${index + 1}.example.com/`,
        source: "preview" as const,
        folderPath: ["书签栏"],
        tags: [],
        aiTags: ["VPN服务"],
        summary: "提供虚拟专用网络连接服务",
      }),
    );
    const vpnPlan: AiSearchPlan = {
      searchMode: "topic",
      interpretation: "浏览所有与 VPN 直接相关的书签",
      exactTerms: ["VPN"],
      equivalentTerms: ["Virtual Private Network", "虚拟专用网络"],
      relatedTerms: ["WireGuard", "加密隧道"],
      requiredConcepts: [],
      downrankTerms: [],
    };
    const fetchMock = vi.fn(() => completion(vpnPlan));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveSmartSearch(
      "VPN",
      vpnBookmarks,
      buildWorkspaceFromBookmarks(vpnBookmarks),
      settingsWithAi(),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.action).toBe("candidates");
    expect(result.hits).toHaveLength(45);
    expect(result.hits.every((hit) => hit.matchKind === "direct")).toBe(true);
  });

  it("returns an explicit error instead of local results when AI planning fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await resolveSmartSearch(
      "域名购买",
      domainBookmarks,
      domainWorkspace,
      settingsWithAi(),
    );

    expect(result.action).toBe("error");
    expect(result.hits).toEqual([]);
    expect(result.message).toContain("network down");
  });
});
