import { Sparkles } from "lucide-react";

import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { PRODUCT_TOUR_INTRO_CLIP, PRODUCT_TOUR_OUTRO_CLIP } from "./product-tour-clips";

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
