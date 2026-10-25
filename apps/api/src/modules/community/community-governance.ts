import { randomBytes } from "node:crypto";

import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import {
  canModerateCommunityCafe,
  COMMUNITY_CAFE_ROLES,
  communityCafeRoleRank,
} from "../../../../../packages/core/src/community-governance";
import {
  communityCafeBans,
  communityCafeJoinRequests,
  communityCafes,
  communityCafeInvites,
  communityCafeMembers,
  communityCafeModerationLogs,
  db,
  fanPostReplies,
  fanPosts,
  users,
} from "../../platform/database";

import type {
  CommunityCafeBan,
  CommunityCafeInvite,
  CommunityCafeModerationLog,
  CommunityCafeRole,
  CreatedCommunityCafeInvite,
} from "../../../../../packages/core/src/types";

import {
  badRequest,
  ensureCommunityGovernanceTables,
  parseEnum,
  cleanInline,
  cleanMultiline,
  conflict,
  forbidden,
  hashInviteCode,
  MAX_BAN_REASON,
  notFound,
  requireManageRole,
  requireModerateRole,
  safeDate,
} from "./community-governance-contract";

export {
  CommunityGovernanceError,
  getGovernedCafeBySlug,
  listGovernedCafes,
  validateCommunityCafeCreateInput,
  validateCommunityCafeUpdateInput,
  type CommunityCafeCreateInput,
  type CommunityCafeUpdateInput,
  type CommunityGovernanceErrorCode,
} from "./community-governance-contract";
export {
  archiveGovernedCafe,
  assertCafePostAccess,
  assertCommunityContentAccess,
  assertCommunityPostingAccess,
  createGovernedCafe,
  filterAccessibleCafeBoards,
  filterAccessibleCafePosts,
  joinGovernedCafe,
  leaveOrCancelGovernedCafe,
  listGovernedCafeJoinRequests,
  listGovernedCafeMembers,
  reviewGovernedCafeJoinRequest,
  transferGovernedCafeOwnership,
  updateGovernedCafe,
  updateGovernedCafeMemberRole,
} from "./community-governance-membership";

function normalizeExpiry(value: unknown): Date | null {
  const raw = cleanInline(value, 80);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    badRequest("차단 만료 시각은 현재 이후여야 해요.");
  }
  const max = Date.now() + 366 * 24 * 60 * 60_000;
  if (parsed.getTime() > max) badRequest("차단 기간은 최대 1년까지 설정할 수 있어요.");
  return parsed;
}

export async function banGovernedCafeMember(
  slug: string,
  targetUserId: string,
  actorId: string,
  input: { reason?: unknown; expiresAt?: unknown },
): Promise<CommunityCafeBan> {
  const cafe = await requireModerateRole(slug, actorId);
  if (targetUserId === actorId) conflict("자신을 차단할 수 없어요.");
  const [targetUser] = await db
    .select({ id: users.id, name: users.name, avatar: users.avatar })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!targetUser) notFound("사용자를 찾을 수 없어요.");
  const [membership] = await db
    .select({ role: communityCafeMembers.role })
    .from(communityCafeMembers)
    .where(
      and(
        eq(communityCafeMembers.cafeId, cafe.id),
        eq(communityCafeMembers.userId, targetUserId),
      ),
    )
    .limit(1);
  const targetRole = membership
    ? parseEnum<CommunityCafeRole>(membership.role, COMMUNITY_CAFE_ROLES, "member")
    : null;
  if (targetRole === "owner") forbidden("커뮤니티 소유자는 차단할 수 없어요.");
  if (
    targetRole &&
    communityCafeRoleRank(cafe.viewerRole) <= communityCafeRoleRank(targetRole)
  ) {
    forbidden("자신과 같거나 높은 역할의 회원은 차단할 수 없어요.");
  }
  const reason = cleanMultiline(input.reason, MAX_BAN_REASON);
  if (reason.length < 2) badRequest("차단 사유를 2자 이상 입력해 주세요.");
  const expiresAt = normalizeExpiry(input.expiresAt);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(communityCafeBans)
      .values({ cafeId: cafe.id, userId: targetUserId, reason, bannedBy: actorId, expiresAt, createdAt: now })
      .onConflictDoUpdate({
        target: [communityCafeBans.cafeId, communityCafeBans.userId],
        set: { reason, bannedBy: actorId, expiresAt, createdAt: now },
      });
    await tx
      .delete(communityCafeMembers)
      .where(
        and(
          eq(communityCafeMembers.cafeId, cafe.id),
          eq(communityCafeMembers.userId, targetUserId),
        ),
      );
    await tx
      .update(communityCafeJoinRequests)
      .set({ status: "rejected", reviewedBy: actorId, reviewedAt: now, updatedAt: now })
      .where(
        and(
          eq(communityCafeJoinRequests.cafeId, cafe.id),
          eq(communityCafeJoinRequests.userId, targetUserId),
          eq(communityCafeJoinRequests.status, "pending"),
        ),
      );
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "member-banned",
      targetUserId,
      metadata: { reason, expiresAt: expiresAt?.toISOString() ?? null },
      createdAt: now,
    });
  });
  const bans = await listGovernedCafeBans(slug, actorId);
  const ban = bans.find((item) => item.userId === targetUserId);
  if (!ban) throw new Error("Created community ban could not be read back");
  return ban;
}

