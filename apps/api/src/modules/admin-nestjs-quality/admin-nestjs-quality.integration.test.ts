import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createNestBoardDocument } from "@toonstudio/contracts/admin-nestjs-quality-seed";
import type { NestBoardDocument, NestBoardMutation } from "@toonstudio/contracts/admin-nestjs-quality";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { buildAdminNestjsQualityCapabilitySql, buildAdminNestjsQualityRuntimeAclSql } from "../../../../../scripts/admin-nestjs-quality-database-contract.mjs";
import { AdminNestjsQualityRepository } from "./admin-nestjs-quality.repository";

const target = process.env.TEST_DATABASE_URL?.trim();
// DB 없는 로컬 수집만 건너뛴다. CI 설정 누락은 성공으로 처리하지 않는다.
if (process.env.CI && !target) throw new Error("CI의 NestJS 검증 보드 통합 테스트에는 TEST_DATABASE_URL이 필요합니다.");
const suite = describe.skipIf(!target);
const schema = `nestjs_quality_${randomUUID().replaceAll("-", "")}`;
const role = `quality_runtime_${randomUUID().replaceAll("-", "")}`;
const migration = readFileSync(new URL("../../platform/database/migrations/0124_admin_nestjs_quality.sql", import.meta.url), "utf8")
  .replaceAll("public.", `"${schema}".`);

function mutation(document = createNestBoardDocument(), expectedRevision = 0): NestBoardMutation {
  return { document, expectedRevision, mutationId: randomUUID(), reason: "격리 DB 검증 근거 저장" };
}
function edit(document: NestBoardDocument, note: string): NestBoardDocument {
  return { ...document, tasks: document.tasks.map((task, index) => index === 0 ? { ...task, notes: note } : task) };
}

