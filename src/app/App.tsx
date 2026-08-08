import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowSquareOut,
  ArrowCounterClockwise,
  CaretDown,
  Check,
  Copy,
  DotsThree,
  FolderOpen,
  GearSix,
  GlobeSimple,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  PlusCircle,
  Sparkle,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  SiBaidu,
  SiDuckduckgo,
} from "@icons-pack/react-simple-icons";
import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEFAULT_SETTINGS, SEARCH_ENGINES } from "@/domain/constants";
import { classicQuoteForDate } from "@/domain/classicQuotes";
import {
  adjacentCategoryId,
  categoryBoundaryDirection,
} from "@/domain/categoryScroll";
import {
  BOOKMARK_GROUP_DWELL_MS,
  isBookmarkGroupCenter,
  resolveBookmarkDropIntent,
  type BookmarkDropIntent,
  type DropPoint,
} from "@/domain/bookmarkDrop";
import {
  buildWorkspaceFromBookmarks,
  createCategory,
  createGroup,
  createGroupFromBookmarkDrop,
  getCategoryBookmarkIds,
  lockBookmarkPlacement,
  moveBookmarkInWorkspace,
  moveBookmarkRelativeInWorkspace,
  removeBookmarkFromWorkspace,
  reconcileWorkspace,
  UNCATEGORIZED_CATEGORY_ID,
} from "@/domain/layout";
import {
  BOOKMARK_COMMAND_EXAMPLES,
  BOOKMARK_COMMAND_EXAMPLES_EN,
  BOOKMARK_COMMAND_EXAMPLES_JA,
  BOOKMARK_COMMAND_EXAMPLES_KO,
  BOOKMARK_COMMAND_EXAMPLES_ZH_TW,
  commandOperationTitle,
  executeBookmarkCommandPlan,
  type BookmarkCommandPlan,
} from "@/domain/commands";
import { createPreviewWorkspace } from "@/domain/seed";
import { selectTaggingCandidates } from "@/domain/tagging";
import type {
  AiJob,
  AiTaggingLimit,
  AiTaggingScope,
  AppSettings,
  BackgroundAsset,
  BackgroundPreferences,
  BookmarkCategory,
  BookmarkDraft,
  BookmarkGroup,
  BookmarkRecord,
  CloudState,
  CategoryIcon,
  SearchMode,
  SearchResolution,
  WorkspaceLayout,
} from "@/domain/types";
import googleLogoUrl from "@/assets/google-g-logo.svg";
import { LAYOUT_VERSION } from "@/domain/types";
import {
  createBackupDocument,
  downloadBackup,
  restoreBackupDocument,
  type BackupDocument,
} from "@/services/backup";
import {
  deleteCloudAccount,
  deleteCloudBackup,
  downloadCloudBackup,
  signInWithGoogle,
  signOutCloud,
  uploadCloudBackup,
} from "@/services/cloud";
import {
  cancelJob,
  enqueueTaggingJob,
  listJobs,
  organizeExistingAiTags,
  resolveSmartSearch,
  retryJob,
  runNextJob,
} from "@/services/ai";
import { buildAiOrganizedWorkspace } from "@/services/organization";
import {
  createNaturalLanguageCommandPlan,
  type CommandPlanningProgress,
} from "@/services/commandAi";
import type { AppRuntime } from "@/services/runtime";
import {
  clearAiOrganizationState,
  loadAiOrganizationBackup,
  loadCloudState,
  loadSettings,
  loadWorkspace,
  recordCommandExecution,
  redoCommandExecution,
  saveSettings,
  saveWorkspace,
  undoCommandExecution,
} from "@/services/storage";
import {
  type FaviconLoadProgress,
  preloadFaviconCollection,
} from "@/services/favicon";
import {
  BUILTIN_BACKGROUNDS,
  deleteLocalBackground,
  importBackgroundFile,
  loadBackgroundLibrary,
  normalizeBackgroundPreferences,
  rotateBackground,
  shouldRotateBackground,
} from "@/services/backgrounds";
import { database, saveBookmarkMetadata } from "@/services/database";
import {
  createBookmarkRecoverySnapshot,
  deleteBookmarkHealthRecords,
  deleteBookmarkRecoverySnapshot,
} from "@/services/bookmarkHealth";
import {
  BookmarkIcon,
  hasStaticBookmarkIcon,
} from "./BookmarkIcon";
import { CATEGORY_ICON_OPTIONS, CategoryGlyph } from "./icons";
import { FaviconLoadStatus } from "./FaviconLoadStatus";
import { Modal } from "./Modal";
import { SettingsPanel, type SettingsSectionId } from "./SettingsPanel";
import { TagEditor } from "./TagEditor";
import { HomeClock } from "./HomeClock";
import { WidgetDashboard } from "./WidgetDashboard";
import {
  I18nProvider,
  translate,
  useI18n,
  type AppLocale,
  type TranslationKey,
} from "@/i18n";

const workspaceCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args).filter(
    (collision) => collision.id !== args.active.id,
  );
  if (pointerCollisions.length === 0) return closestCenter(args);

  const collisionType = (id: string | number) =>
    args.droppableContainers.find((container) => container.id === id)?.data
      .current?.type;
  for (const type of [
    "transfer-group",
    "transfer-loose",
    "bookmark",
    "group",
    "loose",
    "category",
  ]) {
    const collision = pointerCollisions.find(
      (candidate) => collisionType(candidate.id) === type,
    );
    if (collision) return [collision];
  }
  return pointerCollisions.slice(0, 1);
};

interface AppProps {
  runtime: AppRuntime;
}

interface BookmarkModalState {
  existing?: BookmarkRecord;
  categoryId: string;
  groupId?: string;
}

interface TextModalState {
  kind: "group" | "rename-group";
  initialValue: string;
  categoryId?: string;
  groupId?: string;
}

interface CategoryEditorState {
  categoryId?: string;
  initialName: string;
  initialIcon: CategoryIcon;
}

interface ContextState {
  bookmark: BookmarkRecord;
  x: number;
  y: number;
  categoryId: string;
  groupId?: string;
}

interface CategoryContextState {
  categoryId: string;
  x: number;
  y: number;
}

interface ExpandedGroupState {
  categoryId: string;
  groupId: string;
}

interface SearchFocusTarget {
  bookmarkId: string;
  categoryId: string;
  groupId?: string;
}

interface CommandUiState {
  status: "thinking" | "ready" | "executing" | "success" | "error";
  input: string;
  message: string;
  plan?: BookmarkCommandPlan;
  selectedBookmarkIds: string[];
}

interface PendingCategoryNavigation {
  categoryId: string;
  block: ScrollLogicalPosition;
  behavior: ScrollBehavior;
}

interface CategoryHoverLabel {
  title: string;
  top: number;
  right: number;
}

interface BookmarkDropPreview {
  bookmarkId: string;
  categoryId: string;
  groupId?: string;
  intent: BookmarkDropIntent;
}

interface BookmarkGroupHover {
  bookmarkId: string;
  startedAt: number;
}

function dragEventPoint(
  event: DragMoveEvent | DragOverEvent | DragEndEvent,
): DropPoint | undefined {
  const activator = event.activatorEvent;
  if (
    "clientX" in activator &&
    "clientY" in activator &&
    typeof activator.clientX === "number" &&
    typeof activator.clientY === "number"
  ) {
    return {
      x: activator.clientX + event.delta.x,
      y: activator.clientY + event.delta.y,
    };
  }

  const touchEvent = activator as TouchEvent;
  const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0];
  if (touch) {
    return {
      x: touch.clientX + event.delta.x,
      y: touch.clientY + event.delta.y,
    };
  }

  const translated = event.active.rect.current.translated;
  return translated
    ? {
        x: translated.left + translated.width / 2,
        y: translated.top + translated.height / 2,
      }
    : undefined;
}

function hasPointerCoordinates(event: Event): boolean {
  if (
    "clientX" in event &&
    "clientY" in event &&
    typeof event.clientX === "number" &&
    typeof event.clientY === "number"
  ) {
    return true;
  }
  const touchEvent = event as TouchEvent;
  return Boolean(touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0]);
}

function findCategorySection(
  root: HTMLElement | null,
  categoryId: string,
): HTMLElement | undefined {
  if (!root) return undefined;
  return Array.from(
    root.querySelectorAll<HTMLElement>("[data-category-section]"),
  ).find((section) => section.dataset.categoryId === categoryId);
}

function findBookmarkPlacement(
  workspace: WorkspaceLayout | undefined,
  bookmarkId: string,
): { categoryId: string; groupId?: string } | undefined {
  for (const category of workspace?.categories ?? []) {
    if (category.bookmarkIds.includes(bookmarkId)) {
      return { categoryId: category.id };
    }
    for (const group of category.groups) {
      if (group.bookmarkIds.includes(bookmarkId)) {
        return { categoryId: category.id, groupId: group.id };
      }
    }
  }
  return undefined;
}