export async function listGovernedCafeBans(
  slug: string,
  actorId: string,
): Promise<CommunityCafeBan[]> {
  const cafe = await requireModerateRole(slug, actorId);
  const rows = await db
    .select({
      userId: communityCafeBans.userId,
      userName: users.name,
      userAvatar: users.avatar,
      reason: communityCafeBans.reason,
      bannedBy: communityCafeBans.bannedBy,
      expiresAt: communityCafeBans.expiresAt,
      createdAt: communityCafeBans.createdAt,
    })
    .from(communityCafeBans)
    .innerJoin(users, eq(communityCafeBans.userId, users.id))
    .where(
      and(
        eq(communityCafeBans.cafeId, cafe.id),
        or(isNull(communityCafeBans.expiresAt), gt(communityCafeBans.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(communityCafeBans.createdAt))
    .limit(500);
  const actorIds = [...new Set(rows.map((row) => row.bannedBy).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds))
    : [];
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name ?? "알 수 없음"]));
  return rows.map((row) => ({
    userId: row.userId,
    userName: row.userName ?? "알 수 없음",
    userAvatar: row.userAvatar,
    reason: row.reason,
    bannedBy: row.bannedBy,
    bannedByName: row.bannedBy ? actorNames.get(row.bannedBy) ?? "알 수 없음" : "탈퇴한 운영진",
    expiresAt: row.expiresAt ? safeDate(row.expiresAt) : null,
    createdAt: safeDate(row.createdAt),
  }));
}

export async function unbanGovernedCafeMember(
  slug: string,
  targetUserId: string,
  actorId: string,
): Promise<{ removed: boolean }> {
  const cafe = await requireModerateRole(slug, actorId);
  const now = new Date();
  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(communityCafeBans)
      .where(
        and(
          eq(communityCafeBans.cafeId, cafe.id),
          eq(communityCafeBans.userId, targetUserId),
        ),
      )
      .returning({ userId: communityCafeBans.userId });
    if (rows.length > 0) {
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId: cafe.id,
        actorId,
        action: "member-unbanned",
        targetUserId,
        metadata: {},
        createdAt: now,
      });
    }
    return rows.length > 0;
  });
  return { removed };
}

function parseInviteExpiry(value: unknown): Date {
  const days = Math.max(1, Math.min(Number(value) || 7, 30));
  return new Date(Date.now() + days * 24 * 60 * 60_000);
}

function mapInvite(
  row: {
    id: string;
    createdBy: string | null;
    creatorName: string | null;
    maxUses: number;
    useCount: number;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
  },
): CommunityCafeInvite {
  return {
    id: row.id,
    createdBy: row.createdBy,
    creatorName: row.creatorName ?? "탈퇴한 운영진",
    maxUses: row.maxUses,
    useCount: row.useCount,
    expiresAt: safeDate(row.expiresAt),
    revokedAt: row.revokedAt ? safeDate(row.revokedAt) : null,
    createdAt: safeDate(row.createdAt),
  };
}

export async function listGovernedCafeInvites(
  slug: string,
  actorId: string,
): Promise<CommunityCafeInvite[]> {
  const cafe = await requireManageRole(slug, actorId);
  const rows = await db
    .select({
      id: communityCafeInvites.id,
      createdBy: communityCafeInvites.createdBy,
      creatorName: users.name,
      maxUses: communityCafeInvites.maxUses,
      useCount: communityCafeInvites.useCount,
      expiresAt: communityCafeInvites.expiresAt,
      revokedAt: communityCafeInvites.revokedAt,
      createdAt: communityCafeInvites.createdAt,
    })
    .from(communityCafeInvites)
    .leftJoin(users, eq(communityCafeInvites.createdBy, users.id))
    .where(eq(communityCafeInvites.cafeId, cafe.id))
    .orderBy(desc(communityCafeInvites.createdAt))
    .limit(200);
  return rows.map(mapInvite);
}

