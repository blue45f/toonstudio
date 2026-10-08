import { EXPERIMENTAL_BADGE_LABEL, experimentalDescription, isExperimental } from "../state/lane-maturity";

import type { LaneDescriptor } from "../../lanes/lane";

export interface ExperimentalMarkProps {
  desc: Pick<LaneDescriptor, "id" | "maturity"> | null;
}

/** 실험 레인 배지. 안정 레인이면 아무것도 그리지 않는다. */
export function ExperimentalBadge({ desc }: ExperimentalMarkProps) {
  if (!isExperimental(desc)) return null;
  return (
    <span className="lab-badge lab-badge--experimental" data-testid="lab-experimental-badge" title="실험 레인 — 인증 판정 집계에서 제외">
      {EXPERIMENTAL_BADGE_LABEL}
    </span>
  );
}

/** 실험 레인의 검증 범위·한계 설명 문단. 안정 레인이면 null. */
export function ExperimentalNote({ desc }: ExperimentalMarkProps) {
  const text = experimentalDescription(desc);
  if (text === null) return null;
  return (
    <p className="lab-muted lab-experimental-note" role="note" data-testid="lab-experimental-note">
      <strong>{EXPERIMENTAL_BADGE_LABEL} 레인.</strong> {text}
    </p>
  );
}
