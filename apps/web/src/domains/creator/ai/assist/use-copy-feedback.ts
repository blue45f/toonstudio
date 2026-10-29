import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 클립보드 복사와 그 결과 표시. 성공은 잠깐 "복사했어요"로 바꿔 보여 주고, 실패(권한 거부·지원 안 함)는 조용히 삼키지 않고 알린다.
 * 어느 글을 복사했는지(`kind`)로 여러 복사 버튼 중 눌린 것만 표시한다.
 */
export function useCopyFeedback<Kind extends string>() {
  const [state, setState] = useState<{ readonly kind: Kind; readonly ok: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canCopy = typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback((kind: Kind, value: string) => {
    const settle = (ok: boolean) => {
      setState({ kind, ok });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState(null), ok ? 2_000 : 6_000);
    };
    try {
      navigator.clipboard.writeText(value).then(() => settle(true), () => settle(false));
    } catch {
      settle(false);
    }
  }, []);

  return { canCopy, copy, copied: state?.ok ? state.kind : null, failed: state !== null && !state.ok };
}
