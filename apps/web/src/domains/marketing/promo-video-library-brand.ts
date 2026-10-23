/**
 * 홍보 영상 자료실의 브랜드 카테고리 보관 항목(17차 파도분) — 통합
 * 레지스트리 promo-video-library.ts가 소스 파일 800줄 상한에 닿아,
 * 페이지 카테고리(promo-video-library-pages.ts)와 같은 방식으로
 * 17차 파도에서 더한 브랜드 보관 항목 3편의 표시 항목을 이 파일로
 * 분리했다. 전부 생성형 AI로 만든 개념 영상이고, 아직 표면에 배선하지
 * 않은 자료실 보관분이다. 클립 규격의 정본은 brand-clips.ts다.
 */
import {
  BRAND_OCEAN_CLIP,
  BRAND_SQUARE_BLOOM_CLIP,
  HOME_HERO_FOG_CLIP,
  type BrandClip,
} from "./brand-clips";
import type { PromoVideoItem } from "./promo-video-library";

/** promo-video-library.ts의 LIBRARY_ONLY와 같은 값 — 순환 import를 피하려고 이 파일에 따로 둔다. */
const LIBRARY_ONLY = { ko: "자료실 보관", en: "Library only" } as const;

/** promo-video-library.ts의 brandLibraryItem과 같은 모양 — 분리한 항목만 여기서 만든다. */
const brandLibraryItem = (
  id: string,
  clip: BrandClip,
  ko: { readonly title: string; readonly body: string },
  en: { readonly title: string; readonly body: string },
): PromoVideoItem => ({
  id,
  categoryId: "brand",
  src: clip.src,
  width: clip.width,
  height: clip.height,
  durationLabel: "0:14",
  ko,
  en,
  usage: LIBRARY_ONLY,
});

export const PROMO_VIDEO_BRAND_LIBRARY_ITEMS: readonly PromoVideoItem[] = [
  brandLibraryItem("brand-ocean", BRAND_OCEAN_CLIP, {
    title: "바다 앞의 스튜디오",
    body: "파도 소리가 닿는 바다 앞 작업실을 그린 클립입니다.",
  }, {
    title: "Studio by the sea",
    body: "A studio by the sea, close enough to hear the waves.",
  }),
  brandLibraryItem("brand-home-hero-fog", HOME_HERO_FOG_CLIP, {
    title: "안개의 파노라마",
    body: "안개가 창밖을 감싸는 스튜디오 파노라마입니다. 낮·노을·밤·비·눈·새벽 파노라마와 한 세트로 보관합니다.",
  }, {
    title: "Fog panorama",
    body: "A studio panorama wrapped in fog outside the window, kept as a set with the day, evening, night, rain, snow and dawn panoramas.",
  }),
  brandLibraryItem("brand-square-bloom", BRAND_SQUARE_BLOOM_CLIP, {
    title: "정사각 꽃 스팅",
    body: "꽃이 피어나는 1:1 정사각 브랜드 스팅입니다. 정사각 스팅 세트와 함께 보관합니다.",
  }, {
    title: "Square bloom sting",
    body: "A 1:1 square brand sting of a flower blooming — kept with the square sting set.",
  }),
];
