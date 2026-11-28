/**
 * Wave 73 WebGPU 컴퓨트 WGSL 셰이더 3종, 16-byte 정렬 유니폼 패커 및 정적 계약 검증기.
 *
 * - `TEMPORAL_DRYING_EVAPORATION_WGSL`: 건조 전선 증발·커피링 이류·안료 침착·산화 경화 (`8×8×1`)
 * - `REWETTING_BLOOM_SOLUBILITY_WGSL`: 매체 선택적 재용해·용매 연화·콜리플라워 블룸 (`8×8×1`)
 * - `PALETTE_KNIFE_SGRAFFITO_WGSL`: 칼날 폭·각도·필압·경화 저항 기반 스크래핑 및 비드 퇴적 (`8×8×1`)
 */

import { clamp01, clampRange, sanitizePositive } from "./temporal-ink-drying-field";

export interface TemporalWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage";
  readonly access: "read" | "read_write";
}

export interface TemporalWgslShaderContract {
  readonly shaderId: string;
  readonly entryPoint: string;
  readonly workgroupSize: readonly [number, number, number];
  readonly uniformFloatCount: number;
  readonly uniformByteLength: number;
  readonly bindings: readonly TemporalWgslBindingDescriptor[];
}

export interface TemporalWgslValidationReport {
  readonly shaderId: string;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly discoveredEntryPoints: readonly string[];
  readonly discoveredBindings: readonly number[];
}

export interface TemporalWgslSuiteValidationResult {
  readonly allValid: boolean;
  readonly reports: readonly TemporalWgslValidationReport[];
}

export interface TemporalDryingUniformInput {
  readonly width: number;
  readonly height: number;
  readonly deltaSec: number;
  readonly evapEnvFactor?: number;
  readonly cureEnvFactor?: number;
  readonly coffeeRingGain?: number;
  readonly capillaryGain?: number;
  readonly maxSubstepTransport?: number;
  readonly defaultShrinkage?: number;
  readonly valleyDepositionBias?: number;
  readonly currentTimeSec?: number;
}

export interface RewettingBloomUniformInput {
  readonly width: number;
  readonly height: number;
  readonly waterAmountMm?: number;
  readonly bloomStrength?: number;
  readonly solventMode?: number;
  readonly rewetSolubility?: number;
  readonly permanentStaining?: number;
  readonly solventSofteningFactor?: number;
  readonly coffeeRingStrength?: number;
  readonly cureBlockThreshold?: number;
  readonly semiCureThreshold?: number;
  readonly timestampSec?: number;
}

export interface PaletteKnifeUniformInput {
  readonly width: number;
  readonly height: number;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly bladeWidthPx: number;
  readonly bladeAngleRad?: number;
  readonly pressure?: number;
  readonly scrapeDepthMm?: number;
  readonly sgraffitoSharpness?: number;
  readonly cureResistThreshold?: number;
  readonly beadPushGain?: number;
  readonly timestampSec?: number;
}

