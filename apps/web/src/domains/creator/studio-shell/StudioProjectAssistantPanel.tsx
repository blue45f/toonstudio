import {
  ArrowRight,
  Check,
  Feather,
  Layers,
  Loader2,
  PenTool,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  useBilingual,
  useBilingualLocalizer,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioAiAssistToolId } from "../ai/studio-ai-assist-ux";
import {
  createStudioAiProjectHandoff,
  writeStudioAiProjectHandoff,
  type StudioAiProjectHandoff,
} from "../ai/studio-ai-project-handoff";
import {
  DEFAULT_STUDIO_OPENAI_MODES,
  fetchStudioOpenAiAssistStatus,
  runStudioOpenAiCreativeAssist,
  type StudioOpenAiAssistMode,
  type StudioOpenAiAssistStatus,
  type StudioOpenAiAssistSuccess,
  type StudioOpenAiTargetPlatform,
} from "../ai/studio-openai-creative-assist-client";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import {
  clearStudioAssistantSessionState,
  defaultOpenAiModeForSection,
  readStudioAssistantSessionState,
  STUDIO_ASSISTANT_SUGGESTIONS,
  writeStudioAssistantSessionState,
  type AssistantSuggestionSpec,
  type StudioProjectAssistantSectionId,
} from "./guided-flow/studio-assistant-session-store";
import { StudioOpenAiAssistResultCard } from "./StudioOpenAiAssistResultCard";
import { updateStudioStoryPlan } from "./studio-story-plan-update";
import { useStudioProjectFeatureSuite } from "./useStudioProjectFeatureSuite";

const LazyStudioFreeAiAssistWorkbench = lazy(() =>
  import("./StudioFreeAiAssistWorkbench").then((mod) => ({
    default: mod.StudioFreeAiAssistWorkbench,
  })),
);

export type StudioProjectAssistantSection = StudioProjectAssistantSectionId;

interface StudioProjectAssistantPanelProps {
  readonly projectId: string;
  readonly section: StudioProjectAssistantSection;
  readonly locale?: string;
  readonly fetchImpl?: typeof fetch;
}

function assistantSource(
  section: StudioProjectAssistantSection,
): StudioAiProjectHandoff["source"] {
  if (section === "story") return "story";
  if (section === "review") return "review";
  if (section === "export") return "export";
  return "project-shell";
}

function editorHref(projectId: string, tool: StudioAiAssistToolId): string {
  const surface =
    tool === "background" || tool === "character" || tool === "palette"
      ? "canvas"
      : "comic";
  return `/studio/work/${encodeURIComponent(projectId)}/${surface}`;
}

function readLocalProjectContext(projectId: string): {
  readonly title?: string;
  readonly genreOrTone?: string;
  readonly targetPlatform: StudioOpenAiTargetPlatform;
} {
  if (typeof window === "undefined") {
    return { targetPlatform: "vertical-webtoon" };
  }
  try {
    const match = readStudioProjectLibrary(window.localStorage).projects.find(
      (item) => item.id === projectId,
    );
    const format = match?.definition?.format;
    const targetPlatform: StudioOpenAiTargetPlatform =
      format === "cuttoon"
        ? "cuttoon"
        : format === "page-comic"
          ? "page-comic"
          : format === "motion-toon" ||
              format === "illustration" ||
              (match?.kind && match.kind !== "webtoon")
            ? "general"
            : "vertical-webtoon";
    return {
      title: match?.title?.trim() || undefined,
      genreOrTone: match?.description?.trim().slice(0, 80) || undefined,
      targetPlatform,
    };
  } catch {
    return { targetPlatform: "vertical-webtoon" };
  }
}

/**
 * 프로젝트 단계 안에서 바로 쓸 수 있는 AI 창작 도우미.
 * 프로젝트별 key 경계로 세션 복원 상태를 격리하고, 진행 중인 요청은 언제든 취소할 수 있다.
 */
export function StudioProjectAssistantPanel(props: StudioProjectAssistantPanelProps) {
  return <StudioProjectAssistantPanelBody key={props.projectId} {...props} />;
}

