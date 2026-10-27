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
import { z } from "zod";

import { claudeMessageText } from "@/shared/ai/claude/claude-bridge";
import { estimateClaudeRequestCostCapUsd } from "@/shared/ai/claude/claude-cost-cap";
import {
  CLAUDE_DEFAULT_MODEL_ID,
  claudeModelInfo,
  claudeModelSupportsEffort,
  EMPTY_CLAUDE_TOKEN_USAGE,
  estimateClaudeCostUsd,
  type ClaudeTokenUsage,
} from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { resolveClaudeRoute, type ClaudeRoute } from "@/shared/ai/claude/claude-route";
import { cleanSingleLineText } from "@/shared/ai/claude/claude-text";
import { claudeCreate, claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";
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

import {
  resolveCreatorTaskModelRoute,
  type ClaudeCreatorTaskId,
} from "./claude-creator-model-router";
import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";
import {
  clampInt,
  type RunWebtoonProductionAssistOptions,
} from "./claude-webtoon-production-schemas";
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

// ── 10~15. Wave 21~23 웹툰 작화 일관성 · 환경 물리 · 3D 바이노럴 오디오툰 AI 디렉터 6종 ──

export interface Wave21RunnerEnvelope {
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedUsd: number | null;
}

async function runWave21StructuredRunner<T extends z.ZodTypeAny>(
  taskId: ClaudeCreatorTaskId,
  systemPromptKo: string,
  userPromptKo: string,
  schema: T,
  runOptions: RunWebtoonProductionAssistOptions,
): Promise<{
  readonly actualModel: string;
  readonly parsed: z.infer<T>;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedUsd: number | null;
} | null> {
  const routed = resolveCreatorTaskModelRoute(taskId, runOptions);
  const activeRoute = resolveOrHydrateClaudeRoute(runOptions.route);
  if (!activeRoute) {
    if (runOptions.fallbackOnError !== false) return null;
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const requestedModel = resolveClaudeRequestModel(
    routed.mergedOptions.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: routed.mergedOptions.maxTokens ?? 3_200,
    system: [{ type: "text", text: systemPromptKo, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPromptKo }],
    ...(claudeModelSupportsEffort(requestedModel)
      ? { output_config: { effort: routed.mergedOptions.effort ?? ("low" as const) } }
      : {}),
  };
  try {
    const { message, parsed } = await claudeParse(activeRoute, request, schema, {
      signal: runOptions.signal,
      capUsd: estimateStructuredCostCapUsd({ model: requestedModel, request, schema }),
      budgetOverride: runOptions.budgetOverride,
    });
    const actualModel = message.model || requestedModel;
    const usage = toClaudeTokenUsage(message.usage);
    return {
      actualModel: claudeModelInfo(actualModel)?.id ?? actualModel,
      parsed,
      usage,
      estimatedUsd: estimateClaudeCostUsd(actualModel, usage)?.usd ?? null,
    };
  } catch (error) {
    if (runOptions.fallbackOnError !== false && !runOptions.signal?.aborted) return null;
    throw error;
  }
}

// 10) 동공 하이라이트(Catchlight) 광원 각도·사시 방지·시선 도약(Saccade) 궤적 고정기
export const ClaudeGazeSaccadePupilHighlightLockSchema = z.object({
  catchlightClockHour: z.number(),
  binocularVergenceRuleKo: z.string(),
  pupilDilationRatioRuleKo: z.string(),
  saccadeTrajectoryRuleKo: z.string(),
  directorNoteKo: z.string(),
});
export type ClaudeGazeSaccadePupilHighlightLockOutput = z.infer<typeof ClaudeGazeSaccadePupilHighlightLockSchema>;
export type ClaudeGazeSaccadePupilHighlightLockView = ClaudeGazeSaccadePupilHighlightLockOutput & Wave21RunnerEnvelope;

export function buildDeterministicGazeSaccadePupilHighlightLockView(gazeNoteKo = ""): ClaudeGazeSaccadePupilHighlightLockView {
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-haiku-5-5",
    catchlightClockHour: 10,
    binocularVergenceRuleKo: cleanSingleLineText(gazeNoteKo, 110) || "양안 동공 중심축이 동일 응시점(1.2m 거리 상대방 미간)에 수렴하도록 고정 — 외사시/내사시 작붕 차단",
    pupilDilationRatioRuleKo: "충격/공포 클로즈업에서는 홍채 대비 동공 직경 22% 수축(Pinpoint Pupil) · 호감/각성 시 55% 확장",
    saccadeTrajectoryRuleKo: "상대방 눈 → 입술 → 손에 쥔 단검 순서로 3단계 시선 도약(Saccade) 앵커 일관성 유지",
    directorNoteKo: "좌우 눈의 메인 캐치라이트 방향(10시 방향 주광원)은 고개를 갸웃거려도 월드 좌표 광원 방향을 유지해야 합니다.",
    usage: EMPTY_CLAUDE_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runClaudeGazeSaccadePupilHighlightLockDirector(
  gazeNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<ClaudeGazeSaccadePupilHighlightLockView> {
  const fb = buildDeterministicGazeSaccadePupilHighlightLockView(gazeNoteKo);
  const res = await runWave21StructuredRunner(
    "runner:gaze-saccade-pupil-highlight-lock",
    "당신은 웹툰 캐릭터 동공 캐치라이트(Catchlight) 광원 방향·양안 수렴각(사시 방지)·시선 도약(Saccade) 연속성 감독입니다. JSON으로 설계하세요.",
    `시선/표정 장면 설명: ${cleanSingleLineText(gazeNoteKo, 360) || "주인공이 10시 방향 창가 달빛 아래 상대의 눈에서 손끝 단검으로 시선을 옮기는 클로즈업"}`,
    ClaudeGazeSaccadePupilHighlightLockSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    catchlightClockHour: clampInt(res.parsed.catchlightClockHour, 1, 12, fb.catchlightClockHour),
    binocularVergenceRuleKo: cleanSingleLineText(res.parsed.binocularVergenceRuleKo, 180) || fb.binocularVergenceRuleKo,
    pupilDilationRatioRuleKo: cleanSingleLineText(res.parsed.pupilDilationRatioRuleKo, 180) || fb.pupilDilationRatioRuleKo,
    saccadeTrajectoryRuleKo: cleanSingleLineText(res.parsed.saccadeTrajectoryRuleKo, 180) || fb.saccadeTrajectoryRuleKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}

// 11) 겨울 입김(Breath Frost)·담배 연기·찻잔 수증기 확산 농도·풍향 드리프트 연속성 고정기
export const ClaudeBreathFrostSmokePlumeLockSchema = z.object({
  plumeTypeKo: z.string(),
  windDriftAngleDeg: z.number(),
  opacityDecayRuleKo: z.string(),
  edgeSoftnessRuleKo: z.string(),
  directorNoteKo: z.string(),
});
export type ClaudeBreathFrostSmokePlumeLockOutput = z.infer<typeof ClaudeBreathFrostSmokePlumeLockSchema>;
export type ClaudeBreathFrostSmokePlumeLockView = ClaudeBreathFrostSmokePlumeLockOutput & Wave21RunnerEnvelope;

export function buildDeterministicBreathFrostSmokePlumeLockView(plumeNoteKo = ""): ClaudeBreathFrostSmokePlumeLockView {
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-haiku-5-5",
    plumeTypeKo: cleanSingleLineText(plumeNoteKo, 80) || "겨울 밤하늘 하얀 입김(Breath Frost) + 따뜻한 홍차 수증기 플룸",
    windDriftAngleDeg: 28,
    opacityDecayRuleKo: "입술/찻잔 기점 불투명도 42% (Screen 블렌드) → 15cm 상승 후 18% → 말풍선 텍스트 영역 침범 시 8% 이하 감쇠",
    edgeSoftnessRuleKo: "입김 외곽에 날카로운 먹선 테두리 금지 — 소프트 에어브러시 + 미세 난류(Turbulence) 알파 마스크 적용",
    directorNoteKo: "동일 씬에서 입김과 담배 연기가 머리카락이 휘날리는 주풍향(28도 우상향)과 반대 방향으로 흐르지 않도록 고정하세요.",
    usage: EMPTY_CLAUDE_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runClaudeBreathFrostSmokePlumeLockDirector(
  plumeNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<ClaudeBreathFrostSmokePlumeLockView> {
  const fb = buildDeterministicBreathFrostSmokePlumeLockView(plumeNoteKo);
  const res = await runWave21StructuredRunner(
    "runner:breath-frost-cigarette-smoke-plume-lock",
    "당신은 웹툰 겨울 입김(Breath Frost)·담배 연기·찻잔 수증기 플룸의 풍향 드리프트 각도 및 투명도 감쇠 연속성 감독입니다. JSON으로 설계하세요.",
    `입김/연기 장면 설명: ${cleanSingleLineText(plumeNoteKo, 360) || "영하의 겨울 옥상에서 주인공이 내쉬는 하얀 입김과 담배 연기가 밤바람에 흩어지는 컷"}`,
    ClaudeBreathFrostSmokePlumeLockSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    plumeTypeKo: cleanSingleLineText(res.parsed.plumeTypeKo, 100) || fb.plumeTypeKo,
    windDriftAngleDeg: clampInt(res.parsed.windDriftAngleDeg, -85, 85, fb.windDriftAngleDeg),
    opacityDecayRuleKo: cleanSingleLineText(res.parsed.opacityDecayRuleKo, 180) || fb.opacityDecayRuleKo,
    edgeSoftnessRuleKo: cleanSingleLineText(res.parsed.edgeSoftnessRuleKo, 180) || fb.edgeSoftnessRuleKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}

// 12) 우중(비/수중) 젖은 셔츠·의상 피부 밀착 주름·반투명 투과도·건조 단계 비가역 고정기
export const ClaudeWetFabricRainTranslucencyLockSchema = z.object({
  wetnessStagePct: z.number(),
  skinTranslucencyRuleKo: z.string(),
  clingTensionFoldRuleKo: z.string(),
  albedoDarkeningShiftRuleKo: z.string(),
  irreversibleDryingGuardKo: z.string(),
  directorNoteKo: z.string(),
});
export type ClaudeWetFabricRainTranslucencyLockOutput = z.infer<typeof ClaudeWetFabricRainTranslucencyLockSchema>;
export type ClaudeWetFabricRainTranslucencyLockView = ClaudeWetFabricRainTranslucencyLockOutput & Wave21RunnerEnvelope;

export function buildDeterministicWetFabricRainTranslucencyLockView(wetNoteKo = ""): ClaudeWetFabricRainTranslucencyLockView {
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-sonnet-5-5",
    wetnessStagePct: 85,
    skinTranslucencyRuleKo: cleanSingleLineText(wetNoteKo, 110) || "젖은 흰 셔츠가 쇄골·어깨·견갑골 피부에 밀착되는 영역에서만 피부 웜톤(#E8B4A2)이 32% 반투명하게 투과",
    clingTensionFoldRuleKo: "건조 시의 둥근 볼륨 주름을 제거하고, 물의 중력으로 아래로 처지는 날카로운 세로 잔주름(Micro-Cling Folds)으로 전환",
    albedoDarkeningShiftRuleKo: "젖은 섬유 부위는 건조 상태 고유색 대비 명도(Value) -22%, 채도(Saturation) +12% 어둡고 진하게 고정",
    irreversibleDryingGuardKo: "실내 진입 후 환복하거나 수건으로 닦는 컷이 나오기 전까지 다음 컷에서 셔츠가 갑자기 뽀송하게 마르는 작붕 절대 금지",
    directorNoteKo: "젖은 머리카락 끝단에서 떨어지는 물방울 궤적과 셔츠 어깨의 어두운 수분 흡수 경계선을 전후 컷에서 일치시키세요.",
    usage: EMPTY_CLAUDE_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runClaudeWetFabricRainTranslucencyLockDirector(
  wetNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<ClaudeWetFabricRainTranslucencyLockView> {
  const fb = buildDeterministicWetFabricRainTranslucencyLockView(wetNoteKo);
  const res = await runWave21StructuredRunner(
    "runner:wet-fabric-rain-translucency-drape-lock",
    "당신은 웹툰 우중(비/수중) 젖은 의상의 피부 밀착 주름·반투명 투과도·명도 저하·건조 단계 비가역 연속성 감독입니다. JSON으로 설계하세요.",
    `우중/젖은 의상 설명: ${cleanSingleLineText(wetNoteKo, 360) || "폭우 속에서 우산 없이 대치하는 주인공의 젖은 셔츠와 코트 자락 연출"}`,
    ClaudeWetFabricRainTranslucencyLockSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    wetnessStagePct: clampInt(res.parsed.wetnessStagePct, 10, 100, fb.wetnessStagePct),
    skinTranslucencyRuleKo: cleanSingleLineText(res.parsed.skinTranslucencyRuleKo, 180) || fb.skinTranslucencyRuleKo,
    clingTensionFoldRuleKo: cleanSingleLineText(res.parsed.clingTensionFoldRuleKo, 180) || fb.clingTensionFoldRuleKo,
    albedoDarkeningShiftRuleKo: cleanSingleLineText(res.parsed.albedoDarkeningShiftRuleKo, 180) || fb.albedoDarkeningShiftRuleKo,
    irreversibleDryingGuardKo: cleanSingleLineText(res.parsed.irreversibleDryingGuardKo, 180) || fb.irreversibleDryingGuardKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}

// 13) 야외 태양 방위각(Azimuth)·고도각(Elevation) 기반 인물·건물 바닥 그림자 길이·방향 고정기
export const ClaudeCastShadowSundialAzimuthLockSchema = z.object({
  solarAzimuthDeg: z.number(),
  solarElevationDeg: z.number(),
  shadowLengthMultiplier: z.string(),
  contactUmbraPenumbraRuleKo: z.string(),
  reverseAngleShadowFlipGuardKo: z.string(),
  directorNoteKo: z.string(),
});
export type ClaudeCastShadowSundialAzimuthLockOutput = z.infer<typeof ClaudeCastShadowSundialAzimuthLockSchema>;
export type ClaudeCastShadowSundialAzimuthLockView = ClaudeCastShadowSundialAzimuthLockOutput & Wave21RunnerEnvelope;

export function buildDeterministicCastShadowSundialAzimuthLockView(sunNoteKo = ""): ClaudeCastShadowSundialAzimuthLockView {
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-sonnet-5-5",
    solarAzimuthDeg: 245,
    solarElevationDeg: 22,
    shadowLengthMultiplier: cleanSingleLineText(sunNoteKo, 80) || "오후 5시 석양(고도각 22°) 기준 인물 신장 대비 바닥 그림자 길이 2.47배 고정",
    contactUmbraPenumbraRuleKo: "발바닥 접지점(0~15cm)은 선명한 본그림자(Umbra, 블러 1px) · 머리 끝 그림자(2.4m 거리)는 반그림자(Penumbra, 블러 14px) 적용",
    reverseAngleShadowFlipGuardKo: "카메라가 180도 역앵글로 돌아가면 화면 내 바닥 그림자 방향도 반드시 반대로 투영되어야 함 (화면 기준 고정 금지)",
    directorNoteKo: "3D 배경 건물 그림자 방향(방위각 245°→65°)과 2D 작화 인물의 바닥 그림자 각도가 어긋나는 작붕을 자동 차단하세요.",
    usage: EMPTY_CLAUDE_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runClaudeCastShadowSundialAzimuthLockDirector(
  sunNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<ClaudeCastShadowSundialAzimuthLockView> {
  const fb = buildDeterministicCastShadowSundialAzimuthLockView(sunNoteKo);
  const res = await runWave21StructuredRunner(
    "runner:cast-shadow-sundial-azimuth-elevation-lock",
    "당신은 웹툰 야외 태양 방위각(Azimuth)·고도각(Elevation) 기반 인물 및 건물 바닥 투영 그림자(Cast Shadow) 길이·방향 연속성 감독입니다. JSON으로 설계하세요.",
    `야외 광원/시간대 설명: ${cleanSingleLineText(sunNoteKo, 360) || "석양이 지는 황궁 광장(오후 5시, 고도각 22도)에서 길게 드리워진 두 기사의 바닥 그림자"}`,
    ClaudeCastShadowSundialAzimuthLockSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    solarAzimuthDeg: clampInt(res.parsed.solarAzimuthDeg, 0, 360, fb.solarAzimuthDeg),
    solarElevationDeg: clampInt(res.parsed.solarElevationDeg, 5, 90, fb.solarElevationDeg),
    shadowLengthMultiplier: cleanSingleLineText(res.parsed.shadowLengthMultiplier, 120) || fb.shadowLengthMultiplier,
    contactUmbraPenumbraRuleKo: cleanSingleLineText(res.parsed.contactUmbraPenumbraRuleKo, 180) || fb.contactUmbraPenumbraRuleKo,
    reverseAngleShadowFlipGuardKo: cleanSingleLineText(res.parsed.reverseAngleShadowFlipGuardKo, 180) || fb.reverseAngleShadowFlipGuardKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}

// 14) 전투 타격 바닥 크레이터·벽면 균열·유리 파편 잔해 위치 지속성(원상복구 방지) 고정기
export const ClaudeImpactDebrisCraterPersistenceLockSchema = z.object({
  craterDiameterCm: z.number(),
  radialCrackBranchCount: z.number(),
  debrisPersistenceRuleKo: z.string(),
  backgroundResetPreventionKo: z.string(),
  directorNoteKo: z.string(),
});
export type ClaudeImpactDebrisCraterPersistenceLockOutput = z.infer<typeof ClaudeImpactDebrisCraterPersistenceLockSchema>;
export type ClaudeImpactDebrisCraterPersistenceLockView = ClaudeImpactDebrisCraterPersistenceLockOutput & Wave21RunnerEnvelope;

export function buildDeterministicImpactDebrisCraterPersistenceLockView(craterNoteKo = ""): ClaudeImpactDebrisCraterPersistenceLockView {
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-sonnet-5-5",
    craterDiameterCm: 280,
    radialCrackBranchCount: 9,
    debrisPersistenceRuleKo: cleanSingleLineText(craterNoteKo, 110) || "12컷 대검 내려찍기로 함몰된 대리석 크레이터(직경 2.8m)와 우측 부러진 기둥 잔해를 이후 모든 전투 컷 바닥에 유지",
    backgroundResetPreventionKo: "스케치업/블렌더 3D 원본 배경을 그대로 재렌더링해 파괴된 바닥이나 깨진 창문이 다음 컷에서 새것으로 원상복구되는 작붕 차단",
    directorNoteKo: "배경 파괴 데칼(Crater & Crack Decal)을 3D 씬 바닥 월드 좌표에 베이킹하여 카메라 앵글이 바뀌어도 동일한 위치에 남도록 고정하세요.",
    usage: EMPTY_CLAUDE_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runClaudeImpactDebrisCraterPersistenceLockDirector(
  craterNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<ClaudeImpactDebrisCraterPersistenceLockView> {
  const fb = buildDeterministicImpactDebrisCraterPersistenceLockView(craterNoteKo);
  const res = await runWave21StructuredRunner(
    "runner:impact-debris-crater-shatter-persistence-lock",
    "당신은 액션 웹툰 전투 타격 바닥 크레이터·벽면 보로노이 균열·유리 파편 잔해 위치 지속성(원상복구 작붕 방지) 감독입니다. JSON으로 설계하세요.",
    `전투 파괴 장면 설명: ${cleanSingleLineText(craterNoteKo, 360) || "보스전 일격으로 신전 중앙 바닥이 함몰되고 좌측 석상과 스테인드글라스가 파손된 이후의 연속 컷"}`,
    ClaudeImpactDebrisCraterPersistenceLockSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    craterDiameterCm: clampInt(res.parsed.craterDiameterCm, 30, 5000, fb.craterDiameterCm),
    radialCrackBranchCount: clampInt(res.parsed.radialCrackBranchCount, 3, 36, fb.radialCrackBranchCount),
    debrisPersistenceRuleKo: cleanSingleLineText(res.parsed.debrisPersistenceRuleKo, 180) || fb.debrisPersistenceRuleKo,
    backgroundResetPreventionKo: cleanSingleLineText(res.parsed.backgroundResetPreventionKo, 180) || fb.backgroundResetPreventionKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}

// 15) 무빙툰·오디오툰 3D 바이노럴 폴리(발소리/옷깃/검풍)·대사 사이드체인 더킹(-8dB)·-14 LUFS 마스터 감독
export const ClaudeBinauralSpatialAudioFoleyLufsSchema = z.object({
  binauralPanningMapKo: z.string(),
  foleyLayerStackKo: z.string(),
  dialogueSidechainDuckingDb: z.number(),
  targetIntegratedLufs: z.number(),
  reverbSpaceImpulseKo: z.string(),
  directorNoteKo: z.string(),
});
export type ClaudeBinauralSpatialAudioFoleyLufsOutput = z.infer<typeof ClaudeBinauralSpatialAudioFoleyLufsSchema>;
export type ClaudeBinauralSpatialAudioFoleyLufsView = ClaudeBinauralSpatialAudioFoleyLufsOutput & Wave21RunnerEnvelope;

export function buildDeterministicBinauralSpatialAudioFoleyLufsView(audioNoteKo = ""): ClaudeBinauralSpatialAudioFoleyLufsView {
  return Object.freeze({
    source: "deterministic-fallback", model: "claude-opus-5-5",
    binauralPanningMapKo: cleanSingleLineText(audioNoteKo, 110) || "좌측 화자(L35%) · 우측 화자(R35%) · 참격 궤적(L65% → R70% 0.18초 스윕 패닝)",
    foleyLayerStackKo: "1층 대리석 구두 굽(Footstep) + 2층 가죽 장갑/망토 마찰음(Cloth Rustle) + 3층 검집 금속 발도음(Sheathe Ring)",
    dialogueSidechainDuckingDb: -8,
    targetIntegratedLufs: -14,
    reverbSpaceImpulseKo: "석조 황궁 회랑 컨볼루션 리버브 (RT60 1.8초 · 초기 반사음 Pre-delay 24ms · 2.5kHz 대사 대역 노치 확보)",
    directorNoteKo: "성우 대사 트랙 발화 시 BGM과 폴리 저역대(200~3kHz)를 -8dB 다이내믹 사이드체인 더킹하여 모바일 스피커에서도 대사 전달력을 100% 확보하세요.",
    usage: EMPTY_CLAUDE_TOKEN_USAGE, estimatedUsd: null,
  });
}

export async function runClaudeBinauralSpatialAudioFoleyLufsDirector(
  audioNoteKo: string, runOptions: RunWebtoonProductionAssistOptions = {},
): Promise<ClaudeBinauralSpatialAudioFoleyLufsView> {
  const fb = buildDeterministicBinauralSpatialAudioFoleyLufsView(audioNoteKo);
  const res = await runWave21StructuredRunner(
    "runner:binaural-spatial-audio-foley-lufs-director",
    "당신은 무빙툰·오디오툰·웹툰 PV 3D 바이노럴 폴리(Foley) 사운드·대사 사이드체인 더킹(-8dB)·-14 LUFS 음량 마스터링 감독입니다. JSON으로 설계하세요.",
    `오디오툰/무빙툰 씬 설명: ${cleanSingleLineText(audioNoteKo, 360) || "대성당 회랑에서 발소리가 울리다 검이 맞부딪히고 주인공의 낮은 독백이 흐르는 클라이맥스 씬"}`,
    ClaudeBinauralSpatialAudioFoleyLufsSchema, runOptions,
  );
  if (!res) return fb;
  return Object.freeze({
    source: "claude-live", model: res.actualModel,
    binauralPanningMapKo: cleanSingleLineText(res.parsed.binauralPanningMapKo, 180) || fb.binauralPanningMapKo,
    foleyLayerStackKo: cleanSingleLineText(res.parsed.foleyLayerStackKo, 180) || fb.foleyLayerStackKo,
    dialogueSidechainDuckingDb: clampInt(res.parsed.dialogueSidechainDuckingDb, -18, -2, fb.dialogueSidechainDuckingDb),
    targetIntegratedLufs: clampInt(res.parsed.targetIntegratedLufs, -24, -9, fb.targetIntegratedLufs),
    reverbSpaceImpulseKo: cleanSingleLineText(res.parsed.reverbSpaceImpulseKo, 180) || fb.reverbSpaceImpulseKo,
    directorNoteKo: cleanSingleLineText(res.parsed.directorNoteKo, 200) || fb.directorNoteKo,
    usage: res.usage, estimatedUsd: res.estimatedUsd,
  });
}
