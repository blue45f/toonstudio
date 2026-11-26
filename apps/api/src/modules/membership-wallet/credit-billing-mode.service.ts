/**
 * credit-billing-mode.service.ts — 2단계 과금 모드(사업자등록 전 무료·활동 크레딧 검증 ↔
 * 정식 유료 크레딧 구독·충전) 조회, 무결제 사전예약 수요 계측, 활동 보상 크레딧 디스패처.
 *
 * MembershipWalletService(1,884줄)는 크기 래칫 기준선을 지키기 위해 수정하지 않고,
 * 형제 서비스에서 공개 인터페이스만 조합한다.
 */

import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import { eq } from "drizzle-orm";

import {
  MEMBERSHIP_PLAN_POLICIES,
  isActivityPointKey,
  isMembershipPlanId,
  type ActivityPointKey,
  type MembershipPlanId,
  type RewardMilestoneKey,
} from "../../../../../packages/core/src/membership-wallet";
import { appSettings, db, dbPool } from "../../platform/database";
import { logAuditAction } from "../admin/admin-types";
import { createSchemaReadinessCheck } from "../health/schema-readiness";
import {
  ACTIVITY_STUDIO_CREDIT_REWARD_CATALOG,
  MILESTONE_STUDIO_CREDIT_REWARD_CATALOG,
  MONTHLY_ACTIVITY_CREDIT_POOL_CAP,
  createActivityCreditWallet,
  resolveActivityCreditSpec,
  resolveMilestoneCreditSpec,
  type ActivityStudioCreditCatalogItem,
  type MilestoneStudioCreditCatalogItem,
} from "./activity-credit-wallet-adapter";
import {
  CREDIT_ACTIVITY_REWARD_EXPIRY_DAYS,
  activityRewardExpiry,
  buildActivityRewardGrant,
  grantActivityReward,
} from "./credit-activity-rewards";
import {
  REFERRAL_CLAIM_STORE,
  defaultReferralClaimStore,
  executeReferralCreditClaim,
  type ReferralClaimStore,
} from "./referral-credit-claim";
import { CREDIT_PACK_CATALOG, findCreditPack, type CreditPack } from "./credit-pack-catalog";
import { KRW_PER_CREDIT } from "./credit-pricing";
import {
  CREDIT_PURCHASES_ENABLED,
  CreditPurchaseError,
  requestCreditPurchase,
  type CreditPurchaseIntentInput,
  type CreditPurchaseWallet,
} from "./credit-purchase-intent";
import type { MembershipRewardService } from "./membership-wallet.tokens";
import { MembershipWalletService, requireUserId } from "./membership-wallet.service";
import {
  PAID_OPERATIONS_SETTING_STORE,
  resolvePaidOperationsEnabled,
  type PaidOperationsSettingStore,
} from "./paid-operations-gate";
import { paidOperationsSettingStore } from "./paid-operations-setting";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WAITLIST_SETTING_KEY = "credit_waitlist_summary";

export const WAITLIST_INTENT_STORE = Symbol("WAITLIST_INTENT_STORE");
export const ACTIVITY_CREDIT_LEDGER_PROBE = Symbol(
  "ACTIVITY_CREDIT_LEDGER_PROBE",
);

const ensureSettingsTable = createSchemaReadinessCheck([
  'SELECT "key", "value", "updatedAt" FROM "app_setting" WHERE FALSE',
]);

export interface SubscriptionCreditPlanSummary {
  readonly planId: Exclude<MembershipPlanId, "free">;
  readonly label: string;
  readonly monthlyIncludedCredits: number;
  readonly monthlyPriceKrw: number;
  readonly targetRoleKo: string;
}

