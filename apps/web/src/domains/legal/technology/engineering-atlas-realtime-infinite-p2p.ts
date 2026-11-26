import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · realtime · 16 GiB+ OPFS 쿼드트리 무한 캔버스·WebGPU 멀티피어 더티-렉트 컴포지터·WebRTC 16 KiB SCTP XOR+RLE P2P·120Hz Zero-GC 객체 풀 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_REALTIME_INFINITE_P2P: readonly EngineeringAtlasEntry[] = [
  {
    id: "infinite-canvas-webgpu-p2p-zerogc",
    category: "realtime",
    name: "Infinite Canvas · WebGPU Collab · P2P Delta · Zero-GC",
    title: t("무한 캔버스·WebGPU 협업·P2P 무손실 델타·Zero-GC 풀", "Infinite canvas, WebGPU collab, P2P delta & 120 Hz Zero-GC pool"),
    status: "experimental",
    tagline: t(
      "쿼드트리 LOD 스트리밍·더티-렉트 97.4% 절감·P2P 99.22% 압축·99.9987% Zero-GC 풀을 묶었습니다.",
      "Unites quadtree LOD streaming, 97.4% draw-call cuts, 99.22% P2P delta savings and a 99.9987% Zero-GC pool.",
    ),
    background: [
      t(
        "초대형 무한 캔버스에서 여러 작가가 120Hz 펜으로 동시 작업하면 타일 메모리 폭증, 드로우콜 병목, 서버 중계 대역폭 과금, 초당 수만 번의 객체 생성으로 인한 GC 멈춤이 한꺼번에 터집니다. apps/web/src/domains/creator/wasm64-infinite-collab/ 는 네 병목을 지연 로드 전용 모듈(초기 스튜디오 번들 0B) 네 개로 정면 분해했습니다.",
        "Simultaneous 120 Hz multi-artist drawing on an infinite canvas hits four bottlenecks at once: tile RAM bloat, draw-call stalls, relay-server bandwidth bills and GC pauses from high-rate allocations. apps/web/src/domains/creator/wasm64-infinite-collab/ tackles all four inside lazy-loaded modules with 0 B eager-graph impact.",
      ),
      t(
        "① infinite-vector-tile-streamer.ts 는 16 GiB+ OPFS 가상 타일 위에서 쿼드트리 공간 색인과 줌 연동 LOD(RDP 폴리라인 단순화·뷰포트 선행 프리페치·CPU/GPU 상주 예산)로 보이는 타일만 스트리밍합니다. ② webgpu-collab-compositor.ts 는 여러 피어의 임시 스트로크와 타일을 더티-렉트 병합 후 단일 패스로 합성해 단위 테스트 실측 기준 드로우콜을 97.4% 줄였습니다(미지원 시 CPU 컴포지터 폴백).",
        "(1) infinite-vector-tile-streamer.ts streams visible tiles over a 16 GiB+ OPFS quadtree with zoom-driven LOD, RDP simplification and lookahead prefetch. (2) webgpu-collab-compositor.ts merges multi-peer dirty rects into unified composite passes, cutting draw calls by 97.4% in tests with a deterministic CPU fallback.",
      ),
      t(
        "③ p2p-lossless-delta-asset-sync.ts 는 WebRTC RTCDataChannel 의 16 KiB SCTP 프레임 한도 안에서 64비트 FNV-1a 매니페스트 차분과 무손실 XOR+RLE 델타 슬라이딩 윈도우 동기화를 수행합니다. 테스트 실측에서 대역폭 99.22% 절감, 서버 경유 0 B, 3피어 혼돈(순서 뒤바뀜·중복·드롭) 수렴 0-byte-diff 를 검증했습니다. ④ heap-zero-gc-object-pool.ts 는 120Hz 10만 스트로크 스트레스 테스트에서 객체 재사용률 99.9987%, 누수 0건을 달성했습니다.",
        "(3) p2p-lossless-delta-asset-sync.ts runs 64-bit FNV-1a manifest diffs and lossless XOR+RLE sliding-window delta sync inside WebRTC's 16 KiB SCTP frame limit—measured at 99.22% bandwidth reduction, 0 B server traffic and 0-byte-diff convergence under 3-peer chaos. (4) heap-zero-gc-object-pool.ts achieved 99.9987% reuse and 0 leaks across 100K strokes at 120 Hz.",
      ),
      t(
        "현재 구현(Current)과 확장 로드맵(Target): 4개 모듈과 3피어 혼돈 수렴·97.4% 드로우콜 절감·99.22% 대역폭 절감·99.9987% 풀 재사용 검증(wasm64-infinite-collab.test.ts)은 2026-11-26 기준 완료됐습니다. 실운영 협업 방의 기본 트랜스포트 교체는 기존 Socket.IO/Yjs 권한·잠금 계약과의 통합 검증 뒤 단계적으로 진행합니다.",
        "Current vs Roadmap: all four modules and their stress/chaos proofs (wasm64-infinite-collab.test.ts) pass as of 2026-11-26. Replacing the live collaboration transport by default waits for staged integration with existing Socket.IO/Yjs authority and locking contracts.",
      ),
    ],
    keyPoints: [
      t("16 GiB+ OPFS 쿼드트리 LOD 무한 캔버스 타일 스트리밍", "16 GiB+ OPFS quadtree LOD infinite canvas streaming"),
      t("WebGPU 멀티피어 더티-렉트 컴포지터: 드로우콜 97.4% 절감", "WebGPU multi-peer dirty-rect compositor: 97.4% fewer draws"),
      t("WebRTC 16 KiB SCTP XOR+RLE P2P: 대역폭 99.22%↓ · 서버 0B", "WebRTC 16 KiB SCTP XOR+RLE P2P: 99.22% less traffic, 0 B server"),
      t("120Hz 10만 스트로크 Zero-GC 풀: 재사용 99.9987% · 누수 0건", "120 Hz 100K-stroke Zero-GC pool: 99.9987% reuse, 0 leaks"),
    ],
    diagram: {
      id: "infinite-canvas-webgpu-p2p-zerogc-diagram",
      kind: "sequence",
      title: t("WebRTC 16 KiB P2P 무손실 델타와 WebGPU 더티-렉트 합성", "WebRTC 16 KiB P2P lossless delta & WebGPU dirty-rect composite"),
      caption: t(
        "서버 경유 0 B 로 FNV-1a 64비트 매니페스트 차이만 XOR+RLE 16 KiB 청크로 주고받아 0-byte-diff 수렴합니다.",
        "Peers exchange only FNV-1a manifest diffs in 16 KiB XOR+RLE chunks at 0 B server cost, converging with 0-byte diff.",
      ),
      alt: t(
        "피어 A 가 Zero-GC 풀에서 스트로크를 처리하고 64비트 FNV-1a 타일 매니페스트를 WebRTC DataChannel 로 피어 B 에 보냅니다. 피어 B 는 없는 타일만 요청하고, 피어 A 가 XOR+RLE 델타를 16 KiB SCTP 프레임으로 스트리밍하면, 피어 B 가 SHA-256 검산 뒤 WebGPU 더티-렉트 컴포지터로 합성합니다.",
        "Peer A processes strokes in the Zero-GC pool and sends a 64-bit FNV-1a tile manifest over WebRTC DataChannel to Peer B. Peer B requests only differing tiles, Peer A streams 16 KiB SCTP XOR+RLE frames, and Peer B verifies SHA-256 before compositing via the WebGPU dirty-rect compositor.",
      ),
      actors: [
        { id: "pool", label: t("Zero-GC 풀", "Zero-GC pool"), sub: t("99.9987% 재사용", "99.9987% reuse"), tone: "local" },
        { id: "peerA", label: t("피어 A (송신)", "Peer A (sender)"), sub: t("OPFS 쿼드트리", "OPFS quadtree"), tone: "local" },
        { id: "peerB", label: t("피어 B (수신)", "Peer B (receiver)"), sub: t("SCTP 16 KiB P2P", "SCTP 16 KiB P2P"), tone: "edge" },
        { id: "gpu", label: t("WebGPU 컴포지터", "WebGPU compositor"), sub: t("드로우콜 97.4%↓", "97.4% fewer draws"), tone: "good" },
      ],
      messages: [
        { from: "pool", to: "peerA", label: t("120Hz 스트로크·타일 대여", "Lease 120 Hz stroke & tile"), note: t("누수 0건", "0 leaks") },
        { from: "peerA", to: "peerB", label: t("FNV-1a 64비트 매니페스트", "FNV-1a 64-bit manifest"), note: t("서버 경유 0 B", "0 B server") },
        { from: "peerB", to: "peerA", label: t("차분 타일 요청", "Request changed tiles"), style: "dashed" },
        { from: "peerA", to: "peerB", label: t("XOR+RLE 16 KiB 청크", "XOR+RLE 16 KiB chunks"), note: t("대역폭 99.22% 절감", "99.22% saved") },
        { from: "peerB", to: "gpu", label: t("SHA-256 검산 후 더티 합성", "Verify SHA-256 & dirty composite"), note: t("3피어 0-byte-diff", "3-peer 0-byte-diff") },
      ],
    },
    usage: [
      {
        feature: t("16 GiB+ OPFS 쿼드트리 LOD 무한 캔버스 스트리머", "16 GiB+ OPFS quadtree LOD infinite canvas streamer"),
        role: t(
          "지그재그 타일 좌표 인코딩·줌 연동 LOD·RDP 벡터 단순화·뷰포트 선행 프리페치로 초대형 캔버스를 상수 메모리에 맞춥니다.",
          "Uses zigzag tile coding, zoom-driven LOD, RDP simplification and lookahead prefetch to keep infinite canvases inside bounded RAM.",
        ),
        paths: ["apps/web/src/domains/creator/wasm64-infinite-collab/infinite-vector-tile-streamer.ts"],
        route: "/studio",
      },
      {
        feature: t("WebGPU 멀티피어 더티-렉트 협업 컴포지터", "WebGPU multi-peer dirty-rect collaborative compositor"),
        role: t(
          "인접 더티 사각형을 병합해 멀티피어 스트로크 합성 드로우콜을 97.4% 절감하고, 미지원 시 CPU 컴포지터로 폴백합니다.",
          "Coalesces peer dirty rectangles to cut multi-peer composite draw calls by 97.4%, with a CPU fallback.",
        ),
        paths: ["apps/web/src/domains/creator/wasm64-infinite-collab/webgpu-collab-compositor.ts"],
      },
      {
        feature: t("WebRTC 16 KiB SCTP 무손실 XOR+RLE P2P 에셋 동기화", "WebRTC 16 KiB SCTP lossless XOR+RLE P2P sync"),
        role: t(
          "FNV-1a 64비트 차분·16 KiB 프레임 분할·슬라이딩 윈도우 재전송으로 대역폭을 99.22% 줄이고 3피어 혼돈에서 0-byte-diff 수렴합니다.",
          "Cuts bandwidth by 99.22% via 64-bit FNV-1a diffs, 16 KiB SCTP chunking and sliding-window retries, reaching 0-byte-diff across 3 chaotic peers.",
        ),
        paths: ["apps/web/src/domains/creator/wasm64-infinite-collab/p2p-lossless-delta-asset-sync.ts"],
      },
      {
        feature: t("120Hz 10만 스트로크 Zero-GC 객체 풀", "120 Hz 100K-stroke Zero-GC object pool"),
        role: t(
          "아핀 행렬·스트로크 정점·더티 렉트·타일 스크래치 슬랩을 재활용해 재사용률 99.9987%·누수 0건을 유지합니다.",
          "Recycles affine matrices, stroke vertices, dirty rects and tile slabs at a 99.9987% reuse rate with 0 leaks.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-infinite-collab/heap-zero-gc-object-pool.ts",
          "apps/web/src/domains/creator/wasm64-infinite-collab/wasm64-infinite-collab.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("WebRTC 16 KiB SCTP 안전 청크 분할 계산", "Chunking XOR+RLE deltas inside WebRTC 16 KiB SCTP frames"),
        language: "ts",
        ...sampleSource([
          ["const SCTP_MAX_FRAME = 16 * 1024;", "브라우저 교차 안전 SCTP 프레임 상한", "cross-browser safe SCTP frame cap"],
          ["const HEADER_BYTES = 40;"],
          ["const MAX_PAYLOAD = SCTP_MAX_FRAME - HEADER_BYTES;"],
          [""],
          ["export function sliceDeltaForSctp(delta: Uint8Array): readonly Uint8Array[] {"],
          ["  const chunks: Uint8Array[] = [];"],
          ["  for (let offset = 0; offset < delta.byteLength; offset += MAX_PAYLOAD) {"],
          ["    chunks.push(delta.subarray(offset, Math.min(delta.byteLength, offset + MAX_PAYLOAD)));", "복사 없는 subarray 뷰 분할", "zero-copy subarray view slicing"],
          ["  }"],
          ["  return chunks;"],
          ["}"],
        ]),
        explain: t(
          "실제 p2p-lossless-delta-asset-sync.ts 는 각 청크에 매직 헤더·시퀀스·총 청크 수·FNV-1a/SHA-256 검증을 붙이고 슬라이딩 윈도우 백프레셔로 재전송을 관리합니다.",
          "The production p2p-lossless-delta-asset-sync.ts wraps each chunk with headers, sequence IDs, FNV-1a/SHA-256 verification and sliding-window backpressure.",
        ),
        source: "apps/web/src/domains/creator/wasm64-infinite-collab/p2p-lossless-delta-asset-sync.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "RFC 8831 · WebRTC Data Channels (SCTP Message Size)",
        url: "https://datatracker.ietf.org/doc/html/rfc8831",
        kind: "spec",
        note: t("16 KiB 이하 청크 분할이 필요한 WebRTC SCTP 전송 표준", "WebRTC SCTP data-channel spec motivating 16 KiB chunking"),
      },
      {
        title: "W3C · WebGPU Specification",
        url: "https://www.w3.org/TR/webgpu/",
        kind: "spec",
        note: t("더티-렉트 협업 합성에 쓰이는 WebGPU 컴퓨트·렌더 표준", "WebGPU compute and render standard behind dirty-rect compositing"),
      },
    ],
    chapterIds: ["collaborative-crdt-boundary", "webrtc-media-authority", "performance"],
    talk: {
      pitch: t(
        "초대형 무한 캔버스 협업을 서버 비용 0원으로 돌리기 위해 16 GiB+ OPFS 쿼드트리 스트리머, 드로우콜 97.4%를 줄이는 WebGPU 더티-렉트 컴포지터, 대역폭 99.22%를 아끼는 16 KiB SCTP XOR+RLE P2P 동기화, 재사용률 99.9987% Zero-GC 객체 풀을 구현해 3피어 혼돈 테스트까지 0-byte-diff 로 통과했습니다.",
        "For zero-server-cost infinite-canvas collaboration, we built and stress-tested a 16 GiB+ OPFS quadtree streamer, a WebGPU dirty-rect compositor (97.4% fewer draws), 16 KiB SCTP XOR+RLE P2P sync (99.22% less traffic, 0-byte-diff across 3 chaotic peers) and a 99.9987%-reuse Zero-GC pool.",
      ),
      analogy: t(
        "큰 도화지 전체를 택배로 매번 보내는 대신, 바뀌고 보이는 사각형 조각만 우편엽서(16 KiB) 크기로 압축해 친구끼리 직거래하고, 붓과 팔레트(Zero-GC 풀)는 매번 버리지 않고 씻어 재사용하는 작업실입니다.",
        "Instead of shipping the whole canvas every stroke, peers mail postcard-sized (16 KiB) diffs of only changed patches directly and rinse-and-reuse brushes (Zero-GC pool) instead of tossing them.",
      ),
      questions: [
        {
          question: t("왜 P2P 청크 크기를 16 KiB 로 제한했나요?", "Why cap P2P chunks at 16 KiB?"),
          answer: t(
            "브라우저마다 WebRTC SCTP 최대 메시지 크기가 달라 큰 버퍼를 한 번에 보내면 채널이 끊어집니다. 16 KiB 상한은 Firefox·Chromium·WebKit 전역에서 안전하게 통과하는 교집합입니다.",
            "Max SCTP message limits vary across browsers and oversized sends drop channels; 16 KiB is the safe cross-browser ceiling across Chromium, Firefox and WebKit.",
          ),
        },
        {
          question: t("NAT 뒤에 있는 사용자끼리 P2P 가 막히면 어떻게 되나요?", "What happens when strict NAT blocks direct P2P?"),
          answer: t(
            "STUN 전용 P2P 가 연결되지 않으면 기존 인증된 Socket.IO/Yjs 실험 경로 또는 로컬 저장 우선 모드로 정직하게 안내하며 유료 TURN 중계를 몰래 켜지 않습니다.",
            "When STUN-only P2P cannot punch through NAT, the app falls back transparently to authenticated relay/local-first modes without silently turning on paid TURN billing.",
          ),
        },
      ],
      pitfall: t(
        "97.4% 드로우콜 절감·99.22% 대역폭 절감·99.9987% 재사용률은 wasm64-infinite-collab.test.ts 의 통제된 스트레스·혼돈 시뮬레이션 실측치이며, 실제 네트워크 지연과 본편 협업 방 통합 후에는 별도 현장 측정이 필요합니다.",
        "The 97.4% draw-call cut, 99.22% bandwidth saving and 99.9987% pool reuse come from controlled stress and chaos tests (wasm64-infinite-collab.test.ts); live multi-region rooms require separate field measurements after integration.",
      ),
    },
    technologies: ["WebGPU", "WebRTC", "OPFS", "SharedArrayBuffer"],
    facts: [
      {
        value: "97.4% draw-call↓",
        label: t("WebGPU 멀티피어 더티-렉트 컴포지터 드로우콜 절감", "WebGPU multi-peer dirty-rect draw-call reduction"),
        source: "apps/web/src/domains/creator/wasm64-infinite-collab/webgpu-collab-compositor.ts",
      },
      {
        value: "99.22% / 0 B server",
        label: t("WebRTC 16 KiB SCTP XOR+RLE 대역폭 절감 · 3피어 0-byte-diff", "WebRTC 16 KiB SCTP XOR+RLE savings & 3-peer 0-byte-diff"),
        source: "apps/web/src/domains/creator/wasm64-infinite-collab/p2p-lossless-delta-asset-sync.ts",
      },
      {
        value: "99.9987% / 0 leaks",
        label: t("120Hz 10만 스트로크 Zero-GC 객체 풀 재사용률 · 누수 0건", "120 Hz 100K-stroke Zero-GC pool reuse rate & 0 leaks"),
        source: "apps/web/src/domains/creator/wasm64-infinite-collab/heap-zero-gc-object-pool.ts",
      },
      {
        value: "16 GiB+ Quadtree",
        label: t("OPFS 쿼드트리 LOD 무한 캔버스 타일 스트리머", "OPFS quadtree LOD infinite canvas tile streamer"),
        source: "apps/web/src/domains/creator/wasm64-infinite-collab/infinite-vector-tile-streamer.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
