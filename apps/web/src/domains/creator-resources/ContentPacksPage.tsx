import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { buildContentBrief, CONTENT_FORMATS, CONTENT_PACKS, findContentPack, isContentFormat, MAX_BRIEF_SOURCES } from "./content-packs";
import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { researchSourceIdentity } from "./research-source-identity";
import { ResearchSourceMark } from "./ResearchSourceCover";
import { ArtBand } from "./ArtBand";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { ResourceCard } from "./ResourceSearchPage";
import { StaggerReveal } from "@/shared/components/stagger-reveal";
import { TranslatedQueryNotice } from "./TranslatedQueryNotice";
import { useTranslatedResearchQuery } from "./use-translated-research-query";
import { packProvider, usePackResourceSearch } from "./usePackResourceSearch";
import { downloadText, useCreatorWorkspace } from "./workspace";
import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";
import type { CreatorResource } from "@/shared/lib/creator-resources";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { MotionEmptyState } from "@/shared/motion-assets";
import { resolveReferenceQuery } from "../../../../../packages/core/src/reference-query-language";

const SCOPE = "domains.creator.resources.ContentPacksPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

/**
 * 장면 팩별 아트 배정 (디자인 웨이브 7) — 팩의 분위기를 브랜드 일러스트로 읽히게 한다.
 * 일러스트는 장면의 무드 신호일 뿐 팩 데이터가 아니며, 카드 본문(제목·가정)이 내용을 담당한다.
 */
const PACK_ART: Readonly<Record<string, string>> = {
  armor: "project-crimson",
  costume: "character-pink",
  tea: "materials",
  mirror: "canvas-noir",
  lantern: "luna",
  bridge: "background-city",
  garden: "hero",
  wave: "character-blue",
  snow: "blank-canvas",
  pattern: "storyboard",
  clay: "project-romance",
  music: "background-classroom",
};

