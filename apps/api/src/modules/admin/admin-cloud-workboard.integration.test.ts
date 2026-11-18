import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { blankTask, emptyBoard, type Board, type CloudWorkboardSave } from "@toonstudio/contracts/admin-cloud-workboard";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildAdminCloudWorkboardCapabilitySql, buildAdminCloudWorkboardRuntimeAclSql } from "../../../../../scripts/admin-database-contract.mjs";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { AdminCloudWorkboardRepository } from "./admin-cloud-workboard.repository";

const target = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!target);
const schema = `cloud_workboard_${randomUUID().replaceAll("-", "")}`;
const inSchema = (sql: string) => sql.replaceAll("public.", `"${schema}".`);
const migration = inSchema(readFileSync(new URL("../../platform/database/migrations/0124_admin_cloud_workboard.sql", import.meta.url), "utf8"));

function request(title = "검토할 작업", expectedRevision = 0): CloudWorkboardSave {
  return {
    board: { ...emptyBoard(), tasks: [{ ...blankTask(), id: "test-task", title }] },
    expectedRevision,
    mutationId: randomUUID(),
  };
}

suite("실제 PostgreSQL 관리자 개인 작업 보드", () => {
  let root: Pool;
  let pool: Pool;
  let repository: AdminCloudWorkboardRepository;

  beforeAll(async () => {
    if (!target) throw new Error("TEST_DATABASE_URL required");
    validatePostgresIntegrationUrl(target);
    root = new Pool({ connectionString: target, max: 1, statement_timeout: 10_000 });
    await root.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: target, max: 8, options: `-c search_path=${schema}`, statement_timeout: 10_000 });
    await pool.query('CREATE TABLE "user" (id text PRIMARY KEY, role text NOT NULL, status text NOT NULL)');
    await pool.query(migration);
    repository = new AdminCloudWorkboardRepository(pool);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE "user" CASCADE');
    await pool.query(`INSERT INTO "user" (id,role,status) VALUES
      ('admin-a','admin','active'), ('admin-b','admin','active'),
      ('operator','operator','active'), ('member','user','active'), ('suspended','admin','suspended')`);
  });

  afterAll(async () => {
    await pool?.end();
    if (root) {
      try { await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await root.end(); }
    }
  });

  async function counts() {
    return (await pool.query<{ boards: number; audit: number; receipts: number }>(`SELECT
      (SELECT count(*)::int FROM admin_cloud_workboard) AS boards,
      (SELECT count(*)::int FROM admin_cloud_workboard_audit) AS audit,
      (SELECT count(*)::int FROM admin_cloud_workboard_receipt) AS receipts`)).rows[0];
  }

  it("최초 GET은 빈 보드를 반환하며 행을 생성하지 않는다", async () => {
    expect(await repository.read("admin-a")).toEqual({ board: emptyBoard(), revision: 0, storedAt: null });
    expect(await counts()).toEqual({ boards: 0, audit: 0, receipts: 0 });
  });

  it.each(["operator", "member", "suspended", "missing"])("활성 관리자 외에는 읽기와 쓰기를 거부한다: %s", async (actor) => {
    await expect(repository.read(actor)).rejects.toMatchObject({ status: 403 });
    await expect(repository.save(actor, request())).rejects.toMatchObject({ status: 403 });
    expect(await counts()).toEqual({ boards: 0, audit: 0, receipts: 0 });
  });

  it("같은 관리자 기기 간에는 보존하고 다른 관리자에게는 공유하지 않는다", async () => {
    const saved = await repository.save("admin-a", request("관리자 A의 비공개 메모"));
    expect(await new AdminCloudWorkboardRepository(pool).read("admin-a")).toEqual(saved);
    expect(await repository.read("admin-b")).toEqual({ board: emptyBoard(), revision: 0, storedAt: null });
    const other = await repository.save("admin-b", request("관리자 B의 메모"));
    expect(other.board.tasks[0].title).toBe("관리자 B의 메모");
    expect(await repository.read("admin-a")).toEqual(saved);
  });

  it("동시 최초 저장과 후속 저장에서 하나만 수락한다", async () => {
    for (const revision of [0, 1]) {
      const results = await Promise.allSettled([
        repository.save("admin-a", request("기기 A", revision)),
        repository.save("admin-a", request("기기 B", revision)),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({ reason: { status: 409, response: { currentRevision: revision + 1 } } });
    }
    expect((await repository.read("admin-a")).revision).toBe(2);
    expect(await counts()).toEqual({ boards: 1, audit: 2, receipts: 2 });
  });

  it("최초 저장의 잘못된 revision은 임시 빈 행도 남기지 않는다", async () => {
    await expect(repository.save("admin-a", request("잘못된 기준", 1))).rejects.toMatchObject({ status: 409 });
    expect(await counts()).toEqual({ boards: 0, audit: 0, receipts: 0 });
  });

  it("같은 저장 요청의 동시 재전송은 한 번만 기록한다", async () => {
    const input = request();
    const results = await Promise.all([repository.save("admin-a", input), repository.save("admin-a", input)]);
    expect(results[0]).toEqual(results[1]);
    expect(await counts()).toEqual({ boards: 1, audit: 1, receipts: 1 });
    await expect(repository.save("admin-a", { ...input, board: request("바뀐 본문").board }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("늦은 재전송은 최신 일관 스냅샷을 반환하며 후속 편집을 되돌리지 않는다", async () => {
    const initial = request("첫 저장");
    await repository.save("admin-a", initial);
    const latest = await repository.save("admin-a", request("다른 기기의 후속 편집", 1));
    expect(await repository.save("admin-a", initial)).toEqual(latest);
    expect(await repository.read("admin-a")).toEqual(latest);
    expect(await counts()).toEqual({ boards: 1, audit: 2, receipts: 2 });
  });

  it("mutation ID는 관리자별로 분리되며 권한 회수 후 재전송도 차단한다", async () => {
    const input = request();
    await repository.save("admin-a", input);
    await repository.save("admin-b", input);
    expect(await counts()).toEqual({ boards: 2, audit: 2, receipts: 2 });
    await pool.query("UPDATE \"user\" SET role='operator' WHERE id='admin-a'");
    await expect(repository.save("admin-a", input)).rejects.toMatchObject({ status: 403 });
  });

  it("클라이언트 감사 이력은 무시하고 서버 행위자·시각·다이제스트를 보존한다", async () => {
    const input = request();
    input.board.audit = [{ id: "forged", at: "", taskId: "test-task", title: "거짓 감사", detail: "신뢰하면 안 되는 가져온 이력" }];
    const first = await repository.save("admin-a", input);
    const next = await repository.save("admin-a", request("가져온 변경", 1));
    expect(next.board.audit.map((entry) => entry.id)).toContain(input.mutationId);
    expect(next.board.audit.map((entry) => entry.id)).not.toContain("forged");
    expect(next.board.audit).toHaveLength(2);
    expect(first.board.audit[0].at).toBe(first.storedAt);
    const audit = (await pool.query<{ actor_user_id: string; before_digest: string; after_digest: string }>(
      "SELECT actor_user_id,before_digest,after_digest FROM admin_cloud_workboard_audit ORDER BY revision",
    )).rows;
    expect(audit.map((entry) => entry.actor_user_id)).toEqual(["admin-a", "admin-a"]);
    expect(audit[1].before_digest).toBe(audit[0].after_digest);
    expect((await pool.query<{ payload: Board }>("SELECT payload FROM admin_cloud_workboard")).rows[0].payload.audit).toEqual([]);
  });

  it.each(["admin_cloud_workboard_audit", "admin_cloud_workboard_receipt"])("감사·receipt 실패는 본문과 모든 이력도 함께 롤백한다: %s", async (table) => {
    const before = await repository.save("admin-a", request());
    await pool.query(`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'test-only audit rejection'; END $$;
      CREATE TRIGGER reject_test_audit BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`);
    try {
      await expect(repository.save("admin-a", request("실패해야 할 저장", 1))).rejects.toMatchObject({ status: 503 });
      expect(await repository.read("admin-a")).toEqual(before);
      expect(await counts()).toEqual({ boards: 1, audit: 1, receipts: 1 });
    } finally {
      await pool.query(`DROP TRIGGER reject_test_audit ON ${table}; DROP FUNCTION reject_test_audit()`);
    }
  });

  it("마이그레이션을 재실행해도 기존 보드와 감사 이력을 보존한다", async () => {
    const saved = await repository.save("admin-a", request());
    await pool.query(migration);
    await pool.query(migration);
    expect(await repository.read("admin-a")).toEqual(saved);
    expect(await counts()).toEqual({ boards: 1, audit: 1, receipts: 1 });
  });

  it("비소유 runtime 역할은 필요한 저장만 허용하고 감사 수정·삭제·DDL은 차단한다", async () => {
    const role = `cloud_workboard_runtime_${randomUUID().replaceAll("-", "")}`;
    let runtime: Pool | undefined;
    let roleCreated = false;
    try {
      await pool.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
      roleCreated = true;
      await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}";
        GRANT SELECT, UPDATE(status) ON TABLE "user" TO "${role}"`);
      runtime = new Pool({ connectionString: target, max: 2, options: `-c search_path=${schema} -c role=${role}`, statement_timeout: 10_000 });
      const privateBoards = new AdminCloudWorkboardRepository(runtime);
      await expect(privateBoards.read("admin-a")).rejects.toMatchObject({ status: 503 });
      await expect(pool.query(inSchema(buildAdminCloudWorkboardCapabilitySql(role)))).rejects.toThrow();
      await pool.query(inSchema(buildAdminCloudWorkboardRuntimeAclSql(role)));
      await pool.query(inSchema(buildAdminCloudWorkboardRuntimeAclSql(role)));
      await pool.query(inSchema(buildAdminCloudWorkboardCapabilitySql(role)));
      expect((await privateBoards.read("admin-a")).revision).toBe(0);
      const input = request("최소 권한 저장");
      const saved = await privateBoards.save("admin-a", input);
      expect(await privateBoards.save("admin-a", input)).toEqual(saved);
      expect((await privateBoards.save("admin-a", request("최소 권한 후속 저장", 1))).revision).toBe(2);
      expect((await privateBoards.read("admin-b")).board.tasks).toEqual([]);
      for (const query of [
        "UPDATE admin_cloud_workboard_audit SET task_count=0",
        "UPDATE admin_cloud_workboard_receipt SET request_digest=repeat('a',64)",
        "DELETE FROM admin_cloud_workboard", "DELETE FROM admin_cloud_workboard_audit",
        "DELETE FROM admin_cloud_workboard_receipt", "TRUNCATE admin_cloud_workboard",
        "TRUNCATE admin_cloud_workboard_audit", "TRUNCATE admin_cloud_workboard_receipt",
        "CREATE TABLE forbidden_workboard_ddl (id text)",
      ]) await expect(runtime.query(query)).rejects.toMatchObject({ code: "42501" });
      expect((await runtime.query("SELECT has_table_privilege(current_user,'admin_cloud_workboard','SELECT WITH GRANT OPTION') AS delegable")).rows[0].delegable).toBe(false);
    } finally {
      await runtime?.end();
      if (roleCreated) {
        await pool.query(`DROP OWNED BY "${role}"`);
        await pool.query(`DROP ROLE "${role}"`);
      }
    }
  });

  it("마이그레이션이 없으면 빈 성공 응답이나 자동 DDL 대신 503을 반환한다", async () => {
    await pool.query("ALTER TABLE admin_cloud_workboard RENAME TO unavailable_workboard");
    try {
      await expect(repository.read("admin-a")).rejects.toMatchObject({ status: 503 });
      await expect(repository.save("admin-a", request())).rejects.toMatchObject({ status: 503 });
      expect((await pool.query("SELECT to_regclass('admin_cloud_workboard') AS relation")).rows[0].relation).toBeNull();
    } finally {
      await pool.query("ALTER TABLE unavailable_workboard RENAME TO admin_cloud_workboard");
    }
  });
});
