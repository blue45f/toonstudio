import { afterEach, expect, it, vi } from "vitest";

import { KitOutlineDepthController, createNullEngineHarness } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { OutlineRenderer } from "@babylonjs/core/Rendering/outlineRenderer.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.restoreAllMocks();
});

/** 실제 SDK stage의 분기·상태 복원을 검증한다. 최하위 draw만 대체하므로 GPU 픽셀 검증은 아니다. */
async function boot() {
  const h = await createNullEngineHarness();
  cleanups.push(() => h.dispose());
  await h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
  const scene = h.nullEngine.scenes[0];
  if (!scene) throw new Error("NullEngine 장면이 없습니다.");
  const renderer = scene.getOutlineRenderer();
  // 지연 생성된 실제 OutlineRenderer.register()를 scene.render()가 호출하게 한다.
  // 원본 메시 draw는 이 단계의 목적이 아니며 셰이더 준비와 분리한다.
  for (const mesh of scene.meshes) mesh.setEnabled(false);
  scene.render();
  scene.render();
  for (const mesh of scene.meshes) mesh.setEnabled(true);
  const before = scene._beforeRenderingMeshStage.filter((step) => step.component === renderer);
  const after = scene._afterRenderingMeshStage.filter((step) => step.component === renderer);
  expect(before).toHaveLength(1);
  expect(after).toHaveLength(1);
  const beforeStage = before[0];
  const afterStage = after[0];
  if (!beforeStage || !afterStage) throw new Error("실제 SDK outline stage가 등록되지 않았습니다.");
  const body = scene.getMeshByName("body") as Mesh | null;
  const top = scene.getMeshByName("top") as Mesh | null;
  if (!body || !top) throw new Error("실제 메시 fixture가 없습니다.");
  const bodySubMesh = body.subMeshes[0];
  const topSubMesh = top.subMeshes[0];
  if (!bodySubMesh || !topSubMesh) throw new Error("실제 SubMesh fixture가 없습니다.");
  const batch = body._getInstancesRenderList(bodySubMesh._id);
  const draws: Array<{
    receiver: OutlineRenderer;
    args: Parameters<OutlineRenderer["render"]>;
    colorWrite: boolean;
    depthWrite: boolean;
  }> = [];
  const original = vi.spyOn(renderer, "render").mockImplementation(function (this: OutlineRenderer, ...args) {
    draws.push({ receiver: this, args, colorWrite: h.nullEngine.getColorWrite(), depthWrite: h.nullEngine.getDepthWrite() });
  });
  const controller = new KitOutlineDepthController(scene);
  cleanups.push(() => controller.dispose());
  const stages = (mesh = body, subMesh = bodySubMesh) => {
    const meshBatch = mesh._getInstancesRenderList(subMesh._id);
    beforeStage.action(mesh, subMesh, meshBatch, null);
    afterStage.action(mesh, subMesh, meshBatch, null);
  };
  return { h, scene, renderer, body, top, bodySubMesh, topSubMesh, batch, draws, original, controller, stages };
}

it("실제 SDK의 색 hull은 유지하고 표시한 메시의 after-stage 추가 깊이 draw만 생략한다", async () => {
  const env = await boot();
  env.controller.set(env.body, true);
  env.body.renderOutline = true;
  env.h.nullEngine.setColorWrite(true);
  env.h.nullEngine.setDepthWrite(true);
  env.stages();
  expect(env.draws).toHaveLength(1);
  expect(env.draws[0]).toMatchObject({ receiver: env.renderer, colorWrite: true, depthWrite: false });
  expect(env.draws[0]?.args[2]).toBe(false);
  expect(env.h.nullEngine.getColorWrite()).toBe(true);
  expect(env.h.nullEngine.getDepthWrite()).toBe(true);
  expect(env.body.renderOutline).toBe(true);

  env.controller.set(env.body, false);
  env.draws.length = 0;
  env.stages();
  expect(env.draws.map(({ colorWrite, depthWrite }) => [colorWrite, depthWrite])).toEqual([[true, false], [false, true]]);
  expect(env.draws[0]?.args[3]).not.toBe(env.draws[1]?.args[3]);
  expect(env.h.nullEngine.getColorWrite()).toBe(true);
  expect(env.h.nullEngine.getDepthWrite()).toBe(true);
});

it("실제 transparent stencil·overlay 단계와 alpha·stencil·색/깊이 상태 복원을 보존한다", async () => {
  const env = await boot();
  env.controller.set(env.body, true);
  env.body.renderOutline = true;
  env.body.renderOverlay = true;
  const material = env.body.material;
  if (!material) throw new Error("fixture 재질이 없습니다.");
  material.alpha = 0.4;
  expect(material.needAlphaBlendingForMesh(env.body)).toBe(true);
  const engine = env.h.nullEngine;
  engine.setAlphaMode(7, true);
  engine.setColorWrite(true);
  engine.setDepthWrite(true);
  engine.setStencilBuffer(false);
  engine.setStencilMask(0x55);
  engine.setStencilFunction(515);
  engine.setStencilFunctionReference(7);
  engine.setStencilOperationPass(7680);
  const state = () => ({
    color: engine.getColorWrite(), depth: engine.getDepthWrite(),
    alphaMode: engine.getAlphaMode(), alphaBlend: engine.alphaState.alphaBlend,
    stencil: engine.getStencilBuffer(), stencilMask: engine.getStencilMask(),
    stencilFunction: engine.getStencilFunction(), stencilReference: engine.getStencilFunctionReference(),
    stencilOperationPass: engine.getStencilOperationPass(), globalStencil: engine.stencilStateComposer.useStencilGlobalOnly,
  });
  const before = state();
  env.stages();
  expect(env.draws.map(({ args, colorWrite, depthWrite }) => [args[2], colorWrite, depthWrite])).toEqual([
    [true, false, false], // 원래 표면의 투명 stencil draw
    [false, true, false], // 색 hull
    [true, true, false], // 실제 overlay
  ]);
  expect(new Set(env.draws.map(({ args }) => args[3])).size).toBe(3);
  expect(state()).toEqual(before);
  expect(material.alpha).toBe(0.4);
  expect([env.body.renderOutline, env.body.renderOverlay]).toEqual([true, true]);
});

