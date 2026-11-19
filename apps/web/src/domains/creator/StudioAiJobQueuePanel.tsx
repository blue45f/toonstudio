import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CopyPlus,
  ExternalLink,
  Layers,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import {
  canApplyStudioAiJob,
  studioAiJobUserState,
  type StudioAiApplicationMode,
  type StudioAiJob,
  type StudioAiJobStatus,
} from "./studio-ai-job";

import { cn } from "@/shared/lib/utils";

export interface StudioAiJobQueuePanelProps {
  readonly jobs: readonly StudioAiJob[];
  readonly loading?: boolean;
  readonly errorMessage?: string | null;
  readonly onRetryLoad?: () => void;
  readonly onCreateFirstJob?: () => void;
  readonly onConfirm?: (jobId: string, accepted: boolean) => void;
  readonly onApprove?: (jobId: string) => void;
  readonly onApply?: (jobId: string, mode: StudioAiApplicationMode) => void;
  readonly onRetry?: (jobId: string) => void;
  readonly onCancel?: (jobId: string) => void;
  readonly className?: string;
}

const SKILL_LABELS_KO: Record<StudioAiJob["skill"], string> = {
  "story-outline": "스토리 개요",
  "dialogue-rewrite": "대사 다듬기",
  storyboard: "콘티 구성",
  "character-consistency": "캐릭터 일관성",
  "image-fill": "영역 채우기",
  "image-expand": "캔버스 확장",
  "line-cleanup": "선화 정리",
  "flat-color": "밑색 채색",
  relight: "조명 보정",
  localization: "현지화 번역",
  voice: "음성 연출",
  animatic: "애니매틱",
  "promotion-design": "홍보 디자인",
  "publishing-copy": "연재 소개문",
};

const PRIVACY_LABELS_KO: Record<StudioAiJob["privacy"], string> = {
  local: "기기 내 처리",
  "cloud-private": "비공개 클라우드",
  "cloud-provider": "외부 모델 전송",
};

function statusTone(status: StudioAiJobStatus): string {
  switch (status) {
    case "applied":
    case "approved":
      return "text-good bg-raised";
    case "awaiting-confirmation":
    case "preview-ready":
      return "text-warn bg-raised";
    case "failed":
      return "text-bad bg-raised";
    case "running":
    case "queued":
      return "text-accent bg-accent-soft";
    default:
      return "text-fg-2 bg-raised";
  }
}

function StatusIcon({ status }: { readonly status: StudioAiJobStatus }) {
  switch (status) {
    case "applied":
    case "approved":
      return <CheckCircle2 size={14} aria-hidden="true" />;
    case "awaiting-confirmation":
    case "preview-ready":
    case "failed":
      return <AlertTriangle size={14} aria-hidden="true" />;
    case "running":
      return <Play size={14} aria-hidden="true" />;
    case "cancelled":
      return <X size={14} aria-hidden="true" />;
    default:
      return <Clock size={14} aria-hidden="true" />;
  }
}

/**
 * 정본 9상태 AI 생성 큐(`studio-ai-job.ts`)의 UI 소비자.
 * 비파괴 검토용 초안 원칙(원고 자동 덮어쓰기 금지)과 5대 UI 상태를 강제한다.
 */