suite("실제 PostgreSQL: 공유 NestJS 검증 보드", () => {
  let root: Pool;
  let owner: Pool;
  let runtime: Pool;
  let repository: AdminNestjsQualityRepository;
  let schemaCreated = false;
  let roleCreated = false;

  beforeAll(async () => {
    if (!target) throw new Error("TEST_DATABASE_URL이 필요합니다.");
    const database = validatePostgresIntegrationUrl(target);
    if (!database.loopback || !/(?:^|[_-])(?:test|testing|ci|integration)(?:$|[_-])/iu.test(database.databaseName)
      || /(?:^|[_-])(?:prod|production)(?:$|[_-])/iu.test(database.databaseName)) {
      throw new Error("검증 보드 통합 테스트에는 폐기 가능한 로컬 테스트 DB만 허용합니다.");
    }
    root = new Pool({ connectionString: target, max: 1 });
    await root.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    owner = new Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 4 });
    await owner.query('CREATE TABLE "user"(id text PRIMARY KEY,role text NOT NULL,status text NOT NULL DEFAULT \'active\')');
    await owner.query(migration);
    await root.query(`CREATE ROLE "${role}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    roleCreated = true;
    await root.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}";
      GRANT SELECT, UPDATE(status) ON TABLE "${schema}"."user" TO "${role}"`);
    await root.query(buildAdminNestjsQualityRuntimeAclSql(role, schema));
    await root.query(buildAdminNestjsQualityCapabilitySql(role, schema));
    runtime = new Pool({ connectionString: target, options: `-c search_path=${schema} -c role=${role}`, max: 6 });
    repository = new AdminNestjsQualityRepository(runtime);
  });

  beforeEach(async () => {
    await owner.query('TRUNCATE admin_nestjs_quality_history,admin_nestjs_quality_board,"user" CASCADE');
    await owner.query(`INSERT INTO "user"(id,role,status) VALUES
      ('admin','admin','active'),('admin-two','admin','active'),('operator','operator','active'),
      ('user','user','active'),('suspended','admin','suspended')`);
  });

  afterAll(async () => {
    await runtime?.end();
    await owner?.end();
    if (root) {
      if (schemaCreated) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      if (roleCreated) await root.query(`DROP ROLE "${role}"`);
      await root.end();
    }
  });

  it("초기 조회는 DB에 쓰지 않고 관리자·운영자에게 같은 문서를 제공한다", async () => {
    const admin = await repository.read("admin");
    const operator = await repository.read("operator");
    expect(admin).toMatchObject({ revision: 0, history: [], canEdit: true, updatedAt: null });
    expect(operator).toMatchObject({ revision: 0, canEdit: false });
    expect(operator.document).toEqual(admin.document);
    expect((await owner.query("SELECT count(*)::int AS count FROM admin_nestjs_quality_board")).rows[0].count).toBe(0);
  });

  it("비관리자·정지 계정을 거부하고 운영자의 변경을 차단한다", async () => {
    for (const actor of ["user", "suspended", "missing"]) {
      await expect(repository.read(actor)).rejects.toMatchObject({ status: 403 });
    }
    for (const actor of ["operator", "user", "suspended", "missing"]) {
      await expect(repository.save(actor, mutation())).rejects.toMatchObject({ status: 403 });
    }
  });

  it("모든 관리자가 같은 저장 결과와 서버 주체·전후 이력을 조회한다", async () => {
    const original = createNestBoardDocument();
    const changed = edit(original, "실제 API 흐름 재현 준비");
    changed.tasks[0].revision = 999;
    changed.tasks[0].updatedAt = "2026-01-01T00:00:00.000Z";
    const saved = await repository.save("admin", mutation(changed));
    expect(saved.revision).toBe(1);
    expect(saved.document.tasks[0].revision).toBe(original.tasks[0].revision + 1);
    expect(saved.document.tasks[0].updatedAt).not.toBe(changed.tasks[0].updatedAt);
    expect(saved.history).toHaveLength(1);
    expect(saved.history[0]).toMatchObject({ actorId: "admin", revision: 1, changedTaskIds: [original.tasks[0].id], snapshotChanged: false });
    expect((await repository.read("admin-two")).document).toEqual(saved.document);
    expect((await repository.history("operator", 1)).before).toEqual(original);
    expect((await repository.history("operator", 1)).after).toEqual(saved.document);
  });

  it("같은 요청 재전송은 한 이력만 남기고 이후 저장을 되돌리지 않는다", async () => {
    const first = mutation(edit(createNestBoardDocument(), "첫 확인"));
    const saved = await repository.save("admin", first);
    expect((await repository.save("admin", first)).revision).toBe(1);
    await expect(repository.save("admin", { ...first, reason: "다른 내용" })).rejects.toMatchObject({ status: 409 });
    await repository.save("admin-two", mutation(edit(saved.document, "후속 확인"), 1));
    const retry = await repository.save("admin", first);
    expect(retry.revision).toBe(2);
    expect(retry.document.tasks[0].notes).toBe("후속 확인");
    expect(retry.history).toHaveLength(2);
  });

  it("첫 저장과 후속 저장의 동시 경쟁에서 한 변경만 승인한다", async () => {
    for (const revision of [0, 1]) {
      const current = (await repository.read("admin")).document;
      const results = await Promise.allSettled(["admin", "admin-two"].map(actor =>
        repository.save(actor, mutation(edit(current, `동시 변경 ${revision} ${actor}`), revision))));
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const failure = results.find(result => result.status === "rejected");
      expect(failure?.status === "rejected" && failure.reason).toMatchObject({ status: 409 });
      expect((await repository.read("admin")).revision).toBe(revision + 1);
    }
    expect((await repository.read("admin")).history).toHaveLength(2);
  });

  it("서버 이력 INSERT 실패 시 문서와 revision도 함께 원복한다", async () => {
    const saved = await repository.save("admin", mutation());
    await owner.query(`CREATE FUNCTION "${schema}".quality_history_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'isolated audit failure'; END $$;
      CREATE TRIGGER quality_history_fail BEFORE INSERT ON admin_nestjs_quality_history
        FOR EACH ROW EXECUTE FUNCTION "${schema}".quality_history_fail()`);
    try {
      await expect(repository.save("admin", mutation(edit(saved.document, "원복되어야 하는 변경"), 1))).rejects.toMatchObject({ status: 503 });
      expect(await repository.read("admin")).toEqual(saved);
    } finally {
      await owner.query('DROP TRIGGER quality_history_fail ON admin_nestjs_quality_history');
      await owner.query(`DROP FUNCTION "${schema}".quality_history_fail()`);
    }
  });

  it("관리자 권한 회수 후에는 동일 mutation 재전송도 승인하지 않는다", async () => {
    const input = mutation();
    await repository.save("admin", input);
    await owner.query('UPDATE "user" SET role=\'operator\' WHERE id=\'admin\'');
    await expect(repository.save("admin", input)).rejects.toMatchObject({ status: 403 });
    expect((await repository.read("admin")).canEdit).toBe(false);
  });

  it("migration 재실행은 문서를 보존하고 이력 수정·삭제를 금지한다", async () => {
    const saved = await repository.save("admin", mutation(edit(createNestBoardDocument(), "보존되는 변경")));
    await owner.query(migration);
    expect(await repository.read("admin")).toEqual(saved);
    await expect(runtime.query("DELETE FROM admin_nestjs_quality_history")).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query("UPDATE admin_nestjs_quality_history SET reason='변조'")).rejects.toMatchObject({ code: "42501" });
    await expect(owner.query("UPDATE admin_nestjs_quality_history SET reason='변조'")).rejects.toMatchObject({ code: "23514" });
    await expect(owner.query("DELETE FROM admin_nestjs_quality_history")).rejects.toMatchObject({ code: "23514" });
  });

  it("손상 문서·없는 이력·없는 저장소를 성공한 seed로 숨기지 않는다", async () => {
    await expect(repository.history("admin", 1)).rejects.toMatchObject({ status: 404 });
    const saved = await repository.save("admin", mutation());
    await owner.query("UPDATE admin_nestjs_quality_board SET document=jsonb_set(document,'{tasks}','[]'::jsonb)");
    await expect(repository.read("admin")).rejects.toMatchObject({ status: 503 });
    await owner.query("UPDATE admin_nestjs_quality_board SET document=$1::jsonb", [JSON.stringify(saved.document)]);
    await owner.query("ALTER TABLE admin_nestjs_quality_history RENAME TO quality_history_temporarily_unavailable");
    try { await expect(repository.read("admin")).rejects.toMatchObject({ status: 503 }); }
    finally { await owner.query("ALTER TABLE quality_history_temporarily_unavailable RENAME TO admin_nestjs_quality_history"); }
  });
});
