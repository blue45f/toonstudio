import * as Y from "yjs";

import type { StudioCrdtProjectionStrokePayload } from "./element-projection";
import type { StudioCrdtAuthoringGroupRecord, StudioCrdtAuthoringPageRecord, StudioCrdtAuthoringSceneRecord } from "./page-reconcile";

export interface StudioCrdtDecodedStroke {
  id: string; pageId: string; layerId: string; deleted: boolean; orderIndex: number;
  status: "drawing" | "finalized";
  payload: StudioCrdtProjectionStrokePayload & Record<string, unknown>;
}
export interface StudioCrdtDecodedAuthoring {
  strokes: StudioCrdtDecodedStroke[]; sceneElements: StudioCrdtAuthoringSceneRecord[];
  pages: StudioCrdtAuthoringPageRecord[]; groups: StudioCrdtAuthoringGroupRecord[];
  rawByEntity: ReadonlyMap<string, unknown>;
}
const SAMPLE_KEYS = ["points", "pressures", "tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures", "altitudeAngles", "azimuthAngles", "contactWidths", "contactHeights", "sampleTimeOffsets"] as const;
const STRING_KEYS = ["fill", "brush", "blendMode", "brushCatalogId", "brushCatalogName"] as const;
const JSON_KEYS = ["gradient", "pattern", "brushDynamics", "brushTip", "strokeStyle", "shapeParams", "sketch", "symmetry", "extensions"] as const;
const SCENE_TYPES = new Set(["text", "bubble", "sticker", "frame", "focusLines", "speedLines", "reference"]);

export function authoringRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail("원고는 일반 JSON 객체여야 합니다.");
  return value as Record<string, unknown>;
}
export function authoringId(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 160 || /\p{Cc}/u.test(value)) fail("원고 식별자가 올바르지 않습니다.");
  return value;
}

/** toJSON()으로 Y 형식을 지우지 않는다. 지원하는 원시 타입과 배열을 직접 읽고 불완전한 값은 거절한다. */
export function readStudioCrdtRawValue(value: unknown, depth = 0): unknown {
  if (depth > 32) fail("원고 중첩 깊이가 허용 범위를 초과했습니다.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Y.Array) return value.toArray().map((item) => readStudioCrdtRawValue(item, depth + 1));
  if (value instanceof Y.Map) return Object.fromEntries([...value].map(([key, item]) => [key, readStudioCrdtRawValue(item, depth + 1)]));
  if (Array.isArray(value)) return value.map((item) => readStudioCrdtRawValue(item, depth + 1));
  const record = authoringRecord(value);
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, readStudioCrdtRawValue(item, depth + 1)]));
}

