import { t } from "./engineering-library-guide-kit";
import type { LibraryGuideArea } from "./engineering-library-guide-types";

/**
 * 라이브러리 해설 · 영역 5 "내 기기에 저장하기".
 * 사실의 정본은 ADR-0007·0012·0014, 오픈소스 지도(sqlite-wasm·multiformats 행), docs/studio-service-worker.md 와 코드다.
 * 웹 표준(OPFS·IndexedDB·Service Worker·Web Locks)에는 설치본이 없어 license 를 "Web standard" 로 적는다. 기준일 2026-10-08.
 */

const CREATOR = "apps/web/src/domains/creator";
const SERVICE_WORKER = "apps/web/src/app/service-worker";

export const LIBRARY_AREA_LOCAL_STORAGE_PWA: LibraryGuideArea = {
  id: "local-storage-pwa",
  number: 5,
  title: t("내 기기에 저장하기", "Saving on your own device"),
  question: t("서버 없이도 작품이 남게 하는 부품은 무엇일까?", "Which parts keep your work even without a server?"),
  oneLine: t(
    "찾을 것은 SQLite, 큰 파일은 OPFS, 앱 화면은 Service Worker가 기기에 둡니다.",
    "SQLite holds what must be searched, OPFS holds big files, and a Service Worker keeps the app screens on your device.",
  ),
  easy: t(
    "작업실 서랍장과 같습니다. 자주 찾는 서류는 색인이 붙은 서류철(SQLite)에, 큰 도면은 번호표를 붙인 보관함(OPFS)에 두고, 서랍을 여는 열쇠는 한 사람만 쥡니다(Web Locks). 다만 서랍장은 작업실 안에 있어서, 방을 비우면(사이트 데이터 삭제) 함께 사라집니다.",
    "It is like a drawer unit in a studio. Papers you look up often go in an indexed binder (SQLite), big drawings go in a numbered storage box (OPFS), and only one person holds the key to the drawers (Web Locks). The unit stands inside the studio, though, so clearing the room (deleting site data) takes it along.",
  ),
  designWhy: [
    {
      title: t("작품 원본은 내 기기가 먼저 받는다", "Your device receives the original first"),
      body: t(
        "운영 정본 문서는 개인 창작 원본의 권위를 기기(OPFS·로컬·BYOS)에 두고 중앙 DB에는 불필요한 개인 원본을 저장하지 않는다고 적습니다. 그래서 작업 중인 원본은 기기에 먼저 남고, 서버가 잠들어도 정적 화면과 로컬 편집은 계속됩니다.",
        "The canonical operations document puts authority over personal creative originals on the device (OPFS, local, BYOS) and says the central database does not store personal originals it does not need. So working originals land on the device first, and the static app and local editing keep working while the server sleeps.",
      ),
    },
    {
      title: t("저장소마다 맡은 일을 나눈다", "Each store has its own job"),
      body: t(
        "찾고 정렬할 데이터는 SQLite, 큰 파일과 복구 기록은 OPFS 파일, 작은 앱 상태는 IndexedDB가 맡습니다. 창작 데이터가 localStorage·IndexedDB로 되돌아가면 정적 검사(ADR-0014)가 같은 PR에서 실패합니다.",
        "SQLite holds data to search and sort, OPFS files hold big files and recovery records, and IndexedDB holds small app state. If creative data drifts back to localStorage or IndexedDB, a static check (ADR-0014) fails the same PR.",
      ),
    },
    {
      title: t("쓰는 주인은 한 명으로 정한다", "Decide on exactly one writer"),
      body: t(
        "DB 파일은 전용 Worker 하나만 열고(Chromium에서 두 Worker가 같은 풀을 열면 오류가 났습니다), 문서 편집은 Web Lock으로 탭 하나만 합니다. 두 번째 탭은 덮어쓰지 않고 물러납니다.",
        "Only one dedicated Worker opens the database file (two Workers opening the same pool raised an error in Chromium), and a Web Lock lets one tab edit a document. The second tab steps back instead of overwriting.",
      ),
    },
    {
      title: t("브라우저 저장소는 백업이 아니라고 말한다", "Say plainly that browser storage is no backup"),
      body: t(
        "OPFS는 사이트 데이터를 지우거나 기기를 잃으면 사라집니다. 그래서 열 수 없으면 '이 탭 메모리에만 유지'라고 알리고 localStorage로 몰래 대체하지 않으며, 내보내기·개인 클라우드 사본을 함께 안내합니다.",
        "OPFS disappears when site data is cleared or the device is lost. So when it cannot be opened the app says work stays in this tab's memory only, never swaps in localStorage quietly, and points to export files and personal-cloud copies.",
      ),
    },
  ],
  diagram: {
    id: "local-storage-pwa-diagram",
    kind: "layers",
    title: t("내 기기 안에서 저장이 쌓이는 순서", "How storage stacks up inside your device"),
    caption: t(
      "서버 없이도 열리고 남도록 화면·소유권·데이터·파일을 기기 안에서 층으로 나눕니다.",
      "Screens, ownership, data and files are split into layers on the device so the app opens and keeps work without a server.",
    ),
    alt: t(
      "위에서 아래로 여섯 층입니다. 앱 화면은 Service Worker가 캐시에서 내주고, Web Locks가 쓰는 주인을 한 명으로 정합니다. 찾고 정렬할 데이터는 전용 Worker 안의 SQLite가, 큰 파일과 복구 기록은 OPFS가, 작은 앱 상태는 IndexedDB가 보관합니다. 맨 아래 층은 기기 밖(IPFS)에서 받은 파일을 multiformats로 확인하는 단계이고, 위 다섯 층은 서버 없이 기기 안에서 일합니다.",
      "Six layers from top to bottom. A Service Worker serves the app screens from its cache, and Web Locks decide the single writer. SQLite inside a dedicated Worker holds data to search and sort, OPFS holds big files and recovery records, and IndexedDB holds small app state. The bottom layer checks files received from outside (IPFS) with multiformats, while the five layers above work on the device without a server.",
    ),
    layers: [
      {
        id: "shell",
        label: t("앱 화면 열기", "Opening the app"),
        sub: t("Service Worker가 해시 붙은 파일을 캐시에서 내줌", "A Service Worker serves hashed files from cache"),
        tone: "local",
        chips: ["Service Worker", "Cache API"],
      },
      {
        id: "lock",
        label: t("쓰는 주인은 한 명", "One writer only"),
        sub: t("Web Locks로 DB 주인과 문서 저자를 정함", "Web Locks pick the DB owner and document author"),
        tone: "warn",
        chips: ["Web Locks", "BroadcastChannel"],
      },
      {
        id: "sql",
        label: t("찾고 정렬할 데이터", "Data to search and sort"),
        sub: t("전용 Worker 안의 SQLite가 SQL로 보관", "SQLite in a dedicated Worker stores it with SQL"),
        tone: "local",
        chips: ["SQLite WASM", "Dedicated Worker"],
      },
      {
        id: "files",
        label: t("큰 파일과 복구 기록", "Big files and recovery records"),
        sub: t("OPFS의 내용 지문 이름 창고와 자동저장 저널", "OPFS holds a hash-named store and the autosave journal"),
        tone: "local",
        chips: ["OPFS", "SHA-256", "CRC32"],
      },
      {
        id: "small",
        label: t("작은 앱 상태", "Small app state"),
        sub: t("컷 목록·참여 같은 상태를 IndexedDB에 이어 저장", "Cut lists and engagement persist in IndexedDB"),
        tone: "local",
        chips: ["IndexedDB", "Zustand"],
      },
      {
        id: "outside",
        label: t("기기 밖에서 온 파일 확인", "Checking files from outside"),
        sub: t("받은 바이트를 내용 지문(CID)과 직접 대조", "Received bytes are compared with their CID"),
        tone: "external",
        chips: ["multiformats", "IPFS gateway"],
      },
    ],
    brackets: [
      { label: t("서버 없이 기기 안에서", "On the device, no server"), layerIds: ["shell", "lock", "sql", "files", "small"] },
    ],
  },
  libraries: [
    {
      id: "sqlite-wasm",
      name: "SQLite WASM",
      kind: "library",
      package: "@sqlite.org/sqlite-wasm",
      oneLine: t("브라우저 안에서 도는 작은 데이터베이스(SQLite)", "A small database (SQLite) that runs inside the browser"),
      usedFor: t(
        "브러시·필터 라이브러리(1만 개 규모), 저장 대기 기록, 체크포인트, 협업 오프라인 보관함을 서버 없이 SQL로 찾고 정렬합니다.",
        "Searches and sorts brush and filter libraries (ten-thousand scale), save-pending records, checkpoints and the offline co-editing outbox with SQL, without a server.",
      ),
      why: t(
        "찾고 정렬해야 하는 카탈로그가 커서, 통째로 읽고 쓰는 localStorage JSON 대신 SQL·트랜잭션·색인이 있는 DB를 골랐습니다. 서버 없이 기기 안에서 끝나 서버 비용도 들지 않습니다(ADR-0012).",
        "The catalogs that must be searched and sorted grew large, so we chose a database with SQL, transactions and indexes over a localStorage JSON blob read and written whole. It finishes on the device, so it adds no server cost (ADR-0012).",
      ),
      alternatives: t(
        "localStorage JSON은 동기 I/O·낮은 용량·전체 역직렬화로 기각, IndexedDB는 창작 데이터의 이중 권위를 없애려 제외, wa-sqlite는 공식 빌드보다 나은 증거가 없어 보류했습니다(ADR-0012).",
        "localStorage JSON was rejected for synchronous I/O, low quota and whole-blob parsing, IndexedDB was dropped to remove a double authority for creative data, and wa-sqlite was put on hold with no evidence it beats the official build (ADR-0012).",
      ),
      cost: t(
        "WASM 약 0.86MB(설치본 sqlite3.wasm)가 더해지고, Worker 하나만 DB를 쥐어 탭이 둘이면 한 탭만 씁니다. OPFS는 백업이 아니며 실측은 Chromium·macOS 중심입니다.",
        "It adds about 0.86 MB of WASM (the installed sqlite3.wasm), and only one Worker holds the database, so with two tabs just one writes. OPFS is not a backup, and measurements are mostly Chromium on macOS.",
      ),
      paths: [
        `${CREATOR}/studio-local-database.ts`,
        `${CREATOR}/studio-local-database.worker.ts`,
        `${CREATOR}/studio-local-database-worker-sqlite-loader.ts`,
      ],
      license: "Apache-2.0",
      status: "live",
      mapRowId: "sqlite-wasm",
      atlasIds: ["sqlite-wasm-opfs-sah-pool"],
    },
    {
      id: "opfs",
      name: "OPFS",
      kind: "format",
      oneLine: t("사이트마다 따로 주어지는 브라우저 안의 비공개 파일 공간", "A private file space the browser gives each site"),
      usedFor: t(
        "자동저장 복구 저널과 글꼴·VRM·3D 에셋 창고를 두고, SQLite 파일도 이 위에 놓습니다. 이 공간은 기기 안에 있어 서버 저장 용량을 쓰지 않습니다.",
        "Holds the autosave recovery journal and the font, VRM and 3D asset store, and the SQLite file sits on top of it. This space lives on the device, so it uses no server storage.",
      ),
      why: t(
        "큰 파일을 서버에 올리지 않고 기기에 바로 쓰려는 요구에 맞고, 서버가 잠들어도 로컬 편집이 이어집니다. 쓰기는 임시 파일에 먼저 쓰고 닫을 때 바꿔서, 중간에 꺼져도 원본이 남습니다.",
        "It fits the need to write big files straight to the device instead of a server, and local editing continues while the server sleeps. A write goes to a temporary file and is swapped in on close, so a crash leaves the original.",
      ),
      alternatives: t(
        "localStorage는 작고 동기식이라, IndexedDB는 이중 권위 문제로 창작 데이터의 기본에서 뺐습니다. 에셋 정리는 참조 카운트 대신 mark-and-sweep과 5분 유예를 씁니다.",
        "localStorage is small and synchronous and IndexedDB caused a double authority, so both left the default for creative data. Asset cleanup uses mark-and-sweep with a five-minute grace instead of reference counting.",
      ),
      cost: t(
        "사용자가 파일 탐색기로 볼 수 없고 사이트 데이터를 지우면 함께 사라집니다(백업 아님). 열 수 없으면 '메모리뿐'이라 알리고 몰래 대체하지 않습니다.",
        "Users cannot browse it with a file explorer, and it disappears with site data (not a backup). If it cannot be opened the app says memory only and does not swap in a substitute quietly.",
      ),
      paths: [
        `${CREATOR}/studio-opfs-filesystem.ts`,
        `${CREATOR}/studio-opfs-asset-store.ts`,
        `${CREATOR}/studio-opfs-recovery-journal.ts`,
      ],
      license: "Web standard",
      status: "live",
      atlasIds: ["opfs-content-addressed-store", "autosave-crash-recovery-journal", "storage-persistence-quota-safe-mode"],
    },
    {
      id: "service-worker",
      name: "Service Worker",
      kind: "format",
      oneLine: t("인터넷이 끊겨도 앱이 열리게 파일을 기기에 맡아 두는 문지기", "A gatekeeper that keeps app files on the device so the app opens offline"),
      usedFor: t(
        "앱 셸과 해시 붙은 파일을 캐시에서 내주고, 새 버전은 저장 상태를 확인한 뒤 사용자가 눌러야 적용합니다. 작품 데이터는 만지지 않습니다.",
        "Serves the app shell and hashed files from cache, and applies a new version only after a save-safety check and a user click. It never touches artwork data.",
      ),
      why: t(
        "서버가 잠들거나 끊겨도 스튜디오가 열려야 해서 앱 셸을 Cache API로 기기에 둡니다. 라우팅·버전 판단을 순수 함수로 두어 브라우저 없이 단위 테스트하고, 프리캐시는 하나라도 실패하면 새 워커를 켜지 않습니다.",
        "The studio must open even when the server sleeps or is unreachable, so the app shell lives on the device in the Cache API. Routing and versioning are pure functions tested without a browser, and one failed precache file stops the new worker from activating.",
      ),
      alternatives: t(
        "Workbox 같은 라이브러리 없이 직접 구현했습니다. 라이브러리를 고르지 않은 이유를 적은 문서는 저장소에서 찾지 못했습니다.",
        "It is implemented directly, without a library such as Workbox. We found no document that records why a library was not chosen.",
      ),
      cost: t(
        "Background Sync는 로컬 DB 손상 위험 때문에 쓰지 않습니다. 캐시 무효화 축이 둘(계약 버전 5·빌드 ID)이라 관리가 까다롭고, 나쁜 워커를 위한 킬 스위치가 따로 필요합니다.",
        "Background Sync is not used because it could corrupt the local database. Two invalidation axes (contract version 5 and a build ID) are hard to manage, and a bad worker needs a separate kill switch.",
      ),
      paths: [
        `${SERVICE_WORKER}/studio-service-worker-entry.ts`,
        `${SERVICE_WORKER}/studio-service-worker-policy.ts`,
        `${SERVICE_WORKER}/studio-service-worker-precache-plan.ts`,
      ],
      license: "Web standard",
      status: "live",
      atlasIds: ["service-worker-app-shell-policy", "precache-budget-offline-core", "user-approved-update-kill-switch"],
    },
    {
      id: "indexeddb",
      name: "IndexedDB",
      kind: "format",
      oneLine: t("브라우저 안에 큰 데이터를 비동기로 쌓는 기본 저장소", "The browser's built-in store for larger data, used asynchronously"),
      usedFor: t(
        "컷 목록·참여·뉴스레터 같은 앱 상태(Zustand)를 이어 저장합니다. 창작 문서의 원본 저장소로는 쓰지 않습니다.",
        "Persists app state (Zustand) such as cut lists, engagement and newsletter data. It is not the home of the original creative documents.",
      ),
      why: t(
        "localStorage는 작고 동기식이라 커지는 상태에서 막혔고, IndexedDB는 크고 비동기라 맞습니다. 옮길 때는 읽고·쓰고·다시 읽어 같을 때만 옛 키를 지워 사고가 나도 옛 사본이 남게 했습니다.",
        "localStorage is small and synchronous and ran into limits as state grew, while IndexedDB is large and asynchronous. A move reads, writes and reads back, and deletes the old key only if they match, so a mishap leaves the old copy.",
      ),
      alternatives: t(
        "창작 데이터는 SQLite·OPFS로 통일하고 IndexedDB는 UI 상태용으로 한정했습니다. 정적 검사(ADR-0014)가 제품 경로로 되돌아오는 것을 막습니다.",
        "Creative data is unified on SQLite and OPFS, and IndexedDB is limited to UI state. A static check (ADR-0014) blocks it from returning to the product path.",
      ),
      cost: t(
        "정렬·검색·여러 표의 규칙을 직접 짜야 합니다. 비동기라 첫 화면에 바로 필요한 값(로그인 세션 등)은 localStorage에 남겼습니다. 브라우저 저장소라 백업은 아닙니다.",
        "Sorting, searching and multi-table rules are yours to write. Values needed synchronously on the first screen, such as the login session, stay in localStorage. It is browser storage, so not a backup.",
      ),
      paths: [
        "apps/web/src/shared/lib/idb-kv.ts",
        "apps/web/src/shared/lib/idb-json-storage.ts",
        "apps/web/src/domains/cuts/cuts-store.ts",
      ],
      license: "Web standard",
      status: "live",
      atlasIds: ["verified-localstorage-to-idb-migration"],
    },
    {
      id: "web-locks",
      name: "Web Locks",
      kind: "format",
      oneLine: t("탭이 여러 개여도 '지금 쓰는 사람은 한 명'을 지키는 번호표", "A ticket that keeps 'only one writer at a time' across many tabs"),
      usedFor: t(
        "SQLite를 여는 Worker와 문서별 편집 탭을 하나로 정합니다. 탭이 닫히거나 죽으면 브라우저가 락을 풀어 다음 탭이 이어받습니다.",
        "Picks one Worker to open SQLite and one editing tab per document. When a tab closes or crashes the browser releases its lock and the next tab takes over.",
      ),
      why: t(
        "같은 원고를 탭 둘로 열면 나중 저장이 앞선 작업을 덮을 수 있습니다. 시각을 적는 방식은 시계 오차에, 메시지 선출은 유실에 약해서 소유권을 브라우저가 보장하는 락으로 정했습니다.",
        "With one manuscript open in two tabs, the later save can erase the earlier work. Timestamps suffer from clock skew and message elections from lost messages, so ownership is decided by a lock the browser guarantees.",
      ),
      alternatives: t(
        "localStorage에 리더 시각을 적는 방식과 BroadcastChannel 선출은 쓰지 않고, BroadcastChannel은 '작업공간이 바뀌었다' 같은 알림에만 씁니다.",
        "Writing a leader timestamp to localStorage and electing over BroadcastChannel are not used; BroadcastChannel carries only notices such as 'the workspace changed'.",
      ),
      cost: t(
        "락은 협조적이라 확인하지 않는 코드는 막지 못하고 다른 기기와는 조율하지 못합니다(그 경계는 서버 revision과 CRDT). 두 번째 탭은 DB 락을 0.75초만 기다립니다.",
        "Locks are cooperative, so code that skips them is not stopped, and other devices are not coordinated (that boundary belongs to server revisions and CRDT). A second tab waits only 0.75 s for the DB lock.",
      ),
      paths: [
        `${CREATOR}/studio-autosave-document-leader.ts`,
        `${CREATOR}/studio-local-database.worker.ts`,
        `${CREATOR}/studio-local-database-worker-handoff.ts`,
      ],
      license: "Web standard",
      status: "live",
      atlasIds: ["web-locks-broadcastchannel-single-author"],
    },
    {
      id: "multiformats",
      name: "multiformats",
      kind: "library",
      package: "multiformats",
      oneLine: t("파일의 '내용 지문'(CID)을 만들고 대조하는 작은 도구", "A small tool that makes and checks a file's content fingerprint (CID)"),
      usedFor: t(
        "통합 센터의 IPFS 패널에서 공개 게이트웨이가 준 바이트가 약속한 지문과 같은지 직접 대조합니다. 작품 저장 경로와는 별개입니다.",
        "In the integration center's IPFS panel it checks that bytes from a public gateway match the promised fingerprint. It is separate from the artwork save path.",
      ),
      why: t(
        "Helia(@helia/verified-fetch)는 전이 의존성 보안 권고가 풀리지 않아 쓰지 않고, CID 계산·검증만 하는 multiformats와 게이트웨이 fetch로 닫히는 범위를 구현했습니다(코드 주석, 2026-10-06 실측).",
        "Helia (@helia/verified-fetch) is not used because its transitive security advisories were unresolved, so the scope that can be closed is built with multiformats, which only computes and verifies CIDs, plus a gateway fetch (code comment, measured 2026-10-06).",
      ),
      alternatives: t(
        "js-ipfs는 저장소가 보관(archived)되고 지원이 끝나 어떤 경우에도 넣지 않고, 후계 Helia 생태계는 UnixFS 파일 단위 CID 호환이나 브라우저 노드 제공이 필요해지면 같은 자리에서 다시 검토합니다.",
        "js-ipfs is archived and unsupported so it is never added, and the successor Helia ecosystem will be reviewed again in the same place if UnixFS file-level CID compatibility or a browser node is needed.",
      ),
      cost: t(
        "만드는 CID는 raw 단일 블록 주소라 UnixFS 주소와 호환되지 않습니다. 게이트웨이 3곳은 운영 CSP connect-src에 없어 운영 브라우저에서 막힐 가능성이 큽니다(실브라우저 미검증).",
        "The CID is a raw single-block address and is not compatible with UnixFS addresses. The three gateways are absent from the production CSP connect-src, so production browsers will likely block them (not verified in a real browser).",
      ),
      paths: [
        "apps/web/src/domains/integrations/ipfs-content-address.ts",
        "apps/web/src/domains/integrations/IpfsContentAddressPanel.tsx",
      ],
      license: "Apache-2.0 OR MIT",
      status: "live",
      mapRowId: "multiformats",
      atlasIds: ["ipfs-content-address-verification"],
    },
  ],
  pitfall: t(
    "'저장됨'은 이 기기 안에 저장됐다는 뜻입니다. 사이트 데이터를 지우거나 기기를 잃으면 함께 사라지므로 내보내기·클라우드 사본이 따로 필요하고, Safari·Firefox 실측은 없습니다.",
    "'Saved' means saved on this device. It disappears with site data or a lost device, so export files and cloud copies are needed separately, and there are no Safari or Firefox measurements.",
  ),
  status: "live",
  atlasIds: [
    "sqlite-wasm-opfs-sah-pool",
    "autosave-crash-recovery-journal",
    "opfs-content-addressed-store",
    "service-worker-app-shell-policy",
    "web-locks-broadcastchannel-single-author",
    "storage-persistence-quota-safe-mode",
  ],
  chapterIds: ["storage", "pwa-continuity", "storage-migration", "content-addressing", "browser-local-compute", "worker-architecture"],
  glossaryIds: ["sqlite-wasm", "opfs", "indexeddb", "service-worker", "web-locks", "broadcast-channel", "cas-cid", "pwa", "offline-shell"],
};
