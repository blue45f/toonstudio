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
      "1.5~2.0 GiB 엄격한 VRAM 상한 안에서 256토큰 KV 페이징과 싱크 고정으로 8K+ 문맥을 OOM 0건으로 돌립니다.",
      "Runs 8K+ local LLM context within a strict 1.5–2.0 GiB VRAM cap at 0 OOM via 256-token KV paging and sink pinning.",
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
        "WebGpuVramKvPager 는 KV-Cache 를 256토큰 페이지 단위로 쪼개 첫 어텐션 싱크(Sink) 페이지는 물리 VRAM 에 고정하고, 예산(1.5~2.0 GiB)을 넘기는 중간 페이지는 FNV-1a 체크섬과 함께 주입된 CPU/OPFS 백킹 풀로 LRU 스왑 아웃합니다. 현재 구현(Current): 1.6 GiB 상한·8,704토큰 OOM 0건 단위 검증 완료(0B 초기 번들). 향후 목표(Target): 로컬 코파일럿 추론 워커에 직결합니다.",
        "WebGpuVramKvPager slices KV-Cache into 256-token pages, pins initial attention-sink pages in VRAM, and LRU-swaps middle pages with FNV-1a checksums to an injected CPU/OPFS pool. Current: verified at 8,704 tokens under a 1.6 GiB cap with 0 OOM (0 B eager impact). Target: wire into the local copilot worker.",
      ),
    ],
    keyPoints: [
      t("16단계 NF4 · 대칭 INT4 블록 양자화 및 어댑터별 WGSL 타일 튜닝", "16-level NF4 & INT4 block quantization with adaptive WGSL tiling"),
      t("256토큰 고정 페이지 가상 KV-Cache 및 어텐션 싱크 영구 고정", "256-token virtual KV-Cache pages with pinned attention sinks"),
      t("1.5~2.0 GiB VRAM 하드 상한 준수 · 8,704토큰 실측 OOM 0건", "Strict 1.5–2.0 GiB VRAM cap; 0 OOM verified at 8,704 tokens"),
      t("FNV-1a 무결성 검증 기반 CPU/OPFS 백킹 풀 양방향 스왑", "FNV-1a verified swap-out/swap-in via injected CPU/OPFS pool"),
    ],
    diagram: {
      id: "webgpu-llm-nf4-paged-attention-vram-pager-diagram",
      kind: "layers",
      title: t("WebGPU NF4 MatMul 및 PagedAttention KV-Cache 메모리 계층", "WebGPU NF4 MatMul & PagedAttention KV-Cache memory hierarchy"),
      caption: t(
        "어텐션 싱크와 최근 윈도우만 물리 VRAM 슬롯에 남기고 중간 문맥은 체크섬과 함께 백킹 풀로 스왑합니다.",
        "Keeps attention sinks and recent windows in physical VRAM slots while swapping middle pages to backing storage.",
      ),
      alt: t(
        "맨 위 8K 이상 문맥 토큰 요청이 가상 KV 페이지 테이블(256토큰 단위)을 거쳐 1.5~2.0 GiB 상한의 물리 VRAM 풀(NF4 가중치 + 싱크 고정 + 최근 페이지)과 하단 CPU/OPFS 스왑 백킹 풀 사이에서 FNV-1a 검증으로 오갑니다.",
        "8K+ token sequences map through a 256-token virtual KV page table into a 1.5–2.0 GiB capped physical VRAM pool (NF4 weights, pinned sinks, recent window) backed by FNV-1a checked CPU/OPFS swap pages.",
      ),
      layers: [
        { id: "ctx", label: t("8K~32K+ 장문 회차 문맥", "8K–32K+ episode context"), sub: t("설정집 · 대사 · 이전 컷 지시문", "Lore, dialogue, cut notes"), tone: "local", chips: ["256 tok/page"] },
        { id: "pt", label: t("가상 KV 페이지 테이블", "Virtual KV page table"), sub: t("논리 페이지 → 물리 슬롯 / 스왑 상태 매핑", "Logical page to physical/swap slot"), tone: "good", chips: ["LRU", "Sink Pin"] },
        { id: "vram", label: t("WebGPU 물리 VRAM 풀 (1.5~2.0 GiB)", "WebGPU VRAM pool (1.5–2.0 GiB)"), sub: t("NF4/INT4 WGSL 타일 MatMul · OOM 0건", "NF4/INT4 WGSL MatMul, 0 OOM"), tone: "ai", chips: ["WebGPU", "WGSL"] },
        { id: "swap", label: t("CPU / OPFS 백킹 스왑 풀", "CPU / OPFS swap backing pool"), sub: t("축출 페이지 저장 · FNV-1a 체크섬 복원", "Evicted KV blobs with FNV-1a check"), tone: "neutral", chips: ["OPFS", "FNV-1a"] },
      ],
    },
    usage: [
      {
        feature: t("온디바이스 LLM 양자화 MatMul 튜너 & KV VRAM 페이저", "On-device LLM quantized MatMul tuner & KV VRAM pager"),
        role: t(
          "NF4/INT4 블록 양자화·WGSL 서브그룹 타일 생성과 256토큰 단위 PagedAttention VRAM 상한 페이징을 수행합니다.",
          "Generates NF4/INT4 WGSL subgroup MatMul shaders and pages 256-token KV blocks within a strict VRAM cap.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/webgpu-llm-vram-pager.ts",
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/wasm64-wave4-hypercore.test.ts",
        ],
        route: "/studio",
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
          "실제 webgpu-llm-vram-pager.ts 는 32개 가중치 블록마다 절대최댓값 스케일과 16바이트 니블 배열을 묶어 메모리 대역폭을 1/4 이하로 줄입니다.",
          "webgpu-llm-vram-pager.ts packs 32 weights into 16 nibble bytes plus one absmax scale, cutting weight bandwidth over 4x.",
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
        "NF4/INT4 WGSL 타일 행렬곱과 256토큰 PagedAttention KV 페이저를 결합해, 1.6 GiB VRAM 상한 안에서도 8K 이상 긴 회차 문맥을 OOM 0건·서버비 ₩0으로 처리합니다.",
        "Combining NF4/INT4 WGSL MatMul with a 256-token PagedAttention KV pager sustains 8K+ context inside a 1.6 GiB VRAM cap with 0 OOM and ₩0 server cost.",
      ),
      analogy: t(
        "책상 위(VRAM)에는 첫 장 요약본(어텐션 싱크)과 지금 읽는 페이지만 펼쳐 두고, 가운데 장들은 번호표를 붙여 옆 서랍(OPFS/CPU 풀)에 깔끔히 넣어 두는 독서대입니다.",
        "Like keeping chapter one and the current page on a small desk (VRAM) while filing middle pages neatly in a side drawer (OPFS/CPU pool).",
      ),
      questions: [
        {
          question: t("중간 페이지를 축출해도 첫 시스템 지시문을 잊지 않나요?", "Does evicting middle pages lose initial instructions?"),
          answer: t(
            "첫 N개 어텐션 싱크(Sink) 페이지는 pinnedSink 플래그로 물리 VRAM 슬롯에 고정되어 축출 대상에서 제외되고, 과거 페이지 참조가 필요하면 체크섬 검증 후 즉시 스왑 인합니다.",
            "Initial attention-sink pages stay pinned in VRAM, while recalled middle pages fault back in with FNV-1a verification.",
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
    technologies: ["WebGPU", "WGSL", "OPFS", "TypeScript"],
    facts: [
      { value: "256 tokens", label: t("KV 물리/논리 페이지 단위", "Tokens per KV page"), source: "apps/web/src/domains/creator/wasm64-wave4-hypercore/webgpu-llm-vram-pager.ts" },
      { value: "0 OOM", label: t("1.6 GiB 상한 · 8,704토큰 페이징 실측", "8,704-token paging under 1.6 GiB cap"), source: "apps/web/src/domains/creator/wasm64-wave4-hypercore/wasm64-wave4-hypercore.test.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
];
