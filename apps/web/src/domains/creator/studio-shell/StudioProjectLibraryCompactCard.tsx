import { ChevronRight, Copy, Download, Save } from "lucide-react";
import type { ComponentProps } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { StudioProjectCardThumbnail } from "./StudioProjectCardThumbnail";
import { StudioProjectLibraryCard, StudioProjectSaveBadge, StudioProjectSelectionCheckbox } from "./StudioProjectLibraryManagementUi";
import { studioProjectLibraryDateLabel, studioProjectLibraryTypeLabel } from "./studio-project-library-management-model";

type CardProps = ComponentProps<typeof StudioProjectLibraryCard>;

/** 최근 원고와 나머지 목록 모두 같은 저장·복구 명령을 사용한다. */
export function StudioProjectLibraryCardActions(props: CardProps) {
  const bt = useBilingual("StudioProjectLibraryCompactCard");
  const { project, profile, locale, temporary, localFileSaved, busy, overviewHref, storageHref,
    onOpenSave, onSavePackage, onDuplicate, onArchive, onTrash } = props;
  return <details className="studio-library-project-row-management">
    <summary>{bt("작업 관리", "Manage work")}</summary>
    <div>
      <p>{bt("마지막 열기", "Last opened")} {studioProjectLibraryDateLabel(project.lastOpenedAt, locale)}</p>
      <StudioProjectSaveBadge profile={profile} locale={locale} />
      {temporary ? (
        <button type="button" onClick={onOpenSave}><Save size={16} aria-hidden="true" />{bt("정식 저장", "Save")}</button>
      ) : localFileSaved ? (
        <button type="button" disabled={busy} onClick={onSavePackage}><Download size={16} aria-hidden="true" />{bt("파일 다시 저장", "Save file again")}</button>
      ) : <Link href={storageHref}>{bt("저장·백업", "Save & backup")}</Link>}
      <Link href={overviewHref} data-studio-recent-work-overview={props.isMostRecent || undefined}>{bt("작품 단계", "Project stages")}</Link>
      <Link href={storageHref}>{bt("저장 상태 확인", "Check save status")}</Link>
      <button type="button" onClick={onDuplicate}
        aria-label={formatI18nTemplate(bt("{value0} 복제", "Duplicate {value0}"), { value0: project.title })}>
        <Copy size={16} aria-hidden="true" />{bt("복제", "Duplicate")}
      </button>
      <button type="button" onClick={onArchive}>{bt("보관", "Archive")}</button>
      <button type="button" onClick={onTrash} className="text-danger">{bt("휴지통", "Trash")}</button>
    </div>
  </details>;
}

/** 목록은 원고 찾기와 이어하기를 우선하고 관리 명령은 이름 있는 영역에서 다시 찾는다. */
export function StudioProjectLibraryCompactCard(props: CardProps & { readonly selectionVisible?: boolean }) {
  const bt = useBilingual("StudioProjectLibraryCompactCard");
  const { project, profile, locale, authUserId, checked, isMostRecent, continueHref,
    resumeSummary, storageHref, onToggle, onTouch, selectionVisible = true } = props;
  const attention = profile.bindings.some((binding) => binding.syncState === "conflict"
    || binding.syncState === "error" || binding.connectionRequired);
  return (
    <article data-studio-project-card="true" data-selected={checked || undefined}
      data-recent-primary={isMostRecent || undefined} className="studio-library-project-row">
      <div className="studio-library-project-row-main">
        {selectionVisible ? <StudioProjectSelectionCheckbox checked={checked}
          label={formatI18nTemplate(bt("{value0} 선택", "Select {value0}"), { value0: project.title })} onChange={onToggle} /> : null}
        <div className="studio-library-project-row-thumbnail">
          <StudioProjectCardThumbnail project={project} authUserId={authUserId} locale={locale} variant="cover" />
        </div>
        <div className="studio-library-project-row-description">
          <h3 title={project.title} data-studio-project-title="true" className="line-clamp-2 break-words">
            <Link href={continueHref} onClick={onTouch} data-studio-card-title-link="true">{project.title}</Link>
          </h3>
          <p className="studio-library-row-resume-context">{resumeSummary || studioProjectLibraryTypeLabel(project)}</p>
        </div>
        <Link href={continueHref} onClick={onTouch} data-studio-card-continue="true" className="studio-library-row-continue"
          aria-label={bt("이어서 작업", "Continue")} aria-description={project.title}>
          <span aria-hidden="true">{bt("이어서 작업", "Continue")}</span><ChevronRight size={18} aria-hidden="true" /><span className="sr-only">{project.title}</span>
        </Link>
      </div>
      <div className="studio-library-project-row-actions">
        {attention ? <Link href={storageHref} className="studio-library-row-save-attention"><StudioProjectSaveBadge profile={profile} locale={locale} /></Link> : null}
        <StudioProjectLibraryCardActions {...props} />
      </div>
    </article>
  );
}
