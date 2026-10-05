/**
 * 스토리월드 반사실 시뮬레이션 — 장면 비활성화·이동, 사실 초기값 변경, 공개 제거 같은
 * 분기 변이를 원본에 적용하지 않고 분석해 기준선과 비교한다.
 *
 * 인과 엔진(studio-storyworld-causality)의 분석 함수를 그대로 재사용하며, 이 모듈은
 * 변이 적용·영향 장면 수집·후보 순위(파레토)만 담당한다.
 */
import {
  analyzeStoryworldProject,
  AXIS_ORDER,
  type StoryworldAnalysisResult,
  type StoryworldBranchCandidate,
  type StoryworldBranchMutation,
  type StoryworldCounterfactualResult,
  type StoryworldParetoCandidate,
  type StoryworldProject,
} from "./studio-storyworld-causality";

function applyBranchMutation(
  project: StoryworldProject,
  mutation: StoryworldBranchMutation,
): StoryworldProject {
  switch (mutation.kind) {
    case "disable-scene":
    case "enable-scene":
      return {
        ...project,
        scenes: project.scenes.map((scene) => scene.id === mutation.sceneId
          ? { ...scene, disabled: mutation.kind === "disable-scene" }
          : scene),
      };
    case "move-scene":
      return {
        ...project,
        scenes: project.scenes.map((scene) => scene.id === mutation.sceneId
          ? { ...scene, order: mutation.order }
          : scene),
      };
    case "set-fact":
      return {
        ...project,
        facts: project.facts.map((fact) => fact.id === mutation.factId
          ? { ...fact, initialValue: mutation.value }
          : fact),
      };
    case "remove-reveal":
      return {
        ...project,
        scenes: project.scenes.map((scene) => {
          if (scene.id !== mutation.sceneId) return scene;
          return {
            ...scene,
            reveals: (scene.reveals ?? [])
              .map((reveal) => reveal.factId === mutation.factId
                ? { ...reveal, audiences: reveal.audiences.filter((audience) => audience !== mutation.audience) }
                : reveal)
              .filter((reveal) => reveal.audiences.length > 0),
          };
        }),
      };
  }
}

function collectImpactedSceneIds(
  project: StoryworldProject,
  mutation: StoryworldBranchMutation,
): readonly string[] {
  const seedIds = new Set<string>();
  if ("sceneId" in mutation) seedIds.add(mutation.sceneId);
  if (mutation.kind === "set-fact") {
    for (const scene of project.scenes) {
      const touchesFact = (scene.preconditions ?? []).some((predicate) => predicate.factId === mutation.factId)
        || (scene.effects ?? []).some((effect) => effect.factId === mutation.factId)
        || (scene.knowledgeUses ?? []).some((use) => use.factId === mutation.factId)
        || (scene.reveals ?? []).some((reveal) => reveal.factId === mutation.factId);
      if (touchesFact) seedIds.add(scene.id);
    }
  }
  const reverseDependencies = new Map<string, string[]>();
  for (const scene of project.scenes) {
    for (const dependency of scene.dependsOnSceneIds ?? []) {
      const dependentIds = reverseDependencies.get(dependency) ?? [];
      dependentIds.push(scene.id);
      reverseDependencies.set(dependency, dependentIds);
    }
  }
  const queue = [...seedIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dependent of reverseDependencies.get(current) ?? []) {
      if (seedIds.has(dependent)) continue;
      seedIds.add(dependent);
      queue.push(dependent);
    }
  }
  const sceneById = new Map(project.scenes.map((scene) => [scene.id, scene]));
  return [...seedIds].sort((a, b) =>
    (sceneById.get(a)?.order ?? 0) - (sceneById.get(b)?.order ?? 0)
      || a.localeCompare(b),
  );
}

export function simulateStoryworldCounterfactual(
  project: StoryworldProject,
  mutation: StoryworldBranchMutation,
): StoryworldCounterfactualResult {
  const baseline = analyzeStoryworldProject(project);
  const branchProject = applyBranchMutation(project, mutation);
  const branch = analyzeStoryworldProject(branchProject);
  const baselineIssueIds = new Set(baseline.issues.map((issue) => issue.id));
  const branchIssueIds = new Set(branch.issues.map((issue) => issue.id));
  return {
    mutation,
    baseline,
    branch,
    scoreDelta: branch.overallScore - baseline.overallScore,
    addedIssueIds: [...branchIssueIds].filter((id) => !baselineIssueIds.has(id)).sort(),
    resolvedIssueIds: [...baselineIssueIds].filter((id) => !branchIssueIds.has(id)).sort(),
    impactedSceneIds: collectImpactedSceneIds(project, mutation),
  };
}

function dominates(
  left: StoryworldAnalysisResult,
  right: StoryworldAnalysisResult,
): boolean {
  const leftScores = new Map(left.axisScores.map((row) => [row.axis, row.score]));
  const rightScores = new Map(right.axisScores.map((row) => [row.axis, row.score]));
  let strictlyBetter = false;
  for (const axis of AXIS_ORDER) {
    const leftScore = leftScores.get(axis) ?? 0;
    const rightScore = rightScores.get(axis) ?? 0;
    if (leftScore < rightScore) return false;
    if (leftScore > rightScore) strictlyBetter = true;
  }
  return strictlyBetter;
}

/** Non-dominated branch ranking. No hidden aggregate weights decide the creative trade-off. */
export function rankStoryworldParetoFrontier(
  candidates: readonly StoryworldBranchCandidate[],
): readonly StoryworldParetoCandidate[] {
  return candidates.map((candidate) => {
    const dominatedByIds: string[] = [];
    const dominatesIds: string[] = [];
    for (const other of candidates) {
      if (other.id === candidate.id) continue;
      if (dominates(other.result, candidate.result)) dominatedByIds.push(other.id);
      if (dominates(candidate.result, other.result)) dominatesIds.push(other.id);
    }
    return {
      id: candidate.id,
      label: candidate.label,
      dominatedByIds: dominatedByIds.sort(),
      dominatesIds: dominatesIds.sort(),
      frontier: dominatedByIds.length === 0,
      overallScore: candidate.result.overallScore,
    };
  }).sort((a, b) => Number(b.frontier) - Number(a.frontier)
    || b.overallScore - a.overallScore
    || a.id.localeCompare(b.id));
}
