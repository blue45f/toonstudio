import {
  Check,
  ChevronDown,
  Copy,
  Feather,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  computeZeroBillSafetyGauge,
  createOfflineZeroBillQuotaSnapshot,
  fetchFreeAiQuotaStatus,
  FREE_AI_14_ASSIST_MODES,
  runFreeAiZeroBillAssist,
  type FreeAiModeCategoryKo,
  type FreeAiQuotaStatusSnapshot,
  type FreeAiZeroBillAssistInput,
  type FreeAiZeroBillAssistResponse,
  type FreeAiZeroBillModeId,
} from "@/shared/ai/free-ai-zero-bill-cascade";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { StudioExportImageFacts } from "./StudioExportImageFacts";

const WORKBENCH_INPUT_MAX_LENGTH = 6_000;

const LazyStudioDesignStoryAi4SuitesPanel = lazy(
  () => import("../ai-creative-suites/StudioDesignStoryAi4SuitesPanel"),
);

interface SubmittedAssistResult {
  readonly input: FreeAiZeroBillAssistInput;
  readonly response: FreeAiZeroBillAssistResponse;
}

interface ModeWorkspace {
  readonly draft?: string;
  readonly running?: boolean;
  readonly result?: SubmittedAssistResult;
  readonly statusMessage?: string | null;
}

const MODE_CATEGORIES: readonly FreeAiModeCategoryKo[] = [
  "기획·스토리",
  "연출·3D·채색",
  "마감·효과·현지화",
  "MCP 자동화",
];

export interface StudioFreeAiAssistWorkbenchProps {
  readonly projectTitle?: string;
  readonly initialMode?: FreeAiZeroBillModeId;
  readonly fetchImpl?: typeof fetch;
}

