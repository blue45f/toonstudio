import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_EYE_GAZE, DEFAULT_FRAMING } from "../contracts";
import { eyeAnglesQuaternion } from "../contracts/eye-gaze";
import { qConjugate, qFromEulerXYZ, qMultiply, qRotateVec3, v3Dot, v3Normalize, v3Sub } from "../shared/math";
import { parseGlb } from "../testing/minimal-glb";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { createEyeGazeFixture } from "./testing/eye-gaze-fixture";
import { applyRigEyeGaze, applyRigPlan, bindFixtureRig, createNullEngineHarness, installFakeReadback, readRigEyeGaze, rigBoneWorld } from "./testing/null-engine-harness";

import type { ApplyPlan, Quat } from "../contracts";
import type { NullEngineHarness } from "./testing/null-engine-harness";

const harnesses: NullEngineHarness[] = [];
let undoReadback: (() => void) | undefined;
afterEach(() => { undoReadback?.(); undoReadback = undefined; harnesses.splice(0).forEach((h) => h.dispose()); });
async function setup(lane: "null" | "webgl2" = "null") {
  const harness = await createNullEngineHarness({ lane, awaitShaderCompile: false });
  harnesses.push(harness);
  await harness.engine.loadSource({ kind: "procedural", model: createEyeGazeFixture() });
  return harness.engine;
}
function cameraPlan(): ApplyPlan { return applyPlanFixture({ eyeGaze: { ...DEFAULT_EYE_GAZE, mode: "camera" } }); }

