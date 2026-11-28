/**
 * Wave 78 — 듀얼 스크린 동반 아틀리에 세션 컨트롤러.
 *
 * - 데스크톱 호스트와 태블릿 동반 팔레트 간 브러시·도구·색상·대칭·화면 반전 상태 동기화
 * - Calm Atelier 인체공학 불변식 강제: 기본 노출 컨트롤 `5~9`개 예산, 태블릿 터치 히트 영역 `>= 44×44px`
 * - 손바닥 오입력 차단 잠금(`palmRejectionLocked`) 및 일시적 Wi-Fi 단절 시
 *   로컬 스트로크 안전 버퍼링 + 재연결 즉시 순서 보장 자동 복구
 */

import type { PenSample, SwatchRgba, TactileDialEvent } from "./lan-pairing-and-binary-pen-wire";

export const MIN_COMPANION_VISIBLE_CONTROLS = 5;
export const MAX_COMPANION_VISIBLE_CONTROLS = 9;
export const MIN_TABLET_HIT_TARGET_PX = 44;
export const DEFAULT_MAX_RECOVERY_QUEUE_SAMPLES = 4096;

export type CompanionToolId = "pencil" | "ink-pen" | "watercolor" | "oil-impasto" | "airbrush" | "eraser";
export type CompanionSymmetryMode = "off" | "vertical" | "horizontal" | "radial-4";
export type CompanionConnectionStatus = "pairing" | "connected" | "reconnecting" | "disconnected";

export interface CompanionControlSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly hitWidthPx: number;
  readonly hitHeightPx: number;
  readonly placement: "primary" | "disclosure";
  readonly active?: boolean;
}

export interface CompanionUiErgonomicsAudit {
  readonly visiblePrimaryCount: number;
  readonly disclosureCount: number;
  readonly disclosureActiveCount: number;
  readonly minHitTargetPx: number;
  readonly clampedControlIds: readonly string[];
  readonly demotedControlIds: readonly string[];
  readonly compliesWithCalmBudget: boolean;
  readonly compliesWithTouchTarget: boolean;
}

export interface CompanionToolState {
  readonly activeTool: CompanionToolId;
  readonly brushId: string;
  readonly brushSizePx: number;
  readonly opacity: number;
  readonly color: SwatchRgba;
  readonly wetness: number;
  readonly symmetryMode: CompanionSymmetryMode;
  readonly canvasFlipX: boolean;
  readonly canvasFlipY: boolean;
  readonly canvasRotationDeg: number;
  readonly undoStepOffset: number;
  readonly stateRevision: number;
}

export interface CompanionTouchEvent {
  readonly pointerType: "pen" | "touch" | "mouse";
  readonly surfaceRegion: "canvas" | "control-rail";
  readonly contactAreaMm2: number;
  readonly isStylusHoveringOrDown: boolean;
}

export interface CompanionTouchDecision {
  readonly accepted: boolean;
  readonly reason: string;
}

export interface CompanionStrokeQueueResult {
  readonly disposition: "sent-live" | "buffered-offline" | "dropped-queue-overflow";
  readonly pendingQueueLength: number;
  readonly sample: PenSample;
}

export interface CompanionReconnectRecoveryResult {
  readonly restoredFromStatus: CompanionConnectionStatus;
  readonly reconnectedAtMs: number;
  readonly flushedSamples: readonly PenSample[];
  readonly remainingQueueLength: number;
  readonly syncedStateRevision: number;
}

export interface CompanionRecoverySnapshot {
  readonly sessionId: string;
  readonly capturedAtMs: number;
  readonly connectionStatus: CompanionConnectionStatus;
  readonly toolState: CompanionToolState;
  readonly pendingStrokes: readonly PenSample[];
}

export interface CompanionAtelierSessionState {
  readonly sessionId: string;
  readonly hostDeviceId: string;
  readonly tabletDeviceId: string;
  readonly connectionStatus: CompanionConnectionStatus;
  readonly palmRejectionLocked: boolean;
  readonly prefersReducedMotion: boolean;
  readonly toolState: CompanionToolState;
  readonly primaryControls: readonly CompanionControlSpec[];
  readonly disclosureControls: readonly CompanionControlSpec[];
  readonly pendingStrokeCount: number;
  readonly disconnectCount: number;
  readonly lastDisconnectReason: string | null;
  readonly lastSyncedAtMs: number;
}

