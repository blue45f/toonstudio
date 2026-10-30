import { Mesh, MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import { createStudioUnitCubeMesh, hashStudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import { exportStudioHybridDccMeshGlb, type StudioHybridDccMeshGlbExportInput } from "../studio-hybrid-dcc-glb-export";
import { hasValidStudioHybridDccPackedMeshChecksums, packStudioHybridDccGlbExportInput, unpackStudioHybridDccGlbExportInput } from "../studio-hybrid-dcc-glb-export-packed-mesh";
import { STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_INPUT_TRANSPORT, STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_MAX_RESPONSE_BYTES, STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_PROTOCOL_VERSION, isStudioHybridDccGlbExportWorkerResponse } from "../studio-hybrid-dcc-glb-export-worker-protocol";
import { unwrapStudioMeshCornerUvs } from "../studio-hybrid-dcc-uv-edit";

import { hashStudioHybridDccToonMaterialSlots, resolveStudioHybridDccExportToonMaterials } from "./studio-hybrid-dcc-toon-export";
import { createStudioHybridDccToonGltfMaterial } from "./studio-hybrid-dcc-toon-gltf";
import { createStudioHybridDccDefaultToonMaterial, hashStudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

interface JsonPrimitive {
  readonly attributes: Readonly<Record<string, number>>; readonly indices: number; readonly material?: number;
  readonly extras: { readonly toonSpectrum: { readonly sourceFaceIdsByTriangle: readonly number[]; readonly sourceMaterialSlot?: number } };
}
interface JsonGlb {
  readonly accessors: readonly { readonly bufferView: number; readonly byteOffset?: number; readonly count: number; readonly type: string }[];
  readonly bufferViews: readonly { readonly byteOffset?: number }[];
  readonly meshes: readonly { readonly primitives: readonly JsonPrimitive[] }[];
  readonly materials?: readonly ReturnType<typeof createStudioHybridDccToonGltfMaterial>[];
  readonly extensionsUsed?: readonly string[];
}
function fixture(): StudioHybridDccMeshGlbExportInput {
  const plain = createStudioUnitCubeMesh(); const slots = [7, 3, 7, 0, 3, 7];
  const mesh = { ...plain, faces: plain.faces.map((face, index) => ({ ...face, smooth: index % 2 === 0, materialSlot: slots[index] ?? 0 })), uvLayer: unwrapStudioMeshCornerUvs(plain) };
  const first = createStudioHybridDccDefaultToonMaterial();
  return { assetId: "toon-cube", mesh, sourceRevision: 2, sourceHash: hashStudioEditableMesh(mesh),
    toonMaterials: { "0": { ...first, shadeColorSrgb: "#123456" }, "3": first, "7": first } };
}
function exported(input: StudioHybridDccMeshGlbExportInput) {
  const result = exportStudioHybridDccMeshGlb(input); if (!result.ok) throw new Error(JSON.stringify(result.report)); return result;
}
function parse(bytes: Uint8Array): { json: JsonGlb; bin: DataView } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const length = view.getUint32(12, true);
  const json: JsonGlb = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  return { json, bin: new DataView(bytes.buffer, bytes.byteOffset + 28 + length, bytes.byteLength - 28 - length) };
}
function stream(bytes: Uint8Array): readonly unknown[] {
  const { json, bin } = parse(bytes); const triangles: Array<{ readonly face: number; readonly values: readonly number[] }> = [];
  for (const primitive of json.meshes[0]?.primitives ?? []) {
    const indices = json.accessors[primitive.indices]; if (!indices) throw new Error("index accessor가 없습니다.");
    const offset = (json.bufferViews[indices.bufferView]?.byteOffset ?? 0) + (indices.byteOffset ?? 0);
    for (let start = 0; start < indices.count; start += 3) {
      const face = primitive.extras.toonSpectrum.sourceFaceIdsByTriangle[start / 3]; if (face === undefined) throw new Error("source face가 없습니다.");
      const values: number[] = [];
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = bin.getUint32(offset + (start + corner) * 4, true);
        for (const semantic of ["POSITION", "NORMAL", "TEXCOORD_0"]) {
          const id = primitive.attributes[semantic]; const accessor = id === undefined ? undefined : json.accessors[id]; if (!accessor) continue;
          const components = accessor.type === "VEC2" ? 2 : 3;
          const base = (json.bufferViews[accessor.bufferView]?.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + vertex * components * 4;
          for (let axis = 0; axis < components; axis += 1) values.push(bin.getFloat32(base + axis * 4, true));
        }
      }
      triangles.push({ face, values });
    }
  }
  return triangles.sort((a, b) => a.face - b.face);
}

describe("실제 툰 GLB 내보내기와 Worker 전달", () => {
  it("modifier가 없앤 source slot은 내보낼 derivative의 실제 slot에서 제외한다", () => {
    const dto = createStudioHybridDccDefaultToonMaterial(), id = hashStudioHybridDccToonMaterial(dto);
    const table = { revision: 1 as const, definitions: { [id]: dto }, bindings: { cube: { "3": id, "7": id } } };
    expect(resolveStudioHybridDccExportToonMaterials(table, "cube", new Set([7]))).toEqual({ "7": dto });
    expect(resolveStudioHybridDccExportToonMaterials(table, "cube", new Set([0]))).toBeUndefined();
  });

  it("비연속 source slot별 primitive와 정확한 source face만 만들며 같은 style의 material을 재사용한다", () => {
    const input = fixture(); const result = exported(input); const { json } = parse(result.bytes);
    expect(json.materials).toHaveLength(2); expect(json.extensionsUsed).toEqual(["VRMC_materials_mtoon"]);
    expect(json.meshes[0]?.primitives.map(({ material, extras }) => [extras.toonSpectrum.sourceMaterialSlot, material, extras.toonSpectrum.sourceFaceIdsByTriangle])).toEqual([
      [0, 0, [3, 3]], [3, 1, [1, 1, 4, 4]], [7, 1, [0, 0, 2, 2, 5, 5]],
    ]);
    const { toonMaterials: _unused, ...plain } = input;
    expect(stream(result.bytes)).toEqual(stream(exported(plain).bytes));
    expect(result.report.losses.some(({ code }) => code === "material-slot-metadata-only")).toBe(false);
    expect(result.report.source.toonMaterialsHash).toBe(hashStudioHybridDccToonMaterialSlots(input.toonMaterials ?? {}));
    expect(hashStudioEditableMesh(input.mesh)).toBe(input.sourceHash);
    for (const material of json.materials ?? []) expect(material).toEqual(createStudioHybridDccToonGltfMaterial(material.extras.toonSpectrum.toonMaterial));
  });

  it("실제 GLTFLoader가 외부 fetch 없이 각 primitive와 linear PBR fallback을 읽는다", async () => {
    const result = exported(fixture()); const loaded = await new GLTFLoader().parseAsync(result.bytes.buffer, "");
    const meshes: Mesh[] = []; loaded.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    expect(meshes).toHaveLength(3);
    try {
      for (const mesh of meshes) {
        const material = mesh.material; expect(material).toBeInstanceOf(MeshStandardMaterial);
        if (!(material instanceof MeshStandardMaterial)) throw new Error("실제 PBR fallback 재질이 없습니다.");
        expect(material.metalness).toBe(0); expect(material.roughness).toBe(1); expect(material.transparent).toBe(false);
        expect(mesh.geometry.getAttribute("uv").count).toBe(mesh.geometry.getAttribute("position").count);
        expect(mesh.geometry.getAttribute("normal").count).toBe(mesh.geometry.getAttribute("position").count);
      }
    } finally { for (const mesh of meshes) { mesh.geometry.dispose(); for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose(); } }
  });

  it("optional 재질을 packed checksum·provenance에 묶고 malformed·재질변조를 거부한다", () => {
    const input = fixture(); const payload = packStudioHybridDccGlbExportInput(input);
    expect(hasValidStudioHybridDccPackedMeshChecksums(payload)).toBe(true);
    expect(unpackStudioHybridDccGlbExportInput(payload)?.toonMaterials).toEqual(input.toonMaterials);
    const changed = { ...payload, manifest: { ...payload.manifest, toonMaterials: { "0": createStudioHybridDccDefaultToonMaterial() } } };
    expect(hasValidStudioHybridDccPackedMeshChecksums(changed)).toBe(false);
    const rehashed = { ...changed, manifest: { ...changed.manifest, toonMaterialsHash: hashStudioHybridDccToonMaterialSlots(changed.manifest.toonMaterials) } };
    expect(unpackStudioHybridDccGlbExportInput(rehashed)).toBeNull();
    expect(() => packStudioHybridDccGlbExportInput({ ...input, toonMaterials: { "-1": createStudioHybridDccDefaultToonMaterial() } })).toThrow();
    expect(exportStudioHybridDccMeshGlb({ ...input, toonMaterials: { "99": createStudioHybridDccDefaultToonMaterial() } }).ok).toBe(false);
  });

  it("실제 worker entry가 transferable packed 입력을 풀어 재질 hash와 GLB 응답을 반환한다", async () => {
    const payload = packStudioHybridDccGlbExportInput(fixture());
    const request = { version: STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_PROTOCOL_VERSION, kind: "export-batch", requestId: 19,
      inputTransport: STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_INPUT_TRANSPORT, payloads: [payload], maxResponseBytes: STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_MAX_RESPONSE_BYTES };
    const listeners: Array<(event: MessageEvent<unknown>) => void> = []; const responses: unknown[] = [];
    vi.stubGlobal("self", { addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) { listeners.push(listener); },
      postMessage(value: unknown, transfer?: readonly Transferable[]) { responses.push(structuredClone(value, { transfer: transfer ? [...transfer] : [] })); } });
    try {
      await import("../studio-hybrid-dcc-glb-export.worker");
      const listener = listeners[0]; if (!listener) throw new Error("worker message handler가 없습니다.");
      listener(new MessageEvent("message", { data: structuredClone(request, { transfer: [payload.buffer] }) }));
      expect(payload.buffer.byteLength).toBe(0); expect(responses).toHaveLength(1);
      const response = responses[0]; expect(isStudioHybridDccGlbExportWorkerResponse(response)).toBe(true);
      if (!isStudioHybridDccGlbExportWorkerResponse(response) || response.kind !== "result") throw new Error("worker 결과가 없습니다.");
      const result = response.results[0]; if (!result?.ok) throw new Error("worker GLB가 없습니다.");
      expect(parse(new Uint8Array(result.bytes)).json.materials).toHaveLength(2);
      expect(result.report.source.toonMaterialsHash).toBe(payload.manifest.toonMaterialsHash);
    } finally { vi.unstubAllGlobals(); }
  });
});
