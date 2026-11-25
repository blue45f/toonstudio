/**
 * ToonStudio `/tech` 발표 덱 보조 데이터: WebRTC 24파일 프로토콜 · 실측 희귀 웹 API 18종 · 관련 용어집.
 *
 * - 근거 문서: `docs/technology/toonstudio-webrtc-realtime-media-2026-09-25.md`
 * - 파일 수 표기는 `apps/web/src/` 실측 기준이며, 소규모 P2P 검증 범위와 미검증 WAN/SFU 경계를 구분한다.
 * - 원시 색상 코드(hex/rgb/hsl) 및 과장 카피를 쓰지 않는다.
 */

import type { BilingualText } from "./competitor-benchmark-data";

export type TechDeckStatus = "current" | "expanding";
export type TechDiagramTone = "accent" | "cool" | "good" | "warn";
export type TechGlossaryCategory =
  | "rendering"
  | "hardware"
  | "ai"
  | "storage-sync"
  | "ux-web"
  | "trust-security";
export type TechAiExecutionMode = "on-device" | "zero-bill-api" | "hybrid";
export type TechRareApiCategory = "compute-memory" | "storage-security" | "media-realtime" | "input-ux";

export interface TechDiagramNode {
  readonly stage: string;
  readonly label: BilingualText;
  readonly metric: BilingualText;
  readonly tone: TechDiagramTone;
}

export interface TechPresentationSlide {
  readonly id: string;
  readonly slideNumber: number;
  readonly sectionTag: BilingualText;
  readonly brandSystem: string;
  readonly status: TechDeckStatus;
  readonly title: BilingualText;
  readonly summary: BilingualText;
  readonly spritePath: string;
  readonly spriteAlt: BilingualText;
  readonly diagramTitle: BilingualText;
  readonly diagramNodes: readonly TechDiagramNode[];
  readonly whyChosen: BilingualText;
  readonly whereUsed: BilingualText;
  readonly reusePlaybook: BilingualText;
  readonly plainBackground: BilingualText;
  readonly tradeoff: BilingualText;
  readonly speakerNotes: BilingualText;
  readonly repoPaths: readonly string[];
}

export interface TechAiShowcaseModule {
  readonly id: string;
  readonly code: string;
  readonly brandTag: string;
  readonly status: TechDeckStatus;
  readonly executionMode: TechAiExecutionMode;
  readonly title: BilingualText;
  readonly whatItSolves: BilingualText;
  readonly howItWorks: BilingualText;
  readonly whereUsed: BilingualText;
  readonly reuseCase: BilingualText;
  readonly repoPaths: readonly string[];
}

export interface TechPlainGlossaryEntry {
  readonly id: string;
  readonly category: TechGlossaryCategory;
  readonly term: BilingualText;
  readonly oneLineAnalogy: BilingualText;
  readonly technicalMeaning: BilingualText;
  readonly usedInSlideNumbers: readonly number[];
}

export interface WebRtcAuthorityMatrixRow {
  readonly id: string;
  readonly concern: BilingualText;
  readonly authority: BilingualText;
  readonly technology: BilingualText;
  readonly durability: BilingualText;
}

export interface WebRtcProtocolPillar {
  readonly id: string;
  readonly indexLabel: string;
  readonly title: BilingualText;
  readonly summary: BilingualText;
  readonly why: BilingualText;
  readonly where: BilingualText;
  readonly reuse: BilingualText;
  readonly repoPaths: readonly string[];
}

export interface RareWebPlatformApiEntry {
  readonly id: string;
  readonly name: string;
  readonly fileCount: number;
  readonly category: TechRareApiCategory;
  readonly tone: TechDiagramTone;
  readonly flowSteps: readonly string[];
  readonly why: BilingualText;
  readonly whereUsed: BilingualText;
  readonly reusePlaybook: BilingualText;
  readonly repoPath: string;
}

const bi = (ko: string, en: string): BilingualText => ({ ko, en });

const dn = (
  stage: string,
  labelKo: string,
  labelEn: string,
  metricKo: string,
  metricEn: string,
  tone: TechDiagramTone,
): TechDiagramNode => ({ stage, label: bi(labelKo, labelEn), metric: bi(metricKo, metricEn), tone });

export const WEBRTC_EVIDENCE_DOC_PATH = "docs/technology/toonstudio-webrtc-realtime-media-2026-09-25.md";
export const WEBRTC_MEASURED_FILE_COUNT = 24;

export const WEBRTC_AUTHORITY_MATRIX: readonly WebRtcAuthorityMatrixRow[] = [
  {
    id: "work-document",
    concern: bi("작품 문서", "Artwork document"),
    authority: bi("Studio document / CRDT", "Studio document / CRDT"),
    technology: bi("Yjs · command journal", "Yjs & command journal"),
    durability: bi("영속", "Durable"),
  },
  {
    id: "room-admission",
    concern: bi("방 입장 제어", "Room admission"),
    authority: bi("서버 membership", "Server membership"),
    technology: bi("Cloudflare Durable Objects 기본 · Socket.IO 폴백 · ACL", "Cloudflare Durable Objects default, Socket.IO fallback & ACL"),
    durability: bi("세션 · 원장", "Session & ledger"),
  },
  {
    id: "presence",
    concern: bi("참가자 Presence", "Participant presence"),
    authority: bi("room awareness", "Room awareness"),
    technology: bi("방 서버 / direct port", "Room server / direct port"),
    durability: bi("일시적", "Ephemeral"),
  },
  {
    id: "webrtc-signaling",
    concern: bi("WebRTC 시그널링", "WebRTC signaling"),
    authority: bi("대상 지정 envelope", "Targeted envelope"),
    technology: bi("허들 SDP·ICE는 DataChannel studio-direct-v1 · 메시 부트스트랩/화면공유는 방 서버", "Huddle SDP/ICE over DataChannel studio-direct-v1; mesh bootstrap & screen-share via room server"),
    durability: bi("일시적", "Ephemeral"),
  },
  {
    id: "direct-chat-reaction",
    concern: bi("직접 채팅 · 리액션", "Direct chat & reactions"),
    authority: bi("P2P direct port", "P2P direct port"),
    technology: bi("크기 제한 JSON 패킷 (48KiB · 2,000자 상한)", "Bounded JSON packets (48 KiB / 2,000-char cap)"),
    durability: bi("메모리", "In-memory"),
  },
  {
    id: "audio-video-screen",
    concern: bi("음성 · 카메라 · 화면", "Voice, camera & screen"),
    authority: bi("peer connection", "Peer connection"),
    technology: bi("RTP media tracks (허들 원격 3명 · 화면공유 시청자 4명)", "RTP media tracks (3 remote huddle peers / 4 screen-share viewers)"),
    durability: bi("일시적", "Ephemeral"),
  },
  {
    id: "ice-policy",
    concern: bi("ICE 정책", "ICE policy"),
    authority: bi("인증된 ICE policy lease", "Verified ICE policy lease"),
    technology: bi("STUN 전용 (stun:stun.cloudflare.com:3478 · TURN 미사용)", "STUN-only (stun:stun.cloudflare.com:3478, no TURN)"),
    durability: bi("없음", "None"),
  },
  {
    id: "review-voice-note",
    concern: bi("검수 음성 메모", "Review voice note"),
    authority: bi("project graph API", "Project graph API"),
    technology: bi("MediaRecorder + object storage", "MediaRecorder + object storage"),
    durability: bi("영속", "Durable"),
  },
];