export interface CompanionAtelierSessionOptions {
  readonly sessionId: string;
  readonly hostDeviceId: string;
  readonly tabletDeviceId: string;
  readonly initialConnected?: boolean;
  readonly nowMs?: number;
  readonly palmRejectionLocked?: boolean;
  readonly prefersReducedMotion?: boolean;
  readonly maxPendingStrokeSamples?: number;
  readonly initialControls?: readonly CompanionControlSpec[];
  readonly initialToolState?: Partial<CompanionToolState>;
}

export interface CompanionAtelierSessionController {
  getState(): CompanionAtelierSessionState;
  getUiAudit(): CompanionUiErgonomicsAudit;
  configureControls(controls: readonly CompanionControlSpec[]): CompanionUiErgonomicsAudit;
  setPalmRejectionLocked(locked: boolean): void;
  setPrefersReducedMotion(enabled: boolean): void;
  evaluateTouchInput(input: CompanionTouchEvent): CompanionTouchDecision;
  applyLocalToolUpdate(patch: Partial<Omit<CompanionToolState, "stateRevision">>, nowMs: number): CompanionToolState;
  syncStateFromHost(hostState: CompanionToolState, nowMs: number): { readonly applied: boolean; readonly state: CompanionToolState };
  applyTactileDialEvent(event: TactileDialEvent, nowMs: number): CompanionToolState;
  queueStrokeSample(sample: PenSample): CompanionStrokeQueueResult;
  handleDisconnect(reason: string, nowMs: number): CompanionAtelierSessionState;
  handleReconnect(nowMs: number): CompanionReconnectRecoveryResult;
  exportRecoverySnapshot(nowMs: number): CompanionRecoverySnapshot;
}

const DEFAULT_PRIMARY_CONTROLS: readonly CompanionControlSpec[] = [
  { id: "brush-size-dial", labelKo: "브러시 크기", hitWidthPx: 52, hitHeightPx: 52, placement: "primary", active: true },
  { id: "opacity-dial", labelKo: "불투명도", hitWidthPx: 52, hitHeightPx: 52, placement: "primary", active: false },
  { id: "wet-color-swatch", labelKo: "혼색 팔레트", hitWidthPx: 48, hitHeightPx: 48, placement: "primary", active: false },
  { id: "symmetry-toggle", labelKo: "좌우 대칭", hitWidthPx: 48, hitHeightPx: 48, placement: "primary", active: false },
  { id: "canvas-flip-toggle", labelKo: "화면 반전", hitWidthPx: 48, hitHeightPx: 48, placement: "primary", active: false },
  { id: "undo-scrub", labelKo: "되돌리기", hitWidthPx: 48, hitHeightPx: 48, placement: "primary", active: false },
  { id: "palm-lock-toggle", labelKo: "손바닥 차단", hitWidthPx: 48, hitHeightPx: 48, placement: "primary", active: true },
];

const DEFAULT_DISCLOSURE_CONTROLS: readonly CompanionControlSpec[] = [
  { id: "canvas-rotation-lock", labelKo: "회전 잠금", hitWidthPx: 44, hitHeightPx: 44, placement: "disclosure", active: false },
  { id: "tilt-curve-preset", labelKo: "기울기 감도", hitWidthPx: 44, hitHeightPx: 44, placement: "disclosure", active: false },
  { id: "prediction-override", labelKo: "예측 보정 끄기", hitWidthPx: 44, hitHeightPx: 44, placement: "disclosure", active: false },
];

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function normalizeRotationDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = ((deg + 180) % 360 + 360) % 360 - 180;
  return wrapped === 180 ? -180 : wrapped;
}

function sanitizeColor(rgba: SwatchRgba): SwatchRgba {
  return {
    r: Math.round(clampNum(rgba.r, 0, 255)),
    g: Math.round(clampNum(rgba.g, 0, 255)),
    b: Math.round(clampNum(rgba.b, 0, 255)),
    a: Math.round(clampNum(rgba.a, 0, 255)),
  };
}

