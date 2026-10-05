/**
 * CountUpAmount.tsx
 *
 * 금액을 0에서 실제 값까지 짧게 세어 올리는 numeral 표시.
 * 장식이 아니라 핵심 지표의 위계를 세우는 장치라 한 번만 재생하고,
 * prefers-reduced-motion이면 애니메이션 없이 최종값을 바로 보여준다.
 */
import { useEffect, useRef, useState } from "react";

import { formatKrw } from "../revenue-aggregator";

const DURATION_MS = 900;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function CountUpAmount({
  amount,
  className,
}: {
  readonly amount: number;
  readonly className?: string;
}) {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? amount : 0));
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      prefersReducedMotion() ||
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      setDisplay(amount);
      return;
    }
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(amount * eased));
      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick);
      }
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [amount]);

  return <span className={className}>{formatKrw(display)}</span>;
}