export async function createGovernedCafeInvite(
  slug: string,
  actorId: string,
  input: { maxUses?: unknown; expiresInDays?: unknown },
): Promise<CreatedCommunityCafeInvite> {
  const cafe = await requireManageRole(slug, actorId);
  if (cafe.status !== "active") forbidden("보관된 커뮤니티에서는 초대를 만들 수 없어요.");
  const maxUses = Math.max(1, Math.min(Math.floor(Number(input.maxUses) || 1), 100));
  const expiresAt = parseInviteExpiry(input.expiresInDays);
  const code = randomBytes(24).toString("base64url");
  const now = new Date();
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(communityCafeInvites).values({
      id,
      cafeId: cafe.id,
      codeHash: hashInviteCode(code),
      createdBy: actorId,
      maxUses,
      useCount: 0,
      expiresAt,
      createdAt: now,
    });
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "invite-created",
      metadata: { inviteId: id, maxUses, expiresAt: expiresAt.toISOString() },
      createdAt: now,
    });
  });
  const [actor] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);
  return {
    id,
    createdBy: actorId,
    creatorName: actor?.name ?? "알 수 없음",
    maxUses,
    useCount: 0,
    expiresAt: expiresAt.toISOString(),
    revokedAt: null,
    createdAt: now.toISOString(),
    code,
    sharePath: `/community/cafes/${encodeURIComponent(slug)}?invite=${encodeURIComponent(code)}`,
  };
}

export async function revokeGovernedCafeInvite(
  slug: string,
  inviteId: string,
  actorId: string,
): Promise<{ revoked: boolean }> {
  const cafe = await requireManageRole(slug, actorId);
  const now = new Date();
  const revoked = await db.transaction(async (tx) => {
    const rows = await tx
      .update(communityCafeInvites)
      .set({ revokedAt: now })
      .where(
        and(
          eq(communityCafeInvites.id, inviteId),
          eq(communityCafeInvites.cafeId, cafe.id),
          isNull(communityCafeInvites.revokedAt),
        ),
      )
      .returning({ id: communityCafeInvites.id });
    if (rows.length > 0) {
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId: cafe.id,
        actorId,
        action: "invite-revoked",
        metadata: { inviteId },
        createdAt: now,
      });
    }
    return rows.length > 0;
  });
  return { revoked };
}

export async function listGovernedCafeModerationLogs(
  slug: string,
  actorId: string,
  limit = 100,
): Promise<CommunityCafeModerationLog[]> {
  const cafe = await requireModerateRole(slug, actorId);
  const rows = await db
    .select({
      id: communityCafeModerationLogs.id,
      actorId: communityCafeModerationLogs.actorId,
      action: communityCafeModerationLogs.action,
      targetUserId: communityCafeModerationLogs.targetUserId,
      targetPostId: communityCafeModerationLogs.targetPostId,
      metadata: communityCafeModerationLogs.metadata,
      createdAt: communityCafeModerationLogs.createdAt,
    })
    .from(communityCafeModerationLogs)
    .where(eq(communityCafeModerationLogs.cafeId, cafe.id))
    .orderBy(desc(communityCafeModerationLogs.createdAt))
    .limit(Math.max(1, Math.min(limit, 200)));
  const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds))
    : [];
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name ?? "알 수 없음"]));
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorId ? actorNames.get(row.actorId) ?? "알 수 없음" : "탈퇴한 운영진",
    action: row.action,
    targetUserId: row.targetUserId,
    targetPostId: row.targetPostId,
    metadata: (row.metadata ?? {}) as Record<string, string | number | boolean | null>,
    createdAt: safeDate(row.createdAt),
  }));
}

