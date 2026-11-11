import { ArrowRight, BookOpen, Clock3, Images, Upload, Users } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import type { StudioProjectLibraryEntry } from "../../studio-project-library-store";
import { resolveStudioProjectResumeTarget } from "../../studio-project-resume-target";
import {
  studioProjectLibraryDateLabel,
  studioProjectLibraryTypeLabel,
} from "../studio-project-library-management-model";
import { useResolvedStudioProjectThumbnailUrl } from "../useStudioProjectThumbnailUrl";

function RecentProjectThumb({
  project,
  featured,
}: {
  readonly project: StudioProjectLibraryEntry;
  readonly featured: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const thumbnailUrl = useResolvedStudioProjectThumbnailUrl(project.thumbnailUrl);
  if (thumbnailUrl && !failed) {
    return (
      <img
        src={thumbnailUrl}
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn(
          "shrink-0 rounded-xl object-cover",
          featured ? "size-11 ring-1 ring-accent/30" : "size-10",
        )}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-black text-accent",
        featured ? "size-11 bg-accent/20 text-base" : "size-10 bg-accent/15 text-sm",
      )}
    >
      {project.title.trim().charAt(0) || "•"}
    </span>
  );
}

function handlePrimaryLinkKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const list = event.currentTarget.closest("ul");
  if (!list) return;

  const links = Array.from(
    list.querySelectorAll<HTMLAnchorElement>('[data-continue-primary-link="true"]'),
  );
  if (links.length <= 1) return;
  const currentIndex = links.indexOf(event.currentTarget);
  if (currentIndex === -1) return;

  event.preventDefault();
  if (event.key === "Home") {
    links[0]?.focus();
    return;
  }
  if (event.key === "End") {
    links[links.length - 1]?.focus();
    return;
  }
  const delta = event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = (currentIndex + delta + links.length) % links.length;
  links[nextIndex]?.focus();
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
  const resumeLocale: "ko" | "en" = locale.toLowerCase().startsWith("ko") ? "ko" : "en";

  return (
    <>
      {showContinue ? (
        <section
          aria-labelledby="create-start-continue-title"
          data-testid="create-start-continue-section"
          className="mt-8 rounded-2xl border border-line bg-panel/45 p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Clock3 size={22} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="create-start-continue-title" className="text-lg font-bold text-fg">
                    {bt("이어서 작업하기", "Continue a work")}
                  </h2>
                  {recentProjects.length > 0 ? (
                    <span
                      data-testid="continue-recent-count"
                      className="inline-flex items-center rounded-full border border-accent/30 bg-accent-soft/45 px-2.5 py-0.5 text-xs font-bold text-accent"
                    >
                      {bt(`최근 ${recentProjects.length}개`, `${recentProjects.length} recent`)}
                    </span>
                  ) : null}
                </div>
                {recentProjects.length > 0 ? (
                  <p className="mt-1 text-xs leading-5 text-fg-2">
                    {bt(
                      "카드를 누르면 마지막 원고 화면으로 바로 돌아가고, 기획·회차를 먼저 보려면 옆의 작품 홈을 여세요.",
                      "Select a card to jump back to your last canvas, or open Overview to check story and episodes first.",
                    )}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {recentProjects.length > 0 ? (
            <>
              <ul className="mt-4 space-y-2.5" data-testid="continue-recent-list">
                {recentProjects.map((project, index) => {
                  const isMostRecent = index === 0;
                  const overviewHref = `/studio/p/${encodeURIComponent(project.id)}/overview`;
                  const resume =
                    typeof window === "undefined"
                      ? {
                          href: overviewHref,
                          documentId: null,
                          summary: null,
                          exact: false,
                        }
                      : resolveStudioProjectResumeTarget(
                          window.localStorage,
                          project,
                          resumeLocale,
                        );
                  const opensDocument = Boolean(resume.documentId) && resume.href !== overviewHref;
                  const destinationLabel = resume.summary
                    ? resume.exact
                      ? bt(`마지막 작업 위치: ${resume.summary}`, `Last spot: ${resume.summary}`)
                      : bt(`열릴 원고: ${resume.summary}`, `Opens: ${resume.summary}`)
                    : bt("열릴 화면: 작품 홈 · 기획 개요", "Opens: Project overview");
                  const primaryActionLabel = opensDocument
                    ? resume.exact
                      ? bt("하던 곳 이어가기", "Resume spot")
                      : bt("원고 바로 열기", "Open canvas")
                    : bt("작품 홈 열기", "Open project");

                  return (
                    <li
                      key={project.id}
                      data-testid={`continue-item-${project.id}`}
                      data-most-recent={isMostRecent ? "true" : "false"}
                      className={cn(
                        "flex flex-col gap-2 rounded-2xl border p-2 transition-colors sm:flex-row sm:items-center sm:justify-between sm:p-2.5",
                        isMostRecent
                          ? "border-accent/45 bg-accent-soft/20 shadow-xs"
                          : "border-line/80 bg-card/70 hover:border-accent/40",
                      )}
                    >
                      <Link
                        href={resume.href}
                        data-continue-primary-link="true"
                        onKeyDown={handlePrimaryLinkKeyDown}
                        style={{ minHeight: "44px" }}
                        className="fx-press group flex min-h-11 min-w-0 flex-1 scroll-my-24 items-center justify-between gap-3 rounded-xl px-2 py-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={bt(`${project.title} 이어서 작업`, `Continue ${project.title}`)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <RecentProjectThumb project={project} featured={isMostRecent} />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              {isMostRecent ? (
                                <span
                                  data-testid="continue-latest-badge"
                                  className="inline-flex shrink-0 items-center rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-extrabold text-on-accent"
                                >
                                  {bt("방금 작업", "Latest")}
                                </span>
                              ) : null}
                              <span className="truncate text-sm font-bold text-fg">
                                {project.title}
                              </span>
                            </span>
                            <span
                              data-testid={`continue-destination-${project.id}`}
                              className="mt-0.5 block break-words text-xs font-medium text-fg-2 [overflow-wrap:anywhere]"
                            >
                              {destinationLabel}
                            </span>
                            <span className="mt-0.5 block text-[0.7rem] text-fg-3">
                              {`${studioProjectLibraryTypeLabel(project)} · ${studioProjectLibraryDateLabel(project.lastOpenedAt, locale)}`}
                            </span>
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "hidden shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none sm:inline-flex",
                            isMostRecent
                              ? "bg-accent text-on-accent"
                              : "border border-line bg-panel/80 text-accent",
                          )}
                        >
                          {primaryActionLabel}
                          <ArrowRight size={14} aria-hidden="true" />
                        </span>
                      </Link>

                      {opensDocument ? (
                        <Link
                          href={overviewHref}
                          data-testid={`continue-overview-${project.id}`}
                          style={{ minHeight: "44px", minWidth: "44px" }}
                          aria-label={bt(
                            `${project.title} 작품 홈 열기`,
                            `Open ${project.title} overview`,
                          )}
                          className="fx-press inline-flex min-h-11 min-w-11 shrink-0 scroll-my-24 items-center justify-center gap-1.5 rounded-xl border border-line bg-panel/80 px-3 py-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <BookOpen size={14} aria-hidden="true" />
                          <span>{bt("작품 홈", "Overview")}</span>
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <Link
                  href="/studio"
                  style={{ minHeight: "44px" }}
                  className="inline-flex min-h-11 scroll-my-24 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {bt("모든 작품 보기", "See all works")}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <span className="text-xs text-fg-3">
                  {bt("키보드 위·아래 방향키로 최근 작품을 빠르게 오갈 수 있어요", "Use Up/Down arrow keys to move across recent works")}
                </span>
              </div>
            </>
          ) : (
            <div
              data-testid="continue-empty-state"
              className="mt-3 rounded-2xl border border-dashed border-line bg-card/60 p-4 sm:p-5"
            >
              <p className="text-sm font-semibold leading-6 text-fg">
                {bt(
                  "아직 작업한 작품이 없어요. 첫 작품을 만들면 여기에 이어갈 작품이 쌓여요.",
                  "No works yet. Once you create one, it will wait for you here.",
                )}
              </p>
              <p className="mt-1 text-xs leading-5 text-fg-2">
                {bt(
                  "빈 캔버스에서 가볍게 시작하거나, 가지고 있는 클튜·PSD·이미지 파일을 불러와 바로 이어 그릴 수 있어요.",
                  "Start fresh on a blank canvas, or import an existing CLIP/PSD/image file to continue right away.",
                )}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <Link
                  href="/studio/new?lane=blank"
                  style={{ minHeight: "44px" }}
                  className={buttonClass({
                    variant: "solid",
                    size: "sm",
                    className:
                      "min-h-11 scroll-my-24 gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  })}
                >
                  {bt("새 작품 만들기", "Create a new work")}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <Link
                  href="/studio/import"
                  style={{ minHeight: "44px" }}
                  className={buttonClass({
                    variant: "outline",
                    size: "sm",
                    className:
                      "min-h-11 scroll-my-24 gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  })}
                >
                  <Upload size={14} aria-hidden="true" />
                  {bt("내 파일 불러오기", "Import my file")}
                </Link>
                <Link
                  href="/studio"
                  style={{ minHeight: "44px" }}
                  className="inline-flex min-h-11 scroll-my-24 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-fg-2 transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {bt("작업실 둘러보기", "Look around the studio")}
                </Link>
              </div>
            </div>
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
            <Images size={15} aria-hidden="true" />
            {bt("창작 갤러리", "Creator gallery")}
          </Link>
          <Link
            href="/collaborate/gallery"
            style={{ minHeight: "44px" }}
            className="fx-press inline-flex min-h-11 scroll-my-24 items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Users size={15} aria-hidden="true" />
            {bt("창작자 커리어 갤러리", "Creator career gallery")}
          </Link>
        </div>
      </section>
    </>
  );
}
