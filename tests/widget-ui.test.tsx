import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import { WidgetDashboard } from "@/app/WidgetDashboard";
import { WidgetSettings } from "@/app/WidgetSettings";
import { classicQuoteForDate } from "@/domain/classicQuotes";
import { DEFAULT_WIDGET_PREFERENCES } from "@/domain/widgets";
import { buildWorkspaceFromBookmarks } from "@/domain/layout";
import type { BookmarkRecord, WidgetPreferences } from "@/domain/types";
import { I18nProvider } from "@/i18n";

const bookmarks: BookmarkRecord[] = [
  {
    id: "bookmark-1",
    title: "Example",
    url: "https://example.com",
    source: "preview",
    folderPath: [],
    tags: ["示例"],
    aiTags: ["工具"],
    dateAdded: Date.now(),
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function WidgetSettingsHarness() {
  const [value, setValue] = useState(DEFAULT_WIDGET_PREFERENCES);
  return <WidgetSettings value={value} onChange={setValue} />;
}

describe("widget user interface", () => {
  it("shows the full widget library and enforces the eight-widget ceiling", () => {
    render(<WidgetSettingsHarness />);
    const library = screen.getByLabelText("全部小部件");
    expect(within(library).getAllByRole("article")).toHaveLength(13);
    expect(screen.getByText("6")).toBeInTheDocument();

    fireEvent.click(within(library).getByRole("button", { name: /AI 整理进度/ }));
    fireEvent.click(within(library).getByRole("button", { name: /最近收藏/ }));
    expect(screen.getByText("8")).toBeInTheDocument();

    fireEvent.click(within(library).getByRole("button", { name: /标签雷达/ }));
    expect(screen.getByRole("status")).toHaveTextContent("最多展示 8 个");
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("renders at most eight widgets in one first-screen dashboard with count-based size", () => {
    const preferences: WidgetPreferences = {
      ...DEFAULT_WIDGET_PREFERENCES,
      activeIds: [
        "calendar",
        "world-clock",
        "bookmark-stats",
        "ai-progress",
        "recent-bookmarks",
        "tag-overview",
        "focus-timer",
        "daily-quote",
      ],
    };
    const { container } = render(
      <WidgetDashboard
        preferences={preferences}
        healthPreferences={DEFAULT_SETTINGS.bookmarkHealth}
        now={new Date(2026, 7, 3, 19, 20, 30)}
        bookmarks={bookmarks}
        workspace={buildWorkspaceFromBookmarks(bookmarks)}
        jobs={[]}
        dailyQuote={classicQuoteForDate(new Date(2026, 7, 3))}
        onOpen={vi.fn()}
        onOpenBookmark={vi.fn()}
        onManage={vi.fn()}
        onOpenHealth={vi.fn()}
      />,
    );
    const dashboard = screen.getByLabelText("首屏小部件");
    expect(dashboard).toHaveClass("widget-count-8");
    const widgets = container.querySelectorAll(".home-widget");
    expect(widgets).toHaveLength(8);
    for (const widget of widgets) {
      expect(widget).toHaveAttribute("data-size", "compact");
    }
  });

  it("localizes widget titles and internal status copy in English", () => {
    const preferences: WidgetPreferences = {
      ...DEFAULT_WIDGET_PREFERENCES,
      activeIds: ["calendar", "bookmark-stats", "ai-progress", "focus-timer"],
    };
    render(
      <I18nProvider language="en">
        <WidgetDashboard
          preferences={preferences}
          healthPreferences={DEFAULT_SETTINGS.bookmarkHealth}
          now={new Date(2026, 7, 3, 19, 20, 30)}
          bookmarks={bookmarks}
          workspace={buildWorkspaceFromBookmarks(bookmarks)}
          jobs={[]}
          dailyQuote={classicQuoteForDate(new Date(2026, 7, 3))}
          onOpen={vi.fn()}
          onOpenBookmark={vi.fn()}
          onManage={vi.fn()}
          onOpenHealth={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByLabelText("Active widgets")).toBeInTheDocument();
    expect(screen.getByText("August 2026")).toBeInTheDocument();
    expect(screen.getByText("All bookmarks")).toBeInTheDocument();
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    expect(screen.getByText("Focus on one clear goal")).toBeInTheDocument();
  });
});
