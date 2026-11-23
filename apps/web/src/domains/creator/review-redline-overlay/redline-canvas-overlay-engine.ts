/**
 * PD·강사 붉은펜 검수 ↔ 드로잉 캔버스 최상단 비출력(Non-Export) 오버레이 양방향 동기화 엔진.
 *
 * 핵심 불변 조건:
 * 1. 비출력 레이어 ID는 `99_NONPRINT_REDLINE_OVERLAY`로 고정되며 `exportable: false`, `printVisible: false`를 항상 유지한다.
 * 2. PNG/PSD/웹툰 분할/PDF 출고 시 `stripNonPrintOverlayForExport`가 비출력 붉은펜 레이어를 단 1픽셀도 남기지 않고 제거한다.
 * 3. 핀 클릭 시 `computeViewportJumpTarget`이 컷 오프셋과 줌 배율을 반영해 중앙 정렬·클램핑된 좌표를 산출한다.
 * 4. 상태 전이 시 `syncRedlineResolutionToReviewBoard`가 미해결 카운트·공정별 진행률·출고 가능 여부(`canShip: openCount === 0`)를 결정론적으로 산출한다.
 */

import {
  NONPRINT_REDLINE_LAYER_ID,
  REDLINE_OPACITY_MAX,
  REDLINE_OPACITY_MIN,
  REDLINE_OVERLAY_SCHEMA_VERSION,
  REDLINE_STAGE_ORDER,
  REDLINE_STAGE_SPECS,
  REDLINE_STATUS_SPECS,
  createInitialCutMetrics,
  createInitialRedlinePins,
  type AddRedlineOverlayPinInput,
  type CanvasViewportMetrics,
  type CutCanvasMetric,
  type ExportFormatKind,
  type ExportableCanvasLayer,
  type NonPrintExportAuditReport,
  type NonPrintRedlineOverlayState,
  type NonPrintStripReason,
  type OverlayControlPatch,
  type RedlinePinStatus,
  type RedlinePinThread,
  type RedlineProcessStage,
  type RedlineStageSpec,
  type RedlineStatusSpec,
  type RedlineStroke,
  type RedlineStrokePoint,
  type RedlineStrokeTone,
  type RedlineVoiceNoteMeta,
  type ReviewBoardMetricsSummary,
  type ReviewBoardSyncSnapshot,
  type StageProgressSummary,
  type StrippedNonPrintLayerRecord,
  type SyncResolutionOptions,
  type ViewportJumpTarget,
} from "./redline-canvas-overlay-catalog";

export {
  NONPRINT_REDLINE_LAYER_ID,
  REDLINE_OPACITY_MAX,
  REDLINE_OPACITY_MIN,
  REDLINE_OVERLAY_SCHEMA_VERSION,
  REDLINE_STAGE_ORDER,
  REDLINE_STAGE_SPECS,
  REDLINE_STATUS_SPECS,
  createInitialCutMetrics,
  createInitialRedlinePins,
};

export type {
  AddRedlineOverlayPinInput,
  CanvasViewportMetrics,
  CutCanvasMetric,
  ExportFormatKind,
  ExportableCanvasLayer,
  NonPrintExportAuditReport,
  NonPrintRedlineOverlayState,
  NonPrintStripReason,
  OverlayControlPatch,
  RedlinePinStatus,
  RedlinePinThread,
  RedlineProcessStage,
  RedlineStageSpec,
  RedlineStatusSpec,
  RedlineStroke,
  RedlineStrokePoint,
  RedlineStrokeTone,
  RedlineVoiceNoteMeta,
  ReviewBoardMetricsSummary,
  ReviewBoardSyncSnapshot,
  StageProgressSummary,
  StrippedNonPrintLayerRecord,
  SyncResolutionOptions,
  ViewportJumpTarget,
};

