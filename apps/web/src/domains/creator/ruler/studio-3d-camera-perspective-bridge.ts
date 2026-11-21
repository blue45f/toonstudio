/**
 * 3D 카메라(Three.js Projection×View 4×4 행렬 및 fov/aspect/position/target) → 2D 원근 자 실시간 동기화 브리지.
 *
 * - `three` 런타임 의존성 없이 순수 열 우선(column-major) 4×4 행렬 사영 수학으로 동작하여
 *   2D 스튜디오 초기 번들(`studio-eager-graph`) 예산을 유지한다.
 * - 무한원점 $M \cdot (d_x, d_y, d_z, 0)^T$ 투영으로 세계 X/Y/Z 3개 주축 소실점(VP1/VP2/VP3)과
 *   수평면(XZ)의 소실선(Horizon/Eye-Level)을 정확히 계산한다(더치 롤·줌·렌즈 시프트·직교 투영 포함).
 */

import {
  buildPerspectiveGuideSegments,
  normalizePerspectiveGuide,
  type PerspectiveAuxiliaryGuideKind,
  type PerspectiveGridDensity,
  type PerspectiveGuide,
  type PerspectiveGuideDisplayMode,
} from "../drawing/studio-perspective-guide";

import type { StudioBg3dCameraSettings } from "../bg3d/studio-bg3d-scene-document-types";
import type { StudioPerspectiveAssistDocument } from "../brush/studio-drawing-assist-document";
import type {
  StudioPerspectiveCameraMode,
  StudioSyncedPerspectiveRig,
} from "../drawing/studio-perspective-3d-camera-sync";
import type { StudioPerspectiveGuideState } from "../drawing/StudioRulersPanel";
import type { VanishingPoint } from "../studio-perspective-guide";

export type Vec3Tuple = readonly [number, number, number];
export type Mat4Elements = ArrayLike<number>;
export interface ThreeMatrix4Like { readonly elements: Mat4Elements; }
export interface ThreeVector3Like { readonly x: number; readonly y: number; readonly z: number; }

/** Three.js PerspectiveCamera / OrthographicCamera 구조적 인터페이스(런타임 three import 없음). */
export interface ThreeCameraMatrixLike {
  readonly projectionMatrix: ThreeMatrix4Like;
  readonly matrixWorldInverse: ThreeMatrix4Like;
  readonly isOrthographicCamera?: boolean;
  readonly isPerspectiveCamera?: boolean;
  readonly updateMatrixWorld?: (force?: boolean) => void;
  readonly updateProjectionMatrix?: () => void;
}

export interface Studio3dCameraMatricesInput {
  readonly kind: "matrices";
  readonly projectionMatrix: Mat4Elements | ThreeMatrix4Like;
  readonly viewMatrix: Mat4Elements | ThreeMatrix4Like;
  readonly isOrthographic?: boolean;
}

export interface Studio3dCameraViewProjectionInput {
  readonly kind: "view-projection";
  readonly viewProjectionMatrix: Mat4Elements | ThreeMatrix4Like;
  readonly isOrthographic?: boolean;
}

export interface Studio3dCameraLookAtInput {
  readonly kind: "look-at";
  readonly position: Vec3Tuple | ThreeVector3Like;
  readonly target: Vec3Tuple | ThreeVector3Like;
  readonly up?: Vec3Tuple | ThreeVector3Like;
  readonly fovDeg: number;
  readonly aspect?: number;
  readonly zoom?: number;
  readonly lensShift?: readonly [number, number];
  readonly near?: number;
  readonly far?: number;
}

export interface Studio3dCameraBg3dSettingsInput {
  readonly kind: "bg3d-settings";
  readonly settings: StudioBg3dCameraSettings;
  readonly aspect?: number;
}

export type Studio3dCameraSource =
  | ThreeCameraMatrixLike
  | Studio3dCameraMatricesInput
  | Studio3dCameraViewProjectionInput
  | Studio3dCameraLookAtInput
  | Studio3dCameraBg3dSettingsInput;

export interface Studio3dViewportSize { readonly width: number; readonly height: number; }
export type Studio3dAxisName = "x" | "y" | "z";
export type Studio3dVanishingPointSlot = "vp1" | "vp2" | "vp3";
export type Studio3dRigAxisName = "x-right" | "z-forward" | "y-vertical";

export interface Studio3dAxisVanishingPoint {
  readonly axis: Studio3dAxisName;
  readonly slot: Studio3dVanishingPointSlot;
  readonly rigAxis: Studio3dRigAxisName;
  readonly finite: boolean;
  readonly inFront: boolean;
  readonly x: number;
  readonly y: number;
  readonly ndcX: number;
  readonly ndcY: number;
  readonly clipW: number;
  readonly parallelDirection: readonly [number, number];
}

export interface Studio3dHorizonLine {
  readonly visible: boolean;
  readonly eyeLevelY: number;
  /** 캔버스 좌표계(y 아래 방향) 기준 수평선 기울기(라디안, [-π/2, π/2]). */
  readonly angleRad: number;
  readonly angleDeg: number;
  /** 정규화 직선 방정식 a*x + b*y + c = 0 (hypot(a,b) = 1). */
  readonly line: { readonly a: number; readonly b: number; readonly c: number };
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
}

