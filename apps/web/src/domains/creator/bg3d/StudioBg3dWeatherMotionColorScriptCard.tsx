import {
  Camera,
  CloudRain,
  Film,
  Globe2,
  Palette,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StudioBg3dWindDrapeContinuityCard } from "./StudioBg3dWindDrapeContinuityCard";
import {
  EPISODE_70CUT_COLOR_SCRIPT_ACTS,
  WEATHER_OCCLUSION_PROFILES,
  type EpisodeColorScriptAct,
  type SfxLocalizationLocaleId,
  type WeatherMotionColorScriptEvaluation,
  type WeatherOcclusionPresetId,
} from "./studio-bg3d-weather-motion-colorscript";
import {
  evaluateWindDrapeAndContinuity,
  type ContinuityLedgerSnapshot,
  type TankobonFormatId,
  type WindDrapeFabricId,
} from "./studio-bg3d-wind-drape-continuity";

const MOTION_PRESS =
  "transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

const LOCALES: readonly SfxLocalizationLocaleId[] = ["KO", "EN", "JA"];

export interface StudioBg3dWeatherMotionColorScriptCardProps {
  readonly disabled?: boolean;
  readonly openRatioPct?: number;
  readonly evaluation: WeatherMotionColorScriptEvaluation;
  readonly onSelectWeatherId: (id: WeatherOcclusionPresetId) => void;
  readonly onSelectAct: (act: EpisodeColorScriptAct) => void;
  readonly onSelectLocaleId: (locale: SfxLocalizationLocaleId) => void;
  readonly onChangeCharacterFocalMm: (focalMm: number) => void;
}

/**
 * Unslop 9-Pass 정밀 워크벤치 규격이 적용된 V24 건축 차폐 기상·수막 파문 ·
 * 듀얼 포컬(24mm×85mm) · 70컷 4막 컬러 스크립트 · 다국어(KO/EN/JA) 식자 슬롯 ·
 * .toonmotion.json 9:16 60fps 무빙툰 카드 및 V25 연속성/패브릭 워크벤치 연결 컴포넌트.
 */
