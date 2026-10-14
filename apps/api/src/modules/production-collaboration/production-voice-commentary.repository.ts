import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import {
  LocatedPrivateObjectReferenceSchema,
  type LocatedPrivateObjectReference,
} from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import { dbPool } from "../../platform/database";
import { resolveCreatorCollaborationAccess } from "../creator/creator-collaboration.policy";
import {
  productionVoiceCommentaryCreateSchema,
  productionVoiceCommentaryDeleteSchema,
  productionVoiceCommentaryTrackMetaSchema,
  type ProductionVoiceCommentaryCreate,
  type ProductionVoiceCommentaryDelete,
  type ProductionVoiceCommentaryTrackMeta,
} from "./production-voice-commentary.dto";

export class ProductionVoiceCommentaryRepositoryError extends Error {
  constructor(readonly code: "forbidden" | "not-found" | "invalid-source" | "idempotency" | "conflict" | "unavailable") {
    super(`production_voice_commentary_${code}`);
  }
}
const fail = (code: ProductionVoiceCommentaryRepositoryError["code"]): never => {
  throw new ProductionVoiceCommentaryRepositoryError(code);
};

type Authority = { view: boolean; comment: boolean; edit: boolean; manageMembers: boolean };
type ProjectContext = { workId: string; aggregate: unknown };
type StoredRow = {
  id: string;
  projectId: string;
  episodeId: string;
  authorUserId: string;
  track: unknown;
  durationMs: number;
  contentType: string;
  byteLength: number;
  sha256: string;
  objectReference: unknown;
  requestHash: string;
  operationId: string;
  createdAt: Date;
  expiresAt: Date;
  deletedAt: Date | null;
  deleteOperationId: string | null;
};

export interface ProductionVoiceCommentaryRecord {
  readonly meta: ProductionVoiceCommentaryTrackMeta;
  readonly canDelete: boolean;
  readonly contentType: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly object: LocatedPrivateObjectReference;
  readonly deletedAt: string | null;
}