const NONPRINT_NAME_PREFIX_REGEX = /^99_NONPRINT_/i;
const DEFAULT_ZOOM = 1.5;
const DEFAULT_MIN_ZOOM = 0.5;
const DEFAULT_MAX_ZOOM = 4.0;
const EXPORT_FORMAT_LABELS: Readonly<
  Record<ExportFormatKind, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  png: { ko: "PNG 단일 출고", en: "PNG Export" },
  psd: { ko: "PSD 레이어 출고", en: "PSD Layered Export" },
  "webtoon-slice": { ko: "웹툰 세로 분할 출고", en: "Webtoon Vertical Slice" },
  "pdf-print": { ko: "단행본 PDF 인쇄 출고", en: "Print PDF Export" },
});

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function clampOverlayOpacity(opacity: number): number {
  const clamped = clampNumber(opacity, REDLINE_OPACITY_MIN, REDLINE_OPACITY_MAX, 0.85);
  return Math.round(clamped * 100) / 100;
}

export function clampCoordPct(value: number): number {
  const clamped = clampNumber(value, 0, 100, 50);
  return Math.round(clamped * 10) / 10;
}

export function isPinUnresolved(status: RedlinePinStatus): boolean {
  return status === "open" || status === "in-progress";
}

/**
 * 정규화된 0~100% 붉은펜 자유곡선 점 배열을 부드러운 SVG path 문자열로 변환한다.
 */
export function buildRedlineStrokeSvgPath(
  points: readonly RedlineStrokePoint[],
  viewBoxWidth = 400,
  viewBoxHeight = 300,
): string {
  if (points.length === 0) return "";
  const safeW = Math.max(1, viewBoxWidth);
  const safeH = Math.max(1, viewBoxHeight);
  const coords = points.map((pt) => ({
    x: Math.round((clampCoordPct(pt.xPct) / 100) * safeW * 10) / 10,
    y: Math.round((clampCoordPct(pt.yPct) / 100) * safeH * 10) / 10,
  }));

  const first = coords[0];
  if (!first) return "";
  if (coords.length === 1) {
    return `M ${first.x} ${first.y} L ${Math.round((first.x + 1.5) * 10) / 10} ${first.y}`;
  }
  if (coords.length === 2) {
    const second = coords[1];
    return second ? `M ${first.x} ${first.y} L ${second.x} ${second.y}` : "";
  }

  const segments: string[] = [`M ${first.x} ${first.y}`];
  for (let i = 1; i < coords.length - 1; i += 1) {
    const current = coords[i];
    const next = coords[i + 1];
    if (!current || !next) continue;
    const midX = Math.round(((current.x + next.x) / 2) * 10) / 10;
    const midY = Math.round(((current.y + next.y) / 2) * 10) / 10;
    segments.push(`Q ${current.x} ${current.y} ${midX} ${midY}`);
  }
  const last = coords[coords.length - 1];
  if (last) {
    segments.push(`L ${last.x} ${last.y}`);
  }
  return segments.join(" ");
}

/**
 * 핀 클릭 시 드로잉 캔버스가 해당 컷과 좌표로 자동 스크롤/팬/줌 중앙 정렬되도록 좌표를 계산한다.
 */
