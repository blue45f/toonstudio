import { canonicalJson } from "@toonstudio/studio-project-model";
import { studioFrameClip } from "@toonstudio/studio-project-model/frame-clip";

import { studioCrdtProjectionGroupKey } from "@toonstudio/contracts/studio-crdt-authoring";

import type { StudioScopedEntityKind, StudioScopedWriteContext, StudioScopedWriteTarget } from "./studio-scoped-write";

export class StudioScopedWriteDeniedError extends Error {
  constructor(readonly code: "scope" | "context" | "policy" | "ambiguous" | "unresolved" = "scope") {
    super({ scope: "담당 범위 밖의 원고나 공용 설정은 변경할 수 없습니다.", context: "새 요소의 담당 위치와 현재 편집 정책을 다시 확인하세요.",
      policy: "편집 배정이나 정책이 변경됐습니다. 초안을 보존하고 현재 권한을 다시 확인하세요.",
      ambiguous: "원고의 명시적 귀속이나 효과 범위를 확인할 수 없습니다. 제작 관리자에게 범위 연결을 요청하세요.",
      unresolved: "아직 병합되지 않은 변경이 있습니다. 초안을 보존하고 최신 원고와 동기화한 뒤 다시 전송하세요." }[code]);
  }
}

export const scopedEntityKey = (kind: StudioScopedEntityKind, id: string, pageId?: string): string => {
  if (kind !== "group") return `${kind}:${id}`;
  if (!pageId) throw new StudioScopedWriteDeniedError("context");
  return `group:${studioCrdtProjectionGroupKey(pageId, id)}`;
};
/** 길이 prefix를 해석하되 실제 group ID·page ID는 바꾸지 않는다. */
export function scopedEntityIdentity(key: string): { kind: StudioScopedEntityKind; id: string; pageId?: string } | null {
  const separator = key.indexOf(":"), kind = key.slice(0, separator), encoded = key.slice(separator + 1);
  if (kind === "element" || kind === "stroke" || kind === "surface") return boundedId(encoded) ? { kind, id: encoded } : null;
  if (kind !== "group") return null;
  const first = encoded.indexOf(":"), pageLength = Number(encoded.slice(0, first));
  if (first < 1 || !Number.isInteger(pageLength) || pageLength < 1 || pageLength > 160) return null;
  const pageId = encoded.slice(first + 1, first + 1 + pageLength), rest = encoded.slice(first + 1 + pageLength), second = rest.indexOf(":"), length = Number(rest.slice(0, second));
  const id = rest.slice(second + 1);
  if (second < 1 || !Number.isInteger(length) || length !== id.length || !boundedId(pageId) || !boundedId(id) || id === "page-root") return null;
  return scopedEntityKey("group", id, pageId) === key ? { kind: "group", id, pageId } : null;
}
export const scopedRecord = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;
const equal = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const boundedId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u.test(value);
function fail(code: StudioScopedWriteDeniedError["code"] = "scope"): never { throw new StudioScopedWriteDeniedError(code); }

export interface StudioScopedEntityState {
  readonly kind: StudioScopedEntityKind;
  readonly id: string;
  readonly pageId: string;
  readonly layerId: string;
  readonly value: Readonly<Record<string, unknown>>;
  readonly deleted?: boolean;
  readonly raw?: unknown;
}
export interface StudioScopedDocumentState {
  readonly entities: ReadonlyMap<string, StudioScopedEntityState>;
  readonly entityOrder: ReadonlyMap<string, readonly string[]>;
  readonly pageProperties: ReadonlyMap<string, unknown>;
  readonly pageOrder: readonly string[];
  readonly globalProperties: unknown;
  readonly surfaceReferences: ReadonlyMap<string, readonly string[]>;
}

function registerSurfaceReferences(value: unknown, key: string, references: Map<string, string[]>): void {
  if (Array.isArray(value)) { for (const child of value) registerSurfaceReferences(child, key, references); return; }
  const object = scopedRecord(value);
  if (!object) return;
  for (const [name, child] of Object.entries(object)) {
    if ((name === "surfaceId" || name.endsWith("SurfaceId")) && boundedId(child)) {
      const owners = references.get(child) ?? [];
      if (!owners.includes(key)) owners.push(key);
      references.set(child, owners);
    } else registerSurfaceReferences(child, key, references);
  }
}

