import { t } from "./engineering-architecture-guide-kit";
import type { ArchitectureGuideSection } from "./engineering-architecture-guide-types";

/**
 * 아키텍처 해설 · 실행 구조 ③ 내 작품은 어디에 저장될까 ④ 함께 그릴 때.
 * 운영 DB 표현은 `docs/operations/canonical-database-topology.md`(2026-09-29)를 따른다:
 * 현재 쓰기 권위는 Supabase PostgreSQL 이고 Neon 은 legacy 로 보존한다.
 */

/** 3) 내 작품은 어디에 저장될까 — 원본·원장·파일·실시간 상태의 주인. */
export const DATA_AUTHORITY_SECTION: ArchitectureGuideSection = {
  id: "data-authority",
  group: "runtime",
  number: 3,
  title: t("내 작품은 어디에 저장될까", "Where does my work get saved?"),
  question: t("원본·원장·파일·실시간 상태의 주인은 누구인가?", "Who owns the sources, the ledger, the files and the live state?"),
  oneLine: t(
    "원본은 내 기기에, 여럿이 함께 믿어야 하는 기록은 서버 원장 하나에 둡니다.",
    "Sources stay on your device; records many people must trust live in one server ledger.",
  ),
  easy: t(
    "집에는 내 작업 책상(내 기기)이 있고, 동네에는 공증 사무소(서버 원장)가 있고, 큰 짐은 창고(파일 저장소)에, 회의실 칠판(실시간 상태)은 회의가 끝나면 곧 지워집니다. 물건마다 주인이 정해져 있습니다.",
    "At home there is your own desk (your device), in town a notary office (the server ledger), a warehouse for bulky items (file storage), and a meeting-room whiteboard (live state) that is wiped soon after the meeting. Every kind of item has one owner.",
  ),
  diagram: {
    id: "data-authority-diagram",
    kind: "graph",
    title: t("물건마다 정해진 주인", "One owner for each kind of data"),
    caption: t(
      "원본은 기기, 기록은 서버 원장 하나, 큰 파일은 용도별 저장소, 잠깐의 상태는 실시간 방이 맡습니다.",
      "The device owns sources, one server ledger owns records, purpose-specific storage owns large files, and realtime rooms own short-lived state.",
    ),
    alt: t(
      "내 기기가 작업 원본을 쥐고 있고, 원하면 내보내기 파일이나 개인 클라우드에 사본을 둡니다. 공유·게시를 하면 Core API 가 권한을 확인한 뒤 서버 원장(Supabase PostgreSQL)에 기록하고 큰 파일은 비공개 저장소에 둡니다. 접속 상태 같은 잠깐의 정보는 실시간 방(Durable Objects)이 맡고, 예전 Neon DB 는 legacy 로 보존만 합니다.",
      "Your device holds the working source and can place copies in export files or a personal cloud. When you share or publish, the Core API checks permissions and records it in the server ledger (Supabase PostgreSQL), while large files go to private storage. Short-lived data such as presence stays in realtime rooms (Durable Objects), and the old Neon database is only kept as a legacy copy.",
    ),
    nodes: [
      { id: "rt", label: t("실시간 방", "Realtime rooms"), sub: t("접속·커서: 잠깐만 보관", "Presence, cursors: short-lived"), tone: "edge", at: [0, 0] },
      { id: "device", label: t("내 기기", "Your device"), sub: t("원본: OPFS·SQLite", "Sources: OPFS, SQLite"), tone: "local", shape: "cylinder", at: [0, 1] },
      { id: "backup", label: t("사본 · 백업", "Copies, backups"), sub: t("내보내기 · 개인 클라우드", "Export, personal cloud"), tone: "external", shape: "cloud", at: [0, 2] },
      { id: "api", label: t("Core API", "Core API"), sub: t("인증·권한·거래", "Auth, permissions, deals"), tone: "server", at: [1, 1] },
      { id: "legacy", label: t("Neon (legacy)", "Neon (legacy)"), sub: t("보존만 · 새 쓰기 없음", "Kept only, no new writes"), tone: "external", shape: "cylinder", at: [2, 0] },
      { id: "db", label: t("서버 원장", "Server ledger"), sub: t("Supabase PostgreSQL", "Supabase PostgreSQL"), tone: "server", shape: "cylinder", at: [2, 1] },
      { id: "files", label: t("비공개 파일", "Private files"), sub: t("R2 · B2 · Supabase", "R2, B2, Supabase"), tone: "server", shape: "cylinder", at: [2, 2] },
    ],
    edges: [
      { from: "device", to: "rt", style: "dashed", label: t("임시 상태", "Live state") },
      { from: "device", to: "backup", style: "dashed", label: t("내보내기", "Export") },
      { from: "device", to: "api", label: t("공유·게시", "Publish") },
      { from: "api", to: "db", label: t("기록·조회", "Read, write") },
      { from: "api", to: "files", label: t("큰 파일", "Large files") },
      { from: "db", to: "legacy", style: "dashed", label: t("보존만", "Kept only") },
    ],
  },
  steps: [
    t("그리는 동안의 작품 원본은 내 기기(OPFS·SQLite WASM)가 쥡니다.", "While you draw, the source of the work is held by your device (OPFS and SQLite WASM)."),
    t("원하면 내보내기 파일이나 연결한 개인 클라우드에 사본을 둡니다. 이 사본이 백업입니다.", "If you wish, copies go to an export file or a connected personal cloud, and those copies are the backup."),
    t("계정·권한·게시·결제 같은 기록은 Core API 를 거쳐 서버 원장(Supabase PostgreSQL)에만 씁니다.", "Records such as accounts, permissions, publishing and payments are written through the Core API to the server ledger (Supabase PostgreSQL) only."),
    t("큰 파일은 용도별 비공개 저장소(R2·B2·Supabase)에 두고, 원장에는 그 참조를 남깁니다.", "Large files go to purpose-specific private storage (R2, B2, Supabase), and the ledger keeps a reference to them."),
    t("접속 상태·커서 같은 잠깐의 정보는 Durable Objects 가 맡고, 이벤트는 15분만 보관하도록 설정돼 있습니다.", "Short-lived information such as presence and cursors belongs to Durable Objects, configured to keep events for only 15 minutes."),
    t("예전 Neon DB 는 legacy 로 보존만 하고, 새 운영 쓰기의 권위로 되돌리지 않습니다.", "The old Neon database is only kept as legacy and is not made the write authority again."),
  ],
  background: [
    t(
      "'저장'이라고 해도 저장할 곳은 여러 곳이고 곳마다 주인이 다릅니다. 주인이 둘이면 서로 다른 값을 가졌을 때 누가 맞는지 정할 수 없습니다. 그래서 ToonStudio 는 물건마다 '쓰기 권위'를 하나만 정합니다. 작업 원본은 사용자 기기, 계정·권한·결제·게시 기록은 서버 원장, 큰 파일은 용도별 저장소, 잠깐의 실시간 상태는 Cloudflare Durable Objects 입니다.",
      "'Saving' can mean several places, each with its own owner, and when two owners hold different values nobody can say which is right. So ToonStudio gives each kind of data exactly one write authority: your device for working sources, the server ledger for accounts, permissions, payments and publishing records, purpose-specific storage for large files, and Cloudflare Durable Objects for short-lived realtime state.",
    ),
    t(
      "서버 원장은 Render 의 Core API 를 거쳐 Supabase PostgreSQL 에 씁니다. 적용한 SQL 마이그레이션은 지문(체크섬)을 박아 두어 고치면 거부됩니다. 같은 데이터를 두 DB 에 동시에 쓰는 이중 쓰기와, 무료 한도에 닿았을 때의 자동 갈아타기는 하지 않습니다. 기존 Neon DB 는 legacy 로 보존하며, 무료 DB 후보 16곳은 계획 문서일 뿐 기본은 꺼져 있습니다.",
      "The server ledger is written through the Core API on Render into Supabase PostgreSQL. Applied SQL migrations carry a checksum, so editing one is rejected. The app does not write the same data to two databases at once, and it does not switch automatically when a free limit is reached. The old Neon database is kept as legacy, and the 16 candidate free databases are only a plan that is off by default.",
    ),
    t(
      "한계도 분명합니다. 브라우저 안의 원본은 백업이 아니라서 사이트 데이터를 지우거나 기기를 잃으면 사라집니다. 서버 원장이 '권위'라는 말은 서버가 모든 작품을 가진다는 뜻이 아니라, 여러 사람이 함께 믿어야 하는 기록의 최종 판정자라는 뜻입니다. 운영 DB 의 실제 연결 상태는 이 페이지에서 직접 확인하지 못했습니다.",
      "The limits are clear too. Sources inside the browser are not a backup, so clearing site data or losing the device removes them. 'Authority' for the server ledger does not mean the server holds every work; it means the ledger is the final judge of records that many people must trust together. The live connection state of the production database was not checked directly for this page.",
    ),
  ],
  inService: [
    {
      what: t("작업 원본 (내 기기)", "Working sources (your device)"),
      role: t(
        "SQLite WASM + OPFS 가 제품 스튜디오의 기본 로컬 내구성 권위이고, 서버 저장은 따로 고르는 경로",
        "SQLite WASM plus OPFS is the studio's default local durability authority; server saving is a separate path you choose",
      ),
      paths: ["apps/web/src/domains/creator/studio-local-database.ts", "docs/architecture/studio-current-boundaries.md"],
    },
    {
      what: t("서버 원장", "Server ledger"),
      role: t(
        "Drizzle·pg 연결 풀로 하나의 PostgreSQL 에 기록하며 쓰기 권위는 하나",
        "Writes to a single PostgreSQL through Drizzle and a pg pool, with one write authority",
      ),
      paths: ["apps/api/src/platform/database/pg-connection.ts", "docs/operations/canonical-database-topology.md"],
    },
    {
      what: t("비공개 파일 저장소", "Private file storage"),
      role: t(
        "source·derived·export 용도별로 R2·B2·Supabase 를 고정 라우팅하고, 원장에는 객체 참조를 남김",
        "Routes source, derived and export files to R2, B2 or Supabase by purpose, while the ledger keeps the object reference",
      ),
      paths: [
        "apps/api/src/platform/adapters/private-object-storage/private-object-storage.config.ts",
        "apps/api/src/platform/database/creator-asset-object-storage.schema.ts",
      ],
    },
    {
      what: t("임시 실시간 상태", "Short-lived realtime state"),
      role: t(
        "접속·커서·댓글 변경 신호를 방 하나에 객체 하나인 Durable Objects 가 순서대로 조정",
        "Durable Objects, one object per room, coordinate presence, cursors and comment-change signals in order",
      ),
      paths: ["deploy/cloudflare-realtime/src/room.ts", "deploy/cloudflare-realtime/wrangler.jsonc"],
    },
    {
      what: t("내보내기와 개인 클라우드", "Export and personal cloud"),
      role: t(
        ".toonstudio 패키지 저장과 Google Drive·Dropbox·OneDrive 로 사본 올리기(연결한 경우)",
        "Saving a .toonstudio package and uploading a copy to Google Drive, Dropbox or OneDrive when connected",
      ),
      paths: [
        "apps/web/src/domains/creator/save-first/studio-project-package.ts",
        "apps/web/src/domains/creator/save-first/personal-cloud-upload.ts",
      ],
    },
  ],
  decisions: [
    {
      choice: t("물건마다 쓰기 권위를 하나만 둔다", "Give each kind of data exactly one write authority"),
      because: t(
        "주인이 둘이면 누가 맞는지 정할 수 없어, 이중 쓰기와 자동 갈아타기를 두지 않습니다.",
        "With two owners nobody can say which is right, so there is no dual writing and no automatic switchover.",
      ),
      cost: t(
        "무료 DB 한도에 닿아도 자동으로 넘어가지 않아, 사람이 승인해 옮겨야 합니다.",
        "Reaching a free database limit does not trigger an automatic move; a person has to approve the migration.",
      ),
    },
    {
      choice: t("원본은 기기에, 서버는 함께 믿을 기록만", "Sources on the device, only shared records on the server"),
      because: t(
        "중앙 서버에 개인 원본을 쌓지 않아 비용과 개인정보 부담이 줄고, 오프라인에서도 열립니다.",
        "Not piling personal sources on a central server lowers cost and privacy burden, and the work opens offline.",
      ),
      cost: t(
        "기기를 잃거나 사이트 데이터를 지우면 사라지므로 내보내기·개인 클라우드 사본이 필요합니다.",
        "Losing the device or clearing site data removes it, so export files or personal-cloud copies are needed.",
      ),
    },
  ],
  pitfall: t(
    "기기 저장은 운영 경로이고, 서버 원장·파일 저장소·Durable Objects 는 설정 또는 운영 확인이 남은 상태입니다. 무료 DB 16곳은 계획이며, 오래된 문서의 Neon 서술은 legacy 보존 DB 이야기입니다.",
    "On-device saving is a live path, while the server ledger, file storage and Durable Objects still depend on configuration or production checks. The 16 free databases are a plan, and older docs describing Neon refer to a legacy preserved database.",
  ),
  facts: [
    {
      value: "16 · 21 · 36",
      label: t("무료 DB 후보 · 논리 샤드 · 라우트 수(계획, 기본 꺼짐)", "Candidate free databases, logical shards, routes (plan, off by default)"),
      source: "config/free-database-federation.json",
    },
    {
      value: "v6",
      label: t("기기 안 SQLite 스키마 버전(마이그레이션 체인)", "On-device SQLite schema version (migration chain)"),
      source: "apps/web/src/domains/creator/studio-local-database.ts",
    },
    {
      value: "15 min",
      label: t("실시간 방이 이벤트를 보관하는 시간(설정값)", "How long realtime rooms keep events (configured)"),
      source: "deploy/cloudflare-realtime/wrangler.jsonc",
    },
  ],
  status: "configured",
  atlasIds: [
    "supabase-single-writer-authority",
    "sqlite-wasm-opfs-sah-pool",
    "opfs-content-addressed-store",
    "storage-persistence-quota-safe-mode",
    "file-system-access-resave",
    "federated-free-data-plane",
  ],
  chapterIds: ["storage", "infrastructure", "cost-engineering"],
  glossaryIds: ["data-authority-ledger", "opfs", "sqlite-wasm", "indexeddb", "migration-checksum-ledger"],
};

