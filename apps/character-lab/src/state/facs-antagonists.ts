/**
 * FACS 길항(antagonist) 관계와 중립 표정 이완 규칙.
 * 사용자가 명시한 표정(예: mouthFrown)이 활성일 때 화풍 중립 표정(예: mouthSmile)의 길항 유닛이
 * 동시에 켜져 얼굴이 찌그러지지 않도록 억제한다.
 */
import { FACS_UNITS } from "../contracts";

import type { ExpressionWeights, FacsUnit } from "../contracts";

/** FACS 유닛별 길항 유닛 목록(대칭 관계) */
export const FACS_ANTAGONISTS: Readonly<Partial<Record<FacsUnit, readonly FacsUnit[]>>> = Object.freeze({
  mouthSmile: ["mouthFrown"],
  mouthFrown: ["mouthSmile"],
  browDown: ["browInnerUp", "browOuterUp"],
  browInnerUp: ["browDown"],
  browOuterUp: ["browDown"],
  eyeWide: ["eyeBlinkLeft", "eyeBlinkRight", "eyeSquint"],
  eyeBlinkLeft: ["eyeWide"],
  eyeBlinkRight: ["eyeWide"],
  eyeSquint: ["eyeWide"],
  jawOpen: ["mouthPress"],
  mouthPress: ["jawOpen"],
});

/**
 * `active` 표정(또는 단일 우세 유닛)에서 길항 유닛이 0보다 크면 `base`의 해당 유닛을 0으로 이완(제거)한다.
 */
export function relaxAntagonists(base: ExpressionWeights, active: ExpressionWeights | FacsUnit): ExpressionWeights {
  const activeMap: ExpressionWeights = typeof active === "string" ? { [active]: 1 } : active;
  const result: ExpressionWeights = {};
  for (const unit of FACS_UNITS) {
    const value = base[unit] ?? 0;
    if (!Number.isFinite(value) || value <= 0) continue;
    const antagonists = FACS_ANTAGONISTS[unit] ?? [];
    const suppressed = antagonists.some((antagonist) => {
      const actVal = activeMap[antagonist] ?? 0;
      return Number.isFinite(actVal) && actVal > 0;
    });
    if (!suppressed) {
      result[unit] = Math.min(1, value);
    }
  }
  return result;
}