export const SUBSCRIPTION_CREDIT_PLANS: readonly SubscriptionCreditPlanSummary[] =
  Object.freeze([
    {
      planId: "creator",
      label: MEMBERSHIP_PLAN_POLICIES.creator.label,
      monthlyIncludedCredits: Number(
        MEMBERSHIP_PLAN_POLICIES.creator.entitlements["credit.monthlyIncluded"],
      ),
      monthlyPriceKrw: 9_900,
      targetRoleKo: "개인 연재·일러스트 창작자",
    },
    {
      planId: "pro",
      label: MEMBERSHIP_PLAN_POLICIES.pro.label,
      monthlyIncludedCredits: Number(
        MEMBERSHIP_PLAN_POLICIES.pro.entitlements["credit.monthlyIncluded"],
      ),
      monthlyPriceKrw: 19_900,
      targetRoleKo: "전문 작가·고해상도 원고 제작",
    },
    {
      planId: "team",
      label: MEMBERSHIP_PLAN_POLICIES.team.label,
      monthlyIncludedCredits: Number(
        MEMBERSHIP_PLAN_POLICIES.team.entitlements["credit.monthlyIncluded"],
      ),
      monthlyPriceKrw: 29_000,
      targetRoleKo: "소규모 웹툰 제작팀(PD 결재·비교 검수·승인본 인계)",
    },
  ]);

export interface BillingModeResponse {
  readonly paidOperationsEnabled: boolean;
  readonly mode: "free-activity-beta" | "paid-credit-active";
  readonly subscriptionsEnabled: boolean;
  readonly creditPurchasesEnabled: boolean;
  readonly krwPerCredit: number;
  readonly activityRewardExpiryDays: number;
  readonly monthlyActivityCreditPoolCap: number;
  readonly creditPacks: readonly CreditPack[];
  readonly subscriptionPlans: readonly SubscriptionCreditPlanSummary[];
  readonly activityCreditRewards: readonly ActivityStudioCreditCatalogItem[];
  readonly milestoneCreditRewards: readonly MilestoneStudioCreditCatalogItem[];
}

export interface ActivityCreditLedgerProbe {
  inspectGrantState(input: {
    userId: string;
    activityKey: ActivityPointKey;
    sourceKey: string;
    dayStart: Date;
    dayEnd: Date;
    monthStart: Date;
    monthEnd: Date;
  }): Promise<{
    duplicateSourceRef: boolean;
    grantedTodayCount: number;
    lastGrantedAtMs: number | null;
    monthlyPoolGrantedCredits: number;
    detectedContentKind?: "webtoon" | "illustration";
  }>;
  detectWorkContentKind?(
    workId: string,
  ): Promise<"webtoon" | "illustration" | undefined>;
}

function kstWindow(now: Date) {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const dayKey = shifted.toISOString().slice(0, 10);
  const [year, month, day] = dayKey.split("-").map(Number);
  const dayStart = new Date(Date.UTC(year!, month! - 1, day!) - KST_OFFSET_MS);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const monthStart = new Date(Date.UTC(year!, month! - 1, 1) - KST_OFFSET_MS);
  const monthEnd = new Date(Date.UTC(year!, month!, 1) - KST_OFFSET_MS);
  return { dayKey, dayStart, dayEnd, monthStart, monthEnd };
}

const defaultLedgerProbe: ActivityCreditLedgerProbe = {
  async inspectGrantState(input) {
    const sourceTag = `activity:${input.activityKey}`;
    const [dupRes, dayRes, monthRes] = await Promise.all([
      dbPool.query<{ id: string }>(
        `SELECT id FROM wallet_lot
         WHERE "userId" = $1 AND asset = 'studio_credit' AND "sourceKey" = $2
         LIMIT 1`,
        [input.userId, input.sourceKey],
      ),
      dbPool.query<{ cnt: string | number; latest: Date | null }>(
        `SELECT COUNT(*)::int AS cnt, MAX("createdAt") AS latest
         FROM wallet_lot
         WHERE "userId" = $1
           AND asset = 'studio_credit'
           AND source = $2
           AND "createdAt" >= $3
           AND "createdAt" < $4`,
        [input.userId, sourceTag, input.dayStart, input.dayEnd],
      ),
      dbPool.query<{ total: string | number }>(
        `SELECT COALESCE(SUM("grantedAmount"), 0)::bigint AS total
         FROM wallet_lot
         WHERE asset = 'studio_credit'
           AND source LIKE 'activity:%'
           AND "createdAt" >= $1
           AND "createdAt" < $2`,
        [input.monthStart, input.monthEnd],
      ),
    ]);
    const latest = dayRes.rows[0]?.latest;
    return {
      duplicateSourceRef: Boolean(dupRes.rows[0]),
      grantedTodayCount: Number(dayRes.rows[0]?.cnt ?? 0),
      lastGrantedAtMs: latest ? new Date(latest).getTime() : null,
      monthlyPoolGrantedCredits: Number(monthRes.rows[0]?.total ?? 0),
    };
  },
  async detectWorkContentKind(workId: string) {
    const res = await dbPool.query<{
      format: string | null;
      seriesId: string | null;
      pageCount: number | string | null;
    }>(
      `SELECT format, "seriesId",
              CASE
                WHEN jsonb_typeof(pages) = 'array' THEN jsonb_array_length(pages)
                ELSE 0
              END AS "pageCount"
       FROM creator_work
       WHERE id = $1
       LIMIT 1`,
      [workId],
    );
    const row = res.rows[0];
    if (!row) return undefined;
    if (
      row.seriesId
      || (row.format === "cuttoon" && Number(row.pageCount ?? 0) >= 2)
    ) {
      return "webtoon";
    }
    return "illustration";
  },
};

