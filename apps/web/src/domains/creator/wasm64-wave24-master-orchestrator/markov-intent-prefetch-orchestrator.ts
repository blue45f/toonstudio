/**
 * 1·2차 마르코프 도구 전이 예측 기반 지연 모듈 프리페치 오케스트레이터 (`₩0 로컬 · 0B 초기 번들 영향`).
 *
 * - 작업 단계(`sketch`, `ink`, `flat-color`, `shade`, `3d-stage`, `lettering`, `audio-motion`, `publish-qa`) 간
 *   실시간 전이 빈도를 라플라스 평활화(`Laplace smoothing`)로 학습해 `P(nextStage | prevStage, currentStage)`를 산출한다.
 * - 유휴 프레임 예산(`<= 2ms`), 데이터 절약 모드(`saveData`), 단말 발열 상태(`thermalState`)를 함께 점검하여
 *   임계 확률(`p >= threshold`)을 넘는 상위 `K`개 지연 `wasm64-*` 로더만 선별 호출한다.
 */

export const STUDIO_WORKFLOW_STAGES = Object.freeze([
  "sketch",
  "ink",
  "flat-color",
  "shade",
  "3d-stage",
  "lettering",
  "audio-motion",
  "publish-qa",
] as const);

export type StudioWorkflowStage = (typeof STUDIO_WORKFLOW_STAGES)[number];

export const STUDIO_STAGE_LABELS_KO: Readonly<Record<StudioWorkflowStage, string>> = Object.freeze({
  sketch: "콘티·러프 스케치",
  ink: "선화·펜터치",
  "flat-color": "밑색·틈새 채움",
  shade: "명암·분위기 보정",
  "3d-stage": "3D 배경·인체 배치",
  lettering: "말풍선·효과음 식자",
  "audio-motion": "모션·공간음향 연출",
  "publish-qa": "출간 검수·패키징",
});

/** 유휴 프레임 내 투기적 프리페치 디스패치에 허용되는 절대 상한 시간(밀리초). */
export const MAX_PREFETCH_IDLE_BUDGET_MS = 2.0 as const;

export const DEFAULT_LAPLACE_ALPHA = 1.0 as const;
export const DEFAULT_PREFETCH_THRESHOLD = 0.22 as const;
export const DEFAULT_PREFETCH_TOP_K = 2 as const;
export const DEFAULT_BACKOFF_PRIOR_WEIGHT = 2.0 as const;

export type ThermalRuntimeState = "nominal" | "fair" | "serious" | "critical";

export type EffectiveNetworkKind = "slow-2g" | "2g" | "3g" | "4g";

export type MarkovOrderStrategy = "adaptive" | "second-order" | "first-order";

export type PrefetchSkipReason =
  | "save-data-enabled"
  | "constrained-network"
  | "thermal-throttled"
  | "no-stage-above-threshold"
  | "idle-budget-exhausted";

export interface PrefetchRuntimeEnvironment {
  readonly saveData?: boolean;
  readonly effectiveConnectionType?: EffectiveNetworkKind;
  readonly thermalState?: ThermalRuntimeState;
  readonly idleBudgetMs?: number;
}

export interface Wasm64CapabilityLoaderSpec {
  readonly capabilityId: string;
  readonly stage: StudioWorkflowStage;
  readonly labelKo: string;
  /** 로더 기동 시 메인 스레드에서 소비되는 동기 스케줄링 예상 비용(밀리초). */
  readonly estimatedDispatchMs: number;
  readonly estimatedBytes: number;
  readonly load: () => Promise<unknown>;
}

export interface StageTransitionPrediction {
  readonly nextStage: StudioWorkflowStage;
  readonly labelKo: string;
  readonly pFirstOrder: number;
  readonly pSecondOrder: number;
  readonly blendLambda: number;
  readonly probability: number;
  readonly firstOrderCount: number;
  readonly secondOrderCount: number;
}

