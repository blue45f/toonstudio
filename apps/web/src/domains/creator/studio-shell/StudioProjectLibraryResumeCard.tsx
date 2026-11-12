import { ArrowRight, BookOpen } from "lucide-react";
import type { ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import type { StudioSaveProfile } from "../save-first/studio-save-profile";
import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import { StudioProjectCardThumbnail } from "./StudioProjectCardThumbnail";
import { studioProjectLibraryDateLabel, studioProjectLibraryTypeLabel } from "./studio-project-library-management-model";

/** 미리보기와 마지막 열기만 표시한다. 저장 프로필의 갱신을 원고 저장 완료로 승격하지 않는다. */
export function StudioProjectLibraryResumeCard({
  project, profile, authUserId, locale, resumeHref, overviewHref, onResume, resumeSummary, selection, management, checked,
}: {
  readonly project: StudioProjectLibraryEntry;
  readonly profile: StudioSaveProfile;
  readonly authUserId: string | null;
  readonly locale: string;
  readonly resumeHref: string;
  readonly overviewHref: string;
  readonly onResume: () => void;
  readonly resumeSummary?: string | null;
  readonly selection?: ReactNode;
  readonly management?: ReactNode;
  readonly checked?: boolean;
}) {
  const bt = useBilingual("StudioProjectLibraryResumeCard");
  const hasConflict = profile.bindings.some((binding) => binding.syncState === "conflict");
  const hasError = profile.bindings.some((binding) => binding.syncState === "error");
  const needsConnection = profile.bindings.some((binding) => binding.connectionRequired);
  const attention = hasConflict || hasError || needsConnection;
  const saveLabel = hasConflict
    ? bt("저장 충돌 확인", "Review save conflict")
    : hasError
      ? bt("저장 오류 확인", "Review save error")
      : needsConnection
        ? bt("저장소 연결 확인", "Check storage connection")
        : bt("원고의 저장 상태 확인", "Check manuscript save status");

  return (
    <article role="region" aria-label={bt("최근 작업 빠른 이어하기", "Quick resume recent work")}
      data-studio-recent-work-bar="true" data-studio-project-card="true" data-recent-primary="true"
      data-selected={checked || undefined} className="studio-library-resume">
      <div className="studio-library-resume-cover">
        <StudioProjectCardThumbnail project={project} authUserId={authUserId} locale={locale} variant="cover" />
      </div>
      <span className="studio-library-resume-eyebrow" data-studio-recent-badge="true">{bt("최근 작업", "Recent work")}</span>
      {selection ? <div className="studio-library-resume-selection">{selection}</div> : null}
      <div className="studio-library-resume-content">
        <h2 title={project.title} data-studio-recent-work-title="true" data-studio-project-title="true" className="line-clamp-2 break-words">
          <Link href={resumeHref} onClick={onResume} title={project.title} data-studio-card-title-link="true">{project.title}</Link>
        </h2>
        <p>{resumeSummary || studioProjectLibraryTypeLabel(project)}</p>
        <Link href={resumeHref} onClick={onResume} data-studio-recent-work-open="true"
          data-studio-library-primary-action="resume" data-studio-card-continue="true" className="studio-library-resume-open">
          {bt("이어서 작업", "Continue")}<ArrowRight size={20} aria-hidden="true" />
        </Link>
      </div>
      <div className="studio-library-resume-state">
        <p>{bt("마지막 열기", "Last opened")} {studioProjectLibraryDateLabel(project.lastOpenedAt, locale)}</p>
        {attention || !management ? <Link href={`/studio?view=storage&project=${encodeURIComponent(project.id)}`}
          data-studio-recent-save-attention={attention || undefined}>
          {saveLabel}
        </Link> : null}
        {!management ? <Link href={overviewHref} data-studio-recent-work-overview="true">
          <BookOpen size={16} aria-hidden="true" />{bt("작품 단계", "Project stages")}
        </Link> : null}
        {management ? <div className="studio-library-resume-management">{management}</div> : null}
      </div>
    </article>
  );
}
