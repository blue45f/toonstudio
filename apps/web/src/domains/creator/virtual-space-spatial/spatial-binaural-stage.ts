/**
 * 가상 스튜디오 3D HRTF 바이노럴 공간 음향 스테이지 물리 연산 엔진.
 *
 * - 4종 음향 구역(목재 아틀리에 · 정숙 자료실 · 방음 허들 부스 · 야외 루프탑 테라스)의
 *   Sabine 물리 잔향(RT60)·공기 흡음 로우패스·벽체 차음(Occlusion dB)·HRTF 3D 방위각/고도각/거리 감쇄를 계산한다.
 * - 동료 아바타가 책상에서 그림을 그릴 때 거리·방향·벽체에 맞춰 은은한 원거리 연필/펜 ASMR과
 *   발소리, 음성 허들을 분리 라우팅한다.
 */

export type AcousticZoneId =
  | "wood-atelier"
  | "quiet-archive"
  | "soundproof-huddle"
  | "rooftop-terrace";

export type WallMaterialId =
  | "glass-partition"
  | "wood-partition"
  | "bookshelf-divider"
  | "acoustic-booth-wall";

export type PeerAcousticActivity =
  | "sketch-pencil"
  | "ink-pen"
  | "stylus-tap"
  | "footsteps"
  | "voice-huddle"
  | "idle";

export interface SpatialVec3 {
  /** 좌(-) / 우(+) 미터 좌표 */
  readonly x: number;
  /** 바닥 기준 높이(+) 미터 좌표 */
  readonly y: number;
  /** 정면(-) / 후면(+) 미터 좌표 (WebAudio 오른손 좌표계) */
  readonly z: number;
}

export interface SpatialPoint2D {
  readonly x: number;
  readonly z: number;
}

export interface AcousticZoneProfile {
  readonly id: AcousticZoneId;
  readonly nameKo: string;
  readonly subtitleKo: string;
  readonly volumeM3: number;
  readonly surfaceAreaM2: number;
  readonly averageAbsorptionCoeff: number;
  readonly rt60Sec: number;
  readonly earlyReflectionMs: number;
  readonly reverbWetMix: number;
  readonly baseLowpassHz: number;
  readonly airAbsorptionPerMeter: number;
  readonly ambientFloorDb: number;
  readonly floorSurfaceKo: string;
}

export interface AcousticWallSegment {
  readonly id: string;
  readonly labelKo: string;
  readonly material: WallMaterialId;
  readonly start: SpatialPoint2D;
  readonly end: SpatialPoint2D;
  readonly occlusionDb: number;
  readonly lowpassHz: number;
  readonly active: boolean;
}

export interface SpatialListenerState {
  readonly position: SpatialVec3;
  /** 탑다운 평면 기준 시계방향 회전각 (0° = -Z 정면, +90° = +X 우측) */
  readonly yawDeg: number;
  /** 고개 상하 각도 (양수 = 위) */
  readonly pitchDeg: number;
}

export interface SpatialPeerAudioSource {
  readonly peerId: string;
  readonly displayNameKo: string;
  readonly roleKo: string;
  readonly position: SpatialVec3;
  readonly activity: PeerAcousticActivity;
  readonly intensity: number;
  readonly muted: boolean;
}

export interface AcousticStageOptions {
  readonly refDistanceM?: number;
  readonly maxDistanceM?: number;
  readonly ambientAsmrLevel?: number;
}

export interface HrtfSpatialEvaluation {
  readonly peerId: string;
  readonly distanceM: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly stereoPan: number;
  readonly itdUs: number;
  readonly ildDb: number;
  readonly inverseSquarePowerRatio: number;
  readonly distanceGain: number;
  readonly distanceAttenuationDb: number;
  readonly occludingWallIds: readonly string[];
  readonly occludingWallLabelsKo: readonly string[];
  readonly occlusionDb: number;
  readonly airLowpassHz: number;
  readonly effectiveLowpassHz: number;
  readonly totalLinearGain: number;
  readonly totalAttenuationDb: number;
  readonly reverbSendGain: number;
  readonly pencilPenAsmrGain: number;
  readonly footstepGain: number;
  readonly voiceGain: number;
  readonly audible: boolean;
}

