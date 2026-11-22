/**
 * 웹 표준 WebXR(`immersive-ar` / `inline`) 코믹 스테이지 프리뷰 및 2.5D 폴백 계산기.
 *
 * - HTTPS 보안 컨텍스트 및 `navigator.xr.isSessionSupported` 기반 기능 탐지
 * - 실물 단행본(B6), A5 화보집, 전시 벽면 패널, 탁상 아크릴 스탠드의 미터(m) 단위 투영 행렬 산출
 * - WebXR 비지원 브라우저·기기에서 포인터/자이로 기울기를 결정적 2.5D 패럴랙스 변환으로 환산
 * - DOM·브라우저 전역 객체에 강결합하지 않은 순수 함수형 모듈
 */

export const WEBXR_COMIC_STAGE_VERSION = 1 as const;

export type WebXrSessionMode = "immersive-ar" | "inline" | "fallback-2.5d";

export type Vec3 = readonly [number, number, number];

/** WebGL / WebXR 표준 column-major 4x4 행렬(길이 16 튜플). */
export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export interface WebXrSystemLike {
  readonly isSessionSupported?: (mode: "immersive-ar" | "inline") => Promise<boolean>;
}

export interface WebXrNavigatorLike {
  readonly xr?: WebXrSystemLike | null;
}

export interface WebXrStageCapabilityReport {
  readonly version: typeof WEBXR_COMIC_STAGE_VERSION;
  readonly secureContext: boolean;
  readonly hasXrApi: boolean;
  readonly immersiveArSupported: boolean;
  readonly inlineSupported: boolean;
  readonly recommendedMode: WebXrSessionMode;
  readonly fallbackReason: string | null;
}

export type ComicStagePhysicalPresetId =
  | "tankobon-b6"
  | "a5-artbook"
  | "gallery-wall-panel"
  | "desk-acrylic-stand"
  | "custom";

export interface ComicStagePhysicalTarget {
  readonly presetId: ComicStagePhysicalPresetId;
  readonly labelKo: string;
  readonly widthM: number;
  readonly heightM: number;
  readonly thicknessM: number;
  readonly defaultViewingDistanceM: number;
  readonly mountMode: "tabletop" | "wall";
}

export const COMIC_STAGE_PHYSICAL_PRESETS: Readonly<
  Record<Exclude<ComicStagePhysicalPresetId, "custom">, ComicStagePhysicalTarget>
> = Object.freeze({
  "tankobon-b6": Object.freeze({
    presetId: "tankobon-b6",
    labelKo: "단행본 B6 (128×182mm)",
    widthM: 0.128,
    heightM: 0.182,
    thicknessM: 0.016,
    defaultViewingDistanceM: 0.45,
    mountMode: "tabletop",
  }),
  "a5-artbook": Object.freeze({
    presetId: "a5-artbook",
    labelKo: "A5 단행본·화보집 (148×210mm)",
    widthM: 0.148,
    heightM: 0.21,
    thicknessM: 0.018,
    defaultViewingDistanceM: 0.55,
    mountMode: "tabletop",
  }),
  "gallery-wall-panel": Object.freeze({
    presetId: "gallery-wall-panel",
    labelKo: "전시 벽면 대형 패널 (900×1350mm)",
    widthM: 0.9,
    heightM: 1.35,
    thicknessM: 0.025,
    defaultViewingDistanceM: 2.2,
    mountMode: "wall",
  }),
  "desk-acrylic-stand": Object.freeze({
    presetId: "desk-acrylic-stand",
    labelKo: "탁상 아크릴 스탠드 (105×150mm)",
    widthM: 0.105,
    heightM: 0.15,
    thicknessM: 0.005,
    defaultViewingDistanceM: 0.4,
    mountMode: "tabletop",
  }),
});

export interface ComicStageProjectionInput {
  readonly presetId: ComicStagePhysicalPresetId;
  readonly customDimensionsM?: {
    readonly widthM: number;
    readonly heightM: number;
    readonly thicknessM?: number;
  };
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly viewingDistanceM?: number;
  readonly fovYRad?: number;
  readonly nearM?: number;
  readonly farM?: number;
  readonly anchorOffsetM?: Vec3;
  readonly yawRad?: number;
  readonly pitchRad?: number;
  readonly rollRad?: number;
  readonly uniformScale?: number;
}

export interface ProjectedNdcPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  readonly insideFrustum: boolean;
}

