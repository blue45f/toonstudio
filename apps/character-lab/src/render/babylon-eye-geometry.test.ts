import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_EYE_GAZE, IDENTITY_QUAT } from "../contracts";

import { createEyeGazeFixture, createUnweightedEyeGazeFixture } from "./testing/eye-gaze-fixture";
import { buildKitFixture, buildKitGlb } from "./testing/kit-glb-fixture";
import { applyRigEyeGaze, bindFixtureRig, createNullEngineHarness, readRigEyeGaze } from "./testing/null-engine-harness";
import { createPackagePlanFixture } from "./testing/package-plan-fixture";

import type { HumanoidModelData } from "../contracts";
import type { KitGlbTweak } from "./testing/kit-glb-fixture";

const disposers: Array<() => void> = [];
afterEach(() => { disposers.splice(0).reverse().forEach((dispose) => dispose()); vi.restoreAllMocks(); });
function bind(model = createEyeGazeFixture()) {
  const fixture = bindFixtureRig(model); disposers.push(() => fixture.dispose()); return fixture;
}
function eyes(fixture: ReturnType<typeof bind>) {
  return fixture.rig.parts.filter((part) => part.role === "eyeball").flatMap((part) => part.meshes);
}
function deformedPositions(fixture: ReturnType<typeof bind>) {
  fixture.rig.skeleton?.prepare(true);
  return eyes(fixture).flatMap((mesh) => Array.from(mesh.getPositionData(true, false) ?? []));
}
async function engine(files = new Map<string, Uint8Array>()) {
  const h = await createNullEngineHarness({ verifyPackageSha: false, fetchBytes: async (url) => {
    const bytes = files.get(url); if (!bytes) throw new Error(`fixture URL 없음: ${url}`); return bytes;
  } });
  disposers.push(() => h.dispose()); return h;
}

