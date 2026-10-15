/**
 * 점검 범위: 전체, 회차, 고른 장면.
 *
 * 범위는 "어느 장면에 걸린 발견만 볼 것인가"를 정한다. 문서나 점검 규칙은 바꾸지 않는다.
 * 문서가 바뀌어 사라진 회차·장면이 범위에 남아 있으면 조용히 걸러 내고, 비게 되면 전체로 돌아간다.
 */
import type { StoryworldProject } from "../studio-storyworld-causality";
import { sceneIdsForEpisodes } from "./studio-story-plausibility-report";

export type PlausibilityScope =
  | { readonly kind: "all" }
  | { readonly kind: "episodes"; readonly episodeNumbers: readonly number[] }
  | { readonly kind: "scenes"; readonly sceneIds: readonly string[] };

export const ALL_SCENES_SCOPE: PlausibilityScope = Object.freeze({ kind: "all" });

/** 사용 중인 장면이 속한 회차 번호(오름차순, 중복 없음). */
export function availableEpisodeNumbers(project: StoryworldProject): readonly number[] {
  const numbers = new Set<number>();
  for (const scene of project.scenes) {
    if (scene.disabled !== true && scene.episodeNumber !== undefined) numbers.add(scene.episodeNumber);
  }
  return [...numbers].sort((a, b) => a - b);
}

/** 문서에 없는 회차·장면을 걸러 낸다. 걸러 내고 남은 것이 없으면 전체 범위다. */
export function normalizeScope(project: StoryworldProject, scope: PlausibilityScope): PlausibilityScope {
  if (scope.kind === "episodes") {
    const available = new Set(availableEpisodeNumbers(project));
    const kept = [...new Set(scope.episodeNumbers)].filter((number) => available.has(number)).sort((a, b) => a - b);
    return kept.length > 0 ? { kind: "episodes", episodeNumbers: kept } : ALL_SCENES_SCOPE;
  }
  if (scope.kind === "scenes") {
    const active = new Set(project.scenes.filter((scene) => scene.disabled !== true).map((scene) => scene.id));
    const kept = [...new Set(scope.sceneIds)].filter((id) => active.has(id));
    return kept.length > 0 ? { kind: "scenes", sceneIds: kept } : ALL_SCENES_SCOPE;
  }
  return ALL_SCENES_SCOPE;
}

/** 리포트에 넘길 장면 id 목록. null이면 전체. */
export function scopeSceneIds(project: StoryworldProject, scope: PlausibilityScope): readonly string[] | null {
  const normalized = normalizeScope(project, scope);
  if (normalized.kind === "episodes") return sceneIdsForEpisodes(project, normalized.episodeNumbers);
  if (normalized.kind === "scenes") return normalized.sceneIds;
  return null;
}

export function describeScope(project: StoryworldProject, scope: PlausibilityScope): string {
  const normalized = normalizeScope(project, scope);
  if (normalized.kind === "episodes") {
    return `${normalized.episodeNumbers.map((number) => `${number}화`).join(", ")} (장면 ${scopeSceneIds(project, normalized)?.length ?? 0}개)`;
  }
  if (normalized.kind === "scenes") return `고른 장면 ${normalized.sceneIds.length}개`;
  return "전체 장면";
}
