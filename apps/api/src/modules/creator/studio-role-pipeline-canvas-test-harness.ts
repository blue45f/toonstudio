import "reflect-metadata";
import type { INestApplication, LoggerService } from "@nestjs/common";
import type { AddressInfo } from "node:net";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { Pool } from "pg";
import { vi } from "vitest";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";

// 실제 AppModule의 인증·권한·Socket.IO·DB를 사용한다. 외부 메일과 저장소만 로컬 시험 port다.
export async function createCanvasHarness(connectionString: string, workIds: string[], browserOrigin: string, validatePostgresIntegrationUrl: (value: string) => unknown) {
  validatePostgresIntegrationUrl(connectionString);
  if (new URL(connectionString).hostname !== "127.0.0.1") throw new Error("캔버스 검증 DB는 loopback 시험 환경이어야 합니다.");
  vi.stubEnv("AUTH_RATE_LIMIT_MODE", "single-instance-local");
  vi.stubEnv("API_CORS_ALLOWED_ORIGINS", browserOrigin);
  vi.stubEnv("STUDIO_LIVE_CLUSTER_ADAPTER", "memory");
  vi.stubEnv("TRAFFIC_ANALYTICS_STORE", "postgres");
  vi.stubEnv("COVER_IMAGE_POLICY", "off");
  const originalFetch = globalThis.fetch, outbox = new Map<string, string>(), stored = new Map<string, Buffer>();
  let app: INestApplication | null = null, pool: Pool | null = null, runtimePool: Pool | null = null;
  const preserved: Array<{ table: string; key: string; rows: Array<{ identity: string; digest: string }> }> = [];
  const runtimeUrl = process.env.TOONSTUDIO_RBAC_RUNTIME_DATABASE_URL?.trim();
  if (!runtimeUrl) throw new Error("분리된 로컬 runtime DB가 필요합니다.");
  validatePostgresIntegrationUrl(runtimeUrl);
  if (new URL(runtimeUrl).hostname !== "127.0.0.1" || new URL(runtimeUrl).username === new URL(connectionString).username) throw new Error("로컬 migration 계정과 분리한 runtime DB 계정이 필요합니다.");
  const sessionSecret = randomBytes(48).toString("base64url"), emailKey = randomBytes(24).toString("base64url");
  mkdirSync(".qa/rbac-canvas", { recursive: true });
  writeFileSync(".qa/rbac-canvas/server.env", `AUTH_SESSION_SECRET=${sessionSecret}\nRESEND_API_KEY=${emailKey}\n`, { mode: 0o600 });
  vi.stubEnv("DATABASE_URL", runtimeUrl); vi.stubEnv("AUTH_SESSION_SECRET", sessionSecret);
  vi.stubEnv("AUTH_EMAIL_PROVIDER", "resend"); vi.stubEnv("AUTH_EMAIL_FROM", "test@example.test");
  vi.stubEnv("RESEND_API_KEY", emailKey); vi.stubEnv("WEB_APP_BASE_URL", "http://127.0.0.1:5199");
  vi.stubEnv("STUDIO_WORK_ASSET_ADMISSION", "enable-immutable-readonly-work-assets-v1");
  const close = async () => {
    const failures: unknown[] = [];
    for (const action of [async () => { if (app) await app.close(); else await runtimePool?.end(); }, async () => {
      if (!pool) return;
      const cleanup = await pool.connect();
      try {
        await cleanup.query("BEGIN");
        if (workIds.length) {
          // 불변 revision의 createdBy SET NULL보다 소유 work의 Graph 이력을 먼저 정리한다.
          const revisions = 'SELECT revision.id FROM studio_revision revision JOIN studio_artifact artifact ON artifact.id=revision."artifactId" JOIN studio_project_graph project ON project.id=artifact."projectId" WHERE project."workId"=ANY($1::text[])';
          await cleanup.query(`DELETE FROM studio_review WHERE "revisionId" IN (${revisions})`, [workIds]);
          await cleanup.query(`DELETE FROM studio_revision_parent WHERE "revisionId" IN (${revisions})`, [workIds]);
          await cleanup.query(`DELETE FROM studio_operation WHERE "resultRevisionId" IN (${revisions})`, [workIds]);
          await cleanup.query(`DELETE FROM studio_mutation_receipt WHERE "resultRevisionId" IN (${revisions})`, [workIds]);
          await cleanup.query('DELETE FROM creator_work WHERE id=ANY($1::text[])', [workIds]);
        }
        const emails = [...outbox.keys()];
        await cleanup.query('DELETE FROM "session" WHERE "userId" IN (SELECT id FROM "user" WHERE email=ANY($1::text[]))', [emails]);
        await cleanup.query('DELETE FROM "verificationToken" WHERE identifier=ANY($1::text[])', [emails]);
        await cleanup.query('DELETE FROM "user" WHERE email=ANY($1::text[])', [emails]);
        await cleanup.query("COMMIT");
        for (const baseline of preserved) {
          const current = await cleanup.query<{ identity: string; digest: string }>(`SELECT ${baseline.key}::text AS identity, md5(to_jsonb(t)::text) AS digest FROM ${baseline.table} t WHERE ${baseline.key}::text=ANY($1::text[]) ORDER BY identity`, [baseline.rows.map((row) => row.identity)]);
          if (JSON.stringify(current.rows) !== JSON.stringify(baseline.rows)) throw new Error("기존 로컬 데이터 또는 권한의 보존 확인에 실패했습니다.");
        }
        writeFileSync(".qa/rbac-canvas/preservation.json", JSON.stringify(preserved.map((entry) => ({ table: entry.table, priorRows: entry.rows.length, unchanged: true })), null, 2));
        const oldBlobs = new Set(preserved.find((entry) => entry.table === "studio_blob")?.rows.map((entry) => entry.identity));
        const oldObjects = new Set(preserved.find((entry) => entry.table === "creator_asset_storage_object")?.rows.map((entry) => entry.identity));
        const uploaded = [...stored.keys()];
        const newHashes = [...new Set(uploaded.map((key) => key.slice(key.lastIndexOf(":") + 1)).filter((hash) => !oldBlobs.has(hash)))];
        const newObjects = uploaded.filter((key) => !oldObjects.has(key));
        const remaining = await cleanup.query<{ blobs: number; objects: number }>(`SELECT
          (SELECT count(*)::int FROM studio_blob WHERE hash=ANY($1::text[])) AS blobs,
          (SELECT count(*)::int FROM creator_asset_storage_object WHERE (purpose || chr(58) || digest)=ANY($2::text[])) AS objects`, [newHashes, newObjects]);
        // 공유 content-addressed 행은 임의 삭제하지 않고 이 시험의 신규 잔존 개수만 보고한다.
        writeFileSync(".qa/rbac-canvas/fixture-residue.json", JSON.stringify({ testUsersAndWorksRemoved: true,
          retainedNewFixtureMetadata: remaining.rows[0], sharedMetadataDeleted: false }, null, 2));
      } catch (error) { await cleanup.query("ROLLBACK"); throw error; }
      finally { cleanup.release(); }
    }, () => pool?.end()]) { try { await action(); } catch (error) { failures.push(error); } }
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); outbox.clear(); stored.clear();
    if (failures.length) throw new AggregateError(failures, "공개 producer 검증 환경 정리에 실패했습니다.");
  };
  try {
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const href = input instanceof Request ? input.url : String(input);
      if (href === "https://api.resend.com/emails") {
        const mail = JSON.parse(String(init?.body)) as { to: string[]; text: string };
        const link = mail.text.split("\n").find((line) => line.startsWith("http://127.0.0.1:"));
        const token = link ? new URL(link).searchParams.get("token") : null;
        if (!token || !mail.to[0]) throw new Error("테스트 인증 메일 형식 오류");
        outbox.set(mail.to[0], token); return new Response(JSON.stringify({ id: randomUUID() }));
      }
      if (new URL(href).hostname !== "127.0.0.1") throw new Error("검증 중 외부 통신 차단");
      return originalFetch(input, init);
    });
    const storage: PrivateObjectStoragePort = {
      async verifyPrivatePurposeBuckets() { return { ready: true, privatePurposeBuckets: 3 }; },
      async uploadImmutable(input) {
        const hash = createHash("sha256").update(input.bytes).digest("hex");
        const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const,
          purpose: input.purpose, digest: `sha256:${hash}`, objectPath: `sha256/${hash.slice(0, 2)}/${hash}`,
          byteLength: input.bytes.length, contentType: input.contentType };
        stored.set(`${object.purpose}:${object.digest}`, Buffer.from(input.bytes)); return object;
      },
      async createSignedReadUrl({ object, expiresInSeconds }) {
        if (!stored.has(`${object.purpose}:${object.digest}`)) throw new Error("테스트 저장 객체가 없습니다.");
        return { url: `https://preview.invalid/${object.digest.slice(7)}`, expiresAtEpochMs: Date.now() + expiresInSeconds * 1000 };
      },
      async deleteGeneratedObject({ object }) { stored.delete(`${object.purpose}:${object.digest}`); },
    };
    const { Pool: PostgresPool } = await import("pg"); pool = new PostgresPool({ connectionString });
    for (const [table, key] of [['"user"', "id"], ["creator_work", "id"], ["creator_work_collaborator", '("workId" || chr(58) || "userId")'], ["creator_work_scoped_write_policy", '"workId"'], ["studio_blob", "hash"], ["creator_asset_storage_object", '(purpose || chr(58) || digest)']] as const) {
      const result = await pool.query<{ identity: string; digest: string }>(`SELECT ${key}::text AS identity, md5(to_jsonb(t)::text) AS digest FROM ${table} t ORDER BY identity`);
      preserved.push({ table, key, rows: result.rows });
    }
    const { NestFactory } = await import("@nestjs/core"), { json } = await import("express");
    const { PrivateObjectStorageModule } = await import("../../platform/adapters/private-object-storage/private-object-storage.module");
    const { PRIVATE_OBJECT_STORAGE_PORT } = await import("../../platform/adapters/private-object-storage/private-object-storage.port");
    const { SUPABASE_OBJECT_STORAGE_PORT } = await import("../../platform/adapters/supabase-object-storage/supabase-object-storage.port");
    const storageModule = { module: PrivateObjectStorageModule, providers: [{ provide: PRIVATE_OBJECT_STORAGE_PORT, useValue: storage },
      { provide: SUPABASE_OBJECT_STORAGE_PORT, useValue: storage }], exports: [PRIVATE_OBJECT_STORAGE_PORT, SUPABASE_OBJECT_STORAGE_PORT] };
    vi.spyOn(PrivateObjectStorageModule, "fromEnvironment").mockReturnValue(storageModule);
    const { AllExceptionsFilter } = await import("../../platform/http/all-exceptions.filter");
    const originalCatch = AllExceptionsFilter.prototype.catch;
    vi.spyOn(AllExceptionsFilter.prototype, "catch").mockImplementation(function (this: InstanceType<typeof AllExceptionsFilter>, exception, host) {
      const cause = exception instanceof Error ? exception.cause : null;
      for (const error of [exception, cause]) if (error instanceof Error && "code" in error && error.code === "42501"
        && /^permission denied for (?:table|schema|function|sequence) [A-Za-z0-9_.]+$/u.test(error.message)) {
        process.stderr.write(JSON.stringify({ code: "42501", boundary: error.message }) + "\n");
      }
      return originalCatch.call(this, exception, host);
    });
    const { AppModule: IntegrationModule } = await import("../../app.module");
    const { dbPool } = await import("../../platform/database"); runtimePool = dbPool;
    const actualConnection = dbPool.options.connectionString;
    if (typeof actualConnection !== "string") throw new Error("실제 앱 DB 연결의 시험 경계를 확인하지 못했습니다.");
    validatePostgresIntegrationUrl(actualConnection);
    const actualUrl = new URL(actualConnection), expectedUrl = new URL(runtimeUrl);
    if (actualUrl.hostname !== "127.0.0.1" || actualUrl.port !== expectedUrl.port || actualUrl.pathname !== expectedUrl.pathname || actualUrl.username !== expectedUrl.username) throw new Error("앱 import 전에 다른 DB 계정이 초기화됐습니다. 검증을 중단합니다.");
    const runtime = await dbPool.query<{ owner: boolean; privileged: boolean }>(`SELECT current_user=pg_get_userbyid(d.datdba) AS owner,
      (r.rolsuper OR r.rolbypassrls) AS privileged FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`);
    if (runtime.rows[0]?.owner !== false || runtime.rows[0]?.privileged !== false) throw new Error("실제 앱은 DB 소유자·특권 계정으로 검증할 수 없습니다.");
    const relations = await dbPool.query<{ owner: boolean }>(`SELECT coalesce(bool_or(pg_has_role(current_user,c.relowner,'MEMBER')),false) AS owner
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND c.relname=ANY($1::text[])`, [["creator_work", "creator_work_scoped_write_policy", "studio_blob", "studio_project_graph", "creator_asset_storage_object", "creator_work_asset_storage_reference"]]);
    if (relations.rows[0]?.owner !== false) throw new Error("실제 앱은 검증 관계의 소유 역할과 분리해야 합니다.");
    const { ZodValidationPipe } = await import("../../platform/http/zod-validation.pipe");
    const { sessionAuth } = await import("../../session-middleware");
    const { createCsrfProtectionMiddleware } = await import("../../csrf-middleware");
    const repositoryRoot = resolve(__dirname, "../../../../..") + sep;
    const diagnosticLogger: LoggerService = {
      log: () => undefined, warn: () => undefined, debug: () => undefined,
      verbose: () => undefined, fatal: () => undefined,
      error(message: unknown, ...details: unknown[]) {
        const unexpectedError = message instanceof Error ? message : undefined;
        const causeType = unexpectedError ? unexpectedError.name.replace(/[^A-Za-z0-9_$.-]/gu, "?").slice(0, 80) : typeof message === "string"
          ? /^Creator collaboration save_shared_document failed for work=.*; cause=([A-Za-z0-9_$?.-]{1,80})$/u.exec(message)?.[1]
          : undefined;
        if (!causeType) return;
        const frames = new Set<string>();
        for (const detail of unexpectedError ? [unexpectedError.stack] : details) {
          if (typeof detail !== "string") continue;
          for (const line of detail.split("\n")) {
            if (!/^\s+at\s/u.test(line)) continue;
            const rootIndex = line.indexOf(repositoryRoot);
            if (rootIndex < 0) continue;
            const frame = /^((?:apps|packages|scripts)\/[A-Za-z0-9_./-]+\.[cm]?[jt]sx?:[1-9]\d*):[1-9]\d*\)?$/u
              .exec(line.slice(rootIndex + repositoryRoot.length))?.[1];
            if (frame && !frame.includes("/node_modules/") && frames.size < 12) frames.add(frame);
          }
        }
        const marker = unexpectedError ? "SCOPED_SUBMISSION_FAILURE" : "SCOPED_SAVE_FAILURE";
        process.stderr.write(`[${marker}] ${JSON.stringify({ causeType, frames: [...frames] })}\n`);
      },
    };
    app = await NestFactory.create(IntegrationModule, { logger: diagnosticLogger, bodyParser: false, abortOnError: false });
    const { PinoLogger } = await import("nestjs-pino"); PinoLogger.root.level = "silent";
    app.use(sessionAuth); app.use(createCsrfProtectionMiddleware({ NODE_ENV: "test", API_CORS_ALLOWED_ORIGINS: ["http://127.0.0.1:5199", browserOrigin].filter(Boolean).join(",") }));
    app.use(json({ limit: "2mb" })); app.useGlobalPipes(new ZodValidationPipe()); app.setGlobalPrefix("api"); await app.listen(4111, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo, base = `http://127.0.0.1:${address.port}`;
    async function request<T = Record<string, unknown>>(route: string, options: {
      method?: string; body?: unknown; cookie?: string; headers?: Record<string, string>;
    } = {}) {
      const multipart = options.body instanceof FormData;
      const response = await originalFetch(`${base}/api${route}`, {
        method: options.method ?? (options.body === undefined ? "GET" : "POST"), redirect: "error",
        headers: { ...(options.body !== undefined && !multipart ? { "Content-Type": "application/json" } : {}), Origin: "http://127.0.0.1:5199",
          "x-toonstudio-csrf": "1", ...(options.cookie ? { Cookie: options.cookie } : {}), ...options.headers },
        ...(options.body === undefined ? {} : { body: multipart ? options.body as FormData : JSON.stringify(options.body) }), signal: AbortSignal.timeout(15_000),
      });
      return { status: response.status, body: await response.json() as T, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null };
    }
    const { StudioCrdtService } = await import("./studio-crdt.service");
    return { request, outbox, pool, close, base, crdt: app.get(StudioCrdtService) };
  } catch (cause) {
    try { await close(); } catch (cleanupError) { throw new AggregateError([cause, cleanupError], "공개 producer 초기화와 정리에 실패했습니다.", { cause: cleanupError }); }
    throw cause;
  }
}
