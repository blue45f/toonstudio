/**
 * 3D 음향 레이마칭 오디오툰 합성기(AudioToon Synthesizer) 및
 * 4D 구면 조화 함수(L2 Spherical Harmonics) 라이트필드 프로브 캐시.
 *
 * - 3D 공간 치수와 6면 재질 흡음 계수(석조 복도·목조 방·야외 골목·유리 아트리움)로부터
 *   Sabine/Eyring RT60 잔향 시간, 레이마칭 차폐가 반영된 초기 반사 탭, 스크롤 위치 연동
 *   스테레오 임펄스 응답(IR) 파라미터 및 파형을 서버 비용 `₩0`으로 합성한다.
 * - 새벽·정오·일몰·자정 4개 시간대 조명을 `< 32 KiB` IEEE-754 binary16 L2 SH(`9 × RGB`)
 *   그리드로 압축하고, 시공간 4선형(Quadrilinear) `O(1)` 보간으로 모바일 리라이팅을 수행한다.
 */

export const SPEED_OF_SOUND_M_PER_S = 343.2;
export const HUMAN_HEAD_RADIUS_M = 0.0875;
export const ACOUSTIC_OCTAVE_BANDS_HZ = [125, 250, 500, 1000, 2000, 4000] as const;
export const SH_L2_COEFF_COUNT = 9;
export const SH_RGB_SCALARS_PER_PROBE = 27;
export const LIGHTFIELD_TIME_SLICES = ["midnight", "dawn", "noon", "sunset"] as const;
export const SH_CACHE_HEADER_BYTES = 48;
export const MAX_SH_PROBE_CACHE_BYTES = 32768;

export type AcousticPresetId = "stone-corridor" | "timber-room" | "outdoor-alley" | "glass-atrium";
export type OctaveBandProfile = readonly [number, number, number, number, number, number];
export type RoomFaceId = "left" | "right" | "floor" | "ceiling" | "back" | "front";
export type LightfieldTimeOfDay = (typeof LIGHTFIELD_TIME_SLICES)[number];
export type Vec3 = readonly [number, number, number];

export interface RoomDimensions3d {
  readonly widthM: number; readonly heightM: number; readonly depthM: number;
}

export interface AcousticOccluderBox3d {
  readonly min: Vec3; readonly max: Vec3; readonly transmissionGain: number;
}

export interface AcousticRoomPreset {
  readonly presetId: AcousticPresetId;
  readonly labelKo: string;
  readonly dimensions: RoomDimensions3d;
  readonly faceAbsorption: Readonly<Record<RoomFaceId, OctaveBandProfile>>;
}

export interface AcousticRayMarchInput {
  readonly presetId?: AcousticPresetId;
  readonly dimensions?: RoomDimensions3d;
  readonly faceAbsorptionOverrides?: Partial<Readonly<Record<RoomFaceId, OctaveBandProfile>>>;
  readonly occluders?: readonly AcousticOccluderBox3d[];
  readonly sourcePosition: Vec3;
  readonly listenerStart: Vec3;
  readonly listenerEnd?: Vec3;
  readonly listenerForward?: Vec3;
  readonly scrollNormalized?: number;
  readonly scrollVelocityNormPerSec?: number;
  readonly maxReflectionOrder?: 1 | 2;
  readonly sampleRateHz?: number;
  readonly impulseDurationSec?: number;
}

export interface EarlyReflectionTap {
  readonly order: 1 | 2;
  readonly primaryFace: RoomFaceId;
  readonly delayMs: number;
  readonly pathLengthM: number;
  readonly monoGain: number;
  readonly leftGain: number;
  readonly rightGain: number;
  readonly itdMicros: number;
  readonly lowpassCutoffHz: number;
  readonly occluded: boolean;
}

export interface AudioToonImpulseResult {
  readonly volumeM3: number;
  readonly surfaceAreaM2: number;
  readonly meanAbsorptionMid: number;
  readonly sabineRt60ByBandSec: OctaveBandProfile;
  readonly eyringRt60ByBandSec: OctaveBandProfile;
  readonly sabineRt60MidSec: number;
  readonly eyringRt60MidSec: number;
  readonly criticalDistanceM: number;
  readonly schroederFreqHz: number;
  readonly listenerPosition: Vec3;
  readonly directDelayMs: number;
  readonly preDelayMs: number;
  readonly directLeftGain: number;
  readonly directRightGain: number;
  readonly dopplerPitchRatio: number;
  readonly stereoWidth: number;
  readonly earlyReflections: readonly EarlyReflectionTap[];
  readonly leftImpulse: Float32Array;
  readonly rightImpulse: Float32Array;
  readonly sampleRateHz: number;
  readonly serverCostKrw: 0;
}

export interface LightfieldGridConfig {
  readonly dims: readonly [number, number, number];
  readonly boundsMin: Vec3;
  readonly boundsMax: Vec3;
}

export interface TimeSliceSunSkySpec {
  readonly sunDirection: Vec3;
  readonly sunRadianceRgb: Vec3;
  readonly skyZenithRgb: Vec3;
  readonly groundBounceRgb: Vec3;
}

