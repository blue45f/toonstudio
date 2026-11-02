import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Copy,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketQuickPreviewDialog } from "../components/MarketQuickPreviewDialog";
import { MarketRecentlyViewedStrip } from "../components/MarketRecentlyViewedStrip";
import { MarketResourceCard } from "../components/MarketResourceCard";
import { StaleNoticeBar } from "../components/StaleNoticeBar";
import { useMarketFollowedCreators } from "../hooks/use-market-followed-creators";
import { useMarketResources } from "../hooks/use-market-resources";
import { MARKET_KINDS, marketKindMeta } from "../models/market-kind";

import {
  CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS,
  CreatorMarketplaceResourceKindSchema,
  CreatorMarketplaceResourcePublisherQuerySchema,
  type CreatorMarketplaceResourceKind,
  type CreatorMarketplaceResourceRecord,
  type CreatorMarketplaceResourceSort,
} from "@/shared/lib/creator-marketplace-resource-contract";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/shared/seo/use-document-title";

const OFFICIAL_PUBLISHER_ID = [
  "00000000",
  "0000",
  "4000",
  "8000",
  "000000000001",
].join("-");
const PAGE_SIZE = 20;

type StorefrontSortMode = CreatorMarketplaceResourceSort | "updated" | "name";

interface MarketCreatorStorefrontPageProps {
  readonly onQuickPreview?: (record: CreatorMarketplaceResourceRecord) => void;
}

