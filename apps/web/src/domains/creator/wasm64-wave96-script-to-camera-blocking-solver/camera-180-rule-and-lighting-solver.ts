/**
 * Wave 96 — 3D 카메라 180° 시선 축(Line-of-Action) · 30° 컷 법칙 · 3점 조명 블록킹 솔버 및 연속성 감사기.
 */

import {
  SHOT_SCALE_RANK_MAP,
  recommendShotGrammarForBeat,
  type BeatEmotionTag,
  type ComicShotScale,
  type ParsedScriptScene,
  type SceneTimeOfDay,
  type ScriptBeat,
  type ShotGrammarRecommendation,
  type VerticalCameraAngleBias,
} from "./korean-script-beat-parser";

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export interface Vec2XZ { readonly x: number; readonly z: number }

export interface BlockingActorSpec {
  readonly actorId: string;
  readonly displayNameKo?: string;
  readonly position: Vec3;
  readonly facingDirectionXZ?: Vec2XZ;
  readonly eyeHeightMeters?: number;
  readonly personalRadiusMeters?: number;
}

export interface NormalizedBlockingActor {
  readonly actorId: string;
  readonly displayNameKo: string;
  readonly position: Vec3;
  readonly facingDirectionXZ: Vec2XZ;
  readonly eyeHeightMeters: number;
  readonly personalRadiusMeters: number;
}

export interface LineOfActionAxis {
  readonly primaryActorAId: string;
  readonly primaryActorBId: string | null;
  readonly axisOrigin: Vec2XZ;
  readonly axisDirectionXZ: Vec2XZ;
  readonly axisNormalXZ: Vec2XZ;
  readonly lockedSideSign: 1 | -1;
}

export interface CameraPlacement3d {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly focalLengthMm: number;
  readonly horizontalFovDeg: number;
  readonly verticalFovDeg: number;
  readonly pitchDeg: number;
  readonly rollDeg: number;
  readonly shotScale: ComicShotScale;
  readonly shotScaleRank: number;
  readonly verticalPitchBias: VerticalCameraAngleBias;
  readonly cameraHalfPlaneSign: 1 | -1;
  readonly signedDistanceToAxisMeters: number;
}

export interface ActorScreenProjection {
  readonly actorId: string;
  readonly horizontalAngleDeg: number;
  readonly ndcX: number;
  readonly ndcY: number;
  readonly depthMeters: number;
  readonly inFrontOfCamera: boolean;
  readonly inFrame: boolean;
}

export interface DirectionalLightSpec {
  readonly role: "key" | "fill" | "rim";
  readonly direction: Vec3;
  readonly azimuthRelativeToCameraDeg: number;
  readonly elevationDeg: number;
  readonly intensity: number;
  readonly colorTemperatureK: number;
  readonly colorPreviewOklch: string;
  readonly shadowSoftness: number;
}

export interface ThreePointLightingRig {
  readonly beatId: string;
  readonly sceneTimeOfDay: SceneTimeOfDay;
  readonly emotionTag: BeatEmotionTag;
  readonly keyLight: DirectionalLightSpec;
  readonly fillLight: DirectionalLightSpec;
  readonly rimLight: DirectionalLightSpec;
  readonly keyToFillRatio: number;
  readonly rimToKeyRatio: number;
  readonly contrastMood: "high-contrast-chiaroscuro" | "dramatic-sculpted" | "balanced-natural" | "soft-enveloping";
  readonly shadowSoftness: number;
  readonly ambientBounceIntensity: number;
  readonly lightingNotesKo: string;
}

export interface CameraBlockingShot {
  readonly shotIndex: number;
  readonly shotCode: string;
  readonly beat: ScriptBeat;
  readonly subjectActorId: string;
  readonly listenerActorId: string | null;
  readonly intentionalAxisReset: boolean;
  readonly grammar: ShotGrammarRecommendation;
  readonly camera: CameraPlacement3d;
  readonly actorProjections: readonly ActorScreenProjection[];
  readonly screenOrderLeftToRight: readonly string[];
  readonly leadRoomMarginNormalized: number;
  readonly angularSeparationFromPreviousDeg: number | null;
  readonly lighting: ThreePointLightingRig;
}

export interface CameraBlockingPlan {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly sceneTimeOfDay: SceneTimeOfDay;
  readonly axis: LineOfActionAxis;
  readonly actors: readonly NormalizedBlockingActor[];
  readonly shots: readonly CameraBlockingShot[];
}

export interface SolveCameraBlockingOptions {
  readonly preferredSideSign?: 1 | -1;
  readonly primaryActorPair?: readonly [string, string];
  readonly sensorWidthMm?: number;
  readonly aspectRatio?: number;
  readonly minAxisClearanceMeters?: number;
  readonly minCutSeparationDeg?: number;
}

export type ContinuityViolationCode =
  | "axis-180-violation"
  | "jump-cut-under-30-deg"
  | "camera-actor-collision"
  | "unreadable-extreme-roll";