export interface Studio3dCameraPerspectiveProjection {
  readonly projectionKind: "perspective" | "orthographic";
  readonly mode: StudioPerspectiveCameraMode;
  readonly viewport: Studio3dViewportSize;
  /** 세계 X축 소실점 */
  readonly vp1: Studio3dAxisVanishingPoint;
  /** 세계 Z축 소실점 */
  readonly vp2: Studio3dAxisVanishingPoint;
  /** 세계 Y축(수직) 소실점 */
  readonly vp3: Studio3dAxisVanishingPoint;
  readonly axes: Readonly<Record<Studio3dAxisName, Studio3dAxisVanishingPoint>>;
  /** 유한 소실점 목록(수평 좌→우 정렬 후 수직 VP3). */
  readonly vanishingPoints: readonly Studio3dAxisVanishingPoint[];
  readonly horizon: Studio3dHorizonLine;
  readonly eyeLevelY: number;
  readonly lockHorizon: boolean;
  readonly viewProjectionMatrix: readonly number[];
}

export interface Project3dCameraOptions {
  readonly parallelWThreshold?: number;
  readonly maxDistanceFactor?: number;
  readonly horizonLevelEpsilonRad?: number;
  readonly refreshCameraMatrices?: boolean;
  readonly worldAxes?: { readonly x: Vec3Tuple; readonly y: Vec3Tuple; readonly z: Vec3Tuple };
}

export interface PerspectiveGuideSyncOptions {
  readonly enabled?: boolean;
  readonly snapEnabled?: boolean;
  readonly gridDensity?: PerspectiveGridDensity;
  readonly displayMode?: PerspectiveGuideDisplayMode;
  readonly auxiliaryKind?: PerspectiveAuxiliaryGuideKind;
}

export interface Studio3dCameraPerspectiveBridgeSnapshot {
  readonly projection: Studio3dCameraPerspectiveProjection;
  readonly rig: StudioSyncedPerspectiveRig;
  readonly assist: StudioPerspectiveAssistDocument;
  readonly guideState: StudioPerspectiveGuideState;
  readonly signature: string;
}

export interface Studio3dCameraPerspectiveBridgeOptions extends Project3dCameraOptions {
  readonly viewport: Studio3dViewportSize;
  readonly enabled?: boolean;
  readonly matrixEpsilon?: number;
  readonly guideOptions?: PerspectiveGuideSyncOptions;
  readonly onSync?: (snapshot: Studio3dCameraPerspectiveBridgeSnapshot) => void;
}

export interface Studio3dCameraPerspectiveBridge {
  sync(source: Studio3dCameraSource, viewportOverride?: Studio3dViewportSize): Studio3dCameraPerspectiveBridgeSnapshot | null;
  syncFromRig(rig: StudioSyncedPerspectiveRig, viewportOverride?: Studio3dViewportSize): Studio3dCameraPerspectiveBridgeSnapshot | null;
  subscribe(listener: (snapshot: Studio3dCameraPerspectiveBridgeSnapshot) => void): () => void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  setViewport(viewport: Studio3dViewportSize): void;
  getSnapshot(): Studio3dCameraPerspectiveBridgeSnapshot | null;
  dispose(): void;
}

export interface PerspectiveRulerSyncHandlers {
  readonly setActive: (next: boolean) => void;
  readonly setLockHorizon: (next: boolean) => void;
  readonly setEyeLevelY: (y: number) => void;
  readonly addPoint: () => void;
  readonly removePoint: (id: string) => void;
  readonly movePoint: (id: string, x: number, y: number) => void;
}

const DEFAULT_WORLD_X: Vec3Tuple = [1, 0, 0];
const DEFAULT_WORLD_Y: Vec3Tuple = [0, 1, 0];
const DEFAULT_WORLD_Z: Vec3Tuple = [0, 0, 1];
const IDENTITY_MAT4: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const round2 = (v: number): number => Math.round(v * 100) / 100;

function sanitizeViewport(vp: Studio3dViewportSize): Studio3dViewportSize {
  return {
    width: Number.isFinite(vp.width) && vp.width > 0 ? vp.width : 800,
    height: Number.isFinite(vp.height) && vp.height > 0 ? vp.height : 1200,
  };
}

function toVec3(v: Vec3Tuple | ThreeVector3Like): Vec3Tuple {
  if (Array.isArray(v)) return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
  const o = v as ThreeVector3Like;
  return [Number(o.x) || 0, Number(o.y) || 0, Number(o.z) || 0];
}

function normalize3(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  return Number.isFinite(len) && len >= 1e-12 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
}

function cross3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

