import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KIT_HIDEABLE_REGION_IDS } from "../contracts";

import { buildKitFixture, createKitHarness } from "./testing/kit-glb-fixture";
import { applyBodyMask, kitBodyOutlineRanges, PressureOutlineController } from "./testing/null-engine-harness";

const cleanups: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (cleanups.length) cleanups.pop()?.();
});

async function boot() {
  const fixture = await buildKitFixture({ partIds: [] });
  const harness = await createKitHarness();
  cleanups.push(() => harness.dispose());
  const handle = await harness.load(fixture);
  const rig = handle.rig;
  const skin = rig.parts.find((part) => part.role === "skin");
  const body = skin?.meshes[0];
  const underwear = rig.parts.find((part) => part.role === "underwear")?.meshes[0];
  if (!skin || !body || !underwear) throw new Error("주선 가림 검증용 실제 키트 메시가 없습니다.");
  const white = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, harness.scene, false, false);
  cleanups.push(() => white.dispose());
  const controller = new PressureOutlineController(harness.scene, white);
  cleanups.push(() => controller.dispose());
  const full = Array.from(body.getIndices() ?? []);
  expect(full).toHaveLength(90);
  return { fixture, harness, rig, skin, body, underwear, white, controller, full };
}

function material(mesh: Mesh) {
  if (!mesh.material) throw new Error("검증 대상 재질이 없습니다.");
  return mesh.material;
}

function sourceSnapshot(mesh: Mesh) {
  return { material: mesh.material, geometry: mesh.geometry, skeleton: mesh.skeleton, morph: mesh.morphTargetManager,
    alphaIndex: mesh.alphaIndex, indices: Array.from(mesh.getIndices() ?? []), array: mesh.subMeshes,
    objects: [...mesh.subMeshes], ranges: mesh.subMeshes.map((sub) => [sub.indexStart, sub.indexCount]) };
}

function expectSourcePreserved(mesh: Mesh, before: ReturnType<typeof sourceSnapshot>) {
  expect(mesh.material).toBe(before.material);
  expect(mesh.geometry).toBe(before.geometry);
  expect(mesh.skeleton).toBe(before.skeleton);
  expect(mesh.morphTargetManager).toBe(before.morph);
  expect(mesh.alphaIndex).toBe(before.alphaIndex);
  expect(Array.from(mesh.getIndices() ?? [])).toEqual(before.indices);
  expect(mesh.subMeshes).toBe(before.array);
  expect(mesh.subMeshes).toHaveLength(before.objects.length);
  mesh.subMeshes.forEach((sub, index) => expect(sub).toBe(before.objects[index]));
  expect(mesh.subMeshes.map((sub) => [sub.indexStart, sub.indexCount])).toEqual(before.ranges);
}

function named(meshes: readonly Mesh[], name: string): Mesh {
  const mesh = meshes.find((candidate) => candidate.name === name);
  if (!mesh) throw new Error("검증 대상 주선 메시가 없습니다: " + name);
  return mesh;
}

function expectVisibleRanges(meshes: readonly Mesh[], expectedCount: number) {
  const ranges = meshes.flatMap((mesh) => mesh.subMeshes.map((sub) => ({ start: sub.indexStart, count: sub.indexCount })))
    .sort((left, right) => left.start - right.start);
  let cursor = 0;
  for (const range of ranges) {
    expect(range.start).toBe(cursor);
    expect(range.count).toBeGreaterThan(0);
    expect(range.start % 3).toBe(0);
    expect(range.count % 3).toBe(0);
    cursor += range.count;
  }
  expect(cursor).toBe(expectedCount);
}

function activateAttributeMorphs(body: Mesh) {
  const manager = body.morphTargetManager;
  const normals = body.getVerticesData("normal");
  if (!manager || manager.numTargets === 0 || !normals) throw new Error("속성 morph 검증용 원본 타깃·법선이 없습니다.");
  manager.areUpdatesFrozen = true;
  try {
    manager.useTextureToStoreTargets = false;
    for (let index = 0; index < manager.numTargets; index += 1) {
      const target = manager.getTarget(index);
      // 합성 GLB의 위치 morph에 실제 법선 속성도 추가해 position0/normal0 해제 회귀를 함께 검출한다.
      target.setNormals(Float32Array.from(normals));
      target.influence = index === 0 ? 0.5 : 0;
    }
  } finally { manager.areUpdatesFrozen = false; }
  manager.synchronize();
  expect(manager.isUsingTextureForTargets).toBe(false);
}

