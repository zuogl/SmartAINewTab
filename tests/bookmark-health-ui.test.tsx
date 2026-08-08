import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookmarkHealthSettings } from "@/app/BookmarkHealthSettings";
import { DEFAULT_BOOKMARK_HEALTH_PREFERENCES } from "@/domain/bookmarkHealth";
import { buildWorkspaceFromBookmarks } from "@/domain/layout";
import type { BookmarkRecord } from "@/domain/types";
import { enqueueBookmarkHealthJob } from "@/services/bookmarkHealth";
import { database } from "@/services/database";

const bookmarks: BookmarkRecord[] = [
  {
    id: "first",
    title: "First",
    url: "https://example.com/tool#top",
    source: "chrome",
    folderPath: ["A"],
    tags: ["manual-a"],
    aiTags: ["ai-a"],
    dateAdded: 1,
  },
  {
    id: "second",
    title: "Second",
    url: "https://example.com/tool#bottom",
    source: "chrome",
    folderPath: ["B"],
    tags: ["manual-b"],
    aiTags: ["ai-b"],
    dateAdded: 2,
  },
];

describe("bookmark health settings", () => {
  beforeEach(async () => {
    await Promise.all([
      database.health.clear(),
      database.healthJobs.clear(),
      database.healthRecovery.clear(),
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows duplicate evidence and confirms merge before deleting", async () => {
    const onMergeDuplicates = vi.fn(async () => undefined);
    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={bookmarks}
        workspace={buildWorkspaceFromBookmarks(bookmarks)}
        onPreferencesChange={vi.fn()}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={vi.fn(async () => undefined)}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={onMergeDuplicates}
        onRestoreSnapshot={vi.fn(async () => undefined)}
      />,
    );

    const group = screen.getByText("2 条链接指向同一目标").closest("details")!;
    fireEvent.click(within(group).getByText("2 条链接指向同一目标"));
    expect(within(group).getByText("First")).toBeInTheDocument();
    expect(within(group).getByText("Second")).toBeInTheDocument();

    fireEvent.click(
      within(group).getByRole("button", { name: "合并并删除 1 条" }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "确认书签体检操作",
    });
    expect(dialog).toHaveTextContent("删除后恢复会产生新的书签 ID");
    fireEvent.click(within(dialog).getByRole("button", { name: "确认执行" }));

    await waitFor(() =>
      expect(onMergeDuplicates).toHaveBeenCalledWith("first", ["second"]),
    );
  });

  it("keeps ignored decisions editable and never treats 403 as a dead link", async () => {
    await database.health.bulkPut([
      {
        bookmarkId: "first",
        checkedUrl: bookmarks[0]!.url,
        status: "auth-required",
        httpStatus: 403,
        finalUrl: bookmarks[0]!.url,
        redirectCount: 0,
        consecutiveFailures: 0,
        checkedAt: Date.now(),
      },
      {
        bookmarkId: "second",
        checkedUrl: bookmarks[1]!.url,
        status: "suspected-dead",
        httpStatus: 404,
        finalUrl: bookmarks[1]!.url,
        redirectCount: 0,
        consecutiveFailures: 1,
        checkedAt: Date.now(),
      },
    ]);
    const onPreferencesChange = vi.fn();
    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={bookmarks}
        workspace={buildWorkspaceFromBookmarks(bookmarks)}
        onPreferencesChange={onPreferencesChange}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={vi.fn(async () => undefined)}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={vi.fn(async () => undefined)}
        onRestoreSnapshot={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(await screen.findByRole("tab", { name: /^疑似死链/ }));
    expect(screen.getByText("疑似死链 · 404")).toBeInTheDocument();
    expect(screen.queryByText("需要登录或受限 · 403")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "忽略" }));
    expect(onPreferencesChange).toHaveBeenCalledWith(
      expect.objectContaining({ ignoredDeadBookmarkIds: ["second"] }),
    );

    expect(screen.queryByRole("tab", { name: /其他异常/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /^访问受限/ }));
    expect(screen.getByText("需要登录或受限 · 403")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开验证" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复检" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "忽略" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("shows persisted request and response details in the live console", async () => {
    const now = Date.now();
    await database.healthJobs.put({
      id: "health-live",
      status: "running",
      scope: "all",
      bookmarkIds: ["first"],
      processed: 0,
      failed: 0,
      createdAt: now - 1_000,
      updatedAt: now,
      items: [{
        bookmarkId: "first",
        title: "First",
        url: bookmarks[0]!.url,
        status: "checking",
        requests: [{
          id: "request-1",
          method: "HEAD",
          url: bookmarks[0]!.url,
          startedAt: now - 500,
          completedAt: now,
          headers: { Accept: "text/html" },
          response: {
            status: 404,
            finalUrl: bookmarks[0]!.url,
            redirected: false,
          },
        }],
      }],
    });

    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={bookmarks}
        workspace={buildWorkspaceFromBookmarks(bookmarks)}
        onPreferencesChange={vi.fn()}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={vi.fn(async () => undefined)}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={vi.fn(async () => undefined)}
        onRestoreSnapshot={vi.fn(async () => undefined)}
      />,
    );

    const consoleElement = await screen.findByRole("log", {
      name: "书签体检实时日志",
    });
    expect(consoleElement).toHaveTextContent("发送 HEAD 请求");
    expect(consoleElement).toHaveTextContent("HEAD https://example.com/tool#top");
    expect(consoleElement).toHaveTextContent("返回 HTTP 404");
    expect(consoleElement).toHaveTextContent("最终地址：https://example.com/tool#top");

    const storedJob = await database.healthJobs.get("health-live");
    await database.healthJobs.update("health-live", {
      status: "completed",
      processed: 1,
      updatedAt: now + 1,
      items: storedJob!.items.map((item) => ({
        ...item,
        status: "completed" as const,
        resultStatus: "http-error" as const,
      })),
    });
    await waitFor(
      () => expect(consoleElement).toHaveTextContent("任务已结束，以上为完整请求日志"),
      { timeout: 2_500 },
    );
  });

  it("automatically dismisses task status feedback", async () => {
    const now = Date.now();
    await database.healthJobs.put({
      id: "health-running",
      status: "running",
      scope: "all",
      bookmarkIds: ["first"],
      processed: 0,
      failed: 0,
      createdAt: now,
      updatedAt: now,
      items: [{
        bookmarkId: "first",
        title: "First",
        url: bookmarks[0]!.url,
        status: "queued",
        requests: [],
      }],
    });

    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={bookmarks}
        workspace={buildWorkspaceFromBookmarks(bookmarks)}
        onPreferencesChange={vi.fn()}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={vi.fn(async () => undefined)}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={vi.fn(async () => undefined)}
        onRestoreSnapshot={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "暂停" }));
    expect(await screen.findByText("体检任务已暂停")).toBeInTheDocument();
    await waitFor(
      () => expect(screen.queryByText("体检任务已暂停")).not.toBeInTheDocument(),
      { timeout: 3_500 },
    );
  });

  it("clears previous results when a new full scan starts", async () => {
    const now = Date.now();
    await database.health.bulkPut([
      {
        bookmarkId: "first",
        checkedUrl: bookmarks[0]!.url,
        status: "confirmed-dead",
        httpStatus: 404,
        finalUrl: bookmarks[0]!.url,
        redirectCount: 0,
        consecutiveFailures: 3,
        checkedAt: now - 1_000,
      },
      {
        bookmarkId: "second",
        checkedUrl: bookmarks[1]!.url,
        status: "redirected",
        finalUrl: "https://www.example.com/tool",
        redirectCount: 1,
        redirectKind: "permanent-canonical",
        consecutiveFailures: 0,
        checkedAt: now - 1_000,
      },
    ]);
    const job = await enqueueBookmarkHealthJob(
      bookmarks,
      "all",
      "all",
      now,
      { summaryMode: "full-scan", resetResults: true },
    );
    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={bookmarks}
        workspace={buildWorkspaceFromBookmarks(bookmarks)}
        onPreferencesChange={vi.fn()}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={vi.fn(async () => undefined)}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={vi.fn(async () => undefined)}
        onRestoreSnapshot={vi.fn(async () => undefined)}
      />,
    );

    expect(await screen.findByText("本轮完整体检等待开始")).toBeInTheDocument();
    const overview = screen.getByLabelText("书签健康概览");
    expect(within(overview).getByText("本轮已检测").parentElement).toHaveTextContent("0本轮已检测");
    expect(within(overview).getByText("本地重复候选组").parentElement).toHaveTextContent("1本地重复候选组");
    expect(within(overview).getByText("本轮确认死链").parentElement).toHaveTextContent("0本轮确认死链");
    expect(within(overview).getByText("本轮永久或临时跳转").parentElement).toHaveTextContent("0本轮永久或临时跳转");
    expect(await database.health.count()).toBe(0);

    await database.healthJobs.update(job!.id, {
      status: "running",
      processed: 1,
      updatedAt: now + 1,
      items: job!.items.map((item, index) =>
        index === 0
          ? { ...item, status: "completed" as const, resultStatus: "healthy" as const }
          : { ...item, status: "checking" as const },
      ),
    });
    await waitFor(
      () => {
        expect(within(overview).getByText("本轮已检测").parentElement).toHaveTextContent("1本轮已检测");
        expect(screen.getByText("本轮完整体检进行中")).toBeInTheDocument();
      },
      { timeout: 2_500 },
    );

    await database.healthJobs.update(job!.id, {
      status: "cancelled",
      leaseUntil: 0,
      updatedAt: now + 2,
    });
    await waitFor(
      () => {
        expect(screen.getByText("本轮完整体检已取消，当前为部分统计")).toBeInTheDocument();
        expect(within(overview).getByText("本轮已检测").parentElement).toHaveTextContent("1本轮已检测");
      },
      { timeout: 2_500 },
    );
  });

  it("marks an all-bookmark unlimited scan as a full overview run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={[bookmarks[0]!]}
        workspace={buildWorkspaceFromBookmarks([bookmarks[0]!])}
        onPreferencesChange={vi.fn()}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={vi.fn(async () => undefined)}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={vi.fn(async () => undefined)}
        onRestoreSnapshot={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "检测范围" }), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "本次数量" }), {
      target: { value: "all" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始体检" }));

    await waitFor(async () => {
      const job = (await database.healthJobs.toArray())[0];
      expect(job).toMatchObject({
        summaryMode: "full-scan",
        bookmarkIds: ["first"],
      });
    });
    await waitFor(async () => {
      const job = (await database.healthJobs.toArray())[0];
      expect(job?.status).toBe("completed");
    });
  });

  it("does not enqueue a scan when the user declines optional host access", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test-extension" },
      permissions: {
        contains: vi.fn().mockResolvedValue(false),
        request: vi.fn().mockResolvedValue(false),
      },
    });
    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={bookmarks}
        workspace={buildWorkspaceFromBookmarks(bookmarks)}
        onPreferencesChange={vi.fn()}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={vi.fn(async () => undefined)}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={vi.fn(async () => undefined)}
        onRestoreSnapshot={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开始体检" }));

    expect(
      await screen.findByText("失败：未获得网站访问权限，无法开始书签体检"),
    ).toBeInTheDocument();
    expect(await database.healthJobs.count()).toBe(0);
  });

  it("gives every anomaly category the four standard verification actions", async () => {
    const cases = [
      ["suspected-dead", "疑似死链", 404],
      ["confirmed-dead", "确认死链", 410],
      ["redirected", "跳转", 301],
      ["auth-required", "访问受限", 403],
      ["rate-limited", "请求限流", 429],
      ["http-error", "HTTP 异常", 400],
      ["server-error", "服务端异常", 503],
      ["network-error", "网络异常", undefined],
      ["unsupported", "无法检测", undefined],
    ] as const;
    const anomalyBookmarks: BookmarkRecord[] = cases.map(([status], index) => ({
      id: `bookmark-${status}`,
      title: `Bookmark ${status}`,
      url: `https://example.com/${status}`,
      source: "chrome",
      folderPath: [],
      tags: [],
      aiTags: [],
      dateAdded: index,
    }));
    await database.health.bulkPut(cases.map(([status, , httpStatus], index) => ({
      bookmarkId: anomalyBookmarks[index]!.id,
      checkedUrl: anomalyBookmarks[index]!.url,
      status,
      httpStatus,
      finalUrl: status === "redirected" ? "https://example.com/final" : anomalyBookmarks[index]!.url,
      redirectCount: status === "redirected" ? 1 : 0,
      consecutiveFailures: 1,
      checkedAt: Date.now(),
      verifiedBy: "GET" as const,
      detectorVersion: 2,
    })));

    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={anomalyBookmarks}
        workspace={buildWorkspaceFromBookmarks(anomalyBookmarks)}
        onPreferencesChange={vi.fn()}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={vi.fn(async () => undefined)}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={vi.fn(async () => undefined)}
        onRestoreSnapshot={vi.fn(async () => undefined)}
      />,
    );

    for (const [, tabLabel] of cases) {
      fireEvent.click(await screen.findByRole("tab", { name: new RegExp(`^${tabLabel}`) }));
      expect(screen.getByRole("button", { name: "打开验证" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "复检" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "忽略" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
    }
  });

  it("requires explicit acknowledgement before starting a Cookie-authenticated recheck", async () => {
    await database.health.put({
      bookmarkId: "first",
      checkedUrl: bookmarks[0]!.url,
      status: "auth-required",
      httpStatus: 403,
      finalUrl: bookmarks[0]!.url,
      redirectCount: 0,
      consecutiveFailures: 0,
      checkedAt: Date.now(),
      restrictionReason: "http-status",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={bookmarks}
        workspace={buildWorkspaceFromBookmarks(bookmarks)}
        onPreferencesChange={vi.fn()}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={vi.fn(async () => undefined)}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={vi.fn(async () => undefined)}
        onRestoreSnapshot={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(await screen.findByRole("tab", { name: /^访问受限/ }));
    fireEvent.click(screen.getByRole("button", { name: "带 Cookie 复检全部" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "确认书签体检操作",
    });
    const confirm = within(dialog).getByRole("button", { name: "确认复检 1 条" });
    expect(confirm).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(async () => {
      const job = (await database.healthJobs.toArray())[0];
      expect(job).toMatchObject({
        credentialsMode: "include",
        authenticatedRetry: true,
      });
    });
    await waitFor(async () => {
      const job = (await database.healthJobs.toArray())[0];
      expect(job?.status).toBe("completed");
    });
  });

  it("only offers bulk Cookie recheck for login redirects and leaves other redirects manual", async () => {
    const redirectBookmarkTuples = [
      ["safe", "http://example.com/tool"],
      ["same", "https://example.com/old"],
      ["cross", "https://example.com/account"],
      ["temporary", "https://example.com/session"],
      ["login", "https://example.com/private"],
    ] as const;
    const redirectBookmarkRecords: BookmarkRecord[] = redirectBookmarkTuples.map(([id, url], index) => ({
      id,
      title: id,
      url,
      source: "chrome",
      folderPath: [],
      tags: [],
      aiTags: [],
      dateAdded: index,
    }));
    await database.health.bulkPut([
      {
        bookmarkId: "safe",
        checkedUrl: redirectBookmarkRecords[0]!.url,
        status: "redirected",
        finalUrl: "https://www.example.com/tool",
        redirectCount: 1,
        redirectKind: "permanent-canonical",
        redirectChain: [{ status: 301, fromUrl: redirectBookmarkRecords[0]!.url, toUrl: "https://www.example.com/tool" }],
        consecutiveFailures: 0,
        checkedAt: Date.now(),
      },
      {
        bookmarkId: "same",
        checkedUrl: redirectBookmarkRecords[1]!.url,
        status: "redirected",
        finalUrl: "https://example.com/new",
        redirectCount: 1,
        redirectKind: "same-site-path",
        redirectChain: [{ status: 308, fromUrl: redirectBookmarkRecords[1]!.url, toUrl: "https://example.com/new" }],
        consecutiveFailures: 0,
        checkedAt: Date.now(),
      },
      {
        bookmarkId: "cross",
        checkedUrl: redirectBookmarkRecords[2]!.url,
        status: "redirected",
        finalUrl: "https://login.example.net/account",
        redirectCount: 1,
        redirectKind: "cross-domain",
        redirectChain: [{ status: 301, fromUrl: redirectBookmarkRecords[2]!.url, toUrl: "https://login.example.net/account" }],
        consecutiveFailures: 0,
        checkedAt: Date.now(),
      },
      {
        bookmarkId: "temporary",
        checkedUrl: redirectBookmarkRecords[3]!.url,
        status: "redirected",
        finalUrl: "https://example.com/session/new",
        redirectCount: 1,
        redirectKind: "temporary",
        redirectChain: [{ status: 307, fromUrl: redirectBookmarkRecords[3]!.url, toUrl: "https://example.com/session/new" }],
        consecutiveFailures: 0,
        checkedAt: Date.now(),
      },
      {
        bookmarkId: "login",
        checkedUrl: redirectBookmarkRecords[4]!.url,
        status: "auth-required",
        finalUrl: "https://example.com/login",
        redirectCount: 1,
        redirectKind: "temporary",
        redirectChain: [{ status: 302, fromUrl: redirectBookmarkRecords[4]!.url, toUrl: "https://example.com/login" }],
        restrictionReason: "login-redirect",
        consecutiveFailures: 0,
        checkedAt: Date.now(),
      },
    ]);
    const onUpdateBookmarkUrls = vi.fn(async () => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={redirectBookmarkRecords}
        workspace={buildWorkspaceFromBookmarks(redirectBookmarkRecords)}
        onPreferencesChange={vi.fn()}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={onUpdateBookmarkUrls}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={vi.fn(async () => undefined)}
        onRestoreSnapshot={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(await screen.findByRole("tab", { name: /^跳转/ }));
    expect(screen.getAllByText("跳转到登录页")).toHaveLength(2);
    expect(screen.getByText("安全永久跳转")).toBeInTheDocument();
    expect(screen.getByText("临时跳转")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "纳入批量更新" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /预览并批量更新/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "带 Cookie 复检登录跳转 1 条" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "确认书签体检操作",
    });
    expect(within(dialog).getByText("https://example.com/private")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "确认复检 1 条" }));

    await waitFor(async () => {
      const job = (await database.healthJobs.toArray())[0];
      expect(job).toMatchObject({
        bookmarkIds: ["login"],
        credentialsMode: "include",
        authenticatedRetry: true,
      });
    });
    expect(onUpdateBookmarkUrls).not.toHaveBeenCalled();
  });

  it("keeps unclassified redirects available for manual per-record recheck", async () => {
    await database.health.put({
      bookmarkId: "first",
      checkedUrl: bookmarks[0]!.url,
      status: "redirected",
      finalUrl: "https://example.com/tool",
      redirectCount: 1,
      redirectKind: "other",
      redirectChain: [],
      consecutiveFailures: 0,
      checkedAt: Date.now(),
      detectorVersion: 3,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={[bookmarks[0]!]}
        workspace={buildWorkspaceFromBookmarks([bookmarks[0]!])}
        onPreferencesChange={vi.fn()}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={vi.fn(async () => undefined)}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={vi.fn(async () => undefined)}
        onRestoreSnapshot={vi.fn(async () => undefined)}
      />,
    );

    const redirectTab = await screen.findByRole(
      "tab",
      { name: /^跳转1$/ },
      { timeout: 2_500 },
    );
    fireEvent.click(redirectTab);
    const recheckButton = await screen.findByRole(
      "button",
      { name: "复检" },
      { timeout: 2_500 },
    );
    expect(recheckButton).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /预览并批量更新/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "带 Cookie 复检登录跳转 0 条" })).toBeDisabled();
    fireEvent.click(recheckButton);

    await waitFor(async () => {
      const job = (await database.healthJobs.toArray())[0];
      expect(job).toMatchObject({
        status: "completed",
        bookmarkIds: ["first"],
        credentialsMode: "omit",
      });
    });
  });

  it("shows URL update snapshots as one-click undo actions", async () => {
    await database.healthRecovery.put({
      id: "update-snapshot",
      action: "update",
      createdAt: Date.now(),
      bookmarks: [bookmarks[0]!],
      placements: [],
    });
    const onRestoreSnapshot = vi.fn(async () => undefined);
    render(
      <BookmarkHealthSettings
        preferences={DEFAULT_BOOKMARK_HEALTH_PREFERENCES}
        bookmarks={bookmarks}
        workspace={buildWorkspaceFromBookmarks(bookmarks)}
        onPreferencesChange={vi.fn()}
        onOpenBookmark={vi.fn(async () => undefined)}
        onUpdateBookmarkUrls={vi.fn(async () => undefined)}
        onDeleteBookmarks={vi.fn(async () => undefined)}
        onMergeDuplicates={vi.fn(async () => undefined)}
        onRestoreSnapshot={onRestoreSnapshot}
      />,
    );

    expect(await screen.findByText("书签地址更新 · 1 条")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "一键撤销" }));
    await waitFor(() =>
      expect(onRestoreSnapshot).toHaveBeenCalledWith("update-snapshot"),
    );
  });
});
