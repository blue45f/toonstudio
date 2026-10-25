import { createHash, randomBytes } from "node:crypto";

import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import {
  canManageCommunityCafe,
  canModerateCommunityCafe,
  canPublishCommunityCafePost,
  COMMUNITY_CAFE_JOIN_POLICIES,
  COMMUNITY_CAFE_KINDS,
  COMMUNITY_CAFE_POSTING_POLICIES,
  COMMUNITY_CAFE_ROLES,
  COMMUNITY_CAFE_VISIBILITIES,
} from "../../../../../packages/core/src/community-governance";
import {
  communityCafeBans,
  communityCafeJoinRequests,
  communityCafeMembers,
  communityCafes,
  db,
  users,
} from "../../platform/database";
import { createSchemaReadinessCheck } from "../health/schema-readiness";
import { escapeLikePattern } from "./sql-like";

import type {
  CommunityCafe,
  CommunityCafeJoinPolicy,
  CommunityCafeKind,
  CommunityCafePostingPolicy,
  CommunityCafeRole,
  CommunityCafeRule,
  CommunityCafeVisibility,
} from "../../../../../packages/core/src/types";
import type { SQL } from "drizzle-orm";

export type CommunityGovernanceErrorCode =
  | "bad-request"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict";

export class CommunityGovernanceError extends Error {
  readonly code: CommunityGovernanceErrorCode;

  constructor(code: CommunityGovernanceErrorCode, message: string) {
    super(message);
    this.name = "CommunityGovernanceError";
    this.code = code;
  }
}

const MAX_NAME = 40;
const MAX_DESCRIPTION = 500;
const MAX_TAGS = 8;
const MAX_TAG = 24;
const MAX_RULES = 12;
const MAX_RULE_TITLE = 60;
const MAX_RULE_DESCRIPTION = 300;
export const MAX_JOIN_MESSAGE = 300;
export const MAX_BAN_REASON = 300;
export const MAX_OWNED_COMMUNITIES = 5;

export const ensureCommunityGovernanceTables = createSchemaReadinessCheck([
  `SELECT "id", "slug", "name", "description", "genre", "kind", "tags",
          "visibility", "joinPolicy", "postingPolicy", "rules", "status",
          "createdBy", "hidden", "createdAt", "updatedAt"
   FROM "community_cafe" WHERE FALSE`,
  `SELECT "cafeId", "userId", "role", "joinedAt"
   FROM "community_cafe_member" WHERE FALSE`,
  `SELECT "id", "cafeId", "userId", "message", "status", "reviewedBy",
          "reviewedAt", "createdAt", "updatedAt"
   FROM "community_cafe_join_request" WHERE FALSE`,
  `SELECT "id", "cafeId", "codeHash", "createdBy", "maxUses", "useCount",
          "expiresAt", "revokedAt", "createdAt"
   FROM "community_cafe_invite" WHERE FALSE`,
  `SELECT "cafeId", "userId", "reason", "bannedBy", "expiresAt", "createdAt"
   FROM "community_cafe_ban" WHERE FALSE`,
  `SELECT "id", "cafeId", "actorId", "action", "targetUserId", "targetPostId",
          "metadata", "createdAt"
   FROM "community_cafe_moderation_log" WHERE FALSE`,
]);

export function badRequest(message: string): never {
  throw new CommunityGovernanceError("bad-request", message);
}

export function forbidden(message: string): never {
  throw new CommunityGovernanceError("forbidden", message);
}

export function notFound(message = "커뮤니티를 찾을 수 없어요."): never {
  throw new CommunityGovernanceError("not-found", message);
}

export function conflict(message: string): never {
  throw new CommunityGovernanceError("conflict", message);
}

export function cleanInline(value: unknown, max: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function cleanMultiline(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, max);
}

export function safeDate(value: Date | number | null | undefined): string {
  return new Date(value ?? Date.now()).toISOString();
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function cleanTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/u)
      : [];
  return [...new Set(raw.map((item) => cleanInline(item, MAX_TAG)).filter(Boolean))].slice(
    0,
    MAX_TAGS,
  );
}

