/**
 * Procreate급 모바일 터치 제스처 Undo/Redo (T1) 및 팜 리젝션 (T5) 상태 머신 (AC-005).
 *
 * - T5 팜 리젝션: 스타일러스(`pen`) 활성 중이거나 펜을 뗀 직후 쿨다운(350ms) 내의 터치,
 *   또는 접촉 면적(width/height >= 28px)이 손바닥에 해당하는 터치를 잉크 입력에서 차단한다.
 * - T1 제스처 Undo/Redo: 2핑거 탭 = Undo, 3핑거 탭 = Redo, 500ms 이상 홀드 시 120ms 간격 연속 스크럽.
 *   이동 거리가 임계치(14px)를 넘으면 핀치/팬으로 간주해 오동작 Undo/Redo를 방지한다.
 */

export type TouchPointerType = "pen" | "touch" | "mouse";

export interface TouchPointerSample {
  readonly pointerId: number;
  readonly pointerType: TouchPointerType;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly timestampMs: number;
}

export type TouchGestureAction =
  | { readonly type: "none" }
  | { readonly type: "undo"; readonly source: "tap" | "scrub" }
  | { readonly type: "redo"; readonly source: "tap" | "scrub" };

export interface PalmRejectionDecision {
  readonly rejected: boolean;
  readonly reason: "pen-active" | "pen-cooldown" | "palm-contact-area" | "accepted";
}

export interface TouchGestureGuardConfig {
  readonly penCooldownMs?: number;
  readonly palmContactThresholdPx?: number;
  readonly tapMaxDurationMs?: number;
  readonly tapMaxMovementPx?: number;
  readonly scrubHoldDelayMs?: number;
  readonly scrubRepeatIntervalMs?: number;
}

interface ActiveFinger {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  maxDisplacementPx: number;
}

const DEFAULTS: Required<TouchGestureGuardConfig> = {
  penCooldownMs: 350,
  palmContactThresholdPx: 28,
  tapMaxDurationMs: 280,
  tapMaxMovementPx: 14,
  scrubHoldDelayMs: 500,
  scrubRepeatIntervalMs: 120,
};

export class StudioTouchGestureGuard {
  private readonly cfg: Required<TouchGestureGuardConfig>;
  private activePenIds = new Set<number>();
  private lastPenUpAtMs = -Infinity;
  private activeFingers = new Map<number, ActiveFinger>();
  private peakFingerCount = 0;
  private gestureStartMs: number | null = null;
  private gestureCancelled = false;
  private lastScrubAtMs: number | null = null;

  constructor(config: TouchGestureGuardConfig = {}) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  /** T5: 해당 터치 입력이 손바닥(팜) 또는 펜 간섭으로 차단되어야 하는지 판정한다. */
  evaluatePalmRejection(sample: TouchPointerSample): PalmRejectionDecision {
    if (sample.pointerType !== "touch") {
      return { rejected: false, reason: "accepted" };
    }
    if (this.activePenIds.size > 0) {
      return { rejected: true, reason: "pen-active" };
    }
    if (sample.timestampMs - this.lastPenUpAtMs <= this.cfg.penCooldownMs) {
      return { rejected: true, reason: "pen-cooldown" };
    }
    const width = sample.width ?? 0;
    const height = sample.height ?? 0;
    if (
      width >= this.cfg.palmContactThresholdPx ||
      height >= this.cfg.palmContactThresholdPx
    ) {
      return { rejected: true, reason: "palm-contact-area" };
    }
    return { rejected: false, reason: "accepted" };
  }

