import { migrateBrushStudioV6LegacyMixboxMaterial } from "../brush-lab/brush-studio-v6-authoring-document";
import { normalizeBrushStudioV6MaterialConfig, type BrushStudioV6MaterialConfig } from "../brush-lab/brush-studio-v6-material-engine";
import { requiresLegacyMixboxStrokeMigration } from "../brush-lab/brush-studio-v6-legacy-pigment";
import { sameBrushStudioData } from "../brush-lab/brush-studio-data-equality";
import { isEffectivelyHidden, isEffectivelyLocked } from "../studio-layers";
import { parseStudioLegacyPigmentArchive } from "@toonstudio/contracts/studio-legacy-pigment-archive";
import { MAX_ID_LENGTH } from "../live/studio-crdt-document-constants";
import type { El, DrawEl } from "../studio-element-model";
import type { LayerGroup } from "../studio-layers";

function migrateMaterial(source: BrushStudioV6MaterialConfig): BrushStudioV6MaterialConfig {
  if (source.version === 2) {
    const migration = migrateBrushStudioV6LegacyMixboxMaterial(source);
    if (!migration) throw new Error("이전 혼색 실행 정보를 확인하지 못했습니다. 원본은 유지됩니다.");
    return migration.material;
  }
  // V1은 당시 접촉·팁 어댑터를 유지한다. V2로 올려 다른 획 동작까지 바꾸지 않는다.
  const normalized = normalizeBrushStudioV6MaterialConfig(source);
  if (!normalized || !sameBrushStudioData(normalized, source) || source.slots.pigment !== "pigment-mixbox") {
    throw new Error("이전 획 설정을 변경 없이 읽지 못했습니다. 원본은 유지됩니다.");
  }
  return { ...normalized, slots: { ...normalized.slots, pigment: "pigment-latent" } };
}

/** 활성 ID·z-order는 유지하고 원본만 별도 숨김 그룹에 보관한다. 입력은 변경하지 않는다. */
export function planLegacyPigmentStrokeCopies(
  elements: readonly El[], groups: readonly LayerGroup[], createId: () => string,
  options: { readonly archiveInGroup?: boolean } = {},
): { readonly elements: El[]; readonly groups: LayerGroup[]; readonly sourceIds: readonly string[]; readonly copyIds: readonly string[]; readonly archiveIds: readonly string[] } {
  const occupied = new Set([...elements.map((element) => element.id), ...groups.map((group) => group.id)]);
  const sourceIds: string[] = [];
  const copyIds: string[] = [];
  const archives: DrawEl[] = [];
  let archiveGroupId: string | null = null;
  const allocateId = () => {
    const id = createId();
    if (!id || occupied.has(id) || id.length > MAX_ID_LENGTH) throw new Error("자체 혼색 보관본의 새 식별자를 만들지 못했습니다.");
    occupied.add(id); return id;
  };
  const next = elements.map((element, sourceIndex): El => {
    if (element.type !== "draw" || (element.kind ?? "freehand") !== "freehand" || element.mode === "eraser" || isEffectivelyHidden(element, [...groups])
      || !requiresLegacyMixboxStrokeMigration(element.brushEnginePrograms?.material)) return element;
    if (isEffectivelyLocked(element, [...groups])) throw new Error("잠긴 이전 혼색 획이 있습니다. 잠금과 편집 권한을 먼저 확인하세요.");
    if (element.legacyPigmentArchive !== undefined) throw new Error("보관한 원본은 복구 자료로 다시 불러오세요. 보관 정보를 덮어쓰지 않았습니다.");
    const material = element.brushEnginePrograms?.material;
    if (!material || !element.brushEnginePrograms) throw new Error("이전 획의 재료 정보가 없습니다.");
    const migrated = migrateMaterial(material);
    if (options.archiveInGroup !== false) archiveGroupId ??= allocateId();
    const legacyPigmentArchive = parseStudioLegacyPigmentArchive({ version: 1, sourceElementId: element.id, sourceIndex,
      ...(element.groupId === undefined ? {} : { sourceGroupId: element.groupId }),
      ...(element.hidden === undefined ? {} : { sourceHidden: element.hidden }),
    });
    if (!legacyPigmentArchive) throw new Error("이전 획의 원본 관계를 보존하지 못했습니다.");
    const archive: DrawEl = { ...structuredClone(element), id: allocateId(), hidden: true, legacyPigmentArchive };
    if (archiveGroupId) archive.groupId = archiveGroupId;
    else delete archive.groupId;
    archives.push(archive);
    const copy: DrawEl = { ...structuredClone(element),
      brushEnginePrograms: { ...element.brushEnginePrograms, material: migrated },
    };
    sourceIds.push(element.id); copyIds.push(copy.id);
    return copy;
  });
  return { elements: [...archives, ...next], groups: archiveGroupId
    ? [{ id: archiveGroupId, name: "이전 Mixbox 원본", hidden: true, locked: true, collapsed: true }, ...groups]
    : [...groups], sourceIds, copyIds, archiveIds: archives.map((archive) => archive.id) };
}

/** 보관본의 identity·그룹·표시 여부를 손실 없이 되돌리는 순수 복구 자료다. 실제 적용은 별도 명령이 소유한다. */
export function restoreLegacyPigmentArchivedStroke(archive: DrawEl): { readonly element: DrawEl; readonly sourceIndex: number } | null {
  const metadata = parseStudioLegacyPigmentArchive(archive.legacyPigmentArchive);
  if (!metadata) return null;
  const { legacyPigmentArchive: _archive, ...element } = structuredClone(archive);
  element.id = metadata.sourceElementId;
  delete element.groupId; delete element.hidden;
  if (metadata.sourceGroupId !== undefined) element.groupId = metadata.sourceGroupId;
  if (metadata.sourceHidden !== undefined) element.hidden = metadata.sourceHidden;
  return { element, sourceIndex: metadata.sourceIndex };
}
