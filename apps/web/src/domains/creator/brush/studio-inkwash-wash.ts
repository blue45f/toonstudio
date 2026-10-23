/**
 * Shared InkWash wash — the document of record for `inkwash-pen` / `inkwash-water-brush`.
 *
 * Live overlay and committed `planStudioWetInkBrushReplay` deposit into the same field so a
 * water stroke can wash unfixed pen ink. Konva/DrawNode reconstruction uses the stroke journal.
 */

import {
  STUDIO_INKWASH_FLUID_MAX_DIMENSION,
  createStudioInkwashFluidSession,
  fixStudioInkwashFluid,
  readStudioInkwashFluidCell,
  resolveStudioInkwashFluidDisplay,
  stepStudioInkwashFluid,
  studioInkwashFluidDigest,
  studioInkwashFluidStepParams,
  type StudioInkwashFluidSession,
} from "./studio-inkwash-fluid";

import type { DrawEl } from "../studio-element-model";


export const STUDIO_INKWASH_WASH_KEY = "studio-inkwash-wash" as const;

/** Maximum concurrent wash records kept in memory across page/key epochs (LRU). */
export const STUDIO_INKWASH_WASH_MAX_RECORDS = 8;
/** Maximum total fluid cells (`width * height`) in a single shared wash session (`4096 * 4096`). */
export const STUDIO_INKWASH_WASH_MAX_CELLS =
  STUDIO_INKWASH_FLUID_MAX_DIMENSION * STUDIO_INKWASH_FLUID_MAX_DIMENSION;
/** Maximum stroke journal entries retained per wash record. */
export const STUDIO_INKWASH_WASH_MAX_JOURNAL_ENTRIES = 256;
/** Maximum applied stroke signatures retained per wash record. */
export const STUDIO_INKWASH_WASH_MAX_APPLIED_ENTRIES = 512;

export interface StudioInkwashWash {
  readonly key: string;
  readonly pageEpoch: string | number | null;
  readonly session: StudioInkwashFluidSession;
  /** Document-space origin of field cell (0, 0). */
  readonly originX: number;
  readonly originY: number;
  readonly fieldScale: number;
  readonly journal: readonly DrawEl[];
}

interface StudioInkwashWashRecord {
  key: string;
  pageEpoch: string | number | null;
  session: StudioInkwashFluidSession;
  originX: number;
  originY: number;
  fieldScale: number;
  journal: DrawEl[];
  applied: Map<string, string>;
  displayCache: { revision: number; upload: ReturnType<typeof resolveStudioInkwashFluidDisplay> } | null;
}

const washes = new Map<string, StudioInkwashWashRecord>();

function snapshot(record: StudioInkwashWashRecord): StudioInkwashWash {
  return {
    key: record.key,
    pageEpoch: record.pageEpoch,
    session: record.session,
    originX: record.originX,
    originY: record.originY,
    fieldScale: record.fieldScale,
    journal: record.journal,
  };
}

export function resetStudioInkwashWash(key: string = STUDIO_INKWASH_WASH_KEY): void {
  washes.delete(key);
}

export function studioInkwashWashRecordCountForTests(): number {
  return washes.size;
}

export function getStudioInkwashWash(
  key: string = STUDIO_INKWASH_WASH_KEY,
): StudioInkwashWash | null {
  const record = washes.get(key);
  if (!record) return null;
  washes.delete(key);
  washes.set(key, record);
  return snapshot(record);
}

export function studioInkwashStrokeSignature(element: DrawEl): string {
  const points = element.points.join(",");
  const pressures = (element.pressures ?? []).join(",");
  return `${element.id}\u001f${element.brush}\u001f${points}\u001f${pressures}`;
}

