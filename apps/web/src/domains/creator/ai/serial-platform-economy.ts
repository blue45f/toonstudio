/**
 * ggumtoon-platform-economy.ts
 *
 * https://www.ggumtoon.com/ (꿈툰 플랫폼: 지갑·출석체크·기다무·바이럴 공유·뷰어·정산·어드민)
 * REA 역공학 분석(`0n5493b7spg.s.js`, `0_qdehbuvn5r3.js`, `0rdx-ygp7ub4e.js`, `0gfmlm~a9-5g..js`,
 * `0zs~t~wjid82~.js`, `0uhdfyo3fw~s4.js`, `0695ucpa4z0id.js`) 결과를 ToonStudio 도메인 엔진으로 내재화한 모듈.
 */

import type { SerialStudioSerialType, SerialStudioWorkType } from "./serial-studio-suite";

export type SerialStudioPayMethod = "KAKAOPAY" | "CARD";

export interface SerialStudioWebCoinPlan {
  readonly coins: number;
  readonly price: number;
}

/**
 * 0n5493b7spg.s.js (모듈 85149) WEB_COIN_PLANS 정본
 */
export const SERIAL_STUDIO_WEB_COIN_PLANS: readonly SerialStudioWebCoinPlan[] = [
  { coins: 10, price: 1000 },
  { coins: 30, price: 3000 },
  { coins: 50, price: 5000 },
  { coins: 100, price: 10000 },
] as const;

export interface SerialStudioCreditPurchasePlan {
  readonly credits: number;
  readonly price: number;
  readonly validityDays: number;
}

/**
 * 0_qdehbuvn5r3.js에서 관측된 AI 크레딧 단건 충전 플랜 (충전일로부터 1년간 사용 가능)
 */
export const SERIAL_STUDIO_CREDIT_PURCHASE_PLANS: readonly SerialStudioCreditPurchasePlan[] = [
  { credits: 50, price: 5000, validityDays: 365 },
  { credits: 100, price: 9900, validityDays: 365 },
  { credits: 300, price: 28000, validityDays: 365 },
  { credits: 500, price: 45000, validityDays: 365 },
] as const;

export interface SerialStudioSubscriptionTierSpec {
  readonly id: "Standard" | "Pro" | "Ultra";
  readonly monthlyCredits: number;
  readonly monthlyPriceKrw: number;
  readonly rolloverAllowed: false;
  readonly expiryPolicy: string;
}

/**
 * 0w.h9fapc_f97.js (모듈 33499)에서 관측된 월간 구독 플랜 (매월 말일 소멸·이월 불가)
 */
export const SERIAL_STUDIO_SUBSCRIPTION_TIERS: readonly SerialStudioSubscriptionTierSpec[] = [
  {
    id: "Standard",
    monthlyCredits: 120,
    monthlyPriceKrw: 9900,
    rolloverAllowed: false,
    expiryPolicy: "매월 지급 크레딧은 해당 월 말일에 소멸되며 이월되지 않습니다.",
  },
  {
    id: "Pro",
    monthlyCredits: 380,
    monthlyPriceKrw: 29000,
    rolloverAllowed: false,
    expiryPolicy: "매월 지급 크레딧은 해당 월 말일에 소멸되며 이월되지 않습니다.",
  },
  {
    id: "Ultra",
    monthlyCredits: 900,
    monthlyPriceKrw: 59000,
    rolloverAllowed: false,
    expiryPolicy: "매월 지급 크레딧은 해당 월 말일에 소멸되며 이월되지 않습니다.",
  },
] as const;

export const SERIAL_STUDIO_SIGNUP_BONUSES = {
  readerCoinsKo: 10,
  readerCoinsEn: 30,
  creatorCredits: 100,
  firstChargeBonusRate: 0.1,
} as const;

/**
 * 꿈(독자 열람 코인) 충전 주문 계산기 (`hasNeverCharged` 첫 충전 10% 추가 지급 규칙 반영)
 */
