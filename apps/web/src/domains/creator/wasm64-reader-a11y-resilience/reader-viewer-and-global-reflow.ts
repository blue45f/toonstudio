/**
 * 무지연 지능형 웹툰 리더 엔진(`IntelligentReaderEngine`) · AudioToon 스크롤 크로스페이드 스케줄러.
 *
 * - 스크롤 속도(EMA) 및 잔여 거리 ETA 기반 다음 화 OPFS 선행 프리페치(LRU 용량 상한 자동 퇴출)
 * - 스크롤 진행도(`0..1`) 연동 BGM/SFX 동등-전력(equal-power) 크로스페이드 및 SFX 자동 더킹
 * - WebGPU 2× 엣지 기반 초해상도 및 글로벌 다국어 말풍선 자동 조판 API 통합 재노출
 */

export {
  SUPER_RES_2X_UNIFORM_BYTES,
  SUPER_RES_2X_WORKGROUP_X,
  SUPER_RES_2X_WORKGROUP_Y,
  WGSL_READER_SUPER_RES_2X,
  computeSuperRes2xWorkgroups,
  createSuperRes2xPipelineDescriptor,
  packSuperRes2xUniforms,
  reflowBalloonTextForLocale,
  upscaleImage2xEdgeDirectedCpu,
  validateSuperRes2xWgsl,
  type BalloonReadabilityGrade,
  type BalloonReflowInput,
  type BalloonReflowResult,
  type BalloonShapeKind,
  type BalloonWritingMode,
  type PackedSuperRes2xUniforms,
  type PlacedBalloonLine,
  type ReaderLocale,
  type SuperRes2xConfig,
  type SuperRes2xCpuResult,
  type SuperRes2xPipelineDescriptor,
  type SuperRes2xWgslValidation,
  type SuperRes2xWorkgroupGrid,
} from "./reader-super-res-and-balloon-reflow";

export type AudioFadeCurve = "equal-power" | "linear" | "smoothstep";
export type AudioCueKind = "bgm" | "sfx";
export type AudioCuePhase = "idle" | "fading-in" | "sustain" | "fading-out";

export interface ReaderOpfsStorageAdapter {
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, data: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys(): Promise<readonly string[]>;
}

export interface ReaderEpisodePayload {
  readonly episodeId: string;
  readonly bytes: Uint8Array;
  readonly checksumHex?: string;
}

export type ReaderEpisodeFetcher = (episodeId: string) => Promise<Uint8Array>;

export interface AudioToonCueTrack {
  readonly id: string;
  readonly kind: AudioCueKind;
  readonly startProgress: number;
  readonly endProgress: number;
  readonly fadeInSpan: number;
  readonly fadeOutSpan: number;
  readonly baseGain: number;
  readonly curve?: AudioFadeCurve;
  readonly priority?: number;
  readonly loop?: boolean;
  readonly duckingFactor?: number;
}

export interface AudioToonTrackMixState {
  readonly id: string;
  readonly kind: AudioCueKind;
  readonly phase: AudioCuePhase;
  readonly rawEnvelope: number;
  readonly gain: number;
  readonly active: boolean;
}

export interface AudioToonMixSnapshot {
  readonly progress: number;
  readonly tracks: readonly AudioToonTrackMixState[];
  readonly activeBgmIds: readonly string[];
  readonly activeSfxIds: readonly string[];
  readonly bgmDuckMultiplier: number;
  readonly totalRmsEnergy: number;
}

export interface ReaderScrollSample {
  readonly episodeId: string;
  readonly scrollY: number;
  readonly viewportHeight: number;
  readonly contentHeight: number;
  readonly timestampMs: number;
}

export interface ReaderScrollTelemetry {
  readonly episodeId: string;
  readonly progress: number;
  readonly instantaneousVelocityPxPerSec: number;
  readonly smoothedVelocityPxPerSec: number;
  readonly remainingPx: number;
  readonly etaToEpisodeEndSec: number;
}

export interface ReaderPrefetchDecision {
  readonly triggered: boolean;
  readonly reason: "progress-threshold" | "velocity-eta" | "none";
  readonly queuedEpisodeIds: readonly string[];
  readonly skippedCachedIds: readonly string[];
}