function cleanRules(value: unknown): CommunityCafeRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const record = (item ?? {}) as Record<string, unknown>;
      const title = cleanInline(record.title, MAX_RULE_TITLE);
      const description = cleanMultiline(record.description, MAX_RULE_DESCRIPTION);
      if (!title) return null;
      return {
        id: `rule-${index + 1}`,
        title,
        description,
      } satisfies CommunityCafeRule;
    })
    .filter((item): item is CommunityCafeRule => item !== null)
    .slice(0, MAX_RULES);
}

export function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function parseCreateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  errorMessage: string,
): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (!allowed.includes(value as T)) badRequest(errorMessage);
  return value as T;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/gu, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-{2,}/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);
}

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function activeBanCondition(userId: string): SQL {
  const now = new Date();
  return and(
    eq(communityCafeBans.userId, userId),
    or(isNull(communityCafeBans.expiresAt), gt(communityCafeBans.expiresAt, now)),
  )!;
}

export interface CommunityCafeCreateInput {
  name: string;
  slug?: string;
  description: string;
  genre: string;
  kind: CommunityCafeKind;
  tags: string[];
  visibility: CommunityCafeVisibility;
  joinPolicy: CommunityCafeJoinPolicy;
  postingPolicy: CommunityCafePostingPolicy;
  rules: CommunityCafeRule[];
}

export interface CommunityCafeUpdateInput {
  name?: string;
  description?: string;
  genre?: string;
  kind?: CommunityCafeKind;
  tags?: string[];
  visibility?: CommunityCafeVisibility;
  joinPolicy?: CommunityCafeJoinPolicy;
  postingPolicy?: CommunityCafePostingPolicy;
  rules?: CommunityCafeRule[];
}

export function validateCommunityCafeCreateInput(
  input: unknown,
  allowedGenres: readonly string[],
): CommunityCafeCreateInput {
  const body = (input ?? {}) as Record<string, unknown>;
  const name = cleanInline(body.name, MAX_NAME);
  const description = cleanMultiline(body.description, MAX_DESCRIPTION);
  const genre = cleanInline(body.genre, 30);
  const customSlug = cleanInline(body.slug, 60);
  if (name.length < 2) badRequest("커뮤니티 이름은 2자 이상 입력해 주세요.");
  if (description.length < 2) badRequest("커뮤니티 소개를 2자 이상 입력해 주세요.");
  if (genre && !allowedGenres.includes(genre)) badRequest("지원하지 않는 장르예요.");
  if (customSlug && slugify(customSlug) !== customSlug.toLowerCase()) {
    badRequest("고유 주소는 한글, 영문, 숫자와 하이픈만 사용할 수 있어요.");
  }
  return {
    name,
    slug: customSlug ? slugify(customSlug) : undefined,
    description,
    genre,
    kind: parseCreateEnum(
      body.kind,
      COMMUNITY_CAFE_KINDS,
      "genre",
      "지원하지 않는 커뮤니티 유형이에요.",
    ),
    tags: cleanTags(body.tags),
    visibility: parseCreateEnum(
      body.visibility,
      COMMUNITY_CAFE_VISIBILITIES,
      "public",
      "공개 범위를 확인해 주세요.",
    ),
    joinPolicy: parseCreateEnum(
      body.joinPolicy,
      COMMUNITY_CAFE_JOIN_POLICIES,
      "open",
      "가입 정책을 확인해 주세요.",
    ),
    postingPolicy: parseCreateEnum(
      body.postingPolicy,
      COMMUNITY_CAFE_POSTING_POLICIES,
      "members",
      "게시 정책을 확인해 주세요.",
    ),
    rules: cleanRules(body.rules),
  };
}

