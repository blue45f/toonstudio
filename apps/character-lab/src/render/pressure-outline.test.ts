import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { afterEach, expect, it, vi } from "vitest";

import { DEFAULT_SHADING } from "../contracts";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { isPressureOutline } from "./pressure-outline-tag";
import { skinnedPositions } from "./testing/cpu-skinning";
import { createNullEngineHarness, withNativeOutlinesOff } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { ShadingProfile } from "../contracts";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";

const cleanups: Array<() => void> = [];
afterEach(() => { vi.restoreAllMocks(); while (cleanups.length) cleanups.pop()?.(); });

async function boot() {
  const h = await createNullEngineHarness();
  cleanups.push(() => h.dispose());
  await h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
  const scene = h.nullEngine.scenes[0];
  if (!scene) throw new Error("장면 없음");
  return { ...h, scene, outlines: () => scene.meshes.filter(isPressureOutline) as Mesh[] };
}
function profile(pressure?: boolean): ShadingProfile {
  return { ...DEFAULT_SHADING, mode: "toon", toon: { ...DEFAULT_SHADING.toon, ...(pressure === undefined ? {} : { outlinePressure: pressure }) } };
}

it("기존 레시피는 stock hull을 유지하고 선택한 경우에만 중복 없는 실제 셰이더 hull을 만든다", async () => {
  const h = await boot();
  h.engine.setShading(profile());
  const sources = h.scene.meshes.filter((mesh) => mesh.getTotalVertices() > 0) as Mesh[];
  const geometry = sources.map((mesh) => mesh.geometry);
  expect(h.outlines()).toHaveLength(0);
  expect(sources.every((mesh) => mesh.renderOutline)).toBe(true);
  h.engine.setShading(profile(true));
  expect(h.outlines()).toHaveLength(sources.length);
  for (const source of sources) {
    const outline = h.outlines().find((mesh) => mesh.name === `pressure-outline:${source.name}`);
    expect(outline?.geometry).toBe(source.geometry);
    expect(outline?.skeleton).toBe(source.skeleton);
    expect(outline?.morphTargetManager).toBe(source.morphTargetManager);
    expect(outline?.isPickable).toBe(false);
    expect(outline?.receiveShadows).toBe(false);
    expect(outline?.renderOutline).toBe(false);
    expect(outline?.material?.getClassName()).toBe("ShaderMaterial");
    expect(outline?.material?.cullBackFaces).toBe(false);
    expect(source.renderOutline).toBe(false);
  }
  h.engine.setShading(profile(false));
  expect(h.outlines()).toHaveLength(0);
  expect(sources.every((mesh) => mesh.renderOutline)).toBe(true);
  expect(sources.map((mesh) => mesh.geometry)).toEqual(geometry);
  expect(sources.every((mesh) => !mesh.isDisposed())).toBe(true);
});

it("본·morph·원본 transform·파츠 가시성을 공유하며 소스 재로드와 PBR 복귀가 hull 자원만 해제한다", async () => {
  const h = await boot();
  h.engine.setShading(profile(true));
  const source = h.scene.getMeshByName("hair") as Mesh | null;
  if (!source) throw new Error("헤어 fixture 없음");
  source.position.set(0.03, 0.02, 0.01);
  source.scaling.set(1.1, 0.9, 1);
  h.engine.applyPlan(applyPlanFixture({ parts: [{ partId: 3, visible: false, materialPreset: "hair-aniso" }] }));
  // 캡처 getter도 물리/포즈/가시성 변경 뒤 동기 갱신한다.
  await h.engine.renderPasses({ width: 8, height: 8, passes: ["lit"], transparentBackground: true, settleSteps: 0 });
  const outline = h.outlines().find((mesh) => mesh.name === "pressure-outline:hair");
  expect(outline?.isVisible).toBe(false);
  expect(outline?.position.asArray()).toEqual(source.position.asArray());
  expect(outline?.scaling.asArray()).toEqual(source.scaling.asArray());
  const old = h.outlines();
  await h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
  expect(old.every((mesh) => mesh.isDisposed())).toBe(true);
  expect(h.outlines()).toHaveLength(4);
  const newSource = h.scene.getMeshByName("hair");
  h.engine.setShading(DEFAULT_SHADING);
  expect(h.outlines()).toHaveLength(0);
  expect(newSource?.isDisposed()).toBe(false);
});

