import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { sampleLines, t } from "./engineering-atlas-local-first-kit";

/**
 * 기술 도감 · local-first 카드 (1) 기기 안 데이터베이스·자동저장·다중 탭.
 * 근거 경로는 모두 저장소에서 직접 열어 확인한 값이며, 수치는 `facts`의 source 에서 읽은 값만 쓴다.
 */

const CREATOR = "apps/web/src/domains/creator";

export const SQLITE_WASM_OPFS_SAH_POOL: EngineeringAtlasEntry = {
  id: "sqlite-wasm-opfs-sah-pool",
  category: "local-first",
  name: "SQLite WASM",
  title: t("브라우저 안의 관계형 데이터베이스", "A relational database inside the browser"),
  status: "live",
  tagline: t(
    "전용 Worker 하나가 SQLite를 단독으로 쥐고, 설정·카탈로그·저장 의도를 SQL로 보관합니다.",
    "One dedicated Worker owns SQLite alone and keeps settings, catalogs and save intents in SQL.",
  ),
  background: [
    t(
      "스튜디오에는 브러시 1만 개 같은 카탈로그, 팔레트, 체크포인트, ‘저장 대기’ 기록처럼 검색하고 정렬해야 하는 데이터가 많습니다. 이것을 메모장(localStorage)에 통째로 적어 두면 항목이 늘수록 느려지고, 쓰다가 꺼지면 반쯤 쓰인 상태가 남습니다. 그래서 브라우저 안에 진짜 데이터베이스(SQLite)를 넣었습니다. 서버에 가지 않아도 SQL로 찾고 정렬하며, 쓰는 도중 꺼져도 직전 상태가 유지됩니다.",
      "The studio keeps plenty of data that must be searched and sorted: a catalog of ten thousand brushes, palettes, checkpoints and ‘save pending’ records. Writing all of it into one big text note (localStorage) gets slower as it grows, and a crash mid-write leaves a half-written file. So the browser carries a real database (SQLite): it finds and sorts with SQL without a server, and a crash during a write falls back to the last good state.",
    ),
    t(
      "동작은 네 단계입니다. ① 화면(페이지)은 SQLite를 직접 열지 않고, 백그라운드 스레드인 전용 Worker 하나만 만듭니다. ② Worker는 시작하자마자 Web Lock으로 ‘이 기기의 DB 주인’ 자리를 잡습니다. ③ SQLite WASM(SQLite를 WebAssembly로 옮긴 것)을 필요할 때 불러와, OPFS(브라우저 안의 비공개 파일 공간)에 미리 열어 둔 파일 풀 위에 DB 파일을 둡니다. ④ 화면의 요청 39가지는 메시지로 Worker에 전달되어 한 줄로 순서대로 처리됩니다.",
      "It works in four steps. ① The page never opens SQLite itself; it only creates one dedicated Worker, a background thread. ② As soon as the Worker starts, it takes the ‘owner of this device’s database’ seat with a Web Lock. ③ It loads SQLite WASM (SQLite compiled to WebAssembly) on demand and keeps the database file on a pool of pre-opened files in OPFS, the browser’s private file space. ④ The page’s 39 kinds of requests travel as messages and are handled one at a time, in order.",
    ),
    t(
      "대안은 localStorage(작고 동기식)와 IndexedDB(비동기지만 정렬·검색·여러 표를 묶는 규칙을 직접 짜야 함)입니다. 설계 문서(ADR-0012)는 IndexedDB를 제품 기본으로 쓰지 않고 SQLite로 통일했습니다. OPFS 위의 SQLite에도 여러 방식이 있는데, 별도 보조 Worker를 띄우는 방식과 달리 opfs-sahpool은 파일 핸들을 미리 풀로 잡아 두는 방식이라 보조 Worker가 필요 없고, ToonStudio는 이것만 켭니다.",
      "The alternatives are localStorage (small and synchronous) and IndexedDB (asynchronous, but sorting, searching and multi-table rules are yours to build). The design record (ADR-0012) unified product data on SQLite instead of using IndexedDB by default. SQLite on OPFS also comes in several flavors; unlike the ones that start an extra helper Worker, opfs-sahpool pre-opens file handles into a pool, needs no helper, and is the only one ToonStudio turns on.",
    ),
    t(
      "한계도 분명합니다. 풀은 한 번에 Worker 하나만 쥘 수 있어서, 같은 사이트를 탭 두 개로 열면 먼저 연 탭만 DB를 쓰고 다른 탭은 ‘이 탭 변경은 세션에만 유지돼요’ 상태로 물러납니다. 또 OPFS는 브라우저 저장소이므로 사이트 데이터를 지우거나 기기를 잃으면 함께 사라집니다. 그래서 작품 자체는 별도의 복구 저널, 내보내기 파일, 개인 클라우드 백업과 함께 지킵니다.",
      "The limits are real. A pool can be held by only one Worker at a time, so with two tabs open the first tab uses the database while the other steps back to ‘this tab’s changes stay in the session only’. And OPFS is browser storage: clearing site data or losing the device takes it along. That is why the artwork itself is protected by a separate recovery journal, export files and personal-cloud backup.",
    ),
  ],
  keyPoints: [
    t("DB는 페이지가 아니라 전용 Worker 한 개가 단독 소유", "One dedicated Worker owns the database, not the page"),
    t("OPFS 파일 풀(opfs-sahpool) 위의 SQLite, 스키마 v1~v6", "SQLite on an OPFS file pool (opfs-sahpool), schema v1–v6"),
    t("탭이 둘이면 한 탭만 쓰고 다른 탭은 세션 메모리로 물러남", "With two tabs, one writes and the other falls back to session memory"),
    t("손상되면 비우고 다시 열되, 같은 호출은 한 번만 재시도", "On corruption it wipes, reopens and retries the call once"),
  ],
  diagram: {
    id: "sqlite-wasm-opfs-sah-pool-diagram",
    kind: "layers",
    title: t("누가 데이터베이스를 소유하는가", "Who owns the database"),
    caption: t(
      "DB 파일은 페이지가 아니라, 락을 잡은 전용 Worker 하나만 열 수 있습니다.",
      "Only the one dedicated Worker that holds the lock can open the database file, never the page.",
    ),
    alt: t(
      "위에서 아래로 기능 코드, 페이지 프록시, Web Lock, 전용 Worker 안의 SQLite, OPFS 파일 풀, DB 파일이 쌓여 있습니다. 가운데 세 계층인 락·Worker·파일 풀은 Worker 하나가 단독으로 소유하고, 화면은 메시지로만 요청합니다.",
      "From top to bottom the stack is feature code, a page-side proxy, a Web Lock, SQLite inside the dedicated Worker, an OPFS file pool and the database file. The middle three layers (lock, Worker, file pool) belong to a single Worker, and the page only talks to it through messages.",
    ),
    layers: [
      {
        id: "feature",
        label: t("기능 코드 (화면 쪽)", "Feature code (page side)"),
        sub: t("브러시 카탈로그·체크포인트·번역 메모리가 함수로 요청", "Brush catalog, checkpoints and translation memory call functions"),
        tone: "local",
        chips: ["acquireStudioLocalDatabase()"],
      },
      {
        id: "proxy",
        label: t("페이지 프록시", "Page-side proxy"),
        sub: t("39개 요청 · 요청 번호 · 120초 타임아웃 · 몰래 폴백 없음", "39 methods, request IDs, 120 s timeout, no silent fallback"),
        tone: "local",
        chips: ["Dedicated Worker"],
      },
      {
        id: "lock",
        label: t("Web Lock 소유권", "Web Lock ownership"),
        sub: t("탭 수명 동안 하나만 통과 · 0.75초 기다리다 포기", "One holder per tab lifetime; gives up after 0.75 s"),
        tone: "warn",
        chips: ["Web Locks"],
      },
      {
        id: "worker",
        label: t("전용 Worker 안의 SQLite", "SQLite inside the dedicated Worker"),
        sub: t("호출을 한 줄 큐로 처리 · 손상 시 한 번만 재시도", "Calls run through one queue; one retry after corruption"),
        tone: "local",
        chips: ["SQLite WASM"],
      },
      {
        id: "pool",
        label: t("OPFS SAH 풀", "OPFS SAH pool"),
        sub: t("동기 파일 핸들을 미리 잡아 둔 파일 풀 (opfs-sahpool)", "Pre-opened synchronous file handles (opfs-sahpool)"),
        tone: "local",
        chips: ["OPFS"],
      },
      {
        id: "file",
        label: t("studio-local-v12.db", "studio-local-v12.db"),
        sub: t("스키마 v6 · 열 때 quick_check · 버전별 트랜잭션", "Schema v6, quick_check on open, one transaction per version"),
        tone: "good",
      },
    ],
    brackets: [{ label: t("Worker 하나가 단독 소유", "Owned by one Worker alone"), layerIds: ["lock", "worker", "pool"] }],
  },
  usage: [
    {
      feature: t("스튜디오 · 브러시·필터 라이브러리", "Studio · brush and filter libraries"),
      role: t(
        "브러시 1만 개 규모 카탈로그를 SQL 인덱스로 검색·정렬하고 keyset 페이지로 이어서 보여줍니다.",
        "Searches and sorts a ten-thousand-brush catalog with SQL indexes and pages through it with keyset pagination.",
      ),
      paths: [`${CREATOR}/brush/studio-brush-library-sqlite-repository.ts`, `${CREATOR}/studio-local-database.ts`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 저장 의도와 체크포인트", "Studio · save intent and checkpoints"),
      role: t(
        "‘저장 대기’ 의도, 이름 있는 체크포인트, 자동저장의 SQLite 미러를 같은 DB에 기록합니다.",
        "Records save-pending intents, named checkpoints and the autosave SQLite mirror in the same database.",
      ),
      paths: [`${CREATOR}/studio-durable-save-intent-sqlite.ts`, `${CREATOR}/studio-checkpoints.ts`, `${CREATOR}/studio-autosave-sqlite-store.ts`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 공동 편집 오프라인 보관함", "Studio · offline vault for co-editing"),
      role: t(
        "서버가 아직 받지 않은 공동 편집 변경(outbox)과 거절된 변경의 복구 기록을 SQLite에 보관합니다.",
        "Keeps co-editing changes the server has not accepted yet (the outbox) and recovery records of rejected changes in SQLite.",
      ),
      paths: [`${CREATOR}/live/studio-crdt-outbox.ts`, `${CREATOR}/live/studio-crdt-recovery-vault.ts`],
    },
    {
      feature: t("스튜디오 · 애니매틱·번역 메모리·Production Bible", "Studio · animatic, translation memory, Production Bible"),
      role: t(
        "작업 공간별 부가 데이터를 같은 DB의 이름공간(KV)에 저장해 새로고침 뒤에도 이어 씁니다.",
        "Stores per-workspace extras in key-value namespaces of the same database so they continue after a reload.",
      ),
      paths: [
        `${CREATOR}/studio-animatic-sqlite-persistence.ts`,
        `${CREATOR}/studio-translation-memory-sqlite-persistence.ts`,
        `${CREATOR}/studio-production-bible-sqlite-persistence.ts`,
      ],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("PRAGMA user_version 마이그레이션 러너", "A PRAGMA user_version migration runner"),
      language: "ts",
      ...sampleLines([
        "type Db = { exec(sql: string): void; selectValue(sql: string): unknown };",
        "const MIGRATIONS: string[][] = [",
        '  ["CREATE TABLE kv (ns TEXT, k TEXT, v TEXT, PRIMARY KEY (ns, k))"],',
        '  ["CREATE TABLE journal (project TEXT, seq INTEGER, PRIMARY KEY (project, seq))"],',
        "];",
        "export function migrate(db: Db): number {",
        '  let version = Number(db.selectValue("PRAGMA user_version"));',
        "  for (const [index, statements] of MIGRATIONS.entries()) {",
        ["    if (index + 1 <= version) continue; // 이미 적용된 버전은 건너뜀(멱등)", "    if (index + 1 <= version) continue; // skip versions already applied (idempotent)"],
        ['    db.exec("BEGIN IMMEDIATE"); // 버전 하나 = 트랜잭션 하나', '    db.exec("BEGIN IMMEDIATE"); // one version = one transaction'],
        "    try {",
        "      for (const sql of statements) db.exec(sql);",
        "      version = index + 1;",
        ['      db.exec("PRAGMA user_version = " + version); // 버전 기록도 같은 트랜잭션', '      db.exec("PRAGMA user_version = " + version); // the version bump is in the same transaction'],
        '      db.exec("COMMIT");',
        "    } catch (error) {",
        '      db.exec("ROLLBACK");',
        "      throw error;",
        "    }",
        "  }",
        "  return version;",
        "}",
      ]),
      explain: t(
        "열 때마다 현재 user_version을 읽고, 아직 적용되지 않은 번호만 순서대로 한 트랜잭션씩 실행합니다. 중간에 실패하면 그 버전만 롤백되어 DB는 항상 어떤 완성된 버전에 머뭅니다. 실제 코드는 v1~v6 체인입니다.",
        "On every open it reads user_version and runs only the missing numbers, one transaction each. A failure rolls back just that version, so the database always rests on a complete version. The real code is a v1–v6 chain.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("락을 훔치지 않는 750ms 핸드오프", "A 750 ms handoff that never steals the lock"),
      language: "ts",
      source: `${CREATOR}/studio-local-database-worker-handoff.ts`,
      ...sampleLines([
        ["const DELAYS_MS = [50, 100, 200, 400] as const; // 합계 750ms", "const DELAYS_MS = [50, 100, 200, 400] as const; // 750 ms in total"],
        "async function tryLock(name: string): Promise<(() => void) | null> {",
        "  let release: () => void = () => {};",
        "  const held = new Promise<void>((resolve) => { release = resolve; });",
        "  const got = await new Promise<boolean>((resolve) => {",
        '    void navigator.locks.request(name, { mode: "exclusive", ifAvailable: true }, (lock) => {',
        "      resolve(lock !== null);",
        ["      return lock === null ? undefined : held; // 끝나지 않는 Promise = 놓을 때까지 소유", "      return lock === null ? undefined : held; // a pending Promise = held until released"],
        "    });",
        "  });",
        "  return got ? release : null;",
        "}",
        ["/** 새로고침 직후 옛 Worker가 락을 놓을 시간만 주고, 훔치거나 데이터를 지우지 않는다. */", "/** Gives the previous Worker just enough time to release; never steals the lock or wipes data. */"],
        "export async function acquireOwnerLock(name: string): Promise<() => void> {",
        "  for (let attempt = 0; ; attempt++) {",
        "    const release = await tryLock(name);",
        "    if (release) return release;",
        "    const delay = DELAYS_MS[attempt];",
        ['    if (delay === undefined) throw new Error("다른 탭이 DB를 쓰는 중입니다");', '    if (delay === undefined) throw new Error("another tab is using the database");'],
        "    await new Promise((resolve) => setTimeout(resolve, delay));",
        "  }",
        "}",
      ]),
      explain: t(
        "DB 소유 락은 기다리지 않는 방식(ifAvailable)으로 요청합니다. 페이지를 새로고침하면 이전 Worker가 락을 놓기 전에 새 Worker가 뜰 수 있어, 50·100·200·400ms 간격으로 4번만 다시 시도하고 그래도 안 되면 다른 탭이 쓰는 것으로 보고 물러납니다.",
        "The database lock is requested without waiting (ifAvailable). After a reload the new Worker can start before the old one lets go, so it retries four times at 50, 100, 200 and 400 ms, then concludes another tab owns the database and steps back.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "SQLite Wasm · Documentation", url: "https://sqlite.org/wasm/doc/trunk/index.md", kind: "docs", note: t("공식 문서 첫 화면", "Official documentation entry point") },
    { title: "SQLite Wasm · Persistence (OPFS VFS 비교)", url: "https://sqlite.org/wasm/doc/trunk/persistence.md", kind: "docs", note: t("opfs 와 opfs-sahpool 의 차이", "How opfs and opfs-sahpool differ") },
    { title: "MDN · Origin private file system", url: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system", kind: "docs" },
    { title: "MDN · FileSystemSyncAccessHandle", url: "https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle", kind: "docs", note: t("Worker 안에서만 쓰는 동기 파일 핸들", "The synchronous handle that only Workers can open") },
    { title: "SQLite · PRAGMA statements", url: "https://www.sqlite.org/pragma.html", kind: "docs", note: t("user_version, quick_check 설명", "user_version and quick_check") },
  ],
  chapterIds: ["storage", "browser-local-compute", "worker-architecture"],
  talk: {
    pitch: t(
      "ToonStudio는 브러시 카탈로그나 ‘저장 대기’ 기록처럼 찾고 정렬해야 하는 데이터를 서버가 아니라 브라우저 안의 SQLite에 둡니다. 이 데이터베이스는 화면이 아니라 전용 Worker 하나가 단독으로 쥐고 있어서, 화면이 바빠도 멈추지 않고 두 탭이 동시에 쓰다 망가지는 일도 막습니다. 다만 브라우저 저장소는 영구 백업이 아니라서 내보내기와 개인 클라우드 백업을 함께 안내합니다.",
      "ToonStudio keeps data that must be searched and sorted, such as the brush catalog or ‘save pending’ records, in SQLite inside the browser rather than on a server. One dedicated Worker, not the page, holds that database alone, so a busy screen does not stall it and two tabs cannot corrupt it by writing at once. Browser storage is not a permanent backup, so export and personal-cloud backup are offered alongside.",
    ),
    analogy: t(
      "서류 보관실의 열쇠가 하나뿐이고, 열쇠를 가진 전담 직원이 접수대에서 요청을 한 건씩 처리하는 모습입니다. 손님(화면)이 서랍을 직접 열지 않으니 서류가 뒤섞이지 않습니다.",
      "A filing room with a single key: the clerk who holds it handles requests one by one at the counter. Visitors (the page) never open the drawers themselves, so documents do not get mixed up.",
    ),
    questions: [
      {
        question: t("IndexedDB로는 안 되나요?", "Why not IndexedDB?"),
        answer: t(
          "IndexedDB도 브라우저 안의 저장소지만 정렬·검색·여러 표를 묶는 규칙을 직접 짜야 합니다. 1만 개 카탈로그를 정렬해 이어 보여주는 일에는 SQL이 더 단순해서 설계 문서(ADR-0012)가 SQLite로 통일했고, IndexedDB는 옛 데이터를 가져오는 명시적 통로에만 남겼습니다.",
          "IndexedDB is also in-browser storage, but sorting, searching and multi-table rules are yours to write. SQL is simpler for paging through a ten-thousand-item catalog, so ADR-0012 unified on SQLite and kept IndexedDB only as an explicit legacy-import path.",
        ),
      },
      {
        question: t("데이터가 깨지면요?", "What if the data is corrupted?"),
        answer: t(
          "처음 열 때 quick_check로 검사하고, 손상이면 파일 풀을 비운 뒤 빈 DB로 다시 엽니다. 이때 SQLite 안의 설정·카탈로그 행은 사라지므로, 작품 자체는 별도 복구 저널과 내보내기 파일로 지키는 구조입니다.",
          "It runs quick_check on open; if the file is damaged it wipes the file pool and reopens an empty database. Settings and catalog rows inside SQLite are lost in that case, which is why the artwork itself is protected by the separate recovery journal and export files.",
        ),
      },
      {
        question: t("탭을 두 개 열면요?", "What happens with two tabs?"),
        answer: t(
          "먼저 연 탭의 Worker가 락을 쥐고, 두 번째 탭은 합계 0.75초 동안만 다시 시도하다 물러나 ‘이 탭 변경은 세션에만 유지돼요’라고 알립니다.",
          "The first tab’s Worker holds the lock; the second tab retries for 0.75 seconds in total, then steps back and says ‘changes in this tab stay in the session only’.",
        ),
      },
      {
        question: t("얼마나 빠른가요?", "How fast is it?"),
        answer: t(
          "저장소에 커밋된 벤치마크(Chromium 140, macOS 개발 기기 1대, 2026-08-08)에서 브러시 1만 개 삽입은 약 2.1초, ID 조회 중앙값은 0.28ms였습니다. 기기와 브라우저에 따라 달라지는 예시 값입니다.",
          "In the benchmark committed to the repository (Chromium 140 on one macOS development machine, 2026-08-08), inserting ten thousand brushes took about 2.1 seconds and the median ID lookup 0.28 ms. These are example values that vary by device and browser.",
        ),
      },
    ],
    pitfall: t(
      "‘v12’는 스키마 버전이 아니라 제품 라인 이름입니다(스키마는 v6). 벤치마크는 Chromium·macOS 한 대의 값이고 Safari·Firefox 실측은 없습니다. 브라우저 저장소는 백업이 아니므로 내보내기·개인 클라우드 백업을 함께 말하세요.",
      "‘v12’ is the product line name, not the schema version (the schema is v6). The benchmark comes from one Chromium-on-macOS machine; there are no Safari or Firefox measurements. Browser storage is not a backup, so mention export and personal-cloud backup together.",
    ),
  },
  technologies: ["SQLite WASM", "OPFS", "Dedicated Worker", "Web Locks"],
  facts: [
    { value: "v6", label: t("SQLite 스키마 버전(PRAGMA user_version 체인)", "SQLite schema version (PRAGMA user_version chain)"), source: `${CREATOR}/studio-local-database.ts` },
    { value: "39", label: t("Worker가 받는 요청(RPC) 종류", "Kinds of requests (RPC) the Worker accepts"), source: `${CREATOR}/studio-local-database-worker-protocol.ts` },
    { value: "50·100·200·400 ms", label: t("DB 락 핸드오프 재시도 간격(합계 750ms)", "DB lock handoff retry delays (750 ms in total)"), source: `${CREATOR}/studio-local-database-worker-handoff.ts` },
    { value: "2,105.8 ms", label: t("브러시 1만 개 삽입 시간(Chromium 140·macOS 1대, 2026-08-08)", "Time to insert 10,000 brushes (Chromium 140, one macOS machine, 2026-08-08)"), source: "tests/benchmarks/results/brush-library-opfs-browser.json" },
  ],
  reviewedAt: "2026-10-07",
};

export const AUTOSAVE_CRASH_RECOVERY_JOURNAL: EngineeringAtlasEntry = {
  id: "autosave-crash-recovery-journal",
  category: "local-first",
  name: "OPFS recovery journal",
  title: t("크래시에서 살아남는 자동저장", "Autosave that survives a crash"),
  status: "live",
  tagline: t(
    "편집이 멈추면 1.5초 뒤, 펜을 뗄 때마다 기기 안 파일에 기록해 크래시 뒤에도 복구합니다.",
    "Writes to a file on the device 1.5 s after editing pauses and at every pen-up, so a crash can be recovered.",
  ),
  background: [
    t(
      "그림을 그리다 브라우저가 갑자기 꺼지면 마지막 몇 분이 사라질까요? 자동저장은 이 걱정을 줄이려고, 편집이 1.5초 멈추거나 펜을 뗄 때, 탭을 떠날 때마다 작품 상태를 기기 안 파일에 기록합니다. 비유하면 원고를 한 장 쓸 때마다 복사본을 두 칸짜리 서랍에 번갈아 넣어 두는 것입니다. 한 칸에 넣다가 정전이 나도 다른 칸에는 직전 복사본이 온전히 남습니다.",
      "If the browser dies mid-drawing, do the last few minutes vanish? To avoid that, autosave writes the artwork’s state to a file on the device when editing pauses for 1.5 seconds, at every pen-up, and whenever the tab is left. Think of copying each finished manuscript page into a two-compartment drawer, alternating compartments. If the power fails while one compartment is being written, the other still holds the previous copy intact.",
    ),
    t(
      "기록은 두 단계입니다. ① 새 목록(manifest)을 지금 쓰지 않는 칸(A 또는 B)에 씁니다. ② 같은 칸의 head(최신 목록을 가리키는 표지)를 한 번에 교체해 쓰면 그 순간이 ‘커밋’입니다. 복구할 때는 두 head를 읽고 CRC32 검사가 맞는 것 중 번호(generation)가 가장 큰 쪽을 고릅니다. 여기에 ‘쓰기 권한 증표(writer epoch)’를 더해, 느려진 옛 탭이 새 탭의 기록을 덮어쓰는 일도 막습니다.",
      "A write has two phases. ① A new manifest is written into the compartment that is not in use (A or B). ② The head of that same compartment, a marker pointing at the newest manifest, is replaced in one atomic write, and that moment is the commit. On recovery both heads are read and the one with a valid CRC32 and the highest generation number wins. A writer epoch, a token proving who may write, also stops a slow old tab from overwriting a newer tab’s records.",
    ),
    t(
      "브라우저에는 파일 하나를 통째로 안전하게 바꾸는 기능(createWritable)은 있지만 여러 파일을 한꺼번에 바꾸는 트랜잭션은 없습니다. 그래서 내용(manifest)과 커밋 표시(head)를 나누고, head 한 번의 교체에만 의존합니다. 데이터베이스의 WAL이나 파일시스템 저널이 풀어 온 문제와 같은 계열의 해법입니다. 검색용 데이터는 SQLite가, 큰 작품 상태는 이 파일 저널이 나누어 맡습니다.",
      "Browsers can replace a single file safely (createWritable) but have no transaction across several files. So the content (manifest) and the commit marker (head) are separate, and everything hinges on one atomic head write. It is the same family of solutions that database WALs and file-system journals use. Searchable data goes to SQLite, while the large artwork state goes to this file journal.",
    ),
    t(
      "한계: 저널은 OPFS(브라우저 저장소) 안에 있어서 사이트 데이터를 지우거나 기기를 잃으면 함께 사라집니다. 또 서버에 올라가는 저장(편집이 45초 멈춘 뒤 시도)과는 별개의 기록이라, ‘이 기기에 저장됨’이 ‘서버에 저장됨’은 아닙니다. 쓰기는 Worker가 아니라 페이지에서 일어나고, 여러 탭이 동시에 쓰지 못하게 문서별 Web Lock을 함께 씁니다.",
      "Limits: the journal lives in OPFS, so clearing site data or losing the device takes it along. It is also separate from the server save (attempted 45 seconds after editing stops), so ‘saved on this device’ does not mean ‘saved on the server’. Writes happen on the page, not in a Worker, and a per-document Web Lock keeps two tabs from writing at once.",
    ),
  ],
  keyPoints: [
    t("manifest를 쉬는 칸에 쓰고, head 교체가 커밋 지점", "Manifest goes to the idle slot; the head write is the commit"),
    t("복구는 CRC가 맞는 가장 큰 generation을 고름", "Recovery picks the highest generation with a valid CRC"),
    t("OPFS가 실패하면 SQLite로, 둘 다 실패하면 ‘메모리뿐’이라고 알림", "If OPFS fails use SQLite; if both fail, say it is memory only"),
  ],
  diagram: {
    id: "autosave-crash-recovery-journal-diagram",
    kind: "sequence",
    title: t("기록하고, 끊기고, 복구하기", "Write, crash, recover"),
    caption: t(
      "먼저 쉬는 칸에 내용을 쓰고 마지막에 head를 바꾸므로, 어느 순간 끊겨도 직전 상태가 남습니다.",
      "Content goes to the idle slot first and the head changes last, so a cut at any moment leaves the previous state.",
    ),
    alt: t(
      "편집기가 체크포인트를 요청하면 복구 저널이 쉬는 칸에 manifest를 쓰고 같은 칸의 head를 원자적으로 교체해 커밋합니다. 편집기는 SQLite에 보조 사본을 쓰고, 둘 다 실패하면 상태 레일에 알립니다. 새로고침 뒤에는 두 head를 검사해 가장 큰 generation을 고르고 마지막 획까지 복원합니다.",
      "The editor asks for a checkpoint; the recovery journal writes the manifest into the idle slot and commits by atomically replacing that slot’s head. The editor also writes a secondary copy to SQLite and tells the status rail if both fail. After a reload both heads are checked, the highest generation is chosen and the drawing is restored up to the last stroke.",
    ),
    actors: [
      { id: "editor", label: t("편집기(페이지)", "Editor (page)"), tone: "local" },
      { id: "journal", label: t("OPFS 복구 저널", "OPFS recovery journal"), sub: t("manifest A/B · head A/B", "manifest A/B, head A/B"), tone: "local" },
      { id: "sqlite", label: t("SQLite 미러", "SQLite mirror"), sub: t("Worker 소유", "Worker-owned"), tone: "local" },
      { id: "rail", label: t("상태 레일", "Status rail"), sub: t("사용자에게 보이는 고지", "User-visible notices"), tone: "warn" },
    ],
    messages: [
      { from: "editor", to: "journal", label: t("체크포인트 기록 요청", "Request a checkpoint"), note: t("1.5초 멈춤 · 펜 뗌 · 탭 떠남", "1.5 s idle, pen-up, tab left") },
      { from: "journal", to: "journal", label: t("① manifest를 쉬는 칸에", "① manifest to the idle slot"), note: t("끊겨도 반대 칸은 온전", "If cut here, the other slot is intact") },
      { from: "journal", to: "journal", label: t("② 같은 칸 head를 원자 교체", "② atomically replace that head"), note: t("이 쓰기가 커밋 지점", "This write is the commit point") },
      { from: "journal", to: "editor", label: t("영수증(순번) 반환", "Return a receipt (sequence)"), style: "dashed" },
      { from: "editor", to: "sqlite", label: t("보조 사본을 SQLite에", "Secondary copy to SQLite"), note: t("실패해도 저장 성공은 유지", "A failure does not demote the save") },
      { from: "editor", to: "rail", label: t("둘 다 실패하면 ‘메모리뿐’ 고지", "If both fail: ‘memory only’"), style: "dashed", note: t("성공으로 속이거나 KV로 대체하지 않음", "Never faked as saved or swapped to KV") },
      { from: "editor", to: "journal", label: t("새로고침 뒤 복구 스캔", "Recovery scan after reload"), note: t("두 head의 CRC32 검사", "CRC32 check of both heads") },
      { from: "journal", to: "editor", label: t("가장 큰 generation 선택", "Highest generation wins"), style: "dashed", note: t("둘 다 깨졌을 때만 오류", "Error only if both are damaged") },
      { from: "editor", to: "editor", label: t("복구 배너로 마지막 획 복원", "Restore the last stroke via banner") },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 · 자동저장과 복구 배너", "Studio · autosave and recovery banner"),
      role: t(
        "편집이 1.5초 멈추거나 펜을 뗄 때, 탭을 떠날 때 작품 상태를 저널에 체크포인트로 기록하고 다시 열면 복구를 제안합니다.",
        "Records a checkpoint when editing pauses for 1.5 s, at pen-up and when the tab is left, and offers recovery on the next open.",
      ),
      paths: [`${CREATOR}/StudioCuttoonEditorHost.tsx`, `${CREATOR}/studio-autosave-opfs-session.ts#persistStudioAutosaveWithOpfsPrimary`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 복구 저널 엔진", "Studio · recovery journal engine"),
      role: t(
        "A/B 슬롯 manifest, head 커밋, 쓰기 증표(lease)로 크래시와 동시 쓰기를 견디는 파일 저널입니다.",
        "A file journal with A/B manifests, head commits and a writer lease that withstands crashes and concurrent writes.",
      ),
      paths: [`${CREATOR}/studio-opfs-recovery-journal.ts#StudioOpfsRecoveryJournal`, `${CREATOR}/studio-opfs-recovery-runtime.ts`],
    },
    {
      feature: t("스튜디오 · 실행 취소 이력", "Studio · undo history"),
      role: t(
        "되돌리기 이력도 같은 방식의 저널(최대 128개 항목·64 MiB)에 남겨 새로고침 뒤에도 이어 쓸 수 있게 합니다.",
        "Undo history is kept in a journal of the same kind (up to 128 entries, 64 MiB) so it survives a reload.",
      ),
      paths: [`${CREATOR}/studio-pages-history-durable-runtime.ts`],
      route: "/studio",
    },
    {
      feature: t("품질 게이트 · 실브라우저 복구 검증", "Quality gate · real-browser recovery check"),
      role: t(
        "체크포인트 → 새로고침 → 복구, 삭제 표지(tombstone)까지 실제 브라우저로 확인하는 검증 스크립트입니다.",
        "A script that checks checkpoint, reload, recovery and the delete tombstone in a real browser.",
      ),
      paths: ["scripts/verify-studio-autosave-opfs-session.mts"],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("A/B 슬롯 커밋과 복구 선택", "A/B slot commit and recovery choice"),
      language: "ts",
      ...sampleLines([
        'type Slot = "a" | "b";',
        "interface Head { slot: Slot; generation: number; manifestCrc: number }",
        "type Write = (path: string, bytes: Uint8Array) => Promise<void>;",
        "",
        "export async function commit(",
        "  write: Write, generation: number, manifest: Uint8Array, crc: (bytes: Uint8Array) => number,",
        "): Promise<Head> {",
        "  const next = generation + 1;",
        ['  const slot: Slot = next % 2 === 1 ? "a" : "b"; // 쉬는 칸만 덮어쓴다', '  const slot: Slot = next % 2 === 1 ? "a" : "b"; // only the idle slot is overwritten'],
        ['  await write("manifest-" + slot + ".bin", manifest); // 1단계: 여기서 끊겨도 반대 칸은 온전', '  await write("manifest-" + slot + ".bin", manifest); // phase 1: a cut here leaves the other slot intact'],
        "  const head: Head = { slot, generation: next, manifestCrc: crc(manifest) };",
        ['  await write("head-" + slot + ".bin", new TextEncoder().encode(JSON.stringify(head))); // 2단계 = 커밋', '  await write("head-" + slot + ".bin", new TextEncoder().encode(JSON.stringify(head))); // phase 2 = commit'],
        "  return head;",
        "}",
        "",
        ["// 복구: CRC 검사를 통과한 head 중 generation이 가장 큰 쪽을 고른다.", "// Recovery: among heads that passed the CRC check, take the highest generation."],
        "export const pick = (validHeads: Head[]): Head | undefined =>",
        "  [...validHeads].sort((x, y) => y.generation - x.generation)[0];",
      ]),
      explain: t(
        "generation이 홀수면 A, 짝수면 B에 씁니다. 목록(manifest)을 먼저 쓰고 head를 나중에 쓰므로, head가 바뀌기 전에 끊기면 이전 head가 가리키는 이전 상태가 그대로 유효합니다.",
        "Odd generations go to slot A, even ones to B. The manifest is written first and the head last, so a cut before the head changes leaves the previous head, and thus the previous state, valid.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("권위 순서: OPFS 저널 → SQLite → 고지", "Authority order: OPFS journal, SQLite, then notice"),
      language: "ts",
      source: `${CREATOR}/studio-autosave-opfs-session.ts`,
      ...sampleLines([
        'interface Receipt { authority: "opfs-journal" | "sqlite-fallback"; savedAt: string }',
        "type Write = (payload: string) => Promise<Receipt>;",
        ["class DocumentBusyError extends Error {} // 다른 탭이 이 문서의 저자", "class DocumentBusyError extends Error {} // another tab is the author"],
        ["class DurabilityError extends Error {} // 기기 안에 남기지 못함", "class DurabilityError extends Error {} // nothing could be kept on the device"],
        "",
        "export async function persist(opfs: Write | null, sqlite: Write | null, payload: string): Promise<Receipt> {",
        "  let failure: unknown = null;",
        "  if (opfs) {",
        "    try {",
        ["      const receipt = await opfs(payload); // 1순위: OPFS 복구 저널", "      const receipt = await opfs(payload); // first choice: the OPFS journal"],
        ["      await sqlite?.(payload).catch(() => undefined); // 미러 실패는 성공을 강등시키지 않는다", "      await sqlite?.(payload).catch(() => undefined); // a mirror failure does not demote the save"],
        "      return receipt;",
        "    } catch (cause) {",
        ["      if (cause instanceof DocumentBusyError) throw cause; // 저자가 따로 있으면 SQLite로 우회하지 않는다(포크 방지)", "      if (cause instanceof DocumentBusyError) throw cause; // another author: do not detour to SQLite (no fork)"],
        "      failure = cause;",
        "    }",
        "  }",
        "  if (sqlite) {",
        ["    try { return await sqlite(payload); } catch (cause) { failure = cause; } // 2순위", "    try { return await sqlite(payload); } catch (cause) { failure = cause; } // second choice"],
        "  }",
        ['  throw new DurabilityError("memory only", { cause: failure }); // 메모리뿐임을 숨기지 않고 알린다', '  throw new DurabilityError("memory only", { cause: failure }); // say so instead of hiding it'],
        "}",
      ]),
      explain: t(
        "저장은 OPFS 저널이 1순위이고 SQLite는 보조 사본입니다. 다른 탭이 저자인 경우는 실패가 아니라 ‘바쁨’이라 우회하지 않고, 둘 다 실패하면 저장된 척하지 않고 오류로 알려 상태 레일에 고지합니다.",
        "The OPFS journal is the first authority and SQLite the secondary copy. ‘Another tab is the author’ is not a failure, so it is never routed around; if both fail the function throws instead of pretending, and the status rail announces it.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "MDN · FileSystemFileHandle.createWritable()", url: "https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable", kind: "docs", note: t("스왑 파일에 쓰고 close()에서 교체", "Writes to a swap file and swaps on close()") },
    { title: "MDN · Origin private file system", url: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system", kind: "docs" },
    { title: "SQLite · Write-Ahead Logging", url: "https://www.sqlite.org/wal.html", kind: "docs", note: t("‘먼저 기록하고 나중에 반영’ 개념 비교", "The ‘log first, apply later’ idea for comparison") },
    { title: "Chrome · Page Lifecycle API", url: "https://developer.chrome.com/docs/web-platform/page-lifecycle-api", kind: "guide", note: t("pagehide·visibilitychange 에서 저장하는 이유", "Why to save on pagehide and visibilitychange") },
    { title: "MDN · Web Locks API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API", kind: "docs" },
  ],
  chapterIds: ["storage", "browser-local-compute"],
  talk: {
    pitch: t(
      "그리다가 브라우저가 꺼져도 마지막 획까지 돌아오게 하려고, 작품 상태를 기기 안 파일에 두 칸짜리 서랍처럼 번갈아 기록합니다. 새 내용을 먼저 비어 있는 칸에 쓰고, 마지막에 ‘여기가 최신’이라는 표지를 한 번에 바꿉니다. 중간에 끊겨도 반대 칸은 온전합니다. 다만 이것은 이 기기 안의 안전망이고 서버 저장이나 백업이 아니라서, 내보내기와 개인 클라우드 백업을 함께 안내합니다.",
      "So that a crash mid-drawing still returns the last stroke, the artwork’s state is written to a file on the device, alternating between two compartments like a two-slot drawer. New content goes to the empty slot first, and a ‘this is the newest’ marker is switched last, in one step. A cut in between leaves the other slot intact. It is a safety net on this device, not a server save or a backup, so export and personal-cloud backup are offered too.",
    ),
    analogy: t(
      "일기장에 새 쪽을 연필로 먼저 쓰고, 마지막에 책갈피를 옮겨 ‘여기까지가 완성본’이라고 표시하는 방식입니다. 책갈피를 옮기기 전에 끊겨도 이전 책갈피 위치까지는 멀쩡합니다.",
      "Like writing a new diary page in pencil and only then moving the bookmark to mark ‘finished up to here’. If you are interrupted before moving it, everything up to the old bookmark is still fine.",
    ),
    questions: [
      {
        question: t("beforeunload만으로는 안 되나요?", "Is beforeunload not enough?"),
        answer: t(
          "탭 강제 종료나 브라우저 크래시, 모바일 백그라운드 전환에서는 그 이벤트가 오지 않을 수 있습니다. 그래서 편집이 멈추거나 펜을 뗄 때마다 미리 기록하고 pagehide·visibilitychange 때도 저장합니다. beforeunload는 미저장 편집이 처음 생긴 뒤에만 붙여 뒤로가기 캐시(bfcache)를 잃지 않게 합니다.",
          "Forced tab closes, browser crashes and mobile backgrounding may never deliver that event. So it writes ahead at every pause and pen-up and also on pagehide and visibilitychange. beforeunload is attached only after unsaved edits first appear, so the back-forward cache (bfcache) is not lost.",
        ),
      },
      {
        question: t("저장이 실패하면요?", "What if saving fails?"),
        answer: t(
          "OPFS 저널이 실패하면 SQLite 단독 저장으로 넘어가고, 둘 다 실패하면 ‘메모리에만 있다’고 상태 레일에 알립니다. 브라우저 KV로 몰래 대체하거나 저장 성공으로 표시하지 않습니다.",
          "If the OPFS journal fails it falls back to SQLite alone, and if both fail the status rail says the work exists only in memory. It never silently swaps to browser KV or reports success.",
        ),
      },
      {
        question: t("서버 저장과는 어떤 관계인가요?", "How does it relate to the server save?"),
        answer: t(
          "별개입니다. 기기 복구 체크포인트는 1.5초, 서버 revision은 편집이 45초 멈춘 뒤 시도합니다. 둘을 하나의 ‘영수증’으로 묶는 설계(ADR-0023)는 제안(Proposed) 단계라 아직 구현이 아닙니다.",
          "They are separate. The device checkpoint fires after 1.5 s, the server revision is attempted after 45 s of idle. A design that merges both into one ‘receipt’ (ADR-0023) is only Proposed and not implemented yet.",
        ),
      },
    ],
    pitfall: t(
      "‘Worker로 보내 OPFS에 기록한다’는 단순화는 부정확합니다. 자동저장 쓰기는 페이지에서 일어나고 Worker는 SQLite만 소유합니다. 또 이 저널은 기기 안 안전망이지 백업이 아닙니다. 사이트 데이터 삭제나 기기 분실에는 함께 사라집니다. 실브라우저 검증(pnpm verify:studio-autosave-opfs)은 야간·수동 워크플로에 연결돼 있고 PR마다 도는 검사는 아닙니다.",
      "‘It is sent to a Worker and written to OPFS’ is a simplification that is not accurate: autosave writes happen on the page, and the Worker owns only SQLite. The journal is a safety net on the device, not a backup, and disappears with site data or the device. The real-browser check (pnpm verify:studio-autosave-opfs) is wired to the nightly and manual workflow, not to every pull request.",
    ),
  },
  technologies: ["OPFS", "Web Locks", "SQLite WASM"],
  facts: [
    { value: "1,500 ms", label: t("편집이 멈춘 뒤 체크포인트까지의 지연", "Delay from the last edit to a checkpoint"), source: `${CREATOR}/StudioCuttoonEditorHost.tsx` },
    { value: "30,000 ms", label: t("쓰기 증표(writer lease) 유효 시간", "Writer lease lifetime"), source: `${CREATOR}/studio-opfs-recovery-journal.ts` },
    { value: "256 MiB · 1 GiB", label: t("자동저장 항목 하나 · 저널 전체 상한", "Autosave entry limit · whole journal limit"), source: `${CREATOR}/studio-autosave-opfs-session.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const WEB_LOCKS_BROADCASTCHANNEL_SINGLE_AUTHOR: EngineeringAtlasEntry = {
  id: "web-locks-broadcastchannel-single-author",
  category: "local-first",
  name: "Web Locks",
  title: t("탭이 둘이어도 문서의 저자는 한 명", "Two tabs, one author per document"),
  status: "live",
  tagline: t(
    "먼저 연 탭만 편집·저장하고, 그 탭이 닫히면 기다리던 탭이 이어받습니다.",
    "Only the first tab edits and saves; when it closes, a waiting tab takes over.",
  ),
  background: [
    t(
      "같은 원고를 탭 두 개로 열어 두고 양쪽에서 그리면, 나중에 저장한 탭이 다른 탭의 작업을 덮어 지울 수 있습니다. 탭마다 따로 도는 프로그램이라 서로의 존재를 모르기 때문입니다. 그래서 ‘문서의 저자는 한 번에 한 명’이라는 규칙을 브라우저가 보증하는 번호표(Web Locks)로 지킵니다. 먼저 번호표를 잡은 탭이 저장을 맡고, 나머지는 그릴 수는 있지만 저장은 안 됩니다.",
      "If the same manuscript is open in two tabs and both draw, the tab that saves later can wipe out the other’s work, because each tab is a separate program that does not know the other exists. So the rule ‘one author per document at a time’ is enforced with a ticket the browser itself guarantees (Web Locks). The tab that grabbed the ticket first does the saving; the others can still draw but their work is not saved.",
    ),
    t(
      "락은 세 층입니다. ① DB 소유 락: SQLite를 여는 Worker가 탭 수명 동안 하나만 잡습니다. ② 문서 리더 락: 원고마다 하나이고, 이름은 작품 ID가 드러나지 않게 SHA-256 앞 48자로 만듭니다. ③ 저널 락: 파일에 기록하는 짧은 순간에만 잡습니다. 락을 항상 ‘문서 → 저널’ 순서로 잡으니 서로 기다리다 멈추는 교착이 생기지 않습니다. 탭이 닫히거나 죽으면 브라우저가 락을 자동으로 풀어 줍니다.",
      "There are three layers of locks. ① The database lock: the Worker that opens SQLite holds one for the tab’s lifetime. ② The document leader lock: one per manuscript, named with the first 48 characters of a SHA-256 so the work ID is not exposed. ③ The journal lock: held only for the short moment of writing a file. Locks are always taken in the order document, then journal, so two tabs cannot wait on each other forever (deadlock). When a tab closes or crashes, the browser releases its locks by itself.",
    ),
    t(
      "일반적으로 localStorage에 ‘내가 리더’ 시각을 적는 방식은 시계 오차와 경쟁에, BroadcastChannel 메시지로 뽑는 방식은 메시지가 유실되면 리더가 둘이 되는 문제에 취약합니다. ToonStudio는 소유권을 브라우저가 보장하는 Web Locks로 리더를 뽑고, BroadcastChannel은 ‘작업공간이 바뀌었다’, ‘이 창이 열려 있다’ 같은 알림에만 씁니다. 채널이 없으면 storage 이벤트로, 둘 다 없으면 고립 모드로 내려갑니다.",
      "In general, writing an ‘I am the leader’ timestamp to localStorage suffers from clock skew and races, and electing over BroadcastChannel messages can end with two leaders if a message is lost. ToonStudio elects the leader with Web Locks, where the browser guarantees ownership, and uses BroadcastChannel only for notices such as ‘the workspace changed’ or ‘this window is open’. Without the channel it falls back to storage events, and without those to an isolated mode.",
    ),
    t(
      "한계: 락은 ‘협조적’이라 락을 확인하지 않는 코드는 막지 못하고, 다른 브라우저나 다른 기기는 조율하지 못합니다. 그 경계는 서버 저장(revision)과 공동 편집(CRDT)이 맡습니다. Web Locks가 없는 환경에서는 그 탭을 리더로 취급하되 OPFS 쓰기 증표가 실제 쓰기를 막고, 복구 저널은 원본(origin) 락이 없으면 아예 쓰지 않도록 닫아 둡니다.",
      "Limits: locks are cooperative, so code that does not check them is not stopped, and other browsers or devices are not coordinated. That boundary belongs to the server save (revisions) and co-editing (CRDT). Where Web Locks is missing, the tab is treated as the leader but the OPFS writer lease still guards the actual writes, and the recovery journal refuses to run at all without an origin lock.",
    ),
  ],
  keyPoints: [
    t("먼저 연 탭이 리더, 다른 탭은 저장 안 되는 팔로워", "The first tab leads; other tabs follow without saving"),
    t("리더를 밀어내지 않고, 리더가 놓을 때만 승계", "Never preempt a live leader; take over only when it lets go"),
    t("락 순서는 항상 문서 → 저널(교착 방지)", "Lock order is always document, then journal (no deadlock)"),
    t("BroadcastChannel은 선출이 아니라 알림용", "BroadcastChannel carries notices, not the election"),
  ],
  diagram: {
    id: "web-locks-broadcastchannel-single-author-diagram",
    kind: "sequence",
    title: t("두 탭이 한 문서를 열 때", "Two tabs open one document"),
    caption: t(
      "락은 먼저 잡은 탭이 쥐고, 그 탭이 사라질 때만 대기하던 탭에게 넘어갑니다.",
      "The lock stays with the tab that took it first and passes to a waiting tab only when that tab is gone.",
    ),
    alt: t(
      "탭 A가 문서 락을 요청해 리더가 됩니다. 탭 B가 같은 락을 요청하면 거절되어 팔로워가 되고, 대기 요청을 줄 세웁니다. 탭 A가 닫히면 브라우저가 락을 풀고 탭 B가 승계해 복구 저널의 쓰기 증표를 얻습니다.",
      "Tab A requests the document lock and becomes the leader. Tab B requests the same lock, is refused, becomes a follower and queues a waiting request. When tab A closes, the browser releases the lock and tab B takes over and obtains the journal’s writer lease.",
    ),
    actors: [
      { id: "tabA", label: t("탭 A (먼저 연 탭)", "Tab A (first)"), tone: "local" },
      { id: "locks", label: t("Web Locks", "Web Locks"), sub: t("브라우저가 보증", "Browser-enforced"), tone: "edge" },
      { id: "tabB", label: t("탭 B (나중 탭)", "Tab B (later)"), tone: "local" },
      { id: "journal", label: t("OPFS 복구 저널", "OPFS recovery journal"), tone: "local" },
    ],
    messages: [
      { from: "tabA", to: "locks", label: t("문서 락 요청(ifAvailable)", "Request document lock"), note: t("이름 = 접두사 + SHA-256 앞 48자", "Name = prefix + first 48 hex of SHA-256") },
      { from: "locks", to: "tabA", label: t("허가: 리더가 됨", "Granted: becomes leader"), style: "dashed", note: t("탭이 닫힐 때까지 락 유지", "Held until the tab goes away") },
      { from: "tabA", to: "journal", label: t("편집·저장 허용", "Editing and saving allowed") },
      { from: "tabB", to: "locks", label: t("같은 락 요청(ifAvailable)", "Request the same lock") },
      { from: "locks", to: "tabB", label: t("거절: 팔로워가 됨", "Refused: becomes follower"), style: "dashed", note: t("그릴 수 있음 · 저장 안 됨 안내", "Can draw, with a ‘not saved’ notice") },
      { from: "tabB", to: "locks", label: t("대기 요청을 줄 세움", "Queue a waiting request"), note: t("리더를 밀어내지 않음", "Does not preempt the leader") },
      { from: "tabA", to: "tabA", label: t("탭 닫기 또는 크래시", "Tab closes or crashes"), note: t("브라우저가 락을 자동 해제", "The browser releases the lock") },
      { from: "locks", to: "tabB", label: t("승계 허가", "Takeover granted"), style: "dashed" },
      { from: "tabB", to: "journal", label: t("쓰기 증표(lease) 획득", "Obtain the writer lease"), note: t("락 순서: 문서 → 저널", "Lock order: document, then journal") },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 · 같은 원고를 두 탭으로 열었을 때", "Studio · the same manuscript in two tabs"),
      role: t(
        "먼저 연 탭이 리더(저자)가 되고 다른 탭은 그릴 수는 있어도 저장은 안 되는 상태로 물러납니다. 리더 탭이 닫히면 대기하던 탭이 승계합니다.",
        "The first tab becomes the leader (author) and the others step back to a state where they can draw but nothing is saved. When the leader closes, a waiting tab takes over.",
      ),
      paths: [`${CREATOR}/studio-autosave-document-leader.ts`, `${CREATOR}/studio-autosave-opfs-session.ts#openStudioAutosaveDocumentSession`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 로컬 DB 소유권", "Studio · local database ownership"),
      role: t(
        "SQLite를 여는 Worker가 탭 수명 동안 락 하나를 쥐고, 보조 탭은 세션 메모리로 물러납니다.",
        "The Worker that opens SQLite holds one lock for the tab’s lifetime; secondary tabs fall back to session memory.",
      ),
      paths: [`${CREATOR}/studio-local-database-worker-lock.ts`, `${CREATOR}/studio-local-database-worker-handoff.ts`, `${CREATOR}/studio-local-database-ownership.ts`],
    },
    {
      feature: t("스튜디오 · 여러 창의 작업공간 알림", "Studio · workspace notices across windows"),
      role: t(
        "BroadcastChannel로 ‘작업공간이 바뀌었다’는 신호와 창 존재(15초 하트비트)를 알리고, 채널이 없으면 storage 이벤트로 내려갑니다.",
        "Sends ‘workspace changed’ signals and window presence (15 s heartbeat) over BroadcastChannel, falling back to storage events without it.",
      ),
      paths: [`${CREATOR}/studio-workspace-sqlite-runtime.ts`, `${CREATOR}/studio-document-window-coordination.ts`],
    },
    {
      feature: t("복구 저널 · 쓰기 구간", "Recovery journal · the write section"),
      role: t(
        "저널 파일에 기록하는 짧은 순간에만 toonstudio-opfs-recovery:<문서> 락을 잡아 쓰기를 한 줄로 세웁니다.",
        "Takes the toonstudio-opfs-recovery:<document> lock only for the short moment of writing, which lines the writes up.",
      ),
      paths: [`${CREATOR}/studio-opfs-recovery-journal.ts`],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("첫 탭만 리더가 된다", "Only the first tab becomes the leader"),
      language: "ts",
      ...sampleLines([
        ["/** 같은 문서를 연 첫 탭만 리더(쓰기 권한). 탭이 닫히면 브라우저가 락을 자동 해제한다. */", "/** Only the first tab on a document leads (write access). The browser frees the lock when the tab closes. */"],
        "export function becomeLeader(documentKey: string): Promise<boolean> {",
        "  return new Promise((resolve) => {",
        '    void navigator.locks.request("autosave:" + documentKey, { ifAvailable: true }, (lock) => {',
        ["      resolve(lock !== null); // null이면 이미 다른 탭이 리더 → 이 탭은 팔로워(저장 안 됨)", "      resolve(lock !== null); // null means another tab leads, so this one follows (not saved)"],
        ["      // 끝나지 않는 Promise를 돌려주면 탭 수명 동안 락이 유지된다.", "      // Returning a Promise that never settles keeps the lock for the tab's lifetime."],
        "      return lock === null ? undefined : new Promise<void>(() => undefined);",
        "    });",
        "  });",
        "}",
      ]),
      explain: t(
        "ifAvailable: true는 ‘비어 있을 때만 주세요’라는 뜻입니다. 락을 받으면(lock이 null이 아님) 콜백이 끝나지 않는 Promise를 돌려주어 탭이 살아 있는 동안 락을 계속 쥡니다. 실제 코드는 여기에 같은 탭의 중복 요청을 합치는 참조 카운트가 더해집니다.",
        "ifAvailable: true means ‘only give it to me if it is free’. On success (lock is not null) the callback returns a Promise that never settles, so the lock is kept while the tab lives. The real code adds reference counting so repeated requests from one tab are merged.",
      ),
      verify: "types",
    },
    {
      kind: "teaching",
      title: t("팔로워는 줄을 서서 승계한다", "A follower queues up and takes over"),
      language: "ts",
      ...sampleLines([
        ["/** 팔로워: 리더를 밀어내지 않고 줄을 서서, 리더가 락을 놓을 때만 승계한다. */", "/** Follower: does not push the leader out; queues and takes over only when the lock is released. */"],
        "export function waitToTakeOver(documentKey: string, onPromote: () => void): () => void {",
        "  const abort = new AbortController();",
        "  void navigator.locks",
        '    .request("autosave:" + documentKey, { mode: "exclusive", signal: abort.signal }, () => {',
        ["      onPromote(); // 리더 탭이 닫히거나 크래시한 뒤에만 여기에 도착한다", "      onPromote(); // reached only after the leader tab closed or crashed"],
        ["      return new Promise<void>(() => undefined); // 이제 이 탭이 락을 쥔다", "      return new Promise<void>(() => undefined); // this tab now holds the lock"],
        "    })",
        ["    .catch(() => undefined); // abort 되면 AbortError — 대기 취소", "    .catch(() => undefined); // an abort raises AbortError: the wait is cancelled"],
        "  return () => abort.abort();",
        "}",
      ]),
      explain: t(
        "기다리는 요청은 ifAvailable 없이 줄에 서고, AbortController로 언제든 취소할 수 있습니다. 라이브 리더를 선점하지 않는 이유는 리더 탭에 아직 저장되지 않은 작업이 있을 수 있기 때문입니다.",
        "A waiting request queues without ifAvailable and can be cancelled any time with an AbortController. A live leader is not preempted because it may still hold unsaved work.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "MDN · Web Locks API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API", kind: "docs" },
    { title: "MDN · LockManager.request()", url: "https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request", kind: "docs", note: t("ifAvailable·signal 옵션", "The ifAvailable and signal options") },
    { title: "W3C · Web Locks API", url: "https://w3c.github.io/web-locks/", kind: "spec" },
    { title: "MDN · Broadcast Channel API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API", kind: "docs", note: t("같은 사이트의 창끼리 보내는 알림", "Notices between same-site windows") },
  ],
  chapterIds: ["storage", "browser-local-compute"],
  talk: {
    pitch: t(
      "같은 원고를 탭 두 개로 열면 한쪽 저장이 다른 쪽을 덮어쓸 수 있습니다. 그래서 ‘문서의 저자는 한 번에 한 명’이라는 규칙을 브라우저가 보증하는 번호표, Web Locks로 지킵니다. 먼저 연 탭이 번호표를 쥐고 편집하고, 다른 탭은 저장 없이 그리다가 먼저 연 탭이 닫히면 이어받습니다. 탭이 죽으면 브라우저가 번호표를 거두니 만료를 청소하는 코드도 필요 없습니다.",
      "With the same manuscript open in two tabs, one tab’s save can overwrite the other’s. So the rule ‘one author per document at a time’ is kept with Web Locks, a ticket the browser guarantees. The tab opened first holds the ticket and edits; the other draws without saving and takes over when the first closes. If a tab dies the browser takes the ticket back, so no expiry-cleanup code is needed.",
    ),
    analogy: t(
      "공용 회의실에 열쇠가 단 하나뿐입니다. 열쇠를 가진 사람만 화이트보드에 쓸 수 있고 나머지는 문 앞에서 줄을 섭니다. 열쇠 주인이 건물을 나가면 열쇠는 자동으로 회수됩니다.",
      "A shared meeting room has exactly one key. Only the key holder writes on the whiteboard while everyone else queues at the door. When the holder leaves the building, the key is returned automatically.",
    ),
    questions: [
      {
        question: t("리더 탭이 먹통이 되면 어떻게 되나요?", "What if the leader tab freezes?"),
        answer: t(
          "팔로워는 살아 있는 리더를 밀어내지 않습니다. 리더에게 아직 저장되지 않은 작업이 있을 수 있기 때문입니다. 리더가 닫히거나 크래시로 사라진 뒤에만 승계합니다.",
          "Followers never push out a live leader, because it may hold unsaved work. They take over only after the leader has closed or crashed away.",
        ),
      },
      {
        question: t("Web Locks를 지원하지 않는 환경은요?", "What about environments without Web Locks?"),
        answer: t(
          "그 탭을 리더로 취급하되 OPFS 쓰기 증표가 실제 쓰기를 막습니다. 복구 저널 백엔드를 고르는 함수는 원본(origin) 락이 없으면 저널을 쓰지 않고 안전하게 닫는(fail-closed) 쪽으로 판단합니다.",
          "The tab is treated as the leader while the OPFS writer lease guards real writes. The function that picks the recovery journal backend fails closed when no origin lock is available.",
        ),
      },
      {
        question: t("다른 브라우저나 다른 기기에서 열면요?", "And another browser or device?"),
        answer: t(
          "Web Locks는 같은 브라우저 프로필의 같은 사이트 안에서만 조율합니다. 그 바깥의 충돌은 서버 저장(revision 비교)과 공동 편집(CRDT)이 다룹니다.",
          "Web Locks coordinate only within the same site in one browser profile. Conflicts beyond that are handled by the server save (revision checks) and co-editing (CRDT).",
        ),
      },
    ],
    pitfall: t(
      "BroadcastChannel로 리더를 뽑는다고 말하지 마세요. 선출은 Web Locks가 하고 BroadcastChannel은 알림에만 씁니다. 락은 협조적이라 락을 확인하지 않는 코드는 막지 못합니다. 두 탭 실브라우저 검증(pnpm verify:studio-autosave-two-tab)은 야간·수동 워크플로에 연결돼 있고 PR마다 도는 검사는 아닙니다.",
      "Do not say the leader is elected over BroadcastChannel: Web Locks elects, and BroadcastChannel only carries notices. Locks are cooperative, so code that ignores them is not stopped. The real-browser two-tab check (pnpm verify:studio-autosave-two-tab) is wired to the nightly and manual workflow, not to every pull request.",
    ),
  },
  technologies: ["Web Locks", "BroadcastChannel", "OPFS", "Dedicated Worker"],
  facts: [
    { value: "48", label: t("문서 락 이름에 쓰는 SHA-256 앞 글자 수", "Leading hex characters of the SHA-256 used in the document lock name"), source: `${CREATOR}/studio-autosave-document-leader.ts` },
    { value: "15초 · 180초 · 32개", label: t("창 존재 하트비트 · 피어 보존 시간 · 최대 피어 수", "Window presence heartbeat · peer retention · maximum peers"), source: `${CREATOR}/studio-document-window-coordination.ts` },
    { value: "750 ms", label: t("DB 락 핸드오프 대기 합계", "Total wait of the database lock handoff"), source: `${CREATOR}/studio-local-database-worker-handoff.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const ENGINEERING_ATLAS_LOCAL_FIRST_DB: readonly EngineeringAtlasEntry[] = [
  SQLITE_WASM_OPFS_SAH_POOL,
  AUTOSAVE_CRASH_RECOVERY_JOURNAL,
  WEB_LOCKS_BROADCASTCHANNEL_SINGLE_AUTHOR,
];