export interface AcousticStageMixReport {
  readonly zone: AcousticZoneProfile;
  readonly listener: SpatialListenerState;
  readonly peerMixes: readonly HrtfSpatialEvaluation[];
  readonly audiblePeerCount: number;
  readonly activeAsmrSourceCount: number;
  readonly maxOcclusionDb: number;
  readonly averageEffectiveLowpassHz: number;
}

const SPEED_OF_SOUND_MPS = 343;
const HUMAN_HEAD_RADIUS_M = 0.0875;
const MIN_EFFECTIVE_DISTANCE_M = 0.35;
const MAX_OCCLUSION_DB = 48;
const AUDIBLE_THRESHOLD_DB = -66;

export const STUDIO_STAGE_BOUNDS = {
  minX: -6,
  maxX: 6,
  minZ: -4.5,
  maxZ: 4.5,
  widthM: 12,
  depthM: 9,
} as const;

export const ACTIVITY_LABEL_KO: Readonly<Record<PeerAcousticActivity, string>> = {
  "sketch-pencil": "연필 스케치 ASMR",
  "ink-pen": "딥펜 잉킹 ASMR",
  "stylus-tap": "타블렛 스타일러스",
  footsteps: "스튜디오 발소리",
  "voice-huddle": "음성 허들 대화",
  idle: "정지 · 대기",
};

const ACTIVITY_BASE_GAIN: Readonly<Record<PeerAcousticActivity, number>> = {
  "sketch-pencil": 0.42,
  "ink-pen": 0.38,
  "stylus-tap": 0.34,
  footsteps: 0.52,
  "voice-huddle": 0.92,
  idle: 0,
};

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function dbToLinearGain(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.pow(10, db / 20);
}

export function linearGainToDb(gain: number): number {
  if (!Number.isFinite(gain) || gain <= 1e-6) return -120;
  return 20 * Math.log10(gain);
}

/** 바이노럴 좌/우 패닝 계수(-1..+1)를 한글 방향 레이블로 포맷한다. */
export function formatStereoPanKo(stereoPan: number): string {
  const pct = Math.round(Math.abs(stereoPan) * 100);
  if (pct < 4) return "중앙 C";
  return stereoPan < 0 ? `좌 L${pct}%` : `우 R${pct}%`;
}

/**
 * Sabine 방정식 기반 잔향 시간(RT60): `RT60 = 0.161 * V / (S * alpha)`.
 */
export function computeSabineRt60Sec(
  volumeM3: number,
  surfaceAreaM2: number,
  averageAbsorptionCoeff: number,
): number {
  const safeVolume = Math.max(1, volumeM3);
  const safeArea = Math.max(1, surfaceAreaM2);
  const safeAlpha = clampNumber(averageAbsorptionCoeff, 0.05, 0.99);
  return roundTo((0.161 * safeVolume) / (safeArea * safeAlpha), 2);
}

/**
 * 가상 스튜디오 4종 음향 구역 프로파일.
 * RT60 서열: 야외 루프탑(자유 음장) < 방음 허들 부스 < 정숙 자료실 < 목재 아틀리에.
 */
