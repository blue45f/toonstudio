import {
  Check,
  FileText,
  PencilLine,
  Quote,
  X,
} from "lucide-react";
import { useId, useState } from "react";

import {
  MEETING_DECISION_LABELS_KO,
  countPendingProposals,
  extractMeetingDecisions,
  type AiChangeProposal,
  type MeetingDecisionItem,
  type ProposalOp,
  type ProposalSource,
  type ProposalStatus,
  type StoryLivingSpecState,
  type StoryNodeSnapshot,
} from "./studio-story-living-spec-store";

import { cn } from "@/shared/lib/utils";

export interface StudioAiProposalDiffGateProps {
  readonly state: StoryLivingSpecState;
  readonly className?: string;
  readonly onApprove: (proposalId: string) => void;
  readonly onEditAndApprove: (proposalId: string, edited: StoryNodeSnapshot) => void;
  readonly onReject: (proposalId: string) => void;
  readonly onConvertMeetingDecisions?: (decisions: readonly MeetingDecisionItem[]) => void;
  readonly onJumpToTarget?: (targetEntityId: string) => void;
}

type ProposalFilterTab = "pending" | "approved" | "rejected" | "all";

const OP_LABEL_KO: Readonly<Record<ProposalOp, string>> = {
  create: "신규",
  update: "수정",
  delete: "삭제",
};

const SOURCE_LABEL_KO: Readonly<Record<ProposalSource, string>> = {
  studio_chat: "스튜디오 대화",
  review_fix: "검수 수정안",
  cross_doc_sync: "문서 동기화",
  external_mcp: "외부 에이전트",
  meeting_decision: "회의록 결정",
};

const STATUS_LABEL_KO: Readonly<Record<ProposalStatus, string>> = {
  draft: "초안",
  pending: "승인 대기",
  approved: "승인 완료",
  rejected: "거절됨",
};

interface DiffFieldRow {
  readonly labelKo: string;
  readonly before: string;
  readonly after: string;
}

function buildDiffRows(proposal: AiChangeProposal): readonly DiffFieldRow[] {
  const before = proposal.beforeSnapshot;
  const after = proposal.userEditedSnapshot ?? proposal.proposedSnapshot;
  const rows: DiffFieldRow[] = [];

  if ((before?.title ?? "") !== (after?.title ?? "") && (before?.title || after?.title)) {
    rows.push({ labelKo: "제목", before: before?.title ?? "—", after: after?.title ?? "삭제됨" });
  }
  if ((before?.summary ?? "") !== (after?.summary ?? "") && (before?.summary || after?.summary)) {
    rows.push({ labelKo: "요약", before: before?.summary ?? "—", after: after?.summary ?? "삭제됨" });
  }
  const beforeCam = before?.cutSlots?.cameraAngleLens ?? "";
  const afterCam = after?.cutSlots?.cameraAngleLens ?? "";
  if (beforeCam !== afterCam && (beforeCam || afterCam)) {
    rows.push({ labelKo: "카메라 앵글", before: beforeCam || "—", after: afterCam || "—" });
  }
  const beforeDlg = before?.cutSlots?.keyDialogue ?? before?.dialogueLines?.join(" / ") ?? "";
  const afterDlg = after?.cutSlots?.keyDialogue ?? after?.dialogueLines?.join(" / ") ?? "";
  if (beforeDlg !== afterDlg && (beforeDlg || afterDlg)) {
    rows.push({ labelKo: "핵심 대사", before: beforeDlg || "—", after: afterDlg || "—" });
  }
  if (rows.length === 0) {
    rows.push({
      labelKo: "변경 요약",
      before: before?.title ?? "기존 항목 없음",
      after: after?.title ?? (proposal.op === "delete" ? "항목 삭제" : proposal.title),
    });
  }
  return rows;
}

/**
 * 항목별 AI 제안 Diff 승인·직접수정·거절 게이트 UI.
 * 원문을 직접 덮어쓰지 않고, 수정 후 승인 시 '내가 고친 내용' 배지를 남긴다.
 */
