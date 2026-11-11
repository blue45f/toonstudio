// 작품 시작 시트(/create) — 작품을 시작하는 유일한 정문(S2-6).
import { ArrowLeft, ArrowRight, BookHeart, BookOpen, CheckCircle2, Clapperboard, LayoutTemplate, Plus, Sparkles, Upload } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import type { StudioProjectLibraryEntry } from "./studio-project-library-store";
import { studioLobbyRecentProjects } from "./studio-shell/studio-creator-lobby-model";
import { studioProjectLibraryLocale } from "./studio-shell/studio-project-library-management-model";
import { useStudioProjectLibrary } from "./studio-shell/useStudioProjectLibrary";
import {
  isMyStoryTemplateId,
  MY_STORY_TEMPLATE_IDS,
  MY_STORY_TOPIC_TITLES,
} from "./my-story/my-story-model";

import { LoadingState } from "@/shared/components/LoadingState";
import { Container } from "@/shared/components/section";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { StaggerReveal } from "@/shared/components/stagger-reveal";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { useApp } from "@/shared/lib/store";
import Link from "@/shared/navigation/router-link";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { STORY_TO_WEBTOON_PIPELINE_MODES } from "@/shared/navigation/webtoon-platform-router-ux-model";
import { CreateStartGenreStarterSection } from "./studio-shell/CreateStartGenreStarterSection";
import { CreateStartContinueSection } from "./studio-shell/guided-flow/CreateStartContinueSection";
import { StudioJourneyStepBar } from "./studio-shell/StudioJourneyStepBar";
import { StudioQuickStart } from "./studio-shell/StudioQuickStart";

/** 질문형 인터뷰는 "내 이야기"를 고른 사람만 쓰므로 시작 시트 본문과 분리해 늦게 불러온다. */
const MyStoryStartFlow = lazyRetry(
  () => import("./my-story/MyStoryStartFlow").then((module) => ({ default: module.MyStoryStartFlow })),
  "MyStoryStartFlow",
);

/** 갤러리 보기 조건 키 — 하나라도 있으면 갤러리 주소로 본다. */
const GALLERY_VIEW_PARAM_KEYS = ["tab", "sort", "content", "provenance", "tag", "portfolio"] as const;
const RECENT_PROJECT_LIMIT = 4;
/** `?intent=` 값 — 질문형 인터뷰 입구. */
const MY_STORY_INTENT = "my-story";

function useRecentStudioProjects(
  locale: string,
): readonly StudioProjectLibraryEntry[] {
  const library = useStudioProjectLibrary(locale, "active");
  return useMemo(
    () => studioLobbyRecentProjects(library.projects, RECENT_PROJECT_LIMIT),
    [library.projects],
  );
}

const CHOICE_CARD_CLASS =
  "fx-lift group flex h-full scroll-my-24 flex-col rounded-2xl border border-line bg-panel/45 p-5 transition-all hover:border-accent/55 hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-6";
const CHOICE_ICON_CLASS =
  "flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent";

const PIPELINE_MODE_EN_COPY: Readonly<
  Record<string, { readonly label: string; readonly description: string; readonly ctaLabel: string }>
> = {
  "worldbuilding-synopsis": {
    label: "Worldbuilding · Logline · Genre Plot",
    description: "Structure core story beats, character arcs, and synopses for webtoons and novel-comics.",
    ctaLabel: "Open Plot Board",
  },
  "novel-to-script": {
    label: "Webnovel to Webtoon Script & Beats",
    description: "Break prose chapters into 60–80 panel scripts, speech balloons, and camera angle cues.",
    ctaLabel: "Draft New Script",
  },
  "storyboard-3d-blocking": {
    label: "Vertical Storyboard & 3D Blocking",
    description: "Stage 3D character poses and scene angles per panel to validate scroll pacing and eye flow.",
    ctaLabel: "Open Storyboard",
  },
  "ink-render-publish": {
    label: "Ink, Color & Simultaneous Cuts Launch",
    description: "Run final export checks and publish both the episode and a 9:16 promo cut in one flow.",
    ctaLabel: "Open Publish Center",
  },
};