export interface ShLightfieldCache {
  readonly buffer: Uint8Array;
  readonly byteLength: number;
  readonly dims: readonly [number, number, number];
  readonly boundsMin: Vec3;
  readonly boundsMax: Vec3;
  readonly probeCountPerTimeSlice: number;
  readonly totalStoredProbes: number;
  readonly serverCostKrw: 0;
}

export interface LightfieldRelightSample {
  readonly shCoeffsRgb: Float32Array;
  readonly diffuseIrradianceRgb: Vec3;
  readonly toonRelitRgb: Vec3;
  readonly toonBandIndex: 0 | 1 | 2;
  readonly timeBlendFactor: number;
  readonly bracketSlices: readonly [LightfieldTimeOfDay, LightfieldTimeOfDay];
  readonly serverCostKrw: 0;
}

const AIR_ATTENUATION_PER_M: OctaveBandProfile = [0.0001, 0.0003, 0.0006, 0.001, 0.0024, 0.0061];
const STONE_BAND: OctaveBandProfile = [0.02, 0.02, 0.03, 0.04, 0.05, 0.06];
const TIMBER_WALL_BAND: OctaveBandProfile = [0.16, 0.13, 0.1, 0.09, 0.08, 0.07];
const TIMBER_FLOOR_BAND: OctaveBandProfile = [0.12, 0.1, 0.08, 0.08, 0.07, 0.06];
const ALLEY_BRICK_BAND: OctaveBandProfile = [0.03, 0.03, 0.04, 0.05, 0.06, 0.07];
const OPEN_SKY_BAND: OctaveBandProfile = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
const OPEN_END_BAND: OctaveBandProfile = [0.95, 0.95, 0.96, 0.96, 0.97, 0.97];
const GLASS_PANE_BAND: OctaveBandProfile = [0.18, 0.08, 0.05, 0.04, 0.03, 0.03];
const MARBLE_FLOOR_BAND: OctaveBandProfile = [0.01, 0.01, 0.02, 0.02, 0.03, 0.03];

export const ACOUSTIC_ROOM_PRESETS: Readonly<Record<AcousticPresetId, AcousticRoomPreset>> = {
  "stone-corridor": {
    presetId: "stone-corridor",
    labelKo: "석조 복도",
    dimensions: { widthM: 2.6, heightM: 3.4, depthM: 18.0 },
    faceAbsorption: {
      left: STONE_BAND, right: STONE_BAND, floor: STONE_BAND,
      ceiling: STONE_BAND, back: STONE_BAND, front: STONE_BAND,
    },
  },
  "timber-room": {
    presetId: "timber-room",
    labelKo: "목조 방",
    dimensions: { widthM: 4.5, heightM: 2.8, depthM: 5.2 },
    faceAbsorption: {
      left: TIMBER_WALL_BAND, right: TIMBER_WALL_BAND, floor: TIMBER_FLOOR_BAND,
      ceiling: TIMBER_WALL_BAND, back: TIMBER_WALL_BAND, front: TIMBER_WALL_BAND,
    },
  },
  "outdoor-alley": {
    presetId: "outdoor-alley",
    labelKo: "야외 골목",
    dimensions: { widthM: 3.2, heightM: 6.0, depthM: 14.0 },
    faceAbsorption: {
      left: ALLEY_BRICK_BAND, right: ALLEY_BRICK_BAND, floor: STONE_BAND,
      ceiling: OPEN_SKY_BAND, back: OPEN_END_BAND, front: OPEN_END_BAND,
    },
  },
  "glass-atrium": {
    presetId: "glass-atrium",
    labelKo: "유리 아트리움",
    dimensions: { widthM: 14.0, heightM: 11.0, depthM: 16.0 },
    faceAbsorption: {
      left: GLASS_PANE_BAND, right: GLASS_PANE_BAND, floor: MARBLE_FLOOR_BAND,
      ceiling: GLASS_PANE_BAND, back: GLASS_PANE_BAND, front: GLASS_PANE_BAND,
    },
  },
};

