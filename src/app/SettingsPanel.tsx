import {
  ArrowClockwise,
  Brain,
  CaretDown,
  CaretRight,
  CheckCircle,
  Clock,
  Cloud,
  CloudArrowDown,
  CloudArrowUp,
  DownloadSimple,
  Eye,
  EyeSlash,
  FirstAidKit,
  GearSix,
  GoogleLogo,
  ImageSquare,
  Info,
  Play,
  Quotes,
  SignOut,
  SquaresFour,
  Stop,
  Tag,
  Trash,
  UploadSimple,
  UserMinus,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AiJob,
  AiJobItemLog,
  AiTaggingLimit,
  AiTaggingScope,
  AppSettings,
  BackgroundAsset,
  BackgroundPreferences,
  BookmarkRecord,
  CloudState,
  LanguagePreference,
  ProviderConfig,
  WidgetPreferences,
  WorkspaceLayout,
} from "@/domain/types";
import {
  AI_PROVIDER_PRESETS,
  applyAiProviderPreset,
  CUSTOM_PROVIDER_ID,
  getAiProviderPreset,
  inferAiProviderPresetId,
  type AiProviderPresetId,
} from "@/domain/aiProviders";
import {
  AI_TAGGING_LIMIT_OPTIONS,
  matchesTaggingScope,
  selectTaggingCandidates,
} from "@/domain/tagging";
import { TIME_STYLE_OPTIONS } from "@/domain/timeDisplay";
import { buildWorkspaceFromBookmarks } from "@/domain/layout";
import type { BackupRestoreResult } from "@/services/backup";
import {
  CloudBackupConflictError,
  type CloudBackupConflict,
  type CloudUploadOptions,
} from "@/services/cloud";
import {
  useI18n,
  type TranslationKey,
} from "@/i18n";
import { BackgroundSettings } from "./BackgroundSettings";
import { HomeClock } from "./HomeClock";
import { WidgetSettings } from "./WidgetSettings";
import { BookmarkHealthSettings } from "./BookmarkHealthSettings";

const CLOCK_STYLE_PREVIEW_DATE = new Date(2026, 7, 3, 16, 28, 9);

interface SettingsPanelProps {
  settings: AppSettings;
  bookmarks: BookmarkRecord[];
  workspace?: WorkspaceLayout;
  jobs: AiJob[];
  cloudState: CloudState;
  backgroundAssets?: BackgroundAsset[];
  initialSection?: SettingsSectionId;
  onSave(next: AppSettings): Promise<boolean>;
  onStartTagging(
    scope: AiTaggingScope,
    limit: AiTaggingLimit,
  ): Promise<void>;
  onUndoAiOrganization(): Promise<void>;
  onCancelJob(id: string): Promise<void>;
  onRetryJob(id: string): Promise<void>;
  onExportBackup(): Promise<void>;
  onRestoreBackup(file: File): Promise<BackupRestoreResult>;
  onGoogleLogin(apiBaseUrl: string): Promise<void>;
  onCloudLogout(apiBaseUrl: string): Promise<void>;
  onCloudUpload(
    apiBaseUrl: string,
    recoveryPassword?: string,
    options?: CloudUploadOptions,
  ): Promise<void>;
  onCloudRestore(
    apiBaseUrl: string,
    recoveryPassword: string,
  ): Promise<BackupRestoreResult>;
  onDeleteCloudBackup?(apiBaseUrl: string): Promise<void>;
  onDeleteCloudAccount?(apiBaseUrl: string): Promise<void>;
  onApplyBackground?(preferences: BackgroundPreferences): Promise<void>;
  onUploadBackground?(file: File): Promise<void>;
  onDeleteBackground?(assetId: string): Promise<void>;
  onRefreshBackgrounds?(): Promise<void>;
  onOpenHealthBookmark?(url: string): Promise<void>;
  onUpdateHealthBookmarkUrls?(
    updates: Array<{ bookmarkId: string; finalUrl: string }>,
  ): Promise<void>;
  onDeleteHealthBookmarks?(bookmarkIds: string[]): Promise<void>;
  onMergeHealthDuplicates?(primaryId: string, duplicateIds: string[]): Promise<void>;
  onRestoreHealthSnapshot?(snapshotId: string): Promise<void>;
}

export type SettingsSectionId =
  | "provider"
  | "tagging"
  | "health"
  | "backup"
  | "cloud"
  | "background"
  | "widgets"
  | "display"
  | "general";

const SETTINGS_SECTION_COPY: Record<
  SettingsSectionId,
  { title: TranslationKey; description: TranslationKey }
> = {
  provider: {
    title: "AI 与模型",
    description: "选择国内外主流大模型服务商、模型与本地 BYOK 密钥。",
  },
  tagging: {
    title: "AI 标签任务",
    description: "批量处理未标注网页，查看整体进度与每个书签的完整结果。",
  },
  health: {
    title: "书签体检",
    description: "在本地识别重复候选，并通过可恢复后台任务检测死链、跳转和访问异常。",
  },
  backup: {
    title: "备份与恢复",
    description: "安全导出布局、分组与标签，或从已有备份恢复。",
  },
  cloud: {
    title: "账户与云同步",
    description: "连接 Google 账户，并通过 SmartAINewTab 云端保存端到端加密备份。",
  },
  background: {
    title: "背景与外观",
    description: "选择、上传并轮播新标签页背景，实时预览最终效果。",
  },
  widgets: {
    title: "小部件中心",
    description: "从 13 种预设中选择 2–8 个，并配置首屏顺序与数据偏好。",
  },
  display: {
    title: "屏幕展示",
    description: "控制首页时间与每日古籍警句，并选择时间的排版样式。",
  },
  general: {
    title: "通用偏好",
    description: "调整界面语言、本地搜索与网址打开方式。",
  },
};

