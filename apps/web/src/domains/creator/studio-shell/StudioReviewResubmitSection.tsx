import {
  AlertCircle,
  CheckCircle2,
  FileDiff,
  RefreshCcw,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  SYNTHETIC_STUDIO_REVIEW_CUTS,
  SYNTHETIC_STUDIO_REVIEW_PERSONAS,
  type StudioReviewSession,
} from "../studio-review-workflow";

function personaName(actorId: string, bt: (ko: string, en: string) => string): string {
  const found = SYNTHETIC_STUDIO_REVIEW_PERSONAS.find((item) => item.actorId === actorId);
  return found ? bt(found.labelKo, found.labelEn) : actorId;
}

export function StudioReviewResubmitSection({
  session,
  selectedCutId,
  canEditManuscript,
  noteValue,
  onNoteChange,
  onSelectCut,
  onResubmit,
}: {
  readonly session: StudioReviewSession;
  readonly selectedCutId: string;
  readonly canEditManuscript: boolean;
  readonly noteValue?: string;
  readonly onNoteChange?: (next: string) => void;
  readonly onSelectCut: (cutId: string) => void;
  readonly onResubmit: (input: {
    readonly changedCutIds: readonly string[];
    readonly note: string;
  }) => void;
}) {
  const bt = useBilingual("StudioReviewResubmitSection");
  const [changedCutIds, setChangedCutIds] = useState<readonly string[]>(() => [selectedCutId || "cut-01"]);
  const [internalNote, setInternalNote] = useState("");
  const note = noteValue ?? internalNote;
  const setNote = (next: string) => {
    setInternalNote(next);
    onNoteChange?.(next);
  };

  const toggleCut = (cutId: string) => {
    setChangedCutIds((current) =>
      current.includes(cutId) ? current.filter((id) => id !== cutId) : [...current, cutId],
    );
  };

  const canShowComposer = session.status === "changes-requested";
  const meta = session.resubmissionMeta ?? null;
  const openCount = session.threads.filter((thread) => thread.status === "open").length;
  const resolvedCount = session.threads.filter((thread) => thread.status === "resolved").length;
  const currentApprovedCount = session.decisions.filter((d) => d.decision === "approved").length;
  const requiredCount = session.requiredReviewerIds.length || 1;
  const priorApprovedInDraft = session.decisions.filter((d) => d.decision === "approved");

  if (!canShowComposer && !meta) return null;

  return (
    <div className="mt-4 space-y-3">
      {canShowComposer ? (
        <section
          data-testid="studio-review-resubmit-composer"
          className="rounded-2xl border border-accent/40 bg-accent-soft/25 p-4 text-xs text-fg"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="flex items-center gap-1.5 text-sm font-black text-fg">
              <RefreshCcw size={15} className="text-accent" aria-hidden="true" />
              {bt("수정 요청 반영 후 새 리비전 재제출", "Resubmit new revision after changes")}
            </strong>
            <span className="rounded-full border border-warning/40 bg-warning-soft/20 px-2.5 py-0.5 text-[0.68rem] font-bold text-warning">
              {bt(
                `해결 ${resolvedCount}건 · 미해결 ${openCount}건 · 새 리비전 0승인 재검수`,
                `${resolvedCount} resolved · ${openCount} open · resets approvals to 0`,
              )}
            </span>
          </div>

          {priorApprovedInDraft.length > 0 ? (
            <p className="mt-2 rounded-xl border border-warning/35 bg-card px-3 py-2 text-xs text-fg-2">
              {bt(
                `이전 승인 ${priorApprovedInDraft.length}건(${priorApprovedInDraft.map((d) => personaName(d.reviewerId, bt)).join(", ")})은 ${session.versionId} 이력으로 보관되며 새 리비전 승인으로 승계되지 않습니다.`,
                `${priorApprovedInDraft.length} prior approval(s) stay archived on ${session.versionId} and never carry over to the new revision.`,
              )}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-fg-2">{bt("변경된 컷 선택:", "Select changed cuts:")}</span>
            {SYNTHETIC_STUDIO_REVIEW_CUTS.map((cut) => {
              const checked = changedCutIds.includes(cut.cutId);
              return (
                <button
                  key={cut.cutId}
                  type="button"
                  data-testid={`studio-resubmit-cut-${cut.cutId}`}
                  aria-pressed={checked}
                  disabled={!canEditManuscript}
                  onClick={() => toggleCut(cut.cutId)}
                  className={cn(
                    "min-h-8 rounded-lg border px-2.5 text-xs font-bold",
                    checked ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2",
                  )}
                >
                  {cut.cutId} {checked ? bt("· 변경됨", "· Changed") : bt("· 유지", "· Unchanged")}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={note}
              disabled={!canEditManuscript}
              onChange={(event) => setNote(event.currentTarget.value)}
              aria-label={bt("스튜디오 재제출 메모", "Studio resubmission note")}
              placeholder={bt("수정 반영 요약 입력", "Enter revision summary")}
              className="min-h-10 flex-1 rounded-xl border border-line bg-card px-3 text-xs text-fg"
            />
            <button
              type="button"
              data-testid="studio-review-resubmit-btn"
              disabled={!canEditManuscript || changedCutIds.length === 0}
              onClick={() => {
                onResubmit({ changedCutIds, note });
                setNote("");
              }}
              className={buttonClass({ size: "sm", className: "min-h-10 shrink-0 gap-1.5 text-xs" })}
            >
              <RefreshCcw size={14} aria-hidden="true" />
              {bt("새 리비전 재제출", "Resubmit new revision")}
            </button>
          </div>
        </section>
      ) : null}

      {meta ? (
        <section
          data-testid="studio-review-resubmission-summary"
          className="space-y-2.5 rounded-2xl border border-accent/40 bg-panel p-4 text-xs text-fg"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="flex items-center gap-1.5 text-sm font-black text-fg">
              <FileDiff size={15} className="text-accent" aria-hidden="true" />
              {bt(
                `${session.versionId} 재제출 검수 요약 (이전 ${meta.previousVersionId} 대체)`,
                `${session.versionId} resubmission summary (from ${meta.previousVersionId})`,
              )}
            </strong>
            <span
              data-testid="studio-review-prior-approval-reset"
              className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-soft/20 px-2.5 py-0.5 text-[0.68rem] font-bold text-warning"
            >
              <ShieldAlert size={13} aria-hidden="true" />
              {meta.previousApprovedReviewerIds.length > 0
                ? bt(
                    `이전 승인 ${meta.previousApprovedReviewerIds.length}건 미승계 · 현재 승인 ${currentApprovedCount}/${requiredCount}`,
                    `${meta.previousApprovedReviewerIds.length} prior approval(s) reset · current ${currentApprovedCount}/${requiredCount}`,
                  )
                : bt(
                    `새 리비전 승인 ${currentApprovedCount}/${requiredCount}`,
                    `New revision approvals ${currentApprovedCount}/${requiredCount}`,
                  )}
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-card p-2.5">
              <p className="font-bold text-fg">{bt("변경된 컷", "Changed cuts")}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {meta.changedCutIds.map((cutId) => (
                  <button
                    key={cutId}
                    type="button"
                    onClick={() => onSelectCut(cutId)}
                    className="rounded-lg border border-accent/45 bg-accent-soft px-2 py-0.5 text-[0.68rem] font-bold text-accent"
                  >
                    {cutId} · {bt("변경됨", "Changed")}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-2.5">
              <p className="font-bold text-fg">
                {bt(
                  `해결 ${resolvedCount}건 · 미해결 ${openCount}건`,
                  `${resolvedCount} resolved · ${openCount} open`,
                )}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2 text-[0.68rem]">
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 size={13} aria-hidden="true" />
                  {bt(`해결됨 ${resolvedCount}`, `Resolved ${resolvedCount}`)}
                </span>
                <span className="inline-flex items-center gap-1 text-warning">
                  <AlertCircle size={13} aria-hidden="true" />
                  {bt(`미해결 ${openCount}`, `Open ${openCount}`)}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-2.5">
              <p className="flex items-center gap-1 font-bold text-fg">
                <UserCheck size={13} className="text-accent" aria-hidden="true" />
                {bt("다음 검수 담당자", "Next reviewers")}
              </p>
              <ul className="mt-1.5 space-y-1 text-[0.68rem]">
                {meta.nextReviewerIds.map((id) => {
                  const approvedNow = session.decisions.some((d) => d.reviewerId === id && d.decision === "approved");
                  return (
                    <li key={id} className={approvedNow ? "font-bold text-success" : "font-semibold text-fg"}>
                      {personaName(id, bt)} · {approvedNow ? bt("승인 완료", "Approved") : bt("재검수 대기", "Awaiting")}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
