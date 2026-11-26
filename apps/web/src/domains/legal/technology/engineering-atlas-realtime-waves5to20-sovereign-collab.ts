import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · realtime · Waves 5·7·8·9·20 무서버 CRDT 수렴 검증·종단 암호화·다중서명·로열티·WOTS+ 출고 공증 2종 카드.
 */
export const ENGINEERING_ATLAS_REALTIME_WAVES5TO20_SOVEREIGN_COLLAB: readonly EngineeringAtlasEntry[] = [
  {
    id: "wave5-to-9-crdt-fuzzer-hlc-ecdh-zero-server",
    category: "realtime",
    name: "Waves 5·8·9 CRDT ddmin Fuzzer · HLC Spacetime · ECDH E2EE",
    title: t(
      "Waves 5·8·9 ddmin CRDT 수렴 퍼저 · HLC 시공간 CRDT · 무묘비 RGA & ECDH P2P 검증",
      "Waves 5·8·9 ddmin CRDT fuzzer, HLC spacetime CRDT, tombstoneless RGA & ECDH P2P",
    ),
    status: "experimental",
    tagline: t(
      "ddmin 반례 축소 퍼저, HLC+벡터시계 시공간 타임트래블, 무묘비 RGA 메모리 조각 모음, ECDH+AES-GCM P2P 검증을 묶었습니다.",
      "Unites ddmin CRDT fuzzing, HLC+VectorClock time-travel, tombstoneless run-coalesced RGA and ECDH+AES-GCM P2P cut verification.",
    ),
    background: [
      t(
        "실시간 공동 작화에서는 패킷 역전·중복·장시간 오프라인 후 재결합 시 복제본 간 상태가 1픽셀이라도 갈라지면 안 되며, 수만 번의 지우기·되돌리기가 쌓일 때 전통적 CRDT 묘비(Tombstone) 메타데이터가 메모리를 잠식하는 문제도 해결해야 합니다.",
        "Collaborative drawing cannot tolerate replica divergence under packet reordering or offline merges, nor can long sessions afford unbounded CRDT tombstone memory growth.",
      ),
      t(
        "Wave 5 deterministic-fuzzer-daltonizer.ts 는 시드 고정 xoshiro128** 퍼저와 델타 디버깅(ddmin) 최소 반례 축소기로 4대 수렴 불변식을 검증하고, Wave 8 spacetime-continuum-crdt.ts 는 하이브리드 논리 시계(HLC)와 벡터 시계로 임의 시점 타임트래블·인과 분기 감지를 지원합니다.",
        "Wave 5 stress-tests 4 convergence invariants with seeded xoshiro128** fuzzing and ddmin shrinking, while Wave 8 pairs Hybrid Logical Clocks with vector clocks for causal time-travel.",
      ),
      t(
        "Wave 9 neural-tex-defrag-p2p-e2ee.ts 는 정족수 확인이 끝난 삭제 구간을 병합·회수하는 연속 실행 병합형 무묘비 시퀀스 CRDT와 중계 서버 비용 ₩0의 ECDH(P-256)+HKDF+AES-GCM-256 및 머클 타일 증명 채널을 구현했습니다(Current: 단위 검증 완료·0B 번들, Target: 멀티 피어 스튜디오 룸 보조 레인 연동).",
        "Wave 9 adds a quorum-compacting RunCoalescedSequenceCrdt and a ₩0 serverless ECDH/HKDF/AES-GCM-256 + Merkle tile verification channel at 0 B eager impact (Current: unit-verified; Target: multi-peer studio room lane wiring).",
      ),
    ],
    keyPoints: [
      t("xoshiro128** 결정론적 네트워크 장애 주입 & ddmin 최소 반례 축소기", "Seeded xoshiro128** fault injection & ddmin counterexample shrinker"),
      t("HLC + 벡터 시계 결합 시공간 타임트래블 및 동시 편집 분기 탐지", "HLC + VectorClock spacetime replay & concurrent branch detection"),
      t("연속 런(Run) 병합 · 정족수 확인 기반 무묘비(Tombstoneless) 시퀀스 CRDT", "Run-coalesced, quorum-compacted tombstoneless sequence CRDT"),
      t("무서버 ECDH+HKDF+AES-GCM-256 종단 암호화 & 컷 타일 머클 검증", "Serverless ECDH+HKDF+AES-GCM-256 E2EE & cut-tile Merkle proofs"),
    ],
    diagram: {
      id: "wave5-to-9-crdt-fuzzer-hlc-ecdh-zero-server-diagram",
      kind: "graph",
      title: t("무서버 종단 암호화 P2P 전송과 무묘비 시공간 CRDT 수렴 구조", "Serverless E2EE P2P transport & tombstoneless spacetime CRDT flow"),
      caption: t(
        "혼돈 네트워크 퍼저로 검증된 HLC·무묘비 CRDT 연산이 ECDH+AES-GCM 암호화 봉투와 머클 증명으로 교환됩니다.",
        "Fuzz-hardened HLC & run-coalesced CRDT ops travel inside ECDH+AES-GCM envelopes with Merkle tile proofs.",
      ),
      alt: t(
        "좌측 작가 피어의 HLC 시공간 CRDT와 무묘비 런 병합기가 연산을 만들면, 위쪽 ddmin 수렴 퍼저가 불변식을 보증하고, 가운데 ECDH+AES-GCM 및 머클 증명 채널을 거쳐 우측 동료 피어 복제본에 동일 상태로 수렴합니다.",
        "Author peer HLC & run-coalesced CRDT operations pass ddmin invariant checks and cross an ECDH+AES-GCM + Merkle channel to converge identically on collaborator replicas.",
      ),
      nodes: [
        { id: "hlc", label: t("HLC 시공간 CRDT", "HLC spacetime"), sub: t("인과 순서 · 타임트래블", "Causal order & replay"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "rga", label: t("무묘비 런 병합", "Run-coalesced RGA"), sub: t("삭제 묘비 정족수 회수", "Quorum tombstone GC"), tone: "good", at: [1, 0] },
        { id: "fuz", label: t("ddmin 수렴 퍼저", "ddmin CRDT fuzzer"), sub: t("역전·중복 반례 축소", "Reorder/dup shrinking"), tone: "warn", at: [1, 2] },
        { id: "e2e", label: t("ECDH · 머클 채널", "ECDH & Merkle P2P"), sub: t("AES-GCM-256 · ₩0 직통", "AES-GCM-256, ₩0 relay"), tone: "good", at: [2, 1] },
      ],
      edges: [
        { from: "hlc", to: "rga", label: t("연속 획", "Run ops") },
        { from: "hlc", to: "fuz", label: t("혼돈 주입", "Chaos") },
        { from: "rga", to: "e2e", label: t("암호 봉투", "AEAD") },
        { from: "fuz", to: "e2e", label: t("수렴 보증", "Verified") },
      ],
    },
    usage: [
      {
        feature: t("결정론적 CRDT 수렴 퍼저 · HLC+벡터시계 시공간 컨티뉴엄 엔진", "Deterministic CRDT fuzzer & HLC+VectorClock spacetime engine"),
        role: t(
          "패킷 유실·순서 뒤바뀜 시나리오에서 4대 불변식 위반을 자동 축소하고 HLC·벡터시계로 인과 이력을 재구성합니다.",
          "Shrinks packet-chaos invariant failures via ddmin and reconstructs causal stroke timelines via HLC + vector clocks.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave5-frontier/deterministic-fuzzer-daltonizer.ts",
          "apps/web/src/domains/creator/wasm64-wave8-singularity/spacetime-continuum-crdt.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("무묘비 런 병합 시퀀스 CRDT & 무서버 ECDH/AES-GCM 머클 P2P 채널", "Tombstoneless run-coalesced CRDT & serverless ECDH/AES-GCM Merkle channel"),
        role: t(
          "연속 삽입 구간을 단일 런으로 합쳐 삭제 묘비를 정족수 이후 제거하고 종단 암호화된 타일·머클 증명을 검증합니다.",
          "Coalesces contiguous runs, purges acked tombstones and verifies ECDH/HKDF/AES-GCM-256 encrypted Merkle tiles.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave9-zenith/neural-tex-defrag-p2p-e2ee.ts",
          "apps/web/src/domains/creator/wasm64-wave9-zenith/wasm64-wave9-zenith.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("하이브리드 논리 시계(HLC) 수신 이벤트 단조 전진 규칙", "Hybrid Logical Clock (HLC) monotonic receive step"),
        language: "ts",
        ...sampleSource([
          ["export interface HlcStamp { readonly wallMs: number; readonly logical: number; readonly node: string }"],
          ["export function stepHlcReceive(local: HlcStamp, remote: HlcStamp, nowWallMs: number): HlcStamp {"],
          ["  const nextWall = Math.max(nowWallMs, local.wallMs, remote.wallMs);"],
          ["  const nextLogical = nextWall === local.wallMs && nextWall === remote.wallMs"],
          ["    ? Math.max(local.logical, remote.logical) + 1"],
          ["    : nextWall === local.wallMs ? local.logical + 1 : nextWall === remote.wallMs ? remote.logical + 1 : 0;"],
          ["  return { wallMs: nextWall, logical: nextLogical, node: local.node };", "시계 오차가 있어도 인과 역전 없는 전순서 보장", "preserves causal order despite wall-clock skew"],
          ["}"],
        ]),
        explain: t(
          "spacetime-continuum-crdt.ts 는 HLC 전순서와 피어별 벡터 시계를 함께 유지해 두 작가가 같은 컷을 오프라인에서 동시에 고친 분기(Concurrent Branch)를 정확히 집어냅니다.",
          "spacetime-continuum-crdt.ts pairs HLC total ordering with vector clocks to pinpoint concurrent offline edits on the same cut.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave8-singularity/spacetime-continuum-crdt.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Murat Demirbas et al. · Logical Physical Clocks and Consistent Snapshots (HLC)",
        url: "https://cse.buffalo.edu/tech-reports/2014-04.pdf",
        kind: "article",
        note: t("물리 시계 근접성과 논리 인과 순서를 결합한 HLC 원전 보고서", "Original technical report defining Hybrid Logical Clocks"),
      },
      {
        title: "MDN · SubtleCrypto deriveKey (ECDH + HKDF + AES-GCM)",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey",
        kind: "docs",
        note: t("브라우저 표준 WebCrypto 종단 간 세션 키 유도 API", "WebCrypto API for deriving E2EE AES-GCM session keys via ECDH"),
      },
    ],
    chapterIds: ["collaborative-crdt-boundary", "webrtc-media-authority"],
    talk: {
      pitch: t(
        "수천 번 패킷이 뒤집히는 혼돈 시험을 통과한 시공간 CRDT 위에서, 묘비 메모리 누수 없이 중계 서버도 원고를 들여다볼 수 없는 종단 암호화 협업을 지향합니다.",
        "Runs fuzz-proven spacetime CRDTs with zero tombstone leaks and end-to-end encrypted P2P tile proofs opaque to any relay.",
      ),
      analogy: t(
        "편지 순서가 뒤죽박죽 도착해도 앞뒤 맥락대로 정확히 끼워 맞추고, 모두 읽은 지우개 흔적은 깔끔히 비우는 암호 무전기와 같습니다.",
        "Like an encrypted walkie-talkie notebook that sorts out-of-order edits automatically and sweeps away old eraser crumbs once everyone agrees.",
      ),
      questions: [
        {
          question: t("삭제 묘비(Tombstone)를 함부로 지우면 오프라인 피어가 돌아왔을 때 유령 데이터가 되살아나지 않나요?", "Doesn't deleting CRDT tombstones resurrect zombie items when offline peers rejoin?"),
          answer: t(
            "모든 참여 피어의 관측 시계 최솟값(Causal Stability Frontier)보다 오래된 삭제 런만 병합·제거하므로, 아직 전달받지 못한 피어가 남아 있는 동안에는 묘비를 절대 치우지 않습니다.",
            "Tombstones are compacted only behind the causal stability frontier acknowledged by all registered peers, preventing zombie resurrection.",
          ),
        },
      ],
    },
    technologies: ["CRDT", "HLC", "ddmin Fuzzing", "WebCrypto ECDH", "AES-GCM-256"],
    facts: [
      { value: "4 invariants", label: t("ddmin 퍼저가 검증하는 CRDT 수렴·멱등 불변식", "CRDT convergence & idempotency invariants"), source: "apps/web/src/domains/creator/wasm64-wave5-frontier/deterministic-fuzzer-daltonizer.ts" },
      { value: "256-bit", label: t("ECDH+HKDF 유도 무서버 P2P AES-GCM 세션 키", "ECDH+HKDF derived P2P AES-GCM key length"), source: "apps/web/src/domains/creator/wasm64-wave9-zenith/neural-tex-defrag-p2p-e2ee.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "wave7-to-20-multisig-royalty-wots-attestation",
    category: "realtime",
    name: "Waves 7·8·20 M-of-N Co-Sign · 10,000 bps Royalty · WOTS+ Release Gate",
    title: t(
      "Waves 7·8·20 M-of-N 공동 서명 · 10,000bps 정산 원장 & 양자내성 WOTS+ 통합 출고 게이트",
      "Waves 7·8·20 M-of-N co-signing, 10,000 bps royalty split & post-quantum WOTS+ gate",
    ),
    status: "experimental",
    tagline: t(
      "M-of-N 출고 승인 서명, 1원 오차 없는 10,000bps 지분 매니페스트, 양자내성 WOTS+ 봉인과 6채널 통합 출고 인증서를 제공합니다.",
      "Delivers M-of-N release co-signing, exact 10,000 bps royalty splits, post-quantum WOTS+ provenance seals and 6-channel release certificates.",
    ),
    background: [
      t(
        "글·그림·채색·식자 담당이 나뉜 스튜디오 연재에서는 최종 원고 출고 전 정해진 인원(M-of-N)의 승인이 필요하고, 지분 정산에서 부동소수점 반올림 오차로 1원이라도 합계가 어긋나선 안 되며, 미래 양자컴퓨터 환경에서도 깨지지 않는 출처 증명과 개인정보(PII) 유출 차단이 요구됩니다.",
        "Multi-author studios need threshold M-of-N sign-off before episode release, deterministic zero-rounding-loss revenue splits, PII leak blocking and quantum-resilient authorship seals.",
      ),
      t(
        "Wave 7 bvh-colorize-lod-cosign.ts 는 오프라인 WebCrypto ECDSA 기반 역할별 M-of-N 임계치 공동 서명 게이트를, Wave 8 voiceface-royalty-manifest.ts 는 합계 10,000 베이시스 포인트(bps = 100.00%) 결정론적 최대 잔여 배분 정산과 서명된 매니페스트 주입·검증을 구현합니다.",
        "Wave 7 enforces offline WebCrypto ECDSA M-of-N threshold co-signing across studio roles, while Wave 8 embeds signed 10,000-bps deterministic largest-remainder royalty split manifests.",
      ),
      t(
        "Wave 20 wots-provenance-pii-scanner.ts 와 omnichannel-master-release-gate.ts 는 순수 해시 사슬 기반 양자내성 Winternitz 일회용 서명(WOTS+, w=16)·선형 시간 한국형 PII/시크릿 스캐너·웹툰/인쇄/모션툰/오디오툰/글로벌 6채널 일괄 감사를 묶어 0~100점 출고 인증서를 발급합니다(Current: 단위 검증 완료, Target: 출판·정산 승인 워크플로 연동).",
        "Wave 20 adds hash-based post-quantum WOTS+ (w=16) provenance seals, linear-time Korean PII/secret scanning and a single-pass 6-channel master release gate issuing 0–100 readiness certificates (Current: unit-verified; Target: publish & settlement gate wiring).",
      ),
    ],
    keyPoints: [
      t("글·선화·채색·PD 역할 기반 오프라인 M-of-N 임계치 공동 서명 승인", "Role-verified offline WebCrypto M-of-N threshold release co-signing"),
      t("10,000 bps(100.00%) 최대 잔여법 무오차 공동 창작 로열티 매니페스트", "Exact 10,000 bps largest-remainder co-creator royalty split manifest"),
      t("순수 SHA-256 해시 사슬 기반 양자내성 Winternitz(WOTS+) 출처 봉인", "Pure SHA-256 hash-chain post-quantum Winternitz (WOTS+) provenance seal"),
      t("한국형 주민·계좌·전화번호 선형 PII 스캔 & 6채널 통합 출고 인증서", "Linear-time Korean PII/secret scan & 6-channel master release certificate"),
    ],
    diagram: {
      id: "wave7-to-20-multisig-royalty-wots-attestation-diagram",
      kind: "sequence",
      title: t("공동 창작 정산 · M-of-N 다중서명 · 양자내성 WOTS+ 출고 봉인 절차", "Royalty manifest, M-of-N co-signing & WOTS+ master release gate"),
      caption: t(
        "지분 합계와 다중서명 정족수, PII·6채널 규격을 모두 통과한 원고에만 양자내성 WOTS+ 출고 인증서가 찍힙니다.",
        "Issues a post-quantum WOTS+ release certificate only after 10,000-bps splits, M-of-N signatures and 6-channel PII/QA checks pass.",
      ),
      alt: t(
        "공동 창작팀이 10,000bps 로열티 매니페스트와 M-of-N 서명을 제출하면 임계치 검증기가 정족수를 확인하고, 통합 출고 게이트가 한국형 PII·CMYK·LUFS 6채널을 감사한 뒤 양자내성 WOTS+ 서명 봉인 인증서를 발급합니다.",
        "Co-creators submit a 10,000-bps royalty manifest and M-of-N signatures; the threshold gate verifies quorum, the master gate audits 6 channels + PII, and WOTS+ seals the release certificate.",
      ),
      actors: [
        { id: "team", label: t("공동 창작팀", "Co-creators"), sub: t("글·그림·채색·PD", "Story, art & PD"), tone: "local" },
        { id: "msig", label: t("M-of-N · 정산", "M-of-N & bps"), sub: t("정족수 · 10,000bps", "Quorum & 10k bps"), tone: "good" },
        { id: "gate", label: t("6채널 출고 감사", "6-channel QA"), sub: t("PII · CMYK · LUFS", "PII, CMYK & LUFS"), tone: "warn" },
        { id: "wots", label: t("WOTS+ 공증 봉인", "WOTS+ seal"), sub: t("양자내성 해시 서명", "Post-quantum hash"), tone: "good" },
      ],
      messages: [
        { from: "team", to: "msig", label: t("원고 해시 + 역할별 ECDSA 서명·지분 제출", "Submit digest, role signatures & bps shares") },
        { from: "msig", to: "gate", label: t("M-of-N 통과 + 10,000bps 무오차 원장 전달", "Pass verified quorum & exact 10,000-bps ledger") },
        { from: "gate", to: "wots", label: t("PII 0건 · 웹툰/인쇄/오디오 기준 통과", "Confirm 0 PII leaks & 6-channel readiness") },
        { from: "wots", to: "team", label: t("WOTS+ 봉인 완료 출고 인증서 반환", "Return WOTS+-sealed release certificate"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("M-of-N 임계치 출고 공동 서명 & 10,000 bps 로열티 분배 매니페스트", "M-of-N release co-signing & 10,000 bps royalty split manifest"),
        role: t(
          "권한 없는 서명자·중복 서명을 걸러 내고, 정수 BigInt 최대 잔여 배분으로 총액과 1원 단위까지 일치하는 정산표를 봉인합니다.",
          "Rejects unauthorized or duplicate signers and seals exact BigInt largest-remainder 10,000-bps payout schedules.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave7-sovereign/bvh-colorize-lod-cosign.ts",
          "apps/web/src/domains/creator/wasm64-wave8-singularity/voiceface-royalty-manifest.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("양자내성 WOTS+ 해시 서명 · 한국형 PII 스캐너 · 6채널 통합 출고 게이트", "Post-quantum WOTS+ seal, Korean PII scanner & omnichannel release gate"),
        role: t(
          "타원곡선 없이 해시 함수만으로 검증되는 WOTS+ 출처 봉인과 선형 시간 PII 탐지 및 6대 배급 채널 통합 검수를 수행합니다.",
          "Seals digests with hash-only WOTS+ signatures while scanning PII and auditing 6 publishing channels in one pass.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave20-grand-finale/wots-provenance-pii-scanner.ts",
          "apps/web/src/domains/creator/wasm64-wave20-grand-finale/omnichannel-master-release-gate.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("10,000 bps(100.00%) 결정론적 최대 잔여법(Hamilton) 무오차 수익 배분", "Exact 10,000-bps Hamilton largest-remainder payout allocation"),
        language: "ts",
        ...sampleSource([
          ["export function splitExactBps(totalKrw: bigint, sharesBps: readonly number[]): readonly bigint[] {"],
          ["  const floors = sharesBps.map((bps) => (totalKrw * BigInt(bps)) / 10000n);"],
          ["  const rems = sharesBps.map((bps, idx) => ({ idx, rem: (totalKrw * BigInt(bps)) % 10000n }));"],
          ["  let left = totalKrw - floors.reduce((acc, v) => acc + v, 0n);"],
          ["  rems.sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : a.idx - b.idx));"],
          ["  const out = [...floors];"],
          ["  for (let i = 0; left > 0n && i < rems.length; i += 1, left -= 1n) out[rems[i]!.idx] = (out[rems[i]!.idx] ?? 0n) + 1n;", "나머지 큰 순서로 1원씩 배정해 총합 100% 일치", "distribute leftover 1-KRW units largest-remainder first"],
          ["  return out;"],
          ["}"],
        ]),
        explain: t(
          "voiceface-royalty-manifest.ts 는 지분 합계가 정확히 10,000 bps 인지 먼저 검사한 뒤 BigInt 정수 연산만으로 배분해 부동소수점 정산 분쟁을 원천 차단합니다.",
          "voiceface-royalty-manifest.ts enforces sum(bps) === 10,000 upfront and computes payouts in pure BigInt arithmetic.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave8-singularity/voiceface-royalty-manifest.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "IETF RFC 8391 · XMSS & WOTS+ Hash-Based Signatures",
        url: "https://datatracker.ietf.org/doc/html/rfc8391",
        kind: "spec",
        note: t("Winternitz 일회용 해시 기반 양자내성 전자서명(WOTS+) 표준 명세", "Standard specification for Winternitz One-Time Signature Plus (WOTS+)"),
      },
      {
        title: "W3C · Web Cryptography API (ECDSA P-256 Sign & Verify)",
        url: "https://www.w3.org/TR/WebCryptoAPI/",
        kind: "spec",
        note: t("M-of-N 공동 서명과 로열티 매니페스트 검증에 쓰이는 브라우저 암호 표준", "Browser cryptography standard backing M-of-N co-signatures"),
      },
    ],
    chapterIds: ["licenses", "content-addressing"],
    talk: {
      pitch: t(
        "블록체인 가스비 0원으로 팀원 M-of-N 출고 결재와 1원 오차 없는 10,000bps 지분 약속, 양자컴퓨터 이후에도 유효한 WOTS+ 해시 봉인까지 원고 파일 안에 새깁니다.",
        "Seals M-of-N team sign-offs, zero-rounding-loss 10,000-bps splits and post-quantum WOTS+ provenance at ₩0 gas fees.",
      ),
      analogy: t(
        "편집장·글·그림 작가 중 약속된 인원이 도장을 찍어야만 열리는 금고와, 끝자리 1원까지 맞춘 정산서, 위조 불가능한 봉인 왁스를 하나로 묶은 출고함입니다.",
        "Like a multi-key studio dispatch lockbox pairing an exact down-to-the-won ledger with tamper-evident post-quantum wax.",
      ),
      questions: [
        {
          question: t("WOTS+ 서명은 왜 '일회용(One-Time)' 키 파생으로 운용해야 하나요?", "Why must each WOTS+ signature use a fresh one-time key seed?"),
          answer: t(
            "같은 WOTS+ 개인키로 서로 다른 두 메시지에 서명하면 해시 사슬 중간값이 노출되어 위조 위험이 생기므로, 매 릴리스 다이제스트마다 고유 에포크 시드에서 일회용 키쌍을 파생합니다.",
            "Signing two distinct digests with one WOTS+ key reveals intermediate chain links, so each release derives a fresh per-epoch keypair.",
          ),
        },
      ],
    },
    technologies: ["WOTS+ (RFC 8391)", "WebCrypto ECDSA", "BigInt Ledger", "PII Scanner"],
    facts: [
      { value: "10,000 bps", label: t("공동 창작 수익 지분 정밀도 기준 (0.01% 단위)", "Basis-point royalty precision (100.00%)"), source: "apps/web/src/domains/creator/wasm64-wave8-singularity/voiceface-royalty-manifest.ts" },
      { value: "w = 16 (67 chains)", label: t("SHA-256 기반 양자내성 WOTS+ 서명 사슬 구성", "Post-quantum WOTS+ base-16 hash chains"), source: "apps/web/src/domains/creator/wasm64-wave20-grand-finale/wots-provenance-pii-scanner.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
];
