/**
 * 컷 감지 Worker 메시지 계약.
 *
 * 요청은 감지 하나다. 클라이언트는 요청마다 새 Worker 를 만들고 끝나면 종료한다.
 * - 취소: `cancel` 메시지를 보내 협력적으로 멈추게 하고(Worker 는 점검 시점마다 확인한다), 클라이언트는 동시에
 *   Worker 를 terminate 해 즉시 강제한다. 둘 중 하나만 도착해도 감지는 멈춘다.
 * - 시간 상한: 알고리즘 안의 timeLimitMs 와 클라이언트의 바깥 타이머(terminate)가 이중으로 지킨다.
 * 응답의 result 는 신뢰 경계를 넘어온 값이라 클라이언트가 parsePanelDetectResult 로 구조를 검증한다.
 */

import {
  PANEL_DETECT_SENSITIVITIES,
  PANEL_DETECT_VERSION,
  PANEL_READING_ORDERS,
  isPanelDetectErrorCode,
  panelDetectConfidenceLevel,
  type DetectedPanel,
  type GutterInfo,
  type IgnoredFragment,
  type PanelDetectErrorCode,
  type PanelDetectOptions,
  type PanelDetectResult,
  type PanelDetectSensitivity,
  type PanelReadingOrder,
  type SplitSuggestion,
  type UndetectableRegion,
} from "./panel-detect-types";

export const PANEL_DETECT_WORKER_PROTOCOL_VERSION = 1 as const;

/** 구조 복제로 보낼 수 있는 옵션 부분집합(함수형 옵션은 Worker 안에서 만든다). */
export interface PanelDetectWorkerOptions {
  readonly readingOrder?: PanelReadingOrder;
  readonly sensitivity?: PanelDetectSensitivity;
  readonly maxDepth?: number;
  readonly maxAnalysisPixels?: number;
  readonly maxPanels?: number;
  readonly timeLimitMs?: number;
  readonly gutterTolerance?: number;
}

export interface PanelDetectWorkerDetectRequest {
  readonly version: typeof PANEL_DETECT_WORKER_PROTOCOL_VERSION;
  readonly kind: "detect";
  readonly requestId: number;
  readonly width: number;
  readonly height: number;
  /** RGBA, width*height*4 바이트. 전송(transfer)되어 보낸 쪽에서는 쓸 수 없게 된다. */
  readonly pixels: ArrayBuffer;
  readonly options: PanelDetectWorkerOptions;
}

export interface PanelDetectWorkerCancelRequest {
  readonly version: typeof PANEL_DETECT_WORKER_PROTOCOL_VERSION;
  readonly kind: "cancel";
  readonly requestId: number;
}

export type PanelDetectWorkerRequest = PanelDetectWorkerDetectRequest | PanelDetectWorkerCancelRequest;

export interface PanelDetectWorkerResultResponse {
  readonly version: typeof PANEL_DETECT_WORKER_PROTOCOL_VERSION;
  readonly kind: "result";
  readonly requestId: number;
  readonly result: unknown;
}

export interface PanelDetectWorkerErrorResponse {
  readonly version: typeof PANEL_DETECT_WORKER_PROTOCOL_VERSION;
  readonly kind: "error";
  readonly requestId: number;
  readonly code: PanelDetectErrorCode;
  readonly message: string;
}

export type PanelDetectWorkerResponse = PanelDetectWorkerResultResponse | PanelDetectWorkerErrorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalInteger(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isSafeInteger(value));
}

function isWorkerOptions(value: unknown): value is PanelDetectWorkerOptions {
  if (!isRecord(value)) return false;
  return (value.readingOrder === undefined || (PANEL_READING_ORDERS as readonly unknown[]).includes(value.readingOrder))
    && (value.sensitivity === undefined || (PANEL_DETECT_SENSITIVITIES as readonly unknown[]).includes(value.sensitivity))
    && optionalInteger(value.maxDepth)
    && optionalInteger(value.maxAnalysisPixels)
    && optionalInteger(value.maxPanels)
    && optionalInteger(value.timeLimitMs)
    && optionalInteger(value.gutterTolerance);
}

