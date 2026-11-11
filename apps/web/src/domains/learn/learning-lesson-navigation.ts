import { LESSONS } from "./learning-content";
import { getPathLessons, LEARNING_PATHS, type LearningPath } from "./learning-paths";

export function lessonUrlInContext(lessonId: string, path: LearningPath | null) {
  const url = `/learn/lessons/${encodeURIComponent(lessonId)}`;
  return path?.lessonIds.includes(lessonId) ? `${url}?from=${encodeURIComponent(path.id)}` : url;
}

/** 실제 경로에 속한 강좌만 선택한 경로의 순서를 따른다. */
export function resolveLessonNavigation(lessonId: string, from: string | null) {
  const path = LEARNING_PATHS.find((item) => item.id === from && item.lessonIds.includes(lessonId)) ?? null;
  const lessons = path ? getPathLessons(path) : LESSONS;
  const index = lessons.findIndex((item) => item.id === lessonId);
  const previous = index > 0 ? lessons[index - 1] : undefined;
  const next = index >= 0 ? lessons[index + 1] : undefined;
  return {
    path, lessons, index, previous, next,
    previousUrl: previous ? lessonUrlInContext(previous.id, path) : null,
    nextUrl: next ? lessonUrlInContext(next.id, path) : null,
    backUrl: path ? `/learn/paths/${encodeURIComponent(path.id)}` : "/learn#learn-library",
  };
}