const dot3 = (a: Vec3Tuple, b: Vec3Tuple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function readMat4(input: Mat4Elements | ThreeMatrix4Like): number[] | null {
  const raw = "elements" in input ? input.elements : input;
  if (!raw || raw.length < 16) return null;
  const out = new Array<number>(16);
  for (let i = 0; i < 16; i += 1) {
    const val = raw[i];
    if (typeof val !== "number" || !Number.isFinite(val)) return null;
    out[i] = val;
  }
  return out;
}

/** 열 우선(column-major) 4×4 행렬 곱 $A \times B$. Three.js `Matrix4.multiplyMatrices`와 동일하다. */
export function multiplyMat4(a: Mat4Elements, b: Mat4Elements): number[] {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col += 1) {
    const b0 = b[col * 4]!, b1 = b[col * 4 + 1]!, b2 = b[col * 4 + 2]!, b3 = b[col * 4 + 3]!;
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] = a[row]! * b0 + a[4 + row]! * b1 + a[8 + row]! * b2 + a[12 + row]! * b3;
    }
  }
  return out;
}

/** Three.js 오른손 좌표계 `camera.lookAt(target)`의 `matrixWorldInverse`(View 행렬)를 생성한다. */
export function buildViewMatrixFromLookAt(
  position: Vec3Tuple | ThreeVector3Like,
  target: Vec3Tuple | ThreeVector3Like,
  up: Vec3Tuple | ThreeVector3Like = DEFAULT_WORLD_Y,
): number[] {
  const eye = toVec3(position);
  const tgt = toVec3(target);
  const upVec = toVec3(up);

  let zAxis = normalize3([eye[0] - tgt[0], eye[1] - tgt[1], eye[2] - tgt[2]]);
  if (zAxis[0] === 0 && zAxis[1] === 0 && zAxis[2] === 0) zAxis = [0, 0, 1];
  let xAxis = normalize3(cross3(upVec, zAxis));
  if (xAxis[0] === 0 && xAxis[1] === 0 && xAxis[2] === 0) {
    xAxis = normalize3(cross3(Math.abs(upVec[2]) > 0.99 ? [1, 0, 0] : [0, 0, 1], zAxis));
  }
  const yAxis = cross3(zAxis, xAxis);

  return [
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dot3(xAxis, eye), -dot3(yAxis, eye), -dot3(zAxis, eye), 1,
  ];
}

/** Three.js `PerspectiveCamera.updateProjectionMatrix()`와 동일한 열 우선 4×4 투영 행렬을 생성한다. */
export function buildPerspectiveProjectionMatrix(params: {
  readonly fovDeg: number;
  readonly aspect: number;
  readonly near?: number;
  readonly far?: number;
  readonly zoom?: number;
  readonly lensShift?: readonly [number, number];
}): number[] {
  const fovDeg = Math.max(1, Math.min(175, Number.isFinite(params.fovDeg) ? params.fovDeg : 50));
  const aspect = Number.isFinite(params.aspect) && params.aspect > 0 ? params.aspect : 1;
  const near = Number.isFinite(params.near) && (params.near as number) > 0 ? (params.near as number) : 0.1;
  const far = Number.isFinite(params.far) && (params.far as number) > near ? (params.far as number) : 2000;
  const zoom = Number.isFinite(params.zoom) && (params.zoom as number) > 0 ? (params.zoom as number) : 1;
  const shiftX = params.lensShift && Number.isFinite(params.lensShift[0]) ? params.lensShift[0] : 0;
  const shiftY = params.lensShift && Number.isFinite(params.lensShift[1]) ? params.lensShift[1] : 0;

  const topHalf = (near * Math.tan(0.5 * fovDeg * DEG_TO_RAD)) / zoom;
  const height = 2 * topHalf;
  const width = aspect * height;
  const left = -0.5 * width + shiftX * width;
  const right = left + width;
  const top = topHalf - shiftY * height;
  const bottom = top - height;

  return [
    (2 * near) / (right - left), 0, 0, 0,
    0, (2 * near) / (top - bottom), 0, 0,
    (right + left) / (right - left), (top + bottom) / (top - bottom), -(far + near) / (far - near), -1,
    0, 0, (-2 * far * near) / (far - near), 0,
  ];
}

const isOrthoProj = (p: readonly number[]): boolean => Math.abs(p[15]!) > 1e-6 && Math.abs(p[11]!) < 1e-6;
const isThreeCamera = (s: Studio3dCameraSource): s is ThreeCameraMatrixLike =>
  !("kind" in s) && "projectionMatrix" in s && "matrixWorldInverse" in s;

