/**
 * 재배열 설정과 계획 결과 — 화면(PanelReflowStep)과 흐름(PanelReflowFlow)이 함께 쓰는 순수 계산.
 */

import { planPanelReflow, buildReflowLossReport, PANEL_REFLOW_STANDARD_GAP, type PanelReflowPlan, type PanelReflowWidth, type ReflowLossItem, type ReflowScaleMode } from "../panel-reflow-plan";

import type { ImageSize } from "../panel-canvas-geometry";
import type { EditablePanel } from "../panel-detect-edit";
import type { PanelDetectResult } from "../panel-detect-types";

export interface ReflowSettings {
  readonly targetWidth: PanelReflowWidth;
  readonly gap: number;
  readonly scaleMode: ReflowScaleMode;
}

export const DEFAULT_REFLOW_SETTINGS: ReflowSettings = Object.freeze({
  targetWidth: 720,
  gap: PANEL_REFLOW_STANDARD_GAP,
  scaleMode: "fit-width",
});

export type PlanOutcome =
  | { readonly ok: true; readonly plan: PanelReflowPlan; readonly loss: readonly ReflowLossItem[]; readonly signature: string }
  | { readonly ok: false; readonly error: unknown };

/** 순서가 정해진 컷과 설정으로 재배열 계획과 손실 보고를 만든다. 계획이 거절되면(너무 긴 컷 등) 이유를 돌려준다. */
export function computeReflowOutcome(
  panels: readonly EditablePanel[],
  settings: ReflowSettings,
  result: PanelDetectResult,
  image: ImageSize,
): PlanOutcome {
  try {
    const plan = planPanelReflow(panels.map((panel) => ({ id: panel.id, x: panel.x, y: panel.y, width: panel.width, height: panel.height })), settings);
    const loss = buildReflowLossReport({
      plan,
      sourceWidth: image.width,
      sourceHeight: image.height,
      format: "png",
      undetectableCount: result.undetectable.length,
      ignoredCount: result.ignored.length,
      lowConfidenceCount: panels.filter((panel) => panel.confidence !== null && panel.confidence < 0.5).length,
      transparentSource: result.gutter.kind === "transparent",
    });
    return { ok: true, plan, loss, signature: loss.map((item) => `${item.code}:${JSON.stringify(item.values)}`).join("|") };
  } catch (error) {
    return { ok: false, error };
  }
}
