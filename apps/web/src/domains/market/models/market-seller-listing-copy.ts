/**
 * 판매 리스팅 검증 실패 문구 — 등록 마법사(MarketSellerListingWizard)와
 * 대시보드의 일괄 가격 변경(MarketSellerDashboard)이 같은 사유에 같은 문장을 쓰도록
 * 한곳에 둔다. 문구는 모델의 검증 사유(SellerListingValidationReason)와 1:1이다.
 */

import {
  MIN_SELLER_POINT_PRICE,
  type SellerListingValidationReason,
} from "./market-seller-listings";

/** useBilingual 이 돌려주는 [한국어, 영어] 선택 함수. */
export type Translate = (ko: string, en: string) => string;

export function listingValidationMessage(
  bt: Translate,
  reason: SellerListingValidationReason,
): string {
  switch (reason) {
    case "title-required":
      return bt("제목을 입력하세요.", "Enter a title.");
    case "title-too-long":
      return bt("제목이 너무 길어요.", "The title is too long.");
    case "seller-name-required":
      return bt("판매자 이름이 없어요.", "A seller name is required.");
    case "seller-name-too-long":
      return bt("판매자 이름이 너무 길어요.", "The seller name is too long.");
    case "description-too-long":
      return bt("설명이 너무 길어요 (최대 500자).", "The description is too long (500 characters max).");
    case "price-not-integer":
      return bt("가격은 정수 포인트로 입력하세요.", "Enter the price as whole points.");
    case "price-too-low":
      return bt(`가격은 최소 ${MIN_SELLER_POINT_PRICE}P부터예요.`, `The minimum price is ${MIN_SELLER_POINT_PRICE}P.`);
  }
}
