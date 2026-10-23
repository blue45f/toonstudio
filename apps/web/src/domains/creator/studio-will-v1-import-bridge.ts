/**
 * Safe Studio import bridge for the clean-room, bounded WILL v1 Annex B profile.
 *
 * The strict OPC/ZIP parser always runs in the dedicated one-shot Worker. This bridge starts only
 * after file selection, turns validated Catmull-Rom paths into bounded Studio freehand elements,
 * and publishes every approximation in the shared loss-preview vocabulary. It is not a Wacom SDK,
 * Wacom certification, or a claim of arbitrary vendor `.will` interoperability.
 */

import { STUDIO_INK_MAX_BRUSH_SIZE } from "./brush/studio-ink-pressure-model";
import { resolveStudioWillImportCommitStatus, resolveStudioWillImportConstraint } from "./status-i18n/studio-producer-error-i18n-will-import";
import { StudioWillV1ImportError, type StudioWillV1ImportLabelCode } from "./studio-will-v1-import-bridge-error";

export { StudioWillV1ImportError } from "./studio-will-v1-import-bridge-error";
export type { StudioWillV1ImportErrorCode, StudioWillV1ImportLabelCode } from "./studio-will-v1-import-bridge-error";
import { catmullRomPoint } from "./studio-curve-smoothing";
import {
  summarizeStudioInterchangeLoss,
  type StudioInterchangeLossConstraint,
  type StudioInterchangeLossPreviewInput,
} from "./studio-interchange-loss-preview";
import {
  STUDIO_PROJECT_MAX_CANVAS_HEIGHT,
} from "./studio-project-file";

import type { DrawEl } from "./studio-element-model";
import type {
  StudioWillV1Path,
} from "./studio-will-v1-interchange";
import type {
  StudioWillV1OpcImportResult,
} from "./studio-will-v1-opc-interchange";
import type {
  StudioWillV1OpcWorkerOptions,
} from "./studio-will-v1-opc-worker-client";

export const STUDIO_WILL_V1_IMPORT_MEDIA_TYPE =
  "application/vnd.toonstudio.will-v1-bounded+zip" as const;
export const STUDIO_WILL_V1_IMPORT_ACCEPT =
  ".will,application/vnd.toonstudio.will-v1-bounded+zip" as const;
export const STUDIO_WILL_V1_IMPORT_PROFILE_LABEL =
  "ToonStudio bounded WILL v1 Annex B public-spec profile" as const;
export const STUDIO_WILL_V1_IMPORT_DISCLAIMER =
  "ToonStudio의 공개 명세 기반 bounded profile만 가져오며 Wacom 공식 SDK·인증 파일 호환을 보증하지 않습니다." as const;

/** Matches the persisted project schema and the CRDT page mutation boundary. */
export const STUDIO_WILL_V1_IMPORT_MAX_ELEMENTS_PER_PAGE = 10_000;
/** Keeps one CRDT scene element comfortably below its 16 KiB canonical JSON budget. */
export const STUDIO_WILL_V1_IMPORT_MAX_SAMPLES_PER_ELEMENT = 192;
/**
 * Defense-in-depth cap before Studio performs any Catmull-Rom sampling. The transport may validate
 * a much larger aggregate document, but one retained Studio path is intentionally limited to the
 * current public-profile per-path envelope. This prevents a future/foreign Worker result from
 * expanding one million control points into multi-million temporary main-thread arrays.
 */
export const STUDIO_WILL_V1_IMPORT_MAX_SOURCE_CONTROL_POINTS_PER_PATH = 100_000;
/**
 * Studio UI admission budget enforced inside the Worker parser and again by the main-thread packed
 * decoder before it creates point objects. The generic codec can still validate one million source
 * points, but an interactive import cannot expand more than this into `{x,y}` objects, retained
 * DrawEl arrays, or history snapshots.
 */
export const STUDIO_WILL_V1_IMPORT_MAX_STUDIO_SAMPLES = 200_000;
const STUDIO_WILL_V1_IMPORT_MIN_BRUSH_SIZE = 0.01;
const STUDIO_WILL_V1_IMPORT_MAX_COORDINATE_MAGNITUDE = 10_000_000;

