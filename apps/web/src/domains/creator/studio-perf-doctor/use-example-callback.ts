import { useEffect, useRef, useState } from "react";

type CallbackStep = () => void | Promise<void>;
interface Attempt {
  readonly steps: readonly CallbackStep[];
  readonly complete: () => void;
  next: number;
}

interface ExampleCallbackController {
  readonly pending: boolean;
  readonly error: string | null;
  run: (steps: readonly CallbackStep[], complete: () => void) => void;
  retry: () => void;
  reset: () => void;
}

/** 완료된 콜백은 재시도하지 않고 실패한 단계의 동일 입력부터 이어간다. */
export function useExampleCallback(): ExampleCallbackController {
  const current = useRef<Attempt | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current = null;
    };
  }, []);

  function fail(attempt: Attempt, reason: unknown): void {
    if (!mounted.current || current.current !== attempt) return;
    busy.current = false;
    setPending(false);
    setError((reason instanceof Error ? reason.message : String(reason)) || "Callback failed");
  }

  function advance(attempt: Attempt): void {
    if (!mounted.current || current.current !== attempt) return;
    try {
      while (attempt.next < attempt.steps.length) {
        const step = attempt.steps[attempt.next];
        if (!step) break;
        const result = step();
        if (result !== undefined) {
          void Promise.resolve(result).then(() => {
            if (current.current !== attempt) return;
            attempt.next += 1;
            advance(attempt);
          }, (reason: unknown) => fail(attempt, reason));
          return;
        }
        attempt.next += 1;
      }
      attempt.complete();
      current.current = null;
      busy.current = false;
      setPending(false);
      setError(null);
    } catch (reason) {
      fail(attempt, reason);
    }
  }

  function run(steps: readonly CallbackStep[], complete: () => void): void {
    if (busy.current) return;
    const attempt: Attempt = { steps, complete, next: 0 };
    current.current = attempt;
    busy.current = true;
    setPending(true);
    setError(null);
    advance(attempt);
  }

  function retry(): void {
    if (busy.current || !current.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    advance(current.current);
  }

  function reset(): void {
    if (busy.current) return;
    current.current = null;
    setError(null);
  }

  return { pending, error, run, retry, reset };
}