  onPointerDown(sample: TouchPointerSample): PalmRejectionDecision {
    if (sample.pointerType === "pen") {
      this.activePenIds.add(sample.pointerId);
      this.resetGesture();
      return { rejected: false, reason: "accepted" };
    }

    const palmDecision = this.evaluatePalmRejection(sample);
    if (palmDecision.rejected) {
      return palmDecision;
    }

    if (sample.pointerType === "touch") {
      if (this.activeFingers.size === 0) {
        this.gestureStartMs = sample.timestampMs;
        this.peakFingerCount = 0;
        this.gestureCancelled = false;
        this.lastScrubAtMs = null;
      }
      this.activeFingers.set(sample.pointerId, {
        pointerId: sample.pointerId,
        startX: sample.x,
        startY: sample.y,
        maxDisplacementPx: 0,
      });
      if (this.activeFingers.size > this.peakFingerCount) {
        this.peakFingerCount = this.activeFingers.size;
      }
      if (this.peakFingerCount > 3) {
        this.gestureCancelled = true;
      }
    }

    return palmDecision;
  }

  onPointerMove(sample: TouchPointerSample): void {
    const finger = this.activeFingers.get(sample.pointerId);
    if (!finger) return;
    const dist = Math.hypot(sample.x - finger.startX, sample.y - finger.startY);
    if (dist > finger.maxDisplacementPx) {
      finger.maxDisplacementPx = dist;
    }
    if (finger.maxDisplacementPx > this.cfg.tapMaxMovementPx) {
      this.gestureCancelled = true;
    }
  }

  /** T1 홀드 스크럽: 2핑거/3핑거를 정지 상태로 500ms 이상 누르고 있으면 120ms 간격으로 연속 Undo/Redo를 발행한다. */
  pollHoldScrub(nowMs: number): TouchGestureAction {
    if (this.gestureCancelled || this.gestureStartMs === null) {
      return { type: "none" };
    }
    const count = this.activeFingers.size;
    if (count !== 2 && count !== 3) {
      return { type: "none" };
    }
    const elapsed = nowMs - this.gestureStartMs;
    if (elapsed < this.cfg.scrubHoldDelayMs) {
      return { type: "none" };
    }
    if (
      this.lastScrubAtMs !== null &&
      nowMs - this.lastScrubAtMs < this.cfg.scrubRepeatIntervalMs
    ) {
      return { type: "none" };
    }
    this.lastScrubAtMs = nowMs;
    return count === 2
      ? { type: "undo", source: "scrub" }
      : { type: "redo", source: "scrub" };
  }

  onPointerUp(sample: TouchPointerSample): TouchGestureAction {
    if (sample.pointerType === "pen") {
      this.activePenIds.delete(sample.pointerId);
      if (this.activePenIds.size === 0) {
        this.lastPenUpAtMs = sample.timestampMs;
      }
      return { type: "none" };
    }

    if (!this.activeFingers.has(sample.pointerId)) {
      return { type: "none" };
    }
    this.activeFingers.delete(sample.pointerId);

    if (this.activeFingers.size > 0) {
      return { type: "none" };
    }

    const action = this.finalizeTap(sample.timestampMs);
    this.resetGesture();
    return action;
  }

  onPointerCancel(pointerId: number): void {
    this.activePenIds.delete(pointerId);
    this.activeFingers.delete(pointerId);
    if (this.activeFingers.size === 0) {
      this.resetGesture();
    } else {
      this.gestureCancelled = true;
    }
  }

  private finalizeTap(endMs: number): TouchGestureAction {
    if (
      this.gestureCancelled ||
      this.gestureStartMs === null ||
      this.lastScrubAtMs !== null
    ) {
      return { type: "none" };
    }
    const duration = endMs - this.gestureStartMs;
    if (duration > this.cfg.tapMaxDurationMs) {
      return { type: "none" };
    }
    if (this.peakFingerCount === 2) {
      return { type: "undo", source: "tap" };
    }
    if (this.peakFingerCount === 3) {
      return { type: "redo", source: "tap" };
    }
    return { type: "none" };
  }

  private resetGesture(): void {
    this.activeFingers.clear();
    this.peakFingerCount = 0;
    this.gestureStartMs = null;
    this.gestureCancelled = false;
    this.lastScrubAtMs = null;
  }
}
