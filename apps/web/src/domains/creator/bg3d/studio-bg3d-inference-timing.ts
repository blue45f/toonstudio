/**
 * 추론 쿼리의 프레임 스로틀과 스크린리더 안내 속도 제한 — 순수 모듈(시간은 호출자가 주입).
 *
 * 포인터 이동 이벤트는 1000Hz 마우스에서 프레임당 수십 번 올 수 있다. 쿼리는 `minIntervalMs`(기본
 * 한 프레임)당 한 번만 돌리고, 그 사이 들어온 샘플은 "마지막 것만" 보류해 다음 프레임에 처리한다.
 * 마지막 샘플은 반드시 처리되므로 커서가 멈춘 위치의 결과가 항상 최신이다.
 */

import { STUDIO_BG3D_INFERENCE_BUDGET } from "./studio-bg3d-inference-kinds";

export interface StudioBg3dInferenceFrameGateStats {
  readonly offered: number;
  readonly ran: number;
  /** 보류 중 더 최신 샘플에 덮여 버려진 수. */
  readonly dropped: number;
}

export interface StudioBg3dInferenceFrameGate<T> {
  /** 즉시 처리해도 되면 "run", 간격이 안 지났으면 최신 샘플을 보류하고 "defer". */
  offer(sample: T, nowMs: number): "run" | "defer";
  /** 간격이 지났다면 보류된 최신 샘플을 꺼내 처리한 것으로 기록한다. */
  takePending(nowMs: number): T | null;
  /** 보류된 샘플이 있을 때, 처리 가능해질 때까지 남은 시간(ms). 없으면 null. */
  nextDelayMs(nowMs: number): number | null;
  reset(): void;
  readonly stats: () => StudioBg3dInferenceFrameGateStats;
}

export function createStudioBg3dInferenceFrameGate<T>(
  minIntervalMs: number = STUDIO_BG3D_INFERENCE_BUDGET.minFrameIntervalMs,
): StudioBg3dInferenceFrameGate<T> {
  const interval = Number.isFinite(minIntervalMs) && minIntervalMs >= 0 ? minIntervalMs : 16;
  let lastRunAt = Number.NEGATIVE_INFINITY;
  let hasPending = false;
  let pending: T | null = null;
  let offered = 0;
  let ran = 0;
  let dropped = 0;

  return {
    offer(sample, nowMs) {
      offered += 1;
      if (nowMs - lastRunAt >= interval) {
        lastRunAt = nowMs;
        if (hasPending) dropped += 1;
        hasPending = false;
        pending = null;
        ran += 1;
        return "run";
      }
      if (hasPending) dropped += 1;
      pending = sample;
      hasPending = true;
      return "defer";
    },
    takePending(nowMs) {
      if (!hasPending || nowMs - lastRunAt < interval) return null;
      const sample = pending;
      lastRunAt = nowMs;
      hasPending = false;
      pending = null;
      ran += 1;
      return sample;
    },
    nextDelayMs(nowMs) {
      if (!hasPending) return null;
      return Math.max(0, interval - (nowMs - lastRunAt));
    },
    reset() {
      lastRunAt = Number.NEGATIVE_INFINITY;
      hasPending = false;
      pending = null;
    },
    stats: () => ({ offered, ran, dropped }),
  };
}

export interface StudioBg3dInferenceAnnouncement {
  /** 같은 key는 반복해서 읽지 않는다. */
  readonly key: string;
  readonly text: string;
  /** 잠금·취소·오류처럼 즉시 읽어야 하는 안내. */
  readonly urgent?: boolean;
}

export interface StudioBg3dInferenceAnnouncer {
  /** 지금 live region에 써야 할 문구를 돌려준다. 보류하거나 중복이면 null. */
  offer(update: StudioBg3dInferenceAnnouncement, nowMs: number): string | null;
  /** 간격이 지났다면 보류된 최신 안내를 돌려준다. */
  takePending(nowMs: number): string | null;
  reset(): void;
}

export const STUDIO_BG3D_INFERENCE_ANNOUNCE_INTERVAL_MS = 450;

export function createStudioBg3dInferenceAnnouncer(
  minIntervalMs: number = STUDIO_BG3D_INFERENCE_ANNOUNCE_INTERVAL_MS,
): StudioBg3dInferenceAnnouncer {
  const interval = Number.isFinite(minIntervalMs) && minIntervalMs >= 0 ? minIntervalMs : STUDIO_BG3D_INFERENCE_ANNOUNCE_INTERVAL_MS;
  let lastKey: string | null = null;
  let lastAt = Number.NEGATIVE_INFINITY;
  let pending: StudioBg3dInferenceAnnouncement | null = null;

  const commit = (update: StudioBg3dInferenceAnnouncement, nowMs: number): string => {
    lastKey = update.key;
    lastAt = nowMs;
    pending = null;
    return update.text;
  };

  return {
    offer(update, nowMs) {
      if (update.key === lastKey) {
        pending = null;
        return null;
      }
      if (update.urgent || nowMs - lastAt >= interval) return commit(update, nowMs);
      pending = update;
      return null;
    },
    takePending(nowMs) {
      if (!pending || nowMs - lastAt < interval) return null;
      if (pending.key === lastKey) {
        pending = null;
        return null;
      }
      return commit(pending, nowMs);
    },
    reset() {
      lastKey = null;
      lastAt = Number.NEGATIVE_INFINITY;
      pending = null;
    },
  };
}