export type StudioWillV1ImportAdaptationReason =
  | "catmull-rom-resampled-to-studio-polyline"
  | "document-scaled-to-studio-width"
  | "path-split-for-collaboration-budget"
  | "stroke-width-mapped-to-pressure"
  | "stroke-width-scaled-to-studio-range";

export interface StudioWillV1ImportAdaptation {
  readonly reason: StudioWillV1ImportAdaptationReason;
  readonly count: number;
}

export type StudioWillV1ImportSkipReason =
  | "coordinate-outside-studio-safe-range"
  | "sample-budget-exceeded";

export interface StudioWillV1ImportSkip {
  readonly pathIndex: number;
  readonly reason: StudioWillV1ImportSkipReason;
}

export interface StudioWillV1ImportedStrokeDraft {
  readonly stableIdBase: string;
  readonly sourcePathIndex: number;
  readonly element: Omit<DrawEl, "id">;
}

export interface PendingStudioWillV1Import {
  readonly kind: "will-v1";
  readonly fileName: string;
  readonly result: StudioWillV1OpcImportResult;
  readonly preview: StudioInterchangeLossPreviewInput;
  readonly sourceFingerprint: `willfp:${string}`;
  readonly pageHeight: number;
  readonly drafts: readonly StudioWillV1ImportedStrokeDraft[];
  readonly adaptations: readonly StudioWillV1ImportAdaptation[];
  readonly skipped: readonly StudioWillV1ImportSkip[];
  readonly currentPageAllowed: boolean;
  readonly newPageAllowed: boolean;
  readonly disclaimer: typeof STUDIO_WILL_V1_IMPORT_DISCLAIMER;
}

export interface StudioWillV1ImportInspectionOptions {
  readonly canvasWidth: number;
  readonly currentPageElementCount: number;
  readonly canAddPage: boolean;
  readonly signal?: AbortSignal;
  readonly workerOptions?: Omit<StudioWillV1OpcWorkerOptions, "signal">;
}

export interface StudioWillV1ImportCommitOptions {
  readonly existingElementIds: ReadonlySet<string>;
  readonly currentPageElementCount: number;
  readonly destination: "current-page" | "new-page";
}

export interface StudioWillV1ImportCommitDraft {
  readonly elements: readonly DrawEl[];
  readonly pageHeight: number;
  readonly title: string;
  readonly status: Readonly<{
    tone: "good" | "warn";
    text: string;
  }>;
}

function studioWillV1ImportWorkerOptions(
  options: StudioWillV1ImportInspectionOptions["workerOptions"],
): Omit<StudioWillV1OpcWorkerOptions, "signal"> {
  const suppliedWillLimits = options?.willLimits;
  return {
    ...options,
    willLimits: {
      ...suppliedWillLimits,
      maxPointsPerPath: Math.min(
        suppliedWillLimits?.maxPointsPerPath
          ?? STUDIO_WILL_V1_IMPORT_MAX_SOURCE_CONTROL_POINTS_PER_PATH,
        STUDIO_WILL_V1_IMPORT_MAX_SOURCE_CONTROL_POINTS_PER_PATH,
      ),
      maxTotalPoints: Math.min(
        suppliedWillLimits?.maxTotalPoints
          ?? STUDIO_WILL_V1_IMPORT_MAX_STUDIO_SAMPLES,
        STUDIO_WILL_V1_IMPORT_MAX_STUDIO_SAMPLES,
      ),
    },
  };
}

interface SampledPath {
  readonly points: readonly number[];
  readonly widths: readonly number[];
  readonly maximumWidth: number;
  readonly minimumWidth: number;
}

type SampledPathAttempt =
  | Readonly<{ kind: "sampled"; sampled: SampledPath }>
  | Readonly<{ kind: "coordinate-invalid" }>
  | Readonly<{ kind: "sample-budget-exceeded" }>;

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  // 취소 관례(name = AbortError)는 유지하고 message는 코드를 싣는다 — 표시 지점에서 해석.
  throw new StudioWillV1ImportError("aborted", undefined, { errorName: "AbortError" });
}