function sanitizeControlLayout(rawControls: readonly CompanionControlSpec[]): {
  readonly primary: CompanionControlSpec[];
  readonly disclosure: CompanionControlSpec[];
  readonly audit: CompanionUiErgonomicsAudit;
} {
  const clampedControlIds: string[] = [];
  const demotedControlIds: string[] = [];
  const primary: CompanionControlSpec[] = [];
  const disclosure: CompanionControlSpec[] = [];
  const seenIds = new Set<string>();

  for (const ctrl of rawControls) {
    if (seenIds.has(ctrl.id)) continue;
    seenIds.add(ctrl.id);
    const hitWidthPx = Math.max(MIN_TABLET_HIT_TARGET_PX, Math.round(ctrl.hitWidthPx));
    const hitHeightPx = Math.max(MIN_TABLET_HIT_TARGET_PX, Math.round(ctrl.hitHeightPx));
    if (hitWidthPx !== ctrl.hitWidthPx || hitHeightPx !== ctrl.hitHeightPx) clampedControlIds.push(ctrl.id);
    const sanitized: CompanionControlSpec = { id: ctrl.id, labelKo: ctrl.labelKo, hitWidthPx, hitHeightPx, placement: ctrl.placement, active: ctrl.active ?? false };
    if (sanitized.placement === "primary") {
      if (primary.length < MAX_COMPANION_VISIBLE_CONTROLS) primary.push(sanitized);
      else {
        demotedControlIds.push(sanitized.id);
        disclosure.push({ ...sanitized, placement: "disclosure" });
      }
    } else {
      disclosure.push(sanitized);
    }
  }

  for (const fallback of DEFAULT_PRIMARY_CONTROLS) {
    if (primary.length >= MIN_COMPANION_VISIBLE_CONTROLS) break;
    if (!seenIds.has(fallback.id)) {
      seenIds.add(fallback.id);
      primary.push({ ...fallback });
    }
  }

  let minHit = Number.POSITIVE_INFINITY;
  for (const ctrl of [...primary, ...disclosure]) minHit = Math.min(minHit, ctrl.hitWidthPx, ctrl.hitHeightPx);
  const resolvedMinHit = Number.isFinite(minHit) ? minHit : MIN_TABLET_HIT_TARGET_PX;

  return {
    primary,
    disclosure,
    audit: {
      visiblePrimaryCount: primary.length,
      disclosureCount: disclosure.length,
      disclosureActiveCount: disclosure.filter((item) => item.active === true).length,
      minHitTargetPx: resolvedMinHit,
      clampedControlIds,
      demotedControlIds,
      compliesWithCalmBudget: primary.length >= MIN_COMPANION_VISIBLE_CONTROLS && primary.length <= MAX_COMPANION_VISIBLE_CONTROLS,
      compliesWithTouchTarget: resolvedMinHit >= MIN_TABLET_HIT_TARGET_PX,
    },
  };
}