export function computeSerialStudioCoinChargeOrder(params: {
  readonly plan: SerialStudioWebCoinPlan;
  readonly hasNeverCharged: boolean;
  readonly payMethod: SerialStudioPayMethod;
}): {
  readonly baseCoins: number;
  readonly bonusCoins: number;
  readonly totalCoinsGranted: number;
  readonly paymentAmountKrw: number;
  readonly payMethod: SerialStudioPayMethod;
  readonly orderName: string;
} {
  const bonusCoins = params.hasNeverCharged
    ? Math.floor(params.plan.coins * SERIAL_STUDIO_SIGNUP_BONUSES.firstChargeBonusRate)
    : 0;
  return {
    baseCoins: params.plan.coins,
    bonusCoins,
    totalCoinsGranted: params.plan.coins + bonusCoins,
    paymentAmountKrw: params.plan.price,
    payMethod: params.payMethod,
    orderName: `꿈 ${params.plan.coins}개 충전`,
  };
}

export interface SerialStudioAttendanceCycleSummary {
  readonly cycleDay: number;
  readonly totalAttendanceDays: number;
  readonly coinsEarnedToday: number;
  readonly totalCoinsFromCycle: number;
  readonly daysUntilNextReward: number;
  readonly nextRewardLabel: string;
}

/**
 * 0_qdehbuvn5r3.js 출석 체크 10일 사이클 엔진
 * - 3·6·9일차에 1꿈씩 지급
 * - 10일차에는 개근 보너스로 또 1꿈 지급 (10일 주기 총 4꿈)
 */
export function evaluateSerialStudioAttendanceCycle(
  totalAttendanceDaysAfterCheck: number,
): SerialStudioAttendanceCycleSummary {
  const safeTotal = Math.max(1, Math.floor(totalAttendanceDaysAfterCheck));
  const mod = safeTotal % 10;
  const cycleDay = mod === 0 ? 10 : mod;

  const isRewardDay =
    cycleDay === 3 || cycleDay === 6 || cycleDay === 9 || cycleDay === 10;
  const coinsEarnedToday = isRewardDay ? 1 : 0;

  let cycleCoins = 0;
  if (cycleDay >= 3) cycleCoins += 1;
  if (cycleDay >= 6) cycleCoins += 1;
  if (cycleDay >= 9) cycleCoins += 1;
  if (cycleDay >= 10) cycleCoins += 1;

  const fullCycles = Math.floor((safeTotal - cycleDay) / 10);
  const totalCoinsFromCycle = fullCycles * 4 + cycleCoins;

  const rewardMilestones = [3, 6, 9, 10];
  const nextMilestone = rewardMilestones.find((m) => m > cycleDay) ?? 13;
  const daysUntilNextReward = nextMilestone - cycleDay;
  const nextRewardLabel =
    cycleDay === 9
      ? "내일(10일차) 개근 보너스 +1꿈!"
      : cycleDay === 10
        ? "10일 개근 달성! 새 사이클 3일차까지 3일"
        : `다음 보상까지 ${daysUntilNextReward}일`;

  return {
    cycleDay,
    totalAttendanceDays: safeTotal,
    coinsEarnedToday,
    totalCoinsFromCycle,
    daysUntilNextReward,
    nextRewardLabel,
  };
}

/**
 * 0rdx-ygp7ub4e.js `g(e, t)` 기다리면 무료 남은 시간 포맷터 정본
 */
export function formatSerialStudioWaitFreeRemaining(
  nextFreeAtIso: string,
  nowMs: number = Date.now(),
  locale: "ko" | "en" = "ko",
): { readonly claimable: boolean; readonly label: string } {
  const diffMs = new Date(nextFreeAtIso).getTime() - nowMs;
  if (diffMs <= 0) {
    return {
      claimable: true,
      label: locale === "ko" ? "🎁 무료로 볼 수 있어요!" : "🎁 Free episode ready!",
    };
  }
  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (locale === "ko") {
    const timeText =
      hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
    return {
      claimable: false,
      label: `${timeText} 후 다음 화 무료`,
    };
  }
  const enTime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return {
    claimable: false,
    label: `Next free episode in ${enTime}`,
  };
}

export type SerialStudioEpisodeAccessOutcome =
  | { readonly access: "free_challenge" | "free_first_three" | "free_flag" | "author_owner" | "already_read"; readonly coinsRequired: 0 }
  | { readonly access: "wait_free_claimable"; readonly coinsRequired: 0 }
  | { readonly access: "requires_coin_or_wait"; readonly coinsRequired: number; readonly waitRemainingLabel: string | null }
  | { readonly access: "insufficient_coins"; readonly coinsRequired: number; readonly currentCoins: number };

