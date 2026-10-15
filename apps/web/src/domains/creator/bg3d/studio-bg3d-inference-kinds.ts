/**
 * 추론(Inference) 종류·표시 스타일·축 관례·성능 예산 상수 — 순수 데이터 모듈.
 *
 * 뷰포트 마커(모양+색 이중 인코딩), 툴팁 문구, 축 색, 쿼리 예산을 한곳에 두어 엔진·UI·테스트가
 * 같은 값을 보게 한다. 장면의 up 축은 카메라 기본 up 벡터에서 읽어(코드로 확인) 키 매핑과 축 표기가
 * 장면 관례와 어긋나지 않게 한다.
 */

import { STUDIO_BG3D_CAMERA_DEFAULT_UP } from "./studio-bg3d-camera-orientation";

export type StudioBg3dInferenceAxis = "x" | "y" | "z";

export const STUDIO_BG3D_INFERENCE_AXES: readonly StudioBg3dInferenceAxis[] = Object.freeze([
  "x",
  "y",
  "z",
]);

export type StudioBg3dInferenceKind =
  | "endpoint"
  | "midpoint"
  | "intersection"
  | "center"
  | "on-edge"
  | "axis"
  | "from-point"
  | "parallel"
  | "perpendicular"
  | "on-face"
  | "grid"
  | "free";

export type StudioBg3dInferenceMarkerShape =
  | "square"
  | "triangle"
  | "cross"
  | "circle-dot"
  | "bar"
  | "face"
  | "axis-line"
  | "dotted-line"
  | "double-bar"
  | "right-angle"
  | "plus"
  | "none";

/** 디자인 토큰 이름(Tailwind `text-*`/`border-*`의 접미사)과 대응한다. */
export type StudioBg3dInferenceTone = "good" | "cool" | "accent" | "bad" | "warn" | "fg-2" | "fg-3";

export interface StudioBg3dInferenceKindStyle {
  readonly kind: StudioBg3dInferenceKind;
  /** 툴팁에 짧게 보이는 한국어 문구. */
  readonly label: string;
  readonly shape: StudioBg3dInferenceMarkerShape;
  readonly tone: StudioBg3dInferenceTone;
  /** 3D 장면 선·메시용 색(CSS 변수를 못 쓰는 three 재질에 사용). */
  readonly hex: string;
  /** 같은 위치·같은 거리일 때의 전역 우선순위(작을수록 우선). */
  readonly rank: number;
  /** 서로 다른 종류를 비교하기 전에 먼저 나누는 구간(작을수록 우선). */
  readonly tier: number;
}

/**
 * 우선순위 규칙(작을수록 우선):
 *  1구간 점(끝점·교차·중간점·중심) → 2구간 선 위 → 3구간 정렬(축·기준점 연장·평행·수직)
 *  → 4구간 면 위 → 5구간 격자 → 6구간 자유.
 * 같은 구간 안에서는 화면 거리(px)가 가까운 후보가 이기고, 거리가 같으면 `rank`, 그다음 ID 순이다.
 */
export const STUDIO_BG3D_INFERENCE_KIND_STYLE: Readonly<
  Record<StudioBg3dInferenceKind, StudioBg3dInferenceKindStyle>
> = Object.freeze({
  endpoint: { kind: "endpoint", label: "끝점", shape: "square", tone: "good", hex: "#2ec4b6", rank: 0, tier: 1 },
  intersection: { kind: "intersection", label: "교차점", shape: "cross", tone: "bad", hex: "#e63946", rank: 1, tier: 1 },
  midpoint: { kind: "midpoint", label: "중간점", shape: "triangle", tone: "cool", hex: "#3a86ff", rank: 2, tier: 1 },
  center: { kind: "center", label: "중심", shape: "circle-dot", tone: "accent", hex: "#8338ec", rank: 3, tier: 1 },
  "on-edge": { kind: "on-edge", label: "선 위", shape: "bar", tone: "warn", hex: "#d98a00", rank: 4, tier: 2 },
  axis: { kind: "axis", label: "축 정렬", shape: "axis-line", tone: "fg-2", hex: "#6b7280", rank: 5, tier: 3 },
  "from-point": { kind: "from-point", label: "기준점에서 연장", shape: "dotted-line", tone: "fg-2", hex: "#6b7280", rank: 6, tier: 3 },
  parallel: { kind: "parallel", label: "평행", shape: "double-bar", tone: "accent", hex: "#c026d3", rank: 7, tier: 3 },
  perpendicular: { kind: "perpendicular", label: "수직", shape: "right-angle", tone: "accent", hex: "#c026d3", rank: 8, tier: 3 },
  "on-face": { kind: "on-face", label: "면 위", shape: "face", tone: "cool", hex: "#3a86ff", rank: 9, tier: 4 },
  grid: { kind: "grid", label: "격자", shape: "plus", tone: "fg-3", hex: "#9ca3af", rank: 10, tier: 5 },
  free: { kind: "free", label: "자유 위치", shape: "none", tone: "fg-3", hex: "#9ca3af", rank: 11, tier: 6 },
});

