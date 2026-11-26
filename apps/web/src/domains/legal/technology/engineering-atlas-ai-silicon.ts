import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · ai · 브라우저 실리콘 하드웨어 가속 계층(WebNN NPU → WebGPU → WASM Relaxed-SIMD + 0-GC 슬랩 풀 + WebCodecs).
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_AI_SILICON: readonly EngineeringAtlasEntry[] = [
  {
    id: "hardware-silicon-npu-webcodecs-cascade",
    category: "ai",
    name: "Hardware Silicon Cascade",
    title: t("WebNN NPU → WebGPU → WASM 캐스케이드와 WebCodecs", "WebNN NPU → WebGPU → WASM cascade & WebCodecs probe"),
    status: "live",
    tagline: t(
      "6대 로컬 ONNX 모델에 NPU→WebGPU→WASM 자동 폴백과 0-GC 슬랩 풀·WebCodecs 하드웨어 탐지를 붙였습니다.",
      "Auto-fails over six local ONNX models from WebNN NPU to WebGPU to WASM alongside a 0-GC slab pool and WebCodecs probe.",
    ),
    background: [
      t(
        "사용자 기기마다 AI 전용 칩(NPU), GPU, CPU SIMD, 하드웨어 영상 인코더 지원 범위가 제각각입니다. studio-hardware-accelerator-probe.ts 는 onnxruntime-web 이나 React 같은 무거운 패키지를 정적으로 끌어오지 않고, 순수 웹 표준 API 로 CPU(Relaxed-SIMD·SIMD128·WASM64·SAB 스레드), GPU(WebGPU shader-f16·subgroups), NPU(WebNN navigator.ml.createContext), 미디어(WebCodecs H.264·HEVC·AV1·Opus 하드웨어 인코딩)를 사전 탐지합니다.",
        "Every user device exposes a different mix of NPU, GPU, CPU SIMD and hardware video encoders. studio-hardware-accelerator-probe.ts stays dependency-free—never statically importing onnxruntime-web or React—and probes CPU (Relaxed-SIMD, SIMD128, WASM64, SAB threads), GPU (WebGPU shader-f16 and subgroups), NPU (WebNN) and media (WebCodecs H.264/HEVC/AV1/Opus hardware encoding).",
      ),
      t(
        "실제 로컬 AI 추론에서는 studio-onnx-session-cascade.ts 가 6대 로컬 ONNX 모델(teed, u2netp, tag2pix, realesrgan-anime-6b, animegan2-face-paint-512-v2, animegan2-paprika)에 대해 WebNN NPU → WebGPU → WASM(Relaxed-SIMD/스레드) 순서로 세션을 생성합니다. NPU 백엔드가 Resize 나 ConvTranspose 같은 연산자를 거부해도 사용자 작업을 끊지 않고 즉시 다음 계층으로 내려앉습니다.",
        "For local inference, studio-onnx-session-cascade.ts builds sessions across six local ONNX models (teed, u2netp, tag2pix, realesrgan-anime-6b, animegan2-face-paint-512-v2, animegan2-paprika) in WebNN NPU → WebGPU → WASM order. If an NPU rejects an operator such as Resize or ConvTranspose, failover drops smoothly to the next tier.",
      ),
      t(
        "추론 입출력 텐서와 영상 프레임을 매번 새로 할당하면 4K 작업에서 GC 멈춤이 커집니다. studio-zero-copy-buffer-pool.ts 가 크기 버킷별 0-GC 슬랩 버퍼 풀과 Transferable ArrayBuffer 추출 헬퍼를 제공해 Worker·ONNX·WebCodecs VideoFrame 경계의 메모리 재할당을 줄입니다.",
        "Allocating fresh buffers per inference pass or video frame causes GC stalls on 4K canvases. studio-zero-copy-buffer-pool.ts supplies a bucketed 0-GC slab buffer pool and Transferable ArrayBuffer extraction across Worker, ONNX and WebCodecs VideoFrame boundaries.",
      ),
      t(
        "현재 구현(Current)과 제약(Target): 하드웨어 프로버·0-GC 슬랩 풀·6대 모델 ONNX 캐스케이드는 코드와 테스트가 검증돼 있습니다(2026-11-26). 다만 WebNN NPU 와 WebGPU shader-f16/subgroups·WebCodecs prefer-hardware 는 브라우저·OS·드라이버 지원 여부에 따라 실제 실행 계층이 달라지며, 모든 기기에서 NPU 가 켜진다고 단정하지 않습니다.",
        "Current vs Limits: the hardware probe, 0-GC slab pool and six-model ONNX cascade are implemented and tested (2026-11-26). Actual active tiers for WebNN NPU, WebGPU shader-f16/subgroups and WebCodecs prefer-hardware still depend on each browser, OS and driver, so NPU execution is never guaranteed on every device.",
      ),
    ],
    keyPoints: [
      t("무의존 프로버로 CPU·GPU·WebNN NPU·WebCodecs 일괄 탐지", "Zero-dependency probe covers CPU, GPU, NPU & WebCodecs"),
      t("6대 로컬 ONNX 모델 NPU→WebGPU→WASM 자동 페일오버", "Six local ONNX models fail over NPU → WebGPU → WASM"),
      t("0-GC 슬랩 버퍼 풀과 Transferable 추출로 텐서 복사 최소화", "0-GC slab pool & Transferable extraction cut tensor copies"),
      t("하드웨어 미지원 시에도 오류 대신 안전 폴백으로 작업 유지", "Unsupported hardware degrades safely without breaking work"),
    ],
    diagram: {
      id: "hardware-silicon-npu-webcodecs-cascade-diagram",
      kind: "layers",
      title: t("브라우저 실리콘 하드웨어 가속 폴백 계층", "Browser silicon acceleration failover stack"),
      caption: t(
        "가능한 가장 효율적인 칩에서 시작해 연산자 미지원·하드웨어 부재 시 아래 계층으로 자동 내려갑니다.",
        "Starts on the most capable silicon available and steps down automatically when an operator or device is unsupported.",
      ),
      alt: t(
        "맨 위에서 순수 하드웨어 프로버가 기기 역량을 탐지하고, 1계층 WebNN NPU, 2계층 WebGPU shader-f16과 subgroups, 3계층 WASM Relaxed-SIMD와 스레드 순서로 6대 로컬 ONNX 모델을 실행합니다. 아래에는 0-GC 슬랩 버퍼 풀과 WebCodecs 하드웨어 H.264·HEVC·AV1·Opus 인코딩 경로가 받쳐 줍니다.",
        "At the top a pure hardware probe detects device features, routing six local ONNX models through Tier 1 WebNN NPU, Tier 2 WebGPU shader-f16/subgroups, and Tier 3 WASM Relaxed-SIMD/threads, underpinned by a 0-GC slab buffer pool and WebCodecs hardware H.264/HEVC/AV1/Opus encoding.",
      ),
      layers: [
        {
          id: "probe",
          label: t("0. 무의존 실리콘 프로버", "0. Pure silicon probe"),
          sub: t("studio-hardware-accelerator-probe.ts (정적 번들 0 영향)", "studio-hardware-accelerator-probe.ts (zero bundle bloat)"),
          tone: "neutral",
          chips: ["WebNN", "WebGPU", "WASM SIMD", "WebCodecs"],
        },
        {
          id: "npu",
          label: t("1순위 · WebNN NPU", "Tier 1 · WebNN NPU"),
          sub: t("navigator.ml.createContext({ deviceType: 'npu' })", "navigator.ml.createContext({ deviceType: 'npu' })"),
          tone: "ai",
          chips: ["Apple ANE", "Snapdragon NPU", "Intel/AMD NPU"],
        },
        {
          id: "webgpu",
          label: t("2순위 · WebGPU 가속", "Tier 2 · WebGPU"),
          sub: t("shader-f16 · subgroups 활용, NPU 미지원 연산자 수용", "shader-f16 & subgroups, handles NPU-rejected ops"),
          tone: "good",
          chips: ["shader-f16", "subgroups", "6 local ONNX"],
        },
        {
          id: "wasm",
          label: t("3순위 · WASM Relaxed-SIMD", "Tier 3 · WASM Relaxed-SIMD"),
          sub: t("Relaxed-SIMD → SIMD128 → 스칼라 안전 종착지", "Relaxed-SIMD to SIMD128 to scalar safety net"),
          tone: "local",
          chips: ["Relaxed-SIMD", "SIMD128", "SAB Threads"],
        },
        {
          id: "pool",
          label: t("기반 · 0-GC 슬랩 풀 & WebCodecs", "Base · 0-GC slab pool & WebCodecs"),
          sub: t("Transferable 버퍼 재활용 · 하드웨어 H.264/HEVC/AV1/Opus", "Transferable buffer reuse; hardware H.264/HEVC/AV1/Opus"),
          tone: "local",
          chips: ["0-GC Slab", "VideoFrame", "H.264/HEVC/AV1"],
        },
      ],
      brackets: [
        { label: t("ONNX 6대 모델 자동 페일오버", "6-model ONNX auto-failover"), layerIds: ["npu", "webgpu", "wasm"] },
      ],
    },
    usage: [
      {
        feature: t("실리콘 하드웨어 역량 프로버", "Silicon hardware capability probe"),
        role: t(
          "CPU SIMD/Relaxed-SIMD, WebGPU shader-f16·subgroups, WebNN NPU, WebCodecs 하드웨어 코덱(H.264·HEVC·AV1·Opus)을 탐지합니다.",
          "Detects CPU SIMD/Relaxed-SIMD, WebGPU shader-f16/subgroups, WebNN NPU and WebCodecs hardware codecs (H.264/HEVC/AV1/Opus).",
        ),
        paths: ["apps/web/src/domains/creator/studio-hardware-accelerator-probe.ts"],
        route: "/studio",
      },
      {
        feature: t("6대 로컬 ONNX 자동 페일오버 캐스케이드", "Six-model local ONNX failover cascade"),
        role: t(
          "teed·u2netp·tag2pix·realesrgan·animegan2 모델의 세션을 WebNN NPU → WebGPU → WASM 순으로 자동 전환합니다.",
          "Creates sessions for teed, u2netp, tag2pix, realesrgan and animegan2 with automatic WebNN NPU → WebGPU → WASM failover.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-onnx-session-cascade.ts",
          "apps/web/src/domains/creator/studio-onnx-inference-provider.ts",
        ],
      },
      {
        feature: t("0-GC 슬랩 버퍼 풀", "0-GC slab buffer pool"),
        role: t(
          "워커·ONNX·WebCodecs 간 ArrayBuffer 를 재할당 없이 대여·반납해 고해상도 작업 중 GC 멈춤을 줄입니다.",
          "Leases and recycles ArrayBuffers across Workers, ONNX and WebCodecs to cut GC pauses on high-res tasks.",
        ),
        paths: ["apps/web/src/domains/creator/studio-zero-copy-buffer-pool.ts"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("WebNN NPU → WebGPU → WASM 세션 페일오버", "WebNN NPU → WebGPU → WASM session failover"),
        language: "ts",
        ...sampleSource([
          ['type Provider = "webnn-npu" | "webgpu" | "wasm";'],
          ['const CASCADE_ORDER: readonly Provider[] = ["webnn-npu", "webgpu", "wasm"];'],
          [""],
          ["export async function createSessionWithCascade<S>(open: (provider: Provider) => Promise<S>): Promise<{ provider: Provider; session: S }> {"],
          ["  let lastError: unknown;"],
          ["  for (const provider of CASCADE_ORDER) {"],
          ["    try {"],
          ["      return { provider, session: await open(provider) };", "성공한 최상위 하드웨어 확정", "lock in the highest working tier"],
          ["    } catch (error) {"],
          ["      lastError = error;", "연산자 거부·미지원 시 다음 계층 시도", "step down on unsupported ops"],
          ["    }"],
          ["  }"],
          ['  throw lastError ?? new Error("All inference providers failed");'],
          ["}"],
        ]),
        explain: t(
          "특정 NPU 드라이버가 모델의 일부 연산자를 거부하더라도 예외를 삼키지 않고 다음 실행 백엔드로 넘어가며, 최종 확정된 백엔드를 UI 와 원격 진단에 투명하게 알립니다.",
          "If an NPU driver rejects an operator, the loop steps down to the next backend and surfaces the active provider transparently.",
        ),
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · Web Neural Network (WebNN) API",
        url: "https://www.w3.org/TR/webnn/",
        kind: "spec",
        note: t("브라우저에서 NPU·GPU AI 가속기를 호출하는 표준", "Standard for invoking on-device NPU and GPU AI accelerators"),
      },
      {
        title: "ONNX Runtime Web · Execution Providers",
        url: "https://onnxruntime.ai/docs/tutorials/web/",
        kind: "docs",
      },
      {
        title: "W3C · WebCodecs Specification",
        url: "https://www.w3.org/TR/webcodecs/",
        kind: "spec",
      },
    ],
    chapterIds: ["on-device-inference", "browser-local-compute", "nextgen-web-experiments"],
    talk: {
      pitch: t(
        "로컬 AI 와 영상 인코딩은 기기마다 칩 구성이 다릅니다. 번들 부담 없는 표준 프로버가 CPU·GPU·NPU·WebCodecs 를 탐지하고, 6대 로컬 ONNX 모델은 WebNN NPU → WebGPU → WASM 순으로 자동 폴백하며 0-GC 슬랩 풀이 버퍼 복사를 줄입니다.",
        "Because every device has different silicon, a zero-bloat probe detects CPU, GPU, NPU and WebCodecs capabilities; six local ONNX models fail over WebNN NPU → WebGPU → WASM while a 0-GC slab pool minimizes buffer copies.",
      ),
      analogy: t(
        "짐을 옮길 때 전용 화물 엘리베이터(NPU)가 열려 있으면 바로 쓰고, 막혀 있으면 대형 엘리베이터(WebGPU), 그것도 없으면 계단(WASM)으로 멈추지 않고 배달하는 물류 동선입니다.",
        "Like taking the freight lift (NPU) when open, switching to the wide lift (WebGPU) if blocked, and using the stairs (WASM) so delivery never stops.",
      ),
      questions: [
        {
          question: t("왜 프로버에서 onnxruntime-web 을 직접 import 하지 않나요?", "Why does the probe avoid importing onnxruntime-web?"),
          answer: t(
            "스튜디오 초기 진입 번들(eager graph)에 수 MB 짜리 추론 런타임이 섞이지 않도록, 순수 웹 표준 탐지만 먼저 돌리고 실제 ONNX 런타임은 사용자가 AI 기능을 쓸 때 지연 로드합니다.",
            "To keep multi-megabyte inference runtimes out of the studio's eager entry bundle; standard feature probes run lightly first and ONNX lazy-loads on user intent.",
          ),
        },
      ],
      pitfall: t(
        "WebNN NPU 나 WebCodecs prefer-hardware 가 탐지 목록에 있어도 OS·브라우저 플래그·전력 모드에 따라 실제 실행이 WebGPU 나 소프트웨어로 내려갈 수 있습니다. 탐지 결과와 실실행 백엔드를 구분해 안내합니다.",
        "Even when WebNN NPU or WebCodecs prefer-hardware probes positively, OS flags or power modes may execute on WebGPU or software; always report the actual active backend.",
      ),
    },
    technologies: ["WebNN", "WebGPU", "ONNX Runtime Web", "WebCodecs", "Relaxed-SIMD"],
    facts: [
      {
        value: "6 local ONNX",
        label: t("NPU→WebGPU→WASM 자동 캐스케이드 대상 로컬 모델", "Local models covered by NPU → WebGPU → WASM cascade"),
        source: "apps/web/src/domains/creator/studio-onnx-session-cascade.ts",
      },
      {
        value: "H.264/HEVC/AV1",
        label: t("WebCodecs 하드웨어 인코딩 사전 탐지 영상 코덱(+Opus)", "WebCodecs hardware-probe video codecs (plus Opus audio)"),
        source: "apps/web/src/domains/creator/studio-hardware-accelerator-probe.ts",
      },
      {
        value: "0-GC Slab Pool",
        label: t("텐서·프레임 Transferable 버퍼 재사용 풀", "Transferable slab buffer pool for tensors & frames"),
        source: "apps/web/src/domains/creator/studio-zero-copy-buffer-pool.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
