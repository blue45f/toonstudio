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
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";

import {
  canApplyStudioAiJob,
  studioAiJobUserState,
  type StudioAiApplicationMode,
  type StudioAiJob,
  type StudioAiJobApplication,
  type StudioAiJobStatus,
  type StudioAiPrivacyClass,
  type StudioAiSkillId,
} from "../studio-ai-job";

import {
  getStudioAiGenerationQueueStore,
  STUDIO_AI_QUEUE_SKILL_META,
  type StudioAiGenerationQueueStore,
  type StudioAiQueueArtifact,
  type StudioAiQueueJobRunner,
} from "./studio-ai-generation-queue-store";

import { cn } from "@/shared/lib/utils";

export interface StudioAiGenerationQueuePanelProps {
  readonly documentId: string;
  readonly selectionId?: string | null;
  readonly store?: StudioAiGenerationQueueStore;
  readonly defaultSkill?: StudioAiSkillId;
  readonly autoRunOnConfirm?: boolean;
  readonly stepDelayMs?: number;
  readonly runner?: StudioAiQueueJobRunner;
  readonly onInsertDraftLayer?: (input: {
    readonly job: StudioAiJob;
    readonly artifact: StudioAiQueueArtifact | null;
    readonly mode: StudioAiApplicationMode;
  }) => Promise<StudioAiJobApplication | null> | StudioAiJobApplication | null;
  readonly onAnnounce?: (message: string) => void;
  readonly className?: string;
}

type QueueFilterId = "all" | "attention" | "active" | "done";

const COMPOSER_SKILLS: readonly StudioAiSkillId[] = [
  "line-cleanup",
  "flat-color",
  "image-fill",
  "image-expand",
  "relight",
  "character-consistency",
  "dialogue-rewrite",
  "storyboard",
];

const PRIVACY_LABELS_KO: Readonly<Record<StudioAiPrivacyClass, string>> = {
  local: "기기 내 처리",
  "cloud-private": "비공개 클라우드",
  "cloud-provider": "외부 모델 전송",
};

function statusBadgeClass(status: StudioAiJobStatus): string {
  switch (status) {
    case "applied":
    case "approved":
      return "border-good/35 bg-good/10 text-good";
    case "awaiting-confirmation":
    case "preview-ready":
      return "border-warn/35 bg-warn/10 text-warn";
    case "failed":
      return "border-bad/35 bg-bad/10 text-bad";
    case "running":
    case "queued":
      return "border-accent/35 bg-accent-soft text-accent";
    default:
      return "border-line bg-raised text-fg-2";
  }
}

function StatusGlyph({ status }: { readonly status: StudioAiJobStatus }) {
  switch (status) {
    case "applied":
    case "approved":
      return <CheckCircle2 size={13} aria-hidden="true" />;
    case "awaiting-confirmation":
    case "preview-ready":
    case "failed":
      return <AlertTriangle size={13} aria-hidden="true" />;
    case "running":
      return <Play size={13} aria-hidden="true" />;
    case "cancelled":
      return <X size={13} aria-hidden="true" />;
    default:
      return <Clock size={13} aria-hidden="true" />;
  }
}

function matchesFilter(job: StudioAiJob, filter: QueueFilterId): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return studioAiJobUserState(job).requiresAttention;
  if (filter === "active") {
    return (
      job.status === "draft" ||
      job.status === "awaiting-confirmation" ||
      job.status === "queued" ||
      job.status === "running"
    );
  }
  return job.status === "applied" || job.status === "cancelled";
}

/**
 * 정본 9상태 AI 생성 큐(`studio-ai-job.ts`) 에디터 실연동 패널.
 * 외부 전송 확인 게이트 → 진행률 → 비파괴 미리보기 검토 → 승인 후 사본 레이어 삽입 → 로컬 복원을 완결한다.
 */
