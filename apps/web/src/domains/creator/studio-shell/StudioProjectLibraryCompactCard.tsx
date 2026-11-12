import { Copy, Download, FolderOpen, Save } from "lucide-react";
import type { ComponentProps } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { StudioProjectCardThumbnail } from "./StudioProjectCardThumbnail";
import { StudioProjectLibraryCard, StudioProjectSaveBadge, StudioProjectSelectionCheckbox } from "./StudioProjectLibraryManagementUi";
import { studioProjectLibraryDateLabel } from "./studio-project-library-management-model";

/** 목록은 원고 찾기와 이어하기를 우선하고 관리 명령은 이름 있는 영역에서 다시 찾는다. */
export function StudioProjectLibraryCompactCard(props: ComponentProps<typeof StudioProjectLibraryCard>) {
  const bt = useBilingual("StudioProjectLibraryCompactCard");
  const { project, profile, locale, authUserId, checked, temporary, isMostRecent, localFileSaved, busy,
    continueHref, resumeSummary, resumeExact, overviewHref, storageHref, onToggle, onTouch, onOpenSave,
    onSavePackage, onDuplicate, onArchive, onTrash } = props;
  return (
    <article data-studio-project-card="true" data-selected={checked || undefined}
      data-recent-primary={isMostRecent || undefined} className="studio-library-project-row">
      <div className="studio-library-project-row-main">
        <StudioProjectSelectionCheckbox checked={checked}
          label={formatI18nTemplate(bt("{value0} 선택", "Select {value0}"), { value0: project.title })} onChange={onToggle} />
        <div className="studio-library-project-row-thumbnail">
          <StudioProjectCardThumbnail project={project} authUserId={authUserId} locale={locale} />
        </div>
        <div className="studio-library-project-row-description">
          <h3 title={project.title} data-studio-project-title="true" className="line-clamp-2 break-words">
            <Link href={continueHref} onClick={onTouch} data-studio-card-title-link="true">{project.title}</Link>
          </h3>
          <p>{bt("마지막 열기", "Last opened")} {studioProjectLibraryDateLabel(project.lastOpenedAt, locale)}</p>
          {isMostRecent ? <span data-studio-recent-badge="true" className="mr-1 text-xs font-semibold text-accent">{bt("최근 작업", "Most recent")}</span> : null}
          <StudioProjectSaveBadge profile={profile} locale={locale} />
          {resumeSummary ? <div className="studio-library-row-resume-context">
            <p>{resumeExact ? bt("최근 위치 기억됨", "Recent position remembered") : bt("최근 문서로 이동", "Continue in recent document")}</p>
            <p>{resumeSummary}</p>
          </div> : null}
        </div>
      </div>
      <div className="studio-library-project-row-actions">
        <Link href={continueHref} onClick={onTouch} data-studio-card-continue="true" className="studio-library-row-continue">
          <FolderOpen size={16} aria-hidden="true" />{bt("이어서 작업", "Continue")}
        </Link>
        {temporary ? (
          <button type="button" onClick={onOpenSave}><Save size={16} aria-hidden="true" />{bt("정식 저장", "Save")}</button>
        ) : localFileSaved ? (
          <button type="button" disabled={busy} onClick={onSavePackage}><Download size={16} aria-hidden="true" />{bt("파일 다시 저장", "Save file again")}</button>
        ) : (
          <Link href={storageHref}>{bt("저장·백업", "Save & backup")}</Link>
        )}
        <details className="studio-library-project-row-management">
          <summary>{bt("작업 관리", "Manage work")}</summary>
          <div>
            <Link href={overviewHref}>{bt("프로젝트 관리", "Manage project")}</Link>
            <Link href={storageHref}>{bt("저장 상태 확인", "Check save status")}</Link>
            <button type="button" onClick={onDuplicate}
              aria-label={formatI18nTemplate(bt("{value0} 복제", "Duplicate {value0}"), { value0: project.title })}>
              <Copy size={16} aria-hidden="true" />{bt("복제", "Duplicate")}
            </button>
            <button type="button" onClick={onArchive}>{bt("보관", "Archive")}</button>
            <button type="button" onClick={onTrash} className="text-danger">{bt("휴지통", "Trash")}</button>
          </div>
        </details>
      </div>
    </article>
  );
}
