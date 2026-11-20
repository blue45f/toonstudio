import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emptyData, type ProductionChangeCreate } from "@toonstudio/contracts/admin-production-change";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { buildAdminProductionChangesCapabilitySql, buildAdminProductionChangesRuntimeAclSql } from "../../../../../scripts/admin-production-changes-database-contract.mjs";
import { AdminProductionChangesRepository } from "./admin-production-changes.repository";

const target = process.env.TEST_DATABASE_URL?.trim();
if (process.env.CI && !target) throw new Error("CI 제작 변경 통합 검증에는 TEST_DATABASE_URL이 필요합니다.");
const suite = describe.skipIf(!target);
const schema = `production_change_${randomUUID().replaceAll("-", "")}`;
const role = `production_runtime_${randomUUID().replaceAll("-", "")}`;
const migration = readFileSync(new URL("../../platform/database/migrations/0132_admin_production_changes.sql", import.meta.url), "utf8").replaceAll("public.", `"${schema}".`);
function command(): ProductionChangeCreate {
  const data = emptyData();
  Object.assign(data, { title: "합성 변경 요청", description: "제작 에셋 수정 검토", nextAction: "담당자 검토", impact: "medium", conflictState: "none" });
  data.conflict.publishingImpact = "none";
  data.conflict.impactScope = "요청에 연결된 에셋 한 개";
  return { data, mutationId: randomUUID() };
}

