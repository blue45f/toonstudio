import { useCallback, useMemo } from "react";

import { useI18n } from "@/shared/lib/i18n";

import { readStudioProjectLibrary, type StudioProjectLibraryEntry } from "../../studio-project-library-reader";
import { useStudioProjectLibrary } from "../../studio-shell/useStudioProjectLibrary";
import { readWorkspaceResume } from "../../workspace/studio-workspace-resume";
import { useStudioWorkspaceResume } from "../../workspace/useStudioWorkspaceResume";

export interface SpaceWorkProject {
  /** 라이브러리에 있는 현재 작품 제목. 없으면 null. */
  readonly title: string | null;
  /** 정확한 이어하기 원고 주소. 정확하지 않으면 null. */
  readonly resumeHref: string | null;
  readonly resumeSummary: string | null;
  /** 누르는 순간 저장소를 다시 읽어 같은 대상이면 true. 바뀌었으면 목록을 새로 고치고 false. */
  readonly verifyResume: (href: string) => boolean;
}

function workProject(
  projects: readonly StudioProjectLibraryEntry[], workId: string, personal: boolean,
): StudioProjectLibraryEntry | null {
  // 라이브러리는 최근 연 순서다. 개인 공간은 마지막으로 원고를 연 활성 작품 한 건만 제안한다.
  return projects.find((item) => item.status === "active" && (
    personal ? Boolean(item.lastOpenedDocumentId) : item.id === workId
  )) ?? null;
}

/** 현재 팀 작품 또는 개인 공간의 최근 원고. 조회만으로 작품 선택이나 열람 기록을 바꾸지 않는다. */
export function useSpaceWorkProject(workId: string, personal: boolean): SpaceWorkProject {
  const locale = useI18n((state) => state.lang.startsWith("ko") ? "ko" as const : "en" as const);
  const library = useStudioProjectLibrary(locale, "active");
  const project = useMemo(() => library.error ? null : workProject(library.projects, workId, personal),
    [library.error, library.projects, personal, workId]);
  const resume = useStudioWorkspaceResume(project, locale);
  const resumeHref = project && resume.status === "ready" && resume.target?.exact ? resume.target.href : null;
  const { reload } = library;
  const { refresh } = resume;
  const verifyResume = useCallback((href: string): boolean => {
    try {
      const latest = workProject(readStudioProjectLibrary(window.localStorage).projects, workId, personal);
      const next = readWorkspaceResume(() => window.localStorage, latest, locale);
      if (next.status === "ready" && next.target?.exact && next.target.href === href) return true;
    } catch {
      // 읽기 실패는 아래 새로 고침으로 복구한다.
    }
    reload(); refresh();
    return false;
  }, [locale, personal, reload, refresh, workId]);
  return { title: project?.title ?? null, resumeHref, resumeSummary: resume.target?.summary ?? null, verifyResume };
}