export interface WaitlistIntentStore {
  recordIntent(entry: {
    userId: string;
    targetType: "plan" | "credit-pack";
    targetId: string;
    recordedAt: string;
  }): Promise<{ totalCount: number; alreadyRegistered: boolean }>;
}

const inMemoryWaitlistFallback: Array<{
  userId: string;
  targetType: string;
  targetId: string;
  recordedAt: string;
}> = [];

const defaultWaitlistStore: WaitlistIntentStore = {
  async recordIntent(entry) {
    if (!process.env.DATABASE_URL?.trim()) {
      const duplicate = inMemoryWaitlistFallback.some(
        (item) =>
          item.userId === entry.userId
          && item.targetType === entry.targetType
          && item.targetId === entry.targetId,
      );
      if (!duplicate) inMemoryWaitlistFallback.push(entry);
      return {
        totalCount: inMemoryWaitlistFallback.length,
        alreadyRegistered: duplicate,
      };
    }
    await ensureSettingsTable();
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, WAITLIST_SETTING_KEY))
      .limit(1);
    const existing = (rows[0]?.value ?? {}) as {
      items?: Array<{ userId: string; targetType: string; targetId: string; recordedAt: string }>;
    };
    const items = Array.isArray(existing.items) ? existing.items : [];
    const duplicate = items.some(
      (item) =>
        item.userId === entry.userId
        && item.targetType === entry.targetType
        && item.targetId === entry.targetId,
    );
    const nextItems = duplicate ? items : [...items.slice(-499), entry];
    const updatedAt = new Date();
    await db
      .insert(appSettings)
      .values({
        key: WAITLIST_SETTING_KEY,
        value: { items: nextItems, count: nextItems.length },
        updatedAt,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: { items: nextItems, count: nextItems.length }, updatedAt },
      });
    return { totalCount: nextItems.length, alreadyRegistered: duplicate };
  },
};

@Injectable()
export class CreditBillingModeService {
  private readonly paidStore: PaidOperationsSettingStore;
  private readonly waitlistStore: WaitlistIntentStore;
  private readonly referralStore: ReferralClaimStore;
  private readonly ledgerProbe: ActivityCreditLedgerProbe;
  private readonly purchaseWallet: CreditPurchaseWallet;

