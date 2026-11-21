/**
 * Toon Boom Harmony / OpenToonz 클린룸 2.5D 멀티플레인 Z-깊이 카메라 &
 * `Maintain Size` 자동 역보정 패럴랙스 엔진.
 *
 * 구성:
 * 1. `studio-function-curve.ts` 기반 5채널 2.5D 카메라(`camX`, `camY`, `camZ`, `focalLengthPx`, `rollDeg`)
 * 2. 투시 배율 `s = f / max(eps, camZ - zDepth)` 기반 레이어 평행이동·스케일·2x3 아핀 행렬·DoF 블러 평가
 * 3. `Maintain Size` 역보정(`applyMaintainSizeZShift`): Z 이동 시 현재 카메라 기준 겉보기 크기·화면 위치 100% 유지
 * 4. 세로 스크롤 패럴랙스 매핑(`evaluateVerticalScrollParallax`): 웹툰 스크롤 진행률을 가상 `camY`로 투영
 * 5. 보조 Top/Side 정투영 뷰 모델(`projectMultiplaneTopSideViews`): 프러스텀·레이어 배치 평면도 계산
 */

import {
  createEmptyFunctionCurveChannel,
  evaluateFunctionCurveChannel,
  upsertFunctionCurveKeyframe,
  type FunctionCurveChannel,
  type FunctionCurveInterpolation,
} from "./studio-function-curve";
import { multiplyMatrix2D, type AffineMatrix2D } from "./studio-light-table";

export const MIN_LAYER_Z_DEPTH = -1000;
export const MAX_LAYER_Z_DEPTH = 1000;
export const DEFAULT_FOCAL_LENGTH_PX = 1000;
export const DEFAULT_CAMERA_Z = 1000;
export const DEFAULT_NEAR_CLIP_EPS = 10;

export interface MultiplaneLayerSpec {
  readonly id: string;
  readonly name: string;
  /** 월드 X 중심(px). */
  readonly x: number;
  /** 월드 Y 중심(px). */
  readonly y: number;
  /** Z 깊이(`-1000..+1000`, 양수일수록 카메라에 가까운 전경, 0은 기준 평면). */
  readonly zDepth: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotationDeg: number;
  readonly opacity: number;
  readonly visible: boolean;
  /** 선택적 추가 패럴랙스 가중치(기본 1.0). */
  readonly parallaxMultiplier?: number;
}

export interface MultiplaneCameraChannels {
  readonly camX: FunctionCurveChannel;
  readonly camY: FunctionCurveChannel;
  readonly camZ: FunctionCurveChannel;
  readonly focalLengthPx: FunctionCurveChannel;
  readonly rollDeg: FunctionCurveChannel;
}

export interface MultiplaneDofSettings {
  readonly enabled: boolean;
  /** 초점이 맞는 월드 Z 평면(기본 0). */
  readonly focusPlaneZ: number;
  /** 초점 평면에서 벗어난 단위 깊이당 블러 계수. */
  readonly blurScale: number;
  readonly maxBlurPx: number;
}

export interface StudioMultiplaneCameraDoc {
  readonly id: string;
  readonly name: string;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly nearClipEps: number;
  readonly dof: MultiplaneDofSettings;
  readonly channels: MultiplaneCameraChannels;
  readonly layers: readonly MultiplaneLayerSpec[];
}

export interface EvaluatedMultiplaneCameraState {
  readonly camX: number;
  readonly camY: number;
  readonly camZ: number;
  readonly focalLengthPx: number;
  readonly rollDeg: number;
}

export interface EvaluatedMultiplaneLayerTransform {
  readonly layerId: string;
  readonly name: string;
  readonly zDepth: number;
  readonly depthDistance: number;
  readonly isBehindCamera: boolean;
  readonly visible: boolean;
  readonly perspectiveScale: number;
  /** 뷰포트 중심 기준 투시 이동 후 화면 좌표(px). */
  readonly screenX: number;
  readonly screenY: number;
  readonly effectiveScaleX: number;
  readonly effectiveScaleY: number;
  readonly effectiveRotationDeg: number;
  readonly opacity: number;
  readonly dofBlurPx: number;
  /** 레이어 로컬 원점 기준 뷰포트 투영 2x3 아핀 행렬. */
  readonly affineMatrix: AffineMatrix2D;
}

