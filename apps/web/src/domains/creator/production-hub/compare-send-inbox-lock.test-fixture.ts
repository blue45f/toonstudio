import type { CompareSendInboxLockProvider } from "./compare-send-inbox";

interface PendingLock {
  readonly cancelled: () => boolean;
  readonly start: (release: () => void) => Promise<void>;
}
interface LockQueue {
  held: boolean;
  scheduled: boolean;
  readonly pending: PendingLock[];
}

/** 같은 이름의 요청을 비동기 FIFO로 허용하고, 대기 취소와 콜백 완료 뒤 해제를 재현한다. */
export function createCompareSendInboxTestLocks(): CompareSendInboxLockProvider {
  const queues = new Map<string, LockQueue>();
  const schedule = (name: string, queue: LockQueue): void => {
    if (queue.scheduled || queue.held) return;
    queue.scheduled = true;
    queueMicrotask(() => {
      queue.scheduled = false;
      if (queue.held) return;
      let next = queue.pending.shift();
      while (next?.cancelled()) next = queue.pending.shift();
      if (!next) { if (queues.get(name) === queue) queues.delete(name); return; }
      queue.held = true;
      void next.start(() => { queue.held = false; schedule(name, queue); });
    });
  };
  return {
    request<T>(name: string, options: { readonly mode: "exclusive"; readonly signal?: AbortSignal },
      operation: () => T | Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        let cancelled = false, started = false;
        const onAbort = () => {
          if (started || cancelled) return;
          cancelled = true;
          options.signal?.removeEventListener("abort", onAbort);
          reject(new DOMException("잠금 대기가 취소되었습니다.", "AbortError"));
        };
        if (options.signal?.aborted) { onAbort(); return; }
        options.signal?.addEventListener("abort", onAbort, { once: true });
        const queue: LockQueue = queues.get(name) ?? { held: false, scheduled: false, pending: [] };
        queues.set(name, queue);
        queue.pending.push({
          cancelled: () => cancelled,
          async start(release) {
            started = true;
            options.signal?.removeEventListener("abort", onAbort);
            try {
              const value = await operation();
              release();
              resolve(value);
            } catch (error) {
              release();
              reject(error);
            }
          },
        });
        schedule(name, queue);
      });
    },
  };
}
