/**
 * Wave 157 — 35mm 풀프레임 광학 렌즈 화각·배경 압축 & 박렌즈 피사계 심도(DoF/CoC) 커널.
 *
 * - 7종 시네마·웹툰 표준 초점거리(18·24·35·50·85·135·200mm) 화각 계산
 * - 동일 피사체 화면 점유율 고정 시 카메라 거리 `d_subject` 및 배경 압축률 정밀 증명
 * - 박렌즈(Thin-Lens) 과초점 거리(`H`), 근/원 선명 한계(`Dn`/`Df`), 임의 거리 착란원(`blurCircleMm`) 산출
 */

import {
  FULL_FRAME_35MM_SENSOR,
  STANDARD_FOCAL_LENGTHS_MM,
  type BokehSeparationGrade,
  type CinemaLensPreset,
  type DepthOfFieldInput,
  type DepthOfFieldResult,
  type FocalBackgroundCompressionInput,
  type FocalBackgroundCompressionResult,
  type LensFieldOfView,
  type SensorDimensionsMm,
  type StandardFocalLengthMm,
} from "./shot-framing-types";

const RAD_TO_DEG = 180 / Math.PI;
const DEFAULT_SUBJECT_HEIGHT_M = 1.7;
const DEFAULT_SUBJECT_FILL_RATIO = 0.6;
const DEFAULT_REFERENCE_FOCAL_MM = 24;

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = Math.pow(10, digits);
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 35mm 풀프레임(또는 사용자 지정 센서) 기준 직선 투영 렌즈의 수평·수직·대각 화각(deg)을 계산한다.
 *
 * 공식: `FOV = 2 * atan(sensorDimension / (2 * focalLength)) * (180 / PI)`
 */
export function computeLensFieldOfView(
  focalLengthMm: number,
  sensor: SensorDimensionsMm = FULL_FRAME_35MM_SENSOR,
): LensFieldOfView {
  const f = clampFinite(focalLengthMm, 4, 2000, 50);
  const w = clampFinite(sensor.widthMm, 1, 200, FULL_FRAME_35MM_SENSOR.widthMm);
  const h = clampFinite(sensor.heightMm, 1, 200, FULL_FRAME_35MM_SENSOR.heightMm);
  const diag = Math.sqrt(w * w + h * h);

  const hfovDeg = 2 * Math.atan(w / (2 * f)) * RAD_TO_DEG;
  const vfovDeg = 2 * Math.atan(h / (2 * f)) * RAD_TO_DEG;
  const dfovDeg = 2 * Math.atan(diag / (2 * f)) * RAD_TO_DEG;

  return {
    focalLengthMm: roundTo(f, 3),
    sensorWidthMm: roundTo(w, 3),
    sensorHeightMm: roundTo(h, 3),
    sensorDiagonalMm: roundTo(diag, 4),
    hfovDeg: roundTo(hfovDeg, 4),
    vfovDeg: roundTo(vfovDeg, 4),
    dfovDeg: roundTo(dfovDeg, 4),
  };
}

interface LensPresetBlueprint {
  readonly focalLengthMm: StandardFocalLengthMm;
  readonly labelKo: string;
  readonly categoryKo: string;
  readonly perspectiveFeelKo: string;
  readonly typicalUseKo: string;
  readonly recommendedFNumber: number;
}

const LENS_PRESET_BLUEPRINTS: readonly LensPresetBlueprint[] = [
  {
    focalLengthMm: 18,
    labelKo: "18mm 초광각",
    categoryKo: "초광각",
    perspectiveFeelKo: "강한 원근 과장과 공간 확장",
    typicalUseKo: "웅장한 배경 오프닝·급박한 액션 추격 컷",
    recommendedFNumber: 5.6,
  },
  {
    focalLengthMm: 24,
    labelKo: "24mm 광각",
    categoryKo: "광각",
    perspectiveFeelKo: "인물과 주변 공간의 거리감 강조",
    typicalUseKo: "상황 설명·공간 동선 제시·군상 컷",
    recommendedFNumber: 4.0,
  },
  {
    focalLengthMm: 35,
    labelKo: "35mm 준광각",
    categoryKo: "준광각",
    perspectiveFeelKo: "자연스러운 현장감과 배경 맥락 유지",
    typicalUseKo: "일상 대화·2인 투샷·웹툰 기본 서사 컷",
    recommendedFNumber: 2.8,
  },
  {
    focalLengthMm: 50,
    labelKo: "50mm 표준",
    categoryKo: "표준",
    perspectiveFeelKo: "사람 시야에 가까운 왜곡 없는 원근",
    typicalUseKo: "감정선 중심 대화·안정적인 바스트·웨이스트 샷",
    recommendedFNumber: 2.0,
  },
  {
    focalLengthMm: 85,
    labelKo: "85mm 준망원",
    categoryKo: "준망원",
    perspectiveFeelKo: "안면 왜곡 억제와 부드러운 배경 압축",
    typicalUseKo: "인물 클로즈업·로맨스 감정 정점 컷",
    recommendedFNumber: 1.8,
  },
  {
    focalLengthMm: 135,
    labelKo: "135mm 망원",
    categoryKo: "망원",
    perspectiveFeelKo: "배경을 인물 등 뒤로 강하게 끌어당기는 압축감",
    typicalUseKo: "극적 대치·군중 속 인물 고립 연출",
    recommendedFNumber: 2.0,
  },
  {
    focalLengthMm: 200,
    labelKo: "200mm 초망원",
    categoryKo: "초망원",
    perspectiveFeelKo: "배경 구조물을 벽처럼 밀착시키는 극대 압축",
    typicalUseKo: "거대 구조물 대비·긴장감 극대화·원거리 저격 시선",
    recommendedFNumber: 2.8,
  },
];

