import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

import { claudeMessageText } from "@/shared/ai/claude/claude-bridge";
import { estimateClaudeRequestCostCapUsd } from "@/shared/ai/claude/claude-cost-cap";
import {
  CLAUDE_DEFAULT_MODEL_ID,
  claudeModelSupportsEffort,
} from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { resolveClaudeRoute, type ClaudeRoute } from "@/shared/ai/claude/claude-route";
import { claudeCreate, claudeParse } from "@/shared/ai/claude/claude-transport";

import {
  findVoiceDeviations,
  type VoiceAttributedLine,
  type VoiceDeviation,
  type VoiceFingerprint,
  type VoicePolitenessLevel,
} from "../../lettering/studio-dialogue-voice";
import {
  evaluateStorylineCliffhangerAndPacing,
  generateEpisodeStorylineArc,
  inferPlotStage,
  recommendStorylineAndDialogues,
  type PlotDevelopmentInput,
  type PlotDevelopmentStageId,
  type RecommendStorylineDialogueOptions,
  type StorylineDialoguePackage,
} from "../../planning/studio-plot-development";
import {
  buildLocalStudioWriterRoomAiDraft,
  buildStudioWriterRoomAiPrompt,
  parseStudioWriterRoomAiDraft,
  type StudioWriterRoomAiDraft,
} from "../../studio-writer-room-ai";
import type { StudioWriterRoomStage } from "../../studio-writer-room";
import { resolveCreatorTaskModelRoute } from "./claude-creator-model-router";
import type { RunWebtoonProductionAssistOptions } from "./claude-webtoon-production-schemas";

function resolveActiveClaudeRoute(
  options: RunWebtoonProductionAssistOptions,
): Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null {
  // 등록한 키가 없으면 관리형 경로(ToonStudio AI)가 돌아오므로 항상 실행할 경로가 있다.
  return options.route !== undefined ? options.route : resolveClaudeRoute();
}

