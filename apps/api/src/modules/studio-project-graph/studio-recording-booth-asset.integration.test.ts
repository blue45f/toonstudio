import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type * as DatabaseRuntime from "../../platform/database";
import type { StudioRecordingBoothAssetRepository } from "./studio-recording-booth-asset.repository";

const connection = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !connection) throw new Error("CI must provide real PostgreSQL for recording booth asset authority tests");
(connection ? describe : describe.skip)("recording booth assets on PostgreSQL", () => {
  let pool: Pool, database: typeof DatabaseRuntime, repository: StudioRecordingBoothAssetRepository;
  const works: string[] = [], users: string[] = [], previous = process.env.DATABASE_URL;
  beforeAll(async () => {
    process.env.DATABASE_URL = connection; pool = new Pool({ connectionString: connection });
    database = await import("../../platform/database");
    repository = new (await import("./studio-recording-booth-asset.repository")).StudioRecordingBoothAssetRepository();
    const table = await pool.query("SELECT to_regclass('public.studio_recording_booth_asset') AS name");
    expect(table.rows[0]?.name).toBe("studio_recording_booth_asset");
  });
  afterEach(async () => {
    await pool.query('DELETE FROM creator_work WHERE id=ANY($1::text[])', [works]);
    await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
    works.length = 0; users.length = 0;
  });
  afterAll(async () => {
    await Promise.all([pool?.end(), database?.dbPool.end()]);
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
  });
  async function user(name = "Voice actor") { const id = randomUUID(); users.push(id); await pool.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [id, name]); return id; }
  async function member(workId: string, role: "commenter" | "viewer" | "editor" = "commenter") {
    const id = await user(role); await pool.query(`INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","respondedAt") VALUES ($1,$2,$3,'active',$4,now())`, [workId, id, role, randomUUID()]); return id;
  }
  async function fixture() {
    const owner = await user("Owner"), workId = randomUUID(); works.push(workId);
    await pool.query('INSERT INTO creator_work (id,"userId",title) VALUES ($1,$2,$3)', [workId, owner, "Booth fixture"]);
    const commenter = await member(workId), viewer = await member(workId, "viewer"), outsider = await user("Outsider");
    const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]); const sha256 = createHash("sha256").update(bytes).digest("hex");
    const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const, purpose: "derived" as const,
      digest: `sha256:${sha256}`, objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}`, byteLength: bytes.length, contentType: "audio/webm" };
    const input = { operationId: randomUUID(), assetId: randomUUID(), name: "녹음부스 테이크 20261006", boothId: "booth-main", durationMs: 42_000 };
    return { owner, commenter, viewer, outsider, workId, sha256, object, input, file: { contentType: "audio/webm", byteLength: bytes.length, sha256, object } };
  }

  it("persists one durable asset and replays only the identical idempotent request", async () => {
    const f = await fixture();
    const first = await repository.create(f.commenter, f.workId, f.input, f.file);
    expect(first.view.asset).toMatchObject({ id: f.input.assetId, workId: f.workId, name: f.input.name, boothId: "booth-main" });
    expect(first.view.asset.deletedAt).toBeNull();
    expect((await repository.create(f.commenter, f.workId, f.input, f.file))).toEqual({ ...first, replayed: true });
    await expect(repository.create(f.commenter, f.workId, { ...f.input, name: "Changed" }, f.file)).rejects.toMatchObject({ code: "idempotency" });
    await expect(repository.create(f.owner, f.workId, { ...f.input, operationId: randomUUID() }, f.file)).rejects.toMatchObject({ code: "conflict" });
    expect((await repository.list(f.viewer, f.workId)).items).toHaveLength(1);
  });

  it("requires comment authority to save and current view authority to read", async () => {
    const f = await fixture();
    await expect(repository.create(f.viewer, f.workId, f.input, f.file)).rejects.toMatchObject({ code: "forbidden" });
    await expect(repository.list(f.outsider, f.workId)).rejects.toMatchObject({ code: "forbidden" });
    await repository.create(f.commenter, f.workId, f.input, f.file);
    await pool.query('DELETE FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [f.workId, f.commenter]);
    await expect(repository.read(f.commenter, f.workId, f.input.assetId)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("keeps delete explicit, replayable, and reference-counted for shared objects", async () => {
    const f = await fixture(); await repository.create(f.commenter, f.workId, f.input, f.file);
    const second = { ...f.input, operationId: randomUUID(), assetId: randomUUID(), name: "Second take" };
    await repository.create(f.owner, f.workId, second, f.file);
    await expect(repository.delete(f.commenter, f.workId, f.input.assetId, { operationId: randomUUID(), expectedSha256: "c".repeat(64) }))
      .rejects.toMatchObject({ code: "conflict" });
    const deleteOperation = randomUUID();
    const removed = await repository.delete(f.commenter, f.workId, f.input.assetId, { operationId: deleteOperation, expectedSha256: f.sha256 });
    expect(removed.deleteObject).toBe(false);
    const replayed = await repository.delete(f.commenter, f.workId, f.input.assetId, { operationId: deleteOperation, expectedSha256: f.sha256 });
    expect(replayed.replayed).toBe(true);
    await expect(repository.read(f.owner, f.workId, f.input.assetId)).rejects.toMatchObject({ code: "not-found" });
    expect((await repository.list(f.owner, f.workId)).items).toHaveLength(1);
    const final = await repository.delete(f.owner, f.workId, second.assetId, { operationId: randomUUID(), expectedSha256: f.sha256 });
    expect(final.deleteObject).toBe(true);
  });
});
