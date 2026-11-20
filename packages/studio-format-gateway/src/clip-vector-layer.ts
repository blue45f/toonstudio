/**
 * `.clip` 문서 벡터·스크린톤 레이어 복원 파서 & `.sut` 커스텀 PNG 브러시 팁/종이 텍스처 추출기.
 *
 * 공개 명세(S1 nanikasheila/CLIP_STUDIO_PAINT_Format, S2 wamsoft/clipparse)와 기존
 * `chunked-sqlite-document-types.ts` · `csp-sut.ts` 판독기 계약 위에 구축된 순수 방어적 파서다.
 * 신뢰할 수 없는 외부 바이너리에 대해 엄격한 바이트·픽셀·스트로크 상한을 강제하고,
 * 미인식 레코드는 조용히 버리지 않고 진단 경고로 남긴다.
 */
import {
  CLIP_SQLITE_MAX_IN_VALUES,
  type ClipSqliteDatabase,
  type ClipSqliteValue,
} from "./chunked-sqlite-document-types";
import { type CspSqliteSnapshot } from "./csp-sut";
import { bytesToBase64, fnv1a64Hex, type FormatIssue } from "./format-common";

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND_BYTES = Uint8Array.from([0x49, 0x45, 0x4e, 0x44]); // "IEND"
const VECTOR_MAGIC_V4 = Uint8Array.from([0x54, 0x53, 0x56, 0x34]); // "TSV4"

export const CLIP_VECTOR_RESTORE_LIMITS = Object.freeze({
  maxStrokesPerLayer: 16_384,
  maxPointsPerStroke: 8_192,
  maxBlobBytes: 16 * 1024 * 1024,
  maxExtractedMaterials: 256,
  maxMaterialPngPixels: 16_777_216,
  maxMaterialPngBytes: 16 * 1024 * 1024,
});

export interface ClipVectorRestoreLimits {
  readonly maxStrokesPerLayer: number;
  readonly maxPointsPerStroke: number;
  readonly maxBlobBytes: number;
  readonly maxExtractedMaterials: number;
  readonly maxMaterialPngPixels: number;
  readonly maxMaterialPngBytes: number;
}

/* -------------------------------------------------------------------------- */
/* 1. `.clip` 벡터 레이어 스트로크 · 제어점 복원                              */
/* -------------------------------------------------------------------------- */

export interface ClipVectorPoint {
  readonly x: number;
  readonly y: number;
  /** 필압 [0, 1]. */
  readonly pressure: number;
  /** 제어점 선폭 배율 또는 픽셀 반폭 (> 0). */
  readonly width: number;
  /** 제어점 농도 [0, 1]. */
  readonly density: number;
}

export interface ClipVectorStroke {
  readonly strokeId: string;
  readonly brushWidth: number;
  readonly colorRgba: readonly [number, number, number, number];
  readonly closed: boolean;
  readonly isSpline: boolean;
  readonly points: readonly ClipVectorPoint[];
}

export interface ClipRestoredVectorLayer {
  readonly layerId: number;
  readonly layerName: string;
  readonly strokes: readonly ClipVectorStroke[];
  readonly totalPoints: number;
  readonly warnings: readonly FormatIssue[];
}

