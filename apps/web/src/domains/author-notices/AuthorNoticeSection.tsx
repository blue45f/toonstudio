/**
 * 작가 공지 독자 섹션 — 작품 페이지·작가 페이지에 게시된 공지를 보여준다.
 *
 * 공지가 없으면 아무것도 그리지 않는다(null). 카탈로그 작품 대부분은 외부
 * 플랫폼 크롤링 메타데이터라 공지가 없는 게 정상 상태이고, 빈 섹션을
 * 노이즈로 남기지 않는 것이 이 표면의 규칙이다.
 */

import { Megaphone } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  listPublishedNoticesForAuthor,
  listPublishedNoticesForWork,
} from "./author-notice-model";
import { useAuthorNoticeStore, useAuthorNoticesHydrated } from "./author-notice-store";
import type { AuthorNotice, AuthorNoticeKind } from "./author-notice-types";

const NOTICE_KIND_BADGE_CLASS: Record<AuthorNoticeKind, string> = {
  general: "bg-panel-2 text-fg-2",
  hiatus: "bg-warn/15 text-warn",
  resume: "bg-success/12 text-success",
  schedule: "bg-accent/12 text-accent",
};

export interface AuthorNoticeSectionProps {
  readonly authorName: string;
  /** 작품 페이지에서 넘긴다. 없으면 작가 전체 + 모든 작품 공지를 보여준다. */
  readonly workTitle?: string;
  readonly className?: string;
}

export function AuthorNoticeSection({ authorName, workTitle, className }: AuthorNoticeSectionProps) {
  const t = useBilingual("author-notices");
  const hydrated = useAuthorNoticesHydrated();
  const notices = useAuthorNoticeStore((state) => state.notices);

  if (!hydrated) return null;
  const published = workTitle
    ? listPublishedNoticesForWork(notices, authorName, workTitle)
    : listPublishedNoticesForAuthor(notices, authorName);
  if (published.length === 0) return null;

  const kindLabel = (kind: AuthorNoticeKind): string => {
    switch (kind) {
      case "hiatus":
        return t("휴재 안내", "Hiatus");
      case "resume":
        return t("연재 재개", "Resuming");
      case "schedule":
        return t("일정 변경", "Schedule change");
      default:
        return t("공지", "Notice");
    }
  };

  return (
    <section aria-label={t("작가 공지", "Author notices")} className={className}>
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-fg">
        <Megaphone size={15} className="text-accent" aria-hidden />
        {t("작가 공지", "Author notices")}
        <span className="numeral text-fg-3">{published.length}</span>
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {published.map((notice) => (
          <li key={notice.id}>
            <NoticeArticle notice={notice} kindLabel={kindLabel(notice.kind)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoticeArticle({
  notice,
  kindLabel,
}: {
  notice: AuthorNotice;
  kindLabel: string;
}) {
  return (
    <article className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${NOTICE_KIND_BADGE_CLASS[notice.kind]}`}
        >
          {kindLabel}
        </span>
        {notice.scope.kind === "work" && (
          <span className="inline-flex items-center rounded-full bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-fg-3">
            {notice.scope.workTitle}
          </span>
        )}
        {notice.publishedAt && (
          <time dateTime={notice.publishedAt} className="ml-auto text-xs text-fg-3">
            {new Date(notice.publishedAt).toLocaleDateString()}
          </time>
        )}
      </div>
      <h3 className="mt-2 text-sm font-semibold text-fg">{notice.title}</h3>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-fg-2">{notice.body}</p>
    </article>
  );
}
