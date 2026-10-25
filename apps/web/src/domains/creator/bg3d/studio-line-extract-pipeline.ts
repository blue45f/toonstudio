/**
 * Studio 선화 추출 단일 경로 — bg3d·씬 3D·채색이 공유하는 설정 계약.
 *
 * 그동안 선화 설정은 세 갈래로 흩어져 있었다: bg3d LT 렌더(lt-render·
 * lt-line-ridge/stroke/suppression·line-output-rules), 씬 3D 선화 추출기
 * (scene-3d/studio-3d-line-art-extractor), 채색용 벡터 변환
 * (lt-convert/studio-lt-convert-vector). 엔진 자체는 각자 자리에 두되,
 * "어떤 선을 뽑을지"에 대한 판정은 이 모듈 하나로 통일한다.
 *
 * - 입력은 출처(source) + 알고리즘 + 굵기·강도 같은 소수 설정뿐이다.
 * - 깊이 필요 여부·내부선 억제 판정은 bg3d 선 출력 규칙
 *   (studio-bg3d-line-output-rules)에 위임해 세 경로가 같은 답을 낸다.
 * - 알 수 없는 출처·알고리즘·범위 밖 수치는 fail-closed로 null을 돌려주고,
 *   호출자는 이전 설정을 유지한다(조용히 다른 선으로 바뀌지 않는다).
 * - 이 모듈은 렌더링을 실행하지 않는다. bg3d LT 렌더 설정·채색 벡터
 *   옵션으로 바꾸는 매핑 함수만 제공해, 실제 엔진은 기존 경로 그대로 쓴다.
 */

import {
  resolveStudioBg3dInteriorSuppression,
  studioBg3dLineNeedsDepth,
} from "./studio-bg3d-line-output-rules";

import type { StudioBg3dLineOutputSettings } from "./studio-bg3d-scene-document-types";
import type { StudioLtVectorLineOptions } from "../lt-convert/studio-lt-convert-vector";

/** 선화를 뽑는 출처. bg3d LT 렌더·씬 3D 캡처·채색용 사진 선화. */
export type StudioLineExtractSource = "bg3d-lt" | "scene-3d" | "colorize-photo";

/** 선화 추출 알고리즘. colorize-photo는 사진 전용 ONNX 경로만 쓴다. */
export type StudioLineExtractAlgorithm =
  | "sobel"
  | "canny"
  | "dog"
  | "normal-depth"
  | "hybrid"
  | "onnx";

/** 선화 추출을 실행하는 엔진(설정 계약상의 구분 — 실제 런타임은 기존 경로). */
export type StudioLineExtractEngine = "bg3d-lt" | "scene-3d-line-art" | "onnx-line";

/** 출처별 한글 라벨(형제 모듈의 인라인 라벨 패턴). */
export const STUDIO_LINE_EXTRACT_SOURCE_LABELS: Readonly<
  Record<StudioLineExtractSource, string>
> = Object.freeze({
  "bg3d-lt": "BG3D LT 렌더",
  "scene-3d": "씬 3D 캡처",
  "colorize-photo": "채색용 사진",
});

export const STUDIO_LINE_EXTRACT_ALGORITHM_LABELS: Readonly<
  Record<StudioLineExtractAlgorithm, string>
> = Object.freeze({
  sobel: "Sobel (기본)",
  canny: "Canny (정밀)",
  dog: "DoG (만화 잉크)",
  "normal-depth": "노멀·깊이 (3D)",
  hybrid: "하이브리드",
  onnx: "ONNX 사진 선화",
});

const RASTER_ALGORITHMS: readonly StudioLineExtractAlgorithm[] = Object.freeze([
  "sobel",
  "canny",
  "dog",
  "normal-depth",
  "hybrid",
]);

const SOURCE_ALGORITHMS: Readonly<Record<StudioLineExtractSource, readonly StudioLineExtractAlgorithm[]>> =
  Object.freeze({
    "bg3d-lt": RASTER_ALGORITHMS,
    "scene-3d": RASTER_ALGORITHMS,
    "colorize-photo": Object.freeze(["onnx"] as const),
  });

