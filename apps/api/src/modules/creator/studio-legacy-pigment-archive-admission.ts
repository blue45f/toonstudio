import { isDeepStrictEqual } from "node:util";
import { ConflictException } from "@nestjs/common";
import { isStudioLegacyPigmentArchiveSource, parseStudioLegacyPigmentArchive,
  STUDIO_LEGACY_PIGMENT_ARCHIVE_ELEMENT_EXTENSION_KEYS, STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY,
  type StudioLegacyPigmentArchive } from "@toonstudio/contracts/studio-legacy-pigment-archive";
import type { StudioCrdtScopedRecord } from "@toonstudio/contracts/studio-crdt-authoring";

type JsonObject = Record<string, unknown>;
interface ArchiveEntry {
  readonly element: JsonObject;
  readonly metadata: StudioLegacyPigmentArchive;
}
interface ArchiveContainer {
  readonly elements: readonly JsonObject[];
  readonly byId: ReadonlyMap<string, JsonObject>;
  readonly archives: ReadonlyMap<string, ArchiveEntry>;
  readonly groups: ReadonlyMap<string, JsonObject>;
}
function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}
function failure(message: string): never {
  throw new ConflictException({ code: "studio_legacy_pigment_archive_invalid", message });
}
function sameJson(left: unknown, right: unknown): boolean {
  // CRDT 투영의 미설정 속성은 JSON 저장과 같이 생략한다. 키 순서는 동일성에 영향을 주지 않는다.
  return isDeepStrictEqual(JSON.parse(JSON.stringify(left)), JSON.parse(JSON.stringify(right)));
}

/** 필드 유무만 조사한다. 일반 저장에서는 별도 투영이나 본문 복사를 하지 않는다. */
export function hasStudioLegacyPigmentArchives(document: unknown): boolean {
  const source = object(document), master = object(source?.master);
  const containers: unknown[] = [...(Array.isArray(source?.pagesList) ? source.pagesList : []), ...(master ? [master] : [])];
  return containers.some((value) => {
    const container = object(value);
    return Array.isArray(container?.elements) && container.elements.some((element: unknown) => {
      const entry = object(element); return entry !== null && Object.hasOwn(entry, "legacyPigmentArchive");
    });
  });
}
export function assertStudioLegacyPigmentArchiveReader(document: unknown, readerCapabilities: readonly string[]): void {
  if (hasStudioLegacyPigmentArchives(document) && !readerCapabilities.includes(STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY)) {
    throw new ConflictException({ code: "studio_legacy_pigment_archive_reader_upgrade_required",
      message: "이전 혼색 보관 원본을 유지하려면 최신 버전에서 원고를 동기화한 뒤 저장해 주세요." });
  }
}

