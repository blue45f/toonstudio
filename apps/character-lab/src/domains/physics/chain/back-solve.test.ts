import { describe, expect, it } from "vitest";

import { createPrng } from "../../../shared/prng";
import { commitCapsuleSet, createCapsuleSet, resetCapsuleHistory, writeCapsule } from "../collision/capsule";
import { hasNonFinite, normalizeQuat } from "../core/vec";
import { chainAnchorFixture, chainInputFixture, headColliderFixture } from "../fixtures";
import { createPbdChainSolver } from "../pbd-chain";

import { backSolveChainRotations, forwardKinematicsFromRotations } from "./back-solve";
import { chainInputsFromAnchors, compileChainModel, createChainState } from "./chain-model";
import { settleChains } from "./chain-settle";
import { createChainScratch, stepChainsInto } from "./chain-solver";

import type { ChainBoneRotation } from "./back-solve";
import type { ChainScratch } from "./chain-solver";
import type { CapsuleCollider, ChainAnchor, ChainState, Quat, Vec3, WindInput } from "../../../contracts";

function randomUnitVec3(prng: ReturnType<typeof createPrng>): Vec3 {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const x = prng.nextRange(-1, 1);
    const y = prng.nextRange(-1, 1);
    const z = prng.nextRange(-1, 1);
    const len = Math.hypot(x, y, z);
    if (len > 1e-4) return [x / len, y / len, z / len];
  }
  return [0, -1, 0];
}

function randomQuat(prng: ReturnType<typeof createPrng>): Quat {
  const axis = randomUnitVec3(prng);
  const half = prng.nextRange(-Math.PI, Math.PI) * 0.5;
  const s = Math.sin(half);
  return normalizeQuat([axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)]);
}

