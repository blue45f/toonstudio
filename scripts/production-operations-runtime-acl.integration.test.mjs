import { validatePostgresIntegrationUrl } from "./run-postgres-integration-tests.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildProductionOperationsRuntimeAclSql, buildProductionOperationsRuntimeAclViolationSql } from "./production-operations-database-contract.mjs";
import { TeamWorkspaceRepository } from "../apps/api/src/modules/production-collaboration/team-workspace.repository.ts";
import { OperationPolicyRepository } from "../apps/api/src/modules/operation-policy/operation-policy.repository.ts";
import { initialOperationPolicy } from "../packages/contracts/src/operation-policy.ts";
import { getTableConfig } from "drizzle-orm/pg-core";
import { productionCutSlice, productionBinaryLock, productionQaInspection, productionRoyaltyLedger } from "../apps/api/src/platform/database/schema/production.schema.ts";
const target = process.env.TEST_DATABASE_URL;
const suffix = randomUUID().replaceAll("-", "");
const schema = `ops_acl_${suffix}`;
const role = `ops_run_${suffix}`;
const redirect = (sql) => sql.replaceAll("public.", `${schema}.`);
const divisionMigration = readFileSync(new URL("../apps/api/src/platform/database/migrations/0133_production_division_os.sql", import.meta.url), "utf8");
const divisionTables = [productionCutSlice, productionBinaryLock, productionQaInspection, productionRoyaltyLedger];
describe.skipIf(!target)("actual non-owner runtime grants for production operations", () => {
  let owner, runtimeBacking, runtime, team, policy;
  let roleCreated = false, schemaCreated = false;
  beforeAll(async () => {
    if (!target) throw new Error("Explicit disposable local owner connection required");
    validatePostgresIntegrationUrl(target);
    owner = new pg.Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 1 });
    await owner.query(`CREATE ROLE ${role} NOLOGIN`); roleCreated = true;
    await owner.query(`CREATE SCHEMA ${schema}`); schemaCreated = true;
    await owner.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text,email text,"emailVerified" timestamptz,status text,role text);
      CREATE TABLE creator_work(id text PRIMARY KEY,"userId" text REFERENCES "user"(id),title text);
      CREATE TABLE creator_work_collaborator("workId" text REFERENCES creator_work(id),"userId" text REFERENCES "user"(id),role text,status text);
      INSERT INTO "user" VALUES('owner','Owner','owner@example.test',now(),'active','user'),('admin','Admin','admin@example.test',now(),'active','admin');`);
    for (const name of ['0053_production_collaboration_core.sql','0084_production_model_v2_compatibility.sql','0085_production_team_workspace.sql','0086_production_operation_policy.sql','0133_production_division_os.sql']) {
      await owner.query(redirect(readFileSync(new URL(`../apps/api/src/platform/database/migrations/${name}`,import.meta.url),'utf8')));
    }
    await owner.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role};
      GRANT SELECT ON "user",creator_work,creator_work_collaborator,production_project TO ${role};
      GRANT UPDATE(name) ON "user" TO ${role}; GRANT UPDATE(title) ON creator_work TO ${role};`);
    await owner.query(redirect(buildProductionOperationsRuntimeAclSql(role)));
    runtimeBacking = new pg.Pool({ connectionString: target, options: `-c search_path=${schema}`, max: 2 });
    runtime = { async connect() { const client = await runtimeBacking.connect(); await client.query(`SET ROLE ${role}`); return client; } };
    team = new TeamWorkspaceRepository(runtime); policy = new OperationPolicyRepository(runtime);
    await owner.query(`INSERT INTO creator_work(id,"userId",title) VALUES('division-work','owner','분업 검증');
      INSERT INTO production_project(id,"workId",title,"collaborationModel","modelVersion",aggregate)
      VALUES('division-project','division-work','분업 검증','studio-production',2,
        '{"modelVersion":2,"projectId":"division-project","workId":"division-work","revision":0,"parties":[],"assignments":[],"auditEvents":[]}');`);
  });
  afterAll(async () => {
    await runtimeBacking?.end();
    if (owner) {
      if (schemaCreated) await owner.query(`DROP SCHEMA ${schema} CASCADE`);
      if (roleCreated) await owner.query(`DROP ROLE ${role}`);
      await owner.end();
    }
  });
  async function queryRuntime(sql, parameters) {
    const client = await runtime.connect();
    try { return await client.query(sql,parameters); } finally { client.release(); }
  }
  async function seedDivisionRecords() {
    const id = randomUUID();
    await queryRuntime(`INSERT INTO production_cut_slice
      (id,project_id,episode_id,stage_code,cut_start,cut_end,assignee_user_id)
      VALUES($1,'division-project',$1,'line',1,10,'owner')`, [id]);
    await queryRuntime(`INSERT INTO production_binary_lock(asset_key,project_id,holder_user_id,lock_reason,expires_at)
      VALUES($1,'division-project','owner','실제 잠금 검사',now()+interval '1 hour')`, [id]);
    await queryRuntime(`INSERT INTO production_qa_inspection
      (id,cut_slice_id,revision_hash,palette_drift_max,line_width_cv,mobile_375_ok,rights_bom_ok,verdict,reviewer_user_id)
      VALUES($1,$1,'sha256:fixture',1,0.1,true,true,'approved','admin')`, [id]);
    await queryRuntime(`INSERT INTO production_royalty_ledger(id,project_id,episode_id,payee_user_id,role_code)
      VALUES($1,'division-project',$1,'owner','line')`, [id]);
    return id;
  }
  async function divisionSnapshot(id) {
    const records = [];
    for (const table of divisionTables) {
      const { name } = getTableConfig(table);
      const key = name === 'production_binary_lock' ? 'asset_key' : 'id';
      records.push((await queryRuntime(`SELECT * FROM ${name} WHERE ${key}=$1`, [id])).rows);
    }
    return records;
  }
  it("빈 DB에 생성된 분업 4개 표의 열·제약·인덱스가 실제 Drizzle 선언과 일치한다", async () => {
    for (const table of divisionTables) {
      const config = getTableConfig(table);
      const relation = `${schema}.${config.name}`;
      const columns = (await owner.query(`SELECT attname AS name,format_type(atttypid,atttypmod) AS type,
        attnotnull AS "notNull",atthasdef AS "hasDefault" FROM pg_catalog.pg_attribute
        WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`, [relation])).rows;
      expect(columns).toEqual(config.columns.map(column => ({ name: column.name, type: column.getSQLType(),
        notNull: column.notNull, hasDefault: column.default !== undefined })));
      const checks = (await owner.query(`SELECT conname AS name,convalidated AS validated FROM pg_catalog.pg_constraint
        WHERE conrelid=$1::regclass AND contype='c' ORDER BY conname`, [relation])).rows;
      expect(checks).toEqual(config.checks.map(check => ({ name: check.name, validated: true }))
        .sort((left, right) => left.name.localeCompare(right.name)));
      const indexes = (await owner.query(`SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname=$1 AND tablename=$2`,
        [schema, config.name])).rows.map(row => row.indexname);
      expect(indexes).toEqual(expect.arrayContaining(config.indexes.map(index => index.config.name)));
      const foreignKeys = (await owner.query(`SELECT parent.relname AS target,dependency.confdeltype AS action
        FROM pg_catalog.pg_constraint dependency JOIN pg_catalog.pg_class parent ON parent.oid=dependency.confrelid
        WHERE dependency.conrelid=$1::regclass AND dependency.contype='f'`, [relation])).rows;
      const actions = { cascade: 'c', 'set null': 'n', restrict: 'r' };
      expect(foreignKeys).toEqual(expect.arrayContaining(config.foreignKeys.map(key => ({
        target: getTableConfig(key.reference().foreignTable).name,
        action: actions[key.onDelete],
      }))));
      expect(foreignKeys).toHaveLength(config.foreignKeys.length);
    }
  });
  it("비소유자 역할로 분업 상태와 누적 정산만 갱신하고 검수 원문·원장 식별자는 보호한다", async () => {
    const id = await seedDivisionRecords();
    await queryRuntime(`UPDATE production_cut_slice SET status='approved',latest_rev_hash='sha256:fixture',updated_at=now() WHERE id=$1`, [id]);
    await queryRuntime(`UPDATE production_binary_lock SET expires_at=expires_at+interval '1 hour' WHERE asset_key=$1`, [id]);
    await queryRuntime(`UPDATE production_royalty_ledger SET approved_cuts=10,base_amount_krw=100000,royalty_bps=500 WHERE id=$1`, [id]);
    const rows = await divisionSnapshot(id);
    expect(rows[0][0]).toMatchObject({ status: 'approved', allowed_folders: [] });
    expect(rows[2][0]).toMatchObject({ verdict: 'approved', redline_strokes: [] });
    expect(rows[3][0]).toMatchObject({ approved_cuts: 10, base_amount_krw: '100000', royalty_bps: 500, status: 'accruing' });
    for (const sql of [
      'UPDATE production_cut_slice SET project_id=project_id WHERE id=$1',
      'UPDATE production_binary_lock SET asset_key=asset_key WHERE asset_key=$1',
      'UPDATE production_qa_inspection SET verdict=verdict WHERE id=$1',
      'DELETE FROM production_qa_inspection WHERE id=$1',
      'UPDATE production_royalty_ledger SET payee_user_id=payee_user_id WHERE id=$1',
      'DELETE FROM production_royalty_ledger WHERE id=$1',
    ]) await expect(queryRuntime(sql, [id])).rejects.toMatchObject({ code: '42501' });
  });
  it("저장 자료가 있는 DB에 additive 마이그레이션을 재실행해도 네 원장의 값과 권한을 보존한다", async () => {
    const id = await seedDivisionRecords();
    const before = await divisionSnapshot(id);
    await owner.query(redirect(divisionMigration));
    await owner.query(redirect(divisionMigration));
    await owner.query(redirect(buildProductionOperationsRuntimeAclSql(role)));
    expect(await divisionSnapshot(id)).toEqual(before);
    expect((await owner.query(`SELECT ${redirect(buildProductionOperationsRuntimeAclViolationSql(role))} invalid`)).rows[0].invalid).toBe(false);
  });
  it("컷 범위·잠금 만료·검수 수치·정산 범위와 외래키·인세 중복을 실제 DB가 거부한다", async () => {
    const id = await seedDivisionRecords();
    for (const sql of [
      'UPDATE production_cut_slice SET cut_start=20 WHERE id=$1',
      'UPDATE production_binary_lock SET expires_at=locked_at WHERE asset_key=$1',
      'UPDATE production_qa_inspection SET line_width_cv=-0.1 WHERE id=$1',
      'UPDATE production_royalty_ledger SET royalty_bps=10001 WHERE id=$1',
    ]) await expect(owner.query(sql, [id])).rejects.toMatchObject({ code: '23514' });
    await expect(owner.query(`UPDATE production_cut_slice SET project_id='missing-project' WHERE id=$1`, [id]))
      .rejects.toMatchObject({ code: '23503' });
    await expect(queryRuntime(`INSERT INTO production_royalty_ledger(id,project_id,episode_id,payee_user_id,role_code)
      VALUES($1,'division-project',$2,'owner','line')`, [randomUUID(), id])).rejects.toMatchObject({ code: '23505' });
  });
  it("checks actual grants and owner trigger under a non-owner role", async () => {
    expect((await queryRuntime('SELECT current_user role')).rows[0].role).toBe(role);
    expect((await owner.query(`SELECT ${redirect(buildProductionOperationsRuntimeAclViolationSql(role))} invalid`)).rows[0].invalid).toBe(false);
    const workspace = await team.create('owner',{name:'런타임 검증',mutationId:randomUUID()});
    expect((await team.detail('owner',workspace.workspaceId)).workspace.memberCount).toBe(1);
    await expect(queryRuntime('DELETE FROM production_team_member WHERE workspace_id=$1',[workspace.workspaceId])).rejects.toMatchObject({code:'23514'});
  });
  it("updates policy via the repository while audit/receipt rows remain immutable", async () => {
    const draft = initialOperationPolicy();
    const impact = await policy.preview('admin',{draft,expectedRevision:0});
    await policy.apply('admin',{draft,expectedRevision:0,previewDigest:impact.digest,mutationId:randomUUID(),reason:'실제 비소유자 정책 검증'});
    expect((await policy.read('admin')).policy.revision).toBe(1);
    await expect(queryRuntime("UPDATE production_operation_policy_audit SET reason='tamper' WHERE revision=1")).rejects.toMatchObject({code:'42501'});
    await expect(queryRuntime('DELETE FROM production_operation_policy WHERE id=1')).rejects.toMatchObject({code:'42501'});
    await expect(queryRuntime('UPDATE production_team_workspace SET id=id')).rejects.toMatchObject({code:'42501'});
    await expect(queryRuntime('UPDATE production_team_receipt SET response=response')).rejects.toMatchObject({code:'42501'});
  });
  it("detects and normalizes unexpected public privileges", async () => {
    await owner.query(`GRANT SELECT ON production_operation_policy TO PUBLIC`);
    expect((await owner.query(`SELECT ${redirect(buildProductionOperationsRuntimeAclViolationSql(role))} invalid`)).rows[0].invalid).toBe(true);
    await owner.query(redirect(buildProductionOperationsRuntimeAclSql(role)));
    expect((await owner.query(`SELECT ${redirect(buildProductionOperationsRuntimeAclViolationSql(role))} invalid`)).rows[0].invalid).toBe(false);
  });
});
