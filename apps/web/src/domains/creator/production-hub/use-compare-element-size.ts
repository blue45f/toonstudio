import { useCallback, useEffect, useRef, useState } from "react";

/** 핀 좌표의 레터박스 보정에 쓰는 표시 요소의 실측 크기. */
export function useCompareElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const attach = useCallback((el: T | null) => { ref.current = el; }, []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [attach, size] as const;
}