/**
 * 0gfmlm~a9-5g..js (`ev()` 열람 판정 트리) 정본 구현
 */
export function resolveSerialStudioEpisodeAccess(params: {
  readonly episodeIndexZeroBased: number;
  readonly isEpisodeFreeFlag: boolean;
  readonly isChallengeWork: boolean;
  readonly isAuthorOwner: boolean;
  readonly isAlreadyRead: boolean;
  readonly episodeCoinPrice?: number;
  readonly userCoinBalance: number;
  readonly waitFreeApplicable: boolean;
  readonly waitFreeClaimable: boolean;
  readonly waitFreeNextFreeAtIso?: string | null;
  readonly nowMs?: number;
}): SerialStudioEpisodeAccessOutcome {
  if (params.isChallengeWork) {
    return { access: "free_challenge", coinsRequired: 0 };
  }
  if (params.episodeIndexZeroBased >= 0 && params.episodeIndexZeroBased < 3) {
    return { access: "free_first_three", coinsRequired: 0 };
  }
  if (params.isEpisodeFreeFlag) {
    return { access: "free_flag", coinsRequired: 0 };
  }
  if (params.isAuthorOwner) {
    return { access: "author_owner", coinsRequired: 0 };
  }
  if (params.isAlreadyRead) {
    return { access: "already_read", coinsRequired: 0 };
  }
  if (params.waitFreeApplicable && params.waitFreeClaimable) {
    return { access: "wait_free_claimable", coinsRequired: 0 };
  }

  const price = params.episodeCoinPrice ?? 1;
  const waitLabel =
    params.waitFreeApplicable && params.waitFreeNextFreeAtIso
      ? formatSerialStudioWaitFreeRemaining(
          params.waitFreeNextFreeAtIso,
          params.nowMs,
        ).label
      : null;

  if (!params.waitFreeApplicable && params.userCoinBalance < price) {
    return {
      access: "insufficient_coins",
      coinsRequired: price,
      currentCoins: params.userCoinBalance,
    };
  }
  return {
    access: "requires_coin_or_wait",
    coinsRequired: price,
    waitRemainingLabel: waitLabel,
  };
}

/**
 * 0gfmlm~a9-5g..js `ew(episodeId, userId, alreadyLiked)`
 * 동일 작품 유료 회차 3회 열람 시 작품 좋아요 및 이메일 업데이트 알림 자동 설정 규칙
 */
export function shouldTriggerSerialStudioAutoLike(params: {
  readonly alreadyLiked: boolean;
  readonly alreadyAutoLikedInSession: boolean;
  readonly paidReadEpisodeIds: readonly string[];
  readonly currentEpisodeId: string;
}): {
  readonly updatedPaidReadEpisodeIds: readonly string[];
  readonly triggerAutoLike: boolean;
} {
  const uniqueIds = params.paidReadEpisodeIds.includes(params.currentEpisodeId)
    ? [...params.paidReadEpisodeIds]
    : [...params.paidReadEpisodeIds, params.currentEpisodeId];

  const triggerAutoLike =
    !params.alreadyLiked &&
    !params.alreadyAutoLikedInSession &&
    uniqueIds.length >= 3;

  return {
    updatedPaidReadEpisodeIds: uniqueIds,
    triggerAutoLike,
  };
}

export const SERIAL_STUDIO_SHARE_EVENT_MAX_COINS = 15;

/**
 * 0gfmlm~a9-5g..js `b` 컴포넌트 (`/api/share/create`, `/api/share/click`)
 * 에피소드 공유 시 클릭당 1꿈 적립, 이벤트당 최대 15꿈 상한 계산기
 */
export function evaluateSerialStudioShareRewardProgress(
  currentRewardedClicks: number,
  workId: string,
  episodeId: string,
  shareToken: string = "gt-share-token",
): {
  readonly rewardedCoins: number;
  readonly maxCoins: number;
  readonly isMaxReached: boolean;
  readonly statusText: string;
  readonly shareUrl: string;
} {
  const clamped = Math.max(
    0,
    Math.min(SERIAL_STUDIO_SHARE_EVENT_MAX_COINS, Math.floor(currentRewardedClicks)),
  );
  const isMaxReached = clamped >= SERIAL_STUDIO_SHARE_EVENT_MAX_COINS;
  return {
    rewardedCoins: clamped,
    maxCoins: SERIAL_STUDIO_SHARE_EVENT_MAX_COINS,
    isMaxReached,
    statusText: isMaxReached
      ? "🎉 이벤트 최대 적립 달성!"
      : `${clamped}/${SERIAL_STUDIO_SHARE_EVENT_MAX_COINS}꿈 적립됨`,
    shareUrl: `https://www.ggumtoon.com/work/${workId}/view?episode=${episodeId}&st=${shareToken}`,
  };
}

