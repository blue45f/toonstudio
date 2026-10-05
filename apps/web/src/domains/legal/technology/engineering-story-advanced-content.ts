import type {
  EngineeringChapter,
  EngineeringEvidence,
  EngineeringEvidenceKind,
  EngineeringGuide,
} from "./engineering-story-content";

const evidence = (
  kind: EngineeringEvidenceKind,
  path: string,
  ko: string,
  en: string,
): EngineeringEvidence => ({ kind, path, label: { ko, en } });

/**
 * Product-facing chapters that close the gap between a feature list and the operating boundaries
 * required to reuse ToonStudio engineering patterns in another product.
 */
export const ENGINEERING_ADVANCED_CHAPTERS = [
  {
    id: "social-identity-lifecycle",
    order: 26,
    status: "configured",
    eyebrow: "26 · SOCIAL IDENTITY LIFECYCLE",
    title: {
      ko: "소셜 로그인은 버튼이 아니라 계정 생애주기입니다",
      en: "Social login is an account lifecycle, not a row of buttons",
    },
    thesis: {
      ko: "공급자 인증, ToonStudio 세션, 계정 연결·해제와 탈퇴를 분리해 한 공급자의 장애나 정책 변경이 제품 계정 전체를 소유하지 않게 합니다.",
      en: "Provider authentication, the ToonStudio session, account linking, unlinking and deletion stay separate so one provider never owns the whole product account.",
    },
    problem: {
      ko: "인가 코드 성공만 구현하면 중복 callback, state 재사용, 검증되지 않은 이메일 병합, 공급자 연결 해제와 탈퇴 웹훅에서 계정 일관성이 깨집니다.",
      en: "Implementing only the happy authorization-code path leaves duplicate callbacks, state reuse, unverified email merges, provider unlinking and deletion webhooks inconsistent.",
    },
    decision: {
      ko: "공급자별 redirect와 최소 scope를 고정하고 state·PKCE·nonce를 서버에서 검증한 뒤 HttpOnly 자체 세션을 발급합니다. provider subject를 정본으로 삼고 계정 병합은 명시적 재인증 흐름으로 제한합니다.",
      en: "Provider redirects and minimal scopes are fixed, state, PKCE and nonce are verified server-side, and only then is a first-party HttpOnly session issued. Provider subjects remain authoritative and account merges require explicit reauthentication.",
    },
    userValue: {
      ko: "사용자는 어떤 계정이 연결됐는지, 무엇을 해제하면 어떤 세션이 종료되는지, 마지막 로그인 수단을 제거하면 어떻게 되는지 예측할 수 있습니다.",
      en: "Users can predict which accounts are connected, which sessions end after unlinking and what happens when the final login method is removed.",
    },
    tradeoff: {
      ko: "공급자 콘솔, 검수, secret 회전, unlink webhook과 장애 대응을 지속 운영해야 하며 모든 공급자를 한 번에 노출하면 선택 피로와 개인정보 범위가 커집니다.",
      en: "Provider consoles, review, secret rotation, unlink webhooks and incident response require ongoing operations; exposing every provider at once increases choice fatigue and data scope.",
    },
    technologies: ["OAuth 2.0", "OpenID Connect", "PKCE S256", "nonce", "HttpOnly", "SameSite", "unlink webhook"],
    evidence: [
      evidence("document", "docs/social-login-provider-setup.md", "공급자 신청·scope·운영 절차", "Provider registration, scopes and operations"),
      evidence("code", "apps/api/src/modules/auth", "서버 callback과 제품 세션 경계", "Server callbacks and product-session boundary"),
      evidence("code", "apps/web/src/domains/auth", "공급자 상태와 오류를 드러내는 로그인 UI", "Login UI exposing provider status and failures"),
      evidence("test", "scripts/verify-social-login-production.test.mjs", "운영 소셜 로그인 검증 계약", "Production social-login verification contract"),
    ],
    reuseSteps: [
      { ko: "로그인 성공보다 먼저 provider subject, 제품 user ID와 session ID의 소유권을 구분합니다.", en: "Separate ownership of provider subject, product user ID and session ID before implementing the happy path." },
      { ko: "공급자별 redirect, scope, state·PKCE·nonce와 callback 중복 처리 규칙을 표로 고정합니다.", en: "Freeze provider redirects, scopes, state, PKCE, nonce and duplicate-callback rules in one matrix." },
      { ko: "검증 이메일 자동 병합, 명시적 재인증 연결, unlink와 마지막 로그인 수단 제거를 각각 테스트합니다.", en: "Test verified-email merging, explicit reauthenticated linking, unlinking and removal of the final login method separately." },
      { ko: "운영 secret은 브라우저·문서·VITE 환경변수와 분리하고 회전·철회 runbook을 둡니다.", en: "Keep operating secrets out of browser bundles, documents and VITE variables, with rotation and revocation runbooks." },
    ],
  },
  {
    id: "share-distribution-boundary",
    order: 27,
    status: "live",
    eyebrow: "27 · SHARE & DISTRIBUTION",
    title: {
      ko: "공유는 버튼 하나가 아니라 유입·미리보기·개인정보 계약입니다",
      en: "Sharing is an acquisition, preview and privacy contract—not one button",
    },
    thesis: {
      ko: "기기 공유, 채널별 URL, 링크 복사, QR과 Open Graph를 하나의 공유 payload에서 만들되 각 채널 실패가 다른 공유 경로를 막지 않게 합니다.",
      en: "Native sharing, channel URLs, copy, QR and Open Graph derive from one share payload while each channel fails independently.",
    },
    problem: {
      ko: "플랫폼별 URL을 화면마다 직접 만들면 canonical URL·UTM·제목·표지 정보가 어긋나고, 모바일 취소를 오류로 표시하거나 analytics에 민감한 전체 URL을 보내기 쉽습니다.",
      en: "Hand-building platform URLs in each screen drifts canonical URL, UTM, title and cover data, while mobile cancellation may look like an error and analytics may leak sensitive full URLs.",
    },
    decision: {
      ko: "정규화된 share payload와 capability detection을 두고 Web Share API를 우선 사용합니다. 카카오 SDK는 필요할 때 SRI로 로드하고 나머지는 공식 share URL·Clipboard·QR fallback으로 분리합니다.",
      en: "A normalized share payload and capability detection prefer the Web Share API. The Kakao SDK is lazily loaded with SRI, while official share URLs, Clipboard and QR remain independent fallbacks.",
    },
    userValue: {
      ko: "사용자는 설치 앱과 브라우저 환경에 맞는 공유 방식을 선택하고 취소해도 작업 흐름을 잃지 않으며, 공유된 작품은 일관된 미리보기로 열립니다.",
      en: "Users can choose the sharing path suited to their device, cancel without losing context and open shared work with a consistent preview.",
    },
    tradeoff: {
      ko: "Web Share와 Clipboard 지원 범위가 다르고 카카오 도메인 등록·CSP가 필요합니다. 공유 완료 이벤트는 실제 수신·열람을 보장하지 않으므로 전환과 동일하게 해석하지 않습니다.",
      en: "Web Share and Clipboard support differ and Kakao requires domain registration and CSP. A completed share action does not prove receipt or viewing and must not be treated as conversion.",
    },
    technologies: ["Web Share API", "Clipboard API", "Open Graph", "Kakao SDK", "QR", "UTM", "CSP", "SRI"],
    evidence: [
      evidence("code", "apps/web/src/shared/lib/share.ts", "채널 중립 공유 payload와 fallback", "Channel-neutral share payload and fallbacks"),
      evidence("test", "apps/web/src/shared/lib/__tests__/share.test.ts", "URL·UTM·취소·fallback 회귀 검사", "URL, UTM, cancellation and fallback regression tests"),
      evidence("test", "apps/web/src/shared/lib/__tests__/kakao-share.test.ts", "지연 로드 카카오 공유 검사", "Lazy Kakao-sharing tests"),
      evidence("document", "docs/social-sharing.md", "공유 채널·보안·배포 점검", "Share channels, security and release checks"),
    ],
    reuseSteps: [
      { ko: "화면별 문자열 대신 canonical URL, title, text, image와 content ID를 가진 payload를 정의합니다.", en: "Define a payload containing canonical URL, title, text, image and content ID instead of screen-specific strings." },
      { ko: "native share, 공식 URL, copy와 QR을 capability와 실패 유형별 독립 adapter로 만듭니다.", en: "Build native share, official URLs, copy and QR as independent adapters by capability and failure type." },
      { ko: "UTM은 기존 query와 hash를 보존하고 내부 이벤트에는 channel·result·route만 기록합니다.", en: "Preserve existing query and hash when adding UTM, and record only channel, result and route internally." },
      { ko: "실제 crawler user agent로 canonical·OG image·description을 검증하고 모바일 취소를 정상 상태로 처리합니다.", en: "Validate canonical and Open Graph data with real crawler user agents and treat mobile cancellation as a normal outcome." },
    ],
  },
  {
    id: "collaborative-crdt-boundary",
    order: 28,
    status: "experimental",
    eyebrow: "28 · COLLABORATIVE CRDT",
    title: {
      ko: "CRDT에는 협업 의미를, 대형 결과물에는 별도 저장 권위를",
      en: "CRDT owns collaborative meaning; large artifacts keep separate authority",
    },
    thesis: {
      ko: "Yjs는 레이어·벡터·스타일러스 의미 연산과 순서를 수렴시키고, 래스터 타일·PSD·GLB 같은 대형 바이너리는 해시와 receipt로 참조합니다.",
      en: "Yjs converges layer, vector and stylus semantic operations, while large raster tiles, PSD and GLB artifacts are referenced through hashes and receipts.",
    },
    problem: {
      ko: "캔버스 픽셀이나 큰 파일을 그대로 CRDT update에 넣으면 room 메모리, sync 지연과 compaction 비용이 폭증하고, undo·삭제·재접속 의미가 데이터 구조에 묻힙니다.",
      en: "Putting canvas pixels or large files directly in CRDT updates explodes room memory, sync latency and compaction cost while burying undo, deletion and reconnect semantics inside raw data.",
    },
    decision: {
      ko: "버전된 semantic operation과 bounded binary envelope를 사용하고 room authority, durable receipt와 asset storage를 분리합니다. 래스터는 immutable log와 Worker checkpoint로 재생·복구합니다.",
      en: "Versioned semantic operations and bounded binary envelopes separate room authority, durable receipts and asset storage. Raster work replays and recovers through an immutable log and Worker checkpoints.",
    },
    userValue: {
      ko: "오프라인·재접속·동시 편집에서도 레이어와 획의 의도가 수렴하고, 대형 원본 때문에 전체 협업 세션이 멈추지 않습니다.",
      en: "Layer and stroke intent converges across offline work, reconnects and concurrent edits without a large source asset stalling the whole session.",
    },
    tradeoff: {
      ko: "CRDT가 권한·저장·미디어 전송을 자동 해결하지 않습니다. schema migration, tombstone·삭제 승인, snapshot compaction과 room resource limit을 별도로 운영해야 합니다.",
      en: "CRDT does not automatically solve authorization, persistence or media transport. Schema migration, deletion acknowledgement, snapshot compaction and room resource limits remain explicit operations.",
    },
    technologies: ["Yjs", "CRDT", "Socket.IO", "binary envelope", "state vector", "Worker checkpoint", "PostgreSQL receipt"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/live/studio-crdt-document.ts", "Yjs 문서와 semantic operation 권위", "Yjs document and semantic-operation authority"),
      evidence("code", "apps/web/src/domains/creator/contracts/studio-crdt-binary-envelope.ts", "bounded binary transport envelope", "Bounded binary transport envelope"),
      evidence("test", "apps/web/src/domains/creator/live/studio-crdt-raster-worker-client.test.ts", "래스터 checkpoint Worker 검사", "Raster-checkpoint Worker tests"),
      evidence("document", "docs/studio-crdt-webgpu-architecture-2026-07-16.md", "CRDT·WebGPU·저장 권위 설계", "CRDT, WebGPU and storage-authority design"),
    ],
    reuseSteps: [
      { ko: "먼저 동시에 수정 가능한 의미 단위를 문장으로 정의하고 CRDT shared type을 그 뒤에 고릅니다.", en: "Describe the concurrently editable semantic units first, then choose CRDT shared types." },
      { ko: "문서 의미, room transport, durable receipt와 binary asset store에 각각 하나의 권위를 둡니다.", en: "Assign one authority each to document meaning, room transport, durable receipts and binary asset storage." },
      { ko: "update·awareness·asset 크기, room 인원, replay와 compaction 예산을 제한합니다.", en: "Bound update, awareness and asset sizes, room population, replay and compaction budgets." },
      { ko: "순서가 다른 update, offline fork, schema 구버전, 삭제와 늦은 재접속을 수렴 테스트로 고정합니다.", en: "Lock down convergence for reordered updates, offline forks, old schemas, deletion and late reconnects." },
    ],
  },
  {
    id: "brush-render-authority",
    order: 29,
    status: "experimental",
    eyebrow: "29 · BRUSH RENDER AUTHORITY",
    title: {
      ko: "보이는 획과 저장되는 획이 같은 계약을 따르게 만들기",
      en: "Making the visible stroke and the stored stroke obey one contract",
    },
    thesis: {
      ko: "포인터 입력, 예측 미리보기, 재료 simulation, 합성, 타일 commit과 history 기록을 분리하되 동일한 stroke identity와 renderer role을 유지합니다.",
      en: "Pointer input, predicted preview, media simulation, compositing, tile commit and history remain separate while sharing stroke identity and renderer roles.",
    },
    problem: {
      ko: "미리보기 엔진과 저장 엔진이 암묵적으로 갈라지면 빠르게 보인 선이 pointer-up 뒤 달라지고, undo·재생·공동 편집·내보내기에서 같은 획을 복원하지 못합니다.",
      en: "When preview and document engines diverge implicitly, a fast line changes after pointer-up and cannot be reproduced by undo, replay, collaboration or export.",
    },
    decision: {
      ko: "renderer registry에 preview·live·commit·export 역할과 document authority를 선언하고, normalized samples·brush revision·seed·material parameters를 commit receipt로 남깁니다. Worker와 GPU backend는 이 계약 뒤에서 교체합니다.",
      en: "The renderer registry declares preview, live, commit and export roles plus document authority. Normalized samples, brush revision, seed and material parameters form the commit receipt while Worker and GPU backends remain replaceable behind it.",
    },
    userValue: {
      ko: "획은 즉시 반응하면서도 저장·Undo·재생·내보내기에서 형태와 재료 특성이 유지되고, 저사양 기기에서는 안전한 backend로 낮출 수 있습니다.",
      en: "Strokes respond immediately yet preserve shape and media behavior through save, undo, replay and export, with a safe backend available on constrained devices.",
    },
    tradeoff: {
      ko: "완전한 픽셀 동일성과 지각 품질은 다른 목표입니다. GPU·WASM·Canvas 경로마다 결정성, 색공간, precision과 긴 획 메모리 예산을 따로 측정해야 합니다.",
      en: "Exact pixel identity and perceptual quality are different goals. Determinism, color space, precision and long-stroke memory budgets must be measured per GPU, WASM and Canvas path.",
    },
    technologies: ["Pointer Events", "prediction", "WebGPU", "CanvasKit", "Rust/WASM", "OffscreenCanvas", "tile commit", "renderer registry"],
    evidence: [
      evidence("code", "packages/studio-engine-registry/src/renderer-roles.ts", "renderer 역할과 문서 권위 registry", "Renderer roles and document-authority registry"),
      evidence("code", "apps/web/src/domains/creator/brush-lab/brush-studio-v5-runtime-types.ts", "preview·live·commit·export phase 계약", "Preview, live, commit and export phase contract"),
      evidence("test", "scripts/verify-studio-gpu-committed-parity.mts", "GPU 표시와 committed 결과 패리티", "GPU display-to-commit parity"),
      evidence("document", "docs/engines/native-brush-benchmark-optimization-2026-09-19.md", "브러시 benchmark와 최적화 근거", "Brush benchmark and optimization evidence"),
    ],
    reuseSteps: [
      { ko: "포인터 sample schema와 좌표·압력·tilt·time 보정 위치를 먼저 고정합니다.", en: "Freeze the pointer-sample schema and where coordinate, pressure, tilt and time normalization occurs." },
      { ko: "preview, live simulation, document commit, history와 export의 입출력·권위를 표로 만듭니다.", en: "Map inputs, outputs and authority for preview, live simulation, document commit, history and export." },
      { ko: "짧은 선뿐 아니라 긴 획, 빠른 방향 전환, 저속 압력 변화와 device loss를 검증합니다.", en: "Verify long strokes, rapid turns, slow pressure changes and device loss—not only short lines." },
      { ko: "fallback이 켜져도 문서 receipt와 재생 의미가 바뀌지 않게 하고 품질 차이는 사용자에게 설명합니다.", en: "Keep document receipts and replay meaning stable across fallbacks and explain quality differences to users." },
    ],
  },
  {
    id: "webrtc-media-authority",
    order: 30,
    status: "experimental",
    eyebrow: "30 · WEBRTC MEDIA AUTHORITY",
    title: {
      ko: "문서 협업과 실시간 미디어를 서로 다른 권위로 운영하기",
      en: "Operating document collaboration and realtime media as separate authorities",
    },
    thesis: {
      ko: "Socket.IO는 참가 승인과 시그널링을, RTCDataChannel은 직접 제어 메시지를, RTP는 음성·영상·화면 공유를 맡고 프로젝트 문서와 미디어 수신자 권위는 서로 섞지 않습니다.",
      en: "Socket.IO owns admission and signaling, RTCDataChannel direct control messages and RTP voice, video and screen media, without mixing document or recipient authority.",
    },
    problem: {
      ko: "시그널링 서버, STUN·TURN, 문서 동기화와 실제 미디어 경로를 하나의 ‘실시간 연결’로 취급하면 거리 UI와 실제 수신자가 어긋나고 권한 취소·네트워크 변경·늦은 SDP가 개인정보와 자원 누수로 이어집니다.",
      en: "Treating signaling, STUN or TURN, document sync and media routes as one realtime connection lets spatial UI drift from actual recipients and turns revoked authority, network changes and late SDP into privacy and resource leaks.",
    },
    decision: {
      ko: "room membership과 immutable conversation scope로 peer를 제한하고, 권한 프롬프트 뒤 revision을 다시 확인한 다음에만 track을 연결합니다. perfect negotiation, bounded ICE queue, restartIce, short-lived TURN policy refresh와 명시적 track·peer teardown을 각각 운영합니다. 라이브 룸의 데이터 경로도 같은 원칙으로 나눠 둡니다. 시그널링(WebSocket) 위에 RTCDataChannel 풀메시를 얹어 잉크 프레임과 CRDT diff를 서버 중계 없이 주고받고, 메시 피어는 8명으로 상한을 둡니다. 큰 파일은 24KB 청크로 나눠 sha256으로 무결성을 확인하는 벌크 전송으로 보내며, 한 번의 전송은 최대 256MB로 제한합니다.",
      en: "Room membership and immutable conversation scope bound peers, and authority revision is rechecked after every permission prompt before tracks attach. Perfect negotiation, bounded ICE queues, restartIce, short-lived TURN refresh and explicit track and peer teardown remain separate controls. The live room's data path follows the same separation: a full-mesh RTCDataChannel overlay on WebSocket signaling carries ink frames and CRDT diffs without a server relay, capped at eight peers, and large files move through a bulk-transfer protocol split into 24KB chunks with sha256 integrity checks, limited to 256MB per transfer.",
    },
    userValue: {
      ko: "사용자는 누가 실제 음성·영상·화면을 받는지 확인하고 권한 요청 전에도 공간을 탐색할 수 있으며, 네트워크가 바뀌거나 방을 나가면 연결과 장치가 예측 가능하게 복구·종료됩니다.",
      en: "Users can see actual media recipients, explore before granting device access and rely on predictable recovery or teardown when networks change or they leave a room.",
    },
    tradeoff: {
      ko: "현재 소규모 P2P huddle은 원격 peer를 세 명으로 제한하고 STUN-only 경로가 있으며, 실제 검증 일부는 단일 Chromium loopback입니다. WAN·제한 NAT·물리 장치·대규모 방송은 TURN과 SFU를 포함한 별도 증거가 필요합니다.",
      en: "The small P2P huddle caps remote peers at three and includes a STUN-only path, while some evidence uses one Chromium loopback. WAN, restrictive NAT, physical devices and large broadcast require separate TURN and SFU evidence.",
    },
    technologies: ["WebRTC", "RTCPeerConnection", "RTCDataChannel", "ICE", "STUN/TURN", "getUserMedia", "getDisplayMedia", "Socket.IO signaling"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts", "P2P 협상·미디어·ICE 복구 controller", "P2P negotiation, media and ICE recovery controller"),
      evidence("code", "apps/web/src/domains/creator/live/studio-live-p2p-overlay-transport.ts", "라이브 룸 DataChannel 풀메시 오버레이(상한 8피어)", "Live-room DataChannel full-mesh overlay (eight-peer cap)"),
      evidence("code", "apps/web/src/domains/creator/live/studio-peer-bulk-transfer.ts", "24KB 청크·sha256·최대 256MB 벌크 전송 프로토콜", "Bulk-transfer protocol: 24KB chunks, sha256, 256MB cap"),
      evidence("code", "apps/web/src/domains/creator/studio-screen-share.ts", "양방향 동의형 화면 공유", "Two-sided-consent screen sharing"),
      evidence("code", "apps/web/src/domains/creator/studio-voice-ice-policy.ts", "단기 TURN 정책과 기존 peer 갱신", "Short-lived TURN policy and existing-peer refresh"),
      evidence("document", "docs/studio-p2p-huddle.md", "시그널링·데이터·미디어 권위 경계", "Signaling, data and media authority boundary"),
      evidence("document", "docs/studio/virtual-studio-completion-acceptance-20260920.md", "실제 브라우저 수신자·media edge 검증", "Real-browser recipient and media-edge evidence"),
      evidence("document", "docs/technology/toonstudio-webrtc-realtime-media-2026-09-25.md", "WebRTC 권위·복구·벤치마크 정리", "WebRTC authority, recovery and benchmark review"),
    ],
    reuseSteps: [
      { ko: "identity, admission, recipient, signaling, direct data, media와 durable document 권위를 한 표에서 분리합니다.", en: "Separate identity, admission, recipients, signaling, direct data, media and durable-document authority in one matrix." },
      { ko: "마이크·카메라·화면 권한은 사용자 동작 뒤 요청하고 응답 시 session generation과 권한 revision을 다시 확인합니다.", en: "Request microphone, camera and screen access after user intent, then recheck session generation and authority revision on response." },
      { ko: "SDP·ICE 크기와 queue, peer 수, rate, reconnect 횟수, TURN TTL과 teardown을 제한합니다.", en: "Bound SDP and ICE size and queues, peer count, rate, reconnect attempts, TURN TTL and teardown." },
      { ko: "loopback, 실제 장치, 서로 다른 NAT, TURN relay와 대규모 SFU를 서로 다른 검증 단계로 기록합니다.", en: "Record loopback, physical devices, distinct NATs, TURN relay and large-scale SFU as separate evidence stages." },
    ],
  },
  {
    id: "virtual-studio-world-authority",
    order: 31,
    status: "experimental",
    eyebrow: "31 · VIRTUAL STUDIO WORLD",
    title: {
      ko: "가상 공간을 장식이 아니라 제작 상태의 또 다른 투영으로",
      en: "Treating the virtual world as another projection of production state",
    },
    thesis: {
      ko: "아바타·방·책상·보드와 대화는 공간 UI를 제공하지만 프로젝트, 권한, 작업 상태와 미디어 수신자는 기존 도메인 계약이 계속 소유합니다.",
      en: "Avatars, rooms, desks, boards and conversation provide a spatial UI while existing domain contracts keep authority over projects, permissions, work state and media recipients.",
    },
    problem: {
      ko: "Phaser scene 내부에 업무 규칙·협업 상태·미디어 권한까지 넣으면 목록 화면과 공간 화면이 서로 다른 진실을 만들고, 대형 component와 네트워크 결합이 함께 커집니다.",
      en: "Putting work rules, collaboration state and media permissions inside a Phaser scene creates conflicting truths between list and spatial views while coupling a giant component to networking.",
    },
    decision: {
      ko: "world manifest와 compiler, 순수 actor·interaction·conversation policy, 명시적 live/huddle adapter를 분리합니다. 공간 object는 승인된 action registry를 호출하고 프로젝트 graph·권한 원장을 다시 구현하지 않습니다.",
      en: "World manifests and compilation, pure actor, interaction and conversation policies, and explicit live/huddle adapters remain separate. Spatial objects call an allowlisted action registry rather than reimplementing project graphs or permission ledgers.",
    },
    userValue: {
      ko: "사용자는 같은 프로젝트를 공간·목록 중 익숙한 방식으로 탐색하고, 사람·방·도구를 찾으며, 제작 활동이 보이는 살아 있는 작업실을 사용할 수 있습니다.",
      en: "Users can navigate the same project through spatial or list views, find people, rooms and tools, and work inside a studio where production activity is visible.",
    },
    tradeoff: {
      ko: "공간 메타포는 발견성을 높이지만 이동·시각·멀미·저사양 접근 장벽도 만듭니다. keyboard·reduced motion·목록 대체 경로와 명시적인 media privacy를 항상 유지해야 합니다.",
      en: "Spatial metaphors improve discovery but add mobility, vision, motion and low-end device barriers. Keyboard, reduced-motion and list alternatives plus explicit media privacy must always remain available.",
    },
    technologies: ["Phaser", "world manifest", "action registry", "Socket.IO", "WebRTC adapter", "project graph", "reduced motion"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePage.tsx", "공간 화면과 도구·social adapter 조립", "Spatial page and tool/social adapter composition"),
      evidence("code", "apps/web/src/domains/creator/virtual-space/studio-virtual-space-world-manifest.ts", "버전된 world manifest", "Versioned world manifest"),
      evidence("document", "docs/studio/virtual-studio-living-world-design-20260920.md", "Living World 모듈·권위 설계", "Living World modules and authority design"),
      evidence("document", "docs/studio/virtual-studio-benchmark-20260920.md", "Gather·WorkAdventure·Kumospace 비교", "Gather, WorkAdventure and Kumospace benchmark"),
    ],
    reuseSteps: [
      { ko: "공간에서 보일 수 있는 상태와 실제 권한·업무 원장을 먼저 분리합니다.", en: "Separate spatially visible state from real authorization and work ledgers first." },
      { ko: "world manifest, renderer, actor locomotion, interaction policy와 network adapter를 독립 module로 둡니다.", en: "Keep world manifest, renderer, actor locomotion, interaction policy and network adapter as independent modules." },
      { ko: "방·객체는 임의 script 대신 허용된 action ID와 schema-validated payload만 실행하게 합니다.", en: "Let rooms and objects invoke only allowlisted action IDs with schema-validated payloads, never arbitrary scripts." },
      { ko: "keyboard·검색·목록·reduced motion 경로와 mic·camera의 실제 수신자 표시를 수락 조건에 포함합니다.", en: "Include keyboard, search, list and reduced-motion paths plus actual microphone and camera recipient disclosure in acceptance criteria." },
    ],
  },
  {
    id: "on-device-inference",
    order: 32,
    status: "live",
    eyebrow: "32 · ON-DEVICE INFERENCE",
    title: {
      ko: "서버 GPU 없이 브라우저에서 도는 AI 추론",
      en: "AI inference in the browser, with no server GPU",
    },
    thesis: {
      ko: "채색, 배경 제거, 선화 추출, 업스케일, 애니메이션풍 변환처럼 입력과 출력이 이미지 한 장으로 닫히는 추론은 ONNX Runtime Web으로 사용자 기기 안에서 끝냅니다. 서버 추론은 큰 모델이 필요한 생성 작업에만 남깁니다.",
      en: "Inference that closes over a single image—colorization, background removal, line extraction, upscaling, anime-style conversion—finishes on the user's device with ONNX Runtime Web. Server inference remains only for generation work that needs large models.",
    },
    problem: {
      ko: "이미지 추론을 전부 서버로 보내면 호출마다 GPU 비용과 업로드 대기가 쌓이고, API 키가 없거나 오프라인이면 기능 자체가 꺼집니다. 반대로 모델을 무작정 브라우저에 넣으면 수십 MB 다운로드와 기기 성능 편차가 사용자를 막습니다.",
      en: "Sending every image inference to a server stacks GPU cost and upload latency per call, and the feature simply turns off without an API key or a network. Putting models in the browser carelessly instead blocks users with tens of megabytes of downloads and wide device-performance variance.",
    },
    decision: {
      ko: "모델 레지스트리에 파일 크기, SHA-256 다이제스트와 텐서 계약을 등록한 모델만 기능이 켜지는 순간에 지연 로드하고, 받은 바이트의 다이제스트가 등록값과 같을 때만 세션을 엽니다. 실행 제공자는 WebGPU를 먼저 고르고, 쓸 수 없는 브라우저에서는 WASM 실행 제공자로 같은 모델을 돌립니다. 원본 픽셀은 기기를 떠나지 않습니다. WebGPU를 고르기 전에는 어댑터가 실제로 잡히는지도 확인합니다. 페이지 전역에서 한 번만 도는 프로브가 requestAdapter로 어댑터를 확인하고, 없으면 ORT 세션을 만들 시도 자체를 하지 않은 채 WASM 경로로 떨어집니다. 가상머신이나 GPU 블록리스트 환경에서 모델마다 세션 생성 실패를 반복해서 치르지 않기 위해서입니다.",
      en: "Only models registered with a byte size, SHA-256 digest and tensor contract lazy-load when a feature is invoked, and a session opens only after the received bytes match the registered digest. The execution provider prefers WebGPU and runs the same model on the WASM provider where WebGPU is unavailable. Source pixels never leave the device. Before WebGPU is chosen, a page-wide probe that runs once calls requestAdapter to confirm an adapter can actually be obtained; when none exists, the code falls to the WASM path without attempting an ORT session at all, instead of paying a failed session creation per model in virtual machines or on GPU blocklists.",
    },
    userValue: {
      ko: "키가 없어도, 네트워크가 끊겨도 채색·배경 제거·업스케일이 동작하고, 결과가 서버 왕복 없이 바로 캔버스로 돌아옵니다.",
      en: "Colorization, background removal and upscaling work without a key and without a network, and results return straight to the canvas with no server round trip.",
    },
    tradeoff: {
      ko: "모델 크기와 기기 성능이 그대로 제약이 됩니다. 선화 채색 모델은 약 79MB라 처음 켤 때 내려받는 대가가 크고, 저사양 기기에서는 추론이 느립니다. 그래서 모델마다 켜는 자리, 진행 표시와 취소 경로를 따로 둡니다.",
      en: "Model size and device performance remain hard constraints. The line-art colorizer is about 79MB, so first use carries a real download cost, and inference is slow on low-end devices. Each model therefore gets its own entry point, progress surface and cancellation path.",
    },
    technologies: ["ONNX Runtime Web", "WebGPU execution provider", "WASM execution provider", "SHA-256 digest", "lazy loading"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/studio-onnx-inference-provider.ts", "모델 레지스트리·다이제스트 검증·실행 제공자 선택", "Model registry, digest verification and execution-provider selection"),
      evidence("code", "apps/web/src/domains/creator/studio-onnx-webgpu-probe.ts", "WebGPU 어댑터 실재 프로브(페이지 전역 1회)", "WebGPU adapter existence probe (once per page)"),
      evidence("test", "apps/web/src/domains/creator/studio-onnx-webgpu-probe.test.ts", "어댑터 부재 시 세션 생성 시도 0회 검사", "Zero session-creation attempts when no adapter exists"),
      evidence("code", "apps/web/src/domains/creator/studio-onnx-runtime-assets.ts", "런타임과 모델 자산의 지연 로드", "Lazy loading of runtime and model assets"),
      evidence("code", "apps/web/src/domains/creator/ai/StudioOnnxColorizePanel.tsx", "기기 안 채색 패널", "On-device colorize panel"),
      evidence("document", "apps/web/src/domains/creator/assets/tag2pix.LICENSE.md", "모델별 출처와 라이선스 고지", "Per-model provenance and license notices"),
      evidence("test", "apps/web/src/domains/creator/studio-onnx-inference-provider.test.ts", "추론 제공자 경계와 실패 경로 검사", "Inference-provider boundary and failure-path tests"),
    ],
    reuseSteps: [
      { ko: "추론을 입력·출력이 한 번에 닫히는 작업과 맥락이 필요한 작업으로 나누고, 앞쪽만 온디바이스 후보로 둡니다.", en: "Split inference into self-contained jobs and context-heavy jobs, and keep only the former as on-device candidates." },
      { ko: "모델마다 파일 크기, 다이제스트, 텐서 계약과 라이선스 고지를 레지스트리에 함께 등록합니다.", en: "Register byte size, digest, tensor contract and license notice together for every model." },
      { ko: "실행 제공자는 능력 감지로 고르고, 미지원 환경에서는 같은 모델을 느린 제공자로 돌리는 폴백을 유지합니다.", en: "Choose the execution provider by capability detection and keep a fallback that runs the same model on the slower provider." },
      { ko: "모델 다운로드는 기능이 켜지는 순간으로 미루고 진행·취소·재시도를 사용자에게 드러냅니다.", en: "Defer model downloads until the feature is invoked and expose progress, cancellation and retry." },
    ],
  },
  {
    id: "storage-migration",
    order: 33,
    status: "live",
    eyebrow: "33 · STORAGE MIGRATION",
    title: {
      ko: "localStorage에 쌓인 문서를 IndexedDB로 옮기는 법",
      en: "Moving documents out of localStorage into IndexedDB",
    },
    thesis: {
      ko: "localStorage는 동기식이고 용량이 작아서, 이미지와 문서가 함께 자라는 데이터가 먼저 벽에 닿습니다. 성장형 문서는 IndexedDB로 옮기되, 이전은 검증이 끝날 때까지 기존 데이터를 지우지 않는 절차로만 합니다.",
      en: "localStorage is synchronous and small, so data where images and documents grow together hits the wall first. Growing documents move to IndexedDB, and migration never deletes the old copy until verification completes.",
    },
    problem: {
      ko: "캐릭터 캐논 문서는 시트 이미지가 포함돼 localStorage 상한에 걸렸고 한동안 이미지를 512px로 줄이는 우회로 버텼습니다. 큰 JSON을 저장할 때마다 UI 스레드가 멈추고, 이전 도중 실패하면 유일한 사본을 잃을 수 있습니다.",
      en: "Character canon documents carry sheet images and hit the localStorage ceiling; for a while the workaround was shrinking images to 512px. Saving large JSON stalls the UI thread, and a failed migration can lose the only copy.",
    },
    decision: {
      ko: "공용 이전 도구가 기존 키를 읽어 IndexedDB에 쓰고, 다시 읽어 같은 값인지 확인한 뒤에만 기존 키를 지웁니다. 화면은 하이드레이션이 끝나기 전에 저장을 시작하지 않고, 읽는 동안 도착한 편집은 병합해 잃지 않습니다. IndexedDB를 쓸 수 없는 환경에서는 localStorage가 폴백으로 남고, 인증과 부팅 초기값처럼 동기 읽기가 필요한 작은 값은 옮기지 않습니다.",
      en: "A shared migration helper reads the old key, writes it to IndexedDB, reads it back to confirm the same value, and only then removes the old key. Screens do not start saving before hydration finishes, and edits arriving during the read are merged rather than lost. Where IndexedDB is unavailable, localStorage remains the fallback, and small values that need synchronous reads—auth and boot defaults—do not move.",
    },
    userValue: {
      ko: "문서가 커져도 저장 용량 부족으로 작업을 잃지 않고, 큰 문서를 열고 저장할 때 화면이 멈추지 않습니다.",
      en: "Documents can grow without losing work to storage limits, and opening or saving a large document no longer freezes the screen.",
    },
    tradeoff: {
      ko: "비동기 하이드레이션을 기다리는 동안의 편집 병합과, 두 저장소에 값이 갈라지는 중간 상태를 코드가 계속 책임져야 합니다. 옮길 가치가 없는 작은 값까지 이전하면 복잡도만 늘어납니다.",
      en: "Edit merging during asynchronous hydration and the in-between state where two stores disagree remain the code's responsibility. Migrating small values with no growth pressure only adds complexity.",
    },
    technologies: ["IndexedDB", "localStorage", "verified migration", "hydration merge"],
    evidence: [
      evidence("code", "apps/web/src/shared/lib/idb-kv.ts", "읽기·쓰기·재읽기 검증 후에만 기존 키를 지우는 이전 도구", "Migration helper that removes the old key only after read-write-reread verification"),
      evidence("code", "apps/web/src/shared/lib/idb-json-storage.ts", "상태 스토어용 IndexedDB JSON 저장소", "IndexedDB JSON storage for state stores"),
      evidence("code", "apps/web/src/domains/creator/ai/canon/useStudioCharacterCanon.ts", "캐릭터 캐논 문서의 IndexedDB 이전 적용", "Character canon documents migrated to IndexedDB"),
      evidence("code", "apps/web/src/domains/creator/lettering/studio-dialogue-glossary-store.ts", "작품별 용어집의 IndexedDB 이전 적용", "Per-work glossaries migrated to IndexedDB"),
      evidence("test", "apps/web/src/shared/lib/idb-kv.test.ts", "이전 검증과 폴백 회귀 검사", "Migration verification and fallback regression tests"),
    ],
    reuseSteps: [
      { ko: "저장 데이터를 성장형 문서, 작은 동기 값, 파생 캐시로 나누고 성장형만 이전 대상으로 정합니다.", en: "Classify stored data into growing documents, small synchronous values and derived caches, and migrate only the growing documents." },
      { ko: "이전은 쓰기 뒤 재읽기 검증이 통과한 경우에만 기존 데이터를 지우는 순서로 고정합니다.", en: "Fix the migration order so the old data is removed only after a write-then-reread verification passes." },
      { ko: "하이드레이션 중 편집을 막을지 병합할지를 화면마다 정하고, 병합 규칙을 테스트로 고정합니다.", en: "Decide per screen whether edits during hydration are blocked or merged, and pin the merge rule with tests." },
      { ko: "새 저장소를 쓸 수 없는 환경을 폴백으로 유지하고 저장 실패를 빈 상태로 위장하지 않습니다.", en: "Keep a fallback for environments without the new store, and never disguise a save failure as an empty state." },
    ],
  },
  {
    id: "webtransport-transport",
    order: 34,
    status: "configured",
    eyebrow: "34 · WEBTRANSPORT TRANSPORT",
    title: {
      ko: "WebTransport 클라이언트는 완성, 켜는 스위치는 서버에 있습니다",
      en: "The WebTransport client is done; the switch lives on the server",
    },
    thesis: {
      ko: "실시간 전송 추상화에 WebTransport 소켓을 기존 WebSocket과 같은 계약으로 구현해 두었습니다. 엔드포인트가 설정되면 시도 순서가 WebTransport → WebSocket이 되고, 설정이 없으면 지금과 완전히 동일하게 WebSocket만으로 동작합니다.",
      en: "A WebTransport socket now implements the same contract as the existing WebSocket inside the realtime transport abstraction. With an endpoint configured, attempts run WebTransport first, then WebSocket; without one, behavior is exactly today's WebSocket only.",
    },
    problem: {
      ko: "WebSocket은 TCP라서 패킷 하나가 재전송을 기다리는 동안 뒤의 메시지가 전부 함께 막힙니다(head-of-line blocking). 커서 위치처럼 낡으면 버려도 되는 갱신까지, 순서가 생명인 메시지 뒤에 줄 서서 늦게 도착합니다.",
      en: "WebSocket rides TCP, so one packet waiting on retransmission blocks every message behind it (head-of-line blocking). Even disposable updates such as cursor positions queue behind messages whose ordering actually matters.",
    },
    decision: {
      ko: "Cloudflare 어댑터가 받는 소켓 계약을 WebTransport로 구현하고(studio-realtime-webtransport-socket.ts), 와이어 프로토콜은 바꾸지 않았습니다. 신뢰 스트림은 4바이트 길이 접두와 JSON으로 WebSocket의 메시지 경계를 재현합니다. 능력 감지는 팩토리 생성 시점에 끝나서, API가 없는 브라우저는 네트워크 비용 없이 곧바로 WebSocket 팩토리로 넘어갑니다. 커서 전용 데이터그램 레인은 전송 중 1개와 대기 중인 최신 1개만 남기는 합치기까지 구현했지만, 서버의 ack 정책이 정해지기 전이라 기본값은 꺼짐입니다.",
      en: "The socket contract the Cloudflare adapter consumes is implemented over WebTransport (studio-realtime-webtransport-socket.ts) without changing the wire protocol: reliable streams reproduce WebSocket message boundaries with a 4-byte length prefix plus JSON. Capability detection finishes at factory creation, so browsers without the API fall through to the WebSocket factory at zero network cost. A cursor-only datagram lane is implemented, including coalescing that keeps one in-flight and one latest pending frame, but it ships off until the server's ack policy is decided.",
    },
    userValue: {
      ko: "지금 당장 사용자의 화면이 달라지지는 않습니다. 그게 정직한 상태입니다. 대신 서버 종단이 붙는 날에는 코드가 아니라 엔드포인트 설정 한 줄로, 휘발성 갱신이 TCP 줄서기에서 빠져나갈 길이 열립니다.",
      en: "Nothing changes on user screens today, and that is the honest state. What is ready is the path: when a server endpoint lands, one endpoint setting—not new client code—lets volatile updates escape the TCP queue.",
    },
    tradeoff: {
      ko: "Cloudflare Workers(workerd)는 WebTransport 서버를 종단할 수 없고, Cloudflare 프록시는 QUIC를 오리진으로 넘기지 못합니다. 별도 QUIC 서버나 브리지가 필요해서, 클라이언트만으로 '도입 완료'라고 말하지 않고 상태를 '설정 완료'로 둡니다. UDP가 막힌 네트워크에서는 WebSocket이 호환 하한으로 남습니다.",
      en: "Cloudflare Workers (workerd) cannot terminate a WebTransport server, and the Cloudflare proxy does not pass QUIC through to origins. A separate QUIC server or bridge is required, so the client alone is not called 'shipped'—the status stays 'configured'. On networks where UDP is blocked, WebSocket remains the compatibility floor.",
    },
    technologies: ["WebTransport", "HTTP/3 (QUIC)", "WebSocket fallback", "datagrams", "capability detection"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator/studio-realtime-webtransport-socket.ts", "WebSocket 계약을 WebTransport로 구현한 소켓", "Socket implementing the WebSocket contract over WebTransport"),
      evidence("code", "apps/web/src/domains/creator/studio-realtime-webtransport-adapter.ts", "WebTransport 어댑터 팩토리와 체인 합성", "WebTransport adapter factory and chain composition"),
      evidence("code", "apps/web/src/domains/creator/live/studio-live-purpose-routed-transport.ts", "엔드포인트가 설정될 때만 체인에 WebTransport를 넣는 배선", "Wiring that adds WebTransport to the chain only when an endpoint is set"),
      evidence("test", "apps/web/src/domains/creator/studio-realtime-webtransport-adapter.test.ts", "프레이밍·레인 구분·핸드셰이크 왕복 검사", "Framing, lane separation and handshake round-trip tests"),
    ],
    reuseSteps: [
      { ko: "전송을 바꾸기 전에 기존 소켓 계약을 먼저 고정하고, 새 전송이 그 계약을 구현하게 합니다.", en: "Freeze the existing socket contract first, and make the new transport implement it." },
      { ko: "능력 감지는 연결 시도가 아니라 팩토리 생성 시점에 끝내 폴백 비용을 0으로 만듭니다.", en: "Finish capability detection at factory creation, not at connect time, so fallback costs nothing." },
      { ko: "휘발성 프레임의 분류 기준을 코드 한곳에 두고, 데이터그램 레인은 서버 정책이 정해질 때까지 기본 꺼짐으로 둡니다.", en: "Keep the volatile-frame classification in one place, and ship the datagram lane off until server policy is set." },
      { ko: "서버 종단 조건(티켓 전달, 프로토콜 선택, 방 브리지, ack 정책)을 계약 조항으로 먼저 적고 클라이언트와 맞춥니다.", en: "Write the server termination conditions—ticket passing, protocol selection, room bridging, ack policy—as contract clauses first and match the client to them." },
    ],
  },
  {
    id: "on-device-translation",
    order: 35,
    status: "configured",
    eyebrow: "35 · ON-DEVICE TRANSLATION",
    title: {
      ko: "한글 검색어는 기기를 떠나지 않고 영어가 됩니다",
      en: "Korean queries become English without leaving the device",
    },
    thesis: {
      ko: "리서치 데스크의 자료 인덱스가 영문 중심이라, 한글 질의를 Transformers.js(OPUS-MT 한→영 모델)로 브라우저 안에서 번역해 기존 영문 검색에 태웁니다. 검색어 텍스트가 외부 번역 API로 나가지 않습니다.",
      en: "The research desk's index is English-centric, so Korean queries are translated inside the browser with Transformers.js (an OPUS-MT Korean→English model) and fed into the existing English search. Query text never leaves for an outside translation API.",
    },
    problem: {
      ko: "한글 질의로는 영문 인덱스의 자료에 닿지 않았습니다. 외부 번역 API를 붙이면 질의마다 비용이 들고 민감할 수 있는 검색어가 기기를 떠납니다. 반대로 사전(辭典) 기반 변환만으로는 조사와 어미가 붙은 질의를 다 바꾸지 못합니다.",
      en: "Korean queries could not reach the English index. An external translation API would add per-query cost and send potentially sensitive search text off the device, while dictionary-only conversion cannot handle queries with particles and endings attached.",
    },
    decision: {
      ko: "번역 사다리(사전 → 모델 → 부분 사전 → 원문)는 그대로 두고, 비어 있던 모델 층에 @huggingface/transformers 4.3.0을 실제 동적 import로 연결했습니다(research-query-mt.ts). 런타임은 자체 호스팅으로 고정했습니다. 모델 경로는 /models/가 기본이고 allowRemoteModels=false라 외부에서 모델을 받아오는 경로는 코드에서 닫혀 있습니다. 내려받는 동안은 파일별 진행률을 안내 UI가 보여주고, 처음 한 번 약 123MB라는 용량을 받기 전에 고지합니다.",
      en: "The translation ladder—dictionary, model, partial dictionary, original text—stays as it was; the empty model rung now connects @huggingface/transformers 4.3.0 through a real dynamic import (research-query-mt.ts). The runtime is pinned to self-hosting: the model path defaults to /models/ and allowRemoteModels=false closes the remote-download path in code. While downloading, the notice UI shows per-file progress and states the roughly 123MB one-time size before anything is fetched.",
    },
    userValue: {
      ko: "한글로 입력해도 영문 인덱스의 자료가 검색되고, 영문 입력의 동작은 전과 같습니다. 모델이 없거나 실패하면 사전 변환과 원문으로 조용히 떨어질 뿐, 검색 자체가 막히는 일은 없습니다.",
      en: "Korean input now reaches the English index, and English input behaves exactly as before. If the model is absent or fails, the ladder quietly falls back to dictionary conversion and the original text—search itself is never blocked.",
    },
    tradeoff: {
      ko: "모델 파일 약 123MB(양자화 인코더 52.9MB, 디코더 60.2MB, 토크나이저 등 약 10MB)는 저장소에 넣지 않습니다. 배포할 때 dist/models/Xenova/opus-mt-ko-en/에 파일을 배치해야 켜지고, 배치 전 환경에서는 모델 층이 없는 것과 같아 종전 동작과 동일합니다. 번역 품질은 검색 질의 수준에서만 다룹니다. 긴 문장을 번역하는 도구가 아닙니다.",
      en: "The roughly 123MB of model files (52.9MB quantized encoder, 60.2MB decoder, about 10MB of tokenizer files) are not committed to the repository. They must be placed under dist/models/Xenova/opus-mt-ko-en/ at deploy time; until then the model rung is simply absent and behavior matches the previous release. Translation quality is scoped to search queries—this is not a long-sentence translation tool.",
    },
    technologies: ["Transformers.js", "@huggingface/transformers 4.3.0", "OPUS-MT ko→en", "ONNX Runtime Web", "self-hosted model files"],
    evidence: [
      evidence("code", "apps/web/src/domains/creator-resources/research-query-mt.ts", "자체 호스팅 고정과 진행률 구독을 갖춘 기계번역 로더", "Machine-translation loader pinned to self-hosting with progress subscription"),
      evidence("code", "apps/web/src/domains/creator-resources/use-translated-research-query.ts", "번역 사다리를 검색 입력에 연결하는 훅", "Hook connecting the translation ladder to search input"),
      evidence("code", "apps/web/src/domains/creator-resources/TranslatedQueryNotice.tsx", "용량 고지와 파일별 진행률을 보여주는 안내 UI", "Notice UI showing the size disclosure and per-file progress"),
      evidence("test", "apps/web/src/domains/creator-resources/research-query-mt.test.ts", "환경 고정·실패 폴백·진행률 검사", "Environment pinning, failure fallback and progress tests"),
    ],
    reuseSteps: [
      { ko: "번역 같은 보조 층은 사다리의 한 칸으로 넣고, 그 층의 실패가 전체 기능을 막지 않게 합니다.", en: "Add auxiliary layers such as translation as one rung of a ladder, so its failure never blocks the whole feature." },
      { ko: "모델 경로는 자체 호스팅으로 고정하고 원격 다운로드를 코드에서 차단합니다.", en: "Pin model paths to self-hosting and block remote downloads in code." },
      { ko: "큰 모델은 받기 전에 용량을 고지하고 파일별 진행률을 보여줍니다.", en: "Disclose the size before downloading a large model and show per-file progress." },
      { ko: "모델 파일의 배포 배치는 코드와 분리하고, 배치 전 동작이 종전과 같은지 테스트로 고정합니다.", en: "Keep model-file placement at deploy time separate from code, and pin with tests that pre-placement behavior matches the previous release." },
    ],
  },
  {
    id: "content-addressing",
    order: 36,
    status: "live",
    eyebrow: "36 · CONTENT ADDRESSING",
    title: {
      ko: "파일의 주소가 위치가 아니라 내용이면, 주소가 곧 검증입니다",
      en: "When a file's address is its content, the address is the verification",
    },
    thesis: {
      ko: "통합 연동 센터에 IPFS 콘텐츠 주소 도구를 넣었습니다. 파일의 CID를 만들고, CID로 가져온 바이트가 정말 그 해시와 맞는지 검증한 뒤에야 성공으로 칩니다. 링크가 죽는 문제와 받은 파일이 원본인지 확인하는 문제를, 주소 하나로 같이 다룹니다.",
      en: "The integration center now has an IPFS content-addressing tool. It mints a file's CID and, for fetched bytes, succeeds only after checking they really match the hash in the address. Dead links and 'is this the original?' become one problem, handled by one address.",
    },
    problem: {
      ko: "URL은 위치라서 원본이 옮겨지거나 사라지면 링크가 죽고, 받은 파일이 원본과 같은지는 별도 절차로 확인해야 했습니다. 반대로 브라우저가 IPFS 노드인 척 풀 노드를 들이면, DHT 제공자 역할을 할 수 없는 환경에서 약속할 수 없는 기능이 생깁니다.",
      en: "URLs are locations: move or delete the origin and the link dies, and confirming a received file equals the original takes a separate procedure. Pretending the browser is a full IPFS node is the opposite failure—it promises network roles a browser cannot perform, such as acting as a DHT provider.",
    },
    decision: {
      ko: "개발이 끝난 js-ipfs는 어떤 경우에도 쓰지 않고, 후계인 Helia의 경량 패키지 @helia/verified-fetch 8.1.2와 multiformats 14.0.5로 '검증하며 가져오기'만 구현했습니다(ipfs-content-address.ts). CID 생성·파싱·바이트 단위 검증은 raw 코덱과 sha2-256 범위에서 하고, dag-pb 같은 범위 밖 코덱은 조용히 넘기지 않고 unsupported-codec으로 구분해 답합니다. 가져오기는 trustless 게이트웨이 규격으로 받고, 받은 바이트를 CID와 대조한 뒤에만 건넵니다.",
      en: "The discontinued js-ipfs is not used under any circumstances. The implementation uses only Helia's lightweight packages—@helia/verified-fetch 8.1.2 and multiformats 14.0.5—to do verified fetching (ipfs-content-address.ts). CID creation, parsing and byte-level verification cover the raw codec and sha2-256; out-of-scope codecs such as dag-pb are answered distinctly as unsupported-codec instead of being silently passed over. Fetches use the trustless gateway spec, and bytes are handed over only after matching the CID.",
    },
    userValue: {
      ko: "파일에서 CID를 만들어 공유 링크로 쓸 수 있고, CID로 받은 파일이 변조되지 않았음을 도구가 확인해 줍니다. 동작은 공개 테스트 벡터(빈 바이트와 'hello world'의 CID)와 실제 게이트웨이에서 검증하며 가져오는 방식으로 확인했습니다.",
      en: "Users can mint a CID from a file to use as a share link, and the tool confirms that bytes fetched by CID are untampered. Behavior was checked against public test vectors—the CIDs of empty bytes and of 'hello world'—and by verified fetching from a live gateway.",
    },
    tradeoff: {
      ko: "브라우저에서 네트워크에 콘텐츠를 제공하는 기능은 없습니다. CID는 무결성 주소이자 공유 링크일 뿐, 바이트의 배포는 게이트웨이와 기존 서버 표면이 맡습니다. raw CID와 UnixFS(dag-pb) CID는 같은 파일이어도 서로 호환되지 않고, 풀 노드 도입은 파일 CID 호환이나 제공 역할이 실제로 필요해질 때의 후속으로 남겼습니다.",
      en: "The browser does not provide content to the network. A CID here is an integrity address and share link; byte distribution stays with gateways and the existing server surfaces. Raw CIDs and UnixFS (dag-pb) CIDs are not interchangeable even for the same file, and a full node remains follow-up work for when file-CID compatibility or a provider role is actually needed.",
    },
    technologies: ["IPFS CID", "@helia/verified-fetch 8.1.2", "multiformats 14.0.5", "SHA-256", "trustless gateway"],
    evidence: [
      evidence("code", "apps/web/src/domains/integrations/ipfs-content-address.ts", "CID 생성·검증·검증 가져오기 모듈", "CID creation, verification and verified-fetch module"),
      evidence("code", "apps/web/src/domains/integrations/IpfsContentAddressPanel.tsx", "연동 센터의 콘텐츠 주소 도구 패널", "Content-addressing tool panel in the integration center"),
      evidence("test", "apps/web/src/domains/integrations/ipfs-content-address.test.ts", "공개 CID 벡터와 코덱 경계 검사", "Public CID vectors and codec-boundary tests"),
    ],
    reuseSteps: [
      { ko: "콘텐츠 주소는 정본 저장소를 바꾸는 일이 아니라, 무결성과 공유 표면부터 붙입니다.", en: "Attach content addressing at the integrity and sharing surface first, not as a replacement for the canonical store." },
      { ko: "지원 코덱 범위를 코드에서 명시하고 범위 밖은 실패로 뭉개지 말고 구분된 답으로 돌려줍니다.", en: "Declare the supported codec scope in code, and answer out-of-scope input distinctly instead of collapsing it into failure." },
      { ko: "가져오기는 받은 바이트를 주소의 해시와 대조한 뒤에만 성공으로 칩니다.", en: "Count a fetch as successful only after the received bytes match the hash in the address." },
      { ko: "브라우저가 할 수 없는 일(네트워크 제공)은 UI 문구에서도 약속하지 않습니다.", en: "Never promise in UI copy what the browser cannot do, such as providing content to the network." },
    ],
  },
  {
    id: "nextgen-web-experiments",
    order: 37,
    status: "experimental",
    eyebrow: "37 · NEXT-GEN WEB EXPERIMENTS",
    title: {
      ko: "실험 API는 감지해서, 표지를 달고, 끌 수 있게 넣습니다",
      en: "Experimental APIs go in detected, labeled and switchable",
    },
    thesis: {
      ko: "아직 표준이 굳지 않은 웹 API를 제품에 넣는 규칙을 하나로 정했습니다. 능력 감지는 한곳에서, 화면에는 실험 표지를, 설정에는 끄는 토글을. 이 세 가지가 갖춰진 실험만 사용자 화면에 닿습니다.",
      en: "One rule now governs putting not-yet-settled web APIs into the product: capability detection in a single place, an experiment label on the surface, and an off switch in settings. Only experiments with all three reach user screens.",
    },
    problem: {
      ko: "실험 API를 화면마다 제멋대로 감지하면 지원 판정이 어긋나고, 끌 방법이 없는 실험은 문제가 생겼을 때 사용자가 피할 길이 없습니다. 반대로 전부 막아 두면 화면 유지, 문서 미리 불러오기, CPU 압력 신호처럼 이미 쓸 수 있는 이득을 영영 못 씁니다.",
      en: "Letting each screen detect experimental APIs on its own makes support verdicts disagree, and an experiment with no off switch leaves users no escape when something misbehaves. Blocking everything instead forfeits gains that are already usable—keeping the screen awake, prerendering document navigations, CPU pressure signals.",
    },
    decision: {
      ko: "차세대 API 27종의 감지를 nextgen-web-capabilities.ts 한 모듈에 모았습니다. 감지는 절대 예외를 던지지 않고 미지원은 그냥 false입니다. 실험 설정(nextgen-lab-settings.ts)은 토글 3종(리더 화면 유지, 스튜디오 프리렌더, 읽기 전환)을 정본으로 관리하고, 설정 화면의 실험 기능 섹션이 실험 배지와 함께 이 기기의 지원 여부를 그대로 보여줍니다. 실제로 켠 것은 Screen Wake Lock(작품 리더), Speculation Rules(공개 페이지에서 스튜디오로 넘어가는 문서 이동의 프리렌더), View Transitions(작품 상세에서 읽기 시작할 때의 전환), Compute Pressure(관찰 모듈과 최신 판정 지점까지)입니다.",
      en: "Detection for 27 next-generation APIs lives in one module, nextgen-web-capabilities.ts. Detection never throws; unsupported simply means false. Lab settings (nextgen-lab-settings.ts) own three toggles—reader wake lock, studio prerender, reading transition—and the settings screen's experiment section shows this device's support next to an experiment badge. What is actually switched on: Screen Wake Lock in the title reader, Speculation Rules prerendering document navigations from public pages into the studio, View Transitions when starting to read from a title page, and Compute Pressure up to the observation module and its latest-verdict seam.",
    },
    userValue: {
      ko: "작품을 읽는 동안 화면이 꺼지지 않고, 스튜디오로 넘어가는 이동이 미리 준비되며, 읽기를 시작하는 전환이 부드럽습니다. 전부 이 기기가 지원할 때만 동작하고, 실험 기능 섹션에서 언제든 끌 수 있습니다.",
      en: "The screen stays awake while reading, navigations into the studio are prepared ahead of time, and starting to read transitions smoothly. All of it runs only where the device supports it, and all of it can be switched off in the experiment section at any time.",
    },
    tradeoff: {
      ko: "실험 기능에는 폴백을 만들지 않는 것이 이 축의 운용 방침이라, 미지원 브라우저에서는 기능이 조용히 없을 뿐입니다. 기존 제품 표면의 폴백 원칙(ONNX 제공자 사다리 같은)은 그대로 유지합니다. Compute Pressure는 신호만 열어 뒀고 실제 품질 적응은 가상 스튜디오와 추론 표면이 각자 붙입니다. 필기 인식과 가상 키보드처럼 접점이 없거나 지원이 끝난 API는 감지만 넣어 두고 켜지 않습니다.",
      en: "The operating policy for this axis is that experimental features get no fallback: on unsupported browsers the feature is simply, quietly absent. Established fallback principles on product surfaces—such as the ONNX provider ladder—remain untouched. Compute Pressure is opened as a signal only; actual quality adaptation is wired by the virtual studio and inference surfaces themselves. APIs with no contact point or ended support, such as handwriting recognition and the virtual keyboard API, are detection-only and never switched on.",
    },
    technologies: ["capability registry (27 APIs)", "Screen Wake Lock", "Speculation Rules", "View Transitions", "Compute Pressure"],
    evidence: [
      evidence("code", "apps/web/src/shared/lib/nextgen-web-capabilities.ts", "차세대 API 27종의 능력 감지 레지스트리", "Capability-detection registry for 27 next-generation APIs"),
      evidence("code", "apps/web/src/shared/lib/nextgen-lab-settings.ts", "실험 토글의 정본과 구독", "Canonical lab toggles with subscription"),
      evidence("code", "apps/web/src/domains/account/NextgenLabSettingsSection.tsx", "설정 화면의 실험 기능 섹션", "Experiment section on the settings screen"),
      evidence("code", "apps/web/src/shared/lib/screen-wake-lock.ts", "리더 화면 유지 모듈", "Reader wake-lock module"),
      evidence("code", "apps/web/src/shared/lib/speculation-rules.ts", "문서 이동 프리렌더 규칙 모듈", "Document-navigation prerender rules module"),
      evidence("test", "apps/web/src/shared/lib/nextgen-web-capabilities.test.ts", "감지 경계와 never-throw 검사", "Detection boundary and never-throw tests"),
    ],
    reuseSteps: [
      { ko: "새 실험 API는 화면에 붙이기 전에 감지 레지스트리에 먼저 등록합니다.", en: "Register a new experimental API in the detection registry before attaching it to any screen." },
      { ko: "실험마다 끄는 토글과 실험 표지를 함께 만들고, 기본값과 그 이유를 기록합니다.", en: "Ship every experiment with an off toggle and a label, and record the default and why." },
      { ko: "감지는 던지지 않게 만들고, 미지원을 오류 상태로 표시하지 않습니다.", en: "Make detection non-throwing, and never render 'unsupported' as an error state." },
      { ko: "켜지 않기로 한 실험도 판정과 재검토 조건을 남겨 다음 검토가 처음부터 시작하지 않게 합니다.", en: "Leave a verdict and revisit conditions even for experiments that stay off, so the next review does not start from zero." },
    ],
  },
] as const satisfies readonly EngineeringChapter[];

