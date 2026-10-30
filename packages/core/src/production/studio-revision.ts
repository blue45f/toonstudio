import { sameProductionRevision } from "./revision";

import type {
  Deliverable,
  EpisodeCollaboration,
  ProductionProjectAggregate,
  ProductionStudioDocumentRole,
  ProductionStudioRevisionLink,
  RevisionRef,
  Submission,
} from "./types";

const ROLE_LINEAGE: Readonly<Record<ProductionStudioDocumentRole, RevisionRef["lineage"]>> = {
  story: "narrative",
  thumbnail: "visual",
  lineart: "visual",
  background: "visual",
  color: "visual",
  lettering: "integrated",
  final: "integrated",
};

export function productionStudioDocumentRoleLineage(role: ProductionStudioDocumentRole): RevisionRef["lineage"] {
  return ROLE_LINEAGE[role];
}

const ROLE_TYPE_PATTERNS: readonly {
  readonly role: ProductionStudioDocumentRole;
  readonly patterns: readonly RegExp[];
}[] = [
  { role: "story", patterns: [/story/iu, /script/iu, /scenario/iu, /대본/iu] },
  { role: "thumbnail", patterns: [/thumbnail/iu, /storyboard/iu, /콘티/iu] },
  { role: "lineart", patterns: [/line[- ]?art/iu, /inking/iu, /선화/iu] },
  { role: "background", patterns: [/background/iu, /bg/iu, /배경/iu] },
  { role: "color", patterns: [/colou?r/iu, /effect/iu, /채색/iu, /효과/iu] },
  { role: "lettering", patterns: [/lettering/iu, /locali[sz]ation/iu, /식자/iu, /번역/iu] },
  { role: "final", patterns: [/integrated/iu, /proof/iu, /publication/iu, /final/iu, /게시/iu, /통합/iu] },
];

function belongsToEpisode(deliverable: Deliverable, episodeId: string): boolean {
  return (deliverable.scope.kind === "episode" && deliverable.scope.id === episodeId)
    || deliverable.scope.ancestors.some((ancestor) => (
      ancestor.kind === "episode" && ancestor.id === episodeId
    ));
}

function upsertById<T extends { readonly id: string }>(
  values: readonly T[],
  value: T,
): readonly T[] {
  return values.some((entry) => entry.id === value.id)
    ? values.map((entry) => entry.id === value.id ? value : entry)
    : [...values, value];
}

export function inferProductionStudioDocumentRole(
  deliverableType: string,
): ProductionStudioDocumentRole | null {
  const normalized = deliverableType.trim();
  if (!normalized) return null;
  return ROLE_TYPE_PATTERNS.find((entry) => (
    entry.patterns.some((pattern) => pattern.test(normalized))
  ))?.role ?? null;
}

/** 새 제출의 명시적 역할을 우선하며 기존 산출물 정의의 역할 추론은 보존한다. */
export function productionStudioDeliverableRole(
  aggregate: ProductionProjectAggregate,
  deliverable: Deliverable,
): ProductionStudioDocumentRole | null {
  if (deliverable.projectId !== aggregate.projectId) return null;
  for (const id of [deliverable.currentSubmissionId, deliverable.approvedSubmissionId]) {
    if (!id) continue;
    const submission = aggregate.submissions.find((entry) => entry.id === id && entry.projectId === aggregate.projectId
      && entry.deliverableId === deliverable.id);
    if (submission?.sourceEvidence) return submission.sourceEvidence.documentRole;
  }
  return inferProductionStudioDocumentRole(deliverable.type);
}

