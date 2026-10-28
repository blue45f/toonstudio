/** 재질 슬롯을 공통 표면 삼각형 순서에 대응시키며 정본·UV·삼각형 순서를 바꾸지 않는다. */
import type { StudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET } from "../../mesh-surface/studio-mesh-surface-interactive-budget";
import { planStudioMeshSurface } from "../../mesh-surface/studio-mesh-surface-plan";
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

const sourceSlots = new WeakMap<StudioEditableMesh, Float64Array>();
export function deriveStudioHybridDccTriangleMaterialSlots(mesh: StudioEditableMesh): Float64Array {
  const cached = sourceSlots.get(mesh); if (cached) return cached;
  const planned = planStudioMeshSurface(mesh, STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET, { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (!planned.ok) throw new Error(`재질 슬롯의 공통 표면을 읽지 못했습니다. (${planned.issue.code})`);
  const result = Float64Array.from(planned.value.triangles, ({ materialSlot }) => materialSlot);
  sourceSlots.set(mesh, result); return result;
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

const coalescedSlots = new WeakMap<Float64Array, { readonly key: string; readonly slots: Float64Array }>();
function presentationSlots(source: Float64Array, bindings: StudioHybridDccToonBindings): Float64Array {
  const unique = [...new Set(source)].sort((a, b) => a - b);
  const representative = new Map<string, number>(), bySlot = new Map<number, number>();
  for (const slot of unique) {
    const style = styleKey(bindings[String(slot)]);
    const first = representative.get(style) ?? slot;
    representative.set(style, first); bySlot.set(slot, first);
  }
  if (unique.every((slot) => bySlot.get(slot) === slot)) return source;
  const key = JSON.stringify([...bySlot]);
  const cached = coalescedSlots.get(source); if (cached?.key === key) return cached.slots;
  const slots = source.map((slot) => bySlot.get(slot) ?? slot);
  coalescedSlots.set(source, { key, slots }); return slots;
}

export function deriveStudioHybridDccToonAssetProjection(state: StudioHybridDccDocumentState, assetId: string, mesh: StudioEditableMesh, sourceMeshHash: string, triangleCount: number, cached: boolean, preview?: StudioHybridDccToonMaterialPreview, projectedSlots?: Float64Array) {
  const toonMaterials = readStudioHybridDccToonBindings(state, assetId, sourceMeshHash, preview);
  if (!Object.keys(toonMaterials).length) return {};
  if (cached && !projectedSlots) throw new Error("평가 캐시에 공통 표면의 재질 슬롯 대응이 없습니다.");
  const source = projectedSlots ?? deriveStudioHybridDccTriangleMaterialSlots(mesh);
  if (!(source instanceof Float64Array) || source.length !== triangleCount
    || source.some((slot) => !Number.isSafeInteger(slot) || slot < 0)) throw new Error("공통 표면의 삼각형과 재질 슬롯 대응이 잘못됐습니다.");
  return { toonMaterials, triangleMaterialSlots: presentationSlots(source, toonMaterials) };
}

export function studioHybridDccToonPresentationSignature(state: StudioHybridDccDocumentState, preview?: StudioHybridDccToonMaterialPreview): string {
  const record = preview && Object.hasOwn(state.geometry.records, preview.assetId) ? state.geometry.records[preview.assetId] : undefined;
  const valid = preview && record?.meshHash === preview.sourceMeshHash && state.stateHash === preview.sourceStateHash ? preview : undefined;
  if (!state.materials && !valid) return "";
  const input = [state.stateHash, valid ? [valid.assetId, valid.sourceMeshHash, valid.sourceStateHash, valid.slots, hashStudioHybridDccToonMaterial(valid.material)] : null];
  return `:toon:${sha256HexPortable(new TextEncoder().encode(JSON.stringify(input)))}`;
}
