import type { ProductionProjectAggregate, ReviewDecision } from "@toonstudio/core/production";
import { ArrowRight, Check, RotateCcw, SkipForward } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { ProductionClientCommand } from "./production-api";
import {
  deriveEpisodeApprovalGate,
  resolveEpisodeApprover,
  type EpisodeApprover,
} from "./production-episode-room-model";
import { productionEpisodeRoomPath } from "./production-project-surfaces";
import { ProductionEmptyState, ProductionPill, ProductionSectionCard } from "./production-ui";
import {
  buildReviewPlaylist,
  mergeSavedVerdicts,
  parseReviewPlaylist,
  priorityQueue,
  resumeIndex,
  reviewPlaylistStorageKey,
  reviewProgress,
  serializeReviewPlaylist,
  setReviewVerdict,
  verdictGateValue,
  type ReviewPlaylist,
  type ReviewPlaylistItem,
  type ReviewVerdict,
} from "./review-playlist-model";

import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 승인 자격이 있는 첫 배정을 고른다 (회차 룸과 같은 규칙: 다른 사람 이름으로 기록하지 않는다).
 * 샘플은 역할 관점의 참여자로 행동한다.
 */
function resolveSurfaceApprover(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
  options: { readonly isDemo: boolean; readonly roleLens: CreatorRoleLens; readonly viewerAssignmentIds: readonly string[] },
): EpisodeApprover | null {
  if (options.isDemo) {
    return resolveEpisodeApprover(aggregate, episodeId, {
      isDemo: true,
      roleLens: options.roleLens,
      viewerAssignmentId: null,
    });
  }
  for (const viewerAssignmentId of options.viewerAssignmentIds) {
    const approver = resolveEpisodeApprover(aggregate, episodeId, {
      isDemo: false,
      roleLens: options.roleLens,
      viewerAssignmentId,
    });
    if (approver) return approver;
  }
  return null;
}

function verdictPill(verdict: ReviewVerdict, bt: (ko: string, en: string) => string) {
  switch (verdict) {
    case "approved":
      return <ProductionPill tone="success">{bt("승인", "Approved")}</ProductionPill>;
    case "changes-requested":
      return <ProductionPill tone="warning">{bt("수정 요청", "Changes requested")}</ProductionPill>;
    case "skipped":
      return <ProductionPill tone="neutral">{bt("건너뜀", "Skipped")}</ProductionPill>;
    case "pending":
      return <ProductionPill tone="neutral">{bt("판정 전", "Not reviewed")}</ProductionPill>;
  }
}

/**
 * 오늘의 검수 플레이리스트: 검수할 회차를 목록으로 조립해 순서대로 판정한다.
 * 판정은 이 기기에 저장돼 닫았다 열어도 첫 미판정 항목부터 이어지고,
 * 승인과 수정 요청은 기존 승인 게이트(record-review-decision)로 함께 기록된다.
 * 건너뜀은 게이트에 남기지 않는다.
 */
