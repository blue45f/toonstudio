import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validatePostgresIntegrationUrl } from "./run-postgres-integration-tests.mjs";

const target = process.env.TEST_DATABASE_URL?.trim();
const execute = promisify(execFile);
const suffix = randomUUID().replaceAll("-", "");
const ownerRole = `voice_owner_${suffix}`;
const runtimeRole = `voice_runtime_${suffix}`;
const migration = (name) => readFile(new URL(`../apps/api/src/platform/database/migrations/${name}.sql`, import.meta.url), "utf8");
const hash = "a".repeat(64);
const subject = { schemaVersion: 1, workId: "work", reviewId: "review", revisionId: "revision", rootGraphHash: hash, projectId: "project", artifactId: "artifact" };
const object = { contractVersion: "toonspectrum.private-object-storage.v2", purpose: "derived", contentType: "audio/webm", byteLength: 128, digest: `sha256:${hash}`, providerId: "cloudflare-r2", objectPath: `sha256/aa/${hash}` };

describe.skipIf(!target)("음성 검수 함수의 일반 PostgreSQL 백업·복원", () => {
  let administrator, source, restored, directory, parsedTarget;
  const databases = [], clients = [], roles = [];

  async function database(label) {
    const name = `voice_test_${label}_${suffix}`;
    await administrator.query(`CREATE DATABASE ${name} TEMPLATE template0`);
    databases.push(name);
    const url = new URL(target);
    url.pathname = `/${name}`;
    const client = new pg.Client({ connectionString: url.href });
    await client.connect();
    clients.push(client);
    return { client, name };
  }

  async function cli(command, name, arguments_) {
    return execute(command, arguments_, {
      env: {
        // 운영용 libpq service·hostaddr 설정을 상속해 로컬 경계를 벗어나지 않게 한다.
        ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG"))),
        PGHOST: parsedTarget.hostname.replace(/^\[|\]$/gu, ""),
        PGPORT: parsedTarget.port || "5432",
        PGUSER: decodeURIComponent(parsedTarget.username),
        PGPASSWORD: decodeURIComponent(parsedTarget.password),
        PGDATABASE: name,
        PGSSLMODE: parsedTarget.searchParams.get("sslmode") || "prefer",
      },
      timeout: 15_000,
    });
  }

  async function seed(client) {
    await client.query(`CREATE TABLE public."user"(id text PRIMARY KEY);
      CREATE TABLE public.creator_work(id text PRIMARY KEY);
      INSERT INTO public."user" VALUES('author'); INSERT INTO public.creator_work VALUES('work')`);
    await client.query(await migration("0090_studio_review_voice_note"));
  }

  function add(client, id, snapshot = subject, deleted = false, retentionDays = 1) {
    return client.query(`INSERT INTO public.studio_review_voice_note
      (id,"workId","reviewId","revisionId","rootGraphHash",subject,"authorUserId",title,transcript,"durationMs","contentType","byteLength",sha256,"objectReference","requestHash","operationId","createdAt","expiresAt","deletedAt","deleteOperationId")
      VALUES($1,'work','review','revision',$2,$3,'author','검토','설명',1000,'audio/webm',128,$2,$4,$2,$1,now(),now()+$6::integer*interval '1 day',CASE WHEN $5 THEN now() END,CASE WHEN $5 THEN $1 END)`,
    [id, hash, snapshot, object, deleted, retentionDays]);
  }

  async function snapshot(client, definitions = true) {
    const state = (await client.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM public.studio_review_voice_note n) AS notes,
      c.relrowsecurity, c.relforcerowsecurity, c.relacl::text,
      (SELECT jsonb_agg(jsonb_build_object('name',polname,'cmd',polcmd,'roles',polroles,
        'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname)
        FROM pg_policy WHERE polrelid=c.oid) AS policies,
      (SELECT jsonb_agg(jsonb_build_object('name',conname,'validated',convalidated,'definition',pg_get_constraintdef(oid)) ORDER BY conname)
        FROM pg_constraint WHERE conrelid=c.oid) AS constraints
      FROM pg_class c WHERE c.oid='public.studio_review_voice_note'::regclass`)).rows[0];
    // 복원 시 AND 괄호가 정규화될 수 있어 식 출력의 동등성은 migration 전후에만 비교한다.
    if (!definitions) state.constraints = state.constraints.map(({ name, validated }) => ({ name, validated }));
    return state;
  }

  async function functionState(client) {
    return (await client.query(`SELECT p.proowner::regrole::text AS owner, p.proacl::text AS acl,
      p.prosecdef, p.proconfig, n.nspname
      FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE t.tgrelid='public.studio_review_voice_note'::regclass AND t.tgname='studio_review_voice_note_guard_update'`)).rows[0];
  }

  async function apply(client, asOwner = false) {
    if (asOwner) await client.query(`SET ROLE ${ownerRole}`);
    try { await client.query(await migration("0119_studio_review_voice_note_guard_schema")); }
    finally { await client.query("ROLLBACK; RESET ROLE"); }
  }

  beforeAll(async () => {
    validatePostgresIntegrationUrl(target);
    parsedTarget = new URL(target);
    expect(["localhost", "127.0.0.1", "::1", "[::1]"]).toContain(parsedTarget.hostname);
    administrator = new pg.Client({ connectionString: target });
    await administrator.connect();
    directory = await mkdtemp(join(tmpdir(), "voice-note-backup-"));
    // pg_catalog 생성 결함은 다른 검사에 영향을 주지 않는 새 DB에만 재현한다.
    for (const role of [ownerRole, runtimeRole]) {
      await administrator.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB`);
      roles.push(role);
    }
    source = await database("source");
    await seed(source.client);
    await source.client.query(await migration("0093_review_voice_note_constraints_repair"));
    await add(source.client, "legacy-note");
    await administrator.query(`ALTER DATABASE ${source.name} OWNER TO ${ownerRole}`);
    await source.client.query(`ALTER TABLE public.studio_review_voice_note OWNER TO ${ownerRole};
      ALTER FUNCTION public.studio_review_voice_note_guard() OWNER TO ${ownerRole};
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.studio_review_voice_note TO ${runtimeRole};
      GRANT SELECT ON public.creator_work TO ${runtimeRole}, ${ownerRole};
      GRANT EXECUTE ON FUNCTION public.studio_review_voice_note_guard() TO ${runtimeRole}`);
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.end()));
    if (administrator) {
      try {
        for (const name of databases) await administrator.query(`DROP DATABASE ${name}`);
        for (const role of roles) await administrator.query(`DROP ROLE ${role}`);
      } finally { await administrator.end(); }
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("0093 원문으로 만든 시스템 함수 참조가 일반 복원에서 실패한다", async () => {
    expect((await functionState(source.client)).nspname).toBe("pg_catalog");
    const duplicate = await source.client.query(`SELECT n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.proname='studio_review_voice_note_guard' ORDER BY n.nspname`);
    expect(duplicate.rows.map((row) => row.nspname)).toEqual(["pg_catalog", "public"]);
    const broken = await database("broken");
    const archive = join(directory, "before.dump");
    await cli("pg_dump", source.name, ["--format=custom", "--file", archive]);
    await expect(cli("pg_restore", broken.name, ["--exit-on-error", "--dbname", broken.name, archive]))
      .rejects.toMatchObject({ stderr: expect.stringContaining('function studio_review_voice_note_guard() does not exist') });
  });

  it("시스템 함수 권한이 없거나 다른 트리거가 참조하면 전체 수정을 롤백한다", async () => {
    const before = await snapshot(source.client);
    const binding = await functionState(source.client);
    const publicBody = (await source.client.query("SELECT prosrc FROM pg_proc WHERE oid='public.studio_review_voice_note_guard()'::regprocedure")).rows[0];
    await expect(apply(source.client, true)).rejects.toMatchObject({ code: "42501" });
    expect(await functionState(source.client)).toEqual(binding);
    expect((await source.client.query("SELECT prosrc FROM pg_proc WHERE oid='public.studio_review_voice_note_guard()'::regprocedure")).rows[0]).toEqual(publicBody);
    await source.client.query(`CREATE TRIGGER legacy_voice_dependency BEFORE UPDATE ON public.creator_work
      FOR EACH ROW EXECUTE FUNCTION pg_catalog.studio_review_voice_note_guard()`);
    try {
      await expect(apply(source.client)).rejects.toMatchObject({ code: "2BP01" });
      expect(await functionState(source.client)).toEqual(binding);
      expect(await snapshot(source.client)).toEqual(before);
    } finally { await source.client.query("DROP TRIGGER legacy_voice_dependency ON public.creator_work"); }
  });

  it("행·권한·제약을 보존하며 public 함수로 연결하고 일반 복원을 통과한다", async () => {
    const before = await snapshot(source.client);
    const publicBefore = (await source.client.query("SELECT proowner::regrole::text AS owner, proacl::text AS acl FROM pg_proc WHERE oid='public.studio_review_voice_note_guard()'::regprocedure")).rows[0];
    await apply(source.client);
    expect(await snapshot(source.client)).toEqual(before);
    expect(await functionState(source.client)).toEqual({
      ...publicBefore, nspname: "public", prosecdef: false, proconfig: ["search_path=pg_catalog, public"],
    });
    const privileges = await source.client.query(`SELECT has_function_privilege($1,'public.studio_review_voice_note_guard()','EXECUTE') AS runtime,
      EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE p.oid='public.studio_review_voice_note_guard()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public`, [runtimeRole]);
    expect(privileges.rows[0]).toEqual({ runtime: true, public: false });
    await apply(source.client);
    expect(await snapshot(source.client)).toEqual(before);
    restored = await database("restored");
    const archive = join(directory, "after.dump");
    await cli("pg_dump", source.name, ["--format=custom", "--file", archive]);
    await cli("pg_restore", restored.name, ["--exit-on-error", "--dbname", restored.name, archive]);
    expect(await snapshot(restored.client, false)).toEqual(await snapshot(source.client, false));
    expect(await functionState(restored.client)).toEqual(await functionState(source.client));
    expect((await restored.client.query("SELECT to_regprocedure('pg_catalog.studio_review_voice_note_guard()') AS fn")).rows[0].fn).toBeNull();
  });

  it("복원된 트리거는 비소유자에게도 불변 필드·삭제 전이·보존 제약을 강제하고 호출자 권한을 따른다", async () => {
    const client = restored.client;
    await client.query(`SET ROLE ${runtimeRole}`);
    try {
      await add(client, "runtime-note");
      await expect(add(client, "deleted-insert", subject, true)).rejects.toMatchObject({ code: "P0001" });
      await expect(add(client, "bad-subject", { projectId: "project", artifactId: "artifact" })).rejects.toMatchObject({ code: "23514" });
      await expect(add(client, "bad-retention", subject, false, 31)).rejects.toMatchObject({ code: "23514" });
      await expect(client.query("UPDATE public.studio_review_voice_note SET transcript='변조' WHERE id='runtime-note'"))
        .rejects.toMatchObject({ code: "P0001" });
      await expect(client.query("DELETE FROM public.studio_review_voice_note WHERE id='runtime-note'"))
        .rejects.toMatchObject({ code: "P0001" });
      await client.query("UPDATE public.studio_review_voice_note SET \"deletedAt\"=now(),\"deleteOperationId\"='delete-once' WHERE id='runtime-note'");
      await expect(client.query("UPDATE public.studio_review_voice_note SET \"deleteOperationId\"='delete-twice' WHERE id='runtime-note'"))
        .rejects.toMatchObject({ code: "P0001" });
    } finally { await client.query("RESET ROLE"); }
    await client.query(`REVOKE SELECT ON public.creator_work FROM ${runtimeRole}; SET ROLE ${runtimeRole}`);
    try {
      await expect(client.query("DELETE FROM public.studio_review_voice_note WHERE id='runtime-note'"))
        .rejects.toMatchObject({ code: "42501" });
    } finally { await client.query("RESET ROLE"); }
    await client.query("DELETE FROM public.creator_work WHERE id='work'");
    expect((await client.query("SELECT count(*)::integer AS n FROM public.studio_review_voice_note")).rows[0].n).toBe(0);
  });

  it("시스템 함수가 없는 0090 신규 스키마에도 적용할 수 있다", async () => {
    const fresh = await database("fresh");
    await administrator.query(`ALTER DATABASE ${fresh.name} OWNER TO ${ownerRole}`);
    await fresh.client.query(`SET ROLE ${ownerRole}`);
    try { await seed(fresh.client); } finally { await fresh.client.query("RESET ROLE"); }
    await apply(fresh.client, true);
    expect((await functionState(fresh.client)).nspname).toBe("public");
    await add(fresh.client, "fresh-note");
    await expect(fresh.client.query("DELETE FROM public.studio_review_voice_note WHERE id='fresh-note'"))
      .rejects.toMatchObject({ code: "P0001" });
  });
});
