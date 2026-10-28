/** 재질 슬롯을 원본 fan 순서에 대응시키며 정본·UV·삼각형 순서를 바꾸지 않는다. */
import type { StudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import { sha256HexPortable } from "../../studio-sha256";
import type { StudioHybridDccDocumentState } from "../studio-hybrid-dcc-document";
import { hashStudioHybridDccToonMaterial, type StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

export type StudioHybridDccToonBindings = Readonly<Record<string, StudioHybridDccToonMaterial>>;
export interface StudioHybridDccToonMaterialPreview {
  readonly assetId: string;
  readonly sourceMeshHash: string;
  readonly sourceStateHash: string;
  readonly slots: readonly number[];
  readonly material: StudioHybridDccToonMaterial;
}
const styleHashes = new WeakMap<StudioHybridDccToonMaterial, string>();
function styleKey(material: StudioHybridDccToonMaterial | undefined): string {
  if (!material) return "default-pbr";
  if (!Object.isFrozen(material) || !Object.isFrozen(material.outline)) return hashStudioHybridDccToonMaterial(material);
  const cached = styleHashes.get(material); if (cached) return cached;
  const hash = hashStudioHybridDccToonMaterial(material); styleHashes.set(material, hash); return hash;
}

export function readStudioHybridDccToonBindings(
  state: StudioHybridDccDocumentState,
  assetId: string,
  sourceMeshHash: string,
  preview?: StudioHybridDccToonMaterialPreview,
): StudioHybridDccToonBindings {
  const result: Record<string, StudioHybridDccToonMaterial> = {};
  const table = state.materials;
  const slots = table && Object.hasOwn(table.bindings, assetId) ? table.bindings[assetId] : undefined;
  if (table && slots) for (const [slot, id] of Object.entries(slots)) {
    if (Object.hasOwn(table.definitions, id)) result[slot] = table.definitions[id]!;
  }
  if (preview?.assetId === assetId && preview.sourceMeshHash === sourceMeshHash && preview.sourceStateHash === state.stateHash) {
    for (const slot of preview.slots) result[String(slot)] = preview.material;
  }
  return result;
}

/** 슬롯 provenance가 없는 평가 캐시도 모든 원본 면이 같은 재질이면 안전하게 한 재질로 표시한다. */
export function canUseStudioHybridDccToonCache(mesh: StudioEditableMesh, bindings: StudioHybridDccToonBindings): boolean {
  let first: string | undefined;
  const bySlot = new Map<number, string>();
  for (const face of mesh.faces) {
    let key = bySlot.get(face.materialSlot);
    if (key === undefined) {
      const material = bindings[String(face.materialSlot)];
      key = styleKey(material);
      bySlot.set(face.materialSlot, key);
    }
    if (first !== undefined && first !== key) return false;
    first = key;
  }
  return true;
}

const sourceSlots = new WeakMap<StudioEditableMesh, Float64Array>();
export function deriveStudioHybridDccTriangleMaterialSlots(mesh: StudioEditableMesh): Float64Array {
  const cached = sourceSlots.get(mesh); if (cached) return cached;
  const slots: number[] = [];
  for (const face of mesh.faces) {
    let edgeId = face.he; let corners = 0;
    do {
      const edge = mesh.halfEdges[edgeId];
      if (!edge || edge.face !== face.id || corners >= mesh.halfEdges.length) throw new Error("재질 슬롯의 원본 면 순환을 읽지 못했습니다.");
      corners += 1; edgeId = edge.next;
    } while (edgeId !== face.he);
    for (let triangle = 0; triangle < corners - 2; triangle += 1) slots.push(face.materialSlot);
  }
  const result = Float64Array.from(slots); sourceSlots.set(mesh, result); return result;
}

export function deriveStudioHybridDccMaterialGroups(slots: Float64Array, indexCount: number) {
  if (!(slots instanceof Float64Array)) throw new Error("표시 재질 슬롯은 Float64 배열이어야 합니다.");
  if (indexCount % 3 !== 0 || slots.length * 3 !== indexCount) throw new Error("표시 삼각형과 재질 슬롯 수가 맞지 않습니다.");
  const materialSlots = [...new Set(slots)].sort((a, b) => a - b);
  const materialIndices = new Map(materialSlots.map((slot, index) => [slot, index]));
  const groups: Array<{ start: number; count: number; materialIndex: number }> = [];
  for (let triangle = 0; triangle < slots.length; triangle += 1) {
    const slot = slots[triangle];
    if (slot === undefined || !Number.isSafeInteger(slot) || slot < 0) throw new Error("표시 재질 슬롯이 허용 범위를 벗어났습니다.");
    const materialIndex = materialIndices.get(slot);
    if (materialIndex === undefined) throw new Error("표시 재질 인덱스가 없습니다.");
    const previous = groups.at(-1);
    if (previous?.materialIndex === materialIndex) previous.count += 3;
    else groups.push({ start: triangle * 3, count: 3, materialIndex });
  }
  return { materialSlots, groups };
}

const coalescedSlots = new WeakMap<StudioEditableMesh, { readonly key: string; readonly slots: Float64Array }>();
function sourcePresentationSlots(mesh: StudioEditableMesh, bindings: StudioHybridDccToonBindings): Float64Array {
  const source = deriveStudioHybridDccTriangleMaterialSlots(mesh);
  const unique = [...new Set(source)].sort((a, b) => a - b);
  const representative = new Map<string, number>(), bySlot = new Map<number, number>();
  for (const slot of unique) {
    const style = styleKey(bindings[String(slot)]);
    const first = representative.get(style) ?? slot;
    representative.set(style, first); bySlot.set(slot, first);
  }
  if (unique.every((slot) => bySlot.get(slot) === slot)) return source;
  const key = JSON.stringify([...bySlot]);
  const cached = coalescedSlots.get(mesh); if (cached?.key === key) return cached.slots;
  const slots = source.map((slot) => bySlot.get(slot) ?? slot);
  coalescedSlots.set(mesh, { key, slots }); return slots;
}
const uniformCacheSlots = new WeakMap<StudioEditableMesh, { readonly count: number; readonly slot: number; readonly slots: Float64Array }>();
function cachedPresentationSlots(mesh: StudioEditableMesh, count: number): Float64Array {
  const slot = mesh.faces[0]?.materialSlot ?? 0;
  const previous = uniformCacheSlots.get(mesh); if (previous?.count === count && previous.slot === slot) return previous.slots;
  const slots = new Float64Array(count).fill(slot); uniformCacheSlots.set(mesh, { count, slot, slots }); return slots;
}

export function deriveStudioHybridDccToonAssetProjection(state: StudioHybridDccDocumentState, assetId: string, mesh: StudioEditableMesh, sourceMeshHash: string, triangleCount: number, cached: boolean, preview?: StudioHybridDccToonMaterialPreview) {
  const toonMaterials = readStudioHybridDccToonBindings(state, assetId, sourceMeshHash, preview);
  if (!Object.keys(toonMaterials).length) return {};
  if (cached && !canUseStudioHybridDccToonCache(mesh, toonMaterials)) throw new Error("평가 캐시에 서로 다른 재질 슬롯의 대응이 없습니다.");
  return { toonMaterials, triangleMaterialSlots: cached
    ? cachedPresentationSlots(mesh, triangleCount)
    : sourcePresentationSlots(mesh, toonMaterials) };
}

export function studioHybridDccToonPresentationSignature(state: StudioHybridDccDocumentState, preview?: StudioHybridDccToonMaterialPreview): string {
  const record = preview && Object.hasOwn(state.geometry.records, preview.assetId) ? state.geometry.records[preview.assetId] : undefined;
  const valid = preview && record?.meshHash === preview.sourceMeshHash && state.stateHash === preview.sourceStateHash ? preview : undefined;
  if (!state.materials && !valid) return "";
  const input = [state.stateHash, valid ? [valid.assetId, valid.sourceMeshHash, valid.sourceStateHash, valid.slots, hashStudioHybridDccToonMaterial(valid.material)] : null];
  return `:toon:${sha256HexPortable(new TextEncoder().encode(JSON.stringify(input)))}`;
}