export interface ContinuityViolation {
  readonly code: ContinuityViolationCode;
  readonly severity: "error" | "warning";
  readonly shotIndex: number;
  readonly beatId: string;
  readonly previousShotIndex?: number;
  readonly actorId?: string;
  readonly measuredValue: number;
  readonly thresholdValue: number;
  readonly messageKo: string;
}

export interface CameraBlockingAuditResult {
  readonly passed: boolean;
  readonly violationCount: number;
  readonly violations: readonly ContinuityViolation[];
  readonly intentionalAxisResetCount: number;
  readonly minAngularSeparationDegOnSameSubject: number | null;
  readonly minCameraActorDistanceMeters: number;
  readonly maxAbsRollDeg: number;
  readonly screenOrderConsistentSegments: number;
  readonly summaryStatusKo: string;
}

interface EmotionLightProfile {
  readonly ratio: number; readonly keyAz: number; readonly keyEl: number;
  readonly kelvinShift: number; readonly softness: number; readonly rimMult: number;
}
const EMOTION_LIGHTING: Readonly<Record<BeatEmotionTag, EmotionLightProfile>> = {
  "calm-dialogue": { ratio: 2.2, keyAz: 38, keyEl: 36, kelvinShift: 0, softness: 0.68, rimMult: 0.58 },
  "intimate-warmth": { ratio: 2.0, keyAz: 34, keyEl: 30, kelvinShift: -250, softness: 0.78, rimMult: 0.58 },
  "melancholy-isolation": { ratio: 3.8, keyAz: 62, keyEl: 32, kelvinShift: 500, softness: 0.52, rimMult: 0.58 },
  "action-impact": { ratio: 4.6, keyAz: 48, keyEl: 46, kelvinShift: 150, softness: 0.24, rimMult: 0.95 },
  tension: { ratio: 5.6, keyAz: 64, keyEl: 44, kelvinShift: 300, softness: 0.24, rimMult: 0.82 },
  "shock-reveal": { ratio: 6.8, keyAz: 72, keyEl: 48, kelvinShift: 450, softness: 0.24, rimMult: 0.82 },
};
const TIME_KELVINS: Readonly<Record<SceneTimeOfDay, { readonly key: number; readonly fill: number; readonly rim: number }>> = {
  daylight: { key: 5600, fill: 6800, rim: 5200 },
  sunset: { key: 3300, fill: 5800, rim: 2900 },
  "night-neon": { key: 7600, fill: 8400, rim: 3400 },
  "interior-warm": { key: 3150, fill: 3900, rim: 4900 },
};

const DEFAULT_SENSOR_WIDTH_MM = 36;
const DEFAULT_ASPECT_RATIO = 16 / 9;
const DEFAULT_EYE_HEIGHT_M = 1.62;
const DEFAULT_PERSONAL_RADIUS_M = 0.35;
const ACTOR_COLLISION_BUFFER_M = 0.22;
const MAX_READABLE_ROLL_DEG = 25;
const MIN_30_DEG_CUT_THRESHOLD = 30;
const AXIS_ON_LINE_EPSILON_M = 0.02;

const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min);
const roundTo = (v: number, d: number): number => (Number.isFinite(v) ? Math.round(v * Math.pow(10, d)) / Math.pow(10, d) : 0);
const degToRad = (deg: number): number => (deg * Math.PI) / 180;
const radToDeg = (rad: number): number => (rad * 180) / Math.PI;
const dotXZ = (a: Vec2XZ, b: Vec2XZ): number => a.x * b.x + a.z * b.z;
const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const roundVec3 = (v: Vec3, d = 4): Vec3 => ({ x: roundTo(v.x, d), y: roundTo(v.y, d), z: roundTo(v.z, d) });
const normalizeXZ = (v: Vec2XZ, fb: Vec2XZ = { x: 1, z: 0 }): Vec2XZ => {
  const len = Math.hypot(v.x, v.z);
  return !Number.isFinite(len) || len < 1e-6 ? fb : { x: v.x / len, z: v.z / len };
};
const normalize3 = (v: Vec3, fb: Vec3 = { x: 0, y: 0, z: -1 }): Vec3 => {
  const len = Math.hypot(v.x, v.y, v.z);
  return !Number.isFinite(len) || len < 1e-6 ? fb : { x: v.x / len, y: v.y / len, z: v.z / len };
};
const computeSignedAxisDistance = (pt: Vec2XZ, axis: LineOfActionAxis): number =>
  dotXZ({ x: pt.x - axis.axisOrigin.x, z: pt.z - axis.axisOrigin.z }, axis.axisNormalXZ);
const computeAzimuthSepDeg = (camA: Vec3, camB: Vec3, subjectPos: Vec3): number => {
  const dirA = normalizeXZ({ x: camA.x - subjectPos.x, z: camA.z - subjectPos.z }, { x: 0, z: 1 });
  const dirB = normalizeXZ({ x: camB.x - subjectPos.x, z: camB.z - subjectPos.z }, { x: 0, z: 1 });
  return roundTo(radToDeg(Math.acos(clamp(dotXZ(dirA, dirB), -1, 1))), 2);
};