export function SettingsPanel({
  settings,
  bookmarks,
  workspace,
  jobs,
  cloudState,
  backgroundAssets = [],
  initialSection = "tagging",
  onSave,
  onStartTagging,
  onUndoAiOrganization,
  onCancelJob,
  onRetryJob,
  onExportBackup,
  onRestoreBackup,
  onGoogleLogin,
  onCloudLogout,
  onCloudUpload,
  onCloudRestore,
  onDeleteCloudBackup,
  onDeleteCloudAccount,
  onApplyBackground,
  onUploadBackground,
  onDeleteBackground,
  onRefreshBackgrounds,
  onOpenHealthBookmark,
  onUpdateHealthBookmarkUrls,
  onDeleteHealthBookmarks,
  onMergeHealthDuplicates,
  onRestoreHealthSnapshot,
}: SettingsPanelProps) {
  const { t, localize } = useI18n();
  const healthWorkspace = workspace ?? buildWorkspaceFromBookmarks(bookmarks);
  const totalUntaggedCount = bookmarks.filter(
    (bookmark) => bookmark.aiTags.length === 0,
  ).length;
  const completedBookmarks = bookmarks.filter(
    (bookmark) => bookmark.aiTags.length > 0,
  );
  const completedBookmarkCount = completedBookmarks.length;
  const totalBookmarkCount = bookmarks.length;
  const completionProgress =
    totalBookmarkCount === 0
      ? 0
      : Math.round((completedBookmarkCount / totalBookmarkCount) * 100);
  const latestCompletedLogByBookmarkId = useMemo(() => {
    const latest = new Map<
      string,
      { log: AiJobItemLog; updatedAt: number }
    >();
    for (const job of jobs) {
      for (const log of job.logs ?? []) {
        if (log.status !== "completed") continue;
        const current = latest.get(log.bookmarkId);
        if (!current || job.updatedAt > current.updatedAt) {
          latest.set(log.bookmarkId, { log, updatedAt: job.updatedAt });
        }
      }
    }
    return new Map(
      [...latest].map(([bookmarkId, value]) => [bookmarkId, value.log]),
    );
  }, [jobs]);
  const [taggingScope, setTaggingScope] =
    useState<AiTaggingScope>("untagged");
  const [taggingLimit, setTaggingLimit] = useState<AiTaggingLimit>(10);
  const [showAllReprocessConfirmation, setShowAllReprocessConfirmation] =
    useState(false);
  const totalTaggingScopeCount = bookmarks.filter((bookmark) =>
    matchesTaggingScope(bookmark, taggingScope),
  ).length;
  const availableTaggingCount = selectTaggingCandidates(
    bookmarks,
    jobs,
    "all",
    taggingScope,
  ).length;
  const selectedTaggingCount =
    taggingLimit === "all"
      ? availableTaggingCount
      : Math.min(taggingLimit, availableTaggingCount);
  const scopeIsReserved =
    totalTaggingScopeCount > 0 && availableTaggingCount === 0;
  const taggingActionLabel =
    scopeIsReserved
      ? "所选范围的书签已在任务队列中"
      : taggingScope === "untagged"
        ? selectedTaggingCount > 0
          ? taggingLimit === "all"
            ? `为全部 ${selectedTaggingCount} 个未处理书签打标签`
            : `为 ${selectedTaggingCount} 个未处理书签打标签`
          : "使用现有 AI 标签检查并整理"
        : taggingScope === "processed"
          ? taggingLimit === "all"
            ? `重新处理全部 ${selectedTaggingCount} 个已有 AI 结果的书签`
            : `重新处理 ${selectedTaggingCount} 个已有 AI 结果的书签`
          : taggingLimit === "all"
            ? `重新处理全部 ${selectedTaggingCount} 个书签`
            : `重新处理 ${selectedTaggingCount} 个书签（包含已有 AI 结果）`;
  const [provider, setProvider] = useState(settings.provider);
  const [providerPresetId, setProviderPresetId] = useState<
    AiProviderPresetId | typeof CUSTOM_PROVIDER_ID
  >(() => inferAiProviderPresetId(settings.provider.endpoint));
  const providerPreset = getAiProviderPreset(providerPresetId);
  const selectedModelOption = providerPreset?.models.some(
    (model) => model.id === provider.model,
  )
    ? provider.model
    : CUSTOM_PROVIDER_ID;
  const selectedModelPreset = providerPreset?.models.find(
    (model) => model.id === provider.model,
  );
  const [includeSummaries, setIncludeSummaries] = useState(
    settings.includeSummaries,
  );
  const [language, setLanguage] = useState<LanguagePreference>(
    settings.language,
  );
  const [autoTagNewBookmarks, setAutoTagNewBookmarks] = useState(
    settings.autoTagNewBookmarks,
  );
  const [autoOrganizeBookmarks, setAutoOrganizeBookmarks] = useState(
    settings.autoOrganizeBookmarks,
  );
  const [openInNewTab, setOpenInNewTab] = useState(settings.openInNewTab);
  const [bookmarkHealth, setBookmarkHealth] = useState(
    settings.bookmarkHealth,
  );
  const [screenDisplay, setScreenDisplay] = useState(settings.screenDisplay);
  const [widgets, setWidgets] = useState<WidgetPreferences>(settings.widgets);
  const [background, setBackground] = useState<BackgroundPreferences>(
    settings.background,
  );
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cloudConflict, setCloudConflict] =
    useState<CloudBackupConflict>();
  const [cloudConflictError, setCloudConflictError] = useState("");
  const [cloudDeleteIntent, setCloudDeleteIntent] = useState<
    "backup" | "account"
  >();
  const [completedBookmarksExpanded, setCompletedBookmarksExpanded] =
    useState(false);
  const [expandedCompletedBookmarkId, setExpandedCompletedBookmarkId] =
    useState<string>();
  const [expandedJobId, setExpandedJobId] = useState<string>();
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>(initialSection);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const settingsBodyRef = useRef<HTMLDivElement>(null);
  const cloudMergeButtonRef = useRef<HTMLButtonElement>(null);

  const hasUnsavedChanges =
    JSON.stringify(provider) !== JSON.stringify(settings.provider) ||
    language !== settings.language ||
    includeSummaries !== settings.includeSummaries ||
    autoTagNewBookmarks !== settings.autoTagNewBookmarks ||
    autoOrganizeBookmarks !== settings.autoOrganizeBookmarks ||
    openInNewTab !== settings.openInNewTab ||
    JSON.stringify(bookmarkHealth) !== JSON.stringify(settings.bookmarkHealth) ||
    JSON.stringify(screenDisplay) !== JSON.stringify(settings.screenDisplay) ||
    JSON.stringify(widgets) !== JSON.stringify(settings.widgets) ||
    JSON.stringify(background) !== JSON.stringify(settings.background);

  const footerMessage =
    message ||
    (hasUnsavedChanges ? t("有未保存的更改") : t("所有更改已保存"));

  useEffect(() => {
    setProvider(settings.provider);
    setProviderPresetId(inferAiProviderPresetId(settings.provider.endpoint));
  }, [settings.provider]);

  useEffect(() => {
    setLanguage(settings.language);
  }, [settings.language]);

  useEffect(() => {
    setBackground(settings.background);
  }, [settings.background]);

  useEffect(() => {
    setScreenDisplay(settings.screenDisplay);
  }, [settings.screenDisplay]);

  useEffect(() => {
    setWidgets(settings.widgets);
  }, [settings.widgets]);

  useEffect(() => {
    setBookmarkHealth(settings.bookmarkHealth);
  }, [settings.bookmarkHealth]);

  useEffect(() => {
    if (settingsBodyRef.current) settingsBodyRef.current.scrollTop = 0;
  }, [activeSection]);

  useEffect(() => {
    const latest = jobs[0];
    if (latest && isLiveJob(latest)) {
      setExpandedJobId(latest.id);
    }
  }, [jobs]);

  useEffect(() => {
    if (!cloudConflict) return;
    const timeout = window.setTimeout(
      () => cloudMergeButtonRef.current?.focus(),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [cloudConflict]);

  const updateProvider = <K extends keyof ProviderConfig>(
    key: K,
    value: ProviderConfig[K],
  ) => setProvider((current) => ({ ...current, [key]: value }));

  function handleProviderPresetChange(
    value: AiProviderPresetId | typeof CUSTOM_PROVIDER_ID,
  ) {
    setProviderPresetId(value);
    if (value === CUSTOM_PROVIDER_ID) return;
    const preset = getAiProviderPreset(value);
    if (!preset) return;
    const endpointChanged =
      provider.endpoint.trim().replace(/\/+$/, "").toLowerCase() !==
      preset.endpoint.toLowerCase();
    setProvider((current) => applyAiProviderPreset(current, preset));
    if (endpointChanged && provider.apiKey) {
      setShowKey(false);
      setMessage("已切换服务商，请填写对应的 API Key");
    }
  }

  async function handleSave() {
    setMessage(t("正在保存…"));
    const granted = await onSave({
      ...settings,
      language,
      provider,
      autoTagNewBookmarks,
      autoOrganizeBookmarks,
      includeSummaries,
      openInNewTab,
      bookmarkHealth,
      screenDisplay,
      widgets,
      background,
    });
    setMessage(
      granted ? t("设置已保存") : t("Provider 域名授权未通过"),
    );
  }

  async function runAction(
    action: () => Promise<void | string>,
    successMessage: string,
  ) {
    setBusy(true);
    setMessage("正在处理…");
    try {
      const result = await action();
      setMessage(result || successMessage);
    } catch (error) {
      setMessage(
        `失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreBackup(file?: File) {
    if (!file) return;
    await runAction(async () => {
      const result = await onRestoreBackup(file);
      return `恢复完成：匹配 ${result.matched}，未匹配 ${result.unmatched}，重复候选 ${result.ambiguous}`;
    }, "恢复完成");
  }

  async function handleCloudUpload(options?: CloudUploadOptions) {
    setBusy(true);
    setMessage("正在检查云端版本…");
    setCloudConflictError("");
    try {
      await onCloudUpload(
        settings.cloudApiBaseUrl,
        recoveryPassword || undefined,
        options,
      );
      setCloudConflict(undefined);
      setMessage("加密备份已上传");
    } catch (error) {
      if (error instanceof CloudBackupConflictError) {
        setCloudConflict(error.conflict);
        setMessage("上传已暂停：请先选择如何处理云端版本");
      } else {
        const errorMessage =
          error instanceof Error ? error.message : "未知错误";
        if (options) setCloudConflictError(errorMessage);
        setMessage(`失败：${errorMessage}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCloudMerge() {
    setBusy(true);
    setCloudConflictError("");
    setMessage("正在解密并合并云端备份…");
    try {
      const result = await onCloudRestore(
        settings.cloudApiBaseUrl,
        recoveryPassword,
      );
      setCloudConflict(undefined);
      setMessage(
        `云端备份已合并：匹配 ${result.matched}，未匹配 ${result.unmatched}，重复候选 ${result.ambiguous}；确认后可重新上传`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "未知错误";
      setCloudConflictError(errorMessage);
      setMessage(`失败：${errorMessage}`);
    } finally {
      setBusy(false);
    }
  }

  function cancelCloudConflict() {
    if (busy) return;
    setCloudConflict(undefined);
    setCloudConflictError("");
    setMessage("已取消上传，云端备份未修改");
  }

  async function handleCloudDelete() {
    if (!cloudDeleteIntent) return;
    const intent = cloudDeleteIntent;
    await runAction(async () => {
      if (intent === "backup") {
        await onDeleteCloudBackup?.(settings.cloudApiBaseUrl);
        setCloudDeleteIntent(undefined);
        return "云端备份已删除；本机书签和设置未改变";
      }
      await onDeleteCloudAccount?.(settings.cloudApiBaseUrl);
      setCloudDeleteIntent(undefined);
      return "云端账户及其备份已删除";
    }, intent === "backup" ? "云端备份已删除" : "云端账户已删除");
  }

  function handleStartTagging() {
    if (taggingScope === "all") {
      setShowAllReprocessConfirmation(true);
      return;
    }
    void onStartTagging(taggingScope, taggingLimit);
  }

  return (
    <div className="settings-content">
      <aside className="settings-sidebar" aria-label={t("设置分类")}>
        <nav className="settings-navigation">
          <button
            className={activeSection === "provider" ? "is-active" : ""}
            onClick={() => setActiveSection("provider")}
            aria-current={activeSection === "provider" ? "page" : undefined}
          >
            <Brain size={20} weight="duotone" />
            <span>{t("AI 与模型")}</span>
          </button>
          <button
            className={activeSection === "tagging" ? "is-active" : ""}
            onClick={() => setActiveSection("tagging")}
            aria-current={activeSection === "tagging" ? "page" : undefined}
          >
            <Tag size={20} weight="duotone" />
            <span>{t("AI 标签任务")}</span>
          </button>
          <button
            className={activeSection === "health" ? "is-active" : ""}
            onClick={() => setActiveSection("health")}
            aria-current={activeSection === "health" ? "page" : undefined}
          >
            <FirstAidKit size={20} weight="duotone" />
            <span>{t("书签体检")}</span>
          </button>
          <button
            className={activeSection === "backup" ? "is-active" : ""}
            onClick={() => setActiveSection("backup")}
            aria-current={activeSection === "backup" ? "page" : undefined}
          >
            <DownloadSimple size={20} weight="duotone" />
            <span>{t("备份与恢复")}</span>
          </button>
          <button
            className={activeSection === "cloud" ? "is-active" : ""}
            onClick={() => setActiveSection("cloud")}
            aria-current={activeSection === "cloud" ? "page" : undefined}
          >
            <Cloud size={20} weight="duotone" />
            <span>{t("账户与云同步")}</span>
          </button>
          <button
            className={activeSection === "general" ? "is-active" : ""}
            onClick={() => setActiveSection("general")}
            aria-current={activeSection === "general" ? "page" : undefined}
          >
            <GearSix size={20} weight="duotone" />
            <span>{t("通用偏好")}</span>
          </button>
          <button
            className={activeSection === "widgets" ? "is-active" : ""}
            onClick={() => setActiveSection("widgets")}
            aria-current={activeSection === "widgets" ? "page" : undefined}
          >
            <SquaresFour size={20} weight="duotone" />
            <span>{t("小部件中心")}</span>
          </button>
          <button
            className={activeSection === "display" ? "is-active" : ""}
            onClick={() => setActiveSection("display")}
            aria-current={activeSection === "display" ? "page" : undefined}
          >
            <Clock size={20} weight="duotone" />
            <span>{t("屏幕展示")}</span>
          </button>
          <button
            className={activeSection === "background" ? "is-active" : ""}
            onClick={() => setActiveSection("background")}
            aria-current={activeSection === "background" ? "page" : undefined}
          >
            <ImageSquare size={20} weight="duotone" />
            <span>{t("背景与外观")}</span>
          </button>
        </nav>
      </aside>

      <main className="settings-main">
        <header className="settings-page-header">
          <div>
            <h2>{t(SETTINGS_SECTION_COPY[activeSection].title)}</h2>
            <p>{t(SETTINGS_SECTION_COPY[activeSection].description)}</p>
          </div>
        </header>
        <div className="settings-page-body" ref={settingsBodyRef}>
      {activeSection === "provider" && (
      <section className="settings-section">
        <div className="settings-heading">
          <Brain size={22} weight="duotone" />
          <div>
            <h3>{t("AI Provider（BYOK）")}</h3>
            <p>
              {t("仅在你主动检索、执行标签任务或启用自动标签时发送书签元数据。")}
            </p>
          </div>
        </div>
        <label className="switch-row">
          <span>{t("启用 AI 增强")}</span>
          <input
            type="checkbox"
            checked={provider.enabled}
            onChange={(event) =>
              updateProvider("enabled", event.target.checked)
            }
          />
        </label>
        <div className="field-grid provider-field-grid">
          <label>
            <span>{t("模型服务商")}</span>
            <select
              value={providerPresetId}
              onChange={(event) =>
                handleProviderPresetChange(
                  event.target.value as
                    | AiProviderPresetId
                    | typeof CUSTOM_PROVIDER_ID,
                )
              }
            >
              {(["国内", "海外"] as const).map((region) => (
                <optgroup
                  key={region}
                  label={t(
                    region === "国内" ? "国内主流模型" : "海外主流模型",
                  )}
                >
                  {AI_PROVIDER_PRESETS.filter(
                    (preset) => preset.region === region,
                  ).map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={CUSTOM_PROVIDER_ID}>
                {t("自定义兼容服务")}
              </option>
            </select>
          </label>
          <label>
            <span>{t("模型")}</span>
            {providerPreset ? (
              <select
                value={selectedModelOption}
                onChange={(event) =>
                  updateProvider(
                    "model",
                    event.target.value === CUSTOM_PROVIDER_ID
                      ? ""
                      : event.target.value,
                  )
                }
              >
                {providerPreset.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} · {model.tier}
                  </option>
                ))}
                <option value={CUSTOM_PROVIDER_ID}>
                  {t("自定义模型 ID")}
                </option>
              </select>
            ) : (
              <input
                value={provider.model}
                onChange={(event) =>
                  updateProvider("model", event.target.value)
                }
                placeholder={t("请输入模型 ID")}
              />
            )}
          </label>
          {providerPreset && selectedModelOption === CUSTOM_PROVIDER_ID && (
            <label className="field-span provider-custom-model">
              <span>{t("自定义模型 ID")}</span>
              <input
                autoFocus
                value={provider.model}
                onChange={(event) =>
                  updateProvider("model", event.target.value)
                }
                placeholder={t("以服务商控制台显示的模型 ID 为准")}
              />
            </label>
          )}
          <label className="field-span">
            <span>{t("API Endpoint（高级配置）")}</span>
            <input
              value={provider.endpoint}
              onChange={(event) =>
                updateProvider("endpoint", event.target.value)
              }
              placeholder="https://api.example.com/v1"
            />
          </label>
          <label className="field-span">
            <span>API Key</span>
            <span className="secret-field">
              <input
                type={showKey ? "text" : "password"}
                value={provider.apiKey}
                autoComplete="off"
                onChange={(event) => updateProvider("apiKey", event.target.value)}
                placeholder={providerPreset?.apiKeyPlaceholder ?? "sk-…"}
              />
              <button
                className="icon-button"
                onClick={() => setShowKey((value) => !value)}
                aria-label={
                  showKey ? t("隐藏 API Key") : t("显示 API Key")
                }
              >
                {showKey ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
        </div>
        <div className="provider-summary">
          <div className="provider-summary-heading">
            <span className="provider-region">
              {providerPreset?.region
                ? t(providerPreset.region)
                : t("自定义")}
            </span>
            <strong>{providerPreset?.name ?? "OpenAI-compatible"}</strong>
            {selectedModelPreset && <span>{selectedModelPreset.tier}</span>}
          </div>
          <p>
            {providerPreset?.note ??
              t("Endpoint 需要接受 Bearer Token，并提供 Chat Completions 兼容响应。")}
          </p>
        </div>
        <div className="privacy-note">
          <Info size={17} />
          <span>
            Key 不会写入代码、备份或云同步。切换服务商时旧 Key 会被清空；浏览器本地存储并非系统钥匙串，建议使用单独且有限额的 Key。
          </span>
        </div>
      </section>
      )}

      {activeSection === "backup" && (
      <section className="settings-section">
        <div className="settings-heading">
          <DownloadSimple size={22} weight="duotone" />
          <div>
            <h3>{t("完整备份与恢复")}</h3>
            <p>
              {t("导出分类、分组、排序、AI 标签和设置；任何大模型 API Key 都不会进入备份。")}
            </p>
          </div>
        </div>
        <input
          ref={backupInputRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            void handleRestoreBackup(file);
          }}
        />
        <div className="inline-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void runAction(onExportBackup, "完整备份已导出")
            }
          >
            <DownloadSimple size={17} /> {t("导出完整备份")}
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => backupInputRef.current?.click()}
          >
            <UploadSimple size={17} /> {t("从备份恢复")}
          </button>
        </div>
        <div className="privacy-note">
          <Info size={17} />
          <span>
            恢复按书签 ID 优先、规范化 URL
            兜底匹配，不会创建、删除或重排 Chrome 原生书签。
          </span>
        </div>
      </section>
      )}

      {activeSection === "cloud" && (
      <section className="settings-section">
        <div className="settings-heading">
          <CloudArrowUp size={22} weight="duotone" />
          <div>
            <h3>{t("Google 账户与加密云备份")}</h3>
            <p>
              登录会向 Google 请求稳定账户标识、已验证邮箱、显示名和头像，
              仅用于创建并显示同步账户；不会读取 Gmail 或 Google Drive。
              书签在浏览器内加密后才上传到 SmartAINewTab 云端。
            </p>
          </div>
        </div>
        <div className="field-grid">
          <label className="field-span">
            <span>{t("恢复密码（首次备份或恢复时使用）")}</span>
            <input
              type="password"
              value={recoveryPassword}
              autoComplete="new-password"
              onChange={(event) => setRecoveryPassword(event.target.value)}
              placeholder={t("至少 12 位；服务端无法找回")}
            />
          </label>
        </div>
        {cloudState.user ? (
          <div className="cloud-account">
            <span>
              <strong>
                {cloudState.user.displayName || t("Google 用户")}
              </strong>
              <small>{cloudState.user.email}</small>
            </span>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void runAction(
                  () => onCloudLogout(settings.cloudApiBaseUrl),
                  "已退出云端账户",
                )
              }
            >
              <SignOut size={16} /> {t("退出")}
            </button>
          </div>
        ) : (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void runAction(
                () => onGoogleLogin(settings.cloudApiBaseUrl),
                "Google 登录成功",
              )
            }
          >
            <GoogleLogo size={17} weight="bold" /> {t("使用 Google 登录")}
          </button>
        )}
        {cloudState.user && (
          <div className="inline-actions cloud-actions">
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void handleCloudUpload()}
            >
              <CloudArrowUp size={17} /> {t("上传当前备份")}
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void runAction(
                  async () => {
                    const result = await onCloudRestore(
                      settings.cloudApiBaseUrl,
                      recoveryPassword,
                    );
                    return `云端备份已恢复：匹配 ${result.matched}，未匹配 ${result.unmatched}，重复候选 ${result.ambiguous}`;
                  },
                  "云端备份已恢复",
                )
              }
            >
              <CloudArrowDown size={17} /> {t("从云端恢复")}
            </button>
          </div>
        )}
        <div className="privacy-note">
          <Info size={17} />
          <span>
            恢复密码和未加密书签不会上传。遗失恢复密码后，服务端无法解密或重置旧备份。
            {cloudState.lastSyncedAt
              ? ` 最近同步：${new Date(cloudState.lastSyncedAt).toLocaleString()}`
              : ""}
          </span>
        </div>
        {cloudState.user && (onDeleteCloudBackup || onDeleteCloudAccount) && (
          <div className="cloud-danger-zone">
            <div>
              <strong>{t("删除云端数据")}</strong>
              <p>
                {t("删除操作不会删除本机 Chrome 书签，也不会影响本地导出的备份文件。")}
              </p>
            </div>
            <div className="cloud-danger-actions">
              {onDeleteCloudBackup && (
                <button
                  className="secondary-button"
                  disabled={busy || cloudState.remoteRevision === 0}
                  onClick={() => setCloudDeleteIntent("backup")}
                >
                  <Trash size={16} /> {t("删除云端备份")}
                </button>
              )}
              {onDeleteCloudAccount && (
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={() => setCloudDeleteIntent("account")}
                >
                  <UserMinus size={16} /> {t("删除云端账户")}
                </button>
              )}
            </div>
            {cloudDeleteIntent && (
              <div
                className="cloud-delete-confirmation"
                role="alertdialog"
                aria-labelledby="cloud-delete-title"
                aria-describedby="cloud-delete-description"
              >
                <WarningCircle size={22} weight="duotone" />
                <div>
                  <strong id="cloud-delete-title">
                    {cloudDeleteIntent === "backup"
                      ? t("确认删除云端备份？")
                      : t("确认永久删除云端账户？")}
                  </strong>
                  <p id="cloud-delete-description">
                    {cloudDeleteIntent === "backup"
                      ? t("云端密文和同步版本会被删除；当前浏览器里的书签、布局和账户登录保持不变。")
                      : t("Google 账户资料、登录会话、云端备份及其元数据会被删除，并立即退出登录。此操作不可撤销。")}
                  </p>
                </div>
                <div className="cloud-delete-confirmation-actions">
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setCloudDeleteIntent(undefined)}
                  >
                    {t("取消")}
                  </button>
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={() => void handleCloudDelete()}
                  >
                    {cloudDeleteIntent === "backup"
                      ? t("确认删除备份")
                      : t("确认删除账户")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {activeSection === "tagging" && (
      <section className="settings-section settings-section-tagging">
        <div className="settings-heading">
          <Tag size={22} weight="duotone" />
          <div>
            <h3>{t("AI 标签任务")}</h3>
            <p>
              {t("首次全量任务会先完成所有标签与一级分类，再统一规划少量必要分组。")}
            </p>
          </div>
        </div>
        <div className="ai-tagging-controls">
          <label className="ai-tagging-limit">
            <span>{t("处理范围")}</span>
            <select
              aria-label={t("本次处理范围")}
              value={taggingScope}
              onChange={(event) => {
                setTaggingScope(event.target.value as AiTaggingScope);
                setShowAllReprocessConfirmation(false);
              }}
            >
              <option value="untagged">
                {t("仅未处理（{count}）", { count: totalUntaggedCount })}
              </option>
              <option value="processed">
                {t("仅已有 AI 结果（{count}）", {
                  count: completedBookmarkCount,
                })}
              </option>
              <option value="all">
                {t("全部书签（{count}）", { count: totalBookmarkCount })}
              </option>
            </select>
          </label>
          <label className="ai-tagging-limit">
            <span>{t("本次数量")}</span>
            <select
              aria-label={t("本次打标签数量")}
              value={taggingLimit}
              disabled={availableTaggingCount === 0}
              onChange={(event) => {
                setTaggingLimit(
                  event.target.value === "all"
                    ? "all"
                    : (Number(event.target.value) as AiTaggingLimit),
                );
                setShowAllReprocessConfirmation(false);
              }}
            >
              {AI_TAGGING_LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "all"
                    ? t("全部 {count} 个（主动选择）", {
                        count: availableTaggingCount,
                      })
                    : t("最多 {count} 个书签", { count: option })}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-button"
            aria-label={taggingActionLabel}
            disabled={
              taggingScope === "untagged"
                ? totalUntaggedCount > 0 && availableTaggingCount === 0
                : availableTaggingCount === 0
            }
            onClick={handleStartTagging}
          >
            <Play size={17} weight="fill" />
            {selectedTaggingCount > 0
              ? taggingScope === "untagged"
                ? t("开始处理")
                : t("重新处理")
              : t("检查并整理")}
          </button>
        </div>
        {showAllReprocessConfirmation && (
          <div
            className="ai-reprocess-confirmation"
            role="alertdialog"
            aria-label="确认重新处理全部范围"
          >
            <WarningCircle size={21} weight="duotone" />
            <div>
              <strong>确认把 {selectedTaggingCount} 个书签加入重处理队列？</strong>
              <p>
                每个书签的新请求成功后才会覆盖旧 AI 结果；请求失败时继续保留旧结果和手动标签。此操作会产生 Provider 调用费用。
              </p>
            </div>
            <div className="ai-reprocess-confirmation-actions">
              <button
                className="secondary-button"
                onClick={() => setShowAllReprocessConfirmation(false)}
              >
                {t("取消")}
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setShowAllReprocessConfirmation(false);
                  void onStartTagging(taggingScope, taggingLimit);
                }}
              >
                确认重新处理
              </button>
            </div>
          </div>
        )}
        <div className="tagging-switches">
          <label className="switch-row">
            <span>{t("新书签自动打标签")}</span>
            <input
              type="checkbox"
              checked={autoTagNewBookmarks}
              onChange={(event) =>
                setAutoTagNewBookmarks(event.target.checked)
              }
            />
          </label>
          <label className="switch-row">
            <span>{t("AI 自动整理分类与分组")}</span>
            <input
              type="checkbox"
              checked={autoOrganizeBookmarks}
              onChange={(event) =>
                setAutoOrganizeBookmarks(event.target.checked)
              }
            />
          </label>
        </div>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() =>
            void runAction(
              onUndoAiOrganization,
              "已恢复 AI 整理前布局",
            )
          }
        >
          <ArrowClockwise size={16} /> {t("恢复 AI 整理前布局")}
        </button>
        <div className="job-list">
          <article className="job-row completed-bookmarks-overview">
            <button
              className="job-toggle"
              onClick={() =>
                setCompletedBookmarksExpanded((current) => !current)
              }
              aria-label={`已完成网页 ${completedBookmarkCount}/${totalBookmarkCount}`}
              aria-expanded={completedBookmarksExpanded}
            >
              <span
                className={`status-dot${
                  completedBookmarkCount > 0 ? " status-completed" : ""
                }`}
              />
              <strong>{t("已完成网页")}</strong>
              <span className="job-count">
                {completedBookmarkCount}/{totalBookmarkCount}
              </span>
              {completedBookmarksExpanded ? (
                <CaretDown size={15} />
              ) : (
                <CaretRight size={15} />
              )}
            </button>
            <div
              className="progress-track"
              role="progressbar"
              aria-label={t("AI 标签总体完成进度")}
              aria-valuenow={completionProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${completionProgress}%` }} />
            </div>
            {completedBookmarksExpanded && (
              <CompletedBookmarksDetails
                bookmarks={completedBookmarks}
                latestLogs={latestCompletedLogByBookmarkId}
                expandedBookmarkId={expandedCompletedBookmarkId}
                onToggleBookmark={(bookmarkId, open) =>
                  setExpandedCompletedBookmarkId((current) =>
                    open
                      ? bookmarkId
                      : current === bookmarkId
                        ? undefined
                        : current,
                  )
                }
              />
            )}
          </article>
          {jobs
            .slice(0, 1)
            .filter((job) => job.status !== "completed")
            .map((job) => {
              const total = Math.max(1, job.bookmarkIds.length);
              const progress = Math.round(
                (job.processed / total) * 100,
              );
              return (
                <article className="job-row" key={job.id}>
                  <button
                    className="job-toggle"
                    onClick={() =>
                      setExpandedJobId((current) =>
                        current === job.id ? undefined : job.id,
                      )
                    }
                    aria-expanded={expandedJobId === job.id}
                  >
                    <span className={`status-dot status-${job.status}`} />
                    <strong>{statusText(job.status, job.phase)}</strong>
                    <span className="job-count">{job.processed}/{total}</span>
                    {job.failed > 0 && <span>{job.failed} 个失败</span>}
                    {expandedJobId === job.id ? (
                      <CaretDown size={15} />
                    ) : (
                      <CaretRight size={15} />
                    )}
                  </button>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  {job.error && <p className="job-error">{job.error}</p>}
                  {expandedJobId === job.id && (
                    isLiveJob(job) ? (
                      <LiveJobConsole job={job} />
                    ) : (
                      <CompletedJobDetails
                        job={job}
                        expandedLogIds={expandedLogIds}
                        onToggleLog={(logId, open) =>
                          setExpandedLogIds(
                            open ? new Set([logId]) : new Set(),
                          )
                        }
                      />
                    )
                  )}
                  <div className="job-actions">
                    {job.status !== "completed" &&
                      job.status !== "cancelled" && (
                        <button onClick={() => onCancelJob(job.id)}>
                          <Stop size={15} /> 取消
                        </button>
                      )}
                    {(job.status === "failed" ||
                      job.status === "cancelled") && (
                      <button onClick={() => onRetryJob(job.id)}>
                        <ArrowClockwise size={15} /> 重试
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
        <div className="privacy-note tagging-privacy-note">
          <Info size={17} />
          <span>
            网站读取权限会在需要联网功能时由你单独授权。已授权网站的网页 head
            元数据会以匿名请求获取 title、description、keywords 和站点名称，并连同标题、URL、域名、用户书签目录发送到你配置的 Provider；
            请求不携带登录 Cookie，网页正文也不会发送。
            手动任务默认只处理 10 个未处理书签；你也可以明确选择重新处理已有结果或全部书签。旧 AI 结果只在对应新请求成功后覆盖。
            首次全量整理通常规划 8–16 个一级分类、硬上限 24；所有书签成功后才全局规划二级分组，失败项必须先重试。
            每个一级分类最多 3 个二级分组且可以为 0。后续新书签只复用明确匹配的现有分组，否则直接留在一级分类下。
          </span>
        </div>
      </section>
      )}

      {activeSection === "general" && (
      <section className="settings-section compact-settings">
        <label className="language-setting-row">
          <span className="switch-copy">
            <strong>{t("界面语言")}</strong>
            <small>
              {t("语言设置保存后立即生效，不会翻译或改写书签内容。")}
            </small>
            <small>
              {t("自动匹配：中国大陆使用简体中文，港澳台使用繁體中文，日本使用日本語，韩国使用한국어，其他国家和地区使用 English。")}
            </small>
          </span>
          <select
            aria-label={t("界面语言")}
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value as LanguagePreference)
            }
          >
            <option value="system">{t("跟随浏览器")}</option>
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="switch-row">
          <span>{t("摘要参与本地检索")}</span>
          <input
            type="checkbox"
            checked={includeSummaries}
            onChange={(event) => setIncludeSummaries(event.target.checked)}
          />
        </label>
        <label className="switch-row">
          <span>{t("默认在新标签页打开网址")}</span>
          <input
            type="checkbox"
            checked={openInNewTab}
            onChange={(event) => setOpenInNewTab(event.target.checked)}
          />
        </label>
        <label className="switch-row">
          <span className="switch-copy">
            <strong>{t("始终显示右侧一级分类")}</strong>
            <small>
              {t("关闭后分类栏隐藏，鼠标移动到屏幕最右侧时立即显示")}
            </small>
          </span>
          <input
            type="checkbox"
            checked={screenDisplay.alwaysShowCategoryRail}
            onChange={(event) =>
              setScreenDisplay((current) => ({
                ...current,
                alwaysShowCategoryRail: event.target.checked,
              }))
            }
          />
        </label>
      </section>
      )}

      {activeSection === "display" && (
        <section className="settings-section display-settings">
          <div className="display-toggle-panel">
            <label className="switch-row">
              <span className="switch-copy">
                <strong>{t("显示时间")}</strong>
                <small>{t("首页搜索框上方显示精确到秒的本地时间")}</small>
              </span>
              <input
                type="checkbox"
                checked={screenDisplay.showTime}
                onChange={(event) =>
                  setScreenDisplay((current) => ({
                    ...current,
                    showTime: event.target.checked,
                  }))
                }
              />
            </label>
            <label className="switch-row">
              <span className="switch-copy">
                <strong>{t("显示每日警句")}</strong>
                <small>{t("每天固定展示一条中国古籍原文及出处")}</small>
              </span>
              <input
                type="checkbox"
                checked={screenDisplay.showDailyQuote}
                onChange={(event) =>
                  setScreenDisplay((current) => ({
                    ...current,
                    showDailyQuote: event.target.checked,
                  }))
                }
              />
            </label>
          </div>

          <div className="clock-content-panel">
            <header>
              <Eye size={19} weight="duotone" />
              <div>
                <strong>{t("时间内容")}</strong>
                <small>
                  {t("内容开关独立于视觉样式，并会实时反映到下方所有预览")}
                </small>
              </div>
            </header>
            <div className="clock-content-toggles">
              <label className="switch-row">
                <span className="switch-copy">
                  <strong>{t("显示公历日期")}</strong>
                  <small>{t("例如 2026年8月3日")}</small>
                </span>
                <input
                  type="checkbox"
                  checked={screenDisplay.showDate}
                  onChange={(event) =>
                    setScreenDisplay((current) => ({
                      ...current,
                      showDate: event.target.checked,
                    }))
                  }
                />
              </label>
              <label className="switch-row">
                <span className="switch-copy">
                  <strong>{t("显示星期")}</strong>
                  <small>{t("可与公历日期单独组合")}</small>
                </span>
                <input
                  type="checkbox"
                  checked={screenDisplay.showWeekday}
                  onChange={(event) =>
                    setScreenDisplay((current) => ({
                      ...current,
                      showWeekday: event.target.checked,
                    }))
                  }
                />
              </label>
              <label className="switch-row">
                <span className="switch-copy">
                  <strong>{t("显示农历")}</strong>
                  <small>{t("根据本地日期自动换算农历月日")}</small>
                </span>
                <input
                  type="checkbox"
                  checked={screenDisplay.showLunarDate}
                  onChange={(event) =>
                    setScreenDisplay((current) => ({
                      ...current,
                      showLunarDate: event.target.checked,
                    }))
                  }
                />
              </label>
            </div>
          </div>

          <div className="time-style-section">
            <header>
              <Clock size={19} weight="duotone" />
              <div>
                <strong>{t("时间样式")}</strong>
                <small>
                  {t("12 种纯视觉样式；日期、星期和农历由上方独立控制")}
                </small>
              </div>
            </header>
            <div
              className="time-style-grid"
              role="radiogroup"
              aria-label={t("时间样式")}
            >
              {TIME_STYLE_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={
                    screenDisplay.timeStyle === option.value ? "is-selected" : ""
                  }
                  onClick={() =>
                    setScreenDisplay((current) => ({
                      ...current,
                      timeStyle: option.value,
                    }))
                  }
                  role="radio"
                  aria-checked={screenDisplay.timeStyle === option.value}
                >
                  <span className="time-style-preview">
                    <HomeClock
                      date={CLOCK_STYLE_PREVIEW_DATE}
                      preferences={{
                        ...screenDisplay,
                        timeStyle: option.value,
                      }}
                      preview
                    />
                  </span>
                  <span className="time-style-name">
                    <span>
                      <strong>
                        {localize(option.title, option.titleEn)}
                      </strong>
                      <small>
                        {localize(option.description, option.descriptionEn)}
                      </small>
                    </span>
                    {screenDisplay.timeStyle === option.value && (
                      <CheckCircle size={16} weight="fill" />
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="display-quote-preview">
            <Quotes size={22} weight="duotone" />
            <div>
              <blockquote>“天行健，君子以自强不息”</blockquote>
              <span>《周易·乾》</span>
            </div>
          </div>
        </section>
      )}

      {activeSection === "widgets" && (
        <WidgetSettings value={widgets} onChange={setWidgets} />
      )}

      {activeSection === "health" && (
        <BookmarkHealthSettings
          preferences={bookmarkHealth}
          bookmarks={bookmarks}
          workspace={healthWorkspace}
          onPreferencesChange={setBookmarkHealth}
          onOpenBookmark={onOpenHealthBookmark ?? (async () => undefined)}
          onUpdateBookmarkUrls={onUpdateHealthBookmarkUrls ?? (async () => undefined)}
          onDeleteBookmarks={onDeleteHealthBookmarks ?? (async () => undefined)}
          onMergeDuplicates={onMergeHealthDuplicates ?? (async () => undefined)}
          onRestoreSnapshot={onRestoreHealthSnapshot ?? (async () => undefined)}
        />
      )}

      {activeSection === "background" && (
        <section className="settings-section settings-section-background">
          <BackgroundSettings
            preferences={background}
            assets={backgroundAssets}
            busy={busy}
            onChange={setBackground}
            onApply={async (assetId) => {
              const next = {
                ...background,
                currentAssetId: assetId,
                lastRotatedAt: Date.now(),
              };
              await onApplyBackground?.(next);
              setBackground(next);
              setMessage("背景已应用");
            }}
            onUpload={async (file) => {
              await onUploadBackground?.(file);
              setMessage("背景已上传并保存在本地");
            }}
            onDelete={async (assetId) => {
              await onDeleteBackground?.(assetId);
              setMessage("本地背景已删除");
            }}
            onRefreshCloud={async () => {
              await onRefreshBackgrounds?.();
              setMessage("云端图库已刷新");
            }}
          />
        </section>
      )}
        </div>
      </main>

      <footer className="settings-footer">
        <span className={message.includes("失败") ? "message-error" : ""}>
          {footerMessage &&
            (footerMessage.includes("失败") ? (
              <WarningCircle size={16} />
            ) : (
              <CheckCircle size={16} />
            ))}
          {footerMessage}
        </span>
        <button className="primary-button" disabled={busy} onClick={handleSave}>
          {t("保存设置")}
        </button>
      </footer>

      {cloudConflict && (
        <div
          className="cloud-conflict-backdrop"
          role="presentation"
          onClick={cancelCloudConflict}
          onKeyDown={(event) => {
            if (event.key === "Escape") cancelCloudConflict();
          }}
        >
          <section
            className="cloud-conflict-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cloud-conflict-title"
            aria-describedby="cloud-conflict-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cloud-conflict-icon" aria-hidden="true">
              <WarningCircle size={30} weight="duotone" />
            </div>
            <div className="cloud-conflict-copy">
              <span className="cloud-conflict-eyebrow">上传前版本检查</span>
              <h3 id="cloud-conflict-title">
                {cloudConflict.remoteRevision === 0
                  ? "云端备份已被删除"
                  : cloudConflict.reason === "missing-baseline"
                    ? "云端已有一份备份"
                    : "云端备份已在其他位置更新"}
              </h3>
              <p id="cloud-conflict-description">
                为避免覆盖另一台设备或上一次安装保留的数据，本次上传已暂停。当前本地书签和云端备份都没有发生变化。
              </p>
            </div>

            <div className="cloud-conflict-versions" aria-label="备份版本对比">
              <div>
                <span>本机同步基线</span>
                <strong>版本 {cloudConflict.localRevision}</strong>
                <small>
                  {cloudConflict.localRevision === 0
                    ? "尚未从云端恢复或上传"
                    : "本机上次确认的云端版本"}
                </small>
              </div>
              <CaretRight size={18} aria-hidden="true" />
              <div className="is-remote">
                <span>当前云端备份</span>
                <strong>版本 {cloudConflict.remoteRevision}</strong>
                <small>
                  {cloudConflict.remoteUpdatedAt
                    ? new Date(cloudConflict.remoteUpdatedAt).toLocaleString()
                    : cloudConflict.remoteRevision === 0
                      ? "云端当前没有备份"
                      : "更新时间未知"}
                </small>
              </div>
            </div>

            <div className="cloud-conflict-guidance">
              <Info size={17} />
              <span>
                {cloudConflict.remoteRevision > 0
                  ? "建议先恢复并合并：插件只把云端标签、分类、分组和布局合并到当前 Chrome 书签，不会创建、删除或重排原生书签。确认结果后，再手动上传。"
                  : "云端备份已不存在，无法恢复。只有在确认删除是预期行为后，才用当前数据重新创建云端备份。"}
              </span>
            </div>

            {cloudConflictError && (
              <p className="cloud-conflict-error" role="alert">
                <WarningCircle size={16} /> {cloudConflictError}
              </p>
            )}

            <div className="cloud-conflict-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={cancelCloudConflict}
              >
                取消
              </button>
              <button
                className="cloud-overwrite-button"
                disabled={busy}
                onClick={() =>
                  void handleCloudUpload({
                    overwriteRemoteRevision: cloudConflict.remoteRevision,
                  })
                }
              >
                <CloudArrowUp size={17} /> 用当前数据覆盖云端
              </button>
              {cloudConflict.remoteRevision > 0 && (
                <button
                  ref={cloudMergeButtonRef}
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void handleCloudMerge()}
                >
                  <CloudArrowDown size={17} /> 恢复并合并
                  <small>推荐</small>
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

interface CompletedJobDetailsProps {
  job: AiJob;
  expandedLogIds: Set<string>;
  onToggleLog(logId: string, open: boolean): void;
}

function CompletedBookmarksDetails({
  bookmarks,
  latestLogs,
  expandedBookmarkId,
  onToggleBookmark,
}: {
  bookmarks: BookmarkRecord[];
  latestLogs: ReadonlyMap<string, AiJobItemLog>;
  expandedBookmarkId?: string;
  onToggleBookmark(bookmarkId: string, open: boolean): void;
}) {
  return (
    <div className="completed-bookmark-list" aria-label="所有已完成网页">
      {bookmarks.length === 0 ? (
        <p className="empty-copy">还没有完成 AI 标签的网页。</p>
      ) : (
        bookmarks.map((bookmark) => {
          const isExpanded = expandedBookmarkId === bookmark.id;
          const latestLog = latestLogs.get(bookmark.id);
          return (
            <details
              className="completed-bookmark-row"
              key={bookmark.id}
              open={isExpanded}
              onToggle={(event) =>
                onToggleBookmark(bookmark.id, event.currentTarget.open)
              }
            >
              <summary
                aria-label={`${isExpanded ? "收起" : "展开"} ${
                  bookmark.title || bookmark.url
                } 详情`}
              >
                <CheckCircle
                  className="completed-bookmark-status-icon"
                  size={18}
                  weight="fill"
                  aria-hidden="true"
                />
                <div className="completed-bookmark-copy">
                  <strong>{bookmark.title || bookmark.url}</strong>
                  <span>{bookmark.url}</span>
                </div>
                <div className="completed-bookmark-tags" aria-label="AI 标签">
                  {bookmark.aiTags.slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                  {bookmark.aiTags.length > 3 && (
                    <span>+{bookmark.aiTags.length - 3}</span>
                  )}
                </div>
                {isExpanded ? (
                  <CaretDown
                    className="completed-bookmark-caret"
                    size={15}
                    aria-hidden="true"
                  />
                ) : (
                  <CaretRight
                    className="completed-bookmark-caret"
                    size={15}
                    aria-hidden="true"
                  />
                )}
              </summary>
              <CompletedBookmarkDetail bookmark={bookmark} log={latestLog} />
            </details>
          );
        })
      )}
    </div>
  );
}

function CompletedBookmarkDetail({
  bookmark,
  log,
}: {
  bookmark: BookmarkRecord;
  log?: AiJobItemLog;
}) {
  const category = bookmark.aiCategory ?? log?.result?.category;
  const group = bookmark.aiGroup ?? log?.result?.group;
  const summary = bookmark.summary ?? log?.result?.summary;

  return (
    <div className="completed-bookmark-detail">
      <div className="completed-bookmark-detail-grid">
        <section>
          <span>分类 / 分组</span>
          <strong>
            {category || "未记录"} / {group || "未记录"}
          </strong>
        </section>
        <section>
          <span>AI 标签 · {bookmark.aiTags.length}</span>
          <div className="completed-bookmark-all-tags">
            {bookmark.aiTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </section>
        {bookmark.tags.length > 0 && (
          <section>
            <span>手动标签 · {bookmark.tags.length}</span>
            <div className="completed-bookmark-all-tags is-manual">
              {bookmark.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </section>
        )}
        <section>
          <span>摘要</span>
          <p>{summary || "暂无摘要"}</p>
        </section>
      </div>
      {log ? (
        <details className="completed-bookmark-request-log">
          <summary>
            <strong>最近一次 AI 请求日志</strong>
            <span>{log.attempts.length} 次请求</span>
            <CaretRight size={14} aria-hidden="true" />
          </summary>
          <div className="completed-bookmark-request-log-content">
            <AiProviderAttempts log={log} />
          </div>
        </details>
      ) : (
        <p className="completed-bookmark-log-empty">
          这条网页没有可用的历史请求日志，当前标签数据不受影响。
        </p>
      )}
    </div>
  );
}

function AiProviderAttempts({ log }: { log: AiJobItemLog }) {
  return (
    <>
      {log.attempts.map((attempt) => (
        <section
          className="job-attempt"
          key={`${log.bookmarkId}-${attempt.attempt}`}
        >
          <div className="job-attempt-title">
            <strong>请求 #{attempt.attempt}</strong>
            <span>
              {attempt.response
                ? `HTTP ${attempt.response.status}`
                : attempt.error || "等待返回"}
            </span>
          </div>
          <p className="job-request-url">
            {attempt.request.method} {attempt.request.url}
          </p>
          <p className="job-auth-redacted">
            Authorization: {attempt.request.headers.Authorization}
          </p>
          <span className="job-log-label">发送请求</span>
          <pre className="job-log-pre">{formatJson(attempt.request.body)}</pre>
          <span className="job-log-label">Provider 返回</span>
          <pre className="job-log-pre">
            {attempt.response?.content || attempt.error || "尚未返回内容"}
          </pre>
        </section>
      ))}
    </>
  );
}

function CompletedJobDetails({
  job,
  expandedLogIds,
  onToggleLog,
}: CompletedJobDetailsProps) {
  const logs = job.logs ?? [];
  const focusedLogId = logs
    .map((log) => `${job.id}-${log.bookmarkId}`)
    .find((logId) => expandedLogIds.has(logId));
  const visibleLogs = focusedLogId
    ? logs.filter(
        (log) => `${job.id}-${log.bookmarkId}` === focusedLogId,
      )
    : logs;

  return (
    <div
      className={`job-details job-details-completed${
        focusedLogId ? " job-details-focused" : ""
      }`}
      aria-label="逐条处理结果"
    >
      {logs.length === 0 ? (
        <p className="empty-copy">该任务没有可用的请求日志。</p>
      ) : (
        visibleLogs.map((log) => {
          const logId = `${job.id}-${log.bookmarkId}`;
          const isExpanded = expandedLogIds.has(logId);
          return (
            <details
              className="job-item-log"
              key={logId}
              open={expandedLogIds.has(logId)}
              onToggle={(event) =>
                onToggleLog(logId, event.currentTarget.open)
              }
            >
              <summary>
                <span className={`status-dot status-${log.status}`} />
                <strong>{log.title}</strong>
                <span className="job-item-state">
                  {isExpanded ? "收起并返回列表" : itemStatusText(log.status)}
                </span>
                {isExpanded ? (
                  <CaretDown size={14} />
                ) : (
                  <CaretRight size={14} />
                )}
              </summary>
              <div className="job-item-log-content">
                <p className="job-bookmark-url">{log.url}</p>
                <AiProviderAttempts log={log} />
                {log.result && (
                  <div className="job-result">
                    <div className="job-result-path">
                      {log.result.category} / {log.result.group}
                    </div>
                    <div className="job-result-tags">
                      {log.result.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    {log.result.summary && <p>{log.result.summary}</p>}
                  </div>
                )}
                {log.error && <p className="job-error">{log.error}</p>}
              </div>
            </details>
          );
        })
      )}
    </div>
  );
}

function LiveJobConsole({ job }: { job: AiJob }) {
  const consoleRef = useRef<HTMLDivElement>(null);
  const followingLatestRef = useRef(true);
  const [followingLatest, setFollowingLatest] = useState(true);
  const entries = buildConsoleEntries(job);
  const signature = `${job.updatedAt}:${entries.length}:${job.processed}:${job.failed}`;

  useEffect(() => {
    const output = consoleRef.current;
    if (!output || !followingLatestRef.current) return;
    const timeout = window.setTimeout(() => {
      if (followingLatestRef.current) {
        output.scrollTop = output.scrollHeight;
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [signature]);

  function handleConsoleScroll() {
    const output = consoleRef.current;
    if (!output) return;
    const distanceFromBottom =
      output.scrollHeight - output.scrollTop - output.clientHeight;
    const shouldFollow = distanceFromBottom <= 72;
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
    <div
      className="job-console"
      ref={consoleRef}
      onScroll={handleConsoleScroll}
      role="log"
      aria-label="AI 实时处理日志"
      aria-live="polite"
    >
      <div className="job-console-toolbar">
        <span className="console-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <strong>AI 实时处理日志</strong>
        <button
          type="button"
          className={`console-follow-button${
            followingLatest ? "" : " is-paused"
          }`}
          aria-label={
            followingLatest ? "正在跟随最新日志" : "已暂停，回到底部"
          }
          onClick={scrollToLatest}
        >
          {followingLatest ? "跟随最新" : "已暂停 · 回到底部"}
        </button>
      </div>
      <div className="job-console-output">
        {entries.map((entry) => (
          <div
            className={`console-entry console-${entry.kind}`}
            key={entry.key}
          >
            <time>{formatLogTime(entry.time)}</time>
            <span className="console-symbol">{consoleSymbol(entry.kind)}</span>
            <div>
              <div className="console-message">{entry.message}</div>
              {entry.detail && <pre>{entry.detail}</pre>}
            </div>
          </div>
        ))}
        <div className="console-entry console-live">
          <time>{formatLogTime(Date.now())}</time>
          <span className="console-symbol">›</span>
          <div className="console-message">
            等待下一条输出<span className="console-cursor" />
          </div>
        </div>
      </div>
    </div>
  );
}

type ConsoleEntryKind =
  | "info"
  | "request"
  | "response"
  | "success"
  | "error"
  | "waiting";

interface ConsoleEntry {
  key: string;
  time: number;
  kind: ConsoleEntryKind;
  message: string;
  detail?: string;
}

function buildConsoleEntries(job: AiJob): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [
    {
      key: `${job.id}-start`,
      time: job.createdAt,
      kind: "info",
      message: `任务已创建，共 ${job.bookmarkIds.length} 个 URL`,
    },
  ];
  let waitingShown = false;

  for (const log of job.logs ?? []) {
    if (log.attempts.length === 0) {
      if (!waitingShown && log.status === "queued") {
        waitingShown = true;
        entries.push({
          key: `${log.bookmarkId}-waiting`,
          time: job.updatedAt,
          kind: "waiting",
          message: `等待处理：${log.title}`,
          detail: log.url,
        });
      }
      if (log.error) {
        entries.push({
          key: `${log.bookmarkId}-error`,
          time: job.updatedAt,
          kind: "error",
          message: `${log.title}：${log.error}`,
        });
      }
      continue;
    }

    for (const attempt of log.attempts) {
      entries.push({
        key: `${log.bookmarkId}-${attempt.attempt}-request`,
        time: attempt.startedAt,
        kind: "request",
        message: `${log.title} · 发送请求 #${attempt.attempt}`,
        detail: [
          `${attempt.request.method} ${attempt.request.url}`,
          `Authorization: ${attempt.request.headers.Authorization}`,
          formatJson(attempt.request.body),
        ].join("\n"),
      });
      if (attempt.response) {
        entries.push({
          key: `${log.bookmarkId}-${attempt.attempt}-response`,
          time: attempt.completedAt ?? job.updatedAt,
          kind: attempt.response.status >= 400 ? "error" : "response",
          message: `${log.title} · Provider 返回 HTTP ${attempt.response.status}`,
          detail: attempt.response.content || "Provider 返回为空",
        });
      } else if (attempt.error) {
        entries.push({
          key: `${log.bookmarkId}-${attempt.attempt}-attempt-error`,
          time: attempt.completedAt ?? job.updatedAt,
          kind: "error",
          message: `${log.title} · 请求失败`,
          detail: attempt.error,
        });
      }
    }

    if (log.result) {
      entries.push({
        key: `${log.bookmarkId}-result`,
        time: log.attempts.at(-1)?.completedAt ?? job.updatedAt,
        kind: "success",
        message: `${log.title} → ${log.result.category} / ${log.result.group}`,
        detail: [
          `标签：${log.result.tags.join("、")}`,
          ...(log.result.summary ? [`摘要：${log.result.summary}`] : []),
        ].join("\n"),
      });
    } else if (log.error) {
      entries.push({
        key: `${log.bookmarkId}-result-error`,
        time: job.updatedAt,
        kind: "error",
        message: `${log.title}：${log.error}`,
      });
    }
  }

  return entries;
}

function isLiveJob(job: AiJob): boolean {
  return (
    job.status === "queued" ||
    job.status === "running" ||
    job.status === "paused"
  );
}

function consoleSymbol(kind: ConsoleEntryKind): string {
  const symbols: Record<ConsoleEntryKind, string> = {
    info: "i",
    request: "→",
    response: "←",
    success: "✓",
    error: "!",
    waiting: "·",
  };
  return symbols[kind];
}

function formatLogTime(value: number): string {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusText(
  status: AiJob["status"],
  phase?: AiJob["phase"],
): string {
  const phaseLabels: Partial<Record<NonNullable<AiJob["phase"]>, string>> = {
    planning: "规划一级分类",
    tagging: "打标签与一级分类",
    "waiting-retry": "等待失败项重试",
    grouping: "全局规划二级分组",
    rebuilding: "重建 AI 工作区",
  };
  if (
    phase &&
    phase !== "completed" &&
    (status === "queued" || status === "running" || status === "failed")
  ) {
    return phaseLabels[phase] ?? "处理中";
  }
  const labels: Record<AiJob["status"], string> = {
    queued: "等待处理",
    running: "处理中",
    paused: "已暂停",
    cancelled: "已取消",
    failed: "等待重试",
    completed: "已完成",
  };
  return labels[status];
}

function itemStatusText(
  status: NonNullable<AiJob["logs"]>[number]["status"],
): string {
  const labels: Record<typeof status, string> = {
    queued: "等待",
    requesting: "请求中",
    retrying: "重试中",
    completed: "已归类",
    failed: "失败",
  };
  return labels[status];
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