export function validateCommunityCafeUpdateInput(
  input: unknown,
  allowedGenres: readonly string[],
): CommunityCafeUpdateInput {
  const body = (input ?? {}) as Record<string, unknown>;
  const result: CommunityCafeUpdateInput = {};
  if (Object.hasOwn(body, "name")) {
    const name = cleanInline(body.name, MAX_NAME);
    if (name.length < 2) badRequest("커뮤니티 이름은 2자 이상 입력해 주세요.");
    result.name = name;
  }
  if (Object.hasOwn(body, "description")) {
    const description = cleanMultiline(body.description, MAX_DESCRIPTION);
    if (description.length < 2) badRequest("커뮤니티 소개를 2자 이상 입력해 주세요.");
    result.description = description;
  }
  if (Object.hasOwn(body, "genre")) {
    const genre = cleanInline(body.genre, 30);
    if (genre && !allowedGenres.includes(genre)) badRequest("지원하지 않는 장르예요.");
    result.genre = genre;
  }
  if (Object.hasOwn(body, "kind")) {
    if (!COMMUNITY_CAFE_KINDS.includes(body.kind as CommunityCafeKind)) {
      badRequest("지원하지 않는 커뮤니티 유형이에요.");
    }
    result.kind = body.kind as CommunityCafeKind;
  }
  if (Object.hasOwn(body, "tags")) result.tags = cleanTags(body.tags);
  if (Object.hasOwn(body, "visibility")) {
    if (!COMMUNITY_CAFE_VISIBILITIES.includes(body.visibility as CommunityCafeVisibility)) {
      badRequest("공개 범위를 확인해 주세요.");
    }
    result.visibility = body.visibility as CommunityCafeVisibility;
  }
  if (Object.hasOwn(body, "joinPolicy")) {
    if (!COMMUNITY_CAFE_JOIN_POLICIES.includes(body.joinPolicy as CommunityCafeJoinPolicy)) {
      badRequest("가입 정책을 확인해 주세요.");
    }
    result.joinPolicy = body.joinPolicy as CommunityCafeJoinPolicy;
  }
  if (Object.hasOwn(body, "postingPolicy")) {
    if (!COMMUNITY_CAFE_POSTING_POLICIES.includes(body.postingPolicy as CommunityCafePostingPolicy)) {
      badRequest("게시 정책을 확인해 주세요.");
    }
    result.postingPolicy = body.postingPolicy as CommunityCafePostingPolicy;
  }
  if (Object.hasOwn(body, "rules")) result.rules = cleanRules(body.rules);
  if (Object.keys(result).length === 0) badRequest("변경할 설정이 없어요.");
  return result;
}

interface CafeRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  genre: string;
  kind: string;
  tags: unknown;
  visibility: string;
  joinPolicy: string;
  postingPolicy: string;
  rules: unknown;
  status: string;
  createdBy: string;
  ownerName: string | null;
  memberCount: unknown;
  postCount: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface ViewerState {
  role: CommunityCafeRole | null;
  pendingRequestId: string | null;
  banned: boolean;
}

const memberCountExpression = sql<number>`(
  SELECT count(*) FROM community_cafe_member m
  WHERE m."cafeId" = ${communityCafes.id}
)`;
const postCountExpression = sql<number>`(
  SELECT count(*) FROM fan_post p
  WHERE p.scope = 'cafe'
    AND p."targetId" = ${communityCafes.slug}
    AND p.hidden = false
)`;

function cafeSelection() {
  return {
    id: communityCafes.id,
    slug: communityCafes.slug,
    name: communityCafes.name,
    description: communityCafes.description,
    genre: communityCafes.genre,
    kind: communityCafes.kind,
    tags: communityCafes.tags,
    visibility: communityCafes.visibility,
    joinPolicy: communityCafes.joinPolicy,
    postingPolicy: communityCafes.postingPolicy,
    rules: communityCafes.rules,
    status: communityCafes.status,
    createdBy: communityCafes.createdBy,
    ownerName: users.name,
    memberCount: memberCountExpression.as("memberCount"),
    postCount: postCountExpression.as("postCount"),
    createdAt: communityCafes.createdAt,
    updatedAt: communityCafes.updatedAt,
  };
}

