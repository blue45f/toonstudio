/**
 * 고정 시드 실시간 스케치·3D 뷰포트→고스트 프리뷰 디바운스 브리지.
 *
 * Krea.ai Realtime, Freepik Pikaso, Krita AI Diffusion Live Painting의
 * 핵심 제어 패턴(고정 시드, 상상력 강도, 단일 인플라이트 취소, 최신 프레임 우선 큐,
 * 고스트 프리뷰 분할 커튼, 명시적 비파괴 레이어 확정)을 순수 상태 머신으로 구현한다.
 * 로컬 브리지나 BYOK 키가 연결되지 않았을 때는 가짜 렌더를 위조하지 않고 정직한 연결 안내를 반환한다.
 */

export type RealtimeSourceKind = "sketch-2d" | "viewport-3d" | "hybrid-2d-3d";

export type RealtimeProviderStatus =
  | "disconnected"
  | "local-bridge-ready"
  | "byok-ready";

export interface CanvasTileSignature {
  readonly tileX: number;
  readonly tileY: number;
  readonly width: number;
  readonly height: number;
  readonly contentChecksum: string;
}

export interface Viewport3dFrameSignature {
  readonly cameraHash: string;
  readonly depthChecksum: string;
  readonly poseChecksum?: string;
  readonly width: number;
  readonly height: number;
}

export interface RealtimeSketchInputFrame {
  readonly sourceKind: RealtimeSourceKind;
  readonly tiles: readonly CanvasTileSignature[];
  readonly viewport3d?: Viewport3dFrameSignature;
  readonly prompt: string;
}

export interface RealtimeBridgeConfig {
  readonly enabled: boolean;
  readonly sourceKind: RealtimeSourceKind;
  readonly providerStatus: RealtimeProviderStatus;
  readonly constantSeed: number;
  readonly seedLocked: boolean;
  /** 선화 추종도 대비 AI 변형 허용 강도 (0.05..0.95). */
  readonly imaginationStrength: number;
  /** 고스트 프리뷰 합성 투명도 (0..1). */
  readonly ghostOpacity: number;
  /** 전/후 분할 비교 커튼 비율 (0..1, 1이면 전체 고스트 표시). */
  readonly splitCurtainRatio: number;
  readonly baseDebounceMs: number;
  readonly minDebounceMs: number;
  readonly maxDebounceMs: number;
  /** 분당 최대 예상 크레딧 예산 (로컬 GPU 모드는 0으로 무과금 처리). */
  readonly maxCreditsPerMinute: number;
  readonly creditsPerFrame: number;
}

export interface RealtimeRenderDispatchRequest {
  readonly requestId: string;
  readonly frameDigest: string;
  readonly dirtyTileKeys: readonly string[];
  readonly effectiveSeed: number;
  readonly denoiseStrength: number;
  readonly sourceKind: RealtimeSourceKind;
  readonly prompt: string;
  readonly estimatedCredits: number;
  readonly dispatchedAtMs: number;
}

export interface RealtimeRenderIncomingResult {
  readonly requestId: string;
  readonly frameDigest: string;
  readonly effectiveSeed: number;
  readonly previewAssetRef: string;
  readonly width: number;
  readonly height: number;
  readonly completedAtMs: number;
}

export interface GhostPreviewState {
  readonly status: "empty" | "previewing" | "committed" | "discarded";
  readonly requestId: string | null;
  readonly frameDigest: string | null;
  readonly effectiveSeed: number | null;
  readonly previewAssetRef: string | null;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly splitCurtainRatio: number;
  readonly updatedAtMs: number | null;
}

export interface CommittedGhostLayerDraft {
  readonly layerId: string;
  readonly layerName: string;
  readonly insertMode: "new-layer-above";
  readonly overwritesOriginal: false;
  readonly previewAssetRef: string;
  readonly frameDigest: string;
  readonly effectiveSeed: number;
  readonly imaginationStrength: number;
  readonly committedAtMs: number;
}

export type SubmitFrameOutcome =
  | {
      readonly accepted: true;
      readonly scheduledAtMs: number;
      readonly frameDigest: string;
      readonly dirtyTileCount: number;
      readonly supersededPending: boolean;
      readonly cancelInFlightRequestId: string | null;
    }
  | {
      readonly accepted: false;
      readonly reason:
        | "disabled"
        | "unchanged"
        | "provider-disconnected"
        | "budget-exceeded";
      readonly guidanceKo: string;
    };