/** 데스크톱·태블릿 상태 동기화·인체공학 예산·손바닥 차단·단절 복구 세션 컨트롤러를 생성한다. */
export function createCompanionAtelierSession(options: CompanionAtelierSessionOptions): CompanionAtelierSessionController {
  const maxPending = Math.max(64, options.maxPendingStrokeSamples ?? DEFAULT_MAX_RECOVERY_QUEUE_SAMPLES);
  let connectionStatus: CompanionConnectionStatus = options.initialConnected === true ? "connected" : "pairing";
  let palmRejectionLocked = options.palmRejectionLocked ?? true;
  let prefersReducedMotion = options.prefersReducedMotion ?? false;
  let disconnectCount = 0;
  let lastDisconnectReason: string | null = null;
  let lastSyncedAtMs = options.nowMs ?? 0;

  let toolState: CompanionToolState = {
    activeTool: options.initialToolState?.activeTool ?? "ink-pen",
    brushId: options.initialToolState?.brushId ?? "atelier-gpen-01",
    brushSizePx: clampNum(options.initialToolState?.brushSizePx ?? 14, 1, 512),
    opacity: clampNum(options.initialToolState?.opacity ?? 1, 0, 1),
    color: sanitizeColor(options.initialToolState?.color ?? { r: 31, g: 68, b: 53, a: 255 }),
    wetness: clampNum(options.initialToolState?.wetness ?? 0.25, 0, 1),
    symmetryMode: options.initialToolState?.symmetryMode ?? "off",
    canvasFlipX: options.initialToolState?.canvasFlipX ?? false,
    canvasFlipY: options.initialToolState?.canvasFlipY ?? false,
    canvasRotationDeg: normalizeRotationDeg(options.initialToolState?.canvasRotationDeg ?? 0),
    undoStepOffset: Math.round(options.initialToolState?.undoStepOffset ?? 0),
    stateRevision: Math.max(1, Math.round(options.initialToolState?.stateRevision ?? 1)),
  };

  let layout = sanitizeControlLayout(options.initialControls ?? [...DEFAULT_PRIMARY_CONTROLS, ...DEFAULT_DISCLOSURE_CONTROLS]);
  const pendingStrokeQueue: PenSample[] = [];

  function applyToolPatch(patch: Partial<Omit<CompanionToolState, "stateRevision">>, nowMs: number): CompanionToolState {
    toolState = {
      activeTool: patch.activeTool ?? toolState.activeTool,
      brushId: patch.brushId ?? toolState.brushId,
      brushSizePx: patch.brushSizePx !== undefined ? clampNum(patch.brushSizePx, 1, 512) : toolState.brushSizePx,
      opacity: patch.opacity !== undefined ? clampNum(patch.opacity, 0, 1) : toolState.opacity,
      color: patch.color !== undefined ? sanitizeColor(patch.color) : toolState.color,
      wetness: patch.wetness !== undefined ? clampNum(patch.wetness, 0, 1) : toolState.wetness,
      symmetryMode: patch.symmetryMode ?? toolState.symmetryMode,
      canvasFlipX: patch.canvasFlipX ?? toolState.canvasFlipX,
      canvasFlipY: patch.canvasFlipY ?? toolState.canvasFlipY,
      canvasRotationDeg: patch.canvasRotationDeg !== undefined ? normalizeRotationDeg(patch.canvasRotationDeg) : toolState.canvasRotationDeg,
      undoStepOffset: patch.undoStepOffset !== undefined ? Math.round(patch.undoStepOffset) : toolState.undoStepOffset,
      stateRevision: toolState.stateRevision + 1,
    };
    lastSyncedAtMs = nowMs;
    return toolState;
  }

  return {
    getState(): CompanionAtelierSessionState {
      return {
        sessionId: options.sessionId,
        hostDeviceId: options.hostDeviceId,
        tabletDeviceId: options.tabletDeviceId,
        connectionStatus,
        palmRejectionLocked,
        prefersReducedMotion,
        toolState,
        primaryControls: layout.primary,
        disclosureControls: layout.disclosure,
        pendingStrokeCount: pendingStrokeQueue.length,
        disconnectCount,
        lastDisconnectReason,
        lastSyncedAtMs,
      };
    },
    getUiAudit(): CompanionUiErgonomicsAudit {
      return layout.audit;
    },
    configureControls(controls: readonly CompanionControlSpec[]): CompanionUiErgonomicsAudit {
      layout = sanitizeControlLayout(controls);
      return layout.audit;
    },
    setPalmRejectionLocked(locked: boolean): void {
      palmRejectionLocked = locked;
    },
    setPrefersReducedMotion(enabled: boolean): void {
      prefersReducedMotion = enabled;
    },
    evaluateTouchInput(input: CompanionTouchEvent): CompanionTouchDecision {
      if (input.pointerType === "pen") return { accepted: true, reason: "스타일러스 펜 입력을 허용합니다." };
      if (input.surfaceRegion === "control-rail") {
        return input.contactAreaMm2 > 450
          ? { accepted: false, reason: "손바닥 면적에 해당하는 광역 접촉은 팔레트 오작동 방지를 위해 무시합니다." }
          : { accepted: true, reason: "44px 이상 컨트롤 레일 터치 입력을 허용합니다." };
      }
      if (palmRejectionLocked && input.pointerType === "touch") {
        return { accepted: false, reason: "손바닥 차단 잠금이 켜져 있어 캔버스 영역의 손가락·손바닥 터치를 차단했습니다." };
      }
      if (input.isStylusHoveringOrDown && input.pointerType === "touch") {
        return { accepted: false, reason: "스타일러스 사용 중 발생한 보조 터치를 차단했습니다." };
      }
      return { accepted: true, reason: "보조 포인터 입력을 허용합니다." };
    },
    applyLocalToolUpdate(patch: Partial<Omit<CompanionToolState, "stateRevision">>, nowMs: number): CompanionToolState {
      return applyToolPatch(patch, nowMs);
    },
    syncStateFromHost(hostState: CompanionToolState, nowMs: number): { readonly applied: boolean; readonly state: CompanionToolState } {
      if (hostState.stateRevision < toolState.stateRevision) return { applied: false, state: toolState };
      toolState = {
        activeTool: hostState.activeTool,
        brushId: hostState.brushId,
        brushSizePx: clampNum(hostState.brushSizePx, 1, 512),
        opacity: clampNum(hostState.opacity, 0, 1),
        color: sanitizeColor(hostState.color),
        wetness: clampNum(hostState.wetness, 0, 1),
        symmetryMode: hostState.symmetryMode,
        canvasFlipX: hostState.canvasFlipX,
        canvasFlipY: hostState.canvasFlipY,
        canvasRotationDeg: normalizeRotationDeg(hostState.canvasRotationDeg),
        undoStepOffset: Math.round(hostState.undoStepOffset),
        stateRevision: hostState.stateRevision,
      };
      lastSyncedAtMs = nowMs;
      return { applied: true, state: toolState };
    },
    applyTactileDialEvent(event: TactileDialEvent, nowMs: number): CompanionToolState {
      if (event.kind === "brush-size") return applyToolPatch({ brushSizePx: event.normalizedValue }, nowMs);
      if (event.kind === "opacity") return applyToolPatch({ opacity: event.normalizedValue }, nowMs);
      if (event.kind === "canvas-rotation") return applyToolPatch({ canvasRotationDeg: event.normalizedValue }, nowMs);
      if (event.kind === "undo-scrub") return applyToolPatch({ undoStepOffset: toolState.undoStepOffset + event.stepDelta }, nowMs);
      return applyToolPatch({ color: event.swatchRgba ?? toolState.color, wetness: event.wetness ?? toolState.wetness }, nowMs);
    },
    queueStrokeSample(sample: PenSample): CompanionStrokeQueueResult {
      if (connectionStatus === "connected" && pendingStrokeQueue.length === 0) {
        return { disposition: "sent-live", pendingQueueLength: 0, sample };
      }
      if (pendingStrokeQueue.length >= maxPending) {
        return { disposition: "dropped-queue-overflow", pendingQueueLength: pendingStrokeQueue.length, sample };
      }
      pendingStrokeQueue.push(sample);
      return { disposition: "buffered-offline", pendingQueueLength: pendingStrokeQueue.length, sample };
    },
    handleDisconnect(reason: string, nowMs: number): CompanionAtelierSessionState {
      connectionStatus = "reconnecting";
      disconnectCount += 1;
      lastDisconnectReason = reason;
      lastSyncedAtMs = nowMs;
      return this.getState();
    },
    handleReconnect(nowMs: number): CompanionReconnectRecoveryResult {
      const restoredFromStatus = connectionStatus;
      connectionStatus = "connected";
      lastSyncedAtMs = nowMs;
      const flushedSamples = pendingStrokeQueue.splice(0, pendingStrokeQueue.length);
      flushedSamples.sort((a, b) => a.sequence - b.sequence);
      return { restoredFromStatus, reconnectedAtMs: nowMs, flushedSamples, remainingQueueLength: 0, syncedStateRevision: toolState.stateRevision };
    },
    exportRecoverySnapshot(nowMs: number): CompanionRecoverySnapshot {
      return { sessionId: options.sessionId, capturedAtMs: nowMs, connectionStatus, toolState, pendingStrokes: pendingStrokeQueue.slice() };
    },
  };
}
