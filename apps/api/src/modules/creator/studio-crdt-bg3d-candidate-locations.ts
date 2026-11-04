import * as Y from "yjs";
import { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";

type Struct = ReturnType<typeof Y.decodeUpdate>["structs"][number];
type SharedType = Exclude<Y.Item["parent"], Y.ID | null>;
export interface StudioCrdtBg3dCandidateLocation {
  readonly elementId: string;
  readonly property: "pageId" | "layerId";
  readonly value: unknown;
}
function find(structs: readonly Struct[] | undefined, id: Y.ID): Struct | null {
  if (!structs) return null;
  let low = 0, high = structs.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1, item = structs[middle];
    if (!item) return null;
    if (id.clock < item.id.clock) high = middle - 1;
    else if (id.clock >= item.id.clock + item.length) low = middle + 1;
    else return item;
  }
  return null;
}
/** 삭제·GC된 LWW 패자의 원래 scalar는 합친 문서가 아니라 실제 incoming Item에서 읽는다. */
export function readStudioCrdtBg3dCandidateLocations(before: Y.Doc, update: Uint8Array): readonly StudioCrdtBg3dCandidateLocation[] {
  const decoded = Y.decodeUpdate(update).structs, incoming = new Map<number, Struct[]>();
  for (const item of decoded) { const items = incoming.get(item.id.client) ?? []; items.push(item); incoming.set(item.id.client, items); }
  for (const items of incoming.values()) items.sort((left, right) => left.id.clock - right.id.clock);
  const rootNames = new Map<SharedType, string>([...before.share].map(([name, type]) => [type, name]));
  const locate = (first: Y.Item): { root: string; key: string | null } | null => {
    let item = first; const seen = new Set<string>();
    let key = item.parentSub;
    for (;;) {
      const identity = `${item.id.client}:${item.id.clock}`;
      if (seen.has(identity)) return null; seen.add(identity);
      key ??= item.parentSub;
      const parent: unknown = item.parent;
      if (typeof parent === "string") return { root: parent, key };
      if (parent instanceof Y.AbstractType) {
        let type = parent;
        while (type._item) {
          const ancestor = type._item.parent;
          if (!(ancestor instanceof Y.AbstractType)) return null;
          type = ancestor;
        }
        const root = rootNames.get(type); return root ? { root, key } : null;
      }
      const pointer = parent instanceof Y.ID ? parent : item.origin ?? item.rightOrigin;
      if (!pointer) return null;
      const next = find(before.store.clients.get(pointer.client), pointer) ?? find(incoming.get(pointer.client), pointer);
      if (!(next instanceof Y.Item)) return null;
      item = next;
    }
  };
  const result: StudioCrdtBg3dCandidateLocation[] = [];
  for (const item of decoded) {
    if (!(item instanceof Y.Item)) continue;
    const location = locate(item);
    if (!location?.root.startsWith("scene-element:") || (location.key !== "pageId" && location.key !== "layerId")) continue;
    const encoded = location.root.slice("scene-element:".length), elementId = decodeURIComponent(encoded);
    if (!isBoundedStudioCrdtId(elementId) || encodeURIComponent(elementId) !== encoded) throw new Error("6패스 후보 요소 식별자가 올바르지 않습니다.");
    for (const value of item.content.getContent()) result.push({ elementId, property: location.key, value });
  }
  return result;
}
