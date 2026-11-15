import type {
  CutPlan,
  Deliverable,
  ProductionProjectAggregate,
  Submission,
} from "@toonstudio/core/production";

import type { StudioReviewHistoryDocument } from "../studio-review-history-store";
import type { StudioReviewSession } from "../studio-review-workflow";

export type ProductionReviewDeepLinkParamKey = "task" | "episode" | "cut" | "submission" | "revision";

const DEEP_LINK_KEYS: readonly ProductionReviewDeepLinkParamKey[] = [
  "task",
  "episode",
  "cut",
  "submission",
  "revision",
];

export interface ParsedProductionReviewDeepLinkParams {
  readonly task?: string;
  readonly episode?: string;
  readonly cut?: string;
  readonly submission?: string;
  readonly revision?: string;
  readonly duplicateKeys: readonly ProductionReviewDeepLinkParamKey[];
}

export function parseProductionReviewDeepLinkParams(
  source: string | URLSearchParams,
): ParsedProductionReviewDeepLinkParams {
  const params = typeof source === "string"
    ? new URLSearchParams(source.startsWith("?") ? source.slice(1) : source)
    : source;

  const duplicateKeys: ProductionReviewDeepLinkParamKey[] = [];
  const readSingle = (key: ProductionReviewDeepLinkParamKey): string | undefined => {
    if (!params.has(key)) return undefined;
    const values = params.getAll(key);
    if (values.length !== 1) {
      duplicateKeys.push(key);
      return "";
    }
    return values[0] ?? "";
  };

  const task = readSingle("task");
  const episode = readSingle("episode");
  const cut = readSingle("cut");
  const submission = readSingle("submission");
  const revision = readSingle("revision");

  return {
    ...(task !== undefined ? { task } : {}),
    ...(episode !== undefined ? { episode } : {}),
    ...(cut !== undefined ? { cut } : {}),
    ...(submission !== undefined ? { submission } : {}),
    ...(revision !== undefined ? { revision } : {}),
    duplicateKeys: DEEP_LINK_KEYS.filter((key) => duplicateKeys.includes(key)),
  };
}

export interface BuildProductionReviewDeepLinkInput {
  readonly projectId: string;
  readonly taskId?: string | null;
  readonly episodeId?: string | null;
  readonly cutId?: string | null;
  readonly submissionId?: string | null;
  readonly revisionId?: string | null;
}

export function buildProductionReviewDeepLinkSearch(
  input: Omit<BuildProductionReviewDeepLinkInput, "projectId">,
  existing?: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(existing);
  for (const key of DEEP_LINK_KEYS) next.delete(key);
  if (input.taskId) next.set("task", input.taskId);
  if (input.episodeId) next.set("episode", input.episodeId);
  if (input.cutId) next.set("cut", input.cutId);
  if (input.submissionId) next.set("submission", input.submissionId);
  if (input.revisionId) next.set("revision", input.revisionId);
  return next;
}

export function buildProductionReviewDeepLinkPath(input: BuildProductionReviewDeepLinkInput): string {
  const query = buildProductionReviewDeepLinkSearch(input).toString();
  const base = `/production/projects/${encodeURIComponent(input.projectId)}/review`;
  return query ? `${base}?${query}` : base;
}

export type PinnedCutResolutionIssue = "duplicate-cut" | "missing-cut";

export interface PinnedCutResolution {
  readonly explicit: boolean;
  readonly cutId: string | null;
  readonly issue: PinnedCutResolutionIssue | null;
}

export function resolvePinnedCutFromParams(input: {
  readonly cuts: readonly CutPlan[];
  readonly requestedCutId?: string;
  readonly duplicateKeys?: readonly ProductionReviewDeepLinkParamKey[];
}): PinnedCutResolution {
  if (input.duplicateKeys?.includes("cut")) {
    return { explicit: true, cutId: null, issue: "duplicate-cut" };
  }
  if (input.requestedCutId === undefined) {
    return { explicit: false, cutId: input.cuts[0]?.cutId ?? null, issue: null };
  }
  const trimmed = input.requestedCutId.trim();
  if (!trimmed) {
    return { explicit: true, cutId: null, issue: "missing-cut" };
  }
  const matched = input.cuts.find((cut) => cut.cutId === trimmed) ?? null;
  if (!matched) {
    return { explicit: true, cutId: null, issue: "missing-cut" };
  }
  return { explicit: true, cutId: matched.cutId, issue: null };
}

