/**
 * 웹툰 3D 기능 확장 엔진 (5~7번 통합 진입점):
 * 5. 배경 소품 상태 슬라이더 & 계절·파괴 상태 1클릭 전환 (`evaluateInteractiveSceneState`)
 * 6. 3D 벽면·간판 위 2D 브러시 직접 투영 데칼 (`project2dDecalOnto3dSurface`)
 * 7. 사진 1장 → 3D 전신·손 포즈 + 카메라 각도 즉시 복제 (`reconstruct3dPoseAndCameraFromPhoto`, re-export)
 *
 * 100% 무과금(₩0)·결정론적 브라우저 로컬 연산. 원시 HEX 금지, OKLCH 컬러 계층 준수.
 */

import {
  clamp,
  radToDeg,
  roundTo,
  vec3Add,
  vec3Cross,
  vec3Dot,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
  type Vec2,
  type Vec3,
} from "./scene3d-expansion-math";
import {
  ENVIRONMENT_PRESET_SPECS,
  type InteractiveEnvironmentPreset,
  type SceneParticleType,
} from "./scene3d-photo-pose-catalog";

export {
  getSamplePhotoPosePreset,
  INTERACTIVE_ENVIRONMENT_PRESETS,
  PHOTO_POSE_PRESET_LIST,
  reconstruct3dPoseAndCameraFromPhoto,
  type HandGripType,
  type InteractiveEnvironmentPreset,
  type JointEulerDeg,
  type Photo2dBodyLandmarks,
  type Photo2dHandLandmarks,
  type PhotoPosePresetId,
  type PhotoPoseReconstructionInput,
  type PhotoPoseReconstructionResult,
  type ReconstructedHandPose,
  type ReconstructedJointId,
  type SamplePhotoPosePreset,
  type SceneParticleType,
} from "./scene3d-photo-pose-catalog";

// ============================================================================
// 5. 배경 소품 상태 슬라이더 & 계절·파괴 상태 1클릭 전환
// ============================================================================

export interface InteractiveSceneStateInput {
  readonly preset: InteractiveEnvironmentPreset;
  readonly doorOpenDeg: number;
  readonly lampIntensityPct: number;
  readonly curtainSwayPct: number;
  readonly windPhaseSec?: number;
}

export interface InteractiveSceneStateResult {
  readonly preset: InteractiveEnvironmentPreset;
  readonly presetLabelKo: string;
  readonly moodSummaryKo: string;
  readonly props: {
    readonly door: {
      readonly openDeg: number;
      readonly openRatio: number;
      readonly clearanceMeters: number;
      readonly exteriorDraftFactor: number;
    };
    readonly lamp: {
      readonly intensityPct: number;
      readonly intensityRatio: number;
      readonly luminousFluxLm: number;
      readonly emissiveColorOklch: string;
      readonly interiorFillBoost: number;
    };
    readonly curtain: {
      readonly swayPct: number;
      readonly effectiveSwayPct: number;
      readonly waveAmplitudeCm: number;
      readonly foldDisplacementDeg: number;
    };
  };
  readonly lighting: {
    readonly skyColorOklch: string;
    readonly keyLightOklch: string;
    readonly ambientFillOklch: string;
    readonly fogColorOklch: string;
    readonly accentParticleOklch: string;
    readonly keyIntensity: number;
    readonly ambientIntensity: number;
    readonly fogDensity: number;
    readonly surfaceWetness: number;
    readonly structuralDamageRatio: number;
  };
  readonly particles: {
    readonly type: SceneParticleType;
    readonly labelKo: string;
    readonly count: number;
    readonly windSpeedMps: number;
    readonly fallSpeedMps: number;
  };
  readonly cssVariables: Readonly<Record<string, string>>;
  readonly costKrw: 0;
}

