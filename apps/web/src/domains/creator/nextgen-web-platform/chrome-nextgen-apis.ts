/**
 * Chrome 2025–2026 차세대 웹 플랫폼 API 통합·기능 탐지·우아한 폴백 레이어.
 *
 * View Transitions, scheduler.yield(), Compute Pressure(PressureObserver),
 * Canvas HDR/Display-P3(float16) 코어 탐지와 미디어·입력 API 배럴 재노출을 제공한다.
 */

export {
  STUDIO_FALLBACK_COLOR_SWATCHES,
  buildStudioSpeculationRulesSpec,
  classifyWebtoonFontCategory,
  createStudioAudioWorkletProcessor,
  injectSpeculationRules,
  openStudioReferencePipWindow,
  probeWebNnRuntime,
  queryWebtoonLocalFonts,
  sampleScreenColorWithEyeDropper,
  type DocumentPipOpenResult,
  type EyeDropperSampleResult,
  type FallbackPaletteSwatch,
  type LocalFontCatalogEntry,
  type LocalFontQueryResult,
  type SpeculationRulesDocument,
  type StudioAudioMixConfig,
  type StudioAudioWorkletHandle,
  type WebNnProbeResult,
  type WebtoonFontCategory,
} from "./chrome-nextgen-media-tools";

export type ComputePressureState = "nominal" | "fair" | "serious" | "critical";

export interface ComputePressureThrottlePolicy {
  readonly state: ComputePressureState;
  readonly maxConcurrentWorkers: number;
  readonly targetFps: number;
  readonly yieldEveryNFrames: number;
  readonly previewScale: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly guidanceKo: string;
  readonly guidanceEn: string;
}

export interface ChromeNextGenFeatureStatus {
  readonly id:
    | "viewTransitions"
    | "schedulerYield"
    | "computePressure"
    | "eyeDropper"
    | "localFontAccess"
    | "documentPictureInPicture"
    | "webnn"
    | "canvasHdrDisplayP3"
    | "speculationRules"
    | "audioWorklet"
    | "webCodecs";
  readonly supported: boolean;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly fallbackLabelKo: string;
  readonly fallbackLabelEn: string;
}

export interface ChromeNextGenCapabilities {
  readonly viewTransitions: boolean;
  readonly schedulerYield: boolean;
  readonly computePressure: boolean;
  readonly eyeDropper: boolean;
  readonly localFontAccess: boolean;
  readonly documentPictureInPicture: boolean;
  readonly webnn: boolean;
  readonly canvasHdrDisplayP3: boolean;
  readonly speculationRules: boolean;
  readonly audioWorklet: boolean;
  readonly webCodecs: boolean;
  readonly supportedCount: number;
  readonly totalCount: number;
  readonly tier: "nextgen-full" | "progressive" | "compat-fallback";
  readonly features: readonly ChromeNextGenFeatureStatus[];
}

export interface ViewTransitionLike {
  readonly finished: Promise<void>;
  readonly ready?: Promise<void>;
  readonly updateCallbackDone?: Promise<void>;
  readonly skipTransition?: () => void;
}

export interface EyeDropperConstructorLike {
  new (): {
    open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
  };
}

export interface LocalFontDataLike {
  readonly family: string;
  readonly fullName: string;
  readonly postscriptName: string;
  readonly style: string;
}

export interface DocumentPictureInPictureLike {
  requestWindow(options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
  }): Promise<Window>;
}

export interface PressureRecordLike {
  readonly state: ComputePressureState;
  readonly time?: number;
}

export interface PressureObserverConstructorLike {
  new (callback: (records: readonly PressureRecordLike[]) => void): {
    observe(source: "cpu", options?: { sampleInterval?: number }): Promise<void> | void;
    disconnect(): void;
  };
}

export interface WebNnContextLike {
  readonly lost?: Promise<unknown>;
}

export interface WebNnNavigatorMlLike {
  createContext(options?: {
    deviceType?: "gpu" | "npu" | "cpu";
    powerPreference?: "default" | "high-performance" | "low-power";
  }): Promise<WebNnContextLike>;
}

