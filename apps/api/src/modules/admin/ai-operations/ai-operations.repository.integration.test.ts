import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AiOperationsSave, BoardSnapshot } from "@toonstudio/contracts/ai-operations";
import { validatePostgresIntegrationUrl } from "../../../../../../scripts/run-postgres-integration-tests.mjs";
import { buildAiOperationsCapabilitySql, buildAiOperationsRuntimeAclSql } from "../../../../../../scripts/ai-operations-database-contract.mjs";
import { AiOperationsRepository } from "./ai-operations.repository";

const target = process.env.TEST_DATABASE_URL;
const schema = `ai_operations_${randomUUID().replaceAll("-", "")}`;
const suppliedRuntimeRole = process.env.TEST_RUNTIME_DATABASE_ROLE;
const runtimeRole = suppliedRuntimeRole ?? `ai_operations_runtime_${randomUUID().replaceAll("-", "")}`;
const migration = () => readFileSync(new URL("../../../platform/database/migrations/0127_admin_ai_operations.sql", import.meta.url), "utf8")
  .replaceAll("public.", `"${schema}".`);
const snapshot = (): BoardSnapshot => ({
  meta: { title: "합성 운영 기록", snapshotAt: "2020-01-01T00:00:00Z", mainSha: "", mainCommitUrl: "", deadline: "", noticeUrl: "", caveats: [] },
  items: [{ id: "sample", type: "task", provider: "공통", title: "합성 승인 기록", description: "외부 실행 없음",
    status: "승인 대기", priority: "P1", assurance: "미확인", fields: [], sourceIds: [], owner: "", nextAction: "근거 확인",
    notes: "", verifiedAt: null, verificationNote: "", mainSha: null, tags: [], approvalRequired: true }],
  sources: [],
});
const input = (expectedRevision = 0): AiOperationsSave => ({ expectedRevision, mutationId: randomUUID(), snapshot: snapshot() });

