/**
 * Wave-36: 2.5D 다중 깊이 평면 컷 분해기 및 스크롤 연동 패럴랙스 해석기.
 *
 * 세로 스크롤 웹툰 컷의 레이어들을 보정된 4단계 광학 깊이 평면(`foreground`, `character`,
 * `midground`, `backdrop`)으로 자동 배정하고, 최대 스크롤·기울기 변위에서도 실루엣 뒤쪽 투명 빈틈
 * (Disocclusion Hole)이 노출되지 않도록 인페인팅/확장 스커트 여백(`requiredSkirtMarginPx`)을 산출한다.
 * 또한 얇은 렌즈(Thin-Lens) 광학계 공식 기반 착란원 반경(`cocRadiusPx`)과 `prefersReducedMotion`
 * 접근성 제로 변위 클램핑을 함께 보장한다.
 */

/** 보정된 2.5D 컷 깊이 평면 식별자. */
export type ParallaxDepthPlaneId = "backdrop" | "character" | "foreground" | "midground";

/** 화가 알고리즘(Painter's Order) 기준 뒤에서 앞으로 정렬된 평면 순서. */
export const PARALLAX_PLANE_PAINTER_ORDER: readonly ParallaxDepthPlaneId[] = [
  "backdrop",
  "midground",
  "character",
  "foreground",
] as const;

/** 스튜디오 레이어의 의미론적 역할 힌트. */
export type CutLayerSemanticRole =
  | "architecture"
  | "character-main"
  | "character-sub"
  | "fx-foreground"
  | "prop-mid"
  | "prop-near"
  | "sky-backdrop"
  | "speech-balloon";

