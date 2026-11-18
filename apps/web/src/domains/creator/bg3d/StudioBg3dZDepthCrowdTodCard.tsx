import {
  FileJson2,
  GalleryVerticalEnd,
  Sun,
  Type,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StudioBg3dWeatherMotionColorScriptCard } from "./StudioBg3dWeatherMotionColorScriptCard";
import {
  evaluateWeatherMotionAndColorScript,
  type EpisodeColorScriptAct,
  type EpisodeColorScriptActId,
  type SfxLocalizationLocaleId,
  type WeatherOcclusionPresetId,
} from "./studio-bg3d-weather-motion-colorscript";
import {
  WEBTOON_TIME_OF_DAY_PROFILES,
  type DatumCrowdPresetCount,
  type WebtoonTimeOfDayId,
  type ZDepthCrowdTodCompositorEvaluation,
} from "./studio-bg3d-zdepth-crowd-tod-compositor";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

const CROWD_COUNTS: readonly DatumCrowdPresetCount[] = [4, 6, 15];

export interface StudioBg3dZDepthCrowdTodCardProps {
  readonly disabled?: boolean;
  readonly evaluation: ZDepthCrowdTodCompositorEvaluation;
  readonly onSelectTimeOfDayId: (id: WebtoonTimeOfDayId) => void;
  readonly onSelectCrowdCount: (count: DatumCrowdPresetCount) => void;
  readonly onChangeGutterPx: (gutterPx: number) => void;
}

/**
 * Unslop 9-Pass 정밀 워크벤치 규격이 적용된 V23 Z-심도 3D 효과음(SFX) · 기준선 군중 블로킹 ·
 * 멀티 시간대(5600K/3200K/8500K) · 세로 스크롤 페이싱 · V24 기상 차폐/컬러 스크립트/무빙툰 통합 카드.
 */