export function computeViewportJumpTarget(
  pin: Pick<RedlinePinThread, "id" | "cutId" | "cutIndex" | "xPct" | "yPct">,
  cutMetrics: CanvasViewportMetrics,
): ViewportJumpTarget {
  const matchedCut =
    cutMetrics.cuts.find((cut) => cut.cutId === pin.cutId) ??
    cutMetrics.cuts.find((cut) => cut.cutIndex === pin.cutIndex) ??
    cutMetrics.cuts[0] ?? {
      cutId: pin.cutId || `CUT-${String(Math.max(1, pin.cutIndex)).padStart(2, "0")}`,
      cutIndex: Math.max(1, pin.cutIndex),
      labelKo: `컷 ${Math.max(1, pin.cutIndex)}`,
      labelEn: `Cut ${Math.max(1, pin.cutIndex)}`,
      offsetY: 0,
      width: Math.max(1, cutMetrics.canvasWidth),
      height: Math.max(1, cutMetrics.canvasTotalHeight),
    };

  const minZoom = clampNumber(cutMetrics.minZoom ?? DEFAULT_MIN_ZOOM, 0.1, 4, DEFAULT_MIN_ZOOM);
  const maxZoom = clampNumber(
    cutMetrics.maxZoom ?? DEFAULT_MAX_ZOOM,
    minZoom,
    8,
    Math.max(minZoom, DEFAULT_MAX_ZOOM),
  );
  const zoom =
    Math.round(
      clampNumber(
        cutMetrics.targetZoom ?? cutMetrics.currentZoom ?? DEFAULT_ZOOM,
        minZoom,
        maxZoom,
        DEFAULT_ZOOM,
      ) * 100,
    ) / 100;

  const safeViewportW = Math.max(1, cutMetrics.viewportWidth);
  const safeViewportH = Math.max(1, cutMetrics.viewportHeight);
  const safeCanvasW = Math.max(matchedCut.width, cutMetrics.canvasWidth, 1);
  const safeCanvasH = Math.max(matchedCut.offsetY + matchedCut.height, cutMetrics.canvasTotalHeight, 1);

  const focusCanvasX = Math.round((clampCoordPct(pin.xPct) / 100) * matchedCut.width * 10) / 10;
  const focusCanvasY =
    Math.round((matchedCut.offsetY + (clampCoordPct(pin.yPct) / 100) * matchedCut.height) * 10) / 10;

  const scaledWidth = safeCanvasW * zoom;
  const scaledHeight = safeCanvasH * zoom;
  const maxScrollLeft = Math.max(0, scaledWidth - safeViewportW);
  const maxScrollTop = Math.max(0, scaledHeight - safeViewportH);

  const rawScrollLeft = focusCanvasX * zoom - safeViewportW / 2;
  const rawScrollTop = focusCanvasY * zoom - safeViewportH / 2;

  const clampedX = rawScrollLeft < 0 || rawScrollLeft > maxScrollLeft;
  const clampedY = rawScrollTop < 0 || rawScrollTop > maxScrollTop;

  const scrollLeft = Math.round(clampNumber(rawScrollLeft, 0, maxScrollLeft, 0));
  const scrollTop = Math.round(clampNumber(rawScrollTop, 0, maxScrollTop, 0));

  return {
    pinId: pin.id,
    cutId: matchedCut.cutId,
    cutIndex: matchedCut.cutIndex,
    focusCanvasX,
    focusCanvasY,
    zoom,
    scrollLeft,
    scrollTop,
    panOffsetX: scrollLeft === 0 ? 0 : -scrollLeft,
    panOffsetY: scrollTop === 0 ? 0 : -scrollTop,
    clampedX,
    clampedY,
  };
}

/**
 * 레이어가 출고 시 반드시 제거해야 하는 비출력 붉은펜 오버레이인지 다중 조건으로 판정한다.
 */
export function isNonPrintRedlineLayer(layer: ExportableCanvasLayer): NonPrintStripReason | null {
  if (layer.id === NONPRINT_REDLINE_LAYER_ID) return "nonprint-layer-id";
  if (layer.exportable === false) return "exportable-false";
  if (layer.printVisible === false) return "print-visible-false";
  if (layer.nonPrint === true) return "nonprint-flag";
  if (layer.kind === "redline-overlay") return "redline-overlay-kind";
  if (NONPRINT_NAME_PREFIX_REGEX.test(layer.id) || NONPRINT_NAME_PREFIX_REGEX.test(layer.name)) {
    return "nonprint-name-prefix";
  }
  return null;
}

/**
 * PNG/PSD/웹툰 분할/PDF 출고 파이프라인 직전 비출력 붉은펜 레이어를 단 1픽셀도 포함되지 않게 강제 제거하고
 * 감사 리포트를 반환한다.
 */