const SOURCE_ENGINES: Readonly<Record<StudioLineExtractSource, StudioLineExtractEngine>> =
  Object.freeze({
    "bg3d-lt": "bg3d-lt",
    "scene-3d": "scene-3d-line-art",
    "colorize-photo": "onnx-line",
  });

/** 출처별 기본값. 사진은 깊이 버퍼가 없어 깊이·내부선 억제를 쓰지 않는다. */
const SOURCE_DEFAULTS: Readonly<
  Record<
    StudioLineExtractSource,
    {
      readonly algorithm: StudioLineExtractAlgorithm;
      readonly widthPx: number;
      readonly strength: number;
      readonly smoothing: number;
      readonly creaseAngleDegrees: number;
      readonly depthEnabled: boolean;
      readonly interiorSuppressionEnabled: boolean;
      readonly interiorSuppressionStrength: number;
      readonly hiddenLineRemoval: boolean;
    }
  >
> = Object.freeze({
  "bg3d-lt": Object.freeze({
    algorithm: "hybrid",
    widthPx: 2,
    strength: 0.8,
    smoothing: 0.5,
    creaseAngleDegrees: 45,
    depthEnabled: true,
    interiorSuppressionEnabled: true,
    interiorSuppressionStrength: 0.6,
    hiddenLineRemoval: true,
  }),
  "scene-3d": Object.freeze({
    algorithm: "hybrid",
    widthPx: 2,
    strength: 0.8,
    smoothing: 0.4,
    creaseAngleDegrees: 45,
    depthEnabled: true,
    interiorSuppressionEnabled: true,
    interiorSuppressionStrength: 0.6,
    hiddenLineRemoval: false,
  }),
  "colorize-photo": Object.freeze({
    algorithm: "onnx",
    widthPx: 1,
    strength: 1,
    smoothing: 0,
    creaseAngleDegrees: 45,
    depthEnabled: false,
    interiorSuppressionEnabled: false,
    interiorSuppressionStrength: 0.6,
    hiddenLineRemoval: false,
  }),
});

export interface StudioLineExtractJob {
  readonly source: StudioLineExtractSource;
  readonly sourceLabel: string;
  readonly engine: StudioLineExtractEngine;
  readonly algorithm: StudioLineExtractAlgorithm;
  readonly algorithmLabel: string;
  readonly widthPx: number;
  readonly strength: number;
  readonly smoothing: number;
  readonly creaseAngleDegrees: number;
  /** 선 출력 규칙에 위임해 판정한 깊이 캡처 필요 여부. */
  readonly depthNeeded: boolean;
  readonly interiorSuppression: { readonly active: boolean; readonly strength: number };
  readonly hiddenLineRemoval: boolean;
}

export interface StudioLineExtractJobInput {
  readonly source?: unknown;
  readonly algorithm?: unknown;
  readonly widthPx?: unknown;
  readonly strength?: unknown;
  readonly smoothing?: unknown;
  readonly creaseAngleDegrees?: unknown;
  readonly depthEnabled?: unknown;
  readonly interiorSuppressionEnabled?: unknown;
  readonly interiorSuppressionStrength?: unknown;
  readonly hiddenLineRemoval?: unknown;
}

function isSource(value: unknown): value is StudioLineExtractSource {
  return value === "bg3d-lt" || value === "scene-3d" || value === "colorize-photo";
}