export function ContentPacksPage() {
  useBilingualI18nRevision();
  const [params, setParams] = useSearchParams();
  const pack = findContentPack(params.get("pack"));
  const provider = packProvider(params.get("provider"));
  const providerIdentity = researchSourceIdentity(provider);
  const rawFormat = params.get("format");
  const format = isContentFormat(rawFormat) ? rawFormat : "storyboard";
  const query = params.get("q") ?? "";
  const rawPage = Number(params.get("page") ?? 1);
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 20 ? rawPage : 1;
  const [draft, setDraft] = useState(query);
  const [category, setCategory] = useState(() => tx("전체"));
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const { workspace, update, ready, writable, saving, error } = useCreatorWorkspace();
  // aic·cleveland·met 모두 영문 인덱스 — 한글 검색어는 공용 변환 계층으로 보낸다.
  // 서버에도 같은 사전 변환이 있어 이중 적용해도 멱등하다.
  const translated = useTranslatedResearchQuery(query);
  const search = usePackResourceSearch(provider, translated.effectiveQuery, page);
  useEffect(() => { setDraft(query); }, [query]);
  const changeParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) { if (value === null) next.delete(key); else next.set(key, value); }
    setParams(next);
  };
  const sources = workspace.saved.filter((item) => selected.includes(item.id));
  const brief = buildContentBrief(pack, format, sources, notes);
  const resolution = query ? resolveReferenceQuery(query) : null;
  const toggleSaved = (item: CreatorResource) => {
    void update((value) => ({ ...value, saved: value.saved.some((saved) => saved.id === item.id)
      ? value.saved.filter((saved) => saved.id !== item.id) : [...value.saved, item] }));
  };
  const toggleSource = (id: string) => {
    setNotice("");
    if (!selected.includes(id) && sources.length >= MAX_BRIEF_SOURCES) { setNotice(formatI18nTemplate(tx("브리프에는 {v0}개까지 선택할 수 있습니다."), { v0: MAX_BRIEF_SOURCES })); return; }
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current.filter((value) => workspace.saved.some((item) => item.id === value)), id]);
  };
  const exportBrief = () => {
    try { downloadText(`toonstudio-${pack.id}-${format}.md`, brief); setNotice(tx("브리프 파일 다운로드를 요청했습니다. 브라우저 다운로드 목록을 확인하세요.")); }
    catch { setNotice(tx("파일을 내보내지 못했습니다. 아래 미리보기의 내용을 복사해 보관하세요.")); }
  };
  // 첫 화면 무대 (디자인 웨이브 15 — 구도 교체): 팩 12종의 실물 아트(PACK_ART —
  // 각 팩 카드의 얼굴과 같은 배정)를 4×3 모자이크로 전폭 무대화하고, 제목·소개를
  // 스크림 위 무대 안에 종속 배치한다. 아트는 전부 실제 팩 데이터의 배정에서
  // 도출한다 — 팩과 무관한 장식 아트를 새로 끼우지 않는다. 팩 선택 그리드는
  // 무대 아래에서 종전대로 내용을 담당한다.
  const packStage = (
    <section aria-label={tx("오픈 콘텐츠 제작실 소개")} className="relative overflow-hidden rounded-3xl border border-line bg-panel">
      <div aria-hidden="true" className="absolute inset-0 grid grid-cols-4 grid-rows-3">
        {CONTENT_PACKS.map((item, index) => (
          <span key={item.id} className="relative block overflow-hidden">
            <img
              src={`/brand/illustrated-20260928/${PACK_ART[item.id] ?? "materials"}.webp`}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover"
            />
            {/* 타일 이름표는 첫 줄만 단다 — 아래 두 줄은 스크림 위 카피가 앉는
                자리라 이름표와 글자가 겹친다. 팩 이름은 아래 선택 그리드가 담당한다. */}
            {index < 4 ? (
              <span className="absolute left-2 top-2 hidden rounded-full bg-black/45 px-2 py-0.5 text-[0.65rem] font-semibold text-white/90 backdrop-blur-sm sm:block">{tx(item.title)}</span>
            ) : null}
          </span>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_top,oklch(0.08_0.02_265/0.95)_0%,oklch(0.08_0.02_265/0.85)_44%,oklch(0.08_0.02_265/0.52)_78%,oklch(0.08_0.02_265/0.5)_100%)]"
      />
      <div className="relative flex min-h-[26rem] flex-col justify-end gap-4 p-6 sm:p-8">
        <Link
          to="/research"
          className="inline-flex min-h-8 items-center self-start text-xs font-semibold tracking-[.12em] text-white/75 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          TOONSTUDIO / {tx("리서치 데스크")}
        </Link>
        <p className="eyebrow text-white/70">{txEn("OPEN CONTENT PACKS")}</p>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">{tx("오픈 콘텐츠 제작실")}</h1>
        <p className="max-w-2xl text-base leading-7 text-white/85">{tx("무료 공개 자료를 내 장면의 근거로 바꾸세요. 12개 창작 팩에서 출발해 자료를 검색·저장하고, 출처를 붙인 콘티와 설정집을 만듭니다. 가입·유료 AI 호출은 필요하지 않습니다.")}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm">{formatI18nTemplate(tx("창작 팩 {v0}개"), { v0: CONTENT_PACKS.length })}</span>
          <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm">{tx("공식 제공처 3곳에서 검색")}</span>
          <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm">{tx("출처를 붙인 브리프 내보내기")}</span>
          <span className="ms-auto text-xs text-white/65">{formatI18nTemplate(tx("장면 팩 {v0}종의 아트 모자이크"), { v0: CONTENT_PACKS.length })}</span>
        </div>
      </div>
    </section>
  );
  return <ResourceLayout title={tx("오픈 콘텐츠 제작실")} intro={tx("무료 공개 자료를 내 장면의 근거로 바꾸세요. 12개 창작 팩에서 출발해 자료를 검색·저장하고, 출처를 붙인 콘티와 설정집을 만듭니다. 가입·유료 AI 호출은 필요하지 않습니다.")} heroStage={packStage}>
    {/* 첫 화면 주인공은 장면 팩 아트 그리드다 (디자인 웨이브 7 주인공 교체) —
        안내 문구·외부 링크는 팩을 고른 뒤 읽는 정보라 그리드 아래로 내렸다. */}
    <section className="space-y-4" aria-labelledby="pack-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pack-heading" className="text-2xl font-bold">{tx("어떤 장면을 만들까요?")}</h2>
        <label>
          {tx("분야")}{" "}
          <select className={RESOURCE_INPUT} value={category} onChange={(event) => setCategory(event.target.value)}>
            {[tx("전체"), ...new Set(CONTENT_PACKS.map((item) => item.category))].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <StaggerReveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" itemClassName="h-full">
        {CONTENT_PACKS.filter((item) => category === tx("전체") || item.category === category).map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={pack.id === item.id}
            className={`${RESOURCE_BUTTON} h-full w-full flex-col items-start gap-2 overflow-hidden p-5 text-left ${pack.id === item.id ? "bg-accent-soft" : "bg-panel"}`}
            onClick={() => changeParams({ pack: item.id, q: null, page: null })}
          >
            <ArtBand art={PACK_ART[item.id] ?? "materials"} glyph={tx(item.title).charAt(0)} className="-mx-5 -mt-5 mb-1 h-28 self-stretch rounded-t-2xl" />
            <span className="text-xs text-accent">{tx(item.category)}</span>
            <span className="text-lg">{tx(item.title)}</span>
            <span className="text-sm font-normal leading-7 text-fg-2">{tx(item.premise)}</span>
          </button>
        ))}
      </StaggerReveal>
    </section>
    <section className="grid gap-3 sm:grid-cols-3" aria-label={tx("무료 제작 방식")}>
      {[tx("장면 팩·브리프 조합은 브라우저에서 처리"), tx("공식 자료 검색은 선택한 제공처만 호출"), tx("메타데이터 저장과 이미지 재사용 권한은 별도")].map((text) => <p key={text} className="rounded-xl border border-line bg-panel p-4 text-sm leading-7">{text}</p>)}
    </section>
    <Link className={RESOURCE_BUTTON} to="/research/open-creation">{tx("주제를 직접 정해 캐릭터·홍보·연습 브리프 만들기")}</Link>
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-5" aria-labelledby="pack-search-heading">
      <h2 id="pack-search-heading" className="text-2xl font-bold">{tx("공식 자료 찾기")}</h2>
      <p className="text-sm leading-7 text-fg-2">{tx("공개 이용 표시가 확인된 자료만 보여줍니다. 한글 검색은 제한된 미술 용어 사전으로 확장하며, 일반 번역 서비스는 아닙니다.")}</p>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); changeParams({ q: draft.trim(), page: "1" }); }}>
        <label className="sm:w-60">{tx("제공처")}<select className={RESOURCE_INPUT} value={provider} onChange={(event) => changeParams({ provider: event.target.value, q: null, page: null })}>{(["aic", "cleveland", "met"] as const).map((value) => <option key={value} value={value}>{RESOURCE_LABELS[value]}</option>)}</select></label>
        <label className="flex-1">{tx("자료 검색어")}<input className={RESOURCE_INPUT} type="search" onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} minLength={2} maxLength={80} required value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={tx("예: 갑옷, 도자기, 정원")} /></label>
        <button type="submit" className={RESOURCE_BUTTON} disabled={search.loading}>{tx("자료 검색")}</button>
      </form>
      <p className={`research-source research-source--${provider} flex items-center gap-3 text-sm leading-6 text-fg-2`}>
        <ResearchSourceMark identity={providerIdentity} />
        <span><strong className="font-bold text-fg">{providerIdentity.name}</strong> — {providerIdentity.tagline}</span>
      </p>
      <div className="flex flex-wrap gap-2">{pack.keywords.map((keyword) => <button key={keyword} className={RESOURCE_BUTTON} disabled={search.loading} onClick={() => changeParams({ q: keyword, page: "1" })}>{formatI18nTemplate(tx("{v0} 검색"), { v0: tx(keyword) })}</button>)}</div>
      {resolution && <p className="text-sm text-fg-2">{formatI18nTemplate(tx("실제 검색어: {v0}{v1}"), { v0: resolution.providerQuery, v1: resolution.unresolved.length ? ` · ${formatI18nTemplate(tx("사전에 없는 표현: {v0}"), { v0: resolution.unresolved.join(", ") })}` : "" })}</p>}
      {query && <TranslatedQueryNotice state={translated} />}
      {!query && <p className="text-sm text-fg-2">{tx("검색어를 선택하기 전에는 외부 자료 API를 호출하지 않습니다.")}</p>}
      {search.loading && <MotionEmptyState kind="loading" title={tx("공식 자료를 확인하고 있습니다")} description={tx("선택한 제공처의 공개 API를 호출하는 중입니다.")} />}
      {search.error && <p role="alert">{search.error}</p>}
      {search.result && <p role="status" className="text-sm leading-7 text-fg-2">{search.result.message}{search.result.status === "unavailable" ? tx(" 제공처 일시 이용 불가.") : formatI18nTemplate(tx(" 표시 {v0}건."), { v0: search.result.items.length })}</p>}
      {(search.error || search.result?.status === "unavailable" || search.result?.status === "partial") && <button className={RESOURCE_BUTTON} disabled={search.loading} onClick={search.retry}>{tx("다시 시도")}</button>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy={search.loading}>{search.result?.items.map((item) => <ResourceCard key={item.id} item={item} saved={workspace.saved.some((saved) => saved.id === item.id)} onToggle={() => toggleSaved(item)} disabled={!ready || !writable || saving} />)}</div>
      {!search.loading && !search.error && query && search.result && !search.result.items.length && <MotionEmptyState
        kind="search"
        title={tx("조건에 맞는 자료가 없습니다")}
        description={tx("다른 검색어나 제공처를 선택해 보세요.")}
        action={<Link className={RESOURCE_BUTTON} to="/research/open-creation">{tx("주제를 직접 정해 브리프 만들기")}</Link>}
      />}
      {search.result && <nav className="flex items-center gap-3" aria-label={tx("자료 검색 페이지")}><button className={RESOURCE_BUTTON} disabled={page <= 1 || search.loading} onClick={() => changeParams({ page: String(page - 1) })}>{tx("이전")}</button><span>{formatI18nTemplate(tx("{v0} 페이지"), { v0: page })}</span><button className={RESOURCE_BUTTON} disabled={page >= 20 || !search.result.hasMore || search.loading} onClick={() => changeParams({ page: String(page + 1) })}>{tx("다음")}</button></nav>}
      <Link className={RESOURCE_BUTTON} to="/research/books">{tx("도서·작법서도 조사하기")}</Link>
    </section>
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-5" aria-labelledby="brief-heading">
      <h2 id="brief-heading" className="text-2xl font-bold">{tx("선택한 출처로 제작 브리프 만들기")}</h2>
      <p className="text-sm leading-7 text-fg-2">{formatI18nTemplate(tx("선택한 자료 {v0}/{v1}개 · 출처 선택과 메모는 현재 화면에만 유지됩니다. 작업을 마치면 파일로 내보내세요. 검색 결과는 먼저 보드에 저장한 뒤 선택합니다."), { v0: sources.length, v1: MAX_BRIEF_SOURCES })}</p>
      {!workspace.saved.length && <p>{tx("저장한 자료가 없습니다. 출처 없이 창작 템플릿만 먼저 사용할 수도 있습니다.")}</p>}
      <div className="grid max-h-80 gap-2 overflow-auto sm:grid-cols-2">{workspace.saved.map((item) => <label key={item.id} className="flex min-h-11 items-start gap-3 rounded-lg border border-line p-3 text-sm leading-6"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSource(item.id)} className="mt-1" /><span>{item.title}<span className="block text-xs text-fg-2">{RESOURCE_LABELS[item.provider]} · {item.license}</span></span></label>)}</div>
      <label className="block">{tx("산출물 형식")}<select className={RESOURCE_INPUT} value={format} onChange={(event) => changeParams({ format: event.target.value })}>{Object.entries(CONTENT_FORMATS).map(([key, title]) => <option key={key} value={key}>{tx(title)}</option>)}</select></label>
      <label className="block">{tx("나의 제작 메모")}<textarea className={`${RESOURCE_INPUT} min-h-28`} value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder={tx("내 장면에 적용할 아이디어를 적으세요. 서버에 보내지 않습니다.")} /></label>
      <div className="flex flex-wrap gap-3"><button className={RESOURCE_BUTTON} onClick={exportBrief}>{tx("브리프 Markdown 내보내기")}</button><Link className={RESOURCE_BUTTON} to="/research">{tx("저장 보드·백업 관리")}</Link><Link className={RESOURCE_BUTTON} to="/studio/new">{tx("스튜디오에서 그리기")}</Link></div>
      {notice && <p role="status">{notice}</p>}
      <details open><summary className="cursor-pointer py-3 font-semibold">{tx("제작 브리프 미리보기")}</summary><pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-raised p-4 text-sm leading-7">{brief}</pre></details>
    </section>
    <LocalSaveNotice error={error} writable={writable} saving={saving} />
    <p className="text-xs leading-6 text-fg-2">{tx("이 기능은 신규 유료 서비스·인증키·DB 저장 공간을 요구하지 않습니다. 기존 호스팅의 함수 호출·전송량 한도까지 무제한 무료라는 의미는 아닙니다. 자동 수집이나 주기적 새로고침은 사용하지 않습니다.")}</p>
  </ResourceLayout>;
}