function copySession(
  source: StudioInkwashFluidSession,
  target: StudioInkwashFluidSession,
  offsetX: number,
  offsetY: number,
): void {
  const { fluid: src, fixed: srcFixed } = source;
  const { fluid: dst, fixed: dstFixed } = target;
  const dx = Math.round(offsetX);
  const dy = Math.round(offsetY);
  for (let y = 0; y < src.height; y += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= dst.height) continue;
    for (let x = 0; x < src.width; x += 1) {
      const nx = x + dx;
      if (nx < 0 || nx >= dst.width) continue;
      const from = y * src.width + x;
      const to = ny * dst.width + nx;
      dst.wet[to] = src.wet[from] ?? 0;
      const from4 = from * 4;
      const to4 = to * 4;
      dst.pigment[to4] = src.pigment[from4] ?? 0;
      dst.pigment[to4 + 1] = src.pigment[from4 + 1] ?? 0;
      dst.pigment[to4 + 2] = src.pigment[from4 + 2] ?? 0;
      dst.pigment[to4 + 3] = src.pigment[from4 + 3] ?? 0;
      dstFixed[to4] = srcFixed[from4] ?? 0;
      dstFixed[to4 + 1] = srcFixed[from4 + 1] ?? 0;
      dstFixed[to4 + 2] = srcFixed[from4 + 2] ?? 0;
      dstFixed[to4 + 3] = srcFixed[from4 + 3] ?? 0;
    }
  }
  target.simulationStep = source.simulationStep;
  target.revision = source.revision + 1;
}