export const WEBRTC_PROTOCOL_PILLARS: readonly WebRtcProtocolPillar[] = [
  {
    id: "authority-matrix-split",
    indexLabel: "01",
    title: bi("8대 데이터 권위 매트릭스 분리", "8-Plane Data Authority Matrix"),
    summary: bi(
      "문서(Yjs), 입장 제어(Cloudflare Durable Objects), 허들 시그널링(DataChannel studio-direct-v1), 미디어(RTP), ICE 정책(STUN 전용)을 하나의 realtime 상태로 섞지 않고 책임별로 나눴습니다.",
      "Splits Yjs documents, Durable Objects room admission, DataChannel studio-direct-v1 signaling, RTP tracks, and STUN-only ICE leases instead of bundling everything into one realtime flag.",
    ),
    why: bi("채팅·통화 설정이 방 서버로 새거나 미디어 장애가 원고 저장을 망가뜨리지 않도록 각 관심사에 단일 권위를 배정했습니다.", "Assigning one authority per concern prevents media failures from corrupting artwork saves and keeps huddle chat off the signaling server."),
    where: bi("가상 스튜디오 허들, 직통 P2P 오버레이, 화면 공유 승인 흐름 전반에 적용했습니다.", "Governs Virtual Studio huddles, the direct P2P overlay transport, and explicit screen-share approval flows."),
    reuse: bi("원격 화이트보드, 온라인 합주실, 협업 문서 에디터에서 문서·권한·시그널링·미디어 경계를 나눌 때 그대로 채택할 수 있습니다.", "Reusable blueprint for splitting document state, admission ACLs, signaling, and media in collaborative editors or virtual rooms."),
    repoPaths: [
      WEBRTC_EVIDENCE_DOC_PATH,
      "apps/web/src/domains/creator/live/studio-live-p2p-overlay-transport.ts",
      "apps/web/src/domains/creator/live/studio-ice-configuration.ts",
    ],
  },
  {
    id: "perfect-negotiation-epoch",
    indexLabel: "02",
    title: bi("Perfect Negotiation · Glare 해소 · Peer Epoch 폐기", "Perfect Negotiation, Glare Resolution & Peer Epoch Discard"),
    summary: bi(
      "피어 링크마다 makingOffer · ignoreOffer · settingAnswer 상태와 polite/impolite 역할을 두어 동시 offer 충돌(Glare)을 풀고, 이전 peer epoch의 늦은 신호는 즉시 폐기합니다.",
      "Tracks makingOffer, ignoreOffer, and settingAnswer per link with polite/impolite roles to settle simultaneous offers, discarding any stale signal from an older peer epoch.",
    ),
    why: bi("양쪽 브라우저가 동시에 카메라를 켜면 SDP offer가 정면충돌해 통화가 먹통이 됩니다. 표준 상태 머신과 epoch 태그로 이전 세션 잔여 패킷까지 차단합니다.", "Simultaneous camera toggles cause SDP glare deadlocks; a deterministic state machine plus peer epochs blocks stale cross-session signals."),
    where: bi("P2P 허들 컨트롤러의 offer/answer 협상 루프, ICE 큐 상한, 패킷 파서(48KiB 제한)에 구현했습니다.", "Implemented in the P2P huddle negotiation loop, bounded pending ICE queues, and 48 KiB packet parser."),
    reuse: bi("1:1·소규모 P2P 화상 상담, 브라우저 파일 전송, 원격 페어 프로그래밍 도구에 표준 협상 패턴으로 적용할 수 있습니다.", "Drop-in negotiation pattern for peer video consults, browser P2P file sharing, and remote pair-programming sessions."),
    repoPaths: [
      "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts",
      "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts",
    ],
  },
  {
    id: "late-stream-stop-replace-track",
    indexLabel: "03",
    title: bi("권한 팝업 중 스코프 변경 시 즉시 stop() & sender.replaceTrack()", "Stale Permission Stream stop() & Seamless sender.replaceTrack()"),
    summary: bi(
      "장치를 켠 뒤 브라우저 권한 창이 떠 있는 사이에 방·역할·세션 세대가 바뀌면 늦게 도착한 MediaStream 트랙을 즉시 stop()하고, 정상 전환 시에는 sender.replaceTrack()으로 재협상 없이 교체합니다.",
      "Re-checks authority and capture revision after every device prompt—stopping stale tracks immediately if room/role changed, and swapping valid tracks via sender.replaceTrack() without full renegotiation.",
    ),
    why: bi("사용자가 다른 방으로 옮겼는데 뒤늦게 열린 마이크가 새 방에 송출되는 사고를 막고, 카메라·화면 공유 전환 시 끊김을 줄입니다.", "Prevents a delayed microphone grant from leaking audio into a different room while avoiding full renegotiation during camera/screen switches."),
    where: bi("허들 장치 캡처 가드(`authorityValid` · `captureRevision`), 카메라 전면/후면 전환, 양방향 동의 화면 공유 모듈에 적용했습니다.", "Enforced in huddle capture guards (`authorityValid`, `captureRevision`), camera switching, and two-way consented screen sharing."),
    reuse: bi("다중 채널 음성 채팅, 원격 진료 대기실, 면접/시험 감독 웹앱의 장치 권한 경합 방지 패턴으로 바로 재사용할 수 있습니다.", "Essential race-condition guard for multi-room voice chat, telehealth waiting rooms, and live proctoring web apps."),
    repoPaths: [
      "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts",
      "apps/web/src/domains/creator/studio-screen-share.ts",
    ],
  },
  {
    id: "bounded-ice-restart-recipient-scope",
    indexLabel: "04",
    title: bi("제한형 ICE Restart 백오프 & 실제 수신자 범위 우선 표시", "Bounded ICE Restart Backoff & Real Recipient Scope First"),
    summary: bi(
      "연결이 failed/disconnected가 되어도 무한 재시도하지 않고 최소 간격과 횟수 상한 안에서 restartIce()를 수행하며, 아바타 거리보다 실제 RTP 수신자 범위(Recipient Scope)를 화면에 우선 표시합니다.",
      "Limits automatic restartIce() attempts with cooldown backoff instead of infinite loops, and displays actual RTP recipient scope ahead of visual avatar distance.",
    ),
    why: bi("2026-10-11 비용 정책으로 TURN 중계를 쓰지 않으므로, UDP가 막힌 환경에서 헛도는 재접속을 멈추고 누가 실제로 내 음성을 받는지 정확히 알려야 합니다.", "Because TURN relays are disabled by policy (2026-10-11), bounded backoff stops retry storms on blocked UDP networks and keeps recipient visibility unambiguous."),
    where: bi("허들 ICE 복구 제어기, STUN 전용 ICE 정책 리스, 가상 스튜디오 RTC 진단 패널과 수신자 배지에 연결했습니다.", "Wired into huddle ICE recovery, STUN-only ICE policy leases, Virtual Space RTC diagnostics, and recipient scope indicators."),
    reuse: bi("가상 오피스, 공간 음향 커뮤니티, 실시간 브리핑룸에서 '화면에 보이는 거리'와 '실제 오디오 수신자' 불일치를 없애는 UI 계약으로 쓸 수 있습니다.", "Reusable UX and recovery contract for virtual offices and spatial rooms where visible distance must never misstate true media recipients."),
    repoPaths: [
      "apps/web/src/domains/creator/studio-voice-ice-policy.ts",
      "apps/web/src/domains/creator/virtual-space/studio-virtual-space-rtc-diagnostics.ts",
    ],
  },
];