/** 7종 시네마/웹툰 표준 렌즈 프리셋 사전. */
export const CINEMA_LENS_PRESETS: Readonly<Record<StandardFocalLengthMm, CinemaLensPreset>> =
  LENS_PRESET_BLUEPRINTS.reduce(
    (acc, item) => {
      const fov = computeLensFieldOfView(item.focalLengthMm, FULL_FRAME_35MM_SENSOR);
      acc[item.focalLengthMm] = {
        ...fov,
        focalLengthMm: item.focalLengthMm,
        labelKo: item.labelKo,
        categoryKo: item.categoryKo,
        perspectiveFeelKo: item.perspectiveFeelKo,
        typicalUseKo: item.typicalUseKo,
        recommendedFNumber: item.recommendedFNumber,
      };
      return acc;
    },
    {} as Record<StandardFocalLengthMm, CinemaLensPreset>,
  );

/**
 * 7종 표준 렌즈 프리셋을 초점거리 오름차순(18mm -> 200mm) 배열로 반환한다.
 */
export function listCinemaLensPresets(): readonly CinemaLensPreset[] {
  return STANDARD_FOCAL_LENGTHS_MM.map((focal) => CINEMA_LENS_PRESETS[focal]);
}

/**
 * 임의 초점거리에서 가장 가까운 표준 시네마 렌즈 프리셋을 조회한다.
 */
export function findNearestCinemaLensPreset(focalLengthMm: number): CinemaLensPreset {
  const f = clampFinite(focalLengthMm, 4, 2000, 50);
  let bestFocal: StandardFocalLengthMm = 50;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < STANDARD_FOCAL_LENGTHS_MM.length; i += 1) {
    const candidate = STANDARD_FOCAL_LENGTHS_MM[i];
    if (candidate === undefined) continue;
    const diff = Math.abs(candidate - f);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestFocal = candidate;
    }
  }
  return CINEMA_LENS_PRESETS[bestFocal];
}

/**
 * 동일 인물 프레이밍(피사체 수직 화면 점유율 고정) 조건에서
 * 렌즈 초점거리에 따른 카메라 거리 `d_subject`와 배경 압축률(`backgroundCompressionRatio`)을 계산한다.
 *
 * 유도:
 * - 피사체 평면 수직 시야 폭 `H_frame = subjectHeightM / subjectFrameFillRatio`
 * - 삼각형 닮음: `d_subject(f) = (f / sensorHeightMm) * H_frame`
 * - 피사체 뒤 `d_bg` 거리에 있는 배경 물체의 상대 겉보기 선형 크기:
 *   `S(f) = d_subject(f) / (d_subject(f) + d_bg)`
 * - 기준 렌즈 `f_ref` 대비 상대 배경 확대·압축률:
 *   `backgroundCompressionRatio = S(f) / S(f_ref)`
 *
 * `S'(f) > 0`이므로 초점거리가 커질수록(24mm -> 200mm) 배경은 단조 증가하며 강하게 확대·압축된다.
 */
