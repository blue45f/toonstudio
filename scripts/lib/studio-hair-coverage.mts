/**
 * 캐릭터 셰이퍼 헤어 덮임 판정(순수 함수). 브라우저 증거 스크립트
 * `scripts/verify-studio-character-hair-coverage.mts` 가 잰 값을 여기서 판정한다.
 *
 * 값 = '헤어 없음' 렌더 대비 프리셋 렌더에서 바뀐 픽셀 비율(채널 차 합 > 40). 정수리 띠(뷰포트 위 35%)를
 * 본다. A-01 민머리 결함(캡이 두피 속에 묻힘)에서는 단발·픽시·포니테일·번처럼 옆·뒤 가닥이 짧은
 * 프리셋이 이 띠를 거의 바꾸지 못했다(2026-10-23 before 시트: 0~1%).
 */

export type HairCoverageView = "front" | "back";

export interface HairCoverageSample {
  readonly model: string;
  readonly preset: string;
  readonly view: HairCoverageView;
  /** 정수리 띠(위 35%)에서 바뀐 픽셀 비율 0~1. */
  readonly crown: number;
}

export interface HairCoverageThresholds {
  readonly front: number;
  readonly back: number;
}

/** 기본 임계. 근거는 `verify-studio-character-hair-coverage.mts` 머리말의 before/after 실측. */
export const DEFAULT_HAIR_COVERAGE_THRESHOLDS: HairCoverageThresholds = Object.freeze({
  front: 0.05,
  back: 0.05,
});

export interface HairCoverageVerdict {
  readonly passed: boolean;
  readonly checked: number;
  readonly failures: readonly (HairCoverageSample & { readonly threshold: number })[];
}

export function evaluateHairCoverage(
  samples: readonly HairCoverageSample[],
  thresholds: HairCoverageThresholds = DEFAULT_HAIR_COVERAGE_THRESHOLDS,
): HairCoverageVerdict {
  const failures = samples
    .filter((sample) => !(Number.isFinite(sample.crown) && sample.crown >= thresholds[sample.view]))
    .map((sample) => ({ ...sample, threshold: thresholds[sample.view] }));
  return { passed: samples.length > 0 && failures.length === 0, checked: samples.length, failures };
}

/** 환경 변수 임계(백분율 문자열, 예: "5")를 읽는다. 잘못된 값은 기본값을 쓴다. */
export function readHairCoverageThreshold(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const percent = Number(raw);
  return Number.isFinite(percent) && percent > 0 && percent < 100 ? percent / 100 : fallback;
}