export interface PrefetchDispatchReport {
  readonly prevStage: StudioWorkflowStage | null;
  readonly currentStage: StudioWorkflowStage;
  readonly predictions: readonly StageTransitionPrediction[];
  readonly candidateStages: readonly StudioWorkflowStage[];
  readonly dispatchedCapabilityIds: readonly string[];
  readonly alreadyWarmCapabilityIds: readonly string[];
  readonly deferredCapabilityIds: readonly string[];
  readonly skipReason: PrefetchSkipReason | null;
  readonly effectiveThreshold: number;
  readonly effectiveTopK: number;
  readonly effectiveBudgetMs: number;
  readonly elapsedDispatchMs: number;
  readonly withinIdleBudget: boolean;
  readonly serverCostKrw: 0;
}

export interface MarkovPrefetchTelemetrySnapshot {
  readonly currentStage: StudioWorkflowStage | null;
  readonly prevStage: StudioWorkflowStage | null;
  readonly totalObservedTransitions: number;
  readonly warmCapabilityIds: readonly string[];
  readonly inFlightCapabilityIds: readonly string[];
  readonly failedCapabilityIds: readonly string[];
  readonly dispatchCycleCount: number;
  readonly budgetDeferredCount: number;
  readonly serverCostKrw: 0;
}

export interface MarkovPrefetchOrchestratorOptions {
  readonly laplaceAlpha?: number;
  readonly threshold?: number;
  readonly topK?: number;
  readonly orderStrategy?: MarkovOrderStrategy;
  readonly backoffPriorWeight?: number;
  readonly excludeCurrentStageFromPrefetch?: boolean;
  readonly decayFactor?: number;
  readonly seedStudioWorkflowPriors?: boolean;
  readonly loaders?: readonly Wasm64CapabilityLoaderSpec[];
  readonly nowMs?: () => number;
}

const STAGE_INDEX_MAP: ReadonlyMap<StudioWorkflowStage, number> = new Map(
  STUDIO_WORKFLOW_STAGES.map((stage, index) => [stage, index] as const),
);

const STAGE_COUNT = STUDIO_WORKFLOW_STAGES.length;

/**
 * 기본 연재 공정 흐름을 반영한 표준 초기 전이 시퀀스.
 * `seedStudioWorkflowPriors: true` 옵션이 켜진 경우에만 콜드스타트 보조용으로 주입된다.
 */
export const CANONICAL_STUDIO_WORKFLOW_SEQUENCE: readonly StudioWorkflowStage[] = Object.freeze([
  "sketch",
  "3d-stage",
  "sketch",
  "ink",
  "flat-color",
  "shade",
  "lettering",
  "audio-motion",
  "publish-qa",
]);

function makeLoaderSpec(
  capabilityId: string,
  stage: StudioWorkflowStage,
  labelKo: string,
  estimatedDispatchMs: number,
  estimatedBytes: number,
  load: () => Promise<unknown>,
): Wasm64CapabilityLoaderSpec {
  return Object.freeze({ capabilityId, stage, labelKo, estimatedDispatchMs, estimatedBytes, load });
}

/**
 * 8개 스튜디오 공정별 지연 `wasm64-*` 역량 로더 기본 사양을 생성한다.
 * 모든 `import()`는 함수 본문 내부에 캡슐화되어 모듈 평가 시점 번들 비용이 `0B`로 유지된다.
 */
export function createDefaultWasm64StageCapabilityLoaders(): readonly Wasm64CapabilityLoaderSpec[] {
  return Object.freeze([
    makeLoaderSpec("wasm64-pro-studio-apex", "sketch", "240Hz 스타일러스 예측·컷 시퀀서", 0.35, 42_000, () => import("../wasm64-pro-studio-apex")),
    makeLoaderSpec("wasm64-grid-brush-parallax-telemetry", "ink", "원근 격자 스냅·적응형 펜터치 커널", 0.4, 38_000, () => import("../wasm64-grid-brush-parallax-telemetry")),
    makeLoaderSpec("wasm64-supergap-drawing-3d", "flat-color", "선화 틈새 폐합·자동 밑색 채움", 0.45, 54_000, () => import("../wasm64-supergap-drawing-3d")),
    makeLoaderSpec("wasm64-wave19-atelier-perfection", "shade", "사면체 3D 색보정·분광 명암 셰이더", 0.4, 46_000, () => import("../wasm64-wave19-atelier-perfection")),
    makeLoaderSpec("wasm64-3d-nextgen-render", "3d-stage", "차세대 3D 무대·인체 조명 렌더러", 0.55, 64_000, () => import("../wasm64-3d-nextgen-render")),
    makeLoaderSpec("wasm64-multiwindow-msdf-vrs-cad", "lettering", "다중 윤곽 MSDF 식자·효과음 조판기", 0.35, 40_000, () => import("../wasm64-multiwindow-msdf-vrs-cad")),
    makeLoaderSpec("wasm64-supergap-motion-audio", "audio-motion", "모션툰 메쉬 리깅·공간음향 믹서", 0.5, 58_000, () => import("../wasm64-supergap-motion-audio")),
    makeLoaderSpec("wasm64-wave20-grand-finale", "publish-qa", "옴니채널 출고 무결성·인쇄 검수 게이트", 0.4, 44_000, () => import("../wasm64-wave20-grand-finale")),
  ]);
}