function mapCafe(row: CafeRow, state: ViewerState): CommunityCafe {
  const role = state.banned ? null : state.role;
  const status = row.status === "archived" ? "archived" : "active";
  const visibility = row.visibility === "private" ? "private" : "public";
  const postingPolicy = row.postingPolicy === "staff" ? "staff" : "members";
  const viewerCanViewContent = visibility === "public" || Boolean(role);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    genre: row.genre,
    kind: parseEnum(row.kind, COMMUNITY_CAFE_KINDS, "genre"),
    tags: cleanTags(parseJsonArray<unknown>(row.tags)),
    visibility,
    joinPolicy: parseEnum(row.joinPolicy, COMMUNITY_CAFE_JOIN_POLICIES, "open"),
    postingPolicy,
    rules: cleanRules(parseJsonArray<unknown>(row.rules)),
    status,
    createdBy: row.createdBy,
    ownerName: row.ownerName ?? "알 수 없음",
    memberCount: Number(row.memberCount ?? 0),
    postCount: Number(row.postCount ?? 0),
    createdAt: safeDate(row.createdAt),
    updatedAt: safeDate(row.updatedAt ?? row.createdAt),
    viewerIsMember: Boolean(role),
    viewerRole: role,
    viewerMembershipState: state.banned
      ? "banned"
      : role
        ? "member"
        : state.pendingRequestId
          ? "pending"
          : "none",
    viewerJoinRequestId: state.pendingRequestId,
    viewerCanViewContent,
    viewerCanManage: canManageCommunityCafe(role),
    viewerCanModerate: canModerateCommunityCafe(role),
    viewerCanPost:
      status === "active" && canPublishCommunityCafePost(role, postingPolicy),
  };
}

export async function loadViewerStates(
  cafeIds: string[],
  viewerId: string | null,
): Promise<Map<string, ViewerState>> {
  const states = new Map<string, ViewerState>();
  for (const cafeId of cafeIds) {
    states.set(cafeId, { role: null, pendingRequestId: null, banned: false });
  }
  if (!viewerId || cafeIds.length === 0) return states;
  const [memberships, requests, bans] = await Promise.all([
    db
      .select({ cafeId: communityCafeMembers.cafeId, role: communityCafeMembers.role })
      .from(communityCafeMembers)
      .where(
        and(
          inArray(communityCafeMembers.cafeId, cafeIds),
          eq(communityCafeMembers.userId, viewerId),
        ),
      ),
    db
      .select({ cafeId: communityCafeJoinRequests.cafeId, id: communityCafeJoinRequests.id })
      .from(communityCafeJoinRequests)
      .where(
        and(
          inArray(communityCafeJoinRequests.cafeId, cafeIds),
          eq(communityCafeJoinRequests.userId, viewerId),
          eq(communityCafeJoinRequests.status, "pending"),
        ),
      ),
    db
      .select({ cafeId: communityCafeBans.cafeId })
      .from(communityCafeBans)
      .where(and(inArray(communityCafeBans.cafeId, cafeIds), activeBanCondition(viewerId))),
  ]);
  for (const membership of memberships) {
    const state = states.get(membership.cafeId);
    if (state) state.role = parseEnum<CommunityCafeRole>(membership.role, COMMUNITY_CAFE_ROLES, "member");
  }
  for (const request of requests) {
    const state = states.get(request.cafeId);
    if (state) state.pendingRequestId = request.id;
  }
  for (const ban of bans) {
    const state = states.get(ban.cafeId);
    if (state) state.banned = true;
  }
  return states;
}

async function selectCafeRowBySlug(slug: string): Promise<CafeRow | null> {
  const [row] = await db
    .select(cafeSelection())
    .from(communityCafes)
    .innerJoin(users, eq(communityCafes.createdBy, users.id))
    .where(and(eq(communityCafes.slug, slug), eq(communityCafes.hidden, false)))
    .limit(1);
  return (row as CafeRow | undefined) ?? null;
}

