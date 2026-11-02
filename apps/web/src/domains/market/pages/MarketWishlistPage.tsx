import {
  ArrowRight,
  FolderHeart,
  Heart,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import "../components/market-library-experience.css";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketSectionArtBanner } from "../components/MarketSectionArtBanner";
import { MarketWishlistMoodboardPanel } from "../components/MarketWishlistMoodboardPanel";
import { MarketWishlistResource } from "../components/MarketWishlistResource";
import { useMarketCollections } from "../hooks/use-market-collections";
import { useMarketWishlist } from "../hooks/use-market-wishlist";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/shared/seo/use-document-title";

export function MarketWishlistPage() {
  const bt = useBilingual("MarketWishlistPage");
  useDocumentTitle(bt("찜 목록 · 창작 마켓", "Wishlist · Creator Market"));
  useMetaDescription(
    bt(
      "내가 찜한 웹툰 창작 마켓 리소스들을 프로젝트별 무드보드 컬렉션으로 묶고, 공정 준비도와 출처 표기를 한 번에 점검하세요.",
      "Organize saved webtoon market resources into project moodboard collections, check episode stage readiness, and copy unified credits.",
    ),
  );

  const { wishlistIds, wishlistCount, removeFromWishlist, storageError } = useMarketWishlist();
  const {
    collections,
    memos,
    createCollection,
    renameCollection,
    deleteCollection,
    toggleResourceInCollection,
    setResourceMemo,
  } = useMarketCollections();

  const [visibleCount, setVisibleCount] = useState(12);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [resolvedMap, setResolvedMap] = useState<
    Readonly<Record<string, CreatorMarketplaceResourceRecord>>
  >({});

  const handleResolved = useCallback(
    (resourceId: string, record: CreatorMarketplaceResourceRecord | null) => {
      setResolvedMap((prev) => {
        if (!record) {
          if (!(resourceId in prev)) return prev;
          const next = { ...prev };
          delete next[resourceId];
          return next;
        }
        if (prev[resourceId] === record) return prev;
        return { ...prev, [resourceId]: record };
      });
    },
    [],
  );

  const activeCollection = useMemo(
    () => collections.find((item) => item.id === activeCollectionId) ?? null,
    [activeCollectionId, collections],
  );

  const filteredIds = useMemo(() => {
    if (!activeCollection) return wishlistIds;
    const allowed = new Set(activeCollection.resourceIds);
    return wishlistIds.filter((id) => allowed.has(id));
  }, [activeCollection, wishlistIds]);

  const visibleIds = useMemo(
    () => filteredIds.slice(0, visibleCount),
    [filteredIds, visibleCount],
  );

  const activeResolvedRecords = useMemo(() => {
    const records: CreatorMarketplaceResourceRecord[] = [];
    for (const id of filteredIds) {
      const record = resolvedMap[id];
      if (record) records.push(record);
    }
    return records;
  }, [filteredIds, resolvedMap]);

  return (
    <Container size="wide" className="market-library-page py-7 sm:py-10">
      <MarketNavHeader />

      <MarketSectionArtBanner />

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-2">
            <FolderHeart className="size-5 text-warn" />
            <h1 className="text-xl font-bold text-fg sm:text-2xl">{bt("찜 목록", "Wishlist")}</h1>
            <span className="numeral tnum rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-bold text-fg">
              {bt(`${wishlistCount}개`, `${wishlistCount} items`)}
            </span>
          </div>
          <p className="mt-1 text-xs text-fg-3">
            {bt(
              "이 브라우저에 저장한 찜 목록 및 프로젝트 무드보드입니다. 소장·기기 설치와는 별개이며 소재 상세에서 현재 공개 상태와 사용권을 확인하세요.",
              "Saved in this browser along with your project moodboards, separately from ownership and device installation.",
            )}
          </p>
        </div>

        <Link
          href="/market/browse"
          className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
        >
          <span>{bt("더 둘러보기", "Browse more")}</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {storageError ? (
        <p role="alert" className="mt-4 rounded-xl border border-bad/30 bg-panel p-3 text-sm text-fg">
          {storageError}
        </p>
      ) : null}

      {wishlistIds.length === 0 ? (
        <ActionableEmptyState
          art="generic"
          className="mt-10"
          icon={Heart}
          title={bt("찜한 에셋이 아직 없어요", "No saved assets yet")}
          description={bt(
            "마켓 카탈로그를 둘러보시면서 마음에 드는 에셋 카드 좌측 상단의 하트 버튼을 눌러보세요.",
            "Browse the market catalog and tap the heart button at the top-left of any asset card you like.",
          )}
          primary={{ href: "/market/browse", label: bt("에셋 탐색하러 가기", "Explore assets") }}
        />
      ) : (
        <section aria-label={bt("찜한 소재 목록", "Saved materials")}>
          <div
            data-testid="market-wishlist-quick-actions"
            role="group"
            aria-label={bt("찜 목록 빠른 도구", "Wishlist quick tools")}
            className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel/60 px-4 py-3"
          >
            <span className="text-xs font-semibold text-fg-2">
              {bt(
                "찜한 에셋을 구매하기 전에 내 원고 컷에서 시험하거나 스펙을 나란히 비교해 보세요.",
                "Before buying saved assets, test them on your manuscript cut or compare specs side by side.",
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/market/fit-lab"
                className={buttonClass({ variant: "outline", size: "sm", className: "min-h-9" })}
              >
                {bt("원고 위 시험 (Fit Lab)", "Test in Fit Lab")}
              </Link>
              <Link
                href="/market/compare"
                className={buttonClass({ variant: "outline", size: "sm", className: "min-h-9" })}
              >
                {bt("에셋 나란히 비교", "Compare side by side")}
              </Link>
            </div>
          </div>

          <MarketWishlistMoodboardPanel
            allWishlistCount={wishlistCount}
            collections={collections}
            activeCollectionId={activeCollection?.id ?? null}
            onSelectCollection={(id) => {
              setActiveCollectionId(id);
              setVisibleCount(12);
            }}
            onCreateCollection={(name, desc) => {
              const created = createCollection(name, desc, visibleIds);
              if (created) setActiveCollectionId(created.id);
            }}
            onRenameCollection={(id, name, desc) => {
              renameCollection(id, name, desc);
            }}
            onDeleteCollection={(id) => {
              deleteCollection(id);
              if (activeCollectionId === id) setActiveCollectionId(null);
            }}
            resolvedRecords={activeResolvedRecords}
            memos={memos}
          />

          {filteredIds.length === 0 && activeCollection ? (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-panel p-8 text-center">
              <p className="text-sm font-bold text-fg">
                {bt(
                  `“${activeCollection.name}” 컬렉션에 배정된 찜 소재가 아직 없습니다`,
                  `No saved items assigned to “${activeCollection.name}” yet`,
                )}
              </p>
              <p className="mt-1 text-xs text-fg-2">
                {bt(
                  "전체 찜 탭에서 각 카드 하단의 컬렉션 칩을 눌러 이 무드보드에 담아보세요.",
                  "Switch to the All saved tab and click the collection chip below any card to assign it here.",
                )}
              </p>
              <button
                type="button"
                onClick={() => setActiveCollectionId(null)}
                className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}
              >
                {bt("전체 찜 보기", "View all saved")}
              </button>
            </div>
          ) : (
            <ul
              aria-label={bt("찜한 소재 목록", "Saved materials")}
              className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {visibleIds.map((id, index) => (
                <li
                  key={id}
                  aria-label={bt(`찜한 소재 ${index + 1}`, `Saved material ${index + 1}`)}
                  className="min-w-0"
                  {...introItemProps(index)}
                >
                  <MarketWishlistResource
                    resourceId={id}
                    onRemove={removeFromWishlist}
                    onResolved={handleResolved}
                    collections={collections}
                    onToggleInCollection={toggleResourceInCollection}
                    memo={memos[id] ?? ""}
                    onSaveMemo={setResourceMemo}
                  />
                </li>
              ))}
            </ul>
          )}

          {filteredIds.length > visibleCount ? (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 12)}
                className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}
              >
                {bt("찜한 소재 더 보기", "Load more saved materials")}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </Container>
  );
}