export const TECH_RARE_WEB_API_CATEGORIES: readonly {
  readonly id: "all" | TechRareApiCategory;
  readonly label: BilingualText;
}[] = [
  { id: "all", label: bi("전체 18종", "All 18 APIs") },
  { id: "compute-memory", label: bi("연산 · 메모리", "Compute & Memory") },
  { id: "storage-security", label: bi("저장 · 보안 · 동기화", "Storage, Security & Sync") },
  { id: "media-realtime", label: bi("미디어 · 실시간 통신", "Media & Realtime") },
  { id: "input-ux", label: bi("입력 · 디바이스 · UX", "Input, Device & UX") },
];

export const TECH_RARE_WEB_APIS_18: readonly RareWebPlatformApiEntry[] = [
  {
    id: "offscreen-canvas",
    name: "OffscreenCanvas",
    fileCount: 101,
    category: "compute-memory",
    tone: "accent",
    flowSteps: ["Main UI", "Worker Canvas", "ImageBitmap"],
    why: bi("블러 필터, 썸네일 생성, 대용량 레이어 래스터화를 메인 스레드에서 떼어내 브러시 입력 지연을 줄입니다.", "Moves filter kernels, thumbnails, and raster work off the main thread so stylus input stays responsive."),
    whereUsed: bi("스튜디오 웹 저작 런타임, 고급 블러 필터 커널, 백그라운드 프리뷰 워커 101개 파일에 걸쳐 사용합니다.", "Used across 101 files covering the studio authoring runtime, blur filter kernels, and preview workers."),
    reusePlaybook: bi("브라우저 이미지 편집기, 차트/지도 대량 렌더링, PDF 미리보기 워커 파이프라인에 적용할 수 있습니다.", "Transferable to browser photo editors, dense chart/map renderers, and worker-driven PDF previews."),
    repoPath: "apps/web/src/domains/creator/studio-web-runtime/studio-web-authoring-runtime.ts",
  },
  {
    id: "webcrypto-subtle",
    name: "WebCrypto crypto.subtle",
    fileCount: 91,
    category: "storage-security",
    tone: "good",
    flowSteps: ["PBKDF2 310K", "AES-GCM 256", "SHA-256 Digest"],
    why: bi("외부 암호 라이브러리 번들 없이 브라우저 네이티브 PBKDF2·AES-GCM·SHA-256으로 키 보관함과 패키지 무결성을 검증합니다.", "Provides native PBKDF2, AES-GCM, and SHA-256 for encrypted local vaults and package verification without heavy JS crypto libraries."),
    whereUsed: bi("사용자 AI 키 로컬 암호화 보관함(310,000회 PBKDF2 + AES-GCM), 마켓플레이스 에셋 해시 검증 등 91개 파일에서 씁니다.", "Powers the local user-AI key vault (310k PBKDF2 + AES-GCM) and marketplace package integrity checks across 91 files."),
    reusePlaybook: bi("BYOK(사용자 키 직접 입력) SaaS, 오프라인 문서 암호화, 클라이언트 파일 해시 검수에 그대로 쓸 수 있습니다.", "Directly reusable for BYOK SaaS vaults, encrypted offline notes, and client-side artifact hashing."),
    repoPath: "apps/web/src/shared/ai/user-ai-crypto.ts",
  },
  {
    id: "broadcast-channel",
    name: "BroadcastChannel",
    fileCount: 75,
    category: "storage-security",
    tone: "cool",
    flowSteps: ["Tab A Edit", "Origin Bus", "Tab B Sync"],
    why: bi("같은 출처의 여러 스튜디오 탭이 서버를 거치지 않고 세션 상태·역할 전환·리더 탭 알림을 즉시 동기화합니다.", "Synchronizes session state, role switches, and tab leadership across same-origin tabs without server round-trips."),
    whereUsed: bi("게스트 세션 동기화, 창작자 역할 워크스페이스 스토어, 멀티탭 리더 조율 등 75개 파일에 배치했습니다.", "Wired into guest session sync, creator role workspace stores, and multi-tab coordination across 75 files."),
    reusePlaybook: bi("멀티탭 대시보드 로그아웃 전파, 듀얼 모니터 웹앱 보조 창 제어, 로컬 캐시 무효화에 유용합니다.", "Great fit for multi-tab auth sync, dual-window web workspaces, and local cache invalidation."),
    repoPath: "apps/web/src/shared/lib/creator-role-workspace-store.ts",
  },
  {
    id: "shared-array-buffer",
    name: "SharedArrayBuffer",
    fileCount: 61,
    category: "compute-memory",
    tone: "accent",
    flowSteps: ["COOP/COEP", "Shared Ring", "Atomics"],
    why: bi("워커 간 거대한 픽셀·오디오 버퍼를 직렬화 복사 없이 공유해 메모리 피크와 GC 멈춤을 줄입니다.", "Shares large pixel and audio buffers across workers without structured-clone copies or GC spikes."),
    whereUsed: bi("Memory64 크로스-리얼름 워커, 서비스워커 격리 정책 검사, 멀티스레드 브러시 연산 경로 등 61개 파일에서 다룹니다.", "Used in Memory64 cross-realm workers, isolation policy checks, and multithreaded brush paths across 61 files."),
    reusePlaybook: bi("WASM 멀티스레드 영상/오디오 처리, 웹 게임 물리 워커, 브라우저 과학 계산 도구에 적용합니다.", "Reusable for multithreaded WASM media encoders, web game physics workers, and browser compute tools."),
    repoPath: "apps/web/src/domains/creator/kernel/Memory64CrossRealmWorker.ts",
  },
  {
    id: "pointer-coalesced-predicted",
    name: "PointerEvent.getCoalesced/PredictedEvents",
    fileCount: 32,
    category: "input-ux",
    tone: "accent",
    flowSteps: ["240Hz Nib", "Coalesced Path", "Predicted Tip"],
    why: bi("화면 주사율(60Hz) 사이에 버려지는 고주사율 스타일러스 중간 좌표를 전부 복원하고, 한 프레임 앞 궤적을 미리 그려 선 지연감을 줄입니다.", "Recovers sub-frame high-frequency stylus samples dropped at 60Hz and previews one frame ahead to cut visual ink lag."),
    whereUsed: bi("컷툰 라이브 스트로크 브리지, 브러시 v6 엔진, 스타일러스 필압 보정 패널 등 32개 파일에서 호출합니다.", "Called in the live stroke bridge, brush v6 engine, and stylus pressure calibrator across 32 files."),
    reusePlaybook: bi("웹 필기 노트, 전자서명 패드, 제스처 화이트보드, 정밀 벡터 펜 툴에 바로 적용할 수 있습니다.", "Ideal for browser note-taking, e-signature pads, gesture canvases, and precision vector tools."),
    repoPath: "apps/web/src/domains/creator/studio-cuttoon-editor/studio-live-stroke-foley-bridge.ts",
  },
  {
    id: "web-locks",
    name: "Web Locks navigator.locks",
    fileCount: 28,
    category: "storage-security",
    tone: "cool",
    flowSteps: ["Tab A Lock", "Exclusive Write", "Crash Auto-Release"],
    why: bi("두 탭이 동시에 같은 OPFS/SQLite 프로젝트 파일을 덮어쓰다 DB가 깨지는 사고를 브라우저 내장 배타 락으로 막고, 탭이 죽으면 OS 수준에서 자동 해제합니다.", "Prevents two tabs from corrupting the same OPFS/SQLite project concurrently and auto-releases locks if a tab crashes."),
    whereUsed: bi("웹 저작 프로젝트 v3 저장소, 제작 잡 레포지토리, 리소스 워크스페이스 직렬화 등 28개 파일에서 사용합니다.", "Guards the v3 authoring project repository, production job store, and resource workspace across 28 files."),
    reusePlaybook: bi("로컬 SQLite/IndexedDB 앱, 오프라인 동기화 큐, 단일 리더 백그라운드 잡 스케줄러에 필수 패턴입니다.", "Essential concurrency guard for local-first IndexedDB/SQLite apps and single-leader sync queues."),
    repoPath: "apps/web/src/domains/creator/studio-web-runtime/studio-web-authoring-project-v3-repository.ts",
  },
  {
    id: "webrtc",
    name: "WebRTC",
    fileCount: 24,
    category: "media-realtime",
    tone: "good",
    flowSteps: ["DO Admission", "studio-direct-v1", "RTP + STUN"],
    why: bi("음성·카메라·화면 공유와 직접 채팅을 브라우저 간 P2P로 처리해 미디어 중계 서버 비용 없이 소규모 팀 협업을 엽니다.", "Streams huddle voice, camera, screen share, and direct chat peer-to-peer so small teams collaborate without media relay servers."),
    whereUsed: bi("P2P 허들 컨트롤러/프로토콜, STUN 전용 ICE 설정, 양방향 동의 화면 공유, 가상 스튜디오 RTC 진단 24개 파일에 구현했습니다.", "Implemented across 24 files covering P2P huddle negotiation, STUN-only ICE config, consented screen share, and RTC diagnostics."),
    reusePlaybook: bi("소규모 원격 리뷰 룸, 브라우저 페어 작업실, 저비용 P2P 파일·커서 공유 기능에 적용할 수 있습니다.", "Reusable for small creative review rooms, browser pair-work spaces, and zero-relay cursor/data meshes."),
    repoPath: "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts",
  },
  {
    id: "webcodecs",
    name: "WebCodecs",
    fileCount: 20,
    category: "media-realtime",
    tone: "warn",
    flowSteps: ["Synthetic Frame", "VideoEncoder", "Codec Check"],
    why: bi("영상 출력을 준비할 때 브라우저가 지원하는 코덱을 작은 합성 프레임으로 점검합니다.", "Checks which codecs the browser can use by encoding small synthetic frames."),
    whereUsed: bi("인용한 릴스 검사기는 64×64 합성 프레임에서 생성된 청크를 점검합니다. 범위는 코덱 사전 확인입니다.", "The cited reels probe checks encoded chunks from 64×64 synthetic frames as a codec preflight."),
    reusePlaybook: bi("브라우저 영상 편집기나 화면 녹화 도구가 내보내기 전에 설정을 확인하는 데 활용할 수 있습니다.", "Video editors and screen recorders can use this preflight to check encoder settings."),
    repoPath: "apps/web/src/domains/creator/webcodecs-opfs-engine/webcodecs-reels-encoder.ts",
  },
  {
    id: "compression-streams",
    name: "CompressionStream/DecompressionStream",
    fileCount: 13,
    category: "storage-security",
    tone: "cool",
    flowSteps: ["Delta Chunk", "gzip/deflate", "OPFS Spill"],
    why: bi("pako/fflate 같은 JS 압축 번들 의존성 없이 브라우저 스트림 파이프라인으로 되돌리기 델타와 PNG/PDF 페이로드를 즉시 압축합니다.", "Compresses undo deltas and PNG/PDF streams natively in browser pipelines without shipping JS compression libraries."),
    whereUsed: bi("무한 캔버스 히스토리 OPFS 스필 저장소, 컬러 프루프 PNG, 3D 스트리밍 PNG 생성 13개 파일에 적용했습니다.", "Powers infinite history OPFS spill storage, color-proof PNGs, and streaming 3D PNGs across 13 files."),
    reusePlaybook: bi("로그 압축 업로드, 오프라인 백업 아카이브, 브라우저 대용량 JSON/바이너리 저장소 최적화에 쓸 수 있습니다.", "Handy for compressed telemetry uploads, offline backup bundles, and large local JSON/binary stores."),
    repoPath: "apps/web/src/domains/creator/session-endurance/history-opfs-spill-store.ts",
  },
  {
    id: "eye-dropper",
    name: "EyeDropper",
    fileCount: 13,
    category: "input-ux",
    tone: "accent",
    flowSteps: ["OS Screen", "EyeDropper()", "OKLCH Swatch"],
    why: bi("브라우저 탭 바깥의 레퍼런스 이미지나 참고 창에서 원하는 픽셀 색상을 바로 채집해 캔버스 팔레트로 가져옵니다.", "Samples reference colors directly from any window outside the browser tab into the studio swatch."),
    whereUsed: bi("스튜디오 색상 추출·Color-to-Alpha 패널, 차세대 웹 능력 프로브, 실험 설정 13개 파일에서 연동합니다.", "Integrated into Color-to-Alpha, eyedropper panels, capability probes, and lab settings across 13 files."),
    reusePlaybook: bi("디자인 시스템 토큰 빌더, 브랜드 컬러 팔레트 도구, 웹 사진 보정기에서 외부 참고색 채집에 유용합니다.", "Useful in design-token editors, brand palette builders, and browser photo retouching tools."),
    repoPath: "apps/web/src/domains/creator/StudioColorToAlphaPanel.tsx",
  },
  {
    id: "compute-pressure",
    name: "Compute Pressure",
    fileCount: 11,
    category: "compute-memory",
    tone: "warn",
    flowSteps: ["CPU Pressure", "nominal..critical", "PID Degrade"],
    why: bi("장시간 드로잉·3D 연출 중 기기 CPU 부하가 serious/critical로 오르기 전에 감지해 4단 안전 강등 판단 근거로 씁니다.", "Reads nominal-to-critical CPU pressure states early so long sessions can step down background workload before throttling."),
    whereUsed: bi("공용 Compute Pressure 관측 래퍼, ToonSilicon 열 제어 엔진, 차세대 플랫폼 가속기 11개 파일에 배치했습니다.", "Wired into the shared PressureObserver wrapper, ToonSilicon thermal engine, and platform probes across 11 files."),
    reusePlaybook: bi("웹 화상회의 해상도 자동 조절, 브라우저 게임 프레임 가드, 백그라운드 워커 스로틀링에 쓸 수 있습니다.", "Reusable for adaptive video-call resolution, web game quality scaling, and background worker throttling."),
    repoPath: "apps/web/src/shared/lib/compute-pressure.ts",
  },
  {
    id: "webxr",
    name: "WebXR",
    fileCount: 10,
    category: "input-ux",
    tone: "cool",
    flowSteps: ["navigator.xr", "Support Check", "Stage Coordinates"],
    why: bi("브라우저의 WebXR 지원을 확인하고, 3D 무대와 공간 리더에 쓸 좌표를 계산합니다.", "Checks browser WebXR support and computes coordinates for stage and spatial reader previews."),
    whereUsed: bi("공간 기기 허브의 지원 감지와 무대 좌표 계산에서 확인할 수 있습니다. 헤드셋 세션과 렌더링은 별도 기기 검증이 필요합니다.", "The spatial device hub checks support and models stage coordinates. Headset sessions and rendering need separate device verification."),
    reusePlaybook: bi("웹 건축/인테리어 투어, 3D 상품 공간 배치 미리보기, 온라인 전시관 뷰어에 적용할 수 있습니다.", "Transferable to web architectural walkthroughs, 3D product previews, and virtual exhibition viewers."),
    repoPath: "apps/web/src/domains/creator/spatial-device-hub/ar-glass-vr-webxr-stage.ts",
  },
  {
    id: "view-transitions",
    name: "View Transitions",
    fileCount: 8,
    category: "input-ux",
    tone: "good",
    flowSteps: ["Old Snapshot", "180ms Crossfade", "Motion Guard"],
    why: bi("무거운 JS 애니메이션 라이브러리 없이 DOM 스냅샷 간 180ms 네이티브 전환을 실행하고, 모션 감소 시 즉시 동기 갱신합니다.", "Runs 180ms native DOM snapshot cross-fades without JS animation libraries while honoring reduced-motion immediately."),
    whereUsed: bi("`/tech`·`/compare/studio` 탭·슬라이드 전환 래퍼, 라우터 UX 모델, 능력 프로브 8개 파일에서 사용합니다.", "Powers `/tech` and `/compare/studio` tab/slide transitions, router UX helpers, and probes across 8 files."),
    reusePlaybook: bi("멀티뷰 문서 포털, 이커머스 필터 전환, SPA 대시보드 탭 전환에 안전 폴백과 함께 도입할 수 있습니다.", "Clean drop-in upgrade for docs portals, commerce filters, and dashboard view switches."),
    repoPath: "apps/web/src/domains/showcase/nextgen-web-platform-enhancer.ts",
  },
  {
    id: "opfs",
    name: "OPFS",
    fileCount: 8,
    category: "storage-security",
    tone: "good",
    flowSteps: ["SQLite WASM", "Private FS", "Crash Recovery"],
    why: bi("IndexedDB 직렬화 병목 없이 브라우저 전용 비공개 파일시스템에 SQLite 저널과 대용량 캔버스 타일을 직접 읽고 씁니다.", "Bypasses IndexedDB serialization overhead to store SQLite journals and canvas tile chunks in a private origin filesystem."),
    whereUsed: bi("스튜디오 OPFS 파일시스템 어댑터, VRM 에셋 SQLite+OPFS 저장소, 자가치유 복구 엔진 8개 파일에 연결했습니다.", "Backs the studio OPFS adapter, VRM SQLite repository, and crash self-heal store across 8 files."),
    reusePlaybook: bi("오프라인 우선 IDE, 브라우저 영상/오디오 프로젝트 저장소, 로컬 SQLite 기반 생산성 앱에 표준 저장층으로 씁니다.", "Core local storage layer for offline-first IDEs, browser media suites, and local SQLite web apps."),
    repoPath: "apps/web/src/domains/creator/studio-opfs-filesystem.ts",
  },
  {
    id: "file-system-access",
    name: "File System Access",
    fileCount: 7,
    category: "storage-security",
    tone: "cool",
    flowSteps: ["Save Picker", "IDB Handle", "Direct Overwrite"],
    why: bi("매번 다운로드 폴더에 `(1)`, `(2)` 사본이 쌓이는 대신, 사용자가 고른 로컬 파일 핸들을 보존해 같은 파일에 직접 덮어씁니다.", "Persists the chosen file handle in IndexedDB so creators overwrite the exact local file instead of piling up download copies."),
    whereUsed: bi("공용 File System Access 래퍼(권한 확인·취소 구분), 웹 저작 패키지 직접 저장 경로 7개 파일에 적용했습니다.", "Used in the shared File System Access wrapper and direct project-package save flows across 7 files."),
    reusePlaybook: bi("웹 코드 에디터, 로컬 Markdown/JSON 설정 도구, 브라우저 디자인 산출물 직접 저장 기능에 적합합니다.", "Great fit for browser code editors, local config tools, and direct-save creative exporters."),
    repoPath: "apps/web/src/shared/lib/file-system-access.ts",
  },
  {
    id: "screen-wake-lock",
    name: "Screen Wake Lock",
    fileCount: 7,
    category: "input-ux",
    tone: "warn",
    flowSteps: ["wakeLock.request", "Active Drawing", "visibilitychange"],
    why: bi("긴 컷 연출, 타임랩스 녹화, 정주행 열람 중 태블릿·노트북 화면이 절전으로 꺼져 흐름이 끊기는 불편을 줄입니다.", "Keeps tablet and laptop screens awake during long drawing, timelapse export, or reading sessions, releasing cleanly when hidden."),
    whereUsed: bi("공용 `screen-wake-lock.ts` 리스 래퍼, 장시간 작화·열람 훅, 웹 플랫폼 진단 7개 파일에서 관리합니다.", "Managed via the `screen-wake-lock.ts` lease wrapper and session hooks across 7 files."),
    reusePlaybook: bi("악보·레시피 뷰어, 발표 프롬프터, 긴 대용량 업로드·변환 진행 화면에 가볍게 붙일 수 있습니다.", "Lightweight addition for sheet-music viewers, teleprompters, and long client-side export screens."),
    repoPath: "apps/web/src/shared/lib/screen-wake-lock.ts",
  },
  {
    id: "audio-worklet",
    name: "AudioWorklet",
    fileCount: 6,
    category: "media-realtime",
    tone: "accent",
    flowSteps: ["Nib Velocity", "Dedicated Audio Thread", "Paper Foley"],
    why: bi("메인 UI 스레드 부하와 무관한 전용 오디오 스레드에서 펜촉 마찰음과 공간 오디오 DSP를 글리치 없이 합성합니다.", "Synthesizes nib-on-paper acoustics and spatial DSP on a dedicated audio thread free from UI frame drops."),
    whereUsed: bi("차세대 웹 플랫폼 오디오 브리지, 크롬 미디어 툴, 멀티코어 스케줄러 패널 6개 파일에서 다룹니다.", "Wired into next-gen web audio bridges, media tools, and scheduler diagnostics across 6 files."),
    reusePlaybook: bi("브라우저 신디사이저/DAW, 실시간 음성 필터, 웹 게임 절차적 효과음 엔진에 그대로 활용할 수 있습니다.", "Reusable for browser DAWs, real-time voice processors, and procedural game sound engines."),
    repoPath: "apps/web/src/domains/creator/nextgen-web-platform/chrome-nextgen-apis.ts",
  },
  {
    id: "webhid-webmidi",
    name: "WebHID/WebMIDI",
    fileCount: 4,
    category: "input-ux",
    tone: "good",
    flowSteps: ["USB/MIDI Grant", "Raw Dial Report", "Canvas Action"],
    why: bi("별도 OS 드라이버 설치 없이 왼손 단축 다이얼(TourBox 등)과 MIDI 노브·페달을 브러시 크기·회전·되돌리기에 바로 묶습니다.", "Maps left-hand dials and MIDI knobs/pedals straight to brush size, rotation, and undo with zero OS driver installs."),
    whereUsed: bi("왼손 WebHID 장치 매퍼, 프로 디지타이저 HID 엔진, 능력 프로브 4개 파일에 구현했습니다.", "Implemented in the left-hand WebHID mapper, pro digitizer HID engine, and capability probes across 4 files."),
    reusePlaybook: bi("웹 영상 셔틀 컨트롤러, 온라인 DJ/음악 툴, 하드웨어 캘리브레이션 대시보드에 바로 적용할 수 있습니다.", "Directly useful for web video jog wheels, browser music gear, and hardware calibration consoles."),
    repoPath: "apps/web/src/domains/creator/drawing/studio-webhid-left-hand-device.ts",
  },
];

