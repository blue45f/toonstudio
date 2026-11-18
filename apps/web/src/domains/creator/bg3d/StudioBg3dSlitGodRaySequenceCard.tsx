import { Clock, Layers, Sun } from "lucide-react";

import {
  SLIT_SEQUENCE_3BEAT_PRESETS,
  type SlitGodRayShadowDriftEvaluation,
  type SlitSequenceBeatPreset,
} from "./studio-bg3d-slit-godray-sequence";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

export interface StudioBg3dSlitGodRaySequenceCardProps {
  readonly disabled?: boolean;
  readonly evaluation: SlitGodRayShadowDriftEvaluation;
  readonly onApplySequenceBeat: (beat: SlitSequenceBeatPreset) => void;
  readonly onChangeInteractionCutRatioPct: (pct: number) => void;
}

/**
 * Unslop 9-Pass 정밀 워크벤치 규격이 적용된 V21 가변 슬릿 고드레이·그림자 드리프트 & 3연속 시퀀스 어셈블러:
 * 4px 그리드 간격, 중첩 반경(`rounded-2xl -> rounded-xl -> rounded-lg -> rounded-md`),
 * 16px stroke-1.5 단일 라인 아이콘, 500/600 웨이트 상한, tabular-nums 고정폭 지표를 준수한다.
 */
export function StudioBg3dSlitGodRaySequenceCard({
  disabled = false,
  evaluation,
  onApplySequenceBeat,
  onChangeInteractionCutRatioPct,
}: StudioBg3dSlitGodRaySequenceCardProps) {
  return (
    <section
      data-testid="bg3d-blender-slit-godray-section"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-3 text-xs text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
          <Sun size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>5D. 개폐율 연동 가변 슬릿 고드레이(V21) · 그림자 드리프트 · 3연속 컷 어셈블러</span>
        </span>
        <span
          data-testid="bg3d-blender-slit-godray-badge"
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span className="size-2 rounded-full bg-[#4cc38a]" aria-hidden />
          눈가 하이라이트 Z {evaluation.eyeLineHighlightHeightM.toFixed(2)}m 동기화
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-card p-3 lg:grid-cols-12">
        <div className="flex items-center gap-3 lg:col-span-5">
          <img
            src={evaluation.activeBeatPreset.previewUrl}
            alt={evaluation.activeBeatPreset.labelKo}
            loading="lazy"
            width={56}
            height={56}
            className="size-14 shrink-0 rounded-lg bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-fg">
              {evaluation.activeBeatPreset.narrativeRoleKo}
            </span>
            <span
              data-testid="bg3d-blender-slit-godray-readout"
              className="mt-0.5 block font-mono text-xs tabular-nums text-fg-2"
            >
              {evaluation.godRaySummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
          {SLIT_SEQUENCE_3BEAT_PRESETS.map((beat) => {
            const active = beat.id === evaluation.activeBeatPreset.id && evaluation.openRatioPct === beat.openRatioPct;
            return (
              <button
                key={beat.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-v21-beat-${beat.openRatioPct}`}
                onClick={() => onApplySequenceBeat(beat)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium tabular-nums ${
                  active
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } ${MOTION_PRESS}`}
              >
                <Layers size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
                <span>{beat.labelKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-card px-3 py-2">
          <span className="block text-xs text-fg-3">슬릿 개구부 폭</span>
          <span className="mt-1 block font-mono text-base font-medium tabular-nums text-fg">
            {evaluation.slitApertureWidthM.toFixed(2)}m
          </span>
        </div>
        <div className="rounded-xl border border-line bg-card px-3 py-2">
          <span className="block text-xs text-fg-3">고드레이 확산각</span>
          <span className="mt-1 block font-mono text-base font-medium tabular-nums text-fg">
            {evaluation.godRaySpreadAngleDeg.toFixed(1)}°
          </span>
        </div>
        <div className="rounded-xl border border-line bg-card px-3 py-2">
          <span className="block text-xs text-fg-3">바닥 그림자 도달 길이</span>
          <span className="mt-1 block font-mono text-base font-medium tabular-nums text-fg">
            {evaluation.floorShadowLengthM.toFixed(2)}m
          </span>
        </div>
        <div className="rounded-xl border border-line bg-card px-3 py-2">
          <span className="block text-xs text-fg-3">주간 누적 총 절감</span>
          <span className="mt-1 block font-mono text-base font-medium tabular-nums text-fg">
            {evaluation.combinedWeeklyHoursSaved.toFixed(1)}h
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2">
        <span
          data-testid="bg3d-blender-stacked-interaction-roi-readout"
          className="inline-flex items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
        >
          <Clock size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <span>{evaluation.stackedRoiSummaryKo}</span>
        </span>

        <label className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1 text-xs">
          <span className="font-mono tabular-nums text-fg-2">
            상호작용 컷 비중: {evaluation.interactionCutRatioPct}%
          </span>
          <input
            type="range"
            min={10}
            max={75}
            step={5}
            disabled={disabled}
            aria-label="회차당 상호작용 컷 비중 퍼센트"
            data-testid="bg3d-blender-interaction-cut-slider"
            value={evaluation.interactionCutRatioPct}
            onChange={(e) => onChangeInteractionCutRatioPct(Number(e.target.value))}
            className="w-28 accent-accent"
          />
        </label>
      </div>
    </section>
  );
}
