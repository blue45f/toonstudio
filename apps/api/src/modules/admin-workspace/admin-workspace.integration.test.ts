import "reflect-metadata";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAdminWorkspace, createOperationsWorkspace, createWorkspaceRecord, parseAdminWorkspace, type AdminWorkspaceSave } from "@toonstudio/contracts/admin-workspace";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildAdminWorkspaceCapabilitySql, buildAdminWorkspaceRuntimeAclSql } from "../../../../../scripts/admin-workspace-database-contract.mjs";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { AdminWorkspaceRepository, adminWorkspaceDigest } from "./admin-workspace.repository";

const target = process.env.TEST_DATABASE_URL;
const runtimeRole = process.env.ADMIN_WORKSPACE_TEST_RUNTIME_ROLE ?? process.env.TEST_RUNTIME_DATABASE_ROLE;
if (process.env.ADMIN_WORKSPACE_TEST_RUNTIME_ROLE && !target) throw new Error("관리자 보드 DB gate에는 명시적인 TEST_DATABASE_URL이 필요합니다.");
const schema = `admin_workspace_${randomUUID().replaceAll("-", "")}`;
const migrations = ["0122_admin_workspace.sql", "0127_admin_workspace_access.sql"].map(name => readFileSync(new URL(`../../platform/database/migrations/${name}`, import.meta.url), "utf8")
  .replaceAll("public.", `"${schema}".`));

