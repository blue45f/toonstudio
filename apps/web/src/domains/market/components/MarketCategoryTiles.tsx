import { ArrowUpRight } from "lucide-react";

import { MARKET_FAMILY_ART } from "../models/market-family-art";
import {
  MARKET_RESOURCE_FAMILIES,
  marketResourceBrowseHref,
  type MarketResourceFamily,
} from "../models/market-resource-taxonomy";

import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

function CategoryTile({ family, index }: { readonly family: MarketResourceFamily; readonly index: number }) {
  const art = MARKET_FAMILY_ART[family.id];
  const Icon = family.icon;
  return (
    <Link
      {...introItemProps(index)}
      href={marketResourceBrowseHref(family.subcategories[0])}
      className="group relative block overflow-hidden rounded-2xl border border-line bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
    >
      <img
        src={art.image}
        alt=""
        width={640}
        height={400}
        className="aspect-[16/10] w-full object-cover transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        style={{ objectPosition: art.position }}
      />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-canvas/90 via-canvas/45 to-transparent px-3.5 pb-3 pt-10">
        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-fg-2">{family.english}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-base font-bold text-fg">
          {family.label}
          <ArrowUpRight className="size-4 shrink-0 text-fg-3 transition-all group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
        </span>
      </span>
      <span className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-canvas/70 text-fg backdrop-blur-sm">
        <Icon className="size-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * 마켓 홈 첫 화면의 카테고리 진입 — 칩 행 대신 작업군 대표 아트를 전면에 둔 타일 5장.
 * 이동 경로는 작업군 선택기와 같은 첫 세부 카테고리 링크를 쓴다.
 */
export function MarketCategoryTiles({ className }: { readonly className?: string }) {
  const bt = useBilingual("MarketCategoryTiles");
  return (
    <nav aria-label={bt("소재 카테고리", "Material categories")} className={className}>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        {MARKET_RESOURCE_FAMILIES.map((family, index) => (
          <li key={family.id} className={index === MARKET_RESOURCE_FAMILIES.length - 1 ? "col-span-2 sm:col-span-1" : undefined}>
            <CategoryTile family={family} index={index} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
