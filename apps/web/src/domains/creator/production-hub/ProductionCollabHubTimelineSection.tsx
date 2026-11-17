import { Eye, History, Layers, Lock, RotateCcw, Save, ShieldCheck } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioReviewSession } from "../studio-review-workflow";
import { REVISION_NOTES, WEBTOON_JOB_PRESETS, type WebtoonJobPreset, type WebtoonJobPresetId } from "./production-grand-atelier-collab-model";

export function ProductionCollabHubRbacCard({
  activePreset,
  jobPresetId,
  canRestoreHistory,
  onSelectPreset,
}: {
  readonly activePreset: WebtoonJobPreset;
  readonly jobPresetId: WebtoonJobPresetId;
  readonly canRestoreHistory: boolean;
  readonly onSelectPreset: (id: WebtoonJobPresetId) => void;
}) {
  const bt = useBilingual("ProductionGrandAtelierCollabHub.rbac");
  return (
    <article className="rounded-2xl border border-line bg-card p-4 lg:col-span-7" data-testid="collab-pillar-2-rbac">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <ShieldCheck size={16} className="text-accent" aria-hidden="true" />
          {bt("② 웹툰 4대 직무별 권한 & 레이어 보호 (RBAC)", "2. Webtoon 4-Role RBAC & Layer Protection")}
        </h3>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-0.5 text-[0.68rem] font-semibold text-fg-2">
          <Lock size={12} className="text-accent" aria-hidden="true" />
          {bt(activePreset.layerGuardKo, activePreset.layerGuardEn)}
        </span>
      </div>
      <div
        className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        role="radiogroup"
        aria-label={bt("웹툰 직무 역할 프리셋", "Webtoon role presets")}
      >
        {WEBTOON_JOB_PRESETS.map((preset) => {
          const selected = preset.id === jobPresetId;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              data-testid={`collab-role-${preset.id}`}
              aria-checked={selected}
              onClick={() => onSelectPreset(preset.id)}
              className={cn(
                "flex min-h-20 flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                selected
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              <strong className="text-xs font-semibold text-fg">{bt(preset.titleKo, preset.titleEn)}</strong>
              <span className="mt-1 text-[0.68rem] leading-4 text-fg-2">{bt(preset.summaryKo, preset.summaryEn)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.7rem]">
        <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-fg-2">
          <Layers size={12} className="text-accent" aria-hidden="true" />
          {bt("말풍선·식자 레이어: 총괄 작가 외 잠금", "Speech & lettering: locked except Lead")}
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-fg-2">
          {canRestoreHistory
            ? bt("이력 복원: 허용됨", "History restore: allowed")
            : bt("이력 복원: 보호 잠금됨", "History restore: locked")}
        </span>
      </div>
    </article>
  );
}

export interface ProductionCollabHubTimelineSectionProps {
  readonly archivedSessions: readonly StudioReviewSession[];
  readonly latestRevisionId: string;
  readonly viewedRevisionId: string;
  readonly canSaveCheckpoint: boolean;
  readonly canRestoreHistory: boolean;
  readonly onSaveCheckpoint: () => void;
  readonly onPinViewRevision: (versionId: string) => void;
  readonly onCompareOnion: () => void;
  readonly onRestoreRevision: (versionId: string) => void;
}

export function ProductionCollabHubTimelineSection({
  archivedSessions,
  latestRevisionId,
  viewedRevisionId,
  canSaveCheckpoint,
  canRestoreHistory,
  onSaveCheckpoint,
  onPinViewRevision,
  onCompareOnion,
  onRestoreRevision,
}: ProductionCollabHubTimelineSectionProps) {
  const bt = useBilingual("ProductionGrandAtelierCollabHub.timeline");
  return (
    <article className="rounded-2xl border border-line bg-card p-4 lg:col-span-5" data-testid="collab-pillar-5-history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <History size={16} className="text-accent" aria-hidden="true" />
          {bt("⑤ 수정 이력 타임라인 (안전 복원)", "5. Revision Timeline & Safe Restore")}
        </h3>
        <button
          type="button"
          data-testid="collab-hub-save-snapshot"
          disabled={!canSaveCheckpoint}
          onClick={onSaveCheckpoint}
          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1 px-3 text-xs" })}
        >
          <Save size={13} aria-hidden="true" />
          {bt("스냅샷 보관", "Save snapshot")}
        </button>
      </div>
      <p className="mt-1 text-xs text-fg-2">
        {bt(
          "작성자·메모·시각을 확인하고 복원 시 현재 상태를 먼저 자동 백업하여 유실을 방지합니다.",
          "Inspect author, note, and timestamp. Restoring automatically backs up the current version first.",
        )}
      </p>
      <ol className="mt-3 space-y-2" aria-label={bt("원고 수정 이력 목록", "Revision history list")}>
        {archivedSessions.slice(0, 5).map((item) => {
          const meta = REVISION_NOTES[item.versionId];
          const isViewed = item.versionId === viewedRevisionId;
          const isLatest = item.versionId === latestRevisionId;
          return (
            <li
              key={item.versionId}
              className={cn(
                "rounded-xl border bg-panel p-3",
                isViewed ? "border-accent/60" : "border-line",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <strong className="text-xs font-semibold tabular-nums text-fg">{item.versionId}</strong>
                  {isLatest ? (
                    <span className="rounded-full border border-good/35 bg-good/10 px-2 py-0.5 text-[0.625rem] font-semibold text-good">
                      {bt("최신본", "Latest")}
                    </span>
                  ) : (
                    <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.625rem] font-medium text-fg-3">
                      {bt("이전본", "Older")}
                    </span>
                  )}
                  {!isLatest && (item.status === "approved" || item.decisions.some((d) => d.decision === "approved")) ? (
                    <span
                      data-stale-approval-badge={item.versionId}
                      className="rounded-full border border-warning/45 bg-warning-soft/20 px-2 py-0.5 text-[0.625rem] font-semibold text-warning"
                    >
                      {bt("구버전 승인 · 최신본 승인 아님", "Older rev. approval · not latest")}
                    </span>
                  ) : null}
                </div>
                <span className="text-[0.65rem] tabular-nums text-fg-3">{item.updatedAt.slice(0, 16).replace("T", " ")}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-fg-2">
                {meta ? `${meta.authorKo} — ${bt(meta.memoKo, meta.memoEn)}` : bt(`보관된 핀 스레드 ${item.threads.length}건 스냅샷`, `Saved snapshot (${item.threads.length} pin threads)`)}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  data-testid={`collab-hub-pin-view-${item.versionId}`}
                  aria-pressed={isViewed}
                  onClick={() => onPinViewRevision(item.versionId)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 hover:text-fg"
                >
                  <Eye size={12} aria-hidden="true" />
                  {isViewed ? bt("열람 중", "Viewing") : bt("고정 열람", "Pin view")}
                </button>
                <button
                  type="button"
                  onClick={onCompareOnion}
                  className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 hover:text-fg"
                >
                  {bt("어니언스킨 비교", "Compare")}
                </button>
                <button
                  type="button"
                  data-testid={`collab-hub-restore-${item.versionId}`}
                  disabled={!canRestoreHistory}
                  onClick={() => onRestoreRevision(item.versionId)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft px-3 text-xs font-semibold text-fg hover:bg-raised disabled:opacity-45"
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  {bt("안전 복원", "Safe restore")}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </article>
  );
}