function normalizeScore0To100(raw: number, fallback = 85): number {
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  if (raw <= 1) return Math.round(raw * 100);
  if (raw <= 10) return Math.round(raw * 10);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ── 1. 7단계 Writer's Room AI (Claude + 로컬 결정적 폴백) ──────────────────────

export type ClaudeWriterRoomStageDraftResult<
  Stage extends StudioWriterRoomStage = StudioWriterRoomStage,
> = Extract<StudioWriterRoomAiDraft, { stage: Stage }> & {
  readonly source: "claude" | "local-fallback";
  readonly model: string | null;
};

/**
 * 7단계 Writer's Room(`premise` ~ `dialogue-sfx`)의 후보 초안을 Claude로 생성하고
 * 스키마 검증(`parseStudioWriterRoomAiDraft`)을 통과한 결과를 반환한다.
 * 연결 실패·스키마 불일치 시 `buildLocalStudioWriterRoomAiDraft`로 안전하게 폴백한다.
 */
export async function runClaudeWriterRoomStageDraft<Stage extends StudioWriterRoomStage>(
  input: {
    readonly stage: Stage;
    readonly document: unknown;
    readonly characterContext?: string;
    readonly direction?: string;
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<ClaudeWriterRoomStageDraftResult<Stage>> {
  const localFallback = buildLocalStudioWriterRoomAiDraft(input);
  const activeRoute = resolveActiveClaudeRoute(options);
  if (!activeRoute) {
    return Object.freeze({
      ...localFallback,
      source: "local-fallback" as const,
      model: null,
    }) as ClaudeWriterRoomStageDraftResult<Stage>;
  }

  const requestedModel = resolveClaudeRequestModel(
    options.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
  );
  const prompt = buildStudioWriterRoomAiPrompt(input);
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: 2_200,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    ...(claudeModelSupportsEffort(requestedModel)
      ? { output_config: { effort: "low" as const } }
      : {}),
  };

  try {
    const message = await claudeCreate(activeRoute, params, {
      signal: options.signal,
      capUsd: estimateClaudeRequestCostCapUsd(requestedModel, params),
      budgetOverride: options.budgetOverride,
    });
    const text = claudeMessageText(message).trim();
    const parsed = parseStudioWriterRoomAiDraft(text, input.stage);
    if (!parsed.ok) {
      return Object.freeze({
        ...localFallback,
        source: "local-fallback" as const,
        model: message.model,
      }) as ClaudeWriterRoomStageDraftResult<Stage>;
    }
    return Object.freeze({
      ...parsed.data,
      source: "claude" as const,
      model: message.model,
    }) as ClaudeWriterRoomStageDraftResult<Stage>;
  } catch {
    return Object.freeze({
      ...localFallback,
      source: "local-fallback" as const,
      model: null,
    }) as ClaudeWriterRoomStageDraftResult<Stage>;
  }
}

// ── 2. 플롯 전개 & 기승전결 4막·복선 회수 닥터 (Claude + 로컬 폴백) ──────────────

export const ClaudePlotBranchSchema = z.object({
  id: z.string(),
  title: z.string(),
  storylineBeat: z.string(),
  stageDirection: z.string(),
  recommendedSketchPresetId: z.enum([
    "center-focus",
    "diagonal-action",
    "low-horizon-hero",
    "high-angle-isolation",
    "two-shot-dialogue",
    "split-reaction",
  ]),
  dialogues: z.array(
    z.object({
      speaker: z.string(),
      text: z.string(),
      kind: z.enum(["speech", "narration"]),
      emotion: z.enum(["determination", "shock", "joy", "rage", "sorrow", "calm"]),
      bubbleTip: z.string(),
    }),
  ),
  creatorCoachingTip: z.string(),
  foreshadowPayoffHint: z.string(),
  nextEpisodeSeed: z.string().nullable().optional(),
});

export const ClaudePlotDevelopmentDoctorSchema = z.object({
  inferredStage: z.enum([
    "opening",
    "inciting",
    "escalation",
    "midpoint",
    "complication",
    "crisis",
    "climax",
    "hook",
  ]),
  stageLabel: z.string(),
  branches: z.array(ClaudePlotBranchSchema),
  arc4ActSummary: z.object({
    giTension: z.number(),
    seungTension: z.number(),
    jeonTension: z.number(),
    gyeolTension: z.number(),
    hookPowerScore: z.number(),
    scrollRetentionScore: z.number(),
    nextEpisodeHook: z.string(),
    plotDoctorNotes: z.array(z.string()),
  }),
});

export type ClaudePlotDevelopmentDoctorReport = z.infer<typeof ClaudePlotDevelopmentDoctorSchema>;

export interface ClaudePlotDevelopmentDoctorInput
  extends PlotDevelopmentInput,
    RecommendStorylineDialogueOptions {
  readonly unresolvedForeshadows?: readonly string[];
}

export interface ClaudePlotDevelopmentDoctorResult {
  readonly report: ClaudePlotDevelopmentDoctorReport;
  readonly source: "claude" | "local-fallback";
  readonly model: string | null;
}

export function buildLocalPlotDevelopmentDoctorReport(
  input: ClaudePlotDevelopmentDoctorInput,
): ClaudePlotDevelopmentDoctorReport {
  const stage = inferPlotStage(input.turningPoints);
  const packages: readonly StorylineDialoguePackage[] = recommendStorylineAndDialogues(input, {
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
    dismissedIds: input.dismissedIds,
    limit: input.limit ?? 3,
  });
  const arc = generateEpisodeStorylineArc(input, {
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
  });
  const diag = evaluateStorylineCliffhangerAndPacing(arc);
  const firstForeshadow = input.unresolvedForeshadows?.[0]?.trim();

  const branches = packages.map((pkg, idx) => ({
    id: pkg.id,
    title: pkg.title,
    storylineBeat: pkg.storylineBeat,
    stageDirection: pkg.stageDirection,
    recommendedSketchPresetId: pkg.recommendedSketchPresetId,
    dialogues: pkg.dialogues.map((d) => ({
      speaker: d.speaker,
      text: d.text,
      kind: d.kind,
      emotion: d.emotion,
      bubbleTip: d.bubbleTip,
    })),
    creatorCoachingTip: pkg.creatorCoachingTip,
    foreshadowPayoffHint: firstForeshadow
      ? `미회수 복선 "${firstForeshadow}"의 단서를 ${idx === 0 ? "배경 소품 클로즈업" : "대사 속 의미심장한 키워드"}으로 슬쩍 노출하세요.`
      : `${pkg.stageLabel} 단계에서 회차 후반부 클리프행어로 이어질 시각적 복선 소품을 1컷 배치하세요.`,
    nextEpisodeSeed: pkg.nextEpisodeSeed ?? null,
  }));

  return {
    inferredStage: stage.id as PlotDevelopmentStageId,
    stageLabel: stage.label,
    branches:
      branches.length > 0
        ? branches
        : [
            {
              id: `dev-${stage.id}-fallback`,
              title: `${stage.label} 핵심 전개`,
              storylineBeat: stage.intent,
              stageDirection: `[미디엄샷] ${stage.intent}`,
              recommendedSketchPresetId: "center-focus",
              dialogues: [
                {
                  speaker: input.protagonistName?.trim() || "주인공",
                  text: "여기서 물러설 순 없어. 진실을 확인해야 해.",
                  kind: "speech",
                  emotion: "determination",
                  bubbleTip: "인물 클로즈업 상단에 짧은 결의 대사를 배치하세요.",
                },
              ],
              creatorCoachingTip: `${stage.label} 단계에서는 독자의 시선이 머무는 핵심 감정 컷을 명확히 세우세요.`,
              foreshadowPayoffHint: "초반에 심어둔 복선 키워드를 다시 환기하세요.",
              nextEpisodeSeed: null,
            },
          ],
    arc4ActSummary: {
      giTension: arc.acts[0]?.tensionScore ?? 38,
      seungTension: arc.acts[1]?.tensionScore ?? 66,
      jeonTension: arc.acts[2]?.tensionScore ?? 94,
      gyeolTension: arc.acts[3]?.tensionScore ?? 88,
      hookPowerScore: diag.hookPowerScore,
      scrollRetentionScore: diag.scrollRetentionScore,
      nextEpisodeHook: arc.nextEpisodeHook,
      plotDoctorNotes: [...diag.plotDoctorNotes],
    },
  };
}

export async function runClaudePlotDevelopmentDoctor(
  input: ClaudePlotDevelopmentDoctorInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<ClaudePlotDevelopmentDoctorResult> {
  const localReport = buildLocalPlotDevelopmentDoctorReport(input);
  const activeRoute = resolveActiveClaudeRoute(options);
  if (!activeRoute) {
    return Object.freeze({
      report: localReport,
      source: "local-fallback",
      model: null,
    });
  }

  const requestedModel = resolveClaudeRequestModel(
    options.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
  );

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: 4_096,
    system: [
      {
        type: "text",
        text: "당신은 한국 웹툰 플랫폼(네이버웹툰·카카오페이지) 수석 스토리 PD이자 플롯 닥터입니다. 작가의 현재 기획 상태(장르, 핵심 갈등, 기존 비트, 미회수 복선)를 분석해 다음 전개 선택지 2~3가지(지문·대사·스케치 구도·복선 회수 힌트 포함)와 기·승·전·결 4막 텐션 진단(0~100 정수 점수)을 JSON으로 설계하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          `장르: ${input.genre ?? "판타지"}`,
          `핵심 갈등: ${input.coreConflict ?? "숨겨진 진실과 선택의 대가"}`,
          `로그라인: ${input.logline ?? "없음"}`,
          `현재 비트 목록: ${JSON.stringify(input.turningPoints)}`,
          `주인공/상대역: ${input.protagonistName ?? "주인공"} / ${input.partnerName ?? "상대역"}`,
          `미회수 복선 목록: ${JSON.stringify(input.unresolvedForeshadows ?? [])}`,
          `로컬 추론 단계: ${localReport.inferredStage} (${localReport.stageLabel})`,
        ].join("\n"),
      },
    ],
    ...(claudeModelSupportsEffort(requestedModel)
      ? { output_config: { effort: "low" as const } }
      : {}),
  };

  try {
    const { message, parsed } = await claudeParse(
      activeRoute,
      request,
      ClaudePlotDevelopmentDoctorSchema,
      {
        signal: options.signal,
        capUsd: estimateClaudeRequestCostCapUsd(requestedModel, request),
        budgetOverride: options.budgetOverride,
      },
    );
    const normalizedReport: ClaudePlotDevelopmentDoctorReport = {
      ...parsed,
      arc4ActSummary: {
        ...parsed.arc4ActSummary,
        giTension: normalizeScore0To100(parsed.arc4ActSummary.giTension, 38),
        seungTension: normalizeScore0To100(parsed.arc4ActSummary.seungTension, 66),
        jeonTension: normalizeScore0To100(parsed.arc4ActSummary.jeonTension, 94),
        gyeolTension: normalizeScore0To100(parsed.arc4ActSummary.gyeolTension, 88),
        hookPowerScore: normalizeScore0To100(parsed.arc4ActSummary.hookPowerScore, 90),
        scrollRetentionScore: normalizeScore0To100(parsed.arc4ActSummary.scrollRetentionScore, 88),
      },
    };
    return Object.freeze({
      report: normalizedReport,
      source: "claude",
      model: message.model,
    });
  } catch {
    return Object.freeze({
      report: localReport,
      source: "local-fallback",
      model: null,
    });
  }
}

// ── 3. 캐릭터 말투 지문(Voice Fingerprint) OOC 대사 교정기 ───────────────────

export const ClaudeVoiceRewriteItemSchema = z.object({
  lineId: z.string(),
  originalText: z.string(),
  deviationKind: z.enum(["ending-shift", "length-outlier", "forbidden-phrase", "rhythm-polish"]),
  rewrittenText: z.string(),
  alternativeShortText: z.string(),
  preservedPoliteness: z.enum(["formal", "polite", "plain", "casual", "unknown"]),
  endingUsed: z.string(),
  charCount: z.number(),
  coachingNote: z.string(),
});

export const ClaudeVoiceFingerprintRewriteSchema = z.object({
  characterId: z.string(),
  overallConsistencyScore: z.number(),
  voiceSummaryKo: z.string(),
  rewrites: z.array(ClaudeVoiceRewriteItemSchema),
});

export type ClaudeVoiceFingerprintRewriteReport = z.infer<
  typeof ClaudeVoiceFingerprintRewriteSchema
>;

export interface ClaudeVoiceFingerprintRewriterInput {
  readonly fingerprint: VoiceFingerprint;
  readonly characterName?: string;
  readonly lines: readonly VoiceAttributedLine[];
  readonly maxBubbleChars?: number;
}

export interface ClaudeVoiceFingerprintRewriterResult {
  readonly report: ClaudeVoiceFingerprintRewriteReport;
  readonly detectedDeviations: readonly VoiceDeviation[];
  readonly source: "claude" | "local-fallback";
  readonly model: string | null;
}

const POLITENESS_DEFAULT_ENDING: Readonly<Record<VoicePolitenessLevel, string>> = {
  formal: "습니다",
  polite: "어요",
  plain: "다",
  casual: "어",
  unknown: "다",
};

export function buildLocalVoiceFingerprintRewrites(
  input: ClaudeVoiceFingerprintRewriterInput,
): {
  readonly report: ClaudeVoiceFingerprintRewriteReport;
  readonly detectedDeviations: readonly VoiceDeviation[];
} {
  const maxBubbleChars = input.maxBubbleChars ?? 42;
  const deviations = findVoiceDeviations({
    fingerprint: input.fingerprint,
    lines: input.lines,
  });
  const topEndingStat = input.fingerprint.endingDistribution[0];
  const dominantLevel: VoicePolitenessLevel =
    input.fingerprint.dominantPoliteness?.level ?? topEndingStat?.politeness ?? "casual";
  const preferredEnding = topEndingStat?.ending ?? POLITENESS_DEFAULT_ENDING[dominantLevel];
  const sigPhrase = input.fingerprint.signaturePhrases[0]?.phrase;

  const deviationByLineId = new Map<string, VoiceDeviation>();
  for (const dev of deviations) {
    if (!deviationByLineId.has(dev.lineId)) {
      deviationByLineId.set(dev.lineId, dev);
    }
  }

  const targetLines = input.lines
    .filter((l) => l.speakerId === input.fingerprint.characterId && l.text.trim().length > 0)
    .slice(0, 8);

  const rewrites = (targetLines.length > 0
    ? targetLines
    : [
        {
          id: "line-1",
          text: "오늘 일은 제가 반드시 확인해 보겠습니다.",
          speakerId: input.fingerprint.characterId,
        },
      ]
  ).map((line) => {
    const dev = deviationByLineId.get(line.id);
    const kind: "ending-shift" | "length-outlier" | "forbidden-phrase" | "rhythm-polish" =
      dev?.kind ?? "rhythm-polish";
    let cleaned = line.text.trim();
    for (const forbidden of input.fingerprint.authorRules.forbiddenPhrases) {
      if (forbidden.trim()) {
        cleaned = cleaned.replaceAll(forbidden.trim(), sigPhrase ?? "그건");
      }
    }
    const baseStem = cleaned.replace(/[.!?…]+$/u, "").slice(0, Math.max(12, maxBubbleChars - 6));
    const rewrittenText = `${baseStem} — 끝까지 가 보지(${preferredEnding}).`.slice(
      0,
      maxBubbleChars,
    );
    const alternativeShortText =
      rewrittenText.length > 26 ? `${baseStem.slice(0, 20)}!`.trim() : rewrittenText;

    return {
      lineId: line.id,
      originalText: line.text,
      deviationKind: kind,
      rewrittenText,
      alternativeShortText,
      preservedPoliteness: dominantLevel,
      endingUsed: preferredEnding,
      charCount: rewrittenText.length,
      coachingNote: dev
        ? `${dev.detail} → 대표 어미("${preferredEnding}")와 평균 어절(${input.fingerprint.averageSentenceLength.toFixed(1)}어절) 호흡으로 교정했습니다.`
        : `모바일 말풍선 ${maxBubbleChars}자 예산과 캐릭터 주력 어미("${preferredEnding}")에 맞춰 호흡을 다듬었습니다.`,
    };
  });

  const penalty = deviations.length * 11;
  const overallConsistencyScore = Math.max(45, Math.min(99, 96 - penalty));

  return {
    detectedDeviations: Object.freeze(deviations),
    report: {
      characterId: input.fingerprint.characterId,
      overallConsistencyScore,
      voiceSummaryKo: `${input.characterName ?? input.fingerprint.characterId} 말투 지문(주력 경향: ${dominantLevel}, 대표 어미: "${preferredEnding}", 평균 ${input.fingerprint.averageSentenceLength.toFixed(1)}어절) 기준 ${deviations.length}건의 이탈을 점검했습니다.`,
      rewrites,
    },
  };
}

export async function runClaudeVoiceFingerprintRewriter(
  input: ClaudeVoiceFingerprintRewriterInput,
  options: RunWebtoonProductionAssistOptions = {},
): Promise<ClaudeVoiceFingerprintRewriterResult> {
  const local = buildLocalVoiceFingerprintRewrites(input);
  const activeRoute = resolveActiveClaudeRoute(options);
  if (!activeRoute) {
    return Object.freeze({
      report: local.report,
      detectedDeviations: local.detectedDeviations,
      source: "local-fallback",
      model: null,
    });
  }

  const requestedModel = resolveClaudeRequestModel(
    options.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
  );
  const maxBubbleChars = input.maxBubbleChars ?? 42;

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: 3_200,
    system: [
      {
        type: "text",
        text: "당신은 한국 웹툰 캐릭터 대사 감수자(Dialogue Voice Director)입니다. 제공된 캐릭터의 말투 지문(종결 어미 분포, 주된 높임법, 평균 어절 길이, 대표 표현, 금지 표현)과 이탈 진단 결과를 바탕으로, 캐릭터 붕괴(OOC) 없이 말풍선 가독성 예산(권장 42자 이내)에 딱 맞는 교정 대사와 짧은 대안 대사, 일관성 점수(0~100 정수)를 JSON으로 설계하세요.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          `캐릭터 ID / 이름: ${input.fingerprint.characterId} / ${input.characterName ?? input.fingerprint.characterId}`,
          `주된 말투 경향: ${JSON.stringify(input.fingerprint.dominantPoliteness)}`,
          `상위 종결 어미 분포: ${JSON.stringify(input.fingerprint.endingDistribution.slice(0, 5))}`,
          `평균 문장 길이(어절): ${input.fingerprint.averageSentenceLength.toFixed(1)}`,
          `고정/대표 표현: ${JSON.stringify(input.fingerprint.signaturePhrases.slice(0, 5))}`,
          `작가 지정 금지 표현: ${JSON.stringify(input.fingerprint.authorRules.forbiddenPhrases)}`,
          `감지된 말투 이탈 목록: ${JSON.stringify(local.detectedDeviations)}`,
          `점검 대상 대사 목록: ${JSON.stringify(input.lines.slice(0, 8))}`,
          `모바일 말풍선 권장 최대 글자 수: ${maxBubbleChars}자`,
        ].join("\n"),
      },
    ],
    ...(claudeModelSupportsEffort(requestedModel)
      ? { output_config: { effort: "low" as const } }
      : {}),
  };

  try {
    const { message, parsed } = await claudeParse(
      activeRoute,
      request,
      ClaudeVoiceFingerprintRewriteSchema,
      {
        signal: options.signal,
        capUsd: estimateClaudeRequestCostCapUsd(requestedModel, request),
        budgetOverride: options.budgetOverride,
      },
    );
    const normalizedReport: ClaudeVoiceFingerprintRewriteReport = {
      ...parsed,
      overallConsistencyScore: normalizeScore0To100(parsed.overallConsistencyScore, 90),
      rewrites: parsed.rewrites.map((item) => ({
        ...item,
        charCount: item.rewrittenText.length,
      })),
    };
    return Object.freeze({
      report: normalizedReport,
      detectedDeviations: local.detectedDeviations,
      source: "claude",
      model: message.model,
    });
  } catch {
    return Object.freeze({
      report: local.report,
      detectedDeviations: local.detectedDeviations,
      source: "local-fallback",
      model: null,
    });
  }
}