export const ACOUSTIC_ZONE_PROFILES: Readonly<Record<AcousticZoneId, AcousticZoneProfile>> = {
  "wood-atelier": {
    id: "wood-atelier",
    nameKo: "목재 아틀리에",
    subtitleKo: "오크 마루·목재 서까래의 따뜻한 중잔향 작업실",
    volumeM3: 367,
    surfaceAreaM2: 318,
    averageAbsorptionCoeff: 0.22,
    rt60Sec: computeSabineRt60Sec(367, 318, 0.22),
    earlyReflectionMs: 18,
    reverbWetMix: 0.31,
    baseLowpassHz: 18200,
    airAbsorptionPerMeter: 0.048,
    ambientFloorDb: -48,
    floorSurfaceKo: "원목 오크 마루",
  },
  "quiet-archive": {
    id: "quiet-archive",
    nameKo: "정숙 자료실",
    subtitleKo: "서가·패브릭 흡음 패널이 고역을 정돈하는 집중 열람실",
    volumeM3: 240,
    surfaceAreaM2: 268,
    averageAbsorptionCoeff: 0.31,
    rt60Sec: computeSabineRt60Sec(240, 268, 0.31),
    earlyReflectionMs: 12,
    reverbWetMix: 0.17,
    baseLowpassHz: 15800,
    airAbsorptionPerMeter: 0.068,
    ambientFloorDb: -56,
    floorSurfaceKo: "저소음 직조 카펫",
  },
  "soundproof-huddle": {
    id: "soundproof-huddle",
    nameKo: "방음 허들 부스",
    subtitleKo: "다공성 흡음재·이중 유리로 명료도를 극대화한 소형 부스",
    volumeM3: 42,
    surfaceAreaM2: 74,
    averageAbsorptionCoeff: 0.44,
    rt60Sec: computeSabineRt60Sec(42, 74, 0.44),
    earlyReflectionMs: 5,
    reverbWetMix: 0.08,
    baseLowpassHz: 19200,
    airAbsorptionPerMeter: 0.036,
    ambientFloorDb: -63,
    floorSurfaceKo: "방진 고무 매트",
  },
  "rooftop-terrace": {
    id: "rooftop-terrace",
    nameKo: "야외 루프탑 테라스",
    subtitleKo: "개방 자유 음장 · 미풍 산란으로 잔향이 즉각 흩어지는 테라스",
    volumeM3: 540,
    surfaceAreaM2: 1120,
    averageAbsorptionCoeff: 0.95,
    rt60Sec: computeSabineRt60Sec(540, 1120, 0.95),
    earlyReflectionMs: 32,
    reverbWetMix: 0.05,
    baseLowpassHz: 16400,
    airAbsorptionPerMeter: 0.082,
    ambientFloorDb: -44,
    floorSurfaceKo: "우드 데크 타일",
  },
};

export const ACOUSTIC_ZONE_LIST: readonly AcousticZoneProfile[] = [
  ACOUSTIC_ZONE_PROFILES["wood-atelier"],
  ACOUSTIC_ZONE_PROFILES["quiet-archive"],
  ACOUSTIC_ZONE_PROFILES["soundproof-huddle"],
  ACOUSTIC_ZONE_PROFILES["rooftop-terrace"],
];

export function createDefaultStudioWalls(): readonly AcousticWallSegment[] {
  return [
    {
      id: "wall-huddle-glass",
      labelKo: "허들 부스 방음 유리벽",
      material: "acoustic-booth-wall",
      start: { x: 1.8, z: -3.8 },
      end: { x: 1.8, z: -0.4 },
      occlusionDb: 22,
      lowpassHz: 1150,
      active: true,
    },
    {
      id: "wall-archive-shelf",
      labelKo: "자료실 목재 서가 칸막이",
      material: "bookshelf-divider",
      start: { x: -2.2, z: -3.2 },
      end: { x: -2.2, z: 0.6 },
      occlusionDb: 8.5,
      lowpassHz: 3400,
      active: true,
    },
    {
      id: "wall-lounge-partition",
      labelKo: "중앙 작업대 목재 파티션",
      material: "wood-partition",
      start: { x: -1.4, z: 1.6 },
      end: { x: 2.6, z: 1.6 },
      occlusionDb: 12,
      lowpassHz: 2400,
      active: true,
    },
  ];
}

export function createDefaultListenerState(): SpatialListenerState {
  return {
    position: { x: 0, y: 1.55, z: 0.4 },
    yawDeg: 0,
    pitchDeg: 0,
  };
}