export function StudioAiGenerationQueuePanel({
  documentId,
  selectionId = null,
  store: injectedStore,
  defaultSkill = "line-cleanup",
  autoRunOnConfirm = true,
  stepDelayMs = 40,
  runner,
  onInsertDraftLayer,
  onAnnounce,
  className,
}: StudioAiGenerationQueuePanelProps) {
  const store = useMemo(
    () => injectedStore ?? getStudioAiGenerationQueueStore(documentId),
    [documentId, injectedStore],
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const [skill, setSkill] = useState<StudioAiSkillId>(defaultSkill);
  const [privacy, setPrivacy] = useState<StudioAiPrivacyClass>("local");
  const [prompt, setPrompt] = useState("");
  const [filter, setFilter] = useState<QueueFilterId>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const formId = useId();

  useEffect(() => {
    void store.hydrate();
  }, [store]);

  const skillMeta = STUDIO_AI_QUEUE_SKILL_META[skill];
  const attentionCount = snapshot.jobs.filter(
    (job) => studioAiJobUserState(job).requiresAttention,
  ).length;
  const settledCount = snapshot.jobs.filter(
    (job) => job.status === "applied" || job.status === "cancelled",
  ).length;
  const visibleJobs = snapshot.jobs.filter((job) => matchesFilter(job, filter));

  const announce = (message: string) => {
    setNotice(message);
    onAnnounce?.(message);
  };

  const handleSubmit = (event: FormEvent, saveAsDraftOnly = false) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setApplyError("요청할 내용을 먼저 입력해 주세요.");
      return;
    }
    setApplyError(null);
    const input = {
      skill,
      prompt: trimmed,
      privacy,
      ...(selectionId ? { selectionId } : {}),
    };
    if (saveAsDraftOnly) {
      store.createDraft(input);
      announce(`${skillMeta.labelKo} 요청을 초안 상태로 대기열에 준비했습니다.`);
    } else {
      store.submitForConfirmation(input);
      announce(
        privacy === "local"
          ? `${skillMeta.labelKo} 작업 확인 단계로 올렸습니다.`
          : `${skillMeta.labelKo} 외부 전송 확인 단계로 올렸습니다.`,
      );
    }
    setPrompt("");
  };

  const runJob = async (jobId: string) => {
    const result = await store.executeQueuedJob(jobId, { runner, stepDelayMs });
    if (result.status === "preview-ready") {
      announce("미리보기가 준비되었습니다. 검토 후 승인해 주세요.");
    } else if (result.status === "failed") {
      announce("작업을 완료하지 못했습니다. 오류를 확인한 뒤 다시 생성할 수 있습니다.");
    }
  };

  const handleConfirm = (jobId: string, accepted: boolean) => {
    setApplyError(null);
    const next = store.confirm(jobId, accepted);
    if (!accepted) {
      announce("전송 확인을 거절해 요청을 취소했습니다.");
      return;
    }
    announce("작업을 대기열에 등록했습니다.");
    if (autoRunOnConfirm && next.status === "queued") {
      void runJob(jobId);
    }
  };

  const handleApply = async (jobId: string, mode: StudioAiApplicationMode) => {
    setApplyError(null);
    setApplyingJobId(jobId);
    try {
      const result = await store.apply(jobId, mode, async (ctx) => {
        if (onInsertDraftLayer) {
          return onInsertDraftLayer(ctx);
        }
        return {
          mode: ctx.mode,
          targetDocumentId: documentId,
          ...(ctx.mode === "selection" && ctx.job.request.selectionId
            ? { targetSelectionId: ctx.job.request.selectionId }
            : {}),
          createdObjectIds: [`ai-draft-layer-${ctx.job.id}`],
        };
      });
      if (!result.ok) {
        setApplyError(result.error ?? "초안 레이어를 삽입하지 못했습니다.");
        return;
      }
      announce(
        mode === "selection"
          ? "승인한 결과를 선택 영역에 비파괴 사본으로 반영했습니다."
          : "승인한 결과를 새 비파괴 초안 레이어로 문서에 삽입했습니다.",
      );
    } finally {
      setApplyingJobId(null);
    }
  };

  const handleRetry = (jobId: string) => {
    setApplyError(null);
    const next = store.retry(jobId);
    announce("작업을 다시 대기열에 올렸습니다.");
    if (autoRunOnConfirm && next.status === "queued") {
      void runJob(jobId);
    }
  };

  return (
    <section
      aria-label="AI 생성 검토 대기열"
      data-testid="studio-ai-generation-queue-panel"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-panel p-3.5 text-fg break-keep",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="h-1 w-full rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-accent-2),var(--color-cool),var(--color-good))]"
      />
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="shrink-0 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-bold tracking-tight text-fg">AI 생성 큐</h2>
          <span
            className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-fg-2"
            aria-label={`총 ${snapshot.jobs.length}건`}
          >
            {snapshot.jobs.length}
          </span>
          {attentionCount > 0 ? (
            <span
              className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-accent"
              aria-live="polite"
            >
              확인 필요 {attentionCount}
            </span>
          ) : null}
        </div>
        <p className="text-[0.7rem] leading-relaxed text-fg-3">
          원본을 덮어쓰지 않고 승인한 초안만 새 레이어로 삽입합니다.
        </p>
      </header>

      <form
        onSubmit={(event) => handleSubmit(event, false)}
        className="flex flex-col gap-2.5 border-b border-line/60 pb-3"
        aria-label="새 AI 생성 요청 만들기"
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-fg-2">
            <span>작업 종류</span>
            <select
              id={`${formId}-skill`}
              aria-label="AI 작업 종류"
              value={skill}
              onChange={(event) => setSkill(event.target.value as StudioAiSkillId)}
              className="min-h-11 rounded-xl border border-line bg-card px-2.5 text-xs font-semibold text-fg outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              {COMPOSER_SKILLS.map((skillId) => (
                <option key={skillId} value={skillId}>
                  {STUDIO_AI_QUEUE_SKILL_META[skillId].labelKo}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-fg-2">처리 경로</span>
            <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="처리 경로 선택">
              {(
                [
                  { id: "local", label: "기기 내 처리" },
                  { id: "cloud-provider", label: "외부 전송" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={privacy === option.id}
                  onClick={() => setPrivacy(option.id)}
                  className={cn(
                    "min-h-11 rounded-xl border px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    privacy === option.id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex flex-col gap-1 text-xs font-semibold text-fg-2">
          <span>요청 내용</span>
          <textarea
            id={`${formId}-prompt`}
            rows={2}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={skillMeta.placeholderKo}
            className="min-h-16 w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-xs leading-relaxed text-fg outline-none placeholder:text-fg-3 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.68rem] text-fg-3">
            {privacy === "local"
              ? "외부 전송 없이 기기 안에서 초안을 만듭니다."
              : `외부 전송 동의 후 시작 · 예상 ${skillMeta.defaultCredits} 크레딧`}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={(event) => handleSubmit(event, true)}
              className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"
            >
              초안 준비
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-bold text-on-accent transition-opacity hover:opacity-90"
            >
              <Sparkles size={14} aria-hidden="true" />
              생성 요청
            </button>
          </div>
        </div>
      </form>

      {snapshot.storageError ? (
        <p role="alert" className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {snapshot.storageError}
        </p>
      ) : null}

      {applyError ? (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
          {applyError}
        </p>
      ) : null}

      {notice ? (
        <p role="status" aria-live="polite" className="text-[0.72rem] font-medium text-fg-2">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="대기열 상태 필터">
          {(
            [
              { id: "all", label: "전체" },
              { id: "attention", label: `확인 필요 (${attentionCount})` },
              { id: "active", label: "진행 중" },
              { id: "done", label: "완료" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "min-h-10 rounded-full border px-3 text-xs font-semibold transition-colors",
                filter === tab.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {settledCount > 0 ? (
          <button
            type="button"
            onClick={() => {
              store.clearSettled();
              announce("완료·취소된 작업을 대기열에서 정리했습니다.");
            }}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-fg-3 transition-colors hover:bg-raised hover:text-fg"
          >
            <Trash2 size={13} aria-hidden="true" />
            완료 정리
          </button>
        ) : null}
      </div>

      {!snapshot.hydrated ? (
        <div
          aria-busy="true"
          aria-label="대기열 불러오는 중"
          className="space-y-2"
        >
          {[0, 1].map((idx) => (
            <div key={idx} className="space-y-2 rounded-xl bg-raised/60 p-3 motion-safe:animate-pulse">
              <div className="h-3.5 w-32 rounded bg-raised" />
              <div className="h-3 w-4/5 rounded bg-raised/80" />
            </div>
          ))}
        </div>
      ) : visibleJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-card/45 p-4 text-xs leading-relaxed text-fg-2">
          <p className="font-semibold text-fg">표시할 생성 작업이 없습니다</p>
          <p className="mt-1 text-fg-3">
            위에서 선화 정리·밑색 채색·대사 다듬기를 요청하면 확인 게이트와 미리보기를 거쳐 안전하게 새 레이어로 넣을 수 있습니다.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line/70" aria-live="polite">
          {visibleJobs.map((job) => {
            const stateInfo = studioAiJobUserState(job);
            const meta = STUDIO_AI_QUEUE_SKILL_META[job.skill];
            const artifact = snapshot.artifacts[job.id] ?? null;
            const percent = Math.round(Math.max(0, Math.min(1, job.progress)) * 100);
            const canApply = canApplyStudioAiJob(job);
            const canRetry =
              job.status === "failed" ||
              job.status === "preview-ready" ||
              job.status === "approved";
            const canCancel = job.status !== "applied" && job.status !== "cancelled";
            const isApplying = applyingJobId === job.id;

            return (
              <li
                key={job.id}
                data-testid={`studio-ai-queue-job-${job.id}`}
                data-job-status={job.status}
                className="flex flex-col gap-2.5 py-3 first:pt-1 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold",
                      statusBadgeClass(job.status),
                    )}
                  >
                    <StatusGlyph status={job.status} />
                    {stateInfo.labelKo}
                  </span>
                  <span className="text-xs font-bold text-fg">{meta.labelKo}</span>
                  <span className="inline-flex items-center gap-1 text-[0.68rem] text-fg-3">
                    {job.requiresExternalTransfer ? (
                      <ExternalLink size={11} aria-hidden="true" />
                    ) : (
                      <ShieldCheck size={11} aria-hidden="true" />
                    )}
                    {PRIVACY_LABELS_KO[job.privacy]}
                  </span>
                  {job.estimatedCredits > 0 ? (
                    <span className="text-[0.68rem] tabular-nums text-fg-3">
                      예상 {job.estimatedCredits} 크레딧
                    </span>
                  ) : null}
                </div>

                <p className="text-xs leading-relaxed text-fg-2">{job.request.prompt}</p>

                {job.status === "awaiting-confirmation" ? (
                  <p className="rounded-xl border border-warn/35 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-fg-2">
                    {job.requiresExternalTransfer
                      ? "외부 모델로 현재 원고 스냅샷과 요청문을 전송합니다. 동의한 뒤에만 생성을 시작합니다."
                      : "기기 내 처리 경로로 비파괴 초안을 생성합니다. 확인하면 바로 실행합니다."}
                  </p>
                ) : null}

                {job.status === "running" ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[0.7rem] text-fg-3">
                      <span>초안 생성 중</span>
                      <span className="font-semibold tabular-nums">{percent}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${meta.labelKo} 진행률`}
                      className="h-2 w-full overflow-hidden rounded-full bg-raised"
                    >
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-accent-2),var(--color-cool))] transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                {job.preview ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-card/75 p-2.5 text-xs ring-1 ring-accent/20">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
                        <Layers size={13} className="text-accent" aria-hidden="true" />
                        {artifact?.title ?? `초안 후보 ${job.preview.outputRefs.length}건`}
                      </span>
                      <span className="text-[0.68rem] tabular-nums text-fg-3">
                        사용 {job.preview.estimatedCreditsUsed} 크레딧
                      </span>
                    </div>

                    {artifact?.kind === "image" && artifact.dataUrl ? (
                      <img
                        src={artifact.dataUrl}
                        alt={`${meta.labelKo} 비파괴 미리보기`}
                        className="h-28 w-full rounded-lg border border-line bg-canvas object-contain"
                      />
                    ) : null}

                    {artifact?.kind === "text" && artifact.textDraft ? (
                      <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg bg-panel/80 p-2 text-[0.7rem] leading-relaxed text-fg-2">
                        {artifact.textDraft}
                      </pre>
                    ) : null}

                    {job.preview.warnings.length > 0 ? (
                      <ul className="space-y-1 text-[0.68rem] text-warn">
                        {job.preview.warnings.map((warning, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {job.application ? (
                  <p className="text-xs font-medium text-good">
                    {job.application.mode === "selection" ? "선택 영역" : "새 사본 레이어"}에{" "}
                    <span className="font-bold tabular-nums">
                      {job.application.createdObjectIds.length}
                    </span>
                    개 초안 요소를 비파괴 반영했습니다.
                  </p>
                ) : null}

                {job.error ? (
                  <p role="alert" className="rounded-xl bg-bad/10 px-2.5 py-2 text-xs text-bad">
                    오류 ({job.error.code}): {job.error.message}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-1.5">
                  {job.status === "draft" ? (
                    <button
                      type="button"
                      onClick={() => {
                        store.requestConfirmation(job.id);
                        announce("전송 확인 단계로 넘겼습니다.");
                      }}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-semibold text-on-accent"
                    >
                      <Play size={13} aria-hidden="true" />
                      전송 확인 요청
                    </button>
                  ) : null}

                  {job.status === "awaiting-confirmation" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleConfirm(job.id, true)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-semibold text-on-accent"
                      >
                        <Play size={13} aria-hidden="true" />
                        {job.requiresExternalTransfer ? "외부 전송 동의 후 시작" : "확인 후 시작"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirm(job.id, false)}
                        className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg"
                      >
                        거절
                      </button>
                    </>
                  ) : null}

                  {job.status === "queued" ? (
                    <button
                      type="button"
                      onClick={() => void runJob(job.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-semibold text-on-accent"
                    >
                      <Play size={13} aria-hidden="true" />
                      지금 실행
                    </button>
                  ) : null}

                  {job.status === "preview-ready" ? (
                    <button
                      type="button"
                      onClick={() => {
                        store.approve(job.id);
                        announce("미리보기를 승인했습니다. 이제 사본 레이어로 삽입할 수 있습니다.");
                      }}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-semibold text-on-accent"
                    >
                      <CheckCircle2 size={13} aria-hidden="true" />
                      결과 승인
                    </button>
                  ) : null}

                  {canApply ? (
                    <>
                      <button
                        type="button"
                        disabled={isApplying}
                        onClick={() => void handleApply(job.id, "copy")}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-semibold text-on-accent disabled:opacity-50"
                      >
                        <CopyPlus size={13} aria-hidden="true" />
                        {isApplying ? "삽입 중..." : "비파괴 초안 레이어 삽입"}
                      </button>
                      {job.request.selectionId ? (
                        <button
                          type="button"
                          disabled={isApplying}
                          onClick={() => void handleApply(job.id, "selection")}
                          className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised disabled:opacity-50"
                        >
                          선택 영역에 적용
                        </button>
                      ) : null}
                    </>
                  ) : null}

                  {canRetry ? (
                    <button
                      type="button"
                      onClick={() => handleRetry(job.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg"
                    >
                      <RefreshCw size={13} aria-hidden="true" />
                      다시 생성
                    </button>
                  ) : null}

                  {canCancel ? (
                    <button
                      type="button"
                      onClick={() => {
                        store.cancel(job.id, "user-cancelled");
                        announce("작업을 취소했습니다.");
                      }}
                      className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-medium text-fg-3 hover:bg-raised hover:text-fg"
                    >
                      <X size={13} aria-hidden="true" />
                      취소
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => store.removeJob(job.id)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2.5 text-xs font-medium text-fg-3 hover:bg-raised hover:text-fg"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      목록에서 지우기
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
