/**
 * 서버 GPU 비용 ₩0 · 옵트인 전용 온디바이스 WebNN/ONNX 경량 AI 보조 런타임 및 결정적 로컬 폴백.
 *
 * - 사용자가 명시적으로 동의(`optedIn: true`)한 경우에만 실행되는 엄격한 옵트인 게이트
 * - WebNN(NPU/GPU) → WebGPU → WASM-SIMD → 결정적 로컬 CPU 폴백 순의 자동 실행 프로바이더 선택
 * - OPFS 로컬 모델 캐시 매니페스트(체크섬 검증·LRU 용량 제한 축출) 관리
 * - 모델 미다운로드·저사양 환경에서도 즉시 동작하는 결정적 로컬 비전 알고리즘:
 *   1) 연결 요소(Connected Components) + 외곽 잉크 폐쇄율 기반 말풍선 영역 탐지
 *   2) Sobel 엣지 + 테두리 시드 플러드필 기반 전경 누끼(Matting) 마스크 추출
 */

export const ONDEVICE_WEBNN_ASSIST_VERSION = 1 as const;
export const ZERO_SERVER_GPU_COST_KRW = 0 as const;

export type OnDeviceAssistTaskKind = "speech-bubble-detect" | "foreground-cutout";

export type OnDeviceExecutionProvider =
  | "webnn-npu"
  | "webnn-gpu"
  | "webgpu"
  | "wasm-simd"
  | "deterministic-cpu-fallback";

export type OnnxRuntimeEpName = "webnn" | "webgpu" | "wasm" | "none";

export interface OnDeviceAssistConsentState {
  readonly optedIn: boolean;
  readonly consentedAtMs: number | null;
  readonly allowOpfsModelCache: boolean;
  readonly allowNetworkModelDownload: boolean;
}

export interface OnDeviceHardwareProbe {
  readonly hasWebNn: boolean;
  readonly webNnDeviceType?: "npu" | "gpu" | "cpu";
  readonly hasWebGpu: boolean;
  readonly hasWasmSimd: boolean;
  readonly estimatedVramMb?: number;
  readonly isMobile?: boolean;
}

export interface OnDeviceProviderSelection {
  readonly provider: OnDeviceExecutionProvider;
  readonly onnxExecutionProvider: OnnxRuntimeEpName;
  readonly requiresModelWeights: boolean;
  readonly serverGpuCostKrw: typeof ZERO_SERVER_GPU_COST_KRW;
  readonly reason: string;
}

export interface OnDeviceModelSpec {
  readonly modelId: string;
  readonly task: OnDeviceAssistTaskKind;
  readonly version: string;
  readonly quantization: "int8" | "fp16";
  readonly sizeBytes: number;
  readonly minVramMb: number;
  readonly expectedSha256: string;
  readonly opfsRelativePath: string;
}

export const ONDEVICE_LIGHTWEIGHT_MODEL_CATALOG: Readonly<
  Record<OnDeviceAssistTaskKind, OnDeviceModelSpec>
> = Object.freeze({
  "speech-bubble-detect": Object.freeze({
    modelId: "toonstudio-bubble-seg-int8-v1",
    task: "speech-bubble-detect",
    version: "1.0.0",
    quantization: "int8",
    sizeBytes: 4_850_000,
    minVramMb: 256,
    expectedSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    opfsRelativePath: "models/ondevice/toonstudio-bubble-seg-int8-v1.onnx",
  }),
  "foreground-cutout": Object.freeze({
    modelId: "toonstudio-fg-matting-fp16-v1",
    task: "foreground-cutout",
    version: "1.0.0",
    quantization: "fp16",
    sizeBytes: 7_240_000,
    minVramMb: 512,
    expectedSha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    opfsRelativePath: "models/ondevice/toonstudio-fg-matting-fp16-v1.onnx",
  }),
});

export interface OpfsCachedModelEntry {
  readonly modelId: string;
  readonly task: OnDeviceAssistTaskKind;
  readonly version: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly opfsRelativePath: string;
  readonly cachedAtMs: number;
  readonly lastUsedAtMs: number;
}

export interface OpfsModelCacheManifest {
  readonly version: typeof ONDEVICE_WEBNN_ASSIST_VERSION;
  readonly maxCacheBytes: number;
  readonly totalBytes: number;
  readonly entries: readonly OpfsCachedModelEntry[];
}

