import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import {
  ORGANIZATION_FREE_POLICY, isOrganizationManager, organizationRoleCan,
  type InvitableOrganizationRole, type OrganizationAction, type OrganizationDetail,
  type OrganizationInvite, type OrganizationInvitePreview, type OrganizationKind,
  type OrganizationMember, type OrganizationMutationResult, type OrganizationNoticeRecord,
  type OrganizationRole, type OrganizationSummary,
} from "@toonstudio/contracts/production-organization";
import type { OrganizationCommand } from "./organization.dto";
import { PRODUCTION_TEAM_POOL } from "./team-workspace.repository";

interface OrganizationRow {
  id: string; name: string; kind: OrganizationKind; description: string;
  owner_user_id: string; revision: number; created_at: Date; updated_at: Date; role: OrganizationRole;
}
interface ActiveUser { id: string; email: string | null; emailVerified: Date | null }
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
function digest(value: unknown): string {
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical)
    : input !== null && typeof input === "object"
      ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])) : input;
  return hash(JSON.stringify(canonical(value)));
}
function quota(resource: string, current: number, limit: number): never {
  throw new HttpException({ code: "usage_limit_reached", resource, current, limit,
    message: "이용 한도에 도달했습니다. 사용 중인 항목을 정리한 뒤 다시 시도해주세요." }, 429);
}
/** 커맨드 종류 → 조직 표면 액션. 구성원 관리는 매트릭스 밖 규칙이라 null이다. */
function surfaceAction(command: OrganizationCommand): OrganizationAction | null {
  switch (command.type) {
    case "update-profile": return "edit-profile";
    case "link-workspace":
    case "unlink-workspace": return "manage-links";
    case "post-notice":
    case "delete-notice": return "post-notice";
    default: return null;
  }
}