it("lit 목록에만 runtime hull을 추가하고 밑색·ID·법선·깊이·그림자 입력은 원본만 사용한다", async () => {
  const h = await boot();
  h.engine.setShading(profile(true));
  const lists = new Map<string, string[]>();
  const original = RenderTargetTexture.prototype.render;
  vi.spyOn(RenderTargetTexture.prototype, "render").mockImplementation(function (this: RenderTargetTexture, ...args) {
    lists.set(this.name, (this.renderList ?? []).map((mesh) => mesh.name));
    return original.apply(this, args);
  });
  await h.engine.renderPasses({ width: 8, height: 8, passes: ["lit", "flat", "part-id", "material-id", "normal", "depth"], transparentBackground: true, settleSteps: 0 });
  expect(lists.get("capture-lit")?.filter((name) => name.startsWith("pressure-outline:"))).toHaveLength(4);
  for (const [name, meshes] of lists) {
    if (name === "capture-lit") continue;
    expect(meshes.some((mesh) => mesh.startsWith("pressure-outline:")), name).toBe(false);
  }
});

it("GLB에 렌더 전용 hull을 넣지 않고 활성 상태의 geometry·스킨은 보존한다", async () => {
  const h = await boot();
  h.engine.setShading(profile(true));
  const bytes = await h.engine.exportGlb();
  const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as { nodes: Array<{ name?: string }>; meshes: unknown[]; skins: unknown[] };
  expect(json.nodes.some((node) => node.name?.startsWith("pressure-outline:"))).toBe(false);
  expect(json.meshes.length).toBeGreaterThan(0);
  expect(json.skins.length).toBeGreaterThan(0);
  expect(h.outlines()).toHaveLength(4);
});

it("비주선 RTT의 stock hull·edge 비활성은 렌더 실패 때도 정확히 복원한다", async () => {
  const h = await boot();
  h.engine.setShading({ ...profile(), toon: { ...profile().toon, outline: "edge" } });
  const mesh = h.scene.getMeshByName("top") as Mesh;
  mesh.renderOutline = true;
  mesh.renderOverlay = true;
  const failure = new Error("RTT 실패");
  expect(() => withNativeOutlinesOff([mesh], true, () => {
    expect(mesh.renderOutline).toBe(false);
    expect(mesh.renderOverlay).toBe(false);
    expect(mesh.edgesRenderer?.isEnabled).toBe(false);
    throw failure;
  })).toThrow(failure);
  expect(mesh.renderOutline).toBe(true);
  expect(mesh.renderOverlay).toBe(true);
  expect(mesh.edgesRenderer?.isEnabled).toBe(true);
});

it("알베도 컷아웃·UV 행렬·재질 알파를 hull에도 전달하고 공유 텍스처를 해제하지 않는다", async () => {
  const h = await boot();
  const source = h.scene.getMeshByName("top") as Mesh;
  const pbr = source.material as PBRMaterial;
  const texture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 0]), 1, 1, h.scene);
  texture.uScale = 0.5;
  pbr.albedoTexture = texture;
  pbr.useAlphaFromAlbedoTexture = true;
  pbr.alphaCutOff = 0.6;
  pbr.transparencyMode = 1;
  pbr.alpha = 0.4;
  h.engine.setShading(profile(true));
  const material = h.outlines().find((mesh) => mesh.name === "pressure-outline:top")?.material as ShaderMaterial;
  const values = material as unknown as { _vectors2: Record<string, {x: number; y: number}>; _matrices: Record<string, {asArray(): number[]}>; _textures: Record<string, unknown> };
  expect(values._vectors2.alphaSettings).toMatchObject({ x: 0.6, y: 1 });
  expect(values._matrices.diffuseMatrix?.asArray()).toEqual(texture.getTextureMatrix().asArray());
  expect(values._textures.albedoSampler).toBe(texture);
  expect(material.alpha).toBe(0.4);
  expect(material.needAlphaBlending()).toBe(true);
  h.engine.setShading(profile(false));
  expect(pbr.albedoTexture).toBe(texture);
  expect(h.scene.textures).toContain(texture);
});

it("실제 morph와 본 회전 후에도 hull의 기반 정점은 원본 스킨 결과와 일치한다", async () => {
  const h = await boot();
  h.engine.setShading(profile(true));
  const head = h.scene.getMeshByName("head") as Mesh;
  const hull = h.outlines().find((mesh) => mesh.name === "pressure-outline:head");
  if (!hull) throw new Error("머리 hull 없음");
  const before = skinnedPositions(head).positions;
  h.engine.applyPlan(applyPlanFixture({
    morphWeights: { "param:eyeSize:+": 0.8, "facs:jawOpen": 0.5 },
    boneRotations: { head: [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)] },
  }));
  const sourcePose = skinnedPositions(head).positions;
  const hullPose = skinnedPositions(hull).positions;
  expect(sourcePose).not.toEqual(before);
  expect(hullPose).toEqual(sourcePose);
});