export interface RgbaImageSurface {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

export interface BoundingBoxPx {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DetectedSpeechBubbleRegion {
  readonly id: string;
  readonly bounds: BoundingBoxPx;
  readonly centroid: readonly [number, number];
  readonly areaPx: number;
  readonly fillRatio: number;
  readonly inkEnclosureRatio: number;
  readonly confidence: number;
  readonly source: "deterministic-cpu-fallback";
}

export interface ForegroundCutoutMaskResult {
  readonly width: number;
  readonly height: number;
  readonly alphaMask: Uint8Array;
  readonly foregroundPixelCount: number;
  readonly foregroundCoverageRatio: number;
  readonly boundingBox: BoundingBoxPx | null;
  readonly estimatedBackgroundRgb: readonly [number, number, number];
  readonly source: "deterministic-cpu-fallback";
}

export type OnDeviceAssistExecutionResult =
  | Readonly<{
      status: "opt-in-required";
      task: OnDeviceAssistTaskKind;
      serverGpuCostKrw: typeof ZERO_SERVER_GPU_COST_KRW;
      message: string;
    }>
  | Readonly<{
      status: "completed";
      task: "speech-bubble-detect";
      providerSelection: OnDeviceProviderSelection;
      usedDeterministicFallback: boolean;
      serverGpuCostKrw: typeof ZERO_SERVER_GPU_COST_KRW;
      bubbles: readonly DetectedSpeechBubbleRegion[];
    }>
  | Readonly<{
      status: "completed";
      task: "foreground-cutout";
      providerSelection: OnDeviceProviderSelection;
      usedDeterministicFallback: boolean;
      serverGpuCostKrw: typeof ZERO_SERVER_GPU_COST_KRW;
      mask: ForegroundCutoutMaskResult;
    }>;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** 기본 옵트인 상태: 명시적 동의 전에는 AI 보조 기능을 자동 활성화하지 않는다. */
export function createDefaultOnDeviceConsentState(): OnDeviceAssistConsentState {
  return Object.freeze({
    optedIn: false,
    consentedAtMs: null,
    allowOpfsModelCache: false,
    allowNetworkModelDownload: false,
  });
}

/**
 * 기기 하드웨어 프로브 결과를 바탕으로 서버 GPU 비용 ₩0 온디바이스 실행 프로바이더를 자동 선택한다.
 */
export function selectOnDeviceExecutionProvider(
  probe: OnDeviceHardwareProbe,
  task: OnDeviceAssistTaskKind,
  options?: { readonly preferDeterministicFallback?: boolean },
): OnDeviceProviderSelection {
  if (options?.preferDeterministicFallback) {
    return Object.freeze({
      provider: "deterministic-cpu-fallback",
      onnxExecutionProvider: "none",
      requiresModelWeights: false,
      serverGpuCostKrw: ZERO_SERVER_GPU_COST_KRW,
      reason: "모델 다운로드 없이 즉시 동작하는 결정적 로컬 알고리즘을 선택했습니다.",
    });
  }

  const spec = ONDEVICE_LIGHTWEIGHT_MODEL_CATALOG[task];
  const vramMb = probe.estimatedVramMb ?? (probe.isMobile ? 384 : 1024);

  if (probe.hasWebNn && probe.webNnDeviceType === "npu") {
    return Object.freeze({
      provider: "webnn-npu",
      onnxExecutionProvider: "webnn",
      requiresModelWeights: true,
      serverGpuCostKrw: ZERO_SERVER_GPU_COST_KRW,
      reason: "기기 내장 NPU(WebNN)로 온디바이스 저전력 추론을 수행합니다.",
    });
  }

  if (probe.hasWebNn && probe.webNnDeviceType === "gpu") {
    return Object.freeze({
      provider: "webnn-gpu",
      onnxExecutionProvider: "webnn",
      requiresModelWeights: true,
      serverGpuCostKrw: ZERO_SERVER_GPU_COST_KRW,
      reason: "WebNN GPU 백엔드로 온디바이스 추론을 수행합니다.",
    });
  }

  if (probe.hasWebGpu && vramMb >= spec.minVramMb) {
    return Object.freeze({
      provider: "webgpu",
      onnxExecutionProvider: "webgpu",
      requiresModelWeights: true,
      serverGpuCostKrw: ZERO_SERVER_GPU_COST_KRW,
      reason: "WebGPU 셰이더 파이프라인으로 온디바이스 추론을 수행합니다.",
    });
  }

  if (probe.hasWasmSimd) {
    return Object.freeze({
      provider: "wasm-simd",
      onnxExecutionProvider: "wasm",
      requiresModelWeights: true,
      serverGpuCostKrw: ZERO_SERVER_GPU_COST_KRW,
      reason: "WASM SIMD CPU 런타임으로 로컬 추론을 수행합니다.",
    });
  }

  return Object.freeze({
    provider: "deterministic-cpu-fallback",
    onnxExecutionProvider: "none",
    requiresModelWeights: false,
    serverGpuCostKrw: ZERO_SERVER_GPU_COST_KRW,
    reason: "WebNN·WebGPU·WASM SIMD 미지원 환경이므로 결정적 로컬 폴백을 사용합니다.",
  });
}

/** OPFS 로컬 모델 캐시 매니페스트를 초기화한다. */
export function createOpfsModelCacheManifest(maxCacheBytes = 64 * 1024 * 1024): OpfsModelCacheManifest {
  return Object.freeze({
    version: ONDEVICE_WEBNN_ASSIST_VERSION,
    maxCacheBytes: Math.max(1024 * 1024, Math.floor(maxCacheBytes)),
    totalBytes: 0,
    entries: Object.freeze([]),
  });
}

/** 캐시 항목의 SHA-256이 공식 경량 모델 카탈로그와 일치하는지 검증한다. */
export function verifyOpfsModelChecksum(
  entry: OpfsCachedModelEntry,
  catalog: Readonly<Record<OnDeviceAssistTaskKind, OnDeviceModelSpec>> = ONDEVICE_LIGHTWEIGHT_MODEL_CATALOG,
): boolean {
  const expected = catalog[entry.task];
  if (!expected) return false;
  return (
    entry.modelId === expected.modelId &&
    entry.version === expected.version &&
    entry.sha256.toLowerCase() === expected.expectedSha256.toLowerCase()
  );
}

/**
 * OPFS 캐시 매니페스트에 모델을 등록/갱신하고, 용량 상한을 초과하면 LRU 순서로 오래된 항목을 축출한다.
 */
export function upsertOpfsCachedModel(
  manifest: OpfsModelCacheManifest,
  entry: OpfsCachedModelEntry,
): Readonly<{
  manifest: OpfsModelCacheManifest;
  evictedModelIds: readonly string[];
}> {
  const withoutExisting = manifest.entries.filter((item) => item.modelId !== entry.modelId);
  const nextEntries = [...withoutExisting, Object.freeze({ ...entry })];

  // 최근 사용 내림차순 정렬 후 예산 초과 항목 축출(현재 방금 추가한 entry는 우선 보존)
  const sortedByRecency = nextEntries.sort((a, b) => {
    if (a.modelId === entry.modelId) return -1;
    if (b.modelId === entry.modelId) return 1;
    if (b.lastUsedAtMs !== a.lastUsedAtMs) return b.lastUsedAtMs - a.lastUsedAtMs;
    return a.modelId < b.modelId ? -1 : a.modelId > b.modelId ? 1 : 0;
  });

  const kept: OpfsCachedModelEntry[] = [];
  const evicted: string[] = [];
  let totalBytes = 0;

  for (const item of sortedByRecency) {
    if (kept.length === 0 || totalBytes + item.sizeBytes <= manifest.maxCacheBytes) {
      kept.push(item);
      totalBytes += item.sizeBytes;
    } else {
      evicted.push(item.modelId);
    }
  }

  return Object.freeze({
    manifest: Object.freeze({
      ...manifest,
      totalBytes,
      entries: Object.freeze(kept),
    }),
    evictedModelIds: Object.freeze(evicted),
  });
}

function rgbaLuminance(rgba: Uint8ClampedArray, pixelIdx: number): number {
  const offset = pixelIdx * 4;
  return 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
}

/**
 * 결정적 로컬 폴백 #1: 4-연결 요소(Connected Components) + 어두운 외곽선 폐쇄율 기반 말풍선 영역 탐지.
 * 흰색 배경 여백과 실제 검정 테두리로 둘러싸인 말풍선을 정확히 구분한다.
 */
export function detectSpeechBubbleRegionsLocal(
  surface: RgbaImageSurface,
  options?: {
    readonly brightnessThreshold?: number;
    readonly inkThreshold?: number;
    readonly minAreaPx?: number;
    readonly maxAreaRatio?: number;
    readonly minInkEnclosureRatio?: number;
  },
): readonly DetectedSpeechBubbleRegion[] {
  const { width, height, rgba } = surface;
  const pixelCount = width * height;
  if (width <= 2 || height <= 2 || rgba.length < pixelCount * 4) {
    return Object.freeze([]);
  }

  const brightnessThreshold = clamp(options?.brightnessThreshold ?? 232, 128, 255);
  const inkThreshold = clamp(options?.inkThreshold ?? 115, 0, 200);
  const minAreaPx = Math.max(16, Math.floor(options?.minAreaPx ?? Math.max(24, pixelCount * 0.002)));
  const maxAreaPx = Math.floor(pixelCount * clamp(options?.maxAreaRatio ?? 0.45, 0.05, 0.95));
  const minInkEnclosureRatio = clamp(options?.minInkEnclosureRatio ?? 0.45, 0, 1);

  const luma = new Float32Array(pixelCount);
  const isBright = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const lum = rgbaLuminance(rgba, i);
    luma[i] = lum;
    const alpha = rgba[i * 4 + 3];
    if (alpha >= 200 && lum >= brightnessThreshold) {
      isBright[i] = 1;
    }
  }

  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const detected: DetectedSpeechBubbleRegion[] = [];

