import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Info,
  SquaresFour,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { WidgetId, WidgetPreferences } from "@/domain/types";
import {
  DEFAULT_WIDGET_PREFERENCES,
  MAX_ACTIVE_WIDGETS,
  MIN_ACTIVE_WIDGETS,
  WEATHER_LOCATIONS,
  WIDGET_CURRENCIES,
  WIDGET_DEFINITIONS,
} from "@/domain/widgets";
import { WidgetIcon } from "./WidgetIcon";
import { useI18n } from "@/i18n";

export function WidgetSettings({
  value,
  onChange,
}: {
  value: WidgetPreferences;
  onChange(next: WidgetPreferences): void;
}) {
  const { t, localize } = useI18n();
  const [message, setMessage] = useState("");
  const active = new Set(value.activeIds);

  function toggleWidget(id: WidgetId) {
    if (active.has(id)) {
      if (value.activeIds.length <= MIN_ACTIVE_WIDGETS) {
        setMessage(
          t("开启小部件时至少保留 {count} 个", {
            count: MIN_ACTIVE_WIDGETS,
          }),
        );
        return;
      }
      onChange({ ...value, activeIds: value.activeIds.filter((item) => item !== id) });
      setMessage(t("已从首屏移除"));
      return;
    }
    if (value.activeIds.length >= MAX_ACTIVE_WIDGETS) {
      setMessage(
        t("首屏最多展示 {count} 个小部件", {
          count: MAX_ACTIVE_WIDGETS,
        }),
      );
      return;
    }
    onChange({ ...value, activeIds: [...value.activeIds, id] });
    setMessage(t("已加入首屏，将根据空间自动调整尺寸"));
  }

  function moveWidget(id: WidgetId, direction: -1 | 1) {
    const index = value.activeIds.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= value.activeIds.length) return;
    const activeIds = [...value.activeIds];
    [activeIds[index], activeIds[target]] = [activeIds[target]!, activeIds[index]!];
    onChange({ ...value, activeIds });
  }

  return (
    <section className="settings-section widget-settings">
      <div className="widget-settings-hero">
        <span><SquaresFour size={26} weight="duotone" /></span>
        <div>
          <strong>{t("首页小部件")}</strong>
          <small>
            {t("小部件只出现在大分类之前的第一屏，并按数量自动切换尺寸")}
          </small>
        </div>
        <label className="switch-row">
          <span>{value.enabled ? t("已显示") : t("已隐藏")}</span>
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
          />
        </label>
      </div>

      <div className="widget-selection-summary">
        <div>
          <strong>{value.activeIds.length}</strong>
          <span>{t("首屏小部件")}</span>
        </div>
        <p>
          {t("允许 2–8 个。2–5 个会突出核心组件，6–8 个使用高密度双排布局。")}
        </p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            onChange({ ...DEFAULT_WIDGET_PREFERENCES });
            setMessage(t("已恢复默认的 6 个小部件"));
          }}
        >
          {t("恢复默认")}
        </button>
      </div>

      <div className="widget-data-options">
        <label>
          <span>{t("天气城市")}</span>
          <select
            value={value.weatherLocationId}
            onChange={(event) =>
              onChange({
                ...value,
                weatherLocationId: event.target.value as WidgetPreferences["weatherLocationId"],
              })
            }
          >
            {WEATHER_LOCATIONS.map((location) => (
              <option key={location.id} value={location.id}>
                {localize(location.label, location.labelEn)} ·{" "}
                {localize(location.country, location.countryEn)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("默认换算")}</span>
          <span className="widget-currency-pair">
            <select
              aria-label={t("默认源货币")}
              value={value.currencyBase}
              onChange={(event) => {
                const currencyBase = event.target.value as WidgetPreferences["currencyBase"];
                onChange({
                  ...value,
                  currencyBase,
                  currencyQuote:
                    currencyBase === value.currencyQuote
                      ? currencyBase === "USD" ? "CNY" : "USD"
                      : value.currencyQuote,
                });
              }}
            >
              {WIDGET_CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}
            </select>
            <b>→</b>
            <select
              aria-label={t("默认目标货币")}
              value={value.currencyQuote}
              onChange={(event) => onChange({ ...value, currencyQuote: event.target.value as WidgetPreferences["currencyQuote"] })}
            >
              {WIDGET_CURRENCIES.filter((currency) => currency.code !== value.currencyBase).map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}
            </select>
          </span>
        </label>
      </div>

      <div className="widget-library-heading">
        <div>
          <strong>{t("全部小部件")}</strong>
          <span>{t("已启用的小部件可以调整首屏顺序")}</span>
        </div>
        {message && <small role="status">{message}</small>}
      </div>

      <div className="widget-library-grid" aria-label={t("全部小部件")}>
        {WIDGET_DEFINITIONS.map((widget) => {
          const isActive = active.has(widget.id);
          const order = value.activeIds.indexOf(widget.id);
          return (
            <article key={widget.id} className={isActive ? "is-active" : ""}>
              <button
                type="button"
                className="widget-library-toggle"
                aria-pressed={isActive}
                onClick={() => toggleWidget(widget.id)}
              >
                <span className="widget-library-icon"><WidgetIcon id={widget.id} size={23} /></span>
                <span className="widget-library-copy">
                  <strong>
                    {localize(widget.title, widget.titleEn)}
                  </strong>
                  <small>
                    {localize(widget.description, widget.descriptionEn)}
                  </small>
                </span>
                <span className={`widget-source widget-source-${widget.dataSource}`}>
                  {widget.dataSource === "remote"
                    ? t("联网")
                    : widget.dataSource === "mixed"
                      ? t("混合")
                      : t("本地")}
                </span>
                {isActive && <CheckCircle className="widget-library-check" size={19} weight="fill" />}
              </button>
              {isActive && (
                <div className="widget-order-controls">
                  <span>
                    {t("第 {position} 位", { position: order + 1 })}
                  </span>
                  <button type="button" aria-label={`↑ ${localize(widget.title, widget.titleEn)}`} disabled={order === 0} onClick={() => moveWidget(widget.id, -1)}><ArrowUp size={14} /></button>
                  <button type="button" aria-label={`↓ ${localize(widget.title, widget.titleEn)}`} disabled={order === value.activeIds.length - 1} onClick={() => moveWidget(widget.id, 1)}><ArrowDown size={14} /></button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="privacy-note widget-privacy-note">
        <Info size={17} />
        <span>
          天气使用所选城市的公开坐标，汇率仅发送币种代码，热搜仅请求公开榜单；不会向这些服务发送书签、搜索记录、Cookie 或精确位置。联网失败时会显示明确错误，并优先使用最近一次本地缓存。
        </span>
      </div>
    </section>
  );
}
