import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { migrateProductionProjectAggregate } from "@toonstudio/core/production";
import type * as DatabaseRuntime from "../../platform/database";
import type { saveStudioScopedRestDocument as SaveScoped } from "./studio-scoped-write-rest";
import type { studioCrdtWorkAdvisoryLockQuery as WorkLock } from "./studio-crdt.repository";
import { scopedDocument, scopedFixture, scopedFrame, scopedOutside, scopedStroke } from "./studio-scoped-write.test-fixture";

const integrationUrl = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !integrationUrl) throw new Error("제한 편집 PostgreSQL 검증에는 STUDIO_LIVE_POSTGRES_INTEGRATION_URL이 필요합니다.");
const withPostgres = integrationUrl ? describe : describe.skip;

withPostgres("담당 원고 저장의 실제 PostgreSQL 권한·영수증·동시 회수", () => {
  let pool: Pool, database: typeof DatabaseRuntime, save: typeof SaveScoped;
  let studioCrdtWorkAdvisoryLockQuery: typeof WorkLock;
  const previousDatabase = process.env.DATABASE_URL, workIds: string[] = [], actorIds: string[] = [];
  beforeAll(async () => {
    process.env.DATABASE_URL = integrationUrl;
    pool = new Pool({ connectionString: integrationUrl, max: 4, application_name: "studio-scoped-write-rest-integration" });
    database = await import("../../platform/database");
    save = (await import("./studio-scoped-write-rest")).saveStudioScopedRestDocument;
    studioCrdtWorkAdvisoryLockQuery = (await import("./studio-crdt.repository")).studioCrdtWorkAdvisoryLockQuery;
  });
  afterEach(async () => {
    const works = workIds.splice(0), actors = actorIds.splice(0);
    if (works.length) await pool.query('DELETE FROM creator_work WHERE id=ANY($1::text[])', [works]);
    if (actors.length) await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [actors]);
  });
  afterAll(async () => {
    await Promise.all([pool?.end(), database?.dbPool.end()]);
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
  });

  async function fixture() {
    const workId = randomUUID(), owner = randomUUID(), actor = randomUUID(), other = randomUUID(), projectId = `production-${randomUUID()}`;
    workIds.push(workId); actorIds.push(owner, actor, other);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2),($3,$4),($5,$6)', [owner, "제작 관리자", actor, "담당 선화", other, "다른 담당자"]);
    await pool.query('INSERT INTO creator_work (id,"userId",title,doc,revision,cover,pages) VALUES ($1,$2,$3,$4::jsonb,3,$5,$6::jsonb)',
      [workId, owner, "범위 검증 원고", JSON.stringify(scopedDocument()), "정본 표지", JSON.stringify(["정본 납품 이미지"])]);
    for (const userId of [actor, other]) await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt")
      VALUES ($1,$2,'viewer','active',$3,now())`, [workId, userId, randomUUID()]);
    const raw = scopedFixture(), time = (await pool.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0]?.now;
    if (!time) throw new Error("서버 시각이 없습니다.");
    const now = time.toISOString(), startsAt = new Date(time.getTime() - 60_000).toISOString(), endsAt = new Date(time.getTime() + 3_600_000).toISOString();
    const aggregate = migrateProductionProjectAggregate(JSON.parse(JSON.stringify(raw.aggregate)
      .replaceAll('"production"', JSON.stringify(projectId)).replaceAll('"work"', JSON.stringify(workId))
      .replaceAll('"actor"', JSON.stringify(actor)).replaceAll('"owner"', JSON.stringify(owner))));
    const current = { ...aggregate, assignments: aggregate.assignments.map((role) => role.id === "role" ? { ...role, startsAt, endsAt } : role) };
    await pool.query(`INSERT INTO production_project (id,"workId",title,"collaborationModel","modelVersion",revision,aggregate,"createdBy")
      VALUES ($1,$2,$3,$4,2,$5,$6::jsonb,$7)`, [projectId, workId, current.title, current.collaborationModel, current.revision, JSON.stringify(current), owner]);
    const target = { ...raw.target, definition: { ...raw.target.definition, productionProjectId: projectId,
      scope: { ...raw.target.definition.scope, ancestors: raw.target.definition.scope.ancestors.map((scope) => scope.kind === "project" ? { ...scope, id: projectId } : scope) },
      source: { ...raw.target.definition.source, workId } }, createdBy: owner, createdAt: now };
    const grant = { ...raw.grant, actorUserId: actor, productionProjectId: projectId, startsAt, endsAt, createdBy: owner, createdAt: now };
    await pool.query(`INSERT INTO creator_work_scoped_write_policy ("workId","policyVersion",targets,grants,ownership,"updatedBy","updatedAt")
      VALUES ($1,1,$2::jsonb,$3::jsonb,$4::jsonb,$5,now())`, [workId, JSON.stringify([target]), JSON.stringify([grant]), JSON.stringify({ "stroke:own": "target" }), owner]);
    const input = { actorUserId: actor, workId, baseRevision: 3, crdtServerSequence: 0n,
      patch: { doc: scopedDocument([{ ...scopedStroke, color: "#ff0000" }, scopedOutside, scopedFrame]) },
      scoped: { mutationId: randomUUID(), writeContext: raw.context } };
    return { input, workId, owner, actor, other };
  }

  it("viewer의 담당 doc 저장은 성공하고 표지·납품·전체 edit 권한을 보존한다", async () => {
    const { input, workId } = await fixture(), response = await save(input);
    expect(response).toMatchObject({ workId, revision: 4 });
    const work = (await pool.query('SELECT revision,cover,pages,doc FROM creator_work WHERE id=$1', [workId])).rows[0];
    expect(work).toMatchObject({ revision: 4, cover: "정본 표지", pages: ["정본 납품 이미지"] });
    const receipt = (await pool.query('SELECT "policyVersion","targetIds",response FROM creator_work_scoped_write_receipt WHERE "workId"=$1', [workId])).rows[0];
    expect(receipt).toMatchObject({ policyVersion: 1, targetIds: ["target"], response: { revision: 4 } });
    expect((await pool.query('SELECT snapshot FROM creator_work_revision WHERE "workId"=$1 AND revision=4', [workId])).rows[0]?.snapshot.doc).toEqual(input.patch.doc);
    expect((await pool.query('SELECT role FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [workId, input.actorUserId])).rows[0]?.role).toBe("viewer");
  });

  it("이미 성공한 요청은 회수 후 같은 actor/body에 ACK만 재현하며 새 쓰기를 하지 않는다", async () => {
    const { input, workId } = await fixture(), saved = await save(input);
    await pool.query('UPDATE creator_work_scoped_write_policy SET "policyVersion"=2,grants=jsonb_set(grants,\'{0,revokedAt}\',to_jsonb(now())) WHERE "workId"=$1', [workId]);
    expect(await save(input)).toEqual(saved);
    await expect(save({ ...input, baseRevision: 4, scoped: { ...input.scoped, mutationId: randomUUID() } })).rejects.toMatchObject({ status: 409 });
    expect((await pool.query('SELECT revision FROM creator_work WHERE id=$1', [workId])).rows[0]?.revision).toBe(4);
  });

  it.each(["editor", "admin"])("scoped ACK 유실 뒤 %s 승격돼도 같은 원문 영수증을 먼저 재현한다", async (role) => {
    const { input, workId } = await fixture(), saved = await save(input);
    await pool.query('UPDATE creator_work_collaborator SET role=$3 WHERE "workId"=$1 AND "userId"=$2', [workId, input.actorUserId, role]);
    await pool.query('UPDATE creator_work_scoped_write_policy SET "policyVersion"=2,grants=jsonb_set(grants,\'{0,revokedAt}\',to_jsonb(now())) WHERE "workId"=$1', [workId]);
    expect(await save(input)).toEqual(saved);
    // 새 mutation은 scoped 권한을 확대하지 않고 기존 full 저장 경로로 넘긴다.
    expect(await save({ ...input, scoped: { ...input.scoped, mutationId: randomUUID() } })).toBeNull();
    expect((await pool.query('SELECT revision FROM creator_work WHERE id=$1', [workId])).rows[0]?.revision).toBe(4);
    expect((await pool.query('SELECT count(*)::integer AS count FROM creator_work_scoped_write_receipt WHERE "workId"=$1', [workId])).rows[0]?.count).toBe(1);
    expect((await pool.query('SELECT count(*)::integer AS count FROM creator_work_revision WHERE "workId"=$1 AND revision>3', [workId])).rows[0]?.count).toBe(1);
  });

  it("full 승격 후에도 다른 actor·변조 원문·현재 view 상실은 기존 scoped ACK를 읽을 수 없다", async () => {
    const { input, workId, other } = await fixture(); await save(input);
    await pool.query('UPDATE creator_work_collaborator SET role=\'editor\' WHERE "workId"=$1', [workId]);
    await expect(save({ ...input, actorUserId: other })).rejects.toMatchObject({ status: 409 });
    await expect(save({ ...input, patch: { doc: scopedDocument() } })).rejects.toMatchObject({ status: 409 });
    await pool.query('UPDATE creator_work_collaborator SET status=\'declined\' WHERE "workId"=$1 AND "userId"=$2', [workId, input.actorUserId]);
    await expect(save(input)).rejects.toMatchObject({ status: 403 });
    expect((await pool.query('SELECT revision FROM creator_work WHERE id=$1', [workId])).rows[0]?.revision).toBe(4);
  });

  it("다른 계정의 알려진 UUID·변조 본문·탈퇴 후 재현은 원고나 영수증을 노출하지 않는다", async () => {
    const { input, workId, other } = await fixture();
    await save(input);
    await expect(save({ ...input, actorUserId: other })).rejects.toMatchObject({ status: 409 });
    await expect(save({ ...input, patch: { doc: scopedDocument() } })).rejects.toMatchObject({ status: 409 });
    await pool.query(`UPDATE creator_work_collaborator SET status='declined' WHERE "workId"=$1 AND "userId"=$2`, [workId, input.actorUserId]);
    await expect(save(input)).rejects.toMatchObject({ status: 403 });
  });

  it("밖 요소·공용 preview·누락된 신규 귀속은 저장과 이력·ownership을 모두 롤백한다", async () => {
    const { input, workId } = await fixture();
    for (const patch of [{ doc: scopedDocument([scopedStroke, { ...scopedOutside, src: "asset:changed" }, scopedFrame]) },
      { ...input.patch, pages: ["담당자가 만든 전체 preview"] },
      { doc: scopedDocument([scopedStroke, { ...scopedStroke, id: "fresh" }, scopedOutside, scopedFrame]) }]) {
      await expect(save({ ...input, patch, scoped: { ...input.scoped, mutationId: randomUUID() } })).rejects.toBeDefined();
    }
    expect((await pool.query('SELECT revision FROM creator_work WHERE id=$1', [workId])).rows[0]?.revision).toBe(3);
    expect((await pool.query('SELECT count(*)::integer AS count FROM creator_work_scoped_write_receipt WHERE "workId"=$1', [workId])).rows[0]?.count).toBe(0);
    expect((await pool.query('SELECT ownership FROM creator_work_scoped_write_policy WHERE "workId"=$1', [workId])).rows[0]?.ownership).toEqual({ "stroke:own": "target" });
  });

  it("같은 work lock을 가진 회수가 끝난 뒤 도착한 오프라인 쓰기는 현재 정책으로 거절한다", async () => {
    const { input, workId } = await fixture(), blocker = await pool.connect(), dialect = new PgDialect();
    try {
      await blocker.query("BEGIN");
      const lock = dialect.sqlToQuery(studioCrdtWorkAdvisoryLockQuery(workId));
      await blocker.query(lock.sql, lock.params);
      await blocker.query('SELECT id FROM creator_work WHERE id=$1 FOR UPDATE', [workId]);
      const pending = save(input);
      const checked = expect(pending).rejects.toMatchObject({ status: 409 });
      await blocker.query('UPDATE creator_work_scoped_write_policy SET "policyVersion"=2 WHERE "workId"=$1', [workId]);
      await blocker.query("COMMIT");
      await checked;
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    expect((await pool.query('SELECT revision FROM creator_work WHERE id=$1', [workId])).rows[0]?.revision).toBe(3);
  });
});
