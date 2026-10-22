/**
 * 앵커 특징 분석 Worker 메시지 계약 — 요청·응답 모양과 응답 검증.
 *
 * Worker 는 같은 브라우저 안의 별도 스레드이며 네트워크를 쓰지 않는다. 그래도 응답은 신뢰 경계를 넘어 오므로
 * `parseAnchorImageFeatures` 가 모양·길이·범위를 모두 확인한 새 객체로 다시 만든다.
 */

import { ANCHOR_COLOR_BINS } from "./anchor-color-stats";
import { ANCHOR_FEATURES_VERSION, type AnchorImageFeatures } from "./anchor-image-features";
import { ANCHOR_PALETTE } from "./anchor-palette";
import type { AnchorFeatureErrorCode } from "./anchor-raster";
import { ANCHOR_SILHOUETTE_GRID } from "./anchor-silhouette";
import { ANCHOR_DHASH } from "./anchor-structure-hash";

export const ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION = 1 as const;

export interface AnchorFeatureWorkerExtractRequest {
  readonly version: typeof ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION;
  readonly kind: "extract";
  readonly requestId: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: ArrayBuffer;
  readonly maxEdge?: number;
}

export type AnchorFeatureWorkerRequest = AnchorFeatureWorkerExtractRequest;

export type AnchorFeatureWorkerResponse =
  | {
    readonly version: typeof ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION;
    readonly kind: "result";
    readonly requestId: number;
    readonly features: unknown;
  }
  | {
    readonly version: typeof ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION;
    readonly kind: "error";
    readonly requestId: number;
    readonly code: AnchorFeatureErrorCode;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAnchorFeatureWorkerRequest(value: unknown): value is AnchorFeatureWorkerRequest {
  return isRecord(value)
    && value.version === ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION
    && value.kind === "extract"
    && typeof value.requestId === "number"
    && Number.isSafeInteger(value.width) && Number.isSafeInteger(value.height)
    && value.pixels instanceof ArrayBuffer;
}

const ERROR_CODES: ReadonlySet<string> = new Set<AnchorFeatureErrorCode>([
  "invalid-raster", "raster-too-small", "raster-too-large", "empty-image", "cancelled", "timeout",
  "worker-unavailable", "worker-failed", "worker-protocol",
]);

export function isAnchorFeatureWorkerResponse(value: unknown): value is AnchorFeatureWorkerResponse {
  if (!isRecord(value) || value.version !== ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION || typeof value.requestId !== "number") return false;
  if (value.kind === "result") return "features" in value;
  return value.kind === "error" && typeof value.code === "string" && ERROR_CODES.has(value.code);
}

function finite(value: unknown, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function numberArray(value: unknown, length: number, min: number, max: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const out: number[] = [];
  for (const item of value) {
    const checked = finite(item, min, max);
    if (checked === null) return null;
    out.push(checked);
  }
  return out;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/u;
const DHASH_HEX = /^[0-9a-f]{16}$/u;

function parseSubject(value: unknown): AnchorImageFeatures["subject"] | null {
  if (!isRecord(value)) return null;
  const mode = value.mode;
  const coverage = finite(value.coverage, 0, 1);
  const flatness = finite(value.backgroundFlatness, 0, 1);
  const hex = value.backgroundHex;
  if ((mode !== "alpha" && mode !== "background" && mode !== "whole-image") || coverage === null || flatness === null) return null;
  if (hex !== null && !(typeof hex === "string" && HEX_COLOR.test(hex))) return null;
  return Object.freeze({ mode, coverage, backgroundFlatness: flatness, backgroundHex: hex });
}

function parseSilhouette(value: unknown): { ok: true; value: AnchorImageFeatures["silhouette"] } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (!isRecord(value) || !isRecord(value.bbox)) return { ok: false };
  const box = value.bbox;
  const x0 = finite(box.x0, 0), y0 = finite(box.y0, 0), x1 = finite(box.x1, 0), y1 = finite(box.y1, 0);
  const widthFrac = finite(value.widthFrac, 0, 1), heightFrac = finite(value.heightFrac, 0, 1);
  const centerX = finite(value.centerX, 0, 1), centerY = finite(value.centerY, 0, 1);
  const aspect = finite(value.aspect, 0), fill = finite(value.fill, 0, 1);
  const thirds = numberArray(value.thirds, 3, 0, 1);
  const { cols, rows } = ANCHOR_SILHOUETTE_GRID;
  const grid = numberArray(value.grid, cols * rows, 0, 1);
  if (
    x0 === null || y0 === null || x1 === null || y1 === null || x1 < x0 || y1 < y0
    || widthFrac === null || heightFrac === null || centerX === null || centerY === null
    || aspect === null || aspect <= 0 || fill === null || !thirds || !grid
  ) return { ok: false };
  const [t0, t1, t2] = thirds;
  return {
    ok: true,
    value: Object.freeze({
      bbox: Object.freeze({ x0, y0, x1, y1 }),
      widthFrac, heightFrac, centerX, centerY, aspect, fill,
      thirds: Object.freeze([t0 ?? 0, t1 ?? 0, t2 ?? 0] as const),
      grid: Object.freeze(grid),
    }),
  };
}

function parseColor(value: unknown): AnchorImageFeatures["color"] | null {
  if (!isRecord(value)) return null;
  const meanL = finite(value.meanL, 0, 100), meanA = finite(value.meanA, -200, 200), meanB = finite(value.meanB, -200, 200);
  const meanChroma = finite(value.meanChroma, 0, 300), stdL = finite(value.stdL, 0, 100);
  const lHist = numberArray(value.lHist, ANCHOR_COLOR_BINS.lightnessBins, 0, 1);
  const abHist = numberArray(value.abHist, ANCHOR_COLOR_BINS.chromaBins * ANCHOR_COLOR_BINS.chromaBins, 0, 1);
  if (meanL === null || meanA === null || meanB === null || meanChroma === null || stdL === null || !lHist || !abHist) return null;
  return Object.freeze({ meanL, meanA, meanB, meanChroma, stdL, lHist: Object.freeze(lHist), abHist: Object.freeze(abHist) });
}

function parsePalette(value: unknown): AnchorImageFeatures["palette"] | null {
  if (!Array.isArray(value) || value.length > ANCHOR_PALETTE.k) return null;
  const out: AnchorImageFeatures["palette"][number][] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const lab = numberArray(item.lab, 3, -300, 300);
    const share = finite(item.share, 0, 1);
    if (!lab || share === null || typeof item.hex !== "string" || !HEX_COLOR.test(item.hex)) return null;
    out.push(Object.freeze({ lab: Object.freeze([lab[0] ?? 0, lab[1] ?? 0, lab[2] ?? 0] as const), hex: item.hex, share }));
  }
  return Object.freeze(out);
}

/** 신뢰 경계를 넘어 온 값을 검증해 새 AnchorImageFeatures 로 만든다. 하나라도 어긋나면 null. */
export function parseAnchorImageFeatures(value: unknown): AnchorImageFeatures | null {
  if (!isRecord(value) || value.version !== ANCHOR_FEATURES_VERSION) return null;
  const width = finite(value.width, 1), height = finite(value.height, 1);
  const subject = parseSubject(value.subject);
  const silhouette = parseSilhouette(value.silhouette);
  const color = parseColor(value.color);
  const palette = parsePalette(value.palette);
  const structure = value.structure;
  if (
    width === null || height === null || !subject || !silhouette.ok || !color || !palette
    || !isRecord(structure) || typeof structure.dHash !== "string" || typeof structure.dHashMirrored !== "string"
    || !DHASH_HEX.test(structure.dHash) || !DHASH_HEX.test(structure.dHashMirrored)
    || structure.dHash.length * 4 !== ANCHOR_DHASH.bits
    || (structure.region !== "subject" && structure.region !== "image")
    || typeof value.lowContrast !== "boolean"
  ) return null;
  return Object.freeze({
    version: ANCHOR_FEATURES_VERSION,
    width,
    height,
    subject,
    silhouette: silhouette.value,
    color,
    palette,
    structure: Object.freeze({ dHash: structure.dHash, dHashMirrored: structure.dHashMirrored, region: structure.region }),
    lowContrast: value.lowContrast,
  });
}
