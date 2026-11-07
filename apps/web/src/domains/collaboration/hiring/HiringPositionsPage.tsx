import { ArrowLeft, BriefcaseBusiness, CloudOff, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { CREATOR_HIRING_MODELS, CREATOR_HIRING_ROLES, HIRING_FORMATS, HIRING_TOOLS } from "../../../../../../packages/contracts/src/creator-hiring";
import { CollabField, CollabNotice, collabButton, collabInput, collabPrimary } from "../collaboration-ui";
import { compensationLabels, optionsOf } from "./hiring-form-values";
import { HiringTermsView } from "./HiringSlotEditor";
import { parseHiringPositionPage } from "./hiring-position-response";
import { CollaborationStepConfirmSpecSuite } from "./CollaborationStepConfirmSpecSuite";
import { WebtoonAssistantOutsourcingSuite } from "./WebtoonAssistantOutsourcingSuite";

import type { HiringPositionPage } from "../../../../../../packages/contracts/src/creator-hiring";

import Link from "@/shared/navigation/router-link";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { api, getApiErrorMessage } from "@/platform/api";

const SCOPE = "domains.collaboration.hiring.HiringPositionsPage";

const EN_CHOICE_LABELS: Record<string, string> = {
  "역할": "Role",
  "협업 형태": "Collaboration model",
  "보수 방식": "Compensation",
  "도구": "Tools",
  "납품 형식": "Delivery format",
};

const EN_OPTION_LABELS: Record<string, string> = {
  "글·각색": "Story · adaptation",
  "콘티": "Storyboards",
  "선화": "Line art",
  "밑색": "Flats",
  "채색·명암": "Coloring · shading",
  "배경": "Backgrounds",
  "3D 배치": "3D layout",
  "효과·보정": "Effects · cleanup",
  "식자": "Lettering",
  "검수": "Review",
  "번역·현지화": "Translation · localization",
  "제작 관리": "Production management",
  "어시스트": "Assistant",
  "고용": "Employment",
  "유급 작업 의뢰": "Paid task commission",
  "공동 창작": "Co-creation",
  "단기·부분 협업": "Short-term · partial collaboration",
  "유급": "Paid",
  "무급": "Unpaid",
  "수익 분배": "Revenue share",
  "기타": "Other",
};

export function HiringPublicPositions({ postId }: { postId?: string }) {
  // A parent change must not reuse the previous post's cursors or results.
  return <PublicPositionsContent key={postId ?? "all-posts"} postId={postId} />;
}

function PublicPositionsContent({ postId }: { postId?: string }) {
  const bt = useBilingual(SCOPE);
  const [filters, setFilters] = useState<Record<string, string>>({});
  // 필터 다섯을 한 번에 다 펼치면 찾기 전에 고를 것부터 다섯이 된다. 자주 쓰는 둘만 먼저
  // 보이고 나머지는 펼칠 때 드러낸다 — 이미 골라 둔 추가 조건이 있으면 펼친 채로 시작한다.
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; page: HiringPositionPage | null; error: string } | null>(null);
  const after = cursors[cursors.length - 1];
  const requestKey = JSON.stringify([postId, filters, after, retry]);
  const current = result?.key === requestKey ? result : null;
  const page = current?.page ?? null;
  const error = current?.error ?? "";
  const loading = !current;
  const hasFilters = Object.keys(filters).length > 0;
  useEffect(() => {
    const controller = new AbortController();
    void api.get<unknown>("/collaborations/hiring/positions", {
      signal: controller.signal,
      timeout: 10000,
      retry: 0,
      params: { ...filters, ...(postId ? { postId } : {}), ...(after ? { after } : {}) },
    }).then((data) => {
      if (!controller.signal.aborted) setResult({ key: requestKey, page: parseHiringPositionPage(data), error: "" });
    }).catch(async (cause: unknown) => {
      const message = await getApiErrorMessage(cause, bt("모집 조건을 불러오지 못했어요.", "Couldn't load position listings."));
      if (!controller.signal.aborted) setResult({ key: requestKey, page: null, error: message });
    });
    return () => controller.abort();
  }, [filters, after, postId, requestKey, bt]);
  const choices = [
    ["role", "역할", CREATOR_HIRING_ROLES], ["model", "협업 형태", CREATOR_HIRING_MODELS],
    ["compensation", "보수 방식", compensationLabels], ["tool", "도구", optionsOf(HIRING_TOOLS)], ["format", "납품 형식", optionsOf(HIRING_FORMATS)],
  ] as const;
  const optionLabel = (ko: string) => bt(ko, EN_OPTION_LABELS[ko] ?? ko);
  function resetFilters() { setFilters({}); setCursors([null]); }
  const extraFilterActive = Boolean(filters.compensation || filters.tool || filters.format);
  const showExtraFilters = moreFiltersOpen || extraFilterActive;
  const renderChoice = ([key, label, options]: (typeof choices)[number]) => <CollabField key={key} label={bt(label, EN_CHOICE_LABELS[label] ?? label)}><select className={collabInput} value={filters[key] ?? ""} onChange={(event) => {
    const updated = { ...filters };
    if (event.target.value) updated[key] = event.target.value; else delete updated[key];
    setCursors([null]); setFilters(updated);
  }}><option value="">{bt("전체", "All")}</option>{Object.entries(options).map(([value, name]) => <option key={value} value={value}>{optionLabel(String(name))}</option>)}</select></CollabField>;
  const next = page?.next;
  const hasNext = Boolean(next && !cursors.includes(next));
  return <section data-own-control-size="" className="space-y-5" aria-label={bt("공개 모집 조건", "Open positions")} aria-busy={loading}>
    {!postId && <div className="rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-fg"><SlidersHorizontal size={16} className="text-accent" aria-hidden="true" />{bt("조건 고르기", "Choose conditions")}</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label={bt("조건 필터 동작", "Filter actions")}>
          <button type="button" className={`${collabButton} min-w-11`} aria-expanded={showExtraFilters} onClick={() => setMoreFiltersOpen((open) => !open)}>{showExtraFilters ? bt("조건 접기", "Fewer conditions") : bt("조건 더 고르기", "More conditions")}</button>
          <button type="button" className={`${collabButton} min-w-11`} disabled={!hasFilters} onClick={resetFilters}>{bt("검색 조건 초기화", "Reset filters")}</button>
        </div>
      </div>
      <div className="mt-1 grid gap-3 sm:grid-cols-2">{choices.slice(0, 2).map(renderChoice)}</div>
      {showExtraFilters && <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{choices.slice(2).map(renderChoice)}</div>}
    </div>}
    {error && (postId || page
      ? <CollabNotice error>{error}<button type="button" className={`${collabButton} ml-3 min-w-11`} onClick={() => setRetry((value) => value + 1)}>{bt("다시 불러오기", "Reload")}</button></CollabNotice>
      : <PositionsUnavailable message={error} onRetry={() => setRetry((value) => value + 1)} />)}
    {loading && <div role="status" aria-label={bt("모집 조건을 불러오는 중", "Loading positions")} className="grid gap-4 md:grid-cols-2" aria-hidden="true"><div className="skeleton h-44 rounded-xl" /><div className="skeleton h-44 rounded-xl" /></div>}
    {page && <p role="status" className="text-sm text-fg-3">{bt(`${cursors.length}페이지 · 이 페이지 ${page.items.length}개 · 한 번에 최대 30개`, `Page ${cursors.length} · ${page.items.length} items on this page · up to 30 per page`)}</p>}
    {page?.items.length === 0 && (
      <ActionableEmptyState
        icon={BriefcaseBusiness}
        art="search"
        title={bt("이 조건에 맞는 공개 모집 자리가 없어요.", "No open positions match these filters.")}
        description={postId
          ? bt("이 공고에는 아직 공개된 모집 자리가 없어요. 게시판에서 다른 공고를 둘러보거나 직접 공고를 올려 보세요.", "This post has no public seats yet. Browse other posts on the board, or post your own gig.")
          : bt("조건을 완화하거나 직접 공고를 올려 필요한 작업자를 찾아보세요.", "Try loosening the filters, or post your own gig to find the collaborator you need.")}
        primary={{ href: "/collaborate/new", label: bt("공고 등록하기", "Post a gig") }}
        secondary={{ href: "/collaborate", label: bt("게시판 전체 공고 보기", "Browse all posts") }}
      >
        {/* 필터는 화면 상태라 같은 주소 링크로는 풀리지 않는다. 실제로 조건을 푸는 버튼을 둔다. */}
        {hasFilters ? <button type="button" className={`${collabButton} min-w-11`} onClick={resetFilters}>{bt("조건 모두 풀고 다시 보기", "Clear all conditions")}</button> : null}
      </ActionableEmptyState>
    )}
    {page && page.items.length > 0 && <div className="grid gap-4 lg:grid-cols-2">{page.items.map((position) => <article key={position.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-accent/45">
      <p className="text-xs font-semibold text-accent">{bt(`1명 모집 · 조건 버전 ${position.revision}`, `Hiring 1 · terms v${position.revision}`)}</p>
      <h2 className="text-lg font-bold leading-snug text-fg [overflow-wrap:anywhere] break-words">{position.postTitle}</h2>
      <HiringTermsView terms={position.terms} />
      <Link className={`${collabButton} mt-auto min-w-11 self-start`} href={`/collaborate/${position.postId}`}>{bt("원래 공고에서 확인·지원", "View & apply on the original post")}</Link>
    </article>)}</div>}
    {(cursors.length > 1 || hasNext) && <nav className="flex flex-wrap gap-3" aria-label={bt("모집 조건 페이지 이동", "Position pages")}>
      <button type="button" className={`${collabButton} min-w-11`} disabled={loading || cursors.length === 1} onClick={() => setCursors((values) => values.slice(0, -1))}>{bt("이전 페이지", "Previous")}</button>
      {cursors.length > 1 && <button type="button" className={`${collabButton} min-w-11`} disabled={loading} onClick={() => setCursors([null])}>{bt("처음으로", "First")}</button>}
      <button type="button" className={`${collabButton} min-w-11`} disabled={loading || !hasNext} onClick={() => { if (next && hasNext) setCursors((values) => [...values, next]); }}>{bt("다음 페이지", "Next")}</button>
    </nav>}
  </section>;
}

/** 조건 검색 목록을 불러오지 못했을 때: 이유·재시도와 함께 게시판·공고 작성으로 이어 준다. */
function PositionsUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  const bt = useBilingual(SCOPE);
  return <section role="alert" aria-labelledby="positions-unavailable-title" className="rounded-3xl border border-warn/35 bg-gradient-to-br from-warn/10 via-panel to-panel p-6 sm:p-8">
    <CloudOff size={28} className="text-warn" aria-hidden="true" />
    <h2 id="positions-unavailable-title" className="mt-3 text-lg font-bold text-fg">{bt("모집 자리를 지금 불러올 수 없어요", "Can't load open seats right now")}</h2>
    <p className="mt-2 max-w-2xl text-sm leading-7 text-fg-2">{message}</p>
    <p className="mt-1 max-w-2xl text-sm leading-7 text-fg-3">{bt("고른 조건은 그대로 두었어요. 연결되면 같은 조건으로 다시 찾을 수 있어요.", "Your conditions are kept. Retry with the same conditions once connected.")}</p>
    <div className="mt-5 flex flex-wrap gap-3" role="group" aria-label={bt("복구 및 이동 동작", "Recovery and navigation actions")}>
      <button type="button" onClick={onRetry} className={`${collabPrimary} min-w-11`}><RefreshCw size={16} aria-hidden="true" />{bt("다시 불러오기", "Reload")}</button>
      <Link href="/collaborate" className={`${collabButton} min-w-11`}>{bt("게시판으로 돌아가기", "Back to the board")}</Link>
    </div>
  </section>;
}

