/**
 * 키트 v2 메시 선언에서 읽는 사실(순수, 2026-10-23 A-1): 칠하는 채널·형태 키 범위·강체 메시·UV1·삼각형 수.
 * 계획(`kit-plan-v2.ts`)과 능력 판정(`kit-custom-capability.ts`)이 같은 규칙을 쓰도록 한곳에 둔다.
 */
import { CHANNEL_KEYS, parseShapeMorphName } from "../../contracts";

import { shapeLabelKo } from "./custom-labels";

import type { KitPlanShape } from "./kit-plan-v2-types";
import type { ChannelKey, KitV2Material, KitV2Mesh } from "../../contracts";

/** 메시가 쓰는 재질 이름(단일 또는 프리미티브별) */
export function meshMaterialNames(mesh: KitV2Mesh): readonly string[] {
  return mesh.material !== undefined ? [mesh.material] : (mesh.primitiveMaterials ?? []);
}

/** 채널 집합을 계약 순서(`CHANNEL_KEYS`)로 */
export function sortChannels(channels: Iterable<ChannelKey>): ChannelKey[] {
  const set = new Set(channels);
  return CHANNEL_KEYS.filter((key) => set.has(key));
}

/** 메시가 칠하는 채널(recolor 재질의 채널). 고정색 재질은 채널이 없다. */
export function meshChannels(mesh: KitV2Mesh, materials: Readonly<Record<string, KitV2Material>>): ChannelKey[] {
  const channels: ChannelKey[] = [];
  for (const name of meshMaterialNames(mesh)) {
    const material = materials[name];
    if (material?.tint.mode === "recolor" && material.channel !== undefined) channels.push(material.channel);
  }
  return channels;
}

/** 메시들이 칠하는 채널(계약 순서) */
export function channelsOfMeshes(meshes: readonly KitV2Mesh[], materials: Readonly<Record<string, KitV2Material>>): ChannelKey[] {
  return sortChannels(meshes.flatMap((mesh) => meshChannels(mesh, materials)));
}

/**
 * 선언한 형태 이름 중 메시들(그리는 메시)에 실제로 있는 것과 값 범위. ± morph가 둘 다 없으면(그 LOD에 형태 morph가 없다) 빠진다.
 * 순서는 선언 순서다(작가가 정한 슬라이더 순서).
 */
export function shapesOfMeshes(declared: readonly string[], meshes: readonly KitV2Mesh[]): KitPlanShape[] {
  const plus = new Set<string>();
  const minus = new Set<string>();
  for (const mesh of meshes) {
    for (const morph of mesh.morphs) {
      const parsed = parseShapeMorphName(morph);
      if (parsed === null) continue;
      (parsed.sign === "+" ? plus : minus).add(parsed.name);
    }
  }
  const shapes: KitPlanShape[] = [];
  for (const name of declared) {
    if (!plus.has(name) && !minus.has(name)) continue;
    shapes.push({ name, labelKo: shapeLabelKo(name), min: minus.has(name) ? -1 : 0, max: plus.has(name) ? 1 : 0 });
  }
  return shapes;
}

/** 강체(`skinned: false`) 메시 노드 이름 */
export function rigidMeshNames(meshes: readonly KitV2Mesh[]): string[] {
  return meshes.filter((mesh) => mesh.skinned === false).map((mesh) => mesh.node);
}

/** 모든 메시에 패턴용 UV1이 있는지(메시가 없으면 false) */
export function allHavePatternUv(meshes: readonly KitV2Mesh[]): boolean {
  return meshes.length > 0 && meshes.every((mesh) => mesh.uv1?.purpose === "pattern");
}

/** 모든 메시에 헤어 흐름 UV1이 있는지(메시가 없으면 false) */
export function allHaveHairFlowUv(meshes: readonly KitV2Mesh[]): boolean {
  return meshes.length > 0 && meshes.every((mesh) => mesh.uv1?.purpose === "hair-flow");
}

export function sumTriangles(meshes: readonly KitV2Mesh[]): number {
  let total = 0;
  for (const mesh of meshes) total += mesh.triangles;
  return total;
}
