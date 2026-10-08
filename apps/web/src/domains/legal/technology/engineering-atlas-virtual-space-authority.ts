import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 2: 월드 권위(서버 CAS + 브라우저 projection) · "공간은 권한이 아니다".
 * 경로·수치는 2026-10-07 기준 코드에서 직접 확인한 값이다.
 */

const V = "apps/web/src/domains/creator/virtual-space";
const API = "apps/api/src/modules/studio-project-graph";

export const VIRTUAL_SPACE_AUTHORITY_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "world-authority-cas-projection",
    category: "virtual-space",
    name: "World authority",
    title: t("서버가 확정하고 브라우저는 검증해서 받아 쓰는 월드", "A world the server confirms and browsers verify before use"),
    status: "live",
    tagline: t(
      "월드는 서버가 한 번에 한 버전만 확정하고, 브라우저는 해시로 다시 확인합니다.",
      "The server confirms one world version at a time and browsers re-check it by hash.",
    ),
    background: [
      t(
        "여러 사람이 같은 지도를 쓰려면 '어느 지도가 진짜인가'를 정해야 합니다. 같은 문서를 두 사람이 동시에 고치면 한쪽이 덮어써 사라지는 일이 생기죠. 그래서 월드를 바꾸는 권한은 서버가 쥐고, 관리자가 '내가 본 버전은 이것'이라고 적어 요청하면 서버가 아직 그 버전이 최신일 때만 새 버전으로 바꿔 줍니다. 브라우저는 받은 월드를 한 번 더 확인한 뒤 읽기만 합니다.",
        "For many people to share one map, something must decide which map is the real one. If two people edit the same document at once, one overwrites the other. So the server holds the right to change the world: a manager sends 'the version I saw is this one', and the server swaps in the new version only if that version is still the latest. Browsers re-check what they receive and then only read it.",
      ),
      t(
        "발행 요청에는 새 매니페스트, 내가 본 현재 발행 버전(expectedPublishedRevisionId), 재시도해도 한 번만 처리되게 하는 Idempotency-Key 가 들어갑니다. 서버는 관리자급 권한을 확인하고 작업 행을 잠근 뒤, 현재 버전이 기대값과 같을 때만 새 리비전을 쓰면서 키를 정렬한 JSON 의 SHA-256(contentHash)을 함께 기록합니다. 어긋나면 409 충돌입니다. 브라우저는 받은 월드를 다시 해시해 대조하고, 15초짜리 읽기 임대(lease)와 epoch 로 오래된 요청을 막으며, 어느 단계든 실패하면 공유 기능을 끕니다.",
        "A publish request carries the new manifest, the publication version I saw (expectedPublishedRevisionId) and an Idempotency-Key so a retry is processed only once. The server checks manager-level permission, locks the work row, and writes a new revision only if the current version equals the expected one, recording a SHA-256 (contentHash) of key-sorted JSON alongside it. A mismatch is a 409 conflict. The browser re-hashes what it receives, uses a 15-second read lease and an epoch to reject stale requests, and turns shared features off if any step fails.",
      ),
      t(
        "대안은 '마지막에 저장한 사람이 이긴다'(last-write-wins)인데, 월드는 모두의 화면이 달라지는 공용 설계도라서 조용한 덮어쓰기가 위험합니다. 그래서 비교 후 교체(CAS)를 골랐고, 충돌이 나면 자동 병합하지 않고 사람이 최신본을 보고 다시 판단합니다. 같은 내용을 되돌리는 undo 도 이전 매니페스트를 새 버전으로 다시 발행하는 방식이라 기록이 지워지지 않습니다.",
        "The alternative, last-write-wins, is risky because the world is a shared blueprint that changes everyone's screen, and silent overwrites hurt. So compare-and-swap (CAS) was chosen: on a conflict nothing is merged automatically and a person reviews the latest version and decides again. Even undo is a new publication of an earlier manifest, so history is never erased.",
      ),
      t(
        "한계도 분명합니다. 해시로 고정되는 것은 매니페스트이고, 외부 이미지 URL 의 바이트까지 고정하지는 않습니다(문서가 한계로 적고 있습니다). 서버 PostgreSQL 통합 테스트와 합성 데이터 브라우저 하네스는 있지만, 운영 DB 의 실제 발행이나 여러 사용자 실측은 확인하지 못했습니다.",
        "The limits are clear too. The hash pins the manifest, not the bytes of external image URLs (the documentation itself states this). Server-side PostgreSQL integration tests and a synthetic-data browser harness exist, but real publications in the production database and multi-user measurements were not verified.",
      ),
    ],
    keyPoints: [
      t("월드를 바꾸는 곳은 서버뿐입니다", "Only the server can change the world"),
      t("기대 버전이 최신일 때만 새 버전을 씁니다", "A new version is written only if the expected one is current"),
      t("브라우저는 해시를 다시 계산해 대조합니다", "Browsers recompute the hash and compare it"),
      t("하나라도 어긋나면 공유 기능을 끕니다", "Any mismatch turns shared features off"),
    ],
    diagram: {
      id: "world-authority-cas-projection-diagram",
      kind: "sequence",
      title: t("월드 발행과 팀원의 검증 채택", "Publishing a world and teammates adopting it with verification"),
      caption: t(
        "서버가 비교 후 교체로 확정하고, 받는 브라우저는 해시를 다시 계산해 채택합니다.",
        "The server confirms by compare-and-swap, and each receiving browser re-hashes before adopting.",
      ),
      alt: t(
        "관리자가 기대 버전과 새 월드, 멱등 키를 서버에 보냅니다. 서버는 잠금을 걸고 현재 버전이 기대값과 같을 때만 새 리비전과 해시를 한 트랜잭션으로 기록하며, 다르면 409 로 거절합니다. 팀원의 브라우저는 발행본을 읽어 해시를 다시 계산하고 일치할 때만 채택합니다.",
        "A manager sends the expected version, the new world and an idempotency key to the server. The server locks and, only if the current version equals the expected one, records a new revision and hash in one transaction; otherwise it rejects with 409. A teammate's browser reads the publication, recomputes the hash and adopts it only if it matches.",
      ),
      actors: [
        { id: "admin", label: t("관리자", "Manager"), sub: t("브라우저", "Browser"), tone: "local" },
        { id: "api", label: t("서버 API", "Server API"), sub: t("권한 확인", "Checks access"), tone: "server" },
        { id: "db", label: t("데이터베이스", "Database"), sub: t("리비전 · 영수증", "Revisions, receipts"), tone: "server" },
        { id: "peer", label: t("팀원", "Teammate"), sub: t("브라우저", "Browser"), tone: "local" },
      ],
      messages: [
        { from: "admin", to: "api", label: t("발행 요청", "Publish request"), note: t("기대 버전 + 새 월드 + 멱등 키", "Expected version, world, key") },
        { from: "api", to: "db", label: t("잠금 후 현재 버전 비교", "Lock, compare current"), note: t("같을 때만 진행 (CAS)", "Proceed only if equal (CAS)") },
        { from: "db", to: "api", label: t("현재 버전 = 기대 버전", "Current equals expected"), style: "dashed", note: t("다르면 409 충돌로 거절", "Otherwise reject with 409") },
        { from: "api", to: "db", label: t("리비전·해시·영수증 기록", "Write revision, hash, receipt"), note: t("한 트랜잭션으로 함께", "All in one transaction") },
        { from: "api", to: "admin", label: t("발행본 + contentHash", "Publication + contentHash"), style: "dashed" },
        { from: "admin", to: "admin", label: t("받은 월드를 다시 해시", "Re-hash the received world") },
        { from: "peer", to: "api", label: t("현재 발행본 읽기", "Read current publication"), note: t("읽기 권한 확인", "View access is checked") },
        { from: "api", to: "peer", label: t("발행본 + contentHash", "Publication + contentHash"), style: "dashed" },
        { from: "peer", to: "peer", label: t("해시 재검증 후 채택", "Re-verify, then adopt"), note: t("실패하면 공유 기능 끔", "Failure turns sharing off") },
      ],
    },
    usage: [
      {
        feature: t("월드 발행 서버", "World publishing server"),
        role: t(
          "관리자가 발행하면 권한을 확인하고 기대 버전이 최신일 때만 새 리비전·해시·영수증을 한 트랜잭션으로 기록합니다. 같은 키로 다시 와도 원래 결과를 돌려줍니다.",
          "When a manager publishes, it checks permission and writes a new revision, hash and receipt in one transaction only if the expected version is current. A retry with the same key returns the original result.",
        ),
        paths: [
          `${API}/studio-world-publication.repository.ts#publish`,
          `${API}/studio-world-publication.controller.ts`,
          "packages/studio-project-model/src/graph/world-publication.ts",
        ],
      },
      {
        feature: t("월드 발행 패널(관리자)", "World publishing panel (managers)"),
        role: t(
          "편집 초안을 관리자가 명시적으로 발행하고, 충돌이 나면 최신본을 검토하게 합니다. 응답이 모호하면 같은 의도로 사용자만 다시 시도할 수 있습니다.",
          "Managers publish an edit draft explicitly, and a conflict sends them to review the latest version. If the response is ambiguous, only the user can retry the same intent.",
        ),
        paths: [`${V}/world-publication/StudioWorldPublicationPanel.tsx`, `${V}/world-publication/studio-world-publication-controller.ts`],
      },
      {
        feature: t("팀원 화면 · 발행본 채택", "Teammate screen · adopting a publication"),
        role: t(
          "발행본을 받아 해시를 다시 계산해 대조하고, 에셋을 준비한 뒤 최신 여부를 한 번 더 읽어 확인한 다음에야 채택합니다. 실패하면 프레즌스·영상 같은 공유 기능을 끕니다.",
          "It fetches the publication, recomputes and compares the hash, prepares assets, re-reads to confirm it is still current, and only then adopts it. On failure, shared features such as presence and video stay off.",
        ),
        paths: [
          `${V}/world-publication/studio-world-publication-client.ts`,
          `${V}/world-publication/use-studio-world-publication.ts`,
          `${V}/StudioVirtualSpacePage.tsx`,
        ],
      },
      {
        feature: t("서버 계약 문서", "Server contract document"),
        role: t(
          "API 모양, 오류 코드(403·409·422), 재시도·undo 규칙, 검증 범위를 적어 둔 현재 계약입니다.",
          "The current contract describing the API shape, error codes (403, 409, 422), retry and undo rules, and the verification scope.",
        ),
        paths: ["docs/studio/virtual-studio-world-authority-contract-20260920.md", "docs/studio/virtual-studio-world-publication-client-20260920.md"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("받은 월드를 브라우저에서 다시 해시해 대조", "Re-hash a received world in the browser and compare"),
        language: "ts",
        code: `// 키를 정렬한 JSON(canonical JSON)을 SHA-256 으로 해시한다(studio-world-publication-client 의 단순화).
function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort)
    : v !== null && typeof v === "object"
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, item]) => [key, sort(item)]))
      : v;
  return JSON.stringify(sort(value));
}

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 서버가 준 contentHash 를 그대로 믿지 않고 다시 계산해 같을 때만 쓴다.
export const matches = async (manifest: unknown, expected: string) => (await sha256Hex(manifest)) === expected;`,
        codeEn: `// Hash key-sorted JSON (canonical JSON) with SHA-256 (simplified from studio-world-publication-client).
function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort)
    : v !== null && typeof v === "object"
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, item]) => [key, sort(item)]))
      : v;
  return JSON.stringify(sort(value));
}

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Do not trust the server's contentHash as is; recompute it and use the world only when it matches.
export const matches = async (manifest: unknown, expected: string) => (await sha256Hex(manifest)) === expected;`,
        explain: t(
          "키 순서가 달라도 내용이 같으면 같은 문자열이 되도록 키를 정렬한 뒤 해시합니다. 서버 응답이 중간에 바뀌었거나 캐시가 어긋났을 때 해시가 달라져 바로 드러납니다.",
          "Keys are sorted so the same content always becomes the same string regardless of key order, then hashed. If the response was altered or a cache is out of sync, the hash differs and the problem shows immediately.",
        ),
        source: `${V}/world-publication/studio-world-publication-client.ts`,
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("내가 본 버전이 최신일 때만 쓰기 (CAS)", "Write only if the version I saw is still current (CAS)"),
        language: "ts",
        code: `// "내가 본 버전이 아직 최신일 때만" 새 버전을 쓴다(compare-and-swap, 개념 예제).
type Published = { revisionId: string | null; manifest: string };

export class ConflictError extends Error {
  constructor(readonly currentRevisionId: string | null) {
    super("conflict"); // 서버에서는 HTTP 409
  }
}

export function publish(
  store: { current: Published },
  expectedRevisionId: string | null,
  manifest: string,
  newRevisionId: string,
): Published {
  if (store.current.revisionId !== expectedRevisionId) {
    throw new ConflictError(store.current.revisionId); // 그 사이 다른 사람이 먼저 발행함
  }
  store.current = { revisionId: newRevisionId, manifest };
  return store.current;
}`,
        codeEn: `// Write a new version only if the version I saw is still the latest (compare-and-swap, a concept sample).
type Published = { revisionId: string | null; manifest: string };

export class ConflictError extends Error {
  constructor(readonly currentRevisionId: string | null) {
    super("conflict"); // HTTP 409 on the server
  }
}

export function publish(
  store: { current: Published },
  expectedRevisionId: string | null,
  manifest: string,
  newRevisionId: string,
): Published {
  if (store.current.revisionId !== expectedRevisionId) {
    throw new ConflictError(store.current.revisionId); // someone else published in the meantime
  }
  store.current = { revisionId: newRevisionId, manifest };
  return store.current;
}`,
        explain: t(
          "첫 발행은 기대 버전이 null 이고, 이후에는 현재 버전과 정확히 같아야 합니다. 실제 서버는 이 비교를 작업 행 잠금과 한 트랜잭션 안에서 해서, 동시에 두 요청이 와도 하나만 성공합니다.",
          "The first publication expects null, and later ones must equal the current version exactly. The real server does this comparison under a work-row lock inside one transaction, so when two requests arrive together only one succeeds.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · SubtleCrypto.digest()", url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest", kind: "docs", note: t("브라우저에서 SHA-256 계산", "Computing SHA-256 in the browser") },
      { title: "IETF · Idempotency-Key header (draft)", url: "https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/", kind: "spec", note: t("재시도해도 한 번만 처리", "Process a retried request once") },
      { title: "RFC 9110 · HTTP Semantics", url: "https://www.rfc-editor.org/rfc/rfc9110#name-409-conflict", kind: "spec", note: t("409 Conflict 의 의미", "What 409 Conflict means") },
      { title: "PostgreSQL · Explicit Locking", url: "https://www.postgresql.org/docs/current/explicit-locking.html", kind: "docs", note: t("행 잠금(FOR UPDATE)", "Row locks (FOR UPDATE)") },
      { title: "RFC 8785 · JSON Canonicalization Scheme", url: "https://www.rfc-editor.org/rfc/rfc8785", kind: "spec", note: t("비슷한 표준(완전 동일 여부는 미확인)", "A similar standard (full equivalence not verified)") },
      { title: "Wikipedia · Compare-and-swap", url: "https://en.wikipedia.org/wiki/Compare-and-swap", kind: "article", note: t("비교 후 교체의 개념", "The idea behind compare-and-swap") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "월드를 바꿀 수 있는 곳은 서버뿐입니다. 관리자가 발행하면 서버가 '내가 본 버전이 아직 최신일 때만' 새 버전을 기록하고, 어긋나면 충돌로 거절합니다. 팀원의 브라우저는 받은 월드를 해시로 다시 확인해서 읽기만 하고, 하나라도 어긋나면 공유 기능을 끕니다. 그래서 두 사람이 서로 다른 지도를 보는 일이 없습니다.",
        "Only the server can change the world. When a manager publishes, the server records a new version only if the version they saw is still the latest, and rejects a mismatch as a conflict. A teammate's browser re-checks the received world by hash, only reads it, and turns shared features off on any mismatch. So two people never end up looking at different maps.",
      ),
      analogy: t(
        "도서관의 '최신판 한 권'입니다. 개정판을 내려면 현재 판 번호를 적어 제출해야 하고, 그 사이 누가 먼저 개정했다면 반려됩니다. 열람자는 받은 책의 도장을 다시 확인한 뒤에야 읽습니다.",
        "It is a library's single current edition. To submit a revision you must write down the edition number you saw, and if someone revised it first, yours is returned. Readers re-check the stamp on the book they receive before reading it.",
      ),
      questions: [
        {
          question: t("해시를 브라우저에서 다시 계산하는 이유는요?", "Why does the browser recompute the hash?"),
          answer: t(
            "서버 응답 변조나 캐시 불일치를 막기 위해서입니다. 서버가 준 contentHash 를 그대로 믿지 않고 받은 월드를 다시 해시해 같을 때만 씁니다.",
            "To guard against a tampered response or a stale cache. It does not trust the server's contentHash as is; it re-hashes the received world and uses it only when they match.",
          ),
        },
        {
          question: t("충돌이 나면 제 작업은 사라지나요?", "If there is a conflict, is my work lost?"),
          answer: t(
            "초안은 브라우저에 남고, 최신 발행본을 검토한 뒤 사용자가 다시 발행해야 합니다. 자동으로 덮어쓰거나 병합하지 않습니다.",
            "The draft stays in the browser, and after reviewing the latest publication the user publishes again. Nothing is overwritten or merged automatically.",
          ),
        },
        {
          question: t("에셋(그림) 변조도 막나요?", "Does it also prevent asset (image) tampering?"),
          answer: t(
            "아니요. 해시로 고정되는 것은 매니페스트이고 외부 이미지 URL 의 바이트까지 고정하지는 않습니다. 이미지가 바뀌면 사용자마다 다른 그림을 받을 수 있다고 문서가 한계로 적고 있습니다.",
            "No. The hash pins the manifest, not the bytes behind external image URLs. The documentation lists as a limit that users could receive different pictures if an image changes.",
          ),
        },
      ],
      pitfall: t(
        "'운영에서 검증됐다'고 말하지 마세요. 서버 PostgreSQL 통합 테스트와 합성 데이터 브라우저 하네스는 있지만 운영 DB 의 실제 발행·다중 사용자 실측은 확인하지 못했습니다. 해시 정규화가 RFC 8785 와 같은지도 확인하지 못했습니다.",
        "Do not say 'verified in production'. A server PostgreSQL integration suite and a synthetic-data browser harness exist, but real publications in the production database and multi-user measurements were not verified. Whether the hash canonicalization equals RFC 8785 was also not verified.",
      ),
    },
    technologies: ["NestJS", "Supabase PostgreSQL", "Zod", "Idempotency-Key", "SubtleCrypto"],
    facts: [
      { value: "2 MiB", label: t("월드 매니페스트 크기 상한(설계값)", "World manifest size cap (design value)"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
      { value: "32 MiB / 128 MiB", label: t("에셋 파일당 / 전체 크기 상한(설계값)", "Per-file / total asset size cap (design value)"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
      { value: "15초", label: t("브라우저 읽기 임대(lease) 유효 시간(설계값)", "Browser read-lease lifetime (design value)"), source: `${V}/world-publication/studio-world-publication-client.ts` },
      { value: "SHA-256 · 64 hex", label: t("contentHash 형식", "Format of contentHash"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "space-is-not-permission",
    category: "virtual-space",
    name: "Spatial intent",
    title: t("공간은 권한이 아니라 안내판입니다", "Space is a signpost, not a permission"),
    status: "live",
    tagline: t(
      "문·구역·NPC 는 '어디로 갈지'만 정하고, 허락은 도착한 기능이 따로 판단합니다.",
      "Doors, zones and NPCs only decide where to go; the destination feature decides permission.",
    ),
    background: [
      t(
        "게임 속 마을에서는 문 앞에 서면 문이 열립니다. 가상 스튜디오도 '가까이 가면 열린다'고 느끼게 만들 수 있지만, '가까이 있다'가 곧 '허락됐다'가 되면 위험합니다. 팀 설정 방 앞에 선 사람이 설정을 바꿀 수 있어서는 안 되니까요. 그래서 공간 쪽 코드는 사용자의 행동을 '의도'로만 번역합니다. 패널을 열어라, 효과를 보여라, 이 주소로 가라, 월드 규칙을 평가하라 중 하나입니다.",
        "In a game town, standing at a door opens it. The virtual studio could feel the same, but if being close meant being allowed, it would be dangerous: someone standing in front of the team-settings room must not be able to change settings. So the space code translates a user's action only into an intent: open a panel, show an effect, go to an address, or evaluate a world rule.",
      ),
      t(
        "구조는 이렇습니다. 공간 액션 28가지가 각각 위험도(inspect 보기, collaborative 함께 하기, authority 권한이 필요한 일)를 갖고, 한 오브젝트 앞에서는 최대 6개까지 제안됩니다. 오케스트레이터는 액션과 현재 상호작용을 받아 world-rule · panel · effect · route 네 가지 중 하나만 돌려줍니다. authority·collaborative 액션은 실행 전에 확인 단계를 거치고, 근처 대화 정책은 비공개 구역이거나 문이 있는 구역이면 authority-required 로 거절합니다.",
        "Here is the structure. Each of 28 spatial actions carries a risk level (inspect to look, collaborative to work together, authority for things needing permission), and at most six are offered in front of one object. The orchestrator takes an action and the current interaction and returns exactly one of four intents: world-rule, panel, effect or route. Authority and collaborative actions pass a confirmation step first, and the nearby-conversation policy rejects private zones or zones with a door as authority-required.",
      ),
      t(
        "왜 이렇게 했을까요? 권한 판단을 장면에 두면 화면마다 판단이 어긋나고, 서버 규칙이 바뀔 때 공간 쪽도 다시 고쳐야 합니다. 의도만 돌려주는 얇은 경계를 두면 공간은 안내판, 기능(패널·라우트)은 관문이 되어 기존 권한 시스템을 그대로 씁니다. 월드 규칙도 마찬가지로 이미 있는 도구를 고를 뿐 스크립트·네트워크 작업·권한을 만들지 못합니다. 이 원칙은 코드 주석에도 적혀 있습니다.",
        "Why this way? If permission logic lived in the scene, each screen could disagree and the space would need fixing whenever server rules change. A thin boundary that returns only an intent makes the space a signpost and the features (panels, routes) the gates, reusing the existing permission system. World rules likewise only choose an existing tool and cannot create scripts, network jobs or permissions. This principle is written in the code comments as well.",
      ),
      t(
        "한계: 이 카드가 확인한 것은 클라이언트 쪽 의도 경계입니다. 문이 잠겼을 때 서버가 어디까지 강제하는지는 기능마다 따로 보아야 하며, 이 카드에서는 확인하지 못했습니다. 월드 발행처럼 서버가 권한을 확인하는 예는 '월드 권위' 카드에 있습니다.",
        "Limit: what this card verified is the client-side intent boundary. How far the server enforces things behind a locked door must be checked per feature and was not verified here. An example where the server checks permission, world publishing, is in the world authority card.",
      ),
    ],
    keyPoints: [
      t("공간 액션은 28가지, 위험도는 3단계입니다", "28 spatial actions in three risk levels"),
      t("오케스트레이터는 의도 하나만 돌려줍니다", "The orchestrator returns just one intent"),
      t("허락은 도착한 기능이 따로 판단합니다", "The destination feature decides permission"),
    ],
    diagram: {
      id: "space-is-not-permission-diagram",
      kind: "sequence",
      title: t("문 앞에서 상호작용했을 때 일어나는 일", "What happens when you interact at a door"),
      caption: t(
        "공간은 의도만 고르고, 허락은 도착한 기능이 자기 규칙으로 판단합니다.",
        "Space only picks an intent; the destination decides permission with its own rules.",
      ),
      alt: t(
        "사용자가 문 앞에서 상호작용 키를 누르면 공간 화면이 가능한 액션과 위험도를 확인하고 오케스트레이터에 묻습니다. 오케스트레이터는 패널, 주소, 효과, 월드 규칙 중 의도 하나만 돌려주고, 공간 화면이 그 목적지를 엽니다. 로그인과 권한, 동의는 도착한 기능이 자기 규칙으로 확인합니다.",
        "When the user presses the interact key at a door, the space screen checks the available actions and their risk and asks the orchestrator. The orchestrator returns just one intent: a panel, an address, an effect or a world rule, and the space screen opens that destination. Login, permission and consent are checked by the destination feature with its own rules.",
      ),
      actors: [
        { id: "user", label: t("사용자", "User"), tone: "local" },
        { id: "space", label: t("공간 화면", "Space screen"), sub: t("Phaser + 페이지", "Phaser + page"), tone: "local" },
        { id: "orch", label: t("오케스트레이터", "Orchestrator"), sub: t("순수 함수", "Pure function"), tone: "good" },
        { id: "dest", label: t("도착한 기능", "Destination"), sub: t("패널·라우트", "Panel, route"), tone: "warn" },
      ],
      messages: [
        { from: "user", to: "space", label: t("E 또는 X 키로 상호작용", "Interact with E or X"), note: t("가까이 간 것만으로는 무반응", "Walking up alone does nothing") },
        { from: "space", to: "space", label: t("액션과 위험도 확인", "Check actions and risk"), note: t("위험한 액션은 확인 단계", "Risky ones need confirmation") },
        { from: "space", to: "orch", label: t("액션 id + 현재 상호작용", "Action id + interaction") },
        { from: "orch", to: "space", label: t("의도 하나만 반환", "Return one intent"), style: "dashed", note: t("panel · route · effect · rule", "panel, route, effect, rule") },
        { from: "space", to: "dest", label: t("패널 열기 · 주소 이동", "Open panel or route"), note: t("공간은 여기까지만 관여", "Space's part ends here") },
        { from: "dest", to: "dest", label: t("권한·동의를 자기 규칙으로 확인", "Check access and consent itself") },
        { from: "dest", to: "user", label: t("허용이면 진행, 아니면 안내", "Proceed if allowed, else explain"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("공간 상호작용 · 액션 시트", "Space interaction · action sheet"),
        role: t(
          "문·방·NPC 앞에서 상호작용하면 가능한 액션을 위험도와 함께 보여 주고, 위험한 액션은 확인을 거친 뒤 실행합니다. 가까이 간 것만으로 실행되는 액션은 없습니다.",
          "Interacting at a door, room or NPC lists the available actions with their risk, and risky ones run only after confirmation. Nothing runs just because you walked close.",
        ),
        paths: [
          `${V}/studio-virtual-space-spatial-actions.ts`,
          `${V}/StudioVirtualSpaceActionSheet.tsx`,
          `${V}/StudioVirtualSpacePage.tsx#executeSpatialAction`,
        ],
        route: "/studio/space",
      },
      {
        feature: t("의도 오케스트레이터", "Intent orchestrator"),
        role: t(
          "액션을 panel · effect · route · world-rule 의도 하나로 번역만 하며, 권한은 판단하지 않습니다. 작업 주소는 프로젝트 id 를 인코딩해 만듭니다.",
          "It only translates an action into one of the panel, effect, route or world-rule intents and never judges permission. Route addresses are built with the project id encoded.",
        ),
        paths: [`${V}/studio-virtual-space-interaction-orchestrator.ts#orchestrateStudioSpatialInteraction`, `${V}/studio-virtual-space-interaction-orchestrator.test.ts`],
      },
      {
        feature: t("월드 규칙 게이트", "World rule gate"),
        role: t(
          "관리자가 월드에 적은 explicit-use 규칙은 이미 있는 도구를 고르고, 현재 활동 상태에 따라 확인 또는 차단만 정합니다.",
          "An explicit-use rule a manager wrote into the world picks an existing tool and only decides confirm or block depending on the current activity state.",
        ),
        paths: [`${V}/studio-world-interaction-rule.ts`, `${V}/StudioWorldRuleGate.tsx`],
      },
      {
        feature: t("근처 대화 구역 정책", "Nearby-conversation zone policy"),
        role: t(
          "비공개 구역이나 문이 있는 구역은 authority-required 로 거절하고, 공개 구역에서만 거리·시간 조건으로 입장과 퇴장을 판정합니다.",
          "Private zones or zones with a door are rejected as authority-required, and only public zones judge entry and exit by distance and time conditions.",
        ),
        paths: [`${V}/studio-virtual-space-acoustics.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("액션을 의도 하나로만 번역하기", "Translating an action into just one intent"),
        language: "ts",
        code: `// 공간 오브젝트는 "어디로 갈지"만 정한다. 권한 검사는 도착한 기능의 몫이다(단순화).
type Decision =
  | { kind: "panel"; panel: string }
  | { kind: "effect"; effect: string }
  | { kind: "route"; href: string };

const PANEL_BY_ACTION: Readonly<Record<string, string>> = { board: "board", people: "people" };
const EFFECT_BY_ACTION: Readonly<Record<string, string>> = { "ring-gong": "gong" };

export function decide(action: string, projectId: string): Decision {
  const panel = PANEL_BY_ACTION[action];
  if (panel) return { kind: "panel", panel }; // 화면 패널만 연다
  const effect = EFFECT_BY_ACTION[action];
  if (effect) return { kind: "effect", effect }; // 연출만 보여 준다
  return { kind: "route", href: \`/studio/p/\${encodeURIComponent(projectId)}/overview\` }; // 기존 주소로 보낸다
}`,
        codeEn: `// A spatial object only decides where to go; permission checks belong to the destination feature (simplified).
type Decision =
  | { kind: "panel"; panel: string }
  | { kind: "effect"; effect: string }
  | { kind: "route"; href: string };

const PANEL_BY_ACTION: Readonly<Record<string, string>> = { board: "board", people: "people" };
const EFFECT_BY_ACTION: Readonly<Record<string, string>> = { "ring-gong": "gong" };

export function decide(action: string, projectId: string): Decision {
  const panel = PANEL_BY_ACTION[action];
  if (panel) return { kind: "panel", panel }; // only opens an on-screen panel
  const effect = EFFECT_BY_ACTION[action];
  if (effect) return { kind: "effect", effect }; // only shows an effect
  return { kind: "route", href: \`/studio/p/\${encodeURIComponent(projectId)}/overview\` }; // sends to an existing address
}`,
        explain: t(
          "반환값이 판별 유니온(kind)이라 호출한 쪽은 네 가지 의도만 처리하면 됩니다. 이 함수 안에는 '허용/거부'가 없다는 점이 핵심입니다.",
          "The return value is a discriminated union (kind), so the caller handles just the intents. The point is that there is no allow or deny anywhere in this function.",
        ),
        source: `${V}/studio-virtual-space-interaction-orchestrator.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("가까워도 허락은 아니다: 대화 구역 판정", "Close is not allowed: judging a conversation zone"),
        language: "ts",
        code: `// 근처 대화 구역 판정: 비공개 구역이나 문이 있는 구역은 거리가 가까워도 권한이 필요하다(단순화).
type Zone = { id: string; policy: "public" | "private"; doorId?: string };
type Decision = { allowed: true; zoneId: string } | { allowed: false; reason: string };

export function conversationZone(zones: readonly (Zone | undefined)[]): Decision {
  const first = zones[0];
  if (!first || zones.some((zone) => !zone)) return { allowed: false, reason: "unknown-zone" };
  if (zones.some((zone) => zone!.id !== first.id)) return { allowed: false, reason: "different-zone" };
  if (first.policy !== "public" || first.doorId !== undefined) {
    return { allowed: false, reason: "authority-required" }; // 가까워도 허락이 아니다
  }
  return { allowed: true, zoneId: first.id };
}`,
        codeEn: `// Judging a nearby-conversation zone: private zones or zones with a door need permission however close you are (simplified).
type Zone = { id: string; policy: "public" | "private"; doorId?: string };
type Decision = { allowed: true; zoneId: string } | { allowed: false; reason: string };

export function conversationZone(zones: readonly (Zone | undefined)[]): Decision {
  const first = zones[0];
  if (!first || zones.some((zone) => !zone)) return { allowed: false, reason: "unknown-zone" };
  if (zones.some((zone) => zone!.id !== first.id)) return { allowed: false, reason: "different-zone" };
  if (first.policy !== "public" || first.doorId !== undefined) {
    return { allowed: false, reason: "authority-required" }; // close is not allowed
  }
  return { allowed: true, zoneId: first.id };
}`,
        explain: t(
          "참여자 모두가 같은 공개 구역 안에 있어야 대화가 시작됩니다. 모르는 구역, 서로 다른 구역, 비공개·문 있는 구역은 이유와 함께 거절합니다.",
          "A conversation starts only when everyone is inside the same public zone. Unknown zones, different zones, and private or door-guarded zones are rejected with a reason.",
        ),
        source: `${V}/studio-virtual-space-acoustics.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "TypeScript · Discriminated unions", url: "https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions", kind: "docs", note: t("의도를 안전하게 나누는 타입", "A type that splits intents safely") },
      { title: "OWASP · Authorization Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html", kind: "guide", note: t("권한 확인은 서버에서 강제", "Enforce authorization on the server") },
      { title: "W3C WAI-ARIA APG · Modal dialog", url: "https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/", kind: "guide", note: t("확인 단계를 접근 가능하게 만드는 법", "Making a confirmation step accessible") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "공간은 새로운 권한 시스템이 아닙니다. 문 앞에 서거나 단축키를 눌러도 공간 코드가 하는 일은 '패널을 열어라, 이 주소로 가라, 연출을 보여라' 같은 의도 하나를 고르는 데까지입니다. 그 기능을 쓸 자격이 있는지는 도착한 기능이 기존 권한 규칙으로 따로 확인합니다. 그래서 공간 화면과 목록 화면이 같은 규칙을 따릅니다.",
        "Space is not a new permission system. Standing at a door or pressing a shortcut only makes the space code pick one intent, such as open this panel, go to this address or show this effect. Whether you may use that feature is checked separately by the destination under the existing permission rules. So the spatial screen and the list screen follow the same rules.",
      ),
      analogy: t(
        "건물 로비의 안내판입니다. 안내판은 '3층 인사팀은 이쪽'이라고 알려 줄 뿐이고, 3층 문을 여는 것은 출입증입니다.",
        "It is the directory sign in a building lobby. The sign only says the HR team on the third floor is this way; what opens the third-floor door is your access card.",
      ),
      questions: [
        {
          question: t("문이 잠기면 서버가 막나요?", "If a door is locked, does the server block it?"),
          answer: t(
            "클라이언트의 의도 경계는 코드와 테스트로 확인했습니다. 서버가 어디까지 강제하는지는 기능마다 달라서 이 카드에서는 확인하지 못했습니다. 월드 발행은 서버가 권한을 확인하는 예입니다.",
            "I verified the client's intent boundary through code and tests. How far the server enforces things differs by feature and was not verified here. World publishing is an example where the server checks permission.",
          ),
        },
        {
          question: t("액션이 왜 28가지나 되나요?", "Why are there as many as 28 actions?"),
          answer: t(
            "작업함·화이트보드·예약·프로젝트 설정 같은 일 관련 도구와 소원 빌기·사진 같은 가벼운 연출이 한 목록에 있기 때문입니다. 각 액션에 위험도가 붙어 확인 단계 여부가 정해지고, 한 오브젝트 앞에서는 최대 6개만 제안됩니다.",
            "Work tools such as the inbox, whiteboard, booking and project settings sit in one list with light effects such as making a wish or taking a photo. Each action has a risk level that decides whether confirmation is needed, and at most six are offered at one object.",
          ),
        },
        {
          question: t("월드 규칙으로 무엇이든 실행할 수 있나요?", "Can a world rule run anything?"),
          answer: t(
            "아니요. 규칙은 이미 있는 도구를 직접 열기·확인 후 열기·차단 중에서 고를 뿐입니다. 스크립트나 네트워크 작업, 권한 부여는 만들 수 없다고 코드 주석에 적혀 있습니다.",
            "No. A rule only chooses among open directly, open after confirmation or block for an existing tool. The code comment states that it can create no script, network job or permission.",
          ),
        },
      ],
      pitfall: t(
        "'공간 안에서는 권한 걱정이 없다'는 과장입니다. 이 카드는 클라이언트 의도 경계만 검증했고, 서버 강제 범위는 기능별로 확인해야 합니다.",
        "'There are no permission worries inside the space' would be an exaggeration. This card verified only the client-side intent boundary; server enforcement must be checked feature by feature.",
      ),
    },
    technologies: ["TypeScript", "React", "Phaser 3"],
    facts: [
      { value: "28가지", label: t("공간 액션 수", "Number of spatial actions"), source: `${V}/studio-virtual-space-spatial-actions.ts` },
      { value: "3단계", label: t("위험도(inspect · collaborative · authority)", "Risk levels (inspect, collaborative, authority)"), source: `${V}/studio-virtual-space-spatial-actions.ts` },
      { value: "6개", label: t("한 오브젝트 앞에서 제안하는 액션 상한", "Cap on actions offered at one object"), source: `${V}/studio-virtual-space-spatial-actions.ts` },
      { value: "120px / 156px", label: t("근처 대화 입장 / 퇴장 반경(설계값)", "Nearby-conversation enter / exit radius (design value)"), source: `${V}/studio-virtual-space-acoustics.ts` },
      { value: "300ms / 800ms", label: t("근처 대화 입장 / 퇴장 확정 시간(설계값)", "Nearby-conversation enter / exit confirm time (design value)"), source: `${V}/studio-virtual-space-acoustics.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
