import { History, Lock, MapPin, RotateCcw, Save, Users } from "lucide-react";
import type { MouseEvent } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioReviewHistoryDocument } from "../studio-review-history-store";
import {
  formatCutPinTargetId,
  SYNTHETIC_STUDIO_REVIEW_CUTS,
  SYNTHETIC_STUDIO_REVIEW_PERSONAS,
  type StudioReviewCollaboratorRole,
  type StudioReviewPinCoordinate,
  type StudioReviewRolePermissions,
  type StudioReviewThread,
} from "../studio-review-workflow";

export function StudioReviewRoleAndPinBoard({
  activeRole,
  permissions,
  selectedCutId,
  pinCoordinate,
  threads,
  highlightedThreadId,
  immutable,
  onSelectRole,
  onSelectCut,
  onPickCoordinate,
  onSelectThreadPin,
}: {
  readonly activeRole: StudioReviewCollaboratorRole;
  readonly permissions: StudioReviewRolePermissions;
  readonly selectedCutId: string;
  readonly pinCoordinate: StudioReviewPinCoordinate;
  readonly threads: readonly StudioReviewThread[];
  readonly highlightedThreadId: string | null;
  readonly immutable: boolean;
  readonly onSelectRole: (role: StudioReviewCollaboratorRole) => void;
  readonly onSelectCut: (cutId: string) => void;
  readonly onPickCoordinate: (next: StudioReviewPinCoordinate) => void;
  readonly onSelectThreadPin: (thread: StudioReviewThread) => void;
}) {
  const bt = useBilingual("StudioReviewPanel.pinBoard");
  const activeCut =
    SYNTHETIC_STUDIO_REVIEW_CUTS.find((cut) => cut.cutId === selectedCutId)
    ?? SYNTHETIC_STUDIO_REVIEW_CUTS[0]!;
  const cutThreads = threads.filter(
    (thread) =>
      thread.pinCoordinate?.cutId === selectedCutId
      || thread.targetId.startsWith(selectedCutId),
  );

  const handleCanvasClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (immutable || !permissions.canComment) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xPercent =
      rect.width > 0
        ? Math.min(96, Math.max(4, Math.round(((event.clientX - rect.left) / rect.width) * 100)))
        : 50;
    const yPercent =
      rect.height > 0
        ? Math.min(96, Math.max(4, Math.round(((event.clientY - rect.top) / rect.height) * 100)))
        : 50;
    onPickCoordinate({ cutId: selectedCutId, xPercent, yPercent });
  };

  return (
    <div className="mt-5 space-y-4">
      <div
        data-testid="review-role-bar"
        className="flex flex-col gap-3 rounded-2xl border border-line bg-panel/65 p-3.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-black text-fg">
            <Users size={14} className="text-accent" aria-hidden="true" />
            {bt("협업 역할 시뮬레이션 (데모 전용)", "Role simulation (synthetic demo)")}
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={bt("협업 역할 선택", "Select collaborator role")}>
            {SYNTHETIC_STUDIO_REVIEW_PERSONAS.map((persona) => (
              <button
                key={persona.role}
                type="button"
                data-testid={`review-role-${persona.role}`}
                aria-pressed={activeRole === persona.role}
                onClick={() => onSelectRole(persona.role)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  activeRole === persona.role
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:bg-panel hover:text-fg",
                )}
              >
                {bt(persona.labelKo, persona.labelEn)}
              </button>
            ))}
          </div>
        </div>

        <span
          data-testid="review-role-permission-badge"
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
            permissions.canEditManuscript
              ? "border-success/30 bg-success-soft/20 text-success"
              : permissions.canComment
                ? "border-warning/35 bg-warning-soft/15 text-warning"
                : "border-line bg-card text-fg-3",
          )}
        >
          {!permissions.canEditManuscript ? <Lock size={12} aria-hidden="true" /> : null}
          {permissions.canEditManuscript
            ? bt("원고 편집 · 댓글 · 이력 복구 가능", "Manuscript edit, comments & history restore enabled")
            : permissions.canComment
              ? bt("검수 전용 — 댓글·승인 가능, 원고·이력 복구 잠김", "Reviewer mode — comments & decisions only, history restore locked")
              : bt("열람 전용 — 보기만 가능 (편집·댓글·승인 잠김)", "Viewer mode — read-only (edits, comments & decisions locked)")}
        </span>
      </div>

      <div className="rounded-2xl border border-line bg-panel/55 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-black text-fg">
              <MapPin size={15} className="text-accent" aria-hidden="true" />
              {bt("컷별 좌표 핀 보드", "Cut coordinate pin board")}
            </h3>
            <p className="mt-0.5 text-xs text-fg-3">
              {bt(
                "컷을 고른 뒤 프레임 위 원하는 지점을 클릭하면 정확한 (X%, Y%) 좌표가 댓글 대상에 지정됩니다.",
                "Choose a cut and click any point inside the frame to pin exact (X%, Y%) coordinates.",
              )}
            </p>
          </div>
          <span
            data-testid="review-active-pin-readout"
            className="rounded-full border border-accent/35 bg-card px-3 py-1 text-xs font-bold text-accent"
          >
            {formatCutPinTargetId(pinCoordinate)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label={bt("검수 컷 목록", "Review cuts")}>
          {SYNTHETIC_STUDIO_REVIEW_CUTS.map((cut) => (
            <button
              key={cut.cutId}
              type="button"
              role="tab"
              data-testid={`review-cut-tab-${cut.cutId}`}
              aria-selected={selectedCutId === cut.cutId}
              onClick={() => onSelectCut(cut.cutId)}
              className={cn(
                "min-h-9 rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                selectedCutId === cut.cutId
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:bg-panel hover:text-fg",
              )}
            >
              {bt(cut.labelKo, cut.labelEn)}
            </button>
          ))}
        </div>

        <div className="relative mt-3 h-44 w-full select-none overflow-hidden rounded-2xl border border-line bg-card p-3">
          <button
            type="button"
            data-testid="review-cut-pin-surface"
            aria-label={bt("컷 좌표 지정 캔버스", "Cut coordinate pin canvas")}
            disabled={immutable || !permissions.canComment}
            onClick={handleCanvasClick}
            className={cn(
              "absolute inset-0 z-0 w-full bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
              permissions.canComment && !immutable ? "cursor-crosshair" : "cursor-default",
            )}
          />
          <div className="pointer-events-none relative z-10 flex h-full flex-col justify-between rounded-xl border border-dashed border-line/80 p-3">
            <div className="flex items-center justify-between text-xs font-bold text-fg-2">
              <span>{bt(activeCut.labelKo, activeCut.labelEn)}</span>
              <span className="text-[0.68rem] text-fg-3">
                {bt("데모 원고 캔버스 (고객 데이터 없음)", "Synthetic demo frame (no customer data)")}
              </span>
            </div>
            <p className="text-center text-xs font-semibold text-fg-3">
              {bt(activeCut.stageNoteKo, activeCut.stageNoteEn)}
            </p>
            <div className="flex items-center justify-between text-[0.68rem] text-fg-3">
              <span>{bt("좌상단 (0%, 0%)", "Top-left (0%, 0%)")}</span>
              <span>{bt("우하단 (100%, 100%)", "Bottom-right (100%, 100%)")}</span>
            </div>
          </div>

          <div
            data-testid="review-draft-pin-marker"
            style={{
              left: `${pinCoordinate.xPercent}%`,
              top: `${pinCoordinate.yPercent}%`,
            }}
            className={cn(
              "pointer-events-none absolute z-20 -translate-x-1/2 rounded-full border-2 border-accent bg-card px-2 py-0.5 text-[0.65rem] font-black text-accent shadow-sm",
              cutThreads.some(
                (thread) =>
                  thread.pinCoordinate
                  && Math.abs(thread.pinCoordinate.xPercent - pinCoordinate.xPercent) < 4
                  && Math.abs(thread.pinCoordinate.yPercent - pinCoordinate.yPercent) < 8,
              )
                ? "-translate-y-8"
                : "-translate-y-1/2",
            )}
          >
            {`${Math.round(pinCoordinate.xPercent)}%,${Math.round(pinCoordinate.yPercent)}%`}
          </div>

          {cutThreads.map((thread, index) => {
            const coord = thread.pinCoordinate;
            if (!coord) return null;
            return (
              <button
                key={thread.id}
                type="button"
                data-testid={`review-thread-pin-${thread.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectThreadPin(thread);
                }}
                style={{ left: `${coord.xPercent}%`, top: `${coord.yPercent}%` }}
                title={`${thread.targetId}: ${thread.messages.at(-1)?.body ?? ""}`}
                className={cn(
                  "absolute z-20 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[0.68rem] font-black shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  thread.status === "resolved"
                    ? "border-success/50 bg-success-soft/30 text-success"
                    : "border-danger/55 bg-danger-soft/30 text-danger",
                  highlightedThreadId === thread.id && "ring-2 ring-accent",
                )}
              >
                {index + 1}
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-fg-2">
            <span>{bt("가로 X (%)", "Horizontal X (%)")}</span>
            <input
              type="number"
              min={0}
              max={100}
              aria-label={bt("핀 가로 좌표 X 퍼센트", "Pin X coordinate percent")}
              disabled={immutable || !permissions.canComment}
              value={Math.round(pinCoordinate.xPercent)}
              onChange={(event) =>
                onPickCoordinate({
                  cutId: selectedCutId,
                  xPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                  yPercent: pinCoordinate.yPercent,
                })
              }
              className="min-h-9 w-24 rounded-lg border border-line bg-card px-2 text-xs font-bold text-fg"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-fg-2">
            <span>{bt("세로 Y (%)", "Vertical Y (%)")}</span>
            <input
              type="number"
              min={0}
              max={100}
              aria-label={bt("핀 세로 좌표 Y 퍼센트", "Pin Y coordinate percent")}
              disabled={immutable || !permissions.canComment}
              value={Math.round(pinCoordinate.yPercent)}
              onChange={(event) =>
                onPickCoordinate({
                  cutId: selectedCutId,
                  xPercent: pinCoordinate.xPercent,
                  yPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                })
              }
              className="min-h-9 w-24 rounded-lg border border-line bg-card px-2 text-xs font-bold text-fg"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

export function StudioReviewHistoryRestoreSection({
  history,
  permissions,
  onSaveCheckpoint,
  onRestoreVersion,
}: {
  readonly history: StudioReviewHistoryDocument | null;
  readonly permissions: StudioReviewRolePermissions;
  readonly onSaveCheckpoint: () => void;
  readonly onRestoreVersion: (versionId: string) => void;
}) {
  const bt = useBilingual("StudioReviewPanel.history");
  const sessions = history?.sessions ? [...history.sessions].reverse() : [];

  return (
    <div data-testid="review-history-section" className="mt-6 rounded-2xl border border-line bg-panel/55 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-fg">
            <History size={16} className="text-accent" aria-hidden="true" />
            {bt("검수·원고 이력 보관함 및 복구", "Review & manuscript history snapshots")}
          </h3>
          <p className="mt-0.5 text-xs text-fg-3">
            {bt(
              "스냅샷을 남겨 두고 언제든 원하는 시점의 댓글·해결 상태로 안전하게 되돌릴 수 있습니다 (복구 전 현재 상태 자동 백업).",
              "Save checkpoints and safely restore any prior snapshot (current state is backed up automatically before restore).",
            )}
          </p>
        </div>
        <button
          type="button"
          data-testid="review-save-checkpoint-btn"
          disabled={!permissions.canSaveCheckpoint}
          onClick={onSaveCheckpoint}
          className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
        >
          <Save size={14} aria-hidden="true" />
          {bt("현재 상태 스냅샷 보관", "Save checkpoint snapshot")}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {sessions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-3">
            {bt("보관된 스냅샷 이력이 아직 없습니다.", "No saved history snapshots yet.")}
          </p>
        ) : (
          sessions.map((archived) => (
            <div
              key={archived.versionId}
              data-testid={`review-history-item-${archived.versionId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3"
            >
              <div>
                <b className="text-xs text-fg">{archived.versionId}</b>
                <p className="mt-0.5 text-[0.68rem] text-fg-3">
                  {bt(
                    `항목 ${archived.threads.length}건 · 갱신 ${archived.updatedAt.slice(0, 19).replace("T", " ")}`,
                    `${archived.threads.length} items · updated ${archived.updatedAt.slice(0, 19).replace("T", " ")}`,
                  )}
                </p>
              </div>
              <button
                type="button"
                data-testid={`review-restore-btn-${archived.versionId}`}
                disabled={!permissions.canRestoreHistory}
                onClick={() => onRestoreVersion(archived.versionId)}
                className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5" })}
              >
                <RotateCcw size={14} aria-hidden="true" />
                {bt("이 시점으로 복구", "Restore this version")}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
