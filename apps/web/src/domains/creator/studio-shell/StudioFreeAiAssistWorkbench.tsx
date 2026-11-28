import {
  Check,
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
  type FreeAiZeroBillAssistResponse,
  type FreeAiZeroBillModeId,
} from "@/shared/ai/free-ai-zero-bill-cascade";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

const LazyStudioDesignStoryAi4SuitesPanel = lazy(
  () => import("../ai-creative-suites/StudioDesignStoryAi4SuitesPanel"),
);

type CategoryFilter = "전체" | FreeAiModeCategoryKo;

const CATEGORY_TABS: readonly CategoryFilter[] = [
  "전체",
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
  const [quota, setQuota] = useState<FreeAiQuotaStatusSnapshot>(() =>
    createOfflineZeroBillQuotaSnapshot(),
  );
  const [loadingQuota, setLoadingQuota] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>("전체");
  const [selectedMode, setSelectedMode] = useState<FreeAiZeroBillModeId>(initialMode);
  const [inputText, setInputText] = useState<string>(
    () =>
      FREE_AI_14_ASSIST_MODES.find((item) => item.id === initialMode)?.samplePromptKo ??
      FREE_AI_14_ASSIST_MODES[0].samplePromptKo,
  );
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [result, setResult] = useState<FreeAiZeroBillAssistResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [designStorySuitesOpen, setDesignStorySuitesOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refreshQuota = useCallback(async () => {
    setLoadingQuota(true);
    try {
      const next = await fetchFreeAiQuotaStatus({ fetchImpl });
      setQuota(next);
    } finally {
      setLoadingQuota(false);
    }
  }, [fetchImpl]);

  useEffect(() => {
    void refreshQuota();
    return () => {
      abortRef.current?.abort();
    };
  }, [refreshQuota]);

  const gauge = useMemo(() => computeZeroBillSafetyGauge(quota), [quota]);
  const visibleModes = useMemo(
    () =>
      category === "전체"
        ? FREE_AI_14_ASSIST_MODES
        : FREE_AI_14_ASSIST_MODES.filter((item) => item.categoryKo === category),
    [category],
  );
  const currentSpec = useMemo(
    () =>
      FREE_AI_14_ASSIST_MODES.find((item) => item.id === selectedMode) ??
      FREE_AI_14_ASSIST_MODES[0],
    [selectedMode],
  );

  const handleSelectMode = (modeId: FreeAiZeroBillModeId) => {
    setSelectedMode(modeId);
    const spec = FREE_AI_14_ASSIST_MODES.find((item) => item.id === modeId);
    if (spec) {
      setInputText(spec.samplePromptKo);
    }
  };

  const handleRun = async () => {
    if (running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setStatusMessage(null);
    setCopied(false);
    try {
      const response = await runFreeAiZeroBillAssist(
        {
          mode: selectedMode,
          inputText,
          projectTitle,
        },
        { fetchImpl, signal: controller.signal },
      );
      if (abortRef.current === controller && !controller.signal.aborted) {
        abortRef.current = null;
        setResult(response);
        void refreshQuota();
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setRunning(false);
      }
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setStatusMessage("무과금 AI 분석 요청을 취소했어요. 입력한 내용은 그대로 남아 있습니다.");
  };

  const handleCopyResult = async () => {
    if (!result) return;
    const text = [result.headlineKo, ...result.bulletsKo.map((line) => `- ${line}`)].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
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
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <p className="flex items-center gap-1.5 text-[0.7rem] font-extrabold tracking-wide text-accent">
            <ShieldCheck size={14} aria-hidden="true" />
            {gauge.badgeTextKo}
          </p>
          <h3
            id="studio-free-ai-workbench-heading"
            className="mt-1 text-base font-black text-fg"
          >
            무과금 웹툰 AI 14모드 랩
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-fg-2">{gauge.detailTextKo}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-9 items-center rounded-full border border-success/35 bg-success-soft/20 px-3 text-xs font-extrabold text-success">
            창작자 이용료 {quota.guaranteedZeroCostKrwLabel}
          </span>
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
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
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
            className={cn("h-full rounded-full transition-[width] duration-200", gaugeBarClass)}
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

      <div
        className="mt-3 flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="무과금 AI 모드 분야"
      >
        {CATEGORY_TABS.map((tab) => {
          const active = category === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(tab)}
              className={cn(
                "min-h-11 rounded-xl border px-3 text-xs font-bold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
              )}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visibleModes.map((mode) => {
          const active = selectedMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              aria-pressed={active}
              onClick={() => handleSelectMode(mode.id)}
              className={cn(
                "flex min-h-16 flex-col items-start rounded-xl border p-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active
                  ? "border-accent bg-accent-soft/35 text-fg"
                  : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-fg",
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <strong className="text-xs font-extrabold text-fg">{mode.labelKo}</strong>
                <span className="rounded bg-panel px-1.5 py-0.5 text-[0.62rem] font-semibold text-fg-3">
                  {mode.benchmarkLabel}
                </span>
              </div>
              <span className="mt-1 text-[0.7rem] leading-4 text-fg-3">
                {mode.descriptionKo}
              </span>
            </button>
          );
        })}
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
            onClick={() => setInputText(currentSpec.samplePromptKo)}
            className="min-h-9 rounded-lg px-2 text-xs font-bold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            초보자 예시 채우기
          </button>
        </div>
        <textarea
          id="studio-free-ai-workbench-input"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          rows={3}
          maxLength={6_000}
          className="w-full resize-y rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm leading-6 text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/25"
          placeholder={currentSpec.samplePromptKo}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.7rem] text-fg-3">
            유료 모델 호출 원천 차단 · 무료 소진 시 로컬 무과금 코치(₩0) 자동 전환
          </span>
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
        </div>
        {statusMessage ? (
          <p role="status" className="text-xs font-semibold text-fg-2">
            {statusMessage}
          </p>
        ) : null}
      </div>

      {result ? (
        <div
          data-testid="studio-free-ai-workbench-result"
          className="mt-3 rounded-xl border border-accent/35 bg-card p-3.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-bold text-accent">
                {result.providerId} · {result.model}
              </span>
              <span className="font-semibold text-success">창작자 이용료 ₩0</span>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyResult()}
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "min-h-10 gap-1.5",
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