export const DEFAULT_TIME_SLICE_LIGHTING: Readonly<Record<LightfieldTimeOfDay, TimeSliceSunSkySpec>> = {
  midnight: {
    sunDirection: [0.15, 0.85, -0.5],
    sunRadianceRgb: [0.06, 0.1, 0.22],
    skyZenithRgb: [0.03, 0.05, 0.14],
    groundBounceRgb: [0.01, 0.02, 0.04],
  },
  dawn: {
    sunDirection: [0.82, 0.28, 0.5],
    sunRadianceRgb: [0.95, 0.52, 0.34],
    skyZenithRgb: [0.28, 0.36, 0.62],
    groundBounceRgb: [0.14, 0.09, 0.08],
  },
  noon: {
    sunDirection: [0.08, 0.98, 0.18],
    sunRadianceRgb: [1.35, 1.3, 1.22],
    skyZenithRgb: [0.42, 0.64, 0.95],
    groundBounceRgb: [0.22, 0.2, 0.18],
  },
  sunset: {
    sunDirection: [-0.86, 0.22, 0.46],
    sunRadianceRgb: [1.12, 0.42, 0.18],
    skyZenithRgb: [0.34, 0.24, 0.52],
    groundBounceRgb: [0.16, 0.08, 0.06],
  },
};

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 1e-8 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 1, 0];
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** 3D 선분 위를 일정 간격으로 레이마칭하여 내부 차폐물(기둥·칸막이) 투과율을 계산한다. */
export function rayMarchAcousticTransmittance(
  origin: Vec3,
  target: Vec3,
  occluders: readonly AcousticOccluderBox3d[],
  stepSizeM: number = 0.15,
): { readonly gain: number; readonly occluded: boolean } {
  if (occluders.length === 0) return { gain: 1, occluded: false };
  const dist = Math.hypot(target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]);
  if (dist <= 1e-5) return { gain: 1, occluded: false };
  const steps = Math.max(4, Math.min(256, Math.ceil(dist / Math.max(0.05, stepSizeM))));
  const hitSet = new Set<number>();
  for (let s = 1; s < steps; s += 1) {
    const t = s / steps;
    const px = origin[0] + (target[0] - origin[0]) * t;
    const py = origin[1] + (target[1] - origin[1]) * t;
    const pz = origin[2] + (target[2] - origin[2]) * t;
    for (let oi = 0; oi < occluders.length; oi += 1) {
      if (hitSet.has(oi)) continue;
      const box = occluders[oi]!;
      if (
        px >= box.min[0] && px <= box.max[0] &&
        py >= box.min[1] && py <= box.max[1] &&
        pz >= box.min[2] && pz <= box.max[2]
      ) {
        hitSet.add(oi);
      }
    }
  }
  let gain = 1;
  for (const oi of hitSet) gain *= clamp(occluders[oi]!.transmissionGain, 0.02, 1);
  return { gain, occluded: hitSet.size > 0 };
}

/** 방 치수와 6면 흡음률로부터 옥타브 밴드별 Sabine 및 Eyring-Norris RT60을 계산한다. */
export function computeSabineAndEyringRt60(
  dimensions: RoomDimensions3d,
  faceAbsorption: Readonly<Record<RoomFaceId, OctaveBandProfile>>,
): {
  readonly volumeM3: number;
  readonly surfaceAreaM2: number;
  readonly meanAbsorptionMid: number;
  readonly sabineByBand: OctaveBandProfile;
  readonly eyringByBand: OctaveBandProfile;
  readonly sabineMidSec: number;
  readonly eyringMidSec: number;
} {
  const w = Math.max(0.5, dimensions.widthM);
  const h = Math.max(0.5, dimensions.heightM);
  const d = Math.max(0.5, dimensions.depthM);
  const volumeM3 = w * h * d;
  const areas: Record<RoomFaceId, number> = {
    left: h * d, right: h * d, floor: w * d, ceiling: w * d, back: w * h, front: w * h,
  };
  const surfaceAreaM2 = 2 * (w * h + w * d + h * d);
  const sabine: number[] = [];
  const eyring: number[] = [];
  let alphaSumMid = 0;

  for (let bi = 0; bi < 6; bi += 1) {
    let eqAbsArea = 0;
    for (const face of ["left", "right", "floor", "ceiling", "back", "front"] as const) {
      const alpha = clamp(faceAbsorption[face][bi] ?? 0.05, 0.005, 0.995);
      eqAbsArea += areas[face] * alpha;
    }
    const meanAlpha = clamp(eqAbsArea / surfaceAreaM2, 0.005, 0.995);
    if (bi === 2 || bi === 3) alphaSumMid += meanAlpha * 0.5;
    const airTerm = 4 * (AIR_ATTENUATION_PER_M[bi] ?? 0.001) * volumeM3;
    sabine.push((0.161 * volumeM3) / Math.max(1e-4, eqAbsArea + airTerm));
    eyring.push((0.161 * volumeM3) / Math.max(1e-4, -surfaceAreaM2 * Math.log(1 - meanAlpha) + airTerm));
  }

  const sabineByBand = [sabine[0]!, sabine[1]!, sabine[2]!, sabine[3]!, sabine[4]!, sabine[5]!] as const;
  const eyringByBand = [eyring[0]!, eyring[1]!, eyring[2]!, eyring[3]!, eyring[4]!, eyring[5]!] as const;
  return {
    volumeM3,
    surfaceAreaM2,
    meanAbsorptionMid: alphaSumMid,
    sabineByBand,
    eyringByBand,
    sabineMidSec: 0.5 * (sabineByBand[2] + sabineByBand[3]),
    eyringMidSec: 0.5 * (eyringByBand[2] + eyringByBand[3]),
  };
}

function computeBinauralGains(
  fromListenerDir: Vec3,
  listenerRight: Vec3,
): { readonly leftGain: number; readonly rightGain: number; readonly itdMicros: number } {
  const azimuthSin = clamp(
    fromListenerDir[0] * listenerRight[0] + fromListenerDir[1] * listenerRight[1] + fromListenerDir[2] * listenerRight[2],
    -1,
    1,
  );
  const theta = Math.asin(azimuthSin);
  const itdSec = (HUMAN_HEAD_RADIUS_M / SPEED_OF_SOUND_M_PER_S) * (theta + Math.sin(theta));
  const panAngle = ((azimuthSin + 1) * Math.PI) / 4;
  return {
    leftGain: Math.cos(panAngle),
    rightGain: Math.sin(panAngle),
    itdMicros: itdSec * 1e6,
  };
}

