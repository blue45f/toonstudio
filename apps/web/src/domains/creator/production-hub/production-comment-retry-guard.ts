import type {
  ClarificationThread,
  CutPlan,
  ProductionProjectAggregate,
} from "@toonstudio/core/production";

import {
  addStudioReviewThread,
  type StudioReviewPinCoordinate,
  type StudioReviewSession,
  type StudioReviewThread,
  type StudioReviewThreadKind,
} from "../studio-review-workflow";
import { cutScope, uniqueId } from "./production-concurrent-review-guard";

export interface CommentRetryAttempt {
  readonly fingerprint: string;
  readonly entityId: string;
  readonly secondaryId: string;
  readonly createdAt: string;
}

export function normalizeReviewCommentText(text: string): string {
  return text.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function buildClarificationCommentFingerprint(input: {
  readonly handoffId: string;
  readonly cutId: string;
  readonly askedByAssignmentId: string;
  readonly answerOwnerAssignmentId: string;
  readonly blocking: boolean;
  readonly question: string;
}): string {
  return JSON.stringify([
    input.handoffId,
    input.cutId,
    input.askedByAssignmentId,
    input.answerOwnerAssignmentId,
    input.blocking ? 1 : 0,
    normalizeReviewCommentText(input.question),
  ]);
}

export function buildStudioThreadCommentFingerprint(input: {
  readonly kind: StudioReviewThreadKind;
  readonly targetId: string;
  readonly authorId: string;
  readonly body: string;
}): string {
  return JSON.stringify([
    input.kind,
    input.targetId.trim(),
    input.authorId,
    normalizeReviewCommentText(input.body),
  ]);
}

export function resolveOrCreateCommentAttempt(input: {
  readonly previous: CommentRetryAttempt | null | undefined;
  readonly fingerprint: string;
  readonly createId: (prefix: string) => string;
  readonly entityPrefix: string;
  readonly secondaryPrefix?: string;
  readonly nowIso: string;
}): CommentRetryAttempt {
  if (input.previous && input.previous.fingerprint === input.fingerprint) {
    return input.previous;
  }
  return Object.freeze({
    fingerprint: input.fingerprint,
    entityId: input.createId(input.entityPrefix),
    secondaryId: input.createId(input.secondaryPrefix ?? "message"),
    createdAt: input.nowIso,
  });
}

export function findExistingMatchingClarification(
  clarifications: readonly ClarificationThread[],
  input: {
    readonly candidateId: string;
    readonly handoffId: string;
    readonly cutId: string;
    readonly askedByAssignmentId: string;
    readonly blocking: boolean;
    readonly question: string;
  },
): ClarificationThread | null {
  const byId = clarifications.find((entry) => entry.id === input.candidateId);
  if (byId) return byId;

  const normalized = normalizeReviewCommentText(input.question);
  if (!normalized) return null;

  return (
    clarifications.find(
      (entry) =>
        (entry.status === "open" || entry.status === "answered")
        && entry.handoffId === input.handoffId
        && entry.scope.id === input.cutId
        && entry.askedByAssignmentId === input.askedByAssignmentId
        && entry.blocking === input.blocking
        && normalizeReviewCommentText(entry.question) === normalized,
    ) ?? null
  );
}

export function findExistingMatchingStudioThread(
  threads: readonly StudioReviewThread[],
  input: {
    readonly candidateThreadId: string;
    readonly kind: StudioReviewThreadKind;
    readonly targetId: string;
    readonly authorId: string;
    readonly body: string;
  },
): StudioReviewThread | null {
  const byId = threads.find((thread) => thread.id === input.candidateThreadId);
  if (byId) return byId;

  const normalized = normalizeReviewCommentText(input.body);
  if (!normalized) return null;

  return (
    threads.find(
      (thread) =>
        thread.status === "open"
        && thread.kind === input.kind
        && thread.targetId === input.targetId.trim()
        && thread.messages[0]?.authorId === input.authorId
        && normalizeReviewCommentText(thread.messages[0]?.body ?? "") === normalized,
    ) ?? null
  );
}

export type ClarificationRetryPlan =
  | { readonly kind: "already-recorded"; readonly existing: ClarificationThread }
  | {
      readonly kind: "send";
      readonly attempt: CommentRetryAttempt;
      readonly clarification: ClarificationThread;
    };

export function planIdempotentClarificationSubmission(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly latestClarifications: readonly ClarificationThread[];
  readonly previousAttempt: CommentRetryAttempt | null | undefined;
  readonly handoffId: string;
  readonly selectedCut: CutPlan;
  readonly askedByAssignmentId: string;
  readonly answerOwnerAssignmentId: string;
  readonly blocking: boolean;
  readonly question: string;
  readonly nowIso: string;
}): ClarificationRetryPlan {
  const fingerprint = buildClarificationCommentFingerprint({
    handoffId: input.handoffId,
    cutId: input.selectedCut.cutId,
    askedByAssignmentId: input.askedByAssignmentId,
    answerOwnerAssignmentId: input.answerOwnerAssignmentId,
    blocking: input.blocking,
    question: input.question,
  });
  const attempt = resolveOrCreateCommentAttempt({
    previous: input.previousAttempt,
    fingerprint,
    createId: uniqueId,
    entityPrefix: "clarification",
    nowIso: input.nowIso,
  });
  const existing = findExistingMatchingClarification(input.latestClarifications, {
    candidateId: attempt.entityId,
    handoffId: input.handoffId,
    cutId: input.selectedCut.cutId,
    askedByAssignmentId: input.askedByAssignmentId,
    blocking: input.blocking,
    question: input.question,
  });
  if (existing) return { kind: "already-recorded", existing };

  const clarification: ClarificationThread = {
    id: attempt.entityId,
    handoffId: input.handoffId,
    scope: cutScope(input.aggregate, input.selectedCut),
    category: "visual-reference",
    blocking: input.blocking,
    question: input.question,
    askedByAssignmentId: input.askedByAssignmentId,
    answerOwnerAssignmentId: input.answerOwnerAssignmentId,
    dueAt: input.blocking
      ? new Date(Date.parse(attempt.createdAt) + 24 * 60 * 60 * 1000).toISOString()
      : null,
    status: "open",
    answer: null,
    decisionRecordId: null,
    createdAt: attempt.createdAt,
    updatedAt: attempt.createdAt,
  };
  return { kind: "send", attempt, clarification };
}