export function MarketCreatorStorefrontPage({
  onQuickPreview,
}: MarketCreatorStorefrontPageProps = {}) {
  const t = useBilingual("MarketCreatorStorefrontPage");
  const { publisherId: rawPublisherId } = useParams<{ publisherId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const parsedPublisher = useMemo(() => {
    if (!rawPublisherId) return null;
    const res = CreatorMarketplaceResourcePublisherQuerySchema.safeParse(rawPublisherId);
    return res.success ? res.data.toLowerCase() : null;
  }, [rawPublisherId]);

  const rawKind = searchParams.get("kind");
  const activeKind: CreatorMarketplaceResourceKind | undefined = useMemo(() => {
    if (!rawKind) return undefined;
    const parsed = CreatorMarketplaceResourceKindSchema.safeParse(rawKind);
    return parsed.success ? parsed.data : undefined;
  }, [rawKind]);

  const [searchDraft, setSearchDraft] = useState(() => searchParams.get("q") ?? "");
  const activeSearch = searchParams.get("q")?.trim() || undefined;
  const noAiOnly = searchParams.get("containsAi") === "false";
  const commercialOnly = searchParams.get("commercial") === "true";
  const activeSort: StorefrontSortMode =
    searchParams.get("sort") === "updated"
      ? "updated"
      : searchParams.get("sort") === "name"
        ? "name"
        : activeSearch && searchParams.get("sort") === "relevance"
          ? "relevance"
          : "newest";
  const serverSort: CreatorMarketplaceResourceSort =
    activeSort === "relevance" && activeSearch ? "relevance" : "newest";

  const [copiedLink, setCopiedLink] = useState(false);
  const [quickPreviewRecord, setQuickPreviewRecord] =
    useState<CreatorMarketplaceResourceRecord | null>(null);
  const { followedCreators, isFollowingCreator, toggleFollowCreator } =
    useMarketFollowedCreators();

  const page = useMarketResources(
    parsedPublisher
      ? {
        publisher: parsedPublisher,
        kind: activeKind,
        search: activeSearch,
        ...(noAiOnly ? { containsAi: false } : {}),
        ...(commercialOnly ? { commercial: true } : {}),
        sort: serverSort,
        limit: PAGE_SIZE,
      }
      : null,
  );

  const displayedItems = useMemo(() => {
    if (activeSort === "updated") {
      return [...page.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    if (activeSort === "name") {
      return [...page.items].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
    return page.items;
  }, [activeSort, page.items]);

  const resolvedPublisher = useMemo(() => {
    const fromItem = page.items[0]?.publisher;
    if (fromItem) return fromItem;
    if (parsedPublisher) {
      const fromFollowed = followedCreators.find((item) => item.id === parsedPublisher);
      if (fromFollowed) {
        return {
          id: fromFollowed.id,
          name: fromFollowed.name,
          avatar: fromFollowed.avatar,
        };
      }
      if (parsedPublisher === OFFICIAL_PUBLISHER_ID) {
        return {
          id: OFFICIAL_PUBLISHER_ID,
          name: "ToonStudio 공식",
          avatar: "#b4532a",
        };
      }
    }
    return {
      id: parsedPublisher ?? "",
      name: t("크리에이터 스토어", "Creator Storefront"),
      avatar: null,
    };
  }, [followedCreators, page.items, parsedPublisher, t]);

  const isOfficial = parsedPublisher === OFFICIAL_PUBLISHER_ID;
  const following = parsedPublisher ? isFollowingCreator(parsedPublisher) : false;

  useDocumentTitle(
    t(
      `${resolvedPublisher.name} · 배급자 스토어`,
      `${resolvedPublisher.name} · Creator Storefront`,
    ),
  );
  useMetaDescription(
    t(
      `${resolvedPublisher.name} 배급자가 공개한 웹툰 브러시·3D·템플릿·팔레트 패키지와 라이선스 조건을 한곳에서 확인하세요.`,
      `Browse webtoon brushes, 3D assets, templates, and palettes published by ${resolvedPublisher.name}.`,
    ),
  );

  const stats = useMemo(() => {
    let noAiCount = 0;
    let commercialCount = 0;
    const byKind = new Map<CreatorMarketplaceResourceKind, number>();
    for (const item of page.items) {
      if (!item.containsAi) noAiCount += 1;
      if (item.license !== "cc-by-nc-4.0") commercialCount += 1;
      byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
    }
    return {
      loadedCount: page.items.length,
      noAiCount,
      commercialCount,
      byKind,
    };
  }, [page.items]);

  function updateParam(
    mutator: (next: URLSearchParams) => void,
  ): void {
    const next = new URLSearchParams(searchParams);
    mutator(next);
    setSearchParams(next, { replace: true });
  }

  async function handleCopyStoreLink(): Promise<void> {
    if (typeof window === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard blocked in restricted contexts
    }
  }

  if (!parsedPublisher) {
    return (
      <Container size="wide" className="py-7 sm:py-10">
        <MarketNavHeader />
        <section className="mt-6 rounded-2xl border border-line bg-card p-8 text-center">
          <Store className="mx-auto size-10 text-fg-3" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-fg">
            {t("올바르지 않은 배급자 주소입니다", "Invalid publisher storefront URL")}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-2">
            {t(
              "배급자 식별자(UUID) 형식이 올바르지 않습니다. 전체 마켓 목록에서 작가나 배급자를 다시 선택해 주세요.",
              "The publisher identifier format is invalid. Please select a creator from the main browse catalog.",
            )}
          </p>
          <Link
            href="/market/browse"
            className={buttonClass({ variant: "solid", size: "md", className: "mt-5" })}
          >
            {t("전체 소재 둘러보기", "Browse all assets")}
          </Link>
        </section>
      </Container>
    );
  }

  return (
    <div>
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-7 sm:py-10">
          <MarketNavHeader />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/market/browse"
              className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-fg-2 hover:text-accent"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              {t("전체 마켓 목록으로 돌아가기", "Back to all market resources")}
            </Link>
            <span className="font-mono text-[0.68rem] text-fg-3">
              ID: {parsedPublisher.slice(0, 8)}…
            </span>
          </div>

          <div className="rounded-2xl border border-line bg-card/90 p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                {resolvedPublisher.avatar &&
                /^(?:https?:\/\/|\/|data:image\/)/iu.test(resolvedPublisher.avatar) ? (
                  <img
                    src={resolvedPublisher.avatar}
                    alt=""
                    className="size-14 shrink-0 rounded-2xl border border-line object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={
                      resolvedPublisher.avatar?.startsWith("#")
                        ? { backgroundColor: resolvedPublisher.avatar }
                        : undefined
                    }
                    className={cn(
                      "flex size-14 shrink-0 items-center justify-center rounded-2xl border text-lg font-black",
                      resolvedPublisher.avatar?.startsWith("#")
                        ? "border-line text-on-accent"
                        : "border-accent/30 bg-accent/10 text-accent",
                    )}
                  >
                    {resolvedPublisher.name.slice(0, 2).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="eyebrow text-accent">Creator Storefront</p>
                    {isOfficial ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[0.68rem] font-bold text-accent">
                        <BadgeCheck className="size-3.5" aria-hidden="true" />
                        {t("공식 스타터 배급자", "Official Starter Publisher")}
                      </span>
                    ) : null}
                  </div>
                  <h1 className="mt-1 text-2xl font-bold text-fg sm:text-3xl">
                    {resolvedPublisher.name}
                  </h1>
                  <p className="mt-1 text-xs leading-relaxed text-fg-2 sm:text-sm">
                    {t(
                      "서버 manifest로 검증된 이 배급자의 공개 패키지 카탈로그입니다. 허위 평점 없이 라이선스·AI 사용 공개·호환 엔진 정보를 투명하게 표시합니다.",
                      "Server-manifest-verified public catalog for this publisher, showing transparent license, AI disclosure, and engine compatibility.",
                    )}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={following}
                  onClick={() =>
                    toggleFollowCreator({
                      id: parsedPublisher,
                      name: resolvedPublisher.name,
                      avatar: resolvedPublisher.avatar,
                    })
                  }
                  className={buttonClass({
                    variant: following ? "solid" : "outline",
                    size: "sm",
                    className: "min-h-10 gap-1.5",
                  })}
                >
                  {following ? (
                    <UserCheck className="size-4" aria-hidden="true" />
                  ) : (
                    <UserPlus className="size-4" aria-hidden="true" />
                  )}
                  {following
                    ? t("팔로잉 중", "Following")
                    : t("배급자 팔로우", "Follow creator")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyStoreLink()}
                  className={buttonClass({
                    variant: "ghost",
                    size: "sm",
                    className: "min-h-10 gap-1.5",
                  })}
                >
                  {copiedLink ? (
                    <Check className="size-3.5 text-good" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3.5" aria-hidden="true" />
                  )}
                  {copiedLink
                    ? t("링크 복사됨", "Copied")
                    : t("스토어 링크 복사", "Copy link")}
                </button>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-2.5 border-t border-line pt-4 sm:grid-cols-4">
              <div className="rounded-xl border border-line bg-panel/60 px-3 py-2.5">
                <dt className="text-[0.68rem] font-semibold text-fg-3">
                  {t("현재 표시 릴리스", "Loaded releases")}
                </dt>
                <dd className="numeral tnum mt-0.5 text-base font-bold text-fg">
                  {stats.loadedCount}
                  {page.hasMore ? "+" : ""}
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-panel/60 px-3 py-2.5">
                <dt className="text-[0.68rem] font-semibold text-fg-3">
                  {t("상업 연재 가능 라이선스", "Commercial-ready")}
                </dt>
                <dd className="numeral tnum mt-0.5 text-base font-bold text-good">
                  {stats.commercialCount}
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-panel/60 px-3 py-2.5">
                <dt className="text-[0.68rem] font-semibold text-fg-3">
                  {t("AI 사용 미포함 공개", "Disclosed No-AI")}
                </dt>
                <dd className="numeral tnum mt-0.5 text-base font-bold text-fg">
                  {stats.noAiCount}
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-panel/60 px-3 py-2.5">
                <dt className="text-[0.68rem] font-semibold text-fg-3">
                  {t("제공 에셋 분야", "Resource kinds")}
                </dt>
                <dd className="mt-0.5 flex flex-wrap gap-1 text-xs font-semibold text-fg-2">
                  {stats.byKind.size === 0 ? (
                    <span className="text-fg-3">—</span>
                  ) : (
                    [...stats.byKind.entries()].slice(0, 3).map(([kind, count]) => (
                      <span
                        key={kind}
                        className="rounded bg-card px-1.5 py-0.5 text-[0.65rem] font-bold text-fg"
                      >
                        {marketKindMeta(kind).label} {count}
                      </span>
                    ))
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </Container>
      </section>

      <Container size="wide" className="py-6 sm:py-8">
        <div className="rounded-2xl border border-line bg-panel p-3.5 space-y-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <form
              className="relative flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                updateParam((next) => {
                  const trimmed = searchDraft.trim();
                  if (trimmed) next.set("q", trimmed);
                  else next.delete("q");
                });
              }}
            >
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                maxLength={CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS}
                aria-label={t("배급자 스토어 내 검색", "Search within creator storefront")}
                placeholder={t(
                  "이 배급자의 에셋 이름·태그·설명 검색…",
                  "Search this creator's assets by name, tag, or description…",
                )}
                className="h-10 w-full rounded-xl border border-line bg-card pl-9 pr-16 text-sm text-fg focus:border-accent focus:outline-none"
              />
              {searchDraft ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchDraft("");
                    updateParam((next) => next.delete("q"));
                  }}
                  aria-label={t("스토어 검색어 지우기", "Clear storefront search")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-fg-3 hover:text-fg"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={noAiOnly}
                onClick={() =>
                  updateParam((next) => {
                    if (noAiOnly) next.delete("containsAi");
                    else next.set("containsAi", "false");
                  })
                }
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                  noAiOnly
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:text-fg",
                )}
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                {t("AI 미포함만", "No-AI only")}
              </button>

              <button
                type="button"
                aria-pressed={commercialOnly}
                onClick={() =>
                  updateParam((next) => {
                    if (commercialOnly) next.delete("commercial");
                    else next.set("commercial", "true");
                  })
                }
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                  commercialOnly
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:text-fg",
                )}
              >
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                {t("상업 이용 허용", "Commercial OK")}
              </button>

              <select
                aria-label={t("스토어 정렬 기준", "Storefront sort order")}
                value={activeSort}
                onChange={(event) =>
                  updateParam((next) => {
                    const value = event.target.value;
                    if (value === "newest") next.delete("sort");
                    else next.set("sort", value);
                  })
                }
                className="h-9 rounded-xl border border-line bg-card px-2.5 text-xs font-semibold text-fg"
              >
                <option value="newest">{t("최신 등록순", "Newest")}</option>
                <option value="updated">{t("최근 업데이트순", "Recently updated")}</option>
                <option value="name">{t("이름순", "Name")}</option>
                {activeSearch ? (
                  <option value="relevance">{t("검색 관련도순", "Relevance")}</option>
                ) : null}
              </select>
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={t("리소스 종류 필터", "Resource kind filter")}
          >
            <button
              type="button"
              aria-pressed={activeKind === undefined}
              onClick={() => updateParam((next) => next.delete("kind"))}
              className={cn(
                "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
                activeKind === undefined
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg",
              )}
            >
              {t("전체 종류", "All kinds")}
            </button>
            {MARKET_KINDS.map((meta) => {
              const pressed = activeKind === meta.kind;
              return (
                <button
                  key={meta.kind}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() =>
                    updateParam((next) => {
                      if (pressed) next.delete("kind");
                      else next.set("kind", meta.kind);
                    })
                  }
                  className={cn(
                    "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
                    pressed
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg-2 hover:text-fg",
                  )}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {page.stale ? (
          <StaleNoticeBar
            savedAt={page.staleSavedAt ?? undefined}
            onRetry={page.reload}
            className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2"
          />
        ) : null}

        {page.loading ? (
          <div
            aria-hidden="true"
            className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-64 animate-pulse rounded-2xl border border-line bg-card"
              />
            ))}
          </div>
        ) : page.error ? (
          <div
            role="status"
            className="mt-6 rounded-2xl border border-warn/40 bg-warn/10 p-8 text-center"
          >
            <p className="text-sm font-bold text-fg">
              {t("배급자 카탈로그를 불러오지 못했습니다", "Could not load creator catalog")}
            </p>
            <p className="mt-1 text-sm text-fg-2">{page.error}</p>
            <button
              type="button"
              onClick={page.reload}
              className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 gap-1.5" })}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {t("다시 시도", "Try again")}
            </button>
          </div>
        ) : page.items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-line bg-panel p-10 text-center">
            <Store className="mx-auto size-9 text-fg-3" aria-hidden="true" />
            <p className="mt-3 text-sm font-bold text-fg">
              {t("조건에 맞는 공개 패키지가 없습니다", "No public packages match these filters")}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-fg-2">
              {t(
                "필터를 초기화하거나 전체 마켓 목록에서 다른 배급자 패키지를 탐색해 보세요.",
                "Reset storefront filters or explore other publishers in the main catalog.",
              )}
            </p>
            {(activeKind || activeSearch || noAiOnly || commercialOnly) ? (
              <button
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  setSearchParams(new URLSearchParams(), { replace: true });
                }}
                className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}
              >
                {t("스토어 필터 초기화", "Reset storefront filters")}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayedItems.map((record) => (
              <MarketResourceCard
                key={record.id}
                record={record}
                onQuickPreview={onQuickPreview ?? setQuickPreviewRecord}
              />
            ))}
          </div>
        )}

        {page.hasMore && !page.stale ? (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={page.loadMore}
              disabled={page.loadingMore}
              className={buttonClass({ variant: "outline", size: "md", className: "gap-1.5" })}
            >
              {page.loadingMore ? (
                <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {page.loadingMore
                ? t("불러오는 중", "Loading")
                : t("이 배급자의 에셋 더 보기", "Load more from this creator")}
            </button>
          </div>
        ) : null}

        <MarketRecentlyViewedStrip className="mt-8" />
      </Container>
      <MarketQuickPreviewDialog
        record={quickPreviewRecord}
        onClose={() => setQuickPreviewRecord(null)}
      />
    </div>
  );
}