export interface ClipVectorBlobParseResult {
  readonly strokes: readonly ClipVectorStroke[];
  readonly warnings: readonly FormatIssue[];
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function bytesEqualAt(haystack: Uint8Array, needle: Uint8Array, offset: number): boolean {
  if (offset < 0 || offset + needle.byteLength > haystack.byteLength) return false;
  for (let i = 0; i < needle.byteLength; i += 1) {
    if (haystack[offset + i] !== needle[i]) return false;
  }
  return true;
}

/**
 * `.clip` `VectorNormal` / `VectorObjectList` 호환 바이너리 스트로크 레코드를 복원한다.
 *
 * 지원 포맷:
 * - 구조화 헤더 `"TSV4"`(little-endian): `[4B magic][2B flags][2B strokeCount]` +
 *   각 스트로크 `[4B pointCount][4B brushWidth f32][4B rgba u8*4][1B flags (bit0=closed, bit1=spline)]`
 *   + 각 제어점 `[4B x16 i32 (1/16 서브픽셀)][4B y16 i32][2B pressure u16][2B widthScale u16][2B density u16]`
 * - 레거시 big-endian 스트로크 덩어리(S1 관찰 기반): `[4B strokeCount BE]` +
 *   각 스트로크 `[4B pointCount BE][8B brushWidth f64 BE][4B rgba]` + 각 제어점 `[8B x f64 BE][8B y f64 BE][8B pressure f64 BE]`
 */
export function parseClipVectorStrokeBlob(
  bytes: Uint8Array,
  limits: Partial<ClipVectorRestoreLimits> = {},
): ClipVectorBlobParseResult {
  const maxBlobBytes = limits.maxBlobBytes ?? CLIP_VECTOR_RESTORE_LIMITS.maxBlobBytes;
  const maxStrokes = limits.maxStrokesPerLayer ?? CLIP_VECTOR_RESTORE_LIMITS.maxStrokesPerLayer;
  const maxPoints = limits.maxPointsPerStroke ?? CLIP_VECTOR_RESTORE_LIMITS.maxPointsPerStroke;
  const warnings: FormatIssue[] = [];

  if (bytes.byteLength === 0) return { strokes: [], warnings };
  if (bytes.byteLength > maxBlobBytes) {
    warnings.push({
      scope: "container",
      code: "clip-vector-blob-too-large",
      message: `벡터 BLOB 크기(${bytes.byteLength}B)가 한도(${maxBlobBytes}B)를 초과했습니다.`,
    });
    return { strokes: [], warnings };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const strokes: ClipVectorStroke[] = [];

  if (bytes.byteLength >= 8 && bytesEqualAt(bytes, VECTOR_MAGIC_V4, 0)) {
    const strokeCount = view.getUint16(6, true);
    let offset = 8;
    const cappedStrokes = Math.min(strokeCount, maxStrokes);
    if (strokeCount > maxStrokes) {
      warnings.push({
        scope: "semantic",
        code: "clip-vector-stroke-limit",
        message: `스트로크 수(${strokeCount})가 상한(${maxStrokes})을 넘어 일부가 절단되었습니다.`,
      });
    }
    for (let s = 0; s < cappedStrokes; s += 1) {
      if (offset + 13 > bytes.byteLength) {
        warnings.push({
          scope: "container",
          code: "clip-vector-truncated-stroke",
          message: `스트로크 #${s} 헤더가 끝까지 기록되지 않았습니다.`,
        });
        break;
      }
      const pointCount = view.getUint32(offset, true);
      const brushWidth = Math.max(0.1, view.getFloat32(offset + 4, true));
      const colorRgba: readonly [number, number, number, number] = [
        bytes[offset + 8] ?? 0,
        bytes[offset + 9] ?? 0,
        bytes[offset + 10] ?? 0,
        bytes[offset + 11] ?? 255,
      ];
      const flags = bytes[offset + 12] ?? 0;
      offset += 13;

      const cappedPoints = Math.min(pointCount, maxPoints);
      if (pointCount > maxPoints) {
        warnings.push({
          scope: "semantic",
          code: "clip-vector-point-limit",
          message: `스트로크 #${s}의 제어점(${pointCount})이 상한(${maxPoints})을 초과했습니다.`,
        });
      }
      const points: ClipVectorPoint[] = [];
      const pointByteLen = 14;
      for (let p = 0; p < cappedPoints; p += 1) {
        if (offset + pointByteLen > bytes.byteLength) {
          warnings.push({
            scope: "container",
            code: "clip-vector-truncated-points",
            message: `스트로크 #${s}의 제어점 데이터가 조기 종료되었습니다.`,
          });
          break;
        }
        const x = view.getInt32(offset, true) / 16;
        const y = view.getInt32(offset + 4, true) / 16;
        const pressure = clamp(view.getUint16(offset + 8, true) / 65535, 0, 1);
        const widthScale = Math.max(0.05, view.getUint16(offset + 10, true) / 1024);
        const density = clamp(view.getUint16(offset + 12, true) / 65535, 0, 1);
        offset += pointByteLen;
        points.push({ x, y, pressure, width: brushWidth * widthScale, density });
      }
      if (pointCount > cappedPoints) {
        offset += (pointCount - cappedPoints) * pointByteLen;
      }
      if (points.length > 0) {
        strokes.push({
          strokeId: `vec-${s}-${fnv1a64Hex(bytes.subarray(0, Math.min(32, bytes.byteLength))).slice(0, 8)}`,
          brushWidth,
          colorRgba,
          closed: (flags & 1) !== 0,
          isSpline: (flags & 2) !== 0,
          points,
        });
      }
    }
    return { strokes, warnings };
  }

  // 레거시 Big-Endian 레코드(최소 4B strokeCount + 16B strokeHeader + 24B point = 44B)
  if (bytes.byteLength >= 44) {
    const strokeCount = view.getUint32(0, false);
    if (strokeCount > 0 && strokeCount <= maxStrokes) {
      let offset = 4;
      for (let s = 0; s < strokeCount; s += 1) {
        if (offset + 16 > bytes.byteLength) break;
        const pointCount = view.getUint32(offset, false);
        const brushWidth = view.getFloat64(offset + 4, false);
        const colorRgba: readonly [number, number, number, number] = [
          bytes[offset + 12] ?? 0,
          bytes[offset + 13] ?? 0,
          bytes[offset + 14] ?? 0,
          bytes[offset + 15] ?? 255,
        ];
        offset += 16;
        if (
          !Number.isFinite(brushWidth)
          || brushWidth <= 0
          || brushWidth > 5000
          || pointCount === 0
          || pointCount > maxPoints
          || offset + pointCount * 24 > bytes.byteLength
        ) {
          warnings.push({
            scope: "semantic",
            code: "clip-vector-unrecognized-layout",
            message: `레거시 벡터 스트로크 #${s} 구조를 해석할 수 없습니다.`,
          });
          return { strokes, warnings };
        }
        const points: ClipVectorPoint[] = [];
        for (let p = 0; p < pointCount; p += 1) {
          const x = view.getFloat64(offset, false);
          const y = view.getFloat64(offset + 8, false);
          const pressure = clamp(view.getFloat64(offset + 16, false), 0, 1);
          offset += 24;
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          points.push({ x, y, pressure, width: brushWidth * (0.25 + 0.75 * pressure), density: 1 });
        }
        if (points.length > 0) {
          strokes.push({
            strokeId: `vec-be-${s}`,
            brushWidth,
            colorRgba,
            closed: false,
            isSpline: true,
            points,
          });
        }
      }
      return { strokes, warnings };
    }
  }

  warnings.push({
    scope: "container",
    code: "clip-vector-unknown-blob",
    message: "인식할 수 있는 벡터 스트로크 헤더가 없어 원본을 보존 상태로 남깁니다.",
  });
  return { strokes: [], warnings };
}

/** 테스트·교환 직렬화용 TSV4 바이너리 벡터 스트로크 인코더. */
export function encodeClipVectorStrokeBlob(strokes: readonly ClipVectorStroke[]): Uint8Array {
  let totalBytes = 8;
  for (const stroke of strokes) {
    totalBytes += 13 + stroke.points.length * 14;
  }
  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);
  out.set(VECTOR_MAGIC_V4, 0);
  view.setUint16(4, 0, true);
  view.setUint16(6, strokes.length, true);
  let offset = 8;
  for (const stroke of strokes) {
    view.setUint32(offset, stroke.points.length, true);
    view.setFloat32(offset + 4, stroke.brushWidth, true);
    out[offset + 8] = stroke.colorRgba[0];
    out[offset + 9] = stroke.colorRgba[1];
    out[offset + 10] = stroke.colorRgba[2];
    out[offset + 11] = stroke.colorRgba[3];
    out[offset + 12] = (stroke.closed ? 1 : 0) | (stroke.isSpline ? 2 : 0);
    offset += 13;
    const baseW = Math.max(0.1, stroke.brushWidth);
    for (const pt of stroke.points) {
      view.setInt32(offset, Math.round(pt.x * 16), true);
      view.setInt32(offset + 4, Math.round(pt.y * 16), true);
      view.setUint16(offset + 8, Math.round(clamp(pt.pressure, 0, 1) * 65535), true);
      view.setUint16(offset + 10, Math.round(clamp(pt.width / baseW, 0.05, 63) * 1024), true);
      view.setUint16(offset + 12, Math.round(clamp(pt.density, 0, 1) * 65535), true);
      offset += 14;
    }
  }
  return out;
}

function asInteger(value: ClipSqliteValue | undefined): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "bigint") {
    const num = Number(value);
    return Number.isSafeInteger(num) ? num : null;
  }
  return null;
}