/** 1. 시공간 잉크 건조·증발·커피링·산화 경화 컴퓨트 셰이더 (Uniform 64B = 16×f32). */
export const TEMPORAL_DRYING_EVAPORATION_WGSL = /* wgsl */ `
struct TemporalDryingUniforms {
  canvasSize: vec2<f32>, deltaSec: f32, evapEnvFactor: f32,
  cureEnvFactor: f32, coffeeRingGain: f32, capillaryGain: f32, maxSubstepTransport: f32,
  defaultShrinkage: f32, valleyDepositionBias: f32, currentTimeSec: f32, pad0: f32,
  padVec: vec4<f32>,
};
@group(0) @binding(0) var<uniform> uDry: TemporalDryingUniforms;
@group(0) @binding(1) var<storage, read> wetPigmentIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> fixedPigmentIn: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> stateMetaIn: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> mediaPropsIn: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> wetPigmentOut: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> fixedPigmentOut: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> stateMetaOut: array<vec4<f32>>;

fn dryIndex(c: vec2<i32>, dims: vec2<i32>) -> u32 {
  return u32(clamp(c.y, 0, dims.y - 1) * dims.x + clamp(c.x, 0, dims.x - 1));
}

@compute @workgroup_size(8, 8, 1)
fn cs_temporal_drying_evaporation(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(i32(uDry.canvasSize.x), i32(uDry.canvasSize.y));
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  if (coord.x >= dims.x || coord.y >= dims.y) { return; }

  let idx = dryIndex(coord, dims);
  let wetIn = wetPigmentIn[idx];
  let fixedIn = fixedPigmentIn[idx];
  let meta = stateMetaIn[idx];
  let props = mediaPropsIn[idx];
  let waterBefore = max(0.0, meta.x);
  let prevCure = clamp(meta.y, 0.0, 1.0);
  let prevHeight = max(0.0, meta.z);
  let tooth = clamp(meta.w, 0.0, 1.0);
  let dt = max(0.0, uDry.deltaSec);

  let iL = dryIndex(coord + vec2<i32>(-1, 0), dims);
  let iR = dryIndex(coord + vec2<i32>( 1, 0), dims);
  let iU = dryIndex(coord + vec2<i32>( 0,-1), dims);
  let iD = dryIndex(coord + vec2<i32>( 0, 1), dims);
  let nL = stateMetaIn[iL].x;
  let nR = stateMetaIn[iR].x;
  let nU = stateMetaIn[iU].x;
  let nD = stateMetaIn[iD].x;

  let thresh = waterBefore * 0.72;
  let dryN = select(0.0, 1.0, nL < thresh) + select(0.0, 1.0, nR < thresh) +
             select(0.0, 1.0, nU < thresh) + select(0.0, 1.0, nD < thresh);
  let edgeFactor = select(0.0, dryN * 0.25, waterBefore > 0.00001);

  let tr = clamp(props.z * uDry.coffeeRingGain * (1.0 - exp(-0.22 * dt)) * (1.0 - prevCure), 0.0, uDry.maxSubstepTransport);
  let inFlow =
    wetPigmentIn[iL] * select(0.0, 0.25 * tr, nL > waterBefore * 1.02 && waterBefore > 0.00001) +
    wetPigmentIn[iR] * select(0.0, 0.25 * tr, nR > waterBefore * 1.02 && waterBefore > 0.00001) +
    wetPigmentIn[iU] * select(0.0, 0.25 * tr, nU > waterBefore * 1.02 && waterBefore > 0.00001) +
    wetPigmentIn[iD] * select(0.0, 0.25 * tr, nD > waterBefore * 1.02 && waterBefore > 0.00001);
  let outFrac =
    (select(0.0, 0.25, nL > 0.00001 && nL < waterBefore * 0.98) +
     select(0.0, 0.25, nR > 0.00001 && nR < waterBefore * 0.98) +
     select(0.0, 0.25, nU > 0.00001 && nU < waterBefore * 0.98) +
     select(0.0, 0.25, nD > 0.00001 && nD < waterBefore * 0.98)) * tr;
  let advWet = max(vec4<f32>(0.0), wetIn * (1.0 - outFrac) + inFlow);

  let effEvap = props.x * uDry.evapEnvFactor * (1.0 + 0.85 * edgeFactor);
  let waterAfter = max(0.0, waterBefore * exp(-effEvap * dt) * exp(-0.008 * uDry.capillaryGain * dt));
  let lossRatio = select(1.0, clamp((waterBefore - waterAfter) / max(0.00001, waterBefore), 0.0, 1.0), waterBefore > 0.00001);
  let timeSettle = 1.0 - exp(-props.y * (0.85 + uDry.valleyDepositionBias * (1.0 - tooth)) * dt);
  let settle = select(clamp(1.0 - (1.0 - lossRatio) * (1.0 - timeSettle), 0.0, 1.0), 1.0, waterAfter <= 0.00001);

  let deposited = advWet * settle;
  let nextWet = max(vec4<f32>(0.0), advWet - deposited);
  let nextFixed = fixedIn + deposited;
  let nextCure = select(prevCure, clamp(1.0 - (1.0 - prevCure) * exp(-props.w * uDry.cureEnvFactor * dt), prevCure, 1.0), (nextWet.w + nextFixed.w) > 0.000001 && props.w > 0.0);
  let nextHeight = max(0.0, prevHeight * (1.0 - uDry.defaultShrinkage * 0.28 * lossRatio));

  wetPigmentOut[idx] = nextWet;
  fixedPigmentOut[idx] = nextFixed;
  stateMetaOut[idx] = vec4<f32>(waterAfter, nextCure, nextHeight, tooth);
}
`;