export function HiringPositionsPage() {
  const bt = useBilingual(SCOPE);
  const [rolePreset, setRolePreset] = useState<"lineart-assist" | "flat-colorist" | "bg3d-lt-artist" | "jp-en-typesetter">("lineart-assist");
  const [cutCountBudget, setCutCountBudget] = useState<60 | 70 | 85>(70);
  useDocumentTitle(bt("모집 조건으로 찾기 · 구인·의뢰", "Find by hiring terms · Gigs"));
  const roleRates = {
    "lineart-assist": { ko: "선화·펜터치 어시 (평균 12,000원/컷)", en: "Line-art assist (avg 12,000 KRW/cut)", unitKrw: 12000 },
    "flat-colorist": { ko: "밑색·채색 어시 (평균 9,000원/컷)", en: "Flat/color assist (avg 9,000 KRW/cut)", unitKrw: 9000 },
    "bg3d-lt-artist": { ko: "3D 배경·6-Pass LT 배치 (평균 11,000원/컷)", en: "3D BG & 6-Pass LT (avg 11,000 KRW/cut)", unitKrw: 11000 },
    "jp-en-typesetter": { ko: "한·일·영 다국어 식자·리드로잉 (평균 6,500원/컷)", en: "KR/JP/EN Typesetting (avg 6,500 KRW/cut)", unitKrw: 6500 },
  } as const;
  const activeRate = roleRates[rolePreset];
  const episodeTotalKrw = activeRate.unitKrw * cutCountBudget;
  return <Container className="space-y-6 py-8 sm:py-12 [&_button]:min-h-11 [&_button]:min-w-11 [&_input:not([type=checkbox]):not([type=radio]):not([type=range])]:min-h-11 [&_select]:min-h-11">
    <header data-own-control-size="" className="rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/10 via-panel to-canvas p-6 sm:p-8">
      <Link href="/collaborate" className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><ArrowLeft size={16} aria-hidden="true" />{bt("구인·의뢰 게시판", "Gigs board")}</Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-4xl [overflow-wrap:anywhere]">{bt("모집 조건으로 찾기", "Find by hiring terms")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base">{bt("공고의 각 모집 자리를 역할·도구·보수로 찾아보세요. 공개 중인 자리만 표시하며 기존 공고에서 지원합니다.", "Search open seats by role, tools, and compensation. Only public seats are shown; apply from the original post.")}</p>
      <div className="mt-5 flex flex-wrap gap-3"><Link href="/collaborate/new" className={`${collabPrimary} min-w-11`}><Plus size={17} aria-hidden="true" />{bt("모집 글 올리기", "Post a gig")}</Link></div>
    </header>
    <section
      data-own-control-size=""
      aria-label={bt("REA 직무별 표준 단가 및 3단계 에스크로 시뮬레이터", "REA Role Rate & 3-Stage Escrow Simulator")}
      data-testid="hiring-rea-rate-escrow-bar"
      className="rounded-2xl border border-line bg-card/85 p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-extrabold text-fg">
          {bt("ArtStation · Wantedly · Contra · 크레페 · KOCCA 표준 직무 단가 & 3단계 에스크로 계산기", "ArtStation / Wantedly / Contra / Crepe / KOCCA Standard Rate & 3-Stage Escrow Calculator")}
        </span>
        <span data-testid="hiring-rea-rate-escrow-status" className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
          {bt(`${cutCountBudget}컷 총액 ${episodeTotalKrw.toLocaleString("ko-KR")}원 · 착수30%(${(episodeTotalKrw * 0.3).toLocaleString("ko-KR")}원)/검수30%/납품40%`, `${cutCountBudget} cuts total ${episodeTotalKrw.toLocaleString("en-US")} KRW · 30%/30%/40% Escrow`)}
        </span>
      </div>
      <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap" role="group" aria-label={bt("직무 단가 프리셋", "Role rate presets")}>
          {(Object.keys(roleRates) as (keyof typeof roleRates)[]).map((key) => (
            <button
              key={key}
              type="button"
              data-testid={`hiring-rea-role-${key}`}
              aria-pressed={rolePreset === key}
              onClick={() => setRolePreset(key)}
              className={`inline-flex min-h-11 min-w-11 items-center justify-start rounded-xl border px-3.5 py-2 text-left text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:justify-center sm:text-center ${rolePreset === key ? "border-accent bg-accent text-on-accent" : "border-line bg-panel text-fg-2 hover:border-accent/50"}`}
            >
              {bt(roleRates[key].ko, roleRates[key].en)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center" role="group" aria-label={bt("회차 기준 컷수", "Episode cut count")}>
          {([60, 70, 85] as const).map((cnt) => (
            <button
              key={cnt}
              type="button"
              data-testid={`hiring-rea-cuts-${cnt}`}
              aria-pressed={cutCountBudget === cnt}
              onClick={() => setCutCountBudget(cnt)}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${cutCountBudget === cnt ? "border-accent bg-accent/15 text-accent" : "border-line bg-panel text-fg-3 hover:border-accent/50"}`}
            >
              {bt(`${cnt}컷`, `${cnt} cuts`)}
            </button>
          ))}
        </div>
      </div>
    </section>
    <HiringPublicPositions />
    <WebtoonAssistantOutsourcingSuite />
    <CollaborationStepConfirmSpecSuite />
  </Container>;
}
