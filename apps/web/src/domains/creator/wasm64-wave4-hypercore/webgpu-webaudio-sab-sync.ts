/**
 * 하드웨어 직결 SharedArrayBuffer 제로카피 WebGPU 프레임 ↔ WebAudio 샘플 위상 고정(PLL) 동기화 브리지 및
 * 온디바이스 Ridge 회귀 셰이더 컴파일 시간 예측기 · 프레임 예산 우선순위 프리워밍 캐시.
 *
 * - 단일 공유 메모리 제어 블록 위에서 48kHz 오디오 샘플 시계와 60/120Hz WebGPU 프레임을 디지털 PLL로 동기화
 * - 정규식 백트래킹 없는 O(N) WGSL 복잡도 특징 추출 + 티호노프(Ridge) 정규방정식 온디바이스 학습으로 컴파일 지연 예측
 * - 8.33ms/16.67ms 유휴 슬라이스 예산 안에서 무거운 셰이더를 히치(Hitch) 없이 선행 컴파일·LRU 캐싱
 */

const SYNC_I32_WORDS = 8; // seqCounter, audioSampleLo, audioSampleHi, gpuFrameIdx, underrunCount 등
const SYNC_F64_WORDS = 8; // audioTimeSec, gpuPresentSec, phaseErrorMs, pllDriftRatio, beatRms 등

export interface SabAudioGpuSyncConfig {
  readonly sampleRateHz?: number;
  readonly targetFps?: number;
  readonly ringFramesPowerOfTwo?: number;
  readonly pllProportionalGain?: number;
  readonly pllIntegralGain?: number;
  readonly preferSharedBuffer?: boolean;
}

export interface GpuFramePhaseSnapshot {
  readonly gpuFrameIndex: number;
  readonly audioSamplePosition: number;
  readonly audioTimeSec: number;
  readonly targetFramePosition: number;
  readonly subFrameAlpha: number;
  readonly phaseErrorMs: number;
  readonly pllClockScale: number;
  readonly beatEnvelopeRms: number;
  readonly zeroCopyShared: boolean;
}

export interface WgslComplexityFeatures {
  readonly sourceBytes: number;
  readonly lineCount: number;
  readonly mathOpCount: number;
  readonly textureOpCount: number;
  readonly loopCount: number;
  readonly branchCount: number;
  readonly storageBindingCount: number;
  readonly workgroupThreads: number;
  readonly usesF16: boolean;
}

export interface ShaderCandidateSpec {
  readonly shaderId: string;
  readonly wgslSource: string;
  readonly kind: "compute" | "render";
  readonly usageProbability: number;
  readonly deadlineFrames?: number;
}

export interface CompiledShaderHandle {
  readonly shaderId: string;
  readonly kind: "compute" | "render";
  readonly predictedCompileMs: number;
  readonly actualCompileMs: number;
}

export interface PrewarmSliceReport {
  readonly budgetMs: number;
  readonly spentMs: number;
  readonly compiledShaderIds: readonly string[];
  readonly deferredShaderIds: readonly string[];
  readonly budgetExceeded: boolean;
}

export interface ShaderPrewarmerMetrics {
  readonly cachedPipelines: number;
  readonly trainingSamples: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly ridgeWeights: readonly number[];
  readonly meanAbsolutePredictionErrorMs: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function allocateSyncBacking(byteLength: number, preferShared: boolean): {
  readonly buffer: ArrayBufferLike;
  readonly shared: boolean;
} {
  if (preferShared && typeof SharedArrayBuffer !== "undefined") {
    try {
      return { buffer: new SharedArrayBuffer(byteLength), shared: true };
    } catch {
      // COOP/COEP 미적용 환경에서는 동일 레이아웃의 ArrayBuffer로 안전 폴백한다.
    }
  }
  return { buffer: new ArrayBuffer(byteLength), shared: false };
}

/**
 * WebAudio AudioWorklet 샘플 클록과 WebGPU 렌더/컴퓨트 프레임을 제로카피 공유 메모리 위에서
 * 디지털 PI 위상 고정 루프(PLL)로 동기화하는 브리지.
 */
export class WebGpuWebAudioSabSyncBridge {
  public readonly sampleRateHz: number;
  public readonly targetFps: number;
  public readonly ringCapacityFrames: number;
  public readonly sharedBacking: boolean;
  public readonly backingBuffer: ArrayBufferLike;

