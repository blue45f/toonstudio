import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import {
  COMMUNITY_CAFE_ROLES,
  communityCafeRoleRank,
} from "../../../../../packages/core/src/community-governance";
import {
  communityCafeBans,
  communityCafeInvites,
  fanPosts,
  communityCafeJoinRequests,
  communityCafeMembers,
  communityCafeModerationLogs,
  communityCafes,
  db,
  users,
} from "../../platform/database";

import type {
  CommunityCafe,
  CommunityCafeJoinRequest,
  CommunityCafeMember,
  CommunityCafeRole,
  FanCafeBoard,
  FanCafePost,
} from "../../../../../packages/core/src/types";

import {
  activeBanCondition,
  CommunityGovernanceError,
  loadViewerStates,
  badRequest,
  cleanInline,
  cleanMultiline,
  conflict,
  ensureCommunityGovernanceTables,
  forbidden,
  getGovernedCafeBySlug,
  hashInviteCode,
  MAX_JOIN_MESSAGE,
  MAX_OWNED_COMMUNITIES,
  notFound,
    parseEnum,
  requireCafe,
  requireManageRole,
  requireModerateRole,
  resolveUniqueSlug,
  safeDate,
  type CommunityCafeCreateInput,
  type CommunityCafeUpdateInput,
} from "./community-governance-contract";

export async function createGovernedCafe(
  userId: string,
  input: CommunityCafeCreateInput,
): Promise<CommunityCafe> {
  await ensureCommunityGovernanceTables();
  const [owned] = await db
    .select({ count: sql<number>`count(*)` })
    .from(communityCafeMembers)
    .innerJoin(communityCafes, eq(communityCafeMembers.cafeId, communityCafes.id))
    .where(
      and(
        eq(communityCafeMembers.userId, userId),
        eq(communityCafeMembers.role, "owner"),
        eq(communityCafes.status, "active"),
      ),
    );
  if (Number(owned?.count ?? 0) >= MAX_OWNED_COMMUNITIES) {
    conflict(`한 계정은 활성 커뮤니티를 최대 ${MAX_OWNED_COMMUNITIES}개까지 운영할 수 있어요.`);
  }
  const slug = await resolveUniqueSlug(input.name, input.slug);
  const cafeId = crypto.randomUUID();
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(communityCafes).values({
        id: cafeId,
        slug,
        name: input.name,
        description: input.description,
        genre: input.genre,
        kind: input.kind,
        tags: input.tags,
        visibility: input.visibility,
        joinPolicy: input.joinPolicy,
        postingPolicy: input.postingPolicy,
        rules: input.rules,
        status: "active",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(communityCafeMembers).values({
        cafeId,
        userId,
        role: "owner",
        joinedAt: now,
      });
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId,
        actorId: userId,
        action: "community-created",
        metadata: { visibility: input.visibility, joinPolicy: input.joinPolicy },
        createdAt: now,
      });
    });
  } catch (error) {
    if (error instanceof CommunityGovernanceError) throw error;
    if (String(error).toLowerCase().includes("unique")) {
      conflict("이미 사용 중인 커뮤니티 주소예요.");
    }
    throw error;
  }
  const created = await getGovernedCafeBySlug(slug, userId);
  if (!created) throw new Error("Created community could not be read back");
  return created;
}

export async function updateGovernedCafe(
  slug: string,
  actorId: string,
  input: CommunityCafeUpdateInput,
): Promise<CommunityCafe> {
  const cafe = await requireManageRole(slug, actorId);
  if (cafe.status === "archived") forbidden("보관된 커뮤니티 설정은 변경할 수 없어요.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(communityCafes)
      .set({ ...input, updatedAt: now })
      .where(eq(communityCafes.id, cafe.id));
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "settings-updated",
      metadata: { fields: Object.keys(input).join(",") },
      createdAt: now,
    });
  });
  return (await getGovernedCafeBySlug(slug, actorId))!;
}

export async function archiveGovernedCafe(
  slug: string,
  actorId: string,
): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, actorId);
  if (cafe.viewerRole !== "owner") forbidden("소유자만 커뮤니티를 보관할 수 있어요.");
  if (cafe.status === "archived") return cafe;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(communityCafes)
      .set({ status: "archived", updatedAt: now })
      .where(eq(communityCafes.id, cafe.id));
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "community-archived",
      metadata: {},
      createdAt: now,
    });
  });
  return (await getGovernedCafeBySlug(slug, actorId))!;
}

export async function assertCommunityContentAccess(
  slug: string,
  viewerId: string | null,
): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, viewerId);
  if (!cafe.viewerCanViewContent) notFound();
  return cafe;
}

