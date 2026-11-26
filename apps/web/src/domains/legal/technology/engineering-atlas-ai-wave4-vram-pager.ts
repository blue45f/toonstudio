import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · ai · Wave-4 HyperCore: WebGPU 로컬 LLM INT4/NF4 서브그룹·타일 MatMul 튜너 및
 * 가상화 PagedAttention KV-Cache VRAM 페이저(1.5~2.0 GiB 상한 · 8K+ 문맥 · OOM 0).
 */
export const ENGINEERING_ATLAS_AI_WAVE4_VRAM_PAGER: readonly EngineeringAtlasEntry[] = [
  {
    id: "webgpu-llm-nf4-paged-attention-vram-pager",
    category: "ai",
    name: "WebGPU NF4 MatMul · PagedAttention KV Pager",
    title: t("WebGPU NF4/INT4 행렬곱 튜너 · PagedAttention VRAM 페이저", "WebGPU NF4/INT4 MatMul tuner & PagedAttention VRAM pager"),
    status: "experimental",
    tagline: t(
      "인메모리 단위 테스트에서 1.6 GiB의 가상 메모리 예산으로 8,704토큰의 KV 페이지 배치를 검증했습니다.",
      "An in-memory unit test verified placement of 8,704 tokens of KV pages against a simulated 1.6 GiB memory budget.",
    ),
    background: [
      t(
        "브라우저 WebGPU 환경에서 로컬 LLM 을 실행할 때 문맥이 8K 토큰을 넘어가면 연속된 KV-Cache 버퍼가 급격히 불어나 내장 GPU 나 노트북에서 VRAM 부족(OOM) 탭 강제 종료가 일어납니다. 가중치 역시 FP16 그대로 올리면 단일 버퍼 바인딩 한도에 막힙니다.",
        "Running local LLMs on browser WebGPU past 8K tokens rapidly inflates contiguous KV-Cache buffers, triggering GPU OOM tab crashes on laptops and integrated GPUs.",
      ),
      t(
        "tuneWebGpuLlmMatMulPipeline(webgpu-llm-vram-pager.ts)은 16단계 NormalFloat4(NF4) 코드북과 대칭 INT4 니블 패킹을 지원하며, 어댑터의 subgroups·shader-f16·공유 메모리 한계를 읽어 64×64 서브그룹 타일 또는 16×16 폴백 WGSL 컴퓨트 셰이더를 생성합니다.",
        "tuneWebGpuLlmMatMulPipeline supports 16-entry NormalFloat4 (NF4) and symmetric INT4 nibble blocks, inspecting subgroups, shader-f16 and workgroup storage limits to emit 64x64 subgroup or 16x16 fallback WGSL kernels.",
      ),
      t(
        "WebGpuVramKvPager는 256토큰 단위로 KV 페이지의 가상 배치를 관리합니다. 첫 어텐션 싱크를 고정하고 중간 페이지는 FNV-1a 체크섬과 함께 외부 저장 어댑터로 옮깁니다. 현재 검증 범위는 인메모리 어댑터를 주입한 단위 테스트입니다. /studio 추론 워커 연결과 실제 GPU 검증은 후속 단계입니다.",
        "WebGpuVramKvPager models placement of 256-token KV pages, pins initial attention sinks and swaps middle pages through an injected adapter with FNV-1a checksums. Current evidence comes from unit tests with an in-memory adapter. Wiring it into the /studio inference worker and testing on physical GPUs are follow-up work.",
      ),
    ],
    keyPoints: [
      t("16단계 NF4 · 대칭 INT4 블록 양자화 및 어댑터별 WGSL 타일 튜닝", "16-level NF4 & INT4 block quantization with adaptive WGSL tiling"),
      t("256토큰 고정 페이지 가상 KV-Cache 및 어텐션 싱크 영구 고정", "256-token virtual KV-Cache pages with pinned attention sinks"),
      t("인메모리 단위 테스트에서 1.6 GiB 예산·8,704토큰·페이저 OOM 카운터 0 확인", "In-memory unit test: 1.6 GiB budget, 8,704 tokens, pager OOM counter at zero"),
      t("인메모리 백킹 어댑터의 FNV-1a 체크섬과 페이지 반출·복원 검증", "FNV-1a checksums and round-trip swapping verified with an in-memory backing adapter"),
    ],
    diagram: {
      id: "webgpu-llm-nf4-paged-attention-vram-pager-diagram",
      kind: "layers",
      title: t("WebGPU NF4 MatMul 및 PagedAttention KV-Cache 메모리 계층", "WebGPU NF4 MatMul & PagedAttention KV-Cache memory hierarchy"),
      caption: t(
        "가상 메모리 예산을 계산하는 페이저 모형입니다. 어텐션 싱크와 최근 페이지를 상주 슬롯에 두고 중간 페이지를 백킹 어댑터로 옮깁니다.",
        "The pager model accounts for a virtual memory budget, keeping attention sinks and recent pages resident while swapping middle pages through a backing adapter.",
      ),
      alt: t(
        "8,704토큰 테스트 입력이 256토큰 단위 KV 페이지 테이블을 거칩니다. 페이저가 1.6 GiB 예산 안에서 상주 페이지를 계산하고, 중간 페이지는 FNV-1a 체크섬과 함께 인메모리 백킹 어댑터에 보냅니다.",
        "The 8,704-token fixture maps through a 256-token KV page table. The pager accounts for resident pages under a 1.6 GiB budget and swaps middle pages to an in-memory adapter with FNV-1a checksums.",
      ),
      layers: [
        { id: "ctx", label: t("8,704토큰 테스트 입력", "8,704-token test input"), sub: t("17회, 매회 512토큰 추가", "17 batches of 512 tokens"), tone: "local", chips: ["256 tok/page"] },
        { id: "pt", label: t("가상 KV 페이지 테이블", "Virtual KV page table"), sub: t("논리 페이지를 상주 슬롯 또는 스왑 상태에 연결", "Maps logical pages to resident slots or swap state"), tone: "good", chips: ["LRU", "Sink Pin"] },
        { id: "vram", label: t("가상 메모리 예산 1.6 GiB", "Simulated 1.6 GiB memory budget"), sub: t("단위 테스트의 페이저 OOM 카운터 0회", "Pager OOM counter at zero in the unit test"), tone: "ai", chips: ["WebGPU", "WGSL"] },
        { id: "swap", label: t("인메모리 백킹 어댑터", "In-memory backing adapter"), sub: t("축출 페이지 저장과 FNV-1a 체크섬 복원", "Stores evicted pages and checks FNV-1a on reload"), tone: "neutral", chips: ["FNV-1a"] },
      ],
    },
    usage: [
      {
        feature: t("온디바이스 LLM 양자화 MatMul 튜너 & KV VRAM 페이저", "On-device LLM quantized MatMul tuner & KV VRAM pager"),
        role: t(
          "실험 모듈에서 NF4/INT4 블록 양자화, WGSL 생성, 256토큰 KV 페이지의 예산 계산을 확인했습니다. /studio 실행 연결은 후속 단계입니다.",
          "Experimental modules cover NF4/INT4 blocks, WGSL generation and 256-token KV budget accounting. Integration into /studio is a follow-up.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/webgpu-llm-vram-pager.ts",
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/wasm64-wave4-hypercore.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("NF4 4비트 니블 패킹 및 코드북 역양자화", "NF4 4-bit nibble packing & codebook dequantization"),
        language: "ts",
        ...sampleSource([
          ["const NF4 = [-1, -0.696, -0.525, -0.395, -0.284, -0.185, -0.091, 0, 0.08, 0.161, 0.246, 0.338, 0.441, 0.563, 0.723, 1];"],
          ["export function unpackNf4Pair(packedByte: number, absmaxScale: number): readonly [number, number] {"],
          ["  const lo = packedByte & 0x0f;"],
          ["  const hi = (packedByte >>> 4) & 0x0f;"],
          ["  return [(NF4[lo] ?? 0) * absmaxScale, (NF4[hi] ?? 0) * absmaxScale];", "상·하위 4비트를 정규분포 분위수로 복원", "dequantize low/high nibbles via NF4 LUT"],
          ["}"],
        ]),
        explain: t(
          "webgpu-llm-vram-pager.ts는 가중치 32개를 16바이트 니블 배열에 넣고 블록의 절대최댓값 스케일을 함께 보관합니다.",
          "webgpu-llm-vram-pager.ts packs 32 weights into 16 nibble bytes and stores a separate absolute-maximum scale for the block.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave4-hypercore/webgpu-llm-vram-pager.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · WebGPU Shading Language (WGSL) Subgroups",
        url: "https://www.w3.org/TR/WGSL/",
        kind: "spec",
        note: t("타일 행렬곱 컴퓨트 셰이더와 공유 메모리 배리어 명세", "Compute workgroup memory and subgroup barrier specification"),
      },
      {
        title: "MDN · WebGPU API Compute Pipelines",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API",
        kind: "docs",
        note: t("브라우저 어댑터 한계 조회 및 스토리지 버퍼 바인딩 기준", "Adapter limits and storage buffer binding reference"),
      },
    ],
    chapterIds: ["on-device-inference", "free-ai-routing"],
    talk: {
      pitch: t(
        "NF4/INT4 WGSL 생성과 256토큰 KV 페이저를 구현했습니다. 인메모리 테스트에서 1.6 GiB 가상 예산으로 8,704토큰을 배치하고, 페이지 반출·복원과 OOM 카운터 0회를 확인했습니다.",
        "The modules generate NF4/INT4 WGSL and model 256-token KV paging. An in-memory test placed 8,704 tokens under a simulated 1.6 GiB budget, exercised round-trip swaps and observed zero pager OOM events.",
      ),
      analogy: t(
        "작은 책상에 첫 장 요약본과 지금 읽는 페이지만 펼쳐 두고, 가운데 장은 옆 서랍에 번호를 붙여 넣는 방식입니다.",
        "Like keeping chapter one and the current page on a small desk while filing numbered middle pages in a side drawer.",
      ),
      questions: [
        {
          question: t("중간 페이지를 축출해도 첫 시스템 지시문을 잊지 않나요?", "Does evicting middle pages lose initial instructions?"),
          answer: t(
            "페이저는 pinnedSink가 설정된 첫 페이지를 상주 슬롯에 두고 축출 대상에서 뺍니다. 나중에 필요한 중간 페이지는 FNV-1a 체크섬을 확인한 뒤 복원합니다.",
            "The pager excludes pinnedSink pages from eviction and checks FNV-1a before restoring a middle page.",
          ),
        },
        {
          question: t("서브그룹을 지원하지 않는 구형·모바일 GPU 에서는 어떻게 동작하나요?", "How does it run on GPUs without subgroups?"),
          answer: t(
            "어댑터 한계를 먼저 검사해 enable subgroups 없이 동작하는 16×16 공유 메모리 타일 WGSL 커널로 자동 폴백합니다.",
            "The tuner inspects adapter capabilities first and automatically emits a portable 16x16 workgroup-shared WGSL kernel.",
          ),
        },
      ],
    },
    technologies: ["WebGPU", "WGSL", "TypeScript"],
    facts: [
      { value: "256 tokens", label: t("KV 물리/논리 페이지 단위", "Tokens per KV page"), source: "apps/web/src/domains/creator/wasm64-wave4-hypercore/webgpu-llm-vram-pager.ts" },
      { value: "0 OOM", label: t("인메모리 단위 테스트의 페이저 카운터 · 1.6 GiB 가상 예산, 8,704토큰", "Pager counter in an in-memory unit test using a simulated 1.6 GiB budget and 8,704 tokens"), source: "apps/web/src/domains/creator/wasm64-wave4-hypercore/wasm64-wave4-hypercore.test.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
];
