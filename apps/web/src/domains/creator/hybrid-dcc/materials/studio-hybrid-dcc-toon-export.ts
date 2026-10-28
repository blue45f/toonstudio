/** 실제 source face slot과 삼각형 index·출처를 함께 묶는 GLB 재질 계획이다. */
import { STUDIO_EDITABLE_MESH_LIMITS } from "../../studio-editable-half-edge-mesh";
import { sha256HexPortable } from "../../studio-sha256";

import { createStudioHybridDccToonGltfMaterial, type StudioHybridDccToonGltfMaterial } from "./studio-hybrid-dcc-toon-gltf";
import { hashStudioHybridDccToonMaterial, normalizeStudioHybridDccToonMaterial, studioToonMaterialObject, type StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

import type { StudioHybridDccMaterials } from "./studio-hybrid-dcc-material-table";

export type StudioHybridDccToonMaterialSlots = Readonly<Record<string, StudioHybridDccToonMaterial>>;
export function normalizeStudioHybridDccToonMaterialSlots(value: unknown): StudioHybridDccToonMaterialSlots {
  const slots = studioToonMaterialObject(value); const keys = Object.keys(slots);
  if (keys.length > STUDIO_EDITABLE_MESH_LIMITS.maxFaces) throw new Error("툰 내보내기 slot 수가 원본 면 예산을 넘었습니다.");
  return Object.freeze(Object.fromEntries(keys.sort((a, b) => Number(a) - Number(b)).map((slot) => {
    if (!/^(?:0|[1-9]\d*)$/u.test(slot) || !Number.isSafeInteger(Number(slot))) throw new Error("툰 내보내기 slot이 유효한 정수가 아닙니다.");
    return [slot, normalizeStudioHybridDccToonMaterial(slots[slot])];
  })));
}
export function hashStudioHybridDccToonMaterialSlots(value: StudioHybridDccToonMaterialSlots): string {
  return `toon-slots:sha256:${sha256HexPortable(new TextEncoder().encode(JSON.stringify(normalizeStudioHybridDccToonMaterialSlots(value))))}`;
}
export function resolveStudioHybridDccExportToonMaterials(table: StudioHybridDccMaterials | undefined, assetId: string, actualSlots?: ReadonlySet<number>): StudioHybridDccToonMaterialSlots | undefined {
  const binding = table && Object.hasOwn(table.bindings, assetId) ? table.bindings[assetId] : undefined;
  if (!table || !binding) return undefined;
  const entries = Object.entries(binding).filter(([slot]) => actualSlots === undefined || actualSlots.has(Number(slot)));
  if (!entries.length) return undefined;
  return normalizeStudioHybridDccToonMaterialSlots(Object.fromEntries(entries.map(([slot, id]) => {
    const material = Object.hasOwn(table.definitions, id) ? table.definitions[id] : undefined;
    if (!material || hashStudioHybridDccToonMaterial(material) !== id) throw new Error("툰 재질 정의와 binding 해시가 일치하지 않습니다.");
    return [slot, material];
  })));
}
export interface StudioHybridDccGlbMaterialPlan {
  readonly indices: readonly number[];
  readonly sourceFaceIds: readonly number[];
  readonly materials: readonly StudioHybridDccToonGltfMaterial[];
  readonly primitives: readonly { readonly slot: number; readonly material?: number; readonly start: number; readonly indices: readonly number[]; readonly sourceFaceIds: readonly number[] }[];
}
export function planStudioHybridDccGlbMaterials(slots: StudioHybridDccToonMaterialSlots,
  faces: readonly { readonly id: number; readonly materialSlot: number }[], indices: readonly number[], sourceFaceIds: readonly number[]): StudioHybridDccGlbMaterialPlan {
  if (indices.length !== sourceFaceIds.length * 3) throw new Error("GLB 재질 계획의 삼각형과 원본 면 수가 맞지 않습니다.");
  const normalized = normalizeStudioHybridDccToonMaterialSlots(slots); const faceSlots = new Map(faces.map(({ id, materialSlot }) => [id, materialSlot]));
  const actualSlots = new Set(faces.map(({ materialSlot }) => materialSlot));
  for (const slot of Object.keys(normalized)) if (!actualSlots.has(Number(slot))) throw new Error("툰 내보내기 재질이 원본에 없는 면 slot을 참조합니다.");
  const groups = new Map<number, { indices: number[]; sourceFaceIds: number[] }>();
  for (const [triangle, id] of sourceFaceIds.entries()) {
    const slot = faceSlots.get(id); if (slot === undefined) throw new Error("GLB 삼각형의 원본 면 slot이 없습니다.");
    const group = groups.get(slot) ?? { indices: [], sourceFaceIds: [] };
    for (let corner = 0; corner < 3; corner += 1) { const index = indices[triangle * 3 + corner]; if (index === undefined) throw new Error("GLB 삼각형 index가 없습니다."); group.indices.push(index); }
    group.sourceFaceIds.push(id); groups.set(slot, group);
  }
  const materials: StudioHybridDccToonGltfMaterial[] = [], outputIndices: number[] = [], outputFaces: number[] = [];
  const byHash = new Map<string, number>(); const primitives: StudioHybridDccGlbMaterialPlan["primitives"][number][] = [];
  for (const [slot, group] of [...groups].sort(([a], [b]) => a - b)) {
    const dto = normalized[String(slot)]; let material: number | undefined;
    if (dto) {
      const hash = hashStudioHybridDccToonMaterial(dto); material = byHash.get(hash);
      if (material === undefined) { material = materials.length; materials.push(createStudioHybridDccToonGltfMaterial(dto)); byHash.set(hash, material); }
    }
    primitives.push({ slot, ...(material === undefined ? {} : { material }), start: outputIndices.length, ...group });
    for (const index of group.indices) outputIndices.push(index);
    for (const faceId of group.sourceFaceIds) outputFaces.push(faceId);
  }
  return { indices: outputIndices, sourceFaceIds: outputFaces, materials, primitives };
}