export function createDefaultPeerSources(): readonly SpatialPeerAudioSource[] {
  return [
    {
      peerId: "peer-seoyeon",
      displayNameKo: "서연",
      roleKo: "콘티 · 러프 스케치",
      position: { x: -3.6, y: 1.2, z: -1.5 },
      activity: "sketch-pencil",
      intensity: 0.85,
      muted: false,
    },
    {
      peerId: "peer-minho",
      displayNameKo: "민호",
      roleKo: "선화 · 잉킹",
      position: { x: 2.9, y: 1.2, z: 0.3 },
      activity: "ink-pen",
      intensity: 0.8,
      muted: false,
    },
    {
      peerId: "peer-jisu",
      displayNameKo: "지수",
      roleKo: "연출 · 허들 부스",
      position: { x: 3.9, y: 1.55, z: -2.2 },
      activity: "voice-huddle",
      intensity: 0.9,
      muted: false,
    },
    {
      peerId: "peer-taehyun",
      displayNameKo: "태현",
      roleKo: "채색 · 이동 중",
      position: { x: 0.6, y: 0.25, z: 3.1 },
      activity: "footsteps",
      intensity: 0.72,
      muted: false,
    },
  ];
}

/** 2D XZ 평면에서 선분 AB와 CD의 교차 여부를 판정한다. */
export function segmentsIntersect2D(
  a: SpatialPoint2D,
  b: SpatialPoint2D,
  c: SpatialPoint2D,
  d: SpatialPoint2D,
): boolean {
  const eps = 1e-9;
  const cross = (p: SpatialPoint2D, q: SpatialPoint2D, r: SpatialPoint2D): number =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);

  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);

  if (
    ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
  ) {
    return true;
  }

  const onSegment = (p: SpatialPoint2D, q: SpatialPoint2D, r: SpatialPoint2D): boolean =>
    Math.min(p.x, q.x) - eps <= r.x &&
    r.x <= Math.max(p.x, q.x) + eps &&
    Math.min(p.z, q.z) - eps <= r.z &&
    r.z <= Math.max(p.z, q.z) + eps;

  return (
    (Math.abs(d1) <= eps && onSegment(a, b, c)) ||
    (Math.abs(d2) <= eps && onSegment(a, b, d)) ||
    (Math.abs(d3) <= eps && onSegment(c, d, a)) ||
    (Math.abs(d4) <= eps && onSegment(c, d, b))
  );
}

/** 리스너 정면·우측·상단 직교 기저 벡터를 산출한다 (`yawDeg = 0` → `-Z` 정면). */
export function computeListenerBasis(yawDeg: number): {
  readonly forward: SpatialVec3;
  readonly right: SpatialVec3;
  readonly up: SpatialVec3;
} {
  const rad = (yawDeg * Math.PI) / 180;
  return {
    forward: { x: Math.sin(rad), y: 0, z: -Math.cos(rad) },
    right: { x: Math.cos(rad), y: 0, z: Math.sin(rad) },
    up: { x: 0, y: 1, z: 0 },
  };
}

/**
 * 거리 제곱역법칙(Inverse-Square Law) 감쇄 계산.
 * 거리 2배 증가 시 파워 1/4, 진폭 1/2, 음압 `-6.02 dB` 감쇄한다.
 */
export function computeInverseSquareAttenuation(
  distanceM: number,
  refDistanceM = 1.0,
  maxDistanceM = 18.0,
): {
  readonly effectiveDistanceM: number;
  readonly powerRatio: number;
  readonly amplitudeGain: number;
  readonly attenuationDb: number;
} {
  const safeRef = Math.max(0.25, refDistanceM);
  const safeMax = Math.max(safeRef + 0.5, maxDistanceM);
  const clampedDist = clampNumber(Math.max(distanceM, safeRef), safeRef, safeMax);
  const ratio = safeRef / clampedDist;
  return {
    effectiveDistanceM: roundTo(clampedDist, 3),
    powerRatio: roundTo(ratio * ratio, 6),
    amplitudeGain: roundTo(ratio, 6),
    attenuationDb: roundTo(-20 * Math.log10(clampedDist / safeRef), 2),
  };
}

