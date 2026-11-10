import { ArrowRight, Clock3, Images, Users } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import type { StudioProjectLibraryEntry } from "../../studio-project-library-store";
import { resolveStudioProjectResumeTarget } from "../../studio-project-resume-target";
import {
  studioProjectLibraryDateLabel,
  studioProjectLibraryTypeLabel,
} from "../studio-project-library-management-model";
import { useResolvedStudioProjectThumbnailUrl } from "../useStudioProjectThumbnailUrl";

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

export function CreateStartContinueSection({
  recentProjects,
  locale,
  userId,
  showContinue,
}: {
  readonly recentProjects: readonly StudioProjectLibraryEntry[];
  readonly locale: string;
  readonly userId: string | null | undefined;
  readonly showContinue: boolean;
}) {
  const bt = useBilingual("CreateStartPage");

  return (
    <>
      {showContinue ? (
        <section
          aria-labelledby="create-start-continue-title"
          className="mt-8 rounded-2xl border border-line bg-panel/45 p-5 sm:p-6"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Clock3 size={22} aria-hidden />
          </span>
          <h2 id="create-start-continue-title" className="mt-4 text-lg font-bold text-fg">
            {bt("이어서 작업하기", "Continue a work")}
          </h2>
          {recentProjects.length > 0 ? (
            <>
              <ul className="mt-3 space-y-2">
                {recentProjects.map((project) => {
                  const resume =
                    typeof window === "undefined"
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
                        className="fx-press flex min-h-11 scroll-my-24 items-center gap-3 rounded-xl border border-line/70 bg-card/70 px-3.5 py-2.5 transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={bt(`${project.title} 이어서 작업`, `Continue ${project.title}`)}
                      >
                        <RecentProjectThumb project={project} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-fg">
                            {project.title}
                          </span>
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
    </>
  );
}