export interface ComicStageMeterScaleProjection {
  readonly target: ComicStagePhysicalTarget;
  readonly fittedWidthM: number;
  readonly fittedHeightM: number;
  readonly pixelsPerMeter: number;
  readonly viewingDistanceM: number;
  readonly modelMatrix: Mat4;
  readonly viewMatrix: Mat4;
  readonly projectionMatrix: Mat4;
  readonly mvpMatrix: Mat4;
  readonly screenCoverageRatio: number;
  readonly cornersNdc: readonly [
    ProjectedNdcPoint,
    ProjectedNdcPoint,
    ProjectedNdcPoint,
    ProjectedNdcPoint,
  ];
}

export interface ParallaxComicLayerInput {
  readonly id: string;
  /** 음수는 배경(뒤), 0은 기준면, 양수는 전경(앞) 깊이(m). */
  readonly depthMeters: number;
  readonly opacity?: number;
}

export interface ParallaxStageInput {
  readonly tiltX: number;
  readonly tiltY: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly layers: readonly ParallaxComicLayerInput[];
  readonly maxTiltDeg?: number;
  readonly maxShiftPx?: number;
  readonly perspectivePx?: number;
  readonly reducedMotion?: boolean;
}

export interface ParallaxLayerTransform {
  readonly id: string;
  readonly depthMeters: number;
  readonly opacity: number;
  readonly translateXPx: number;
  readonly translateYPx: number;
  readonly zOffsetPx: number;
  readonly scale: number;
  readonly cssTransform: string;
}

export interface ParallaxFallbackStageResult {
  readonly mode: "fallback-2.5d";
  readonly reducedMotionApplied: boolean;
  readonly rotateXDeg: number;
  readonly rotateYDeg: number;
  readonly perspectivePx: number;
  readonly shadowOffsetPx: readonly [number, number];
  readonly stageCssTransform: string;
  readonly layers: readonly ParallaxLayerTransform[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 현재 환경의 WebXR(`immersive-ar` / `inline`) 지원 여부를 안전하게 판정한다.
 * 비보안 컨텍스트이거나 WebXR API가 없으면 즉시 2.5D 폴백 모드를 권장한다.
 */
export async function detectWebXrComicStageCapabilities(env?: {
  readonly navigatorLike?: WebXrNavigatorLike | null;
  readonly isSecureContext?: boolean;
}): Promise<WebXrStageCapabilityReport> {
  const secureContext = env?.isSecureContext
    ?? (typeof globalThis.isSecureContext === "boolean" ? globalThis.isSecureContext : false);
  const navigatorLike = env?.navigatorLike !== undefined
    ? env.navigatorLike
    : (typeof navigator !== "undefined" ? (navigator as WebXrNavigatorLike) : null);
  const xr = navigatorLike?.xr ?? null;
  const hasXrApi = Boolean(xr && typeof xr.isSessionSupported === "function");

  if (!secureContext) {
    return Object.freeze({
      version: WEBXR_COMIC_STAGE_VERSION,
      secureContext: false,
      hasXrApi,
      immersiveArSupported: false,
      inlineSupported: false,
      recommendedMode: "fallback-2.5d",
      fallbackReason: "HTTPS 보안 컨텍스트가 아니므로 2.5D 패럴랙스 폴백으로 전환합니다.",
    });
  }

  if (!hasXrApi || !xr?.isSessionSupported) {
    return Object.freeze({
      version: WEBXR_COMIC_STAGE_VERSION,
      secureContext: true,
      hasXrApi: false,
      immersiveArSupported: false,
      inlineSupported: false,
      recommendedMode: "fallback-2.5d",
      fallbackReason: "이 브라우저에서 WebXR API를 지원하지 않아 2.5D 패럴랙스 폴백을 사용합니다.",
    });
  }

  const probe = async (mode: "immersive-ar" | "inline"): Promise<boolean> => {
    try {
      return Boolean(await xr.isSessionSupported?.(mode));
    } catch {
      return false;
    }
  };

  const [immersiveArSupported, inlineSupported] = await Promise.all([
    probe("immersive-ar"),
    probe("inline"),
  ]);

  if (immersiveArSupported) {
    return Object.freeze({
      version: WEBXR_COMIC_STAGE_VERSION,
      secureContext: true,
      hasXrApi: true,
      immersiveArSupported: true,
      inlineSupported,
      recommendedMode: "immersive-ar",
      fallbackReason: null,
    });
  }

  if (inlineSupported) {
    return Object.freeze({
      version: WEBXR_COMIC_STAGE_VERSION,
      secureContext: true,
      hasXrApi: true,
      immersiveArSupported: false,
      inlineSupported: true,
      recommendedMode: "inline",
      fallbackReason: "AR 패스스루 세션 미지원으로 인라인 WebXR 프리뷰를 사용합니다.",
    });
  }

  return Object.freeze({
    version: WEBXR_COMIC_STAGE_VERSION,
    secureContext: true,
    hasXrApi: true,
    immersiveArSupported: false,
    inlineSupported: false,
    recommendedMode: "fallback-2.5d",
    fallbackReason: "지원되는 WebXR 세션이 없어 2.5D 패럴랙스 폴백을 사용합니다.",
  });
}

/** Column-major 4x4 행렬 곱 `a * b`. */
export function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    const b0 = b[col * 4];
    const b1 = b[col * 4 + 1];
    const b2 = b[col * 4 + 2];
    const b3 = b[col * 4 + 3];
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[row] * b0 +
        a[4 + row] * b1 +
        a[8 + row] * b2 +
        a[12 + row] * b3;
    }
  }
  return Object.freeze(out) as unknown as Mat4;
}

