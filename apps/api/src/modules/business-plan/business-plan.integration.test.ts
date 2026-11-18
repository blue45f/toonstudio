import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createEmptyBusinessPlanState, type BusinessPlanState, type SaveBusinessPlanRequest } from "@toonstudio/contracts/business-plan";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { buildBusinessPlanCapabilitySql, buildBusinessPlanRuntimeAclSql } from "../../../../../scripts/admin-database-contract.mjs";
import { BusinessPlanRepository, businessPlanDigest } from "./business-plan.repository";
import { parseSaveBusinessPlanRequest } from "./business-plan.dto";

const target = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!target);
const originalMigration = readFileSync(new URL("../../platform/database/migrations/0123_admin_business_plan.sql", import.meta.url), "utf8");
const instant = new Date("2026-01-15T03:00:00.000Z");

function state(title = "격리 검증 사업계획서"): BusinessPlanState {
  const board = createEmptyBusinessPlanState(instant);
  board.project.title = title;
  board.documents[0]!.workingText = "격리 테스트 작업용 원문";
  board.documents[0]!.previousText = "격리 테스트 이전 원문";
  board.documents[0]!.submission = { text: "격리 테스트 제출 후보", label: "제출 후보 v1", createdAt: instant.toISOString(), sourceUpdatedAt: instant.toISOString() };
  board.documents[0]!.history = [{ type: "작업용", text: "격리 테스트 보관 원문", label: "작업용 v0", createdAt: instant.toISOString() }];
  board.savedAt = instant.toISOString();
  return board;
}

const input = (expectedRevision = 0, board = state()): SaveBusinessPlanRequest => parseSaveBusinessPlanRequest({
  expectedRevision, mutationId: randomUUID(), board,
});

