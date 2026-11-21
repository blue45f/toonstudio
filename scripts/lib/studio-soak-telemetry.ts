interface ScriptPage {
  evaluate(source: string): Promise<unknown>;
}

interface HeapCdp {
  send(method: "HeapProfiler.collectGarbage" | "Runtime.getHeapUsage" | "Memory.getDOMCounters"): Promise<unknown>;
}

export interface HeapSample {
  readonly atMs: number;
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly embedderBytes: number;
  readonly backingStorageBytes: number;
  readonly documents: number;
  readonly nodes: number;
  readonly jsEventListeners: number;
}

export interface GpuEvent {
  readonly atMs: number;
  readonly kind: "lost" | "uncaptured";
  readonly reason: string;
  readonly message: string;
}

export interface LongTaskSample {
  readonly atMs: number;
  readonly durationMs: number;
  readonly duringStroke: boolean;
}

export interface StudioSoakTelemetry {
  readonly sessionId: string;
  readonly pageEpoch: number;
  readonly gpuObserverAvailable: boolean;
  readonly gpu: GpuEvent[];
  readonly longTasks: LongTaskSample[];
}

/** 소스 문자열로 설치하여 브라우저에서 tsx의 __name 헬퍼에 의존하지 않는다. */
export async function installGpuAndPerfCollector(
  page: { addInitScript(source: string): Promise<void> },
  sessionId: string,
): Promise<void> {
  await page.addInitScript(`(() => {
    const telemetry = {
      sessionId: ${JSON.stringify(sessionId)}, pageEpoch: performance.timeOrigin,
      gpu: [], longTasks: [], strokeWindows: [], activeStroke: null,
      longTaskObserverAvailable: false, gpuObserverAvailable: false, errors: []
    };
    window.__studioFiveHourTelemetry = telemetry;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 50) telemetry.longTasks.push([entry.startTime, entry.duration]);
        }
      });
      observer.observe({ type: "longtask", buffered: false });
      telemetry.longTaskObserver = observer;
      telemetry.longTaskObserverAvailable = true;
    } catch (error) {
      telemetry.errors.push("longtask observer: " + String(error));
    }
    try {
      const gpu = navigator.gpu;
      if (!gpu?.requestAdapter) return;
      const requestAdapter = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = async (...args) => {
        const adapter = await requestAdapter(...args);
        if (!adapter?.requestDevice) return adapter;
        const requestDevice = adapter.requestDevice.bind(adapter);
        adapter.requestDevice = async (...deviceArgs) => {
          const device = await requestDevice(...deviceArgs);
          device?.lost?.then((info) => {
            telemetry.gpu.push([performance.now(), "lost", String(info?.reason ?? "unknown"), String(info?.message ?? "")]);
          });
          device?.addEventListener?.("uncapturederror", (event) => {
            telemetry.gpu.push([performance.now(), "uncaptured", "", String(event?.error?.message ?? "unknown GPU error")]);
          });
          return device;
        };
        return adapter;
      };
      telemetry.gpuObserverAvailable = true;
    } catch (error) {
      telemetry.errors.push("GPU observer: " + String(error));
    }
  })()`);
}