/** 2. 물리 재습윤 및 콜리플라워 블룸 용해도 컴퓨트 셰이더 (Uniform 64B = 16×f32). */
export const REWETTING_BLOOM_SOLUBILITY_WGSL = /* wgsl */ `
struct RewettingBloomUniforms {
  canvasSize: vec2<f32>, waterAmountMm: f32, bloomStrength: f32,
  solventMode: f32, rewetSolubility: f32, permanentStaining: f32, solventSofteningFactor: f32,
  coffeeRingStrength: f32, cureBlockThreshold: f32, semiCureThreshold: f32, timestampSec: f32,
  padVec: vec4<f32>,
};
@group(0) @binding(0) var<uniform> uRewet: RewettingBloomUniforms;
@group(0) @binding(1) var<storage, read> wetMaskField: array<f32>;
@group(0) @binding(2) var<storage, read> wetPigmentIn: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> fixedPigmentIn: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> stateMetaIn: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> wetPigmentOut: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> fixedPigmentOut: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> stateMetaOut: array<vec4<f32>>;

fn rewetIndex(c: vec2<i32>, dims: vec2<i32>) -> u32 {
  return u32(clamp(c.y, 0, dims.y - 1) * dims.x + clamp(c.x, 0, dims.x - 1));
}

@compute @workgroup_size(8, 8, 1)
fn cs_rewetting_bloom_solubility(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(i32(uRewet.canvasSize.x), i32(uRewet.canvasSize.y));
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  if (coord.x >= dims.x || coord.y >= dims.y) { return; }

  let idx = rewetIndex(coord, dims);
  let mask = clamp(wetMaskField[idx], 0.0, 1.0);
  let wetIn = wetPigmentIn[idx];
  let fixedIn = fixedPigmentIn[idx];
  let meta = stateMetaIn[idx];
  let prevCure = clamp(meta.y, 0.0, 1.0);
  var dissolveFrac: f32 = 0.0;
  var nextCure: f32 = prevCure;

  if (mask > 0.0001) {
    if (uRewet.solventMode < 0.5 || uRewet.solventMode > 1.5) {
      let gumBoost = select(1.0, 1.12, uRewet.solventMode > 1.5);
      let baseSol = uRewet.rewetSolubility * (1.0 - uRewet.permanentStaining) * (1.0 - prevCure);
      let blocked = prevCure >= uRewet.cureBlockThreshold && uRewet.rewetSolubility < 0.05;
      dissolveFrac = select(clamp(baseSol * gumBoost * (0.48 + 0.52 * mask), 0.0, 0.98), 0.0, blocked);
    } else if (prevCure < uRewet.semiCureThreshold) {
      let mob = clamp((uRewet.semiCureThreshold - prevCure) / max(0.01, uRewet.semiCureThreshold), 0.0, 1.0);
      nextCure = max(0.0, prevCure - uRewet.solventSofteningFactor * (0.35 + 0.65 * mob) * mask * 0.52);
      dissolveFrac = clamp(uRewet.solventSofteningFactor * (0.38 + 0.62 * mob) * (0.45 + 0.55 * mask), 0.0, 0.9);
    }
  }

  let dissolved = fixedIn * dissolveFrac;
  let localWet = wetIn + dissolved;
  let iL = rewetIndex(coord + vec2<i32>(-1, 0), dims);
  let iR = rewetIndex(coord + vec2<i32>( 1, 0), dims);
  let iU = rewetIndex(coord + vec2<i32>( 0,-1), dims);
  let iD = rewetIndex(coord + vec2<i32>( 0, 1), dims);
  let mL = wetMaskField[iL];
  let mR = wetMaskField[iR];
  let mU = wetMaskField[iU];
  let mD = wetMaskField[iD];

  let bRate = clamp(uRewet.bloomStrength * (0.32 + 0.68 * uRewet.coffeeRingStrength) * 0.35 * (1.0 - nextCure), 0.0, 0.42);
  let incoming =
    wetPigmentIn[iL] * max(0.0, mL - mask) * 0.25 + wetPigmentIn[iR] * max(0.0, mR - mask) * 0.25 +
    wetPigmentIn[iU] * max(0.0, mU - mask) * 0.25 + wetPigmentIn[iD] * max(0.0, mD - mask) * 0.25;
  let outRatio = (max(0.0, mask - mL) + max(0.0, mask - mR) + max(0.0, mask - mU) + max(0.0, mask - mD)) * 0.25 * bRate;

  wetPigmentOut[idx] = max(vec4<f32>(0.0), localWet * (1.0 - clamp(outRatio, 0.0, 0.45)) + incoming * bRate);
  fixedPigmentOut[idx] = max(vec4<f32>(0.0), fixedIn - dissolved);
  stateMetaOut[idx] = vec4<f32>(max(0.0, meta.x) + uRewet.waterAmountMm * mask, nextCure, max(0.0, meta.z), clamp(meta.w, 0.0, 1.0));
}
`;