function finitePositive(value: number, label: StudioWillV1ImportLabelCode): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new StudioWillV1ImportError("invalidValue", { label });
  }
  return value;
}

function safeFileName(value: string): string {
  const name = Array.from(value.trim())
    .filter((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point >= 0x20 && point !== 0x7f;
    })
    .join("")
    .slice(0, 240);
  return name || "가져올 WILL v1 파일";
}

function safePageTitle(result: StudioWillV1OpcImportResult, fileName: string): string {
  const fromMetadata = Array.from(result.title.trim()).slice(0, 120).join("");
  if (fromMetadata && fromMetadata !== "Untitled") return fromMetadata;
  const fromFile = fileName.replace(/\.will$/iu, "").trim();
  return Array.from(fromFile).slice(0, 120).join("") || "WILL v1 가져오기";
}

function assuranceIsBoundedPublicProfile(
  result: StudioWillV1OpcImportResult,
  expectedProfile: string,
): boolean {
  const assurance = result.assurance;
  return (
    assurance.profile === expectedProfile
    && assurance.implementation === "ToonStudio clean-room bounded profile"
    && assurance.annexAPathStream === true
    && assurance.annexBOpcSevenPartContainer === true
    && assurance.canonicalTopLevelMediaTypeOwner === "ToonStudio"
    && assurance.vendorCertified === false
    && assurance.vendorTrademarkAuthorized === false
    && assurance.arbitraryVendorFileInteroperabilityCertified === false
  );
}

interface StableHashState {
  first: number;
  second: number;
}

function stableHashState(): StableHashState {
  return {
    first: 0x811c9dc5,
    second: 0x9e3779b9,
  };
}

function updateStableHashByte(state: StableHashState, byte: number): void {
  state.first = Math.imul(state.first ^ byte, 0x01000193) >>> 0;
  state.second = Math.imul(state.second ^ byte, 0x85ebca6b) >>> 0;
}

function updateStableHashText(state: StableHashState, value: string): void {
  for (const byte of new TextEncoder().encode(value)) updateStableHashByte(state, byte);
  updateStableHashByte(state, 0xff);
}

const stableNumberBuffer = new ArrayBuffer(8);
const stableNumberView = new DataView(stableNumberBuffer);

function updateStableHashNumber(state: StableHashState, value: number): void {
  stableNumberView.setFloat64(0, value, true);
  for (let index = 0; index < 8; index += 1) {
    updateStableHashByte(state, stableNumberView.getUint8(index));
  }
}

function finishStableHash(state: StableHashState): string {
  return `${state.first.toString(16).padStart(8, "0")}${state.second.toString(16).padStart(8, "0")}`;
}

/**
 * Allocation-bounded replay identity, not a cryptographic integrity digest. The strict Worker owns
 * archive integrity; this streaming hash only keeps imported element IDs deterministic without
 * JSON-stringifying up to one million points on the main thread.
 */
function stablePathFingerprint(path: StudioWillV1Path): string {
  const state = stableHashState();
  updateStableHashNumber(state, path.startParameter);
  updateStableHashNumber(state, path.endParameter);
  updateStableHashNumber(state, path.decimalPrecision);
  updateStableHashNumber(state, path.segmentCount);
  for (const point of path.points) {
    updateStableHashNumber(state, point.x);
    updateStableHashNumber(state, point.y);
  }
  updateStableHashByte(state, 0xfe);
  for (const width of path.strokeWidths) updateStableHashNumber(state, width);
  updateStableHashByte(state, path.strokeColor.r);
  updateStableHashByte(state, path.strokeColor.g);
  updateStableHashByte(state, path.strokeColor.b);
  updateStableHashByte(state, path.strokeColor.a);
  return finishStableHash(state);
}

function stableSkippedPathFingerprint(
  path: StudioWillV1Path,
  reason: StudioWillV1ImportSkipReason,
): string {
  const state = stableHashState();
  updateStableHashText(state, "skipped");
  updateStableHashText(state, reason);
  updateStableHashNumber(state, path.points.length);
  updateStableHashNumber(state, path.strokeWidths.length);
  updateStableHashNumber(state, path.startParameter);
  updateStableHashNumber(state, path.endParameter);
  updateStableHashNumber(state, path.decimalPrecision);
  updateStableHashNumber(state, path.segmentCount);
  updateStableHashByte(state, path.strokeColor.r);
  updateStableHashByte(state, path.strokeColor.g);
  updateStableHashByte(state, path.strokeColor.b);
  updateStableHashByte(state, path.strokeColor.a);
  return `skipped:${finishStableHash(state)}`;
}

