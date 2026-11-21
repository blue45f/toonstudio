import {
  Check,
  CloudRain,
  Moon,
  Snowflake,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS,
  type StudioBg3dWebtoonAtmospherePreset,
  type StudioBg3dWebtoonAtmospherePresetId,
} from "./studio-bg3d-lighting-studio";

export interface StudioBg3dWebtoonAtmosphereStripProps {
  readonly activePresetId?: StudioBg3dWebtoonAtmospherePresetId | null;
  readonly disabled?: boolean;
  readonly variant?: "panel" | "toolbar";
  readonly onSelectPreset: (preset: StudioBg3dWebtoonAtmospherePreset) => void;
}

function AtmosphereIcon({
  id,
  selected,
}: {
  readonly id: StudioBg3dWebtoonAtmospherePresetId;
  readonly selected: boolean;
}) {
  const motionClass =
    id === "rain"
      ? selected
        ? "translate-y-0.5 motion-reduce:transform-none"
        : "group-hover:translate-y-0.5 motion-reduce:transform-none"
      : id === "snow"
        ? selected
          ? "rotate-45 motion-reduce:transform-none"
          : "group-hover:rotate-45 motion-reduce:transform-none"
        : id === "backlight"
          ? selected
            ? "scale-110 motion-reduce:transform-none"
            : "group-hover:scale-110 motion-reduce:transform-none"
          : selected
            ? "scale-105 motion-reduce:transform-none"
            : "group-hover:scale-105 motion-reduce:transform-none";
  const baseClass = `shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${motionClass}`;
  switch (id) {
    case "morning":
      return <Sunrise size={15} className={baseClass} aria-hidden />;
    case "day":
      return <Sun size={15} className={baseClass} aria-hidden />;
    case "sunset":
      return <Sunset size={15} className={baseClass} aria-hidden />;
    case "night":
      return <Moon size={15} className={baseClass} aria-hidden />;
    case "rain":
      return <CloudRain size={15} className={baseClass} aria-hidden />;
    case "snow":
      return <Snowflake size={15} className={baseClass} aria-hidden />;
    case "backlight":
      return <Sparkles size={15} className={baseClass} aria-hidden />;
  }
}

/**
 * Snaptoon급 원클릭 웹툰 분위기 7종(아침·낮·노을·밤·비·눈·역광) 스펙트럼 선택기.
 * 원시 HEX/rgb 없이 OKLCH 의미 토큰과 `color-mix(in oklch, ...)`만 사용하며
 * 촉각 모션과 `prefers-reduced-motion`을 함께 준수한다.
 */