/** 다양한 3D 카메라 입력에서 열 우선 4×4 `Projection × View` 행렬을 추출한다. */
export function resolveViewProjectionMatrix(
  source: Studio3dCameraSource,
  viewport: Studio3dViewportSize,
  options?: { readonly refreshCameraMatrices?: boolean },
): { readonly matrix: number[]; readonly projectionKind: "perspective" | "orthographic" } | null {
  const safeVp = sanitizeViewport(viewport);
  const defaultAspect = safeVp.width / safeVp.height;

  if (isThreeCamera(source)) {
    if (options?.refreshCameraMatrices) {
      source.updateProjectionMatrix?.();
      source.updateMatrixWorld?.(true);
    }
    const proj = readMat4(source.projectionMatrix);
    const view = readMat4(source.matrixWorldInverse);
    if (!proj || !view) return null;
    const ortho = source.isOrthographicCamera === true || isOrthoProj(proj);
    return { matrix: multiplyMat4(proj, view), projectionKind: ortho ? "orthographic" : "perspective" };
  }
  if (source.kind === "matrices") {
    const proj = readMat4(source.projectionMatrix);
    const view = readMat4(source.viewMatrix);
    if (!proj || !view) return null;
    const ortho = source.isOrthographic === true || isOrthoProj(proj);
    return { matrix: multiplyMat4(proj, view), projectionKind: ortho ? "orthographic" : "perspective" };
  }
  if (source.kind === "view-projection") {
    const vp = readMat4(source.viewProjectionMatrix);
    if (!vp) return null;
    const ortho = source.isOrthographic === true
      || (Math.abs(vp[3]!) < 1e-9 && Math.abs(vp[7]!) < 1e-9 && Math.abs(vp[11]!) < 1e-9 && Math.abs(vp[15]!) > 1e-6);
    return { matrix: vp, projectionKind: ortho ? "orthographic" : "perspective" };
  }
  if (source.kind === "bg3d-settings") {
    const { settings } = source;
    const view = buildViewMatrixFromLookAt(settings.position, settings.target, settings.up ?? DEFAULT_WORLD_Y);
    if (settings.projection === "orthographic") return { matrix: view, projectionKind: "orthographic" };
    const aspect = source.aspect && Number.isFinite(source.aspect) && source.aspect > 0 ? source.aspect : defaultAspect;
    const proj = buildPerspectiveProjectionMatrix({
      fovDeg: settings.fovDegrees,
      aspect,
      zoom: settings.zoom ?? 1,
      lensShift: settings.lensShift,
      near: settings.nearClip ?? 0.1,
    });
    return { matrix: multiplyMat4(proj, view), projectionKind: "perspective" };
  }
  const aspect = source.aspect && Number.isFinite(source.aspect) && source.aspect > 0 ? source.aspect : defaultAspect;
  const proj = buildPerspectiveProjectionMatrix({
    fovDeg: source.fovDeg, aspect, zoom: source.zoom ?? 1, lensShift: source.lensShift, near: source.near ?? 0.1, far: source.far ?? 2000,
  });
  const view = buildViewMatrixFromLookAt(source.position, source.target, source.up ?? DEFAULT_WORLD_Y);
  return { matrix: multiplyMat4(proj, view), projectionKind: "perspective" };
}

function projectDirectionToClip(m: readonly number[], dir: Vec3Tuple) {
  const [dx, dy, dz] = normalize3(dir);
  return {
    cx: m[0]! * dx + m[4]! * dy + m[8]! * dz,
    cy: m[1]! * dx + m[5]! * dy + m[9]! * dz,
    cw: m[3]! * dx + m[7]! * dy + m[11]! * dz,
  };
}

/** 3D 세계 방향 벡터를 무한원점 $(d_x, d_y, d_z, 0)^T$으로 사영해 2D 캔버스 소실점 좌표를 계산한다. */
export function projectWorldDirectionToVanishingPoint(
  vpMatrix: readonly number[],
  direction: Vec3Tuple,
  viewport: Studio3dViewportSize,
  meta: { readonly axis: Studio3dAxisName; readonly slot: Studio3dVanishingPointSlot; readonly rigAxis: Studio3dRigAxisName },
  options?: Pick<Project3dCameraOptions, "parallelWThreshold" | "maxDistanceFactor">,
): Studio3dAxisVanishingPoint {
  const safeVp = sanitizeViewport(viewport);
  const wThreshold = options?.parallelWThreshold ?? 1e-4;
  const maxDistPx = Math.max(safeVp.width, safeVp.height) * (options?.maxDistanceFactor ?? 100);
  const { cx, cy, cw } = projectDirectionToClip(vpMatrix, direction);
  const sx = cx * safeVp.width * 0.5;
  const sy = -cy * safeVp.height * 0.5;
  const dirLen = Math.hypot(sx, sy);
  const parallelDirection: readonly [number, number] = dirLen > 1e-12 ? [sx / dirLen, sy / dirLen] : [1, 0];

  if (!Number.isFinite(cw) || Math.abs(cw) < wThreshold) {
    return { ...meta, finite: false, inFront: cw >= 0, x: Number.NaN, y: Number.NaN, ndcX: Number.NaN, ndcY: Number.NaN, clipW: cw, parallelDirection };
  }
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const x = (ndcX * 0.5 + 0.5) * safeVp.width;
  const y = (0.5 - ndcY * 0.5) * safeVp.height;
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - safeVp.width * 0.5, y - safeVp.height * 0.5) > maxDistPx) {
    return { ...meta, finite: false, inFront: cw > 0, x: Number.NaN, y: Number.NaN, ndcX, ndcY, clipW: cw, parallelDirection };
  }
  return { ...meta, finite: true, inFront: cw > 0, x: round2(x), y: round2(y), ndcX, ndcY, clipW: cw, parallelDirection };
}

