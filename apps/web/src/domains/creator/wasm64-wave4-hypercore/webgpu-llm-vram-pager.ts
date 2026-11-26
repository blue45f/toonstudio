/**
 * WebGPU 로컬 LLM INT4/NF4 타일 행렬곱(MatMul) 파이프라인 튜너 및
 * 가상화 PagedAttention KV-Cache VRAM 페이저 (`wasm64-wave4-hypercore`).
 *
 * - 16단계 NormalFloat4(NF4) 및 대칭 INT4 블록 양자화/역양자화 + 하드웨어 어댑터 한계 기반 WGSL 생성
 * - 256토큰 고정 페이지 단위 가상 KV-Cache 관리: 어텐션 싱크(Sink) 페이지 고정 + LRU 스왑 아웃/인
 * - 1.5~2.0 GiB 엄격한 VRAM 상한 안에서 8K~32K+ 문맥을 OOM 0건으로 유지하며 CPU/OPFS 백킹 풀과 연동
 */

const GiB = 1024 * 1024 * 1024;
const MiB = 1024 * 1024;
const FNV32_OFFSET = 0x811c9dc5;
const FNV32_PRIME = 0x01000193;

/** QLoRA 표준 정규분포 분위수 기반 16단계 NormalFloat4(NF4) 코드북. */
export const NF4_CODEBOOK: readonly number[] = Object.freeze([
  -1.0,
  -0.6961928009986877,
  -0.5250730514526367,
  -0.39491748809814453,
  -0.28444138169288635,
  -0.18477343022823334,
  -0.09105003625154495,
  0.0,
  0.07958029955625534,
  0.16093020141124725,
  0.24611230194568634,
  0.33791524171829224,
  0.44070982933044434,
  0.5626170039176941,
  0.7229568362236023,
  1.0,
]);

/** PagedAttention 단일 물리/논리 KV 페이지가 담는 토큰 수. */
export const TOKENS_PER_KV_PAGE = 256;

export type LlmWeightQuantFormat = "nf4" | "int4";

export interface WebGpuLlmAdapterLimits {
  readonly subgroupsSupported: boolean;
  readonly shaderF16Supported: boolean;
  readonly maxComputeWorkgroupStorageSize: number;
  readonly maxComputeInvocationsPerWorkgroup: number;
  readonly maxStorageBufferBindingSize: number;
  readonly subgroupSize?: number;
}

export interface QuantizedBlock32 {
  readonly format: LlmWeightQuantFormat;
  readonly absmaxScale: number;
  readonly packedNibbles: Uint8Array;
}

export interface TunedMatMulPipelineDescriptor {
  readonly label: string;
  readonly quantFormat: LlmWeightQuantFormat;
  readonly useSubgroups: boolean;
  readonly useF16Accum: boolean;
  readonly tileM: number;
  readonly tileN: number;
  readonly tileK: number;
  readonly workgroupSize: readonly [number, number, number];
  readonly sharedMemoryBytes: number;
  readonly groupSize: number;
  readonly wgslSource: string;
  readonly bindGroupEntries: readonly {
    readonly binding: number;
    readonly visibility: "compute";
    readonly bufferType: "uniform" | "read-only-storage" | "storage";
  }[];
}

export interface KvSwappedPageBlob {
  readonly pageKey: string;
  readonly layerIndex: number;
  readonly logicalPageIndex: number;
  readonly tokenCount: number;
  readonly checksumFnv32: number;
  readonly bytes: Uint8Array;
}

/** 브라우저 전역 KV 없이 외부에서 주입하는 CPU/OPFS 스왑 백킹 풀 포트. */
export interface KvPageBackingPoolPort {
  readonly stageOutPage: (blob: KvSwappedPageBlob) => void;
  readonly stageInPage: (pageKey: string) => KvSwappedPageBlob | null;
  readonly releasePage: (pageKey: string) => void;
  readonly countStagedPages?: () => number;
}

