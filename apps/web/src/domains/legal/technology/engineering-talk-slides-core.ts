import { sourcedTable, statusCell, t, type TalkTableSources } from "./engineering-talk-kit";
import type { TalkSlide } from "./engineering-talk-types";

/**
 * 세미나 발표 핵심 기술 구간(10장, 625초): 드로잉 → 로컬 우선 저장 → 끌어 놓기 → 협업 → 가상 스튜디오 → WebRTC → 3D → AI → 웹의 한계 → 차세대 웹.
 *
 * - 기술마다 도감 카드의 도식·코드를 그대로 보여 주고(`atlas`), 슬라이드는 카드에 없는 "오늘의 정직한 한 줄"과 수치만 더한다.
 * - 슬라이드의 수치는 `facts`에 라벨과 함께 두고, 콘텐츠 테스트가 소스 값과 대조한다. 화면에 보이는 `points`가 같은 수치를 쓴다.
 * - 표의 "한계 / 기능" 열은 도감 카드(`web-platform`)에서 옮겼고, 상태 칸은 카드의 상태와 같아야 한다.
 */

/* ── 웹의 한계를 넘는 기술 ─────────────────────────────────────────────────── */

const WEB_LIMITS = sourcedTable(
  [t("웹의 한계", "A web limit"), t("우리 해법", "How we get past it"), t("상태", "Status")],
  [
    [
      "cross-origin-isolation-studio-gate",
      t("공유 메모리는 기본으로 막혀 있음", "Shared memory is blocked by default"),
      t("/studio 문서에만 COOP·COEP 격리를 걸어 허용 — 실패해도 편집기는 열림", "Isolation (COOP/COEP) only on /studio documents — the editor still opens if it fails"),
      statusCell("live"),
    ],
    [
      "wasm-self-built-fixed-simd",
      t("자바스크립트만으론 무거운 계산이 느림", "JavaScript alone is slow for heavy math"),
      t("커밋된 WASM 8개 중 7개 직접 빌드, 그중 6개 레인은 SIMD128 — 속도 향상은 아직 미측정", "7 of 8 committed WASM binaries built in-house, 6 lanes on SIMD128 — speed-up not yet measured"),
      statusCell("live"),
    ],
    [
      "webgpu-tier-budget-recovery",
      t("기기마다 GPU가 제각각", "GPUs differ on every device"),
      t("브라우저 이름이 아닌 한도로 등급을 매기고, 장치가 끊기면 같은 GPU로 복구 시도", "Tiers come from reported limits, not browser names; a lost device is recovered on the same GPU"),
      statusCell("live"),
    ],
    [
      "worker-envelope-64-workers",
      t("무거운 일이 화면(메인 스레드)을 멈춤", "Heavy work freezes the main thread"),
      t("워커 64개 대부분이 공통 봉투 규약을 따름(일부는 미연결) — 요청 번호·취소·소유권 이전·제한 시간", "Most of the 64 Workers follow one envelope contract (a few are not wired) — request id, cancel, ownership transfer, time limit"),
      statusCell("live"),
    ],
    [
      "autosave-crash-recovery-journal",
      t("브라우저 저장소는 사라질 수 있음", "Browser storage can disappear"),
      t("OPFS에 A/B 슬롯 저널로 자동 저장 — 백업은 내보내기·개인 클라우드", "Autosave to OPFS with an A/B slot journal — backups via export and personal cloud"),
      statusCell("live"),
    ],
    [
      "wasm-memory64-zip-crc",
      t("WebAssembly 메모리는 4GiB가 벽", "WebAssembly memory hits a 4 GiB wall"),
      t("Memory64는 1MiB 이상 ZIP 항목의 CRC32 검산에만 실제 사용", "Memory64 is used for real only for CRC32 checks of ZIP entries of 1 MiB or more"),
      statusCell("live"),
    ],
    [
      "webcodecs-selected-pipeline",
      t("영상 내보내기가 재생 시간만큼 걸림", "Video export takes as long as playback"),
      t("WebCodecs로 프레임을 직접 인코딩 — 모션 웹툰 내보내기에서만, 타임랩스 등은 MediaRecorder", "WebCodecs encodes frames directly — only in motion-webtoon export; timelapse and others still use MediaRecorder"),
      statusCell("live"),
    ],
    [
      "large-asset-delivery-r2-range",
      t("정적 호스팅은 파일당 25 MiB 한계", "Static hosting caps each file at 25 MiB"),
      t("큰 파일 6개 경로는 Worker가 R2 원본·압축 사본으로 내려줌", "6 large-file paths are served by a Worker from R2 originals and compressed copies"),
      statusCell("live"),
    ],
  ],
);

/* ── 차세대 웹: 어디까지 왔나(정직한 상태) ──────────────────────────────────── */