/** 실제 CreatorWork Authoring 구조를 투영한다. Production 컷이나 폴더 이름은 해석하지 않는다. */
export function projectStudioScopedAuthoringDocument(value: unknown): StudioScopedDocumentState {
  const document = scopedRecord(value);
  if (!document || !Array.isArray(document.pagesList)) fail("ambiguous");
  const entities = new Map<string, StudioScopedEntityState>(), pageProperties = new Map<string, unknown>();
  const surfaceReferences = new Map<string, string[]>(), pageOrder: string[] = [], entityOrder = new Map<string, readonly string[]>();
  const { pagesList, ...globalProperties } = document;
  registerSurfaceReferences(globalProperties, "global", surfaceReferences);
  const authoringIds = new Set<string>();
  const add = (entry: StudioScopedEntityState) => {
    const key = scopedEntityKey(entry.kind, entry.id, entry.pageId);
    if (entities.has(key) || (entry.kind !== "group" && authoringIds.has(entry.id))) fail("ambiguous");
    if (entry.kind !== "group") authoringIds.add(entry.id);
    entities.set(key, entry); registerSurfaceReferences(entry.value, key, surfaceReferences);
  };
  for (const pageValue of pagesList) {
    const page = scopedRecord(pageValue);
    if (!page || !boundedId(page.id) || !Array.isArray(page.elements) || pageProperties.has(page.id)) fail("ambiguous");
    const pageId = page.id;
    const { elements, groups = [], ...properties } = page;
    if (!Array.isArray(groups)) fail("ambiguous");
    pageOrder.push(page.id); pageProperties.set(page.id, properties);
    registerSurfaceReferences(properties, `page:${page.id}`, surfaceReferences);
    const groupIds = new Set<string>();
    for (const groupValue of groups) {
      const group = scopedRecord(groupValue);
      if (!group || !boundedId(group.id) || groupIds.has(group.id)) fail("ambiguous");
      groupIds.add(group.id);
      add({ kind: "group", id: group.id, pageId: page.id, layerId: group.id, value: group });
    }
    for (const elementValue of elements) {
      const element = scopedRecord(elementValue);
      if (!element || !boundedId(element.id) || typeof element.type !== "string") fail("ambiguous");
      const layerId = boundedId(element.groupId) && groupIds.has(element.groupId) ? element.groupId : "page-root";
      add({ kind: element.type === "draw" ? "stroke" : "element", id: element.id, pageId: page.id, layerId, value: element });
    }
    entityOrder.set(`${page.id}:groups`, groups.map((value) => { const item = scopedRecord(value); return scopedEntityKey("group", String(item?.id), pageId); }));
    entityOrder.set(`${page.id}:elements`, elements.map((value) => { const item = scopedRecord(value); return scopedEntityKey(item?.type === "draw" ? "stroke" : "element", String(item?.id)); }));
  }
  return { entities, entityOrder, pageProperties, pageOrder, globalProperties, surfaceReferences };
}

