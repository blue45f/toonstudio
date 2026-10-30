export type StudioBg3dWebglRecoveryPhase =
  | "healthy"
  | "lost"
  | "restored"
  | "failed"
  | "degraded";

export interface StudioBg3dWebglRecoverySnapshot {
  readonly degraded: boolean;
  readonly lossCount: number;
  readonly phase: StudioBg3dWebglRecoveryPhase;
  readonly timestamp: number;
}

export interface StudioBg3dWebglRecoveryOptions {
  readonly cancelFrame?: (frameId: number) => void;
  readonly degradationThreshold?: number;
  readonly invalidate: () => void;
  readonly now?: () => number;
  readonly onStateChange?: (
    snapshot: StudioBg3dWebglRecoverySnapshot,
  ) => void;
  readonly recoveryWindowMs?: number;
  readonly resetRenderer: () => void;
  readonly scheduleFrame?: (callback: FrameRequestCallback) => number;
}

export interface StudioBg3dWebglRecoveryController {
  readonly dispose: () => void;
  readonly retry: () => boolean;
  readonly snapshot: () => StudioBg3dWebglRecoverySnapshot;
}

export const STUDIO_BG3D_WEBGL_RECOVERY_EVENT =
  "toonstudio:bg3d-webgl-recovery" as const;

export interface StudioBg3dWebglRecoveryNoticeDetail {
  readonly owner: HTMLCanvasElement;
  readonly snapshot: StudioBg3dWebglRecoverySnapshot | null;
  readonly retry: () => boolean;
}

interface RecoveryOwner {
  readonly lease: object | null;
  readonly snapshot: StudioBg3dWebglRecoverySnapshot;
  readonly lossTimes: readonly number[];
}
const recoveryOwners = new WeakMap<HTMLCanvasElement, RecoveryOwner>();

function unavailable(phase: StudioBg3dWebglRecoveryPhase): boolean {
  return phase === "lost" || phase === "failed" || phase === "degraded";
}

/** renderer를 만들지 않고 현재 상태를 읽는다. 폐기한 owner의 미복구 상태도 실제 복구까지 남긴다. */
export function getStudioBg3dWebglRecoverySnapshot(canvas: HTMLCanvasElement): StudioBg3dWebglRecoverySnapshot | null {
  return recoveryOwners.get(canvas)?.snapshot ?? null;
}

const DEFAULT_RECOVERY_WINDOW_MS = 30_000;
const DEFAULT_DEGRADATION_THRESHOLD = 3;

function browserScheduleFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(
    () => callback(globalThis.performance?.now?.() ?? Date.now()),
    0,
  ) as unknown as number;
}

function browserCancelFrame(frameId: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frameId);
    return;
  }
  globalThis.clearTimeout(frameId);
}

/**
 * Owns the unplanned WebGL context lifecycle for the primary BG3D canvas.
 * Calling preventDefault on context loss keeps browser-managed restoration
 * available; restoration then rebuilds renderer caches and invalidates twice
 * so asynchronously restored programs and textures receive a follow-up frame.
 */
