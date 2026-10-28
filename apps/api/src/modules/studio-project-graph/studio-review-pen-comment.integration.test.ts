import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { Image, encodePng } from "image-js";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createStudioReviewSpatialAnchor,
  type ReviewPenStroke,
} from "@toonstudio/studio-project-model";

import type * as DatabaseRuntime from "../../platform/database";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";
import type { CreateStudioReviewComment } from "./studio-project-graph.dto";
import type { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import type { StudioReviewPreviewProducerService } from "./studio-review-preview-producer.service";
import type { StudioReviewPreviewService } from "./studio-review-preview.service";
import { studioReviewPreviewDigest } from "./studio-review-preview-producer.contract";

const connection = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !connection) {
  throw new Error("CI는 펜 첨삭 DTO·영속성 검사에 실제 STUDIO_LIVE_POSTGRES_INTEGRATION_URL을 제공해야 합니다.");
}

(connection ? describe : describe.skip)("실제 PNG 검수본의 펜 첨삭 HTTP·PostgreSQL 경계", () => {
  let pool: Pool;
  let database: typeof DatabaseRuntime;
  let graph: StudioProjectGraphRepository;
  let producer: StudioReviewPreviewProducerService;
  let reader: StudioReviewPreviewService;
  let app: INestApplication;
  let origin: string;
  const users: string[] = [];
  const stored = new Map<string, Buffer>();
  const previousDatabase = process.env.DATABASE_URL;
  const previousAdmission = process.env.STUDIO_WORK_ASSET_ADMISSION;
  const pixels = new Uint8Array(200 * 160 * 4).fill(255);
  const png = Buffer.from(encodePng(new Image(200, 160, { data: pixels, colorModel: "RGBA" })));

  beforeAll(async () => {
    if (!connection) throw new Error("명시적인 통합 테스트 PostgreSQL 연결이 필요합니다.");
    process.env.DATABASE_URL = connection;
    process.env.STUDIO_WORK_ASSET_ADMISSION = "enable-immutable-readonly-work-assets-v1";
    pool = new Pool({ connectionString: connection, max: 3, application_name: "studio-review-pen-integration" });
    database = await import("../../platform/database");
    const { StudioProjectGraphRepository: Graph } = await import("./studio-project-graph.repository");
    const { DrizzleStudioWorkAssetRepository } = await import("../creator/studio-work-asset.repository");
    const { StudioWorkAssetService } = await import("../creator/studio-work-asset.service");
    const { StudioReviewPreviewProducerRepository } = await import("./studio-review-preview-producer.repository");
    const { StudioReviewPreviewProducerService } = await import("./studio-review-preview-producer.service");
    const { StudioReviewPreviewService } = await import("./studio-review-preview.service");
    const storage: PrivateObjectStoragePort = {
      async verifyPrivatePurposeBuckets() { return { ready: true, privatePurposeBuckets: 3 }; },
      async uploadImmutable(input) {
        const hash = createHash("sha256").update(input.bytes).digest("hex");
        const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const,
          purpose: input.purpose, digest: `sha256:${hash}`, objectPath: `sha256/${hash.slice(0, 2)}/${hash}`,
          byteLength: input.bytes.length, contentType: input.contentType };
        stored.set(`${object.purpose}:${object.digest}`, Buffer.from(input.bytes));
        return object;
      },
      async createSignedReadUrl({ object, expiresInSeconds }) {
        if (!stored.has(`${object.purpose}:${object.digest}`)) throw new Error("테스트의 실제 업로드 바이트가 없습니다.");
        return { url: `https://preview.invalid/${object.digest.slice(7)}`, expiresAtEpochMs: Date.now() + expiresInSeconds * 1_000 };
      },
      async deleteGeneratedObject({ object }) { stored.delete(`${object.purpose}:${object.digest}`); },
    };
    graph = new Graph();
    const assetService = new StudioWorkAssetService(new DrizzleStudioWorkAssetRepository(), storage);
    producer = new StudioReviewPreviewProducerService(new StudioReviewPreviewProducerRepository(graph), assetService);
    reader = new StudioReviewPreviewService(graph, storage);

    const { Module } = await import("@nestjs/common");
    const { NestFactory } = await import("@nestjs/core");
    const { StudioProjectGraphController } = await import("./studio-project-graph.controller");
    const { StudioProjectGraphService } = await import("./studio-project-graph.service");
    const { StudioExternalFileBindingRepository } = await import("./studio-external-file-binding.repository");
    class PenCommentBoundaryModule {}
    Module({ controllers: [StudioProjectGraphController], providers: [{ provide: StudioProjectGraphService,
      useValue: new StudioProjectGraphService(graph, new StudioExternalFileBindingRepository()) }] })(PenCommentBoundaryModule);
    app = await NestFactory.create(PenCommentBoundaryModule, { logger: false });
    app.setGlobalPrefix("api");
    // 신뢰된 actor header는 HTTP DTO/인가 fixture다. 실제 로그인·CSRF 성공은 별도 인증 suite에서 검증한다.
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  }, 30_000);

  afterEach(async () => {
    const ids = users.splice(0);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (ids.length) {
        // actor SET NULL이 불변 revision을 갱신하지 않도록 기존 producer와 같은 순서로 소유 graph를 먼저 정리한다.
        const revisions = `SELECT revision.id FROM studio_revision revision JOIN studio_artifact artifact ON artifact.id=revision."artifactId"
          JOIN studio_project_graph project ON project.id=artifact."projectId" JOIN creator_work work ON work.id=project."workId"
          WHERE work."userId"=ANY($1::text[])`;
        await client.query(`DELETE FROM studio_review WHERE "revisionId" IN (${revisions})`, [ids]);
        await client.query(`DELETE FROM studio_revision_parent WHERE "revisionId" IN (${revisions})`, [ids]);
        await client.query(`DELETE FROM studio_operation WHERE "resultRevisionId" IN (${revisions})`, [ids]);
        await client.query(`DELETE FROM studio_mutation_receipt WHERE "resultRevisionId" IN (${revisions})`, [ids]);
        await client.query('DELETE FROM creator_work WHERE "userId"=ANY($1::text[])', [ids]);
        await client.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [ids]);
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); stored.clear(); }
  });
  afterAll(async () => {
    await app?.close();
    await Promise.all([pool?.end(), database?.dbPool.end()]);
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
    if (previousAdmission === undefined) delete process.env.STUDIO_WORK_ASSET_ADMISSION; else process.env.STUDIO_WORK_ASSET_ADMISSION = previousAdmission;
  });

  async function actor(name: string) {
    const id = randomUUID(); users.push(id);
    await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [id, name]);
    return id;
  }
  async function member(workId: string, role: "editor" | "viewer") {
    const id = await actor(`펜 첨삭 ${role}`);
    await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt")
      VALUES ($1,$2,$3,'active',$4,now())`, [workId, id, role, randomUUID()]);
    return id;
  }
  async function capture(mapped = true) {
    const owner = await actor("펜 첨삭 소유자"), workId = randomUUID();
    const doc = { version: 3, ...(mapped ? { width: 100 } : {}), fixtureWorkId: workId,
      pagesList: [0, 1].map((ordinal) => ({ id: `page-${ordinal}`, canvasH: 80,
        elements: [{ id: `cut-${ordinal}`, type: "frame", x: 10, y: 10, width: 60, height: 50 }] })) };
    await pool.query('INSERT INTO creator_work (id,"userId",title,doc,revision) VALUES ($1,$2,$3,$4::jsonb,4)', [workId, owner, "실제 PNG 펜 검수", JSON.stringify(doc)]);
    const editor = await member(workId, "editor"), viewer = await member(workId, "viewer");
    const outsider = await actor("다른 작품 소유자"), otherWorkId = randomUUID();
    await pool.query('INSERT INTO creator_work (id,"userId",title) VALUES ($1,$2,$3)', [otherWorkId, outsider, "권한이 섞이면 안 되는 작품"]);
    // 저장된 실제 doc에서 digest를 계산하고 producer가 생성한 operation/receipt/PNG mapping을 그대로 읽는다.
    const input = { intentId: randomUUID(), workId, sourceServerRevision: 4, sourceContentDigest: studioReviewPreviewDigest(doc),
      pageCount: 2, title: "펜 첨삭 고정본", deviceId: "pen-integration", createdAt: new Date().toISOString() };
    const intent = await producer.prepare(owner, input);
    const pages = [];
    for (let ordinal = 0; ordinal < 2; ordinal++) {
      const page = await producer.upload(owner, intent, ordinal, { buffer: Buffer.from(png), size: png.length, mimetype: "image/png" });
      pages.push({ ordinal, sha256: page.sha256 });
    }
    const completed = await producer.complete(owner, { intent, pages });
    if (completed.status !== "completed") throw new Error("실제 producer 검수 캡처가 완료되지 않았습니다.");
    const read = await reader.read(owner, completed.subject, null);
    if (!read.ok || !read.previews[0]?.mapping) throw new Error("실제 검수 mapping이 없습니다.");
    const mapping = read.previews[0].mapping;
    expect(mapping.status).toBe(mapped ? "mapped" : "unmapped");
    return { owner, editor, viewer, outsider, workId, otherWorkId, input, subject: completed.subject, mapping };
  }
  type Fixture = Awaited<ReturnType<typeof capture>>;
  function note(f: Fixture): CreateStudioReviewComment {
    const spatial = createStudioReviewSpatialAnchor(f.mapping, { kind: "region", frameId: "cut-0", x: 20, y: 20, width: 30, height: 20 });
    if (!spatial) throw new Error("실제 저장 원고 안의 region을 만들지 못했습니다.");
    const strokes: readonly ReviewPenStroke[] = [{ id: "pen-stroke-1", color: "#e5484d", width: 2,
      points: [{ x: 22, y: 22 }, { x: 35, y: 30 }, { x: 45, y: 35 }] }];
    return { id: randomUUID(), body: "이 고정 원고의 선을 수정해 주세요.", severity: "note", assigneeIds: [],
      anchor: { ...spatial, artifactId: f.subject.artifactId, revisionId: f.subject.revisionId, scope: { projectId: f.subject.projectId } }, strokes };
  }
  const reviewPath = (f: Fixture) => `/studio-project-graph/reviews/${f.subject.reviewId}`;
  async function request(userId: string | null, path: string, body?: unknown) {
    const response = await fetch(`${origin}/api${path}`, { method: body === undefined ? "GET" : "POST", headers: {
      ...(userId ? { "x-user-id": userId } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const payload: unknown = await response.json();
    return { status: response.status, payload };
  }
  async function rows(commentId: string) {
    return (await pool.query<{ strokes: readonly ReviewPenStroke[] }>('SELECT strokes FROM studio_review_comment WHERE id=$1', [commentId])).rows;
  }
  async function expectRejectedWithoutWrite(f: Fixture, input: unknown, status: number, causeCode?: string) {
    const result = await request(f.editor, `${reviewPath(f)}/comments`, input);
    expect(result.status).toBe(status);
    if (causeCode) expect(result.payload).toMatchObject({ code: "studio_invariant_violation", causeCode });
    expect((await graph.getReview(f.owner, f.subject.reviewId)).comments).toEqual([]);
  }

  it("실제 HTTP DTO가 펜 획을 201로 저장하고 다른 계정·새 repository가 같은 획을 읽는다", async () => {
    const f = await capture(), input = note(f);
    expect(f.mapping).toMatchObject({ status: "mapped", sourceContentDigest: f.input.sourceContentDigest,
      page: { ordinal: 0, id: "page-0", width: 100, height: 80, renderWidth: 200, renderHeight: 160 } });
    const created = await request(f.editor, `${reviewPath(f)}/comments`, input);
    expect(created.status).toBe(201);
    expect(created.payload).toMatchObject({ id: input.id, anchor: input.anchor, strokes: input.strokes });
    const read = await request(f.owner, reviewPath(f));
    expect(read.status).toBe(200);
    expect(read.payload).toMatchObject({ comments: [{ id: input.id, authorUserId: f.editor, anchor: input.anchor, strokes: input.strokes }] });
    const { StudioProjectGraphRepository: Graph } = await import("./studio-project-graph.repository");
    expect((await new Graph().getReview(f.viewer, f.subject.reviewId)).comments).toMatchObject([{ id: input.id, strokes: input.strokes }]);
    expect(await rows(input.id)).toEqual([{ strokes: input.strokes }]);
  });

  it("동일 ID·동일 작성자·동일 획의 동시 재전송은 댓글 멱등 원장 1행만 보존한다", async () => {
    const f = await capture(), input = note(f);
    const receiptsBefore = (await pool.query('SELECT count(*)::int AS n FROM studio_mutation_receipt WHERE "artifactId"=$1', [f.subject.artifactId])).rows[0].n;
    const [first, repeated] = await Promise.all([0, 1].map(() => request(f.editor, `${reviewPath(f)}/comments`, input)));
    expect(first?.status).toBe(201); expect(repeated?.status).toBe(201); expect(repeated?.payload).toEqual(first?.payload);
    expect(await rows(input.id)).toEqual([{ strokes: input.strokes }]);
    expect((await graph.getReview(f.owner, f.subject.reviewId)).comments).toHaveLength(1);
    // 댓글 ID 행 자체가 멱등 원장이다. capture mutation 영수증을 새로 만들었다고 주장하지 않는다.
    expect((await pool.query('SELECT count(*)::int AS n FROM studio_mutation_receipt WHERE "artifactId"=$1', [f.subject.artifactId])).rows[0].n).toBe(receiptsBefore);
  });

  it("같은 ID의 다른 획·다른 작성자·다른 검수본 재사용을 409로 거절한다", async () => {
    const f = await capture(), input = note(f);
    expect((await request(f.editor, `${reviewPath(f)}/comments`, input)).status).toBe(201);
    const changed = { ...input, strokes: input.strokes?.map((stroke) => ({ ...stroke, points: [{ x: 23, y: 22 }, ...stroke.points.slice(1)] })) };
    for (const [userId, body] of [[f.editor, changed], [f.owner, input]] as const) {
      const response = await request(userId, `${reviewPath(f)}/comments`, body);
      expect(response.status).toBe(409); expect(response.payload).toMatchObject({ code: "studio_idempotency_conflict" });
    }
    const other = await capture(), otherInput = { ...note(other), id: input.id };
    expect((await request(other.editor, `${reviewPath(other)}/comments`, otherInput)).status).toBe(409);
    expect(await rows(input.id)).toEqual([{ strokes: input.strokes }]);
    expect((await graph.getReview(other.owner, other.subject.reviewId)).comments).toEqual([]);
  });

  it.each([["페이지 밖", 101, 30], ["region 밖", 60, 30]] as const)("%s의 획은 실제 mapping 검증에서 거절한다", async (_label, x, y) => {
    const f = await capture(), input = note(f);
    await expectRejectedWithoutWrite(f, { ...input, strokes: [{ ...input.strokes?.[0], points: [{ x: 22, y: 22 }, { x, y }] }] }, 422, "review_pen_strokes_mismatch");
  });

  it("다른 실제 저장 원고의 source digest를 붙인 획을 거절한다", async () => {
    const f = await capture(), other = await capture(), input = note(f);
    await expectRejectedWithoutWrite(f, { ...input, anchor: { ...input.anchor, source: {
      ...input.anchor.source, sourceContentDigest: other.input.sourceContentDigest,
    } } }, 422, "review_source_anchor_mismatch");
  });

  it("실제 producer의 unmapped 페이지에 caller source를 붙여도 펜을 저장하지 않는다", async () => {
    const f = await capture(false), mapped = await capture(), input = note(mapped);
    await expectRejectedWithoutWrite(f, { ...input, anchor: { ...input.anchor, artifactId: f.subject.artifactId,
      revisionId: f.subject.revisionId, scope: { projectId: f.subject.projectId }, source: { ...input.anchor.source,
        sourceServerRevision: f.input.sourceServerRevision, sourceContentDigest: f.input.sourceContentDigest,
        pageOrdinal: 0, pageId: "page-0" } } }, 422, "review_source_anchor_mismatch");
  });

  it("유효한 JSON이라도 획 모양이나 source region이 없으면 HTTP DTO에서 400으로 거절한다", async () => {
    const f = await capture(), input = note(f);
    const { source: _source, ...withoutSource } = input.anchor;
    const invalid = [
      { ...input, anchor: withoutSource },
      { ...input, anchor: { artifactId: f.subject.artifactId, revisionId: f.subject.revisionId, scope: input.anchor.scope, kind: "artifact" } },
      { ...input, strokes: [{ ...input.strokes?.[0], points: [{ x: 22, y: 22 }] }] },
      { ...input, strokes: [{ ...input.strokes?.[0], color: "url(https://invalid.example)" }] },
      { ...input, strokes: [input.strokes?.[0], input.strokes?.[0]] },
    ];
    for (const body of invalid) await expectRejectedWithoutWrite(f, body, 400);
  });

  it("viewer·타 작품 소유자·미인증 요청은 저장하지 못하고 원래 viewer는 고정된 획을 읽는다", async () => {
    const f = await capture(), input = note(f);
    for (const userId of [f.viewer, f.outsider, null]) expect((await request(userId, `${reviewPath(f)}/comments`, input)).status).toBe(403);
    expect(await rows(input.id)).toEqual([]);
    expect((await request(f.owner, `${reviewPath(f)}/comments`, input)).status).toBe(201);
    const read = await request(f.viewer, reviewPath(f));
    expect(read.status).toBe(200); expect(read.payload).toMatchObject({ comments: [{ id: input.id, strokes: input.strokes }] });
    expect((await request(f.outsider, reviewPath(f))).status).toBe(403);
  });

  it("권한을 낮추거나 회수하면 동일 ID 재전송도 현재 ACL을 다시 검사한다", async () => {
    const f = await capture(), input = note(f);
    const first = await request(f.editor, `${reviewPath(f)}/comments`, input); expect(first.status).toBe(201);
    await pool.query(`UPDATE creator_work_collaborator SET role='viewer' WHERE "workId"=$1 AND "userId"=$2`, [f.workId, f.editor]);
    expect((await request(f.editor, `${reviewPath(f)}/comments`, input)).status).toBe(403);
    expect((await request(f.editor, reviewPath(f))).status).toBe(200);
    await pool.query(`UPDATE creator_work_collaborator SET status='declined' WHERE "workId"=$1 AND "userId"=$2`, [f.workId, f.editor]);
    expect((await request(f.editor, reviewPath(f))).status).toBe(403);
    expect((await request(f.editor, `${reviewPath(f)}/comments`, input)).status).toBe(403);
    expect(await rows(input.id)).toEqual([{ strokes: input.strokes }]);
  });

  it.each(["approved", "rejected", "cancelled"] as const)("%s 뒤 새 획은 거절하고 기존 동일 요청의 획은 보존한다", async (status) => {
    const f = await capture(), input = note(f);
    const first = await request(f.editor, `${reviewPath(f)}/comments`, input); expect(first.status).toBe(201);
    await graph.decideReview(f.owner, f.subject.reviewId, { status });
    const late = await request(f.editor, `${reviewPath(f)}/comments`, { ...input, id: randomUUID() });
    expect(late.status).toBe(422); expect(late.payload).toMatchObject({ causeCode: "review_already_decided" });
    const repeated = await request(f.editor, `${reviewPath(f)}/comments`, input);
    expect(repeated.status).toBe(201); expect(repeated.payload).toEqual(first.payload);
    expect(await rows(input.id)).toEqual([{ strokes: input.strokes }]);
  });

  it("획 없는 기존 댓글과 명시적인 빈 획은 같은 멱등 입력으로 호환된다", async () => {
    const f = await capture(), { strokes: _strokes, ...legacy } = note(f);
    const first = await request(f.editor, `${reviewPath(f)}/comments`, legacy);
    expect(first.status).toBe(201); expect(first.payload).toMatchObject({ strokes: [] });
    const repeated = await request(f.editor, `${reviewPath(f)}/comments`, { ...legacy, strokes: [] });
    expect(repeated.status).toBe(201); expect(repeated.payload).toEqual(first.payload);
    expect(await rows(legacy.id)).toEqual([{ strokes: [] }]);
    const moved = { ...legacy.anchor, x: 21 };
    // 빈 획에는 새 펜 anchor 불변 규칙을 소급하지 않고 기존 DB anchor 정책을 유지한다.
    expect((await pool.query('UPDATE studio_review_comment SET anchor=$2::jsonb WHERE id=$1', [legacy.id, JSON.stringify(moved)])).rowCount).toBe(1);
    expect((await pool.query('SELECT anchor,strokes FROM studio_review_comment WHERE id=$1', [legacy.id])).rows).toEqual([{ anchor: moved, strokes: [] }]);
  });

  it("DB 직접 갱신도 저장한 획과 source region anchor를 교체하지 못한다", async () => {
    const f = await capture(), input = note(f);
    expect((await request(f.editor, `${reviewPath(f)}/comments`, input)).status).toBe(201);
    await expect(pool.query('UPDATE studio_review_comment SET strokes=$2::jsonb WHERE id=$1', [input.id, "[]"])).rejects.toMatchObject({ code: "23514" });
    // 새 region도 원래 획을 모두 포함한다. 좌표 유효성과 별개로 저장된 anchor 자체가 불변이어야 한다.
    await expect(pool.query('UPDATE studio_review_comment SET anchor=$2::jsonb WHERE id=$1', [input.id, JSON.stringify({ ...input.anchor, x: 21 })])).rejects.toMatchObject({ code: "23514" });
    expect(await rows(input.id)).toEqual([{ strokes: input.strokes }]);
    expect((await pool.query('SELECT anchor FROM studio_review_comment WHERE id=$1', [input.id])).rows).toEqual([{ anchor: input.anchor }]);
  });

  it("직접 SQL에서 float64 최소 양수 획 굵기는 보존하고 0으로 underflow하는 JSON 숫자는 거절한다", async () => {
    const f = await capture(), input = note(f), minimumId = randomUUID(), underflowId = randomUUID();
    const insert = `INSERT INTO studio_review_comment (id,"reviewId","authorUserId",anchor,body,severity,strokes)
      VALUES ($1,$2,$3,$4::jsonb,$5,'note',jsonb_set($6::jsonb,'{0,width}',$7::jsonb))`;
    const values = [f.subject.reviewId, f.editor, JSON.stringify(input.anchor), input.body, JSON.stringify(input.strokes)];
    // 문자열 parameter를 JSONB 숫자로 변환해 JS JSON.stringify의 선행 반올림·underflow를 피한다.
    await pool.query(insert, [minimumId, ...values, "5e-324"]);
    expect((await rows(minimumId))[0]?.strokes[0]?.width).toBe(Number.MIN_VALUE);
    expect((await pool.query(`SELECT (strokes #>> '{0,width}')::numeric > 0 AS positive FROM studio_review_comment WHERE id=$1`, [minimumId])).rows).toEqual([{ positive: true }]);
    await expect(pool.query(insert, [underflowId, ...values, "1e-1000"])).rejects.toMatchObject({ code: "23514" });
    expect(await rows(underflowId)).toEqual([]);
  });

  it.each([false, true])("추가형 migration이 이전 빈 댓글/기존 댓글 상태(existing=%s)와 재적용을 보존한다", async (existing) => {
    const f = await capture(), input = note(f), schema = `pen_migration_${randomUUID().replaceAll("-", "")}`;
    const sql = await readFile(new URL("../../platform/database/migrations/0114_studio_review_comment_pen_strokes.sql", import.meta.url), "utf8");
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      // 전체 빈 DB migration 순서는 별도 runner가 검사한다. 여기서는 실제 이전 댓글 열에 대한 추가형 변경·backfill을 격리한다.
      await client.query(`CREATE TABLE "${schema}".studio_review_comment (id text PRIMARY KEY, anchor jsonb NOT NULL, body text NOT NULL)`);
      if (existing) await client.query(`INSERT INTO "${schema}".studio_review_comment (id,anchor,body) VALUES ($1,$2::jsonb,$3)`, [input.id, JSON.stringify(input.anchor), "기존 댓글 원문"]);
      // migration 자체의 BEGIN/COMMIT을 유지한다. 별도 연결의 session search_path는 그 경계 밖에서 설정한다.
      await client.query(`SET search_path TO "${schema}", pg_catalog`);
      await client.query(sql);
      if (existing) expect((await client.query('SELECT id,anchor,body,strokes FROM studio_review_comment WHERE id=$1', [input.id])).rows)
        .toEqual([{ id: input.id, anchor: input.anchor, body: "기존 댓글 원문", strokes: [] }]);
      const penId = randomUUID();
      await client.query('INSERT INTO studio_review_comment (id,anchor,body,strokes) VALUES ($1,$2::jsonb,$3,$4::jsonb)', [penId, JSON.stringify(input.anchor), "새 펜 댓글", JSON.stringify(input.strokes)]);
      await client.query(sql);
      expect((await client.query('SELECT strokes FROM studio_review_comment WHERE id=$1', [penId])).rows).toEqual([{ strokes: input.strokes }]);
      const legacyId = randomUUID();
      await client.query('INSERT INTO studio_review_comment (id,anchor,body) VALUES ($1,$2::jsonb,$3)', [legacyId, JSON.stringify(input.anchor), "기존 클라이언트의 새 댓글"]);
      expect((await client.query('SELECT strokes FROM studio_review_comment WHERE id=$1', [legacyId])).rows).toEqual([{ strokes: [] }]);
      await expect(client.query('INSERT INTO studio_review_comment (id,anchor,body,strokes) VALUES ($1,$2::jsonb,$3,$4::jsonb)', [randomUUID(), JSON.stringify(input.anchor), "잘못된 획", "{}"])).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("ROLLBACK");
      await client.query("RESET search_path");
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
    }
  });
});
