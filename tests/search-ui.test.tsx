import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchFeedback } from "@/app/App";
import { buildWorkspaceFromBookmarks } from "@/domain/layout";
import type { BookmarkRecord, SearchResolution } from "@/domain/types";

const bookmark: BookmarkRecord = {
  id: "namesilo",
  title: "NameSilo",
  url: "https://www.namesilo.com/",
  source: "preview",
  folderPath: ["书签栏"],
  tags: [],
  aiTags: ["域名注册商"],
  summary: "用于注册和购买域名",
};
const workspace = buildWorkspaceFromBookmarks([bookmark]);

describe("bookmark search result panel", () => {
  it("prompts the user to enable AI without showing local candidates", () => {
    const onOpenAiSettings = vi.fn();
    const resolution: SearchResolution = {
      query: "域名购买",
      source: "ai",
      confidence: 0,
      hits: [],
      action: "unavailable",
      message: "书签语义搜索需要 AI 功能。请先在设置中启用 Provider 并填写 API Key。",
    };

    render(
      <SearchFeedback
        resolution={resolution}
        workspace={workspace}
        onFocus={vi.fn()}
        onOpenAiSettings={onOpenAiSettings}
      />,
    );

    expect(screen.getByText("书签搜索不可用")).toBeInTheDocument();
    expect(screen.queryByText("NameSilo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 设置" }));
    expect(onOpenAiSettings).toHaveBeenCalledOnce();
  });

  it("shows the interpretation, per-result relevance and evidence", () => {
    const resolution: SearchResolution = {
      query: "域名购买",
      source: "ai",
      searchMode: "precise",
      confidence: 0.94,
      action: "focus",
      interpretation: "查找可以注册或购买域名的服务",
      hits: [
        {
          bookmark,
          score: 94,
          relevance: 0.94,
          reasons: ["标签和摘要明确说明是域名注册商"],
          matchedTerms: ["域名", "注册商"],
          matchKind: "precise",
          evidenceField: "tags",
          categoryId: workspace.categories[0]?.id,
        },
      ],
    };

    render(
      <SearchFeedback
        resolution={resolution}
        workspace={workspace}
        onFocus={vi.fn()}
        onOpenAiSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("查找可以注册或购买域名的服务")).toBeInTheDocument();
    expect(screen.getByText("完整条件匹配")).toBeInTheDocument();
    expect(screen.getByText("条件完整")).toBeInTheDocument();
    expect(screen.getByText("标签和摘要明确说明是域名注册商")).toBeInTheDocument();
    expect(screen.getByText("命中：域名、注册商")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "书签搜索结果列表" }),
    ).toContainElement(screen.getByRole("button", { name: /NameSilo/ }));
    expect(screen.getByRole("button", { name: /NameSilo/ })).toHaveAttribute(
      "data-search-bookmark-id",
      "namesilo",
    );
  });

  it("labels a topic-only search as a related-bookmark browse", () => {
    const resolution: SearchResolution = {
      query: "VPN",
      source: "ai",
      searchMode: "topic",
      confidence: 0.72,
      action: "candidates",
      interpretation: "浏览所有与 VPN 直接相关的书签",
      hits: [
        {
          bookmark,
          score: 72,
          relevance: 0.72,
          reasons: ["标签显示与 VPN 主题直接相关"],
          matchedTerms: ["VPN"],
          matchKind: "direct",
          evidenceField: "tags",
          categoryId: workspace.categories[0]?.id,
        },
      ],
    };

    render(
      <SearchFeedback
        resolution={resolution}
        workspace={workspace}
        onFocus={vi.fn()}
        onOpenAiSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("找到 1 个相关书签")).toBeInTheDocument();
    expect(screen.getByText("证据分层排序")).toBeInTheDocument();
    expect(screen.getByText("直接命中")).toBeInTheDocument();
  });
});