export async function assertCommunityPostingAccess(
  slug: string,
  userId: string,
): Promise<CommunityCafe> {
  const cafe = await assertCommunityContentAccess(slug, userId);
  if (cafe.status !== "active") forbidden("보관된 커뮤니티에는 글이나 댓글을 작성할 수 없어요.");
  if (!cafe.viewerCanPost) {
    forbidden(
      cafe.postingPolicy === "staff"
        ? "운영진만 글과 댓글을 작성할 수 있어요."
        : "가입한 회원만 글과 댓글을 작성할 수 있어요.",
    );
  }
  return cafe;
}

export async function assertCafePostAccess(
  postId: string,
  viewerId: string | null,
): Promise<{ scope: string; targetId: string }> {
  await ensureCommunityGovernanceTables();
  const [post] = await db
    .select({ scope: fanPosts.scope, targetId: fanPosts.targetId })
    .from(fanPosts)
    .where(and(eq(fanPosts.id, postId), eq(fanPosts.hidden, false)))
    .limit(1);
  if (!post) notFound("게시글을 찾을 수 없어요.");
  if (post.scope === "cafe") await assertCommunityContentAccess(post.targetId, viewerId);
  return post;
}

export async function filterAccessibleCafePosts(
  posts: FanCafePost[],
  viewerId: string | null,
): Promise<FanCafePost[]> {
  const cafeSlugs = [...new Set(posts.filter((post) => post.scope === "cafe").map((post) => post.targetId))];
  if (cafeSlugs.length === 0) return posts;
  const rows = await db
    .select({ id: communityCafes.id, slug: communityCafes.slug, visibility: communityCafes.visibility })
    .from(communityCafes)
    .where(
      and(
        inArray(communityCafes.slug, cafeSlugs),
        eq(communityCafes.hidden, false),
      ),
    );
  const states = await loadViewerStates(
    rows.map((row) => row.id),
    viewerId,
  );
  const accessible = new Set(
    rows
      .filter((row) => {
        const state = states.get(row.id);
        return row.visibility === "public" || Boolean(state?.role && !state.banned);
      })
      .map((row) => row.slug),
  );
  return posts.filter((post) => post.scope !== "cafe" || accessible.has(post.targetId));
}

export async function filterAccessibleCafeBoards(
  boards: FanCafeBoard[],
  viewerId: string | null,
): Promise<FanCafeBoard[]> {
  const cafeSlugs = [...new Set(boards.filter((board) => board.scope === "cafe").map((board) => board.targetId))];
  if (cafeSlugs.length === 0) return boards;
  const rows = await db
    .select({ id: communityCafes.id, slug: communityCafes.slug, visibility: communityCafes.visibility })
    .from(communityCafes)
    .where(
      and(
        inArray(communityCafes.slug, cafeSlugs),
        eq(communityCafes.hidden, false),
      ),
    );
  const states = await loadViewerStates(
    rows.map((row) => row.id),
    viewerId,
  );
  const accessible = new Set(
    rows
      .filter((row) => {
        const state = states.get(row.id);
        return row.visibility === "public" || Boolean(state?.role && !state.banned);
      })
      .map((row) => row.slug),
  );
  return boards.filter((board) => board.scope !== "cafe" || accessible.has(board.targetId));
}

