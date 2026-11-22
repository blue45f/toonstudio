import { ArrowRight, Clock3, LayoutGrid, Users } from "lucide-react";
import { useState } from "react";

import {
  ENGINEERING_HUB_TRACKS,
  ENGINEERING_QUICK_COURSES,
  ENGINEERING_READER_ROLES,
  HUB_TRACK_TOTAL_PAGES,
  hubTrackForPageId,
  hubTrackItemHref,
  hubTrackItemIcon,
  hubTrackItemLabel,
  type EngineeringHubTrack,
  type EngineeringHubTrackItem,
  type EngineeringQuickCourse,
  type EngineeringReaderRoleId,
} from "./engineering-hub-tracks";
import { findEngineeringPage, type EngineeringPageId } from "./engineering-tech-pages";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringTrackHub", ko, en);

function trackItemMeta(item: EngineeringHubTrackItem): string {
  if (item.kind === "companion") return bi(item.badge.ko, item.badge.en);
  const page = findEngineeringPage(item.pageId);
  if (page.readingMinutes) {
    return formatI18nTemplate(String(bi("약 {value0}분", "~{value0}m")), { value0: page.readingMinutes });
  }
  if (page.talkMinutes) {
    return formatI18nTemplate(String(bi("발표 {value0}분", "{value0}m talk")), { value0: page.talkMinutes });
  }
  return "";
}