/**
 * 3D 공간 재질·차폐·스크롤 위치를 반영해 오디오툰 초기 반사 탭과 스테레오 IR 파형을 합성한다.
 */
export function synthesizeAudioToonImpulseResponse(
  input: AcousticRayMarchInput,
): AudioToonImpulseResult {
  const preset = ACOUSTIC_ROOM_PRESETS[input.presetId ?? "stone-corridor"];
  const dims = input.dimensions ?? preset.dimensions;
  const faces: Record<RoomFaceId, OctaveBandProfile> = {
    ...preset.faceAbsorption,
    ...input.faceAbsorptionOverrides,
  };
  const rt = computeSabineAndEyringRt60(dims, faces);
  const scrollT = clamp(input.scrollNormalized ?? 0, 0, 1);
  const endPos = input.listenerEnd ?? input.listenerStart;
  const listenerPos = lerpVec3(input.listenerStart, endPos, scrollT);
  const forward = normalizeVec3(input.listenerForward ?? [0, 0, 1]);
  const rightVec = normalizeVec3(crossVec3(forward, [0, 1, 0]));
  const occluders = input.occluders ?? [];

  const toSrc: Vec3 = [
    input.sourcePosition[0] - listenerPos[0],
    input.sourcePosition[1] - listenerPos[1],
    input.sourcePosition[2] - listenerPos[2],
  ];
  const directDist = Math.max(0.25, Math.hypot(toSrc[0], toSrc[1], toSrc[2]));
  const directDir = normalizeVec3(toSrc);
  const directOcc = rayMarchAcousticTransmittance(listenerPos, input.sourcePosition, occluders);
  const directBin = computeBinauralGains(directDir, rightVec);
  const directAttn = (1 / Math.max(1, directDist)) * directOcc.gain;
  const directDelayMs = (directDist / SPEED_OF_SOUND_M_PER_S) * 1000;

  const velNorm = input.scrollVelocityNormPerSec ?? 0;
  const pathVec: Vec3 = [
    (endPos[0] - input.listenerStart[0]) * velNorm,
    (endPos[1] - input.listenerStart[1]) * velNorm,
    (endPos[2] - input.listenerStart[2]) * velNorm,
  ];
  const radialVel = pathVec[0] * directDir[0] + pathVec[1] * directDir[1] + pathVec[2] * directDir[2];
  const dopplerPitchRatio = clamp(1 + radialVel / SPEED_OF_SOUND_M_PER_S, 0.92, 1.08);

  const mirror1D = (coord: number, bound: number, mirrorIdx: number): number => {
    if (mirrorIdx === 0) return coord;
    if (Math.abs(mirrorIdx) === 1) return mirrorIdx < 0 ? -coord : 2 * bound - coord;
    return mirrorIdx < 0 ? -2 * bound + coord : 2 * bound + coord;
  };

  const maxOrder = input.maxReflectionOrder ?? 2;
  const taps: EarlyReflectionTap[] = [];
  const offsets: Array<{ ox: number; oy: number; oz: number; face: RoomFaceId; facesHit: RoomFaceId[] }> = [
    { ox: -1, oy: 0, oz: 0, face: "left", facesHit: ["left"] },
    { ox: 1, oy: 0, oz: 0, face: "right", facesHit: ["right"] },
    { ox: 0, oy: -1, oz: 0, face: "floor", facesHit: ["floor"] },
    { ox: 0, oy: 1, oz: 0, face: "ceiling", facesHit: ["ceiling"] },
    { ox: 0, oy: 0, oz: -1, face: "back", facesHit: ["back"] },
    { ox: 0, oy: 0, oz: 1, face: "front", facesHit: ["front"] },
  ];
  if (maxOrder >= 2) {
    const pairs: Array<readonly [number, number, number, RoomFaceId, RoomFaceId]> = [
      [-1, -1, 0, "left", "floor"], [1, -1, 0, "right", "floor"],
      [-1, 1, 0, "left", "ceiling"], [1, 1, 0, "right", "ceiling"],
      [-1, 0, -1, "left", "back"], [1, 0, -1, "right", "back"],
      [-1, 0, 1, "left", "front"], [1, 0, 1, "right", "front"],
      [0, -1, -1, "floor", "back"], [0, 1, -1, "ceiling", "back"],
      [0, -1, 1, "floor", "front"], [0, 1, 1, "ceiling", "front"],
    ];
    for (const [ox, oy, oz, f1, f2] of pairs) {
      offsets.push({ ox, oy, oz, face: f1, facesHit: [f1, f2] });
    }
  }

  for (const item of offsets) {
    const imgPos: Vec3 = [
      mirror1D(input.sourcePosition[0], dims.widthM, item.ox),
      mirror1D(input.sourcePosition[1], dims.heightM, item.oy),
      mirror1D(input.sourcePosition[2], dims.depthM, item.oz),
    ];
    const rel: Vec3 = [imgPos[0] - listenerPos[0], imgPos[1] - listenerPos[1], imgPos[2] - listenerPos[2]];
    const pathLen = Math.max(0.3, Math.hypot(rel[0], rel[1], rel[2]));
    let reflGain = 1;
    let hfRefl = 1;
    for (const fId of item.facesHit) {
      const band = faces[fId];
      const midAlpha = 0.5 * (band[2] + band[3]);
      reflGain *= Math.sqrt(Math.max(0.005, 1 - midAlpha));
      hfRefl *= Math.sqrt(Math.max(0.005, 1 - band[5]));
    }
    const clampWallPt: Vec3 = [
      clamp(0.5 * (listenerPos[0] + imgPos[0]), 0, dims.widthM),
      clamp(0.5 * (listenerPos[1] + imgPos[1]), 0, dims.heightM),
      clamp(0.5 * (listenerPos[2] + imgPos[2]), 0, dims.depthM),
    ];
    const occA = rayMarchAcousticTransmittance(input.sourcePosition, clampWallPt, occluders);
    const occB = rayMarchAcousticTransmittance(clampWallPt, listenerPos, occluders);
    const monoGain = (reflGain * occA.gain * occB.gain) / Math.max(1, pathLen);
    const bin = computeBinauralGains(normalizeVec3(rel), rightVec);
    const airHfLoss = Math.exp(-AIR_ATTENUATION_PER_M[5] * pathLen * 8);
    taps.push({
      order: item.facesHit.length === 1 ? 1 : 2,
      primaryFace: item.face,
      delayMs: (pathLen / SPEED_OF_SOUND_M_PER_S) * 1000,
      pathLengthM: pathLen,
      monoGain,
      leftGain: monoGain * bin.leftGain,
      rightGain: monoGain * bin.rightGain,
      itdMicros: bin.itdMicros,
      lowpassCutoffHz: clamp(16000 * hfRefl * airHfLoss, 900, 18000),
      occluded: occA.occluded || occB.occluded,
    });
  }
  taps.sort((a, b) => a.delayMs - b.delayMs);

  const sampleRateHz = Math.max(8000, Math.floor(input.sampleRateHz ?? 24000));
  const durationSec = clamp(input.impulseDurationSec ?? Math.min(1.5, Math.max(0.18, rt.eyringMidSec * 0.65)), 0.08, 4.0);
  const sampleCount = Math.max(64, Math.floor(sampleRateHz * durationSec));
  const leftImpulse = new Float32Array(sampleCount);
  const rightImpulse = new Float32Array(sampleCount);

  const writeTap = (buf: Float32Array, delaySec: number, amp: number): void => {
    const exactIdx = delaySec * sampleRateHz;
    const baseIdx = Math.floor(exactIdx);
    const frac = exactIdx - baseIdx;
    if (baseIdx >= 0 && baseIdx < buf.length) buf[baseIdx] = (buf[baseIdx] ?? 0) + amp * (1 - frac);
    if (baseIdx + 1 >= 0 && baseIdx + 1 < buf.length) buf[baseIdx + 1] = (buf[baseIdx + 1] ?? 0) + amp * frac;
  };

  const directDelaySec = directDelayMs * 0.001;
  writeTap(leftImpulse, directDelaySec + Math.max(0, -directBin.itdMicros * 1e-6), directAttn * directBin.leftGain);
  writeTap(rightImpulse, directDelaySec + Math.max(0, directBin.itdMicros * 1e-6), directAttn * directBin.rightGain);

  let lateralEnergy = 0;
  let totalTapEnergy = 1e-9;
  for (const tap of taps) {
    const dSec = tap.delayMs * 0.001;
    writeTap(leftImpulse, dSec + Math.max(0, -tap.itdMicros * 1e-6), tap.leftGain);
    writeTap(rightImpulse, dSec + Math.max(0, tap.itdMicros * 1e-6), tap.rightGain);
    lateralEnergy += Math.abs(tap.leftGain - tap.rightGain);
    totalTapEnergy += tap.leftGain + tap.rightGain;
  }

  // 결정론적 벨벳 노이즈 후기 잔향 테일 (Eyring RT60 감쇠 포락선 적용)
  const tailStartIdx = Math.min(sampleCount - 1, Math.floor(((taps[0]?.delayMs ?? directDelayMs) * 0.001) * sampleRateHz));
  const decayRate = 6.907755 / Math.max(0.04, rt.eyringMidSec);
  const tailScale = 0.18 * Math.sqrt(Math.max(0.01, 1 - rt.meanAbsorptionMid));
  let prng = 0x9e3779b9;
  const pulseSpacing = Math.max(4, Math.floor(sampleRateHz / 2200));
  for (let i = tailStartIdx; i < sampleCount; i += pulseSpacing) {
    prng = (Math.imul(prng ^ (prng >>> 15), 0x85ebca6b) >>> 0);
    const tSec = (i - tailStartIdx) / sampleRateHz;
    const env = tailScale * Math.exp(-decayRate * tSec);
    const idxL = Math.min(sampleCount - 1, i + (prng % pulseSpacing));
    const signL = (prng & 1) === 0 ? 1 : -1;
    prng = (Math.imul(prng ^ (prng >>> 13), 0xc2b2ae35) >>> 0);
    const idxR = Math.min(sampleCount - 1, i + (prng % pulseSpacing));
    const signR = (prng & 1) === 0 ? 1 : -1;
    leftImpulse[idxL] = (leftImpulse[idxL] ?? 0) + signL * env;
    rightImpulse[idxR] = (rightImpulse[idxR] ?? 0) + signR * env;
  }

  const firstTapDelay = taps[0]?.delayMs ?? directDelayMs;
  return {
    volumeM3: rt.volumeM3,
    surfaceAreaM2: rt.surfaceAreaM2,
    meanAbsorptionMid: rt.meanAbsorptionMid,
    sabineRt60ByBandSec: rt.sabineByBand,
    eyringRt60ByBandSec: rt.eyringByBand,
    sabineRt60MidSec: rt.sabineMidSec,
    eyringRt60MidSec: rt.eyringMidSec,
    criticalDistanceM: 0.057 * Math.sqrt(rt.volumeM3 / Math.max(0.02, rt.eyringMidSec)),
    schroederFreqHz: 2000 * Math.sqrt(rt.eyringMidSec / rt.volumeM3),
    listenerPosition: listenerPos,
    directDelayMs,
    preDelayMs: Math.max(0, firstTapDelay - directDelayMs),
    directLeftGain: directAttn * directBin.leftGain,
    directRightGain: directAttn * directBin.rightGain,
    dopplerPitchRatio,
    stereoWidth: clamp(lateralEnergy / totalTapEnergy, 0, 1),
    earlyReflections: taps,
    leftImpulse,
    rightImpulse,
    sampleRateHz,
    serverCostKrw: 0,
  };
}