/**
 * 오른손 좌표계 WebGL/WebXR 표준 투시 투영 행렬(NDC z ∈ [-1, 1])을 계산한다.
 */
export function computePerspectiveProjectionMatrix(params: {
  readonly fovYRad: number;
  readonly aspect: number;
  readonly nearM: number;
  readonly farM: number;
}): Mat4 {
  const fovY = clamp(params.fovYRad, 0.2, Math.PI * 0.85);
  const aspect = Math.max(0.1, Number.isFinite(params.aspect) ? params.aspect : 1);
  const near = Math.max(0.01, Number.isFinite(params.nearM) ? params.nearM : 0.05);
  const far = Math.max(near + 0.1, Number.isFinite(params.farM) ? params.farM : 50);

  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);

  return Object.freeze([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ] as const);
}

/**
 * 단위 평면([-0.5, 0.5]×[-0.5, 0.5])을 실물 미터(m) 크기로 스케일·회전·배치하는 모델 행렬을 생성한다.
 * 회전 순서는 Y(yaw) → X(pitch) → Z(roll)이다.
 */
export function computeComicStageModelMatrix(params: {
  readonly widthM: number;
  readonly heightM: number;
  readonly thicknessM?: number;
  readonly anchorPositionM: Vec3;
  readonly yawRad?: number;
  readonly pitchRad?: number;
  readonly rollRad?: number;
  readonly uniformScale?: number;
}): Mat4 {
  const scale = clamp(params.uniformScale ?? 1, 0.05, 10);
  const sx = Math.max(0.01, params.widthM) * scale;
  const sy = Math.max(0.01, params.heightM) * scale;
  const sz = Math.max(0.001, params.thicknessM ?? 0.01) * scale;

  const cy = Math.cos(params.yawRad ?? 0);
  const syr = Math.sin(params.yawRad ?? 0);
  const cx = Math.cos(params.pitchRad ?? 0);
  const sxr = Math.sin(params.pitchRad ?? 0);
  const cz = Math.cos(params.rollRad ?? 0);
  const szr = Math.sin(params.rollRad ?? 0);

  // R = Ry * Rx * Rz (column-major)
  const r00 = cy * cz + syr * sxr * szr;
  const r10 = cx * szr;
  const r20 = -syr * cz + cy * sxr * szr;

  const r01 = -cy * szr + syr * sxr * cz;
  const r11 = cx * cz;
  const r21 = syr * szr + cy * sxr * cz;

  const r02 = syr * cx;
  const r12 = -sxr;
  const r22 = cy * cx;

  const [tx, ty, tz] = params.anchorPositionM;

  return Object.freeze([
    r00 * sx, r10 * sx, r20 * sx, 0,
    r01 * sy, r11 * sy, r21 * sy, 0,
    r02 * sz, r12 * sz, r22 * sz, 0,
    tx, ty, tz, 1,
  ] as const);
}