export async function joinGovernedCafe(
  slug: string,
  userId: string,
  input: { message?: unknown; inviteCode?: unknown } = {},
): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, userId);
  if (cafe.status !== "active") forbidden("보관된 커뮤니티에는 가입할 수 없어요.");
  if (cafe.viewerMembershipState === "banned") forbidden("이 커뮤니티에 가입할 수 없어요.");
  if (cafe.viewerIsMember) return cafe;

  const now = new Date();
  const inviteCode = cleanInline(input.inviteCode, 200);
  const message = cleanMultiline(input.message, MAX_JOIN_MESSAGE);
  if (inviteCode) {
    const codeHash = hashInviteCode(inviteCode);
    await db.transaction(async (tx) => {
      const [invite] = await tx
        .select({ id: communityCafeInvites.id })
        .from(communityCafeInvites)
        .where(
          and(
            eq(communityCafeInvites.cafeId, cafe.id),
            eq(communityCafeInvites.codeHash, codeHash),
            isNull(communityCafeInvites.revokedAt),
            gt(communityCafeInvites.expiresAt, now),
            sql`${communityCafeInvites.useCount} < ${communityCafeInvites.maxUses}`,
          ),
        )
        .limit(1);
      if (!invite) conflict("초대 코드가 유효하지 않거나 만료됐어요.");
      const inserted = await tx
        .insert(communityCafeMembers)
        .values({ cafeId: cafe.id, userId, role: "member", joinedAt: now })
        .onConflictDoNothing()
        .returning({ userId: communityCafeMembers.userId });
      if (inserted.length === 0) return;
      const used = await tx
        .update(communityCafeInvites)
        .set({ useCount: sql`${communityCafeInvites.useCount} + 1` })
        .where(
          and(
            eq(communityCafeInvites.id, invite.id),
            sql`${communityCafeInvites.useCount} < ${communityCafeInvites.maxUses}`,
          ),
        )
        .returning({ id: communityCafeInvites.id });
      if (used.length === 0) conflict("초대 코드의 사용 가능 횟수가 모두 소진됐어요.");
      await tx
        .update(communityCafeJoinRequests)
        .set({ status: "cancelled", updatedAt: now })
        .where(
          and(
            eq(communityCafeJoinRequests.cafeId, cafe.id),
            eq(communityCafeJoinRequests.userId, userId),
            eq(communityCafeJoinRequests.status, "pending"),
          ),
        );
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId: cafe.id,
        actorId: userId,
        action: "member-joined-by-invite",
        targetUserId: userId,
        metadata: { inviteId: invite.id },
        createdAt: now,
      });
    });
    return (await getGovernedCafeBySlug(slug, userId))!;
  }

  if (cafe.joinPolicy === "invite") {
    forbidden("초대 코드가 있어야 가입할 수 있어요.");
  }
  if (cafe.joinPolicy === "approval") {
    const id = cafe.viewerJoinRequestId ?? crypto.randomUUID();
    await db
      .insert(communityCafeJoinRequests)
      .values({
        id,
        cafeId: cafe.id,
        userId,
        message,
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [communityCafeJoinRequests.cafeId, communityCafeJoinRequests.userId],
        set: {
          message,
          status: "pending",
          reviewedBy: null,
          reviewedAt: null,
          updatedAt: now,
        },
      });
    return (await getGovernedCafeBySlug(slug, userId))!;
  }

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(communityCafeMembers)
      .values({ cafeId: cafe.id, userId, role: "member", joinedAt: now })
      .onConflictDoNothing()
      .returning({ userId: communityCafeMembers.userId });
    await tx
      .update(communityCafeJoinRequests)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          eq(communityCafeJoinRequests.cafeId, cafe.id),
          eq(communityCafeJoinRequests.userId, userId),
          eq(communityCafeJoinRequests.status, "pending"),
        ),
      );
    if (inserted.length > 0) {
      await tx.insert(communityCafeModerationLogs).values({
        id: crypto.randomUUID(),
        cafeId: cafe.id,
        actorId: userId,
        action: "member-joined",
        targetUserId: userId,
        metadata: {},
        createdAt: now,
      });
    }
  });
  return (await getGovernedCafeBySlug(slug, userId))!;
}

export async function leaveOrCancelGovernedCafe(
  slug: string,
  userId: string,
): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, userId);
  const now = new Date();
  if (cafe.viewerRole === "owner") {
    conflict("소유권을 다른 회원에게 이전한 뒤 탈퇴할 수 있어요.");
  }
  if (cafe.viewerJoinRequestId && !cafe.viewerIsMember) {
    await db
      .update(communityCafeJoinRequests)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          eq(communityCafeJoinRequests.id, cafe.viewerJoinRequestId),
          eq(communityCafeJoinRequests.userId, userId),
          eq(communityCafeJoinRequests.status, "pending"),
        ),
      );
    return (await getGovernedCafeBySlug(slug, userId))!;
  }
  if (!cafe.viewerIsMember) return cafe;
  await db.transaction(async (tx) => {
    await tx
      .delete(communityCafeMembers)
      .where(
        and(
          eq(communityCafeMembers.cafeId, cafe.id),
          eq(communityCafeMembers.userId, userId),
        ),
      );
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId: userId,
      action: "member-left",
      targetUserId: userId,
      metadata: {},
      createdAt: now,
    });
  });
  return (await getGovernedCafeBySlug(slug, userId))!;
}