function normalizeActors(scene: ParsedScriptScene, rawActors: readonly BlockingActorSpec[]): readonly NormalizedBlockingActor[] {
  const base: BlockingActorSpec[] = rawActors.length > 0
    ? [...rawActors]
    : scene.participantIds.length >= 2
      ? [{ actorId: scene.participantIds[0] ?? "인물A", position: { x: -1.4, y: 0, z: 0 } }, { actorId: scene.participantIds[1] ?? "인물B", position: { x: 1.4, y: 0, z: 0 } }]
      : [{ actorId: scene.participantIds[0] ?? "화자", position: { x: 0, y: 0, z: 0 } }];
  const [first, second] = base;
  const centerXZ: Vec2XZ = first && second
    ? { x: (first.position.x + second.position.x) / 2, z: (first.position.z + second.position.z) / 2 }
    : { x: first?.position.x ?? 0, z: first?.position.z ?? 0 };
  return base.map((actor, idx) => {
    const facing = actor.facingDirectionXZ
      ? normalizeXZ(actor.facingDirectionXZ)
      : idx === 0 && second
        ? normalizeXZ({ x: second.position.x - actor.position.x, z: second.position.z - actor.position.z })
        : idx === 1 && first
          ? normalizeXZ({ x: first.position.x - actor.position.x, z: first.position.z - actor.position.z }, { x: -1, z: 0 })
          : normalizeXZ({ x: centerXZ.x - actor.position.x, z: centerXZ.z - actor.position.z }, { x: 0, z: 1 });
    return {
      actorId: actor.actorId,
      displayNameKo: actor.displayNameKo ?? actor.actorId,
      position: roundVec3(actor.position),
      facingDirectionXZ: { x: roundTo(facing.x, 4), z: roundTo(facing.z, 4) },
      eyeHeightMeters: clamp(actor.eyeHeightMeters ?? DEFAULT_EYE_HEIGHT_M, 0.7, 2.4),
      personalRadiusMeters: clamp(actor.personalRadiusMeters ?? DEFAULT_PERSONAL_RADIUS_M, 0.2, 1.2),
    };
  });
}

function buildLineOfActionAxis(actors: readonly NormalizedBlockingActor[], options: SolveCameraBlockingOptions): LineOfActionAxis {
  const lockedSideSign: 1 | -1 = options.preferredSideSign ?? 1;
  let primaryA = actors[0];
  let primaryB = actors.length >= 2 ? actors[1] : null;
  if (options.primaryActorPair) {
    primaryA = actors.find((a) => a.actorId === options.primaryActorPair?.[0]) ?? primaryA;
    const foundB = actors.find((a) => a.actorId === options.primaryActorPair?.[1]);
    if (foundB && foundB.actorId !== primaryA?.actorId) primaryB = foundB;
  }
  if (!primaryA) {
    return { primaryActorAId: "화자", primaryActorBId: null, axisOrigin: { x: 0, z: 0 }, axisDirectionXZ: { x: 1, z: 0 }, axisNormalXZ: { x: 0, z: 1 }, lockedSideSign };
  }
  const dir = primaryB
    ? normalizeXZ({ x: primaryB.position.x - primaryA.position.x, z: primaryB.position.z - primaryA.position.z })
    : normalizeXZ(primaryA.facingDirectionXZ);
  const axisOrigin: Vec2XZ = primaryB
    ? { x: roundTo((primaryA.position.x + primaryB.position.x) / 2, 4), z: roundTo((primaryA.position.z + primaryB.position.z) / 2, 4) }
    : { x: primaryA.position.x, z: primaryA.position.z };
  return {
    primaryActorAId: primaryA.actorId,
    primaryActorBId: primaryB ? primaryB.actorId : null,
    axisOrigin,
    axisDirectionXZ: { x: roundTo(dir.x, 5), z: roundTo(dir.z, 5) },
    axisNormalXZ: { x: roundTo(-dir.z, 5), z: roundTo(dir.x, 5) },
    lockedSideSign,
  };
}

