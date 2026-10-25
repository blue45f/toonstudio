import { randomBytes, randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { dbPool } from "../../platform/database";

import {
  ACCOUNT_MERGE_TOKEN_TTL_MS,
  AccountMergeDataConflictError,
  AccountMergeError,
  accountMergeDedupePolicyForReference,
  maskAccountMergeEmail,
  normalizeAccountMergeProfilePreference,
  quoteIdentifier,
  assertMergeParticipant,
  assertNoProviderOverlap,
  assertSourceCanBeMerged,
  assertTransferPermissions,
  countTransferableRecords,
  discoverUserReferences,
  loadMergeGrant,
  loadProviders,
  loadUser,
  tokenHash,
  type AccountMergeDedupePolicy,
  type AccountMergePreview,
  type AccountMergeProfilePreference,
  type AccountMergeProfilePreview,
  type AccountMergeUserRow,
  type UserReference,
} from "./account-merge-policy";

export {
  ACCOUNT_MERGE_TOKEN_TTL_MS,
  AccountMergeDataConflictError,
  AccountMergeError,
  accountMergeDedupePolicyForReference,
  findProviderOverlap,
  isAccountMergeToken,
  maskAccountMergeEmail,
  normalizeAccountMergeProfilePreference,
  shouldTransferUserReference,
  type AccountMergeDedupePolicy,
  type AccountMergePreview,
  type AccountMergeProfilePreference,
  type UserReference,
} from "./account-merge-policy";

function dedupeKeyPredicate(policy: AccountMergeDedupePolicy): string {
  return policy.keyColumns
    .map((column) => {
      const quoted = quoteIdentifier(column);
      return `source_row.${quoted} IS NOT DISTINCT FROM target_row.${quoted}`;
    })
    .join(" AND ");
}

async function countDeduplicatedReferenceRecords(
  client: PoolClient,
  sourceUserId: string,
  targetUserId: string,
  reference: UserReference,
): Promise<number> {
  const policy = accountMergeDedupePolicyForReference(reference);
  if (!policy) return 0;
  const table = `${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)}`;
  const userColumn = quoteIdentifier(policy.userColumn);
  let total = 0;

  if (policy.peerUserColumn) {
    const peerColumn = quoteIdentifier(policy.peerUserColumn);
    const selfResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM ${table} AS source_row
       WHERE source_row.${userColumn} = $1
         AND source_row.${peerColumn} = $2`,
      [sourceUserId, targetUserId],
    );
    total += Number(selfResult.rows[0]?.count ?? 0);
  }

  const duplicateResult = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM ${table} AS source_row
     WHERE source_row.${userColumn} = $1
       ${policy.peerUserColumn
         ? `AND source_row.${quoteIdentifier(policy.peerUserColumn)} IS DISTINCT FROM $2`
         : ""}
       AND EXISTS (
         SELECT 1
         FROM ${table} AS target_row
         WHERE target_row.${userColumn} = $2
           AND ${dedupeKeyPredicate(policy)}
       )`,
    [sourceUserId, targetUserId],
  );
  total += Number(duplicateResult.rows[0]?.count ?? 0);
  return total;
}

async function countDeduplicatedRecords(
  client: PoolClient,
  sourceUserId: string,
  targetUserId: string,
  references: readonly UserReference[],
): Promise<number> {
  let total = 0;
  for (const reference of references) {
    total += await countDeduplicatedReferenceRecords(
      client,
      sourceUserId,
      targetUserId,
      reference,
    );
  }
  return total;
}

async function deduplicateReferenceRecords(
  client: PoolClient,
  sourceUserId: string,
  targetUserId: string,
  reference: UserReference,
): Promise<number> {
  const policy = accountMergeDedupePolicyForReference(reference);
  if (!policy) return 0;
  const table = `${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)}`;
  const userColumn = quoteIdentifier(policy.userColumn);
  let removed = 0;

  if (policy.peerUserColumn) {
    const peerColumn = quoteIdentifier(policy.peerUserColumn);
    const selfResult = await client.query(
      `DELETE FROM ${table}
       WHERE ${userColumn} = $1 AND ${peerColumn} = $2`,
      [sourceUserId, targetUserId],
    );
    removed += selfResult.rowCount ?? 0;
  }

  const duplicateResult = await client.query(
    `DELETE FROM ${table} AS source_row
     WHERE source_row.${userColumn} = $1
       AND EXISTS (
         SELECT 1
         FROM ${table} AS target_row
         WHERE target_row.${userColumn} = $2
           AND ${dedupeKeyPredicate(policy)}
       )`,
    [sourceUserId, targetUserId],
  );
  removed += duplicateResult.rowCount ?? 0;
  return removed;
}

async function assertStudioAiMergeReady(
  client: PoolClient,
  sourceUserId: string,
  targetUserId: string,
): Promise<void> {
  const userIds = [sourceUserId, targetUserId].sort();
  for (const userId of userIds) {
    await client.query(
      `SELECT pg_catalog.pg_advisory_xact_lock(
         pg_catalog.hashtextextended($1::text, 761903441)
       )`,
      [userId],
    );
  }
  const activeLease = await client.query<{ userId: string }>(
    `SELECT "userId"
     FROM public.studio_ai_request_gate
     WHERE "userId" = ANY($1::text[])
       AND "leaseTokenHash" IS NOT NULL
       AND "leaseExpiresAt" > clock_timestamp()
     FOR UPDATE`,
    [userIds],
  );
  if ((activeLease.rowCount ?? 0) > 0) {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_AI_REQUEST_IN_FLIGHT",
      "AI 생성 요청이 처리 중인 계정이 있어요. 요청이 끝난 뒤 계정 통합을 다시 시도해 주세요.",
      409,
    );
  }
}

