/**
 * @file chunked-sqlite-document-reader.ts
 * @description `CSFCHUNK` 문서의 SQLite 문서 DB에서 가져오기에 필요한 표를 읽는다: 캔버스, 레이어 행, 벡터 레이어 목록, 래스터 연결
 *              (`Layer → Mipmap → MipmapInfo → Offscreen`), 미리보기 PNG.
 *
 * 모든 조회는 주입된 `ClipSqliteDatabase`를 거치며, 표·열 이름은 상수와 `tableColumns`로 확인한 이름만 쓴다. 파일에 없는 표·열은 오류가
 * 아니라 "값 없음"으로 다룬다(제3자 명세 S1: 표와 열은 처음 필요할 때 만들어진다). 근거 수준과 출처는 `chunked-sqlite-layer-model.ts`·
 * `chunked-sqlite-document.ts` 머리말에 있다.
 */

import {
  ClipDocumentError,
  CLIP_SQLITE_MAX_IN_VALUES,
  type ClipCanvasInfo,
  type ClipCanvasUnit,
  type ClipDocumentLimits,
  type ClipSqliteColumn,
  type ClipSqliteDatabase,
  type ClipSqliteSelect,
  type ClipSqliteValue,
} from "./chunked-sqlite-document-types";
import { clipDiagnosticText, type ClipIssueList } from "./chunked-sqlite-issues";
import { CLIP_LAYER_COLUMNS, projectClipLayerRow, readClipInteger, readClipNumber, type ClipLayerRow } from "./chunked-sqlite-layer-model";
import { stripTrailingNuls } from "./format-common";

export interface ClipReaderContext {
  readonly db: ClipSqliteDatabase;
  readonly limits: ClipDocumentLimits;
  readonly warnings: ClipIssueList;
  readonly signal: AbortSignal | undefined;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const LATIN1 = new TextDecoder("latin1");

export function throwIfClipAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new ClipDocumentError("`.clip` 가져오기가 중단되었다", "aborted");
}

function describeFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return clipDiagnosticText(message, 200);
}

/** 판독기 호출을 감싼다. 중단 신호가 서 있으면 `aborted`, 그 밖의 실패는 `reader-failed`로 바꿔 던진다. */
async function query<T>(ctx: ClipReaderContext, operation: () => Promise<T> | T): Promise<T> {
  throwIfClipAborted(ctx.signal);
  try {
    return await operation();
  } catch (error) {
    throwIfClipAborted(ctx.signal);
    if (error instanceof ClipDocumentError) throw error;
    throw new ClipDocumentError(`SQLite 판독기가 실패했다: ${describeFailure(error)}`, "reader-failed", { cause: error });
  }
}

async function tableColumns(ctx: ClipReaderContext, table: string): Promise<ReadonlySet<string> | null> {
  const columns = await query(ctx, () => ctx.db.tableColumns(table));
  if (columns === null) return null;
  if (!Array.isArray(columns)) throw new ClipDocumentError(`${table} 열 목록이 배열이 아니다`, "reader-failed");
  return new Set(columns.filter((name): name is string => typeof name === "string"));
}

/** `select`를 부르고 판독기 약속(행 수 ≤ limit, 행마다 열 수 일치)을 확인한다. */
async function selectRows(ctx: ClipReaderContext, request: ClipSqliteSelect): Promise<readonly (readonly ClipSqliteValue[])[]> {
  if (request.where !== undefined && request.where.in.length > CLIP_SQLITE_MAX_IN_VALUES) {
    throw new ClipDocumentError(`where.in 값이 ${CLIP_SQLITE_MAX_IN_VALUES}개를 넘는다`, "reader-failed");
  }
  const rows = await query(ctx, () => ctx.db.select(request));
  if (!Array.isArray(rows)) throw new ClipDocumentError(`${request.table} 조회 결과가 배열이 아니다`, "reader-failed");
  if (rows.length > request.limit) {
    throw new ClipDocumentError(`SQLite 판독기가 ${request.table}에서 한도 ${request.limit}행을 넘겨 ${rows.length}행을 돌려줬다`, "reader-failed");
  }
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== request.columns.length) {
      throw new ClipDocumentError(`${request.table} 조회 행의 열 수가 요청(${request.columns.length})과 다르다`, "reader-failed");
    }
  }
  return rows;
}