/** IEEE-754 단정밀도 실수를 16비트 반정밀도(`binary16`) 부호 없는 정수로 인코딩한다. */
export function encodeFloat16(val: number): number {
  if (Number.isNaN(val)) return 0x7e00;
  const sign = val < 0 || Object.is(val, -0) ? 0x8000 : 0;
  const abs = Math.abs(val);
  if (abs === Infinity) return sign | 0x7c00;
  if (abs === 0) return sign;
  const exp = Math.floor(Math.log2(abs));
  if (exp > 15) return sign | 0x7c00;
  if (exp < -14) {
    const sub = Math.round(abs * 16777216);
    return sign | clamp(sub, 0, 0x03ff);
  }
  const mant = Math.round((abs / Math.pow(2, exp) - 1) * 1024);
  if (mant >= 1024) return sign | (Math.min(31, exp + 16) << 10);
  return sign | ((exp + 15) << 10) | (mant & 0x03ff);
}

/** IEEE-754 16비트 반정밀도(`binary16`) 정수를 배정밀도 실수로 디코딩한다. */
export function decodeFloat16(bits: number): number {
  const sign = (bits & 0x8000) !== 0 ? -1 : 1;
  const exp = (bits >>> 10) & 0x1f;
  const frac = bits & 0x03ff;
  if (exp === 0) return frac === 0 ? (sign < 0 ? -0 : 0) : sign * (frac / 1024) * Math.pow(2, -14);
  if (exp === 31) return frac === 0 ? sign * Infinity : Number.NaN;
  return sign * (1 + frac / 1024) * Math.pow(2, exp - 15);
}