function stableDocumentFingerprint(
  result: StudioWillV1OpcImportResult,
  pathFingerprints: readonly string[],
): `willfp:${string}` {
  const state = stableHashState();
  updateStableHashText(state, result.assurance.profile);
  updateStableHashNumber(state, result.width);
  updateStableHashNumber(state, result.height);
  updateStableHashText(state, result.title);
  updateStableHashText(state, result.createdAt);
  updateStableHashText(state, result.application);
  updateStableHashText(state, result.applicationVersion);
  for (const pathFingerprint of pathFingerprints) {
    updateStableHashText(state, pathFingerprint);
  }
  return `willfp:${finishStableHash(state)}`;
}

function sameSample(
  points: readonly number[],
  widths: readonly number[],
  x: number,
  y: number,
  width: number,
): boolean {
  const pointOffset = points.length - 2;
  return (
    pointOffset >= 0
    && points[pointOffset] === x
    && points[pointOffset + 1] === y
    && widths.at(-1) === width
  );
}

function sampledPath(
  path: StudioWillV1Path,
  scale: number,
  maximumSamples: number,
): SampledPathAttempt {
  const points: number[] = [];
  const widths: number[] = [];
  const lastSegment = path.segmentCount - 1;
  for (let segment = 0; segment < path.segmentCount; segment += 1) {
    const firstT = segment === 0 ? path.startParameter : 0;
    const lastT = segment === lastSegment ? path.endParameter : 1;
    if (firstT > lastT) return Object.freeze({ kind: "coordinate-invalid" });
    const tValues = firstT === lastT
      ? [firstT]
      : [firstT, firstT + (lastT - firstT) / 2, lastT];
    const p0 = path.points[segment]!;
    const p1 = path.points[segment + 1]!;
    const p2 = path.points[segment + 2]!;
    const p3 = path.points[segment + 3]!;
    // WILL v1 explicitly repeats the final supplied width when the width stream is shorter than
    // the control-point stream. A common constant-width path therefore contains exactly one width.
    const lastWidthIndex = path.strokeWidths.length - 1;
    const widthStart = path.strokeWidths[Math.min(segment + 1, lastWidthIndex)]!;
    const widthEnd = path.strokeWidths[Math.min(segment + 2, lastWidthIndex)]!;
    for (const t of tValues) {
      const point = catmullRomPoint(p0, p1, p2, p3, t);
      const x = point.x * scale;
      const y = point.y * scale;
      const width = (widthStart + (widthEnd - widthStart) * t) * scale;
      if (
        !Number.isFinite(x)
        || !Number.isFinite(y)
        || !Number.isFinite(width)
        || width <= 0
        || Math.abs(x) > STUDIO_WILL_V1_IMPORT_MAX_COORDINATE_MAGNITUDE
        || Math.abs(y) > STUDIO_WILL_V1_IMPORT_MAX_COORDINATE_MAGNITUDE
      ) {
        return Object.freeze({ kind: "coordinate-invalid" });
      }
      if (!sameSample(points, widths, x, y, width)) {
        if (widths.length >= maximumSamples) {
          return Object.freeze({ kind: "sample-budget-exceeded" });
        }
        points.push(x, y);
        widths.push(width);
      }
    }
  }
  if (widths.length === 0) return Object.freeze({ kind: "coordinate-invalid" });
  if (widths.length === 1) {
    if (maximumSamples < 2) {
      return Object.freeze({ kind: "sample-budget-exceeded" });
    }
    points.push(points[0]!, points[1]!);
    widths.push(widths[0]!);
  }
  return Object.freeze({
    kind: "sampled",
    sampled: sampledPathWithStats(points, widths),
  });
}

