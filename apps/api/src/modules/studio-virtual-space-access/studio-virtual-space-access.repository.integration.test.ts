import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TeamWorkspaceRepository } from "../production-collaboration/team-workspace.repository";
import { StudioVirtualSpaceAccessRepository } from "./studio-virtual-space-access.repository";

const url = process.env.TEST_DATABASE_URL;
const schema = `creco_free_${randomUUID().replaceAll("-", "")}`;
const migration = (name: string): string => readFileSync(new URL(`../../platform/database/migrations/${name}`, import.meta.url), "utf8").replaceAll("public.", `"${schema}".`);

describe.skipIf(!url)("virtual space access actual Postgres", () => {
  let admin: Pool;
  let pool: Pool;
  let workspaces: TeamWorkspaceRepository;
  let access: StudioVirtualSpaceAccessRepository;
  let ownerId: string;
  let managerId: string;
  let strangerId: string;
  let workspaceId: string;
  let projectId: string;

  async function user(): Promise<string> {
    const id = randomUUID();
    await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,$4)`,
      [id, `Tester ${id.slice(0, 4)}`, `${id}@example.test`, new Date()]);
    return id;
  }

  async function inviteToken(email: string): Promise<string> {
    const detail = await workspaces.detail(ownerId, workspaceId);
    const result = await workspaces.command(ownerId, workspaceId, {
      type: "invite", email, role: "guest",
      expectedRevision: detail.workspace.revision, mutationId: randomUUID(),
    });
    if (!result.token) throw new Error("invite token missing");
    return result.token;
  }

  beforeAll(async () => {
    validatePostgresIntegrationUrl(url);
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: url, max: 8, options: `-c search_path=${schema}` });
    await pool.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text,email text UNIQUE,"emailVerified" timestamptz,status text NOT NULL DEFAULT 'active');
      CREATE TABLE creator_work(id text PRIMARY KEY,"userId" text NOT NULL REFERENCES "user"(id),title text NOT NULL);
      CREATE TABLE creator_work_collaborator("workId" text REFERENCES creator_work(id),"userId" text REFERENCES "user"(id),role text,status text,PRIMARY KEY("workId","userId"));`);
    await pool.query(migration("0053_production_collaboration_core.sql").replaceAll("public.", `"${schema}".`));
    await pool.query(migration("0084_production_model_v2_compatibility.sql"));
    await pool.query(migration("0085_production_team_workspace.sql"));
    await pool.query(migration("0086_production_operation_policy.sql"));
    await pool.query(migration("0103_studio_virtual_space_entry_code.sql"));
    workspaces = new TeamWorkspaceRepository(pool);
    access = new StudioVirtualSpaceAccessRepository(pool);

    ownerId = await user();
    managerId = await user();
    strangerId = await user();
    const created = await workspaces.create(ownerId, { name: "스튜디오", mutationId: randomUUID() });
    workspaceId = created.workspaceId;
    projectId = randomUUID();
    const workId = randomUUID();
    await pool.query(`INSERT INTO creator_work(id,"userId",title) VALUES($1,$2,'작품')`, [workId, ownerId]);
    const aggregate = { modelVersion: 2, projectId, workId, revision: 0, parties: [], assignments: [], auditEvents: [] };
    await pool.query(`INSERT INTO production_project(id,"workId",title,"collaborationModel","modelVersion",revision,aggregate)
      VALUES($1,$2,'프로젝트','solo',2,0,$3::jsonb)`, [projectId, workId, JSON.stringify(aggregate)]);
    const detail = await workspaces.detail(ownerId, workspaceId);
    await workspaces.command(ownerId, workspaceId, {
      type: "attach-project", projectId,
      expectedRevision: detail.workspace.revision, mutationId: randomUUID(),
    });
    // managerId를 워크스페이스 admin 구성원으로 직접 심는다(수락 흐름은 team 테스트가 담당).
    await pool.query(`INSERT INTO production_team_member(workspace_id,user_id,role) VALUES($1,$2,'admin')`, [workspaceId, managerId]);
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
  });

  it("발급된 초대 토큰은 프로젝트 공간 문맥에서 검증되고 소모되지 않는다", async () => {
    const token = await inviteToken(`guest-${randomUUID()}@example.test`);
    const first = await access.verifyInvite({ token, context: { kind: "project-space", projectId } });
    expect(first).toMatchObject({ valid: true, workspaceId, role: "guest" });
    const second = await access.verifyInvite({ token, context: { kind: "project-space", projectId } });
    expect(second.valid).toBe(true);
    const row = (await pool.query(`SELECT accepted_at FROM production_team_invite WHERE workspace_id=$1 AND accepted_at IS NOT NULL`, [workspaceId])).rowCount;
    expect(row).toBe(0);
  });

  it("없는 토큰·공간 불일치·만료·회수·소모된 토큰을 사유와 함께 거른다", async () => {
    const missing = await access.verifyInvite({ token: "A".repeat(43), context: { kind: "team-lobby" } });
    expect(missing).toEqual({ valid: false, reason: "not-found" });

    const token = await inviteToken(`guest-${randomUUID()}@example.test`);
    const mismatch = await access.verifyInvite({ token, context: { kind: "project-space", projectId: randomUUID() } });
    expect(mismatch).toEqual({ valid: false, reason: "space-mismatch" });

    const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

    const expiredToken = await inviteToken(`guest-${randomUUID()}@example.test`);
    await pool.query(`UPDATE production_team_invite SET expires_at = now() - interval '1 hour' WHERE token_hash=$1`, [tokenHash(expiredToken)]);
    const expired = await access.verifyInvite({ token: expiredToken, context: { kind: "team-lobby" } });
    expect(expired).toEqual({ valid: false, reason: "expired" });

    const revokedToken = await inviteToken(`guest-${randomUUID()}@example.test`);
    await pool.query(`UPDATE production_team_invite SET revoked_at = now() WHERE token_hash=$1`, [tokenHash(revokedToken)]);
    const revoked = await access.verifyInvite({ token: revokedToken, context: { kind: "team-lobby" } });
    expect(revoked).toEqual({ valid: false, reason: "revoked" });

    const consumedToken = await inviteToken(`guest-${randomUUID()}@example.test`);
    await pool.query(`UPDATE production_team_invite SET accepted_at = now() WHERE token_hash=$1`, [tokenHash(consumedToken)]);
    const consumed = await access.verifyInvite({ token: consumedToken, context: { kind: "team-lobby" } });
    expect(consumed).toEqual({ valid: false, reason: "consumed" });
  });

  it("입장코드를 발급하면 해시만 남고 검증이 통과한다", async () => {
    const issued = await access.issueEntryCode(ownerId, { spaceId: projectId, spaceName: "본관" });
    expect(issued.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const stored = (await pool.query<{ codeHash: string }>(
      `SELECT "codeHash" FROM "studio_virtual_space_entry_code" WHERE "id"=$1`, [issued.id])).rows[0];
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(issued.code);
    const verified = await access.verifyEntryCode({ spaceId: projectId, code: issued.code.toLowerCase() });
    expect(verified).toMatchObject({ valid: true, spaceId: projectId, spaceName: "본관" });
  });

  it("프로젝트 공간의 코드 발급은 소유자·관리자만 할 수 있다", async () => {
    await expect(access.issueEntryCode(strangerId, { spaceId: projectId }))
      .rejects.toThrowError(/권한/);
    const byManager = await access.issueEntryCode(managerId, { spaceId: projectId });
    expect(byManager.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    // 제작 프로젝트가 아닌 공간 식별자는 로그인 사용자의 발급자 귀속으로 허용한다.
    const personal = await access.issueEntryCode(strangerId, { spaceId: "virtual-demo:personal-home" });
    expect(personal.spaceId).toBe("virtual-demo:personal-home");
  });

  it("틀린 코드를 반복하면 잠기고, 회수한 코드는 회수 사유로 막힌다", async () => {
    const spaceId = `space-${randomUUID()}`;
    const issued = await access.issueEntryCode(ownerId, { spaceId });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failed = await access.verifyEntryCode({ spaceId, code: "ZZZ999" });
      expect(failed).toMatchObject({ valid: false, reason: "not-found" });
    }
    const locked = await access.verifyEntryCode({ spaceId, code: "ZZZ999" });
    expect(locked).toMatchObject({ valid: false, reason: "locked" });
    const duringLock = await access.verifyEntryCode({ spaceId, code: issued.code });
    expect(duringLock).toMatchObject({ valid: false, reason: "locked" });

    const otherSpace = `space-${randomUUID()}`;
    const second = await access.issueEntryCode(ownerId, { spaceId: otherSpace });
    await access.revokeEntryCode(ownerId, second.id);
    const revoked = await access.verifyEntryCode({ spaceId: otherSpace, code: second.code });
    expect(revoked).toEqual({ valid: false, reason: "revoked", attemptsRemaining: 4 });
    await expect(access.revokeEntryCode(strangerId, second.id)).rejects.toThrowError(/권한/);
  });

  it("만료된 코드는 만료 사유로 막힌다", async () => {
    const spaceId = `space-${randomUUID()}`;
    const issued = await access.issueEntryCode(ownerId, { spaceId, ttlDays: 1 });
    await pool.query(`UPDATE "studio_virtual_space_entry_code" SET "expiresAt" = now() - interval '1 minute' WHERE "id"=$1`, [issued.id]);
    const expired = await access.verifyEntryCode({ spaceId, code: issued.code });
    expect(expired).toEqual({ valid: false, reason: "expired", attemptsRemaining: 4 });
  });
});
