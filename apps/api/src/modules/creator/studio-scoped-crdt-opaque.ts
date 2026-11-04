import * as Y from "yjs";
import { STUDIO_CRDT_RASTER_ROOT_NAMES } from "@toonstudio/contracts/studio-crdt-raster-document-contract";
import { projectStudioScopedAuthoringDocument, scopedEntityKey, studioScopedEntityTouchesTarget, StudioScopedWriteDeniedError } from "./studio-scoped-write-effects";
import { materializeStudioAuthoringFromCrdt } from "@toonstudio/contracts/studio-crdt-authoring";
import type { StudioScopedAuthorization } from "./studio-scoped-write-store";

type SharedType = Exclude<Y.Item["parent"], Y.ID | null>;
type Identity = readonly [number, number];
type RawItem = { id: Identity; length: number; deleted: boolean; origin: Y.ID | null; rightOrigin: Y.ID | null;
  right: Y.ID | null; parent: SharedType; parentId: Identity | null; parentSub: string | null; content: Y.Item["content"] };
const identity = (id: Y.ID | null): Identity | null => id ? [id.client, id.clock] : null;
const sameId = (left: Y.ID | null, right: Y.ID | null) => left?.client === right?.client && left?.clock === right?.clock;
const fail = (): never => { throw new StudioScopedWriteDeniedError("scope"); };

function attributedRoot(name: string): boolean {
  return ["strokes", "scene-elements", "layer-groups", "studio-pages", "stroke-order", "page-order", "studio-deletion-ops", "studio-deletion-acks"].includes(name)
    || name.startsWith("scene-element:") || name.startsWith("layer-group:") || name.startsWith("studio-page:")
    || (STUDIO_CRDT_RASTER_ROOT_NAMES as readonly string[]).includes(name);
}
function ancestry(doc: Y.Doc) {
  const names = new Map<SharedType, string>([...doc.share].map(([name, type]) => [type, name]));
  return (parent: Y.Item["parent"]): { name: string; deletedParent: boolean } => {
    if (!(parent instanceof Y.AbstractType)) return fail();
    let current: SharedType = parent, deletedParent = false;
    const seen = new Set<SharedType>();
    while (current._item !== null) {
      if (seen.has(current)) return fail(); seen.add(current);
      deletedParent ||= current._item.deleted;
      const next = current._item.parent;
      if (!(next instanceof Y.AbstractType)) return fail(); current = next;
    }
    const name = names.get(current); if (name === undefined) return fail();
    return { name, deletedParent };
  };
}
function copiedContent(item: Y.Item): Y.Item["content"] {
  if (item.deleted) return new Y.ContentDeleted(item.length);
  const content = item.content;
  return content instanceof Y.ContentAny || content instanceof Y.ContentJSON || content instanceof Y.ContentString
    ? content.copy() : content;
}
function merge(left: RawItem, right: RawItem): boolean {
  if (left.id[0] !== right.id[0] || left.id[1] + left.length !== right.id[1]
    || !sameId(left.right, Y.createID(right.id[0], right.id[1]))
    || !sameId(right.origin, Y.createID(left.id[0], left.id[1] + left.length - 1))
    || !sameId(left.rightOrigin, right.rightOrigin) || left.deleted !== right.deleted || left.parent !== right.parent
    || left.parentSub !== right.parentSub || left.content.constructor !== right.content.constructor) return false;
  if (!left.content.mergeWith(right.content)) return false;
  left.length += right.length; left.right = right.right; return true;
}

/**
 * Yjs 13.6.33의 실제 Item wire 상태다. AbstractType.toJSON은 빈 구현이므로 사용하지 않는다.
 * typed/untyped root·빈 share 등록은 wire 상태가 아니다. GC tombstone과 인접 Item 병합은 정규화한다.
 */
export function snapshotStudioScopedOpaqueRoots(doc: Y.Doc): readonly (readonly [string, readonly unknown[]])[] {
  const roots = new Map<string, RawItem[]>(), seenTypes = new Set<SharedType>(), seenItems = new Set<Y.Item>();
  const pending = [...doc.share].filter(([name]) => !attributedRoot(name)).map(([name, type]) => ({ name, type }));
  for (let index = 0; index < pending.length; index += 1) {
    const entry = pending[index]; if (!entry || seenTypes.has(entry.type)) return fail(); seenTypes.add(entry.type);
    const { name, type } = entry;
    const visit = (item: Y.Item) => {
      if (seenItems.has(item) || item.parent !== type) return fail(); seenItems.add(item);
      const items = roots.get(name) ?? [];
      items.push({ id: [item.id.client, item.id.clock], length: item.length, deleted: item.deleted, origin: item.origin,
        rightOrigin: item.rightOrigin, right: item.right?.id ?? null, parent: type,
        parentId: identity(type._item?.id ?? null), parentSub: item.parentSub, content: copiedContent(item) });
      roots.set(name, items);
      if (!item.deleted && item.content instanceof Y.ContentType) pending.push({ name, type: item.content.type });
    };
    for (const last of type._map.values()) for (let item: Y.Item | null = last; item; item = item.left) visit(item);
    for (let item = type._start; item; item = item.right) visit(item);
  }
  return [...roots].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([name, items]) => {
    items.sort((left, right) => left.id[0] - right.id[0] || left.id[1] - right.id[1]);
    const normalized: RawItem[] = [];
    for (const item of items) {
      const previous = normalized.at(-1);
      if (!previous || !merge(previous, item)) normalized.push(item);
    }
    return [name, normalized.map((item) => {
      const encoder = new Y.UpdateEncoderV1();
      const encoded = new Y.Item(Y.createID(item.id[0], item.id[1]), null, item.origin, null, item.rightOrigin,
        item.parent, item.parentSub, item.content);
      encoded.write(encoder, 0);
      return { id: item.id, length: item.length, deleted: item.deleted, parentId: item.parentId,
        parentSub: item.parentSub, wire: Buffer.from(encoder.toUint8Array()).toString("base64") };
    })] as const;
  });
}