export type SerialStudioNovelViewerThemeId = "dark" | "light" | "sepia";
export type SerialStudioNovelFontSizeKey = "sm" | "md" | "lg";

export interface SerialStudioNovelViewerThemeSpec {
  readonly id: SerialStudioNovelViewerThemeId;
  readonly label: string;
  readonly bg: string;
  readonly text: string;
  readonly toolbar: string;
  readonly border: string;
}

/**
 * 0gfmlm~a9-5g..js (오프셋 31300) 웹소설 뷰어 3종 테마(다크·라이트·세피아) 및 3단계 글자 크기(14·17·20px) 정본
 */
export const SERIAL_STUDIO_NOVEL_VIEWER_THEMES: readonly SerialStudioNovelViewerThemeSpec[] = [
  {
    id: "dark",
    label: "다크",
    bg: "#0a0a0f",
    text: "#e8e8f0",
    toolbar: "rgba(15,15,25,0.95)",
    border: "rgba(255,255,255,0.08)",
  },
  {
    id: "light",
    label: "라이트",
    bg: "#f8f6f0",
    text: "#2a2a2a",
    toolbar: "rgba(248,246,240,0.97)",
    border: "rgba(0,0,0,0.1)",
  },
  {
    id: "sepia",
    label: "세피아",
    bg: "#f4efe4",
    text: "#3a2f1e",
    toolbar: "rgba(244,239,228,0.97)",
    border: "rgba(0,0,0,0.1)",
  },
] as const;

export const SERIAL_STUDIO_NOVEL_FONT_SIZES: Readonly<
  Record<SerialStudioNovelFontSizeKey, number>
> = {
  sm: 14,
  md: 17,
  lg: 20,
} as const;

export interface SerialStudioViewerTextBox {
  readonly id: string;
  readonly y: number;
  readonly align: "left" | "center" | "right";
  readonly fontSize: number;
  readonly fontFamily?: string;
  readonly text: string;
  readonly text_en?: string;
}

/**
 * 0gfmlm~a9-5g..js (`/api/translate-episode`) 뷰어 텍스트 패널 한→영 실시간 번역기
 */
export function translateSerialStudioEpisodeTextBoxes(
  textBoxes: readonly SerialStudioViewerTextBox[],
): readonly SerialStudioViewerTextBox[] {
  return textBoxes.map((box) => {
    if (box.text_en && box.text_en.trim()) return box;
    const raw = box.text.trim();
    if (!raw) return { ...box, text_en: "" };
    return {
      ...box,
      text_en: `[EN] ${raw}`,
    };
  });
}

/**
 * 0zs~t~wjid82~.js (`/mypage/settlement`)에서 관측된 14개 정산 지원 은행 목록 정본
 */
export const SERIAL_STUDIO_SETTLEMENT_BANKS: readonly string[] = [
  "카카오뱅크",
  "토스뱅크",
  "케이뱅크",
  "국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "기업은행",
  "농협은행",
  "새마을금고",
  "우체국",
  "SC제일은행",
  "씨티은행",
  "수협은행",
] as const;

export interface SerialStudioSettlementRegistrationInput {
  readonly realName: string;
  readonly bankName: string;
  readonly accountNumber: string;
  readonly accountHolder: string;
  readonly isBusiness: boolean;
  readonly businessNumber?: string;
  readonly agreedPrivacyCollection: boolean;
}

