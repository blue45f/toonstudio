import { Material } from "@babylonjs/core/Materials/material.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { afterEach, expect, it, vi } from "vitest";

import { DEFAULT_SHADING, estimateCaptureBytes } from "../contracts";
import { createMockPhysicsProvider } from "../testing/mock-engine";

import { createNullEngineHarness, installFakeReadback } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { ChainAnchor, PhysicsProviderFactory } from "../contracts";

const cleanup: Array<() => void> = [];
afterEach(() => { vi.restoreAllMocks(); while (cleanup.length) cleanup.pop()?.(); });
const request = { width: 8, height: 8, passes: ["lit"] as const, transparentBackground: true as const, settleSteps: 0, includeHairOwnership: true };
async function boot(ready = false, physicsProviders?: PhysicsProviderFactory) {
  cleanup.push(installFakeReadback((_pass, width, height) => new Uint8Array(width * height * 4).fill(255)));
  const h = await createNullEngineHarness({ lane: "webgl2", awaitShaderCompile: ready, captureCompileTimeoutMs: 100, ...(physicsProviders ? { physicsProviders } : {}) });
  cleanup.push(() => h.dispose());
  await h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
  h.engine.setShading({ ...DEFAULT_SHADING, mode: "toon", toon: { ...DEFAULT_SHADING.toon, outlinePressure: true } });
  const scene = h.nullEngine.scenes[0];
  if (!scene) throw new Error("장면 없음");
  return { ...h, scene };
}

it("auxiliary 요청만 메모리 예산에 한 패스를 더하고 기존 요청은 그대로 유지한다", async () => {
  expect(estimateCaptureBytes({ width: 8, height: 8, passes: ["lit"] })).toBe(256);
  expect(estimateCaptureBytes({ width: 8, height: 8, passes: ["lit"], includeHairOwnership: true })).toBe(512);
  const h = await boot();
  h.nullEngine.getCaps().maxTextureSize = 8192;
  await expect(h.engine.renderPasses({ ...request, width: 8192, height: 8192, passes: ["lit"] })).rejects.toMatchObject({ code: "capture-too-large" });
});

it("실제 소스·필압 정점 경로를 공유하며 마스크 뒤 원본 색·재질·override·자원을 보존한다", async () => {
  const h = await boot();
  const meshes = h.scene.meshes.filter(mesh => mesh.getTotalVertices() > 0) as Mesh[];
  const original = meshes.map(mesh => ({ mesh, material: mesh.material, outline: mesh.outlineColor.asArray(), overlay: mesh.overlayColor.asArray(), edges: mesh.edgesColor.asArray() }));
  let draws = 0;
  vi.spyOn(RenderTargetTexture.prototype, "render").mockImplementation(function (this: RenderTargetTexture) {
    if (this.name !== "capture-hair-ownership") return;
    draws += 1;
    expect(this.renderList).toHaveLength(8);
    for (const mesh of this.renderList ?? []) {
      const material = mesh.getMaterialForRenderPass(this.renderPassId);
      expect(material).toBeInstanceOf(ShaderMaterial);
      if (!(material instanceof ShaderMaterial) || !(mesh.material instanceof ShaderMaterial)) throw new Error("셰이더 재질 없음");
      const vertex = typeof material.shaderPath === "object" ? material.shaderPath.vertex : material.shaderPath;
      const sourceVertex = typeof mesh.material.shaderPath === "object" ? mesh.material.shaderPath.vertex : mesh.material.shaderPath;
      expect(vertex).toBe(sourceVertex);
      expect(material).not.toBe(mesh.material);
    }
  });
  expect(h.engine.psdHairLayers?.()).toEqual({ status: "available" });
  const first = await h.engine.renderPasses(request);
  expect(first.hairOwnership).toMatchObject({ status: "available", classification: "majority-visible-samples" });
  const materials = h.scene.materials.length;
  const shaderState = h.scene.materials.filter((material): material is ShaderMaterial => material instanceof ShaderMaterial).map(material => ({ material, serialized: JSON.stringify(material.serialize()), uniforms: [...material.options.uniforms], textures: material.getActiveTextures() }));
  let disposedTextures = 0;
  for (const texture of new Set(shaderState.flatMap(state => state.textures))) texture.onDisposeObservable.add(() => { disposedTextures += 1; });
  await h.engine.renderPasses(request);
  expect(draws).toBe(2);
  expect(h.scene.materials.length).toBe(materials);
  expect(h.scene.materials.some(material => material.name.startsWith("hair-owner:"))).toBe(false);
  expect(disposedTextures).toBe(0);
  for (const before of shaderState) {
    expect(before.material.options.uniforms).toEqual(before.uniforms);
    expect(before.material.getActiveTextures()).toEqual(before.textures);
    expect(JSON.stringify(before.material.serialize())).toBe(before.serialized);
  }
  for (const before of original) {
    expect(before.mesh.material).toBe(before.material);
    expect(before.mesh.outlineColor.asArray()).toEqual(before.outline);
    expect(before.mesh.overlayColor.asArray()).toEqual(before.overlay);
    expect(before.mesh.edgesColor.asArray()).toEqual(before.edges);
    expect(before.mesh.isDisposed()).toBe(false);
  }
});

