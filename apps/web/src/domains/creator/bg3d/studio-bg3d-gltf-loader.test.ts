import { Mesh, type Material, type Object3D } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readStudioMToonRuntimeIdentity } from "../mesh-materials/studio-mtoon-runtime-identity";
import { createStudioUnitCubeMesh, hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { createStudioHybridDccDefaultToonMaterial, hashStudioHybridDccToonMaterial } from "../hybrid-dcc/materials/studio-hybrid-dcc-toon-material";
import { loadVerifiedStudioBg3dGlbWithThree } from "../studio-background-3d-model";
import { sha256HexPortable } from "../studio-sha256";

import { createStudioBg3dGltfLoader } from "./studio-bg3d-gltf-loader";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { loadStudioBg3dModelByFormat } from "./studio-bg3d-model-loader";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";

function fixture() {
  const mesh = createStudioUnitCubeMesh(), material = { ...createStudioHybridDccDefaultToonMaterial(), shadingToony: 1 };
  const result = exportStudioHybridDccMeshGlb({ assetId: "mtoon-parser", mesh, sourceHash: hashStudioEditableMesh(mesh), sourceRevision: 1, toonMaterials: { "0": material } });
  if (!result.ok) throw new Error(JSON.stringify(result.report.errors));
  return { bytes: result.bytes, material };
}
function primitive(root: Object3D): Mesh {
  const found: Mesh[] = []; root.traverse((object) => { if (object instanceof Mesh) found.push(object); });
  expect(found).toHaveLength(1); const mesh = found[0]; if (!mesh) throw new Error("실제 GLB primitive가 없습니다."); return mesh;
}
function check(root: Object3D, backend: StudioBg3dMaterialBackend, materialHash: string) {
  const mesh = primitive(root), materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  expect(materials).toHaveLength(2);
  const body = materials[0], outline = materials[1]; if (!body || !outline) throw new Error("MToon 본체·외곽선이 없습니다.");
  expect(mesh.geometry.groups).toEqual([{ start: 0, count: 36, materialIndex: 0 }, { start: 0, count: 36, materialIndex: 1 }]);
  expect(mesh.geometry.index?.count).toBe(36);
  materials.forEach((material, index) => {
    expect(readStudioMToonRuntimeIdentity(material)?.backend).toBe(backend);
    expect(Reflect.get(material, "isOutline")).toBe(index === 1);
    expect(Reflect.get(material, "shadingToonyFactor")).toBe(1);
    expect(material.userData.toonSpectrum?.toonMaterialHash).toBe(materialHash);
  });
  expect(body.side).toBe(2); expect(outline.side).toBe(1);
  return materials;
}
function dispose(root: Object3D) {
  root.traverse((object) => { if (object instanceof Mesh) {
    object.geometry.dispose(); const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  } });
}
afterEach(() => vi.restoreAllMocks());

describe("공통 lazy MToon GLTFLoader의 실제 자체 GLB parse", () => {
  it.each(["webgl", "webgpu"] as const)("%s는 VRM 문서 없이 guarded 본체·outline과 같은 source metadata를 만든다", async (materialBackend) => {
    const { bytes, material } = fixture(), loader = await createStudioBg3dGltfLoader({ materialBackend });
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("이 자체 포함 GLB는 외부 fetch를 하면 안 됩니다."));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    try {
      const materials = check(gltf.scene, materialBackend, hashStudioHybridDccToonMaterial(material));
      for (const source of materials) {
        const clone = source.clone(); try { expect(readStudioMToonRuntimeIdentity(clone)?.backend).toBe(materialBackend); } finally { clone.dispose(); }
      }
      expect(gltf.userData.vrm).toBeUndefined(); expect(gltf.userData.vrmMToonMaterials).toHaveLength(2); expect(fetch).not.toHaveBeenCalled();
    } finally { dispose(gltf.scene); }
  });

  it.each(["webgl", "webgpu"] as const)("%s 요청은 generic·검증된 실제 소비자 모두 같은 parser를 통과한다", async (materialBackend) => {
    const { bytes, material } = fixture(), hash = sha256HexPortable(bytes), expected = hashStudioHybridDccToonMaterial(material);
    const generic = await loadStudioBg3dModelByFormat({ data: bytes, format: "glb" }, { materialBackend });
    try { check(generic, materialBackend, expected); } finally { dispose(generic); }
    const verification = await validateStudioBg3dGlb(bytes, { declared: { byteSize: bytes.byteLength, sha256: hash, mimeType: "model/gltf-binary" },
      cumulative: { usedBytes: 0, maximumBytes: 128 * 1024 * 1024 }, profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, digest: async () => hash });
    if (!verification.ok) throw new Error(verification.code);
    const verified = await loadVerifiedStudioBg3dGlbWithThree(verification, createDefaultStudioBg3dSceneDocument().budgets, { materialBackend });
    if (!verified.ok) throw new Error(verified.code);
    try { check(verified.root, materialBackend, expected); expect(verified.metrics.drawCalls).toBe(2); expect(verified.metrics.materials).toBe(2); }
    finally { verified.dispose(); }
  });
});
