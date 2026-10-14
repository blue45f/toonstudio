/**
 * Core Web Vitals field collection for the public pages (BLUEPRINT §6.4, perf finding 5).
 *
 * The repo deliberately carries no `web-vitals` dependency: adding one needs a lockfile
 * regeneration, and the library itself is only a thin wrapper over PerformanceObserver.
 * This module reproduces its metric semantics directly on PerformanceObserver so the
 * collected numbers stay comparable with the published thresholds:
 *
 *   - LCP: startTime of the last largest-contentful-paint candidate before the page is
 *     hidden or the user first interacts.
 *   - CLS: largest layout-shift session window (shifts within 1s chain into one window,
 *     a window spans at most 5s, shifts right after input do not count).
 *   - INP: per-interaction worst event duration, reported at ~p98 across interactions
 *     (the maximum while there are fewer than 50 interactions).
 *
 * Budgets are the §6.4 public-surface targets — LCP p75 ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms —
 * which are also the "good" thresholds, so `rateWebVital` doubles as the budget check the
 * bundle gate mirrors in scripts/check-studio-bundle.mjs (publicPageBudgets).
 */

export type WebVitalName = "LCP" | "CLS" | "INP";
export type WebVitalRating = "good" | "needs-improvement" | "poor";

export type WebVitalsSnapshot = {
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
};

/** §6.4 budget = the "good" ceiling; the second value is the "poor" floor. */
export const WEB_VITAL_THRESHOLDS: Record<WebVitalName, { good: number; poor: number }> = {
  LCP: { good: 2_500, poor: 4_000 },
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
};

export function rateWebVital(name: WebVitalName, value: number): WebVitalRating {
  const thresholds = WEB_VITAL_THRESHOLDS[name];
  if (value <= thresholds.good) return "good";
  if (value <= thresholds.poor) return "needs-improvement";
  return "poor";
}

/**
 * Field CWV is only collected on the public surfaces the §6.4 budget governs.
 * The bridge runs on every route, but studio and account pages have their own
 * performance gates and must not leak their (very different) vitals into the
 * public p75 pool.
 */
export function isPublicVitalsPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/discover";
}

const MAX_VITAL_MS = 600_000;
const MAX_CLS = 100;

function boundedVitalMs(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return Math.min(MAX_VITAL_MS, Math.round(value));
}

function boundedCls(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return Math.min(MAX_CLS, Math.round(value * 10_000) / 10_000);
}

/**
 * Bounded beacon payload, in the same spirit as share-analytics-event: only the
 * three metric values and the (query-free) path cross the analytics boundary —
 * no URLs, no element identifiers, no attribution text. Returns null when no
 * metric has been observed yet, so an empty beacon is never sent.
 */
export function buildWebVitalsPayload(input: {
  path: unknown;
  snapshot: WebVitalsSnapshot;
}): Record<string, unknown> | null {
  if (
    typeof input.path !== "string"
    || !input.path.startsWith("/")
    || input.path.includes("?")
    || input.path.includes("#")
    || input.path.length > 320
  ) {
    return null;
  }
  const lcpMs = boundedVitalMs(input.snapshot.lcpMs);
  const cls = boundedCls(input.snapshot.cls);
  const inpMs = boundedVitalMs(input.snapshot.inpMs);
  if (lcpMs === null && cls === null && inpMs === null) return null;
  return { path: input.path, lcpMs, cls, inpMs };
}

// ---------------------------------------------------------------------------
// Pure accumulators (unit-tested without a browser)
// ---------------------------------------------------------------------------

const CLS_SESSION_GAP_MS = 1_000;
const CLS_SESSION_MAX_MS = 5_000;

export type ClsAccumulator = ReturnType<typeof createClsAccumulator>;

/** web-vitals CLS: the reported value is the largest session-window sum, not the total. */
export function createClsAccumulator() {
  let sessionValue = 0;
  let sessionStartTime = 0;
  let lastShiftTime = 0;
  let maxSessionValue = 0;
  return {
    pushShift(shift: { value: number; startTime: number; hadRecentInput: boolean }): void {
      if (shift.hadRecentInput || !(shift.value > 0)) return;
      if (
        sessionValue > 0
        && (shift.startTime - lastShiftTime > CLS_SESSION_GAP_MS
          || shift.startTime - sessionStartTime > CLS_SESSION_MAX_MS)
      ) {
        sessionValue = 0;
        sessionStartTime = shift.startTime;
      }
      if (sessionValue === 0) sessionStartTime = shift.startTime;
      sessionValue += shift.value;
      lastShiftTime = shift.startTime;
      if (sessionValue > maxSessionValue) maxSessionValue = sessionValue;
    },
    value(): number | null {
      return maxSessionValue > 0 ? maxSessionValue : null;
    },
  };
}

