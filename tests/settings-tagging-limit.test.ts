import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "@/app/SettingsPanel";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import { createPreviewWorkspace, PREVIEW_BOOKMARKS } from "@/domain/seed";
import type { AiJob, CloudState } from "@/domain/types";
import { CloudBackupConflictError } from "@/services/cloud";

function settingsPanelProps(jobs: AiJob[] = []) {
  return {
    settings: DEFAULT_SETTINGS,
    bookmarks: PREVIEW_BOOKMARKS,
    jobs,
    cloudState: { revision: 0 } as CloudState,
    onSave: vi.fn(async () => true),
    onStartTagging: vi.fn(async () => undefined),
    onUndoAiOrganization: vi.fn(async () => undefined),
    onCancelJob: vi.fn(async () => undefined),
    onRetryJob: vi.fn(async () => undefined),
    onExportBackup: vi.fn(async () => undefined),
    onRestoreBackup: vi.fn(),
    onGoogleLogin: vi.fn(async () => undefined),
    onCloudLogout: vi.fn(async () => undefined),
    onCloudUpload: vi.fn(async () => undefined),
    onCloudRestore: vi.fn(async () => ({
      matched: 0,
      unmatched: 0,
      ambiguous: 0,
      layout: createPreviewWorkspace(),
      settings: DEFAULT_SETTINGS,
    })),
  };
}

function taggingJob(status: AiJob["status"]): AiJob {
  const timestamp = new Date("2026-08-01T02:00:00Z").getTime();
  return {
    id: "job-console-test",
    type: "tag-bookmarks",
    status,
    bookmarkIds: ["github", "google"],
    processed: status === "completed" ? 2 : 1,
    failed: 0,
    attempts: 1,
    createdAt: timestamp,
    updatedAt: timestamp + 2_000,
    items: [
      {
        id: "github",
        title: "GitHub",
        url: "https://github.com",
        folderPath: [],
      },
      {
        id: "google",
        title: "Google",
        url: "https://www.google.com",
        folderPath: [],
      },
    ],
    logs: [
      {
        bookmarkId: "github",
        title: "GitHub",
        url: "https://github.com",
        status: "completed",
        attempts: [
          {
            attempt: 1,
            startedAt: timestamp + 500,
            completedAt: timestamp + 1_000,
            request: {
              method: "POST",
              url: "https://api.deepseek.com/chat/completions",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer [已隐藏]",
              },
              body: { model: "deepseek-chat", messages: [] },
            },
            response: {
              status: 200,
              content: '{"tags":["GitHub","开发"]}',
            },
          },
        ],
        result: {
          tags: ["GitHub", "开发"],
          category: "工作",
          group: "开发工具",
        },
      },
      {
        bookmarkId: "google",
        title: "Google",
        url: "https://www.google.com",
        status: status === "completed" ? "completed" : "queued",
        attempts: [],
        ...(status === "completed"
          ? {
              result: {
                tags: ["Google", "搜索"],
                category: "工具",
                group: "搜索引擎",
              },
            }
          : {}),
      },
    ],
  };
}

