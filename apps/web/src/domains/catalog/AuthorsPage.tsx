import { catalogStatusText } from "./catalog-status-i18n";
import { useLocalCatalogFallback } from "./local-catalog-fallback";
import { PenLine, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { CoverImage } from "@/shared/components/cover-image";
import { Container } from "@/shared/components/section";
import { SectionArt } from "@/shared/components/section-art";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { genreTint, genreBorder, genreTextColor } from "@/shared/lib/genre-color";
import { useI18n, useT } from "@/shared/lib/i18n";
import { formatCount } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { EmptyTeach } from "@/shared/components/library-view-empty";
import { useApiResource } from "@/platform/use-api-resource";

interface AuthorEntry {
  name: string;
  workCount: number;
  totalViews: number;
  avgRating: number;
  topGenres: string[];
  types: ("webtoon" | "webnovel")[];
  cover: [string, string];
  coverImage?: string;
}
interface AuthorsResponse {
  total: number;
  authors: AuthorEntry[];
}

const INITIAL_AUTHORS_VISIBLE = 120;
const AUTHORS_VISIBLE_STEP = 120;

export function AuthorsPage() {
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const fallbackName = t("authors.noName");
  const apiState = useApiResource<AuthorsResponse>(
    "/api/authors",
    t("authors.error"),
  );
  const { data, loading, error, reload } = useLocalCatalogFallback("/api/authors", apiState);
  const [q, setQ] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_AUTHORS_VISIBLE);
  const authors = data?.authors ?? [];
  const query = q.trim().normalize("NFC").toLowerCase();
  const filtered = query
    ? authors.filter((a) => {
        const nameMatch = (a.name ?? "").normalize("NFC").toLowerCase().includes(query);
        const genreMatch = (a.topGenres ?? []).some((g) => g.normalize("NFC").toLowerCase().includes(query));
        return nameMatch || genreMatch;
      })
    : authors;
  const visible = filtered.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(INITIAL_AUTHORS_VISIBLE);
  }, [query]);

  const formatNumber = (value: number) => new Intl.NumberFormat(lang).format(value);
  const authorStats =
    data &&
    t("authors.stats")
      .replace("{total}", formatNumber(data.total))
      .replace("{shown}", formatNumber(authors.length));

  return (
    <Container size="wide" className="py-6 sm:py-8">
      <SiteContextualSubNav pathnameOverride="/authors" className="mb-4" />
      <header className="mb-6 grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <PenLine size={14} /> {t("authors.eyebrow")}
          <Link
            href="/community/author"
            className="ml-1.5 normal-case tracking-normal text-fg-3 transition-colors hover:text-accent"
          >
            · {t("authors.pencafe")}
          </Link>
        </p>
        <h1 id="authors-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-4xl">{t("authors.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
          {t("authors.desc")}
          {authorStats ? <span className="text-fg-3">{` · ${authorStats}`}</span> : null}
        </p>
        {!loading && !error && authors.length > 0 && (
          <div role="search" className="mt-4 flex min-h-11 max-w-sm items-center gap-2 rounded-xl border border-line-strong bg-card px-3.5 transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
            <Search size={15} className="shrink-0 text-fg-3" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("authors.search")}
              aria-label={t("authors.search")}
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="작가 검색어 지우기"
                className="grid size-8 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-panel hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        )}
        </div>
        <SectionArt
          image="community"
          className="hidden aspect-[16/10] w-full rounded-3xl border border-line object-cover lg:block"
        />
      </header>

      <section aria-labelledby="authors-title">
      {error ? (
        <ErrorState title={t("authors.error")} message={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="skeleton h-[88px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyTeach
          icon={Search}
          title={query ? catalogStatusText("catalog.status.authors.searchEmpty", { query: q.trim() }, "“{query}” 작가를 찾지 못했어요") : catalogStatusText("catalog.status.authors.empty", "등록된 작가가 없어요")}
          desc={
            query
              ? "이름 철자를 확인하거나 더 짧은 키워드로 위 검색창에서 다시 찾아보세요."
              : "카탈로그에 작가 정보가 모이면 여기에 표시됩니다."
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((a) => {
              const initial = (a.name ?? "").replace(/[^가-힣A-Za-z0-9]/g, "").charAt(0) || "?";
              return (
                <Link
                  key={a.name}
                  href={`/author/${encodeURIComponent(a.name)}`}
                  className="group flex items-center gap-3.5 rounded-xl border border-line bg-card/40 p-3 transition-colors hover:border-line-strong hover:bg-raised"
                >
                  <div
                    className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line/60 font-display text-lg font-bold text-white/90"
                    style={{ background: `linear-gradient(145deg, ${a.cover[0]}, ${a.cover[1]})` }}
                  >
                    {a.coverImage ? (
                      <CoverImage
                        src={a.coverImage}
                        alt=""
                        className="absolute inset-0 size-full object-cover"
                        fallback={<span data-testid="author-avatar-fallback">{initial}</span>}
                      />
                    ) : (
                      <span data-testid="author-avatar-fallback">{initial}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold text-fg group-hover:text-accent">{a.name ?? fallbackName}</h2>
                    <p className="mt-0.5 truncate text-xs text-fg-3">
                      {formatNumber(a.workCount)}
                      {t("authors.works")}
                      {" · "}
                      {formatCount(a.totalViews)}
                      {" "}
                      {t("authors.views")}
                      {a.avgRating > 0 && <> · ★{a.avgRating.toFixed(1)}</>}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {a.topGenres.slice(0, 3).map((g) => (
                        <span
                          key={g}
                          className="rounded-full border px-1.5 py-0.5 text-xs font-medium leading-none"
                          style={{ color: genreTextColor(g, 0.85), backgroundColor: genreTint(g, 0.12), borderColor: genreBorder(g, 0.3) }}
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {visible.length < filtered.length ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + AUTHORS_VISIBLE_STEP)}
                className="min-h-11 rounded-xl border border-line-strong bg-card px-5 text-sm font-bold text-fg-2 hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                다음 {Math.min(AUTHORS_VISIBLE_STEP, filtered.length - visible.length).toLocaleString("ko-KR")}명 작가 더 보기
              </button>
            </div>
          ) : null}
        </>
      )}
      </section>
    </Container>
  );
}
