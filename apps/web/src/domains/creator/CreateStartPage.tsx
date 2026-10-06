// 작품 시작 시트(/create) — 작품을 시작하는 유일한 정문. 새 작품·템플릿·이어가기를 한 화면에서 고른다.
// 갤러리 본문은 /showcase가 정본이라 이 주소에 갤러리를 중복 배치하지 않고, 갤러리 보기 조건
// (tab·sort·tag 등)을 단 옛 공유 주소는 조건을 그대로 들고 /showcase로 넘긴다.
import { ArrowRight, Clock3, Images, LayoutTemplate, Plus, Users } from "lucide-react";
import { useMemo } from "react";
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

import { Container } from "@/shared/components/section";
import { StaggerReveal } from "@/shared/components/stagger-reveal";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

/** 갤러리 보기 조건 키 — 하나라도 있으면 갤러리 주소로 본다. */
const GALLERY_VIEW_PARAM_KEYS = ["tab", "sort", "content", "provenance", "tag", "portfolio"] as const;
const RECENT_PROJECT_LIMIT = 4;

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

const CHOICE_CARD_CLASS =
  "fx-lift group flex h-full flex-col rounded-2xl border border-line bg-panel/40 p-5 transition-colors hover:border-accent/50 sm:p-6";
const CHOICE_ICON_CLASS =
  "flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent";

export function CreateStartPage() {
  const bt = useBilingual("CreateStartPage");
  const [searchParams] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const locale = studioProjectLibraryLocale(language);
  const recentProjects = useRecentStudioProjects(locale);

  // 갤러리 보기 조건을 단 옛 /create 공유 주소는 같은 조건의 /showcase로 넘긴다.
  if (GALLERY_VIEW_PARAM_KEYS.some((key) => searchParams.has(key))) {
    return <Navigate to={`/showcase?${searchParams.toString()}`} replace />;
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
            "새로 만들지, 템플릿으로 시작할지, 하던 작품을 이어갈지 — 시작은 여기서 한 번만 고르세요.",
            "Start fresh, begin from a template, or pick up where you left off — every start begins here.",
          )}
        </p>
      </header>

      <StaggerReveal className="mt-8 grid gap-4 md:grid-cols-3" aria-label={bt("시작 방법 고르기", "Choose how to start")}>
        <Link href="/studio/new" className={CHOICE_CARD_CLASS}>
          <span className={CHOICE_ICON_CLASS}>
            <Plus size={22} aria-hidden />
          </span>
          <strong className="mt-4 text-lg font-bold text-fg">
            {bt("새 작품 만들기", "Create a new work")}
          </strong>
          <span className="mt-1.5 text-sm leading-6 text-fg-2">
            {bt("빈 작품에서 첫 컷부터 직접 그려 나가요.", "Begin with a blank work and draw from the first panel.")}
          </span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            {bt("빈 작품으로 시작", "Start blank")}
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
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            {bt("템플릿 고르기", "Browse templates")}
            <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <section aria-labelledby="create-start-continue-title" className="flex h-full flex-col rounded-2xl border border-line bg-panel/40 p-5 sm:p-6">
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
                        <span
                          aria-hidden
                          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-sm font-black text-accent"
                        >
                          {project.title.trim().charAt(0) || "•"}
                        </span>
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
                  "아직 이 기기에서 작업한 작품이 없어요. 첫 작품을 만들면 여기에 이어갈 작품이 쌓여요.",
                  "No works on this device yet. Once you create one, it will wait for you here.",
                )}
              </p>
              <Link href="/studio" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                {bt("작업실 둘러보기", "Look around the studio")}
                <ArrowRight size={15} aria-hidden />
              </Link>
            </>
          )}
        </section>
      </StaggerReveal>

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
