/**
 * studio-decoration-credit-catalog.ts — 가상 스튜디오 꾸미기 유료 상품
 * 카탈로그 구조 (P3). Nest에 의존하지 않는 순수 모듈이다.
 *
 * 분리 원칙 (설계서 §4, 서베이 §4.5 실측):
 *  - 기존 decoration `save()` / furniture `upload()`는 구매·가격이 없는
 *    무료 배치 흐름이다. 이 카탈로그는 그 흐름에 차감을 끼우지 않는다.
 *  - 유료 아이템은 장착(구매) 시점에 별도로 결제하고, 그 뒤의 배치는
 *    기존 무료 `save()` 경로로 저장한다. 무료 배치와 유료 장착 시점이
 *    분리되지 않으면 무료 배치까지 과금되는 오설계가 된다.
 *  - 카탈로그에 없는 아이템은 무료 취급이다. 구매 오케스트레이션
 *    (studio-decoration-credit-purchase.ts)은 카탈로그 외 아이템을
 *    거부하고, 호출부는 기존 무료 배치 경로로 돌려보낸다.
 *
 * 라이선스 전제 (엄수):
 *  - 이 카탈로그의 상품은 자체 제작 콘텐츠, 또는 판매가 허용된
 *    라이선스 하의 콘텐츠만을 전제로 한다. 샘플 아이템은 구조 정의만
 *    하며 실제 콘텐츠·이미지·메시는 포함하지 않는다.
 *  - Creator Bundle 에셋을 판매 아이템으로 전용하지 않는다. 해당
 *    에셋은 원본 소스 파일의 재판매·재배포·공유(수정본 포함)가 금지된
 *    라이선스이며, 서비스 내 무료 제공 구조와 판매는 다른 행위이다.
 *
 * 가격 상태 (에이전트 결정, 사용자 확정 대기):
 *  - 아래 샘플 가격은 카탈로그 구조를 검증하기 위한 예시값이다.
 *    확정 가격이 아니며, 정식 상품 등록 시 제품 결정으로 교체한다.
 *  - 가격은 크레딧 단위이며 서버가 권위를 갖는다. 클라이언트 제시
 *    가격은 받지 않는다 (spend 오케스트레이션의 서버 가격 권위와 동일).
 */
export interface DecorationCreditItem {
  readonly id: string;
  /** 크레딧 가격. 0 이하인 상품은 카탈로그에 두지 않는다 (무료 경로). */
  readonly priceCredits: number;
  /** 구조 정의용 메모. 실제 콘텐츠 식별자는 별도 상품 등록 시 부여한다. */
  readonly note: string;
}

/**
 * 샘플 아이템 (구조 정의만 — 콘텐츠 미포함, 가격 예시·확정 아님).
 * 실제 판매 상품은 이 목록을 교체·확장하는 방식으로 등록한다.
 */
export const DECORATION_CREDIT_CATALOG: readonly DecorationCreditItem[] = [
  {
    id: "decoration.sample.potted-plant",
    priceCredits: 50,
    note: "샘플: 화분 장식 (구조 정의만, 콘텐츠 없음)",
  },
  {
    id: "decoration.sample.neon-sign",
    priceCredits: 120,
    note: "샘플: 네온 간판 장식 (구조 정의만, 콘텐츠 없음)",
  },
  {
    id: "decoration.sample.floor-rug",
    priceCredits: 80,
    note: "샘플: 바닥 러그 장식 (구조 정의만, 콘텐츠 없음)",
  },
] as const;

export function findDecorationCreditItem(
  itemId: unknown,
): DecorationCreditItem | null {
  if (typeof itemId !== "string") return null;
  const trimmed = itemId.trim();
  if (!trimmed) return null;
  return DECORATION_CREDIT_CATALOG.find((item) => item.id === trimmed) ?? null;
}

export function isDecorationCreditItemId(itemId: unknown): boolean {
  return findDecorationCreditItem(itemId) !== null;
}

/**
 * 카탈로그 가격을 반환한다. 카탈로그 외 아이템은 null이다 —
 * null은 "무료 배치 경로"를 뜻하며 0원 결제가 아니다.
 */
export function decorationCreditPrice(itemId: unknown): number | null {
  return findDecorationCreditItem(itemId)?.priceCredits ?? null;
}
