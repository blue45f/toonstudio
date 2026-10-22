/**
 * "무엇이 달랐나" — 앵커와 후보의 특징 차이를 사람이 읽을 수 있는 항목으로 풀어 낸다.
 *
 * 이 모듈은 문장을 만들지 않는다. 항목 종류(`id`)와 변형(`variant`), 수치(`params`)만 돌려주고, 화면이 번역 키
 * `anchorLab.diff.<id>[.<variant>]` 로 문장을 만든다. 그래서 파일 이름 같은 사용자 값이 번역 원문에 섞이지 않는다.
 *
 * 설명은 "이미지 전체"의 통계 차이다. 머리·피부·의상 같은 부위를 가정하지 않으며, "어느 부위가 달랐다"고 말하지 않는다.
 * 아래 임계값은 합성 이미지로 시험해 사람이 정한 값이다(docs/features/anchor-consistency.md "휴리스틱 임계값").
 */

import { hueDifferenceDegrees, labHueDegrees } from "./anchor-color-lab";
import type { AnchorPairComparison } from "./anchor-consistency-compare";
import type { AnchorImageFeatures } from "./anchor-image-features";

export type AnchorDifferenceId =
  | "lightness"
  | "chroma"
  | "hue"
  | "palette-missing"
  | "palette-extra"
  | "subject-scale"
  | "proportion"
  | "position"
  | "silhouette"
  | "structure"
  | "near-duplicate"
  | "subject-not-separated";

export type AnchorDifferenceSeverity = "major" | "notice" | "info";

export interface AnchorDifference {
  readonly id: AnchorDifferenceId;
  readonly severity: AnchorDifferenceSeverity;
  /** 같은 심각도 안에서 정렬에 쓰는 크기(클수록 크게 다름). 단위는 항목마다 다르다. */
  readonly magnitude: number;
  /** 같은 id 안의 갈래(예: brighter/darker, larger/smaller). 번역 키의 마지막 구간이 된다. */
  readonly variant?: string;
  /** 문장에 끼울 값. 숫자와 #rrggbb 색 문자열만 담는다. */
  readonly params: Readonly<Record<string, number | string>>;
}

/** 사람이 정한 임계값. */
export const ANCHOR_DIFFERENCE_THRESHOLDS = Object.freeze({
  lightness: Object.freeze({ notice: 6, major: 14 }),
  chroma: Object.freeze({ notice: 8, major: 18, minChroma: 5 }),
  hue: Object.freeze({ notice: 25, major: 60, minChroma: 8 }),
  subjectScaleRatio: Object.freeze({ low: 0.75, high: 1 / 0.75 }),
  proportionRatio: Object.freeze({ notice: 1.25, major: 1.6 }),
  position: 0.15,
  silhouetteScore: Object.freeze({ notice: 0.45 }),
  structureSimilarity: 0.2,
  nearDuplicate: 0.9,
  maxItems: 8,
});

const SEVERITY_ORDER: Readonly<Record<AnchorDifferenceSeverity, number>> = Object.freeze({ major: 0, notice: 1, info: 2 });

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function severityByScale(value: number, notice: number, major: number): AnchorDifferenceSeverity | null {
  if (value >= major) return "major";
  return value >= notice ? "notice" : null;
}

function colorDifferences(anchor: AnchorImageFeatures, candidate: AnchorImageFeatures): AnchorDifference[] {
  const thresholds = ANCHOR_DIFFERENCE_THRESHOLDS;
  const out: AnchorDifference[] = [];
  const deltaL = candidate.color.meanL - anchor.color.meanL;
  const lightnessSeverity = severityByScale(Math.abs(deltaL), thresholds.lightness.notice, thresholds.lightness.major);
  if (lightnessSeverity) {
    out.push({
      id: "lightness",
      severity: lightnessSeverity,
      magnitude: Math.abs(deltaL),
      variant: deltaL > 0 ? "brighter" : "darker",
      params: { delta: round1(Math.abs(deltaL)), anchor: round1(anchor.color.meanL), candidate: round1(candidate.color.meanL) },
    });
  }
  const deltaC = candidate.color.meanChroma - anchor.color.meanChroma;
  const chromaPresent = Math.max(anchor.color.meanChroma, candidate.color.meanChroma) >= thresholds.chroma.minChroma;
  const chromaSeverity = chromaPresent ? severityByScale(Math.abs(deltaC), thresholds.chroma.notice, thresholds.chroma.major) : null;
  if (chromaSeverity) {
    out.push({
      id: "chroma",
      severity: chromaSeverity,
      magnitude: Math.abs(deltaC),
      variant: deltaC > 0 ? "more" : "less",
      params: { delta: round1(Math.abs(deltaC)), anchor: round1(anchor.color.meanChroma), candidate: round1(candidate.color.meanChroma) },
    });
  }
  const anchorHueStrength = Math.hypot(anchor.color.meanA, anchor.color.meanB);
  const candidateHueStrength = Math.hypot(candidate.color.meanA, candidate.color.meanB);
  if (Math.min(anchorHueStrength, candidateHueStrength) >= thresholds.hue.minChroma) {
    const degrees = hueDifferenceDegrees(
      labHueDegrees(anchor.color.meanA, anchor.color.meanB),
      labHueDegrees(candidate.color.meanA, candidate.color.meanB),
    );
    const hueSeverity = severityByScale(degrees, thresholds.hue.notice, thresholds.hue.major);
    if (hueSeverity) out.push({ id: "hue", severity: hueSeverity, magnitude: degrees, params: { degrees: Math.round(degrees) } });
  }
  return out;
}

