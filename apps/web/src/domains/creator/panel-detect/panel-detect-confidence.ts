/**
 * 신뢰도 점수 — 컷 하나와 결과 전체의 0~1 점수. 결정적이고 설명 가능한 공식만 쓴다.
 *
 *   separation  네 변이 얼마나 또렷한 여백으로 분리됐는가(여백 두께 ÷ 최소 두께의 2배, 바깥 여백, 가장자리 접촉)
 *   content     컷 안 내용 픽셀 밀도 ÷ 3%  (거의 빈 조각은 점수를 깎는다)
 *   size        페이지 대비 면적 ÷ 1.2%     (아주 작은 조각은 점수를 깎는다)
 *   raw         separation^0.6 × content^0.25 × size^0.15
 *   penalty     겹침 의심 ×0.6, 여백 가로막힘 의심 ×0.65, 최대 깊이 도달 ×0.75, 여백 없음 ×0.5
 *   confidence  min(0.99, raw × penalty)  — 100% 확신은 주장하지 않는다.
 * 전체 신뢰도는 컷 면적 가중 평균에, 검출 불가 영역 비중만큼(최대 70%) 감점한다.
 */

import { panelDetectConfidenceLevel, type PanelConfidenceLevel, type PanelWarningCode } from "./panel-detect-types";

export type PanelSideKind = "gap" | "margin" | "bleed";

export interface PanelSide {
  readonly kind: PanelSideKind;
  /** 분석 픽셀. bleed 면 0. */
  readonly width: number;
}

export interface PanelSides {
  readonly top: PanelSide;
  readonly bottom: PanelSide;
  readonly left: PanelSide;
  readonly right: PanelSide;
}

export interface PanelConfidenceInput {
  readonly sides: PanelSides;
  /** 분석 픽셀 단위 면적. */
  readonly area: number;
  readonly imageArea: number;
  /** 컷 안 내용 픽셀 ÷ 면적. */
  readonly inkDensity: number;
  readonly minGap: number;
  readonly warnings: readonly PanelWarningCode[];
}

const WARNING_PENALTY: Readonly<Partial<Record<PanelWarningCode, number>>> = Object.freeze({
  "overlap-suspected": 0.6,
  "bridged-gutter-suspected": 0.65,
  "max-depth-reached": 0.75,
  "no-gutter-found": 0.5,
});

const MAX_CONFIDENCE = 0.99;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function panelSideScore(side: PanelSide, minGap: number): number {
  if (side.kind === "bleed") return 0.75;
  if (side.kind === "gap") return clamp(side.width / (2 * minGap), 0.4, 1);
  return side.width >= minGap ? 1 : 0.7 + 0.3 * (side.width / minGap);
}

export interface PanelConfidenceScore {
  readonly confidence: number;
  readonly level: PanelConfidenceLevel;
}

export function scorePanelConfidence(input: PanelConfidenceInput): PanelConfidenceScore {
  const { sides, minGap } = input;
  const separation = (
    panelSideScore(sides.top, minGap)
    + panelSideScore(sides.bottom, minGap)
    + panelSideScore(sides.left, minGap)
    + panelSideScore(sides.right, minGap)
  ) / 4;
  const content = clamp(input.inkDensity / 0.03, 0, 1);
  const size = clamp(input.area / Math.max(1, input.imageArea) / 0.012, 0, 1);
  const raw = separation ** 0.6 * content ** 0.25 * size ** 0.15;
  let penalty = 1;
  for (const warning of input.warnings) penalty *= WARNING_PENALTY[warning] ?? 1;
  const confidence = round3(clamp(raw * penalty, 0, MAX_CONFIDENCE));
  return { confidence, level: panelDetectConfidenceLevel(confidence) };
}

export interface OverallConfidenceInput {
  readonly panelAreas: readonly number[];
  readonly panelConfidences: readonly number[];
  readonly undetectableArea: number;
}

export function scoreOverallConfidence(input: OverallConfidenceInput): PanelConfidenceScore {
  const totalArea = input.panelAreas.reduce((sum, area) => sum + area, 0);
  if (totalArea <= 0) return { confidence: 0, level: "low" };
  let weighted = 0;
  for (let i = 0; i < input.panelAreas.length; i += 1) {
    weighted += input.panelAreas[i] * input.panelConfidences[i];
  }
  const undetectableShare = input.undetectableArea / (totalArea + input.undetectableArea);
  const confidence = round3(clamp((weighted / totalArea) * (1 - 0.7 * undetectableShare), 0, MAX_CONFIDENCE));
  return { confidence, level: panelDetectConfidenceLevel(confidence) };
}
