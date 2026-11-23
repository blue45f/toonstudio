/**
 * 키트 v2/v3 런타임 로더 확장 헬퍼(`render/babylon/kit-loader.ts` 보조 모듈).
 *
 * - 층 의상(`inner`/`top`/`outer`/`legwear`)·추가 강체 소품 파일 전개
 * - 강체(`skinned: false`) 메시의 앵커 본(`anchors[name].joint` + `offsetM`) 직접 페어런팅
 * - 멀티채널 리컬러(`KitV2Material.channel`) 및 `shape:<name>:±` morph 통합
 * - `uv1` (`hair-flow` / `pattern`) 실측 판정 및 v2 허용 확장(`KHR_mesh_quantization`) 판별
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { KIT_ALLOWED_EXTENSIONS, KIT_FORBIDDEN_EXTENSIONS, KIT_V2_ALLOWED_EXTENSIONS, failVisible, readKitPlanV2Custom, rolePartId } from "../../contracts";

import { identityNode, readGlbInfo } from "./kit-glb-node-info";
import { RigBindError } from "./mesh-binding";

import type {
  AccessoryAnchor,
  ChannelKey,
  KitMesh,
  KitPartPlan,
  KitPlan,
  KitPlanV2CustomView,
  KitPlanV2FileView,
  KitV2Material,
  KitV2Mesh,
  PartRole,
  PartScope,
} from "../../contracts";
import type { RigBone } from "./character-rig";
import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

export interface ExpandedKitPartPlan extends KitPartPlan {
  readonly v2File?: KitPlanV2FileView;
}

/** v1/v2 플랜에서 로드할 파일 목록을 전개한다(v2는 `custom.files`의 층·추가 소품 파일 포함). */
export function expandKitPlanParts(plan: KitPlan): readonly ExpandedKitPartPlan[] {
  const custom = readKitPlanV2Custom(plan);
  if (!custom) return plan.parts;
  const byId = new Map(custom.files.map((file) => [file.id, file] as const));
  const out: ExpandedKitPartPlan[] = plan.parts.map((part) => {
    const v2File = byId.get(part.id);
    return v2File ? { ...part, v2File } : part;
  });
  const included = new Set(out.map((part) => part.id));
  for (const file of custom.files) {
    if (included.has(file.id)) continue;
    const meshes: KitMesh[] = file.meshes.map((mesh) => ({
      node: mesh.node,
      ...(mesh.role !== undefined ? { role: mesh.role } : {}),
      ...(mesh.primitiveRoles !== undefined ? { primitiveRoles: mesh.primitiveRoles } : {}),
      ...(mesh.material !== undefined ? { material: mesh.material } : {}),
      ...(mesh.primitiveMaterials !== undefined ? { primitiveMaterials: mesh.primitiveMaterials } : {}),
      ...(mesh.lod !== undefined ? { lod: mesh.lod } : {}),
      ...(mesh.skinned === true ? { skinned: true } : {}),
      triangles: mesh.triangles,
      vertices: mesh.vertices,
      morphs: mesh.morphs as unknown as KitMesh["morphs"],
    }));
    out.push({
      id: file.id,
      kind: file.kind === "base" ? "base" : "part",
      slot: file.slot,
      url: file.url,
      sha256: file.sha256,
      bytes: file.bytes,
      meshes,
      hides: file.hides,
      v2File: file,
    });
  }
  return out;
}

/** 플랜 버전에 맞는 허용 glTF 확장 목록(v2는 `KHR_mesh_quantization` 허용). */
export function allowedExtensionsForPlan(plan: KitPlan): readonly string[] {
  return readKitPlanV2Custom(plan) !== null
    ? [...KIT_ALLOWED_EXTENSIONS, ...KIT_V2_ALLOWED_EXTENSIONS]
    : KIT_ALLOWED_EXTENSIONS;
}

/** v2 파일 선언에서 특정 노드의 v2 메시 메타를 찾는다. */
export function findV2Mesh(part: ExpandedKitPartPlan, nodeName: string): KitV2Mesh | undefined {
  return part.v2File?.meshes.find((mesh) => mesh.node === nodeName);
}

/** 메시가 강체(`skinned: false`)인지 판정한다(v1은 항상 스킨 메시). */
export function isRigidV2Mesh(part: ExpandedKitPartPlan, nodeName: string): boolean {
  const v2 = findV2Mesh(part, nodeName);
  return v2?.skinned === false;
}

/** 강체 메시를 베이스 스켈레톤의 앵커 본(`joint` + `offsetM`)에 직접 페어런팅한다. */
export function parentRigidMeshToAnchor(
  mesh: Mesh,
  anchorName: AccessoryAnchor | null,
  custom: KitPlanV2CustomView | null,
  bones: ReadonlyMap<string, RigBone>,
  fallbackRoot: TransformNode,
): boolean {
  const anchor = anchorName ? custom?.base.anchors[anchorName] : undefined;
  const bone = anchor ? bones.get(anchor.joint) : undefined;
  if (!anchor || !bone) {
    mesh.parent = fallbackRoot;
    return false;
  }
  mesh.skeleton = null;
  mesh.parent = bone.node;
  mesh.position.copyFrom(new Vector3(anchor.offsetM[0], anchor.offsetM[1], anchor.offsetM[2]));
  return true;
}

