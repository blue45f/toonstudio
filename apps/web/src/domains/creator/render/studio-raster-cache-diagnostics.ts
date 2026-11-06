export const STUDIO_RASTER_CACHE_DIAGNOSTICS_PREFIX = "toonstudio:raster-cache:";

const MAX_RETAINED_MARKS = 64;
const RECT_FIELDS = ["x", "y", "width", "height"] as const;

export type StudioRasterCacheDiagnosticKind = "clip" | "blend";
export type StudioRasterCacheDiagnosticReason = "initial" | "timer" | "raster";
type CacheRect = Readonly<Partial<Record<typeof RECT_FIELDS[number], number>>>;

export interface StudioRasterCacheDiagnostics {
  readonly enabled: boolean;
  finish(rect: CacheRect, isCached: boolean, failed: boolean): void;
}

const DISABLED_DIAGNOSTICS: StudioRasterCacheDiagnostics = Object.freeze({
  enabled: false,
  finish() {},
});
const retainedMarkNames: string[] = [];
let nextSequence = 0;

/** 기존 캐시 호출의 동기 CPU 구간만 관측한다. 실제 layer draw나 GPU 완료 시간은 아니다. */
export function beginStudioRasterCacheDiagnostics(
  kind: StudioRasterCacheDiagnosticKind,
  reason: StudioRasterCacheDiagnosticReason = "raster",
): StudioRasterCacheDiagnostics {
  if (!import.meta.env.DEV) return DISABLED_DIAGNOSTICS;
  if (kind !== "clip" && kind !== "blend") return DISABLED_DIAGNOSTICS;
  if (reason !== "initial" && reason !== "timer" && reason !== "raster") return DISABLED_DIAGNOSTICS;
  try {
    const timing = globalThis.performance;
    if (!timing || typeof timing.now !== "function" || typeof timing.mark !== "function"
      || typeof timing.clearMarks !== "function") return DISABLED_DIAGNOSTICS;
    const startedAt = timing.now();
    if (!Number.isFinite(startedAt) || startedAt < 0) return DISABLED_DIAGNOSTICS;
    const sequence = ++nextSequence;
    const mark = (phase: "start" | "end", detail: Record<string, unknown>, startTime: number) => {
      // 캡처 관측과 보관 목록을 공유하지 않아 기존 캡처 marks를 지우지 않는다.
      if (retainedMarkNames.length >= MAX_RETAINED_MARKS) {
        const oldest = retainedMarkNames[0];
        if (oldest !== undefined) timing.clearMarks(oldest);
        retainedMarkNames.shift();
      }
      const name = `${STUDIO_RASTER_CACHE_DIAGNOSTICS_PREFIX}${sequence}:${phase}`;
      timing.mark(name, { startTime, detail });
      retainedMarkNames.push(name);
    };
    mark("start", { kind, reason, elapsedMs: 0 }, startedAt);
    let finished = false;
    return {
      enabled: true,
      finish(rect, isCached, failed) {
        if (finished) return;
        finished = true;
        try {
          const endedAt = timing.now();
          const elapsedMs = endedAt - startedAt;
          if (!Number.isFinite(endedAt) || !Number.isFinite(elapsedMs) || elapsedMs < 0) return;
          const detail: Record<string, unknown> = { kind, reason, elapsedMs };
          const observedRect: Record<string, number> = {};
          // own data property만 읽으며 상속값·getter·임의 키·원본 내용은 받지 않는다.
          if (rect && typeof rect === "object") {
            for (const key of RECT_FIELDS) {
              const value: unknown = Object.getOwnPropertyDescriptor(rect, key)?.value;
              if (typeof value === "number" && Number.isFinite(value)) observedRect[key] = value;
            }
          }
          if (Object.keys(observedRect).length > 0) detail.rect = observedRect;
          if (typeof isCached === "boolean") detail.isCached = isCached;
          if (typeof failed === "boolean") detail.failed = failed;
          mark("end", detail, endedAt);
        } catch {
          // 관측 실패는 캐시의 반환값과 오류 처리에 영향을 주지 않는다.
          return;
        }
      },
    };
  } catch {
    return DISABLED_DIAGNOSTICS;
  }
}