describe("physics/chain 역산 회전", () => {
  it("역산 회전으로 FK를 돌리면 말단 오차 ≤ 1e-4", () => {
    const compiled = compileChainModel([
      chainInputFixture({ id: "a", segments: 7, direction: [0.6, -0.7, 0.3], params: { gravityPower: 0.2 } }),
      // 루트 rest 회전이 항등이 아닌 체인(Y축 45°)도 restDirLocal·FK 재구성이 맞아야 한다
      { ...chainInputFixture({ id: "b", segments: 5, root: [0.1, 1.7, 0.05], direction: [-0.4, -1, 0] }), rootRestRotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const },
    ]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const roots = new Float32Array([0.1, 1.65, -0.05, 0.15, 1.72, 0.05]);
    const result = settleChains(compiled.compiled, createChainState(compiled.compiled), { dt: 1 / 120, substeps: 2, rootPositions: roots }, { maxSteps: 300 });
    for (let c = 0; c < compiled.compiled.model.chainCount; c += 1) {
      const rotations = backSolveChainRotations(compiled.compiled, result.state, c);
      expect(rotations.length).toBe(compiled.compiled.model.chainLength[c]);
      for (const rot of rotations) {
        expect(Math.abs(Math.hypot(...rot.local) - 1)).toBeLessThan(1e-5);
        expect(rot.bone.length).toBeGreaterThan(0);
      }
      const fk = forwardKinematicsFromRotations(compiled.compiled, result.state, c, rotations);
      const start = compiled.compiled.model.chainOffset[c];
      const count = compiled.compiled.model.chainLength[c];
      const tip = (start + count - 1) * 3;
      const err = Math.hypot(fk[(count - 1) * 3] - result.state.pos[tip], fk[(count - 1) * 3 + 1] - result.state.pos[tip + 1], fk[(count - 1) * 3 + 2] - result.state.pos[tip + 2]);
      expect(err).toBeLessThanOrEqual(1e-4);
    }
  });

  it("rest 상태에서는 모든 로컬 회전이 항등이다", () => {
    const compiled = compileChainModel([chainInputFixture({ segments: 4, direction: [0.3, -1, 0.2] })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const rotations = backSolveChainRotations(compiled.compiled, createChainState(compiled.compiled), 0);
    for (const rot of rotations) {
      expect(Math.abs(rot.local[3])).toBeCloseTo(1, 5);
    }
  });

  it("부모(머리·골반)가 Y축으로 회전해도 수직 아래(-Y)로 늘어진 체인 본의 로컬 회전은 역회전(비틀림)하지 않는다", () => {
    const compiled = compileChainModel([chainInputFixture({ segments: 4, direction: [0, -1, 0] })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const yaw90 = new Float32Array([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
    const rotations = backSolveChainRotations(compiled.compiled, createChainState(compiled.compiled), 0, { rootParentRotations: yaw90 });
    for (const rot of rotations) {
      expect(Math.abs(rot.local[0])).toBeLessThan(1e-5);
      expect(Math.abs(rot.local[1])).toBeLessThan(1e-5);
      expect(Math.abs(rot.local[2])).toBeLessThan(1e-5);
      expect(Math.abs(rot.local[3])).toBeCloseTo(1, 5);
    }
  });

  it("최소 재현 픽스처 1(seed=0x5eed0001): 거의 평행한 미세 편향(θ=4e-4 rad)에서도 데드존 없이 FK 말단 오차 ≤ 1e-5를 유지한다", () => {
    // [수정 전 결함] d = cos(4e-4) = 1 - 8e-8 ≥ fround(1 - 1e-7) 이어서 swing이 항등 [0,0,0,1]로 무시되었고,
    // 8세그먼트(세그먼트 길이 0.1m, 총 0.8m) 말단에서 FK 재구성 오차가 3.2e-4 > 1e-4로 계약을 위반함.
    // [수정 후] d ≥ 0 전 구간에서 데드존 없이 [c, 1 + d]를 정규화하여 FK 말단 오차가 ≤ 1e-5로 수렴함.
    const segments = 8;
    const segmentLength = 0.1;
    const compiled = compileChainModel([chainInputFixture({ id: "near-zero", segments, segmentLength, direction: [0, -1, 0] })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);

    const state = createChainState(compiled.compiled);
    const theta = 4e-4;
    const dirX = Math.sin(theta);
    const dirY = -Math.cos(theta);
    for (let j = 1; j <= segments; j += 1) {
      state.pos[j * 3] = state.pos[(j - 1) * 3] + dirX * segmentLength;
      state.pos[j * 3 + 1] = state.pos[(j - 1) * 3 + 1] + dirY * segmentLength;
      state.pos[j * 3 + 2] = 0;
    }

    const rotations = backSolveChainRotations(compiled.compiled, state, 0);
    const fk = forwardKinematicsFromRotations(compiled.compiled, state, 0, rotations);
    const tip = segments * 3;
    const tipErr = Math.hypot(
      fk[tip] - state.pos[tip],
      fk[tip + 1] - state.pos[tip + 1],
      fk[tip + 2] - state.pos[tip + 2],
    );
    expect(tipErr).toBeLessThanOrEqual(1e-5);
  });

  it("최소 재현 픽스처 2(seed=0x5eed0180): 180° 경계 근처(π - θ = 3.4e-4 rad)와 정확히 180° 반전에서도 상쇄 오차 없이 FK 말단 오차 ≤ 1e-5를 유지한다", () => {
    // [수정 전 결함] rest=[0,-1,0]에서 YZ 평면으로 π - 3.4e-4 rad 꺾인 경우 f32 내적 d = -1.0 ≤ fround(-1 + 1e-7)가 되어
    // 외적 c = [-3.4e-4, 0, 0]을 버리고 anyPerpendicular([0, 0, 1, 0])로 축이 90° 점프하며,
    // 10세그먼트(길이 0.1m, 총 1.0m) 말단에서 FK 재구성 오차가 3.4e-4 > 1e-4로 계약을 위반함.
    // [수정 후] d < 0, ‖c‖ > 0에서 상쇄 없는 [ĉ·(1 - d), ‖c‖] 반각 식을 써서 FK 말단 오차 ≤ 1e-5 달성.
    const segments = 10;
    const segmentLength = 0.1;
    const compiled = compileChainModel([chainInputFixture({ id: "near-180", segments, segmentLength, direction: [0, -1, 0] })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);

    const state = createChainState(compiled.compiled);
    const delta = 3.4e-4;
    const dirY = Math.cos(delta);
    const dirZ = Math.sin(delta);
    for (let j = 1; j <= segments; j += 1) {
      state.pos[j * 3] = state.pos[(j - 1) * 3];
      state.pos[j * 3 + 1] = state.pos[(j - 1) * 3 + 1] + dirY * segmentLength;
      state.pos[j * 3 + 2] = state.pos[(j - 1) * 3 + 2] + dirZ * segmentLength;
    }

    const rotations = backSolveChainRotations(compiled.compiled, state, 0);
    const fk = forwardKinematicsFromRotations(compiled.compiled, state, 0, rotations);
    const tip = segments * 3;
    const near180Err = Math.hypot(
      fk[tip] - state.pos[tip],
      fk[tip + 1] - state.pos[tip + 1],
      fk[tip + 2] - state.pos[tip + 2],
    );
    expect(near180Err).toBeLessThanOrEqual(1e-5);

    // 정확히 180° 반전(cLen === 0)도 결정적 수직축으로 재구성 오차 ≤ 1e-5
    for (let j = 1; j <= segments; j += 1) {
      state.pos[j * 3] = state.pos[(j - 1) * 3];
      state.pos[j * 3 + 1] = state.pos[(j - 1) * 3 + 1] + segmentLength;
      state.pos[j * 3 + 2] = state.pos[(j - 1) * 3 + 2];
    }
    const exact180Rot = backSolveChainRotations(compiled.compiled, state, 0);
    const exact180Fk = forwardKinematicsFromRotations(compiled.compiled, state, 0, exact180Rot);
    const exact180Err = Math.hypot(
      exact180Fk[tip] - state.pos[tip],
      exact180Fk[tip + 1] - state.pos[tip + 1],
      exact180Fk[tip + 2] - state.pos[tip + 2],
    );
    expect(exact180Err).toBeLessThanOrEqual(1e-5);
  });

  it("최소 재현 픽스처 3(seed=0x5eed0000): 시뮬 상태 중 0 길이로 겹친 중간 세그먼트는 baseRoot로 튀지 않고 직전 월드 회전을 유지한다", () => {
    // [수정 전 결함] 중간 입자 j와 j+1의 위치가 같을 때 simDir=[0,0,0]이 되어 swing=[0,0,0,1], world=baseRoot로 되돌아가며
    // 이전 세그먼트가 회전된 상태에서 갑자기 역방향 로컬 회전이 발생함.
    // [수정 후] 퇴화 세그먼트는 말단 본과 동일하게 lastWorld를 이어받아 local=[0,0,0,1]을 유지함.
    const segments = 4;
    const segmentLength = 0.1;
    const compiled = compileChainModel([chainInputFixture({ id: "collapsed-seg", segments, segmentLength, direction: [0, -1, 0] })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);

    const state = createChainState(compiled.compiled);
    // 세그먼트 0→1은 +X 방향으로 90° 꺾임
    state.pos[3] = state.pos[0] + segmentLength;
    state.pos[4] = state.pos[1];
    state.pos[5] = state.pos[2];
    // 세그먼트 1→2는 길이 0으로 겹침(퇴화)
    state.pos[6] = state.pos[3];
    state.pos[7] = state.pos[4];
    state.pos[8] = state.pos[5];
    // 세그먼트 2→3, 3→4는 다시 +X 방향으로 진행
    for (let j = 3; j <= segments; j += 1) {
      state.pos[j * 3] = state.pos[(j - 1) * 3] + segmentLength;
      state.pos[j * 3 + 1] = state.pos[(j - 1) * 3 + 1];
      state.pos[j * 3 + 2] = state.pos[(j - 1) * 3 + 2];
    }

    const rotations = backSolveChainRotations(compiled.compiled, state, 0);
    // 본 1(0 길이 세그먼트 시작)은 본 0의 월드 회전을 그대로 이어받아 로컬 회전이 항등이어야 한다
    expect(rotations[1]?.world).toEqual(rotations[0]?.world);
    expect(Math.abs(rotations[1]?.local[0] ?? 1)).toBeLessThan(1e-5);
    expect(Math.abs(rotations[1]?.local[1] ?? 1)).toBeLessThan(1e-5);
    expect(Math.abs(rotations[1]?.local[2] ?? 1)).toBeLessThan(1e-5);
    expect(Math.abs((rotations[1]?.local[3] ?? 0) - 1)).toBeLessThan(1e-5);
  });

  it("시드 기반 성질·메타모픽 회귀(seed=0x20261106, 48회): 임의 체인·비항등 rest/부모 회전·경계 각도에서 FK 재구성·왕복 멱등성·단위 노름을 만족한다", () => {
    const prng = createPrng(0x20261106);

    for (let trial = 0; trial < 48; trial += 1) {
      const segments = 2 + prng.nextInt(11); // 2..12
      const segmentLength = prng.nextRange(0.03, 0.15);
      const restDir = randomUnitVec3(prng);
      const rootRestRotation = randomQuat(prng);
      const root: Vec3 = [prng.nextRange(-0.5, 0.5), prng.nextRange(0.5, 2.0), prng.nextRange(-0.5, 0.5)];

      const compiledRes = compileChainModel([
        {
          ...chainInputFixture({ id: `prop-${trial}`, root, segments, segmentLength, direction: restDir }),
          rootRestRotation,
        },
      ]);
      expect(compiledRes.ok).toBe(true);
      if (!compiledRes.ok) continue;

      const { compiled } = compiledRes;
      const state = createChainState(compiled);
      state.pos[0] = Math.fround(root[0] + prng.nextRange(-0.1, 0.1));
      state.pos[1] = Math.fround(root[1] + prng.nextRange(-0.1, 0.1));
      state.pos[2] = Math.fround(root[2] + prng.nextRange(-0.1, 0.1));

      for (let j = 1; j <= segments; j += 1) {
        const segLen = compiled.model.restLength[j] ?? segmentLength;
        let dir: Vec3;
        const mode = (trial + j) % 5;
        if (mode === 0) {
          // 거의 평행(미세 편향)
          const eps = prng.nextRange(1e-5, 1e-3);
          const perp = randomUnitVec3(prng);
          const rx = restDir[0] + perp[0] * eps;
          const ry = restDir[1] + perp[1] * eps;
          const rz = restDir[2] + perp[2] * eps;
          const l = Math.hypot(rx, ry, rz);
          dir = [rx / l, ry / l, rz / l];
        } else if (mode === 1) {
          // 180° 경계 근처
          const eps = prng.nextRange(1e-5, 1e-3);
          const perp = randomUnitVec3(prng);
          const rx = -restDir[0] + perp[0] * eps;
          const ry = -restDir[1] + perp[1] * eps;
          const rz = -restDir[2] + perp[2] * eps;
          const l = Math.hypot(rx, ry, rz);
          dir = [rx / l, ry / l, rz / l];
        } else {
          dir = randomUnitVec3(prng);
        }
        state.pos[j * 3] = Math.fround(state.pos[(j - 1) * 3] + dir[0] * segLen);
        state.pos[j * 3 + 1] = Math.fround(state.pos[(j - 1) * 3 + 1] + dir[1] * segLen);
        state.pos[j * 3 + 2] = Math.fround(state.pos[(j - 1) * 3 + 2] + dir[2] * segLen);
      }

      // 비정규화 스케일이 섞인 부모 월드 회전
      const parentQuat = randomQuat(prng);
      const scale = Math.pow(10, prng.nextRange(-2, 2));
      const rootParentRotations = new Float32Array([
        parentQuat[0] * scale,
        parentQuat[1] * scale,
        parentQuat[2] * scale,
        parentQuat[3] * scale,
      ]);

      const posSnapshot = state.pos.slice();
      const parentSnapshot = rootParentRotations.slice();

      const rotations = backSolveChainRotations(compiled, state, 0, { rootParentRotations });
      expect(rotations.length).toBe(segments + 1);

      // 입력 불변성 검증
      expect(state.pos).toEqual(posSnapshot);
      expect(rootParentRotations).toEqual(parentSnapshot);

      for (const rot of rotations) {
        const localNorm = Math.hypot(rot.local[0], rot.local[1], rot.local[2], rot.local[3]);
        const worldNorm = Math.hypot(rot.world[0], rot.world[1], rot.world[2], rot.world[3]);
        expect(Number.isFinite(localNorm)).toBe(true);
        expect(Number.isFinite(worldNorm)).toBe(true);
        expect(Math.abs(localNorm - 1)).toBeLessThan(1e-5);
        expect(Math.abs(worldNorm - 1)).toBeLessThan(1e-5);
      }

      const fk = forwardKinematicsFromRotations(compiled, state, 0, rotations);
      expect(hasNonFinite(fk)).toBe(false);

      // 모든 입자 위치와 세그먼트 길이가 정밀하게 재구성되어야 한다
      for (let j = 0; j <= segments; j += 1) {
        const err = Math.hypot(
          fk[j * 3] - state.pos[j * 3],
          fk[j * 3 + 1] - state.pos[j * 3 + 1],
          fk[j * 3 + 2] - state.pos[j * 3 + 2],
        );
        expect(err).toBeLessThanOrEqual(1e-4);
        if (j >= 1) {
          const fkSegLen = Math.hypot(
            fk[j * 3] - fk[(j - 1) * 3],
            fk[j * 3 + 1] - fk[(j - 1) * 3 + 1],
            fk[j * 3 + 2] - fk[(j - 1) * 3 + 2],
          );
          expect(Math.abs(fkSegLen - (compiled.model.restLength[j] ?? segmentLength))).toBeLessThanOrEqual(1e-5);
        }
      }

      // 왕복 멱등성: 재구성된 FK 위치로 다시 역산 → FK를 돌려도 위치가 드리프트하지 않는다
      const roundtripState: ChainState = { pos: fk, prev: fk.slice(), stepIndex: 1 };
      const rotations2 = backSolveChainRotations(compiled, roundtripState, 0, { rootParentRotations });
      const fk2 = forwardKinematicsFromRotations(compiled, roundtripState, 0, rotations2);
      for (let k = 0; k < fk.length; k += 1) {
        expect(Math.abs((fk2[k] ?? 0) - (fk[k] ?? 0))).toBeLessThanOrEqual(1e-5);
      }
    }
  });

  it("유효하지 않은 chainIndex(음수·범위 초과·비정수·NaN)는 명시적으로 RangeError를 던지고, 비유한 루트 위치에서도 FK는 유한 출력을 보장한다", () => {
    const compiled = compileChainModel([chainInputFixture({ segments: 3, direction: [0, -1, 0] })]);
    if (!compiled.ok) throw new Error(compiled.failure.reasonKo);
    const state = createChainState(compiled.compiled);

    for (const invalidIndex of [-1, 1, 99, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => backSolveChainRotations(compiled.compiled, state, invalidIndex)).toThrow(RangeError);
      expect(() => forwardKinematicsFromRotations(compiled.compiled, state, invalidIndex, [])).toThrow(RangeError);
    }

    // 루트 입자 위치에 NaN이 들어와도 forwardKinematicsFromRotations는 restPositions로 폴백하고 비정규화 world 회전도 정규화한다
    state.pos[0] = Number.NaN;
    const rotations = backSolveChainRotations(compiled.compiled, state, 0);
    const unnormalizedRotations = rotations.map((rot) => ({
      ...rot,
      world: [rot.world[0] * 100, rot.world[1] * 100, rot.world[2] * 100, rot.world[3] * 100] as const,
    }));
    const fk = forwardKinematicsFromRotations(compiled.compiled, state, 0, unnormalizedRotations);
    expect(hasNonFinite(fk)).toBe(false);
    expect(fk[0]).toBeCloseTo(compiled.compiled.restPositions[0] ?? 0, 5);
  });
});

interface ScratchSnapshot {
  readonly lambdaDist: Float32Array;
  readonly lambdaBend: Float32Array;
  readonly rootStart: Float32Array;
  readonly restDirWorld: Float32Array;
  readonly startPos: Float32Array;
}

function snapshotScratch(scratch: ChainScratch): ScratchSnapshot {
  return {
    lambdaDist: scratch.lambdaDist.slice(),
    lambdaBend: scratch.lambdaBend.slice(),
    rootStart: scratch.rootStart.slice(),
    restDirWorld: scratch.restDirWorld.slice(),
    startPos: scratch.startPos.slice(),
  };
}

function cloneRotations(rotations: readonly ChainBoneRotation[]): ChainBoneRotation[] {
  return rotations.map((rot) => ({
    bone: rot.bone,
    local: [rot.local[0], rot.local[1], rot.local[2], rot.local[3]] as const,
    world: [rot.world[0], rot.world[1], rot.world[2], rot.world[3]] as const,
  }));
}

describe("caller integration contract: pbd-chain / chain-solver buffer isolation & recovery", () => {
  const multiChainAnchors: readonly ChainAnchor[] = [
    chainAnchorFixture({
      id: "hair-front-l",
      role: "hair",
      root: [0.08, 1.68, 0.06],
      segments: 5,
      segmentLength: 0.05,
      direction: [0.1, -0.98, 0.17],
    }),
    chainAnchorFixture({
      id: "hair-back",
      role: "hair",
      root: [0, 1.66, -0.08],
      segments: 6,
      segmentLength: 0.06,
      direction: [0, -0.95, -0.31],
    }),
    chainAnchorFixture({
      id: "skirt-hemline",
      role: "skirt",
      root: [0, 0.92, 0.04],
      segments: 4,
      segmentLength: 0.07,
      direction: [0.15, -0.97, 0.19],
    }),
  ];

  const multiChainColliders: readonly CapsuleCollider[] = [
    headColliderFixture(0.09),
    { bone: "hips", a: [0, -0.05, 0], b: [0, 0.08, 0], radius: 0.11 },
  ];

  const windFixture: WindInput = { dir: [1, 0, 0.25], strength: 0.85, seed: 20261106 };

  it("저수준 stepChainsInto · settleChains 파이프라인에서 RangeError 예외 발생 전후로 state · scratch · 콜라이더 · 부모 회전 버퍼가 100% 보존되고 다음 프레임에서 대조군과 완벽히 일치한다", () => {
    const compiledRes = compileChainModel(chainInputsFromAnchors(multiChainAnchors));
    expect(compiledRes.ok).toBe(true);
    if (!compiledRes.ok) return;
    const { compiled } = compiledRes;
    expect(compiled.model.chainCount).toBe(3);

    // 실험군(예외 주입)과 대조군(clean control run) 상태·스크래치·콜라이더 준비
    let state = createChainState(compiled);
    let controlState = createChainState(compiled);
    const scratch = createChainScratch(compiled);
    const controlScratch = createChainScratch(compiled);

    const capsules = createCapsuleSet(2);
    const controlCapsules = createCapsuleSet(2);
    for (const set of [capsules, controlCapsules]) {
      writeCapsule(set, 0, [0, 1.62, 0], [0, 1.74, 0], 0.09);
      writeCapsule(set, 1, [0, 0.88, 0], [0, 1.01, 0], 0.11);
      resetCapsuleHistory(set);
    }

    const rootPositions = new Float32Array([
      0.02, 1.65, -0.09,
      0.09, 1.67, 0.07,
      0.01, 0.92, 0.05,
    ]);
    const yaw15 = normalizeQuat([0, Math.sin(Math.PI / 24), 0, Math.cos(Math.PI / 24)]);
    const pitch10 = normalizeQuat([Math.sin(Math.PI / 36), 0, 0, Math.cos(Math.PI / 36)]);
    const roll8 = normalizeQuat([0, 0, Math.sin(Math.PI / 45), Math.cos(Math.PI / 45)]);
    const rootRotations = new Float32Array([...yaw15, ...pitch10, ...roll8]);
    const rootParentRotations = new Float32Array([...yaw15, ...pitch10, ...roll8]);

    const dt = 1 / 120;
    const substeps = 2;
    const iterations = 2;

    // 1. 초기 settle + 2프레임 step 실행 (실험군 & 대조군 동일 진행)
    state = settleChains(
      compiled,
      state,
      { dt, substeps, iterations, rootPositions, rootRotations, capsules, wind: windFixture },
      { maxSteps: 24 },
      scratch,
    ).state;
    controlState = settleChains(
      compiled,
      controlState,
      { dt, substeps, iterations, rootPositions, rootRotations, capsules: controlCapsules, wind: windFixture },
      { maxSteps: 24 },
      controlScratch,
    ).state;

    for (let frame = 0; frame < 2; frame += 1) {
      const headShift: Vec3 = [0.01 * (frame + 1), 1.62, 0.005 * (frame + 1)];
      const tailShift: Vec3 = [0.01 * (frame + 1), 1.74, 0.005 * (frame + 1)];
      writeCapsule(capsules, 0, headShift, tailShift, 0.09);
      writeCapsule(controlCapsules, 0, headShift, tailShift, 0.09);

      stepChainsInto(
        compiled,
        state,
        { dt, substeps, iterations, rootPositions, rootRotations, capsules, wind: windFixture },
        { pos: state.pos, prev: state.prev },
        scratch,
      );
      state = { pos: state.pos, prev: state.prev, stepIndex: state.stepIndex + 1 };
      commitCapsuleSet(capsules);

      stepChainsInto(
        compiled,
        controlState,
        { dt, substeps, iterations, rootPositions, rootRotations, capsules: controlCapsules, wind: windFixture },
        { pos: controlState.pos, prev: controlState.prev },
        controlScratch,
      );
      controlState = { pos: controlState.pos, prev: controlState.prev, stepIndex: controlState.stepIndex + 1 };
      commitCapsuleSet(controlCapsules);
    }

    const baselineRotations = [0, 1, 2].map((c) =>
      backSolveChainRotations(compiled, state, c, { rootParentRotations }),
    );
    const baselineFk = [0, 1, 2].map((c) =>
      forwardKinematicsFromRotations(compiled, state, c, baselineRotations[c] ?? []),
    );

    // 예외 발생 전 전체 버퍼 스냅샷
    const posBefore = state.pos.slice();
    const prevBefore = state.prev.slice();
    const stepIndexBefore = state.stepIndex;
    const scratchBefore = snapshotScratch(scratch);
    const capsuleHeadBefore = capsules.head.slice();
    const capsuleTailBefore = capsules.tail.slice();
    const capsulePrevHeadBefore = capsules.prevHead.slice();
    const capsulePrevTailBefore = capsules.prevTail.slice();
    const capsuleRadiusBefore = capsules.radius.slice();
    const rootPositionsBefore = rootPositions.slice();
    const rootRotationsBefore = rootRotations.slice();
    const rootParentRotationsBefore = rootParentRotations.slice();
    const rotationsBefore = baselineRotations.map(cloneRotations);
    const fkBefore = baselineFk.map((arr) => arr.slice());

    // 2. 잘못된 체인 인덱스 주입 → RangeError
    const invalidChainIndices = [
      -1,
      compiled.model.chainCount,
      compiled.model.chainCount + 5,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    for (const invalidIndex of invalidChainIndices) {
      expect(() => backSolveChainRotations(compiled, state, invalidIndex, { rootParentRotations })).toThrow(RangeError);
      expect(() =>
        forwardKinematicsFromRotations(compiled, state, invalidIndex, baselineRotations[0] ?? []),
      ).toThrow(RangeError);
    }

    // 3. 예외 발생 전후 모든 상태·스크래치·콜라이더·입력·출력 버퍼 무오염 검증
    expect(state.pos).toEqual(posBefore);
    expect(state.prev).toEqual(prevBefore);
    expect(state.stepIndex).toBe(stepIndexBefore);
    expect(snapshotScratch(scratch)).toEqual(scratchBefore);
    expect(capsules.head).toEqual(capsuleHeadBefore);
    expect(capsules.tail).toEqual(capsuleTailBefore);
    expect(capsules.prevHead).toEqual(capsulePrevHeadBefore);
    expect(capsules.prevTail).toEqual(capsulePrevTailBefore);
    expect(capsules.radius).toEqual(capsuleRadiusBefore);
    expect(rootPositions).toEqual(rootPositionsBefore);
    expect(rootRotations).toEqual(rootRotationsBefore);
    expect(rootParentRotations).toEqual(rootParentRotationsBefore);
    expect(baselineRotations).toEqual(rotationsBefore);
    expect(baselineFk).toEqual(fkBefore);

    // 4. 실패 후 다음 정상 프레임 완벽 복구 검증 (동일 state & scratch 재사용 vs 대조군)
    const nextRootPositions = new Float32Array([
      0.04, 1.65, -0.07,
      0.11, 1.67, 0.08,
      0.02, 0.92, 0.06,
    ]);
    stepChainsInto(
      compiled,
      state,
      { dt, substeps, iterations, rootPositions: nextRootPositions, rootRotations, capsules, wind: windFixture },
      { pos: state.pos, prev: state.prev },
      scratch,
    );
    state = { pos: state.pos, prev: state.prev, stepIndex: state.stepIndex + 1 };

    stepChainsInto(
      compiled,
      controlState,
      {
        dt,
        substeps,
        iterations,
        rootPositions: nextRootPositions,
        rootRotations,
        capsules: controlCapsules,
        wind: windFixture,
      },
      { pos: controlState.pos, prev: controlState.prev },
      controlScratch,
    );
    controlState = { pos: controlState.pos, prev: controlState.prev, stepIndex: controlState.stepIndex + 1 };

    expect(state.pos).toEqual(controlState.pos);
    expect(state.prev).toEqual(controlState.prev);
    expect(state.stepIndex).toBe(controlState.stepIndex);
    expect(snapshotScratch(scratch)).toEqual(snapshotScratch(controlScratch));

    for (let c = 0; c < compiled.model.chainCount; c += 1) {
      const recoveredRot = backSolveChainRotations(compiled, state, c, { rootParentRotations });
      const controlRot = backSolveChainRotations(compiled, controlState, c, { rootParentRotations });
      expect(recoveredRot).toEqual(controlRot);

      const recoveredFk = forwardKinematicsFromRotations(compiled, state, c, recoveredRot);
      const controlFk = forwardKinematicsFromRotations(compiled, controlState, c, controlRot);
      expect(recoveredFk).toEqual(controlFk);
      expect(hasNonFinite(recoveredFk)).toBe(false);
    }
  });

  it("고수준 createPbdChainSolver 파사드에서 미존재 체인 조회(Error) 및 하위 RangeError 발생 후에도 솔버 상태·해시·본 회전이 대조군과 100% 일치한다", () => {
    const solverRes = createPbdChainSolver(multiChainAnchors, multiChainColliders, {
      dt: 1 / 120,
      substeps: 2,
      iterations: 2,
      wind: windFixture,
    });
    const controlRes = createPbdChainSolver(multiChainAnchors, multiChainColliders, {
      dt: 1 / 120,
      substeps: 2,
      iterations: 2,
      wind: windFixture,
    });
    expect(solverRes.ok).toBe(true);
    expect(controlRes.ok).toBe(true);
    if (!solverRes.ok || !controlRes.ok) return;

    const { solver } = solverRes;
    const { solver: controlSolver } = controlRes;
    const chainIds = ["hair-front-l", "hair-back", "skirt-hemline"] as const;

    const applyBoneTransforms = (target: typeof solver, yawRad: number, shiftX: number): void => {
      const q = normalizeQuat([0, Math.sin(yawRad * 0.5), 0, Math.cos(yawRad * 0.5)]);
      target.setBoneWorld("head", [shiftX, 1.62, 0], q);
      target.setBoneWorld("hips", [shiftX * 0.5, 0.95, 0], q);
      for (const anchor of multiChainAnchors) {
        const rootBone = anchor.boneNames[0] ?? anchor.id;
        const rootPos = anchor.restPoints[0] ?? [0, 1.5, 0];
        target.setBoneWorld(rootBone, [rootPos[0] + shiftX, rootPos[1], rootPos[2]], q);
      }
    };

    // 1. 정상 시뮬레이션(settle + step)
    applyBoneTransforms(solver, 0.25, 0.02);
    applyBoneTransforms(controlSolver, 0.25, 0.02);
    expect(solver.pendingColliderBones()).toEqual([]);

    const settleReceipt = solver.settle(20);
    const controlSettleReceipt = controlSolver.settle(20);
    expect(settleReceipt).toEqual(controlSettleReceipt);

    applyBoneTransforms(solver, 0.35, 0.04);
    applyBoneTransforms(controlSolver, 0.35, 0.04);
    expect(solver.step()).toEqual(controlSolver.step());

    // 예외 발생 전 스냅샷
    const stateBefore = solver.state();
    const positionsBefore = solver.positions();
    const hashBefore = solver.stateHash();
    const rotationsBefore = chainIds.map((id) => cloneRotations(solver.boneRotations(id)));
    const sliceBefore = chainIds.map((id) => solver.readChainPositions(id).slice());

    // 2. 잘못된 체인 id 및 인덱스 예외 주입
    expect(() => solver.boneRotations("non-existent-chain")).toThrow(Error);
    expect(() => solver.boneRotations("")).toThrow(Error);
    expect(() => solver.readChainPositions("non-existent-chain")).toThrow(Error);
    for (const invalidIndex of [-1, solver.compiled.model.chainCount, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => backSolveChainRotations(solver.compiled, stateBefore, invalidIndex)).toThrow(RangeError);
      expect(() =>
        forwardKinematicsFromRotations(solver.compiled, stateBefore, invalidIndex, rotationsBefore[0] ?? []),
      ).toThrow(RangeError);
    }

    // 3. 예외 직후 솔버 내부 버퍼 및 스냅샷 무결성 확인
    expect(solver.state()).toEqual(stateBefore);
    expect(solver.positions()).toEqual(positionsBefore);
    expect(solver.stateHash()).toBe(hashBefore);
    chainIds.forEach((id, idx) => {
      expect(solver.boneRotations(id)).toEqual(rotationsBefore[idx]);
      expect(solver.readChainPositions(id)).toEqual(sliceBefore[idx]);
    });

    // 4. 다음 프레임 step + settle 복구 및 대조군(clean control) 일치 검증
    applyBoneTransforms(solver, -0.2, -0.03);
    applyBoneTransforms(controlSolver, -0.2, -0.03);
    expect(solver.step()).toEqual(controlSolver.step());
    expect(solver.settle(16)).toEqual(controlSolver.settle(16));

    expect(solver.state()).toEqual(controlSolver.state());
    expect(solver.positions()).toEqual(controlSolver.positions());
    expect(solver.stateHash()).toBe(controlSolver.stateHash());
    for (const id of chainIds) {
      const recovered = solver.boneRotations(id);
      const control = controlSolver.boneRotations(id);
      expect(recovered).toEqual(control);
      expect(solver.readChainPositions(id)).toEqual(controlSolver.readChainPositions(id));
    }
  });
});