interface Bounds { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
const frameIndexes = new WeakMap<StudioScopedDocumentState, ReadonlyMap<string, readonly StudioScopedEntityState[]>>();
function framesForPage(state: StudioScopedDocumentState, pageId: string): readonly StudioScopedEntityState[] {
  let index = frameIndexes.get(state);
  if (!index) {
    const created = new Map<string, StudioScopedEntityState[]>();
    for (const entity of state.entities.values()) if (entity.value.type === "frame" && !entity.value.hidden && entity.deleted !== true) {
      const list = created.get(entity.pageId) ?? []; list.push(entity); created.set(entity.pageId, list);
    }
    index = created; frameIndexes.set(state, index);
  }
  return index.get(pageId) ?? [];
}
function membersByLayer(state: StudioScopedDocumentState): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const entity of state.entities.values()) {
    if (entity.kind === "group") continue;
    const key = JSON.stringify([entity.pageId, entity.layerId]), list = result.get(key) ?? [];
    list.push(scopedEntityKey(entity.kind, entity.id, entity.pageId)); result.set(key, list);
  }
  return result;
}
function elementBounds(value: Readonly<Record<string, unknown>>): Bounds | null {
  if (value.type === "draw") {
    if (!Array.isArray(value.points) || value.points.length < 2 || value.points.length % 2 || value.points.some((point) => !finite(point))) return null;
    let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
    for (let index = 0; index < value.points.length; index += 2) {
      const px = value.points[index], py = value.points[index + 1];
      if (!finite(px) || !finite(py)) return null;
      x = Math.min(x, px); y = Math.min(y, py); right = Math.max(right, px); bottom = Math.max(bottom, py);
    }
    return { x, y, w: right - x, h: bottom - y };
  }
  if (!finite(value.x) || !finite(value.y)) return null;
  if (value.type === "text") return finite(value.width) && value.width >= 0 && finite(value.fontSize) && value.fontSize >= 0
    ? { x: value.x, y: value.y, w: value.width, h: value.fontSize * 1.4 } : null;
  if (value.type === "sticker") return finite(value.fontSize) && value.fontSize >= 0
    ? { x: value.x, y: value.y, w: value.fontSize, h: value.fontSize } : null;
  return finite(value.width) && value.width >= 0 && finite(value.height) && value.height >= 0
    ? { x: value.x, y: value.y, w: value.width, h: value.height } : null;
}

function hasValidFrameClip(entity: StudioScopedEntityState): boolean {
  const bounds = elementBounds(entity.value), points = entity.value.points;
  if (!bounds || (points !== undefined && (!Array.isArray(points) || Array.from(points).some((value) => !finite(value))))) return false;
  try { studioFrameClip({ x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h, ...(points === undefined ? {} : { points }) }); return true; }
  catch { return false; }
}

/** 귀속은 registry가 결정한다. 기하는 실제 renderer의 클립 선택과 효과 범위를 대조하는 데만 쓴다. */
function hasVerifiedFrameClip(entity: StudioScopedEntityState, target: StudioScopedWriteTarget, state: StudioScopedDocumentState): boolean {
  const frameId = target.definition.frameId;
  if ((frameId !== null || target.definition.layerId !== null)
    && (entity.value.type === "adjustment" || entity.value.adjustmentLayer !== undefined)) return false;
  if (frameId === null) return true;
  if (entity.kind === "group") return true;
  if (entity.kind === "surface") {
    const references = state.surfaceReferences.get(entity.id);
    return Boolean(references?.length && references.every((key) => {
      const reference = state.entities.get(key);
      return reference && (reference.kind === "element" || reference.kind === "stroke") && hasVerifiedFrameClip(reference, target, state);
    }));
  }
  if (entity.value.type === "frame" || entity.value.noClip === true) return false;
  if (entity.value.frameClipId !== undefined) {
    if (entity.value.frameClipId !== frameId) return false;
    const frame = state.entities.get(scopedEntityKey("element", frameId));
    return Boolean(frame && frame.pageId === entity.pageId && frame.value.type === "frame"
      && frame.deleted !== true && frame.value.hidden !== true && hasValidFrameClip(frame));
  }
  const bounds = elementBounds(entity.value);
  if (!bounds) return false;
  const cx = bounds.x + bounds.w / 2, cy = bounds.y + bounds.h / 2;
  let selected: string | null = null, area = Infinity;
  for (const candidate of framesForPage(state, entity.pageId)) {
    const frame = elementBounds(candidate.value);
    if (!frame || frame.w <= 0 || frame.h <= 0 || cx < frame.x || cx > frame.x + frame.w || cy < frame.y || cy > frame.y + frame.h
      || bounds.w > frame.w * 1.4 || bounds.h > frame.h * 1.4) continue;
    if (frame.w * frame.h < area) { area = frame.w * frame.h; selected = candidate.id; }
  }
  const frame = selected === frameId ? state.entities.get(scopedEntityKey("element", frameId)) : undefined;
  return Boolean(frame && hasValidFrameClip(frame));
}