/** 명시적으로 선택한 일회성 TEST_DATABASE_URL 안에서만 DDL·역할 전환을 수행한다. */
describe.skipIf(!target)("실제 PostgreSQL 관리자 작업 보드", () => {
  let root: Pool;
  let owner: Pool;
  let backing: Pool;
  let runtime: Pool;
  let repository: AdminWorkspaceRepository;
  const input = (expectedRevision = 0): AdminWorkspaceSave => ({ state: { ...createOperationsWorkspace(), records: [{ ...createWorkspaceRecord("ops-1", "ai", "task"), title: "합성 운영 기록" }] }, expectedRevision, mutationId: randomUUID(), scope: "operations" });
  const businessInput = (expectedRevision = 0): AdminWorkspaceSave => ({ state: createAdminWorkspace(), expectedRevision, mutationId: randomUUID(), scope: "business", ...(expectedRevision === 0 ? { claimBusinessOwnership: true } : {}) });
  async function runtimeQuery(sql: string, values?: unknown[]) {
    const client = await runtime.connect();
    try { return await client.query(sql, values); }
    finally { client.release(); }
  }
  async function counts() {
    return (await owner.query(`SELECT (SELECT revision FROM admin_workspace WHERE id='toonstudio') AS revision,
      (SELECT count(*)::integer FROM admin_workspace_audit) AS audits,
      (SELECT count(*)::integer FROM admin_workspace_receipt) AS receipts`)).rows[0];
  }
  beforeAll(async () => {
    if (!target) throw new Error("명시적인 TEST_DATABASE_URL이 필요합니다.");
    validatePostgresIntegrationUrl(target);
    if (!runtimeRole || !/^[a-z_][a-z0-9_]{0,62}$/u.test(runtimeRole) || ["public", "anon", "authenticated"].includes(runtimeRole)) {
      throw new Error("격리 테스트에는 별도 TEST_RUNTIME_DATABASE_ROLE이 필요합니다.");
    }
    root = new Pool({ connectionString: target, max: 1 });
    const role = (await root.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1", [runtimeRole])).rows[0];
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    await root.query(`CREATE SCHEMA "${schema}"`);
    owner = new Pool({ connectionString: target, max: 2, options: `-c search_path=${schema}` });
    await owner.query(`CREATE TABLE "user"(id text PRIMARY KEY,role text NOT NULL,status text NOT NULL DEFAULT 'active')`);
    for (const migration of migrations) await owner.query(migration);
    await owner.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${runtimeRole}";
      GRANT SELECT, UPDATE(status) ON "${schema}"."user" TO "${runtimeRole}"`);
    await owner.query(buildAdminWorkspaceRuntimeAclSql(runtimeRole, schema));
    await owner.query(buildAdminWorkspaceCapabilitySql(runtimeRole, schema));
    backing = new Pool({ connectionString: target, max: 8, options: `-c search_path=${schema}` });
    runtime = { async connect() {
      const client = await backing.connect();
      try { await client.query(`SET ROLE "${runtimeRole}"`); return client; }
      catch (error) { client.release(true); throw error; }
    } } as unknown as Pool;
    repository = new AdminWorkspaceRepository(runtime);
  });
  beforeEach(async () => {
    await owner.query(`TRUNCATE admin_workspace_receipt,admin_workspace_audit,admin_workspace,"user" CASCADE;
      INSERT INTO "user"(id,role,status) VALUES ('admin','admin','active'),('admin2','admin','active'),
        ('operator','operator','active'),('member','user','active'),('suspended','admin','suspended');
      INSERT INTO admin_workspace(id) VALUES('toonstudio')`);
  });
  afterAll(async () => {
    await backing?.end();
    await owner?.end();
    if (root) {
      try { await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await root.end(); }
    }
  });

  it("빈 DB에 실제 원문을 넣지 않고 활성 관리자·운영자만 읽는다", async () => {
    expect(await repository.read("admin")).toMatchObject({ boardId: "toonstudio", revision: 0, state: null, updatedAt: null, canEdit: true, scope: "operations" });
    expect((await repository.read("operator")).canEdit).toBe(false);
    for (const actor of ["member", "suspended", "missing"]) await expect(repository.read(actor)).rejects.toMatchObject({ status: 403 });
    await expect(repository.save("operator", input())).rejects.toMatchObject({ status: 403 });
    expect(await counts()).toEqual({ revision: 0, audits: 0, receipts: 0 });
  });
  it("두 관리자가 같은 revision을 저장하면 한 번만 기록·감사·receipt를 추가한다", async () => {
    const a = input(); const b = input(); b.state.records[0].notes = "다른 관리자의 합성 메모";
    const results = await Promise.allSettled([repository.save("admin", a), repository.save("admin2", b)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect(await counts()).toEqual({ revision: 1, audits: 1, receipts: 1 });
    const state = (await repository.read("admin")).state;
    expect([a.state, b.state]).toContainEqual(state);
  });
  it("네트워크 재시도는 원래 승인만 반환하고 같은 ID의 변경된 내용은 거부한다", async () => {
    const first = input();
    const accepted = await repository.save("admin", first);
    await repository.save("admin2", input(1));
    expect(await repository.save("admin", first)).toEqual({ ...accepted, replayed: true });
    first.state.records[0].notes = "수정된 요청";
    await expect(repository.save("admin", first)).rejects.toMatchObject({ status: 409 });
    expect(await counts()).toEqual({ revision: 2, audits: 2, receipts: 2 });
  });
  it("동일 요청의 동시 재시도도 단 한 번 저장한다", async () => {
    const request = input();
    const results = await Promise.all([repository.save("admin", request), repository.save("admin", request)]);
    expect(results.map(result => result.replayed).sort()).toEqual([false, true]);
    expect(await counts()).toEqual({ revision: 1, audits: 1, receipts: 1 });
  });
  it("권한 회수는 과거 성공 요청의 재전달에도 적용한다", async () => {
    const request = input(); await repository.save("admin", request);
    await owner.query(`UPDATE "user" SET role='operator' WHERE id='admin'`);
    await expect(repository.save("admin", request)).rejects.toMatchObject({ status: 403 });
    expect(await counts()).toEqual({ revision: 1, audits: 1, receipts: 1 });
  });
  it("감사 쓰기 실패 시 보드 본문·revision·receipt가 함께 롤백된다", async () => {
    await owner.query(`CREATE FUNCTION reject_workspace_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic test failure'; END $$;
      CREATE TRIGGER reject_workspace_audit BEFORE INSERT ON admin_workspace_audit FOR EACH ROW EXECUTE FUNCTION reject_workspace_audit()`);
    try {
      await expect(repository.save("admin", input())).rejects.toMatchObject({ status: 503 });
      expect(await counts()).toEqual({ revision: 0, audits: 0, receipts: 0 });
      expect((await repository.read("admin")).state).toBeNull();
    } finally {
      await owner.query("DROP TRIGGER reject_workspace_audit ON admin_workspace_audit; DROP FUNCTION reject_workspace_audit()");
    }
  });
  it("migration 재적용은 기존 기록·감사·재시도 영수증을 보존한다", async () => {
    const request = input(); const ack = await repository.save("admin", request);
    const before = (await owner.query("SELECT to_jsonb(w) AS value FROM admin_workspace w")).rows;
    for (const migration of migrations) await owner.query(migration);
    await owner.query(buildAdminWorkspaceRuntimeAclSql(runtimeRole, schema));
    await owner.query(buildAdminWorkspaceCapabilitySql(runtimeRole, schema));
    expect((await owner.query("SELECT to_jsonb(w) AS value FROM admin_workspace w")).rows).toEqual(before);
    expect(await repository.save("admin", request)).toEqual({ ...ack, replayed: true });
    expect(await counts()).toEqual({ revision: 1, audits: 1, receipts: 1 });
  });
  it("runtime은 감사·receipt 수정·삭제나 보드 삭제·새 행 추가를 할 수 없다", async () => {
    await repository.save("admin", input());
    for (const sql of ["UPDATE admin_workspace_audit SET action='save'", "UPDATE admin_workspace_receipt SET accepted_revision=2",
      "DELETE FROM admin_workspace", "DELETE FROM admin_workspace_audit", "DELETE FROM admin_workspace_receipt",
      "INSERT INTO admin_workspace(id) VALUES('another')", "UPDATE admin_workspace SET id='another'",
      "UPDATE admin_workspace_access_audit SET action='read'", "DELETE FROM admin_workspace_access_audit",
      "UPDATE admin_workspace_business_grant SET user_id='admin'", "DELETE FROM admin_workspace_business_grant"]) {
      await expect(runtimeQuery(sql)).rejects.toMatchObject({ code: "42501" });
    }
    expect(await counts()).toEqual({ revision: 1, audits: 1, receipts: 1 });
  });
  it("column 단위로 잘못 부여한 권한도 감지하고 정확히 회수한다", async () => {
    await owner.query(`GRANT UPDATE(id) ON admin_workspace TO "${runtimeRole}"`);
    await expect(owner.query(buildAdminWorkspaceCapabilitySql(runtimeRole, schema))).rejects.toMatchObject({ code: "P0001" });
    await owner.query(buildAdminWorkspaceRuntimeAclSql(runtimeRole, schema));
    await owner.query(buildAdminWorkspaceCapabilitySql(runtimeRole, schema));
    await expect(runtimeQuery("UPDATE admin_workspace SET id='another'")).rejects.toMatchObject({ code: "42501" });
  });
  it("불완전한 DB JSON·승인 해제는 거부하고 저장된 원본을 보존한다", async () => {
    const request = input();
    Object.assign(request.state.records[0], { approvalOnly: true, approvalReason: "별도 실행 승인 필요", status: "승인 대기" });
    await repository.save("admin", request);
    const changed = structuredClone(request); changed.expectedRevision = 1; changed.mutationId = randomUUID();
    Object.assign(changed.state.records[0], { approvalOnly: false, approvalReason: "", status: "초안" });
    await expect(repository.save("admin", changed)).rejects.toMatchObject({ status: 400 });
    await expect(owner.query("UPDATE admin_workspace SET payload='{}'::jsonb")).rejects.toMatchObject({ code: "23514" });
    expect((await repository.read("admin")).state).toEqual(request.state);
    expect(await counts()).toEqual({ revision: 1, audits: 1, receipts: 1 });
  });
  it("작은 JSON의 지수 숫자가 JSONB에서 커지면 400을 반환하고 숫자 원문을 바꾸지 않는다", async () => {
    const request = businessInput();
    request.state.imports.push({
      id: "synthetic-size-import", label: "실제 사업 자료가 아닌 저장 크기 경계", format: "native-backup", importedAt: "2026-11-17",
      archive: { kind: "toonstudio-admin-workspace", schemaVersion: 1, records: [], numbers: Array.from({ length: 10 }, () => Array(5000).fill(1e308)) },
    });
    expect(parseAdminWorkspace(request.state).ok).toBe(true);
    await expect(repository.save("admin", request)).rejects.toMatchObject({ status: 400, response: { code: "admin_workspace_invalid" } });
    expect(await counts()).toEqual({ revision: 0, audits: 0, receipts: 0 });
    expect((await repository.read("admin")).state).toBeNull();
  });

  it("빈 보관함의 명시적 생성은 운영 자료를 보존하고 재전송이나 다른 계정으로 소유권을 덮어쓰지 않는다", async () => {
    const operations = input();
    await repository.save("admin", operations);
    const claim = { ...businessInput(), state: createOperationsWorkspace() };
    expect(await repository.save("admin", claim)).toMatchObject({ scope: "business", revision: 1, replayed: false });
    expect(await repository.save("admin", claim)).toMatchObject({ scope: "business", revision: 1, replayed: true });
    expect((await owner.query("SELECT payload,business_owner_user_id,operations_revision,business_revision FROM admin_workspace")).rows[0]).toEqual({
      payload: operations.state, business_owner_user_id: "admin", operations_revision: 1, business_revision: 1,
    });
    expect((await repository.read("admin", "business")).state).toEqual(createOperationsWorkspace());
    for (const actor of ["admin2", "operator"]) {
      await expect(repository.read(actor, "business")).rejects.toMatchObject({ status: 403 });
      await expect(repository.save(actor, { ...claim, mutationId: randomUUID() })).rejects.toMatchObject({ status: 403 });
    }
    expect((await repository.read("admin")).state).toEqual(operations.state);
    expect((await owner.query("SELECT count(*)::integer AS count FROM admin_workspace_access_audit WHERE action='claim'")).rows[0].count).toBe(1);
    expect(await counts()).toEqual({ revision: 2, audits: 2, receipts: 2 });
  });
  it("사업 소유자는 빈 자료의 명시적 첫 저장으로만 정하고 다른 관리자·운영자에게 자동 공개하지 않는다", async () => {
    const business = businessInput(); business.state.documents[0].working.content = "합성 비공개 사업 자료";
    await expect(repository.save("operator", business)).rejects.toMatchObject({ status: 403 });
    await expect(repository.save("admin", { ...business, claimBusinessOwnership: false })).rejects.toMatchObject({ status: 403 });
    await repository.save("admin", business);
    expect((await owner.query("SELECT business_owner_user_id FROM admin_workspace")).rows[0].business_owner_user_id).toBe("admin");
    for (const actor of ["admin2", "operator"]) {
      await expect(repository.read(actor, "business")).rejects.toMatchObject({ status: 403 });
      const visible = await repository.read(actor);
      expect(visible.revision).toBe(0);
      expect(visible.updatedAt).toBeNull();
      expect(visible.state).toBeNull();
      expect(JSON.stringify(visible)).not.toContain("합성 비공개");
    }
    expect((await repository.read("admin", "business")).state).toEqual(business.state);
  });
  it("서로 다른 영역의 동시 저장은 각 영역 버전으로 검사하고 숨긴 자료를 보존한다", async () => {
    await repository.save("admin", input());
    await repository.save("admin", businessInput());
    const op = input(1); op.state.records[0].notes = "운영 담당 변경";
    const business = businessInput(1); business.state.documents[0].working.content = "비공개 본문 변경";
    const results = await Promise.all([repository.save("admin2", op), repository.save("admin", business)]);
    expect(results.map(result => [result.scope, result.revision])).toEqual([["operations", 2], ["business", 2]]);
    expect((await repository.read("admin2")).state).toEqual(op.state);
    expect((await repository.read("admin", "business")).state).toEqual(business.state);
    expect(await counts()).toEqual({ revision: 4, audits: 4, receipts: 4 });
  });
  it("읽기·편집·내보내기 명시 권한과 회수가 실제 재전송에도 적용된다", async () => {
    await repository.save("admin", businessInput());
    const grant = { userId: "operator", mutationId: randomUUID(), canRead: true, canWrite: false, canExport: false };
    await expect(repository.changeBusinessAccess("admin2", grant)).rejects.toMatchObject({ status: 403 });
    const ack = await repository.changeBusinessAccess("admin", grant);
    expect(await repository.changeBusinessAccess("admin", grant)).toEqual({ ...ack, replayed: true });
    expect((await repository.read("operator", "business")).canEdit).toBe(false);
    await expect(repository.read("operator", "business", true)).rejects.toMatchObject({ status: 403 });
    const edit = businessInput(1);
    await expect(repository.save("operator", edit)).rejects.toMatchObject({ status: 403 });
    await repository.changeBusinessAccess("admin", { ...grant, mutationId: randomUUID(), canWrite: true });
    await repository.save("operator", edit);
    await repository.changeBusinessAccess("admin", { ...grant, mutationId: randomUUID(), canRead: false });
    await expect(repository.read("operator", "business")).rejects.toMatchObject({ status: 403 });
    await expect(repository.save("operator", edit)).rejects.toMatchObject({ status: 403 });
    expect((await repository.listBusinessAccess("admin")).grants).toEqual([]);
    await expect(repository.listBusinessAccess("admin2")).rejects.toMatchObject({ status: 403 });
  });
  it("기존 owner 없는 자료는 migration과 마지막 수정자 권한으로 소유권을 자동 부여하지 않는다", async () => {
    await repository.save("admin", input());
    const legacy = createAdminWorkspace();
    await owner.query("UPDATE admin_workspace SET payload=$1::jsonb,payload_digest=$2 WHERE id='toonstudio'", [JSON.stringify(legacy), adminWorkspaceDigest(legacy)]);
    for (const migration of migrations) await owner.query(migration);
    await owner.query(buildAdminWorkspaceRuntimeAclSql(runtimeRole, schema));
    expect((await owner.query("SELECT business_owner_user_id FROM admin_workspace")).rows[0].business_owner_user_id).toBeNull();
    await expect(repository.read("admin", "business")).rejects.toMatchObject({ status: 403 });
    await expect(repository.save("admin", businessInput())).rejects.toMatchObject({ status: 403 });
    await expect(repository.save("admin", { ...businessInput(), state: createOperationsWorkspace() })).rejects.toMatchObject({ status: 403 });
    expect((await owner.query("SELECT payload FROM admin_workspace")).rows[0].payload).toEqual(legacy);
  });
  it("비공개 조회·내보내기·grant 감사 쓰기 실패에는 자료나 성공을 반환하지 않는다", async () => {
    await repository.save("admin", businessInput());
    await owner.query(`CREATE FUNCTION reject_workspace_access_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic access audit failure'; END $$;
      CREATE TRIGGER reject_workspace_access_audit BEFORE INSERT ON admin_workspace_access_audit FOR EACH ROW EXECUTE FUNCTION reject_workspace_access_audit()`);
    try {
      await expect(repository.read("admin", "business")).rejects.toMatchObject({ status: 503 });
      await expect(repository.read("admin", "business", true)).rejects.toMatchObject({ status: 503 });
      await expect(repository.changeBusinessAccess("admin", { userId: "admin2", mutationId: randomUUID(), canRead: true, canWrite: true, canExport: true })).rejects.toMatchObject({ status: 503 });
      expect((await owner.query("SELECT count(*)::integer AS count FROM admin_workspace_business_grant")).rows[0].count).toBe(0);
      expect(await counts()).toEqual({ revision: 1, audits: 1, receipts: 1 });
    } finally {
      await owner.query("DROP TRIGGER reject_workspace_access_audit ON admin_workspace_access_audit; DROP FUNCTION reject_workspace_access_audit()");
    }
  });
});