function asNumber(value: ClipSqliteValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return null;
}

/** SQLite 문서 DB에서 벡터 레이어 스트로크를 복원한다. */
export async function restoreClipVectorLayersFromSqlite(
  db: ClipSqliteDatabase,
  layerIds: readonly number[],
  limits: Partial<ClipVectorRestoreLimits> = {},
): Promise<readonly ClipRestoredVectorLayer[]> {
  if (layerIds.length === 0) return [];
  const rawVectorCols = await db.tableColumns("VectorNormal");
  const vectorCols = rawVectorCols ? new Set(rawVectorCols) : null;
  if (!vectorCols || !vectorCols.has("LayerId") || !vectorCols.has("VectorData")) {
    return layerIds.map((layerId) => ({
      layerId,
      layerName: `벡터 레이어 ${layerId}`,
      strokes: [],
      totalPoints: 0,
      warnings: [
        {
          scope: "semantic",
          code: "clip-vector-table-missing",
          message: "VectorNormal 표 또는 VectorData 열이 없어 벡터 스트로크를 복원하지 못했습니다.",
        },
      ],
    }));
  }

  const rawLayerCols = await db.tableColumns("Layer");
  const layerCols = rawLayerCols ? new Set(rawLayerCols) : null;
  const nameById = new Map<number, string>();
  if (layerCols && layerCols.has("MainId") && layerCols.has("LayerName")) {
    for (let i = 0; i < layerIds.length; i += CLIP_SQLITE_MAX_IN_VALUES) {
      const batch = layerIds.slice(i, i + CLIP_SQLITE_MAX_IN_VALUES);
      const rows = await db.select({
        table: "Layer",
        columns: [{ name: "MainId" }, { name: "LayerName" }],
        where: { column: "MainId", in: batch },
        limit: batch.length,
      });
      for (const row of rows) {
        const id = asInteger(row[0]);
        if (id !== null && typeof row[1] === "string") nameById.set(id, row[1]);
      }
    }
  }

  const blobsByLayer = new Map<number, Uint8Array[]>();
  const maxBlobBytes = limits.maxBlobBytes ?? CLIP_VECTOR_RESTORE_LIMITS.maxBlobBytes;
  for (let i = 0; i < layerIds.length; i += CLIP_SQLITE_MAX_IN_VALUES) {
    const batch = layerIds.slice(i, i + CLIP_SQLITE_MAX_IN_VALUES);
    const rows = await db.select({
      table: "VectorNormal",
      columns: [{ name: "LayerId" }, { name: "VectorData", limit: maxBlobBytes + 1 }],
      where: { column: "LayerId", in: batch },
      limit: Math.min(batch.length * 16, 2048),
    });
    for (const row of rows) {
      const id = asInteger(row[0]);
      const data = row[1];
      if (id !== null && data instanceof Uint8Array) {
        const list = blobsByLayer.get(id) ?? [];
        list.push(data);
        blobsByLayer.set(id, list);
      }
    }
  }

  return layerIds.map((layerId) => {
    const blobs = blobsByLayer.get(layerId) ?? [];
    const strokes: ClipVectorStroke[] = [];
    const warnings: FormatIssue[] = [];
    for (const blob of blobs) {
      const parsed = parseClipVectorStrokeBlob(blob, limits);
      strokes.push(...parsed.strokes);
      warnings.push(...parsed.warnings);
    }
    const totalPoints = strokes.reduce((sum, s) => sum + s.points.length, 0);
    return {
      layerId,
      layerName: nameById.get(layerId) ?? `벡터 레이어 ${layerId}`,
      strokes,
      totalPoints,
      warnings,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 2. `.clip` 스크린톤(하프톤) 레이어 속성 복원                               */
/* -------------------------------------------------------------------------- */

export type ClipScreentonePattern = "circle" | "line" | "diamond" | "cross" | "star" | "noise";

export interface ClipScreentoneLayerSpec {
  readonly layerId: number;
  readonly layerName: string;
  readonly enabled: boolean;
  /** 망점 선수 (LPI, 5..120). */
  readonly frequencyLpi: number;
  /** 망점 각도 (도, 0..360). */
  readonly angleDeg: number;
  /** 농도 비율 (0..100%). */
  readonly densityPercent: number;
  readonly pattern: ClipScreentonePattern;
  readonly dotOffsetX: number;
  readonly dotOffsetY: number;
  readonly invert: boolean;
}

const TONE_SHAPE_MAP: Readonly<Record<number, ClipScreentonePattern>> = Object.freeze({
  0: "circle",
  1: "line",
  2: "diamond",
  3: "cross",
  4: "star",
  5: "noise",
});

/** SQLite `Layer` 표의 스크린톤(톤화) 메타데이터를 복원한다. */
export async function restoreClipScreentoneLayersFromSqlite(
  db: ClipSqliteDatabase,
  layerIds: readonly number[],
): Promise<{
  readonly tones: readonly ClipScreentoneLayerSpec[];
  readonly warnings: readonly FormatIssue[];
}> {
  const warnings: FormatIssue[] = [];
  if (layerIds.length === 0) return { tones: [], warnings };
  const rawCols = await db.tableColumns("Layer");
  const cols = rawCols ? new Set(rawCols) : null;
  if (!cols || !cols.has("MainId")) {
    warnings.push({
      scope: "metadata",
      code: "clip-tone-layer-table-missing",
      message: "Layer 표가 없어 스크린톤 설정을 복원할 수 없습니다.",
    });
    return { tones: [], warnings };
  }

  const wantedCols = [
    "MainId",
    "LayerName",
    "LayerUseEffect",
    "LayerEffectType",
    "LayerToneLines",
    "LayerToneAngle",
    "LayerToneDensity",
    "LayerToneShape",
    "LayerToneOffsetX",
    "LayerToneOffsetY",
    "LayerToneInvert",
  ].filter((name) => cols.has(name));

  const tones: ClipScreentoneLayerSpec[] = [];
  for (let i = 0; i < layerIds.length; i += CLIP_SQLITE_MAX_IN_VALUES) {
    const batch = layerIds.slice(i, i + CLIP_SQLITE_MAX_IN_VALUES);
    const rows = await db.select({
      table: "Layer",
      columns: wantedCols.map((name) => ({ name })),
      where: { column: "MainId", in: batch },
      limit: batch.length,
    });
    for (const row of rows) {
      const get = (name: string): ClipSqliteValue | undefined => {
        const idx = wantedCols.indexOf(name);
        return idx >= 0 ? row[idx] : undefined;
      };
      const layerId = asInteger(get("MainId"));
      if (layerId === null) continue;
      const useEffect = asInteger(get("LayerUseEffect")) ?? 0;
      const effectType = asInteger(get("LayerEffectType")) ?? 0;
      const toneLines = asNumber(get("LayerToneLines"));
      // S1/S2: LayerUseEffect 비트가 켜져 있거나 명시적 LayerToneLines > 0이면 톤 레이어로 판정
      const enabled = (useEffect !== 0 && (effectType === 0 || (effectType & 2) !== 0)) || (toneLines !== null && toneLines > 0);
      if (!enabled) continue;
      const shapeCode = asInteger(get("LayerToneShape")) ?? 0;
      const pattern = TONE_SHAPE_MAP[shapeCode] ?? "circle";
      const angleRaw = asNumber(get("LayerToneAngle")) ?? 45;
      const angleDeg = ((angleRaw % 360) + 360) % 360;
      tones.push({
        layerId,
        layerName: typeof get("LayerName") === "string" ? (get("LayerName") as string) : `톤 레이어 ${layerId}`,
        enabled: true,
        frequencyLpi: clamp(toneLines ?? 60, 5, 120),
        angleDeg,
        densityPercent: clamp(asNumber(get("LayerToneDensity")) ?? 50, 0, 100),
        pattern,
        dotOffsetX: asNumber(get("LayerToneOffsetX")) ?? 0,
        dotOffsetY: asNumber(get("LayerToneOffsetY")) ?? 0,
        invert: (asInteger(get("LayerToneInvert")) ?? 0) !== 0,
      });
    }
  }
  return { tones, warnings };
}

/* -------------------------------------------------------------------------- */
/* 3. `.sut` 커스텀 PNG 브러시 팁 & 종이 텍스처 추출기                         */
/* -------------------------------------------------------------------------- */

export type SutExtractedMaterialKind = "brush-tip" | "paper-texture" | "dual-brush-tip" | "unknown";

export interface SutExtractedMaterialAsset {
  readonly id: string;
  readonly kind: SutExtractedMaterialKind;
  readonly materialName: string;
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly byteLength: number;
  readonly contentHash: string;
  readonly base64: string;
  readonly sourceTable: string;
  readonly sourceColumn: string;
  readonly sourceRow: number;
}

export interface SutMaterialExtractionResult {
  readonly tips: readonly SutExtractedMaterialAsset[];
  readonly paperTextures: readonly SutExtractedMaterialAsset[];
  readonly dualTips: readonly SutExtractedMaterialAsset[];
  readonly allMaterials: readonly SutExtractedMaterialAsset[];
  readonly warnings: readonly FormatIssue[];
}

interface ParsedPngChunkSlice {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly slice: Uint8Array;
}

/** 바이트 버퍼 내부에 내장된 모든 유효 PNG 스트림(IHDR..IEND)을 안전하게 절출한다. */
export function scanEmbeddedPngStreams(
  buffer: Uint8Array,
  limits: { readonly maxPixels: number; readonly maxBytes: number },
): { readonly pngs: readonly ParsedPngChunkSlice[]; readonly warnings: readonly FormatIssue[] } {
  const pngs: ParsedPngChunkSlice[] = [];
  const warnings: FormatIssue[] = [];
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let pos = 0;

  while (pos + 33 <= buffer.byteLength) {
    if (!bytesEqualAt(buffer, PNG_SIGNATURE, pos)) {
      pos += 1;
      continue;
    }
    // PNG IHDR은 시그니처 직후 오프셋 +8 (length 4B + "IHDR" 4B + data 13B + crc 4B)
    const ihdrLen = view.getUint32(pos + 8, false);
    const isIhdr =
      ihdrLen === 13
      && buffer[pos + 12] === 0x49
      && buffer[pos + 13] === 0x48
      && buffer[pos + 14] === 0x44
      && buffer[pos + 15] === 0x52;
    if (!isIhdr) {
      pos += 8;
      continue;
    }
    const width = view.getUint32(pos + 16, false);
    const height = view.getUint32(pos + 20, false);
    const bitDepth = buffer[pos + 24] ?? 0;
    const colorType = buffer[pos + 25] ?? 0;

    if (width === 0 || height === 0 || width * height > limits.maxPixels) {
      warnings.push({
        scope: "resource",
        code: "sut-png-dimensions-exceeded",
        message: `내장 PNG 해상도(${width}×${height})가 허용 한도를 벗어났습니다.`,
      });
      pos += 8;
      continue;
    }

    // 청크 순회로 정확한 IEND 끝 오프셋 찾기
    let cursor = pos + 8;
    let endOffset = -1;
    while (cursor + 12 <= buffer.byteLength && cursor - pos <= limits.maxBytes) {
      const chunkLen = view.getUint32(cursor, false);
      const nextCursor = cursor + 12 + chunkLen;
      if (nextCursor > buffer.byteLength || nextCursor - pos > limits.maxBytes) break;
      if (bytesEqualAt(buffer, PNG_IEND_BYTES, cursor + 4)) {
        endOffset = nextCursor;
        break;
      }
      cursor = nextCursor;
    }

    if (endOffset < 0) {
      warnings.push({
        scope: "resource",
        code: "sut-png-missing-iend",
        message: `오프셋 ${pos}의 내장 PNG에서 IEND 청크를 찾지 못했습니다.`,
      });
      pos += 8;
      continue;
    }

    pngs.push({
      width,
      height,
      bitDepth,
      colorType,
      slice: buffer.subarray(pos, endOffset),
    });
    pos = endOffset;
  }

  return { pngs, warnings };
}

function classifySutMaterialKind(
  tableName: string,
  columnName: string,
  rowTextHints: string,
): SutExtractedMaterialKind {
  const combined = `${tableName} ${columnName} ${rowTextHints}`.toLowerCase();
  if (/dual|secondary|sub.?tip/u.test(combined)) return "dual-brush-tip";
  if (/texture|paper|grain|canvas|종이|질감/u.test(combined)) return "paper-texture";
  if (/pattern|tip|brush|material|stamp|팁|펜촉/u.test(combined)) return "brush-tip";
  return "unknown";
}

/**
 * `.sut` SQLite 스냅샷에서 커스텀 PNG 브러시 팁 · 듀얼 팁 · 종이 텍스처를
 * 콘텐츠 해시 중복 제거와 해상도·바이트 한도 검증을 거쳐 일괄 추출한다.
 */
export function extractSutCustomTipsAndPaperTextures(
  snapshot: CspSqliteSnapshot,
  limits: Partial<ClipVectorRestoreLimits> = {},
): SutMaterialExtractionResult {
  const maxMaterials = limits.maxExtractedMaterials ?? CLIP_VECTOR_RESTORE_LIMITS.maxExtractedMaterials;
  const maxPixels = limits.maxMaterialPngPixels ?? CLIP_VECTOR_RESTORE_LIMITS.maxMaterialPngPixels;
  const maxBytes = limits.maxMaterialPngBytes ?? CLIP_VECTOR_RESTORE_LIMITS.maxMaterialPngBytes;

  const allMaterials: SutExtractedMaterialAsset[] = [];
  const warnings: FormatIssue[] = [];
  const seenHashes = new Set<string>();

  for (const table of snapshot.tables) {
    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
      const row = table.rows[rowIndex]!;
      const textHints = Object.entries(row)
        .filter(([, val]) => typeof val === "string")
        .map(([col, val]) => `${col}:${String(val)}`)
        .join(" ");
      const candidateName =
        (typeof row["OriginalPath"] === "string" && row["OriginalPath"])
        || (typeof row["NodeName"] === "string" && row["NodeName"])
        || (typeof row["Name"] === "string" && row["Name"])
        || `${table.name}-${rowIndex}`;

      for (const [column, value] of Object.entries(row)) {
        if (!(value instanceof Uint8Array) || value.byteLength < 33) continue;
        const scanned = scanEmbeddedPngStreams(value, { maxPixels, maxBytes });
        warnings.push(...scanned.warnings);

        for (let idx = 0; idx < scanned.pngs.length; idx += 1) {
          if (allMaterials.length >= maxMaterials) {
            warnings.push({
              scope: "resource",
              code: "sut-material-limit-reached",
              message: `추출 소재 수가 상한(${maxMaterials})에 도달했습니다.`,
            });
            break;
          }
          const png = scanned.pngs[idx]!;
          const contentHash = fnv1a64Hex(png.slice);
          if (seenHashes.has(contentHash)) continue;
          seenHashes.add(contentHash);
          const kind = classifySutMaterialKind(table.name, column, textHints);
          allMaterials.push({
            id: `sut-${kind}-${contentHash.slice(0, 12)}`,
            kind,
            materialName: scanned.pngs.length > 1 ? `${candidateName}#${idx + 1}` : candidateName,
            width: png.width,
            height: png.height,
            bitDepth: png.bitDepth,
            colorType: png.colorType,
            byteLength: png.slice.byteLength,
            contentHash,
            base64: bytesToBase64(png.slice),
            sourceTable: table.name,
            sourceColumn: column,
            sourceRow: rowIndex,
          });
        }
      }
    }
  }

  return {
    tips: allMaterials.filter((m) => m.kind === "brush-tip" || m.kind === "unknown"),
    paperTextures: allMaterials.filter((m) => m.kind === "paper-texture"),
    dualTips: allMaterials.filter((m) => m.kind === "dual-brush-tip"),
    allMaterials,
    warnings,
  };
}