const NEXTGEN_WEB = sourcedTable(
  [t("차세대 웹 기능", "Next-gen web feature"), t("지금 어디까지", "Where it stands"), t("상태", "Status")],
  [
    [
      "capability-detection-registry-27",
      t("능력 감지 27종", "27 capability detectors"),
      t("한 모듈에서 감지해 설정에 표지 — 끌 수 있는 것은 3개, 대부분은 표시용 후보", "Detected in one module and marked in settings — 3 can be switched off, most are display-only candidates"),
      statusCell("experimental"),
    ],
    [
      "webgpu-explicit-engine",
      t("WebGPU (3D 엔진)", "WebGPU (3D engine)"),
      t("WebGL2와 둘 중 사용자가 고름 — VRM 캐릭터·WebXR·인앱 브라우저에서는 사용 불가로 표시", "Chosen against WebGL2 by the user — marked unavailable for VRM characters, WebXR and in-app browsers"),
      statusCell("live"),
    ],
    [
      "view-transitions-modern-css",
      t("View Transitions", "View Transitions"),
      t("작품 상세 → 리더 한 곳에만 — 미지원이거나 동작 줄이기면 즉시 이동", "Only for detail → reader — instant navigation if unsupported or motion is reduced"),
      statusCell("live"),
    ],
    [
      "webxr-spatial-webtoon",
      t("WebXR · 공간 웹툰", "WebXR · spatial webtoons"),
      t("헤드셋이 없으면 2D로, 있으면 AR·VR — 실기기 검증은 아직", "Reads in 2D without a headset, AR/VR with one — no real-device verification yet"),
      statusCell("experimental"),
    ],
    [
      "webtransport-experiment",
      t("WebTransport", "WebTransport"),
      t("클라이언트 소켓과 테스트까지 — 서버 종단과 켜는 배선이 없어 꺼져 있음", "Client socket and tests only — no server endpoint or switch, so it stays off"),
      statusCell("experimental"),
    ],
    [
      "capability-detection-registry-27",
      t("Compute Pressure", "Compute Pressure"),
      t("설정 화면에 표시까지만 — 쓰는 곳은 아직 없음", "Shown in settings only — nothing consumes it yet"),
      statusCell("experimental"),
    ],
    [
      "implemented-not-wired-modules",
      t("SAB 포인터 링 버퍼 · Memory64 코디네이터", "SAB pointer ring buffer · Memory64 coordinator"),
      t("구현과 테스트만 있고 제품 호출처가 없음 — 연결 대기", "Implemented and tested but not called by the product — awaiting wiring"),
      statusCell("experimental"),
    ],
    [
      "speculation-rules-prerender",
      t("Speculation Rules", "Speculation Rules"),
      t("/studio 미리 렌더링 규칙을 넣었지만 보안 정책·활성화 검증 전 — 효과는 단정하지 않음", "A /studio prerender rule is injected, but CSP and activation are unverified — no claim about the effect"),
      statusCell("experimental"),
    ],
  ],
);

export const CORE_TABLE_SOURCES = {
  "talk-web-limits": { kind: "atlas", cardIds: WEB_LIMITS.sourceIds },
  "talk-nextgen-web": { kind: "atlas", cardIds: NEXTGEN_WEB.sourceIds },
} as const satisfies TalkTableSources;

