/**
 * claude-n7-and-llm-runners.ts
 *
 * `origin/main`에서 병합된 9종 순수 LLM 프롬프트·파서 모듈을 등록된 기본 Claude API 키
 * (`hydrateDefaultEnvClaudeConnection`) 및 `claudeCreate`와 연결하는 실시간 실행기:
 * 1. N7 3단계 에이전트 오케스트레이션 (`runClaudeN7OrchestrationPipeline`: 컷 분할 → 대사 배치 → 채색 지시)
 * 2. 콘티 컷 계획 생성 (`runClaudeStoryboardCutPlan`)
 * 3. 모션 웹툰 연출 설계 (`runClaudeDirectionPlan`)
 * 4. BGM·효과음 배치 계획 (`runClaudeBgmPlacementPlan`)
 * 5. 자유 문장 검수 코멘트 해석 (`runClaudeReviewCommentInterpreter`)
 * 6. 컷 맥락 기반 대사 추천 (`runClaudeCutDialogueSuggest`)
 * 7. 회차 줄거리 요약 & 작품 시놉시스 생성 (`runClaudePlotSummaryAndSynopsis`)
 * 8. AI 고객센터 FAQ 근거 기반 답변 (`runClaudeSupportFaqAnswer`)
 * 9. 작가 인수인계 요약 (`runClaudeAuthorHandoverSummary`)
 */
import { claudeMessageText } from "@/shared/ai/claude/claude-bridge";
import { estimateClaudeRequestCostCapUsd } from "@/shared/ai/claude/claude-cost-cap";
import {
  CLAUDE_DEFAULT_MODEL_ID,
  claudeModelSupportsEffort,
} from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { resolveClaudeRoute, type ClaudeRoute } from "@/shared/ai/claude/claude-route";
import { claudeCreate } from "@/shared/ai/claude/claude-transport";
import { hydrateDefaultEnvClaudeConnection } from "@/shared/ai/user-ai-store";

import {
  buildBgmPlacementPrompt,
  parseBgmPlacement,
  type StudioAiBgmCutInput,
  type StudioAiBgmPlacement,
} from "../studio-ai-bgm-plan";
import {
  buildDialogueSuggestPrompt,
  parseDialogueSuggestions,
} from "../studio-ai-dialogue-suggest";
import {
  buildDirectionPlanPrompt,
  parseDirectionPlan,
  type StudioAiDirectionCutInput,
  type StudioAiDirectionCutPlan,
} from "../studio-ai-direction-plan";
import { buildHandoverSummaryPrompt } from "../studio-ai-handover-summary";
import {
  buildN7ColoringPrompt,
  buildN7DialoguePrompt,
  buildN7SplitPrompt,
  parseN7ColoringResult,
  parseN7DialogueResult,
  parseN7SplitResult,
  type StudioAiN7ColoringDraft,
  type StudioAiN7CutDraft,
  type StudioAiN7DialogueDraft,
} from "../studio-ai-n7-orchestration";
import {
  buildReviewInterpretPrompt,
  parseReviewInterpretation,
  type StudioAiReviewInterpretedItem,
} from "../studio-ai-review-llm";
import {
  buildStoryboardPlanPrompt,
  parseStoryboardPlan,
  type StudioAiStoryboardCutPlan,
} from "../studio-ai-storyboard-llm";
import {
  buildPlotSummaryPrompt,
  buildSynopsisDraftPrompt,
} from "../studio-ai-summary-prompts";
import {
  buildSupportAnswerPrompt,
  isSupportRefusal,
  STUDIO_AI_SUPPORT_REFUSAL,
  type StudioAiFaqEntry,
} from "../studio-ai-support-answer";

import type { RunWebtoonProductionAssistOptions } from "./claude-webtoon-production-schemas";
import type Anthropic from "@anthropic-ai/sdk";

function resolveOrHydrateClaudeRoute(
  explicit?: Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null,
): Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null {
  if (explicit) return explicit;
  const current = resolveClaudeRoute();
  if (current) return current;
  hydrateDefaultEnvClaudeConnection();
  return resolveClaudeRoute();
}

export function stripJsonCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

async function callClaudePromptText(
  userPrompt: string,
  options: RunWebtoonProductionAssistOptions = {},
  maxTokens = 2_400,
): Promise<string> {
  const activeRoute = resolveOrHydrateClaudeRoute(options.route);
  if (!activeRoute) {
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const requestedModel = resolveClaudeRequestModel(
    options.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
  );
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: userPrompt }],
    ...(claudeModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };
  const capUsd = estimateClaudeRequestCostCapUsd(requestedModel, params);
  const message = await claudeCreate(activeRoute, params, {
    signal: options.signal,
    capUsd,
    budgetOverride: options.budgetOverride,
  });
  return claudeMessageText(message).trim();
}

