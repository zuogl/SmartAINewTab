import { beforeEach, describe, expect, it } from "vitest";
import {
  database,
  enrichWithMetadata,
  saveEditableTags,
  saveSuggestedOrganization,
} from "@/services/database";
import type { BookmarkRecord } from "@/domain/types";

describe("editable bookmark tags", () => {
  beforeEach(async () => {
    await database.metadata.clear();
  });

  it("persists AI and manual tags independently without losing metadata", async () => {
    await database.metadata.put({
      bookmarkId: "bookmark-1",
      tags: ["旧 AI 标签"],
      manualTags: ["旧手动标签"],
      summary: "保留摘要",
      suggestedCategory: "工作",
      suggestedGroup: "分析",
      updatedAt: 1,
    });

    await saveEditableTags(
      "bookmark-1",
      [" 常用 ", "常用", "客户"],
      [" SEO ", "seo", "域名分析"],
    );

    expect(await database.metadata.get("bookmark-1")).toMatchObject({
      tags: ["SEO", "域名分析"],
      manualTags: ["常用", "客户"],
      summary: "保留摘要",
      suggestedCategory: "工作",
      suggestedGroup: "分析",
    });
  });

  it("returns both tag types when bookmark metadata is enriched", async () => {
    const bookmark: BookmarkRecord = {
      id: "bookmark-1",
      title: "Example",
      url: "https://example.com",
      source: "chrome",
      folderPath: [],
      tags: [],
      aiTags: [],
    };
    await saveEditableTags("bookmark-1", ["手动"], ["AI"]);

    await expect(enrichWithMetadata([bookmark])).resolves.toMatchObject([
      {
        tags: ["手动"],
        aiTags: ["AI"],
      },
    ]);
  });

  it("updates a full organization result atomically", async () => {
    await database.metadata.put({
      bookmarkId: "bookmark-1",
      tags: ["AI"],
      suggestedCategory: "旧分类",
      suggestedGroup: "旧分组",
      updatedAt: 1,
    });

    await expect(
      saveSuggestedOrganization([
        {
          bookmarkId: "bookmark-1",
          category: "开发技术",
          group: undefined,
        },
        {
          bookmarkId: "missing",
          category: "效率工具",
        },
      ]),
    ).rejects.toThrow("缺少书签 missing");
    expect(await database.metadata.get("bookmark-1")).toMatchObject({
      suggestedCategory: "旧分类",
      suggestedGroup: "旧分组",
      updatedAt: 1,
    });

    await saveSuggestedOrganization([
      {
        bookmarkId: "bookmark-1",
        category: "开发技术",
      },
    ]);
    expect(await database.metadata.get("bookmark-1")).toMatchObject({
      suggestedCategory: "开发技术",
    });
    expect(
      (await database.metadata.get("bookmark-1"))?.suggestedGroup,
    ).toBeUndefined();
  });
});