function morphBuffers(body: Mesh) {
  return ["position0", "normal0"].map((kind) => {
    const buffer = body.getVertexBuffer(kind);
    const values = body.getVerticesData(kind);
    if (!buffer || !values) throw new Error("실제 속성 morph 버퍼가 없습니다: " + kind);
    return { kind, buffer, values: Array.from(values) };
  });
}

function expectMorphBuffers(body: Mesh, before: ReturnType<typeof morphBuffers>, preserveIdentity = true) {
  for (const entry of before) {
    expect(body.getVertexBuffer(entry.kind)).not.toBeNull();
    if (preserveIdentity) expect(body.getVertexBuffer(entry.kind)).toBe(entry.buffer);
    expect(Array.from(body.getVerticesData(entry.kind) ?? [])).toEqual(entry.values);
  }
}

describe("실제 키트의 torso pressure 가림 배선", () => {
  it("원본 geometry·본·morph를 공유한 torso/나머지가 source를 바꾸지 않고 전체 가시 범위를 나눈다", async () => {
    const env = await boot();
    const sources = env.rig.parts.flatMap((part) => part.meshes).map((mesh) => ({ mesh, before: sourceSnapshot(mesh) }));
    env.controller.sync(env.rig, true, 0.002);
    const meshes = env.controller.meshesFor(env.rig);
    expect(meshes.map((mesh) => mesh.name).sort()).toEqual(["pressure-outline:TS_Body", "pressure-outline:TS_Body:torso"]);
    const other = named(meshes, "pressure-outline:TS_Body");
    const torso = named(meshes, "pressure-outline:TS_Body:torso");
    expect(other.subMeshes.map((sub) => [sub.indexStart, sub.indexCount])).toEqual([[0, 6], [12, 78]]);
    expect(torso.subMeshes.map((sub) => [sub.indexStart, sub.indexCount])).toEqual([[6, 6]]);
    expectVisibleRanges(meshes, 90);
    expect(material(torso)).not.toBe(material(other));
    for (const mesh of meshes) {
      expect(mesh.geometry).toBe(env.body.geometry);
      expect(mesh.skeleton).toBe(env.body.skeleton);
      expect(mesh.morphTargetManager).toBe(env.body.morphTargetManager);
      expect(mesh.numBoneInfluencers).toBe(env.body.numBoneInfluencers);
      expect(mesh.computeBonesUsingShaders).toBe(env.body.computeBonesUsingShaders);
      expect(env.rig.parts.some((part) => part.meshes.includes(mesh))).toBe(false);
    }
    expect(torso.alphaIndex).toBe(-1);
    expect(material(torso).needAlphaBlendingForMesh(torso)).toBe(true);
    expect(material(torso).alphaMode).toBe(Constants.ALPHA_DISABLE);
    expect(material(torso).disableDepthWrite).toBe(true);
    expect(material(torso).forceDepthWrite).toBe(false);
    expect(material(torso).needDepthPrePass).toBe(false);
    for (const source of sources) expectSourcePreserved(source.mesh, source.before);
  });

  it("공유 인덱스가 global SubMesh를 재생성해도 재동기화하고 torso·전체 숨김 및 재표시를 반영한다", async () => {
    const env = await boot();
    activateAttributeMorphs(env.body);
    env.controller.sync(env.rig, true, 0.002);
    const other = named(env.controller.meshesFor(env.rig), "pressure-outline:TS_Body");
    const initialTorso = named(env.controller.meshesFor(env.rig), "pressure-outline:TS_Body:torso");
    applyBodyMask(env.body, env.fixture.plan.bodyRegions, new Set(["neck", "pelvis"]));
    expect(other.subMeshes.map((sub) => [sub.indexStart, sub.indexCount])).toEqual([[0, 78]]);
    const compressedSource = sourceSnapshot(env.body);
    const compressed = env.controller.meshesFor(env.rig);
    expect(named(compressed, "pressure-outline:TS_Body")).toBe(other);
    expect(other.subMeshes.map((sub) => [sub.indexStart, sub.indexCount])).toEqual([[6, 72]]);
    expect(named(compressed, "pressure-outline:TS_Body:torso").subMeshes.map((sub) => [sub.indexStart, sub.indexCount])).toEqual([[0, 6]]);
    expectVisibleRanges(compressed, 78);
    expectSourcePreserved(env.body, compressedSource);
    const beforeTorsoDispose = morphBuffers(env.body);
    applyBodyMask(env.body, env.fixture.plan.bodyRegions, new Set(["torso"]));
    const torsoHidden = env.controller.meshesFor(env.rig);
    expect(torsoHidden).toEqual([other]);
    expect(initialTorso.isDisposed()).toBe(true);
    expectVisibleRanges(torsoHidden, 84);
    expectMorphBuffers(env.body, beforeTorsoDispose);
    applyBodyMask(env.body, env.fixture.plan.bodyRegions, new Set(KIT_HIDEABLE_REGION_IDS));
    expect(env.body.getTotalIndices()).toBe(3);
    expect(kitBodyOutlineRanges(env.body)?.visibleIndexCount).toBe(0);
    expect(env.controller.meshesFor(env.rig)).toEqual([]);
    expectMorphBuffers(env.body, beforeTorsoDispose);
    applyBodyMask(env.body, env.fixture.plan.bodyRegions, new Set());
    const restored = env.controller.meshesFor(env.rig);
    expect(restored).toHaveLength(2);
    expectVisibleRanges(restored, 90);
    expect(Array.from(env.body.getIndices() ?? [])).toEqual(env.full);
    expect(named(restored, "pressure-outline:TS_Body:torso")).not.toBe(initialTorso);
    expectMorphBuffers(env.body, beforeTorsoDispose, false);
  });

  it("실제 부분 alpha·visibility·텍스처 alpha에는 기존 COMBINE을 유지한다", async () => {
    const env = await boot();
    env.controller.sync(env.rig, true, 0.002);
    const originalMaterial = env.body.material;
    const originalAlphaIndex = env.body.alphaIndex;
    env.skin.pbr.alpha = 0.4;
    const partial = named(env.controller.meshesFor(env.rig), "pressure-outline:TS_Body:torso");
    expect(material(partial).alpha).toBe(0.4);
    expect(material(partial).alphaMode).toBe(Constants.ALPHA_COMBINE);
    expect(material(partial).needAlphaBlendingForMesh(partial)).toBe(true);
    env.skin.pbr.alpha = 1;
    env.body.visibility = 0.5;
    env.controller.meshesFor(env.rig);
    expect(partial.visibility).toBe(0.5);
    expect(material(partial).alphaMode).toBe(Constants.ALPHA_COMBINE);
    env.body.visibility = 1;
    env.skin.pbr.useAlphaFromAlbedoTexture = true;
    env.controller.meshesFor(env.rig);
    expect(material(partial).alphaMode).toBe(Constants.ALPHA_COMBINE);
    env.skin.pbr.useAlphaFromAlbedoTexture = false;
    env.controller.meshesFor(env.rig);
    expect(material(partial).alphaMode).toBe(Constants.ALPHA_DISABLE);
    expect(env.body.material).toBe(originalMaterial);
    expect(env.body.alphaIndex).toBe(originalAlphaIndex);
  });

  it("실제 Scene queue에서 뒤늦은 opaque 의상도 torso보다 먼저, 기본 transparent 헤어는 나중에 그린다", async () => {
    const env = await boot();
    env.controller.sync(env.rig, true, 0.002);
    const proxies = env.controller.meshesFor(env.rig);
    const torso = named(proxies, "pressure-outline:TS_Body:torso");
    const sourceStates = [env.body, env.underwear].map((mesh) => ({ mesh, before: sourceSnapshot(mesh) }));
    const late = new Mesh("late-opaque-clothing", env.harness.scene);
    env.underwear.geometry?.applyToMesh(late);
    late.material = new PBRMaterial("late-clothing-material", env.harness.scene);
    expect(late.material.uniqueId).toBeGreaterThan(Math.max(...proxies.map((mesh) => material(mesh).uniqueId)));
    const hair = new Mesh("transparent-hair", env.harness.scene);
    env.body.geometry?.applyToMesh(hair);
    hair.material = new PBRMaterial("transparent-hair-material", env.harness.scene);
    hair.material.alpha = 0.4;
    expect(hair.alphaIndex).toBe(Number.MAX_VALUE);
    const scene = env.harness.scene;
    scene.activeCamera = new ArcRotateCamera("queue-test-camera", 0, Math.PI / 2, 4, Vector3.Zero(), scene);
    const draws: Mesh[] = [];
    // SDK의 실제 active-mesh 평가·불투명/투명 분류·정렬은 유지하고 terminal Mesh.render만 관측한다.
    // 셰이더·stencil·픽셀 검증이 아니며, readiness 때문에 queue가 비는 것만 막는다.
    vi.spyOn(Mesh.prototype, "isReady").mockReturnValue(true);
    vi.spyOn(Mesh.prototype, "render").mockImplementation(function (this: Mesh) { draws.push(this); return this; });
    scene.render();
    const underwearIndex = draws.indexOf(env.underwear);
    const lateIndex = draws.indexOf(late);
    const torsoIndex = draws.indexOf(torso);
    const hairIndex = draws.indexOf(hair);
    expect(underwearIndex).toBeGreaterThanOrEqual(0);
    expect(lateIndex).toBeGreaterThanOrEqual(0);
    expect(torsoIndex).toBeGreaterThan(underwearIndex);
    expect(torsoIndex).toBeGreaterThan(lateIndex);
    expect(hairIndex).toBeGreaterThan(torsoIndex);
    for (const source of sourceStates) expectSourcePreserved(source.mesh, source.before);
  });

  it("실제 main pass에서만 torso stencil을 읽고 기존 global predicate·globalOnly·비 lit pass를 침범하지 않는다", async () => {
    const env = await boot();
    const scene = env.harness.scene;
    const engine = scene.getEngine();
    const camera = new ArcRotateCamera("torso-stencil-main", 0, Math.PI / 2, 4, Vector3.Zero(), scene);
    scene.activeCamera = camera;
    engine.currentRenderPassId = camera.renderPassId;
    env.controller.sync(env.rig, true, 0.002);
    const torso = named(env.controller.meshesFor(env.rig), "pressure-outline:TS_Body:torso");
    const otherPass = engine.createRenderPassId("unregistered-torso-shadow");
    cleanups.push(() => engine.releaseRenderPassId(otherPass));
    const sourceStencil = (mesh: Mesh) => {
      const state = material(mesh).stencil;
      return { enabled: state.enabled, mask: state.mask, func: state.func, backFunc: state.backFunc,
        funcRef: state.funcRef, funcMask: state.funcMask,
        fail: state.opStencilFail, depthFail: state.opDepthFail, pass: state.opStencilDepthPass,
        backFail: state.backOpStencilFail, backDepthFail: state.backOpDepthFail, backPass: state.backOpStencilDepthPass };
    };
    const sources = [env.body, env.underwear].map((mesh) => ({ mesh, before: sourceSnapshot(mesh), stencil: sourceStencil(mesh) }));
    engine.setStencilMask(0x04);
    engine.setStencilFunction(Constants.NOTEQUAL);
    engine.setStencilBackFunction(Constants.EQUAL);
    engine.setStencilFunctionReference(0x04);
    engine.setStencilFunctionMask(0x0c);
    engine.setStencilOperationFail(Constants.REPLACE);
    engine.setStencilOperationDepthFail(Constants.KEEP);
    engine.setStencilOperationPass(Constants.REPLACE);
    engine.setStencilBackOperationFail(Constants.KEEP);
    engine.setStencilBackOperationDepthFail(Constants.REPLACE);
    engine.setStencilBackOperationPass(Constants.KEEP);
    const globalState = () => ({ enabled: engine.getStencilBuffer(), mask: engine.getStencilMask(),
      func: engine.getStencilFunction(), backFunc: engine.getStencilBackFunction(),
      reference: engine.getStencilFunctionReference(), funcMask: engine.getStencilFunctionMask(),
      fail: engine.getStencilOperationFail(), depthFail: engine.getStencilOperationDepthFail(), pass: engine.getStencilOperationPass(),
      backFail: engine.getStencilBackOperationFail(), backDepthFail: engine.getStencilBackOperationDepthFail(), backPass: engine.getStencilBackOperationPass(),
      globalOnly: engine.stencilStateComposer.useStencilGlobalOnly });
    const notify = (expected: boolean) => {
      const before = globalState();
      // 실제 SDK의 공개 observer를 통지한다. draw·GPU stencil 결과는 이 테스트의 범위가 아니다.
      torso.onBeforeRenderObservable.notifyObservers(torso);
      expect(material(torso).stencil.enabled).toBe(expected);
      expect(globalState()).toEqual(before);
      for (const source of sources) {
        expectSourcePreserved(source.mesh, source.before);
        expect(sourceStencil(source.mesh)).toEqual(source.stencil);
      }
    };
    engine.setStencilBuffer(false);
    engine.stencilStateComposer.useStencilGlobalOnly = false;
    const normal = globalState();
    notify(true);
    engine.setStencilBuffer(true);
    notify(false);
    engine.setStencilBuffer(false);
    engine.stencilStateComposer.useStencilGlobalOnly = true;
    notify(false);
    engine.stencilStateComposer.useStencilGlobalOnly = false;
    engine.currentRenderPassId = otherPass;
    notify(false);
    engine.currentRenderPassId = camera.renderPassId;
    notify(true);
    expect(globalState()).toEqual(normal);
  });

  it("OFF·재진입·dispose 뒤 자체 메시/재질만 정리하고 원본·공유 white를 보존한다", async () => {
    const env = await boot();
    activateAttributeMorphs(env.body);
    const originalMorphValues = morphBuffers(env.body);
    const scene = env.harness.scene;
    const baseline = { meshes: scene.meshes.length, materials: scene.materials.length };
    const sources = env.rig.parts.flatMap((part) => part.meshes).map((mesh) => ({ mesh, before: sourceSnapshot(mesh) }));
    const owned: Mesh[] = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      env.controller.sync(env.rig, true, 0.002);
      const current = env.controller.meshesFor(env.rig);
      expect(current).toHaveLength(2);
      expect(current.some((mesh) => owned.includes(mesh))).toBe(false);
      expect(scene.meshes).toHaveLength(baseline.meshes + 2);
      expect(scene.materials).toHaveLength(baseline.materials + 2);
      expect(current.every((mesh) => mesh.morphTargetManager === env.body.morphTargetManager)).toBe(true);
      expectMorphBuffers(env.body, originalMorphValues, false);
      const beforeRelease = morphBuffers(env.body);
      owned.push(...current);
      env.controller.sync(env.rig, false, 0.002);
      expect(env.controller.meshesFor(env.rig)).toEqual([]);
      expect(current.every((mesh) => mesh.isDisposed())).toBe(true);
      expect(scene.meshes).toHaveLength(baseline.meshes);
      expect(scene.materials).toHaveLength(baseline.materials);
      expect(scene.textures).toContain(env.white);
      expectMorphBuffers(env.body, beforeRelease);
    }
    env.controller.sync(env.rig, true, 0.002);
    const beforeDispose = morphBuffers(env.body);
    env.controller.dispose();
    expect(scene.meshes).toHaveLength(baseline.meshes);
    expect(scene.materials).toHaveLength(baseline.materials);
    expect(scene.textures).toContain(env.white);
    expectMorphBuffers(env.body, beforeDispose);
    for (const source of sources) expectSourcePreserved(source.mesh, source.before);
  });
});