export function filterRareWebApis(
  entries: readonly RareWebPlatformApiEntry[],
  category: "all" | TechRareApiCategory,
): readonly RareWebPlatformApiEntry[] {
  if (category === "all") return entries;
  return entries.filter((entry) => entry.category === category);
}

export const WEBRTC_PRESENTATION_SLIDE: TechPresentationSlide = {
  id: "webrtc-realtime-media-protocol",
  slideNumber: 17,
  status: "expanding",
  sectionTag: bi("17 · WebRTC 실시간 미디어 프로토콜", "17 · WebRTC Realtime Media Protocol"),
  brandSystem: "LoomSync · WebRTC",
  title: bi(
    "LoomSync WebRTC: 8대 권위 분리 · Perfect Negotiation · STUN 전용 24파일 프로토콜",
    "LoomSync WebRTC: 8-Plane Authority, Perfect Negotiation & STUN-Only 24-File Protocol",
  ),
  summary: bi(
    "실측 24개 파일에 걸쳐 작품 문서(Yjs)·방 입장(Durable Objects)·허들 시그널링(DataChannel studio-direct-v1)·RTP 미디어·STUN 전용 ICE를 8대 권위로 나누고, Perfect Negotiation·권한 경합 스트림 즉시 stop()·제한형 ICE Restart·실제 수신자 범위 표시를 구현했습니다.",
    "Across 24 verified files, splits Yjs docs, Durable Objects admission, DataChannel studio-direct-v1 signaling, RTP tracks, and STUN-only ICE into 8 authorities—paired with Perfect Negotiation, stale stream stop(), bounded ICE restart, and explicit recipient scope.",
  ),
  spritePath: "/assets/studio/vibrant-sprites/emblem-production.webp",
  spriteAlt: bi("LoomSync WebRTC 실시간 협업 및 미디어 프로토콜 엠블럼", "LoomSync WebRTC realtime collaboration protocol emblem"),
  diagramTitle: bi(
    "DO/Socket.IO 입장 → DataChannel studio-direct-v1 시그널링 → Perfect Negotiation/replaceTrack → RTP + STUN 전용",
    "DO/Socket.IO Admission -> DataChannel studio-direct-v1 -> Perfect Negotiation / replaceTrack -> RTP + STUN-Only",
  ),
  diagramNodes: [
    dn("8-PLANE", "8대 데이터 권위 분리", "8-Plane Authority Split", "Yjs · DO · direct-v1 · RTP", "Yjs, DO, direct-v1 & RTP", "cool"),
    dn("GLARE", "Perfect Negotiation", "Perfect Negotiation", "polite/impolite · epoch 폐기", "Polite glare & epoch guard", "accent"),
    dn("CAPTURE", "권한 경합 · replaceTrack", "Capture & replaceTrack", "늦은 스트림 stop() · 무중단", "Stale stop() & track swap", "good"),
    dn("ICE/SCOPE", "STUN 전용 · 수신자 범위", "STUN-Only & Scope", "제한 백오프 · TURN 미사용", "Bounded backoff · no TURN", "warn"),
  ],
  whyChosen: bi(
    "문서 저장, 참가자 입장, 허들 시그널링, 미디어 스트림을 하나의 realtime 상태로 묶으면 네트워크 장애나 권한 경합 때 채팅이 서버로 새거나 잘못된 방에 마이크가 열립니다. 8대 권위 분리와 STUN 전용 정책으로 보안 경계와 무료 운영 비용을 함께 지켰습니다.",
    "Lumping document state, admission, signaling, and media into one realtime flag risks leaking audio across rooms or pushing chat onto servers. Splitting 8 authorities and enforcing STUN-only ICE protects both privacy boundaries and operating cost.",
  ),
  whereUsed: bi(
    "가상 스튜디오 P2P 허들(원격 최대 3명), 양방향 동의 화면 공유(시청자 최대 4명), 직통 데이터 메시(원격 8명), STUN 전용 ICE 리스 및 RTC 진단 패널(실측 24개 파일)에서 작동합니다.",
    "Runs in Virtual Studio P2P huddles (up to 3 remote peers), two-way consented screen share (up to 4 viewers), direct data meshes (8 peers), STUN-only ICE leases, and RTC diagnostics across 24 files.",
  ),
  reusePlaybook: bi(
    "원격 디자인 리뷰 룸, 온라인 합주·스터디 스튜디오, 협업 화이트보드에서 '서버는 입장·부트스트랩만, 허들 시그널링과 미디어는 P2P 직통, 실제 수신자 범위 우선 표시' 설계를 그대로 재사용할 수 있습니다.",
    "Reusable blueprint for remote design review rooms and virtual workrooms: keep the server on admission/bootstrap, route huddle signaling and media peer-to-peer, and always display true recipient scope.",
  ),
  plainBackground: bi(
    "안내 데스크(방 서버)가 두 사람을 소개하면, 통화 약속과 채팅은 직통 회선(studio-direct-v1)으로만 나누고 음성과 화면은 별도 통화선(RTP)으로 흘립니다. 두 사람이 동시에 걸어 충돌해도 누가 양보할지(polite) 미리 정해 두어 꼬이지 않습니다.",
    "The front desk (room server) only makes the introduction; call setup and chat stay on a direct line (studio-direct-v1) while voice and video use a separate media line (RTP), with pre-assigned polite roles settling simultaneous calls.",
  ),
  tradeoff: bi(
    "2026-10-11 비용 정책으로 TURN 중계를 쓰지 않고 Cloudflare STUN(`stun:stun.cloudflare.com:3478`) 전용으로 고정했습니다. 소규모 단위·로컬 Chromium 루프백 검증은 완료했으나, 대칭 NAT/UDP 차단 환경에서는 미디어가 실패하며(프레즌스 패킷만 `direct:relay` 폴백) WAN·대규모 SFU 방송은 별도 검증 및 현재 범위 밖입니다.",
    "TURN relays are disabled by the 2026-10-11 cost policy in favor of Cloudflare STUN (`stun:stun.cloudflare.com:3478`). Unit tests and local Chromium loopback are verified, while media fails behind strict UDP-blocking NATs (presence falls back to `direct:relay`) and WAN/large SFU broadcasts remain out of current scope.",
  ),
  speakerNotes: bi(
    "17장은 실제 24개 파일과 설계 문서로 검증한 ToonStudio WebRTC 프로토콜입니다. 핵심은 8대 권위 분리, Perfect Negotiation과 epoch 폐기, 권한 팝업 도중 방이 바뀌면 늦은 스트림을 즉시 stop()하는 안전장치, 그리고 TURN 미사용 한계까지 투명하게 밝히는 엔지니어링 태도입니다.",
    "Slide 17 documents our 24-file WebRTC protocol honestly: 8 separated data authorities, Perfect Negotiation with peer epoch guards, immediate stop() on stale permission streams, and clear boundaries around our STUN-only no-TURN policy.",
  ),
  repoPaths: [
    WEBRTC_EVIDENCE_DOC_PATH,
    "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts",
    "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts",
    "apps/web/src/domains/creator/live/studio-ice-configuration.ts",
    "apps/web/src/domains/creator/studio-screen-share.ts",
    "apps/web/src/domains/creator/studio-voice-ice-policy.ts",
    "apps/web/src/domains/creator/virtual-space/studio-virtual-space-rtc-diagnostics.ts",
  ],
};

