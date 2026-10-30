/**
 * @file chunked-sqlite-pacing.ts
 * @description `CSFCHUNK` 문서 가져오기의 협조적 양보: 단일 스레드에서 오래 도는 일이 중단 신호와 다른 작업에 숨 쉴 틈을 주도록, 정해진
 * 시간마다 이벤트 루프에 양보하고 부를 때마다 중단 신호를 확인한다. 시계와 양보 방법을 주입할 수 있어 경계를 결정적으로 시험할 수 있다.
 */

import { throwIfClipAborted } from "./chunked-sqlite-document-reader";

/** 이 시간(ms)이 지나면 다음 `pace()` 호출이 이벤트 루프에 양보한다. */
export const CLIP_YIELD_INTERVAL_MS = 25;

export interface ClipPacerEnvironment {
  /** 단조 증가하는 현재 시각(ms). */
  readonly now: () => number;
  /** 이벤트 루프에 한 번 양보한다. */
  readonly yieldToEventLoop: () => Promise<void>;
}

const DEFAULT_ENVIRONMENT: ClipPacerEnvironment = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  yieldToEventLoop: () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    }),
};

/**
 * `pace()`를 돌려준다. 부를 때마다 중단 신호를 확인하고(양보하지 않을 때도), 마지막 양보 뒤 `CLIP_YIELD_INTERVAL_MS` 이상 지났으면 양보한 뒤
 * 다시 한 번 확인한다. 중단되었으면 `ClipDocumentError("aborted")`를 던진다.
 */
export function createClipPacer(signal: AbortSignal | undefined, environment: ClipPacerEnvironment = DEFAULT_ENVIRONMENT): () => Promise<void> {
  let last = environment.now();
  return async () => {
    throwIfClipAborted(signal);
    if (environment.now() - last < CLIP_YIELD_INTERVAL_MS) return;
    await environment.yieldToEventLoop();
    last = environment.now();
    throwIfClipAborted(signal);
  };
}