const plain = (name: string): ClipSqliteColumn => ({ name });

function missing(required: readonly string[], present: ReadonlySet<string>): string[] {
  return required.filter((name) => !present.has(name));
}

/** 같은 일을 `size`개씩 나눠 한다. */
export function chunkClipIds(ids: readonly number[], size: number): number[][] {
  const batches: number[][] = [];
  for (let at = 0; at < ids.length; at += size) batches.push(ids.slice(at, at + size));
  return batches;
}

// ---------------------------------------------------------------------------
// 캔버스
// ---------------------------------------------------------------------------

const UNITS = new Map<number, ClipCanvasUnit>([
  [0, "px"],
  [1, "cm"],
  [2, "mm"],
  [3, "inch"],
  [5, "pt"],
]);
/** 1인치가 몇 단위인지. */
const UNITS_PER_INCH: Readonly<Record<Exclude<ClipCanvasUnit, "px">, number>> = { cm: 2.54, mm: 25.4, inch: 1, pt: 72 };

/** 가장 가까운 정수로 반올림하되 정확히 .5면 짝수 쪽으로 간다. */
export function roundClipHalfEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export interface ClipCanvasPixelSize {
  readonly unit: ClipCanvasUnit;
  readonly width: number;
  readonly height: number;
  readonly source: ClipCanvasInfo["sizeSource"];
}

/**
 * 캔버스 크기를 픽셀로 환산한다. 단위 코드는 S1의 표(0 px, 1 cm, 2 mm, 3 inch, 5 pt)를 따른다. 픽셀이 아닌 단위는 `값 / (단위/인치) * dpi`를
 * 가장 가까운 정수(정확히 .5면 짝수)로 반올림한다 — S1이 "偶数丸め"라고만 적어 규칙이 모호하므로 가정이다(예: 297 mm, 600 dpi → 7016).
 * 단위를 모르거나 값이 유한하지 않으면 null. 픽셀 단위는 해상도를 쓰지 않으므로 해상도가 없어도(null) 된다.
 */
export function computeClipCanvasPixels(unitCode: number, widthValue: number, heightValue: number, resolution: number | null): ClipCanvasPixelSize | null {
  const unit = UNITS.get(unitCode);
  if (unit === undefined || !Number.isFinite(widthValue) || !Number.isFinite(heightValue)) return null;
  if (unit === "px") return { unit, width: roundClipHalfEven(widthValue), height: roundClipHalfEven(heightValue), source: "pixel-unit" };
  if (resolution === null || !Number.isFinite(resolution) || resolution <= 0) return null;
  const perInch = UNITS_PER_INCH[unit];
  return {
    unit,
    width: roundClipHalfEven((widthValue / perInch) * resolution),
    height: roundClipHalfEven((heightValue / perInch) * resolution),
    source: "unit-conversion",
  };
}

const CANVAS_REQUIRED = ["MainId", "CanvasUnit", "CanvasWidth", "CanvasHeight", "CanvasResolution", "CanvasRootFolder"] as const;
const CANVAS_OPTIONAL = ["CanvasDefaultColorTypeIndex", "CanvasChannelBytes"] as const;

