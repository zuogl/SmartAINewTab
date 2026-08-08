import {
  ArrowClockwise,
  ArrowSquareOut,
  CaretDown,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  FirstAidKit,
  Info,
  LinkBreak,
  Pause,
  Play,
  ShieldCheck,
  Stop,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  detectDuplicateGroups,
  summarizeBookmarkHealth,
  summarizeBookmarkHealthRun,
  type DuplicateConfidence,
  type DuplicateGroup,
} from "@/domain/bookmarkHealth";
import type {
  BookmarkHealthJob,
  BookmarkHealthPreferences,
  BookmarkHealthRedirectKind,
  BookmarkHealthRecord,
  BookmarkHealthScanLimit,
  BookmarkHealthScanScope,
  BookmarkRecoverySnapshot,
  BookmarkRecord,
  WorkspaceLayout,
} from "@/domain/types";
import {
  cancelBookmarkHealthJob,
  clearBookmarkHealthResults,
  enqueueBookmarkHealthJob,
  listBookmarkHealthJobs,
  listBookmarkRecoverySnapshots,
  loadBookmarkHealthRecords,
  pauseBookmarkHealthJob,
  requestBookmarkHealthPump,
  resumeBookmarkHealthJob,
  retryBookmarkHealthJob,
} from "@/services/bookmarkHealth";
import {
  hostPermissionOrigin,
  requestAllWebHostPermissions,
  requestHostPermissions,
} from "@/services/hostPermissions";
import { useI18n } from "@/i18n";

type ResultTab =
  | "duplicates"
  | "suspected-dead"
  | "confirmed-dead"
  | "redirects"
  | "restricted"
  | "rate-limited"
  | "http-error"
  | "server-error"
  | "network-error"
  | "unsupported"
  | "ignored";

type PendingAction =
  | {
      kind: "merge";
      group: DuplicateGroup;
      primaryId: string;
    }
  | { kind: "delete"; bookmark: BookmarkRecord }
  | { kind: "cookie-recheck"; bookmarks: BookmarkRecord[] }
  | { kind: "clear" };

interface BookmarkHealthSettingsProps {
  preferences: BookmarkHealthPreferences;
  bookmarks: BookmarkRecord[];
  workspace: WorkspaceLayout;
  onPreferencesChange(next: BookmarkHealthPreferences): void;
  onOpenBookmark(url: string): Promise<void>;
  onUpdateBookmarkUrls(
    updates: Array<{ bookmarkId: string; finalUrl: string }>,
  ): Promise<void>;
  onDeleteBookmarks(bookmarkIds: string[]): Promise<void>;
  onMergeDuplicates(primaryId: string, duplicateIds: string[]): Promise<void>;
  onRestoreSnapshot(snapshotId: string): Promise<void>;
}