export function evaluateInteractiveSceneState(
  input: InteractiveSceneStateInput,
): InteractiveSceneStateResult {
  const spec = ENVIRONMENT_PRESET_SPECS[input.preset];
  const openDeg = roundTo(clamp(input.doorOpenDeg, 0, 90), 1);
  const openRatio = roundTo(openDeg / 90, 4);
  const lampPct = roundTo(clamp(input.lampIntensityPct, 0, 100), 1);
  const lampRatio = roundTo(lampPct / 100, 4);
  const swayPct = roundTo(clamp(input.curtainSwayPct, 0, 100), 1);
  const phaseSec =
    typeof input.windPhaseSec === "number" && Number.isFinite(input.windPhaseSec)
      ? input.windPhaseSec
      : 0.4;

  const exteriorDraftFactor = roundTo(openRatio * (spec.windSpeedMps / 5.4), 3);
  const effectiveSwayPct = roundTo(clamp(swayPct + exteriorDraftFactor * 26, 0, 100), 1);
  const waveAmplitudeCm = roundTo(
    (effectiveSwayPct / 100) * 18.5 * (0.65 + 0.35 * Math.abs(Math.sin(phaseSec * 2.4))),
    2,
  );
  const foldDisplacementDeg = roundTo((effectiveSwayPct / 100) * 34, 1);

  const luminousFluxLm = Math.round(lampRatio * 1450);
  const lampLightness = roundTo(0.42 + lampRatio * 0.52, 3);
  const lampChroma = roundTo(0.03 + lampRatio * 0.13, 3);
  const emissiveColorOklch = `oklch(${lampLightness} ${lampChroma} 76)`;
  const interiorFillBoost = roundTo(lampRatio * 0.45, 3);

  const adjustedAmbientIntensity = roundTo(
    clamp(spec.ambientIntensity + interiorFillBoost * 0.65 + openRatio * 0.12, 0.1, 1.5),
    3,
  );
  const adjustedWetness = roundTo(
    clamp(spec.surfaceWetness + (input.preset === "rainy-night" ? openRatio * 0.06 : 0), 0, 1),
    3,
  );
  const particleCount = Math.round(spec.baseParticleCount * (0.85 + openRatio * 0.3));

  return {
    preset: input.preset,
    presetLabelKo: spec.labelKo,
    moodSummaryKo: spec.moodSummaryKo,
    props: {
      door: {
        openDeg,
        openRatio,
        clearanceMeters: roundTo(Math.sin((openDeg * Math.PI) / 180) * 0.92, 3),
        exteriorDraftFactor,
      },
      lamp: {
        intensityPct: lampPct,
        intensityRatio: lampRatio,
        luminousFluxLm,
        emissiveColorOklch,
        interiorFillBoost,
      },
      curtain: {
        swayPct,
        effectiveSwayPct,
        waveAmplitudeCm,
        foldDisplacementDeg,
      },
    },
    lighting: {
      skyColorOklch: spec.skyColorOklch,
      keyLightOklch: spec.keyLightOklch,
      ambientFillOklch: spec.ambientFillOklch,
      fogColorOklch: spec.fogColorOklch,
      accentParticleOklch: spec.accentParticleOklch,
      keyIntensity: spec.keyIntensity,
      ambientIntensity: adjustedAmbientIntensity,
      fogDensity: spec.fogDensity,
      surfaceWetness: adjustedWetness,
      structuralDamageRatio: spec.structuralDamageRatio,
    },
    particles: {
      type: spec.particleType,
      labelKo: spec.particleLabelKo,
      count: particleCount,
      windSpeedMps: spec.windSpeedMps,
      fallSpeedMps: spec.fallSpeedMps,
    },
    cssVariables: {
      "--s3e-env-sky": spec.skyColorOklch,
      "--s3e-env-key": spec.keyLightOklch,
      "--s3e-env-ambient": spec.ambientFillOklch,
      "--s3e-env-fog": spec.fogColorOklch,
      "--s3e-env-particle": spec.accentParticleOklch,
      "--s3e-env-lamp": emissiveColorOklch,
    },
    costKrw: 0,
  };
}

// ============================================================================
// 6. 3D 벽면·간판 위 2D 브러시 직접 투영 데칼 (호모그래피·클리핑·왜곡 보정)
// ============================================================================

export type DecalKind = "korean-signboard" | "poster" | "graffiti-brush";