export function validateSerialStudioSettlementRegistration(
  input: SerialStudioSettlementRegistrationInput,
): { readonly valid: boolean; readonly errorMessage: string | null } {
  if (!input.realName.trim()) {
    return { valid: false, errorMessage: "실명을 입력해주세요." };
  }
  if (!input.accountNumber.trim()) {
    return { valid: false, errorMessage: "계좌번호를 입력해주세요." };
  }
  if (!input.accountHolder.trim()) {
    return { valid: false, errorMessage: "예금주를 입력해주세요." };
  }
  if (input.isBusiness && !input.businessNumber?.trim()) {
    return { valid: false, errorMessage: "사업자등록번호를 입력해주세요." };
  }
  if (!input.agreedPrivacyCollection) {
    return { valid: false, errorMessage: "개인정보 수집에 동의해주세요." };
  }
  return { valid: true, errorMessage: null };
}

export interface SerialStudioCreatorSettlementBreakdown {
  readonly totalReadCoins: number;
  readonly excludedFreeMarketingCoins: number;
  readonly eligiblePaidCoins: number;
  readonly grossPaidRevenueKrw: number;
  readonly appStoreFeeKrw: number;
  readonly netDistributableRevenueKrw: number;
  readonly creatorShareRate: number;
  readonly creatorGrossShareKrw: number;
  readonly withholdingTaxKrw: number;
  readonly finalPayoutKrw: number;
  readonly payoutRuleNote: string;
  readonly requiresSemiAnnualTaxReport: boolean;
}

/**
 * 0_qdehbuvn5r3.js 및 0zs~t~wjid82~.js 수익 정산 계산기 정본
 * - 유료 충전 꿈으로 읽은 회차만 정산 대상 (가입 무료 꿈·출석 리워드 무료 꿈 제외)
 * - 연재 방식별 정산율: 자유 연재 40% / 정기 연재 60% / 주 2회 연재 80%
 * - 인앱(앱스토어/구글플레이) 결제 비중이 있을 경우 앱스토어 수수료 30% 반영
 * - 일반 개인 창작자는 3.3% 원천징수 후 익월 10일 실지급, 연간 지급액 125만원 이상 시 상·하반기 세무신고 대상
 */
export function calculateSerialStudioCreatorSettlement(params: {
  readonly paidCoinsRead: number;
  readonly freeMarketingCoinsRead: number;
  readonly serialType: SerialStudioSerialType;
  readonly isBusiness?: boolean;
  readonly appChannelRatio?: number;
  readonly coinUnitPriceKrw?: number;
  readonly cumulativeAnnualPayoutKrw?: number;
}): SerialStudioCreatorSettlementBreakdown {
  const paidCoins = Math.max(0, Math.floor(params.paidCoinsRead));
  const freeCoins = Math.max(0, Math.floor(params.freeMarketingCoinsRead));
  const unitPrice = params.coinUnitPriceKrw ?? 100;
  const appRatio = Math.max(0, Math.min(1, params.appChannelRatio ?? 0));

  const grossPaidRevenueKrw = paidCoins * unitPrice;
  const appStoreFeeKrw = Math.round(grossPaidRevenueKrw * appRatio * 0.3);
  const netDistributableRevenueKrw = grossPaidRevenueKrw - appStoreFeeKrw;

  const creatorShareRate =
    params.serialType === "twice_weekly"
      ? 0.8
      : params.serialType === "regular"
        ? 0.6
        : 0.4;

  const creatorGrossShareKrw = Math.round(
    netDistributableRevenueKrw * creatorShareRate,
  );
  const withholdingTaxKrw = params.isBusiness
    ? 0
    : Math.round(creatorGrossShareKrw * 0.033);
  const finalPayoutKrw = creatorGrossShareKrw - withholdingTaxKrw;

  const annualTotal = (params.cumulativeAnnualPayoutKrw ?? 0) + finalPayoutKrw;

  return {
    totalReadCoins: paidCoins + freeCoins,
    excludedFreeMarketingCoins: freeCoins,
    eligiblePaidCoins: paidCoins,
    grossPaidRevenueKrw,
    appStoreFeeKrw,
    netDistributableRevenueKrw,
    creatorShareRate,
    creatorGrossShareKrw,
    withholdingTaxKrw,
    finalPayoutKrw,
    payoutRuleNote:
      "독자의 유료 꿈 열람 → 연재 방식별 정산율 창작자 지급 → 3.3% 원천징수 후 익월 10일 실지급",
    requiresSemiAnnualTaxReport: annualTotal >= 1_250_000,
  };
}

export interface SerialStudioAdminModuleSpec {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly category: "overview" | "members" | "content" | "finance" | "community" | "marketing";
}

