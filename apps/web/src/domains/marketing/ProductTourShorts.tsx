import { Sparkles } from "lucide-react";

import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { PRODUCT_TOUR_SHORTS } from "./product-tour-shorts";

/**
 * 쇼츠로 보는 ToonStudio — 세로(9:16) 홍보 쇼츠 4편을 나란히 보여 주는 카드 섹션.
 * 네 편 모두 생성형 AI로 만든 개념 영상이므로, 실제 화면 캡처로 오해하지 않게
 * 안내 문구와 카드 배지로 성격을 밝힌다(ProductTourAdditions의 표기 관행과 동일).
 */
export function ProductTourShorts() {
  const bi = useBilingualLocalizer("domains.marketing.ProductTourShorts");
  return (
    <section className="mk-shell product-tour__shorts" aria-labelledby="product-tour-shorts-title">
      <div className="product-tour__more-head">
        <p className="mk-eyebrow">{bi("짧은 영상", "Short takes")}</p>
        <h2 id="product-tour-shorts-title" className="mk-h2">{bi("쇼츠로 보는 ToonStudio", "ToonStudio in four shorts")}</h2>
      </div>
      <p className="mk-body product-tour__note">{bi(
        "9분 투어가 길게 느껴지면, 30초 안팎의 세로 영상 네 편으로 먼저 만나 보세요. 네 편 모두 생성형 AI로 만든 개념 영상이라 실제 제품 화면과는 다를 수 있습니다.",
        "If the nine-minute tour feels long, start with four vertical clips of about thirty seconds each. All four are AI-generated concept clips, so they may differ from the actual product screens.",
      )}</p>
      <ul className="product-tour__shorts-grid">
        {PRODUCT_TOUR_SHORTS.map((short) => {
          const copy = bi(short.ko, short.en);
          return (
            <li key={short.id} className="product-tour__short mk-card" data-short={short.id}>
              <video
                controls
                muted
                playsInline
                preload="metadata"
                src={short.src}
                width={short.width}
                height={short.height}
                aria-label={copy.title}
              />
              <div className="product-tour__short-copy">
                <h3>{copy.title}</h3>
                <p>{copy.body}</p>
                <div className="product-tour__short-meta">
                  <span className="mk-badge"><Sparkles size={13} aria-hidden="true" />{bi("개념 영상", "Concept clip")}</span>
                  <span className="product-tour__short-duration">{short.durationLabel}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