/** 3. 팔레트 나이프 스크래핑 및 스그라피토 컴퓨트 셰이더 (Uniform 64B = 16×f32). */
export const PALETTE_KNIFE_SGRAFFITO_WGSL = /* wgsl */ `
struct PaletteKnifeUniforms {
  canvasSize: vec2<f32>, strokeStart: vec2<f32>,
  strokeEnd: vec2<f32>, bladeWidthPx: f32, bladeAngleRad: f32,
  pressure: f32, scrapeDepthMm: f32, sgraffitoSharpness: f32, cureResistThreshold: f32,
  beadPushGain: f32, timestampSec: f32, pad0: f32, pad1: f32,
};
@group(0) @binding(0) var<uniform> uKnife: PaletteKnifeUniforms;
@group(0) @binding(1) var<storage, read> wetPigmentIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> fixedPigmentIn: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> stateMetaIn: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> wetPigmentOut: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> fixedPigmentOut: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> stateMetaOut: array<vec4<f32>>;

fn knifeIndex(c: vec2<i32>, dims: vec2<i32>) -> u32 {
  return u32(clamp(c.y, 0, dims.y - 1) * dims.x + clamp(c.x, 0, dims.x - 1));
}

@compute @workgroup_size(8, 8, 1)
fn cs_palette_knife_sgraffito(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(i32(uKnife.canvasSize.x), i32(uKnife.canvasSize.y));
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  if (coord.x >= dims.x || coord.y >= dims.y) { return; }

  let idx = knifeIndex(coord, dims);
  let wetIn = wetPigmentIn[idx];
  let fixedIn = fixedPigmentIn[idx];
  let meta = stateMetaIn[idx];
  let seg = uKnife.strokeEnd - uKnife.strokeStart;
  let segLen = max(0.0001, length(seg));
  let dir = seg / segLen;
  let normal = vec2<f32>(-dir.y, dir.x);
  let rel = vec2<f32>(f32(coord.x), f32(coord.y)) - uKnife.strokeStart;
  let along = dot(rel, dir);
  let across = abs(dot(rel, normal));
  let halfBlade = max(0.5, uKnife.bladeWidthPx * 0.5);

  let cure = clamp(meta.y, 0.0, 1.0);
  let heightIn = max(0.0, meta.z);
  let tooth = clamp(meta.w, 0.0, 1.0);
  var workability: f32 = 0.0;
  if (cure < 0.7) {
    workability = 1.0 - 0.42 * (cure / 0.7);
  } else if (cure < uKnife.cureResistThreshold) {
    let uStiff = clamp((cure - 0.7) / max(0.01, uKnife.cureResistThreshold - 0.7), 0.0, 1.0);
    workability = 0.58 * (1.0 - uStiff) * (1.0 - uStiff) + 0.025 * uStiff;
  } else {
    workability = max(0.0, (1.0 - cure) * 0.22);
  }

  let attack = 0.28 + 0.72 * abs(sin(uKnife.bladeAngleRad));
  let toothShield = (1.0 - tooth) * (1.0 - uKnife.sgraffitoSharpness * 0.78) * 0.38;
  let uNorm = clamp(across / halfBlade, 0.0, 1.0);
  var nextWet = wetIn;
  var nextFixed = fixedIn;
  var nextHeight = heightIn;

  if (along >= 0.0 && along <= segLen && across <= halfBlade) {
    let cutFrac = clamp(uKnife.pressure * attack * workability * (1.0 - 0.22 * uNorm * uNorm) * (1.0 - toothShield), 0.0, 0.96);
    let fixedCut = cutFrac * select(0.9, 0.5, cure >= uKnife.cureResistThreshold);
    nextWet = max(vec4<f32>(0.0), wetIn * (1.0 - cutFrac));
    nextFixed = max(vec4<f32>(0.0), fixedIn * (1.0 - fixedCut));
    nextHeight = max(0.0, heightIn - min(heightIn, max(heightIn * cutFrac * 0.88, uKnife.scrapeDepthMm * cutFrac * 0.55)));
  } else if (along > segLen && along <= segLen + 2.5 && across <= halfBlade * 1.1) {
    let upCoord = vec2<i32>(i32(round(f32(coord.x) - dir.x * 2.0)), i32(round(f32(coord.y) - dir.y * 2.0)));
    let upIdx = knifeIndex(upCoord, dims);
    let upMeta = stateMetaIn[upIdx];
    let upWork = select(0.02, 0.75, upMeta.y < 0.7);
    let gain = uKnife.beadPushGain * upWork * uKnife.pressure;
    nextWet = wetIn + (wetPigmentIn[upIdx] + fixedPigmentIn[upIdx] * 0.5) * gain;
    nextHeight = heightIn + upMeta.z * gain;
  }

  wetPigmentOut[idx] = nextWet;
  fixedPigmentOut[idx] = nextFixed;
  stateMetaOut[idx] = vec4<f32>(meta.x, cure, nextHeight, tooth);
}
`;

