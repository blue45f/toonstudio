import {
  BriefcaseBusiness,
  ChevronDown,
  Loader2,
  Search,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import Link from "@/shared/navigation/router-link";
import {
  listWorks,
  searchCreatorDirectory,
  type CreatorDirectoryEntry,
  type CreatorDirectoryQuery,
  type WorkSummary,
} from "@/platform/creator-client";
import { buildCreatorProfileShowcase } from "./creator-profile-showcase";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { CoverImage } from "@/shared/components/cover-image";
import { LoadingState } from "@/shared/components/LoadingState";
import { SectionArt } from "@/shared/components/section-art";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { genreBorder, genreTextColor, genreTint, spectrumGradient } from "@/shared/lib/genre-color";
import { cn } from "@/shared/lib/utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n-core";
import {
  CREATOR_COLLABORATION_LABELS,
  CREATOR_ROLE_DEFINITIONS,
  CREATOR_SPECIALTY_DEFINITIONS,
  creatorRoleDefinition,
  creatorSpecialtyDefinition,
  creatorText,
  normalizeCreatorCollaborationStatus,
  normalizeCreatorSpecialtyId,
} from "@/shared/lib/creator-role-contract";

const PAGE_SIZE = 24;

type DirectoryFilters = Pick<
  CreatorDirectoryQuery,
  "q" | "role" | "specialty" | "collaborationStatus"
>;

const EMPTY_FILTERS: DirectoryFilters = {
  q: "",
  role: undefined,
  specialty: undefined,
  collaborationStatus: undefined,
};

function filterChipClass(active: boolean): string {
  return cn(
    "inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
    active
      ? "border-accent bg-accent text-on-accent"
      : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
  );
}

type CreatorCoverState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly featured: WorkSummary | null; readonly tags: readonly string[] };

/** 표지 이미지가 없을 때의 타이포그래픽 커버 — 대표작 제목(없으면 창작자 이름)의 첫 글자를 크게 얹는다. */
function CreatorTypographicGlyph({ glyph }: { readonly glyph: string }) {
  return (
    <span aria-hidden="true" className="absolute inset-0 block overflow-hidden">
      <span className="absolute -right-2 -top-7 select-none font-display text-[6.5rem] font-bold leading-none text-[oklch(0.97_0.01_85/0.32)] mix-blend-overlay">
        {glyph}
      </span>
    </span>
  );
}

/**
 * 카드 상단 16:9 아트 타일. 디렉터리 응답에는 작품 데이터가 없어 공개 작품 목록에서
 * 대표작(creator-profile-showcase)을 뽑아 표지를 얹는다. 표지가 없거나 불러오기에
 * 실패하면 장르 스펙트럼 위 타이포그래픽 커버로 떨어지며, 카드 자체는 깨지지 않는다.
 */