export function StudioAiProposalDiffGate({
  state,
  className,
  onApprove,
  onEditAndApprove,
  onReject,
  onConvertMeetingDecisions,
  onJumpToTarget,
}: StudioAiProposalDiffGateProps) {
  const baseId = useId();
  const [filter, setFilter] = useState<ProposalFilterTab>("pending");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [meetingDraft, setMeetingDraft] = useState("");
  const [extractedDecisions, setExtractedDecisions] = useState<readonly MeetingDecisionItem[]>([]);

  const pendingCount = countPendingProposals(state);
  const filteredProposals = state.proposals.filter((item) => {
    if (filter === "all") return true;
    return item.status === filter;
  });

  const beginEdit = (proposal: AiChangeProposal) => {
    const base = proposal.userEditedSnapshot ?? proposal.proposedSnapshot ?? proposal.beforeSnapshot;
    setEditingId(proposal.id);
    setEditTitle(base?.title ?? proposal.title);
    setEditSummary(base?.summary ?? "");
  };

  const commitEditedApproval = (proposal: AiChangeProposal) => {
    onEditAndApprove(proposal.id, {
      ...proposal.proposedSnapshot,
      title: editTitle.trim() || proposal.proposedSnapshot?.title,
      summary: editSummary.trim(),
    });
    setEditingId(null);
  };

  const handleExtractMeetingNotes = () => {
    const knownKeys = state.nodes.map((node) => node.key);
    const items = extractMeetingDecisions(meetingDraft, "meeting-note-inline", knownKeys);
    setExtractedDecisions(items);
  };

  return (
    <section
      aria-label="AI 변경 제안 Diff 승인 게이트"
      data-testid="studio-ai-proposal-diff-gate"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all]",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          {pendingCount > 0 ? (
            <span
              data-testid="diff-gate-pending-dot"
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full bg-cool ring-2 ring-cool/30"
            />
          ) : null}
          <h2 className="text-sm font-bold text-fg">AI 제안 검토 게이트</h2>
          <span className="rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-semibold text-fg-2 tabular-nums">
            대기 {pendingCount}건
          </span>
        </div>

        <div role="tablist" aria-label="제안 상태 필터" className="flex flex-wrap gap-1">
          {(
            [
              ["pending", "대기 중"],
              ["approved", "승인됨"],
              ["rejected", "거절됨"],
              ["all", "전체"],
            ] as const
          ).map(([tabId, label]) => {
            const active = filter === tabId;
            return (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tabId)}
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </header>

      {filteredProposals.length === 0 ? (
        <p className="rounded-xl border border-line bg-card px-4 py-6 text-center text-xs text-fg-2">
          표시할 제안 항목이 없습니다.
        </p>
      ) : (
        <ul className="flex max-h-[30rem] flex-col gap-3 overflow-y-auto overscroll-contain">
          {filteredProposals.map((proposal) => {
            const diffRows = buildDiffRows(proposal);
            const isEditing = editingId === proposal.id;
            const opClass =
              proposal.op === "create"
                ? "border-good/40 bg-good/10 text-good"
                : proposal.op === "delete"
                  ? "border-bad/40 bg-bad/10 text-bad"
                  : "border-cool/40 bg-cool/10 text-cool";

            return (
              <li
                key={proposal.id}
                data-testid={`proposal-card-${proposal.id}`}
                className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded border px-2 py-0.5 text-[0.7rem] font-bold", opClass)}>
                      {OP_LABEL_KO[proposal.op]}
                    </span>
                    <span className="rounded border border-line bg-raised px-2 py-0.5 text-[0.7rem] text-fg-2">
                      {SOURCE_LABEL_KO[proposal.source]}
                    </span>
                    <span className="rounded border border-line bg-panel px-2 py-0.5 text-[0.7rem] text-fg-2">
                      {STATUS_LABEL_KO[proposal.status]}
                    </span>
                    {proposal.userEdited ? (
                      <span
                        data-testid={`proposal-user-edited-${proposal.id}`}
                        className="rounded border border-accent/40 bg-accent-soft px-2 py-0.5 text-[0.7rem] font-bold text-accent"
                      >
                        내가 고친 내용
                      </span>
                    ) : null}
                  </div>

                  {onJumpToTarget ? (
                    <button
                      type="button"
                      onClick={() => onJumpToTarget(proposal.targetEntityId)}
                      className="inline-flex min-h-11 items-center rounded-lg border border-line bg-raised px-2.5 text-[0.7rem] font-semibold text-fg-2 tabular-nums hover:border-line-strong hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                    >
                      대상: {proposal.targetEntityId}
                    </button>
                  ) : (
                    <span className="text-[0.7rem] font-semibold text-fg-3 tabular-nums">
                      {proposal.targetEntityId}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-fg">{proposal.title}</h3>
                  <p className="mt-0.5 text-xs text-fg-2">{proposal.rationale}</p>
                </div>

                <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel p-2.5 text-xs">
                  {diffRows.map((row) => (
                    <div key={`${proposal.id}-${row.labelKo}`} className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md border border-bad/25 bg-bad/10 p-2">
                        <span className="block text-[0.65rem] font-semibold text-bad">
                          기존 · {row.labelKo}
                        </span>
                        <p className="mt-0.5 text-fg-2">{row.before}</p>
                      </div>
                      <div className="rounded-md border border-good/30 bg-good/10 p-2">
                        <span className="block text-[0.65rem] font-semibold text-good">
                          제안 · {row.labelKo}
                        </span>
                        <p className="mt-0.5 font-medium text-fg">{row.after}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {proposal.evidenceCitations.length > 0 ? (
                  <div className="flex flex-col gap-1 rounded-lg border border-line bg-raised/60 px-2.5 py-2 text-[0.72rem] text-fg-2">
                    {proposal.evidenceCitations.map((citation, idx) => (
                      <p key={`${proposal.id}-cit-${idx}`} className="flex items-start gap-1.5">
                        <Quote className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden="true" />
                        <span>
                          <strong className="font-semibold text-fg">{citation.sourceDocId}</strong>:{" "}
                          {citation.quote}
                        </span>
                      </p>
                    ))}
                  </div>
                ) : null}

                {isEditing ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-panel p-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${baseId}-edit-title-${proposal.id}`} className="text-xs font-semibold text-fg">
                        수정할 제목
                      </label>
                      <input
                        id={`${baseId}-edit-title-${proposal.id}`}
                        type="text"
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${baseId}-edit-summary-${proposal.id}`} className="text-xs font-semibold text-fg">
                        수정할 요약 내용
                      </label>
                      <textarea
                        id={`${baseId}-edit-summary-${proposal.id}`}
                        rows={2}
                        value={editSummary}
                        onChange={(event) => setEditSummary(event.target.value)}
                        className="rounded-lg border border-line bg-card p-2.5 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => commitEditedApproval(proposal)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-bold text-on-accent transition-[background-color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                      >
                        <Check className="size-4" aria-hidden="true" />
                        수정한 내용으로 승인
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex min-h-11 items-center rounded-lg border border-line bg-raised px-3 text-xs font-semibold text-fg-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : proposal.status === "pending" ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onApprove(proposal.id)}
                      className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-bold text-on-accent transition-[background-color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                    >
                      <Check className="size-4" aria-hidden="true" />
                      승인
                    </button>
                    <button
                      type="button"
                      onClick={() => beginEdit(proposal)}
                      className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border border-line bg-raised px-3 text-xs font-semibold text-fg hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                    >
                      <PencilLine className="size-4" aria-hidden="true" />
                      직접 고쳐서 승인
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject(proposal.id)}
                      className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border border-bad/35 bg-bad/10 px-3 text-xs font-semibold text-bad hover:bg-bad/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                    >
                      <X className="size-4" aria-hidden="true" />
                      거절
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {onConvertMeetingDecisions ? (
        <details className="rounded-xl border border-line bg-card p-3">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-xs font-semibold text-fg">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-4 text-accent" aria-hidden="true" />
              PD·어시 회의록 결정 추출 (확정 · 미정 · 기각)
            </span>
            <span className="text-[0.7rem] text-fg-2 tabular-nums">
              추출 {extractedDecisions.length}건
            </span>
          </summary>
          <div className="mt-2.5 flex flex-col gap-2">
            <label htmlFor={`${baseId}-meeting-notes`} className="text-xs text-fg-2">
              회의 메모를 붙여 넣으면 확정·미정·기각 항목을 원문 인용과 함께 분류합니다.
            </label>
            <textarea
              id={`${baseId}-meeting-notes`}
              rows={3}
              value={meetingDraft}
              placeholder="[확정] PD: EP01-C01 역광 강조&#10;[미정] 어시: 소품 색상 추후 논의"
              onChange={(event) => setMeetingDraft(event.target.value)}
              className="rounded-lg border border-line bg-panel p-2.5 text-xs text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExtractMeetingNotes}
                className="inline-flex min-h-11 items-center rounded-lg border border-line bg-raised px-3 text-xs font-semibold text-fg hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              >
                결정 추출하기
              </button>
              {extractedDecisions.some((item) => item.status === "confirmed") ? (
                <button
                  type="button"
                  onClick={() => onConvertMeetingDecisions(extractedDecisions)}
                  className="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-xs font-bold text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  확정 항목을 제안 큐로 보내기
                </button>
              ) : null}
            </div>
            {extractedDecisions.length > 0 ? (
              <ul className="flex flex-col gap-1.5 pt-1 text-xs">
                {extractedDecisions.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-2"
                  >
                    <span className="font-semibold text-fg">
                      [{MEETING_DECISION_LABELS_KO[item.status]}] {item.summary}
                    </span>
                    <span className="text-[0.7rem] text-fg-3">원문: {item.quote}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export default StudioAiProposalDiffGate;