export function ensureStudioInkwashWash(input: Readonly<{
  key?: string;
  pageEpoch?: string | number | null;
  originX: number;
  originY: number;
  width: number;
  height: number;
  fieldScale: number;
}>): StudioInkwashWash {
  const key = input.key ?? STUDIO_INKWASH_WASH_KEY;
  const fieldScale = Number.isFinite(input.fieldScale) && input.fieldScale > 0 ? input.fieldScale : 4;
  const inOriginX = Number.isFinite(input.originX) ? input.originX : 0;
  const inOriginY = Number.isFinite(input.originY) ? input.originY : 0;
  let inWidth = Number.isFinite(input.width)
    ? Math.min(STUDIO_INKWASH_FLUID_MAX_DIMENSION, Math.max(8, Math.ceil(input.width)))
    : 8;
  let inHeight = Number.isFinite(input.height)
    ? Math.min(STUDIO_INKWASH_FLUID_MAX_DIMENSION, Math.max(8, Math.ceil(input.height)))
    : 8;
  if (inWidth * inHeight > STUDIO_INKWASH_WASH_MAX_CELLS) {
    const ratio = Math.sqrt(STUDIO_INKWASH_WASH_MAX_CELLS / (inWidth * inHeight));
    inWidth = Math.max(8, Math.floor(inWidth * ratio));
    inHeight = Math.max(8, Math.floor(inHeight * ratio));
  }

  const existing = washes.get(key);
  if (
    existing
    && (input.pageEpoch === undefined || Object.is(existing.pageEpoch, input.pageEpoch))
    && existing.fieldScale === fieldScale
    && existing.originX <= inOriginX + 1e-9
    && existing.originY <= inOriginY + 1e-9
    && existing.originX + existing.session.fluid.width / existing.fieldScale
      >= inOriginX + inWidth / fieldScale - 1e-9
    && existing.originY + existing.session.fluid.height / existing.fieldScale
      >= inOriginY + inHeight / fieldScale - 1e-9
  ) {
    washes.delete(key);
    washes.set(key, existing);
    return snapshot(existing);
  }

  let originX = inOriginX;
  let originY = inOriginY;
  let width = inWidth;
  let height = inHeight;
  if (existing && Object.is(existing.pageEpoch, input.pageEpoch ?? existing.pageEpoch)
    && existing.fieldScale === fieldScale) {
    const inEndX = inOriginX + inWidth / fieldScale;
    const inEndY = inOriginY + inHeight / fieldScale;
    const unionOriginX = Math.min(existing.originX, inOriginX);
    const unionOriginY = Math.min(existing.originY, inOriginY);
    const unionEndX = Math.max(
      existing.originX + existing.session.fluid.width / fieldScale,
      inEndX,
    );
    const unionEndY = Math.max(
      existing.originY + existing.session.fluid.height / fieldScale,
      inEndY,
    );
    let unionWidth = Math.min(
      STUDIO_INKWASH_FLUID_MAX_DIMENSION,
      Math.max(inWidth, Math.ceil((unionEndX - unionOriginX) * fieldScale)),
    );
    let unionHeight = Math.min(
      STUDIO_INKWASH_FLUID_MAX_DIMENSION,
      Math.max(inHeight, Math.ceil((unionEndY - unionOriginY) * fieldScale)),
    );
    if (unionWidth * unionHeight > STUDIO_INKWASH_WASH_MAX_CELLS) {
      const ratio = Math.sqrt(STUDIO_INKWASH_WASH_MAX_CELLS / (unionWidth * unionHeight));
      unionWidth = Math.max(inWidth, Math.floor(unionWidth * ratio));
      unionHeight = Math.max(inHeight, Math.floor(unionHeight * ratio));
      if (unionWidth * unionHeight > STUDIO_INKWASH_WASH_MAX_CELLS) {
        if (unionWidth > inWidth) {
          unionWidth = Math.max(inWidth, Math.floor(STUDIO_INKWASH_WASH_MAX_CELLS / unionHeight));
        }
        if (unionWidth * unionHeight > STUDIO_INKWASH_WASH_MAX_CELLS && unionHeight > inHeight) {
          unionHeight = Math.max(inHeight, Math.floor(STUDIO_INKWASH_WASH_MAX_CELLS / unionWidth));
        }
      }
    }
    width = unionWidth;
    height = unionHeight;
    originX = unionOriginX;
    originY = unionOriginY;
    // If the capped field cannot span from unionOrigin to the far edge of the active stroke,
    // slide the origin on the integer cell lattice so the active stroke is 100% contained.
    if (originX + width / fieldScale < inEndX - 1e-9) {
      originX = inOriginX - (width - inWidth) / fieldScale;
    }
    if (originY + height / fieldScale < inEndY - 1e-9) {
      originY = inOriginY - (height - inHeight) / fieldScale;
    }
  }

  const session = createStudioInkwashFluidSession({ width, height });
  if (existing && Object.is(existing.pageEpoch, input.pageEpoch ?? existing.pageEpoch) && existing.fieldScale === fieldScale) {
    const offsetX = (existing.originX - originX) * fieldScale;
    const offsetY = (existing.originY - originY) * fieldScale;
    copySession(existing.session, session, offsetX, offsetY);
  }

  const sameEpoch = existing && Object.is(existing.pageEpoch, input.pageEpoch ?? existing.pageEpoch);
  const record: StudioInkwashWashRecord = {
    key,
    pageEpoch: input.pageEpoch ?? existing?.pageEpoch ?? null,
    session,
    originX,
    originY,
    fieldScale,
    journal: sameEpoch ? existing.journal : [],
    applied: sameEpoch ? existing.applied : new Map(),
    displayCache: null,
  };
  if (washes.has(key)) {
    washes.delete(key);
  } else if (washes.size >= STUDIO_INKWASH_WASH_MAX_RECORDS) {
    const oldestKey = washes.keys().next().value;
    if (oldestKey !== undefined) washes.delete(oldestKey);
  }
  washes.set(key, record);
  return snapshot(record);
}

export function studioInkwashDocumentToField(
  wash: StudioInkwashWash,
  x: number,
  y: number,
): { readonly x: number; readonly y: number } {
  return {
    x: (x - wash.originX) * wash.fieldScale,
    y: (y - wash.originY) * wash.fieldScale,
  };
}

export function readStudioInkwashWashDocumentCell(
  wash: StudioInkwashWash,
  documentX: number,
  documentY: number,
): ReturnType<typeof readStudioInkwashFluidCell> {
  const field = studioInkwashDocumentToField(wash, documentX, documentY);
  return readStudioInkwashFluidCell(
    wash.session,
    Math.round(field.x),
    Math.round(field.y),
  );
}

