import {
  ArrowRight,
  Check,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

export type StudioProjectAssistantSection = StudioProjectAssistantSectionId;

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

function readLocalProjectTitle(projectId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const match = readStudioProjectLibrary(window.localStorage).projects.find(
      (item) => item.id === projectId,
    );
    return match?.title?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 프로젝트 단계 안에서 바로 쓸 수 있는 AI 창작 도우미.
 * 탭 전환 시에도 세션 초안·마지막 제안 결과를 자동 복원해 작업 흐름이 끊기지 않는다.
 */
export function StudioProjectAssistantPanel({
  projectId,
  section,
  locale = "ko",
  fetchImpl,
}: {
  readonly projectId: string;
  readonly section: StudioProjectAssistantSection;
  readonly locale?: string;
  readonly fetchImpl?: typeof fetch;
}) {
  const bt = useBilingual("StudioProjectAssistantPanel");
  const l = useBilingualLocalizer("studioProjectAssistant");
  const navigate = useNavigate();
  const normalizedLocale = locale.toLowerCase().startsWith("ko") ? "ko" : "en";
  const suite = useStudioProjectFeatureSuite(projectId, normalizedLocale);
  const suggestions = useMemo(() => STUDIO_ASSISTANT_SUGGESTIONS[section], [section]);

  const initialRestored = useMemo(
    () => readStudioAssistantSessionState(projectId),
    [projectId],
  );

  const [selectedTool, setSelectedTool] = useState<StudioAiAssistToolId>(
    suggestions[0]?.tool ?? "composition",
  );
  const [openAiMode, setOpenAiMode] = useState<StudioOpenAiAssistMode>(
    () =>
      initialRestored?.openAiMode ??
      suggestions[0]?.openAiMode ??
      defaultOpenAiModeForSection(section),
  );
  const [prompt, setPrompt] = useState<string>(() =>
    initialRestored?.prompt ??
    (suggestions[0] ? l(suggestions[0].prompt.ko, suggestions[0].prompt.en) : ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<StudioOpenAiAssistStatus | null>(null);
  const [runningOpenAi, setRunningOpenAi] = useState(false);
  const [openAiResult, setOpenAiResult] = useState<StudioOpenAiAssistSuccess | null>(
    () => initialRestored?.lastResult ?? null,
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchStudioOpenAiAssistStatus({
      fetchImpl,
      signal: controller.signal,
    }).then((next) => {
      if (!controller.signal.aborted) setStatusInfo(next);
    });
    return () => controller.abort();
  }, [fetchImpl]);

  useEffect(() => {
    writeStudioAssistantSessionState(projectId, {
      prompt,
      openAiMode,
      lastResult: openAiResult,
    });
  }, [projectId, prompt, openAiMode, openAiResult]);

  const chooseSuggestion = (suggestion: AssistantSuggestionSpec) => {
    setSelectedTool(suggestion.tool);
    setOpenAiMode(suggestion.openAiMode);
    setPrompt(l(suggestion.prompt.ko, suggestion.prompt.en));
    setError(null);
  };

  const resetDraft = () => {
    clearStudioAssistantSessionState(projectId);
    const first = suggestions[0];
    setSelectedTool(first?.tool ?? "composition");
    setOpenAiMode(first?.openAiMode ?? defaultOpenAiModeForSection(section));
    setPrompt(first ? l(first.prompt.ko, first.prompt.en) : "");
    setOpenAiResult(null);
    setError(null);
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
    setRunningOpenAi(true);
    setError(null);
    const response = await runStudioOpenAiCreativeAssist(
      {
        mode: openAiMode,
        inputText: trimmed,
        projectTitle: readLocalProjectTitle(projectId),
        targetPlatform: "vertical-webtoon",
      },
      { fetchImpl },
    );
    setRunningOpenAi(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    setOpenAiResult(response.data);
  };

  const appendBeatsToStoryPlan = (beats: readonly StudioStoryBeat[]) => {
    suite.update((current) => ({
      ...current,
      storyBeats: updateStudioStoryPlan(
        current.storyBeats,
        beats,
        "append",
        Date.now().toString(36),
      ),
    }));
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
            <Sparkles size={14} aria-hidden="true" />{" "}
            {bt("AI 창작 도우미 · OPENAI 서버 보조", "AI CREATIVE HELPER")}
          </p>
          <h2
            id="project-assistant-title"
            className="mt-2 text-xl font-black tracking-tight text-fg"
          >
            {bt("막히는 구절이나 컷 구성을 바로 다듬어 보세요", "Unblock story, cuts, or dialogue right here")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">
            {bt(
              "발상 5각도 확장, 대본 컷 분할, 말풍선 대사 다듬기, 마감 소개글 점검을 지원해요. 제안 결과는 원본을 덮어쓰지 않고 사본으로만 추가됩니다.",
              "Remix ideas across 5 lenses, split scripts into panels, polish speech balloons, or check release blurbs without overwriting your original work.",
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
              statusInfo?.configured
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2",
            )}
          >
            <ShieldCheck size={14} aria-hidden="true" />
            {statusInfo?.configured
              ? bt(`OpenAI 연결됨 (${statusInfo.model})`, `OpenAI ready (${statusInfo.model})`)
              : bt("서버 OpenAI 키 확인 필요", "Server OpenAI key not set")}
          </span>
        </div>
      </div>

      {statusInfo && !statusInfo.configured ? (
        <p
          data-testid="openai-assist-key-notice"
          className="mt-3 rounded-2xl border border-line bg-card/85 px-3.5 py-2.5 text-xs leading-5 text-fg-2"
        >
          {bt(
            statusInfo.setupNoticeKo,
            "OPENAI_API_KEY is not configured in the server local environment yet. Planning, drawing, and export continue to work normally.",
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
              }}
              className={cn(
                "min-h-10 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
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

      <div className="mt-4 flex items-center justify-between gap-2">
        <label
          className="text-xs font-bold text-fg-2"
          htmlFor="project-assistant-prompt"
        >
          {bt("요청 내용 (탭을 옮겨도 현재 세션에 유지됨)", "Request (kept across tabs in this session)")}
        </label>
        <button
          type="button"
          onClick={resetDraft}
          className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-fg-3 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
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

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-fg-3">
          {bt(
            "키·결제 정보는 서버 로컬 환경변수에서만 읽으며, 이메일·연락처는 전송 전 자동 마스킹되고 유료 자동 충전은 하지 않습니다.",
            "Keys stay in server-only env vars, PII is masked before sending, store:false is enforced, and no auto-billing occurs.",
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={runningOpenAi}
            onClick={() => void runOpenAiAssist()}
            data-testid="openai-assist-submit-btn"
            className={buttonClass({
              variant: statusInfo?.configured ? "solid" : "outline",
              className: "min-h-11 gap-2",
            })}
          >
            {runningOpenAi ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={16} aria-hidden="true" />
            )}
            {runningOpenAi
              ? bt("초안 만드는 중…", "Drafting…")
              : bt("OpenAI로 초안 받기", "Draft with OpenAI")}
          </button>
          <button
            type="button"
            onClick={launch}
            className={buttonClass({
              variant: statusInfo?.configured ? "outline" : "solid",
              className: "min-h-11 gap-2",
            })}
          >
            <WandSparkles size={16} aria-hidden="true" />
            {bt("편집기에서 검토", "Review in editor")}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {openAiResult ? (
        <StudioOpenAiAssistResultCard
          response={openAiResult}
          onAppendStoryBeats={appendBeatsToStoryPlan}
        />
      ) : null}
    </section>
  );
}
