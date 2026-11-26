import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · web-platform · Wave-4 HyperCore:
 * 비동기 WASM 워커 풀(Work-Stealing·배압·장애 교체) + 64B..64KiB 슬랩 아레나 + 제로카피 IPC 링 +
 * SAB WebGPU↔WebAudio 디지털 PLL 브리지 + 온디바이스 Ridge WGSL 프리워머 + 이기종 DAG 스케줄러.
 */
export const ENGINEERING_ATLAS_WEB_PLATFORM_WAVE4_HYPERCORE: readonly EngineeringAtlasEntry[] = [
  {
    id: "wasm-worker-slab-sab-pll-shader-prewarmer",
    category: "web-platform",
    name: "WASM Slab Pool · SAB Audio-GPU PLL · Ridge Prewarmer",
    title: t("WASM 슬랩 워커 풀 · SAB 오디오-GPU PLL · Ridge 셰이더 프리워머", "WASM slab worker pool, SAB audio-GPU PLL & Ridge shader prewarmer"),
    status: "experimental",
    tagline: t(
      "슬랩 워커 풀, 48 kHz↔120 Hz 공유 메모리 동기화 모형, 셰이더 예열 계획을 각 모듈에서 확인했습니다.",
      "Module tests cover a slab worker pool, a 48 kHz↔120 Hz shared-memory timing model and shader prewarm planning.",
    ),
    background: [
      t(
        "고해상도 웹툰 캔버스와 오디오툰을 동시에 돌릴 때 워커 간 구조화 복제 비용, 비정상 WASM 트랩으로 인한 먹통, 오디오 클록과 GPU 프레임 사이의 미세 드리프트, 첫 브러시 선택 시의 셰이더 컴파일 스터터(Hitch)가 체감 품질을 떨어뜨립니다.",
        "Concurrent high-res canvas rendering and AudioToon playback suffer from worker clone copies, WASM worker hangs, audio-to-GPU clock drift and first-use WGSL compile hitches.",
      ),
      t(
        "wasm-worker-slab-pool.ts 는 11단계(64B..64KiB) 2의 거듭제곱 슬랩 아레나(O(1) 대여/반납·단편화 계측)와 32바이트 제로카피 IPC 링 디스크립터 위에 우선순위 Work-Stealing·큐 배압·장애 워커 자동 재생성(Recycle) 풀을 올렸고, scheduleHeterogeneousComputeDag 는 전송 대역폭까지 반영해 WASM64 SIMD 와 WebGPU 사이에 커널을 배정합니다.",
        "wasm-worker-slab-pool.ts pairs an 11-class (64 B–64 KiB) O(1) slab arena and 32-byte zero-copy IPC descriptor ring with a work-stealing, backpressured, auto-recycling WASM pool, complemented by scheduleHeterogeneousComputeDag across WASM64 and WebGPU.",
      ),
      t(
        "webgpu-webaudio-sab-sync.ts 의 WebGpuWebAudioSabSyncBridge 는 Seqlock 공유 메모리 위에서 48kHz 샘플과 120Hz 프레임을 디지털 PI PLL 로 동기화하고, OnDeviceShaderPrewarmer 는 백트래킹 없는 O(N) WGSL 특징 스캔과 온디바이스 Ridge 회귀로 유휴 예산 안에서만 파이프라인을 선행 컴파일합니다(Current: 단위 검증 완료·0B 초기 번들, Target: 오디오툰·브러시 부트 파이프라인 연결).",
        "WebGpuWebAudioSabSyncBridge phase-locks 48 kHz audio to 120 Hz GPU frames via a Seqlock SAB PI-PLL, while OnDeviceShaderPrewarmer uses O(N) WGSL feature scan + Ridge regression to pre-compile shaders within idle budgets (Current: unit-verified, 0 B eager; Target: runtime boot wiring).",
      ),
    ],
    keyPoints: [
      t("64B..64KiB 11등급 O(1) 슬랩 아레나 + 32B 제로카피 IPC 링 디스크립터", "64 B–64 KiB O(1) slab arena + 32 B zero-copy IPC ring descriptors"),
      t("유휴 워커 Work-Stealing · 배압 거절 · 비정상 트랩 워커 자동 재생성", "Idle work-stealing, backpressure guard & unhealthy worker recycle"),
      t("48kHz WebAudio ↔ 120Hz WebGPU Seqlock SAB 디지털 PLL 위상 동기화", "48 kHz WebAudio ↔ 120 Hz WebGPU Seqlock SAB digital PLL sync"),
      t("온디바이스 Ridge 회귀 WGSL 컴파일 지연 예측 & 이기종 DAG 스케줄러", "On-device Ridge WGSL compile predictor & heterogeneous DAG scheduler"),
    ],
    diagram: {
      id: "wasm-worker-slab-sab-pll-shader-prewarmer-diagram",
      kind: "layers",
      title: t("이기종 DAG · 제로카피 슬랩 워커 풀 · SAB PLL · Ridge 프리워머", "Heterogeneous DAG, zero-copy slab pool, SAB PLL & Ridge prewarmer"),
      caption: t(
        "커널 배정, 공유 메모리 워커, 위상 동기화, 셰이더 예열 계획의 연결 구상입니다.",
        "Proposed composition of kernel routing, shared-memory workers, phase locking and shader prewarm planning.",
      ),
      alt: t(
        "위에서부터 이기종 컴퓨트 DAG 스케줄러가 WASM64 SIMD 와 WebGPU 로 작업을 나누고, 비동기 WASM 워커 풀이 64B..64KiB 슬랩 아레나와 제로카피 링을 통해 실행하며, 아래에서 SAB 디지털 PLL 브리지와 온디바이스 Ridge 셰이더 프리워머가 프레임 지연을 막습니다.",
        "Top to bottom: the heterogeneous DAG scheduler splits work across WASM64 SIMD and WebGPU, the async worker pool executes over a 64 B–64 KiB slab arena and zero-copy IPC ring, and the SAB PLL bridge plus Ridge shader prewarmer prevent frame hitches.",
      ),
      layers: [
        { id: "dag", label: t("이기종 컴퓨트 DAG 스케줄러", "Heterogeneous DAG scheduler"), sub: t("전송 시간 + 커널 비용 기반 WASM64 vs WebGPU 배정", "Assigns WASM64 vs WebGPU by transfer + exec cost"), tone: "ai", chips: ["WASM64", "WebGPU"] },
        { id: "pool", label: t("비동기 WASM 렌더러 워커 풀", "Async WASM renderer worker pool"), sub: t("우선순위 Work-Stealing · 배압 제어 · 장애 워커 교체", "Priority work-stealing, backpressure, worker recycle"), tone: "good", chips: ["Web Workers"] },
        { id: "slab", label: t("2^k 슬랩 아레나 & 제로카피 IPC 링", "2^k slab arena & zero-copy IPC ring"), sub: t("64B..64KiB O(1) 프리리스트 · 32B 오프셋 디스크립터", "64 B–64 KiB O(1) freelist, 32 B descriptors"), tone: "local", chips: ["SharedArrayBuffer"] },
        { id: "pll", label: t("SAB 오디오-GPU PLL & Ridge 프리워머", "SAB audio-GPU PLL & Ridge prewarmer"), sub: t("48kHz↔120Hz Seqlock 위상 고정 · 유휴 예산 WGSL 예열", "48 kHz↔120 Hz Seqlock PLL & budgeted WGSL prewarm"), tone: "good", chips: ["WGSL"] },
      ],
    },
    usage: [
      {
        feature: t("비동기 WASM 워커 풀 · 2^k 슬랩 아레나 · 이기종 DAG 스케줄러", "Async WASM worker pool, 2^k slab arena & heterogeneous DAG scheduler"),
        role: t(
          "실험 모듈에서 슬랩 대여, 워커 교체, CPU·GPU 작업 배정 계획을 확인했습니다. /studio 렌더러 연결은 후속 단계입니다.",
          "Module tests cover slab leasing, worker replacement and CPU/GPU routing plans. Integration into the /studio renderer is a follow-up.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/wasm-worker-slab-pool.ts",
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/hybrid-compute-shadow-ink-meshlet.ts",
        ],
      },
      {
        feature: t("SAB WebGPU↔WebAudio PLL 브리지 & Ridge WGSL 프리워머", "SAB WebGPU↔WebAudio PLL bridge & Ridge WGSL prewarmer"),
        role: t(
          "48 kHz 입력과 120 Hz 프레임의 지연을 합성해 위상 보정과 셰이더 예열 계획을 확인했습니다.",
          "Synthetic 48 kHz audio and 120 Hz frame timing exercise phase correction and shader prewarm planning.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/webgpu-webaudio-sab-sync.ts",
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/wasm64-wave4-hypercore.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("디지털 PI 위상 고정 루프(PLL) 클록 보정 배율 계산", "Digital PI phase-locked loop (PLL) clock scale"),
        language: "ts",
        ...sampleSource([
          ["export function computePllClockScale(audioSec: number, gpuSec: number, integralErr: number): number {"],
          ["  const err = audioSec - gpuSec;"],
          ["  const raw = 1.0 + 0.015 * err + 0.0012 * integralErr;", "비례(P)·적분(I) 이득으로 미세 드리프트 수렴", "converge drift via PI gains"],
          ["  return Math.max(0.96, Math.min(1.04, raw));"],
          ["}"],
        ]),
        explain: t(
          "실제 WebGpuWebAudioSabSyncBridge 는 홀수/짝수 시퀀스 카운터(Seqlock)로 찢김 없는 오디오 샘플 시각과 비트 RMS 를 읽어 GPU 서브프레임 보간 알파를 산출합니다.",
          "WebGpuWebAudioSabSyncBridge reads tear-free audio sample timestamps and beat RMS via a Seqlock to compute GPU subframe alpha.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave4-hypercore/webgpu-webaudio-sab-sync.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · SharedArrayBuffer & Atomics",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer",
        kind: "docs",
        note: t("워커·오디오·렌더 스레드 간 제로카피 공유 메모리 표준", "Zero-copy shared memory across worker, audio and render threads"),
      },
      {
        title: "MDN · AudioWorkletGlobalScope",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletGlobalScope",
        kind: "docs",
        note: t("128프레임 오디오 렌더 퀀텀과 하드웨어 샘플 시계 기준", "128-frame audio render quantum and sample clock reference"),
      },
    ],
    chapterIds: ["worker-architecture", "performance", "sound-generation"],
    talk: {
      pitch: t(
        "실험 모듈에서 슬랩 워커의 장애 교체와 공유 메모리 위상 보정, 유휴 시간에 실행할 셰이더 예열 계획을 확인했습니다.",
        "Module tests cover slab worker replacement, shared-memory phase correction and shader prewarm planning for idle time.",
      ),
      analogy: t(
        "규격 상자(슬랩)만 번호표로 넘기는 물류 레인, 고장 난 작업대를 즉시 새것으로 가는 반장, 메트로놈에 바늘을 맞추는 영사기(PLL), 공연 전 무대 조명을 미리 달궈 두는 스태프(프리워머)의 조합입니다.",
        "Like passing numbered crates on a belt, swapping stalled stations, locking a projector to a metronome and warming stage lights before curtain rise.",
      ),
      questions: [
        {
          question: t("COOP/COEP 격리가 없는 임베드 환경에서는 SAB 브리지와 슬랩 풀이 깨지나요?", "Do the SAB bridge and slab pool break without COOP/COEP isolation?"),
          answer: t(
            "아닙니다. 두 모듈 모두 SharedArrayBuffer 생성 불가 시 동일한 바이트 오프셋 레이아웃을 가진 표준 ArrayBuffer 경로로 자동 폴백합니다.",
            "No—both modules automatically fall back to an identical byte-layout ArrayBuffer path when SharedArrayBuffer is unavailable.",
          ),
        },
      ],
    },
    technologies: ["WebAssembly", "SharedArrayBuffer", "Web Workers", "WebGPU", "WGSL"],
    reviewedAt: "2026-11-26",
  },
];
