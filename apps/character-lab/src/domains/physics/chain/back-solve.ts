/**
 * 역산 회전(character-physics.md §4.4): 시뮬 입자 위치 → 보조 본 로컬 회전.
 *
 * 본 j의 월드 회전 = swingFromUnitVectorsF32(restDir_j(월드), simDir_j) ∘ restWorldRot_j,
 * 로컬 회전 = inverse(parentWorldRot) ∘ worldRot. 루트→말단 순서로 적용하며 순수 함수다.
 * 말단 본(자식 없음)과 0 길이 퇴화 세그먼트는 직전 본의 월드 회전을 그대로 잇는다.
 */
import { conjugateQuat, f32Dot3, f32Length3, multiplyQuat, normalizeQuat, normalizeVec3, rotateVec3 } from "../core/vec";

import type { CompiledChains } from "./chain-model";
import type { ChainState, Quat, Vec3 } from "../../../contracts";

const F = Math.fround;

export interface ChainBoneRotation {
  readonly bone: string;
  /** 부모(이전 본 또는 루트의 부모 본) 프레임 기준 로컬 회전 */
  readonly local: Quat;
  readonly world: Quat;
}

export interface BackSolveOptions {
  /** 체인별 루트 본의 부모 월드 회전(루트의 로컬 회전 산출용). 기본 항등 */
  readonly rootParentRotations?: Float32Array;
}

function assertValidChainIndex(chainCount: number, chainIndex: number): void {
  if (!Number.isInteger(chainIndex) || chainIndex < 0 || chainIndex >= chainCount) {
    throw new RangeError(`유효하지 않은 체인 인덱스입니다: ${chainIndex}`);
  }
}

/** from에 수직인 결정적 단위 벡터(정확히 180° 반대 방향인 특이점용) */
function anyPerpendicularF32(from: Vec3): Vec3 {
  const ax = from[0] < 0 ? -from[0] : from[0];
  const axis: Vec3 = ax < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cx = F(F(from[1] * axis[2]) - F(from[2] * axis[1]));
  const cy = F(F(from[2] * axis[0]) - F(from[0] * axis[2]));
  const cz = F(F(from[0] * axis[1]) - F(from[1] * axis[0]));
  return normalizeVec3([cx, cy, cz]);
}

/**
 * 수치적으로 안정한 f32 단위 벡터 간 최소 회전(데드존·180° 근처 상쇄 오차 제거).
 * - d ≥ 0: 1 + d ∈ [1, 2]는 특이점이 없으므로 데드존 없이 [c, 1 + d]를 바로 정규화한다.
 * - d < 0, ‖c‖ > 0: 1 + d 상쇄를 피하기 위해 동치 비율 [ĉ·(1 - d), ‖c‖]를 정규화한다.
 * - d < 0, ‖c‖ = 0: 정확히 180° 반대이므로 결정적 수직축 주위 π 회전을 돌려준다.
 */
function swingFromUnitVectorsF32(from: Vec3, to: Vec3): Quat {
  const f = normalizeVec3(from);
  const t = normalizeVec3(to);
  if (f32Dot3(f[0], f[1], f[2], f[0], f[1], f[2]) === 0 || f32Dot3(t[0], t[1], t[2], t[0], t[1], t[2]) === 0) {
    return [0, 0, 0, 1];
  }
  const d = f32Dot3(f[0], f[1], f[2], t[0], t[1], t[2]);
  const cx = F(F(f[1] * t[2]) - F(f[2] * t[1]));
  const cy = F(F(f[2] * t[0]) - F(f[0] * t[2]));
  const cz = F(F(f[0] * t[1]) - F(f[1] * t[0]));
  if (d >= 0) {
    return normalizeQuat([cx, cy, cz, F(1 + d)]);
  }
  const cLen = f32Length3(cx, cy, cz);
  if (cLen > 0) {
    const cHat: Vec3 = [F(cx / cLen), F(cy / cLen), F(cz / cLen)];
    const oneMinusD = F(1 - d);
    return normalizeQuat([F(cHat[0] * oneMinusD), F(cHat[1] * oneMinusD), F(cHat[2] * oneMinusD), cLen]);
  }
  const axis = anyPerpendicularF32(f);
  return [axis[0], axis[1], axis[2], 0];
}