function sampledPathWithStats(points: number[], widths: number[]): SampledPath {
  let maximumWidth = 0;
  let minimumWidth = Number.POSITIVE_INFINITY;
  for (const width of widths) {
    maximumWidth = Math.max(maximumWidth, width);
    minimumWidth = Math.min(minimumWidth, width);
  }
  return Object.freeze({
    points: Object.freeze(points),
    widths: Object.freeze(widths),
    maximumWidth,
    minimumWidth,
  });
}

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function splitSampledPath(
  sampled: SampledPath,
): readonly SampledPath[] {
  const pointCount = sampled.widths.length;
  if (pointCount <= STUDIO_WILL_V1_IMPORT_MAX_SAMPLES_PER_ELEMENT) {
    return Object.freeze([sampled]);
  }
  const chunks: SampledPath[] = [];
  let start = 0;
  while (start < pointCount) {
    const end = Math.min(
      pointCount,
      start + STUDIO_WILL_V1_IMPORT_MAX_SAMPLES_PER_ELEMENT,
    );
    const points = sampled.points.slice(start * 2, end * 2);
    const widths = sampled.widths.slice(start, end);
    if (widths.length === 1) {
      points.push(points[0]!, points[1]!);
      widths.push(widths[0]!);
    }
    chunks.push(sampledPathWithStats(points, widths));
    if (end >= pointCount) break;
    start = end - 1;
  }
  return Object.freeze(chunks);
}

function elementDraft(
  path: StudioWillV1Path,
  sampled: SampledPath,
  stableIdBase: string,
  sourcePathIndex: number,
): StudioWillV1ImportedStrokeDraft {
  const maximumWidth = sampled.maximumWidth;
  const boundedBaseWidth = Math.min(
    STUDIO_INK_MAX_BRUSH_SIZE,
    Math.max(STUDIO_WILL_V1_IMPORT_MIN_BRUSH_SIZE, maximumWidth),
  );
  const widthScale = boundedBaseWidth / maximumWidth;
  const pressures = sampled.widths.map((width) =>
    Math.min(1, Math.max(0, (width * widthScale) / boundedBaseWidth))
  );
  const { r, g, b, a } = path.strokeColor;
  return Object.freeze({
    stableIdBase,
    sourcePathIndex,
    element: Object.freeze({
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [...sampled.points],
      stroke: `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`,
      strokeWidth: boundedBaseWidth,
      opacity: a / 255,
      brush: "pen",
      brushCatalogId: "will-v1-import-pen",
      brushCatalogName: "WILL v1 가져온 선",
      pressures,
      pressureModel: "linear-residual-path-v3",
      paintModel: "layered-flow-v1",
      sampleSpacing: 1,
      name: `WILL 선 ${sourcePathIndex + 1}`,
    }),
  });
}

function incrementAdaptation(
  map: Map<StudioWillV1ImportAdaptationReason, number>,
  reason: StudioWillV1ImportAdaptationReason,
  count = 1,
): void {
  map.set(reason, (map.get(reason) ?? 0) + count);
}