/** 정규화된 3D 방향 벡터에 대해 정규직교 실수 L2 구면 조화 기저 9개 값을 계산한다. */
export function evaluateShL2Basis(dir: Vec3): Float32Array {
  const [x, y, z] = normalizeVec3(dir);
  const out = new Float32Array(SH_L2_COEFF_COUNT);
  out[0] = 0.28209479;
  out[1] = 0.48860251 * y;
  out[2] = 0.48860251 * z;
  out[3] = 0.48860251 * x;
  out[4] = 1.09254843 * x * y;
  out[5] = 1.09254843 * y * z;
  out[6] = 0.31539157 * (3 * z * z - 1);
  out[7] = 1.09254843 * x * z;
  out[8] = 0.54627422 * (x * x - y * y);
  return out;
}

/** L2 SH 계수(`27 = 9 × RGB`)와 표면 법선으로부터 Ramamoorthi-Hanrahan 확산 조사량(Irradiance)을 계산한다. */
export function evaluateIrradianceFromShL2(shCoeffsRgb: Float32Array, normal: Vec3): Vec3 {
  const basis = evaluateShL2Basis(normal);
  const convWeights = [Math.PI, (2 * Math.PI) / 3, (2 * Math.PI) / 3, (2 * Math.PI) / 3, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4];
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < SH_L2_COEFF_COUNT; i += 1) {
    const w = (basis[i] ?? 0) * (convWeights[i] ?? 0);
    r += (shCoeffsRgb[i * 3] ?? 0) * w;
    g += (shCoeffsRgb[i * 3 + 1] ?? 0) * w;
    b += (shCoeffsRgb[i * 3 + 2] ?? 0) * w;
  }
  return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
}