function mapRoot(doc: Y.Doc, name: string): Y.Map<unknown> {
  try { return doc.getMap<unknown>(name); } catch { return fail(`원고 ${name} root 형식이 올바르지 않습니다.`); }
}
function arrayRoot(doc: Y.Doc, name: string): Y.Array<unknown> {
  try { return doc.getArray<unknown>(name); } catch { return fail(`원고 ${name} root 형식이 올바르지 않습니다.`); }
}
function text(record: Y.Map<unknown>, key: string): string { return authoringId(record.get(key)); }
function boundedText(record: Y.Map<unknown>, key: string, maximum: number): string {
  const value = record.get(key);
  if (typeof value !== "string" || !value || value.length > maximum || /\p{Cc}/u.test(value)) fail("획 문자열이 올바르지 않습니다.");
  return value;
}
function properties(record: Y.Map<unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let encoded = 0;
  for (const key of record.keys()) if (/^(?:base|prop|unset):/u.test(key) && ++encoded > 256) fail("원고 속성 수가 허용 범위를 초과했습니다.");
  for (const prefix of ["base:", "prop:"]) for (const [key, value] of record) if (key.startsWith(prefix)) result[key.slice(prefix.length)] = readStudioCrdtRawValue(value);
  for (const [key, value] of record) if (key.startsWith("unset:") && value === true) delete result[key.slice(6)];
  return result;
}
function activeOrder(entries: readonly unknown[], idKey: string): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  entries.forEach((entry, index) => {
    if (!(entry instanceof Y.Map)) fail("원고 순서 항목 형식이 올바르지 않습니다.");
    if (entry.get("active") === true && typeof entry.get(idKey) === "string") result.set(text(entry, idKey), index);
  });
  return result;
}
function readStroke(record: Y.Map<unknown>): StudioCrdtDecodedStroke["payload"] {
  const version = record.get("payloadVersion"), strokeWidth = record.get("strokeWidth"), mode = record.get("mode");
  if (![1, 2, 3, 4, 5, 6].includes(Number(version)) || record.get("type") !== "draw" ||
    (mode !== "pen" && mode !== "eraser") || typeof strokeWidth !== "number" || !Number.isFinite(strokeWidth)) fail("지원하지 않는 획 페이로드입니다.");
  const points = record.get("points");
  if (!(points instanceof Y.Array)) fail("획 좌표 채널이 없습니다.");
  const values = points.toArray();
  if (values.length % 2 || values.length > 200_000 || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) fail("획 좌표 채널이 올바르지 않습니다.");
  const payload: StudioCrdtDecodedStroke["payload"] = {
    version, type: "draw", kind: boundedText(record, "kind", 80), mode,
    stroke: boundedText(record, "stroke", 256), strokeWidth, points: values as number[],
  };
  for (const [index, key] of SAMPLE_KEYS.entries()) {
    const value = record.get(key);
    if (value === undefined && index >= 7) continue;
    if (!(value instanceof Y.Array)) fail("획 포인터 채널이 없습니다.");
    const channel = value.toArray();
    if ((index === 0 ? channel.length !== values.length : channel.length !== values.length / 2) || channel.some((item) => typeof item !== "number" || !Number.isFinite(item))) fail("획 포인터 채널이 좌표와 정렬되지 않았습니다.");
    payload[key] = channel;
  }
  for (const key of ["opacity", "sampleSpacing"] as const) {
    const value = record.get(key);
    if (value !== undefined) { if (typeof value !== "number" || !Number.isFinite(value)) fail("획 수치가 올바르지 않습니다."); payload[key] = value; }
  }
  for (const key of STRING_KEYS) { const value = record.get(key); if (value !== undefined) { if (typeof value !== "string") fail("획 문자열이 올바르지 않습니다."); payload[key] = value; } }
  for (const key of JSON_KEYS) { const value = record.get(key); if (value !== undefined) payload[key] = authoringRecord(readStudioCrdtRawValue(value)); }
  return payload;
}

