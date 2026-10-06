import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import {
  studioRecordingBoothAssetCreateSchema,
  studioRecordingBoothAssetDeleteSchema,
  studioRecordingBoothAssetSchema,
  type StudioRecordingBoothAsset,
  type StudioRecordingBoothAssetCreate,
  type StudioRecordingBoothAssetDelete,
  type StudioRecordingBoothAssetView,
} from "@toonstudio/studio-project-model/recording-booth-asset";
import {
  LocatedPrivateObjectReferenceSchema,
  type LocatedPrivateObjectReference,
} from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import { dbPool } from "../../platform/database";
import { resolveCreatorCollaborationAccess } from "../creator/creator-collaboration.policy";
import { shareHash } from "./pinned-share/pinned-share-storage";

export class StudioRecordingBoothAssetRepositoryError extends Error {
  constructor(readonly code: "forbidden" | "not-found" | "idempotency" | "conflict" | "unavailable") {
    super(`studio_recording_booth_asset_${code}`);
  }
}
const fail = (code: StudioRecordingBoothAssetRepositoryError["code"]): never => { throw new StudioRecordingBoothAssetRepositoryError(code); };

type Authority = { view: boolean; comment: boolean; edit: boolean; manageMembers: boolean };
type StoredRow = {
  id: string;
  workId: string;
  authorUserId: string;
  name: string;
  boothId: string;
  durationMs: number;
  contentType: string;
  byteLength: number;
  sha256: string;
  objectReference: unknown;
  requestHash: string;
  operationId: string;
  createdAt: Date;
  deletedAt: Date | null;
  deleteOperationId: string | null;
};

const COLUMNS = `id,"workId","authorUserId",name,"boothId","durationMs","contentType","byteLength",sha256,
  "objectReference","requestHash","operationId","createdAt","deletedAt","deleteOperationId"`;