  private readonly ctrlI32: Int32Array;
  private readonly ctrlF64: Float64Array;
  private readonly pcmRing: Float32Array;
  private readonly useAtomics: boolean;
  private readonly kp: number;
  private readonly ki: number;
  private integralError = 0;

  public constructor(config?: SabAudioGpuSyncConfig) {
    this.sampleRateHz = Math.max(8000, Math.round(config?.sampleRateHz ?? 48_000));
    this.targetFps = Math.max(24, Math.round(config?.targetFps ?? 120));
    let ringFrames = 256;
    const requestedRing = config?.ringFramesPowerOfTwo ?? 4096;
    while (ringFrames < requestedRing && ringFrames < 65536) ringFrames <<= 1;
    this.ringCapacityFrames = ringFrames;
    this.kp = config?.pllProportionalGain ?? 0.015;
    this.ki = config?.pllIntegralGain ?? 0.0012;

    const i32Bytes = SYNC_I32_WORDS * 4;
    const f64Bytes = SYNC_F64_WORDS * 8;
    const headerBytes = i32Bytes + f64Bytes; // 32 + 64 = 96B (8바이트 정렬)
    const pcmBytes = ringFrames * 2 * 4; // 스테레오 인터리브 Float32
    const alloc = allocateSyncBacking(headerBytes + pcmBytes, config?.preferSharedBuffer ?? true);

    this.backingBuffer = alloc.buffer;
    this.sharedBacking = alloc.shared;
    this.ctrlI32 = new Int32Array(this.backingBuffer, 0, SYNC_I32_WORDS);
    this.ctrlF64 = new Float64Array(this.backingBuffer, i32Bytes, SYNC_F64_WORDS);
    this.pcmRing = new Float32Array(this.backingBuffer, headerBytes, ringFrames * 2);
    this.useAtomics = alloc.shared && typeof Atomics !== "undefined";
    this.ctrlF64[3] = 1.0; // 초기 PLL 클록 배율 1.0
  }

  private beginWriteSeq(): void {
    if (this.useAtomics) {
      Atomics.add(this.ctrlI32, 0, 1);
    } else {
      this.ctrlI32[0] = ((this.ctrlI32[0] ?? 0) + 1) | 0;
    }
  }

  private endWriteSeq(): void {
    if (this.useAtomics) {
      Atomics.add(this.ctrlI32, 0, 1);
    } else {
      this.ctrlI32[0] = ((this.ctrlI32[0] ?? 0) + 1) | 0;
    }
  }

  /** 오디오 스레드(128프레임 퀀텀)가 하드웨어 샘플 위치와 스테레오 파형을 복사 없이 공유 링에 게시한다. */
  public publishAudioQuantum(
    leftChannel: Float32Array,
    rightChannel: Float32Array,
    hardwareSampleFrame: number,
  ): number {
    const frames = Math.min(leftChannel.length, rightChannel.length, this.ringCapacityFrames);
    let energySum = 0;
    const writeCursor = this.useAtomics
      ? Atomics.load(this.ctrlI32, 4)
      : (this.ctrlI32[4] ?? 0);

    for (let i = 0; i < frames; i += 1) {
      const slot = ((writeCursor + i) & (this.ringCapacityFrames - 1)) * 2;
      const l = leftChannel[i] ?? 0;
      const r = rightChannel[i] ?? 0;
      this.pcmRing[slot] = l;
      this.pcmRing[slot + 1] = r;
      energySum += 0.5 * (l * l + r * r);
    }

    const rms = frames > 0 ? Math.sqrt(energySum / frames) : 0;
    const endSample = Math.max(0, Math.round(hardwareSampleFrame + frames));
    const audioTimeSec = endSample / this.sampleRateHz;

    this.beginWriteSeq();
    this.ctrlI32[1] = endSample & 0x7fffffff;
    this.ctrlI32[4] = (writeCursor + frames) | 0;
    this.ctrlF64[0] = audioTimeSec;
    this.ctrlF64[4] = rms;
    this.endWriteSeq();

    return rms;
  }