function projectProbeShCoeffs(spec: TimeSliceSunSkySpec, normPos: Vec3): Float32Array {
  const coeffs = new Float32Array(SH_RGB_SCALARS_PER_PROBE);
  const sunBasis = evaluateShL2Basis(spec.sunDirection);
  const upBasis = evaluateShL2Basis([0, 1, 0]);
  const downBasis = evaluateShL2Basis([0, -1, 0]);
  // 공간 위치에 따른 지붕 차폐 및 창문 개방도 반영
  const skyVis = clamp(0.35 + 0.65 * normPos[1], 0.15, 1.0);
  const sunVis = clamp(0.25 + 0.45 * normPos[1] + 0.3 * (spec.sunDirection[0] >= 0 ? normPos[0] : 1 - normPos[0]), 0.08, 1.0);
  const bounceVis = clamp(1.0 - 0.5 * normPos[1], 0.25, 1.0);

  for (let k = 0; k < SH_L2_COEFF_COUNT; k += 1) {
    const sb = (sunBasis[k] ?? 0) * sunVis;
    const ub = (upBasis[k] ?? 0) * skyVis;
    const db = (downBasis[k] ?? 0) * bounceVis;
    const amb = k === 0 ? 1.25 * skyVis : 0;
    for (let c = 0; c < 3; c += 1) {
      coeffs[k * 3 + c] = sb * spec.sunRadianceRgb[c]! + (ub + amb) * spec.skyZenithRgb[c]! + db * spec.groundBounceRgb[c]!;
    }
  }
  return coeffs;
}

/**
 * 4개 시간대(자정·새벽·정오·일몰) 3D 프로브 그리드를 `< 32 KiB` 반정밀도 L2 SH 캐시로 인코딩한다.
 */
export function bake4dShLightfieldCache(
  config: LightfieldGridConfig,
  lightingSpecs: Partial<Readonly<Record<LightfieldTimeOfDay, TimeSliceSunSkySpec>>> = {},
  customProbeProjector?: (timeSlice: LightfieldTimeOfDay, worldPos: Vec3) => Float32Array,
): ShLightfieldCache {
  const [nx, ny, nz] = config.dims;
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || !Number.isInteger(nz) || nx < 2 || ny < 2 || nz < 2) {
    throw new RangeError(`SH 그리드 해상도는 각 축 최소 2 이상의 정수여야 합니다: ${nx}x${ny}x${nz}`);
  }
  const probeCountPerSlice = nx * ny * nz;
  const totalStoredProbes = probeCountPerSlice * LIGHTFIELD_TIME_SLICES.length;
  const payloadBytes = totalStoredProbes * SH_RGB_SCALARS_PER_PROBE * 2;
  const totalBytes = SH_CACHE_HEADER_BYTES + payloadBytes;
  if (totalBytes >= MAX_SH_PROBE_CACHE_BYTES) {
    throw new RangeError(`4D SH 캐시 크기(${totalBytes}B)가 모바일 한도(${MAX_SH_PROBE_CACHE_BYTES}B, < 32 KiB)를 초과합니다.`);
  }

  const buffer = new Uint8Array(totalBytes);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, 0x53483444, true); // "SH4D"
  view.setUint32(4, 1, true);
  view.setUint32(8, nx, true);
  view.setUint32(12, ny, true);
  view.setUint32(16, nz, true);
  view.setUint32(20, SH_RGB_SCALARS_PER_PROBE, true);
  for (let axis = 0; axis < 3; axis += 1) {
    view.setFloat32(24 + axis * 4, config.boundsMin[axis]!, true);
    view.setFloat32(36 + axis * 4, config.boundsMax[axis]!, true);
  }

  const specs: Record<LightfieldTimeOfDay, TimeSliceSunSkySpec> = {
    ...DEFAULT_TIME_SLICE_LIGHTING,
    ...lightingSpecs,
  };

  let cursor = SH_CACHE_HEADER_BYTES;
  for (let ti = 0; ti < LIGHTFIELD_TIME_SLICES.length; ti += 1) {
    const sliceId = LIGHTFIELD_TIME_SLICES[ti]!;
    const spec = specs[sliceId];
    for (let iz = 0; iz < nz; iz += 1) {
      const uz = iz / (nz - 1);
      const wz = config.boundsMin[2] + (config.boundsMax[2] - config.boundsMin[2]) * uz;
      for (let iy = 0; iy < ny; iy += 1) {
        const uy = iy / (ny - 1);
        const wy = config.boundsMin[1] + (config.boundsMax[1] - config.boundsMin[1]) * uy;
        for (let ix = 0; ix < nx; ix += 1) {
          const ux = ix / (nx - 1);
          const wx = config.boundsMin[0] + (config.boundsMax[0] - config.boundsMin[0]) * ux;
          const sh = customProbeProjector
            ? customProbeProjector(sliceId, [wx, wy, wz])
            : projectProbeShCoeffs(spec, [ux, uy, uz]);
          for (let s = 0; s < SH_RGB_SCALARS_PER_PROBE; s += 1) {
            view.setUint16(cursor, encodeFloat16(sh[s] ?? 0), true);
            cursor += 2;
          }
        }
      }
    }
  }

  return {
    buffer,
    byteLength: totalBytes,
    dims: [nx, ny, nz],
    boundsMin: config.boundsMin,
    boundsMax: config.boundsMax,
    probeCountPerTimeSlice: probeCountPerSlice,
    totalStoredProbes,
    serverCostKrw: 0,
  };
}