function QuickCourseCard({
  course,
  highlighted,
}: {
  readonly course: EngineeringQuickCourse;
  readonly highlighted: boolean;
}) {
  return (
    <li className="flex">
      <div
        data-quick-course={course.id}
        data-highlighted={highlighted ? "true" : undefined}
        className={cx(
          "flex w-full flex-col gap-3 rounded-3xl border p-5 transition-colors",
          highlighted
            ? "border-accent bg-accent-soft/35 shadow-sm"
            : "border-line/70 bg-card/70 hover:border-accent/45",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent-soft px-3 py-1 text-xs font-black text-accent">
            <Clock3 size={13} aria-hidden="true" />
            {bi(course.durationBadge.ko, course.durationBadge.en)}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-fg-3">
            <Users size={13} aria-hidden="true" />
            {bi(course.audience.ko, course.audience.en)}
          </span>
        </div>

        <div className="grid gap-1.5">
          <h3 className="text-lg font-black tracking-tight text-fg">
            {bi(course.title.ko, course.title.en)}
          </h3>
          <p className="text-sm leading-6 text-fg-2">
            {bi(course.summary.ko, course.summary.en)}
          </p>
          <p className="text-xs leading-5 text-fg-3">
            {bi(course.scopeNote.ko, course.scopeNote.en)}
          </p>
        </div>

        <div className="mt-auto grid gap-2 border-t border-line/60 pt-3">
          <Link
            href={course.primaryHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            {bi(course.primaryLabel.ko, course.primaryLabel.en)}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <div className="flex flex-wrap gap-2">
            {course.companionLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-panel/75 px-3 py-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {bi(link.label.ko, link.label.en)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}

function HubTrackCard({
  track,
  highlighted,
}: {
  readonly track: EngineeringHubTrack;
  readonly highlighted: boolean;
}) {
  const TrackIcon = track.icon;
  const headingId = `engineering-hub-track-${track.id}`;

  return (
    <li className="flex">
      <section
        aria-labelledby={headingId}
        data-hub-track={track.id}
        data-highlighted={highlighted ? "true" : undefined}
        className={cx(
          "flex w-full flex-col gap-4 rounded-3xl border p-5 transition-colors sm:p-6",
          highlighted
            ? "border-accent bg-accent-soft/25 shadow-sm"
            : "border-line/70 bg-panel/65",
        )}
      >
        <header className="grid gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-card px-3 py-1 font-display text-xs font-black text-accent">
              <TrackIcon size={14} aria-hidden="true" />
              {formatI18nTemplate(String(bi("트랙 {value0}", "Track {value0}")), { value0: track.number })}
            </span>
            <span className="text-xs font-bold text-fg-3">
              {bi(track.audience.ko, track.audience.en)}
            </span>
          </div>
          <h3 id={headingId} className="mt-1 text-xl font-black tracking-tight text-fg">
            {bi(track.label.ko, track.label.en)}
          </h3>
          <p className="text-sm leading-6 text-fg-2">
            {bi(track.summary.ko, track.summary.en)}
          </p>
        </header>

        <ul className="mt-auto grid gap-2">
          {track.items.map((item) => {
            const href = hubTrackItemHref(item);
            const label = hubTrackItemLabel(item);
            const Icon = hubTrackItemIcon(item);
            const meta = trackItemMeta(item);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className="group flex min-h-11 items-center gap-3 rounded-2xl border border-line/65 bg-card/75 px-3.5 py-2.5 transition-colors hover:border-accent/50 hover:bg-raised/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-panel text-fg-3 group-hover:text-accent">
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-black text-fg group-hover:text-accent">
                        {bi(label.ko, label.en)}
                      </span>
                      {meta ? (
                        <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.68rem] font-bold text-fg-3">
                          {meta}
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs leading-5 text-fg-3">
                      {bi(item.roleSummary.ko, item.roleSummary.en)}
                    </span>
                  </span>
                  <ArrowRight
                    size={15}
                    className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:transform-none"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </li>
  );
}

/**
 * 12개 기술 페이지 + 경쟁 비교(`/about/compare`)를 4개 직관적 트랙과
 * 3분/15분/30분 목적별 1클릭 코스로 묶어 주는 통합 허브.
 */
export function EngineeringTrackHub({ className }: { readonly className?: string }) {
  useBilingualI18nRevision();
  const [selectedRole, setSelectedRole] = useState<EngineeringReaderRoleId>("all");

  const activeRole = selectedRole === "all"
    ? undefined
    : ENGINEERING_READER_ROLES.find((role) => role.id === selectedRole);

  return (
    <section
      className={cx("grid gap-8", className)}
      aria-labelledby="engineering-track-hub-title"
      data-engineering-track-hub=""
    >
      <div className="grid gap-4 rounded-[2rem] border border-line/70 bg-panel/70 p-5 shadow-sm sm:p-7">
        <div className="grid gap-2">
          <p className="eyebrow text-accent">UNIFIED TECH HUB · 4 TRACKS</p>
          <h2 id="engineering-track-hub-title" className="text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">
            {formatI18nTemplate(
              String(bi("{value0}개 기술 문서를 4개 트랙으로 정리했습니다", "{value0} engineering pages organized into 4 clear tracks")),
              { value0: HUB_TRACK_TOTAL_PAGES },
            )}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-fg-2">
            {bi(
              "기존 주소는 그대로 두고, 목적과 시간에 맞춰 한 번에 들어갈 수 있도록 4트랙과 3분·15분·30분 코스로 묶었습니다.",
              "Every existing URL stays intact while 4 tracks and 3/15/30-minute courses take you straight to the right page.",
            )}
          </p>
        </div>

        <div className="grid gap-3">
          <div
            role="group"
            aria-label={bi("역할별 빠른 점프", "Quick jump by role")}
            className="flex flex-wrap items-center gap-2"
          >
            <button
              type="button"
              aria-pressed={selectedRole === "all"}
              onClick={() => setSelectedRole("all")}
              className={cx(
                "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                selectedRole === "all"
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
              )}
            >
              {bi("전체 역할", "All roles")}
            </button>
            {ENGINEERING_READER_ROLES.map((role) => {
              const active = selectedRole === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedRole(active ? "all" : role.id)}
                  className={cx(
                    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
                  )}
                >
                  {bi(role.label.ko, role.label.en)}
                </button>
              );
            })}
          </div>

          {activeRole ? (
            <div
              role="region"
              aria-label={bi("선택한 역할 추천 바로가기", "Recommended links for selected role")}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-card/85 px-4 py-3"
            >
              <p className="text-sm font-bold text-fg">
                {bi(activeRole.question.ko, activeRole.question.en)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {activeRole.quickLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-2 text-xs font-black text-accent transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {bi(link.label.ko, link.label.en)}
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <ol aria-label={bi("목적별 1클릭 읽기 코스", "One-click reading courses")} className="grid gap-4 lg:grid-cols-3">
          {ENGINEERING_QUICK_COURSES.map((course) => (
            <QuickCourseCard
              key={course.id}
              course={course}
              highlighted={activeRole?.courseId === course.id}
            />
          ))}
        </ol>
      </div>

      <ul aria-label={bi("4개 기술 트랙", "Four technology tracks")} className="grid gap-4 md:grid-cols-2">
        {ENGINEERING_HUB_TRACKS.map((track) => (
          <HubTrackCard
            key={track.id}
            track={track}
            highlighted={activeRole?.trackId === track.id}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * 12개 하위 페이지 상단에 붙는 간결한 현재 트랙 형제 문서 전환 띠.
 * 현재 페이지는 링크 대신 상태 칩으로 표시해 문서 내 중복 링크를 만들지 않는다.
 */
export function EngineeringTrackSiblingBar({
  currentId,
  className,
}: {
  readonly currentId: EngineeringPageId;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const track = hubTrackForPageId(currentId);
  const TrackIcon = track.icon;

  return (
    <nav
      aria-label={bi("현재 트랙 빠른 이동", "Current track quick switch")}
      data-engineering-track-bar={track.id}
      className={cx(
        "mt-2 flex items-center gap-2 overflow-x-auto overscroll-x-contain rounded-2xl border border-line/70 bg-panel/55 px-3 py-1.5 print:hidden [scrollbar-width:thin]",
        className,
      )}
    >
      <span className="inline-flex min-h-11 shrink-0 items-center gap-1.5 pr-1 text-xs font-black text-accent">
        <TrackIcon size={14} aria-hidden="true" />
        <span className="whitespace-nowrap">
          {formatI18nTemplate(String(bi("트랙 {value0} · {value1}", "Track {value0} · {value1}")), {
            value0: track.number,
            value1: bi(track.label.ko, track.label.en),
          })}
        </span>
      </span>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />
      <ul className="flex shrink-0 items-center gap-1">
        {track.items.map((item) => {
          const isCurrent = item.kind === "page" && item.pageId === currentId;
          const label = hubTrackItemLabel(item);
          const href = hubTrackItemHref(item);
          if (isCurrent) {
            return (
              <li key={href} className="shrink-0">
                <span className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl border border-accent/40 bg-accent-soft px-3 text-xs font-black text-accent">
                  {bi(label.ko, label.en)}
                </span>
              </li>
            );
          }
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl border border-transparent px-3 text-xs font-bold text-fg-2 transition-colors hover:border-line hover:bg-card hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {bi(label.ko, label.en)}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/about/technology"
        className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <LayoutGrid size={13} aria-hidden="true" />
        {bi("4-트랙 허브", "4-track hub")}
      </Link>
    </nav>
  );
}