async function consolidateStudioAiUsageState(
  client: PoolClient,
  sourceUserId: string,
  targetUserId: string,
): Promise<number> {
  let consolidated = 0;
  const gateResult = await client.query(
    `INSERT INTO public.studio_ai_request_gate AS target_gate (
       "userId", "requestTimes", "leaseTokenHash", "leaseFence", "leaseExpiresAt", "createdAt", "updatedAt"
     )
     SELECT $1, "requestTimes", NULL, "leaseFence" + 1, NULL, "createdAt", clock_timestamp()
     FROM public.studio_ai_request_gate
     WHERE "userId" = $2
     ON CONFLICT ("userId") DO UPDATE SET
       "requestTimes" = ARRAY(
         SELECT merged."at"
         FROM (
           SELECT recent."at"
           FROM unnest(
             target_gate."requestTimes" || EXCLUDED."requestTimes"
           ) AS recent("at")
           ORDER BY recent."at" DESC
           LIMIT 10000
         ) AS merged
         ORDER BY merged."at"
       ),
       "leaseTokenHash" = NULL,
       "leaseFence" = GREATEST(
         target_gate."leaseFence",
         EXCLUDED."leaseFence"
       ) + 1,
       "leaseExpiresAt" = NULL,
       "createdAt" = LEAST(target_gate."createdAt", EXCLUDED."createdAt"),
       "updatedAt" = clock_timestamp()
     RETURNING "userId"`,
    [targetUserId, sourceUserId],
  );
  if ((gateResult.rowCount ?? 0) > 0) {
    await client.query(
      `DELETE FROM public.studio_ai_request_gate WHERE "userId" = $1`,
      [sourceUserId],
    );
    consolidated += 1;
  }

  const dailyResult = await client.query(
    `INSERT INTO public.studio_ai_daily_quota AS target_quota (
       "userId", "usageDay", "requestCount", "tokenCount", "reservedTokens", "createdAt", "updatedAt"
     )
     SELECT $1, "usageDay", "requestCount", "tokenCount", "reservedTokens", "createdAt", "updatedAt"
     FROM public.studio_ai_daily_quota
     WHERE "userId" = $2
     ON CONFLICT ("userId", "usageDay") DO UPDATE SET
       "requestCount" = target_quota."requestCount" + EXCLUDED."requestCount",
       "tokenCount" = target_quota."tokenCount" + EXCLUDED."tokenCount",
       "reservedTokens" = target_quota."reservedTokens" + EXCLUDED."reservedTokens",
       "createdAt" = LEAST(target_quota."createdAt", EXCLUDED."createdAt"),
       "updatedAt" = GREATEST(target_quota."updatedAt", EXCLUDED."updatedAt")
     RETURNING "usageDay"`,
    [targetUserId, sourceUserId],
  );
  if ((dailyResult.rowCount ?? 0) > 0) {
    await client.query(
      `DELETE FROM public.studio_ai_daily_quota WHERE "userId" = $1`,
      [sourceUserId],
    );
    consolidated += dailyResult.rowCount ?? 0;
  }
  return consolidated;
}

