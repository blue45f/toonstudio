import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STUDIO_ROLE_PIPELINE_STAGE_IDS, StudioRolePipelineStateSchema } from "@toonstudio/contracts/studio-role-pipeline";
import { creatorWorkScopedWritePolicies } from "../../platform/database/schema/studio-scoped-write.schema";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";

const databaseUrl = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim() || process.env.TEST_DATABASE_URL?.trim();
if (process.env.CI && !databaseUrl) throw new Error("직군 정책 migration 검증에는 로컬 PostgreSQL URL이 필요합니다.");
const readMigration = (name: string) => readFileSync(new URL(`../../platform/database/migrations/${name}.sql`, import.meta.url), "utf8");
const migration = readMigration("0120_studio_role_pipeline_policy");

describe.skipIf(!databaseUrl)("직군 파이프라인의 기본 OFF·추가형 PostgreSQL migration", () => {
  let client: Client;
  let schema: string;
  const state = () => StudioRolePipelineStateSchema.parse({ version: 1, enabled: true, productionProjectId: "project",
    activeStageId: "story-script", roleBindings: [{ roleId: "story", assignmentId: "assignment" }],
    groupMappings: [{ groupId: "story-notes", targetIds: ["target"] }],
    stageTasks: STUDIO_ROLE_PIPELINE_STAGE_IDS.map((stageId) => ({ stageId, taskId: `task-${stageId}` })),
    frozenStageIds: [], approvedAt: null, history: [] });
  const scoped = (source: string) => source.replaceAll("public.", `${schema}.`);
  const apply = () => client.query(scoped(migration));
  const insertPolicy = () => client.query(`INSERT INTO creator_work_scoped_write_policy
    ("workId","policyVersion",targets,grants,ownership,"updatedBy","updatedAt")
    VALUES ('work',7,'[{"definition":{"id":"target"}}]','[{"id":"existing-grant"}]',
      '{"stroke:original":"target"}','owner','2026-11-04T00:00:00Z')`);

  beforeEach(async () => {
    validatePostgresIntegrationUrl(databaseUrl);
    schema = `role_pipeline_${randomUUID().replaceAll("-", "")}`;
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      CREATE TABLE "user"(id text PRIMARY KEY, settings jsonb NOT NULL);
      CREATE TABLE creator_work(id text PRIMARY KEY, doc jsonb NOT NULL);
      INSERT INTO "user" VALUES ('owner','{"theme":"dark","creatorRole":"line-art"}');
      INSERT INTO creator_work VALUES ('work','{"pagesList":[{"id":"page","elements":[{"id":"original"}]}]}');`);
    // 0118·0119는 이 테이블을 바꾸지 않으므로 0117 원문으로 0119 시점의 정책 구조를 재현한다.
    await client.query(scoped(readMigration("0117_studio_scoped_write_policy")));
  });
  afterEach(async () => {
    if (!client) return;
    try { await client.query("ROLLBACK"); await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await client.end(); }
  });

  it("빈 정책 테이블에 재실행해도 새 정책은 nullable jsonb의 기본 OFF로 생성된다", async () => {
    await apply(); await apply(); await insertPolicy();
    expect((await client.query('SELECT "rolePipeline" FROM creator_work_scoped_write_policy')).rows).toEqual([{ rolePipeline: null }]);
    const column = (await client.query(`SELECT attribute.attnotnull AS required,
      format_type(attribute.atttypid,attribute.atttypmod) AS type,
      pg_get_expr(default_value.adbin,default_value.adrelid) AS "defaultValue"
      FROM pg_attribute attribute LEFT JOIN pg_attrdef default_value
        ON default_value.adrelid=attribute.attrelid AND default_value.adnum=attribute.attnum
      WHERE attribute.attrelid=$1::regclass AND attribute.attname='rolePipeline'`, [`${schema}.creator_work_scoped_write_policy`])).rows[0];
    expect(column).toMatchObject({ required: false, type: "jsonb" });
    expect(column.defaultValue === null || /^NULL(?:::jsonb)?$/u.test(column.defaultValue)).toBe(true);
  });

  it("0119 시점의 기존 정책·영수증·원고·사용자 설정과 물리 행을 다시 쓰지 않는다", async () => {
    await insertPolicy();
    await client.query(`INSERT INTO creator_work_scoped_write_receipt
      ("workId",kind,"mutationId","actorUserId","requestHash","policyVersion","targetIds",response,"createdAt")
      VALUES ('work','rest','old-save','owner',$1,7,'["target"]','{"revision":3}','2026-11-04T00:00:00Z')`, ["a".repeat(64)]);
    const snapshot = async () => ({
      policy: (await client.query(`SELECT to_jsonb(policy)-'rolePipeline' AS value,xmin::text AS xmin,ctid::text AS ctid
        FROM creator_work_scoped_write_policy policy`)).rows,
      receipts: (await client.query('SELECT to_jsonb(receipt) AS value FROM creator_work_scoped_write_receipt receipt')).rows,
      works: (await client.query('SELECT to_jsonb(work) AS value FROM creator_work work')).rows,
      users: (await client.query('SELECT to_jsonb(account) AS value FROM "user" account')).rows,
    });
    const before = await snapshot();
    await apply(); await apply();
    expect(await snapshot()).toEqual(before);
    expect((await client.query('SELECT "rolePipeline" FROM creator_work_scoped_write_policy')).rows[0].rolePipeline).toBeNull();
  });

  it("공유 계약의 모든 상태 필드를 저장·복원하고 잘못된 기본형·누락 필드를 DB에서도 거절한다", async () => {
    await apply(); await insertPolicy(); const configured = state();
    await client.query('UPDATE creator_work_scoped_write_policy SET "rolePipeline"=$1', [configured]);
    expect(StudioRolePipelineStateSchema.parse((await client.query('SELECT "rolePipeline" FROM creator_work_scoped_write_policy')).rows[0].rolePipeline)).toEqual(configured);
    for (const invalid of [{ ...configured, version: "1" }, { ...configured, enabled: "true" },
      { ...configured, stageTasks: [] }, { ...configured, activeStageId: "unknown" },
      { ...configured, approvedAt: undefined }, { ...configured, history: undefined }]) {
      expect(StudioRolePipelineStateSchema.safeParse(invalid).success).toBe(false);
      await expect(client.query('UPDATE creator_work_scoped_write_policy SET "rolePipeline"=$1', [invalid])).rejects.toMatchObject({ code: "23514" });
    }
    expect((await client.query('SELECT "rolePipeline" FROM creator_work_scoped_write_policy')).rows[0].rolePipeline).toEqual(configured);
  });

  it("설정된 ON·OFF를 재적용해도 보존하며 Drizzle이 같은 nullable 컬럼·제약을 선언한다", async () => {
    await apply(); await insertPolicy();
    for (const enabled of [true, false]) {
      const configured = { ...state(), enabled };
      await client.query('UPDATE creator_work_scoped_write_policy SET "rolePipeline"=$1', [configured]);
      await apply();
      expect((await client.query('SELECT "rolePipeline" FROM creator_work_scoped_write_policy')).rows[0].rolePipeline).toEqual(configured);
    }
    const definition = getTableConfig(creatorWorkScopedWritePolicies);
    const column = definition.columns.find((entry) => entry.name === "rolePipeline");
    expect(column?.getSQLType()).toBe("jsonb"); expect(column?.notNull).toBe(false);
    expect(definition.checks.some((entry) => entry.name === "creator_scoped_write_role_pipeline_check")).toBe(true);
  });
});
