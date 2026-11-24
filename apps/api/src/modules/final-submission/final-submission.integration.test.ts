import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { createEmptyFinalSubmissionBoard, type BoardState } from "@toonstudio/contracts/final-submission";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildFinalSubmissionCapabilitySql, buildFinalSubmissionRuntimeAclSql } from "../../../../../scripts/admin-final-submission-database-contract.mjs";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { FinalSubmissionRepository } from "./final-submission.repository";
import { submissionRequest } from "./final-submission.test-support";

const target = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!target);
const sourceMigration = readFileSync(new URL("../../platform/database/migrations/0134_admin_final_submission.sql", import.meta.url), "utf8");
const empty = (ownerUserId: string) => ({ ownerUserId, board: null, revision: 0, updatedAt: null, history: [] });

suite("실제 PostgreSQL 개인 최종 제출 점검", () => {
  let root: Pool;
  let pool: Pool;
  let repository: FinalSubmissionRepository;
  let schema: string;
  let migration: string;

  beforeAll(async () => {
    if (!target) throw new Error("TEST_DATABASE_URL required");
    validatePostgresIntegrationUrl(target);
    root = new Pool({ connectionString: target, max: 1, statement_timeout: 15_000 });
  });
  beforeEach(async () => {
    // 테스트마다 새 스키마를 사용해 운영용 이력 불변 트리거를 끄지 않는다.
    schema = `final_submission_${randomUUID().replaceAll("-", "")}`;
    migration = sourceMigration.replaceAll("public.", `"${schema}".`);
    await root.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: target, max: 8, options: `-c search_path=${schema}`, statement_timeout: 15_000 });
    await pool.query('CREATE TABLE "user" (id text PRIMARY KEY, role text NOT NULL, status text NOT NULL)');
    await pool.query(migration);
    await pool.query(`INSERT INTO "user"(id,role,status) VALUES
      ('admin-a','admin','active'),('admin-b','admin','active'),('operator','operator','active'),
      ('member','user','active'),('suspended','admin','suspended')`);
    repository = new FinalSubmissionRepository(pool);
  });
  afterEach(async () => {
    await pool?.end();
    if (schema) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  });
  afterAll(async () => { await root?.end(); });

  async function counts() {
    return (await pool.query(`SELECT
      (SELECT count(*)::int FROM admin_final_submission) AS boards,
      (SELECT count(*)::int FROM admin_final_submission_audit) AS audit,
      (SELECT count(*)::int FROM admin_final_submission_receipt) AS receipts`)).rows[0];
  }

  it("첫 조회·내보내기는 본인 ID와 null을 반환하고 DB에 쓰지 않는다", async () => {
    expect(await repository.read("admin-a")).toEqual(empty("admin-a"));
    expect(await repository.export("admin-a")).toEqual(empty("admin-a"));
    expect(await counts()).toEqual({ boards: 0, audit: 0, receipts: 0 });
  });

  it.each(["member", "suspended", "missing"])("활성 관리자·운영자 외에는 읽기·저장·내보내기를 거부한다: %s", async (actor) => {
    await expect(repository.read(actor)).rejects.toMatchObject({ status: 403 });
    await expect(repository.export(actor)).rejects.toMatchObject({ status: 403 });
    await expect(repository.save(actor, submissionRequest())).rejects.toMatchObject({ status: 403 });
    expect(await counts()).toEqual({ boards: 0, audit: 0, receipts: 0 });
  });

  it("관리자·운영자는 각자의 개인 원장만 저장·재조회한다", async () => {
    const a = submissionRequest(); a.board.tasks[0].nextAction = "첫 계정의 개인 점검";
    const saved = await repository.save("admin-a", a);
    expect(saved.ownerUserId).toBe("admin-a");
    expect(await new FinalSubmissionRepository(pool).read("admin-a")).toEqual(saved);
    expect(await repository.read("admin-b")).toEqual(empty("admin-b"));
    expect(await repository.read("operator")).toEqual(empty("operator"));
    const other = await repository.save("operator", submissionRequest());
    expect(other.ownerUserId).toBe("operator");
    expect(await repository.read("admin-a")).toEqual(saved);
  });

  it("최초 동시 저장과 동일 revision 변경은 한 요청만 수락한다", async () => {
    for (let revision = 0; revision <= 1; revision += 1) {
      const base = (await repository.read("admin-a")).board ?? createEmptyFinalSubmissionBoard();
      const results = await Promise.allSettled([
        repository.save("admin-a", submissionRequest(base, "기기 A 변경")),
        repository.save("admin-a", submissionRequest(base, "기기 B 변경")),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409, response: { currentRevision: revision + 1 } } });
    }
    expect(await counts()).toEqual({ boards: 1, audit: 2, receipts: 2 });
  });

  it("최초 저장의 낡은 기준은 빈 행도 남기지 않는다", async () => {
    const board = createEmptyFinalSubmissionBoard(); board.revision = 1;
    await expect(repository.save("admin-a", submissionRequest(board))).rejects.toMatchObject({ status: 409 });
    expect(await counts()).toEqual({ boards: 0, audit: 0, receipts: 0 });
  });

  it("동일 요청 재시도는 한 번만 저장하며 요약을 바꾸면 충돌한다", async () => {
    const input = submissionRequest();
    const results = await Promise.all([repository.save("admin-a", input), repository.save("admin-a", input)]);
    expect(results[0]).toEqual(results[1]);
    expect(await counts()).toEqual({ boards: 1, audit: 1, receipts: 1 });
    await expect(repository.save("admin-a", { ...input, summary: "변조한 요약" })).rejects.toMatchObject({ status: 409 });
    expect(await counts()).toEqual({ boards: 1, audit: 1, receipts: 1 });
  });

  it("늦은 재전송은 현재 snapshot을 반환하고 이후 편집을 되돌리지 않는다", async () => {
    const initial = submissionRequest();
    const first = await repository.save("admin-a", initial);
    const next = submissionRequest(first.board!); next.board.tasks[0].nextAction = "다른 기기의 후속 변경";
    const latest = await repository.save("admin-a", next);
    expect(await repository.save("admin-a", initial)).toEqual(latest);
    expect(await repository.read("admin-a")).toEqual(latest);
    expect(await counts()).toEqual({ boards: 1, audit: 2, receipts: 2 });
  });

  it("동일 mutation은 계정별로 분리하고 역할 철회 후 과거 응답도 숨긴다", async () => {
    const input = submissionRequest();
    await repository.save("admin-a", input);
    await repository.save("admin-b", input);
    await pool.query(`UPDATE "user" SET role='user' WHERE id='admin-a'`);
    await expect(repository.save("admin-a", input)).rejects.toMatchObject({ status: 403 });
    await expect(repository.export("admin-a")).rejects.toMatchObject({ status: 403 });
    expect((await repository.read("admin-b")).revision).toBe(1);
  });

  it("서버 시각·revision·변경 항목 시각을 확정하고 기존 확인 시점은 보존한다", async () => {
    const input = submissionRequest();
    input.board.tasks[0].updatedAt = "2025-01-01T00:00:00.000Z";
    input.board.tasks[0].lastConfirmedAt = "2025-01-01T00:00:00.000Z";
    const first = await repository.save("admin-a", input);
    expect(first.board?.revision).toBe(first.revision);
    expect(first.board?.updatedAt).toBe(first.updatedAt);
    expect(first.board?.tasks[0].updatedAt).toBe(first.updatedAt);
    expect(first.board?.tasks[0].lastConfirmedAt).toBe("2025-01-01T00:00:00.000Z");
    const secondInput = submissionRequest(first.board!);
    secondInput.board.tasks[0].nextAction = "추가 확인";
    secondInput.board.tasks[1].updatedAt = "2025-01-02T00:00:00.000Z";
    const second = await repository.save("admin-a", secondInput);
    expect(second.board?.tasks[0].updatedAt).toBe(second.updatedAt);
    expect(second.board?.tasks[1].updatedAt).toBe(first.board?.tasks[1].updatedAt);
    expect(second.history[0]).toEqual({ id: secondInput.mutationId, revision: 2, changedAt: second.updatedAt, summary: secondInput.summary });
    const audit = (await pool.query("SELECT actor_user_id,before_digest,after_digest FROM admin_final_submission_audit ORDER BY revision")).rows;
    expect(audit.map((entry) => entry.actor_user_id)).toEqual(["admin-a", "admin-a"]);
    expect(audit[1].before_digest).toBe(audit[0].after_digest);
  });

  it("기준 파일이 바뀌었는데 기존 최종 확인을 유지하는 crafted 요청은 서버에서 거부한다", async () => {
    const board = createEmptyFinalSubmissionBoard();
    board.documents[0].fileName = "generic-report-v1.docx";
    const task = board.tasks.find((entry) => entry.id === "CHECK-01")!;
    Object.assign(task, { status: "최종 확인", unresolved: false, confirmedBy: "검토자", lastConfirmedAt: "2025-01-01T00:00:00.000Z", confirmationNote: "첨부 목록 확인", evidenceLinks: [{ label: "확인 기록", url: "https://example.com/evidence" }] });
    const saved = await repository.save("admin-a", submissionRequest(board));
    const next = submissionRequest(saved.board!);
    next.board.documents[0].fileName = "generic-report-v2.docx";
    await expect(repository.save("admin-a", next)).rejects.toMatchObject({ status: 400 });
    expect(await repository.read("admin-a")).toEqual(saved);
  });

  it.each(["admin_final_submission_audit", "admin_final_submission_receipt"])("감사·영수증 실패는 본문까지 함께 롤백한다: %s", async (table) => {
    const saved = await repository.save("admin-a", submissionRequest());
    await pool.query(`CREATE FUNCTION reject_test_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rejection'; END $$;
      CREATE TRIGGER reject_test_insert BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_test_insert()`);
    await expect(repository.save("admin-a", submissionRequest(saved.board!))).rejects.toMatchObject({ status: 503 });
    expect(await repository.read("admin-a")).toEqual(saved);
    expect(await counts()).toEqual({ boards: 1, audit: 1, receipts: 1 });
  });

  it("손상된 저장본과 미적용 저장소는 503이며 자동 초기화·DDL을 하지 않는다", async () => {
    const saved = await repository.save("admin-a", submissionRequest());
    const corrupt = structuredClone(saved.board!);
    corrupt.tasks = corrupt.tasks.filter((task) => task.id !== "ACTION-01");
    await pool.query("UPDATE admin_final_submission SET payload=$1::jsonb WHERE owner_user_id='admin-a'", [JSON.stringify(corrupt)]);
    await expect(repository.read("admin-a")).rejects.toMatchObject({ status: 503 });
    await expect(repository.save("admin-a", submissionRequest(saved.board!))).rejects.toMatchObject({ status: 503 });
    await pool.query("ALTER TABLE admin_final_submission_receipt RENAME TO unavailable_receipt");
    await expect(repository.read("admin-b")).rejects.toMatchObject({ status: 503 });
    await expect(repository.save("admin-b", submissionRequest())).rejects.toMatchObject({ status: 503 });
    expect((await pool.query("SELECT to_regclass('admin_final_submission_receipt') AS relation")).rows[0].relation).toBeNull();
  });

  it("migration 재실행은 기존 자료·이력을 보존하고 소유자도 감사를 수정할 수 없다", async () => {
    const saved = await repository.save("admin-a", submissionRequest());
    await pool.query(migration); await pool.query(migration);
    expect(await repository.read("admin-a")).toEqual(saved);
    for (const query of [
      "UPDATE admin_final_submission_audit SET summary='changed'", "DELETE FROM admin_final_submission_receipt",
      "DELETE FROM admin_final_submission", "TRUNCATE admin_final_submission_audit CASCADE",
    ]) await expect(pool.query(query)).rejects.toMatchObject({ code: "23514" });
    expect(await repository.read("admin-a")).toEqual(saved);
  });

  it("화면 이력은 최신 100개로 제한하고 서버의 이전 감사·영수증은 보존한다", async () => {
    let board: BoardState = createEmptyFinalSubmissionBoard();
    for (let index = 0; index < 101; index += 1) board = (await repository.save("admin-a", submissionRequest(board, `합성 변경 ${index + 1}`))).board!;
    const stored = await repository.read("admin-a");
    expect(stored.history).toHaveLength(100);
    expect(stored.history[0].revision).toBe(101);
    expect(stored.history.at(-1)?.revision).toBe(2);
    expect(await counts()).toEqual({ boards: 1, audit: 101, receipts: 101 });
  });

  it("분리 runtime은 개인 RLS와 최소 권한으로 저장하고 다른 owner·이력 수정·DDL을 차단한다", async () => {
    const role = `final_runtime_${randomUUID().replaceAll("-", "")}`;
    let runtime: Pool | undefined;
    let created = false;
    try {
      await pool.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`); created = true;
      await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"; GRANT SELECT,UPDATE(status) ON "user" TO "${role}"`);
      await pool.query(buildFinalSubmissionRuntimeAclSql(role, schema));
      await pool.query(buildFinalSubmissionRuntimeAclSql(role, schema));
      await pool.query(buildFinalSubmissionCapabilitySql(role, schema));
      runtime = new Pool({ connectionString: target, max: 1, options: `-c search_path=${schema} -c role=${role}`, statement_timeout: 15_000 });
      const privateBoards = new FinalSubmissionRepository(runtime);
      const saved = await privateBoards.save("admin-a", submissionRequest());
      expect(await privateBoards.read("admin-a")).toEqual(saved);
      expect(await privateBoards.read("admin-b")).toEqual(empty("admin-b"));
      // 반환한 pooled 연결에는 이전 계정의 SET LOCAL 값이 남지 않는다.
      expect((await runtime.query("SELECT count(*)::int AS count FROM admin_final_submission")).rows[0].count).toBe(0);
      const client = await runtime.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('toonstudio.final_submission_owner',$1,true)", ["admin-b"]);
        expect((await client.query("SELECT * FROM admin_final_submission WHERE owner_user_id='admin-a'")).rows).toEqual([]);
        await expect(client.query("INSERT INTO admin_final_submission(owner_user_id) VALUES('admin-a')")).rejects.toMatchObject({ code: "42501" });
      } finally { await client.query("ROLLBACK"); client.release(); }
      for (const query of [
        "UPDATE admin_final_submission SET owner_user_id='admin-b'", "UPDATE admin_final_submission_audit SET summary='forged'",
        "DELETE FROM admin_final_submission", "TRUNCATE admin_final_submission_receipt", "CREATE TABLE forbidden_table(id text)",
      ]) await expect(runtime.query(query)).rejects.toMatchObject({ code: "42501" });
    } finally {
      await runtime?.end();
      if (created) { await pool.query(`DROP OWNED BY "${role}"`); await pool.query(`DROP ROLE "${role}"`); }
    }
  });
});
