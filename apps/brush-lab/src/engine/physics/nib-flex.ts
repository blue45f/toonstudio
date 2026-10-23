import type { NibSpec } from "./physics-model";

/**
 * 닙 벌어짐 2차계. g'' = ωn²·(target − g) − 2ζωn·g'.
 * - `stiffness` = ωn(rad/s), `damping` = ζ(0이면 임계 감쇠 1). 예: G펜 ωn ≈ 180 rad/s(≈ 2π·30).
 * - semi-implicit Euler, 내부 substep ≤ 2 ms(ωn·dt ≪ 2 안정 조건).
 * - target = clamp(p − threshold, 0, 1)·gapMax, 폭 = baseWidth + gap·widthGain.
 */

const f = Math.fround;
const MAX_SUBSTEP_MS = 2;

export interface NibFlexState {
  /** [0] gap(px), [1] gap 속도(px/s). */
  data: Float32Array;
}

export function nibTarget(pressure: number, spec: NibSpec): number {
  const t = pressure - spec.threshold;
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return f(c * spec.gapMax);
}

/** 획 시작 압력으로 정상 상태 초기화(첫 dab 지연 0). */
export function createNibFlexState(spec: NibSpec, initialPressure = 0): NibFlexState {
  const data = new Float32Array(2);
  data[0] = nibTarget(initialPressure, spec);
  data[1] = 0;
  return { data };
}

export interface NibOutput {
  nibGap: number;
  rx: number;
  ry: number;
}

export function stepNibFlex(
  state: NibFlexState,
  sample: { pressure: number },
  dtMs: number,
  spec: NibSpec,
): NibOutput {
  const target = nibTarget(sample.pressure, spec);
  const wn = spec.stiffness;
  const zeta = spec.damping > 0 ? spec.damping : 1;
  const steps = Math.max(1, Math.ceil(dtMs / MAX_SUBSTEP_MS));
  const h = dtMs / steps / 1000;
  let g = state.data[0] ?? 0;
  let v = state.data[1] ?? 0;
  for (let i = 0; i < steps; i += 1) {
    const acc = wn * wn * (target - g) - 2 * zeta * wn * v;
    v = f(v + acc * h);
    g = f(g + v * h);
  }
  if (g < 0) {
    g = 0;
    v = 0;
  }
  state.data[0] = g;
  state.data[1] = v;
  const width = f(spec.baseWidth + g * spec.widthGain);
  return { nibGap: g, rx: f(width / 2), ry: f((width * spec.aspect) / 2) };
}

export type MangaNibPersonalityId =
  | "g-pen"
  | "maru-pen"
  | "kabura-pen"
  | "school-pen"
  | "fude-brush-pen";

export interface MangaNibPersonalityProfile {
  readonly id: MangaNibPersonalityId;
  readonly labelKo: string;
  readonly spec: NibSpec;
  /** 금속 펜촉 두 갈래(Tine) 사이 모세관 잉크 막이 끊어져 철길(Railroading) 현상이 시작되는 벌어짐 비율 (0..1). */
  readonly railroadThresholdRatio: number;
  /** 1회 잉크 딥(Dip) 시 머금는 유효 스트로크 길이 용량(px). */
  readonly reservoirCapacityPx: number;
  /** 선화 개성 요약(한글). */
  readonly characterSummaryKo: string;
}

/**
 * 만화·웹툰 대표 딥펜 5종의 물리 개성 프로파일.
 * G펜(강한 억양·철길 갈라짐), 마루펜(극세선 탄성), 카부라/스푼펜(균일한 외곽선),
 * 스쿨펜(경쾌한 제도·효과선), 붓펜(넓은 동적 폭·고속 갈필)의 고유 기계적 특성을 정의한다.
 */
export const MANGA_NIB_PERSONALITY_PROFILES: Readonly<
  Record<MangaNibPersonalityId, MangaNibPersonalityProfile>
> = Object.freeze({
  "g-pen": {
    id: "g-pen",
    labelKo: "G펜 (다이나믹 억양)",
    spec: { stiffness: 180, damping: 0.65, threshold: 0.04, gapMax: 6.5, widthGain: 1.15, baseWidth: 0.55, aspect: 0.92 },
    railroadThresholdRatio: 0.72,
    reservoirCapacityPx: 1400,
    characterSummaryKo: "낮은 강성과 넓은 벌어짐으로 필압에 따른 굵기 대비가 극적이며 과압 시 펜촉 중앙 잉크 갈라짐(Railroading)이 나타난다.",
  },
  "maru-pen": {
    id: "maru-pen",
    labelKo: "마루펜 (극세 디테일)",
    spec: { stiffness: 340, damping: 0.88, threshold: 0.02, gapMax: 2.1, widthGain: 0.9, baseWidth: 0.32, aspect: 1.0 },
    railroadThresholdRatio: 0.85,
    reservoirCapacityPx: 950,
    characterSummaryKo: "높은 고유진동수로 빠른 복원력과 머리카락·눈동자 묘사에 적합한 날카로운 극세선을 제공한다.",
  },
  "kabura-pen": {
    id: "kabura-pen",
    labelKo: "카부라/스푼펜 (균일 칸선·외곽선)",
    spec: { stiffness: 265, damping: 0.94, threshold: 0.06, gapMax: 3.0, widthGain: 0.75, baseWidth: 0.85, aspect: 0.96 },
    railroadThresholdRatio: 0.92,
    reservoirCapacityPx: 1850,
    characterSummaryKo: "높은 감쇠비로 손떨림이나 급격한 압력 변화에도 일정한 선 굵기를 유지한다.",
  },
  "school-pen": {
    id: "school-pen",
    labelKo: "스쿨펜 (배경·집중선)",
    spec: { stiffness: 300, damping: 0.82, threshold: 0.05, gapMax: 2.6, widthGain: 0.85, baseWidth: 0.5, aspect: 0.95 },
    railroadThresholdRatio: 0.88,
    reservoirCapacityPx: 1500,
    characterSummaryKo: "단단한 펜촉 응답으로 기계적 배경 작화와 속도선에서 균일하고 경쾌한 타격감을 낸다.",
  },
  "fude-brush-pen": {
    id: "fude-brush-pen",
    labelKo: "붓펜 (연성 엘라스토머)",
    spec: { stiffness: 115, damping: 0.58, threshold: 0.02, gapMax: 9.2, widthGain: 1.35, baseWidth: 0.4, aspect: 0.78 },
    railroadThresholdRatio: 0.64,
    reservoirCapacityPx: 2200,
    characterSummaryKo: "매우 넓은 최대 벌어짐과 긴 테이퍼 여운으로 캘리그라피·흑백 베타 채움·동양적 필치를 구현한다.",
  },
});