describe.skipIf(!target)("실제 PostgreSQL AI 운영 보드 저장", () => {
  let root: Pool;
  let pool: Pool;
  let repository: AiOperationsRepository;
  let createdRuntimeRole = false;

  beforeAll(async () => {
    if (!target) throw new Error("TEST_DATABASE_URL이 필요합니다.");
    validatePostgresIntegrationUrl(target);
    if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(runtimeRole) || runtimeRole === "public") {
      throw new Error("안전한 테스트 runtime 역할이 필요합니다.");
    }
    root = new Pool({ connectionString: target, max: 1 });
    // 기본 CI DB에는 전용 runtime 역할이 없다. 임시 역할을 만들어 최소 권한 검증도 반드시 실행한다.
    if (suppliedRuntimeRole === undefined) {
      await root.query(`CREATE ROLE "${runtimeRole}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
      createdRuntimeRole = true;
    }
    await root.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: target, max: 5, options: `-c search_path=${schema}` });
    await pool.query(`CREATE TABLE "user"(id text PRIMARY KEY,role text NOT NULL,status text NOT NULL DEFAULT 'active')`);
    await pool.query(migration());
    repository = new AiOperationsRepository(pool);
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE admin_ai_operations_receipt,admin_ai_operations_audit,"user" CASCADE;
      UPDATE admin_ai_operations_board SET revision=0,payload=NULL,updated_at=NULL;
      INSERT INTO "user"(id,role,status) VALUES('admin','admin','active'),('other-admin','admin','active'),
       ('operator','operator','active'),('member','user','active'),('suspended','admin','suspended')`);
  });

  afterAll(async () => {
    await pool?.end();
    if (root) {
      try {
        await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        if (createdRuntimeRole) await root.query(`DROP ROLE "${runtimeRole}"`);
      } finally { await root.end(); }
    }
  });

  it("빈 DB에는 공용 빈 기록만 초기화하며 재적용이 저장본을 보존한다", async () => {
    expect(await repository.read("admin")).toEqual({ snapshot: null, revision: 0, updatedAt: null, canEdit: true, audit: [] });
    const saved = await repository.save("admin", input());
    await pool.query(migration());
    expect(await repository.read("other-admin")).toEqual(saved);
    expect(saved.snapshot?.meta.snapshotAt).toBe("2020-01-01T00:00:00Z");
  });

  it("관리자·운영자 읽기를 공유하되 일반·비활성 계정과 운영자 쓰기는 차단한다", async () => {
    expect((await repository.read("operator")).canEdit).toBe(false);
    for (const actor of ["member", "suspended", "missing"]) {
      await expect(repository.read(actor)).rejects.toMatchObject({ status: 403 });
    }
    await expect(repository.save("operator", input())).rejects.toMatchObject({ status: 403 });
    expect((await repository.read("admin")).revision).toBe(0);
  });

  it("동시 관리자의 같은 revision 수정 중 하나만 원자적으로 저장한다", async () => {
    const results = await Promise.allSettled([repository.save("admin", input()), repository.save("other-admin", input())]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({ reason: { status: 409 } });
    const view = await repository.read("admin");
    expect(view.revision).toBe(1);
    expect(view.audit).toHaveLength(1);
  });

  it("중복 요청은 새 이력을 만들지 않고 내용 변경 또는 권한 회수 후 재사용은 거부한다", async () => {
    const request = input();
    expect(await repository.save("admin", request)).toEqual(await repository.save("admin", request));
    const different = { ...request, snapshot: { ...request.snapshot, meta: { ...request.snapshot.meta, title: "다른 제목" } } };
    await expect(repository.save("admin", different)).rejects.toMatchObject({ status: 409 });
    await pool.query(`UPDATE "user" SET role='user' WHERE id='admin'`);
    await expect(repository.save("admin", request)).rejects.toMatchObject({ status: 403 });
    expect((await repository.read("other-admin")).audit).toHaveLength(1);
  });

  it("가져오기로 기존 승인 제한을 해제하거나 삭제할 수 없다", async () => {
    await repository.save("admin", input());
    const next = input(1);
    next.snapshot.items = [];
    await expect(repository.save("admin", next)).rejects.toMatchObject({ status: 400 });
    expect((await repository.read("admin")).revision).toBe(1);
  });

  it("감사 기록 삽입 실패는 보드와 영수증까지 롤백한다", async () => {
    await pool.query(`CREATE FUNCTION reject_ai_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;
      CREATE TRIGGER reject_ai_audit BEFORE INSERT ON admin_ai_operations_audit FOR EACH ROW EXECUTE FUNCTION reject_ai_test_audit()`);
    try {
      await expect(repository.save("admin", input())).rejects.toMatchObject({ status: 503 });
      expect((await repository.read("admin")).revision).toBe(0);
      expect((await pool.query("SELECT count(*)::int AS count FROM admin_ai_operations_receipt")).rows[0].count).toBe(0);
    } finally {
      await pool.query("DROP TRIGGER reject_ai_audit ON admin_ai_operations_audit; DROP FUNCTION reject_ai_test_audit()");
    }
  });

  it("저장된 내용과 감사 digest가 다르면 빈 보드로 가장하지 않는다", async () => {
    await repository.save("admin", input());
    await pool.query(`UPDATE admin_ai_operations_board SET payload=jsonb_set(payload,'{meta,title}','"변조"'::jsonb)`);
    await expect(repository.read("admin")).rejects.toMatchObject({ status: 503 });
  });

  it("저장된 JSON 손상을 자동 초기화하지 않는다", async () => {
    await repository.save("admin", input());
    await pool.query(`UPDATE admin_ai_operations_board SET payload=jsonb_set(payload,'{meta,title}','null'::jsonb)`);
    await expect(repository.read("admin")).rejects.toMatchObject({ status: 503 });
  });

  it("저장본의 감사 기록 누락을 정상 상태로 반환하지 않는다", async () => {
    await repository.save("admin", input());
    await pool.query("DELETE FROM admin_ai_operations_receipt; DELETE FROM admin_ai_operations_audit");
    await expect(repository.read("admin")).rejects.toMatchObject({ status: 503 });
  });

  it("최신 저장 영수증 누락을 정상 상태로 반환하지 않는다", async () => {
    await repository.save("admin", input());
    await pool.query("DELETE FROM admin_ai_operations_receipt");
    await expect(repository.read("admin")).rejects.toMatchObject({ status: 503 });
  });

  it.each(["board", "audit", "receipt"])("%s 테이블 부재를 성공한 빈 보드로 반환하지 않는다", async (name) => {
    await pool.query(`ALTER TABLE admin_ai_operations_${name} RENAME TO unavailable_ai_test_table`);
    try { await expect(repository.read("admin")).rejects.toMatchObject({ status: 503 }); }
    finally { await pool.query(`ALTER TABLE unavailable_ai_test_table RENAME TO admin_ai_operations_${name}`); }
  });

  it("최소 권한 계정은 읽기·저장을 수행하고 감사 기록을 수정할 수 없다", async () => {
    const role = runtimeRole;
    await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}";
      GRANT SELECT ON "user" TO "${role}"; GRANT UPDATE(status) ON "user" TO "${role}"`);
    await pool.query(buildAiOperationsRuntimeAclSql(role, schema));
    await pool.query(buildAiOperationsCapabilitySql(role, schema));
    const runtime = new Pool({ connectionString: target, options: `-c search_path=${schema} -c role=${role}`, max: 2 });
    try {
      const limited = new AiOperationsRepository(runtime);
      expect((await limited.save("admin", input())).revision).toBe(1);
      expect((await limited.read("operator")).canEdit).toBe(false);
      for (const forbidden of [
        "INSERT INTO admin_ai_operations_board(id) VALUES(1)",
        "UPDATE admin_ai_operations_board SET id=1",
        "DELETE FROM admin_ai_operations_board",
        "UPDATE admin_ai_operations_audit SET actor_user_id='admin'",
        "DELETE FROM admin_ai_operations_audit",
        "UPDATE admin_ai_operations_receipt SET accepted_revision=1",
        "DELETE FROM admin_ai_operations_receipt",
        "TRUNCATE admin_ai_operations_receipt",
      ]) {
        await expect(runtime.query(forbidden)).rejects.toMatchObject({ code: "42501" });
      }
      await pool.query(`GRANT UPDATE ON admin_ai_operations_audit TO "${role}"`);
      await expect(pool.query(buildAiOperationsCapabilitySql(role, schema))).rejects.toThrow("런타임 권한");
      await pool.query(buildAiOperationsRuntimeAclSql(role, schema));
      await pool.query(buildAiOperationsCapabilitySql(role, schema));
    } finally { await runtime.end(); }
  });
});