export type PinnedSubmissionResolutionIssue =
  | "duplicate-param"
  | "missing-submission"
  | "missing-revision"
  | "revision-conflict"
  | "ambiguous-revision";

export interface PinnedSubmissionResolution {
  readonly explicit: boolean;
  readonly matched: Submission | null;
  readonly issue: PinnedSubmissionResolutionIssue | null;
}

export function resolvePinnedSubmissionFromParams(input: {
  readonly allDeliverableSubmissions: readonly Submission[];
  readonly requestedSubmissionId?: string;
  readonly requestedRevisionId?: string;
  readonly duplicateKeys?: readonly ProductionReviewDeepLinkParamKey[];
}): PinnedSubmissionResolution {
  if (
    input.duplicateKeys?.includes("submission")
    || input.duplicateKeys?.includes("revision")
  ) {
    return { explicit: true, matched: null, issue: "duplicate-param" };
  }
  const hasSubmission = input.requestedSubmissionId !== undefined;
  const hasRevision = input.requestedRevisionId !== undefined;
  if (!hasSubmission && !hasRevision) {
    return { explicit: false, matched: null, issue: null };
  }

  const submissionId = input.requestedSubmissionId?.trim() ?? "";
  const revisionId = input.requestedRevisionId?.trim() ?? "";

  if (hasSubmission) {
    if (!submissionId) {
      return { explicit: true, matched: null, issue: "missing-submission" };
    }
    const byId = input.allDeliverableSubmissions.find((entry) => entry.id === submissionId) ?? null;
    if (!byId) {
      return { explicit: true, matched: null, issue: "missing-submission" };
    }
    if (hasRevision && (!revisionId || byId.revisionRef.id !== revisionId)) {
      return { explicit: true, matched: null, issue: "revision-conflict" };
    }
    return { explicit: true, matched: byId, issue: null };
  }

  if (!revisionId) {
    return { explicit: true, matched: null, issue: "missing-revision" };
  }
  const matches = input.allDeliverableSubmissions.filter(
    (entry) => entry.revisionRef.id === revisionId,
  );
  if (matches.length === 0) {
    return { explicit: true, matched: null, issue: "missing-revision" };
  }
  if (matches.length > 1) {
    return { explicit: true, matched: null, issue: "ambiguous-revision" };
  }
  return { explicit: true, matched: matches[0] ?? null, issue: null };
}

export type SubmissionRevisionFreshness =
  | { readonly kind: "none"; readonly deliverable: null; readonly latestSubmission: null }
  | { readonly kind: "latest"; readonly deliverable: Deliverable | null; readonly latestSubmission: Submission }
  | { readonly kind: "historical"; readonly deliverable: Deliverable | null; readonly latestSubmission: Submission | null };

