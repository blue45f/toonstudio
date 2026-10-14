import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TeamWorkspaceRepository } from "./team-workspace.repository";
import { WorkspaceCommandSchema, WorkspaceCreateSchema, WorkspaceInvitePreviewSchema } from "./team-workspace.dto";

const url = process.env.TEST_DATABASE_URL;
const schema = `creco_free_${randomUUID().replaceAll("-", "")}`;
const migration = (name: string): string => readFileSync(new URL(`../../platform/database/migrations/${name}`, import.meta.url), "utf8").replaceAll("public.", `"${schema}".`);
const create = (name: string) => ({ name, mutationId: randomUUID() });
const versioned = (expectedRevision: number) => ({ expectedRevision, mutationId: randomUUID() });
describe.skipIf(!url)("free team workspace actual Postgres", () => {
  let admin: Pool;
  let pool: Pool;
  let repository: TeamWorkspaceRepository;
  beforeAll(async () => {
    validatePostgresIntegrationUrl(url);
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: url, max: 8, options: `-c search_path=${schema}` });
    await pool.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text,email text UNIQUE,"emailVerified" timestamptz,status text NOT NULL DEFAULT 'active');
      CREATE TABLE creator_work(id text PRIMARY KEY,"userId" text NOT NULL REFERENCES "user"(id),title text NOT NULL);
      CREATE TABLE creator_work_collaborator("workId" text REFERENCES creator_work(id),"userId" text REFERENCES "user"(id),role text,status text,"invitationId" text,"invitedBy" text,"respondedAt" timestamptz,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),PRIMARY KEY("workId","userId"));`);
    await pool.query(migration("0053_production_collaboration_core.sql").replaceAll("public.", `"${schema}".`));
    await pool.query(migration("0084_production_model_v2_compatibility.sql"));
    await pool.query(migration("0085_production_team_workspace.sql"));
    await pool.query(migration("0086_production_operation_policy.sql"));
    await pool.query(migration("0109_production_team_audit_read.sql"));
    repository = new TeamWorkspaceRepository(pool);
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
  });
  async function user(verified = true): Promise<string> {
    const id = randomUUID();
    await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,$4)`, [id, `Tester ${id.slice(0, 4)}`, `${id}@example.test`, verified ? new Date() : null]);
    return id;
  }
  async function invite(owner: string, workspaceId: string, target: string, revision: number, role: "member" | "admin" | "guest" = "member") {
    return repository.command(owner, workspaceId, { ...versioned(revision), type: "invite", email: `${target}@example.test`, role });
  }
  it("creates and replays without duplicate rows, rejects key reuse and strangers", async () => {
    const owner = await user(); const input = create("검증 팀");
    const first = await repository.create(owner, input);
    expect(await repository.create(owner, input)).toEqual(first);
    expect((await repository.list(owner)).workspaces).toHaveLength(1);
    await expect(repository.create(owner, { ...input, name: "다른 내용" })).rejects.toThrow();
    await expect(repository.detail(await user(), first.workspaceId)).rejects.toThrow();
    expect((await repository.detail(owner, first.workspaceId)).workspace.role).toBe("owner");
  });
  it("atomically admits only two owned workspaces under concurrent requests", async () => {
    const owner = await user();
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => repository.create(owner, create(`경쟁 ${index}`))));
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(2);
    expect((await repository.list(owner)).workspaces).toHaveLength(2);
  });
  it("rejects unverified or different-email invite acceptance", async () => {
    const owner = await user(); const invited = await user(false); const other = await user();
    const workspace = await repository.create(owner, create("이메일 확인"));
    const invitation = await invite(owner, workspace.workspaceId, invited, 0);
    expect(invitation.token).toHaveLength(43);
    await expect(repository.accept(other, { token: invitation.token!, mutationId: randomUUID() })).rejects.toThrow();
    await expect(repository.accept(invited, { token: invitation.token!, mutationId: randomUUID() })).rejects.toThrow();
  });
  it("reserves pending invites, swaps acceptance without double counting and never stores raw tokens", async () => {
    const owner = await user(); const workspace = await repository.create(owner, create("정원 팀"));
    const people = await Promise.all(Array.from({ length: 10 }, () => user()));
    let firstToken = ""; let firstId = "";
    for (let index = 0; index < 9; index += 1) {
      const invitation = await invite(owner, workspace.workspaceId, people[index], index);
      if (index === 0) { firstToken = invitation.token!; firstId = invitation.invitationId!; }
    }
    const usage = await repository.usage(owner, workspace.workspaceId);
    expect(usage.counters).toMatchObject({ members: 1, pendingInvites: 9 });
    expect(usage.originalStorage.usedBytes).toBeNull();
    await expect(invite(owner, workspace.workspaceId, people[9], 9)).rejects.toMatchObject({ status: 429 });
    const acceptInput = { token: firstToken, mutationId: randomUUID() };
    const accepted = await repository.accept(people[0], acceptInput);
    expect(await repository.accept(people[0], acceptInput)).toEqual(accepted);
    expect((await repository.usage(owner, workspace.workspaceId)).counters).toMatchObject({ members: 2, pendingInvites: 8 });
    const stored = await pool.query("SELECT response FROM production_team_receipt WHERE workspace_id=$1", [workspace.workspaceId]);
    expect(JSON.stringify(stored.rows)).not.toContain(firstToken);
    expect((await pool.query("SELECT token_hash FROM production_team_invite WHERE id=$1", [firstId])).rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/u);
  });
  it("previews an invite only for the invited verified email and never consumes it", async () => {
    const owner = await user(); const invited = await user(); const other = await user(); const unverified = await user(false);
    const workspace = await repository.create(owner, create("미리보기 팀"));
    const invitation = await invite(owner, workspace.workspaceId, invited, 0, "admin");
    // 초대받은 본인만 이름·역할·초대자를 수락 전에 볼 수 있다.
    const preview = await repository.previewInvite(invited, { token: invitation.token! });
    expect(preview).toMatchObject({ workspaceId: workspace.workspaceId, workspaceName: "미리보기 팀", role: "admin", alreadyAccepted: false, alreadyMember: false });
    expect(preview.inviterName).toContain("Tester");
    expect(preview.expiresAt).toBeTruthy();
    // 다른 사람·미인증 계정·남의 토큰 조합은 초대의 존재를 흘리지 않는 같은 오류로 막힌다.
    await expect(repository.previewInvite(other, { token: invitation.token! })).rejects.toMatchObject({ status: 404 });
    await expect(repository.previewInvite(unverified, { token: invitation.token! })).rejects.toThrow();
    await expect(repository.previewInvite(invited, { token: "x".repeat(43) })).rejects.toMatchObject({ status: 404 });
    // 미리보기는 읽기 전용이다 — 수락이 그대로 가능하고, 수락 뒤에는 합류 상태가 보인다.
    await repository.accept(invited, { token: invitation.token!, mutationId: randomUUID() });
    const after = await repository.previewInvite(invited, { token: invitation.token! });
    expect(after).toMatchObject({ alreadyAccepted: true, alreadyMember: true });
    // 취소된 초대는 미리보기에서도 사라진다.
    const second = await invite(owner, workspace.workspaceId, other, 2, "guest");
    await repository.command(owner, workspace.workspaceId, { ...versioned(3), type: "revoke-invite", invitationId: second.invitationId! });
    await expect(repository.previewInvite(other, { token: second.token! })).rejects.toMatchObject({ status: 404 });
  });
  it("invalidates old tokens on reissue and rejects revoked tokens", async () => {
    const owner = await user(); const target = await user(); const workspace = await repository.create(owner, create("초대 회수"));
    const old = await invite(owner, workspace.workspaceId, target, 0);
    const fresh = await invite(owner, workspace.workspaceId, target, 1);
    await expect(repository.accept(target, { token: old.token!, mutationId: randomUUID() })).rejects.toThrow();
    expect((await repository.usage(owner, workspace.workspaceId)).counters.pendingInvites).toBe(1);
    await repository.command(owner, workspace.workspaceId, { ...versioned(2), type: "revoke-invite", invitationId: fresh.invitationId! });
    await expect(repository.accept(target, { token: fresh.token!, mutationId: randomUUID() })).rejects.toThrow();
  });
  it("has one successful concurrent rename and forbids non-manager mutations", async () => {
    const owner = await user(); const member = await user(); const workspace = await repository.create(owner, create("변경 경쟁"));
    const invitation = await invite(owner, workspace.workspaceId, member, 0);
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    await expect(repository.command(member, workspace.workspaceId, { ...versioned(2), type: "rename", name: "승격 시도" })).rejects.toMatchObject({ status: 403 });
    const results = await Promise.allSettled(["변경 A", "변경 B"].map((name) => repository.command(owner, workspace.workspaceId, { ...versioned(2), type: "rename", name })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });
  it("protects the last owner in both commands and deferred database constraints", async () => {
    const owner = await user(); const workspace = await repository.create(owner, create("소유자 보호"));
    await expect(repository.command(owner, workspace.workspaceId, { ...versioned(0), type: "remove-member", userId: owner })).rejects.toThrow();
    await expect(pool.query("DELETE FROM production_team_member WHERE workspace_id=$1", [workspace.workspaceId])).rejects.toMatchObject({ code: "23514" });
    expect((await repository.detail(owner, workspace.workspaceId)).workspace.memberCount).toBe(1);
  });
  it("transfers owner atomically without changing work ownership", async () => {
    const owner = await user(); const member = await user(); const workspace = await repository.create(owner, create("소유권 이전"));
    const invitation = await invite(owner, workspace.workspaceId, member, 0);
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    await repository.command(owner, workspace.workspaceId, { ...versioned(2), type: "transfer-owner", userId: member });
    expect((await repository.detail(member, workspace.workspaceId)).workspace).toMatchObject({ ownerUserId: member, role: "owner" });
    expect((await repository.detail(owner, workspace.workspaceId)).workspace.role).toBe("admin");
    await expect(repository.command(owner, workspace.workspaceId, { ...versioned(3), type: "remove-member", userId: member })).rejects.toThrow();
  });
  it("rechecks current membership before replaying an old successful mutation", async () => {
    const owner = await user(); const member = await user(); const workspace = await repository.create(owner, create("재전송 권한"));
    const invitation = await invite(owner, workspace.workspaceId, member, 0, "admin");
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    const input = { ...versioned(2), type: "rename" as const, name: "변경됨" };
    await repository.command(member, workspace.workspaceId, input);
    await repository.command(owner, workspace.workspaceId, { ...versioned(3), type: "remove-member", userId: member });
    await expect(repository.command(member, workspace.workspaceId, input)).rejects.toThrow();
  });
  async function project(owner: string, modelVersion = 2): Promise<string> {
    const workId = randomUUID(); const id = randomUUID();
    await pool.query('INSERT INTO creator_work(id,"userId",title) VALUES($1,$2,$3)', [workId, owner, "비공개 작품"]);
    const aggregate = { modelVersion, projectId: id, workId, revision: 0, parties: [], assignments: [], auditEvents: [] };
    await pool.query(`INSERT INTO production_project(id,"workId",title,"collaborationModel","modelVersion",revision,aggregate)
      VALUES($1,$2,$3,'solo',$4,0,$5::jsonb)`, [id, workId, "비공개 작품", modelVersion, JSON.stringify(aggregate)]);
    return id;
  }
  it("transfers work ownership to a team member with audit, and only for the work owner", async () => {
    const owner = await user(); const member = await user(); const outsider = await user();
    const workspace = await repository.create(owner, create("작품 소유권 이전"));
    const invitation = await invite(owner, workspace.workspaceId, member, 0);
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    const projectId = await project(owner);
    await repository.command(owner, workspace.workspaceId, { ...versioned(2), type: "attach-project", projectId });
    const workId = (await pool.query('SELECT "workId" FROM production_project WHERE id=$1', [projectId])).rows[0].workId as string;
    // 작품 소유자가 아닌 구성원의 이전 시도와, 팀 구성원이 아닌 받는 사람은 서버가 막는다.
    await expect(repository.command(member, workspace.workspaceId, { ...versioned(3), type: "transfer-work-owner", projectId, userId: owner })).rejects.toMatchObject({ status: 403 });
    await expect(repository.command(owner, workspace.workspaceId, { ...versioned(3), type: "transfer-work-owner", projectId, userId: outsider })).rejects.toMatchObject({ status: 404 });
    const input = { ...versioned(3), type: "transfer-work-owner" as const, projectId, userId: member };
    const result = await repository.command(owner, workspace.workspaceId, input);
    // 같은 mutation의 재전송은 소유권을 다시 옮기지 않고 같은 결과를 돌려준다.
    expect(await repository.command(owner, workspace.workspaceId, input)).toEqual(result);
    expect((await pool.query('SELECT "userId" FROM creator_work WHERE id=$1', [workId])).rows[0].userId).toBe(member);
    // 이전한 소유자는 관리자 협업자로 남고, 감사 기록에는 작품이 대상으로 남는다.
    expect((await pool.query('SELECT role,status FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2', [workId, owner])).rows[0]).toMatchObject({ role: "admin", status: "active" });
    expect((await pool.query("SELECT target_id FROM production_team_audit WHERE workspace_id=$1 AND action='workspace.transfer-work-owner'", [workspace.workspaceId])).rows[0]).toMatchObject({ target_id: workId });
    expect((await repository.detail(member, workspace.workspaceId)).projects[0]).toMatchObject({ id: projectId, ownerUserId: member });
    expect((await repository.detail(owner, workspace.workspaceId)).projects[0]).toMatchObject({ ownerUserId: member });
  });
  it("accepts v1 and v2 records, upgrades metadata with content, rejects unknown versions", async () => {
    const owner = await user(); const legacy = await project(owner, 1); const current = await project(owner, 2);
    expect((await pool.query('SELECT "modelVersion" FROM production_project WHERE id=$1', [current])).rows[0].modelVersion).toBe(2);
    await pool.query(`UPDATE production_project SET "modelVersion"=2,aggregate=jsonb_set(aggregate,'{modelVersion}','2') WHERE id=$1`, [legacy]);
    await expect(project(owner, 3)).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query('UPDATE production_project SET "modelVersion"=1 WHERE id=$1', [current])).rejects.toMatchObject({ code: "23514" });
  });
  it("links only owned projects and does not leak titles or grant work access to team members", async () => {
    const owner = await user(); const member = await user(); const stranger = await user();
    const workspace = await repository.create(owner, create("작품 권한"));
    const projectId = await project(owner);
    await repository.command(owner, workspace.workspaceId, { ...versioned(0), type: "attach-project", projectId });
    await expect(repository.command(owner, workspace.workspaceId, { ...versioned(1), type: "attach-project", projectId: await project(stranger) })).rejects.toThrow();
    const invitation = await invite(owner, workspace.workspaceId, member, 1);
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    expect((await repository.detail(owner, workspace.workspaceId)).projects).toHaveLength(1);
    const hidden = await repository.detail(member, workspace.workspaceId);
    expect(hidden.projects).toEqual([]); expect(hidden.workspace.projectCount).toBe(0);
    const work = (await pool.query('SELECT "workId" FROM production_project WHERE id=$1', [projectId])).rows[0].workId;
    await pool.query(`INSERT INTO creator_work_collaborator("workId","userId",role,status) VALUES($1,$2,'viewer','active')`, [work, member]);
    expect((await repository.detail(member, workspace.workspaceId)).projects).toHaveLength(1);
    const second = await repository.create(owner, create("다른 팀"));
    await expect(repository.command(owner, second.workspaceId, { ...versioned(0), type: "attach-project", projectId })).rejects.toThrow();
    await repository.command(owner, workspace.workspaceId, { ...versioned(3), type: "detach-project", projectId });
    expect((await pool.query("SELECT id FROM production_project WHERE id=$1", [projectId])).rowCount).toBe(1);
  });
  it("hides invite identities from members and stops suspended accounts", async () => {
    const owner = await user(); const member = await user(); const workspace = await repository.create(owner, create("노출 방지"));
    const invitation = await invite(owner, workspace.workspaceId, member, 0, "guest");
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    const guest = await repository.detail(member, workspace.workspaceId);
    expect(guest.members).toEqual([]); expect(guest.invites).toEqual([]);
    await expect(repository.usage(member, workspace.workspaceId)).rejects.toMatchObject({ status: 403 });
    await pool.query(`UPDATE "user" SET status='suspended' WHERE id=$1`, [member]);
    await expect(repository.list(member)).rejects.toThrow();
  });
  it("reads back the audit trail for managers only, with actor, action and period filters", async () => {
    const owner = await user(); const member = await user(); const workspace = await repository.create(owner, create("감사 팀"));
    const invitation = await invite(owner, workspace.workspaceId, member, 0);
    await repository.accept(member, { token: invitation.token!, mutationId: randomUUID() });
    await repository.command(owner, workspace.workspaceId, { ...versioned(2), type: "change-member-role", userId: member, role: "guest" });
    // 관리자는 생성·초대·수락·역할 변경이 최신순으로 쌓인 것을 그대로 읽는다.
    const all = await repository.audit(owner, workspace.workspaceId, { limit: 50 });
    expect(all.workspaceId).toBe(workspace.workspaceId);
    expect(all.entries.map((entry) => entry.action)).toEqual([
      "workspace.change-member-role", "workspace.invite-accepted", "workspace.invite", "workspace.created",
    ]);
    expect(all.entries[0]).toMatchObject({ actorUserId: owner, targetId: member, revision: 3 });
    expect(all.entries[0].actorDisplayName).toContain("Tester");
    expect(all.entries[0].targetDisplayName).toContain("Tester");
    expect(all.nextCursor).toBeNull();
    // 행위자·행위 필터
    expect((await repository.audit(owner, workspace.workspaceId, { actorUserId: member, limit: 50 })).entries.map((entry) => entry.action))
      .toEqual(["workspace.invite-accepted"]);
    expect((await repository.audit(owner, workspace.workspaceId, { action: "workspace.invite", limit: 50 })).entries).toHaveLength(1);
    // 기간 필터 [from, to): 과거 구간은 비고, 넉넉한 구간은 전부 잡힌다.
    expect((await repository.audit(owner, workspace.workspaceId, { from: "2000-01-01T00:00:00+09:00", to: "2000-01-02T00:00:00+09:00", limit: 50 })).entries).toHaveLength(0);
    expect((await repository.audit(owner, workspace.workspaceId, { from: "2000-01-01T00:00:00+09:00", limit: 50 })).entries).toHaveLength(4);
    // 키셋 페이지네이션: limit 2면 커서가 이어진다.
    const page1 = await repository.audit(owner, workspace.workspaceId, { limit: 2 });
    expect(page1.entries).toHaveLength(2); expect(page1.nextCursor).not.toBeNull();
    const page2 = await repository.audit(owner, workspace.workspaceId, { limit: 2, cursor: page1.nextCursor! });
    expect(page2.entries).toHaveLength(2); expect(page2.nextCursor).toBeNull();
    expect(page1.entries[1].id).toBeGreaterThan(page2.entries[0].id);
    // 구성원(게스트 포함 비관리자)과 외부인은 감사 로그를 읽을 수 없다.
    await expect(repository.audit(member, workspace.workspaceId, { limit: 50 })).rejects.toMatchObject({ status: 403 });
    await expect(repository.audit(await user(), workspace.workspaceId, { limit: 50 })).rejects.toThrow();
  });
});

