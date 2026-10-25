/**
 * credit-activity-rewards.ts — 활동 보상 지급 규칙 정식화 (P3).
 * Nest에 의존하지 않는 순수 모듈이다.
 *
 * 재사용하는 기존 장치 (이 파일이 새로 발명하지 않는 것):
 *  - 기존 활동 정책(`ACTIVITY_POINT_POLICIES`): 활동 키·claimMode·
 *    쿨다운(초)을 그대로 가져온다. 서버 확인 활동만 서버가 지급하고,
 *    클라이언트 직접 청구는 claimMode가 "client"인 활동에만 허용되는
 *    기존 `grantActivityPoints` / `claimClientActivityPoints` 규칙을
 *    따른다. 이 모듈이 매핑하는 기존 키는 전부 server 모드이므로
 *    studio_credit 활동 보상은 서버 확인 경로로만 지급한다.
 *  - 멱등키: 기존 소스 키 형식(`activity:<키>:<sourceRef>`)을 재사용한다.
 *    동일 sourceRef 재지급은 중복으로 거부한다.
 *  - 회수 영수증: 기존 `membership_reward_reversal` 메커니즘은
 *    reward_point 지급에 적용되는 구조이다. studio_credit 지급분의
 *    회수도 동일 패턴(회수 영수증 + 관리자 조정)으로 대조해야 하며,
 *    별도 회수 테이블을 이 단계에서 신설하지 않는다.
 *  - 기기 지문·다계정 탐지 등 신규 탐지 장치는 발명하지 않는다.
 *    아래 방어가 기본 방어 수준이다.
 *
 * P3 규칙 (에이전트 결정, 사용자 확정 대기):
 *  - 보상 크레딧 유효기간 90일: 활동으로 지급되는 studio_credit 롯은
 *    지급일 + 90일로 만료한다. 기존 reward_point 365일 상수
 *    (`MEMBERSHIP_ECONOMY_POLICY.pointExpiryDays`)는 해당 자산의 기존
 *    규칙으로 그대로 두고, 이 파일은 그 상수를 바꾸지 않는다.
 *    구매 크레딧 만료 null과도 다르다 (보상 < 구매 차등).
 *  - 1일 1회 상한 (해석 명시): 규칙별·계정별·일자별 1회로 구현한다.
 *    기존 reward_point 일 상한(활동별 2~10회)보다 엄격하다. 전역
 *    1일 1회(모든 활동 합산 1회)로 읽으면 더 엄격해지므로, 그 해석은
 *    사용자 확정 대기 항목으로 남긴다.
 *  - 지급량: 이 모듈은 지급량 자체를 정하지 않는다. 호출부가 정책으로
 *    공급한 `amountCredits`(양의 정수)를 검증만 한다. 기존 정책의
 *    points는 참고값(`referencePoints`)으로만 표기하며, 이를 그대로
 *    studio_credit 지급량으로 전환하지 않는다 (단위·가치가 다르기
 *    때문이다). 지급량은 제품 결정 대기이다.
 *
 * 카테고리 매핑 실측 (2026-10-25):
 *  - 연재 → `creator.work.published` (작품 공개, 기존 키 있음).
 *  - 기여 → `community.post.created`·`community.comment.created`
 *    (기존 키 있음).
 *  - 출석·이벤트 → 기존 활동 키가 없다 (`fortune.used`·
 *    `playground.used`는 출석·이벤트가 아니므로 매핑하지 않는다).
 *    두 카테고리는 규칙만 정의하고 라이브 지급은 불가 상태로 둔다.
 *    신규 키·정책 결정이 선행돼야 한다.
 *
 * 라이브 지급 한계 (마켓과 동일한 구조적 차단):
 *  - 지갑 서비스 공개 메서드 중 studio_credit을 타 사용자에게 적립하는
 *    비관리자 경로는 없다 (`adminApplyBenefit`은 관리자 전용).
 *    따라서 이 모듈의 지갑 호출은 seam
 *    (`CreditActivityRewardWallet.grantActivityStudioCredits`)으로
 *    정의하고 스텁으로 검증한다. 라이브 적립 어댑터는 마켓 정산과
 *    같은 후속 과제이다 (서비스 파일 무접촉 원칙 유지).
 */
import {
  ACTIVITY_POINT_POLICIES,
  MEMBERSHIP_ECONOMY_POLICY,
  isActivityPointKey,
  type ActivityPointKey,
} from "../../../../../packages/core/src/membership-wallet";

/** 활동 보상 studio_credit 롯 유효기간 (에이전트 결정, 90일). */
export const CREDIT_ACTIVITY_REWARD_EXPIRY_DAYS = 90;

/** 기존 reward_point 만료 상수 (이 파일이 바꾸지 않는 기존 규칙). */
export const REWARD_POINT_EXPIRY_DAYS: number =
  MEMBERSHIP_ECONOMY_POLICY.pointExpiryDays;

