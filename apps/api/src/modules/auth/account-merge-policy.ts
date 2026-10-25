import { createHash } from "node:crypto";

import type { PoolClient } from "pg";



export const ACCOUNT_MERGE_TOKEN_TTL_MS = 10 * 60_000;
const ACCOUNT_MERGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
export const MERGEABLE_ROLE = "user";

const AUDIT_REFERENCE_COLUMNS = new Set([
  "actorId",
  "approvedBy",
  "bannedBy",
  "deletedBy",
  "moderatedBy",
  "reporterId",
  "resolvedBy",
  "reviewedBy",
  "senderId",
  "submittedBy",
  "targetUserId",
  "updatedBy",
  "verifiedBy",
]);

const AUTH_RELATIONS = new Set(["account", "account_merge", "session"]);
const AUDIT_RELATION_PATTERN =
  /(?:^|_)(?:audit|event|log|moderation|report|receipt|evidence)(?:_|$)/u;

export type AccountMergeUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  avatar: string | null;
  bio: string | null;
  creatorRoleProfile: Record<string, unknown>;
  passwordHash: string | null;
  role: string;
  status: string;
  sessionVersion: number;
  mergedIntoUserId: string | null;
};

export type UserReference = {
  schemaName: string;
  tableName: string;
  columnName: string;
};

export type AccountMergeProfilePreference = "target" | "source";

export type AccountMergeDedupePolicy = {
  tableName: string;
  userColumn: string;
  keyColumns: readonly string[];
  peerUserColumn?: string;
};

const ACCOUNT_MERGE_DEDUPE_POLICIES: readonly AccountMergeDedupePolicy[] = [
  { tableName: "subscription", userColumn: "userId", keyColumns: ["titleId"] },
  { tableName: "review_like", userColumn: "userId", keyColumns: ["reviewId"] },
  { tableName: "creator_collab_bookmark", userColumn: "userId", keyColumns: ["postId"] },
  { tableName: "creator_promotion_comment_like", userColumn: "userId", keyColumns: ["commentId"] },
  { tableName: "creator_promotion_bookmark", userColumn: "userId", keyColumns: ["postId"] },
  { tableName: "creator_work_like", userColumn: "userId", keyColumns: ["workId"] },
  { tableName: "creator_work_bookmark", userColumn: "userId", keyColumns: ["workId"] },
  { tableName: "creator_work_comment_like", userColumn: "userId", keyColumns: ["commentId"] },
  {
    tableName: "creator_follow",
    userColumn: "followerId",
    keyColumns: ["creatorId"],
    peerUserColumn: "creatorId",
  },
  {
    tableName: "creator_follow",
    userColumn: "creatorId",
    keyColumns: ["followerId"],
    peerUserColumn: "followerId",
  },
  {
    tableName: "member_message_block",
    userColumn: "blockerId",
    keyColumns: ["blockedUserId"],
    peerUserColumn: "blockedUserId",
  },
  {
    tableName: "member_message_block",
    userColumn: "blockedUserId",
    keyColumns: ["blockerId"],
    peerUserColumn: "blockerId",
  },
];

export function accountMergeDedupePolicyForReference(
  reference: UserReference,
): AccountMergeDedupePolicy | null {
  if (reference.schemaName !== "public") return null;
  return ACCOUNT_MERGE_DEDUPE_POLICIES.find(
    (policy) =>
      policy.tableName === reference.tableName
      && policy.userColumn === reference.columnName,
  ) ?? null;
}

export function normalizeAccountMergeProfilePreference(
  value: unknown,
): AccountMergeProfilePreference {
  return value === "source" ? "source" : "target";
}

export type AccountMergeProfilePreview = {
  name: string | null;
  image: string | null;
  avatar: string | null;
  bio: string | null;
};

export type AccountMergePreview = {
  source: {
    id: string;
    name: string | null;
    email: string | null;
    providers: string[];
    profile: AccountMergeProfilePreview;
  };
  target: {
    id: string;
    name: string | null;
    email: string | null;
    providers: string[];
    profile: AccountMergeProfilePreview;
  };
  affectedRecordCount: number;
  deduplicatedRecordCount: number;
  expiresAt: string;
  warnings: string[];
};

