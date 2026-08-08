import { DEFAULT_SETTINGS } from "@/domain/constants";
import { normalizeBookmarkHealthPreferences } from "@/domain/bookmarkHealth";
import type {
  AppSettings,
  CloudState,
  WorkspaceLayout,
} from "@/domain/types";
import { normalizeScreenDisplayPreferences } from "@/domain/timeDisplay";
import { normalizeWidgetPreferences } from "@/domain/widgets";

const LAYOUT_KEY = "smartNewTab.layout.v1";
const SETTINGS_KEY = "smartNewTab.settings.v1";
const CLOUD_STATE_KEY = "smartNewTab.cloudState.v1";
const AI_ORGANIZATION_STATE_KEY = "smartNewTab.aiOrganization.v1";
const AI_ORGANIZATION_BACKUP_KEY = "smartNewTab.aiOrganizationBackup.v1";
const COMMAND_HISTORY_KEY = "smartNewTab.commandHistory.v1";
// Stable storage namespace: preserve settings and layout across the SmartAINewTab rename.
const PREVIEW_PREFIX = "smart-new-tab:";
const COMMAND_HISTORY_LIMIT = 5;

export interface AiOrganizationState {
  initializedAt: number;
  lastOrganizedAt: number;
  categoryPlan?: string[];
}

interface CommandHistoryEntry {
  layout: WorkspaceLayout;
  label: string;
  createdAt: number;
}

interface CommandHistoryState {
  past: CommandHistoryEntry[];
  future: CommandHistoryEntry[];
}

export async function loadWorkspace(): Promise<WorkspaceLayout | undefined> {
  return getValue<WorkspaceLayout>(LAYOUT_KEY);
}

export async function saveWorkspace(layout: WorkspaceLayout): Promise<void> {
  await setValue(LAYOUT_KEY, {
    ...layout,
    updatedAt: Date.now(),
  });
}

export async function loadAiOrganizationState(): Promise<
  AiOrganizationState | undefined
> {
  return getValue<AiOrganizationState>(AI_ORGANIZATION_STATE_KEY);
}

export async function saveAiOrganizationState(
  state: AiOrganizationState,
): Promise<void> {
  await setValue(AI_ORGANIZATION_STATE_KEY, state);
}

export async function clearAiOrganizationState(): Promise<void> {
  await removeValue(AI_ORGANIZATION_STATE_KEY);
}

export async function loadAiOrganizationBackup(): Promise<
  WorkspaceLayout | undefined
> {
  return getValue<WorkspaceLayout>(AI_ORGANIZATION_BACKUP_KEY);
}

export async function saveAiOrganizationBackup(
  layout: WorkspaceLayout,
): Promise<void> {
  await setValue(AI_ORGANIZATION_BACKUP_KEY, structuredClone(layout));
}

export async function recordCommandExecution(
  layoutBeforeExecution: WorkspaceLayout,
  label: string,
): Promise<void> {
  const history = await loadCommandHistory();
  history.past.push({
    layout: structuredClone(layoutBeforeExecution),
    label,
    createdAt: Date.now(),
  });
  history.past = history.past.slice(-COMMAND_HISTORY_LIMIT);
  history.future = [];
  await setValue(COMMAND_HISTORY_KEY, history);
}

export async function undoCommandExecution(
  currentLayout: WorkspaceLayout,
): Promise<{ layout: WorkspaceLayout; label: string } | undefined> {
  const history = await loadCommandHistory();
  const target = history.past.pop();
  if (!target) return undefined;
  history.future.push({
    layout: structuredClone(currentLayout),
    label: target.label,
    createdAt: Date.now(),
  });
  history.future = history.future.slice(-COMMAND_HISTORY_LIMIT);
  await setValue(COMMAND_HISTORY_KEY, history);
  return { layout: structuredClone(target.layout), label: target.label };
}

export async function redoCommandExecution(
  currentLayout: WorkspaceLayout,
): Promise<{ layout: WorkspaceLayout; label: string } | undefined> {
  const history = await loadCommandHistory();
  const target = history.future.pop();
  if (!target) return undefined;
  history.past.push({
    layout: structuredClone(currentLayout),
    label: target.label,
    createdAt: Date.now(),
  });
  history.past = history.past.slice(-COMMAND_HISTORY_LIMIT);
  await setValue(COMMAND_HISTORY_KEY, history);
  return { layout: structuredClone(target.layout), label: target.label };
}

export async function clearCommandHistory(): Promise<void> {
  await removeValue(COMMAND_HISTORY_KEY);
}

export async function loadSettings(): Promise<AppSettings> {
  const stored = await getValue<Partial<AppSettings>>(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    cloudApiBaseUrl:
      stored?.cloudApiBaseUrl?.trim() || DEFAULT_SETTINGS.cloudApiBaseUrl,
    provider: {
      ...DEFAULT_SETTINGS.provider,
      ...stored?.provider,
    },
    bookmarkHealth: normalizeBookmarkHealthPreferences(
      stored?.bookmarkHealth,
    ),
    screenDisplay: normalizeScreenDisplayPreferences(stored?.screenDisplay),
    widgets: normalizeWidgetPreferences(stored?.widgets),
    background: {
      ...DEFAULT_SETTINGS.background,
      ...stored?.background,
      playlistIds:
        stored?.background?.playlistIds ??
        DEFAULT_SETTINGS.background.playlistIds,
      shuffleRemainingIds:
        stored?.background?.shuffleRemainingIds ??
        DEFAULT_SETTINGS.background.shuffleRemainingIds,
    },
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await setValue(SETTINGS_KEY, settings);
}

export async function loadCloudState(): Promise<CloudState> {
  return (
    (await getValue<CloudState>(CLOUD_STATE_KEY)) ?? {
      revision: 0,
    }
  );
}

export async function saveCloudState(state: CloudState): Promise<void> {
  await setValue(CLOUD_STATE_KEY, state);
}

export async function clearCloudState(): Promise<void> {
  await removeValue(CLOUD_STATE_KEY);
}

export async function setTrustedStorageAccess(): Promise<void> {
  if (!hasChromeStorage() || !chrome.storage.local.setAccessLevel) return;
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
}

async function getValue<T>(key: string): Promise<T | undefined> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }
  const value = localStorage.getItem(`${PREVIEW_PREFIX}${key}`);
  return value ? (JSON.parse(value) as T) : undefined;
}

async function setValue<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  localStorage.setItem(`${PREVIEW_PREFIX}${key}`, JSON.stringify(value));
}

async function removeValue(key: string): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(key);
    return;
  }
  localStorage.removeItem(`${PREVIEW_PREFIX}${key}`);
}

async function loadCommandHistory(): Promise<CommandHistoryState> {
  return (
    (await getValue<CommandHistoryState>(COMMAND_HISTORY_KEY)) ?? {
      past: [],
      future: [],
    }
  );
}

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.storage?.local) &&
    location.protocol === "chrome-extension:"
  );
}
