import { BookmarkCheck, ChevronDown, Compass, Gauge, NotebookPen } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import type { ChangeEvent, SyntheticEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { RESOURCE_BUTTON } from "./navigation";
import { ProviderStatus } from "./ProviderStatus";
import { ResearchCategoryTiles, ResearchRecipeRail } from "./ResearchCatalog";
import { ResearchCoverageMap } from "./ResearchCoverageMap";
import { ResearchFocusPanel, ResearchNextActionCard } from "./ResearchFocusPanel";
import { ResearchSceneStudy } from "./ResearchSceneStudy";
import { ResearchSearchPanel } from "./ResearchSearchPanel";
import { ResearchSynthesisBoard } from "./ResearchSynthesisBoard";
import {
  buildResearchBriefMarkdown,
  researchNextAction,
  researchSearchHref,
  resourceLicenseLabel,
  sourceFreshness,
  summarizeResearchWorkspace,
} from "./research-dashboard";
import type { ResearchSearchMode } from "./research-dashboard";
import {
  recordResearchSearch,
  researchDeskBriefContext,
} from "./research-desk-session";
import { buildResearchNotebookMarkdown } from "./research-notebook";
import { MaterialSentencePanel } from "./material-hub/MaterialSentencePanel";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { SavedBoard } from "./SavedBoard";
import { useResearchDeskSession } from "./useResearchDeskSession";
import { useResearchNotebook } from "./useResearchNotebook";
import { downloadText, useCreatorWorkspace } from "./workspace";

import { SiteSectionTabs, SiteTabPanel, type SiteSectionTab } from "@/domains/legal/public/site-section-tabs";
import { useSiteTabAnchors, useSiteTabs } from "@/domains/legal/public/site-tabs";
import { SiteRail } from "@/domains/legal/public/site-rail";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  useBilingual,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import type { CreatorResource } from "@/shared/lib/creator-resources";

import { attributionMarkdown, deadlineLabel, parseWorkspace } from "@/shared/lib/creator-resources";

const SCOPE = "domains.creator.resources.CreatorHubPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);

type DeskTab = "overview" | "focus" | "notes" | "board";
const DESK_TABS: readonly DeskTab[] = ["overview", "focus", "notes", "board"];
const TAB_PREFIX = "research-desk";

/** 예전 섹션 앵커(공유 링크·다음 행동)를 해당 탭으로 연다. */
const HASH_TABS: Readonly<Record<string, DeskTab>> = {
  "#workspace-overview": "overview",
  "#research-coverage": "overview",
  "#research-focus": "focus",
  "#research-synthesis": "notes",
  "#saved-board": "board",
  "#research-export": "board",
};

interface StageResourceRecommendation {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly links: ReadonlyArray<{
    readonly titleKo: string;
    readonly titleEn: string;
    readonly badgeKo: string;
    readonly badgeEn: string;
    readonly href: string;
  }>;
}

const STAGE_RESOURCE_RECOMMENDATIONS: readonly StageResourceRecommendation[] = [
  {
    id: "planning",
    labelKo: "기획·취재",
    labelEn: "Planning & Research",
    summaryKo: "세계관·시대 고증 자료와 판본·공공 데이터를 모으고 작품 기획서를 다듬는 단계입니다.",
    summaryEn: "Gather historical/worldbuilding sources, editions, and public datasets to refine your story plan.",
    links: [
      { titleKo: "시대·복식·건축 고증 자료실", titleEn: "Historical & Costume Archive", badgeKo: "고증 DB", badgeEn: "Reference DB", href: "/research/assets" },
      { titleKo: "도서·글로벌 판본 아카이브", titleEn: "Books & Editions", badgeKo: "문헌 DB", badgeEn: "Books DB", href: "/research/books" },
      { titleKo: "작품 기획·회차 구조", titleEn: "Story Planner", badgeKo: "기획 도구", badgeEn: "Planner", href: "/research/story" },
    ],
  },
  {
    id: "storyboard",
    labelKo: "콘티·구도",
    labelEn: "Storyboard & Framing",
    summaryKo: "세로 스크롤 시선 유도와 컷 분할, 캐릭터 앵글·포즈 구도를 빠르게 잡는 단계입니다.",
    summaryEn: "Establish vertical scroll pacing, panel splits, and camera/character framing.",
    links: [
      { titleKo: "에피소드 콘티 플래너", titleEn: "Episode Storyboard", badgeKo: "Studio 도구", badgeEn: "Studio Tool", href: "/studio/episode" },
      { titleKo: "포즈·손·표정 마스터 랩", titleEn: "Pose & Hand Lab", badgeKo: "드로잉 보조", badgeEn: "Drawing Aid", href: "/studio/pose" },
      { titleKo: "세로 스크롤 원고 템플릿", titleEn: "Vertical Scroll Templates", badgeKo: "마켓 소재", badgeEn: "Market Asset", href: "/market/browse?kind=template" },
    ],
  },
  {
    id: "lineart",
    labelKo: "선화·브러시",
    labelEn: "Line Art & Brushes",
    summaryKo: "필압 G펜·먹선 브러시를 고르고 손떨림 보정과 벡터 선화로 펜선을 완성하는 단계입니다.",
    summaryEn: "Select G-pen/ink brushes and finish crisp line art with stabilization and vector strokes.",
    links: [
      { titleKo: "웹툰 원고 작화 캔버스", titleEn: "Manuscript Canvas", badgeKo: "Studio 캔버스", badgeEn: "Studio Canvas", href: "/studio" },
      { titleKo: "선화·펜 브러시 카탈로그", titleEn: "Line-Art Brushes", badgeKo: "마켓 브러시", badgeEn: "Market Brushes", href: "/market/browse?kind=brush" },
      { titleKo: "원고 위 브러시 시험 (Fit Lab)", titleEn: "Fit Lab Preview", badgeKo: "호환 시험", badgeEn: "Fit Lab", href: "/market/fit-lab" },
    ],
  },
  {
    id: "bg3d",
    labelKo: "3D·배경",
    labelEn: "3D & Backgrounds",
    summaryKo: "CC0 3D 모델·HDRI 조명과 배경 세트를 배치하고 은선(Line Extraction)으로 컷 배경을 추출합니다.",
    summaryEn: "Place CC0 3D models, HDRI lighting, and stage sets, then extract line-art backgrounds.",
    links: [
      { titleKo: "CC0 3D 모델·HDRI 탐색", titleEn: "CC0 3D & HDRI", badgeKo: "무료 3D DB", badgeEn: "Free 3D DB", href: "/research/3d-assets" },
      { titleKo: "3D 배경 스테이지 조립", titleEn: "3D Background Stage", badgeKo: "Studio 3D", badgeEn: "Studio 3D", href: "/studio/bg3d" },
      { titleKo: "3D 배경·소품 마켓", titleEn: "3D Market Assets", badgeKo: "마켓 3D", badgeEn: "Market 3D", href: "/market/browse?kind=3d-asset" },
    ],
  },
  {
    id: "coloring",
    labelKo: "채색·후보정",
    labelEn: "Coloring & Retouch",
    summaryKo: "밑색 채우기와 클리핑 음영, 시간대별 조명 팔레트·분위기 필터로 작화 밀도를 높입니다.",
    summaryEn: "Apply flat fills, clipping shadows, time-of-day palettes, and atmosphere LUT filters.",
    links: [
      { titleKo: "배색·조명 팔레트 소재", titleEn: "Color & Lighting Palettes", badgeKo: "마켓 팔레트", badgeEn: "Palettes", href: "/market/browse?kind=palette" },
      { titleKo: "분위기 보정 필터·텍스처", titleEn: "Mood Filters & Textures", badgeKo: "마켓 보정", badgeEn: "Filters", href: "/market/browse?kind=filter" },
      { titleKo: "캐릭터 지정색 시트 관리", titleEn: "Character Color Sheets", badgeKo: "Studio 도구", badgeEn: "Studio Tool", href: "/studio/characters" },
    ],
  },
  {
    id: "lettering",
    labelKo: "식자·편집",
    labelEn: "Lettering & Editing",
    summaryKo: "상업용 무료 한글 폰트와 대사 말풍선·효과음을 얹고 플랫폼 규격으로 검수·발행합니다.",
    summaryEn: "Add commercial-free Korean fonts, dialogue balloons, and SFX, then run preflight checks.",
    links: [
      { titleKo: "상업 이용 가능 폰트·레터링", titleEn: "Commercial-Free Fonts", badgeKo: "폰트 DB", badgeEn: "Font DB", href: "/research/fonts" },
      { titleKo: "출하 전 권리·규격 체크리스트", titleEn: "Preflight Checklist", badgeKo: "검수 도구", badgeEn: "Preflight", href: "/research/checklist" },
      { titleKo: "연재 원고 내보내기 (Export)", titleEn: "Manuscript Export", badgeKo: "Studio 출고", badgeEn: "Studio Export", href: "/studio/export" },
    ],
  },
] as const;

export interface CreatorHubPageProps {
  /**
   * 앱 계층이 주입하는 선택 기능. 문장 허브에서 사용자가 "AI로 다듬기"를 눌렀을 때만 호출된다.
   * 풀어쓸 수 없으면 null 을 돌려주고, 그러면 규칙 기반 해석을 그대로 둔다.
   */
  readonly refineMaterialSentence?: (sentence: string, signal: AbortSignal) => Promise<string | null>;
}

export function CreatorHubPage({ refineMaterialSentence }: CreatorHubPageProps = {}) {
  useBilingualI18nRevision();
  const bt = useBilingual("CreatorHubPage");
  const navigate = useNavigate();
  const { hash } = useLocation();
  const {
    workspace,
    update: updateWorkspace,
    restore,
    readSnapshot,
    ready,
    writable,
    saving,
    error,
  } = useCreatorWorkspace();
  const {
    session: researchSession,
    update: updateResearchSession,
    reset: resetResearchSession,
    ready: researchSessionReady,
    writable: researchSessionWritable,
    error: researchSessionError,
  } = useResearchDeskSession();
  const {
    notebook: researchNotebook,
    update: updateResearchNotebook,
    restore: restoreResearchNotebook,
    reset: resetResearchNotebook,
    ready: researchNotebookReady,
    writable: researchNotebookWritable,
    error: researchNotebookError,
  } = useResearchNotebook();
  const { value: activeTab, select: selectTab, isMounted } = useSiteTabs({ ids: DESK_TABS, fallback: "overview", param: "view" });
  const [providerStatusOpen, setProviderStatusOpen] = useState(false);
  // 예전 공유 링크(#research-coverage)는 접힌 "자세히" 안의 근거 공백 지도를 가리키므로 펼친 채로 연다.
  const [checksOpen, setChecksOpen] = useState(() => hash === "#research-coverage");
  // 첫 방문(아직 아무것도 안 한 상태) 가이드는 펼쳐 둔 채로 시작하고, 사용자가 접으면 그 선택을 존중한다.
  const [guideOpen, setGuideOpen] = useState(true);
  const [selectedStageId, setSelectedStageId] = useState<string>("planning");
  const activeStageRec =
    STAGE_RESOURCE_RECOMMENDATIONS.find((item) => item.id === selectedStageId) ??
    STAGE_RESOURCE_RECOMMENDATIONS[0]!;
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [restoring, setRestoring] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const summary = useMemo(() => summarizeResearchWorkspace(workspace), [workspace]);
  const nextAction = useMemo(() => researchNextAction(summary), [summary]);
  const briefContext = useMemo(() => researchDeskBriefContext(researchSession), [researchSession]);
  const recentItems = workspace.saved.slice(-3).reverse();
  // 아직 아무것도 하지 않은 첫 방문에는 0으로 채운 통계 대신 다음 행동만 보여 준다.
  const briefIsEmpty = !workspace.saved.length && summary.storyCompleted === 0 && !researchSession.title
    && !researchSession.question && !researchSession.context && !researchSession.history.length && !researchNotebook.entries.length;

  const { openAnchor } = useSiteTabAnchors(HASH_TABS, activeTab, selectTab);

  const launchSearch = useCallback((mode: ResearchSearchMode, query: string) => {
    updateResearchSession((session) => recordResearchSearch(session, mode, query));
    navigate(researchSearchHref(mode, query));
  }, [navigate, updateResearchSession]);

  // 문장 허브에서 고른 자료를 기존 검색 화면과 같은 규칙으로 장면 보드에 담거나 뺀다.
  const toggleSavedResource = useCallback((item: CreatorResource) => {
    void updateWorkspace((value) => {
      const remove = value.saved.some((saved) => saved.id === item.id);
      return { ...value, saved: remove ? value.saved.filter((saved) => saved.id !== item.id) : [...value.saved, item] };
    });
  }, [updateWorkspace]);

  const exportResearchBrief = () => {
    const brief = buildResearchBriefMarkdown(workspace, new Date(), briefContext);
    const synthesis = buildResearchNotebookMarkdown(researchNotebook, workspace.saved);
    downloadText("toonstudio-research-brief.md", [brief, synthesis].filter(Boolean).join("\n\n"));
  };

  const importBackup = async (file: File | undefined) => {
    if (!file || restoring || saving) return;
    setRestoring(true);
    const mode = restoreMode;
    try {
      if (file.size > 1_000_000) throw new Error(tx("1 MB 이하의 백업을 선택하세요."));
      const raw = await file.text();
      parseWorkspace(raw);
      const expectedRaw = mode === "replace" ? readSnapshot() : undefined;
      const question = mode === "merge"
        ? tx("현재 자료와 작성한 기획서는 유지하고, 백업의 새 자료·빈 기획 항목·체크 항목을 합칠까요?")
        : tx("현재 창작 보드·기획서·체크리스트를 모두 이 백업으로 대체할까요? 먼저 현재 보드를 백업하는 것을 권장합니다.");
      if (!window.confirm(question)) return;
      if (await restore(raw, mode, expectedRaw)) {
        setImportNotice(tx(mode === "merge" ? "현재 작업을 유지하고 백업을 합쳤습니다." : "백업으로 보드를 대체했습니다."));
      }
    } catch (cause) {
      setImportNotice(cause instanceof Error ? cause.message : tx("백업을 읽지 못했습니다."));
    } finally {
      setRestoring(false);
    }
  };

  const deskTabs: readonly SiteSectionTab<DeskTab>[] = [
    { id: "overview", icon: Gauge, label: bt("진행 현황", "Progress") },
    { id: "focus", icon: Compass, label: bt("리서치 초점", "Focus") },
    { id: "notes", icon: NotebookPen, label: bt("판단 노트", "Notes"), badge: researchNotebook.entries.length || undefined },
    { id: "board", icon: BookmarkCheck, label: bt("저장 보드", "Saved board"), badge: summary.savedCount || undefined },
  ];

  return <ResourceLayout
    title={tx("창작 리서치 데스크")}
    intro={bt("장면에 필요한 레퍼런스·3D 재료·폰트·고증 자료를 출처와 함께 찾고, 저장한 근거를 제작으로 이어 가요.", "Find references, 3D materials, fonts and period sources for your scenes, then carry the evidence into production.")}
    width="wide"
    menu={false}
    heroContent={<ResearchSearchPanel session={researchSession} onSessionChange={updateResearchSession} onSearch={launchSearch} />}
    heroAside={<div className="hidden lg:block"><ResearchSceneStudy /></div>}
  >
    <MaterialSentencePanel saved={workspace.saved} saveDisabled={!ready || !writable || saving} onToggleSaved={toggleSavedResource} refineSentence={refineMaterialSentence} />
    <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5" aria-label={bt("리서치 표면 안내", "Which research surface am I on?")}>
      <p className="text-sm leading-6 text-fg-2 break-keep">
        <strong className="text-fg">{bt("여기는 리서치 데스크", "This is the Research Desk")}</strong>
        {bt(" — 장면에 쓸 자료를 출처와 함께 찾고, 저장하고, 판단 노트로 이어 가는 작업공간이에요. 수록 작품의 장르·소재 분포와 비교는 여기가 아니라 작품 리서치 랩에서 봐요.", " — the workspace for finding sources for a scene, saving them with their provenance, and carrying them into your notes. Genre and motif distribution and title comparison live in the Catalog Research Lab, not here.")}
      </p>
      <Link to="/research/catalog" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        {bt("작품 메타데이터를 비교하려면 작품 리서치 랩으로 →", "Compare title metadata in the Catalog Research Lab →")}
      </Link>
    </section>
    <section
      data-research-stage-recommender="true"
      aria-labelledby="research-stage-recommender-heading"
      className="rounded-2xl border border-accent/30 bg-panel p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-accent">STAGE-GUIDED RESOURCES</p>
          <h2 id="research-stage-recommender-heading" className="mt-0.5 text-base font-bold text-fg sm:text-lg">
            {bt("지금 어느 작업 단계이신가요? 공정별 맞춤 리소스 추천", "Which stage are you on? Stage-tailored resource recommendations")}
          </h2>
        </div>
        <div
          role="group"
          aria-label={bt("작업 공정 선택", "Select production stage")}
          className="flex flex-wrap gap-1.5"
        >
          {STAGE_RESOURCE_RECOMMENDATIONS.map((stage) => {
            const active = stage.id === activeStageRec.id;
            return (
              <button
                key={stage.id}
                type="button"
                aria-pressed={active}
                data-stage-selector={stage.id}
                onClick={() => setSelectedStageId(stage.id)}
                className={`inline-flex min-h-9 items-center rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-canvas text-fg-2 hover:border-accent/50 hover:text-fg"
                }`}
              >
                {bt(stage.labelKo, stage.labelEn)}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2.5 text-xs leading-5 text-fg-2">
        {bt(activeStageRec.summaryKo, activeStageRec.summaryEn)}
      </p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        {activeStageRec.links.map((linkItem) => (
          <Link
            key={linkItem.href}
            to={linkItem.href}
            className="flex items-center justify-between gap-2 rounded-xl border border-line bg-canvas p-3 text-sm font-semibold text-fg transition-colors hover:border-accent/60 hover:text-accent"
          >
            <span>{bt(linkItem.titleKo, linkItem.titleEn)}</span>
            <span className="shrink-0 rounded-full border border-accent/35 bg-accent-soft/20 px-2 py-0.5 text-[11px] font-bold text-accent">
              {bt(linkItem.badgeKo, linkItem.badgeEn)}
            </span>
          </Link>
        ))}
      </div>
    </section>
    <ResearchCategoryTiles summary={summary} />
    <ResearchRecipeRail />

    <section id="research-workspace" className="scroll-mt-24 space-y-4" aria-labelledby="research-workspace-title">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-accent">MY RESEARCH</p>
          <h2 id="research-workspace-title" className="mt-1 text-xl font-bold sm:text-2xl">{bt("내 리서치 작업공간", "My research workspace")}</h2>
        </div>
        <p className="text-sm text-fg-2">{bt("자동 평점이 아니라 다음 행동을 고르기 위한 사실 요약입니다.", "A factual summary to pick your next step, not an automatic score.")}</p>
      </header>
      {briefIsEmpty && <details className="group rounded-2xl border border-accent/40 bg-panel" open={guideOpen} onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setGuideOpen(event.currentTarget.open)}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          {bt("장면으로 시작하기 · 처음이면 이 3단계로", "Start from a scene · first time? Follow these 3 steps")}
          <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-accent transition-transform group-open:rotate-180" />
        </summary>
        <ol className="grid gap-3 border-t border-line p-4 sm:grid-cols-3 sm:p-5">
          <li className="rounded-xl bg-canvas p-4">
            <p className="text-xs font-bold text-accent">01</p>
            <p className="mt-1 font-bold">{bt("장면 고르기", "Pick a scene")}</p>
            <p className="mt-1 text-sm leading-6 text-fg-2 break-keep">{bt("어떤 장면에 쓸 자료인지 먼저 정해요. 리서치 초점에 장면 이름과 핵심 질문을 적으면 검색이 흔들리지 않아요.", "Decide which scene the material is for first. Naming the scene and its key question in Research Focus keeps your searching on track.")}</p>
            <button type="button" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => selectTab("focus")}>{bt("리서치 초점 적기 →", "Write your research focus →")}</button>
          </li>
          <li className="rounded-xl bg-canvas p-4">
            <p className="text-xs font-bold text-accent">02</p>
            <p className="mt-1 font-bold">{bt("자료 찾기", "Find sources")}</p>
            <p className="mt-1 text-sm leading-6 text-fg-2 break-keep">{bt("위쪽 검색이나 카테고리 타일에서 장면에 맞는 자료를 찾고, 출처와 이용조건을 확인한 것만 저장해요.", "Use the search or the category tiles above to find material for the scene, and save only what you have checked for source and usage terms.")}</p>
          </li>
          <li className="rounded-xl bg-canvas p-4">
            <p className="text-xs font-bold text-accent">03</p>
            <p className="mt-1 font-bold">{bt("노트에 붙이기", "Attach it to a note")}</p>
            <p className="mt-1 text-sm leading-6 text-fg-2 break-keep">{bt("저장한 자료는 판단 노트에 붙여 왜 이 자료를 쓰는지 남겨요. 그 노트가 다음 제작의 근거가 돼요.", "Attach saved sources to a judgement note saying why you chose them. That note becomes the evidence behind your next production step.")}</p>
            <button type="button" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => selectTab("notes")}>{bt("판단 노트 열기 →", "Open judgement notes →")}</button>
          </li>
        </ol>
      </details>}
      <SiteSectionTabs tabs={deskTabs} value={activeTab} onChange={selectTab} label={bt("리서치 데스크 작업 영역", "Research desk workspace")} idPrefix={TAB_PREFIX} />

      <SiteTabPanel idPrefix={TAB_PREFIX} id="overview" active={activeTab === "overview"} mounted={isMounted("overview")} className="space-y-4">
        <ResearchNextActionCard action={nextAction} summary={summary} onAnchor={openAnchor} />
        {briefIsEmpty ? <p id="workspace-overview" className="scroll-mt-24 rounded-2xl border border-dashed border-line bg-panel/50 p-4 text-sm leading-6 text-fg-2 break-keep">
          {bt("자료를 저장하거나 리서치 초점·기획을 적으면 저장 자료·기획·마감 현황이 여기에 쌓여요.", "Save a source or write a focus or plan and your progress will build up here.")}
        </p> : <>
          <section id="workspace-overview" className="scroll-mt-24" aria-labelledby="workspace-overview-title">
            <h3 id="workspace-overview-title" className="sr-only">{tx("한눈에 보는 리서치 상태")}</h3>
            <dl className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              <div className="rounded-2xl border border-line bg-panel p-4"><dt className="text-sm text-fg-2">{tx("저장한 자료")}</dt><dd className="mt-1 text-2xl font-bold">{summary.savedCount}<span className="ml-1 text-sm font-semibold">{tx("개")}</span></dd></div>
              <div className="rounded-2xl border border-line bg-panel p-4"><dt className="text-sm text-fg-2">{tx("자료 제공처")}</dt><dd className="mt-1 text-2xl font-bold">{summary.providerCount}<span className="ml-1 text-sm font-semibold">{tx("곳")}</span></dd></div>
              <div className="rounded-2xl border border-line bg-panel p-4"><dt className="text-sm text-fg-2">{tx("작성한 기획")}</dt><dd className="mt-1 text-2xl font-bold">{summary.storyCompleted}<span className="mx-1 text-sm font-semibold">/</span><span className="text-lg">{summary.storyTotal}</span></dd></div>
              <div className="rounded-2xl border border-line bg-panel p-4"><dt className="text-sm text-fg-2">{tx("다가오는 마감")}</dt><dd className="mt-1 text-2xl font-bold">{summary.upcomingDeadlineCount}<span className="ml-1 text-sm font-semibold">{tx("개")}</span></dd><dd className="mt-1 truncate text-sm text-fg-2">{summary.nearestDeadline ? `${tx(deadlineLabel(summary.nearestDeadline.deadline))} · ${summary.nearestDeadline.title}` : tx("확인된 예정 마감 없음")}</dd></div>
            </dl>
          </section>
          {recentItems.length ? <section className="space-y-3 rounded-2xl border border-line bg-panel p-4 sm:p-5" aria-labelledby="recent-research-title">
            <header className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-accent">{tx("최근 저장")}</p><h3 id="recent-research-title" className="mt-1 text-lg font-bold">{tx("다시 볼 자료")}</h3></div><button type="button" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => selectTab("board")}>{tx("전체 보드 점검")} →</button></header>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">{recentItems.map((item) => {
              const freshness = sourceFreshness(item);
              return <article key={item.id} className="min-w-0 overflow-hidden rounded-xl border border-line bg-canvas">
                {item.imageUrl && <div className="aspect-[4/3] overflow-hidden border-b border-line bg-card"><img src={item.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" /></div>}
                <div className="p-2.5 sm:p-3"><p className="truncate text-xs text-accent">{tx(resourceLicenseLabel(item.license))}</p><h4 className="mt-1 line-clamp-2 break-words text-sm font-bold">{item.title}</h4><p className={`mt-1 text-xs ${freshness.needsReview ? "font-semibold text-fg" : "text-fg-2"}`}>{tx(freshness.label)}</p><a className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{tx("원문 다시 보기 ↗")}</a></div>
              </article>;
            })}</div>
          </section> : null}
        </>}
        <details className="group rounded-2xl border border-line bg-panel" open={checksOpen} onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setChecksOpen(event.currentTarget.open)}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            {bt("리서치 흐름·근거 공백·출처 점검 자세히", "Flow, evidence gaps and source checks")}
            <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-accent transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-6 border-t border-line p-4 sm:p-5">
            <SiteRail label={tx("리서치 권장 흐름")} columns="sm:grid-cols-2 xl:grid-cols-4">
              {summary.stages.map((stage, index) => <article key={stage.id} className={`flex w-full flex-col rounded-2xl border p-4 ${stage.status === "current" ? "border-accent bg-accent-soft" : "border-line bg-canvas"}`}>
                <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-accent">0{index + 1}</span><span className="text-xs font-semibold text-fg-2">{stage.status === "complete" ? tx("완료") : stage.status === "current" ? tx("지금 단계") : tx("다음 단계")}</span></div>
                <h4 className="mt-2 font-bold">{tx(stage.label)}</h4>
                <p className="mt-1 flex-1 text-sm leading-6 text-fg-2">{tx(stage.description)}</p>
                <p className="mt-2 text-xs font-semibold text-fg">{formatI18nTemplate(tx("기준 · {v0}"), { v0: tx(stage.criterion) })}</p>
              </article>)}
            </SiteRail>
            <div id="research-coverage" className="scroll-mt-24"><ResearchCoverageMap summary={summary} onAnchor={openAnchor} /></div>
            <section className="space-y-3" aria-labelledby="research-rights-title">
              <header><p className="text-sm font-semibold text-accent">{tx("출처·이용조건")}</p><h3 id="research-rights-title" className="mt-1 text-lg font-bold">{tx("보드 점검")}</h3></header>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-canvas p-3"><dt className="text-xs text-fg-2">{tx("CC0로 확인된 자료")}</dt><dd className="mt-1 font-bold">{formatI18nTemplate(tx("{v0}개"), { v0: summary.publicDomainCount })}</dd></div>
                <div className="rounded-xl bg-canvas p-3"><dt className="text-xs text-fg-2">{tx("원문 이용조건 확인 필요")}</dt><dd className="mt-1 font-bold">{formatI18nTemplate(tx("{v0}개"), { v0: summary.rightsReviewCount })}</dd></div>
                <div className="rounded-xl bg-canvas p-3"><dt className="text-xs text-fg-2">{tx("조회일 재확인 권장")}</dt><dd className="mt-1 font-bold">{formatI18nTemplate(tx("{v0}개"), { v0: summary.staleCount })}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2" aria-label={tx("저장 자료 제공처 분포")}>
                {summary.providerBreakdown.map((entry) => <span key={entry.provider} className="rounded-full border border-line bg-canvas px-3 py-1 text-xs">{formatI18nTemplate(tx("{v0} · {v1}"), { v0: entry.label, v1: entry.count })}</span>)}
                {!summary.providerBreakdown.length && <span className="text-sm text-fg-2">{tx("저장 자료가 생기면 제공처 분포가 표시됩니다.")}</span>}
              </div>
              <p className="text-xs leading-5 text-fg-2">{tx("지원공고는 7일, 도서·미술 메타데이터는 제공처별 90~180일을 기준으로 재확인을 권장합니다. 이는 원문 변경 가능성을 알리는 작업 기준입니다.")}</p>
            </section>
            <details className="rounded-xl border border-line bg-canvas p-4" onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setProviderStatusOpen(event.currentTarget.open)}>
              <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{tx("데이터 제공처 연결 상태와 한계 확인")}</summary>
              <p className="mt-2 text-sm leading-6 text-fg-2">{tx("검색 전에 인증키 설정 여부를 확인할 수 있습니다. 실제 연결 성공·이용권한·잔여 쿼터는 각 검색 결과와 원문에서 판단해야 합니다.")}</p>
              {providerStatusOpen && <div className="mt-4"><ProviderStatus /></div>}
            </details>
          </div>
        </details>
      </SiteTabPanel>

      <SiteTabPanel idPrefix={TAB_PREFIX} id="focus" active={activeTab === "focus"} mounted={isMounted("focus")}>
        <div id="research-focus" className="scroll-mt-24">
          <ResearchFocusPanel
            session={researchSession}
            sessionReady={researchSessionReady}
            sessionWritable={researchSessionWritable}
            sessionError={researchSessionError}
            onSessionChange={updateResearchSession}
            onSessionReset={resetResearchSession}
          />
        </div>
      </SiteTabPanel>

      <SiteTabPanel idPrefix={TAB_PREFIX} id="notes" active={activeTab === "notes"} mounted={isMounted("notes")}>
        <ResearchSynthesisBoard
          notebook={researchNotebook}
          resources={workspace.saved}
          ready={researchNotebookReady}
          writable={researchNotebookWritable}
          error={researchNotebookError}
          onChange={updateResearchNotebook}
          onReset={resetResearchNotebook}
          onRestore={restoreResearchNotebook}
          onInvestigate={(query) => launchSearch(researchSession.lastMode, query)}
        />
      </SiteTabPanel>

      <SiteTabPanel idPrefix={TAB_PREFIX} id="board" active={activeTab === "board"} mounted={isMounted("board")} className="space-y-6">
        <SavedBoard items={workspace.saved} disabled={!ready || !writable || saving} onRemove={(id) => {
          void updateWorkspace((value) => ({ ...value, saved: value.saved.filter((item) => item.id !== id) }));
        }} />
        <section id="research-export" className="scroll-mt-24 space-y-4 rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-labelledby="research-export-title">
          <header><p className="text-sm font-semibold text-accent">{tx("휴대·복구 가능한 기록")}</p><h3 id="research-export-title" className="mt-1 text-xl font-bold">{tx("내보내기와 백업")}</h3><p className="mt-2 text-sm leading-7 text-fg-2">{tx("리서치 초점·검색 기록·판단 노트·기획·출처를 읽기 쉬운 문서로 내보내거나, 자료·기획서 작업공간을 JSON으로 백업하세요.")}</p></header>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={RESOURCE_BUTTON} disabled={briefIsEmpty} onClick={exportResearchBrief}>{tx("리서치 브리프 내보내기")}</button>
            <button type="button" className={RESOURCE_BUTTON} disabled={!workspace.saved.length} onClick={() => downloadText("toonstudio-sources.md", attributionMarkdown(workspace.saved))}>{tx("출처 목록 내보내기")}</button>
            <button type="button" className={RESOURCE_BUTTON} onClick={() => downloadText("toonstudio-creator-board.json", JSON.stringify(workspace, null, 2), "application/json")}>{tx("자료·기획서 백업")}</button>
          </div>
          <details className="rounded-xl border border-line bg-canvas p-4">
            <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{tx("백업 가져오기 · 합치기 또는 완전 대체")}</summary>
            <div className="mt-4 space-y-4 border-t border-line pt-4">
              <p className="text-sm leading-6 text-fg-2">{tx("기본값은 현재 자료와 작성한 기획을 유지하는 안전한 합치기입니다. 완전 대체는 확인 후에만 실행됩니다.")}</p>
              <label htmlFor="creator-board-replace" className="flex min-h-11 items-center gap-3 text-sm">
                <input id="creator-board-replace" type="checkbox" disabled={!ready || !writable || restoring || saving} className="size-5" checked={restoreMode === "replace"} onChange={(event: ChangeEvent<HTMLInputElement>) => setRestoreMode(event.target.checked ? "replace" : "merge")} />
                {tx("현재 보드를 유지하지 않고 백업으로 완전히 대체")}
              </label>
              <label htmlFor="creator-board-import" className="block text-sm font-semibold">{restoreMode === "merge" ? tx("백업 합치기 · 현재 자료와 작성한 기획서 유지") : tx("백업 대체 · 현재 작업이 변경됩니다")}
                <input id="creator-board-import" className="mt-2 block max-w-full text-sm" type="file" disabled={!ready || !writable || restoring || saving} accept="application/json,.json" onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  void importBackup(event.target.files?.[0]);
                  event.target.value = "";
                }} />
              </label>
              <p role="status" className="text-sm text-fg-2">{importNotice}</p>
            </div>
          </details>
        </section>
      </SiteTabPanel>
    </section>

    <LocalSaveNotice error={error} writable={writable} saving={saving} />
  </ResourceLayout>;
}