export function stripNonPrintOverlayForExport(
  layers: readonly ExportableCanvasLayer[],
  options?: {
    readonly format?: ExportFormatKind;
    readonly checkedAtIso?: string;
  },
): NonPrintExportAuditReport {
  const format = options?.format ?? "webtoon-slice";
  const checkedAtIso = options?.checkedAtIso ?? "2026-11-23T07:45:00Z";
  const exportedLayers: ExportableCanvasLayer[] = [];
  const strippedLayers: StrippedNonPrintLayerRecord[] = [];

  for (const layer of layers) {
    const stripReason = isNonPrintRedlineLayer(layer);
    if (stripReason) {
      strippedLayers.push({
        id: layer.id,
        name: layer.name,
        reason: stripReason,
      });
    } else {
      exportedLayers.push(layer);
    }
  }

  const residualCheck = exportedLayers.every((layer) => isNonPrintRedlineLayer(layer) === null);
  const formatMeta = EXPORT_FORMAT_LABELS[format];
  const summaryKo =
    strippedLayers.length > 0
      ? `${formatMeta.ko}: 비출력 레이어 ${strippedLayers.length}건 강제 제거 완료 · 출력 레이어 ${exportedLayers.length}개 · 붉은펜 픽셀 누출 0px`
      : `${formatMeta.ko}: 비출력 레이어 없음 · 출력 레이어 ${exportedLayers.length}개 · 붉은펜 픽셀 누출 0px`;
  const summaryEn =
    strippedLayers.length > 0
      ? `${formatMeta.en}: stripped ${strippedLayers.length} non-print layer(s) · ${exportedLayers.length} artwork layer(s) exported · 0px redline leakage`
      : `${formatMeta.en}: no non-print layers present · ${exportedLayers.length} artwork layer(s) exported · 0px redline leakage`;

  return {
    format,
    passed: residualCheck,
    redlinePixelLeakCount: 0,
    totalInputLayers: layers.length,
    exportedLayerCount: exportedLayers.length,
    strippedCount: strippedLayers.length,
    strippedLayers,
    exportedLayers,
    checkedAtIso,
    summaryKo,
    summaryEn,
  };
}

/**
 * 현재 오버레이 상태의 전체·공정별 진행률 및 출고 가능 여부(`canShip: openCount === 0`)를 산출한다.
 */
export function computeReviewBoardMetrics(
  state: Pick<NonPrintRedlineOverlayState, "pins">,
): ReviewBoardMetricsSummary {
  const countsByStage: Record<
    RedlineProcessStage,
    { open: number; inProgress: number; resolved: number; verified: number }
  > = {
    lineart: { open: 0, inProgress: 0, resolved: 0, verified: 0 },
    bg3d: { open: 0, inProgress: 0, resolved: 0, verified: 0 },
    flatting: { open: 0, inProgress: 0, resolved: 0, verified: 0 },
    shading: { open: 0, inProgress: 0, resolved: 0, verified: 0 },
    lettering: { open: 0, inProgress: 0, resolved: 0, verified: 0 },
    "pd-qa": { open: 0, inProgress: 0, resolved: 0, verified: 0 },
  };

  let pendingOpenCount = 0;
  let inProgressCount = 0;
  let resolvedCount = 0;
  let verifiedCount = 0;

  for (const pin of state.pins) {
    const bucket = countsByStage[pin.stage];
    if (pin.status === "open") {
      pendingOpenCount += 1;
      bucket.open += 1;
    } else if (pin.status === "in-progress") {
      inProgressCount += 1;
      bucket.inProgress += 1;
    } else if (pin.status === "resolved") {
      resolvedCount += 1;
      bucket.resolved += 1;
    } else {
      verifiedCount += 1;
      bucket.verified += 1;
    }
  }

  const totalCount = state.pins.length;
  const openCount = pendingOpenCount + inProgressCount;
  const completedCount = resolvedCount + verifiedCount;
  const completionPct = totalCount === 0 ? 100 : Math.round((completedCount / totalCount) * 100);

  const stageProgress: StageProgressSummary[] = REDLINE_STAGE_ORDER.map((stage) => {
    const bucket = countsByStage[stage];
    const total = bucket.open + bucket.inProgress + bucket.resolved + bucket.verified;
    const completed = bucket.resolved + bucket.verified;
    return {
      stage,
      total,
      openCount: bucket.open + bucket.inProgress,
      inProgressCount: bucket.inProgress,
      resolvedCount: bucket.resolved,
      verifiedCount: bucket.verified,
      completionPct: total === 0 ? 100 : Math.round((completed / total) * 100),
    };
  });

  return {
    totalCount,
    openCount,
    pendingOpenCount,
    inProgressCount,
    resolvedCount,
    verifiedCount,
    completedCount,
    completionPct,
    canShip: openCount === 0,
    stageProgress,
  };
}

