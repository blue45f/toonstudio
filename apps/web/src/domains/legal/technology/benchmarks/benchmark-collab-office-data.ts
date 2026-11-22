import {
  BENCHMARK_SNAPSHOT_DATE,
  type BenchmarkCell,
  type BenchmarkDataset,
  type BenchmarkSupportLevel,
  type BenchmarkToolProfile,
} from "./benchmark-types";

const t = (ko: string, en: string) => ({ ko, en });

const c = (
  level: BenchmarkSupportLevel,
  ko: string,
  en: string,
): BenchmarkCell => ({ level, summary: { ko, en } });

const COLLAB_TOOLS: readonly BenchmarkToolProfile[] = [
  {
    id: "toonstudio",
    name: "ToonStudio",
    shortName: "ToonStudio",
    role: t("Yjs CRDT 오프라인 우선 웹툰 협업 + 가상 스튜디오", "Offline-first Yjs CRDT webtoon collaboration & virtual studio"),
    pricing: t("베타 전 기능 ₩0 (팀 좌석 비용 없음)", "KRW 0 beta (no per-seat fee)"),
    platform: t("무설치 웹 브라우저 (OPFS + SQLite)", "Zero-install web browser (OPFS + SQLite)"),
    benchmarkTakeaway: t(
      "동시 드로잉·리뷰 핀·분업 OS·2D/3D 가상 오피스·WebAudio 효과음을 하나의 로컬 우선 CRDT 원장에 통합",
      "Unifies live drawing, review pins, Division OS, 2D/3D virtual office and procedural WebAudio SFX on one local-first CRDT ledger",
    ),
    honestStrength: t(
      "그림 캔버스, 웹툰 분업 권한, 프레임 검수, 가상 오피스를 앱 전환 없이 브라우저 탭 하나에서 연결",
      "Connects canvas drawing, role-based webtoon handoffs, frame review and virtual office in a single browser tab",
    ),
  },
  {
    id: "magma",
    name: "Magma Studio",
    shortName: "Magma",
    role: t("브라우저 멀티유저 동시 드로잉 잼 특화 웹앱", "Multiplayer browser drawing jam web app"),
    pricing: t("무료 + Pro/Blaze 구독", "Freemium + Pro/Blaze subscription"),
    platform: t("웹 브라우저", "Web browser"),
    benchmarkTakeaway: t(
      "링크 공유 즉시 합류하는 멀티유저 드로잉과 실시간 커서·레이어 협업 UX를 벤치마킹",
      "Benchmarked for instant link-join multiplayer drawing and live cursor/layer presence",
    ),
    honestStrength: t(
      "최대 30인 동시 드로잉 잼과 커뮤니티 아트잼 운영 안정성",
      "Proven 30-artist live drawing jam rooms with low-friction browser onboarding",
    ),
  },
  {
    id: "gather",
    name: "Gather Town",
    shortName: "Gather",
    role: t("2D 도트 기반 근접 화상 가상 오피스 플랫폼", "2D proximity-video virtual office platform"),
    pricing: t("소규모 무료 + 인당 월 구독", "Small free tier + per-user monthly subscription"),
    platform: t("웹 · 데스크톱 앱", "Web & desktop app"),
    benchmarkTakeaway: t(
      "2D 타일 공간 이동, 근접 화상/음성, 커스텀 공간 꾸미기 및 회의 동선을 벤치마킹",
      "Benchmarked for 2D tile navigation, proximity audio/video and customizable studio rooms",
    ),
    honestStrength: t(
      "대규모 기업 원격 오피스·컨퍼런스용 안정적인 WebRTC 근접 화상 인프라",
      "Mature WebRTC proximity video infrastructure proven for large remote teams and events",
    ),
  },
  {
    id: "zep",
    name: "ZEP",
    shortName: "ZEP",
    role: t("국내 교육·행사 특화 대규모 2D 메타버스 플랫폼", "Large-scale 2D metaverse platform popular in Korea"),
    pricing: t("무료 + 공간/인원 확장 구독", "Freemium + space/capacity subscription"),
    platform: t("웹 · 모바일 브라우저", "Web & mobile browser"),
    benchmarkTakeaway: t(
      "한국 팀에 익숙한 2D 아바타 이동, 미니앱·투표·공간 예약 UX를 참고",
      "Referenced for approachable 2D avatar navigation, mini-apps, polls and room booking UX",
    ),
    honestStrength: t(
      "수백~수천 명 동시 접속 행사·강의실 운영과 간편한 미니앱 생태계",
      "Handles hundreds-to-thousands of concurrent event attendees with a lightweight mini-app ecosystem",
    ),
  },
  {
    id: "figma",
    name: "Figma / FigJam",
    shortName: "Figma",
    role: t("웹 실시간 벡터 디자인 & FigJam 협업 화이트보드 표준", "Web realtime vector design & FigJam whiteboard standard"),
    pricing: t("무료 스타터 + 에디터 좌석 구독", "Free Starter + per-editor subscription"),
    platform: t("웹 · 데스크톱 · 모바일 뷰어", "Web, desktop & mobile viewer"),
    benchmarkTakeaway: t(
      "CRDT 계열 실시간 동기화, 캔버스 코멘트 핀, 멀티 커서, 커서 챗 UX를 벤치마킹",
      "Benchmarked for CRDT-style multiplayer sync, canvas comment pins and cursor chat ergonomics",
    ),
    honestStrength: t(
      "초대형 벡터 디자인 시스템, 멀티플레이어 프레임워크 성숙도, 수천 개 플러그인",
      "Unmatched multiplayer vector canvas smoothness, design systems and plugin ecosystem",
    ),
  },
  {
    id: "creco",
    name: "Creco",
    shortName: "Creco",
    role: t("한국 웹툰 스튜디오 전용 원고 검수·일정·협업 툴", "Korean webtoon studio review, scheduling & collaboration tool"),
    pricing: t("팀/에이전시 SaaS 구독", "Team / agency SaaS subscription"),
    platform: t("웹 브라우저", "Web browser"),
    benchmarkTakeaway: t(
      "웹툰 회차 버전 비교, 컷 좌표 피드백 핀, 공정별 상태 관리 흐름을 벤치마킹",
      "Benchmarked for webtoon episode version comparison, spatial review pins and stage tracking",
    ),
    honestStrength: t(
      "국내 웹툰 에이전시·PD 현장 워크플로에 맞춘 검수 히스토리와 공정 관리 특화",
      "Purpose-built around Korean webtoon agency PD review and episode pipeline operations",
    ),
  },
  {
    id: "miro",
    name: "Miro",
    shortName: "Miro",
    role: t("무한 캔버스 팀 브레인스토밍·기획 보드 플랫폼", "Infinite-canvas team brainstorming & planning whiteboard"),
    pricing: t("무료 제한 보드 + 멤버당 구독", "Free limited boards + per-member subscription"),
    platform: t("웹 · 데스크톱 · 태블릿", "Web, desktop & tablet"),
    benchmarkTakeaway: t(
      "포스트잇 칸반 정렬, 실시간 투표, 화이트보드 회의 동선을 가상 스튜디오에 내재화",
      "Inspired sticky-note Kanban sorting, live team polls and collaborative whiteboard inside virtual space",
    ),
    honestStrength: t(
      "수백 명 동시 접속 무한 기획 보드, 방대한 템플릿과 엔터프라이즈 워크숍 도구",
      "Battle-tested infinite whiteboard scale, huge template catalog and enterprise facilitation tools",
    ),
  },
  {
    id: "frameio",
    name: "Frame.io / SyncSketch",
    shortName: "Frame.io",
    role: t("영상·애니메이션 프레임 정밀 검수·드로잉 피드백 플랫폼", "Frame-accurate visual review & draw-over feedback platform"),
    pricing: t("클라우드 좌석/스토리지 구독", "Cloud seat & storage subscription"),
    platform: t("웹 · iOS · NLE 연동", "Web, iOS & NLE integrations"),
    benchmarkTakeaway: t(
      "나란히/오버레이 버전 비교, 좌표 주석 드로잉, 음성 리뷰 노트와 승인 스냅샷을 벤치마킹",
      "Benchmarked for side-by-side/onion-skin version compare, spatial draw-over pins and voice review notes",
    ),
    honestStrength: t(
      "영상 타임코드 프레임 정밀 리뷰, 대용량 프로덕션 미디어 스트리밍과 Premiere/Resolve 직결",
      "Broadcast-grade frame-accurate video review, massive media delivery and NLE integrations",
    ),
  },
];

