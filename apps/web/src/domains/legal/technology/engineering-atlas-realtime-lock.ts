import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · realtime 카테고리 중 락 리비전 카드(번호표가 달린 편집 잠금).
 * 한 파일이 1,000줄을 넘지 않도록 engineering-atlas-realtime-collab.ts 에서 나눴고, 그쪽에서 이 배열을 이어 붙인다.
 * 모든 값은 2026-10-07 기준으로 코드·설정을 직접 열어 확인한 것이다.
 */
const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const LIVE = "apps/web/src/domains/creator/live";
const CREATOR_API = "apps/api/src/modules/creator";

export const ENGINEERING_ATLAS_REALTIME_LOCK: readonly EngineeringAtlasEntry[] = [
  // ───────────────────────────── 4. 락과 리비전 ─────────────────────────────
  {
    id: "crdt-lock-revision",
    category: "realtime",
    name: "Lock revision",
    title: t("번호표가 달린 편집 잠금", "Edit locks that carry a ticket number"),
    status: "live",
    tagline: t(
      "같은 레이어를 동시에 고치지 않게 하는 짧은 잠금에, 늦은 소식이 현재를 뒤집지 못하도록 번호를 붙입니다.",
      "Short edit locks get a number so late news cannot overturn the present.",
    ),
    background: [
      t(
        "두 사람이 같은 레이어를 동시에 고치면 서로의 작업을 덮어쓸 수 있어, 한 사람이 쓰는 동안은 '사용 중' 표시를 거는 짧은 잠금이 필요합니다. 은행 창구의 번호표와 같습니다. 번호가 있으면 '더 늦게 도착한 옛 소식'이 뒤늦게 와도 지금 상황을 뒤집지 못합니다. ToonStudio의 잠금은 임대(lease)라서 기본 15초(5~30초)면 만료되고, 계속 쓰면 갱신합니다.",
        "If two people edit the same layer at once, they can overwrite each other, so a short lock that marks a layer as in use is needed. It works like a bank's queue ticket: with numbers, an old message that arrives late cannot overturn the present. ToonStudio's lock is a lease that expires after 15 seconds by default (5 to 30) and is renewed while in use.",
      ),
      t(
        "작품마다 번호(revision)를 하나씩 올려 주는 시계가 DB에 있고, 락을 얻거나 갱신하거나 풀거나 만료될 때마다 번호가 1씩 올라갑니다. 서버는 작품별 PostgreSQL advisory lock 안에서 한 번에 하나의 판정만 하고(만료 정리, 충돌 검사, 획득), 시각은 앱 서버가 아니라 DB 시계를 씁니다. 브라우저는 이벤트마다 적용·무시·위험을 판정합니다. 스냅샷이나 자원별 최신 번호보다 낡은 이벤트는 무시하고, 순서를 믿을 수 없으면 조용히 쓰지 않고 방에 다시 들어가 상태를 새로 받습니다.",
        "The database holds a clock per work that raises a revision number by 1 whenever a lock is acquired, renewed, released or expired. The server judges one request at a time inside a per-work PostgreSQL advisory lock (clean up expired locks, check conflicts, acquire) and uses the database clock, not the app server's. The browser rules on each event as apply, ignore or unsafe: events older than the snapshot or the resource's latest number are ignored, and when order cannot be trusted it does not guess but rejoins the room to fetch fresh state.",
      ),
      t(
        "대안은 마지막에 저장한 쪽이 이기는 낙관적 방식입니다. 구현은 쉽지만 누가 쓰는지 보이지 않아 덮어쓰기가 뒤늦게 드러납니다. 임대 잠금은 소유자를 화면에 보여 주고 같은 영역을 동시에 고치는 일을 막습니다. 잠금은 CRDT를 대신하지 않고 함께 쓰는 보조 규칙입니다. 문서 병합은 CRDT가, '지금 누가 만지는가'라는 소유권은 잠금이 맡습니다. 분산 환경의 잠금은 시계 오차와 늦은 하트비트에 약해서 단조 증가 번호(펜싱 토큰)가 필요합니다.",
        "The alternative is optimistic last-write-wins: easy to build, but nobody can see who is editing, so overwrites surface late. A lease lock shows the owner on screen and keeps two people from editing the same area at once. The lock does not replace the CRDT; it complements it: the CRDT merges the document and the lock owns the question of who is touching something right now. Distributed locks are weak against clock skew and late heartbeats, which is why a monotonically increasing number (a fencing token) is needed.",
      ),
      t(
        "이 방식은 조율된 컷오버가 필요했습니다. 0017 마이그레이션은 락 테이블을 잠그고 최대 30초짜리 임대 행만 한 번 지우므로 열려 있던 편집기는 락을 다시 잡아야 하고, API를 모두 내린 뒤 직접 DB 연결로 적용합니다. 컷오버 기록이 없으면 부팅 점검이 API 시작을 막습니다. 작품당 락은 200개, 브라우저 원장의 자원 워터마크는 1,024개가 상한이며 넘으면 안전하지 않다고 판정합니다.",
        "This design needed a coordinated cutover. Migration 0017 locks the lock tables and deletes only the lease rows (at most 30 seconds long) once, so open editors must re-acquire their locks, and it is applied over a direct database connection after all API instances are stopped. Without a recorded cutover, the boot check refuses to start the API. A work holds at most 200 locks and the browser ledger tracks at most 1,024 resource watermarks, beyond which it rules the situation unsafe.",
      ),
    ],
    keyPoints: [
      t("작품마다 번호표(revision)가 1씩 올라가며 모든 락 변화에 붙습니다", "A per-work revision rises by 1 and is attached to every lock change"),
      t("브라우저는 이벤트마다 적용·무시·위험을 판정합니다", "The browser rules each event as apply, ignore or unsafe"),
      t("순서를 못 믿으면 조용히 쓰지 않고 다시 입장해 새로 받습니다", "When order is unclear it rejoins and refetches instead of guessing"),
      t("락은 CRDT 병합을 대신하지 않고 소유권만 맡는 보조 규칙입니다", "A lock complements the CRDT by owning only who is editing"),
    ],
    diagram: {
      id: "crdt-lock-revision-diagram",
      kind: "graph",
      title: t("락 변화에 번호를 붙이고 브라우저가 판정하는 길", "Numbering lock changes and the browser's ruling"),
      caption: t(
        "서버가 번호를 붙여 방 전체에 알리면, 브라우저는 번호를 비교해 적용하거나 버리고 불확실하면 다시 입장합니다.",
        "The server numbers and broadcasts each change; the browser compares numbers, applies or drops it, and rejoins when unsure.",
      ),
      alt: t(
        "락 요청은 작품별 직렬 처리를 거쳐 revision 시계에서 번호를 받고, 번호가 붙은 락 이벤트로 방 전체에 전달됩니다. 브라우저 원장이 번호를 비교해 새 소식이면 잠금 표시를 적용하고, 낡은 소식이면 버리며, 순서를 알 수 없으면 방에 다시 입장합니다.",
        "A lock request goes through per-work serialization and gets a number from the revision clock, then spreads to the room as a numbered lock event. The browser ledger compares numbers: newer news applies the lock indicator, older news is dropped, and unclear order triggers a rejoin.",
      ),
      nodes: [
        { id: "req", label: t("락 요청", "Lock request"), sub: t("레이어·요소 편집 시작", "Starting to edit"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "serial", label: t("작품별 직렬 처리", "Per-work queue"), sub: t("advisory lock 한 트랜잭션", "One advisory-lock transaction"), tone: "server", at: [1, 0] },
        { id: "clock", label: t("revision 시계", "Revision clock"), sub: t("작품마다 1씩 증가", "+1 per change, per work"), tone: "server", shape: "cylinder", at: [2, 0] },
        { id: "event", label: t("락 이벤트", "Lock event"), sub: t("획득·갱신·해제 + 번호", "Acquire, renew, release + number"), tone: "server", at: [3, 0] },
        { id: "ledger", label: t("브라우저 원장", "Browser ledger"), sub: t("자원별 워터마크", "A watermark per resource"), tone: "local", at: [4, 0] },
        { id: "judge", label: t("번호 판정", "Judge number"), sub: t("세 가지 결과", "3 outcomes"), tone: "local", shape: "diamond", at: [4, 1] },
        { id: "apply", label: t("잠금 표시 적용", "Show the lock"), sub: t("소유자 이름 표시", "Owner name shown"), tone: "good", at: [3, 1] },
        { id: "ignore", label: t("무시", "Ignore"), sub: t("낡은 소식은 버림", "Stale news dropped"), tone: "neutral", at: [5, 1] },
        { id: "rejoin", label: t("다시 입장", "Rejoin"), sub: t("순서를 못 믿으면 새로 받기", "Refetch when order is unclear"), tone: "warn", at: [4, 2] },
      ],
      edges: [
        { from: "req", to: "serial", label: t("요청", "Ask") },
        { from: "serial", to: "clock", label: t("번호 요청", "Number") },
        { from: "clock", to: "event", label: t("번호 부착", "Stamp") },
        { from: "event", to: "ledger", label: t("방 전체", "Room") },
        { from: "ledger", to: "judge", label: t("번호 비교", "Compare") },
        { from: "judge", to: "apply", label: t("새 소식", "Newer") },
        { from: "judge", to: "ignore", label: t("낡음", "Older") },
        { from: "judge", to: "rejoin", label: t("순서 불명", "Unclear") },
      ],
      groups: [
        { id: "server", label: t("서버", "Server"), tone: "server", nodeIds: ["serial", "clock", "event"] },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · 레이어 편집 잠금", "Shared workroom · layer edit locks"),
        role: t(
          "편집하려는 페이지·레이어·요소에 15초 안팎의 임대 잠금을 걸고, 다른 사람이 쓰는 영역에는 소유자를 보여 주며 편집을 막습니다.",
          "Takes a lease lock of about 15 seconds on the page, layer or element being edited and, for areas others hold, shows the owner and blocks editing.",
        ),
        paths: [`${LIVE}/studio-live-mutation-lock-coordinator.ts`, `${LIVE}/studio-live-layer-ownership.ts`],
        route: "/studio",
      },
      {
        feature: t("작업실 서버 · 락 판정과 번호 발급", "Workroom server · ruling on locks and issuing numbers"),
        role: t(
          "작품별 advisory lock 한 트랜잭션 안에서 만료 정리, 충돌 검사, 획득을 처리합니다. 만료 시각은 DB 시계로 판정하고 번호는 작품별 시계 행을 1씩 올립니다. 늦은 하트비트가 이미 풀린 임대를 되살리지 못하게 합니다.",
          "In one per-work advisory-lock transaction it clears expired locks, checks conflicts and acquires. Expiry is judged with the database clock and the number is raised by 1 in the per-work clock row. A late heartbeat cannot revive a lease that was already released.",
        ),
        paths: [`${CREATOR_API}/studio-live-lock.repository.ts#nextStudioLiveLockRevision`, `${CREATOR_API}/studio-live-gateway-handlers-lock-screen.ts#requestLock`],
      },
      {
        feature: t("공동 작업실 · 늦은 소식 걸러내기", "Shared workroom · filtering late news"),
        role: t(
          "락 이벤트마다 번호를 비교해 적용·무시·위험을 판정하고, 위험이면 조용히 적용하지 않고 전송 계층의 재입장 정책에 맡깁니다.",
          "Compares numbers on every lock event to rule apply, ignore or unsafe, and for unsafe leaves it to the transport's rejoin policy instead of applying silently.",
        ),
        paths: [`${LIVE}/studio-live-lock-revision-ledger.ts#acceptStudioLiveLockRevision`],
      },
      {
        feature: t("배포 · 조율된 컷오버", "Deployment · coordinated cutover"),
        role: t(
          "0017 마이그레이션과 문서화된 절차(API 정지, 직접 DB 연결 적용)로 전환하고, 부팅 점검으로 컷오버가 끝났는지 확인합니다.",
          "Switches over with migration 0017 and a documented procedure (stop the API, apply over a direct database connection) and confirms with a boot check that the cutover is done.",
        ),
        paths: [
          "apps/api/src/platform/database/migrations/0017_creator_work_live_lock_revision.sql",
          "docs/STUDIO-LIVE-LOCK-REVISION-MIGRATION.md",
          `${CREATOR_API}/studio-live-lock-schema-preflight.ts`,
        ],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("번호표와 늦은 소식 판정", "Ticket numbers and ruling on late news"),
        language: "ts",
        code: `const clocks = new Map<string, bigint>(); // 실제로는 DB 행 + 트랜잭션

// 작품마다 번호를 하나씩 올려 준다.
export function nextRevision(workId: string): bigint {
  const next = (clocks.get(workId) ?? 0n) + 1n;
  clocks.set(workId, next);
  return next;
}

type Verdict = "apply" | "ignore" | "unsafe";

// 브라우저 쪽 판정: 번호가 없거나 기준이 없으면 위험, 낡았으면 무시, 새것이면 적용.
export function judge(snapshotFloor: bigint | null, resourceMark: bigint | null, revision: bigint | undefined): Verdict {
  if (revision === undefined || snapshotFloor === null) return "unsafe";
  if (revision <= snapshotFloor) return "ignore"; // 스냅샷보다 낡은 소식
  if (resourceMark !== null && revision < resourceMark) return "ignore"; // 이 자원의 최신 번호보다 낡음
  return "apply";
}`,
        codeEn: `const clocks = new Map<string, bigint>(); // in reality a database row plus a transaction

// Raise one number per work.
export function nextRevision(workId: string): bigint {
  const next = (clocks.get(workId) ?? 0n) + 1n;
  clocks.set(workId, next);
  return next;
}

type Verdict = "apply" | "ignore" | "unsafe";

// Browser-side ruling: unsafe without a number or baseline, ignore if stale, apply if newer.
export function judge(snapshotFloor: bigint | null, resourceMark: bigint | null, revision: bigint | undefined): Verdict {
  if (revision === undefined || snapshotFloor === null) return "unsafe";
  if (revision <= snapshotFloor) return "ignore"; // older than the snapshot
  if (resourceMark !== null && revision < resourceMark) return "ignore"; // older than this resource's latest number
  return "apply";
}`,
        explain: t(
          "번호가 단조 증가하기 때문에 늦게 도착한 옛 이벤트는 번호만 비교해 버릴 수 있습니다. 실제 원장은 같은 번호의 중복, 페이지와 요소의 포함 관계 충돌, 워터마크 1,024개 상한까지 함께 판정합니다.",
          "Because the number only grows, an old event arriving late can be dropped by comparing numbers alone. The real ledger also rules on duplicate numbers, page-versus-element hierarchy conflicts and the 1,024-watermark cap.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "PostgreSQL · Explicit locking (advisory locks)", url: "https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS", kind: "docs" },
      { title: "Martin Kleppmann · How to do distributed locking", url: "https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html", kind: "article", note: t("펜싱 토큰이 필요한 이유", "Why a fencing token is needed") },
      { title: "Drizzle ORM · Insert on conflict do update", url: "https://orm.drizzle.team/docs/insert#on-conflict-do-update", kind: "docs", note: t("번호 시계를 올리는 upsert", "The upsert that advances the number clock") },
    ],
    chapterIds: ["collaborative-crdt-boundary"],
    talk: {
      pitch: t(
        "여럿이 같은 레이어를 동시에 고치지 않도록 15초 안팎의 짧은 잠금을 쓰고, 잠금이 바뀔 때마다 작품별 번호를 붙입니다. 번호 덕분에 늦게 도착한 옛 소식이 지금 상황을 뒤집지 못하고, 순서를 믿을 수 없으면 조용히 쓰지 않고 방에 다시 들어가 새로 받습니다. 문서 병합은 CRDT가, 지금 누가 만지는가는 잠금이 맡는 역할 분담입니다.",
        "To keep people from editing one layer at once we use short locks of about 15 seconds, and every lock change gets a per-work number. Thanks to the numbers, an old message arriving late cannot overturn the present, and when order cannot be trusted the browser does not guess but rejoins and fetches fresh state. The CRDT merges the document; the lock owns who is touching what right now.",
      ),
      analogy: t(
        "은행 번호표와 같습니다. 호출 소식이 늦게 도착해도 번호를 보면 이미 지나간 순서인지 알 수 있고, 번호가 헷갈리면 창구에서 다시 안내를 받습니다.",
        "It is like a bank queue ticket. Even if a call announcement arrives late, the number shows it was already passed, and if the numbers confuse you, you ask the counter again.",
      ),
      questions: [
        {
          question: t("CRDT가 있는데 왜 잠금이 또 필요한가요?", "With a CRDT, why are locks needed too?"),
          answer: t(
            "CRDT는 병합을 맡지만 누가 지금 그 레이어를 만지는지는 알려 주지 않습니다. 잠금은 소유자를 보여 주고 같은 영역을 동시에 고치지 않게 하는 보조 규칙입니다.",
            "A CRDT takes care of merging but does not say who is touching a layer right now. The lock is a complementary rule that shows the owner and keeps two people from editing the same area at once.",
          ),
        },
        {
          question: t("배포할 때 편집 중인 사용자는요?", "What happens to editors during the rollout?"),
          answer: t(
            "0017 전환은 롤링 배포가 아니라 조율된 컷오버입니다. 최대 30초짜리 임대만 한 번 지워서 열려 있던 편집기는 락을 다시 잡습니다. 작품·페이지·CRDT·댓글·에셋은 건드리지 않습니다.",
            "The 0017 switch is a coordinated cutover, not a rolling deploy. It deletes only leases of at most 30 seconds once, so open editors re-acquire their locks. Works, pages, CRDT data, comments and assets are untouched.",
          ),
        },
        {
          question: t("락이 풀리지 않고 남으면요?", "What if a lock is left behind?"),
          answer: t(
            "임대라서 기본 15초 뒤 저절로 만료됩니다. 만료도 번호를 하나 소비하고, 서버가 15초마다 만료된 락을 정리해 방 전체에 알립니다. 연결이 끊긴 소유자의 락은 연결 정리 때 풀립니다.",
            "It is a lease, so it expires by itself after 15 seconds by default. Expiry also consumes a number, and every 15 seconds the server clears expired locks and announces it to the room. Locks of owners whose connection dropped are released when the connection is cleaned up.",
          ),
        },
      ],
      pitfall: t(
        "락이 CRDT를 대신한다고 말하지 마세요. 두 규칙은 역할이 다릅니다. 락 상수(작품당 200개, 워터마크 1,024개)는 설계 한도이며 성능 측정값이 아닙니다. 운영 DB에 컷오버가 적용됐는지는 이 카드에서 확인하지 못했고, 코드는 기록이 없으면 API 시작을 막도록 되어 있습니다.",
        "Do not say the lock replaces the CRDT; they play different roles. The lock constants (200 per work, 1,024 watermarks) are design limits, not performance measurements. Whether the cutover has been applied to the production database was not checked for this card; the code is built to refuse starting the API when it is not recorded.",
      ),
    },
    technologies: ["PostgreSQL advisory lock", "lease", "fencing token", "Socket.IO", "Drizzle ORM"],
    facts: [
      { value: "15 s", label: t("락 임대의 기본 길이(5~30초)", "Default lock lease (5 to 30 s)"), source: `${CREATOR_API}/studio-live.protocol.ts` },
      { value: "200", label: t("작품당 락 상한", "Locks per work"), source: `${CREATOR_API}/studio-live-lock.repository.ts` },
      { value: "1,024", label: t("브라우저 원장의 자원 워터마크 상한", "Resource watermarks in the browser ledger"), source: `${LIVE}/studio-live-lock-revision-ledger.ts` },
    ],
    reviewedAt: "2026-10-07",
  },
];