export function computeFocalBackgroundCompression(
  input: FocalBackgroundCompressionInput,
): FocalBackgroundCompressionResult {
  const sensor = input.sensor ?? FULL_FRAME_35MM_SENSOR;
  const f = clampFinite(input.focalLengthMm, 4, 2000, 50);
  const fRef = clampFinite(
    input.referenceFocalLengthMm ?? DEFAULT_REFERENCE_FOCAL_MM,
    4,
    2000,
    DEFAULT_REFERENCE_FOCAL_MM,
  );
  const subjectHeightM = clampFinite(
    input.subjectHeightM ?? DEFAULT_SUBJECT_HEIGHT_M,
    0.1,
    50,
    DEFAULT_SUBJECT_HEIGHT_M,
  );
  const fillRatio = clampFinite(
    input.subjectFrameFillRatio ?? DEFAULT_SUBJECT_FILL_RATIO,
    0.05,
    1.0,
    DEFAULT_SUBJECT_FILL_RATIO,
  );
  const dBg = clampFinite(input.backgroundDistanceM, 0.05, 5000, 10);
  const sensorH = clampFinite(sensor.heightMm, 1, 200, FULL_FRAME_35MM_SENSOR.heightMm);

  const verticalFrameSpanAtSubjectM = subjectHeightM / fillRatio;
  const subjectDistanceM = (f / sensorH) * verticalFrameSpanAtSubjectM;
  const cameraToBackgroundM = subjectDistanceM + dBg;
  const backgroundApparentScale = subjectDistanceM / cameraToBackgroundM;

  const refSubjectDistanceM = (fRef / sensorH) * verticalFrameSpanAtSubjectM;
  const refApparentScale = refSubjectDistanceM / (refSubjectDistanceM + dBg);

  const backgroundCompressionRatio = backgroundApparentScale / refApparentScale;
  const backgroundAreaMagnification = backgroundCompressionRatio * backgroundCompressionRatio;
  const perspectiveForeshorteningIndex = 1 - backgroundApparentScale;

  return {
    focalLengthMm: roundTo(f, 3),
    referenceFocalLengthMm: roundTo(fRef, 3),
    subjectHeightM: roundTo(subjectHeightM, 4),
    subjectFrameFillRatio: roundTo(fillRatio, 4),
    verticalFrameSpanAtSubjectM: roundTo(verticalFrameSpanAtSubjectM, 4),
    subjectDistanceM: roundTo(subjectDistanceM, 6),
    backgroundDistanceM: roundTo(dBg, 4),
    cameraToBackgroundM: roundTo(cameraToBackgroundM, 6),
    backgroundApparentScale: roundTo(backgroundApparentScale, 6),
    backgroundCompressionRatio: roundTo(backgroundCompressionRatio, 6),
    backgroundAreaMagnification: roundTo(backgroundAreaMagnification, 6),
    perspectiveForeshorteningIndex: roundTo(perspectiveForeshorteningIndex, 6),
    fov: computeLensFieldOfView(f, sensor),
  };
}

/**
 * 7종 표준 렌즈(18~200mm) 전체에 대해 동일 인물 프레이밍 배경 압축 비교표를 생성한다.
 */
export function compareFocalCompressionAcrossPresets(params: {
  readonly backgroundDistanceM: number;
  readonly subjectHeightM?: number;
  readonly subjectFrameFillRatio?: number;
  readonly referenceFocalLengthMm?: number;
  readonly sensor?: SensorDimensionsMm;
}): readonly FocalBackgroundCompressionResult[] {
  return STANDARD_FOCAL_LENGTHS_MM.map((focalLengthMm) =>
    computeFocalBackgroundCompression({
      focalLengthMm,
      backgroundDistanceM: params.backgroundDistanceM,
      subjectHeightM: params.subjectHeightM,
      subjectFrameFillRatio: params.subjectFrameFillRatio,
      referenceFocalLengthMm: params.referenceFocalLengthMm,
      sensor: params.sensor,
    }),
  );
}

/**
 * 박렌즈(Thin-Lens) 광학 공식으로 임의 거리 `objectDistanceM`의 센서 면 물리 착란원 직경(mm)을 계산한다.
 *
 * 공식: `blurCircleMm = (f^2 / (N * (s - f))) * (|z - s| / z)`
 * 여기서 `f`는 초점거리(mm), `N`은 조리개 F-number, `s`는 초점 거리(mm), `z`는 대상 거리(mm)다.
 * `z = Dn` 또는 `z = Df`일 때 정확히 허용 착란원 `cocMm`과 일치한다.
 */
export function computeBlurCircleMmAtDistance(params: {
  readonly focalLengthMm: number;
  readonly fNumber: number;
  readonly focusDistanceM: number;
  readonly objectDistanceM: number;
}): number {
  const f = clampFinite(params.focalLengthMm, 4, 2000, 50);
  const fNumber = clampFinite(params.fNumber, 0.7, 64, 2.8);
  const minFocusM = (f / 1000) * 1.15;
  const focusM = clampFinite(params.focusDistanceM, minFocusM, 100000, 3);
  const sMm = focusM * 1000;
  const denomFocus = Math.max(1e-6, sMm - f);

  if (params.objectDistanceM === Number.POSITIVE_INFINITY) {
    return (f * f) / (fNumber * denomFocus);
  }

  const zM = clampFinite(params.objectDistanceM, minFocusM, 1000000, focusM * 2);
  const zMm = zM * 1000;
  return ((f * f) / (fNumber * denomFocus)) * (Math.abs(zMm - sMm) / zMm);
}