export async function listGovernedCafes(options: {
  viewerId?: string | null;
  genre?: string | null;
  kind?: string | null;
  query?: string | null;
  sort?: "recent" | "popular";
  mineOnly?: boolean;
  limit?: number;
} = {}): Promise<CommunityCafe[]> {
  await ensureCommunityGovernanceTables();
  const viewerId = options.viewerId ?? null;
  const limit = Math.max(1, Math.min(options.limit ?? 40, 100));
  const genre = cleanInline(options.genre, 30);
  const search = cleanInline(options.query, 80).toLowerCase();
  const kind = COMMUNITY_CAFE_KINDS.includes(options.kind as CommunityCafeKind)
    ? (options.kind as CommunityCafeKind)
    : null;
  if (options.mineOnly && !viewerId) {
    throw new CommunityGovernanceError("unauthorized", "로그인이 필요해요.");
  }

  let whereClause: SQL | undefined = and(
    eq(communityCafes.hidden, false),
    eq(communityCafes.status, "active"),
  );
  const memberExists = viewerId
    ? sql`EXISTS (
        SELECT 1 FROM community_cafe_member viewer_member
        WHERE viewer_member."cafeId" = ${communityCafes.id}
          AND viewer_member."userId" = ${viewerId}
      )`
    : undefined;
  const requestExists = viewerId
    ? sql`EXISTS (
        SELECT 1 FROM community_cafe_join_request viewer_request
        WHERE viewer_request."cafeId" = ${communityCafes.id}
          AND viewer_request."userId" = ${viewerId}
          AND viewer_request.status = 'pending'
      )`
    : undefined;

  if (options.mineOnly) {
    whereClause = and(whereClause, or(memberExists, requestExists));
  } else if (viewerId) {
    whereClause = and(
      whereClause,
      or(eq(communityCafes.visibility, "public"), memberExists),
    );
  } else {
    whereClause = and(whereClause, eq(communityCafes.visibility, "public"));
  }
  if (genre) whereClause = and(whereClause, eq(communityCafes.genre, genre));
  if (kind) whereClause = and(whereClause, eq(communityCafes.kind, kind));
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    whereClause = and(
      whereClause,
      or(
        sql`lower(${communityCafes.name}) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(${communityCafes.description}) LIKE ${pattern} ESCAPE '\\'`,
      ),
    );
  }

  let query = db
    .select(cafeSelection())
    .from(communityCafes)
    .innerJoin(users, eq(communityCafes.createdBy, users.id))
    .$dynamic();
  if (whereClause) query = query.where(whereClause);
  const rows = await query
    .orderBy(
      ...(options.sort === "recent"
        ? [desc(communityCafes.createdAt)]
        : [
            desc(memberCountExpression),
            desc(postCountExpression),
            desc(communityCafes.createdAt),
          ]),
    )
    .limit(limit);
  const typedRows = rows as CafeRow[];
  const states = await loadViewerStates(
    typedRows.map((row) => row.id),
    viewerId,
  );
  return typedRows
    .map((row) =>
      mapCafe(
        row,
        states.get(row.id) ?? {
          role: null,
          pendingRequestId: null,
          banned: false,
        },
      ),
    )
    .filter(
      (cafe) =>
        cafe.visibility === "public" ||
        cafe.viewerMembershipState === "member" ||
        (options.mineOnly && cafe.viewerMembershipState === "pending"),
    );
}

export async function getGovernedCafeBySlug(
  slug: string,
  viewerId: string | null,
): Promise<CommunityCafe | null> {
  await ensureCommunityGovernanceTables();
  const normalizedSlug = cleanInline(slug, 80);
  if (!normalizedSlug) return null;
  const row = await selectCafeRowBySlug(normalizedSlug);
  if (!row) return null;
  const states = await loadViewerStates([row.id], viewerId);
  return mapCafe(
    row,
    states.get(row.id) ?? { role: null, pendingRequestId: null, banned: false },
  );
}

export async function requireCafe(slug: string, viewerId: string | null): Promise<CommunityCafe> {
  const cafe = await getGovernedCafeBySlug(slug, viewerId);
  if (!cafe) notFound();
  return cafe;
}

export async function requireManageRole(slug: string, actorId: string): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, actorId);
  if (!canManageCommunityCafe(cafe.viewerRole)) {
    forbidden("커뮤니티 관리자만 변경할 수 있어요.");
  }
  return cafe;
}

export async function requireModerateRole(slug: string, actorId: string): Promise<CommunityCafe> {
  const cafe = await requireCafe(slug, actorId);
  if (!canModerateCommunityCafe(cafe.viewerRole)) {
    forbidden("커뮤니티 운영진만 처리할 수 있어요.");
  }
  return cafe;
}

export async function resolveUniqueSlug(name: string, requested?: string): Promise<string> {
  const base = requested || slugify(name);
  if (!base) badRequest("커뮤니티 고유 주소를 만들 수 없어요.");
  let candidate = base;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const [existing] = await db
      .select({ id: communityCafes.id })
      .from(communityCafes)
      .where(eq(communityCafes.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    if (requested) conflict("이미 사용 중인 커뮤니티 주소예요.");
    candidate = `${base.slice(0, 55)}-${randomBytes(3).toString("hex")}`;
  }
  conflict("고유 주소를 만들지 못했습니다. 이름을 바꿔 다시 시도해 주세요.");
}

