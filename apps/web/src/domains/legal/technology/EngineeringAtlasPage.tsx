import { ArrowLeft, ArrowRight, Printer, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { EngineeringAtlasCard } from "./EngineeringAtlasCard";
import { EngineeringAtlasMaps } from "./EngineeringAtlasMaps";
import { ENGINEERING_ATLAS_ENTRIES } from "./engineering-atlas-content";
import { ENGINEERING_ATLAS_CATEGORIES } from "./engineering-atlas-types";
import { ENGINEERING_MAPS } from "./engineering-map-content";
import { filterMapRows } from "./engineering-map-filter";
import { EngineeringDisclosure, EngineeringKeySummary, EngineeringMetaChip } from "./EngineeringLongform";
import { EngineeringPageFrame, EngineeringPageIntro } from "./EngineeringStoryUi";
import { useEngineeringLocale } from "./use-engineering-locale";
import { ATLAS_PAGE_SIZE, useAtlasNavigation, type AtlasCategory, type AtlasStatus, type AtlasView } from "./use-atlas-navigation";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { cx } from "@/shared/lib/cx";
import { formatI18nTemplate, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo => translateBilingualValueForActiveLocale("EngineeringAtlasPage", ko, en);
const BODY_ID = "engineering-atlas-body";
const STATUS_FILTERS: readonly { readonly id: AtlasStatus; readonly ko: string; readonly en: string }[] = [
  { id: "all", ko: "모든 상태", en: "Any status" },
  { id: "live", ko: "운영 경로", en: "Live" },
  { id: "configured", ko: "설정 필요", en: "Setup required" },
  { id: "experimental", ko: "실험 기능", en: "Experimental" },
  { id: "documented", ko: "문서화", en: "Documented" },
  { id: "planned", ko: "설계 단계", en: "Planned" },
];
const controlClass = "min-h-11 min-w-11 rounded-xl border border-line bg-card px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** 전체 인쇄는 검색·페이지·지도 선택을 바꾸지 않고 모든 원문을 동기로 구성한 뒤 기존 접힘 상태로 복구한다. */
function useAtlasPrint(setPrinting: (value: boolean) => void): void {
  useEffect(() => {
    let active = false;
    let prior: { ownerId: string; index: number; open: boolean }[] = [];
    const before = () => {
      if (active) return;
      active = true;
      prior = [...(document.getElementById(BODY_ID)?.querySelectorAll<HTMLDetailsElement>("details") ?? [])].flatMap((details) => {
        const owner = details.parentElement?.closest<HTMLElement>("[id]");
        return owner ? [{ ownerId: owner.id, index: [...owner.querySelectorAll("details")].indexOf(details), open: details.open }] : [];
      });
      flushSync(() => setPrinting(true));
      document.getElementById(BODY_ID)?.querySelectorAll<HTMLDetailsElement>("details").forEach((details) => { details.open = true; });
    };
    const after = () => {
      if (!active) return;
      active = false;
      flushSync(() => setPrinting(false));
      for (const item of prior) {
        const details = document.getElementById(item.ownerId)?.querySelectorAll<HTMLDetailsElement>("details")[item.index];
        if (details) details.open = item.open;
      }
      prior = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, [setPrinting]);
}

export function EngineeringAtlasPage() {
  useBilingualI18nRevision();
  const locale = useEngineeringLocale();
  const navigation = useAtlasNavigation();
  const { category, status, query, page, pages, view, map, normalized, visible, targetId, update } = navigation;
  const searchId = useId();
  const categoryId = useId();
  const statusId = useId();
  const [printing, setPrinting] = useState(false);
  useAtlasPrint(setPrinting);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  useEffect(() => {
    if (!moveFocus.current || printing) return;
    moveFocus.current = false;
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [page, view, printing]);
  useDocumentTitle(bi("ToonStudio 기술 도감 · 쓰인 기술을 한 장씩", "ToonStudio tech atlas · One card per technology"));

  const visibleMaps = useMemo(() => category === "all"
    ? ENGINEERING_MAPS.map((item) => ({ map: item, rows: filterMapRows(item, normalized, status) })).filter((item) => item.rows.length > 0)
    : [], [category, normalized, status]);
  // 현재 페이지 밖 카드에도 지도 링크를 유지한다. 링크의 해시는 대상 페이지를 먼저 구성한다.
  const visibleAtlas = useMemo(() => new Map((printing ? ENGINEERING_ATLAS_ENTRIES : visible).map((entry) => [entry.id, entry.name])), [printing, visible]);
  const entries = printing ? ENGINEERING_ATLAS_ENTRIES : visible.slice((page - 1) * ATLAS_PAGE_SIZE, page * ATLAS_PAGE_SIZE);
  const maps = printing ? ENGINEERING_MAPS.map((item) => ({ map: item, rows: item.rows })) : visibleMaps;
  const total = visible.length;
  const start = total ? (page - 1) * ATLAS_PAGE_SIZE + 1 : 0;
  const end = Math.min(page * ATLAS_PAGE_SIZE, total);
  const sampleCount = ENGINEERING_ATLAS_ENTRIES.reduce((sum, entry) => sum + entry.samples.length, 0);
  const linkCount = ENGINEERING_ATLAS_ENTRIES.reduce((sum, entry) => sum + entry.links.length, 0);
  const referencedChapters = new Set(ENGINEERING_ATLAS_ENTRIES.flatMap((entry) => entry.chapterIds)).size;
  const setView = (next: AtlasView) => { if (next === view) return; moveFocus.current = true; update({ view: next }); };
  const changePage = (next: number) => { moveFocus.current = true; update({ page: next }); };
  const reset = () => update({ category: "all", status: "all", query: "", page: 1 }, true);

  return (
    <EngineeringPageFrame pageId="atlas">
      <EngineeringPageIntro eyebrow="TECH ATLAS" title={bi("기술 도감", "Technology atlas")}
        description={bi("필요한 기술을 찾아 쓰인 곳과 예제를 확인하세요.", "Find a technology, where it is used, and its examples.")}
        aside={<button type="button" className={controlClass} onClick={() => window.print()}><Printer size={16} className="mr-2 inline" aria-hidden="true" />{bi("전체 인쇄", "Print all")}</button>} />

      <nav aria-label={bi("도감에서 할 일", "Atlas purpose")} className="mb-4 flex gap-4 border-b border-line print:hidden">
        {(["cards", "maps"] as const).map((purpose) => (
          <button key={purpose} type="button" aria-current={view === purpose ? "page" : undefined} aria-controls={purpose === "cards" ? "atlas-card-results" : "atlas-map-results"}
            onClick={() => setView(purpose)} className={cx("min-h-11 border-b-2 px-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent", view === purpose ? "border-accent text-fg" : "border-transparent text-fg-2")}>
            {purpose === "cards" ? bi("기술 찾기", "Find technology") : bi("기술 비교 지도", "Technology maps")}
          </button>
        ))}
      </nav>

      <section aria-label={bi("도감 찾기", "Find in the atlas")} className="mb-6 grid gap-4 rounded-3xl border border-line/70 bg-panel/70 p-4 shadow-sm sm:p-5 print:hidden">
        <label htmlFor={searchId} className="grid gap-2 text-sm font-bold text-fg">
          {bi("기술·기능 이름으로 검색", "Search by technology or feature")}
          <span className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
            <input id={searchId} type="search" value={query} maxLength={80} onChange={(event) => update({ query: event.target.value, page: 1 }, true)}
              placeholder={bi("예: OPFS, WebRTC, 드래그, Yjs", "e.g. OPFS, WebRTC, drag, Yjs")} className={`${controlClass} w-full pl-10`} />
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor={categoryId} className="grid min-w-0 gap-2 text-xs font-bold text-fg-2">{bi("분야", "Category")}
            <select id={categoryId} value={category} onChange={(event) => update({ category: event.target.value as AtlasCategory, page: 1 }, true)} className={`${controlClass} w-full min-w-0`}>
              <option value="all">{bi("전체 분야", "All categories")}</option>
              {ENGINEERING_ATLAS_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{bi(item.label.ko, item.label.en)}</option>)}
            </select>
          </label>
          <label htmlFor={statusId} className="grid min-w-0 gap-2 text-xs font-bold text-fg-2">{bi("현재 상태", "Current status")}
            <select id={statusId} value={status} onChange={(event) => update({ status: event.target.value as AtlasStatus, page: 1 }, true)} className={`${controlClass} w-full min-w-0`}>
              {STATUS_FILTERS.map((item) => <option key={item.id} value={item.id}>{bi(item.ko, item.en)}</option>)}
            </select>
          </label>
        </div>
        <p role="status" aria-live="polite" data-atlas-result-count="" className="text-xs font-bold text-fg-2">
          {view === "cards"
            ? formatI18nTemplate(String(bi("{value0}–{value1} / 검색 결과 {value2}개 · 도감 전체 {value3}개", "{value0}–{value1} / {value2} matching cards · {value3} in the atlas")), { value0: start, value1: end, value2: total, value3: ENGINEERING_ATLAS_ENTRIES.length })
            : formatI18nTemplate(String(bi("지도 {value0}개 · 조건에 맞는 항목 {value1}개", "{value0} maps · {value1} matching rows")), { value0: visibleMaps.length, value1: visibleMaps.reduce((sum, item) => sum + item.rows.length, 0) })}
        </p>
      </section>

      <div id={BODY_ID} className="grid min-w-0 gap-6">
        <section id="atlas-card-results" hidden={!printing && view !== "cards"} aria-labelledby="atlas-cards-title">
          <h2 id="atlas-cards-title" ref={view === "cards" ? resultsHeading : undefined} tabIndex={-1} className="mb-4 scroll-mt-32 text-xl font-black text-fg">{bi("기술 카드", "Technology cards")}</h2>
          {entries.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {entries.map((entry, index) => <EngineeringAtlasCard key={entry.id} entry={entry} locale={locale} printing={printing} hashTarget={targetId} categoryAnchor={entries.findIndex((item) => item.category === entry.category) === index} />)}
          </div> : <div className="rounded-3xl border border-dashed border-line-strong bg-card/50 p-6 text-sm leading-7 text-fg-2">
            <p>{bi("조건에 맞는 카드가 없습니다. 검색어를 줄이거나 분야와 상태를 '전체'로 바꿔 보세요.", "No cards match. Shorten the search or reset category and status to All.")}</p>
            {visibleMaps.length ? <button type="button" className={`${controlClass} mt-3`} onClick={() => setView("maps")}>{bi("관련 지도 보기", "View matching maps")}</button> : null}
            <button type="button" className={`${controlClass} mt-3 ml-2`} onClick={reset}>{bi("검색 조건 초기화", "Reset filters")}</button>
          </div>}
          {!printing && total > ATLAS_PAGE_SIZE ? <nav aria-label={bi("기술 카드 페이지", "Technology card pages")} className="mt-5 flex flex-wrap items-center justify-center gap-3 print:hidden">
            <button type="button" disabled={page <= 1} className={`${controlClass} inline-flex items-center gap-2 disabled:opacity-45`} onClick={() => changePage(page - 1)}><ArrowLeft size={16} aria-hidden="true" />{bi("이전 12개", "Previous 12")}</button>
            <span className="text-sm tabular-nums text-fg-2">{page} / {pages}</span>
            <button type="button" disabled={page >= pages} className={`${controlClass} inline-flex items-center gap-2 disabled:opacity-45`} onClick={() => changePage(page + 1)}>{bi("다음 12개", "Next 12")}<ArrowRight size={16} aria-hidden="true" /></button>
          </nav> : null}
        </section>
        <section id="atlas-map-results" hidden={!printing && view !== "maps"} aria-labelledby="atlas-maps-title">
          <h2 id="atlas-maps-title" ref={view === "maps" ? resultsHeading : undefined} tabIndex={-1} className="mb-3 scroll-mt-32 text-xl font-black text-fg">{bi("기술 비교 지도", "Technology maps")}</h2>
          <p className="mb-4 text-sm leading-7 text-fg-2">{bi("무료 서비스·오픈소스·Open API·경쟁 제품·AI 개발 도구를 목적별로 비교하세요.", "Compare free services, open source, Open APIs, competing products and AI development tools by purpose.")}</p>
          {printing || view === "maps" ? <EngineeringAtlasMaps maps={maps} selected={map} printing={printing} visibleAtlas={visibleAtlas} onSelect={(id) => update({ map: id })} /> : null}
          {!maps.length ? <p className="rounded-3xl border border-dashed border-line p-5 text-sm text-fg-2">{bi("조건에 맞는 지도가 없습니다. 지도는 분야를 '전체'로 바꾸고 찾아보세요.", "No maps match. Set category to All to find maps.")} <button type="button" className={`${controlClass} mt-3`} onClick={reset}>{bi("검색 조건 초기화", "Reset filters")}</button></p> : null}
        </section>
        <EngineeringDisclosure summary={bi("도감 읽는 법과 출처", "How to read the atlas and its sources")}>
          <EngineeringKeySummary
        points={[
          bi("기술 이름이 아니라 '어느 기능에서 어떻게 쓰였는가'로 정리했습니다. 카드의 '쓰인 곳'은 사용자가 보는 기능 → 그 안에서 맡은 일 → 근거 파일 순입니다.", "Cards are organized by 'which feature uses it and how', not by technology name: user-facing feature, the job it does there, then evidence files."),
          bi("샘플 코드는 핵심 아이디어만 남긴 교육용 예제이거나 실제 구현을 줄인 예제이며, 구문·타입 검증 테스트를 통과한 것만 실었습니다.", "Sample code is a teaching sample or a simplified real implementation, and only samples that pass syntax and type verification are published."),
          bi("발표 중 질문을 받으면 검색창에서 기술 이름을 찾고, '발표 보조'의 30초 설명과 예상 질문을 그대로 쓰면 됩니다.", "When a question comes up during the talk, search the technology name and reuse the 30-second pitch and anticipated questions."),
        ]}
        meta={(
          <>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("카드 {value0}장", "{value0} cards")), { value0: ENGINEERING_ATLAS_ENTRIES.length })}</EngineeringMetaChip>
            {ENGINEERING_MAPS.length > 0 ? (
              <EngineeringMetaChip>{formatI18nTemplate(String(bi("비교 지도 {value0}개", "{value0} maps")), { value0: ENGINEERING_MAPS.length })}</EngineeringMetaChip>
            ) : null}
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("샘플 코드 {value0}개", "{value0} samples")), { value0: sampleCount })}</EngineeringMetaChip>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("참고 링크 {value0}개", "{value0} references")), { value0: linkCount })}</EngineeringMetaChip>
            <EngineeringMetaChip>{formatI18nTemplate(String(bi("연결 챕터 {value0}개", "{value0} linked chapters")), { value0: referencedChapters })}</EngineeringMetaChip>
          </>
        )}
      />

        </EngineeringDisclosure>
      </div>
    </EngineeringPageFrame>
  );
}
