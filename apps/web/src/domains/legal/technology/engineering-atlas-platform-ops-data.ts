import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · platform-ops 카테고리 — 데이터베이스 카드(마이그레이션 원장·단일 쓰기 권위·연합 무료 데이터 플레인).
 * 사실은 2026-10-07 기준 코드·문서로 확인했다. 운영 DB의 실제 연결 대상·행 수·대시보드 값은 열람하지 않았다.
 * 런타임 DB 표기: 현재 쓰기 권위는 Supabase PostgreSQL, Neon 은 legacy 보존(docs/operations/canonical-database-topology.md).
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const CHECKSUM_MIGRATION_LEDGER: EngineeringAtlasEntry = {
  id: "checksum-migration-ledger",
  category: "platform-ops",
  name: "Checksum migration ledger",
  title: t("적용한 SQL은 지문을 박아 두고, 고치면 거부합니다", "Applied SQL gets a fingerprint, and editing it is refused"),
  status: "configured",
  tagline: t(
    "적용한 마이그레이션은 SHA-256 지문으로 고정하고, 빈 DB는 같은 입력이면 같은 DDL로 세웁니다.",
    "Applied migrations are pinned by SHA-256, and an empty database is built from identical DDL for identical input.",
  ),
  background: [
    t(
      "데이터베이스의 구조(테이블·컬럼)를 바꾸는 SQL 파일을 마이그레이션이라고 합니다. 이미 운영에 적용한 파일을 슬쩍 고치면, 어떤 DB에는 옛 버전이 어떤 DB에는 새 버전이 들어가 구조가 어긋납니다. 그래서 ToonStudio는 적용한 SQL마다 SHA-256 지문(내용이 한 글자만 달라져도 바뀌는 값)을 원장 테이블에 적어 두고, 지문이 달라지면 '새 번호의 파일을 추가하라'며 멈춥니다. 볼펜으로만 쓰고 수정액을 금지한 장부와 같습니다.",
      "A migration is an SQL file that changes the shape of a database (tables and columns). If a file already applied in production is quietly edited, some databases hold the old version and some the new one. So ToonStudio records a SHA-256 fingerprint (a value that changes if a single character changes) for every applied SQL file in a ledger table and stops with 'add a new numbered file' when the fingerprint differs. It is a ledger written in ink with correction fluid banned.",
    ),
    t(
      "원장은 앱이 접근하지 못하는 toonspectrum_ops 스키마에 있고, 상태는 applying·applied·failed, 출처는 executed·adopted·bootstrap입니다. 승인형 수동 워크플로의 러너는 ① 파일마다 지문을 계산해 원장과 비교하고 ② 아직 없으면 applying 행을 먼저 선점한 뒤 SQL을 실행하고 ③ 끝나면 applied로 바꿉니다. SQL 이 실패하면 failed 로 기록되고, 결과를 알 수 없게 끊기면(연결 유실 등) applying 이 남습니다. 둘 다 다음 실행이 거부되고 repair 모드에서만 다시 시도합니다. 같은 지문 검사가 API 빌드의 첫 단계에도 있어 적용한 SQL을 고친 커밋은 CI와 배포 빌드에서 모두 막힙니다.",
      "The ledger lives in a toonspectrum_ops schema the app cannot reach, with states applying, applied and failed and provenance executed, adopted and bootstrap. The runner of an approval-gated manual workflow (1) hashes each file and compares it with the ledger, (2) claims an applying row first if none exists and then runs the SQL, and (3) flips it to applied. If the SQL fails, the row is recorded as failed, and if the outcome is unknown (for example a lost connection) applying remains. Either way the next run refuses and only repair mode retries. The same fingerprint check is the first step of the API build, so a commit that edits applied SQL is blocked in CI and in the release build.",
    ),
    t(
      "빈 DB를 처음 세울 때는 drizzle-kit push 대신 generate로 DDL을 두 번 만들어 완전히 같은지 비교한 뒤 단일 트랜잭션(BEGIN~COMMIT)으로 적용합니다. push는 대상 DB를 들여다보고 차이만큼 SQL을 만들어서 대상의 상태에 따라 문장이 달라지고, 적용이 원자적이지 않으며 일부 실패가 종료 코드 0으로 묻힐 수 있습니다. 입력(스키마 파일)이 같으면 출력(DDL)도 같아야 재현하고 감사할 수 있습니다.",
      "To build an empty database, the bootstrap generates the DDL twice with drizzle-kit generate instead of push, compares the two runs, and applies them in one transaction (BEGIN to COMMIT). push inspects the target and emits only the difference, so statements vary with the target's state, application is not atomic, and some failures can hide behind exit code 0. Identical input (schema files) must give identical output (DDL) for the result to be reproducible and auditable.",
    ),
    t(
      "대안은 Flyway·Liquibase의 검증 체크섬이나 베이스라인 SQL 덤프입니다. 여기에 '채택(adopt)'을 더해 원장 도입 전에 이미 운영에 있던 0019번까지의 이력을 SQL 재실행 없이 기록했습니다. 파괴적 변경은 구 런타임과 호환되는 추가 전용 단계(expand)와 정리 단계(contract)를 두 번의 검토된 병합으로 나눕니다. 한계: 생성기 버전이 바뀌면 DDL이 달라질 수 있어 '두 번 생성'은 같은 버전 안의 비결정성만 잡습니다.",
      "Alternatives are the validated checksums of Flyway and Liquibase, or a baseline SQL dump. On top of that, 'adopt' records the history through migration 0019 that already existed in production before the ledger, without re-running SQL. Destructive changes are split into an additive expand step compatible with the old runtime and a later contract step, as two reviewed merges. A limit: a new generator version can change the DDL, so 'generate twice' only catches nondeterminism within one version.",
    ),
  ],
  keyPoints: [
    t("적용한 SQL은 SHA-256 지문 고정, 고치면 즉시 거부", "Applied SQL is pinned by SHA-256; edits are refused at once"),
    t("실패는 failed, 결과 불명은 applying으로 남아 repair 모드에서만 재시도", "Failure is recorded as failed and an unknown outcome stays applying; only repair mode retries"),
    t("같은 검사가 PR CI와 API 배포 빌드의 첫 단계에도 있음", "The same check is the first step of PR CI and the API build"),
    t("빈 DB는 generate 두 번 비교 후 단일 트랜잭션으로 적용", "An empty DB is built from two generate runs in one transaction"),
  ],
  diagram: {
    id: "checksum-migration-ledger-diagram",
    kind: "sequence",
    title: t("마이그레이션 한 건이 적용되는 순서", "How one migration gets applied"),
    caption: t(
      "지문을 먼저 대조하고, 실행 전에 applying 행을 선점하며, 끝난 뒤에만 applied로 바꿉니다.",
      "Compare the fingerprint first, claim an applying row before running, and mark applied only afterwards.",
    ),
    alt: t(
      "승인자가 릴리스 SHA와 확인 문구를 입력하면 워크플로가 그 SHA가 main의 조상인지 확인하고 러너를 부릅니다. 러너는 파일의 SHA-256과 원장의 checksum을 비교하고, 같으면 건너뛰고 다르면 멈춥니다. 새 파일이면 applying 행을 먼저 선점하고 SQL을 실행한 뒤 applied로 갱신합니다. 마지막에 구조와 권한을 검증해 결과를 승인자에게 보고합니다.",
      "An approver enters a release SHA and a confirmation phrase; the workflow checks that the SHA is an ancestor of main and calls the runner. The runner compares each file's SHA-256 with the ledger's checksum, skips it if equal and stops if different. For a new file it claims an applying row first, runs the SQL and updates it to applied. Finally it verifies structure and permissions and reports back to the approver.",
    ),
    actors: [
      { id: "human", label: t("승인자", "Approver"), sub: t("필수 검토자 + 확인 문구", "Reviewer plus phrase"), tone: "warn" },
      { id: "flow", label: t("수동 워크플로", "Manual workflow"), sub: t("production-database 환경", "production-database env"), tone: "neutral" },
      { id: "runner", label: t("마이그레이션 러너", "Migration runner"), sub: t("SHA-256 지문 대조", "SHA-256 comparison"), tone: "server" },
      { id: "ledger", label: t("원장 DB", "Ledger DB"), sub: t("toonspectrum_ops 스키마", "toonspectrum_ops schema"), tone: "server" },
    ],
    messages: [
      { from: "human", to: "flow", label: t("릴리스 SHA·확인 문구 입력", "Enter release SHA and phrase"), note: t("writer를 비운 뒤 NO-STUDIO-WRITERS", "NO-STUDIO-WRITERS after draining writers") },
      { from: "flow", to: "flow", label: t("SHA가 main의 조상인지 확인", "SHA is a main ancestor?") },
      { from: "flow", to: "runner", label: t("mode 선택: apply", "Mode: apply"), note: t("adopt와 repair 모드도 있음", "adopt and repair also exist") },
      { from: "runner", to: "ledger", label: t("파일 지문 ↔ 원장 checksum 비교", "File hash vs ledger checksum"), note: t("다르면 중단: 새 번호로 추가하라", "If different, stop: add a new numbered file") },
      { from: "ledger", to: "runner", label: t("적용됨 · 없음 · 중단됨", "applied, none or interrupted"), style: "dashed" },
      { from: "runner", to: "ledger", label: t("applying 선점 뒤 SQL 실행", "Claim applying, then run SQL"), note: t("실패는 failed, 결과 불명은 applying — 다음 실행 거부", "failed on error, applying if unknown: the next run is refused") },
      { from: "runner", to: "ledger", label: t("applied로 갱신", "Mark applied") },
      { from: "runner", to: "flow", label: t("구조·권한 검증 결과", "Structure and ACL check"), style: "dashed", note: t("런타임 역할의 ops 권한 없음 확인", "Runtime role has no ops access") },
      { from: "flow", to: "human", label: t("성공 · 실패 보고", "Success or failure report"), style: "dashed" },
    ],
  },
  usage: [
    {
      feature: t("스키마 변경 승인 절차 (수동 워크플로)", "Schema-change approval (manual workflow)"),
      role: t(
        "required reviewer 승인 뒤 정확한 40자리 SHA로만 실행하고, 러너가 지문 대조·선점·적용·검증을 맡습니다. DDL 작성자 역할과 앱 런타임 역할은 분리됩니다.",
        "It runs only after required-reviewer approval with an exact 40-character SHA, and the runner handles fingerprint comparison, claiming, applying and verification. The DDL author role and the app runtime role are kept separate.",
      ),
      paths: [
        ".github/workflows/production-database-migrations.yml",
        "scripts/run-production-database-migrations.mjs#decideMigrationAction",
        "apps/api/src/platform/database/migrations/0023_production_migration_ledger.sql",
      ],
    },
    {
      feature: t("적용한 SQL 수정 금지 (PR CI와 배포 빌드)", "No edits to applied SQL (PR CI and release build)"),
      role: t(
        "API 빌드의 첫 단계가 기준선 SHA-256과 현재 파일을 비교해, 적용한 마이그레이션이 한 글자라도 바뀌면 빌드를 실패시킵니다.",
        "The first step of the API build compares baseline SHA-256 values with the current files and fails the build if an applied migration changed by even one character.",
      ),
      paths: [
        "scripts/verify-production-release-compatibility.mjs",
        "config/production-migration-baseline.json",
        "apps/api/package.json",
      ],
    },
    {
      feature: t("새 환경·빈 DB 부트스트랩", "Bootstrapping a new environment or empty database"),
      role: t(
        "스키마를 generate로 두 번 만들어 같을 때만 단일 트랜잭션으로 적용하고, 이어서 이력 채택과 나머지 마이그레이션을 이어 갑니다.",
        "It generates the schema twice and applies it in one transaction only if both runs match, then continues with history adoption and the remaining migrations.",
      ),
      paths: [
        "scripts/bootstrap-empty-production-database.mjs",
        "scripts/bootstrap-empty-production-database.test.mjs",
      ],
    },
    {
      feature: t("직접 연결 URL만 허용", "Direct connection URLs only"),
      role: t(
        "sslmode=verify-full과 channel_binding=require만 허용하고, pooler·pgbouncer 호스트와 libpq 덮어쓰기 옵션은 거부합니다.",
        "Only sslmode=verify-full and channel_binding=require are allowed, and pooler or pgbouncer hosts and libpq override options are rejected.",
      ),
      paths: ["scripts/validate-production-database-url.mjs"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("지문과 상태로 건너뛸지·실행할지·복구할지 정하기", "Deciding to skip, apply or repair from fingerprint and state"),
      language: "ts",
      code: [
        'type State = "applying" | "applied" | "failed";',
        "interface LedgerEntry { checksum: string; state: State }",
        'type Mode = "apply" | "repair";',
        "",
        "export async function sha256Hex(sql: string): Promise<string> {",
        '  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sql));',
        '  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");',
        "}",
        "",
        "export function decide(id: string, fileChecksum: string, entry: LedgerEntry | undefined, mode: Mode) {",
        "  if (!entry) {",
        '    if (mode === "repair") throw new Error(`${id}: repair는 없는 마이그레이션을 만들지 않는다`);',
        '    return "apply" as const;',
        "  }",
        "  if (entry.checksum !== fileChecksum) {",
        "    throw new Error(`${id}: 지문이 다르다. 고치지 말고 새 번호의 파일을 추가하라`);",
        "  }",
        '  if (entry.state === "applied") return "skip" as const;',
        '  if (mode === "repair") return "repair" as const; // 중단된 행만 사람이 명시적으로 복구한다',
        "  throw new Error(`${id}: ${entry.state} 상태. 명시적 repair가 필요하다`);",
        "}",
      ].join("\n"),
      codeEn: [
        'type State = "applying" | "applied" | "failed";',
        "interface LedgerEntry { checksum: string; state: State }",
        'type Mode = "apply" | "repair";',
        "",
        "export async function sha256Hex(sql: string): Promise<string> {",
        '  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sql));',
        '  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");',
        "}",
        "",
        "export function decide(id: string, fileChecksum: string, entry: LedgerEntry | undefined, mode: Mode) {",
        "  if (!entry) {",
        '    if (mode === "repair") throw new Error(`${id}: repair never creates a missing migration`);',
        '    return "apply" as const;',
        "  }",
        "  if (entry.checksum !== fileChecksum) {",
        "    throw new Error(`${id}: fingerprint differs; add a new numbered file instead of editing`);",
        "  }",
        '  if (entry.state === "applied") return "skip" as const;',
        '  if (mode === "repair") return "repair" as const; // only an interrupted row, explicitly, by a person',
        "  throw new Error(`${id}: state is ${entry.state}; an explicit repair is required`);",
        "}",
      ].join("\n"),
      explain: t(
        "순서가 중요합니다. 원장에 행이 없으면 실행, 있으면 먼저 지문을 비교하고 같을 때만 상태를 봅니다. 실제 러너는 여기에 adopt 모드와 출처(provenance) 검사가 더해집니다.",
        "Order matters: no row means apply; otherwise compare the fingerprint first and look at the state only if it matches. The real runner adds the adopt mode and a provenance check.",
      ),
      source: "scripts/run-production-database-migrations.mjs",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("두 번 만들어 같을 때만, 한 트랜잭션으로", "Only when two runs match, in one transaction"),
      language: "ts",
      code: [
        "type GenerateDdl = () => string[]; // 스키마 파일만 입력으로 받는 순수 함수",
        "",
        "export function provisionStatements(generate: GenerateDdl): string[] {",
        "  const first = generate();",
        "  const second = generate(); // 두 번 만들어 완전히 같을 때만 진행한다",
        '  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("DDL 생성이 결정적이지 않다");',
        '  if (first.length === 0) throw new Error("적용할 DDL이 없다");',
        "  return first;",
        "}",
        "",
        "export const inSingleTransaction = (statements: string[]): string =>",
        "  `BEGIN;\\n${statements.map((s) => (s.endsWith(\";\") ? s : `${s};`)).join(\"\\n\")}\\nCOMMIT;`;",
      ].join("\n"),
      codeEn: [
        "type GenerateDdl = () => string[]; // a pure function whose only input is the schema files",
        "",
        "export function provisionStatements(generate: GenerateDdl): string[] {",
        "  const first = generate();",
        "  const second = generate(); // proceed only if two runs are exactly equal",
        '  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("DDL generation is not deterministic");',
        '  if (first.length === 0) throw new Error("there is no DDL to apply");',
        "  return first;",
        "}",
        "",
        "export const inSingleTransaction = (statements: string[]): string =>",
        "  `BEGIN;\\n${statements.map((s) => (s.endsWith(\";\") ? s : `${s};`)).join(\"\\n\")}\\nCOMMIT;`;",
      ].join("\n"),
      explain: t(
        "입력이 DB 상태가 아니라 스키마 파일뿐이라서 '두 번 만들면 같다'를 검증할 수 있습니다. 한 트랜잭션이므로 중간에 실패하면 절반만 만들어진 DB가 남지 않습니다.",
        "Because the input is only the schema files and not the database's state, 'two runs are equal' can be verified. One transaction means a failure cannot leave a half-built database.",
      ),
      source: "scripts/bootstrap-empty-production-database.mjs",
      verify: "types",
    },
  ],
  links: [
    {
      title: "Drizzle ORM · Migrations",
      url: "https://orm.drizzle.team/docs/migrations",
      kind: "docs",
      note: t("마이그레이션 접근 방식 전체 개요", "Overview of the migration approaches"),
    },
    {
      title: "Drizzle Kit · generate",
      url: "https://orm.drizzle.team/docs/drizzle-kit-generate",
      kind: "docs",
      note: t("DB에 접속하지 않고 SQL을 만드는 명령", "The command that writes SQL without connecting to a database"),
    },
    {
      title: "Drizzle Kit · push",
      url: "https://orm.drizzle.team/docs/drizzle-kit-push",
      kind: "docs",
      note: t("DB 상태와 비교해 바로 적용하는 명령", "The command that diffs against the database and applies at once"),
    },
    {
      title: "PostgreSQL · ALTER TABLE (NOT VALID, VALIDATE CONSTRAINT)",
      url: "https://www.postgresql.org/docs/current/sql-altertable.html",
      kind: "docs",
      note: t("긴 잠금을 피하는 2단계 제약 추가", "Two-step constraint adding that avoids long locks"),
    },
    {
      title: "Martin Fowler · Parallel Change",
      url: "https://martinfowler.com/bliki/ParallelChange.html",
      kind: "article",
      note: t("expand/contract 패턴의 원전", "The source of the expand/contract pattern"),
    },
  ],
  chapterIds: ["infrastructure", "delivery"],
  talk: {
    pitch: t(
      "DB 구조를 바꾸는 SQL은 한 번 적용하면 지문을 박아 둡니다. 나중에 같은 파일을 고치면 지문이 달라져서 CI와 배포 빌드가 멈추고, 고치려면 새 번호의 파일을 추가해야 합니다. 새 DB를 처음 세울 때도 'DB 상태를 보고 맞추는' 방식 대신 스키마 파일로 DDL을 두 번 만들어 같은지 확인한 뒤 한 트랜잭션으로 적용합니다. 같은 입력은 늘 같은 결과를 냅니다.",
      "Once SQL that changes the database shape is applied, its fingerprint is pinned. Editing the same file later changes the fingerprint, so CI and the release build stop, and the fix is to add a new numbered file. Even for a brand-new database, instead of matching against its state, the DDL is generated twice from the schema files, compared, and applied in one transaction. The same input always gives the same result.",
    ),
    analogy: t(
      "은행 장부처럼 볼펜으로만 쓰고 수정액을 금지합니다. 틀렸으면 지우지 않고 '정정 전표'를 새로 씁니다.",
      "Like a bank ledger written only in ink: a mistake is never erased; a new correcting entry is written.",
    ),
    questions: [
      {
        question: t("적용 도중 실패하면 어떻게 되나요?", "What happens if an apply fails midway?"),
        answer: t(
          "실행 전에 applying 행을 선점해 두므로, SQL 이 실패하면 그 행이 failed 로 바뀌고 결과를 알 수 없게 끊기면 applying 으로 남아, 어느 쪽이든 다음 실행이 거부됩니다. 자동으로 다시 시도하지 않고 사람이 원인을 확인한 뒤 repair 모드를 골라야 합니다.",
          "Because an applying row is claimed before running, a failed SQL flips that row to failed and an unknown outcome leaves it applying; either way the next run refuses. It never retries automatically; a person checks the cause and then chooses repair mode.",
        ),
      },
      {
        question: t("운영에서 drizzle-kit push를 쓰나요?", "Is drizzle-kit push used in production?"),
        answer: t(
          "아니요. 앱의 build·start·health 어디에서도 DDL이나 push를 실행하지 않는다고 DEPLOY.md에 적혀 있고, 부트스트랩 테스트가 push 호출이 코드에 들어오는 것을 막습니다.",
          "No. DEPLOY.md states that no app build, start or health command runs DDL or push, and the bootstrap test blocks a push call from entering the code.",
        ),
      },
      {
        question: t("테이블을 지우는 변경은 어떻게 하나요?", "How are destructive changes like dropping a table handled?"),
        answer: t(
          "먼저 구 런타임과 호환되는 추가 전용 변경(expand)만 적용하고, 구 바이너리가 완전히 사라진 뒤에 별도 contract 릴리스에서 삭제·이름 변경을 합니다(DEPLOY.md의 expand/contract 절차).",
          "First only an additive change compatible with the old runtime (expand) is applied; deletions and renames wait for a separate contract release after the old binary is gone (the expand/contract procedure in DEPLOY.md).",
        ),
      },
    ],
    pitfall: t(
      "'앱은 어디서도 DDL을 하지 않는다'고 단정하지 마세요. 3D 생성 저장소 두 곳은 첫 사용 때 CREATE TABLE IF NOT EXISTS를 실행하는 코드가 있고, 커뮤니티 스키마는 검증이 실패하면 멱등 DDL로 자가 복구를 시도합니다. 최소 권한 런타임 역할에서 어떻게 동작하는지는 확인하지 못했습니다. 빈 DB 부트스트랩을 운영 DB에서 실행한 이력도 저장소만으로는 확인할 수 없습니다.",
      "Do not claim that the app never runs DDL anywhere. Two 3D-generation stores contain code that runs CREATE TABLE IF NOT EXISTS on first use, and the community schema tries an idempotent DDL self-repair when verification fails. How these behave under a least-privilege runtime role was not checked. Whether the empty-database bootstrap was ever run against production is also not visible from the repository.",
    ),
  },
  technologies: ["PostgreSQL", "Supabase PostgreSQL", "Drizzle Kit", "GitHub Actions", "SHA-256"],
  facts: [
    {
      value: "103",
      label: t("저장소의 번호 붙은 마이그레이션 SQL 파일(작성 시점)", "Numbered migration SQL files in the repository (at writing time)"),
      source: "scripts/production-database-migrations.manifest",
    },
    {
      value: "92",
      label: t("지문을 고정한 기준선 항목(0001~0092)", "Baseline entries with pinned fingerprints (0001 to 0092)"),
      source: "config/production-migration-baseline.json",
    },
    {
      value: "60 minutes",
      label: t("repair가 stale lock을 정리할 수 있는 최소 경과 시간", "Minimum age before repair may clear a stale lock"),
      source: "scripts/run-production-database-migrations.mjs",
    },
  ],
  reviewedAt: "2026-10-07",
};

const SUPABASE_SINGLE_WRITER_AUTHORITY: EngineeringAtlasEntry = {
  id: "supabase-single-writer-authority",
  category: "platform-ops",
  name: "Single-writer database authority",
  title: t("원장 DB는 쓰기 권위가 하나: 지금은 Supabase PostgreSQL", "One writer for the ledger: Supabase PostgreSQL today"),
  status: "configured",
  tagline: t(
    "쓰기 권위는 항상 하나입니다. 지금은 Supabase PostgreSQL이고 Neon은 legacy로 보존합니다.",
    "There is always exactly one write authority: Supabase PostgreSQL now, with Neon kept as legacy.",
  ),
  background: [
    t(
      "계정·작품·결제 같은 핵심 데이터는 어디에 쓰는지가 하나로 정해져 있어야 합니다. 같은 데이터를 두 곳에 동시에 쓰면 한쪽이 느려지거나 끊겼을 때 두 장부가 서로 다른 말을 하게 됩니다. ToonStudio Core API의 영속 원장은 현재 Supabase PostgreSQL이 유일한 쓰기 권위이고, 기존 Neon 프로젝트는 legacy로 보존만 합니다. 운영 정본 문서가 '자동 이중 쓰기 금지, quota 장애를 이유로 한 자동 failover 금지'를 명시합니다.",
      "Core data such as accounts, works and payments must have exactly one place to be written. Writing the same data to two places at once makes the two ledgers disagree as soon as one is slow or cut off. The Core API's persistent ledger has Supabase PostgreSQL as its only write authority today, and the earlier Neon project is only preserved as legacy. The canonical operations document forbids automatic dual writes and automatic failover on quota trouble.",
    ),
    t(
      "연결 계약도 코드로 고정합니다. 연결 문자열의 sslmode가 prefer·require·verify-ca이면 verify-full(서버 인증서와 호스트 이름까지 검증)로 바꿔 쓰고, Supabase는 자체 CA로 서명하므로 공개 Root CA 파일을 컨테이너 이미지에 넣어 NODE_EXTRA_CA_CERTS로 신뢰시킵니다. 인증서 검증을 끄는 설정은 쓰지 않습니다. 풀은 최대 3개 연결, 유휴 10초, 연결 10초, 서버 쿼리 30초, 잠금 대기 5초처럼 모든 값에 상한과 하한을 둡니다.",
      "The connection contract is also fixed in code. A connection string whose sslmode is prefer, require or verify-ca is rewritten to verify-full (the server certificate and host name are both checked), and because Supabase signs with its own CA, the public root CA file goes into the container image and is trusted through NODE_EXTRA_CA_CERTS. Settings that turn off certificate checks are not used. The pool allows at most 3 connections, 10 s idle, 10 s connect, 30 s server query and 5 s lock wait, and every value has a floor and a ceiling.",
    ),
    t(
      "왜 이렇게 했나: 무료 DB는 연결 수와 용량이 작아서 풀을 작게 두고, 쓰기 응답이 유실되면 성공 여부가 불명확하므로 자동 재시도 대신 멱등 키와 원장으로 판정합니다. '공급자는 바꿀 수 있어도 권위는 하나'라는 규칙은 2026-09-26에 실제로 시험됐습니다. 기존 Neon의 quota 장애로 원본을 읽을 수 없게 되자 자동 전환 대신, 사람이 승인한 '기존 Neon 보존 + 새 DB에서 빈 시작'을 택했습니다(docs/FREE_INFRASTRUCTURE.md 기록).",
      "Why: a free database has few connections and little space, so the pool is kept small, and since a lost write response leaves success unknown, outcomes are judged by idempotency keys and ledgers rather than automatic retries. The rule 'providers may change, the authority stays single' was tested for real on 2026-09-26. When a quota failure on the old Neon blocked reading the original, the project chose, instead of an automatic switch, a person-approved 'keep Neon, start empty on a new database' (recorded in docs/FREE_INFRASTRUCTURE.md).",
    ),
    t(
      "한계도 있습니다. 풀 기본값 3은 주 풀의 이야기이고, 3D 생성 저장소·공급자 신원 저장소·미디어 추론 저장소와 선택형 Socket.IO 어댑터는 별도 풀을 쓸 수 있어 합산 연결 수는 더 큽니다. 또 실제 운영 DATABASE_URL이 가리키는 곳은 비밀이라 이 저장소로 확인할 수 없고, 아래 서술은 운영 정본 문서와 코드가 일치하는 범위입니다.",
      "There are limits. The default of 3 describes the main pool only; the 3D-generation, provider-identity and media-inference stores and the optional Socket.IO adapter can use separate pools, so the total is larger. And where the production DATABASE_URL really points is a secret that cannot be checked from this repository; what follows is the range in which the canonical document and the code agree.",
    ),
  ],
  keyPoints: [
    t("하나의 aggregate에는 하나의 쓰기 권위만 둠", "Each aggregate has exactly one write authority"),
    t("자동 이중 쓰기·quota 장애 자동 failover 금지", "No automatic dual writes and no automatic failover on quota trouble"),
    t("sslmode를 verify-full로 정규화, 공개 Root CA로 신뢰", "sslmode normalized to verify-full, trusted via a public root CA"),
    t("풀 기본 최대 3개 · 모든 타임아웃에 상·하한", "Default pool max of 3, every timeout bounded both ways"),
  ],
  diagram: {
    id: "supabase-single-writer-authority-diagram",
    kind: "graph",
    title: t("원장을 쓰는 곳은 하나", "Only one place writes the ledger"),
    caption: t(
      "모든 쓰기는 Supabase로 모이고, Neon과 후보 라우터는 쓰기 경로에 들어오지 못합니다.",
      "Every write converges on Supabase; Neon and the candidate router never enter the write path.",
    ),
    alt: t(
      "Core API는 공개 Root CA로 검증한 TLS 연결로 Supabase PostgreSQL에 읽고 씁니다. 마이그레이션 러너는 DDL 전용 역할로, 선택형 Studio live 서비스는 별도 직결 URL로 같은 Supabase를 씁니다. 기존 Neon은 보존만 하며 이중 쓰기는 없고, 연합 후보 라우터는 기본 비활성이라 계획만 세웁니다.",
      "The Core API reads and writes Supabase PostgreSQL over a TLS connection verified with a public root CA. The migration runner uses a DDL-only role and the optional Studio live service a separate direct URL, both against the same Supabase. The old Neon is only preserved with no dual write, and the candidate federated router is off by default and only plans.",
    ),
    nodes: [
      { id: "core", label: t("Core API", "Core API"), sub: t("풀 최대 3 · verify-full", "Pool max 3, verify-full"), tone: "server", at: [0, 1] },
      { id: "supa", label: t("Supabase PostgreSQL", "Supabase PostgreSQL"), sub: t("현재 쓰기 권위", "Current write authority"), tone: "server", shape: "cylinder", at: [1, 1] },
      { id: "migrator", label: t("마이그레이션 러너", "Migration runner"), sub: t("DDL 전용 역할", "DDL-only role"), tone: "warn", at: [2, 1] },
      { id: "ca", label: t("공개 Root CA", "Public root CA"), sub: t("NODE_EXTRA_CA_CERTS", "NODE_EXTRA_CA_CERTS"), tone: "good", at: [1, 0] },
      { id: "live", label: t("Studio live", "Studio live"), sub: t("선택형 · 별도 직결 URL", "Optional, own direct URL"), tone: "server", at: [0, 2] },
      { id: "neon", label: t("Neon", "Neon"), sub: t("legacy · 보존만", "Legacy, preserved only"), tone: "neutral", shape: "cylinder", at: [1, 2] },
      { id: "cand", label: t("연합 후보 라우터", "Candidate router"), sub: t("기본 비활성", "Off by default"), tone: "external", shape: "cloud", at: [2, 2] },
    ],
    edges: [
      { from: "core", to: "supa", label: t("읽기·쓰기", "read, write") },
      { from: "migrator", to: "supa", label: t("DDL", "DDL") },
      { from: "ca", to: "supa", label: t("TLS 신뢰", "trust TLS") },
      { from: "live", to: "supa", label: t("직결", "direct") },
      { from: "supa", to: "neon", style: "dashed", label: t("이중 쓰기 없음", "no dual write") },
      { from: "cand", to: "supa", style: "dashed", label: t("plan만", "plan only") },
    ],
  },
  usage: [
    {
      feature: t("계정·작품·커뮤니티·결제·협업 데이터 저장", "Storing accounts, works, community, payments and collaboration data"),
      role: t(
        "Core API의 모든 동적 데이터가 Drizzle과 pg 풀을 거쳐 하나의 PostgreSQL 원장에 쌓입니다. 권위 표와 Neon에 대한 명시적 규칙은 운영 정본 문서에 있습니다.",
        "All dynamic data of the Core API goes through Drizzle and a pg pool into one PostgreSQL ledger. The authority table and the explicit rules on Neon are in the canonical operations document.",
      ),
      paths: [
        "docs/operations/canonical-database-topology.md",
        "apps/api/src/platform/database/index.ts",
        "apps/api/src/platform/database/pg-connection.ts#resolvePgPoolOptions",
      ],
    },
    {
      feature: t("DB 연결 보안 (verify-full과 공개 CA)", "Database connection security (verify-full and a public CA)"),
      role: t(
        "sslmode 별칭을 verify-full로 정규화하고, Supabase 공개 Root CA를 컨테이너 이미지에 넣어 NODE_EXTRA_CA_CERTS로 신뢰합니다.",
        "It normalizes sslmode aliases to verify-full and trusts Supabase's public root CA through NODE_EXTRA_CA_CERTS inside the container image.",
      ),
      paths: [
        "apps/api/src/platform/database/pg-connection.ts#normalizePgConnectionStringForTls",
        "deploy/trust/README.md",
        ".github/workflows/api-container-release.yml",
      ],
    },
    {
      feature: t("운영 DB 시드 사고 방지", "Preventing an accidental seed on the production database"),
      role: t(
        "벤더 이름을 차단하는 방식은 이관 뒤 무력화돼, 로컬·QA 호스트만 허용하는 허용 목록 방식으로 바꿨습니다.",
        "A block list by vendor name stopped working after the migration, so it was replaced by an allow list that permits only local and QA hosts.",
      ),
      paths: ["apps/api/src/platform/database/pg-connection.ts#isLocalSeedTarget"],
    },
    {
      feature: t("선택형 실시간 서비스 (Studio live)", "Optional realtime service (Studio live)"),
      role: t(
        "같은 코드를 role로 얼려 Socket.IO만 열고, 소켓 접속 때의 권한·CRDT 상태 조회는 현재 Supabase 권위를 씁니다.",
        "The same code is frozen by role to expose only Socket.IO, and its socket-handshake permission and CRDT-state lookups use the current Supabase authority.",
      ),
      paths: ["render.yaml", "apps/api/src/config/runtime-role.ts"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("상·하한이 고정된 풀 옵션", "Pool options with fixed floors and ceilings"),
      language: "ts",
      code: [
        "type Env = Record<string, string | undefined>;",
        "",
        "// 숫자가 아니거나 범위를 벗어나면 기본값·상한·하한으로 되돌린다",
        "const bounded = (raw: string | undefined, fallback: number, min: number, max: number): number => {",
        "  const n = Number(raw);",
        "  return raw?.trim() && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;",
        "};",
        "",
        "export function poolOptions(env: Env) {",
        "  const statement = bounded(env.PG_STATEMENT_MS, 30_000, 1_000, 300_000);",
        "  return {",
        "    max: bounded(env.PG_POOL_MAX, 3, 1, 50), // 무료 DB의 연결 수를 아낀다",
        "    idleTimeoutMillis: bounded(env.PG_IDLE_MS, 10_000, 1_000, 600_000),",
        "    connectionTimeoutMillis: bounded(env.PG_CONNECT_MS, 10_000, 1_000, 30_000),",
        "    statement_timeout: statement, // 폭주 쿼리의 서버 쪽 상한",
        "    // 클라이언트 대기는 서버 실행 제한보다 최소 1초 길게 둔다",
        "    query_timeout: Math.max(bounded(env.PG_QUERY_MS, 35_000, 1_000, 360_000), statement + 1_000),",
        "  };",
        "}",
      ].join("\n"),
      codeEn: [
        "type Env = Record<string, string | undefined>;",
        "",
        "// Non-numeric or out-of-range input falls back to the default, floor or ceiling",
        "const bounded = (raw: string | undefined, fallback: number, min: number, max: number): number => {",
        "  const n = Number(raw);",
        "  return raw?.trim() && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;",
        "};",
        "",
        "export function poolOptions(env: Env) {",
        "  const statement = bounded(env.PG_STATEMENT_MS, 30_000, 1_000, 300_000);",
        "  return {",
        "    max: bounded(env.PG_POOL_MAX, 3, 1, 50), // spare the free database's connections",
        "    idleTimeoutMillis: bounded(env.PG_IDLE_MS, 10_000, 1_000, 600_000),",
        "    connectionTimeoutMillis: bounded(env.PG_CONNECT_MS, 10_000, 1_000, 30_000),",
        "    statement_timeout: statement, // server-side cap on runaway queries",
        "    // the client waits at least 1 s longer than the server's execution limit",
        "    query_timeout: Math.max(bounded(env.PG_QUERY_MS, 35_000, 1_000, 360_000), statement + 1_000),",
        "  };",
        "}",
      ].join("\n"),
      explain: t(
        "환경변수가 비었거나 이상해도, 0이나 무한대로 안전장치가 꺼지지 않게 범위를 강제합니다. 실제 코드는 transaction pooler 모드 판정과 잠금 대기·유휴 트랜잭션 제한까지 더합니다. 환경변수 이름은 설명용으로 줄였습니다.",
        "Even if an environment variable is empty or odd, ranges are enforced so a safety limit cannot be switched off with 0 or infinity. The real code also detects transaction-pooler mode and adds lock-wait and idle-transaction limits. The variable names are shortened for explanation.",
      ),
      source: "apps/api/src/platform/database/pg-connection.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("sslmode 별칭을 verify-full로 맞추기", "Normalizing sslmode aliases to verify-full"),
      language: "ts",
      code: [
        '// pg의 sslmode 별칭 의미가 바뀌어도 "인증서와 호스트 이름 검증"이 흔들리지 않게 한다',
        'const LEGACY_ALIASES = new Set(["prefer", "require", "verify-ca"]);',
        "",
        "export function normalizeTls(connectionString: string): string {",
        "  const url = new URL(connectionString);",
        '  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("postgres 프로토콜만 허용한다");',
        '  const modes = url.searchParams.getAll("sslmode");',
        '  if (modes.length > 1) throw new Error("sslmode를 반복할 수 없다");',
        "  const mode = modes[0]?.trim().toLowerCase();",
        '  if (mode && LEGACY_ALIASES.has(mode)) url.searchParams.set("sslmode", "verify-full");',
        "  return url.toString();",
        "}",
      ].join("\n"),
      codeEn: [
        '// Even if pg changes what the sslmode aliases mean, certificate and host-name checks stay on',
        'const LEGACY_ALIASES = new Set(["prefer", "require", "verify-ca"]);',
        "",
        "export function normalizeTls(connectionString: string): string {",
        "  const url = new URL(connectionString);",
        '  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("only the postgres protocol is allowed");',
        '  const modes = url.searchParams.getAll("sslmode");',
        '  if (modes.length > 1) throw new Error("sslmode must not be repeated");',
        "  const mode = modes[0]?.trim().toLowerCase();",
        '  if (mode && LEGACY_ALIASES.has(mode)) url.searchParams.set("sslmode", "verify-full");',
        "  return url.toString();",
        "}",
      ].join("\n"),
      explain: t(
        "연결 문자열 하나가 약한 검증으로 새어 들어오지 못하게 부팅 때 바로 바로잡거나 거부합니다. 실제 함수는 Neon 호스트의 평문 연결 거부 같은 호환 규칙도 가집니다.",
        "It fixes or rejects the connection string at boot so a single string cannot smuggle in weak verification. The real function also has compatibility rules, such as refusing a plaintext connection to a Neon host.",
      ),
      source: "apps/api/src/platform/database/pg-connection.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "PostgreSQL · SSL support (libpq)",
      url: "https://www.postgresql.org/docs/current/libpq-ssl.html",
      kind: "docs",
      note: t("sslmode 값과 verify-full의 의미", "What the sslmode values and verify-full mean"),
    },
    {
      title: "node-postgres · Pool",
      url: "https://node-postgres.com/apis/pool",
      kind: "docs",
      note: t("max·idleTimeoutMillis 등 풀 옵션", "Pool options such as max and idleTimeoutMillis"),
    },
    {
      title: "Supabase · Connecting to your database",
      url: "https://supabase.com/docs/guides/database/connecting-to-postgres",
      kind: "guide",
      note: t("직접 연결과 풀러 연결의 차이", "Direct versus pooler connections"),
    },
    {
      title: "Node.js · NODE_EXTRA_CA_CERTS",
      url: "https://nodejs.org/api/cli.html#node_extra_ca_certsfile",
      kind: "docs",
      note: t("추가 신뢰 CA 파일을 로드하는 환경변수", "The variable that loads an extra trusted CA file"),
    },
    {
      title: "Supabase · Pricing",
      url: "https://supabase.com/pricing",
      kind: "docs",
      note: t("무료 한도는 변하므로 게재 전 재확인", "Free limits change; recheck before relying on them"),
    },
  ],
  chapterIds: ["infrastructure", "cost-engineering"],
  talk: {
    pitch: t(
      "ToonStudio의 핵심 데이터는 한 곳에만 씁니다. 지금 그 한 곳은 Supabase PostgreSQL이고, 예전 Neon은 보존만 합니다. 무료 DB가 한도에 걸렸을 때도 몰래 다른 DB로 넘기지 않고, 사람이 승인해서 새 DB에서 빈 시작을 했습니다. 연결은 인증서와 호스트 이름까지 검증하고, 연결 수는 작게 묶어 둡니다.",
      "ToonStudio writes its core data in exactly one place. Today that place is Supabase PostgreSQL, and the older Neon is only preserved. When a free database hit its quota, the project did not silently switch to another one; a person approved a fresh start on a new database. Connections verify the certificate and host name, and the connection count is kept small.",
    ),
    analogy: t(
      "회사 금고의 열쇠가 하나뿐인 것과 같습니다. 금고는 바꿀 수 있어도 같은 돈을 두 금고에 동시에 넣지는 않습니다.",
      "It is like a company safe with a single key. The safe can be replaced, but the same money is never put into two safes at once.",
    ),
    questions: [
      {
        question: t("그래서 원장은 Neon인가요, Supabase인가요?", "So is the ledger on Neon or on Supabase?"),
        answer: t(
          "운영 정본 문서(2026-09-29 기준)와 코드 주석·인프라 기록은 모두 Supabase PostgreSQL이 현재 권위이고 Neon은 legacy 보존이라고 말합니다. 다만 운영에 실제 주입된 연결 문자열은 비밀이라 이 저장소로는 확인하지 못했습니다.",
          "The canonical operations document (dated 2026-09-29) and the code comments and infrastructure records all say Supabase PostgreSQL is the current authority and Neon is preserved as legacy. The connection string actually injected in production is a secret and could not be checked from this repository.",
        ),
      },
      {
        question: t("한도에 걸리면 자동으로 다른 DB로 넘어가나요?", "Does it fail over automatically when a quota is hit?"),
        answer: t(
          "아니요. 정책이 자동 유료 전환, 자동 쓰기 failover, 공급자 사이 동기 쓰기를 모두 금지합니다. 2026-09-26의 실제 사례도 자동 전환이 아니라 사람이 승인한 빈 시작이었습니다.",
          "No. The policy forbids automatic paid overflow, automatic write failover and synchronous cross-provider writes. The real case on 2026-09-26 was a person-approved fresh start, not an automatic switch.",
        ),
      },
      {
        question: t("DB 연결은 몇 개나 쓰나요?", "How many database connections does it use?"),
        answer: t(
          "주 풀의 기본 상한은 3개입니다. 다만 3D 생성·공급자 신원·미디어 추론 저장소와 선택형 Socket.IO 어댑터가 별도 풀을 만들 수 있어 'API는 연결 3개만 쓴다'고 말하면 과장입니다.",
          "The main pool's default cap is 3. But the 3D-generation, provider-identity and media-inference stores and the optional Socket.IO adapter can create separate pools, so 'the API uses only 3 connections' would be an overstatement.",
        ),
      },
    ],
    pitfall: t(
      "오래된 문서나 주석에는 Neon을 현재 DB처럼 쓴 표현이 남아 있을 수 있습니다. 발표에서는 운영 정본 문서를 따르세요. 또 Render가 소스 빌드인지 이미지 배포인지에 따라 공개 CA(NODE_EXTRA_CA_CERTS)를 어떻게 싣는지가 달라지며, 실제 운영 방식은 저장소만으로 확정할 수 없습니다.",
      "Older documents or comments may still describe Neon as the current database; follow the canonical operations document when presenting. Also, how the public CA (NODE_EXTRA_CA_CERTS) is shipped depends on whether Render runs a source build or an image, and the real setup cannot be confirmed from the repository alone.",
    ),
  },
  technologies: ["Supabase PostgreSQL", "Supabase", "PostgreSQL", "Neon", "Render", "Drizzle ORM"],
  facts: [
    {
      value: "3",
      label: t("주 풀의 기본 최대 연결 수(범위 1~50)", "Default maximum connections of the main pool (range 1 to 50)"),
      source: "apps/api/src/platform/database/pg-connection.ts",
    },
    {
      value: "2031-04-26",
      label: t("저장소에 둔 Supabase 공개 Root CA의 만료일(문서 기록)", "Expiry of the Supabase public root CA kept in the repository (documented)"),
      source: "deploy/trust/README.md",
    },
  ],
  reviewedAt: "2026-10-07",
};

const FEDERATED_FREE_DATA_PLANE: EngineeringAtlasEntry = {
  id: "federated-free-data-plane",
  category: "platform-ops",
  name: "Federated free data plane",
  title: t("무료 DB 후보 16곳, 하지만 기본은 꺼져 있습니다", "Sixteen free-database candidates, switched off by default"),
  status: "configured",
  tagline: t(
    "후보 16곳·샤드 21·라우트 36을 계획으로 적어 두고, 무료 정책은 코드가 검증합니다.",
    "16 candidates, 21 shards and 36 routes are written down as a plan, and code verifies the free policy.",
  ),
  background: [
    t(
      "무료 서비스는 저마다 한도가 작습니다. 독립된 무료 한도를 여럿 합치면 더 많은 방문자를 감당할 수 있다는 목표로, ToonStudio는 DB 후보 16곳을 정책 파일(config/free-database-federation.json)에 적고 데이터를 21개 논리 샤드와 36개 라우트에 배치하는 계획을 세웠습니다. 한도가 서로 다른 놀이공원 자유이용권 여러 장을 용도별로 나눠 쓰는 계획표와 같습니다.",
      "Each free service has a small allowance. Aiming to serve more visitors by combining several independent free allowances, ToonStudio wrote 16 candidate databases into a policy file (config/free-database-federation.json) and planned how to place data across 21 logical shards and 36 routes. It is like a plan for splitting several amusement-park passes with different limits by purpose.",
    ),
    t(
      "중요한 것은 이것이 '계획'이라는 점입니다. 라우터의 plan()은 SQL이나 문서 쓰기를 실행하지 않고, FEDERATED_DATA_PLANE_ENABLED가 true일 때만 라우터가 만들어지며 기본은 꺼짐입니다. 코드에서 이 서비스를 호출하는 곳은 모듈 밖에서 찾지 못했습니다. 16곳 중 9곳은 인증·연결 전이라 운영 처리량에 넣지 않고, 현재 운영 권위는 Supabase PostgreSQL(원장)·Cloudflare·Render·Upstash입니다. 정책은 자동 유료 전환, 자동 쓰기 failover, 공급자 사이 동기 쓰기를 모두 false로 못 박습니다.",
      "What matters is that this is a plan. The router's plan() executes no SQL or document writes, the router exists only when FEDERATED_DATA_PLANE_ENABLED is true, and the default is off. No caller of this service outside its module was found in the code. Nine of the 16 are not yet authenticated or connected and are not counted in production throughput; the operating authorities are Supabase PostgreSQL (ledger), Cloudflare, Render and Upstash. The policy pins automatic paid overflow, automatic write failover and synchronous cross-provider writes to false.",
    ),
    t(
      "'무료 정책'은 문서가 아니라 코드로 검증합니다. pnpm verify:free-infrastructure가 정책의 모드(free-strict), 자동 배포·자동 유료 failover 금지, 금지 공급자 재등장 여부를 검사하고, 퇴역한 인프라 파일이 되살아나거나 활성 문서에 퇴역 인프라가 언급되면 실패합니다. 공급자마다 앱 상한 비율(예: 0.8)을 두어 공급자가 한도를 알려 주기 전에 먼저 멈춥니다. 쿼터 스냅샷이 900초보다 오래되면 라우터가 QUOTA_SNAPSHOT_REQUIRED로 거절합니다.",
      "The 'free policy' is verified by code, not by documents. pnpm verify:free-infrastructure checks the policy mode (free-strict), the bans on automatic deploys and automatic paid failover, and whether a forbidden provider reappears, and it fails if a retired infrastructure file comes back or an active document mentions retired infrastructure. Each provider gets an application cap ratio (for example 0.8) so the app stops before the provider reports the limit. If a quota snapshot is older than 900 seconds the router refuses with QUOTA_SNAPSHOT_REQUIRED.",
    ),
    t(
      "한계도 분명합니다. D1처럼 계정 단위로 공유되는 한도는 DB를 여럿 만들어도 합계가 늘지 않고, 후보·샤드·라우트의 개수는 처리량이 아닙니다. 한도 수치는 파일 단위 확인일(2026-09-26)과 함께 읽어야 하며 공급자 요금은 바뀔 수 있습니다. 문서도 광고된 무료 quota를 코드에 고정하지 않는다는 방침을 적습니다. 60·70·80·85·95% 단계 임계는 정책 파일(config/free-infrastructure-policy.json)과 검증 스크립트에만 있고, 런타임이 집행하는 것은 공급자별 앱 상한 비율(예: 0.8) 하나입니다.",
      "The limits are clear. An account-wide allowance such as D1's does not grow by creating more databases, and the number of candidates, shards and routes is not throughput. The limit numbers must be read with the file-level verification date (2026-09-26), and provider pricing can change; the docs also state a policy of not hard-coding advertised free quotas. The 60, 70, 80, 85 and 95 percent stage thresholds exist only in the policy file (config/free-infrastructure-policy.json) and its verification script; what the runtime enforces is a single per-provider application cap ratio (for example 0.8).",
    ),
  ],
  keyPoints: [
    t("후보 16곳 · 샤드 21 · 라우트 36: 계획이지 처리량이 아님", "16 candidates, 21 shards, 36 routes: a plan, not throughput"),
    t("라우터는 기본 비활성, 쿼터 스냅샷이 낡으면 거절", "The router is off by default and refuses stale quota snapshots"),
    t("정책 검증기가 유료 전환·금지 공급자를 막되 전체 검사는 수동·로컬", "The policy verifier blocks paid overflow and banned providers; full check is manual or local"),
    t("한도 수치는 날짜와 함께: 파일 단위 확인일 2026-09-26", "Read limit numbers with their date: file-level check on 2026-09-26"),
  ],
  diagram: {
    id: "federated-free-data-plane-diagram",
    kind: "layers",
    title: t("무엇이 운영 중이고 무엇이 계획인가", "What is operating and what is only planned"),
    caption: t(
      "위쪽 두 단만 운영 처리량에 들어가고, 나머지는 후보와 계획입니다. 검증기가 가장 아래에서 정책을 지킵니다.",
      "Only the top layer counts toward operating throughput; the rest are candidates and plans, with a verifier guarding the policy at the bottom.",
    ),
    alt: t(
      "맨 위는 운영 권위로 Supabase PostgreSQL 원장과 Upstash 조정이 있습니다. 그 아래는 자원만 만들어 둔 Firestore·RTDB·BigQuery와 전환 대기 중인 D1 분석 버퍼입니다. 다음은 인증 전 후보 9곳이고, 그 아래는 기본 비활성인 라우터 plan()입니다. 맨 아래의 정책 검증기가 자동 유료 전환과 금지 공급자를 CI에서 막습니다.",
      "At the top are the operating authorities: the Supabase PostgreSQL ledger and Upstash coordination. Below are Firestore, RTDB and BigQuery, where only resources were created, and the D1 analytics buffer awaiting cutover. Next are nine candidates not yet authenticated, then the router plan(), off by default. The policy verifier at the bottom blocks automatic paid overflow and banned providers in CI.",
    ),
    layers: [
      {
        id: "operating",
        label: t("운영 권위 (문서 기록)", "Operating authorities (documented)"),
        sub: t("Supabase PostgreSQL 원장 · Upstash 조정 · Cloudflare · Render", "Supabase ledger, Upstash coordination, Cloudflare, Render"),
        tone: "good",
        chips: ["Supabase PostgreSQL", "Upstash Redis", "Render"],
      },
      {
        id: "provisioned",
        label: t("자원만 만든 단계", "Resources created only"),
        sub: t("Firestore · Firebase RTDB · BigQuery, D1 분석 버퍼는 전환 대기", "Firestore, Firebase RTDB, BigQuery; D1 analytics buffer awaits cutover"),
        tone: "external",
        chips: ["Firestore", "Firebase RTDB", "BigQuery"],
      },
      {
        id: "candidates",
        label: t("인증 전 후보 9곳", "Nine candidates before auth"),
        sub: t("TiDB · CockroachDB · Turso · Cosmos · DynamoDB 등", "TiDB, CockroachDB, Turso, Cosmos, DynamoDB and more"),
        tone: "warn",
      },
      {
        id: "router",
        label: t("라우터 plan() · 기본 비활성", "Router plan(), off by default"),
        sub: t("쿼터 스냅샷이 900초를 넘으면 거절, 자동 유료 전환·failover 없음", "Refuses snapshots over 900 s; no paid overflow or failover"),
        tone: "neutral",
      },
      {
        id: "verifier",
        label: t("정책 검증기 (CI)", "Policy verifier (CI)"),
        sub: t("정책 파일이 어긋나면 정책 단위 테스트가 실패, 전체 검사는 수동·로컬", "Policy unit test fails on a drifted policy file; full check is manual or local"),
        tone: "edge",
      },
    ],
    brackets: [
      { label: t("처리량 합산에 쓰지 않는 계획", "Plans not summed into throughput"), layerIds: ["provisioned", "candidates", "router"] },
    ],
  },
  usage: [
    {
      feature: t("무료 한도 정책 (운영 기준 기록)", "Free-tier policy (operations record)"),
      role: t(
        "공급자별 무료 한도, 앱 상한 비율, 청구 경계를 JSON으로 적고 날짜를 붙여 둡니다. 숫자는 이 파일에 적힌 값만 인용합니다.",
        "Per-provider free limits, application cap ratios and billing boundaries are written in JSON with a date. Numbers are quoted only from what this file records.",
      ),
      paths: [
        "config/free-database-federation.json",
        "config/free-infrastructure-policy.json",
        "scripts/verify-free-database-federation.mjs",
      ],
    },
    {
      feature: t("공급자 후보 라우터 (기본 비활성)", "Candidate provider router (off by default)"),
      role: t(
        "라우트별로 후보 샤드의 쿼터 스냅샷을 읽어 계획만 세웁니다. 환경 스위치가 켜지지 않으면 라우터는 null이고 plan()도 null입니다.",
        "For each route it reads candidate shards' quota snapshots and only makes a plan. Without the environment switch the router is null and plan() returns null.",
      ),
      paths: [
        "apps/api/src/platform/federated-data-plane/federated-data-plane-routing.ts",
        "apps/api/src/platform/federated-data-plane/federated-data-plane.module.ts",
      ],
    },
    {
      feature: t("무료 정책 검증 (verify:free-infrastructure)", "Free-policy verification (verify:free-infrastructure)"),
      role: t(
        "정책 JSON의 필수 규칙과 퇴역 인프라 부활 여부를 검사해 실패시킵니다(전체 검사는 수동 워크플로·로컬 ci, 코어 CI는 정책 단위 테스트).",
        "It checks the mandatory rules of the policy JSON and any revival of retired infrastructure, failing on a violation (the full check runs in a manual workflow and local ci; core CI runs the policy unit test).",
      ),
      paths: [
        "scripts/free-infrastructure-policy.mjs#validateFreeInfrastructureRepository",
        "scripts/verify-free-infrastructure-policy.mjs",
      ],
    },
    {
      feature: t("무엇이 실제 권위인지 알려 주는 운영 문서", "The operations documents that say what is truly authoritative"),
      role: t(
        "후보와 운영 권위를 구분하는 표, 확인 날짜, 아직 끝나지 않은 전환 항목을 한곳에 적어 둡니다.",
        "They keep in one place the table separating candidates from operating authorities, the verification dates and the transitions not yet finished.",
      ),
      paths: [
        "docs/operations/federated-free-database-data-plane.md",
        "docs/operations/canonical-database-topology.md",
      ],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("앱 상한과 낡은 스냅샷으로 쓰기 거절하기", "Refusing writes by app cap and stale snapshots"),
      language: "ts",
      code: [
        "interface QuotaSnapshot { usedBytes: number; capacityBytes: number; observedAtMs: number }",
        "",
        "const MAX_SNAPSHOT_AGE_MS = 900 * 1000; // 정책의 quotaSnapshotMaxAgeSeconds",
        "",
        "export function admitWrite(snapshot: QuotaSnapshot | null, cap: number, uploadBytes: number, nowMs: number) {",
        "  // 사용량을 모르거나 낡았으면 '아마 괜찮겠지'로 쓰지 않는다",
        "  if (!snapshot || nowMs - snapshot.observedAtMs > MAX_SNAPSHOT_AGE_MS) {",
        '    return { ok: false, reason: "QUOTA_SNAPSHOT_REQUIRED" } as const;',
        "  }",
        "  // 공급자 한도가 아니라 그보다 낮은 앱 상한(예: 0.8)을 기준으로 먼저 멈춘다",
        "  if (snapshot.usedBytes + uploadBytes > snapshot.capacityBytes * cap) {",
        '    return { ok: false, reason: "OVER_APP_CAP" } as const;',
        "  }",
        "  return { ok: true } as const;",
        "}",
      ].join("\n"),
      codeEn: [
        "interface QuotaSnapshot { usedBytes: number; capacityBytes: number; observedAtMs: number }",
        "",
        "const MAX_SNAPSHOT_AGE_MS = 900 * 1000; // the policy's quotaSnapshotMaxAgeSeconds",
        "",
        "export function admitWrite(snapshot: QuotaSnapshot | null, cap: number, uploadBytes: number, nowMs: number) {",
        "  // unknown or stale usage never becomes 'probably fine'",
        "  if (!snapshot || nowMs - snapshot.observedAtMs > MAX_SNAPSHOT_AGE_MS) {",
        '    return { ok: false, reason: "QUOTA_SNAPSHOT_REQUIRED" } as const;',
        "  }",
        "  // stop first at the app cap (for example 0.8), which is lower than the provider limit",
        "  if (snapshot.usedBytes + uploadBytes > snapshot.capacityBytes * cap) {",
        '    return { ok: false, reason: "OVER_APP_CAP" } as const;',
        "  }",
        "  return { ok: true } as const;",
        "}",
      ].join("\n"),
      explain: t(
        "모르면 거절하고, 아는 경우에도 공급자 한도보다 낮은 앱 상한에서 멈춥니다. 실제 라우터는 여기에 가중 랑데부·여유 분배와 후보별 역할 검사가 더해집니다.",
        "If it does not know, it refuses; if it does, it still stops at an app cap below the provider limit. The real router adds weighted rendezvous, headroom distribution and per-candidate role checks.",
      ),
      verify: "types",
    },
    {
      kind: "teaching",
      title: t("정책 파일을 검증하는 검증기", "A verifier for the policy file itself"),
      language: "ts",
      code: [
        "interface Policy {",
        "  mode: string;",
        "  automaticDeployments: boolean;",
        "  automaticPaidFailover: boolean;",
        "  forbiddenProviders: string[];",
        "  providers: Record<string, { applicationHardCapRatio: number }>;",
        "}",
        "",
        "// 문서의 약속을 코드가 검사한다: 하나라도 어기면 이슈가 나온다(단순화; 실제 검사는 정책 단위 테스트·수동 워크플로·로컬 ci)",
        "export function policyIssues(policy: Policy): string[] {",
        "  const issues: string[] = [];",
        '  if (policy.mode !== "free-strict") issues.push("mode는 free-strict여야 한다");',
        '  if (policy.automaticDeployments) issues.push("자동 배포는 허용하지 않는다");',
        '  if (policy.automaticPaidFailover) issues.push("자동 유료 failover는 허용하지 않는다");',
        "  for (const [id, provider] of Object.entries(policy.providers)) {",
        "    if (policy.forbiddenProviders.includes(id)) issues.push(`금지 공급자가 다시 등장했다: ${id}`);",
        "    const ratio = provider.applicationHardCapRatio;",
        "    if (!(ratio > 0 && ratio <= 1)) issues.push(`${id}: 앱 상한 비율은 (0, 1] 범위여야 한다`);",
        "  }",
        "  return issues;",
        "}",
      ].join("\n"),
      codeEn: [
        "interface Policy {",
        "  mode: string;",
        "  automaticDeployments: boolean;",
        "  automaticPaidFailover: boolean;",
        "  forbiddenProviders: string[];",
        "  providers: Record<string, { applicationHardCapRatio: number }>;",
        "}",
        "",
        "// Code checks what the documents promise: any breach yields an issue (simplified; the real check is the policy unit test, a manual workflow and local ci)",
        "export function policyIssues(policy: Policy): string[] {",
        "  const issues: string[] = [];",
        '  if (policy.mode !== "free-strict") issues.push("mode must be free-strict");',
        '  if (policy.automaticDeployments) issues.push("automatic deployments are not allowed");',
        '  if (policy.automaticPaidFailover) issues.push("automatic paid failover is not allowed");',
        "  for (const [id, provider] of Object.entries(policy.providers)) {",
        "    if (policy.forbiddenProviders.includes(id)) issues.push(`a forbidden provider reappeared: ${id}`);",
        "    const ratio = provider.applicationHardCapRatio;",
        "    if (!(ratio > 0 && ratio <= 1)) issues.push(`${id}: the app cap ratio must be in (0, 1]`);",
        "  }",
        "  return issues;",
        "}",
      ].join("\n"),
      explain: t(
        "정책의 핵심 불변식을 몇 줄로 줄인 교육용 예제입니다. 실제 검증기는 임계 비율의 단조 증가, 역할 목록의 중복, 필수 경로의 존재까지 검사합니다.",
        "A teaching reduction of the policy's key invariants. The real verifier also checks that threshold ratios strictly increase, role lists have no duplicates and required paths exist.",
      ),
      verify: "types",
    },
  ],
  links: [
    {
      title: "Cloudflare · D1 pricing",
      url: "https://developers.cloudflare.com/d1/platform/pricing/",
      kind: "docs",
      note: t("저장소가 인용한 D1 한도의 출처(변동 가능)", "Source of the D1 limits the repository cites (subject to change)"),
    },
    {
      title: "Cloudflare · Workers pricing",
      url: "https://developers.cloudflare.com/workers/platform/pricing/",
      kind: "docs",
      note: t("계정 단위로 공유되는 Worker 한도", "Worker limits shared across an account"),
    },
    {
      title: "Supabase · Pricing",
      url: "https://supabase.com/pricing",
      kind: "docs",
      note: t("활성 프로젝트 수와 저장 한도의 출처", "Source of the active-project and storage limits"),
    },
    {
      title: "Wikipedia · Rendezvous hashing",
      url: "https://en.wikipedia.org/wiki/Rendezvous_hashing",
      kind: "article",
      note: t("라우터의 가중 랑데부 분배 개념", "The concept behind the router's weighted rendezvous distribution"),
    },
  ],
  chapterIds: ["cost-engineering", "infrastructure"],
  talk: {
    pitch: t(
      "무료 서비스 여러 곳의 한도를 합치면 더 많은 사용자를 감당할 수 있겠다는 생각으로, 후보 16곳을 정책 파일에 정리했습니다. 하지만 지금은 계획 단계이고 라우터는 기본으로 꺼져 있으며, 실제 운영 권위는 Supabase PostgreSQL 원장과 Cloudflare, Render, Upstash입니다. 대신 '무료 정책'은 코드가 검사합니다. 정책 파일이 어긋나면 코어 정책 단위 테스트가 실패하고, 전체 검사(verify:free-infrastructure)는 수동 워크플로와 로컬 pnpm run ci 에서 돕니다.",
      "The idea was that combining the limits of several free services could serve more users, so 16 candidates were organized in a policy file. For now it is a plan: the router is off by default, and the real operating authorities are the Supabase PostgreSQL ledger, Cloudflare, Render and Upstash. What code does check is the free policy: if the policy file drifts, the core policy unit test fails, and the full check (verify:free-infrastructure) runs in a manual workflow and in local pnpm run ci.",
    ),
    analogy: t(
      "놀이공원 자유이용권을 여러 장 모아 두었지만, 아직 입장은 한 장으로만 하고 나머지는 사용 계획표에만 적혀 있는 상태입니다.",
      "You have gathered several amusement-park passes, but you still enter with just one; the rest exist only on the usage plan.",
    ),
    questions: [
      {
        question: t("DB를 16곳에 분산했다는 뜻인가요?", "Does this mean the database is spread across 16 places?"),
        answer: t(
          "아니요. 16곳은 후보 배치 계획이고, 운영 처리량으로 계산하지 않습니다. 코드는 계획(plan)만 세우고 기본으로 꺼져 있으며, 인증·연결 전인 9곳은 처리량에 포함하지 않습니다.",
          "No. The 16 are a candidate placement plan and are not counted as operating throughput. The code only plans, it is off by default, and the nine not yet authenticated or connected are excluded from throughput.",
        ),
      },
      {
        question: t("무료 한도는 얼마인가요?", "How large are the free limits?"),
        answer: t(
          "정책 JSON(2026-09-26 확인)에 적힌 값만 말씀드립니다. 예를 들어 Cloudflare D1은 하루 읽기 5,000,000행·쓰기 100,000행이고 Supabase는 프로젝트당 DB 500,000,000바이트입니다. 공급자 요금은 바뀔 수 있어 게재 전 대시보드로 다시 확인해야 합니다.",
          "I will only quote what the policy JSON records (checked 2026-09-26). For example, Cloudflare D1 lists 5,000,000 rows read and 100,000 rows written per day, and Supabase lists 500,000,000 bytes of database per project. Provider pricing can change, so recheck on the dashboard before relying on it.",
        ),
      },
      {
        question: t("한도를 넘기면 자동으로 유료로 넘어가나요?", "Does it roll into paid usage when a limit is exceeded?"),
        answer: t(
          "아니요. 정책이 자동 유료 전환을 금지하고, 검증기가 그 설정을 확인합니다(코어 CI는 정책 단위 테스트, 전체 검사는 수동 워크플로·로컬 ci). 한도 알림은 과금 차단이 아니므로 앱이 더 낮은 상한에서 먼저 멈춥니다.",
          "No. The policy forbids automatic paid overflow and the verifier checks that setting (core CI runs the policy unit test; the full check runs in a manual workflow and local ci). Provider alerts do not block billing, so the app stops first at a lower cap.",
        ),
      },
    ],
    pitfall: t(
      "'무료 DB 16곳을 쓴다'고 말하면 과장입니다. 정책 JSON의 authorities 항목에는 CockroachDB 같은 후보가 원장 역할로 적혀 있지만 이는 목표 배치이고, 현재 원장 권위는 운영 정본 문서 기준 Supabase PostgreSQL입니다. 한도 수치는 파일 단위 확인일(2026-09-26)의 기록값이며, Workers·R2·Render 등은 저장소에 숫자 기록이 없어 쓰지 않았습니다.",
      "Saying 'we use 16 free databases' is an overstatement. The authorities section of the policy JSON lists candidates such as CockroachDB in ledger roles, but that is a target placement; the current ledger authority is Supabase PostgreSQL per the canonical operations document. The limit numbers are values recorded on the file-level check date (2026-09-26), and for Workers, R2, Render and others the repository records no numbers, so none are quoted.",
    ),
  },
  technologies: ["Cloudflare", "Supabase PostgreSQL", "Upstash Redis", "PostgreSQL", "Rendezvous hashing"],
  facts: [
    {
      value: "16 / 21 / 36",
      label: t("후보 공급자 / 논리 샤드 / 라우트 수(정책 JSON)", "Candidate providers / logical shards / routes (policy JSON)"),
      source: "config/free-database-federation.json",
    },
    {
      value: "2026-09-26",
      label: t("정책 JSON의 파일 단위 확인일(공급자별 확인일이 아님)", "File-level verification date of the policy JSON (not per provider)"),
      source: "config/free-database-federation.json",
    },
    {
      value: "5,000,000 / 100,000",
      label: t("Cloudflare D1 하루 읽기·쓰기 행 한도의 기록값(2026-09-26)", "Recorded D1 daily rows-read and rows-written limits (2026-09-26)"),
      source: "config/free-database-federation.json",
    },
    {
      value: "900 s",
      label: t("쿼터 스냅샷이 허용되는 최대 나이", "Maximum age allowed for a quota snapshot"),
      source: "config/free-database-federation.json",
    },
  ],
  reviewedAt: "2026-10-07",
};

export const PLATFORM_OPS_DATA_CARDS: readonly EngineeringAtlasEntry[] = [
  CHECKSUM_MIGRATION_LEDGER,
  SUPABASE_SINGLE_WRITER_AUTHORITY,
  FEDERATED_FREE_DATA_PLANE,
];