export function upsertStudioInkwashWashStroke(
  element: DrawEl,
  key: string = STUDIO_INKWASH_WASH_KEY,
): void {
  const record = washes.get(key);
  if (!record) return;
  const index = record.journal.findIndex((entry) => entry.id === element.id);
  const copy = { ...element, points: [...element.points], pressures: element.pressures ? [...element.pressures] : undefined };
  if (index >= 0) {
    record.journal[index] = copy as DrawEl;
  } else {
    if (record.journal.length >= STUDIO_INKWASH_WASH_MAX_JOURNAL_ENTRIES) {
      record.journal.shift();
    }
    record.journal.push(copy as DrawEl);
  }
}

export function studioInkwashWashNeedsDeposit(
  element: DrawEl,
  key: string = STUDIO_INKWASH_WASH_KEY,
): boolean {
  const record = washes.get(key);
  if (!record) return true;
  return record.applied.get(element.id) !== studioInkwashStrokeSignature(element);
}

export function markStudioInkwashWashDeposited(
  element: DrawEl,
  key: string = STUDIO_INKWASH_WASH_KEY,
): void {
  const record = washes.get(key);
  if (!record) return;
  if (record.applied.has(element.id)) {
    record.applied.delete(element.id);
  } else if (record.applied.size >= STUDIO_INKWASH_WASH_MAX_APPLIED_ENTRIES) {
    const oldestId = record.applied.keys().next().value;
    if (oldestId !== undefined) record.applied.delete(oldestId);
  }
  record.applied.set(element.id, studioInkwashStrokeSignature(element));
}

/**
 * 워시가 지금까지 침착한 획의 (id, 서명) 목록. 문서 대조(reconcile)가 "문서에서 사라졌거나 형태가
 * 바뀐 획이 아직 안료로 남아 있는가"를 판정하는 유일한 입력이다.
 */
export function studioInkwashWashAppliedEntries(
  key: string = STUDIO_INKWASH_WASH_KEY,
): ReadonlyArray<readonly [id: string, signature: string]> {
  const record = washes.get(key);
  if (!record) return [];
  return Array.from(record.applied.entries(), ([id, signature]) => [id, signature] as const);
}

export function stepStudioInkwashWash(
  key: string = STUDIO_INKWASH_WASH_KEY,
  steps: number,
): void {
  const record = washes.get(key);
  if (!record) return;
  stepStudioInkwashFluid(record.session, steps, studioInkwashFluidStepParams());
}

export function commitStudioInkwashWash(
  key: string = STUDIO_INKWASH_WASH_KEY,
): boolean {
  const record = washes.get(key);
  if (!record) return false;
  fixStudioInkwashFluid(record.session);
  return true;
}

export function studioInkwashWashDigest(
  key: string = STUDIO_INKWASH_WASH_KEY,
): string | null {
  const record = washes.get(key);
  return record ? studioInkwashFluidDigest(record.session) : null;
}

export function studioInkwashWashDisplay(
  key: string = STUDIO_INKWASH_WASH_KEY,
  clip?: Readonly<{ x: number; y: number; width: number; height: number }>,
) {
  const record = washes.get(key);
  if (!record) return null;
  if (
    !clip
    && record.displayCache
    && record.displayCache.revision === record.session.revision
  ) {
    return record.displayCache.upload;
  }
  const upload = resolveStudioInkwashFluidDisplay(record.session, clip ? { clip } : undefined);
  if (!clip) {
    record.displayCache = { revision: record.session.revision, upload };
  }
  return upload;
}

export function studioInkwashWashVisualOwnerId(
  key: string = STUDIO_INKWASH_WASH_KEY,
): string | null {
  const record = washes.get(key);
  if (!record || record.journal.length === 0) return null;
  return record.journal[record.journal.length - 1]?.id ?? null;
}