/** 활동 보상 만료 시각: 지급일 + 90일. */
export function activityRewardExpiry(from: Date = new Date()): Date {
  return new Date(
    from.getTime() + CREDIT_ACTIVITY_REWARD_EXPIRY_DAYS * 86_400_000,
  );
}

export type CreditActivityCategory =
  | "attendance"
  | "serialization"
  | "contribution"
  | "event";

export interface CreditActivityRewardRule {
  readonly category: CreditActivityCategory;
  /** 기존 활동 키. null이면 라이브 지급 불가 (규칙만 정의됨). */
  readonly activityKey: ActivityPointKey | null;
  readonly claimMode: "server" | "client";
  /** 기존 정책 쿨다운(초). 키가 없으면 0이다. */
  readonly cooldownSeconds: number;
  /** 기존 정책 points 참고값. 키가 없으면 null이다 (지급량 아님). */
  readonly referencePoints: number | null;
  /** 규칙별·계정별·일자별 상한 (P3 규칙: 1회). */
  readonly dailyCapPerAccount: 1;
}

function mappedRule(
  category: CreditActivityCategory,
  activityKey: ActivityPointKey,
): CreditActivityRewardRule {
  const policy = ACTIVITY_POINT_POLICIES[activityKey];
  return {
    category,
    activityKey,
    claimMode: policy.claimMode,
    cooldownSeconds: policy.cooldownSeconds,
    referencePoints: policy.points,
    dailyCapPerAccount: 1,
  };
}

function unmappedRule(
  category: CreditActivityCategory,
): CreditActivityRewardRule {
  return {
    category,
    activityKey: null,
    claimMode: "server",
    cooldownSeconds: 0,
    referencePoints: null,
    dailyCapPerAccount: 1,
  };
}

/** P3 활동 보상 규칙표 (출석·이벤트는 규칙만 정의, 라이브 지급 불가). */
export const CREDIT_ACTIVITY_REWARD_RULES: readonly CreditActivityRewardRule[] =
  [
    unmappedRule("attendance"),
    mappedRule("serialization", "creator.work.published"),
    mappedRule("contribution", "community.post.created"),
    mappedRule("contribution", "community.comment.created"),
    unmappedRule("event"),
  ] as const;

export function findActivityRewardRules(
  category: unknown,
): CreditActivityRewardRule[] {
  if (typeof category !== "string") return [];
  return CREDIT_ACTIVITY_REWARD_RULES.filter(
    (rule) => rule.category === category,
  );
}

export function findActivityRewardRule(
  category: unknown,
  activityKey: unknown,
): CreditActivityRewardRule | null {
  if (typeof activityKey !== "string" || !isActivityPointKey(activityKey)) {
    return null;
  }
  return CREDIT_ACTIVITY_REWARD_RULES.find(
    (rule) => rule.category === category && rule.activityKey === activityKey,
  ) ?? null;
}

export type CreditActivityRewardRefusalReason =
  | "activity_rule_unmapped"
  | "activity_duplicate_source"
  | "activity_daily_cap"
  | "activity_cooldown"
  | "activity_invalid_input";

export interface CreditActivityRewardState {
  /** 동일 sourceRef 지급 이력 존재 여부 (멱등키 중복 검사). */
  duplicateSourceRef: boolean;
  /** 해당 규칙·계정·일자의 기지급 횟수. */
  grantedTodayCount: number;
  /** 해당 규칙·계정·일자 내 최근 지급 시각(ms), 없으면 null. */
  lastGrantedAtMs: number | null;
  /** 평가 시각(ms). */
  nowMs: number;
}

export interface CreditActivityRewardGrant {
  asset: "studio_credit";
  userId: string;
  category: CreditActivityCategory;
  activityKey: ActivityPointKey | null;
  amountCredits: number;
  source: string;
  sourceKey: string;
  idempotencyKey: string;
  dayKey: string;
  expiresAt: Date;
}

export class CreditActivityRewardError extends Error {
  readonly code: CreditActivityRewardRefusalReason;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: CreditActivityRewardRefusalReason,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CreditActivityRewardError";
    this.code = code;
    this.status = 409;
    this.details = details;
  }
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * 활동 보상 지급을 평가하고 지급 명세를 만든다. 지급량(amountCredits)은
 * 호출부 정책이 공급하며, 이 함수는 양의 정수 여부만 검증한다.
 * 실제 지갑 적립은 `grantActivityReward`의 seam으로 수행한다.
 * dayKey는 호출부(서비스)가 KST 일자 경계로 계산해 전달한다.
 */