export const BENCHMARK_COLLAB_OFFICE_DATASET: BenchmarkDataset = {
  id: "collab-office",
  path: "/about/technology/benchmarks/collab-office",
  shortLabel: t("협업·가상 오피스", "Collab & Office"),
  eyebrow: `GRANULAR BENCHMARK · COLLAB & VIRTUAL OFFICE · ${BENCHMARK_SNAPSHOT_DATE}`,
  title: t(
    "실시간 협업 · 검수 · 가상 오피스 정밀 벤치마크 (14종 × 8개 툴)",
    "Realtime Collaboration, Review & Virtual Office Benchmark (14 Items × 8 Tools)",
  ),
  subtitle: t(
    "Yjs CRDT 오프라인 우선 동기화, 동시 드로잉, 리뷰 핀·버전 비교, 웹툰 분업 OS, 가상 스튜디오 2D/3D 모션·먼지·WebAudio를 8개 협업 플랫폼과 대조했습니다.",
    "Architecture-level comparison of Yjs CRDT offline sync, live drawing, review pins, Division OS and virtual studio craft across 8 platforms.",
  ),
  scopeNote: t(
    "비교 범위: ToonStudio 2026-11-22 CRDT·Division OS·가상 스튜디오 코드 실측 vs Magma · Gather · ZEP · Figma · Creco · Miro · Frame.io/SyncSketch 공개 아키텍처 기준.",
    "Scope: verified against 2026-11-22 ToonStudio CRDT, Division OS and virtual-space source vs 7 collaboration tools.",
  ),
  snapshotDate: BENCHMARK_SNAPSHOT_DATE,
  tools: COLLAB_TOOLS,
  subGroups: [
    {
      id: "sync-arch",
      label: t("진입·동기화 구조", "Entry & Sync Arch"),
      description: t("무설치 진입·Yjs CRDT 오프라인 우선 vs 서버 권위형·지연 특성", "Zero-install entry, Yjs CRDT offline-first vs server-authoritative latency"),
    },
    {
      id: "draw-review-division",
      label: t("드로잉·검수·분업", "Draw, Review & Division"),
      description: t("동시 드로잉·좌표 리뷰 핀·버전 비교·Division OS 권한/락", "Live drawing, spatial review pins, version compare & Division OS RBAC"),
    },
    {
      id: "virtual-office-craft",
      label: t("가상 오피스·모션·SFX", "Virtual Office & SFX"),
      description: t("2D/3D 공간·비중복 아바타·안정 모션·먼지 파티클·WebAudio SFX", "2D/3D spaces, unique avatars, stable motion, dust FX & WebAudio SFX"),
    },
    {
      id: "ops-sovereignty",
      label: t("회의·비용·데이터 주권", "Meetings, Cost & Sovereignty"),
      description: t("투표·공간 예약·화이트보드·팀 비용·로컬 데이터 주권", "Polls, room booking, whiteboard, seat pricing & local data ownership"),
    },
  ],
  rows: [
    {
      id: "zero-install-entry",
      subGroupId: "sync-arch",
      title: t("무설치 브라우저 게스트 즉시 진입", "Zero-Install Browser Guest Entry"),
      metricTag: t("가입 장벽 0 · 로컬 즉시 작업", "Zero sign-up wall · instant local start"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Magma·FigJam의 브라우저 즉시 접근성을 계승하되, 로그인 전에도 로컬 OPFS/SQLite로 바로 작업·저장할 수 있게 확장",
        "Extends browser instant access by allowing immediate guest work and local OPFS/SQLite durability before sign-in",
      ),
      evidenceSummary: t(
        "브라우저에서 설치나 계정 강제 없이 스튜디오·캔버스·가상 공간 로컬 미리보기를 즉시 엽니다.",
        "Opens the studio, canvas and local virtual space preview directly in-browser without mandatory sign-up.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/studio-workspace-sqlite-runtime.ts",
        "apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceEntryLobby.tsx",
      ],
      honestLimit: t(
        "원격 팀원과의 실시간 멀티플레이어 동기화 방 입장은 인증·세션 식별이 필요합니다.",
        "Joining live multi-user sync rooms across remote teammates still requires session authentication.",
      ),
      cells: {
        toonstudio: c("full", "무설치·비로그인 로컬 즉시 진입", "Zero-install guest entry with local save"),
        magma: c("full", "웹 링크 즉시 진입(게스트 참여 지원)", "Instant browser link join with guest mode"),
        gather: c("full", "웹 링크 게스트 입장 지원", "Web link guest entry supported"),
        zep: c("full", "웹 링크 초간편 게스트 입장", "Fast browser guest link entry"),
        figma: c("partial", "열람은 간편·편집은 계정 로그인 필요", "Easy viewing; account required to edit"),
        creco: c("partial", "팀 계정·초대 로그인 기반 진입", "Team account login required"),
        miro: c("partial", "게스트 보드 열람/제한 편집 가능", "Guest viewing & limited visitor editing"),
        frameio: c("full", "리뷰 링크 무로그인 피드백 지원", "No-login review link commenting"),
      },
    },
    {
      id: "yjs-crdt-offline",
      subGroupId: "sync-arch",
      title: t("Yjs CRDT 오프라인 우선 동기화 vs 서버 권위형", "Yjs CRDT Offline-First Sync vs Server-Authoritative"),
      metricTag: t("로컬 OPFS 권위 · 자동 수렴", "Local OPFS authority · auto convergence"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Figma/Miro의 서버 권위 실시간 협업과 달리, 웹툰 마감 중 네트워크가 끊겨도 작업이 멈추지 않는 Yjs CRDT + 로컬 복구 볼트를 채택",
        "Chose offline-first Yjs CRDT + local recovery vault so webtoon deadlines never stall on dropped connections",
      ),
      evidenceSummary: t(
        "Yjs CRDT 문서 엔진·오프라인 아웃박스·복구 볼트가 단절 중 편집을 보존하고 재연결 시 충돌 없이 병합합니다.",
        "Yjs CRDT document runtime, offline outbox and recovery vault preserve edits offline and converge on reconnect.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/live/studio-crdt-document.ts",
        "apps/web/src/domains/creator/virtual-space/crdt/studio-virtual-space-yjs-doc.ts",
        "apps/web/src/domains/creator/live/studio-crdt-recovery-vault.ts",
      ],
      honestLimit: t(
        "초대용량 래스터 픽셀 레이어를 수십 명이 동시에 덮어쓰는 상황에서는 CRDT 스냅샷 압축 및 레이어 락 병행이 필수입니다.",
        "Heavy concurrent raster painting still requires periodic compaction and layer locks alongside CRDT ops.",
      ),
      cells: {
        toonstudio: c("full", "Yjs CRDT 오프라인 우선 + OPFS 로컬 원장", "Offline-first Yjs CRDT + local OPFS authority"),
        magma: c("partial", "서버 권위형 실시간 캔버스(오프라인 불가)", "Server-authoritative canvas; online required"),
        gather: c("none", "실시간 서버 세션 전용(오프라인 없음)", "Online session only; no offline CRDT"),
        zep: c("none", "실시간 서버 세션 전용", "Online session only"),
        figma: c("partial", "CRDT 계열(온라인 중심·오프라인 제한)", "CRDT-inspired; limited offline editing"),
        creco: c("none", "서버 DB 기반 검수 보드(온라인 필요)", "Server-backed review board; online required"),
        miro: c("none", "클라우드 서버 동기화(오프라인 미지원)", "Cloud-synced board; no offline mode"),
        frameio: c("none", "클라우드 미디어 서버 권위형", "Cloud server-authoritative media review"),
      },
    },
    {
      id: "canvas-latency-p2p",
      subGroupId: "sync-arch",
      title: t("캔버스 협업 지연 특성 · P2P/엣지 델타 동기화", "Canvas Sync Latency & P2P/Edge Delta Relay"),
      metricTag: t("0ms 로컬 입력 · 바이너리 델타", "0ms local ink · binary delta wire"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "서버 왕복을 기다리는 원격 캔버스 지연을 없애기 위해 로컬 즉시 렌더 + 바이너리 CRDT 와이어/P2P 핸드셰이크를 결합",
        "Pairs instant local rendering with binary CRDT wire encoding and P2P/edge relay to keep strokes immediate",
      ),
      evidenceSummary: t(
        "입력은 0ms 로컬에 먼저 그려지고 변경분만 바이너리 CRDT 와이어와 P2P/Cloudflare 엣지로 전송됩니다.",
        "Input renders locally immediately while compact binary CRDT deltas propagate over P2P or Cloudflare edge.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/live/studio-crdt-binary-wire.ts",
        "apps/web/src/domains/creator/live/studio-live-p2p-mesh-handshake.ts",
      ],
      honestLimit: t(
        "글로벌 멀티 리전 30인 이상 동시 드로잉 실전 부하 검증은 Magma와 Figma의 수년 치 프로덕션 트래픽 기록에 비해 초기 단계입니다.",
        "Global 30+ artist production stress testing is earlier-stage than Magma and Figma's multi-year telemetry.",
      ),
      cells: {
        toonstudio: c("full", "로컬 즉시 렌더 + 바이너리 델타/P2P", "Instant local render + binary delta / P2P"),
        magma: c("full", "전용 드로잉 릴레이 저지연 검증 완료", "Battle-tested low-latency drawing relay"),
        gather: c("partial", "아바타 위치 동기화(드로잉 캔버스 없음)", "Avatar state sync; no drawing canvas"),
        zep: c("partial", "아바타 위치 동기화 중심", "Avatar state sync only"),
        figma: c("full", "글로벌 멀티플레이어 60fps 최상급", "Best-in-class global 60fps multiplayer sync"),
        creco: c("partial", "비동기 업로드·리뷰 중심(실시간 드로잉 없음)", "Async review uploads; no live drawing"),
        miro: c("full", "대규모 동시 보드 저지연 동기화", "Smooth low-latency multi-user board sync"),
        frameio: c("partial", "영상 동기화 재생(C2C/실시간 리뷰)", "Synced video playback & live comments"),
      },
    },
    {
      id: "live-multi-drawing",
      subGroupId: "draw-review-division",
      title: t("동시 드로잉 · 실시간 스트로크 공유", "Simultaneous Multi-User Canvas Drawing"),
      metricTag: t("CRDT 스트로크 퍼블리셔", "CRDT live stroke publisher"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Magma Studio의 공동 드로잉 경험을 웹툰 컷 레이어 구조 안으로 가져와 선화·어시스턴트 동시 작업에 연결",
        "Brings Magma-style multiplayer strokes into layered webtoon cut canvases for artist-assistant teamwork",
      ),
      evidenceSummary: t(
        "라이브 스트로크 퍼블리셔와 드로잉 브리지가 원격 참여자의 획을 캔버스에 실시간 반영합니다.",
        "Live stroke publisher and draw bridge propagate incoming strokes onto shared canvas layers in real time.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/live/studio-crdt-live-stroke-publisher.ts",
        "apps/web/src/domains/creator/live/studio-crdt-draw-bridge.ts",
      ],
      honestLimit: t(
        "30인 대규모 랜덤 아트잼과 즉흥 낙서방 커뮤니티 문화는 Magma Studio가 훨씬 활성화돼 있습니다.",
        "Magma Studio has a much larger live art-jam community and proven 30-person simultaneous jam rooms.",
      ),
      cells: {
        toonstudio: c("full", "CRDT 실시간 스트로크·레이어 공유", "CRDT live strokes & shared layers"),
        magma: c("full", "30인 동시 드로잉 잼 업계 선두", "Leading 30-artist live drawing jam rooms"),
        gather: c("none", "외부 화이트보드 임베드만 가능", "External whiteboard embeds only"),
        zep: c("none", "전문 드로잉 캔버스 미지원", "No professional drawing canvas"),
        figma: c("partial", "벡터/FigJam 마커(래스터 회화 미지원)", "Vector & FigJam marker; no raster paint"),
        creco: c("none", "검수 주석 전용(작화 캔버스 없음)", "Review markup only; no drawing canvas"),
        miro: c("partial", "화이트보드 펜 스케치(웹툰 캔버스 아님)", "Whiteboard pen only; not a comic canvas"),
        frameio: c("partial", "프레임 위 간단 주석 드로잉만 지원", "Simple draw-over annotations only"),
      },
    },
    {
      id: "review-pins-frame-compare",
      subGroupId: "draw-review-division",
      title: t("컷 좌표 리뷰 핀 · 프레임 비교 · 음성 메모", "Spatial Review Pins, Frame Compare & Voice Notes"),
      metricTag: t("나란히/오버레이 비교 · 음성 피드백", "Side-by-side compare · voice notes"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Creco의 컷 좌표 피드백과 Frame.io/SyncSketch의 프레임 비교·드로잉 주석·음성 메모를 한 검수 워크플로로 통합",
        "Synthesizes Creco spatial cut pins with Frame.io/SyncSketch side-by-side frame compare and voice notes",
      ),
      evidenceSummary: t(
        "고정 리뷰 핀, 전/후 프레임 나란히 비교, 공간 주석, 음성 리뷰 노트를 스튜디오 안에서 바로 처리합니다.",
        "Provides pinned review threads, side-by-side frame comparison, spatial annotations and voice notes in-studio.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/virtual-space/StudioPinnedReviewPanel.tsx",
        "apps/web/src/domains/creator/virtual-space/StudioReviewFrameComparison.tsx",
        "apps/web/src/domains/creator/virtual-space/StudioReviewVoiceNotes.tsx",
        "apps/web/src/domains/creator/creco-collab-viewer/creco-version-compare-engine.ts",
      ],
      honestLimit: t(
        "4K ProRes 영상 타임코드 프레임 단위 리뷰와 NLE(Premiere/DaVinci) 연동은 Frame.io/SyncSketch가 전문 영역입니다.",
        "4K ProRes timecode playback and Premiere/DaVinci NLE integration remain Frame.io/SyncSketch territory.",
      ),
      cells: {
        toonstudio: c("full", "좌표 핀·프레임 비교·음성 메모 통합", "Spatial pins, frame compare & voice notes"),
        magma: c("partial", "기본 댓글(전용 프레임 비교·승인 약함)", "Basic comments; no structured frame compare"),
        gather: c("none", "원고 프레임 리뷰 기능 미지원", "No manuscript frame review"),
        zep: c("none", "원고 리뷰 핀 미지원", "No manuscript review pins"),
        figma: c("full", "캔버스 좌표 코멘트 핀 매우 우수", "Polished spatial canvas comment pins"),
        creco: c("full", "웹툰 컷 좌표 핀·버전 비교 특화", "Specialized webtoon cut pins & compare"),
        miro: c("partial", "보드 코멘트 핀(컷 버전 비교 제한)", "Board comments; limited cut version diff"),
        frameio: c("full", "프레임 정밀 핀·드로잉·비교 업계 표준", "Industry standard for frame-accurate review"),
      },
    },
    {
      id: "division-os-rbac",
      subGroupId: "draw-review-division",
      title: t("웹툰 분업 OS · 레이어 권한(RBAC) · 포렌식 락", "Webtoon Division OS, Layer RBAC & Forensic Lock"),
      metricTag: t("공정별 레이어 락 · 분업 큐", "Per-stage layer locks · handoff queue"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "콘티→선화→밑색→명암→식자 웹툰 공장의 레이어 덮어쓰기 사고를 막기 위해 역할 기반 권한과 이진 락을 독자 설계",
        "Built role-based layer authority and binary forensic locks to prevent overwrite accidents in studio assembly lines",
      ),
      evidenceSummary: t(
        "Division OS 허브가 공정별 레이어 쓰기 권한, 이진 포렌식 락, 컷 슬라이스 분할/병합, 다회차 스케줄러를 제어합니다.",
        "Division OS enforces per-role layer permissions, binary forensic locks, slice partitioning and multi-episode schedules.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/production-hub/division-os/StudioDivisionOsHub.tsx",
        "apps/web/src/domains/creator/production-hub/division-os/layer-authority-rbac.ts",
        "apps/web/src/domains/creator/production-hub/division-os/binary-lock-forensic-guard.ts",
      ],
      honestLimit: t(
        "대형 에이전시의 급여/세무 ERP 및 외부 Slack/Jira 대규모 엔터프라이즈 연동은 점진 확장 영역입니다.",
        "Deep enterprise ERP payroll and broad external Jira/Slack automation are still expanding.",
      ),
      cells: {
        toonstudio: c("full", "Division OS·레이어 RBAC·포렌식 락", "Division OS, layer RBAC & forensic locks"),
        magma: c("partial", "단순 레이어 잠금(웹툰 공정 OS 없음)", "Basic layer lock; no webtoon stage OS"),
        gather: c("none", "제작 파일 권한/레이어 락 없음", "No production file or layer RBAC"),
        zep: c("none", "제작 파일 권한/레이어 락 없음", "No production file or layer RBAC"),
        figma: c("partial", "페이지/브랜치 권한(웹툰 공정 특화 아님)", "File/branch permissions; not comic-specific"),
        creco: c("full", "웹툰 공정 관리·담당 배정 강점", "Strong webtoon pipeline & stage assignments"),
        miro: c("none", "레이어 권한·웹툰 분업 락 없음", "No layer RBAC or webtoon pipeline locks"),
        frameio: c("partial", "검수 승인 권한(편집 레이어 락 없음)", "Review approval roles; no edit layer lock"),
      },
    },
    {
      id: "version-history-3way",
      subGroupId: "draw-review-division",
      title: t("버전 히스토리 · 3-Way 병합 · 스냅샷 복구", "Version History, 3-Way Merge & Snapshots"),
      metricTag: t("로컬 체크포인트 · 3-Way 머지", "Local checkpoints · 3-way merge"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Figma 브랜치 머지와 Git 3-Way 병합 원리를 웹툰 워크스페이스에 적용해 마감 전 버전 비교·복구를 안전화",
        "Applied 3-way merge and visual revision diffing so teams recover or merge episode changes safely",
      ),
      evidenceSummary: t(
        "워크스페이스 3-Way 병합 엔진과 리비전 비교 뷰로 회차 수정 전/후 차이를 시각적으로 확인하고 되돌립니다.",
        "3-way workspace merge engine and visual revision compare view inspect diffs and roll back safely.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/studio-workspace-three-way-merge.ts",
        "apps/web/src/domains/creator/StudioRevisionCompareView.tsx",
      ],
      honestLimit: t(
        "클라우드 장기 무제한 버전 보관(수년 단위 테라바이트 아카이브)은 유료 엔터프라이즈 스토리지 기반 Frame.io/Figma가 유리합니다.",
        "Multi-year terabyte cloud archive retention relies on paid storage tiers in Frame.io and Figma Enterprise.",
      ),
      cells: {
        toonstudio: c("full", "로컬 스냅샷·3-Way 병합·시각 비교", "Local snapshots, 3-way merge & visual diff"),
        magma: c("partial", "세션 타임랩스/기본 히스토리", "Session history & timelapses; no 3-way merge"),
        gather: c("none", "문서 버전 히스토리 미지원", "No document version history"),
        zep: c("none", "문서 버전 히스토리 미지원", "No document version history"),
        figma: c("full", "버전 히스토리·엔터프라이즈 브랜치 병합", "Full version history & branch merging"),
        creco: c("full", "회차 업로드 버전 스택·비교 지원", "Episode upload version stacks & compare"),
        miro: c("partial", "보드 활동 기록(3-Way 병합 없음)", "Board history; no 3-way merge"),
        frameio: c("full", "버전 스택·프레임 차이 비교 최상급", "Top-tier version stacks & visual diff"),
      },
    },
    {
      id: "virtual-space-2d-3d",
      subGroupId: "virtual-office-craft",
      title: t("2D/3D 하이브리드 가상 스튜디오 공간", "2D/3D Hybrid Virtual Studio Space"),
      metricTag: t("2D 오피스 + 3D 뷰 · 작업실 직결", "2D office + 3D stage · direct studio link"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Gather Town·ZEP의 아늑한 2D 가상 오피스를 창작 작업실과 직결하고 3D 공간 모드까지 브라우저에서 전환 가능하게 설계",
        "Connects Gather/ZEP-style 2D virtual studios directly to live manuscripts with an optional 3D spatial view",
      ),
      evidenceSummary: t(
        "경량 2D 오피스 렌더러와 Three.js 3D 가상 공간이 같은 스튜디오 프로젝트·화이트보드·리뷰 패널에 연결됩니다.",
        "Lightweight 2D office renderer and Three.js 3D mode connect directly to studio projects, boards and review panels.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/virtual-space/office2d/office2d-renderer.ts",
        "apps/web/src/domains/creator/virtual-space/three/studio-virtual-space-three-motion.ts",
      ],
      honestLimit: t(
        "수백 명이 동시에 모이는 초대형 가상 컨퍼런스 홀 부하 분산은 ZEP과 Gather Town의 전용 인프라가 앞섭니다.",
        "Large-scale 500+ attendee virtual event infrastructure remains stronger in ZEP and Gather Town.",
      ),
      cells: {
        toonstudio: c("full", "2D/3D 하이브리드 가상 스튜디오·원고 직결", "2D/3D hybrid studio linked to live canvases"),
        magma: c("none", "가상 오피스 공간 미지원", "No virtual office space"),
        gather: c("full", "2D 가상 오피스·근접 화상 업계 대표", "Leading 2D virtual office & proximity video"),
        zep: c("full", "대규모 2D 메타버스·맵 에디터 강점", "Strong large-scale 2D metaverse & map editor"),
        figma: c("none", "화이트보드 중심(아바타 공간 없음)", "Whiteboard only; no avatar spatial world"),
        creco: c("none", "가상 공간 미지원", "No virtual office space"),
        miro: c("none", "가상 공간 미지원", "No virtual office space"),
        frameio: c("none", "가상 공간 미지원", "No virtual office space"),
      },
    },
    {
      id: "unique-avatars",
      subGroupId: "virtual-office-craft",
      title: t("비중복 고유 아바타 & 창작자 역할 프리셋", "Unique Non-Duplicate Avatars & Creator Presets"),
      metricTag: t("고유 팔레트·의상·역할 소품", "Unique palettes · role outfits & props"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "가상 오피스에서 NPC와 팀원 외형이 겹쳐 보이는 문제를 해결하기 위해 비중복 외형·창작 직군 프리셋을 체계화",
        "Structured unique appearance palettes and creator-role presets so avatars and NPCs stay visually distinct",
      ),
      evidenceSummary: t(
        "아바타 커스터마이저와 2D 오피스 외형 정의가 헤어·의상·색조 조합을 분리해 팀원·NPC를 명확히 구분합니다.",
        "Avatar customizer and office2d appearance system separate hair, outfit and color palettes across roles.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/virtual-space/StudioVirtualAvatarCustomizer.tsx",
        "apps/web/src/domains/creator/virtual-space/office2d/office2d-avatar-appearance.ts",
      ],
      honestLimit: t(
        "유료 브랜드 콜라보 코스튬 상점과 수천 종 아바타 아이템 볼륨은 ZEP이 더 많습니다.",
        "ZEP offers a broader catalog of paid/branded cosmetic avatar items.",
      ),
      cells: {
        toonstudio: c("full", "비중복 외형·창작 직군 커스텀 아바타", "Unique appearances & creator-role customizer"),
        magma: c("none", "프로필 아이콘/커서만 표시", "Profile avatars & cursors only"),
        gather: c("full", "픽셀 아바타 의상·악세서리 커스터마이징", "Pixel avatar outfit & accessory customizer"),
        zep: c("full", "풍부한 아바타 코스튬·아이템 샵", "Extensive avatar costume catalog & shop"),
        figma: c("none", "커서·프로필 배지만 표시", "Cursors and profile badges only"),
        creco: c("none", "프로필 아이콘만 표시", "Profile icons only"),
        miro: c("none", "커서·프로필 아이콘만 표시", "Cursors and profile icons only"),
        frameio: c("none", "프로필 아이콘만 표시", "Profile icons only"),
      },
    },
    {
      id: "stable-character-motion",
      subGroupId: "virtual-office-craft",
      title: t("등신 고정 안정 모션 · 달리기/점프 · 저모션 존중", "Proportional Stable Motion, Run/Jump & Reduced Motion"),
      metricTag: t("발 접지 고정 · prefers-reduced-motion", "Bottom-center lock · reduced-motion safe"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "웹 가상 공간 아바타의 흔들림·크기 요동 피로를 없애고 정갈한 보행·달리기·점프 리듬과 접근성 모션 감소를 적용",
        "Eliminated visual jitter/size wobble with grounded walk/run/jump cycles and `prefers-reduced-motion` support",
      ),
      evidenceSummary: t(
        "캐릭터 모션·로코모션 프레젠테이션·저모션 정책 모듈이 바닥 발 접지와 일정한 등신 비율을 유지합니다.",
        "Character motion, locomotion presentation and reduced-motion guards maintain grounded, jitter-free proportions.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/virtual-space/studio-virtual-space-character-motion.ts",
        "apps/web/src/domains/creator/virtual-space/studio-virtual-space-locomotion-presentation.ts",
        "apps/web/src/domains/creator/virtual-space/studio-virtual-space-reduced-motion.ts",
      ],
      honestLimit: t(
        "전용 게임 엔진 기반 3D 풀바디 물리 리깅 모션(VRChat급)이 아니라 경량 웹 협업 오피스 목적의 2D/3D 모션입니다.",
        "Designed for lightweight browser office comfort rather than full-body VRChat-style skeletal physics.",
      ),
      cells: {
        toonstudio: c("full", "등신 고정·걷기/달리기/점프·저모션 준수", "Height-locked walk/run/jump + reduced motion"),
        magma: c("none", "아바타 이동 모션 없음", "No avatar locomotion"),
        gather: c("partial", "4방향 기본 도트 보행(점프/달리기 제한)", "Basic 4-dir pixel walk; limited sprint/jump"),
        zep: c("full", "걷기·달리기·점프·이모트 모션 지원", "Walk, run, jump and emotes supported"),
        figma: c("none", "아바타 이동 모션 없음", "No avatar locomotion"),
        creco: c("none", "아바타 이동 모션 없음", "No avatar locomotion"),
        miro: c("none", "아바타 이동 모션 없음", "No avatar locomotion"),
        frameio: c("none", "아바타 이동 모션 없음", "No avatar locomotion"),
      },
    },
    {
      id: "dust-particles-fx",
      subGroupId: "virtual-office-craft",
      title: t("바닥 재질 연동 물리 먼지 파티클 FX", "Surface-Matched Dust & Movement Particles"),
      metricTag: t("나무/카펫/석재/잔디 색조 연동", "Wood/carpet/stone/grass tint match"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "2D 게임급 공간 생동감을 위해 걷기·달리기·급회전·점프 착지 시 바닥 재질에 맞는 경량 먼지 파티클을 직접 구현",
        "Implemented lightweight surface-matched dust puffs on walk, sprint, sharp turn and jump landing",
      ),
      evidenceSummary: t(
        "이동 파티클과 2D 오피스 발걸음/파티클 모듈이 바닥 재질별 먼지 색조와 감속 페이드아웃을 렌더링합니다.",
        "Movement and office2d particle engines render surface-tinted dust puffs with smooth decay and reduced-motion guard.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/virtual-space/studio-virtual-space-movement-particles.ts",
        "apps/web/src/domains/creator/virtual-space/office2d/office2d-particles.ts",
        "apps/web/src/domains/creator/virtual-space/office2d/office2d-footstep-fx.ts",
      ],
      honestLimit: t(
        "파티클 효과는 저사양 기기·저모션 설정 시 자동으로 생략되며 시각 장식보다 작업 집중을 우선합니다.",
        "Automatically throttles or disables under reduced-motion or low-end devices to prioritize focus.",
      ),
      cells: {
        toonstudio: c("full", "재질 연동 먼지 퍼프·착지 링·저모션 가드", "Surface-tinted dust puffs & reduced-motion guard"),
        magma: c("none", "공간 이동 파티클 없음", "No spatial movement particles"),
        gather: c("none", "발걸음 먼지 파티클 미지원", "No footstep dust particles"),
        zep: c("partial", "일부 이모트/맵 효과(재질 먼지 제한)", "Selected map FX; limited surface dust"),
        figma: c("none", "해당 없음", "Not applicable"),
        creco: c("none", "해당 없음", "Not applicable"),
        miro: c("none", "해당 없음", "Not applicable"),
        frameio: c("none", "해당 없음", "Not applicable"),
      },
    },
    {
      id: "webaudio-procedural-sfx",
      subGroupId: "virtual-office-craft",
      title: t("₩0 절차적 WebAudio 효과음 & 공간 패닝 오디오", "KRW 0 Procedural WebAudio SFX & Spatial Panner"),
      metricTag: t("외부 음원 저작권 0 · 거리 패닝", "Zero audio licensing · distance panning"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "외부 효과음 파일 저작권·대역폭 부담 없이 WebAudio API로 발소리·점프·알림·공간 패닝을 100% 절차 합성",
        "Synthesizes footsteps, jump whooshes, chimes and spatial panning procedurally via WebAudio at zero asset cost",
      ),
      evidenceSummary: t(
        "WebAudio 사운드 신시사이저와 3D/2D 공간 패너가 거리 기반 감쇠와 사용자 음소거 설정을 안전하게 제어합니다.",
        "WebAudio synth engine and spatial panner provide distance attenuation with safe mute/fallback controls.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/virtual-space/studio-virtual-space-sound-synth.ts",
        "apps/web/src/domains/creator/virtual-space/studio-virtual-space-sound-engine.ts",
        "apps/web/src/domains/creator/virtual-space/audio/studio-virtual-space-spatial-panner.ts",
      ],
      honestLimit: t(
        "다자간 고품질 근접 화상 통화(SFU 미디어 서버 비용 수반)는 Gather Town·ZEP의 상용 미디어 인프라가 더 성숙합니다.",
        "Large multi-party WebRTC SFU video calling remains more mature in paid Gather Town and ZEP servers.",
      ),
      cells: {
        toonstudio: c("full", "₩0 절차적 WebAudio SFX + 공간 패닝", "KRW 0 procedural WebAudio SFX & spatial panner"),
        magma: c("none", "공간 오디오/효과음 미지원", "No spatial audio or SFX"),
        gather: c("full", "근접 음성/화상·환경음 오디오 우수", "Strong proximity voice/video & ambience"),
        zep: c("full", "근접 오디오·배경음·효과음 지원", "Proximity audio, BGM & sound effects"),
        figma: c("partial", "FigJam 이모지 효과음·음성 채팅(유료)", "FigJam audio cues & paid voice chat"),
        creco: c("none", "공간 오디오 미지원", "No spatial audio"),
        miro: c("none", "공간 오디오 미지원", "No spatial audio"),
        frameio: c("partial", "영상 재생 오디오·음성 코멘트", "Video playback & audio comments"),
      },
    },
    {
      id: "meetings-polls-booking",
      subGroupId: "ops-sovereignty",
      title: t("가상 오피스 회의 · 투표 · 공간 예약 · 화이트보드", "Polls, Room Booking & Collaborative Whiteboard"),
      metricTag: t("실시간 투표 · 회의실 예약 · 보드", "Live polls · room booking · whiteboard"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Miro/FigJam의 회의 투표·화이트보드와 Gather/ZEP의 공간 예약을 스튜디오 가상 공간 패널로 통합",
        "Integrates Miro/FigJam-style polls and whiteboards with virtual office room booking in one studio space",
      ),
      evidenceSummary: t(
        "실시간 투표 패널, 공간/회의실 예약 동기화, P2P 화이트보드와 포스트잇을 가상 스튜디오 안에 기본 탑재했습니다.",
        "Ships built-in live polls, room booking sync, P2P whiteboard and sticky notes inside the virtual space.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/virtual-space/StudioSpacePollPanel.tsx",
        "apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceSpaceBookingPanel.tsx",
        "apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceWhiteboard.tsx",
      ],
      honestLimit: t(
        "수천 종 비즈니스 다이어그램·애자일 워크숍 템플릿 생태계는 Miro와 FigJam이 압도적으로 풍부합니다.",
        "Miro and FigJam far outstrip ToonStudio in business workshop templates and enterprise integrations.",
      ),
      cells: {
        toonstudio: c("full", "투표·공간 예약·P2P 화이트보드 내장", "Built-in polls, room booking & whiteboard"),
        magma: c("none", "회의 예약·투표 미지원", "No room booking or polls"),
        gather: c("full", "회의실 구역·캘린더 연동 예약 지원", "Private zones & calendar room booking"),
        zep: c("full", "투표·미니앱·행사 공간 운영 지원", "Polls, mini-apps & event room controls"),
        figma: c("full", "FigJam 투표·타이머·화이트보드 최강", "Top-tier FigJam polls, timers & boards"),
        creco: c("partial", "일정 캘린더 중심(화이트보드 없음)", "Schedule tracking; no whiteboard"),
        miro: c("full", "투표·워크숍·무한 화이트보드 업계 표준", "Industry-standard voting & whiteboards"),
        frameio: c("none", "화이트보드·공간 예약 미지원", "No whiteboard or room booking"),
      },
    },
    {
      id: "seat-cost-sovereignty",
      subGroupId: "ops-sovereignty",
      title: t("팀 협업 좌석 비용 & 원본 데이터 로컬 주권", "Team Seat Cost & Local Data Sovereignty"),
      metricTag: t("베타 ₩0 · OPFS/SQLite 로컬 보관", "KRW 0 beta · local OPFS/SQLite"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "협업 툴마다 좌석당 구독료가 누적되는 인디/소규모 웹툰 팀 부담을 줄이기 위해 로컬 우선·₩0 베타 구조를 채택",
        "Designed to relieve stacked per-seat SaaS fees for indie webtoon teams with local-first KRW 0 beta ownership",
      ),
      evidenceSummary: t(
        "베타 기간 전 기능 무료이며 작업 원본은 브라우저 SQLite+OPFS에 우선 보관해 서비스 종료나 구독 중단 시에도 기기에 남습니다.",
        "All beta features are KRW 0 and manuscripts stay locally authoritative in OPFS/SQLite even without a subscription.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/studio-workspace-sqlite-runtime.ts",
        "apps/web/src/domains/creator/live/studio-crdt-recovery-vault.ts",
      ],
      honestLimit: t(
        "정식 유료화 이후 대용량 클라우드 스토리지·전용 서버 슬롯은 유지비 실비 수준의 선택 플랜이 도입될 예정입니다.",
        "Post-beta large cloud storage and dedicated team relays may introduce optional cost-covering tiers.",
      ),
      cells: {
        toonstudio: c("full", "베타 ₩0 · 기기 로컬 OPFS 원본 보관", "KRW 0 beta · local OPFS source ownership"),
        magma: c("partial", "무료 티어 제한 · 팀 기능 좌석 구독", "Free limits; team controls require paid seats"),
        gather: c("partial", "소규모 무료 · 팀 인당 월 구독", "Small free tier; per-user monthly billing"),
        zep: c("partial", "무료 제한 · 확장 시 월 구독", "Free limits; paid scaling plans"),
        figma: c("partial", "스타터 제한 · 에디터 좌석당 구독", "Starter limits; per-editor seat fees"),
        creco: c("partial", "스튜디오/팀 SaaS 유료 구독", "Paid studio/agency SaaS subscription"),
        miro: c("partial", "3보드 무료 · 멤버당 월 구독", "3 free boards; per-member subscription"),
        frameio: c("partial", "소용량 무료 · 팀/용량별 구독", "Small free tier; paid team/storage plans"),
      },
    },
  ],
  honestTradeoffs: [
    {
      competitorId: "magma",
      competitorName: "Magma Studio",
      area: t("30인 동시 아트잼 & 검증된 멀티플레이어 드로잉", "30-artist live art jams & proven multiplayer drawing"),
      competitorEdge: t(
        "수년간 글로벌 커뮤니티에서 검증된 최대 30인 동시 드로잉 잼 룸 안정성과 즉흥 협업 문화가 강점입니다.",
        "Years of battle-tested 30-artist live drawing jam rooms and active global art-jam community.",
      ),
      toonstudioPosition: t(
        "단발성 아트잼보다 웹툰 연재 팀의 오프라인 내구성(Yjs CRDT+OPFS), 분업 권한, 검수 핀, 3D 배경 연동을 하나로 묶었습니다.",
        "Optimizes for ongoing webtoon production teams with offline-first Yjs CRDT, Division OS RBAC and review pins.",
      ),
    },
    {
      competitorId: "figma",
      competitorName: "Figma / FigJam & Miro",
      area: t("초대형 무한 보드·디자인 시스템·플러그인 생태계", "Massive infinite boards, design systems & plugins"),
      competitorEdge: t(
        "수백 명이 동시에 기획·UI 설계를 진행하는 무한 캔버스 성능과 수천 개 서드파티 플러그인은 업계 최고입니다.",
        "Unrivaled infinite-canvas performance for large product workshops and thousands of third-party plugins.",
      ),
      toonstudioPosition: t(
        "UI 기획 보드를 대체하기보다, 실제 웹툰 원고 캔버스·리뷰 핀·분업 락 바로 옆에서 필요한 화이트보드·투표를 통합합니다.",
        "Embeds focused whiteboards and polls directly beside live comic canvases, review pins and layer locks.",
      ),
    },
    {
      competitorId: "gather",
      competitorName: "Gather Town & ZEP",
      area: t("대규모 100+ 동시 접속 가상 행사 & 근접 화상 SFU", "100+ concurrent virtual events & proximity video SFU"),
      competitorEdge: t(
        "수백~수천 명 규모의 가상 컨퍼런스·교육장과 안정적인 상용 근접 화상 서버 인프라에서 크게 앞섭니다.",
        "Far more mature for 100–1,000+ attendee virtual conferences and dedicated commercial WebRTC video SFUs.",
      ),
      toonstudioPosition: t(
        "대형 행사장 대신 2~20인 웹툰 제작 팀이 원고를 열어 두고 모이는 창작 전용 가상 스튜디오와 ₩0 절차적 효과음에 집중했습니다.",
        "Tailored to 2–20 person creative teams working directly on manuscripts with zero-cost procedural WebAudio.",
      ),
    },
    {
      competitorId: "frameio",
      competitorName: "Frame.io / SyncSketch & Creco",
      area: t("영상 타임코드 프레임 리뷰 & 한국 에이전시 운영 경험", "Video timecode review & agency production operations"),
      competitorEdge: t(
        "Frame.io/SyncSketch는 방송·애니메이션 영상 프레임 검수 표준이며, Creco는 국내 대형 웹툰 에이전시 실무에 깊게 자리 잡았습니다.",
        "Frame.io/SyncSketch lead broadcast video review, while Creco is deeply embedded in Korean agency workflows.",
      ),
      toonstudioPosition: t(
        "별도 파일 내보내기·재업로드 없이 원고 편집 캔버스 내부에서 좌표 핀·프레임 비교·승인을 바로 이어서 처리합니다.",
        "Eliminates export/re-upload cycles by keeping spatial pins, frame compare and approvals inside the authoring studio.",
      ),
    },
  ],
};
