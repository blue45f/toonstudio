interface StudioBootVisibility {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** 해제 함수이면서, 내려받기가 진행 중이라는 신호(touch)를 받는 초기화 시간 제한. */
export type StudioBootDeadline = (() => void) & {
  /** 파일이 조금이라도 더 내려왔을 때 부른다. 멈춤 예산을 처음 값으로 되돌린다(전체 상한은 그대로 줄어든다). */
  readonly touch: () => void;
};

/** 월드 부팅에서 내려받기 진행이 이 시간 동안 없으면 실패로 본다(보이는 시간 기준). 느린 회선에서도 정상 진행 중에는 늘어난다. */
export const STUDIO_BOOT_STALL_MS = 45_000;
/** 진행 신호로 아무리 연장해도 부팅이 이 시간(보이는 시간 기준)을 넘기면 실패로 본다. */
export const STUDIO_BOOT_MAX_MS = 300_000;

/** 진행 신호가 한꺼번에 쏟아져도 타이머를 매번 다시 만들지 않도록 이 간격보다 촘촘한 touch는 무시한다. */
const TOUCH_MIN_INTERVAL_MS = 250;

/**
 * 화면에 보이는 동안의 초기화 시간 제한.
 *
 * - 멈춤 예산(timeoutMs): 진행 신호(touch)가 이 시간 동안 없으면 실패 처리한다. touch가 없으면 처음부터 이 시간이 전부다.
 * - 전체 상한(maxTotalMs): touch로 아무리 연장해도 이 시간(보이는 시간 기준)을 넘기면 실패 처리한다.
 *
 * 느린 회선에서는 정상적으로 내려받는 중에도 총 시간이 길어지므로, 고정 시간 대신 멈춤으로 실패를 판정한다.
 * Phaser가 정지하는 숨긴 탭의 시간은 어느 쪽 예산에도 넣지 않는다.
 */
export function studioVisibleBootDeadline(
  visibility: StudioBootVisibility,
  onTimeout: () => void,
  timeoutMs = 25_000,
  maxTotalMs = 300_000,
): StudioBootDeadline {
  let stallRemaining = timeoutMs;
  let totalRemaining = Math.max(timeoutMs, maxTotalMs);
  let startedAt: number | null = null;
  let lastTouchAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let disposed = false;
  const pause = () => {
    if (timer !== undefined) globalThis.clearTimeout(timer);
    timer = undefined;
    if (startedAt !== null) {
      const elapsed = Math.max(0, performance.now() - startedAt);
      stallRemaining = Math.max(0, stallRemaining - elapsed);
      totalRemaining = Math.max(0, totalRemaining - elapsed);
    }
    startedAt = null;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    pause();
    visibility.removeEventListener("visibilitychange", update);
  };
  const update = () => {
    if (disposed) return;
    pause();
    if (visibility.hidden) return;
    startedAt = performance.now();
    timer = globalThis.setTimeout(() => {
      pause();
      if (visibility.hidden || disposed) return;
      dispose();
      onTimeout();
    }, Math.min(stallRemaining, totalRemaining));
  };
  const touch = () => {
    if (disposed) return;
    const now = performance.now();
    if (now - lastTouchAt < TOUCH_MIN_INTERVAL_MS) return;
    lastTouchAt = now;
    pause();
    stallRemaining = timeoutMs;
    update();
  };
  visibility.addEventListener("visibilitychange", update);
  update();
  return Object.assign(dispose, { touch });
}