suite("실제 PostgreSQL 제작 변경 원장", () => {
  let root: Pool, owner: Pool, runtime: Pool, repository: AdminProductionChangesRepository;
  let schemaCreated = false, roleCreated = false;
  beforeAll(async () => {
    if (!target) throw new Error("TEST_DATABASE_URL이 필요합니다.");
    const parsed = validatePostgresIntegrationUrl(target);
    if (!parsed.loopback || !/(?:^|[_-])(?:test|testing|ci|integration)(?:$|[_-])/iu.test(parsed.databaseName) || /(?:^|[_-])(?:prod|production)(?:$|[_-])/iu.test(parsed.databaseName)) throw new Error("폐기 가능한 로컬 테스트 DB만 허용합니다.");
    root = new Pool({ connectionString: target, max: 1 });
    await root.query(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
    owner = new Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 4 });
    await owner.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text,role text NOT NULL,status text NOT NULL DEFAULT 'active')`);
    await owner.query(migration);
    await root.query(`CREATE ROLE "${role}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`); roleCreated = true;
    await root.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"; GRANT SELECT, UPDATE(status) ON TABLE "${schema}"."user" TO "${role}"`);
    await root.query(buildAdminProductionChangesRuntimeAclSql(role, schema));
    await root.query(buildAdminProductionChangesCapabilitySql(role, schema));
    runtime = new Pool({ connectionString: target, options: `-c search_path=${schema} -c role=${role}`, max: 6 });
    repository = new AdminProductionChangesRepository(runtime);
  });
  beforeEach(async () => {
    await owner.query('TRUNCATE admin_production_change_audit,admin_production_change_capture,admin_production_change_request,"user" CASCADE');
    await owner.query(`INSERT INTO "user"(id,name,role,status) VALUES ('admin','관리자','admin','active'),('admin-two','다른 관리자','admin','active'),('operator','운영자','operator','active'),('member','일반 사용자','user','active'),('suspended','정지 관리자','admin','suspended')`);
  });
  afterAll(async () => {
    await runtime?.end(); await owner?.end();
    if (root) {
      if (schemaCreated) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      if (roleCreated) await root.query(`DROP ROLE "${role}"`);
      await root.end();
    }
  });
  it("빈 보드는 쓰기 없이 조회하고 일반·비활성 계정과 운영자의 변경을 차단한다", async () => {
    expect(await repository.read("admin")).toEqual({ requests: [] });
    expect(await repository.read("operator")).toEqual({ requests: [] });
    for (const actor of ["member", "suspended", "missing"]) await expect(repository.read(actor)).rejects.toMatchObject({ status: 403 });
    for (const actor of ["operator", "member", "suspended", "missing"]) await expect(repository.create(actor, command())).rejects.toMatchObject({ status: 403 });
    expect((await owner.query("SELECT count(*)::int AS n FROM admin_production_change_request")).rows[0].n).toBe(0);
  });
  it("요청은 서버 계정·시간으로 저장되고 다른 관리자에게 동일하게 조회된다", async () => {
    const input = command();
    const { request } = await repository.create("admin", input);
    expect(request).toMatchObject({ status: "draft", version: 1, createdBy: "관리자", approval: null });
    expect(request.history[0].actor).toBe("관리자");
    expect((await repository.read("admin-two")).requests[0]).toEqual(request);
    expect((await owner.query("SELECT actor_id,action,before_document FROM admin_production_change_audit")).rows).toEqual([{ actor_id: "admin", action: "create", before_document: null }]);
  });
  it("같은 생성 mutation의 동시 재전송은 요청·감사를 한 번만 만든다", async () => {
    const input = command();
    const results = await Promise.all([repository.create("admin", input), repository.create("admin", input)]);
    expect(results[0].request.id).toBe(results[1].request.id);
    expect((await owner.query("SELECT count(*)::int AS n FROM admin_production_change_request")).rows[0].n).toBe(1);
    expect((await owner.query("SELECT count(*)::int AS n FROM admin_production_change_audit")).rows[0].n).toBe(1);
    await expect(repository.create("admin", { ...input, data: { ...input.data, notes: "다른 내용" } })).rejects.toMatchObject({ status: 409 });
  });
  it("같은 버전의 동시 수정은 하나만 저장하고 다른 입력은 409로 보존한다", async () => {
    const { request } = await repository.create("admin", command());
    const results = await Promise.allSettled(["첫 편집", "두 번째 편집"].map(notes => repository.save("admin", request.id, { data: { ...request.data, notes }, expectedVersion: 1, mutationId: randomUUID() })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.status).toBe(409);
    expect((await repository.read("operator")).requests[0].version).toBe(2);
    expect((await owner.query("SELECT count(*)::int AS n FROM admin_production_change_audit")).rows[0].n).toBe(2);
  });
  it("저장 재전송은 과거 상태로 되돌리지 않고 승인 우회를 거부한다", async () => {
    const { request } = await repository.create("admin", command());
    const save = { data: { ...request.data, notes: "저장 메모" }, expectedVersion: 1, mutationId: randomUUID() };
    const first = await repository.save("admin", request.id, save);
    const second = await repository.save("admin-two", request.id, { data: { ...first.request.data, notes: "후속 메모" }, expectedVersion: 2, mutationId: randomUUID() });
    expect(await repository.save("admin", request.id, save)).toEqual(second);
    await expect(repository.transition("admin", request.id, { status: "applied", note: "우회", expectedVersion: 3, mutationId: randomUUID() })).rejects.toMatchObject({ status: 400 });
    expect((await repository.read("admin")).requests[0].status).toBe("draft");
  });
  it("정상 승인 후 범위 변경은 재검토로 돌아가며 이전 승인을 무효화한다", async () => {
    let { request } = await repository.create("admin", command());
    for (const status of ["submitted", "analysis", "review", "approved"] as const) {
      ({ request } = await repository.transition("admin", request.id, { status, note: "검토 결과 기록", expectedVersion: request.version, mutationId: randomUUID() }));
    }
    expect(request.approval).toMatchObject({ userId: "admin", valid: true });
    ({ request } = await repository.save("admin", request.id, { data: { ...request.data, description: "승인 이후 변경한 범위" }, expectedVersion: request.version, mutationId: randomUUID() }));
    expect(request.status).toBe("review"); expect(request.approval?.valid).toBe(false);
  });
  it("행 잠금 대기 중 예약 시각이 지나면 트랜잭션 시작 시각으로 예약을 허용하지 않는다", async () => {
    let { request } = await repository.create("admin", command());
    for (const status of ["submitted", "analysis", "review", "approved"] as const) {
      ({ request } = await repository.transition("admin", request.id, { status, note: "검토 결과 기록", expectedVersion: request.version, mutationId: randomUUID() }));
    }
    const scheduledAt = (await owner.query<{ at: Date }>("SELECT clock_timestamp() + interval '2 seconds' AS at")).rows[0].at.toISOString();
    ({ request } = await repository.save("admin", request.id, { data: { ...request.data, application: { ...request.data.application, scheduledAt } }, expectedVersion: request.version, mutationId: randomUUID() }));
    const blocker = await owner.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query("BEGIN");
      const pid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await blocker.query("SELECT id FROM admin_production_change_request WHERE id=$1 FOR UPDATE", [request.id]);
      pending = repository.transition("admin", request.id, { status: "scheduled", note: "예약 기록", expectedVersion: request.version, mutationId: randomUUID() }).catch(error => error);
      let started: Date | undefined;
      for (let attempt = 0; attempt < 100 && !started; attempt++) {
        started = (await owner.query<{ xact_start: Date }>("SELECT xact_start FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))", [pid])).rows[0]?.xact_start;
        if (!started) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(started).toBeInstanceOf(Date);
      expect(started!.getTime()).toBeLessThan(Date.parse(scheduledAt));
      await blocker.query("SELECT pg_sleep(GREATEST(0, extract(epoch from ($1::timestamptz-clock_timestamp()))) + 0.02)", [scheduledAt]);
      await blocker.query("COMMIT");
      expect(await pending).toMatchObject({ status: 400, response: { message: "예약 시각은 현재보다 미래로 지정해 주세요." } });
      expect((await repository.read("admin")).requests[0]).toMatchObject({ status: "approved", version: request.version });
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      await pending;
    }
  }, 10_000);
  it("migration을 다시 실행해도 기존 요청과 감사가 보존되고 감사 수정·삭제는 거부된다", async () => {
    const { request } = await repository.create("admin", command());
    await owner.query(migration);
    await root.query(buildAdminProductionChangesRuntimeAclSql(role, schema));
    await root.query(buildAdminProductionChangesCapabilitySql(role, schema));
    expect((await repository.read("admin")).requests[0].id).toBe(request.id);
    for (const sql of ["UPDATE admin_production_change_audit SET action='save'", "DELETE FROM admin_production_change_audit"]) await expect(owner.query(sql)).rejects.toMatchObject({ code: "23514" });
    await expect(runtime.query("DELETE FROM admin_production_change_request")).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query("UPDATE admin_production_change_audit SET action='save'")).rejects.toMatchObject({ code: "42501" });
  });
  it("이미지 참조도 서버에서 읽고 append-only 원장으로 보호한다", async () => {
    const id = randomUUID();
    const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const, purpose: "derived" as const, digest: `sha256:${"a".repeat(64)}`, objectPath: `sha256/aa/${"a".repeat(64)}`, byteLength: 80, contentType: "image/png" };
    await repository.saveCapture("admin", { id, object, byteLength: 80, contentType: "image/png" });
    expect((await repository.readCapture("operator", id)).object).toEqual(object);
    await expect(repository.readCapture("member", id)).rejects.toMatchObject({ status: 403 });
    await expect(repository.saveCapture("operator", { id: randomUUID(), object, byteLength: 80, contentType: "image/png" })).rejects.toMatchObject({ status: 403 });
    await expect(owner.query("DELETE FROM admin_production_change_capture")).rejects.toMatchObject({ code: "23514" });
  });
  it("저장소 오류는 원문을 노출하거나 빈 보드로 대체하지 않는다", async () => {
    const isolated = new AdminProductionChangesRepository({ connect: async () => { throw new Error("private database address"); } } as unknown as Pool);
    await expect(isolated.read("admin")).rejects.toMatchObject({ status: 503, response: { code: "production_changes_unavailable" } });
  });
});
