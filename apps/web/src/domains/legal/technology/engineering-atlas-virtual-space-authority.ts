import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 2: 월드 권위(서버 CAS + Godot 무대·웹 셸 소비) · "공간은 권한이 아니다".
 * 웹(Phaser) 공간 클라이언트와 브라우저 발행 클라이언트는 제거됐고, 공간은 Godot 무대가 맡는다.
 * 경로·수치는 현행 코드에서 직접 확인한 값이다.
 */

const V = "apps/web/src/domains/creator/virtual-space";
const API = "apps/api/src/modules/studio-project-graph";

export const VIRTUAL_SPACE_AUTHORITY_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "world-authority-cas-projection",
    category: "virtual-space",
    name: "World authority",
    title: t("서버가 확정하고 Godot 무대와 웹 셸이 받아 쓰는 월드", "A world the server confirms and the Godot stage and web shell take in"),
    status: "live",
    tagline: t(
      "월드는 서버가 한 번에 한 버전만 확정하고, Godot 무대와 웹 셸은 발행본을 받아 씁니다.",
      "The server confirms one world version at a time, and the Godot stage and web shell take in the publication.",
    ),
    background: [
      t(
        "여러 사람이 같은 지도를 쓰려면 '어느 지도가 진짜인가'를 정해야 합니다. 같은 문서를 두 사람이 동시에 고치면 한쪽이 덮어써 사라지는 일이 생기죠. 그래서 월드를 바꾸는 권한은 서버가 쥐고, 관리자가 '내가 본 버전은 이것'이라고 적어 요청하면 서버가 아직 그 버전이 최신일 때만 새 버전으로 바꿔 줍니다. 공간 화면이 웹 클라이언트에서 Godot 무대로 교체된 뒤에도 이 권위만큼은 처음부터 서버에 있었고 지금도 서버에 있습니다.",
        "For many people to share one map, something must decide which map is the real one. If two people edit the same document at once, one overwrites the other. So the server holds the right to change the world: a manager sends 'the version I saw is this one', and the server swaps in the new version only if that version is still the latest. Even after the space screen moved from a web client to a Godot stage, this authority was on the server from the start and remains there.",
      ),
      t(
        "발행 요청에는 새 매니페스트, 내가 본 현재 발행 버전(expectedPublishedRevisionId), 재시도해도 한 번만 처리되게 하는 Idempotency-Key 가 들어갑니다. 서버는 관리자급(manage) 권한을 확인하고 작업 행을 잠근 뒤, 현재 버전이 기대값과 같을 때만 새 리비전을 쓰면서 키를 정렬한 JSON 의 SHA-256(contentHash)을 함께 기록합니다. 어긋나면 409 충돌입니다. 읽을 때도 서버는 저장된 발행본을 영수증·요청 해시·contentHash 와 다시 대조해 검증하고, 증거가 하나라도 어긋나면 이전 발행본으로 대체하지 않고 실패로 닫습니다.",
        "A publish request carries the new manifest, the publication version I saw (expectedPublishedRevisionId) and an Idempotency-Key so a retry is processed only once. The server checks manager-level (manage) permission, locks the work row, and writes a new revision only if the current version equals the expected one, recording a SHA-256 (contentHash) of key-sorted JSON alongside it. A mismatch is a 409 conflict. On read, the server also re-verifies the stored publication against its receipt, request hash and contentHash, and if any evidence disagrees it fails closed instead of falling back to an older publication.",
      ),
      t(
        "Godot 무대 쪽 소비도 같은 원칙을 따릅니다. 웹 셸이 작품별 공간 정의를 Core API 에서 revision 과 함께 읽어 무대에 세션으로 실어 보내고, 무대는 그 정의를 소비해 공간을 그립니다. 편집 저장은 expectedRevision 을 함께 보내고, 서버가 409 로 거절하면 셸은 충돌로 표시하고 재조회 동선을 제시합니다. 정본은 서버, 무대와 셸은 소비자라는 경계가 발행과 공간 정의 양쪽에 같습니다.",
        "Consumption on the Godot stage side follows the same principle. The web shell reads the per-work space definition from the Core API together with its revision and loads it into the stage as part of the session, and the stage consumes that definition to draw the space. Saving an edit sends expectedRevision along, and when the server rejects with 409 the shell marks a conflict and offers a reload path. The boundary, the server is the source of truth and the stage and shell are consumers, is the same for publications and space definitions.",
      ),
      t(
        "대안은 '마지막에 저장한 사람이 이긴다'(last-write-wins)인데, 월드는 모두의 화면이 달라지는 공용 설계도라서 조용한 덮어쓰기가 위험합니다. 그래서 비교 후 교체(CAS)를 골랐고, 충돌이 나면 자동 병합하지 않고 사람이 최신본을 보고 다시 판단합니다. 같은 내용을 되돌리는 undo 도 이전 매니페스트를 새 버전으로 다시 발행하는 방식이라 기록이 지워지지 않습니다. 한계도 분명합니다. 서버는 에셋 URL 을 가져와 검사하지 않으므로, 해시로 고정되는 것은 매니페스트이고 URL 뒤 이미지 바이트까지 보장하지는 않습니다.",
        "The alternative, last-write-wins, is risky because the world is a shared blueprint that changes everyone's screen, and silent overwrites hurt. So compare-and-swap (CAS) was chosen: on a conflict nothing is merged automatically and a person reviews the latest version and decides again. Even undo is a new publication of an earlier manifest, so history is never erased. The limits are clear too. The server never fetches asset URLs to inspect them, so the hash pins the manifest and does not guarantee the image bytes behind a URL.",
      ),
    ],
    keyPoints: [
      t("월드를 바꾸는 곳은 서버뿐입니다", "Only the server can change the world"),
      t("기대 버전이 최신일 때만 새 버전을 씁니다", "A new version is written only if the expected one is current"),
      t("읽을 때도 서버가 해시·영수증을 다시 대조합니다", "On read, the server re-checks the hash and receipt"),
      t("Godot 무대와 웹 셸은 발행본을 소비만 합니다", "The Godot stage and web shell only consume publications"),
    ],
    diagram: {
      id: "world-authority-cas-projection-diagram",
      kind: "sequence",
      title: t("월드 발행과 Godot 무대의 소비", "Publishing a world and the Godot stage consuming it"),
      caption: t(
        "서버가 비교 후 교체로 확정하고, 웹 셸이 발행본과 공간 정의를 Godot 무대에 실어 보냅니다.",
        "The server confirms by compare-and-swap, and the web shell loads the publication and space definition into the Godot stage.",
      ),
      alt: t(
        "관리자가 기대 버전과 새 월드, 멱등 키를 서버에 보냅니다. 서버는 잠금을 걸고 현재 버전이 기대값과 같을 때만 새 리비전과 해시를 한 트랜잭션으로 기록하며, 다르면 409 로 거절합니다. 웹 셸은 현재 발행본을 읽는데, 서버는 그때도 저장된 발행본을 영수증과 해시로 다시 검증합니다. 셸은 작품별 공간 정의를 revision 과 함께 Godot 무대에 세션으로 주입하고, 무대는 렌더와 이동만 맡습니다.",
        "A manager sends the expected version, the new world and an idempotency key to the server. The server locks and, only if the current version equals the expected one, records a new revision and hash in one transaction; otherwise it rejects with 409. The web shell reads the current publication, and even then the server re-verifies the stored publication against its receipt and hash. The shell injects the per-work space definition, with its revision, into the Godot stage as a session, and the stage owns only rendering and movement.",
      ),
      actors: [
        { id: "admin", label: t("관리자", "Manager"), sub: t("웹 셸", "Web shell"), tone: "local" },
        { id: "api", label: t("서버 API", "Server API"), sub: t("권한 확인", "Checks access"), tone: "server" },
        { id: "db", label: t("데이터베이스", "Database"), sub: t("리비전 · 영수증", "Revisions, receipts"), tone: "server" },
        { id: "stage", label: t("Godot 무대", "Godot stage"), sub: t("렌더 · 이동", "Render, movement"), tone: "local" },
      ],
      messages: [
        { from: "admin", to: "api", label: t("발행 요청", "Publish request"), note: t("기대 버전 + 새 월드 + 멱등 키", "Expected version, world, key") },
        { from: "api", to: "db", label: t("잠금 후 현재 버전 비교", "Lock, compare current"), note: t("같을 때만 진행 (CAS)", "Proceed only if equal (CAS)") },
        { from: "db", to: "api", label: t("현재 버전 = 기대 버전", "Current equals expected"), style: "dashed", note: t("다르면 409 충돌로 거절", "Otherwise reject with 409") },
        { from: "api", to: "db", label: t("리비전·해시·영수증 기록", "Write revision, hash, receipt"), note: t("한 트랜잭션으로 함께", "All in one transaction") },
        { from: "api", to: "admin", label: t("발행본 + contentHash", "Publication + contentHash"), style: "dashed" },
        { from: "admin", to: "api", label: t("현재 발행본 읽기", "Read current publication"), note: t("서버가 해시·영수증 재검증", "Server re-verifies hash and receipt") },
        { from: "api", to: "admin", label: t("검증된 발행본", "Verified publication"), style: "dashed", note: t("어긋나면 실패로 닫음", "Mismatch fails closed") },
        { from: "admin", to: "stage", label: t("공간 정의를 세션으로 주입", "Inject space definition as session"), note: t("revision 과 함께, 셸 브리지로", "With revision, via the shell bridge") },
        { from: "stage", to: "stage", label: t("정의 소비해 렌더·이동", "Consume definition, render and move"), note: t("발행 권한은 무대에 없음", "The stage holds no publish right") },
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
        feature: t("서버 계약 문서", "Server contract document"),
        role: t(
          "API 모양, 오류 코드(403·409·422), 재시도·undo 규칙, 검증 범위를 적어 둔 현재 서버 계약입니다. 브라우저 발행 UI 는 이 계약의 범위 밖이라고 명시합니다.",
          "The current server contract describing the API shape, error codes (403, 409, 422), retry and undo rules, and the verification scope. It states that a browser publication UI is outside this contract's scope.",
        ),
        paths: ["docs/studio/virtual-studio-world-authority-contract-20260920.md"],
      },
      {
        feature: t("Godot 공간 정의 소비(웹 셸)", "Godot space definition consumption (web shell)"),
        role: t(
          "셸이 작품별 저장 정의를 revision 과 함께 읽어 Godot 무대에 세션으로 실어 보내고, 편집 저장은 expectedRevision 을 보내 충돌(409)이면 재조회 동선을 제시합니다.",
          "The shell reads the saved per-work definition with its revision and loads it into the Godot stage as a session; saving an edit sends expectedRevision, and a conflict (409) offers a reload path.",
        ),
        paths: [`${V}/studio-godot-space.ts`, `${V}/StudioGodotSpaceEmbed.tsx`],
      },
      {
        feature: t("공간 페이지 진입", "Space page entry"),
        role: t(
          "공간 페이지는 어느 동선으로 들어와도 Godot 무대 임베드 하나로 수렴합니다. 클래식 웹 무대는 제거됐습니다.",
          "However the space page is reached, it converges on the single Godot stage embed. The classic web stage was removed.",
        ),
        paths: [`${V}/StudioVirtualSpacePageRoot.tsx`],
        route: "/studio/space",
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("서버에서 키 정렬 JSON 을 SHA-256 으로 해시", "Hash key-sorted JSON with SHA-256 on the server"),
        language: "ts",
        code: `// 키를 정렬한 JSON(canonical JSON)을 SHA-256 으로 해시한다(studioRequestHash 의 단순화).
import { createHash } from "node:crypto";

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

export function studioRequestHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

// 발행본을 읽을 때도 contentHash 가 이 값과 같은지 서버가 다시 대조한다.
export const matches = (manifest: unknown, contentHash: string) => studioRequestHash(manifest) === contentHash;`,
        codeEn: `// Hash key-sorted JSON (canonical JSON) with SHA-256 (simplified from studioRequestHash).
import { createHash } from "node:crypto";

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

export function studioRequestHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

// On read, the server also re-checks that contentHash equals this value.
export const matches = (manifest: unknown, contentHash: string) => studioRequestHash(manifest) === contentHash;`,
        explain: t(
          "키 순서가 달라도 내용이 같으면 같은 문자열이 되도록 키를 정렬한 뒤 해시합니다. 발행할 때 기록한 contentHash 와 읽을 때 다시 계산한 값이 다르면, 저장된 발행본이 어긋난 것으로 보고 실패로 닫습니다.",
          "Keys are sorted so the same content always becomes the same string regardless of key order, then hashed. If the contentHash recorded at publish time differs from the value recomputed on read, the stored publication is treated as broken and the read fails closed.",
        ),
        source: `${API}/studio-project-graph.repository.ts`,
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
      { title: "Node.js · Crypto", url: "https://nodejs.org/api/crypto.html", kind: "docs", note: t("서버에서 SHA-256 계산", "Computing SHA-256 on the server") },
      { title: "IETF · Idempotency-Key header (draft)", url: "https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/", kind: "spec", note: t("재시도해도 한 번만 처리", "Process a retried request once") },
      { title: "RFC 9110 · HTTP Semantics", url: "https://www.rfc-editor.org/rfc/rfc9110#name-409-conflict", kind: "spec", note: t("409 Conflict 의 의미", "What 409 Conflict means") },
      { title: "PostgreSQL · Explicit Locking", url: "https://www.postgresql.org/docs/current/explicit-locking.html", kind: "docs", note: t("행 잠금(FOR UPDATE)", "Row locks (FOR UPDATE)") },
      { title: "RFC 8785 · JSON Canonicalization Scheme", url: "https://www.rfc-editor.org/rfc/rfc8785", kind: "spec", note: t("비슷한 표준(완전 동일 여부는 미확인)", "A similar standard (full equivalence not verified)") },
      { title: "Wikipedia · Compare-and-swap", url: "https://en.wikipedia.org/wiki/Compare-and-swap", kind: "article", note: t("비교 후 교체의 개념", "The idea behind compare-and-swap") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "월드를 바꿀 수 있는 곳은 서버뿐입니다. 관리자가 발행하면 서버가 '내가 본 버전이 아직 최신일 때만' 새 버전을 기록하고, 어긋나면 충돌로 거절합니다. 읽을 때도 서버가 저장된 발행본을 해시와 영수증으로 다시 검증합니다. 공간을 그리는 Godot 무대와 웹 셸은 발행본과 공간 정의를 받아 쓰는 소비자일 뿐, 스스로 월드를 확정하지 않습니다.",
        "Only the server can change the world. When a manager publishes, the server records a new version only if the version they saw is still the latest, and rejects a mismatch as a conflict. On read, the server re-verifies the stored publication against its hash and receipt. The Godot stage that draws the space and the web shell only take in publications and space definitions; they never confirm a world themselves.",
      ),
      analogy: t(
        "도서관의 '최신판 한 권'입니다. 개정판을 내려면 현재 판 번호를 적어 제출해야 하고, 그 사이 누가 먼저 개정했다면 반려됩니다. 사서는 책을 내줄 때마다 도장과 장부를 다시 대조합니다.",
        "It is a library's single current edition. To submit a revision you must write down the edition number you saw, and if someone revised it first, yours is returned. The librarian re-checks the stamp against the ledger every time the book is lent out.",
      ),
      questions: [
        {
          question: t("해시를 읽을 때도 서버가 다시 대조하는 이유는요?", "Why does the server re-check the hash on read as well?"),
          answer: t(
            "저장된 발행본이 영수증·요청 기록과 어긋나지 않았는지 확인하기 위해서입니다. 하나라도 다르면 이전 발행본으로 몰래 대체하지 않고 실패로 닫습니다.",
            "To confirm the stored publication still agrees with its receipt and request records. If anything differs, it fails closed instead of silently substituting an older publication.",
          ),
        },
        {
          question: t("충돌이 나면 제 작업은 사라지나요?", "If there is a conflict, is my work lost?"),
          answer: t(
            "서버는 쓰기를 거절할 뿐입니다. 최신 발행본을 검토한 뒤 기대 버전을 맞춰 다시 발행해야 하고, 자동으로 덮어쓰거나 병합하지 않습니다.",
            "The server only refuses the write. After reviewing the latest publication you publish again with the current expected version. Nothing is overwritten or merged automatically.",
          ),
        },
        {
          question: t("에셋(그림) 변조도 막나요?", "Does it also prevent asset (image) tampering?"),
          answer: t(
            "아니요. 서버는 에셋 URL 을 가져와 검사하지 않고, 해시로 고정되는 것은 매니페스트입니다. URL 뒤 이미지가 바뀌면 보장 범위를 벗어난다고 계약 문서가 밝히고 있습니다.",
            "No. The server never fetches asset URLs to inspect them, and the hash pins the manifest. The contract document states that a changed image behind a URL is outside the guarantee.",
          ),
        },
      ],
      pitfall: t(
        "'운영에서 검증됐다'고 말하지 마세요. 서버 PostgreSQL 통합 테스트는 있지만 운영 DB 의 실제 발행·다중 사용자 실측은 확인하지 못했습니다. 해시 정규화가 RFC 8785 와 같은지도 확인하지 못했습니다. 또 브라우저가 해시를 검증하던 옛 클라이언트는 제거됐으니, 검증 주체를 브라우저라고 말하면 안 됩니다.",
        "Do not say 'verified in production'. A server PostgreSQL integration suite exists, but real publications in the production database and multi-user measurements were not verified. Whether the hash canonicalization equals RFC 8785 was also not verified. And the old client where the browser verified the hash was removed, so do not name the browser as the verifier.",
      ),
    },
    technologies: ["NestJS", "Supabase PostgreSQL", "Zod", "Idempotency-Key", "Node.js crypto", "Godot"],
    facts: [
      { value: "2 MiB", label: t("월드 매니페스트 크기 상한(설계값)", "World manifest size cap (design value)"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
      { value: "32 MiB / 128 MiB", label: t("에셋 파일당 / 전체 크기 상한(설계값)", "Per-file / total asset size cap (design value)"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
      { value: "SHA-256 · 64 hex", label: t("contentHash 형식", "Format of contentHash"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
      { value: "409", label: t("CAS·멱등 충돌을 알리는 HTTP 상태", "HTTP status signalling a CAS or idempotency conflict"), source: `${API}/studio-world-publication.service.ts` },
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
      "Godot 무대 안의 위치는 안내일 뿐이고, 입장과 권한은 서버가 발급한 티켓이 정합니다.",
      "Position inside the Godot stage is only guidance; admission and permission come from a server-issued ticket.",
    ),
    background: [
      t(
        "게임 속 마을에서는 문 앞에 서면 문이 열립니다. 가상 스튜디오도 '가까이 가면 열린다'고 느끼게 만들 수 있지만, '가까이 있다'가 곧 '허락됐다'가 되면 위험합니다. 팀 설정 방 앞에 선 사람이 설정을 바꿀 수 있어서는 안 되니까요. 공간이 Godot 무대로 교체된 지금도 원칙은 같습니다. 무대는 렌더와 이동을 맡고 웹 셸이 계정 세션과 연결을 맡는 이층 구조에서, 무대 안 위치와 근접은 연출과 안내를 정할 뿐 권한을 만들지 않습니다.",
        "In a game town, standing at a door opens it. The virtual studio could feel the same, but if being close meant being allowed, it would be dangerous: someone standing in front of the team-settings room must not be able to change settings. The principle is unchanged now that the space is a Godot stage. In the two-layer structure, where the stage owns rendering and movement and the web shell owns the account session and connection, position and proximity inside the stage only drive presentation and guidance and never create permission.",
      ),
      t(
        "진짜 관문은 입장 티켓입니다. 실시간 연결에는 서버가 발급한 짧은 수명의 티켓이 필요하고, 티켓에는 닿을 수 있는 범위(scope)와 작업 종류(workloads), 능력(capabilities)이 적혀 있습니다. 웹 셸은 티켓 발급과 갱신을 소유하고 티켓을 메모리에만 두며 저장·URL·로그에 남기지 않습니다. 게스트는 초대 토큰이나 입장코드 자격을 서버가 먼저 검증한 경우에만 티켓을 받고, 그 티켓도 presence 전용으로 제한됩니다.",
        "The real gate is the admission ticket. A realtime connection needs a short-lived ticket issued by the server, and the ticket carries the reachable scope, the workloads and the capabilities. The web shell owns ticket issuance and renewal, keeps the ticket in memory only, and never persists it or puts it in a URL or a log. A guest receives a ticket only after the server verifies an invite token or entry-code credential first, and even that ticket is limited to presence only.",
      ),
      t(
        "구역도 마찬가지입니다. 근처 대화 정책은 비공개 구역이거나 문이 선언된 구역이면 거리가 아무리 가까워도 authority-required 로 거절합니다. 문이 선언된 구역에는 권위 있는 어댑터가 붙어야 하고, 권한 증거가 없다는 것은 열린 것이 아니라 닫힌 것입니다. Godot 무대가 구역 판정을 셸에 통지하더라도, 회의나 댓글 같은 기능 채널의 자격은 각 채널 계약이 따로 정합니다. 게스트에게 회의·댓글 채널을 열지 않는 것이 그 예입니다.",
        "Zones work the same way. The nearby-conversation policy rejects a private zone or a zone with a declared door as authority-required, however close you stand. A zone with a declared door needs an authoritative adapter attached, and the absence of a grant means closed, never open. Even when the Godot stage notifies the shell of its zone judgement, eligibility for feature channels such as meetings or comments is decided separately by each channel's contract. Not opening meeting and comment channels to guests is one example.",
      ),
      t(
        "왜 이렇게 나눴을까요? 권한 판단을 장면에 두면 화면마다 판단이 어긋나고, 서버 규칙이 바뀔 때 무대 쪽도 다시 고쳐야 합니다. 무대는 안내와 연출, 셸은 세션과 티켓, 서버는 발급과 검증으로 나누면 규칙이 한곳에서 바뀌고 무대는 그 결과를 받아 씁니다. 한계도 있습니다. 이 카드가 확인한 것은 티켓 계약과 셸·무대 경계, 구역 정책 코드와 배포 설정값이며, 운영 환경에서 여러 사용자가 실제로 오간 실측은 확인하지 못했습니다.",
        "Why split it this way? If permission logic lived in the scene, each screen could disagree and the stage would need fixing whenever server rules change. Splitting guidance and presentation to the stage, session and tickets to the shell, and issuance and verification to the server lets a rule change in one place while the stage takes in the result. There are limits: what this card verified is the ticket contract, the shell and stage boundary, the zone policy code and the deployment settings; multi-user behaviour in production was not measured.",
      ),
    ],
    keyPoints: [
      t("무대 안 위치는 권한을 만들지 않습니다", "Position in the stage creates no permission"),
      t("입장은 서버가 발급한 단기 티켓이 정합니다", "Admission is decided by a short-lived server ticket"),
      t("게스트 티켓은 presence 전용으로 제한됩니다", "Guest tickets are limited to presence only"),
      t("문이 있는 구역은 가까워도 authority-required 입니다", "A door zone is authority-required however close you are"),
    ],
    diagram: {
      id: "space-is-not-permission-diagram",
      kind: "sequence",
      title: t("무대에 들어가고 문 앞에 섰을 때 일어나는 일", "What happens entering the stage and standing at a door"),
      caption: t(
        "무대는 위치와 구역을 알릴 뿐이고, 입장과 권한은 서버 티켓과 도착한 기능이 정합니다.",
        "The stage only reports position and zones; admission and permission are decided by the server ticket and the destination feature.",
      ),
      alt: t(
        "사용자가 Godot 무대 안에서 이동하면 무대는 구역과 근접을 웹 셸에 통지합니다. 입장 자체는 셸이 서버에 티켓을 요청해 받아 무대에 세션으로 주입할 때만 이뤄지고, 티켓은 메모리에만 있습니다. 문이 선언된 구역에서 대화를 시도하면 구역 정책이 authority-required 로 거절합니다. 허용 여부는 위치가 아니라 티켓의 범위와 능력, 도착한 기능의 규칙이 정합니다.",
        "When the user moves inside the Godot stage, the stage notifies the web shell of zones and proximity. Entry itself happens only when the shell requests a ticket from the server and injects it into the stage as a session, and the ticket lives in memory only. Trying to talk in a zone with a declared door is rejected by the zone policy as authority-required. What is allowed is decided not by position but by the ticket's scope and capabilities and the destination feature's rules.",
      ),
      actors: [
        { id: "user", label: t("사용자", "User"), tone: "local" },
        { id: "stage", label: t("Godot 무대", "Godot stage"), sub: t("렌더 · 이동 · 구역 통지", "Render, movement, zone notices"), tone: "local" },
        { id: "shell", label: t("웹 셸", "Web shell"), sub: t("세션 · 티켓 발급", "Session, ticket issuance"), tone: "good" },
        { id: "server", label: t("실시간 서버", "Realtime server"), sub: t("티켓 검증", "Verifies tickets"), tone: "warn" },
      ],
      messages: [
        { from: "user", to: "stage", label: t("무대 안에서 이동", "Move inside the stage"), note: t("위치가 바뀔 뿐 권한은 그대로", "Only position changes, not permission") },
        { from: "stage", to: "shell", label: t("구역 · 근접 통지", "Zone and proximity notice"), note: t("셸 브리지로만 통지", "Notice only, via the shell bridge") },
        { from: "shell", to: "server", label: t("입장 티켓 요청", "Request admission ticket"), note: t("범위 · 작업 · 능력 포함", "Scope, workloads, capabilities") },
        { from: "server", to: "shell", label: t("단기 티켓 발급", "Issue short-lived ticket"), style: "dashed", note: t("게스트는 자격 검증 뒤에만", "Guests only after credential checks") },
        { from: "shell", to: "stage", label: t("세션을 브리지로 주입", "Inject session via bridge"), note: t("티켓은 메모리에만 둠", "Ticket stays in memory only") },
        { from: "server", to: "server", label: t("티켓 · 권한 검증 후 입장 허용", "Verify ticket and rights, then admit") },
        { from: "stage", to: "user", label: t("허용된 범위만 표시", "Show only what is allowed"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("공간 페이지 · Godot 무대 임베드", "Space page · Godot stage embed"),
        role: t(
          "셸이 계정 세션·티켓 발급과 갱신·연결 상태 표기를 소유하고, Godot 무대는 공간 렌더와 이동만 소유합니다. 둘 사이의 경계는 무대에서 셸로 가는 브리지와 셸에서 무대로 가는 콜백뿐입니다.",
          "The shell owns the account session, ticket issuance and renewal, and connection status, while the Godot stage owns only space rendering and movement. The only boundary between them is the stage-to-shell bridge and the shell-to-stage callbacks.",
        ),
        paths: [`${V}/StudioGodotSpaceEmbed.tsx`, `${V}/StudioVirtualSpacePageRoot.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("실시간 입장 티켓 계약", "Realtime admission ticket contract"),
        role: t(
          "서버가 발급한 단기 티켓에 범위·작업 종류·능력이 실리고, 게스트 자격(초대 토큰 43자·입장코드 6자·게스트 세션 ID 16자)은 서버 검증을 끝낸 자격만 이 형태로 실어 보냅니다.",
          "A server-issued short-lived ticket carries scope, workloads and capabilities, and guest credentials (a 43-character invite token, a 6-character entry code, a 16-character guest session id) are sent in this form only after server verification.",
        ),
        paths: ["apps/web/src/domains/creator/studio-realtime-provider-protocol.ts", "packages/contracts/src/studio-live-auth-ticket.ts"],
      },
      {
        feature: t("근처 대화 구역 정책", "Nearby-conversation zone policy"),
        role: t(
          "비공개 구역이나 문이 있는 구역은 authority-required 로 거절하고, 공개 구역에서만 거리·시간 조건으로 입장과 퇴장을 판정합니다. 권한 증거가 없으면 열린 것으로 보지 않습니다.",
          "Private zones or zones with a door are rejected as authority-required, and only public zones judge entry and exit by distance and time conditions. Absence of a grant is never treated as open.",
        ),
        paths: [`${V}/studio-virtual-space-acoustics.ts`],
      },
      {
        feature: t("실시간 서버 배포 설정", "Realtime server deployment settings"),
        role: t(
          "방당 최대 연결 수 같은 서버 쪽 강제값을 배포 설정으로 고정합니다. 무대나 셸이 이 값을 스스로 늘릴 수는 없습니다.",
          "Server-side enforcement values such as the maximum connections per room are fixed in the deployment settings. Neither the stage nor the shell can raise them on its own.",
        ),
        paths: ["deploy/cloudflare-realtime/wrangler.jsonc"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("게스트에게는 presence 능력만 주기", "Give guests presence capabilities only"),
        language: "ts",
        code: `// 게스트 티켓은 presence 전용이다. 회의·댓글 채널은 게스트에게 열지 않는다(단순화).
const MEMBER_CAPABILITIES = [
  "presence.snapshot-v1",
  "presence.members-v1",
  "screen-signaling.session-v1",
  "screen-signaling.webrtc-v1",
] as const;

const GUEST_CAPABILITIES = [
  "presence.snapshot-v1",
  "presence.members-v1",
  "presence.cursor-v1",
  "presence.resume-v1",
] as const;

export function capabilitiesFor(guest: boolean) {
  return guest ? GUEST_CAPABILITIES : MEMBER_CAPABILITIES; // 무대 안 위치와 무관하게 자격으로만 정한다
}`,
        codeEn: `// A guest ticket is presence only. Meeting and comment channels stay closed to guests (simplified).
const MEMBER_CAPABILITIES = [
  "presence.snapshot-v1",
  "presence.members-v1",
  "screen-signaling.session-v1",
  "screen-signaling.webrtc-v1",
] as const;

const GUEST_CAPABILITIES = [
  "presence.snapshot-v1",
  "presence.members-v1",
  "presence.cursor-v1",
  "presence.resume-v1",
] as const;

export function capabilitiesFor(guest: boolean) {
  return guest ? GUEST_CAPABILITIES : MEMBER_CAPABILITIES; // decided by credential only, never by position in the stage
}`,
        explain: t(
          "무대 안에서 어디에 서 있든 능력 목록은 자격으로만 정해집니다. 게스트 티켓에는 화면 신호 채널이 아예 실리지 않으므로, 무대가 원해도 회의 채널을 열 수 없습니다.",
          "Wherever you stand in the stage, the capability list is decided by credential only. A guest ticket never carries the screen-signaling channels, so the stage cannot open a meeting channel even if it wanted to.",
        ),
        source: `${V}/StudioGodotSpaceEmbed.tsx`,
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
      { title: "TypeScript · Discriminated unions", url: "https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions", kind: "docs", note: t("자격 종류를 안전하게 나누는 타입", "A type that splits credential kinds safely") },
      { title: "OWASP · Authorization Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html", kind: "guide", note: t("권한 확인은 서버에서 강제", "Enforce authorization on the server") },
      { title: "Cloudflare · Durable Objects", url: "https://developers.cloudflare.com/durable-objects/", kind: "docs", note: t("실시간 방 서버의 기반", "The foundation of the realtime room server") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "공간은 새로운 권한 시스템이 아닙니다. Godot 무대 안에서 문 앞에 서거나 구역에 들어가도 무대가 하는 일은 위치와 구역을 셸에 알리는 데까지입니다. 입장은 서버가 발급한 짧은 수명의 티켓이 정하고, 그 티켓에 실린 범위와 능력이 닿을 수 있는 기능을 정합니다. 게스트 티켓은 presence 전용이라 무대 안에서 어디에 서든 회의 채널은 열리지 않습니다.",
        "Space is not a new permission system. Standing at a door or entering a zone inside the Godot stage only makes the stage report position and zones to the shell. Admission is decided by a short-lived ticket the server issues, and the scope and capabilities on that ticket decide which features are reachable. A guest ticket is presence only, so no meeting channel opens wherever the guest stands in the stage.",
      ),
      analogy: t(
        "건물 로비의 안내판입니다. 안내판은 '3층 인사팀은 이쪽'이라고 알려 줄 뿐이고, 3층 문을 여는 것은 출입증입니다. 무대가 안내판, 티켓이 출입증입니다.",
        "It is the directory sign in a building lobby. The sign only says the HR team on the third floor is this way; what opens the third-floor door is your access card. The stage is the sign, and the ticket is the card.",
      ),
      questions: [
        {
          question: t("문 앞에 서면 문이 열리나요?", "Does standing at a door open it?"),
          answer: t(
            "아니요. 위치는 안내와 연출만 정합니다. 문이 선언된 구역은 권위 있는 어댑터의 권한 증거가 없으면 닫힌 채이고, 근처 대화도 authority-required 로 거절됩니다.",
            "No. Position only drives guidance and presentation. A zone with a declared door stays closed without a grant from an authoritative adapter, and nearby conversation there is rejected as authority-required.",
          ),
        },
        {
          question: t("게스트는 무대에서 무엇을 할 수 있나요?", "What can a guest do in the stage?"),
          answer: t(
            "서버가 초대 토큰이나 입장코드를 검증한 뒤 presence 전용 티켓을 받습니다. 다른 사람의 존재를 보고 함께 있는 것까지이고, 회의·댓글 채널은 티켓에 실리지 않습니다.",
            "After the server verifies an invite token or entry code, the guest receives a presence-only ticket. They can see others and be present together, and meeting and comment channels are not on the ticket.",
          ),
        },
        {
          question: t("티켓을 무대가 직접 만들면 안 되나요?", "Why can the stage not mint its own ticket?"),
          answer: t(
            "티켓은 서버만 발급하고 검증합니다. 셸도 발급을 요청하고 메모리에만 둘 뿐, 저장하거나 URL·로그에 남기지 않습니다. 무대는 세션으로 주입받은 티켓을 소비만 합니다.",
            "Only the server issues and verifies tickets. The shell merely requests issuance and keeps the ticket in memory, never persisting it or putting it in a URL or a log. The stage only consumes the ticket injected as a session.",
          ),
        },
      ],
      pitfall: t(
        "'무대 안에서는 권한 걱정이 없다'는 과장입니다. 이 카드는 티켓 계약·셸과 무대의 경계·구역 정책 코드·배포 설정값을 확인했을 뿐, 운영 환경의 다중 사용자 실측은 하지 못했습니다. 삭제된 웹 클라이언트의 액션 시트나 오케스트레이터를 현행처럼 말하지 마세요.",
        "'There are no permission worries inside the stage' would be an exaggeration. This card verified the ticket contract, the shell and stage boundary, the zone policy code and the deployment settings, but did not measure multi-user behaviour in production. Do not describe the removed web client's action sheet or orchestrator as if they were current.",
      ),
    },
    technologies: ["TypeScript", "React", "Godot", "Cloudflare Workers"],
    facts: [
      { value: "60초", label: t("라이브 인증 티켓 수명 상한(60,000ms)", "Live auth ticket lifetime cap (60,000 ms)"), source: "packages/contracts/src/studio-live-auth-ticket.ts" },
      { value: "43자 · 6자 · 16자", label: t("게스트 초대 토큰 / 입장코드 / 게스트 세션 ID 길이", "Guest invite token / entry code / guest session id length"), source: "apps/web/src/domains/creator/studio-realtime-provider-protocol.ts" },
      { value: "64", label: t("실시간 방당 최대 연결 수(배포 설정값)", "Maximum connections per realtime room (deployment setting)"), source: "deploy/cloudflare-realtime/wrangler.jsonc" },
      { value: "120px / 156px", label: t("근처 대화 입장 / 퇴장 반경(설계값)", "Nearby-conversation enter / exit radius (design value)"), source: `${V}/studio-virtual-space-acoustics.ts` },
      { value: "300ms / 800ms", label: t("근처 대화 입장 / 퇴장 확정 시간(설계값)", "Nearby-conversation enter / exit confirm time (design value)"), source: `${V}/studio-virtual-space-acoustics.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