export async function deleteGovernedCommunityPost(
  postId: string,
  userId: string,
): Promise<{ deleted: boolean }> {
  await ensureCommunityGovernanceTables();
  return db.transaction(async (tx) => {
    const [post] = await tx
      .select({
        id: fanPosts.id,
        scope: fanPosts.scope,
        targetId: fanPosts.targetId,
        ownerId: fanPosts.userId,
      })
      .from(fanPosts)
      .where(eq(fanPosts.id, postId))
      .limit(1);
    if (!post) return { deleted: false };

    let staffOverride = false;
    let cafeId: string | null = null;
    if (post.ownerId !== userId) {
      if (post.scope !== "cafe") {
        forbidden("작성자만 삭제할 수 있어요.");
      }
      const [staff] = await tx
        .select({
          cafeId: communityCafes.id,
          role: communityCafeMembers.role,
        })
        .from(communityCafes)
        .innerJoin(
          communityCafeMembers,
          and(
            eq(communityCafeMembers.cafeId, communityCafes.id),
            eq(communityCafeMembers.userId, userId),
          ),
        )
        .where(
          and(
            eq(communityCafes.slug, post.targetId),
            eq(communityCafes.hidden, false),
          ),
        )
        .limit(1);
      const role = staff
        ? parseEnum<CommunityCafeRole>(staff.role, COMMUNITY_CAFE_ROLES, "member")
        : null;
      if (!staff || !canModerateCommunityCafe(role)) {
        forbidden("작성자 또는 커뮤니티 운영진만 삭제할 수 있어요.");
      }
      staffOverride = true;
      cafeId = staff.cafeId;
    }

    const deleted = await tx
      .delete(fanPosts)
      .where(eq(fanPosts.id, postId))
      .returning({ id: fanPosts.id });
    if (deleted.length === 0) return { deleted: false };

    if (staffOverride && cafeId) {
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId,
        actorId: userId,
        action: "post-removed",
        targetUserId: post.ownerId,
        targetPostId: postId,
        metadata: {},
        createdAt: new Date(),
      });
    }
    return { deleted: true };
  });
}

export async function deleteGovernedCommunityReply(
  postId: string,
  replyId: string,
  userId: string,
): Promise<{ deleted: boolean; soft: boolean }> {
  await ensureCommunityGovernanceTables();
  return db.transaction(async (tx) => {
    const [reply] = await tx
      .select({
        id: fanPostReplies.id,
        ownerId: fanPostReplies.userId,
        scope: fanPosts.scope,
        targetId: fanPosts.targetId,
      })
      .from(fanPostReplies)
      .innerJoin(fanPosts, eq(fanPostReplies.postId, fanPosts.id))
      .where(
        and(
          eq(fanPostReplies.id, replyId),
          eq(fanPostReplies.postId, postId),
        ),
      )
      .limit(1);
    if (!reply) return { deleted: false, soft: false };

    let staffOverride = false;
    let cafeId: string | null = null;
    if (reply.ownerId !== userId) {
      if (reply.scope !== "cafe") {
        forbidden("작성자만 삭제할 수 있어요.");
      }
      const [staff] = await tx
        .select({
          cafeId: communityCafes.id,
          role: communityCafeMembers.role,
        })
        .from(communityCafes)
        .innerJoin(
          communityCafeMembers,
          and(
            eq(communityCafeMembers.cafeId, communityCafes.id),
            eq(communityCafeMembers.userId, userId),
          ),
        )
        .where(
          and(
            eq(communityCafes.slug, reply.targetId),
            eq(communityCafes.hidden, false),
          ),
        )
        .limit(1);
      const role = staff
        ? parseEnum<CommunityCafeRole>(staff.role, COMMUNITY_CAFE_ROLES, "member")
        : null;
      if (!staff || !canModerateCommunityCafe(role)) {
        forbidden("작성자 또는 커뮤니티 운영진만 삭제할 수 있어요.");
      }
      staffOverride = true;
      cafeId = staff.cafeId;
    }

    const [child] = await tx
      .select({ id: fanPostReplies.id })
      .from(fanPostReplies)
      .where(eq(fanPostReplies.parentId, replyId))
      .limit(1);
    if (child) {
      const updated = await tx
        .update(fanPostReplies)
        .set({ deletedAt: new Date(), text: "" })
        .where(eq(fanPostReplies.id, replyId))
        .returning({ id: fanPostReplies.id });
      if (updated.length === 0) return { deleted: false, soft: false };
    } else {
      const deleted = await tx
        .delete(fanPostReplies)
        .where(eq(fanPostReplies.id, replyId))
        .returning({ id: fanPostReplies.id });
      if (deleted.length === 0) return { deleted: false, soft: false };
    }

    if (staffOverride && cafeId) {
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId,
        actorId: userId,
        action: "reply-removed",
        targetUserId: reply.ownerId,
        targetPostId: postId,
        metadata: { replyId },
        createdAt: new Date(),
      });
    }
    return { deleted: true, soft: Boolean(child) };
  });
}
