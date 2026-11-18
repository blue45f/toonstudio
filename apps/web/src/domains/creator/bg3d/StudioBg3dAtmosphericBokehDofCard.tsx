import { Aperture, CalendarCheck2, Wind } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  ATMOSPHERIC_MOTE_PROFILES,
  type AtmosphericBokehQuarterlyRoiEvaluation,
  type AtmosphericMoteStyleId,
} from "./studio-bg3d-atmospheric-bokeh-dof";
import {
  evaluateZDepthCrowdTodCompositor,
  type DatumCrowdPresetCount,
  type WebtoonTimeOfDayId,
} from "./studio-bg3d-zdepth-crowd-tod-compositor";
import { StudioBg3dZDepthCrowdTodCard } from "./StudioBg3dZDepthCrowdTodCard";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

export interface StudioBg3dAtmosphericBokehDofCardProps {
  readonly disabled?: boolean;
  readonly evaluation: AtmosphericBokehQuarterlyRoiEvaluation;
  readonly onSelectMoteStyleId: (styleId: AtmosphericMoteStyleId) => void;
  readonly onChangeClimaxSequencesPerEpisode: (count: number) => void;
}

/**
 * Unslop 9-Pass 정밀 워크벤치 규격이 적용된 V22 보케 파티클·조리개(DoF) 심도 & V23 Z-심도/군중/시간대 통합 카드:
 * 4px 그리드 간격, 중첩 반경(`rounded-xl -> rounded-lg -> rounded-md`), 16px stroke-1.5 라인 아이콘,
 * 500/600 최대 웨이트, tabular-nums 고정폭 지표를 준수한다.
 */
export function StudioBg3dAtmosphericBokehDofCard({
  disabled = false,
  evaluation,
  onSelectMoteStyleId,
  onChangeClimaxSequencesPerEpisode,
}: StudioBg3dAtmosphericBokehDofCardProps) {
  const [timeOfDayId, setTimeOfDayId] = useState<WebtoonTimeOfDayId>("sunset-3200k");
  const [crowdCount, setCrowdCount] = useState<DatumCrowdPresetCount>(6);
  const [gutterPx, setGutterPx] = useState<number>(280);

  useEffect(() => {
    if (evaluation.openRatioPct === 15) setTimeOfDayId("noon-5600k");
    else if (evaluation.openRatioPct === 65) setTimeOfDayId("sunset-3200k");
    else if (evaluation.openRatioPct === 100) setTimeOfDayId("moonlight-8500k");
  }, [evaluation.openRatioPct]);

  const v23Evaluation = useMemo(
    () =>
      evaluateZDepthCrowdTodCompositor({
        openRatioPct: evaluation.openRatioPct,
        apertureFStop: evaluation.recommendedApertureFStop,
        foregroundCocPx: evaluation.foregroundCocDiameterPx,
        timeOfDayId,
        crowdCount,
        gutterPx,
        baseBokehWeeklyHoursSaved: evaluation.totalWeeklyHoursWithBokeh,
        foregroundBokehLayerTag: evaluation.profile.psdLayerTag,
      }),
    [
      evaluation.openRatioPct,
      evaluation.recommendedApertureFStop,
      evaluation.foregroundCocDiameterPx,
      evaluation.totalWeeklyHoursWithBokeh,
      evaluation.profile.psdLayerTag,
      timeOfDayId,
      crowdCount,
      gutterPx,
    ],
  );

  return (
    <div
      data-testid="bg3d-blender-atmospheric-bokeh-card"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <Aperture size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>
            보케 파티클·피사계 심도(DoF f/1.8~f/5.6) 레이어 V22 · 분기별 세이브 원고 ROI
          </span>
        </span>
        <span
          data-testid="bg3d-blender-bokeh-fstop-badge"
          className="inline-flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span className="size-2 rounded-full bg-[#4cc38a]" aria-hidden />
          f/{evaluation.recommendedApertureFStop.toFixed(1)} · CoC{" "}
          {evaluation.foregroundCocDiameterPx.toFixed(1)}px
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-panel p-2 lg:col-span-5">
          <img
            src={evaluation.profile.previewUrl}
            alt={evaluation.profile.labelKo}
            loading="lazy"
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-md bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-2 font-medium text-fg">
              <Wind size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
              <span className="truncate">{evaluation.profile.labelKo}</span>
            </span>
            <span
              data-testid="bg3d-blender-bokeh-dof-readout"
              className="mt-1 block truncate font-mono text-xs tabular-nums text-fg-3"
              title={evaluation.dofSummaryKo}
            >
              {evaluation.dofSummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
          {ATMOSPHERIC_MOTE_PROFILES.map((mote) => {
            const active = mote.id === evaluation.profile.id;
            return (
              <button
                key={mote.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-v22-mote-${mote.id}`}
                onClick={() => onSelectMoteStyleId(mote.id)}
                className={`min-h-9 rounded-lg border px-3 py-1 text-xs font-medium tabular-nums ${
                  active
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } ${MOTION_PRESS}`}
              >
                {mote.labelKo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel/60 px-3 py-2">
        <span
          data-testid="bg3d-blender-quarterly-banked-readout"
          className="inline-flex items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
        >
          <CalendarCheck2 size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <span>{evaluation.quarterlyBankedSummaryKo}</span>
        </span>

        <label className="flex items-center gap-2 rounded-md border border-line bg-card px-2 py-1 text-xs">
          <span className="font-mono tabular-nums text-fg-2">
            3연속 시퀀스: {evaluation.climaxSequencesPerEpisode}회/화
          </span>
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            disabled={disabled}
            aria-label="회차당 클라이맥스 3연속 시퀀스 빈도"
            data-testid="bg3d-blender-climax-freq-slider"
            value={evaluation.climaxSequencesPerEpisode}
            onChange={(e) => onChangeClimaxSequencesPerEpisode(Number(e.target.value))}
            className="w-24 accent-accent"
          />
        </label>
      </div>

      <StudioBg3dZDepthCrowdTodCard
        disabled={disabled}
        evaluation={v23Evaluation}
        onSelectTimeOfDayId={setTimeOfDayId}
        onSelectCrowdCount={setCrowdCount}
        onChangeGutterPx={setGutterPx}
      />
    </div>
  );
}