function matchesTarget(entity: StudioScopedEntityState, target: StudioScopedWriteTarget, state: StudioScopedDocumentState): boolean {
  const definition = target.definition;
  return entity.pageId === definition.pageId && (definition.layerId === null || entity.layerId === definition.layerId)
    && hasVerifiedFrameClip(entity, target, state);
}

/** 허가를 추론하지 않고 매핑 경계를 건드리는지 분류한다. 실제 편집은 별도 귀속 검사로 판정한다. */
export function studioScopedEntityTouchesTarget(entity: StudioScopedEntityState, target: StudioScopedWriteTarget, state: StudioScopedDocumentState): boolean {
  const definition = target.definition;
  return entity.pageId === definition.pageId && ((definition.layerId === null && definition.frameId === null)
    || (definition.layerId !== null && (entity.layerId === definition.layerId || (entity.kind === "group" && entity.id === definition.layerId)))
    || (entity.kind !== "group" && matchesTarget(entity, target, state)));
}

/** 페인터 순서에서 다른 객체의 알파·합성을 읽는 실제 의존성을 보존한다. */
function renderDependencies(state: StudioScopedDocumentState): ReadonlyMap<string, readonly string[]> {
  const dependencies = new Map<string, readonly string[]>();
  for (const [orderKey, order] of state.entityOrder) {
    if (!orderKey.endsWith(":elements")) continue;
    for (let index = 0; index < order.length; index += 1) {
      const key = order[index], element = key ? state.entities.get(key) : undefined;
      if (!key || !element) continue;
      const prefix = `@render-prefix:${orderKey}:${index}`, previousPrefix = `@render-prefix:${orderKey}:${index - 1}`;
      dependencies.set(prefix, index > 0 ? [previousPrefix, key] : [key]);
      const adjustment = element.value.type === "adjustment" || element.value.adjustmentLayer !== undefined;
      if (adjustment) {
        const metadata = scopedRecord(element.value.adjustmentLayer);
        const isolated = element.value.type === "adjustment" ? element.value.clipToBelow === true
          : element.value.clipBelow ?? (metadata?.scope === "clip-previous");
        dependencies.set(key, isolated ? order.slice(Math.max(0, index - 1), index) : index > 0 ? [previousPrefix] : []);
      } else if (element.value.clipBelow === true) dependencies.set(key, order.slice(Math.max(0, index - 1), index));
    }
  }
  return dependencies;
}

export interface StudioScopedWriteEffectAdmission {
  readonly created: readonly { readonly kind: StudioScopedEntityKind; readonly id: string; readonly targetId: string }[];
  readonly targetIds: readonly string[];
  readonly changedEntityKeys: readonly string[];
}

export interface StudioScopedWriteEffectsInput {
  readonly before: StudioScopedDocumentState; readonly after: StudioScopedDocumentState;
  readonly context: StudioScopedWriteContext; readonly targets: readonly StudioScopedWriteTarget[];
  readonly ownership: ReadonlyMap<string, string>;
  /** 전체 편집 ACL은 유지하되 명시적으로 연결한 실제 대상만 역할 정책으로 보호한다. */
  readonly mappedFull?: { readonly controlledTargets: readonly StudioScopedWriteTarget[] };
}