describe("안구 시선의 실제 형상 연결 능력", () => {
  it("매핑만 있고 눈 스킨 영향이 없으면 거부하고, 유효한 24정점 눈 스킨의 실제 변형은 보존한다", () => {
    const zero = bind(createUnweightedEyeGazeFixture());
    const before = deformedPositions(zero);
    expect(readRigEyeGaze(zero.rig)).toMatchObject({ status: "unavailable", reasonKo: expect.stringContaining("왼쪽·오른쪽") });
    applyRigEyeGaze(zero.rig, { ...DEFAULT_EYE_GAZE, mode: "camera" }, [1, 1.7, 1]);
    expect(deformedPositions(zero)).toEqual(before);
    const positive = bind(); const positiveBefore = deformedPositions(positive);
    expect(readRigEyeGaze(positive.rig).status).toBe("available");
    applyRigEyeGaze(positive.rig, { ...DEFAULT_EYE_GAZE, mode: "camera" }, [1, 1.7, 1]);
    expect(deformedPositions(positive)).not.toEqual(positiveBefore);
  });

  it("눈·슬롯을 일시 숨겨도 지원은 유지하고, 영구 제외·해제된 메시만 남으면 거부한다", () => {
    const fixture = bind();
    for (const part of fixture.rig.parts.filter((part) => part.role === "eyeball")) {
      part.visible = false; for (const mesh of part.meshes) { mesh.isVisible = false; mesh.setEnabled(false); }
    }
    expect(readRigEyeGaze(fixture.rig).status).toBe("available");
    const hidden = { ...fixture.rig, parts: fixture.rig.parts.map((part) => part.role === "eyeball" ? { ...part, forceHidden: true } : part) };
    expect(readRigEyeGaze(hidden).status).toBe("unavailable");
    eyes(fixture).forEach((mesh) => mesh.dispose());
    expect(readRigEyeGaze(fixture.rig).status).toBe("unavailable");
  });

  it("눈 자신의 가중치가 0이어도 하위 보조 본의 양수 스킨은 실제 회전한다", () => {
    const base = createEyeGazeFixture();
    const model: HumanoidModelData = { ...base, skeleton: { bones: [...base.skeleton.bones,
      { name: "leftPupilAux", parent: "leftEye", restTranslation: [0, 0, 0], restRotation: IDENTITY_QUAT },
      { name: "rightPupilAux", parent: "rightEye", restTranslation: [0, 0, 0], restRotation: IDENTITY_QUAT },
    ] }, parts: base.parts.map((part) => part.role === "eyeball" && part.jointIndices ? { ...part,
      jointIndices: new Uint16Array(part.jointIndices.length).fill(base.skeleton.bones.length + (part.id.startsWith("left") ? 0 : 1)),
    } : part) };
    const fixture = bind(model); const before = deformedPositions(fixture);
    expect(readRigEyeGaze(fixture.rig).status).toBe("available");
    applyRigEyeGaze(fixture.rig, { ...DEFAULT_EYE_GAZE, mode: "camera" }, [-1, 1.7, 1]);
    expect(deformedPositions(fixture)).not.toEqual(before);
  });

  it.each(["linked-node", "bone"] as const)("스킨 없는 %s 부착 눈의 실제 월드 변환을 지원한다", (attachment) => {
    const fixture = bind(createUnweightedEyeGazeFixture());
    for (const mesh of eyes(fixture)) {
      const eye = fixture.rig.humanoid.get(mesh.name.startsWith("left") ? "leftEye" : "rightEye");
      if (!eye) throw new Error("눈 본 없음");
      mesh.skeleton = null;
      if (attachment === "bone") mesh.attachToBone(eye.bone, fixture.rig.root); else mesh.parent = eye.node;
    }
    fixture.rig.skeleton?.prepare(true);
    const before = eyes(fixture).map((mesh) => Array.from(mesh.computeWorldMatrix(true).asArray()));
    expect(readRigEyeGaze(fixture.rig).status).toBe("available");
    applyRigEyeGaze(fixture.rig, { ...DEFAULT_EYE_GAZE, mode: "camera" }, [-1, 1.7, 1]);
    fixture.rig.skeleton?.prepare(true);
    expect(eyes(fixture).map((mesh) => Array.from(mesh.computeWorldMatrix(true).asArray()))).not.toEqual(before);
    for (const mesh of eyes(fixture)) { if (attachment === "bone") mesh.detachFromBone(); else mesh.parent = fixture.rig.root; }
    expect(readRigEyeGaze(fixture.rig).status).toBe("unavailable");
  });

  it("활성 5~8번째 영향·CPU 스킨을 지원하되 비활성 extra·무효 가중치는 근거로 삼지 않는다", () => {
    const fixture = bind(createUnweightedEyeGazeFixture());
    for (const [index, mesh] of eyes(fixture).entries()) {
      const indices = new Float32Array(mesh.getTotalVertices() * 4), weights = new Float32Array(indices.length);
      for (let vertex = 0; vertex < mesh.getTotalVertices(); vertex += 1) { indices[vertex * 4 + 3] = 9 + index; weights[vertex * 4 + 3] = 0.25; }
      mesh.setVerticesData("matricesIndicesExtra", indices, false, 4); mesh.setVerticesData("matricesWeightsExtra", weights, false, 4);
      mesh.numBoneInfluencers = 8; mesh.computeBonesUsingShaders = false;
    }
    expect(readRigEyeGaze(fixture.rig).status).toBe("available");
    eyes(fixture).forEach((mesh) => { mesh.numBoneInfluencers = 7; });
    expect(readRigEyeGaze(fixture.rig).status).toBe("unavailable");
    eyes(fixture).forEach((mesh) => { mesh.numBoneInfluencers = 8; mesh.setVerticesData("matricesWeightsExtra", new Float32Array(mesh.getTotalVertices() * 4).fill(Number.NaN), false, 4); });
    expect(readRigEyeGaze(fixture.rig).status).toBe("unavailable");
  });

  it("같은 joint 번호라도 다른 스켈레톤의 메시나 비활성 스킨은 현재 안구의 영향이 아니다", () => {
    const fixture = bind(), other = bind();
    for (const mesh of eyes(fixture)) mesh.skeleton = other.rig.skeleton;
    expect(readRigEyeGaze(fixture.rig).status).toBe("unavailable");
    for (const mesh of eyes(fixture)) { mesh.skeleton = fixture.rig.skeleton; mesh.numBoneInfluencers = 0; }
    expect(readRigEyeGaze(fixture.rig).status).toBe("unavailable");
    for (const mesh of eyes(fixture)) mesh.numBoneInfluencers = 4;
    expect(readRigEyeGaze(fixture.rig).status).toBe("available");
  });

  it("정적 버퍼 반복 read는 재스캔하지 않고 동일 geometry의 버퍼 교체·삭제·updatable 갱신은 반영한다", () => {
    const fixture = bind();
    for (const mesh of fixture.rig.parts.flatMap((part) => part.meshes)) for (const kind of ["matricesIndices", "matricesWeights"]) {
      const data = mesh.getVerticesData(kind); if (!data) throw new Error("스킨 데이터 없음"); mesh.setVerticesData(kind, data, false, 4);
    }
    expect(readRigEyeGaze(fixture.rig).status).toBe("available");
    const spies = fixture.rig.parts.flatMap((part) => part.meshes).map((mesh) => vi.spyOn(mesh, "getVerticesData"));
    for (let read = 0; read < 10; read += 1) expect(readRigEyeGaze(fixture.rig).status).toBe("available");
    expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    for (const mesh of eyes(fixture)) mesh.setVerticesData("matricesWeights", new Float32Array(mesh.getTotalVertices() * 4), true, 4);
    expect(readRigEyeGaze(fixture.rig).status).toBe("unavailable");
    for (const mesh of eyes(fixture)) {
      const weights = mesh.getVerticesData("matricesWeights"); if (!weights) throw new Error("가중치 없음");
      for (let vertex = 0; vertex < mesh.getTotalVertices(); vertex += 1) weights[vertex * 4] = 1;
      mesh.updateVerticesData("matricesWeights", weights);
    }
    expect(readRigEyeGaze(fixture.rig).status).toBe("available");
    eyes(fixture)[0]?.removeVerticesData("matricesWeights");
    expect(readRigEyeGaze(fixture.rig)).toMatchObject({ status: "unavailable", reasonKo: expect.stringContaining("왼쪽") });
    spies.forEach((spy) => spy.mockClear());
    for (let frame = 0; frame < 10; frame += 1) applyRigEyeGaze(fixture.rig, { ...DEFAULT_EYE_GAZE, mode: "camera" }, [1, 2, 3]);
    expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });

  it("실제 package loader도 매핑만 있는 눈을 거부하고 Orion의 실제 양안 스킨은 유지한다", async () => {
    const bytes = buildKitGlb({ joints: ["head", "eye.L", "eye.R"], parents: { "eye.L": "head", "eye.R": "head" }, meshes: [
      { node: "Body", primitives: [{ joint: "head", triangles: 2 }], morphs: [] },
    ] });
    const url = "/assets/zero.glb", files = new Map([[url, bytes]]), h = await engine(files);
    const plan = createPackagePlanFixture({ characterId: "zero", glbUrl: url, bytes });
    await h.engine.loadSource({ kind: "package", plan: { ...plan, boneMap: { head: "head", "eye.L": "leftEye", "eye.R": "rightEye" } } });
    expect(h.engine.eyeGaze().status).toBe("unavailable");
    const appRoot = process.cwd().endsWith("character-lab") ? process.cwd() : path.join(process.cwd(), "apps", "character-lab");
    const orion = new Uint8Array(readFileSync(path.join(appRoot, "public/assets/characters/avatar-orion-authored/avatar-orion-authored.glb")));
    const orionUrl = "/assets/orion.glb"; files.set(orionUrl, orion);
    await h.engine.loadSource({ kind: "package", plan: createPackagePlanFixture({ characterId: "orion", glbUrl: orionUrl, bytes: orion }) });
    expect(h.engine.eyeGaze().status).toBe("available");
    h.engine.dispose(); expect(h.engine.eyeGaze().status).toBe("unavailable");
  });

  it("키트 파트 교체·제거는 현재 눈 형상만 재평가하고 기본 키트의 양안은 지원한다", async () => {
    const files = new Map<string, Uint8Array>(), h = await engine(files);
    const defaultKit = await buildKitFixture(); defaultKit.files.forEach((bytes, url) => files.set(url, bytes));
    await h.engine.loadSource({ kind: "kit", plan: defaultKit.plan }); expect(h.engine.eyeGaze().status).toBe("available");
    const headOnly: KitGlbTweak = (spec) => ({ ...spec, meshes: spec.meshes.map((mesh) => ({ ...mesh, primitives: mesh.primitives.map((primitive) => ({ ...primitive, joint: "mixamorig:Head" })) })) });
    const tweaks = { "base/female": headOnly };
    await h.engine.loadSource({ kind: "procedural", model: createUnweightedEyeGazeFixture() });
    for (const partIds of [["irises/round-large"], [], ["irises/round-large"]] as const) {
      const kit = await buildKitFixture({ partIds, tweaks }); kit.files.forEach((bytes, url) => files.set(url, bytes));
      await h.engine.loadSource({ kind: "kit", plan: kit.plan });
      expect(h.engine.eyeGaze().status).toBe(partIds.length > 0 ? "available" : "unavailable");
    }
    await h.engine.loadSource({ kind: "procedural", model: createUnweightedEyeGazeFixture() }); expect(h.engine.eyeGaze().status).toBe("unavailable");
  });
});