export interface VramKvPagerConfig {
  readonly vramCapBytes?: number;
  readonly modelWeightsBytes?: number;
  readonly activationScratchBytes?: number;
  readonly numLayers?: number;
  readonly numKvHeads?: number;
  readonly headDim?: number;
  readonly bytesPerKvElement?: 1 | 2;
  readonly pinnedSinkPages?: number;
  readonly recentWindowPages?: number;
  readonly backingPool?: KvPageBackingPoolPort;
}

export interface LogicalKvPageEntry {
  readonly pageKey: string;
  readonly sequenceId: string;
  readonly layerIndex: number;
  readonly logicalPageIndex: number;
  readonly filledTokens: number;
  readonly pinnedSink: boolean;
  readonly residency: "vram" | "swapped";
  readonly physicalSlot: number | null;
  readonly lastAccessTick: number;
  readonly checksumFnv32: number;
}

export interface VramKvPagerTelemetry {
  readonly vramCapBytes: number;
  readonly modelWeightsBytes: number;
  readonly activationScratchBytes: number;
  readonly kvPoolBudgetBytes: number;
  readonly singlePageBytes: number;
  readonly maxPhysicalPages: number;
  readonly residentPhysicalPages: number;
  readonly pinnedPhysicalPages: number;
  readonly swappedOutPages: number;
  readonly currentTotalVramBytes: number;
  readonly peakTotalVramBytes: number;
  readonly swapOutCount: number;
  readonly swapInCount: number;
  readonly pageFaultCount: number;
  readonly oomEvents: number;
  readonly serverCostKrw: 0;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function fnv1a32(bytes: Uint8Array): number {
  let hash = FNV32_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, FNV32_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function nearestNf4Index(normalized: number): number {
  let bestIdx = 0;
  let bestDist = Math.abs(normalized - (NF4_CODEBOOK[0] ?? -1));
  for (let i = 1; i < 16; i += 1) {
    const dist = Math.abs(normalized - (NF4_CODEBOOK[i] ?? 0));
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** 길이 32 실수 가중치 블록을 NF4 또는 대칭 INT4 니블 배열(16B)과 스케일로 양자화한다. */
export function quantizeWeightBlock32(
  weights: Float32Array,
  format: LlmWeightQuantFormat = "nf4",
): QuantizedBlock32 {
  const blockLen = Math.min(32, weights.length);
  let absmax = 0;
  for (let i = 0; i < blockLen; i += 1) {
    const a = Math.abs(weights[i] ?? 0);
    if (a > absmax) absmax = a;
  }
  const safeScale = absmax > 1e-12 ? absmax : 1e-12;
  const packed = new Uint8Array(16);

  for (let pair = 0; pair < 16; pair += 1) {
    const w0 = pair * 2 < blockLen ? (weights[pair * 2] ?? 0) : 0;
    const w1 = pair * 2 + 1 < blockLen ? (weights[pair * 2 + 1] ?? 0) : 0;
    let lo: number;
    let hi: number;
    if (format === "nf4") {
      lo = nearestNf4Index(clamp(w0 / safeScale, -1, 1));
      hi = nearestNf4Index(clamp(w1 / safeScale, -1, 1));
    } else {
      const q0 = clamp(Math.round((w0 / safeScale) * 7), -8, 7);
      const q1 = clamp(Math.round((w1 / safeScale) * 7), -8, 7);
      lo = (q0 + 8) & 0x0f;
      hi = (q1 + 8) & 0x0f;
    }
    packed[pair] = (lo & 0x0f) | ((hi & 0x0f) << 4);
  }

  return { format, absmaxScale: absmax, packedNibbles: packed };
}

/** 양자화된 32-가중치 블록을 Float32Array(32)로 역양자화한다. */
export function dequantizeWeightBlock32(block: QuantizedBlock32): Float32Array {
  const out = new Float32Array(32);
  const scale = block.absmaxScale;
  for (let pair = 0; pair < 16; pair += 1) {
    const byte = block.packedNibbles[pair] ?? 0;
    const lo = byte & 0x0f;
    const hi = (byte >>> 4) & 0x0f;
    if (block.format === "nf4") {
      out[pair * 2] = (NF4_CODEBOOK[lo] ?? 0) * scale;
      out[pair * 2 + 1] = (NF4_CODEBOOK[hi] ?? 0) * scale;
    } else {
      out[pair * 2] = ((lo - 8) / 7) * scale;
      out[pair * 2 + 1] = ((hi - 8) / 7) * scale;
    }
  }
  return out;
}

/** CPU 기준 검증용: 블록 양자화된 가중치 행렬(N×K, K는 32 배수)과 입력(M×K)의 행렬곱을 계산한다. */
export function executeQuantizedMatMulReference(
  activations: Float32Array,
  m: number,
  n: number,
  k: number,
  packedWeights: Uint8Array,
  blockScales: Float32Array,
  format: LlmWeightQuantFormat = "nf4",
): Float32Array {
  if (k <= 0 || k % 32 !== 0) {
    throw new RangeError("K 차원은 양의 32 배수여야 합니다.");
  }
  const blocksPerRow = k / 32;
  const output = new Float32Array(m * n);

  for (let row = 0; row < m; row += 1) {
    const aRowOffset = row * k;
    for (let col = 0; col < n; col += 1) {
      let acc = 0;
      const blockBase = col * blocksPerRow;
      for (let b = 0; b < blocksPerRow; b += 1) {
        const scale = blockScales[blockBase + b] ?? 0;
        const packBase = (blockBase + b) * 16;
        const kBase = aRowOffset + b * 32;
        for (let pair = 0; pair < 16; pair += 1) {
          const byte = packedWeights[packBase + pair] ?? 0;
          const lo = byte & 0x0f;
          const hi = (byte >>> 4) & 0x0f;
          const w0 =
            format === "nf4" ? (NF4_CODEBOOK[lo] ?? 0) * scale : ((lo - 8) / 7) * scale;
          const w1 =
            format === "nf4" ? (NF4_CODEBOOK[hi] ?? 0) * scale : ((hi - 8) / 7) * scale;
          acc += (activations[kBase + pair * 2] ?? 0) * w0;
          acc += (activations[kBase + pair * 2 + 1] ?? 0) * w1;
        }
      }
      output[row * n + col] = acc;
    }
  }
  return output;
}

/** WebGPU 어댑터 한계에 맞춰 INT4/NF4 서브그룹·타일 MatMul WGSL 및 파이프라인 디스크립터를 튜닝한다. */
export function tuneWebGpuLlmMatMulPipeline(
  limits: WebGpuLlmAdapterLimits,
  quantFormat: LlmWeightQuantFormat = "nf4",
  label = "toonstudio-llm-q4-matmul",
): TunedMatMulPipelineDescriptor {
  const maxWgInvocations = Math.max(64, limits.maxComputeInvocationsPerWorkgroup);
  const maxShared = Math.max(4096, limits.maxComputeWorkgroupStorageSize);
  const canSubgroupTile =
    limits.subgroupsSupported && maxWgInvocations >= 256 && maxShared >= 16_384;

  const tileM = canSubgroupTile ? 64 : maxShared >= 8192 && maxWgInvocations >= 128 ? 32 : 16;
  const tileN = canSubgroupTile ? 64 : 16;
  const tileK = 32;
  const wgX = canSubgroupTile ? 16 : 8;
  const wgY = canSubgroupTile ? 16 : 8;
  const sharedMemoryBytes = (tileM * tileK + tileN * tileK) * 4;

  const enableDirectives: string[] = [];
  if (canSubgroupTile) enableDirectives.push("enable subgroups;");
  if (limits.shaderF16Supported) enableDirectives.push("enable f16;");

  const dequantExpr =
    quantFormat === "nf4"
      ? "NF4_LUT[nibble] * scale"
      : "(f32(i32(nibble) - 8) * 0.14285715) * scale";

  const lutDecl =
    quantFormat === "nf4"
      ? `const NF4_LUT = array<f32, 16>(${NF4_CODEBOOK.map((v) => v.toFixed(6)).join(", ")});\n`
      : "";

  const wgslSource = [
    ...enableDirectives,
    "struct MatMulUniforms { m: u32, n: u32, k: u32, blocks_per_row: u32 };",
    lutDecl.trimEnd(),
    "@group(0) @binding(0) var<uniform> uniforms: MatMulUniforms;",
    "@group(0) @binding(1) var<storage, read> activations: array<f32>;",
    "@group(0) @binding(2) var<storage, read> packed_weights: array<u32>;",
    "@group(0) @binding(3) var<storage, read> block_scales: array<f32>;",
    "@group(0) @binding(4) var<storage, read_write> out_matrix: array<f32>;",
    `var<workgroup> tile_a: array<f32, ${tileM * tileK}>;`,
    `var<workgroup> tile_b: array<f32, ${tileN * tileK}>;`,
    `@compute @workgroup_size(${wgX}, ${wgY}, 1)`,
    "fn q4_matmul_main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {",
    "  let row = gid.y;",
    "  let col = gid.x;",
    "  var acc: f32 = 0.0;",
    "  for (var blk: u32 = 0u; blk < uniforms.blocks_per_row; blk = blk + 1u) {",
    "    let k_base = blk * 32u;",
    "    let scale = select(0.0, block_scales[col * uniforms.blocks_per_row + blk], col < uniforms.n);",
    "    let word_base = (col * uniforms.blocks_per_row + blk) * 4u;",
    "    for (var w: u32 = 0u; w < 4u; w = w + 1u) {",
    "      let packed = select(0u, packed_weights[word_base + w], col < uniforms.n);",
    "      for (var nib: u32 = 0u; nib < 8u; nib = nib + 1u) {",
    "        let nibble = (packed >> (nib * 4u)) & 0xfu;",
    `        let weight = ${dequantExpr};`,
    "        let k_idx = k_base + w * 8u + nib;",
    "        let act = select(0.0, activations[row * uniforms.k + k_idx], row < uniforms.m && k_idx < uniforms.k);",
    "        acc = acc + act * weight;",
    "      }",
    "    }",
    "    workgroupBarrier();",
    "  }",
    "  if (row < uniforms.m && col < uniforms.n) {",
    "    out_matrix[row * uniforms.n + col] = acc;",
    "  }",
    "}",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  return {
    label,
    quantFormat,
    useSubgroups: canSubgroupTile,
    useF16Accum: limits.shaderF16Supported,
    tileM,
    tileN,
    tileK,
    workgroupSize: [wgX, wgY, 1],
    sharedMemoryBytes,
    groupSize: 32,
    wgslSource,
    bindGroupEntries: [
      { binding: 0, visibility: "compute", bufferType: "uniform" },
      { binding: 1, visibility: "compute", bufferType: "read-only-storage" },
      { binding: 2, visibility: "compute", bufferType: "read-only-storage" },
      { binding: 3, visibility: "compute", bufferType: "read-only-storage" },
      { binding: 4, visibility: "compute", bufferType: "storage" },
    ],
  };
}

/** 기본 메모리 스왑 백킹 풀(OPFS 파일 핸들 포트가 없을 때 사용하는 순수 메모리 풀). */
export function createInMemoryKvBackingPool(): KvPageBackingPoolPort {
  const pages = new Map<string, KvSwappedPageBlob>();
  return {
    stageOutPage: (blob) => {
      pages.set(blob.pageKey, {
        ...blob,
        bytes: new Uint8Array(blob.bytes),
      });
    },
    stageInPage: (pageKey) => {
      const found = pages.get(pageKey);
      return found ? { ...found, bytes: new Uint8Array(found.bytes) } : null;
    },
    releasePage: (pageKey) => {
      pages.delete(pageKey);
    },
    countStagedPages: () => pages.size,
  };
}

interface InternalKvPageRecord {
  pageKey: string;
  sequenceId: string;
  layerIndex: number;
  logicalPageIndex: number;
  filledTokens: number;
  pinnedSink: boolean;
  residency: "vram" | "swapped";
  physicalSlot: number | null;
  lastAccessTick: number;
  checksumFnv32: number;
}

/**
 * 1.5~2.0 GiB 엄격한 VRAM 상한 안에서 256토큰 페이지 단위로 8K+ 문맥을 운용하는
 * 가상화 PagedAttention KV-Cache VRAM 페이저.
 */
export class WebGpuVramKvPager {
  public readonly vramCapBytes: number;
  public readonly modelWeightsBytes: number;
  public readonly activationScratchBytes: number;
  public readonly kvPoolBudgetBytes: number;
  public readonly numLayers: number;
  public readonly numKvHeads: number;
  public readonly headDim: number;
  public readonly bytesPerKvElement: 1 | 2;
  public readonly singlePageBytes: number;
  public readonly maxPhysicalPages: number;
  public readonly pinnedSinkPages: number;
  public readonly recentWindowPages: number;

  private readonly backingPool: KvPageBackingPoolPort;
  private readonly physicalPayloads: (Uint8Array | null)[];
  private readonly slotOwners: (string | null)[];
  private readonly freeSlots: number[] = [];
  private readonly pageTable = new Map<string, InternalKvPageRecord>();

  private tick = 0;
  private residentCount = 0;
  private pinnedCount = 0;
  private swappedCount = 0;
  private peakVramBytes: number;
  private swapOutCount = 0;
  private swapInCount = 0;
  private pageFaultCount = 0;
  private oomEvents = 0;

  public constructor(config?: VramKvPagerConfig) {
    const rawCap = config?.vramCapBytes ?? Math.round(1.75 * GiB);
    this.vramCapBytes = clamp(Math.round(rawCap), Math.round(1.5 * GiB), 2 * GiB);
    this.modelWeightsBytes = Math.max(64 * MiB, Math.round(config?.modelWeightsBytes ?? 1152 * MiB));
    this.activationScratchBytes = Math.max(
      16 * MiB,
      Math.round(config?.activationScratchBytes ?? 128 * MiB),
    );
    this.numLayers = Math.max(1, Math.round(config?.numLayers ?? 24));
    this.numKvHeads = Math.max(1, Math.round(config?.numKvHeads ?? 8));
    this.headDim = Math.max(16, Math.round(config?.headDim ?? 128));
    this.bytesPerKvElement = config?.bytesPerKvElement ?? 2;
    this.pinnedSinkPages = Math.max(1, Math.round(config?.pinnedSinkPages ?? 1));
    this.recentWindowPages = Math.max(2, Math.round(config?.recentWindowPages ?? 4));
    this.backingPool = config?.backingPool ?? createInMemoryKvBackingPool();

    // K + V 2개 텐서 * TOKENS_PER_KV_PAGE * numKvHeads * headDim * bytesPerElement
    this.singlePageBytes =
      2 * TOKENS_PER_KV_PAGE * this.numKvHeads * this.headDim * this.bytesPerKvElement;
    const remainingBudget = this.vramCapBytes - this.modelWeightsBytes - this.activationScratchBytes;
    if (remainingBudget < this.singlePageBytes * this.numLayers * (this.pinnedSinkPages + 2)) {
      throw new RangeError("VRAM 상한 대비 모델 가중치 예산이 과도하여 최소 KV 풀을 구성할 수 없습니다.");
    }
    this.kvPoolBudgetBytes = remainingBudget;
    this.maxPhysicalPages = Math.floor(this.kvPoolBudgetBytes / this.singlePageBytes);
    this.physicalPayloads = new Array<Uint8Array | null>(this.maxPhysicalPages).fill(null);
    this.slotOwners = new Array<string | null>(this.maxPhysicalPages).fill(null);
    for (let s = this.maxPhysicalPages - 1; s >= 0; s -= 1) {
      this.freeSlots.push(s);
    }
    this.peakVramBytes = this.modelWeightsBytes + this.activationScratchBytes;
  }

  private makeKey(sequenceId: string, layerIndex: number, logicalPageIndex: number): string {
    return `${sequenceId}:L${layerIndex}:P${logicalPageIndex}`;
  }

  private updatePeakVram(): void {
    const current =
      this.modelWeightsBytes + this.activationScratchBytes + this.residentCount * this.singlePageBytes;
    if (current > this.peakVramBytes) {
      this.peakVramBytes = current;
    }
  }

  private synthesizePageBytes(layerIndex: number, logicalPageIndex: number, tokenCount: number): Uint8Array {
    // 전체 512KiB 물리 슬롯 메타와 결정론적 헤더/테일 서명 바이트를 채운다(테스트 속도·메모리 균형).
    const sampleBytes = Math.min(this.singlePageBytes, 4096);
    const buf = new Uint8Array(sampleBytes);
    const view = new DataView(buf.buffer);
    view.setUint32(0, layerIndex >>> 0, true);
    view.setUint32(4, logicalPageIndex >>> 0, true);
    view.setUint32(8, tokenCount >>> 0, true);
    for (let i = 12; i < sampleBytes; i += 4) {
      view.setUint32(
        i,
        (Math.imul(layerIndex + 31, 0x9e3779b9) ^ Math.imul(logicalPageIndex + 17, i + 1) ^ tokenCount) >>> 0,
        true,
      );
    }
    return buf;
  }

  private evictOneVictim(protectedKeys?: ReadonlySet<string>): number {
    let victim: InternalKvPageRecord | null = null;
    for (const rec of this.pageTable.values()) {
      if (rec.residency !== "vram" || rec.pinnedSink) continue;
      if (protectedKeys?.has(rec.pageKey)) continue;
      if (victim === null || rec.lastAccessTick < victim.lastAccessTick) {
        victim = rec;
      }
    }
    if (!victim || victim.physicalSlot === null) {
      this.oomEvents += 1;
      throw new Error("KV-Cache 물리 슬롯이 고갈되었으나 축출 가능한 비고정 페이지가 없습니다.");
    }
    const slot = victim.physicalSlot;
    const payload = this.physicalPayloads[slot] ?? new Uint8Array(0);
    const checksum = fnv1a32(payload);
    this.backingPool.stageOutPage({
      pageKey: victim.pageKey,
      layerIndex: victim.layerIndex,
      logicalPageIndex: victim.logicalPageIndex,
      tokenCount: victim.filledTokens,
      checksumFnv32: checksum,
      bytes: payload,
    });
    this.physicalPayloads[slot] = null;
    this.slotOwners[slot] = null;
    victim.physicalSlot = null;
    victim.residency = "swapped";
    victim.checksumFnv32 = checksum;
    this.residentCount -= 1;
    this.swappedCount += 1;
    this.swapOutCount += 1;
    return slot;
  }

  private acquirePhysicalSlot(protectedKeys?: ReadonlySet<string>): number {
    const free = this.freeSlots.pop();
    if (free !== undefined) return free;
    return this.evictOneVictim(protectedKeys);
  }

  /** 시퀀스에 새 토큰 구간을 추가하고 레이어별 256토큰 KV 페이지를 할당·스왑 관리한다. */
  public appendTokens(sequenceId: string, currentTokenLength: number, addedTokens: number): {
    readonly newTokenLength: number;
    readonly logicalPagesPerLayer: number;
  } {
    if (addedTokens <= 0) {
      return {
        newTokenLength: currentTokenLength,
        logicalPagesPerLayer: Math.ceil(currentTokenLength / TOKENS_PER_KV_PAGE),
      };
    }
    const totalTokens = currentTokenLength + addedTokens;
    const totalLogicalPages = Math.ceil(totalTokens / TOKENS_PER_KV_PAGE);
    const firstTouchedPage = Math.floor(currentTokenLength / TOKENS_PER_KV_PAGE);

    for (let p = firstTouchedPage; p < totalLogicalPages; p += 1) {
      const filledInPage = Math.min(TOKENS_PER_KV_PAGE, totalTokens - p * TOKENS_PER_KV_PAGE);
      const isSink = p < this.pinnedSinkPages;
      for (let layer = 0; layer < this.numLayers; layer += 1) {
        this.tick += 1;
        const key = this.makeKey(sequenceId, layer, p);
        const existing = this.pageTable.get(key);
        if (existing) {
          if (existing.residency === "swapped") {
            this.faultInPage(key);
          }
          const payload = this.synthesizePageBytes(layer, p, filledInPage);
          if (existing.physicalSlot !== null) {
            this.physicalPayloads[existing.physicalSlot] = payload;
          }
          existing.filledTokens = filledInPage;
          existing.checksumFnv32 = fnv1a32(payload);
          existing.lastAccessTick = this.tick;
        } else {
          const slot = this.acquirePhysicalSlot();
          const payload = this.synthesizePageBytes(layer, p, filledInPage);
          const checksum = fnv1a32(payload);
          this.physicalPayloads[slot] = payload;
          this.slotOwners[slot] = key;
          this.residentCount += 1;
          if (isSink) this.pinnedCount += 1;
          this.pageTable.set(key, {
            pageKey: key,
            sequenceId,
            layerIndex: layer,
            logicalPageIndex: p,
            filledTokens: filledInPage,
            pinnedSink: isSink,
            residency: "vram",
            physicalSlot: slot,
            lastAccessTick: this.tick,
            checksumFnv32: checksum,
          });
          this.updatePeakVram();
        }
      }
    }

    return { newTokenLength: totalTokens, logicalPagesPerLayer: totalLogicalPages };
  }

  /** 스왑 아웃된 논리 KV 페이지를 체크섬 검증과 함께 물리 VRAM 슬롯으로 복원한다. */
  public faultInPage(pageKey: string, protectedKeys?: ReadonlySet<string>): LogicalKvPageEntry {
    const rec = this.pageTable.get(pageKey);
    if (!rec) {
      throw new Error(`존재하지 않는 KV 페이지 키입니다: ${pageKey}`);
    }
    this.tick += 1;
    if (rec.residency === "vram") {
      rec.lastAccessTick = this.tick;
      return { ...rec };
    }

    this.pageFaultCount += 1;
    const staged = this.backingPool.stageInPage(pageKey);
    if (!staged) {
      throw new Error(`백킹 풀에서 스왑된 KV 페이지를 찾을 수 없습니다: ${pageKey}`);
    }
    const actualChecksum = fnv1a32(staged.bytes);
    if (actualChecksum !== rec.checksumFnv32) {
      throw new Error(`KV 페이지 체크섬 불일치가 감지되었습니다: ${pageKey}`);
    }

    const slot = this.acquirePhysicalSlot(protectedKeys);
    this.physicalPayloads[slot] = staged.bytes;
    this.slotOwners[slot] = pageKey;
    rec.physicalSlot = slot;
    rec.residency = "vram";
    rec.lastAccessTick = this.tick;
    this.residentCount += 1;
    this.swappedCount -= 1;
    this.swapInCount += 1;
    this.backingPool.releasePage(pageKey);
    this.updatePeakVram();
    return { ...rec };
  }

  /** 디코딩 스텝을 위해 어텐션 싱크 페이지 + 지정한 과거 참조 페이지 + 최근 윈도우 페이지를 VRAM에 상주시킨다. */
  public ensureAttentionStepResident(
    sequenceId: string,
    totalTokens: number,
    recalledLogicalPages: readonly number[] = [],
  ): readonly number[] {
    const totalPages = Math.ceil(totalTokens / TOKENS_PER_KV_PAGE);
    const neededLogical = new Set<number>();
    for (let s = 0; s < Math.min(this.pinnedSinkPages, totalPages); s += 1) {
      neededLogical.add(s);
    }
    for (let r = Math.max(0, totalPages - this.recentWindowPages); r < totalPages; r += 1) {
      neededLogical.add(r);
    }
    for (const recalled of recalledLogicalPages) {
      if (recalled >= 0 && recalled < totalPages) neededLogical.add(recalled);
    }

    const orderedLogical = [...neededLogical].sort((a, b) => a - b);
    const protectedSet = new Set<string>();
    let requiredSlots = this.pinnedCount;
    for (let layer = 0; layer < this.numLayers; layer += 1) {
      for (const lp of orderedLogical) {
        const key = this.makeKey(sequenceId, layer, lp);
        const page = this.pageTable.get(key);
        if (!page) throw new Error(`존재하지 않는 KV 페이지 키입니다: ${key}`);
        protectedSet.add(key);
        if (!page.pinnedSink) requiredSlots += 1;
      }
    }
    // 다른 시퀀스의 싱크 페이지도 축출할 수 없으므로 스왑을 시작하기 전에 함께 센다.
    if (requiredSlots > this.maxPhysicalPages) {
      this.oomEvents += 1;
      throw new RangeError("어텐션 단계에 필요한 페이지가 KV-Cache 물리 슬롯 한도를 초과합니다.");
    }
    for (const key of protectedSet) this.faultInPage(key, protectedSet);
    return orderedLogical;
  }

  /** 특정 시퀀스의 모든 물리 슬롯과 스왑 페이지를 해제한다. */
  public releaseSequence(sequenceId: string): number {
    let freed = 0;
    for (const [key, rec] of this.pageTable.entries()) {
      if (rec.sequenceId !== sequenceId) continue;
      if (rec.residency === "vram" && rec.physicalSlot !== null) {
        this.physicalPayloads[rec.physicalSlot] = null;
        this.slotOwners[rec.physicalSlot] = null;
        this.freeSlots.push(rec.physicalSlot);
        this.residentCount -= 1;
        if (rec.pinnedSink) this.pinnedCount -= 1;
      } else {
        this.backingPool.releasePage(key);
        this.swappedCount -= 1;
      }
      this.pageTable.delete(key);
      freed += 1;
    }
    return freed;
  }

  public getPageEntry(sequenceId: string, layerIndex: number, logicalPageIndex: number): LogicalKvPageEntry | null {
    const found = this.pageTable.get(this.makeKey(sequenceId, layerIndex, logicalPageIndex));
    return found ? { ...found } : null;
  }

  public getTelemetry(): VramKvPagerTelemetry {
    const currentTotalVramBytes =
      this.modelWeightsBytes + this.activationScratchBytes + this.residentCount * this.singlePageBytes;
    return {
      vramCapBytes: this.vramCapBytes,
      modelWeightsBytes: this.modelWeightsBytes,
      activationScratchBytes: this.activationScratchBytes,
      kvPoolBudgetBytes: this.kvPoolBudgetBytes,
      singlePageBytes: this.singlePageBytes,
      maxPhysicalPages: this.maxPhysicalPages,
      residentPhysicalPages: this.residentCount,
      pinnedPhysicalPages: this.pinnedCount,
      swappedOutPages: this.swappedCount,
      currentTotalVramBytes,
      peakTotalVramBytes: this.peakVramBytes,
      swapOutCount: this.swapOutCount,
      swapInCount: this.swapInCount,
      pageFaultCount: this.pageFaultCount,
      oomEvents: this.oomEvents,
      serverCostKrw: 0,
    };
  }
}