function paletteDifferences(comparison: AnchorPairComparison): AnchorDifference[] {
  const out: AnchorDifference[] = [];
  const { missingInRight, missingInLeft } = comparison.detail.palette;
  for (const gap of missingInRight.slice(0, 2)) {
    out.push({
      id: "palette-missing",
      severity: gap.deltaE >= 35 ? "major" : "notice",
      magnitude: gap.deltaE,
      params: { hex: gap.hex, nearestHex: gap.nearestHex, percent: Math.round(gap.share * 100), deltaE: Math.round(gap.deltaE) },
    });
  }
  for (const gap of missingInLeft.slice(0, 2)) {
    out.push({
      id: "palette-extra",
      severity: gap.deltaE >= 35 ? "major" : "notice",
      magnitude: gap.deltaE,
      params: { hex: gap.hex, nearestHex: gap.nearestHex, percent: Math.round(gap.share * 100), deltaE: Math.round(gap.deltaE) },
    });
  }
  return out;
}

function shapeDifferences(anchor: AnchorImageFeatures, candidate: AnchorImageFeatures, comparison: AnchorPairComparison): AnchorDifference[] {
  const thresholds = ANCHOR_DIFFERENCE_THRESHOLDS;
  const out: AnchorDifference[] = [];
  const anchorShape = anchor.silhouette;
  const candidateShape = candidate.silhouette;
  if (!anchorShape || !candidateShape) return out;
  const scale = candidateShape.heightFrac / anchorShape.heightFrac;
  if (scale < thresholds.subjectScaleRatio.low || scale > thresholds.subjectScaleRatio.high) {
    out.push({
      id: "subject-scale",
      severity: "info",
      magnitude: Math.abs(Math.log(scale)),
      variant: scale > 1 ? "larger" : "smaller",
      params: { ratio: Math.round((scale > 1 ? scale : 1 / scale) * 10) / 10 },
    });
  }
  const aspectRatio = candidateShape.aspect / anchorShape.aspect;
  const aspectChange = aspectRatio >= 1 ? aspectRatio : 1 / aspectRatio;
  const aspectSeverity = severityByScale(aspectChange, thresholds.proportionRatio.notice, thresholds.proportionRatio.major);
  if (aspectSeverity) {
    out.push({
      id: "proportion",
      severity: aspectSeverity,
      magnitude: Math.log(aspectChange),
      variant: aspectRatio > 1 ? "wider" : "narrower",
      params: { anchor: Math.round(anchorShape.aspect * 100) / 100, candidate: Math.round(candidateShape.aspect * 100) / 100 },
    });
  }
  const dx = candidateShape.centerX - anchorShape.centerX;
  const dy = candidateShape.centerY - anchorShape.centerY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) >= thresholds.position) {
    out.push({
      id: "position",
      severity: "info",
      magnitude: Math.max(Math.abs(dx), Math.abs(dy)),
      params: { dxPercent: Math.round(dx * 100), dyPercent: Math.round(dy * 100) },
    });
  }
  const silhouetteScore = comparison.detail.silhouette?.score;
  if (silhouetteScore !== undefined && silhouetteScore < thresholds.silhouetteScore.notice) {
    out.push({
      id: "silhouette",
      severity: "notice",
      magnitude: 1 - silhouetteScore,
      params: { percent: Math.round(silhouetteScore * 100) },
    });
  }
  return out;
}

/**
 * 앵커 한 장과 후보 한 장의 차이 항목을 심각도·크기 순으로 돌려준다(최대 8개).
 * `comparison` 은 같은 두 특징으로 `compareAnchorFeatures` 를 호출한 결과여야 한다.
 */
export function describeAnchorDifferences(
  anchor: AnchorImageFeatures,
  candidate: AnchorImageFeatures,
  comparison: AnchorPairComparison,
): readonly AnchorDifference[] {
  const thresholds = ANCHOR_DIFFERENCE_THRESHOLDS;
  const items: AnchorDifference[] = [
    ...colorDifferences(anchor, candidate),
    ...paletteDifferences(comparison),
    ...shapeDifferences(anchor, candidate, comparison),
  ];
  if (comparison.limits.includes("anchor-not-separated") || comparison.limits.includes("candidate-not-separated")) {
    items.push({
      id: "subject-not-separated",
      severity: "info",
      magnitude: 0,
      variant: comparison.limits.includes("anchor-not-separated") && comparison.limits.includes("candidate-not-separated")
        ? "both"
        : comparison.limits.includes("anchor-not-separated") ? "anchor" : "candidate",
      params: {},
    });
  }
  const structureSimilarity = comparison.similarities.structure;
  const { color, palette, structure } = comparison.similarities;
  if (color !== null && palette !== null && structureSimilarity !== null
    && color >= thresholds.nearDuplicate && palette >= thresholds.nearDuplicate && structure !== null && structure >= thresholds.nearDuplicate) {
    items.push({ id: "near-duplicate", severity: "info", magnitude: structure, params: { distance: comparison.detail.structure.distance } });
  } else if (structureSimilarity !== null && structureSimilarity < thresholds.structureSimilarity) {
    items.push({
      id: "structure",
      severity: "info",
      magnitude: 1 - structureSimilarity,
      params: { distance: comparison.detail.structure.distance, bits: 64 },
    });
  }
  return Object.freeze(
    items
      .sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] || right.magnitude - left.magnitude)
      .slice(0, thresholds.maxItems)
      .map((item) => Object.freeze({ ...item, params: Object.freeze({ ...item.params }) })),
  );
}