function StudioProjectAssistantPanelBody({
  projectId,
  section,
  locale = "ko",
  fetchImpl,
}: StudioProjectAssistantPanelProps) {
  const bt = useBilingual("StudioProjectAssistantPanel");
  const l = useBilingualLocalizer("studioProjectAssistant");
  const navigate = useNavigate();
  const normalizedLocale = locale.toLowerCase().startsWith("ko") ? "ko" : "en";
  const suite = useStudioProjectFeatureSuite(projectId, normalizedLocale);
  const suggestions = useMemo(() => STUDIO_ASSISTANT_SUGGESTIONS[section], [section]);
  const inFlightAbortRef = useRef<AbortController | null>(null);

  const defaultMode = suggestions[0]?.openAiMode ?? defaultOpenAiModeForSection(section);
  const defaultPrompt = suggestions[0]
    ? l(suggestions[0].prompt.ko, suggestions[0].prompt.en)
    : "";

  const initialRestored = useMemo(
    () => readStudioAssistantSessionState(projectId),
    [projectId],
  );

  const [selectedTool, setSelectedTool] = useState<StudioAiAssistToolId>(
    suggestions[0]?.tool ?? "composition",
  );
  const [openAiMode, setOpenAiMode] = useState<StudioOpenAiAssistMode>(
    () => initialRestored?.openAiMode ?? defaultMode,
  );
  const [prompt, setPrompt] = useState<string>(
    () => initialRestored?.prompt ?? defaultPrompt,
  );
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<StudioOpenAiAssistStatus | null>(null);
  const [runningOpenAi, setRunningOpenAi] = useState(false);
  const modelRetired = statusInfo?.modelConfigurationError === "retired";
  const openAiConfigured = statusInfo?.configured === true && !modelRetired;
  const [openAiResult, setOpenAiResult] = useState<StudioOpenAiAssistSuccess | null>(
    () => initialRestored?.lastResult ?? null,
  );
  const [submittedPrompt, setSubmittedPrompt] = useState<string | undefined>(
    () => (initialRestored?.lastResult ? initialRestored.prompt : undefined),
  );
  const [freeLabOpen, setFreeLabOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchStudioOpenAiAssistStatus({
      fetchImpl,
      signal: controller.signal,
    }).then((next) => {
      if (!controller.signal.aborted) setStatusInfo(next);
    });
    return () => {
      controller.abort();
    };
  }, [fetchImpl]);

  useEffect(() => {
    return () => {
      inFlightAbortRef.current?.abort();
      inFlightAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      !prompt.trim() ||
      (openAiResult === null && prompt === defaultPrompt && openAiMode === defaultMode)
    ) {
      clearStudioAssistantSessionState(projectId);
      return;
    }
    writeStudioAssistantSessionState(projectId, {
      prompt,
      openAiMode,
      lastResult: openAiResult,
    });
  }, [
    projectId,
    prompt,
    openAiMode,
    openAiResult,
    defaultPrompt,
    defaultMode,
  ]);

  const chooseSuggestion = (suggestion: AssistantSuggestionSpec) => {
    setSelectedTool(suggestion.tool);
    setOpenAiMode(suggestion.openAiMode);
    setPrompt(l(suggestion.prompt.ko, suggestion.prompt.en));
    setError(null);
    setStatusMessage(null);
  };

  const resetDraft = () => {
    inFlightAbortRef.current?.abort();
    inFlightAbortRef.current = null;
    setRunningOpenAi(false);
    clearStudioAssistantSessionState(projectId);
    const first = suggestions[0];
    setSelectedTool(first?.tool ?? "composition");
    setOpenAiMode(defaultMode);
    setPrompt(defaultPrompt);
    setOpenAiResult(null);
    setSubmittedPrompt(undefined);
    setError(null);
    setStatusMessage(null);
  };

  const cancelOpenAiRequest = () => {
    inFlightAbortRef.current?.abort();
    inFlightAbortRef.current = null;
    setRunningOpenAi(false);
    setError(null);
    setStatusMessage(
      bt(
        "초안 생성 요청을 취소했어요. 입력한 내용은 그대로 남아 있습니다.",
        "Canceled drafting. Your input text is preserved.",
      ),
    );
  };

  const launch = () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError(
        bt(
          "도우미에게 요청할 내용을 입력해 주세요.",
          "Describe what the assistant should do.",
        ),
      );
      return;
    }
    try {
      const handoff = createStudioAiProjectHandoff({
        projectId,
        tool: selectedTool,
        prompt: trimmed,
        source: assistantSource(section),
      });
      writeStudioAiProjectHandoff(window.sessionStorage, handoff);
      navigate(editorHref(projectId, selectedTool));
    } catch {
      setError(
        bt(
          "요청을 편집기로 넘기지 못했어요. 편집기를 열어 도우미를 직접 실행해 주세요.",
          "The request could not be handed off safely. Open the assistant from the editor instead.",
        ),
      );
    }
  };

  const runOpenAiAssist = async () => {
    if (runningOpenAi || modelRetired) return;
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError(
        bt(
          "도우미에게 요청할 내용을 입력해 주세요.",
          "Describe what the assistant should do.",
        ),
      );
      return;
    }
    inFlightAbortRef.current?.abort();
    const controller = new AbortController();
    inFlightAbortRef.current = controller;
    setRunningOpenAi(true);
    setError(null);
    setStatusMessage(null);

    const localProject = readLocalProjectContext(projectId);
    const response = await runStudioOpenAiCreativeAssist(
      {
        mode: openAiMode,
        inputText: trimmed,
        projectTitle: localProject.title,
        genreOrTone: localProject.genreOrTone,
        targetPlatform: localProject.targetPlatform,
      },
      { fetchImpl, signal: controller.signal },
    );

    if (inFlightAbortRef.current !== controller || controller.signal.aborted) {
      return;
    }
    inFlightAbortRef.current = null;
    setRunningOpenAi(false);
    if (!response.ok) {
      if (response.code !== "CLIENT_ABORTED") {
        setError(response.message);
      }
      return;
    }
    setSubmittedPrompt(trimmed);
    setOpenAiResult(response.data);
  };

  const appendBeatsToStoryPlan = (beats: readonly StudioStoryBeat[]): readonly string[] => {
    let insertedIds: string[] = [];
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    suite.update((current) => {
      const nextBeats = updateStudioStoryPlan(current.storyBeats, beats, "append", stamp);
      insertedIds = nextBeats.slice(current.storyBeats.length).map((beat) => beat.id);
      return {
        ...current,
        storyBeats: nextBeats,
      };
    });
    if (insertedIds.length > 0) {
      setStatusMessage(
        bt(
          `기획 컷 목록 뒤에 ${insertedIds.length}컷을 사본으로 추가했어요.`,
          `Appended ${insertedIds.length} panel beat(s) to the story plan.`,
        ),
      );
    }
    return insertedIds;
  };

  const undoAppendedBeatsFromStoryPlan = (beatIds: readonly string[]) => {
    if (beatIds.length === 0) return;
    const removeSet = new Set(beatIds);
    let removedCount = 0;
    suite.update((current) => {
      const kept = current.storyBeats
        .filter((beat) => {
          if (removeSet.has(beat.id)) {
            removedCount += 1;
            return false;
          }
          return true;
        })
        .map((beat, order) => ({ ...beat, order }));
      return {
        ...current,
        storyBeats: kept,
      };
    });
    if (removedCount > 0) {
      setStatusMessage(
        bt(
          `방금 추가한 ${removedCount}컷만 되돌렸어요. 기존 컷은 그대로 유지됩니다.`,
          `Reverted only the ${removedCount} added beat(s). Existing beats remain untouched.`,
        ),
      );
    }
  };

  const modeList = statusInfo?.modes ?? DEFAULT_STUDIO_OPENAI_MODES;

  return (
    <section
      className="rounded-3xl border border-accent/25 bg-accent-soft/15 p-4 sm:p-5"
      aria-labelledby="project-assistant-title"
      data-testid="studio-project-assistant-panel"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <Feather size={14} aria-hidden="true" />{" "}
            {bt("창작 보조 · 대본·컷 초안", "CREATIVE ASSISTANT")}
          </p>
          <h2
            id="project-assistant-title"
            className="mt-2 text-xl font-black tracking-tight text-fg"
          >
            {bt("막히는 구절이나 컷 구성을 바로 다듬어 보세요", "Unblock story, cuts, or dialogue right here")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">
            {bt(
              "아이디어 확장, 대본 컷 나누기, 말풍선 대사 손보기, 회차 소개글 점검을 돕습니다. 모든 제안은 원본을 건드리지 않고 사본으로만 덧붙입니다.",
              "Expand story angles, split scripts into panels, polish speech balloons, or review episode blurbs—always saved as copies without overwriting originals.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-success/30 bg-success-soft/20 px-3 text-xs font-bold text-success">
            <Check size={14} aria-hidden="true" />
            {bt("원본 덮어쓰기 없음", "Original protected")}
          </span>
          <span
            data-testid="openai-assist-status-badge"
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
              openAiConfigured
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2",
            )}
          >
            <ShieldCheck size={14} aria-hidden="true" />
            {modelRetired
              ? bt("OpenAI 모델 설정 확인 필요", "Check OpenAI model configuration")
              : statusInfo?.configured
                ? bt(`서버 OpenAI 키 설정됨 (${statusInfo.model})`, `Server OpenAI key set (${statusInfo.model})`)
                : bt("서버 OpenAI 키 확인 필요", "Server OpenAI key not set")}
          </span>
        </div>
      </div>

      {statusInfo && (!statusInfo.configured || modelRetired) ? (
        <p
          data-testid="openai-assist-key-notice"
          className="mt-3 rounded-2xl border border-line bg-card/85 px-3.5 py-2.5 text-xs leading-5 text-fg-2"
        >
          {bt(
            statusInfo.setupNoticeKo,
            modelRetired
              ? "This model is no longer available. Ask the server administrator to configure a supported model. Planning, drawing, and export remain available."
              : "OPENAI_API_KEY is not configured in the server local environment yet. Planning, drawing, and export continue to work normally.",
          )}
        </p>
      ) : null}

      <div
        className="mt-4 flex flex-wrap gap-1.5"
        role="group"
        aria-label={bt("OpenAI 보조 역할 선택", "Choose OpenAI helper mode")}
      >
        {modeList.map((modeItem) => {
          const active = openAiMode === modeItem.id;
          return (
            <button
              key={modeItem.id}
              type="button"
              data-testid={`openai-mode-${modeItem.id}`}
              aria-pressed={active}
              onClick={() => {
                setOpenAiMode(modeItem.id);
                setError(null);
                setStatusMessage(null);
              }}
              className={cn(
                "min-h-11 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel/70 text-fg-2 hover:border-accent/40 hover:text-fg",
              )}
            >
              {modeItem.labelKo}
            </button>
          );
        })}
      </div>

      <div
        className="mt-3 flex flex-wrap gap-2"
        aria-label={bt("추천 요청", "Suggested requests")}
      >
        {suggestions.map((suggestion) => {
          const active =
            prompt === l(suggestion.prompt.ko, suggestion.prompt.en) &&
            selectedTool === suggestion.tool;
          return (
            <button
              key={`${suggestion.tool}:${suggestion.label.en}`}
              type="button"
              aria-pressed={active}
              onClick={() => chooseSuggestion(suggestion)}
              className={cn(
                "min-h-11 rounded-xl border px-3 text-xs font-bold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-fg",
              )}
            >
              {l(suggestion.label.ko, suggestion.label.en)}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="text-xs font-bold text-fg-2"
            htmlFor="project-assistant-prompt"
          >
            {bt("요청 내용", "Request")}
          </label>
          <span className="text-[0.68rem] text-fg-3">
            {bt("탭을 옮겨도 작성 중인 초안이 유지됩니다", "Draft kept across tabs")}
          </span>
        </div>
        <button
          type="button"
          onClick={resetDraft}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-fg-3 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          <RotateCcw size={12} aria-hidden="true" />
          {bt("기본 예시로 초기화", "Reset prompt")}
        </button>
      </div>
      <textarea
        id="project-assistant-prompt"
        value={prompt}
        onChange={(event) => {
          setPrompt(event.target.value);
          setError(null);
          setStatusMessage(null);
        }}
        rows={3}
        maxLength={6_000}
        className="mt-2 w-full resize-y rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-6 text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/25"
        placeholder={bt(
          "예: 비 오는 정류장에서 우산을 건네는 첫 만남을 4컷으로 나눠줘",
          "Example: Split a rainy bus-stop encounter into 4 webtoon panels",
        )}
      />
      {error ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {statusMessage ? (
        <p role="status" className="mt-2 text-xs font-semibold text-fg-2">
          {statusMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p data-testid="openai-assist-billing-notice" className="text-xs leading-5 text-fg-3">
          {bt(
            "API 키는 서버에 보관하고 이메일·연락처는 전송 전에 마스킹합니다. 이 기능은 유료 충전을 실행하지 않으며, 계정의 크레딧 잔액·자동 충전·과금 한도는 별도 확인이 필요합니다.",
            "API keys stay on the server, and emails and phone numbers are masked before sending. This feature does not purchase credits. Account credit balance, auto-recharge, and spending limits require a separate check.",
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={runningOpenAi || modelRetired}
            onClick={() => void runOpenAiAssist()}
            data-testid="openai-assist-submit-btn"
            className={buttonClass({
              variant: openAiConfigured ? "solid" : "outline",
              className: "min-h-11 gap-2",
            })}
          >
            {runningOpenAi ? (
              <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <PenTool size={16} aria-hidden="true" />
            )}
            {runningOpenAi
              ? bt("초안 만드는 중…", "Drafting…")
              : bt("OpenAI로 초안 받기", "Draft with OpenAI")}
          </button>
          {runningOpenAi ? (
            <button
              type="button"
              onClick={cancelOpenAiRequest}
              data-testid="openai-assist-cancel-btn"
              className={buttonClass({
                variant: "outline",
                className: "min-h-11 gap-1.5",
              })}
            >
              <X size={15} aria-hidden="true" />
              {bt("요청 취소", "Cancel")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={launch}
            className={buttonClass({
              variant: openAiConfigured ? "outline" : "solid",
              className: "min-h-11 gap-2",
            })}
          >
            <Layers size={16} aria-hidden="true" />
            {bt("편집기에서 검토", "Review in editor")}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {openAiResult ? (
        <StudioOpenAiAssistResultCard
          response={openAiResult}
          originalPrompt={submittedPrompt}
          onAppendStoryBeats={appendBeatsToStoryPlan}
          onUndoAppendedStoryBeats={undoAppendedBeatsFromStoryPlan}
        />
      ) : null}

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-2 [word-break:keep-all]">
            <ShieldCheck size={14} className="shrink-0 text-success" aria-hidden="true" />
            {bt(
              "OpenAI 키가 없어도 바로 쓰는 무과금 14모드 AI 랩 (유료 과금 0원 보호)",
              "14-mode free AI lab available without an OpenAI key (zero-bill protected)",
            )}
          </span>
          <button
            type="button"
            data-testid="toggle-free-ai-lab-btn"
            aria-expanded={freeLabOpen}
            onClick={() => setFreeLabOpen((prev) => !prev)}
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: "min-h-11 gap-1.5",
            })}
          >
            {freeLabOpen
              ? bt("무과금 14모드 AI 랩 닫기", "Close 14-mode free AI lab")
              : bt("무과금 14모드 AI 랩 열기", "Open 14-mode free AI lab")}
          </button>
        </div>
        {freeLabOpen ? (
          <Suspense
            fallback={
              <p className="mt-3 text-xs text-fg-3">
                {bt("무과금 AI 14모드 랩을 불러오는 중…", "Loading 14-mode free AI lab…")}
              </p>
            }
          >
            <LazyStudioFreeAiAssistWorkbench
              projectTitle={readLocalProjectContext(projectId).title}
              fetchImpl={fetchImpl}
            />
          </Suspense>
        ) : null}
      </div>
    </section>
  );
}