type DecodedStruct = ReturnType<typeof Y.decodeUpdate>["structs"][number];
function findStruct(structs: readonly DecodedStruct[] | undefined, clock: number): DecodedStruct | null {
  if (!structs) return null;
  let low = 0, high = structs.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1, item = structs[middle];
    if (!item) return null;
    if (clock < item.id.clock) high = middle - 1;
    else if (clock >= item.id.clock + item.length) low = middle + 1;
    else return item;
  }
  return null;
}
function ownedStrokeAnchors(doc: Y.Doc, authorization: StudioScopedAuthorization): Set<Y.Item> {
  const anchors = new Set<Y.Item>(), root = doc.share.get("strokes");
  if (!(root instanceof Y.Map)) return anchors;
  const targets = new Set(authorization.targets.map((target) => target.definition.id));
  const state = authorization.mappedFull ? projectStudioScopedAuthoringDocument(materializeStudioAuthoringFromCrdt({ baseline: authorization.work.document, doc })) : null;
  for (const [id, record] of root) {
    if (!(record instanceof Y.Map) || record.get("id") !== id || !record._item) continue;
    const owner = authorization.policy.ownership[scopedEntityKey("stroke", id)];
    const controlled = authorization.mappedFull?.controlledTargets;
    const entity = state?.entities.get(scopedEntityKey("stroke", id));
    const unrestricted = controlled && !controlled.some((target) => target.definition.id === owner
      || (entity && state && studioScopedEntityTouchesTarget(entity, target, state)));
    if ((owner && targets.has(owner)) || unrestricted) anchors.add(record._item);
  }
  return anchors;
}

/**
 * parent를 잃은 새 GC는 JSON으로 승인하지 않는다. 이미 있던 clock의 정상 owned 자식 GC는 허용한다.
 * 새 clock은 incoming Item의 실제 parent/origin이 기존 담당 획에 닿는 경우만 기존 semantic/effect 검사로 넘긴다.
 */
export function assertStudioScopedOpaqueGcAdmission(before: Y.Doc, probe: Y.Doc, authorization: StudioScopedAuthorization,
  update?: Uint8Array): void {
  const added: Array<{ client: number; start: number; end: number }> = [];
  for (const [client, structs] of probe.store.clients) {
    const old = before.store.clients.get(client)?.at(-1), clock = old ? old.id.clock + old.length : 0;
    const last = structs.at(-1); if (!last || last.id.clock + last.length <= clock) continue;
    for (let index = Y.findIndexSS(structs, clock); index < structs.length; index += 1) {
      const item = structs[index];
      if (item instanceof Y.GC) added.push({ client, start: Math.max(clock, item.id.clock), end: item.id.clock + item.length });
    }
  }
  if (!added.length) return;
  if (!update) return fail();
  const incoming = new Map<number, DecodedStruct[]>();
  for (const item of Y.decodeUpdate(update).structs) {
    const items = incoming.get(item.id.client) ?? []; items.push(item); incoming.set(item.id.client, items);
  }
  for (const items of incoming.values()) items.sort((left, right) => left.id.clock - right.id.clock);
  const anchors = ownedStrokeAnchors(before, authorization), classify = ancestry(before);
  const find = (id: Y.ID) => findStruct(before.store.clients.get(id.client), id.clock) ?? findStruct(incoming.get(id.client), id.clock);
  const owned = (first: Y.Item): boolean => {
    let current: Y.Item = first;
    const seen = new Set<Y.Item>();
    while (!seen.has(current)) {
      seen.add(current);
      if (anchors.has(current)) return true;
      const parent: unknown = current.parent;
      if (parent instanceof Y.AbstractType) {
        if (!attributedRoot(classify(parent).name)) return false;
        if (!parent._item) return false;
        current = parent._item; continue;
      }
      if (parent instanceof Y.ID) {
        // 실제 Y 부모 타입만 인정한다. scalar ID는 Yjs 통합 때 부모 없는 GC가 된다.
        const next = find(parent); if (!(next instanceof Y.Item) || !(next.content instanceof Y.ContentType)) return false;
        current = next; continue;
      }
      const reference = current.origin ?? current.rightOrigin;
      if (typeof parent === "string" || !reference) return false;
      const next = find(reference); if (!(next instanceof Y.Item)) return false;
      current = next;
    }
    return false;
  };
  for (const range of added) {
    let clock = range.start;
    while (clock < range.end) {
      const item = findStruct(incoming.get(range.client), clock);
      if (!(item instanceof Y.Item) || !owned(item)) return fail();
      clock = Math.min(range.end, item.id.clock + item.length);
    }
  }
}