export interface DecalBoundsUv {
  readonly uMin: number;
  readonly vMin: number;
  readonly uMax: number;
  readonly vMax: number;
}

export interface SurfacePlane3d {
  readonly origin: Vec3;
  readonly normal: Vec3;
  readonly tangentU: Vec3;
  readonly widthMeters: number;
  readonly heightMeters: number;
}

export interface DecalProjectionCamera {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly focalLengthMm: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface DecalProjectionInput {
  readonly textKo: string;
  readonly decalKind: DecalKind;
  readonly decalBoundsUv: DecalBoundsUv;
  readonly brushStrokesUv?: readonly (readonly Vec2[])[];
  readonly surface: SurfacePlane3d;
  readonly camera?: DecalProjectionCamera;
  readonly opacity?: number;
}

export type HomographyMatrix3x3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface DecalProjectionResult {
  readonly textKo: string;
  readonly decalKind: DecalKind;
  readonly opacity: number;
  readonly surfaceBasis: {
    readonly normal: Vec3;
    readonly tangentU: Vec3;
    readonly bitangentV: Vec3;
  };
  readonly clippedBoundsUv: DecalBoundsUv;
  readonly clipAreaRatio: number;
  readonly isPartiallyClipped: boolean;
  readonly isCompletelyOutside: boolean;
  readonly backfaceCulled: boolean;
  readonly worldCorners: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly screenCorners: readonly [Vec2, Vec2, Vec2, Vec2];
  readonly homographyMatrix3x3: HomographyMatrix3x3;
  readonly homographyMaxErrorPx: number;
  readonly projectedStrokes: readonly (readonly Vec2[])[];
  readonly clippedStrokeSegmentCount: number;
  readonly distortionCompensation: {
    readonly obliqueAngleDeg: number;
    readonly foreshorteningRatio: number;
    readonly aspectCorrectionScale: number;
  };
  readonly svgPolygonPoints: string;
  readonly costKrw: 0;
}

function projectWorldToViewport(point: Vec3, camera: DecalProjectionCamera): Vec2 {
  const forward = vec3Normalize(vec3Sub(camera.target, camera.position), { x: 0, y: 0, z: -1 });
  const right = vec3Normalize(vec3Cross(forward, { x: 0, y: 1, z: 0 }), { x: 1, y: 0, z: 0 });
  const up = vec3Cross(right, forward);
  const rel = vec3Sub(point, camera.position);
  const cz = Math.max(0.12, vec3Dot(rel, forward));
  const focalScale = (camera.focalLengthMm / 36) * camera.viewportWidth;
  return {
    x: roundTo(camera.viewportWidth * 0.5 + (vec3Dot(rel, right) * focalScale) / cz, 3),
    y: roundTo(camera.viewportHeight * 0.5 - (vec3Dot(rel, up) * focalScale) / cz, 3),
  };
}

function computeUnitSquareToQuadHomography(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
): HomographyMatrix3x3 {
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;

  if (Math.abs(det) < 1e-9) {
    return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0, 1];
  }

  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ];
}

export function applyHomography3x3(h: HomographyMatrix3x3, u: number, v: number): Vec2 {
  const w = h[6] * u + h[7] * v + h[8];
  const safeW = Math.abs(w) < 1e-9 ? 1e-9 : w;
  return {
    x: roundTo((h[0] * u + h[1] * v + h[2]) / safeW, 3),
    y: roundTo((h[3] * u + h[4] * v + h[5]) / safeW, 3),
  };
}

function clipSegmentToUnitSquare(a: Vec2, b: Vec2): readonly [Vec2, Vec2] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const checks: readonly [number, number][] = [
    [-dx, a.x],
    [dx, 1 - a.x],
    [-dy, a.y],
    [dy, 1 - a.y],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [
    { x: roundTo(a.x + t0 * dx, 5), y: roundTo(a.y + t0 * dy, 5) },
    { x: roundTo(a.x + t1 * dx, 5), y: roundTo(a.y + t1 * dy, 5) },
  ];
}