/** 3D 로컬 좌표를 MVP 행렬로 클립 공간 → NDC로 투영한다. */
export function projectStagePointToNdc(mvp: Mat4, point: Vec3): ProjectedNdcPoint {
  const [px, py, pz] = point;
  const cx = mvp[0] * px + mvp[4] * py + mvp[8] * pz + mvp[12];
  const cy = mvp[1] * px + mvp[5] * py + mvp[9] * pz + mvp[13];
  const cz = mvp[2] * px + mvp[6] * py + mvp[10] * pz + mvp[14];
  const cw = mvp[3] * px + mvp[7] * py + mvp[11] * pz + mvp[15];

  if (Math.abs(cw) < 1e-8) {
    return Object.freeze({ x: 0, y: 0, z: 1, w: 0, insideFrustum: false });
  }

  const x = cx / cw;
  const y = cy / cw;
  const z = cz / cw;
  const insideFrustum = cw > 0 && x >= -1 && x <= 1 && y >= -1 && y <= 1 && z >= -1 && z <= 1;

  return Object.freeze({ x, y, z, w: cw, insideFrustum });
}

function resolvePhysicalTarget(input: ComicStageProjectionInput): ComicStagePhysicalTarget {
  if (input.presetId === "custom") {
    const widthM = clamp(input.customDimensionsM?.widthM ?? 0.2, 0.02, 10);
    const heightM = clamp(input.customDimensionsM?.heightM ?? 0.3, 0.02, 10);
    const thicknessM = clamp(input.customDimensionsM?.thicknessM ?? 0.015, 0.001, 0.5);
    return Object.freeze({
      presetId: "custom",
      labelKo: `사용자 규격 (${Math.round(widthM * 1000)}×${Math.round(heightM * 1000)}mm)`,
      widthM,
      heightM,
      thicknessM,
      defaultViewingDistanceM: clamp(Math.max(widthM, heightM) * 2.2, 0.3, 8),
      mountMode: heightM >= 0.5 ? "wall" : "tabletop",
    });
  }
  return COMIC_STAGE_PHYSICAL_PRESETS[input.presetId];
}

/**
 * 캔버스 픽셀 비율을 유지하면서 실물 단행본/전시 패널 미터(m) 규격 안에 맞추고
 * WebXR 카메라 기준 모델·뷰·투영 행렬과 화면 점유율을 계산한다.
 */
export function computeComicStageMeterScaleProjection(
  input: ComicStageProjectionInput,
): ComicStageMeterScaleProjection {
  const target = resolvePhysicalTarget(input);
  const canvasW = Math.max(1, Number.isFinite(input.canvasWidthPx) ? input.canvasWidthPx : 1);
  const canvasH = Math.max(1, Number.isFinite(input.canvasHeightPx) ? input.canvasHeightPx : 1);
  const viewportW = Math.max(1, Number.isFinite(input.viewportWidthPx) ? input.viewportWidthPx : 1);
  const viewportH = Math.max(1, Number.isFinite(input.viewportHeightPx) ? input.viewportHeightPx : 1);

  const canvasAspect = canvasW / canvasH;
  const targetAspect = target.widthM / target.heightM;
  const fittedWidthM = canvasAspect >= targetAspect ? target.widthM : target.heightM * canvasAspect;
  const fittedHeightM = canvasAspect >= targetAspect ? target.widthM / canvasAspect : target.heightM;
  const pixelsPerMeter = canvasW / fittedWidthM;

  const viewingDistanceM = clamp(
    input.viewingDistanceM ?? target.defaultViewingDistanceM,
    0.15,
    25,
  );
  const offset = input.anchorOffsetM ?? [0, 0, 0];
  const modelMatrix = computeComicStageModelMatrix({
    widthM: fittedWidthM,
    heightM: fittedHeightM,
    thicknessM: target.thicknessM,
    anchorPositionM: [offset[0], offset[1], offset[2] - viewingDistanceM],
    yawRad: input.yawRad,
    pitchRad: input.pitchRad,
    rollRad: input.rollRad,
    uniformScale: input.uniformScale,
  });

  // 카메라는 원점에서 -Z를 바라보는 표준 XR 뷰 행렬(항등)
  const viewMatrix: Mat4 = Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ] as const);

  const projectionMatrix = computePerspectiveProjectionMatrix({
    fovYRad: input.fovYRad ?? (55 * Math.PI) / 180,
    aspect: viewportW / viewportH,
    nearM: input.nearM ?? 0.05,
    farM: input.farM ?? 50,
  });
  const mvpMatrix = multiplyMat4(projectionMatrix, multiplyMat4(viewMatrix, modelMatrix));

  const cornersNdc = Object.freeze([
    projectStagePointToNdc(mvpMatrix, [-0.5, 0.5, 0]),
    projectStagePointToNdc(mvpMatrix, [0.5, 0.5, 0]),
    projectStagePointToNdc(mvpMatrix, [0.5, -0.5, 0]),
    projectStagePointToNdc(mvpMatrix, [-0.5, -0.5, 0]),
  ] as const);

  const xs = cornersNdc.map((corner) => clamp(corner.x, -1, 1));
  const ys = cornersNdc.map((corner) => clamp(corner.y, -1, 1));
  const ndcWidth = Math.max(0, Math.max(...xs) - Math.min(...xs));
  const ndcHeight = Math.max(0, Math.max(...ys) - Math.min(...ys));
  // NDC 면적은 [-1,1]×[-1,1] = 4.0
  const screenCoverageRatio = clamp((ndcWidth * ndcHeight) / 4, 0, 1);

  return Object.freeze({
    target,
    fittedWidthM: roundTo(fittedWidthM, 6),
    fittedHeightM: roundTo(fittedHeightM, 6),
    pixelsPerMeter: roundTo(pixelsPerMeter, 2),
    viewingDistanceM,
    modelMatrix,
    viewMatrix,
    projectionMatrix,
    mvpMatrix,
    screenCoverageRatio: roundTo(screenCoverageRatio, 6),
    cornersNdc,
  });
}