export interface MaintainSizeZShiftResult {
  readonly layer: MultiplaneLayerSpec;
  readonly previousZDepth: number;
  readonly appliedZDepth: number;
  readonly compensationRatio: number;
  readonly clampedToNearPlane: boolean;
}

export interface VerticalScrollParallaxOptions {
  /** 스크롤 0→1 동안 이동할 가상 카메라 세로 이동 거리(px). */
  readonly scrollTravelPx: number;
  /** 선택적 미세 수평 드리프트(px). */
  readonly horizontalDriftPx?: number;
  /** 선택적 미세 돌리 줌(Z 이동량). */
  readonly dollyZDelta?: number;
  /** 기준 프레임(기본 0). */
  readonly baseFrame?: number;
}

export interface TopSideProjectionPoint {
  readonly a: number;
  readonly b: number;
}

export interface MultiplaneTopSideProjection {
  readonly cameraTop: TopSideProjectionPoint;
  readonly cameraSide: TopSideProjectionPoint;
  /** Top View(X-Z) 프러스텀 3꼭짓점 `[카메라, 좌측원경, 우측원경]`. */
  readonly frustumTop: readonly [
    TopSideProjectionPoint,
    TopSideProjectionPoint,
    TopSideProjectionPoint,
  ];
  /** Side View(Z-Y) 프러스텀 3꼭짓점 `[카메라, 상단원경, 하단원경]`. */
  readonly frustumSide: readonly [
    TopSideProjectionPoint,
    TopSideProjectionPoint,
    TopSideProjectionPoint,
  ];
  readonly layerMarkers: readonly {
    readonly layerId: string;
    readonly name: string;
    readonly zDepth: number;
    readonly topCenter: TopSideProjectionPoint;
    readonly sideCenter: TopSideProjectionPoint;
    readonly apparentHalfWidth: number;
    readonly apparentHalfHeight: number;
  }[];
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

export function createMultiplaneCameraDoc(options: {
  readonly id: string;
  readonly name?: string;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly focalLengthPx?: number;
  readonly initialCamZ?: number;
  readonly nearClipEps?: number;
  readonly dof?: Partial<MultiplaneDofSettings>;
  readonly layers?: readonly MultiplaneLayerSpec[];
}): StudioMultiplaneCameraDoc {
  const viewportWidth = Math.max(1, Math.round(options.viewportWidth));
  const viewportHeight = Math.max(1, Math.round(options.viewportHeight));
  const focalLengthPx = clamp(options.focalLengthPx ?? DEFAULT_FOCAL_LENGTH_PX, 50, 10000);
  const initialCamZ = clamp(options.initialCamZ ?? focalLengthPx, 50, 10000);

  return {
    id: options.id,
    name: options.name?.trim() || "2.5D 멀티플레인 카메라",
    viewportWidth,
    viewportHeight,
    nearClipEps: clamp(options.nearClipEps ?? DEFAULT_NEAR_CLIP_EPS, 1, 500),
    dof: {
      enabled: options.dof?.enabled ?? false,
      focusPlaneZ: clamp(options.dof?.focusPlaneZ ?? 0, MIN_LAYER_Z_DEPTH, MAX_LAYER_Z_DEPTH),
      blurScale: clamp(options.dof?.blurScale ?? 0.015, 0, 2),
      maxBlurPx: clamp(options.dof?.maxBlurPx ?? 24, 0, 128),
    },
    channels: {
      camX: createEmptyFunctionCurveChannel("x", viewportWidth * 0.5),
      camY: createEmptyFunctionCurveChannel("y", viewportHeight * 0.5),
      camZ: createEmptyFunctionCurveChannel("scaleX", initialCamZ),
      focalLengthPx: createEmptyFunctionCurveChannel("scaleY", focalLengthPx),
      rollDeg: createEmptyFunctionCurveChannel("rotationDeg", 0),
    },
    layers: options.layers ? [...options.layers] : [],
  };
}

export function setMultiplaneCameraKeyframe(
  doc: StudioMultiplaneCameraDoc,
  frame: number,
  pose: Partial<EvaluatedMultiplaneCameraState>,
  interpolation: FunctionCurveInterpolation = "smooth",
): StudioMultiplaneCameraDoc {
  let { camX, camY, camZ, focalLengthPx, rollDeg } = doc.channels;
  if (pose.camX !== undefined) {
    camX = upsertFunctionCurveKeyframe(camX, {
      frame,
      value: pose.camX,
      interpolation,
      handleMode: "auto-monotone",
    });
  }
  if (pose.camY !== undefined) {
    camY = upsertFunctionCurveKeyframe(camY, {
      frame,
      value: pose.camY,
      interpolation,
      handleMode: "auto-monotone",
    });
  }
  if (pose.camZ !== undefined) {
    camZ = upsertFunctionCurveKeyframe(camZ, {
      frame,
      value: clamp(pose.camZ, doc.nearClipEps + 1, 20000),
      interpolation,
      handleMode: "auto-monotone",
    });
  }
  if (pose.focalLengthPx !== undefined) {
    focalLengthPx = upsertFunctionCurveKeyframe(focalLengthPx, {
      frame,
      value: clamp(pose.focalLengthPx, 50, 20000),
      interpolation,
      handleMode: "auto-monotone",
    });
  }
  if (pose.rollDeg !== undefined) {
    rollDeg = upsertFunctionCurveKeyframe(rollDeg, {
      frame,
      value: pose.rollDeg,
      interpolation,
      handleMode: "auto-monotone",
    });
  }
  return {
    ...doc,
    channels: { camX, camY, camZ, focalLengthPx, rollDeg },
  };
}

export function evaluateMultiplaneCameraAtFrame(
  doc: StudioMultiplaneCameraDoc,
  frame: number,
): EvaluatedMultiplaneCameraState {
  return {
    camX: evaluateFunctionCurveChannel(doc.channels.camX, frame),
    camY: evaluateFunctionCurveChannel(doc.channels.camY, frame),
    camZ: clamp(evaluateFunctionCurveChannel(doc.channels.camZ, frame), doc.nearClipEps + 1, 20000),
    focalLengthPx: clamp(evaluateFunctionCurveChannel(doc.channels.focalLengthPx, frame), 50, 20000),
    rollDeg: evaluateFunctionCurveChannel(doc.channels.rollDeg, frame),
  };
}

/**
 * 단일 멀티플레인 레이어의 2.5D 투시 변환·화면 좌표·2x3 행렬·DoF 블러를 계산한다.
 * 핵심 공식: `s = focalLengthPx / max(eps, camZ - zDepth)`,
 * `screenOffset = (layerXY - camXY) * s`.
 */
export function evaluateMultiplaneLayerTransform(
  layer: MultiplaneLayerSpec,
  camera: EvaluatedMultiplaneCameraState,
  options: {
    readonly viewportWidth: number;
    readonly viewportHeight: number;
    readonly nearClipEps?: number;
    readonly dof?: MultiplaneDofSettings;
  },
): EvaluatedMultiplaneLayerTransform {
  const eps = Math.max(1e-3, options.nearClipEps ?? DEFAULT_NEAR_CLIP_EPS);
  const zDepth = clamp(layer.zDepth, MIN_LAYER_Z_DEPTH, MAX_LAYER_Z_DEPTH);
  const depthDistance = camera.camZ - zDepth;
  const isBehindCamera = depthDistance <= eps;
  const safeDist = Math.max(eps, depthDistance);
  const perspectiveScale = camera.focalLengthPx / safeDist;
  const parallaxMul = clamp(layer.parallaxMultiplier ?? 1, 0, 4);

  const dx = (layer.x - camera.camX) * perspectiveScale * parallaxMul;
  const dy = (layer.y - camera.camY) * perspectiveScale * parallaxMul;

  const rollRad = (-camera.rollDeg * Math.PI) / 180;
  const rCos = Math.cos(rollRad);
  const rSin = Math.sin(rollRad);
  const rotatedDx = dx * rCos - dy * rSin;
  const rotatedDy = dx * rSin + dy * rCos;

  const screenX = options.viewportWidth * 0.5 + rotatedDx;
  const screenY = options.viewportHeight * 0.5 + rotatedDy;
  const effectiveScaleX = layer.scaleX * perspectiveScale;
  const effectiveScaleY = layer.scaleY * perspectiveScale;
  const effectiveRotationDeg = layer.rotationDeg - camera.rollDeg;

  const effRad = (effectiveRotationDeg * Math.PI) / 180;
  const lCos = Math.cos(effRad);
  const lSin = Math.sin(effRad);
  const scaleRot: AffineMatrix2D = [
    lCos * effectiveScaleX,
    lSin * effectiveScaleX,
    -lSin * effectiveScaleY,
    lCos * effectiveScaleY,
    0,
    0,
  ];
  const translate: AffineMatrix2D = [1, 0, 0, 1, screenX, screenY];
  const affineMatrix = multiplyMatrix2D(translate, scaleRot);

  let dofBlurPx = 0;
  if (options.dof?.enabled && !isBehindCamera) {
    const focusDist = Math.max(eps, camera.camZ - options.dof.focusPlaneZ);
    const circleOfConfusion =
      (Math.abs(safeDist - focusDist) / Math.max(eps, safeDist)) *
      camera.focalLengthPx *
      options.dof.blurScale;
    dofBlurPx = clamp(circleOfConfusion, 0, options.dof.maxBlurPx);
  }

  return {
    layerId: layer.id,
    name: layer.name,
    zDepth,
    depthDistance,
    isBehindCamera,
    visible: layer.visible && !isBehindCamera && layer.opacity > 0,
    perspectiveScale,
    screenX,
    screenY,
    effectiveScaleX,
    effectiveScaleY,
    effectiveRotationDeg,
    opacity: clamp(layer.opacity, 0, 1),
    dofBlurPx,
    affineMatrix,
  };
}

/**
 * 지정 프레임에서 모든 멀티플레인 레이어를 평가하고 원경→전경(`zDepth` 오름차순)으로 정렬해 반환한다.
 */
export function evaluateMultiplaneSceneAtFrame(
  doc: StudioMultiplaneCameraDoc,
  frame: number,
): {
  readonly camera: EvaluatedMultiplaneCameraState;
  readonly layers: readonly EvaluatedMultiplaneLayerTransform[];
} {
  const camera = evaluateMultiplaneCameraAtFrame(doc, frame);
  const sorted = [...doc.layers].sort((a, b) => a.zDepth - b.zDepth);
  const layers = sorted.map((layer) =>
    evaluateMultiplaneLayerTransform(layer, camera, {
      viewportWidth: doc.viewportWidth,
      viewportHeight: doc.viewportHeight,
      nearClipEps: doc.nearClipEps,
      dof: doc.dof,
    }),
  );
  return { camera, layers };
}

/**
 * Toon Boom Harmony / OpenToonz `Maintain Size` 자동 역보정:
 * 레이어를 `z0 → z1`로 이동할 때 현재 카메라 기준 겉보기 크기와 화면 위치를 100% 보존한다.
 * - `ratio = (camZ - z1) / (camZ - z0)`
 * - `scaleNext = scalePrev * ratio`
 * - `xyNext = camXY + (xyPrev - camXY) * ratio`
 */
export function applyMaintainSizeZShift(
  layer: MultiplaneLayerSpec,
  targetZDepth: number,
  camera: EvaluatedMultiplaneCameraState,
  nearClipEps = DEFAULT_NEAR_CLIP_EPS,
): MaintainSizeZShiftResult {
  const eps = Math.max(1e-3, nearClipEps);
  const maxSafeZ = Math.min(MAX_LAYER_Z_DEPTH, camera.camZ - eps);
  const prevZ = clamp(layer.zDepth, MIN_LAYER_Z_DEPTH, maxSafeZ);
  const clampedTarget = clamp(targetZDepth, MIN_LAYER_Z_DEPTH, maxSafeZ);
  const clampedToNearPlane = targetZDepth > maxSafeZ;

  const prevDist = Math.max(eps, camera.camZ - prevZ);
  const nextDist = Math.max(eps, camera.camZ - clampedTarget);
  const ratio = nextDist / prevDist;

  return {
    layer: {
      ...layer,
      zDepth: clampedTarget,
      x: camera.camX + (layer.x - camera.camX) * ratio,
      y: camera.camY + (layer.y - camera.camY) * ratio,
      scaleX: layer.scaleX * ratio,
      scaleY: layer.scaleY * ratio,
    },
    previousZDepth: prevZ,
    appliedZDepth: clampedTarget,
    compensationRatio: ratio,
    clampedToNearPlane,
  };
}

/** 문서 내 특정 레이어에 `Maintain Size` Z 이동을 비파괴 적용한 새 문서를 반환한다. */
export function shiftDocumentLayerZMaintainSize(
  doc: StudioMultiplaneCameraDoc,
  layerId: string,
  targetZDepth: number,
  frame: number,
): { readonly doc: StudioMultiplaneCameraDoc; readonly result: MaintainSizeZShiftResult | null } {
  const camera = evaluateMultiplaneCameraAtFrame(doc, frame);
  let shiftResult: MaintainSizeZShiftResult | null = null;
  const nextLayers = doc.layers.map((layer) => {
    if (layer.id !== layerId) return layer;
    shiftResult = applyMaintainSizeZShift(layer, targetZDepth, camera, doc.nearClipEps);
    return shiftResult.layer;
  });
  return {
    doc: shiftResult ? { ...doc, layers: nextLayers } : doc,
    result: shiftResult,
  };
}

/**
 * 웹툰 세로 스크롤 진행도(`0..1`)를 가상 2.5D 카메라 `camY`로 투영해
 * 전경·중경·원경 레이어의 패럴랙스 변환을 계산한다.
 */
export function evaluateVerticalScrollParallax(
  doc: StudioMultiplaneCameraDoc,
  scrollProgress01: number,
  options: VerticalScrollParallaxOptions,
): {
  readonly virtualCamera: EvaluatedMultiplaneCameraState;
  readonly layers: readonly EvaluatedMultiplaneLayerTransform[];
} {
  const p = clamp(scrollProgress01, 0, 1);
  const base = evaluateMultiplaneCameraAtFrame(doc, options.baseFrame ?? 0);
  const centered = p - 0.5;
  const virtualCamera: EvaluatedMultiplaneCameraState = {
    camX: base.camX + centered * (options.horizontalDriftPx ?? 0),
    camY: base.camY + p * options.scrollTravelPx,
    camZ: Math.max(doc.nearClipEps + 1, base.camZ + p * (options.dollyZDelta ?? 0)),
    focalLengthPx: base.focalLengthPx,
    rollDeg: base.rollDeg,
  };

  const sorted = [...doc.layers].sort((a, b) => a.zDepth - b.zDepth);
  const layers = sorted.map((layer) =>
    evaluateMultiplaneLayerTransform(layer, virtualCamera, {
      viewportWidth: doc.viewportWidth,
      viewportHeight: doc.viewportHeight,
      nearClipEps: doc.nearClipEps,
      dof: doc.dof,
    }),
  );
  return { virtualCamera, layers };
}

/**
 * 보조 Top(X-Z) 및 Side(Z-Y) 정투영 뷰에 표시할 카메라 프러스텀과 레이어 마커를 계산한다.
 */
export function projectMultiplaneTopSideViews(
  doc: StudioMultiplaneCameraDoc,
  frame: number,
  farPlaneZ = MIN_LAYER_Z_DEPTH,
): MultiplaneTopSideProjection {
  const cam = evaluateMultiplaneCameraAtFrame(doc, frame);
  const farDist = Math.max(doc.nearClipEps, cam.camZ - farPlaneZ);
  const halfFarW = (doc.viewportWidth * 0.5 * farDist) / cam.focalLengthPx;
  const halfFarH = (doc.viewportHeight * 0.5 * farDist) / cam.focalLengthPx;

  const layerMarkers = [...doc.layers]
    .sort((a, b) => a.zDepth - b.zDepth)
    .map((layer) => ({
      layerId: layer.id,
      name: layer.name,
      zDepth: layer.zDepth,
      topCenter: { a: layer.x, b: layer.zDepth },
      sideCenter: { a: layer.zDepth, b: layer.y },
      apparentHalfWidth: doc.viewportWidth * 0.5 * Math.abs(layer.scaleX),
      apparentHalfHeight: doc.viewportHeight * 0.5 * Math.abs(layer.scaleY),
    }));

  return {
    cameraTop: { a: cam.camX, b: cam.camZ },
    cameraSide: { a: cam.camZ, b: cam.camY },
    frustumTop: [
      { a: cam.camX, b: cam.camZ },
      { a: cam.camX - halfFarW, b: farPlaneZ },
      { a: cam.camX + halfFarW, b: farPlaneZ },
    ],
    frustumSide: [
      { a: cam.camZ, b: cam.camY },
      { a: farPlaneZ, b: cam.camY - halfFarH },
      { a: farPlaneZ, b: cam.camY + halfFarH },
    ],
    layerMarkers,
  };
}