export function StudioBg3dZDepthCrowdTodCard({
  disabled = false,
  evaluation,
  onSelectTimeOfDayId,
  onSelectCrowdCount,
  onChangeGutterPx,
}: StudioBg3dZDepthCrowdTodCardProps) {
  const [showManifestPreview, setShowManifestPreview] = useState(false);
  const [weatherId, setWeatherId] =
    useState<WeatherOcclusionPresetId>("rofan-blossom-snow");
  const [activeActId, setActiveActId] =
    useState<EpisodeColorScriptActId>("act2-turn");
  const [localeId, setLocaleId] = useState<SfxLocalizationLocaleId>("KO");
  const [characterFocalMm, setCharacterFocalMm] = useState<number>(85);

  useEffect(() => {
    if (evaluation.manifest.openRatioPct <= 25) {
      setWeatherId("eaves-rain-ripples");
      setActiveActId("act1-setup");
    } else if (evaluation.manifest.openRatioPct <= 75) {
      setWeatherId("rofan-blossom-snow");
      setActiveActId("act2-turn");
    } else {
      setWeatherId("abyss-storm-mist");
      setActiveActId("act3-climax");
    }
  }, [evaluation.manifest.openRatioPct]);

  const v24Evaluation = useMemo(
    () =>
      evaluateWeatherMotionAndColorScript({
        openRatioPct: evaluation.manifest.openRatioPct,
        weatherId,
        backgroundFocalMm: 24,
        characterFocalMm,
        activeActId,
        localeId,
        baseV23WeeklyHoursSaved: evaluation.totalWeeklyHoursV23,
        layers: evaluation.manifest.layers,
      }),
    [
      evaluation.manifest.openRatioPct,
      evaluation.totalWeeklyHoursV23,
      evaluation.manifest.layers,
      weatherId,
      characterFocalMm,
      activeActId,
      localeId,
    ],
  );

  const handleSelectAct = (act: EpisodeColorScriptAct) => {
    setActiveActId(act.id);
    if (act.kelvin >= 7500) onSelectTimeOfDayId("moonlight-8500k");
    else if (act.kelvin >= 5000) onSelectTimeOfDayId("noon-5600k");
    else onSelectTimeOfDayId("sunset-3200k");
  };

  return (
    <div
      data-testid="bg3d-blender-v23-zdepth-compositor-card"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <Type size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>
            Z-심도 3D 효과음(SFX) · 기준선 군중 · 시간대(5600K~8500K) V23 · .toonlayers.json 익스포터
          </span>
        </span>
        <span
          data-testid="bg3d-blender-v23-tod-badge"
          className="inline-flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span className="size-2 rounded-full bg-[#4cc38a]" aria-hidden />
          {evaluation.timeOfDay.kelvin}K · 고도 {evaluation.timeOfDay.solarElevationDeg}° · ΔE{" "}
          {evaluation.timeOfDay.darkroomDeltaE.toFixed(2)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-panel p-2 lg:col-span-5">
          <img
            src={evaluation.timeOfDay.previewUrl}
            alt={evaluation.timeOfDay.labelKo}
            loading="lazy"
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-md bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-2 font-medium text-fg">
              <Sun size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
              <span className="truncate">{evaluation.timeOfDay.labelKo}</span>
            </span>
            <span
              data-testid="bg3d-blender-v23-zdepth-readout"
              className="mt-1 block truncate font-mono text-xs tabular-nums text-fg-3"
              title={evaluation.zDepthSummaryKo}
            >
              {evaluation.zDepthSummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
          {WEBTOON_TIME_OF_DAY_PROFILES.map((tod) => {
            const active = tod.id === evaluation.timeOfDay.id;
            return (
              <button
                key={tod.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-v23-tod-${tod.id}`}
                onClick={() => onSelectTimeOfDayId(tod.id)}
                className={`min-h-9 rounded-lg border px-3 py-1 text-xs font-medium tabular-nums ${
                  active
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } ${MOTION_PRESS}`}
              >
                {tod.labelKo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-6">
          <span className="inline-flex items-center gap-2 font-medium text-fg-2">
            <Users size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span>기준선 엑스트라 블로킹</span>
          </span>
          <div className="flex items-center gap-1">
            {CROWD_COUNTS.map((cnt) => {
              const active = cnt === evaluation.crowdCount;
              return (
                <button
                  key={cnt}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-v23-crowd-${cnt}`}
                  onClick={() => onSelectCrowdCount(cnt)}
                  className={`min-h-8 rounded-md border px-2 py-1 font-mono text-xs font-medium tabular-nums ${
                    active
                      ? "border-accent bg-raised text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  } ${MOTION_PRESS}`}
                >
                  {cnt}인
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 lg:col-span-6">
          <span
            data-testid="bg3d-blender-v23-scroll-pacing-readout"
            className="inline-flex items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
          >
            <GalleryVerticalEnd
              size={16}
              strokeWidth={1.5}
              className="shrink-0 text-fg-3"
              aria-hidden
            />
            <span>{evaluation.scrollPacingSummaryKo}</span>
          </span>
          <label className="flex items-center gap-2 rounded-md border border-line bg-card px-2 py-1 text-xs">
            <span className="font-mono tabular-nums text-fg-2">
              여백 {evaluation.gutterPx}px
            </span>
            <input
              type="range"
              min={120}
              max={420}
              step={20}
              disabled={disabled}
              aria-label="세로 스크롤 컷 간 여백 픽셀"
              data-testid="bg3d-blender-v23-gutter-slider"
              value={evaluation.gutterPx}
              onChange={(e) => onChangeGutterPx(Number(e.target.value))}
              className="w-20 accent-accent"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2">
        <span
          data-testid="bg3d-blender-v23-export-roi-readout"
          className="inline-flex items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
        >
          <FileJson2 size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <span>{evaluation.exportRoiSummaryKo}</span>
        </span>
        <button
          type="button"
          disabled={disabled}
          data-testid="bg3d-blender-v23-manifest-toggle"
          onClick={() => setShowManifestPreview((prev) => !prev)}
          className={`min-h-8 rounded-md border border-line bg-card px-3 py-1 font-mono text-xs font-medium tabular-nums text-fg hover:bg-raised ${MOTION_PRESS}`}
        >
          {showManifestPreview ? ".toonlayers.json 닫기" : ".toonlayers.json 6패스 확인"}
        </button>
      </div>

      {showManifestPreview ? (
        <pre
          data-testid="bg3d-blender-v23-manifest-json"
          className="max-h-40 overflow-y-auto rounded-lg border border-line bg-[#141415] p-3 font-mono text-xs tabular-nums text-fg-2"
        >
          {evaluation.manifestJsonString}
        </pre>
      ) : null}

      <StudioBg3dWeatherMotionColorScriptCard
        disabled={disabled}
        openRatioPct={evaluation.manifest.openRatioPct}
        evaluation={v24Evaluation}
        onSelectWeatherId={setWeatherId}
        onSelectAct={handleSelectAct}
        onSelectLocaleId={setLocaleId}
        onChangeCharacterFocalMm={setCharacterFocalMm}
      />
    </div>
  );
}
