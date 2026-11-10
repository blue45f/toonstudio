import {
  ArrowRight,
  Check,
  Loader2,
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
  type BilingualText,
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
import { StudioOpenAiAssistResultCard } from "./StudioOpenAiAssistResultCard";
import { updateStudioStoryPlan } from "./studio-story-plan-update";
import { useStudioProjectFeatureSuite } from "./useStudioProjectFeatureSuite";

export type StudioProjectAssistantSection =
  | "overview"
  | "story"
  | "production"
  | "assets"
  | "review"
  | "export"
  | "settings";

type AssistantSuggestion = Readonly<{
  tool: StudioAiAssistToolId;
  openAiMode: StudioOpenAiAssistMode;
  label: BilingualText;
  prompt: BilingualText;
}>;

const SUGGESTIONS: Readonly<
  Record<StudioProjectAssistantSection, readonly AssistantSuggestion[]>
> = {
  overview: [
    {
      tool: "composition",
      openAiMode: "idea-remix",
      label: { ko: "5가지 발상 넓히기", en: "5-angle idea remix" },
      prompt: {
        ko: "평범한 출퇴근길 지하철에서 우연히 시작되는 미스터리 웹툰 소재를 5가지 신선한 각도로 넓혀줘.",
        en: "Remix a subway commute mystery webtoon idea into 5 distinct angles.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "다음 장면 계획", en: "Plan next scene" },
      prompt: {
        ko: "주인공이 낯선 편지를 열어 보고 놀라 뒤돌아보는 오프닝 장면을 4컷 구성으로 나눠줘.",
        en: "Draft a 4-panel opening sequence where the lead opens a strange letter and turns around.",
      },
    },
    {
      tool: "palette",
      openAiMode: "idea-remix",
      label: { ko: "작품 색감 정리", en: "Refine project palette" },
      prompt: {
        ko: "현재 작품의 장르와 분위기에 맞는 일관된 색상과 연출 포인트를 제안해줘.",
        en: "Suggest consistent mood and direction cues for the project's genre.",
      },
    },
  ],
  story: [
    {
      tool: "dialogue",
      openAiMode: "dialogue-polish",
      label: { ko: "대사 다듬기", en: "Refine dialogue" },
      prompt: {
        ko: "“내가 어제 분명히 그 문서 절대 열어보지 말라고 말했잖아, 왜 내 말을 안 듣는 거야?”를 말풍선에 잘 읽히게 다듬어줘.",
        en: "Polish this long line so it reads naturally inside mobile speech balloons.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "대본을 컷으로", en: "Script to panels" },
      prompt: {
        ko: "현재 대본을 웹툰 컷 단위로 나누고 카메라 구도와 말풍선 여백을 제안해줘.",
        en: "Break the current script into webtoon panels with camera and balloon-space suggestions.",
      },
    },
    {
      tool: "character",
      openAiMode: "idea-remix",
      label: { ko: "소재 5각도 리믹스", en: "5-lens story remix" },
      prompt: {
        ko: "이번 회차 줄거리를 독자가 예측하기 어려운 반전·공감·디테일 5가지 시선으로 재해석해줘.",
        en: "Reinterpret this episode's premise from 5 fresh storytelling lenses.",
      },
    },
  ],
  production: [
    {
      tool: "background",
      openAiMode: "script-to-cuts",
      label: { ko: "배경 참고 만들기", en: "Create background reference" },
      prompt: {
        ko: "현재 컷의 카메라와 분위기에 맞는 배경·샷 구도 참고안을 만들어줘.",
        en: "Create background and shot framing references matching the current scene.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "컷 구성 개선", en: "Improve composition" },
      prompt: {
        ko: "현재 장면의 시선 흐름과 긴장감을 높이는 컷 분할 대안을 제안해줘.",
        en: "Suggest panel breakdowns that improve eye flow and dramatic tension.",
      },
    },
    {
      tool: "palette",
      openAiMode: "dialogue-polish",
      label: { ko: "말풍선 호흡 조절", en: "Adjust balloon pacing" },
      prompt: {
        ko: "액션 컷 사이에 들어갈 짧은 호흡의 대사 대안을 제안해줘.",
        en: "Suggest concise dialogue alternatives that fit fast action beats.",
      },
    },
  ],
  assets: [
    {
      tool: "character",
      openAiMode: "idea-remix",
      label: { ko: "캐릭터 연출 아이디어", en: "Character hook ideas" },
      prompt: {
        ko: "주인공의 성격을 소품과 행동 하나로 보여 줄 수 있는 첫 등장 컷 아이디어를 제안해줘.",
        en: "Suggest first-appearance panel hooks that show character personality through action.",
      },
    },
    {
      tool: "palette",
      openAiMode: "export-preflight-coach",
      label: { ko: "작품 소개글 다듬기", en: "Polish series blurb" },
      prompt: {
        ko: "작품 표지와 함께 걸어 둘 매력적인 한 줄 소개글과 주의할 표현을 점검해줘.",
        en: "Check and polish a one-line series blurb to pair with the cover.",
      },
    },
  ],
  review: [
    {
      tool: "dialogue",
      openAiMode: "dialogue-polish",
      label: { ko: "대사 검토", en: "Review dialogue" },
      prompt: {
        ko: "검토 중인 대사의 어색한 표현을 덜어내고 모바일에서 읽기 편한 길이로 다듬어줘.",
        en: "Trim awkward phrasing and fit review dialogue cleanly for mobile reading.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "연출 검토", en: "Review direction" },
      prompt: {
        ko: "검토 중인 장면의 시선 흐름과 스크롤 여백을 살리는 컷 구성을 제안해줘.",
        en: "Suggest panel pacing and scroll gaps for smoother transitions.",
      },
    },
  ],
  export: [
    {
      tool: "dialogue",
      openAiMode: "export-preflight-coach",
      label: { ko: "글자 가독성·소개글 점검", en: "Check readability & blurb" },
      prompt: {
        ko: "1화 공개 전 독자 눈길이 멈추는 회차 소개글과 말풍선 가독성 점검표를 만들어줘.",
        en: "Prepare an episode release blurb and pre-export readability checklist.",
      },
    },
    {
      tool: "palette",
      openAiMode: "dialogue-polish",
      label: { ko: "마지막 대사 다듬기", en: "Final line polish" },
      prompt: {
        ko: "회차 마지막 컷의 엔딩 대사를 다음 화가 궁금해지도록 자연스럽게 다듬어줘.",
        en: "Polish the cliffhanger line in the final panel so readers want the next episode.",
      },
    },
  ],
  settings: [
    {
      tool: "palette",
      openAiMode: "export-preflight-coach",
      label: { ko: "작품 기본 소개 정리", en: "Organize series summary" },
      prompt: {
        ko: "이 작품의 장르와 독자층에 어울리는 작품 소개 문구와 연재 전 확인 항목을 정리해줘.",
        en: "Summarize series blurb ideas and pre-serial checks for this genre.",
      },
    },
  ],
};

function defaultOpenAiModeForSection(
  section: StudioProjectAssistantSection,
): StudioOpenAiAssistMode {
  if (section === "overview" || section === "assets") return "idea-remix";
  if (section === "story" || section === "production") return "script-to-cuts";
  if (section === "review") return "dialogue-polish";
  return "export-preflight-coach";
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
 * 1) 서버 환경변수 기반 OpenAI API 창작 보조(발상 5각도 리믹스·컷 분할·대사 다듬기·마감 점검)와
 * 2) 기존 편집기 도우미 안전한 전달(편집기에서 검토)을 한 화면에서 제공한다.
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
  const suggestions = useMemo(() => SUGGESTIONS[section], [section]);

  const [selectedTool, setSelectedTool] = useState<StudioAiAssistToolId>(
    suggestions[0]?.tool ?? "composition",
  );
  const [openAiMode, setOpenAiMode] = useState<StudioOpenAiAssistMode>(() =>
    suggestions[0]?.openAiMode ?? defaultOpenAiModeForSection(section),
  );
  const [prompt, setPrompt] = useState(() =>
    suggestions[0] ? l(suggestions[0].prompt.ko, suggestions[0].prompt.en) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<StudioOpenAiAssistStatus | null>(null);
  const [runningOpenAi, setRunningOpenAi] = useState(false);
  const [openAiResult, setOpenAiResult] = useState<StudioOpenAiAssistSuccess | null>(null);

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

  const chooseSuggestion = (suggestion: AssistantSuggestion) => {
    setSelectedTool(suggestion.tool);
    setOpenAiMode(suggestion.openAiMode);
    setPrompt(l(suggestion.prompt.ko, suggestion.prompt.en));
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

      <label
        className="mt-4 block text-xs font-bold text-fg-2"
        htmlFor="project-assistant-prompt"
      >
        {bt("요청 내용", "Request")}
      </label>
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