/** 실제 매핑 밖의 전체 편집 ACL을 내부 가상 대상으로 표현하여 기존 효과 검사를 재사용한다. */
function admitMappedFullWriteEffects(input: StudioScopedWriteEffectsInput): StudioScopedWriteEffectAdmission {
  const controlled = input.mappedFull?.controlledTargets ?? [], controlledIds = new Set(controlled.map((target) => target.definition.id));
  if (!controlled.length) return { created: [], targetIds: [], changedEntityKeys: [] };
  const allowedIds = new Set(input.targets.map((target) => target.definition.id));
  const restricted = controlled.filter((target) => !allowedIds.has(target.definition.id));
  const { before, after } = input;
  const metadataOnlyKeys = new Set(["title", "description", "tagsText", "currentPageId", "savedAt", "writerRoom", "characterBible",
    "aiProvenance", "aiImageReferences", "comments", "releaseSchedule", "publicationAnalytics", "referenceBoard", "publishPack"]);
  const renderGlobals = (value: unknown): unknown => {
    const record = scopedRecord(value);
    if (!record) return value;
    return Object.fromEntries(Object.entries(record).filter(([key]) => !metadataOnlyKeys.has(key))
      .map(([key, child]) => [key, key === "authoring" ? renderGlobals(child) : child]));
  };
  if (!equal(renderGlobals(before.globalProperties), renderGlobals(after.globalProperties)) && restricted.length) fail();
  const restrictedPages = new Set(restricted.map((target) => target.definition.pageId));
  if (!equal(before.pageOrder.filter((id) => restrictedPages.has(id)), after.pageOrder.filter((id) => restrictedPages.has(id)))) fail();
  for (const pageId of restrictedPages) if (!equal(before.pageProperties.get(pageId), after.pageProperties.get(pageId))) fail();
  // 레이어·프레임은 매핑의 실제 앵커다. 일반 편집이나 삭제로 정책 밖으로 이동시킬 수 없다.
  for (const target of controlled) {
    const { pageId, layerId, frameId } = target.definition;
    if (layerId !== null) {
      const key = scopedEntityKey("group", layerId, pageId), previous = before.entities.get(key), next = after.entities.get(key);
      if (!previous || !next || next.deleted || previous.pageId !== next.pageId || next.id !== layerId) fail("ambiguous");
    }
    if (frameId !== null) {
      const key = scopedEntityKey("element", frameId), previous = before.entities.get(key), next = after.entities.get(key);
      if (!previous || !next || next.deleted || previous.pageId !== next.pageId || !equal(previous.value, next.value)) fail("ambiguous");
    }
  }
  const mappedOwner = (key: string): string | undefined => {
    const registered = input.ownership.get(key);
    if (registered && controlledIds.has(registered)) return registered;
    for (const entry of [...input.context.creations, ...input.context.restorations]) {
      const target = controlled.find((candidate) => candidate.definition.id === entry.targetId);
      if (target && scopedEntityKey(entry.kind, entry.id, target.definition.pageId) === key) return target.definition.id;
    }
    const previous = before.entities.get(key), next = after.entities.get(key);
    const targets = controlled.filter((target) => {
      const definition = target.definition;
      if (definition.entities.some((entry) => scopedEntityKey(entry.kind, entry.id, definition.pageId) === key)) return true;
      if ((previous && studioScopedEntityTouchesTarget(previous, target, before))
        || (next && studioScopedEntityTouchesTarget(next, target, after))) return true;
      return [previous, next].some((entity) => entity?.pageId === definition.pageId
        && ((definition.layerId === null && definition.frameId === null)
          || (definition.layerId !== null && (entity.layerId === definition.layerId || (entity.kind === "group" && entity.id === definition.layerId)))
          || (definition.frameId !== null && entity.value.frameClipId === definition.frameId
            && (definition.layerId === null || entity.layerId === definition.layerId))));
    });
    if (targets.length > 1) fail("ambiguous");
    return targets[0]?.definition.id;
  };
  const ownership = new Map<string, string>();
  let unregisteredId = "unregistered-mapped-entity";
  while (controlledIds.has(unregisteredId) || input.targets.some((target) => target.definition.id === unregisteredId)) unregisteredId = `_${unregisteredId}`;
  const syntheticTargets = new Map<string, StudioScopedWriteTarget>();
  const template = controlled[0];
  if (!template) fail("ambiguous");
  const outsideTarget = (pageId: string): StudioScopedWriteTarget => {
    const existing = syntheticTargets.get(pageId);
    if (existing) return existing;
    let id = `unmapped:${syntheticTargets.size}`;
    while (controlledIds.has(id) || input.targets.some((target) => target.definition.id === id)) id = `_${id}`;
    const target = { ...template, definition: { ...template.definition, id, pageId, frameId: null, layerId: null, entities: [] } };
    syntheticTargets.set(pageId, target); return target;
  };
  const context: StudioScopedWriteContext = { ...input.context, creations: [...input.context.creations], restorations: [...input.context.restorations] };
  const declared = new Set([...context.creations, ...context.restorations].map((entry) => scopedEntityKey(entry.kind, entry.id,
    controlled.find((target) => target.definition.id === entry.targetId)?.definition.pageId)));
  const ownerFor = new Map<string, string>();
  for (const key of new Set([...before.entities.keys(), ...after.entities.keys()])) {
    const mapped = mappedOwner(key), previous = before.entities.get(key), next = after.entities.get(key), entity = previous ?? next;
    if (!entity) fail("ambiguous");
    if (mapped) {
      ownerFor.set(key, mapped);
      // 기존 미등록 요소를 일반 편집만으로 담당자의 소유물로 승격하지 않는다.
      if (previous && input.ownership.get(key) !== mapped) ownership.set(key, unregisteredId);
      else if (previous || input.ownership.has(key)) ownership.set(key, mapped);
      continue;
    }
    const target = outsideTarget(entity.pageId), targetId = target.definition.id;
    ownerFor.set(key, targetId);
    if (previous) ownership.set(key, targetId);
    if (declared.has(key)) fail("context");
    if (!previous && next) context.creations.push({ kind: next.kind, id: next.id, targetId });
    else if (previous && next && previous.deleted && !next.deleted) context.restorations.push({ kind: next.kind, id: next.id, targetId });
  }
  for (const surfaceId of new Set([...before.surfaceReferences.keys(), ...after.surfaceReferences.keys()])) {
    const key = scopedEntityKey("surface", surfaceId), referenceOwners = new Set([
      ...(before.surfaceReferences.get(surfaceId) ?? []), ...(after.surfaceReferences.get(surfaceId) ?? []),
    ].map((reference) => ownerFor.get(reference)).filter((owner) => owner && controlledIds.has(owner)));
    if (referenceOwners.size && !controlledIds.has(input.ownership.get(key) ?? "")) {
      const previous = before.entities.get(key), next = after.entities.get(key);
      if (!equal(previous, next) || !equal(before.surfaceReferences.get(surfaceId), after.surfaceReferences.get(surfaceId))) fail("ambiguous");
    }
  }
  const admitted = admitScopedOnlyWriteEffects({ ...input, context, ownership,
    targets: [...input.targets, ...syntheticTargets.values()],
    after: { ...after, globalProperties: before.globalProperties, pageProperties: before.pageProperties, pageOrder: before.pageOrder,
      surfaceReferences: new Map([...after.surfaceReferences].filter(([id]) => controlledIds.has(ownership.get(scopedEntityKey("surface", id)) ?? ""))),
    },
  });
  return { ...admitted, created: admitted.created.filter((entry) => controlledIds.has(entry.targetId)),
    targetIds: admitted.targetIds.filter((id) => controlledIds.has(id)) };
}