/** v2 재질 맵에서 멀티채널 리컬러 채널 키를 읽는다. */
export function resolveV2ChannelKey(custom: KitPlanV2CustomView | null, materialName: string): ChannelKey | undefined {
  const mat: KitV2Material | undefined = custom?.materials[materialName];
  if (!mat || mat.tint.mode !== "recolor") return undefined;
  return mat.channel;
}

/** v2 파일·역할·채널 조합에 충돌 없는 파츠 ID와 고유 키를 할당한다. */
export function resolveKitRigPartIdentity(input: {
  readonly role: PartRole;
  readonly materialName: string;
  readonly channelKey: ChannelKey | undefined;
  readonly partPlan: ExpandedKitPartPlan;
  readonly existingPartIds: ReadonlySet<number>;
}): { readonly id: string; readonly partId: number; readonly scope: PartScope | undefined } {
  const basePartId = rolePartId(input.role);
  const scope = input.partPlan.v2File?.scope ?? undefined;
  const isExtraLayerOrInstance = input.partPlan.v2File?.kind === "accessory" || input.partPlan.v2File?.kind === "layer";
  if (!isExtraLayerOrInstance && !input.existingPartIds.has(basePartId)) {
    return { id: input.role, partId: basePartId, scope };
  }
  const suffix = input.partPlan.v2File?.instanceId ?? input.partPlan.v2File?.layer ?? input.channelKey ?? input.materialName;
  let nextId = Math.max(100, basePartId + 100);
  while (input.existingPartIds.has(nextId)) nextId += 1;
  return {
    id: `${input.role}:${suffix}`,
    partId: nextId,
    scope,
  };
}

/** 메시 목록의 실제 `uv2` 버퍼와 v2 `uv1.purpose` 선언으로 `hair-flow`/`pattern` 사용 가능 여부를 판정한다. */
export function inspectV2MeshUv1(
  meshes: readonly Mesh[],
  v2Mesh: KitV2Mesh | undefined,
): { readonly hairFlowUv: boolean; readonly patternUv: boolean } {
  const hasUv2 = meshes.length > 0 && meshes.every((mesh) => mesh.isVerticesDataPresent("uv2"));
  if (!hasUv2 || !v2Mesh?.uv1) return { hairFlowUv: false, patternUv: false };
  return {
    hairFlowUv: v2Mesh.uv1.purpose === "hair-flow",
    patternUv: v2Mesh.uv1.purpose === "pattern",
  };
}

/** GLB JSON 헤더 단계에서 금지 확장과 비항등 스킨 노드 변환을 검사한다. */
export function validateKitGlbJson(part: ExpandedKitPartPlan, bytes: Uint8Array, plan: KitPlan, now: number): void {
  const info = readGlbInfo(bytes);
  if (!info) return;
  const forbidden: readonly string[] = KIT_FORBIDDEN_EXTENSIONS;
  const allowed: readonly string[] = allowedExtensionsForPlan(plan);
  const bad = [...new Set([...info.used, ...info.required])].filter((name) => forbidden.includes(name));
  const unsupported = info.required.filter((name) => !allowed.includes(name));
  const offenders = [...new Set([...bad, ...unsupported])];
  if (offenders.length > 0) {
    throw new RigBindError(
      failVisible("kit-unsupported-extension", `키트 GLB가 허용되지 않은 glTF 확장을 씁니다: ${offenders.join(", ")} (${part.url}). 압축·외부 디코더 확장은 키트에서 금지입니다.`, undefined, now),
    );
  }
  const moved = info.nodes.filter((node) => node.skinned && !isRigidV2Mesh(part, node.name) && !identityNode(node)).map((node) => node.name);
  if (moved.length > 0) {
    const summary = moved.length <= 5 ? moved.join(", ") : `${moved.slice(0, 5).join(", ")} 외 ${moved.length - 5}개`;
    throw new RigBindError(
      failVisible("kit-transform-invalid", `키트 GLB의 스킨 메시 노드 변환이 항등이 아닙니다: ${summary} (${part.url}). 스킨 메시 노드는 이동·회전 0, 스케일 1이어야 합니다.`, undefined, now),
    );
  }
}

/** 병렬 상한을 두고 비동기 작업을 순차 배치 실행한다. */
export async function mapWithParallelLimit<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failed = false;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (!failed) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await work(items[index] as T);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  await Promise.all(runners);
  return results;
}

/** 컨테이너에서 이미 해제된 항목을 제거해 이중 해제를 막는다. */
export function pruneDisposedFromContainer(container: AssetContainer): void {
  const keep = <T extends { isDisposed(): boolean }>(items: T[]): void => {
    for (let i = items.length - 1; i >= 0; i -= 1) if (items[i]?.isDisposed()) items.splice(i, 1);
  };
  keep(container.meshes);
  keep(container.transformNodes);
  keep(container.rootNodes);
}