/** 수평면(세계 X·Z 기저)의 두 무한원점을 사영 평면 외적으로 결합해 정확한 수평선 방정식을 구한다. */
function computeHorizonLine(
  vpMatrix: readonly number[],
  axisX: Vec3Tuple,
  axisZ: Vec3Tuple,
  viewport: Studio3dViewportSize,
  projectionKind: "perspective" | "orthographic",
): Studio3dHorizonLine {
  const { width, height } = viewport;
  const fallbackY = round2(height * 0.5);
  const fallback: Studio3dHorizonLine = {
    visible: false, eyeLevelY: fallbackY, angleRad: 0, angleDeg: 0,
    line: { a: 0, b: 1, c: -fallbackY }, start: { x: 0, y: fallbackY }, end: { x: width, y: fallbackY },
  };
  if (projectionKind === "orthographic") return fallback;

  const hx = projectDirectionToClip(vpMatrix, axisX);
  const hz = projectDirectionToClip(vpMatrix, axisZ);
  const sx0 = 0.5 * width * (hx.cx + hx.cw), sy0 = 0.5 * height * (hx.cw - hx.cy), sw0 = hx.cw;
  const sx1 = 0.5 * width * (hz.cx + hz.cw), sy1 = 0.5 * height * (hz.cw - hz.cy), sw1 = hz.cw;

  let a = sy0 * sw1 - sw0 * sy1;
  let b = sw0 * sx1 - sx0 * sw1;
  let c = sx0 * sy1 - sy0 * sx1;
  const norm = Math.hypot(a, b);
  if (!Number.isFinite(norm) || norm < 1e-9) return fallback;
  a /= norm; b /= norm; c /= norm;
  if (b < 0 || (Math.abs(b) < 1e-12 && a < 0)) { a = -a; b = -b; c = -c; }

  let angleRad = Math.atan2(-a, b);
  if (Math.abs(angleRad) < 1e-10) angleRad = 0;

  if (Math.abs(b) > 1e-6) {
    const eyeLevelY = round2(-(a * width * 0.5 + c) / b);
    return {
      visible: Number.isFinite(eyeLevelY),
      eyeLevelY: Number.isFinite(eyeLevelY) ? eyeLevelY : fallbackY,
      angleRad,
      angleDeg: round2(angleRad * RAD_TO_DEG),
      line: { a, b, c },
      start: { x: 0, y: round2(-c / b) },
      end: { x: width, y: round2(-(a * width + c) / b) },
    };
  }
  const xLine = round2(-c / a);
  return {
    visible: Number.isFinite(xLine), eyeLevelY: fallbackY, angleRad, angleDeg: round2(angleRad * RAD_TO_DEG),
    line: { a, b, c }, start: { x: xLine, y: 0 }, end: { x: xLine, y: height },
  };
}

function emptyAxisVp(axis: Studio3dAxisName, slot: Studio3dVanishingPointSlot, rigAxis: Studio3dRigAxisName): Studio3dAxisVanishingPoint {
  return {
    axis, slot, rigAxis, finite: false, inFront: false, x: Number.NaN, y: Number.NaN,
    ndcX: Number.NaN, ndcY: Number.NaN, clipW: 0, parallelDirection: axis === "y" ? [0, 1] : [1, 0],
  };
}

/** 3D 카메라에서 X/Y/Z 3개 주축 소실점(VP1/VP2/VP3)과 수평선(Horizon/Eye-Level)을 정확히 투영한다. */
export function project3dCameraToPerspective(
  source: Studio3dCameraSource,
  viewport: Studio3dViewportSize,
  options?: Project3dCameraOptions,
): Studio3dCameraPerspectiveProjection {
  const safeVp = sanitizeViewport(viewport);
  const resolved = resolveViewProjectionMatrix(source, safeVp, options);
  const axisX = options?.worldAxes?.x ?? DEFAULT_WORLD_X;
  const axisY = options?.worldAxes?.y ?? DEFAULT_WORLD_Y;
  const axisZ = options?.worldAxes?.z ?? DEFAULT_WORLD_Z;

  if (!resolved) {
    const vp1 = emptyAxisVp("x", "vp1", "x-right");
    const vp2 = emptyAxisVp("z", "vp2", "z-forward");
    const vp3 = emptyAxisVp("y", "vp3", "y-vertical");
    const horizon = computeHorizonLine(IDENTITY_MAT4, axisX, axisZ, safeVp, "orthographic");
    return {
      projectionKind: "orthographic", mode: "1p", viewport: safeVp, vp1, vp2, vp3,
      axes: { x: vp1, y: vp3, z: vp2 }, vanishingPoints: [], horizon,
      eyeLevelY: horizon.eyeLevelY, lockHorizon: true, viewProjectionMatrix: IDENTITY_MAT4,
    };
  }

  const { matrix, projectionKind } = resolved;
  const axisOpts = projectionKind === "orthographic" ? { parallelWThreshold: Number.POSITIVE_INFINITY } : options;
  const vp1 = projectWorldDirectionToVanishingPoint(matrix, axisX, safeVp, { axis: "x", slot: "vp1", rigAxis: "x-right" }, axisOpts);
  const vp2 = projectWorldDirectionToVanishingPoint(matrix, axisZ, safeVp, { axis: "z", slot: "vp2", rigAxis: "z-forward" }, axisOpts);
  const vp3 = projectWorldDirectionToVanishingPoint(matrix, axisY, safeVp, { axis: "y", slot: "vp3", rigAxis: "y-vertical" }, axisOpts);
  const horizon = computeHorizonLine(matrix, axisX, axisZ, safeVp, projectionKind);

  const horizontalVps = [vp1, vp2].filter((vp) => vp.finite).sort((a, b) => a.x - b.x);
  const vanishingPoints = vp3.finite ? [...horizontalVps, vp3] : horizontalVps;
  const mode: StudioPerspectiveCameraMode = vanishingPoints.length >= 3 ? "3p" : vanishingPoints.length === 2 ? "2p" : "1p";
  const lockHorizon = !vp3.finite && Math.abs(horizon.angleRad) < (options?.horizonLevelEpsilonRad ?? 1e-3);

  return {
    projectionKind, mode, viewport: safeVp, vp1, vp2, vp3,
    axes: { x: vp1, y: vp3, z: vp2 }, vanishingPoints, horizon,
    eyeLevelY: horizon.eyeLevelY, lockHorizon, viewProjectionMatrix: matrix,
  };
}

