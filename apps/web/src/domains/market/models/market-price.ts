/**
 * 마켓 카드 가격 표시 모델 (personal P-4, BLUEPRINT §6.3, S3-17).
 *
 * 목록 계약(CreatorMarketplaceResourceRecord)에는 리소스별 가격 필드가 없고
 * `access`는 "free" 리터럴뿐이다. 실제 청구액은 획득 견적(quote)이 정한다 —
 * 유료 운영에서는 상품별 가격 오버라이드(commerceProductPrices)가 없으면
 * 공개 상거래 설정의 표준 가격(defaultMarketPriceKrw)이 적용된다
 * (resolveMarketplaceProductPrice와 같은 규칙). 그래서 카드가 목록 단계에서
 * 정직하게 말할 수 있는 가격은 셋뿐이다:
 * - 무료 운영: 전부 무료 → "무료"
 * - 유료 운영 + 표준 가격 확정: 표준 가격을 "표준 가격" 캡션과 함께 표시
 *   (상품별 오버라이드 반영은 견적 단계 — 카드가 확정가로 단정하지 않는다)
 * - 유료 운영 + 가격 미확정(설정 로딩 전 등): 금액을 지어내지 않고 "유료"
 * 리소스별 가격 필드가 목록 계약에 생기면 이 모델에 우선 입력으로 받는다.
 */
export type MarketCardPrice =
  | { readonly kind: "free"; readonly label: string; readonly caption: string | null }
  | { readonly kind: "paid"; readonly label: string; readonly caption: string | null }
  | { readonly kind: "paid-unknown"; readonly label: string; readonly caption: string | null };

const KRW_FORMATTER = new Intl.NumberFormat("ko-KR");

/** 원화 금액 표기 — 카드의 numeral 관습에 맞춰 천 단위 구분 + "원". */
export function formatMarketPriceKrw(amount: number): string {
  return `${KRW_FORMATTER.format(amount)}원`;
}

export function resolveMarketCardPrice(input: {
  readonly isPaidMode: boolean;
  /** 공개 상거래 설정의 표준 가격(KRW). 설정이 아직 없으면 null/undefined. */
  readonly defaultPriceKrw?: number | null;
}): MarketCardPrice {
  if (!input.isPaidMode) {
    return { kind: "free", label: "무료", caption: null };
  }
  const price = input.defaultPriceKrw;
  if (typeof price === "number" && Number.isFinite(price) && Number.isInteger(price) && price > 0) {
    return { kind: "paid", label: formatMarketPriceKrw(price), caption: "표준 가격" };
  }
  return { kind: "paid-unknown", label: "유료", caption: null };
}