export function BookmarkHealthSettings({
  preferences,
  bookmarks,
  workspace,
  onPreferencesChange,
  onOpenBookmark,
  onDeleteBookmarks,
  onMergeDuplicates,
  onRestoreSnapshot,
}: BookmarkHealthSettingsProps) {
  const { t } = useI18n();
  const [records, setRecords] = useState<BookmarkHealthRecord[]>([]);
  const [jobs, setJobs] = useState<BookmarkHealthJob[]>([]);
  const [recoverySnapshots, setRecoverySnapshots] = useState<
    BookmarkRecoverySnapshot[]
  >([]);
  const [scope, setScope] = useState<BookmarkHealthScanScope>("unchecked");
  const [limit, setLimit] = useState<BookmarkHealthScanLimit>(50);
  const [activeTab, setActiveTab] = useState<ResultTab>("duplicates");
  const [primaryIds, setPrimaryIds] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>();
  const [cookieRiskConfirmed, setCookieRiskConfirmed] = useState(false);

  const refresh = useCallback(async () => {
    const [nextRecords, nextJobs, nextRecoverySnapshots] = await Promise.all([
      loadBookmarkHealthRecords(),
      listBookmarkHealthJobs(),
      listBookmarkRecoverySnapshots(),
    ]);
    setRecords(nextRecords);
    setJobs(nextJobs);
    setRecoverySnapshots(nextRecoverySnapshots);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_200);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const bookmarkById = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks],
  );
  const duplicateGroups = useMemo(
    () =>
      detectDuplicateGroups(
        bookmarks,
        records,
        preferences.ignoredDuplicateKeys,
      ),
    [bookmarks, preferences.ignoredDuplicateKeys, records],
  );
  const allDuplicateGroups = useMemo(
    () => detectDuplicateGroups(bookmarks, records),
    [bookmarks, records],
  );
  const summary = useMemo(
    () => summarizeBookmarkHealth(bookmarks, records, duplicateGroups),
    [bookmarks, duplicateGroups, records],
  );
  const ignoredRecordIds = new Set(preferences.ignoredDeadBookmarkIds);
  const visibleRecords = records.filter(
    (record) =>
      bookmarkById.has(record.bookmarkId) &&
      !ignoredRecordIds.has(record.bookmarkId),
  );
  const recordsWithStatus = (...statuses: BookmarkHealthRecord["status"][]) =>
    visibleRecords.filter((record) => statuses.includes(record.status));
  const suspectedDeadRecords = recordsWithStatus("suspected-dead");
  const confirmedDeadRecords = recordsWithStatus("confirmed-dead");
  const redirectRecords = recordsWithStatus("redirected");
  const loginRedirectRecords = recordsWithStatus("auth-required").filter(
    (record) => record.restrictionReason === "login-redirect",
  );
  const restrictedRecords = recordsWithStatus("auth-required").filter(
    (record) => record.restrictionReason !== "login-redirect",
  );
  const cookieRecheckRecords = restrictedRecords.filter(
    (record) =>
      record.httpStatus === 401 ||
      record.httpStatus === 403,
  );
  const rateLimitedRecords = recordsWithStatus("rate-limited");
  const httpErrorRecords = recordsWithStatus("http-error");
  const serverErrorRecords = recordsWithStatus("server-error");
  const networkErrorRecords = recordsWithStatus(
    "network-error",
    "temporary-error",
  );
  const unsupportedRecords = recordsWithStatus("unsupported");
  const loginRedirectBookmarks = loginRedirectRecords.flatMap((record) => {
    const bookmark = bookmarkById.get(record.bookmarkId);
    return bookmark ? [bookmark] : [];
  });
  const ignoredDuplicateGroups = allDuplicateGroups.filter((group) =>
    preferences.ignoredDuplicateKeys.includes(group.key),
  );
  const ignoredRecords = records.filter(
    (record) =>
      ignoredRecordIds.has(record.bookmarkId) && bookmarkById.has(record.bookmarkId),
  );
  const liveJob = jobs.find(
    (job) => job.status === "queued" || job.status === "running" || job.status === "paused",
  );
  const latestJob = jobs[0];
  const latestFullScanJob =
    latestJob?.summaryMode === "full-scan" &&
    latestJob.items.length === bookmarks.length &&
    latestJob.items.every((item) => bookmarkById.has(item.bookmarkId))
      ? latestJob
      : undefined;
  const overviewFullScanJob =
    latestFullScanJob?.status === "completed" ? undefined : latestFullScanJob;
  const overviewSummary = overviewFullScanJob
    ? summarizeBookmarkHealthRun(summary, overviewFullScanJob)
    : summary;
  const displayedJob = liveJob ?? jobs[0];
  const progress = displayedJob?.items.length
    ? Math.round(((displayedJob.processed + displayedJob.failed) / displayedJob.items.length) * 100)
    : 0;

  useEffect(() => {
    if (!message || message === "正在处理…") return;
    const timer = window.setTimeout(
      () => setMessage((current) => (current === message ? "" : current)),
      message.startsWith("失败") ? 6_000 : 2_600,
    );
    return () => window.clearTimeout(timer);
  }, [message]);

  async function runAction(action: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage("正在处理…");
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(`失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setBusy(false);
    }
  }

  function requestConfirmation(action: PendingAction) {
    setCookieRiskConfirmed(false);
    setPendingAction(action);
  }

  async function startScan() {
    await runAction(async () => {
      const granted = await requestAllWebHostPermissions();
      if (!granted) {
        throw new Error("未获得网站访问权限，无法开始书签体检");
      }
      const isFullScan = scope === "all" && limit === "all";
      const job = await enqueueBookmarkHealthJob(
        bookmarks,
        scope,
        limit,
        Date.now(),
        {
          summaryMode: isFullScan ? "full-scan" : undefined,
          resetResults: isFullScan,
        },
      );
      if (!job) throw new Error("所选范围内没有需要检测的书签");
      if (isFullScan) setRecords([]);
      await requestBookmarkHealthPump();
    }, "书签体检任务已加入后台队列");
  }

  function updatePreferences(patch: Partial<BookmarkHealthPreferences>) {
    onPreferencesChange({ ...preferences, ...patch });
  }

  function ignoreDuplicate(group: DuplicateGroup) {
    updatePreferences({
      ignoredDuplicateKeys: [
        ...new Set([...preferences.ignoredDuplicateKeys, group.key]),
      ],
    });
    setMessage("已忽略该重复候选；保存设置后会同步此决定");
  }

  function ignoreRecord(bookmarkId: string) {
    updatePreferences({
      ignoredDeadBookmarkIds: [
        ...new Set([...preferences.ignoredDeadBookmarkIds, bookmarkId]),
      ],
    });
    setMessage("已忽略该检测结果；保存设置后会同步此决定");
  }

  async function recheck(bookmark: BookmarkRecord) {
    await recheckMany([bookmark], `已将“${bookmark.title}”加入复检队列`);
  }

  async function recheckMany(
    candidates: BookmarkRecord[],
    success: string,
  ) {
    await runAction(async () => {
      const granted = await requestBookmarkPermissions(candidates);
      if (!granted) {
        throw new Error("未获得目标网站访问权限，无法加入复检队列");
      }
      const job = await enqueueBookmarkHealthJob(candidates, "all", "all");
      if (!job) throw new Error("所选书签已经在检测队列中");
      await requestBookmarkHealthPump();
    }, success);
  }

  async function confirmPendingAction() {
    const action = pendingAction;
    if (!action) return;
    setPendingAction(undefined);
    if (action.kind === "merge") {
      const duplicateIds = action.group.bookmarks
        .map((bookmark) => bookmark.id)
        .filter((id) => id !== action.primaryId);
      await runAction(
        () => onMergeDuplicates(action.primaryId, duplicateIds),
        `已保留 1 条并合并删除 ${duplicateIds.length} 条重复书签`,
      );
      return;
    }
    if (action.kind === "delete") {
      await runAction(
        () => onDeleteBookmarks([action.bookmark.id]),
        `已删除“${action.bookmark.title}”`,
      );
      return;
    }
    if (action.kind === "cookie-recheck") {
      await runAction(async () => {
        const granted = await requestBookmarkPermissions(action.bookmarks);
        if (!granted) {
          throw new Error("未获得目标网站访问权限，无法执行带 Cookie 复检");
        }
        const job = await enqueueBookmarkHealthJob(
          action.bookmarks,
          "all",
          "all",
          Date.now(),
          { credentialsMode: "include", authenticatedRetry: true },
        );
        if (!job) throw new Error("这些书签已经在检测队列中");
        await requestBookmarkHealthPump();
      }, `已将 ${action.bookmarks.length} 条书签加入带 Cookie 复检队列`);
      return;
    }
    await runAction(clearBookmarkHealthResults, "本地体检结果与任务历史已清空");
  }

  async function updateAutomaticScanPreference(
    key: "scheduledScanEnabled" | "autoCheckNewBookmarks",
    enabled: boolean,
  ) {
    if (!enabled) {
      updatePreferences({ [key]: false });
      return;
    }
    setMessage("正在请求网站访问权限…");
    const granted = await requestAllWebHostPermissions();
    if (!granted) {
      setMessage("失败：未获得网站访问权限，自动体检未开启");
      return;
    }
    updatePreferences({ [key]: true });
    setMessage("网站访问权限已授予；保存设置后自动体检生效");
  }

  function renderRecordRows(
    categoryRecords: BookmarkHealthRecord[],
    emptyText: string,
    emptyIcon: React.ReactNode,
    extraActions?: (
      record: BookmarkHealthRecord,
      bookmark: BookmarkRecord,
    ) => React.ReactNode[],
  ) {
    if (categoryRecords.length === 0) {
      return <EmptyHealthResult icon={emptyIcon} text={emptyText} />;
    }
    return categoryRecords.map((record) => {
      const bookmark = bookmarkById.get(record.bookmarkId)!;
      return (
        <HealthRecordRow
          key={record.bookmarkId}
          record={record}
          bookmark={bookmark}
          workspace={workspace}
          actions={[
            <button key="open" type="button" onClick={() => void onOpenBookmark(bookmark.url)}><ArrowSquareOut size={14} />打开验证</button>,
            <button key="retry" type="button" onClick={() => void recheck(bookmark)}><ArrowClockwise size={14} />复检</button>,
            <button key="ignore" type="button" onClick={() => ignoreRecord(bookmark.id)}>忽略</button>,
            ...(extraActions?.(record, bookmark) ?? []),
            <button key="delete" type="button" className="danger-outline-button" onClick={() => requestConfirmation({ kind: "delete", bookmark })}><Trash size={14} />删除</button>,
          ]}
        />
      );
    });
  }

  function renderRedirectGroup(
    kind: BookmarkHealthRedirectKind,
    title: string,
    description: string,
  ) {
    const groupRecords = redirectRecords.filter(
      (record) => (record.redirectKind ?? "other") === kind,
    );
    if (groupRecords.length === 0) return null;
    return (
      <section className={`health-redirect-group redirect-${kind}`} key={kind}>
        <header>
          <div><strong>{title}</strong><small>{description}</small></div>
          <span>{groupRecords.length} 条</span>
        </header>
        {renderRecordRows(
          groupRecords,
          "",
          <ArrowSquareOut size={22} />,
          (record) => record.finalUrl ? [
            <button key="open-final" type="button" onClick={() => void onOpenBookmark(record.finalUrl!)}><ArrowSquareOut size={14} />打开最终地址</button>,
          ] : [],
        )}
      </section>
    );
  }

  return (
    <section className="settings-section bookmark-health-settings">
      <div className="health-overview-grid" aria-label={t("书签健康概览")}>
        <HealthMetric value={overviewSummary.total} label={t("全部书签")} tone="neutral" />
        <HealthMetric value={overviewSummary.checked} label={overviewFullScanJob ? t("本轮已检测") : t("已检测")} tone="mint" />
        <HealthMetric value={overviewSummary.duplicateGroups} label={t("本地重复候选组")} tone="amber" />
        <HealthMetric value={overviewSummary.suspectedDead} label={overviewFullScanJob ? t("本轮疑似死链") : t("疑似死链")} tone="amber" />
        <HealthMetric value={overviewSummary.confirmedDead} label={overviewFullScanJob ? t("本轮确认死链") : t("确认死链")} tone="danger" />
        <HealthMetric value={overviewSummary.redirected} label={overviewFullScanJob ? t("本轮永久或临时跳转") : t("永久或临时跳转")} tone="blue" />
      </div>
      {overviewFullScanJob && (
        <div className={`health-overview-run status-${overviewFullScanJob.status}`} role="status">
          <strong>{fullScanOverviewLabel(overviewFullScanJob)}</strong>
          <span>
            {overviewFullScanJob.processed}/{overviewFullScanJob.items.length} · 新全量检测已清空上一轮检测结果，顶部只统计本轮已完成项目。
          </span>
        </div>
      )}

      <div className="health-scan-card">
        <div className="health-scan-copy">
          <span className="health-card-icon"><FirstAidKit size={22} weight="duotone" /></span>
          <div>
            <strong>{t("运行书签体检")}</strong>
            <small>
              {t("重复链接在本地计算；开始联网体检时 Chrome 会询问网站访问权限，常规检测不携带 Cookie，也不会调用大模型。")}
            </small>
          </div>
        </div>
        <div className="health-scan-controls">
          <label>
            <span>{t("检测范围")}</span>
            <select value={scope} onChange={(event) => setScope(event.target.value as BookmarkHealthScanScope)}>
              <option value="unchecked">{t("仅从未检测或 URL 已变化")}</option>
              <option value="stale">{t("未检测及已过期结果")}</option>
              <option value="all">{t("重新检测全部书签")}</option>
            </select>
          </label>
          <label>
            <span>{t("本次数量")}</span>
            <select
              value={String(limit)}
              onChange={(event) =>
                setLimit(event.target.value === "all" ? "all" : Number(event.target.value) as BookmarkHealthScanLimit)
              }
            >
              <option value="10">{t("最多 10 个")}</option>
              <option value="50">{t("最多 50 个")}</option>
              <option value="100">{t("最多 100 个")}</option>
              <option value="all">{t("全部")}</option>
            </select>
          </label>
          <button className="primary-button" type="button" disabled={busy || Boolean(liveJob)} onClick={() => void startScan()}>
            <Play size={16} weight="fill" /> {t("开始体检")}
          </button>
        </div>

        {displayedJob && (
          <div className={`health-job health-job-${displayedJob.status}`} aria-label={t("书签体检进度")}>
            <div className="health-job-heading">
              <span className="health-job-state"><span className="status-dot" />{healthJobStatusText(displayedJob)}</span>
              <strong>{displayedJob.processed + displayedJob.failed}/{displayedJob.items.length}</strong>
            </div>
            <div className="health-progress"><span style={{ width: `${progress}%` }} /></div>
            {liveJob?.id === displayedJob.id && (
              <div className="health-job-actions">
                {liveJob.status === "paused" ? (
                  <button type="button" onClick={() => void runAction(async () => { await resumeBookmarkHealthJob(liveJob.id); await requestBookmarkHealthPump(); }, "体检任务已继续")}><Play size={14} />{t("继续")}</button>
                ) : (
                  <button type="button" onClick={() => void runAction(() => pauseBookmarkHealthJob(liveJob.id), "体检任务已暂停")}><Pause size={14} />{t("暂停")}</button>
                )}
                <button type="button" onClick={() => void runAction(() => cancelBookmarkHealthJob(liveJob.id), "体检任务已取消")}><Stop size={14} />{t("取消")}</button>
              </div>
            )}
            <HealthLiveConsole job={displayedJob} live={liveJob?.id === displayedJob.id} />
          </div>
        )}
      </div>

      <div className="health-automation-card">
        <label className="switch-row">
          <span className="switch-copy"><strong>{t("定期自动体检")}</strong><small>{t("开启时申请网站访问权限，仅在到期时检测未检查或过期的结果")}</small></span>
          <input type="checkbox" checked={preferences.scheduledScanEnabled} onChange={(event) => void updateAutomaticScanPreference("scheduledScanEnabled", event.target.checked)} />
        </label>
        <label>
          <span>{t("周期")}</span>
          <select value={preferences.scheduleIntervalDays} onChange={(event) => updatePreferences({ scheduleIntervalDays: Number(event.target.value) as 7 | 14 | 30 })}>
            <option value={7}>{t("每 7 天")}</option>
            <option value={14}>{t("每 14 天")}</option>
            <option value={30}>{t("每 30 天")}</option>
          </select>
        </label>
        <label>
          <span>{t("正常结果有效期")}</span>
          <select value={preferences.staleAfterDays} onChange={(event) => updatePreferences({ staleAfterDays: Number(event.target.value) as 7 | 14 | 30 })}>
            <option value={7}>{t("7 天")}</option>
            <option value={14}>{t("14 天")}</option>
            <option value={30}>{t("30 天")}</option>
          </select>
        </label>
        <label className="switch-row">
          <span className="switch-copy"><strong>{t("新增或修改后检测")}</strong><small>{t("开启时申请网站访问权限，保存新书签或修改 URL 后加入后台队列")}</small></span>
          <input type="checkbox" checked={preferences.autoCheckNewBookmarks} onChange={(event) => void updateAutomaticScanPreference("autoCheckNewBookmarks", event.target.checked)} />
        </label>
      </div>

      <div className="health-results-card">
        <header className="health-results-heading">
          <div>
            <strong>{t("检测结果")}</strong>
            <small>{t("删除与合并需要单独确认；普通跳转只提供人工核对")}</small>
          </div>
          <button type="button" className="text-button" disabled={Boolean(liveJob) || (records.length === 0 && jobs.length === 0)} onClick={() => requestConfirmation({ kind: "clear" })}>
            <ClockCounterClockwise size={14} /> {t("清空本地结果")}
          </button>
        </header>
        <div className="health-result-tabs" role="tablist" aria-label={t("体检结果分类")}>
          <HealthTab active={activeTab === "duplicates"} label={t("重复候选")} count={duplicateGroups.length} onClick={() => setActiveTab("duplicates")} />
          <HealthTab active={activeTab === "suspected-dead"} label={t("疑似死链")} count={suspectedDeadRecords.length} onClick={() => setActiveTab("suspected-dead")} />
          <HealthTab active={activeTab === "confirmed-dead"} label={t("确认死链")} count={confirmedDeadRecords.length} onClick={() => setActiveTab("confirmed-dead")} />
          <HealthTab active={activeTab === "redirects"} label={t("跳转")} count={redirectRecords.length + loginRedirectRecords.length} onClick={() => setActiveTab("redirects")} />
          <HealthTab active={activeTab === "restricted"} label={t("访问受限")} count={restrictedRecords.length} onClick={() => setActiveTab("restricted")} />
          <HealthTab active={activeTab === "rate-limited"} label={t("请求限流")} count={rateLimitedRecords.length} onClick={() => setActiveTab("rate-limited")} />
          <HealthTab active={activeTab === "http-error"} label={t("HTTP 异常")} count={httpErrorRecords.length} onClick={() => setActiveTab("http-error")} />
          <HealthTab active={activeTab === "server-error"} label={t("服务端异常")} count={serverErrorRecords.length} onClick={() => setActiveTab("server-error")} />
          <HealthTab active={activeTab === "network-error"} label={t("网络异常")} count={networkErrorRecords.length} onClick={() => setActiveTab("network-error")} />
          <HealthTab active={activeTab === "unsupported"} label={t("无法检测")} count={unsupportedRecords.length} onClick={() => setActiveTab("unsupported")} />
          <HealthTab active={activeTab === "ignored"} label={t("已忽略")} count={ignoredDuplicateGroups.length + ignoredRecords.length} onClick={() => setActiveTab("ignored")} />
        </div>

        <div className="health-result-list">
          {activeTab === "duplicates" && (
            duplicateGroups.length ? duplicateGroups.map((group) => {
              const primaryId = primaryIds[group.key] ?? group.bookmarks[0]!.id;
              return (
                <details className="duplicate-group" key={group.key}>
                  <summary>
                    <span className={`health-confidence confidence-${group.confidence}`}>{duplicateConfidenceText(group.confidence)}</span>
                    <span className="health-result-title"><strong>{group.bookmarks.length} 条链接指向同一目标</strong><small>{group.canonicalUrl}</small></span>
                    <CaretDown size={15} />
                  </summary>
                  <div className="duplicate-members">
                    {group.bookmarks.map((bookmark) => (
                      <label key={bookmark.id} className={primaryId === bookmark.id ? "is-primary" : ""}>
                        <input type="radio" name={`primary-${group.key}`} checked={primaryId === bookmark.id} onChange={() => setPrimaryIds((current) => ({ ...current, [group.key]: bookmark.id }))} />
                        <span><strong>{bookmark.title || bookmark.url}</strong><small>{bookmark.url}</small><em>{bookmarkLocation(workspace, bookmark.id)}</em></span>
                        <button type="button" aria-label={`打开${bookmark.title}`} onClick={() => void onOpenBookmark(bookmark.url)}><ArrowSquareOut size={14} /></button>
                      </label>
                    ))}
                  </div>
                  <div className="health-row-actions">
                    <span>选中的书签会被保留，并接收其他书签的手动标签与 AI 标签。</span>
                    <button type="button" onClick={() => void recheckMany(group.bookmarks, `已将 ${group.bookmarks.length} 条重复候选加入复检队列`)}><ArrowClockwise size={14} />复检全部</button>
                    <button type="button" onClick={() => ignoreDuplicate(group)}>保留现状并忽略</button>
                    <button type="button" className="danger-outline-button" onClick={() => requestConfirmation({ kind: "merge", group, primaryId })}>合并并删除 {group.bookmarks.length - 1} 条</button>
                  </div>
                </details>
              );
            }) : <EmptyHealthResult icon={<Copy size={22} />} text="没有发现尚未忽略的重复候选" />
          )}

          {activeTab === "suspected-dead" && renderRecordRows(suspectedDeadRecords, "没有发现尚未忽略的疑似死链", <ShieldCheck size={22} />)}

          {activeTab === "confirmed-dead" && renderRecordRows(confirmedDeadRecords, "没有发现尚未忽略的确认死链", <ShieldCheck size={22} />)}

          {activeTab === "redirects" && (
            redirectRecords.length || loginRedirectRecords.length ? (
              <>
                <div className="health-batch-toolbar health-cookie-toolbar">
                  <span>
                    检测时已按登录页、永久、同站、跨域、临时和未确认跳转分类。只有跳转到登录页的书签可批量带 Cookie 复检；其他类型需逐条人工处理。
                  </span>
                  <button
                    type="button"
                    className="danger-outline-button"
                    disabled={busy || Boolean(liveJob) || loginRedirectBookmarks.length === 0}
                    onClick={() => requestConfirmation({
                      kind: "cookie-recheck",
                      bookmarks: loginRedirectBookmarks,
                    })}
                  >
                    <ArrowClockwise size={14} />带 Cookie 复检登录跳转 {loginRedirectBookmarks.length} 条
                  </button>
                </div>
                {loginRedirectRecords.length > 0 && (
                  <section className="health-redirect-group redirect-login">
                    <header><div><strong>跳转到登录页</strong><small>检测阶段已识别为疑似登录页；可在确认风险后用当前登录态复检。</small></div><span>{loginRedirectRecords.length} 条</span></header>
                    {renderRecordRows(loginRedirectRecords, "", <ArrowSquareOut size={22} />, (record) => record.finalUrl ? [<button key="open-final" type="button" onClick={() => void onOpenBookmark(record.finalUrl!)}><ArrowSquareOut size={14} />打开登录页</button>] : [])}
                  </section>
                )}
                {renderRedirectGroup("permanent-canonical", "安全永久跳转", "全链路均为 301/308，且仅做 HTTPS、www 或尾斜杠规范化；请人工确认是否需要改址。")}
                {renderRedirectGroup("same-site-path", "同站路径变化", "同一站点的路径发生变化；请人工确认内容是否仍对应。")}
                {renderRedirectGroup("cross-domain", "跨域风险跳转", "最终地址跨域；必须逐条人工核对。")}
                {renderRedirectGroup("temporary", "临时跳转", "链路包含 302/303/307；通常应保留原地址。")}
                {renderRedirectGroup("other", "未确认跳转类型", "没有取得完整跳转状态证据；请逐条复检或人工处理。")}
              </>
            ) : <EmptyHealthResult icon={<ArrowSquareOut size={22} />} text="没有检测到跳转链接" />
          )}

          {activeTab === "restricted" && (
            restrictedRecords.length ? (
              <>
                <div className="health-batch-toolbar health-cookie-toolbar">
                  <span>仅本次复检由浏览器自动附带目标网站当前登录态；不会读取、显示或保存 Cookie。</span>
                  <button
                    type="button"
                    className="danger-outline-button"
                    disabled={busy || Boolean(liveJob) || cookieRecheckRecords.length === 0}
                    onClick={() => requestConfirmation({
                      kind: "cookie-recheck",
                      bookmarks: cookieRecheckRecords.flatMap((record) => {
                        const bookmark = bookmarkById.get(record.bookmarkId);
                        return bookmark ? [bookmark] : [];
                      }),
                    })}
                  >
                    <ArrowClockwise size={14} />带 Cookie 复检全部
                  </button>
                </div>
                {renderRecordRows(restrictedRecords, "", <Info size={22} />)}
              </>
            ) : <EmptyHealthResult icon={<Info size={22} />} text="没有检测到登录或访问限制" />
          )}
          {activeTab === "rate-limited" && renderRecordRows(rateLimitedRecords, "没有检测到请求限流", <Info size={22} />)}
          {activeTab === "http-error" && renderRecordRows(httpErrorRecords, "没有检测到其他 HTTP 异常", <Info size={22} />)}
          {activeTab === "server-error" && renderRecordRows(serverErrorRecords, "没有检测到服务端异常", <Info size={22} />)}
          {activeTab === "network-error" && renderRecordRows(networkErrorRecords, "没有检测到网络或超时异常", <Info size={22} />)}
          {activeTab === "unsupported" && renderRecordRows(unsupportedRecords, "没有无法检测的地址", <Info size={22} />)}

          {activeTab === "ignored" && (
            ignoredDuplicateGroups.length || ignoredRecords.length ? (
              <div className="ignored-health-list">
                {ignoredDuplicateGroups.map((group) => (
                  <div key={group.key}><span><strong>重复候选 · {group.bookmarks.length} 条</strong><small>{group.canonicalUrl}</small></span><button type="button" onClick={() => updatePreferences({ ignoredDuplicateKeys: preferences.ignoredDuplicateKeys.filter((key) => key !== group.key) })}>恢复提示</button></div>
                ))}
                {ignoredRecords.map((record) => {
                  const bookmark = bookmarkById.get(record.bookmarkId)!;
                  return <div key={record.bookmarkId}><span><strong>{healthStatusText(record)} · {bookmark.title}</strong><small>{bookmark.url}</small></span><div className="ignored-record-actions"><button type="button" onClick={() => void onOpenBookmark(bookmark.url)}>打开验证</button><button type="button" onClick={() => void recheck(bookmark)}>复检</button><button type="button" onClick={() => updatePreferences({ ignoredDeadBookmarkIds: preferences.ignoredDeadBookmarkIds.filter((id) => id !== bookmark.id) })}>恢复提示</button><button type="button" className="danger-outline-button" onClick={() => requestConfirmation({ kind: "delete", bookmark })}>删除</button></div></div>;
                })}
              </div>
            ) : <EmptyHealthResult icon={<ShieldCheck size={22} />} text="没有已忽略的体检结果" />
          )}
        </div>
      </div>

      {jobs.length > 0 && (
        <details className="health-history">
          <summary><ClockCounterClockwise size={16} /><strong>最近任务</strong><span>{jobs.length} 次</span><CaretDown size={14} /></summary>
          <div>
            {jobs.slice(0, 10).map((job) => (
              <article key={job.id}>
                <span className={`status-dot status-${job.status}`} />
                <span><strong>{healthJobStatusText(job)}</strong><small>{new Date(job.createdAt).toLocaleString("zh-CN")} · {job.processed}/{job.items.length}</small></span>
                {job.status === "failed" && <button type="button" onClick={() => void runAction(async () => { await retryBookmarkHealthJob(job.id); await requestBookmarkHealthPump(); }, "失败项目已重新入队")}>重试失败项</button>}
              </article>
            ))}
          </div>
        </details>
      )}

      {recoverySnapshots.length > 0 && (
        <details className="health-history health-recovery" open>
          <summary><ClockCounterClockwise size={16} /><strong>可撤销的书签快照</strong><span>{recoverySnapshots.length} 份</span><CaretDown size={14} /></summary>
          <div>
            {recoverySnapshots.map((snapshot) => (
              <article key={snapshot.id}>
                <span className="status-dot status-completed" />
                <span><strong>{recoverySnapshotTitle(snapshot)} · {snapshot.bookmarks.length} 条</strong><small>{new Date(snapshot.createdAt).toLocaleString("zh-CN")} · {snapshot.action === "update" ? "撤销会恢复旧地址并保留 bookmark ID" : "恢复后会生成新的 bookmark ID"}</small></span>
                <button type="button" onClick={() => void runAction(() => onRestoreSnapshot(snapshot.id), snapshot.action === "update" ? `已撤销 ${snapshot.bookmarks.length} 条地址更新` : `已恢复 ${snapshot.bookmarks.length} 条书签`)}>{snapshot.action === "update" ? "一键撤销" : "恢复书签"}</button>
              </article>
            ))}
          </div>
        </details>
      )}

      <div className="privacy-note health-privacy-note">
        <Info size={17} />
        <span>常规与自动体检始终不携带 Cookie。只有“跳转到登录页”或可带 Cookie 复检的访问受限结果，经二次确认后才会让浏览器自动附带目标网站当前登录态；插件不读取、不显示也不保存 Cookie。响应正文不会写入日志。只有 GET 返回的 404/410 才会进入死链确认流程；普通跳转不会自动修改书签地址。</span>
      </div>

      {message && <div className={message.startsWith("失败") ? "health-message is-error" : "health-message"} role="status">{message.startsWith("失败") ? <WarningCircle size={16} /> : <CheckCircle size={16} />}{message}</div>}

      {pendingAction && (
        <div className="health-confirm-backdrop" role="presentation" onClick={() => setPendingAction(undefined)}>
          <section className="health-confirm-dialog" role="alertdialog" aria-modal="true" aria-label="确认书签体检操作" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="health-confirm-close" aria-label="关闭确认" onClick={() => setPendingAction(undefined)}><X size={18} /></button>
            <span className="health-confirm-icon">{pendingAction.kind === "clear" ? <ClockCounterClockwise size={26} /> : <WarningCircle size={26} />}</span>
            <h3>{pendingActionTitle(pendingAction)}</h3>
            <p>{pendingActionDescription(pendingAction)}</p>
            {pendingAction.kind === "cookie-recheck" && (
              <>
                <div className="health-confirm-preview" aria-label="带 Cookie 复检预览">
                  {pendingAction.bookmarks.map((bookmark) => (
                    <div key={bookmark.id}><strong>{bookmark.title || bookmark.url}</strong><small>{bookmark.url}</small></div>
                  ))}
                </div>
                <label className="health-cookie-confirmation">
                  <input type="checkbox" checked={cookieRiskConfirmed} onChange={(event) => setCookieRiskConfirmed(event.target.checked)} />
                  <span>我确认仅对以上网址使用当前登录态发起 GET 复检，并理解网站可能记录这次已登录访问。</span>
                </label>
              </>
            )}
            <div>
              <button type="button" className="secondary-button" onClick={() => setPendingAction(undefined)}>取消</button>
              <button type="button" className="danger-button" disabled={busy || (pendingAction.kind === "cookie-recheck" && !cookieRiskConfirmed)} onClick={() => void confirmPendingAction()}>{pendingActionConfirmLabel(pendingAction)}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

async function requestBookmarkPermissions(
  bookmarks: readonly BookmarkRecord[],
): Promise<boolean> {
  const urls = bookmarks
    .map((bookmark) => bookmark.url)
    .filter((url) => Boolean(hostPermissionOrigin(url)));
  return urls.length === 0 ? true : requestHostPermissions(urls);
}

function HealthMetric({ value, label, tone }: { value: number; label: string; tone: "neutral" | "mint" | "amber" | "danger" | "blue" }) {
  return <div className={`health-metric metric-${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function HealthTab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick(): void }) {
  return <button type="button" role="tab" aria-selected={active} className={active ? "is-active" : ""} onClick={onClick}>{label}<span>{count}</span></button>;
}

function EmptyHealthResult({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="health-empty">{icon}<span>{text}</span></div>;
}

function HealthRecordRow({ record, bookmark, workspace, actions }: { record: BookmarkHealthRecord; bookmark: BookmarkRecord; workspace: WorkspaceLayout; actions: React.ReactNode[] }) {
  return (
    <article className={`health-record status-${record.status}`}>
      <span className="health-record-icon">{record.status === "confirmed-dead" || record.status === "suspected-dead" ? <LinkBreak size={20} /> : record.status === "redirected" ? <ArrowSquareOut size={20} /> : <WarningCircle size={20} />}</span>
      <div className="health-record-copy">
        <div><strong>{bookmark.title || bookmark.url}</strong><span className={`health-status-pill status-${record.status}`}>{healthStatusText(record)}</span></div>
        <small>{bookmark.url}</small>
        {record.finalUrl && record.finalUrl !== bookmark.url && <small className="health-final-url">→ {record.finalUrl}</small>}
        {record.redirectChain && record.redirectChain.length > 0 && (
          <small className="health-redirect-chain">
            跳转链：{record.redirectChain.map((hop) => hop.status || "状态未知").join(" → ")}
          </small>
        )}
        <em>{bookmarkLocation(workspace, bookmark.id)} · {new Date(record.checkedAt).toLocaleString("zh-CN")}{record.error ? ` · ${record.error}` : ""}</em>
      </div>
      <div className="health-record-actions">{actions}</div>
    </article>
  );
}

function HealthLiveConsole({ job, live }: { job: BookmarkHealthJob; live: boolean }) {
  const consoleRef = useRef<HTMLDivElement>(null);
  const followingLatestRef = useRef(true);
  const [followingLatest, setFollowingLatest] = useState(true);
  const entries = buildHealthConsoleEntries(job);
  const requestCount = job.items.reduce(
    (count, item) => count + (item.requests?.length ?? 0),
    0,
  );
  const signature = `${job.updatedAt}:${requestCount}:${job.processed}:${job.failed}`;

  useEffect(() => {
    const output = consoleRef.current;
    if (!output || !followingLatestRef.current) return;
    const timeout = window.setTimeout(() => {
      if (followingLatestRef.current) output.scrollTop = output.scrollHeight;
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [signature]);

  function handleScroll() {
    const output = consoleRef.current;
    if (!output) return;
    const shouldFollow =
      output.scrollHeight - output.scrollTop - output.clientHeight <= 72;
    followingLatestRef.current = shouldFollow;
    setFollowingLatest(shouldFollow);
  }

  function scrollToLatest() {
    const output = consoleRef.current;
    if (!output) return;
    followingLatestRef.current = true;
    setFollowingLatest(true);
    output.scrollTop = output.scrollHeight;
  }

  return (
    <div className="job-console health-live-console" ref={consoleRef} onScroll={handleScroll} role="log" aria-label="书签体检实时日志" aria-live="polite">
      <div className="job-console-toolbar">
        <span className="console-lights" aria-hidden="true"><i /><i /><i /></span>
        <strong>书签体检实时控制台</strong>
        <button type="button" className={`console-follow-button${followingLatest ? "" : " is-paused"}`} aria-label={followingLatest ? "正在跟随最新体检日志" : "已暂停，回到最新体检日志"} onClick={scrollToLatest}>{followingLatest ? "跟随最新" : "已暂停 · 回到底部"}</button>
      </div>
      <div className="job-console-output">
        {entries.map((entry) => (
          <div className={`console-entry console-${entry.kind}`} key={entry.key}>
            <time>{formatHealthLogTime(entry.time)}</time>
            <span className="console-symbol">{healthConsoleSymbol(entry.kind)}</span>
            <div><div className="console-message">{entry.message}</div>{entry.detail && <pre>{entry.detail}</pre>}</div>
          </div>
        ))}
        <div className="console-entry console-live"><time>{formatHealthLogTime(live ? Date.now() : job.updatedAt)}</time><span className="console-symbol">›</span><div className="console-message">{live ? <>等待下一条输出<span className="console-cursor" /></> : "任务已结束，以上为完整请求日志"}</div></div>
      </div>
    </div>
  );
}

type HealthConsoleEntryKind = "info" | "request" | "response" | "success" | "error" | "waiting";

interface HealthConsoleEntry {
  key: string;
  time: number;
  kind: HealthConsoleEntryKind;
  message: string;
  detail?: string;
}

function buildHealthConsoleEntries(job: BookmarkHealthJob): HealthConsoleEntry[] {
  const entries: HealthConsoleEntry[] = [{
    key: `${job.id}-start`,
    time: job.createdAt,
    kind: "info",
    message: `体检任务已创建，共 ${job.items.length} 个 URL`,
  }];
  let waitingShown = false;
  for (const item of job.items) {
    const requests = item.requests ?? [];
    if (requests.length === 0 && !waitingShown && item.status === "queued") {
      waitingShown = true;
      entries.push({ key: `${item.bookmarkId}-waiting`, time: job.updatedAt, kind: "waiting", message: `等待检测：${item.title}`, detail: item.url });
    }
    for (const request of requests) {
      entries.push({
        key: `${request.id}-request`,
        time: request.startedAt,
        kind: "request",
        message: `${item.title} · 发送 ${request.method} 请求`,
        detail: [`${request.method} ${request.url}`, `credentials: ${request.credentialsMode ?? job.credentialsMode ?? "omit"}`, "cache: no-store", `redirect: ${request.redirectMode ?? "follow"}`, ...Object.entries(request.headers).map(([key, value]) => `${key}: ${value}`)].join("\n"),
      });
      if (request.response) {
        entries.push({
          key: `${request.id}-response`,
          time: request.completedAt ?? job.updatedAt,
          kind: request.response.status >= 400 || request.response.status === 0 ? "error" : "response",
          message: `${item.title} · 返回 HTTP ${request.response.status}`,
          detail: [`最终地址：${request.response.finalUrl}`, `发生跳转：${request.response.redirected ? "是" : "否"}`, ...(request.response.location ? [`跳转目标：${request.response.location}`] : [])].join("\n"),
        });
      } else if (request.error) {
        entries.push({ key: `${request.id}-error`, time: request.completedAt ?? job.updatedAt, kind: "error", message: `${item.title} · ${request.method} 请求失败`, detail: request.error });
      }
    }
    if (item.status === "completed" && item.resultStatus) {
      const normal = item.resultStatus === "healthy" || item.resultStatus === "redirected";
      entries.push({ key: `${item.bookmarkId}-result-${item.resultStatus}`, time: job.updatedAt, kind: normal ? "success" : "info", message: `${item.title} · 检测结论：${healthStatusLabel(item.resultStatus)}`, detail: item.url });
    } else if (item.status === "failed" && item.error) {
      entries.push({ key: `${item.bookmarkId}-failed`, time: job.updatedAt, kind: "error", message: `${item.title} · 任务失败`, detail: item.error });
    }
  }
  return entries;
}

function healthConsoleSymbol(kind: HealthConsoleEntryKind): string {
  return { info: "i", request: "→", response: "←", success: "✓", error: "!", waiting: "·" }[kind];
}

function formatHealthLogTime(value: number): string {
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function bookmarkLocation(workspace: WorkspaceLayout, bookmarkId: string): string {
  for (const category of workspace.categories) {
    if (category.bookmarkIds.includes(bookmarkId)) return `${category.title} / 未分组`;
    for (const group of category.groups) {
      if (group.bookmarkIds.includes(bookmarkId)) return `${category.title} / ${group.title}`;
    }
  }
  return "未分类";
}

function duplicateConfidenceText(confidence: DuplicateConfidence) {
  if (confidence === "exact") return "确定重复";
  if (confidence === "tracking") return "跟踪参数差异";
  return "最终目标相同";
}

function healthStatusText(record: BookmarkHealthRecord) {
  if (record.restrictionReason === "login-redirect") {
    return "跳转到登录页";
  }
  const code = record.httpStatus ? ` · ${record.httpStatus}` : "";
  return `${healthStatusLabel(record.status)}${code}`;
}

function healthStatusLabel(status: BookmarkHealthRecord["status"]) {
  const labels: Record<BookmarkHealthRecord["status"], string> = {
    healthy: "正常",
    redirected: "跳转",
    "auth-required": "需要登录或受限",
    "rate-limited": "请求受限",
    "http-error": "HTTP 异常",
    "server-error": "服务端异常",
    "network-error": "网络异常",
    "temporary-error": "临时异常",
    "suspected-dead": "疑似死链",
    "confirmed-dead": "确认死链",
    unsupported: "无法检测",
  };
  return labels[status];
}

function healthJobStatusText(job: BookmarkHealthJob) {
  const labels: Record<BookmarkHealthJob["status"], string> = {
    queued: "等待检测",
    running: "正在检测",
    paused: "已暂停",
    cancelled: "已取消",
    failed: "部分检测失败",
    completed: "检测完成",
  };
  return labels[job.status];
}

function fullScanOverviewLabel(job: BookmarkHealthJob) {
  if (job.status === "queued") return "本轮完整体检等待开始";
  if (job.status === "running") return "本轮完整体检进行中";
  if (job.status === "paused") return "本轮完整体检已暂停";
  if (job.status === "cancelled") return "本轮完整体检已取消，当前为部分统计";
  if (job.status === "failed") return "本轮完整体检未完成，当前为部分统计";
  return "本轮完整体检已完成";
}

function pendingActionTitle(action: PendingAction) {
  if (action.kind === "merge") return "合并并删除重复书签？";
  if (action.kind === "delete") return "删除这条原生书签？";
  if (action.kind === "cookie-recheck") return `带 Cookie 复检 ${action.bookmarks.length} 条书签？`;
  return "清空本地体检结果？";
}

function pendingActionDescription(action: PendingAction) {
  if (action.kind === "merge") {
    return `将保留“${action.group.bookmarks.find((bookmark) => bookmark.id === action.primaryId)?.title}”，合并标签后从 Chrome 删除另外 ${action.group.bookmarks.length - 1} 条。删除后恢复会产生新的书签 ID。`;
  }
  if (action.kind === "delete") {
    return `“${action.bookmark.title}”会从 Chrome 原生书签中删除。重新创建时无法恢复原 bookmark ID。`;
  }
  if (action.kind === "cookie-recheck") {
    return "浏览器只会在本次复检请求中自动附带目标网站当前登录态。插件不会读取或保存 Cookie；成功后只把体检结果标记为正常，不修改任何书签地址。";
  }
  return "只会删除本机的检测结果和任务历史，不会删除、修改或移动任何书签。";
}

function pendingActionConfirmLabel(action: PendingAction) {
  if (action.kind === "cookie-recheck") return `确认复检 ${action.bookmarks.length} 条`;
  return "确认执行";
}

function recoverySnapshotTitle(snapshot: BookmarkRecoverySnapshot) {
  if (snapshot.action === "merge") return "重复书签合并";
  if (snapshot.action === "update") return "书签地址更新";
  return "书签删除";
}