async function transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try { await client.query("BEGIN"); const result = await action(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

/**
 * 제작 프로젝트 → 연결 작품 → 소유자/협업자 순으로 권한을 도출한다.
 * 검수 음성 노트의 access()와 같은 규칙(활성 사용자 + 작품 협업 권한)에
 * 제작 프로젝트 경유만 더한 것이다. 프로젝트 행 자체는 이 기능이 바꾸지
 * 않으므로 FOR SHARE로 읽는다.
 */
async function access(client: PoolClient, actor: string, projectId: string): Promise<{ authority: Authority; project: ProjectContext }> {
  const project = (await client.query<{ workId: string; aggregate: unknown }>(
    'SELECT "workId",aggregate FROM production_project WHERE id=$1 FOR SHARE', [projectId],
  )).rows[0];
  if (!project) return fail("not-found");
  const user = (await client.query<{ status: string }>('SELECT status FROM "user" WHERE id=$1 FOR SHARE', [actor])).rows[0];
  if (user?.status !== "active") return fail("forbidden");
  const work = (await client.query<{ userId: string }>('SELECT "userId" FROM creator_work WHERE id=$1 FOR SHARE', [project.workId])).rows[0];
  if (!work) return fail("forbidden");
  const membership = (await client.query<{ userId: string; role: string; status: string }>(
    'SELECT "userId",role,status FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2 FOR SHARE', [project.workId, actor],
  )).rows[0];
  const authority = resolveCreatorCollaborationAccess({ actorUserId: actor, ownerUserId: work.userId, membership });
  if (!authority.view) return fail("forbidden");
  return { authority, project };
}

/** 회차는 프로젝트 집계가 소유한 식별자다. 집계에 없는 회차는 출처 불명으로 거부한다. */
function assertEpisode(project: ProjectContext, episodeId: string): void {
  const aggregate = project.aggregate as { episodes?: unknown } | null;
  const episodes = Array.isArray(aggregate?.episodes) ? aggregate.episodes : [];
  const found = episodes.some((entry) => !!entry && typeof entry === "object"
    && (entry as { episodeId?: unknown }).episodeId === episodeId);
  if (!found) return fail("invalid-source");
}

function recordFrom(row: StoredRow, actor: string, authority: Authority): ProductionVoiceCommentaryRecord {
  return {
    meta: productionVoiceCommentaryTrackMetaSchema.parse(row.track),
    canDelete: row.authorUserId === actor || authority.manageMembers,
    contentType: row.contentType,
    byteLength: Number(row.byteLength),
    sha256: row.sha256,
    object: LocatedPrivateObjectReferenceSchema.parse(row.objectReference),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

async function load(client: PoolClient, projectId: string, episodeId: string, trackId: string, lock = false): Promise<StoredRow> {
  const row = (await client.query<StoredRow>(`SELECT id,"projectId","episodeId","authorUserId",track,"durationMs","contentType","byteLength",sha256,
    "objectReference","requestHash","operationId","createdAt","expiresAt","deletedAt","deleteOperationId"
    FROM production_episode_voice_commentary WHERE id=$1 AND "projectId"=$2 AND "episodeId"=$3${lock ? " FOR UPDATE" : ""}`,
  [trackId, projectId, episodeId])).rows[0];
  if (!row) return fail("not-found");
  return row;
}

async function activeReferenceCount(client: PoolClient, object: LocatedPrivateObjectReference): Promise<number> {
  const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM production_episode_voice_commentary
    WHERE "deletedAt" IS NULL AND "expiresAt">statement_timestamp() AND "objectReference"->>'providerId'=$1
      AND "objectReference"->>'purpose'=$2 AND "objectReference"->>'digest'=$3 AND "objectReference"->>'objectPath'=$4`,
  [object.providerId, object.purpose, object.digest, object.objectPath]);
  return result.rows[0]?.count ?? 0;
}

/** 키 순서를 고정해 해시하는 멱등 요청 지문 — 음성 노트의 requestHash와 같은 역할. */
function stableRequestHash(value: unknown): string {
  const text = JSON.stringify(value, (_key, entry: unknown) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.fromEntries(Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return entry;
  });
  return createHash("sha256").update(text).digest("hex");
}

@Injectable()
export class ProductionVoiceCommentaryRepository {
  authorizeCreate(actor: string, projectId: string, episodeId: string, rawTrack: ProductionVoiceCommentaryTrackMeta): Promise<void> {
    const track = productionVoiceCommentaryTrackMetaSchema.parse(rawTrack);
    return transaction(async (client) => {
      const { authority, project } = await access(client, actor, projectId);
      if (!authority.comment) return fail("forbidden");
      assertEpisode(project, episodeId);
      if (track.episodeId !== episodeId) return fail("invalid-source");
    });
  }

  create(actor: string, projectId: string, episodeId: string, raw: ProductionVoiceCommentaryCreate, file: {
    contentType: string; byteLength: number; sha256: string; object: LocatedPrivateObjectReference;
  }): Promise<{ record: ProductionVoiceCommentaryRecord; replayed: boolean }> {
    const input = productionVoiceCommentaryCreateSchema.parse(raw);
    const object = LocatedPrivateObjectReferenceSchema.parse(file.object);
    const requestHash = stableRequestHash({
      projectId, episodeId, track: input.track, retentionDays: input.retentionDays,
      contentType: file.contentType, byteLength: file.byteLength, sha256: file.sha256, object,
    });
    return transaction(async (client) => {
      const { authority, project } = await access(client, actor, projectId);
      if (!authority.comment) return fail("forbidden");
      assertEpisode(project, episodeId);
      if (input.track.episodeId !== episodeId) return fail("invalid-source");
      const prior = (await client.query<StoredRow>(`SELECT id,"projectId","episodeId","authorUserId",track,"durationMs","contentType","byteLength",sha256,
        "objectReference","requestHash","operationId","createdAt","expiresAt","deletedAt","deleteOperationId"
        FROM production_episode_voice_commentary WHERE "authorUserId"=$1 AND "operationId"=$2 FOR UPDATE`, [actor, input.operationId])).rows[0];
      if (prior) {
        if (prior.requestHash !== requestHash) return fail("idempotency");
        return { record: recordFrom(prior, actor, authority), replayed: true };
      }
      const conflicting = (await client.query<{ id: string }>(
        "SELECT id FROM production_episode_voice_commentary WHERE id=$1 FOR UPDATE", [input.track.id],
      )).rows[0];
      if (conflicting) return fail("conflict");
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + input.retentionDays * 86_400_000);
      await client.query(`INSERT INTO production_episode_voice_commentary (id,"projectId","episodeId","authorUserId",track,
        "durationMs","contentType","byteLength",sha256,"objectReference","requestHash","operationId","createdAt","expiresAt")
        VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14)`, [
        input.track.id, projectId, episodeId, actor, JSON.stringify(input.track),
        input.track.durationMs, file.contentType, file.byteLength, file.sha256, JSON.stringify(object),
        requestHash, input.operationId, createdAt, expiresAt,
      ]);
      return { record: recordFrom(await load(client, projectId, episodeId, input.track.id), actor, authority), replayed: false };
    });
  }

  list(actor: string, projectId: string, episodeId: string): Promise<{ items: ProductionVoiceCommentaryRecord[] }> {
    return transaction(async (client) => {
      const { authority, project } = await access(client, actor, projectId);
      assertEpisode(project, episodeId);
      const rows = (await client.query<StoredRow>(`SELECT id,"projectId","episodeId","authorUserId",track,"durationMs","contentType","byteLength",sha256,
        "objectReference","requestHash","operationId","createdAt","expiresAt","deletedAt","deleteOperationId"
        FROM production_episode_voice_commentary WHERE "projectId"=$1 AND "episodeId"=$2
          AND "deletedAt" IS NULL AND "expiresAt">statement_timestamp() ORDER BY "createdAt" DESC LIMIT 100`,
      [projectId, episodeId])).rows;
      return { items: rows.map((row) => recordFrom(row, actor, authority)) };
    });
  }

  read(actor: string, projectId: string, episodeId: string, trackId: string): Promise<{ record: ProductionVoiceCommentaryRecord }> {
    return transaction(async (client) => {
      const { authority } = await access(client, actor, projectId);
      const row = await load(client, projectId, episodeId, trackId);
      if (row.deletedAt || row.expiresAt.getTime() <= Date.now()) return fail("not-found");
      return { record: recordFrom(row, actor, authority) };
    });
  }

  delete(actor: string, projectId: string, episodeId: string, trackId: string, raw: ProductionVoiceCommentaryDelete): Promise<{
    record: ProductionVoiceCommentaryRecord; deleteObject: boolean; replayed: boolean;
  }> {
    const input = productionVoiceCommentaryDeleteSchema.parse(raw);
    return transaction(async (client) => {
      const { authority } = await access(client, actor, projectId);
      const row = await load(client, projectId, episodeId, trackId, true);
      if (row.authorUserId !== actor && !authority.manageMembers) return fail("forbidden");
      if (row.sha256 !== input.expectedSha256) return fail("conflict");
      const object = LocatedPrivateObjectReferenceSchema.parse(row.objectReference);
      if (row.deletedAt) {
        if (row.deleteOperationId !== input.operationId) return fail("conflict");
        return { record: recordFrom(row, actor, authority), deleteObject: (await activeReferenceCount(client, object)) === 0, replayed: true };
      }
      await client.query(`UPDATE production_episode_voice_commentary SET "deletedAt"=statement_timestamp(),"deleteOperationId"=$4
        WHERE id=$1 AND "projectId"=$2 AND "episodeId"=$3`, [trackId, projectId, episodeId, input.operationId]);
      const updated = await load(client, projectId, episodeId, trackId);
      return {
        record: recordFrom(updated, actor, authority),
        deleteObject: (await activeReferenceCount(client, object)) === 0,
        replayed: false,
      };
    });
  }

  claimExpired(limit = 20): Promise<readonly { object: LocatedPrivateObjectReference; deleteObject: boolean }[]> {
    return transaction(async (client) => {
      const rows = (await client.query<StoredRow>(`SELECT id,"projectId","episodeId","authorUserId",track,"durationMs","contentType","byteLength",sha256,
        "objectReference","requestHash","operationId","createdAt","expiresAt","deletedAt","deleteOperationId"
        FROM production_episode_voice_commentary WHERE "deletedAt" IS NULL AND "expiresAt"<=statement_timestamp()
        ORDER BY "expiresAt" ASC FOR UPDATE SKIP LOCKED LIMIT $1`, [Math.max(1, Math.min(100, limit))])).rows;
      const result: { object: LocatedPrivateObjectReference; deleteObject: boolean }[] = [];
      for (const row of rows) {
        await client.query(`UPDATE production_episode_voice_commentary SET "deletedAt"=statement_timestamp(),"deleteOperationId"=$2 WHERE id=$1`,
          [row.id, `retention:${row.id}`]);
        const object = LocatedPrivateObjectReferenceSchema.parse(row.objectReference);
        result.push({ object, deleteObject: (await activeReferenceCount(client, object)) === 0 });
      }
      return result;
    });
  }

  async objectReferenced(objectValue: LocatedPrivateObjectReference): Promise<boolean> {
    const object = LocatedPrivateObjectReferenceSchema.parse(objectValue);
    return transaction(async (client) => (await activeReferenceCount(client, object)) > 0);
  }
}
