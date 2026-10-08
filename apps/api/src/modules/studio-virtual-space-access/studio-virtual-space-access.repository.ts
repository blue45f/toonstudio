import { createHash, randomInt, randomUUID } from "node:crypto";
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import type {
  IssueSpaceEntryCodeInput, VerifySpaceEntryCodeInput, VerifySpatialInviteInput,
} from "./studio-virtual-space-access.dto";

export const STUDIO_SPACE_ACCESS_POOL = Symbol("STUDIO_SPACE_ACCESS_POOL");

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
/** 클라이언트 입장코드와 같은 32자 알파벳(혼동 문자 제외). */
const ENTRY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ENTRY_CODE_LENGTH = 6;
const ENTRY_CODE_DEFAULT_TTL_DAYS = 30;
/** 코드 검증 실패 임계와 잠금 시간 — 6자리 코드 무차별 대입 방어. */
const ENTRY_CODE_MAX_FAILED_ATTEMPTS = 5;
const ENTRY_CODE_LOCK_MS = 15 * 60 * 1000;

export type SpatialInviteVerification =
  | { readonly valid: true; readonly workspaceId: string; readonly role: string; readonly expiresAt: string }
  | { readonly valid: false; readonly reason: "not-found" | "revoked" | "consumed" | "expired" | "space-mismatch" };

export type SpaceEntryCodeVerification =
  | { readonly valid: true; readonly spaceId: string; readonly spaceName: string; readonly expiresAt: string }
  | {
      readonly valid: false;
      readonly reason: "not-found" | "revoked" | "expired" | "locked";
      readonly retryAfterSeconds?: number;
      readonly attemptsRemaining?: number;
    };

export interface IssuedSpaceEntryCode {
  readonly id: string;
  /** 발급 응답에서만 한 번 반환되는 코드 원문. 서버에는 해시만 남는다. */
  readonly code: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly expiresAt: string;
}

interface InviteRow {
  workspace_id: string; role: string;
  expires_at: Date; revoked_at: Date | null; accepted_at: Date | null;
}
interface EntryCodeRow {
  id: string; spaceId: string; spaceName: string; createdByUserId: string;
  expiresAt: Date; revokedAt: Date | null;
}

function createEntryCode(): string {
  let code = "";
  for (let index = 0; index < ENTRY_CODE_LENGTH; index += 1) {
    code += ENTRY_CODE_ALPHABET[randomInt(ENTRY_CODE_ALPHABET.length)];
  }
  return code;
}