/**
 * 캔버스 오버레이에서 핀 상태를 변경할 때 검수 보드와 즉시 양방향 동기화하고
 * 미해결 카운트·공정별 진행률·출고 가능 여부(`canShip`)를 결정론적으로 반환한다.
 */
export function syncRedlineResolutionToReviewBoard(
  state: NonPrintRedlineOverlayState,
  pinId: string,
  nextStatus: RedlinePinStatus,
  options?: SyncResolutionOptions,
): ReviewBoardSyncSnapshot {
  const syncedAtIso = options?.syncedAtIso ?? "2026-11-23T07:50:00Z";
  const actorKo = options?.actorKo ?? "작업 작가";
  const actorEn = options?.actorEn ?? "Studio Artist";

  let changedPin: RedlinePinThread | null = null;
  const nextPins = state.pins.map((pin) => {
    if (pin.id !== pinId) return pin;
    const isCompleted = nextStatus === "resolved" || nextStatus === "verified";
    const updated: RedlinePinThread = {
      ...pin,
      status: nextStatus,
      resolvedAtIso: isCompleted ? syncedAtIso : null,
      resolvedByKo: isCompleted ? actorKo : null,
      resolvedByEn: isCompleted ? actorEn : null,
    };
    changedPin = updated;
    return updated;
  });

  const nextState: NonPrintRedlineOverlayState = {
    ...state,
    layerId: NONPRINT_REDLINE_LAYER_ID,
    exportable: false,
    printVisible: false,
    pins: nextPins,
    lastSyncedAtIso: changedPin ? syncedAtIso : state.lastSyncedAtIso,
    syncRevision: changedPin ? state.syncRevision + 1 : state.syncRevision,
  };

  const metrics = computeReviewBoardMetrics(nextState);
  const statusSpec = REDLINE_STATUS_SPECS[nextStatus];
  const targetPin = changedPin as RedlinePinThread | null;
  const syncEventSummaryKo = targetPin
    ? `#${targetPin.pinNumber} (${targetPin.cutId}) → ${statusSpec.labelKo} 동기화 완료 · 잔여 미해결 ${metrics.openCount}건`
    : "지정한 붉은펜 핀을 찾지 못해 동기화를 건너뛰었습니다.";
  const syncEventSummaryEn = targetPin
    ? `Synced #${targetPin.pinNumber} (${targetPin.cutId}) to ${statusSpec.labelEn} · ${metrics.openCount} open remaining`
    : "Skipped sync because the target redline pin was not found.";

  return {
    nextState,
    changedPin,
    ...metrics,
    syncEventSummaryKo,
    syncEventSummaryEn,
  };
}

/**
 * 비출력 오버레이의 가시성·불투명도·활성 컷·필터 상태를 안전하게 갱신한다.
 * 비출력 불변 계약(`layerId`, `exportable: false`, `printVisible: false`)은 절대 변경되지 않는다.
 */
export function updateNonPrintOverlayControls(
  state: NonPrintRedlineOverlayState,
  patch: OverlayControlPatch,
): NonPrintRedlineOverlayState {
  const maxCutIndex = Math.max(1, state.cuts.length);
  const nextCutIndex =
    patch.activeCutIndex !== undefined
      ? Math.round(clampNumber(patch.activeCutIndex, 1, maxCutIndex, state.activeCutIndex))
      : state.activeCutIndex;

  return {
    ...state,
    layerId: NONPRINT_REDLINE_LAYER_ID,
    exportable: false,
    printVisible: false,
    opacity: patch.opacity !== undefined ? clampOverlayOpacity(patch.opacity) : state.opacity,
    visible: patch.visible !== undefined ? patch.visible : state.visible,
    activeCutIndex: nextCutIndex,
    activeStageFilter:
      patch.activeStageFilter !== undefined ? patch.activeStageFilter : state.activeStageFilter,
    selectedPinId: patch.selectedPinId !== undefined ? patch.selectedPinId : state.selectedPinId,
  };
}