/**
 * 0uhdfyo3fw~s4.js 및 0695ucpa4z0id.js에서 관측된 꿈툰 어드민 16대 관리 모듈 정본
 */
export const SERIAL_STUDIO_ADMIN_MODULES: readonly SerialStudioAdminModuleSpec[] = [
  { id: "dashboard", path: "/admin", label: "대시보드", category: "overview" },
  { id: "users", path: "/admin/users", label: "유저 관리", category: "members" },
  { id: "authors", path: "/admin/authors", label: "작가 관리", category: "members" },
  { id: "works", path: "/admin/works", label: "작품 관리", category: "content" },
  { id: "revenue", path: "/admin/revenue", label: "매출 관리", category: "finance" },
  { id: "analytics", path: "/admin/analytics", label: "MAU/DAU 분석", category: "overview" },
  { id: "settlement", path: "/admin/settlement", label: "정산 관리", category: "finance" },
  { id: "comments", path: "/admin/comments", label: "댓글 관리", category: "community" },
  {
    id: "featured-comments",
    path: "/admin/featured-comments",
    label: "댓글 반응 최고",
    category: "community",
  },
  { id: "reports", path: "/admin/reports", label: "신고 관리", category: "community" },
  { id: "notices", path: "/admin/notices", label: "이벤트/공지 관리", category: "marketing" },
  { id: "events", path: "/admin/events", label: "HTML 이벤트", category: "marketing" },
  { id: "banners", path: "/admin/banners", label: "팝업 배너", category: "marketing" },
  {
    id: "main-banners",
    path: "/admin/main-banners",
    label: "메인 롤링 배너",
    category: "marketing",
  },
  {
    id: "challenge-banners",
    path: "/admin/challenge-banners",
    label: "도전연재 배너",
    category: "marketing",
  },
  {
    id: "episode-thumbnails",
    path: "/admin/episode-thumbnails",
    label: "에피소드 썸네일",
    category: "content",
  },
] as const;

export function computeSerialStudioWeeklyCoinConsumptionMetrics(params: {
  readonly weeklyUsedPaidCoins: number;
  readonly weeklyUsedFreeCoins: number;
  readonly weeklyChargedPaidCoins: number;
}): {
  readonly totalUsedCoins: number;
  readonly consumptionRatePercent: number;
  readonly paidSharePercent: number;
} {
  const totalUsedCoins =
    Math.max(0, params.weeklyUsedPaidCoins) +
    Math.max(0, params.weeklyUsedFreeCoins);
  const consumptionRatePercent =
    params.weeklyChargedPaidCoins > 0
      ? Math.round((totalUsedCoins / params.weeklyChargedPaidCoins) * 1000) / 10
      : 0;
  const paidSharePercent =
    totalUsedCoins > 0
      ? Math.round((params.weeklyUsedPaidCoins / totalUsedCoins) * 1000) / 10
      : 0;
  return {
    totalUsedCoins,
    consumptionRatePercent,
    paidSharePercent,
  };
}

export interface SerialStudioCrossAdaptationBanner {
  readonly sourceType: SerialStudioWorkType;
  readonly targetType: SerialStudioWorkType;
  readonly targetWorkId: string;
  readonly targetTitle: string;
  readonly badgeText: string;
  readonly ctaText: string;
}

/**
 * 0gfmlm~a9-5g..js (`adaptedWebtoon`, `novel` 교차 원작·웹툰화 배너 `I`) 빌더
 */
export function buildSerialStudioCrossAdaptationBanner(params: {
  readonly currentWorkType: SerialStudioWorkType;
  readonly relatedWorkId: string;
  readonly relatedTitle: string;
}): SerialStudioCrossAdaptationBanner {
  const targetType: SerialStudioWorkType =
    params.currentWorkType === "novel" ? "webtoon" : "novel";
  return {
    sourceType: params.currentWorkType,
    targetType,
    targetWorkId: params.relatedWorkId,
    targetTitle: params.relatedTitle,
    badgeText:
      targetType === "webtoon"
        ? "웹툰으로도 만나보세요"
        : "웹소설로도 만나보세요",
    ctaText:
      targetType === "webtoon" ? "웹툰 보러가기 →" : "웹소설 보러가기 →",
  };
}