/** 4) 함께 그릴 때 — 문서·잠금·임시 상태·직통 통화가 오가는 길. */
export const REALTIME_COLLAB_SECTION: ArchitectureGuideSection = {
  id: "realtime-collab",
  group: "runtime",
  number: 4,
  title: t("함께 그릴 때", "Drawing together"),
  question: t("여러 사람이 동시에 그릴 때 무엇이 오가나?", "What travels between people when several draw at once?"),
  oneLine: t(
    "문서 변경은 서버가 권한을 검사한 뒤 전달하고, 접속·통화 신호는 따로 흐릅니다.",
    "Document changes pass a server permission check before being delivered, while presence and call signals travel separately.",
  ),
  easy: t(
    "공동 작업실의 출입문에는 경비(서버)가 있어 입장권을 확인합니다. 칠판에 적는 변경은 경비가 규칙을 본 뒤 기록하고 모두에게 알리고, 복도의 잡담(커서·접속)과 통화 연결은 별도 통로로 오갑니다.",
    "A shared workroom has a guard (the server) at the door who checks your entry ticket. Changes written on the board are recorded and announced by the guard after checking the rules, while hallway chatter (cursors, presence) and call setup use separate channels.",
  ),
  diagram: {
    id: "realtime-collab-diagram",
    kind: "sequence",
    title: t("함께 그릴 때 오가는 것", "What flows while drawing together"),
    caption: t(
      "문서는 서버를 거쳐 검사받고, 임시 상태는 실시간 방으로, 통화는 브라우저끼리 직접 갑니다.",
      "The document goes through the server for checks, temporary state goes through realtime rooms, and calls go directly between browsers.",
    ),
    alt: t(
      "브라우저 A 가 로그인 쿠키로 60초짜리 입장권을 받아 Core API 의 Socket.IO 작업실에 들어갑니다. 그림 변경은 CRDT 업데이트로 보내면 서버가 권한과 불변식을 검사해 PostgreSQL 에 한 번 기록하고 브라우저 B 에 전달합니다. 접속 상태는 Durable Objects 가, 통화 신호는 브라우저 사이의 직통 통로가 맡습니다.",
      "Browser A turns its sign-in cookie into a 60-second entry ticket and joins the Socket.IO workroom on the Core API. Drawing changes are sent as CRDT updates, and the server checks permissions and invariants, records them once in PostgreSQL and passes them to browser B. Presence goes through Durable Objects and call signals use a direct channel between browsers.",
    ),
    actors: [
      { id: "a", label: t("브라우저 A", "Browser A"), tone: "local" },
      { id: "api", label: t("Core API", "Core API"), sub: t("Socket.IO · NestJS", "Socket.IO, NestJS"), tone: "server" },
      { id: "db", label: t("서버 원장", "Server ledger"), sub: t("PostgreSQL", "PostgreSQL"), tone: "server" },
      { id: "do", label: t("실시간 방", "Realtime room"), sub: t("Durable Objects", "Durable Objects"), tone: "edge" },
      { id: "b", label: t("브라우저 B", "Browser B"), tone: "local" },
    ],
    messages: [
      { from: "a", to: "api", label: t("입장권으로 방 입장", "Join with entry ticket"), note: t("쿠키를 60초 입장권으로 교환", "Cookie swapped for a 60 s ticket") },
      { from: "api", to: "api", label: t("멤버 권한 확인", "Check membership"), note: t("15초마다 다시 확인", "Rechecked every 15 s") },
      { from: "a", to: "api", label: t("획 묶음(CRDT) 전송", "Send stroke batch (CRDT)"), note: t("약 40ms 단위 배치", "Batches of about 40 ms") },
      { from: "api", to: "api", label: t("권한·속도·불변식 검사", "Check access, rate, invariants") },
      { from: "api", to: "db", label: t("같은 변경은 한 번만 기록", "Record each update once") },
      { from: "api", to: "b", style: "dashed", label: t("변경 전달", "Deliver the change") },
      { from: "a", to: "do", label: t("커서·접속 상태", "Cursor and presence"), note: t("준비되면 이쪽, 아니면 Socket.IO", "Here when ready, else Socket.IO") },
      { from: "do", to: "b", style: "dashed", label: t("임시 상태 전달", "Deliver live state") },
      { from: "a", to: "b", label: t("통화·채팅은 직통 통로", "Calls and chat go direct"), note: t("서버는 첫 연결 신호만 소개", "Server only introduces the link") },
    ],
  },
  steps: [
    t("작업실에 들어갈 때 로그인 쿠키를 60초짜리 입장권으로 바꿔 Socket.IO 에 건넵니다.", "To enter the workroom, your sign-in cookie is swapped for a 60-second ticket handed to Socket.IO."),
    t("서버는 입장권을 확인하는 즉시 지우고, 작품 멤버 권한을 본 뒤 방에 넣습니다(정원 30명).", "The server discards the ticket as soon as it is checked, verifies project membership and lets you into the room (up to 30 people)."),
    t("그림 변경은 의미 단위로 묶은 CRDT 업데이트로 보내고, 서버가 권한·속도·불변식을 먼저 검사합니다.", "Drawing changes go out as CRDT updates grouped by meaning, and the server first checks permission, rate and invariants."),
    t("검사를 통과한 변경만 PostgreSQL 에 한 번 기록하고 방 안의 다른 사람에게 전달합니다.", "Only updates that pass are recorded once in PostgreSQL and delivered to the others in the room."),
    t("같은 레이어를 동시에 건드리지 않도록 번호표(revision)가 붙은 15초짜리 잠금을 씁니다.", "To keep two people off the same layer, a 15-second lock carries a revision number."),
    t("접속 상태·커서는 Durable Objects 가, 통화·채팅은 브라우저끼리 직통 통로가 맡습니다.", "Presence and cursors go through Durable Objects, and calls and chat use a direct channel between browsers."),
  ],
  background: [
    t(
      "혼자 그릴 때는 내 기기가 곧 원본이지만, 여럿이 같은 장면을 그리면 '누구의 변경이 먼저인가'와 '누가 고쳐도 되는가'를 정해야 합니다. 그래서 변경을 합치는 일(CRDT)과 허락하는 일(서버의 권한 검사)을 나눴습니다.",
      "When you draw alone your device is the source, but when several people draw one scene you must decide whose change comes first and who is allowed to edit. So merging changes (CRDT) and granting permission (the server's access check) are separated.",
    ),
    t(
      "길은 셋으로 갈립니다. ① 문서·잠금·작업실 채팅은 Socket.IO → NestJS → PostgreSQL 이 권위 경로입니다. ② 접속 상태·커서·댓글 변경 알림·화면 공유 신호 같은 임시 정보는 Cloudflare Durable Objects 가 방 하나에 객체 하나로 순서를 잡습니다. ③ 허들(통화·채팅)은 서버가 첫 연결만 소개하고 이후는 브라우저끼리 WebRTC 직통 통로로 오갑니다.",
      "Traffic takes three routes. (1) Documents, locks and workroom chat use Socket.IO to NestJS to PostgreSQL as the authority. (2) Temporary information such as presence, cursors, comment-change alerts and screen-share signals is ordered by Cloudflare Durable Objects, one object per room. (3) Huddle calls and chat are introduced by the server only for the first link and then flow browser to browser over a WebRTC direct channel.",
    ),
    t(
      "CRDT 라고 충돌이 없는 것은 아닙니다. 병합은 수렴하지만 권한·저장·큰 비트맵은 서버와 별도 경로가 맡습니다. 운영 API 는 무료 플랜 서버 한 대(메모리 어댑터)라 동시 접속 수를 부하 시험으로 보증한 적이 없고, 허들은 로컬 시험 단계라 서로 다른 네트워크의 통화는 검증하지 않았습니다.",
      "CRDT does not mean there are no conflicts. Merging converges, but permissions, storage and large bitmaps are handled by the server and separate paths. The production API is one free-plan server (memory adapter), so concurrent users have never been proven by a load test, and huddle calls are at local-test stage with no verification across different networks.",
    ),
  ],
  inService: [
    {
      what: t("공동 작업실 입장", "Joining the workroom"),
      role: t(
        "쿠키를 60초 입장권으로 바꿔 소켓에 건네고, 서버가 멤버 권한을 15초마다 다시 확인",
        "Swaps the cookie for a 60-second ticket for the socket, and the server rechecks membership every 15 seconds",
      ),
      paths: [
        "apps/api/src/modules/creator/studio-live-auth-ticket.controller.ts",
        "apps/web/src/domains/creator/live/studio-live-auth-ticket-client.ts",
      ],
    },
    {
      what: t("동시 그리기 문서", "The shared drawing document"),
      role: t(
        "획·레이어·삭제를 Yjs CRDT 의미 연산으로 기록하고, 서버가 검사한 변경만 저장·전달",
        "Records strokes, layers and deletions as Yjs CRDT operations, and the server saves and delivers only updates it has checked",
      ),
      paths: [
        "apps/web/src/domains/creator/live/studio-crdt-document.ts",
        "apps/api/src/modules/creator/studio-crdt.service.ts",
      ],
    },
    {
      what: t("편집 잠금", "Edit locks"),
      role: t(
        "15초 임대 잠금에 작품별 번호표를 붙여 늦게 도착한 옛 소식이 현재를 뒤집지 못하게 함",
        "Gives each 15-second lease lock a per-project revision so a late, stale message cannot overturn the present",
      ),
      paths: [
        "apps/api/src/modules/creator/studio-live-lock.repository.ts",
        "apps/web/src/domains/creator/live/studio-live-lock-revision-ledger.ts",
      ],
    },
    {
      what: t("접속 상태·화면 공유 신호", "Presence and screen-share signals"),
      role: t(
        "방 하나에 객체 하나인 Durable Objects 가 접속자·커서·신호를 순서대로 조정",
        "Durable Objects, one object per room, coordinate participants, cursors and signals in order",
      ),
      paths: ["deploy/cloudflare-realtime/src/room.ts", "deploy/cloudflare-realtime/wrangler.jsonc"],
    },
    {
      what: t("허들 직통 통로", "Huddle direct channel"),
      role: t(
        "서버는 첫 신호만 전달하고 통화·채팅 신호는 WebRTC 직통 통로로 교환(원격 참가자 최대 3명)",
        "The server relays only the first signal, and call and chat signals use a WebRTC direct channel (at most 3 remote participants)",
      ),
      paths: [
        "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts",
        "apps/web/src/domains/creator/live/studio-live-direct-port.ts",
      ],
    },
  ],
  decisions: [
    {
      choice: t("병합은 CRDT, 허락은 서버", "CRDT merges, the server grants permission"),
      because: t(
        "CRDT 는 누가 써도 되는지 모르므로 서버가 권한·속도·불변식을 먼저 검사합니다.",
        "A CRDT does not know who may write, so the server checks permission, rate and invariants first.",
      ),
      cost: t(
        "모든 변경이 서버를 지나야 해서 서버 지연과 정원(30명) 한도를 받고, 아직 실험 단계입니다.",
        "Every change passes the server, so server latency and the 30-person room cap apply, and it is still experimental.",
      ),
    },
    {
      choice: t("서버는 통화의 중계소가 아니라 소개소", "The server introduces calls instead of relaying them"),
      because: t(
        "음성·영상이 서버를 지나지 않아 서버 비용이 들지 않고 서버에 저장되지도 않습니다.",
        "Voice and video never pass through the server, so there is no server cost and nothing is stored there.",
      ),
      cost: t(
        "직접 연결이 막힌 네트워크에서는 중계(TURN)가 필요하고, 서로 다른 네트워크의 통화는 검증하지 않았습니다.",
        "Networks that block direct links need a relay (TURN), and calls across different networks have not been verified.",
      ),
    },
  ],
  pitfall: t(
    "'Socket.IO 가 WebRTC 신호를 한다'는 부정확합니다. 서버를 지나는 WebRTC 신호는 데이터 통로 시작·화면 공유 신호뿐입니다. CRDT·Durable Objects·허들은 실험 또는 설정 단계이며 부하·다른 네트워크 통화는 검증하지 않았습니다.",
    "'Socket.IO carries WebRTC signaling' is inaccurate: the only WebRTC signals passing the server are those that open the data channel and share screens. CRDT, Durable Objects and huddles are experimental or configured, with no load test or cross-network call verified.",
  ),
  facts: [
    {
      value: "60 s",
      label: t("공동 작업실 입장권 유효 시간", "Workroom entry-ticket lifetime"),
      source: "packages/contracts/src/studio-live-auth-ticket.ts",
    },
    {
      value: "30",
      label: t("작업실 참가자 상한(명)", "Workroom participant cap (people)"),
      source: "apps/api/src/modules/creator/studio-live-gateway-constants.ts",
    },
    {
      value: "64",
      label: t("실시간 방 하나의 연결 상한(설정값)", "Connections allowed per realtime room (configured)"),
      source: "deploy/cloudflare-realtime/wrangler.jsonc",
    },
    {
      value: "3",
      label: t("허들의 원격 참가자 상한(명)", "Remote participants allowed in a huddle (people)"),
      source: "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts",
    },
  ],
  status: "experimental",
  atlasIds: [
    "socket-io-room-tickets",
    "yjs-crdt-document",
    "crdt-lock-revision",
    "durable-objects-realtime",
    "webrtc-three-plane-signaling",
    "webrtc-datachannel-direct-lane",
  ],
  chapterIds: ["collaborative-crdt-boundary", "webrtc-media-authority", "authentication"],
  glossaryIds: ["socket-io", "crdt", "yjs", "durable-objects", "webrtc", "signaling", "presence"],
};

export const ARCHITECTURE_RUNTIME_SECTIONS_B: readonly ArchitectureGuideSection[] = [DATA_AUTHORITY_SECTION, REALTIME_COLLAB_SECTION];