/** 정본 전후의 모든 객체와 전역 속성을 대조한다. 새 ID 귀속만 명시적으로 추가할 수 있다. */
export function admitStudioScopedWriteEffects(input: StudioScopedWriteEffectsInput): StudioScopedWriteEffectAdmission {
  return input.mappedFull ? admitMappedFullWriteEffects(input) : admitScopedOnlyWriteEffects(input);
}

function admitScopedOnlyWriteEffects(input: StudioScopedWriteEffectsInput): StudioScopedWriteEffectAdmission {
  const { before, after, context, ownership } = input;
  if (!equal(before.globalProperties, after.globalProperties) || !equal(before.pageOrder, after.pageOrder)) fail();
  const targets = new Map(input.targets.map((target) => [target.definition.id, target]));
  const creationKey = (entry: { readonly kind: StudioScopedEntityKind; readonly id: string; readonly targetId: string }) =>
    scopedEntityKey(entry.kind, entry.id, targets.get(entry.targetId)?.definition.pageId);
  const creations = new Map(context.creations.map((entry) => [creationKey(entry), entry]));
  const restorations = new Map(context.restorations.map((entry) => [creationKey(entry), entry]));
  const requestedCreations = new Map(creations), oldMembers = membersByLayer(before), newMembers = membersByLayer(after);
  const ownerFor = (key: string) => ownership.get(key) ?? (!before.entities.has(key) ? requestedCreations.get(key)?.targetId : undefined);
  if (creations.size !== context.creations.length || restorations.size !== context.restorations.length) fail("context");
  const created: { kind: StudioScopedEntityKind; id: string; targetId: string }[] = [], changedEntityKeys: string[] = [];
  const touched = new Set<string>();
  for (const [pageId, properties] of before.pageProperties) {
    if (equal(properties, after.pageProperties.get(pageId))) continue;
    const target = input.targets.find((entry) => entry.definition.pageId === pageId
      && entry.definition.frameId === null && entry.definition.layerId === null);
    if (!target) fail();
    touched.add(target.definition.id);
  }
  if (before.pageProperties.size !== after.pageProperties.size) fail();
  for (const key of new Set([...before.entities.keys(), ...after.entities.keys()])) {
    const previous = before.entities.get(key), next = after.entities.get(key);
    if (previous && next && previous.pageId === next.pageId && previous.layerId === next.layerId
      && previous.deleted === next.deleted && equal(previous.value, next.value) && equal(previous.raw, next.raw)) continue;
    changedEntityKeys.push(key);
    let targetId = ownership.get(key);
    if (next && targetId !== undefined && (!previous || (previous.deleted === true && next.deleted !== true))) {
      const restoration = restorations.get(key);
      if (!restoration || restoration.targetId !== targetId || creations.has(key)) fail("context");
      restorations.delete(key);
    } else if (!previous && next) {
      const creation = creations.get(key);
      if (!creation || targetId !== undefined) fail("context");
      if ([...ownership.keys()].some((known) => known !== key && known.slice(known.indexOf(":") + 1) === next.id
        && ["element", "stroke"].includes(known.slice(0, known.indexOf(":"))) && ["element", "stroke"].includes(next.kind))) fail("context");
      targetId = creation.targetId; creations.delete(key); created.push(creation);
    } else if (creations.has(key) || restorations.has(key)) fail("context");
    const target = targetId ? targets.get(targetId) : undefined;
    if (!target || (previous && !matchesTarget(previous, target, before)) || (next && !matchesTarget(next, target, after))) fail();
    if (previous?.id === target.definition.frameId || next?.id === target.definition.frameId) fail();
    if ((previous?.kind ?? next?.kind) === "group") {
      const layerKey = JSON.stringify([target.definition.pageId, previous?.id ?? next?.id]);
      for (const memberKey of new Set([...(oldMembers.get(layerKey) ?? []), ...(newMembers.get(layerKey) ?? [])])) {
        const oldMember = before.entities.get(memberKey), newMember = after.entities.get(memberKey);
        if (ownerFor(memberKey) !== target.definition.id || (oldMember && !matchesTarget(oldMember, target, before))
          || (newMember && !matchesTarget(newMember, target, after))) fail("ambiguous");
        changedEntityKeys.push(memberKey);
      }
    }
    touched.add(target.definition.id);
  }
  if (creations.size || restorations.size) fail("context");
  for (const orderKey of new Set([...before.entityOrder.keys(), ...after.entityOrder.keys()])) {
    const oldOrder = before.entityOrder.get(orderKey) ?? [], nextOrder = after.entityOrder.get(orderKey) ?? [];
    const outside = (key: string) => !targets.has(ownerFor(key) ?? "");
    if (!equal(oldOrder.filter(outside), nextOrder.filter(outside))) fail();
    if (!equal(oldOrder, nextOrder)) for (const key of new Set([...oldOrder, ...nextOrder])) {
      if (outside(key)) continue;
      const entity = after.entities.get(key) ?? before.entities.get(key), targetId = ownerFor(key);
      const target = targetId ? targets.get(targetId) : undefined;
      if (!entity || !target || !matchesTarget(entity, target, after.entities.has(key) ? after : before)) fail();
      touched.add(target.definition.id);
    }
  }
  // 프레임 경계 자체는 읽기 전용 앵커로 보존한다.
  for (const target of input.targets) {
    if (!target.definition.frameId) continue;
    const key = scopedEntityKey("element", target.definition.frameId);
    const oldFrame = before.entities.get(key), newFrame = after.entities.get(key);
    if (!oldFrame || !newFrame || oldFrame.deleted === true || newFrame.deleted === true || !equal(oldFrame.value, newFrame.value)) fail("ambiguous");
  }
  for (const [surfaceId, references] of after.surfaceReferences) {
    const targetId = ownerFor(scopedEntityKey("surface", surfaceId));
    if (targetId === undefined) continue;
    if (references.some((key) => ownerFor(key) !== targetId)) fail("ambiguous");
  }
  const oldDependencies = renderDependencies(before), nextDependencies = renderDependencies(after);
  const affected = new Set(changedEntityKeys);
  // 의존 요소 삭제·순서 변경도 읽기 전용 요소의 표시를 바꾸므로 값의 차이와 함께 검사한다.
  for (const key of new Set([...oldDependencies.keys(), ...nextDependencies.keys()])) {
    if (!equal(oldDependencies.get(key) ?? [], nextDependencies.get(key) ?? [])) affected.add(key);
  }
  const consumers = new Map<string, Set<string>>();
  for (const [key, dependencies] of [...oldDependencies, ...nextDependencies]) for (const dependency of dependencies) {
    const list = consumers.get(dependency) ?? new Set<string>(); list.add(key); consumers.set(dependency, list);
  }
  const pending = [...affected];
  for (let index = 0; index < pending.length; index += 1) {
    const key = pending[index];
    for (const consumer of key ? consumers.get(key) ?? [] : []) if (!affected.has(consumer)) { affected.add(consumer); pending.push(consumer); }
  }
  for (const key of affected) {
    if (key.startsWith("@render-prefix:")) continue;
    const targetId = ownerFor(key), target = targetId ? targets.get(targetId) : undefined;
    const previous = before.entities.get(key), next = after.entities.get(key);
    if (!target || (previous && !matchesTarget(previous, target, before)) || (next && !matchesTarget(next, target, after))) fail("ambiguous");
    touched.add(target.definition.id);
  }
  return { created, targetIds: [...touched], changedEntityKeys };
}

