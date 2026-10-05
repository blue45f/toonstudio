import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { ProviderStatus } from "./ProviderStatus";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { WeatherLightBoard } from "./WeatherLightBoard";
import { downloadText, useCreatorWorkspace } from "./workspace";

import { TypographicCover } from "@/shared/components/typographic-cover";

import type { CreatorResource, ResourceSearchResult } from "@/shared/lib/creator-resources";

import { attributionMarkdown, deadlineCalendar, deadlineLabel, parseSearchResult, RESOURCE_LABELS } from "@/shared/lib/creator-resources";
import { apiFetch, apiPath } from "@/platform/api";

import { RESOURCE_SEARCH_CONFIG } from "./resource-search-config";

import type { ResourceSearchProvider } from "./resource-search-config";

import { PolyHavenCategoryGuide } from "./PolyHavenCategoryGuide";
import { polyHavenCardDecoration } from "./polyhaven-resource";
import { resourceUsageDescription, resourceUsageLabel } from "./resource-usage";
import { useWikimediaDefaultDashboard } from "./use-wikimedia-default-dashboard";
import {
  WikimediaDashboardSkeleton,
  WikimediaInterestDashboard,
} from "./WikimediaInterestDashboard";
function GoogleFontPreview({ family }: { family: string }) {
  const safeFamily = family.replace(/["'\\]/gu, "");
  useEffect(() => {
    if (!safeFamily) return;
    const id = `toonstudio-google-font-${safeFamily.toLocaleLowerCase("en").replace(/[^a-z0-9]+/gu, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(safeFamily).replace(/%20/gu, "+")}&display=swap`;
    document.head.append(link);
  }, [safeFamily]);
  return <div className="flex h-full flex-col justify-center bg-raised px-5 py-6" aria-label={`${family} 글꼴 미리보기`}>
    <p className="break-words text-2xl leading-relaxed text-fg" style={{ fontFamily: `"${safeFamily}", sans-serif` }}>가나다라마바사 ABC 123</p>
    <p className="mt-2 text-xs text-fg-3">실제 브라우저 렌더링 · 문구와 글리프 지원은 상세 페이지 확인</p>
  </div>;
}

export function ResourceCard({ item, saved, onToggle, disabled, kindLabel, wideTile }: { item: CreatorResource; saved: boolean; onToggle: () => void; disabled: boolean; kindLabel?: string | null; wideTile?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.imageUrl) && !imageFailed;
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
    {/* 아트 타일 — 이미지는 풀블리드로 채우고, 없거나 불러오지 못하면 타이포그래픽 커버가 자리를 지킨다.
        제공처·이용조건은 법적 고지라 지우지 않고 타일 아래 배지로 압축한다.
        kindLabel·wideTile은 종류 구분이 있는 제공처 표면(Poly Haven)만 넘긴다 — 종류 배지는
        좌상단에 고정하고, HDRI 타일은 2:1 파노라마 비율을 쓴다. */}
    <div className={`relative w-full overflow-hidden bg-raised ${wideTile ? "aspect-[2/1]" : "aspect-[4/3]"}`}>
      {item.provider === "googlefonts" ? <GoogleFontPreview family={item.title} />
        : showImage ? <img src={item.imageUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
        : <TypographicCover title={item.title} seed={item.id} className="absolute inset-0" />}
      {kindLabel && <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">{kindLabel}</span>}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-1.5 bg-gradient-to-t from-black/55 via-black/25 to-transparent p-3 pt-8">
        <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">{RESOURCE_LABELS[item.provider]}</span>
        <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm">{resourceUsageLabel(item)}</span>
      </div>
    </div>
    <div className="flex flex-1 flex-col space-y-3 p-5">
      <h3 className="break-words text-lg font-bold">{item.title}</h3>
      <p className="text-sm text-fg-2">{item.creator || "저작자·기관 원문 확인"}{item.dateLabel ? ` · ${item.dateLabel}` : ""}</p>
      {item.description && <p className="break-words text-sm leading-6 text-fg-2">{item.description}</p>}
      {item.provider === "bizinfo" && <div className="rounded-lg bg-raised p-3 text-sm leading-6"><p className="font-semibold">{deadlineLabel(item.deadline)}</p><p>신청 대상: {item.eligibility}</p></div>}
      {item.isbn && <p className="text-xs text-fg-2">ISBN: {item.isbn}</p>}
      <details className="text-xs leading-6 text-fg-2"><summary className="cursor-pointer py-2">출처·이용조건·조회일</summary>
        <p>{item.credit || "크레딧 원문 확인"}</p><p>{resourceUsageDescription(item)}</p>
        {item.licenseUrl && <a className="underline" href={item.licenseUrl} target="_blank" rel="noopener noreferrer">이용조건 확인 ↗</a>}
        <p>조회: {item.fetchedAt}</p>
      </details>
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <a href={item.sourceUrl} className={RESOURCE_BUTTON} target="_blank" rel="noopener noreferrer">원문 확인 ↗</a>
        <button className={RESOURCE_BUTTON} aria-pressed={saved} disabled={disabled} onClick={onToggle}>{saved ? "저장 해제" : "보드에 저장"}</button>
        {item.provider === "bizinfo" && item.deadline && <button className={RESOURCE_BUTTON} onClick={() => downloadText("opportunity-deadline.ics", deadlineCalendar(item), "text/calendar;charset=utf-8")}>마감일 일정 파일</button>}
      </div>
    </div>
  </article>;
}
/** 빈 상태 키 비주얼 — 검색 일러스트(장식용). */
function EmptySearchArt() {
  return (
    <img
      src="/images/empty-search.webp"
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className="mb-3 h-32 w-full max-w-sm rounded-2xl border border-line/60 object-cover"
    />
  );
}

type CurationState =
  | { phase: "loading" }
  | { phase: "ready"; items: CreatorResource[] }
  | { phase: "unavailable" };

/**
 * 검색 전 큐레이션 — 제공처 대표 검색어로 실제 검색 API를 한 번 호출해, 돌아온 실제 자료로만
 * 타일을 만든다. 위장 방지가 계약이다: API 미설정·실패·이미지 부족이면 타일을 만들지 않고
 * "unavailable"로 떨어져 정직한 빈 상태 구성이 대신한다. featured가 없는 제공처
 * (음악 메타데이터·날씨·학교·사전·조회 신호·지원사업)는 시안 지시대로 타일 자체를 시도하지 않는다.
 */
function useResourceCuration(provider: ResourceSearchProvider): CurationState {
  const featured = RESOURCE_SEARCH_CONFIG[provider].featured;
  const [state, setState] = useState<CurationState>({ phase: "loading" });
  useEffect(() => {
    if (!featured) { setState({ phase: "unavailable" }); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 30000);
    let disposed = false;
    setState({ phase: "loading" });
    const search = new URLSearchParams({ provider, q: featured.query, page: "1" });
    void apiFetch(apiPath(`/api/creator-resources/search?${search}`), { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("curation_unavailable");
        const parsed = parseSearchResult(await response.json());
        if (!parsed || parsed.provider !== provider || (parsed.status !== "ready" && parsed.status !== "partial")) throw new Error("curation_unavailable");
        const items = (featured.kind === "font" ? parsed.items : parsed.items.filter((item) => item.imageUrl)).slice(0, 8);
        if (!disposed) setState(items.length >= 3 ? { phase: "ready", items } : { phase: "unavailable" });
      })
      .catch(() => { if (!disposed) setState({ phase: "unavailable" }); })
      .finally(() => { window.clearTimeout(timeout); });
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [provider, featured]);
  return state;
}

function CurationTile({ item, provider, query, onRunSearch }: { item: CreatorResource; provider: ResourceSearchProvider; query: string; onRunSearch: (q: string) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.imageUrl) && !imageFailed;
  return (
    <button type="button" onClick={() => onRunSearch(query)} aria-label={`${item.title} — '${query}' 검색 결과 보기`}
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left transition hover:border-accent/50">
      <span className="relative block aspect-[4/3] w-full overflow-hidden bg-raised">
        {item.provider === "googlefonts" ? <GoogleFontPreview family={item.title} />
          : showImage ? <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
          : <TypographicCover title={item.title} seed={item.id} className="absolute inset-0" />}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-1.5 bg-gradient-to-t from-black/55 via-black/25 to-transparent p-3 pt-8">
          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">{RESOURCE_LABELS[provider]}</span>
          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm">{resourceUsageLabel(item)}</span>
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1 p-4">
        <span className="break-words text-sm font-bold leading-5">{item.title}</span>
        <span className="break-words text-xs text-fg-2">{item.creator || "저작자·기관 원문 확인"}{item.dateLabel ? ` · ${item.dateLabel}` : ""}</span>
      </span>
    </button>
  );
}

/**
 * 검색 전 정직한 빈 상태 — 일러스트 + 안내 + 추천 키워드(다음 행동).
 * apiNote는 "검색할 때만 API를 호출한다"는 안내를 붙일 때만 true다. 큐레이션·
 * 카테고리 확인을 이미 시도한 표면(Poly Haven 카테고리 가이드)은 false로 둔다.
 */
export function ResourcePreSearchFallback({ provider, onRunSearch, apiNote }: { provider: ResourceSearchProvider; onRunSearch: (q: string) => void; apiNote: boolean }) {
  const config = RESOURCE_SEARCH_CONFIG[provider];
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <EmptySearchArt />
      <p>검색어를 입력하거나 아래 추천 키워드로 바로 검색해 보세요.</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {config.examples.map((value) => <button key={value} type="button" className={RESOURCE_BUTTON} onClick={() => onRunSearch(value)}>{value}</button>)}
      </div>
      {apiNote && <p className="mt-3 text-xs text-fg-3">외부 API는 검색할 때만 호출합니다.</p>}
    </div>
  );
}

/**
 * 검색 전 구성 (공통) — 큐레이션을 쓸 수 있으면 대표 아트 타일 + 다음 행동을,
 * 쓸 수 없으면 일러스트 + 안내 + 추천 키워드(다음 행동)로 정직하게 구성한다.
 */
function PreSearchGuide({ provider, onRunSearch }: { provider: ResourceSearchProvider; onRunSearch: (q: string) => void }) {
  const config = RESOURCE_SEARCH_CONFIG[provider];
  const featured = config.featured;
  const curation = useResourceCuration(provider);
  if (featured && curation.phase === "loading") {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="aspect-[4/3] w-full animate-pulse bg-raised [motion-reduce:animate-none]" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-raised [motion-reduce:animate-none]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-raised [motion-reduce:animate-none]" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (featured && curation.phase === "ready") {
    return (
      <section aria-label="검색 전 대표 자료" className="space-y-3 py-2 text-left">
        <div>
          <h3 className="text-base font-bold">검색 전에 둘러보기</h3>
          <p className="mt-1 text-sm leading-6 text-fg-2">‘{featured.query}’ 검색으로 확인한 {RESOURCE_LABELS[provider]} 대표 자료입니다. 타일을 누르면 같은 검색을 바로 실행합니다.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {curation.items.map((item) => <CurationTile key={item.id} item={item} provider={provider} query={featured.query} onRunSearch={onRunSearch} />)}
        </div>
      </section>
    );
  }
  return <ResourcePreSearchFallback provider={provider} onRunSearch={onRunSearch} apiNote={!featured} />;
}
/** 결과 카드 장식 — 종류 배지·타일 비율처럼 제공처 표면 전용 표현을 카드에 넘기는 통로. */
export interface ResourceCardDecoration {
  kindLabel?: string | null;
  wideTile?: boolean;
}

/**
 * 검색 전 wikimedia 구성 (S4-09) — 기본 주제의 실제 조회 추이가 닿으면 대시보드를
 * 페이지 주인공으로 세우고, 닿지 않으면(API 미설정·실패·시계열 없음) 공통의
 * 정직한 빈 상태(일러스트+추천 키워드)로 떨어진다. 타일을 강제하지 않는 제공처라
 * PreSearchGuide의 featured 경로는 타지 않는다.
 */
function WikimediaPreSearch({ isSaved, onToggleItem, saveDisabled, onRunSearch }: {
  isSaved: (itemId: string) => boolean;
  onToggleItem: (item: CreatorResource) => void;
  saveDisabled: boolean;
  onRunSearch: (q: string) => void;
}) {
  const topic = RESOURCE_SEARCH_CONFIG.wikimedia.examples[0];
  const state = useWikimediaDefaultDashboard();
  if (state.phase === "loading") return <WikimediaDashboardSkeleton />;
  if (state.phase === "ready") {
    return (
      <section aria-label="기본 주제 조회 추이" className="space-y-3 py-2 text-left">
        <p className="text-sm leading-6 text-fg-2">
          기본 주제 <strong className="text-fg">‘{topic}’</strong>의 최근 30일 조회 추이입니다. 다른 백과 문서는 위에서 검색하면 그 문서의 추이로 바뀝니다.
        </p>
        <WikimediaInterestDashboard
          item={state.item}
          saved={isSaved(state.item.id)}
          disabled={saveDisabled}
          onToggle={() => onToggleItem(state.item)}
        />
      </section>
    );
  }
  return <PreSearchGuide provider="wikimedia" onRunSearch={onRunSearch} />;
}

export function ResourceSearchPage({ provider, preSearchGuide, cardDecoration }: {
  provider: ResourceSearchProvider;
  /** 제공처 전용 검색 전 구성. 지정하면 공통 큐레이션(PreSearchGuide) 대신 이 구성을 쓴다. */
  preSearchGuide?: (onRunSearch: (q: string) => void) => ReactNode;
  /** 결과·저장 카드 장식. 지정한 제공처 표면만 넘긴다 — 나머지 제공처는 기존 카드 그대로다. */
  cardDecoration?: (item: CreatorResource) => ResourceCardDecoration | undefined;
}) {
  const config = RESOURCE_SEARCH_CONFIG[provider];
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const pageValue = Number(params.get("page") ?? 1);
  const page = Number.isInteger(pageValue) && pageValue >= 1 && pageValue <= 20 ? pageValue : 1;
  const [draft, setDraft] = useState(query);
  const [savedOnly, setSavedOnly] = useState(false);
  const [result, setResult] = useState<ResourceSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [retry, setRetry] = useState(0);
  const { workspace, update, error, ready, saving, writable } = useCreatorWorkspace();
  useEffect(() => { setDraft(query); }, [query]);
  useEffect(() => {
    setResult(null); setRequestError("");
    if (savedOnly || !query) { setLoading(false); return; }
    if (query.trim().length < 2 || query.length > 80) { setLoading(false); setRequestError("검색어를 2~80자로 입력하세요."); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 30000);
    let disposed = false;
    setLoading(true);
    const search = new URLSearchParams({ provider, q: query, page: String(page) });
    void apiFetch(apiPath(`/api/creator-resources/search?${search}`), { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (response.status === 429) throw new Error("요청이 많습니다. 1분 후 다시 검색하세요.");
        if (!response.ok) throw new Error("검색 서버에 연결하지 못했습니다. 공식 사이트를 이용하거나 다시 시도하세요.");
        const parsed = parseSearchResult(await response.json());
        if (!parsed || parsed.provider !== provider) throw new Error("검색 응답의 형식을 확인하지 못했습니다.");
        if (!disposed) setResult(parsed);
      }).catch((cause: unknown) => {
        if (!disposed) setRequestError(controller.signal.aborted ? "검색 시간이 초과되었습니다. 다시 시도하세요." : cause instanceof Error ? cause.message : "검색하지 못했습니다.");
      }).finally(() => { window.clearTimeout(timeout); if (!disposed) setLoading(false); });
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [provider, query, page, retry, savedOnly]);
  const savedItems = workspace.saved.filter((item) => item.provider === provider);
  const items = savedOnly ? savedItems : result?.items ?? [];
  // wikimedia 검색 결과 1건이 곧 대시보드다 (S4-09) — 일별 시계열이 실린 항목이면
  // 카드 그리드 대신 조회 추이 대시보드로 본체를 교체하고, 시계열이 없으면 기존 카드로 폴백한다.
  const dashboardItem = !savedOnly && provider === "wikimedia"
    ? items.find((item) => (item.dailyViews?.length ?? 0) >= 2)
    : undefined;
  const toggle = (item: CreatorResource) => {
    const remove = workspace.saved.some((saved) => saved.id === item.id);
    void update((value) => ({ ...value,
      saved: remove ? value.saved.filter((saved) => saved.id !== item.id)
        : value.saved.some((saved) => saved.id === item.id) ? value.saved : [...value.saved, item],
    }));
  };
  const searchFor = (q: string) => { setSavedOnly(false); setParams({ q, page: "1" }); };
  return <ResourceLayout title={config.title} intro={config.intro}>
    <ProviderStatus provider={provider} />
    {/* 역할 분담 안내 — 웹툰 작품은 /search·/explore, 단행본·작법서·창작 자료는 여기서 */}
    <div className="rounded-2xl border border-line bg-panel p-4 text-sm leading-6 text-fg-2" role="note" aria-label="자료 검색 역할 안내">
      <p>
        <strong className="text-fg">웹툰 작품</strong>은{" "}
        <Link className="font-medium text-accent underline underline-offset-4 hover:opacity-80" to="/search">통합 검색</Link>
        {" "}·{" "}
        <Link className="font-medium text-accent underline underline-offset-4 hover:opacity-80" to="/explore">탐색</Link>
        에서 찾고, <strong className="text-fg">단행본·작법서·창작 자료</strong>는 여기서 검색하세요.
      </p>
    </div>
    {/* 날씨·빛 페이지는 타일 대신 빛 비교 참고판이 본체다 (시안 S4-05). 검색·상태 구분은 아래 그대로 유지한다. */}
    {provider === "metweather" && <WeatherLightBoard />}
    <section aria-labelledby="resource-search-heading">
    <h2 id="resource-search-heading" className="sr-only">자료 검색</h2>
    <form className="space-y-3 rounded-2xl border border-line bg-panel p-5" onSubmit={(event) => { event.preventDefault(); searchFor(draft.trim()); }}>
      <label htmlFor={`resource-query-${provider}`} className="block text-sm font-semibold">{RESOURCE_LABELS[provider]} 검색</label>
      <div className="flex flex-col gap-3 sm:flex-row"><input id={`resource-query-${provider}`} className={RESOURCE_INPUT} type="search" required minLength={2} maxLength={80} value={draft} placeholder={config.hint} onChange={(event) => setDraft(event.target.value)} /><button className={`${RESOURCE_BUTTON} shrink-0 bg-accent-soft`} type="submit">검색하기</button></div>
      <div className="flex flex-wrap gap-2">{config.examples.map((value) => <button key={value} type="button" className={RESOURCE_BUTTON} onClick={() => searchFor(value)}>{value}</button>)}</div>
    </form>
    <div className="flex flex-wrap items-center gap-3">
      <button className={RESOURCE_BUTTON} aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)}>검색 결과</button>
      <button className={RESOURCE_BUTTON} aria-pressed={savedOnly} onClick={() => setSavedOnly(true)}>저장한 자료 {savedItems.length}</button>
      <button className={RESOURCE_BUTTON} disabled={!savedItems.length} onClick={() => downloadText(`${provider}-sources.md`, attributionMarkdown(savedItems))}>출처 내보내기</button>
      <Link className={RESOURCE_BUTTON} to="/research">전체 저장 보드 검색·정렬</Link>
      <a href={config.url} className={RESOURCE_BUTTON} target="_blank" rel="noopener noreferrer">공식 사이트 ↗</a>
      {provider === "kakao" && <Link className={RESOURCE_BUTTON} to="/search">기존 웹툰·작품 검색</Link>}
    </div>
    </section>
    <section aria-labelledby="resource-results-heading">
    <h2 id="resource-results-heading" className="sr-only">검색 결과</h2>
    <div aria-live="polite" aria-atomic="true" className="text-sm leading-6 text-fg-2">
      {!savedOnly && loading && <p role="status">공식 제공처에서 자료를 확인하고 있습니다…</p>}
      {!savedOnly && requestError && <p role="alert">{requestError}</p>}
      {!savedOnly && result && <p>{result.status === "not_configured" ? "API 연결 대기 · " : result.status === "unavailable" ? "일시적으로 이용 불가 · " : ""}{result.message}</p>}
      {!savedOnly && !query && (provider === "wikimedia"
        ? <WikimediaPreSearch
            isSaved={(itemId) => workspace.saved.some((saved) => saved.id === itemId)}
            onToggleItem={toggle}
            saveDisabled={!ready || !writable || saving}
            onRunSearch={searchFor}
          />
        : preSearchGuide ? preSearchGuide(searchFor) : <PreSearchGuide provider={provider} onRunSearch={searchFor} />)}
      {!loading && !items.length && (savedOnly || result?.status === "ready") && <div className="flex flex-col items-center py-4 text-center">
        <EmptySearchArt />
        <p>{savedOnly ? "이 제공처에서 저장한 자료가 없습니다." : "현재 검색 범위에 표시할 자료가 없습니다. 다른 검색어 또는 다음 페이지를 확인하세요."}</p>
        {!savedOnly && <div className="mt-3 flex flex-wrap justify-center gap-2">
          {config.examples.filter((value) => value !== query).map((value) => <button key={value} type="button" className={RESOURCE_BUTTON} onClick={() => searchFor(value)}>{value}</button>)}
        </div>}
      </div>}
    </div>
    {!savedOnly && (requestError || result?.status === "unavailable" || result?.status === "partial") && <button className={RESOURCE_BUTTON} onClick={() => setRetry((value) => value + 1)}>다시 시도</button>}
    {dashboardItem ? (
      <WikimediaInterestDashboard
        item={dashboardItem}
        saved={workspace.saved.some((saved) => saved.id === dashboardItem.id)}
        disabled={!ready || !writable || saving}
        onToggle={() => toggle(dashboardItem)}
      />
    ) : !savedOnly && loading && items.length === 0 ? (
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="aspect-[4/3] w-full animate-pulse bg-raised [motion-reduce:animate-none]" />
            <div className="space-y-3 p-5">
              <div className="h-5 w-3/4 animate-pulse rounded bg-raised [motion-reduce:animate-none]" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-raised [motion-reduce:animate-none]" />
              <div className="h-4 w-full animate-pulse rounded bg-raised [motion-reduce:animate-none]" />
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-busy={!savedOnly && loading}>
        {items.map((item) => { const decoration = cardDecoration?.(item); return <ResourceCard key={item.id} item={item} saved={workspace.saved.some((saved) => saved.id === item.id)} disabled={!ready || !writable || saving} onToggle={() => toggle(item)} kindLabel={decoration?.kindLabel} wideTile={decoration?.wideTile} />; })}
      </div>
    )}
    {!savedOnly && result && (result.status === "ready" || result.status === "partial") && <nav className="flex items-center justify-center gap-4" aria-label="검색 결과 페이지">
      <button className={RESOURCE_BUTTON} disabled={page <= 1 || loading} onClick={() => setParams({ q: query, page: String(page - 1) })}>이전</button><span>{page} 페이지</span>
      <button className={RESOURCE_BUTTON} disabled={!result.hasMore || loading} onClick={() => setParams({ q: query, page: String(page + 1) })}>다음</button>
    </nav>}
    </section>
    <LocalSaveNotice error={error} writable={writable} saving={saving} />
  </ResourceLayout>;
}
export function ReferencesPage() { return <ResourceSearchPage provider="met" />; }
export function OpportunitiesPage() { return <ResourceSearchPage provider="bizinfo" />; }
export function WorksPage() { return <ResourceSearchPage provider="kakao" />; }
export function PolyHavenPage() {
  return <ResourceSearchPage provider="polyhaven"
    preSearchGuide={(onRunSearch) => <PolyHavenCategoryGuide onRunSearch={onRunSearch} />}
    cardDecoration={polyHavenCardDecoration} />;
}
export function AmbientCgPage() { return <ResourceSearchPage provider="ambientcg" />; }
export function NasaImagesPage() { return <ResourceSearchPage provider="nasa" />; }
export function VamCollectionsPage() { return <ResourceSearchPage provider="vam" />; }
export function RijksmuseumPage() { return <ResourceSearchPage provider="rijksmuseum" />; }
export function GoogleFontsPage() { return <ResourceSearchPage provider="googlefonts" />; }
export function GbifPage() { return <ResourceSearchPage provider="gbif" />; }
export function MusicBrainzPage() { return <ResourceSearchPage provider="musicbrainz" />; }
export function InternetArchivePage() { return <ResourceSearchPage provider="internetarchive" />; }
export function MetWeatherPage() { return <ResourceSearchPage provider="metweather" />; }
export function KoreanHeritagePage() { return <ResourceSearchPage provider="kheritage" />; }
export function NeisSchoolPage() { return <ResourceSearchPage provider="neis" />; }
export function TourApiPage() { return <ResourceSearchPage provider="tourapi" />; }
export function KoreanDictionaryPage() { return <ResourceSearchPage provider="korean" />; }
export function SmithsonianPage() { return <ResourceSearchPage provider="smithsonian" />; }
export function WikimediaInterestPage() { return <ResourceSearchPage provider="wikimedia" />; }
export function EuropeanaPage() { return <ResourceSearchPage provider="europeana" />; }
export function DplaPage() { return <ResourceSearchPage provider="dpla" />; }
