import { createHash, randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { buildCreatorAssetObjectStorageRuntimeAclSql, buildMembershipRuntimeAclSql } from "../../../../../scripts/run-production-database-migrations.mjs";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";

import type {
  DrizzleStudioWorkAssetRepository,
  StudioWorkAssetWrite,
} from "./studio-work-asset.repository";
import type * as DatabaseRuntime from "../../platform/database";
import type { deleteWork as DeleteCreatorWork } from "../../server/creator";

const INTEGRATION_URL =
  process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !INTEGRATION_URL) {
  throw new Error(
    "CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL; Studio work asset batch rollback cannot be skipped",
  );
}
const describeWithDirectPostgres = INTEGRATION_URL ? describe : describe.skip;

interface PostgresConstraintError {
  readonly code?: string;
  readonly constraint?: string;
}

function findPostgresConstraintError(
  error: unknown,
): PostgresConstraintError | undefined {
  const visited = new Set<object>();
  let current = error;
  while (typeof current === "object" && current !== null) {
    if (visited.has(current)) return undefined;
    visited.add(current);
    const candidate = current as PostgresConstraintError & {
      readonly cause?: unknown;
    };
    if (candidate.code === "23514" && candidate.constraint) {
      return candidate;
    }
    current = candidate.cause;
  }
  return undefined;
}