function classifyBokehGrade(blurRelativeToCoc: number): BokehSeparationGrade {
  if (blurRelativeToCoc <= 1.0) return "tack-sharp";
  if (blurRelativeToCoc <= 3.0) return "subtle-falloff";
  if (blurRelativeToCoc <= 8.0) return "cinematic-bokeh";
  return "creamy-isolation";
}

/**
 * 박렌즈(Thin-Lens) 피사계 심도(DoF) 경계 및 착란원을 계산한다.
 *
 * - 과초점 거리: `H = f^2 / (N * c) + f`
 * - 근측 선명 한계: `Dn = s * (H - f) / (H + s - 2f)`
 * - 원측 선명 한계: `s >= H`이면 `Infinity`, 아니면 `Df = s * (H - f) / (H - s)`
 */
export function computeDepthOfFieldBounds(input: DepthOfFieldInput): DepthOfFieldResult {
  const f = clampFinite(input.focalLengthMm, 4, 2000, 50);
  const fNumber = clampFinite(input.fNumber, 0.7, 64, 2.8);
  const cocMm = clampFinite(
    input.cocMm ?? FULL_FRAME_35MM_SENSOR.defaultCocMm,
    0.005,
    0.2,
    FULL_FRAME_35MM_SENSOR.defaultCocMm,
  );
  const minFocusM = (f / 1000) * 1.15;
  const focusDistanceM = clampFinite(input.focusDistanceM, minFocusM, 100000, 3);
  const sMm = focusDistanceM * 1000;

  const hyperfocalMinusFMm = (f * f) / (fNumber * cocMm);
  const hyperfocalMm = hyperfocalMinusFMm + f;
  const hyperfocalDistanceM = hyperfocalMm / 1000;

  const nearMm = (sMm * hyperfocalMinusFMm) / (hyperfocalMm + sMm - 2 * f);
  const nearFocusLimitM = nearMm / 1000;

  const isFarLimitInfinite = sMm >= hyperfocalMm - 1e-9;
  const farFocusLimitM = isFarLimitInfinite
    ? Number.POSITIVE_INFINITY
    : (sMm * hyperfocalMinusFMm) / (hyperfocalMm - sMm) / 1000;

  const totalDofM = isFarLimitInfinite
    ? Number.POSITIVE_INFINITY
    : farFocusLimitM - nearFocusLimitM;
  const frontDofM = focusDistanceM - nearFocusLimitM;
  const rearDofM = isFarLimitInfinite
    ? Number.POSITIVE_INFINITY
    : farFocusLimitM - focusDistanceM;

  const infinityBlurCircleMm = computeBlurCircleMmAtDistance({
    focalLengthMm: f,
    fNumber,
    focusDistanceM,
    objectDistanceM: Number.POSITIVE_INFINITY,
  });

  const sampleDistanceM =
    input.sampleBackgroundDistanceM === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : clampFinite(
          input.sampleBackgroundDistanceM ?? focusDistanceM * 2,
          minFocusM,
          1000000,
          focusDistanceM * 2,
        );

  const blurCircleMm = computeBlurCircleMmAtDistance({
    focalLengthMm: f,
    fNumber,
    focusDistanceM,
    objectDistanceM: sampleDistanceM,
  });
  const blurRelativeToCoc = blurCircleMm / cocMm;
  const isSampleInFocus = blurRelativeToCoc <= 1.0 + 1e-6;

  return {
    focalLengthMm: roundTo(f, 3),
    fNumber: roundTo(fNumber, 3),
    cocMm: roundTo(cocMm, 5),
    focusDistanceM: roundTo(focusDistanceM, 4),
    hyperfocalDistanceM: roundTo(hyperfocalDistanceM, 4),
    nearFocusLimitM: roundTo(nearFocusLimitM, 4),
    farFocusLimitM: isFarLimitInfinite ? Number.POSITIVE_INFINITY : roundTo(farFocusLimitM, 4),
    isFarLimitInfinite,
    totalDofM: isFarLimitInfinite ? Number.POSITIVE_INFINITY : roundTo(totalDofM, 4),
    frontDofM: roundTo(frontDofM, 4),
    rearDofM: isFarLimitInfinite ? Number.POSITIVE_INFINITY : roundTo(rearDofM, 4),
    infinityBlurCircleMm: roundTo(infinityBlurCircleMm, 6),
    sampleBackgroundDistanceM:
      sampleDistanceM === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : roundTo(sampleDistanceM, 4),
    blurCircleMm: roundTo(blurCircleMm, 6),
    blurRelativeToCoc: roundTo(blurRelativeToCoc, 4),
    isSampleInFocus,
    bokehSeparationGrade: classifyBokehGrade(blurRelativeToCoc),
  };
}
