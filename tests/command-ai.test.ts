import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import { buildWorkspaceFromBookmarks } from "@/domain/layout";
import type { BookmarkRecord } from "@/domain/types";
import {
  compileNaturalLanguageCommand,
  resolveSemanticBookmarkMatches,
} from "@/services/commandAi";

const settings = {
  ...DEFAULT_SETTINGS,
  provider: {
    ...DEFAULT_SETTINGS.provider,
    enabled: true,
    apiKey: "test-only-key",
  },
};

const bookmark = (index: number): BookmarkRecord => ({
  id: `bookmark-${index}`,
  title: index % 2 === 0 ? `跨境工具 ${index}` : `普通工具 ${index}`,
  url: `https://example-${index}.com`,
  source: "preview",
  folderPath: [],
  tags: [],
  aiTags: index % 2 === 0 ? ["出海"] : [],
});

describe("AI bookmark command compiler", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("compiles natural language into an allowlisted structured command", async () => {
    const workspace = buildWorkspaceFromBookmarks([bookmark(1)]);
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                operation: "dissolveOversizedGroups",
                summary: "解散书签数量超过五个的小分组",
                threshold: 5,
                category: null,
                deleteEmptyGroups: true,
                createGroup: false,
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      compileNaturalLanguageCommand(
        "/把超过5个书签的小分组全部解散",
        settings,
        workspace,
      ),
    ).resolves.toMatchObject({
      operation: "dissolveOversizedGroups",
      threshold: 5,
      createGroup: false,
    });

    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(request.messages[0].content).toContain("只能选择下列 operation");
    expect(request.messages[1].content).toContain("currentInformationArchitecture");
    expect(String((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)).not.toContain(
      "test-only-key",
    );
  });

  it("handles help, statistics, undo and redo locally without a Provider call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const workspace = buildWorkspaceFromBookmarks([bookmark(1)]);

    await expect(compileNaturalLanguageCommand("/帮助", DEFAULT_SETTINGS, workspace)).resolves.toMatchObject({ operation: "showHelp" });
    await expect(compileNaturalLanguageCommand("/统计", DEFAULT_SETTINGS, workspace)).resolves.toMatchObject({ operation: "showStatistics" });
    await expect(compileNaturalLanguageCommand("/撤销", DEFAULT_SETTINGS, workspace)).resolves.toMatchObject({ operation: "undoLastCommand" });
    await expect(compileNaturalLanguageCommand("/重做", DEFAULT_SETTINGS, workspace)).resolves.toMatchObject({ operation: "redoLastCommand" });
    await expect(compileNaturalLanguageCommand("/help", DEFAULT_SETTINGS, workspace)).resolves.toMatchObject({ operation: "showHelp" });
    await expect(compileNaturalLanguageCommand("/stats", DEFAULT_SETTINGS, workspace)).resolves.toMatchObject({ operation: "showStatistics" });
    await expect(compileNaturalLanguageCommand("/undo", DEFAULT_SETTINGS, workspace)).resolves.toMatchObject({ operation: "undoLastCommand" });
    await expect(compileNaturalLanguageCommand("/redo", DEFAULT_SETTINGS, workspace)).resolves.toMatchObject({ operation: "redoLastCommand" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("screens semantic matches in batches and ignores invented IDs", async () => {
    const bookmarks = Array.from({ length: 51 }, (_, index) => bookmark(index + 1));
    const workspace = buildWorkspaceFromBookmarks(bookmarks);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  matches: [
                    { id: "bookmark-2", reason: "AI 标签包含出海" },
                    { id: "invented-id", reason: "虚构 ID" },
                  ],
                }),
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  matches: [{ id: "bookmark-51", reason: "标题明确相关" }],
                }),
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const progress = vi.fn();

    await expect(
      resolveSemanticBookmarkMatches(
        "出海相关",
        settings,
        bookmarks,
        workspace,
        progress,
      ),
    ).resolves.toEqual([
      { id: "bookmark-2", reason: "AI 标签包含出海" },
      { id: "bookmark-51", reason: "标题明确相关" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });
});
