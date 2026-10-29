/** 자산의 실제 face slot과 내용 해시로 결합된 재질 표. island·cache 등 파생 데이터를 권위로 쓰지 않는다. */
import { sha256HexPortable } from "../../studio-sha256";
import { STUDIO_EDITABLE_MESH_LIMITS } from "../../studio-editable-half-edge-mesh";

import { hashStudioHybridDccToonMaterial, normalizeStudioHybridDccToonMaterial, studioToonMaterialObject, type StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

import type { StudioGeometryAuthorityRegistry } from "../../studio-geometry-authority";

export interface StudioHybridDccMaterials {
  readonly revision: 1;
  readonly definitions: Readonly<Record<string, StudioHybridDccToonMaterial>>;
  readonly bindings: Readonly<Record<string, Readonly<Record<string, string>>>>;
}
const MATERIAL_ID = /^toon-material:sha256:[0-9a-f]{64}$/u;
const SLOT = /^(?:0|[1-9]\d*)$/u;

/** strict 복원은 잘못된 참조를 거부한다. 내부 geometry 변경 후 reconcile만 없어진 asset/slot을 제거한다. */
export function normalizeStudioHybridDccMaterials(value: unknown, geometry: StudioGeometryAuthorityRegistry, reconcile = false): StudioHybridDccMaterials | undefined {
  if (value === undefined) return undefined;
  const table = studioToonMaterialObject(value, ["revision", "definitions", "bindings"]);
  if (table.revision !== 1) throw new Error("지원하지 않는 재질 표 revision입니다.");
  const definitions = studioToonMaterialObject(table.definitions); const bindings = studioToonMaterialObject(table.bindings);
  const normalized: Record<string, StudioHybridDccToonMaterial> = Object.fromEntries(Object.keys(definitions).sort().map((id) => {
    const material = normalizeStudioHybridDccToonMaterial(definitions[id]);
    if (!MATERIAL_ID.test(id) || id !== hashStudioHybridDccToonMaterial(material)) throw new Error("재질 정의의 내용 해시 ID가 일치하지 않습니다.");
    return [id, material] as const;
  }));
  const used = new Set<string>(); const output: Record<string, Readonly<Record<string, string>>> = {};
  for (const assetId of Object.keys(bindings).sort()) {
    const slots = studioToonMaterialObject(bindings[assetId]);
    const record = Object.hasOwn(geometry.records, assetId) ? geometry.records[assetId] : undefined;
    if (!record && !reconcile) throw new Error("재질 표가 현재 문서에 없는 자산을 참조합니다.");
    const actual = new Set(record?.mesh.faces.map(({ materialSlot }) => materialSlot));
    const entries: Array<readonly [string, string]> = [];
    for (const slot of Object.keys(slots).sort((a, b) => Number(a) - Number(b))) {
      const id = slots[slot]; const slotId = Number(slot);
      if (!SLOT.test(slot) || !Number.isSafeInteger(slotId) || typeof id !== "string" || !MATERIAL_ID.test(id) || !Object.hasOwn(normalized, id)) {
        throw new Error("재질 slot 또는 정의 참조가 올바르지 않습니다.");
      }
      if (!record || !actual.has(slotId)) { if (reconcile) continue; throw new Error("재질 표가 실제 면에 없는 slot을 참조합니다."); }
      entries.push([slot, id]); used.add(id);
    }
    if (entries.length) Object.defineProperty(output, assetId, { value: Object.freeze(Object.fromEntries(entries)), enumerable: true });
  }
  if (!used.size) return undefined;
  return Object.freeze({ revision: 1, definitions: Object.freeze(Object.fromEntries([...used].sort().map((id) => [id, normalized[id]!] as const))), bindings: Object.freeze(output) });
}

export function hashStudioHybridDccMaterials(materials: StudioHybridDccMaterials): string {
  return `materials:sha256:${sha256HexPortable(new TextEncoder().encode(JSON.stringify(materials)))}`;
}

export function setStudioHybridDccAssetToonMaterial(geometry: StudioGeometryAuthorityRegistry, previous: StudioHybridDccMaterials | undefined,
  assetId: string, requestedSlots: readonly number[], value: StudioHybridDccToonMaterial | null): StudioHybridDccMaterials | undefined {
  const record = Object.hasOwn(geometry.records, assetId) ? geometry.records[assetId] : undefined;
  if (!record) throw new Error("툰 재질을 적용할 자산이 현재 문서에 없습니다.");
  if (!Array.isArray(requestedSlots) || !requestedSlots.length || requestedSlots.length > STUDIO_EDITABLE_MESH_LIMITS.maxFaces) throw new Error("적용할 실제 재질 slot을 선택해야 합니다.");
  const actual = new Set(record.mesh.faces.map(({ materialSlot }) => materialSlot));
  const slots = [...new Set(requestedSlots)].sort((a, b) => a - b);
  if (slots.some((slot) => !Number.isSafeInteger(slot) || slot < 0 || !actual.has(slot))) throw new Error("실제 면이 사용하는 slot에만 툰 재질을 적용할 수 있습니다.");
  const material = value === null ? null : normalizeStudioHybridDccToonMaterial(value);
  const id = material ? hashStudioHybridDccToonMaterial(material) : null;
  const current = previous && Object.hasOwn(previous.bindings, assetId) ? previous.bindings[assetId] : undefined;
  if (slots.every((slot) => (current && Object.hasOwn(current, String(slot)) ? current[String(slot)] : null) === id)) return previous;
  const nextSlots: Record<string, string> = { ...current };
  for (const slot of slots) { if (id) nextSlots[String(slot)] = id; else delete nextSlots[String(slot)]; }
  return normalizeStudioHybridDccMaterials({ revision: 1, definitions: { ...previous?.definitions, ...(id && material ? { [id]: material } : {}) },
    bindings: { ...previous?.bindings, [assetId]: nextSlots } }, geometry);
}

export function duplicateStudioHybridDccMaterialBindings(materials: StudioHybridDccMaterials | undefined, sourceId: string, targetId: string): StudioHybridDccMaterials | undefined {
  if (!materials || !Object.hasOwn(materials.bindings, sourceId)) return materials;
  return { ...materials, bindings: { ...materials.bindings, [targetId]: materials.bindings[sourceId] } };
}