describe("workspace strict input contracts", () => {
  it("rejects billing commands, actor spoofing, owner invitation and empty names", () => {
    expect(WorkspaceCreateSchema.safeParse({ ...create(""), ownerUserId: "forged" }).success).toBe(false);
    expect(WorkspaceCommandSchema.safeParse({ ...versioned(0), type: "checkout", price: 0 }).success).toBe(false);
    expect(WorkspaceCommandSchema.safeParse({ ...versioned(0), type: "invite", email: "a@example.test", role: "owner" }).success).toBe(false);
    expect(WorkspaceCommandSchema.safeParse({ ...versioned(0), type: "rename", name: "ok", userId: "forged" }).success).toBe(false);
  });
  it("accepts a work ownership transfer only with a project and a recipient", () => {
    expect(WorkspaceCommandSchema.safeParse({ ...versioned(0), type: "transfer-work-owner", projectId: "project-a", userId: "member-b" }).success).toBe(true);
    expect(WorkspaceCommandSchema.safeParse({ ...versioned(0), type: "transfer-work-owner", projectId: "project-a" }).success).toBe(false);
    // 행위자 위조 필드가 끼면 strict 스키마가 거부한다.
    expect(WorkspaceCommandSchema.safeParse({ ...versioned(0), type: "transfer-work-owner", projectId: "project-a", userId: "member-b", actor: "forged" }).success).toBe(false);
  });
  it("accepts only a bare 43-char token for invite previews", () => {
    expect(WorkspaceInvitePreviewSchema.safeParse({ token: "x".repeat(43) }).success).toBe(true);
    expect(WorkspaceInvitePreviewSchema.safeParse({ token: "short" }).success).toBe(false);
    // 읽기 전용 미리보기에 mutationId 같은 추가 필드는 허용하지 않는다.
    expect(WorkspaceInvitePreviewSchema.safeParse({ token: "x".repeat(43), mutationId: randomUUID() }).success).toBe(false);
  });
});