it("BLEND는 사전 사유로 제한하고 기본 캡처는 그대로 제공한다", async () => {
  const h = await boot();
  h.engine.setShading(DEFAULT_SHADING);
  const hair = h.scene.getMeshByName("hair");
  if (!hair?.material) throw new Error("헤어 없음");
  hair.material.alpha = 0.5;
  hair.material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  expect(h.engine.psdHairLayers?.()).toMatchObject({ status: "unavailable", reasonKo: expect.stringContaining("BLEND") });
  const result = await h.engine.renderPasses(request);
  expect(result.hairOwnership).toMatchObject({ status: "unavailable" });
  const normal = await h.engine.renderPasses({ ...request, includeHairOwnership: false, passes: ["lit"] });
  expect(normal.passes.lit).toBeDefined();
  expect(normal.hairOwnership).toBeUndefined();
});

it("렌더 실패 때 색과 패스 override를 복원하고 임시 재질만 해제한다", async () => {
  const h = await boot();
  const meshes = h.scene.meshes.filter(mesh => mesh.getTotalVertices() > 0) as Mesh[];
  const colors = meshes.map(mesh => mesh.outlineColor.asArray());
  let pass = -1;
  vi.spyOn(RenderTargetTexture.prototype, "render").mockImplementation(function (this: RenderTargetTexture) { if (this.name === "capture-hair-ownership") { pass = this.renderPassId; throw new Error("ownership draw failed"); } });
  await expect(h.engine.renderPasses(request)).rejects.toThrow("ownership draw failed");
  expect(meshes.map(mesh => mesh.outlineColor.asArray())).toEqual(colors);
  expect(meshes.every(mesh => mesh.getMaterialForRenderPass(pass) === undefined && !mesh.isDisposed())).toBe(true);
  expect(h.scene.materials.some(material => material.name.startsWith("hair-owner:"))).toBe(false);
});

it("컴파일 시간 초과도 현재 패스·색·임시 재질을 복원한다", async () => {
  const h = await boot(true);
  const pass = h.nullEngine.currentRenderPassId;
  const colors = h.scene.meshes.map(mesh => mesh.outlineColor.asArray());
  vi.spyOn(ShaderMaterial.prototype, "isReadyForSubMesh").mockReturnValue(false);
  await expect(h.engine.renderPasses(request)).rejects.toMatchObject({ code: "capture-shader-timeout" });
  expect(h.nullEngine.currentRenderPassId).toBe(pass);
  expect(h.scene.meshes.map(mesh => mesh.outlineColor.asArray())).toEqual(colors);
  expect(h.scene.materials.some(material => material.name.startsWith("hair-owner:"))).toBe(false);
});

