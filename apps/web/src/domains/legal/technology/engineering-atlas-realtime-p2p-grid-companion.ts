import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · realtime · P2P 분산 그리드 타일 렌더 · 에셋 DAG Merkle 자가치유 · R2+P2P 90% 오프로드 ·
 * 우선순위 CRDT & ₩0 PC↔태블릿 SAS 페어링 · 일회성 P2P 레드라인 · 자이로/WebHID/DCC 핫싱크 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_REALTIME_P2P_GRID_COMPANION: readonly EngineeringAtlasEntry[] = [
  {
    id: "p2p-grid-tile-render-merkle-stream-r2-offload",
    category: "realtime",
    name: "P2P Grid Tile Render · Merkle Heal · R2+P2P 90% Offload",
    title: t("P2P 그리드 타일 렌더 · Merkle 자가치유 · R2+P2P 캐시 · 우선순위 CRDT", "P2P grid tile render, Merkle self-heal, R2+P2P cache & priority CRDT"),
    status: "experimental",
    tagline: t(
      "워크 스틸링·FNV-1a 격리 P2P 그리드 렌더, 에셋 Merkle 자가치유, R2 90% 오프로드, 잉크 우선 CRDT 를 구현했습니다.",
      "Combines work-stealing FNV-1a P2P grid render, Merkle asset self-healing, 90% R2 offload and ink-priority CRDT.",
    ),
    background: [
      t(
        "스튜디오 팀이 고해상도 3D 배경이나 대용량 브러시·모델 에셋을 동시에 렌더링하고 공유할 때 중앙 GPU 렌더팜이나 CDN 대역폭을 쓰면 운영비가 급격히 늘어납니다. 반대로 피어 기기끼리 작업을 나누면 느린 기기의 꼬리 지연, 끊긴 피어, 변조된 결과 패킷을 견뎌야 합니다.",
        "Team-wide 3D background renders and large asset sync can quickly burn cloud GPU and CDN budgets, while naïve peer sharing suffers from stragglers, disconnected workers and corrupted payloads.",
      ),
      t(
        "P2pGridRenderCoordinator(p2p-grid-render-and-stream-assets.ts)는 이기종 피어의 성능 가중치에 따라 타일을 분배하고, 먼저 끝난 고속 피어가 느린 피어의 남은 타일을 가져가는 워크 스틸링과 4초 타임아웃 재할당으로 꼬리 지연을 줄입니다. 제출된 타일은 64비트 FNV-1a 체크섬으로 검증해 변조 결과를 즉시 거부하고 반복 위반 피어를 자동 격리합니다.",
        "P2pGridRenderCoordinator weights tiles by heterogeneous peer capability, uses work stealing and 4-second timeout failover to curb tail latency, and checks 64-bit FNV-1a hashes to reject bad tiles and quarantine faulty peers.",
      ),
      t(
        "RealTimeAssetStreamPipeline 은 material → prop3d → cut → episode 반응형 DAG 핫스왑을 위상 순으로 전파하면서 잠긴 핀을 보존하고, 로컬 캐시 손상을 머클 루트로 감지해 오염 피어를 거른 정상 피어에서 자가치유합니다. HybridR2P2pAssetCacheRouter(r2-p2p-cache-router.ts)는 웜 메시에서 R2 오리진 요청의 90% 를 피어·로컬 캐시로 오프로드하며, ContextAwarePriorityCrdt 는 실시간 펜 획(active-ink-stroke)을 최우선 레인으로 선점해 3피어 결정론적 수렴을 지킵니다.",
        "RealTimeAssetStreamPipeline propagates material→prop3d→cut→episode hot-swaps topologically while preserving locked pins and Merkle self-healing damaged caches. HybridR2P2pAssetCacheRouter achieves 90% R2 offload in warm meshes, and ContextAwarePriorityCrdt prioritizes active-ink-stroke ops with deterministic 3-peer convergence.",
      ),
      t(
        "현재 구현·실측 완료(Current)와 확장 로드맵(Target): 분산 타일 워크 스틸링·타임아웃 재할당·FNV-1a 거부, 에셋 DAG Merkle 자가치유, R2+P2P 90% 오프로드, 우선순위 CRDT 모두 단위 테스트를 통과했습니다. 실제 다중 브라우저 WebRTC DataChannel 메시에서의 원격 방 부하 시험은 다음 단계입니다.",
        "Current vs Roadmap: work stealing, timeout failover, FNV-1a quarantine, Merkle self-heal, 90% R2 offload and priority CRDT all pass deterministic unit tests; multi-browser WebRTC mesh soak tests follow next.",
      ),
    ],
    keyPoints: [
      t("P2P 그리드 타일 렌더: 워크 스틸링·4초 타임아웃 재할당·FNV-1a 거부", "P2P grid render: work stealing, 4 s failover & FNV-1a reject"),
      t("에셋 반응형 DAG(material→episode) 핫스왑 & 머클 루트 자가치유", "Reactive asset DAG hot-swap & Merkle-root self-healing"),
      t("R2+P2P 하이브리드 캐시 라우터: 변조 피어 격리 · 90% 오프로드", "R2+P2P hybrid cache router: peer quarantine & 90% R2 offload"),
      t("우선순위 CRDT: active-ink-stroke 최우선 스케줄링·3피어 수렴", "Priority CRDT: active-ink-stroke preemption & 3-peer convergence"),
    ],
    diagram: {
      id: "p2p-grid-tile-render-merkle-stream-r2-offload-diagram",
      kind: "sequence",
      title: t("P2P 그리드 타일 렌더 · Merkle 자가치유 · R2+P2P 오프로드", "P2P grid tile render, Merkle self-heal & R2+P2P offload"),
      caption: t(
        "유휴 피어가 타일을 훔쳐 끝내고, 변조 피어는 FNV-1a·머클 검증으로 격리하며, 웜 메시는 R2 호출 90% 를 줄입니다.",
        "Idle peers steal straggler tiles, FNV-1a/Merkle verification quarantines bad peers, and warm meshes offload 90% of R2 traffic.",
      ),
      alt: t(
        "호스트 코디네이터가 성능 가중치에 따라 피어들에게 타일을 배정하고, 타임아웃이나 유휴 피어 발생 시 워크 스틸링으로 재할당합니다. 수신 타일은 64비트 FNV-1a 와 머클 루트로 검사해 변조 피어를 격리하고 정상 피어에서 자가치유합니다. R2+P2P 캐시는 90% 를 피어 메시에서 해결하고 우선순위 CRDT 가 활성 펜 획을 최우선 수렴시킵니다.",
        "The host assigns weighted tiles across peers, runs work stealing and timeout failover, validates tiles with 64-bit FNV-1a and Merkle roots to quarantine bad peers, offloads 90% of R2 reads to the warm P2P mesh, and converges active-ink-stroke updates first via priority CRDT.",
      ),
      actors: [
        { id: "host", label: t("호스트 조정기", "Host coord"), sub: t("가중치·워크 스틸링", "Weights, work steal"), tone: "local" },
        { id: "peer", label: t("피어 워커 메시", "Peer mesh"), sub: t("타일·에셋·R2 90%", "Tiles, assets, 90%"), tone: "good" },
        { id: "verify", label: t("FNV-1a · 머클", "FNV-1a/Merkle"), sub: t("변조 거부·자가치유", "Reject & self-heal"), tone: "warn" },
        { id: "crdt", label: t("우선순위 CRDT", "Priority CRDT"), sub: t("잉크 최우선 수렴", "Ink-first converge"), tone: "edge" },
      ],
      messages: [
        { from: "host", to: "peer", label: t("성능 가중치 타일 배정 · 워크 스틸링", "Assign weighted tiles & steal work") },
        { from: "peer", to: "verify", label: t("타일 결과 · 에셋 청크 제출", "Submit tiles & asset chunks") },
        { from: "verify", to: "host", label: t("FNV-1a·머클 통과(오염 피어 격리)", "Accept verified (quarantine bad)"), style: "dashed" },
        { from: "peer", to: "peer", label: t("웜 메시 90% R2 오프로드 공유", "Warm mesh offloads 90% from R2") },
        { from: "host", to: "crdt", label: t("active-ink-stroke 최우선 병합", "Merge active-ink-stroke first") },
      ],
    },
    usage: [
      {
        feature: t("P2P 분산 그리드 타일 렌더 & 반응형 에셋 DAG Merkle 자가치유", "P2P grid tile render & reactive asset DAG Merkle self-heal"),
        role: t(
          "이기종 워크 스틸링·타임아웃 장애조치·64비트 FNV-1a 변조 격리와 material→episode 핫스왑·머클 자가치유를 처리합니다.",
          "Runs heterogeneous work stealing, timeout failover, 64-bit FNV-1a checks and Merkle-verified DAG hot-swaps.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-grid-brush-parallax-telemetry/p2p-grid-render-and-stream-assets.ts",
          "apps/web/src/domains/creator/wasm64-grid-brush-parallax-telemetry/wasm64-grid-brush-parallax-telemetry.test.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("R2+P2P 하이브리드 캐시 라우터 & 우선순위 CRDT", "R2+P2P hybrid cache router & context-aware priority CRDT"),
        role: t(
          "변조 피어를 격리하며 웜 메시 R2 오프로드 90% 를 달성하고, 실시간 펜 획 최우선 스케줄링과 3피어 수렴을 보장합니다.",
          "Quarantines bad peers while achieving 90% R2 offload and prioritizes active ink strokes across 3-peer CRDT merges.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/r2-p2p-cache-router.ts",
          "apps/web/src/domains/creator/wasm64-creator-defense-healer/mesh-topology-healer-and-semantic-scene.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("P2P 그리드 변조 피어 격리 판정과 R2 오프로드율 계산", "P2P grid bad-peer quarantine & R2 origin offload ratio"),
        language: "ts",
        ...sampleSource([
          ["export interface PeerHealth { readonly rejections: number; readonly localHits: number; readonly p2pHits: number; readonly originHits: number; }"],
          [""],
          ["export function shouldQuarantinePeer(rejections: number, limit = 2): boolean {"],
          ["  return rejections >= limit;", "FNV-1a·머클 불일치 누적 시 자동 격리", "auto-quarantine after checksum failures"],
          ["}"],
          [""],
          ["export function r2OffloadRatio(stats: PeerHealth): number {"],
          ["  const total = stats.localHits + stats.p2pHits + stats.originHits;"],
          ["  if (total === 0) return 1;"],
          ["  return (stats.localHits + stats.p2pHits) / total;", "웜 메시 목표 >= 0.85 (실측 0.90)", "warm mesh target >= 0.85 (0.90 measured)"],
          ["}"],
        ]),
        explain: t(
          "실제 P2pGridRenderCoordinator 와 HybridR2P2pAssetCacheRouter 는 64비트 FNV-1a 와 SHA-256 다이제스트로 오염 응답을 걸러 내고, 반복 위반 피어를 격리 목록에 올려 건강한 피어에서 자동 재시도합니다.",
          "P2pGridRenderCoordinator and HybridR2P2pAssetCacheRouter verify 64-bit FNV-1a and SHA-256 digests, quarantine repeat offenders and retry cleanly on healthy peers.",
        ),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/r2-p2p-cache-router.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "IETF Draft · The FNV Non-Cryptographic Hash Algorithm (FNV-1a)",
        url: "https://datatracker.ietf.org/doc/html/draft-eastlake-fnv",
        kind: "spec",
        note: t("P2P 그리드 타일 무결성 체크섬에 쓰는 64비트 FNV-1a 공식 벡터 규격", "64-bit FNV-1a specification verified against official test vectors"),
      },
      {
        title: "W3C · WebRTC 1.0 (RTCDataChannel Peer-to-Peer Mesh)",
        url: "https://www.w3.org/TR/webrtc/",
        kind: "spec",
        note: t("P2P 타일·에셋 메시 전송의 기반이 되는 브라우저 DataChannel 규격", "Browser RTCDataChannel specification underlying peer tile and asset meshes"),
      },
    ],
    chapterIds: ["collaborative-crdt-boundary", "webrtc-media-authority", "content-addressing"],
    talk: {
      pitch: t(
        "P2P 분산 그리드 타일 렌더가 워크 스틸링·타임아웃 재할당·FNV-1a 변조 격리로 팀 기기 유휴 GPU 를 묶고, 에셋 DAG 머클 자가치유와 R2+P2P 90% 오프로드, 활성 펜 획 최우선 CRDT 로 서버 비용 없이 협업 성능을 끌어올립니다.",
        "Work-stealing P2P grid tile rendering with FNV-1a quarantine, Merkle asset self-healing, 90% R2 offload and ink-priority CRDT scale team creation without cloud GPU or egress bills.",
      ),
      analogy: t(
        "팀원 세 명이 퍼즐 조각을 속도대로 나눠 맞추되 먼저 끝낸 사람이 남은 조각을 도와주고(워크 스틸링), 틀린 조각을 낸 사람은 즉시 제외(FNV-1a 격리)하며, 이미 가진 참고서는 옆자리에서 바로 빌려 쓰는(R2 90% 오프로드) 공동 작업실입니다.",
        "Like teammates splitting puzzle tiles by speed, pitching in when finished, rejecting bad pieces by checksum and borrowing cached references from the desk next door.",
      ),
      questions: [
        {
          question: t("느린 피어가 타일을 붙잡고 응답이 없으면 전체 렌더가 멈추나요?", "Does one slow or dropped peer stall the whole grid render?"),
          answer: t(
            "4초 기본 타임아웃이 지나면 해당 타일을 건강한 다른 피어로 자동 재할당하고, 뒤늦게 도착한 이전 피어의 지연 제출은 세대 검사로 안전하게 버립니다.",
            "After the 4-second default timeout, stalled tiles reassign automatically to healthy peers while late stale submissions are rejected.",
          ),
        },
        {
          question: t("R2 오프로드 90% 는 모든 환경에서 항상 보장되나요?", "Is 90% R2 offload guaranteed in every room?"),
          answer: t(
            "아닙니다. 90% 는 여러 피어가 같은 에셋을 보유한 웜 메시 시뮬레이션 실측치이며, 혼자 작업하는 콜드 스타트 방에서는 R2 오리진에서 처음 한 번 내려받아야 합니다.",
            "No—90% is measured on warm multi-peer meshes; solo cold-start sessions still fetch initial assets once from R2.",
          ),
        },
      ],
      pitfall: t(
        "NAT 대칭 방화벽 환경에서는 P2P 직결이 막힐 수 있어 기존 TURN/R2 오리진 폴백이 필요하며, 다중 기기 실네트워크 부하 시험은 향후 단계로 남아 있습니다.",
        "Symmetric NAT firewalls can block direct P2P meshes and require R2/TURN fallback; live multi-device WAN load testing remains staged.",
      ),
    },
    technologies: ["WebRTC DataChannel", "FNV-1a 64-bit", "Merkle Tree", "Priority CRDT"],
    facts: [
      {
        value: "90% R2 Offload",
        label: t("웜 메시 R2+P2P 하이브리드 캐시 라우터 오프로드 실측(목표 ≥85%)", "Warm-mesh R2+P2P hybrid cache offload ratio (target >=85%)"),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/r2-p2p-cache-router.ts",
      },
      {
        value: "4,000 ms / 3 Retries",
        label: t("P2P 그리드 타일 타임아웃 장애조치 · 워크 스틸링 · FNV-1a 격리", "P2P grid tile timeout failover, work stealing & FNV-1a quarantine"),
        source: "apps/web/src/domains/creator/wasm64-grid-brush-parallax-telemetry/p2p-grid-render-and-stream-assets.ts",
      },
      {
        value: "material → episode",
        label: t("반응형 에셋 DAG 위상 핫스왑 및 머클 루트 자가치유", "Reactive asset DAG topological hot-swap & Merkle self-healing"),
        source: "apps/web/src/domains/creator/wasm64-grid-brush-parallax-telemetry/wasm64-grid-brush-parallax-telemetry.test.ts",
      },
      {
        value: "active-ink-stroke",
        label: t("컨텍스트 인식 우선순위 CRDT 최우선 레인 및 3피어 결정론적 수렴", "Context-aware priority CRDT ink lane & 3-peer convergence"),
        source: "apps/web/src/domains/creator/wasm64-creator-defense-healer/mesh-topology-healer-and-semantic-scene.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "zero-lag-companion-pairing-ephemeral-redline-hw",
    category: "realtime",
    name: "Zero-Lag Companion · Ephemeral Redline · Gyro/WebHID/DCC",
    title: t("₩0 PC↔태블릿 SAS 페어링 · P2P 레드라인 · 자이로/WebHID/DCC 핫싱크", "₩0 PC↔tablet SAS pairing, P2P redline & gyro/WebHID/DCC sync"),
    status: "experimental",
    tagline: t(
      "6자리 SAS·6.15× 더티 압축 태블릿 페어링, 무설치 P2P 레드라인, 자이로·WebHID/MIDI·DCC 핫싱크를 묶었습니다.",
      "Combines 6-digit SAS 6.15× tablet pairing, ephemeral P2P redline reviews, gyro dial, WebHID/MIDI & DCC hot-sync.",
    ),
    background: [
      t(
        "작가들은 PC 메인 화면에서 작업하면서 태블릿을 보조 액정·단축 다이얼로 쓰거나, 편집자에게 파일 전송 없이 일회성 교정(레드라인) 피드백을 받고, 외부 Blender/Photoshop 의 .glb·.psd 수정본을 스튜디오에 바로 반영하고 싶어 합니다.",
        "Artists want to pair a tablet as a zero-lag companion or dial beside their PC, share one-off redline review links without file uploads, and hot-sync external .psd/.glb edits back into the studio.",
      ),
      t(
        "ZeroLagDevicePairingSession(zero-token-style-profiler-and-pairing.ts)은 6자리 SAS(Short Authentication String) 핸드셰이크로 로컬 PC 와 태블릿·모바일을 ₩0 직접 연결하고, 바뀐 32×32 더티 타일만 16 KiB 이하 XOR+RLE 패킷으로 압축 전송합니다(실측 6.15× 더티 압축). 태블릿의 필압·기울기 스타일러스 입력도 같은 직통 레인으로 즉시 릴레이됩니다.",
        "ZeroLagDevicePairingSession pairs PC and tablet locally via a 6-digit SAS handshake, mirrors changed 32×32 dirty tiles in <=16 KiB XOR+RLE packets (6.15× measured compression) and relays pressure/tilt stylus input directly.",
      ),
      t(
        "EphemeralP2pRedlineReviewSession(ephemeral-redline-review.ts)은 별도 설치 없이 TTL 만료가 붙은 암호화 P2P 일회성 레드라인 검수 링크를 발급해 편집자가 핀·획·대사 메모를 토글 오버레이로 남기되 원본 아트워크는 한 바이트도 건드리지 않게 격리합니다.",
        "EphemeralP2pRedlineReviewSession issues zero-install encrypted P2P review links with TTL expiry so editors draw toggleable redline pins, strokes and dialogue notes without mutating a single byte of the master artwork.",
      ),
      t(
        "HardwareCompanionAndColdBootSuite(hardware-companion-dcc.ts, hardware-companion-coldboot.ts)는 컴패니언 폰 자이로·다이얼(데드존+EMA 스무딩), WebHID/WebMIDI 시프트 레이어 컨트롤러 매퍼, 외부 DCC(.psd/.glb) 매직 헤더 검증·메타데이터 보존 핫싱크를 묶었습니다. 현재 구현·실측 완료(Current): 4개 모듈 모두 단위 테스트 통과. 로드맵(Target): 실제 WebHID/WebMIDI 기기 프로필과 QR 페어링 모달 연결은 단계별 작업입니다.",
        "HardwareCompanionAndColdBootSuite adds gyro/dial smoothing, WebHID/WebMIDI shift-layer mapping and magic-header-checked .psd/.glb DCC hot-sync. Current vs Roadmap: all four modules pass unit tests; physical HID/MIDI device presets and QR pairing modals are staged.",
      ),
    ],
    keyPoints: [
      t("₩0 PC↔태블릿 6자리 SAS 페어링 · ≤16 KiB XOR+RLE 6.15× 압축", "₩0 PC↔tablet 6-digit SAS pairing & <=16 KiB 6.15× XOR+RLE"),
      t("무설치 암호화 P2P 일회성 레드라인 링크: TTL · 원본 무변조", "Zero-install encrypted P2P redline links: TTL, zero art mutation"),
      t("컴패니언 폰 자이로/다이얼(데드존·EMA) & WebHID/WebMIDI 매퍼", "Companion gyro/dial (deadzone/EMA) & WebHID/WebMIDI mapper"),
      t("외부 DCC(.psd/.glb) 매직 헤더 검증 & 스튜디오 메타 보존 핫싱크", "External DCC (.psd/.glb) magic-header & metadata-safe hot-sync"),
    ],
    diagram: {
      id: "zero-lag-companion-pairing-ephemeral-redline-hw-diagram",
      kind: "graph",
      title: t("PC↔태블릿 SAS 페어링 · 일회성 P2P 레드라인 · 하드웨어/DCC 브리지", "PC↔tablet SAS pairing, ephemeral P2P redline & HW/DCC bridge"),
      caption: t(
        "PC 스튜디오를 중심으로 태블릿 미러링(6.15×), 편집자 레드라인, 자이로·WebHID/MIDI·외부 DCC 가 로컬로 연결됩니다.",
        "Tablet mirroring (6.15×), ephemeral redline reviews, gyro/HID/MIDI controllers and DCC files connect locally around the studio.",
      ),
      alt: t(
        "가운데 PC 스튜디오를 기준으로 왼쪽에는 6자리 SAS 와 ≤16 KiB XOR+RLE 6.15배 압축으로 연결되는 태블릿 스타일러스·자이로 다이얼이, 위쪽에는 TTL 만료와 원본 무변조를 지키는 암호화 P2P 레드라인 편집자가, 오른쪽에는 WebHID·WebMIDI 컨트롤러와 .psd/.glb 매직 헤더 검증 DCC 핫싱크가 이어집니다.",
        "Centered on the PC Studio, a 6-digit SAS tablet companion mirrors dirty tiles at 6.15× XOR+RLE compression with stylus/gyro input, editors attach non-destructive TTL P2P redlines, and WebHID/WebMIDI controllers plus .psd/.glb DCC hot-sync feed commands and assets.",
      ),
      nodes: [
        { id: "tab", label: t("태블릿·폰 컴패니언", "Tablet/phone"), sub: t("6자리 SAS · 자이로 다이얼", "6-digit SAS, gyro dial"), tone: "local", at: [0, 0] },
        { id: "hid", label: t("WebHID / MIDI", "WebHID / MIDI"), sub: t("시프트 레이어 · CC/Note", "Shift layers, CC/Note"), tone: "local", at: [0, 1] },
        { id: "pc", label: t("PC 스튜디오", "PC Studio"), sub: t("로컬 원본 · 0 서버 릴레이", "Local master, 0 relay"), tone: "good", at: [1, 0] },
        { id: "red", label: t("P2P 레드라인", "P2P redline"), sub: t("TTL 링크 · 원본 무변조", "TTL link, read-only art"), tone: "warn", at: [2, 0] },
        { id: "dcc", label: t("DCC 핫싱크", "DCC hot-sync"), sub: t(".psd/.glb 매직 헤더 검증", ".psd/.glb magic header"), tone: "edge", at: [2, 1] },
      ],
      edges: [
        { from: "tab", to: "pc", label: t("6.15× 타일", "6.15× tiles") },
        { from: "hid", to: "pc", label: t("명령 매핑", "Cmd map") },
        { from: "pc", to: "red", label: t("암호화 P2P", "Enc P2P") },
        { from: "dcc", to: "pc", label: t("메타 보존", "Keep meta") },
      ],
      groups: [
        { id: "hw", label: t("로컬 입력 장치", "Local hardware"), tone: "neutral", nodeIds: ["tab", "hid"] },
        { id: "ext", label: t("검수 · 외부 DCC", "Review & DCC"), tone: "local", nodeIds: ["red", "dcc"] },
      ],
    },
    usage: [
      {
        feature: t("₩0 PC↔태블릿 6자리 SAS 페어링 & 6.15× XOR+RLE 미러링", "₩0 PC↔tablet 6-digit SAS pairing & 6.15× XOR+RLE mirror"),
        role: t(
          "6자리 SAS 인증 핸드셰이크, ≤16 KiB XOR+RLE 더티 타일 미러링, 스타일러스 필압·기울기 릴레이를 실행합니다.",
          "Runs 6-digit SAS handshakes, <=16 KiB XOR+RLE dirty-tile mirroring and low-latency stylus relay.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-creator-defense-healer/zero-token-style-profiler-and-pairing.ts",
          "apps/web/src/domains/creator/wasm64-creator-defense-healer/wasm64-creator-defense-healer.test.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("일회성 암호화 P2P 레드라인 · 자이로 · WebHID/MIDI · DCC 핫싱크", "Ephemeral P2P redline, gyro dial, WebHID/MIDI & DCC hot-sync"),
        role: t(
          "TTL 레드라인 검수 오버레이, 자이로 데드존/EMA 다이얼, WebHID/MIDI 시프트 매퍼, .psd/.glb 매직 헤더 핫싱크를 제공합니다.",
          "Provides TTL redline review overlays, gyro dial filtering, WebHID/MIDI shift mapping and .psd/.glb DCC hot-sync.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/ephemeral-redline-review.ts",
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/hardware-companion-dcc.ts",
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/hardware-companion-coldboot.ts",
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/wasm64-supergap-security-ops-hw.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("컴패니언 자이로 다이얼 데드존 필터링과 EMA 스무딩", "Companion gyro dial deadzone filtering & EMA smoothing"),
        language: "ts",
        ...sampleSource([
          ["export function smoothGyroDialDelta("],
          ["  prevSmoothed: number,"],
          ["  rawDeltaDeg: number,"],
          ["  deadzoneDeg = 0.8,", "미세 손떨림 무시 구간", "ignore micro hand jitter"],
          ["  alpha = 0.35,"],
          ["): number {"],
          ["  const effective = Math.abs(rawDeltaDeg) < deadzoneDeg ? 0 : rawDeltaDeg;"],
          ["  return prevSmoothed + alpha * (effective - prevSmoothed);", "지수 이동평균으로 부드러운 브러시/줌 조절", "EMA smooths brush & zoom turns"],
          ["}"],
        ]),
        explain: t(
          "실제 CompanionGyroDialController 는 데드존·EMA 스무딩에 더해 브러시 크기·캔버스 회전·타임라인 스크럽 다이얼 모드 전환까지 단일 상태 머신으로 처리합니다.",
          "CompanionGyroDialController pairs deadzone and EMA smoothing with dial mode switching across brush size, canvas rotation and timeline scrubbing.",
        ),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/hardware-companion-dcc.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "WICG · WebHID API Specification",
        url: "https://wicg.github.io/webhid/",
        kind: "spec",
        note: t("왼손 단축키 패드·다이얼 컨트롤러 연결을 위한 WebHID 브라우저 규격", "Browser WebHID specification for macro pads and dial controllers"),
      },
      {
        title: "W3C · Web MIDI API Specification",
        url: "https://www.w3.org/TR/webmidi/",
        kind: "spec",
        note: t("CC/Note 패킷을 스튜디오 명령으로 매핑하는 Web MIDI 규격", "Web MIDI API specification for CC/Note studio command bindings"),
      },
    ],
    chapterIds: ["webrtc-media-authority", "blender-mcp-boundary", "browser-local-compute"],
    talk: {
      pitch: t(
        "6자리 SAS 인증과 6.15× XOR+RLE 더티 타일 압축으로 PC↔태블릿을 ₩0 페어링하고, 무설치 TTL P2P 레드라인 검수와 자이로 다이얼·WebHID/MIDI·.psd/.glb 매직 헤더 DCC 핫싱크까지 하나의 컴패니언 스위트로 묶었습니다.",
        "Six-digit SAS pairing with 6.15× XOR+RLE dirty tiles links PC and tablet at ₩0, alongside zero-install TTL P2P redline reviews, gyro dials, WebHID/MIDI mapping and .psd/.glb DCC hot-sync.",
      ),
      analogy: t(
        "유선 액정 타블렛과 단축키 다이얼, 투명 트레이싱지 교정(레드라인), 외부 작업실 파일 수송관을 별도 서버나 유료 구독 없이 로컬 직통선으로 연결한 책상입니다.",
        "Like wiring a pen display, macro dial, translucent tracing-paper proof overlay and external DCC drop-box directly across your own desk.",
      ),
      questions: [
        {
          question: t("일회성 레드라인 링크를 받은 편집자가 내 원본 레이어를 망가뜨릴 수 있나요?", "Can an editor using an ephemeral redline link overwrite master artwork?"),
          answer: t(
            "레드라인 패킷은 별도의 토글 오버레이(핀·획·대사 코멘트)로만 적재되며 원본 레이어 바이트는 무변조로 유지되도록 단위 테스트로 검증했습니다.",
            "Redline annotations load strictly as toggleable overlays (pins, strokes, dialogue notes), verified by tests to leave master artwork bytes untouched.",
          ),
        },
        {
          question: t("WebHID 나 WebMIDI 를 지원하지 않는 Safari 에서는 어떻게 동작하나요?", "What happens in browsers like Safari without WebHID or WebMIDI?"),
          answer: t(
            "컨트롤러 매퍼는 기능 감지로 안전하게 비활성화되고, 브라우저 표준인 터치·자이로 컴패니언 모드와 키보드 단축키로 매끄럽게 폴백합니다.",
            "Feature detection disables HID/MIDI bindings cleanly while preserving standard touch/gyro companion and keyboard controls.",
          ),
        },
      ],
      pitfall: t(
        "WebHID·WebMIDI 는 Chromium 계열 브라우저의 사용자 권한 승인이 필요하며, 외부 DCC 파일 감시는 File System Access API 허용 폴더 안에서만 동작합니다.",
        "WebHID/WebMIDI require explicit Chromium user grants, and DCC hot-sync requires granted File System Access directory handles.",
      ),
    },
    technologies: ["WebRTC DataChannel", "6-Digit SAS", "WebHID / WebMIDI", "DCC Hot-Sync"],
    facts: [
      {
        value: "6.15× (≤16 KiB)",
        label: t("PC↔태블릿 6자리 SAS 페어링 XOR+RLE 더티 타일 압축 실측", "PC↔tablet 6-digit SAS pairing <=16 KiB XOR+RLE compression"),
        source: "apps/web/src/domains/creator/wasm64-creator-defense-healer/zero-token-style-profiler-and-pairing.ts",
      },
      {
        value: "TTL + 0 Art Mutation",
        label: t("무설치 암호화 P2P 일회성 레드라인 검수 오버레이", "Zero-install encrypted TTL P2P redline review overlays"),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/ephemeral-redline-review.ts",
      },
      {
        value: "Gyro · HID · MIDI · DCC",
        label: t("자이로/다이얼 · WebHID/MIDI 시프트 매퍼 · .psd/.glb 매직 헤더 핫싱크", "Gyro dial, WebHID/MIDI shift mapper & .psd/.glb magic-header sync"),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/hardware-companion-dcc.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
