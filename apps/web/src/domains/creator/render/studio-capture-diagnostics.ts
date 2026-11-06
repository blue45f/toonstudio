export const STUDIO_CAPTURE_DIAGNOSTICS_PREFIX = "toonstudio:capture:";

const PHASES = [
  "started", "commit-stage-wait", "commit-observed", "fonts-assets-wait", "fonts-ready", "assets-ready",
  "paint-wait", "wet-paper-wait", "wet-paper-ready", "raster-wait", "raster-ready", "ready", "failed",
  "watermark-wait", "watermark-ready", "readiness-wait", "readiness-ready", "skia-import-wait",
  "skia-import-ready", "skia-capture-wait", "skia-captured", "skia-unsupported", "skia-unavailable",
  "skia-failed", "compatibility-capture-start", "compatibility-capture-ready", "grade-start", "grade-ready",
  "watermark-draw-start", "watermark-draw-ready", "encode-module-wait", "encode-module-ready",
  "encode-start", "encode-ready", "download-start", "download-dispatched", "shared-document-blocked",
] as const;
const NUMERIC_FIELDS = ["timeoutMs", "frameCount", "assetCount", "rasterCount"] as const;
const BOOLEAN_FIELDS = [
  "stagePresent", "renderedPageMatches", "commitChecked", "commitPageMatches", "historyIndexMatches",
  "pageObjectMatches", "exporting", "masterEditMode", "fontsReady", "assetsReady", "wetPaperWaited",
  "skiaInjected", "snapshotUnavailable",
] as const;
const ALLOWED_PHASES = new Set<string>(PHASES);
const MAX_RETAINED_MARKS = 64;

export type StudioCaptureDiagnosticPhase = typeof PHASES[number];
export type StudioCaptureDiagnosticFields = Readonly<
  Partial<Record<typeof NUMERIC_FIELDS[number], number> & Record<typeof BOOLEAN_FIELDS[number], boolean>>
>;
export interface StudioCaptureDiagnostics {
  readonly enabled: boolean;
  mark(phase: StudioCaptureDiagnosticPhase, fields?: StudioCaptureDiagnosticFields): void;
}

const DISABLED_DIAGNOSTICS: StudioCaptureDiagnostics = Object.freeze({
  enabled: false,
  mark() {},
});
const retainedMarkNames: string[] = [];
let nextAttemptId = 0;
let nextSequence = 0;

/** 원본 식별자와 오류 문구를 받지 않는 개발 환경 전용 캡처 관측이다. */
export function beginStudioCaptureDiagnostics(domain: "readiness" | "raster-export"): StudioCaptureDiagnostics {
  if (!import.meta.env.DEV) return DISABLED_DIAGNOSTICS;
  if (domain !== "readiness" && domain !== "raster-export") return DISABLED_DIAGNOSTICS;
  try {
    const timing = globalThis.performance;
    if (!timing || typeof timing.mark !== "function" || typeof timing.clearMarks !== "function") {
      return DISABLED_DIAGNOSTICS;
    }
    const startedAt = timing.now();
    if (!Number.isFinite(startedAt)) return DISABLED_DIAGNOSTICS;
    const attemptId = ++nextAttemptId;
    return {
      enabled: true,
      mark(phase, fields) {
        try {
          if (!ALLOWED_PHASES.has(phase)) return;
          const elapsedMs = timing.now() - startedAt;
          if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
          const detail: Record<string, string | number | boolean> = { domain, phase, attemptId, elapsedMs };
          // 허용된 own data property만 읽어 임의 키와 getter가 관측 경로로 들어오지 않게 한다.
          if (fields && typeof fields === "object") {
            for (const key of NUMERIC_FIELDS) {
              const value: unknown = Object.getOwnPropertyDescriptor(fields, key)?.value;
              if (typeof value === "number" && Number.isFinite(value) && value >= 0) detail[key] = value;
            }
            for (const key of BOOLEAN_FIELDS) {
              const value: unknown = Object.getOwnPropertyDescriptor(fields, key)?.value;
              if (typeof value === "boolean") detail[key] = value;
            }
          }
          if (retainedMarkNames.length >= MAX_RETAINED_MARKS) {
            const oldest = retainedMarkNames[0];
            if (oldest !== undefined) timing.clearMarks(oldest);
            retainedMarkNames.shift();
          }
          const name = `${STUDIO_CAPTURE_DIAGNOSTICS_PREFIX}${attemptId}:${++nextSequence}`;
          timing.mark(name, { detail });
          retainedMarkNames.push(name);
        } catch {
          // 관측 실패는 캡처의 성공·실패와 제어 흐름에 영향을 주지 않는다.
          return;
        }
      },
    };
  } catch {
    return DISABLED_DIAGNOSTICS;
  }
}