  /** WebGPU 렌더러가 현재 발표 시각을 기준으로 위상 오차를 보정하고 셰이더 변조 스냅샷을 읽는다. */
  public latchGpuFramePhase(gpuPresentationTimeSec: number): GpuFramePhaseSnapshot {
    let audioSample = 0;
    let audioSec = 0;
    let beatRms = 0;

    // Seqlock 패턴으로 찢김 없는(tear-free) 오디오 클록 스냅샷을 읽는다.
    for (let spin = 0; spin < 4; spin += 1) {
      const seq0 = this.useAtomics ? Atomics.load(this.ctrlI32, 0) : (this.ctrlI32[0] ?? 0);
      if ((seq0 & 1) !== 0) continue;
      audioSample = this.ctrlI32[1] ?? 0;
      audioSec = this.ctrlF64[0] ?? 0;
      beatRms = this.ctrlF64[4] ?? 0;
      const seq1 = this.useAtomics ? Atomics.load(this.ctrlI32, 0) : (this.ctrlI32[0] ?? 0);
      if (seq0 === seq1) break;
    }

    const rawErrorSec = audioSec - gpuPresentationTimeSec;
    const phaseErrorMs = rawErrorSec * 1000;
    this.integralError = clamp(this.integralError + rawErrorSec, -0.05, 0.05);
    const pllClockScale = clamp(1.0 + this.kp * rawErrorSec + this.ki * this.integralError, 0.96, 1.04);

    const correctedSec = gpuPresentationTimeSec + rawErrorSec * 0.85;
    const exactFrame = Math.max(0, correctedSec * this.targetFps);
    const gpuFrameIndex = Math.floor(exactFrame);
    const subFrameAlpha = exactFrame - gpuFrameIndex;

    this.ctrlI32[3] = gpuFrameIndex | 0;
    this.ctrlF64[1] = gpuPresentationTimeSec;
    this.ctrlF64[2] = phaseErrorMs;
    this.ctrlF64[3] = pllClockScale;

    return {
      gpuFrameIndex,
      audioSamplePosition: audioSample,
      audioTimeSec: audioSec,
      targetFramePosition: exactFrame,
      subFrameAlpha,
      phaseErrorMs,
      pllClockScale,
      beatEnvelopeRms: beatRms,
      zeroCopyShared: this.sharedBacking,
    };
  }
}

function isIdentChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  );
}

/** 정규식 백트래킹 없이 단일 O(N) 문자 스캔으로 WGSL 셰이더의 복잡도 특징 벡터를 추출한다. */
export function extractWgslComplexityFeatures(wgslSource: string): WgslComplexityFeatures {
  const len = wgslSource.length;
  let lineCount = 1;
  let mathOpCount = 0;
  let textureOpCount = 0;
  let loopCount = 0;
  let branchCount = 0;
  let storageBindingCount = 0;
  let usesF16 = false;
  let workgroupThreads = 1;

  let i = 0;
  while (i < len) {
    const ch = wgslSource.charCodeAt(i);
    if (ch === 10) {
      lineCount += 1;
      i += 1;
      continue;
    }
    if (ch === 43 || ch === 45 || ch === 42 || ch === 47) {
      mathOpCount += 1;
      i += 1;
      continue;
    }
    if (isIdentChar(ch)) {
      const start = i;
      while (i < len && isIdentChar(wgslSource.charCodeAt(i))) i += 1;
      const token = wgslSource.slice(start, i);
      if (token === "for" || token === "while" || token === "loop") {
        loopCount += 1;
      } else if (token === "if" || token === "switch" || token === "select") {
        branchCount += 1;
      } else if (token === "storage") {
        storageBindingCount += 1;
      } else if (token === "f16") {
        usesF16 = true;
      } else if (
        token.startsWith("textureSample") ||
        token.startsWith("textureLoad") ||
        token.startsWith("textureStore")
      ) {
        textureOpCount += 1;
      } else if (
        token === "fma" ||
        token === "dot" ||
        token === "exp" ||
        token === "sin" ||
        token === "cos" ||
        token === "sqrt" ||
        token === "inverseSqrt"
      ) {
        mathOpCount += 2;
      } else if (token === "workgroup_size") {
        // workgroup_size(x, y, z) 괄호 안 최대 3개 정수를 선형 파싱한다.
        let cursor = i;
        while (cursor < len && wgslSource.charCodeAt(cursor) === 32) cursor += 1;
        if (cursor < len && wgslSource.charCodeAt(cursor) === 40) {
          cursor += 1;
          const dims: number[] = [];
          while (cursor < len && wgslSource.charCodeAt(cursor) !== 41 && dims.length < 3) {
            const c = wgslSource.charCodeAt(cursor);
            if (c >= 48 && c <= 57) {
              let num = 0;
              while (cursor < len) {
                const d = wgslSource.charCodeAt(cursor);
                if (d < 48 || d > 57) break;
                num = num * 10 + (d - 48);
                cursor += 1;
              }
              dims.push(Math.max(1, num));
            } else {
              cursor += 1;
            }
          }
          if (dims.length > 0) {
            workgroupThreads = dims.reduce((acc, v) => acc * v, 1);
          }
          i = cursor;
        }
      }
      continue;
    }
    i += 1;
  }

  return {
    sourceBytes: len,
    lineCount,
    mathOpCount,
    textureOpCount,
    loopCount,
    branchCount,
    storageBindingCount,
    workgroupThreads,
    usesF16,
  };
}

