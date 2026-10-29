import { hashStudioEditableMesh, createStudioUnitCubeMesh } from "../../studio-editable-half-edge-mesh";
import { exportStudioHybridDccMeshGlb } from "../studio-hybrid-dcc-glb-export";
import { unwrapStudioMeshCornerUvs } from "../studio-hybrid-dcc-uv-edit";

interface FixtureGltfDocument {
  nodes: Array<{ name: string; mesh: number; translation: number[]; scale?: number[] }>;
  scene: number;
  scenes: Array<{ nodes: number[] }>;
  materials: Array<{ name: string }>;
  meshes: Array<{ primitives: Array<Record<string, unknown>> }>;
}

/** 제품 exporter가 만든 실제 UV GLB에 장면 노드·primitive 복수를 추가한다. */
export function nativeImportGlbFixture(multiple = false): Uint8Array {
  const plain = createStudioUnitCubeMesh(); const mesh = { ...plain, uvLayer: unwrapStudioMeshCornerUvs(plain) };
  const exported = exportStudioHybridDccMeshGlb({ assetId: "cube", mesh, sourceRevision: 1, sourceHash: hashStudioEditableMesh(mesh) });
  if (!exported.ok) throw new Error("GLB 가져오기 fixture 생성에 실패했습니다.");
  if (!multiple) return Uint8Array.from(exported.bytes);
  const source = new DataView(exported.bytes.buffer, exported.bytes.byteOffset, exported.bytes.byteLength);
  const jsonLength = source.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(exported.bytes.subarray(20, 20 + jsonLength))) as FixtureGltfDocument;
  const bin = exported.bytes.subarray(28 + jsonLength);
  json.nodes = [{ name: "책상", mesh: 0, translation: [2, 3, 4] }, { name: "소품", mesh: 0, translation: [-2, 0, 1], scale: [2, 1, 1] }];
  json.scene = 0; json.scenes = [{ nodes: [0, 1] }];
  json.materials = [{ name: "표면 A" }, { name: "표면 B" }];
  const firstMesh = json.meshes[0]; const primitive = firstMesh?.primitives[0];
  if (!firstMesh || !primitive) throw new Error("GLB fixture의 메시가 없습니다.");
  firstMesh.primitives = [0, 1].map((material) => ({ ...primitive, material }));
  const encoded = new TextEncoder().encode(JSON.stringify(json)); const padded = Math.ceil(encoded.length / 4) * 4;
  const bytes = new Uint8Array(28 + padded + bin.length); bytes.fill(32, 20, 20 + padded);
  const view = new DataView(bytes.buffer); view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(encoded, 20);
  view.setUint32(20 + padded, bin.length, true); view.setUint32(24 + padded, 0x004e4942, true); bytes.set(bin, 28 + padded);
  return bytes;
}

export function nativeImportObjFixture(): Uint8Array {
  return Uint8Array.from(new TextEncoder().encode("mtllib surface.mtl\no First\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0.1 0.2\nvt 0.9 0.2\nvt 0.1 0.8\nvn 0 0 1\nusemtl Ink\ns 1\nf 1/1/1 2/2/1 3/3/1\no Second\nusemtl Paper\nf -3/1/1 -2/2/1 -1/3/1\n"));
}