export async function readClipCanvas(ctx: ClipReaderContext): Promise<ClipCanvasInfo> {
  const columns = await tableColumns(ctx, "Canvas");
  if (columns === null) throw new ClipDocumentError("문서 DB에 Canvas 표가 없다", "database-invalid");
  const absent = missing(CANVAS_REQUIRED, columns);
  if (absent.length > 0) throw new ClipDocumentError(`Canvas 표에 필수 열이 없다: ${absent.join(", ")}`, "database-invalid");
  const names: string[] = [...CANVAS_REQUIRED, ...CANVAS_OPTIONAL.filter((name) => columns.has(name))];
  const rows = await selectRows(ctx, { table: "Canvas", columns: names.map(plain), orderBy: "MainId", limit: 2 });
  const row = rows[0];
  if (row === undefined) throw new ClipDocumentError("Canvas 표에 행이 없다", "database-invalid");
  if (rows.length > 1) {
    ctx.warnings.add("metadata", "clip-canvas-multiple", "Canvas 행이 둘 이상이다. MainId가 가장 작은 캔버스만 읽는다");
  }
  const cell = (name: string): ClipSqliteValue | undefined => row[names.indexOf(name)];

  const id = readClipInteger(cell("MainId"));
  const rootFolderId = readClipInteger(cell("CanvasRootFolder"));
  // 단위 셀이 NULL이면 픽셀(0)로 본다. 해상도 셀이 NULL이면 해상도 없음이며 픽셀 단위일 때만 허용된다(그 밖의 단위는 환산할 수 없다).
  const unitCell = cell("CanvasUnit");
  const unitCode = unitCell === null ? 0 : readClipInteger(unitCell);
  const widthValue = readClipNumber(cell("CanvasWidth"));
  const heightValue = readClipNumber(cell("CanvasHeight"));
  const resolutionCell = cell("CanvasResolution");
  const resolution = resolutionCell === null ? null : readClipNumber(resolutionCell);
  if (id === null || id <= 0) throw new ClipDocumentError("Canvas.MainId가 양의 정수가 아니다", "database-invalid");
  if (rootFolderId === null || rootFolderId <= 0) throw new ClipDocumentError("Canvas.CanvasRootFolder가 양의 정수가 아니다", "database-invalid");
  if (unitCode === null) throw new ClipDocumentError("Canvas.CanvasUnit이 정수가 아니다", "database-invalid");
  if (widthValue === null || heightValue === null) throw new ClipDocumentError("Canvas의 폭·높이 값이 올바른 수가 아니다", "database-invalid");
  if (resolutionCell !== null && resolution === null) throw new ClipDocumentError("Canvas.CanvasResolution이 올바른 수가 아니다", "database-invalid");
  const size = computeClipCanvasPixels(unitCode, widthValue, heightValue, resolution);
  if (size === null) {
    throw new ClipDocumentError(`캔버스 크기를 픽셀로 바꿀 수 없다 (단위 코드 ${unitCode}, 해상도 ${resolution ?? "없음"})`, "database-invalid");
  }
  if (size.width < 1 || size.height < 1) throw new ClipDocumentError(`캔버스 크기 ${size.width}x${size.height}가 올바르지 않다`, "database-invalid");
  if (size.width > ctx.limits.maxCanvasDimension || size.height > ctx.limits.maxCanvasDimension) {
    throw new ClipDocumentError(`캔버스 ${size.width}x${size.height}가 한 변 한도 ${ctx.limits.maxCanvasDimension}를 넘는다`, "limit-exceeded");
  }
  return {
    id,
    unit: size.unit,
    unitCode,
    widthValue,
    heightValue,
    resolution,
    width: size.width,
    height: size.height,
    sizeSource: size.source,
    rootFolderId,
    defaultColorType: readClipInteger(cell("CanvasDefaultColorTypeIndex")),
    channelBytes: readClipInteger(cell("CanvasChannelBytes")),
  };
}

// ---------------------------------------------------------------------------
// 레이어
// ---------------------------------------------------------------------------

const LAYER_REQUIRED = ["MainId", "LayerFirstChildIndex", "LayerNextIndex"] as const;

/** 캔버스의 `Layer` 행을 `MainId` 순으로 읽는다. 행(루트 폴더 포함)이 `maxLayers + 1`개를 넘으면 `limit-exceeded`. */
export async function readClipLayerRows(ctx: ClipReaderContext, canvasId: number): Promise<Map<number, ClipLayerRow>> {
  const columns = await tableColumns(ctx, "Layer");
  if (columns === null) throw new ClipDocumentError("문서 DB에 Layer 표가 없다", "database-invalid");
  const absent = missing(LAYER_REQUIRED, columns);
  if (absent.length > 0) throw new ClipDocumentError(`Layer 표에 필수 열이 없다: ${absent.join(", ")}`, "database-invalid");
  const requested = CLIP_LAYER_COLUMNS.filter((column) => columns.has(column.name));
  const maxRows = ctx.limits.maxLayers + 1;
  const rows = await selectRows(ctx, {
    table: "Layer",
    columns: requested,
    ...(columns.has("CanvasId") ? { where: { column: "CanvasId", in: [canvasId] } } : {}),
    orderBy: "MainId",
    limit: maxRows + 1,
  });
  if (rows.length > maxRows) throw new ClipDocumentError(`레이어 행이 ${ctx.limits.maxLayers}개(루트 제외)를 넘는다`, "limit-exceeded");
  const positions = new Map(requested.map((column, index) => [column.name, index] as const));
  const byId = new Map<number, ClipLayerRow>();
  let skipped = 0;
  for (const row of rows) {
    const projected = projectClipLayerRow((name) => {
      const at = positions.get(name);
      return at === undefined ? undefined : row[at];
    }, ctx.limits.maxTextCharacters);
    if (projected === null) {
      skipped += 1;
      continue;
    }
    if (byId.has(projected.id)) {
      ctx.warnings.add("semantic", "clip-layer-duplicate-id", `Layer.MainId ${projected.id}가 두 번 나온다. 처음 행만 쓴다`);
      continue;
    }
    byId.set(projected.id, projected);
  }
  if (skipped > 0) ctx.warnings.add("semantic", "clip-layer-row-invalid", `MainId가 양의 정수가 아닌 Layer 행 ${skipped}개를 건너뛰었다`);
  return byId;
}

