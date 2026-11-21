/**
 * Chrome 차세대 웹 신기술 실사용 런타임 어댑터 3종:
 * 1) Display-P3 광색역 + `desynchronized: true` 저지연 2D 캔버스 컨텍스트 어댑터
 * 2) 240Hz+ 초저지연 스타일러스 입력 어댑터 (`pointerrawupdate` + Coalesced + Predicted)
 * 3) Compute Pressure API (`PressureObserver`) 발열·CPU 압박 자동 타일 캐시 거버너
 */

type GlobalRecord = Record<string, unknown>;

function readGlobal(): GlobalRecord {
  return globalThis as unknown as GlobalRecord;
}

/* -------------------------------------------------------------------------- */
/* 1) Display-P3 광색역 + desynchronized 저지연 2D 캔버스 컨텍스트 어댑터       */
/* -------------------------------------------------------------------------- */

export interface LowLatency2dContextLike {
  getContextAttributes?: () => {
    readonly colorSpace?: string;
    readonly desynchronized?: boolean;
    readonly alpha?: boolean;
  };
}

export interface LowLatencyCanvasLike {
  getContext(
    contextId: "2d",
    options?: CanvasRenderingContext2DSettings,
  ): CanvasRenderingContext2D | LowLatency2dContextLike | null;
}

export interface LowLatencyWideGamut2dOptions {
  readonly preferDisplayP3?: boolean;
  readonly desynchronized?: boolean;
  readonly alpha?: boolean;
  readonly willReadFrequently?: boolean;
}

export interface LowLatencyWideGamut2dResult {
  readonly context: CanvasRenderingContext2D | LowLatency2dContextLike | null;
  readonly colorSpace: "display-p3" | "srgb";
  readonly desynchronized: boolean;
  readonly wideGamut: boolean;
}

export function createLowLatencyWideGamut2dContext(
  canvas: HTMLCanvasElement | LowLatencyCanvasLike | null | undefined,
  options: LowLatencyWideGamut2dOptions = {},
): LowLatencyWideGamut2dResult {
  if (!canvas || typeof canvas.getContext !== "function") {
    return Object.freeze({
      context: null,
      colorSpace: "srgb" as const,
      desynchronized: false,
      wideGamut: false,
    });
  }

  const preferP3 = options.preferDisplayP3 ?? true;
  const wantDesync = options.desynchronized ?? true;
  const base: CanvasRenderingContext2DSettings = {
    alpha: options.alpha ?? true,
    willReadFrequently: options.willReadFrequently ?? false,
  };

  const candidates: CanvasRenderingContext2DSettings[] = [];
  if (preferP3) {
    candidates.push({ ...base, colorSpace: "display-p3", desynchronized: wantDesync });
    if (wantDesync) candidates.push({ ...base, colorSpace: "display-p3" });
  }
  candidates.push({ ...base, colorSpace: "srgb", desynchronized: wantDesync });
  candidates.push({ ...base });

  for (const settings of candidates) {
    try {
      const ctx = canvas.getContext("2d", settings);
      if (!ctx) continue;
      const attrs =
        typeof (ctx as LowLatency2dContextLike).getContextAttributes === "function"
          ? (ctx as LowLatency2dContextLike).getContextAttributes!()
          : undefined;
      const resolvedColorSpace =
        attrs?.colorSpace === "display-p3"
          ? "display-p3"
          : attrs?.colorSpace === "srgb"
            ? "srgb"
            : settings.colorSpace === "display-p3"
              ? "display-p3"
              : "srgb";
      const resolvedDesync =
        typeof attrs?.desynchronized === "boolean"
          ? attrs.desynchronized
          : Boolean(settings.desynchronized);
      return Object.freeze({
        context: ctx,
        colorSpace: resolvedColorSpace,
        desynchronized: resolvedDesync,
        wideGamut: resolvedColorSpace === "display-p3",
      });
    } catch {
      // 구형 엔진이 colorSpace 옵션을 거부하면 다음 안전 후보로 내려간다.
    }
  }

  return Object.freeze({
    context: null,
    colorSpace: "srgb" as const,
    desynchronized: false,
    wideGamut: false,
  });
}

/* -------------------------------------------------------------------------- */
/* 2) 240Hz+ 초저지연 스타일러스 입력 어댑터                                    */
/* -------------------------------------------------------------------------- */

export interface StylusPointerEventLike {
  readonly clientX: number;
  readonly clientY: number;
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly twist?: number;
  readonly altitudeAngle?: number;
  readonly azimuthAngle?: number;
  readonly timeStamp?: number;
  readonly pointerType?: string;
  readonly buttons?: number;
  getCoalescedEvents?: () => readonly StylusPointerEventLike[];
  getPredictedEvents?: () => readonly StylusPointerEventLike[];
}

