// 작품 시작 시트(/create) — 작품을 시작하는 유일한 정문(S2-6).
import { ArrowLeft, ArrowRight, BookHeart, BookOpen, Clapperboard, LayoutTemplate, MessageSquare, Plus, Upload } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";

import type { StudioProjectLibraryEntry } from "./studio-project-library-store";
import { studioLibraryRecentWork } from "./studio-shell/studio-library-recent-work";
import { resolveStudioProjectResumeTarget } from "./studio-project-resume-target";
import "./studio-shell/create-start-mobile-first.css";
import { studioProjectLibraryLocale } from "./studio-shell/studio-project-library-management-model";
import { useStudioProjectLibrary } from "./studio-shell/useStudioProjectLibrary";
import { useResolvedStudioProjectThumbnailUrl } from "./studio-shell/useStudioProjectThumbnailUrl";
import {
  isMyStoryTemplateId,
  MY_STORY_TEMPLATE_IDS,
  MY_STORY_TOPIC_TITLES,
} from "./my-story/my-story-model";

import { LoadingState } from "@/shared/components/LoadingState";
import { Container } from "@/shared/components/section";
import { StaggerReveal } from "@/shared/components/stagger-reveal";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { useApp } from "@/shared/lib/store";
import Link from "@/shared/navigation/router-link";
import { STORY_TO_WEBTOON_PIPELINE_MODES } from "@/shared/navigation/webtoon-platform-router-ux-model";
import { CreateStartGenreStarterSection } from "./studio-shell/CreateStartGenreStarterSection";
import { CreateStartContinueSection } from "./studio-shell/guided-flow/CreateStartContinueSection";
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

function useRecentStudioProjects(locale: string) {
  const library = useStudioProjectLibrary(locale, "active");
  const projects = useMemo(
    () => studioLibraryRecentWork(library.projects, (project) => resolveRecentTarget(project, locale), RECENT_PROJECT_LIMIT),
    [library.projects, locale],
  );
  return { projects, error: library.error, reload: library.reload };
}

/** 개인 원고가 없거나 저장소가 막혔을 때는 기존 작품 홈으로 돌아간다. */
function resolveRecentTarget(project: StudioProjectLibraryEntry, locale: string) {
  const fallback = { href: `/studio/p/${encodeURIComponent(project.id)}/overview`, exact: false };
  try {
    if (typeof window !== "undefined") {
      return resolveStudioProjectResumeTarget(window.localStorage, project, locale.startsWith("ko") ? "ko" : "en");
    }
  } catch {
    // 저장소 접근이 막혀도 기존 작품의 홈 링크는 유지한다.
    return fallback;
  }
  return fallback;
}