export function resolveSubmissionRevisionFreshness(
  aggregate: ProductionProjectAggregate,
  submission: Submission | null,
): SubmissionRevisionFreshness {
  if (!submission) {
    return { kind: "none", deliverable: null, latestSubmission: null };
  }
  const deliverable = aggregate.deliverables.find(
    (entry) => entry.id === submission.deliverableId && entry.projectId === aggregate.projectId,
  ) ?? null;

  const sameDeliverableSubmissions = aggregate.submissions.filter(
    (entry) => entry.projectId === aggregate.projectId && entry.deliverableId === submission.deliverableId,
  );
  const currentPointer = deliverable?.currentSubmissionId
    ? sameDeliverableSubmissions.find((entry) => entry.id === deliverable.currentSubmissionId) ?? null
    : null;
  const highestRevision = [...sameDeliverableSubmissions]
    .filter((entry) => entry.status !== "superseded")
    .sort((left, right) => right.revisionRef.revision - left.revisionRef.revision)[0] ?? null;

  const latestSubmission = currentPointer ?? highestRevision;
  const isHistorical =
    submission.status === "superseded"
    || (deliverable !== null && deliverable.currentSubmissionId !== submission.id)
    || (latestSubmission !== null && latestSubmission.id !== submission.id);

  if (isHistorical) {
    return {
      kind: "historical",
      deliverable,
      latestSubmission: latestSubmission && latestSubmission.id !== submission.id ? latestSubmission : currentPointer,
    };
  }
  return {
    kind: "latest",
    deliverable,
    latestSubmission: submission,
  };
}

export interface CollabHubDeepLinkResolution {
  readonly episodeId: string;
  readonly selectedCutId: string | null;
  readonly cutIssue: boolean;
  readonly viewedSession: StudioReviewSession;
  readonly isHistoricalRevision: boolean;
  readonly revisionIssue: boolean;
}

export function resolveCollabHubDeepLinkState(input: {
  readonly search: string | URLSearchParams;
  readonly validCutIds: readonly string[];
  readonly defaultCutId: string;
  readonly headSession: StudioReviewSession;
  readonly history: StudioReviewHistoryDocument;
}): CollabHubDeepLinkResolution {
  const parsed = parseProductionReviewDeepLinkParams(input.search);
  const episodeId = parsed.episode?.trim() || "episode-12";

  let selectedCutId: string | null = input.defaultCutId;
  let cutIssue = false;
  if (parsed.duplicateKeys.includes("cut")) {
    selectedCutId = null;
    cutIssue = true;
  } else if (parsed.cut !== undefined) {
    const trimmedCut = parsed.cut.trim();
    if (trimmedCut && input.validCutIds.includes(trimmedCut)) {
      selectedCutId = trimmedCut;
    } else {
      selectedCutId = null;
      cutIssue = true;
    }
  }

  if (parsed.duplicateKeys.includes("revision")) {
    return {
      episodeId,
      selectedCutId,
      cutIssue,
      viewedSession: input.headSession,
      isHistoricalRevision: false,
      revisionIssue: true,
    };
  }

  if (parsed.revision === undefined) {
    return {
      episodeId,
      selectedCutId,
      cutIssue,
      viewedSession: input.headSession,
      isHistoricalRevision: false,
      revisionIssue: false,
    };
  }

  const trimmedRev = parsed.revision.trim();
  if (!trimmedRev) {
    return {
      episodeId,
      selectedCutId,
      cutIssue,
      viewedSession: input.headSession,
      isHistoricalRevision: false,
      revisionIssue: true,
    };
  }

  if (trimmedRev === input.headSession.versionId) {
    return {
      episodeId,
      selectedCutId,
      cutIssue,
      viewedSession: input.headSession,
      isHistoricalRevision: false,
      revisionIssue: false,
    };
  }

  const archived = [...input.history.sessions]
    .reverse()
    .find((item) => item.versionId === trimmedRev) ?? null;

  if (!archived) {
    return {
      episodeId,
      selectedCutId,
      cutIssue,
      viewedSession: input.headSession,
      isHistoricalRevision: false,
      revisionIssue: true,
    };
  }

  return {
    episodeId,
    selectedCutId,
    cutIssue,
    viewedSession: archived,
    isHistoricalRevision: true,
    revisionIssue: false,
  };
}

export function buildCollabHubReviewLinkPath(input: {
  readonly episodeId: string;
  readonly cutId: string;
  readonly revisionId: string;
  readonly pathname?: string;
}): string {
  const query = new URLSearchParams();
  query.set("episode", input.episodeId);
  query.set("cut", input.cutId);
  query.set("revision", input.revisionId);
  return `${input.pathname || "/production"}?${query.toString()}`;
}
