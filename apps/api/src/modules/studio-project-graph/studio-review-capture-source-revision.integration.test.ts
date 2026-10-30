import { createHash, randomUUID } from "node:crypto";
import { Image, encodePng } from "image-js";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type * as DatabaseRuntime from "../../platform/database";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";
import type { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import type { StudioReviewPreviewProducerService } from "./studio-review-preview-producer.service";
import { studioReviewPreviewCaptureSchema, studioReviewPreviewDigest, type StudioReviewPreviewIntent } from "./studio-review-preview-producer.contract";

const url = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !url) throw new Error("CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL for source revision capture proofs");
const withPostgres = url ? describe : describe.skip;

withPostgres("명시적 제출 원본과 검수 capture의 실제 PostgreSQL 증명", () => {
  let pool: Pool, database: typeof DatabaseRuntime, graph: StudioProjectGraphRepository, service: StudioReviewPreviewProducerService;
  const actors: string[] = [], priorDatabase = process.env.DATABASE_URL, priorAdmission = process.env.STUDIO_WORK_ASSET_ADMISSION;
  const bytes = Buffer.from(encodePng(new Image(1, 1, { data: new Uint8Array([20, 30, 40, 255]), colorModel: "RGBA" })));
  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.STUDIO_WORK_ASSET_ADMISSION = "enable-immutable-readonly-work-assets-v1";
    pool = new Pool({ connectionString: url, max: 2, application_name: "capture-source-revision-test" });
    database = await import("../../platform/database");
    graph = new (await import("./studio-project-graph.repository")).StudioProjectGraphRepository();
    const assets = new (await import("../creator/studio-work-asset.repository")).DrizzleStudioWorkAssetRepository();
    const storage: PrivateObjectStoragePort = {
      async verifyPrivatePurposeBuckets() { return { ready: true, privatePurposeBuckets: 3 }; },
      async uploadImmutable(input) {
        const hash = createHash("sha256").update(input.bytes).digest("hex");
        return { contractVersion: "toonspectrum.private-object-storage.v2", providerId: "cloudflare-r2", purpose: input.purpose,
          digest: `sha256:${hash}`, objectPath: `sha256/${hash.slice(0, 2)}/${hash}`, byteLength: input.bytes.length, contentType: input.contentType };
      },
      async createSignedReadUrl({ expiresInSeconds }) { return { url: "https://preview.invalid/source", expiresAtEpochMs: Date.now() + expiresInSeconds * 1_000 }; },
      async deleteGeneratedObject() {},
    };
    const assetService = new (await import("../creator/studio-work-asset.service")).StudioWorkAssetService(assets, storage);
    const repository = new (await import("./studio-review-preview-producer.repository")).StudioReviewPreviewProducerRepository(graph);
    service = new (await import("./studio-review-preview-producer.service")).StudioReviewPreviewProducerService(repository, assetService);
  });
  afterEach(async () => {
    const ids = actors.splice(0);
    if (!ids.length) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const revisions = `SELECT revision.id FROM studio_revision revision JOIN studio_artifact artifact ON artifact.id=revision."artifactId"
        JOIN studio_project_graph project ON project.id=artifact."projectId" JOIN creator_work work ON work.id=project."workId" WHERE work."userId"=ANY($1::text[])`;
      await client.query(`DELETE FROM studio_review WHERE "revisionId" IN (${revisions})`, [ids]);
      await client.query(`DELETE FROM studio_revision_parent WHERE "revisionId" IN (${revisions})`, [ids]);
      await client.query(`DELETE FROM studio_operation WHERE "resultRevisionId" IN (${revisions})`, [ids]);
      await client.query(`DELETE FROM studio_mutation_receipt WHERE "resultRevisionId" IN (${revisions})`, [ids]);
      await client.query('DELETE FROM creator_work WHERE "userId"=ANY($1::text[])', [ids]);
      await client.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [ids]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
  afterAll(async () => {
    await Promise.all([pool?.end(), database?.dbPool.end()]);
    if (priorDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = priorDatabase;
    if (priorAdmission === undefined) delete process.env.STUDIO_WORK_ASSET_ADMISSION; else process.env.STUDIO_WORK_ASSET_ADMISSION = priorAdmission;
  });

  async function fixture() {
    const actor = randomUUID(), workId = randomUUID(), projectId = randomUUID(), artifactId = randomUUID(), revisionId = randomUUID();
    actors.push(actor);
    const doc = { version: 3, width: 1, pagesList: [{ id: "saved-page", canvasH: 1, elements: [] }] };
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [actor, "검수 원본 통합 테스트"]);
    await pool.query('INSERT INTO creator_work (id,"userId",title,doc,revision) VALUES ($1,$2,$3,$4::jsonb,4)', [workId, actor, "검수 원본", JSON.stringify(doc)]);
    const sourceRevision = { artifactId, revisionId, rootGraphHash: studioReviewPreviewDigest(doc) }, scope = { projectId, episodeId: randomUUID() };
    await graph.createProject(actor, { projectId, workId, workspaceId: randomUUID(),
      artifact: { id: artifactId, kind: "canvas-2d", title: "회차 제출 원고", scope },
      initialRevision: { id: revisionId, rootGraphHash: sourceRevision.rootGraphHash, deviceId: "source-test", createdAt: new Date().toISOString(), blobRefs: [] } }, randomUUID());
    const input = { intentId: randomUUID(), workId, sourceServerRevision: 4, sourceContentDigest: sourceRevision.rootGraphHash,
      pageCount: 1, title: "제출본 검수", deviceId: "source-test", createdAt: new Date().toISOString(), sourceRevision };
    return { actor, workId, projectId, artifactId, revisionId, sourceRevision, scope, input };
  }
  async function upload(actor: string, intent: StudioReviewPreviewIntent) {
    const page = await service.upload(actor, intent, 0, { buffer: bytes, size: bytes.length, mimetype: "image/png" });
    return { intent, pages: [{ ordinal: 0, sha256: page.sha256 }] };
  }

  it("원본 exact tuple과 DB 회차 범위를 다른 ID의 capture로 보존하고 조회 시 증명한다", async () => {
    const f = await fixture(), intent = await service.prepare(f.actor, f.input);
    expect(intent.sourceRevisionScope).toEqual(f.scope);
    const result = await service.complete(f.actor, await upload(f.actor, intent));
    if (result.status !== "completed") throw new Error("검수 capture가 완료되지 않았습니다.");
    expect(result.subject.revisionId).not.toBe(f.revisionId);
    expect((await graph.listReviews(f.actor, intent.artifactId))[0]?.sourceRevision).toEqual({ ...f.sourceRevision, scope: f.scope });
    const stored = await pool.query('SELECT operation FROM studio_operation WHERE "resultRevisionId"=$1', [result.subject.revisionId]);
    expect(stored.rows[0].operation.payload.intent.sourceRevision).toEqual(f.sourceRevision);
    await expect(pool.query('UPDATE studio_revision SET "rootGraphHash"=$2 WHERE id=$1', [f.revisionId, "a".repeat(64)])).rejects.toMatchObject({ code: "55000" });
    await pool.query('UPDATE studio_artifact SET scope=$2::jsonb WHERE id=$1', [f.artifactId, JSON.stringify({ ...f.scope, episodeId: "changed-episode" })]);
    expect((await graph.listReviews(f.actor, intent.artifactId))[0]?.sourceRevision).toBeUndefined();
  });
  it("명시적 원본이 없는 기존 capture에서 hash만으로 원본을 추론하지 않는다", async () => {
    const f = await fixture(), { sourceRevision: _source, ...legacy } = f.input;
    const intent = await service.prepare(f.actor, legacy);
    await service.complete(f.actor, await upload(f.actor, intent));
    expect((await graph.listReviews(f.actor, intent.artifactId))[0]?.sourceRevision).toBeUndefined();
  });
  it("없는 원본·다른 작품·다른 digest와 caller 회차 주장을 prepare에서 차단한다", async () => {
    const f = await fixture(), other = await fixture();
    for (const sourceRevision of [{ ...f.sourceRevision, revisionId: randomUUID() }, other.sourceRevision,
      { ...f.sourceRevision, rootGraphHash: "a".repeat(64) }]) {
      await expect(service.prepare(f.actor, { ...f.input, sourceRevision })).rejects.toMatchObject({ status: 409 });
    }
    expect(studioReviewPreviewCaptureSchema.safeParse({ ...f.input, sourceRevision: { ...f.sourceRevision, scope: f.scope } }).success).toBe(false);
  });
  it("동일 intent를 다른 원본 ID로 재사용하거나 준비 뒤 범위를 바꾸면 완료하지 않는다", async () => {
    const f = await fixture(), intent = await service.prepare(f.actor, f.input), complete = await upload(f.actor, intent);
    await expect(service.prepare(f.actor, { ...f.input, sourceRevision: { ...f.sourceRevision, revisionId: randomUUID() } })).rejects.toMatchObject({ status: 409 });
    await pool.query('UPDATE studio_artifact SET scope=$2::jsonb WHERE id=$1', [f.artifactId, JSON.stringify({ ...f.scope, episodeId: "changed-episode" })]);
    await expect(service.complete(f.actor, complete)).rejects.toMatchObject({ status: 409 });
  });
  it("원본 tuple을 알아도 현재 편집 권한이 없으면 준비·완료·조회하지 못한다", async () => {
    const f = await fixture(), editor = randomUUID(); actors.push(editor);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [editor, "철회 검증 편집자"]);
    await expect(service.prepare(editor, f.input)).rejects.toMatchObject({ status: 403 });
    await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt")
      VALUES ($1,$2,'editor','active',$3,now())`, [f.workId, editor, randomUUID()]);
    // 소유자가 준비한 기존 graph를 편집자가 재사용해 새 권한을 만들지 않는다.
    await service.prepare(f.actor, f.input);
    const intent = await service.prepare(editor, { ...f.input, intentId: randomUUID() }), complete = await upload(editor, intent);
    await pool.query(`UPDATE creator_work_collaborator SET status='declined' WHERE "workId"=$1 AND "userId"=$2`, [f.workId, editor]);
    await expect(service.complete(editor, complete)).rejects.toMatchObject({ status: 403 });
    await expect(service.prepare(editor, { ...f.input, intentId: intent.intentId })).rejects.toMatchObject({ status: 403 });
    await expect(graph.listReviews(editor, intent.artifactId)).rejects.toMatchObject({ operation: "view" });
  });
});