/**
 * 24시간 연속 시각과 3D 월드 좌표에서 16-탭 시공간 4선형(Quadrilinear) `O(1)` 보간으로 조명을 복원한다.
 */
export function sampleLightfieldQuadrilinear(
  cache: ShLightfieldCache,
  worldPosition: Vec3,
  surfaceNormal: Vec3,
  timeOfDayHours: number,
  albedoRgb: Vec3 = [1, 1, 1],
): LightfieldRelightSample {
  const view = new DataView(cache.buffer.buffer, cache.buffer.byteOffset, cache.buffer.byteLength);
  const [nx, ny, nz] = cache.dims;
  const probeStrideBytes = SH_RGB_SCALARS_PER_PROBE * 2;
  const sliceStrideBytes = nx * ny * nz * probeStrideBytes;

  const mapAxis = (val: number, bMin: number, bMax: number, count: number): { i0: number; i1: number; f: number } => {
    const span = Math.max(1e-6, bMax - bMin);
    const scaled = clamp((val - bMin) / span, 0, 1) * (count - 1);
    const i0 = Math.min(count - 2, Math.floor(scaled));
    return { i0, i1: i0 + 1, f: scaled - i0 };
  };

  const ax = mapAxis(worldPosition[0], cache.boundsMin[0], cache.boundsMax[0], nx);
  const ay = mapAxis(worldPosition[1], cache.boundsMin[1], cache.boundsMax[1], ny);
  const az = mapAxis(worldPosition[2], cache.boundsMin[2], cache.boundsMax[2], nz);

  // 24시간 주기 순환 매핑: 0h=midnight(0), 6h=dawn(1), 12h=noon(2), 18h=sunset(3), 24h->0h
  const wrappedHours = ((timeOfDayHours % 24) + 24) % 24;
  const rawPhase = wrappedHours / 6;
  const t0 = Math.floor(rawPhase) % 4;
  const t1 = (t0 + 1) % 4;
  const linearT = rawPhase - Math.floor(rawPhase);
  const smoothT = linearT * linearT * (3 - 2 * linearT);

  const shCoeffsRgb = new Float32Array(SH_RGB_SCALARS_PER_PROBE);
  const wx = [1 - ax.f, ax.f];
  const wy = [1 - ay.f, ay.f];
  const wz = [1 - az.f, az.f];
  const wt = [1 - smoothT, smoothT];
  const tIndices = [t0, t1];
  const xIndices = [ax.i0, ax.i1];
  const yIndices = [ay.i0, ay.i1];
  const zIndices = [az.i0, az.i1];

  for (let dt = 0; dt < 2; dt += 1) {
    const sliceOffset = SH_CACHE_HEADER_BYTES + tIndices[dt]! * sliceStrideBytes;
    for (let dz = 0; dz < 2; dz += 1) {
      const zOff = zIndices[dz]! * ny;
      for (let dy = 0; dy < 2; dy += 1) {
        const yOff = (zOff + yIndices[dy]!) * nx;
        for (let dx = 0; dx < 2; dx += 1) {
          const weight = wt[dt]! * wz[dz]! * wy[dy]! * wx[dx]!;
          if (weight <= 0) continue;
          const probeOffset = sliceOffset + (yOff + xIndices[dx]!) * probeStrideBytes;
          for (let s = 0; s < SH_RGB_SCALARS_PER_PROBE; s += 1) {
            shCoeffsRgb[s] = (shCoeffsRgb[s] ?? 0) + weight * decodeFloat16(view.getUint16(probeOffset + s * 2, true));
          }
        }
      }
    }
  }

  const irr = evaluateIrradianceFromShL2(shCoeffsRgb, surfaceNormal);
  const luma = 0.2126 * irr[0] + 0.7152 * irr[1] + 0.0722 * irr[2];
  const toonBandIndex: 0 | 1 | 2 = luma < 0.35 ? 0 : luma < 0.95 ? 1 : 2;
  const bandGain = toonBandIndex === 0 ? 0.55 : toonBandIndex === 1 ? 0.88 : 1.15;
  const normScale = luma > 1e-5 ? bandGain / Math.max(0.35, luma) : bandGain;
  const toonRelitRgb: Vec3 = [
    clamp(albedoRgb[0] * irr[0] * normScale, 0, 2),
    clamp(albedoRgb[1] * irr[1] * normScale, 0, 2),
    clamp(albedoRgb[2] * irr[2] * normScale, 0, 2),
  ];

  return {
    shCoeffsRgb,
    diffuseIrradianceRgb: irr,
    toonRelitRgb,
    toonBandIndex,
    timeBlendFactor: smoothT,
    bracketSlices: [LIGHTFIELD_TIME_SLICES[t0]!, LIGHTFIELD_TIME_SLICES[t1]!],
    serverCostKrw: 0,
  };
}
