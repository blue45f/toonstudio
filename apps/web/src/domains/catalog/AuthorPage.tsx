import { catalogStatusText } from "./catalog-status-i18n";
import { filterTitlesByLocalQuery, useLocalCatalogFallback } from "./local-catalog-fallback";
import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { lazy, Suspense, useMemo, useState } from "react";
import { SITE_URL } from "@toonstudio/core/business";
import { PenLine, Search, X } from "lucide-react";
import { useParams } from "react-router-dom";


import type { Title } from "@/shared/lib/types";

import { FanCafePanel } from "@/domains/community/public/fan-cafe-panel";
import { NewsletterSubscribeButton } from "@/domains/newsletter/public/newsletter-subscribe-button";
import { AuthorNoticeSection } from "@/domains/author-notices/public/author-notices";
import { Container } from "@/shared/components/section";
import { TitleCard } from "@/shared/components/title-card";
import { GenreChip } from "@/shared/components/ui/chip";
import { Stars } from "@/shared/components/ui/stars";
import { compactPublicShareDescription } from "@/shared/lib/public-share-policy";
import { formatCount } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { NotFoundPage } from "@/shared/components/feedback/NotFoundPage";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  useMetaRobots,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";
import { useApiResource } from "@/platform/use-api-resource";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";

const SharePageButton = lazy(async () => {
  const module = await import("@/shared/components/share-page-button");
  return { default: module.SharePageButton };
});

interface AuthorResponse {
  author: string;
  works: Title[];
  totalViews: number;
  avg: number;
  genres: string[];
  generatedAt: string;
  source: string;
}

const AUTHOR_WORKS_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5";