  const dx4 = [-1, 1, 0, 0];
  const dy4 = [0, 0, -1, 1];

  for (let startIdx = 0; startIdx < pixelCount; startIdx += 1) {
    if (isBright[startIdx] === 0 || visited[startIdx] === 1) continue;

    let head = 0;
    let tail = 0;
    queue[tail] = startIdx;
    tail += 1;
    visited[startIdx] = 1;

    let area = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    let touchesBorder = false;
    let boundaryNeighbors = 0;
    let inkBoundaryNeighbors = 0;

    while (head < tail) {
      const idx = queue[head];
      head += 1;
      const x = idx % width;
      const y = (idx - x) / width;

      area += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesBorder = true;
      }

      for (let d = 0; d < 4; d += 1) {
        const nx = x + dx4[d];
        const ny = y + dy4[d];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (isBright[nIdx] === 1) {
          if (visited[nIdx] === 0) {
            visited[nIdx] = 1;
            queue[tail] = nIdx;
            tail += 1;
          }
        } else {
          boundaryNeighbors += 1;
          if (luma[nIdx] <= inkThreshold) {
            inkBoundaryNeighbors += 1;
          }
        }
      }
    }

    if (touchesBorder || area < minAreaPx || area > maxAreaPx) continue;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const fillRatio = area / (bw * bh);
    if (fillRatio < 0.35) continue;