/** 2D 축 정렬 사각형(px). */
export interface ParallaxRect2D {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/** 분해 대상 컷 내부 개별 레이어 명세. */
export interface CutLayerInput {
  readonly bounds: ParallaxRect2D;
  /** 깊이 맵·3D Z-패스 기반 정규화 깊이 힌트 (`0` = 최전경, `1` = 최원경). */
  readonly depthHint?: number;
  readonly id: string;
  /** 말풍선·컷 테두리처럼 컷 프레임에 고정되어 패럴랙스 이동에서 제외할지 여부. */
  readonly lockedToCutFrame?: boolean;
  readonly name: string;
  readonly planeOverride?: ParallaxDepthPlaneId;
  readonly semanticRole?: CutLayerSemanticRole;
  readonly zIndex: number;
}

/** 깊이 평면별 광학 거리 및 패럴랙스 보정 프로파일. */
export interface ParallaxPlaneCalibrationProfile {
  readonly distanceMeters: number;
  readonly planeId: ParallaxDepthPlaneId;
  readonly signedParallaxGain: number;
  readonly zOrder: number;
}

/** 기본 보정된 4단계 깊이 평면 프로파일 (`character` 기준 평면은 변위 이득 `0`). */
export const DEFAULT_PARALLAX_PLANE_PROFILES: Readonly<
  Record<ParallaxDepthPlaneId, ParallaxPlaneCalibrationProfile>
> = {
  backdrop: { distanceMeters: 14.0, planeId: "backdrop", signedParallaxGain: -0.26, zOrder: 100 },
  midground: { distanceMeters: 5.0, planeId: "midground", signedParallaxGain: -0.14, zOrder: 200 },
  character: { distanceMeters: 2.5, planeId: "character", signedParallaxGain: 0.0, zOrder: 300 },
  foreground: { distanceMeters: 1.4, planeId: "foreground", signedParallaxGain: 0.28, zOrder: 400 },
};

/** 얇은 렌즈 피사계 심도(DoF) 착란원 계산을 위한 가상 카메라 광학 명세. */
export interface ParallaxCameraOpticsSpec {
  readonly apertureFStop: number;
  readonly focalLengthMm: number;
  readonly focusDistanceMeters: number;
  readonly maxCocRadiusPx: number;
  readonly sensorHeightMm: number;
}

/** 기본 카메라 광학 명세 (`character` 평면 `2.5m`에 정밀 초점 고정). */
export const DEFAULT_PARALLAX_CAMERA_OPTICS: ParallaxCameraOpticsSpec = {
  apertureFStop: 2.8,
  focalLengthMm: 50,
  focusDistanceMeters: DEFAULT_PARALLAX_PLANE_PROFILES.character.distanceMeters,
  maxCocRadiusPx: 24,
  sensorHeightMm: 24,
};

/** 상하좌우 방향별 인페인팅/확장 스커트 필요 여백(px). */
export interface SkirtMarginBoxPx {
  readonly bottomPx: number;
  readonly leftPx: number;
  readonly rightPx: number;
  readonly topPx: number;
}

/** 2.5D 컷 깊이 평면 분해 옵션. */
export interface ParallaxDecompositionOptions {
  readonly cameraOptics?: Partial<ParallaxCameraOpticsSpec>;
  readonly cutHeightPx: number;
  readonly cutWidthPx: number;
  readonly maxScrollAmplitudePx?: number;
  readonly maxTiltAmplitudePx?: number;
  readonly planeProfiles?: Partial<
    Record<ParallaxDepthPlaneId, Partial<ParallaxPlaneCalibrationProfile>>
  >;
  readonly subpixelSafetyPadPx?: number;
}

/** 분해 완료된 단일 깊이 평면 기술자. */
export interface DecomposedParallaxPlane {
  readonly allLayersLockedToFrame: boolean;
  readonly baseOptics: ParallaxCameraOpticsSpec;
  readonly cocRadiusPx: number;
  readonly combinedBounds: ParallaxRect2D | null;
  readonly cutHeightPx: number;
  readonly distanceMeters: number;
  readonly layerIds: readonly string[];
  readonly maxScrollAmplitudePx: number;
  readonly maxTiltAmplitudePx: number;
  readonly planeId: ParallaxDepthPlaneId;
  /** 최대 패럴랙스 변위 시 투명 빈틈 노출을 막기 위해 필요한 최소 스커트 확장 폭(px). */
  readonly requiredSkirtMarginPx: number;
  readonly requiredSkirtMargins: SkirtMarginBoxPx;
  readonly signedParallaxGain: number;
  readonly zOrder: number;
}

/** 컷 전체의 2.5D 다중 평면 분해 결과. */
export interface CutParallaxDecompositionResult {
  readonly cameraOptics: ParallaxCameraOpticsSpec;
  readonly cutHeightPx: number;
  readonly cutWidthPx: number;
  readonly layerPlaneAssignments: Readonly<Record<string, ParallaxDepthPlaneId>>;
  readonly maxRequiredSkirtMarginPx: number;
  readonly planes: readonly DecomposedParallaxPlane[];
  readonly planesById: Readonly<Record<ParallaxDepthPlaneId, DecomposedParallaxPlane>>;
}

/** 스크롤·기울기 실시간 패럴랙스 평가 입력. */
export interface ParallaxScrollEvaluationInput {
  readonly apertureFStop?: number;
  readonly dampingCurve?: "linear" | "smoothstep-ease";
  readonly focusDistanceMeters?: number;
  readonly horizontalTiltNormalized?: number;
  /** `true`면 전정기관 보호를 위해 모든 평면의 패럴랙스 이동을 엄격히 `0`으로 고정한다. */
  readonly prefersReducedMotion: boolean;
  /** 뷰포트 내 컷 통과 진행률 (`-1` = 하단 진입, `0` = 정중앙, `+1` = 상단 이탈). */
  readonly scrollProgress: number;
}

/** 단일 깊이 평면의 평가된 런타임 변환 행렬 파라미터 및 안전 지표. */
export interface ParallaxPlaneTransformResult {
  readonly cocRadiusPx: number;
  readonly disocclusionSafe: boolean;
  readonly motionClampedByAccessibility: boolean;
  readonly planeId: ParallaxDepthPlaneId;
  readonly scale: number;
  readonly skirtUtilizationRatio: number;
  readonly translateXPx: number;
  readonly translateYPx: number;
}

const FOREGROUND_NAME_PATTERN = /전경|최전경|앞쪽|꽃잎|빗방울|안개|입자|foreground|\bfg\b/iu;
const CHARACTER_NAME_PATTERN = /인물|캐릭터|주인공|얼굴|표정|말풍선|대사|character|\bchar\b/iu;
const MIDGROUND_NAME_PATTERN = /중경|실내|건물|나무|책상|소품|midground|\bmg\b/iu;
const BACKDROP_NAME_PATTERN = /배경|원경|하늘|구름|풍경|바다|산맥|backdrop|background|\bbg\b|sky/iu;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) < 1e-12 ? 0 : value;
}