/** 리스너-음원 간 벽체 교차(Occlusion) 차음 dB 및 유효 로우패스 컷오프를 산출한다. */
export function evaluateWallOcclusion(
  listenerPos: SpatialVec3,
  sourcePos: SpatialVec3,
  walls: readonly AcousticWallSegment[],
  airLowpassHz: number,
): {
  readonly occludingWallIds: readonly string[];
  readonly occludingWallLabelsKo: readonly string[];
  readonly occlusionDb: number;
  readonly effectiveLowpassHz: number;
} {
  const a: SpatialPoint2D = { x: listenerPos.x, z: listenerPos.z };
  const b: SpatialPoint2D = { x: sourcePos.x, z: sourcePos.z };

  const hitIds: string[] = [];
  const hitLabels: string[] = [];
  let accumulatedDb = 0;
  let effectiveLowpass = airLowpassHz;

  for (const wall of walls) {
    if (!wall.active || !segmentsIntersect2D(a, b, wall.start, wall.end)) continue;
    hitIds.push(wall.id);
    hitLabels.push(wall.labelKo);
    accumulatedDb += Math.max(0, wall.occlusionDb);
    effectiveLowpass = Math.min(effectiveLowpass, wall.lowpassHz) * (hitIds.length > 1 ? 0.78 : 1);
  }

  return {
    occludingWallIds: hitIds,
    occludingWallLabelsKo: hitLabels,
    occlusionDb: roundTo(Math.min(MAX_OCCLUSION_DB, accumulatedDb), 2),
    effectiveLowpassHz: Math.round(clampNumber(effectiveLowpass, 450, 20000)),
  };
}

/** 단일 동료 음원의 3D HRTF 방위·고도·거리·공기 흡음·벽체 차음 및 ASMR/발소리 라우팅 계산. */
export function evaluatePeerSpatialAudio(
  source: SpatialPeerAudioSource,
  listener: SpatialListenerState,
  zoneId: AcousticZoneId,
  walls: readonly AcousticWallSegment[],
  options: AcousticStageOptions = {},
): HrtfSpatialEvaluation {
  const zone = ACOUSTIC_ZONE_PROFILES[zoneId];
  const refDistanceM = options.refDistanceM ?? 1.0;
  const maxDistanceM = options.maxDistanceM ?? 18.0;
  const ambientAsmrLevel = clampNumber(options.ambientAsmrLevel ?? 0.72, 0, 1);

  const dx = source.position.x - listener.position.x;
  const dy = source.position.y - listener.position.y;
  const dz = source.position.z - listener.position.z;

  const { forward, right } = computeListenerBasis(listener.yawDeg);
  const localRight = dx * right.x + dz * right.z;
  const localForward = dx * forward.x + dz * forward.z;
  const horizDistance = Math.hypot(localRight, localForward);
  const rawDistanceM = Math.hypot(dx, dy, dz);

  const azimuthRad = Math.atan2(localRight, localForward);
  const azimuthDeg = roundTo((azimuthRad * 180) / Math.PI, 1);

  const rawElevationDeg = (Math.atan2(dy, Math.max(1e-6, horizDistance)) * 180) / Math.PI;
  const elevationDeg = roundTo(clampNumber(rawElevationDeg - listener.pitchDeg, -90, 90), 1);
  const elevationRad = (elevationDeg * Math.PI) / 180;

  const rawPan = Math.sin(azimuthRad) * Math.cos(elevationRad);
  const stereoPan = roundTo(Math.abs(rawPan) < 1e-4 ? 0 : clampNumber(rawPan, -1, 1), 3);

  const lateralRad = Math.asin(clampNumber(Math.sin(azimuthRad), -1, 1));
  const itdUs = Math.round(
    ((HUMAN_HEAD_RADIUS_M / SPEED_OF_SOUND_MPS) * (Math.sin(lateralRad) + lateralRad)) * 1_000_000,
  );
  const ildDb = roundTo(stereoPan * 9.5, 2);

  const distanceMetric = computeInverseSquareAttenuation(
    Math.max(rawDistanceM, MIN_EFFECTIVE_DISTANCE_M),
    refDistanceM,
    maxDistanceM,
  );

  const airLowpassHz = Math.round(
    clampNumber(
      zone.baseLowpassHz * Math.exp(-rawDistanceM * zone.airAbsorptionPerMeter),
      1400,
      20000,
    ),
  );
  const occlusion = evaluateWallOcclusion(listener.position, source.position, walls, airLowpassHz);

  const baseActivityGain = source.muted
    ? 0
    : ACTIVITY_BASE_GAIN[source.activity] * clampNumber(source.intensity, 0, 1);
  const combinedLinear = clampNumber(
    distanceMetric.amplitudeGain * dbToLinearGain(-occlusion.occlusionDb) * baseActivityGain,
    0,
    1,
  );
  const totalAttenuationDb = roundTo(distanceMetric.attenuationDb - occlusion.occlusionDb, 2);

  const distanceWetBoost = clampNumber(rawDistanceM / 8, 0, 0.45);
  const reverbSendGain = source.muted
    ? 0
    : roundTo(
        clampNumber(combinedLinear * (zone.reverbWetMix + distanceWetBoost * zone.rt60Sec), 0, 1),
        4,
      );

  const isDrawingAsmr =
    source.activity === "sketch-pencil" ||
    source.activity === "ink-pen" ||
    source.activity === "stylus-tap";
  const pencilPenAsmrGain = isDrawingAsmr
    ? roundTo(clampNumber(combinedLinear * ambientAsmrLevel, 0, 1), 4)
    : 0;
  const footstepGain =
    source.activity === "footsteps"
      ? roundTo(clampNumber(combinedLinear * (0.65 + 0.35 * ambientAsmrLevel), 0, 1), 4)
      : 0;
  const voiceGain =
    source.activity === "voice-huddle" ? roundTo(clampNumber(combinedLinear, 0, 1), 4) : 0;

  const effectiveGainDb = linearGainToDb(Math.max(pencilPenAsmrGain, footstepGain, voiceGain));
  const audible =
    !source.muted && source.activity !== "idle" && effectiveGainDb > AUDIBLE_THRESHOLD_DB;

  return {
    peerId: source.peerId,
    distanceM: roundTo(rawDistanceM, 2),
    azimuthDeg,
    elevationDeg,
    stereoPan,
    itdUs,
    ildDb,
    inverseSquarePowerRatio: distanceMetric.powerRatio,
    distanceGain: distanceMetric.amplitudeGain,
    distanceAttenuationDb: distanceMetric.attenuationDb,
    occludingWallIds: occlusion.occludingWallIds,
    occludingWallLabelsKo: occlusion.occludingWallLabelsKo,
    occlusionDb: occlusion.occlusionDb,
    airLowpassHz,
    effectiveLowpassHz: occlusion.effectiveLowpassHz,
    totalLinearGain: roundTo(combinedLinear, 4),
    totalAttenuationDb,
    reverbSendGain,
    pencilPenAsmrGain,
    footstepGain,
    voiceGain,
    audible,
  };
}

