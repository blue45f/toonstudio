import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · web-platform · WGSL 2.5D 선화 셀·림·하프톤 오토 셰이더 · 64비트 SAB 워커 채널 · WebCodecs 로컬 ₩0 오디오툰 내보내기 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_WEB_PLATFORM_GPU_MEDIA: readonly EngineeringAtlasEntry[] = [
  {
    id: "webgpu-cel-sab64-webcodecs-audiotoon",
    category: "web-platform",
    name: "WGSL 2.5D Autoshader · 64-bit SAB · WebCodecs AudioToon",
    title: t("WGSL 2.5D 오토 셰이더·64비트 SAB·WebCodecs ₩0 오디오툰", "WGSL 2.5D autoshader, 64-bit SAB & ₩0 WebCodecs AudioToon"),
    status: "experimental",
    tagline: t(
      "WGSL 2.5D 셀·림·하프톤 셰이더, BigInt SAB 채널, WebCodecs 60fps 로컬 오디오툰을 서버 ₩0 로 묶었습니다.",
      "Pairs a WGSL 2.5D cel/rim/halftone shader, BigInt SAB worker channel and ₩0 60 fps WebCodecs AudioToon.",
    ),
    background: [
      t(
        "웹툰 채색 보조와 숏폼 오디오툰 영상 렌더링을 클라우드 GPU 서버에 맡기면 사용자 수에 비례해 서버 요금이 치솟습니다. apps/web/src/domains/creator/wasm64-gpu-media-pipeline/ 는 세 핵심 파이프라인을 브라우저 로컬로 옮겨 서버 비용 ₩0 구조를 구현했습니다(초기 진입 번들 정적 import 0 B).",
        "Offloading webtoon shading assistance and short-form AudioToon video encoding to cloud GPUs scales server costs linearly with usage. apps/web/src/domains/creator/wasm64-gpu-media-pipeline/ moves three core pipelines into the browser at ₩0 server cost with zero static eager-graph impact.",
      ),
      t(
        "① webgpu-cel-light-autoshader.ts 는 @workgroup_size(16, 16) WGSL 컴퓨트 셰이더로 2.5D 선화 노멀·셀 음영 밴드·림라이트·망점 하프톤을 한 번에 계산하고, WebGPU 미지원 기기를 위한 결정적 CPU 폴백(runCelLightAutoshaderCpu)을 제공합니다. ② sab-zero-copy-worker-channel.ts 는 SharedArrayBuffer + Atomics 기반 64비트 BigInt 오프셋 SoA 제로-카피 워커 채널을 구현하고, COOP/COEP 비격리 환경에서는 Transferable ArrayBuffer 패킷으로 자동 폴백합니다.",
        "(1) webgpu-cel-light-autoshader.ts runs a @workgroup_size(16, 16) WGSL compute shader for 2.5D lineart cel bands, rim lighting and halftones alongside a deterministic CPU fallback. (2) sab-zero-copy-worker-channel.ts implements a SharedArrayBuffer + Atomics 64-bit BigInt SoA zero-copy worker channel with automatic Transferable fallback when cross-origin isolation is absent.",
      ),
      t(
        "③ webcodecs-local-audiotoon-exporter.ts 와 webcodecs-audiotoon-timeline-mux.ts 는 9:16 세로 숏폼과 16:9 가로 60fps 오디오툰을 브라우저 WebCodecs(VideoEncoder·AudioEncoder) 하드웨어 가속 경로로 로컬 인코딩하고, Wave-3 스테레오 PCM 버스를 패킷화해 A/V 싱크 드리프트를 검증합니다. 서버 렌더링 인프라가 전혀 필요 없어 출력 비용이 ₩0 입니다.",
        "(3) webcodecs-local-audiotoon-exporter.ts and webcodecs-audiotoon-timeline-mux.ts encode 9:16 vertical and 16:9 horizontal 60 fps AudioToon clips locally via WebCodecs hardware acceleration, packetizing Wave-3 stereo PCM and validating A/V sync drift at ₩0 server rendering cost.",
      ),
      t(
        "현재 구현(Current)과 확장 로드맵(Target): WGSL 2.5D 셰이더 문법·유니폼·CPU 파리티, 64비트 SAB 채널 및 비격리 Transferable 폴백, WebCodecs 9:16/16:9 타임라인·PCM 패킷화·백프레셔 제어는 wasm64-gpu-media-pipeline.test.ts 에서 2026-11-26 기준 검증됐습니다. 실제 기기별 하드웨어 인코더 활성 여부는 OS·브라우저 코덱 정책을 런타임 프로브로 확인하며, 본편 스튜디오 내보내기 UI 전면 연결은 단계적 목표입니다.",
        "Current vs Roadmap: WGSL shader validation, CPU parity, 64-bit SAB / Transferable fallback and WebCodecs 9:16 & 16:9 timeline/PCM muxing pass wasm64-gpu-media-pipeline.test.ts (2026-11-26). Hardware encoder activation depends on OS/browser support probed at runtime, and full studio export UI cutover is phased.",
      ),
    ],
    keyPoints: [
      t("WGSL 16×16 2.5D 선화 셀 셰이딩·림라이트·하프톤 + CPU 폴백", "WGSL 16x16 2.5D cel, rim-light & halftone + CPU fallback"),
      t("SharedArrayBuffer 64비트 BigInt 제로-카피 워커 채널", "SharedArrayBuffer 64-bit BigInt zero-copy worker channel"),
      t("비격리(COOP/COEP 미적용) 환경 Transferable 자동 폴백", "Automatic Transferable fallback without cross-origin isolation"),
      t("WebCodecs 하드웨어 9:16·16:9 60fps 로컬 오디오툰(서버 ₩0)", "WebCodecs 9:16 & 16:9 60 fps local AudioToon at ₩0 server cost"),
    ],
    diagram: {
      id: "webgpu-cel-sab64-webcodecs-audiotoon-diagram",
      kind: "graph",
      title: t("로컬 GPU 셰이딩·64비트 워커·WebCodecs ₩0 오디오툰 파이프라인", "Local GPU shading, 64-bit worker & ₩0 WebCodecs AudioToon"),
      caption: t(
        "선화·음성·타임라인을 서버로 올리지 않고 브라우저 안에서 셰이딩·전송·60fps 인코딩까지 마칩니다.",
        "Shading, zero-copy worker transfer and 60 fps encoding finish inside the browser with zero server upload.",
      ),
      alt: t(
        "2.5D 선화·채색 입력이 WebGPU WGSL 16x16 셀·림·하프톤 오토 셰이더(또는 CPU 폴백)를 거쳐 64비트 BigInt SharedArrayBuffer 채널(비격리 시 Transferable 폴백)로 워커에 전달됩니다. 타임라인 먹서가 켄번즈 카메라와 말풍선·Wave-3 스테레오 PCM 을 묶어 WebCodecs 9:16 또는 16:9 60fps 영상으로 로컬 내보내기 합니다.",
        "2.5D lineart enters the WebGPU WGSL 16x16 cel/rim/halftone autoshader (or CPU fallback), crosses a 64-bit BigInt SharedArrayBuffer channel (or Transferable fallback) to workers, and feeds the timeline muxer and WebCodecs exporter for local 9:16/16:9 60 fps AudioToon output.",
      ),
      nodes: [
        { id: "line", label: t("2.5D 선화·음성", "2.5D art & PCM"), sub: t("컷·말풍선·Wave-3 버스", "cuts, balloons, Wave-3"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "cel", label: t("WGSL 오토셰이더", "WGSL autoshader"), sub: t("셀·림라이트·하프톤", "cel, rim, halftone"), tone: "good", at: [1, 0] },
        { id: "sab", label: t("64비트 SAB 채널", "64-bit SAB channel"), sub: t("BigInt SoA · 제로카피", "BigInt SoA, zero-copy"), tone: "good", at: [2, 0] },
        { id: "mux", label: t("타임라인 먹서", "Timeline muxer"), sub: t("켄번즈 · A/V 싱크 검증", "Ken Burns & A/V sync"), tone: "local", at: [3, 0] },
        { id: "enc", label: t("WebCodecs 60fps", "WebCodecs 60 fps"), sub: t("9:16 · 16:9 · 서버 ₩0", "9:16, 16:9, ₩0 server"), tone: "good", shape: "pill", at: [4, 0] },
        { id: "fb", label: t("안전 폴백", "Safe fallback"), sub: t("CPU 셰이더 · Transferable", "CPU shader & Transferable"), tone: "warn", at: [2, 1] },
      ],
      edges: [
        { from: "line", to: "cel" },
        { from: "cel", to: "sab" },
        { from: "cel", to: "fb", label: t("GPU 없음", "no GPU"), style: "dashed" },
        { from: "sab", to: "fb", label: t("비격리", "non-COI"), style: "dashed" },
        { from: "sab", to: "mux" },
        { from: "mux", to: "enc", label: t("로컬 인코딩", "local encode") },
      ],
      groups: [
        { id: "local-pipe", label: t("브라우저 로컬 ₩0 파이프라인", "Browser-local ₩0 pipeline"), tone: "local", nodeIds: ["cel", "sab", "mux", "fb"] },
      ],
    },
    usage: [
      {
        feature: t("WGSL 2.5D 선화 셀·림라이트·하프톤 오토 셰이더", "WGSL 2.5D lineart cel, rim-light & halftone autoshader"),
        role: t(
          "16×16 워크그룹 WGSL 셰이더로 셀 밴드·림라이트·스크린톤을 생성하고, WebGPU 부재 시 동일 수식의 CPU 폴백을 실행합니다.",
          "Generates cel bands, rim lighting and halftone dots via a 16x16 WGSL compute pass with a deterministic CPU fallback.",
        ),
        paths: ["apps/web/src/domains/creator/wasm64-gpu-media-pipeline/webgpu-cel-light-autoshader.ts"],
        route: "/studio",
      },
      {
        feature: t("64비트 BigInt SharedArrayBuffer 제로-카피 워커 채널", "64-bit BigInt SharedArrayBuffer zero-copy worker channel"),
        role: t(
          "64B 캐시라인 정렬 제어 블록과 BigInt 오프셋으로 워커 간 프레임을 전송하며, 비격리 환경에서는 Transferable 패킷으로 자동 전환합니다.",
          "Passes frames across workers via a 64B-aligned control block and BigInt offsets, falling back to Transferable envelopes without COI.",
        ),
        paths: ["apps/web/src/domains/creator/wasm64-gpu-media-pipeline/sab-zero-copy-worker-channel.ts"],
      },
      {
        feature: t("WebCodecs 로컬 9:16·16:9 60fps 오디오툰 내보내기", "WebCodecs local 9:16 & 16:9 60 fps AudioToon exporter"),
        role: t(
          "컷 전환·켄번즈 이징·말풍선 등장 타이밍·Wave-3 스테레오 PCM 패킷화를 조합해 서버 비용 ₩0 으로 로컬 인코딩합니다.",
          "Combines cut transitions, Ken Burns easing, balloon reveals and Wave-3 stereo PCM packets for zero-server-cost local encoding.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-gpu-media-pipeline/webcodecs-local-audiotoon-exporter.ts",
          "apps/web/src/domains/creator/wasm64-gpu-media-pipeline/webcodecs-audiotoon-timeline-mux.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("격리 환경 판별에 따른 SAB / Transferable 채널 선택", "Selecting SAB vs Transferable transport by isolation state"),
        language: "ts",
        ...sampleSource([
          ['export type ChannelMode = "shared-array-buffer" | "transferable-fallback";'],
          [""],
          ["export function resolveWorkerChannelMode(crossOriginIsolated: boolean, hasSab: boolean): ChannelMode {"],
          ['  if (crossOriginIsolated && hasSab) return "shared-array-buffer";', "64비트 BigInt 오프셋 제로카피", "64-bit BigInt offset zero-copy"],
          ['  return "transferable-fallback";', "비격리 환경에서도 소유권 이전 유지", "falls back to Transferable ownership transfer"],
          ["}"],
          [""],
          ["export function alignedOffset64(rawBytes: bigint, align = 64n): bigint {"],
          ["  const rem = rawBytes % align;"],
          ["  return rem === 0n ? rawBytes : rawBytes + (align - rem);"],
          ["}"],
        ]),
        explain: t(
          "실제 sab-zero-copy-worker-channel.ts 는 64바이트 캐시라인 정렬 제어 블록, 프레임 체크섬, 배치 송수신, 4 GiB 초과 BigInt 오프셋 검증을 함께 수행합니다.",
          "The production sab-zero-copy-worker-channel.ts also handles 64B control blocks, frame checksums, batched I/O and BigInt offset validation past 4 GiB.",
        ),
        source: "apps/web/src/domains/creator/wasm64-gpu-media-pipeline/sab-zero-copy-worker-channel.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · WebCodecs VideoEncoder & AudioEncoder",
        url: "https://www.w3.org/TR/webcodecs/",
        kind: "spec",
        note: t("브라우저 내장 하드웨어 영상·오디오 인코딩 표준", "Browser hardware-accelerated video and audio encoding spec"),
      },
      {
        title: "MDN · Cross-Origin Isolation & SharedArrayBuffer",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer",
        kind: "docs",
        note: t("COOP/COEP 격리와 SharedArrayBuffer 보안 요구사항", "COOP/COEP cross-origin isolation rules for SharedArrayBuffer"),
      },
    ],
    chapterIds: ["performance", "sound-generation", "nextgen-web-experiments"],
    talk: {
      pitch: t(
        "서버 GPU 없이 2.5D 자동 채색과 60fps 숏폼 오디오툰 영상을 뽑기 위해 WGSL 16×16 셀·림·하프톤 오토셰이더, 비격리 폴백이 붙은 64비트 SAB 워커 채널, WebCodecs 9:16·16:9 로컬 오디오툰 내보내기를 구현해 서버 렌더링 비용 ₩0 구조를 검증했습니다.",
        "To deliver 2.5D shading and 60 fps AudioToon video with zero server GPUs, we built and tested a WGSL 16x16 cel/rim/halftone autoshader, a 64-bit SAB worker channel with Transferable fallback, and a ₩0 WebCodecs 9:16 & 16:9 exporter.",
      ),
      analogy: t(
        "영상 편집을 외부 렌더 팜에 택배로 보내는 대신, 작가의 노트북 그래픽 칩(WGSL·WebCodecs)과 고속 컨베이어(64비트 SAB)에서 바로 완성본을 구워 내는 로컬 제작 라인입니다.",
        "Instead of mailing footage to a cloud render farm, the artist's own GPU (WGSL + WebCodecs) and high-speed belt (64-bit SAB) finish the clip locally.",
      ),
      questions: [
        {
          question: t("iOS Safari 나 WebCodecs 미지원 브라우저에서는 어떻게 되나요?", "What happens on browsers without WebCodecs hardware support?"),
          answer: t(
            "probeAudioToonExportCapabilities 가 H.264·HEVC·AV1·Opus 지원 여부를 먼저 확인해 사용 가능한 코덱만 안내하며, 지원하지 않는 기능을 되는 척 숨기지 않습니다.",
            "probeAudioToonExportCapabilities probes H.264, HEVC, AV1 and Opus first and surfaces only supported codecs without pretending unavailable paths work.",
          ),
        },
        {
          question: t("왜 64비트 BigInt 오프셋을 쓰나요?", "Why use 64-bit BigInt offsets in the worker channel?"),
          answer: t(
            "대형 캔버스·영상 프레임 풀 주소가 4 GiB 경계를 넘더라도 32비트 정수 래핑이나 53비트 부동소수 오차 없이 정확히 주소를 계산하기 위해서입니다.",
            "To keep large canvas and video pool offsets exact across the 4 GiB boundary without 32-bit wraparound or 53-bit float precision loss.",
          ),
        },
      ],
      pitfall: t(
        "WebCodecs 하드웨어 가속과 60fps 속도는 사용자의 GPU 드라이버·OS 라이선스 코덱에 따라 달라지며, 현재 모듈은 단위 테스트 검증 단계로 본편 내보내기 UI 와의 전면 연결은 단계적 목표입니다.",
        "WebCodecs hardware speed depends on device drivers and OS codecs; these modules are unit-verified and staged for progressive integration into the main export UI.",
      ),
    },
    technologies: ["WebGPU", "WGSL", "SharedArrayBuffer", "WebCodecs"],
    facts: [
      {
        value: "16×16 WGSL + CPU",
        label: t("2.5D 선화 셀·림라이트·하프톤 오토 셰이더 및 결정적 CPU 폴백", "2.5D lineart cel, rim-light & halftone shader + CPU fallback"),
        source: "apps/web/src/domains/creator/wasm64-gpu-media-pipeline/webgpu-cel-light-autoshader.ts",
      },
      {
        value: "64-bit BigInt SAB",
        label: t("64B 정렬 제로-카피 워커 채널 · 비격리 Transferable 폴백", "64B-aligned zero-copy worker channel with Transferable fallback"),
        source: "apps/web/src/domains/creator/wasm64-gpu-media-pipeline/sab-zero-copy-worker-channel.ts",
      },
      {
        value: "9:16 · 16:9 · ₩0",
        label: t("WebCodecs 60fps 로컬 오디오툰 내보내기 · 서버 렌더링 비용 ₩0", "WebCodecs 60 fps local AudioToon export at ₩0 server cost"),
        source: "apps/web/src/domains/creator/wasm64-gpu-media-pipeline/webcodecs-local-audiotoon-exporter.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
