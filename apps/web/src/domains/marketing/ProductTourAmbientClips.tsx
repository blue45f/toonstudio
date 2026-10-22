import { Sparkles } from "lucide-react";

import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { PRODUCT_TOUR_INTRO_CLIP, PRODUCT_TOUR_OUTRO_CLIP, productTourChapterLoop } from "./product-tour-clips";

/**
 * 투어 도입·마무리의 배경 클립. 두 편 모두 생성형 AI로 만든 배경 영상이라
 * 실제 화면 캡처로 오해하지 않게 배지로 성격을 밝힌다(ProductTourShorts의
 * 정직 표기 관행과 동일). 소리 없는 장식 영상이므로 본문 흐름에서는 빼고
 * (aria-hidden), 움직임 최소화를 선호하면 CSS가 영상 자체를 숨긴다.
 */
export function ProductTourIntroBackdrop() {
  const bi = useBilingualLocalizer("domains.marketing.ProductTourAmbientClips");
  return (
    <div className="product-tour__hero-media">
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        src={PRODUCT_TOUR_INTRO_CLIP.src}
        width={PRODUCT_TOUR_INTRO_CLIP.width}
        height={PRODUCT_TOUR_INTRO_CLIP.height}
      />
      <span className="product-tour__clip-badge">
        <Sparkles size={13} aria-hidden="true" />
        {bi("생성형 AI 배경 영상", "AI-generated backdrop")}
      </span>
    </div>
  );
}

/**
 * 챕터 카드의 배경 루프. 도입·마무리와 같은 장식 영상 계약(자동재생·무음·루프,
 * 본문 흐름에서 제외)을 따르고, 생성형 AI 영상이라는 성격은 카드가 모인
 * '챕터별 기능' 탭의 안내 문구로 밝힌다. 배경이 없는 챕터(overview)는
 * 아무것도 그리지 않는다.
 */
export function ProductTourChapterBackdrop({ chapterId }: { readonly chapterId: string }) {
  const loop = productTourChapterLoop(chapterId);
  if (!loop) return null;
  return (
    <div className="product-tour__chapter-media" aria-hidden="true">
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        tabIndex={-1}
        src={loop.src}
        width={loop.width}
        height={loop.height}
      />
    </div>
  );
}

export function ProductTourOutroBand() {
  const bi = useBilingualLocalizer("domains.marketing.ProductTourAmbientClips");
  const copy = bi(PRODUCT_TOUR_OUTRO_CLIP.ko, PRODUCT_TOUR_OUTRO_CLIP.en);
  return (
    <section className="mk-shell product-tour__outro" aria-labelledby="product-tour-outro-title">
      <div className="product-tour__outro-media">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          src={PRODUCT_TOUR_OUTRO_CLIP.src}
          width={PRODUCT_TOUR_OUTRO_CLIP.width}
          height={PRODUCT_TOUR_OUTRO_CLIP.height}
        />
        <div className="product-tour__outro-copy">
          <p className="mk-eyebrow">{copy.eyebrow}</p>
          <h2 id="product-tour-outro-title" className="mk-h2">{copy.title}</h2>
          <p className="mk-body">{copy.body}</p>
          <span className="product-tour__clip-badge product-tour__clip-badge--static">
            <Sparkles size={13} aria-hidden="true" />
            {bi("생성형 AI 배경 영상", "AI-generated backdrop")}
          </span>
        </div>
      </div>
    </section>
  );
}
