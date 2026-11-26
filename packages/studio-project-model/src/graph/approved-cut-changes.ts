import { z } from "zod";

import { canonicalJson } from "../ir/digest";

const changeKind = z.enum(["dialogue", "image", "layer", "page"]);
export type ApprovedCutChangeKind = z.infer<typeof changeKind>;
export const approvedCutChangeSchema = z.object({
  pageId: z.string().min(1),
  /** 페이지 안에서 어느 프레임인지 확인할 수 없거나 페이지 자체가 바뀌면 null이다. */
  frameId: z.string().min(1).nullable(),
  beforeIndex: z.number().int().nonnegative().nullable(),
  afterIndex: z.number().int().nonnegative().nullable(),
  kinds: z.array(changeKind).min(1),
  dialogue: z.array(z.object({ elementId: z.string().min(1), locale: z.string().min(1).optional(),
    origin: z.literal("master").optional(), before: z.string().nullable(), after: z.string().nullable() }).strict()),
}).strict();
export type ApprovedCutChange = z.infer<typeof approvedCutChangeSchema>;

type Properties = Record<string, unknown>;
type Item = Properties & { id: string };
type CutPage = { item: Item; index: number; elements: Map<string, Item> };

function object(value: unknown): Properties {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("원고의 비교 대상을 확인할 수 없습니다.");
  return value as Properties;
}

function indexed(values: unknown): Map<string, Item> {
  if (!Array.isArray(values)) throw new Error("원고 목록을 확인할 수 없습니다.");
  const result = new Map<string, Item>();
  for (const value of values) {
    const item = object(value);
    const id = item.id;
    if (typeof id !== "string" || !id.trim() || result.has(id)) throw new Error("원고의 고유 ID를 확인할 수 없습니다.");
    result.set(id, { ...item, id });
  }
  return result;
}

function pagesOf(doc: Properties) {
  const pages = new Map<string, CutPage>();
  if (!Array.isArray(doc.pagesList) || !doc.pagesList.length) throw new Error("승인 원고의 페이지 목록이 비어 있습니다.");
  for (const item of indexed(doc.pagesList).values()) {
    const elements = indexed(item.elements);
    for (const element of elements.values()) {
      if (typeof element.type !== "string" || !element.type) throw new Error("레이어 종류를 확인할 수 없습니다.");
      if (element.text !== undefined && typeof element.text !== "string") throw new Error("대사 원문을 확인할 수 없습니다.");
    }
    pages.set(item.id, { item, index: pages.size, elements });
  }
  return pages;
}

function different(a: unknown, b: unknown) {
  return a !== b && canonicalJson(a) !== canonicalJson(b);
}

function changedFields(a: Properties, b: Properties, ignored: ReadonlySet<string>) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !ignored.has(key) && different(a[key], b[key]));
}

/** 추가·삭제로 뒤로 밀린 항목은 제외하고, 양쪽에 남은 항목끼리의 순서만 대조한다. */
function reorderedIds<T>(before: ReadonlyMap<string, T>, after: ReadonlyMap<string, T>): string[] {
  const previous = [...before.keys()].filter((id) => after.has(id));
  return [...after.keys()].filter((id) => before.has(id)).filter((id, index) => id !== previous[index]);
}

function frameOf(page: CutPage | undefined, item: Item | undefined): string | null {
  if (item?.type === "frame") return item.id;
  if (typeof item?.frameClipId === "string" && !item.noClip && page?.elements.get(item.frameClipId)?.type === "frame") return item.frameClipId;
  return null;
}

const PAGE_IGNORED = new Set(["id", "elements", "dialogueI18n", "review", "note", "name"]);
const ITEM_IGNORED = new Set(["id"]);
const IMAGE_FIELDS = new Set(["src", "bg", "maskSrc", "frames", "activeFrameId", "bg3dScene", "vrmScene", "builtinRasterAssetId"]);
const IMAGE_TYPES = new Set(["image", "draw", "shape", "frame"]);

type DialogueChange = ApprovedCutChange["dialogue"][number];
type ChangeRow = { kinds: Set<ApprovedCutChangeKind>; dialogue: DialogueChange[] };
type ChangeRows = Map<string | null, ChangeRow>;

function rowFor(rows: ChangeRows, frameId: string | null): ChangeRow {
  const existing = rows.get(frameId);
  if (existing) return existing;
  const created: ChangeRow = { kinds: new Set(), dialogue: [] };
  rows.set(frameId, created);
  return created;
}

const EMPTY_ELEMENTS: ReadonlyMap<string, Item> = new Map();