function constraintsForInspection(input: {
  readonly adaptations: readonly StudioWillV1ImportAdaptation[];
  readonly drafts: readonly StudioWillV1ImportedStrokeDraft[];
  readonly pageHeight: number;
  readonly scale: number;
  readonly skipped: readonly StudioWillV1ImportSkip[];
  readonly canUseAnyDestination: boolean;
}): StudioInterchangeLossConstraint[] {
  const constraints: StudioInterchangeLossConstraint[] = [
    {
      category: "editability",
      severity: "notice",
      message: STUDIO_WILL_V1_IMPORT_DISCLAIMER,
    },
  ];
  if (input.scale !== 1) {
    constraints.push({
      category: "resolution",
      severity: "notice",
      message: resolveStudioWillImportConstraint("scaled", { scale: input.scale.toFixed(4) }),
    });
  }
  if (input.adaptations.some(({ reason }) =>
    reason === "catmull-rom-resampled-to-studio-polyline"
  )) {
    constraints.push({
      category: "editability",
      severity: "warning",
      message: resolveStudioWillImportConstraint("catmullResampled"),
    });
  }
  if (input.adaptations.some(({ reason }) =>
    reason === "stroke-width-mapped-to-pressure"
  )) {
    constraints.push({
      category: "editability",
      severity: "notice",
      message: resolveStudioWillImportConstraint("strokeWidthMapped"),
    });
  }
  const splitCount = input.adaptations.find(({ reason }) =>
    reason === "path-split-for-collaboration-budget"
  )?.count ?? 0;
  if (splitCount > 0) {
    constraints.push({
      category: "layers",
      severity: "notice",
      message: resolveStudioWillImportConstraint("pathSplit", { count: splitCount.toLocaleString("ko-KR") }),
    });
  }
  if (input.adaptations.some(({ reason }) =>
    reason === "stroke-width-scaled-to-studio-range"
  )) {
    constraints.push({
      category: "editability",
      severity: "warning",
      message: resolveStudioWillImportConstraint("strokeWidthScaled", { min: String(STUDIO_WILL_V1_IMPORT_MIN_BRUSH_SIZE), max: STUDIO_INK_MAX_BRUSH_SIZE.toLocaleString("ko-KR") }),
    });
  }
  if (input.skipped.length > 0) {
    constraints.push({
      category: "editability",
      severity: "warning",
      message: resolveStudioWillImportConstraint("skippedPaths", { count: input.skipped.length.toLocaleString("ko-KR") }),
    });
  }
  if (input.drafts.length === 0) {
    constraints.push({
      category: "editability",
      gate: "blocking",
      message: resolveStudioWillImportConstraint("noDrafts"),
    });
  }
  if (input.drafts.length > STUDIO_WILL_V1_IMPORT_MAX_ELEMENTS_PER_PAGE) {
    constraints.push({
      category: "layers",
      gate: "blocking",
      message: resolveStudioWillImportConstraint("tooManyElements", { count: input.drafts.length.toLocaleString("ko-KR"), max: STUDIO_WILL_V1_IMPORT_MAX_ELEMENTS_PER_PAGE.toLocaleString("ko-KR") }),
    });
  }
  if (input.pageHeight > STUDIO_PROJECT_MAX_CANVAS_HEIGHT) {
    constraints.push({
      category: "resolution",
      gate: "blocking",
      message: resolveStudioWillImportConstraint("pageHeightExceeded", { height: input.pageHeight.toLocaleString("ko-KR"), max: STUDIO_PROJECT_MAX_CANVAS_HEIGHT.toLocaleString("ko-KR") }),
    });
  }
  if (!input.canUseAnyDestination) {
    constraints.push({
      category: "pages",
      gate: "blocking",
      message: resolveStudioWillImportConstraint("noDestination"),
    });
  }
  return constraints;
}

/**
 * Decodes the strict seven-part profile in the dedicated Worker and prepares a non-mutating loss
 * preview. Invalid/foreign profiles never produce a pending import.
 */