function CreatorCoverTile({ creator }: { readonly creator: CreatorDirectoryEntry }) {
  const [state, setState] = useState<CreatorCoverState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const works = await listWorks({ userId: creator.id }, controller.signal);
        if (!alive) return;
        const showcase = buildCreatorProfileShowcase(Array.isArray(works) ? works : [], 1);
        setState({ status: "ready", featured: showcase.featured[0] ?? null, tags: showcase.specialties });
      } catch {
        if (alive) setState({ status: "ready", featured: null, tags: [] });
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [creator.id]);

  const featured = state.status === "ready" ? state.featured : null;
  const tags = state.status === "ready" ? state.tags : [];
  const glyphSource = featured?.title || creator.name;
  const glyph = glyphSource.replace(/[^가-힣A-Za-z0-9]/g, "").charAt(0) || glyphSource.charAt(0);
  const showTitle = state.status === "ready" && featured !== null && !featured.cover;

  return (
    <div
      className="relative aspect-video w-full overflow-hidden"
      style={{ background: spectrumGradient(tags, 115) }}
    >
      {state.status === "loading" ? (
        <span aria-hidden="true" className="skeleton absolute inset-0 block" />
      ) : featured?.cover ? (
        <CoverImage
          src={featured.cover}
          alt=""
          className="absolute inset-0 size-full object-cover"
          fallback={<CreatorTypographicGlyph glyph={glyph} />}
        />
      ) : (
        <CreatorTypographicGlyph glyph={glyph} />
      )}
      {showTitle || tags.length > 0 ? (
        <div className="absolute inset-x-0 bottom-0">
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[oklch(0.15_0.02_265/0.6)] via-[oklch(0.15_0.02_265/0.22)] to-transparent"
          />
          <div className="relative flex flex-col gap-1.5 p-2">
            {showTitle ? (
              <p className="truncate text-xs font-bold text-white">{featured.title}</p>
            ) : null}
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border px-2 py-0.5 text-[0.65rem] font-bold"
                    style={{
                      color: genreTextColor(tag),
                      backgroundColor: genreTint(tag, 0.85),
                      borderColor: genreBorder(tag, 0.5),
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CreatorCard({ creator, locale }: { readonly creator: CreatorDirectoryEntry; readonly locale: string }) {
  const t = useBilingual("CreatorDirectoryPage");
  const profile = creator.creatorRoleProfile;
  const primary = creatorRoleDefinition(profile.primaryRole);
  const displayRole = primary ? creatorText(primary.label, locale) : t("창작자", "Creator");
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
      <CreatorCoverTile creator={creator} />
      <div className="flex min-w-0 flex-1 flex-col p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-base font-black text-white"
          style={{ backgroundColor: creator.avatar }}
          aria-hidden="true"
        >
          {creator.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-black text-fg">{creator.name}</h2>
          <p className="mt-1 text-xs font-bold text-accent">{displayRole}</p>
          {profile.collaborationStatus ? (
            <p className="mt-1 text-[0.68rem] text-fg-3">
              {creatorText(CREATOR_COLLABORATION_LABELS[profile.collaborationStatus], locale)}
            </p>
          ) : null}
        </div>
      </div>
      {creator.bio ? (
        <p className="mt-3 line-clamp-3 break-words text-xs leading-5 text-fg-2">{creator.bio}</p>
      ) : null}
      {profile.specialties.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {profile.specialties.slice(0, 5).map((specialty) => {
            const definition = creatorSpecialtyDefinition(specialty);
            return definition ? (
              <span key={specialty} className="rounded-full border border-line bg-panel px-2 py-1 text-[0.65rem] font-semibold text-fg-2">
                {creatorText(definition.label, locale)}
              </span>
            ) : null;
          })}
        </div>
      ) : null}
      <Link
        href={`/u/${encodeURIComponent(creator.id)}`}
        className={buttonClass({ variant: "quiet", size: "sm", className: "mt-auto w-full pt-4" })}
      >
        {t("프로필과 포트폴리오 보기", "View profile and portfolio")}
      </Link>
      </div>
    </article>
  );
}

/**
 * 본 조회(첫 페이지·조건 변경) 결과. 실패하면 이전 조건의 목록을 남기지 않는다 —
 * 다른 조건의 결과와 "공개 창작자 N명"이 새 조건의 결과처럼 보이는 것을 막는다.
 */
type DirectoryQueryState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly items: readonly CreatorDirectoryEntry[]; readonly nextOffset: number | null };

export function CreatorDirectoryPage() {
  const t = useBilingual("CreatorDirectoryPage");
  const lang = useI18n((state) => state.lang);
  const [draft, setDraft] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);
  // 모바일에서는 필터 폼을 접어 두고 토글로 펼친다. 데스크톱에서는 항상 펼쳐진다.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [result, setResult] = useState<DirectoryQueryState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  // "더 보기" 실패는 이미 받은 목록을 유지한 채 그 자리에서 다시 시도한다(본 조회 실패와 분리).
  const [moreError, setMoreError] = useState<string | null>(null);
  // 다시 시도 시 같은 조건으로 첫 페이지부터 재조회하도록 질의 식별자를 갱신합니다.
  const [retryNonce, setRetryNonce] = useState(0);
  // 조건이 바뀌면 진행 중인 "더 보기" 요청을 취소해 이전 조건의 다음 페이지가 붙지 않게 한다.
  const moreControllerRef = useRef<AbortController | null>(null);

  const query = useMemo<CreatorDirectoryQuery>(() => ({
    ...filters,
    q: filters.q?.trim() || undefined,
    limit: PAGE_SIZE,
    offset: 0,
  }), [filters]);

  useEffect(() => {
    const controller = new AbortController();
    moreControllerRef.current?.abort();
    moreControllerRef.current = null;
    setResult({ status: "loading" });
    setMoreError(null);
    setLoadingMore(false);
    searchCreatorDirectory(query, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setResult({ status: "ready", items: page.items, nextOffset: page.nextOffset });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          status: "error",
          message: cause instanceof Error ? cause.message : t("창작자 목록을 불러오지 못했습니다.", "Could not load the creator list."),
        });
      });
    return () => controller.abort();
  }, [query, retryNonce, t]);

  useEffect(() => () => moreControllerRef.current?.abort(), []);

  const loadMore = async () => {
    if (result.status !== "ready" || result.nextOffset === null || moreControllerRef.current) return;
    const controller = new AbortController();
    moreControllerRef.current = controller;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await searchCreatorDirectory({ ...query, offset: result.nextOffset }, controller.signal);
      if (controller.signal.aborted) return;
      setResult((current) => current.status === "ready"
        ? { status: "ready", items: [...current.items, ...page.items], nextOffset: page.nextOffset }
        : current);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setMoreError(cause instanceof Error ? cause.message : t("창작자를 더 불러오지 못했습니다.", "Could not load more creators."));
    } finally {
      if (moreControllerRef.current === controller) {
        moreControllerRef.current = null;
        setLoadingMore(false);
      }
    }
  };

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  };

  const activeDraftCount = [draft.q?.trim(), draft.role, draft.specialty, draft.collaborationStatus]
    .filter(Boolean).length;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-bg">
      <Container size="wide" className="py-8 sm:py-12">
        <SitePageHeader
          surface="plain"
          icon={UsersRound}
          eyebrow="CREATOR DIRECTORY"
          title={t("함께 만들 창작자 찾기", "Find creators to build with")}
          description={t("창작자가 공개하기로 선택한 직무, 전문 분야와 협업 상태만 검색합니다. 작업 모드와 프로젝트 내부 정보는 노출하지 않습니다.", "Searches only the roles, specialties, and collaboration status creators chose to make public. Work modes and internal project information are never exposed.")}
          aside={
            <SectionArt
              image="community"
              className="aspect-[16/10] w-full rounded-2xl border border-line object-cover"
            />
          }
          asideClassName="hidden md:block"
        />

        <section aria-label={t("창작자 찾기 조건", "Creator search filters")} className="sticky top-16 z-20 bg-bg pt-7">
        <form
          className="rounded-2xl border border-line bg-card p-4 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters(draft);
          }}
        >
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:hidden"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={15} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="flex-1 text-sm font-black text-fg">{t("검색 조건", "Search filters")}</span>
            {activeDraftCount > 0 ? (
              <span className="inline-flex min-h-6 items-center rounded-full bg-accent px-2 text-[0.68rem] font-black text-on-accent">
                {activeDraftCount}
              </span>
            ) : null}
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={cn("shrink-0 text-fg-3 transition-transform", filtersOpen && "rotate-180")}
            />
          </button>
          <div className={cn(!filtersOpen && "hidden", "sm:block")}>
          <div className="mt-3 grid gap-3 sm:mt-0 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_auto]">
            <label className="text-xs font-bold text-fg">
              {t("이름·소개", "Name / bio")}
              <span className="mt-1.5 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 focus-within:border-accent">
                <Search size={14} className="text-fg-3" aria-hidden="true" />
                <input
                  value={draft.q ?? ""}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, q: value }));
                  }}
                  maxLength={60}
                  placeholder={t("이름 또는 소개 검색", "Search names or bios")}
                  className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none"
                />
              </span>
            </label>
            <label className="text-xs font-bold text-fg">
              {t("전문 분야", "Specialty")}
              <select
                value={draft.specialty ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDraft((current) => ({ ...current, specialty: normalizeCreatorSpecialtyId(value) ?? undefined }));
                }}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="">{t("전체 전문 분야", "All specialties")}</option>
                {CREATOR_SPECIALTY_DEFINITIONS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {creatorText(entry.label, lang)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-fg">
              {t("협업 상태", "Collaboration status")}
              <select
                value={draft.collaborationStatus ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDraft((current) => ({ ...current, collaborationStatus: normalizeCreatorCollaborationStatus(value) ?? undefined }));
                }}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="">{t("전체 상태", "All statuses")}</option>
                {Object.entries(CREATOR_COLLABORATION_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{creatorText(label, lang)}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className={buttonClass({ className: "self-end gap-2" })}
            >
              <Search size={15} aria-hidden="true" />
              {t("검색", "Search")}
            </button>
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <span className="text-xs font-bold text-fg">{t("직무", "Role")}</span>
            <div role="group" aria-label={t("직무", "Role")} className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={!draft.role}
                onClick={() => setDraft((current) => ({ ...current, role: undefined }))}
                className={filterChipClass(!draft.role)}
              >
                {t("전체 직무", "All roles")}
              </button>
              {CREATOR_ROLE_DEFINITIONS.map((entry) => {
                const active = draft.role === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDraft((current) => ({ ...current, role: active ? undefined : entry.id }))}
                    className={filterChipClass(active)}
                  >
                    {creatorText(entry.label, lang)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <p className="flex items-center gap-1.5 text-[0.68rem] leading-5 text-fg-3">
              <Sparkles size={13} aria-hidden="true" />
              {t("공개 동의한 정보만 검색 결과와 프로필에 표시됩니다.", "Only information creators consented to make public is shown in results and profiles.")}
            </p>
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 text-xs font-bold text-fg-2 hover:bg-raised hover:text-fg"
              onClick={resetFilters}
            >
              {t("검색 조건 초기화", "Clear filters")}
            </button>
          </div>
          </div>
        </form>
        </section>

        {result.status === "loading" ? (
          <LoadingState
            variant="cards"
            cardCount={6}
            label={t("창작자 목록을 불러오는 중", "Loading the creator list")}
            className="mt-6"
          />
        ) : result.status === "error" ? (
          // 본 조회 실패는 빈 결과("조건에 맞는 창작자 없음")·이전 조건의 목록과 구분해 결과 자리에서 첫 페이지부터 다시 시도한다.
          <ErrorState
            className="mt-6 p-8"
            title={t("창작자 목록을 불러오지 못했습니다.", "Could not load the creator list.")}
            message={result.message}
            onRetry={() => setRetryNonce((current) => current + 1)}
          />
        ) : result.items.length === 0 ? (
          <ActionableEmptyState
            art="search"
            icon={BriefcaseBusiness}
            className="mt-6"
            title={t("조건에 맞는 공개 창작자가 없습니다", "No public creators match these filters")}
            description={t("다른 직무나 전문 분야를 선택하거나 검색어를 줄여 보세요. 찾는 사람이 없다면 협업 게시판에 함께 만들 사람을 구하는 글을 올려 볼 수도 있습니다.", "Try a different role or specialty, or shorten your search term. If the right person is not listed yet, you can also post a collaboration call on the board.")}
            primary={{ href: "/collaborate", label: t("협업 게시판에 글 올리기", "Post on the collaboration board") }}
          >
            <button
              type="button"
              className={buttonClass({ variant: "quiet", className: "min-h-11" })}
              onClick={resetFilters}
            >
              {t("검색 조건 초기화", "Clear filters")}
            </button>
          </ActionableEmptyState>
        ) : (
          <section aria-label={t("검색 결과", "Search results")}>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-black text-fg">{t(`공개 창작자 ${result.items.length}명`, `Public creators: ${result.items.length}`)}</h2>
              <p className="text-xs text-fg-3">{t("최신 가입 순 · 공개 프로필 기준", "Newest first · public profiles only")}</p>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {result.items.map((creator) => (
                <CreatorCard key={creator.id} creator={creator} locale={lang} />
              ))}
            </div>
            {moreError ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3" role="alert">
                <p className="text-sm font-semibold text-bad">{moreError}</p>
                <button type="button" className={buttonClass({ variant: "quiet", size: "sm" })} onClick={() => void loadMore()}>
                  {t("다시 시도", "Try again")}
                </button>
              </div>
            ) : null}
            {result.nextOffset !== null && !moreError ? (
              <div className="mt-7 flex justify-center">
                <button
                  type="button"
                  className={buttonClass({ variant: "quiet", className: "gap-2" })}
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                  {t("더 보기", "Load more")}
                </button>
              </div>
            ) : null}
          </section>
        )}
      </Container>
    </div>
  );
}
