import { randomBytes } from "node:crypto";
import { Image, encodePng } from "image-js";
import type { Pool } from "pg";
import { expect, it } from "vitest";
import type { StudioReviewPreviewSubject } from "./studio-review-preview";
import type { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import { canonicalizeStudioReviewPreview } from "./studio-review-preview-canonicalizer";
import { studioReviewPreviewDigest, type StudioReviewPreviewIntent } from "./studio-review-preview-producer.contract";
import type { StudioReviewPreviewProducerService } from "./studio-review-preview-producer.service";

interface PreviewCaseDependencies {
  readonly pool: () => Pool;
  readonly service: () => StudioReviewPreviewProducerService;
  readonly graph: () => StudioProjectGraphRepository;
  readonly capture: () => Promise<{ readonly actor: string; readonly intent: StudioReviewPreviewIntent }>;
  readonly completeCapture: (actor: string, intent: StudioReviewPreviewIntent) => Promise<{ readonly subject: StudioReviewPreviewSubject }>;
}
interface BlobSnapshot {
  readonly metadata: unknown;
  readonly xmin: string;
  readonly ctid: string;
}

async function snapshot(pool: Pool, hash: string): Promise<BlobSnapshot> {
  const result = await pool.query<BlobSnapshot>(`SELECT to_jsonb(blob) AS metadata,
    xmin::text AS xmin,ctid::text AS ctid FROM studio_blob blob WHERE hash=$1`, [hash]);
  expect(result.rows).toHaveLength(1);
  const row = result.rows[0];
  if (!row) throw new Error("고유 preview blob 회귀 행이 없습니다.");
  return row;
}

async function uniqueBlobFixture(dependencies: PreviewCaseDependencies) {
  const fixture = await dependencies.capture(), pool = dependencies.pool();
  const pixels = new Uint8Array(randomBytes(8)); pixels[3] = 255; pixels[7] = 255;
  const png = Buffer.from(encodePng(new Image(2, 1, { data: pixels, colorModel: "RGBA" })));
  const canonical = await canonicalizeStudioReviewPreview(png, `${studioReviewPreviewDigest(fixture.intent)}:0`);
  const hash = canonical.sha256; canonical.bytes.fill(0);
  expect((await pool.query("SELECT hash FROM studio_blob WHERE hash=$1", [hash])).rows).toEqual([]);
  const upload = () => dependencies.service().upload(fixture.actor, fixture.intent, 0,
    { buffer: Buffer.from(png), size: png.length, mimetype: "image/png" });
  try {
    expect(await upload()).toMatchObject({ ordinal: 0, sha256: hash });
    const references = await pool.query<{ workId: string }>(`SELECT DISTINCT "workId"
      FROM creator_work_asset_storage_reference WHERE purpose='derived' AND "objectDigest"=$1`, [`sha256:${hash}`]);
    expect(references.rows).toEqual([{ workId: fixture.intent.workId }]);
    return { ...fixture, hash, upload, cleanup: async () => {
      const otherReferences = await pool.query(`SELECT 1 FROM creator_work_asset_storage_reference
        WHERE purpose='derived' AND "objectDigest"=$1 AND "workId"<>$2`, [`sha256:${hash}`, fixture.intent.workId]);
      expect(otherReferences.rows).toEqual([]);
      // 새로 만든 blob만 정리한다. 불변 revision이 가리키는 행은 삭제하지 않는다.
      await pool.query(`DELETE FROM studio_blob WHERE hash=$1 AND NOT EXISTS
        (SELECT 1 FROM studio_revision_blob WHERE "blobHash"=$1) AND NOT EXISTS
        (SELECT 1 FROM creator_work_asset_storage_reference WHERE purpose='derived'
          AND "objectDigest"=$2 AND "workId"<>$3)`, [hash, `sha256:${hash}`, fixture.intent.workId]);
      png.fill(0);
    } };
  } catch (error) {
    // 최초 업로드 실패 때도 이 fixture에서 새로 만든 미참조 blob만 정리한다.
    await pool.query(`DELETE FROM studio_blob WHERE hash=$1 AND NOT EXISTS
      (SELECT 1 FROM studio_revision_blob WHERE "blobHash"=$1) AND NOT EXISTS
      (SELECT 1 FROM creator_work_asset_storage_reference WHERE purpose='derived'
        AND "objectDigest"=$2 AND "workId"<>$3)`, [hash, `sha256:${hash}`, fixture.intent.workId]);
    png.fill(0);
    throw error;
  }
}

export function registerStudioReviewPreviewProducerCases(dependencies: PreviewCaseDependencies): void {
  it.each(["studio_project_graph", "studio_artifact"] as const)("keeps capture timestamps monotonic when %s is ahead of the current clock", async (table) => {
    const f = await dependencies.capture(), pool = dependencies.pool();
    const id = table === "studio_project_graph" ? f.intent.projectId : f.intent.artifactId;
    // 대기나 제약 완화 없이 시계 역행을 결정적으로 재현한다.
    await pool.query(`UPDATE ${table} SET "createdAt"=clock_timestamp()+interval '1 hour', "updatedAt"=clock_timestamp()+interval '2 hours' WHERE id=$1`, [id]);
    const before = (await pool.query(`SELECT "updatedAt" FROM ${table} WHERE id=$1`, [id])).rows[0];
    if (!before) throw new Error("시계 회귀의 대상 metadata가 없습니다.");
    const result = await dependencies.completeCapture(f.actor, f.intent);
    const after = (await pool.query(`SELECT "updatedAt">=$2::timestamptz AS retained, "updatedAt">="createdAt" AS valid FROM ${table} WHERE id=$1`, [id, before.updatedAt])).rows[0];
    expect(after).toEqual({ retained: true, valid: true });
    expect((await dependencies.graph().getReview(f.actor, result.subject.reviewId)).status).toBe("open");
  });

  it("동일한 clean·valid preview 재업로드는 blob과 xmin·ctid를 다시 쓰지 않는다", async () => {
    const fixture = await uniqueBlobFixture(dependencies), pool = dependencies.pool();
    try {
      const before = await snapshot(pool, fixture.hash);
      expect(before.metadata).toMatchObject({ malwareStatus: "clean", formatStatus: "valid" });
      expect(await fixture.upload()).toMatchObject({ ordinal: 0, sha256: fixture.hash });
      expect(await snapshot(pool, fixture.hash)).toEqual(before);
    } finally { await fixture.cleanup(); }
  });

  it.each([
    { malware: "pending", format: "pending" },
    { malware: "pending", format: "valid" },
    { malware: "clean", format: "pending" },
    { malware: "blocked", format: "valid" },
    { malware: "clean", format: "invalid" },
  ])("기존 $malware·$format preview는 승격하지 않고 거절하며 행을 보존한다", async ({ malware, format }) => {
    const fixture = await uniqueBlobFixture(dependencies), pool = dependencies.pool();
    try {
      // 고유 hash의 reference가 이 새 작품에만 있음을 위에서 확인한 뒤 owner fixture로 상태를 만든다.
      await pool.query('UPDATE studio_blob SET "malwareStatus"=$2,"formatStatus"=$3 WHERE hash=$1', [fixture.hash, malware, format]);
      const before = await snapshot(pool, fixture.hash);
      await expect(fixture.upload()).rejects.toMatchObject({ status: 409, response: { code: "preview-blob-metadata-conflict" } });
      expect(await snapshot(pool, fixture.hash)).toEqual(before);
      expect((await pool.query('SELECT id FROM studio_review WHERE "artifactId"=$1', [fixture.intent.artifactId])).rows).toEqual([]);
    } finally { await fixture.cleanup(); }
  });
}