// ── 4. Wave 11 창의적 웹툰 일관성 AI 엔진 3종 (헤어 실루엣·안경/보석 반사·전투 혈흔/파손 누적) ──

export const ClaudeHairSilhouettePartingLockSchema = z.object({
  characterName: z.string(),
  canonicalPartingSide: z.enum(["left-parting-7-3", "right-parting-7-3", "center-parting-5-5", "full-bangs"]),
  ahogeSignatureAngleDeg: z.number(),
  sideLockCountLeft: z.number(),
  sideLockCountRight: z.number(),
  backHairLengthLandmarkKo: z.string(),
  windElasticityReturnRuleKo: z.string(),
  silhouetteConsistencyScore: z.number(),
});

export type ClaudeHairSilhouettePartingLockReport = z.infer<
  typeof ClaudeHairSilhouettePartingLockSchema
>;

export function buildLocalHairSilhouettePartingLock(input: {
  readonly characterName?: string;
  readonly partingSide?: "left-parting-7-3" | "right-parting-7-3" | "center-parting-5-5" | "full-bangs";
}): ClaudeHairSilhouettePartingLockReport {
  return {
    characterName: input.characterName ?? "세레나",
    canonicalPartingSide: input.partingSide ?? "left-parting-7-3",
    ahogeSignatureAngleDeg: 28,
    sideLockCountLeft: 2,
    sideLockCountRight: 1,
    backHairLengthLandmarkKo: "견갑골 하단(Scapula inferior angle) 5cm 아래에서 일정하게 끝나는 웨이브 기장 고정",
    windElasticityReturnRuleKo:
      "강풍·참격 컷에서도 해부학적 좌측 7:3 가르마 뿌리(Root Anchor)는 이동하지 않으며, 정지 컷 전환 시 즉시 기본 실루엣으로 복원",
    silhouetteConsistencyScore: 96,
  };
}