/** 호출자는 기존 전체 Y 의미 검증을 먼저 통과시켜야 한다. 미해결 causal 상태와 구조 손실은 이 경계도 거절한다. */
export function decodeValidatedStudioCrdtAuthoring(doc: Y.Doc): StudioCrdtDecodedAuthoring {
  if (doc.store.pendingStructs !== null || doc.store.pendingDs !== null) fail("아직 병합되지 않은 원고 변경이 있습니다.");
  const operations = mapRoot(doc, "studio-deletion-ops"), acknowledgements = mapRoot(doc, "studio-deletion-acks");
  const activeDeletions = new Set<string>();
  for (const [id, target] of operations) if (typeof target === "string" && acknowledgements.get(id) !== target) activeDeletions.add(target);
  const mixedOrder = arrayRoot(doc, "stroke-order").toArray(), pageOrder = arrayRoot(doc, "page-order").toArray();
  const strokeOrder = activeOrder(mixedOrder, "strokeId"), sceneOrder = activeOrder(mixedOrder, "elementId"), pagesOrder = activeOrder(pageOrder, "pageId");
  const rawByEntity = new Map<string, unknown>();
  const raw = (kind: string, id: string, record: Y.Map<unknown>, target: string, order: readonly unknown[], idKey: string) => {
    rawByEntity.set(`${kind}:${id}`, { record: readStudioCrdtRawValue(record),
      order: order.flatMap((entry) => entry instanceof Y.Map && entry.get(idKey) === id ? [readStudioCrdtRawValue(entry)] : []),
      deletions: [...operations].filter(([, value]) => value === target), acknowledgements: [...acknowledgements].filter(([, value]) => value === target) });
  };
  const strokes: StudioCrdtDecodedStroke[] = [];
  for (const [key, value] of mapRoot(doc, "strokes")) {
    const id = authoringId(key);
    if (!(value instanceof Y.Map) || text(value, "id") !== id) fail("획 원본 기록이 올바르지 않습니다.");
    const status = value.get("status"); if (status !== "drawing" && status !== "finalized") fail("획 진행 상태가 올바르지 않습니다.");
    const target = JSON.stringify(["stroke", id]);
    strokes.push({ id, pageId: text(value, "pageId"), layerId: text(value, "layerId"), status,
      deleted: value.get("deleted") === true || activeDeletions.has(target), orderIndex: strokeOrder.get(id) ?? Number.MAX_SAFE_INTEGER, payload: readStroke(value) });
    raw("stroke", id, value, target, mixedOrder, "strokeId");
  }
  const sceneElements: StudioCrdtAuthoringSceneRecord[] = [];
  for (const [key, indexed] of mapRoot(doc, "scene-elements")) {
    const id = authoringId(key); if (indexed !== true) fail("장면 요소 인덱스가 올바르지 않습니다.");
    const value = mapRoot(doc, `scene-element:${encodeURIComponent(id)}`), type = value.get("type");
    if (text(value, "id") !== id || value.get("payloadVersion") !== 1 || typeof type !== "string" || !SCENE_TYPES.has(type)) fail("장면 요소 페이로드가 올바르지 않습니다.");
    const target = JSON.stringify(["scene", id]);
    sceneElements.push({ id, pageId: text(value, "pageId"), layerId: text(value, "layerId"), deleted: value.get("deleted") === true || activeDeletions.has(target),
      orderIndex: sceneOrder.get(id) ?? Number.MAX_SAFE_INTEGER, payload: { type, props: properties(value) } });
    raw("element", id, value, target, mixedOrder, "elementId");
  }
  const pages: StudioCrdtAuthoringPageRecord[] = [];
  for (const [key, indexed] of mapRoot(doc, "studio-pages")) {
    const id = authoringId(key); if (indexed !== true) fail("페이지 인덱스가 올바르지 않습니다.");
    const value = mapRoot(doc, `studio-page:${encodeURIComponent(id)}`);
    if (text(value, "id") !== id || value.get("payloadVersion") !== 1) fail("페이지 페이로드가 올바르지 않습니다.");
    const target = JSON.stringify(["page", id]);
    pages.push({ id, deleted: value.get("deleted") === true || activeDeletions.has(target), orderIndex: pagesOrder.get(id) ?? Number.MAX_SAFE_INTEGER, payload: { props: properties(value) } });
  }
  const groups: StudioCrdtAuthoringGroupRecord[] = [];
  for (const [key, indexed] of mapRoot(doc, "layer-groups")) {
    if (indexed !== true) fail("레이어 그룹 인덱스가 올바르지 않습니다.");
    const value = mapRoot(doc, `layer-group:${encodeURIComponent(key)}`), id = text(value, "id"), pageId = text(value, "pageId");
    if (key !== `${pageId.length}:${pageId}${id.length}:${id}` || value.get("payloadVersion") !== 1) fail("레이어 그룹 페이로드가 올바르지 않습니다.");
    const target = JSON.stringify(["group", pageId, id]);
    groups.push({ id, pageId, deleted: value.get("deleted") === true || activeDeletions.has(target), payload: { props: properties(value) } });
    raw("group", key, value, target, [], "");
  }
  return { strokes, sceneElements, pages, groups, rawByEntity };
}
function fail(message: string): never { throw new Error(message); }