describe("실제 안구 본과 메인 카메라", () => {
  it.each(["bone-local", "model-space"] as const)("%s: 머리·눈 rest 축이 회전돼도 실제 시선과 양안 고정은 동일하다", (poseConvention) => {
    const model = createEyeGazeFixture(qFromEulerXYZ(0.3, -0.4, 0.2));
    const bound = bindFixtureRig({ ...model, skeleton: { bones: model.skeleton.bones.map((bone) => bone.name === "head" ? { ...bone, restRotation: qFromEulerXYZ(0.1, -0.2, 0.05) } : bone) } });
    const rig = { ...bound.rig, poseConvention };
    try {
      const head = eyeAnglesQuaternion({ yawDeg: 7, pitchDeg: -3 });
      const camera = [0.05, 1.7, 1.5] as const;
      applyRigPlan(rig, { ...cameraPlan(), boneRotations: { head } }, { outlinesVisible: false });
      applyRigEyeGaze(rig, cameraPlan().eyeGaze, camera);
      for (const name of ["leftEye", "rightEye"] as const) {
        const eye = rig.humanoid.get(name);
        if (!eye) throw new Error("눈 본이 필요합니다.");
        const world = rigBoneWorld(eye);
        const forward = qRotateVec3(qMultiply(world.rotation, qConjugate(eye.restWorld)), [0, 0, 1]);
        expect(v3Dot(forward, v3Normalize(v3Sub(camera, world.position)))).toBeGreaterThan(0.999);
      }
      const current = readRigEyeGaze(rig);
      if (current.status !== "available") throw new Error(current.reasonKo);
      const frozenGaze = { mode: "manual" as const, symmetry: false, left: current.left, right: current.right, frozenPose: current.frozenPose };
      applyRigPlan(rig, applyPlanFixture({ eyeGaze: frozenGaze, boneRotations: { head, ...current.frozenPose } }), { outlinesVisible: false });
      applyRigEyeGaze(rig, frozenGaze, [-1, 3, 0.2]);
      const after = readRigEyeGaze(rig);
      if (after.status !== "available") throw new Error(after.reasonKo);
      for (const name of ["leftEye", "rightEye"] as const) after.frozenPose[name].forEach((value, index) => expect(value).toBeCloseTo(current.frozenPose[name][index] ?? 0, 12));
    } finally { bound.dispose(); }
  });

  it("수동 좌우 회전은 실제 스킨 본과 내보낸 GLB 노드 회전에 남는다", async () => {
    const engine = await setup();
    const left = eyeAnglesQuaternion({ yawDeg: 18, pitchDeg: -7 }), right = eyeAnglesQuaternion({ yawDeg: -18, pitchDeg: -7 });
    engine.applyPlan(applyPlanFixture({ boneRotations: { leftEye: left, rightEye: right }, eyeGaze: { ...DEFAULT_EYE_GAZE, left: { yawDeg: 18, pitchDeg: -7 }, right: { yawDeg: -18, pitchDeg: -7 } } }));
    expect(engine.readBone("leftEye")?.localRotation).toEqual(left);
    expect(engine.readBone("rightEye")?.localRotation).toEqual(right);
    const json = parseGlb(await engine.exportGlb()).json as { nodes?: Array<{ name?: string; rotation?: number[] }> };
    const rotation = json.nodes?.find((node) => node.name === "bone:leftEye")?.rotation;
    expect(rotation).toBeDefined();
    rotation?.forEach((value, index) => expect(value).toBeCloseTo(left[index] ?? 0, 6));
  });

  it("카메라 이동은 눈 본을 바꾸고 머리 회전은 유지한다. 실제 눈 방향이 카메라를 향한다", async () => {
    const engine = await setup();
    const head = eyeAnglesQuaternion({ yawDeg: 8, pitchDeg: 0 });
    engine.setCamera({ ...DEFAULT_FRAMING, mode: "face", yawDeg: 12, pitchDeg: 0 });
    engine.applyPlan({ ...cameraPlan(), boneRotations: { head } });
    const before = engine.readBone("leftEye")?.localRotation;
    engine.setCamera({ ...DEFAULT_FRAMING, mode: "face", yawDeg: -8, pitchDeg: 0 });
    engine.renderFrame();
    expect(engine.readBone("leftEye")?.localRotation).not.toEqual(before);
    engine.readBone("head")?.localRotation.forEach((value, index) => expect(value).toBeCloseTo(head[index] ?? 0, 12));
    for (const name of ["leftEye", "rightEye"]) {
      const eye = engine.readBone(name);
      if (!eye) throw new Error("눈 본이 필요합니다.");
      const forward = qRotateVec3(eye.rotation, [0, 0, 1]);
      const target = v3Normalize(v3Sub(engine.viewportCamera().position, eye.position));
      expect(v3Dot(forward, target)).toBeGreaterThan(0.999);
    }
  });

  it("회전된 눈 rest 축에서도 응시·양안 고정·GLB export가 실제 회전을 보존한다", async () => {
    const harness = await createNullEngineHarness(); harnesses.push(harness);
    const engine = harness.engine;
    const rest = qFromEulerXYZ(0.3, -0.4, 0.2);
    await engine.loadSource({ kind: "procedural", model: createEyeGazeFixture(rest) });
    const head = eyeAnglesQuaternion({ yawDeg: 6, pitchDeg: -3 });
    engine.setCamera({ ...DEFAULT_FRAMING, mode: "face", yawDeg: 3 });
    engine.applyPlan({ ...cameraPlan(), boneRotations: { head } });
    const rotations: Quat[] = [];
    for (const name of ["leftEye", "rightEye"]) {
      const eye = engine.readBone(name);
      if (!eye) throw new Error("눈 본이 필요합니다.");
      rotations.push(eye.localRotation);
      const forward = qRotateVec3(qMultiply(eye.rotation, qConjugate(rest)), [0, 0, 1]);
      expect(v3Dot(forward, v3Normalize(v3Sub(engine.viewportCamera().position, eye.position)))).toBeGreaterThan(0.999);
    }
    const current = engine.eyeGaze();
    if (current.status !== "available") throw new Error(current.reasonKo);
    expect(current.left.yawDeg).not.toBeCloseTo(-current.right.yawDeg, 3);
    engine.applyPlan(applyPlanFixture({ boneRotations: { head, ...current.frozenPose }, eyeGaze: { mode: "manual", symmetry: false, left: current.left, right: current.right, frozenPose: current.frozenPose } }));
    engine.setCamera({ ...DEFAULT_FRAMING, yawDeg: -20 }); engine.renderFrame();
    for (const [index, name] of ["leftEye", "rightEye"].entries()) {
      engine.readBone(name)?.localRotation.forEach((value, component) => expect(value).toBeCloseTo(rotations[index]?.[component] ?? 0, 12));
    }
    engine.readBone("head")?.localRotation.forEach((value, index) => expect(value).toBeCloseTo(head[index] ?? 0, 12));
    const glb = parseGlb(await engine.exportGlb()).json as { nodes?: Array<{ name?: string; rotation?: number[] }> };
    glb.nodes?.find((node) => node.name === "bone:leftEye")?.rotation?.forEach((value, index) => expect(value).toBeCloseTo(rotations[0]?.[index] ?? 0, 6));
    engine.applyPlan({ ...cameraPlan(), boneRotations: { head } });
    engine.setCamera({ ...DEFAULT_FRAMING, mode: "face", yawDeg: 3 });
    const exported = parseGlb(await engine.exportGlb()).json as { nodes?: Array<{ name?: string; rotation?: number[] }> };
    const afterExport = engine.readBone("leftEye")?.localRotation;
    exported.nodes?.find((node) => node.name === "bone:leftEye")?.rotation?.forEach((value, index) => expect(value).toBeCloseTo(afterExport?.[index] ?? 0, 6));
    const beforeMove = engine.readBone("leftEye")?.localRotation;
    engine.setCamera({ ...DEFAULT_FRAMING, mode: "face", yawDeg: -10 }); engine.renderFrame();
    expect(engine.readBone("leftEye")?.localRotation).not.toEqual(beforeMove);
  });

  it("멀티패스 readback 대기 중 시선을 고정하고 성공·실패 후 추적을 복구한다", async () => {
    const engine = await setup("webgl2");
    engine.applyPlan(cameraPlan());
    let resolve: (bytes: Uint8Array) => void = () => { throw new Error("readback이 시작되지 않았습니다."); };
    let submitted = 0;
    undoReadback = installFakeReadback(() => { submitted += 1; return new Promise<Uint8Array>((done) => { resolve = done; }); });
    const capture = engine.renderPasses({ width: 8, height: 8, passes: ["flat"], transparentBackground: true, settleSteps: 0, camera: { ...DEFAULT_FRAMING, yawDeg: 70 } });
    await vi.waitFor(() => expect(submitted).toBe(1));
    const frozen = engine.readBone("leftEye")?.localRotation;
    engine.setCamera({ ...DEFAULT_FRAMING, yawDeg: 18 }); engine.renderFrame();
    expect(engine.readBone("leftEye")?.localRotation).toEqual(frozen);
    resolve(new Uint8Array(8 * 8 * 4)); await capture; engine.renderFrame();
    expect(engine.readBone("leftEye")?.localRotation).not.toEqual(frozen);
    undoReadback(); undoReadback = installFakeReadback(() => Promise.reject(new Error("readback failure")));
    await expect(engine.renderPasses({ width: 8, height: 8, passes: ["flat"], transparentBackground: true, settleSteps: 0 })).rejects.toBeTruthy();
    const afterFailure = engine.readBone("leftEye")?.localRotation;
    engine.setCamera({ ...DEFAULT_FRAMING, yawDeg: -18 }); engine.renderFrame();
    expect(engine.readBone("leftEye")?.localRotation).not.toEqual(afterFailure);
  });
});
