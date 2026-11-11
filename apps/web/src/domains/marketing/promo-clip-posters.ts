import { PRODUCT_TOUR_SHORTS } from "./product-tour-shorts";

const SHORTS_WITH_DERIVED_POSTERS = new Set([
  ...PRODUCT_TOUR_SHORTS.map((short) => short.src),
  "/brand/promo-shorts/shorts-18-reactions.mp4",
]);

/** 원본 영상의 실제 프레임 파생 이미지만 연결한다. 재생 성공을 뜻하지 않는다. */
export function promoClipPoster(src: string): string | undefined {
  if (!SHORTS_WITH_DERIVED_POSTERS.has(src)) return undefined;
  const stem = src.slice(src.lastIndexOf("/") + 1, -4);
  return `/brand/promo-shorts/posters/${stem}.webp`;
}