function shapeSignedUnit(unitValue: number, curve: "linear" | "smoothstep-ease"): number {
  const u = clamp(unitValue, -1, 1);
  return curve === "linear" ? normalizeZero(u) : normalizeZero(0.5 * u * (3 - u * u));
}

function mergeBounds(rects: readonly ParallaxRect2D[]): ParallaxRect2D | null {
  if (rects.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + Math.max(0, rect.width));
    maxY = Math.max(maxY, rect.y + Math.max(0, rect.height));
  }
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

/** 레이어 메타데이터로부터 보정된 깊이 평면을 결정한다. */
export function classifyCutLayerDepthPlane(
  layer: CutLayerInput,
  normalizedZRank: number,
): ParallaxDepthPlaneId {
  if (layer.planeOverride !== undefined) return layer.planeOverride;
  if (layer.semanticRole !== undefined) {
    switch (layer.semanticRole) {
      case "fx-foreground":
      case "prop-near":
        return "foreground";
      case "character-main":
      case "character-sub":
      case "speech-balloon":
        return "character";
      case "prop-mid":
      case "architecture":
        return "midground";
      case "sky-backdrop":
        return "backdrop";
    }
  }
  if (layer.depthHint !== undefined && Number.isFinite(layer.depthHint)) {
    const d = clamp(layer.depthHint, 0, 1);
    if (d < 0.25) return "foreground";
    if (d < 0.55) return "character";
    if (d < 0.8) return "midground";
    return "backdrop";
  }
  if (FOREGROUND_NAME_PATTERN.test(layer.name)) return "foreground";
  if (CHARACTER_NAME_PATTERN.test(layer.name)) return "character";
  if (MIDGROUND_NAME_PATTERN.test(layer.name)) return "midground";
  if (BACKDROP_NAME_PATTERN.test(layer.name)) return "backdrop";

  const rank = clamp(normalizedZRank, 0, 1);
  if (rank < 0.25) return "backdrop";
  if (rank < 0.55) return "midground";
  if (rank < 0.85) return "character";
  return "foreground";
}

/**
 * 얇은 렌즈(Thin-Lens) 방정식으로 주어진 물체 거리의 픽셀 단위 착란원 반경(`cocRadiusPx`)을 계산한다.
 * 초점 평면(`planeDistanceMeters === optics.focusDistanceMeters`)에서는 엄격히 `0`을 반환한다.
 */
export function computeThinLensCocRadiusPx(
  planeDistanceMeters: number,
  cutHeightPx: number,
  optics: ParallaxCameraOpticsSpec,
): number {
  const safeCutH = Math.max(1, cutHeightPx);
  const s1Mm = Math.max(optics.focalLengthMm + 1, optics.focusDistanceMeters * 1000);
  const s2Mm = Math.max(optics.focalLengthMm + 1, planeDistanceMeters * 1000);
  const deltaMm = Math.abs(s2Mm - s1Mm);
  if (deltaMm < 1e-6) return 0;

  const fMm = Math.max(1, optics.focalLengthMm);
  const fStop = Math.max(0.7, optics.apertureFStop);
  const sensorHeightMm = Math.max(1, optics.sensorHeightMm);
  const cocDiameterMm = ((fMm * fMm) / (fStop * (s1Mm - fMm))) * (deltaMm / s2Mm);
  const cocRadiusPx = 0.5 * cocDiameterMm * (safeCutH / sensorHeightMm);
  return normalizeZero(clamp(cocRadiusPx, 0, Math.max(0, optics.maxCocRadiusPx)));
}

/**
 * 2D 컷의 레이어 목록을 4단계 깊이 평면으로 분해하고,
 * 최대 스크롤 패럴랙스 변위 시 투명 구멍을 원천 차단하는 인페인팅 스커트 여백과 DoF 착란원을 계산한다.
 */