function containers(document: unknown): ReadonlyMap<string, ArchiveContainer> {
  const source = object(document), result = new Map<string, ArchiveContainer>();
  const pages = Array.isArray(source?.pagesList) ? source.pagesList : [];
  const values: Array<{ key: string; raw: unknown; master: boolean }> = pages.map((raw: unknown) => {
    const page = object(raw);
    if (!page || typeof page.id !== "string" || !page.id) failure("이전 혼색 원본의 페이지 식별자를 확인할 수 없습니다.");
    return { key: `page:${page.id}`, raw, master: false };
  });
  if (source?.master !== undefined) values.push({ key: "master", raw: source.master, master: true });
  const identities = new Set<string>();
  for (const { key, raw, master } of values) {
    const container = object(raw);
    if (result.has(key) || !Array.isArray(container?.elements)) failure("이전 혼색 원본의 요소 목록이 올바르지 않습니다.");
    const elements: JsonObject[] = [], byId = new Map<string, JsonObject>(), archives = new Map<string, ArchiveEntry>();
    const groups = new Map<string, JsonObject>();
    for (const rawGroup of Array.isArray(container.groups) ? container.groups : []) {
      const group = object(rawGroup);
      if (group && typeof group.id === "string") groups.set(group.id, group);
    }
    for (const rawElement of container.elements) {
      const element = object(rawElement);
      if (!element || typeof element.id !== "string" || !element.id || identities.has(element.id)) failure("이전 혼색 원본의 요소 식별자가 중복되거나 올바르지 않습니다.");
      identities.add(element.id); elements.push(element); byId.set(element.id, element);
      if (!Object.hasOwn(element, "legacyPigmentArchive")) continue;
      const metadata = parseStudioLegacyPigmentArchive(element.legacyPigmentArchive);
      if (!metadata || element.id === metadata.sourceElementId || element.hidden !== true || !isStudioLegacyPigmentArchiveSource(element)) {
        failure("이전 혼색 원본의 복원 정보가 손상되었습니다.");
      }
      if (master) {
        if (element.groupId !== undefined || metadata.sourceGroupId !== undefined) failure("마스터 원본에는 페이지 그룹 관계를 기록할 수 없습니다.");
      }
      archives.set(element.id, { element, metadata });
    }
    result.set(key, { elements, byId, archives, groups });
  }
  return result;
}
function assertNewArchiveContext(key: string, container: ArchiveContainer, entry: ArchiveEntry): void {
  if (key === "master") return;
  const group = typeof entry.element.groupId === "string" ? container.groups.get(entry.element.groupId) : undefined;
  if (!group || group.hidden !== true || group.locked !== true) failure("새 이전 혼색 원본은 숨김·잠금 보관 그룹에 만들어야 합니다.");
  if (container.elements.some((candidate) => candidate.groupId === entry.element.groupId && !container.archives.has(String(candidate.id)))) {
    failure("새 이전 혼색 보관 그룹에는 보관 원본만 포함할 수 있습니다.");
  }
}
function assertImportedArchiveContext(key: string, container: ArchiveContainer, entry: ArchiveEntry): void {
  if (key !== "master" && entry.element.groupId !== undefined
    && (typeof entry.element.groupId !== "string" || !container.groups.has(entry.element.groupId))) {
    failure("가져온 이전 혼색 보관 원본의 현재 그룹 참조가 올바르지 않습니다.");
  }
}
function sameArchive(left: ArchiveEntry, right: ArchiveEntry): boolean {
  const leftElement = { ...left.element }, rightElement = { ...right.element };
  // 원래 소속은 sourceGroupId가 보존한다. 현재 그룹 해제·이동은 기존 레이어 명령이 소유한다.
  delete leftElement.groupId; delete rightElement.groupId;
  return sameJson(leftElement, rightElement);
}
function restored(entry: ArchiveEntry): JsonObject {
  const element: JsonObject = { ...entry.element, id: entry.metadata.sourceElementId };
  delete element.legacyPigmentArchive; delete element.groupId; delete element.hidden;
  if (Object.hasOwn(entry.metadata, "sourceGroupId")) element.groupId = entry.metadata.sourceGroupId;
  if (Object.hasOwn(entry.metadata, "sourceHidden")) element.hidden = entry.metadata.sourceHidden;
  return element;
}

/** 기존 v6의 기본 채널 삽입·7개 교환 필드 생략만 계산한다. 표본·기하·재료 값은 정규화하지 않는다. */
export function canonicalStudioLegacyPigmentV6Source(source: Readonly<JsonObject>): JsonObject {
  const result = { ...source };
  for (const key of STUDIO_LEGACY_PIGMENT_ARCHIVE_ELEMENT_EXTENSION_KEYS) delete result[key];
  if (!Array.isArray(source.points) || source.points.length % 2 !== 0) return result;
  const count = source.points.length / 2;
  result.kind ??= "freehand"; result.mode ??= "pen";
  if (source.pressures === undefined) result.pressures = Array<number>(count).fill(
    ["linear-full-v1", "linear-residual-v2", "linear-residual-path-v3"].includes(String(source.pressureModel)) ? 1 : 0.5);
  for (const key of ["tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures"]) {
    if (source[key] === undefined) result[key] = Array<number>(count).fill(0);
  }
  return result;
}