export async function runClaudeHairSilhouettePartingLockDirector(
  input: {
    readonly characterName?: string;
    readonly partingSide?: "left-parting-7-3" | "right-parting-7-3" | "center-parting-5-5" | "full-bangs";
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<{
  readonly report: ClaudeHairSilhouettePartingLockReport;
  readonly source: "claude" | "local-fallback";
  readonly model: string;
}> {
  const taskRoute = resolveCreatorTaskModelRoute("production:hair-silhouette-ahoge-parting-lock");
  const local = buildLocalHairSilhouettePartingLock(input);
  const activeRoute = resolveActiveClaudeRoute(options);
  if (!activeRoute) {
    return Object.freeze({ report: local, source: "local-fallback", model: taskRoute.model });
  }
  const requestedModel = resolveClaudeRequestModel(options.model ?? taskRoute.model, activeRoute.model || CLAUDE_DEFAULT_MODEL_ID);
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: taskRoute.maxTokens,
    system: "웹툰 캐릭터 헤어 실루엣·가르마 방향·바보털(Ahoge)·옆머리 가닥 수·뒷머리 기장 일관성 규칙을 JSON으로 설계하세요.",
    messages: [{ role: "user", content: `캐릭터: ${local.characterName}, 가르마: ${local.canonicalPartingSide}` }],
  };
  try {
    const { message, parsed } = await claudeParse(activeRoute, request, ClaudeHairSilhouettePartingLockSchema, {
      signal: options.signal,
      capUsd: estimateClaudeRequestCostCapUsd(requestedModel, request),
    });
    return Object.freeze({ report: parsed, source: "claude", model: message.model || requestedModel });
  } catch {
    return Object.freeze({ report: local, source: "local-fallback", model: taskRoute.model });
  }
}

export const ClaudeEyewearJewelryReflectionLockSchema = z.object({
  characterName: z.string(),
  accessorySpecKo: z.string(),
  anatomicalAnchorPointKo: z.string(),
  chainAndTempleContinuityRuleKo: z.string(),
  specularHighlightHex: z.string(),
  gemRefractionBlendMode: z.enum(["Linear Dodge (Add)", "Color Dodge", "Screen"]),
  consistencyScore: z.number(),
});

export type ClaudeEyewearJewelryReflectionLockReport = z.infer<
  typeof ClaudeEyewearJewelryReflectionLockSchema
>;

export function buildLocalEyewearJewelryReflectionLock(input: {
  readonly characterName?: string;
  readonly accessorySpecKo?: string;
}): ClaudeEyewearJewelryReflectionLockReport {
  return {
    characterName: input.characterName ?? "카시안",
    accessorySpecKo: input.accessorySpecKo ?? "오른쪽 금테 모노클 & 좌측 귀 청옥 드롭 이어링",
    anatomicalAnchorPointKo:
      "모노클은 해부학적 우안(Right Orbit) 눈썹뼈와 광대 상단에 고정하고, 금제 체인은 우측 귓바퀴 뒤로만 연결",
    chainAndTempleContinuityRuleKo:
      "측면·후면 컷에서 안경다리(Temple)나 모노클 체인이 공중에 끊기거나 반대쪽 눈으로 미러링되는 현상을 원천 차단",
    specularHighlightHex: "#FFF7CC",
    gemRefractionBlendMode: "Linear Dodge (Add)",
    consistencyScore: 97,
  };
}

export async function runClaudeEyewearJewelryReflectionLockDirector(
  input: { readonly characterName?: string; readonly accessorySpecKo?: string },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<{
  readonly report: ClaudeEyewearJewelryReflectionLockReport;
  readonly source: "claude" | "local-fallback";
  readonly model: string;
}> {
  const taskRoute = resolveCreatorTaskModelRoute("production:eyewear-jewelry-reflection-rig-lock");
  const local = buildLocalEyewearJewelryReflectionLock(input);
  const activeRoute = resolveActiveClaudeRoute(options);
  if (!activeRoute) {
    return Object.freeze({ report: local, source: "local-fallback", model: taskRoute.model });
  }
  const requestedModel = resolveClaudeRequestModel(options.model ?? taskRoute.model, activeRoute.model || CLAUDE_DEFAULT_MODEL_ID);
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: taskRoute.maxTokens,
    system: "웹툰 캐릭터 안경·모노클·귀걸이·티아라 착용 접점(Anchor)과 금속/보석 반사 레이어 일관성을 JSON으로 설계하세요.",
    messages: [{ role: "user", content: `캐릭터: ${local.characterName}, 장신구: ${local.accessorySpecKo}` }],
  };
  try {
    const { message, parsed } = await claudeParse(activeRoute, request, ClaudeEyewearJewelryReflectionLockSchema, {
      signal: options.signal,
      capUsd: estimateClaudeRequestCostCapUsd(requestedModel, request),
    });
    return Object.freeze({ report: parsed, source: "claude", model: message.model || requestedModel });
  } catch {
    return Object.freeze({ report: local, source: "local-fallback", model: taskRoute.model });
  }
}

export const ClaudeCombatBloodstainTatterDecaySchema = z.object({
  characterName: z.string(),
  monotonicDecayVerified: z.boolean(),
  cutDecayStates: z
    .array(
      z.object({
        cutNumber: z.number(),
        bloodSpatterZoneKo: z.string(),
        clothTatterStateKo: z.string(),
        sootAndDustCoveragePct: z.number(),
      }),
    )
    .min(2)
    .max(5),
  resetConditionTriggerKo: z.string(),
});

export type ClaudeCombatBloodstainTatterDecayReport = z.infer<
  typeof ClaudeCombatBloodstainTatterDecaySchema
>;

export function buildLocalCombatBloodstainTatterDecay(input: {
  readonly characterName?: string;
}): ClaudeCombatBloodstainTatterDecayReport {
  return {
    characterName: input.characterName ?? "서진",
    monotonicDecayVerified: true,
    cutDecayStates: [
      {
        cutNumber: 1,
        bloodSpatterZoneKo: "오른쪽 뺨 찰과상 1줄 및 우측 소매 끝단 혈흔(15%)",
        clothTatterStateKo: "검은 망토 우측 하단 12cm 열상 발생",
        sootAndDustCoveragePct: 18,
      },
      {
        cutNumber: 2,
        bloodSpatterZoneKo: "기존 오른뺨 찰과상 유지 + 왼쪽 어깨 갑주 틈새 혈흔 추가(34%)",
        clothTatterStateKo: "우측 하단 열상 유지 + 좌측 소매 팔꿈치 부위 파열 누적",
        sootAndDustCoveragePct: 42,
      },
    ],
    resetConditionTriggerKo:
      "성녀의 치유 마법 시전 컷 또는 숙소 환복 컷이 명시적으로 등장하기 전까지 혈흔·그을음·의상 파열이 다음 컷에서 임의로 깨끗해지지 않도록 비가역(Monotonic) 원장으로 고정",
  };
}

export async function runClaudeCombatBloodstainTatterDecayDirector(
  input: { readonly characterName?: string },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<{
  readonly report: ClaudeCombatBloodstainTatterDecayReport;
  readonly source: "claude" | "local-fallback";
  readonly model: string;
}> {
  const taskRoute = resolveCreatorTaskModelRoute("production:combat-bloodstain-dust-tatter-decay-lock");
  const local = buildLocalCombatBloodstainTatterDecay(input);
  const activeRoute = resolveActiveClaudeRoute(options);
  if (!activeRoute) {
    return Object.freeze({ report: local, source: "local-fallback", model: taskRoute.model });
  }
  const requestedModel = resolveClaudeRequestModel(options.model ?? taskRoute.model, activeRoute.model || CLAUDE_DEFAULT_MODEL_ID);
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: taskRoute.maxTokens,
    system: "웹툰 전투 컷 진행에 따른 혈흔·먼지/그을음·의상 파열의 비가역 누적 원장을 JSON으로 설계하세요.",
    messages: [{ role: "user", content: `캐릭터: ${local.characterName}` }],
  };
  try {
    const { message, parsed } = await claudeParse(activeRoute, request, ClaudeCombatBloodstainTatterDecaySchema, {
      signal: options.signal,
      capUsd: estimateClaudeRequestCostCapUsd(requestedModel, request),
    });
    return Object.freeze({ report: parsed, source: "claude", model: message.model || requestedModel });
  } catch {
    return Object.freeze({ report: local, source: "local-fallback", model: taskRoute.model });
  }
}