export function StudioBg3dWeatherMotionColorScriptCard({
  disabled = false,
  openRatioPct = 65,
  evaluation,
  onSelectWeatherId,
  onSelectAct,
  onSelectLocaleId,
  onChangeCharacterFocalMm,
}: StudioBg3dWeatherMotionColorScriptCardProps) {
  const [showMotionJson, setShowMotionJson] = useState(false);
  const [fabricId, setFabricId] = useState<WindDrapeFabricId>("rofan-velvet");
  const [lockedLedger, setLockedLedger] =
    useState<ContinuityLedgerSnapshot | null>(null);
  const [tankobonFormatId, setTankobonFormatId] =
    useState<TankobonFormatId>("B5");

  useEffect(() => {
    if (openRatioPct <= 25) setFabricId("linen-rain");
    else if (openRatioPct <= 75) setFabricId("rofan-velvet");
    else setFabricId("tempest-silk");
  }, [openRatioPct]);

  const v25Evaluation = useMemo(
    () =>
      evaluateWindDrapeAndContinuity({
        openRatioPct,
        fabricId,
        indoorWetReachM: evaluation.indoorWetReachM,
        indoorRippleCount: evaluation.indoorRippleCount,
        kelvin: evaluation.activeAct.kelvin,
        locale: evaluation.localizedSfxSlot.locale,
        onomatopoeiaText: evaluation.localizedSfxSlot.onomatopoeiaText,
        lockedLedger,
        tankobonFormatId,
        baseV24WeeklyHoursSaved: evaluation.totalWeeklyHoursV24,
      }),
    [
      openRatioPct,
      fabricId,
      evaluation.indoorWetReachM,
      evaluation.indoorRippleCount,
      evaluation.activeAct.kelvin,
      evaluation.localizedSfxSlot.locale,
      evaluation.localizedSfxSlot.onomatopoeiaText,
      evaluation.totalWeeklyHoursV24,
      lockedLedger,
      tankobonFormatId,
    ],
  );

  return (
    <div
      data-testid="bg3d-blender-v24-weather-motion-card"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <CloudRain size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>
            건축 차폐 기상·수막 파문 V24 · 듀얼 포컬 · 70컷 컬러 스크립트 · KO/EN/JA · .toonmotion.json
          </span>
        </span>
        <span
          data-testid="bg3d-blender-v24-dualfocal-badge"
          className="inline-flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span className="size-2 rounded-full bg-good" aria-hidden />
          {evaluation.backgroundFocalMm}mm 배경 × {evaluation.characterFocalMm}mm 인물 · 왜곡{" "}
          {evaluation.dualFocalFacialDistortionPct}%
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
            className="size-12 shrink-0 rounded-md border border-line bg-canvas object-cover"
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
                className={`min-h-11 rounded-lg border px-3 py-1 text-xs font-medium tabular-nums ${
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

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-7">
          <span className="inline-flex items-center gap-2 font-medium text-fg-2">
            <Palette size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span>70컷 4막 컬러 스크립트</span>
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {EPISODE_70CUT_COLOR_SCRIPT_ACTS.map((act) => {
              const active = act.id === evaluation.activeAct.id;
              return (
                <button
                  key={act.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-v24-act-${act.id}`}
                  onClick={() => onSelectAct(act)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs font-medium tabular-nums ${
                    active
                      ? "border-accent bg-raised text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  } ${MOTION_PRESS}`}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: act.swatchHex }}
                    aria-hidden
                  />
                  {act.actLabelKo} ({act.cutRangeLabel})
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-5">
          <label className="flex w-full items-center justify-between gap-2 text-xs">
            <span className="font-mono tabular-nums text-fg-2">
              인물 망원 {evaluation.characterFocalMm}mm (왜곡 -
              {evaluation.anatomyRedrawMinutesSavedPerCut}분/컷)
            </span>
            <input
              type="range"
              min={70}
              max={110}
              step={5}
              disabled={disabled}
              aria-label="인물 전용 망원 초점거리"
              data-testid="bg3d-blender-v24-char-focal-slider"
              value={evaluation.characterFocalMm}
              onChange={(e) => onChangeCharacterFocalMm(Number(e.target.value))}
              className="w-24 accent-accent"
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-6">
          <span
            data-testid="bg3d-blender-v24-locale-readout"
            className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
          >
            <Globe2 size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span className="truncate" title={evaluation.localizationSummaryKo}>
              {evaluation.localizationSummaryKo}
            </span>
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
                  className={`min-h-11 rounded-md border px-2 py-1 font-mono text-xs font-medium tabular-nums ${
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
            className={`min-h-11 shrink-0 rounded-md border border-line bg-card px-3 py-1 font-mono text-xs font-medium tabular-nums text-fg hover:bg-raised ${MOTION_PRESS}`}
          >
            {showMotionJson ? ".toonmotion.json 닫기" : ".toonmotion.json 시차 확인"}
          </button>
        </div>
      </div>

      {showMotionJson ? (
        <pre
          data-testid="bg3d-blender-v24-motion-json"
          className="max-h-40 overflow-y-auto rounded-lg border border-line bg-canvas p-3 font-mono text-xs tabular-nums text-fg-2"
        >
          {evaluation.motionManifestJsonString}
        </pre>
      ) : null}

      <StudioBg3dWindDrapeContinuityCard
        disabled={disabled}
        onomatopoeiaText={evaluation.localizedSfxSlot.onomatopoeiaText}
        all70CutsDarkroomCompliant={evaluation.all70CutsDarkroomCompliant}
        evaluation={v25Evaluation}
        lockedLedger={lockedLedger}
        onSelectFabricId={setFabricId}
        onToggleLedgerLock={() =>
          setLockedLedger((prev) =>
            prev ? null : v25Evaluation.currentSnapshot,
          )
        }
        onSelectTankobonFormatId={setTankobonFormatId}
      />
    </div>
  );
}
