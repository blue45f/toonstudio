/**
 * Studio 2D Camera Folder — CSP 2D 카메라 폴더(`animation2dcamerafoldernew`, `animationshowlocus`)
 * 순수 연산 모듈.
 *
 * 기능:
 * - 카메라 전용 함수 곡선 채널(`centerX`, `centerY`, `zoom`, `rotationDeg`) 평가
 * - 프레임별 2D 뷰 행렬(`world -> viewport`) 및 역행렬(`viewport -> world`) 계산
 * - 월드 공간 내 카메라 프레이밍 사각형(4개 모서리 + AABB) 계산
 * - 카메라 이동 궤적(`locus`) 폴리라인 샘플링 및 정수 프레임별 수직 눈금(tick mark) 생성
 *
 * REA 근거(clean-room math):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_853855365e8ebbed8b4f1694c57c2f224a338610827337312b0d42739c4eb4bc
 */
import {
  createEmptyFunctionCurveChannel,
  evaluateFunctionCurveChannel,
  upsertFunctionCurveKeyframe,
  type FunctionCurveChannel,
  type FunctionCurveInterpolation,
} from "./studio-function-curve";
import {
  applyMatrix2DToPoint,
  invertMatrix2D,
  multiplyMatrix2D,
  type AffineMatrix2D,
} from "./studio-light-table";

export interface StudioAnimCamera2DChannels {
  readonly centerX: FunctionCurveChannel;
  readonly centerY: FunctionCurveChannel;
  readonly zoom: FunctionCurveChannel;
  readonly rotationDeg: FunctionCurveChannel;
}

export interface StudioAnimCamera2DFolder {
  readonly id: string;
  readonly name: string;
  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly showLocus: boolean;
  readonly memberTrackIds: readonly string[];
  readonly channels: StudioAnimCamera2DChannels;
}

export interface EvaluatedCamera2DState {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
  readonly rotationDeg: number;
}