function projectActorsToCameraScreen(
  camera: CameraPlacement3d,
  actors: readonly NormalizedBlockingActor[],
): { readonly projections: readonly ActorScreenProjection[]; readonly screenOrderLeftToRight: readonly string[] } {
  const tanHalfH = Math.max(1e-4, Math.tan(degToRad(camera.horizontalFovDeg) / 2));
  const tanHalfV = Math.max(1e-4, Math.tan(degToRad(camera.verticalFovDeg) / 2));
  const forwardXZ = normalizeXZ({ x: camera.forward.x, z: camera.forward.z }, { x: 0, z: -1 });
  const rightXZ = normalizeXZ({ x: camera.right.x, z: camera.right.z }, { x: 1, z: 0 });

  const projections: ActorScreenProjection[] = actors.map((actor) => {
    const rel: Vec3 = {
      x: actor.position.x - camera.position.x,
      y: actor.position.y + actor.eyeHeightMeters - camera.position.y,
      z: actor.position.z - camera.position.z,
    };
    const depth = dot3(rel, camera.forward);
    const horizRight = dotXZ({ x: rel.x, z: rel.z }, rightXZ);
    const horizForward = dotXZ({ x: rel.x, z: rel.z }, forwardXZ);
    const inFront = depth > 0.05;
    const safeDepth = Math.max(0.05, depth);
    const ndcX = inFront ? roundTo(dot3(rel, camera.right) / (safeDepth * tanHalfH), 3) : roundTo(Math.sign(horizRight) * 2, 3);
    const ndcY = inFront ? roundTo(dot3(rel, camera.up) / (safeDepth * tanHalfV), 3) : 0;
    return {
      actorId: actor.actorId,
      horizontalAngleDeg: roundTo(radToDeg(Math.atan2(horizRight, horizForward)), 2),
      ndcX,
      ndcY,
      depthMeters: roundTo(depth, 3),
      inFrontOfCamera: inFront,
      inFrame: inFront && Math.abs(ndcX) <= 1.05 && Math.abs(ndcY) <= 1.05,
    };
  });
  return {
    projections,
    screenOrderLeftToRight: [...projections].sort((a, b) => a.horizontalAngleDeg - b.horizontalAngleDeg).map((p) => p.actorId),
  };
}

function baseAzimuthDegForShot(scale: ComicShotScale, facesPos: boolean): number {
  const table: Readonly<Record<ComicShotScale, number>> = {
    "extreme-wide": 90,
    wide: 90,
    "medium-full": facesPos ? 68 : 112,
    "over-the-shoulder": facesPos ? 30 : 150,
    "medium-closeup": facesPos ? 48 : 132,
    closeup: facesPos ? 52 : 128,
    "extreme-closeup": facesPos ? 58 : 122,
  };
  return table[scale];
}

function minActorClearance(camXZ: Vec2XZ, actors: readonly NormalizedBlockingActor[]): number {
  let minMargin = Number.POSITIVE_INFINITY;
  for (let i = 0; i < actors.length; i += 1) {
    const a = actors[i];
    if (!a) continue;
    const margin = Math.hypot(camXZ.x - a.position.x, camXZ.z - a.position.z) - a.personalRadiusMeters;
    if (margin < minMargin) minMargin = margin;
  }
  return minMargin;
}

function enforceSafeCameraXZ(
  anchorXZ: Vec2XZ,
  thetaDeg: number,
  distM: number,
  axis: LineOfActionAxis,
  sideSign: 1 | -1,
  actors: readonly NormalizedBlockingActor[],
  minAxisClearance: number,
): Vec2XZ {
  const rad = degToRad(thetaDeg);
  const sideNormal: Vec2XZ = { x: axis.axisNormalXZ.x * sideSign, z: axis.axisNormalXZ.z * sideSign };
  const radial: Vec2XZ = {
    x: Math.cos(rad) * axis.axisDirectionXZ.x + Math.sin(rad) * sideNormal.x,
    z: Math.cos(rad) * axis.axisDirectionXZ.z + Math.sin(rad) * sideNormal.z,
  };
  const clampHalfPlane = (pt: Vec2XZ): Vec2XZ => {
    const signed = computeSignedAxisDistance(pt, axis) * sideSign;
    if (signed >= minAxisClearance) return pt;
    const push = minAxisClearance - signed + 0.05;
    return { x: pt.x + sideNormal.x * push, z: pt.z + sideNormal.z * push };
  };

  let candidate = clampHalfPlane({ x: anchorXZ.x + radial.x * distM, z: anchorXZ.z + radial.z * distM });
  for (let k = 0; k < 8; k += 1) {
    if (minActorClearance(candidate, actors) >= ACTOR_COLLISION_BUFFER_M) break;
    candidate = clampHalfPlane({
      x: candidate.x + radial.x * 0.34 + sideNormal.x * 0.16,
      z: candidate.z + radial.z * 0.34 + sideNormal.z * 0.16,
    });
  }
  return candidate;
}

function kelvinToOklch(kelvin: number): string {
  const k = clamp(kelvin, 2700, 9000);
  if (k <= 3600) return "oklch(0.76 0.14 68)";
  if (k <= 5000) return "oklch(0.84 0.08 82)";
  if (k <= 6400) return "oklch(0.92 0.02 220)";
  return "oklch(0.74 0.11 236)";
}

