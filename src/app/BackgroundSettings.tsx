import {
  ArrowsClockwise,
  Check,
  Cloud,
  GlobeSimple,
  ImageSquare,
  MagnifyingGlass,
  Plus,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BackgroundAsset,
  BackgroundPreferences,
  BackgroundSource,
} from "@/domain/types";
import { useI18n, type AppLocale, type TranslationKey } from "@/i18n";

interface BackgroundSettingsProps {
  preferences: BackgroundPreferences;
  assets: BackgroundAsset[];
  busy: boolean;
  onChange(next: BackgroundPreferences): void;
  onApply(assetId: string): Promise<void>;
  onUpload(file: File): Promise<void>;
  onDelete(assetId: string): Promise<void>;
  onRefreshCloud(): Promise<void>;
}

type SourceFilter = "builtin" | "upload" | "cloud";

export function BackgroundSettings({
  preferences,
  assets,
  busy,
  onChange,
  onApply,
  onUpload,
  onDelete,
  onRefreshCloud,
}: BackgroundSettingsProps) {
  const { locale, t } = useI18n();
  const [source, setSource] = useState<SourceFilter>("builtin");
  const [selectedId, setSelectedId] = useState(preferences.currentAssetId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const selected =
    assets.find((asset) => asset.id === selectedId) ??
    assets.find((asset) => asset.id === preferences.currentAssetId) ??
    assets[0];
  const visibleAssets = useMemo(
    () => assets.filter((asset) => asset.source === source),
    [assets, source],
  );
  const current = assets.find(
    (asset) => asset.id === preferences.currentAssetId,
  );

  useEffect(() => {
    setSelectedId(preferences.currentAssetId);
  }, [preferences.currentAssetId]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("操作失败，请重试"));
    } finally {
      setPending(false);
    }
  }

  function update<K extends keyof BackgroundPreferences>(
    key: K,
    value: BackgroundPreferences[K],
  ) {
    onChange({ ...preferences, [key]: value });
  }

  function togglePlaylist(assetId: string) {
    const included = preferences.playlistIds.includes(assetId);
    const nextIds = included
      ? preferences.playlistIds.filter((id) => id !== assetId)
      : [...preferences.playlistIds, assetId];
    if (nextIds.length === 0) return;
    onChange({
      ...preferences,
      playlistIds: nextIds,
      shuffleRemainingIds: preferences.shuffleRemainingIds.filter((id) =>
        nextIds.includes(id),
      ),
    });
  }

  const disabled = busy || pending;

  return (
    <div className="background-settings-workbench">
      <input
        ref={uploadRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          void run(async () => {
            await onUpload(file);
            setSource("upload");
          });
        }}
      />

      <div className="background-browser-layout">
        <section
          className="background-live-preview"
          aria-label={t("背景实时预览")}
        >
          {selected ? (
            <img src={selected.url} alt="" />
          ) : (
            <div className="background-empty-preview">
              <ImageSquare size={34} />
              <span>{t("暂无可用背景")}</span>
            </div>
          )}
          <div
            className="background-preview-overlay"
            style={{
              background: `rgba(4, 17, 14, ${preferences.overlayOpacity / 100})`,
              backdropFilter: preferences.blur
                ? `blur(${preferences.blur}px)`
                : undefined,
            }}
          />
          <div className="background-preview-content">
            <time>{formatPreviewTime(new Date())}</time>
            <span>{formatPreviewDate(new Date(), locale)}</span>
            <div className="background-preview-search">
              <GlobeSimple size={16} weight="bold" />
              <span>{t("搜索 Google 或输入网址")}</span>
              <MagnifyingGlass size={16} />
            </div>
            <div className="background-preview-shortcuts" aria-hidden="true">
              <i><GlobeSimple size={17} /></i>
              <i><Cloud size={17} /></i>
              <i><Plus size={17} /></i>
            </div>
          </div>
          <footer>
            <span>{selected?.attribution ?? t("SmartAINewTab 背景")}</span>
            {selected?.id === preferences.currentAssetId && (
              <strong>
                <Check size={14} weight="bold" /> {t("当前使用")}
              </strong>
            )}
          </footer>
        </section>

        <section className="background-library-pane">
          <div
            className="background-source-tabs"
            role="tablist"
            aria-label={t("背景来源")}
          >
            {([
              ["builtin", "精选"],
              ["upload", "我的"],
              ["cloud", "云端"],
            ] as const satisfies ReadonlyArray<
              readonly [SourceFilter, TranslationKey]
            >).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={source === id}
                className={source === id ? "is-active" : ""}
                onClick={() => setSource(id)}
              >
                {t(label)}
                <small>{assets.filter((asset) => asset.source === id).length}</small>
              </button>
            ))}
          </div>

          <div className="background-library-toolbar">
            <span>{t(sourceLabelKey(source))}</span>
            {source === "cloud" && (
              <button
                type="button"
                className="quiet-button"
                disabled={disabled}
                onClick={() => void run(onRefreshCloud)}
              >
                <ArrowsClockwise size={15} /> {t("刷新")}
              </button>
            )}
          </div>

          {visibleAssets.length > 0 ? (
            <div className="background-thumbnail-grid" role="list">
              {visibleAssets.map((asset) => {
                const active = asset.id === selected?.id;
                const inPlaylist = preferences.playlistIds.includes(asset.id);
                return (
                  <article
                    key={asset.id}
                    className={`background-thumbnail${active ? " is-selected" : ""}`}
                    role="listitem"
                  >
                    <button
                      type="button"
                      className="background-thumbnail-select"
                      aria-label={`预览 ${asset.name}`}
                      onClick={() => setSelectedId(asset.id)}
                    >
                      <img
                        src={asset.thumbnailUrl}
                        alt={asset.name}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.src = "/assets/misty-mountains.png";
                        }}
                      />
                      <span>{asset.name}</span>
                    </button>
                    <button
                      type="button"
                      className={`background-playlist-toggle${inPlaylist ? " is-active" : ""}`}
                      aria-label={`${inPlaylist ? "移出" : "加入"}轮播：${asset.name}`}
                      aria-pressed={inPlaylist}
                      onClick={() => togglePlaylist(asset.id)}
                    >
                      {inPlaylist ? <Check size={13} weight="bold" /> : <Plus size={13} />}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="background-library-empty">
              {source === "upload" ? <UploadSimple size={28} /> : <Cloud size={28} />}
              <strong>
                {source === "upload"
                  ? t("还没有上传背景")
                  : t("云端图库暂时不可用")}
              </strong>
              <span>
                {source === "upload"
                  ? t("支持 JPG、PNG、WebP、AVIF，单张不超过 20 MB。")
                  : t("离线精选仍可正常使用，你也可以稍后刷新。")}
              </span>
            </div>
          )}

          <div className="background-library-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={disabled}
              onClick={() => uploadRef.current?.click()}
            >
              <UploadSimple size={16} /> {t("上传背景")}
            </button>
            {selected?.source === "upload" && (
              <button
                type="button"
                className="quiet-button danger-text"
                disabled={disabled}
                onClick={() =>
                  void run(async () => {
                    await onDelete(selected.id);
                    setSelectedId(current?.id ?? "builtin:misty-mountains");
                  })
                }
              >
                <Trash size={15} /> {t("删除")}
              </button>
            )}
            <button
              type="button"
              className="primary-button background-apply-button"
              disabled={!selected || disabled || selected.id === preferences.currentAssetId}
              onClick={() =>
                selected && void run(() => onApply(selected.id))
              }
            >
              {selected?.id === preferences.currentAssetId ? (
                <><Check size={16} weight="bold" /> {t("当前使用")}</>
              ) : (
                <>{t("应用背景")}</>
              )}
            </button>
          </div>
        </section>
      </div>

      <section
        className="background-rotation-panel"
        aria-label={t("背景轮播设置")}
      >
        <div className="background-rotation-title">
          <span>{t("轮播设置")}</span>
          <small>
            {t("已选择 {count} 张", {
              count: preferences.playlistIds.length,
            })}
          </small>
        </div>
        <label className="switch-row background-rotation-switch">
          <span>{t("自动轮播")}</span>
          <input
            type="checkbox"
            checked={preferences.rotationEnabled}
            onChange={(event) =>
              onChange({
                ...preferences,
                rotationEnabled: event.target.checked,
                lastRotatedAt: Date.now(),
              })
            }
          />
        </label>
        <label>
          <span>{t("频率")}</span>
          <select
            value={preferences.rotationInterval}
            onChange={(event) =>
              update(
                "rotationInterval",
                event.target.value as BackgroundPreferences["rotationInterval"],
              )
            }
          >
            <option value="newtab">{t("每次打开新标签页")}</option>
            <option value="15m">{t("每 15 分钟")}</option>
            <option value="1h">{t("每 1 小时")}</option>
            <option value="daily">{t("每天")}</option>
          </select>
        </label>
        <label>
          <span>{t("顺序")}</span>
          <select
            value={preferences.rotationOrder}
            onChange={(event) =>
              update(
                "rotationOrder",
                event.target.value as BackgroundPreferences["rotationOrder"],
              )
            }
          >
            <option value="random">{t("随机")}</option>
            <option value="sequential">{t("按顺序轮播")}</option>
          </select>
        </label>
        <label className="background-range-control">
          <span>
            {t("遮罩 {value}%", { value: preferences.overlayOpacity })}
          </span>
          <input
            type="range"
            min={0}
            max={70}
            value={preferences.overlayOpacity}
            onChange={(event) => update("overlayOpacity", Number(event.target.value))}
          />
        </label>
        <label className="background-range-control">
          <span>{t("模糊 {value}px", { value: preferences.blur })}</span>
          <input
            type="range"
            min={0}
            max={16}
            value={preferences.blur}
            onChange={(event) => update("blur", Number(event.target.value))}
          />
        </label>
      </section>

      {error && <p className="background-settings-error">{error}</p>}
    </div>
  );
}

function sourceLabelKey(source: BackgroundSource): TranslationKey {
  if (source === "upload") return "我的本地背景";
  if (source === "cloud") return "Cloudflare 精选图库";
  return "SmartAINewTab 内置背景";
}

function formatPreviewTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatPreviewDate(date: Date, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}