function featuresToVector8(f: WgslComplexityFeatures): readonly number[] {
  return [
    1.0, // 절편(bias)
    f.sourceBytes / 1024,
    f.mathOpCount / 32,
    f.textureOpCount,
    f.loopCount,
    f.branchCount / 4,
    f.storageBindingCount,
    Math.log2(Math.max(1, f.workgroupThreads)) / 8,
  ];
}

/** 부분 피벗 가우스 소거법으로 D×D 선형계 (A * w = b)를 푼다. */
function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const d = rhs.length;
  const aug = matrix.map((row, r) => [...row, rhs[r] ?? 0]);

  for (let col = 0; col < d; col += 1) {
    let pivot = col;
    let bestAbs = Math.abs(aug[col]?.[col] ?? 0);
    for (let r = col + 1; r < d; r += 1) {
      const cand = Math.abs(aug[r]?.[col] ?? 0);
      if (cand > bestAbs) {
        bestAbs = cand;
        pivot = r;
      }
    }
    if (pivot !== col) {
      const tmp = aug[col]!;
      aug[col] = aug[pivot]!;
      aug[pivot] = tmp;
    }
    const diag = aug[col]?.[col] ?? 1e-8;
    const safeDiag = Math.abs(diag) < 1e-9 ? 1e-9 : diag;
    for (let c = col; c <= d; c += 1) {
      aug[col]![c] = (aug[col]?.[c] ?? 0) / safeDiag;
    }
    for (let r = 0; r < d; r += 1) {
      if (r === col) continue;
      const factor = aug[r]?.[col] ?? 0;
      if (factor === 0) continue;
      for (let c = col; c <= d; c += 1) {
        aug[r]![c] = (aug[r]?.[c] ?? 0) - factor * (aug[col]?.[c] ?? 0);
      }
    }
  }

  return aug.map((row) => row[d] ?? 0);
}

const DEFAULT_PRIOR_WEIGHTS: readonly number[] = Object.freeze([
  0.85, // 기본 파이프라인 생성 오버헤드(ms)
  0.45, // KiB당 파싱 비용
  0.55, // 32 산술연산당 레지스터 할당 비용
  0.9, // 텍스처 샘플러 비용
  1.35, // 루프 언롤링/최적화 비용
  0.4, // 분기 비용
  0.35, // 스토리지 버퍼 바인딩 비용
  0.65, // 워크그룹 스레드 스케일 비용
]);

/**
 * 온디바이스 Ridge(L2 티호노프) 회귀 기반 WGSL 컴파일 지연 예측기 및 유휴 슬라이스 프리워밍 캐시.
 */
export class OnDeviceShaderPrewarmer {
  private readonly maxCacheEntries: number;
  private readonly ridgeLambda: number;
  private readonly compileFn: (spec: ShaderCandidateSpec, predictedMs: number) => Promise<number>;
  private readonly cache = new Map<string, CompiledShaderHandle>();
  private readonly samples: { readonly x: readonly number[]; readonly y: number }[] = [];

  private weights: number[] = [...DEFAULT_PRIOR_WEIGHTS];
  private cacheHits = 0;
  private cacheMisses = 0;
  private absErrorSum = 0;
  private evaluatedPredictions = 0;

  public constructor(options?: {
    readonly maxCacheEntries?: number;
    readonly ridgeLambda?: number;
    readonly compilePipeline?: (spec: ShaderCandidateSpec, predictedMs: number) => Promise<number>;
  }) {
    this.maxCacheEntries = Math.max(4, Math.round(options?.maxCacheEntries ?? 128));
    this.ridgeLambda = Math.max(1e-4, options?.ridgeLambda ?? 0.35);
    this.compileFn = options?.compilePipeline ?? (async (_spec, predMs) => predMs);
  }

  /** 현재 학습된 Ridge 가중치로 WGSL 셰이더의 예상 컴파일 시간(ms)을 계산한다. */
  public predictCompileMs(wgslSource: string): number {
    const x = featuresToVector8(extractWgslComplexityFeatures(wgslSource));
    let dot = 0;
    for (let i = 0; i < x.length; i += 1) {
      dot += (x[i] ?? 0) * (this.weights[i] ?? 0);
    }
    return Math.max(0.15, dot);
  }

