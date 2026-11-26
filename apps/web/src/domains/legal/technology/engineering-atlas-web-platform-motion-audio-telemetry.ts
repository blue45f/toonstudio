import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · web-platform · 1컷 2.5D 모션툰 · 광학 흐름 중간 동화 · 3D 뎁스 충돌 파티클 VFX ·
 * 2.5D 깊이 시차 내보내기 · 스크롤 스템+3D HRTF 입체음향 · AudioWorklet Lock-Free SAB 링버퍼 ·
 * 자율 120Hz OLS 힙 누수/컷 회귀 텔레메트리 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_WEB_PLATFORM_MOTION_AUDIO_TELEMETRY: readonly EngineeringAtlasEntry[] = [
  {
    id: "supergap-motiontoon-depth-vfx-hrtf-sab-telemetry",
    category: "web-platform",
    name: "MotionToon · Depth VFX · 3D HRTF · SAB Ring · 120Hz OLS",
    title: t("2.5D 모션툰·뎁스 VFX·3D HRTF·SAB 링버퍼·120Hz OLS 텔레메트리", "2.5D MotionToon, depth VFX, 3D HRTF, SAB ring & 120 Hz OLS telemetry"),
    status: "experimental",
    tagline: t(
      "모션툰(18ms/60f)·광학흐름(9ms)·뎁스 VFX(18ms)·HRTF(1ms)·SAB 링(0.041ms, 언더런 0)·120Hz OLS 게이트.",
      "MotionToon (18 ms/60f), optical flow (9 ms), depth VFX (18 ms), HRTF (1 ms), 0.041 ms SAB ring & 120 Hz OLS gate.",
    ),
    background: [
      t(
        "정적인 세로 웹툰을 움직이는 모션툰·2.5D 깊이 시차(Parallax)·입체 오디오툰으로 확장하려면 매 컷마다 애프터이펙트·외부 영상 인코딩 서버·유료 AI 영상 생성을 거쳐야 했습니다. 동시에 120Hz(8.33ms 프레임 예산) 화면에서 오디오 언더런이나 특정 컷의 JS 힙 누수·VRAM 스파이크가 생기면 독자 경험이 즉각 흔들립니다.",
        "Turning static vertical webtoons into MotionToon, 2.5D parallax and spatial AudioToon usually demands external VFX suites or paid video generators, while 120 Hz playback quickly breaks if audio underruns or per-cut heap leaks appear.",
      ),
      t(
        "wasm64-supergap-motion-audio 의 Pillar F(#12·#21~#24)는 브라우저 안에서 0-토큰으로 모션·입자·공간음향을 생성합니다. ① rigCutToMotionToonMesh 는 1컷 실루엣을 삼각화하고 정규화 본 가중치(합=1.0)를 얹어 60fps 호흡·머리카락·눈깜빡임을 18ms/60프레임에 평가합니다. ② interpolateInbetweenFrames 는 키프레임 A→B 광학 흐름+벡터 중간 동화를 9ms 만에 합성합니다. ③ ProceduralVfxParticleSimulator 는 5종 프리셋 파티클이 3D 뎁스맵과 충돌·바운스·스플래시·안착하는 WGSL 시뮬레이션을 18ms 에 수행합니다.",
        "Pillar F (#12, #21–#24) builds motion, particles and spatial sound locally at 0 tokens: rigCutToMotionToonMesh rigs a single silhouette for 60 fps MotionToon in 18 ms/60f, interpolateInbetweenFrames synthesizes optical-flow + vector in-betweens in 9 ms, and ProceduralVfxParticleSimulator steps 5 depth-colliding WGSL particle presets in 18 ms.",
      ),
      t(
        "④ DynamicScrollStemHrtfMixer 는 스크롤 속도·대사 활성 상태에 따라 스템 게인·덕킹과 말풍선 좌표 기반 물리적 ITD/ILD 바이노럴 3D HRTF 입체음향을 1ms 만에 계산하고, SubMsAudioWorkletRingBuffer(subms-audioworklet-ring-and-3dgs-bridge.ts)는 128샘플 Lock-Free SPSC SharedArrayBuffer 링버퍼(non-SAB 폴백 포함)로 64퀀텀(8,192프레임) 왕복 0.041ms · 언더런 0건 · 샘플 100% 일치를 검증했습니다.",
        "DynamicScrollStemHrtfMixer modulates scroll-velocity stems and balloon-positioned ITD/ILD binaural 3D HRTF audio in 1 ms, feeding SubMsAudioWorkletRingBuffer (128-frame lock-free SPSC SAB ring with non-SAB fallback) verified at 0.041 ms and 0 underruns across 64 quanta.",
      ),
      t(
        "여기에 DepthParallaxEpisodeExporter(2.5D 깊이 시차 UV 행렬·디스오클루전 외곽 보간·prefers-reduced-motion 폴백)와 AutonomousFrameTelemetryGate(120Hz 8.33ms P99 프레임 회귀·톱니형 GC 오탐을 거르는 OLS 단조 힙 누수·VRAM 초과 원인 컷 귀속)를 결합했습니다. 현재 구현·실측 완료(Current): 6개 모듈 전체 단위 테스트 통과. 로드맵(Target): AudioWorklet 실오디오 컨텍스트와 모션툰 타임라인 뷰포트 연결은 단계별로 통합합니다.",
        "DepthParallaxEpisodeExporter (parallax UV matrices, disocclusion edge fill, reduced-motion fallback) and AutonomousFrameTelemetryGate (120 Hz P99 regression, OLS heap-leak vs sawtooth-GC filtering, per-cut VRAM attribution) complete the stack. Current vs Roadmap: all 6 modules pass tests; live AudioWorklet and timeline UI wiring are staged.",
      ),
    ],
    keyPoints: [
      t("1컷 2.5D 모션툰(18ms/60f) · 광학흐름 동화(9ms) · 뎁스 VFX(18ms)", "2.5D MotionToon (18 ms/60f), optical flow (9 ms), depth VFX (18 ms)"),
      t("스크롤 스템 + 3D HRTF 입체음향(1ms) & SAB 링버퍼(0.041ms, 언더런 0)", "Scroll-stem + 3D HRTF (1 ms) & lock-free SAB ring (0.041 ms, 0 underrun)"),
      t("2.5D 깊이 시차 매니페스트(디스오클루전 패딩 · reducedMotion 폴백)", "2.5D depth parallax manifest (disocclusion fill & reducedMotion)"),
      t("자율 120Hz(8.33ms) OLS 힙 누수·VRAM·P99 원인 컷 귀속 텔레메트리", "Autonomous 120 Hz (8.33 ms) OLS heap-leak & per-cut telemetry gate"),
    ],
    diagram: {
      id: "supergap-motiontoon-depth-vfx-hrtf-sab-telemetry-diagram",
      kind: "graph",
      title: t("2.5D 모션툰 · 뎁스 VFX · 3D HRTF/SAB 오디오 · 120Hz OLS 게이트", "2.5D MotionToon, depth VFX, 3D HRTF/SAB audio & 120 Hz OLS gate"),
      caption: t(
        "정지 컷을 모션·광학흐름·뎁스 입자·패럴랙스와 3D HRTF/SAB 링버퍼로 확장하고, 120Hz OLS 게이트가 회귀 컷을 감시합니다.",
        "Expands static cuts with MotionToon, optical flow, depth VFX, parallax and 3D HRTF/SAB audio under a 120 Hz OLS regression gate.",
      ),
      alt: t(
        "왼쪽 정지 컷과 스크롤 입력에서 위쪽 갈래는 1컷 2.5D 모션툰(18ms/60f)·광학흐름 동화(9ms)·3D 뎁스 파티클 VFX(18ms)·2.5D 시차 매니페스트로 흐르고, 아래쪽 갈래는 스크롤 스템 + 바이노럴 3D HRTF(1ms)와 Lock-Free SAB 링버퍼(0.041ms·언더런 0)로 흐릅니다. 오른쪽 끝에서 자율 120Hz OLS 텔레메트리 게이트가 P99·힙 누수·VRAM 원인을 컷 단위로 귀속합니다.",
        "Static cuts and scroll input split into a visual lane (MotionToon 18 ms/60f, optical flow 9 ms, depth VFX 18 ms, 2.5D parallax) and an audio lane (scroll-stem + 3D HRTF 1 ms into a 0.041 ms lock-free SAB ring with 0 underruns), both monitored by the 120 Hz OLS telemetry gate.",
      ),
      nodes: [
        { id: "cut", label: t("컷 · 스크롤 입력", "Cut & scroll"), sub: t("실루엣·깊이·말풍선", "Silhouette, depth, text"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "mot", label: t("모션툰 · 동화", "Motion & flow"), sub: t("18ms/60f · 광학흐름 9ms", "18 ms/60f, flow 9 ms"), tone: "good", at: [1, 0] },
        { id: "vfx", label: t("뎁스 VFX · 시차", "Depth VFX/2.5D"), sub: t("파티클 18ms · UV 행렬", "VFX 18 ms, parallax UV"), tone: "good", at: [2, 0] },
        { id: "hrtf", label: t("스템 · 3D HRTF", "Stem & 3D HRTF"), sub: t("ITD/ILD 바이노럴 · 1ms", "ITD/ILD binaural, 1 ms"), tone: "good", at: [1, 2] },
        { id: "sab", label: t("SAB 링버퍼", "SAB ring buf"), sub: t("0.041ms · 언더런 0건", "0.041 ms, 0 underruns"), tone: "good", at: [2, 2] },
        { id: "gate", label: t("120Hz OLS 게이트", "120 Hz OLS gate"), sub: t("8.33ms · 누수 컷 귀속", "8.33 ms, leak per cut"), tone: "warn", shape: "pill", at: [3, 1] },
      ],
      edges: [
        { from: "cut", to: "mot" },
        { from: "mot", to: "vfx" },
        { from: "cut", to: "hrtf" },
        { from: "hrtf", to: "sab", label: t("128프레임", "128 frames") },
        { from: "vfx", to: "gate" },
        { from: "sab", to: "gate" },
      ],
      groups: [
        { id: "vis", label: t("2.5D 모션 · 파티클", "2.5D motion & VFX"), tone: "local", nodeIds: ["mot", "vfx"] },
        { id: "aud", label: t("서브-ms 공간 오디오", "Sub-ms spatial audio"), tone: "neutral", nodeIds: ["hrtf", "sab"] },
      ],
    },
    usage: [
      {
        feature: t("2.5D 모션툰 · 광학 흐름 동화 · 3D 뎁스 파티클 VFX · 3D HRTF 믹서", "2.5D MotionToon, optical flow, depth VFX & 3D HRTF mixer"),
        role: t(
          "1컷 자동 메시 리깅(18ms/60f), 광학흐름+벡터 보간(9ms), 5종 뎁스 충돌 파티클(18ms), 스크롤 스템+바이노럴 HRTF(1ms)를 처리합니다.",
          "Runs 1-cut MotionToon (18 ms/60f), optical-flow in-betweening (9 ms), depth-colliding VFX (18 ms) and 3D HRTF (1 ms).",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-motion-audio/motiontoon-auto-mesh-rig.ts",
          "apps/web/src/domains/creator/wasm64-supergap-motion-audio/opticalflow-vector-inbetweener.ts",
          "apps/web/src/domains/creator/wasm64-supergap-motion-audio/webgpu-depth-particle-vfx.ts",
          "apps/web/src/domains/creator/wasm64-supergap-motion-audio/motiontoon-opticalflow-particles-hrtf.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("Lock-Free SAB AudioWorklet 링버퍼 · 2.5D 시차 · 120Hz OLS 텔레메트리", "Lock-free SAB AudioWorklet ring, 2.5D parallax & 120 Hz OLS telemetry"),
        role: t(
          "128샘플 Lock-Free SAB 링버퍼(0.041ms·언더런 0), 디스오클루전 패딩 2.5D 시차, OLS 단조 힙 누수·컷 회귀 게이트를 제공합니다.",
          "Provides 0.041 ms lock-free SAB audio rings (0 underruns), 2.5D parallax manifests and 120 Hz OLS heap/cut attribution.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/subms-audioworklet-ring-and-3dgs-bridge.ts",
          "apps/web/src/domains/creator/wasm64-grid-brush-parallax-telemetry/depth-parallax-exporter-and-frame-telemetry.ts",
          "apps/web/src/domains/creator/wasm64-grid-brush-parallax-telemetry/wasm64-grid-brush-parallax-telemetry.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("120Hz OLS 선형 회귀 힙 기울기와 SPSC 링버퍼 가용 프레임 계산", "120 Hz OLS heap-slope regression & SPSC ring available frames"),
        language: "ts",
        ...sampleSource([
          ["export function olsHeapSlopeBytesPerSec(timesSec: readonly number[], heapBytes: readonly number[]): number {"],
          ["  const n = Math.min(timesSec.length, heapBytes.length);"],
          ["  if (n < 2) return 0;"],
          ["  const meanT = timesSec.reduce((a, b) => a + b, 0) / n;"],
          ["  const meanH = heapBytes.reduce((a, b) => a + b, 0) / n;"],
          ["  let num = 0, den = 0;"],
          ["  for (let i = 0; i < n; i += 1) {"],
          ["    const dt = (timesSec[i] ?? 0) - meanT;"],
          ["    num += dt * ((heapBytes[i] ?? 0) - meanH);"],
          ["    den += dt * dt;"],
          ["  }"],
          ["  return den > 1e-9 ? num / den : 0;", "톱니 GC 오탐 없이 지속 누수 기울기만 포착", "captures sustained leak slope past sawtooth GC"],
          ["}"],
        ]),
        explain: t(
          "AutonomousFrameTelemetryGate 는 OLS 회귀 기울기와 단조 증가 판정으로 정상 톱니형 GC 패턴을 오탐하지 않으면서 실제 힙 누수·VRAM 초과·8.33ms P99 위반을 원인 컷 ID 로 귀속합니다.",
          "AutonomousFrameTelemetryGate combines OLS slope and monotonicity checks to ignore healthy sawtooth GC while pinning true leaks, VRAM overruns and >8.33 ms P99 spikes to offending cuts.",
        ),
        source: "apps/web/src/domains/creator/wasm64-grid-brush-parallax-telemetry/depth-parallax-exporter-and-frame-telemetry.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · Web Audio API (AudioWorklet 128-Frame Render Quantum)",
        url: "https://www.w3.org/TR/webaudio/#rendering-loop",
        kind: "spec",
        note: t("128샘플 오디오 퀀텀과 실시간 오디오 스레드 Lock-Free 링버퍼 규격", "128-frame AudioWorklet quantum specification behind the lock-free SAB ring"),
      },
      {
        title: "MDN · SharedArrayBuffer & Atomics (Lock-Free SPSC)",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics",
        kind: "docs",
        note: t("COOP/COEP 격리 환경에서 무잠금 오디오 링버퍼를 구현하는 표준 API", "Standard Atomics API for lock-free SPSC audio rings under COOP/COEP"),
      },
    ],
    chapterIds: ["sound-generation", "performance", "worker-architecture"],
    talk: {
      pitch: t(
        "1컷 2.5D 모션툰(18ms/60f), 광학흐름 동화(9ms), 3D 뎁스 파티클 VFX(18ms), 2.5D 패럴랙스, 스크롤 스템+3D HRTF(1ms), Lock-Free SAB AudioWorklet 링버퍼(0.041ms·언더런 0)를 0-토큰 로컬로 돌리고, 자율 120Hz OLS 게이트가 회귀 컷을 즉시 지목합니다.",
        "2.5D MotionToon (18 ms/60f), optical-flow in-betweens (9 ms), depth VFX (18 ms), parallax, scroll-stem 3D HRTF (1 ms) and a 0.041 ms lock-free SAB audio ring run locally under an autonomous 120 Hz OLS telemetry gate.",
      ),
      analogy: t(
        "한 장의 웹툰 컷에 인형 뼈대와 바람·빗방울·입체 음향 무대를 즉석에서 얹고, 객석 뒤 계기판(120Hz OLS 게이트)이 8.33ms 를 넘긴 장면 번호만 정확히 짚어 주는 소극장입니다.",
        "Like turning a single comic cut into a live puppet stage with depth-aware weather and binaural sound while a 120 Hz dashboard pinpoints any frame-budget culprit.",
      ),
      questions: [
        {
          question: t("SharedArrayBuffer 가 꺼진 브라우저 환경에서도 오디오 링버퍼가 동작하나요?", "Does the AudioWorklet ring buffer work if SharedArrayBuffer is unavailable?"),
          answer: t(
            "COOP/COEP 격리가 없는 환경에서는 일반 ArrayBuffer 플래너 폴백 모드로 자동 전환하고, 언더런 시 무음 채움과 A/V 클럭 드리프트 보정 재생률까지 단위 테스트로 검증했습니다.",
            "Without COOP/COEP isolation it switches automatically to a planar ArrayBuffer fallback with silent underrun fill and A/V clock-drift rate compensation.",
          ),
        },
        {
          question: t("2.5D 깊이 시차 효과가 멀미를 유발하는 독자는 어떻게 배려하나요?", "How does 2.5D parallax respect readers sensitive to motion?"),
          answer: t(
            "DepthParallaxEpisodeExporter 는 prefers-reduced-motion 사용자를 위한 정적 폴백 모드(reducedMotionFallbackMode)와 자이로 기울기 클램프를 매니페스트 계약에 기본 포함합니다.",
            "DepthParallaxEpisodeExporter embeds gyro angle clamps and a reducedMotionFallbackMode directly inside every exported parallax manifest.",
          ),
        },
      ],
      pitfall: t(
        "18ms/60f 모션툰·9ms 광학흐름·0.041ms SAB 링 수치는 단위 벤치마크 기준이며, 저사양 모바일 실기기에서는 해상도와 동시 파티클 수에 맞춰 발열 페이서와 함께 조정해야 합니다.",
        "The 18 ms/60f, 9 ms and 0.041 ms timings are deterministic benchmark measurements; low-end mobile devices rely on thermal pacing to bound particle and resolution load.",
      ),
    },
    technologies: ["AudioWorklet / SAB", "3D HRTF", "Optical Flow", "WebGPU VFX", "120Hz Telemetry"],
    facts: [
      {
        value: "18 ms/60f · 9 ms · 18 ms",
        label: t("1컷 2.5D 모션툰 · 광학흐름 동화 · 3D 뎁스 충돌 파티클 VFX 실측", "1-cut MotionToon (18 ms/60f), optical flow (9 ms) & depth VFX (18 ms)"),
        source: "apps/web/src/domains/creator/wasm64-supergap-motion-audio/wasm64-supergap-motion-audio.test.ts",
      },
      {
        value: "1 ms HRTF · 0.041 ms SAB",
        label: t("스크롤 스템+3D HRTF(1ms) & Lock-Free SAB 링(0.041ms, 언더런 0)", "Scroll-stem 3D HRTF (1 ms) & lock-free SAB ring (0.041 ms, 0 underruns)"),
        source: "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/subms-audioworklet-ring-and-3dgs-bridge.ts",
      },
      {
        value: "120 Hz (8.33 ms) OLS",
        label: t("톱니 GC 오탐 없는 단조 힙 누수·VRAM·P99 원인 컷 귀속 게이트", "Sawtooth-GC-safe OLS heap leak, VRAM & P99 per-cut telemetry gate"),
        source: "apps/web/src/domains/creator/wasm64-grid-brush-parallax-telemetry/depth-parallax-exporter-and-frame-telemetry.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