function mapJoinRequest(row: {
  id: string;
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  message: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CommunityCafeJoinRequest {
  const allowed = ["pending", "approved", "rejected", "cancelled"] as const;
  const status = allowed.includes(row.status as (typeof allowed)[number])
    ? (row.status as CommunityCafeJoinRequest["status"])
    : "pending";
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName ?? "알 수 없음",
    userAvatar: row.userAvatar,
    message: row.message,
    status,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? safeDate(row.reviewedAt) : null,
    createdAt: safeDate(row.createdAt),
    updatedAt: safeDate(row.updatedAt),
  };
}

export async function listGovernedCafeJoinRequests(
  slug: string,
  actorId: string,
): Promise<CommunityCafeJoinRequest[]> {
  const cafe = await requireManageRole(slug, actorId);
  const rows = await db
    .select({
      id: communityCafeJoinRequests.id,
      userId: communityCafeJoinRequests.userId,
      userName: users.name,
      userAvatar: users.avatar,
      message: communityCafeJoinRequests.message,
      status: communityCafeJoinRequests.status,
      reviewedBy: communityCafeJoinRequests.reviewedBy,
      reviewedAt: communityCafeJoinRequests.reviewedAt,
      createdAt: communityCafeJoinRequests.createdAt,
      updatedAt: communityCafeJoinRequests.updatedAt,
    })
    .from(communityCafeJoinRequests)
    .innerJoin(users, eq(communityCafeJoinRequests.userId, users.id))
    .where(
      and(
        eq(communityCafeJoinRequests.cafeId, cafe.id),
        eq(communityCafeJoinRequests.status, "pending"),
      ),
    )
    .orderBy(communityCafeJoinRequests.createdAt)
    .limit(200);
  return rows.map(mapJoinRequest);
}

export async function reviewGovernedCafeJoinRequest(
  slug: string,
  requestId: string,
  actorId: string,
  decision: "approve" | "reject",
): Promise<CommunityCafeJoinRequest> {
  const cafe = await requireManageRole(slug, actorId);
  const [request] = await db
    .select({
      id: communityCafeJoinRequests.id,
      userId: communityCafeJoinRequests.userId,
      status: communityCafeJoinRequests.status,
    })
    .from(communityCafeJoinRequests)
    .where(
      and(
        eq(communityCafeJoinRequests.id, requestId),
        eq(communityCafeJoinRequests.cafeId, cafe.id),
      ),
    )
    .limit(1);
  if (!request) notFound("가입 요청을 찾을 수 없어요.");
  if (request.status !== "pending") conflict("이미 처리된 가입 요청이에요.");
  const [ban] = await db
    .select({ userId: communityCafeBans.userId })
    .from(communityCafeBans)
    .where(and(eq(communityCafeBans.cafeId, cafe.id), activeBanCondition(request.userId)))
    .limit(1);
  if (decision === "approve" && ban) conflict("차단된 회원의 가입 요청은 승인할 수 없어요.");
  const now = new Date();
  await db.transaction(async (tx) => {
    if (decision === "approve") {
      await tx
        .insert(communityCafeMembers)
        .values({ cafeId: cafe.id, userId: request.userId, role: "member", joinedAt: now })
        .onConflictDoNothing();
    }
    const updated = await tx
      .update(communityCafeJoinRequests)
      .set({
        status: decision === "approve" ? "approved" : "rejected",
        reviewedBy: actorId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(communityCafeJoinRequests.id, request.id),
          eq(communityCafeJoinRequests.status, "pending"),
        ),
      )
      .returning({ id: communityCafeJoinRequests.id });
    if (updated.length === 0) conflict("다른 운영진이 먼저 처리했어요.");
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: decision === "approve" ? "join-request-approved" : "join-request-rejected",
      targetUserId: request.userId,
      metadata: { requestId: request.id },
      createdAt: now,
    });
  });
  const [row] = await db
    .select({
      id: communityCafeJoinRequests.id,
      userId: communityCafeJoinRequests.userId,
      userName: users.name,
      userAvatar: users.avatar,
      message: communityCafeJoinRequests.message,
      status: communityCafeJoinRequests.status,
      reviewedBy: communityCafeJoinRequests.reviewedBy,
      reviewedAt: communityCafeJoinRequests.reviewedAt,
      createdAt: communityCafeJoinRequests.createdAt,
      updatedAt: communityCafeJoinRequests.updatedAt,
    })
    .from(communityCafeJoinRequests)
    .innerJoin(users, eq(communityCafeJoinRequests.userId, users.id))
    .where(eq(communityCafeJoinRequests.id, request.id))
    .limit(1);
  if (!row) notFound("가입 요청을 찾을 수 없어요.");
  return mapJoinRequest(row);
}

