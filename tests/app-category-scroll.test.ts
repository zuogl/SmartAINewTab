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
  createGroup,
  moveBookmarkInWorkspace,
} from "@/domain/layout";
import {
  CATEGORY_ICON_VALUES,
  type BookmarkRecord,
} from "@/domain/types";
import { database } from "@/services/database";
import type { AppRuntime } from "@/services/runtime";
import { saveSettings, saveWorkspace } from "@/services/storage";

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
    id: "bookmark-one",
    title: "One",
    url: "https://one.example.com",
    source: "preview",
    folderPath: [],
    tags: [],
    aiTags: [],
    dateAdded: 2,
  },
  {
    id: "bookmark-two",
    title: "Two",
    url: "https://two.example.com",
    source: "preview",
    folderPath: [],
    tags: [],
    aiTags: [],
    dateAdded: 1,
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

const CATEGORY_TEST_SETTINGS = {
  ...DEFAULT_SETTINGS,
  widgets: {
    ...DEFAULT_SETTINGS.widgets,
    enabled: false,
  },
};

describe("App cross-category content", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await Promise.all([
      database.jobs.clear(),
      database.metadata.clear(),
      saveSettings(CATEGORY_TEST_SETTINGS),
    ]);
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

  it("renders only the active category and crosses categories at a scroll boundary", async () => {
    const workspace = buildWorkspaceFromBookmarks(bookmarks);
    const tools = createCategory(
      "工具",
      workspace.categories.map((category) => category.icon),
    );
    const toolsGroup = createGroup("常用工具");
    tools.groups.push(toolsGroup);
    workspace.categories.push(tools);
    moveBookmarkInWorkspace(
      workspace,
      "bookmark-two",
      tools.id,
      toolsGroup.id,
    );
    workspace.activeCategoryId = workspace.categories[0]!.id;
    await saveWorkspace(workspace);

    const { container } = render(createElement(App, { runtime }));
    await waitFor(() =>
      expect(container.querySelectorAll("[data-category-section]")).toHaveLength(
        1,
      ),
    );
    expect(
      screen.queryByRole("button", { name: "搜索" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "拖拽分组" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("未分类书签与分组")).toBeInTheDocument();
    expect(screen.queryByLabelText("工具书签与分组")).not.toBeInTheDocument();
    const viewport = container.querySelector<HTMLElement>(
      ".workspace-scroll-region",
    )!;
    const searchBar = container.querySelector<HTMLElement>(".search-bar")!;
    const initialSection = container.querySelector<HTMLElement>(
      "[data-category-section]",
    )!;
    expect(viewport).toContainElement(initialSection);
    expect(viewport).not.toContainElement(searchBar);
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(bounds(0, 900));
    vi.spyOn(initialSection, "getBoundingClientRect").mockReturnValue(
      bounds(-700, 899),
    );
    const initialRailButton = container.querySelector<HTMLButtonElement>(
      `[data-rail-category-id="${workspace.categories[0]!.id}"]`,
    )!;
    const targetRailButton = container.querySelector<HTMLButtonElement>(
      `[data-rail-category-id="${tools.id}"]`,
    )!;
    expect(initialRailButton).toHaveAttribute("aria-current", "true");
    expect(initialRailButton.querySelector("span")).toBeNull();
    expect(targetRailButton.querySelector("span")).toBeNull();

    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scrollIntoView.mockClear();
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    fireEvent.wheel(viewport, { deltaY: 120 });
    expect(initialRailButton).toHaveAttribute("aria-current", "true");
    now.mockReturnValue(1_050);
    fireEvent.wheel(viewport, { deltaY: 80 });
    expect(initialRailButton).toHaveAttribute("aria-current", "true");
    now.mockReturnValue(1_250);
    fireEvent.wheel(viewport, { deltaY: 120 });

    await waitFor(() => {
      expect(targetRailButton).toHaveAttribute("aria-current", "true");
      expect(container.querySelectorAll("[data-category-section]")).toHaveLength(
        1,
      );
      expect(
        container.querySelector(`[data-category-id="${tools.id}"]`),
      ).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("未分类书签与分组")).not.toBeInTheDocument();
    expect(screen.getByLabelText("工具书签与分组")).toBeInTheDocument();
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "auto",
        block: "start",
      }),
    );

    vi.spyOn(targetRailButton, "getBoundingClientRect").mockReturnValue(
      bounds(100, 144, 800, 842),
    );
    fireEvent.mouseEnter(targetRailButton);
    const tooltip = container.querySelector<HTMLElement>(
      ".rail-category-tooltip",
    );
    expect(tooltip).toHaveTextContent("工具");
    expect(tooltip).toHaveStyle({
      top: "122px",
      right: `${window.innerWidth - 800 + 10}px`,
    });
    fireEvent.mouseLeave(targetRailButton);
    expect(container.querySelector(".rail-category-tooltip")).toBeNull();

    const groupCard = screen.getByLabelText("常用工具分组");

    const openGroupButton = within(groupCard).getByRole("button", {
      name: "常用工具",
    });
    fireEvent.click(openGroupButton);
    const groupDialog = await screen.findByRole("dialog", {
      name: "常用工具",
    });
    expect(within(groupDialog).getByRole("button", { name: "Two" })).toBeInTheDocument();
    fireEvent.click(
      within(groupDialog).getByRole("button", { name: "关闭分组" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "常用工具" }),
      ).not.toBeInTheDocument(),
    );

    const groupMenuButton = within(groupCard).getByRole("button", {
      name: "分组菜单",
    });
    fireEvent.click(groupMenuButton);
    expect(
      screen.getByRole("menu", { name: "常用工具分组菜单" }),
    ).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    await waitFor(() =>
      expect(
        screen.queryByRole("menu", { name: "常用工具分组菜单" }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(groupMenuButton);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("menu", { name: "常用工具分组菜单" }),
      ).not.toBeInTheDocument(),
    );

    scrollIntoView.mockClear();
    fireEvent.click(targetRailButton);

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      }),
    );
    expect(container.querySelector(".category-header")).toBeNull();

    fireEvent.contextMenu(targetRailButton);
    const menu = await screen.findByRole("menu", {
      name: "工具大分类菜单",
    });
    expect(
      within(menu).getByRole("menuitem", { name: "新建分组" }),
    ).toBeInTheDocument();
    const editCategory = within(menu).getByRole("menuitem", {
      name: "编辑名称与图标",
    });
    expect(editCategory).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "删除大分类" }),
    ).toBeInTheDocument();

    fireEvent.click(editCategory);
    const editor = await screen.findByRole("dialog", {
      name: "编辑大分类",
    });
    expect(within(editor).getAllByRole("radio")).toHaveLength(
      CATEGORY_ICON_VALUES.length,
    );
    expect(
      within(editor).getByRole("region", { name: "AI" }),
    ).toBeInTheDocument();
    expect(within(editor).getByDisplayValue("工具")).toBeInTheDocument();
  });

  it("marks the category rail for right-edge reveal when it is not pinned", async () => {
    await saveSettings({
      ...CATEGORY_TEST_SETTINGS,
      screenDisplay: {
        ...DEFAULT_SETTINGS.screenDisplay,
        alwaysShowCategoryRail: false,
      },
    });

    const { container } = render(createElement(App, { runtime }));
    await screen.findByLabelText("未分类书签与分组");

    expect(container.querySelector(".category-rail-reveal")).toHaveClass(
      "auto-hide",
    );
  });

  it("treats widgets as a separate first screen and hides them in category view", async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      widgets: {
        ...DEFAULT_SETTINGS.widgets,
        enabled: true,
        activeIds: ["bookmark-stats", "recent-bookmarks"],
      },
    });
    const workspace = buildWorkspaceFromBookmarks(bookmarks);
    await saveWorkspace(workspace);

    const { container } = render(createElement(App, { runtime }));
    const dashboard = await screen.findByLabelText("首屏小部件");
    const widgetButton = screen.getByRole("button", { name: "小部件中心" });
    const categoryButton = container.querySelector<HTMLButtonElement>(
      `[data-rail-category-id="${workspace.categories[0]!.id}"]`,
    )!;
    const viewport = container.querySelector<HTMLElement>(
      ".workspace-scroll-region",
    )!;

    expect(widgetButton).toHaveAttribute("aria-current", "true");
    expect(categoryButton).not.toHaveAttribute("aria-current");
    expect(container.querySelector("[data-category-section]")).toBeNull();
    expect(widgetButton.nextElementSibling).toHaveClass("rail-widget-divider");

    fireEvent.click(categoryButton);
    await screen.findByLabelText("未分类书签与分组");
    expect(dashboard).not.toBeInTheDocument();
    expect(categoryButton).toHaveAttribute("aria-current", "true");
    expect(container.querySelector(".widget-dashboard")).toBeNull();

    fireEvent.click(widgetButton);
    await screen.findByLabelText("首屏小部件");
    expect(container.querySelector("[data-category-section]")).toBeNull();

    fireEvent.wheel(viewport, { deltaY: 120 });
    await screen.findByLabelText("未分类书签与分组");
    expect(container.querySelector(".widget-dashboard")).toBeNull();
    expect(categoryButton).toHaveAttribute("aria-current", "true");
  });

  it("renders groups and loose bookmarks in one mixed draggable order", async () => {
    const workspace = buildWorkspaceFromBookmarks(bookmarks);
    const category = workspace.categories[0]!;
    const group = createGroup("常用");
    category.groups.push(group);
    moveBookmarkInWorkspace(
      workspace,
      "bookmark-two",
      category.id,
      group.id,
    );
    category.rootOrder = [group.id, "bookmark-one"];
    await saveWorkspace(workspace);

    const { container } = render(createElement(App, { runtime }));
    await screen.findByLabelText("常用分组");
    const items = Array.from(
      container.querySelectorAll(
        ".category-item-grid > [data-group-id], .category-item-grid > [data-bookmark-id]",
      ),
    );

    expect(
      items.map(
        (item) =>
          item.getAttribute("data-group-id") ??
          item.getAttribute("data-bookmark-id"),
      ),
    ).toEqual([group.id, "bookmark-one"]);
    expect(
      container.querySelector("[data-group-id] .group-tile"),
    ).toHaveAttribute("tabindex", "0");
  });

  it("hides an empty unclassified category and activates the first visible category", async () => {
    const workspace = buildWorkspaceFromBookmarks(bookmarks);
    const uncategorizedId = workspace.categories[0]!.id;
    const tools = createCategory(
      "工具",
      workspace.categories.map((category) => category.icon),
    );
    workspace.categories.push(tools);
    moveBookmarkInWorkspace(workspace, "bookmark-one", tools.id);
    moveBookmarkInWorkspace(workspace, "bookmark-two", tools.id);
    workspace.activeCategoryId = uncategorizedId;
    await Promise.all([
      saveWorkspace(workspace),
      saveSettings({
        ...CATEGORY_TEST_SETTINGS,
        screenDisplay: {
          ...DEFAULT_SETTINGS.screenDisplay,
          showEmptyUncategorizedCategory: false,
        },
      }),
    ]);

    const { container } = render(createElement(App, { runtime }));

    await screen.findByLabelText("工具书签与分组");
    expect(screen.queryByLabelText("未分类书签与分组")).not.toBeInTheDocument();
    expect(
      container.querySelector(`[data-rail-category-id="${uncategorizedId}"]`),
    ).toBeNull();
    expect(
      container.querySelector(`[data-rail-category-id="${tools.id}"]`),
    ).toHaveAttribute("aria-current", "true");
  });

  it("lists evidence-matched search results and opens a grouped bookmark before highlighting it", async () => {
    const searchBookmarks: BookmarkRecord[] = Array.from(
      { length: 8 },
      (_, index) => ({
        id: `seo-${index + 1}`,
        title: `SEO ${index + 1}`,
        url: `https://seo-${index + 1}.example.com`,
        source: "preview",
        folderPath: [],
        tags: ["SEO"],
        aiTags: [],
      }),
    );
    const workspace = buildWorkspaceFromBookmarks(searchBookmarks);
    const tools = createCategory(
      "工具",
      workspace.categories.map((category) => category.icon),
    );
    const seoGroup = createGroup("SEO 工具");
    tools.groups.push(seoGroup);
    workspace.categories.push(tools);
    moveBookmarkInWorkspace(workspace, "seo-8", tools.id, seoGroup.id);
    await Promise.all([
      saveWorkspace(workspace),
      saveSettings({
        ...DEFAULT_SETTINGS,
        provider: {
          ...DEFAULT_SETTINGS.provider,
          enabled: true,
          endpoint: "https://provider.example.com/v1",
          model: "test-model",
          apiKey: "test-only-key",
        },
        widgets: {
          ...DEFAULT_SETTINGS.widgets,
          enabled: false,
        },
      }),
    ]);
    const searchRuntime: AppRuntime = {
      ...runtime,
      loadBookmarks: vi.fn(async () => structuredClone(searchBookmarks)),
    };
    let providerCall = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/v1/backgrounds")) {
          return Response.json({ backgrounds: [] });
        }
        expect(url).toContain("/chat/completions");
        providerCall += 1;
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify(
                  providerCall === 1
                    ? {
                        searchMode: "topic",
                        interpretation: "查找 SEO 相关书签",
                        exactTerms: ["SEO"],
                        equivalentTerms: ["Search Engine Optimization", "搜索引擎优化"],
                        relatedTerms: ["关键词研究", "排名监控"],
                        requiredConcepts: [],
                        downrankTerms: [],
                      }
                    : {
                        unexpected: "search should only make one planning call",
                      },
                ),
              },
            },
          ],
        });
      }),
    );

    const { container } = render(createElement(App, { runtime: searchRuntime }));
    fireEvent.click(await screen.findByRole("button", { name: "Bookmarks" }));
    const input = screen.getByRole("textbox", { name: "搜索全部书签" });
    fireEvent.change(input, { target: { value: "SEO" } });
    fireEvent.submit(input.closest("form")!);

    const feedback = await screen.findByLabelText("书签搜索结果");
    expect(providerCall).toBe(1);
    const searchArea = container.querySelector<HTMLElement>(".search-area")!;
    expect(searchArea).toContainElement(input.closest(".search-bar"));
    expect(searchArea).toContainElement(feedback);
    expect(feedback.parentElement).toBe(searchArea);
    expect(within(feedback).getByText("找到 8 个相关书签")).toBeInTheDocument();
    expect(within(feedback).getByText("查找 SEO 相关书签")).toBeInTheDocument();
    expect(within(feedback).getAllByRole("button")).toHaveLength(8);
    expect(within(feedback).getByText(/工具 \/ SEO 工具/)).toBeInTheDocument();

    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scrollIntoView.mockClear();
    fireEvent.click(
      within(feedback).getByRole("button", { name: /SEO 8/ }),
    );

    const dialog = await screen.findByRole("dialog", { name: "SEO 工具" });
    const target = within(dialog).getByRole("button", { name: "SEO 8" });
    await waitFor(() => expect(target).toHaveClass("highlighted"));
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  });

  it("uses the new-tab preference for bookmark tiles and keeps modifier clicks explicit", async () => {
    const workspace = buildWorkspaceFromBookmarks(bookmarks);
    await Promise.all([
      saveWorkspace(workspace),
      saveSettings({
        ...CATEGORY_TEST_SETTINGS,
        openInNewTab: false,
      }),
    ]);

    render(createElement(App, { runtime }));
    const bookmark = await screen.findByRole("button", { name: "One" });

    fireEvent.click(bookmark);
    expect(runtime.openUrl).toHaveBeenLastCalledWith(
      "https://one.example.com",
      false,
    );

    fireEvent.click(bookmark, { ctrlKey: true });
    expect(runtime.openUrl).toHaveBeenLastCalledWith(
      "https://one.example.com",
      true,
    );

    fireEvent(
      bookmark,
      new MouseEvent("auxclick", { bubbles: true, button: 1 }),
    );
    expect(runtime.openUrl).toHaveBeenLastCalledWith(
      "https://one.example.com",
      true,
    );
  });

  it("applies the new-tab preference inside groups", async () => {
    const workspace = buildWorkspaceFromBookmarks(bookmarks);
    const group = createGroup("常用");
    workspace.categories[0]!.groups.push(group);
    moveBookmarkInWorkspace(
      workspace,
      "bookmark-two",
      workspace.categories[0]!.id,
      group.id,
    );
    await Promise.all([
      saveWorkspace(workspace),
      saveSettings({
        ...CATEGORY_TEST_SETTINGS,
        openInNewTab: true,
      }),
    ]);

    render(createElement(App, { runtime }));
    const groupCard = await screen.findByLabelText("常用分组");
    fireEvent.click(within(groupCard).getByRole("button", { name: "常用" }));
    const dialog = await screen.findByRole("dialog", { name: "常用" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Two" }));
    expect(runtime.openUrl).toHaveBeenLastCalledWith(
      "https://two.example.com",
      true,
    );
  });

  it("applies the new-tab preference to recent bookmark widgets", async () => {
    const workspace = buildWorkspaceFromBookmarks(bookmarks);
    await Promise.all([
      saveWorkspace(workspace),
      saveSettings({
        ...DEFAULT_SETTINGS,
        openInNewTab: false,
        widgets: {
          ...DEFAULT_SETTINGS.widgets,
          activeIds: ["recent-bookmarks", "bookmark-stats"],
        },
      }),
    ]);

    render(createElement(App, { runtime }));
    const dashboard = await screen.findByLabelText("首屏小部件");
    fireEvent.click(
      within(dashboard).getByRole("button", { name: /One/ }),
    );

    expect(runtime.openUrl).toHaveBeenLastCalledWith(
      "https://one.example.com",
      false,
    );
  });
});

function bounds(
  top: number,
  bottom: number,
  left = 0,
  right = 900,
): DOMRect {
  return {
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}