export function validateProductionStudioRevisionLink(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly link: ProductionStudioRevisionLink;
}): readonly string[] {
  const { aggregate, link } = input;
  const issues: string[] = [];
  if (link.projectId !== aggregate.projectId) issues.push("studio-link-project-mismatch");
  if (link.workId !== aggregate.workId) issues.push("studio-link-work-mismatch");
  if (!link.studioDocumentRef.trim()) issues.push("studio-link-document-ref-missing");
  if (link.studioRevisionRef.revision < 1) issues.push("studio-link-revision-invalid");
  if (ROLE_LINEAGE[link.documentRole] !== link.studioRevisionRef.lineage) {
    issues.push("studio-link-lineage-mismatch");
  }
  if (link.episodeId && !aggregate.episodes.some((episode) => episode.episodeId === link.episodeId)) {
    issues.push("studio-link-episode-missing");
  }
  const deliverable = aggregate.deliverables.find((entry) => entry.id === link.deliverableId) ?? null;
  if (!deliverable) issues.push("studio-link-deliverable-missing");
  if (deliverable && link.episodeId && !belongsToEpisode(deliverable, link.episodeId)) {
    issues.push("studio-link-deliverable-scope-mismatch");
  }
  const submission = aggregate.submissions.find((entry) => entry.id === link.submissionId) ?? null;
  if (!submission) issues.push("studio-link-submission-missing");
  if (submission && submission.deliverableId !== link.deliverableId) {
    issues.push("studio-link-submission-deliverable-mismatch");
  }
  if (submission && !sameProductionRevision(submission.revisionRef, link.studioRevisionRef)) {
    issues.push("studio-link-submission-revision-mismatch");
  }
  if (submission?.sourceEvidence?.version === 1 && link.documentRole !== submission.sourceEvidence.documentRole) {
    issues.push("studio-link-submission-role-mismatch");
  }
  if (link.status === "approved") {
    if (submission?.status !== "approved") issues.push("studio-link-submission-not-approved");
    if (deliverable?.approvedSubmissionId !== link.submissionId) {
      issues.push("studio-link-deliverable-not-approved");
    }
    if (!link.approvedAt) issues.push("studio-link-approved-at-missing");
  } else if (link.approvedAt) {
    issues.push("studio-link-approved-at-unexpected");
  }
  const assignment = aggregate.assignments.find((entry) => entry.id === link.linkedByAssignmentId);
  if (!assignment || assignment.status !== "active") {
    issues.push("studio-link-active-assignment-missing");
  }
  return Object.freeze([...new Set(issues)]);
}

function updateEpisodeRevision(
  episode: EpisodeCollaboration,
  link: ProductionStudioRevisionLink,
): EpisodeCollaboration {
  if (link.status !== "approved") return episode;
  if (link.documentRole === "story") {
    return Object.freeze({ ...episode, narrativeRevisionRef: link.studioRevisionRef, revision: episode.revision + 1 });
  }
  if (
    link.documentRole === "thumbnail"
    || link.documentRole === "lineart"
    || link.documentRole === "background"
    || link.documentRole === "color"
  ) {
    return Object.freeze({ ...episode, visualRevisionRef: link.studioRevisionRef, revision: episode.revision + 1 });
  }
  return Object.freeze({ ...episode, integratedRevisionRef: link.studioRevisionRef, revision: episode.revision + 1 });
}

export function applyProductionStudioRevisionLink(
  aggregate: ProductionProjectAggregate,
  link: ProductionStudioRevisionLink,
): ProductionProjectAggregate {
  const currentLinks = aggregate.studioRevisionLinks ?? [];
  const superseded = currentLinks.map((entry) => {
    const sameSlot = entry.id !== link.id
      && entry.status !== "superseded"
      && entry.episodeId === link.episodeId
      && entry.documentRole === link.documentRole
      && entry.deliverableId === link.deliverableId;
    return sameSlot ? Object.freeze({ ...entry, status: "superseded" as const }) : entry;
  });
  const previous = currentLinks.find((entry) => entry.id === link.id) ?? null;
  const unchangedApproval = previous?.status === "approved"
    && link.status === "approved"
    && previous.episodeId === link.episodeId
    && previous.documentRole === link.documentRole
    && sameProductionRevision(previous.studioRevisionRef, link.studioRevisionRef);
  const studioRevisionLinks = Object.freeze(upsertById(superseded, link));
  const episodes = link.episodeId && !unchangedApproval
    ? aggregate.episodes.map((episode) => (
        episode.episodeId === link.episodeId ? updateEpisodeRevision(episode, link) : episode
      ))
    : aggregate.episodes;
  return Object.freeze({ ...aggregate, studioRevisionLinks, episodes });
}