  /** 실측된 컴파일 시간을 반영해 사전 가중치 중심(Prior-Centered) Ridge 정규방정식을 갱신한다. */
  public recordObservedCompile(wgslSource: string, actualCompileMs: number): void {
    const safeActual = Math.max(0.05, actualCompileMs);
    const predBefore = this.predictCompileMs(wgslSource);
    this.absErrorSum += Math.abs(predBefore - safeActual);
    this.evaluatedPredictions += 1;

    const x = featuresToVector8(extractWgslComplexityFeatures(wgslSource));
    this.samples.push({ x, y: safeActual });

    const dim = DEFAULT_PRIOR_WEIGHTS.length;
    const xtx: number[][] = Array.from({ length: dim }, (_, r) =>
      Array.from({ length: dim }, (__, c) => (r === c ? this.ridgeLambda : 0)),
    );
    const xty: number[] = DEFAULT_PRIOR_WEIGHTS.map((w) => this.ridgeLambda * w);

    for (const sample of this.samples) {
      for (let r = 0; r < dim; r += 1) {
        const xr = sample.x[r] ?? 0;
        xty[r] = (xty[r] ?? 0) + xr * sample.y;
        for (let c = 0; c < dim; c += 1) {
          xtx[r]![c] = (xtx[r]?.[c] ?? 0) + xr * (sample.x[c] ?? 0);
        }
      }
    }

    this.weights = solveLinearSystem(xtx, xty);
  }

  private putLru(handle: CompiledShaderHandle): void {
    if (this.cache.has(handle.shaderId)) {
      this.cache.delete(handle.shaderId);
    }
    this.cache.set(handle.shaderId, handle);
    while (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  public getCompiled(shaderId: string): CompiledShaderHandle | null {
    const hit = this.cache.get(shaderId);
    if (!hit) {
      this.cacheMisses += 1;
      return null;
    }
    this.cacheHits += 1;
    this.cache.delete(shaderId);
    this.cache.set(shaderId, hit);
    return hit;
  }

  /** 주어진 유휴 프레임 예산(예: 4.5ms)을 넘지 않는 선에서 우선순위가 높은 셰이더만 선행 컴파일한다. */
  public async schedulePrewarmSlice(
    candidates: readonly ShaderCandidateSpec[],
    frameBudgetMs = 4.5,
  ): Promise<PrewarmSliceReport> {
    const scored = candidates
      .filter((c) => !this.cache.has(c.shaderId))
      .map((spec) => {
        const predicted = this.predictCompileMs(spec.wgslSource);
        const urgency = 1 / Math.max(1, spec.deadlineFrames ?? 8);
        const priorityScore =
          (clamp(spec.usageProbability, 0.01, 1) * (1 + urgency * 3)) / Math.max(0.25, predicted);
        return { spec, predicted, priorityScore };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);

    let spentMs = 0;
    const compiledShaderIds: string[] = [];
    const deferredShaderIds: string[] = [];

    for (const item of scored) {
      // 첫 후보조차 예산보다 크더라도 최소 1건이 아니고 잔여 예산을 초과하면 다음 프레임으로 미룬다.
      if (spentMs + item.predicted > frameBudgetMs) {
        deferredShaderIds.push(item.spec.shaderId);
        continue;
      }
      const actualMs = await this.compileFn(item.spec, item.predicted);
      spentMs += actualMs;
      this.recordObservedCompile(item.spec.wgslSource, actualMs);
      this.putLru({
        shaderId: item.spec.shaderId,
        kind: item.spec.kind,
        predictedCompileMs: item.predicted,
        actualCompileMs: actualMs,
      });
      compiledShaderIds.push(item.spec.shaderId);
    }

    return {
      budgetMs: frameBudgetMs,
      spentMs,
      compiledShaderIds,
      deferredShaderIds,
      budgetExceeded: spentMs > frameBudgetMs,
    };
  }

  public getMetrics(): ShaderPrewarmerMetrics {
    return {
      cachedPipelines: this.cache.size,
      trainingSamples: this.samples.length,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      ridgeWeights: [...this.weights],
      meanAbsolutePredictionErrorMs:
        this.evaluatedPredictions > 0 ? this.absErrorSum / this.evaluatedPredictions : 0,
    };
  }
}
