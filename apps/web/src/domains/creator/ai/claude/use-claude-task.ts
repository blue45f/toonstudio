import { useCallback, useEffect, useRef, useState } from "react";

export type ClaudeTaskState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "stopped" }
  | { readonly status: "error"; readonly message: string };

export interface ClaudeTask {
  readonly state: ClaudeTaskState;
  readonly running: boolean;
  /** 실행 중인 작업이 있으면 먼저 취소하고 새로 시작한다. 성공하면 값을, 그 밖에는 undefined를 돌려준다. */
  start<T>(runner: (signal: AbortSignal) => Promise<T>): Promise<T | undefined>;
  /** 진행 중인 요청을 취소한다. 이미 끝났으면 아무것도 하지 않는다. */
  stop(): void;
  /** 오류·중단 표시를 지운다. 진행 중이면 취소하고 지운다. */
  reset(): void;
  /** 진행 중일 때 시작한 뒤 지난 초(1초 단위). 진행 중이 아니면 0. */
  readonly elapsedSeconds: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

/**
 * Claude 요청 하나의 수명(실행 중·중단·오류)을 맡는다. 대화상자마다 같은 취소·정리 코드를 되풀이하지 않기 위한 훅이다.
 * - 중단하면 요청을 즉시 취소하고 "중단함" 상태로 둔다(오류로 보이지 않는다).
 * - 화면이 사라지면 진행 중인 요청도 취소한다 — 보이지 않는 요청에 비용을 쓰지 않는다.
 * - 자동 재시도는 하지 않는다. 다시 보내려면 사용자가 다시 `start`를 눌러야 한다.
 */
export function useClaudeTask(): ClaudeTask {
  const [state, setState] = useState<ClaudeTaskState>({ status: "idle" });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const running = state.status === "running";
  useEffect(() => {
    if (!running) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => clearInterval(timer);
  }, [running]);

  const start = useCallback(async <T,>(runner: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "running" });
    try {
      const value = await runner(controller.signal);
      // 중단했거나 새 요청이 이 요청을 대신했다면 늦게 도착한 값은 버린다.
      if (controller.signal.aborted || controllerRef.current !== controller) return undefined;
      setState({ status: "idle" });
      return value;
    } catch (error) {
      // 중단·교체·초기화는 그 호출이 이미 상태를 정했다. 아직 이 요청이 현재 요청일 때만 오류로 남긴다.
      if (controllerRef.current === controller && !controller.signal.aborted) {
        setState({ status: "error", message: messageOf(error) });
      }
      return undefined;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.abort();
    controllerRef.current = null;
    setState({ status: "stopped" });
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: "idle" });
  }, []);

  return { state, running, start, stop, reset, elapsedSeconds };
}