function makeLightSpec(
  role: "key" | "fill" | "rim",
  toCamXZ: Vec2XZ,
  camRightXZ: Vec2XZ,
  azDeg: number,
  elDeg: number,
  intensity: number,
  kelvin: number,
  softness: number,
): DirectionalLightSpec {
  const az = degToRad(azDeg);
  const el = degToRad(clamp(elDeg, 5, 82));
  const cosEl = Math.cos(el);
  const dir = normalize3({
    x: (Math.cos(az) * toCamXZ.x + Math.sin(az) * camRightXZ.x) * cosEl,
    y: Math.sin(el),
    z: (Math.cos(az) * toCamXZ.z + Math.sin(az) * camRightXZ.z) * cosEl,
  });
  return {
    role,
    direction: roundVec3(dir, 5),
    azimuthRelativeToCameraDeg: azDeg,
    elevationDeg: elDeg,
    intensity,
    colorTemperatureK: kelvin,
    colorPreviewOklch: kelvinToOklch(kelvin),
    shadowSoftness: softness,
  };
}

export function solveThreePointLightingForBeat(
  beat: ScriptBeat,
  sceneTimeOfDay: SceneTimeOfDay,
  camera: CameraPlacement3d,
  subjectPos: Vec3,
): ThreePointLightingRig {
  const toCamXZ = normalizeXZ({ x: camera.position.x - subjectPos.x, z: camera.position.z - subjectPos.z }, { x: 0, z: 1 });
  const camRightXZ = normalizeXZ({ x: toCamXZ.z, z: -toCamXZ.x }, { x: 1, z: 0 });
  const emo = EMOTION_LIGHTING[beat.emotionTag];
  const timeK = TIME_KELVINS[sceneTimeOfDay];

  let targetRatio = emo.ratio;
  if (sceneTimeOfDay === "interior-warm") targetRatio *= 1.08;
  else if (sceneTimeOfDay === "sunset") targetRatio *= 1.18;
  else if (sceneTimeOfDay === "night-neon") targetRatio = Math.max(5.4, targetRatio * 1.32);
  targetRatio = roundTo(clamp(targetRatio, 1.5, 10.5), 2);

  const keyKelvin = Math.round(clamp(timeK.key + emo.kelvinShift, 2700, 9000));
  const fillKelvin = Math.round(clamp(timeK.fill + emo.kelvinShift * 0.5, 2700, 9000));
  const rimKelvin = Math.round(clamp(timeK.rim, 2700, 9000));

  const keyIntensity = roundTo(1.2 + beat.actionIntensity * 0.45, 3);
  const fillIntensity = roundTo(keyIntensity / targetRatio, 4);
  const rimIntensity = roundTo(keyIntensity * (sceneTimeOfDay === "night-neon" ? 0.95 : emo.rimMult), 3);

  const timeSoft = sceneTimeOfDay === "night-neon" ? -0.08 : sceneTimeOfDay === "interior-warm" ? 0.08 : 0;
  const shadowSoftness = roundTo(clamp(emo.softness + timeSoft, 0.12, 0.92), 2);
  const actualRatio = roundTo(keyIntensity / fillIntensity, 2);
  const contrastMood: ThreePointLightingRig["contrastMood"] =
    actualRatio >= 6.0 ? "high-contrast-chiaroscuro"
      : actualRatio >= 4.5 ? "dramatic-sculpted"
        : actualRatio >= 2.8 ? "balanced-natural"
          : "soft-enveloping";

  return {
    beatId: beat.beatId,
    sceneTimeOfDay,
    emotionTag: beat.emotionTag,
    keyLight: makeLightSpec("key", toCamXZ, camRightXZ, emo.keyAz, emo.keyEl, keyIntensity, keyKelvin, shadowSoftness),
    fillLight: makeLightSpec("fill", toCamXZ, camRightXZ, -clamp(emo.keyAz - 8, 30, 58), 18, fillIntensity, fillKelvin, roundTo(clamp(shadowSoftness + 0.22, 0.45, 0.96), 2)),
    rimLight: makeLightSpec("rim", toCamXZ, camRightXZ, -148, sceneTimeOfDay === "night-neon" ? 42 : 36, rimIntensity, rimKelvin, roundTo(clamp(shadowSoftness * 0.7, 0.1, 0.6), 2)),
    keyToFillRatio: actualRatio,
    rimToKeyRatio: roundTo(rimIntensity / keyIntensity, 2),
    contrastMood,
    shadowSoftness,
    ambientBounceIntensity: roundTo(clamp(0.45 / Math.sqrt(actualRatio), 0.1, 0.38), 3),
    lightingNotesKo:
      actualRatio >= 5.0
        ? `강한 명암비(${actualRatio}:1)와 날카로운 그림자로 긴장감을 세우고 ${rimKelvin}K 림 라이트로 윤곽을 분리합니다.`
        : `부드러운 명암비(${actualRatio}:1)와 완만한 필 라이트로 인물 표정과 공간 온기를 또렷하게 살립니다.`,
  };
}

