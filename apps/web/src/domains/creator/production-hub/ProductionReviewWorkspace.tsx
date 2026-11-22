import { BadgeCheck, Check, CheckCircle2, Columns2, Copy, Eye, GitCompareArrows, Layers3, ScanLine, ShieldAlert, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { describeCreatorRoleLensTransition, type PreservedDraftEntry, type RoleTransitionSummary } from "./production-role-transition-model";

import {
  episodeScope, projectScope,
  scopeContains,
  productionSubmissionBlockingClarifications,
  productionSubmissionStaleDependencyTasks,
  type CutPlan,
  type ProductionProjectAggregate,
  type ReviewDecision,
  type ReviewDecisionValue,
  type ReviewLane,
  type Submission,
} from "@toonstudio/core/production";

import {
  planIdempotentClarificationSubmission,
  type CommentRetryAttempt,
} from "./production-comment-retry-guard";
import {
  assignmentBadge,
  deriveStaleSubmissionDecisionNotice,
  episodeOptionLabel,
  isConcurrentStaleSubmissionError,
  isSubmissionSupersededInAggregate,
  latestCuts,
  lensAssignment,
  oppositeAnswerOwner,
  partyLabel,
  uniqueId,
  type ProductionRoleLens,
  type RecordedSubmissionDecisionMeta,
} from "./production-concurrent-review-guard";
import { peekProductionDemoSession } from "./production-demo-adapter";
import { decisionsForProductionSubmission, planProductionSubmissionApproval, planProductionSubmissionReview, plainSubmissionApproval, policyForProductionSubmission, resolveProductionReviewTarget, type SubmissionReviewStep } from "./production-review-submission";
import {
  buildProductionReviewDeepLinkPath,
  resolvePinnedCutFromParams,
  resolvePinnedSubmissionFromParams,
  resolveSubmissionRevisionFreshness,
  type BuildProductionReviewDeepLinkInput,
  type ParsedProductionReviewDeepLinkParams,
} from "./production-review-deep-link-model";

import { EpisodeStageHandoffSection } from "./EpisodeStageHandoffSection";
import {
  ProductionReviewClarificationCards,
  ProductionReviewCutCard as ReviewPanel,
  ProductionStaleDecisionBanner,
  ProductionWorkspaceDeepLinkBanners,
} from "./ProductionReviewDeepLinkBanners";
import {
  ProductionSubmissionResubmissionSummaryBanner,
  ProductionSubmissionResubmitComposer,
} from "./ProductionSubmissionResubmitCard";
import { ProductionSubmissionVisualReview } from "./ProductionSubmissionVisualReview";
import {
  deriveSubmissionResubmissionSummary,
  planProductionSubmissionResubmission,
} from "./production-submission-resubmit-model";
import { productionReviewActorAssignments } from "./production-review-actor";
import { useProductionReviewClock } from "./use-production-review-clock";
import type { ProductionClientCommand } from "./production-api";
import { reviewLaneLabel, roleTypeLabel, submissionStatusLabel } from "./production-labels";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";

export type { ProductionRoleLens };
type ReviewMode = "vertical" | "compare" | "overlay";
type ExecuteCommand = (command: ProductionClientCommand, message: string) => Promise<void>;

export interface ProductionReviewWorkspaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: ExecuteCommand;
  readonly canEdit: boolean;
  readonly roleLens: ProductionRoleLens;
  readonly targetTaskId?: string;
  readonly preferredEpisodeId?: string;
  readonly deepLinkParams?: ParsedProductionReviewDeepLinkParams;
  readonly onSyncDeepLink?: (next: Omit<BuildProductionReviewDeepLinkInput, "projectId">) => void;
  readonly viewerAssignmentIds?: readonly string[];
  readonly viewerUserId?: string | null;
  readonly roleTransition?: RoleTransitionSummary | null;
  readonly onDismissRoleTransition?: () => void;
}

const REVIEW_MODE: readonly { readonly id: ReviewMode; readonly label: string; readonly icon: typeof Eye }[] = [
  { id: "vertical", label: "세로 원고", icon: Eye },
  { id: "compare", label: "나란히 비교", icon: Columns2 },
  { id: "overlay", label: "오버레이", icon: Layers3 },
];