export function StudioBg3dWebtoonAtmosphereStrip({
  activePresetId = null,
  disabled = false,
  variant = "panel",
  onSelectPreset,
}: StudioBg3dWebtoonAtmosphereStripProps) {
  const { isEn } = useBilingual();
  const copy = (ko: string, en: string) => (isEn ? en : ko);
  const activePreset = STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.find(
    (preset) => preset.id === activePresetId,
  ) ?? null;

  if (variant === "toolbar") {
    return (
      <div
        data-testid="studio-bg3d-webtoon-atmosphere-bar"
        role="group"
        aria-label={copy("원클릭 웹툰 분위기 7종", "One-click webtoon atmosphere presets")}
        className="relative flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-panel px-2.5 py-1.5"
        style={{
          backgroundImage:
            "linear-gradient(90deg, color-mix(in oklch, var(--color-warn) 10%, transparent), color-mix(in oklch, var(--color-accent) 9%, transparent) 42%, color-mix(in oklch, var(--color-cool) 11%, transparent) 74%, color-mix(in oklch, var(--color-good) 10%, transparent))",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
          style={{
            backgroundImage:
              "linear-gradient(90deg, var(--color-warn), var(--color-accent), var(--color-cool), var(--color-good))",
          }}
        />
        <span className="hidden shrink-0 items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-[0.6875rem] font-bold tracking-tight text-fg sm:inline-flex">
          <Sparkles size={12} className="text-accent" aria-hidden />
          {copy("분위기 7종", "7 Moods")}
        </span>
        {STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.map((preset) => {
          const selected = preset.id === activePresetId;
          const label = copy(preset.labelKo, preset.labelEn);
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={copy(`${preset.labelKo} 웹툰 분위기 적용`, `Apply ${preset.labelEn} webtoon mood`)}
              data-testid={`studio-bg3d-mood-preset-${preset.id}`}
              title={copy(preset.descriptionKo, preset.descriptionEn)}
              onClick={() => onSelectPreset(preset)}
              style={{
                borderColor: selected ? preset.spectrumToneVar : undefined,
                background: selected ? preset.spectrumGlowMix : undefined,
                boxShadow: selected
                  ? `0 0 0 1px ${preset.spectrumToneVar}, 0 6px 18px -10px ${preset.spectrumToneVar}`
                  : undefined,
              }}
              className="group inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 [word-break:keep-all] transition-[transform,box-shadow,border-color,background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-accent/70 hover:text-fg active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 aria-pressed:text-fg motion-reduce:transition-none motion-reduce:transform-none"
            >
              <span
                className="inline-flex size-6 items-center justify-center rounded-lg border border-line/60 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:transform-none"
                style={{
                  color: preset.spectrumToneVar,
                  background: preset.spectrumGlowMix,
                }}
              >
                <AtmosphereIcon id={preset.id} selected={selected} />
              </span>
              <span>{label}</span>
              {selected ? (
                <span className="hidden rounded-full border border-line/70 bg-panel px-1.5 py-0.5 font-mono text-[0.625rem] tabular-nums text-fg-2 lg:inline">
                  {`${preset.inkLineWeightPx.toFixed(1)}px`}
                </span>
              ) : null}
            </button>
          );
        })}
        {activePreset ? (
          <div
            data-testid="studio-bg3d-active-atmosphere-summary"
            className="ml-auto hidden shrink-0 items-center gap-2 rounded-xl border border-line bg-card px-2.5 py-1.5 text-[0.6875rem] text-fg-2 xl:inline-flex"
          >
            <span className="font-semibold text-fg">
              {copy(activePreset.weather.badgeKo, activePreset.weather.badgeEn)}
            </span>
            <span className="font-mono tabular-nums text-fg-3">
              {copy(
                `안개 ${Math.round(activePreset.fog.density * 100)}% · 선폭 ${activePreset.inkLineWeightPx.toFixed(1)}px`,
                `Fog ${Math.round(activePreset.fog.density * 100)}% · Ink ${activePreset.inkLineWeightPx.toFixed(1)}px`,
              )}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section
      data-testid="studio-bg3d-lighting-webtoon-atmosphere"
      aria-label={copy("웹툰 원클릭 분위기 7종", "7 one-click webtoon atmospheres")}
      className="relative mb-3 overflow-hidden rounded-xl border border-line bg-panel/85 p-3"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--color-warn), var(--color-accent), var(--color-cool), var(--color-good))",
        }}
      />
      <div className="mb-2 flex items-start justify-between gap-2 pt-0.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Sparkles size={13} className="shrink-0 text-accent" aria-hidden />
            {copy("웹툰 원클릭 분위기 7종", "7 Webtoon Atmosphere Presets")}
          </h3>
          <p className="mt-0.5 text-[0.65rem] leading-relaxed text-fg-3 [word-break:keep-all]">
            {copy(
              "조명·안개 밀도·외곽선 두께·날씨를 한 번에 바꿔 컷 분위기를 즉시 완성합니다.",
              "Switch lighting, fog density, outline weight, and weather in one click.",
            )}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[0.625rem] font-bold text-accent">
          {activePreset
            ? copy(activePreset.labelKo, activePreset.labelEn)
            : copy("7종 즉시 적용", "7 presets")}
        </span>
      </div>

      <div
        role="group"
        aria-label={copy("웹툰 분위기 프리셋 선택", "Select webtoon atmosphere preset")}
        className="grid grid-cols-2 gap-1.5"
      >
        {STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.map((preset) => {
          const selected = preset.id === activePresetId;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={copy(`${preset.labelKo} 웹툰 분위기 적용`, `Apply ${preset.labelEn} webtoon mood`)}
              data-testid={`studio-bg3d-lighting-mood-${preset.id}`}
              title={copy(preset.descriptionKo, preset.descriptionEn)}
              onClick={() => onSelectPreset(preset)}
              style={{
                borderColor: selected ? preset.spectrumToneVar : undefined,
                background: selected ? preset.spectrumGlowMix : undefined,
                boxShadow: selected
                  ? `0 0 0 1px ${preset.spectrumToneVar}, 0 8px 20px -12px ${preset.spectrumToneVar}`
                  : undefined,
              }}
              className="group relative flex min-h-12 min-w-0 cursor-pointer flex-col justify-between gap-1 rounded-xl border border-line bg-card px-2.5 py-2 text-left [word-break:keep-all] transition-[transform,box-shadow,border-color,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-accent/60 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none motion-reduce:transform-none"
            >
              <span className="flex items-center justify-between gap-1.5">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-fg">
                  <span
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-md"
                    style={{
                      color: preset.spectrumToneVar,
                      background: preset.spectrumGlowMix,
                    }}
                  >
                    <AtmosphereIcon id={preset.id} selected={selected} />
                  </span>
                  <span className="truncate">{copy(preset.labelKo, preset.labelEn)}</span>
                </span>
                {selected ? (
                  <Check size={13} className="shrink-0 text-accent" aria-hidden />
                ) : null}
              </span>
              <span className="flex items-center justify-between gap-1 text-[0.625rem] text-fg-3">
                <span className="truncate">{copy(preset.weather.badgeKo, preset.weather.badgeEn)}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  {`${preset.inkLineWeightPx.toFixed(1)}px`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {activePreset ? (
        <div
          aria-live="polite"
          className="mt-2 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-line/80 bg-card px-2.5 py-1.5 text-[0.65rem] text-fg-2"
        >
          <span className="font-semibold text-fg [word-break:keep-all]">
            {copy(activePreset.descriptionKo, activePreset.descriptionEn)}
          </span>
          <span className="font-mono tabular-nums text-fg-3">
            {copy(
              `안개 ${Math.round(activePreset.fog.density * 100)}% · 선폭 ${activePreset.inkLineWeightPx.toFixed(1)}px · 노출 ${activePreset.exposure.toFixed(2)}×`,
              `Fog ${Math.round(activePreset.fog.density * 100)}% · Ink ${activePreset.inkLineWeightPx.toFixed(1)}px · Exp ${activePreset.exposure.toFixed(2)}×`,
            )}
          </span>
        </div>
      ) : null}
    </section>
  );
}