function imageWrite(
  workId: string,
  assetId: string,
  fill: number,
): StudioWorkAssetWrite {
  const payload = Uint8Array.of(fill);
  const sha256 = createHash("sha256").update(payload).digest("hex");
  return {
    workId,
    assetId,
    elementType: "image",
    mimeType: "image/png",
    descriptor: {
      version: 1,
      element: {
        id: assetId,
        type: "image",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
    },
    payload,
    sha256,
    intrinsicImage: {
      width: 1,
      height: 1,
      decodedRgbaBytes: 4,
    },
    storageObject: {
      contractVersion: "toonspectrum.private-object-storage.v2",
      providerId: "cloudflare-r2",
      purpose: "source",
      digest: `sha256:${sha256}`,
      objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}`,
      byteLength: payload.byteLength,
      contentType: "image/png",
    },
  };
}

function generatedObject(
  purpose: "derived" | "export",
  bytes: Uint8Array,
) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    contractVersion: "toonspectrum.private-object-storage.v2" as const,
    providerId: "supabase" as const,
    purpose,
    digest: `sha256:${sha256}` as const,
    objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}` as const,
    byteLength: bytes.byteLength,
    contentType: "image/png" as const,
  };
}

describeWithDirectPostgres(
  "Studio work asset PostgreSQL batch transaction",
  () => {
    const userIds: string[] = [];
    let observerPool: Pool | undefined;
    let databaseRuntime: typeof DatabaseRuntime | undefined;
    let repository: DrizzleStudioWorkAssetRepository;
    let deleteCreatorWork: typeof DeleteCreatorWork;
    let previousDatabaseUrl: string | undefined;

    beforeAll(async () => {
      if (!INTEGRATION_URL) {
        throw new Error("integration URL was not provided");
      }
      validatePostgresIntegrationUrl(INTEGRATION_URL);
      previousDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = INTEGRATION_URL;
      observerPool = new Pool({
        application_name: "toonstudio-studio-work-asset-batch-test",
        connectionString: INTEGRATION_URL,
        max: 2,
      });
      databaseRuntime = await import("../../platform/database");
      ({ deleteWork: deleteCreatorWork } = await import(
        "../../server/creator"
      ));
      const repositoryRuntime = await import("./studio-work-asset.repository");
      repository = new repositoryRuntime.DrizzleStudioWorkAssetRepository();
    });

    async function cleanupTrackedUsers(): Promise<void> {
      const ids = userIds.splice(0);
      if (ids.length === 0 || !observerPool) return;
      await observerPool.query(
        'DELETE FROM "user" WHERE "id" = ANY($1::text[])',
        [ids],
      );
    }

    afterEach(cleanupTrackedUsers);

    afterAll(async () => {
      await cleanupTrackedUsers();
      await Promise.all([
        observerPool?.end(),
        databaseRuntime?.dbPool.end(),
      ]);
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    });

    it("rolls back the valid first row when the second row violates a DB constraint", async () => {
      if (!observerPool) {
        throw new Error("PostgreSQL observer pool was not initialized");
      }
      const userId = randomUUID();
      const workId = randomUUID();
      const backgroundAssetId = `layer-background-${randomUUID()}`;
      const foregroundAssetId = `layer-foreground-${randomUUID()}`;
      await observerPool.query(
        'INSERT INTO "user" ("id", "name") VALUES ($1, $2)',
        [userId, "Studio work asset batch rollback integration"],
      );
      userIds.push(userId);
      await observerPool.query(
        `INSERT INTO "creator_work" ("id", "userId", "title")
         VALUES ($1, $2, $3)`,
        [workId, userId, "Layer-lift batch rollback"],
      );

      let rejection: unknown;
      try {
        await repository.upsertBatch(userId, [
          imageWrite(workId, backgroundAssetId, 1),
          {
            ...imageWrite(workId, foregroundAssetId, 2),
            intrinsicImage: {
              width: 1,
              height: 1,
              decodedRgbaBytes: 3,
            },
          },
        ]);
      } catch (error) {
        rejection = error;
      }

      expect(findPostgresConstraintError(rejection)).toMatchObject({
        code: "23514",
        constraint: "creator_work_asset_intrinsic_image_check",
      });
      const stored = await observerPool.query<{ assetId: string }>(
        `SELECT "assetId"
         FROM "creator_work_asset"
         WHERE "workId" = $1
           AND "assetId" = ANY($2::text[])
         ORDER BY "assetId"`,
        [workId, [backgroundAssetId, foregroundAssetId]],
      );
      expect(stored.rows).toEqual([]);
    });

    it("비소유 runtime은 정본 허용 열로 source·derived를 저장하고 서버 기본 열의 명시 INSERT는 거절한다", async () => {
      if (!observerPool || !databaseRuntime) throw new Error("PostgreSQL 저장소가 준비되지 않았습니다.");
      const owner = observerPool, runtime = databaseRuntime, role = `work_asset_test_${randomUUID().replaceAll("-", "")}`;
      const relations = ["creator_asset_storage_object", "creator_work_asset_storage_reference", "creator_work_publication_media"];
      const aclSnapshot = async () => (await owner.query(`SELECT r.relname,r.relowner::text AS owner,
        COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.grantee,a.privilege_type,a.is_grantable)
          FROM aclexplode(COALESCE(r.relacl,acldefault('r',r.relowner))) a),'[]'::jsonb) AS acl
        FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
        WHERE n.nspname='public' AND r.relname=ANY($1::text[]) ORDER BY r.relname`, [relations])).rows;
      const beforeAcl = await aclSnapshot(), userId = randomUUID(), workId = randomUUID(), assetId = randomUUID();
      const payload = new TextEncoder().encode(randomUUID()), sha256 = createHash("sha256").update(payload).digest("hex");
      const base = imageWrite(workId, assetId, 1), source: StudioWorkAssetWrite = { ...base, payload, sha256,
        storageObject: { ...base.storageObject, digest: `sha256:${sha256}`, objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}`, byteLength: payload.byteLength } };
      const derived = { workId, sourceAssetId: assetId, referenceId: randomUUID(), object: generatedObject("derived", new TextEncoder().encode(randomUUID())) };
      const digests = [source.storageObject.digest, derived.object.digest];
      expect((await owner.query('SELECT digest FROM creator_asset_storage_object WHERE digest=ANY($1::text[])', [digests])).rows).toEqual([]);
      await owner.query(`CREATE ROLE "${role}" NOLOGIN`);
      let restoreTransaction: (() => void) | undefined;
      try {
        await owner.query(`GRANT USAGE ON SCHEMA public TO "${role}";
          GRANT SELECT ON TABLE public."user",public.creator_work,public.creator_draft_collaboration_room,
            public.creator_work_scoped_write_policy,public.creator_work_asset,public.creator_work_asset_tombstone,
            public.creator_work_raster_asset TO "${role}";
          GRANT UPDATE (name) ON TABLE public."user" TO "${role}";
          GRANT UPDATE ("updatedAt") ON TABLE public.creator_work,public.creator_draft_collaboration_room TO "${role}";
          GRANT INSERT ON TABLE public.creator_work_asset TO "${role}";`);
        await owner.query(buildMembershipRuntimeAclSql(role));
        await owner.query(buildCreatorAssetObjectStorageRuntimeAclSql(role));
        const privileges = await owner.query(`SELECT r.relname,
          pg_has_role($1,r.relowner,'USAGE') AS owns,
          has_table_privilege($1,r.oid,'INSERT') AS unrestricted,
          has_column_privilege($1,r.oid,'createdAt','INSERT') AS managed
          FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
          WHERE n.nspname='public' AND r.relname=ANY($2::text[]) ORDER BY r.relname`, [role, relations]);
        expect(privileges.rows).toHaveLength(3);
        for (const row of privileges.rows) expect(row).toMatchObject({ owns: false, unrestricted: false, managed: false });
        await owner.query('INSERT INTO "user" (id,name) VALUES ($1,$2)', [userId, "실제 비소유 원고 에셋 회귀"]);
        userIds.push(userId);
        await owner.query('INSERT INTO creator_work (id,"userId",title) VALUES ($1,$2,$3)', [workId, userId, "runtime 열 권한 보존"]);
        const originalTransaction = runtime.db.transaction.bind(runtime.db);
        const asRuntime: typeof runtime.db.transaction = (action, config) => originalTransaction(async (transaction) => {
          await transaction.execute(sql.raw(`SET LOCAL ROLE "${role}"`));
          expect((await transaction.execute(sql`SELECT current_user`)).rows[0]?.current_user).toBe(role);
          return action(transaction);
        }, config);
        const transactionSpy = vi.spyOn(runtime.db, "transaction").mockImplementation(asRuntime);
        restoreTransaction = () => transactionSpy.mockRestore();
        // 기존 ORM 호출이 생략 열의 DEFAULT까지 나열해 거절되는 조건을 같은 role로 재현한다.
        await expect(runtime.db.transaction((transaction) => transaction.insert(runtime.creatorAssetStorageObjects).values({
          purpose: source.storageObject.purpose, digest: source.storageObject.digest, contractVersion: source.storageObject.contractVersion,
          providerId: source.storageObject.providerId, objectPath: source.storageObject.objectPath, byteLength: source.storageObject.byteLength,
          contentType: source.storageObject.contentType,
        }).onConflictDoNothing())).rejects.toMatchObject({ cause: { code: "42501" } });
        await expect(repository.upsert(userId, source)).resolves.toMatchObject({ assetId, sha256 });
        await expect(repository.registerGeneratedStorageReference(userId, derived, false)).resolves.toMatchObject(derived);
        const storedRows = async () => ({
          objects: (await owner.query('SELECT * FROM creator_asset_storage_object WHERE digest=ANY($1::text[]) ORDER BY purpose,digest', [digests])).rows,
          references: (await owner.query('SELECT * FROM creator_work_asset_storage_reference WHERE "workId"=$1 ORDER BY purpose,"referenceId"', [workId])).rows,
        });
        const stored = await storedRows();
        expect(stored.objects).toHaveLength(2); expect(stored.references).toHaveLength(2);
        await expect(repository.upsert(userId, source)).resolves.toMatchObject({ assetId, sha256 });
        await expect(repository.registerGeneratedStorageReference(userId, derived, false)).resolves.toMatchObject(derived);
        const client = await owner.connect();
        try {
          for (const relation of relations.slice(0, 2)) {
            await client.query("BEGIN"); await client.query(`SET LOCAL ROLE "${role}"`);
            // DEFAULT도 명시 열이면 INSERT 권한이 필요하므로 기존 Drizzle 회귀를 실제 PostgreSQL로 잡는다.
            await expect(client.query(`INSERT INTO public."${relation}" ("createdAt") VALUES (DEFAULT)`)).rejects.toMatchObject({ code: "42501" });
            await client.query("ROLLBACK");
          }
        } finally { await client.query("ROLLBACK"); client.release(); }
        expect(await storedRows()).toEqual(stored);
      } finally {
        restoreTransaction?.();
        await cleanupTrackedUsers();
        await owner.query('DELETE FROM creator_asset_storage_object WHERE digest=ANY($1::text[])', [digests]);
        await owner.query(`DROP OWNED BY "${role}"`); await owner.query(`DROP ROLE "${role}"`);
      }
      expect(await aclSnapshot()).toEqual(beforeAcl);
      expect((await owner.query('SELECT id FROM "user" WHERE id=$1', [userId])).rows).toEqual([]);
      expect((await owner.query('SELECT id FROM creator_work WHERE id=$1', [workId])).rows).toEqual([]);
      expect((await owner.query('SELECT digest FROM creator_asset_storage_object WHERE digest=ANY($1::text[])', [digests])).rows).toEqual([]);
      expect((await owner.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [role])).rows).toEqual([]);
    });

    it("keeps source immutable and drives shared generated references through a durable delete state", async () => {
      if (!observerPool) {
        throw new Error("PostgreSQL observer pool was not initialized");
      }
      const userId = randomUUID();
      const workId = randomUUID();
      const sourceAssetId = `source-${randomUUID()}`;
      await observerPool.query(
        'INSERT INTO "user" ("id", "name") VALUES ($1, $2)',
        [userId, "Studio work asset object reference integration"],
      );
      userIds.push(userId);
      await observerPool.query(
        `INSERT INTO "creator_work" ("id", "userId", "title")
         VALUES ($1, $2, $3)`,
        [workId, userId, "Object reference state machine"],
      );

      const sourceWrite = imageWrite(workId, sourceAssetId, 17);
      await repository.upsert(userId, sourceWrite);
      await expect(repository.getStorageReference(
        userId,
        workId,
        sourceAssetId,
        "source",
        sourceAssetId,
        "image",
      )).resolves.toMatchObject({ object: sourceWrite.storageObject });

      const object = generatedObject("derived", Uint8Array.of(8, 9, 10));
      const firstReference = {
        workId,
        sourceAssetId,
        referenceId: "preview-a",
        object,
      };
      const secondReference = {
        ...firstReference,
        referenceId: "preview-b",
      };
      await repository.registerGeneratedStorageReference(
        userId,
        firstReference,
        true,
      );
      await repository.registerGeneratedStorageReference(
        userId,
        secondReference,
        false,
      );

      await expect(
        deleteCreatorWork(userId, workId, false),
      ).rejects.toThrow(/생성 에셋 정리가 완료된 뒤/u);
      await expect(repository.getStorageReference(
        userId,
        workId,
        sourceAssetId,
        "derived",
        firstReference.referenceId,
      )).resolves.toMatchObject({ referenceId: firstReference.referenceId });

      const sharedDelete = await repository.beginGeneratedStorageReferenceDelete(
        userId,
        {
          workId,
          sourceAssetId,
          purpose: "derived",
          referenceId: firstReference.referenceId,
          expectedDigest: object.digest,
        },
      );
      expect(sharedDelete).toMatchObject({
        deleteToken: null,
        remoteDeleteRequired: false,
      });
      await expect(repository.getStorageReference(
        userId,
        workId,
        sourceAssetId,
        "derived",
        firstReference.referenceId,
      )).rejects.toMatchObject({
        name: "StudioWorkAssetStorageReferenceNotFoundError",
      });

      const lastDelete = await repository.beginGeneratedStorageReferenceDelete(
        userId,
        {
          workId,
          sourceAssetId,
          purpose: "derived",
          referenceId: secondReference.referenceId,
          expectedDigest: object.digest,
        },
      );
      expect(lastDelete.remoteDeleteRequired).toBe(true);
      expect(lastDelete.deleteToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
      await expect(repository.getStorageReference(
        userId,
        workId,
        sourceAssetId,
        "derived",
        secondReference.referenceId,
      )).rejects.toMatchObject({
        name: "StudioWorkAssetStorageReferenceNotFoundError",
      });
      await repository.completeGeneratedStorageReferenceDelete(lastDelete);
      await expect(repository.findReusableStorageObject(object)).resolves.toBeNull();

      await repository.registerGeneratedStorageReference(
        userId,
        firstReference,
        true,
      );
      await expect(repository.deleteUnreferencedUpload(
        userId,
        workId,
        sourceAssetId,
        "image",
        sourceWrite.sha256,
      )).rejects.toMatchObject({ name: "StudioWorkAssetReferencedError" });
      await expect(repository.beginGeneratedStorageReferenceDelete(
        userId,
        {
          workId,
          sourceAssetId,
          purpose: "source" as never,
          referenceId: sourceAssetId,
          expectedDigest: sourceWrite.storageObject.digest,
        },
      )).rejects.toMatchObject({
        name: "StudioWorkAssetStorageReferenceConflictError",
      });

      const [sourceState] = (await observerPool.query<{
        state: string;
        deleteToken: string | null;
      }>(
        `SELECT "state", "deleteToken"
         FROM "creator_asset_storage_object"
         WHERE "purpose" = 'source' AND "digest" = $1`,
        [sourceWrite.storageObject.digest],
      )).rows;
      expect(sourceState).toEqual({ state: "active", deleteToken: null });
    });
  },
);