/** 3D 투영 결과를 `StudioPerspectivePanel.onSyncFrom3dCamera` 리그 형식으로 변환한다. */
export function perspectiveRigFrom3dCameraProjection(projection: Studio3dCameraPerspectiveProjection): StudioSyncedPerspectiveRig {
  const points = projection.vanishingPoints.length > 0
    ? projection.vanishingPoints.map((vp) => ({ axis: vp.rigAxis, x: vp.x, y: vp.y }))
    : [{ axis: "z-forward" as const, x: round2(projection.viewport.width * 0.5), y: projection.eyeLevelY }];
  return { mode: projection.mode, eyeLevelY: projection.eyeLevelY, lockHorizon: projection.lockHorizon, points };
}

/** 3D 투영 결과를 페이지 영속 문서 모델(`StudioPerspectiveAssistDocument`)로 변환한다. */
export function perspectiveAssistFrom3dCameraProjection(
  projection: Studio3dCameraPerspectiveProjection,
  options?: { readonly existingPoints?: readonly VanishingPoint[]; readonly active?: boolean },
): StudioPerspectiveAssistDocument {
  const existing = options?.existingPoints ?? [];
  const points: VanishingPoint[] = projection.vanishingPoints.map((vp, idx) => ({
    id: existing[idx]?.id ?? `camera-3d-${vp.slot}`,
    x: vp.x,
    y: vp.y,
  }));
  return { active: options?.active ?? points.length > 0, points, eyeLevelY: projection.eyeLevelY, lockHorizon: projection.lockHorizon };
}

function buildGuideState(
  horizontal: readonly { readonly x: number; readonly y: number }[],
  vertical: { readonly x: number; readonly y: number } | undefined,
  horizonAngle: number,
  viewport: Studio3dViewportSize,
  eyeLevelY: number,
  options?: PerspectiveGuideSyncOptions,
  defaultEnabled = true,
): StudioPerspectiveGuideState {
  const safeVp = sanitizeViewport(viewport);
  const sorted = [...horizontal].sort((a, b) => a.x - b.x);
  const candidate: PerspectiveGuide = sorted.length >= 2 && vertical
    ? { kind: "three-point", horizonAngle, left: sorted[0]!, right: sorted[1]!, vertical }
    : sorted.length >= 2
      ? { kind: "two-point", horizonAngle, left: sorted[0]!, right: sorted[1]! }
      : sorted.length === 1
        ? { kind: "one-point", horizonAngle, left: sorted[0]! }
        : vertical
          ? { kind: "one-point", horizonAngle, left: vertical }
          : { kind: "one-point", horizonAngle: 0, left: { x: round2(safeVp.width * 0.5), y: eyeLevelY } };
  const guide = normalizePerspectiveGuide(candidate) ?? {
    kind: "one-point", horizonAngle: 0, left: { x: round2(safeVp.width * 0.5), y: round2(safeVp.height * 0.5) },
  };
  const enabled = options?.enabled ?? defaultEnabled;
  const snapEnabled = options?.snapEnabled ?? true;
  const gridDensity = options?.gridDensity ?? "standard";
  const displayMode = options?.displayMode ?? "linear";
  const auxiliaryKind = options?.auxiliaryKind ?? "none";
  return {
    enabled, snapEnabled, guide, presetId: null, gridDensity, displayMode, auxiliaryKind,
    segments: enabled
      ? buildPerspectiveGuideSegments({ guide, canvas: safeVp, options: { density: gridDensity, displayMode, auxiliaryKind } })
      : [],
  };
}