it("표시 여부·색/깊이·overlay 반대 조건은 원래 receiver와 네 인자 그대로 위임한다", async () => {
  const env = await boot();
  const cases = [
    { marked: true, color: false, depth: true, overlay: false, delegated: false },
    { marked: false, color: false, depth: true, overlay: false, delegated: true },
    { marked: true, color: true, depth: true, overlay: false, delegated: true },
    { marked: true, color: false, depth: false, overlay: false, delegated: true },
    { marked: true, color: false, depth: true, overlay: true, delegated: true },
  ];
  for (const testCase of cases) {
    env.controller.set(env.body, testCase.marked);
    env.h.nullEngine.setColorWrite(testCase.color);
    env.h.nullEngine.setDepthWrite(testCase.depth);
    env.original.mockClear();
    env.renderer.render(env.bodySubMesh, env.batch, testCase.overlay, 913);
    expect(env.original).toHaveBeenCalledTimes(testCase.delegated ? 1 : 0);
    if (testCase.delegated) {
      expect(env.original).toHaveBeenCalledWith(env.bodySubMesh, env.batch, testCase.overlay, 913);
      expect(env.original.mock.contexts[0]).toBe(env.renderer);
    }
    expect(env.h.nullEngine.getColorWrite()).toBe(testCase.color);
    expect(env.h.nullEngine.getDepthWrite()).toBe(testCase.depth);
  }
});

it("getMesh가 아닌 실제 getRenderingMesh를 판정하고 등록 해제로 즉시 원래 깊이 draw를 복구한다", async () => {
  const env = await boot();
  env.controller.set(env.body, true);
  env.h.nullEngine.setColorWrite(false);
  env.h.nullEngine.setDepthWrite(true);
  expect(env.topSubMesh.getMesh()).toBe(env.top);
  vi.spyOn(env.topSubMesh, "getRenderingMesh").mockReturnValue(env.body);
  env.renderer.render(env.topSubMesh, env.batch, false, 914);
  expect(env.original).not.toHaveBeenCalled();
  env.controller.set(env.body, false);
  env.renderer.render(env.topSubMesh, env.batch, false, 914);
  expect(env.original).toHaveBeenCalledTimes(1);
  expect(env.original).toHaveBeenCalledWith(env.topSubMesh, env.batch, false, 914);
});

it("장면에만 wrapper를 설치하고 dispose가 원본 메시·geometry·skeleton을 해제하지 않는다", async () => {
  const env = await boot();
  const other = await createNullEngineHarness();
  cleanups.push(() => other.dispose());
  const otherScene = other.nullEngine.scenes[0];
  if (!otherScene) throw new Error("두 번째 장면이 없습니다.");
  const otherRender = otherScene.getOutlineRenderer().render;
  const geometry = env.body.geometry;
  const skeleton = env.body.skeleton;
  const morphs = env.body.morphTargetManager;
  const count = { meshes: env.scene.meshes.length, geometries: env.scene.geometries.length, skeletons: env.scene.skeletons.length };
  env.controller.set(env.body, true);
  env.controller.dispose();
  env.controller.dispose();
  expect(env.renderer.render).toBe(env.original);
  expect(otherScene.getOutlineRenderer().render).toBe(otherRender);
  expect(env.body.isDisposed()).toBe(false);
  expect([env.body.geometry, env.body.skeleton, env.body.morphTargetManager]).toEqual([geometry, skeleton, morphs]);
  expect({ meshes: env.scene.meshes.length, geometries: env.scene.geometries.length, skeletons: env.scene.skeletons.length }).toEqual(count);
});

it("나중에 설치된 renderer wrapper를 덮어쓰지 않고 메시 해제 후 등록 해제도 안전하다", async () => {
  const env = await boot();
  env.controller.set(env.body, true);
  env.body.dispose(false, false);
  expect(() => env.controller.set(env.body, false)).not.toThrow();
  env.controller.set(env.top, true);
  const installed = env.renderer.render;
  const later: OutlineRenderer["render"] = (...args) => installed.call(env.renderer, ...args);
  env.renderer.render = later;
  env.controller.dispose();
  expect(env.renderer.render).toBe(later);
  env.h.nullEngine.setColorWrite(false);
  env.h.nullEngine.setDepthWrite(true);
  env.renderer.render(env.topSubMesh, env.batch, false, 915);
  expect(env.original).toHaveBeenCalledTimes(1);
  expect(env.original).toHaveBeenCalledWith(env.topSubMesh, env.batch, false, 915);
  expect(env.top.isDisposed()).toBe(false);
});