export function AuthorPage() {
  const { name } = useParams();
  const authorParam = name ?? "";
  // useParams already decodes the segment; decoding again corrupts literal % names.
  const decodedAuthor = authorParam;
  const authorApiPath = authorParam ? `/api/authors/${encodeURIComponent(decodedAuthor)}` : null;
  const apiState = useApiResource<AuthorResponse>(
    authorApiPath,
    catalogStatusText("catalog.status.author.loadFailed", "작가 데이터를 불러오지 못했습니다."),
  );
  const { data, loading, error, notFound, reload } = useLocalCatalogFallback(authorApiPath, apiState);
  const [workQuery, setWorkQuery] = useState("");

  const rawAuthor = data?.author as string | { readonly name?: string } | undefined;
  const author =
    typeof rawAuthor === "string" && rawAuthor.trim()
      ? rawAuthor
      : typeof rawAuthor === "object" && rawAuthor !== null && typeof rawAuthor.name === "string" && rawAuthor.name.trim()
        ? rawAuthor.name
        : decodedAuthor;
  const works = useMemo(() => data?.works ?? [], [data?.works]);
  const filteredWorks = useMemo(
    () => filterTitlesByLocalQuery(works, workQuery),
    [works, workQuery],
  );
  const totalViews = typeof data?.totalViews === "number" && Number.isFinite(data.totalViews) ? data.totalViews : 0;
  const avg = typeof data?.avg === "number" && Number.isFinite(data.avg) ? data.avg : 0;
  const genres = Array.isArray(data?.genres) ? data.genres : [];

  const sharePath = authorParam ? `/author/${encodeURIComponent(decodedAuthor)}` : "/authors";
  const shareDescription = compactPublicShareDescription(
    data
      ? `${author} 작가의 작품 ${works.length}편${genres.length ? ` · ${genres.slice(0, 3).join("·")}` : ""}`
      : null,
    `${author} 작가의 작품과 장르별 활동을 한눈에 확인해 보세요.`,
  );

  useDocumentTitle(author || "작가");
  useMetaDescription(data ? `${shareDescription} — 툰스튜디오에서 작가별로 모아 봅니다.` : null);
  usePageSocialMeta({
    canonicalPath: sharePath,
    title: `${author} 작가`,
    description: shareDescription,
    type: "website",
  });
  const canonicalUrl = `${SITE_URL}${sharePath}`;
  const missingAuthor = notFound || (!loading && !error && authorParam && data === null);
  useMetaRobots(missingAuthor ? NOINDEX_PRIVATE_ROBOTS : null);
  useJsonLd(data ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${canonicalUrl}#profile`,
        url: canonicalUrl,
        name: `${author} 작가`,
        description: shareDescription,
        mainEntity: {
          "@type": "Person",
          "@id": `${canonicalUrl}#person`,
          name: author,
          url: canonicalUrl,
          knowsAbout: genres,
        },
        hasPart: works.slice(0, 20).map((work) => ({
          "@type": work.type === "webtoon" ? "ComicSeries" : "CreativeWorkSeries",
          name: work.title,
          url: `${SITE_URL}/title/${encodeURIComponent(work.slug)}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "작가", item: `${SITE_URL}/authors` },
          { "@type": "ListItem", position: 2, name: author, item: canonicalUrl },
        ],
      },
    ],
  } : null);

  if (missingAuthor) return <NotFoundPage />;

  return (
    <Container size="wide" className="py-6 sm:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <PenLine size={13} /> {translateCurrentStaticSourceText("domains.catalog.AuthorPage", "en", "AUTHOR")}<Link
              href="/authors"
              className="ml-1.5 normal-case tracking-normal text-fg-3 transition-colors hover:text-accent"
            >
              {translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "· 전체 작가 보기")}</Link>
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-4xl">{author}</h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {genres.map((genre) => (
              <GenreChip key={genre} genre={genre} size="sm" />
            ))}
          </div>
          {!loading && !error && data && (
            <Suspense fallback={null}>
              <SharePageButton
                path={sharePath}
                text={`${author} 작가`}
                description={shareDescription}
                label="작가 페이지 공유"
                actionLabel="작가 작품 보기"
                className="mt-4"
              />
            </Suspense>
          )}
          {!loading && !error && data && (
            <div className="mt-4 max-w-sm">
              <NewsletterSubscribeButton authorName={author} />
            </div>
          )}
        </div>
        <dl className="flex flex-wrap items-center gap-6">
          <div>
            <dt className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "참여작")}</dt>
            <dd className="numeral text-2xl text-fg">{works.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "평균 별점")}</dt>
            <dd className="flex items-center gap-1.5">
              <span className="numeral text-2xl text-fg">{avg.toFixed(1)}</span>
              <Stars value={avg} size="sm" />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "누적 조회")}</dt>
            <dd className="numeral text-2xl text-fg">{formatCount(totalViews)}</dd>
          </div>
        </dl>
      </header>

      <AuthorNoticeSection authorName={author} className="mb-8" />

      <section aria-labelledby="author-works-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="author-works-title" className="text-xl font-bold tracking-tight text-fg">
            {translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "작품 목록")}
            {!loading && !error && works.length > 0 ? <span className="numeral ml-2 text-base font-semibold text-fg-3">{filteredWorks.length}</span> : null}
          </h2>
          {!loading && !error && works.length > 4 ? (
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2 focus-within:border-accent/55">
              <Search size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
              <span className="sr-only">작가 작품 내 검색</span>
              <input
                type="search"
                value={workQuery}
                onChange={(event) => setWorkQuery(event.target.value)}
                placeholder="참여작 제목·장르·태그 검색"
                className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-3"
              />
              {workQuery ? (
                <button
                  type="button"
                  onClick={() => setWorkQuery("")}
                  aria-label="참여작 검색 지우기"
                  className="grid size-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-panel hover:text-fg"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              ) : null}
            </label>
          ) : null}
        </div>
        <div className="mt-4">
          {loading ? (
            <div className={AUTHOR_WORKS_GRID}>
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="space-y-2.5">
                  <span className="skeleton block aspect-[3/4] rounded-xl" />
                  <span className="skeleton block h-4 w-3/4" />
                  <span className="skeleton block h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorState title={translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "작가 데이터를 불러오지 못했습니다.")} message={error} onRetry={reload} />
          ) : works.length === 0 ? (
            <ActionableEmptyState
              icon={PenLine}
              title={translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "등록된 작품이 아직 없습니다")}
              description={translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "이 작가의 공개 작품이 등록되면 여기에 표시됩니다. 다른 작가의 작품을 둘러보세요.")}
              primary={{ href: "/authors", label: translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "다른 작가 둘러보기") }}
              secondary={{ href: "/explore", label: translateCurrentStaticSourceText("domains.catalog.AuthorPage", "ko", "작품 탐색하기") }}
              art="library"
            />
          ) : filteredWorks.length === 0 ? (
            <div
              role="status"
              data-testid="author-works-search-empty"
              className="rounded-2xl border border-dashed border-line bg-card/50 p-8 text-center"
            >
              <p className="text-sm font-semibold text-fg">
                “{workQuery.trim()}” 조건에 맞는 참여작이 없습니다.
              </p>
              <p className="mt-1 text-xs text-fg-3">
                다른 키워드로 검색하거나 검색어를 초기화해 전체 참여작을 확인해 보세요.
              </p>
              <button
                type="button"
                onClick={() => setWorkQuery("")}
                className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 text-xs font-bold text-accent hover:border-accent/50"
              >
                참여작 검색 초기화
              </button>
            </div>
          ) : (
            <div className={AUTHOR_WORKS_GRID}>
              {filteredWorks.map((title) => (
                <TitleCard key={title.id} title={title} />
              ))}
            </div>
          )}
        </div>
      </section>

      {!loading && !error && works.length > 0 && (
        <div className="mt-10">
          <FanCafePanel scope="author" targetId={author} targetLabel={author} compact />
        </div>
      )}
    </Container>
  );
}
