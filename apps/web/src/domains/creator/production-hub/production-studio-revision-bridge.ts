import {
  inferProductionTaskDepartment,
  type ProductionDepartmentKey,
  type ProductionProjectAggregate,
  type ProductionTask,
  type RevisionRef,
  type ScopeRef as ProductionScopeRef,
  type Submission,
} from "@toonstudio/core/production";

import type {
  StudioProjectArtifactRecord,
  StudioProjectGraphSnapshot,
  StudioProjectRevisionRecord,
} from "../project-graph/studio-project-graph-client";

/**
 * 모델 문구 번역자. 컴포넌트/훅이 `useT()` 기반 번역자를 주입하면 사전 키로 해소하고,
 * 주입이 없으면 한국어 원문(폴백)을 그대로 돌려줘 기존 호출부·테스트와 동일하게 동작한다.
 */
export type ProductionRevisionBridgeTranslate = (
  key: string,
  fallback: string,
  values?: Readonly<Record<string, string | number>>,
) => string;

const defaultTranslate: ProductionRevisionBridgeTranslate = (_key, fallback, values) =>
  !values
    ? fallback
    : fallback.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
        Object.hasOwn(values, token) ? String(values[token]) : placeholder,
      );

export type ProductionStudioBindingStatus =
  | "bound"
  | "stale"
  | "unbound"
  | "no-compatible-revision";

export type ProductionStudioLineage = RevisionRef["lineage"];

export interface StudioRevisionCandidate {
  readonly artifactId: string;
  readonly artifactKind: StudioProjectArtifactRecord["kind"];
  readonly artifactTitle: string;
  readonly scope: StudioProjectArtifactRecord["scope"];
  readonly revision: StudioProjectRevisionRecord;
  readonly revisionRef: RevisionRef;
  readonly approved: boolean;
  readonly head: boolean;
}

export interface ProductionTaskRevisionBinding {
  readonly task: ProductionTask;
  readonly status: ProductionStudioBindingStatus;
  readonly department: ProductionDepartmentKey | null;
  readonly matched: StudioRevisionCandidate | null;
  readonly recommended: StudioRevisionCandidate | null;
  readonly reason: string;
}

export interface ProductionSubmissionRevisionBinding {
  readonly submission: Submission;
  readonly status: Exclude<ProductionStudioBindingStatus, "no-compatible-revision">;
  readonly matched: StudioRevisionCandidate | null;
  readonly reason: string;
}

export interface ProductionStudioRevisionAudit {
  readonly workMatches: boolean;
  readonly candidates: readonly StudioRevisionCandidate[];
  readonly tasks: readonly ProductionTaskRevisionBinding[];
  readonly submissions: readonly ProductionSubmissionRevisionBinding[];
  readonly boundTaskCount: number;
  readonly staleTaskCount: number;
  readonly unboundTaskCount: number;
  readonly recommendableTaskCount: number;
}
type ProductionRevisionBindingSource = Pick<
  ProductionProjectAggregate,
  "workId" | "tasks" | "submissions" | "assignments"
>;

const DEPARTMENT_ARTIFACT_KINDS: Readonly<
  Record<ProductionDepartmentKey, readonly StudioProjectArtifactRecord["kind"][]>
> = Object.freeze({
  story: ["story"],
  storyboard: ["storyboard", "canvas-2d"],
  "line-art": ["canvas-2d", "asset"],
  background: ["scene-3d", "canvas-2d", "asset"],
  color: ["canvas-2d", "asset"],
  lettering: ["canvas-2d", "localization"],
  localization: ["localization", "canvas-2d"],
  editorial: ["review-snapshot", "canvas-2d", "deliverable"],
  production: ["deliverable", "release", "canvas-2d", "audio"],
  rights: ["asset", "deliverable", "release"],
});

const ARTIFACT_LINEAGE: Readonly<
  Record<StudioProjectArtifactRecord["kind"], ProductionStudioLineage>
> = Object.freeze({
  story: "narrative",
  storyboard: "visual",
  "canvas-2d": "visual",
  "scene-3d": "visual",
  asset: "visual",
  audio: "integrated",
  localization: "integrated",
  "review-snapshot": "integrated",
  deliverable: "integrated",
  release: "integrated",
});