export function decomposeCutIntoParallaxPlanes(
  layers: readonly CutLayerInput[],
  options: ParallaxDecompositionOptions,
): CutParallaxDecompositionResult {
  const cutWidthPx = Math.max(1, Math.round(options.cutWidthPx));
  const cutHeightPx = Math.max(1, Math.round(options.cutHeightPx));
  const maxScrollAmplitudePx = Math.max(0, options.maxScrollAmplitudePx ?? 96);
  const maxTiltAmplitudePx = Math.max(0, options.maxTiltAmplitudePx ?? 28);
  const subpixelSafetyPadPx = Math.max(0, options.subpixelSafetyPadPx ?? 2);

  const cameraOptics: ParallaxCameraOpticsSpec = {
    ...DEFAULT_PARALLAX_CAMERA_OPTICS,
    ...options.cameraOptics,
  };

  const sortedByZ = [...layers].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  const buckets: Record<ParallaxDepthPlaneId, CutLayerInput[]> = {
    backdrop: [],
    midground: [],
    character: [],
    foreground: [],
  };
  const layerPlaneAssignments: Record<string, ParallaxDepthPlaneId> = {};
  const denom = Math.max(1, sortedByZ.length - 1);

  for (let index = 0; index < sortedByZ.length; index += 1) {
    const layer = sortedByZ[index];
    if (!layer) continue;
    const rank = sortedByZ.length === 1 ? 0.6 : index / denom;
    const planeId = classifyCutLayerDepthPlane(layer, rank);
    buckets[planeId].push(layer);
    layerPlaneAssignments[layer.id] = planeId;
  }

  const resolvedProfiles: Record<ParallaxDepthPlaneId, ParallaxPlaneCalibrationProfile> = {
    backdrop: { ...DEFAULT_PARALLAX_PLANE_PROFILES.backdrop, ...options.planeProfiles?.backdrop },
    midground: { ...DEFAULT_PARALLAX_PLANE_PROFILES.midground, ...options.planeProfiles?.midground },
    character: { ...DEFAULT_PARALLAX_PLANE_PROFILES.character, ...options.planeProfiles?.character },
    foreground: {
      ...DEFAULT_PARALLAX_PLANE_PROFILES.foreground,
      ...options.planeProfiles?.foreground,
    },
  };

  const activePlanesMeta = PARALLAX_PLANE_PAINTER_ORDER.map((planeId) => {
    const planeLayers = buckets[planeId];
    const profile = resolvedProfiles[planeId];
    const allLocked =
      planeLayers.length > 0 && planeLayers.every((item) => item.lockedToCutFrame === true);
    return {
      allLocked,
      distanceMeters: profile.distanceMeters,
      effectiveGain: allLocked ? 0 : profile.signedParallaxGain,
      hasLayers: planeLayers.length > 0,
      planeId,
      profile,
    };
  });

  const planesRecord = {} as Record<ParallaxDepthPlaneId, DecomposedParallaxPlane>;
  let maxRequiredSkirtMarginPx = 0;

  for (const meta of activePlanesMeta) {
    const planeLayers = buckets[meta.planeId];
    const cocRadiusPx = computeThinLensCocRadiusPx(meta.distanceMeters, cutHeightPx, cameraOptics);
    let requiredSkirtMargins: SkirtMarginBoxPx = { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 };
    let requiredSkirtMarginPx = 0;

    if (planeLayers.length > 0 && (maxScrollAmplitudePx > 0 || maxTiltAmplitudePx > 0)) {
      const selfShiftY = Math.abs(meta.effectiveGain) * maxScrollAmplitudePx;
      const selfShiftX = Math.abs(meta.effectiveGain) * maxTiltAmplitudePx;
      let maxOccludedDeltaGain = 0;
      for (const front of activePlanesMeta) {
        if (front.hasLayers && front.distanceMeters < meta.distanceMeters) {
          maxOccludedDeltaGain = Math.max(
            maxOccludedDeltaGain,
            Math.abs(front.effectiveGain - meta.effectiveGain),
          );
        }
      }
      const dofBleedPadPx = cocRadiusPx * 1.5;
      const verticalPx = Math.ceil(
        Math.max(selfShiftY, maxOccludedDeltaGain * maxScrollAmplitudePx) +
          dofBleedPadPx +
          subpixelSafetyPadPx,
      );
      const horizontalPx = Math.ceil(
        Math.max(selfShiftX, maxOccludedDeltaGain * maxTiltAmplitudePx) +
          dofBleedPadPx +
          subpixelSafetyPadPx,
      );
      requiredSkirtMargins = {
        topPx: verticalPx,
        bottomPx: verticalPx,
        leftPx: horizontalPx,
        rightPx: horizontalPx,
      };
      requiredSkirtMarginPx = Math.max(verticalPx, horizontalPx);
      maxRequiredSkirtMarginPx = Math.max(maxRequiredSkirtMarginPx, requiredSkirtMarginPx);
    }

    planesRecord[meta.planeId] = {
      allLayersLockedToFrame: meta.allLocked,
      baseOptics: cameraOptics,
      cocRadiusPx,
      combinedBounds: mergeBounds(planeLayers.map((item) => item.bounds)),
      cutHeightPx,
      distanceMeters: meta.distanceMeters,
      layerIds: planeLayers.map((item) => item.id),
      maxScrollAmplitudePx,
      maxTiltAmplitudePx,
      planeId: meta.planeId,
      requiredSkirtMarginPx,
      requiredSkirtMargins,
      signedParallaxGain: meta.effectiveGain,
      zOrder: meta.profile.zOrder,
    };
  }

  const planes = PARALLAX_PLANE_PAINTER_ORDER.map((id) => planesRecord[id]).sort(
    (a, b) => a.zOrder - b.zOrder,
  );

  return {
    cameraOptics,
    cutHeightPx,
    cutWidthPx,
    layerPlaneAssignments,
    maxRequiredSkirtMarginPx,
    planes,
    planesById: planesRecord,
  };
}