suite("실제 PostgreSQL 사업계획서 보드 저장·권한·migration", () => {
  let root: Pool;
  let pool: Pool;
  let schema: string;
  let migration: string;
  let repository: BusinessPlanRepository;
  beforeAll(async () => {
    if (!target) throw new Error("격리 TEST_DATABASE_URL이 필요합니다.");
    validatePostgresIntegrationUrl(target);
    root = new Pool({ connectionString: target, max: 1 });
  });
  beforeEach(async () => {
    schema = `business_plan_${randomUUID().replaceAll("-", "")}`;
    migration = originalMigration.replaceAll("public.", `"${schema}".`);
    await root.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: target, max: 8, options: `-c search_path=${schema}` });
    // 기존 인증 원장만 선행 조건으로 둔다. 사업계획서 테이블은 매번 빈 상태에서 실제 migration으로 만든다.
    await pool.query(`CREATE TABLE "user"(id text PRIMARY KEY, role text NOT NULL, status text NOT NULL);
      INSERT INTO "user"(id,role,status) VALUES ('admin','admin','active'),('admin-two','admin','active'),
      ('operator','operator','active'),('user','user','active'),('suspended','admin','suspended');`);
    await pool.query(migration);
    repository = new BusinessPlanRepository(pool);
  });
  afterEach(async () => {
    await pool?.end();
    if (schema) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  });
  afterAll(async () => { await root?.end(); });

  async function counts() {
    return (await pool.query<{ board: number; snapshots: number; audit: number; receipts: number }>(`SELECT
      (SELECT count(*)::int FROM admin_business_plan) AS board,
      (SELECT count(*)::int FROM admin_business_plan_revision) AS snapshots,
      (SELECT count(*)::int FROM admin_business_plan_audit) AS audit,
      (SELECT count(*)::int FROM admin_business_plan_receipt) AS receipts`)).rows[0];
  }

  it("빈 기능 테이블에 적용하고 GET은 아무 행도 생성하지 않는다", async () => {
    expect(await repository.read("admin")).toEqual({ board: null, revision: 0, updatedAt: null });
    expect(await repository.read("admin")).toEqual({ board: null, revision: 0, updatedAt: null });
    expect(await counts()).toEqual({ board: 0, snapshots: 0, audit: 0, receipts: 0 });
  });

  it("운영자·일반 사용자·정지·존재하지 않는 계정은 읽기와 저장 모두 거절한다", async () => {
    for (const actor of ["operator", "user", "suspended", "missing"]) {
      await expect(repository.read(actor)).rejects.toMatchObject({ status: 403 });
      await expect(repository.save(actor, input())).rejects.toMatchObject({ status: 403 });
    }
    expect(await counts()).toEqual({ board: 0, snapshots: 0, audit: 0, receipts: 0 });
  });

  it("작업·제출 후보·이력을 정확히 보존하고 서버 시각과 원문 없는 감사를 기록한다", async () => {
    const request = input();
    const before = Date.now();
    const saved = await repository.save("admin", request);
    expect(saved.board).toEqual(request.board);
    expect(saved.revision).toBe(1);
    expect(Date.parse(saved.updatedAt!)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(saved.updatedAt!)).toBeLessThanOrEqual(Date.now() + 1000);
    expect(saved.updatedAt).not.toBe(request.board.savedAt);
    expect(await repository.read("admin-two")).toEqual(saved);
    expect(await counts()).toEqual({ board: 1, snapshots: 1, audit: 1, receipts: 1 });
    const audit = (await pool.query("SELECT * FROM admin_business_plan_audit")).rows[0];
    expect(audit).toMatchObject({ revision: 1, actor_user_id: "admin", before_digest: businessPlanDigest(null), after_digest: businessPlanDigest(request.board) });
    expect(Object.keys(audit).sort()).toEqual(["actor_user_id", "after_digest", "before_digest", "occurred_at", "revision"]);
    expect(JSON.stringify(audit)).not.toContain("격리 테스트");
  });

  it("최초 동시 저장과 동일 revision 변경은 하나만 수락한다", async () => {
    const first = await Promise.allSettled([repository.save("admin", input(0, state("동시 A"))), repository.save("admin-two", input(0, state("동시 B")))]);
    expect(first.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(first.filter((result) => result.status === "rejected").map((result) => result.reason.status)).toEqual([409]);
    const later = await Promise.allSettled([repository.save("admin", input(1, state("다음 A"))), repository.save("admin-two", input(1, state("다음 B")))]);
    expect(later.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(later.filter((result) => result.status === "rejected").map((result) => result.reason.status)).toEqual([409]);
    expect((await repository.read("admin")).revision).toBe(2);
    expect(await counts()).toEqual({ board: 1, snapshots: 2, audit: 2, receipts: 2 });
  });

  it("동일 요청 동시 재전송은 한 번 저장하고 같은 원래 응답을 돌려준다", async () => {
    const request = input();
    const responses = await Promise.all([repository.save("admin", request), repository.save("admin", request)]);
    expect(responses[0]).toEqual(responses[1]);
    expect(await counts()).toEqual({ board: 1, snapshots: 1, audit: 1, receipts: 1 });
    await repository.save("admin-two", input(1, state("다른 관리자의 후속 버전")));
    expect(await repository.save("admin", request)).toEqual(responses[0]);
    expect((await repository.read("admin")).revision).toBe(2);
    expect(await counts()).toEqual({ board: 1, snapshots: 2, audit: 2, receipts: 2 });
  });

  it("요청 ID 재사용·낡은 revision은 저장 내용과 감사 이력을 바꾸지 않는다", async () => {
    const request = input();
    const saved = await repository.save("admin", request);
    await expect(repository.save("admin", { ...request, board: state("변조된 재전송") })).rejects.toMatchObject({ status: 409, response: { code: "business_plan_mutation_reused" } });
    await expect(repository.save("admin", input(0, state("오래된 편집")))).rejects.toMatchObject({ status: 409, response: { currentRevision: 1 } });
    expect(await repository.read("admin")).toEqual(saved);
    expect(await counts()).toEqual({ board: 1, snapshots: 1, audit: 1, receipts: 1 });
  });

  it("역할을 철회한 관리자는 이전 멱등성 영수증으로 원문을 읽을 수 없다", async () => {
    const request = input();
    await repository.save("admin", request);
    await pool.query(`UPDATE "user" SET role='operator' WHERE id='admin'`);
    await expect(repository.save("admin", request)).rejects.toMatchObject({ status: 403 });
    await expect(repository.read("admin")).rejects.toMatchObject({ status: 403 });
  });

  it("소유자도 최신값 삭제·전체 TRUNCATE 및 snapshot·감사·영수증 수정을 할 수 없다", async () => {
    await repository.save("admin", input());
    for (const table of ["admin_business_plan", "admin_business_plan_revision", "admin_business_plan_audit", "admin_business_plan_receipt"]) {
      await expect(pool.query(`DELETE FROM ${table}`)).rejects.toMatchObject({ code: "23514" });
      await expect(pool.query(`TRUNCATE ${table} CASCADE`)).rejects.toMatchObject({ code: "23514" });
    }
    await expect(pool.query("UPDATE admin_business_plan_revision SET payload=$1::jsonb", [JSON.stringify(state("덮어쓰기"))])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("UPDATE admin_business_plan_audit SET actor_user_id='admin-two'")).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query("UPDATE admin_business_plan_receipt SET request_digest=$1", ["a".repeat(64)])).rejects.toMatchObject({ code: "23514" });
    expect(await counts()).toEqual({ board: 1, snapshots: 1, audit: 1, receipts: 1 });
  });

  it("감사 기록 실패 시 최신값·snapshot·영수증도 전부 rollback한다", async () => {
    const saved = await repository.save("admin", input());
    await pool.query("ALTER TABLE admin_business_plan_audit ADD CONSTRAINT reject_test_revision CHECK (revision < 2)");
    await expect(repository.save("admin", input(1, state("실패할 변경")))).rejects.toMatchObject({ status: 503 });
    expect(await repository.read("admin")).toEqual(saved);
    expect(await counts()).toEqual({ board: 1, snapshots: 1, audit: 1, receipts: 1 });
  });

  it("스키마가 준비되지 않으면 GET과 저장 모두 명시적 503이며 자동 DDL을 실행하지 않는다", async () => {
    await pool.query("ALTER TABLE admin_business_plan RENAME TO isolated_missing_board");
    await expect(repository.read("admin")).rejects.toMatchObject({ status: 503, response: { code: "business_plan_storage_unavailable" } });
    await expect(repository.save("admin", input())).rejects.toMatchObject({ status: 503 });
    expect((await pool.query("SELECT to_regclass('admin_business_plan') AS name")).rows[0].name).toBeNull();
  });

  it("기존 계정과 저장된 보드가 있는 DB에 재적용해도 원문·revision을 보존한다", async () => {
    const saved = await repository.save("admin", input());
    await pool.query("CREATE TABLE preexisting_business_data(id text PRIMARY KEY, value text); INSERT INTO preexisting_business_data VALUES('existing','preserved')");
    await pool.query(migration);
    expect(await repository.read("admin")).toEqual(saved);
    expect(await counts()).toEqual({ board: 1, snapshots: 1, audit: 1, receipts: 1 });
    expect((await pool.query("SELECT value FROM preexisting_business_data WHERE id='existing'")).rows[0].value).toBe("preserved");
    expect((await pool.query('SELECT count(*)::int AS count FROM "user"')).rows[0].count).toBe(5);
  });

  it("이전 snapshot 복구는 기존 이력을 유지하는 새 revision 저장이다", async () => {
    const first = await repository.save("admin", input());
    await repository.save("admin-two", input(1, state("수정 버전")));
    const previous = (await pool.query<{ payload: BusinessPlanState }>("SELECT payload FROM admin_business_plan_revision WHERE revision=1")).rows[0]!.payload;
    const restored = await repository.save("admin", input(2, previous));
    expect(restored.revision).toBe(3);
    expect(restored.board).toEqual(first.board);
    expect(await counts()).toEqual({ board: 1, snapshots: 3, audit: 3, receipts: 3 });
  });

  it("새 테이블에 PUBLIC 권한을 부여하지 않는다", async () => {
    const grants = await pool.query(`SELECT relation.relname, acl.privilege_type
      FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(relation.relacl, acldefault('r',relation.relowner))) acl
      WHERE namespace.nspname=$1 AND relation.relname LIKE 'admin_business_plan%' AND relation.relkind='r' AND acl.grantee=0`, [schema]);
    expect(grants.rows).toEqual([]);
  });

  it("소유자가 아닌 런타임 역할도 저장·재전송하지만 삭제·원문 덮어쓰기·DDL은 할 수 없다", async () => {
    const role = `business_plan_runtime_${randomUUID().replaceAll("-", "")}`;
    const sqlForSchema = (sql: string) => sql.replaceAll("public.", `"${schema}".`);
    let runtimePool: Pool | undefined;
    await root.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    try {
      await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}";
        GRANT SELECT, UPDATE ON "user" TO "${role}"`);
      // 새 DB bootstrap의 광범위 DML과 잔여 열 권한까지 명시적 계약으로 축소한다.
      await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON admin_business_plan,admin_business_plan_revision,admin_business_plan_audit,admin_business_plan_receipt TO "${role}";
        GRANT UPDATE(id) ON admin_business_plan TO "${role}"`);
      await pool.query(sqlForSchema(buildBusinessPlanRuntimeAclSql(role)));
      await pool.query(sqlForSchema(buildBusinessPlanCapabilitySql(role)));
      runtimePool = new Pool({ connectionString: target, max: 4, options: `-c search_path=${schema} -c role=${role}` });
      expect((await runtimePool.query("SELECT current_user AS actor")).rows[0].actor).toBe(role);
      const runtimeRepository = new BusinessPlanRepository(runtimePool);
      expect(await runtimeRepository.read("admin")).toEqual({ board: null, revision: 0, updatedAt: null });
      const request = input();
      const saved = await runtimeRepository.save("admin", request);
      await runtimeRepository.save("admin-two", input(1, state("분리 역할의 후속 저장")));
      expect(await runtimeRepository.save("admin", request)).toEqual(saved);
      expect((await runtimeRepository.read("admin")).revision).toBe(2);
      await expect(runtimeRepository.read("operator")).rejects.toMatchObject({ status: 403 });
      for (const table of ["admin_business_plan", "admin_business_plan_revision", "admin_business_plan_audit", "admin_business_plan_receipt"]) {
        await expect(runtimePool.query(`DELETE FROM ${table}`)).rejects.toMatchObject({ code: "42501" });
        await expect(runtimePool.query(`TRUNCATE ${table}`)).rejects.toMatchObject({ code: "42501" });
      }
      for (const forbidden of [
        "UPDATE admin_business_plan SET id=1",
        "UPDATE admin_business_plan_revision SET payload=payload",
        "UPDATE admin_business_plan_audit SET actor_user_id=actor_user_id",
        "UPDATE admin_business_plan_receipt SET request_digest=request_digest",
        "ALTER TABLE admin_business_plan_revision DISABLE TRIGGER admin_business_plan_revision_immutable",
        "SELECT admin_business_plan_immutable_guard()",
        `CREATE TABLE "${schema}".unexpected_table(id text)`,
      ]) await expect(runtimePool.query(forbidden)).rejects.toMatchObject({ code: "42501" });
      expect(await counts()).toEqual({ board: 1, snapshots: 2, audit: 2, receipts: 2 });

      await pool.query(`GRANT DELETE ON admin_business_plan TO "${role}"`);
      await expect(pool.query(sqlForSchema(buildBusinessPlanCapabilitySql(role)))).rejects.toThrow("business plan runtime privileges are incompatible");
      await pool.query(sqlForSchema(buildBusinessPlanRuntimeAclSql(role)));
      await pool.query("ALTER TABLE admin_business_plan_revision DISABLE TRIGGER admin_business_plan_revision_immutable");
      await expect(pool.query(sqlForSchema(buildBusinessPlanCapabilitySql(role)))).rejects.toThrow("business plan history triggers are incompatible");
      await pool.query("ALTER TABLE admin_business_plan_revision ENABLE TRIGGER admin_business_plan_revision_immutable");
      await pool.query(sqlForSchema(buildBusinessPlanCapabilitySql(role)));
    } finally {
      await runtimePool?.end();
      await root.query(`DROP OWNED BY "${role}"; DROP ROLE "${role}"`);
    }
  });

  it("새 migration DDL 실패는 기존 인증 원장을 남기고 rollback할 수 있다", async () => {
    const rollbackSchema = `business_plan_rollback_${randomUUID().replaceAll("-", "")}`;
    const client = await root.connect();
    try {
      await client.query(`CREATE SCHEMA "${rollbackSchema}"; CREATE TABLE "${rollbackSchema}"."user" (id text PRIMARY KEY)`);
      const transactional = originalMigration.replaceAll("public.", `"${rollbackSchema}".`).replace(/^BEGIN;\s*$/mu, "").replace(/^COMMIT;\s*$/mu, "");
      await client.query("BEGIN");
      await client.query(transactional);
      await client.query("ROLLBACK");
      const presence = (await client.query("SELECT to_regclass($1) AS board,to_regclass($2) AS users", [`${rollbackSchema}.admin_business_plan`, `${rollbackSchema}.user`])).rows[0];
      expect(presence.board).toBeNull();
      expect(presence.users).not.toBeNull();
    } finally {
      await client.query("ROLLBACK");
      await client.query(`DROP SCHEMA IF EXISTS "${rollbackSchema}" CASCADE`);
      client.release();
    }
  });
});
