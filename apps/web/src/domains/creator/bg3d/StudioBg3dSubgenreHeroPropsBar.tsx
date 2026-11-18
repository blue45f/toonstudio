import { Archive, CheckCircle2 } from "lucide-react";

import {
  SUBGENRE_HERO_PROPS,
  type SubgenreHeroPropEvaluation,
  type SubgenreHeroPropId,
} from "./studio-bg3d-subgenre-hero-props";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

export interface StudioBg3dSubgenreHeroPropsBarProps {
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly evaluation: SubgenreHeroPropEvaluation;
  readonly onSelectPropId: (id: SubgenreHeroPropId) => void;
}

/**
 * Unslop 9-Pass · Editor Chrome Design · Korean Typography 규격이 결합된
 * V31 세부 장르 서사 히어로 소품(사물함·수사 핀보드·각성 측정 비석) 퀵스왑 바.
 */
export function StudioBg3dSubgenreHeroPropsBar({
  disabled = false,
  disabledReason = "읽기 전용 상태에서는 세부 장르 소품을 전환할 수 없습니다",
  evaluation,
  onSelectPropId,
}: StudioBg3dSubgenreHeroPropsBarProps) {
  const unavailableTitle = disabled ? disabledReason : undefined;

  return (
    <div
      data-testid="bg3d-blender-v31-hero-props-bar"
      className="flex flex-col gap-2 border-t border-line pt-3 text-xs leading-[1.4] [word-break:keep-all] [overflow-wrap:break-word]"
    >
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-fg">
          <Archive
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-fg-2"
            aria-hidden
          />
          <span>
            세부 장르 히어로 소품 V31 (학원 사물함 · 느와르 수사보드 · 헌터 각성비석)
          </span>
        </span>
        <span
          data-testid="bg3d-blender-v31-drawer-count-badge"
          className="inline-flex min-h-7 items-center gap-2 rounded-md bg-raised px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span className="size-2 rounded-full bg-[#4cc38a]" aria-hidden />
          CC0 서랍 {evaluation.totalKitDrawersCount}종 · Playwright E2E 검증
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex items-center gap-3 rounded-lg bg-panel px-2.5 py-2 lg:col-span-5">
          <img
            src={evaluation.prop.previewUrl}
            alt={evaluation.prop.labelKo}
            loading="lazy"
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-md bg-[#141415] object-cover [mask-image:radial-gradient(closest-side,#000_84%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="block truncate font-medium text-fg">
              {evaluation.prop.labelKo}
            </span>
            <span
              data-testid="bg3d-blender-v31-prop-readout"
              className="mt-0.5 block truncate font-mono text-xs tabular-nums text-fg-3"
              title={evaluation.propSummaryKo}
            >
              {evaluation.propSummaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-7 lg:justify-end">
          {SUBGENRE_HERO_PROPS.map((item) => {
            const active = item.id === evaluation.prop.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                title={unavailableTitle}
                data-testid={`bg3d-blender-v31-prop-${item.id}`}
                onClick={() => onSelectPropId(item.id)}
                className={`min-h-8 rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums ${
                  active
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } disabled:cursor-not-allowed disabled:opacity-45 ${MOTION_PRESS}`}
              >
                {item.badgeKo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 rounded-lg bg-panel px-3 py-1.5">
        <span
          data-testid="bg3d-blender-v31-prop-roi-readout"
          className="inline-flex min-w-0 items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
        >
          <CheckCircle2
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-fg-3"
            aria-hidden
          />
          <span className="truncate" title={evaluation.propRoiSummaryKo}>
            {evaluation.propRoiSummaryKo}
          </span>
        </span>
      </div>
    </div>
  );
}
