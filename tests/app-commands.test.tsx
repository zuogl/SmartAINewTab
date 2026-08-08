import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import {
  buildWorkspaceFromBookmarks,
  createCategory,
} from "@/domain/layout";
import type { BookmarkRecord } from "@/domain/types";
import { database } from "@/services/database";
import type { AppRuntime } from "@/services/runtime";
import {
  clearCommandHistory,
  loadWorkspace,
  saveSettings,
  saveWorkspace,
} from "@/services/storage";

vi.mock("@/services/favicon", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/favicon")>();
  return {
    ...actual,
    preloadFaviconCollection: vi.fn(async () => undefined),
    resolveFavicon: vi.fn(async () => ({ status: "failed" as const })),
  };
});

const bookmarks: BookmarkRecord[] = [
  {
    id: "overseas-one",
    title: "跨境业务工具",
    url: "https://overseas-one.example.com",
    source: "preview",
    folderPath: [],
    tags: [],
    aiTags: ["出海", "跨境业务"],
  },
  {
    id: "overseas-two",
    title: "海外营销平台",
    url: "https://overseas-two.example.com",
    source: "preview",
    folderPath: [],
    tags: [],
    aiTags: ["海外营销"],
  },
];

const runtime: AppRuntime = {
  kind: "preview",
  loadBookmarks: vi.fn(async () => structuredClone(bookmarks)),
  saveBookmark: vi.fn(),
  deleteBookmark: vi.fn(async () => undefined),
  restoreBookmarks: vi.fn(async () => []),
  openUrl: vi.fn(async () => undefined),
  faviconUrl: vi.fn(() => undefined),
  requestHostPermissions: vi.fn(async () => true),
  notifyBackground: vi.fn(async () => undefined),
};

describe("App natural-language slash commands", () => {
  beforeEach(async () => {
    localStorage.clear();
    await Promise.all([
      database.jobs.clear(),
      database.metadata.clear(),
      database.backgrounds.clear(),
    ]);
    await clearCommandHistory();
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      (handle: number) => window.clearTimeout(handle),
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows slash suggestions before any mutation", async () => {
    const workspace = buildWorkspaceFromBookmarks(bookmarks);
    await saveWorkspace(workspace);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ backgrounds: [] })),
    );

    render(createElement(App, { runtime }));
    const input = await screen.findByRole("textbox", { name: "搜索网页" });
    fireEvent.change(input, { target: { value: "/" } });

    expect(screen.getByLabelText("自然语言命令示例")).toBeInTheDocument();
    expect(screen.getByText("AI 只生成计划，确认后才执行")).toBeInTheDocument();
    expect(await loadWorkspace()).toEqual(expect.objectContaining({
      categories: expect.any(Array),
    }));
  });

  it("compiles, previews, selectively executes and undoes a semantic command", async () => {
    const workspace = buildWorkspaceFromBookmarks(bookmarks);
    const overseas = createCategory(
      "出海",
      workspace.categories.map((category) => category.icon),
    );
    workspace.categories.push(overseas);
    await Promise.all([
      saveWorkspace(workspace),
      saveSettings({
        ...DEFAULT_SETTINGS,
        provider: {
          ...DEFAULT_SETTINGS.provider,
          enabled: true,
          apiKey: "test-only-key",
        },
      }),
    ]);
    let providerCall = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/backgrounds")) {
        return Response.json({ backgrounds: [] });
      }
      if (url.includes("api.open-meteo.com")) {
        return Response.json({
          current: { temperature_2m: 25 },
          daily: { time: ["2026-08-03"] },
        });
      }
      if (url.includes("api.frankfurter.dev")) {
        return Response.json({ date: "2026-08-03", rate: 0.14 });
      }
      if (url.includes("top.baidu.com")) {
        return Response.json({ data: { cards: [] } });
      }
      expect(url).toContain("/chat/completions");
      providerCall += 1;
      if (providerCall === 1) {
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  operation: "moveSemanticBookmarks",
                  summary: "移动出海相关书签到出海分类",
                  query: "出海相关",
                  targetCategory: "出海",
                  targetGroup: null,
                  createCategory: false,
                  createGroup: false,
                }),
              },
            },
          ],
        });
      }
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                matches: [
                  { id: "overseas-one", reason: "标签包含出海和跨境业务" },
                  { id: "overseas-two", reason: "标题包含海外营销" },
                ],
              }),
            },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(App, { runtime }));
    const input = await screen.findByRole("textbox", { name: "搜索网页" });
    const command = "/把所有出海相关的书签移动到出海分类，不创建小分组";
    fireEvent.change(input, { target: { value: command } });
    fireEvent.submit(input.closest("form")!);

    const panel = await screen.findByLabelText("AI 命令执行计划");
    expect(
      (await within(panel).findAllByText("按语义移动书签")).length,
    ).toBeGreaterThan(0);
    expect(within(panel).getByText("受影响书签 2/2")).toBeInTheDocument();
    const scrollRegion = panel.querySelector<HTMLElement>(".command-plan-scroll")!;
    const footer = panel.querySelector<HTMLElement>(".command-plan-footer")!;
    const candidateList = within(panel).getByLabelText("命令候选书签");
    const confirmButton = within(panel).getByRole("button", { name: "确认执行" });
    expect(scrollRegion).toContainElement(candidateList);
    expect(scrollRegion).not.toContainElement(confirmButton);
    expect(footer).toContainElement(confirmButton);
    const checkboxes = within(panel).getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]!);
    expect(within(panel).getByText("受影响书签 1/2")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "确认执行" }));
    await waitFor(async () => {
      const saved = await loadWorkspace();
      const target = saved?.categories.find((category) => category.title === "出海");
      expect(target?.bookmarkIds).toContain("overseas-one");
      expect(target?.bookmarkIds).not.toContain("overseas-two");
      expect(saved?.placementOverrides?.["overseas-one"]?.locked).toBe(true);
    });

    fireEvent.click(
      await within(panel).findByRole("button", { name: "撤销本次操作" }),
    );
    await waitFor(async () => {
      const saved = await loadWorkspace();
      expect(saved?.categories[0]?.bookmarkIds).toEqual([
        "overseas-one",
        "overseas-two",
      ]);
    });
    expect(providerCall).toBe(2);
  });
});
