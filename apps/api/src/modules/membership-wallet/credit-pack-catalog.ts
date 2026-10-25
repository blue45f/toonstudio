/**
 * credit-pack-catalog.ts — 크레딧 팩 카탈로그 (P3, 게이트 OFF 유지).
 * Nest에 의존하지 않는 순수 모듈이다.
 *
 * 환산 기준: 1크레딧 = 10원 (`credit-pricing.ts`의 KRW_PER_CREDIT과
 * 동일 원천). 팩 가격은 반드시 크레딧 × 10원과 일치해야 하며,
 * 불일치 팩은 카탈로그 검증에서 거부한다 (보너스·할인 팩은 이
 * 카탈로그에 두지 않는다 — 보너스율은 별도 제품 결정 사항이다).
 *
 * 팩 구성 상태 (에이전트 결정, 사용자 확정 대기):
 *  - 아래 4종 팩은 게이트·정산 구조를 검증하기 위한 예시 구성이다.
 *    확정 팩 구성이 아니며, 정식 판매 시 제품 결정으로 교체한다.
 *  - 이 카탈로그가 존재한다고 해서 구매가 열리는 것이 아니다.
 *    구매 가능 여부는 `credit-purchase-intent.ts`의 게이트가 결정하며,
 *    현행 정책(`creditPurchasesEnabled: false`)에서는 구매가 거부된다.
 */
import { KRW_PER_CREDIT } from "./credit-pricing";

export interface CreditPack {
  readonly id: string;
  /** 팩 크레딧량. */
  readonly credits: number;
  /** 원화 표시 가격. 반드시 credits × KRW_PER_CREDIT과 일치한다. */
  readonly krwPrice: number;
}

/** 예시 팩 구성 (확정 아님 — 구조 검증용). */
export const CREDIT_PACK_CATALOG: readonly CreditPack[] = [
  { id: "credit-pack-100", credits: 100, krwPrice: 1_000 },
  { id: "credit-pack-500", credits: 500, krwPrice: 5_000 },
  { id: "credit-pack-1000", credits: 1_000, krwPrice: 10_000 },
  { id: "credit-pack-5000", credits: 5_000, krwPrice: 50_000 },
] as const;

export function findCreditPack(packId: unknown): CreditPack | null {
  if (typeof packId !== "string") return null;
  const trimmed = packId.trim();
  if (!trimmed) return null;
  return CREDIT_PACK_CATALOG.find((pack) => pack.id === trimmed) ?? null;
}

/**
 * 팩 가격 정합성을 검증한다. 크레딧 × 10원과 다르면 false이다.
 * 카탈로그 자체가 이 검사를 통과하지 못하면 구매 의도 처리 전에
 * 구조 오류로 취급해야 한다.
 */
export function isCreditPackPriceConsistent(pack: CreditPack): boolean {
  return (
    Number.isSafeInteger(pack.credits)
    && pack.credits > 0
    && pack.krwPrice === pack.credits * KRW_PER_CREDIT
  );
}

export function isCreditPackCatalogConsistent(): boolean {
  return CREDIT_PACK_CATALOG.every(isCreditPackPriceConsistent);
}