/** 등록 시에도 실제 현재 ID·클립·공용 surface를 대조하고 기존 귀속을 덮어쓰지 않는다. */
export function validateStudioScopedWriteTarget(target: StudioScopedWriteTarget, state: StudioScopedDocumentState,
  ownership: ReadonlyMap<string, string>): readonly { kind: StudioScopedEntityKind; id: string; targetId: string }[] {
  const definition = target.definition;
  if (!state.pageProperties.has(definition.pageId)) fail("ambiguous");
  if (definition.layerId !== null) {
    const layer = state.entities.get(scopedEntityKey("group", definition.layerId, definition.pageId));
    if (!layer || layer.deleted === true || layer.pageId !== definition.pageId) fail("ambiguous");
  }
  if (definition.frameId) {
    const frame = state.entities.get(scopedEntityKey("element", definition.frameId));
    if (!frame || frame.deleted === true || frame.pageId !== definition.pageId || frame.value.type !== "frame" || frame.value.hidden || !hasValidFrameClip(frame)) fail("ambiguous");
  }
  const entries = definition.entities.map((entry) => ({ ...entry, targetId: definition.id }));
  const selected = new Set(entries.map((entry) => scopedEntityKey(entry.kind, entry.id, definition.pageId)));
  const members = membersByLayer(state);
  for (const entry of entries) {
    const key = scopedEntityKey(entry.kind, entry.id, definition.pageId), owner = ownership.get(key);
    if (owner !== undefined && owner !== definition.id) fail("ambiguous");
    if (entry.kind === "surface") {
      const references = state.surfaceReferences.get(entry.id);
      if (!references?.length || references.some((reference) => !selected.has(reference)
        || !["element", "stroke"].includes(state.entities.get(reference)?.kind ?? ""))) fail("ambiguous");
      continue;
    }
    const entity = state.entities.get(key);
    if (!entity || !matchesTarget(entity, target, state) || entity.id === definition.frameId) fail("ambiguous");
    if (entry.kind === "group" && (members.get(JSON.stringify([entity.pageId, entity.id])) ?? []).some((key) => !selected.has(key))) fail("ambiguous");
  }
  return entries;
}
