/**
 * 취소할 수 있는 비동기 작업 하나의 생명주기 — idle → running(진행률) → success | error | cancelled.
 *
 * 컷 읽기·감지·카드 나누기·이미지 굽기·ZIP 만들기가 모두 같은 모양이다: 시작하면 AbortSignal 을 받고, 취소하면 부분 결과 없이
 * 끝나고, 실패하면 같은 작업을 다시 시도할 수 있다. 새 작업이 시작되거나 화면이 사라지면 이전 작업은 취소되고 그 결과는 버려진다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface JobProgress {
  readonly done: number;
  readonly total: number;
}

export type JobState<T> =
  | { readonly status: "idle" }
  | { readonly status: "running"; readonly progress: JobProgress | null }
  | { readonly status: "success"; readonly value: T }
  | { readonly status: "error"; readonly error: unknown }
  | { readonly status: "cancelled" };

export interface JobContext {
  readonly signal: AbortSignal;
  readonly report: (done: number, total: number) => void;
}

export interface PanelJob<T> {
  readonly state: JobState<T>;
  /** 작업을 시작한다. 끝날 때(성공·실패·취소) 상태가 반영된 뒤 resolve 한다. */
  run(task: (context: JobContext) => Promise<T>): Promise<void>;
  /** 실행 중인 작업을 취소한다. 부분 결과는 버린다. */
  cancel(): void;
  reset(): void;
}

export function isCancellationError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code: unknown = "code" in error ? error.code : undefined;
  const name: unknown = "name" in error ? error.name : undefined;
  return code === "cancelled" || name === "AbortError";
}

export function usePanelJob<T>(): PanelJob<T> {
  const [state, setState] = useState<JobState<T>>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => () => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const run = useCallback(async (task: (context: JobContext) => Promise<T>): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    generationRef.current += 1;
    const generation = generationRef.current;
    const current = (): boolean => generationRef.current === generation;
    setState({ status: "running", progress: null });
    try {
      const value = await task({
        signal: controller.signal,
        report: (done, total) => {
          if (current()) setState({ status: "running", progress: { done, total } });
        },
      });
      if (!current()) return;
      setState(controller.signal.aborted ? { status: "cancelled" } : { status: "success", value });
    } catch (error) {
      if (!current()) return;
      setState(controller.signal.aborted || isCancellationError(error) ? { status: "cancelled" } : { status: "error", error });
    } finally {
      if (current() && controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  const cancel = useCallback((): void => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback((): void => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: "idle" });
  }, []);

  return useMemo(() => ({ state, run, cancel, reset }), [state, run, cancel, reset]);
}