    const inkEnclosureRatio = boundaryNeighbors > 0 ? inkBoundaryNeighbors / boundaryNeighbors : 0;
    if (inkEnclosureRatio < minInkEnclosureRatio) continue;

    const confidence = clamp(0.55 * inkEnclosureRatio + 0.45 * Math.min(1, fillRatio / 0.78), 0, 1);

    detected.push(
      Object.freeze({
        id: `bubble-${minX}-${minY}-${bw}x${bh}`,
        bounds: Object.freeze({ x: minX, y: minY, width: bw, height: bh }),
        centroid: Object.freeze([Math.round(sumX / area), Math.round(sumY / area)] as const),
        areaPx: area,
        fillRatio: Math.round(fillRatio * 1000) / 1000,
        inkEnclosureRatio: Math.round(inkEnclosureRatio * 1000) / 1000,
        confidence: Math.round(confidence * 1000) / 1000,
        source: "deterministic-cpu-fallback",
      }),
    );
  }

  detected.sort((a, b) => {
    if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y;
    return a.bounds.x - b.bounds.x;
  });

  return Object.freeze(detected);
}

/**
 * 결정적 로컬 폴백 #2: Sobel 엣지 크기 + 외곽 테두리 시드 플러드필 기반 전경 누끼(Matting) 마스크.
 * 배경색과 유사하고 엣지가 약한 테두리 영역만 배경(0)으로 제거하고 전경(255)을 보존한다.
 */
