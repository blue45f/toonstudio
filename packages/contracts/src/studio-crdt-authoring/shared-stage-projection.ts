import * as Y from "yjs";

import { sha256HexPortable } from "../sha256-portable";

import { authoringId, authoringRecord } from "./raw-reader";

import type { StudioCrdtCompatibleElement } from "./page-reconcile";

interface StageEntry extends Record<string, unknown> { id: string; characters: Record<string, unknown>[] }
interface Receipt { elementId: string; modelRuntimeKey: string }
interface PageState { pageId: string; managed: boolean; value: unknown }
const STAGE_INDEX = "studio-shared-3d-stage-records-v1", RECEIPT_INDEX = "studio-shared-3d-stage-visibility-receipts-v1";
const STAGE_PREFIX = "studio-shared-3d-stage-record:", RECEIPT_PREFIX = "studio-shared-3d-stage-visibility-receipt:";
const rawCompare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function composite(value: string): { pageId: string; entryId: string } {
  const colon = value.indexOf(":"), firstLength = Number(value.slice(0, colon)), firstStart = colon + 1, firstEnd = firstStart + firstLength;
  const nextColon = value.indexOf(":", firstEnd), nextLength = Number(value.slice(firstEnd, nextColon)), nextStart = nextColon + 1;
  if (colon < 1 || nextColon <= firstEnd || !Number.isSafeInteger(firstLength) || firstLength < 1 || !Number.isSafeInteger(nextLength) || nextLength < 1 || nextStart + nextLength !== value.length) fail("공유 3D 장면 식별자가 올바르지 않습니다.");
  const pageId = authoringId(value.slice(firstStart, firstEnd)), entryId = authoringId(value.slice(nextStart));
  if (`${pageId.length}:${pageId}${entryId.length}:${entryId}` !== value) fail("공유 3D 장면 식별자가 비정규 형식입니다.");
  return { pageId, entryId };
}
function active(record: Y.Map<unknown>): boolean {
  let activation: number | undefined, deactivation: number | undefined;
  const activations = new Set<number>(), deactivations = new Set<number>();
  for (const [key, value] of record) {
    if (value !== true) continue;
    const match = /^(activate|deactivate):(0|[1-9][0-9]*)$/u.exec(key); if (!match) continue;
    const generation = Number(match[2]); if (!Number.isSafeInteger(generation) || generation > 255) fail("공유 3D 장면 세대가 올바르지 않습니다.");
    if (match[1] === "activate") { activations.add(generation); activation = Math.max(activation ?? -1, generation); }
    else { deactivations.add(generation); deactivation = Math.max(deactivation ?? -1, generation); }
  }
  if (activation === undefined && deactivation === undefined) fail("공유 3D 장면 세대 기록이 없습니다.");
  for (const value of activations) if (value > 0 && !deactivations.has(value - 1)) fail("공유 3D 장면 재활성화 기록이 불완전합니다.");
  for (const value of deactivations) if (value > 0 && !activations.has(value)) fail("공유 3D 장면 비활성화 기록이 불완전합니다.");
  return activation !== undefined && activation > (deactivation ?? -1);
}
function collection(stages: StageEntry[], visibilityReceipts: Receipt[]): unknown {
  const base = { kind: "toonstudio.studio-shared-3d-stage-collection", version: 3, authority: "page-shared-3d-stage-collection", stages, visibilityReceipts };
  if (stages.length <= 64) return base;
  const fingerprint = (value: unknown) => {
    const serialized = JSON.stringify(value); let hash = 0x811c9dc5;
    for (let index = 0; index < serialized.length; index++) { hash ^= serialized.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
    return (hash >>> 0).toString(16).padStart(8, "0");
  };
  const chunks = <T>(values: T[], size: number, prefix: string) => {
    const pages: Array<{ id: string; items: T[] }> = [];
    for (let offset = 0; offset < values.length; offset += size) { const items = values.slice(offset, offset + size); pages.push({ id: `${prefix}-page-${pages.length.toString(36).padStart(4, "0")}-${fingerprint(items)}`, items }); }
    return pages;
  };
  const result = { kind: base.kind, version: 4, authority: base.authority, stagePages: chunks(stages, 64, "stage"), visibilityReceiptPages: chunks(visibilityReceipts, 256, "receipt") };
  Object.defineProperties(result, { stages: { enumerable: false, value: stages }, visibilityReceipts: { enumerable: false, value: visibilityReceipts } });
  return result;
}

/** 전체 의미 검증을 통과한 sidecar의 generation·순서·비활성 이력을 원고 형태로 재구성한다. */
export function readValidatedStudioCrdtSharedStagePages(doc: Y.Doc): readonly PageState[] {
  const stageIndex = doc.getMap<unknown>(STAGE_INDEX), receiptIndex = doc.getMap<unknown>(RECEIPT_INDEX);
  const stagesByPage = new Map<string, Array<{ order: number; id: string; active: boolean; entry: StageEntry }>>();
  const receiptsByPage = new Map<string, Array<{ active: boolean; receipt: Receipt }>>();
  for (const [key, indexed] of stageIndex) {
    if (indexed !== true) fail("공유 3D 장면 인덱스가 올바르지 않습니다.");
    const { pageId, entryId } = composite(key), record = doc.getMap<unknown>(`${STAGE_PREFIX}${encodeURIComponent(key)}`);
    const payload = record.get("payload"), order = record.get("order");
    if (record.get("pageId") !== pageId || record.get("stageId") !== entryId || record.get("payloadVersion") !== 1 || typeof payload !== "string" || typeof order !== "number" || !Number.isFinite(order)) fail("공유 3D 장면 기록이 올바르지 않습니다.");
    const entry = authoringRecord(JSON.parse(payload));
    if (entry.id !== entryId || !Array.isArray(entry.characters) || JSON.stringify(entry) !== payload) fail("공유 3D 장면 원본이 비정규 형식입니다.");
    const characters = entry.characters.map(authoringRecord), typed: StageEntry = { ...entry, id: entryId, characters };
    const list = stagesByPage.get(pageId) ?? []; list.push({ id: entryId, order, active: active(record), entry: typed }); stagesByPage.set(pageId, list);
  }
  for (const [key, indexed] of receiptIndex) {
    if (indexed !== true) fail("공유 3D 장면 영수증 인덱스가 올바르지 않습니다.");
    const { pageId, entryId } = composite(key), record = doc.getMap<unknown>(`${RECEIPT_PREFIX}${encodeURIComponent(key)}`), runtime = record.get("modelRuntimeKey");
    if (record.get("pageId") !== pageId || record.get("elementId") !== entryId || record.get("payloadVersion") !== 1 || typeof runtime !== "string") fail("공유 3D 장면 영수증이 올바르지 않습니다.");
    const list = receiptsByPage.get(pageId) ?? []; list.push({ active: active(record), receipt: { elementId: entryId, modelRuntimeKey: runtime } }); receiptsByPage.set(pageId, list);
  }
  for (const name of doc.share.keys()) for (const [prefix, index] of [[STAGE_PREFIX, stageIndex], [RECEIPT_PREFIX, receiptIndex]] as const) if (name.startsWith(prefix)) {
    const key = decodeURIComponent(name.slice(prefix.length)); composite(key);
    if (index.get(key) !== true || `${prefix}${encodeURIComponent(key)}` !== name) fail("인덱스 없는 공유 3D 장면 root가 있습니다.");
  }
  return [...new Set([...stagesByPage.keys(), ...receiptsByPage.keys()])].sort(rawCompare).map((pageId) => {
    const records = stagesByPage.get(pageId) ?? []; if (!records.length && (receiptsByPage.get(pageId)?.length ?? 0)) fail("공유 3D 장면 영수증의 Stage가 없습니다.");
    const stages = records.filter((record) => record.active).sort((a, b) => a.order - b.order || rawCompare(a.id, b.id)).map((record) => record.entry);
    const authorities = new Set(stages.flatMap((stage) => stage.characters.map((character) => `${character.elementId}\0${character.modelRuntimeKey}`)));
    const receipts = (receiptsByPage.get(pageId) ?? []).filter((entry) => entry.active && authorities.has(`${entry.receipt.elementId}\0${entry.receipt.modelRuntimeKey}`)).map((entry) => entry.receipt).sort((a, b) => rawCompare(a.elementId, b.elementId));
    return { pageId, managed: true, value: stages.length ? collection(stages, receipts) : undefined };
  });
}

/** baseline VRM 모델은 이미 정규화된 원본이다. 포즈·원본 bytes를 재구성하거나 다른 모델로 추정하지 않는다. */
export function validatedStudioSharedStageOverlay(value: unknown, elements: readonly StudioCrdtCompatibleElement[]): ReadonlySet<string> {
  const state = authoringRecord(value);
  const receipts = Array.isArray(state.visibilityReceipts) ? state.visibilityReceipts : Array.isArray(state.visibilityReceiptPages)
    ? state.visibilityReceiptPages.flatMap((page) => { const record = authoringRecord(page); return Array.isArray(record.items) ? record.items : fail("공유 3D 장면 영수증 페이지가 올바르지 않습니다."); })
    : state.version === 1 && Array.isArray(state.characters) ? state.characters.filter((character) => authoringRecord(character).hiddenByStage === true).map((character) => { const record = authoringRecord(character); return { elementId: record.elementId, modelRuntimeKey: record.modelRuntimeKey }; })
    : fail("지원하지 않는 공유 3D 장면 원고입니다.");
  const result = new Set<string>();
  for (const raw of receipts) {
    const receipt = authoringRecord(raw), matches = elements.filter((element) => element.id === receipt.elementId), element = matches[0];
    if (matches.length !== 1 || element?.type !== "image") continue;
    const scene: unknown = Reflect.get(element, "vrmScene"); if (scene === undefined) continue;
    const model = authoringRecord(scene).model; authoringRecord(model);
    const runtime = `${element.id}:sha256:${sha256HexPortable(new TextEncoder().encode(JSON.stringify(model)))}`;
    if (runtime === receipt.modelRuntimeKey) result.add(element.id);
  }
  return result;
}
function fail(message: string): never { throw new Error(message); }
