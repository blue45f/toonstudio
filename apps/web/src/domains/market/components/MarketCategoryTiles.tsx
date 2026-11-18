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

function CategoryTile({
  family,
  index,
}: {
  readonly family: MarketResourceFamily;
  readonly index: number;
}) {
  const bt = useBilingual("MarketCategoryTiles");
  const art = MARKET_FAMILY_ART[family.id];
  const Icon = family.icon;
  const subHintKo = family.subcategories
    .slice(0, 2)
    .map((sub) => sub.label)
    .join(" · ");
  const subHintEn = family.subcategories
    .slice(0, 2)
    .map((sub) => sub.labelEn)
    .join(" · ");

  return (
    <Link
      {...introItemProps(index)}
      href={marketResourceBrowseHref(family.subcategories[0])}
      className="ink-frame group relative block overflow-hidden rounded-[14px] border border-line bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
    >
      <div className="ink-cover ink-sheen aspect-[16/10] w-full overflow-hidden bg-panel">
        <img
          src={art.image}
          alt=""
          width={640}
          height={400}
          className="size-full object-cover"
          style={{ objectPosition: art.position }}
        />
      </div>
      <span className="absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-canvas/95 via-canvas/60 to-transparent px-3.5 pb-3 pt-9">
        <span className="block truncate text-xs text-fg-2">
          {bt(subHintKo, subHintEn)}
        </span>
        <span className="ink-arrow mt-0.5 flex items-center gap-1.5 text-base font-semibold text-fg [word-break:keep-all]">
          <span>{bt(family.label, family.labelEn)}</span>
          <ArrowUpRight
            className="size-4 shrink-0 text-fg-3 transition-colors duration-150 group-hover:text-accent"
            aria-hidden="true"
          />
        </span>
      </span>
      <span className="absolute right-2.5 top-2.5 z-[3] grid size-8 place-items-center rounded-[8px] border border-line/70 bg-canvas/85 text-fg-2 backdrop-blur-sm [-webkit-backdrop-filter:blur(4px)]">
        <Icon className="size-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * 마켓 홈의 카테고리 진입 — 작업군 대표 아트를 전면에 둔 타일 5장.
 * 이동 경로는 작업군 선택기와 같은 첫 세부 카테고리 링크를 쓴다.
 */
export function MarketCategoryTiles({ className }: { readonly className?: string }) {
  const bt = useBilingual("MarketCategoryTiles");
  return (
    <nav aria-label={bt("소재 카테고리", "Material categories")} className={className}>
      <ul
        data-ink-stagger="panel"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        {MARKET_RESOURCE_FAMILIES.map((family, index) => (
          <li
            key={family.id}
            className={index === MARKET_RESOURCE_FAMILIES.length - 1 ? "col-span-2 sm:col-span-1" : undefined}
          >
            <CategoryTile family={family} index={index} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