export const STUDIO_BG3D_INFERENCE_KINDS: readonly StudioBg3dInferenceKind[] = Object.freeze(
  (Object.keys(STUDIO_BG3D_INFERENCE_KIND_STYLE) as StudioBg3dInferenceKind[]).sort(
    (left, right) =>
      STUDIO_BG3D_INFERENCE_KIND_STYLE[left].rank - STUDIO_BG3D_INFERENCE_KIND_STYLE[right].rank,
  ),
);

export interface StudioBg3dInferenceAxisStyle {
  readonly axis: StudioBg3dInferenceAxis;
  /** "X축" 같은 짧은 이름. */
  readonly label: string;
  /** 장면 관례 설명 — 섹션 평면의 "좌우(X)·상하(Y)·앞뒤(Z)" 표기와 같은 낱말을 쓴다. */
  readonly meaning: string;
  readonly colorName: string;
  readonly tone: StudioBg3dInferenceTone;
  readonly hex: string;
  /** 색에만 의존하지 않도록 축마다 다른 점선 패턴(선분 길이, 간격)을 둔다. */
  readonly dash: readonly [number, number];
}

/** 빨강=X, 초록=Y, 파랑=Z — three.js `AxesHelper`와 같은 색 관례. */
export const STUDIO_BG3D_INFERENCE_AXIS_STYLE: Readonly<
  Record<StudioBg3dInferenceAxis, StudioBg3dInferenceAxisStyle>
> = Object.freeze({
  x: { axis: "x", label: "X축", meaning: "좌우", colorName: "빨강", tone: "bad", hex: "#e63946", dash: [0.12, 0.06] },
  y: { axis: "y", label: "Y축", meaning: "상하(높이)", colorName: "초록", tone: "good", hex: "#2a9d8f", dash: [0.2, 0.06] },
  z: { axis: "z", label: "Z축", meaning: "앞뒤", colorName: "파랑", tone: "cool", hex: "#457b9d", dash: [0.06, 0.06] },
});

const AXIS_UNIT_VECTORS: Readonly<Record<StudioBg3dInferenceAxis, readonly [number, number, number]>> =
  Object.freeze({
    x: Object.freeze([1, 0, 0] as const),
    y: Object.freeze([0, 1, 0] as const),
    z: Object.freeze([0, 0, 1] as const),
  });

export function studioBg3dInferenceAxisVector(
  axis: StudioBg3dInferenceAxis,
): readonly [number, number, number] {
  return AXIS_UNIT_VECTORS[axis];
}

export function resolveStudioBg3dInferenceDominantAxis(
  vector: readonly [number, number, number],
): StudioBg3dInferenceAxis {
  const ax = Math.abs(vector[0]);
  const ay = Math.abs(vector[1]);
  const az = Math.abs(vector[2]);
  if (ay >= ax && ay >= az) return "y";
  if (az >= ax && az >= ay) return "z";
  return "x";
}

/** 장면의 up 축 — 카메라 기본 up 벡터(Y-up)에서 읽는다. */
export const STUDIO_BG3D_INFERENCE_UP_AXIS: StudioBg3dInferenceAxis =
  resolveStudioBg3dInferenceDominantAxis(STUDIO_BG3D_CAMERA_DEFAULT_UP);