export interface RealtimeBridgeTelemetry {
  readonly enabled: boolean;
  readonly providerStatus: RealtimeProviderStatus;
  readonly activeDebounceMs: number;
  readonly ewmaRttMs: number | null;
  readonly inFlightRequestId: string | null;
  readonly hasQueuedLatest: boolean;
  readonly dispatchedCount: number;
  readonly completedCount: number;
  readonly droppedStaleCount: number;
  readonly cancelledCount: number;
  readonly creditsUsedLastMinute: number;
  readonly remainingMinuteCredits: number;
  readonly ghostPreview: GhostPreviewState;
}

export const DEFAULT_REALTIME_BRIDGE_CONFIG: RealtimeBridgeConfig = Object.freeze({
  enabled: true,
  sourceKind: "sketch-2d",
  providerStatus: "local-bridge-ready",
  constantSeed: 104729,
  seedLocked: true,
  imaginationStrength: 0.45,
  ghostOpacity: 0.72,
  splitCurtainRatio: 1,
  baseDebounceMs: 120,
  minDebounceMs: 60,
  maxDebounceMs: 420,
  maxCreditsPerMinute: 60,
  creditsPerFrame: 1,
});

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function hashStringDeterministic(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function tileKey(tile: Pick<CanvasTileSignature, "tileX" | "tileY">): string {
  return `${tile.tileX}:${tile.tileY}`;
}

export function diffDirtyTiles(
  previousMap: ReadonlyMap<string, string>,
  nextTiles: readonly CanvasTileSignature[],
): readonly string[] {
  const dirty: string[] = [];
  const nextKeys = new Set<string>();
  for (const tile of nextTiles) {
    const key = tileKey(tile);
    nextKeys.add(key);
    if (previousMap.get(key) !== tile.contentChecksum) {
      dirty.push(key);
    }
  }
  for (const prevKey of previousMap.keys()) {
    if (!nextKeys.has(prevKey)) {
      dirty.push(prevKey);
    }
  }
  dirty.sort();
  return Object.freeze(dirty);
}

export function computeRealtimeInputDigest(
  frame: RealtimeSketchInputFrame,
  config: Pick<RealtimeBridgeConfig, "imaginationStrength" | "seedLocked" | "constantSeed">,
): string {
  const sortedTiles = [...frame.tiles]
    .sort((a, b) => a.tileX - b.tileX || a.tileY - b.tileY)
    .map((t) => `${t.tileX},${t.tileY},${t.width}x${t.height}:${t.contentChecksum}`)
    .join("|");
  const vp3d = frame.viewport3d
    ? `3d:${frame.viewport3d.cameraHash}:${frame.viewport3d.depthChecksum}:${frame.viewport3d.poseChecksum ?? ""}`
    : "3d:none";
  const denoiseKey = Math.round(clampNumber(config.imaginationStrength, 0.05, 0.95) * 1000);
  const seedKey = config.seedLocked ? `lock:${config.constantSeed}` : "free";
  const raw = `${frame.sourceKind}|${frame.prompt.trim()}|${denoiseKey}|${seedKey}|${sortedTiles}|${vp3d}`;
  const h1 = hashStringDeterministic(raw).toString(16).padStart(8, "0");
  const h2 = hashStringDeterministic(`salt:${raw}`).toString(16).padStart(8, "0");
  return `${h1}${h2}`;
}

export function resolveEffectiveSeed(
  config: Pick<RealtimeBridgeConfig, "constantSeed" | "seedLocked">,
  frameDigest: string,
  dispatchSeq: number,
): number {
  const baseSeed = Math.abs(Math.trunc(config.constantSeed)) % 2147483647;
  if (config.seedLocked) {
    return baseSeed;
  }
  return hashStringDeterministic(`${baseSeed}:${dispatchSeq}:${frameDigest}`) % 2147483647;
}

interface PendingFrameSlot {
  readonly frame: RealtimeSketchInputFrame;
  readonly frameDigest: string;
  readonly dirtyTileKeys: readonly string[];
  readonly scheduledAtMs: number;
}

interface InFlightSlot {
  readonly request: RealtimeRenderDispatchRequest;
  readonly cancelled: boolean;
}

interface CreditLedgerItem {
  readonly atMs: number;
  readonly credits: number;
}

/**
 * 실시간 스케치·3D 뷰포트→고스트 프리뷰 브리지 컨트롤러.
 * 외부 타이머 없이 명시적 시각(nowMs)으로 동작해 단위 테스트와 프레임 루프 양쪽에서 결정적이다.
 */
export class StudioRealtimeSketchBridge {
  private config: RealtimeBridgeConfig;
  private readonly lastSubmittedTiles = new Map<string, string>();
  private lastAcceptedDigest: string | null = null;
  private pending: PendingFrameSlot | null = null;
  private inFlight: InFlightSlot | null = null;
  private dispatchSeq = 0;
  private activeDebounceMs: number;
  private ewmaRttMs: number | null = null;
  private dispatchedCount = 0;
  private completedCount = 0;
  private droppedStaleCount = 0;
  private cancelledCount = 0;
  private readonly creditLedger: CreditLedgerItem[] = [];
  private ghostPreview: GhostPreviewState;

  constructor(partialConfig: Partial<RealtimeBridgeConfig> = {}) {
    this.config = this.normalizeConfig({
      ...DEFAULT_REALTIME_BRIDGE_CONFIG,
      ...partialConfig,
    });
    this.activeDebounceMs = this.config.baseDebounceMs;
    this.ghostPreview = Object.freeze({
      status: "empty",
      requestId: null,
      frameDigest: null,
      effectiveSeed: null,
      previewAssetRef: null,
      width: 0,
      height: 0,
      opacity: this.config.ghostOpacity,
      splitCurtainRatio: this.config.splitCurtainRatio,
      updatedAtMs: null,
    });
  }

  private normalizeConfig(raw: RealtimeBridgeConfig): RealtimeBridgeConfig {
    const minDebounceMs = clampNumber(Math.trunc(raw.minDebounceMs), 30, 500);
    const maxDebounceMs = clampNumber(Math.trunc(raw.maxDebounceMs), minDebounceMs, 2000);
    const baseDebounceMs = clampNumber(Math.trunc(raw.baseDebounceMs), minDebounceMs, maxDebounceMs);
    return Object.freeze({
      ...raw,
      constantSeed: Math.abs(Math.trunc(raw.constantSeed)) % 2147483647,
      imaginationStrength: clampNumber(raw.imaginationStrength, 0.05, 0.95),
      ghostOpacity: clampNumber(raw.ghostOpacity, 0, 1),
      splitCurtainRatio: clampNumber(raw.splitCurtainRatio, 0, 1),
      minDebounceMs,
      maxDebounceMs,
      baseDebounceMs,
      maxCreditsPerMinute: Math.max(0, raw.maxCreditsPerMinute),
      creditsPerFrame: Math.max(0, raw.creditsPerFrame),
    });
  }

  getConfig(): RealtimeBridgeConfig {
    return this.config;
  }

  updateConfig(patch: Partial<RealtimeBridgeConfig>): RealtimeBridgeConfig {
    this.config = this.normalizeConfig({ ...this.config, ...patch });
    this.ghostPreview = Object.freeze({
      ...this.ghostPreview,
      opacity: this.config.ghostOpacity,
      splitCurtainRatio: this.config.splitCurtainRatio,
    });
    this.activeDebounceMs = clampNumber(
      this.activeDebounceMs,
      this.config.minDebounceMs,
      this.config.maxDebounceMs,
    );
    return this.config;
  }

  private pruneCreditLedger(nowMs: number): number {
    const cutoff = nowMs - 60_000;
    while (this.creditLedger.length > 0 && (this.creditLedger[0]?.atMs ?? 0) < cutoff) {
      this.creditLedger.shift();
    }
    let sum = 0;
    for (const item of this.creditLedger) sum += item.credits;
    return sum;
  }

  private frameCreditCost(): number {
    if (this.config.providerStatus === "local-bridge-ready") return 0;
    return this.config.creditsPerFrame;
  }

  submitFrame(frame: RealtimeSketchInputFrame, nowMs: number): SubmitFrameOutcome {
    if (!this.config.enabled) {
      return {
        accepted: false,
        reason: "disabled",
        guidanceKo: "실시간 고스트 프리뷰가 꺼져 있습니다. 상단 토글에서 켜고 다시 시도하세요.",
      };
    }

    if (this.config.providerStatus === "disconnected") {
      return {
        accepted: false,
        reason: "provider-disconnected",
        guidanceKo:
          "로컬 GPU 브리지 또는 BYOK 실시간 엔드포인트가 연결되지 않았습니다. 연결 설정 후 실시간 프리뷰를 사용할 수 있습니다.",
      };
    }

    const digest = computeRealtimeInputDigest(frame, this.config);
    const dirtyTileKeys = diffDirtyTiles(this.lastSubmittedTiles, frame.tiles);
    if (digest === this.lastAcceptedDigest) {
      return {
        accepted: false,
        reason: "unchanged",
        guidanceKo: "변경된 타일이나 파라미터가 없어 새 요청을 건너뛰었습니다.",
      };
    }

    const cost = this.frameCreditCost();
    const usedLastMin = this.pruneCreditLedger(nowMs);
    if (cost > 0 && usedLastMin + cost > this.config.maxCreditsPerMinute) {
      return {
        accepted: false,
        reason: "budget-exceeded",
        guidanceKo: "분당 실시간 크레딧 예산 상한에 도달했습니다. 잠시 후 자동 재개되거나 예산을 조정하세요.",
      };
    }

    let supersededPending = false;
    if (this.pending !== null) {
      supersededPending = true;
      this.droppedStaleCount += 1;
    }

    let cancelInFlightRequestId: string | null = null;
    if (this.inFlight !== null && !this.inFlight.cancelled) {
      cancelInFlightRequestId = this.inFlight.request.requestId;
      this.inFlight = Object.freeze({
        ...this.inFlight,
        cancelled: true,
      });
      this.cancelledCount += 1;
    }

    const scheduledAtMs = nowMs + this.activeDebounceMs;
    this.pending = Object.freeze({
      frame,
      frameDigest: digest,
      dirtyTileKeys,
      scheduledAtMs,
    });
    this.lastAcceptedDigest = digest;
    this.lastSubmittedTiles.clear();
    for (const t of frame.tiles) {
      this.lastSubmittedTiles.set(tileKey(t), t.contentChecksum);
    }

    return Object.freeze({
      accepted: true,
      scheduledAtMs,
      frameDigest: digest,
      dirtyTileCount: dirtyTileKeys.length,
      supersededPending,
      cancelInFlightRequestId,
    });
  }

  /**
   * 디바운스 시점이 도래한 최신 프레임을 단일 인플라이트 요청으로 방출한다.
   */
  pollDispatch(nowMs: number): RealtimeRenderDispatchRequest | null {
    if (!this.config.enabled || this.config.providerStatus === "disconnected") {
      return null;
    }
    if (!this.pending || nowMs < this.pending.scheduledAtMs) {
      return null;
    }
    if (this.inFlight !== null && !this.inFlight.cancelled) {
      return null;
    }

    const cost = this.frameCreditCost();
    const usedLastMin = this.pruneCreditLedger(nowMs);
    if (cost > 0 && usedLastMin + cost > this.config.maxCreditsPerMinute) {
      return null;
    }

    const slot = this.pending;
    this.pending = null;
    this.dispatchSeq += 1;
    const effectiveSeed = resolveEffectiveSeed(
      this.config,
      slot.frameDigest,
      this.dispatchSeq,
    );
    const request: RealtimeRenderDispatchRequest = Object.freeze({
      requestId: `rt-${this.dispatchSeq}-${slot.frameDigest.slice(0, 8)}`,
      frameDigest: slot.frameDigest,
      dirtyTileKeys: slot.dirtyTileKeys,
      effectiveSeed,
      denoiseStrength: this.config.imaginationStrength,
      sourceKind: slot.frame.sourceKind,
      prompt: slot.frame.prompt,
      estimatedCredits: cost,
      dispatchedAtMs: nowMs,
    });

    this.inFlight = Object.freeze({ request, cancelled: false });
    this.dispatchedCount += 1;
    if (cost > 0) {
      this.creditLedger.push({ atMs: nowMs, credits: cost });
    }
    return request;
  }

  /**
   * 도착한 렌더 결과를 검증해 유효한 최신 요청만 비파괴 고스트 프리뷰에 반영한다.
   */
  receiveRenderResult(
    result: RealtimeRenderIncomingResult,
  ): { readonly applied: boolean; readonly reason: "applied" | "stale-or-cancelled" } {
    if (!this.inFlight || this.inFlight.request.requestId !== result.requestId) {
      this.droppedStaleCount += 1;
      return { applied: false, reason: "stale-or-cancelled" };
    }
    if (this.inFlight.cancelled) {
      this.inFlight = null;
      this.droppedStaleCount += 1;
      return { applied: false, reason: "stale-or-cancelled" };
    }

    const rttMs = Math.max(1, result.completedAtMs - this.inFlight.request.dispatchedAtMs);
    this.ewmaRttMs =
      this.ewmaRttMs === null ? rttMs : Math.round(this.ewmaRttMs * 0.65 + rttMs * 0.35);
    this.activeDebounceMs = clampNumber(
      Math.round(Math.max(this.config.baseDebounceMs, this.ewmaRttMs * 0.75)),
      this.config.minDebounceMs,
      this.config.maxDebounceMs,
    );

    this.inFlight = null;
    this.completedCount += 1;
    this.ghostPreview = Object.freeze({
      status: "previewing",
      requestId: result.requestId,
      frameDigest: result.frameDigest,
      effectiveSeed: result.effectiveSeed,
      previewAssetRef: result.previewAssetRef,
      width: result.width,
      height: result.height,
      opacity: this.config.ghostOpacity,
      splitCurtainRatio: this.config.splitCurtainRatio,
      updatedAtMs: result.completedAtMs,
    });
    return { applied: true, reason: "applied" };
  }

  discardGhostPreview(): GhostPreviewState {
    this.ghostPreview = Object.freeze({
      ...this.ghostPreview,
      status: "discarded",
      previewAssetRef: null,
      requestId: null,
    });
    return this.ghostPreview;
  }

  /**
   * 사용자가 명시적으로 승인한 시점에만 기존 원본을 건드리지 않고 새 초안 레이어로 확정한다.
   */
  commitGhostPreviewToNewLayer(
    nowMs: number,
    layerName = "실시간 고스트 확정 레이어",
  ): CommittedGhostLayerDraft | null {
    if (
      this.ghostPreview.status !== "previewing" ||
      !this.ghostPreview.previewAssetRef ||
      !this.ghostPreview.frameDigest ||
      this.ghostPreview.effectiveSeed === null
    ) {
      return null;
    }

    const draft: CommittedGhostLayerDraft = Object.freeze({
      layerId: `ghost-layer-${this.ghostPreview.frameDigest.slice(0, 10)}`,
      layerName: layerName.trim() || "실시간 고스트 확정 레이어",
      insertMode: "new-layer-above",
      overwritesOriginal: false,
      previewAssetRef: this.ghostPreview.previewAssetRef,
      frameDigest: this.ghostPreview.frameDigest,
      effectiveSeed: this.ghostPreview.effectiveSeed,
      imaginationStrength: this.config.imaginationStrength,
      committedAtMs: nowMs,
    });

    this.ghostPreview = Object.freeze({
      ...this.ghostPreview,
      status: "committed",
    });
    return draft;
  }

  getTelemetry(nowMs: number): RealtimeBridgeTelemetry {
    const used = this.pruneCreditLedger(nowMs);
    const remaining = Math.max(0, this.config.maxCreditsPerMinute - used);
    return Object.freeze({
      enabled: this.config.enabled,
      providerStatus: this.config.providerStatus,
      activeDebounceMs: this.activeDebounceMs,
      ewmaRttMs: this.ewmaRttMs,
      inFlightRequestId: this.inFlight?.request.requestId ?? null,
      hasQueuedLatest: this.pending !== null,
      dispatchedCount: this.dispatchedCount,
      completedCount: this.completedCount,
      droppedStaleCount: this.droppedStaleCount,
      cancelledCount: this.cancelledCount,
      creditsUsedLastMinute: used,
      remainingMinuteCredits: remaining,
      ghostPreview: this.ghostPreview,
    });
  }
}
