/**
 * research-credit-meter.ts — DeepSeek 리서치 호출량의 크레딧 환산·집계 순수 모듈.
 * Nest·DB에 의존하지 않는다.
 *
 * 단가 정책:
 *  - DeepSeek 요금은 성공 호출 기준 1,000건당 $0.75다. 1크레딧 = 10원 환산율
 *    (credit-pricing.ts의 KRW_PER_CREDIT)로는 검색 1건(약 1원 상당)보다
 *    충분히 여유 있는 수준이므로, 기본 단가는 검색·fetch 각 1크레딧으로 둔다.
 *    즉 크레딧 1개로 약 10건의 호출 원가를 충당하는 보수적 단가다.
 *  - 단가는 환경변수(DEEPSEEK_RESEARCH_CREDITS_PER_SEARCH/_FETCH)로만 조정하고,
 *    코드에 금액을 하드코딩하지 않는다. 지갑 단가표(core)의 키는 건드리지 않는다.
 *  - 미터는 관찰·과금 근거용이다. 실제 차감은 research-credit-charge.ts가
 *    지갑을 통해 수행하고, 미터와 지갑은 서비스에서 함께 기록한다.
 */

import type { ResearchUsage } from "./deepseek-research";

export interface ResearchCreditPricing {
  readonly creditsPerSearch: number;
  readonly creditsPerFetch: number;
}

export const DEFAULT_RESEARCH_CREDIT_PRICING: ResearchCreditPricing = Object.freeze({
  creditsPerSearch: 1,
  creditsPerFetch: 1,
});

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const floored = Math.floor(value);
  return floored > 0 ? floored : fallback;
}

/** 환경변수에서 단가를 읽는다. 잘못된 값은 기본값으로 되돌린다. */
export function resolveResearchCreditPricing(
  env: NodeJS.ProcessEnv,
): ResearchCreditPricing {
  return {
    creditsPerSearch: parsePositiveInt(
      env["DEEPSEEK_RESEARCH_CREDITS_PER_SEARCH"],
      DEFAULT_RESEARCH_CREDIT_PRICING.creditsPerSearch,
    ),
    creditsPerFetch: parsePositiveInt(
      env["DEEPSEEK_RESEARCH_CREDITS_PER_FETCH"],
      DEFAULT_RESEARCH_CREDIT_PRICING.creditsPerFetch,
    ),
  };
}

/** 사용량(성공 호출 수)을 크레딧으로 환산한다. 실패 호출은 과금하지 않는다. */
export function researchCreditsForUsage(
  usage: ResearchUsage,
  pricing: ResearchCreditPricing = DEFAULT_RESEARCH_CREDIT_PRICING,
): number {
  const searches = Math.max(0, Math.floor(usage.searches));
  const fetches = Math.max(0, Math.floor(usage.fetches));
  return searches * pricing.creditsPerSearch + fetches * pricing.creditsPerFetch;
}

export interface ResearchCreditLedgerEntry {
  readonly searches: number;
  readonly fetches: number;
  readonly credits: number;
  readonly calls: number;
}

/**
 * 프로세스 메모리 기반 사용량 장부. 영속 과금 원본은 지갑이며, 이 장부는
 * 운영자가 리서치 사용량을 한눈에 보기 위한 보조 집계다 (재시작 시 초기화).
 */
export class InMemoryResearchCreditLedger {
  private readonly entries = new Map<string, ResearchCreditLedgerEntry>();

  record(
    userId: string,
    usage: ResearchUsage,
    pricing: ResearchCreditPricing = DEFAULT_RESEARCH_CREDIT_PRICING,
  ): ResearchCreditLedgerEntry {
    const previous = this.entries.get(userId) ?? {
      searches: 0,
      fetches: 0,
      credits: 0,
      calls: 0,
    };
    const next: ResearchCreditLedgerEntry = {
      searches: previous.searches + usage.searches,
      fetches: previous.fetches + usage.fetches,
      credits: previous.credits + researchCreditsForUsage(usage, pricing),
      calls: previous.calls + 1,
    };
    this.entries.set(userId, next);
    return next;
  }

  get(userId: string): ResearchCreditLedgerEntry | undefined {
    return this.entries.get(userId);
  }
}