/**
 * 기존 쓰기 권한과 별개인 원본 보존 검사다. 새 프로젝트의 외부 복원 자료는 형식만 확인하며
 * 출처 필드를 서버 이력이나 이용 권한의 증거로 취급하지 않는다.
 */
export function assertStudioLegacyPigmentArchiveTransition(before: unknown, after: unknown,
  representedArchiveIds: ReadonlySet<string> = new Set()): void {
  if (!hasStudioLegacyPigmentArchives(before) && !hasStudioLegacyPigmentArchives(after)) return;
  const previous = containers(before), next = containers(after);
  const previousElements = new Map([...previous.values()].flatMap((container) => [...container.byId]));
  for (const [key, container] of previous) {
    const candidate = next.get(key);
    // 전체 페이지 삭제는 기존 페이지 삭제 권한·CAS 흐름이 소유한다.
    if (!candidate && key.startsWith("page:")) continue;
    for (const [id, entry] of container.archives) {
      if (representedArchiveIds.has(id)) continue;
      const current = candidate?.archives.get(id);
      if (current) {
        if (!sameArchive(current, entry)) failure("이미 보관한 이전 혼색 원본을 바꿀 수 없습니다.");
        continue;
      }
      if (candidate?.byId.has(id)) {
        failure("이전 혼색 원본이 누락되거나 복원 정보가 제거되었습니다. 최신 버전에서 동기화한 뒤 저장해 주세요.");
      }
      // 원소 자체의 명시 삭제·undo는 기존 쓰기 권한과 CAS가 소유한다. 영구 보관 정책을 추가하지 않는다.
    }
  }
  for (const [key, container] of next) for (const [id, entry] of container.archives) {
    const old = previous.get(key);
    if (old?.archives.has(id)) continue;
    if (previousElements.has(id)) failure("기존 요소 식별자를 이전 혼색 보관본에 재사용할 수 없습니다.");
    const source = old?.byId.get(entry.metadata.sourceElementId);
    if (!source) {
      // 새 작품·페이지·명시적 외부 자료 import는 이전 서버 원본을 주장하지 않는다.
      if (previousElements.has(entry.metadata.sourceElementId)) failure("다른 페이지의 요소를 이전 혼색 원본으로 바꿀 수 없습니다.");
      assertImportedArchiveContext(key, container, entry);
      continue;
    }
    assertNewArchiveContext(key, container, entry);
    if (Object.hasOwn(source, "legacyPigmentArchive") || old?.elements.indexOf(source) !== entry.metadata.sourceIndex
      || !isStudioLegacyPigmentArchiveSource(source) || !sameJson(source, restored(entry))) {
      failure("보관본이 실제 이전 혼색 원본과 일치하지 않습니다.");
    }
  }
}

export function studioLegacyPigmentArchiveRecordDocument(records: readonly StudioCrdtScopedRecord[]): unknown {
  const pages = new Map<string, { id: string; elements: unknown[]; groups: unknown[] }>();
  for (const record of records) {
    if (record.kind !== "stroke" && record.kind !== "group") continue;
    const page: { id: string; elements: unknown[]; groups: unknown[] } = pages.get(record.pageId) ?? { id: record.pageId, elements: [], groups: [] };
    if (record.kind === "stroke") page.elements.push(record.value); else page.groups.push(record.value);
    pages.set(record.pageId, page);
  }
  return { pagesList: [...pages.values()] };
}