export function planIdempotentStudioThreadSubmission(input: {
  readonly session: StudioReviewSession;
  readonly previousAttempt: CommentRetryAttempt | null | undefined;
  readonly createId: (prefix: string) => string;
  readonly entityPrefix: string;
  readonly secondaryPrefix?: string;
  readonly kind: StudioReviewThreadKind;
  readonly targetId: string;
  readonly authorId: string;
  readonly body: string;
  readonly pinCoordinate?: StudioReviewPinCoordinate;
  readonly nowIso: string;
}): {
  readonly alreadyExisted: boolean;
  readonly attempt: CommentRetryAttempt;
  readonly threadId: string;
  readonly nextSession: StudioReviewSession;
} {
  const fingerprint = buildStudioThreadCommentFingerprint({
    kind: input.kind,
    targetId: input.targetId,
    authorId: input.authorId,
    body: input.body,
  });
  const attempt = resolveOrCreateCommentAttempt({
    previous: input.previousAttempt,
    fingerprint,
    createId: input.createId,
    entityPrefix: input.entityPrefix,
    secondaryPrefix: input.secondaryPrefix,
    nowIso: input.nowIso,
  });
  const existing = findExistingMatchingStudioThread(input.session.threads, {
    candidateThreadId: attempt.entityId,
    kind: input.kind,
    targetId: input.targetId,
    authorId: input.authorId,
    body: input.body,
  });
  if (existing) {
    return {
      alreadyExisted: true,
      attempt,
      threadId: existing.id,
      nextSession: input.session,
    };
  }
  const nextSession = addStudioReviewThread(
    input.session,
    {
      id: attempt.entityId,
      kind: input.kind,
      targetId: input.targetId.trim(),
      status: "open",
      pinCoordinate: input.pinCoordinate,
      resolvedBy: null,
      resolvedAt: null,
      messages: [
        {
          id: attempt.secondaryId,
          authorId: input.authorId,
          body: input.body.trim(),
          createdAt: attempt.createdAt,
        },
      ],
    },
    attempt.createdAt,
  );
  return {
    alreadyExisted: false,
    attempt,
    threadId: attempt.entityId,
    nextSession,
  };
}