export interface HighFreqStylusSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
  readonly altitudeAngle: number;
  readonly azimuthAngle: number;
  readonly timeStamp: number;
  readonly pointerType: string;
  readonly predicted: boolean;
}

export interface HighFreqStylusBatch {
  readonly samples: readonly HighFreqStylusSample[];
  readonly coalescedCount: number;
  readonly predictedCount: number;
  readonly usedCoalescedApi: boolean;
  readonly usedPredictedApi: boolean;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampUnit(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function toStylusSample(
  evt: StylusPointerEventLike,
  predicted: boolean,
  originX: number,
  originY: number,
): HighFreqStylusSample {
  const rawPressure = finiteOr(evt.pressure, evt.buttons ? 0.5 : 0);
  const pressure =
    rawPressure === 0 && (evt.buttons ?? 0) > 0 && evt.pointerType !== "pen"
      ? 0.5
      : clampUnit(rawPressure);
  return Object.freeze({
    x: finiteOr(evt.clientX, 0) - originX,
    y: finiteOr(evt.clientY, 0) - originY,
    pressure,
    tiltX: finiteOr(evt.tiltX, 0),
    tiltY: finiteOr(evt.tiltY, 0),
    twist: finiteOr(evt.twist, 0),
    altitudeAngle: finiteOr(evt.altitudeAngle, Math.PI / 2),
    azimuthAngle: finiteOr(evt.azimuthAngle, 0),
    timeStamp: finiteOr(evt.timeStamp, 0),
    pointerType: typeof evt.pointerType === "string" ? evt.pointerType : "unknown",
    predicted,
  });
}

export function extractHighFreqStylusSamples(
  event: StylusPointerEventLike,
  options?: {
    readonly originX?: number;
    readonly originY?: number;
    readonly includePredicted?: boolean;
    readonly maxPredicted?: number;
  },
): HighFreqStylusBatch {
  const originX = options?.originX ?? 0;
  const originY = options?.originY ?? 0;
  const includePredicted = options?.includePredicted ?? true;
  const maxPredicted = Math.max(0, Math.min(8, Math.trunc(options?.maxPredicted ?? 2)));

  let coalescedList: readonly StylusPointerEventLike[] = [];
  let usedCoalescedApi = false;
  if (typeof event.getCoalescedEvents === "function") {
    try {
      const raw = event.getCoalescedEvents();
      if (Array.isArray(raw) && raw.length > 0) {
        coalescedList = raw;
        usedCoalescedApi = true;
      }
    } catch {
      coalescedList = [];
    }
  }
  if (coalescedList.length === 0) coalescedList = [event];

  let predictedList: readonly StylusPointerEventLike[] = [];
  let usedPredictedApi = false;
  if (includePredicted && maxPredicted > 0 && typeof event.getPredictedEvents === "function") {
    try {
      const raw = event.getPredictedEvents();
      if (Array.isArray(raw) && raw.length > 0) {
        predictedList = raw.slice(0, maxPredicted);
        usedPredictedApi = true;
      }
    } catch {
      predictedList = [];
    }
  }

  const samples: HighFreqStylusSample[] = [];
  for (const item of coalescedList) samples.push(toStylusSample(item, false, originX, originY));
  for (const item of predictedList) samples.push(toStylusSample(item, true, originX, originY));

  return Object.freeze({
    samples: Object.freeze(samples),
    coalescedCount: coalescedList.length,
    predictedCount: predictedList.length,
    usedCoalescedApi,
    usedPredictedApi,
  });
}

/* -------------------------------------------------------------------------- */
/* 3) Compute Pressure API 기반 자동 타일 캐시 거버너                           */
/* -------------------------------------------------------------------------- */

export type ChromeComputePressureState = "nominal" | "fair" | "serious" | "critical";

export interface ComputePressureTilePolicy {
  readonly state: ChromeComputePressureState;
  readonly tileCacheBudgetMiB: number;
  readonly workerConcurrency: number;
  readonly enablePredictedInk: boolean;
  readonly enableHighResLiveFilter: boolean;
  readonly spillInactiveTilesToOpfs: boolean;
}

interface PressureObserverRecordLike {
  readonly state?: unknown;
}

export interface PressureObserverInstanceLike {
  observe(source: string, options?: { readonly sampleInterval?: number }): Promise<void>;
  disconnect(): void;
}

export type PressureObserverConstructorLike = new (
  callback: (records: readonly PressureObserverRecordLike[]) => void,
) => PressureObserverInstanceLike;

export interface ComputePressureTileGovernorOptions {
  readonly baseTileCacheMiB?: number;
  readonly minTileCacheMiB?: number;
  readonly baseWorkerCount?: number;
  readonly sampleIntervalMs?: number;
  readonly pressureObserverCtor?: PressureObserverConstructorLike | null;
  readonly onPolicyChange?: (policy: ComputePressureTilePolicy) => void;
}

export interface ComputePressureTileGovernor {
  readonly isSupported: boolean;
  readonly isObserving: boolean;
  start(): boolean;
  stop(): void;
  applyState(state: ChromeComputePressureState): ComputePressureTilePolicy;
  getSnapshot(): ComputePressureTilePolicy;
}

const VALID_PRESSURE_STATES: ReadonlySet<string> = new Set([
  "nominal",
  "fair",
  "serious",
  "critical",
]);

function isValidPressureState(value: unknown): value is ChromeComputePressureState {
  return typeof value === "string" && VALID_PRESSURE_STATES.has(value);
}

function resolvePressureObserverCtor(
  override: PressureObserverConstructorLike | null | undefined,
): PressureObserverConstructorLike | null {
  if (override === null) return null;
  if (override !== undefined) return override;
  const ctor = readGlobal()["PressureObserver"];
  return typeof ctor === "function" ? (ctor as PressureObserverConstructorLike) : null;
}

export function computeTilePolicyForPressure(
  state: ChromeComputePressureState,
  baseTileCacheMiB: number,
  minTileCacheMiB: number,
  baseWorkerCount: number,
): ComputePressureTilePolicy {
  const safeBaseCache = Math.max(64, Math.trunc(baseTileCacheMiB));
  const safeMinCache = Math.max(32, Math.min(safeBaseCache, Math.trunc(minTileCacheMiB)));
  const safeBaseWorkers = Math.max(1, Math.min(16, Math.trunc(baseWorkerCount)));

  const config: Record<
    ChromeComputePressureState,
    {
      readonly cacheScale: number;
      readonly workerScale: number;
      readonly predictedInk: boolean;
      readonly liveFilter: boolean;
      readonly spill: boolean;
    }
  > = {
    nominal: { cacheScale: 1.0, workerScale: 1.0, predictedInk: true, liveFilter: true, spill: false },
    fair: { cacheScale: 0.75, workerScale: 0.75, predictedInk: true, liveFilter: true, spill: false },
    serious: { cacheScale: 0.4, workerScale: 0.5, predictedInk: false, liveFilter: false, spill: true },
    critical: { cacheScale: 0.2, workerScale: 0.25, predictedInk: false, liveFilter: false, spill: true },
  };
  const cfg = config[state];
  return Object.freeze({
    state,
    tileCacheBudgetMiB: Math.max(safeMinCache, Math.round(safeBaseCache * cfg.cacheScale)),
    workerConcurrency: Math.max(1, Math.floor(safeBaseWorkers * cfg.workerScale)),
    enablePredictedInk: cfg.predictedInk,
    enableHighResLiveFilter: cfg.liveFilter,
    spillInactiveTilesToOpfs: cfg.spill,
  });
}

export function createComputePressureTileGovernor(
  options: ComputePressureTileGovernorOptions = {},
): ComputePressureTileGovernor {
  const baseTileCacheMiB = options.baseTileCacheMiB ?? 512;
  const minTileCacheMiB = options.minTileCacheMiB ?? 64;
  const baseWorkerCount = options.baseWorkerCount ?? 4;
  const sampleIntervalMs = options.sampleIntervalMs ?? 1000;
  const Ctor = resolvePressureObserverCtor(options.pressureObserverCtor);

  let policy = computeTilePolicyForPressure(
    "nominal",
    baseTileCacheMiB,
    minTileCacheMiB,
    baseWorkerCount,
  );
  let observer: PressureObserverInstanceLike | null = null;
  let observing = false;

  const applyState = (state: ChromeComputePressureState): ComputePressureTilePolicy => {
    policy = computeTilePolicyForPressure(
      state,
      baseTileCacheMiB,
      minTileCacheMiB,
      baseWorkerCount,
    );
    options.onPolicyChange?.(policy);
    return policy;
  };

  return {
    get isSupported() {
      return Ctor !== null;
    },
    get isObserving() {
      return observing;
    },
    start(): boolean {
      if (!Ctor) return false;
      if (observing) return true;
      try {
        observer = new Ctor((records) => {
          const latest = records[records.length - 1];
          if (latest && isValidPressureState(latest.state)) applyState(latest.state);
        });
        observing = true;
        const promise = observer.observe("cpu", { sampleInterval: sampleIntervalMs });
        if (promise && typeof promise.catch === "function") {
          promise.catch(() => {
            observing = false;
          });
        }
        return true;
      } catch {
        observing = false;
        observer = null;
        return false;
      }
    },
    stop(): void {
      observing = false;
      try {
        observer?.disconnect();
      } catch {
        // 이미 해제된 관찰자는 무시한다.
      }
      observer = null;
    },
    applyState,
    getSnapshot(): ComputePressureTilePolicy {
      return policy;
    },
  };
}
