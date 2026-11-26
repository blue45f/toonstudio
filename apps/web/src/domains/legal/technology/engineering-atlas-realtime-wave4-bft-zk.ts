import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · realtime · Wave-4 HyperCore:
 * 1) P2P BFT(`3f + 1`) 상태 검증기 + AEAD 스트리밍 검증기 + ₩0 WebCrypto 머클 타임스탬프 감사 원장
 * 2) WebRTC SCTP 바이너리 델타 · 벡터 클록 조정기 + ₩0 Fiat-Shamir Schnorr 영지식 소유권 증명
 */
export const ENGINEERING_ATLAS_REALTIME_WAVE4_BFT_ZK: readonly EngineeringAtlasEntry[] = [
  {
    id: "p2p-bft-quorum-merkle-timestamp-audit",
    category: "realtime",
    name: "P2P BFT Quorum · AEAD Stream · ₩0 Merkle Audit",
    title: t("P2P BFT 정족수 · AEAD 청크 스트림 · ₩0 머클 시점 감사", "P2P BFT quorum, AEAD stream verifier & ₩0 Merkle audit"),
    status: "experimental",
    tagline: t(
      "3f+1 비잔틴 이중투표·오염 청크를 OPFS 기록 전에 차단하고 가스비 ₩0 머클 영수증으로 창작 시점을 증명합니다.",
      "Blocks 3f+1 Byzantine equivocation and poisoned AEAD chunks pre-OPFS while sealing ₩0 Merkle timestamp receipts.",
    ),
    background: [
      t(
        "무서버 P2P 공동 작업에서는 손상되거나 악의적인 피어가 서로 다른 델타를 보내는 이중 투표(Equivocation)나 스트리밍 중 오염된 에셋 청크로 로컬 저장소를 망가뜨릴 수 있습니다. 또한 창작 시점 증명을 퍼블릭 블록체인에 올리면 건당 가스비가 발생합니다.",
        "In serverless P2P sessions, faulty peers can equivocate on state deltas or inject mid-stream corrupted asset chunks, while public blockchains charge gas fees per timestamp.",
      ),
      t(
        "P2pBftStateValidator(p2p-bft-timestamp-audit.ts)는 N ≥ 3f+1 로스터에서 이중 투표 및 해시 불일치 피어를 즉시 격리하고 정직 피어 2f+1 정족수가 모였을 때만 상태를 전이합니다. ChunkAuthenticatedAssetStreamVerifier(hybrid-compute-shadow-ink-meshlet.ts)는 청크별 AES-256-GCM(96비트 순차 논스+AAD)과 머클 루트를 검증해 오염 청크를 OPFS 쓰기 전에 거절합니다.",
        "P2pBftStateValidator quarantines equivocating or corrupted peers and commits only at 2f+1 quorum, while ChunkAuthenticatedAssetStreamVerifier checks per-chunk AES-256-GCM tags and Merkle roots before any OPFS write.",
      ),
      t(
        "ZeroFeeTimestampAuditLog 는 WebCrypto(Ed25519 우선, ECDSA P-256 자동 폴백) 서명과 SHA-256 해시체인을 머클 에포크 트리로 봉인해 O(log N) 오프라인 검증 영수증을 발급합니다. 현재 구현(Current): 단위 검증 완료(가스비 ₩0, 초기 번들 0B). 향후 목표(Target): 팀 룸 원장 내보내기 메뉴에 연결합니다.",
        "ZeroFeeTimestampAuditLog chains SHA-256 revisions signed via WebCrypto (Ed25519 with ECDSA P-256 fallback) into Merkle epochs for offline verification at ₩0 gas. Current: unit-verified (0 B eager). Target: surface in team audit export.",
      ),
    ],
    keyPoints: [
      t("3f+1 BFT 정족수(2f+1 합의) · 이중 투표 피어 증거 수집 및 격리", "3f+1 BFT quorum (2f+1 commit) with equivocation quarantine"),
      t("AES-256-GCM + AAD + 머클 스트림 검증으로 OPFS 기록 전 오염 차단", "AES-256-GCM + AAD + Merkle stream check prior to OPFS write"),
      t("가스비 ₩0 WebCrypto Ed25519/ECDSA + SHA-256 해시체인 · 머클 봉인", "₩0 WebCrypto Ed25519/ECDSA + SHA-256 chain & Merkle epoch seal"),
      t("네트워크·서버 없이 1비트 변조까지 잡아내는 오프라인 영수증 검증", "Offline receipt verification catching single-bit tampering"),
    ],
    diagram: {
      id: "p2p-bft-quorum-merkle-timestamp-audit-diagram",
      kind: "sequence",
      title: t("P2P BFT 정족수 검증 · AEAD 스트림 차단 · ₩0 머클 봉인", "P2P BFT quorum, AEAD stream guard & ₩0 Merkle sealing"),
      caption: t(
        "비잔틴 이중 투표와 오염 청크를 입구에서 걸러 내고 확정된 개정본만 머클 에포크 영수증으로 봉인합니다.",
        "Quarantines equivocation and poisoned chunks upfront, sealing committed revisions into offline Merkle receipts.",
      ),
      alt: t(
        "피어들이 상태 투표와 암호화 청크를 보내면 BFT 검증기가 이중 투표 피어를 격리하고 2f+1 정족수를 확인하며, AEAD 검증기가 오염 청크를 OPFS 기록 전에 차단한 뒤, 감사 원장이 WebCrypto 서명 머클 영수증을 발급합니다.",
        "Peers submit votes and AEAD chunks; the BFT validator quarantines equivocators and confirms 2f+1 quorum, the AEAD verifier blocks tampered chunks before OPFS, and the audit log emits a signed Merkle receipt.",
      ),
      actors: [
        { id: "peer", label: t("협업 피어", "Peers"), sub: t("델타 투표 · 청크 송신", "Votes & AEAD chunks"), tone: "remote" },
        { id: "bft", label: t("BFT 검증기", "BFT validator"), sub: t("3f+1 · 2f+1 정족수", "3f+1, 2f+1 quorum"), tone: "good" },
        { id: "aead", label: t("AEAD 스트림 가드", "AEAD stream guard"), sub: t("AES-GCM + 머클 루트", "AES-GCM + Merkle"), tone: "warn" },
        { id: "log", label: t("₩0 시점 감사 원장", "₩0 audit log"), sub: t("Ed25519 · 해시체인", "Ed25519, hash chain"), tone: "local" },
      ],
      messages: [
        { from: "peer", to: "bft", label: t("에포크·시퀀스 다이제스트 투표", "Submit epoch/seq digest votes") },
        { from: "bft", to: "bft", label: t("이중 투표 격리 · 2f+1 정족수 확정", "Quarantine equivocator, commit 2f+1") },
        { from: "peer", to: "aead", label: t("AES-256-GCM 에셋 청크 스트리밍", "Stream AES-256-GCM asset chunks") },
        { from: "aead", to: "log", label: t("태그·머클 통과 청크만 승인", "Admit verified chunks only"), note: t("오염 청크 0B 기록", "0 B written on poison") },
        { from: "log", to: "peer", label: t("오프라인 검증 머클 영수증 발급", "Emit offline Merkle proof receipt"), style: "dashed", note: t("가스비 ₩0", "₩0 gas fee") },
      ],
    },
    usage: [
      {
        feature: t("P2P BFT 상태 다이제스트 검증기 & ₩0 머클 타임스탬프 원장", "P2P BFT state validator & ₩0 Merkle timestamp ledger"),
        role: t(
          "실험 모듈에서 이중 투표 격리와 WebCrypto 서명 영수증 발급·검증을 확인했습니다. /studio 팀 작업 연결은 후속 단계입니다.",
          "Module tests cover equivocation handling and WebCrypto receipt issuance and verification. Integration into /studio collaboration is a follow-up.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/p2p-bft-timestamp-audit.ts",
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/wasm64-wave4-hypercore.test.ts",
        ],
      },
      {
        feature: t("청크 인증 AEAD 대용량 에셋 스트리밍 검증기", "Chunk-authenticated AEAD large-asset stream verifier"),
        role: t(
          "청크별 AES-256-GCM 태그·순차 논스·AAD 와 최종 머클 루트를 대조해 오염 청크의 저장소 기록을 원천 차단합니다.",
          "Verifies per-chunk AES-256-GCM tags, sequential nonces, AAD and stream Merkle root before storage writes.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/hybrid-compute-shadow-ink-meshlet.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("3f+1 BFT 정족수 임계값 및 이중 투표 감지 규칙", "3f+1 BFT quorum threshold & equivocation check"),
        language: "ts",
        ...sampleSource([
          ["export function requiredBftQuorum(totalPeers: number, maxFaulty: number): number {"],
          ["  if (totalPeers < 3 * maxFaulty + 1) throw new RangeError('insufficient peers');"],
          ["  return 2 * maxFaulty + 1;", "정직 과반 교집합을 보장하는 최소 정족수", "minimum quorum guaranteeing honest intersection"],
          ["}"],
          ["export function isEquivocatingVote(priorDigest: string | undefined, nextDigest: string): boolean {"],
          ["  return priorDigest !== undefined && priorDigest !== nextDigest;"],
          ["}"],
        ]),
        explain: t(
          "실제 P2pBftStateValidator 는 이중 투표가 적발된 피어의 기존 표까지 즉시 회수해 비잔틴 노드가 정족수에 기여하지 못하게 막습니다.",
          "P2pBftStateValidator also revokes any prior vote cast by an equivocating peer so Byzantine nodes cannot contribute to quorum.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave4-hypercore/p2p-bft-timestamp-audit.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · SubtleCrypto: sign() & verify() (Ed25519 / ECDSA)",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign",
        kind: "docs",
        note: t("브라우저 표준 WebCrypto 전자서명 및 AES-GCM 복호화 검증 API", "Standard WebCrypto digital signature and AEAD API"),
      },
      {
        title: "RFC 6962 · Certificate Transparency (Merkle Hash Trees)",
        url: "https://datatracker.ietf.org/doc/html/rfc6962",
        kind: "spec",
        note: t("리프(0x00)·내부 노드(0x01) 도메인 분리 머클 감사 트리 설계 기준", "Domain-separated leaf/interior Merkle audit tree specification"),
      },
    ],
    chapterIds: ["collaborative-crdt-boundary", "webrtc-media-authority"],
    talk: {
      pitch: t(
        "퍼블릭 블록체인 가스비 한 푼 없이 WebCrypto 서명 해시체인과 머클 에포크로 창작 시점을 봉인하고, 3f+1 BFT 정족수와 AES-256-GCM 청크 검증으로 악성 피어 오염을 원천 차단합니다.",
        "Seals creation timestamps with zero gas fees via WebCrypto Merkle epochs while blocking malicious peer tampering through 3f+1 BFT quorum and AES-256-GCM chunk checks.",
      ),
      analogy: t(
        "공증 사무소에 매번 수수료를 내는 대신 작가의 인감 전자서명과 쪽번호 사슬(해시체인)을 묶어 보관하고, 택배 상자(청크)마다 봉인 스티커(AES-GCM)를 확인한 뒤 창고(OPFS)에 들이는 검수소입니다.",
        "Like notarizing pages with your own digital seal and page-hash chain at zero fee while checking tamper seals on every parcel before shelving it.",
      ),
      questions: [
        {
          question: t("Ed25519 를 아직 지원하지 않는 브라우저에서는 서명이 실패하나요?", "Does signing fail on browsers without Ed25519?"),
          answer: t(
            "generateCreatorAuditIdentity 가 Ed25519 지원 여부를 먼저 확인하고 미지원 런타임에서는 표준 ECDSA P-256(SHA-256)으로 자동 전환합니다.",
            "generateCreatorAuditIdentity probes Ed25519 first and seamlessly falls back to standard ECDSA P-256 with SHA-256.",
          ),
        },
      ],
    },
    technologies: ["Web Crypto API", "SubtleCrypto", "AES-GCM", "SHA-256", "WebRTC"],
    reviewedAt: "2026-11-26",
  },
  {
    id: "webrtc-sctp-vector-clock-zk-ownership",
    category: "realtime",
    name: "SCTP Delta · Vector Clock · ₩0 ZK Ownership",
    title: t("WebRTC SCTP 델타 · 벡터 클록 · ₩0 영지식 원고 소유권 증명", "WebRTC SCTP delta, vector clock & ₩0 ZK ownership proof"),
    status: "experimental",
    tagline: t(
      "16KiB SCTP XOR-RLE 차분·벡터 클록으로 동기화하고 비밀 시드 노출 없이 원고 소유권을 영지식 증명합니다.",
      "Syncs via 16 KiB SCTP XOR-RLE deltas & vector clocks, proving manuscript ownership in zero knowledge without exposing seeds.",
    ),
    background: [
      t(
        "크로스플랫폼 직접 동기화에서는 SCTP 메시지 크기 한도(16 KiB)와 패킷 순서 역전을 견뎌야 하며, 미공개 원고 분쟁 시에는 작가의 비밀 마스터 시드를 제3자 서버에 노출하지 않고도 소유권을 입증할 수 있어야 합니다.",
        "Direct cross-platform sync must survive 16 KiB SCTP frame caps and out-of-order delivery, while ownership disputes require proving authorship without revealing secret seeds.",
      ),
      t(
        "webrtc-delta-and-zk-ownership.ts 는 XOR-RLE 바이너리 차분 압축과 20바이트 체크섬 헤더 기반 SCTP 역순 재조립기(SctpDeltaReassembler), 그리고 인과 선후(before/after)와 동시 편집(concurrent)을 판별해 전순서 타이브레이커로 수렴시키는 벡터 클록 조정기를 제공합니다.",
        "webrtc-delta-and-zk-ownership.ts pairs XOR-RLE binary deltas and out-of-order SCTP reassembly with a vector-clock coordinator that deterministically resolves concurrent edits.",
      ),
      t(
        "proveZkManuscriptOwnership / verifyZkManuscriptOwnership 은 안전 소수군 위에서 Fiat-Shamir 비대화형 Schnorr 영지식 증명(NIZKPoK)을 ES2017 호환 BigInt 거듭제곱으로 수행합니다. 비밀 시드 s 를 전혀 전송하지 않고도 검증자 논스에 묶인 소유권을 ₩0 무서버로 입증합니다(Current: 단위·공격자/재전송 거절 검증 완료, Target: 작품 공유 증명서 UI 연동).",
        "proveZkManuscriptOwnership and verifyZkManuscriptOwnership run Fiat-Shamir non-interactive Schnorr NIZKPoK over a safe prime subgroup using ES2017-compatible BigInt math at ₩0 server cost (Current: verified against impostor & replay attacks; Target: share-certificate UI).",
      ),
    ],
    keyPoints: [
      t("XOR-RLE 차분 압축(40KB 중 국소 수정 시 98%+ 절감) 및 SCTP 역순 재조립", "XOR-RLE delta (>98% savings on localized edits) & SCTP reassembly"),
      t("벡터 클록 인과 관계 판정 및 결정론적 동시 편집 충돌 수렴", "Vector-clock causality & deterministic concurrent tie-breaking"),
      t("비밀 시드 s 무노출 Fiat-Shamir Schnorr 비대화형 영지식 증명", "Zero-seed-exposure Fiat-Shamir Schnorr NIZKPoK ownership proof"),
      t("검증자 논스 바인딩으로 위조 시드·리플레이(재전송) 공격 100% 차단", "Verifier-nonce binding blocks impostor seeds and replay attacks"),
    ],
    diagram: {
      id: "webrtc-sctp-vector-clock-zk-ownership-diagram",
      kind: "sequence",
      title: t("SCTP 델타 · 벡터 클록 수렴 및 Fiat-Shamir 영지식 증명", "SCTP delta, vector-clock convergence & Fiat-Shamir ZK proof"),
      caption: t(
        "DataChannel 로는 압축 차분과 벡터 클록만 오가고, 소유권 검증에는 비밀 시드 대신 Schnorr 영지식 증명만 전달됩니다.",
        "Exchanges compressed deltas and vector clocks on DataChannel while proving ownership via Schnorr NIZKPoK without revealing the seed.",
      ),
      alt: t(
        "작가 기기가 XOR-RLE 16KiB 청크와 벡터 클록을 상대 기기와 동기화해 동시 편집을 수렴시키고, 검증자가 챌린지 논스를 보내면 비밀 시드 s 노출 없이 공개 커밋먼트 Y 와 (T, c, z) 증명만으로 소유권을 확인합니다.",
        "Author devices sync 16 KiB XOR-RLE chunks and vector clocks, then answer a verifier challenge nonce with a Schnorr (T, c, z) proof verified against public commitment Y without exposing secret s.",
      ),
      actors: [
        { id: "author", label: t("작가 기기", "Author peer"), sub: t("비밀 시드 s 보관", "Keeps secret seed s"), tone: "local" },
        { id: "sctp", label: t("SCTP 델타 · VC", "SCTP & VecClock"), sub: t("16KiB · XOR-RLE", "16 KiB, XOR-RLE"), tone: "good" },
        { id: "verifier", label: t("오프라인 검증자", "Verifier"), sub: t("공개 커밋먼트 Y", "Public commitment Y"), tone: "remote" },
      ],
      messages: [
        { from: "author", to: "sctp", label: t("XOR-RLE 델타 청크 + 벡터 클록 전송", "Send XOR-RLE chunks + vector clock") },
        { from: "sctp", to: "author", label: t("역순 재조립 · 동시 편집 결정적 수렴", "Reassemble & converge concurrent state"), style: "dashed" },
        { from: "verifier", to: "author", label: t("일회용 검증 챌린지 논스 전달", "Issue one-time challenge nonce") },
        { from: "author", to: "verifier", label: t("Schnorr 증명 (T, c, z) 반환 (s 미포함)", "Return Schnorr (T, c, z) without s") },
        { from: "verifier", to: "verifier", label: t("g^z ≡ T · Y^c (mod p) 등식 확인", "Verify g^z === T * Y^c (mod p)"), note: t("서버비 ₩0", "₩0 server cost") },
      ],
    },
    usage: [
      {
        feature: t("WebRTC SCTP 델타 재조립기 · 벡터 클록 · Schnorr 영지식 증명기", "WebRTC SCTP delta reassembler, vector clock & Schnorr ZK prover"),
        role: t(
          "실험 모듈에서 16 KiB 청크 재조립, 벡터 클록 판정과 영지식 증명 검사를 확인했습니다. /studio 공유 화면 연결은 후속 단계입니다.",
          "Module tests cover reassembly of 16 KiB chunks, vector-clock ordering and zero-knowledge proof verification. Integration into /studio sharing is a follow-up.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/webrtc-delta-and-zk-ownership.ts",
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/wasm64-wave4-hypercore.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("ES2017 호환 BigInt 모듈러 거듭제곱 및 Schnorr 검증식", "ES2017-compatible BigInt modPow & Schnorr check"),
        language: "ts",
        ...sampleSource([
          ["export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {"],
          ["  let res = BigInt(1), b = base % mod, e = exp;"],
          ["  while (e > BigInt(0)) {"],
          ["    if ((e & BigInt(1)) === BigInt(1)) res = (res * b) % mod;"],
          ["    e >>= BigInt(1); b = (b * b) % mod;"],
          ["  }"],
          ["  return res;"],
          ["}"],
        ]),
        explain: t(
          "루트 tsconfig(ES2017) 호환을 위해 리터럴 0n 대신 BigInt() 생성자만 사용하며, 검증자는 g^z mod p === (T * Y^c) mod p 등식으로 소유권을 확인합니다.",
          "Uses BigInt() constructors instead of ES2020 literals for tsconfig compatibility, checking g^z mod p === (T * Y^c) mod p.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave4-hypercore/webrtc-delta-and-zk-ownership.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "RFC 8235 · Schnorr Non-Interactive Zero-Knowledge Proof",
        url: "https://datatracker.ietf.org/doc/html/rfc8235",
        kind: "spec",
        note: t("Fiat-Shamir 해시 챌린지 기반 비대화형 Schnorr 영지식 증명 표준", "Standard for Fiat-Shamir non-interactive Schnorr NIZK proofs"),
      },
      {
        title: "MDN · RTCDataChannel (SCTP Message Framing)",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel",
        kind: "docs",
        note: t("브라우저 간 직접 바이너리 델타 전송 채널 명세", "Browser-to-browser binary DataChannel transport reference"),
      },
    ],
    chapterIds: ["webrtc-media-authority", "collaborative-crdt-boundary"],
    talk: {
      pitch: t(
        "단위 테스트에서 Fiat-Shamir Schnorr 증명의 검증, 16 KiB 바이너리 델타 재조립, 벡터 클록의 동시 편집 판정을 각각 확인했습니다.",
        "Unit tests cover Fiat-Shamir Schnorr proof verification, reassembly of 16 KiB binary deltas and vector-clock ordering of concurrent edits.",
      ),
      analogy: t(
        "금고 비밀번호를 말하지 않고도 내가 금고 주인임을 매번 새 난수 질문으로 증명하는 마술 열쇠(영지식 증명)와 같습니다.",
        "Like proving you know a safe's combination against a fresh challenge without ever speaking a single digit aloud.",
      ),
      questions: [
        {
          question: t("누군가 이전 영지식 증명 패킷을 가로채서 그대로 재전송하면 어떻게 되나요?", "What if an attacker replays a captured ZK proof packet?"),
          answer: t(
            "Fiat-Shamir 해시 입력에 검증자의 일회용 챌린지 논스와 원고 SHA-256 다이제스트가 함께 묶여 있어, 다른 세션이나 다른 원고에 재사용하면 즉시 거절됩니다.",
            "The Fiat-Shamir challenge hashes both the verifier's fresh nonce and the manuscript SHA-256, immediately rejecting replays.",
          ),
        },
      ],
    },
    technologies: ["WebRTC", "RTCDataChannel", "SCTP", "SHA-256", "TypeScript"],
    reviewedAt: "2026-11-26",
  },
];