export const TEMPORAL_INK_WGSL_CONTRACTS: readonly TemporalWgslShaderContract[] = [
  {
    shaderId: "temporal-drying-evaporation",
    entryPoint: "cs_temporal_drying_evaporation",
    workgroupSize: [8, 8, 1],
    uniformFloatCount: 16,
    uniformByteLength: 64,
    bindings: [
      { group: 0, binding: 0, name: "uDry", addressSpace: "uniform", access: "read" },
      { group: 0, binding: 1, name: "wetPigmentIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 2, name: "fixedPigmentIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 3, name: "stateMetaIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 4, name: "mediaPropsIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 5, name: "wetPigmentOut", addressSpace: "storage", access: "read_write" },
      { group: 0, binding: 6, name: "fixedPigmentOut", addressSpace: "storage", access: "read_write" },
      { group: 0, binding: 7, name: "stateMetaOut", addressSpace: "storage", access: "read_write" },
    ],
  },
  {
    shaderId: "rewetting-bloom-solubility",
    entryPoint: "cs_rewetting_bloom_solubility",
    workgroupSize: [8, 8, 1],
    uniformFloatCount: 16,
    uniformByteLength: 64,
    bindings: [
      { group: 0, binding: 0, name: "uRewet", addressSpace: "uniform", access: "read" },
      { group: 0, binding: 1, name: "wetMaskField", addressSpace: "storage", access: "read" },
      { group: 0, binding: 2, name: "wetPigmentIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 3, name: "fixedPigmentIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 4, name: "stateMetaIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 5, name: "wetPigmentOut", addressSpace: "storage", access: "read_write" },
      { group: 0, binding: 6, name: "fixedPigmentOut", addressSpace: "storage", access: "read_write" },
      { group: 0, binding: 7, name: "stateMetaOut", addressSpace: "storage", access: "read_write" },
    ],
  },
  {
    shaderId: "palette-knife-sgraffito",
    entryPoint: "cs_palette_knife_sgraffito",
    workgroupSize: [8, 8, 1],
    uniformFloatCount: 16,
    uniformByteLength: 64,
    bindings: [
      { group: 0, binding: 0, name: "uKnife", addressSpace: "uniform", access: "read" },
      { group: 0, binding: 1, name: "wetPigmentIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 2, name: "fixedPigmentIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 3, name: "stateMetaIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 4, name: "wetPigmentOut", addressSpace: "storage", access: "read_write" },
      { group: 0, binding: 5, name: "fixedPigmentOut", addressSpace: "storage", access: "read_write" },
      { group: 0, binding: 6, name: "stateMetaOut", addressSpace: "storage", access: "read_write" },
    ],
  },
];

/** `TemporalDryingUniforms`와 1:1 매핑되는 16-byte 정렬 `Float32Array(16)`(64B)를 패킹한다. */
export function packTemporalDryingUniforms(input: TemporalDryingUniformInput): Float32Array {
  const out = new Float32Array(16);
  out[0] = Math.max(1, Math.floor(sanitizePositive(input.width, 1)));
  out[1] = Math.max(1, Math.floor(sanitizePositive(input.height, 1)));
  out[2] = sanitizePositive(input.deltaSec, 0);
  out[3] = clampRange(input.evapEnvFactor ?? 1, 0.1, 4);
  out[4] = clampRange(input.cureEnvFactor ?? 1, 0.1, 4);
  out[5] = clampRange(input.coffeeRingGain ?? 0.36, 0, 1);
  out[6] = clampRange(input.capillaryGain ?? 1, 0, 5);
  out[7] = clampRange(input.maxSubstepTransport ?? 0.32, 0.01, 0.48);
  out[8] = clamp01(input.defaultShrinkage ?? 0.35);
  out[9] = clampRange(input.valleyDepositionBias ?? 0.4, 0, 1.5);
  out[10] = sanitizePositive(input.currentTimeSec ?? 0, 0);
  return out;
}

/** `RewettingBloomUniforms`와 1:1 매핑되는 16-byte 정렬 `Float32Array(16)`(64B)를 패킹한다. */
export function packRewettingBloomUniforms(input: RewettingBloomUniformInput): Float32Array {
  const out = new Float32Array(16);
  out[0] = Math.max(1, Math.floor(sanitizePositive(input.width, 1)));
  out[1] = Math.max(1, Math.floor(sanitizePositive(input.height, 1)));
  out[2] = sanitizePositive(input.waterAmountMm ?? 0.38, 0.38);
  out[3] = clamp01(input.bloomStrength ?? 0.78);
  out[4] = clampRange(Math.round(input.solventMode ?? 0), 0, 2);
  out[5] = clamp01(input.rewetSolubility ?? 0.9);
  out[6] = clamp01(input.permanentStaining ?? 0.14);
  out[7] = clamp01(input.solventSofteningFactor ?? 0.88);
  out[8] = clamp01(input.coffeeRingStrength ?? 0.82);
  out[9] = clampRange(input.cureBlockThreshold ?? 0.85, 0.5, 1);
  out[10] = clampRange(input.semiCureThreshold ?? 0.75, 0.2, 0.95);
  out[11] = sanitizePositive(input.timestampSec ?? 0, 0);
  return out;
}

/** `PaletteKnifeUniforms`와 1:1 매핑되는 16-byte 정렬 `Float32Array(16)`(64B)를 패킹한다. */
export function packPaletteKnifeUniforms(input: PaletteKnifeUniformInput): Float32Array {
  const out = new Float32Array(16);
  out[0] = Math.max(1, Math.floor(sanitizePositive(input.width, 1)));
  out[1] = Math.max(1, Math.floor(sanitizePositive(input.height, 1)));
  out[2] = Number.isFinite(input.startX) ? input.startX : 0;
  out[3] = Number.isFinite(input.startY) ? input.startY : 0;
  out[4] = Number.isFinite(input.endX) ? input.endX : out[2];
  out[5] = Number.isFinite(input.endY) ? input.endY : out[3];
  out[6] = Math.max(0.5, sanitizePositive(input.bladeWidthPx, 4));
  out[7] = Number.isFinite(input.bladeAngleRad) ? (input.bladeAngleRad ?? Math.PI / 4) : Math.PI / 4;
  out[8] = clamp01(input.pressure ?? 0.78);
  out[9] = sanitizePositive(input.scrapeDepthMm ?? 1.35, 1.35);
  out[10] = clamp01(input.sgraffitoSharpness ?? 0.68);
  out[11] = clampRange(input.cureResistThreshold ?? 0.92, 0.75, 1);
  out[12] = clampRange(input.beadPushGain ?? 0.42, 0, 1);
  out[13] = sanitizePositive(input.timestampSec ?? 0, 0);
  return out;
}

/** 단일 WGSL 셰이더의 괄호 균형, 바인딩, 워크그룹 크기 및 16-byte 정렬 계약을 정적 검증한다. */
export function validateSingleTemporalWgslContract(
  source: string,
  contract: TemporalWgslShaderContract,
): TemporalWgslValidationReport {
  const errors: string[] = [];
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0) {
      errors.push("WGSL 괄호 깊이가 음수로 내려갔습니다.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push(`중괄호 불균형: depth=${braceDepth}`);
  if (parenDepth !== 0) errors.push(`소괄호 불균형: depth=${parenDepth}`);
  if (contract.uniformByteLength % 16 !== 0) errors.push(`Uniform 크기(${contract.uniformByteLength}B)는 16바이트 배수여야 합니다.`);
  if (contract.uniformFloatCount * 4 !== contract.uniformByteLength) errors.push("Uniform float 개수와 바이트 크기가 불일치합니다.");

  const bindingRegex = /@group\((\d+)\)\s+@binding\((\d+)\)\s+var<(uniform|storage)(?:,\s*(read|read_write))?>\s+(\w+)/g;
  const discoveredBindings: number[] = [];
  const bindingMap = new Map<string, { space: string; access: string; name: string }>();
  let match: RegExpExecArray | null = bindingRegex.exec(source);
  while (match !== null) {
    discoveredBindings.push(Number(match[2]));
    bindingMap.set(`${match[1]}:${match[2]}`, { space: match[3], access: match[4] ?? "read", name: match[5] });
    match = bindingRegex.exec(source);
  }

  for (let i = 0; i < contract.bindings.length; i += 1) {
    const exp = contract.bindings[i];
    const act = bindingMap.get(`${exp.group}:${exp.binding}`);
    if (!act) errors.push(`필수 바인딩 누락: @group(${exp.group}) @binding(${exp.binding}) ${exp.name}`);
    else if (act.name !== exp.name) errors.push(`바인딩 이름 불일치: ${act.name} !== ${exp.name}`);
    else if (act.space !== exp.addressSpace || act.access !== exp.access) {
      errors.push(`바인딩 접근 불일치(${exp.name}): ${act.space}/${act.access} !== ${exp.addressSpace}/${exp.access}`);
    }
  }

  const discoveredEntryPoints: string[] = [];
  const fnRegex = /@compute[\s\S]*?fn\s+(\w+)\s*\(/g;
  let fnMatch: RegExpExecArray | null = fnRegex.exec(source);
  while (fnMatch !== null) {
    discoveredEntryPoints.push(fnMatch[1]);
    fnMatch = fnRegex.exec(source);
  }
  if (!source.includes(`fn ${contract.entryPoint}(`)) errors.push(`필수 컴퓨트 진입점 누락: ${contract.entryPoint}`);
  const wgDecl = `@workgroup_size(${contract.workgroupSize[0]}, ${contract.workgroupSize[1]}, ${contract.workgroupSize[2]})`;
  if (!source.includes(wgDecl)) errors.push(`워크그룹 선언 누락: ${wgDecl}`);

  return { shaderId: contract.shaderId, valid: errors.length === 0, errors, discoveredEntryPoints, discoveredBindings };
}

/** Wave 73 3종 컴퓨트 WGSL 셰이더 전체 계약을 일괄 검증한다. */
export function validateTemporalInkWgslContracts(): TemporalWgslSuiteValidationResult {
  const sourcesById: Readonly<Record<string, string>> = {
    "temporal-drying-evaporation": TEMPORAL_DRYING_EVAPORATION_WGSL,
    "rewetting-bloom-solubility": REWETTING_BLOOM_SOLUBILITY_WGSL,
    "palette-knife-sgraffito": PALETTE_KNIFE_SGRAFFITO_WGSL,
  };
  const reports = TEMPORAL_INK_WGSL_CONTRACTS.map((c) => validateSingleTemporalWgslContract(sourcesById[c.shaderId] ?? "", c));
  return { allValid: reports.every((r) => r.valid), reports };
}
