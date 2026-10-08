import { ArrowUpRight, BookOpen, Cpu } from "lucide-react";

import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  PRODUCT_TOUR_TECH_LINKS,
  PRODUCT_TOUR_TECH_STATUS_LABEL,
  productTourAtlasHref,
  productTourStoryHref,
  type ProductTourTechChapterId,
} from "./public/product-tour-tech-links";

/**
 * 투어 챕터 카드 안의 "이 장면에 쓰인 기술": 기술 도감 카드 칩 1~3개와, 같은 주제의 제작 스토리 챕터 링크.
 * 스토리 링크 옆의 배지는 그 챕터의 현재 상태(운영 경로·설정 필요·실험 기능·문서화)다 — 기술이 모두 운영 중이라는 뜻이 아니다.
 * 도감·스토리 데이터는 가져오지 않고 링크 문자열만 만든다(대조는 legal/technology/product-tour-tech-links.test.ts).
 */
export function ProductTourTechLinks({ chapterId }: { readonly chapterId: ProductTourTechChapterId }) {
  const bi = useBilingualLocalizer("domains.marketing.ProductTourTechLinks");
  const tech = PRODUCT_TOUR_TECH_LINKS[chapterId];
  const status = PRODUCT_TOUR_TECH_STATUS_LABEL[tech.story.status];
  const labelId = `product-tour-tech-${chapterId}`;
  return (
    <div className="product-tour__tech" role="group" aria-labelledby={labelId} data-tech-chapter={chapterId}>
      <p id={labelId} className="product-tour__tech-title">
        <Cpu size={14} aria-hidden="true" />
        {bi("이 장면에 쓰인 기술", "Technology in this scene")}
        <small>{bi("· 기술 도감", "· tech atlas")}</small>
      </p>
      <ul className="product-tour__tech-chips">
        {tech.atlas.map((link) => (
          <li key={link.atlasId}>
            <Link className="mk-chip" href={productTourAtlasHref(link.atlasId)}>
              {bi(link.label.ko, link.label.en)}
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Link className="product-tour__tech-story" href={productTourStoryHref(tech.story.chapterId)}>
        <BookOpen size={14} aria-hidden="true" />
        <span>{bi("제작 스토리", "Engineering story")} · {bi(tech.story.label.ko, tech.story.label.en)}</span>
        <em className="product-tour__tech-status" data-status={tech.story.status}>{bi(status.ko, status.en)}</em>
      </Link>
    </div>
  );
}
