/**
 * referral-credit-claim.ts — 동료 작가·어시스턴트 초대 합류 양방향 보너스 크레딧.
 *
 * 광고비 0원 초기 팀 단위 확산을 위해 초대자(inviter)와 합류자(invitee) 양쪽에
 * 비현금 프로모션 크레딧(+100C, 90일 유효)을 지급하되:
 *  - 본인 코드 자가 입력 차단
 *  - 피초대 계정당 생애 1회만 등록 허용
 *  - 월간 무상 프로모션 풀(`MONTHLY_ACTIVITY_CREDIT_POOL_CAP`) 한도 내 통합 집행
 */

import { BadRequestException, ConflictException } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { appSettings, db } from "../../platform/database";
import { createSchemaReadinessCheck } from "../health/schema-readiness";
import {
  MONTHLY_ACTIVITY_CREDIT_POOL_CAP,
  REFERRAL_BONUS_CREDITS,
  type ActivityGrantAssetWallet,
} from "./activity-credit-wallet-adapter";
import { activityRewardExpiry } from "./credit-activity-rewards";

const REFERRAL_SETTING_KEY = "credit_referral_claims";

export const REFERRAL_CLAIM_STORE = Symbol("REFERRAL_CLAIM_STORE");

const ensureSettingsTable = createSchemaReadinessCheck([
  'SELECT "key", "value", "updatedAt" FROM "app_setting" WHERE FALSE',
]);

export interface ReferralClaimRecord {
  readonly inviteeUserId: string;
  readonly inviterUserId: string;
  readonly claimedAt: string;
}

export interface ReferralClaimStore {
  hasClaimed(inviteeUserId: string): Promise<boolean>;
  recordClaim(record: ReferralClaimRecord): Promise<{ totalClaims: number }>;
}

const inMemoryReferralClaims: ReferralClaimRecord[] = [];

export const defaultReferralClaimStore: ReferralClaimStore = {
  async hasClaimed(inviteeUserId: string) {
    if (!process.env.DATABASE_URL?.trim()) {
      return inMemoryReferralClaims.some(
        (item) => item.inviteeUserId === inviteeUserId,
      );
    }
    await ensureSettingsTable();
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, REFERRAL_SETTING_KEY))
      .limit(1);
    const existing = (rows[0]?.value ?? {}) as { items?: ReferralClaimRecord[] };
    const items = Array.isArray(existing.items) ? existing.items : [];
    return items.some((item) => item.inviteeUserId === inviteeUserId);
  },

  async recordClaim(record: ReferralClaimRecord) {
    if (!process.env.DATABASE_URL?.trim()) {
      inMemoryReferralClaims.push(record);
      return { totalClaims: inMemoryReferralClaims.length };
    }
    await ensureSettingsTable();
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, REFERRAL_SETTING_KEY))
      .limit(1);
    const existing = (rows[0]?.value ?? {}) as { items?: ReferralClaimRecord[] };
    const items = Array.isArray(existing.items) ? existing.items : [];
    const nextItems = [...items.slice(-999), record];
    const updatedAt = new Date();
    await db
      .insert(appSettings)
      .values({
        key: REFERRAL_SETTING_KEY,
        value: { items: nextItems, count: nextItems.length },
        updatedAt,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: { items: nextItems, count: nextItems.length }, updatedAt },
      });
    return { totalClaims: nextItems.length };
  },
};

export function normalizeInviterCode(raw: unknown): string {
  const clean = typeof raw === "string" ? raw.trim() : "";
  if (clean.startsWith("TS-")) {
    return clean.slice(3).trim();
  }
  return clean;
}

export async function executeReferralCreditClaim(input: {
  inviteeUserId: string;
  inviterCodeRaw: unknown;
  monthlyPoolGrantedCredits: number;
  store: ReferralClaimStore;
  wallet: ActivityGrantAssetWallet;
  now?: Date;
}): Promise<{
  claimed: true;
  inviteeCredits: number;
  inviterCredits: number;
  inviterUserId: string;
  expiresAt: string;
}> {
  const inviterUserId = normalizeInviterCode(input.inviterCodeRaw);
  if (inviterUserId.length < 2 || inviterUserId.length > 80) {
    throw new BadRequestException("유효한 동료 초대 코드를 입력해 주세요.");
  }
  if (inviterUserId === input.inviteeUserId) {
    throw new BadRequestException("본인의 초대 코드는 등록할 수 없습니다.");
  }
  if (await input.store.hasClaimed(input.inviteeUserId)) {
    throw new ConflictException("이미 동료 초대 보너스를 수령한 계정입니다.");
  }

  const totalNeeded = REFERRAL_BONUS_CREDITS * 2;
  if (input.monthlyPoolGrantedCredits + totalNeeded > MONTHLY_ACTIVITY_CREDIT_POOL_CAP) {
    throw new ConflictException(
      "이번 달 무상 보너스 크레딧 발행 한도가 모두 소진되었습니다.",
    );
  }

  const now = input.now ?? new Date();
  const expiresAt = activityRewardExpiry(now);

  await input.wallet.grantAsset({
    userId: input.inviteeUserId,
    asset: "studio_credit",
    amount: REFERRAL_BONUS_CREDITS,
    source: "activity:referral.invitee",
    sourceKey: `activity:referral.invitee:${input.inviteeUserId}`,
    sourceRef: inviterUserId,
    expiresAt,
    reason: "동료 초대 합류 보너스 크레딧",
    metadata: { inviterUserId, role: "invitee" },
  });

  await input.wallet.grantAsset({
    userId: inviterUserId,
    asset: "studio_credit",
    amount: REFERRAL_BONUS_CREDITS,
    source: "activity:referral.inviter",
    sourceKey: `activity:referral.inviter:${inviterUserId}:${input.inviteeUserId}`,
    sourceRef: input.inviteeUserId,
    expiresAt,
    reason: "동료 초대 성사 보너스 크레딧",
    metadata: { inviteeUserId: input.inviteeUserId, role: "inviter" },
  });

  await input.store.recordClaim({
    inviteeUserId: input.inviteeUserId,
    inviterUserId,
    claimedAt: now.toISOString(),
  });

  return {
    claimed: true,
    inviteeCredits: REFERRAL_BONUS_CREDITS,
    inviterCredits: REFERRAL_BONUS_CREDITS,
    inviterUserId,
    expiresAt: expiresAt.toISOString(),
  };
}