export const RARE_WEB_APIS_PRESENTATION_SLIDE: TechPresentationSlide = {
  id: "rare-web-platform-apis-18",
  slideNumber: 18,
  status: "current",
  sectionTag: bi("18 · 웹 API 18종 소스 목록", "18 · Source Inventory of 18 Web APIs"),
  brandSystem: "ToonCore · LoomSync · CalmChrome",
  title: bi(
    "ToonStudio에서 참조하는 웹 API 18종",
    "18 Web Platform APIs Referenced in ToonStudio",
  ),
  summary: bi(
    "OffscreenCanvas(101) · WebCrypto(91) · BroadcastChannel(75) · SharedArrayBuffer(61) · Coalesced/Predicted Pointer(32) · Web Locks(28) · WebRTC(24) · WebCodecs(20) · CompressionStream(13) · EyeDropper(13) · Compute Pressure(11) · WebXR(10) · View Transitions(8) · OPFS(8) · File System Access(7) · Wake Lock(7) · AudioWorklet(6) · WebHID/MIDI(4) 등 18종 API를 실측 파일 수와 함께 배치했습니다.",
    "Maps 18 rarely used browser standards with exact file counts in `apps/web/src/`: OffscreenCanvas (101), WebCrypto (91), BroadcastChannel (75), SharedArrayBuffer (61), Coalesced/Predicted Pointer (32), Web Locks (28), WebRTC (24), WebCodecs (20), CompressionStream (13), EyeDropper (13), Compute Pressure (11), WebXR (10), View Transitions (8), OPFS (8), File System Access (7), Wake Lock (7), AudioWorklet (6), and WebHID/MIDI (4).",
  ),
  spritePath: "/assets/studio/vibrant-sprites/emblem-discover.webp",
  spriteAlt: bi("ToonStudio 실측 희귀 웹 표준 API 18종 탐색 엠블럼", "ToonStudio measured 18 rare web standards map emblem"),
  diagramTitle: bi(
    "연산·메모리(173) + 저장·보안·동기화(222) + 미디어·통신(50) + 입력·디바이스·UX(74) 실측 파일 분포",
    "Compute/Memory (173) + Storage/Security/Sync (222) + Media/RTC (50) + Input/Device/UX (74) File Counts",
  ),
  diagramNodes: [
    dn("COMPUTE", "Offscreen · SAB · Pressure", "Offscreen, SAB & Pressure", "101 · 61 · 11 파일", "101 / 61 / 11 files", "accent"),
    dn("STORAGE", "Crypto · BC · Locks · OPFS", "Crypto, BC, Locks & OPFS", "91 · 75 · 28 · 13 · 8 · 7", "91/75/28/13/8/7 files", "good"),
    dn("MEDIA", "WebRTC · WebCodecs · Audio", "WebRTC, Codecs & Audio", "24 · 20 · 6 파일", "24 / 20 / 6 files", "cool"),
    dn("DEVICE/UX", "Coalesced · Dropper · XR", "Coalesced, Dropper & XR", "32 · 13 · 10 · 8 · 7 · 4", "32/13/10/8/7/4 files", "warn"),
  ],
  whyChosen: bi(
    "일반 CRUD 웹앱은 fetch와 DOM만으로 충분하지만, 설치 없는 창작 스튜디오는 멀티탭 파일 잠금(Web Locks), 스트림 압축(CompressionStream), 고주사율 펜 궤적(getCoalescedEvents), 로컬 하드웨어 인코딩(WebCodecs) 같은 브라우저 하부 표준이 필수입니다.",
    "CRUD apps only need fetch and DOM, whereas a zero-install creative studio depends on lower-level browser primitives like Web Locks, CompressionStream, coalesced stylus events, and local WebCodecs encoding.",
  ),
  whereUsed: bi(
    "캔버스 워커, 키 보관함, 다중 탭 저장 조율, 소규모 P2P 허들, 영상 코덱 점검, 색상 추출, 화면 켜짐 유지 관련 코드에서 확인할 수 있습니다.",
    "References include canvas workers, key vaults, multi-tab storage coordination, small P2P huddles, codec preflight, color sampling, and wake locks.",
  ),
  reusePlaybook: bi(
    "브라우저 IDE, 오프라인 우선 문서/영상 도구, 금융·의료 로컬 암호화 웹앱, 하드웨어 연동 대시보드 구축 시 아래 18종 카탈로그의 '왜 썼나 · 어디에 적용했나 · 타 도메인 재사용법'을 기술 검토표로 바로 쓸 수 있습니다.",
    "Use the 18-API catalog below as an engineering checklist—with why, where applied, and cross-domain reuse—for browser IDEs, local-first media apps, encrypted client tools, and hardware consoles.",
  ),
  plainBackground: bi(
    "브라우저 안에는 웹페이지 표시 기능 외에 파일 금고, 잠금장치, 암호 계산기, 압축기, 영상 인코더, 외부 다이얼 연결 포트까지 숨어 있습니다. ToonStudio는 이 18가지 표준 도구를 골고루 조합해 설치 없이 작업실을 구성합니다.",
    "Beneath ordinary web pages, modern browsers ship private vaults, multi-tab locks, hardware crypto, stream compressors, video encoders, and HID ports—18 primitives ToonStudio combines into a zero-install workspace.",
  ),
  tradeoff: bi(
    "파일 수는 `apps/web/src/` 소스의 정적 집계입니다. 실제 실행 범위는 각 API의 브라우저 지원과 테스트 조건을 확인해야 합니다.",
    "File counts are a static source inventory from `apps/web/src/`. Runtime coverage depends on each API's browser requirements and test conditions.",
  ),
  speakerNotes: bi(
    "마지막 18장에서는 일반 웹앱에서 보기 드문 희귀 웹 표준 API 18종을 실제 저장소 파일 수와 함께 정리했습니다. 유행어 나열이 아니라 각 API를 왜 골랐는지, 어디에 붙였는지, 다른 프로젝트에서 어떻게 재사용할 수 있는지 아래 18종 카탈로그에서 바로 확인할 수 있습니다.",
    "Slide 18 closes with a concrete inventory of 18 rarely used web standards and their real file counts in our repo—each paired below with why we chose it, where it lives, and how other teams can reuse it.",
  ),
  repoPaths: [
    "apps/web/src/domains/creator/studio-web-runtime/studio-web-authoring-runtime.ts",
    "apps/web/src/shared/ai/user-ai-crypto.ts",
    "apps/web/src/shared/lib/creator-role-workspace-store.ts",
    "apps/web/src/domains/creator/studio-web-runtime/studio-web-authoring-project-v3-repository.ts",
    "apps/web/src/domains/creator/session-endurance/history-opfs-spill-store.ts",
    "apps/web/src/shared/lib/file-system-access.ts",
    "apps/web/src/shared/lib/screen-wake-lock.ts",
  ],
};

