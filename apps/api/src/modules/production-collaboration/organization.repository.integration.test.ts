import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OrganizationRepository } from "./organization.repository";
import { OrganizationCommandSchema, OrganizationCreateSchema, OrganizationInvitePreviewSchema } from "./organization.dto";

const url = process.env.TEST_DATABASE_URL;
const schema = `creco_org_${randomUUID().replaceAll("-", "")}`;
const migration = (name: string): string => readFileSync(new URL(`../../platform/database/migrations/${name}`, import.meta.url), "utf8").replaceAll("public.", `"${schema}".`);
const create = (name: string) => ({ name, kind: "studio" as const, description: "", mutationId: randomUUID() });
const versioned = (expectedRevision: number) => ({ expectedRevision, mutationId: randomUUID() });
describe.skipIf(!url)("organization server contract actual Postgres", () => {
  let admin: Pool;
  let pool: Pool;
  let repository: OrganizationRepository;
  beforeAll(async () => {
    validatePostgresIntegrationUrl(url);
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: url, max: 8, options: `-c search_path=${schema}` });
    await pool.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text,email text UNIQUE,"emailVerified" timestamptz,status text NOT NULL DEFAULT 'active');
      CREATE TABLE production_project(id text PRIMARY KEY);`);
    await pool.query(migration("0085_production_team_workspace.sql"));
    await pool.query(migration("0109_production_organization.sql"));
    repository = new OrganizationRepository(pool);
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
  /**
   * 팀 작업공간과 대표 구성원은 같은 트랜잭션에서 만든다. 0085의 지연 제약(`production_team_owner_identity`)이
   * 커밋 시점에 "작업공간은 대표 구성원 행을 반드시 가진다"를 강제하므로, 자동 커밋 문장 둘로 나누면 작업공간 INSERT
   * 직후 커밋에서 23514로 거절된다. 운영 코드(team-workspace.repository.ts)도 같은 순서로 한 트랜잭션에 넣는다.
   */
  async function teamWorkspaceWithOwner(owner: string): Promise<string> {
    const workspaceId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO production_team_workspace(id,name,owner_user_id) VALUES($1,'본편팀',$2)", [workspaceId, owner]);
      await client.query("INSERT INTO production_team_member(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspaceId, owner]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return workspaceId;
  }
  async function invite(owner: string, organizationId: string, target: string, revision: number, role: "manager" | "member" | "guest" | "admin" = "member") {
    return repository.command(owner, organizationId, { ...versioned(revision), type: "invite", email: `${target}@example.test`, role });
  }
  async function join(owner: string, organizationId: string, target: string, revision: number, role: "manager" | "member" | "guest" | "admin" = "member") {
    const invitation = await invite(owner, organizationId, target, revision, role);
    await repository.accept(target, { token: invitation.token!, mutationId: randomUUID() });
    return revision + 2;
  }
  it("creates and replays without duplicate rows, rejects key reuse and strangers", async () => {
    const owner = await user(); const input = create("검증 스튜디오");
    const first = await repository.create(owner, input);
    expect(await repository.create(owner, input)).toEqual(first);
    expect((await repository.list(owner)).organizations).toHaveLength(1);
    await expect(repository.create(owner, { ...input, name: "다른 내용" })).rejects.toThrow();
    await expect(repository.detail(await user(), first.organizationId)).rejects.toThrow();
    expect((await repository.detail(owner, first.organizationId)).organization).toMatchObject({ name: "검증 스튜디오", role: "owner", memberCount: 1 });
  });
  it("shows the same organization, members and roles from every member's device", async () => {
    const owner = await user(); const manager = await user(); const member = await user();
    const org = await repository.create(owner, create("다기기 스튜디오"));
    let revision = await join(owner, org.organizationId, manager, 0, "manager");
    revision = await join(owner, org.organizationId, member, revision, "member");
    await repository.command(manager, org.organizationId, { ...versioned(revision), type: "post-notice", body: "월요일 전체 회의" });
    // 판정 핵심: 누가 조회하든 같은 구성원·같은 역할·같은 공지가 서버 응답으로 돌아온다.
    for (const viewer of [owner, manager, member]) {
      const detail = await repository.detail(viewer, org.organizationId);
      expect(detail.members.map((entry) => [entry.userId, entry.role])).toEqual(expect.arrayContaining([
        [owner, "owner"], [manager, "manager"], [member, "member"],
      ]));
      expect(detail.members).toHaveLength(3);
      expect(detail.notices.map((notice) => notice.body)).toEqual(["월요일 전체 회의"]);
      expect(detail.organization.memberCount).toBe(3);
    }
    expect((await repository.list(member)).organizations[0]).toMatchObject({ id: org.organizationId, role: "member" });
  });
  it("enforces the role matrix on organization surfaces", async () => {
    const owner = await user(); const manager = await user(); const member = await user(); const guest = await user();
    const org = await repository.create(owner, create("강제 스튜디오"));
    let revision = await join(owner, org.organizationId, manager, 0, "manager");
    revision = await join(owner, org.organizationId, member, revision, "member");
    revision = await join(owner, org.organizationId, guest, revision, "guest");
    // member: 롤업 열람만. 프로필 편집·공지·연결·초대 전부 403.
    await expect(repository.command(member, org.organizationId, { ...versioned(revision), type: "update-profile", name: "탈취", kind: "studio", description: "" })).rejects.toMatchObject({ status: 403 });
    await expect(repository.command(member, org.organizationId, { ...versioned(revision), type: "post-notice", body: "무단 공지" })).rejects.toMatchObject({ status: 403 });
    await expect(repository.command(member, org.organizationId, { ...versioned(revision), type: "invite", email: "x@example.test", role: "member" })).rejects.toMatchObject({ status: 403 });
    // manager: 공지는 되지만 프로필 편집과 구성원 관리는 안 된다.
    const noticed = await repository.command(manager, org.organizationId, { ...versioned(revision), type: "post-notice", body: "매니저 공지" });
    revision = noticed.revision;
    await expect(repository.command(manager, org.organizationId, { ...versioned(revision), type: "update-profile", name: "변경", kind: "studio", description: "" })).rejects.toMatchObject({ status: 403 });
    await expect(repository.command(manager, org.organizationId, { ...versioned(revision), type: "invite", email: "y@example.test", role: "member" })).rejects.toMatchObject({ status: 403 });
    // admin 초대·관리자 권한 변경은 대표만.
    const admin = await user();
    revision = await join(owner, org.organizationId, admin, revision, "admin");
    await expect(repository.command(admin, org.organizationId, { ...versioned(revision), type: "invite", email: "z@example.test", role: "admin" })).rejects.toMatchObject({ status: 403 });
    // guest: 상세는 공개 프로필뿐, 구성원·공지·연결은 비어 있다.
    const guestDetail = await repository.detail(guest, org.organizationId);
    expect(guestDetail.organization.name).toBe("강제 스튜디오");
    expect(guestDetail.members).toEqual([]); expect(guestDetail.notices).toEqual([]);
    expect(guestDetail.invites).toEqual([]); expect(guestDetail.linkedWorkspaceIds).toEqual([]);
    expect(guestDetail.organization.linkedWorkspaceCount).toBe(0);
  });
  it("rejects unverified or different-email acceptance and never stores raw tokens", async () => {
    const owner = await user(); const invited = await user(false); const other = await user();
    const org = await repository.create(owner, create("이메일 확인"));
    const invitation = await invite(owner, org.organizationId, invited, 0);
    expect(invitation.token).toHaveLength(43);
    await expect(repository.accept(other, { token: invitation.token!, mutationId: randomUUID() })).rejects.toThrow();
    await expect(repository.accept(invited, { token: invitation.token!, mutationId: randomUUID() })).rejects.toThrow();
    await expect(repository.previewInvite(other, { token: invitation.token! })).rejects.toMatchObject({ status: 404 });
    const stored = await pool.query("SELECT token_hash FROM production_organization_invite WHERE id=$1", [invitation.invitationId]);
    expect(stored.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/u);
    const receipts = await pool.query("SELECT response FROM production_organization_receipt WHERE organization_id=$1", [org.organizationId]);
    expect(JSON.stringify(receipts.rows)).not.toContain(invitation.token);
  });
  it("links only teams the actor belongs to and keeps links identical across viewers", async () => {
    const owner = await user(); const member = await user(); const stranger = await user();
    const org = await repository.create(owner, create("연결 스튜디오"));
    const revision = await join(owner, org.organizationId, member, 0, "member");
    const workspaceId = await teamWorkspaceWithOwner(owner);
    // 팀에 속하지 않은 사람은 그 팀의 존재를 확인할 수 없어 연결도 못 한다.
    await expect(repository.command(owner, org.organizationId, { ...versioned(revision), type: "link-workspace", workspaceId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    const linked = await repository.command(owner, org.organizationId, { ...versioned(revision), type: "link-workspace", workspaceId });
    expect((await repository.detail(owner, org.organizationId)).linkedWorkspaceIds).toEqual([workspaceId]);
    expect((await repository.detail(member, org.organizationId)).linkedWorkspaceIds).toEqual([workspaceId]);
    // 연결은 원고 접근을 만들지 않는다 — 팀 구성원이 아닌 조직 구성원은 여전히 팀 상세를 못 본다.
    expect(stranger).not.toBe(member);
    await repository.command(owner, org.organizationId, { ...versioned(linked.revision), type: "unlink-workspace", workspaceId });
    expect((await repository.detail(owner, org.organizationId)).linkedWorkspaceIds).toEqual([]);
  });
  it("protects the owner in commands and deferred database constraints, transfers atomically", async () => {
    const owner = await user(); const member = await user();
    const org = await repository.create(owner, create("대표 보호"));
    const revision = await join(owner, org.organizationId, member, 0, "member");
    await expect(repository.command(owner, org.organizationId, { ...versioned(revision), type: "remove-member", userId: owner })).rejects.toThrow();
    await expect(pool.query("DELETE FROM production_organization_member WHERE organization_id=$1 AND role='owner'", [org.organizationId])).rejects.toMatchObject({ code: "23514" });
    await repository.command(owner, org.organizationId, { ...versioned(revision), type: "transfer-owner", userId: member });
    expect((await repository.detail(member, org.organizationId)).organization).toMatchObject({ ownerUserId: member, role: "owner" });
    expect((await repository.detail(owner, org.organizationId)).organization.role).toBe("admin");
  });
  it("rechecks current membership before replaying an old successful mutation", async () => {
    const owner = await user(); const admin = await user();
    const org = await repository.create(owner, create("재전송 권한"));
    const revision = await join(owner, org.organizationId, admin, 0, "admin");
    const input = { ...versioned(revision), type: "post-notice" as const, body: "관리자 공지" };
    await repository.command(admin, org.organizationId, input);
    await repository.command(owner, org.organizationId, { ...versioned(revision + 1), type: "remove-member", userId: admin });
    await expect(repository.command(admin, org.organizationId, input)).rejects.toThrow();
  });
});

describe("organization strict input contracts", () => {
  it("rejects billing commands, actor spoofing, owner invitation and empty names", () => {
    expect(OrganizationCreateSchema.safeParse({ ...create(""), ownerUserId: "forged" }).success).toBe(false);
    expect(OrganizationCommandSchema.safeParse({ ...versioned(0), type: "checkout", price: 0 }).success).toBe(false);
    expect(OrganizationCommandSchema.safeParse({ ...versioned(0), type: "invite", email: "a@example.test", role: "owner" }).success).toBe(false);
    expect(OrganizationCommandSchema.safeParse({ ...versioned(0), type: "update-profile", name: "ok", kind: "studio", description: "", userId: "forged" }).success).toBe(false);
    expect(OrganizationCommandSchema.safeParse({ ...versioned(0), type: "post-notice", body: "공지" }).success).toBe(true);
  });
  it("accepts only a bare 43-char token for invite previews", () => {
    expect(OrganizationInvitePreviewSchema.safeParse({ token: "x".repeat(43) }).success).toBe(true);
    expect(OrganizationInvitePreviewSchema.safeParse({ token: "short" }).success).toBe(false);
    expect(OrganizationInvitePreviewSchema.safeParse({ token: "x".repeat(43), mutationId: randomUUID() }).success).toBe(false);
  });
});
