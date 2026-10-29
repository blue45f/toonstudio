import type { StudioAiPremiumLimits } from "./studio-ai-provider";

/**
 * 운영 프리미엄 경로의 일일 예산 판정. 운영자 키로 실행하는 요청이 하루(UTC) 사용자 요청 수·서비스 전체 요청 수·
 * 서비스 전체 토큰 수를 넘지 않을 때만 프리미엄을 후보에 넣는다. 넘으면 같은 요청이 무료 풀로 바로 간다.
 *
 * 판정 근거는 사용량 원장(provider = 프리미엄 제공자)이다. 원장이 프리미엄 제공자를 기록할 수 없는 스키마면
 * (마이그레이션 0114 이전) 예산을 셀 수 없으므로 프리미엄을 쓰지 않는다(fail-closed).
 */
export interface StudioAiPremiumBudgetUsage {
  /** 원장이 프리미엄 제공자 행을 받을 수 있는 스키마인지. */
  ledgerReady: boolean;
  userRequests: number;
  globalRequests: number;
  globalTokens: number;
}

export interface StudioAiPremiumBudgetStore {
  todayUsage(userId: string): Promise<StudioAiPremiumBudgetUsage>;
}

export const STUDIO_AI_PREMIUM_BUDGET_STORE = Symbol("STUDIO_AI_PREMIUM_BUDGET_STORE");

export function studioAiPremiumBudgetAllows(
  usage: StudioAiPremiumBudgetUsage,
  limits: StudioAiPremiumLimits,
): boolean {
  return usage.ledgerReady
    && usage.userRequests < limits.userDailyRequests
    && usage.globalRequests < limits.globalDailyRequests
    && usage.globalTokens < limits.globalDailyTokens;
}

/** 테스트·단일 프로세스용 메모리 구현. 운영 배선은 Postgres 구현을 쓴다. */
export class InMemoryStudioAiPremiumBudgetStore implements StudioAiPremiumBudgetStore {
  private readonly users = new Map<string, number>();
  private globalRequests = 0;
  private globalTokens = 0;

  constructor(private readonly ledgerReady = true) {}

  record(userId: string, tokens: number): void {
    this.users.set(userId, (this.users.get(userId) ?? 0) + 1);
    this.globalRequests += 1;
    this.globalTokens += Math.max(0, tokens);
  }

  async todayUsage(userId: string): Promise<StudioAiPremiumBudgetUsage> {
    return {
      ledgerReady: this.ledgerReady,
      userRequests: this.users.get(userId) ?? 0,
      globalRequests: this.globalRequests,
      globalTokens: this.globalTokens,
    };
  }
}