/** 지연 콜백도 실제 입력 구간과 대조할 수 있도록 시작·종료 시각을 보존한다. */
export async function markStudioSoakStroke(
  page: ScriptPage,
  active: boolean,
): Promise<void> {
  await page.evaluate(`(() => {
    const telemetry = window.__studioFiveHourTelemetry;
    if (!telemetry) throw new Error("소크 계측기가 설치되지 않았습니다.");
    if (${active}) {
      if (telemetry.activeStroke !== null) throw new Error("소크 입력 구간이 중첩되었습니다.");
      telemetry.activeStroke = performance.now();
    } else if (telemetry.activeStroke !== null) {
      telemetry.strokeWindows.push([telemetry.activeStroke, performance.now()]);
      telemetry.activeStroke = null;
    }
  })()`);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export async function drainGpuAndPerf(
  page: ScriptPage,
  startedAt: number,
  expectedSessionId: string,
  requireGpu: boolean,
): Promise<StudioSoakTelemetry> {
  const raw: unknown = await page.evaluate(`(() => {
    const telemetry = window.__studioFiveHourTelemetry;
    if (!telemetry) throw new Error("소크 계측기가 사라졌습니다.");
    for (const entry of telemetry.longTaskObserver?.takeRecords() ?? []) {
      if (entry.duration >= 50) telemetry.longTasks.push([entry.startTime, entry.duration]);
    }
    const windows = telemetry.strokeWindows.slice();
    if (telemetry.activeStroke !== null) windows.push([telemetry.activeStroke, performance.now()]);
    const out = {
      sessionId: telemetry.sessionId, pageEpoch: telemetry.pageEpoch,
      longTaskObserverAvailable: telemetry.longTaskObserverAvailable,
      gpuObserverAvailable: telemetry.gpuObserverAvailable,
      errors: telemetry.errors.slice(), gpu: telemetry.gpu.slice(),
      longTasks: telemetry.longTasks.map(([start, duration]) => [
        start, duration, windows.some(([left, right]) => start < right && start + duration > left)
      ])
    };
    telemetry.gpu.length = 0;
    telemetry.longTasks.length = 0;
    telemetry.strokeWindows.length = 0;
    return out;
  })()`);
  if (!record(raw) || raw.sessionId !== expectedSessionId || !nonnegative(raw.pageEpoch)
    || raw.longTaskObserverAvailable !== true || !Array.isArray(raw.errors)
    || raw.errors.length > 0 || (requireGpu && raw.gpuObserverAvailable !== true)
    || !Array.isArray(raw.gpu) || !Array.isArray(raw.longTasks)) {
    throw new Error("필수 소크 성능·GPU 계측이 없거나 수집기가 실패했습니다.");
  }
  const epoch = raw.pageEpoch;
  const gpu: GpuEvent[] = raw.gpu.map((entry: unknown) => {
    if (!Array.isArray(entry) || !nonnegative(entry[0])
      || (entry[1] !== "lost" && entry[1] !== "uncaptured")
      || typeof entry[2] !== "string" || typeof entry[3] !== "string") {
      throw new Error("소크 GPU 표본이 올바르지 않습니다.");
    }
    return { atMs: epoch + entry[0] - startedAt, kind: entry[1], reason: entry[2], message: entry[3] };
  });
  const longTasks: LongTaskSample[] = raw.longTasks.map((entry: unknown) => {
    if (!Array.isArray(entry) || !nonnegative(entry[0]) || !nonnegative(entry[1])
      || typeof entry[2] !== "boolean") throw new Error("소크 longtask 표본이 올바르지 않습니다.");
    return { atMs: epoch + entry[0] - startedAt, durationMs: entry[1], duringStroke: entry[2] };
  });
  return { sessionId: expectedSessionId, pageEpoch: epoch,
    gpuObserverAvailable: raw.gpuObserverAvailable === true, gpu, longTasks };
}

/** 필수 측정 실패를 빈 표본으로 바꾸면 정상 실행으로 오인하므로 호출자에게 전달한다. */
export async function gcHeap(
  cdp: HeapCdp | null,
  startedAt: number,
): Promise<HeapSample> {
  if (!cdp) throw new Error("소크 메모리 계측에는 Chromium CDP가 필요합니다.");
  await cdp.send("HeapProfiler.collectGarbage");
  const usage: unknown = await cdp.send("Runtime.getHeapUsage");
  const dom: unknown = await cdp.send("Memory.getDOMCounters");
  if (!record(usage) || !record(dom)
    || !nonnegative(usage.usedSize) || !nonnegative(usage.totalSize)
    || !nonnegative(usage.embedderHeapUsedSize) || !nonnegative(usage.backingStorageSize)
    || !nonnegative(dom.documents) || !nonnegative(dom.nodes) || !nonnegative(dom.jsEventListeners)
    || usage.usedSize > usage.totalSize
    || ![dom.documents, dom.nodes, dom.jsEventListeners].every(Number.isSafeInteger)) {
    throw new Error("필수 소크 메모리·DOM 계측이 누락되거나 올바르지 않습니다.");
  }
  return {
    atMs: Date.now() - startedAt,
    usedBytes: usage.usedSize, totalBytes: usage.totalSize,
    embedderBytes: usage.embedderHeapUsedSize, backingStorageBytes: usage.backingStorageSize,
    documents: dom.documents, nodes: dom.nodes, jsEventListeners: dom.jsEventListeners,
  };
}