export interface ChromeNextGenRuntimeEnv {
  readonly win?: Window & {
    readonly EyeDropper?: EyeDropperConstructorLike;
    readonly queryLocalFonts?: () => Promise<readonly LocalFontDataLike[]>;
    readonly documentPictureInPicture?: DocumentPictureInPictureLike;
    readonly AudioWorkletNode?: unknown;
    readonly VideoEncoder?: unknown;
    readonly VideoFrame?: unknown;
    readonly scheduler?: {
      readonly yield?: (options?: { signal?: AbortSignal }) => Promise<void>;
    };
    readonly PressureObserver?: PressureObserverConstructorLike;
  };
  readonly doc?: Document & {
    readonly startViewTransition?: (
      callbackOrOptions:
        | (() => void | Promise<void>)
        | { readonly update: () => void | Promise<void>; readonly types?: readonly string[] },
    ) => ViewTransitionLike;
  };
  readonly nav?: Navigator & {
    readonly ml?: WebNnNavigatorMlLike;
  };
  readonly scriptSupports?: (type: string) => boolean;
}

function resolveRuntimeEnv(env?: ChromeNextGenRuntimeEnv): ChromeNextGenRuntimeEnv {
  const win =
    env?.win ??
    (typeof window !== "undefined" ? (window as ChromeNextGenRuntimeEnv["win"]) : undefined);
  const doc =
    env?.doc ??
    (typeof document !== "undefined" ? (document as ChromeNextGenRuntimeEnv["doc"]) : undefined);
  const nav =
    env?.nav ??
    (typeof navigator !== "undefined" ? (navigator as ChromeNextGenRuntimeEnv["nav"]) : undefined);
  const scriptSupports =
    env?.scriptSupports ??
    (typeof HTMLScriptElement !== "undefined" && typeof HTMLScriptElement.supports === "function"
      ? (type: string) => HTMLScriptElement.supports(type)
      : undefined);
  return { win, doc, nav, scriptSupports };
}