export interface DipPenRailroadingOutput {
  /** 펜촉 두 갈래 분리도 [0, 1]. 0이면 단일 잉크 줄기, 1이면 완전한 이중 레일. */
  readonly splitRatio: number;
  /** 횡단 중심부(crossPos = 0)의 잉크 밀도 [0, 1]. */
  readonly centerAlpha: number;
  /** 양쪽 금속 갈래(Tine) 끝단 트랙의 잉크 밀도 [0, 1]. */
  readonly outerTrackAlpha: number;
  /** 주어진 횡단 위치 crossPos ∈ [-1, 1]에서의 최종 단면 알파 [0, 1]. */
  readonly crossSectionAlpha: number;
}

/**
 * 딥펜 과압 시 두 금속 갈래(Tine) 사이 모세관 잉크 막이 찢어지며 양쪽 가장자리로만 잉크가 흐르는
 * 철길 현상(Railroading / Tine Split) 단면 알파 프로파일을 계산한다.
 */
export function evaluateDipPenRailroadingProfile(
  nibGap: number,
  gapMax: number,
  railroadThresholdRatio = 0.72,
  crossPos = 0,
): DipPenRailroadingOutput {
  const safeGapMax = Math.max(1e-4, gapMax);
  const gapRatio = Math.max(0, Math.min(1.5, nibGap / safeGapMax));
  const threshold = Math.max(0.2, Math.min(0.98, railroadThresholdRatio));
  const splitRatio =
    gapRatio <= threshold
      ? 0
      : f(Math.min(1, (gapRatio - threshold) / Math.max(0.05, 1 - threshold)));

  const centerAlpha = f(Math.max(0.08, 1 - splitRatio * 0.82));
  const outerTrackAlpha = f(Math.min(1, 0.88 + splitRatio * 0.12));

  const absX = Math.min(1, Math.abs(crossPos));
  // Tine 피크는 |crossPos| ≈ 0.72 부근에 형성
  const tinePeakDist = Math.abs(absX - 0.72);
  const tineRidge = Math.exp(-(tinePeakDist * tinePeakDist) / 0.045);
  const intactProfile = Math.cos(absX * Math.PI * 0.45);
  const splitProfile = centerAlpha * (1 - absX * 0.5) + splitRatio * tineRidge * (outerTrackAlpha - centerAlpha * 0.5);
  const rawCross = intactProfile * (1 - splitRatio) + splitProfile * splitRatio;

  return {
    splitRatio,
    centerAlpha,
    outerTrackAlpha,
    crossSectionAlpha: f(Math.max(0, Math.min(1, rawCross))),
  };
}

export interface DipPenReservoirOutput {
  readonly inkRemainingRatio: number;
  readonly flowScale: number;
  readonly widthScale: number;
}

/**
 * 딥펜의 잉크 저장소(Reservoir) 소모 모델.
 * 획 이동 거리와 누적 필압에 따라 잔여 잉크량을 추적하며, 잉크가 소진될수록
 * 유량과 선폭이 자연스럽게 가늘어지는 물리적 감쇠를 반환한다.
 */
export function evaluateDipPenReservoirFlow(
  distanceTraveledPx: number,
  reservoirCapacityPx = 1400,
  pressure = 0.6,
): DipPenReservoirOutput {
  const dist = Math.max(0, Number.isFinite(distanceTraveledPx) ? distanceTraveledPx : 0);
  const cap = Math.max(50, Number.isFinite(reservoirCapacityPx) ? reservoirCapacityPx : 1400);
  const p = Math.max(0, Math.min(1, Number.isFinite(pressure) ? pressure : 0.6));
  const effectiveDrain = dist * (0.55 + 0.75 * p);
  const inkRemainingRatio = f(Math.exp(-effectiveDrain / cap));
  const flowScale = f(0.28 + 0.72 * Math.pow(inkRemainingRatio, 0.65));
  const widthScale = f(0.62 + 0.38 * inkRemainingRatio);
  return {
    inkRemainingRatio,
    flowScale,
    widthScale,
  };
}