export interface ProductionStudioRevisionCoverage {
  readonly episodeId: string;
  readonly expectedRoles: readonly ProductionStudioDocumentRole[];
  readonly approvedRoles: readonly ProductionStudioDocumentRole[];
  readonly pendingRoles: readonly ProductionStudioDocumentRole[];
  readonly missingRoles: readonly ProductionStudioDocumentRole[];
  readonly activeLinks: readonly ProductionStudioRevisionLink[];
  readonly readyForIntegratedReview: boolean;
}

export function evaluateProductionStudioRevisionCoverage(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
): ProductionStudioRevisionCoverage {
  const deliverablesByRole = new Map<ProductionStudioDocumentRole, Deliverable[]>();
  for (const deliverable of aggregate.deliverables) {
    if (deliverable.projectId !== aggregate.projectId || !belongsToEpisode(deliverable, episodeId)) continue;
    const role = productionStudioDeliverableRole(aggregate, deliverable);
    if (!role) continue;
    const related = deliverablesByRole.get(role) ?? [];
    related.push(deliverable); deliverablesByRole.set(role, related);
  }
  const expectedRoles = [...deliverablesByRole.keys()];
  const activeLinks = (aggregate.studioRevisionLinks ?? [])
    .filter((link) => link.episodeId === episodeId && link.status !== "superseded")
    .sort((left, right) => right.linkedAt.localeCompare(left.linkedAt));
  const linksByDeliverable = new Map<string, ProductionStudioRevisionLink[]>();
  for (const link of activeLinks) {
    const related = linksByDeliverable.get(link.deliverableId) ?? [];
    related.push(link); linksByDeliverable.set(link.deliverableId, related);
  }
  const approvedRoles: ProductionStudioDocumentRole[] = [], pendingRoles: ProductionStudioDocumentRole[] = [], missingRoles: ProductionStudioDocumentRole[] = [];
  for (const [role, deliverables] of deliverablesByRole) {
    const states = deliverables.map((deliverable): "approved" | "pending" | "missing" => {
      const current = aggregate.submissions.filter((submission) => submission.id === deliverable.currentSubmissionId
        && submission.projectId === aggregate.projectId && submission.deliverableId === deliverable.id);
      const submission = current[0];
      if (current.length !== 1 || !submission || submission.status === "superseded") return "missing";
      const links = (linksByDeliverable.get(deliverable.id) ?? []).filter((link) => link.documentRole === role
        && link.submissionId === submission.id && sameProductionRevision(link.studioRevisionRef, submission.revisionRef)
        // 현재 정본의 승인 이력은 기록 후 담당자가 종료되어도 유지한다.
        && validateProductionStudioRevisionLink({ aggregate, link })
          .every((issue) => issue === "studio-link-active-assignment-missing"));
      if (deliverable.approvedSubmissionId === submission.id && submission.status === "approved"
        && links.some((link) => link.status === "approved")) return "approved";
      return links.some((link) => link.status === "submitted") ? "pending" : "missing";
    });
    if (states.every((state) => state === "approved")) approvedRoles.push(role);
    else if (states.every((state) => state !== "missing")) pendingRoles.push(role);
    else missingRoles.push(role);
  }
  return Object.freeze({
    episodeId,
    expectedRoles: Object.freeze(expectedRoles),
    approvedRoles: Object.freeze(approvedRoles),
    pendingRoles: Object.freeze(pendingRoles),
    missingRoles: Object.freeze(missingRoles),
    activeLinks: Object.freeze(activeLinks),
    readyForIntegratedReview: expectedRoles.length > 0
      && missingRoles.length === 0
      && pendingRoles.length === 0
      && approvedRoles.includes("final"),
  });
}

export function productionStudioLinkSubmission(
  aggregate: ProductionProjectAggregate,
  link: ProductionStudioRevisionLink,
): Submission | null {
  return aggregate.submissions.find((submission) => submission.id === link.submissionId) ?? null;
}
