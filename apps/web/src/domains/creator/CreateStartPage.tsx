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
  if (project.thumbnailUrl && !failed) {
    return (
      <img
        src={project.thumbnailUrl}
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
  "fx-lift group flex h-full flex-col rounded-2xl border border-line bg-panel/40 p-5 transition-colors hover:border-accent/50 sm:p-6";
const CHOICE_ICON_CLASS =
  "flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent";

export function CreateStartPage() {
  const bt = useBilingual("CreateStartPage");
  const userId = useApp((state) => state.userId);
  const [searchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = studioProjectLibraryLocale(language);
  const recentProjects = useRecentStudioProjects(locale);

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
          className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent"
        >
          <ArrowLeft size={15} aria-hidden />
          {bt("다른 시작 방법 보기", "See other ways to start")}
        </Link>
        <Suspense fallback={<LoadingState variant="skeleton" label={bt("내 이야기 질문을 불러오는 중이에요", "Loading your story questions")} />}>
          <MyStoryStartFlow initialTemplateId={isMyStoryTemplateId(requestedTopic) ? requestedTopic : null} />
        </Suspense>
      </Container>
    );
  }

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <header className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
          {bt("시작하기", "Start")}
        </p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-fg sm:text-4xl">
          {bt("작품 시작하기", "Start a work")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-fg-2 sm:text-base sm:leading-7">
          {bt(
            "무엇을 먼저 할지만 고르세요 — 이야기부터, 콘티부터, 빈 캔버스, 템플릿에서, 가져오기. 하던 작품은 아래 이어가기에서 바로 열 수 있어요.",
            "Just choose what comes first — the story, boards, a blank canvas, a template, or an import. Works in progress wait below.",
          )}
        </p>
      </header>

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
                "무엇을 그릴지 막막하다면 내 경험과 기억부터 적어 보세요. 질문 6~8개에 답하면 4컷·8컷 웹툰 초안이 만들어지고, 답하기 어려운 건 건너뛰어도 돼요.",
                "If you are unsure what to draw, start by writing down your own experience. Answer 6 to 8 questions to get a 4- or 8-panel webtoon draft, and skip any you would rather not answer.",
              )}
            </p>
            <p className="mt-2 text-xs font-semibold text-fg-3">
              {bt("쓰는 답변은 이 기기에만 임시 저장돼요", "Your answers are kept only on this device while you write")}
            </p>
          </div>
          <Link
            href={`/create?intent=${MY_STORY_INTENT}`}
            className={buttonClass({ variant: "solid", size: "lg", className: "min-h-11 shrink-0 gap-2" })}
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
                className="fx-press inline-flex min-h-11 items-center rounded-full border border-line bg-panel px-3.5 text-sm font-semibold text-fg transition-colors hover:border-accent/60"
              >
                {bt(MY_STORY_TOPIC_TITLES[topicId].ko, MY_STORY_TOPIC_TITLES[topicId].en)}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <StaggerReveal className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-label={bt("시작 방법 고르기", "Choose how to start")}>
        <Link href="/studio/new?lane=idea&start=idea" className={CHOICE_CARD_CLASS}>
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
                      className="fx-press flex items-center gap-3 rounded-xl border border-line/70 bg-card/60 px-3 py-2.5 transition-colors hover:border-accent/50"
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
            <Link href="/studio" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
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
              <Link href="/studio/new" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                {bt("새 작품 만들기", "Create a new work")}
                <ArrowRight size={15} aria-hidden />
              </Link>
              <Link href="/studio" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-2">
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
            className="fx-press inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3.5 text-sm font-semibold text-fg transition-colors hover:border-accent/50"
          >
            <Images size={15} aria-hidden />
            {bt("창작 갤러리", "Creator gallery")}
          </Link>
          <Link
            href="/collaborate/gallery"
            className="fx-press inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3.5 text-sm font-semibold text-fg transition-colors hover:border-accent/50"
          >
            <Users size={15} aria-hidden />
            {bt("창작자 커리어 갤러리", "Creator career gallery")}
          </Link>
        </div>
      </section>
    </Container>
  );
}