export type InpAccumulator = ReturnType<typeof createInpAccumulator>;

/**
 * web-vitals INP: group event entries by interaction, keep each interaction's worst
 * duration, then report ~p98 so one freak frame does not define a page with many
 * interactions (with <50 interactions the p98 pick is the maximum anyway).
 */
export function createInpAccumulator() {
  const worstByInteraction = new Map<number, number>();
  return {
    pushEvent(event: { duration: number; interactionId: number }): void {
      if (!(event.interactionId > 0) || !(event.duration > 0)) return;
      const current = worstByInteraction.get(event.interactionId) ?? 0;
      if (event.duration > current) worstByInteraction.set(event.interactionId, event.duration);
    },
    value(): number | null {
      if (worstByInteraction.size === 0) return null;
      const durations = [...worstByInteraction.values()].sort((a, b) => b - a);
      const index = Math.min(durations.length - 1, Math.floor(durations.length / 50));
      return durations[index] ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Browser collector (PerformanceObserver wiring)
// ---------------------------------------------------------------------------

type LargestContentfulPaintEntry = PerformanceEntry & { startTime: number };
type LayoutShiftEntry = PerformanceEntry & {
  value: number;
  hadRecentInput: boolean;
  startTime: number;
};
type EventTimingEntry = PerformanceEntry & { duration: number; interactionId: number };

function observe(
  type: string,
  onEntries: (entries: PerformanceEntry[]) => void,
  options?: Record<string, unknown>,
): PerformanceObserver | null {
  try {
    const observer = new PerformanceObserver((list) => {
      onEntries(list.getEntries());
    });
    observer.observe({ type, buffered: true, ...options } as PerformanceObserverInit);
    return observer;
  } catch {
    // Entry type unsupported (e.g. event timing in Safari): that metric stays null
    // instead of taking the whole bridge down.
    return null;
  }
}

export type WebVitalsCollector = {
  snapshot: () => WebVitalsSnapshot;
  stop: () => void;
};

/**
 * Starts observing immediately (the bridge mounts before first paint on the shell,
 * and `buffered: true` replays candidates recorded before the observer attached).
 * LCP freezes at the first interaction or page hide, matching the spec: later
 * candidates are not the value the visitor actually experienced as "loaded".
 */
export function startWebVitalsCollection(): WebVitalsCollector {
  let lcpMs: number | null = null;
  let lcpFrozen = false;
  const cls = createClsAccumulator();
  const inp = createInpAccumulator();
  const observers: (PerformanceObserver | null)[] = [];

  const freezeLcp = () => {
    lcpFrozen = true;
  };
  globalThis.addEventListener("keydown", freezeLcp, { once: true, capture: true });
  globalThis.addEventListener("pointerdown", freezeLcp, { once: true, capture: true });

  observers.push(
    observe("largest-contentful-paint", (entries) => {
      if (lcpFrozen) return;
      const last = entries.at(-1) as LargestContentfulPaintEntry | undefined;
      if (last) lcpMs = last.startTime;
    }),
    observe("layout-shift", (entries) => {
      for (const entry of entries) {
        const shift = entry as LayoutShiftEntry;
        cls.pushShift({
          value: shift.value,
          startTime: shift.startTime,
          hadRecentInput: shift.hadRecentInput,
        });
      }
    }),
    observe(
      "event",
      (entries) => {
        for (const entry of entries) {
          const event = entry as EventTimingEntry;
          inp.pushEvent({ duration: event.duration, interactionId: event.interactionId });
        }
      },
      { durationThreshold: 40 },
    ),
  );

  return {
    snapshot: () => ({ lcpMs, cls: cls.value(), inpMs: inp.value() }),
    stop: () => {
      for (const observer of observers) observer?.disconnect();
      globalThis.removeEventListener("keydown", freezeLcp, { capture: true });
      globalThis.removeEventListener("pointerdown", freezeLcp, { capture: true });
    },
  };
}
