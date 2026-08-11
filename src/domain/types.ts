export const LAYOUT_VERSION = 3;

export type BookmarkSource = "chrome" | "custom" | "preview";
export const CATEGORY_ICON_VALUES = [
  "briefcase",
  "bookmark",
  "layers",
  "study",
  "heart",
  "globe",
  "code",
  "chart",
  "palette",
  "book",
  "home",
  "news",
  "tools",
  "shopping",
  "travel",
  "music",
  "video",
  "community",
  "idea",
  "archive",
  "folder",
  "tag",
  "star",
  "checklist",
  "terminal",
  "database",
  "cloud",
  "cpu",
  "git",
  "bug",
  "robot",
  "magic",
  "circuitry",
  "rocket",
  "notebook",
  "certificate",
  "science",
  "translate",
  "image",
  "camera",
  "pen",
  "typography",
  "bars",
  "trend",
  "marketing",
  "target",
  "funnel",
  "bank",
  "currency",
  "credit-card",
  "wallet",
  "storefront",
  "health",
  "fitness",
  "game",
  "headphones",
  "map",
  "compass",
  "location",
  "article",
  "chat",
] as const;

export type CategoryIcon = (typeof CATEGORY_ICON_VALUES)[number];

export interface BookmarkRecord {
  id: string;
  parentId?: string;
  title: string;
  url: string;
  source: BookmarkSource;
  folderPath: string[];
  tags: string[];
  aiTags: string[];
  summary?: string;
  aiCategory?: string;
  aiGroup?: string;
  dateAdded?: number;
}

export interface BookmarkGroup {
  id: string;
  title: string;
  collapsed: boolean;
  bookmarkIds: string[];
}

export interface BookmarkCategory {
  id: string;
  title: string;
  icon: CategoryIcon;
  bookmarkIds: string[];
  groups: BookmarkGroup[];
  /**
   * Visual order of loose bookmarks and groups at the category root.
   * Missing legacy values are normalized from bookmarkIds followed by groups.
   */
  rootOrder?: string[];
}

export interface WorkspaceLayout {
  version: number;
  activeCategoryId: string;
  categories: BookmarkCategory[];
  customBookmarks: BookmarkRecord[];
  hiddenBookmarkIds: string[];
  placementOverrides?: Record<
    string,
    {
      source: "manual" | "command";
      locked: boolean;
      updatedAt: number;
    }
  >;
  updatedAt: number;
}

export type SearchMode = "web" | "bookmarks";

export interface SearchEngine {
  id: "google" | "baidu" | "bing" | "duckduckgo";
  name: string;
  queryUrl: string;
}

export interface ProviderConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
  apiKey: string;
  batchSize: number;
}

export type BackgroundSource = "builtin" | "upload" | "cloud";
export type BackgroundRotationInterval = "newtab" | "15m" | "1h" | "daily";
export type BackgroundRotationOrder = "random" | "sequential";

export interface BackgroundAsset {
  id: string;
  name: string;
  source: BackgroundSource;
  category: "nature" | "ocean" | "city" | "space" | "minimal" | "custom";
  url: string;
  thumbnailUrl: string;
  width?: number;
  height?: number;
  attribution?: string;
  license?: string;
  cloudSynced?: boolean;
}

export interface BackgroundPreferences {
  currentAssetId: string;
  rotationEnabled: boolean;
  rotationInterval: BackgroundRotationInterval;
  rotationOrder: BackgroundRotationOrder;
  playlistIds: string[];
  shuffleRemainingIds: string[];
  lastRotatedAt: number;
  overlayOpacity: number;
  blur: number;
}

export type TimeStyle =
  | "minimal"
  | "bold"
  | "split"
  | "flip"
  | "neon"
  | "terminal"
  | "serif"
  | "outline"
  | "boxed"
  | "stacked"
  | "compact"
  | "soft";

export interface ScreenDisplayPreferences {
  showTime: boolean;
  showDailyQuote: boolean;
  alwaysShowCategoryRail: boolean;
  showEmptyUncategorizedCategory: boolean;
  timeStyle: TimeStyle;
  showDate: boolean;
  showWeekday: boolean;
  showLunarDate: boolean;
}

export type WidgetId =
  | "weather"
  | "calendar"
  | "world-clock"
  | "currency"
  | "hot-search"
  | "bookmark-stats"
  | "ai-progress"
  | "bookmark-health"
  | "recent-bookmarks"
  | "tag-overview"
  | "focus-timer"
  | "quick-note"
  | "daily-quote";

