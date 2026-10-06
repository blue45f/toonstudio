/** 형제 스태거 간격과 누적 지연 계산(컴포넌트 아님). */

/** 형제 스태거 간격(ms). 랭킹 보드의 진입 스태거(45ms)보다 살짝 느긋하게 잡는다. */
export const STAGGER_STEP_MS = 55;
/** 마지막 아이템도 330ms 안에 등장한다 — 긴 목록에서 뒤쪽이 하염없이 늦어지지 않게 하는 상한. */
export const STAGGER_MAX_DELAY_MS = 330;

/**
 * 목록 인덱스 → 스태거 지연(ms). 0번은 즉시, 이후는 간격만큼 누적하되 상한에서 멈춘다.
 * 순수 함수라 단위 테스트로 고정한다.
 */
export function staggerDelayMs(
  index: number,
  stepMs: number = STAGGER_STEP_MS,
  maxDelayMs: number = STAGGER_MAX_DELAY_MS,
): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.floor(index) * stepMs, maxDelayMs);
}