it("소유권 readback 실패 때도 원래 색·재질을 복원하고 일반 캡처를 계속 사용할 수 있다", async () => {
  const h = await boot();
  const meshes = h.scene.meshes.filter(mesh => mesh.getTotalVertices() > 0);
  const colors = meshes.map(mesh => mesh.outlineColor.asArray());
  cleanup.push(installFakeReadback((pass, width, height) => ["hair-ownership"].includes(pass) ? Promise.reject(new Error("device lost during owner readback")) : Promise.resolve(new Uint8Array(width * height * 4).fill(255))));
  await expect(h.engine.renderPasses(request)).rejects.toThrow("device lost during owner readback");
  expect(meshes.map(mesh => mesh.outlineColor.asArray())).toEqual(colors);
  expect(h.scene.materials.some(material => material.name.startsWith("hair-owner:"))).toBe(false);
  await expect(h.engine.renderPasses({ ...request, includeHairOwnership: false })).resolves.toHaveProperty("passes.lit");
});

it("물리 프레임이 readback 대기 중 움직여도 lit와 ownership은 같은 동기 포즈를 제출한다", async () => {
  let steps = 0;
  let chains: readonly ChainAnchor[] = [];
  const h = await boot(false, async (id) => ({
    ...createMockPhysicsProvider(id),
    setChains(next) { chains = next; },
    step() { steps += 1; },
    readChainPositions(id) {
      const chain = chains.find(candidate => candidate.id === id);
      if (!chain) return new Float32Array();
      const origin = chain.restPoints[0];
      if (!origin) throw new Error("체인 루트 없음");
      const angle = steps * 0.2;
      return new Float32Array(chain.restPoints.flatMap(point => {
        const x = point[0] - origin[0], y = point[1] - origin[1];
        return [origin[0] + x * Math.cos(angle) - y * Math.sin(angle), origin[1] + x * Math.sin(angle) + y * Math.cos(angle), point[2]];
      }));
    },
  }));
  await h.engine.setPhysicsProvider("builtin-pbd");
  h.engine.renderFrame();
  const before = h.engine.readBone("hair_0")?.localRotation;
  const submitted = new Map<string, readonly number[] | undefined>();
  vi.spyOn(RenderTargetTexture.prototype, "render").mockImplementation(function (this: RenderTargetTexture) { submitted.set(this.name, h.engine.readBone("hair_0")?.localRotation); });
  cleanup.push(installFakeReadback((pass, width, height) => {
    if (pass === "lit") queueMicrotask(() => h.engine.renderFrame());
    return Promise.resolve(new Uint8Array(width * height * 4).fill(255));
  }));
  await h.engine.renderPasses(request);
  expect(submitted.get("capture-lit")).toEqual(before);
  expect(submitted.get("capture-hair-ownership")).toEqual(before);
  expect(steps).toBe(2);
  expect(h.engine.readBone("hair_0")?.localRotation).not.toEqual(before);
});

it("RGBA 정점 알파가 전부 1이면 원래 투명 정렬·깊이 규약으로 지원하고 데이터 변경을 다시 판정한다", async () => {
  const h = await boot();
  h.engine.setShading(DEFAULT_SHADING);
  const hair = h.scene.getMeshByName("hair");
  if (!(hair instanceof Mesh) || !hair.material) throw new Error("헤어 없음");
  const colors = new Float32Array(hair.getTotalVertices() * 4).fill(1);
  hair.setVerticesData("color", colors, true, 4);
  hair.hasVertexAlpha = true;
  hair.material.transparencyMode = null;
  expect(h.engine.psdHairLayers?.()).toEqual({ status: "available" });
  const blend = hair.material.needAlphaBlendingForMesh(hair);
  vi.spyOn(RenderTargetTexture.prototype, "render").mockImplementation(function (this: RenderTargetTexture) {
    if (this.name !== "capture-hair-ownership") return;
    const material = hair.getMaterialForRenderPass(this.renderPassId);
    expect(material?.needAlphaBlendingForMesh(hair)).toBe(blend);
    expect(material?.disableDepthWrite).toBe(hair.material?.disableDepthWrite);
    expect(material?.forceDepthWrite).toBe(hair.material?.forceDepthWrite);
  });
  await h.engine.renderPasses(request);
  colors[3] = 0.5;
  hair.updateVerticesData("color", colors);
  expect(h.engine.psdHairLayers?.().status).toBe("unavailable");
});