export class AccountMergeError extends Error {
  constructor(
    readonly code: string,
    readonly publicMessage: string,
    readonly status: 400 | 409 = 409,
  ) {
    super(publicMessage);
    this.name = "AccountMergeError";
  }
}

export class AccountMergeDataConflictError extends AccountMergeError {
  constructor() {
    super(
      "ACCOUNT_MERGE_DATA_CONFLICT",
      "두 계정에 같은 종류의 중복 데이터가 있어 자동 통합할 수 없어요. 어떤 데이터도 변경되지 않았습니다.",
      409,
    );
    this.name = "AccountMergeDataConflictError";
  }
}

export function tokenHash(token: string): string {
  return `sha256:${createHash("sha256").update(token, "utf8").digest("hex")}`;
}

export function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function isAccountMergeToken(value: unknown): value is string {
  return typeof value === "string" && ACCOUNT_MERGE_TOKEN_PATTERN.test(value);
}

export function maskAccountMergeEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}

export function shouldTransferUserReference(reference: UserReference): boolean {
  if (reference.schemaName !== "public") return false;
  if (AUTH_RELATIONS.has(reference.tableName)) return false;
  if (AUDIT_RELATION_PATTERN.test(reference.tableName)) return false;
  return !AUDIT_REFERENCE_COLUMNS.has(reference.columnName);
}

export function findProviderOverlap(
  sourceProviders: readonly string[],
  targetProviders: readonly string[],
): string[] {
  const target = new Set(targetProviders);
  return [...new Set(sourceProviders.filter((provider) => target.has(provider)))].sort();
}


export async function loadUser(
  client: PoolClient,
  userId: string,
  options: { lock?: boolean } = {},
): Promise<AccountMergeUserRow | null> {
  const lock = options.lock ? " FOR UPDATE" : "";
  const result = await client.query<AccountMergeUserRow>(
    `SELECT
      id,
      name,
      email,
      image,
      avatar,
      bio,
      "creatorRoleProfile",
      "passwordHash",
      role,
      status,
      "sessionVersion",
      "mergedIntoUserId"
    FROM public."user"
    WHERE id = $1${lock}`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export function assertMergeParticipant(
  row: AccountMergeUserRow | null,
  kind: "source" | "target",
): asserts row is AccountMergeUserRow {
  if (!row || row.status !== "active") {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_ACCOUNT_UNAVAILABLE",
      kind === "source"
        ? "통합할 보조 계정이 더 이상 활성 상태가 아니에요."
        : "현재 주 계정을 통합 대상으로 사용할 수 없어요.",
      409,
    );
  }
  if (row.role !== MERGEABLE_ROLE) {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_PRIVILEGED_ACCOUNT",
      "관리 권한이 있는 계정은 자동 통합할 수 없어요.",
      409,
    );
  }
}

export function assertSourceCanBeMerged(source: AccountMergeUserRow): void {
  if (source.passwordHash) {
    throw new AccountMergeError(
      "SOURCE_CREDENTIAL_ACCOUNT",
      "비밀번호 로그인 계정은 주 계정으로 사용해 주세요. 다른 소셜 계정에서 통합 코드를 만든 뒤 이 계정으로 가져오세요.",
      409,
    );
  }
}

export async function loadProviders(client: PoolClient, userId: string): Promise<string[]> {
  const result = await client.query<{ provider: string }>(
    `SELECT provider
     FROM public.account
     WHERE "userId" = $1
     ORDER BY provider`,
    [userId],
  );
  return [...new Set(result.rows.map((row) => row.provider))];
}

export function assertNoProviderOverlap(
  sourceProviders: readonly string[],
  targetProviders: readonly string[],
): void {
  const overlap = findProviderOverlap(sourceProviders, targetProviders);
  if (overlap.length > 0) {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_PROVIDER_CONFLICT",
      `두 계정에 같은 로그인 제공자(${overlap.join(", ")})가 연결되어 있어요. 유지할 로그인을 정한 뒤 한쪽 연결을 먼저 해제해 주세요.`,
      409,
    );
  }
}