export function installStudioBg3dWebglContextRecovery(
  canvas: HTMLCanvasElement,
  options: StudioBg3dWebglRecoveryOptions,
): StudioBg3dWebglRecoveryController {
  const now = options.now ?? Date.now;
  const scheduleFrame = options.scheduleFrame ?? browserScheduleFrame;
  const cancelFrame = options.cancelFrame ?? browserCancelFrame;
  const recoveryWindowMs = Math.max(
    1_000,
    options.recoveryWindowMs ?? DEFAULT_RECOVERY_WINDOW_MS,
  );
  const degradationThreshold = Math.max(
    2,
    Math.round(
      options.degradationThreshold ?? DEFAULT_DEGRADATION_THRESHOLD,
    ),
  );

  let disposed = false;
  let scheduledFrame: number | null = null;
  let restorationEpoch = 0;
  const previous = recoveryOwners.get(canvas);
  const retained = previous && unavailable(previous.snapshot.phase) ? previous : undefined;
  let lossTimes: number[] = [...(retained?.lossTimes ?? [])];
  let current: StudioBg3dWebglRecoverySnapshot = retained?.snapshot ?? Object.freeze({
    degraded: false,
    lossCount: 0,
    phase: "healthy",
    timestamp: now(),
  });
  const ownerLease = {};
  recoveryOwners.set(canvas, { lease: ownerLease, snapshot: current, lossTimes });
  const ownsCanvas = () => !disposed && recoveryOwners.get(canvas)?.lease === ownerLease;

  const publish = (
    phase: StudioBg3dWebglRecoveryPhase,
    timestamp: number,
  ): void => {
    if (!ownsCanvas()) return;
    const degraded = lossTimes.length >= degradationThreshold;
    current = Object.freeze({
      degraded,
      lossCount: lossTimes.length,
      phase: degraded && phase === "lost" ? "degraded" : phase,
      timestamp,
    });
    recoveryOwners.set(canvas, { lease: ownerLease, snapshot: current, lossTimes });
    options.onStateChange?.(current);
  };

  const cancelScheduledFrame = (): void => {
    if (scheduledFrame === null) return;
    cancelFrame(scheduledFrame);
    scheduledFrame = null;
  };

  const handleContextLost = (event: Event): void => {
    if (!ownsCanvas()) return;
    event.preventDefault();
    restorationEpoch += 1;
    cancelScheduledFrame();
    const timestamp = now();
    lossTimes = lossTimes
      .filter((lossAt) => timestamp - lossAt <= recoveryWindowMs)
      .concat(timestamp);
    publish("lost", timestamp);
  };

  const restoreRenderer = (): boolean => {
    if (!ownsCanvas()) return false;
    const timestamp = now();
    const epoch = restorationEpoch + 1;
    restorationEpoch = epoch;
    cancelScheduledFrame();

    try {
      options.resetRenderer();
    } catch {
      // 캐시 재생성이 끝나지 않은 렌더러는 복구 성공이나 후속 프레임을 발행하지 않는다.
      if (!ownsCanvas() || restorationEpoch !== epoch) return false;
      publish("failed", timestamp);
      return false;
    }
    if (!ownsCanvas() || restorationEpoch !== epoch) return false;
    queueMicrotask(() => {
      if (ownsCanvas() && restorationEpoch === epoch) options.invalidate();
    });
    scheduledFrame = scheduleFrame(() => {
      scheduledFrame = null;
      if (ownsCanvas() && restorationEpoch === epoch) options.invalidate();
    });
    publish("restored", timestamp);
    return true;
  };

  const handleContextRestored = (): void => { restoreRenderer(); };

  canvas.addEventListener("webglcontextlost", handleContextLost, false);
  canvas.addEventListener(
    "webglcontextrestored",
    handleContextRestored,
    false,
  );

  const controller: StudioBg3dWebglRecoveryController = Object.freeze({
    dispose: () => {
      if (disposed) return;
      disposed = true;
      restorationEpoch += 1;
      canvas.removeEventListener(
        "webglcontextlost",
        handleContextLost,
        false,
      );
      canvas.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
        false,
      );
      cancelScheduledFrame();
      if (recoveryOwners.get(canvas)?.lease === ownerLease) {
        if (unavailable(current.phase)) recoveryOwners.set(canvas, { lease: null, snapshot: current, lossTimes });
        else recoveryOwners.delete(canvas);
      }
    },
    retry: () => current.phase === "failed" && restoreRenderer(),
    snapshot: () => current,
  });
  // 재설치만으로 미복구 상태를 healthy로 바꾸지 않는다. 기존 callback 발행 순서도 유지한다.
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    const detail: StudioBg3dWebglRecoveryNoticeDetail = { owner: canvas, snapshot: current, retry: controller.retry };
    window.dispatchEvent(new CustomEvent(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, { detail }));
  }
  return controller;
}
