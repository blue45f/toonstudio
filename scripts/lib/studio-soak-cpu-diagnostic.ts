import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { createStudioFirstContactTrace, studioFirstContactTraceSource } from "./studio-soak-first-contact-trace";

import type { StudioFirstContactTraceSource, StudioFirstContactTraceTransport } from "./studio-soak-first-contact-trace";
import type { StudioFirstContactTracePage } from "./studio-soak-first-contact-trace-probe";
import type { CDPSession } from "playwright";

async function withinCpuDiagnostic<T>(pending: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("CPU 진단 응답이 30초를 넘었습니다.")), 30_000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** CPU 자료와 native trace를 같은 진단 세션에 묶되 각각의 원본·시계·실패를 보존한다. */
export function createStudioSoakCpuDiagnostic(input: {
  enabled: boolean;
  page: StudioFirstContactTracePage;
  cdp: Pick<CDPSession, "send">;
  directory: string;
  source: StudioFirstContactTraceSource;
  createTraceTransport(): Promise<StudioFirstContactTraceTransport>;
}) {
  const { page, cdp, directory } = input;
  const source = studioFirstContactTraceSource(input.source);
  let trace: ReturnType<typeof createStudioFirstContactTrace> | null = null;
  let recording = false;
  let traceAttemptedCycle: number | null = null;
  let traceFinishing: Promise<void> | null = null;
  let finishing: Promise<ReturnType<typeof result>> | null = null;
  const metadata = { diagnosticOnly: true, ...source, samplingIntervalUs: 1000,
    nativeTraceCaptureScope: { kind: "first-input-attempt", maxCycles: 1, attemptedCycle: null as number | null,
      stopBoundary: "after the first dispatch attempt, 500ms settle and pointer-latency drain; final cleanup on error" },
    startClock: null as unknown, stopClock: { beforeStopMs: null as number | null, afterStopMs: null as number | null },
    rawProfileFile: null as string | null, rawProfileSha256: null as string | null, issues: [] as string[],
    limitation: "CPU 표본과 native trace는 실행 비용을 바꾸는 원인 진단이며 성능·장시간 통과 증거가 아니다." };
  let traceMetadata: Awaited<ReturnType<ReturnType<typeof createStudioFirstContactTrace>["finish"]>> | null = null;
  const issue = (phase: string, error: unknown) => metadata.issues.push(`${phase}: ${String(error instanceof Error ? error.message : error).slice(0, 800)}`);
  const result = () => ({ captured: metadata.rawProfileSha256 !== null, metadataFile: "diagnostic-cpu-metadata.json",
    traceCaptured: traceMetadata?.completed === true, traceMetadataFile: trace?.metadataFile ?? null,
    issues: [...metadata.issues, ...(traceMetadata?.issues ?? []).map((value) => `native-trace: ${value}`)] });
  const pageClock = async (label: string): Promise<number | null> => {
    try {
      const value = await withinCpuDiagnostic(page.evaluate("performance.now()"));
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("브라우저 시계 값이 유효하지 않습니다.");
      return value;
    } catch (error) { issue(label, error); return null; }
  };
  const save = () => writeFileSync(join(directory, "diagnostic-cpu-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  const finishTrace = (): Promise<void> => {
    if (traceFinishing) return traceFinishing;
    traceFinishing = (async () => {
      if (trace) try { traceMetadata = await trace.finish(); } catch (error) { issue("native-trace-finish", error); }
      else issue("native-trace-missing", "첫 입력 시도의 trace가 준비되지 않았습니다.");
      save();
    })();
    return traceFinishing;
  };
  return {
    async start() {
      if (!input.enabled) return;
      try {
        await withinCpuDiagnostic(cdp.send("Profiler.enable"));
        await withinCpuDiagnostic(cdp.send("Profiler.setSamplingInterval", { interval: 1000 }));
        const before = await withinCpuDiagnostic(page.evaluate("({ pageEpoch: performance.timeOrigin, beforeStartMs: performance.now() })"));
        await withinCpuDiagnostic(cdp.send("Profiler.start")); recording = true;
        const afterStartMs = await pageClock("cpu-clock-after-start");
        if (typeof before !== "object" || before === null || !("pageEpoch" in before) || !("beforeStartMs" in before)
          || typeof before.pageEpoch !== "number" || !Number.isFinite(before.pageEpoch)
          || typeof before.beforeStartMs !== "number" || !Number.isFinite(before.beforeStartMs)
          || afterStartMs === null || before.beforeStartMs > afterStartMs) throw new Error("CPU 시작 시계 범위가 유효하지 않습니다.");
        metadata.startClock = { pageEpoch: before.pageEpoch, beforeStartMs: before.beforeStartMs, afterStartMs };
      } catch (error) { issue("cpu-start", error); throw error; }
    },
    async armStroke(cycle: number, inputMode: string) {
      if (!input.enabled || traceAttemptedCycle !== null) return;
      if (finishing) throw new Error("종료한 CPU 진단에 첫 접촉 trace를 추가할 수 없습니다.");
      traceAttemptedCycle = cycle; metadata.nativeTraceCaptureScope.attemptedCycle = cycle;
      try {
        trace = createStudioFirstContactTrace({ page, transport: await withinCpuDiagnostic(input.createTraceTransport()), directory, source,
          captureScope: { kind: "first-input-attempt", maxCycles: 1, cycle, stopBoundary: metadata.nativeTraceCaptureScope.stopBoundary } });
        await trace.start(); await trace.armStroke(cycle, inputMode);
      } catch (error) { issue("native-trace-arm", error); save(); throw error; }
    },
    async completeStroke(cycle: number) {
      if (!input.enabled || traceAttemptedCycle !== cycle) return;
      await finishTrace();
    },
    finish() {
      if (!input.enabled) return Promise.resolve(null);
      if (finishing) return finishing;
      finishing = (async () => {
        try {
          if (!recording) throw new Error("CPU profile이 시작되지 않아 원본을 기록할 수 없습니다.");
          metadata.stopClock.beforeStopMs = await pageClock("cpu-clock-before-stop");
          const captured = await withinCpuDiagnostic(cdp.send("Profiler.stop")); recording = false;
          metadata.stopClock.afterStopMs = await pageClock("cpu-clock-after-stop");
          const profile = JSON.stringify(captured.profile);
          writeFileSync(join(directory, "diagnostic-cpu.cpuprofile"), profile);
          metadata.rawProfileFile = "diagnostic-cpu.cpuprofile";
          metadata.rawProfileSha256 = createHash("sha256").update(profile).digest("hex");
        } catch (error) { issue("cpu-profile", error); }
        finally {
          await finishTrace(); save();
        }
        return result();
      })();
      return finishing;
    },
  };
}
