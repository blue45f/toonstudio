export function detectReducedMotionPreference(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return true; }
}

/** 명시적 장치 테스트에서만 호출한다. 접수 여부는 실제 펜촉·하드웨어 재생 확인이 아니다. */
export function triggerSafeNavigatorVibrate(patternMs: readonly number[], prefersReducedMotion = false): boolean {
  if (prefersReducedMotion || detectReducedMotionPreference() || patternMs.length === 0) return false;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  const prefix = patternMs.slice(0, 8);
  if (prefix.some((ms) => !Number.isFinite(ms) || ms < 0)) return false;
  const safePattern = prefix.map((ms) => Math.round(Math.min(50, ms)));
  // 0ms도 진동/쉼의 위치를 유지한다. 필터링하면 쉼이 진동으로 바뀔 수 있다.
  if (!safePattern.some((ms, index) => index % 2 === 0 && ms > 0)) return false;
  try { return Boolean(navigator.vibrate(safePattern)); }
  catch { return false; }
}