function makeZeroShiftResult(
  planeId: ParallaxDepthPlaneId,
  cocRadiusPx: number,
  motionClampedByAccessibility: boolean,
): ParallaxPlaneTransformResult {
  return {
    cocRadiusPx,
    disocclusionSafe: true,
    motionClampedByAccessibility,
    planeId,
    scale: 1,
    skirtUtilizationRatio: 0,
    translateXPx: 0,
    translateYPx: 0,
  };
}

/**
 * 현재 스크롤 진행률 및 기울기 입력으로부터 개별 깊이 평면의 런타임 패럴랙스 변환과 DoF 블러를 계산한다.
 * `prefersReducedMotion`이 활성화되면 패럴랙스 이동을 엄격히 `0`으로 고정한다.
 */
export function evaluateParallaxPlaneTransform(
  plane: DecomposedParallaxPlane,
  state: ParallaxScrollEvaluationInput,
): ParallaxPlaneTransformResult {
  const effectiveOptics: ParallaxCameraOpticsSpec =
    state.focusDistanceMeters !== undefined || state.apertureFStop !== undefined
      ? {
          ...plane.baseOptics,
          apertureFStop: state.apertureFStop ?? plane.baseOptics.apertureFStop,
          focusDistanceMeters: state.focusDistanceMeters ?? plane.baseOptics.focusDistanceMeters,
        }
      : plane.baseOptics;

  const cocRadiusPx = computeThinLensCocRadiusPx(
    plane.distanceMeters,
    plane.cutHeightPx,
    effectiveOptics,
  );

  if (state.prefersReducedMotion) {
    return makeZeroShiftResult(plane.planeId, cocRadiusPx, true);
  }
  if (plane.layerIds.length === 0 || plane.allLayersLockedToFrame) {
    return makeZeroShiftResult(plane.planeId, cocRadiusPx, false);
  }

  const curve = state.dampingCurve ?? "smoothstep-ease";
  const shapedScroll = shapeSignedUnit(state.scrollProgress, curve);
  const shapedTilt = shapeSignedUnit(state.horizontalTiltNormalized ?? 0, curve);

  const rawShiftY = plane.signedParallaxGain * plane.maxScrollAmplitudePx * shapedScroll;
  const rawShiftX = plane.signedParallaxGain * plane.maxTiltAmplitudePx * shapedTilt;
  const allowedY = plane.requiredSkirtMargins.topPx;
  const allowedX = plane.requiredSkirtMargins.leftPx;

  const clampedY = allowedY > 0 ? clamp(rawShiftY, -allowedY, allowedY) : 0;
  const clampedX = allowedX > 0 ? clamp(rawShiftX, -allowedX, allowedX) : 0;
  const utilY = allowedY > 0 ? Math.abs(clampedY) / allowedY : 0;
  const utilX = allowedX > 0 ? Math.abs(clampedX) / allowedX : 0;

  return {
    cocRadiusPx,
    disocclusionSafe:
      Math.abs(rawShiftY) <= allowedY + 1e-6 && Math.abs(rawShiftX) <= allowedX + 1e-6,
    motionClampedByAccessibility: false,
    planeId: plane.planeId,
    scale: 1,
    skirtUtilizationRatio: normalizeZero(clamp(Math.max(utilX, utilY), 0, 1)),
    translateXPx: normalizeZero(clampedX),
    translateYPx: normalizeZero(clampedY),
  };
}