/** 삭제 상태와 분리해 보관 본문을 검사한다. undo tombstone 안의 복구 자료도 다시 쓸 수 없다. */
export function assertStudioLegacyPigmentArchiveCrdtRecords(beforeDocument: unknown,
  beforeRecords: readonly StudioCrdtScopedRecord[], afterRecords: readonly StudioCrdtScopedRecord[]): void {
  const previous = containers(studioLegacyPigmentArchiveRecordDocument(beforeRecords)), next = containers(studioLegacyPigmentArchiveRecordDocument(afterRecords));
  const sources = containers(beforeDocument);
  for (const [key, container] of previous) for (const [id, entry] of container.archives) {
    const current = next.get(key)?.archives.get(id);
    if (!current) {
      if (next.get(key)?.byId.has(id)) failure("이전 혼색 보관 이력의 복원 정보를 제거할 수 없습니다.");
      continue;
    }
    if (!sameArchive(entry, current)) failure("삭제 이력 안의 이전 혼색 보관 원본도 변경할 수 없습니다.");
  }
  for (const [key, container] of next) for (const [id, entry] of container.archives) {
    if (previous.get(key)?.archives.has(id)) continue;
    if ([...previous.values()].some((old) => old.byId.has(id))) failure("기존 획 식별자를 보관 이력에 재사용할 수 없습니다.");
    const sourceContainer = sources.get(key), knownArchive = sourceContainer?.archives.get(id);
    if (knownArchive) {
      if (!sameArchive(knownArchive, entry)) failure("처음 게시한 보관 원본이 저장된 원본과 일치하지 않습니다.");
      continue;
    }
    const source = sourceContainer?.byId.get(entry.metadata.sourceElementId);
    if (source) assertNewArchiveContext(key, container, entry); else assertImportedArchiveContext(key, container, entry);
    if (source && (Object.hasOwn(source, "legacyPigmentArchive") || sourceContainer?.elements.indexOf(source) !== entry.metadata.sourceIndex
      || !isStudioLegacyPigmentArchiveSource(source) || !sameJson(source, restored(entry)))) {
      failure("보관 이력의 원본이 실제 이전 획과 일치하지 않습니다.");
    }
  }
}

/**
 * 이미 v6로 표현한 source가 baseline의 정확한 정규 표현이면 보관본의 생략 필드는 baseline이 증명한다.
 * 다른 수치나 필드를 허용하지 않으며, 보관본이 실제 baseline 원문과 같을 때만 이 경로를 사용한다.
 */
export function studioLegacyPigmentArchiveSourceAuthority(baseline: unknown, beforeDocument: unknown,
  afterDocument: unknown): unknown {
  const original = containers(baseline), before = containers(beforeDocument), after = containers(afterDocument);
  const replacements = new Map<string, JsonObject>();
  for (const [key, container] of after) for (const { metadata, element } of container.archives.values()) {
    const source = original.get(key)?.byId.get(metadata.sourceElementId), current = before.get(key)?.byId.get(metadata.sourceElementId);
    if (!source || !current || Object.hasOwn(source, "legacyPigmentArchive")) continue;
    const archived = restored({ element, metadata });
    if (sameJson(archived, source) && (sameJson(current, source) || sameJson(current, canonicalStudioLegacyPigmentV6Source(source)))) {
      replacements.set(metadata.sourceElementId, source);
    }
  }
  if (!replacements.size) return beforeDocument;
  const source = object(beforeDocument);
  if (!source) return beforeDocument;
  const replace = (raw: unknown): unknown => {
    const container = object(raw);
    return container && Array.isArray(container.elements) ? { ...container, elements: container.elements.map((value: unknown) => {
      const element = object(value); return element && typeof element.id === "string" ? replacements.get(element.id) ?? value : value;
    }) } : raw;
  };
  return { ...source, ...(Array.isArray(source.pagesList) ? { pagesList: source.pagesList.map(replace) } : {}),
    ...(source.master === undefined ? {} : { master: replace(source.master) }) };
}

/** baseline 뒤의 승인된 undo/redo는 재검증하지 않고, 아직 Y에 없는 원본만 초기화 손실에서 보호한다. */
export function assertStudioLegacyPigmentArchiveBaselineProjection(baseline: unknown, document: unknown,
  records: readonly StudioCrdtScopedRecord[]): void {
  const represented = containers(studioLegacyPigmentArchiveRecordDocument(records)), representedIds = new Set<string>();
  for (const [key, container] of containers(baseline)) for (const [id, entry] of container.archives) {
    const record = represented.get(key)?.archives.get(id);
    if (!record) continue;
    if (!sameArchive(entry, record)) failure("저장한 이전 혼색 원본과 팀 편집 원본이 일치하지 않습니다.");
    representedIds.add(id);
  }
  assertStudioLegacyPigmentArchiveTransition(baseline, document, representedIds);
}
