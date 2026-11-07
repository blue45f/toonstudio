// 작품 시작 시트(/create) — 작품을 시작하는 유일한 정문(S2-6). 시작 레인 5개
// (이야기부터·콘티부터·빈 캔버스·템플릿에서·가져오기)를 한 화면에서 고르고,
// 이어가기는 레인이 아니라 그 아래 별도 구역으로 둔다. 모든 "새 작품" 동선의
// 도착지는 이 관문이며, 실제 생성은 2단계 양식(/studio/new)이 맡는다.
// 레인 카드는 ?lane=으로 레인을 명시해 넘긴다(S2-7) — 양식은 레인으로 초기값(첫 단계)과
// 생성 후 착지(이야기→기획, 콘티·빈 캔버스·템플릿→에디터)를 결정한다. 템플릿 레인은
// /studio/templates를 거쳐 ?template=로 추론되고, 가져오기 레인은 양식을 거치지 않는다.
// 갤러리 본문은 /showcase가 정본이라 이 주소에 갤러리를 중복 배치하지 않고, 갤러리 보기 조건
// (tab·sort·tag 등)을 단 옛 공유 주소는 조건을 그대로 들고 /showcase로 넘긴다.
// "내 이야기" 의도 카드는 도구가 아니라 이야기에서 시작하는 초보자용 안내 흐름의 입구다. 같은 주소의
// ?intent=my-story[&topic=…]가 질문형 인터뷰(지연 로딩)를 열고, 초안은 기존 대본·콘티 시작 경로로 넘어간다.
// 별도 라우트를 만들지 않으므로 라우트·내비 계약은 그대로다.
import { ArrowLeft, ArrowRight, BookHeart, BookOpen, Clapperboard, Clock3, Images, LayoutTemplate, Plus, Upload, Users } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import type { StudioProjectLibraryEntry } from "./studio-project-library-store";
import { resolveStudioProjectResumeTarget } from "./studio-project-resume-target";
import { studioLobbyRecentProjects } from "./studio-shell/studio-creator-lobby-model";
import {
  studioProjectLibraryDateLabel,
  studioProjectLibraryLocale,
  studioProjectLibraryTypeLabel,
} from "./studio-shell/studio-project-library-management-model";
import { useStudioProjectLibrary } from "./studio-shell/useStudioProjectLibrary";
import { useResolvedStudioProjectThumbnailUrl } from "./studio-shell/useStudioProjectThumbnailUrl";
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

/** 이 기기의 작품 보관함에서 최근에 연 작품을 읽는다. 읽기 전용 — 열기 기록은 작품 화면이 맡는다. */
function useRecentStudioProjects(
  locale: string,
): readonly StudioProjectLibraryEntry[] {
  const library = useStudioProjectLibrary(locale, "active");
  return useMemo(
    () => studioLobbyRecentProjects(library.projects, RECENT_PROJECT_LIMIT),
    [library.projects],
  );
}

/**
 * 이어가기 카드의 작품 표지. 작품 화면이 기록해 둔 썸네일이 있으면 그걸 보여 주고,
 * 없거나 불러오지 못하면 제목 첫 글자 타일로 돌아간다 — 비슷한 제목의 작품이
 * 나란히 있어도 표지로 구분할 수 있게 하는 것이 목적이다.
 */