export const ENGINEERING_ADVANCED_GUIDES = [
  {
    id: "social-identity-lifecycle",
    status: "configured",
    title: { ko: "소셜 로그인 생애주기 설계", en: "Social identity lifecycle" },
    summary: {
      ko: "로그인 성공뿐 아니라 callback 중복, 계정 연결, unlink와 탈퇴까지 하나의 상태 기계로 설계합니다.",
      en: "Design login success, duplicate callbacks, account linking, unlinking and deletion as one state machine.",
    },
    outcome: {
      ko: "공급자 장애·정책 변경과 제품 계정·세션을 분리한 인증 경계를 얻습니다.",
      en: "A product-account and session boundary isolated from provider outages and policy changes.",
    },
    steps: [
      { ko: "provider subject, verified contact, product user와 product session 식별자를 분리합니다.", en: "Separate provider subject, verified contact, product user and product session identifiers." },
      { ko: "공급자별 redirect, scope, response mode, PKCE·nonce·state와 cookie 정책을 표로 고정합니다.", en: "Freeze provider redirects, scopes, response modes, PKCE, nonce, state and cookie policy in a matrix." },
      { ko: "callback은 일회성 state와 provider code를 소비하고 중복 요청을 멱등 또는 명시적 오류로 닫습니다.", en: "Consume one-time state and provider codes and close duplicate callbacks idempotently or with an explicit error." },
      { ko: "계정 연결에는 기존 세션과 새 provider 모두의 재인증을 요구하고 자동 이메일 병합 범위를 제한합니다.", en: "Require reauthentication of both the current session and new provider for account linking and tightly bound email merging." },
      { ko: "unlink webhook, 마지막 로그인 수단 제거, 전체 탈퇴와 session revoke를 별도 시나리오로 검증합니다.", en: "Verify unlink webhooks, removal of the final login method, full deletion and session revocation separately." },
    ],
    checklist: [
      { ko: "client secret과 장기 token이 브라우저 번들에 없음", en: "No client secrets or long-lived tokens in browser bundles" },
      { ko: "redirect exact match·state·PKCE 또는 nonce 검증", en: "Exact redirect matching and state, PKCE or nonce verification" },
      { ko: "verified contact가 없을 때도 provider subject로 안전하게 로그인", en: "Safe provider-subject login even without a verified contact" },
      { ko: "unlink·탈퇴·secret rotation runbook 존재", en: "Unlink, deletion and secret-rotation runbooks exist" },
    ],
  },
  {
    id: "share-distribution",
    status: "live",
    title: { ko: "공유·유입·미리보기 파이프라인", en: "Share, acquisition and preview pipeline" },
    summary: {
      ko: "하나의 canonical payload에서 native share, 채널 URL, copy, QR과 Open Graph를 만듭니다.",
      en: "Derive native share, channel URLs, copy, QR and Open Graph from one canonical payload.",
    },
    outcome: {
      ko: "채널별 장애와 지원 차이를 격리하면서 일관된 링크·미리보기·측정 규칙을 유지합니다.",
      en: "Consistent links, previews and measurement rules with channel capability and failure isolated.",
    },
    steps: [
      { ko: "canonical URL, content ID, locale, title, text와 image를 가진 immutable payload를 만듭니다.", en: "Create an immutable payload containing canonical URL, content ID, locale, title, text and image." },
      { ko: "native share 가능 여부와 canShare payload를 사용자 동작 시점에 검사합니다.", en: "Check native-share support and canShare payload at the time of user activation." },
      { ko: "각 공식 share URL과 SDK adapter가 URL encoding·popup·app switch를 독립 처리하게 합니다.", en: "Let every official share URL and SDK adapter independently handle encoding, popups and app switching." },
      { ko: "Clipboard 실패에는 selection 기반 copy fallback을 두고 QR 모듈은 패널을 열 때만 로드합니다.", en: "Add a selection-based copy fallback for Clipboard failures and lazy-load QR only when the panel opens." },
      { ko: "crawler preview와 analytics를 별도 검증하고 share intent와 downstream conversion을 구분합니다.", en: "Verify crawler previews and analytics independently and separate share intent from downstream conversion." },
    ],
    checklist: [
      { ko: "canonical과 OG URL·title·description·image 일치", en: "Canonical and Open Graph URL, title, description and image agree" },
      { ko: "사용자 취소는 오류 toast나 error metric으로 기록하지 않음", en: "User cancellation is not shown as an error or recorded as an error metric" },
      { ko: "UTM 추가가 기존 query·hash를 파괴하지 않음", en: "UTM addition preserves existing query and hash" },
      { ko: "analytics에 전체 공유 URL·제목·개인정보를 보내지 않음", en: "Analytics receives no full shared URL, title or personal data" },
    ],
  },
  {
    id: "crdt-semantic-scope",
    status: "experimental",
    title: { ko: "CRDT 의미 범위와 자산 경계", en: "CRDT semantic scope and asset boundary" },
    summary: {
      ko: "협업 의미 연산만 CRDT가 소유하고 대형 결과물·권한·내구 저장은 별도 계층에 둡니다.",
      en: "Let CRDT own collaborative semantic operations while large artifacts, authorization and durable storage remain separate.",
    },
    outcome: {
      ko: "오프라인·재접속 수렴성과 room resource 예산을 함께 통제할 수 있습니다.",
      en: "Offline and reconnect convergence with controlled room resource budgets.",
    },
    steps: [
      { ko: "동시 수정 단위를 layer, object, property, ordered operation과 awareness로 분류합니다.", en: "Classify concurrent units as layers, objects, properties, ordered operations and awareness." },
      { ko: "binary asset는 content hash와 durable receipt로 참조하고 CRDT update에 원본 bytes를 넣지 않습니다.", en: "Reference binary assets through content hashes and durable receipts instead of putting source bytes in CRDT updates." },
      { ko: "schema version, migration, invalid update rejection과 update size limit을 transport보다 먼저 정의합니다.", en: "Define schema versioning, migration, invalid-update rejection and update-size limits before choosing transport." },
      { ko: "room leader/authority, persistence snapshot, compaction과 reconnect protocol을 별도 계약으로 둡니다.", en: "Keep room authority, persistence snapshots, compaction and reconnect protocols as separate contracts." },
      { ko: "재정렬·중복·offline fork·삭제·구버전 client 시나리오를 convergence test로 만듭니다.", en: "Create convergence tests for reordered, duplicate, offline-fork, deletion and old-client scenarios." },
    ],
    checklist: [
      { ko: "CRDT update·awareness·room·asset 크기 제한", en: "Limits for CRDT updates, awareness, rooms and assets" },
      { ko: "권한 검사는 CRDT merge와 별도 server boundary에서 수행", en: "Authorization enforced at a server boundary separate from CRDT merge" },
      { ko: "대형 binary와 media stream이 CRDT 문서 밖에 있음", en: "Large binaries and media streams remain outside the CRDT document" },
      { ko: "schema migration과 snapshot compaction을 실제 구버전으로 검증", en: "Schema migration and snapshot compaction verified with real old versions" },
    ],
  },
  {
    id: "brush-preview-commit",
    status: "experimental",
    title: { ko: "브러시 preview·commit 권위 분리", en: "Brush preview and commit authority" },
    summary: {
      ko: "즉시 반응하는 표시 경로와 저장·재생 가능한 최종 문서 경로를 같은 stroke receipt로 연결합니다.",
      en: "Connect immediate display and durable replayable document paths through one stroke receipt.",
    },
    outcome: {
      ko: "GPU·WASM·Canvas backend를 바꿔도 Undo·재생·내보내기의 의미가 유지됩니다.",
      en: "Undo, replay and export semantics remain stable while GPU, WASM and Canvas backends change.",
    },
    steps: [
      { ko: "raw pointer와 normalized sample schema를 분리하고 device-specific pressure·tilt 보정을 한 곳에서 수행합니다.", en: "Separate raw pointer events from normalized samples and centralize device-specific pressure and tilt correction." },
      { ko: "stroke ID, brush revision, seed, material parameters와 layer transform을 immutable receipt로 만듭니다.", en: "Create an immutable receipt containing stroke ID, brush revision, seed, material parameters and layer transform." },
      { ko: "preview, simulation, composite, tile commit와 history append의 deadline·cancellation·authority를 선언합니다.", en: "Declare deadlines, cancellation and authority for preview, simulation, compositing, tile commit and history append." },
      { ko: "Worker에는 transferable sample buffer를 보내고 늦은 응답이 다음 stroke를 덮어쓰지 못하게 generation을 검사합니다.", en: "Send transferable sample buffers to Workers and use generations so late responses cannot overwrite newer strokes." },
      { ko: "committed parity, 긴 획 memory, device loss와 fallback 품질을 실제 browser에서 측정합니다.", en: "Measure committed parity, long-stroke memory, device loss and fallback quality in real browsers." },
    ],
    checklist: [
      { ko: "preview와 commit이 동일 stroke identity·brush revision을 사용", en: "Preview and commit use the same stroke identity and brush revision" },
      { ko: "pointer-up·cancel·device loss 뒤 자원·history 상태가 결정적", en: "Resources and history are deterministic after pointer-up, cancellation and device loss" },
      { ko: "backend fallback에서 receipt·Undo·export 의미 유지", en: "Receipts, undo and export semantics survive backend fallback" },
      { ko: "latency뿐 아니라 perceptual quality·memory·committed parity 검증", en: "Perceptual quality, memory and committed parity verified alongside latency" },
    ],
  },
  {
    id: "webrtc-media-boundary",
    status: "experimental",
    title: { ko: "WebRTC 미디어 권위와 복구 설계", en: "WebRTC media authority and recovery" },
    summary: {
      ko: "시그널링, peer admission, 실제 수신자, device permission과 media transport를 durable 문서 협업에서 분리합니다.",
      en: "Separate signaling, peer admission, actual recipients, device permission and media transport from durable document collaboration.",
    },
    outcome: {
      ko: "네트워크 변경과 권한 취소에도 누구에게 어떤 track이 전달되는지 설명하고 검증할 수 있습니다.",
      en: "Explain and verify which tracks reach which recipients through network changes and revoked authority.",
    },
    steps: [
      { ko: "identity·room admission·conversation membership과 media recipient scope를 먼저 정의합니다.", en: "Define identity, room admission, conversation membership and media-recipient scope first." },
      { ko: "시그널링 envelope와 SDP·ICE payload를 versioning하고 크기·queue·rate를 제한합니다.", en: "Version signaling envelopes and SDP and ICE payloads, then bound size, queues and rate." },
      { ko: "getUserMedia·getDisplayMedia 응답 뒤 session generation과 권한 revision을 재검증합니다.", en: "Revalidate session generation and authority revision after getUserMedia or getDisplayMedia resolves." },
      { ko: "perfect negotiation, pending ICE, restartIce, TURN credential refresh와 device switch를 독립 상태로 처리합니다.", en: "Handle perfect negotiation, pending ICE, restartIce, TURN credential refresh and device switching as explicit states." },
      { ko: "leave·block·unmount·track ended에서 sender, receiver, track, stream, handler와 peer를 모두 정리합니다.", en: "Clean up sender, receiver, tracks, streams, handlers and peers on leave, block, unmount and track end." },
    ],
    checklist: [
      { ko: "공간상 근접 표시와 실제 media peer scope가 같은 recipient authority를 사용", en: "Spatial proximity and actual media peer scope share one recipient authority" },
      { ko: "권한 프롬프트가 열린 동안 방·역할 변경 시 늦은 stream을 즉시 중지", en: "Late streams stop immediately when room or role changes during a permission prompt" },
      { ko: "STUN-only와 TURN relay, loopback과 WAN 결과를 별도 상태로 표시", en: "STUN-only versus TURN relay and loopback versus WAN are reported separately" },
      { ko: "연결 종료 뒤 열린 track·timer·event handler·peer connection이 없음", en: "No live tracks, timers, handlers or peer connections remain after teardown" },
    ],
  },
  {
    id: "virtual-studio-authority",
    status: "experimental",
    title: { ko: "가상 스튜디오 권위와 접근성", en: "Virtual-studio authority and accessibility" },
    summary: {
      ko: "공간 UI를 프로젝트·협업 도메인의 projection으로 만들고 목록·키보드 대체 경로를 동등하게 유지합니다.",
      en: "Build the spatial UI as a projection of project and collaboration domains while retaining equivalent list and keyboard paths.",
    },
    outcome: {
      ko: "살아 있는 공간 경험을 추가해도 권한·업무 상태·미디어 privacy가 분열되지 않습니다.",
      en: "A living spatial experience without fragmenting authorization, work state or media privacy.",
    },
    steps: [
      { ko: "공간에 투영할 project, member, activity, room과 tool 상태를 read model로 정의합니다.", en: "Define project, member, activity, room and tool state as spatial read models." },
      { ko: "world manifest를 versioned schema로 만들고 compiler가 collision, spawn, object action과 provenance를 검증하게 합니다.", en: "Use a versioned world-manifest schema and compile collision, spawn, object actions and provenance." },
      { ko: "movement·animation·NPC·interaction policy를 renderer와 network에서 분리해 순수 테스트합니다.", en: "Separate and pure-test movement, animation, NPC and interaction policies from renderer and networking." },
      { ko: "social·huddle·conversation은 기존 membership·recipient authority를 adapter로 사용합니다.", en: "Make social, huddle and conversation adapters consume existing membership and recipient authority." },
      { ko: "search, map, list, keyboard, reduced motion, low-power와 permission-on-use 경로를 같이 검증합니다.", en: "Verify search, map, list, keyboard, reduced-motion, low-power and permission-on-use paths together." },
    ],
    checklist: [
      { ko: "공간 화면이 project·permission 원장을 복제하지 않음", en: "Spatial view does not duplicate project or permission ledgers" },
      { ko: "object action은 allowlist와 schema 검증을 통과", en: "Object actions pass allowlists and schema validation" },
      { ko: "mic·camera·screen share의 실제 수신자와 잠금 상태 표시", en: "Actual recipients and lock state shown for microphone, camera and screen share" },
      { ko: "공간을 사용하지 않아도 모든 핵심 업무를 목록·키보드로 완료", en: "Every core task remains completable through list and keyboard without the spatial view" },
    ],
  },
  {
    id: "webtransport-transport",
    status: "configured",
    title: { ko: "WebTransport 전송 계층 붙이기", en: "Adding a WebTransport transport layer" },
    summary: {
      ko: "기존 소켓 계약을 그대로 구현하는 WebTransport 소켓을 만들고, 엔드포인트 설정이 있을 때만 시도 체인 앞에 둡니다.",
      en: "Build a WebTransport socket that implements the existing socket contract unchanged, and place it at the head of the attempt chain only when an endpoint is configured.",
    },
    outcome: {
      ko: "서버 종단이 붙기 전에도 클라이언트는 완성돼 있고, 동작은 WebSocket과 동일함이 테스트로 고정됩니다.",
      en: "The client is complete before any server endpoint exists, with behavior identical to WebSocket pinned by tests.",
    },
    steps: [
      { ko: "현재 소켓 계약(연결·메시지·종료 의미)을 먼저 명세로 고정하고 어댑터가 그 계약만 보게 합니다.", en: "Freeze the current socket contract—connect, message and close semantics—as a spec first, and let adapters see only that contract." },
      { ko: "신뢰 스트림의 프레이밍(길이 접두 + JSON)으로 기존 메시지 경계를 재현하고 왕복 테스트로 고정합니다.", en: "Reproduce existing message boundaries on the reliable stream with length-prefixed JSON framing, pinned by round-trip tests." },
      { ko: "능력 감지는 팩토리에서 끝내고, 미지원이면 같은 시도 안에서 다음 팩토리로 넘어가게 합니다.", en: "Finish capability detection in the factory, so unsupported environments move to the next factory within the same attempt." },
      { ko: "휘발성 프레임 분류를 한곳에 두고 데이터그램 레인은 서버 ack 정책이 정해질 때까지 기본 꺼짐으로 둡니다.", en: "Keep volatile-frame classification in one place and ship the datagram lane off until the server ack policy is decided." },
      { ko: "서버 계약 조항(티켓 전달, 프로토콜 선택, 방 브리지, 크기 상한)을 클라이언트와 같은 문서에 적습니다.", en: "Write the server contract clauses—ticket passing, protocol selection, room bridging, size caps—in the same document as the client." },
    ],
    checklist: [
      { ko: "엔드포인트 미설정 시 기존 WebSocket 동작과 바이트 의미가 동일", en: "With no endpoint configured, WebSocket behavior and byte semantics are unchanged" },
      { ko: "API 미지원 브라우저에서 네트워크 시도 없이 폴백", en: "Browsers without the API fall back with no network attempt" },
      { ko: "데이터그램 레인의 기본값이 꺼짐이고 켜는 조건이 문서화됨", en: "The datagram lane defaults to off, with its enabling conditions documented" },
      { ko: "서버 종단 전제를 '도입 완료'로 표기하지 않음", en: "The server-termination prerequisite is never labeled as already shipped" },
    ],
  },
  {
    id: "on-device-translation",
    status: "configured",
    title: { ko: "기기 안 기계번역으로 검색 잇기", en: "Connecting search with on-device machine translation" },
    summary: {
      ko: "한글 질의를 자체 호스팅한 번역 모델로 기기 안에서 바꾸고, 실패해도 검색이 막히지 않는 사다리에 얹습니다.",
      en: "Translate Korean queries on-device with a self-hosted model, placed on a ladder whose failure never blocks search.",
    },
    outcome: {
      ko: "외부 번역 API 없이 한글 질의가 영문 인덱스에 닿고, 모델 배포 전에는 종전 동작이 그대로 유지됩니다.",
      en: "Korean queries reach the English index with no external translation API, and pre-deployment behavior stays identical to the previous release.",
    },
    steps: [
      { ko: "번역 층을 사전 → 모델 → 부분 사전 → 원문 사다리의 한 칸으로 넣고 각 칸의 실패를 격리합니다.", en: "Place translation as one rung of a dictionary → model → partial dictionary → original ladder and isolate each rung's failure." },
      { ko: "런타임 환경에서 모델 경로를 자체 호스팅으로 고정하고 원격 다운로드를 코드로 차단합니다.", en: "Pin the runtime's model path to self-hosting and block remote downloads in code." },
      { ko: "진행률 콜백을 구독 API로 노출해 안내 UI가 파일별 진행과 용량 고지를 보여주게 합니다.", en: "Expose the progress callback through a subscription API so the notice UI can show per-file progress and the size disclosure." },
      { ko: "모델 파일 목록과 배치 경로를 배포 절차로 분리하고, 배치 전에는 모델 층이 null로 귀결되게 합니다.", en: "Separate the model file list and placement path into the deploy procedure, with the model rung resolving to null before placement." },
      { ko: "영문 입력이 모델을 거치지 않는지, 모델 실패 시 사전과 원문으로 떨어지는지 테스트로 고정합니다.", en: "Pin with tests that English input skips the model and that model failure falls back to dictionary and original text." },
    ],
    checklist: [
      { ko: "모델 경로·원격 다운로드 차단이 코드에 고정됨", en: "Model path and remote-download blocking are pinned in code" },
      { ko: "받기 전에 모델 용량 고지가 표시됨", en: "The model size is disclosed before download" },
      { ko: "모델 파일이 저장소에 커밋되지 않음", en: "Model files are not committed to the repository" },
      { ko: "번역 실패가 검색 실패로 표시되지 않음", en: "Translation failure is never surfaced as search failure" },
    ],
  },
  {
    id: "content-addressing",
    status: "live",
    title: { ko: "콘텐츠 주소 도구 붙이기", en: "Adding a content-addressing tool" },
    summary: {
      ko: "파일의 CID를 만들고 trustless 게이트웨이에서 검증하며 가져오는 도구를, 제공 역할 없이 무결성 표면부터 붙입니다.",
      en: "Attach a tool that mints file CIDs and fetches them verified from trustless gateways, starting at the integrity surface with no provider role.",
    },
    outcome: {
      ko: "공유 링크가 곧 무결성 검사가 되고, 브라우저가 할 수 없는 일은 처음부터 약속하지 않습니다.",
      en: "Share links double as integrity checks, and what the browser cannot do is never promised in the first place.",
    },
    steps: [
      { ko: "지원 코덱과 해시 범위를 코드에 명시하고, 범위 밖 코덱은 구분된 답으로 돌려줍니다.", en: "Declare the supported codec and hash scope in code, and answer out-of-scope codecs distinctly." },
      { ko: "CID 생성·파싱은 공개 테스트 벡터로 먼저 고정하고 구현을 맞춥니다.", en: "Pin CID creation and parsing against public test vectors first, then match the implementation." },
      { ko: "가져오기는 trustless 게이트웨이 규격으로 받고, 받은 바이트를 CID와 대조한 뒤에만 성공으로 칩니다.", en: "Fetch through the trustless gateway spec and count success only after the received bytes match the CID." },
      { ko: "무거운 검증 라이브러리는 사용 시점에만 지연 로드해 초기 번들과 분리합니다.", en: "Lazy-load the heavy verification library at use time, keeping it out of the initial bundle." },
      { ko: "패널은 로딩·오류·빈 상태를 구분하고, 제공 기능이 없다는 경계를 문구에 그대로 적습니다.", en: "The panel separates loading, error and empty states, and its copy states the no-providing boundary as-is." },
    ],
    checklist: [
      { ko: "공개 CID 벡터와 구현 결과가 일치", en: "Public CID vectors match implementation output" },
      { ko: "범위 밖 코덱이 조용히 성공으로 처리되지 않음", en: "Out-of-scope codecs never silently succeed" },
      { ko: "UI 문구가 브라우저의 네트워크 제공을 약속하지 않음", en: "UI copy does not promise browser network providing" },
      { ko: "제품 데이터의 정본 저장소가 콘텐츠 주소로 바뀌지 않음", en: "The canonical store for product data is not replaced by content addressing" },
    ],
  },
  {
    id: "nextgen-web-experiments",
    status: "experimental",
    title: { ko: "실험 웹 기능 도입 절차", en: "Rolling out experimental web features" },
    summary: {
      ko: "감지 레지스트리 등록, 실험 토글과 표지, 지원 여부 공개를 한 묶음으로 만들어 실험 API를 화면에 붙입니다.",
      en: "Attach experimental APIs as one bundle: registry entry, lab toggle and label, and published per-device support.",
    },
    outcome: {
      ko: "새 API가 주는 이득은 지원 환경에서 바로 쓰이고, 문제 있는 실험은 사용자가 직접 끌 수 있습니다.",
      en: "New API gains are usable immediately on supporting devices, and a misbehaving experiment can be switched off by the user.",
    },
    steps: [
      { ko: "API를 감지 레지스트리에 등록합니다. 감지는 던지지 않고 미지원은 false로만 답합니다.", en: "Register the API in the detection registry; detection never throws and unsupported answers false." },
      { ko: "실험 토글의 기본값과 이유를 정하고, 설정의 실험 섹션에 지원 여부와 함께 노출합니다.", en: "Decide the lab toggle's default and rationale, and expose it in the settings experiment section alongside support state." },
      { ko: "표면에는 실험 표지를 달고, 미지원 환경에서는 기능이 조용히 없게 합니다(가짜 폴백 금지).", en: "Label the surface as experimental, and let the feature be quietly absent on unsupported devices—no fake fallbacks." },
      { ko: "실제 소비 지점(품질 적응 같은)은 신호를 읽는 seam만 열고, 소비 배선은 그 표면의 소관으로 남깁니다.", en: "For real consumption points such as quality adaptation, open only a seam that reads the signal and leave consumption wiring to the owning surface." },
      { ko: "켜지 않는 API도 판정과 재검토 조건을 기록해 다음 검토가 이어지게 합니다.", en: "Record a verdict and revisit conditions even for APIs that stay off, so the next review continues from there." },
    ],
    checklist: [
      { ko: "감지가 레지스트리 한곳에만 있고 화면별 중복 감지가 없음", en: "Detection lives only in the registry, with no per-screen duplicates" },
      { ko: "모든 실험에 끄는 토글과 실험 표지가 있음", en: "Every experiment has an off toggle and an experiment label" },
      { ko: "미지원이 오류 상태로 표시되지 않음", en: "Unsupported is never rendered as an error state" },
      { ko: "기존 제품 표면의 폴백 원칙을 실험이 침범하지 않음", en: "Experiments do not intrude on established fallback principles of product surfaces" },
    ],
  },
] as const satisfies readonly EngineeringGuide[];