export interface ReaderScrollStepReport {
  readonly telemetry: ReaderScrollTelemetry;
  readonly prefetch: ReaderPrefetchDecision;
  readonly audioMix: AudioToonMixSnapshot;
  readonly prefetchPromise: Promise<readonly string[]>;
}

export interface ReaderEngineMetrics {
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly prefetchedEpisodes: number;
  readonly evictedEpisodes: number;
  readonly cachedEpisodeCount: number;
  readonly cachedBytes: number;
  readonly averagePrefetchLatencyMs: number;
}

export interface IntelligentReaderEngineOptions {
  readonly episodeIds: readonly string[];
  readonly fetcher: ReaderEpisodeFetcher;
  readonly storage?: ReaderOpfsStorageAdapter;
  readonly audioTracks?: readonly AudioToonCueTrack[];
  readonly prefetchStartProgress?: number;
  readonly prefetchLeadTimeSec?: number;
  readonly minVelocityPxPerSec?: number;
  readonly lookaheadEpisodes?: number;
  readonly maxCacheBytes?: number;
  readonly velocitySmoothingAlpha?: number;
  readonly nowMs?: () => number;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function applyFadeCurve(u: number, curve: AudioFadeCurve): number {
  const t = clampNumber(u, 0, 1);
  if (curve === "linear") return t;
  if (curve === "smoothstep") return t * t * (3 - 2 * t);
  return Math.sin(t * Math.PI * 0.5);
}

/**
 * 테스트 및 비-OPFS 환경에서 사용하는 메모리 기반 OPFS 어댑터를 생성한다.
 */
export function createInMemoryReaderOpfsAdapter(): ReaderOpfsStorageAdapter {
  const store = new Map<string, Uint8Array>();
  return {
    async read(key: string): Promise<Uint8Array | null> {
      const found = store.get(key);
      return found ? new Uint8Array(found) : null;
    },
    async write(key: string, data: Uint8Array): Promise<void> {
      store.set(key, new Uint8Array(data));
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async listKeys(): Promise<readonly string[]> {
      return [...store.keys()];
    },
  };
}

/**
 * 브라우저 OPFS(`navigator.storage.getDirectory`) 어댑터를 생성한다.
 * 미지원 런타임에서는 메모리 어댑터로 안전 폴백한다.
 */
export function createBrowserReaderOpfsAdapter(directoryName = "toonstudio-reader-cache"): ReaderOpfsStorageAdapter {
  const storageApi = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!storageApi || typeof storageApi.getDirectory !== "function") {
    return createInMemoryReaderOpfsAdapter();
  }
  const sanitizeKey = (key: string): string => key.replace(/[^a-zA-Z0-9._-]/g, "_");
  const getDir = async (): Promise<FileSystemDirectoryHandle> => {
    const root = await storageApi.getDirectory();
    return root.getDirectoryHandle(directoryName, { create: true });
  };
  return {
    async read(key: string): Promise<Uint8Array | null> {
      try {
        const dir = await getDir();
        const fileHandle = await dir.getFileHandle(sanitizeKey(key));
        const file = await fileHandle.getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    },
    async write(key: string, data: Uint8Array): Promise<void> {
      const dir = await getDir();
      const fileHandle = await dir.getFileHandle(sanitizeKey(key), { create: true });
      const writable = await fileHandle.createWritable();
      const copy = new Uint8Array(data.byteLength);
      copy.set(data);
      await writable.write(copy);
      await writable.close();
    },
    async delete(key: string): Promise<void> {
      try {
        const dir = await getDir();
        await dir.removeEntry(sanitizeKey(key));
      } catch {
        // 이미 제거된 항목은 무시한다.
      }
    },
    async listKeys(): Promise<readonly string[]> {
      const dir = await getDir();
      const keys: string[] = [];
      const iterableDir = dir as unknown as AsyncIterable<[string, FileSystemHandle]>;
      for await (const [name] of iterableDir) keys.push(name);
      return keys;
    },
  };
}

/**
 * 스크롤 진행도(`0..1`)에 따른 AudioToon BGM/SFX 부드러운 크로스페이드·더킹 믹스를 계산한다.
 */
export function evaluateAudioToonMix(
  progress: number,
  tracks: readonly AudioToonCueTrack[],
): AudioToonMixSnapshot {
  const p = clampNumber(progress, 0, 1);
  const preliminary: {
    readonly track: AudioToonCueTrack;
    readonly phase: AudioCuePhase;
    readonly rawEnvelope: number;
  }[] = [];

  let maxDuckAmount = 0;

  for (const track of tracks) {
    const start = clampNumber(track.startProgress, 0, 1);
    const end = clampNumber(track.endProgress, start, 1);
    const span = Math.max(0, end - start);
    if (span <= 0 || p < start || p > end) {
      preliminary.push({ track, phase: "idle", rawEnvelope: 0 });
      continue;
    }

    const curve = track.curve ?? "equal-power";
    const fadeIn = clampNumber(track.fadeInSpan, 0, span);
    const fadeOut = clampNumber(track.fadeOutSpan, 0, span);
    const inEnd = start + fadeIn;
    const outStart = end - fadeOut;

    const inEnv = fadeIn > 0 && p < inEnd ? applyFadeCurve((p - start) / fadeIn, curve) : 1;
    const outEnv = fadeOut > 0 && p > outStart ? applyFadeCurve((end - p) / fadeOut, curve) : 1;
    const rawEnvelope = Math.min(inEnv, outEnv);

    let phase: AudioCuePhase = "sustain";
    if (fadeIn > 0 && p < inEnd && inEnv <= outEnv) phase = "fading-in";
    else if (fadeOut > 0 && p > outStart && outEnv < inEnv) phase = "fading-out";

    if (track.kind === "sfx" && rawEnvelope > 0) {
      const duckTarget = clampNumber(track.duckingFactor ?? 0.45, 0, 1);
      const duckReduction = rawEnvelope * (1 - duckTarget);
      if (duckReduction > maxDuckAmount) maxDuckAmount = duckReduction;
    }

    preliminary.push({ track, phase, rawEnvelope });
  }

  const bgmDuckMultiplier = clampNumber(1 - maxDuckAmount, 0.1, 1);
  const trackStates: AudioToonTrackMixState[] = [];
  const activeBgmIds: string[] = [];
  const activeSfxIds: string[] = [];
  let sumSquares = 0;

  for (const entry of preliminary) {
    const baseGain = clampNumber(entry.track.baseGain, 0, 1);
    const duck = entry.track.kind === "bgm" ? bgmDuckMultiplier : 1;
    const gain = entry.rawEnvelope * baseGain * duck;
    const active = gain > 1e-4;
    if (active) {
      if (entry.track.kind === "bgm") activeBgmIds.push(entry.track.id);
      else activeSfxIds.push(entry.track.id);
      sumSquares += gain * gain;
    }
    trackStates.push({
      id: entry.track.id,
      kind: entry.track.kind,
      phase: active ? entry.phase : "idle",
      rawEnvelope: entry.rawEnvelope,
      gain,
      active,
    });
  }

  return {
    progress: p,
    tracks: trackStates,
    activeBgmIds,
    activeSfxIds,
    bgmDuckMultiplier,
    totalRmsEnergy: Math.sqrt(sumSquares),
  };
}

/**
 * 스크롤 속도 예측 OPFS 프리페치와 AudioToon 크로스페이드 스케줄링을 통합 관리하는 무지연 리더 엔진.
 */
export class IntelligentReaderEngine {
  private readonly episodeIds: readonly string[];
  private readonly fetcher: ReaderEpisodeFetcher;
  private readonly storage: ReaderOpfsStorageAdapter;
  private readonly audioTracks: readonly AudioToonCueTrack[];
  private readonly prefetchStartProgress: number;
  private readonly prefetchLeadTimeSec: number;
  private readonly minVelocityPxPerSec: number;
  private readonly lookaheadEpisodes: number;
  private readonly maxCacheBytes: number;
  private readonly velocitySmoothingAlpha: number;
  private readonly nowMs: () => number;

  private lastEpisodeId: string | null = null;
  private lastScrollY = 0;
  private lastTimestampMs: number | null = null;
  private smoothedVelocityPxPerSec = 0;

  private readonly cacheMeta = new Map<string, { bytes: number; lastAccessedMs: number }>();
  private readonly inFlight = new Map<string, Promise<Uint8Array>>();

  private cacheHits = 0;
  private cacheMisses = 0;
  private prefetchedEpisodes = 0;
  private evictedEpisodes = 0;
  private totalPrefetchLatencyMs = 0;

  constructor(options: IntelligentReaderEngineOptions) {
    this.episodeIds = [...options.episodeIds];
    this.fetcher = options.fetcher;
    this.storage = options.storage ?? createInMemoryReaderOpfsAdapter();
    this.audioTracks = options.audioTracks ? [...options.audioTracks] : [];
    this.prefetchStartProgress = clampNumber(options.prefetchStartProgress ?? 0.62, 0.05, 0.98);
    this.prefetchLeadTimeSec = Math.max(0.5, options.prefetchLeadTimeSec ?? 8);
    this.minVelocityPxPerSec = Math.max(10, options.minVelocityPxPerSec ?? 120);
    this.lookaheadEpisodes = Math.max(1, Math.floor(options.lookaheadEpisodes ?? 2));
    this.maxCacheBytes = Math.max(1024, Math.floor(options.maxCacheBytes ?? 32 * 1024 * 1024));
    this.velocitySmoothingAlpha = clampNumber(options.velocitySmoothingAlpha ?? 0.45, 0.05, 1);
    this.nowMs = options.nowMs ?? (() => performance.now());
  }

  onScroll(sample: ReaderScrollSample): ReaderScrollStepReport {
    const scrollable = Math.max(0, sample.contentHeight - sample.viewportHeight);
    const clampedY = clampNumber(sample.scrollY, 0, scrollable);
    const progress = scrollable <= 0 ? 1 : clampNumber(clampedY / scrollable, 0, 1);
    const remainingPx = Math.max(0, scrollable - clampedY);

    let instVelocity = 0;
    if (this.lastEpisodeId === sample.episodeId && this.lastTimestampMs !== null) {
      const dtMs = sample.timestampMs - this.lastTimestampMs;
      if (dtMs > 0) instVelocity = ((clampedY - this.lastScrollY) * 1000) / dtMs;
      const alpha = this.velocitySmoothingAlpha;
      this.smoothedVelocityPxPerSec = alpha * instVelocity + (1 - alpha) * this.smoothedVelocityPxPerSec;
    } else {
      this.smoothedVelocityPxPerSec = 0;
    }

    this.lastEpisodeId = sample.episodeId;
    this.lastScrollY = clampedY;
    this.lastTimestampMs = sample.timestampMs;

    const etaToEpisodeEndSec =
      this.smoothedVelocityPxPerSec > 1 ? remainingPx / this.smoothedVelocityPxPerSec : Number.POSITIVE_INFINITY;

    const telemetry: ReaderScrollTelemetry = {
      episodeId: sample.episodeId,
      progress,
      instantaneousVelocityPxPerSec: instVelocity,
      smoothedVelocityPxPerSec: this.smoothedVelocityPxPerSec,
      remainingPx,
      etaToEpisodeEndSec,
    };

    const audioMix = evaluateAudioToonMix(progress, this.audioTracks);
    const shouldPrefetchByProgress = progress >= this.prefetchStartProgress;
    const shouldPrefetchByEta =
      this.smoothedVelocityPxPerSec >= this.minVelocityPxPerSec && etaToEpisodeEndSec <= this.prefetchLeadTimeSec;

    const currentIndex = this.episodeIds.indexOf(sample.episodeId);
    const queuedEpisodeIds: string[] = [];
    const skippedCachedIds: string[] = [];
    let reason: ReaderPrefetchDecision["reason"] = "none";

    if (currentIndex >= 0 && (shouldPrefetchByProgress || shouldPrefetchByEta)) {
      reason = shouldPrefetchByProgress ? "progress-threshold" : "velocity-eta";
      const endIndex = Math.min(this.episodeIds.length, currentIndex + 1 + this.lookaheadEpisodes);
      for (let i = currentIndex + 1; i < endIndex; i += 1) {
        const nextId = this.episodeIds[i];
        if (!nextId) continue;
        if (this.cacheMeta.has(nextId)) skippedCachedIds.push(nextId);
        else if (!this.inFlight.has(nextId)) queuedEpisodeIds.push(nextId);
      }
    }

    const prefetchPromise = this.schedulePrefetches(queuedEpisodeIds, sample.episodeId);
    return {
      telemetry,
      prefetch: { triggered: queuedEpisodeIds.length > 0, reason, queuedEpisodeIds, skippedCachedIds },
      audioMix,
      prefetchPromise,
    };
  }

  async readEpisode(episodeId: string): Promise<{ readonly bytes: Uint8Array; readonly fromOpfsCache: boolean }> {
    const cached = await this.storage.read(episodeId);
    if (cached) {
      this.cacheHits += 1;
      const meta = this.cacheMeta.get(episodeId);
      if (meta) meta.lastAccessedMs = this.nowMs();
      return { bytes: cached, fromOpfsCache: true };
    }

    const pending = this.inFlight.get(episodeId);
    if (pending) {
      const bytes = await pending;
      this.cacheHits += 1;
      return { bytes: new Uint8Array(bytes), fromOpfsCache: true };
    }

    this.cacheMisses += 1;
    const fetched = await this.fetcher(episodeId);
    await this.storeEpisodeInCache(episodeId, fetched, episodeId);
    return { bytes: new Uint8Array(fetched), fromOpfsCache: false };
  }

  getMetrics(): ReaderEngineMetrics {
    let cachedBytes = 0;
    for (const meta of this.cacheMeta.values()) cachedBytes += meta.bytes;
    return {
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      prefetchedEpisodes: this.prefetchedEpisodes,
      evictedEpisodes: this.evictedEpisodes,
      cachedEpisodeCount: this.cacheMeta.size,
      cachedBytes,
      averagePrefetchLatencyMs:
        this.prefetchedEpisodes > 0 ? this.totalPrefetchLatencyMs / this.prefetchedEpisodes : 0,
    };
  }

  private schedulePrefetches(episodeIds: readonly string[], protectedEpisodeId: string): Promise<readonly string[]> {
    if (episodeIds.length === 0) return Promise.resolve([]);
    const tasks = episodeIds.map(async (episodeId) => {
      const startedMs = this.nowMs();
      const fetchTask = (async (): Promise<Uint8Array> => {
        const bytes = await this.fetcher(episodeId);
        await this.storeEpisodeInCache(episodeId, bytes, protectedEpisodeId);
        this.prefetchedEpisodes += 1;
        this.totalPrefetchLatencyMs += Math.max(0, this.nowMs() - startedMs);
        return bytes;
      })();
      this.inFlight.set(episodeId, fetchTask);
      try {
        await fetchTask;
        return episodeId;
      } finally {
        this.inFlight.delete(episodeId);
      }
    });
    return Promise.all(tasks);
  }

  private async storeEpisodeInCache(episodeId: string, bytes: Uint8Array, protectedEpisodeId: string): Promise<void> {
    let totalBytes = 0;
    for (const [key, meta] of this.cacheMeta) {
      if (key !== episodeId) totalBytes += meta.bytes;
    }

    if (totalBytes + bytes.byteLength > this.maxCacheBytes) {
      const candidates = [...this.cacheMeta.entries()]
        .filter(([key]) => key !== episodeId && key !== protectedEpisodeId)
        .sort((a, b) => a[1].lastAccessedMs - b[1].lastAccessedMs);

      for (const [evictKey, evictMeta] of candidates) {
        if (totalBytes + bytes.byteLength <= this.maxCacheBytes) break;
        await this.storage.delete(evictKey);
        this.cacheMeta.delete(evictKey);
        totalBytes -= evictMeta.bytes;
        this.evictedEpisodes += 1;
      }
    }

    await this.storage.write(episodeId, bytes);
    this.cacheMeta.set(episodeId, { bytes: bytes.byteLength, lastAccessedMs: this.nowMs() });
  }
}