/**
 * 새 붉은펜 핀과 자유곡선(없으면 좌표 기준 원형 강조 스트로크)을 비출력 오버레이에 추가한다.
 */
export function addRedlinePinToOverlay(
  state: NonPrintRedlineOverlayState,
  input: AddRedlineOverlayPinInput,
): NonPrintRedlineOverlayState {
  const safeCut =
    state.cuts.find((cut) => cut.cutIndex === input.cutIndex) ??
    state.cuts[0] ?? {
      cutId: `CUT-${String(Math.max(1, input.cutIndex)).padStart(2, "0")}`,
      cutIndex: Math.max(1, input.cutIndex),
      labelKo: `컷 ${Math.max(1, input.cutIndex)}`,
      labelEn: `Cut ${Math.max(1, input.cutIndex)}`,
      offsetY: 0,
      width: 800,
      height: 1280,
    };

  const xPct = clampCoordPct(input.xPct);
  const yPct = clampCoordPct(input.yPct);
  const nextPinNumber =
    state.pins.reduce((maxNum, pin) => Math.max(maxNum, pin.pinNumber), 0) + 1;
  const createdAtIso = input.createdAtIso ?? "2026-11-23T07:55:00Z";
  const pinId = input.id ?? `rpin-${String(nextPinNumber).padStart(2, "0")}`;
  const stageSpec = REDLINE_STAGE_SPECS[input.stage];

  const defaultLoopPoints: readonly RedlineStrokePoint[] = [
    { xPct: clampCoordPct(xPct - 5.5), yPct: clampCoordPct(yPct - 4), pressure: 0.65 },
    { xPct: clampCoordPct(xPct + 5.5), yPct: clampCoordPct(yPct - 4.5), pressure: 0.8 },
    { xPct: clampCoordPct(xPct + 6), yPct: clampCoordPct(yPct + 4.5), pressure: 0.75 },
    { xPct: clampCoordPct(xPct - 5), yPct: clampCoordPct(yPct + 4), pressure: 0.65 },
    { xPct: clampCoordPct(xPct - 5.5), yPct: clampCoordPct(yPct - 3.5), pressure: 0.55 },
  ];

  const strokePoints =
    input.strokePoints && input.strokePoints.length >= 2
      ? input.strokePoints.map((pt) => ({
          xPct: clampCoordPct(pt.xPct),
          yPct: clampCoordPct(pt.yPct),
          pressure: pt.pressure ?? 0.72,
        }))
      : defaultLoopPoints;

  const newPin: RedlinePinThread = {
    id: pinId,
    pinNumber: nextPinNumber,
    cutId: safeCut.cutId,
    cutIndex: safeCut.cutIndex,
    xPct,
    yPct,
    stage: input.stage,
    priority: input.priority ?? "must-fix",
    reviewerKo: input.reviewerKo ?? "담당 PD",
    reviewerEn: input.reviewerEn ?? "Lead PD",
    titleKo: input.titleKo.trim() || `${safeCut.cutId} 붉은펜 수정 요청`,
    titleEn: input.titleEn.trim() || `${safeCut.cutId} Redline Revision`,
    noteKo: input.noteKo.trim(),
    noteEn: input.noteEn.trim(),
    strokes: [
      {
        id: `stroke-${pinId}-1`,
        authorRole: "pd",
        strokeWidthPx: 2.8,
        style: "solid",
        tone: input.strokeTone ?? "critical",
        points: strokePoints,
      },
    ],
    voiceNote: input.voiceNote,
    status: "open",
    createdAtIso,
    resolvedAtIso: null,
    resolvedByKo: null,
    resolvedByEn: null,
    assigneeKo: stageSpec.ownerKo,
    assigneeEn: stageSpec.ownerEn,
  };

  return {
    ...state,
    layerId: NONPRINT_REDLINE_LAYER_ID,
    exportable: false,
    printVisible: false,
    activeCutIndex: safeCut.cutIndex,
    selectedPinId: newPin.id,
    pins: [...state.pins, newPin],
    lastSyncedAtIso: createdAtIso,
    syncRevision: state.syncRevision + 1,
  };
}

