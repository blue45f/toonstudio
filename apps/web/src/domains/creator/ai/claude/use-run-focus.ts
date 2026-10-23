import { useEffect, useRef } from "react";

/**
 * 실행 버튼을 누르면 그 버튼이 비활성이 되고 "중단"이 나타난다. 포커스가 `body`로 떨어지지 않도록 실행이 시작되면 중단 버튼으로,
 * 끝나면(중단 버튼이 사라지고 포커스를 잃었을 때만) 실행 버튼으로 옮긴다. 사용자가 다른 곳에 포커스를 두었다면 건드리지 않는다.
 */
export function useRunFocus(running: boolean) {
  const runRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    if (running) {
      stopRef.current?.focus({ preventScroll: true });
    } else if (wasRunning.current && (document.activeElement === document.body || document.activeElement === null)) {
      runRef.current?.focus({ preventScroll: true });
    }
    wasRunning.current = running;
  }, [running]);

  return { runRef, stopRef };
}