/** 3D 투영 결과를 캔버스 원근 가이드 상태(`StudioPerspectiveGuideState`)로 변환한다. */
export function perspectiveGuideStateFrom3dCameraProjection(
  projection: Studio3dCameraPerspectiveProjection,
  options?: PerspectiveGuideSyncOptions,
): StudioPerspectiveGuideState {
  const horizontal = [projection.vp1, projection.vp2].filter((vp) => vp.finite).map((vp) => ({ x: vp.x, y: vp.y }));
  const vertical = projection.vp3.finite ? { x: projection.vp3.x, y: projection.vp3.y } : undefined;
  return buildGuideState(
    horizontal, vertical, projection.horizon.angleRad, projection.viewport, projection.eyeLevelY,
    options, projection.vanishingPoints.length > 0,
  );
}

/** `StudioSyncedPerspectiveRig`를 캔버스 원근 가이드 상태(`StudioPerspectiveGuideState`)로 변환한다. */
export function perspectiveGuideStateFromSyncedRig(
  rig: StudioSyncedPerspectiveRig,
  viewport: Studio3dViewportSize,
  options?: PerspectiveGuideSyncOptions,
): StudioPerspectiveGuideState {
  const horizontal = rig.points.filter((pt) => pt.axis !== "y-vertical").map((pt) => ({ x: pt.x, y: pt.y }));
  const verticalRaw = rig.points.find((pt) => pt.axis === "y-vertical");
  return buildGuideState(horizontal, verticalRaw ? { x: verticalRaw.x, y: verticalRaw.y } : undefined, 0, viewport, rig.eyeLevelY, options, true);
}

/** 단일 원근 자를 끌 때 `drawingPerspectiveGuide` 상태를 해제한다. */
export function createDisabledPerspectiveGuideState(viewport: Studio3dViewportSize): StudioPerspectiveGuideState {
  const safeVp = sanitizeViewport(viewport);
  return buildGuideState([], undefined, 0, safeVp, round2(safeVp.height * 0.5), { enabled: false, snapEnabled: false }, false);
}

/** 3D 카메라 동기화 리그를 기존 문서 원근 자 핸들러 집합에 일괄 반영한다. */
export function applyPerspectiveRigToRulerHandlers(
  rig: StudioSyncedPerspectiveRig,
  current: { readonly active: boolean; readonly points: readonly VanishingPoint[]; readonly maxVanishingPoints?: number },
  handlers: PerspectiveRulerSyncHandlers,
): StudioSyncedPerspectiveRig | null {
  const desiredCount = Math.min(Math.max(1, Math.floor(current.maxVanishingPoints ?? 3)), rig.points.length);
  if (!current.active) handlers.setActive(true);
  handlers.setLockHorizon(rig.lockHorizon);
  handlers.setEyeLevelY(rig.eyeLevelY);

  if (current.points.length === desiredCount) {
    for (let i = 0; i < desiredCount; i += 1) {
      const vp = current.points[i], target = rig.points[i];
      if (vp && target) handlers.movePoint(vp.id, target.x, target.y);
    }
    return null;
  }
  if (current.points.length < desiredCount) {
    for (let i = 0; i < desiredCount - current.points.length; i += 1) handlers.addPoint();
  } else {
    for (const extra of current.points.slice(desiredCount)) handlers.removePoint(extra.id);
  }
  return rig;
}

/** 4×4 행렬과 뷰포트로부터 변경 감지용 결정적 시그니처를 만든다. */
export function cameraProjectionSignature(
  projection: Pick<Studio3dCameraPerspectiveProjection, "viewProjectionMatrix" | "viewport" | "projectionKind">,
  epsilon = 1e-5,
): string {
  const scale = epsilon > 0 ? 1 / epsilon : 1e5;
  const quantized = projection.viewProjectionMatrix.map((v) => Math.round(v * scale));
  return `${projection.projectionKind}:${Math.round(projection.viewport.width)}x${Math.round(projection.viewport.height)}:${quantized.join(",")}`;
}

/** 직전 시그니처와 달라진 유효 원근 카메라만 투영해 리그와 새 시그니처를 돌려준다. */
export function project3dCameraRigIfChanged(
  source: Studio3dCameraSource,
  viewport: Studio3dViewportSize,
  previousSignature: string | null,
): { readonly rig: StudioSyncedPerspectiveRig; readonly signature: string } | null {
  const projection = project3dCameraToPerspective(source, viewport);
  if (projection.projectionKind === "orthographic" || projection.vanishingPoints.length === 0) return null;
  const signature = cameraProjectionSignature(projection);
  if (signature === previousSignature) return null;
  return { rig: perspectiveRigFrom3dCameraProjection(projection), signature };
}

function matricesWithinEpsilon(a: readonly number[] | null, b: readonly number[], eps: number): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i]! - b[i]!) > eps) return false;
  }
  return true;
}

