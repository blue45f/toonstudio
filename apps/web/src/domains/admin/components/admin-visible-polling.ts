import { useCallback, useEffect, useRef } from "react";

/** 같은 화면의 읽기를 합치고 화면·사용자·조회 조건이 바뀌면 이전 읽기를 취소한다. */
export function useAdminReadTask<Arguments extends unknown[]>(
  task: (signal: AbortSignal, ...args: Arguments) => Promise<void>,
): (...args: Arguments) => Promise<void> {
  const active = useRef<{
    task: typeof task;
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);

  useEffect(() => () => {
    if (active.current?.task !== task) return;
    active.current.controller.abort();
    active.current = null;
  }, [task]);

  return useCallback((...args: Arguments) => {
    const current = active.current;
    if (current?.task === task && !current.controller.signal.aborted) return current.promise;
    current?.controller.abort();
    const request = { task, controller: new AbortController(), promise: Promise.resolve() };
    request.promise = Promise.resolve().then(async () => {
      if (!request.controller.signal.aborted) await task(request.controller.signal, ...args);
    }).finally(() => {
      if (active.current === request) active.current = null;
    });
    active.current = request;
    return request.promise;
  }, [task]);
}

/** intervalMs가 null이면 첫 가시 시점에만 실행하며 이후 갱신은 수동으로 맡긴다. */
export function startAdminVisiblePolling(
  task: () => void,
  intervalMs: number | null,
  refreshOnStart = true,
): () => void {
  let interval: ReturnType<typeof setInterval> | null = null;
  let pendingInitial = refreshOnStart;
  let wasVisible = document.visibilityState === "visible";
  const pause = () => {
    if (interval !== null) globalThis.clearInterval(interval);
    interval = null;
  };
  const resume = (refresh: boolean) => {
    if (refresh || pendingInitial) {
      pendingInitial = false;
      task();
    }
    if (intervalMs !== null && interval === null) {
      interval = globalThis.setInterval(() => {
        if (document.visibilityState === "visible") task();
      }, intervalMs);
    }
  };
  const onVisibility = () => {
    const isVisible = document.visibilityState === "visible";
    if (isVisible === wasVisible) return;
    wasVisible = isVisible;
    if (isVisible) resume(intervalMs !== null);
    else pause();
  };
  document.addEventListener("visibilitychange", onVisibility);
  if (wasVisible) resume(false);
  return () => {
    pause();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