export interface StudioBg3dInferenceAxisRoles {
  /** → 키: 첫 번째 수평 축. */
  readonly first: StudioBg3dInferenceAxis;
  /** ← 키: 두 번째 수평 축. */
  readonly second: StudioBg3dInferenceAxis;
  /** ↑ 키: 수직(up) 축. */
  readonly vertical: StudioBg3dInferenceAxis;
}

/**
 * 방향키 → 축 역할. up 축이 Y면 → X(좌우), ← Z(앞뒤), ↑ Y(높이)다. SketchUp처럼 Z-up 장면이라면
 * ← 가 Y로 바뀐다. 색은 키가 아니라 축 글자에 묶여 있어 항상 빨강=X, 초록=Y, 파랑=Z다.
 */
export function resolveStudioBg3dInferenceAxisRoles(
  up: StudioBg3dInferenceAxis = STUDIO_BG3D_INFERENCE_UP_AXIS,
): StudioBg3dInferenceAxisRoles {
  const horizontals = STUDIO_BG3D_INFERENCE_AXES.filter((axis) => axis !== up);
  return Object.freeze({
    first: horizontals[0] ?? "x",
    second: horizontals[1] ?? "z",
    vertical: up,
  });
}

/** 접근성 이름과 배지에 쓰는 축 설명. 예: "Y축 · 상하(높이) · 초록". */
export function describeStudioBg3dInferenceAxis(axis: StudioBg3dInferenceAxis): string {
  const style = STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis];
  return `${style.label} · ${style.meaning} · ${style.colorName}`;
}

// ---------------------------------------------------------------------------------------------
// 임계값과 성능 예산
// ---------------------------------------------------------------------------------------------

/** 화면 CSS px 기준 활성 반경. 터치는 손가락 크기를 반영해 키운다. */
export const STUDIO_BG3D_INFERENCE_THRESHOLD_PX = Object.freeze({
  point: 10,
  edge: 8,
  align: 8,
  /** 평행·수직·축 정렬을 인정하는 각도 허용 오차(도). */
  angleDegrees: 3,
  touchScale: 2.2,
});

export const STUDIO_BG3D_INFERENCE_BUDGET = Object.freeze({
  /** 한 번에 색인하는 장면 객체 상한. */
  maxSources: 4_096,
  /** 색인에 넣는 점·모서리·면 특징 총량 상한. */
  maxIndexedFeatures: 200_000,
  /** 쿼리 하나가 훑을 수 있는 특징 상한 — 밀집 장면에서도 최악의 비용을 묶는다. */
  maxFeaturesScannedPerQuery: 2_048,
  maxPointCandidatesPerQuery: 64,
  maxEdgeCandidatesPerQuery: 48,
  maxFaceCandidatesPerQuery: 32,
  /** 쿼리 하나가 방문하는 격자 셀 상한. 긴 레이도 가까운 쪽부터 열고 이 상한에서 멈춘다. */
  maxCellsPerQuery: 768,
  /** 한 모서리가 걸칠 수 있는 셀 상한(더 길면 색인에서 제외하고 집계). */
  maxCellsPerEdge: 256,
  /** 교차 검사 쌍 상한(모서리 후보²/2). */
  maxIntersectionPairs: 1_128,
  maxReferencePoints: 4,
  maxReferenceDirections: 16,
  /** 포인터 이동에서 쿼리를 돌리는 최소 간격(ms) — 한 프레임에 한 번. */
  minFrameIntervalMs: 16,
  /** 레이 쿼리 최대 길이(m). */
  maxRayDistance: 400,
});

export const STUDIO_BG3D_INFERENCE_DEFAULT_CELL_SIZE = 2;
export const STUDIO_BG3D_INFERENCE_MIN_CELL_SIZE = 0.25;
export const STUDIO_BG3D_INFERENCE_MAX_CELL_SIZE = 16;

export function studioBg3dInferenceKindLabel(
  kind: StudioBg3dInferenceKind,
  axis: StudioBg3dInferenceAxis | null = null,
): string {
  if (kind === "axis" && axis) return `${STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis].label} 정렬`;
  if (kind === "from-point" && axis) {
    return `기준점에서 ${STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis].label} 연장`;
  }
  return STUDIO_BG3D_INFERENCE_KIND_STYLE[kind].label;
}