/** 저장된 썸네일 로케이터를 해석하고, 실패 시 개인 작품의 제목으로 돌아간다. */
function RecentWorkThumbnail({ project }: { readonly project: StudioProjectLibraryEntry }) {
  const thumbnailUrl = useResolvedStudioProjectThumbnailUrl(project.thumbnailUrl);
  const [failed, setFailed] = useState(false);
  return thumbnailUrl && !failed
    ? <img src={thumbnailUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <span className="create-start-recent-placeholder" aria-hidden="true">{project.title.trim().charAt(0) || "•"}</span>;
}

const CHOICE_CARD_CLASS =
  "fx-lift group flex h-full scroll-my-24 flex-col rounded-2xl border border-line bg-panel/45 p-5 transition-all hover:border-accent/55 hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-6";
const CHOICE_ICON_CLASS =
  "flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent";

const PIPELINE_MODE_EN_COPY: Readonly<
  Record<string, { readonly step: string; readonly label: string; readonly description: string; readonly ctaLabel: string }>
> = {
  "worldbuilding-synopsis": {
    step: "1 · Plan",
    label: "Plan your story",
    description: "Write down the world, characters, and story direction in a planning worksheet and keep your draft.",
    ctaLabel: "Open planning worksheet",
  },
  "novel-to-script": {
    step: "2 · New work",
    label: "Choose a format and title",
    description: "Set the format and title for a new work. In the editor, arrange your writing into dialogue and panels.",
    ctaLabel: "Open new work settings",
  },
  "storyboard-3d-blocking": {
    step: "3 · Edit",
    label: "Arrange panels, balloons, and artwork",
    description: "Place panels, speech balloons, and artwork in the webtoon editor. Choose resources and 3D tools when you need them.",
    ctaLabel: "Open webtoon editor",
  },
  "ink-render-publish": {
    step: "4 · Finish",
    label: "Prepare episode publication",
    description: "Review the episode and publication settings. Preparing files does not publish them externally; upload and schedule in the destination channel.",
    ctaLabel: "Open episode publishing settings",
  },
};

export function CreateStartPage() {
  const bt = useBilingual("CreateStartPage");
  const userId = useApp((state) => state.userId);
  const [searchParams] = useSearchParams();
  const { hash } = useLocation();
  const language = useI18n((state) => state.lang);
  const locale = studioProjectLibraryLocale(language);
  const { projects: recentProjects, error: recentError, reload: reloadRecentProjects } = useRecentStudioProjects(locale);
  const requestedSection = searchParams.get("section");
  const activeSection = requestedSection === "lanes" || requestedSection === "pipeline" || requestedSection === "continue"
    || requestedSection === "topics" || requestedSection === "presets" || requestedSection === "tools"
    ? requestedSection : "all";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousSection = useRef(activeSection);
  useEffect(() => {
    if (previousSection.current === activeSection) return;
    previousSection.current = activeSection;
    headingRef.current?.focus();
  }, [activeSection]);
  const recentProject = recentProjects[0];
  const recentTarget = recentProject ? resolveRecentTarget(recentProject, locale) : null;
  const storyParams = new URLSearchParams(searchParams);
  storyParams.delete("section");
  storyParams.set("intent", MY_STORY_INTENT);
  const storyHref = `/create?${storyParams.toString()}${hash}`;
  const storyTopicHref = (topicId: string) => {
    const next = new URLSearchParams(storyParams);
    next.set("topic", topicId);
    return `/create?${next.toString()}${hash}`;
  };
  const recentWorkError = recentError ? (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p role="alert" className="text-sm font-semibold text-fg">{bt("최근 작업을 확인하지 못했어요.", "We couldn't check your recent work.")}</p>
      <p className="mt-2 text-sm leading-6 text-fg-2">{bt("브라우저의 저장소 접근을 확인한 뒤 다시 시도해 주세요. 저장된 작품은 변경하지 않았어요.", "Check this browser's storage access, then retry. Your saved work has not been changed.")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={reloadRecentProjects} className={buttonClass({ variant: "outline", size: "lg", className: "min-h-12" })}>{bt("다시 불러오기", "Reload recent work")}</button>
        <Link href="/studio" className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-accent">{bt("내 작업 보기", "View my work")}<ArrowRight size={17} aria-hidden /></Link>
      </div>
    </div>
  ) : null;

  const sectionHref = (section: "all" | "lanes" | "pipeline" | "continue" | "topics" | "presets" | "tools") => {
    const next = new URLSearchParams(searchParams);
    if (section === "all") next.delete("section");
    else next.set("section", section);
    return `/create${next.size ? `?${next.toString()}` : ""}${hash}`;
  };

  if (GALLERY_VIEW_PARAM_KEYS.some((key) => searchParams.has(key))) {
    return <Navigate to={`/showcase?${searchParams.toString()}`} replace />;
  }

  if (searchParams.get("intent") === MY_STORY_INTENT) {
    const requestedTopic = searchParams.get("topic");
    const returnParams = new URLSearchParams(searchParams);
    returnParams.delete("intent");
    const returnHref = `/create${returnParams.size ? `?${returnParams.toString()}` : ""}${hash}`;
    return (
      <Container size="wide" className="py-6 sm:py-10">
        <Link
          href={returnHref}
          style={{ minHeight: "48px" }}
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
    <Container size="wide" className="create-start-page py-6 sm:py-10">
      <header className="create-start-heading">
        {activeSection !== "all" ? (
          <Link href={sectionHref("all")} className="create-start-back">
            <ArrowLeft size={18} aria-hidden />{bt("작품 시작으로 돌아가기", "Back to start")}
          </Link>
        ) : null}
        <h1 ref={headingRef} tabIndex={-1}>{activeSection === "lanes" ? bt("다른 시작 방법", "More ways to start")
          : activeSection === "pipeline" || activeSection === "tools" ? bt("제작 단계와 도구", "Creation steps & tools")
          : activeSection === "topics" ? bt("이야기 주제 고르기", "Choose a story topic")
          : activeSection === "presets" ? bt("장르 프리셋 고르기", "Choose a genre preset")
          : activeSection === "continue" ? bt("이어서 작업", "Continue your work")
          : bt("어떻게 시작할까요?", "How would you like to start?")}</h1>
        <p>{activeSection === "all"
          ? bt("지금 하고 싶은 것부터 선택하세요.", "Choose what you would like to do now.")
          : bt("필요한 방법을 고르고, 하던 작업으로 이어가세요.", "Choose the next step for your work.")}</p>
      </header>

      {activeSection === "all" ? (
        <>
          <section className="create-start-choice-grid" data-testid="create-start-persona-guide"
            aria-label={bt("작품을 시작하는 두 가지 방법", "Two ways to start a work")}>
            <article className="create-start-choice">
              <img className="create-start-choice-art" src="/brand/lobby-hq-20261003/storyboard-768.webp"
                srcSet="/brand/lobby-hq-20261003/storyboard-480.webp 480w, /brand/lobby-hq-20261003/storyboard-768.webp 768w"
                sizes="(min-width: 640px) 50vw, 56vw" alt="" aria-hidden="true" loading="eager" decoding="async" />
              <div className="create-start-choice-copy">
                <p className="create-start-choice-kind"><MessageSquare size={18} aria-hidden />{bt("생각부터 차근차근", "Start with an idea")}</p>
                <h2>{bt("이야기부터 시작", "Start with a story")}</h2>
                <p className="create-start-choice-description">{bt("인물과 이야기를 첫 장면으로.", "Bring your characters and story to a first scene.")}</p>
                <Link href={storyHref} className="create-start-choice-action">
                  {bt("이야기 시작하기", "Start my story")}<ArrowRight size={19} aria-hidden />
                </Link>
              </div>
            </article>
            <StudioQuickStart locale={locale} presentation="drawing-card" />
          </section>

          <nav className="create-start-secondary" aria-label={bt("다른 자료로 시작하기", "Start with existing materials")}>
            <Link href="/studio/templates">{bt("템플릿 고르기", "Choose a template")}<ArrowRight size={18} aria-hidden /></Link>
            <Link href="/studio/import">{bt("파일 가져오기", "Import a file")}<Upload size={18} aria-hidden /></Link>
          </nav>

          <section className="create-start-recent" aria-label={bt("최근 작업", "Recent work")}>
            {recentWorkError ?? (recentProject && recentTarget ? (
              <Link href={recentTarget.href} className="create-start-recent-link"
                aria-label={bt(`${recentProject.title} 이어서 작업`, `Continue ${recentProject.title}`)}>
                <RecentWorkThumbnail key={`${recentProject.id}:${recentProject.thumbnailUrl ?? ""}`} project={recentProject} />
                <span className="create-start-recent-copy"><small>{bt("작업하던 작품이 있나요?", "Ready to pick up your work?")}</small><strong>{recentProject.title}</strong></span>
                <span className="create-start-recent-action">{bt("이어서 작업", "Continue")}<ArrowRight size={18} aria-hidden /></span>
              </Link>
            ) : (
              <div className="create-start-recent-empty"><span>{bt("아직 작업한 작품이 없어요.", "No works yet.")}</span><Link href="/studio">{bt("내 작업 보기", "View my work")}<ArrowRight size={17} aria-hidden /></Link></div>
            ))}
          </section>
        </>
      ) : null}

      {activeSection === "all" ? <nav aria-label={bt("다른 시작 화면", "More start pages")}
        data-testid="create-start-section-group" className="create-start-section-nav">
        {([
          ["lanes", "다른 시작 방법", "More ways to start"],
          ["pipeline", "제작 도구", "Creation tools"],
          ["continue", "최근 작업 전체 보기", "View all recent work"],
        ] as const).map(([id, ko, en]) => (
          <Link key={id} href={sectionHref(id)} data-testid={`create-start-section-${id}`}
            style={{ minHeight: "48px", minWidth: "48px" }}
            className="min-h-11 min-w-11 scroll-my-24 break-words [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {bt(ko, en)}<ArrowRight size={18} aria-hidden />
          </Link>
        ))}
      </nav> : null}

      {activeSection === "pipeline" || activeSection === "tools" ? (
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
              {bt("줄거리 정리부터 콘티 · 3D 배경 · 연재 준비까지 차례대로 이어가요", "Follow four clear steps from story notes to boards, 3D scenes, and release preparation")}
            </h2>
          </div>
          <Link
            href="/studio/ai-lab"
            style={{ minHeight: "48px" }}
            className="inline-flex min-h-11 scroll-my-24 items-center rounded-full border border-accent/40 bg-accent-soft px-3.5 py-2 text-[11px] font-bold text-accent hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {bt("AI 창작 도우미 열기 →", "Open AI Creative Helper →")}
          </Link>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {STORY_TO_WEBTOON_PIPELINE_MODES.map((mode) => {
            const enMode = PIPELINE_MODE_EN_COPY[mode.id];
            const descriptionKo = mode.id === "ink-render-publish"
              ? "회차와 게시 설정을 확인해요. 게시용 파일 준비는 외부 게시 완료와 달라요. 외부 채널에는 직접 업로드·예약해 주세요."
              : mode.description;
            return (
              <Link
                key={mode.id}
                href={mode.targetHref}
                className="flex min-h-11 flex-col justify-between rounded-xl border border-line/80 bg-canvas/85 p-3.5 text-left transition-colors hover:border-accent/50"
              >
                <div>
                  <span className="inline-block rounded bg-accent/15 px-2 py-0.5 text-[10px] font-extrabold text-accent">
                    {bt(mode.step, enMode?.step ?? mode.step)}
                  </span>
                  <p className="mt-2 text-xs font-bold text-fg">{bt(mode.label, enMode?.label ?? mode.label)}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-fg-2">{bt(descriptionKo, enMode?.description ?? descriptionKo)}</p>
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">
                  {bt(mode.ctaLabel, enMode?.ctaLabel ?? mode.ctaLabel)} →
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      ) : null}

      {activeSection === "presets" ? <CreateStartGenreStarterSection /> : null}

      {activeSection === "topics" ? (
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
            href={storyHref}
            style={{ minHeight: "48px" }}
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
                href={storyTopicHref(topicId)}
                style={{ minHeight: "48px" }}
                className="fx-press inline-flex min-h-11 scroll-my-24 items-center rounded-full border border-line bg-panel px-3.5 py-2 text-sm font-semibold text-fg break-words [overflow-wrap:anywhere] transition-colors hover:border-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {bt(MY_STORY_TOPIC_TITLES[topicId].ko, MY_STORY_TOPIC_TITLES[topicId].en)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      ) : null}

      {activeSection === "lanes" ? (
      <section aria-label={bt("다른 시작 방법 · 기획, 콘티, 템플릿, 파일", "More ways to start: plans, boards, templates and files")} className="mt-4">
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
      </section>
      ) : null}

      {activeSection !== "all" && activeSection !== "continue" ? (
        <nav className="create-start-section-nav" aria-label={bt("관련 시작 화면", "Related start pages")}>
          {([
            ["topics", "이야기 주제 고르기", "Choose a story topic"],
            ["presets", "장르 프리셋 고르기", "Choose a genre preset"],
            ["tools", "제작 단계와 도구", "Creation steps & tools"],
            ["lanes", "다른 시작 방법", "More ways to start"],
          ] as const).filter(([id]) => id !== activeSection && !(activeSection === "pipeline" && id === "tools"))
            .map(([id, ko, en]) => (
              <Link key={id} href={sectionHref(id)}>
                {bt(ko, en)}<ArrowRight size={18} aria-hidden />
              </Link>
            ))}
        </nav>
      ) : null}

      {activeSection === "continue" ? (
        recentWorkError ?? <CreateStartContinueSection recentProjects={recentProjects} locale={locale} userId={userId} showContinue />
      ) : null}
    </Container>
  );
}