describe("AI tagging task limit control", () => {
  afterEach(cleanup);

  it("saves whether the right category rail stays visible", async () => {
    const onSave = vi.fn(async () => true);
    render(
      createElement(SettingsPanel, {
        ...settingsPanelProps(),
        initialSection: "general",
        onSave,
      }),
    );

    const toggle = screen.getByRole("checkbox", {
      name: /始终显示右侧一级分类/,
    });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          screenDisplay: expect.objectContaining({
            alwaysShowCategoryRail: false,
          }),
        }),
      ),
    );
  });

  it("saves whether an empty unclassified category stays visible", async () => {
    const onSave = vi.fn(async () => true);
    render(
      createElement(SettingsPanel, {
        ...settingsPanelProps(),
        initialSection: "general",
        onSave,
      }),
    );

    const toggle = screen.getByRole("checkbox", {
      name: /显示空的“未分类”分类/,
    });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          screenDisplay: expect.objectContaining({
            showEmptyUncategorizedCategory: false,
          }),
        }),
      ),
    );
  });

  it("starts with 10 unprocessed bookmarks and keeps full quantity explicit", () => {
    const onStartTagging = vi.fn(async () => undefined);
    render(
      createElement(SettingsPanel, {
        ...settingsPanelProps(),
        onStartTagging,
      }),
    );

    const select = screen.getByLabelText("本次打标签数量");
    expect(screen.getByLabelText("本次处理范围")).toHaveValue("untagged");
    expect(select).toHaveValue("10");
    expect(
      screen.getByRole("button", {
        name: "为 10 个未处理书签打标签",
      }),
    ).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "all" } });
    const fullButton = screen.getByRole("button", {
      name: `为全部 ${PREVIEW_BOOKMARKS.length} 个未处理书签打标签`,
    });
    fireEvent.click(fullButton);

    expect(onStartTagging).toHaveBeenCalledWith("untagged", "all");
  });

  it("can reprocess existing AI results and confirms the all-bookmark scope", () => {
    const onStartTagging = vi.fn(async () => undefined);
    const bookmarks = PREVIEW_BOOKMARKS.map((bookmark, index) =>
      index < 2 ? { ...bookmark, aiTags: ["旧 AI 标签"] } : bookmark,
    );
    render(
      createElement(SettingsPanel, {
        ...settingsPanelProps(),
        bookmarks,
        onStartTagging,
      }),
    );

    const scope = screen.getByLabelText("本次处理范围");
    fireEvent.change(scope, { target: { value: "processed" } });
    const processedButton = screen.getByRole("button", {
      name: "重新处理 2 个已有 AI 结果的书签",
    });
    fireEvent.click(processedButton);
    expect(onStartTagging).toHaveBeenLastCalledWith("processed", 10);

    fireEvent.change(scope, { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("本次打标签数量"), {
      target: { value: "all" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: `重新处理全部 ${bookmarks.length} 个书签`,
      }),
    );

    expect(onStartTagging).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("alertdialog", {
        name: "确认重新处理全部范围",
      }),
    ).toHaveTextContent(`确认把 ${bookmarks.length} 个书签加入重处理队列`);
    fireEvent.click(
      screen.getByRole("button", { name: "确认重新处理" }),
    );
    expect(onStartTagging).toHaveBeenLastCalledWith("all", "all");
  });

  it("uses one live console while running and shows every tagged bookmark after completion", async () => {
    const completedJob = taggingJob("completed");
    completedJob.logs = completedJob.logs?.map((log, index) => ({
      ...log,
      bookmarkId: PREVIEW_BOOKMARKS[index]!.id,
    }));
    const { container, rerender } = render(
      createElement(SettingsPanel, settingsPanelProps([taggingJob("running")])),
    );

    expect(
      await screen.findByRole("log", { name: "AI 实时处理日志" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/发送请求 #1/)).toBeInTheDocument();
    expect(container.querySelectorAll("details.job-item-log")).toHaveLength(0);

    rerender(
      createElement(
        SettingsPanel,
        {
          ...settingsPanelProps([completedJob]),
          bookmarks: PREVIEW_BOOKMARKS.map((bookmark, index) =>
            index < 2
              ? {
                  ...bookmark,
                  aiTags:
                    index === 0
                      ? ["已完成", "测试", "搜索", "工具", "效率"]
                      : ["已完成", "测试"],
                  aiCategory: "工具",
                  aiGroup: "搜索引擎",
                  summary: "用于测试可展开的完整 AI 详情",
                }
              : bookmark,
          ),
        },
      ),
    );

    expect(
      screen.queryByRole("log", { name: "AI 实时处理日志" }),
    ).not.toBeInTheDocument();
    const summary = screen.getByRole("button", {
      name: `已完成网页 2/${PREVIEW_BOOKMARKS.length}`,
    });
    fireEvent.click(summary);
    const completedList = screen.getByLabelText("所有已完成网页");
    expect(completedList).toBeInTheDocument();
    expect(
      completedList.querySelectorAll(".completed-bookmark-row"),
    ).toHaveLength(2);
    const completedRows = completedList.querySelectorAll<HTMLDetailsElement>(
      "details.completed-bookmark-row",
    );
    const firstRow = completedRows.item(0);
    fireEvent.click(firstRow.querySelector(":scope > summary")!);
    await waitFor(() => expect(firstRow.open).toBe(true));
    expect(firstRow).toHaveTextContent("工具 / 搜索引擎");
    expect(firstRow).toHaveTextContent("用于测试可展开的完整 AI 详情");
    expect(
      firstRow.querySelectorAll(".completed-bookmark-all-tags span"),
    ).toHaveLength(7);
    expect(firstRow).toHaveTextContent("最近一次 AI 请求日志");

    const secondRow = completedRows.item(1);
    fireEvent.click(secondRow.querySelector(":scope > summary")!);
    await waitFor(() => {
      expect(firstRow.open).toBe(false);
      expect(secondRow.open).toBe(true);
    });
    expect(
      screen.getByRole("progressbar", { name: "AI 标签总体完成进度" }),
    ).toHaveAttribute(
      "aria-valuenow",
      String(Math.round((2 / PREVIEW_BOOKMARKS.length) * 100)),
    );
    expect(container.querySelectorAll("details.job-item-log")).toHaveLength(0);
  });

  it("shows the full completed bookmark collection and completed over total count", () => {
    const completedBookmarks = PREVIEW_BOOKMARKS.map((bookmark) => ({
      ...bookmark,
      aiTags: ["已完成", "AI 标签"],
    }));
    const { container } = render(
      createElement(SettingsPanel, {
        ...settingsPanelProps(),
        bookmarks: completedBookmarks,
      }),
    );

    const summary = screen.getByRole("button", {
      name: `已完成网页 ${completedBookmarks.length}/${completedBookmarks.length}`,
    });
    fireEvent.click(summary);

    expect(
      container.querySelectorAll(".completed-bookmark-row"),
    ).toHaveLength(completedBookmarks.length);
    expect(
      screen.getByRole("progressbar", { name: "AI 标签总体完成进度" }),
    ).toHaveAttribute("aria-valuenow", "100");
  });

  it("offers an explicit safe decision when cloud upload finds an existing backup", async () => {
    const props = settingsPanelProps();
    const conflict = new CloudBackupConflictError({
      localRevision: 0,
      remoteRevision: 3,
      remoteUpdatedAt: new Date("2026-08-03T10:00:00+08:00").getTime(),
      reason: "missing-baseline",
    });
    props.cloudState = {
      revision: 0,
      remoteRevision: 3,
      user: { id: "user-1", email: "user@example.com" },
    };
    props.onCloudUpload = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(undefined);

    render(createElement(SettingsPanel, props));
    fireEvent.click(
      screen.getByRole("button", { name: "账户与云同步" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "上传当前备份" }),
    );

    expect(
      await screen.findByRole("alertdialog", { name: "云端已有一份备份" }),
    ).toBeInTheDocument();
    expect(screen.getByText("版本 0")).toBeInTheDocument();
    expect(screen.getByText("版本 3")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "用当前数据覆盖云端" }),
    );
    await waitFor(() =>
      expect(props.onCloudUpload).toHaveBeenLastCalledWith(
        DEFAULT_SETTINGS.cloudApiBaseUrl,
        undefined,
        { overwriteRemoteRevision: 3 },
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps the production sync endpoint internal in the account UI", async () => {
    const props = settingsPanelProps();
    props.onGoogleLogin = vi.fn(async () => undefined);

    render(
      createElement(SettingsPanel, {
        ...props,
        initialSection: "cloud",
      }),
    );

    expect(
      screen.queryByLabelText("Cloudflare Worker 地址"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /登录会向 Google 请求稳定账户标识、已验证邮箱、显示名和头像/,
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "使用 Google 登录" }),
    );
    await waitFor(() =>
      expect(props.onGoogleLogin).toHaveBeenCalledWith(
        DEFAULT_SETTINGS.cloudApiBaseUrl,
      ),
    );
  });

  it("requires a second explicit action before deleting cloud data", async () => {
    const props = settingsPanelProps();
    props.cloudState = {
      revision: 2,
      remoteRevision: 2,
      user: { id: "user-1", email: "user@example.com" },
    };
    const onDeleteCloudBackup = vi.fn(async () => undefined);
    const onDeleteCloudAccount = vi.fn(async () => undefined);

    render(
      createElement(SettingsPanel, {
        ...props,
        initialSection: "cloud",
        onDeleteCloudBackup,
        onDeleteCloudAccount,
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "删除云端备份" }),
    );
    expect(onDeleteCloudBackup).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: "确认删除云端备份？" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "确认删除备份" }),
    );
    await waitFor(() =>
      expect(onDeleteCloudBackup).toHaveBeenCalledWith(
        DEFAULT_SETTINGS.cloudApiBaseUrl,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "删除云端账户" }),
    );
    expect(onDeleteCloudAccount).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: "确认永久删除云端账户？" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "确认删除账户" }),
    );
    await waitFor(() =>
      expect(onDeleteCloudAccount).toHaveBeenCalledWith(
        DEFAULT_SETTINGS.cloudApiBaseUrl,
      ),
    );
  });

  it("merges the remote backup without immediately uploading again", async () => {
    const props = settingsPanelProps();
    props.cloudState = {
      revision: 0,
      remoteRevision: 3,
      user: { id: "user-1", email: "user@example.com" },
    };
    props.onCloudUpload = vi.fn(async () => {
      throw new CloudBackupConflictError({
        localRevision: 0,
        remoteRevision: 3,
        reason: "missing-baseline",
      });
    });
    props.onCloudRestore = vi.fn(async () => ({
      matched: 12,
      unmatched: 2,
      ambiguous: 1,
      layout: createPreviewWorkspace(),
      settings: DEFAULT_SETTINGS,
    }));

    render(createElement(SettingsPanel, props));
    fireEvent.click(
      screen.getByRole("button", { name: "账户与云同步" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "上传当前备份" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /恢复并合并/ }),
    );

    await waitFor(() => expect(props.onCloudRestore).toHaveBeenCalledTimes(1));
    expect(props.onCloudUpload).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/云端备份已合并：匹配 12，未匹配 2/),
    ).toBeInTheDocument();
  });

  it("pauses live-log following while the user reads an earlier position", async () => {
    const runningJob = taggingJob("running");
    const { rerender } = render(
      createElement(SettingsPanel, settingsPanelProps([runningJob])),
    );
    const consoleElement = await screen.findByRole("log", {
      name: "AI 实时处理日志",
    });
    Object.defineProperties(consoleElement, {
      scrollHeight: { configurable: true, value: 1_200 },
      clientHeight: { configurable: true, value: 400 },
    });
    consoleElement.scrollTop = 160;
    fireEvent.scroll(consoleElement);

    expect(
      screen.getByRole("button", { name: "已暂停，回到底部" }),
    ).toBeInTheDocument();

    rerender(
      createElement(
        SettingsPanel,
        settingsPanelProps([
          { ...runningJob, updatedAt: runningJob.updatedAt + 1_000 },
        ]),
      ),
    );
    await new Promise((resolve) => window.setTimeout(resolve, 5));
    expect(consoleElement.scrollTop).toBe(160);

    fireEvent.click(
      screen.getByRole("button", { name: "已暂停，回到底部" }),
    );
    expect(consoleElement.scrollTop).toBe(1_200);
    expect(
      screen.getByRole("button", { name: "正在跟随最新日志" }),
    ).toBeInTheDocument();
  });
});