function productionScopeId(
  scope: StudioProjectArtifactRecord["scope"],
  kind: ProductionScopeRef["kind"],
): string | null {
  switch (kind) {
    case "project": return scope.projectId;
    case "season": return scope.seasonId ?? null;
    case "episode": return scope.episodeId ?? null;
    case "scroll-segment": return scope.sequenceId ?? null;
    case "scene": return scope.sceneId ?? null;
    case "cut": return scope.panelId ?? null;
    case "layer-group": return scope.elementId ?? null;
    case "asset": return scope.elementId ?? null;
    case "deliverable": return null;
  }
}

function artifactMatchesScope(
  candidate: StudioRevisionCandidate,
  scope: ProductionScopeRef,
): boolean {
  if (scope.kind === "project") return true;
  const direct = productionScopeId(candidate.scope, scope.kind);
  if (direct === scope.id) return true;
  return scope.ancestors.some((ancestor) =>
    productionScopeId(candidate.scope, ancestor.kind) === ancestor.id);
}
function stableRevisionNumber(
  revisions: readonly StudioProjectRevisionRecord[],
  revisionId: string,
): number {
  const ordered = [...revisions].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  return Math.max(1, ordered.findIndex((revision) => revision.id === revisionId) + 1);
}

function candidateOrder(
  left: StudioRevisionCandidate,
  right: StudioRevisionCandidate,
): number {
  return Number(right.approved) - Number(left.approved)
    || Number(right.head) - Number(left.head)
    || right.revision.createdAt.localeCompare(left.revision.createdAt)
    || right.revision.id.localeCompare(left.revision.id);
}

export function createStudioRevisionCandidates(
  project: StudioProjectGraphSnapshot,
  revisionsByArtifact: Readonly<Record<string, readonly StudioProjectRevisionRecord[]>>,
): readonly StudioRevisionCandidate[] {
  const candidates = project.artifacts.flatMap((artifact) => {
    const revisions = revisionsByArtifact[artifact.id] ?? [];
    return revisions.map((revision): StudioRevisionCandidate => ({
      artifactId: artifact.id,
      artifactKind: artifact.kind,
      artifactTitle: artifact.title,
      scope: artifact.scope,
      revision,
      revisionRef: {
        id: revision.id,
        lineage: ARTIFACT_LINEAGE[artifact.kind],
        revision: stableRevisionNumber(revisions, revision.id),
        digest: `sha256:${revision.rootGraphHash}`,
        createdAt: revision.createdAt,
      },
      approved: artifact.approvedRevisionId === revision.id,
      head: artifact.headRevisionId === revision.id,
    }));
  });
  return Object.freeze(candidates.sort(candidateOrder));
}

function findExactCandidate(
  candidates: readonly StudioRevisionCandidate[],
  refs: readonly RevisionRef[],
): StudioRevisionCandidate | null {
  for (const ref of refs) {
    const match = candidates.find((candidate) =>
      candidate.revisionRef.id === ref.id
      && candidate.revisionRef.digest === ref.digest
      && candidate.revisionRef.lineage === ref.lineage);
    if (match) return match;
  }
  return null;
}

function containsStaleStudioRef(
  candidates: readonly StudioRevisionCandidate[],
  refs: readonly RevisionRef[],
): boolean {
  return refs.some((ref) => candidates.some((candidate) =>
    candidate.revisionRef.id === ref.id
    && (candidate.revisionRef.digest !== ref.digest
      || candidate.revisionRef.lineage !== ref.lineage)));
}
function recommendedCandidate(
  task: ProductionTask,
  department: ProductionDepartmentKey | null,
  candidates: readonly StudioRevisionCandidate[],
): StudioRevisionCandidate | null {
  if (!department) return null;
  const acceptedKinds = DEPARTMENT_ARTIFACT_KINDS[department];
  return candidates
    .filter((candidate) =>
      acceptedKinds.includes(candidate.artifactKind)
      && artifactMatchesScope(candidate, task.scope))
    .sort((left, right) =>
      acceptedKinds.indexOf(left.artifactKind) - acceptedKinds.indexOf(right.artifactKind)
      || candidateOrder(left, right))[0] ?? null;
}