/** 체인 c의 본 회전 목록(루트→말단, 길이 = 입자 수) */
export function backSolveChainRotations(compiled: CompiledChains, state: ChainState, chainIndex: number, options: BackSolveOptions = {}): ChainBoneRotation[] {
  const { model } = compiled;
  assertValidChainIndex(model.chainCount, chainIndex);
  const start = model.chainOffset[chainIndex];
  const count = model.chainLength[chainIndex];
  const restRoot: Quat = normalizeQuat([
    compiled.rootRestRotations[chainIndex * 4],
    compiled.rootRestRotations[chainIndex * 4 + 1],
    compiled.rootRestRotations[chainIndex * 4 + 2],
    compiled.rootRestRotations[chainIndex * 4 + 3],
  ]);
  const parentRotBuf = options.rootParentRotations;
  const hasParentRot = parentRotBuf !== undefined && parentRotBuf.length >= (chainIndex + 1) * 4;
  let parentWorld: Quat = hasParentRot
    ? normalizeQuat([
        parentRotBuf[chainIndex * 4],
        parentRotBuf[chainIndex * 4 + 1],
        parentRotBuf[chainIndex * 4 + 2],
        parentRotBuf[chainIndex * 4 + 3],
      ])
    : [0, 0, 0, 1];
  const baseRoot: Quat = hasParentRot ? normalizeQuat(multiplyQuat(parentWorld, restRoot)) : restRoot;
  const out: ChainBoneRotation[] = [];
  let lastWorld: Quat = baseRoot;
  for (let j = 0; j < count; j += 1) {
    const i = start + j;
    let world: Quat;
    if (j < count - 1) {
      const a = i * 3;
      const b = (i + 1) * 3;
      const simDir = normalizeVec3([state.pos[b] - state.pos[a], state.pos[b + 1] - state.pos[a + 1], state.pos[b + 2] - state.pos[a + 2]]);
      const restLocal: Vec3 = normalizeVec3([model.restDirLocal[b], model.restDirLocal[b + 1], model.restDirLocal[b + 2]]);
      const restDirWorld = normalizeVec3(rotateVec3(baseRoot, restLocal));
      const hasValidDirs =
        f32Dot3(simDir[0], simDir[1], simDir[2], simDir[0], simDir[1], simDir[2]) > 0 &&
        f32Dot3(restDirWorld[0], restDirWorld[1], restDirWorld[2], restDirWorld[0], restDirWorld[1], restDirWorld[2]) > 0;
      if (hasValidDirs) {
        const swing = swingFromUnitVectorsF32(restDirWorld, simDir);
        world = normalizeQuat(multiplyQuat(swing, baseRoot));
      } else {
        world = lastWorld;
      }
    } else {
      world = lastWorld;
    }
    const local = normalizeQuat(multiplyQuat(conjugateQuat(parentWorld), world));
    out.push({ bone: compiled.particleBones[i] ?? `${compiled.chainIds[chainIndex]}_${j}`, local, world });
    parentWorld = world;
    lastWorld = world;
  }
  return out;
}

/** 역산 회전으로 FK를 돌려 입자 위치를 재구성한다(검증·export용). 루트 위치는 state에서 가져온다. */
export function forwardKinematicsFromRotations(compiled: CompiledChains, state: ChainState, chainIndex: number, rotations: readonly ChainBoneRotation[]): Float32Array {
  const { model } = compiled;
  assertValidChainIndex(model.chainCount, chainIndex);
  const start = model.chainOffset[chainIndex];
  const count = model.chainLength[chainIndex];
  const out = new Float32Array(count * 3);
  const r = start * 3;
  const rx = state.pos[r];
  const ry = state.pos[r + 1];
  const rz = state.pos[r + 2];
  if (Number.isFinite(rx) && Number.isFinite(ry) && Number.isFinite(rz)) {
    out[0] = rx;
    out[1] = ry;
    out[2] = rz;
  } else {
    out[0] = compiled.restPositions[r] ?? 0;
    out[1] = compiled.restPositions[r + 1] ?? 0;
    out[2] = compiled.restPositions[r + 2] ?? 0;
  }
  const restRoot: Quat = [
    compiled.rootRestRotations[chainIndex * 4],
    compiled.rootRestRotations[chainIndex * 4 + 1],
    compiled.rootRestRotations[chainIndex * 4 + 2],
    compiled.rootRestRotations[chainIndex * 4 + 3],
  ];
  const restInv = conjugateQuat(normalizeQuat(restRoot));
  for (let j = 1; j < count; j += 1) {
    const i = start + j;
    const restOffset: Vec3 = [
      compiled.restPositions[i * 3] - compiled.restPositions[(i - 1) * 3],
      compiled.restPositions[i * 3 + 1] - compiled.restPositions[(i - 1) * 3 + 1],
      compiled.restPositions[i * 3 + 2] - compiled.restPositions[(i - 1) * 3 + 2],
    ];
    // rest 월드 회전 R0에서 본 j-1의 로컬 오프셋 = R0⁻¹·restOffset, 현재 월드 = world_{j-1}·로컬
    const localOffset = rotateVec3(restInv, restOffset);
    const parentWorld = normalizeQuat(rotations[j - 1]?.world ?? [0, 0, 0, 1]);
    const worldOffset = rotateVec3(parentWorld, localOffset);
    out[j * 3] = out[(j - 1) * 3] + worldOffset[0];
    out[j * 3 + 1] = out[(j - 1) * 3 + 1] + worldOffset[1];
    out[j * 3 + 2] = out[(j - 1) * 3 + 2] + worldOffset[2];
  }
  return out;
}