export async function inspectStudioWillV1Import(
  source: Blob | Uint8Array | ArrayBuffer,
  fileName: string,
  options: StudioWillV1ImportInspectionOptions,
): Promise<PendingStudioWillV1Import> {
  throwIfAborted(options.signal);
  const canvasWidth = finitePositive(options.canvasWidth, "canvasWidth");
  if (
    !Number.isSafeInteger(options.currentPageElementCount)
    || options.currentPageElementCount < 0
    || options.currentPageElementCount > STUDIO_WILL_V1_IMPORT_MAX_ELEMENTS_PER_PAGE
  ) {
    throw new StudioWillV1ImportError("elementCountMismatch");
  }
  const [
    { importStudioWillV1OpcInWorker },
    { STUDIO_WILL_V1_OPC_PROFILE },
  ] = await Promise.all([
    import("./studio-will-v1-opc-worker-client"),
    import("./studio-will-v1-opc-interchange"),
  ]);
  const result = await importStudioWillV1OpcInWorker(source, {
    ...studioWillV1ImportWorkerOptions(options.workerOptions),
    signal: options.signal,
  });
  throwIfAborted(options.signal);
  if (!assuranceIsBoundedPublicProfile(result, STUDIO_WILL_V1_OPC_PROFILE)) {
    throw new StudioWillV1ImportError("profileUnverified");
  }

  const scale = canvasWidth / finitePositive(result.width, "documentWidth");
  const pageHeight = Math.max(1, Math.round(finitePositive(result.height, "documentHeight") * scale));
  const pathFingerprints: string[] = [];
  const adaptations = new Map<StudioWillV1ImportAdaptationReason, number>();
  const skipped: StudioWillV1ImportSkip[] = [];
  const drafts: StudioWillV1ImportedStrokeDraft[] = [];
  let totalSamples = 0;
  if (scale !== 1) incrementAdaptation(adaptations, "document-scaled-to-studio-width");

  for (let pathIndex = 0; pathIndex < result.paths.length; pathIndex += 1) {
    const path = result.paths[pathIndex]!;
    if (
      path.points.length
      > STUDIO_WILL_V1_IMPORT_MAX_SOURCE_CONTROL_POINTS_PER_PATH
    ) {
      const reason = "sample-budget-exceeded";
      skipped.push({ pathIndex, reason });
      pathFingerprints.push(stableSkippedPathFingerprint(path, reason));
      continue;
    }
    const attempted = sampledPath(
      path,
      scale,
      STUDIO_WILL_V1_IMPORT_MAX_STUDIO_SAMPLES - totalSamples,
    );
    if (attempted.kind !== "sampled") {
      const reason = attempted.kind === "sample-budget-exceeded"
        ? "sample-budget-exceeded"
        : "coordinate-outside-studio-safe-range";
      skipped.push({ pathIndex, reason });
      pathFingerprints.push(stableSkippedPathFingerprint(path, reason));
      continue;
    }
    const sampled = attempted.sampled;
    totalSamples += sampled.widths.length;
    const pathFingerprint = stablePathFingerprint(path);
    pathFingerprints.push(pathFingerprint);
    incrementAdaptation(adaptations, "catmull-rom-resampled-to-studio-polyline");
    if (sampled.maximumWidth !== sampled.minimumWidth) {
      incrementAdaptation(adaptations, "stroke-width-mapped-to-pressure");
    }
    if (
      sampled.maximumWidth > STUDIO_INK_MAX_BRUSH_SIZE
      || sampled.maximumWidth < STUDIO_WILL_V1_IMPORT_MIN_BRUSH_SIZE
    ) {
      incrementAdaptation(adaptations, "stroke-width-scaled-to-studio-range");
    }
    const chunks = splitSampledPath(sampled);
    if (chunks.length > 1) {
      incrementAdaptation(
        adaptations,
        "path-split-for-collaboration-budget",
        chunks.length,
      );
    }
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const idBase = `will-${pathFingerprint}-${pathIndex.toString(36)}-${chunkIndex.toString(36)}`;
      drafts.push(elementDraft(path, chunks[chunkIndex]!, idBase, pathIndex));
    }
  }

  const sourceFingerprint = stableDocumentFingerprint(result, pathFingerprints);
  const frozenAdaptations = Object.freeze(
    [...adaptations.entries()].map(([reason, count]) => Object.freeze({ reason, count })),
  );
  const frozenSkipped = Object.freeze(skipped.map((item) => Object.freeze(item)));
  const frozenDrafts = Object.freeze(drafts);
  const currentPageAllowed =
    options.currentPageElementCount + frozenDrafts.length
    <= STUDIO_WILL_V1_IMPORT_MAX_ELEMENTS_PER_PAGE;
  const newPageAllowed =
    options.canAddPage
    && frozenDrafts.length <= STUDIO_WILL_V1_IMPORT_MAX_ELEMENTS_PER_PAGE;
  const constraints = constraintsForInspection({
    adaptations: frozenAdaptations,
    drafts: frozenDrafts,
    pageHeight,
    scale,
    skipped: frozenSkipped,
    canUseAnyDestination: currentPageAllowed || newPageAllowed,
  });
  const preview: StudioInterchangeLossPreviewInput = Object.freeze({
    format: "raster",
    formatLabel: "WILL v1 (bounded)",
    fileName: safeFileName(fileName),
    source: Object.freeze({
      pageCount: 1,
      layerCount: result.paths.length,
      width: Math.max(1, Math.round(result.width)),
      height: Math.max(1, Math.round(result.height)),
      alpha: result.paths.some(({ strokeColor }) => strokeColor.a < 255)
        ? "present"
        : "opaque",
      colorSpace: "WILL v1 8-bit RGBA (프로필 미지정)",
      editability: "layered",
    }),
    result: Object.freeze({
      pageCount: 1,
      layerCount: frozenDrafts.length,
      width: Math.max(1, Math.round(canvasWidth)),
      height: pageHeight,
      alpha: result.paths.some(({ strokeColor }) => strokeColor.a < 255)
        ? "present"
        : "opaque",
      colorSpace: "Studio sRGB",
      editability: "layered",
    }),
    proxy: Object.freeze({
      enabled: false,
      originalRetained: false,
    }),
    constraints: Object.freeze(constraints.map((item) => Object.freeze(item))),
  });
  return Object.freeze({
    kind: "will-v1",
    fileName: safeFileName(fileName),
    result,
    preview,
    sourceFingerprint,
    pageHeight,
    drafts: frozenDrafts,
    adaptations: frozenAdaptations,
    skipped: frozenSkipped,
    currentPageAllowed,
    newPageAllowed,
    disclaimer: STUDIO_WILL_V1_IMPORT_DISCLAIMER,
  });
}