/**
 * WebXR 비지원 기기용 2.5D 패럴랙스 폴백 스테이지 변환을 계산한다.
 * `reducedMotion`이 켜져 있으면 회전·시차 이동을 0으로 고정해 전정 불편을 방지한다.
 */
export function computeParallaxFallbackStage(
  input: ParallaxStageInput,
): ParallaxFallbackStageResult {
  const reducedMotion = Boolean(input.reducedMotion);
  const tiltX = reducedMotion ? 0 : clamp(input.tiltX, -1, 1);
  const tiltY = reducedMotion ? 0 : clamp(input.tiltY, -1, 1);
  const maxTiltDeg = clamp(input.maxTiltDeg ?? 12, 0, 18);
  const perspectivePx = clamp(input.perspectivePx ?? 900, 320, 2400);
  const minViewportDim = Math.max(
    120,
    Math.min(
      Number.isFinite(input.viewportWidthPx) ? input.viewportWidthPx : 360,
      Number.isFinite(input.viewportHeightPx) ? input.viewportHeightPx : 640,
    ),
  );
  const maxShiftPx = clamp(input.maxShiftPx ?? minViewportDim * 0.08, 0, 96);

  const rotateYDeg = roundTo(tiltX * maxTiltDeg, 3);
  const rotateXDeg = roundTo(-tiltY * maxTiltDeg, 3);
  const shadowOffsetPx: readonly [number, number] = Object.freeze([
    roundTo(-tiltX * 14, 2),
    roundTo(10 - tiltY * 10, 2),
  ]);

  const layers = Object.freeze(
    input.layers.map((layer): ParallaxLayerTransform => {
      const depth = clamp(layer.depthMeters, -0.5, 0.5);
      const normalizedDepth = depth / 0.25; // ±0.25m에서 최대 시차
      const translateXPx = reducedMotion ? 0 : roundTo(tiltX * normalizedDepth * maxShiftPx, 2);
      const translateYPx = reducedMotion ? 0 : roundTo(tiltY * normalizedDepth * maxShiftPx, 2);
      const zOffsetPx = reducedMotion ? 0 : roundTo(depth * 180, 2);
      const scale = reducedMotion ? 1 : roundTo(clamp(1 + depth * 0.12, 0.88, 1.15), 4);
      const opacity = clamp(layer.opacity ?? 1, 0, 1);

      return Object.freeze({
        id: layer.id,
        depthMeters: depth,
        opacity,
        translateXPx,
        translateYPx,
        zOffsetPx,
        scale,
        cssTransform: `translate3d(${translateXPx}px, ${translateYPx}px, ${zOffsetPx}px) scale(${scale})`,
      });
    }),
  );

  const stageCssTransform =
    `perspective(${perspectivePx}px) rotateX(${rotateXDeg}deg) rotateY(${rotateYDeg}deg)`;

  return Object.freeze({
    mode: "fallback-2.5d",
    reducedMotionApplied: reducedMotion,
    rotateXDeg,
    rotateYDeg,
    perspectivePx,
    shadowOffsetPx,
    stageCssTransform,
    layers,
  });
}