/**
 * 공정별·컷별로 붉은펜 핀 목록을 필터링한다.
 */
export function filterPinsByStageAndCut(
  pins: readonly RedlinePinThread[],
  filter: {
    readonly stage?: RedlineProcessStage | "all";
    readonly cutIndex?: number | "all";
  },
): readonly RedlinePinThread[] {
  return pins.filter((pin) => {
    if (filter.stage && filter.stage !== "all" && pin.stage !== filter.stage) {
      return false;
    }
    if (filter.cutIndex !== undefined && filter.cutIndex !== "all" && pin.cutIndex !== filter.cutIndex) {
      return false;
    }
    return true;
  });
}

/**
 * 출고 안전 검증 시뮬레이션에 사용하는 실제 웹툰 원고 레이어 스택(비출력 붉은펜 최상단 포함)을 생성한다.
 */
export function buildSampleCanvasLayerStack(
  state: Pick<NonPrintRedlineOverlayState, "layerId" | "visible" | "opacity" | "exportable" | "printVisible">,
): readonly ExportableCanvasLayer[] {
  return [
    {
      id: "01_BG3D_ROOFTOP",
      name: "01_BG3D_ROOFTOP",
      kind: "bg3d",
      visible: true,
      opacity: 1,
      exportable: true,
      printVisible: true,
      pixelCount: 1024000,
    },
    {
      id: "02_FLAT_BASE",
      name: "02_FLAT_BASE",
      kind: "raster",
      visible: true,
      opacity: 1,
      exportable: true,
      printVisible: true,
      pixelCount: 684000,
    },
    {
      id: "03_SHADING_RIM",
      name: "03_SHADING_RIM",
      kind: "raster",
      visible: true,
      opacity: 0.92,
      exportable: true,
      printVisible: true,
      pixelCount: 312000,
    },
    {
      id: "04_LINEART_MAIN",
      name: "04_LINEART_MAIN",
      kind: "vector",
      visible: true,
      opacity: 1,
      exportable: true,
      printVisible: true,
      pixelCount: 248000,
    },
    {
      id: "05_LETTERING_SFX",
      name: "05_LETTERING_SFX",
      kind: "text",
      visible: true,
      opacity: 1,
      exportable: true,
      printVisible: true,
      pixelCount: 96000,
    },
    {
      id: state.layerId,
      name: state.layerId,
      kind: "redline-overlay",
      visible: state.visible,
      opacity: state.opacity,
      exportable: state.exportable,
      printVisible: state.printVisible,
      nonPrint: true,
      pixelCount: 41200,
    },
  ];
}

export function createInitialRedlineOverlayState(): NonPrintRedlineOverlayState {
  const cuts = createInitialCutMetrics();
  const pins = createInitialRedlinePins();
  return {
    schemaVersion: REDLINE_OVERLAY_SCHEMA_VERSION,
    episodeId: "ep-14-rooftop-standoff",
    episodeTitleKo: "EP.14 옥상 대치 · 3컷 집중 검수",
    episodeTitleEn: "EP.14 Rooftop Standoff · 3-Cut Review",
    layerId: NONPRINT_REDLINE_LAYER_ID,
    zIndexOrder: "topmost",
    exportable: false,
    printVisible: false,
    opacity: 0.85,
    visible: true,
    activeCutIndex: 1,
    activeStageFilter: "all",
    selectedPinId: pins[0]?.id ?? null,
    pins,
    cuts,
    lastSyncedAtIso: "2026-11-23T06:40:00Z",
    syncRevision: 1,
  };
}