/** `VectorObjectList`에 든 레이어 id 집합. 표가 없으면 빈 집합(벡터 레이어를 이 표로 가려내지 못한다). */
export async function readClipVectorLayerIds(ctx: ClipReaderContext): Promise<Set<number>> {
  try {
    const columns = await tableColumns(ctx, "VectorObjectList");
    if (columns === null || !columns.has("LayerId")) return new Set();
    const limit = ctx.limits.maxLayers + 1;
    const rows = await selectRows(ctx, { table: "VectorObjectList", columns: [plain("LayerId")], distinct: true, orderBy: "LayerId", limit });
    if (rows.length >= limit) {
      ctx.warnings.add("semantic", "clip-vector-list-truncated", "벡터 레이어 목록이 한도를 넘어 일부 벡터 레이어를 래스터로 판정할 수 있다");
    }
    const ids = new Set<number>();
    for (const row of rows) {
      const id = readClipInteger(row[0]);
      if (id !== null && id > 0) ids.add(id);
    }
    return ids;
  } catch (error) {
    // 벡터 목록은 종류 판정을 돕는 보조 표다. 읽지 못해도 문서 가져오기를 멈추지 않고 벡터 레이어를 가려내지 못했다고만 알린다.
    if (error instanceof ClipDocumentError && error.code === "reader-failed") {
      ctx.warnings.add("semantic", "clip-vector-list-unreadable", `VectorObjectList를 읽지 못해 벡터 레이어를 가려내지 못했다: ${clipDiagnosticText(error.message, 200)}`);
      return new Set();
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 래스터 연결
// ---------------------------------------------------------------------------

export type ClipChainFailure = "tables-missing" | "mipmap-missing" | "mipmap-info-missing" | "offscreen-link-missing";

export interface ClipOffscreenRef {
  readonly offscreenId: number;
  /** `MipmapInfo.ThisScale`(100 = 원본 크기). 열이 없으면 null. */
  readonly scale: number | null;
}

/**
 * `Layer.LayerRenderMipmap`(또는 마스크 쪽) id마다 첫 단계 `MipmapInfo`가 가리키는 오프스크린을 찾는다: `Mipmap.MainId →
 * Mipmap.BaseMipmapInfo → MipmapInfo.MainId → MipmapInfo.Offscreen`. 제3자 명세는 첫 단계가 원본 크기(`ThisScale` 100)라고 적었다.
 * 연결이 끊어진 id는 이유 코드를 값으로 돌려준다.
 */
export async function resolveClipMipmapChains(ctx: ClipReaderContext, mipmapIds: readonly number[]): Promise<Map<number, ClipOffscreenRef | ClipChainFailure>> {
  const result = new Map<number, ClipOffscreenRef | ClipChainFailure>();
  const unique = [...new Set(mipmapIds)].sort((left, right) => left - right);
  if (unique.length === 0) return result;
  const mipmapColumns = await tableColumns(ctx, "Mipmap");
  const infoColumns = await tableColumns(ctx, "MipmapInfo");
  if (
    mipmapColumns === null ||
    infoColumns === null ||
    missing(["MainId", "BaseMipmapInfo"], mipmapColumns).length > 0 ||
    missing(["MainId", "Offscreen"], infoColumns).length > 0
  ) {
    ctx.warnings.add("metadata", "clip-raster-tables-missing", "Mipmap·MipmapInfo 표(또는 필요한 열)가 없어 레이어 픽셀을 찾을 수 없다");
    for (const id of unique) result.set(id, "tables-missing");
    return result;
  }

  const baseInfoByMipmap = new Map<number, number>();
  for (const batch of chunkClipIds(unique, CLIP_SQLITE_MAX_IN_VALUES)) {
    const rows = await selectRows(ctx, {
      table: "Mipmap",
      columns: [plain("MainId"), plain("BaseMipmapInfo")],
      where: { column: "MainId", in: batch },
      orderBy: "MainId",
      limit: batch.length,
    });
    for (const row of rows) {
      const id = readClipInteger(row[0]);
      const base = readClipInteger(row[1]);
      if (id !== null && base !== null && base > 0 && !baseInfoByMipmap.has(id)) baseInfoByMipmap.set(id, base);
    }
  }

  const infoIds = [...new Set(baseInfoByMipmap.values())].sort((left, right) => left - right);
  const hasScale = infoColumns.has("ThisScale");
  const infoById = new Map<number, ClipOffscreenRef | null>();
  for (const batch of chunkClipIds(infoIds, CLIP_SQLITE_MAX_IN_VALUES)) {
    const rows = await selectRows(ctx, {
      table: "MipmapInfo",
      columns: [plain("MainId"), plain("Offscreen"), ...(hasScale ? [plain("ThisScale")] : [])],
      where: { column: "MainId", in: batch },
      orderBy: "MainId",
      limit: batch.length,
    });
    for (const row of rows) {
      const id = readClipInteger(row[0]);
      if (id === null || infoById.has(id)) continue;
      const offscreenId = readClipInteger(row[1]);
      infoById.set(id, offscreenId !== null && offscreenId > 0 ? { offscreenId, scale: hasScale ? readClipNumber(row[2]) : null } : null);
    }
  }

  for (const id of unique) {
    const baseInfo = baseInfoByMipmap.get(id);
    if (baseInfo === undefined) {
      result.set(id, "mipmap-missing");
      continue;
    }
    const info = infoById.get(baseInfo);
    result.set(id, info === undefined ? "mipmap-info-missing" : info === null ? "offscreen-link-missing" : info);
  }
  return result;
}

/** `Offscreen.Attribute`에서 받아들이는 최대 바이트. 정상 값은 수백 바이트에 블록 수 x 4바이트를 더한 정도이며(블록 16,384개여도 약 64 KiB) 이를 넘으면 읽지 않는다. */
export const CLIP_ATTRIBUTE_MAX_BYTES = 1_048_576;
/** `Offscreen.BlockData`(외부 ID)에서 읽는 최대 길이. 정상 ID는 40자이고 이보다 긴 값은 어떤 외부 블록과도 맞지 않는다. */
export const CLIP_EXTERNAL_ID_READ_LIMIT = 4096;

export interface ClipOffscreenRow {
  /** `Offscreen.Attribute` BLOB. 없거나 BLOB가 아니거나 `CLIP_ATTRIBUTE_MAX_BYTES`를 넘으면 null. */
  readonly attribute: Uint8Array | null;
  /** `Attribute`가 `CLIP_ATTRIBUTE_MAX_BYTES`를 넘어 읽지 않았으면 true. */
  readonly attributeOversized: boolean;
  /** `Offscreen.BlockData`가 담은 외부 ID(`CLIP_EXTERNAL_ID_READ_LIMIT`자까지). 없으면 null. */
  readonly externalId: string | null;
}


/** 오프스크린 id 목록(`CLIP_SQLITE_MAX_IN_VALUES` 이하)의 행을 읽는다. */
export type ClipOffscreenRowReader = (ids: readonly number[]) => Promise<Map<number, ClipOffscreenRow>>;

/** `Offscreen` 표의 열을 한 번만 확인하고 여러 번 부르는 판독기를 만든다. 표가 없으면 경고를 남기고 null을 돌려준다. */
export async function createClipOffscreenReader(ctx: ClipReaderContext): Promise<ClipOffscreenRowReader | null> {
  const columns = await tableColumns(ctx, "Offscreen");
  if (columns === null || missing(["MainId", "Attribute", "BlockData"], columns).length > 0) {
    ctx.warnings.add("metadata", "clip-raster-tables-missing", "Offscreen 표(또는 Attribute·BlockData 열)가 없어 레이어 픽셀을 찾을 수 없다");
    return null;
  }
  return async (ids) => {
    const rows = await selectRows(ctx, {
      table: "Offscreen",
      columns: [plain("MainId"), { name: "Attribute", limit: CLIP_ATTRIBUTE_MAX_BYTES + 1 }, { name: "BlockData", limit: CLIP_EXTERNAL_ID_READ_LIMIT }],
      where: { column: "MainId", in: ids },
      orderBy: "MainId",
      limit: ids.length,
    });
    const byId = new Map<number, ClipOffscreenRow>();
    for (const row of rows) {
      const id = readClipInteger(row[0]);
      if (id === null || byId.has(id)) continue;
      const attribute = row[1];
      const blockData = row[2];
      let externalId: string | null = null;
      if (typeof blockData === "string") externalId = blockData;
      else if (blockData instanceof Uint8Array) externalId = LATIN1.decode(blockData);
      if (externalId !== null) externalId = stripTrailingNuls(externalId);
      const oversized = attribute instanceof Uint8Array && attribute.byteLength > CLIP_ATTRIBUTE_MAX_BYTES;
      byId.set(id, {
        attribute: attribute instanceof Uint8Array && !oversized ? attribute : null,
        attributeOversized: oversized,
        externalId: externalId === null || externalId.length === 0 ? null : externalId,
      });
    }
    return byId;
  };
}

// ---------------------------------------------------------------------------
// 미리보기
// ---------------------------------------------------------------------------

/** `CanvasPreview.ImageData`의 PNG를 복사해 돌려준다. 표·행이 없거나 PNG가 아니거나 한도를 넘으면 null(필요하면 경고를 남긴다). */
export async function readClipPreviewPng(ctx: ClipReaderContext, canvasId: number): Promise<Uint8Array | null> {
  try {
    return await readPreview(ctx, canvasId);
  } catch (error) {
    // 미리보기는 부가 정보다. 읽지 못해도 레이어를 이미 읽은 문서 전체를 버리지 않고 경고만 남긴다.
    if (error instanceof ClipDocumentError && error.code === "reader-failed") {
      ctx.warnings.add("resource", "clip-preview-unreadable", `미리보기를 읽지 못했다: ${clipDiagnosticText(error.message, 200)}`);
      return null;
    }
    throw error;
  }
}

async function readPreview(ctx: ClipReaderContext, canvasId: number): Promise<Uint8Array | null> {
  const columns = await tableColumns(ctx, "CanvasPreview");
  if (columns === null || !columns.has("ImageData")) return null;
  const where = columns.has("CanvasId") ? { where: { column: "CanvasId", in: [canvasId] } } : {};
  const order = columns.has("MainId") ? { orderBy: "MainId" } : {};
  const sizes = await selectRows(ctx, {
    table: "CanvasPreview",
    columns: [{ name: "ImageData", mode: "length" }],
    ...where,
    ...order,
    limit: 1,
  });
  const size = readClipInteger(sizes[0]?.[0]);
  if (size === null || size <= 0) return null;
  if (size > ctx.limits.maxPreviewBytes) {
    ctx.warnings.add("resource", "clip-preview-too-large", `미리보기 PNG ${size}바이트가 한도 ${ctx.limits.maxPreviewBytes}를 넘어 읽지 않았다`);
    return null;
  }
  const rows = await selectRows(ctx, {
    table: "CanvasPreview",
    columns: [plain("ImageData")],
    ...where,
    ...order,
    limit: 1,
  });
  const data = rows[0]?.[0];
  if (!(data instanceof Uint8Array) || data.byteLength !== size) {
    ctx.warnings.add("resource", "clip-preview-unreadable", "미리보기 ImageData가 BLOB가 아니거나 길이가 앞서 물은 값과 다르다");
    return null;
  }
  if (!PNG_SIGNATURE.every((byte, index) => data[index] === byte)) {
    ctx.warnings.add("resource", "clip-preview-not-png", "미리보기 ImageData가 PNG 서명으로 시작하지 않아 읽지 않았다");
    return null;
  }
  return new Uint8Array(data);
}
