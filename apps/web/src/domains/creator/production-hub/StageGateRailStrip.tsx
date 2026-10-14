/**
 * 단계 합의 레일 스트립 — 진행 레일 바로 아래에 붙는 한 줄 합의 표시.
 *
 * 진행 레일(episode-pipeline-progress-rail)이 "지금 어느 단계인가"를 말하면,
 * 이 스트립은 게이트가 걸린 앞단 단계(기획·콘티·스케치)에 한해 "합의가
 * 어디까지 됐는가"를 같은 자리에 이어서 말한다. 레일 구간 자체를 고치지
 * 않기 위해 별도 부품으로 두고, 장착 위치만 레일 직하로 명세한다
 * (HOST_INSERTION_SPEC 참조).
 *
 * 게이트가 없는 회차에서는 아무것도 그리지 않는다 — 게이트 미지정을
 * "막힘"으로 위장하지 않기 위해서다. 어떤 칩도 링크를 막지 않는다.
 */
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  stageGateRailBadge,
  type StageGateSummary,
} from "./stage-consensus-gate-model";
import type { EpisodeStageState } from "./production-episode-stage";

export interface StageGateRailStripProps {
  /** 진행 레일과 같은 단계 상태 목록. 순서는 레일이 정하므로 여기서는 게이트 단계만 골라 쓴다. */
  readonly states: readonly EpisodeStageState[];
  readonly summary: StageGateSummary | null;
}

export function StageGateRailStrip({ states, summary }: StageGateRailStripProps) {
  const bt = useBilingual("StageGateRailStrip");
  if (!summary || summary.views.length === 0) return null;

  const gatedStates = states.flatMap((state) => {
    const badge = stageGateRailBadge(summary, state.id);
    return badge ? [{ state, badge }] : [];
  });
  if (gatedStates.length === 0) return null;

  return (
    <div
      data-stage-gate-rail-strip="true"
      className="mt-2 flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-card/95 px-3 py-2"
    >
      <span className="text-[0.7rem] font-bold text-fg-3">{bt("단계 합의", "Consensus")}</span>
      {gatedStates.map(({ state, badge }) => (
        <span
          key={state.id}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem]",
            badge.status === "approved" || badge.status === "approved-with-conditions"
              ? "border-line bg-accent-soft font-bold text-fg"
              : badge.status === "awaiting-lead"
                ? "border-accent bg-accent-soft text-fg"
                : "border-line bg-card text-fg-3",
          )}
        >
          <span>{bt(state.label.ko, state.label.en)}</span>
          <span>{bt(badge.label.ko, badge.label.en)}</span>
        </span>
      ))}
      {summary.publishBlockedBy.length > 0 ? (
        <span className="ml-auto text-[0.7rem] text-fg-3">
          {bt("합의 전에는 게시할 수 없어요", "Publishing waits for consensus")}
        </span>
      ) : null}
    </div>
  );
}