/** 가상 스튜디오 전체 동료 음원들의 어쿠스틱 믹스 리포트를 계산한다. */
export function evaluateAcousticStageMix(
  zoneId: AcousticZoneId,
  listener: SpatialListenerState,
  sources: readonly SpatialPeerAudioSource[],
  walls: readonly AcousticWallSegment[],
  options: AcousticStageOptions = {},
): AcousticStageMixReport {
  const zone = ACOUSTIC_ZONE_PROFILES[zoneId];
  const peerMixes = sources.map((source) =>
    evaluatePeerSpatialAudio(source, listener, zoneId, walls, options),
  );

  let audiblePeerCount = 0;
  let activeAsmrSourceCount = 0;
  let maxOcclusionDb = 0;
  let lowpassSum = 0;

  for (const mix of peerMixes) {
    if (mix.audible) audiblePeerCount += 1;
    if (mix.audible && (mix.pencilPenAsmrGain > 0 || mix.footstepGain > 0)) {
      activeAsmrSourceCount += 1;
    }
    if (mix.occlusionDb > maxOcclusionDb) {
      maxOcclusionDb = mix.occlusionDb;
    }
    lowpassSum += mix.effectiveLowpassHz;
  }

  return {
    zone,
    listener,
    peerMixes,
    audiblePeerCount,
    activeAsmrSourceCount,
    maxOcclusionDb: roundTo(maxOcclusionDb, 1),
    averageEffectiveLowpassHz:
      peerMixes.length > 0 ? Math.round(lowpassSum / peerMixes.length) : zone.baseLowpassHz,
  };
}