export async function listGovernedCafeMembers(
  slug: string,
  actorId: string,
): Promise<CommunityCafeMember[]> {
  const cafe = await requireModerateRole(slug, actorId);
  const rows = await db
    .select({
      userId: communityCafeMembers.userId,
      name: users.name,
      avatar: users.avatar,
      role: communityCafeMembers.role,
      joinedAt: communityCafeMembers.joinedAt,
    })
    .from(communityCafeMembers)
    .innerJoin(users, eq(communityCafeMembers.userId, users.id))
    .where(eq(communityCafeMembers.cafeId, cafe.id))
    .orderBy(
      sql`CASE ${communityCafeMembers.role}
        WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'moderator' THEN 3 ELSE 4 END`,
      communityCafeMembers.joinedAt,
    )
    .limit(1000);
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name ?? "알 수 없음",
    avatar: row.avatar,
    role: parseEnum<CommunityCafeRole>(row.role, COMMUNITY_CAFE_ROLES, "member"),
    joinedAt: safeDate(row.joinedAt),
  }));
}

export async function updateGovernedCafeMemberRole(
  slug: string,
  targetUserId: string,
  actorId: string,
  nextRole: CommunityCafeRole,
): Promise<CommunityCafeMember> {
  const cafe = await requireManageRole(slug, actorId);
  if (!COMMUNITY_CAFE_ROLES.includes(nextRole)) badRequest("지원하지 않는 역할이에요.");
  if (nextRole === "owner") badRequest("소유권 이전 기능을 사용해 주세요.");
  if (targetUserId === actorId) conflict("자신의 역할은 직접 변경할 수 없어요.");
  const [target] = await db
    .select({ role: communityCafeMembers.role })
    .from(communityCafeMembers)
    .where(
      and(
        eq(communityCafeMembers.cafeId, cafe.id),
        eq(communityCafeMembers.userId, targetUserId),
      ),
    )
    .limit(1);
  if (!target) notFound("회원을 찾을 수 없어요.");
  const targetRole = parseEnum<CommunityCafeRole>(target.role, COMMUNITY_CAFE_ROLES, "member");
  if (targetRole === "owner") forbidden("소유자의 역할은 소유권 이전으로만 변경할 수 있어요.");
  if (cafe.viewerRole !== "owner" && (targetRole === "admin" || nextRole === "admin")) {
    forbidden("관리자 역할은 소유자만 변경할 수 있어요.");
  }
  if (communityCafeRoleRank(cafe.viewerRole) <= communityCafeRoleRank(targetRole)) {
    forbidden("자신과 같거나 높은 역할의 회원은 변경할 수 없어요.");
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(communityCafeMembers)
      .set({ role: nextRole })
      .where(
        and(
          eq(communityCafeMembers.cafeId, cafe.id),
          eq(communityCafeMembers.userId, targetUserId),
        ),
      );
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "member-role-updated",
      targetUserId,
      metadata: { previousRole: targetRole, nextRole },
      createdAt: now,
    });
  });
  const members = await listGovernedCafeMembers(slug, actorId);
  const updated = members.find((member) => member.userId === targetUserId);
  if (!updated) notFound("회원을 찾을 수 없어요.");
  return updated;
}

export async function transferGovernedCafeOwnership(
  slug: string,
  targetUserId: string,
  actorId: string,
): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, actorId);
  if (cafe.viewerRole !== "owner") forbidden("소유자만 소유권을 이전할 수 있어요.");
  if (targetUserId === actorId) conflict("이미 커뮤니티 소유자예요.");
  const [target] = await db
    .select({ role: communityCafeMembers.role })
    .from(communityCafeMembers)
    .where(
      and(
        eq(communityCafeMembers.cafeId, cafe.id),
        eq(communityCafeMembers.userId, targetUserId),
      ),
    )
    .limit(1);
  if (!target) notFound("소유권을 받을 회원을 찾을 수 없어요.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(communityCafeMembers)
      .set({
        role: sql`CASE
          WHEN ${communityCafeMembers.userId} = ${targetUserId} THEN 'owner'
          WHEN ${communityCafeMembers.userId} = ${actorId} THEN 'admin'
          ELSE ${communityCafeMembers.role}
        END`,
      })
      .where(
        and(
          eq(communityCafeMembers.cafeId, cafe.id),
          inArray(communityCafeMembers.userId, [actorId, targetUserId]),
        ),
      );
    await tx
      .update(communityCafes)
      .set({ createdBy: targetUserId, updatedAt: now })
      .where(eq(communityCafes.id, cafe.id));
    await tx.insert(communityCafeModerationLogs).values({
      id: crypto.randomUUID(),
      cafeId: cafe.id,
      actorId,
      action: "ownership-transferred",
      targetUserId,
      metadata: { previousOwnerId: actorId },
      createdAt: now,
    });
  });
  return (await getGovernedCafeBySlug(slug, actorId))!;
}