export function solveCameraBlockingPlan(
  scene: ParsedScriptScene,
  rawActors: readonly BlockingActorSpec[],
  options: SolveCameraBlockingOptions = {},
): CameraBlockingPlan {
  const actors = normalizeActors(scene, rawActors);
  const axis = buildLineOfActionAxis(actors, options);
  const sensorWidthMm = options.sensorWidthMm ?? DEFAULT_SENSOR_WIDTH_MM;
  const aspectRatio = options.aspectRatio ?? DEFAULT_ASPECT_RATIO;
  const minAxisClearance = clamp(options.minAxisClearanceMeters ?? 0.32, 0.15, 1.2);
  const targetSepDeg = clamp(options.minCutSeparationDeg ?? 36, 31, 65);

  const actorMap = new Map<string, NormalizedBlockingActor>();
  for (let i = 0; i < actors.length; i += 1) {
    const a = actors[i];
    if (a) actorMap.set(a.actorId, a);
  }

  let activeSideSign: 1 | -1 = axis.lockedSideSign;
  const shots: CameraBlockingShot[] = [];
  const totalBeats = scene.beats.length;

  for (let i = 0; i < totalBeats; i += 1) {
    const beat = scene.beats[i];
    if (!beat) continue;
    if (beat.intentionalAxisReset) activeSideSign = activeSideSign === 1 ? -1 : 1;

    const subject = actorMap.get(beat.speakerId) ?? actors[0];
    if (!subject) continue;
    const partner =
      (beat.listenerId ? actorMap.get(beat.listenerId) : undefined) ??
      actors.find((c) => c.actorId !== subject.actorId) ??
      null;

    const grammar = recommendShotGrammarForBeat(beat, i, totalBeats);
    const horizontalFovDeg = roundTo(radToDeg(2 * Math.atan(sensorWidthMm / (2 * clamp(grammar.focalLengthMm, 12, 300)))), 2);
    const verticalFovDeg = roundTo(radToDeg(2 * Math.atan(Math.tan(degToRad(horizontalFovDeg) / 2) / Math.max(0.5, aspectRatio))), 2);
    const isTwoShotWide = (grammar.shotScale === "wide" || grammar.shotScale === "extreme-wide") && partner !== null;

    const anchorXZ: Vec2XZ = isTwoShotWide
      ? { x: (subject.position.x + partner.position.x) / 2, z: (subject.position.z + partner.position.z) / 2 }
      : { x: subject.position.x, z: subject.position.z };
    const gazeDirXZ: Vec2XZ = partner
      ? normalizeXZ({ x: partner.position.x - subject.position.x, z: partner.position.z - subject.position.z }, subject.facingDirectionXZ)
      : subject.facingDirectionXZ;

    const idealTheta = baseAzimuthDegForShot(grammar.shotScale, dotXZ(gazeDirXZ, axis.axisDirectionXZ) >= 0);
    const prevShot = i > 0 ? shots[i - 1] ?? null : null;
    const needsShift =
      prevShot !== null &&
      prevShot.subjectActorId === subject.actorId &&
      !beat.intentionalAxisReset &&
      Math.abs(grammar.shotScaleRank - prevShot.grammar.shotScaleRank) < 2;

    let chosenXZ = enforceSafeCameraXZ(anchorXZ, idealTheta, grammar.subjectDistanceMeters, axis, activeSideSign, actors, minAxisClearance);
    if (needsShift && prevShot) {
      const sideNormal: Vec2XZ = { x: axis.axisNormalXZ.x * activeSideSign, z: axis.axisNormalXZ.z * activeSideSign };
      const prevRel = normalizeXZ({ x: prevShot.camera.position.x - subject.position.x, z: prevShot.camera.position.z - subject.position.z }, sideNormal);
      const prevTheta = clamp(radToDeg(Math.atan2(Math.max(0.05, dotXZ(prevRel, sideNormal)), dotXZ(prevRel, axis.axisDirectionXZ))), 20, 160);
      const candidates: number[] = [idealTheta];
      for (const delta of [42, -42, 54, -54, 68, -68, 82, -82]) {
        const s = prevTheta + delta;
        if (s >= 22 && s <= 158) candidates.push(s);
      }
      candidates.push(30, 74, 106, 150);

      let bestScore = -1;
      for (let c = 0; c < candidates.length; c += 1) {
        const testXZ = enforceSafeCameraXZ(anchorXZ, candidates[c] ?? idealTheta, grammar.subjectDistanceMeters, axis, activeSideSign, actors, minAxisClearance);
        const sepDeg = computeAzimuthSepDeg(prevShot.camera.position, { x: testXZ.x, y: subject.eyeHeightMeters, z: testXZ.z }, subject.position);
        const margin = minActorClearance(testXZ, actors);
        if (sepDeg >= targetSepDeg && margin >= ACTOR_COLLISION_BUFFER_M) {
          chosenXZ = testXZ;
          break;
        }
        const score = sepDeg + Math.min(0.4, margin) * 10;
        if (score > bestScore) {
          bestScore = score;
          chosenXZ = testXZ;
        }
      }
    }

    const baseTargetY = isTwoShotWide
      ? (subject.position.y + subject.eyeHeightMeters + partner.position.y + partner.eyeHeightMeters) / 2
      : subject.position.y + subject.eyeHeightMeters;
    const halfWidthAtDist = grammar.subjectDistanceMeters * Math.tan(degToRad(horizontalFovDeg) / 2);
    const maxLeadShift = partner
      ? Math.min(0.42, 0.36 * Math.hypot(partner.position.x - subject.position.x, partner.position.z - subject.position.z))
      : 0.35;
    const leadShift = isTwoShotWide ? 0 : clamp(grammar.leadRoomScreenOffset * halfWidthAtDist * 0.85, 0, maxLeadShift);

    const target = roundVec3({ x: anchorXZ.x + gazeDirXZ.x * leadShift, y: baseTargetY, z: anchorXZ.z + gazeDirXZ.z * leadShift });
    const camPos = roundVec3({ x: chosenXZ.x, y: clamp(baseTargetY + grammar.cameraHeightOffsetMeters, 0.45, 4.2), z: chosenXZ.z });
    const forward = normalize3({ x: target.x - camPos.x, y: target.y - camPos.y, z: target.z - camPos.z });
    const worldUp: Vec3 = Math.abs(forward.y) > 0.992 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
    const right = normalize3(cross3(forward, worldUp), { x: 1, y: 0, z: 0 });
    const up = normalize3(cross3(right, forward), { x: 0, y: 1, z: 0 });
    const signedDist = roundTo(computeSignedAxisDistance(chosenXZ, axis), 4);

    const camera: CameraPlacement3d = {
      position: camPos,
      target,
      forward: roundVec3(forward, 5),
      right: roundVec3(right, 5),
      up: roundVec3(up, 5),
      focalLengthMm: grammar.focalLengthMm,
      horizontalFovDeg,
      verticalFovDeg,
      pitchDeg: roundTo(radToDeg(Math.asin(clamp(forward.y, -1, 1))), 2),
      rollDeg: grammar.dutchRollDeg,
      shotScale: grammar.shotScale,
      shotScaleRank: grammar.shotScaleRank,
      verticalPitchBias: grammar.verticalPitchBias,
      cameraHalfPlaneSign: signedDist >= 0 ? 1 : -1,
      signedDistanceToAxisMeters: signedDist,
    };

    const { projections, screenOrderLeftToRight } = projectActorsToCameraScreen(camera, actors);
    const subjectProj = projections.find((p) => p.actorId === subject.actorId);
    const clampedNdcX = clamp(subjectProj?.ndcX ?? 0, -1, 1);
    const gazeDotRight = dotXZ(gazeDirXZ, { x: camera.right.x, z: camera.right.z });

    shots.push({
      shotIndex: i,
      shotCode: `C${i + 1}`,
      beat,
      subjectActorId: subject.actorId,
      listenerActorId: partner ? partner.actorId : null,
      intentionalAxisReset: beat.intentionalAxisReset,
      grammar,
      camera,
      actorProjections: projections,
      screenOrderLeftToRight,
      leadRoomMarginNormalized: roundTo(gazeDotRight >= 0 ? (1 - clampedNdcX) / 2 : (1 + clampedNdcX) / 2, 3),
      angularSeparationFromPreviousDeg:
        prevShot !== null && prevShot.subjectActorId === subject.actorId
          ? computeAzimuthSepDeg(prevShot.camera.position, camera.position, subject.position)
          : null,
      lighting: solveThreePointLightingForBeat(beat, scene.sceneTimeOfDay, camera, subject.position),
    });
  }

  return { sceneId: scene.sceneId, sceneTitle: scene.sceneTitle, sceneTimeOfDay: scene.sceneTimeOfDay, axis, actors, shots };
}