function Pill({ children, tone = "neutral" }: { readonly children: ReactNode; readonly tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) {
  const tones = {
    neutral: "border-line bg-raised text-fg-2",
    good: "border-good/35 bg-good/10 text-good",
    warn: "border-warn/35 bg-warn/10 text-warn",
    bad: "border-bad/35 bg-bad/10 text-bad",
    accent: "border-accent/35 bg-accent-soft text-accent",
  } as const;
  return <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold", tones[tone])}>{children}</span>;
}

export function ProductionReviewWorkspace(props: ProductionReviewWorkspaceProps) {
  return <ProductionReviewWorkspaceForProject key={JSON.stringify([props.aggregate.projectId, props.targetTaskId ?? "all", props.viewerUserId])} {...props} />;
}
function ProductionReviewWorkspaceForProject({
  aggregate,
  execute,
  canEdit,
  roleLens,
  targetTaskId,
  preferredEpisodeId,
  deepLinkParams,
  onSyncDeepLink,
  viewerAssignmentIds,
  viewerUserId,
  roleTransition = null,
  onDismissRoleTransition,
}: ProductionReviewWorkspaceProps) {
  const t = useT();
  const bt = useBilingual("ProductionReviewWorkspace.triage");
  const episodes = aggregate.episodes.filter((episode) => episode.state !== "cancelled");
  const target = resolveProductionReviewTarget(aggregate, targetTaskId, preferredEpisodeId);
  const explicitEpisodeInvalid =
    !target.targeted
    && (
      Boolean(deepLinkParams?.duplicateKeys.includes("episode"))
      || (preferredEpisodeId !== undefined && !episodes.some((episode) => episode.episodeId === preferredEpisodeId))
    );
  const defaultEpisodeId = explicitEpisodeInvalid
    ? ""
    : preferredEpisodeId
      ?? aggregate.reviewPolicies.find((policy) => policy.scope.kind === "episode")?.scope.id
      ?? episodes[0]?.episodeId
      ?? "";
  const [episodeChoice, setSelectedEpisodeId] = useState(defaultEpisodeId);
  const [episodeOverrideCleared, setEpisodeOverrideCleared] = useState(false);
  const selectedEpisodeId = target.targeted
    ? target.episodeId ?? ""
    : explicitEpisodeInvalid && !episodeOverrideCleared
      ? ""
      : episodes.some((episode) => episode.episodeId === episodeChoice)
        ? episodeChoice
        : episodes[0]?.episodeId ?? "";

  const cuts = latestCuts(aggregate.cutPlans).filter((cut) => cut.episodeId === selectedEpisodeId);
  const pinnedCutResolution = resolvePinnedCutFromParams({
    cuts,
    requestedCutId: deepLinkParams?.cut,
    duplicateKeys: deepLinkParams?.duplicateKeys,
  });
  const [mode, setMode] = useState<ReviewMode>("vertical");
  const [selectedCutId, setSelectedCutId] = useState<string | null>(() => pinnedCutResolution.cutId);
  const [cutMismatchCleared, setCutMismatchCleared] = useState(false);
  const [copiedLinkUrl, setCopiedLinkUrl] = useState<string | null>(null);
  const [cutQuery, setCutQuery] = useState("");
  const [cutFocus, setCutFocus] = useState<"all" | "open" | "blocking">("all");
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, { text: string; blocking: boolean }>>({});
  const [resubmitNote, setResubmitNote] = useState("");
  const prevRoleLensRef = useRef(roleLens);
  const [lensTransition, setLensTransition] = useState<RoleTransitionSummary | null>(null);
  useEffect(() => {
    if (prevRoleLensRef.current === roleLens) return;
    setLensTransition(describeCreatorRoleLensTransition(prevRoleLensRef.current, roleLens, canEdit));
    prevRoleLensRef.current = roleLens;
  }, [canEdit, roleLens]);
  const preservedDraftEntries: readonly PreservedDraftEntry[] = [
    ...Object.entries(questionDrafts).map(([key, item]) => ({ label: `컷 질문 ${key}`, value: item.text, locked: !canEdit })),
    { label: "재제출 수정 요약 메모", value: resubmitNote, locked: !canEdit },
  ].filter((entry) => entry.value.trim().length > 0);
  const activeRoleTransition = roleTransition ?? lensTransition;
  const draftKey = JSON.stringify([selectedEpisodeId, selectedCutId]);
  const comment = questionDrafts[draftKey]?.text ?? "";
  const blocking = questionDrafts[draftKey]?.blocking ?? false;
  const setComment = (text: string) => setQuestionDrafts((current) => ({ ...current, [draftKey]: { text, blocking: current[draftKey]?.blocking ?? false } }));
  const setBlocking = (value: boolean) => setQuestionDrafts((current) => ({ ...current, [draftKey]: { text: current[draftKey]?.text ?? "", blocking: value } }));
  const sending = useRef(false);
  const commentAttemptsRef = useRef<Record<string, CommentRetryAttempt>>({});
  const [failedCommentDraftKey, setFailedCommentDraftKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  useEffect(() => {
    if (pinnedCutResolution.issue && !cutMismatchCleared && selectedCutId === null) return;
    if (!selectedCutId || !cuts.some((cut) => cut.cutId === selectedCutId)) {
      setSelectedCutId(cuts[0]?.cutId ?? null);
    }
  }, [cutMismatchCleared, cuts, pinnedCutResolution.issue, selectedCutId]);

  const selectedCut = cuts.find((cut) => cut.cutId === selectedCutId) ?? null;
  const episodePlan = [...aggregate.episodePlans]
    .filter((plan) => plan.episodeId === selectedEpisodeId)
    .sort((left, right) => right.revision - left.revision)[0] ?? null;
  const handoff = aggregate.handoffs.find((entry) => entry.episodeId === selectedEpisodeId && !["superseded", "cancelled"].includes(entry.status)) ?? null;
  const clarifications = handoff ? aggregate.clarifications.filter((entry) => entry.handoffId === handoff.id && ["open", "answered"].includes(entry.status)) : [];
  const changeRequests = aggregate.changeRequests.filter((entry) => entry.episodeId === selectedEpisodeId && !["completed", "cancelled", "rejected"].includes(entry.status));
  const deliverableIds = useMemo(
    () =>
      aggregate.deliverables
        .filter((deliverable) => deliverable.projectId === aggregate.projectId && (deliverable.scope.id === selectedEpisodeId || deliverable.scope.ancestors.some((ancestor) => ancestor.kind === "episode" && ancestor.id === selectedEpisodeId)))
        .map((deliverable) => deliverable.id),
    [aggregate.deliverables, aggregate.projectId, selectedEpisodeId],
  );
  const taskDeliverableIds = useMemo(
    () =>
      target.task
        ? target.task.outputDeliverableIds.filter((id) =>
            aggregate.deliverables.some((entry) => entry.id === id && entry.projectId === aggregate.projectId && scopeContains(target.task!.scope, entry.scope)),
          )
        : [],
    [aggregate.deliverables, aggregate.projectId, target.task],
  );
  const allDeliverableSubmissions = useMemo(
    () =>
      target.targeted
        ? target.issue
          ? []
          : aggregate.submissions.filter((candidate) => candidate.projectId === aggregate.projectId && taskDeliverableIds.includes(candidate.deliverableId))
        : aggregate.submissions.filter((candidate) => candidate.projectId === aggregate.projectId && deliverableIds.includes(candidate.deliverableId)),
    [aggregate.projectId, aggregate.submissions, deliverableIds, target.issue, target.targeted, taskDeliverableIds],
  );
  const pinnedSubmissionResolution = resolvePinnedSubmissionFromParams({
    allDeliverableSubmissions,
    requestedSubmissionId: deepLinkParams?.submission,
    requestedRevisionId: deepLinkParams?.revision,
    duplicateKeys: deepLinkParams?.duplicateKeys,
  });
  const baseSubmissions = target.targeted ? target.submissions : allDeliverableSubmissions;
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(() =>
    pinnedSubmissionResolution.explicit
      ? pinnedSubmissionResolution.matched?.id ?? ""
      : null,
  );
  const selectedFromAll = selectedSubmissionId ? allDeliverableSubmissions.find((entry) => entry.id === selectedSubmissionId) ?? null : null;
  const extraMatched = [pinnedSubmissionResolution.matched, selectedFromAll].filter((entry): entry is Submission => entry != null);
  const submissions = extraMatched.reduce<readonly Submission[]>(
    (acc, item) => (acc.some((entry) => entry.id === item.id) ? acc : [...acc, item]),
    baseSubmissions,
  );
  const [submissionMismatchCleared, setSubmissionMismatchCleared] = useState(false);
  const [lastRecordedDecisionMeta, setLastRecordedDecisionMeta] = useState<RecordedSubmissionDecisionMeta | null>(null);
  const latestAggregateRef = useRef(aggregate);
  latestAggregateRef.current = aggregate;
  const selfResubmittedIdRef = useRef<string | null>(null);

  const incomingLinkKey = JSON.stringify([
    preferredEpisodeId ?? null,
    deepLinkParams?.cut ?? null,
    deepLinkParams?.submission ?? null,
    deepLinkParams?.revision ?? null,
    deepLinkParams?.duplicateKeys ?? [],
  ]);
  const prevIncomingLinkKeyRef = useRef(incomingLinkKey);
  const selfSyncedLinkKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevIncomingLinkKeyRef.current === incomingLinkKey) return;
    prevIncomingLinkKeyRef.current = incomingLinkKey;
    if (selfSyncedLinkKeyRef.current === incomingLinkKey) return;
    let effectiveEpId = selectedEpisodeId;
    if (!target.targeted && preferredEpisodeId !== undefined) {
      setEpisodeOverrideCleared(false);
      setSelectedEpisodeId(preferredEpisodeId);
      effectiveEpId = episodes.some((episode) => episode.episodeId === preferredEpisodeId) ? preferredEpisodeId : "";
    }
    const nextCuts = latestCuts(aggregate.cutPlans).filter((cut) => cut.episodeId === effectiveEpId);
    const nextCutRes = resolvePinnedCutFromParams({
      cuts: nextCuts,
      requestedCutId: deepLinkParams?.cut,
      duplicateKeys: deepLinkParams?.duplicateKeys,
    });
    const nextDelivIds = target.targeted
      ? taskDeliverableIds
      : aggregate.deliverables
          .filter((d) => d.projectId === aggregate.projectId && (d.scope.id === effectiveEpId || d.scope.ancestors.some((a) => a.kind === "episode" && a.id === effectiveEpId)))
          .map((d) => d.id);
    const nextAllSubs = target.targeted && target.issue
      ? []
      : aggregate.submissions.filter((c) => c.projectId === aggregate.projectId && nextDelivIds.includes(c.deliverableId));
    const nextSubRes = resolvePinnedSubmissionFromParams({
      allDeliverableSubmissions: nextAllSubs,
      requestedSubmissionId: deepLinkParams?.submission,
      requestedRevisionId: deepLinkParams?.revision,
      duplicateKeys: deepLinkParams?.duplicateKeys,
    });
    setCutMismatchCleared(false);
    setSelectedCutId(nextCutRes.cutId);
    setSubmissionMismatchCleared(false);
    setSelectedSubmissionId(nextSubRes.explicit ? nextSubRes.matched?.id ?? "" : null);
  }, [aggregate, deepLinkParams, episodes, incomingLinkKey, preferredEpisodeId, selectedEpisodeId, target.issue, target.targeted, taskDeliverableIds]);

  const defaultSubmission = submissions.find((candidate) => aggregate.deliverables.some((deliverable) => deliverable.id === candidate.deliverableId && deliverable.currentSubmissionId === candidate.id)) ?? submissions[0] ?? null;
  const prevDefaultSubRef = useRef<{ episodeId: string; submissionId: string | null }>({
    episodeId: selectedEpisodeId,
    submissionId: defaultSubmission?.id ?? null,
  });
  useEffect(() => {
    const prev = prevDefaultSubRef.current;
    const nextDefaultId = defaultSubmission?.id ?? null;
    if (
      prev.episodeId === selectedEpisodeId
      && prev.submissionId
      && nextDefaultId
      && prev.submissionId !== nextDefaultId
      && selfResubmittedIdRef.current !== nextDefaultId
      && selectedSubmissionId === null
      && allDeliverableSubmissions.some((entry) => entry.id === prev.submissionId)
    ) {
      setSelectedSubmissionId(prev.submissionId);
    }
    prevDefaultSubRef.current = { episodeId: selectedEpisodeId, submissionId: nextDefaultId };
  }, [allDeliverableSubmissions, defaultSubmission?.id, selectedEpisodeId, selectedSubmissionId]);

  const submission = selectedSubmissionId === "" ? null : submissions.find((candidate) => candidate.id === selectedSubmissionId) ?? defaultSubmission;
  const freshness = resolveSubmissionRevisionFreshness(aggregate, submission);
  const staleDecisionNotice = deriveStaleSubmissionDecisionNotice(aggregate, lastRecordedDecisionMeta);
  const selectedDeliverable = aggregate.deliverables.find((candidate) => candidate.id === submission?.deliverableId) ?? null;
  const reviewScope = selectedDeliverable?.scope ?? target.task?.scope ?? (selectedEpisodeId ? episodeScope(aggregate.projectId, selectedEpisodeId) : projectScope(aggregate.projectId));
  const policy = policyForProductionSubmission(aggregate, submission) ?? aggregate.reviewPolicies.filter((candidate) => reviewScope
    ? scopeContains(candidate.scope, reviewScope) : candidate.scope.kind === "episode" && candidate.scope.id === selectedEpisodeId)[0] ?? null;
  const at = useProductionReviewClock(aggregate.assignments);
  const actorAssignments = productionReviewActorAssignments(aggregate, reviewScope, viewerUserId, viewerAssignmentIds, at);
  const preferredAssignment = lensAssignment({ ...aggregate, assignments: actorAssignments }, roleLens);
  const canDecide = (id: string) => policy?.lanes.some((lane) => lane.eligibleAssignmentIds.includes(id));
  const reviewAssignments = actorAssignments.filter((candidate) => canDecide(candidate.id));
  const assignmentScope = JSON.stringify([aggregate.projectId, selectedEpisodeId, submission?.id, policy?.id, viewerUserId]);
  const [assignmentChoice, chooseAssignment] = useState<{ readonly scope: string; readonly id: string } | null>(null);
  const assignment = assignmentChoice?.scope === assignmentScope
    ? reviewAssignments.find((candidate) => candidate.id === assignmentChoice.id) ?? null
    : preferredAssignment && canDecide(preferredAssignment.id) ? preferredAssignment : reviewAssignments[0] ?? preferredAssignment;
  const answerOwner = oppositeAnswerOwner(aggregate, roleLens);
  const decisions = submission && policy ? decisionsForProductionSubmission(aggregate, submission, policy, at) : [];
  const evaluation = policy && submission ? plainSubmissionApproval(policy, decisions) : null;
  const submissionBlockers = submission ? productionSubmissionBlockingClarifications(aggregate, submission) : [];
  const staleInputTasks = submission ? productionSubmissionStaleDependencyTasks(aggregate, submission) : [];
  const isCurrentDeliverableSub = submission != null && selectedDeliverable?.currentSubmissionId === submission.id;
  const canReviewSubmission = !target.issue && isCurrentDeliverableSub && ["submitted", "in-review"].includes(submission.status);
  const canResubmitSubmission = !target.issue && isCurrentDeliverableSub && submission.status === "changes-requested";
  const roleLabelForAssignment = (assignmentId: string) => {
    const found = aggregate.assignments.find((entry) => entry.id === assignmentId);
    return found ? (found.publicCreditRole ?? roleTypeLabel(found.roleType, bt)) : assignmentId;
  };
  const resubmissionSummary = deriveSubmissionResubmissionSummary({
    aggregate, submission, policy, currentDecisions: decisions, cuts, episodeId: selectedEpisodeId,
    partyLabelForAssignment: (id) => partyLabel(aggregate, id),
    roleLabelForAssignment,
  });
  const priorApprovalLabels = submission ? aggregate.reviewDecisions
    .filter((d) => d.reviewRoundId === submission.id && (d.value === "approve" || d.value === "approve-with-conditions"))
    .map((d) => `${partyLabel(aggregate, d.assignmentId)}(${reviewLaneLabel(d.lane, bt)})`) : [];
  const nextReviewerPreviewLabels = (policy?.lanes ?? []).flatMap((lane) =>
    lane.eligibleAssignmentIds.map((id) => `${partyLabel(aggregate, id)} · ${reviewLaneLabel(lane.lane, bt)}`),
  );

  const issueCountForCut = (cut: CutPlan): number => {
    const directClarifications = clarifications.filter((entry) => entry.scope.id === cut.cutId || entry.scope.id === cut.sceneId).length;
    const directChanges = changeRequests.filter((entry) => entry.changedScopes.some((scope) => scope.id === cut.cutId || scope.id === cut.sceneId)).length;
    const fallback = cut.cutId === cuts[0]?.cutId ? clarifications.filter((entry) => entry.scope.id === selectedEpisodeId).length : 0;
    return directClarifications + directChanges + fallback;
  };

  const blockingForCut = (cut: CutPlan) => clarifications.some((entry) => entry.blocking &&
    (entry.scope.id === cut.cutId || entry.scope.id === cut.sceneId || (entry.scope.id === selectedEpisodeId && cut.cutId === cuts[0]?.cutId)));
  const cutResults = cuts.filter((cut) => {
    if (cutFocus === "open" && !issueCountForCut(cut)) return false;
    if (cutFocus === "blocking" && !blockingForCut(cut)) return false;
    const text = `${cut.cutId} ${cut.framing} ${cut.camera}`.normalize("NFKC").toLocaleLowerCase();
    return cutQuery.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/u).every((term) => text.includes(term));
  });
  const runAction = async (command: ProductionClientCommand, message: string): Promise<boolean> => {
    if (sending.current) return false;
    sending.current = true; setPending(true); setRequestError(null); setRequestNotice(null);
    try { await execute(command, message); return true; }
    catch (cause) { setRequestError(cause instanceof Error ? cause.message : bt("저장하지 못했습니다. 입력 내용을 유지했습니다.", "Could not save. Your input was preserved.")); return false; }
    finally { sending.current = false; setPending(false); }
  };
  const stepLabel = (stage: SubmissionReviewStep["stage"]): string => {
    if (stage === "start-review") return bt("검수 시작", "Start review");
    if (stage === "record-decision") return bt("검수 결정 기록", "Record review decision");
    if (stage === "request-changes") return bt("수정 요청 반영", "Apply change request");
    return bt("제출본 승인 확정", "Confirm submission approval");
  };
  const peekLatestAggregate = () => {
    const demoPeek = peekProductionDemoSession();
    return demoPeek && demoPeek.projectId === aggregate.projectId && demoPeek.revision >= latestAggregateRef.current.revision
      ? demoPeek
      : latestAggregateRef.current;
  };
  const runReviewSteps = async (
    steps: readonly SubmissionReviewStep[],
    decisionMeta?: { readonly targetSubmission: Submission; readonly value: ReviewDecisionValue },
  ) => {
    if (sending.current) return;
    sending.current = true; setPending(true); setRequestError(null); setRequestNotice(null); setLastRecordedDecisionMeta(null);
    const completed: string[] = [];
    try {
      for (const step of steps) {
        if (
          decisionMeta
          && (step.stage === "approve-submission" || step.stage === "request-changes")
          && isSubmissionSupersededInAggregate(peekLatestAggregate(), decisionMeta.targetSubmission)
        ) {
          setLastRecordedDecisionMeta({
            submissionId: decisionMeta.targetSubmission.id,
            revisionNumber: decisionMeta.targetSubmission.revisionRef.revision,
            deliverableId: decisionMeta.targetSubmission.deliverableId,
            value: decisionMeta.value,
          });
          setSelectedSubmissionId(decisionMeta.targetSubmission.id);
          return;
        }
        const label = stepLabel(step.stage);
        await execute(step.command, bt(`${label}을 저장했습니다.`, `${label} saved.`));
        completed.push(label);
      }
      if (decisionMeta) {
        setLastRecordedDecisionMeta({
          submissionId: decisionMeta.targetSubmission.id,
          revisionNumber: decisionMeta.targetSubmission.revisionRef.revision,
          deliverableId: decisionMeta.targetSubmission.deliverableId,
          value: decisionMeta.value,
        });
        if (isSubmissionSupersededInAggregate(peekLatestAggregate(), decisionMeta.targetSubmission)) {
          setSelectedSubmissionId(decisionMeta.targetSubmission.id);
          return;
        }
      }
      setRequestNotice(bt(`${completed.join(" · ")} 저장 완료`, `${completed.join(" · ")} saved`));
    } catch (cause) {
      if (decisionMeta && isConcurrentStaleSubmissionError(cause)) {
        setLastRecordedDecisionMeta({
          submissionId: decisionMeta.targetSubmission.id,
          revisionNumber: decisionMeta.targetSubmission.revisionRef.revision,
          deliverableId: decisionMeta.targetSubmission.deliverableId,
          value: decisionMeta.value,
        });
        setSelectedSubmissionId(decisionMeta.targetSubmission.id);
        return;
      }
      const detail = cause instanceof Error ? cause.message : bt("저장 응답을 확인하지 못했습니다.", "The save response could not be confirmed.");
      setRequestError(completed.length
        ? bt(`${completed.join(" · ")}까지 저장됐습니다. 이후 단계를 완료하지 못했습니다. 현재 제출본 상태를 확인한 뒤 다시 진행하세요. ${detail}`, `${completed.join(" · ")} was saved. A later step did not complete. Check the current submission before continuing. ${detail}`)
        : detail);
    } finally { sending.current = false; setPending(false); }
  };
  const recordDecision = async (lane: ReviewLane, value: ReviewDecisionValue) => {
    if (!policy || !assignment || !canEdit || !canReviewSubmission || !submission || !selectedDeliverable) return;
    const rule = policy.lanes.find((entry) => entry.lane === lane);
    if (!rule || !rule.eligibleAssignmentIds.includes(assignment.id)) return;
    if (!productionReviewActorAssignments(aggregate, selectedDeliverable.scope, viewerUserId, viewerAssignmentIds, new Date().toISOString()).some((entry) => entry.id === assignment.id)) {
      setRequestError(bt("선택한 내 검수 역할의 현재 범위·기간을 다시 확인하세요.", "Recheck the current scope and dates of your selected review assignment.")); return;
    }
    const targetSubmission = submission;
    const decision: ReviewDecision = {
      id: uniqueId("review-decision"), reviewRoundId: targetSubmission.id, lane, assignmentId: assignment.id, value,
      reasonCode: value === "approve" ? "reviewed-against-canonical-intent" : "revision-required",
      evidenceScopeRefs: [selectedDeliverable.scope],
      conditions: value === "request-changes" ? [bt("선택한 제출본의 검수 의견을 반영한 새 수정본 제출", "Submit a new revision that addresses this submission's review notes")] : [],
      createdAt: new Date().toISOString(),
    };
    try { await runReviewSteps(planProductionSubmissionReview(aggregate, targetSubmission, policy, decision, decision.createdAt), { targetSubmission, value }); }
    catch (cause) {
      if (isConcurrentStaleSubmissionError(cause)) {
        setLastRecordedDecisionMeta({
          submissionId: targetSubmission.id,
          revisionNumber: targetSubmission.revisionRef.revision,
          deliverableId: targetSubmission.deliverableId,
          value,
        });
        setSelectedSubmissionId(targetSubmission.id);
        return;
      }
      setRequestError(cause instanceof Error ? cause.message : bt("검수 조건을 다시 확인하세요.", "Check the review requirements again."));
    }
  };
  const finalizeSubmission = async () => {
    if (!canEdit || !submission || !policy || !assignment) return;
    if (!selectedDeliverable || !productionReviewActorAssignments(aggregate, selectedDeliverable.scope, viewerUserId, viewerAssignmentIds, new Date().toISOString()).some((entry) => entry.id === assignment.id)) {
      setRequestError(bt("선택한 내 검수 역할의 현재 범위·기간을 다시 확인하세요.", "Recheck the current scope and dates of your selected review assignment.")); return;
    }
    try { await runReviewSteps([planProductionSubmissionApproval(aggregate, submission, policy, assignment.id, new Date().toISOString())]); }
    catch (cause) { setRequestError(cause instanceof Error ? cause.message : bt("승인 조건을 다시 확인하세요.", "Check the approval requirements again.")); }
  };

  const addClarification = async () => {
    const question = comment.trim();
    if (!question || !handoff || !selectedCut || !assignment || !answerOwner || !canEdit || sending.current) return;
    const plan = planIdempotentClarificationSubmission({
      aggregate, latestClarifications: peekLatestAggregate().clarifications,
      previousAttempt: commentAttemptsRef.current[draftKey], handoffId: handoff.id,
      selectedCut, askedByAssignmentId: assignment.id, answerOwnerAssignmentId: answerOwner.id,
      blocking, question, nowIso: new Date().toISOString(),
    });
    if (plan.kind === "already-recorded") {
      delete commentAttemptsRef.current[draftKey]; setFailedCommentDraftKey(null); setRequestError(null);
      setRequestNotice(bt(`${selectedCut.cutId}에 같은 검수 질문이 이미 한 번 기록되어 중복 생성하지 않았습니다.`, `The same question is already recorded once on ${selectedCut.cutId}; skipped duplicate creation.`));
      setQuestionDrafts((current) => ({ ...current, [draftKey]: { text: "", blocking: false } }));
      return;
    }
    commentAttemptsRef.current[draftKey] = plan.attempt;
    const saved = await runAction({ type: "upsert-clarification", clarification: plan.clarification }, `${selectedCut.cutId}에 검수 질문을 추가했습니다.`);
    if (saved) {
      delete commentAttemptsRef.current[draftKey]; setFailedCommentDraftKey(null);
      setQuestionDrafts((current) => current[draftKey]?.text.trim() === question && current[draftKey]?.blocking === blocking ? { ...current, [draftKey]: { text: "", blocking: false } } : current);
    } else setFailedCommentDraftKey(draftKey);
  };

  const eligibleLanes = policy?.lanes.filter((lane) => assignment && lane.eligibleAssignmentIds.includes(assignment.id)) ?? [];
  const manuscriptVersionLabel = submission?.sourceEvidence?.version === 1
    ? bt(`원고 v${submission.revisionRef.revision}`, `Manuscript v${submission.revisionRef.revision}`) : null;

  const syncDeepLinkCoordinates = (overrides?: Partial<Omit<BuildProductionReviewDeepLinkInput, "projectId">>) => {
    if (!onSyncDeepLink) return;
    const nextCoords: Omit<BuildProductionReviewDeepLinkInput, "projectId"> = {
      taskId: target.task?.id ?? targetTaskId ?? null,
      episodeId: overrides && "episodeId" in overrides ? overrides.episodeId : selectedEpisodeId || null,
      cutId: overrides && "cutId" in overrides ? overrides.cutId : selectedCut?.cutId ?? null,
      submissionId: overrides && "submissionId" in overrides ? overrides.submissionId : submission?.id ?? null,
      revisionId: overrides && "revisionId" in overrides ? overrides.revisionId : submission?.revisionRef.id ?? null,
    };
    selfSyncedLinkKeyRef.current = JSON.stringify([
      nextCoords.episodeId ?? null,
      nextCoords.cutId ?? null,
      nextCoords.submissionId ?? null,
      nextCoords.revisionId ?? null,
      [],
    ]);
    onSyncDeepLink(nextCoords);
  };

  const handleSelectEpisode = (nextEpisodeId: string) => {
    setLastRecordedDecisionMeta(null);
    setEpisodeOverrideCleared(true);
    setCutMismatchCleared(true);
    setSubmissionMismatchCleared(true);
    setSelectedEpisodeId(nextEpisodeId);
    const nextCuts = latestCuts(aggregate.cutPlans).filter((cut) => cut.episodeId === nextEpisodeId);
    const nextCutId = nextCuts[0]?.cutId ?? null;
    setSelectedCutId(nextCutId);
    const nextDelivIds = aggregate.deliverables
      .filter((deliverable) => deliverable.projectId === aggregate.projectId && (deliverable.scope.id === nextEpisodeId || deliverable.scope.ancestors.some((ancestor) => ancestor.kind === "episode" && ancestor.id === nextEpisodeId)))
      .map((deliverable) => deliverable.id);
    const nextSubs = aggregate.submissions.filter((candidate) => candidate.projectId === aggregate.projectId && nextDelivIds.includes(candidate.deliverableId));
    const nextDefaultSub = nextSubs.find((candidate) => aggregate.deliverables.some((deliverable) => deliverable.id === candidate.deliverableId && deliverable.currentSubmissionId === candidate.id)) ?? nextSubs[0] ?? null;
    setSelectedSubmissionId(null);
    syncDeepLinkCoordinates({
      episodeId: nextEpisodeId || null,
      cutId: nextCutId,
      submissionId: nextDefaultSub?.id ?? null,
      revisionId: nextDefaultSub?.revisionRef.id ?? null,
    });
  };

  const handleSelectSubmission = (nextSubmissionId: string) => {
    setLastRecordedDecisionMeta(null);
    setSubmissionMismatchCleared(true);
    setSelectedSubmissionId(nextSubmissionId);
    const nextSub = submissions.find((entry) => entry.id === nextSubmissionId) ?? null;
    syncDeepLinkCoordinates({
      submissionId: nextSub?.id ?? null,
      revisionId: nextSub?.revisionRef.id ?? null,
    });
  };

  const handleSelectCut = (nextCutId: string) => {
    setCutMismatchCleared(true);
    setSelectedCutId(nextCutId);
    syncDeepLinkCoordinates({ cutId: nextCutId });
  };

  const handleResubmitSubmission = async (input: { readonly changedCutIds: readonly string[]; readonly resolveClarificationIds: readonly string[]; readonly note: string }) => {
    if (!canEdit || !submission || !canResubmitSubmission || sending.current) return;
    sending.current = true; setPending(true); setRequestError(null); setRequestNotice(null); setLastRecordedDecisionMeta(null);
    try {
      const plan = planProductionSubmissionResubmission({
        aggregate, previousSubmission: submission, changedCutIds: input.changedCutIds,
        resolveClarificationIds: input.resolveClarificationIds, resolutionNote: input.note, at: new Date().toISOString(),
      });
      selfResubmittedIdRef.current = plan.nextSubmission.id;
      await execute(plan.steps[0].command, bt("수정본을 재제출했습니다.", "Saved the revised submission."));
      setResubmitNote("");
      setSelectedSubmissionId(plan.nextSubmission.id);
      syncDeepLinkCoordinates({ submissionId: plan.nextSubmission.id, revisionId: plan.nextSubmission.revisionRef.id });
      setRequestNotice(bt(`${plan.nextSubmission.revisionRef.revision}차 수정본을 재제출했습니다. 새 리비전은 0승인부터 다시 검수합니다.`, `Resubmitted rev. ${plan.nextSubmission.revisionRef.revision}. Approvals start fresh from 0.`));
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : bt("재제출하지 못했습니다.", "Could not resubmit."));
    } finally { sending.current = false; setPending(false); }
  };

  const currentReviewDeepLinkPath = buildProductionReviewDeepLinkPath({
    projectId: aggregate.projectId,
    taskId: target.task?.id ?? null,
    episodeId: selectedEpisodeId || null,
    cutId: selectedCut?.cutId ?? null,
    submissionId: submission?.id ?? null,
    revisionId: submission?.revisionRef.id ?? null,
  });

  const handleCopyReviewDeepLink = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4179";
    const fullUrl = `${origin}${currentReviewDeepLinkPath}`;
    setCopiedLinkUrl(fullUrl);
    syncDeepLinkCoordinates();
    try {
      await navigator.clipboard?.writeText(fullUrl);
    } catch {
      // 클립보드 권한이 제한된 환경에서도 URL 동기화 및 복사 주소 속성을 제공한다.
    }
    setRequestNotice(
      bt(
        `고정 검수 링크를 복사했습니다 (${selectedEpisodeId || "회차 미지정"} · ${selectedCut?.cutId ?? "컷 없음"} · ${submission?.revisionRef.id ?? "제출본 없음"}).`,
        `Copied pinned review link (${selectedEpisodeId || "no-episode"} · ${selectedCut?.cutId ?? "no-cut"} · ${submission?.revisionRef.id ?? "no-submission"}).`,
      ),
    );
  };

  const linkMismatchMessages: string[] = [];
  if (explicitEpisodeInvalid && !episodeOverrideCleared) {
    linkMismatchMessages.push(
      bt(
        `검수 링크의 회차(${preferredEpisodeId || "중복 파라미터"})를 찾을 수 없어 다른 회차로 임의 전환하지 않았습니다.`,
        `Could not find episode (${preferredEpisodeId || "duplicate parameter"}) from the review link; did not substitute another episode.`,
      ),
    );
  }
  if (pinnedCutResolution.issue && !cutMismatchCleared) {
    linkMismatchMessages.push(
      bt(
        `검수 링크의 컷(${deepLinkParams?.cut || "중복 파라미터"})이 현재 회차에 없어 첫 컷으로 조용히 바꾸지 않았습니다. 왼쪽 목록에서 대상 컷을 선택하세요.`,
        `Cut (${deepLinkParams?.cut || "duplicate parameter"}) is not in this episode; did not silently fall back to cut 1.`,
      ),
    );
  }
  if (pinnedSubmissionResolution.issue && !submissionMismatchCleared) {
    linkMismatchMessages.push(
      pinnedSubmissionResolution.issue === "revision-conflict"
        ? bt(
            `검수 링크의 제출본(${deepLinkParams?.submission})과 리비전(${deepLinkParams?.revision})이 서로 일치하지 않아 최신본으로 자동 대체하지 않았습니다.`,
            `Submission (${deepLinkParams?.submission}) and revision (${deepLinkParams?.revision}) in the link conflict; did not substitute the latest version.`,
          )
        : bt(
            `검수 링크가 가리키는 리비전(${deepLinkParams?.revision ?? deepLinkParams?.submission ?? "중복 파라미터"})을 찾을 수 없어 최신본으로 조용히 대체하지 않았습니다.`,
            `Could not find revision (${deepLinkParams?.revision ?? deepLinkParams?.submission ?? "duplicate parameter"}); did not silently substitute the latest version.`,
          ),
    );
  }

  return (
    <section
      className="overflow-hidden rounded-3xl border border-line bg-card shadow-sm"
      data-production-review-workspace
      data-review-episode-id={selectedEpisodeId}
      data-review-cut-id={selectedCut?.cutId ?? ""}
      data-review-submission-id={submission?.id ?? ""}
      data-review-revision-id={submission?.revisionRef.id ?? ""}
      data-review-copied-link={copiedLinkUrl ?? ""}
      aria-busy={pending}
    >
      <header className="border-b border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-accent"><GitCompareArrows className="size-4" aria-hidden="true" /><p className="text-[0.6875rem] font-black uppercase tracking-[0.14em]">{bt("검수 작업대", "Visual review")}</p></div>
            <h2 className="mt-1 text-lg font-black text-fg">{bt("원고 비교·주석·승인", "Compare, annotate, approve")}</h2>
            <p className="mt-1 text-xs leading-5 text-fg-2">{bt("컷 계획·제출본 정보를 확인하고 컷 위치에 질문을 남깁니다. 계획 도식은 실제 원고 이미지나 픽셀 차이가 아닙니다.", "Check cut plans and submissions, and leave questions on a cut. Plan diagrams are not real pages or pixel diffs.")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-2">회차 <select aria-label="검수 회차" disabled={pending || target.targeted} value={selectedEpisodeId} onChange={(event) => handleSelectEpisode(event.target.value)} className="ml-2 bg-transparent font-semibold text-fg outline-none">{!selectedEpisodeId ? <option value="">{bt("대상 회차 없음", "No target episode")}</option> : null}{episodes.map((episode) => <option key={episode.episodeId} value={episode.episodeId}>{episodeOptionLabel(aggregate, episode.episodeId, bt)}</option>)}</select></label>
            <label className="rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-2">제출본 <select aria-label="검수 제출본" disabled={pending} value={submission?.id ?? ""} onChange={(event) => handleSelectSubmission(event.target.value)} className="ml-2 max-w-44 bg-transparent font-semibold text-fg outline-none"><option value="">{bt("제출본 없음", "No submission")}</option>{submissions.map((entry) => <option key={entry.id} value={entry.id}>{entry.sourceEvidence?.version === 1 ? bt(`원고 v${entry.revisionRef.revision} · ${submissionStatusLabel(entry.status, bt)}`, `Manuscript v${entry.revisionRef.revision} · ${submissionStatusLabel(entry.status, bt)}`) : bt(`${entry.revisionRef.revision}차 제출본 · ${submissionStatusLabel(entry.status, bt)}`, `Revision ${entry.revisionRef.revision} · ${submissionStatusLabel(entry.status, bt)}`)}</option>)}</select></label>
            <button
              type="button"
              data-review-copy-deep-link="true"
              disabled={!selectedEpisodeId}
              onClick={() => void handleCopyReviewDeepLink()}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-9 gap-1.5 text-xs" })}
            >
              {copiedLinkUrl ? <Check className="size-3.5 text-good" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
              {bt("검수 링크 복사", "Copy review link")}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex max-w-full overflow-x-auto rounded-xl border border-line bg-card p-1" role="group" aria-label="검수 비교 방식">{REVIEW_MODE.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent", mode === id ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")}><Icon className="size-3.5" aria-hidden="true" />{label}</button>)}</div>
          <div className="flex flex-wrap gap-2"><Pill tone={submission?.status === "approved" ? "good" : submission ? "warn" : "neutral"}>{submission ? manuscriptVersionLabel ? `${submissionStatusLabel(submission.status, bt)} · ${manuscriptVersionLabel}` : bt(`${submissionStatusLabel(submission.status, bt)} · ${submission.revisionRef.revision}차`, `${submissionStatusLabel(submission.status, bt)} · rev. ${submission.revisionRef.revision}`) : bt("제출본 없음", "No submission")}</Pill><Pill tone={evaluation?.approved && !staleInputTasks.length ? "good" : "warn"}>{staleInputTasks.length ? bt("입력 갱신 필요", "Input update required") : evaluation?.approved ? bt("검수 통과", "Review passed") : bt(`승인 대기 ${evaluation?.blockingLanes.length ?? 0}개 영역`, `${evaluation?.blockingLanes.length ?? 0} areas awaiting approval`)}</Pill><Pill>{assignment ? assignmentBadge(partyLabel(aggregate, assignment.id), assignment.publicCreditRole ?? roleTypeLabel(assignment.roleType, bt)) : bt("담당 역할 배정 없음", "No assigned role")}</Pill></div>
        </div>
        <ProductionWorkspaceDeepLinkBanners episodeId={selectedEpisodeId} cutId={selectedCut?.cutId ?? null} submission={submission} freshness={freshness} linkMismatchMessages={linkMismatchMessages} roleTransition={activeRoleTransition} preservedDraftEntries={preservedDraftEntries} onDismissRoleTransition={() => { setLensTransition(null); onDismissRoleTransition?.(); }} onSwitchToLatest={handleSelectSubmission} onCompareMode={() => setMode("compare")} />
        {staleDecisionNotice ? <ProductionStaleDecisionBanner notice={staleDecisionNotice} onOpenLatest={handleSelectSubmission} onDismiss={() => setLastRecordedDecisionMeta(null)} /> : null}
        {canResubmitSubmission && submission ? <ProductionSubmissionResubmitComposer key={submission.id} submission={submission} cuts={cuts} selectedCutId={selectedCut?.cutId ?? null} openClarifications={clarifications} priorApprovalSummary={priorApprovalLabels} nextReviewerLabels={nextReviewerPreviewLabels} canEdit={canEdit} pending={pending} noteValue={resubmitNote} onNoteChange={setResubmitNote} onResubmit={(input) => void handleResubmitSubmission(input)} /> : null}
        {submission && resubmissionSummary ? <ProductionSubmissionResubmissionSummaryBanner submission={submission} summary={resubmissionSummary} onSelectCut={handleSelectCut} /> : null}
        {target.targeted ? <div className="mt-3 rounded-xl border border-accent/30 bg-accent-soft p-3 text-xs text-fg">
          <p className="font-bold">{target.task ? bt(`선택한 작업 · ${target.task.title}`, `Selected task · ${target.task.title}`) : bt("선택한 작업을 찾을 수 없습니다.", "The selected task could not be found.")}</p>
          {target.issue ? <p className="mt-1">{bt("링크의 작업·회차가 현재 프로젝트와 일치하지 않습니다. 작업 보드에서 검수 대상을 다시 열어 주세요.", "The linked task or episode does not match this project. Reopen the review from the task board.")}</p>
            : !submissions.length ? <p className="mt-1">{bt("이 작업에 연결된 현재 제출본이 없습니다. 산출물과 고정 제출본을 연결한 뒤 검수하세요.", "This task has no linked current submission. Connect a deliverable and a pinned submission before reviewing.")}</p> : null}
        </div> : null}
        {!staleDecisionNotice && requestNotice ? <p role="status" className="mt-3 rounded-xl border border-good/30 bg-good/10 p-3 text-sm">{requestNotice}</p> : null}
        {requestError ? <p role="alert" className="mt-3 rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm">{requestError}</p> : null}
      </header>

      {/* 단계 인계: 선택 회차의 앞 단계(기획·콘티) 산출을 검수 시작 화면에 자동 인용한다. */}
      <div className="border-b border-line p-4">
        <EpisodeStageHandoffSection aggregate={aggregate} episodeId={selectedEpisodeId} targetStage="review" />
      </div>

      {submission ? <ProductionSubmissionVisualReview aggregate={aggregate} submission={submission} /> : null}

      <div className="grid min-h-[46rem] xl:grid-cols-[13rem_minmax(0,1fr)_21rem]">
        <aside className="border-b border-line bg-panel/70 p-3 xl:border-b-0 xl:border-r" aria-label="검수 컷 목록">
          <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-fg-3">컷 내비게이터</p>
          <label className="mt-3 block text-xs font-semibold">{bt("컷 검색", "Find cuts")}
            <input type="search" value={cutQuery} maxLength={200} onChange={(event) => setCutQuery(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm" />
          </label>
          <div role="group" aria-label={bt("검수 우선순위 필터", "Review priority filters")} className="mt-2 flex flex-wrap gap-1">
            {([["all", bt("전체 컷", "All cuts")], ["open", bt("열린 이슈 컷", "Open issues")], ["blocking", bt("차단 질문 컷", "Blocking questions")]] as const).map(([key, label]) =>
              <button key={key} type="button" aria-pressed={cutFocus === key}
                className={cn("min-h-11 rounded-lg border px-2 text-xs", cutFocus === key ? "border-accent bg-accent-soft text-accent" : "border-line bg-card")}
                onClick={() => setCutFocus(key)}>{label}</button>)}
          </div>
          <p className="mt-2 text-xs text-fg-3">{cutResults.length} / {cuts.length} {bt("개 컷 · 질문 초안은 컷별로 유지됩니다.", "cuts. Drafts are preserved per cut.")}</p>
          {cuts.length > 0 && cutResults.length === 0 ? <button type="button" className="mt-2 min-h-11 rounded-xl border border-dashed border-line p-3 text-xs" onClick={() => { setCutQuery(""); setCutFocus("all"); }}>{bt("일치하는 컷 없음 · 필터 초기화", "No matching cuts. Reset filters")}</button> : null}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 xl:block xl:max-h-[40rem] xl:space-y-2 xl:overflow-y-auto">
            {cutResults.map((cut) => { const issues = issueCountForCut(cut); return <button key={cut.cutId} type="button" aria-label={`${cut.cutId} 컷으로 이동`} aria-pressed={selectedCutId === cut.cutId} onClick={() => handleSelectCut(cut.cutId)} className={cn("min-w-40 rounded-xl border p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent xl:min-w-0 xl:w-full", selectedCutId === cut.cutId ? "border-accent bg-accent-soft" : "border-line bg-card hover:bg-raised")}><div className="flex items-center justify-between gap-2"><span className="text-[0.6875rem] font-black text-accent">{cut.cutId}</span>{issues > 0 ? <span className="flex size-5 items-center justify-center rounded-full bg-bad text-[0.625rem] font-black text-on-accent">{issues}</span> : <CheckCircle2 className="size-4 text-good" aria-label="열린 이슈 없음" />}</div><p className="mt-1 line-clamp-2 text-xs font-semibold leading-4 text-fg">{cut.framing}</p></button>; })}
          </div>
          {cuts.length === 0 ? <div className="mt-3 rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-3">{t("productionHub.review.emptyCutPlans", "이 회차에 검수할 컷 계획이 없습니다.")}</div> : null}
        </aside>

        <div className="min-w-0 border-b border-line bg-canvas/65 p-3 sm:p-4 xl:border-b-0 xl:border-r">
          {cuts.length > 0 ? (
            <div className="mx-auto max-w-4xl">
              {mode === "vertical" ? <div className="mx-auto max-w-md rounded-[2rem] border border-line bg-card p-3 shadow-lg"><div className="mb-3 flex items-center justify-between rounded-xl bg-raised px-3 py-2 text-[0.6875rem] text-fg-2"><span className="inline-flex items-center gap-1"><ScanLine className="size-3.5" />세로 독자뷰</span><span>{episodePlan?.targetScrollHeightPx.toLocaleString("ko-KR") ?? "—"}px 목표</span></div><div className="space-y-4 bg-canvas p-2">{cuts.map((cut) => <ReviewPanel key={cut.cutId} cut={cut} selected={selectedCutId === cut.cutId} issues={issueCountForCut(cut)} revisionLabel={submission ? bt(`제출 ${submission.revisionRef.revision}차 · ${submission.revisionRef.id}`, `Sub v${submission.revisionRef.revision} · ${submission.revisionRef.id}`) : bt(`계획 ${cut.revision}차`, `Plan v${cut.revision}`)} onSelect={() => handleSelectCut(cut.cutId)} />)}</div></div> : null}

              {mode === "compare" ? <div className="grid gap-4 lg:grid-cols-2"><div><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black text-fg">{bt("기준본", "Baseline")}</p><Pill>{bt("콘티·썸네일 기준", "Storyboard baseline")}</Pill></div><div className="space-y-3 rounded-2xl border border-line bg-card p-3">{cuts.map((cut) => <ReviewPanel key={`base-${cut.cutId}`} cut={cut} selected={selectedCutId === cut.cutId} issues={0} muted revisionLabel={bt(`기준 ${Math.max(1, cut.revision - 1)}차`, `Base v${Math.max(1, cut.revision - 1)}`)} onSelect={() => handleSelectCut(cut.cutId)} />)}</div></div><div><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black text-fg">{bt("제출본", "Submission")}</p><Pill tone="accent">{manuscriptVersionLabel ?? (submission ? bt(`${submission.revisionRef.revision}차`, `Rev. ${submission.revisionRef.revision}`) : bt("미제출", "Not submitted"))}</Pill></div><div className="space-y-3 rounded-2xl border border-accent/30 bg-accent-soft/35 p-3">{cuts.map((cut) => <ReviewPanel key={`head-${cut.cutId}`} cut={cut} selected={selectedCutId === cut.cutId} issues={issueCountForCut(cut)} revisionLabel={manuscriptVersionLabel ?? (submission ? bt(`제출 ${submission.revisionRef.revision}차`, `Submitted v${submission.revisionRef.revision}`) : bt(`계획 ${cut.revision}차`, `Plan v${cut.revision}`))} onSelect={() => handleSelectCut(cut.cutId)} />)}</div></div></div> : null}

              {mode === "overlay" && selectedCut ? <div className="mx-auto max-w-lg"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black text-fg">{bt("선택 컷 겹쳐 보기", "Selected cut overlay")}</p><Pill tone="accent">{bt("계획 도식", "Plan diagram")}</Pill></div><div className="relative overflow-hidden rounded-2xl border border-line bg-card p-3"><ReviewPanel cut={selectedCut} selected issues={issueCountForCut(selectedCut)} revisionLabel={bt("제출본", "Submission")} onSelect={() => undefined} /><div className="pointer-events-none absolute inset-3 translate-x-2 translate-y-1 rounded-xl border-2 border-dashed border-warn/70 bg-warn/10 mix-blend-multiply dark:mix-blend-screen" /><div className="pointer-events-none absolute left-[18%] top-[22%] rounded-full border-2 border-bad bg-card/90 px-2 py-1 text-[0.6875rem] font-black text-bad">{bt("주석 위치 예시", "Annotation example")}</div><div className="pointer-events-none absolute bottom-[27%] right-[15%] rounded-full border-2 border-accent bg-card/90 px-2 py-1 text-[0.6875rem] font-black text-accent">{bt("계획 정보", "Plan details")}</div></div><p className="mt-3 text-center text-xs leading-5 text-fg-2">{bt("실제 원고 이미지 비교가 연결되기 전에는 계획·제출본 정보와 주석 범위만 비교합니다.", "Until real page images are connected, this compares plan and submission details and annotation areas only.")}</p></div> : null}
            </div>
          ) : <div className="flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-line"><div className="text-center"><Eye className="mx-auto size-8 text-fg-3" /><p className="mt-3 text-sm font-bold text-fg">{t("productionHub.review.emptyCuts", "검수할 컷이 없습니다")}</p><p className="mt-1 text-xs text-fg-2">기획 캔버스에서 컷을 만든 뒤 제출 revision과 비교하세요.</p></div></div>}
        </div>

        <aside className="bg-panel/70 p-3 sm:p-4" aria-label="검수 인스펙터">
          <div className="space-y-4">
            <section className="rounded-2xl border border-line bg-card p-3">
              <div className="flex items-center gap-2"><BadgeCheck className="size-4 text-accent" aria-hidden="true" /><h3 className="text-xs font-black text-fg">{bt("승인 영역", "Approval areas")}</h3></div>
              <label className="mt-3 block text-xs font-semibold">{bt("내 검수 역할", "My review assignment")}<select className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm" disabled={pending || !canEdit || reviewAssignments.length === 0} value={reviewAssignments.some((entry) => entry.id === assignment?.id) ? assignment?.id ?? "" : ""} onChange={(event) => chooseAssignment({ scope: assignmentScope, id: event.target.value })}>
                <option value="">{bt("내 유효한 검수 역할 선택", "Select your eligible review assignment")}</option>{reviewAssignments.map((entry) => <option key={entry.id} value={entry.id}>{partyLabel(aggregate, entry.id)} · {roleTypeLabel(entry.roleType, bt)}</option>)}</select></label>
              {policy ? <p className="mt-2 text-xs text-fg-2">{policy.quorumBasis === "accounts" ? bt("서버가 확인한 서로 다른 계정 인원으로 정족수를 계산합니다. 계정 증명이 없는 기존 승인은 재확인이 필요합니다.", "Quorum counts distinct server-verified accounts. Older approvals without account evidence require renewed review.") : bt("기존 역할표 기준 정책입니다. 같은 사람의 여러 역할이 여러 표가 될 수 있습니다.", "This legacy policy counts assignment votes, which may include multiple roles held by one person.")}</p> : null}
              <div className="mt-3 space-y-2">
                {policy?.lanes.map((lane) => {
                  const result = evaluation?.laneResults.find((entry) => entry.lane === lane.lane);
                  const eligible = Boolean(assignment && lane.eligibleAssignmentIds.includes(assignment.id));
                  return <div key={lane.lane} className="rounded-xl border border-line bg-panel p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-fg">{reviewLaneLabel(lane.lane, bt)}</span><Pill tone={result?.approved ? "good" : result?.vetoedByAssignmentIds.length ? "bad" : "warn"}>{result?.approved ? "승인" : `${result?.approvals ?? 0}/${result?.requiredApprovals ?? lane.quorum}`}</Pill></div><p className="mt-1 text-[0.6875rem] text-fg-3">{lane.blocksPublication ? bt("공개 전 필수", "Required before publishing") : bt("권고", "Advisory")} · {eligible ? bt("내 역할로 결정 가능", "You can decide") : bt("내 역할은 보기만", "View only for your role")}</p>{eligible ? <div className="mt-2 grid grid-cols-2 gap-1.5"><button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={pending || !canEdit || !canReviewSubmission} onClick={() => void recordDecision(lane.lane, "approve")}><CheckCircle2 className="size-3.5" />승인</button><button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={pending || !canEdit || !canReviewSubmission} onClick={() => void recordDecision(lane.lane, "request-changes")}><XCircle className="size-3.5" />수정</button></div> : null}</div>;
                })}
                {!policy ? <p className="rounded-xl border border-dashed border-line p-3 text-xs text-fg-3">{t("productionHub.review.emptyPolicy", "이 회차의 검수 정책이 없습니다.")}</p> : null}
              </div>
              {!canReviewSubmission ? <p className="mt-3 text-xs text-fg-2">{bt("현재 제출 또는 검수 중인 고정 버전을 선택해야 결정을 기록할 수 있습니다.", "Select the pinned current submitted or in-review version to record a decision.")}</p> : null}
              {submissionBlockers.length ? <div className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg">
                <p>{bt(`진행을 막는 질문 ${submissionBlockers.length}개를 해결해야 제출본 승인을 확정할 수 있습니다.`, `Resolve ${submissionBlockers.length} blocking questions before confirming approval.`)}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">{submissionBlockers.slice(0, 3).map((thread) => <li key={thread.id}>{thread.question}</li>)}</ul>
                <a href={selectedEpisodeId ? `/production/projects/${encodeURIComponent(aggregate.projectId)}/episodes/${encodeURIComponent(selectedEpisodeId)}` : `/production/projects/${encodeURIComponent(aggregate.projectId)}/handoff`} className={cn(buttonClass({ variant: "outline", className: "min-h-11" }), "mt-2")}>{bt("인계 질문 확인·답변", "Review handoff questions")}</a>
              </div> : null}
              {staleInputTasks.length ? <div role="alert" className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg">
                <p>{bt("선행 입력이 바뀌었습니다. 현재 승인된 선행 입력으로 새 제출본을 준비해야 승인할 수 있습니다. 기존 검수 의견은 유지됩니다.", "Upstream inputs changed. Prepare a new submission from the current approved inputs before confirming approval. Existing review decisions are preserved.")}</p>
                <a href={`/production/projects/${encodeURIComponent(aggregate.projectId)}/handoff`} className={cn(buttonClass({ variant: "outline", className: "min-h-11" }), "mt-2")}>{bt("인계 작업함에서 입력 확인", "Check inputs in handoff queue")}</a>
              </div> : null}
              {canReviewSubmission && submission?.status === "in-review" && evaluation?.approved && assignment && decisions.some((decision) => decision.assignmentId === assignment.id && decision.value === "approve") ? <button type="button" className={cn(buttonClass({ className: "min-h-11" }), "mt-3 w-full")} disabled={pending || !canEdit || submissionBlockers.length > 0 || staleInputTasks.length > 0} onClick={() => void finalizeSubmission()}>{bt("제출본 승인 확정", "Confirm submission approval")}</button> : null}
              {eligibleLanes.length === 0 && policy ? <div className="mt-3 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 p-2.5 text-[0.6875rem] leading-5 text-fg-2"><ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />{t("productionHub.review.noApprovalPermission", "현재 역할에는 이 회차의 승인 권한이 없습니다.")}</div> : null}
            </section>

            <ProductionReviewClarificationCards
              selectedCut={selectedCut}
              comment={comment}
              blocking={blocking}
              pending={pending}
              canEdit={canEdit}
              canCompose={Boolean(selectedCut && handoff && assignment && answerOwner)}
              retryAvailable={failedCommentDraftKey === draftKey}
              clarifications={clarifications}
              emptyOpenQuestionsText={t("productionHub.review.emptyOpenQuestions", "열린 질문이 없습니다.")}
              partyLabelForAssignment={(id) => partyLabel(aggregate, id)}
              onChangeComment={setComment}
              onChangeBlocking={setBlocking}
              onSubmitClarification={() => void addClarification()}
            />
          </div>
        </aside>
      </div>
    </section>
  );
}
