/**
 * GLB export: @babylonjs/serializers GLTF2Export.GLBAsync(동적 import로 serializers 청크 분리).
 * 리그 루트 아래 노드(메시·본 TransformNode·Armature)만 내보내고(카메라·조명 제외) `glTF` magic을 검증한다.
 * morph target·스킨은 serializer가 포함한다(본은 TransformNode에 링크되어 있어야 export된다 — mesh-binding 규약).
 */
import { failVisible } from "../../contracts";
import { sparsifyGlbMorphTargets } from "../glb-sparse-morph";
import { isPressureOutline } from "../pressure-outline-tag";

import type { SparseMorphReport } from "../glb-sparse-morph";
import type { CharacterRig } from "./character-rig";
import type { Node } from "@babylonjs/core/node.js";
import type { Scene } from "@babylonjs/core/scene.js";

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function isRigNode(rig: CharacterRig, node: Node): boolean {
  if (isPressureOutline(node)) return false;
  let cursor: Node | null = node;
  while (cursor) {
    if (cursor === rig.root) return true;
    cursor = cursor.parent;
  }
  return false;
}

/**
 * Babylon GLTF2Export가 메시 이름(`mesh.name`)이나 `mesh.extras.targetNames`를 비워 둔 경우
 * 씬의 MorphTargetManager 이름 배열로 보강해 재임포트 시 의미 기반 표정/얼굴 키 이름을 보존한다.
 */
function ensureGlbMeshAndMorphNames(glb: Uint8Array, scene: Scene): Uint8Array {
  if (glb.byteLength < 20) return glb;
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) return glb;
  const jsonLen = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON || 20 + jsonLen > glb.byteLength) return glb;
  let doc: {
    nodes?: Array<{ name?: string; mesh?: number }>;
    meshes?: Array<{
      name?: string;
      primitives?: Array<{ targets?: unknown[] }>;
      extras?: Record<string, unknown>;
    }>;
  };
  try {
    doc = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen))) as typeof doc;
  } catch {
    return glb;
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.meshes) || !Array.isArray(doc.nodes)) return glb;

  let mutated = false;
  for (const node of doc.nodes) {
    if (node.mesh === undefined || !node.name) continue;
    const gltfMesh = doc.meshes[node.mesh];
    if (!gltfMesh) continue;
    if (!gltfMesh.name) {
      gltfMesh.name = node.name;
      mutated = true;
    }
    const targetCount = gltfMesh.primitives?.[0]?.targets?.length ?? 0;
    if (targetCount === 0) continue;
    const existingNames = Array.isArray(gltfMesh.extras?.targetNames) ? gltfMesh.extras.targetNames : null;
    if (existingNames && existingNames.length === targetCount && existingNames.every((item) => typeof item === "string" && item.length > 0)) {
      continue;
    }
    const sceneMesh =
      scene.getMeshByName(node.name) ??
      scene.getMeshByName(`${node.name}_primitive0`);
    const manager = sceneMesh?.morphTargetManager;
    if (!manager || manager.numTargets !== targetCount) continue;
    const names: string[] = [];
    for (let i = 0; i < manager.numTargets; i += 1) {
      names.push(manager.getTarget(i).name || `morphTarget${i}`);
    }
    gltfMesh.extras = { ...(gltfMesh.extras ?? {}), targetNames: names };
    mutated = true;
  }
  if (!mutated) return glb;

  const binOffset = 20 + jsonLen;
  const hasBin = binOffset + 8 <= glb.byteLength && view.getUint32(binOffset + 4, true) === CHUNK_BIN;
  const binLen = hasBin ? view.getUint32(binOffset, true) : 0;
  const binBytes = hasBin ? glb.subarray(binOffset + 8, binOffset + 8 + binLen) : null;

  const nextJsonRaw = new TextEncoder().encode(JSON.stringify(doc));
  const nextJsonPaddedLen = (nextJsonRaw.byteLength + 3) & ~3;
  const totalLen = 12 + 8 + nextJsonPaddedLen + (binBytes ? 8 + binBytes.byteLength : 0);
  const out = new Uint8Array(totalLen);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, GLB_MAGIC, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, totalLen, true);
  outView.setUint32(12, nextJsonPaddedLen, true);
  outView.setUint32(16, CHUNK_JSON, true);
  out.set(nextJsonRaw, 20);
  out.fill(0x20, 20 + nextJsonRaw.byteLength, 20 + nextJsonPaddedLen);
  if (binBytes) {
    const nextBinHeader = 20 + nextJsonPaddedLen;
    outView.setUint32(nextBinHeader, binBytes.byteLength, true);
    outView.setUint32(nextBinHeader + 4, CHUNK_BIN, true);
    out.set(binBytes, nextBinHeader + 8);
  }
  return out;
}

export interface RigGlbExport {
  readonly glb: Uint8Array;
  /** morph sparse 정리 결과(변환할 것이 없거나 건너뛰었으면 `unchanged`) */
  readonly sparse: SparseMorphReport;
}

/**
 * 리그를 GLB로 직렬화한 뒤 morph target dense accessor를 sparse로 정리한다(`glb-sparse-morph.ts`). serializer는 변경량 0인 정점까지
 * dense로 써서 제작 패키지 Orion이 4.05 MB → 12.96 MB로 커졌는데 정리 뒤에는 원본 크기에 가깝다. 정리는 무손실이고 실패해도 내보내기를 막지 않는다
 * (건너뜀 사유가 `sparse.skipped`에 남는다).
 */
export async function exportRigGlbWithReport(scene: Scene, rig: CharacterRig, fileName = "character", now: number = Date.now()): Promise<RigGlbExport> {
  const serializers = await import("@babylonjs/serializers/glTF/2.0/index.js");
  let data: Awaited<ReturnType<typeof serializers.GLTF2Export.GLBAsync>>;
  try {
    data = await serializers.GLTF2Export.GLBAsync(scene, fileName, {
      shouldExportNode: (node) => isRigNode(rig, node),
      exportWithoutWaitingForScene: true,
    });
  } catch (error) {
    throw failVisible("glb-export-failed", "GLB 직렬화에 실패했습니다.", error, now);
  }
  const blob = data.glTFFiles[`${fileName}.glb`];
  if (!(blob instanceof Blob)) throw failVisible("glb-export-missing", `serializer가 ${fileName}.glb를 만들지 않았습니다.`, undefined, now);
  const rawBytes = new Uint8Array(await blob.arrayBuffer());
  if (rawBytes.byteLength < 12 || new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength).getUint32(0, true) !== GLB_MAGIC) {
    throw failVisible("glb-export-invalid", "serializer 출력이 GLB 컨테이너가 아닙니다.", undefined, now);
  }
  const namedBytes = ensureGlbMeshAndMorphNames(rawBytes, scene);
  const sparse = sparsifyGlbMorphTargets(namedBytes);
  return { glb: sparse.glb, sparse: sparse.report };
}

/** 정리된 GLB 바이트만 필요한 호출자용(기존 시그니처 유지) */
export async function exportRigGlb(scene: Scene, rig: CharacterRig, fileName = "character", now: number = Date.now()): Promise<Uint8Array> {
  return (await exportRigGlbWithReport(scene, rig, fileName, now)).glb;
}
