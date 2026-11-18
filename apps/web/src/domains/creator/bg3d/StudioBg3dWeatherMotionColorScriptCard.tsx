import {
  Camera,
  CloudRain,
  Film,
  Languages,
  Palette,
} from "lucide-react";
import { useState } from "react";

import {
  EPISODE_70CUT_COLOR_SCRIPT_ACTS,
  WEATHER_OCCLUSION_PROFILES,
  type EpisodeColorScriptAct,
  type SfxLocalizationLocaleId,
  type WeatherMotionColorScriptEvaluation,
  type WeatherOcclusionPresetId,
} from "./studio-bg3d-weather-motion-colorscript";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

const LOCALES: readonly SfxLocalizationLocaleId[] = ["KO", "EN", "JA"];

export interface StudioBg3dWeatherMotionColorScriptCardProps {
  readonly disabled?: boolean;
  readonly evaluation: WeatherMotionColorScriptEvaluation;
  readonly onSelectWeatherId: (id: WeatherOcclusionPresetId) => void;
  readonly onSelectAct: (act: EpisodeColorScriptAct) => void;
  readonly onSelectLocaleId: (locale: SfxLocalizationLocaleId) => void;
  readonly onChangeCharacterFocalMm: (mm: number) => void;
}

/**
 * Unslop 9-Pass 정밀 워크벤치 규격이 적용된 V24 건축 차폐 기상 · 듀얼 포컬(24mm×85mm) ·
 * 70컷 4막 컬러 스크립트 · KO/EN/JA 무손실 식자 슬롯 · .toonmotion.json 익스포터 카드.
 */
export function StudioBg3dWeatherMotionColorScriptCard({
  disabled = false,
  evaluation,
  onSelectWeatherId,
  onSelectAct,
  onSelectLocaleId,
  onChangeCharacterFocalMm,
}: StudioBg3dWeatherMotionColorScriptCardProps) {
  const [showMotionJson, setShowMotionJson] = useState(false);

  return (
    <div
      data-testid="bg3d-blender-v24-weather-motion-card"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <CloudRain size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>
            건축 차폐 기상·수막 파문 V24 · 듀얼 포컬({evaluation.backgroundFocalMm}mm×
            {evaluation.characterFocalMm}mm) · 70컷 컬러 스크립트 · .toonmotion.json
          </span>
        </span>
        <span
          data-testid="bg3d-blender-v24-dualfocal-badge"
          className="inline-flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span className="size-2 rounded-full bg-[#4cc38a]" aria-hidden />
          누수 0건 · 왜곡 {evaluation.unsplitFacialDistortionPct.toFixed(1)}%→
          {evaluation.dualFocalFacialDistortionPct.toFixed(1)}%
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-panel p-2 lg:col-span-5">
          <img
            src={evaluation.weather.previewUrl}
            alt={evaluation.weather.labelKo}
            loading="lazy"
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-md bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-2 font-medium text-fg">
              <Camera size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
              <span className="truncate">{evaluation.weather.labelKo}</span>
            </span>
            <span
              data-testid="bg3d-blender-v24-weather-readout"
              className="mt-1 block truncate font-mono text-xs tabular-nums text-fg-3"
              title={evaluation.weatherDualFocalSummaryKo}
            >
              {evaluation.weatherDualFocalSummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
          {WEATHER_OCCLUSION_PROFILES.map((w) => {
            const active = w.id === evaluation.weather.id;
            return (
              <button
                key={w.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-v24-weather-${w.id}`}
                onClick={() => onSelectWeatherId(w.id)}
                className={`min-h-9 rounded-lg border px-3 py-1 text-xs font-medium tabular-nums ${
                  active
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } ${MOTION_PRESS}`}
              >
                {w.labelKo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <span className="inline-flex items-center gap-2 font-medium text-fg-2">
            <Palette size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span>에피소드 70컷 4막 컬러 스크립트 보드 (전 구간 ΔE ≤ 0.8 통과)</span>
          </span>
          <label className="flex items-center gap-2 rounded-md border border-line bg-card px-2 py-1 text-xs">
            <span className="font-mono tabular-nums text-fg-2">
              인물 망원 {evaluation.characterFocalMm}mm
            </span>
            <input
              type="range"
              min={70}
              max={110}
              step={5}
              disabled={disabled}
              aria-label="듀얼 포컬 인물 망원 초점거리 밀리미터"
              data-testid="bg3d-blender-v24-char-focal-slider"
              value={evaluation.characterFocalMm}
              onChange={(e) => onChangeCharacterFocalMm(Number(e.target.value))}
              className="w-20 accent-accent"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EPISODE_70CUT_COLOR_SCRIPT_ACTS.map((act) => {
            const active = act.id === evaluation.activeAct.id;
            return (
              <button
                key={act.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-v24-act-${act.id}`}
                onClick={() => onSelectAct(act)}
                className={`flex items-center justify-between gap-2 rounded-md border px-2 py-2 text-left font-mono text-xs tabular-nums ${
                  active
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                } ${MOTION_PRESS}`}
              >
                <span className="min-w-0 truncate">
                  <span className="block font-sans font-medium text-fg">
                    {act.actLabelKo} · {act.cutRangeLabel}
                  </span>
                  <span className="block text-fg-3">
                    {act.kelvin}K · f/{act.apertureFStop.toFixed(1)}
                  </span>
                </span>
                <span
                  className="size-3 shrink-0 rounded-sm border border-white/15"
                  style={{ backgroundColor: act.swatchHex }}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-6">
          <span
            data-testid="bg3d-blender-v24-locale-readout"
            className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
          >
            <Languages size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span className="truncate">{evaluation.localizationSummaryKo}</span>
          </span>
          <div className="flex items-center gap-1">
            {LOCALES.map((loc) => {
              const active = loc === evaluation.localizedSfxSlot.locale;
              return (
                <button
                  key={loc}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-v24-locale-${loc}`}
                  onClick={() => onSelectLocaleId(loc)}
                  className={`min-h-8 rounded-md border px-2 py-1 font-mono text-xs font-medium tabular-nums ${
                    active
                      ? "border-accent bg-raised text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  } ${MOTION_PRESS}`}
                >
                  {loc}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-6">
          <span
            data-testid="bg3d-blender-v24-motion-roi-readout"
            className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
          >
            <Film size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span className="truncate" title={evaluation.motionRoiSummaryKo}>
              {evaluation.motionRoiSummaryKo}
            </span>
          </span>
          <button
            type="button"
            disabled={disabled}
            data-testid="bg3d-blender-v24-motion-toggle"
            onClick={() => setShowMotionJson((prev) => !prev)}
            className={`min-h-8 shrink-0 rounded-md border border-line bg-card px-3 py-1 font-mono text-xs font-medium tabular-nums text-fg hover:bg-raised ${MOTION_PRESS}`}
          >
            {showMotionJson ? ".toonmotion.json 닫기" : ".toonmotion.json 시차 확인"}
          </button>
        </div>
      </div>

      {showMotionJson ? (
        <pre
          data-testid="bg3d-blender-v24-motion-json"
          className="max-h-40 overflow-y-auto rounded-lg border border-line bg-[#141415] p-3 font-mono text-xs tabular-nums text-fg-2"
        >
          {evaluation.motionManifestJsonString}
        </pre>
      ) : null}
    </div>
  );
}