export function buildActivityRewardGrant(input: {
  userId?: unknown;
  category?: unknown;
  activityKey?: unknown;
  sourceRef?: unknown;
  dayKey?: unknown;
  amountCredits?: unknown;
  state: CreditActivityRewardState;
}): CreditActivityRewardGrant {
  const userId = boundedText(input.userId, 160);
  if (!userId) {
    throw new CreditActivityRewardError(
      "activity_invalid_input",
      "활동 보상 대상 사용자 식별자가 필요합니다.",
    );
  }
  const category = boundedText(input.category, 40);
  if (
    category !== "attendance"
    && category !== "serialization"
    && category !== "contribution"
    && category !== "event"
  ) {
    throw new CreditActivityRewardError(
      "activity_invalid_input",
      "지원하지 않는 활동 보상 카테고리입니다.",
      { category },
    );
  }
  const sourceRef = boundedText(input.sourceRef, 180);
  if (!sourceRef) {
    throw new CreditActivityRewardError(
      "activity_invalid_input",
      "활동 적립 근거 식별자가 필요합니다.",
    );
  }
  const dayKey = boundedText(input.dayKey, 20);
  if (!dayKey) {
    throw new CreditActivityRewardError(
      "activity_invalid_input",
      "활동 일자 키가 필요합니다.",
    );
  }
  const amount = Number(input.amountCredits);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new CreditActivityRewardError(
      "activity_invalid_input",
      "활동 보상 지급량은 양의 정수여야 합니다.",
    );
  }

  const categoryRules = findActivityRewardRules(category);
  if (!categoryRules.some((r) => r.activityKey !== null)) {
    // 출석·이벤트: 규칙만 정의됐고 기존 활동 키가 없어 라이브 지급 불가.
    throw new CreditActivityRewardError(
      "activity_rule_unmapped",
      "이 카테고리는 규칙만 정의됐고 라이브 지급 키가 없습니다.",
      { category },
    );
  }
  const rule = findActivityRewardRule(category, input.activityKey);
  if (rule === null) {
    throw new CreditActivityRewardError(
      "activity_rule_unmapped",
      "이 활동은 studio_credit 보상 규칙에 매핑되지 않았습니다.",
      { category, activityKey: boundedText(input.activityKey, 80) },
    );
  }
  if (input.state.duplicateSourceRef) {
    throw new CreditActivityRewardError(
      "activity_duplicate_source",
      "이미 지급된 활동 근거입니다.",
      { category, activityKey: rule.activityKey, sourceRef },
    );
  }
  if (input.state.grantedTodayCount >= rule.dailyCapPerAccount) {
    throw new CreditActivityRewardError(
      "activity_daily_cap",
      "이 활동 보상은 1일 1회 상한에 도달했습니다.",
      { category, activityKey: rule.activityKey, dayKey },
    );
  }
  if (
    input.state.lastGrantedAtMs !== null
    && rule.cooldownSeconds > 0
    && input.state.nowMs - input.state.lastGrantedAtMs
      < rule.cooldownSeconds * 1000
  ) {
    throw new CreditActivityRewardError(
      "activity_cooldown",
      "활동 보상 쿨다운이 지나지 않았습니다.",
      {
        category,
        activityKey: rule.activityKey,
        cooldownSeconds: rule.cooldownSeconds,
      },
    );
  }

  const source = `credit-activity:${category}`;
  const sourceKey = `activity:${rule.activityKey}:${sourceRef}`;
  return {
    asset: "studio_credit",
    userId,
    category: category as CreditActivityCategory,
    activityKey: rule.activityKey,
    amountCredits: amount,
    source,
    sourceKey,
    idempotencyKey: sourceKey,
    dayKey,
    expiresAt: activityRewardExpiry(new Date(input.state.nowMs)),
  };
}

/** 지갑 서비스 중 활동 보상이 사용하는 구조적 인터페이스 (seam). */
export interface CreditActivityRewardWallet {
  grantActivityStudioCredits(input: {
    userId: string;
    amountCredits: number;
    sourceKey: string;
    idempotencyKey: string;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
  }): Promise<{ granted: boolean }>;
}

export async function grantActivityReward(
  wallet: CreditActivityRewardWallet,
  grant: CreditActivityRewardGrant,
): Promise<{ granted: true; grant: CreditActivityRewardGrant }> {
  const result = await wallet.grantActivityStudioCredits({
    userId: grant.userId,
    amountCredits: grant.amountCredits,
    sourceKey: grant.sourceKey,
    idempotencyKey: grant.idempotencyKey,
    expiresAt: grant.expiresAt,
    metadata: {
      category: grant.category,
      activityKey: grant.activityKey,
      dayKey: grant.dayKey,
    },
  });
  if (!result.granted) {
    throw new CreditActivityRewardError(
      "activity_invalid_input",
      "활동 보상 크레딧 적립에 실패했습니다.",
      { sourceKey: grant.sourceKey },
    );
  }
  return { granted: true, grant };
}