export function StudioFreeAiAssistWorkbench({
  projectTitle,
  initialMode = "character-bible-forge",
  fetchImpl,
}: StudioFreeAiAssistWorkbenchProps) {
  const bt = useBilingual("studio.freeAiWorkbench");
  const [quota, setQuota] = useState<FreeAiQuotaStatusSnapshot>(() =>
    createOfflineZeroBillQuotaSnapshot(),
  );
  const [loadingQuota, setLoadingQuota] = useState(false);
  const [selectedMode, setSelectedMode] = useState<FreeAiZeroBillModeId>(initialMode);
  const [workspaces, setWorkspaces] = useState<Partial<Record<FreeAiZeroBillModeId, ModeWorkspace>>>({});
  const [copiedResult, setCopiedResult] = useState<FreeAiZeroBillAssistResponse | null>(null);
  const [designStorySuitesOpen, setDesignStorySuitesOpen] = useState(false);
  const jobsRef = useRef(new Map<FreeAiZeroBillModeId, AbortController>());
  const quotaRequest = useRef<AbortController | null>(null);
  const copyRequest = useRef<symbol | null>(null);

  const refreshQuota = useCallback(async () => {
    quotaRequest.current?.abort();
    const controller = new AbortController();
    quotaRequest.current = controller;
    setLoadingQuota(true);
    try {
      const next = await fetchFreeAiQuotaStatus({ fetchImpl, signal: controller.signal });
      if (!controller.signal.aborted) setQuota(next);
    } finally {
      if (!controller.signal.aborted) setLoadingQuota(false);
    }
  }, [fetchImpl]);

  useEffect(() => {
    void refreshQuota();
    return () => quotaRequest.current?.abort();
  }, [refreshQuota]);

  useEffect(() => {
    const jobs = jobsRef.current;
    return () => {
      for (const job of jobs.values()) job.abort();
      jobs.clear();
      copyRequest.current = null;
    };
  }, []);

  useEffect(() => {
    if (!copiedResult) return;
    const timeout = window.setTimeout(() => setCopiedResult(null), 1_800);
    return () => window.clearTimeout(timeout);
  }, [copiedResult]);

  const gauge = useMemo(() => computeZeroBillSafetyGauge(quota), [quota]);
  const currentSpec = useMemo(
    () =>
      FREE_AI_14_ASSIST_MODES.find((item) => item.id === selectedMode) ??
      FREE_AI_14_ASSIST_MODES[0],
    [selectedMode],
  );

  const workspace = workspaces[selectedMode];
  const inputText = workspace?.draft ?? currentSpec.samplePromptKo;
  const running = workspace?.running ?? false;
  const otherRunningCount = Object.entries(workspaces)
    .filter(([mode, state]) => mode !== selectedMode && state?.running).length;
  const previousResult = workspace?.result;
  const staleResult = previousResult !== undefined
    && (previousResult.input.inputText !== inputText || previousResult.input.projectTitle !== projectTitle);
  const result = previousResult && !staleResult && previousResult.response.mode === selectedMode
    ? previousResult.response
    : null;
  const statusMessage = workspace?.statusMessage;
  const copied = result !== null && result === copiedResult;

  const updateMode = (mode: FreeAiZeroBillModeId, changes: Partial<ModeWorkspace>) => {
    setWorkspaces((previous) => ({ ...previous, [mode]: { ...previous[mode], ...changes } }));
  };

  const handleRun = async () => {
    const mode = selectedMode;
    const jobs = jobsRef.current;
    if (jobs.has(mode)) return;
    const controller = new AbortController();
    jobs.set(mode, controller);
    const submittedInput: FreeAiZeroBillAssistInput = { mode, inputText, projectTitle };
    updateMode(mode, { running: true, statusMessage: null });
    try {
      const response = await runFreeAiZeroBillAssist(
        submittedInput,
        { fetchImpl, signal: controller.signal },
      );
      if (jobs.get(mode) === controller) {
        updateMode(mode, { result: { input: submittedInput, response } });
        void refreshQuota();
      }
    } catch {
      if (jobs.get(mode) === controller) {
        updateMode(mode, { statusMessage: "AI 분석을 마치지 못했어요. 다시 시도해 주세요." });
      }
    } finally {
      if (jobs.get(mode) === controller) {
        jobs.delete(mode);
        updateMode(mode, { running: false });
      }
    }
  };

  const handleCancel = () => {
    const jobs = jobsRef.current;
    const job = jobs.get(selectedMode);
    if (!job) return;
    jobs.delete(selectedMode);
    job.abort();
    updateMode(selectedMode, {
      running: false,
      statusMessage: "무과금 AI 분석 요청을 취소했어요. 입력한 내용은 그대로 남아 있습니다.",
    });
  };

  const handleCopyResult = async () => {
    if (!result) return;
    const request = Symbol();
    copyRequest.current = request;
    const text = [result.headlineKo, ...result.bulletsKo.map((line) => `- ${line}`)].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      if (copyRequest.current === request) setCopiedResult(result);
    } catch {
      if (copyRequest.current === request) setCopiedResult(null);
    }
  };

  const gaugeBarClass =
    gauge.status === "cutoff-local"
      ? "bg-danger"
      : gauge.status === "caution"
        ? "bg-warning"
        : "bg-success";

  return (
    <section
      data-testid="studio-free-ai-workbench"
      aria-labelledby="studio-free-ai-workbench-heading"
      className="mt-4 rounded-2xl border border-line bg-panel/80 p-4"
    >
      <div className="border-b border-line pb-3">
        <h3 id="studio-free-ai-workbench-heading" className="text-base font-black text-fg">
          {bt("웹툰 창작 보조", "Webtoon creator assistant")}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-[0.7rem] font-extrabold text-accent">
          <ShieldCheck size={14} className="shrink-0" aria-hidden="true" />
          {bt("창작자 이용료 ₩0 · 무료 경로만 사용", "Creator fee ₩0 · Free processing only")}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-fg-2">{gauge.detailTextKo}</p>
      </div>

      <details className="group mt-3 rounded-xl border border-line bg-card">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 text-xs font-bold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {bt("할당량과 처리 방식", "Quota and processing")}
          <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="p-3 pt-0">
          <p className="mb-2 text-xs leading-5 text-fg-2">
            {bt(
              "무료 클라우드를 사용할 수 없으면 로컬 코치가 제안합니다.",
              "When free cloud processing is unavailable, the local coach provides suggestions.",
            )}
          </p>
          <button
            type="button"
            onClick={() => void refreshQuota()}
            disabled={loadingQuota}
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: "min-h-11 gap-1.5",
            })}
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={loadingQuota ? "animate-spin motion-reduce:animate-none" : undefined}
            />
            할당량 새로고침
          </button>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-fg">서버 일일 할당량 (안전 한도 {Math.round(quota.safetyCutoffRatio * 100)}%)</span>
            <span className="font-semibold text-fg-2">
              사용률 {gauge.utilizationPct}% · 활성 클라우드 {gauge.activeCloudCount}/{gauge.configuredCloudCount}
            </span>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-panel"
            role="progressbar"
            aria-label="무료 AI 일일 안전 할당량 사용률"
            aria-valuenow={gauge.utilizationPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn("h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none", gaugeBarClass)}
              style={{ width: `${gauge.utilizationPct}%` }}
            />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {quota.providers.map((provider) => (
              <span
                key={provider.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold",
                  provider.tier === "local-fallback"
                    ? "border-accent/35 bg-accent-soft/40 text-accent"
                    : provider.blocked
                      ? "border-danger/35 bg-danger-soft/20 text-danger"
                      : provider.configured
                        ? "border-success/35 bg-success-soft/20 text-success"
                        : "border-line bg-panel text-fg-3",
                )}
              >
                <span>{provider.labelKo}</span>
                <span>
                  {provider.tier === "local-fallback"
                    ? "항상 준비"
                    : provider.blocked
                      ? provider.blockReason === "free_billing_unconfirmed"
                        ? "무료 계정 확인 필요"
                        : provider.blockedUntilUtc ? "UTC 자정까지 차단" : "모델 설정 확인 필요"
                      : provider.configured
                        ? `잔여 ${provider.remainingSafeRequests}회`
                        : "미설정"}
                </span>
              </span>
            ))}
          </div>
        </div>
      </details>

      <div className="mt-4 space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <label htmlFor="studio-free-ai-workbench-mode" className="text-xs font-bold text-fg">
            {bt("작업 모드", "Work mode")}
          </label>
          <span aria-live="polite" aria-atomic="true" className="text-xs font-semibold text-fg-2">
            {otherRunningCount > 0
              ? bt("다른 모드 {count}개 분석 중", "Other modes running · {count}").replace("{count}", String(otherRunningCount))
              : null}
          </span>
        </div>
        <select
          id="studio-free-ai-workbench-mode"
          aria-describedby="studio-free-ai-workbench-mode-description"
          value={selectedMode}
          onChange={(event) => {
            const mode = FREE_AI_14_ASSIST_MODES.find((item) => item.id === event.target.value);
            if (mode) setSelectedMode(mode.id);
          }}
          className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {MODE_CATEGORIES.map((category) => (
            <optgroup key={category} label={category}>
              {FREE_AI_14_ASSIST_MODES.filter((mode) => mode.categoryKo === category).map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.labelKo}{workspaces[mode.id]?.running ? bt(" · 분석 중", " · Running") : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p id="studio-free-ai-workbench-mode-description" className="text-xs leading-5 text-fg-2">{currentSpec.descriptionKo}</p>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="studio-free-ai-workbench-input"
            className="text-xs font-bold text-fg"
          >
            {currentSpec.labelKo} 입력
          </label>
          <button
            type="button"
            onClick={() => updateMode(selectedMode, { draft: currentSpec.samplePromptKo })}
            className="min-h-11 rounded-lg px-2 text-xs font-bold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            {bt("예시 채우기", "Use an example")}
          </button>
        </div>
        <textarea
          id="studio-free-ai-workbench-input"
          value={inputText}
          onChange={(event) => updateMode(selectedMode, { draft: event.target.value })}
          rows={3}
          maxLength={WORKBENCH_INPUT_MAX_LENGTH}
          className="w-full resize-y rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm leading-6 text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/25"
          placeholder={currentSpec.samplePromptKo}
        />
        {selectedMode === "export-preflight-coach" && (
          <StudioExportImageFacts
            draft={inputText}
            maxLength={WORKBENCH_INPUT_MAX_LENGTH}
            onChange={(draft) => updateMode("export-preflight-coach", { draft })}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={running}
            onClick={() => void handleRun()}
            data-testid="free-ai-workbench-run-btn"
            className={buttonClass({
              variant: "solid",
              className: "min-h-11 gap-2",
            })}
          >
            {running ? (
              <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Feather size={15} aria-hidden="true" />
            )}
            {running ? "₩0 무료 AI 분석 중…" : "₩0 무료 AI 실행"}
          </button>
          {running ? (
            <button
              type="button"
              data-testid="free-ai-workbench-cancel-btn"
              onClick={handleCancel}
              className={buttonClass({
                variant: "outline",
                className: "min-h-11 gap-1.5",
              })}
            >
              <X size={15} aria-hidden="true" />
              요청 취소
            </button>
          ) : null}
        </div>
        {statusMessage ? (
          <p role="status" className="text-xs font-semibold text-fg-2">
            {statusMessage}
          </p>
        ) : null}
        {staleResult ? (
          <p role="status" className="text-xs font-semibold text-fg-2">
            {bt(
              "입력이 바뀌었어요. 다시 실행하거나 이전 입력으로 되돌리면 결과를 볼 수 있어요.",
              "The draft changed. Run again or restore the previous draft to see its result.",
            )}
          </p>
        ) : null}
      </div>

      {result ? (
        <div
          data-testid="studio-free-ai-workbench-result"
          className="mt-3 rounded-xl border border-accent/35 bg-card p-3.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-bold text-accent">
              {result.providerTier === "cloud-free"
                ? bt("무료 클라우드", "Free cloud processing")
                : bt("로컬 코치", "Local coach")}
            </span>
            <button
              type="button"
              onClick={() => void handleCopyResult()}
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "min-h-11 gap-1.5",
              })}
            >
              {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              {copied ? "복사됨" : "결과 복사"}
            </button>
          </div>
          {result.fallbackNoticeKo ? (
            <p role="status" className="mt-2 rounded-lg bg-panel px-2.5 py-1.5 text-fg-2">
              {result.fallbackNoticeKo}
            </p>
          ) : null}
          <p className="mt-2 text-sm font-bold text-fg">{result.headlineKo}</p>
          <ul className="mt-2 space-y-1.5 text-fg-2">
            {result.bulletsKo.map((line, index) => (
              <li key={`${result.mode}:${index}`} className="rounded-lg bg-panel/70 px-3 py-2 leading-5">
                {line}
              </li>
            ))}
          </ul>
          <details className="group mt-2 rounded-lg border border-line">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-2.5 font-semibold text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {bt("처리 정보", "Processing details")}
              <ChevronDown size={14} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <dl className="space-y-1.5 px-2.5 pb-2.5">
              <div>
                <dt className="font-semibold text-fg-2">{bt("공급자", "Provider")}</dt>
                <dd className="break-all text-fg">{result.providerId}</dd>
              </div>
              <div>
                <dt className="font-semibold text-fg-2">{bt("모델", "Model")}</dt>
                <dd className="break-all text-fg">{result.model}</dd>
              </div>
            </dl>
          </details>
        </div>
      ) : null}

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold text-fg [word-break:keep-all]">
              디자인·스토리 AI 4대 스튜디오 랩 (Canva · Figma · Tooning · Plotr)
            </p>
            <p className="mt-0.5 text-[0.7rem] text-fg-3 [word-break:keep-all]">
              썸네일·6종 규격 리플로우·오토레이아웃·4/8컷 컷툰·대본 콘티를 유료 과금 없이 바로 열어 쓸 수 있어요.
            </p>
          </div>
          <button
            type="button"
            aria-expanded={designStorySuitesOpen}
            onClick={() => setDesignStorySuitesOpen((prev) => !prev)}
            className={buttonClass({
              variant: designStorySuitesOpen ? "solid" : "outline",
              size: "sm",
              className: "min-h-11 gap-1.5",
            })}
          >
            <Layers size={14} aria-hidden="true" />
            {designStorySuitesOpen ? "4대 스튜디오 랩 접기" : "4대 스튜디오 랩 열기"}
          </button>
        </div>
        {designStorySuitesOpen ? (
          <Suspense
            fallback={
              <p className="mt-3 text-xs text-fg-3">
                디자인·스토리 AI 4대 스튜디오 랩을 불러오는 중…
              </p>
            }
          >
            <LazyStudioDesignStoryAi4SuitesPanel
              projectTitle={projectTitle}
              fetchImpl={fetchImpl}
            />
          </Suspense>
        ) : null}
      </div>
    </section>
  );
}