function allocateStableId(base: string, reserved: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (reserved.has(candidate)) {
    candidate = `${base}-${suffix.toString(36)}`;
    suffix += 1;
  }
  reserved.add(candidate);
  return candidate;
}

/**
 * Produces immutable elements only after an explicit destination choice. The caller must commit
 * the resulting complete page transition through Studio's normal history/CRDT mutation function.
 */
export function prepareStudioWillV1ImportCommit(
  pending: PendingStudioWillV1Import,
  options: StudioWillV1ImportCommitOptions,
): StudioWillV1ImportCommitDraft {
  const summary = summarizeStudioInterchangeLoss(pending.preview);
  if (!summary.canConfirm) {
    throw new StudioWillV1ImportError("blockedLoss");
  }
  if (options.destination !== "new-page" && options.destination !== "current-page") {
    throw new StudioWillV1ImportError("destinationRequired");
  }
  if (options.destination === "new-page" && !pending.newPageAllowed) {
    throw new StudioWillV1ImportError("newPageNotAllowed");
  }
  if (options.destination === "current-page" && !pending.currentPageAllowed) {
    throw new StudioWillV1ImportError("currentPageNotAllowed");
  }
  if (
    !Number.isSafeInteger(options.currentPageElementCount)
    || options.currentPageElementCount < 0
    || options.currentPageElementCount > STUDIO_WILL_V1_IMPORT_MAX_ELEMENTS_PER_PAGE
  ) {
    throw new StudioWillV1ImportError("elementCountMismatch");
  }
  if (
    options.destination === "current-page"
    && options.currentPageElementCount + pending.drafts.length
      > STUDIO_WILL_V1_IMPORT_MAX_ELEMENTS_PER_PAGE
  ) {
    throw new StudioWillV1ImportError("elementLimitExceeded", { max: STUDIO_WILL_V1_IMPORT_MAX_ELEMENTS_PER_PAGE.toLocaleString("ko-KR") });
  }
  const reserved = new Set(options.existingElementIds);
  const elements = pending.drafts.map((draft): DrawEl => ({
    ...draft.element,
    points: [...draft.element.points],
    pressures: draft.element.pressures ? [...draft.element.pressures] : undefined,
    id: allocateStableId(draft.stableIdBase, reserved),
  }));
  const changeCount = pending.adaptations.reduce((total, item) => total + item.count, 0);
  const warningCount = changeCount + pending.skipped.length;
  return Object.freeze({
    elements: Object.freeze(elements),
    pageHeight: pending.pageHeight,
    title: safePageTitle(pending.result, pending.fileName),
    status: Object.freeze({
      tone: warningCount > 0 ? "warn" : "good",
      text: resolveStudioWillImportCommitStatus({
        count: elements.length.toLocaleString("ko-KR"),
        destination: options.destination,
        ...(warningCount > 0 ? { warningCount: warningCount.toLocaleString("ko-KR") } : {}),
      }),
    }),
  });
}