export function StudioAiJobQueuePanel({
  jobs,
  loading = false,
  errorMessage = null,
  onRetryLoad,
  onCreateFirstJob,
  onConfirm,
  onApprove,
  onApply,
  onRetry,
  onCancel,
  className,
}: StudioAiJobQueuePanelProps) {
  const attentionCount = jobs.filter((job) => studioAiJobUserState(job).requiresAttention).length;

  return (
    <section
      aria-label="AI 생성 검토 대기열"
      data-testid="studio-ai-job-queue-panel"
      className={cn("rounded-2xl border border-line bg-panel p-4 text-fg", className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="shrink-0 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight text-fg [word-break:keep-all]">
            AI 생성 검토 대기열
          </h2>
          <span
            className="rounded-full bg-raised px-2 py-0.5 font-display text-xs text-fg-2 tnum"
            aria-label={`총 ${jobs.length}건`}
          >
            {jobs.length}
          </span>
          {attentionCount > 0 && (
            <span
              className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent tnum"
              aria-live="polite"
            >
              확인 필요 {attentionCount}
            </span>
          )}
        </div>
        <p className="text-xs text-fg-3 [word-break:keep-all]">
          원본 원고를 자동 덮어쓰지 않으며, 승인한 결과만 사본 또는 선택 영역에 적용합니다.
        </p>
      </header>

      {errorMessage ? (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-raised p-3 text-xs text-fg"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="font-semibold text-bad">작업 대기열을 불러오지 못했습니다</p>
              <p className="text-fg-2 [word-break:keep-all]">{errorMessage}</p>
            </div>
          </div>
          {onRetryLoad && (
            <button
              type="button"
              onClick={onRetryLoad}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-card px-3 text-xs font-medium text-fg transition-colors hover:bg-canvas"
            >
              <RefreshCw size={13} aria-hidden="true" />
              다시 시도
            </button>
          )}
        </div>
      ) : loading ? (
        <div
          aria-busy="true"
          aria-label="AI 생성 대기열 불러오는 중"
          className="mt-3 space-y-2.5"
        >
          {[0, 1].map((idx) => (
            <div
              key={idx}
              className="space-y-2 rounded-xl bg-card/70 p-3 motion-safe:animate-pulse"
            >
              <div className="h-4 w-36 rounded bg-raised" />
              <div className="h-3 w-4/5 rounded bg-raised/75" />
              <div className="h-9 w-44 rounded-lg bg-raised/60" />
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="mt-3 flex flex-col items-start gap-3 rounded-xl bg-card/60 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-fg [word-break:keep-all]">
              진행 중인 AI 검토 작업이 없습니다
            </p>
            <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
              선화 정리, 밑색 채색, 대사 다듬기 초안을 요청하면 이 대기열에서 미리보기 확인 후 안전하게 사본으로 반영할 수 있습니다.
            </p>
          </div>
          {onCreateFirstJob && (
            <button
              type="button"
              onClick={onCreateFirstJob}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              <Sparkles size={14} aria-hidden="true" />
              첫 초안 요청 만들기
            </button>
          )}
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-line/60" aria-live="polite">
          {jobs.map((job) => {
            const stateInfo = studioAiJobUserState(job);
            const percent = Math.round(Math.max(0, Math.min(1, job.progress)) * 100);
            const canApply = canApplyStudioAiJob(job);
            const canCancel = job.status !== "applied" && job.status !== "cancelled";
            const canRetry =
              job.status === "failed" || job.status === "preview-ready" || job.status === "approved";

            return (
              <li
                key={job.id}
                data-testid={`studio-ai-job-item-${job.id}`}
                data-status={job.status}
                className="flex flex-col gap-2.5 py-3 first:pt-2 last:pb-1"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold",
                          statusTone(job.status),
                        )}
                      >
                        <StatusIcon status={job.status} />
                        {stateInfo.labelKo}
                      </span>
                      <span className="text-xs font-semibold text-fg">
                        {SKILL_LABELS_KO[job.skill]}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[0.7rem] text-fg-3">
                        {job.requiresExternalTransfer ? (
                          <ExternalLink size={11} aria-hidden="true" />
                        ) : (
                          <ShieldCheck size={11} aria-hidden="true" />
                        )}
                        {PRIVACY_LABELS_KO[job.privacy]}
                      </span>
                      {job.estimatedCredits > 0 && (
                        <span className="font-display text-[0.7rem] text-fg-3 tnum">
                          예상 {job.estimatedCredits} 크레딧
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                      {job.request.prompt}
                    </p>
                  </div>
                </div>

                {job.status === "running" && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[0.7rem] text-fg-3">
                      <span>초안 생성 중</span>
                      <span className="font-display tnum">{percent}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${SKILL_LABELS_KO[job.skill]} 진행률`}
                      className="h-1.5 w-full overflow-hidden rounded-full bg-raised"
                    >
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {job.preview && (
                  <div className="space-y-1.5 rounded-xl bg-card/70 p-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-fg-2">
                      <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                        <Layers size={13} className="text-accent" aria-hidden="true" />
                        생성 후보 {job.preview.outputRefs.length}건 준비됨
                      </span>
                      <span className="font-display text-[0.7rem] text-fg-3 tnum">
                        사용 {job.preview.estimatedCreditsUsed} 크레딧
                      </span>
                    </div>
                    {job.preview.warnings.length > 0 && (
                      <ul className="space-y-0.5 text-[0.7rem] text-warn">
                        {job.preview.warnings.map((warning, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {job.application && (
                  <p className="text-xs text-good">
                    {job.application.mode === "selection" ? "선택 영역" : "새 사본 레이어"}에{" "}
                    <span className="font-display font-semibold tnum">
                      {job.application.createdObjectIds.length}
                    </span>
                    개 요소를 비파괴 반영했습니다.
                  </p>
                )}

                {job.error && (
                  <p role="alert" className="rounded-lg bg-raised px-2.5 py-2 text-xs text-bad">
                    오류 ({job.error.code}): {job.error.message}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {job.status === "awaiting-confirmation" && onConfirm && (
                    <>
                      <button
                        type="button"
                        onClick={() => onConfirm(job.id, true)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-semibold text-on-accent transition-opacity hover:opacity-90"
                      >
                        <Play size={13} aria-hidden="true" />
                        {job.requiresExternalTransfer ? "외부 전송 동의 후 시작" : "확인 후 시작"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onConfirm(job.id, false)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-raised px-3 text-xs font-medium text-fg-2 transition-colors hover:text-fg"
                      >
                        거절
                      </button>
                    </>
                  )}

                  {job.status === "preview-ready" && onApprove && (
                    <button
                      type="button"
                      onClick={() => onApprove(job.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-semibold text-on-accent transition-opacity hover:opacity-90"
                    >
                      <CheckCircle2 size={13} aria-hidden="true" />
                      결과 승인
                    </button>
                  )}

                  {canApply && onApply && (
                    <>
                      <button
                        type="button"
                        onClick={() => onApply(job.id, "copy")}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-semibold text-on-accent transition-opacity hover:opacity-90"
                      >
                        <CopyPlus size={13} aria-hidden="true" />
                        사본으로 적용
                      </button>
                      {job.request.selectionId && (
                        <button
                          type="button"
                          onClick={() => onApply(job.id, "selection")}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-card px-3 text-xs font-medium text-fg transition-colors hover:bg-raised"
                        >
                          선택 영역에 적용
                        </button>
                      )}
                    </>
                  )}

                  {canRetry && onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(job.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-raised px-3 text-xs font-medium text-fg-2 transition-colors hover:text-fg"
                    >
                      <RefreshCw size={13} aria-hidden="true" />
                      다시 생성
                    </button>
                  )}

                  {canCancel && onCancel && (
                    <button
                      type="button"
                      onClick={() => onCancel(job.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-fg-3 transition-colors hover:bg-raised hover:text-fg"
                    >
                      <X size={13} aria-hidden="true" />
                      취소
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