export function auditCameraBlockingContinuity(
  plan: CameraBlockingPlan,
  rawActors: readonly BlockingActorSpec[],
): CameraBlockingAuditResult {
  const actorSpecs: readonly NormalizedBlockingActor[] = rawActors.length > 0
    ? rawActors.map((a) => ({
        actorId: a.actorId,
        displayNameKo: a.displayNameKo ?? a.actorId,
        position: a.position,
        facingDirectionXZ: a.facingDirectionXZ ?? { x: 1, z: 0 },
        eyeHeightMeters: a.eyeHeightMeters ?? DEFAULT_EYE_HEIGHT_M,
        personalRadiusMeters: a.personalRadiusMeters ?? DEFAULT_PERSONAL_RADIUS_M,
      }))
    : plan.actors;
  const actorMap = new Map<string, NormalizedBlockingActor>(actorSpecs.map((a) => [a.actorId, a]));

  const violations: ContinuityViolation[] = [];
  const push = (
    code: ContinuityViolationCode, shotIndex: number, beatId: string, measuredValue: number,
    thresholdValue: number, messageKo: string, extra: { readonly previousShotIndex?: number; readonly actorId?: string } = {},
  ): void => { violations.push({ code, severity: "error", shotIndex, beatId, measuredValue, thresholdValue, messageKo, ...extra }); };

  let expectedSide: 1 | -1 = plan.axis.lockedSideSign;
  let intentionalAxisResetCount = 0;
  let minAngularSep: number | null = null;
  let minActorDist = Number.POSITIVE_INFINITY;
  let maxAbsRoll = 0;
  let consistentSegments = 0;

  for (let i = 0; i < plan.shots.length; i += 1) {
    const shot = plan.shots[i];
    if (!shot) continue;
    const camPos = shot.camera.position;
    const signedDist = computeSignedAxisDistance({ x: camPos.x, z: camPos.z }, plan.axis);
    const measuredSign: 1 | -1 | 0 = signedDist > AXIS_ON_LINE_EPSILON_M ? 1 : signedDist < -AXIS_ON_LINE_EPSILON_M ? -1 : 0;

    if (shot.intentionalAxisReset) {
      intentionalAxisResetCount += 1;
      if (measuredSign === 0) {
        push("axis-180-violation", i, shot.beat.beatId, roundTo(signedDist, 4), AXIS_ON_LINE_EPSILON_M, `${shot.shotCode} 컷이 의도적 축 전환 이후에도 180° 시선 축 위에 걸쳐 있습니다.`);
      } else {
        expectedSide = measuredSign;
        consistentSegments += 1;
      }
    } else if (measuredSign === 0 || measuredSign !== expectedSide) {
      push("axis-180-violation", i, shot.beat.beatId, roundTo(signedDist, 4), expectedSide, `${shot.shotCode} 컷이 명시적 축 전환 없이 180° 시선 축을 넘어 인물 좌우 방향이 뒤집혔습니다.`);
    } else if (i === 0) {
      consistentSegments += 1;
    }

    const prevShot = i > 0 ? plan.shots[i - 1] : undefined;
    if (prevShot && shot.subjectActorId === prevShot.subjectActorId && !shot.intentionalAxisReset) {
      const subjectActor = actorMap.get(shot.subjectActorId);
      if (subjectActor) {
        const angleDeg = computeAzimuthSepDeg(prevShot.camera.position, camPos, subjectActor.position);
        if (minAngularSep === null || angleDeg < minAngularSep) minAngularSep = angleDeg;
        const scaleJump = Math.abs(SHOT_SCALE_RANK_MAP[shot.camera.shotScale] - SHOT_SCALE_RANK_MAP[prevShot.camera.shotScale]);
        if (scaleJump < 2 && angleDeg < MIN_30_DEG_CUT_THRESHOLD - 1e-6) {
          push("jump-cut-under-30-deg", i, shot.beat.beatId, roundTo(angleDeg, 2), MIN_30_DEG_CUT_THRESHOLD, `${prevShot.shotCode}→${shot.shotCode} 연속 컷이 동일 인물(${subjectActor.displayNameKo})에 대해 ${roundTo(angleDeg, 1)}°만 이동해 30° 점프컷 기준에 미달합니다.`, { previousShotIndex: i - 1, actorId: subjectActor.actorId });
        }
      }
    }

    for (const actor of actorSpecs) {
      const distXZ = Math.hypot(camPos.x - actor.position.x, camPos.z - actor.position.z);
      if (distXZ < minActorDist) minActorDist = distXZ;
      if (distXZ < actor.personalRadiusMeters - 1e-6) {
        push("camera-actor-collision", i, shot.beat.beatId, roundTo(distXZ, 3), actor.personalRadiusMeters, `${shot.shotCode} 카메라가 ${actor.displayNameKo} 인물 경계 반경(${actor.personalRadiusMeters}m) 안쪽(${roundTo(distXZ, 2)}m)과 충돌합니다.`, { actorId: actor.actorId });
      }
    }

    const absRoll = Math.abs(shot.camera.rollDeg);
    if (absRoll > maxAbsRoll) maxAbsRoll = absRoll;
    if (absRoll > MAX_READABLE_ROLL_DEG + 1e-6) {
      push("unreadable-extreme-roll", i, shot.beat.beatId, roundTo(absRoll, 2), MAX_READABLE_ROLL_DEG, `${shot.shotCode} 컷의 더치 롤(${roundTo(absRoll, 1)}°)이 대사 가독 한계(${MAX_READABLE_ROLL_DEG}°)를 넘겼습니다.`);
    }
  }

  const passed = violations.length === 0;
  return {
    passed,
    violationCount: violations.length,
    violations,
    intentionalAxisResetCount,
    minAngularSeparationDegOnSameSubject: minAngularSep,
    minCameraActorDistanceMeters: Number.isFinite(minActorDist) ? roundTo(minActorDist, 3) : 0,
    maxAbsRollDeg: roundTo(maxAbsRoll, 2),
    screenOrderConsistentSegments: Math.max(1, consistentSegments),
    summaryStatusKo: passed
      ? `연속성 감사 통과 (위반 0건, 의도적 축 전환 ${intentionalAxisResetCount}회)`
      : `연속성 위반 ${violations.length}건 발견 — 촬영 전 카메라 배치 수정이 필요합니다.`,
  };
}