export interface N7OrchestrationPipelineResult {
  readonly source: "claude-live" | "deterministic-fallback";
  readonly cuts: readonly StudioAiN7CutDraft[];
  readonly dialogues: readonly StudioAiN7DialogueDraft[];
  readonly coloring: readonly StudioAiN7ColoringDraft[];
}

export async function runClaudeN7OrchestrationPipeline(
  input: {
    readonly script: string;
    readonly characters: readonly string[];
    readonly styleNotes: string;
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<N7OrchestrationPipelineResult> {
  const fallbackCuts: readonly StudioAiN7CutDraft[] = Object.freeze([
    { id: "cut-1", summary: "붉은 달빛 아래 신전 회랑에서 마주 선 두 사람" },
    { id: "cut-2", summary: "서진의 손끝에서 봉인 문양이 금빛으로 갈라지는 클로즈업" },
    { id: "cut-3", summary: "하윤이 흔들리는 눈빛으로 성물을 움켜쥐는 바스트샷" },
    { id: "cut-4", summary: "거대한 침묵 속 서로를 스쳐 지나가는 하이앵글 전경" },
  ]);
  const fallbackDialogues: readonly StudioAiN7DialogueDraft[] = Object.freeze(
    fallbackCuts.map((c, idx) => ({
      cutId: c.id,
      lines: Object.freeze([
        idx % 2 === 0
          ? `${input.characters[0] ?? "서진"}: 약속을 어긴 건 너다.`
          : `${input.characters[1] ?? "하윤"}: 더는 숨기지 마세요.`,
      ]),
    })),
  );
  const fallbackColoring: readonly StudioAiN7ColoringDraft[] = Object.freeze(
    fallbackCuts.map((c) => ({
      cutId: c.id,
      instructions: `${input.styleNotes || "K-웹툰 고대비 셀 채색"} — 딥 네이비 그림자와 청록색 림라이트 강조`,
    })),
  );

  try {
    const rawSplit = await callClaudePromptText(buildN7SplitPrompt(input.script), options);
    const cuts = parseN7SplitResult(stripJsonCodeFence(rawSplit)) ?? fallbackCuts;

    const [rawDialogue, rawColoring] = await Promise.all([
      callClaudePromptText(buildN7DialoguePrompt(cuts, input.characters), options),
      callClaudePromptText(buildN7ColoringPrompt(cuts, input.styleNotes), options),
    ]);

    const dialogues = parseN7DialogueResult(stripJsonCodeFence(rawDialogue)) ?? fallbackDialogues;
    const coloring = parseN7ColoringResult(stripJsonCodeFence(rawColoring)) ?? fallbackColoring;

    return Object.freeze({
      source: "claude-live",
      cuts,
      dialogues,
      coloring,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return Object.freeze({
        source: "deterministic-fallback",
        cuts: fallbackCuts,
        dialogues: fallbackDialogues,
        coloring: fallbackColoring,
      });
    }
    throw error;
  }
}

export async function runClaudeStoryboardCutPlan(
  input: {
    readonly premise: string;
    readonly characters: readonly string[];
    readonly styleNotes: string;
    readonly cutCount: number;
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<readonly StudioAiStoryboardCutPlan[]> {
  const fallback: readonly StudioAiStoryboardCutPlan[] = Object.freeze([
    {
      id: "cut-1",
      summary: "도입부 공간 압도 와이드 샷",
      camera: "24mm 로우앵글 와이드",
      dialogues: Object.freeze([`${input.characters[0] ?? "주인공"}: 드디어 여기까지 왔군.`]),
    },
    {
      id: "cut-2",
      summary: "인물 감정 대립 클로즈업",
      camera: "85mm 익스트림 클로즈업",
      dialogues: Object.freeze([`${input.characters[1] ?? "상대역"}: 물러설 생각은 없어.`]),
    },
  ]);

  try {
    const raw = await callClaudePromptText(buildStoryboardPlanPrompt(input), options);
    return parseStoryboardPlan(stripJsonCodeFence(raw)) ?? fallback;
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) return fallback;
    throw error;
  }
}

export async function runClaudeDirectionPlan(
  cuts: readonly StudioAiDirectionCutInput[],
  options: RunWebtoonProductionAssistOptions = {},
): Promise<readonly StudioAiDirectionCutPlan[]> {
  const fallback: readonly StudioAiDirectionCutPlan[] = Object.freeze(
    cuts.map((c, idx) => ({
      cutId: c.cutId,
      cameraMove: idx === 0 ? "zoom-in" : "pan-down",
      transition: idx === 0 ? "fade" : "cut",
      bgmMood: "tension",
      sfxCues: Object.freeze(["whoosh"]),
    })),
  );

  try {
    const raw = await callClaudePromptText(buildDirectionPlanPrompt(cuts), options);
    return parseDirectionPlan(stripJsonCodeFence(raw)) ?? fallback;
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) return fallback;
    throw error;
  }
}

export async function runClaudeBgmPlacementPlan(
  cuts: readonly StudioAiBgmCutInput[],
  options: RunWebtoonProductionAssistOptions = {},
): Promise<readonly StudioAiBgmPlacement[]> {
  const fallback: readonly StudioAiBgmPlacement[] = Object.freeze(
    cuts.map((c) => ({
      cutId: c.cutId,
      bgmMood: "tension",
      sfxCues: Object.freeze(["heartbeat"]),
    })),
  );

  try {
    const raw = await callClaudePromptText(buildBgmPlacementPrompt(cuts), options);
    return parseBgmPlacement(stripJsonCodeFence(raw)) ?? fallback;
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) return fallback;
    throw error;
  }
}

export async function runClaudeReviewCommentInterpreter(
  comment: string,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<readonly StudioAiReviewInterpretedItem[]> {
  const fallback: readonly StudioAiReviewInterpretedItem[] = Object.freeze([
    {
      targetCut: "cut-1",
      area: "조명·대비",
      task: comment.trim().slice(0, 120) || "역광 대비 및 말풍선 여백 재점검",
    },
  ]);

  try {
    const raw = await callClaudePromptText(buildReviewInterpretPrompt(comment), options);
    return parseReviewInterpretation(stripJsonCodeFence(raw)) ?? fallback;
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) return fallback;
    throw error;
  }
}

export async function runClaudeCutDialogueSuggest(
  input: {
    readonly cutSummary: string;
    readonly character: string;
    readonly voiceNotes: string;
    readonly existingLines: readonly string[];
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<readonly string[]> {
  const fallback = Object.freeze([
    "여기서 물러설 순 없어.",
    "네가 숨긴 진실, 오늘 확인하겠어.",
    "마지막까지 눈을 떼지 마.",
  ]);

  try {
    const raw = await callClaudePromptText(buildDialogueSuggestPrompt(input), options);
    return parseDialogueSuggestions(stripJsonCodeFence(raw)) ?? fallback;
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) return fallback;
    throw error;
  }
}

export async function runClaudePlotSummaryAndSynopsis(
  input: {
    readonly sourceTexts: readonly string[];
    readonly premise: string;
    readonly characters: readonly string[];
    readonly tone: string;
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<{ readonly plotSummaryKo: string; readonly synopsisDraftKo: string }> {
  try {
    const [plotSummaryKo, synopsisDraftKo] = await Promise.all([
      callClaudePromptText(buildPlotSummaryPrompt(input.sourceTexts, 4), options),
      callClaudePromptText(
        buildSynopsisDraftPrompt({
          premise: input.premise,
          characters: input.characters,
          tone: input.tone,
        }),
        options,
      ),
    ]);
    return { plotSummaryKo, synopsisDraftKo };
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return {
        plotSummaryKo: `${input.characters.join("·")}이(가) ${input.premise} 속에서 결정적 전환점을 맞이하는 회차.`,
        synopsisDraftKo: `[로그라인] ${input.premise}\n[줄거리] ${input.characters.join(", ")} 중심의 ${input.tone} 서사.`,
      };
    }
    throw error;
  }
}

export async function runClaudeSupportFaqAnswer(
  input: {
    readonly question: string;
    readonly faqEntries: readonly StudioAiFaqEntry[];
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<{ readonly answerKo: string; readonly refused: boolean }> {
  try {
    const answerKo = await callClaudePromptText(buildSupportAnswerPrompt(input), options);
    return { answerKo, refused: isSupportRefusal(answerKo) };
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return { answerKo: STUDIO_AI_SUPPORT_REFUSAL, refused: true };
    }
    throw error;
  }
}

export async function runClaudeAuthorHandoverSummary(
  input: {
    readonly workTitle: string;
    readonly outgoingAuthor: string;
    readonly incomingAuthor: string;
    readonly bibleSummary: string;
    readonly styleSummary: string;
    readonly pendingCount: number;
    readonly inProgressCutCount: number;
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<string> {
  try {
    return await callClaudePromptText(buildHandoverSummaryPrompt(input), options);
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return `${input.workTitle} 인계 요약 (${input.outgoingAuthor} → ${input.incomingAuthor}): 미결 ${input.pendingCount}건, 진행 컷 ${input.inProgressCutCount}장.`;
    }
    throw error;
  }
}