export const WEBRTC_AND_RARE_API_GLOSSARY_ENTRIES: readonly TechPlainGlossaryEntry[] = [
  {
    id: "webrtc-perfect-negotiation",
    category: "storage-sync",
    usedInSlideNumbers: [17],
    term: bi("WebRTC Perfect Negotiation · Glare & Peer Epoch", "WebRTC Perfect Negotiation, Glare & Peer Epoch"),
    oneLineAnalogy: bi(
      "두 사람이 동시에 전화를 걸어 통화선이 엉킬 때 미리 정한 한쪽(polite)이 자연스럽게 양보하고, 옛 통화 쪽지(epoch)는 버리는 규칙",
      "A pre-agreed courtesy rule where one polite side yields when both call simultaneously, while stale notes from old sessions are discarded",
    ),
    technicalMeaning: bi(
      "`makingOffer`·`ignoreOffer`·`settingAnswer` 상태 머신으로 동시 offer 충돌(Glare)을 해소하고, 현재 세션과 다른 `peer epoch`의 지연 SDP/ICE를 폐기합니다.",
      "Resolves simultaneous offer glare via `makingOffer`, `ignoreOffer`, and `settingAnswer` flags while rejecting delayed SDP/ICE packets carrying a mismatched peer epoch.",
    ),
  },
  {
    id: "webrtc-authority-stun-only",
    category: "storage-sync",
    usedInSlideNumbers: [17],
    term: bi("WebRTC 8대 권위 분리 · studio-direct-v1 · STUN 전용 ICE", "WebRTC 8-Plane Authority, studio-direct-v1 & STUN-Only ICE"),
    oneLineAnalogy: bi(
      "입장 확인만 안내 데스크(방 서버)가 맡고, 통화 설정·채팅은 직통 창구로, 주소 조회는 무료 안내소(STUN)만 쓰는 역할 분담",
      "Using the room server only for admission, a direct channel for call setup and chat, and a free STUN address desk without paid TURN relays",
    ),
    technicalMeaning: bi(
      "Yjs 문서·DO 입장·`studio-direct-v1` 허들 시그널링·RTP 미디어·STUN 전용 ICE(`stun:stun.cloudflare.com:3478`)를 분리하고, TURN 미사용 환경의 한계를 명시합니다.",
      "Separates Yjs docs, DO admission, `studio-direct-v1` huddle signaling, RTP tracks, and STUN-only ICE (`stun:stun.cloudflare.com:3478`) while explicitly scoping out TURN relay.",
    ),
  },
  {
    id: "webrtc-replace-track-recipient-scope",
    category: "storage-sync",
    usedInSlideNumbers: [17],
    term: bi("sender.replaceTrack() & 실제 수신자 범위(Recipient Scope)", "sender.replaceTrack() & Real Recipient Scope"),
    oneLineAnalogy: bi(
      "통화를 끊지 않고 마이크·카메라만 갈아 끼우고, 방 이동 중 늦게 켜진 마이크는 즉시 끄며 내 목소리가 실제로 닿는 사람을 분명히 표시하는 안전장치",
      "Swapping camera or mic tracks mid-call without reconnecting, stopping late grants after room changes, and showing exactly who receives your audio",
    ),
    technicalMeaning: bi(
      "장치 권한 응답 후 `authorityValid`와 `captureRevision`을 재검증해 범위가 바뀌면 즉시 `track.stop()`하고, 정상 트랙은 `RTCRtpSender.replaceTrack()`으로 교체합니다.",
      "Re-checks `authorityValid` and `captureRevision` after device prompts—calling `track.stop()` on stale streams and swapping valid media through `RTCRtpSender.replaceTrack()`.",
    ),
  },
  {
    id: "web-locks-broadcast-channel",
    category: "storage-sync",
    usedInSlideNumbers: [18],
    term: bi("Web Locks (navigator.locks) & BroadcastChannel", "Web Locks (navigator.locks) & BroadcastChannel"),
    oneLineAnalogy: bi(
      "열린 여러 탭 중 한 탭만 프로젝트 파일에 쓰도록 열쇠를 쥐어 주고(Web Locks), 바뀐 소식은 다른 탭에 사내 방송(BroadcastChannel)으로 알리는 구조",
      "Handing an exclusive write key to one tab at a time (Web Locks) while broadcasting state updates across same-origin tabs (BroadcastChannel)",
    ),
    technicalMeaning: bi(
      "같은 출처의 다중 탭에서 OPFS/SQLite 쓰기 경합을 배타 락으로 직렬화하고, 탭 비정상 종료 시 브라우저가 락을 자동 회수해 교착 상태를 막습니다.",
      "Serializes concurrent OPFS/SQLite writes across same-origin tabs with crash-safe auto-release locks paired with origin-wide event messaging.",
    ),
  },
  {
    id: "webcrypto-compression-stream",
    category: "trust-security",
    usedInSlideNumbers: [13, 18],
    term: bi("WebCrypto (crypto.subtle) & CompressionStream", "WebCrypto (crypto.subtle) & CompressionStream"),
    oneLineAnalogy: bi(
      "외부 플러그인 없이 브라우저 내장 금고 열쇠(AES-GCM/SHA-256)로 비밀번호·에셋을 잠그고, 내장 진공팩(CompressionStream)으로 작업 이력을 줄여 담는 기술",
      "Locking user keys and asset digests with built-in browser cryptography while vacuum-packing undo deltas via native stream compression",
    ),
    technicalMeaning: bi(
      "PBKDF2(310,000회)+AES-GCM 256비트 로컬 암호화, SHA-256 패키지 무결성 검증, 네이티브 gzip/deflate 스트림 압축을 추가 JS 번들 없이 수행합니다.",
      "Executes PBKDF2 (310k rounds) + AES-GCM-256 local encryption, SHA-256 asset hashing, and native gzip/deflate streaming without external crypto/zip bundles.",
    ),
  },
  {
    id: "pointer-coalesced-wake-lock-fsa",
    category: "hardware",
    usedInSlideNumbers: [7, 18],
    term: bi("getCoalesced/PredictedEvents · File System Access · Wake Lock", "getCoalesced/PredictedEvents, File System Access & Wake Lock"),
    oneLineAnalogy: bi(
      "펜의 숨은 중간 점까지 살려 곡선을 매끄럽게 잇고, 고른 파일에 바로 덮어쓰며, 오래 그리는 동안 화면이 절전으로 꺼지지 않게 지키는 3종 실무 API",
      "Three practical workstation APIs: capture every sub-frame stylus point, save back into the same local file, and keep the screen awake during long sessions",
    ),
    technicalMeaning: bi(
      "고주사율 스타일러스 샘플 복원·예측, IndexedDB에 보존한 로컬 파일 핸들 직접 덮어쓰기, `visibilitychange` 연동 화면 절전 방지 리스를 런타임 가드와 함께 제공합니다.",
      "Combines high-rate stylus sample recovery/prediction, persistent IndexedDB file-handle overwrite, and visibility-aware screen wake locks behind runtime guards.",
    ),
  },
];