export function prefersReducedMotion(env?: ChromeNextGenRuntimeEnv): boolean {
  const { win } = resolveRuntimeEnv(env);
  if (!win || typeof win.matchMedia !== "function") return false;
  try {
    return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export interface CanvasHdrDisplayP3Probe {
  readonly hdrDisplay: boolean;
  readonly displayP3: boolean;
  readonly float16Canvas: boolean;
  readonly recommendedColorSpace: "display-p3" | "srgb";
}

export function probeCanvasHdrDisplayP3(env?: ChromeNextGenRuntimeEnv): CanvasHdrDisplayP3Probe {
  const { win, doc } = resolveRuntimeEnv(env);
  let hdrDisplay = false;
  let displayP3 = false;
  if (win && typeof win.matchMedia === "function") {
    try {
      hdrDisplay = win.matchMedia("(dynamic-range: high)").matches;
      displayP3 = win.matchMedia("(color-gamut: p3)").matches;
    } catch {
      hdrDisplay = false;
      displayP3 = false;
    }
  }
  let float16Canvas = false;
  if (doc && typeof doc.createElement === "function") {
    try {
      const canvas = doc.createElement("canvas");
      const ctx = canvas.getContext("2d", {
        colorSpace: "display-p3",
        colorType: "float16",
      } as CanvasRenderingContext2DSettings & { colorType?: string });
      if (ctx && typeof ctx.getContextAttributes === "function") {
        const attrs = ctx.getContextAttributes() as { colorSpace?: string; colorType?: string };
        displayP3 = displayP3 || attrs.colorSpace === "display-p3";
        float16Canvas = attrs.colorType === "float16";
      }
    } catch {
      float16Canvas = false;
    }
  }
  return {
    hdrDisplay,
    displayP3,
    float16Canvas,
    recommendedColorSpace: displayP3 ? "display-p3" : "srgb",
  };
}

export function detectChromeNextGenCapabilities(
  env?: ChromeNextGenRuntimeEnv,
): ChromeNextGenCapabilities {
  const resolved = resolveRuntimeEnv(env);
  const { win, doc, nav, scriptSupports } = resolved;
  const globalObj = globalThis as unknown as {
    readonly scheduler?: { readonly yield?: unknown };
    readonly PressureObserver?: unknown;
    readonly VideoEncoder?: unknown;
    readonly VideoFrame?: unknown;
    readonly AudioWorkletNode?: unknown;
    readonly AudioContext?: unknown;
  };

  const viewTransitions = typeof doc?.startViewTransition === "function";
  const schedulerYield =
    typeof win?.scheduler?.yield === "function" || typeof globalObj.scheduler?.yield === "function";
  const computePressure =
    typeof win?.PressureObserver === "function" || typeof globalObj.PressureObserver === "function";
  const eyeDropper = typeof win?.EyeDropper === "function";
  const localFontAccess = typeof win?.queryLocalFonts === "function";
  const documentPictureInPicture = typeof win?.documentPictureInPicture?.requestWindow === "function";
  const webnn = typeof nav?.ml?.createContext === "function";
  const hdrProbe = probeCanvasHdrDisplayP3(resolved);
  const canvasHdrDisplayP3 = hdrProbe.displayP3 || hdrProbe.hdrDisplay || hdrProbe.float16Canvas;
  const speculationRules = Boolean(scriptSupports?.("speculationrules"));
  const audioWorklet =
    typeof (win?.AudioWorkletNode ?? globalObj.AudioWorkletNode) === "function" &&
    typeof globalObj.AudioContext === "function";
  const webCodecs =
    typeof (win?.VideoEncoder ?? globalObj.VideoEncoder) === "function" &&
    typeof (win?.VideoFrame ?? globalObj.VideoFrame) === "function";

  const features: readonly ChromeNextGenFeatureStatus[] = [
    {
      id: "viewTransitions",
      supported: viewTransitions,
      labelKo: "부드러운 화면 전환",
      labelEn: "Smooth View Transitions",
      fallbackLabelKo: "즉시 전환 모드",
      fallbackLabelEn: "Instant switch mode",
    },
    {
      id: "schedulerYield",
      supported: schedulerYield,
      labelKo: "끊김 없는 작업 분산",
      labelEn: "Responsive Task Yield",
      fallbackLabelKo: "표준 타이머 분산",
      fallbackLabelEn: "Standard timer yield",
    },
    {
      id: "computePressure",
      supported: computePressure,
      labelKo: "기기 발열·성능 보호",
      labelEn: "Device Thermal Guard",
      fallbackLabelKo: "수동 성능 조절",
      fallbackLabelEn: "Manual speed control",
    },
    {
      id: "eyeDropper",
      supported: eyeDropper,
      labelKo: "화면 전체 색 뽑기",
      labelEn: "Screen Color Picker",
      fallbackLabelKo: "추천 색 팔레트",
      fallbackLabelEn: "Preset color swatches",
    },
    {
      id: "localFontAccess",
      supported: localFontAccess,
      labelKo: "내 PC 글꼴 바로 쓰기",
      labelEn: "Local Font Library",
      fallbackLabelKo: "웹툰 기본 추천 글꼴",
      fallbackLabelEn: "Bundled webtoon fonts",
    },
    {
      id: "documentPictureInPicture",
      supported: documentPictureInPicture,
      labelKo: "떠다니는 참고 보조창",
      labelEn: "Floating Reference Window",
      fallbackLabelKo: "화면 안 접이식 패널",
      fallbackLabelEn: "Inline reference panel",
    },
    {
      id: "webnn",
      supported: webnn,
      labelKo: "기기 AI 가속 엔진",
      labelEn: "On-Device AI Acceleration",
      fallbackLabelKo: "브라우저 표준 연산",
      fallbackLabelEn: "Standard browser compute",
    },
    {
      id: "canvasHdrDisplayP3",
      supported: canvasHdrDisplayP3,
      labelKo: "생생한 광색역·HDR 표현",
      labelEn: "Vivid P3 & HDR Canvas",
      fallbackLabelKo: "표준 sRGB 색감",
      fallbackLabelEn: "Standard sRGB gamut",
    },
    {
      id: "speculationRules",
      supported: speculationRules,
      labelKo: "다음 화면 미리 준비",
      labelEn: "Instant Page Preload",
      fallbackLabelKo: "일반 이동 방식",
      fallbackLabelEn: "Standard navigation",
    },
    {
      id: "audioWorklet",
      supported: audioWorklet,
      labelKo: "저지연 효과음·배경음",
      labelEn: "Low-Latency Studio Audio",
      fallbackLabelKo: "오프라인 믹스 플랜",
      fallbackLabelEn: "Offline mix planner",
    },
    {
      id: "webCodecs",
      supported: webCodecs,
      labelKo: "고속 30초 컷츠 인코딩",
      labelEn: "Fast WebCodecs Video",
      fallbackLabelKo: "호환 스토리보드 저장",
      fallbackLabelEn: "Compatible storyboard save",
    },
  ];

  const supportedCount = features.filter((item) => item.supported).length;
  const totalCount = features.length;
  const tier =
    supportedCount >= 8 ? "nextgen-full" : supportedCount >= 3 ? "progressive" : "compat-fallback";

  return {
    viewTransitions,
    schedulerYield,
    computePressure,
    eyeDropper,
    localFontAccess,
    documentPictureInPicture,
    webnn,
    canvasHdrDisplayP3,
    speculationRules,
    audioWorklet,
    webCodecs,
    supportedCount,
    totalCount,
    tier,
    features,
  };
}

export interface ScopedViewTransitionResult {
  readonly usedViewTransition: boolean;
  readonly reason: "applied" | "reduced-motion" | "unsupported";
  readonly finished: Promise<void>;
}

/** View Transitions API 스코프 전환 헬퍼 (prefers-reduced-motion 자동 존중). */
export function runScopedViewTransition(
  updateDom: () => void | Promise<void>,
  options?: {
    readonly scopeName?: string;
    readonly transitionTypes?: readonly string[];
    readonly env?: ChromeNextGenRuntimeEnv;
  },
): ScopedViewTransitionResult {
  const resolved = resolveRuntimeEnv(options?.env);
  if (prefersReducedMotion(resolved)) {
    const result = Promise.resolve(updateDom()).then(() => undefined);
    return { usedViewTransition: false, reason: "reduced-motion", finished: result };
  }
  const startTransition = resolved.doc?.startViewTransition;
  if (typeof startTransition !== "function") {
    const result = Promise.resolve(updateDom()).then(() => undefined);
    return { usedViewTransition: false, reason: "unsupported", finished: result };
  }
  const root = resolved.doc?.documentElement;
  if (root && options?.scopeName) {
    root.dataset.vtScope = options.scopeName;
  }
  let transition: ViewTransitionLike;
  try {
    transition =
      options?.transitionTypes && options.transitionTypes.length > 0
        ? startTransition.call(resolved.doc, { update: updateDom, types: options.transitionTypes })
        : startTransition.call(resolved.doc, updateDom);
  } catch {
    transition = startTransition.call(resolved.doc, updateDom);
  }
  const finished = Promise.resolve(transition.finished)
    .catch(() => undefined)
    .finally(() => {
      if (root && options?.scopeName && root.dataset.vtScope === options.scopeName) {
        delete root.dataset.vtScope;
      }
    });
  return { usedViewTransition: true, reason: "applied", finished };
}

/** scheduler.yield() 우선 메인 스레드 양보 + 안전한 setTimeout(0) 폴백. */
export async function yieldToMainThread(options?: {
  readonly signal?: AbortSignal;
  readonly env?: ChromeNextGenRuntimeEnv;
}): Promise<{ readonly mechanism: "scheduler-yield" | "timeout-fallback" }> {
  if (options?.signal?.aborted) {
    throw new DOMException("작업이 취소되었습니다.", "AbortError");
  }
  const resolved = resolveRuntimeEnv(options?.env);
  const globalScheduler = (
    globalThis as unknown as {
      readonly scheduler?: { readonly yield?: (opts?: { signal?: AbortSignal }) => Promise<void> };
    }
  ).scheduler;
  const yieldFn = resolved.win?.scheduler?.yield ?? globalScheduler?.yield;
  if (typeof yieldFn === "function") {
    await yieldFn(options?.signal ? { signal: options.signal } : undefined);
    return { mechanism: "scheduler-yield" };
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  return { mechanism: "timeout-fallback" };
}

export const COMPUTE_PRESSURE_POLICIES: Readonly<
  Record<ComputePressureState, ComputePressureThrottlePolicy>
> = Object.freeze({
  nominal: {
    state: "nominal",
    maxConcurrentWorkers: 4,
    targetFps: 60,
    yieldEveryNFrames: 4,
    previewScale: 1,
    labelKo: "쾌적 (최대 속도)",
    labelEn: "Nominal (Full speed)",
    guidanceKo: "기기가 여유로워 60fps 풀 화질로 작업합니다.",
    guidanceEn: "Device is cool and running at full 60fps.",
  },
  fair: {
    state: "fair",
    maxConcurrentWorkers: 3,
    targetFps: 45,
    yieldEveryNFrames: 2,
    previewScale: 0.85,
    labelKo: "보통 (균형 모드)",
    labelEn: "Fair (Balanced)",
    guidanceKo: "화면 버벅임을 막기 위해 백그라운드 작업 수를 부드럽게 조절합니다.",
    guidanceEn: "Balancing background tasks to keep drawing smooth.",
  },
  serious: {
    state: "serious",
    maxConcurrentWorkers: 2,
    targetFps: 30,
    yieldEveryNFrames: 1,
    previewScale: 0.7,
    labelKo: "바쁨 (부하 절감)",
    labelEn: "Serious (Load saver)",
    guidanceKo: "기기 부하가 높아 프레임마다 숨을 고르며 안정적으로 처리합니다.",
    guidanceEn: "High load detected; yielding each frame to keep controls responsive.",
  },
  critical: {
    state: "critical",
    maxConcurrentWorkers: 1,
    targetFps: 15,
    yieldEveryNFrames: 1,
    previewScale: 0.5,
    labelKo: "절전 보호 (발열 주의)",
    labelEn: "Critical (Thermal guard)",
    guidanceKo: "발열·배터리 보호를 위해 단일 작업으로 천천히 안전하게 저장합니다.",
    guidanceEn: "Thermal protection active; safely processing one task at a time.",
  },
});

export function getComputePressurePolicy(
  state: ComputePressureState,
): ComputePressureThrottlePolicy {
  return COMPUTE_PRESSURE_POLICIES[state] ?? COMPUTE_PRESSURE_POLICIES.nominal;
}

export interface ComputePressureMonitorHandle {
  readonly supported: boolean;
  readonly getState: () => ComputePressureState;
  readonly getPolicy: () => ComputePressureThrottlePolicy;
  readonly disconnect: () => void;
}

export function createComputePressureMonitor(
  onChange: (policy: ComputePressureThrottlePolicy) => void,
  options?: {
    readonly sampleIntervalMs?: number;
    readonly env?: ChromeNextGenRuntimeEnv;
  },
): ComputePressureMonitorHandle {
  const resolved = resolveRuntimeEnv(options?.env);
  const ObserverCtor =
    resolved.win?.PressureObserver ??
    (globalThis as unknown as { readonly PressureObserver?: PressureObserverConstructorLike })
      .PressureObserver;

  let currentState: ComputePressureState = "nominal";
  if (typeof ObserverCtor !== "function") {
    return {
      supported: false,
      getState: () => currentState,
      getPolicy: () => getComputePressurePolicy(currentState),
      disconnect: () => undefined,
    };
  }

  let observer: InstanceType<PressureObserverConstructorLike> | null = null;
  try {
    observer = new ObserverCtor((records) => {
      const latest = records[records.length - 1];
      if (!latest) return;
      if (latest.state !== currentState) {
        currentState = latest.state;
        onChange(getComputePressurePolicy(currentState));
      }
    });
    void Promise.resolve(
      observer.observe("cpu", { sampleInterval: options?.sampleIntervalMs ?? 1_000 }),
    ).catch(() => undefined);
  } catch {
    observer = null;
  }

  return {
    supported: observer !== null,
    getState: () => currentState,
    getPolicy: () => getComputePressurePolicy(currentState),
    disconnect: () => {
      try {
        observer?.disconnect();
      } catch {
        // 이미 해제된 관찰자는 조용히 무시한다.
      }
    },
  };
}