export function project2dDecalOnto3dSurface(
  input: DecalProjectionInput,
): DecalProjectionResult {
  const opacity = roundTo(clamp(input.opacity ?? 0.94, 0.05, 1), 3);
  const camera: DecalProjectionCamera = input.camera ?? {
    position: { x: 1.45, y: 1.65, z: 3.1 },
    target: { x: 0, y: 1.5, z: 0 },
    focalLengthMm: 35,
    viewportWidth: 320,
    viewportHeight: 200,
  };

  const normal = vec3Normalize(input.surface.normal, { x: 0, y: 0, z: 1 });
  const rawU = vec3Sub(
    input.surface.tangentU,
    vec3Scale(normal, vec3Dot(input.surface.tangentU, normal)),
  );
  const tangentU = vec3Normalize(
    rawU,
    Math.abs(normal.y) < 0.9
      ? vec3Normalize(vec3Cross({ x: 0, y: 1, z: 0 }, normal))
      : { x: 1, y: 0, z: 0 },
  );
  const bitangentV = vec3Normalize(vec3Cross(normal, tangentU), { x: 0, y: 1, z: 0 });
  const widthM = Math.max(0.1, input.surface.widthMeters);
  const heightM = Math.max(0.1, input.surface.heightMeters);

  const rawUMin = Math.min(input.decalBoundsUv.uMin, input.decalBoundsUv.uMax);
  const rawUMax = Math.max(input.decalBoundsUv.uMin, input.decalBoundsUv.uMax);
  const rawVMin = Math.min(input.decalBoundsUv.vMin, input.decalBoundsUv.vMax);
  const rawVMax = Math.max(input.decalBoundsUv.vMin, input.decalBoundsUv.vMax);
  const rawArea = Math.max(1e-6, (rawUMax - rawUMin) * (rawVMax - rawVMin));

  const cUMin = clamp(rawUMin, 0, 1);
  const cUMax = clamp(rawUMax, 0, 1);
  const cVMin = clamp(rawVMin, 0, 1);
  const cVMax = clamp(rawVMax, 0, 1);
  const isCompletelyOutside = cUMax <= cUMin || cVMax <= cVMin;
  const clippedArea = isCompletelyOutside ? 0 : (cUMax - cUMin) * (cVMax - cVMin);
  const clipAreaRatio = roundTo(clamp(clippedArea / rawArea, 0, 1), 4);
  const isPartiallyClipped = !isCompletelyOutside && clipAreaRatio < 0.9999;

  const clippedBoundsUv: DecalBoundsUv = {
    uMin: roundTo(cUMin, 4),
    vMin: roundTo(cVMin, 4),
    uMax: roundTo(cUMax, 4),
    vMax: roundTo(cVMax, 4),
  };

  const uvToWorld = (u: number, v: number): Vec3 => {
    const du = vec3Scale(tangentU, (u - 0.5) * widthM);
    const dv = vec3Scale(bitangentV, (0.5 - v) * heightM);
    const world = vec3Add(vec3Add(input.surface.origin, du), dv);
    return { x: roundTo(world.x, 4), y: roundTo(world.y, 4), z: roundTo(world.z, 4) };
  };

  const worldCorners: readonly [Vec3, Vec3, Vec3, Vec3] = [
    uvToWorld(clippedBoundsUv.uMin, clippedBoundsUv.vMin),
    uvToWorld(clippedBoundsUv.uMax, clippedBoundsUv.vMin),
    uvToWorld(clippedBoundsUv.uMax, clippedBoundsUv.vMax),
    uvToWorld(clippedBoundsUv.uMin, clippedBoundsUv.vMax),
  ];

  const screenCorners: readonly [Vec2, Vec2, Vec2, Vec2] = [
    projectWorldToViewport(worldCorners[0], camera),
    projectWorldToViewport(worldCorners[1], camera),
    projectWorldToViewport(worldCorners[2], camera),
    projectWorldToViewport(worldCorners[3], camera),
  ];

  const homographyMatrix3x3 = computeUnitSquareToQuadHomography(
    screenCorners[0],
    screenCorners[1],
    screenCorners[2],
    screenCorners[3],
  );

  const unitCorners: readonly Vec2[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  let maxErr = 0;
  for (let i = 0; i < 4; i += 1) {
    const mapped = applyHomography3x3(homographyMatrix3x3, unitCorners[i].x, unitCorners[i].y);
    maxErr = Math.max(
      maxErr,
      Math.hypot(mapped.x - screenCorners[i].x, mapped.y - screenCorners[i].y),
    );
  }

  const projectedStrokes: Vec2[][] = [];
  let clippedStrokeSegmentCount = 0;
  const uSpan = Math.max(1e-5, clippedBoundsUv.uMax - clippedBoundsUv.uMin);
  const vSpan = Math.max(1e-5, clippedBoundsUv.vMax - clippedBoundsUv.vMin);

  for (const stroke of input.brushStrokesUv ?? []) {
    if (stroke.length < 2 || isCompletelyOutside) continue;
    const outPoints: Vec2[] = [];
    for (let i = 0; i < stroke.length - 1; i += 1) {
      const clipped = clipSegmentToUnitSquare(stroke[i], stroke[i + 1]);
      if (!clipped) continue;
      const [sA, sB] = clipped;
      if (
        sA.x !== stroke[i].x ||
        sA.y !== stroke[i].y ||
        sB.x !== stroke[i + 1].x ||
        sB.y !== stroke[i + 1].y
      ) {
        clippedStrokeSegmentCount += 1;
      }
      const projA = applyHomography3x3(
        homographyMatrix3x3,
        clamp((sA.x - clippedBoundsUv.uMin) / uSpan, 0, 1),
        clamp((sA.y - clippedBoundsUv.vMin) / vSpan, 0, 1),
      );
      const projB = applyHomography3x3(
        homographyMatrix3x3,
        clamp((sB.x - clippedBoundsUv.uMin) / uSpan, 0, 1),
        clamp((sB.y - clippedBoundsUv.vMin) / vSpan, 0, 1),
      );
      if (outPoints.length === 0) outPoints.push(projA);
      outPoints.push(projB);
    }
    if (outPoints.length >= 2) projectedStrokes.push(outPoints);
  }

  const toCamera = vec3Normalize(vec3Sub(camera.position, input.surface.origin));
  const facingDot = vec3Dot(normal, toCamera);
  const backfaceCulled = facingDot <= 0.01;
  const foreshorteningRatio = roundTo(clamp(Math.abs(facingDot), 0.05, 1), 4);
  const obliqueAngleDeg = roundTo(radToDeg(Math.acos(clamp(facingDot, -1, 1))), 2);
  const aspectCorrectionScale = roundTo(clamp(1 / Math.max(0.2, foreshorteningRatio), 1, 5), 3);

  const roundedHomography: HomographyMatrix3x3 = [
    roundTo(homographyMatrix3x3[0], 5),
    roundTo(homographyMatrix3x3[1], 5),
    roundTo(homographyMatrix3x3[2], 5),
    roundTo(homographyMatrix3x3[3], 5),
    roundTo(homographyMatrix3x3[4], 5),
    roundTo(homographyMatrix3x3[5], 5),
    roundTo(homographyMatrix3x3[6], 5),
    roundTo(homographyMatrix3x3[7], 5),
    roundTo(homographyMatrix3x3[8], 5),
  ];

  return {
    textKo: input.textKo.trim() || "한글 간판 데칼",
    decalKind: input.decalKind,
    opacity,
    surfaceBasis: { normal, tangentU, bitangentV },
    clippedBoundsUv,
    clipAreaRatio,
    isPartiallyClipped,
    isCompletelyOutside,
    backfaceCulled,
    worldCorners,
    screenCorners,
    homographyMatrix3x3: roundedHomography,
    homographyMaxErrorPx: roundTo(maxErr, 4),
    projectedStrokes,
    clippedStrokeSegmentCount,
    distortionCompensation: {
      obliqueAngleDeg,
      foreshorteningRatio,
      aspectCorrectionScale,
    },
    svgPolygonPoints: screenCorners.map((pt) => `${pt.x},${pt.y}`).join(" "),
    costKrw: 0,
  };
}