export const CORE_SLIDES = [
  {
    id: "talk-drawing",
    section: "core",
    layout: "atlas",
    eyebrow: t("04 · 드로잉 캔버스·브러시", "04 · CANVAS AND BRUSH ENGINE"),
    title: t("손의 움직임이 문서의 획이 되기까지", "From a hand movement to a document stroke"),
    lead: t(
      "펜이 지나간 점은 저장하고, 브라우저가 짐작한 점은 화면에만 씁니다.",
      "Points the pen touched are saved; points the browser guessed only appear on screen.",
    ),
    points: [
      t("하드웨어 샘플(압력·기울기)만 문서에 저장하고, 예측한 점은 미리보기 전용", "Only hardware samples (pressure, tilt) are saved; predicted points are preview-only"),
      t("묶여 온 이벤트의 앞부분 중복은 KMP로 걸러냄(직전 128개 비교)", "Duplicates in coalesced events are filtered with KMP (last 128 samples compared)"),
      t("그릴 표면은 pointer-down에서 한 번 정하고 끝까지 유지", "The drawing surface is chosen once at pointer-down and kept to the end"),
      t("고급 자연 재료(Hokusai)는 기기 편차가 있어 실험 상태로 단계적 출시", "Advanced natural media (Hokusai) vary by device and roll out gradually as experimental"),
    ],
    atlas: { id: "pointer-input-contract", view: "diagram" },
    notes: t(
      "같은 손 움직임도 연필·펜·수채화는 달라야 해서 입력을 바로 픽셀로 칠하지 않습니다.\n브라우저가 묶어 준 펜 위치를 풀어 하드웨어가 준 점만 문서에 저장하고, 짐작한 점은 화면에만 씁니다. 택배 상자의 실제 물건만 쓰고 예고장은 문 앞에 잠깐 붙여 두는 셈이며, 중복 비교 창은 직전 128개입니다.\n고급 자연 재료는 아직 실험입니다. 근거는 studio-pointer-input.ts입니다. 다음은 저장입니다. 질문이 나오면 ‘Stroke surface route’ 카드를 엽니다.",
      "The same hand movement must feel different for pencil, pen and watercolor, so input is never painted straight to pixels.\nWe unpack the pen positions the browser batches, save only the points the hardware reported and use guessed points only for the on-screen preview. It is like using the real goods from the parcel while the delivery notice is only taped to the door; the duplicate-filter window is the last 128 samples.\nAdvanced natural media are still experimental. The basis is studio-pointer-input.ts. Next, storage. If asked, open the ‘Stroke surface route’ card.",
    ),
    chapterId: "brush-engine",
    evidence: [
      "apps/web/src/domains/creator/canvas/studio-pointer-input.ts",
      "apps/web/src/domains/creator/brush/studio-stroke-surface-route.ts",
      "scripts/verify-studio-brush-latency.mts",
      "scripts/verify-studio-gpu-committed-parity.mts",
    ],
    relatedAtlasIds: ["stroke-surface-route-pointerdown", "stroke-smoothing-one-euro", "renderer-role-ledger", "drawing-quality-gates"],
    seconds: 70,
  },
  {
    id: "talk-local-first",
    section: "core",
    layout: "atlas",
    eyebrow: t("04 · 로컬 우선 저장", "04 · LOCAL-FIRST STORAGE"),
    title: t("서버가 잠들어도 작품은 기기에 남습니다", "The work stays on the device even when the server sleeps"),
    lead: t(
      "새 내용은 쉬는 칸에 먼저 쓰고, 마지막에 ‘여기가 최신’ 표지만 바꿉니다.",
      "New content goes to the idle slot first; only the ‘latest’ marker flips at the end.",
    ),
    points: [
      t("편집이 멈춘 1.5초 뒤 기기 안 파일(OPFS)에 기록하고, 복구는 CRC가 맞는 가장 큰 세대를 고름", "Saved to an on-device file (OPFS) 1.5 s after editing stops; recovery picks the highest generation with a valid CRC"),
      t("OPFS가 안 되면 SQLite, 둘 다 안 되면 ‘메모리뿐’이라고 알림", "If OPFS fails, SQLite; if both fail, the app says ‘memory only’"),
      t("이 기기 안의 안전망일 뿐 백업이 아님 — 내보내기·개인 클라우드를 안내", "A safety net on this device, not a backup — export and personal cloud are recommended"),
    ],
    atlas: { id: "autosave-crash-recovery-journal", view: "code", sample: 0 },
    notes: t(
      "정전 때 집 전체는 못 밝혀도 랜턴 하나는 켜야 합니다. 서버가 잠들어도 준비된 범위의 그리기는 계속됩니다.\n비결이 이 코드입니다. 새 내용을 쉬는 칸에 먼저 쓰고 마지막에 ‘여기가 최신’ 표지만 바꾸니, 어느 순간 끊겨도 직전 상태가 온전합니다. 편집이 멈춘 1.5초 뒤 저장하며 근거는 studio-opfs-recovery-journal.ts입니다.\n이 저널은 백업이 아닙니다. 다음은 끌어 놓기입니다. 질문이 나오면 ‘SQLite WASM’ 카드를 엽니다.",
      "In a blackout you cannot light the whole house, but you should be able to light one lantern: when the server sleeps, drawing within the prepared scope continues.\nThe secret is this code. New content goes to the idle slot first and only the ‘latest’ marker flips at the end, so a cut at any moment leaves the previous state intact. It saves 1.5 seconds after editing stops; the basis is studio-opfs-recovery-journal.ts.\nThis journal is not a backup. Next, drag and drop. If asked, open the ‘SQLite WASM’ card.",
    ),
    chapterId: "browser-local-compute",
    evidence: [
      "apps/web/src/domains/creator/studio-opfs-filesystem.ts",
      "apps/web/src/domains/creator/studio-opfs-recovery-journal.ts",
      "apps/web/src/domains/creator/studio-autosave-opfs-session.ts",
      "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx",
      "apps/web/src/domains/creator/studio-local-database.worker.ts",
    ],
    relatedAtlasIds: ["sqlite-wasm-opfs-sah-pool", "web-locks-broadcastchannel-single-author", "service-worker-app-shell-policy", "storage-persistence-quota-safe-mode"],
    seconds: 65,
  },
  {
    id: "talk-dnd",
    section: "core",
    layout: "atlas",
    eyebrow: t("04 · 끌어 놓기", "04 · DRAG AND DROP"),
    title: t("끌기는 세 가지 길, 라이브러리는 0개", "Three ways to drag, zero libraries"),
    lead: t(
      "일에 따라 브라우저 표준·포인터 이벤트·엔진 내장 기능을 고르고, 끌지 않는 경로를 짝으로 둡니다.",
      "Pick the browser standard, Pointer Events or an engine's built-ins per job, and always pair a non-drag path.",
    ),
    points: [
      t("바깥 파일·단순 목록은 HTML5 끌어 놓기 — 시작할 때와 놓을 때 두 번 검증", "Outside files and simple lists use HTML5 drag and drop, validated at start and again at drop"),
      t("칸반·창·스플리터는 Pointer Events로 직접 구현", "Kanban, floating panels and splitters are hand-built on Pointer Events"),
      t("캔버스·3D 안의 물체는 Konva·three.js 내장 기능", "Objects inside the canvas and 3D use Konva and three.js built-ins"),
      t("공통 계약: 미리보기 · 한 번만 확정 · Esc 취소 · 키보드·클릭 대안 경로", "Shared contract: preview, one commit, Esc to cancel, keyboard or click alternatives"),
    ],
    atlas: { id: "dnd-implementation-choice", view: "diagram" },
    notes: t(
      "끌기는 일에 따라 세 방식을 씁니다. 바깥 파일과 단순 목록은 브라우저 표준, 칸반·창은 포인터 이벤트, 캔버스와 3D 안의 물체는 엔진 기능입니다. 택배 창구·손수레·컨베이어와 같습니다.\n끌어 놓기 라이브러리는 package.json에서 0개입니다. 다음은 협업입니다. 질문이 나오면 ‘HTML Drag and Drop’ 카드를 엽니다.",
      "Dragging uses three approaches by job: the browser standard for outside files and simple lists, Pointer Events for kanban and panels, and engine built-ins for objects in the canvas and 3D. Think of a parcel counter, a handcart and a conveyor.\nThere are zero drag-and-drop libraries in package.json. Next, collaboration. If asked, open the ‘HTML Drag and Drop’ card.",
    ),
    chapterId: "architecture",
    evidence: [
      "apps/web/src/domains/creator/StudioInsertHubDirectDragBoundary.tsx",
      "apps/web/src/domains/creator/production-hub/board/use-board-dnd.ts",
      "apps/web/src/domains/creator/page/studio-page-strip-dnd.ts",
      "package.json",
    ],
    relatedAtlasIds: ["html5-dnd-insert-hub-canvas", "file-drop-import-safety", "layer-panel-reorder-dnd", "keyboard-alternatives-for-drag"],
    seconds: 45,
  },
  {
    id: "talk-collaboration",
    section: "core",
    layout: "atlas",
    eyebrow: t("04 · 실시간 협업", "04 · REALTIME COLLABORATION"),
    title: t("CRDT에는 편집의 의미를, 서버에는 권한을", "Edit meaning in the CRDT, permissions on the server"),
    lead: t(
      "Yjs가 레이어·획 편집을 같은 결과로 모으고, 서버가 권한·속도·불변식을 먼저 검사합니다.",
      "Yjs converges layer and stroke edits; the server checks permissions, rate and invariants first.",
    ),
    points: [
      t("CRDT는 권한을 모릅니다 — 서버 문지기를 통과한 변경만 저장·전달", "A CRDT knows nothing about permissions; only changes that pass the server gate are stored and relayed"),
      t("PSD·GLB 같은 큰 파일은 CRDT 밖: 해시와 영수증으로 참조", "Large files such as PSD or GLB stay outside the CRDT, referenced by hash and receipt"),
      t("서버 방: 연결 64 · 재개 요청 창 10초 · 놓친 이벤트 15분/2,048건 재생 (설정값, 부하 시험 아님)", "Server room: 64 connections, a 10 s resume-request window, missed events replayed for 15 min up to 2,048 (settings, not load tests)"),
      t("상태는 실험 — 스키마 마이그레이션과 스냅샷 압축은 운영 과제", "Status: experimental — schema migration and snapshot compaction remain operational work"),
    ],
    facts: [
      { value: "64", label: t("방당 최대 연결(Durable Objects 설정값)", "Max connections per room (Durable Objects config)") },
      { value: "10s", label: t("재개 요청 측정 창(설정값)", "Resume-request measuring window (config)") },
      { value: t("15분 · 2,048건", "15 min · 2,048 events"), label: t("놓친 이벤트 재생 보존(설정값)", "Missed-event replay retention (config)") },
    ],
    atlas: { id: "yjs-crdt-document", view: "diagram" },
    notes: t(
      "‘여럿이 같이 그리면 충돌 안 나나요?’ 같은 벽에 포스트잇을 붙이는 일과 같습니다. 순서가 달라도 같은 벽이 되지만, 붙일 자격은 경비실인 서버가 먼저 확인합니다.\n서버 방의 연결 64개, 재개 요청 창 10초, 놓친 이벤트 15분·2,048건은 설정 파일의 값이지 부하 시험 결과가 아닙니다. 상태는 실험이고 근거는 wrangler.jsonc입니다. 다음은 그 위에 얹은 공간입니다. 질문이 나오면 ‘Socket.IO’ 카드를 엽니다.",
      "‘Doesn't co-drawing cause conflicts?’ It is like everyone sticking notes on one wall: in any order you end up with the same wall, but the guard room, our server, checks who may stick first.\nThe 64 connections per server room, the 10-second resume-request window and the 15 minutes or 2,048 events of replay are configuration values, not load-test results. Status is experimental and the basis is wrangler.jsonc. Next, the space built on top. If asked, open the ‘Socket.IO’ card.",
    ),
    chapterId: "collaborative-crdt-boundary",
    evidence: [
      "apps/web/src/domains/creator/live/studio-crdt-document.ts",
      "apps/web/src/domains/creator/live/studio-live-socket-connection-factory.ts",
      "deploy/cloudflare-realtime/wrangler.jsonc",
      "deploy/cloudflare-realtime/src/room.ts",
    ],
    relatedAtlasIds: ["socket-io-room-tickets", "crdt-lock-revision", "durable-objects-realtime"],
    seconds: 65,
  },
  {
    id: "talk-virtual-studio",
    section: "core",
    layout: "atlas",
    eyebrow: t("04 · 가상 스튜디오", "04 · VIRTUAL STUDIO"),
    title: t("걸어가서 말을 거는 협업 공간", "A collaboration space you walk up to"),
    lead: t(
      "공간은 안내판일 뿐, 진실은 서버가 갖고 브라우저는 그 사본을 그립니다.",
      "The space is a signpost; the server holds the truth and the browser draws a copy.",
    ),
    points: [
      t("근접 영상은 동의한 사람끼리 168px 안에서 연결, 216px 밖에서 해제", "Proximity video links consenting people within 168 px and drops beyond 216 px"),
      t("정원은 숫자 하나가 아닌 사다리 — DO 방 64 · 소셜 피어 23 · 데이터 메시 8 · 허들 3", "Capacity is a ladder, not one number — DO room 64, social peers 23, data mesh 8, huddle 3"),
      t("인사 160/220px 규칙은 코드·테스트만 있는 설계 기준 — 화면에는 아직 연결 전", "The 160/220 px greeting rule exists only in code and tests as a design baseline — not wired to the screen yet"),
      t("Phaser는 라우트 지연 로딩 + 동적 import이나 정적 import 1건이 남아 별도 청크 분리는 단정 못 함", "Phaser loads via a lazy route and a dynamic import, but one static import remains, so a separate chunk is unproven"),
    ],
    facts: [
      { value: "168 / 216px", label: t("근접 영상 연결 / 해제 반경(동의 후)", "Proximity video link / drop radius (after consent)") },
      { value: "120 / 156px", label: t("근처 대화 입장 / 퇴장 반경", "Nearby conversation enter / exit radius") },
      { value: "200px", label: t("근처 채팅이 닿는 거리", "Reach of nearby chat") },
    ],
    stack: ["Phaser 3", "Tiled", "WebRTC", "Zod", "NestJS"],
    atlas: { id: "virtual-studio-architecture-overview", view: "diagram" },
    notes: t(
      "공간은 로비의 안내판입니다. 길만 알려 주고, 문은 출입증(서버 권한)이 엽니다.\n화면에 연결된 값은 영상 168/216px, 근처 대화 120/156px, 채팅 200px입니다. 인사 160/220px는 코드와 테스트뿐인 설계 기준이라 현재 동작으로 말하지 않습니다. 정원은 DO 방 64 · 소셜 피어 23 · 데이터 메시 8 · 허들 3의 사다리입니다. 근거는 space-proximity-media.ts입니다. 다음은 WebRTC입니다. 질문이 나오면 ‘Proximity video’ 카드를 엽니다.",
      "The space is a lobby signpost: it shows the way, and a badge (server permission) opens the door.\nThe values wired to the screen are video 168/216 px, nearby conversation 120/156 px and chat 200 px. The 160/220 px greeting rule exists only in code and tests as a design baseline, so it is not described as current behavior. Capacity is a ladder: DO room 64, social peers 23, data mesh 8, huddle 3. The basis is space-proximity-media.ts. Next, WebRTC. If asked, open the ‘Proximity video’ card.",
    ),
    chapterId: "virtual-studio-world-authority",
    evidence: [
      "apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx",
      "apps/web/src/domains/creator/virtual-space/studio-virtual-space-sprite-crossfade-runtime.ts",
      "apps/web/src/domains/creator/virtual-space/hud/space-proximity-media.ts",
      "apps/web/src/domains/creator/virtual-space/studio-virtual-space-page-helpers.ts",
      "apps/web/src/domains/creator/virtual-space/studio-virtual-space-chat.ts",
      "apps/web/src/domains/creator/virtual-space/studio-virtual-space-social.ts",
      "apps/web/src/app/routes/groups/creator-route-pages.ts",
    ],
    relatedAtlasIds: ["proximity-video-capacity-chain", "phaser-lazy-scene-lifecycle", "proximity-hysteresis-160-220", "space-is-not-permission"],
    seconds: 65,
  },
  {
    id: "talk-webrtc",
    section: "core",
    layout: "atlas",
    eyebrow: t("04 · WebRTC", "04 · WEBRTC"),
    title: t("서버는 첫 만남만 소개하고, 통화는 브라우저끼리", "The server only introduces; the call is browser to browser"),
    lead: t(
      "시그널링을 세 겹으로 나눠, 통화 설정과 채팅이 서버를 지나지 않게 했습니다.",
      "Signaling is split in three layers so call setup and chat never pass through the server.",
    ),
    points: [
      t("서버 경로는 입장·접속 상태·화면 공유 신호와, 직통 통로를 여는 첫 offer/answer만", "The server path carries only admission, presence, screen-share signals and the first offer/answer that opens a direct channel"),
      t("통화 SDP/ICE와 채팅은 직통 레인(studio-direct-v1)으로만 — 막혀도 서버로 되돌아가지 않음", "Call SDP/ICE and chat travel only on the direct lane (studio-direct-v1) and never fall back to the server"),
      t("허들 음성·영상은 원격 3명까지 — 서버 음성 릴레이는 꺼져 있음(STUDIO_LIVE_VOICE_ENABLED=false)", "Huddle voice and video allow 3 remote peers — the server voice relay is off (STUDIO_LIVE_VOICE_ENABLED=false)"),
      t("검증은 단위 테스트와 로컬 Chromium 2개까지 — 다른 네트워크(WAN)·제한 NAT·실기기는 아직", "Verified by unit tests and two local Chromium contexts — other networks (WAN), restrictive NATs and real devices are still open"),
    ],
    facts: [
      { value: "3", label: t("허들 원격 참가자 상한(음성·영상)", "Huddle remote peer limit (voice and video)") },
      { value: "8", label: t("직통 데이터 메시 원격 상한", "Direct data-mesh remote peer limit") },
      { value: "23", label: t("가상 스튜디오 소셜 피어 상한", "Virtual studio social peer limit") },
      { value: "64", label: t("Durable Objects 방당 연결 상한", "Durable Objects connections per room limit") },
    ],
    atlas: { id: "webrtc-three-plane-signaling", view: "diagram" },
    notes: t(
      "통화는 서로 직접 하지만 연결 전에 쪽지를 건넬 안내 데스크가 필요하고, 그것이 시그널링입니다. ‘Socket.IO가 시그널링’이라고 하면 부정확합니다.\n서버를 지나는 것은 입장·접속 상태·화면 공유 신호와 직통 통로를 여는 첫 신호뿐이고, 통화 설정과 채팅은 studio-direct-v1 직접 레인으로만 갑니다. 서버 음성 릴레이는 render.yaml에서 꺼져 있고, 허들은 원격 3명까지입니다. 다음은 3D입니다. 질문이 나오면 ‘Full mesh’ 카드를 엽니다.",
      "A call is direct, but an information desk must pass notes before it starts, and that is signaling. Saying ‘Socket.IO is the signaling’ would be inaccurate.\nOnly admission, presence, screen-share signals and the first signal that opens a direct channel pass the server; call setup and chat travel only on the studio-direct-v1 lane. The server voice relay is off in render.yaml, and huddles allow 3 remote peers. Next, 3D. If asked, open the ‘Full mesh’ card.",
    ),
    chapterId: "webrtc-media-authority",
    evidence: [
      "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts",
      "apps/web/src/domains/creator/live/studio-live-p2p-overlay-transport.ts",
      "apps/web/src/domains/creator/live/studio-live-direct-port.ts",
      "deploy/cloudflare-realtime/wrangler.jsonc",
      "render.yaml",
      "docs/studio-p2p-huddle.md",
    ],
    relatedAtlasIds: ["webrtc-mesh-limits", "webrtc-datachannel-direct-lane", "webrtc-ice-turn-paths", "screen-share-signaling"],
    seconds: 70,
  },
  {
    id: "talk-3d",
    section: "core",
    layout: "atlas",
    eyebrow: t("04 · 3D 캐릭터", "04 · 3D CHARACTERS"),
    title: t("3D 엔진은 폴백이 아니라 ‘선택’입니다", "The 3D engine is a choice, not a fallback"),
    lead: t(
      "3D는 보여주기가 아니라 그리기 위한 밑그림이라서, 어느 엔진으로 그리는지 숨기지 않습니다.",
      "3D is underdrawing material, not decoration, so which engine draws is never hidden.",
    ),
    points: [
      t("WebGPU와 WebGL2 중 사용자가 고르고, 막히면 상태와 사유만 바꾸며 자동 전환은 없음", "The user picks WebGPU or WebGL2; if blocked, only the status and reason change — there is no automatic switch"),
      t("같은 VRM 캐릭터도 두 엔진에서 색이 최대 169/255 달랐음(번들 VRM 1개 실측)", "The same VRM character differed by up to 169/255 in color between engines (one bundled VRM, measured)"),
      t("VRM 표준 뼈대 하나를 셰이퍼·포즈 도구·웹캠 추적(MediaPipe)이 공유", "One VRM standard skeleton is shared by the shaper, posing tools and webcam tracking (MediaPipe)"),
      t("좌표계·단위·재질 변환은 왕복 검증이 필요한 실험 영역", "Coordinate, unit and material conversion is experimental and still needs round-trip validation"),
    ],
    atlas: { id: "webgpu-explicit-engine", view: "diagram" },
    notes: t(
      "3D는 보여주려는 게 아니라 그리려고 넣었습니다. 데생 인형으로 포즈를 잡고 덧그리듯, 3D 포즈를 선화로 바꿔 그 위에 펜을 댑니다.\n엔진은 사용자가 WebGPU와 WebGL2 중 고르고 몰래 바꾸지 않습니다. 같은 캐릭터의 색이 두 엔진에서 최대 169/255 달랐기 때문이며, 번들 VRM 하나의 실측입니다. 상태는 실험입니다. 근거는 studio-bg3d-engine-selection.ts입니다. 다음은 AI입니다. 질문이 나오면 ‘VRM Humanoid’ 카드를 엽니다.",
      "Why 3D? To draw on, not to show off: like posing a mannequin and tracing over it, we turn a 3D pose into lineart and put the pen on top.\nThe user chooses between WebGPU and WebGL2 and the engine is never swapped silently, because the same character differed by up to 169/255 in color between them; that is a measurement from one bundled VRM. Status is experimental. The basis is studio-bg3d-engine-selection.ts. Next, AI. If asked, open the ‘VRM Humanoid’ card.",
    ),
    chapterId: "web-3d-engine",
    evidence: [
      "apps/web/src/domains/creator/bg3d/studio-bg3d-engine-selection.ts",
      "docs/studio-bg3d-vrm-mtoon-backend-color-divergence-2026-08-29.md",
      "apps/web/src/domains/creator/character-shaper/StudioCharacterShaper.tsx",
      "apps/web/src/domains/creator/vrm/StudioVrmPoserViewport.tsx",
      "apps/web/src/domains/creator/vrm/use-studio-vrm-webcam-session.ts",
    ],
    relatedAtlasIds: ["vrm-humanoid-rig", "three-r3f-viewport", "toon-shading-outline", "coordinate-unit-roundtrip"],
    seconds: 65,
  },
  {
    id: "talk-ai",
    section: "core",
    layout: "atlas",
    eyebrow: t("04 · AI 활용", "04 · USING AI"),
    title: t("제안은 AI가, 확정은 사람이 — 돈이 드는 길은 닫아 둡니다", "AI proposes, people decide — and paid routes stay closed"),
    lead: t(
      "무료로 확인된 길만 순서대로 열고, 호출 전에 오늘 한도를 예약하며, 애매한 실패는 다시 보내지 않습니다.",
      "Only routes verified as free open, in order; today's budget is reserved before each call, and ambiguous failures are never resent.",
    ),
    points: [
      t("브라우저는 경로마다 하루 25회 · 예약 토큰 64,000 · 출력 1,024 — 우리가 건 안전 상한(UTC 기준, 공급자 한도 아님)", "In the browser, per route: 25 calls a day, 64,000 reserved tokens, 1,024 output — our own safety caps (UTC day, not provider limits)"),
      t("시간 초과·5xx는 다른 길로 다시 보내지 않음 — 서버도 처리 여부가 모호한 작업은 재전송하지 않음", "Timeouts and 5xx are never replayed on another route — the server also refuses to resend a job whose outcome is ambiguous"),
      t("서버 공유 무료 풀은 ‘설정 필요’ — 이미지 도구는 기기 안 ONNX라 토큰을 쓰지 않음", "The server's shared free pool is ‘setup required’ — image tools run on-device with ONNX and spend no tokens"),
      t("유료 길은 내 키와 내 승인이 있어야 자동 순서에 들어옴", "A paid route joins the automatic order only with your key and your approval"),
    ],
    facts: [
      { value: "25", label: t("브라우저 무료 AI 경로당 하루 요청 상한(UTC)", "Browser free-AI daily request cap per route (UTC)") },
      { value: "64,000", label: t("경로당 하루 예약 토큰 상한", "Daily reserved-token cap per route") },
      { value: "1,024", label: t("응답 최대 출력 토큰", "Maximum output tokens per response") },
    ],
    atlas: { id: "free-first-ai-routing", view: "diagram" },
    notes: t(
      "AI는 내비게이션처럼 길을 제안할 뿐, 운전대는 사람이 잡습니다. 무료 우선은 공짜가 아니라 돈이 드는 지점을 숨기지 않는다는 뜻입니다.\n브라우저는 호출 전에 경로마다 하루 25회·예약 토큰 64,000·출력 1,024를 예약합니다. 공급자 한도가 아닌 우리의 안전 상한이고, 하루는 UTC 자정, 한국 시간 오전 9시에 바뀝니다. 시간 초과·5xx는 다시 보내지 않습니다. 근거는 free-ai-runtime-budget.ts입니다. 다음은 웹의 한계입니다. 질문이 나오면 ‘Quota ledger’ 카드를 엽니다.",
      "AI is like a navigator: it suggests the route and a person holds the wheel. Free-first does not mean free; it means the points where money is spent stay visible.\nBefore each call the browser reserves against 25 calls a day, 64,000 reserved tokens and 1,024 output tokens, per route. These are our own safety caps, not provider limits, and the day rolls over at UTC midnight, 9 a.m. Korea time. Timeouts and 5xx are never resent. The basis is free-ai-runtime-budget.ts. Next, the web's limits. If asked, open the ‘Quota ledger’ card.",
    ),
    chapterId: "free-ai-routing",
    evidence: [
      "apps/web/src/shared/ai/free-ai-policy.ts",
      "apps/web/src/shared/ai/free-ai-runtime-budget.ts",
      "apps/web/src/shared/ai/user-ai-transport.test.ts",
      "apps/api/src/modules/studio-ai/studio-ai.service.ts",
      "apps/web/src/domains/creator/studio-onnx-inference-provider.ts",
    ],
    relatedAtlasIds: ["quota-ledger-budget", "ambiguous-failure-no-retry", "onnx-runtime-web-inference", "byok-paid-approval-gate"],
    seconds: 70,
  },
  {
    id: "talk-web-limits",
    section: "core",
    layout: "table",
    eyebrow: t("04 · 웹의 한계 넘기", "04 · BEYOND THE WEB'S LIMITS"),
    title: t("브라우저가 막던 것을 하나씩 넘은 방법", "How we got past what the browser blocked"),
    lead: t(
      "한계마다 해법과 상태를 도감 카드에서 옮겼습니다. 상태는 카드의 상태 그대로입니다.",
      "Each limit, its fix and its status are transcribed from atlas cards; the status is the card's own.",
    ),
    points: [],
    table: WEB_LIMITS.table,
    notes: t(
      "표는 브라우저가 막은 것을 하나씩 넘은 방법입니다. 공유 메모리는 /studio 문서에만 격리를 걸어 풀었고, 무거운 계산은 직접 빌드한 WASM 7개와 워커 64개에 맡깁니다.\n정직하게, SIMD 속도 향상은 아직 재지 않았고 Memory64는 ZIP 검산에만 씁니다. 벽을 허무는 게 아니라 문을 하나씩 내는 일입니다. 근거는 http-response-headers.json입니다. 다음은 아직 이른 기능들입니다. 질문이 나오면 ‘Cross-Origin Isolation’ 카드를 엽니다.",
      "The table shows how we got past what the browser blocks, one limit at a time. Shared memory is unlocked by isolating only /studio documents, and heavy computation goes to 7 in-house WASM binaries and 64 Workers.\nBe honest: the SIMD speed-up has not been measured yet and Memory64 is used only for ZIP checksums. It is not tearing down a wall but cutting one door at a time. The basis is http-response-headers.json. Next, the features that are still early. If asked, open the ‘Cross-Origin Isolation’ card.",
    ),
    chapterId: "worker-architecture",
    evidence: [
      "config/http-response-headers.json",
      "apps/web/src/app/studio-cross-origin-isolation.ts",
      "apps/web/src/domains/creator/studio-capability-tier.ts",
      "apps/web/src/domains/creator/studio-crc32-worker-client.ts",
      "deploy/cloudflare-static/src/large-static-assets.ts",
    ],
    relatedAtlasIds: ["cross-origin-isolation-studio-gate", "wasm-self-built-fixed-simd", "worker-envelope-64-workers", "wasm-memory64-zip-crc"],
    seconds: 60,
  },
  {
    id: "talk-nextgen-web",
    section: "core",
    layout: "table",
    eyebrow: t("04 · 차세대 웹", "04 · THE NEXT-GEN WEB"),
    title: t("차세대 웹 기능은 어디까지 왔나", "How far the next-gen web features have come"),
    lead: t(
      "새 웹 기능은 있는지부터 묻습니다. 아래 상태가 오늘의 정직한 현재입니다.",
      "New web features are asked for before they are used. The statuses below are today's honest state.",
    ),
    points: [],
    table: NEXTGEN_WEB.table,
    notes: t(
      "새 길을 쓰기 전에 열려 있는지 표지판부터 봅니다. 차세대 웹 기능 27종을 한 모듈에서 감지하지만 끌 수 있는 것은 3개뿐입니다.\n표의 상태가 정직한 현재입니다. 구현만 있고 호출처가 없는 모듈은 연결 대기입니다. 근거는 nextgen-web-capabilities.ts입니다. 다음은 품질입니다. 질문이 나오면 ‘Capability detection’ 카드를 엽니다.",
      "Before using a new road, check the signpost to see whether it is open. 27 next-gen web features are detected in one module, but only 3 can be switched off.\nThe statuses in the table are the honest present; modules that are implemented but never called are awaiting wiring. The basis is nextgen-web-capabilities.ts. Next, quality. If asked, open the ‘Capability detection’ card.",
    ),
    chapterId: "nextgen-web-experiments",
    evidence: [
      "apps/web/src/shared/lib/nextgen-web-capabilities.ts",
      "apps/web/src/shared/lib/nextgen-lab-settings.ts",
      "apps/web/src/shared/lib/speculation-rules.ts",
    ],
    relatedAtlasIds: ["capability-detection-registry-27", "speculation-rules-prerender", "webxr-spatial-webtoon", "webtransport-experiment"],
    seconds: 50,
  },
] as const satisfies readonly TalkSlide[];