export function CreateStartPage() {
  const bt = useBilingual("CreateStartPage");
  const userId = useApp((state) => state.userId);
  const [searchParams, setSearchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = studioProjectLibraryLocale(language);
  const recentProjects = useRecentStudioProjects(locale);
  const urlSection = searchParams.get("section") ?? "all";
  const [selectedSection, setSelectedSection] = useState<string>(urlSection);
  const activeSection = selectedSection !== urlSection && searchParams.get("section") !== null
    ? urlSection
    : selectedSection;
  const showLanes = activeSection === "all" || activeSection === "lanes";
  const showPipeline = activeSection === "all" || activeSection === "pipeline";
  const showContinue = activeSection === "all" || activeSection === "continue";

  const selectSection = (section: "all" | "lanes" | "pipeline" | "continue") => {
    setSelectedSection(section);
    const next = new URLSearchParams(searchParams);
    if (section === "all") next.delete("section");
    else next.set("section", section);
    setSearchParams(next, { replace: true });
  };

  const handleSectionToggleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }
    const group = event.currentTarget.parentElement;
    if (!group) return;
    const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
    if (buttons.length === 0) return;
    const currentIndex = buttons.indexOf(event.currentTarget);
    if (currentIndex === -1) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = buttons.length - 1;
    }
    buttons[nextIndex]?.focus();
  };

  if (GALLERY_VIEW_PARAM_KEYS.some((key) => searchParams.has(key))) {
    return <Navigate to={`/showcase?${searchParams.toString()}`} replace />;
  }

  if (searchParams.get("intent") === MY_STORY_INTENT) {
    const requestedTopic = searchParams.get("topic");
    return (
      <Container size="wide" className="py-6 sm:py-10">
        <Link
          href="/create"
          style={{ minHeight: "44px" }}
          className="mb-5 inline-flex min-h-11 scroll-my-24 items-center gap-1.5 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeft size={15} aria-hidden />
          {bt("다른 시작 방법 보기", "See other ways to start")}
        </Link>
        <Suspense fallback={<LoadingState variant="skeleton" label={bt("내 이야기 질문을 불러오는 중이에요", "Loading your story questions")} />}>
          <MyStoryStartFlow initialTemplateId={isMyStoryTemplateId(requestedTopic) ? requestedTopic : null} initialIdea={searchParams.get("idea") ?? ""} />
        </Suspense>
      </Container>
    );
  }

  return (
    <Container size="wide" className="py-6 sm:py-10">
      {/* 비주얼 아틀리에 히어로 배너 */}
      <div className="relative overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent-soft to-panel p-5 shadow-sm sm:p-6">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.16em] text-on-accent">
                <Sparkles size={12} aria-hidden="true" />
                {bt("시작하기 · TOONSTUDIO ATELIER", "START · TOONSTUDIO ATELIER")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-soft/20 px-2.5 py-1 text-[0.68rem] font-bold text-success">
                <CheckCircle2 size={12} aria-hidden="true" />
                {bt("가입 없이 이 기기에 자동 저장", "Autosaved locally without sign-up")}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-fg sm:text-4xl">
              {bt("작품 시작하기", "Start a work")}
            </h1>
            <p className="mt-2.5 max-w-2xl text-sm leading-6 text-fg-2 sm:text-base sm:leading-7">
              {bt(
                "복잡한 캔버스 숫자부터 고민할 필요 없어요. 원하는 분위기 카드를 고르거나 질문에 답하면 알맞은 웹툰·4컷 규격이 바로 열립니다.",
                "Skip complex canvas math. Pick a mood preset or answer a few story questions to open a ready-to-draw workspace.",
              )}
            </p>
            <div
              role="group"
              aria-label={bt("시작 화면 구역 보기 전환", "Switch start screen view")}
              data-testid="create-start-section-group"
              style={{ gap: "8px" }}
              className="mt-5 flex flex-wrap items-center gap-2"
            >
              {([
                ["all", "추천 시작", "Recommended"],
                ["lanes", "다른 시작 방법", "More ways to start"],
                ["pipeline", "주제 · 제작 도구", "Topics & tools"],
                ["continue", "이어서 작업", "Continue Work"],
              ] as const).map(([id, ko, en]) => {
                const active = activeSection === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`create-start-section-${id}`}
                    data-state={active ? "active" : "inactive"}
                    aria-pressed={active}
                    onClick={() => selectSection(id)}
                    onKeyDown={handleSectionToggleKeyDown}
                    style={{ minHeight: "44px", minWidth: "44px" }}
                    className={`inline-flex min-h-11 min-w-11 max-w-full scroll-my-24 items-center justify-center rounded-full border px-3.5 py-2 text-xs font-bold leading-snug break-words [overflow-wrap:anywhere] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      active
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-panel/70 text-fg-2 hover:border-accent/50 hover:text-fg"
                    }`}
                  >
                    <span className="break-words [overflow-wrap:anywhere]">{bt(ko, en)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-line/80 bg-canvas shadow-sm">
            <img
              src="/brand/atelier-process-960.webp"
              alt=""
              aria-hidden="true"
              loading="eager"
              decoding="async"
              className="h-44 w-full object-cover sm:h-52"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent"
            />
            <div className="absolute inset-x-3.5 bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/90 p-2.5">
              <div>
                <p className="text-[0.65rem] font-extrabold uppercase tracking-wider text-accent">
                  {bt("30초 빠른 시작", "30-SECOND LAUNCH")}
                </p>
                <p className="text-xs font-bold text-fg">
                  {bt("기획 · 드로잉 · 출고 규격 자동 연결", "Story, drawing & export specs pre-wired")}
                </p>
              </div>
              <Link
                href="/studio/new?lane=blank"
                style={{ minHeight: "44px" }}
                className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11 scroll-my-24 gap-1.5" })}
              >
                {bt("새 작품 만들기", "Create a new work")}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <StudioJourneyStepBar currentStep="start" className="mt-5" />

      <section
        data-testid="create-start-persona-guide"
        aria-label={bt("상황별 추천 시작 방법", "Recommended start by situation")}
        className="mt-6 rounded-2xl border border-line bg-card/70 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-extrabold uppercase tracking-wider text-accent">
            {bt("어떻게 시작하고 싶나요?", "How would you like to start?")}
          </p>
          <span className="text-xs text-fg-3">
            {bt("어떤 방식이 맞을지 고민된다면 내 현재 상황을 골라보세요", "Not sure where to begin? Pick what matches you best")}
          </span>
        </div>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href={`/create?intent=${MY_STORY_INTENT}`}
            style={{ minHeight: "44px" }}
            className="flex min-h-11 scroll-my-24 flex-col justify-between rounded-xl border border-line/80 bg-panel/60 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none"
          >
            <span className="text-xs font-bold text-fg break-words [overflow-wrap:anywhere]">
              {bt("그림·스토리 모두 처음이에요", "New to both drawing & story")}
            </span>
            <span className="mt-2 text-[11px] font-extrabold text-accent">
              {bt("질문 답변형 초안 생성 →", "Generate draft via Q&A →")}
            </span>
          </Link>
          <StudioQuickStart locale={locale} presentation="drawing-card" />
          <Link
            href="/studio/templates"
            style={{ minHeight: "44px" }}
            className="flex min-h-11 scroll-my-24 flex-col justify-between rounded-xl border border-line/80 bg-panel/70 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-accent/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none"
          >
            <span className="text-xs font-bold text-fg break-words [overflow-wrap:anywhere]">
              {bt("웹툰·인스타툰 규격이 헷갈려요", "Unsure about canvas specs")}
            </span>
            <span className="mt-2 text-[11px] font-extrabold text-accent">
              {bt("표준 규격 프리셋 선택 →", "Pick standard spec preset →")}
            </span>
          </Link>
          <Link
            href="/studio/import"
            style={{ minHeight: "44px" }}
            className="flex min-h-11 scroll-my-24 flex-col justify-between rounded-xl border border-line/80 bg-panel/70 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-accent/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none"
          >
            <span className="text-xs font-bold text-fg break-words [overflow-wrap:anywhere]">
              {bt("클튜·포토샵 작업 파일이 있어요", "Have Clip Studio / PSD files")}
            </span>
            <span className="mt-2 text-[11px] font-extrabold text-accent">
              {bt("외부 작업 파일 열기 →", "Open external work files →")}
            </span>
          </Link>
        </div>
      </section>

      <CreateStartGenreStarterSection />

      {showPipeline ? (
      <details open={activeSection === "pipeline"} className="mt-6 rounded-2xl border border-line bg-panel/40 p-4 sm:p-5">
        <summary
          style={{ minHeight: "44px" }}
          className="min-h-11 scroll-my-24 cursor-pointer py-2 text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {bt("주제별 질문과 제작 도구 더 보기", "More story topics and creation tools")}
        </summary>
        <SiteContextualSubNav pathnameOverride="/create" className="mt-4" />
      <section
        aria-label={bt("웹소설 원작 · 시놉시스 → 웹툰 4단계 파이프라인", "Webnovel & Synopsis to Webtoon 4-Step Pipeline")}
        data-testid="create-rea-story-pipeline"
        className="mt-6 rounded-2xl border border-line bg-panel/60 p-4 sm:p-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
              {bt("4단계 제작 흐름", "4-STEP WORKFLOW")}
            </p>
            <h2 className="text-sm font-bold text-fg">
              {bt("줄거리 정리부터 콘티 · 3D 배경 · 연재 준비까지 차례대로 이어가요", "Follow four clear steps from story notes to boards, 3D scenes, and release")}
            </h2>
          </div>
          <Link
            href="/studio/ai-lab"
            style={{ minHeight: "44px" }}
            className="inline-flex min-h-11 scroll-my-24 items-center rounded-full border border-accent/40 bg-accent-soft px-3.5 py-2 text-[11px] font-bold text-accent hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {bt("AI 창작 도우미 열기 →", "Open AI Creative Helper →")}
          </Link>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {STORY_TO_WEBTOON_PIPELINE_MODES.map((mode) => {
            const enMode = PIPELINE_MODE_EN_COPY[mode.id];
            return (
              <Link
                key={mode.id}
                href={mode.targetHref}
                className="flex min-h-11 flex-col justify-between rounded-xl border border-line/80 bg-canvas/85 p-3.5 text-left transition-colors hover:border-accent/50"
              >
                <div>
                  <span className="inline-block rounded bg-accent/15 px-2 py-0.5 text-[10px] font-extrabold text-accent">
                    {mode.step}
                  </span>
                  <p className="mt-2 text-xs font-bold text-fg">{bt(mode.label, enMode?.label ?? mode.label)}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-fg-2">{bt(mode.description, enMode?.description ?? mode.description)}</p>
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">
                  {bt(mode.ctaLabel, enMode?.ctaLabel ?? mode.ctaLabel)} →
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <SiteArtSurfaceSpotlight cardId="nb-create-canvas" compact className="mt-6" />

      <section
        aria-labelledby="create-start-my-story-title"
        className="mt-8 rounded-2xl border border-accent/40 bg-accent-soft p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <span className={CHOICE_ICON_CLASS}>
              <BookHeart size={22} aria-hidden />
            </span>
            <h2 id="create-start-my-story-title" className="mt-4 text-lg font-bold text-fg">
              {bt("내 이야기로 시작하기", "Start from my story")}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-fg-2">
              {bt(
                "상상한 이야기나 내 경험을 적어 보세요. 질문 6~8개에 답하면 4컷·8컷 대본 초안이 만들어져요. 답하기 어려운 건 건너뛰어도 돼요.",
                "Start from an imagined story or a real experience. Answer 6 to 8 questions for a 4- or 8-panel script draft. You can skip any question.",
              )}
            </p>
            <p className="mt-2 text-xs font-semibold text-fg-3">
              {bt("쓰는 답변은 이 기기에만 임시 저장돼요", "Your answers are kept only on this device while you write")}
            </p>
          </div>
          <Link
            href={`/create?intent=${MY_STORY_INTENT}`}
            style={{ minHeight: "44px" }}
            className={buttonClass({ variant: "solid", size: "lg", className: "min-h-11 scroll-my-24 shrink-0 gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" })}
          >
            {bt("내 이야기 풀어내기", "Tell my story")}
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        <ul aria-label={bt("이야기 주제 바로 고르기", "Pick a story topic directly")} className="mt-4 flex flex-wrap gap-2">
          {MY_STORY_TEMPLATE_IDS.map((topicId) => (
            <li key={topicId}>
              <Link
                href={`/create?intent=${MY_STORY_INTENT}&topic=${topicId}`}
                style={{ minHeight: "44px" }}
                className="fx-press inline-flex min-h-11 scroll-my-24 items-center rounded-full border border-line bg-panel px-3.5 py-2 text-sm font-semibold text-fg break-words [overflow-wrap:anywhere] transition-colors hover:border-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {bt(MY_STORY_TOPIC_TITLES[topicId].ko, MY_STORY_TOPIC_TITLES[topicId].en)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      </details>
      ) : null}

      {showLanes ? (
      <details open={activeSection === "lanes"} className="mt-4 rounded-2xl border border-line bg-panel/40 p-4 sm:p-5">
        <summary
          style={{ minHeight: "44px" }}
          className="min-h-11 scroll-my-24 cursor-pointer py-2 text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {bt("다른 시작 방법 · 기획, 콘티, 템플릿, 파일", "More ways to start: plans, boards, templates and files")}
        </summary>
      <StaggerReveal className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-label={bt("시작 방법 고르기", "Choose how to start")}>
        <Link href="/studio/new?lane=idea&start=idea" className={CHOICE_CARD_CLASS}>
          <span
            aria-hidden="true"
            className="mb-3 block h-24 w-full rounded-xl border border-line/60 bg-cover bg-center"
            style={{ backgroundImage: "url(/assets/site-experience/site-art-v1/cards/nb-planning-storylab-640.webp)" }}
          />
          <span className={CHOICE_ICON_CLASS}>
            <BookOpen size={22} aria-hidden />
          </span>
          <strong className="mt-4 text-lg font-bold text-fg">
            {bt("이야기부터 시작하기", "Start from the story")}
          </strong>
          <span className="mt-1.5 text-sm leading-6 text-fg-2">
            {bt("줄거리와 캐릭터부터 정리해 두면, 콘티와 그림이 훨씬 덜 흔들려요.", "Outline the plot and characters first, and the boards and drawings will hold together.")}
          </span>
          <span className="mt-3 text-xs font-semibold text-fg-3">
            {bt("줄거리 한 줄만 있으면 시작할 수 있어요", "All you need is one line of story")}
          </span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            {bt("이야기로 시작", "Start with the story")}
            <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link href="/studio/new?lane=storyboard&start=storyboard" className={CHOICE_CARD_CLASS}>
          <span
            aria-hidden="true"
            className="mb-3 block h-24 w-full rounded-xl border border-line/60 bg-cover bg-center"
            style={{ backgroundImage: "url(/assets/site-experience/site-art-v1/cards/nb-workflow-bridge-640.webp)" }}
          />
          <span className={CHOICE_ICON_CLASS}>
            <Clapperboard size={22} aria-hidden />
          </span>
          <strong className="mt-4 text-lg font-bold text-fg">
            {bt("콘티부터 시작하기", "Start from a storyboard")}
          </strong>
          <span className="mt-1.5 text-sm leading-6 text-fg-2">
            {bt("장면과 컷의 흐름부터 짜 두면, 그림은 그다음에 채워 나가면 돼요.", "Plan the flow of scenes and panels first — the drawings can follow.")}
          </span>
          <span className="mt-3 text-xs font-semibold text-fg-3">
            {bt("컷 흐름만 잡으면 시작할 수 있어요", "All you need is the panel flow")}
          </span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            {bt("콘티로 시작", "Start with boards")}
            <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link href="/studio/new?lane=blank" className={CHOICE_CARD_CLASS}>
          <span
            aria-hidden="true"
            className="mb-3 block h-24 w-full rounded-xl border border-line/60 bg-cover bg-center"
            style={{ backgroundImage: "url(/assets/site-experience/site-art-v1/cards/nb-create-canvas-640.webp)" }}
          />
          <span className={CHOICE_ICON_CLASS}>
            <Plus size={22} aria-hidden />
          </span>
          <strong className="mt-4 text-lg font-bold text-fg">
            {bt("빈 캔버스로 시작하기", "Start with a blank canvas")}
          </strong>
          <span className="mt-1.5 text-sm leading-6 text-fg-2">
            {bt("아무것도 없는 하얀 캔버스에서 첫 컷부터 직접 그려 나가요.", "Begin on an empty white canvas and draw from the first panel.")}
          </span>
          <span className="mt-3 text-xs font-semibold text-fg-3">
            {bt("준비물 없이 바로 그릴 수 있어요", "Nothing to prepare — just draw")}
          </span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            {bt("빈 캔버스로 시작", "Start blank")}
            <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link href="/studio/templates" className={CHOICE_CARD_CLASS}>
          <span
            aria-hidden="true"
            className="mb-3 block h-24 w-full rounded-xl border border-line/60 bg-cover bg-center"
            style={{ backgroundImage: "url(/assets/site-experience/site-art-v1/cards/nb-market-atelier-640.webp)" }}
          />
          <span className={CHOICE_ICON_CLASS}>
            <LayoutTemplate size={22} aria-hidden />
          </span>
          <strong className="mt-4 text-lg font-bold text-fg">
            {bt("템플릿으로 시작하기", "Start from a template")}
          </strong>
          <span className="mt-1.5 text-sm leading-6 text-fg-2">
            {bt("잡혀 있는 형식에 이야기만 채우면 돼요.", "Pick a ready-made format and fill in your story.")}
          </span>
          <span className="mt-3 text-xs font-semibold text-fg-3">
            {bt("형식이 잡혀 있어 채우기만 하면 돼요", "The format is ready — just fill it in")}
          </span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            {bt("템플릿 고르기", "Browse templates")}
            <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link href="/studio/import" className={CHOICE_CARD_CLASS}>
          <span
            aria-hidden="true"
            className="mb-3 block h-24 w-full rounded-xl border border-line/60 bg-cover bg-center"
            style={{ backgroundImage: "url(/assets/site-experience/site-art-v1/cards/nb-production-control-640.webp)" }}
          />
          <span className={CHOICE_ICON_CLASS}>
            <Upload size={22} aria-hidden />
          </span>
          <strong className="mt-4 text-lg font-bold text-fg">
            {bt("가져와서 시작하기", "Start from an import")}
          </strong>
          <span className="mt-1.5 text-sm leading-6 text-fg-2">
            {bt("이미지나 파일로 가진 작업을 가져와 이어서 작업해요.", "Bring in work you already have as images or files and keep going.")}
          </span>
          <span className="mt-3 text-xs font-semibold text-fg-3">
            {bt("가진 파일만 있으면 이어서 할 수 있어요", "All you need is a file you have")}
          </span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            {bt("파일 가져오기", "Import a file")}
            <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </StaggerReveal>
      </details>
      ) : null}

      <CreateStartContinueSection
        recentProjects={recentProjects}
        locale={locale}
        userId={userId}
        showContinue={showContinue}
      />
    </Container>
  );
}
