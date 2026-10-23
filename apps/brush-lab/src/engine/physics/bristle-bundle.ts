import { hashU32 } from "../core/rng";

import type { BristleSpec } from "./physics-model";

/**
 * 붓모 다발(스칼라 모델). 폭 = w0·(1 + spreadGain·p), 기울기 비대칭,
 * 각도는 진행 방향을 τ = followTauMs로 원형 추종(이력).
 * 붓모 가닥 위상 시드 = hashU32(strokeSeed, strandIndex, 0).
 */

const f = Math.fround;
const TWO_PI = Math.PI * 2;

export interface BristleState {
  /** [0] 현재 각도(rad), [1] 초기화 플래그. */
  data: Float32Array;
  readonly seed: number;
}

export function createBristleState(seed: number): BristleState {
  return { data: new Float32Array(2), seed: seed >>> 0 };
}

/** 가닥 위상 시드(24비트). */
export function strandPhaseSeed(strokeSeed: number, strandIndex: number): number {
  return hashU32(strokeSeed, strandIndex, 0x6b72) & 0x00ff_ffff;
}

function wrapAngle(a: number): number {
  let x = a % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  if (x < -Math.PI) x += TWO_PI;
  return x;
}

export interface BristleOutput {
  rx: number;
  ry: number;
  angle: number;
  asymmetry: number;
}

export function stepBristle(
  state: BristleState,
  sample: { pressure: number; altitudeDeg: number; dirX: number; dirY: number },
  dtMs: number,
  spec: BristleSpec & { baseRadius: number },
): BristleOutput {
  const p = sample.pressure < 0 ? 0 : sample.pressure > 1 ? 1 : sample.pressure;
  const width = f(spec.baseRadius * (1 + spec.spreadGain * p));
  const alt = sample.altitudeDeg < 0 ? 0 : sample.altitudeDeg > 90 ? 90 : sample.altitudeDeg;
  const asym = f(spec.tiltGain * (1 - alt / 90));
  const rx = f(width * (1 + asym));
  const ry = f(width * (1 - 0.5 * asym));
  const target = Math.atan2(sample.dirY, sample.dirX);
  const d = state.data;
  let angle: number;
  if ((d[1] ?? 0) === 0) {
    angle = target;
    d[1] = 1;
  } else {
    const cur = d[0] ?? 0;
    const alpha = spec.followTauMs > 0 ? 1 - Math.exp(-dtMs / spec.followTauMs) : 1;
    angle = cur + wrapAngle(target - cur) * alpha;
  }
  angle = f(wrapAngle(angle));
  d[0] = angle;
  return { rx, ry, angle, asymmetry: asym };
}

export interface BristleClumpingInput {
  readonly strokeSeed: number;
  readonly strands: number;
  /** 필압 [0, 1]. */
  readonly pressure: number;
  /** 브러시 수분·물감 함량 [0, 1]. 높을수록 모세관 표면장력으로 다발이 응집한다. */
  readonly wetness: number;
  /** 스트로크 속도 [0, 10] 정규화 값. 높을수록 끝단 갈필(Feathered Split)이 강해진다. */
  readonly normalizedSpeed?: number;
}

export interface BristleClumpingProfile {
  /** 모세관 응집으로 묶인 유효 부다발(Sub-Clump) 수. */
  readonly clumpCount: number;
  /** 외팔보(Cantilever) 휨에 의한 횡단 벌어짐 계수 (>= 1). */
  readonly splayFactor: number;
  /** 갈필(Dry-brush) 가닥 경계 대비도 [0, 1]. */
  readonly featheredEdgeContrast: number;
  /** 가닥별 정규화 횡단 위치 오프셋 [-1.5, 1.5]. */
  readonly strandOffsets: Float32Array;
  /** 가닥별 안료 전달 가중치 [0, 1]. */
  readonly strandWeights: Float32Array;
}

/**
 * 습식 모세관 응집(Capillary Clumping)과 건식 외팔보 벌어짐(Elastica Cantilever Splay)의
 * 물리적 길항 작용을 계산해 가닥별 횡단 오프셋과 도포 가중치를 생성한다.
 * - 수분(wetness)이 높을수록 표면장력이 인접 강모를 소수의 굵은 다발(clump)로 묶는다.
 * - 수분이 마르고 필압·속도가 높을수록 강모가 개별 가닥으로 쪼개지며 갈필(Feathered Dry-Brush)을 형성한다.
 */
export function evaluateBristleClumpingProfile(
  input: BristleClumpingInput,
): BristleClumpingProfile {
  const n = Math.max(1, Math.min(64, Math.trunc(input.strands)));
  const p = Math.max(0, Math.min(1, Number.isFinite(input.pressure) ? input.pressure : 0.5));
  const w = Math.max(0, Math.min(1, Number.isFinite(input.wetness) ? input.wetness : 0.5));
  const spd = Math.max(0, Math.min(10, Number.isFinite(input.normalizedSpeed) ? (input.normalizedSpeed ?? 0) : 0));

  // 모세관 응집도: 수분이 많고 압력이 낮을수록 클럼프 수가 적어지고 뭉친다
  const capillaryCohesion = f(w * (1 - 0.35 * p));
  const clumpCount = Math.max(1, Math.min(n, Math.round(1 + (n - 1) * (1 - capillaryCohesion * 0.82))));
  const splayFactor = f(1 + p * (0.85 + 0.65 * (1 - w)) + spd * 0.04 * (1 - w));
  const featheredEdgeContrast = f(Math.min(1, (1 - capillaryCohesion) * (0.55 + 0.45 * p + spd * 0.05)));

  const strandOffsets = new Float32Array(n);
  const strandWeights = new Float32Array(n);

  for (let i = 0; i < n; i += 1) {
    const phase = strandPhaseSeed(input.strokeSeed, i) / 0x00ff_ffff;
    const basePos = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const clumpIndex = Math.min(clumpCount - 1, Math.floor((i / n) * clumpCount));
    const clumpCenter = clumpCount === 1 ? 0 : (clumpIndex / (clumpCount - 1)) * 2 - 1;
    const jitter = (phase - 0.5) * 0.18 * (1 - capillaryCohesion * 0.7);
    const mergedPos = basePos * (1 - capillaryCohesion) + clumpCenter * capillaryCohesion + jitter;
    strandOffsets[i] = f(mergedPos * splayFactor);

    const radialDist = Math.abs(basePos);
    const tipLoad = 1 - radialDist * 0.35 * (1 - w);
    const dryDrop = (1 - w) * radialDist * (0.25 + 0.35 * phase);
    strandWeights[i] = f(Math.max(0.08, Math.min(1, tipLoad - dryDrop)));
  }

  return {
    clumpCount,
    splayFactor,
    featheredEdgeContrast,
    strandOffsets,
    strandWeights,
  };
}