export interface Camera2DFramingRect {
  readonly center: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotationDeg: number;
  /** 월드 좌표계 기준 `[좌상, 우상, 우하, 좌하]` 4개 꼭짓점. */
  readonly corners: readonly [
    { readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number },
  ];
  readonly aabb: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export interface Camera2DLocusSamplePoint {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
}

export interface Camera2DLocusFrameTick {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly p1: { readonly x: number; readonly y: number };
  readonly p2: { readonly x: number; readonly y: number };
  readonly isKeyframe: boolean;
}

export interface Camera2DLocusPath {
  readonly polyline: readonly Camera2DLocusSamplePoint[];
  readonly frameTicks: readonly Camera2DLocusFrameTick[];
}

const MIN_CAMERA_ZOOM = 0.05;
const MAX_CAMERA_ZOOM = 32;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function createStudioAnimCamera2DFolder(options: {
  readonly id: string;
  readonly name?: string;
  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly showLocus?: boolean;
  readonly memberTrackIds?: readonly string[];
}): StudioAnimCamera2DFolder {
  const baseWidth = Math.max(1, Math.round(options.baseWidth));
  const baseHeight = Math.max(1, Math.round(options.baseHeight));
  return {
    id: options.id,
    name: options.name?.trim() || "2D 카메라 1",
    baseWidth,
    baseHeight,
    showLocus: options.showLocus ?? true,
    memberTrackIds: options.memberTrackIds ? [...options.memberTrackIds] : [],
    channels: {
      centerX: createEmptyFunctionCurveChannel("x", baseWidth * 0.5),
      centerY: createEmptyFunctionCurveChannel("y", baseHeight * 0.5),
      zoom: createEmptyFunctionCurveChannel("scaleX", 1),
      rotationDeg: createEmptyFunctionCurveChannel("rotationDeg", 0),
    },
  };
}

export function setCamera2DKeyframe(
  camera: StudioAnimCamera2DFolder,
  frame: number,
  pose: Partial<EvaluatedCamera2DState>,
  interpolation: FunctionCurveInterpolation = "smooth",
): StudioAnimCamera2DFolder {
  let { centerX, centerY, zoom, rotationDeg } = camera.channels;
  if (pose.centerX !== undefined) {
    centerX = upsertFunctionCurveKeyframe(centerX, {
      frame,
      value: pose.centerX,
      interpolation,
      handleMode: "auto-monotone",
    });
  }
  if (pose.centerY !== undefined) {
    centerY = upsertFunctionCurveKeyframe(centerY, {
      frame,
      value: pose.centerY,
      interpolation,
      handleMode: "auto-monotone",
    });
  }
  if (pose.zoom !== undefined) {
    zoom = upsertFunctionCurveKeyframe(zoom, {
      frame,
      value: clamp(pose.zoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM),
      interpolation,
      handleMode: "auto-monotone",
    });
  }
  if (pose.rotationDeg !== undefined) {
    rotationDeg = upsertFunctionCurveKeyframe(rotationDeg, {
      frame,
      value: pose.rotationDeg,
      interpolation,
      handleMode: "auto-monotone",
    });
  }
  return {
    ...camera,
    channels: { centerX, centerY, zoom, rotationDeg },
  };
}

/** 지정 프레임에서 2D 카메라 상태(`centerX, centerY, zoom, rotationDeg`)를 평가한다. */
export function evaluateCamera2DAtFrame(
  camera: StudioAnimCamera2DFolder,
  frame: number,
): EvaluatedCamera2DState {
  return {
    centerX: evaluateFunctionCurveChannel(camera.channels.centerX, frame),
    centerY: evaluateFunctionCurveChannel(camera.channels.centerY, frame),
    zoom: clamp(
      evaluateFunctionCurveChannel(camera.channels.zoom, frame),
      MIN_CAMERA_ZOOM,
      MAX_CAMERA_ZOOM,
    ),
    rotationDeg: evaluateFunctionCurveChannel(camera.channels.rotationDeg, frame),
  };
}

/**
 * 월드 좌표를 출력 뷰포트 좌표(`0..baseWidth`, `0..baseHeight`)로 사상하는 2x3 뷰 행렬을 계산한다.
 * 카메라가 `(centerX, centerY)`에 있고 시계 방향 `rotationDeg`, 배율 `zoom`이면
 * 월드는 `(-centerX, -centerY)` 이동 → `-rotationDeg` 회전 → `zoom` 확대 → `(+baseWidth/2, +baseHeight/2)` 이동한다.
 */
export function computeCamera2DViewMatrix(
  camera: StudioAnimCamera2DFolder,
  frame: number,
): AffineMatrix2D {
  const state = evaluateCamera2DAtFrame(camera, frame);
  const rad = (-state.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad) * state.zoom;
  const sin = Math.sin(rad) * state.zoom;

  const translateWorld: AffineMatrix2D = [1, 0, 0, 1, -state.centerX, -state.centerY];
  const rotScale: AffineMatrix2D = [cos, sin, -sin, cos, 0, 0];
  const toViewportCenter: AffineMatrix2D = [
    1,
    0,
    0,
    1,
    camera.baseWidth * 0.5,
    camera.baseHeight * 0.5,
  ];
  return multiplyMatrix2D(toViewportCenter, multiplyMatrix2D(rotScale, translateWorld));
}

/** 지정 프레임에서 카메라가 월드 공간 위에서 비추는 프레이밍 사각형(4꼭짓점 + AABB)을 계산한다. */
export function computeCamera2DFramingRect(
  camera: StudioAnimCamera2DFolder,
  frame: number,
): Camera2DFramingRect {
  const state = evaluateCamera2DAtFrame(camera, frame);
  const viewMat = computeCamera2DViewMatrix(camera, frame);
  const worldMat = invertMatrix2D(viewMat) ?? [1, 0, 0, 1, 0, 0];

  const tl = applyMatrix2DToPoint(worldMat, 0, 0);
  const tr = applyMatrix2DToPoint(worldMat, camera.baseWidth, 0);
  const br = applyMatrix2DToPoint(worldMat, camera.baseWidth, camera.baseHeight);
  const bl = applyMatrix2DToPoint(worldMat, 0, camera.baseHeight);

  const xs = [tl.x, tr.x, br.x, bl.x];
  const ys = [tl.y, tr.y, br.y, bl.y];

  return {
    center: { x: state.centerX, y: state.centerY },
    width: camera.baseWidth / state.zoom,
    height: camera.baseHeight / state.zoom,
    rotationDeg: state.rotationDeg,
    corners: [tl, tr, br, bl],
    aabb: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
  };
}

/**
 * 카메라 중심 이동 경로(`locus`, `animationshowlocus`) 폴리라인과 정수 프레임별 눈금(tick mark)을 생성한다.
 */
export function generateCamera2DLocus(
  camera: StudioAnimCamera2DFolder,
  options: {
    readonly startFrame: number;
    readonly endFrame: number;
    readonly subStepsPerFrame?: number;
    readonly tickHalfLengthPx?: number;
  },
): Camera2DLocusPath {
  const start = Math.max(0, Math.floor(options.startFrame));
  const end = Math.max(start, Math.ceil(options.endFrame));
  const subSteps = Math.max(1, Math.min(16, Math.round(options.subStepsPerFrame ?? 4)));
  const tickHalf = Math.max(1, options.tickHalfLengthPx ?? 5);

  const keyframeSet = new Set<number>();
  for (const ch of [
    camera.channels.centerX,
    camera.channels.centerY,
    camera.channels.zoom,
    camera.channels.rotationDeg,
  ]) {
    for (const kf of ch.keyframes) {
      keyframeSet.add(Math.round(kf.frame));
    }
  }

  const polyline: Camera2DLocusSamplePoint[] = [];
  const totalSamples = (end - start) * subSteps;
  for (let i = 0; i <= totalSamples; i += 1) {
    const f = start + i / subSteps;
    const state = evaluateCamera2DAtFrame(camera, f);
    polyline.push({ frame: f, x: state.centerX, y: state.centerY });
  }

  const frameTicks: Camera2DLocusFrameTick[] = [];
  for (let f = start; f <= end; f += 1) {
    const cur = evaluateCamera2DAtFrame(camera, f);
    const prev = evaluateCamera2DAtFrame(camera, Math.max(start, f - 0.25));
    const next = evaluateCamera2DAtFrame(camera, Math.min(end, f + 0.25));
    const tx = next.centerX - prev.centerX;
    const ty = next.centerY - prev.centerY;
    const len = Math.hypot(tx, ty);
    // 경로 접선에 수직인 단위 법선 벡터 (정지 구간이면 수직 눈금 (0, -1))
    const nx = len > 1e-6 ? -ty / len : 0;
    const ny = len > 1e-6 ? tx / len : -1;
    const half = keyframeSet.has(f) ? tickHalf * 1.6 : tickHalf;

    frameTicks.push({
      frame: f,
      x: cur.centerX,
      y: cur.centerY,
      p1: { x: cur.centerX - nx * half, y: cur.centerY - ny * half },
      p2: { x: cur.centerX + nx * half, y: cur.centerY + ny * half },
      isKeyframe: keyframeSet.has(f),
    });
  }

  return { polyline, frameTicks };
}
