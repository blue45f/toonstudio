import { EXAMPLE_PROJECT_ID } from "../studio-example-project-content";
import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import { SAMPLE_PROJECT_ID } from "../studio-sample-manuscript-content";
import { studioLobbyRecentProjects } from "./studio-creator-lobby-model";

/** 기본 예제의 시딩은 개인 활동이 아니다. 실제 편집기 사용 맥락이 있으면 같은 원본도 이어한다. */
export function studioLibraryRecentWork(
  projects: readonly StudioProjectLibraryEntry[],
  resumeTarget: (project: StudioProjectLibraryEntry) => { readonly exact: boolean },
  limit = 1,
): readonly StudioProjectLibraryEntry[] {
  return studioLobbyRecentProjects(projects.filter((project) => (
    (project.id !== EXAMPLE_PROJECT_ID && project.id !== SAMPLE_PROJECT_ID)
    || resumeTarget(project).exact
  )), limit);
}