@Injectable()
export class OrganizationRepository {
  constructor(@Inject(PRODUCTION_TEAM_POOL) private readonly pool: Pool) {}
  private async transaction<T>(action: (client: PoolClient) => Promise<T>, write = false): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Shared only by low-frequency organization changes; never manuscript edits.
      if (write) await client.query("SELECT pg_advisory_xact_lock(173205, 1102)");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  private async activeUser(client: PoolClient, actor: string): Promise<ActiveUser> {
    const result = await client.query<ActiveUser>(`SELECT id,email,"emailVerified" FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actor]);
    if (!result.rows[0]) throw new ForbiddenException("유효한 로그인이 필요합니다.");
    return result.rows[0];
  }
  private async access(client: PoolClient, actor: string, organizationId: string, lock = false): Promise<OrganizationRow> {
    const result = await client.query<OrganizationRow>(`SELECT o.*,m.role FROM production_organization o
      JOIN production_organization_member m ON m.organization_id=o.id AND m.user_id=$1 WHERE o.id=$2 ${lock ? "FOR UPDATE OF o FOR SHARE OF m" : "FOR SHARE OF o, m"}`, [actor, organizationId]);
    if (!result.rows[0]) throw new NotFoundException("접근 가능한 조직이 없습니다.");
    return result.rows[0];
  }
  private async summary(client: PoolClient, row: OrganizationRow): Promise<OrganizationSummary> {
    const result = await client.query<{ members: number; pending: number; links: number }>(`SELECT
      (SELECT count(*)::int FROM production_organization_member WHERE organization_id=$1) members,
      (SELECT count(*)::int FROM production_organization_invite WHERE organization_id=$1 AND revoked_at IS NULL
        AND accepted_at IS NULL AND expires_at>now()) pending,
      (SELECT count(*)::int FROM production_organization_link WHERE organization_id=$1) links`, [row.id]);
    const counts = result.rows[0];
    const guest = row.role === "guest";
    return { id: row.id, name: row.name, kind: row.kind, description: row.description,
      ownerUserId: row.owner_user_id, revision: row.revision, role: row.role,
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
      memberCount: counts.members,
      pendingInvites: isOrganizationManager(row.role) ? counts.pending : 0,
      linkedWorkspaceCount: guest ? 0 : counts.links };
  }
  async list(actor: string): Promise<{ organizations: OrganizationSummary[] }> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      const rows = await client.query<OrganizationRow>(`SELECT o.*,m.role FROM production_organization o
        JOIN production_organization_member m ON m.organization_id=o.id AND m.user_id=$1 ORDER BY o.created_at DESC,o.id LIMIT 100`, [actor]);
      const organizations: OrganizationSummary[] = [];
      for (const row of rows.rows) organizations.push(await this.summary(client, row));
      return { organizations };
    });
  }
  async detail(actor: string, organizationId: string): Promise<OrganizationDetail> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      const row = await this.access(client, actor, organizationId);
      // 게스트는 공개 프로필만 본다. 구성원·초대·공지·연결은 롤업 열람 역할부터 연다.
      const canView = organizationRoleCan(row.role, "view-rollup");
      const members = !canView ? [] : (await client.query<OrganizationMember>(`SELECT m.user_id "userId",
        coalesce(u.name,'구성원') "displayName",m.role,to_char(m.joined_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "joinedAt"
        FROM production_organization_member m JOIN "user" u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY m.joined_at,m.user_id`, [organizationId])).rows;
      const invites = !isOrganizationManager(row.role) ? [] : (await client.query<OrganizationInvite>(`SELECT id,email,role,
        to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "expiresAt" FROM production_organization_invite
        WHERE organization_id=$1 AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>now() ORDER BY created_at`, [organizationId])).rows;
      const notices = !canView ? [] : (await client.query<OrganizationNoticeRecord>(`SELECT n.id,n.body,
        coalesce(u.name,'구성원') "authorName",to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "createdAt"
        FROM production_organization_notice n JOIN "user" u ON u.id=n.author_user_id
        WHERE n.organization_id=$1 ORDER BY n.created_at DESC,n.id DESC LIMIT ${ORGANIZATION_FREE_POLICY.noticesPerOrganization}`, [organizationId])).rows;
      const linkedWorkspaceIds = !canView ? [] : (await client.query<{ workspace_id: string }>(
        "SELECT workspace_id FROM production_organization_link WHERE organization_id=$1 ORDER BY linked_at,workspace_id", [organizationId])).rows.map((link) => link.workspace_id);
      return { organization: await this.summary(client, row), members, invites, notices, linkedWorkspaceIds };
    });
  }
  private async receipt(client: PoolClient, actor: string, mutationId: string, input: unknown): Promise<OrganizationMutationResult | null> {
    const receipt = (await client.query<{ request_digest: string; response: OrganizationMutationResult; organization_id: string }>(
      "SELECT request_digest,response,organization_id FROM production_organization_receipt WHERE actor_user_id=$1 AND mutation_id=$2", [actor, mutationId])).rows[0];
    if (!receipt) return null;
    await this.access(client, actor, receipt.organization_id);
    if (receipt.request_digest !== digest(input)) throw new ConflictException({ code: "idempotency_key_reuse", message: "같은 요청 ID의 내용이 다릅니다." });
    return receipt.response;
  }
  private async record(client: PoolClient, actor: string, mutationId: string, input: unknown,
    result: OrganizationMutationResult, action: string, target: string): Promise<void> {
    const safeResult = { ...result, token: undefined };
    await client.query(`INSERT INTO production_organization_receipt(actor_user_id,mutation_id,organization_id,request_digest,response)
      VALUES($1,$2,$3,$4,$5::jsonb)`, [actor, mutationId, result.organizationId, digest(input), JSON.stringify(safeResult)]);
    await client.query(`INSERT INTO production_organization_audit(organization_id,actor_user_id,action,target_id,revision)
      VALUES($1,$2,$3,$4,$5)`, [result.organizationId, actor, action, target, result.revision]);
  }
  async create(actor: string, input: { name: string; kind: OrganizationKind; description: string; mutationId: string }): Promise<OrganizationMutationResult> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      const replay = await this.receipt(client, actor, input.mutationId, { type: "create", ...input });
      if (replay) return replay;
      const count = (await client.query<{ count: number }>("SELECT count(*)::int count FROM production_organization WHERE owner_user_id=$1", [actor])).rows[0].count;
      if (count >= ORGANIZATION_FREE_POLICY.ownedOrganizations) quota("ownedOrganizations", count, ORGANIZATION_FREE_POLICY.ownedOrganizations);
      const id = randomUUID();
      await client.query("INSERT INTO production_organization(id,name,kind,description,owner_user_id) VALUES($1,$2,$3,$4,$5)", [id, input.name, input.kind, input.description, actor]);
      await client.query("INSERT INTO production_organization_member(organization_id,user_id,role) VALUES($1,$2,'owner')", [id, actor]);
      const result = { organizationId: id, revision: 0 };
      await this.record(client, actor, input.mutationId, { type: "create", ...input }, result, "organization.created", id);
      return result;
    }, true);
  }
  async command(actor: string, organizationId: string, input: OrganizationCommand): Promise<OrganizationMutationResult> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      const row = await this.access(client, actor, organizationId, true);
      const leaving = input.type === "remove-member" && input.userId === actor;
      // 조직 표면 액션은 contracts 매트릭스가 정본이고 서버가 같은 표로 강제한다.
      const action = surfaceAction(input);
      if (action && !organizationRoleCan(row.role, action)) throw new ForbiddenException("조직 역할 권한이 부족합니다.");
      if (!action && !leaving && !isOrganizationManager(row.role)) throw new ForbiddenException("구성원 관리 권한이 필요합니다.");
      const request = { organizationId, ...input };
      const replay = await this.receipt(client, actor, input.mutationId, request);
      if (replay) return replay;
      if (row.revision !== input.expectedRevision) throw new ConflictException({ code: "organization_revision_conflict", message: "다른 변경이 있습니다. 새로고침 후 다시 확인해주세요.", currentRevision: row.revision });
      let extra: Partial<OrganizationMutationResult> = {};
      let target = organizationId;
      switch (input.type) {
        case "update-profile":
          await client.query("UPDATE production_organization SET name=$2,kind=$3,description=$4 WHERE id=$1", [organizationId, input.name, input.kind, input.description]);
          break;
        case "link-workspace": {
          // 연결은 모아보기 범위만 정한다. 본인이 속한 팀만 연결할 수 있고 원고 접근은 생기지 않는다.
          const membership = await client.query("SELECT 1 FROM production_team_member WHERE workspace_id=$1 AND user_id=$2", [input.workspaceId, actor]);
          if (!membership.rowCount) throw new NotFoundException("연결할 수 있는 팀이 없습니다.");
          const linked = await client.query("SELECT 1 FROM production_organization_link WHERE organization_id=$1 AND workspace_id=$2", [organizationId, input.workspaceId]);
          if (!linked.rowCount) {
            const count = (await client.query<{ count: number }>("SELECT count(*)::int count FROM production_organization_link WHERE organization_id=$1", [organizationId])).rows[0].count;
            if (count >= ORGANIZATION_FREE_POLICY.linkedWorkspacesPerOrganization) quota("linkedWorkspaces", count, ORGANIZATION_FREE_POLICY.linkedWorkspacesPerOrganization);
            await client.query("INSERT INTO production_organization_link(organization_id,workspace_id,linked_by) VALUES($1,$2,$3)", [organizationId, input.workspaceId, actor]);
          }
          target = input.workspaceId;
          break;
        }
        case "unlink-workspace":
          await client.query("DELETE FROM production_organization_link WHERE organization_id=$1 AND workspace_id=$2", [organizationId, input.workspaceId]);
          target = input.workspaceId;
          break;
        case "post-notice": {
          const count = (await client.query<{ count: number }>("SELECT count(*)::int count FROM production_organization_notice WHERE organization_id=$1", [organizationId])).rows[0].count;
          if (count >= ORGANIZATION_FREE_POLICY.noticesPerOrganization) quota("notices", count, ORGANIZATION_FREE_POLICY.noticesPerOrganization);
          const noticeId = randomUUID();
          await client.query("INSERT INTO production_organization_notice(id,organization_id,author_user_id,body) VALUES($1,$2,$3,$4)", [noticeId, organizationId, actor, input.body]);
          extra = { noticeId };
          target = noticeId;
          break;
        }
        case "delete-notice": {
          const removed = await client.query("DELETE FROM production_organization_notice WHERE id=$1 AND organization_id=$2", [input.noticeId, organizationId]);
          if (!removed.rowCount) throw new NotFoundException("공지를 찾을 수 없습니다.");
          target = input.noticeId;
          break;
        }
        case "invite": {
          if (row.role !== "owner" && input.role === "admin") throw new ForbiddenException("운영 관리자 초대는 대표만 할 수 있습니다.");
          const exists = await client.query(`SELECT 1 FROM production_organization_member m JOIN "user" u ON u.id=m.user_id
            WHERE m.organization_id=$1 AND lower(u.email)=$2`, [organizationId, input.email]);
          if (exists.rowCount) throw new ConflictException("이미 참여한 구성원입니다.");
          await client.query(`UPDATE production_organization_invite SET revoked_at=now() WHERE organization_id=$1
            AND revoked_at IS NULL AND accepted_at IS NULL AND (expires_at<=now() OR email=$2)`, [organizationId, input.email]);
          const count = await this.capacity(client, organizationId);
          if (count >= ORGANIZATION_FREE_POLICY.membersPerOrganization) quota("members", count, ORGANIZATION_FREE_POLICY.membersPerOrganization);
          const token = randomBytes(32).toString("base64url");
          const invitationId = randomUUID();
          const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
          await client.query(`INSERT INTO production_organization_invite(id,organization_id,email,role,token_hash,created_by,expires_at)
            VALUES($1,$2,$3,$4,$5,$6,$7)`, [invitationId, organizationId, input.email, input.role, hash(token), actor, expiresAt]);
          extra = { invitationId, token, expiresAt, delivery: "manual-link" };
          target = invitationId;
          break;
        }
        case "revoke-invite":
          await client.query("UPDATE production_organization_invite SET revoked_at=now() WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL", [input.invitationId, organizationId]);
          target = input.invitationId;
          break;
        case "change-member-role":
        case "remove-member": {
          const member = (await client.query<{ role: OrganizationRole }>("SELECT role FROM production_organization_member WHERE organization_id=$1 AND user_id=$2", [organizationId, input.userId])).rows[0];
          if (!member) throw new NotFoundException("구성원을 찾을 수 없습니다.");
          if (member.role === "owner") throw new ConflictException("대표 권한을 먼저 이전해주세요.");
          if (!leaving && row.role !== "owner" && (member.role === "admin" || (input.type === "change-member-role" && input.role === "admin"))) throw new ForbiddenException("운영 관리자 권한 변경은 대표만 할 수 있습니다.");
          if (input.type === "remove-member") await client.query("DELETE FROM production_organization_member WHERE organization_id=$1 AND user_id=$2", [organizationId, input.userId]);
          else await client.query("UPDATE production_organization_member SET role=$3 WHERE organization_id=$1 AND user_id=$2", [organizationId, input.userId, input.role]);
          target = input.userId;
          break;
        }
        case "transfer-owner": {
          if (row.role !== "owner") throw new ForbiddenException("대표만 이전할 수 있습니다.");
          if (actor === input.userId) throw new ConflictException("현재 대표입니다.");
          await this.activeUser(client, input.userId);
          await this.access(client, input.userId, organizationId);
          const count = (await client.query<{ count: number }>("SELECT count(*)::int count FROM production_organization WHERE owner_user_id=$1", [input.userId])).rows[0].count;
          if (count >= ORGANIZATION_FREE_POLICY.ownedOrganizations) quota("ownedOrganizations", count, ORGANIZATION_FREE_POLICY.ownedOrganizations);
          await client.query("UPDATE production_organization_member SET role='admin' WHERE organization_id=$1 AND user_id=$2", [organizationId, actor]);
          await client.query("UPDATE production_organization_member SET role='owner' WHERE organization_id=$1 AND user_id=$2", [organizationId, input.userId]);
          await client.query("UPDATE production_organization SET owner_user_id=$2 WHERE id=$1", [organizationId, input.userId]);
          target = input.userId;
          break;
        }
      }
      const revision = row.revision + 1;
      await client.query("UPDATE production_organization SET revision=$2,updated_at=now() WHERE id=$1", [organizationId, revision]);
      const result = { organizationId, revision, ...extra };
      await this.record(client, actor, input.mutationId, request, result, `organization.${input.type}`, target);
      return result;
    }, true);
  }
  private async capacity(client: PoolClient, organizationId: string): Promise<number> {
    return (await client.query<{ count: number }>(`SELECT (
      (SELECT count(*) FROM production_organization_member WHERE organization_id=$1) +
      (SELECT count(*) FROM production_organization_invite WHERE organization_id=$1 AND revoked_at IS NULL
        AND accepted_at IS NULL AND expires_at>now()))::int count`, [organizationId])).rows[0].count;
  }
  /**
   * 수락 전 미리보기 — 팀 초대와 같은 검증 골격(이메일 인증 + 초대 이메일 일치)을
   * 읽기 전용으로 적용한다. 일치하지 않으면 같은 일반 오류로 답해 초대의 존재를
   * 흘리지 않고, 아무것도 기록하지 않는다.
   */
  async previewInvite(actor: string, input: { token: string }): Promise<OrganizationInvitePreview> {
    return this.transaction(async (client) => {
      const user = await this.activeUser(client, actor);
      if (!user.email || !user.emailVerified) throw new ForbiddenException("초대받은 이메일의 인증이 필요합니다.");
      const invitation = (await client.query<{
        organization_id: string; email: string; role: InvitableOrganizationRole; accepted_at: Date | null;
        expiresAt: string; organizationName: string; kind: OrganizationKind; inviterName: string; alreadyMember: boolean;
      }>(`SELECT i.organization_id,i.email,i.role,i.accepted_at,
          to_char(i.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "expiresAt",
          o.name "organizationName", o.kind, coalesce(u.name,'구성원') "inviterName",
          EXISTS (SELECT 1 FROM production_organization_member m
            WHERE m.organization_id=i.organization_id AND m.user_id=$2) "alreadyMember"
          FROM production_organization_invite i
          JOIN production_organization o ON o.id=i.organization_id
          LEFT JOIN "user" u ON u.id=i.created_by
          WHERE i.token_hash=$1 AND i.revoked_at IS NULL AND i.expires_at>now()`, [hash(input.token), actor])).rows[0];
      if (!invitation || invitation.email !== user.email.trim().toLowerCase()) {
        throw new NotFoundException("사용 가능한 초대가 없습니다. 초대받은 이메일로 로그인해주세요.");
      }
      return {
        organizationId: invitation.organization_id,
        organizationName: invitation.organizationName,
        kind: invitation.kind,
        role: invitation.role,
        inviterName: invitation.inviterName,
        expiresAt: invitation.expiresAt,
        alreadyAccepted: invitation.accepted_at !== null,
        alreadyMember: invitation.alreadyMember,
      };
    });
  }
  async accept(actor: string, input: { token: string; mutationId: string }): Promise<OrganizationMutationResult> {
    return this.transaction(async (client) => {
      const user = await this.activeUser(client, actor);
      if (!user.email || !user.emailVerified) throw new ForbiddenException("초대받은 이메일의 인증이 필요합니다.");
      const request = { type: "accept-invite", ...input };
      const replay = await this.receipt(client, actor, input.mutationId, request);
      if (replay) return replay;
      const invitation = (await client.query<{ id: string; organization_id: string; email: string; role: OrganizationRole; accepted_at: Date | null }>(
        `SELECT id,organization_id,email,role,accepted_at FROM production_organization_invite WHERE token_hash=$1
         AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`, [hash(input.token)])).rows[0];
      if (!invitation || invitation.email !== user.email.trim().toLowerCase()) throw new NotFoundException("사용 가능한 초대가 없습니다. 초대받은 이메일로 로그인해주세요.");
      const row = (await client.query<{ revision: number }>("SELECT revision FROM production_organization WHERE id=$1 FOR UPDATE", [invitation.organization_id])).rows[0];
      if (!row) throw new NotFoundException("사용 가능한 초대가 없습니다.");
      const member = await client.query("SELECT 1 FROM production_organization_member WHERE organization_id=$1 AND user_id=$2", [invitation.organization_id, actor]);
      if (invitation.accepted_at && !member.rowCount) throw new NotFoundException("이미 사용된 초대입니다.");
      if (!member.rowCount) {
        const count = await this.capacity(client, invitation.organization_id);
        if (count > ORGANIZATION_FREE_POLICY.membersPerOrganization) quota("members", count, ORGANIZATION_FREE_POLICY.membersPerOrganization);
        await client.query("INSERT INTO production_organization_member(organization_id,user_id,role) VALUES($1,$2,$3)", [invitation.organization_id, actor, invitation.role]);
      }
      await client.query("UPDATE production_organization_invite SET accepted_at=coalesce(accepted_at,now()) WHERE id=$1", [invitation.id]);
      const revision = row.revision + (invitation.accepted_at ? 0 : 1);
      await client.query("UPDATE production_organization SET revision=$2,updated_at=now() WHERE id=$1", [invitation.organization_id, revision]);
      const result = { organizationId: invitation.organization_id, revision };
      await this.record(client, actor, input.mutationId, request, result, "organization.invite-accepted", invitation.id);
      return result;
    }, true);
  }
}