  constructor(
    @Inject(MembershipWalletService)
    private readonly walletService: Pick<MembershipWalletService, "grantAsset">,
    @Optional()
    @Inject(PAID_OPERATIONS_SETTING_STORE)
    paidStore?: PaidOperationsSettingStore,
    @Optional()
    @Inject(WAITLIST_INTENT_STORE)
    waitlistStore?: WaitlistIntentStore,
    @Optional()
    @Inject(REFERRAL_CLAIM_STORE)
    referralStore?: ReferralClaimStore,
    @Optional()
    @Inject(ACTIVITY_CREDIT_LEDGER_PROBE)
    ledgerProbe?: ActivityCreditLedgerProbe,
  ) {
    this.paidStore = paidStore ?? paidOperationsSettingStore;
    this.waitlistStore = waitlistStore ?? defaultWaitlistStore;
    this.referralStore = referralStore ?? defaultReferralClaimStore;
    this.ledgerProbe = ledgerProbe ?? defaultLedgerProbe;
    this.purchaseWallet = {
      grantPurchasedCredits: async (input) =>
        this.walletService.grantAsset({
          userId: input.userId,
          asset: "studio_credit",
          amount: input.credits,
          source: "purchase",
          sourceKey: input.requestKey,
          sourceRef: input.paymentConfirmationId,
          expiresAt: input.expiresAt,
          reason: `크레딧 팩 충전 (${input.packId})`,
          metadata: {
            packId: input.packId,
            paymentConfirmationId: input.paymentConfirmationId,
          },
        }),
    };
  }

  async getBillingMode(): Promise<BillingModeResponse> {
    const enabled = await resolvePaidOperationsEnabled(this.paidStore);
    return {
      paidOperationsEnabled: enabled,
      mode: enabled ? "paid-credit-active" : "free-activity-beta",
      subscriptionsEnabled: enabled,
      creditPurchasesEnabled: enabled && CREDIT_PURCHASES_ENABLED,
      krwPerCredit: KRW_PER_CREDIT,
      activityRewardExpiryDays: CREDIT_ACTIVITY_REWARD_EXPIRY_DAYS,
      monthlyActivityCreditPoolCap: MONTHLY_ACTIVITY_CREDIT_POOL_CAP,
      creditPacks: CREDIT_PACK_CATALOG,
      subscriptionPlans: SUBSCRIPTION_CREDIT_PLANS,
      activityCreditRewards: ACTIVITY_STUDIO_CREDIT_REWARD_CATALOG,
      milestoneCreditRewards: MILESTONE_STUDIO_CREDIT_REWARD_CATALOG,
    };
  }

  async claimReferralBonus(
    userIdValue: string | undefined,
    body: { inviterCode?: unknown },
  ) {
    const inviteeUserId = requireUserId(userIdValue);
    let monthlyPoolGrantedCredits = 0;
    if (process.env.DATABASE_URL?.trim()) {
      const now = new Date();
      const { dayStart, dayEnd, monthStart, monthEnd } = kstWindow(now);
      const state = await this.ledgerProbe.inspectGrantState({
        userId: inviteeUserId,
        activityKey: "creator.work.created",
        sourceKey: `referral-check:${inviteeUserId}`,
        dayStart,
        dayEnd,
        monthStart,
        monthEnd,
      });
      monthlyPoolGrantedCredits = state.monthlyPoolGrantedCredits;
    }
    const result = await executeReferralCreditClaim({
      inviteeUserId,
      inviterCodeRaw: body?.inviterCode,
      monthlyPoolGrantedCredits,
      store: this.referralStore,
      wallet: this.walletService,
    });
    await logAuditAction(
      inviteeUserId,
      "membership_wallet.referral_claim",
      "credit_referral",
      result.inviterUserId,
      {
        inviteeCredits: result.inviteeCredits,
        inviterCredits: result.inviterCredits,
      },
    );
    return result;
  }

  async registerWaitlistIntent(
    userIdValue: string | undefined,
    body: { targetType?: unknown; targetId?: unknown },
  ) {
    const userId = requireUserId(userIdValue);
    const targetType = body?.targetType;
    const targetId =
      typeof body?.targetId === "string" ? body.targetId.trim() : "";
    if (targetType !== "plan" && targetType !== "credit-pack") {
      throw new BadRequestException("사전예약 대상 유형이 올바르지 않습니다.");
    }
    if (targetType === "plan") {
      if (!isMembershipPlanId(targetId) || targetId === "free") {
        throw new BadRequestException("유효한 구독 등급을 선택해 주세요.");
      }
    } else if (!findCreditPack(targetId)) {
      throw new BadRequestException("유효한 크레딧 팩을 선택해 주세요.");
    }

    const recordedAt = new Date().toISOString();
    const saved = await this.waitlistStore.recordIntent({
      userId,
      targetType,
      targetId,
      recordedAt,
    });
    await logAuditAction(
      userId,
      "membership_wallet.waitlist_intent",
      "credit_waitlist",
      `${targetType}:${targetId}`,
      { chargedKrw: 0, alreadyRegistered: saved.alreadyRegistered },
    );
    return {
      registered: true,
      chargedKrw: 0,
      targetType,
      targetId,
      alreadyRegistered: saved.alreadyRegistered,
      totalWaitlistCount: saved.totalCount,
      recordedAt,
    };
  }

