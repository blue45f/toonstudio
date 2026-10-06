import { useLocation } from "react-router-dom";

import { EducationDirectoryPage } from "./EducationDirectoryPage";
import { LearnPage as LearnContent } from "./LearnContent";
import { LearningHome, LearningPathPage } from "./LearningHome";
import { LearningClassesPage } from "./LearningClassesPage";
import { LearningClassroomPage } from "./LearningClassroomPage";
import { LearningResourcesPage } from "./LearningResourcesPage";
import { LearningRecordsPage } from "./LearningRecordsPage";
import { LearnSectionShell } from "./LearnSectionShell";
import { TracePracticePage } from "./TracePracticePage";
import { WebtoonCareerPage } from "./WebtoonCareerPage";
import { WebtoonProcessPage } from "./WebtoonProcessPage";

import "./learning-academy.css";

/**
 * 학습 본문 전환 — 섹션 셸(내비·배너·진행 스트립)은 LearnSectionShell이 소유하고,
 * 이 컴포넌트는 /learn/* 경로별로 어떤 화면을 본문에 넣을지만 정한다.
 *
 * Public lazy entry; the enhanced home, reference guides and legacy lesson routes share the same document-local store.
 */
export function LearnPage() {
  const { pathname } = useLocation();
  const normalizedPath = pathname.replace(/\/+$/u, "") || "/";

  const isHome = normalizedPath === "/learn";
  const pathMatch = normalizedPath.match(/^\/learn\/paths\/([^/]+)$/u);
  const academyPage = normalizedPath === "/learn/resources"
    ? <LearningResourcesPage />
    : normalizedPath === "/learn/classroom"
      ? <LearningClassroomPage />
      : normalizedPath === "/learn/classes"
        ? <LearningClassesPage />
        : normalizedPath === "/learn/trace"
          ? <TracePracticePage />
          : null;
  const referencePage = normalizedPath === "/learn/process"
    ? <WebtoonProcessPage />
    : normalizedPath === "/learn/careers"
      ? <WebtoonCareerPage />
      : normalizedPath === "/learn/education"
        ? <EducationDirectoryPage />
        : null;

  return (
    <LearnSectionShell>
      {normalizedPath === "/learn/records" ? <LearningRecordsPage /> : academyPage ?? referencePage ?? (isHome ? <LearningHome /> : pathMatch ? <LearningPathPage pathId={pathMatch[1]} /> : <LearnContent />)}
    </LearnSectionShell>
  );
}