async function transferReferences(
  client: PoolClient,
  sourceUserId: string,
  targetUserId: string,
  references: readonly UserReference[],
): Promise<{ transferredRecordCount: number; deduplicatedRecordCount: number }> {
  let transferredRecordCount = 0;
  let deduplicatedRecordCount = 0;
  for (const reference of references) {
    const countResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM ${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)}
       WHERE ${quoteIdentifier(reference.columnName)} = $1`,
      [sourceUserId],
    );
    if (Number(countResult.rows[0]?.count ?? 0) === 0) continue;
    deduplicatedRecordCount += await deduplicateReferenceRecords(
      client,
      sourceUserId,
      targetUserId,
      reference,
    );
    const result = await client.query(
      `UPDATE ${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)}
       SET ${quoteIdentifier(reference.columnName)} = $1
       WHERE ${quoteIdentifier(reference.columnName)} = $2`,
      [targetUserId, sourceUserId],
    );
    transferredRecordCount += result.rowCount ?? 0;
  }
  return { transferredRecordCount, deduplicatedRecordCount };
}

async function prepareMerge(
  client: PoolClient,
  targetUserId: string,
  token: string,
  options: { lock?: boolean } = {},
) {
  const grant = await loadMergeGrant(client, token, options);
  if (!grant) {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_TOKEN_INVALID",
      "통합 코드가 만료되었거나 이미 사용되었어요. 보조 계정에서 새 코드를 만들어 주세요.",
      400,
    );
  }
  if (grant.sourceUserId === targetUserId) {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_SAME_ACCOUNT",
      "같은 계정끼리는 통합할 수 없어요.",
      400,
    );
  }

  const orderedIds = [grant.sourceUserId, targetUserId].sort();
  if (options.lock) {
    await client.query(
      `SELECT id FROM public."user" WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE`,
      [orderedIds],
    );
  }

  const [source, target] = await Promise.all([
    loadUser(client, grant.sourceUserId),
    loadUser(client, targetUserId),
  ]);
  assertMergeParticipant(source, "source");
  assertMergeParticipant(target, "target");
  assertSourceCanBeMerged(source);

  const [sourceProviders, targetProviders] = await Promise.all([
    loadProviders(client, source.id),
    loadProviders(client, target.id),
  ]);
  if (sourceProviders.length === 0) {
    throw new AccountMergeError(
      "ACCOUNT_MERGE_SOURCE_NO_LOGIN",
      "보조 계정에 이전할 소셜 로그인 수단이 없어요.",
      409,
    );
  }
  assertNoProviderOverlap(sourceProviders, targetProviders);

  return { grant, source, target, sourceProviders, targetProviders };
}

export async function issueAccountMergeToken(
  sourceUserId: string,
): Promise<{ token: string; expiresAt: string }> {
  const client = await dbPool.connect();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ACCOUNT_MERGE_TOKEN_TTL_MS);
  try {
    await client.query("BEGIN");
    const source = await loadUser(client, sourceUserId, { lock: true });
    assertMergeParticipant(source, "source");
    assertSourceCanBeMerged(source);
    const providers = await loadProviders(client, source.id);
    if (providers.length === 0) {
      throw new AccountMergeError(
        "ACCOUNT_MERGE_SOURCE_NO_LOGIN",
        "이 계정에는 다른 계정으로 이전할 소셜 로그인 수단이 없어요.",
        409,
      );
    }

    await client.query(
      `UPDATE public.account_merge
       SET status = 'cancelled'
       WHERE "sourceUserId" = $1 AND status = 'issued'`,
      [source.id],
    );
    await client.query(
      `INSERT INTO public.account_merge (
        id, "sourceUserId", "targetUserId", "tokenHash", status, "expiresAt", summary
      ) VALUES ($1, $2, NULL, $3, 'issued', $4, $5::jsonb)`,
      [
        randomUUID(),
        source.id,
        tokenHash(token),
        expiresAt,
        JSON.stringify({ sourceProviders: providers }),
      ],
    );
    await client.query("COMMIT");
    return { token, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function previewAccountMerge(
  targetUserId: string,
  token: string,
): Promise<AccountMergePreview> {
  const client = await dbPool.connect();
  try {
    const prepared = await prepareMerge(client, targetUserId, token);
    const references = await discoverUserReferences(client);
    await assertTransferPermissions(client, prepared.source.id, references);
    const [affectedRecordCount, deduplicatedRecordCount] = await Promise.all([
      countTransferableRecords(client, prepared.source.id, references),
      countDeduplicatedRecords(
        client,
        prepared.source.id,
        prepared.target.id,
        references,
      ),
    ]);
    const profilePreview = (user: AccountMergeUserRow): AccountMergeProfilePreview => ({
      name: user.name,
      image: user.image,
      avatar: user.avatar,
      bio: user.bio,
    });
    return {
      source: {
        id: prepared.source.id,
        name: prepared.source.name,
        email: maskAccountMergeEmail(prepared.source.email),
        providers: prepared.sourceProviders,
        profile: profilePreview(prepared.source),
      },
      target: {
        id: prepared.target.id,
        name: prepared.target.name,
        email: maskAccountMergeEmail(prepared.target.email),
        providers: prepared.targetProviders,
        profile: profilePreview(prepared.target),
      },
      affectedRecordCount,
      deduplicatedRecordCount,
      expiresAt: prepared.grant.expiresAt.toISOString(),
      warnings: [
        "프로젝트·에셋·구매·활동 소유권과 로그인 수단은 유지할 계정으로 이전돼요.",
        "좋아요·북마크·팔로우처럼 같은 항목이 겹쳐도 의미가 같은 데이터는 중복을 제거한 뒤 합쳐요.",
        "AI 일일 사용량과 최근 요청 제한은 두 계정의 사용량을 합쳐 무료 한도가 초기화되지 않아요.",
        "리뷰·평점·멤버 역할처럼 자동 선택하면 의미가 달라지는 충돌은 전체 통합을 중단해요.",
        "운영·신고·감사 기록의 작성자 식별자는 보조 계정에 그대로 남아 이력을 보존해요.",
      ],
    };
  } finally {
    client.release();
  }
}

export async function confirmAccountMerge(
  targetUserId: string,
  token: string,
  options: { profilePreference?: unknown } = {},
): Promise<{
  sourceUserId: string;
  targetUserId: string;
  sourceSessionVersion: number;
  targetSessionVersion: number;
  transferredRecordCount: number;
  deduplicatedRecordCount: number;
  consolidatedQuotaRecordCount: number;
  profilePreference: AccountMergeProfilePreference;
  providers: string[];
}> {
  const client = await dbPool.connect();
  const profilePreference = normalizeAccountMergeProfilePreference(
    options.profilePreference,
  );
  try {
    await client.query("BEGIN");
    const prepared = await prepareMerge(client, targetUserId, token, { lock: true });
    const references = await discoverUserReferences(client);
    await assertTransferPermissions(client, prepared.source.id, references);

    let transferredRecordCount: number;
    let deduplicatedRecordCount: number;
    let consolidatedQuotaRecordCount: number;
    try {
      await assertStudioAiMergeReady(
        client,
        prepared.source.id,
        prepared.target.id,
      );
      consolidatedQuotaRecordCount = await consolidateStudioAiUsageState(
        client,
        prepared.source.id,
        prepared.target.id,
      );
      const transferred = await transferReferences(
        client,
        prepared.source.id,
        prepared.target.id,
        references,
      );
      transferredRecordCount = transferred.transferredRecordCount;
      deduplicatedRecordCount = transferred.deduplicatedRecordCount;
      const accountTransfer = await client.query(
        `UPDATE public.account SET "userId" = $1 WHERE "userId" = $2`,
        [prepared.target.id, prepared.source.id],
      );
      transferredRecordCount += accountTransfer.rowCount ?? 0;
    } catch (error: unknown) {
      if (
        typeof error === "object"
        && error !== null
        && "code" in error
        && (error as { code?: unknown }).code === "23505"
      ) {
        throw new AccountMergeDataConflictError();
      }
      throw error;
    }

    await client.query(
      `DELETE FROM public.session WHERE "userId" = ANY($1::text[])`,
      [[prepared.source.id, prepared.target.id]],
    );
    await client.query(
      `DELETE FROM public."verificationToken"
       WHERE identifier = ANY($1::text[])`,
      [[
        `verify-email:${prepared.source.id}`,
        `reset-password:${prepared.source.id}`,
        `verify-email:${prepared.target.id}`,
        `reset-password:${prepared.target.id}`,
      ]],
    );

    const targetUpdate = profilePreference === "source"
      ? await client.query<{ sessionVersion: number }>(
          `UPDATE public."user"
           SET
             name = $2,
             image = $3,
             avatar = $4,
             bio = $5,
             "creatorRoleProfile" = $6::jsonb,
             "sessionVersion" = "sessionVersion" + 1
           WHERE id = $1
           RETURNING "sessionVersion"`,
          [
            prepared.target.id,
            prepared.source.name,
            prepared.source.image,
            prepared.source.avatar,
            prepared.source.bio,
            JSON.stringify(prepared.source.creatorRoleProfile ?? {}),
          ],
        )
      : await client.query<{ sessionVersion: number }>(
          `UPDATE public."user"
           SET "sessionVersion" = "sessionVersion" + 1
           WHERE id = $1
           RETURNING "sessionVersion"`,
          [prepared.target.id],
        );
    const mergedEmail = `merged+${prepared.source.id}.${Date.now()}@merged.local`.slice(0, 240);
    const sourceUpdate = await client.query<{ sessionVersion: number }>(
      `UPDATE public."user"
       SET
         status = 'merged',
         "mergedIntoUserId" = $1,
         "sessionVersion" = "sessionVersion" + 1,
         email = $2,
         "emailVerified" = NULL,
         "passwordHash" = NULL,
         "suspendedAt" = NULL,
         "suspensionReason" = NULL,
         "deletedAt" = NULL,
         role = 'user'
       WHERE id = $3
       RETURNING "sessionVersion"`,
      [prepared.target.id, mergedEmail, prepared.source.id],
    );

    const targetSessionVersion = targetUpdate.rows[0]?.sessionVersion;
    const sourceSessionVersion = sourceUpdate.rows[0]?.sessionVersion;
    if (!targetSessionVersion || !sourceSessionVersion) {
      throw new Error("account merge session version update failed");
    }

    const providers = [...prepared.targetProviders, ...prepared.sourceProviders].sort();
    await client.query(
      `UPDATE public.account_merge
       SET
         status = 'completed',
         "targetUserId" = $1,
         "completedAt" = now(),
         summary = $2::jsonb
       WHERE id = $3 AND status = 'issued'`,
      [
        prepared.target.id,
        JSON.stringify({
          transferredRecordCount,
          deduplicatedRecordCount,
          consolidatedQuotaRecordCount,
          profilePreference,
          providers,
        }),
        prepared.grant.id,
      ],
    );

    await client.query("COMMIT");
    return {
      sourceUserId: prepared.source.id,
      targetUserId: prepared.target.id,
      sourceSessionVersion,
      targetSessionVersion,
      transferredRecordCount,
      deduplicatedRecordCount,
      consolidatedQuotaRecordCount,
      profilePreference,
      providers,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
