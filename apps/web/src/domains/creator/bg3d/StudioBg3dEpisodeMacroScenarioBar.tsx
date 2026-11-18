import { Clapperboard, Play, Timer } from "lucide-react";

import {
  EPISODE_MACRO_SCENARIOS,
  type EpisodeMacroScenarioEvaluation,
  type EpisodeMacroScenarioId,
  type EpisodeMacroScenarioSpec,
} from "./studio-bg3d-episode-macro-scenarios";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

export interface StudioBg3dEpisodeMacroScenarioBarProps {
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly evaluation: EpisodeMacroScenarioEvaluation;
  readonly onRunScenario: (scenario: EpisodeMacroScenarioSpec) => void;
  readonly onSelectScenarioId: (id: EpisodeMacroScenarioId) => void;
}

/**
 * Unslop 9-Pass · Editor Chrome Design · Korean Typography 규격이 결합된
 * V30 8대 웹툰 장르(학원물·느와르·헌터 게이트 포함) 원클릭 자동화 시나리오 실행 바.
 */
export function StudioBg3dEpisodeMacroScenarioBar({
  disabled = false,
  disabledReason = "읽기 전용 상태에서는 자동화 시나리오를 실행할 수 없습니다",
  evaluation,
  onRunScenario,
  onSelectScenarioId,
}: StudioBg3dEpisodeMacroScenarioBarProps) {
  const unavailableTitle = disabled ? disabledReason : undefined;

  return (
    <div
      data-testid="bg3d-blender-v30-macro-scenario-bar"
      className="flex flex-col gap-2 border-t border-line pt-3 text-xs leading-[1.4] [word-break:keep-all] [overflow-wrap:break-word]"
    >
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <Clapperboard
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-fg-2"
            aria-hidden
          />
          <span>
            8대 장르 확장 세트 V30 (학원·느와르·헌터) · 원클릭 회차 마스터 자동화 시나리오
          </span>
        </span>
        <span
          data-testid="bg3d-blender-v30-genre-count-badge"
          className="inline-flex min-h-7 items-center gap-2 rounded-md bg-raised px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span className="size-2 rounded-full bg-[#4cc38a]" aria-hidden />
          공통 기준선 {evaluation.totalSupportedGenres}대 장르 호환 · 실행{" "}
          {evaluation.executedRunCount}회
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex items-center gap-3 rounded-lg bg-panel px-2.5 py-2 lg:col-span-5">
          <img
            src={evaluation.scenario.previewUrl}
            alt={evaluation.scenario.labelKo}
            loading="lazy"
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-md bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="block truncate font-medium text-fg">
              {evaluation.scenario.labelKo}
            </span>
            <span
              data-testid="bg3d-blender-v30-scenario-readout"
              className="mt-0.5 block truncate font-mono text-xs tabular-nums text-fg-3"
              title={evaluation.scenarioSummaryKo}
            >
              {evaluation.scenarioSummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
          {EPISODE_MACRO_SCENARIOS.map((item) => {
            const active = item.id === evaluation.scenario.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                title={unavailableTitle}
                data-testid={`bg3d-blender-v30-scenario-${item.id}`}
                onClick={() => onSelectScenarioId(item.id)}
                className={`min-h-8 rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums ${
                  active
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } disabled:cursor-not-allowed disabled:opacity-45 ${MOTION_PRESS}`}
              >
                {item.genreBadgeKo}
              </button>
            );
          })}
          <button
            type="button"
            disabled={disabled}
            title={unavailableTitle}
            data-testid="bg3d-blender-v30-run-macro-btn"
            onClick={() => onRunScenario(evaluation.scenario)}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-accent bg-raised px-3 py-1 font-mono text-xs font-medium tabular-nums text-fg hover:bg-card disabled:cursor-not-allowed disabled:opacity-45 ${MOTION_PRESS}`}
          >
            <Play size={16} strokeWidth={1.5} aria-hidden />
            시나리오 일괄 조립 (2분)
          </button>
        </div>
      </div>

      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 rounded-lg bg-panel px-3 py-1.5">
        <span
          data-testid="bg3d-blender-v30-macro-roi-readout"
          className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
        >
          <Timer size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <span className="truncate" title={evaluation.macroRoiSummaryKo}>
            {evaluation.macroRoiSummaryKo}
          </span>
        </span>
      </div>
    </div>
  );
}