export function toWorkerOptions(options: PanelDetectOptions): PanelDetectWorkerOptions {
  const result: Record<string, unknown> = {};
  for (const key of ["readingOrder", "sensitivity", "maxDepth", "maxAnalysisPixels", "maxPanels", "timeLimitMs", "gutterTolerance"] as const) {
    const value = options[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function isPanelDetectWorkerRequest(value: unknown): value is PanelDetectWorkerRequest {
  if (!isRecord(value) || value.version !== PANEL_DETECT_WORKER_PROTOCOL_VERSION || !isRequestId(value.requestId)) return false;
  if (value.kind === "cancel") return true;
  return value.kind === "detect"
    && typeof value.width === "number" && Number.isSafeInteger(value.width) && value.width > 0
    && typeof value.height === "number" && Number.isSafeInteger(value.height) && value.height > 0
    && value.pixels instanceof ArrayBuffer
    && value.pixels.byteLength === value.width * value.height * 4
    && isWorkerOptions(value.options);
}

export function isPanelDetectWorkerResponse(value: unknown): value is PanelDetectWorkerResponse {
  if (!isRecord(value) || value.version !== PANEL_DETECT_WORKER_PROTOCOL_VERSION || !isRequestId(value.requestId)) return false;
  if (value.kind === "result") return "result" in value;
  return value.kind === "error" && isPanelDetectErrorCode(value.code) && typeof value.message === "string";
}

// ── 결과 검증 ────────────────────────────────────────────────────────────

function parseRect(value: unknown, width: number, height: number): { x: number; y: number; width: number; height: number } | null {
  if (!isRecord(value)) return null;
  const { x, y } = value;
  const w = value.width;
  const h = value.height;
  if (![x, y, w, h].every((entry) => typeof entry === "number" && Number.isInteger(entry))) return null;
  if (typeof x !== "number" || typeof y !== "number" || typeof w !== "number" || typeof h !== "number") return null;
  if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height) return null;
  return { x, y, width: w, height: h };
}

function parseGutter(value: unknown): GutterInfo | null {
  if (!isRecord(value)) return null;
  const kinds = ["white", "black", "solid", "transparent", "none"];
  if (typeof value.kind !== "string" || !kinds.includes(value.kind)) return null;
  if (!isFiniteNumber(value.tolerance) || !isFiniteNumber(value.votes)) return null;
  let color: GutterInfo["color"] = null;
  if (value.color !== null) {
    if (!isRecord(value.color)) return null;
    const { r, g, b } = value.color;
    if (!isFiniteNumber(r) || !isFiniteNumber(g) || !isFiniteNumber(b)) return null;
    color = { r, g, b };
  }
  if (value.kind !== "white" && value.kind !== "black" && value.kind !== "solid" && value.kind !== "transparent" && value.kind !== "none") return null;
  return { kind: value.kind, color, tolerance: value.tolerance, votes: value.votes };
}

function parseConfidence(value: unknown): number | null {
  return isFiniteNumber(value) && value >= 0 && value <= 1 ? value : null;
}

const PANEL_WARNINGS = [
  "overlap-suspected", "bridged-gutter-suspected", "merged-panels-suspected", "max-depth-reached", "touches-image-edge", "no-gutter-found",
] as const;
const RESULT_WARNINGS = [
  "blank-image", "no-gutter-found", "no-panel-found", "downsampled", "undetectable-regions",
  "ignored-fragments", "max-depth-reached", "low-overall-confidence",
] as const;

/** Array.isArray 는 unknown 을 any[] 로 좁히므로, 요소를 unknown 으로 다루도록 한 번 받아 둔다. */
function unknownItems(value: unknown): readonly unknown[] | null {
  if (!Array.isArray(value)) return null;
  const items: readonly unknown[] = value;
  return items;
}

function stringArray<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  const items = unknownItems(value);
  if (items === null) return null;
  const result: T[] = [];
  for (const entry of items) {
    const match = allowed.find((candidate) => candidate === entry);
    if (match === undefined) return null;
    result.push(match);
  }
  return result;
}

/**
 * Worker 가 보낸 결과가 계약을 지키는지 검사하고, 지키면 읽기 전용 객체로 새로 만들어 돌려준다.
 * 사각형은 모두 정수이고 이미지 안에 있어야 하며, 컷 id·순서는 1..n 으로 이어져야 한다.
 */
export function parsePanelDetectResult(
  value: unknown,
  expected: { readonly width: number; readonly height: number },
): PanelDetectResult | null {
  if (!isRecord(value) || value.version !== PANEL_DETECT_VERSION) return null;
  if (value.width !== expected.width || value.height !== expected.height) return null;
  const { width, height } = expected;
  const gutter = parseGutter(value.gutter);
  if (!gutter || !isRecord(value.analysis)) return null;
  const analysis = value.analysis;
  if (!isFiniteNumber(analysis.width) || !isFiniteNumber(analysis.height) || typeof analysis.step !== "number" || !Number.isInteger(analysis.step) || analysis.step < 1) return null;
  const readingOrder = (PANEL_READING_ORDERS as readonly unknown[]).includes(value.readingOrder)
    ? PANEL_READING_ORDERS.find((entry) => entry === value.readingOrder)
    : undefined;
  const rawPanels = unknownItems(value.panels);
  const rawUndetectable = unknownItems(value.undetectable);
  const rawIgnored = unknownItems(value.ignored);
  const rawSuggestions = unknownItems(value.suggestions);
  if (!readingOrder || !rawPanels || !rawUndetectable || !rawIgnored || !rawSuggestions) return null;

  const panels: DetectedPanel[] = [];
  for (const [index, entry] of rawPanels.entries()) {
    const rect = isRecord(entry) ? parseRect(entry, width, height) : null;
    const warnings = isRecord(entry) ? stringArray(entry.warnings, PANEL_WARNINGS) : null;
    const confidence = isRecord(entry) ? parseConfidence(entry.confidence) : null;
    if (!isRecord(entry) || !rect || !warnings || confidence === null) return null;
    if (entry.id !== `panel-${index + 1}` || entry.order !== index + 1) return null;
    panels.push({ id: `panel-${index + 1}`, order: index + 1, ...rect, confidence, level: panelDetectConfidenceLevel(confidence), warnings });
  }
  const undetectable: UndetectableRegion[] = [];
  for (const [index, entry] of rawUndetectable.entries()) {
    const rect = isRecord(entry) ? parseRect(entry, width, height) : null;
    if (!isRecord(entry) || !rect || entry.reason !== "non-separable" || typeof entry.componentCount !== "number" || !Number.isInteger(entry.componentCount)) return null;
    undetectable.push({ id: `undetectable-${index + 1}`, reason: "non-separable", componentCount: entry.componentCount, ...rect });
  }
  const ignored: IgnoredFragment[] = [];
  for (const [index, entry] of rawIgnored.entries()) {
    const rect = isRecord(entry) ? parseRect(entry, width, height) : null;
    if (!isRecord(entry) || !rect) return null;
    if (entry.reason !== "too-small" && entry.reason !== "low-content") return null;
    ignored.push({ id: `ignored-${index + 1}`, reason: entry.reason, ...rect });
  }
  const suggestions: SplitSuggestion[] = [];
  for (const [index, entry] of rawSuggestions.entries()) {
    if (!isRecord(entry) || entry.reason !== "bridged-gutter" || typeof entry.position !== "number" || !Number.isInteger(entry.position)) return null;
    if (entry.orientation !== "horizontal" && entry.orientation !== "vertical") return null;
    if (typeof entry.panelId !== "string" || !panels.some((panel) => panel.id === entry.panelId)) return null;
    const limit = entry.orientation === "horizontal" ? height : width;
    if (entry.position < 0 || entry.position >= limit) return null;
    suggestions.push({ id: `suggestion-${index + 1}`, panelId: entry.panelId, orientation: entry.orientation, position: entry.position, reason: "bridged-gutter" });
  }
  const confidence = parseConfidence(value.confidence);
  const warnings = stringArray(value.warnings, RESULT_WARNINGS);
  if (confidence === null || !warnings) return null;
  return {
    version: PANEL_DETECT_VERSION,
    width,
    height,
    analysis: { width: analysis.width, height: analysis.height, step: analysis.step },
    gutter,
    readingOrder,
    panels,
    undetectable,
    ignored,
    suggestions,
    confidence,
    level: panelDetectConfidenceLevel(confidence),
    warnings,
  };
}