  async purchaseCreditPack(
    userIdValue: string | undefined,
    body: CreditPurchaseIntentInput,
  ) {
    try {
      return await requestCreditPurchase(
        this.purchaseWallet,
        userIdValue,
        body,
        CREDIT_PURCHASES_ENABLED,
        this.paidStore,
      );
    } catch (error) {
      if (error instanceof CreditPurchaseError) {
        throw new HttpException(
          {
            code: error.code,
            message: error.message,
            details: error.details,
          },
          error.status,
        );
      }
      throw error;
    }
  }
}

@Injectable()
export class MembershipRewardDispatcherService
  implements MembershipRewardService
{
  private readonly probe: ActivityCreditLedgerProbe;

  constructor(
    @Inject(MembershipWalletService)
    private readonly walletService: Pick<
      MembershipWalletService,
      "grantActivityPoints" | "grantRewardMilestone" | "grantAsset"
    >,
    @Optional()
    @Inject(ACTIVITY_CREDIT_LEDGER_PROBE)
    probe?: ActivityCreditLedgerProbe,
  ) {
    this.probe = probe ?? defaultLedgerProbe;
  }

  async grantActivityPoints(input: {
    userId: string | undefined;
    activity: ActivityPointKey;
    sourceRef: unknown;
    metadata?: Record<string, unknown>;
    clientClaim?: boolean;
  }): Promise<unknown> {
    const pointResult = await this.walletService.grantActivityPoints(input);
    if (!input.clientClaim && input.userId) {
      await this.tryGrantActivityStudioCredits({
        userId: input.userId,
        activity: input.activity,
        sourceRef: input.sourceRef,
        metadata: input.metadata,
      });
    }
    return pointResult;
  }

  async grantRewardMilestone(
    userId: string | undefined,
    milestone: RewardMilestoneKey,
    sourceRef: unknown,
  ): Promise<unknown> {
    const pointResult = await this.walletService.grantRewardMilestone(
      userId,
      milestone,
      sourceRef,
    );
    if (userId) {
      await this.tryGrantMilestoneStudioCredits({
        userId,
        milestone,
        sourceRef,
      });
    }
    return pointResult;
  }

  async tryGrantMilestoneStudioCredits(input: {
    userId: string;
    milestone: RewardMilestoneKey;
    sourceRef: unknown;
    now?: Date;
  }): Promise<{ granted: boolean; amountCredits: number; reason?: string }> {
    try {
      const spec = resolveMilestoneCreditSpec(input.milestone);
      if (!spec) {
        return { granted: false, amountCredits: 0, reason: "unmapped_milestone" };
      }
      const ref =
        typeof input.sourceRef === "string" && input.sourceRef.trim()
          ? input.sourceRef.trim()
          : input.milestone;
      const now = input.now ?? new Date();
      const { dayStart, dayEnd, monthStart, monthEnd } = kstWindow(now);
      const sourceKey = `activity:milestone.${input.milestone}:${ref}`;
      const state = await this.probe.inspectGrantState({
        userId: input.userId,
        activityKey: "creator.work.created",
        sourceKey,
        dayStart,
        dayEnd,
        monthStart,
        monthEnd,
      });
      if (state.duplicateSourceRef) {
        return { granted: false, amountCredits: 0, reason: "duplicate_milestone" };
      }
      if (
        state.monthlyPoolGrantedCredits + spec.amountCredits
        > MONTHLY_ACTIVITY_CREDIT_POOL_CAP
      ) {
        return {
          granted: false,
          amountCredits: 0,
          reason: "monthly_promo_pool_cap_reached",
        };
      }
      await this.walletService.grantAsset({
        userId: input.userId,
        asset: "studio_credit",
        amount: spec.amountCredits,
        source: `activity:milestone.${input.milestone}`,
        sourceKey,
        sourceRef: ref,
        expiresAt: activityRewardExpiry(now),
        reason: spec.reason,
        metadata: { milestone: input.milestone },
      });
      return { granted: true, amountCredits: spec.amountCredits };
    } catch {
      return { granted: false, amountCredits: 0, reason: "skipped_or_capped" };
    }
  }

  async tryGrantActivityStudioCredits(input: {
    userId: string;
    activity: ActivityPointKey;
    sourceRef: unknown;
    metadata?: Record<string, unknown>;
    now?: Date;
  }): Promise<{ granted: boolean; amountCredits: number; reason?: string }> {
    try {
      if (!isActivityPointKey(input.activity)) {
        return { granted: false, amountCredits: 0, reason: "unmapped_activity" };
      }
      const sourceRef =
        typeof input.sourceRef === "string" ? input.sourceRef.trim() : "";
      if (!sourceRef) {
        return { granted: false, amountCredits: 0, reason: "missing_source_ref" };
      }

      let contentKind: "webtoon" | "illustration" | undefined;
      if (input.activity === "creator.work.published") {
        const rawKind = input.metadata?.contentType ?? input.metadata?.kind;
        if (rawKind === "webtoon" || rawKind === "illustration") {
          contentKind = rawKind;
        } else if (this.probe.detectWorkContentKind) {
          contentKind = await this.probe.detectWorkContentKind(sourceRef);
        }
      }

      const spec = resolveActivityCreditSpec(input.activity, contentKind);
      if (!spec) {
        return { granted: false, amountCredits: 0, reason: "unmapped_activity" };
      }

      const now = input.now ?? new Date();
      const { dayKey, dayStart, dayEnd, monthStart, monthEnd } = kstWindow(now);
      const sourceKey = `activity:${input.activity}:${sourceRef}`;
      const state = await this.probe.inspectGrantState({
        userId: input.userId,
        activityKey: input.activity,
        sourceKey,
        dayStart,
        dayEnd,
        monthStart,
        monthEnd,
      });

      if (
        state.monthlyPoolGrantedCredits + spec.amountCredits
        > MONTHLY_ACTIVITY_CREDIT_POOL_CAP
      ) {
        return {
          granted: false,
          amountCredits: 0,
          reason: "monthly_promo_pool_cap_reached",
        };
      }

      if (input.activity === "creator.work.created") {
        if (state.duplicateSourceRef || state.grantedTodayCount >= 1) {
          return { granted: false, amountCredits: 0, reason: "skipped_or_capped" };
        }
        await this.walletService.grantAsset({
          userId: input.userId,
          asset: "studio_credit",
          amount: spec.amountCredits,
          source: `activity:${input.activity}`,
          sourceKey,
          sourceRef: `${sourceKey}:${dayKey}`,
          expiresAt: activityRewardExpiry(now),
          reason: spec.reason,
          metadata: { activityKey: input.activity, contentKind: spec.contentKind },
        });
        return { granted: true, amountCredits: spec.amountCredits };
      }

      const grant = buildActivityRewardGrant({
        userId: input.userId,
        category: spec.category,
        activityKey: input.activity,
        sourceRef,
        dayKey,
        amountCredits: spec.amountCredits,
        state: {
          duplicateSourceRef: state.duplicateSourceRef,
          grantedTodayCount: state.grantedTodayCount,
          lastGrantedAtMs: state.lastGrantedAtMs,
          nowMs: now.getTime(),
        },
      });

      const adapter = createActivityCreditWallet(this.walletService, spec.reason);
      await grantActivityReward(adapter, grant);
      return { granted: true, amountCredits: spec.amountCredits };
    } catch {
      // 원고 저장·댓글 작성 등 본 작업의 성공을 절대 방해하지 않는다.
      return { granted: false, amountCredits: 0, reason: "skipped_or_capped" };
    }
  }
}