/**
 * 라플라스 평활화 전이 확률 `P = (count + alpha) / (rowTotal + alpha * vocabularySize)`를 계산한다.
 */
export function computeLaplaceSmoothedProbability(
  count: number,
  rowTotal: number,
  laplaceAlpha: number = DEFAULT_LAPLACE_ALPHA,
  vocabularySize: number = STAGE_COUNT,
): number {
  const safeCount = Number.isFinite(count) && count > 0 ? count : 0;
  const safeTotal = Number.isFinite(rowTotal) && rowTotal > 0 ? rowTotal : 0;
  const safeAlpha = Number.isFinite(laplaceAlpha) && laplaceAlpha > 0 ? laplaceAlpha : DEFAULT_LAPLACE_ALPHA;
  const safeVocab = Number.isFinite(vocabularySize) && vocabularySize >= 1 ? Math.floor(vocabularySize) : STAGE_COUNT;
  return (safeCount + safeAlpha) / (safeTotal + safeAlpha * safeVocab);
}

interface NavigatorConnectionLike {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

function probeAmbientNetworkHints(): {
  readonly saveData: boolean;
  readonly effectiveConnectionType: EffectiveNetworkKind | undefined;
} {
  if (typeof navigator === "undefined") {
    return { saveData: false, effectiveConnectionType: undefined };
  }
  const navRecord = navigator as Navigator & { readonly connection?: NavigatorConnectionLike };
  const conn = navRecord.connection;
  if (!conn) {
    return { saveData: false, effectiveConnectionType: undefined };
  }
  const rawType = conn.effectiveType;
  const effectiveConnectionType: EffectiveNetworkKind | undefined =
    rawType === "slow-2g" || rawType === "2g" || rawType === "3g" || rawType === "4g"
      ? rawType
      : undefined;
  return {
    saveData: conn.saveData === true,
    effectiveConnectionType,
  };
}

function defaultMonotonicNowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function clampFinite(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function stageToIndex(stage: StudioWorkflowStage): number {
  const idx = STAGE_INDEX_MAP.get(stage);
  if (idx === undefined) {
    throw new Error(`알 수 없는 스튜디오 공정 단계입니다: ${String(stage)}`);
  }
  return idx;
}

/**
 * 실시간 1·2차 마르코프 전이 학습 및 유휴 예산 기반 `wasm64-*` 모듈 프리페치 조정기.
 */
export class MarkovIntentPrefetchOrchestrator {
  private readonly laplaceAlpha: number;
  private readonly threshold: number;
  private readonly topK: number;
  private readonly orderStrategy: MarkovOrderStrategy;
  private readonly backoffPriorWeight: number;
  private readonly excludeCurrentStageFromPrefetch: boolean;
  private readonly decayFactor: number;
  private readonly nowMs: () => number;
  private readonly loadersByStage: ReadonlyMap<StudioWorkflowStage, readonly Wasm64CapabilityLoaderSpec[]>;

  /** 1차 전이 행렬 `firstOrderCounts[curr * 8 + next]`. */
  private readonly firstOrderCounts: Float64Array;
  /** 2차 전이 텐서 `secondOrderCounts[(prev * 8 + curr) * 8 + next]`. */
  private readonly secondOrderCounts: Float64Array;

  private prevStage: StudioWorkflowStage | null = null;
  private currentStage: StudioWorkflowStage | null = null;
  private totalObservedTransitions = 0;
  private dispatchCycleCount = 0;
  private budgetDeferredCount = 0;

  private readonly warmCapabilityIds = new Set<string>();
  private readonly failedCapabilityIds = new Set<string>();
  private readonly inFlightPromises = new Map<string, Promise<void>>();

  public constructor(options: MarkovPrefetchOrchestratorOptions = {}) {
    this.laplaceAlpha =
      options.laplaceAlpha !== undefined && Number.isFinite(options.laplaceAlpha) && options.laplaceAlpha > 0
        ? options.laplaceAlpha
        : DEFAULT_LAPLACE_ALPHA;
    this.threshold = clampFinite(options.threshold, 0.01, 1.0, DEFAULT_PREFETCH_THRESHOLD);
    this.topK = Math.round(clampFinite(options.topK, 1, STAGE_COUNT, DEFAULT_PREFETCH_TOP_K));
    this.orderStrategy = options.orderStrategy ?? "adaptive";
    this.backoffPriorWeight = clampFinite(options.backoffPriorWeight, 0, 64, DEFAULT_BACKOFF_PRIOR_WEIGHT);
    this.excludeCurrentStageFromPrefetch = options.excludeCurrentStageFromPrefetch ?? true;
    this.decayFactor = clampFinite(options.decayFactor, 0.1, 1.0, 1.0);
    this.nowMs = options.nowMs ?? defaultMonotonicNowMs;

    this.firstOrderCounts = new Float64Array(STAGE_COUNT * STAGE_COUNT);
    this.secondOrderCounts = new Float64Array(STAGE_COUNT * STAGE_COUNT * STAGE_COUNT);

    const specs = options.loaders ?? createDefaultWasm64StageCapabilityLoaders();
    const grouped = new Map<StudioWorkflowStage, Wasm64CapabilityLoaderSpec[]>();
    for (const stage of STUDIO_WORKFLOW_STAGES) {
      grouped.set(stage, []);
    }
    for (const spec of specs) {
      stageToIndex(spec.stage);
      const bucket = grouped.get(spec.stage);
      if (bucket) {
        bucket.push(spec);
      }
    }
    const frozenGrouped = new Map<StudioWorkflowStage, readonly Wasm64CapabilityLoaderSpec[]>();
    for (const [stage, list] of grouped.entries()) {
      frozenGrouped.set(stage, Object.freeze([...list]));
    }
    this.loadersByStage = frozenGrouped;

    if (options.seedStudioWorkflowPriors === true) {
      this.trainStageTrajectory(CANONICAL_STUDIO_WORKFLOW_SEQUENCE);
      this.prevStage = null;
      this.currentStage = null;
    }
  }

  /**
   * 단일 전이 사건 `(prevStage?, fromStage -> toStage)`를 온라인 학습한다.
   */
  public recordTransition(
    fromStage: StudioWorkflowStage,
    toStage: StudioWorkflowStage,
    prevStage?: StudioWorkflowStage | null,
    weight: number = 1.0,
  ): void {
    if (!Number.isFinite(weight) || weight <= 0) {
      return;
    }
    const fromIdx = stageToIndex(fromStage);
    const toIdx = stageToIndex(toStage);

    if (this.decayFactor < 1.0) {
      const rowOffset = fromIdx * STAGE_COUNT;
      for (let i = 0; i < STAGE_COUNT; i += 1) {
        const currentVal = this.firstOrderCounts[rowOffset + i] ?? 0;
        this.firstOrderCounts[rowOffset + i] = currentVal * this.decayFactor;
      }
    }

    const firstCell = fromIdx * STAGE_COUNT + toIdx;
    this.firstOrderCounts[firstCell] = (this.firstOrderCounts[firstCell] ?? 0) + weight;

    if (prevStage !== undefined && prevStage !== null) {
      const prevIdx = stageToIndex(prevStage);
      const bigramOffset = (prevIdx * STAGE_COUNT + fromIdx) * STAGE_COUNT;
      if (this.decayFactor < 1.0) {
        for (let i = 0; i < STAGE_COUNT; i += 1) {
          const currentVal = this.secondOrderCounts[bigramOffset + i] ?? 0;
          this.secondOrderCounts[bigramOffset + i] = currentVal * this.decayFactor;
        }
      }
      const secondCell = bigramOffset + toIdx;
      this.secondOrderCounts[secondCell] = (this.secondOrderCounts[secondCell] ?? 0) + weight;
    }

    this.totalObservedTransitions += 1;
  }

  /**
   * 사용자의 공정 진입을 순서대로 관찰하여 내부 `(prevStage, currentStage)` 문맥과 전이 빈도를 갱신한다.
   */
  public observeStageEnter(nextStage: StudioWorkflowStage): void {
    stageToIndex(nextStage);
    if (this.currentStage === null) {
      this.currentStage = nextStage;
      return;
    }
    if (this.currentStage === nextStage) {
      return;
    }
    this.recordTransition(this.currentStage, nextStage, this.prevStage);
    this.prevStage = this.currentStage;
    this.currentStage = nextStage;
  }

  /**
   * 과거 작업 단계 시퀀스를 일괄 주입하여 1·2차 전이 분포를 학습한다.
   */
  public trainStageTrajectory(stages: readonly StudioWorkflowStage[]): void {
    let prev: StudioWorkflowStage | null = null;
    let curr: StudioWorkflowStage | null = null;
    for (const next of stages) {
      stageToIndex(next);
      if (curr !== null && curr !== next) {
        this.recordTransition(curr, next, prev);
        prev = curr;
        curr = next;
      } else if (curr === null) {
        curr = next;
      }
    }
    this.prevStage = prev;
    this.currentStage = curr;
  }

  /**
   * 주어진 `(prevStage, currentStage)` 문맥에서 8개 전체 공정의 라플라스 평활화 전이 확률 분포를 계산한다.
   * 반환 배열의 `probability` 총합은 항상 `1.0`(`±1e-9`)을 만족하며 내림차순 정렬된다.
   */
  public predictNextStages(
    currentStage?: StudioWorkflowStage,
    prevStage?: StudioWorkflowStage | null,
  ): readonly StageTransitionPrediction[] {
    const resolvedCurrent = currentStage ?? this.currentStage ?? "sketch";
    const resolvedPrev =
      currentStage !== undefined
        ? (prevStage ?? null)
        : (prevStage !== undefined ? prevStage : this.prevStage);

    const currIdx = stageToIndex(resolvedCurrent);
    const firstRowOffset = currIdx * STAGE_COUNT;
    let firstRowTotal = 0;
    for (let i = 0; i < STAGE_COUNT; i += 1) {
      firstRowTotal += this.firstOrderCounts[firstRowOffset + i] ?? 0;
    }

    const hasPrev = resolvedPrev !== null;
    const prevIdx = hasPrev ? stageToIndex(resolvedPrev) : -1;
    const secondRowOffset = hasPrev ? (prevIdx * STAGE_COUNT + currIdx) * STAGE_COUNT : 0;
    let secondRowTotal = 0;
    if (hasPrev) {
      for (let i = 0; i < STAGE_COUNT; i += 1) {
        secondRowTotal += this.secondOrderCounts[secondRowOffset + i] ?? 0;
      }
    }

    const blendLambda =
      this.orderStrategy === "first-order" || !hasPrev
        ? 0
        : this.orderStrategy === "second-order"
          ? 1
          : this.backoffPriorWeight <= 0
            ? (secondRowTotal > 0 ? 1 : 0)
            : secondRowTotal / (secondRowTotal + this.backoffPriorWeight);

    const predictions: StageTransitionPrediction[] = [];
    for (let nextIdx = 0; nextIdx < STAGE_COUNT; nextIdx += 1) {
      const nextStage = STUDIO_WORKFLOW_STAGES[nextIdx];
      if (nextStage === undefined) {
        continue;
      }
      const c1 = this.firstOrderCounts[firstRowOffset + nextIdx] ?? 0;
      const p1 = computeLaplaceSmoothedProbability(c1, firstRowTotal, this.laplaceAlpha, STAGE_COUNT);
      const c2 = hasPrev ? (this.secondOrderCounts[secondRowOffset + nextIdx] ?? 0) : 0;
      const p2 = hasPrev
        ? computeLaplaceSmoothedProbability(c2, secondRowTotal, this.laplaceAlpha, STAGE_COUNT)
        : p1;
      const probability = blendLambda * p2 + (1 - blendLambda) * p1;

      predictions.push(
        Object.freeze({
          nextStage,
          labelKo: STUDIO_STAGE_LABELS_KO[nextStage],
          pFirstOrder: p1,
          pSecondOrder: p2,
          blendLambda,
          probability,
          firstOrderCount: c1,
          secondOrderCount: c2,
        }),
      );
    }

    predictions.sort((a, b) => {
      const diff = b.probability - a.probability;
      if (Math.abs(diff) > 1e-12) {
        return diff;
      }
      return stageToIndex(a.nextStage) - stageToIndex(b.nextStage);
    });

    return Object.freeze(predictions);
  }

  /**
   * 유휴 프레임 예산(`<= 2ms`), 네트워크 절약 설정, 발열 상태를 준수하며 상위 K개 지연 모듈만 프리페치한다.
   */
  public prefetchSpeculativeCapabilities(
    env: PrefetchRuntimeEnvironment = {},
    overrideContext?: {
      readonly currentStage: StudioWorkflowStage;
      readonly prevStage?: StudioWorkflowStage | null;
    },
  ): PrefetchDispatchReport {
    this.dispatchCycleCount += 1;
    const sliceStartMs = this.nowMs();

    const resolvedCurrent = overrideContext?.currentStage ?? this.currentStage ?? "sketch";
    const resolvedPrev =
      overrideContext !== undefined
        ? (overrideContext.prevStage ?? null)
        : this.prevStage;

    const predictions = this.predictNextStages(resolvedCurrent, resolvedPrev);
    const ambientNet = probeAmbientNetworkHints();
    const saveData = env.saveData ?? ambientNet.saveData;
    const connectionType = env.effectiveConnectionType ?? ambientNet.effectiveConnectionType;
    const thermalState: ThermalRuntimeState = env.thermalState ?? "nominal";

    const requestedBudget = clampFinite(
      env.idleBudgetMs,
      0,
      MAX_PREFETCH_IDLE_BUDGET_MS,
      MAX_PREFETCH_IDLE_BUDGET_MS,
    );
    const effectiveBudgetMs =
      thermalState === "fair"
        ? Math.min(requestedBudget, 1.0)
        : Math.min(requestedBudget, MAX_PREFETCH_IDLE_BUDGET_MS);

    const effectiveThreshold =
      thermalState === "fair" ? Math.max(this.threshold, 0.32) : this.threshold;
    const effectiveTopK =
      thermalState === "fair" ? Math.min(this.topK, 1) : this.topK;

    const buildAbortedReport = (skipReason: PrefetchSkipReason): PrefetchDispatchReport => {
      const elapsedDispatchMs = Math.max(0, this.nowMs() - sliceStartMs);
      return Object.freeze({
        prevStage: resolvedPrev,
        currentStage: resolvedCurrent,
        predictions,
        candidateStages: Object.freeze([]),
        dispatchedCapabilityIds: Object.freeze([]),
        alreadyWarmCapabilityIds: Object.freeze([]),
        deferredCapabilityIds: Object.freeze([]),
        skipReason,
        effectiveThreshold,
        effectiveTopK,
        effectiveBudgetMs,
        elapsedDispatchMs,
        withinIdleBudget: elapsedDispatchMs <= MAX_PREFETCH_IDLE_BUDGET_MS,
        serverCostKrw: 0,
      });
    };

    if (saveData) {
      return buildAbortedReport("save-data-enabled");
    }
    if (connectionType === "slow-2g" || connectionType === "2g") {
      return buildAbortedReport("constrained-network");
    }
    if (thermalState === "serious" || thermalState === "critical") {
      return buildAbortedReport("thermal-throttled");
    }

    const candidateStages: StudioWorkflowStage[] = [];
    for (const item of predictions) {
      if (this.excludeCurrentStageFromPrefetch && item.nextStage === resolvedCurrent) {
        continue;
      }
      if (item.probability < effectiveThreshold) {
        continue;
      }
      candidateStages.push(item.nextStage);
      if (candidateStages.length >= effectiveTopK) {
        break;
      }
    }

    if (candidateStages.length === 0) {
      return buildAbortedReport("no-stage-above-threshold");
    }

    const dispatchedCapabilityIds: string[] = [];
    const alreadyWarmCapabilityIds: string[] = [];
    const deferredCapabilityIds: string[] = [];
    let committedDispatchMs = 0;

    for (const stage of candidateStages) {
      const specs = this.loadersByStage.get(stage) ?? [];
      for (const spec of specs) {
        if (this.warmCapabilityIds.has(spec.capabilityId) || this.inFlightPromises.has(spec.capabilityId)) {
          alreadyWarmCapabilityIds.push(spec.capabilityId);
          continue;
        }

        const elapsedBefore = Math.max(0, this.nowMs() - sliceStartMs);
        const estimatedOverhead = Math.max(0, spec.estimatedDispatchMs);
        const consumedMs = Math.max(elapsedBefore, committedDispatchMs);
        if (consumedMs >= effectiveBudgetMs || consumedMs + estimatedOverhead > effectiveBudgetMs) {
          deferredCapabilityIds.push(spec.capabilityId);
          this.budgetDeferredCount += 1;
          continue;
        }

        this.failedCapabilityIds.delete(spec.capabilityId);
        const task = Promise.resolve()
          .then(() => spec.load())
          .then(() => {
            this.warmCapabilityIds.add(spec.capabilityId);
          })
          .catch(() => {
            this.failedCapabilityIds.add(spec.capabilityId);
          })
          .finally(() => {
            this.inFlightPromises.delete(spec.capabilityId);
          });

        this.inFlightPromises.set(spec.capabilityId, task);
        dispatchedCapabilityIds.push(spec.capabilityId);
        committedDispatchMs = consumedMs + estimatedOverhead;
      }
    }

    const elapsedDispatchMs = Math.max(0, this.nowMs() - sliceStartMs);
    const skipReason: PrefetchSkipReason | null =
      dispatchedCapabilityIds.length === 0 && deferredCapabilityIds.length > 0
        ? "idle-budget-exhausted"
        : null;

    return Object.freeze({
      prevStage: resolvedPrev,
      currentStage: resolvedCurrent,
      predictions,
      candidateStages: Object.freeze(candidateStages),
      dispatchedCapabilityIds: Object.freeze(dispatchedCapabilityIds),
      alreadyWarmCapabilityIds: Object.freeze(alreadyWarmCapabilityIds),
      deferredCapabilityIds: Object.freeze(deferredCapabilityIds),
      skipReason,
      effectiveThreshold,
      effectiveTopK,
      effectiveBudgetMs,
      elapsedDispatchMs,
      withinIdleBudget: elapsedDispatchMs <= MAX_PREFETCH_IDLE_BUDGET_MS,
      serverCostKrw: 0,
    });
  }

  /**
   * 현재 진행 중인 비동기 프리페치 작업이 모두 마무리될 때까지 대기한다.
   */
  public async awaitInFlightPrefetches(): Promise<void> {
    const pending = [...this.inFlightPromises.values()];
    if (pending.length > 0) {
      await Promise.allSettled(pending);
    }
  }

  /**
   * 특정 `wasm64-*` 역량 모듈이 이미 메모리에 예열 완료되었는지 확인한다.
   */
  public isCapabilityWarm(capabilityId: string): boolean {
    return this.warmCapabilityIds.has(capabilityId);
  }

  /**
   * 현재 학습 상태와 예열 완료·대기·실패 지표를 스냅샷으로 반환한다.
   */
  public getTelemetrySnapshot(): MarkovPrefetchTelemetrySnapshot {
    return Object.freeze({
      currentStage: this.currentStage,
      prevStage: this.prevStage,
      totalObservedTransitions: this.totalObservedTransitions,
      warmCapabilityIds: Object.freeze([...this.warmCapabilityIds].sort()),
      inFlightCapabilityIds: Object.freeze([...this.inFlightPromises.keys()].sort()),
      failedCapabilityIds: Object.freeze([...this.failedCapabilityIds].sort()),
      dispatchCycleCount: this.dispatchCycleCount,
      budgetDeferredCount: this.budgetDeferredCount,
      serverCostKrw: 0,
    });
  }
}