async function transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try { await client.query("BEGIN"); const result = await action(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

async function access(client: PoolClient, actor: string, workId: string, write = false): Promise<Authority> {
  const work = (await client.query<{ userId: string }>(`SELECT "userId" FROM creator_work WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [workId])).rows[0];
  const user = (await client.query<{ status: string }>('SELECT status FROM "user" WHERE id=$1 FOR SHARE', [actor])).rows[0];
  if (!work || user?.status !== "active") return fail("forbidden");
  const membership = (await client.query<{ userId: string; role: string; status: string }>(
    'SELECT "userId",role,status FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2 FOR SHARE', [workId, actor],
  )).rows[0];
  const authority = resolveCreatorCollaborationAccess({ actorUserId: actor, ownerUserId: work.userId, membership });
  if (!authority.view) return fail("forbidden");
  return authority;
}

function assetFrom(row: StoredRow): StudioRecordingBoothAsset {
  return studioRecordingBoothAssetSchema.parse({
    contract: "studio-recording-booth-asset-v1",
    id: row.id,
    workId: row.workId,
    authorUserId: row.authorUserId,
    name: row.name,
    boothId: row.boothId,
    durationMs: row.durationMs,
    contentType: row.contentType,
    byteLength: Number(row.byteLength),
    sha256: row.sha256,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  });
}
function view(row: StoredRow, actor: string, authority: Authority): StudioRecordingBoothAssetView {
  return { asset: assetFrom(row), canDelete: row.authorUserId === actor || authority.manageMembers };
}
function objectFrom(row: StoredRow): LocatedPrivateObjectReference {
  return LocatedPrivateObjectReferenceSchema.parse(row.objectReference);
}
async function load(client: PoolClient, workId: string, assetId: string, lock = false): Promise<StoredRow> {
  const row = (await client.query<StoredRow>(`SELECT ${COLUMNS}
    FROM studio_recording_booth_asset WHERE id=$1 AND "workId"=$2${lock ? " FOR UPDATE" : ""}`, [assetId, workId])).rows[0];
  if (!row) return fail("not-found");
  return row;
}
async function activeReferenceCount(client: PoolClient, object: LocatedPrivateObjectReference): Promise<number> {
  const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM studio_recording_booth_asset
    WHERE "deletedAt" IS NULL AND "objectReference"->>'providerId'=$1
      AND "objectReference"->>'purpose'=$2 AND "objectReference"->>'digest'=$3 AND "objectReference"->>'objectPath'=$4`,
  [object.providerId, object.purpose, object.digest, object.objectPath]);
  return result.rows[0]?.count ?? 0;
}

@Injectable()
export class StudioRecordingBoothAssetRepository {
  authorizeCreate(actor: string, workId: string): Promise<void> {
    return transaction(async (client) => {
      const authority = await access(client, actor, workId);
      if (!authority.comment) return fail("forbidden");
    });
  }

  create(actor: string, workId: string, raw: StudioRecordingBoothAssetCreate, file: {
    contentType: string; byteLength: number; sha256: string; object: LocatedPrivateObjectReference;
  }): Promise<{ view: StudioRecordingBoothAssetView; replayed: boolean }> {
    const input = studioRecordingBoothAssetCreateSchema.parse(raw);
    const object = LocatedPrivateObjectReferenceSchema.parse(file.object);
    const requestHash = shareHash({ workId, input, contentType: file.contentType, byteLength: file.byteLength, sha256: file.sha256, object });
    return transaction(async (client) => {
      const authority = await access(client, actor, workId, true);
      if (!authority.comment) return fail("forbidden");
      const prior = (await client.query<StoredRow>(`SELECT ${COLUMNS}
        FROM studio_recording_booth_asset WHERE "authorUserId"=$1 AND "operationId"=$2 FOR UPDATE`, [actor, input.operationId])).rows[0];
      if (prior) {
        if (prior.requestHash !== requestHash) return fail("idempotency");
        return { view: view(prior, actor, authority), replayed: true };
      }
      const conflicting = (await client.query<{ id: string }>('SELECT id FROM studio_recording_booth_asset WHERE id=$1 FOR UPDATE', [input.assetId])).rows[0];
      if (conflicting) return fail("conflict");
      const createdAt = new Date();
      await client.query(`INSERT INTO studio_recording_booth_asset (id,"workId","authorUserId",name,"boothId",
        "durationMs","contentType","byteLength",sha256,"objectReference","requestHash","operationId","createdAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`, [
        input.assetId, workId, actor, input.name, input.boothId,
        input.durationMs, file.contentType, file.byteLength, file.sha256, JSON.stringify(object), requestHash, input.operationId, createdAt,
      ]);
      return { view: view(await load(client, workId, input.assetId), actor, authority), replayed: false };
    });
  }

  list(actor: string, workId: string): Promise<{ items: StudioRecordingBoothAssetView[] }> {
    return transaction(async (client) => {
      const authority = await access(client, actor, workId);
      const rows = (await client.query<StoredRow>(`SELECT ${COLUMNS}
        FROM studio_recording_booth_asset WHERE "workId"=$1
          AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 100`,
      [workId])).rows;
      return { items: rows.map((row) => view(row, actor, authority)) };
    });
  }

  read(actor: string, workId: string, assetId: string): Promise<{ view: StudioRecordingBoothAssetView; object: LocatedPrivateObjectReference }> {
    return transaction(async (client) => {
      const authority = await access(client, actor, workId);
      const row = await load(client, workId, assetId);
      if (row.deletedAt) return fail("not-found");
      return { view: view(row, actor, authority), object: objectFrom(row) };
    });
  }

  delete(actor: string, workId: string, assetId: string, raw: StudioRecordingBoothAssetDelete): Promise<{
    view: StudioRecordingBoothAssetView; object: LocatedPrivateObjectReference; deleteObject: boolean; replayed: boolean;
  }> {
    const input = studioRecordingBoothAssetDeleteSchema.parse(raw);
    return transaction(async (client) => {
      const authority = await access(client, actor, workId, true);
      const row = await load(client, workId, assetId, true);
      if (row.authorUserId !== actor && !authority.manageMembers) return fail("forbidden");
      if (row.sha256 !== input.expectedSha256) return fail("conflict");
      const object = objectFrom(row);
      if (row.deletedAt) {
        if (row.deleteOperationId !== input.operationId) return fail("conflict");
        return { view: view(row, actor, authority), object, deleteObject: (await activeReferenceCount(client, object)) === 0, replayed: true };
      }
      await client.query(`UPDATE studio_recording_booth_asset SET "deletedAt"=statement_timestamp(),"deleteOperationId"=$3
        WHERE id=$1 AND "workId"=$2`, [assetId, workId, input.operationId]);
      const updated = await load(client, workId, assetId);
      return { view: view(updated, actor, authority), object, deleteObject: (await activeReferenceCount(client, object)) === 0, replayed: false };
    });
  }

  async objectReferenced(objectValue: LocatedPrivateObjectReference): Promise<boolean> {
    const object = LocatedPrivateObjectReferenceSchema.parse(objectValue);
    return transaction(async (client) => (await activeReferenceCount(client, object)) > 0);
  }
}