export async function loadMergeGrant(
  client: PoolClient,
  token: string,
  options: { lock?: boolean } = {},
): Promise<{ id: string; sourceUserId: string; expiresAt: Date } | null> {
  if (!isAccountMergeToken(token)) return null;
  const lock = options.lock ? " FOR UPDATE" : "";
  const result = await client.query<{
    id: string;
    sourceUserId: string;
    expiresAt: Date;
  }>(
    `SELECT id, "sourceUserId", "expiresAt"
     FROM public.account_merge
     WHERE "tokenHash" = $1
       AND status = 'issued'
       AND "expiresAt" > now()${lock}`,
    [tokenHash(token)],
  );
  return result.rows[0] ?? null;
}

export async function discoverUserReferences(client: PoolClient): Promise<UserReference[]> {
  const result = await client.query<UserReference>(`
    SELECT
      child_namespace.nspname AS "schemaName",
      child_table.relname AS "tableName",
      child_attribute.attname AS "columnName"
    FROM pg_catalog.pg_constraint AS constraint_record
    JOIN pg_catalog.pg_class AS parent_table
      ON parent_table.oid = constraint_record.confrelid
    JOIN pg_catalog.pg_namespace AS parent_namespace
      ON parent_namespace.oid = parent_table.relnamespace
    JOIN pg_catalog.pg_class AS child_table
      ON child_table.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace AS child_namespace
      ON child_namespace.oid = child_table.relnamespace
    JOIN LATERAL unnest(constraint_record.conkey) WITH ORDINALITY
      AS child_key(attnum, ordinal_position) ON true
    JOIN LATERAL unnest(constraint_record.confkey) WITH ORDINALITY
      AS parent_key(attnum, ordinal_position)
      ON parent_key.ordinal_position = child_key.ordinal_position
    JOIN pg_catalog.pg_attribute AS child_attribute
      ON child_attribute.attrelid = child_table.oid
      AND child_attribute.attnum = child_key.attnum
    JOIN pg_catalog.pg_attribute AS parent_attribute
      ON parent_attribute.attrelid = parent_table.oid
      AND parent_attribute.attnum = parent_key.attnum
    WHERE constraint_record.contype = 'f'
      AND parent_namespace.nspname = 'public'
      AND parent_table.relname = 'user'
      AND parent_attribute.attname = 'id'
  `);
  return result.rows.filter(shouldTransferUserReference);
}

export async function canUpdateReference(
  client: PoolClient,
  reference: UserReference,
): Promise<boolean> {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT pg_catalog.has_column_privilege(
       current_user,
       child_table.oid,
       child_attribute.attnum,
       'UPDATE'
     ) AS allowed
     FROM pg_catalog.pg_class AS child_table
     JOIN pg_catalog.pg_namespace AS child_namespace
       ON child_namespace.oid = child_table.relnamespace
     JOIN pg_catalog.pg_attribute AS child_attribute
       ON child_attribute.attrelid = child_table.oid
     WHERE child_namespace.nspname = $1
       AND child_table.relname = $2
       AND child_attribute.attname = $3
       AND child_attribute.attnum > 0
       AND NOT child_attribute.attisdropped`,
    [reference.schemaName, reference.tableName, reference.columnName],
  );
  return result.rows[0]?.allowed === true;
}

export async function assertTransferPermissions(
  client: PoolClient,
  sourceUserId: string,
  references: readonly UserReference[],
): Promise<void> {
  for (const reference of references) {
    const countResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM ${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)}
       WHERE ${quoteIdentifier(reference.columnName)} = $1`,
      [sourceUserId],
    );
    if (Number(countResult.rows[0]?.count ?? 0) === 0) continue;
    if (!(await canUpdateReference(client, reference))) {
      throw new AccountMergeError(
        "ACCOUNT_MERGE_MANUAL_REQUIRED",
        "이 계정에는 자동 이전할 수 없는 보호 데이터가 있어요. 데이터는 변경되지 않았습니다. 운영팀을 통해 안전하게 통합해 주세요.",
        409,
      );
    }
  }
}

export async function countTransferableRecords(
  client: PoolClient,
  sourceUserId: string,
  references: readonly UserReference[],
): Promise<number> {
  let total = 0;
  for (const reference of references) {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM ${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)}
       WHERE ${quoteIdentifier(reference.columnName)} = $1`,
      [sourceUserId],
    );
    total += Number(result.rows[0]?.count ?? 0);
  }
  return total;
}

