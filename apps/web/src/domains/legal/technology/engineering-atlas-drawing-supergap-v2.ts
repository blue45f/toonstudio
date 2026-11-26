import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · drawing · WebGPU 멀티패스 DAG 렌더 그래프 · VRAM 에일리어싱 &
 * Super-Gap 드로잉/브러시/효과음/선화 초해상도 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_DRAWING_SUPERGAP_V2: readonly EngineeringAtlasEntry[] = [
  {
    id: "webgpu-multipass-render-graph-vram-aliasing",
    category: "drawing",
    name: "WebGPU Multi-Pass DAG & Transient VRAM Aliasing",
    title: t("WebGPU 멀티패스 DAG 렌더 그래프와 일시 VRAM 에일리어싱", "WebGPU multi-pass DAG render graph & transient VRAM aliasing"),
    status: "experimental",
    tagline: t(
      "위상 정렬·배리어 삽입과 구간 에일리어싱으로 VRAM 59.09%, 8K×16K 가상 타일 97.76%를 줄였습니다.",
      "DAG compilation and interval aliasing cut transient VRAM by 59.09% and 8K×16K tiled memory by 97.76%.",
    ),
    background: [
      t(
        "웹툰 한 컷을 렌더링할 때도 선화, 셀 음영, 스크린톤, 블룸, 합성 패스가 줄지어 돌며 중간 텍스처를 수백 MiB 씩 잡아먹습니다. 각 패스가 중간 버퍼를 따로 쥐고 있으면 8K×16K 세로 원고에서 브라우저 GPU 메모리 한도를 금세 넘깁니다.",
        "Rendering a single webtoon cut chains lineart, cel shading, screentone, bloom and compositing passes that consume hundreds of MiB in intermediate textures. Holding each texture separately overflows browser GPU memory on 8K×16K vertical canvases.",
      ),
      t(
        "WebGpuMultiPassRenderGraph(webgpu-multipass-render-graph.ts)는 패스 간 읽기·쓰기 의존성을 DAG 로 위상 정렬하고, 출력에 기여하지 않는 패스를 Dead-Pass Culling 으로 걷어 냅니다. 순환 의존이 들어오면 RenderGraphCycleError 로 즉시 차단하고, 다중 쓰기 자원에는 RAW·WAR·WAW·에일리어스 배리어를 자동 삽입합니다.",
        "WebGpuMultiPassRenderGraph topologically sorts pass dependencies, prunes unused passes with dead-pass culling, rejects cycles via RenderGraphCycleError, and inserts RAW, WAR, WAW and alias barriers on shared resources.",
      ),
      t(
        "생존 구간이 겹치지 않는 일시 텍스처는 물리 메모리 슬롯을 재사용하는 구간 그래프 에일리어싱(allocateAliasedTransientMemory)으로 묶습니다. 검증 실측에서 표준 5단계 웹툰 파이프라인의 일시 VRAM 이 352 MiB → 144 MiB(59.09% 절감)로 줄었고, 8192×16384 세로 캔버스의 1024px 가상 타일 예산 강제로 상주 VRAM 을 97.76% 줄였습니다.",
        "Non-overlapping transient textures share physical memory slots through interval-graph aliasing (allocateAliasedTransientMemory). Benchmarks cut the 5-stage webtoon pipeline from 352 MiB to 144 MiB (59.09% savings) and cut 8192×16384 vertical canvas memory by 97.76% via 1024 px virtual tiling.",
      ),
      t(
        "현재 구현·실측 완료(Current)와 확장 로드맵(Target): DAG 컴파일러, 순환 탐지, 배리어 삽입, 일시 VRAM 에일리어싱, 8K×16K 가상 타일 계산은 wasm64-multipass-copilot-ledger.test.ts 에서 0B 초기 번들 영향으로 검증됐습니다. 스튜디오 본편 WebGPU 합성기의 기본 렌더 패스 전환은 실기기 GPU 드라이버 회귀 검증 뒤 단계적으로 진행합니다.",
        "Current vs Roadmap: the DAG compiler, cycle check, barrier insertion, transient aliasing and 8K×16K virtual tile budgeting pass wasm64-multipass-copilot-ledger.test.ts with 0 B eager bundle impact. Switching the main studio WebGPU compositor onto it by default awaits hardware driver regression checks.",
      ),
    ],
    keyPoints: [
      t("표준 5단계 일시 VRAM 에일리어싱: 352 → 144 MiB(59.09% 절감)", "Transient VRAM aliasing: 352 → 144 MiB (59.09% saved)"),
      t("8K×16K 세로 웹툰 1024px 가상 타일 예산 강제(97.76% 절감)", "8K×16K vertical canvas 1024 px virtual tiling (97.76% saved)"),
      t("Dead-Pass Culling · 순환 탐지 · RAW/WAR/WAW 배리어 자동 삽입", "Dead-pass culling, cycle detection & RAW/WAR/WAW barriers"),
      t("256B WebGPU 행 정렬 규칙 준수 · 지연 로드 0B 초기 번들 영향", "256 B WebGPU row alignment & 0 B eager bundle footprint"),
    ],
    diagram: {
      id: "webgpu-multipass-render-graph-vram-aliasing-diagram",
      kind: "graph",
      title: t("WebGPU 멀티패스 DAG 컴파일과 일시 VRAM 에일리어싱", "WebGPU multi-pass DAG compilation & transient VRAM aliasing"),
      caption: t(
        "선언된 렌더 패스를 위상 정렬·불필요 패스 제거 뒤 생존 구간이 안 겹치는 텍스처를 한 물리 슬롯에 겹쳐 씁니다.",
        "Declared passes undergo topological sort and dead-pass culling before non-overlapping textures alias one VRAM slot.",
      ),
      alt: t(
        "왼쪽에서 5단계 웹툰 렌더 패스가 입력되면 순환 검사와 위상 정렬, Dead-Pass Culling 을 거쳐 RAW·WAR·WAW 배리어를 삽입합니다. 이어서 구간 그래프 일시 VRAM 에일리어싱이 352 MiB 를 144 MiB(59.09% 절감)로 압축하고, 8K×16K 세로 원고는 1024px 가상 타일 예산(97.76% 절감)으로 제한합니다.",
        "Five webtoon render passes enter cycle validation, topological sorting and dead-pass culling, receive RAW/WAR/WAW barriers, compress transient VRAM from 352 MiB to 144 MiB (59.09% reduction) via interval aliasing, and enforce 1024 px virtual tile budgets (97.76% reduction) on 8K×16K canvases.",
      ),
      nodes: [
        { id: "passes", label: t("5단계 패스 선언", "5 render passes"), sub: t("선화·셀·톤·블룸·합성", "Line, cel, tone, bloom"), tone: "local", at: [0, 0] },
        { id: "dag", label: t("DAG 컴파일러", "DAG compiler"), sub: t("위상 정렬 · 순환 탐지", "Topo sort, cycle check"), tone: "good", at: [1, 0] },
        { id: "cull", label: t("Dead-Pass 제거", "Dead-pass cull"), sub: t("RAW·WAR·WAW 배리어", "RAW/WAR/WAW barriers"), tone: "good", at: [2, 0] },
        { id: "alias", label: t("VRAM 에일리어싱", "VRAM aliasing"), sub: t("352→144 MiB (-59.09%)", "352→144 MiB (-59.09%)"), tone: "good", at: [3, 0] },
        { id: "vtile", label: t("8K×16K 가상 타일", "8K×16K virtual tile"), sub: t("1024px 예산 (-97.76%)", "1024 px budget (-97.76%)"), tone: "local", shape: "pill", at: [3, 1] },
      ],
      edges: [
        { from: "passes", to: "dag" },
        { from: "dag", to: "cull", label: t("순환 0건", "0 cycles") },
        { from: "cull", to: "alias", label: t("생존 구간", "Live ranges") },
        { from: "cull", to: "vtile", label: t(">8192px", ">8192 px") },
      ],
      groups: [
        { id: "compile", label: t("결정론적 그래프 컴파일", "Deterministic graph compile"), tone: "neutral", nodeIds: ["passes", "dag", "cull"] },
        { id: "memory", label: t("VRAM 절감 집행", "VRAM budget enforcement"), tone: "local", nodeIds: ["alias", "vtile"] },
      ],
    },
    usage: [
      {
        feature: t("WebGPU 멀티패스 DAG 컴파일러 & 일시 VRAM 에일리어싱", "WebGPU multi-pass DAG compiler & transient VRAM aliasing"),
        role: t(
          "5단계 웹툰 파이프라인의 위상 정렬, 순환 오류 차단, 배리어 생성, 물리 슬롯 재사용, 8K×16K 가상 타일 예산을 계산합니다.",
          "Runs topological sorting, cycle rejection, barrier generation, physical slot reuse and 8K×16K virtual tiling.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/webgpu-multipass-render-graph.ts",
          "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/index.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("멀티패스 DAG · VRAM 절감 자동 테스트", "Multi-pass DAG & VRAM savings tests"),
        role: t(
          "표준 5단계 일시 VRAM 50%+ 절감, 순환 그래프 예외, RAW/WAR 배리어, 8192×16384 가상 타일 예산을 자동 검증합니다.",
          "Verifies >50% transient VRAM reduction, cycle exceptions, RAW/WAR barriers and 8192×16384 virtual tile caps.",
        ),
        paths: ["apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/wasm64-multipass-copilot-ledger.test.ts"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("256바이트 행 정렬과 일시 텍스처 구간 에일리어싱 슬롯 배정", "256-byte row alignment & interval-graph VRAM slot aliasing"),
        language: "ts",
        ...sampleSource([
          ["export interface LiveTexture { readonly id: string; readonly firstPass: number; readonly lastPass: number; readonly bytes: number; }"],
          [""],
          ["export function alignedTextureBytes(width: number, height: number, bytesPerPixel = 4): number {"],
          ["  const alignedRow = Math.ceil((width * bytesPerPixel) / 256) * 256;", "WebGPU 256B 행 정렬", "WebGPU 256 B row alignment"],
          ["  return alignedRow * height;"],
          ["}"],
          [""],
          ["export function packAliasedSlots(textures: readonly LiveTexture[]): number {"],
          ["  const slots: Array<{ endPass: number; size: number }> = [];"],
          ["  const sorted = [...textures].sort((a, b) => a.firstPass - b.firstPass || b.bytes - a.bytes);"],
          ["  for (const tex of sorted) {"],
          ["    const reusable = slots.find((slot) => slot.endPass < tex.firstPass);", "종료된 슬롯 재사용", "reuse ended slot"],
          ["    if (reusable) { reusable.endPass = tex.lastPass; reusable.size = Math.max(reusable.size, tex.bytes); }"],
          ["    else slots.push({ endPass: tex.lastPass, size: tex.bytes });"],
          ["  }"],
          ["  return slots.reduce((sum, slot) => sum + slot.size, 0);"],
          ["}"],
        ]),
        explain: t(
          "실제 allocateAliasedTransientMemory 는 리소스 포맷별 바이트 수, MSAA 샘플, 밉맵 체인, 에일리어스 배리어 삽입까지 함께 계산해 352 MiB 를 144 MiB(59.09% 절감)로 줄입니다.",
          "The full allocateAliasedTransientMemory also factors texture formats, MSAA samples, mip chains and alias barriers, cutting 352 MiB to 144 MiB (59.09% saved).",
        ),
        source: "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/webgpu-multipass-render-graph.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · WebGPU Specification (Texture Alignment & Limits)",
        url: "https://www.w3.org/TR/webgpu/",
        kind: "spec",
        note: t("bytesPerRow 256바이트 정렬과 maxTextureDimension2D 표준 규격", "Standard 256-byte row alignment and maxTextureDimension2D limits"),
      },
      {
        title: "GDC · FrameGraph: Extensible Rendering Architecture in Frostbite",
        url: "https://www.gdcvault.com/play/1024612/FrameGraph-Extensible-Rendering-Architecture-in",
        kind: "article",
        note: t("렌더 그래프 Dead-Pass Culling 과 일시 자원 에일리어싱 원형 설계", "Foundational render-graph dead-pass culling and transient aliasing architecture"),
      },
    ],
    chapterIds: ["brush-render-authority", "performance", "browser-local-compute"],
    talk: {
      pitch: t(
        "WebGPU 멀티패스 DAG 렌더 그래프가 불필요 패스를 걷어 내고 구간 에일리어싱으로 일시 VRAM 을 352→144 MiB(59.09%) 줄였습니다. 8K×16K 세로 원고도 1024px 가상 타일 예산으로 97.76% 메모리 절감을 검증했습니다.",
        "Our WebGPU multi-pass DAG render graph prunes dead passes and aliases transient VRAM from 352 to 144 MiB (59.09% reduction), while 1024 px virtual tiling cuts 8K×16K vertical canvas memory by 97.76%.",
      ),
      analogy: t(
        "촬영장마다 소품 창고를 따로 빌리지 않고, 앞 장면 촬영이 끝난 창고를 다음 장면 팀이 바로 이어 쓰는 스케줄 보드(구간 에일리어싱)와 같습니다.",
        "Like scheduling film crews to reuse the same prop warehouse once earlier scenes wrap instead of renting separate rooms for every shot.",
      ),
      questions: [
        {
          question: t("에일리어싱으로 슬롯을 재사용하면 이전 패스 픽셀이 섞이지 않나요?", "Does slot reuse mix pixels from earlier passes?"),
          answer: t(
            "생존 구간이 겹치지 않는 자원만 묶고, 슬롯 소유자가 바뀔 때마다 컴파일러가 에일리어스 배리어와 loadOp 초기화 계약을 삽입해 데이터 오염을 막습니다.",
            "Only resources with disjoint live intervals share a slot, and every ownership switch inserts an alias barrier plus a clear/load contract.",
          ),
        },
        {
          question: t("8K×16K 캔버스는 일반 WebGPU 텍스처 한도를 넘지 않나요?", "Doesn't an 8K×16K canvas exceed standard WebGPU texture limits?"),
          answer: t(
            "WebGPU 기본 2D 텍스처 한도(8192px)를 넘는 세로 캔버스는 1024px 가상 타일로 쪼개 화면에 보이는 타일만 VRAM 에 올려 97.76% 를 절감합니다.",
            "Canvases taller than the 8192 px WebGPU 2D limit are split into 1024 px virtual tiles so only visible tiles occupy VRAM, saving 97.76%.",
          ),
        },
      ],
      pitfall: t(
        "59.09%·97.76% 절감치는 5단계 표준 웹툰 그래프와 8192×16384 가상 타일 계산기의 단위 검증 실측이며, 실제 브라우저 드라이버의 내부 메모리 할당 오버헤드는 기기별로 달라질 수 있습니다.",
        "The 59.09% and 97.76% reductions come from deterministic graph/tiling benchmarks; browser GPU drivers can add device-specific internal allocation overhead.",
      ),
    },
    technologies: ["WebGPU", "Render Graph", "VRAM Aliasing", "TypeScript"],
    facts: [
      {
        value: "352 → 144 MiB (-59.09%)",
        label: t("표준 5단계 웹툰 멀티패스 일시 VRAM 에일리어싱 절감", "5-stage webtoon transient VRAM aliasing savings"),
        source: "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/webgpu-multipass-render-graph.ts",
      },
      {
        value: "-97.76% (8K×16K)",
        label: t("8192×16384 세로 원고 1024px 가상 타일 VRAM 예산 절감", "8192×16384 vertical canvas 1024 px virtual tile VRAM savings"),
        source: "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/wasm64-multipass-copilot-ledger.test.ts",
      },
      {
        value: "256 B / 8192 px",
        label: t("WebGPU bytesPerRow 정렬 및 2D 텍스처 분할 기준", "WebGPU bytesPerRow alignment and 2D texture tiling threshold"),
        source: "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/webgpu-multipass-render-graph.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "supergap-wet-paper-msdf-autoflat-tremor-upscaler",
    category: "drawing",
    name: "Wet Paper LBM v2 · Curved MSDF SFX · Auto-Flat · Tremor FFT",
    title: t("Wet Paper LBM v2 · 곡선 MSDF 효과음 · 손떨림 FFT · 선화 초해상도", "Wet Paper LBM v2, curved MSDF SFX, tremor FFT & crisp upscaler"),
    status: "experimental",
    tagline: t(
      "한지/황목/중목 수채 LBM, 3중 외곽선 곡선 SFX, 8Hz 손떨림 FFT 보정, 링잉 0 선화 초해상도를 묶었습니다.",
      "Combines 3-paper LBM watercolor, curved triple-outline MSDF SFX, 8 Hz tremor FFT and ringing-free 2×/4× upscaling.",
    ),
    background: [
      t(
        "웹툰 작화 현장에서 가장 시간이 많이 드는 반복 작업은 수채 번짐 표현, 곡선 효과음(SFX) 테두리, 열린 선화 틈 메우기 밑색(오토 플랫팅), 손떨림 보정, 저해상도 선화 확대입니다. 기존 도구는 고가 플러그인이나 클라우드 AI 토큰에 의존해 오프라인에서 끊기거나 선명한 잉크 선 주변에 링잉(후광) 아티팩트를 남깁니다.",
        "Repetitive bottlenecks in webtoon drawing—watercolor bleeding, curved sound-effect outlines, closing tiny lineart gaps for flatting, hand-tremor smoothing and upscaling crisp ink—often depend on paid plugins or cloud AI tokens that fail offline or add ringing halos.",
      ),
      t(
        "wasm64-supergap-drawing-3d 의 Pillar A(#1~#4)는 이를 전부 0-토큰 로컬 물리·신호처리 커널로 풀었습니다. ① Wet Paper LBM v2(wet-paper-lbm-v2.ts)는 한지(방향성 섬유)·황목·중목 3종 높이맵 위에서 격자 볼츠만 모세관 확산·안료 입상화·건조 타이머를 WGSL 과 CPU 파리티로 계산합니다. ② curved-msdf-sfx.ts 는 가변 폰트 축 보간과 3중 외곽선을 한글 3차 베지어·영문 방사 곡선에 배치합니다.",
        "Pillar A (#1–#4) in wasm64-supergap-drawing-3d solves these locally at 0 tokens: Wet Paper LBM v2 models capillary wicking, granulation and drying across hanji, rough and cold-press fiber fields in WGSL/CPU parity, while curved-msdf-sfx.ts places variable-axis triple-outline MSDF glyphs along cubic Bezier and radial paths.",
      ),
      t(
        "③ wet-paper-msdf-sfx-autoflat.ts 는 열린 끝점과 T-접합 틈만 maxGapPx 안에서 브리지해 0-토큰 오토 플랫팅 영역 ID 를 분리합니다. ④ tremor-fft-calibrator.ts 는 초기 20스트로크를 Hann+Radix-2 FFT 로 분석해 8Hz 손떨림 대역을 자동 검출하고, One-Euro/칼만 파라미터를 맞춰 90° 직각 모서리를 살리면서 지터 RMS 를 45% 이상 줄입니다.",
        "wet-paper-msdf-sfx-autoflat.ts bridges open endpoints and T-junctions within maxGapPx for zero-token auto-flatting, and tremor-fft-calibrator.ts runs Hann + Radix-2 FFT on 20 strokes to detect 8 Hz hand tremor, tuning One-Euro/Kalman cutoffs for >45% RMS jitter reduction while preserving 90° corners.",
      ),
      t(
        "함께 검증된 적응형 브러시 물리 & WebGPU 2×/4× 선화 초해상도(adaptive-brush-dynamics-and-lineart-upscaler.ts)는 링잉 헤일로 0건으로 대각선 잉크를 선명하게 키우고, HapticBrushFrictionEngine 은 4종 지면(켄트 < 세목 < 중목 < 캔버스)과 배럴롤·기울기 스틱-슬립 촉각을 출력합니다. 현재 구현·실측 완료(Current): 4개 커널·WGSL 정적 검증·단위/엣지 테스트 모두 통과했습니다. 로드맵(Target): 본편 브러시 패널·WebGPU 캔버스 기본 바인딩은 단계별로 연결합니다.",
        "Paired with adaptive-brush-dynamics-and-lineart-upscaler.ts (ringing-free 2×/4× crisp lineart upscaling) and HapticBrushFrictionEngine (4 paper substrates with barrel-roll stick-slip haptics), all kernels, WGSL validators and edge tests pass (Current). Binding them as default studio brush tools proceeds in stages (Roadmap).",
      ),
    ],
    keyPoints: [
      t("Wet Paper LBM v2: 한지·황목·중목 3종 모세관 확산·입상화", "Wet Paper LBM v2: hanji, rough & cold-press wicking"),
      t("가변축 3중 외곽선 곡선 MSDF SFX & 0-토큰 벡터 갭 오토 플랫팅", "Curved triple-outline MSDF SFX & 0-token gap auto-flat"),
      t("8Hz 손떨림 Hann+FFT 캘리브레이션: RMS >45% 저감·90° 모서리 보존", "8 Hz tremor FFT calibration: >45% RMS drop, 90° corners intact"),
      t("WebGPU 2×/4× 선화 초해상도(링잉 0) & 4종 지면 햅틱 마찰 브러시", "Ringing-free 2×/4× lineart upscaler & 4-paper haptic friction"),
    ],
    diagram: {
      id: "supergap-wet-paper-msdf-autoflat-tremor-upscaler-diagram",
      kind: "graph",
      title: t("0-토큰 Super-Gap 드로잉 · 효과음 · 초해상도 파이프라인", "Zero-token Super-Gap drawing, SFX & upscaling pipeline"),
      caption: t(
        "스타일러스 입력을 8Hz FFT 손떨림 보정·적응형 물리·촉각 피드백으로 다듬고, 수채·밑색·SFX·2×/4× 선화로 이어집니다.",
        "Stylus input passes 8 Hz tremor FFT, adaptive dynamics and haptics before driving watercolor, auto-flat, SFX and crisp upscaling.",
      ),
      alt: t(
        "스타일러스 입력이 8Hz 손떨림 FFT 보정(RMS 45% 이상 저감)과 적응형 브러시 물리·4종 지면 햅틱 마찰을 거친 뒤, Wet Paper LBM v2 수채(한지·황목·중목), 0-토큰 벡터 갭 닫기·오토 플랫팅, 가변축 3중 외곽선 곡선 MSDF SFX 세 갈래로 갈라집니다. 최종 선화는 링잉 0건 WebGPU 2×/4× 선화 초해상도로 마무리됩니다.",
        "Stylus input flows through 8 Hz tremor FFT calibration (>45% RMS drop), adaptive dynamics and 4-paper haptic friction into three branches—Wet Paper LBM v2, zero-token gap-closing auto-flatting and curved triple-outline MSDF SFX—and finishes with ringing-free 2×/4× WebGPU lineart upscaling.",
      ),
      nodes: [
        { id: "pen", label: t("스타일러스 입력", "Stylus input"), sub: t("필압·기울기·배럴롤", "Pressure, tilt, roll"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "fft", label: t("8Hz FFT 보정", "8 Hz FFT filter"), sub: t("RMS >45% 저감·90° 보존", ">45% RMS drop, 90° kept"), tone: "good", at: [1, 0] },
        { id: "haptic", label: t("적응형·햅틱 물리", "Dynamics & haptic"), sub: t("4종 지면 마찰 스틱슬립", "4-paper stick-slip"), tone: "good", at: [1, 2] },
        { id: "lbm", label: t("Wet Paper LBM", "Wet Paper LBM"), sub: t("한지·황목·중목 WGSL", "Hanji/rough/cold WGSL"), tone: "local", at: [2, 0] },
        { id: "flat", label: t("갭 닫기 밑색", "Gap auto-flat"), sub: t("T-접합 브리지·0 토큰", "T-junction, 0 tokens"), tone: "local", at: [2, 1] },
        { id: "sfx", label: t("곡선 MSDF SFX", "Curved MSDF SFX"), sub: t("가변축 3중 외곽선", "Variable triple outline"), tone: "local", at: [2, 2] },
        { id: "up", label: t("2×/4× 선화 확대", "2×/4× lineart SR"), sub: t("WGSL · 링잉 헤일로 0", "WGSL, 0 ringing halos"), tone: "good", shape: "pill", at: [3, 1] },
      ],
      edges: [
        { from: "pen", to: "fft" },
        { from: "pen", to: "haptic" },
        { from: "fft", to: "lbm" },
        { from: "fft", to: "flat" },
        { from: "haptic", to: "sfx" },
        { from: "flat", to: "up", label: t("0 링잉", "0 ringing") },
      ],
      groups: [
        { id: "in", label: t("개인화 입력 안정화", "Personalized input tuning"), tone: "neutral", nodeIds: ["pen", "fft", "haptic"] },
        { id: "art", label: t("0-토큰 작화 커널", "Zero-token art kernels"), tone: "local", nodeIds: ["lbm", "flat", "sfx", "up"] },
      ],
    },
    usage: [
      {
        feature: t("Wet Paper LBM v2 · 곡선 MSDF SFX · 오토 플랫팅 · 손떨림 FFT", "Wet Paper LBM v2, curved MSDF SFX, auto-flat & tremor FFT"),
        role: t(
          "3종 종이 결 LBM 수채, 가변 폰트 3중 외곽선 SFX, 갭 브리지 밑색 분리, 20스트로크 FFT 손떨림 보정을 로컬 0-토큰으로 처리합니다.",
          "Runs 3-paper LBM watercolor, curved variable-axis SFX, gap-bridged auto-flatting and 20-stroke tremor FFT locally.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/wet-paper-lbm-v2.ts",
          "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/curved-msdf-sfx.ts",
          "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/tremor-fft-calibrator.ts",
          "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/wet-paper-msdf-sfx-autoflat.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("적응형 브러시 다이나믹스 · WebGPU 2×/4× 선화 초해상도 · 햅틱 마찰", "Adaptive brush dynamics, 2×/4× lineart upscaler & haptic friction"),
        role: t(
          "4종 브러시 프리셋 물리 응답(선택적 WebNN ±0.25 잔차 훅), 링잉 0건 2×/4× 선화 확대, 4종 지면 배럴롤 햅틱 마찰을 제공합니다.",
          "Provides 4 brush physics presets (optional ±0.25 WebNN hook), ringing-free 2×/4× lineart upscaling and 4-paper haptic friction.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-grid-brush-parallax-telemetry/adaptive-brush-dynamics-and-lineart-upscaler.ts",
          "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/foveated-instancing-and-haptic-brush.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("One-Euro 저역통과 알파 계수와 링잉 방지 선화 클램프", "One-Euro low-pass alpha & ringing-free lineart overshoot clamp"),
        language: "ts",
        ...sampleSource([
          ["export function oneEuroAlpha(dtSec: number, cutoffHz: number): number {"],
          ["  const tau = 1 / (2 * Math.PI * Math.max(0.05, cutoffHz));"],
          ["  return 1 / (1 + tau / Math.max(1e-4, dtSec));", "손떨림 대역(8Hz) 차단 계수", "cutoff weight filtering 8 Hz tremor"],
          ["}"],
          [""],
          ["export function clampRingingFreeSample(interpolated: number, n0: number, n1: number, n2: number, n3: number): number {"],
          ["  const lo = Math.min(n0, n1, n2, n3);", "국소 최소·최대 범위 밖 오버슈트 금지", "forbid overshoot beyond local extrema"],
          ["  const hi = Math.max(n0, n1, n2, n3);"],
          ["  return Math.min(hi, Math.max(lo, interpolated));"],
          ["}"],
        ]),
        explain: t(
          "One-Euro 필터는 느린 손떨림은 강하게 누르고 빠른 직각 꺾임은 컷오프를 올려 모서리를 살리며, 선화 업스케일러는 국소 이웃 최소·최대 클램프로 링잉 헤일로를 0건으로 막습니다.",
          "One-Euro raises cutoff on fast strokes to keep 90° corners sharp while damping 8 Hz tremor; local min/max clamping guarantees zero ringing halos during lineart upscaling.",
        ),
        source: "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/tremor-fft-calibrator.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "CHI 2012 · 1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input",
        url: "https://gery.casiez.net/1euro/",
        kind: "article",
        note: t("속도 적응형 저지연 손떨림 필터링(One-Euro) 원논문", "Original speed-adaptive low-latency 1€ filter paper"),
      },
      {
        title: "OpenType · Variable Fonts & Variation Axes Specification",
        url: "https://learn.microsoft.com/en-us/typography/opentype/spec/otvaroverview",
        kind: "spec",
        note: t("가변축 MSDF 효과음(wght·wdth·slnt) 배치 표준 규격", "OpenType variable font axis specification for curved MSDF SFX"),
      },
    ],
    chapterIds: ["brush-engine", "brush-render-authority", "browser-local-compute"],
    talk: {
      pitch: t(
        "한지·황목·중목 Wet Paper LBM v2, 가변축 3중 외곽선 곡선 MSDF SFX, 0-토큰 벡터 갭 오토 플랫팅, 8Hz 손떨림 FFT 보정(RMS >45% 저감), 링잉 0건 2×/4× 선화 초해상도와 4종 지면 햅틱 마찰을 모두 클라우드 0토큰으로 검증했습니다.",
        "Three-paper Wet Paper LBM v2, curved variable-axis MSDF SFX, zero-token gap auto-flatting, 8 Hz tremor FFT (>45% RMS drop), ringing-free 2×/4× lineart upscaling and 4-paper haptic friction all run locally at zero tokens.",
      ),
      analogy: t(
        "실제 화방의 한지·캔버스 결, 손떨림을 잡아 주는 펜촉 안정기, 열린 테두리를 알아서 닫아 채색하는 조수, 선이 번지지 않는 확대경을 한 작업대에 올린 구성입니다.",
        "Like putting real hanji paper grain, a pen stabilizer, a gap-closing flatting assistant and a crisp ink magnifier on one offline desk.",
      ),
      questions: [
        {
          question: t("손떨림 보정을 강하게 걸면 90도 직각 모서리가 둥글어지지 않나요?", "Doesn't strong tremor filtering round off 90° corners?"),
          answer: t(
            "FFT 가 작가 고유의 4~14Hz 손떨림 대역만 찾고, One-Euro 필터가 빠른 속도 변화 구간에서 컷오프 주파수를 즉시 올려 90° 직각 모서리를 유지합니다.",
            "The FFT isolates the artist's 4–14 Hz tremor band while One-Euro dynamically raises cutoff frequency on sharp velocity shifts so 90° corners stay crisp.",
          ),
        },
        {
          question: t("선화 초해상도에 생성형 AI 모델을 쓰지 않는 이유는 무엇인가요?", "Why avoid a generative AI model for lineart upscaling?"),
          answer: t(
            "생성형 업스케일러는 선의 의도를 왜곡하거나 링잉·환각 선을 만들 수 있고 GPU 비용이 큽니다. 방향성 에지 보간과 국소 클램프 WGSL 은 링잉 0건으로 원본 필선을 그대로 보존합니다.",
            "Generative upscalers risk hallucinated lines and ringing at high GPU cost; directional edge interpolation with local clamping preserves original ink with 0 ringing.",
          ),
        },
      ],
      pitfall: t(
        "Web Vibration API 와 스타일러스 배럴롤은 브라우저·기기 지원 범위가 다르므로 미지원 환경에서는 오디오 촉각 클릭 폴백을 사용하며, LBM WGSL 은 CPU 파리티 구현과 단위 검증을 마쳤으나 실기기 GPU 벤치마크가 남아 있습니다.",
        "Web Vibration and barrel-roll support vary by device (falling back to tactile audio clicks), and while LBM/upscaler WGSL shaders pass static and CPU-parity tests, real-device GPU profiling remains.",
      ),
    },
    technologies: ["WebGPU", "WGSL", "FFT / One-Euro", "MSDF", "Haptics"],
    facts: [
      {
        value: "3 Paper Presets (LBM v2)",
        label: t("한지·황목·중목 모세관 확산 · 입상화 · 건조 타이머 WGSL", "Hanji, rough & cold-press capillary wicking, granulation & drying"),
        source: "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/wet-paper-lbm-v2.ts",
      },
      {
        value: ">45% RMS Drop (8 Hz)",
        label: t("20스트로크 Hann+FFT 손떨림 자동 보정 · 90° 모서리 보존", "20-stroke Hann+FFT tremor reduction while preserving 90° corners"),
        source: "apps/web/src/domains/creator/wasm64-supergap-drawing-3d/tremor-fft-calibrator.ts",
      },
      {
        value: "0 Ringing (2× / 4×)",
        label: t("WebGPU 방향성 선화 초해상도 링잉 헤일로 0건 검증", "Zero ringing halos in 2×/4× directional lineart super-resolution"),
        source: "apps/web/src/domains/creator/wasm64-grid-brush-parallax-telemetry/adaptive-brush-dynamics-and-lineart-upscaler.ts",
      },
      {
        value: "4 Substrates (Haptic)",
        label: t("켄트·세목·중목·캔버스 지면 마찰 및 배럴롤 스틱-슬립", "Kent, hot-press, cold-press & canvas friction with stick-slip"),
        source: "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/foveated-instancing-and-haptic-brush.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