function RecentProjectThumb({ project }: { readonly project: StudioProjectLibraryEntry }) {
  const [failed, setFailed] = useState(false);
  const thumbnailUrl = useResolvedStudioProjectThumbnailUrl(project.thumbnailUrl);
  if (thumbnailUrl && !failed) {
    return (
      <img
        src={thumbnailUrl}
        alt=""
        aria-hidden
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-9 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-sm font-black text-accent"
    >
      {project.title.trim().charAt(0) || "•"}
    </span>
  );
}

const CHOICE_CARD_CLASS =
  "fx-lift group flex h-full scroll-my-24 flex-col rounded-2xl border border-line bg-panel/40 p-5 transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-6";
const CHOICE_ICON_CLASS =
  "flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent";

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

  // 갤러리 보기 조건을 단 옛 /create 공유 주소는 같은 조건의 /showcase로 넘긴다.
  if (GALLERY_VIEW_PARAM_KEYS.some((key) => searchParams.has(key))) {
    return <Navigate to={`/showcase?${searchParams.toString()}`} replace />;
  }

  // 내 이야기 의도: 시작 레인 대신 질문형 인터뷰를 보여 준다. 모르는 topic 값은 무시한다.
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
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
            {bt("시작하기", "Start")}
          </p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-fg sm:text-4xl">
            {bt("작품 시작하기", "Start a work")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-fg-2 sm:text-base sm:leading-7">
            {bt(
              "처음이라면 질문에 답하며 짧은 이야기를 만들어 보세요. 그림부터 시작하거나 하던 작품을 이어갈 수도 있어요.",
              "Start with a few story questions, begin a drawing, or continue a work below.",
            )}
          </p>
        </div>
        <div
          role="group"
          aria-label={bt("시작 화면 구역 보기 전환", "Switch start screen view")}
          data-testid="create-start-section-group"
          style={{ gap: "8px" }}
          className="flex flex-wrap items-center gap-2"
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
      </header>

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
            className="flex min-h-11 scroll-my-24 flex-col justify-between rounded-xl border border-line/80 bg-panel/60 p-3 text-left transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="text-xs font-bold text-fg break-words [overflow-wrap:anywhere]">
              {bt("그림·스토리 모두 처음이에요", "New to both drawing & story")}
            </span>
            <span className="mt-1.5 text-[11px] font-semibold text-accent">
              {bt("질문 답변형 초안 생성 →", "Generate draft via Q&A →")}
            </span>
          </Link>
          <StudioQuickStart locale={locale} presentation="drawing-card" />
          <Link
            href="/studio/templates"
            style={{ minHeight: "44px" }}
            className="flex min-h-11 scroll-my-24 flex-col justify-between rounded-xl border border-line/80 bg-panel/60 p-3 text-left transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="text-xs font-bold text-fg break-words [overflow-wrap:anywhere]">
              {bt("웹툰·인스타툰 규격이 헷갈려요", "Unsure about canvas specs")}
            </span>
            <span className="mt-1.5 text-[11px] font-semibold text-accent">
              {bt("표준 규격 프리셋 선택 →", "Pick standard spec preset →")}
            </span>
          </Link>
          <Link
            href="/studio/import"
            style={{ minHeight: "44px" }}
            className="flex min-h-11 scroll-my-24 flex-col justify-between rounded-xl border border-line/80 bg-panel/60 p-3 text-left transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="text-xs font-bold text-fg break-words [overflow-wrap:anywhere]">
              {bt("클튜·포토샵 작업 파일이 있어요", "Have Clip Studio / PSD files")}
            </span>
            <span className="mt-1.5 text-[11px] font-semibold text-accent">
              {bt("외부 작업 파일 열기 →", "Open external work files →")}
            </span>
          </Link>
        </div>
      </section>

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
              TOONSTUDIO SMART CREATION PIPELINE
            </p>
            <h2 className="text-sm font-bold text-fg">
              {bt("원작 세계관 · 웹소설 대본 → 콘티 · 3D 블로킹 · 연재 4단계 파이프라인", "Worldbuilding & Novel Script to Storyboard, 3D Blocking & Serial Launch")}
            </h2>
          </div>
          <Link
            href="/studio/ai-lab"
            style={{ minHeight: "44px" }}
            className="inline-flex min-h-11 scroll-my-24 items-center rounded-full border border-accent/40 bg-accent-soft px-3.5 py-2 text-[11px] font-bold text-accent hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {bt("✦ 스마트 AI 창작 보조 허브 열기 →", "✦ Open Smart AI Assist Hub →")}
          </Link>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {STORY_TO_WEBTOON_PIPELINE_MODES.map((mode) => (
            <Link
              key={mode.id}
              href={mode.targetHref}
              className="flex flex-col justify-between rounded-xl border border-line/80 bg-canvas/85 p-3.5 text-left transition-colors hover:border-accent/50"
            >
              <div>
                <span className="inline-block rounded bg-accent/15 px-2 py-0.5 text-[10px] font-extrabold text-accent">
                  {mode.step}
                </span>
                <p className="mt-2 text-xs font-bold text-fg">{mode.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-fg-2">{mode.description}</p>
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">
                {mode.ctaLabel} →
              </span>
            </Link>
          ))}
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

      {showContinue ? (
      <section aria-labelledby="create-start-continue-title" className="mt-8 rounded-2xl border border-line bg-panel/40 p-5 sm:p-6">
        <span className={CHOICE_ICON_CLASS}>
          <Clock3 size={22} aria-hidden />
        </span>
        <h2 id="create-start-continue-title" className="mt-4 text-lg font-bold text-fg">
          {bt("이어서 작업하기", "Continue a work")}
        </h2>
        {recentProjects.length > 0 ? (
          <>
            <ul className="mt-3 space-y-2">
              {recentProjects.map((project) => {
                const resume = typeof window === "undefined"
                  ? { href: `/studio/p/${encodeURIComponent(project.id)}/overview` }
                  : resolveStudioProjectResumeTarget(
                      window.localStorage,
                      project,
                      locale === "ko" ? "ko" : "en",
                    );
                return (
                  <li key={project.id}>
                    <Link
                      href={resume.href}
                      style={{ minHeight: "44px" }}
                      className="fx-press flex min-h-11 scroll-my-24 items-center gap-3 rounded-xl border border-line/70 bg-card/60 px-3 py-2.5 transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      aria-label={bt(`${project.title} 이어서 작업`, `Continue ${project.title}`)}
                    >
                      <RecentProjectThumb project={project} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-fg">{project.title}</span>
                        <span className="block text-xs text-fg-3">
                          {`${studioProjectLibraryTypeLabel(project)} · ${studioProjectLibraryDateLabel(project.lastOpenedAt, locale)}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/studio"
              style={{ minHeight: "44px" }}
              className="mt-4 inline-flex min-h-11 scroll-my-24 items-center gap-1.5 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {bt("모든 작품 보기", "See all works")}
              <ArrowRight size={15} aria-hidden />
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-sm leading-6 text-fg-2">
              {bt(
                "아직 작업한 작품이 없어요. 첫 작품을 만들면 여기에 이어갈 작품이 쌓여요.",
                "No works yet. Once you create one, it will wait for you here.",
              )}
            </p>
            {/* 빈 상태의 다음 행동은 이 화면의 본래 목적인 "첫 작품 만들기"여야 한다.
                둘러보기는 보조로 내린다 — 시작하러 온 사람을 구경으로 보내지 않는다. */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link
                href="/studio/new?lane=blank"
                style={{ minHeight: "44px" }}
                className="inline-flex min-h-11 scroll-my-24 items-center gap-1.5 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {bt("새 작품 만들기", "Create a new work")}
                <ArrowRight size={15} aria-hidden />
              </Link>
              <Link
                href="/studio"
                style={{ minHeight: "44px" }}
                className="inline-flex min-h-11 scroll-my-24 items-center gap-1.5 text-sm font-semibold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {bt("작업실 둘러보기", "Look around the studio")}
              </Link>
            </div>
          </>
        )}
        <p className="mt-4 border-t border-line/60 pt-3 text-xs leading-5 text-fg-3">
          {userId
            ? bt(
                "이어가기 목록은 로그인한 계정에 동기화돼요 — 다른 기기에서도 이어서 작업할 수 있어요.",
                "Your continue list syncs to your account — pick up on another device, too.",
              )
            : bt(
                "지금은 이 기기에만 저장돼요. 로그인하면 이어가기 목록이 계정에 동기화돼요.",
                "For now this is saved on this device only. Sign in and your continue list syncs to your account.",
              )}
        </p>
      </section>
      ) : null}

      <section
        aria-labelledby="create-start-browse-title"
        className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel/40 p-4 sm:p-5"
      >
        <div className="min-w-0">
          <h2 id="create-start-browse-title" className="text-base font-bold text-fg">
            {bt("만들기 전에, 다른 작품부터 구경할래요?", "Want to look around first?")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">
            {bt(
              "공개된 작품과 창작자들의 커리어는 갤러리에서 볼 수 있어요.",
              "Published works and creator careers live in the galleries.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/showcase"
            style={{ minHeight: "44px" }}
            className="fx-press inline-flex min-h-11 scroll-my-24 items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Images size={15} aria-hidden />
            {bt("창작 갤러리", "Creator gallery")}
          </Link>
          <Link
            href="/collaborate/gallery"
            style={{ minHeight: "44px" }}
            className="fx-press inline-flex min-h-11 scroll-my-24 items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Users size={15} aria-hidden />
            {bt("창작자 커리어 갤러리", "Creator career gallery")}
          </Link>
        </div>
      </section>
    </Container>
  );
}
