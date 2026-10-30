import { useEffect, useState } from "react";

/** 역할·편집 배정의 기간 경계와 화면 복귀 때 현재 자격을 다시 계산한다. */
export function useStudioTemporalClock(periods: readonly { readonly startsAt: string; readonly endsAt: string | null }[], changeKey?: string): string {
  const [now, setNow] = useState(() => Date.now());
  // 값으로 경계를 고정해 호출자가 새 배열을 전달해도 snapshot 갱신 루프를 만들지 않는다.
  const boundariesKey = periods.flatMap((period) => [Date.parse(period.startsAt), period.endsAt === null ? NaN : Date.parse(period.endsAt),
    period.endsAt === null ? NaN : Date.parse(period.endsAt) + 1])
    .filter(Number.isFinite).sort((left, right) => left - right).join(",");
  useEffect(() => {
    const boundaries = boundariesKey === "" ? [] : boundariesKey.split(",").map(Number);
    let active = true, timer: number | null = null;
    const tick = () => {
      if (!active) return;
      if (timer !== null) window.clearTimeout(timer);
      const snapshot = Date.now(); setNow(snapshot);
      // 종료 제외 정책은 종료 시각에, Core의 종료 포함 정책은 다음 밀리초에 재평가한다.
      const next = boundaries.find((boundary) => boundary > snapshot);
      timer = next === undefined ? null : window.setTimeout(tick, Math.min(2_147_483_647, Math.max(1, next - snapshot)));
    };
    const wake = () => { if (document.visibilityState !== "hidden") tick(); };
    tick();
    window.addEventListener("focus", wake); document.addEventListener("visibilitychange", wake);
    return () => { active = false; if (timer !== null) window.clearTimeout(timer); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); };
  }, [boundariesKey, changeKey]);
  return new Date(now).toISOString();
}