export type WidgetWeatherLocationId =
  | "beijing"
  | "shanghai"
  | "shenzhen"
  | "hong-kong"
  | "singapore"
  | "tokyo"
  | "london"
  | "new-york";

export type WidgetCurrencyCode =
  | "CNY"
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "HKD"
  | "SGD";

export interface WidgetPreferences {
  enabled: boolean;
  activeIds: WidgetId[];
  weatherLocationId: WidgetWeatherLocationId;
  currencyBase: WidgetCurrencyCode;
  currencyQuote: WidgetCurrencyCode;
}

export type LanguagePreference =
  | "system"
  | "zh-CN"
  | "zh-TW"
  | "ja"
  | "ko"
  | "en";

export interface AppSettings {
  language: LanguagePreference;
  engineId: SearchEngine["id"];
  provider: ProviderConfig;
  cloudApiBaseUrl: string;
  autoTagNewBookmarks: boolean;
  autoOrganizeBookmarks: boolean;
  includeSummaries: boolean;
  openInNewTab: boolean;
  bookmarkHealth: BookmarkHealthPreferences;
  screenDisplay: ScreenDisplayPreferences;
  widgets: WidgetPreferences;
  background: BackgroundPreferences;
}

export type BookmarkHealthStatus =
  | "healthy"
  | "redirected"
  | "auth-required"
  | "rate-limited"
  | "http-error"
  | "server-error"
  | "network-error"
  /** Legacy value kept so existing local records remain readable. */
  | "temporary-error"
  | "suspected-dead"
  | "confirmed-dead"
  | "unsupported";

export type BookmarkHealthCredentialsMode = "omit" | "include";

export type BookmarkHealthRedirectKind =
  | "permanent-canonical"
  | "temporary"
  | "same-site-path"
  | "cross-domain"
  | "other";

export interface BookmarkHealthRedirectHop {
  status: number;
  fromUrl: string;
  toUrl: string;
}

export interface BookmarkHealthRecord {
  bookmarkId: string;
  checkedUrl: string;
  status: BookmarkHealthStatus;
  httpStatus?: number;
  finalUrl?: string;
  redirectCount: number;
  redirectKind?: BookmarkHealthRedirectKind;
  redirectChain?: BookmarkHealthRedirectHop[];
  restrictionReason?: "http-status" | "login-redirect";
  checkedWithCookies?: boolean;
  consecutiveFailures: number;
  firstFailureAt?: number;
  lastSuccessAt?: number;
  checkedAt: number;
  nextCheckAt?: number;
  verifiedBy?: "HEAD" | "GET";
  detectorVersion?: number;
  error?: string;
}

export type BookmarkHealthScanScope = "unchecked" | "stale" | "all";
export type BookmarkHealthScanLimit = 10 | 50 | 100 | "all";
export type BookmarkHealthJobStatus =
  | "queued"
  | "running"
  | "paused"
  | "cancelled"
  | "failed"
  | "completed";
export type BookmarkHealthJobItemStatus =
  | "queued"
  | "checking"
  | "completed"
  | "failed";

export interface BookmarkHealthRequestLog {
  id: string;
  method: "HEAD" | "GET";
  url: string;
  startedAt: number;
  completedAt?: number;
  headers: Record<string, string>;
  credentialsMode?: BookmarkHealthCredentialsMode;
  redirectMode?: "follow" | "manual";
  response?: {
    status: number;
    statusText?: string;
    finalUrl: string;
    redirected: boolean;
    location?: string;
  };
  error?: string;
}

export interface BookmarkHealthJob {
  id: string;
  status: BookmarkHealthJobStatus;
  pauseReason?: "user" | "host-permission";
  scope: BookmarkHealthScanScope;
  bookmarkIds: string[];
  processed: number;
  failed: number;
  createdAt: number;
  updatedAt: number;
  leaseUntil?: number;
  error?: string;
  credentialsMode?: BookmarkHealthCredentialsMode;
  authenticatedRetry?: boolean;
  summaryMode?: "full-scan";
  items: Array<{
    bookmarkId: string;
    title: string;
    url: string;
    status: BookmarkHealthJobItemStatus;
    resultStatus?: BookmarkHealthStatus;
    error?: string;
    requests?: BookmarkHealthRequestLog[];
  }>;
}

export interface BookmarkHealthPreferences {
  scheduledScanEnabled: boolean;
  scheduleIntervalDays: 7 | 14 | 30;
  autoCheckNewBookmarks: boolean;
  staleAfterDays: 7 | 14 | 30;
  lastScheduledScanAt?: number;
  ignoredDuplicateKeys: string[];
  ignoredDeadBookmarkIds: string[];
}