export function ReviewPlaylistPanel({
  aggregate,
  execute,
  canEdit,
  roleLens,
  isDemo,
  viewerAssignmentIds,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly roleLens: CreatorRoleLens;
  readonly isDemo: boolean;
  readonly viewerAssignmentIds: readonly string[];
}) {
  const bt = useBilingual("ReviewPlaylistPanel");
  const storageKey = reviewPlaylistStorageKey(aggregate.projectId);

  // 검수 큐 조립 기준은 아래 "검수할 회차" 카드와 같다: 검수 정책이 있고 게시되지 않은 회차.
  const queue = useMemo(
    () =>
      aggregate.episodes
        .map((episode) => {
          const gate = deriveEpisodeApprovalGate(aggregate, episode.episodeId);
          const plan = aggregate.episodePlans
            .filter((entry) => entry.episodeId === episode.episodeId)
            .sort((left, right) => right.revision - left.revision)[0];
          const handoffIds = new Set(
            aggregate.handoffs.filter((handoff) => handoff.episodeId === episode.episodeId).map((handoff) => handoff.id),
          );
          const openQuestions = aggregate.clarifications.filter(
            (thread) => handoffIds.has(thread.handoffId) && thread.status === "open",
          ).length;
          return { episode, gate, plan, openQuestions };
        })
        .filter((entry) => entry.gate.policyId !== null && entry.episode.state !== "published"),
    [aggregate],
  );

  const fresh = useMemo(() => {
    const now = new Date();
    const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return buildReviewPlaylist({
      id: `today:${aggregate.projectId}:${dayKey}`,
      title: bt("오늘의 검수", "Today's review"),
      items: queue.map(({ episode, plan, openQuestions }) => ({
        id: `episode:${episode.episodeId}`,
        episodeId: episode.episodeId,
        episodeLabel: plan ? bt(`${plan.episodeNumber}화 · ${plan.title}`, `Ep. ${plan.episodeNumber} · ${plan.title}`) : episode.episodeId,
        versionLabel: plan ? bt(`기획 ${plan.revision}판`, `Plan v${plan.revision}`) : bt("기획 없음", "No plan"),
        // 표면 단계에서는 회차 단위 미해결 수를 우선순위 가중으로 쓴다 (핀 수는 회차 룸 기준).
        openPinCount: openQuestions,
      })),
    });
  }, [aggregate.projectId, queue, bt]);

  const [saved, setSaved] = useState<ReviewPlaylist | null>(() => {
    try {
      return parseReviewPlaylist(globalThis.localStorage?.getItem(storageKey) ?? null);
    } catch {
      return null;
    }
  });
  const playlist = useMemo(() => mergeSavedVerdicts(fresh, saved), [fresh, saved]);
  const [recordingItemId, setRecordingItemId] = useState<string | null>(null);

  const persist = (next: ReviewPlaylist | null) => {
    setSaved(next);
    try {
      if (next) globalThis.localStorage?.setItem(storageKey, serializeReviewPlaylist(next));
      else globalThis.localStorage?.removeItem(storageKey);
    } catch {
      // 저장이 막힌 환경에서도 이번 세션의 판정은 메모리에 남아 이어진다.
    }
  };

  const recordVerdict = async (item: ReviewPlaylistItem, verdict: Exclude<ReviewVerdict, "pending">) => {
    if (recordingItemId) return;
    persist(setReviewVerdict(playlist, item.id, verdict));
    const gateValue = verdictGateValue(verdict);
    if (!gateValue || !canEdit) return;
    const approver = resolveSurfaceApprover(aggregate, item.episodeId, { isDemo, roleLens, viewerAssignmentIds });
    if (!approver) return;
    // 이미 내 레인이 승인된 회차는 게이트에 중복 기록하지 않는다 (룸의 잠금 사유와 같은 의미론).
    const gate = deriveEpisodeApprovalGate(aggregate, item.episodeId);
    if (verdict === "approved" && gate.lanes.find((lane) => lane.lane === approver.lane)?.approved) return;
    const policy = aggregate.reviewPolicies.find((entry) => entry.scope.id === item.episodeId);
    if (!policy) return;
    const decision: ReviewDecision = {
      id: `decision-${globalThis.crypto.randomUUID()}`,
      reviewRoundId:
        aggregate.reviewDecisions.find((entry) => policy.lanes.some((candidate) => candidate.lane === entry.lane))
          ?.reviewRoundId ?? `${item.episodeId}-round-1`,
      lane: approver.lane,
      assignmentId: approver.assignmentId,
      value: gateValue,
      reasonCode: null,
      evidenceScopeRefs: [policy.scope],
      conditions: [],
      createdAt: new Date().toISOString(),
    };
    setRecordingItemId(item.id);
    try {
      await execute(
        { type: "record-review-decision", policyId: policy.id, decision },
        gateValue === "approve" ? bt("승인을 기록했습니다.", "Approval recorded.") : bt("수정 요청을 기록했습니다.", "Change request recorded."),
      );
    } catch {
      // 실행 실패 안내는 호스트가 맡는다. 판정은 이 기기에 남아 있어 다음 방문에 이어진다.
    } finally {
      setRecordingItemId(null);
    }
  };

  const progress = reviewProgress(playlist);
  const currentIndex = resumeIndex(playlist);
  const current = currentIndex >= 0 ? playlist.items[currentIndex]! : null;
  const topPriority = priorityQueue(playlist)[0] ?? null;
  const recording = recordingItemId !== null;

  return (
    <ProductionSectionCard
      title={bt("오늘의 검수 플레이리스트", "Today's review playlist")}
      description={bt(
        "오늘 검수할 회차를 순서대로 판정합니다. 닫았다 열어도 첫 미판정 항목부터 이어지고, 승인과 수정 요청은 승인 게이트에도 기록됩니다.",
        "Review today's episodes in order. Reopen anytime and it resumes at the first undecided item; approvals and change requests are also recorded in the approval gate.",
      )}
    >
      {queue.length === 0 ? (
        <ProductionEmptyState
          title={bt("오늘 검수할 회차가 없습니다", "Nothing to review today")}
          description={bt("검수 기준이 있는 회차가 생기면 오늘의 플레이리스트에 자동으로 모입니다.", "Episodes with review rules are collected here automatically.")}
        />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
              <p aria-live="polite">
                {bt(
                  `판정 ${progress.decided}/${progress.total} · 승인 ${progress.approved} · 수정 요청 ${progress.changesRequested} · 건너뜀 ${progress.skipped}`,
                  `${progress.decided}/${progress.total} decided · ${progress.approved} approved · ${progress.changesRequested} changes · ${progress.skipped} skipped`,
                )}
                {progress.pending > 0
                  ? bt(` · 남은 열린 질문 ${progress.remainingOpenPins}개`, ` · ${progress.remainingOpenPins} open questions left`)
                  : null}
              </p>
              {progress.decided > 0 ? (
                <button
                  type="button"
                  className={buttonClass({ variant: "ghost", size: "sm", className: "gap-1" })}
                  onClick={() => persist(null)}
                  disabled={recording}
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {bt("판정 초기화", "Reset verdicts")}
                </button>
              ) : null}
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label={bt("검수 진행률", "Review progress")}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.decided}
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none"
                style={{ width: `${Math.round(progress.ratio * 100)}%` }}
              />
            </div>
          </div>

          {current ? (
            <div className="rounded-2xl border border-accent/40 bg-accent-soft p-4">
              <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">
                {bt(`지금 검수 중 · ${currentIndex + 1}/${progress.total}`, `Now reviewing · ${currentIndex + 1}/${progress.total}`)}
              </p>
              <p className="mt-1.5 text-sm font-black text-fg">
                {current.episodeLabel}
                <span className="ml-2 text-xs font-semibold text-fg-2">{current.versionLabel}</span>
              </p>
              {current.openPinCount > 0 ? (
                <p className="mt-1 text-xs text-fg-2">{bt(`답을 기다리는 질문 ${current.openPinCount}개가 있습니다.`, `${current.openPinCount} questions are waiting for answers.`)}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5" })}
                  onClick={() => void recordVerdict(current, "approved")}
                  disabled={!canEdit || recording}
                >
                  <Check className="size-4" aria-hidden="true" />
                  {recordingItemId === current.id ? bt("기록 중…", "Recording…") : bt("승인", "Approve")}
                </button>
                <button
                  type="button"
                  className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                  onClick={() => void recordVerdict(current, "changes-requested")}
                  disabled={!canEdit || recording}
                >
                  {bt("수정 요청", "Request changes")}
                </button>
                <button
                  type="button"
                  className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11 gap-1.5" })}
                  onClick={() => void recordVerdict(current, "skipped")}
                  disabled={!canEdit || recording}
                >
                  <SkipForward className="size-4" aria-hidden="true" />
                  {bt("건너뛰기", "Skip")}
                </button>
                <Link
                  className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11 gap-1 text-accent" })}
                  to={productionEpisodeRoomPath(aggregate.projectId, current.episodeId)}
                >
                  {bt("회차 룸에서 열기", "Open in episode room")}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
              {!canEdit ? (
                <p className="mt-2 text-xs text-fg-3">{bt("편집 권한이 없어 판정을 기록할 수 없습니다.", "You don't have edit access, so verdicts can't be recorded.")}</p>
              ) : null}
              {topPriority && topPriority.id !== current.id ? (
                <p className="mt-2 text-xs text-fg-2">
                  {bt(
                    `열린 질문이 가장 많은 항목은 ${topPriority.episodeLabel}(${topPriority.openPinCount}개)입니다.`,
                    `The item with the most open questions is ${topPriority.episodeLabel} (${topPriority.openPinCount}).`,
                  )}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-2xl border border-good/30 bg-good/10 p-4 text-sm font-semibold text-fg" role="status">
              {bt("오늘 검수할 항목을 모두 판정했습니다.", "You've decided everything on today's playlist.")}
            </p>
          )}

          <ol className="space-y-1.5">
            {playlist.items.map((item, index) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                  index === currentIndex ? "border-accent/45 bg-panel" : "border-line bg-panel"
                }`}
                aria-current={index === currentIndex ? "true" : undefined}
              >
                <span className="w-6 shrink-0 font-black text-fg-3">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-fg">{item.episodeLabel}</span>
                <span className="text-fg-3">{item.versionLabel}</span>
                {item.openPinCount > 0 ? (
                  <span className="text-fg-3">{bt(`열린 질문 ${item.openPinCount}`, `${item.openPinCount} open`)}</span>
                ) : null}
                {index === currentIndex ? (
                  <ProductionPill tone="accent">{bt("검수 중", "Reviewing")}</ProductionPill>
                ) : (
                  verdictPill(item.verdict, bt)
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </ProductionSectionCard>
  );
}