function taskBinding(
  source: ProductionRevisionBindingSource,
  task: ProductionTask,
  candidates: readonly StudioRevisionCandidate[],
  translate: ProductionRevisionBridgeTranslate,
): ProductionTaskRevisionBinding {
  const department = inferProductionTaskDepartment(task, source.assignments);
  const matched = findExactCandidate(candidates, task.inputRevisionRefs);
  const recommended = recommendedCandidate(task, department, candidates);
  if (matched) {
    return {
      task,
      status: "bound",
      department,
      matched,
      recommended,
      reason: translate("productionHub.revisionBinding.bound", "{title} {revisionId}에 고정됨", { title: matched.artifactTitle, revisionId: matched.revisionRef.id }),
    };
  }
  if (containsStaleStudioRef(candidates, task.inputRevisionRefs)) {
    return {
      task,
      status: "stale",
      department,
      matched: null,
      recommended,
      reason: translate("productionHub.revisionBinding.stale", "Studio revision ID는 같지만 digest 또는 lineage가 다릅니다."),
    };
  }
  if (!recommended) {
    return {
      task,
      status: "no-compatible-revision",
      department,
      matched: null,
      recommended: null,
      reason: translate("productionHub.revisionBinding.noCompatible", "작업 범위와 공정에 맞는 Studio 산출물 revision이 없습니다."),
    };
  }
  return {
    task,
    status: "unbound",
    department,
    matched: null,
    recommended,
    reason: recommended.approved
      ? translate("productionHub.revisionBinding.unboundApproved", "{title}의 승인 revision을 고정할 수 있습니다.", { title: recommended.artifactTitle })
      : translate("productionHub.revisionBinding.unboundLatest", "{title}의 최신 revision을 고정할 수 있습니다.", { title: recommended.artifactTitle }),
  };
}

function submissionBinding(
  submission: Submission,
  candidates: readonly StudioRevisionCandidate[],
  translate: ProductionRevisionBridgeTranslate,
): ProductionSubmissionRevisionBinding {
  const matched = findExactCandidate(candidates, [submission.revisionRef]);
  if (matched) {
    return {
      submission,
      status: "bound",
      matched,
      reason: translate("productionHub.revisionBinding.submissionBound", "{title} {revisionId} 제출본", { title: matched.artifactTitle, revisionId: matched.revisionRef.id }),
    };
  }
  if (containsStaleStudioRef(candidates, [submission.revisionRef])) {
    return {
      submission,
      status: "stale",
      matched: null,
      reason: translate("productionHub.revisionBinding.submissionStale", "제출 revision의 digest 또는 lineage가 Studio 정본과 다릅니다."),
    };
  }
  return {
    submission,
    status: "unbound",
    matched: null,
    reason: translate("productionHub.revisionBinding.submissionNotFound", "제출 revision을 현재 Studio ProjectGraph에서 찾을 수 없습니다."),
  };
}

export function auditProductionStudioRevisionBindings(
  source: ProductionRevisionBindingSource,
  project: StudioProjectGraphSnapshot,
  revisionsByArtifact: Readonly<Record<string, readonly StudioProjectRevisionRecord[]>>,
  translate: ProductionRevisionBridgeTranslate = defaultTranslate,
): ProductionStudioRevisionAudit {
  const candidates = createStudioRevisionCandidates(project, revisionsByArtifact);
  const tasks = source.tasks.map((task) => taskBinding(source, task, candidates, translate));
  const submissions = source.submissions.map((submission) =>
    submissionBinding(submission, candidates, translate));
  return Object.freeze({
    workMatches: source.workId === project.workId,
    candidates,
    tasks: Object.freeze(tasks),
    submissions: Object.freeze(submissions),
    boundTaskCount: tasks.filter((binding) => binding.status === "bound").length,
    staleTaskCount: tasks.filter((binding) => binding.status === "stale").length,
    unboundTaskCount: tasks.filter((binding) => binding.status === "unbound").length,
    recommendableTaskCount: tasks.filter((binding) =>
      binding.status !== "bound" && binding.recommended !== null).length,
  });
}

export function pinProductionTaskToStudioRevision(
  task: ProductionTask,
  candidate: StudioRevisionCandidate,
): ProductionTask {
  const existing = task.inputRevisionRefs.filter((revision) =>
    revision.id !== candidate.revisionRef.id);
  const next = [...existing, candidate.revisionRef].sort((left, right) =>
    left.lineage.localeCompare(right.lineage)
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id));
  return Object.freeze({
    ...task,
    inputRevisionRefs: Object.freeze(next),
  });
}

export function bridgeStatusLabel(
  status: ProductionStudioBindingStatus,
  translate: ProductionRevisionBridgeTranslate = defaultTranslate,
): string {
  switch (status) {
    case "bound": return translate("productionHub.revisionBinding.statusBound", "정본 연결");
    case "stale": return translate("productionHub.revisionBinding.statusStale", "불일치");
    case "unbound": return translate("productionHub.revisionBinding.statusUnbound", "연결 필요");
    case "no-compatible-revision": return translate("productionHub.revisionBinding.statusNoCompatible", "산출물 필요");
  }
}
