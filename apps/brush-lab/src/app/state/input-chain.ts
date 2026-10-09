import { createCornerGateStage } from "../../engine/input/stages/corner-gate";
import { createLazyBrushStageFromPct } from "../../engine/input/stages/lazy-brush";
import { createPenSpringStageFromPct } from "../../engine/input/stages/pen-spring";

import { DEFAULT_STABILIZER_PCT } from "./draw-store";

import type { DrawState } from "./draw-store";
import type { RawStage } from "../../engine/input/stages/raw-stage";

/**
 * 그리기 화면의 입력 방식 선택 → `RawStage` 체인. 구조: 포인터 → (마우스 압력 시뮬레이션) → **이 체인** → 레인(안쪽 Sumi 1€ 기본 경로).
 * 1€·끔은 단계가 없다(`null`): 1€는 레인 안쪽 기본 경로가 그대로 처리하고, 끔은 엔진 1€도 0으로 둔다(`draw-program.ts`).
 */
export type DrawInputSelection = Pick<DrawState, "stabilizerMode" | "stabilizerPct" | "cornerGate">;

/** 방식별 슬라이더 값(0..100): 사용자가 정하지 않았으면 방식 기본값. 기본값이 없는 방식(1€·끔)은 null. */
export function effectiveStabilizerPct(mode: DrawState["stabilizerMode"], pct: number | null): number | null {
  return pct ?? DEFAULT_STABILIZER_PCT[mode];
}

/** 현재 선택에 맞는 단계 체인. 단계가 필요 없으면 null. 코너 게이트가 켜져 있으면 지연형 단계를 게이트로 감싼다. */
export function buildInputStage(sel: DrawInputSelection): RawStage | null {
  if (sel.stabilizerMode !== "lazy-brush" && sel.stabilizerMode !== "pen-spring") return null;
  const pct = effectiveStabilizerPct(sel.stabilizerMode, sel.stabilizerPct) ?? 0;
  const inner = sel.stabilizerMode === "lazy-brush" ? createLazyBrushStageFromPct(pct) : createPenSpringStageFromPct(pct);
  return sel.cornerGate ? createCornerGateStage(inner) : inner;
}
