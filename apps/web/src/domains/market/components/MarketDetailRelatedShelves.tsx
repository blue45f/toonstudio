import { ArrowRight, Store } from "lucide-react";
import { useMemo } from "react";

import { scoreSimilarMarketResources } from "../models/market-similar-resources";

import { MarketRecentlyViewedStrip } from "./MarketRecentlyViewedStrip";
import { MarketResourceCard } from "./MarketResourceCard";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

interface MarketDetailRelatedShelvesProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly relatedItems: readonly CreatorMarketplaceResourceRecord[];
  readonly publisherItems?: readonly CreatorMarketplaceResourceRecord[];
}

/**
 * 상세 화면 하단 발견 선반:
 * 1) manifest 속성 기반 유사 소재 추천
 * 2) 같은 배급자의 다른 공개 패키지 (배급자 스토어로 직결)
 * 3) 최근 열어본 소재 히스토리 스트립
 */
export function MarketDetailRelatedShelves({
  record,
  relatedItems,
  publisherItems = [],
}: MarketDetailRelatedShelvesProps) {
  const t = useBilingual("MarketDetailRelatedShelves");

  const similarItems = useMemo(() => {
    const scored = scoreSimilarMarketResources(record, relatedItems, 4);
    return scored.length > 0
      ? scored
      : relatedItems.filter((item) => item.id !== record.id).slice(0, 4);
  }, [record, relatedItems]);

  const otherFromPublisher = useMemo(
    () => publisherItems.filter((item) => item.id !== record.id).slice(0, 4),
    [publisherItems, record.id],
  );

  return (
    <div className="space-y-6">
      {similarItems.length > 0 ? (
        <section aria-labelledby="market-related-heading">
          <div className="flex items-center justify-between gap-2">
            <h2 id="market-related-heading" className="eyebrow text-fg-3">
              {t("유사 소재 & 같은 종류 추천", "Similar & same-kind recommendations")}
            </h2>
            <Link
              href={`/market/browse?kind=${encodeURIComponent(record.kind)}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              {t("더 보기", "More")}
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {similarItems.map((item) => (
              <li key={item.id}>
                <MarketResourceCard record={item} className="h-full" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {otherFromPublisher.length > 0 ? (
        <section aria-labelledby="market-publisher-more-heading">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="market-publisher-more-heading"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-3"
            >
              <Store className="size-3.5 text-accent" aria-hidden="true" />
              {t(
                `${record.publisher.name} 배급자의 다른 소재`,
                `More from ${record.publisher.name}`,
              )}
            </h2>
            <Link
              href={`/market/creator/${encodeURIComponent(record.publisher.id)}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              {t("배급자 스토어 전체 보기", "Visit creator storefront")}
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {otherFromPublisher.map((item) => (
              <li key={item.id}>
                <MarketResourceCard record={item} className="h-full" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MarketRecentlyViewedStrip excludeId={record.id} />
    </div>
  );
}
