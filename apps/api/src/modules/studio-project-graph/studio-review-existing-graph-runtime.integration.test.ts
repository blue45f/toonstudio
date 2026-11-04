import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildStudioProjectGraphRuntimeAclSql } from "../../../../../scripts/run-production-database-migrations.mjs";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { studioReviewPreviewDigest, type StudioReviewPreviewCapture } from "./studio-review-preview-producer.contract";
import type * as DatabaseRuntime from "../../platform/database";
import type { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import type { StudioReviewPreviewProducerRepository } from "./studio-review-preview-producer.repository";

const url = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !url) throw new Error("기존 원고 Graph의 runtime 회귀에는 명시적인 로컬 PostgreSQL이 필요합니다.");

describe.skipIf(!url)("기존 canvas Graph의 검수 artifact를 비소유 runtime으로 생성", () => {
  let owner: Pool, database: typeof DatabaseRuntime, graph: StudioProjectGraphRepository, producer: StudioReviewPreviewProducerRepository;
  const users: string[] = [], works: string[] = [], priorDatabase = process.env.DATABASE_URL;
  beforeAll(async () => {
    if (!url || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) throw new Error("격리 로컬 DB만 사용합니다.");
    validatePostgresIntegrationUrl(url); process.env.DATABASE_URL = url;
    owner = new Pool({ connectionString: url, max: 2 });
    database = await import("../../platform/database");
    graph = new (await import("./studio-project-graph.repository")).StudioProjectGraphRepository();
    producer = new (await import("./studio-review-preview-producer.repository")).StudioReviewPreviewProducerRepository(graph);
  });
  afterEach(async () => {
    const client = await owner.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM studio_mutation_receipt WHERE "artifactId" IN
        (SELECT a.id FROM studio_artifact a JOIN studio_project_graph p ON p.id=a."projectId" WHERE p."workId"=ANY($1::text[]))`, [works]);
      await client.query('DELETE FROM creator_work WHERE id=ANY($1::text[])', [works.splice(0)]);
      await client.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users.splice(0)]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), database?.dbPool.end()]);
    if (priorDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = priorDatabase;
  });

  async function fixture() {
    const actor = randomUUID(), editor = randomUUID(), workId = randomUUID(), projectId = randomUUID(), artifactId = randomUUID();
    users.push(actor, editor); works.push(workId);
    const doc = { version: 3, width: 2, pagesList: [{ id: "saved-page", canvasH: 1, elements: [] }] };
    await owner.query('INSERT INTO "user" (id,name) VALUES ($1,$2),($3,$4)', [actor, "기존 원고 소유자", editor, "기존 원고 편집 담당자"]);
    await owner.query('INSERT INTO creator_work (id,"userId",title,doc,revision) VALUES ($1,$2,$3,$4::jsonb,4)', [workId, actor, "기존 canvas", JSON.stringify(doc)]);
    await owner.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,'editor','active',$3,now())`, [workId, editor, randomUUID()]);
    const input: StudioReviewPreviewCapture = { intentId: randomUUID(), workId, sourceServerRevision: 4, sourceContentDigest: studioReviewPreviewDigest(doc),
      pageCount: 1, title: "기존 원고 검수", deviceId: "existing-graph-runtime", createdAt: new Date().toISOString() };
    await graph.createProject(actor, { projectId, workId, workspaceId: randomUUID(), artifact: { id: artifactId, kind: "canvas-2d", title: "원래 canvas", scope: { projectId } },
      initialRevision: { id: randomUUID(), rootGraphHash: input.sourceContentDigest, deviceId: input.deviceId, createdAt: input.createdAt, blobRefs: [] } }, randomUUID());
    const stored = async () => ({
      work: (await owner.query('SELECT * FROM creator_work WHERE id=$1', [workId])).rows[0],
      project: (await owner.query('SELECT * FROM studio_project_graph WHERE id=$1', [projectId])).rows[0],
      originalArtifact: (await owner.query('SELECT * FROM studio_artifact WHERE id=$1', [artifactId])).rows[0],
      artifacts: (await owner.query('SELECT id FROM studio_artifact WHERE "projectId"=$1 ORDER BY id', [projectId])).rows,
    });
    return { actor, editor, workId, projectId, artifactId, input, stored };
  }

  async function asRuntime(action: (role: string) => Promise<void>) {
    const role = `existing_graph_${randomUUID().replaceAll("-", "")}`;
    await owner.query(`CREATE ROLE "${role}" NOLOGIN`);
    const runtime = new Pool({ connectionString: url, options: `-c role=${role}`, max: 3 });
    let restore: (() => void) | undefined;
    try {
      await owner.query(`GRANT USAGE ON SCHEMA public TO "${role}";
        GRANT SELECT ON TABLE public."user",public.creator_work,public.creator_work_collaborator,
          public.creator_draft_collaboration_room,public.creator_work_scoped_write_policy TO "${role}";
        GRANT UPDATE (name) ON TABLE public."user" TO "${role}";
        GRANT UPDATE ("updatedAt") ON TABLE public.creator_work,public.creator_work_collaborator,public.creator_draft_collaboration_room TO "${role}";`);
      await owner.query(buildStudioProjectGraphRuntimeAclSql(role));
      expect((await owner.query(`SELECT has_any_column_privilege($1,'public.studio_project_graph','UPDATE') AS mutable,
        pg_has_role($1,(SELECT relowner FROM pg_class WHERE oid='public.studio_project_graph'::regclass),'USAGE') AS owns`, [role])).rows[0]).toEqual({ mutable: false, owns: false });
      expect((await runtime.query("SELECT current_user")).rows[0].current_user).toBe(role);
      const connection = vi.spyOn(database.dbPool, "connect").mockImplementation(runtime.connect.bind(runtime));
      restore = () => connection.mockRestore();
      await action(role);
    } finally {
      restore?.(); await runtime.end();
      await owner.query(`DROP OWNED BY "${role}"`); await owner.query(`DROP ROLE "${role}"`);
    }
    expect((await owner.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [role])).rows).toEqual([]);
  }

  it.each(["owner", "editor"] as const)("%s는 기존 원고·Graph·일반 artifact를 보존하면서 검수 artifact를 준비한다", async (account) => {
    const f = await fixture(), before = await f.stored();
    await asRuntime(async () => {
      const intent = await producer.prepare(account === "owner" ? f.actor : f.editor, f.input);
      expect(intent.projectId).toBe(f.projectId);
      expect(intent.artifactId).not.toBe(f.artifactId);
      expect(await producer.prepare(account === "owner" ? f.actor : f.editor, f.input)).toEqual(intent);
      expect((await owner.query('SELECT "createdAt","updatedAt" FROM studio_artifact WHERE id=$1', [intent.artifactId])).rows[0])
        .toEqual({ createdAt: new Date(f.input.createdAt), updatedAt: new Date(f.input.createdAt) });
    });
    const after = await f.stored();
    expect(after.work).toEqual(before.work); expect(after.project).toEqual(before.project); expect(after.originalArtifact).toEqual(before.originalArtifact);
    expect(after.artifacts).toHaveLength(2);
  });

  it("사전 조회 뒤 멤버십이 회수되면 artifact 생성 transaction이 새 권한을 확인하고 원고를 보존한다", async () => {
    const f = await fixture(), before = await f.stored(), reached = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
    const create = graph.createArtifact.bind(graph);
    const gate = vi.spyOn(graph, "createArtifact").mockImplementation(async (...args) => { reached.resolve(); await resume.promise; return create(...args); });
    try {
      await asRuntime(async () => {
        const pending = producer.prepare(f.editor, f.input);
        await reached.promise;
        await owner.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [f.workId, f.editor]);
        resume.resolve();
        await expect(pending).rejects.toMatchObject({ name: "StudioProjectForbiddenError", operation: "view" });
      });
    } finally { resume.resolve(); gate.mockRestore(); }
    expect(await f.stored()).toEqual(before);
  });
});