export function computeEdgeGuidedForegroundMaskLocal(
  surface: RgbaImageSurface,
  options?: {
    readonly bgColorTolerance?: number;
    readonly edgeThreshold?: number;
    readonly featherBoundary?: boolean;
  },
): ForegroundCutoutMaskResult {
  const { width, height, rgba } = surface;
  const pixelCount = width * height;
  if (width <= 2 || height <= 2 || rgba.length < pixelCount * 4) {
    return Object.freeze({
      width,
      height,
      alphaMask: new Uint8Array(Math.max(0, pixelCount)),
      foregroundPixelCount: 0,
      foregroundCoverageRatio: 0,
      boundingBox: null,
      estimatedBackgroundRgb: Object.freeze([255, 255, 255] as const),
      source: "deterministic-cpu-fallback",
    });
  }

  const bgColorTolerance = clamp(options?.bgColorTolerance ?? 42, 5, 220);
  const edgeThreshold = clamp(options?.edgeThreshold ?? 75, 10, 400);

  // 1. 이미지 외곽 테두리 픽셀 평균으로 배경 기준색 추정
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let borderSamples = 0;
  for (let x = 0; x < width; x += 1) {
    const topOff = x * 4;
    const botOff = ((height - 1) * width + x) * 4;
    sumR += rgba[topOff] + rgba[botOff];
    sumG += rgba[topOff + 1] + rgba[botOff + 1];
    sumB += rgba[topOff + 2] + rgba[botOff + 2];
    borderSamples += 2;
  }
  for (let y = 1; y < height - 1; y += 1) {
    const leftOff = (y * width) * 4;
    const rightOff = (y * width + width - 1) * 4;
    sumR += rgba[leftOff] + rgba[rightOff];
    sumG += rgba[leftOff + 1] + rgba[rightOff + 1];
    sumB += rgba[leftOff + 2] + rgba[rightOff + 2];
    borderSamples += 2;
  }
  const bgR = sumR / Math.max(1, borderSamples);
  const bgG = sumG / Math.max(1, borderSamples);
  const bgB = sumB / Math.max(1, borderSamples);

  // 2. 휘도 및 Sobel 3x3 엣지 크기 계산
  const luma = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    luma[i] = rgbaLuminance(rgba, i);
  }
  const edgeMag = new Float32Array(pixelCount);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const tl = luma[idx - width - 1];
      const tc = luma[idx - width];
      const tr = luma[idx - width + 1];
      const ml = luma[idx - 1];
      const mr = luma[idx + 1];
      const bl = luma[idx + width - 1];
      const bc = luma[idx + width];
      const br = luma[idx + width + 1];

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      edgeMag[idx] = Math.hypot(gx, gy);
    }
  }

  // 3. 테두리에서 시작하는 배경 플러드필:
  // 순수 배경색(할로 방지)은 외곽선 바로 바깥 픽셀까지 정확히 제거하고,
  // 배경과 색차가 있거나 인접 휘도 급변(스텝 엣지)·강한 Sobel 경계에서 정확히 정지한다.
  const isBackground = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const pureBgTolerance = bgColorTolerance * 0.25;
  const stepEdgeThreshold = edgeThreshold * 0.65;

  const isBgCandidate = (idx: number): boolean => {
    const off = idx * 4;
    if (rgba[off + 3] < 16) return true;
    const dist = Math.hypot(rgba[off] - bgR, rgba[off + 1] - bgG, rgba[off + 2] - bgB);
    if (dist <= pureBgTolerance) return true;
    return dist <= bgColorTolerance && edgeMag[idx] < edgeThreshold;
  };

  const canStepIntoBg = (fromIdx: number, toIdx: number): boolean => {
    if (!isBgCandidate(toIdx)) return false;
    return Math.abs(luma[toIdx] - luma[fromIdx]) < stepEdgeThreshold;
  };

  const enqueueSeed = (idx: number): void => {
    if (isBackground[idx] === 1 || !isBgCandidate(idx)) return;
    isBackground[idx] = 1;
    queue[tail] = idx;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueSeed(x);
    enqueueSeed((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueSeed(y * width);
    enqueueSeed(y * width + width - 1);
  }

  const dx4 = [-1, 1, 0, 0];
  const dy4 = [0, 0, -1, 1];
  while (head < tail) {
    const idx = queue[head];
    head += 1;
    const x = idx % width;
    const y = (idx - x) / width;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + dx4[d];
      const ny = y + dy4[d];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (isBackground[nIdx] === 0 && canStepIntoBg(idx, nIdx)) {
        isBackground[nIdx] = 1;
        queue[tail] = nIdx;
        tail += 1;
      }
    }
  }

  // 4. 전경 알파 마스크 생성(+ 선택적 1px 경계 페더링)
  const rawMask = new Uint8Array(pixelCount);
  let fgCount = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let i = 0; i < pixelCount; i += 1) {
    if (isBackground[i] === 0) {
      rawMask[i] = 255;
      fgCount += 1;
      const x = i % width;
      const y = (i - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  let alphaMask = rawMask;
  if (options?.featherBoundary && fgCount > 0) {
    const feathered = new Uint8Array(pixelCount);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (rawMask[idx] === 0) continue;
        let bgNeighbors = 0;
        for (let d = 0; d < 4; d += 1) {
          const nx = x + dx4[d];
          const ny = y + dy4[d];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || rawMask[ny * width + nx] === 0) {
            bgNeighbors += 1;
          }
        }
        feathered[idx] = bgNeighbors > 0 ? 192 : 255;
      }
    }
    alphaMask = feathered;
  }

  const boundingBox = fgCount > 0
    ? Object.freeze({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    : null;

  return Object.freeze({
    width,
    height,
    alphaMask,
    foregroundPixelCount: fgCount,
    foregroundCoverageRatio: Math.round((fgCount / pixelCount) * 10_000) / 10_000,
    boundingBox,
    estimatedBackgroundRgb: Object.freeze([
      Math.round(bgR),
      Math.round(bgG),
      Math.round(bgB),
    ] as const),
    source: "deterministic-cpu-fallback",
  });
}

/**
 * 옵트인 동의 게이트를 통과한 뒤 프로바이더 선택·OPFS 캐시 확인·로컬 결정적 폴백을 통합 실행한다.
 */
export function runOnDeviceAssistTask(input: {
  readonly task: OnDeviceAssistTaskKind;
  readonly consent: OnDeviceAssistConsentState;
  readonly hardware: OnDeviceHardwareProbe;
  readonly cacheManifest: OpfsModelCacheManifest;
  readonly surface: RgbaImageSurface;
  readonly preferDeterministicFallback?: boolean;
}): OnDeviceAssistExecutionResult {
  if (!input.consent.optedIn) {
    return Object.freeze({
      status: "opt-in-required",
      task: input.task,
      serverGpuCostKrw: ZERO_SERVER_GPU_COST_KRW,
      message: "온디바이스 AI 보조는 옵트인 전용입니다. 설정에서 로컬 실행에 동의한 뒤 다시 시도해 주세요.",
    });
  }

  const providerSelection = selectOnDeviceExecutionProvider(input.hardware, input.task, {
    preferDeterministicFallback: input.preferDeterministicFallback,
  });

  const cachedEntry = input.cacheManifest.entries.find(
    (entry) => entry.task === input.task && verifyOpfsModelChecksum(entry),
  );
  const usedDeterministicFallback =
    !providerSelection.requiresModelWeights || !cachedEntry;

  if (input.task === "speech-bubble-detect") {
    return Object.freeze({
      status: "completed",
      task: "speech-bubble-detect",
      providerSelection,
      usedDeterministicFallback,
      serverGpuCostKrw: ZERO_SERVER_GPU_COST_KRW,
      bubbles: detectSpeechBubbleRegionsLocal(input.surface),
    });
  }

  return Object.freeze({
    status: "completed",
    task: "foreground-cutout",
    providerSelection,
    usedDeterministicFallback,
    serverGpuCostKrw: ZERO_SERVER_GPU_COST_KRW,
    mask: computeEdgeGuidedForegroundMaskLocal(input.surface, { featherBoundary: true }),
  });
}