/** 3D 카메라 이동마다 2D 원근 자에 중복 발행 없이 라이브 동기화하는 브리지 컨트롤러를 생성한다. */
export function createStudio3dCameraPerspectiveBridge(
  options: Studio3dCameraPerspectiveBridgeOptions,
): Studio3dCameraPerspectiveBridge {
  let enabled = options.enabled ?? true;
  let viewport = sanitizeViewport(options.viewport);
  let lastMatrix: readonly number[] | null = null;
  let lastViewportKey = "";
  let snapshot: Studio3dCameraPerspectiveBridgeSnapshot | null = null;
  const matrixEpsilon = Math.max(0, options.matrixEpsilon ?? 1e-5);
  const listeners = new Set<(next: Studio3dCameraPerspectiveBridgeSnapshot) => void>();
  if (options.onSync) listeners.add(options.onSync);

  const emit = (next: Studio3dCameraPerspectiveBridgeSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener(next);
  };

  const rigVp = (
    rig: StudioSyncedPerspectiveRig,
    axis: Studio3dAxisName,
    slot: Studio3dVanishingPointSlot,
    rigAxis: Studio3dRigAxisName,
  ): Studio3dAxisVanishingPoint => {
    const found = rig.points.find((p) => p.axis === rigAxis);
    return found
      ? { axis, slot, rigAxis, finite: true, inFront: true, x: found.x, y: found.y, ndcX: Number.NaN, ndcY: Number.NaN, clipW: 1, parallelDirection: axis === "y" ? [0, 1] : [1, 0] }
      : emptyAxisVp(axis, slot, rigAxis);
  };

  return {
    sync(source, viewportOverride) {
      if (!enabled) return null;
      const targetVp = sanitizeViewport(viewportOverride ?? viewport);
      const vpKey = `${targetVp.width}x${targetVp.height}`;
      const projection = project3dCameraToPerspective(source, targetVp, options);
      if (snapshot && vpKey === lastViewportKey && matricesWithinEpsilon(lastMatrix, projection.viewProjectionMatrix, matrixEpsilon)) {
        return snapshot;
      }
      lastMatrix = projection.viewProjectionMatrix;
      lastViewportKey = vpKey;
      const next: Studio3dCameraPerspectiveBridgeSnapshot = {
        projection,
        rig: perspectiveRigFrom3dCameraProjection(projection),
        assist: perspectiveAssistFrom3dCameraProjection(projection, { existingPoints: snapshot?.assist.points }),
        guideState: perspectiveGuideStateFrom3dCameraProjection(projection, options.guideOptions),
        signature: cameraProjectionSignature(projection, matrixEpsilon),
      };
      emit(next);
      return next;
    },

    syncFromRig(rig, viewportOverride) {
      if (!enabled) return null;
      const targetVp = sanitizeViewport(viewportOverride ?? viewport);
      const vp1 = rigVp(rig, "x", "vp1", "x-right");
      const vp2 = rigVp(rig, "z", "vp2", "z-forward");
      const vp3 = rigVp(rig, "y", "vp3", "y-vertical");
      const horiz = [vp1, vp2].filter((vp) => vp.finite).sort((a, b) => a.x - b.x);
      const projection: Studio3dCameraPerspectiveProjection = {
        projectionKind: "perspective", mode: rig.mode, viewport: targetVp, vp1, vp2, vp3,
        axes: { x: vp1, y: vp3, z: vp2 }, vanishingPoints: vp3.finite ? [...horiz, vp3] : horiz,
        horizon: {
          visible: true, eyeLevelY: rig.eyeLevelY, angleRad: 0, angleDeg: 0,
          line: { a: 0, b: 1, c: -rig.eyeLevelY }, start: { x: 0, y: rig.eyeLevelY }, end: { x: targetVp.width, y: rig.eyeLevelY },
        },
        eyeLevelY: rig.eyeLevelY, lockHorizon: rig.lockHorizon, viewProjectionMatrix: IDENTITY_MAT4,
      };
      const assist: StudioPerspectiveAssistDocument = {
        active: true, eyeLevelY: rig.eyeLevelY, lockHorizon: rig.lockHorizon,
        points: rig.points.map((pt, idx) => ({ id: snapshot?.assist.points[idx]?.id ?? `camera-3d-vp${idx + 1}`, x: pt.x, y: pt.y })),
      };
      lastMatrix = null;
      lastViewportKey = `${targetVp.width}x${targetVp.height}`;
      const next: Studio3dCameraPerspectiveBridgeSnapshot = {
        projection, rig, assist,
        guideState: perspectiveGuideStateFromSyncedRig(rig, targetVp, options.guideOptions),
        signature: `rig:${rig.mode}:${rig.eyeLevelY}:${rig.points.map((p) => `${p.x},${p.y}`).join(";")}`,
      };
      emit(next);
      return next;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setEnabled(nextEnabled) { enabled = nextEnabled; },
    isEnabled() { return enabled; },
    setViewport(nextViewport) { viewport = sanitizeViewport(nextViewport); },
    getSnapshot() { return snapshot; },
    dispose() { listeners.clear(); lastMatrix = null; snapshot = null; },
  };
}