@Injectable()
export class StudioVirtualSpaceAccessRepository {
  constructor(@Inject(STUDIO_SPACE_ACCESS_POOL) private readonly pool: Pool) {}

  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  private async activeUser(client: PoolClient, actor: string): Promise<void> {
    const result = await client.query(`SELECT id FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actor]);
    if (!result.rows[0]) throw new ForbiddenException("유효한 로그인이 필요합니다.");
  }

  /**
   * 공간 관리 권한: 공간이 제작 프로젝트면 작품 소유자이거나 연결된 워크스페이스의
   * 관리자(owner/admin)여야 한다. 제작 프로젝트가 아닌 공간 식별자는 서버에 소유권
   * 등록이 없어 발급자 귀속으로만 판정한다(호출부에서 created_by와 함께 확인).
   */
  private async spaceProject(client: PoolClient, spaceId: string): Promise<{ ownerUserId: string } | null> {
    const project = (await client.query<{ owner: string }>(
      `SELECT w."userId" AS owner FROM production_project p JOIN creator_work w ON w.id = p."workId" WHERE p.id=$1`,
      [spaceId])).rows[0];
    return project ? { ownerUserId: project.owner } : null;
  }

  private async isSpaceManager(client: PoolClient, actor: string, spaceId: string): Promise<boolean> {
    const project = await this.spaceProject(client, spaceId);
    if (!project) return false;
    if (project.ownerUserId === actor) return true;
    const manager = await client.query(
      `SELECT 1 FROM production_team_project l
       JOIN production_team_member m ON m.workspace_id = l.workspace_id AND m.user_id = $1
       WHERE l.project_id = $2 AND m.role IN ('owner', 'admin')`, [actor, spaceId]);
    return Boolean(manager.rowCount);
  }

  /**
   * 워크스페이스 초대 토큰의 게스트 검증. 수락(accept)과 달리 토큰을 소모하지
   * 않으며, 이미 수락된 토큰은 소모된 것으로 보고 게스트 입장에 쓰지 못하게 한다.
   * 이메일은 반환하지 않는다 — 게스트 검증은 링크 소지 자체를 자격으로 본다.
   */
  async verifyInvite(input: VerifySpatialInviteInput): Promise<SpatialInviteVerification> {
    const invite = (await this.pool.query<InviteRow>(
      `SELECT workspace_id, role, expires_at, revoked_at, accepted_at
       FROM production_team_invite WHERE token_hash = $1`, [hash(input.token)])).rows[0];
    if (!invite) return { valid: false, reason: "not-found" };
    if (invite.revoked_at) return { valid: false, reason: "revoked" };
    if (invite.accepted_at) return { valid: false, reason: "consumed" };
    if (invite.expires_at.getTime() <= Date.now()) return { valid: false, reason: "expired" };
    if (input.context.kind === "project-space") {
      const linked = await this.pool.query(
        `SELECT 1 FROM production_team_project WHERE project_id = $1 AND workspace_id = $2`,
        [input.context.projectId, invite.workspace_id]);
      if (!linked.rowCount) return { valid: false, reason: "space-mismatch" };
    }
    return {
      valid: true, workspaceId: invite.workspace_id, role: invite.role,
      expiresAt: invite.expires_at.toISOString(),
    };
  }

  /** 입장코드 발급. 코드는 서버에서 만들고 해시만 저장한다. */
  async issueEntryCode(actor: string, input: IssueSpaceEntryCodeInput): Promise<IssuedSpaceEntryCode> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      const project = await this.spaceProject(client, input.spaceId);
      if (project && project.ownerUserId !== actor && !(await this.isSpaceManager(client, actor, input.spaceId))) {
        throw new ForbiddenException("이 공간의 입장코드를 만들 권한이 없습니다.");
      }
      const spaceName = (input.spaceName ?? "").slice(0, 40);
      const ttlDays = input.ttlDays ?? ENTRY_CODE_DEFAULT_TTL_DAYS;
      const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = createEntryCode();
        const id = randomUUID();
        // 유니크 위반은 트랜잭션을 abort 상태로 만들므로 시도마다 SAVEPOINT로 감싼다.
        await client.query("SAVEPOINT issue_entry_code");
        try {
          await client.query(
            `INSERT INTO "studio_virtual_space_entry_code"
               ("id", "spaceId", "spaceName", "codeHash", "createdByUserId", "expiresAt")
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, input.spaceId, spaceName, hash(code), actor, expiresAt]);
          await client.query("RELEASE SAVEPOINT issue_entry_code");
          return { id, code, spaceId: input.spaceId, spaceName, expiresAt: expiresAt.toISOString() };
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT issue_entry_code");
          // 같은 공간에 같은 코드가 이미 살아 있으면 새 코드로 다시 뽑는다.
          if ((error as { code?: string }).code !== "23505") throw error;
        }
      }
      throw new ForbiddenException("입장코드를 만들지 못했습니다. 다시 시도해주세요.");
    });
  }

  /**
   * 입장코드 검증. 실패는 공간 단위로 세어 임계에 닿으면 그 공간의 코드 검증을
   * 잠시 잠근다 — 틀린 코드는 레코드와 매칭되지 않으므로 레코드별 카운터로는
   * 무차별 대입을 셀 수 없기 때문이다.
   */
  async verifyEntryCode(input: VerifySpaceEntryCodeInput): Promise<SpaceEntryCodeVerification> {
    // DTO가 1차 정규화하지만, 저장소 직접 호출자도 같은 판정을 받도록 여기서도 맞춘다.
    const codeHash = hash(input.code.trim().toUpperCase());
    return this.transaction(async (client) => {
      await client.query(
        `INSERT INTO "studio_virtual_space_entry_attempt" ("spaceId") VALUES ($1)
         ON CONFLICT ("spaceId") DO NOTHING`, [input.spaceId]);
      const attempt = (await client.query<{ failedAttempts: number; lockedUntil: Date | null }>(
        `SELECT "failedAttempts", "lockedUntil" FROM "studio_virtual_space_entry_attempt"
         WHERE "spaceId" = $1 FOR UPDATE`, [input.spaceId])).rows[0];
      const now = new Date();
      if (attempt.lockedUntil && attempt.lockedUntil.getTime() > now.getTime()) {
        return {
          valid: false, reason: "locked",
          retryAfterSeconds: Math.ceil((attempt.lockedUntil.getTime() - now.getTime()) / 1000),
        };
      }
      const live = (await client.query<{ spaceName: string; expiresAt: Date }>(
        `SELECT "spaceName", "expiresAt" FROM "studio_virtual_space_entry_code"
         WHERE "spaceId" = $1 AND "codeHash" = $2 AND "revokedAt" IS NULL`, [input.spaceId, codeHash])).rows[0];
      if (live && live.expiresAt.getTime() > now.getTime()) {
        await client.query(
          `UPDATE "studio_virtual_space_entry_attempt"
           SET "failedAttempts" = 0, "lockedUntil" = NULL, "updatedAt" = now() WHERE "spaceId" = $1`,
          [input.spaceId]);
        return {
          valid: true, spaceId: input.spaceId, spaceName: live.spaceName,
          expiresAt: live.expiresAt.toISOString(),
        };
      }
      let reason: "not-found" | "revoked" | "expired" = "not-found";
      if (live) reason = "expired";
      else {
        const revoked = await client.query(
          `SELECT 1 FROM "studio_virtual_space_entry_code"
           WHERE "spaceId" = $1 AND "codeHash" = $2 AND "revokedAt" IS NOT NULL LIMIT 1`,
          [input.spaceId, codeHash]);
        if (revoked.rowCount) reason = "revoked";
      }
      const failedAttempts = attempt.failedAttempts + 1;
      if (failedAttempts >= ENTRY_CODE_MAX_FAILED_ATTEMPTS) {
        await client.query(
          `UPDATE "studio_virtual_space_entry_attempt"
           SET "failedAttempts" = 0, "lockedUntil" = $2, "updatedAt" = now() WHERE "spaceId" = $1`,
          [input.spaceId, new Date(now.getTime() + ENTRY_CODE_LOCK_MS)]);
        return { valid: false, reason: "locked", retryAfterSeconds: Math.ceil(ENTRY_CODE_LOCK_MS / 1000) };
      }
      await client.query(
        `UPDATE "studio_virtual_space_entry_attempt"
         SET "failedAttempts" = $2, "updatedAt" = now() WHERE "spaceId" = $1`,
        [input.spaceId, failedAttempts]);
      return { valid: false, reason, attemptsRemaining: ENTRY_CODE_MAX_FAILED_ATTEMPTS - failedAttempts };
    });
  }

  /** 입장코드 회수. 발급자 본인이거나 공간 관리자만 할 수 있다. */
  async revokeEntryCode(actor: string, id: string): Promise<{ id: string; revoked: boolean }> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      const record = (await client.query<EntryCodeRow>(
        `SELECT "id", "spaceId", "spaceName", "createdByUserId", "expiresAt", "revokedAt"
         FROM "studio_virtual_space_entry_code" WHERE "id" = $1 FOR UPDATE`, [id])).rows[0];
      if (!record) throw new NotFoundException("입장코드를 찾을 수 없습니다.");
      if (record.createdByUserId !== actor && !(await this.isSpaceManager(client, actor, record.spaceId))) {
        throw new ForbiddenException("이 입장코드를 회수할 권한이 없습니다.");
      }
      if (!record.revokedAt) {
        await client.query(
          `UPDATE "studio_virtual_space_entry_code" SET "revokedAt" = now() WHERE "id" = $1`, [id]);
      }
      return { id, revoked: true };
    });
  }
}