function elementChanges(
  before: ReadonlyMap<string, Item>, after: ReadonlyMap<string, Item>,
  targets: (left: Item | undefined, right: Item | undefined) => ChangeRow[], master = false,
) {
  const reordered = new Set(reorderedIds(before, after));
  for (const id of new Set([...after.keys(), ...before.keys()])) {
    const a = before.get(id), b = after.get(id);
    const fields = changedFields(a ?? {}, b ?? {}, ITEM_IGNORED);
    if (!fields.length && !reordered.has(id)) continue;
    for (const target of targets(a, b)) {
      if (fields.includes("text")) {
        target.kinds.add("dialogue");
        target.dialogue.push({ elementId: id, ...(master ? { origin: "master" as const } : {}),
          before: typeof a?.text === "string" ? a.text : null, after: typeof b?.text === "string" ? b.text : null });
      }
      if (fields.some(key => IMAGE_FIELDS.has(key))
        || fields.length && [a?.type, b?.type].some(type => typeof type === "string" && IMAGE_TYPES.has(type))) target.kinds.add("image");
      if (master || reordered.has(id) || !a || !b || fields.some(key => key !== "text" && !IMAGE_FIELDS.has(key))) target.kinds.add("layer");
    }
  }
}

function localizedText(value: unknown) {
  if (value === undefined) return null;
  if (typeof value !== "string") throw new Error("번역 대사의 원문을 확인할 수 없습니다.");
  return value;
}

function localizedChanges(left: CutPage | undefined, right: CutPage | undefined,
  targets: (left: Item | undefined, right: Item | undefined) => ChangeRow[]) {
  if (!different(left?.item.dialogueI18n, right?.item.dialogueI18n)) return;
  const before = object(left?.item.dialogueI18n ?? {}), after = object(right?.item.dialogueI18n ?? {});
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = object(Object.hasOwn(before, id) ? before[id] : {}), b = object(Object.hasOwn(after, id) ? after[id] : {});
    for (const locale of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const oldText = localizedText(Object.hasOwn(a, locale) ? a[locale] : undefined);
      const newText = localizedText(Object.hasOwn(b, locale) ? b[locale] : undefined);
      if (oldText === newText) continue;
      for (const target of targets(left?.elements.get(id), right?.elements.get(id))) {
        target.kinds.add("dialogue");
        target.dialogue.push({ elementId: id, locale, before: oldText, after: newText });
      }
    }
  }
}

export function compareApprovedCuts(beforeSnapshot: unknown, afterSnapshot: unknown): readonly ApprovedCutChange[] {
  const before = object(beforeSnapshot), after = object(afterSnapshot);
  const previous = pagesOf(before), current = pagesOf(after);
  const pageOrder = new Set(reorderedIds(previous, current));
  const masterElements = (master: unknown) => master == null ? EMPTY_ELEMENTS : indexed(object(master).elements ?? []);
  const previousMaster = masterElements(before.master), currentMaster = masterElements(after.master);
  const masterChanged = different(before.master, after.master);
  const globalStyleChanged = ["width", "fx", "webtoonTheme", "panelGutter"].some(field => different(before[field], after[field]));
  const result: ApprovedCutChange[] = [];
  for (const pageId of new Set([...current.keys(), ...previous.keys()])) {
    const left = previous.get(pageId), right = current.get(pageId);
    const rows: ChangeRows = new Map();
    const targets = (a: Item | undefined, b: Item | undefined) => {
      const frames = new Set<string | null>();
      if (a) frames.add(frameOf(left, a));
      if (b) frames.add(frameOf(right, b));
      if (!frames.size) frames.add(null);
      return [...frames].map(id => rowFor(rows, id));
    };
    if (pageOrder.has(pageId) || globalStyleChanged) rowFor(rows, null).kinds.add("page");
    if (left && right) {
      for (const field of changedFields(left.item, right.item, PAGE_IGNORED)) {
        rowFor(rows, null).kinds.add(field === "groups" || field === "layerComps" ? "layer"
          : field === "bg" || field === "bgGrad" ? "image" : "page");
      }
    }

    const wasVisible = Boolean(left && left.item.hideMaster !== true);
    const isVisible = Boolean(right && right.item.hideMaster !== true);
    if ((masterChanged || wasVisible !== isVisible) && (wasVisible || isVisible)) {
      elementChanges(wasVisible ? previousMaster : EMPTY_ELEMENTS, isVisible ? currentMaster : EMPTY_ELEMENTS,
        () => [rowFor(rows, null)], true);
    }
    elementChanges(left?.elements ?? EMPTY_ELEMENTS, right?.elements ?? EMPTY_ELEMENTS, targets);
    localizedChanges(left, right, targets);
    if (!left || !right) {
      // 추가·삭제된 프레임에는 같은 행에 페이지 변경을 표시한다. 별도의 빈 페이지 행을 붙이지 않는다.
      if (!rows.size) rowFor(rows, null);
      for (const row of rows.values()) row.kinds.add("page");
    }
    for (const [frameId, entry] of rows) {
      result.push({ pageId, frameId, beforeIndex: left?.index ?? null, afterIndex: right?.index ?? null,
        kinds: [...entry.kinds], dialogue: entry.dialogue });
    }
  }
  return result;
}