export function App({ runtime }: AppProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceLayout>();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const t = (
    key: TranslationKey,
    values?: Record<string, string | number>,
  ) => translate(settings.language, key, values);
  const [mode, setMode] = useState<SearchMode>("web");
  const [query, setQuery] = useState("");
  const [resolution, setResolution] = useState<SearchResolution>();
  const [commandUi, setCommandUi] = useState<CommandUiState>();
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [engineOpen, setEngineOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SettingsSectionId>("tagging");
  const [bookmarkModal, setBookmarkModal] = useState<BookmarkModalState>();
  const [textModal, setTextModal] = useState<TextModalState>();
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState>();
  const [deleteTarget, setDeleteTarget] = useState<BookmarkRecord>();
  const [context, setContext] = useState<ContextState>();
  const [categoryContext, setCategoryContext] =
    useState<CategoryContextState>();
  const [expandedGroup, setExpandedGroup] = useState<ExpandedGroupState>();
  const [searchFocusTarget, setSearchFocusTarget] =
    useState<SearchFocusTarget>();
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [cloudState, setCloudState] = useState<CloudState>({ revision: 0 });
  const [backgroundAssets, setBackgroundAssets] = useState<BackgroundAsset[]>(
    () => [...BUILTIN_BACKGROUNDS],
  );
  const [faviconProgress, setFaviconProgress] =
    useState<FaviconLoadProgress>();
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [draggedBookmark, setDraggedBookmark] = useState<BookmarkRecord>();
  const [bookmarkDropPreview, setBookmarkDropPreview] =
    useState<BookmarkDropPreview>();
  const [categoryHoverLabel, setCategoryHoverLabel] =
    useState<CategoryHoverLabel>();
  const initialized = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const draggedBookmarkRef = useRef<BookmarkRecord | undefined>(undefined);
  const bookmarkDropPreviewRef = useRef<BookmarkDropPreview | undefined>(
    undefined,
  );
  const bookmarkGroupHoverRef = useRef<BookmarkGroupHover | undefined>(
    undefined,
  );
  const bookmarkGroupHoverTimerRef = useRef<number | undefined>(undefined);
  const appShellRef = useRef<HTMLElement>(null);
  const categoryViewportRef = useRef<HTMLDivElement>(null);
  const pendingCategoryNavigationRef =
    useRef<PendingCategoryNavigation | undefined>(undefined);
  const categoryWheelUnlockTimerRef = useRef<number | undefined>(undefined);
  const categoryWheelLockedRef = useRef(false);
  const initialCategoryScrollDoneRef = useRef(false);
  const backgroundLibraryRef = useRef<{ revoke(): void } | undefined>(undefined);
  const backgroundRotationInitializedRef = useRef(false);
  const commandRequestIdRef = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(
    () => () => {
      if (bookmarkGroupHoverTimerRef.current !== undefined) {
        window.clearTimeout(bookmarkGroupHoverTimerRef.current);
      }
    },
    [],
  );

  const refreshJobs = useCallback(async () => {
    setJobs(await listJobs());
  }, []);

  const refreshBookmarks = useCallback(async () => {
    const nextBookmarks = await runtime.loadBookmarks();
    setBookmarks(nextBookmarks);
    setWorkspace((current) =>
      current ? reconcileWorkspace(current, nextBookmarks) : current,
    );
  }, [runtime]);

  const refreshBackgroundLibrary = useCallback(
    async (cloudApiBaseUrl: string, rotateOnOpen = false) => {
      const loaded = await loadBackgroundLibrary(cloudApiBaseUrl);
      const previous = backgroundLibraryRef.current;
      backgroundLibraryRef.current = loaded;
      setBackgroundAssets(loaded.assets);
      window.setTimeout(() => previous?.revoke(), 0);
      setSettings((current) => {
        let background = normalizeBackgroundPreferences(
          current.background,
          loaded.assets,
        );
        if (
          rotateOnOpen &&
          !backgroundRotationInitializedRef.current &&
          shouldRotateBackground(background, "newtab")
        ) {
          backgroundRotationInitializedRef.current = true;
          background = rotateBackground(background, loaded.assets);
        } else if (rotateOnOpen) {
          backgroundRotationInitializedRef.current = true;
        }
        if (JSON.stringify(background) === JSON.stringify(current.background)) {
          return current;
        }
        const next = { ...current, background };
        void saveSettings(next);
        return next;
      });
      return loaded.assets;
    },
    [],
  );

  const dismissFaviconProgress = useCallback(
    () => setFaviconProgress(undefined),
    [],
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [loadedBookmarks, storedLayout, storedSettings, storedCloudState] =
        await Promise.all([
        runtime.loadBookmarks(),
        loadWorkspace(),
        loadSettings(),
        loadCloudState(),
      ]);
      if (!mounted) return;
      const baseLayout =
        (storedLayout?.version === LAYOUT_VERSION ? storedLayout : undefined) ??
        buildAiOrganizedWorkspace(
          runtime.kind === "preview"
            ? createPreviewWorkspace()
            : buildWorkspaceFromBookmarks(loadedBookmarks),
          loadedBookmarks,
        );
      setBookmarks(loadedBookmarks);
      setWorkspace(reconcileWorkspace(baseLayout, loadedBookmarks));
      setSettings(storedSettings);
      setCloudState(storedCloudState);
      setJobs(await listJobs());
      initialized.current = true;
      void refreshBackgroundLibrary(storedSettings.cloudApiBaseUrl, true);
    })();
    return () => {
      mounted = false;
    };
  }, [refreshBackgroundLibrary, runtime]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(
    () => () => {
      backgroundLibraryRef.current?.revoke();
    },
    [],
  );

  const maybeRotateBackground = useCallback(
    (reason: "newtab" | "timer") => {
      setSettings((current) => {
        if (!shouldRotateBackground(current.background, reason)) return current;
        const background = rotateBackground(
          current.background,
          backgroundAssets,
        );
        const next = { ...current, background };
        void saveSettings(next);
        return next;
      });
    },
    [backgroundAssets],
  );

  useEffect(() => {
    if (
      !settings.background.rotationEnabled ||
      settings.background.rotationInterval === "newtab"
    ) {
      return;
    }
    const tick = () => {
      if (document.visibilityState === "visible") {
        maybeRotateBackground("timer");
      }
    };
    const interval = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [maybeRotateBackground, settings.background.rotationEnabled, settings.background.rotationInterval]);

  useEffect(() => {
    if (!workspace || !initialized.current) return;
    const timeout = window.setTimeout(() => void saveWorkspace(workspace), 180);
    return () => window.clearTimeout(timeout);
  }, [workspace]);

  useEffect(() => {
    const interval = window.setInterval(() => void refreshJobs(), 1200);
    return () => window.clearInterval(interval);
  }, [refreshJobs]);

  useEffect(() => {
    if (runtime.kind !== "chrome") return;
    const refresh = () => void refreshBookmarks();
    const refreshAiState = (message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        (message.type === "ai:metadata-updated" ||
          message.type === "ai:layout-updated")
      ) {
        if (message.type === "ai:layout-updated") {
          void (async () => {
            const [saved, nextBookmarks] = await Promise.all([
              loadWorkspace(),
              runtime.loadBookmarks(),
            ]);
            setBookmarks(nextBookmarks);
            if (saved) {
              setWorkspace(reconcileWorkspace(saved, nextBookmarks));
              setToast("AI 已完成分类与分组");
            }
          })();
        } else {
          void refreshBookmarks();
        }
      }
    };
    chrome.bookmarks.onCreated.addListener(refresh);
    chrome.bookmarks.onChanged.addListener(refresh);
    chrome.bookmarks.onMoved.addListener(refresh);
    chrome.bookmarks.onRemoved.addListener(refresh);
    chrome.runtime.onMessage.addListener(refreshAiState);
    return () => {
      chrome.bookmarks.onCreated.removeListener(refresh);
      chrome.bookmarks.onChanged.removeListener(refresh);
      chrome.bookmarks.onMoved.removeListener(refresh);
      chrome.bookmarks.onRemoved.removeListener(refresh);
      chrome.runtime.onMessage.removeListener(refreshAiState);
    };
  }, [refreshBookmarks, runtime]);

  useEffect(() => {
    const closeMenus = () => {
      setContext(undefined);
      setCategoryContext(undefined);
      setEngineOpen(false);
    };
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!workspace || initialCategoryScrollDoneRef.current) return;
    if (workspace.activeCategoryId === workspace.categories[0]?.id) {
      initialCategoryScrollDoneRef.current = true;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      initialCategoryScrollDoneRef.current = true;
      findCategorySection(
        appShellRef.current,
        workspace.activeCategoryId,
      )?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspace]);

  useEffect(() => {
    const categoryId = workspace?.activeCategoryId;
    if (!categoryId) return;
    const frame = window.requestAnimationFrame(() => {
      const rail = appShellRef.current?.querySelector<HTMLElement>(
        ".rail-categories",
      );
      const button = rail
        ? Array.from(
            rail.querySelectorAll<HTMLElement>("[data-rail-category-id]"),
          ).find((item) => item.dataset.railCategoryId === categoryId)
        : undefined;
      if (!rail || !button) return;
      if (button.offsetTop < rail.scrollTop) {
        rail.scrollTop = button.offsetTop;
      } else if (
        button.offsetTop + button.offsetHeight >
        rail.scrollTop + rail.clientHeight
      ) {
        rail.scrollTop =
          button.offsetTop + button.offsetHeight - rail.clientHeight;
      }
      if (button.offsetLeft < rail.scrollLeft) {
        rail.scrollLeft = button.offsetLeft;
      } else if (
        button.offsetLeft + button.offsetWidth >
        rail.scrollLeft + rail.clientWidth
      ) {
        rail.scrollLeft =
          button.offsetLeft + button.offsetWidth - rail.clientWidth;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspace?.activeCategoryId]);

  useEffect(() => {
    const categoryId = workspace?.activeCategoryId;
    const pending = pendingCategoryNavigationRef.current;
    if (!categoryId || pending?.categoryId !== categoryId) return;
    const frame = window.requestAnimationFrame(() => {
      findCategorySection(appShellRef.current, categoryId)?.scrollIntoView({
        behavior: pending.behavior,
        block: pending.block,
      });
      pendingCategoryNavigationRef.current = undefined;
      if (categoryWheelUnlockTimerRef.current !== undefined) {
        window.clearTimeout(categoryWheelUnlockTimerRef.current);
      }
      categoryWheelUnlockTimerRef.current = window.setTimeout(() => {
        categoryWheelLockedRef.current = false;
        categoryWheelUnlockTimerRef.current = undefined;
      }, 260);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspace?.activeCategoryId]);

  useEffect(
    () => () => {
      if (categoryWheelUnlockTimerRef.current !== undefined) {
        window.clearTimeout(categoryWheelUnlockTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!searchFocusTarget) return;
    let frame: number | undefined;
    let clearTimer: number | undefined;
    let attempts = 0;
    const selector = `[data-bookmark-id="${window.CSS.escape(searchFocusTarget.bookmarkId)}"]`;

    const revealTarget = () => {
      const root = searchFocusTarget.groupId
        ? document.querySelector<HTMLElement>(".group-detail-panel")
        : appShellRef.current;
      const target = root?.querySelector<HTMLElement>(selector);
      if (!target && attempts < 30) {
        attempts += 1;
        frame = window.requestAnimationFrame(revealTarget);
        return;
      }
      if (!target) {
        setSearchFocusTarget(undefined);
        return;
      }
      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
      setHighlightIds([searchFocusTarget.bookmarkId]);
      clearTimer = window.setTimeout(() => {
        setHighlightIds([]);
        setSearchFocusTarget(undefined);
      }, 3400);
    };

    frame = window.requestAnimationFrame(revealTarget);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (clearTimer !== undefined) window.clearTimeout(clearTimer);
    };
  }, [expandedGroup, searchFocusTarget]);

  const bookmarkMap = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks],
  );
  const faviconTargetKey = useMemo(
    () =>
      bookmarks
        .map(({ id, url }) => `${id}\u0000${url}`)
        .sort()
        .join("\u0001"),
    [bookmarks],
  );

  useEffect(() => {
    let active = true;
    const targets = bookmarks.map((bookmark) => ({
      pageUrl: bookmark.url,
      chromeFaviconUrl: runtime.faviconUrl(bookmark),
      hasStaticIcon: hasStaticBookmarkIcon(bookmark.url),
    }));
    void preloadFaviconCollection(targets, (progress) => {
      if (active) setFaviconProgress(progress);
    });
    return () => {
      active = false;
    };
  }, [faviconTargetKey, runtime]);

  const activeCategory =
    workspace?.categories.find(
      (category) => category.id === workspace.activeCategoryId,
    ) ?? workspace?.categories[0];
  const activeEngine =
    SEARCH_ENGINES.find((engine) => engine.id === settings.engineId) ??
    SEARCH_ENGINES[0]!;
  const commandMode = query.trimStart().startsWith("/");
  const currentBackground =
    backgroundAssets.find(
      (asset) => asset.id === settings.background.currentAssetId,
    ) ?? backgroundAssets[0] ?? BUILTIN_BACKGROUNDS[0]!;
  const dailyQuote = classicQuoteForDate(now);

  if (!workspace || !activeCategory) {
    return (
      <main className="app-shell app-loading">
        <Sparkle size={25} weight="duotone" />
        <span>{t("正在整理书签…")}</span>
      </main>
    );
  }

  function updateWorkspace(updater: (draft: WorkspaceLayout) => void) {
    setWorkspace((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      updater(next);
      next.updatedAt = Date.now();
      return next;
    });
  }

  function scrollToCategory(categoryId: string) {
    if (categoryId === workspace!.activeCategoryId) {
      findCategorySection(appShellRef.current, categoryId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }
    pendingCategoryNavigationRef.current = {
      categoryId,
      block: "start",
      behavior: "smooth",
    };
    updateWorkspace((next) => {
      next.activeCategoryId = categoryId;
    });
  }

  function handleCategoryViewportWheel(event: ReactWheelEvent<HTMLElement>) {
    if (categoryWheelLockedRef.current || event.deltaY === 0) return;
    const currentWorkspace = workspace;
    if (!currentWorkspace) return;
    const eventTarget = event.target;
    if (
      eventTarget instanceof Element &&
      eventTarget.closest(
        ".category-rail, .group-detail-overlay, .modal-backdrop, .context-menu",
      )
    ) {
      return;
    }
    const shell = categoryViewportRef.current;
    const section = findCategorySection(
      shell,
      currentWorkspace.activeCategoryId,
    );
    if (!shell || !section) return;
    const direction = categoryBoundaryDirection(
      section.getBoundingClientRect(),
      shell.getBoundingClientRect(),
      event.deltaY,
    );
    if (!direction) return;
    const categoryId = adjacentCategoryId(
      currentWorkspace.categories.map((category) => category.id),
      currentWorkspace.activeCategoryId,
      direction,
    );
    if (!categoryId) return;
    categoryWheelLockedRef.current = true;
    pendingCategoryNavigationRef.current = {
      categoryId,
      block: direction === "next" ? "start" : "end",
      behavior: "auto",
    };
    updateWorkspace((next) => {
      next.activeCategoryId = categoryId;
    });
  }

  function focusSearchHit(hit: SearchResolution["hits"][number]) {
    if (!hit.categoryId) return;
    const category = workspace!.categories.find(
      (item) => item.id === hit.categoryId,
    );
    const group = category?.groups.find((item) => item.id === hit.groupId);
    updateWorkspace((draft) => {
      draft.activeCategoryId = hit.categoryId!;
    });
    findCategorySection(appShellRef.current, hit.categoryId)?.scrollIntoView({
      behavior: group ? "auto" : "smooth",
      block: "start",
    });
    setExpandedGroup(
      group ? { categoryId: hit.categoryId, groupId: group.id } : undefined,
    );
    setHighlightIds([]);
    setSearchFocusTarget({
      bookmarkId: hit.bookmark.id,
      categoryId: hit.categoryId,
      groupId: group?.id,
    });
  }

  async function prepareNaturalLanguageCommand(value: string) {
    const requestId = ++commandRequestIdRef.current;
    setResolution(undefined);
    setEngineOpen(false);
    setCommandUi({
      status: "thinking",
      input: value,
      message: "AI 正在理解并拆分命令…",
      selectedBookmarkIds: [],
    });
    try {
      const plan = await createNaturalLanguageCommandPlan(
        value,
        settings,
        workspace!,
        bookmarks,
        (progress: CommandPlanningProgress) => {
          if (requestId !== commandRequestIdRef.current) return;
          setCommandUi((current) =>
            current?.input === value
              ? { ...current, message: progress.message }
              : current,
          );
        },
      );
      if (requestId !== commandRequestIdRef.current) return;
      setCommandUi({
        status: "ready",
        input: value,
        message: "命令已解析，请核对影响范围后确认",
        plan,
        selectedBookmarkIds: plan.candidates.map((candidate) => candidate.id),
      });
    } catch (error) {
      if (requestId !== commandRequestIdRef.current) return;
      setCommandUi({
        status: "error",
        input: value,
        message: error instanceof Error ? error.message : "命令解析失败",
        selectedBookmarkIds: [],
      });
    }
  }

  async function executePreparedCommand() {
    const state = commandUi;
    const plan = state?.plan;
    if (!state || !plan || state.status !== "ready" || !workspace) return;
    setCommandUi({ ...state, status: "executing", message: "正在执行已确认的命令…" });
    try {
      if (plan.spec.operation === "undoLastCommand") {
        const restored = await undoCommandExecution(workspace);
        if (!restored) throw new Error("没有可撤销的命令记录");
        await saveWorkspace(restored.layout);
        setWorkspace(restored.layout);
        setQuery("");
        setCommandUi({
          status: "success",
          input: state.input,
          message: `已撤销：${restored.label}`,
          selectedBookmarkIds: [],
        });
        return;
      }
      if (plan.spec.operation === "redoLastCommand") {
        const restored = await redoCommandExecution(workspace);
        if (!restored) throw new Error("没有可重做的命令记录");
        await saveWorkspace(restored.layout);
        setWorkspace(restored.layout);
        setQuery("");
        setCommandUi({
          status: "success",
          input: state.input,
          message: `已重做：${restored.label}`,
          selectedBookmarkIds: [],
        });
        return;
      }
      if (!plan.isMutation) {
        setCommandUi({ ...state, status: "success", message: "命令已完成" });
        return;
      }
      const result = executeBookmarkCommandPlan(
        plan,
        workspace,
        state.selectedBookmarkIds,
      );
      await recordCommandExecution(workspace, plan.description);
      await saveWorkspace(result.workspace);
      setWorkspace(result.workspace);
      setQuery("");
      setCommandUi({
        status: "success",
        input: state.input,
        message: result.message,
        plan,
        selectedBookmarkIds: state.selectedBookmarkIds,
      });
      setToast(result.message);
    } catch (error) {
      setCommandUi({
        ...state,
        status: "error",
        message: error instanceof Error ? error.message : "命令执行失败",
      });
    }
  }

  async function undoLatestCommand() {
    if (!workspace) return;
    try {
      const restored = await undoCommandExecution(workspace);
      if (!restored) throw new Error("没有可撤销的命令记录");
      await saveWorkspace(restored.layout);
      setWorkspace(restored.layout);
      setCommandUi({
        status: "success",
        input: "/撤销",
        message: `已撤销：${restored.label}`,
        selectedBookmarkIds: [],
      });
      setToast("已撤销上一次命令");
    } catch (error) {
      setCommandUi({
        status: "error",
        input: "/撤销",
        message: error instanceof Error ? error.message : "撤销失败",
        selectedBookmarkIds: [],
      });
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value) {
      searchInput.current?.focus();
      return;
    }
    if (value.startsWith("/")) {
      await prepareNaturalLanguageCommand(value);
      return;
    }
    if (mode === "web") {
      await runtime.openUrl(
        `${activeEngine.queryUrl}${encodeURIComponent(value)}`,
        settings.openInNewTab,
      );
      return;
    }
    const result = await resolveSmartSearch(
      value,
      bookmarks,
      workspace!,
      settings,
    );
    setResolution(result);
  }

  async function handleSaveBookmark(draft: BookmarkDraft) {
    const existing = bookmarkModal?.existing;
    const saved = await runtime.saveBookmark(draft, existing);
    if (existing && existing.url !== saved.url) {
      await deleteBookmarkHealthRecords([saved.id]);
    }
    setBookmarks((current) => {
      const index = current.findIndex((item) => item.id === saved.id);
      if (index < 0) return [...current, saved];
      return current.map((item) => (item.id === saved.id ? saved : item));
    });
    updateWorkspace((next) => {
      removeBookmarkFromWorkspace(next, saved.id);
      const category = next.categories.find(
        (item) => item.id === draft.categoryId,
      );
      const group = category?.groups.find((item) => item.id === draft.groupId);
      if (group) group.bookmarkIds.push(saved.id);
      else category?.bookmarkIds.push(saved.id);
      if (category) lockBookmarkPlacement(next, saved.id, "manual");
    });
    setBookmarkModal(undefined);
    setToast(existing ? "图标已更新" : "图标已添加");
  }

  async function handleDeleteBookmark() {
    if (!deleteTarget) return;
    await deleteHealthBookmarks([deleteTarget.id]);
    setDeleteTarget(undefined);
    setToast("图标已删除");
  }

  async function updateHealthBookmarkUrls(
    updates: Array<{ bookmarkId: string; finalUrl: string }>,
  ): Promise<void> {
    const uniqueUpdates = [
      ...new Map(updates.map((update) => [update.bookmarkId, update])).values(),
    ];
    if (uniqueUpdates.length === 0) return;
    const updateById = new Map(
      uniqueUpdates.map((update) => [update.bookmarkId, update.finalUrl]),
    );
    const targets = uniqueUpdates.map((update) => {
      const bookmark = bookmarks.find((item) => item.id === update.bookmarkId);
      if (!bookmark) throw new Error("部分书签已不存在，请刷新后重试");
      return bookmark;
    });
    const snapshot = await createBookmarkRecoverySnapshot(
      "update",
      targets,
      [],
    );
    const updated: BookmarkRecord[] = [];
    try {
      for (const bookmark of targets) {
        const finalUrl = updateById.get(bookmark.id)!;
        updated.push(
          await runtime.saveBookmark(
            {
              title: bookmark.title,
              url: finalUrl,
              categoryId:
                workspace?.activeCategoryId ?? UNCATEGORIZED_CATEGORY_ID,
              tags: bookmark.tags,
              aiTags: bookmark.aiTags,
            },
            bookmark,
          ),
        );
      }
    } catch (error) {
      if (updated.length === 0) {
        await deleteBookmarkRecoverySnapshot(snapshot.id);
      } else {
        const updatedIds = new Set(updated.map((bookmark) => bookmark.id));
        await database.healthRecovery.put({
          ...snapshot,
          bookmarks: snapshot.bookmarks.filter((bookmark) =>
            updatedIds.has(bookmark.id),
          ),
        });
        await finalizeUpdatedBookmarks(updated);
      }
      throw new Error(
        `只更新了 ${updated.length}/${targets.length} 条书签；成功部分已保存撤销快照。${
          error instanceof Error ? ` ${error.message}` : ""
        }`,
      );
    }
    await finalizeUpdatedBookmarks(updated);

    async function finalizeUpdatedBookmarks(saved: BookmarkRecord[]) {
      const savedById = new Map(saved.map((bookmark) => [bookmark.id, bookmark]));
      await deleteBookmarkHealthRecords([...savedById.keys()]);
      setBookmarks((current) =>
        current.map((bookmark) => savedById.get(bookmark.id) ?? bookmark),
      );
    }
  }

  async function deleteHealthBookmarks(
    bookmarkIds: string[],
    recoveryAction: "delete" | "merge" = "delete",
  ): Promise<void> {
    const ids = new Set(bookmarkIds);
    const targets = bookmarks.filter((bookmark) => ids.has(bookmark.id));
    if (targets.length === 0) return;
    const placements = targets.flatMap((target) => {
      const placement = findBookmarkPlacement(workspace, target.id);
      return placement ? [{ bookmarkId: target.id, ...placement }] : [];
    });
    const snapshot = await createBookmarkRecoverySnapshot(
      recoveryAction,
      targets,
      placements,
    );
    const deleted: BookmarkRecord[] = [];
    try {
      for (const target of targets) {
        await runtime.deleteBookmark(target);
        deleted.push(target);
      }
    } catch (error) {
      if (deleted.length === 0) {
        await deleteBookmarkRecoverySnapshot(snapshot.id);
      } else {
        const deletedIds = new Set(deleted.map((target) => target.id));
        await database.healthRecovery.put({
          ...snapshot,
          bookmarks: snapshot.bookmarks.filter((item) => deletedIds.has(item.id)),
          placements: snapshot.placements.filter((item) => deletedIds.has(item.bookmarkId)),
        });
        await finalizeDeletedBookmarks(deleted);
      }
      throw new Error(
        `只删除了 ${deleted.length}/${targets.length} 条书签；已为成功删除的部分保留恢复快照。${error instanceof Error ? ` ${error.message}` : ""}`,
      );
    }
    await finalizeDeletedBookmarks(deleted);

    async function finalizeDeletedBookmarks(deletedTargets: BookmarkRecord[]) {
      const deletedIds = deletedTargets.map((target) => target.id);
      const deletedIdSet = new Set(deletedIds);
      await Promise.all([
        database.metadata.bulkDelete(deletedIds),
        deleteBookmarkHealthRecords(deletedIds),
      ]);
      setBookmarks((current) =>
        current.filter((item) => !deletedIdSet.has(item.id)),
      );
      updateWorkspace((next) => {
        for (const target of deletedTargets) {
          removeBookmarkFromWorkspace(next, target.id);
          if (target.source !== "chrome") {
            next.customBookmarks = next.customBookmarks.filter(
              (item) => item.id !== target.id,
            );
          }
        }
      });
    }
  }

  async function mergeHealthDuplicates(
    primaryId: string,
    duplicateIds: string[],
  ): Promise<void> {
    const primary = bookmarks.find((bookmark) => bookmark.id === primaryId);
    const duplicates = bookmarks.filter((bookmark) =>
      duplicateIds.includes(bookmark.id),
    );
    if (!primary || duplicates.length !== duplicateIds.length) {
      throw new Error("部分重复书签已经发生变化，请刷新后重试");
    }
    const merged = [primary, ...duplicates];
    const manualTags = [...new Set(merged.flatMap((bookmark) => bookmark.tags))];
    const aiTags = [...new Set(merged.flatMap((bookmark) => bookmark.aiTags))];
    const summary = merged.find((bookmark) => bookmark.summary)?.summary;
    const aiCategory = merged.find((bookmark) => bookmark.aiCategory)?.aiCategory;
    const aiGroup = merged.find((bookmark) => bookmark.aiGroup)?.aiGroup;
    await saveBookmarkMetadata(
      primary.id,
      aiTags,
      summary,
      aiCategory,
      aiGroup,
    );
    await runtime.saveBookmark(
      {
        title: primary.title,
        url: primary.url,
        categoryId: workspace?.activeCategoryId ?? UNCATEGORIZED_CATEGORY_ID,
        tags: manualTags,
        aiTags,
      },
      primary,
    );
    await deleteHealthBookmarks(duplicateIds, "merge");
    setBookmarks((current) =>
      current.map((bookmark) =>
        bookmark.id === primary.id
          ? {
              ...bookmark,
              tags: manualTags,
              aiTags,
              summary,
              aiCategory,
              aiGroup,
            }
          : bookmark,
      ),
    );
  }

  async function restoreHealthSnapshot(snapshotId: string): Promise<void> {
    const snapshot = await database.healthRecovery.get(snapshotId);
    if (!snapshot) throw new Error("恢复快照已不存在");
    if (snapshot.action === "update") {
      const targets = snapshot.bookmarks.map((original) => {
        const current = bookmarks.find((bookmark) => bookmark.id === original.id);
        if (!current) {
          throw new Error("部分已更新书签已不存在，撤销快照已保留");
        }
        return { current, original };
      });
      const restored: BookmarkRecord[] = [];
      try {
        for (const { current, original } of targets) {
          restored.push(
            await runtime.saveBookmark(
              {
                title: current.title,
                url: original.url,
                categoryId:
                  workspace?.activeCategoryId ?? UNCATEGORIZED_CATEGORY_ID,
                tags: current.tags,
                aiTags: current.aiTags,
              },
              current,
            ),
          );
        }
      } catch (error) {
        await finalizeRestoredBookmarks(restored);
        const restoredIds = new Set(restored.map((bookmark) => bookmark.id));
        await database.healthRecovery.put({
          ...snapshot,
          bookmarks: snapshot.bookmarks.filter(
            (bookmark) => !restoredIds.has(bookmark.id),
          ),
        });
        throw new Error(
          `只撤销了 ${restored.length}/${snapshot.bookmarks.length} 条地址更新；剩余项目仍保留在撤销快照中。${
            error instanceof Error ? ` ${error.message}` : ""
          }`,
        );
      }
      await finalizeRestoredBookmarks(restored);
      await deleteBookmarkRecoverySnapshot(snapshotId);
      return;

      async function finalizeRestoredBookmarks(saved: BookmarkRecord[]) {
        if (saved.length === 0) return;
        const restoredById = new Map(
          saved.map((bookmark) => [bookmark.id, bookmark]),
        );
        await deleteBookmarkHealthRecords([...restoredById.keys()]);
        setBookmarks((current) =>
          current.map((bookmark) => restoredById.get(bookmark.id) ?? bookmark),
        );
      }
    }
    const restored = await runtime.restoreBookmarks(snapshot.bookmarks);
    if (restored.length !== snapshot.bookmarks.length) {
      throw new Error("部分书签没有恢复成功，快照已保留，可稍后重试");
    }
    const restoredWithMetadata: BookmarkRecord[] = [];
    for (let index = 0; index < restored.length; index += 1) {
      const next = restored[index]!;
      const original = snapshot.bookmarks[index]!;
      await saveBookmarkMetadata(
        next.id,
        original.aiTags,
        original.summary,
        original.aiCategory,
        original.aiGroup,
      );
      restoredWithMetadata.push({
        ...next,
        tags: original.tags,
        aiTags: original.aiTags,
        summary: original.summary,
        aiCategory: original.aiCategory,
        aiGroup: original.aiGroup,
      });
    }
    const idMap = new Map(
      snapshot.bookmarks.map((bookmark, index) => [
        bookmark.id,
        restored[index]!.id,
      ]),
    );
    setBookmarks((current) => [...current, ...restoredWithMetadata]);
    updateWorkspace((next) => {
      for (const placement of snapshot.placements) {
        const restoredId = idMap.get(placement.bookmarkId);
        if (!restoredId) continue;
        const category = next.categories.find(
          (item) => item.id === placement.categoryId,
        );
        const group = category?.groups.find(
          (item) => item.id === placement.groupId,
        );
        if (group) group.bookmarkIds.push(restoredId);
        else if (category) category.bookmarkIds.push(restoredId);
        else {
          next.categories
            .find((item) => item.id === UNCATEGORIZED_CATEGORY_ID)
            ?.bookmarkIds.push(restoredId);
        }
        lockBookmarkPlacement(next, restoredId, "manual");
      }
    });
    await deleteBookmarkRecoverySnapshot(snapshotId);
  }

  function handleTextSubmit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || !textModal) return;
    updateWorkspace((next) => {
      if (textModal.kind === "group" && textModal.categoryId) {
        next.categories
          .find((item) => item.id === textModal.categoryId)
          ?.groups.push(createGroup(trimmed));
      } else if (
        textModal.kind === "rename-group" &&
        textModal.categoryId &&
        textModal.groupId
      ) {
        const group = next.categories
          .find((item) => item.id === textModal.categoryId)
          ?.groups.find((item) => item.id === textModal.groupId);
        if (group) group.title = trimmed;
      }
    });
    setTextModal(undefined);
  }

  function handleCategorySubmit(name: string, icon: CategoryIcon) {
    const trimmed = name.trim();
    if (!trimmed || !categoryEditor) return;
    if (!categoryEditor.categoryId && workspace!.categories.length >= 20) {
      setToast("最多保留 20 个大分类");
      setCategoryEditor(undefined);
      return;
    }
    if (categoryEditor.categoryId) {
      updateWorkspace((next) => {
        const category = next.categories.find(
          (item) => item.id === categoryEditor.categoryId,
        );
        if (!category || category.id === UNCATEGORIZED_CATEGORY_ID) return;
        category.title = trimmed;
        category.icon = icon;
      });
      setCategoryEditor(undefined);
      setToast("大分类已更新");
      return;
    }

    const category = createCategory(
      trimmed,
      workspace!.categories.map((item) => item.icon),
    );
    category.icon = icon;
    updateWorkspace((next) => {
      next.categories.push(category);
      next.activeCategoryId = category.id;
    });
    setCategoryEditor(undefined);
    window.requestAnimationFrame(() => {
      findCategorySection(appShellRef.current, category.id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function deleteCategory(category: BookmarkCategory) {
    if (category.id === UNCATEGORIZED_CATEGORY_ID) {
      setToast("未分类是新书签的默认入口，不能删除");
      return;
    }
    if (workspace!.categories.length <= 1) {
      setToast("至少保留一个大分类");
      return;
    }
    updateWorkspace((next) => {
      const uncategorized = next.categories.find(
        (item) => item.id === UNCATEGORIZED_CATEGORY_ID,
      );
      uncategorized?.bookmarkIds.push(...getCategoryBookmarkIds(category));
      next.categories = next.categories.filter((item) => item.id !== category.id);
      if (next.activeCategoryId === category.id) {
        next.activeCategoryId = next.categories[0]!.id;
      }
    });
  }

  function deleteGroup(categoryId: string, group: BookmarkGroup) {
    const category = workspace!.categories.find((item) => item.id === categoryId);
    if (!category) return;
    updateWorkspace((next) => {
      const target = next.categories.find((item) => item.id === categoryId);
      if (!target) return;
      target.bookmarkIds.push(...group.bookmarkIds);
      target.groups = target.groups.filter((item) => item.id !== group.id);
    });
    if (expandedGroup?.groupId === group.id) setExpandedGroup(undefined);
    setToast("分组已删除，书签已移出到大分类");
  }

  function applyBookmarkDropPreview(next?: BookmarkDropPreview) {
    bookmarkDropPreviewRef.current = next;
    setBookmarkDropPreview((current) =>
      current?.bookmarkId === next?.bookmarkId &&
      current?.categoryId === next?.categoryId &&
      current?.groupId === next?.groupId &&
      current?.intent === next?.intent
        ? current
        : next,
    );
  }

  function clearBookmarkGroupHover() {
    if (bookmarkGroupHoverTimerRef.current !== undefined) {
      window.clearTimeout(bookmarkGroupHoverTimerRef.current);
      bookmarkGroupHoverTimerRef.current = undefined;
    }
    bookmarkGroupHoverRef.current = undefined;
  }

  function resetBookmarkDropState() {
    clearBookmarkGroupHover();
    applyBookmarkDropPreview(undefined);
  }

  function updateBookmarkDropPreview(
    event: DragMoveEvent | DragOverEvent | DragEndEvent,
    scheduleGroupReady = true,
  ): BookmarkDropPreview | undefined {
    const overData = event.over?.data.current;
    const activeIsBookmark =
      event.active.data.current?.type === "bookmark" ||
      Boolean(draggedBookmarkRef.current);
    const categoryId =
      typeof overData?.categoryId === "string"
        ? overData.categoryId
        : undefined;
    const point = dragEventPoint(event);
    if (
      !activeIsBookmark ||
      !event.over ||
      overData?.type !== "bookmark" ||
      !categoryId ||
      !point
    ) {
      clearBookmarkGroupHover();
      applyBookmarkDropPreview(undefined);
      return undefined;
    }

    const bookmarkId = String(event.over.id);
    const groupId =
      typeof overData.groupId === "string" ? overData.groupId : undefined;
    const canCreateGroup =
      !groupId && hasPointerCoordinates(event.activatorEvent);
    const insideGroupCenter =
      canCreateGroup && isBookmarkGroupCenter(event.over.rect, point);
    const now = Date.now();

    if (insideGroupCenter) {
      const hover = bookmarkGroupHoverRef.current;
      if (!hover || hover.bookmarkId !== bookmarkId) {
        clearBookmarkGroupHover();
        bookmarkGroupHoverRef.current = { bookmarkId, startedAt: now };
        if (scheduleGroupReady) {
          bookmarkGroupHoverTimerRef.current = window.setTimeout(() => {
            const currentHover = bookmarkGroupHoverRef.current;
            const currentPreview = bookmarkDropPreviewRef.current;
            if (
              currentHover?.bookmarkId === bookmarkId &&
              currentPreview?.bookmarkId === bookmarkId &&
              !currentPreview.groupId
            ) {
              applyBookmarkDropPreview({
                ...currentPreview,
                intent: "group",
              });
            }
          }, BOOKMARK_GROUP_DWELL_MS);
        }
      }
    } else {
      clearBookmarkGroupHover();
    }

    const hover = bookmarkGroupHoverRef.current;
    const intent = resolveBookmarkDropIntent(event.over.rect, point, {
      canCreateGroup,
      centerHoverMs:
        insideGroupCenter && hover?.bookmarkId === bookmarkId
          ? now - hover.startedAt
          : 0,
    });
    const next = { bookmarkId, categoryId, groupId, intent };
    applyBookmarkDropPreview(next);
    return next;
  }

  function handleDragStart(event: DragStartEvent) {
    resetBookmarkDropState();
    if (event.active.data.current?.type !== "bookmark") return;
    const bookmark = bookmarkMap.get(String(event.active.id));
    draggedBookmarkRef.current = bookmark;
    setDraggedBookmark(bookmark);
  }

  function handleDragMove(event: DragMoveEvent) {
    updateBookmarkDropPreview(event);
  }

  function handleDragOver(event: DragOverEvent) {
    updateBookmarkDropPreview(event);
    if (
      !event.over ||
      (event.active.data.current?.type !== "bookmark" &&
        !draggedBookmarkRef.current)
    ) {
      return;
    }
    const overData = event.over.data.current;
    const targetCategoryId =
      overData?.type === "category"
        ? String(event.over.id)
        : typeof overData?.categoryId === "string"
          ? overData.categoryId
          : undefined;
    if (targetCategoryId && targetCategoryId !== workspace!.activeCategoryId) {
      updateWorkspace((next) => {
        next.activeCategoryId = targetCategoryId;
      });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const dragBookmark = draggedBookmarkRef.current;
    const finalDropPreview = event.over
      ? updateBookmarkDropPreview(event, false)
      : undefined;
    draggedBookmarkRef.current = undefined;
    setDraggedBookmark(undefined);
    resetBookmarkDropState();
    if (!event.over || event.active.id === event.over.id) return;
    const activeData = event.active.data.current;
    const overData = event.over.data.current;
    if (activeData?.type === "category" && overData?.type === "category") {
      updateWorkspace((next) => {
        const from = next.categories.findIndex(
          (item) => item.id === event.active.id,
        );
        const to = next.categories.findIndex(
          (item) => item.id === event.over!.id,
        );
        if (from >= 0 && to >= 0) next.categories = arrayMove(next.categories, from, to);
      });
      return;
    }
    if (activeData?.type === "group" && overData?.type === "group") {
      updateWorkspace((next) => {
        const category = next.categories.find(
          (item) => item.id === activeData.categoryId,
        );
        if (!category || activeData.categoryId !== overData.categoryId) return;
        const from = category.groups.findIndex(
          (item) => item.id === event.active.id,
        );
        const to = category.groups.findIndex(
          (item) => item.id === event.over!.id,
        );
        if (from >= 0 && to >= 0) category.groups = arrayMove(category.groups, from, to);
      });
      return;
    }
    if (activeData?.type !== "bookmark" && !dragBookmark) return;

    const createsGroup =
      overData?.type === "bookmark" &&
      !overData.groupId &&
      finalDropPreview?.bookmarkId === String(event.over.id) &&
      finalDropPreview.intent === "group";
    updateWorkspace((next) => {
      let targetCategoryId: string | undefined;
      let targetGroupId: string | undefined;
      if (overData?.type === "bookmark") {
        targetCategoryId = overData.categoryId;
        if (!targetCategoryId) return;
        const bookmarkId = dragBookmark?.id ?? String(event.active.id);
        const targetBookmarkId = String(event.over!.id);
        if (createsGroup) {
          const created = createGroupFromBookmarkDrop(
            next,
            bookmarkId,
            targetBookmarkId,
            targetCategoryId,
          );
          if (!created) return;
          lockBookmarkPlacement(next, bookmarkId, "manual");
          lockBookmarkPlacement(next, targetBookmarkId, "manual");
          return;
        }

        targetGroupId =
          typeof overData.groupId === "string"
            ? overData.groupId
            : undefined;
        const position =
          finalDropPreview?.bookmarkId === targetBookmarkId &&
          finalDropPreview.intent !== "group"
            ? finalDropPreview.intent
            : "after";
        if (
          moveBookmarkRelativeInWorkspace(
            next,
            bookmarkId,
            targetBookmarkId,
            targetCategoryId,
            targetGroupId,
            position,
          )
        ) {
          lockBookmarkPlacement(next, bookmarkId, "manual");
        }
        return;
      } else if (
        overData?.type === "group" ||
        overData?.type === "transfer-group"
      ) {
        targetCategoryId = overData.categoryId;
        targetGroupId =
          typeof overData.groupId === "string"
            ? overData.groupId
            : String(event.over!.id);
      } else if (
        overData?.type === "loose" ||
        overData?.type === "transfer-loose"
      ) {
        targetCategoryId = overData.categoryId;
      } else if (overData?.type === "category") {
        targetCategoryId = String(event.over!.id);
      }
      if (!targetCategoryId) return;
      const bookmarkId = dragBookmark?.id ?? String(event.active.id);
      if (moveBookmarkInWorkspace(
        next,
        bookmarkId,
        targetCategoryId,
        targetGroupId,
      )) {
        lockBookmarkPlacement(next, bookmarkId, "manual");
      }
    });
    if (createsGroup) setToast("已自动创建新分组，可通过菜单重命名");
  }

  async function saveAppSettings(next: AppSettings): Promise<boolean> {
    const permissionEndpoints: string[] = [];
    if (
      next.provider.enabled &&
      next.provider.endpoint &&
      (!settings.provider.enabled ||
        next.provider.endpoint !== settings.provider.endpoint)
    ) {
      permissionEndpoints.push(next.provider.endpoint);
    }
    if (
      next.cloudApiBaseUrl &&
      next.cloudApiBaseUrl !== settings.cloudApiBaseUrl
    ) {
      permissionEndpoints.push(next.cloudApiBaseUrl);
    }
    let granted = true;
    if (permissionEndpoints.length > 0) {
      try {
        granted = await runtime.requestHostPermissions(permissionEndpoints);
      } catch {
        granted = false;
      }
    }
    if (!granted) return false;
    await saveSettings(next);
    setSettings(next);
    return true;
  }

  async function saveBackgroundPreferences(
    background: BackgroundPreferences,
    assets = backgroundAssets,
  ): Promise<void> {
    const normalized = normalizeBackgroundPreferences(background, assets);
    const next = { ...settings, background: normalized };
    await saveSettings(next);
    setSettings(next);
  }

  async function configureCloudEndpoint(apiBaseUrl: string): Promise<AppSettings> {
    const trimmed = apiBaseUrl.trim().replace(/\/+$/, "");
    if (!trimmed) throw new Error("请先填写 Cloudflare Worker 地址");
    const granted = await runtime.requestHostPermissions([trimmed]);
    if (!granted) throw new Error("Cloudflare Worker 域名授权未通过");
    const next = { ...settings, cloudApiBaseUrl: trimmed };
    await saveSettings(next);
    setSettings(next);
    return next;
  }

  async function makeCurrentBackup(
    settingsOverride = settings,
  ): Promise<BackupDocument> {
    return createBackupDocument(workspace!, settingsOverride, bookmarks);
  }

  async function applyFullBackup(
    backup: string | BackupDocument,
  ) {
    const result = await restoreBackupDocument(
      backup,
      bookmarks,
      settings,
    );
    await Promise.all([
      saveWorkspace(result.layout),
      saveSettings(result.settings),
    ]);
    setWorkspace(result.layout);
    setSettings(result.settings);
    await refreshBookmarks();
    return result;
  }

  async function startTagging(
    scope: AiTaggingScope,
    limit: AiTaggingLimit,
  ) {
    if (!settings.provider.enabled || !settings.provider.apiKey) {
      setToast("请先启用并保存 AI Provider");
      return;
    }
    const untagged = bookmarks.filter((bookmark) => bookmark.aiTags.length === 0);
    if (scope === "untagged" && untagged.length === 0) {
      const job = await organizeExistingAiTags(bookmarks);
      if (job) {
        await runtime.notifyBackground();
        if (runtime.kind === "preview") void runNextJob();
        await refreshJobs();
        setToast("现有标签的全局分组任务已加入队列");
      } else {
        setToast("所有书签已有 AI 标签，且首次全局分组已经完成");
      }
      return;
    }
    const selected = selectTaggingCandidates(bookmarks, jobs, limit, scope);
    if (selected.length === 0) {
      setToast(
        scope === "processed"
          ? "没有可重新处理的已有 AI 结果，相关书签可能已在任务队列中"
          : scope === "all"
            ? "没有可处理的书签，相关书签可能已在任务队列中"
            : "未处理书签已在任务队列中，请等待完成或重试失败任务",
      );
      return;
    }
    const shouldBootstrap =
      limit === "all" &&
      ((scope === "untagged" && selected.length === untagged.length) ||
        selected.length === bookmarks.length);
    const job = await enqueueTaggingJob(selected, {
      bootstrapBookmarks: shouldBootstrap ? bookmarks : undefined,
    });
    await runtime.notifyBackground();
    if (runtime.kind === "preview") void runNextJob();
    await refreshJobs();
    if (scope === "untagged") {
      setToast(
        job.organizationMode === "bootstrap"
          ? `${selected.length} 个书签的 AI 标签与首次自动整理任务已加入队列`
          : `${selected.length} 个书签的 AI 标签任务已加入队列`,
      );
    } else {
      setToast(
        `${selected.length} 个书签已加入重新处理队列；新请求成功后才会覆盖各自的旧 AI 结果`,
      );
    }
  }

  async function restoreLayoutBeforeAiOrganization() {
    const backup = await loadAiOrganizationBackup();
    if (!backup) throw new Error("没有可恢复的 AI 整理前布局");
    const restored = reconcileWorkspace(backup, bookmarks);
    await Promise.all([
      saveWorkspace(restored),
      clearAiOrganizationState(),
    ]);
    setWorkspace(restored);
    setToast("已恢复 AI 整理前布局");
  }

  return (
    <I18nProvider language={settings.language}>
    <main
      className="app-shell"
      ref={appShellRef}
      onContextMenu={(event) => event.preventDefault()}
    >
      <BackgroundLayers
        url={currentBackground.url}
        overlayOpacity={settings.background.overlayOpacity}
        blur={settings.background.blur}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={workspaceCollisionDetection}
        autoScroll
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          draggedBookmarkRef.current = undefined;
          setDraggedBookmark(undefined);
          resetBookmarkDropState();
        }}
      >
      <section
        className={`workspace-frame${settings.screenDisplay.showTime ? " has-home-time" : ""}${settings.screenDisplay.showDailyQuote ? " has-daily-quote" : ""}`}
      >
        {settings.screenDisplay.showTime && (
          <HomeClock date={now} preferences={settings.screenDisplay} />
        )}
        <div className="search-area">
          <form
            className={`search-bar${commandMode ? " command-mode" : ""}`}
            onSubmit={handleSearch}
          >
          <div className="engine-control">
            <button
              type="button"
              className="engine-button"
              onClick={(event) => {
                event.stopPropagation();
                setEngineOpen((value) => !value);
              }}
              aria-expanded={engineOpen}
            >
              <span className={`engine-mark engine-${activeEngine.id}`}>
                <EngineLogo engineId={activeEngine.id} size={21} />
              </span>
              <CaretDown size={15} />
            </button>
            {engineOpen && (
              <div
                className="engine-menu glass-menu"
                onClick={(event) => event.stopPropagation()}
              >
                {SEARCH_ENGINES.map((engine) => (
                  <button
                    type="button"
                    key={engine.id}
                    onClick={() => {
                      setSettings((current) => ({
                        ...current,
                        engineId: engine.id,
                      }));
                      void saveSettings({ ...settings, engineId: engine.id });
                      setEngineOpen(false);
                    }}
                  >
                    <span className={`engine-mark engine-${engine.id}`}>
                      <EngineLogo engineId={engine.id} size={18} />
                    </span>
                    <span>{engine.name}</span>
                    {engine.id === activeEngine.id && <Check size={16} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="search-divider" />
          <input
            ref={searchInput}
            value={query}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "ENTER") {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              if (!nextQuery) setResolution(undefined);
              if (commandUi && commandUi.input !== nextQuery) {
                commandRequestIdRef.current += 1;
                setCommandUi(undefined);
              }
            }}
            placeholder={
              commandMode
                ? t("用自然语言描述要整理的书签，Enter 后先生成执行计划")
                : mode === "web"
                ? t("搜索网页或全部书签")
                : t("搜索全部书签，例如：找一下做域名分析的网站")
            }
            aria-label={
              commandMode
                ? t("输入自然语言命令")
                : mode === "web"
                  ? t("搜索网页")
                  : t("搜索全部书签")
            }
          />
          {commandMode ? (
            <span className="command-mode-badge">
              <Sparkle size={15} weight="fill" /> {t("AI 命令")}
            </span>
          ) : (
          <div className="mode-switch" aria-label={t("搜索模式")}>
            <button
              type="button"
              className={mode === "web" ? "active" : ""}
              onClick={() => {
                setMode("web");
                setResolution(undefined);
              }}
            >
              Web
            </button>
            <button
              type="button"
              className={mode === "bookmarks" ? "active" : ""}
              onClick={() => setMode("bookmarks")}
            >
              Bookmarks
            </button>
          </div>
          )}
          </form>

          {commandMode && query.trim() === "/" && !commandUi && (
            <CommandSuggestions
              onSelect={(example) => {
                setQuery(example);
                searchInput.current?.focus();
              }}
            />
          )}

          {commandUi && (
            <CommandInteractionPanel
              state={commandUi}
              onToggleBookmark={(bookmarkId) =>
                setCommandUi((current) => {
                  if (!current || current.status !== "ready") return current;
                  const selected = new Set(current.selectedBookmarkIds);
                  if (selected.has(bookmarkId)) selected.delete(bookmarkId);
                  else selected.add(bookmarkId);
                  return { ...current, selectedBookmarkIds: [...selected] };
                })
              }
              onSelectAll={(selected) =>
                setCommandUi((current) =>
                  current?.plan && current.status === "ready"
                    ? {
                        ...current,
                        selectedBookmarkIds: selected
                          ? current.plan.candidates.map((candidate) => candidate.id)
                          : [],
                      }
                    : current,
                )
              }
              onConfirm={() => void executePreparedCommand()}
              onRetry={() => void prepareNaturalLanguageCommand(commandUi.input)}
              onCancel={() => {
                commandRequestIdRef.current += 1;
                setCommandUi(undefined);
                setQuery("");
                searchInput.current?.focus();
              }}
              onUndo={() => void undoLatestCommand()}
            />
          )}

          {mode === "bookmarks" && resolution && !commandUi && (
            <SearchFeedback
              resolution={resolution}
              workspace={workspace}
              onOpenAiSettings={() => {
                setSettingsInitialSection("tagging");
                setSettingsOpen(true);
              }}
              onFocus={(hit) => {
                focusSearchHit(hit);
                setResolution(undefined);
              }}
            />
          )}
        </div>

        <div
          className="workspace-scroll-region"
          ref={categoryViewportRef}
          onWheel={handleCategoryViewportWheel}
          aria-label={t("首页内容滚动区域")}
        >
          {faviconProgress && faviconProgress.total > 0 && (
            <FaviconLoadStatus
              progress={faviconProgress}
              onDismiss={dismissFaviconProgress}
            />
          )}

          {settings.widgets.enabled && (
          <WidgetDashboard
            preferences={settings.widgets}
            healthPreferences={settings.bookmarkHealth}
              now={now}
              bookmarks={bookmarks}
              workspace={workspace}
              jobs={jobs}
              dailyQuote={dailyQuote}
              onOpen={(url) => void runtime.openUrl(url, true)}
              onOpenBookmark={(url) =>
                void runtime.openUrl(url, settings.openInNewTab)
              }
            onManage={() => {
              setSettingsInitialSection("widgets");
              setSettingsOpen(true);
            }}
            onOpenHealth={() => {
              setSettingsInitialSection("health");
              setSettingsOpen(true);
            }}
          />
          )}

          <div
            className="category-stack"
            aria-label={`${activeCategory.title}大分类`}
          >
            <section
              className="category-content active"
              data-category-section
              data-category-id={activeCategory.id}
              aria-label={activeCategory.title}
              key={activeCategory.id}
            >
              <CategoryWorkspace
                category={activeCategory}
                dropPreview={bookmarkDropPreview}
                bookmarkMap={bookmarkMap}
                runtime={runtime}
                highlightIds={highlightIds}
                onAddLoose={() =>
                  setBookmarkModal({
                    categoryId: activeCategory.id,
                  })
                }
                onAddToGroup={(group) =>
                  setBookmarkModal({
                    categoryId: activeCategory.id,
                    groupId: group.id,
                  })
                }
                onOpenGroup={(group) =>
                  setExpandedGroup({
                    categoryId: activeCategory.id,
                    groupId: group.id,
                  })
                }
                onEditGroup={(group) =>
                  setTextModal({
                    kind: "rename-group",
                    initialValue: group.title,
                    categoryId: activeCategory.id,
                    groupId: group.id,
                  })
                }
                onDeleteGroup={(group) => deleteGroup(activeCategory.id, group)}
                onOpen={(bookmark, newTab) =>
                  void runtime.openUrl(
                    bookmark.url,
                    newTab || settings.openInNewTab,
                  )
                }
                onContext={(event, bookmark, groupId) => {
                  event.preventDefault();
                  setContext({
                    bookmark,
                    x: event.clientX,
                    y: event.clientY,
                    categoryId: activeCategory.id,
                    groupId,
                  });
                }}
              />
            </section>
          </div>
        </div>
      </section>

      {expandedGroup && (() => {
        const category = workspace.categories.find(
          (item) => item.id === expandedGroup.categoryId,
        );
        const group = category?.groups.find(
          (item) => item.id === expandedGroup.groupId,
        );
        if (!category || !group) return null;
        return (
          <GroupDetailOverlay
            category={category}
            group={group}
            dropPreview={bookmarkDropPreview}
            bookmarkMap={bookmarkMap}
            runtime={runtime}
            highlightIds={highlightIds}
            draggingBookmark={draggedBookmark}
            onClose={() => setExpandedGroup(undefined)}
            onAdd={() =>
              setBookmarkModal({
                categoryId: category.id,
                groupId: group.id,
              })
            }
            onRename={() =>
              setTextModal({
                kind: "rename-group",
                initialValue: group.title,
                categoryId: category.id,
                groupId: group.id,
              })
            }
            onOpen={(bookmark, newTab) =>
              void runtime.openUrl(
                bookmark.url,
                newTab || settings.openInNewTab,
              )
            }
            onContext={(event, bookmark) => {
              event.preventDefault();
              setContext({
                bookmark,
                x: event.clientX,
                y: event.clientY,
                categoryId: category.id,
                groupId: group.id,
              });
            }}
          />
        );
      })()}

      <SortableContext
        items={workspace.categories.map((category) => category.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          className={`category-rail-reveal${settings.screenDisplay.alwaysShowCategoryRail ? " is-pinned" : " auto-hide"}`}
          onMouseLeave={() => setCategoryHoverLabel(undefined)}
        >
          <nav className="category-rail" aria-label={t("大分类")}>
            <div className="rail-categories">
              {workspace.categories.map((category) => (
                <SortableCategory
                  key={category.id}
                  category={category}
                  active={category.id === activeCategory.id}
                  onClick={() => scrollToCategory(category.id)}
                  onHover={setCategoryHoverLabel}
                  onContext={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setContext(undefined);
                    setCategoryContext({
                      categoryId: category.id,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                />
              ))}
            </div>
            <span className="rail-divider" />
            <button
              className="rail-add"
              onClick={() => {
                const usedIcons = new Set(
                  workspace.categories.map((category) => category.icon),
                );
                setCategoryEditor({
                  initialName: "",
                  initialIcon:
                    CATEGORY_ICON_OPTIONS.find(
                      (option) => !usedIcons.has(option.value),
                    )?.value ?? "bookmark",
                });
              }}
              aria-label={t("新增大分类")}
            >
              <PlusCircle size={38} weight="light" />
            </button>
          </nav>
        </div>
      </SortableContext>
      {categoryHoverLabel && (
        <div
          className="rail-category-tooltip"
          style={{
            top: categoryHoverLabel.top,
            right: categoryHoverLabel.right,
          }}
          aria-hidden="true"
        >
          {categoryHoverLabel.title}
        </div>
      )}
      <DragOverlay dropAnimation={null}>
        {draggedBookmark ? (
          <div className="bookmark-tile drag-overlay">
            <BookmarkIcon
              bookmark={draggedBookmark}
              source={runtime.faviconUrl(draggedBookmark)}
            />
            <span className="bookmark-title">{draggedBookmark.title}</span>
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>

      {settings.screenDisplay.showDailyQuote && (
        <figure className="daily-classic-quote">
          <blockquote>“{dailyQuote.text}”</blockquote>
          <figcaption>{dailyQuote.source}</figcaption>
        </figure>
      )}

      <button
        className="settings-button"
        onClick={() => {
          setSettingsInitialSection("tagging");
          setSettingsOpen(true);
        }}
        aria-label={t("设置")}
      >
        <GearSix size={26} weight="light" />
      </button>

      {context && (
        <BookmarkContextMenu
          state={context}
          onClose={() => setContext(undefined)}
          onOpen={(newTab) => {
            void runtime.openUrl(context.bookmark.url, newTab);
            setContext(undefined);
          }}
          onEdit={() => {
            setBookmarkModal({
              existing: context.bookmark,
              categoryId: context.categoryId,
              groupId: context.groupId,
            });
            setContext(undefined);
          }}
          onDelete={() => {
            setDeleteTarget(context.bookmark);
            setContext(undefined);
          }}
          onCopy={() => {
            void navigator.clipboard.writeText(context.bookmark.url);
            setToast(t("链接已复制"));
            setContext(undefined);
          }}
        />
      )}

      {categoryContext && (
        <CategoryContextMenu
          state={categoryContext}
          category={workspace.categories.find(
            (category) => category.id === categoryContext.categoryId,
          )}
          onClose={() => setCategoryContext(undefined)}
          onAddGroup={() => {
            setTextModal({
              kind: "group",
              initialValue: "",
              categoryId: categoryContext.categoryId,
            });
            setCategoryContext(undefined);
          }}
          onRename={() => {
            const category = workspace.categories.find(
              (item) => item.id === categoryContext.categoryId,
            );
            if (category) {
              setCategoryEditor({
                categoryId: category.id,
                initialName: category.title,
                initialIcon: category.icon,
              });
            }
            setCategoryContext(undefined);
          }}
          onDelete={() => {
            const category = workspace.categories.find(
              (item) => item.id === categoryContext.categoryId,
            );
            if (category) deleteCategory(category);
            setCategoryContext(undefined);
          }}
        />
      )}

      {bookmarkModal && (
        <Modal
          title={bookmarkModal.existing ? t("编辑图标") : t("添加图标")}
          onClose={() => setBookmarkModal(undefined)}
        >
          <BookmarkForm
            initial={bookmarkModal}
            categories={workspace.categories}
            onSubmit={(draft) => void handleSaveBookmark(draft)}
            onCancel={() => setBookmarkModal(undefined)}
          />
        </Modal>
      )}

      {textModal && (
        <Modal
          title={t(textModalTitle(textModal.kind))}
          onClose={() => setTextModal(undefined)}
        >
          <TextForm
            initialValue={textModal.initialValue}
            onSubmit={handleTextSubmit}
            onCancel={() => setTextModal(undefined)}
          />
        </Modal>
      )}

      {categoryEditor && (
        <Modal
          title={
            categoryEditor.categoryId ? t("编辑大分类") : t("新增大分类")
          }
          onClose={() => setCategoryEditor(undefined)}
        >
          <CategoryEditorForm
            initialName={categoryEditor.initialName}
            initialIcon={categoryEditor.initialIcon}
            onSubmit={handleCategorySubmit}
            onCancel={() => setCategoryEditor(undefined)}
          />
        </Modal>
      )}

      {deleteTarget && (
        <Modal title={t("删除图标")} onClose={() => setDeleteTarget(undefined)}>
          <div className="confirm-copy">
            <p>
              {t("确定删除“{title}”吗？", { title: deleteTarget.title })}
              {deleteTarget.source === "chrome" &&
                t(" 这会同时从 Chrome 原生书签中删除。")}
            </p>
            <div className="form-actions">
              <button
                className="secondary-button"
                onClick={() => setDeleteTarget(undefined)}
              >
                {t("取消")}
              </button>
              <button className="danger-button" onClick={handleDeleteBookmark}>
                {t("删除")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {settingsOpen && (
        <Modal
          title={t("SmartAINewTab 设置")}
          wide
          variant="settings"
          onClose={() => setSettingsOpen(false)}
        >
          <SettingsPanel
            settings={settings}
            initialSection={settingsInitialSection}
            bookmarks={bookmarks}
            workspace={workspace}
            jobs={jobs}
            cloudState={cloudState}
            backgroundAssets={backgroundAssets}
            onSave={saveAppSettings}
            onStartTagging={startTagging}
            onUndoAiOrganization={restoreLayoutBeforeAiOrganization}
            onCancelJob={async (id) => {
              await cancelJob(id);
              await refreshJobs();
            }}
            onRetryJob={async (id) => {
              await retryJob(id);
              await runtime.notifyBackground();
              if (runtime.kind === "preview") void runNextJob();
              await refreshJobs();
            }}
            onExportBackup={async () => {
              downloadBackup(await makeCurrentBackup());
            }}
            onRestoreBackup={async (file) =>
              applyFullBackup(await file.text())
            }
            onGoogleLogin={async (apiBaseUrl) => {
              const cloudSettings = await configureCloudEndpoint(apiBaseUrl);
              const next = await signInWithGoogle(
                cloudSettings.cloudApiBaseUrl,
              );
              setCloudState(next);
            }}
            onCloudLogout={async (apiBaseUrl) => {
              await signOutCloud(apiBaseUrl);
              setCloudState({ revision: 0 });
            }}
            onCloudUpload={async (apiBaseUrl, recoveryPassword, options) => {
              const cloudSettings = await configureCloudEndpoint(apiBaseUrl);
              const next = await uploadCloudBackup(
                cloudSettings.cloudApiBaseUrl,
                await makeCurrentBackup(cloudSettings),
                recoveryPassword,
                options,
              );
              setCloudState(next);
            }}
            onCloudRestore={async (apiBaseUrl, recoveryPassword) => {
              const cloudSettings = await configureCloudEndpoint(apiBaseUrl);
              const backup = await downloadCloudBackup(
                cloudSettings.cloudApiBaseUrl,
                recoveryPassword,
              );
              const result = await applyFullBackup(backup);
              const next = await loadCloudState();
              setCloudState(next);
              return result;
            }}
            onDeleteCloudBackup={async (apiBaseUrl) => {
              const cloudSettings = await configureCloudEndpoint(apiBaseUrl);
              const next = await deleteCloudBackup(
                cloudSettings.cloudApiBaseUrl,
              );
              setCloudState(next);
            }}
            onDeleteCloudAccount={async (apiBaseUrl) => {
              const cloudSettings = await configureCloudEndpoint(apiBaseUrl);
              await deleteCloudAccount(cloudSettings.cloudApiBaseUrl);
              setCloudState({ revision: 0 });
            }}
            onApplyBackground={saveBackgroundPreferences}
            onUploadBackground={async (file) => {
              const id = await importBackgroundFile(file);
              const assets = await refreshBackgroundLibrary(
                settings.cloudApiBaseUrl,
              );
              await saveBackgroundPreferences(
                {
                  ...settings.background,
                  currentAssetId: id,
                  playlistIds: [...new Set([...settings.background.playlistIds, id])],
                  lastRotatedAt: Date.now(),
                },
                assets,
              );
            }}
            onDeleteBackground={async (assetId) => {
              await deleteLocalBackground(assetId);
              const assets = await refreshBackgroundLibrary(
                settings.cloudApiBaseUrl,
              );
              await saveBackgroundPreferences(settings.background, assets);
            }}
            onRefreshBackgrounds={async () => {
              const cloudSettings = await configureCloudEndpoint(
                settings.cloudApiBaseUrl,
              );
              await refreshBackgroundLibrary(cloudSettings.cloudApiBaseUrl);
            }}
            onOpenHealthBookmark={(url) =>
              runtime.openUrl(url, settings.openInNewTab)
            }
            onUpdateHealthBookmarkUrls={updateHealthBookmarkUrls}
            onDeleteHealthBookmarks={deleteHealthBookmarks}
            onMergeHealthDuplicates={mergeHealthDuplicates}
            onRestoreHealthSnapshot={restoreHealthSnapshot}
          />
        </Modal>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
    </I18nProvider>
  );
}

interface SortableCategoryProps {
  category: BookmarkCategory;
  active: boolean;
  onClick(): void;
  onHover(label: CategoryHoverLabel | undefined): void;
  onContext(event: ReactMouseEvent<HTMLButtonElement>): void;
}

function SortableCategory({
  category,
  active,
  onClick,
  onHover,
  onContext,
}: SortableCategoryProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: category.id,
      data: { type: "category", categoryId: category.id },
    });
  return (
    <button
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`rail-category${active ? " active" : ""}${isDragging ? " dragging" : ""}`}
      data-rail-category-id={category.id}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      onContextMenu={onContext}
      onMouseEnter={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        onHover({
          title: category.title,
          top: bounds.top + bounds.height / 2,
          right: window.innerWidth - bounds.left + 10,
        });
      }}
      onMouseLeave={() => onHover(undefined)}
      onFocus={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        onHover({
          title: category.title,
          top: bounds.top + bounds.height / 2,
          right: window.innerWidth - bounds.left + 10,
        });
      }}
      onBlur={() => onHover(undefined)}
      {...attributes}
      {...listeners}
      aria-label={`${category.title}（右键管理）`}
    >
      <CategoryGlyph name={category.icon} size={25} weight="light" />
    </button>
  );
}

interface CategoryWorkspaceProps {
  category: BookmarkCategory;
  dropPreview?: BookmarkDropPreview;
  bookmarkMap: Map<string, BookmarkRecord>;
  runtime: AppRuntime;
  highlightIds: string[];
  onAddLoose(): void;
  onAddToGroup(group: BookmarkGroup): void;
  onOpenGroup(group: BookmarkGroup): void;
  onEditGroup(group: BookmarkGroup): void;
  onDeleteGroup(group: BookmarkGroup): void;
  onOpen(bookmark: BookmarkRecord, newTab: boolean): void;
  onContext(
    event: ReactMouseEvent<HTMLButtonElement>,
    bookmark: BookmarkRecord,
    groupId?: string,
  ): void;
}

function CategoryWorkspace({
  category,
  dropPreview,
  bookmarkMap,
  runtime,
  highlightIds,
  onAddLoose,
  onAddToGroup,
  onOpenGroup,
  onEditGroup,
  onDeleteGroup,
  onOpen,
  onContext,
}: CategoryWorkspaceProps) {
  const { t } = useI18n();
  const looseItems = (category.bookmarkIds ?? [])
    .map((id) => bookmarkMap.get(id))
    .filter((item): item is BookmarkRecord => Boolean(item));
  const { setNodeRef, isOver } = useDroppable({
    id: `loose-${category.id}`,
    data: { type: "loose", categoryId: category.id },
  });
  const placementIds = [
    ...(category.bookmarkIds ?? []),
    ...category.groups.map((group) => group.id),
  ];

  return (
    <section
      ref={setNodeRef}
      className={`category-board${isOver ? " drop-active" : ""}`}
      aria-label={t("{title}书签与分组", { title: category.title })}
    >
      <SortableContext items={placementIds} strategy={rectSortingStrategy}>
        <div className="bookmark-grid category-item-grid">
          {looseItems.map((bookmark) => (
            <SortableBookmark
              key={bookmark.id}
              bookmark={bookmark}
              categoryId={category.id}
              dropIntent={
                dropPreview?.bookmarkId === bookmark.id
                  ? dropPreview.intent
                  : undefined
              }
              favicon={runtime.faviconUrl(bookmark)}
              highlighted={highlightIds.includes(bookmark.id)}
              onOpen={onOpen}
              onContext={(event, item) => onContext(event, item)}
            />
          ))}
          {category.groups.map((group) => (
            <SortableGroup
              key={group.id}
              group={group}
              categoryId={category.id}
              bookmarkMap={bookmarkMap}
              runtime={runtime}
              onOpen={() => onOpenGroup(group)}
              onAdd={() => onAddToGroup(group)}
              onEditGroup={() => onEditGroup(group)}
              onDeleteGroup={() => onDeleteGroup(group)}
            />
          ))}
          <button
            className="bookmark-tile add-bookmark-tile"
            onClick={onAddLoose}
            aria-label={t("添加未分组书签")}
          >
            <span className="add-bookmark-icon">
              <Plus size={28} weight="light" />
            </span>
            <span className="bookmark-title">{t("添加")}</span>
          </button>
        </div>
      </SortableContext>
    </section>
  );
}

interface SortableGroupProps {
  group: BookmarkGroup;
  categoryId: string;
  bookmarkMap: Map<string, BookmarkRecord>;
  runtime: AppRuntime;
  onOpen(): void;
  onAdd(): void;
  onEditGroup(): void;
  onDeleteGroup(): void;
}

function SortableGroup({
  group,
  categoryId,
  bookmarkMap,
  runtime,
  onOpen,
  onAdd,
  onEditGroup,
  onDeleteGroup,
}: SortableGroupProps) {
  const { setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: group.id,
      data: { type: "group", categoryId, groupId: group.id },
    });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = group.bookmarkIds
    .map((id) => bookmarkMap.get(id))
    .filter((item): item is BookmarkRecord => Boolean(item));
  const previewItems = items.slice(0, 4);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        menuButtonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group-tile-wrap${isDragging ? " dragging" : ""}${isOver ? " drop-active" : ""}`}
      aria-label={`${group.title}分组`}
      data-group-id={group.id}
    >
      <button
        className="group-tile"
        onClick={onOpen}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenuOpen(true);
        }}
        title={`${group.title} · ${items.length} 个书签`}
      >
        <span
          className={`group-preview group-preview-${Math.max(1, previewItems.length)}`}
          aria-hidden="true"
        >
          {previewItems.length > 0 ? (
            previewItems.map((bookmark) => (
              <BookmarkIcon
                key={bookmark.id}
                bookmark={bookmark}
                source={runtime.faviconUrl(bookmark)}
              />
            ))
          ) : (
            <FolderOpen size={34} weight="duotone" />
          )}
          <span className="group-count">{items.length}</span>
        </span>
        <span className="bookmark-title">{group.title}</span>
      </button>
      <button
        ref={menuButtonRef}
        className="group-tile-menu-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((value) => !value);
        }}
        aria-label="分组菜单"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <DotsThree size={18} weight="bold" />
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          className="folder-menu glass-menu"
          role="menu"
          aria-label={`${group.title}分组菜单`}
        >
          <button
            role="menuitem"
            onClick={() => {
              onAdd();
              setMenuOpen(false);
            }}
          >
            <Plus size={16} /> 添加书签
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onEditGroup();
              setMenuOpen(false);
            }}
          >
            <PencilSimple size={16} /> 重命名
          </button>
          <button
            role="menuitem"
            className="danger-text"
            onClick={() => {
              onDeleteGroup();
              setMenuOpen(false);
            }}
          >
            <Trash size={16} /> 删除分组
          </button>
        </div>
      )}
    </article>
  );
}

interface GroupDetailOverlayProps {
  category: BookmarkCategory;
  group: BookmarkGroup;
  dropPreview?: BookmarkDropPreview;
  bookmarkMap: Map<string, BookmarkRecord>;
  runtime: AppRuntime;
  highlightIds: string[];
  draggingBookmark?: BookmarkRecord;
  onClose(): void;
  onAdd(): void;
  onRename(): void;
  onOpen(bookmark: BookmarkRecord, newTab: boolean): void;
  onContext(
    event: ReactMouseEvent<HTMLButtonElement>,
    bookmark: BookmarkRecord,
  ): void;
}

function GroupDetailOverlay({
  category,
  group,
  dropPreview,
  bookmarkMap,
  runtime,
  highlightIds,
  draggingBookmark,
  onClose,
  onAdd,
  onRename,
  onOpen,
  onContext,
}: GroupDetailOverlayProps) {
  const { t } = useI18n();
  const items = group.bookmarkIds
    .map((id) => bookmarkMap.get(id))
    .filter((item): item is BookmarkRecord => Boolean(item));

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      className="group-detail-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <h2 className="group-detail-title">
        {group.title}
        <small>{t("{count} 个书签", { count: items.length })}</small>
      </h2>
      <section
        className="group-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label={group.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="group-detail-actions">
          <button className="icon-button" onClick={onAdd} aria-label={t("添加书签")}>
            <Plus size={21} />
          </button>
          <button className="icon-button" onClick={onRename} aria-label={t("重命名分组")}>
            <PencilSimple size={19} />
          </button>
          <button className="icon-button" onClick={onClose} aria-label={t("关闭分组")}>
            <X size={21} />
          </button>
        </div>
        <SortableContext items={group.bookmarkIds} strategy={rectSortingStrategy}>
          <div className="group-detail-grid">
            {items.map((bookmark) => (
              <SortableBookmark
                key={bookmark.id}
                bookmark={bookmark}
                categoryId={category.id}
                groupId={group.id}
                dropIntent={
                  dropPreview?.bookmarkId === bookmark.id
                    ? dropPreview.intent
                    : undefined
                }
                favicon={runtime.faviconUrl(bookmark)}
                highlighted={highlightIds.includes(bookmark.id)}
                onOpen={onOpen}
                onContext={onContext}
              />
            ))}
            {items.length === 0 && (
              <button className="group-detail-empty" onClick={onAdd}>
                <Plus size={28} weight="light" />
                <span>{t("添加书签，或从其他位置拖入这里")}</span>
              </button>
            )}
          </div>
        </SortableContext>
        {draggingBookmark && (
          <GroupTransferTargets
            category={category}
            currentGroupId={group.id}
          />
        )}
      </section>
    </div>
  );
}

function GroupTransferTargets({
  category,
  currentGroupId,
}: {
  category: BookmarkCategory;
  currentGroupId: string;
}) {
  const { t } = useI18n();
  return (
    <aside className="group-transfer-tray" aria-label={t("移动书签到")}>
      <span>{t("移动到")}</span>
      <GroupTransferTarget
        id={`modal-loose-${category.id}`}
        categoryId={category.id}
        label={t("未分组")}
      />
      {category.groups
        .filter((group) => group.id !== currentGroupId)
        .map((group) => (
          <GroupTransferTarget
            key={group.id}
            id={`modal-group-${group.id}`}
            categoryId={category.id}
            groupId={group.id}
            label={group.title}
          />
        ))}
    </aside>
  );
}

function GroupTransferTarget({
  id,
  categoryId,
  groupId,
  label,
}: {
  id: string;
  categoryId: string;
  groupId?: string;
  label: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: groupId
      ? { type: "transfer-group", categoryId, groupId }
      : { type: "transfer-loose", categoryId },
  });
  return (
    <div
      ref={setNodeRef}
      className={`group-transfer-target${isOver ? " active" : ""}`}
    >
      <FolderOpen size={17} weight="duotone" />
      <span>{label}</span>
    </div>
  );
}

interface SortableBookmarkProps {
  bookmark: BookmarkRecord;
  categoryId: string;
  groupId?: string;
  dropIntent?: BookmarkDropIntent;
  favicon?: string;
  highlighted: boolean;
  onOpen(bookmark: BookmarkRecord, newTab: boolean): void;
  onContext(
    event: ReactMouseEvent<HTMLButtonElement>,
    bookmark: BookmarkRecord,
  ): void;
}

function SortableBookmark({
  bookmark,
  categoryId,
  groupId,
  dropIntent,
  favicon,
  highlighted,
  onOpen,
  onContext,
}: SortableBookmarkProps) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: bookmark.id,
      data: {
        type: "bookmark",
        categoryId,
        groupId,
        bookmarkId: bookmark.id,
      },
    });
  return (
    <button
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bookmark-tile${highlighted ? " highlighted" : ""}${isDragging ? " dragging" : ""}${dropIntent ? ` drop-${dropIntent}` : ""}`}
      data-bookmark-id={bookmark.id}
      onClick={(event) =>
        onOpen(bookmark, event.metaKey || event.ctrlKey || event.shiftKey)
      }
      onAuxClick={(event) => {
        if (event.button === 1) onOpen(bookmark, true);
      }}
      onContextMenu={(event) => onContext(event, bookmark)}
      title={`${bookmark.title}\n${bookmark.url}`}
      {...attributes}
      {...listeners}
    >
      <BookmarkIcon bookmark={bookmark} source={favicon} />
      <span className="bookmark-title">{bookmark.title}</span>
      {dropIntent === "group" && (
        <span className="bookmark-drop-hint">{t("松开创建分组")}</span>
      )}
    </button>
  );
}

function CommandSuggestions({
  onSelect,
}: {
  onSelect(example: string): void;
}) {
  const { locale, t } = useI18n();
  const examples = commandExamplesForLocale(locale);
  return (
    <aside
      className="command-suggestions"
      aria-label={t("自然语言命令示例")}
    >
      <header>
        <Sparkle size={17} weight="fill" />
        <span>{t("描述你希望怎样整理书签")}</span>
        <small>{t("AI 只生成计划，确认后才执行")}</small>
      </header>
      <div>
        {examples.map((example) => (
          <button key={example} onClick={() => onSelect(example)}>
            {example}
          </button>
        ))}
      </div>
    </aside>
  );
}

function commandExamplesForLocale(locale: AppLocale): readonly string[] {
  if (locale === "zh-CN") return BOOKMARK_COMMAND_EXAMPLES;
  if (locale === "zh-TW") return BOOKMARK_COMMAND_EXAMPLES_ZH_TW;
  if (locale === "ja") return BOOKMARK_COMMAND_EXAMPLES_JA;
  if (locale === "ko") return BOOKMARK_COMMAND_EXAMPLES_KO;
  return BOOKMARK_COMMAND_EXAMPLES_EN;
}

function CommandInteractionPanel({
  state,
  onToggleBookmark,
  onSelectAll,
  onConfirm,
  onRetry,
  onCancel,
  onUndo,
}: {
  state: CommandUiState;
  onToggleBookmark(bookmarkId: string): void;
  onSelectAll(selected: boolean): void;
  onConfirm(): void;
  onRetry(): void;
  onCancel(): void;
  onUndo(): void;
}) {
  const { locale, t } = useI18n();
  const examples = commandExamplesForLocale(locale);
  const plan = state.plan;
  const selectedIds = new Set(state.selectedBookmarkIds);
  const working = state.status === "thinking" || state.status === "executing";
  const ready = state.status === "ready";
  const selectionRequired = plan?.selectionMode === "bookmarks";
  const executeDisabled =
    !plan?.canExecute || (selectionRequired && selectedIds.size === 0);

  return (
    <aside
      className={`command-panel command-${state.status}`}
      aria-label={t("AI 命令执行计划")}
      aria-live="polite"
    >
      <header className="command-panel-header">
        <span className="command-panel-icon">
          {state.status === "success" ? (
            <Check size={18} weight="bold" />
          ) : (
            <Sparkle size={18} weight="fill" />
          )}
        </span>
        <div>
          <strong>
            {working
              ? t("正在生成安全执行计划")
              : state.status === "error"
                ? t("命令没有完成")
                : state.status === "success"
                  ? t("命令执行结果")
                  : plan?.title ?? t("AI 命令执行计划")}
          </strong>
          <small>{state.message}</small>
        </div>
        {!working && (
          <button
            className="command-close"
            onClick={onCancel}
            aria-label={t("关闭命令面板")}
          >
            <X size={17} />
          </button>
        )}
      </header>

      {working && (
        <div className="command-working">
          <span className="command-spinner" />
          <p>{state.message}</p>
          <button className="text-button" onClick={onCancel}>
            {t("取消")}
          </button>
        </div>
      )}

      {state.status === "error" && (
        <div className="command-error">
          <p>{state.message}</p>
          <div className="command-actions">
            <button className="secondary-button" onClick={onCancel}>
              {t("关闭")}
            </button>
            <button className="primary-button" onClick={onRetry}>
              {t("重新解析")}
            </button>
          </div>
        </div>
      )}

      {(ready || state.status === "success") && plan && (
        <div className="command-plan-body">
          <div className="command-plan-scroll">
            <section className="command-understanding">
              <span>{t("AI 理解")}</span>
              <strong>{plan.description}</strong>
              <small>{commandOperationTitle(plan.spec.operation)}</small>
            </section>

            {plan.statistics.length > 0 && (
              <section
                className="command-statistics"
                aria-label={t("书签结构统计")}
              >
                {plan.statistics.map((item) => (
                  <div key={item.label}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </section>
            )}

            {plan.spec.operation === "showHelp" && (
              <section className="command-help-list">
                {examples.map((example) => (
                  <code key={example}>{example}</code>
                ))}
              </section>
            )}

            {plan.warnings.length > 0 && (
              <section
                className="command-warnings"
                aria-label={t("命令提示")}
              >
                {plan.warnings.map((warning) => (
                  <p key={warning}>· {warning}</p>
                ))}
              </section>
            )}

            {plan.groupImpacts.length > 0 && (
              <section className="command-impact-section">
                <header>
                  <strong>涉及 {plan.groupImpacts.length} 个小分组</strong>
                </header>
                <div className="command-impact-list">
                  {plan.groupImpacts.map((impact) => (
                    <div key={`${impact.categoryId}:${impact.groupId}`}>
                      <span>{impact.category} / {impact.group}</span>
                      <small>{impact.bookmarkCount} 个书签 · {impact.action}</small>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {plan.candidates.length > 0 && (
              <section className="command-candidate-section">
                <header>
                  <strong>
                    受影响书签 {selectionRequired ? `${selectedIds.size}/` : ""}{plan.candidates.length}
                  </strong>
                  {selectionRequired && ready && (
                    <span>
                      <button onClick={() => onSelectAll(true)}>
                        {t("全选")}
                      </button>
                      <button onClick={() => onSelectAll(false)}>
                        {t("全不选")}
                      </button>
                    </span>
                  )}
                </header>
                <div
                  className="command-candidate-list"
                  aria-label={t("命令候选书签")}
                >
                  {plan.candidates.map((candidate) => (
                    <label key={candidate.id}>
                      {selectionRequired && ready && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(candidate.id)}
                          onChange={() => onToggleBookmark(candidate.id)}
                        />
                      )}
                      <span>
                        <strong>{candidate.title}</strong>
                        <small>
                          {candidate.fromCategory}
                          {candidate.fromGroup ? ` / ${candidate.fromGroup}` : " / 未分组"}
                          {` · ${candidate.reason}`}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="command-plan-footer">
            {ready && plan.isMutation && (
              <div className="command-confirm-note">
                只有点击确认后才会修改 SmartAINewTab 布局；执行前会保存可撤销快照，不会移动 Chrome 原生书签文件夹。
              </div>
            )}

            <div className="command-actions">
              {state.status === "success" ? (
                <>
                  {plan.isMutation &&
                    plan.spec.operation !== "undoLastCommand" &&
                    plan.spec.operation !== "redoLastCommand" && (
                      <button className="secondary-button" onClick={onUndo}>
                        <ArrowCounterClockwise size={16} />{" "}
                        {t("撤销本次操作")}
                      </button>
                    )}
                  <button className="primary-button" onClick={onCancel}>
                    {t("完成")}
                  </button>
                </>
              ) : plan.isMutation ? (
                <>
                  <button className="secondary-button" onClick={onCancel}>
                    {t("取消")}
                  </button>
                  <button
                    className="primary-button"
                    disabled={executeDisabled}
                    onClick={onConfirm}
                  >
                    <Check size={16} weight="bold" /> {t("确认执行")}
                  </button>
                </>
              ) : (
                <button className="primary-button" onClick={onCancel}>
                  {t("完成")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {state.status === "success" && !plan && (
        <div className="command-success-only">
          <p>{state.message}</p>
          <button className="primary-button" onClick={onCancel}>
            {t("完成")}
          </button>
        </div>
      )}
    </aside>
  );
}

export function SearchFeedback({
  resolution,
  workspace,
  onFocus,
  onOpenAiSettings,
}: {
  resolution: SearchResolution;
  workspace: WorkspaceLayout;
  onFocus(hit: SearchResolution["hits"][number]): void;
  onOpenAiSettings(): void;
}) {
  const { t } = useI18n();
  const hasHits = resolution.hits.length > 0;
  const topicMode = resolution.searchMode === "topic";
  const title =
    resolution.action === "unavailable"
      ? t("书签搜索不可用")
      : resolution.action === "error"
        ? t("AI 书签搜索失败")
        : resolution.action === "empty"
          ? topicMode
            ? t("没有找到相关书签")
            : t("没有找到高度相关书签")
          : topicMode
            ? t("找到 {count} 个相关书签", {
                count: resolution.hits.length,
              })
            : t("找到 {count} 个高度相关书签", {
                count: resolution.hits.length,
              });
  return (
    <aside
      className={`search-feedback search-feedback-${resolution.action}`}
      aria-label={t("书签搜索结果")}
    >
      <header>
        <span>
          {resolution.action === "unavailable" || resolution.action === "error" ? (
            <WarningCircle size={18} weight="fill" />
          ) : resolution.source === "ai" ? (
            <Sparkle size={17} weight="fill" />
          ) : (
            <MagnifyingGlass size={17} />
          )}
          {title}
        </span>
        <small>
          {hasHits
            ? topicMode
              ? t("证据分层排序")
              : t("完整条件匹配")
            : topicMode
              ? t("AI 主题检索")
              : t("AI 语义检索")}
        </small>
      </header>
      {resolution.interpretation && (
        <p className="search-interpretation">
          <span>{t("理解为")}</span>
          {resolution.interpretation}
        </p>
      )}
      {resolution.message && (
        <div className="search-feedback-message" role="status">
          <span>{resolution.message}</span>
          {resolution.action === "unavailable" && (
            <button type="button" onClick={onOpenAiSettings}>
              {t("打开 AI 设置")}
            </button>
          )}
        </div>
      )}
      {hasHits && (
        <div
          className="candidate-list"
          role="region"
          aria-label={t("书签搜索结果列表")}
          tabIndex={0}
        >
          {resolution.hits.map((hit) => {
            const category = workspace.categories.find(
              (item) => item.id === hit.categoryId,
            );
            const group = category?.groups.find(
              (item) => item.id === hit.groupId,
            );
            const location = [category?.title, group?.title]
              .filter(Boolean)
              .join(" / ");
            return (
              <button
                key={hit.bookmark.id}
                data-search-bookmark-id={hit.bookmark.id}
                onClick={() => onFocus(hit)}
              >
                <span className="candidate-result-title">
                  <strong>{hit.bookmark.title}</strong>
                  <em>{t(searchMatchKindLabel(hit.matchKind))}</em>
                </span>
                <small className="candidate-result-location">
                  {location ||
                    hit.bookmark.folderPath.join(" / ") ||
                    t("未分类")}
                </small>
                {hit.reasons[0] && <p>{hit.reasons[0]}</p>}
                {hit.matchedTerms && hit.matchedTerms.length > 0 && (
                  <small className="candidate-result-terms">
                    命中：{hit.matchedTerms.join("、")}
                  </small>
                )}
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function searchMatchKindLabel(
  matchKind: SearchResolution["hits"][number]["matchKind"],
): TranslationKey {
  switch (matchKind) {
    case "direct":
      return "直接命中";
    case "equivalent":
      return "等价名称";
    case "related":
      return "相关主题";
    case "precise":
      return "条件完整";
    default:
      return "可验证命中";
  }
}

function CategoryContextMenu({
  state,
  category,
  onClose,
  onAddGroup,
  onRename,
  onDelete,
}: {
  state: CategoryContextState;
  category?: BookmarkCategory;
  onClose(): void;
  onAddGroup(): void;
  onRename(): void;
  onDelete(): void;
}) {
  const { t } = useI18n();
  if (!category) return null;
  const isUncategorized = category.id === UNCATEGORIZED_CATEGORY_ID;
  return (
    <div
      className="context-menu category-context-menu glass-menu"
      style={{
        left: Math.min(state.x, innerWidth - 210),
        top: Math.min(state.y, innerHeight - 225),
      }}
      role="menu"
      aria-label={`${category.title}大分类菜单`}
      onClick={(event) => event.stopPropagation()}
      onMouseLeave={onClose}
    >
      <header>
        <strong>{category.title}</strong>
        <small>{t("大分类管理")}</small>
      </header>
      <button onClick={onAddGroup} role="menuitem">
        <Plus size={17} /> {t("新建分组")}
      </button>
      {!isUncategorized && (
        <>
          <span className="menu-divider" />
          <button onClick={onRename} role="menuitem">
            <PencilSimple size={17} /> {t("编辑名称与图标")}
          </button>
          <button className="danger-text" onClick={onDelete} role="menuitem">
            <Trash size={17} /> {t("删除大分类")}
          </button>
        </>
      )}
    </div>
  );
}

function BookmarkContextMenu({
  state,
  onClose,
  onOpen,
  onEdit,
  onDelete,
  onCopy,
}: {
  state: ContextState;
  onClose(): void;
  onOpen(newTab: boolean): void;
  onEdit(): void;
  onDelete(): void;
  onCopy(): void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="context-menu glass-menu"
      style={{ left: Math.min(state.x, innerWidth - 210), top: Math.min(state.y, innerHeight - 255) }}
      onClick={(event) => event.stopPropagation()}
      onMouseLeave={onClose}
    >
      <header>
        <strong>{state.bookmark.title}</strong>
        <small>{new URL(state.bookmark.url).hostname}</small>
      </header>
      <button onClick={() => onOpen(false)}>
        <GlobeSimple size={17} /> {t("当前页打开")}
      </button>
      <button onClick={() => onOpen(true)}>
        <ArrowSquareOut size={17} /> {t("新标签页打开")}
      </button>
      <button onClick={onCopy}>
        <Copy size={17} /> {t("复制链接")}
      </button>
      <span className="menu-divider" />
      <button onClick={onEdit}>
        <PencilSimple size={17} /> {t("编辑")}
      </button>
      <button className="danger-text" onClick={onDelete}>
        <Trash size={17} /> {t("删除")}
      </button>
    </div>
  );
}

function BookmarkForm({
  initial,
  categories,
  onSubmit,
  onCancel,
}: {
  initial: BookmarkModalState;
  categories: BookmarkCategory[];
  onSubmit(draft: BookmarkDraft): void;
  onCancel(): void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial.existing?.title ?? "");
  const [url, setUrl] = useState(initial.existing?.url ?? "");
  const [tags, setTags] = useState(initial.existing?.tags ?? []);
  const [aiTags, setAiTags] = useState(initial.existing?.aiTags ?? []);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const groups =
    categories.find((category) => category.id === categoryId)?.groups ?? [];
  const [groupId, setGroupId] = useState(initial.groupId ?? "");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !url.trim()) {
      setError(t("请填写名称和网址"));
      return;
    }
    try {
      new URL(/:\/\//.test(url) ? url : `https://${url}`);
    } catch {
      setError(t("网址格式不正确"));
      return;
    }
    onSubmit({
      id: initial.existing?.id,
      title,
      url,
      categoryId,
      groupId: groups.some((group) => group.id === groupId)
        ? groupId
        : undefined,
      tags,
      aiTags,
    });
  }

  return (
    <form className="modal-form" onSubmit={submit}>
      <label>
        <span>{t("名称")}</span>
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：Domain Overview"
        />
      </label>
      <label>
        <span>{t("网址")}</span>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com"
        />
      </label>
      <div className="field-grid">
        <label>
          <span>{t("大分类")}</span>
          <select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setGroupId("");
            }}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("文件夹")}</span>
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
          >
            <option value="">{t("未放入分组")}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <TagEditor
        aiTags={aiTags}
        manualTags={tags}
        onAiTagsChange={setAiTags}
        onManualTagsChange={setTags}
      />
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          {t("取消")}
        </button>
        <button type="submit" className="primary-button">
          {t("保存")}
        </button>
      </div>
    </form>
  );
}

function TextForm({
  initialValue,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  onSubmit(value: string): void;
  onCancel(): void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);
  return (
    <form
      className="modal-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <label>
        <span>{t("名称")}</span>
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t("输入名称")}
        />
      </label>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          {t("取消")}
        </button>
        <button className="primary-button" type="submit" disabled={!value.trim()}>
          {t("保存")}
        </button>
      </div>
    </form>
  );
}

function CategoryEditorForm({
  initialName,
  initialIcon,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  initialIcon: CategoryIcon;
  onSubmit(name: string, icon: CategoryIcon): void;
  onCancel(): void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(initialIcon);
  return (
    <form
      className="modal-form category-editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name, icon);
      }}
    >
      <label>
        <span>{t("大分类名称")}</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("例如：开发工具")}
        />
      </label>
      <fieldset className="category-icon-fieldset">
        <legend>{t("选择图标")}</legend>
        <div className="category-icon-picker" role="radiogroup">
          {CATEGORY_ICON_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={icon === option.value ? "is-selected" : ""}
              onClick={() => setIcon(option.value)}
              role="radio"
              aria-checked={icon === option.value}
              title={option.label}
            >
              <CategoryGlyph name={option.value} size={22} weight="light" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          {t("取消")}
        </button>
        <button className="primary-button" type="submit" disabled={!name.trim()}>
          {t("保存")}
        </button>
      </div>
    </form>
  );
}

function textModalTitle(kind: TextModalState["kind"]): TranslationKey {
  const titles: Record<TextModalState["kind"], TranslationKey> = {
    group: "新增分组",
    "rename-group": "重命名分组",
  };
  return titles[kind];
}

function BackgroundLayers({
  url,
  overlayOpacity,
  blur,
}: {
  url: string;
  overlayOpacity: number;
  blur: number;
}) {
  const [layers, setLayers] = useState<string[]>([url]);

  useEffect(() => {
    if (layers.at(-1) === url) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      setLayers((current) => [...current.filter((item) => item !== url), url].slice(-2));
      window.setTimeout(() => {
        if (active) setLayers([url]);
      }, 720);
    };
    image.src = url;
    return () => {
      active = false;
    };
  }, [layers, url]);

  return (
    <>
      <div className="background-photo" aria-hidden="true">
        {layers.map((layer, index) => (
          <img
            key={layer}
            src={layer}
            alt=""
            className={index === layers.length - 1 ? "is-current" : ""}
            style={{
              filter: blur ? `blur(${blur}px)` : undefined,
              transform: blur ? "scale(1.035)" : undefined,
            }}
          />
        ))}
      </div>
      <div
        className="background-tint"
        aria-hidden="true"
        style={{ background: `rgba(10, 30, 27, ${overlayOpacity / 100})` }}
      />
    </>
  );
}

function EngineLogo({
  engineId,
  size,
}: {
  engineId: AppSettings["engineId"];
  size: number;
}) {
  if (engineId === "google") {
    return (
      <img
        className="google-official-logo"
        src={googleLogoUrl}
        width={size}
        height={size}
        alt=""
      />
    );
  }
  if (engineId === "baidu") return <SiBaidu size={size} color="#4E6EF2" />;
  if (engineId === "duckduckgo") {
    return <SiDuckduckgo size={size} color="#DE5833" />;
  }
  return <GlobeSimple size={size} weight="bold" />;
}