export interface BookmarkRecoverySnapshot {
  id: string;
  action: "delete" | "merge" | "update";
  createdAt: number;
  bookmarks: BookmarkRecord[];
  placements: Array<{
    bookmarkId: string;
    categoryId: string;
    groupId?: string;
  }>;
}

export interface CloudUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface WrappedVaultKey {
  wrappedKey: string;
  wrappedKeyIv: string;
  kdf: {
    name: "PBKDF2-SHA-256";
    iterations: number;
    salt: string;
  };
}

export interface CloudState {
  sessionToken?: string;
  user?: CloudUser;
  vaultKey?: string;
  /** Last cloud revision that this browser restored or successfully uploaded. */
  revision: number;
  /** Most recent cloud revision observed without changing the local baseline. */
  remoteRevision?: number;
  remoteUpdatedAt?: number;
  keyEnvelope?: WrappedVaultKey;
  lastSyncedAt?: number;
}

export type AiJobType = "tag-bookmarks";
export type AiTaggingLimit = 1 | 5 | 10 | 20 | 50 | 100 | "all";
export type AiTaggingScope = "untagged" | "processed" | "all";
export type AiOrganizationMode = "none" | "bootstrap" | "incremental";
export type AiJobPhase =
  | "planning"
  | "tagging"
  | "waiting-retry"
  | "grouping"
  | "rebuilding"
  | "completed";
export type AiJobStatus =
  | "queued"
  | "running"
  | "paused"
  | "cancelled"
  | "failed"
  | "completed";

export type AiJobItemStatus =
  | "queued"
  | "requesting"
  | "retrying"
  | "completed"
  | "failed";

export interface AiProviderRequestLog {
  url: string;
  method: "POST";
  headers: {
    "Content-Type": "application/json";
    Authorization: "Bearer [已隐藏]";
  };
  body: Record<string, unknown>;
}

export interface AiProviderAttemptLog {
  attempt: number;
  startedAt: number;
  completedAt?: number;
  request: AiProviderRequestLog;
  response?: {
    status: number;
    finishReason?: string;
    content?: string;
  };
  error?: string;
}

export interface AiJobItemLog {
  bookmarkId: string;
  title: string;
  url: string;
  status: AiJobItemStatus;
  attempts: AiProviderAttemptLog[];
  result?: {
    tags: string[];
    summary?: string;
    category: string;
    group?: string;
  };
  error?: string;
}

export interface AiJob {
  id: string;
  type: AiJobType;
  status: AiJobStatus;
  bookmarkIds: string[];
  processed: number;
  failed: number;
  attempts: number;
  organizationMode?: AiOrganizationMode;
  phase?: AiJobPhase;
  categoryPlan?: string[];
  bootstrapTargetIds?: string[];
  groupingAttempts?: number;
  groupingResult?: AiGroupingResult;
  createdAt: number;
  updatedAt: number;
  leaseUntil?: number;
  error?: string;
  logs?: AiJobItemLog[];
  items: Array<{
    id: string;
    title: string;
    url: string;
    folderPath: string[];
  }>;
}

export interface AiGroupingResult {
  assignments: Array<{
    bookmarkId: string;
    group?: string;
  }>;
}

export interface SearchHit {
  bookmark: BookmarkRecord;
  score: number;
  reasons: string[];
  /** AI 给出的单条结果相关度，范围 0–1。 */
  relevance?: number;
  /** 用于解释本条结果为何命中的具体概念词。 */
  matchedTerms?: string[];
  /** 结果所依据的可验证证据层级。 */
  matchKind?: SearchMatchKind;
  /** 命中证据来自哪个原始书签字段。 */
  evidenceField?: SearchEvidenceField;
  categoryId?: string;
  groupId?: string;
}

export type SearchMatchKind =
  | "direct"
  | "equivalent"
  | "related"
  | "precise";

export type SearchEvidenceField = "title" | "url" | "tags" | "summary";

export interface SearchResolution {
  query: string;
  source: "local" | "ai";
  /** precise 用于明确任务意图，topic 用于单一主题的完整浏览。 */
  searchMode?: "precise" | "topic";
  confidence: number;
  hits: SearchHit[];
  action: "focus" | "candidates" | "empty" | "unavailable" | "error";
  interpretation?: string;
  message?: string;
}

export interface BookmarkDraft {
  id?: string;
  title: string;
  url: string;
  categoryId: string;
  groupId?: string;
  tags: string[];
  aiTags: string[];
}