function isAlgorithmForSource(
  source: StudioLineExtractSource,
  value: unknown,
): value is StudioLineExtractAlgorithm {
  return typeof value === "string"
    && (SOURCE_ALGORITHMS[source] as readonly string[]).includes(value);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * 선화 추출 작업으로 정규화한다. 출처가 없거나·알 수 없거나, 출처에서
 * 쓸 수 없는 알고리즘이면 null이다(호출자는 이전 설정을 유지한다).
 */
export function resolveStudioLineExtractJob(
  input: StudioLineExtractJobInput,
): StudioLineExtractJob | null {
  if (!isSource(input.source)) return null;
  const source = input.source;
  const defaults = SOURCE_DEFAULTS[source];
  const algorithm = input.algorithm === undefined ? defaults.algorithm : input.algorithm;
  if (!isAlgorithmForSource(source, algorithm)) {
    return null;
  }
  const depthEnabled = clampBoolean(input.depthEnabled, defaults.depthEnabled);
  const interiorSuppressionEnabled = clampBoolean(
    input.interiorSuppressionEnabled,
    defaults.interiorSuppressionEnabled,
  );
  const interiorSuppressionStrength = clampNumber(
    input.interiorSuppressionStrength,
    0,
    1,
    defaults.interiorSuppressionStrength,
  );
  // 사진 출처는 깊이 버퍼가 없어 규칙 판정과 무관하게 깊이가 필요 없다.
  const depthNeeded = source === "colorize-photo"
    ? false
    : studioBg3dLineNeedsDepth({
        depthEnabled,
        interiorSuppressionEnabled,
        interiorSuppressionStrength,
      });
  const interiorSuppression = source === "colorize-photo"
    ? { active: false, strength: interiorSuppressionStrength }
    : resolveStudioBg3dInteriorSuppression({
        interiorSuppressionEnabled,
        interiorSuppressionStrength,
      });
  return Object.freeze({
    source,
    sourceLabel: STUDIO_LINE_EXTRACT_SOURCE_LABELS[source],
    engine: SOURCE_ENGINES[source],
    algorithm,
    algorithmLabel: STUDIO_LINE_EXTRACT_ALGORITHM_LABELS[algorithm],
    widthPx: clampNumber(input.widthPx, 0.5, 8, defaults.widthPx),
    strength: clampNumber(input.strength, 0, 1, defaults.strength),
    smoothing: clampNumber(input.smoothing, 0, 1, defaults.smoothing),
    creaseAngleDegrees: clampNumber(input.creaseAngleDegrees, 0, 90, defaults.creaseAngleDegrees),
    depthNeeded,
    interiorSuppression: Object.freeze(interiorSuppression),
    hiddenLineRemoval: clampBoolean(input.hiddenLineRemoval, defaults.hiddenLineRemoval),
  });
}

/**
 * 작업을 bg3d 선 출력 설정의 부분 형태로 바꾼다. 호출자는 이 값을 기존
 * 장면 문서의 선 설정에 합쳐 LT 렌더(renderStudioBg3dLtLayers)에 그대로
 * 넘긴다 — layerType·color는 문서 기존값을 유지한다.
 */
export function studioLineExtractJobToBg3dLineSettings(
  job: StudioLineExtractJob,
): Omit<StudioBg3dLineOutputSettings, "layerType" | "color"> {
  return Object.freeze({
    enabled: true,
    widthPx: job.widthPx,
    strength: job.strength,
    accuracy: 1 - job.smoothing * 0.5,
    scaleAwareAccuracy: true,
    exteriorOutlineStrength: job.strength,
    depthEnabled: job.depthNeeded,
    depthStrength: job.depthNeeded ? job.strength : 0,
    depthOutlineOnly: false,
    smoothing: job.smoothing,
    textureLineEnabled: job.algorithm === "hybrid" || job.algorithm === "dog",
    textureLineStrength: job.algorithm === "hybrid" || job.algorithm === "dog" ? job.strength : 0,
    creaseAngleDegrees: job.creaseAngleDegrees,
    hiddenLineRemoval: job.hiddenLineRemoval,
    interiorSuppressionEnabled: job.interiorSuppression.active,
    interiorSuppressionStrength: job.interiorSuppression.strength,
  });
}

/**
 * 작업을 채색용 벡터 변환 옵션으로 바꾼다. 굵기는 그대로, 단순화 허용
 * 오차는 스무딩이 클수록 작아진다(선은 살리고 잡티만 줄이는 방향).
 */
export function studioLineExtractJobToLtVectorOptions(
  job: StudioLineExtractJob,
): StudioLtVectorLineOptions {
  return Object.freeze({
    id: "lt-vector-line",
    name: "LT 주선 · 벡터",
    color: "#000000",
    strokeWidth: job.widthPx,
    simplifyTolerance: Math.round(0.75 * (1 - job.smoothing) * 1000) / 1000,
    scale: 1,
  });
}
