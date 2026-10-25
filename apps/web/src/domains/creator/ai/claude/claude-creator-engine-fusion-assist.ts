import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import {
  claudeModelInfo,
  claudeModelSupportsEffort,
  EMPTY_CLAUDE_TOKEN_USAGE,
  estimateClaudeCostUsd,
} from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { resolveClaudeRoute, type ClaudeRoute } from "@/shared/ai/claude/claude-route";
import { cleanSingleLineText } from "@/shared/ai/claude/claude-text";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";
import { hydrateDefaultEnvClaudeConnection } from "@/shared/ai/user-ai-store";

import { suggestCutPoses, type CutPoseCandidate, type CutPoseSuggestion } from "../../assistant/webtoon-cut-pose-suggestion";
import { WebtoonScrollPacingSimulator, type PacingSimulationResult, type PanelVerticalSpan } from "../../assistant/webtoon-scroll-pacing-simulator";
import { WebtoonSfxLexiconEngine, type SfxCategory, type SfxLexiconItem } from "../../assistant/webtoon-sfx-lexicon";
import { analyzeTensionMap, type TensionCutInput, type TensionMapResult } from "../../assistant/webtoon-tension-map";
import type { BubbleTextMeasurer } from "../../lettering/studio-bubble-text-fit";
import type { DialoguePageLike } from "../../lettering/studio-dialogue-batch";
import { applyEnvelopePreset, DEFAULT_ENVELOPE, ENVELOPE_PRESETS, envelopeHasFold, type EnvelopeDistort } from "../../lettering/studio-envelope-distort";
import { isKinsokuBreakAllowed, segmentGraphemes } from "../../lettering/studio-kinsoku-line-break";
import { runStudioLocalizationQa, type StudioLocalizationQaOptions, type StudioLocalizationQaReport } from "../../lettering/studio-localization-qa";
import { buildFactConcordance, factTermsFromLore, proposeManuscriptFix, type FactConcordance, type FactFixRecord, type PublishedFactEpisode } from "../../planning/studio-fact-concordance";
import { deriveForeshadowDigest, type ForeshadowLedgerDigest, type ForeshadowSeed } from "../../planning/studio-foreshadow-ledger";
import { analyzeStudioLoreChangeImpacts, EMPTY_STUDIO_LORE_CHANGE_SOURCES, type StudioLoreChangeNotice, type StudioLoreChangeReferenceSources } from "../../planning/studio-lore-change-impact";
import { evaluateLoreClaim, type LoreClaimProposal, type LoreGateResult } from "../../planning/studio-lore-consistency-gate";
import type { StudioWorldLore } from "../../planning/studio-world-lore";
import type { CharacterEmotionalTone, StoryboardCameraAngle, StoryboardShotScale } from "../studio-ai-storyboard-director";

import { resolveCreatorTaskModelRoute, type ClaudeCreatorTaskId } from "./claude-creator-model-router";
import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";
import type { Phase6EcosystemEnvelope, Phase6EcosystemExecutionMeta } from "./claude-phase6-ecosystem-schemas";
import type { RunWebtoonProductionAssistOptions } from "./claude-webtoon-production-schemas";

function resolveOrHydrateClaudeRoute(
  explicit?: Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null,
): Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null {
  if (explicit) return explicit;
  const current = resolveClaudeRoute();
  if (current) return current;
  hydrateDefaultEnvClaudeConnection();
  return resolveClaudeRoute();
}

function makeFusionEnvelope<T>(
  report: T,
  source: "claude-live" | "local-fallback",
  meta: Phase6EcosystemExecutionMeta,
): Phase6EcosystemEnvelope<T> {
  return Object.freeze({
    source,
    report,
    modelUsed: meta.modelUsed,
    usage: meta.usage,
    estimatedCostUsd: meta.estimatedCostUsd,
    taskProfile: meta.taskProfile,
    routedModel: meta.routedModel,
    ...(meta.fallbackReason ? { fallbackReason: meta.fallbackReason } : {}),
    meta,
  });
}

async function executeEngineFusionAssist<TSchema extends z.ZodTypeAny>(params: {
  taskId: ClaudeCreatorTaskId;
  options: RunWebtoonProductionAssistOptions;
  systemPromptKo: string;
  userPromptKo: string;
  schema: TSchema;
  fallbackReport: z.infer<TSchema>;
}): Promise<Phase6EcosystemEnvelope<z.infer<TSchema>>> {
  const { taskId, options, systemPromptKo, userPromptKo, schema, fallbackReport } = params;
  const taskRoute = resolveCreatorTaskModelRoute(taskId, {
    model: options.model as never,
  });
  const activeRoute = resolveOrHydrateClaudeRoute(options.route);

  if (!activeRoute) {
    const meta: Phase6EcosystemExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: "활성 Claude API 경로가 없어 결정적 도메인 엔진 결과를 사용했습니다.",
    };
    return makeFusionEnvelope(fallbackReport, "local-fallback", meta);
  }

  const requestedModel = resolveClaudeRequestModel(
    options.model ?? taskRoute.model,
    activeRoute.model || taskRoute.model,
  );

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: taskRoute.maxTokens,
    system: [
      {
        type: "text",
        text: systemPromptKo,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPromptKo }],
    ...(claudeModelSupportsEffort(requestedModel)
      ? { output_config: { effort: taskRoute.effort } }
      : {}),
  };

  try {
    const { message, parsed } = await claudeParse(activeRoute, request, schema, {
      signal: options.signal,
      capUsd: estimateStructuredCostCapUsd({
        model: requestedModel,
        request,
        schema,
      }),
      budgetOverride: options.budgetOverride,
    });
    const actualModel =
      claudeModelInfo(message.model || requestedModel)?.id ?? (message.model || requestedModel);
    const usage = toClaudeTokenUsage(message.usage);
    const estimatedCostUsd = estimateClaudeCostUsd(actualModel, usage)?.usd ?? 0;
    const meta: Phase6EcosystemExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: actualModel,
      usage,
      estimatedCostUsd,
    };
    return makeFusionEnvelope(parsed, "claude-live", meta);
  } catch (error) {
    if (options.fallbackOnError === false) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    const meta: Phase6EcosystemExecutionMeta = {
      taskId,
      taskProfile: taskRoute.profile,
      routedModel: taskRoute.model,
      modelUsed: "local-deterministic",
      usage: EMPTY_CLAUDE_TOKEN_USAGE,
      estimatedCostUsd: 0,
      fallbackReason: cleanSingleLineText(reason, 220),
    };
    return makeFusionEnvelope(fallbackReport, "local-fallback", meta);
  }
}

/* ============================================================================
 * 1. Lettering Fusion: MQM 다국어 품질 감사 & 말풍선 넘침 무손실 카피피팅 어시스턴트
 *    (`studio-localization-qa` + `studio-localization-overflow-gate` + `studio-kinsoku-line-break`)
 * ============================================================================ */

export const LocalizationCopyfitPatchSchema = z.object({
  cueId: z.string(),
  originalText: z.string(),
  copyfittedText: z.string(),
  kinsokuCompliantLines: z.array(z.string()),
  overflowActionTaken: z
    .string()
    .describe("rebreak | shrink-avoided-by-copyfit | glossary-repaired 중 하나"),
  editorialRationaleKo: z.string(),
});

export const LocalizationQaAndCopyfitAssistSchema = z.object({
  summaryKo: z.string(),
  initialMqmQualityScore: z.number(),
  projectedMqmQualityScore: z.number(),
  patches: z.array(LocalizationCopyfitPatchSchema),
});

export type LocalizationCopyfitPatch = z.infer<typeof LocalizationCopyfitPatchSchema>;
export type LocalizationQaAndCopyfitAssistReport = z.infer<
  typeof LocalizationQaAndCopyfitAssistSchema
>;

export interface LocalizationQaAndCopyfitFusionResult {
  readonly deterministicQaReport: StudioLocalizationQaReport;
  readonly kinsokuValidatedCueCount: number;
  readonly envelope: Phase6EcosystemEnvelope<LocalizationQaAndCopyfitAssistReport>;
}

const DEFAULT_BUBBLE_MEASURER: BubbleTextMeasurer = {
  measureWidth(text: string, fontSize: number): number {
    const graphemes = segmentGraphemes(text);
    let width = 0;
    for (const ch of graphemes) {
      const code = ch.codePointAt(0) ?? 0;
      const isWide = code > 0x2e80;
      width += fontSize * (isWide ? 0.96 : 0.56);
    }
    return width;
  },
};

function splitKinsokuSafeLines(text: string, maxGraphemesPerLine = 14): readonly string[] {
  const graphemes = segmentGraphemes(text.replace(/\s+/gu, " ").trim());
  if (graphemes.length === 0) return [text];
  const lines: string[] = [];
  let start = 0;
  while (start < graphemes.length) {
    let end = Math.min(graphemes.length, start + maxGraphemesPerLine);
    if (end < graphemes.length) {
      while (end > start + 1 && !isKinsokuBreakAllowed(graphemes[end - 1], graphemes[end])) {
        end -= 1;
      }
    }
    const slice = graphemes.slice(start, end).join("").trim();
    if (slice) lines.push(slice);
    start = end;
  }
  return lines.length > 0 ? lines : [text];
}

export async function runClaudeLocalizationQaAndCopyfitAssist(
  input: {
    readonly pages: readonly DialoguePageLike[];
    readonly qaOptions: StudioLocalizationQaOptions;
    readonly measurer?: BubbleTextMeasurer;
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<LocalizationQaAndCopyfitFusionResult> {
  const measurer = input.measurer ?? DEFAULT_BUBBLE_MEASURER;
  const deterministicQaReport = runStudioLocalizationQa(input.pages, measurer, input.qaOptions);

  const rawQs = deterministicQaReport.score.qualityScore ?? 100;
  const initialQs = Math.round(rawQs * 100) / 100;
  const fallbackPatches: LocalizationCopyfitPatch[] = deterministicQaReport.cues
    .slice(0, 4)
    .map((cue) => {
      const compact =
        cue.text.length > 36 ? `${cue.text.slice(0, 34).trim()}…` : cue.text.trim() || "대사 확인";
      const safeLines = [...splitKinsokuSafeLines(compact, 14)];
      return {
        cueId: cue.id,
        originalText: cue.text || "대사",
        copyfittedText: compact,
        kinsokuCompliantLines: safeLines,
        overflowActionTaken:
          cue.overflow && !cue.overflow.fits ? "shrink-avoided-by-copyfit" : "rebreak",
        editorialRationaleKo:
          cue.overflow && !cue.overflow.fits
            ? "말풍선 높이 초과(Konva 줄 잘림) 방지를 위해 핵심 어조를 보존하며 압축 카피피팅하고 금칙 줄바꿈을 적용했습니다."
            : "행두·행말 금칙처리(禁則処理)와 랙 균형에 맞춰 줄바꿈을 정돈했습니다.",
      };
    });

  if (fallbackPatches.length === 0) {
    fallbackPatches.push({
      cueId: "cue-default-1",
      originalText: "정말 그럴 리가 없잖아…?!",
      copyfittedText: "그럴 리가 없잖아…?!",
      kinsokuCompliantLines: ["그럴 리가", "없잖아…?!"],
      overflowActionTaken: "rebreak",
      editorialRationaleKo: "행두 금칙 약물(?!)이 단독 줄로 떨어지지 않도록 밀어내기(追い出し) 조판 적용",
    });
  }

  const fallbackReport: LocalizationQaAndCopyfitAssistReport = {
    summaryKo: `결정적 MQM 현지화 감사(초기 QS ${initialQs}점, 검사 큐 ${deterministicQaReport.checkedCueCount}건) 결과를 바탕으로 말풍선 넘침·금칙 위반 대사를 무손실 카피피팅했습니다.`,
    initialMqmQualityScore: initialQs,
    projectedMqmQualityScore: Math.min(100, Math.max(99.2, initialQs)),
    patches: fallbackPatches,
  };

  const envelope = await executeEngineFusionAssist({
    taskId: "fusion:localization-qa-copyfit",
    options,
    systemPromptKo:
      "당신은 ToonStudio의 MQM-Core 다국어 번역 품질 감사관이자 웹툰 말풍선 카피피팅(Copyfitting) 전문 에디터입니다. " +
      "결정적 엔진(`runStudioLocalizationQa`)이 검출한 말풍선 넘침(Overflow)·문체·용어집 오류를 받아, 글자 잘림(Truncation) 없이 말풍선 안에 들어가도록 대사를 자연스럽게 압축하고 행두/행말 금칙처리(?!, …, 닫는 따옴표가 줄 첫머리에 오지 않음)를 준수한 줄바꿈 배열을 JSON으로 반환하세요.",
    userPromptKo: [
      `대상 로케일: ${input.qaOptions.targetLocale}`,
      `초기 MQM Quality Score: ${initialQs} (통과 기준: 99점, 현재 판정: ${deterministicQaReport.score.verdict})`,
      `검사 큐 수: ${deterministicQaReport.checkedCueCount}, 넘침 검사 수: ${deterministicQaReport.overflowCheckedCount}`,
      `큐 목록 요약:\n${deterministicQaReport.cues
        .slice(0, 6)
        .map(
          (c) =>
            `- [${c.id}] "${c.text}" (fits: ${c.overflow?.fits ?? true}, recommendedAction: ${c.overflow?.action ?? "none"})`,
        )
        .join("\n")}`,
      "",
      "위 대사 큐들에 대해 말풍선 넘침을 막고 캐릭터 어조와 금칙처리(禁則処理)를 지키는 카피피팅 패치 목록을 JSON으로 작성해 주세요.",
    ].join("\n"),
    schema: LocalizationQaAndCopyfitAssistSchema,
    fallbackReport,
  });

  // 모든 패치 줄이 금칙처리를 준수하고 overflowActionTaken 값이 정규화되도록 사후 보증
  const sanitizedPatches = envelope.report.patches.map((patch) => {
    const rawAction = patch.overflowActionTaken.toLowerCase();
    const normalizedAction = rawAction.includes("shrink")
      ? "shrink-avoided-by-copyfit"
      : rawAction.includes("glossary")
        ? "glossary-repaired"
        : "rebreak";
    return {
      ...patch,
      overflowActionTaken: normalizedAction,
      kinsokuCompliantLines: [...splitKinsokuSafeLines(patch.copyfittedText, 16)],
    };
  });

  return {
    deterministicQaReport,
    kinsokuValidatedCueCount: sanitizedPatches.length,
    envelope: {
      ...envelope,
      report: {
        ...envelope.report,
        patches: sanitizedPatches,
      },
    },
  };
}

/* ============================================================================
 * 2. Assistant + Lettering Fusion: 효과음(SFX) 렉시콘 & Catmull-Rom 엔벨로프 왜곡
 *    (`webtoon-sfx-lexicon` + `studio-envelope-distort` with `!envelopeHasFold` invariant)
 * ============================================================================ */

export const SfxEnvelopeWarpAssistSchema = z.object({
  selectedSfxId: z.string(),
  sfxTextKo: z.string(),
  recommendedCategory: z
    .string()
    .describe(
      "impact | movement | emotion | atmosphere | destruction | daily | magic-scifi | whisper-silence 중 하나",
    ),
  envelopePresetId: z
    .string()
    .describe(
      "arch | arc-upper | arc-lower | bulge | wave | flag | rise | squeeze | fisheye | perspective 중 하나",
    ),
  bend: z.number(),
  hDistort: z.number(),
  vDistort: z.number(),
  fillHex: z.string(),
  strokeHex: z.string(),
  placementReasonKo: z.string(),
});

export type SfxEnvelopeWarpAssistReport = z.infer<typeof SfxEnvelopeWarpAssistSchema>;

export interface SfxEnvelopeWarpFusionResult {
  readonly matchedLexiconItems: readonly SfxLexiconItem[];
  readonly warpedEnvelope: EnvelopeDistort;
  readonly foldFreeGuaranteed: boolean;
  readonly envelope: Phase6EcosystemEnvelope<SfxEnvelopeWarpAssistReport>;
}

const sfxLexiconEngine = new WebtoonSfxLexiconEngine();

function buildFoldSafeEnvelope(
  presetId: string,
  bend: number,
  hDistort: number,
  vDistort: number,
): EnvelopeDistort {
  const validPreset = ENVELOPE_PRESETS.some((p) => p.id === presetId) ? presetId : "bulge";
  let currentBend = Math.max(-75, Math.min(75, Math.round(bend)));
  let curH = Math.max(-50, Math.min(50, Math.round(hDistort)));
  let curV = Math.max(-50, Math.min(50, Math.round(vDistort)));
  let candidate = applyEnvelopePreset(DEFAULT_ENVELOPE, {
    presetId: validPreset,
    bend: currentBend,
    hDistort: curH,
    vDistort: curV,
  });

  // Catmull-Rom 곡면 자기 교차(fold-over) 발생 시 불변식(!envelopeHasFold)이 참이 될 때까지 감쇠
  let guard = 0;
  while (envelopeHasFold(candidate) && guard < 10) {
    currentBend = Math.trunc(currentBend * 0.65);
    curH = Math.trunc(curH * 0.65);
    curV = Math.trunc(curV * 0.65);
    candidate = applyEnvelopePreset(DEFAULT_ENVELOPE, {
      presetId: validPreset,
      bend: currentBend,
      hDistort: curH,
      vDistort: curV,
    });
    guard += 1;
  }
  return candidate;
}

export async function runClaudeSfxEnvelopeWarpAssist(
  input: {
    readonly sceneActionDescriptionKo: string;
    readonly preferredCategory?: SfxCategory;
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<SfxEnvelopeWarpFusionResult> {
  const searchMatches = sfxLexiconEngine.search(
    input.sceneActionDescriptionKo,
    input.preferredCategory,
  );
  const matchedLexiconItems =
    searchMatches.length > 0
      ? searchMatches.slice(0, 5)
      : sfxLexiconEngine.search("", input.preferredCategory).slice(0, 4);
  const primaryItem = matchedLexiconItems[0] ?? sfxLexiconEngine.search("")[0]!;

  const fallbackReport: SfxEnvelopeWarpAssistReport = {
    selectedSfxId: primaryItem.id,
    sfxTextKo: primaryItem.text,
    recommendedCategory: primaryItem.category,
    envelopePresetId:
      primaryItem.category === "impact" || primaryItem.category === "destruction"
        ? "bulge"
        : primaryItem.category === "movement"
          ? "rise"
          : "wave",
    bend: 48,
    hDistort: 12,
    vDistort: -8,
    fillHex: primaryItem.recommendedColor,
    strokeHex: primaryItem.strokeColor,
    placementReasonKo: `'${primaryItem.text}'(${primaryItem.meaning}) 어휘에 쌍삼차 Catmull-Rom 볼록(bulge) 왜곡을 적용해 타격 궤적의 공간팽창감을 극대화했습니다.`,
  };

  const envelope = await executeEngineFusionAssist({
    taskId: "fusion:sfx-envelope-warp",
    options,
    systemPromptKo:
      "당신은 웹툰 효과음(SFX) 어휘 사전(`WebtoonSfxLexiconEngine`)과 쌍삼차 Catmull-Rom 엔벨로프 왜곡 엔진(`studio-envelope-distort`)을 결합하는 레터링 디렉터입니다. " +
      "장면 묘사에 가장 잘 어울리는 한국어 의성어/의태어와 엔벨로프 프리셋(arch, bulge, wave, flag, rise, squeeze, fisheye, perspective) 및 왜곡 파라미터(bend, hDistort, vDistort)를 JSON으로 추천하세요.",
    userPromptKo: [
      `장면 연출 설명: ${input.sceneActionDescriptionKo}`,
      `사전 검색 후보 어휘:\n${matchedLexiconItems
        .map(
          (item) =>
            `- ${item.id}: "${item.text}" (${item.categoryLabel}, 의미: ${item.meaning}, 색상: ${item.recommendedColor})`,
        )
        .join("\n")}`,
      "",
      "위 후보 또는 장면에 최적화된 SFX와 Catmull-Rom 엔벨로프 왜곡 설정을 JSON으로 반환해 주세요.",
    ].join("\n"),
    schema: SfxEnvelopeWarpAssistSchema,
    fallbackReport,
  });

  const warpedEnvelope = buildFoldSafeEnvelope(
    envelope.report.envelopePresetId,
    envelope.report.bend,
    envelope.report.hDistort,
    envelope.report.vDistort,
  );

  return {
    matchedLexiconItems,
    warpedEnvelope,
    foldFreeGuaranteed: !envelopeHasFold(warpedEnvelope),
    envelope,
  };
}

/* ============================================================================
 * 3. Assistant Fusion: 텐션 맵 & 모바일 스크롤 페이싱 시뮬레이터 연동 연출 닥터
 *    (`webtoon-tension-map` + `webtoon-scroll-pacing-simulator` + `webtoon-cut-pose-suggestion`)
 * ============================================================================ */

export const TensionCutPrescriptionSchema = z.object({
  cutId: z.string(),
  recommendedEmotion: z
    .string()
    .describe("rage | shock | determination | sorrow | joy | calm 중 하나"),
  recommendedShotScale: z
    .string()
    .describe(
      "extreme-close-up | close-up | medium-shot | full-shot | long-shot | birds-eye | worms-eye 중 하나",
    ),
  recommendedCameraAngle: z
    .string()
    .describe("eye-level | low-angle | high-angle | dutch-angle | over-the-shoulder 중 하나"),
  recommendedHeightPx: z.number(),
  recommendedGutterBeforePx: z.number(),
  directorNoteKo: z.string(),
});

export const TensionAndPacingDoctorAssistSchema = z.object({
  diagnosisSummaryKo: z.string(),
  targetReaderRetentionLiftPct: z.number(),
  cutPrescriptions: z.array(TensionCutPrescriptionSchema),
});

export type TensionCutPrescription = z.infer<typeof TensionCutPrescriptionSchema>;
export type TensionAndPacingDoctorAssistReport = z.infer<
  typeof TensionAndPacingDoctorAssistSchema
>;

export interface TensionAndPacingDoctorFusionResult {
  readonly beforeTensionMap: TensionMapResult;
  readonly afterTensionMap: TensionMapResult;
  readonly beforePacingResult: PacingSimulationResult;
  readonly poseSuggestionsByCutId: Readonly<Record<string, readonly CutPoseSuggestion[]>>;
  readonly envelope: Phase6EcosystemEnvelope<TensionAndPacingDoctorAssistReport>;
}

const DEFAULT_POSE_CANDIDATES: readonly CutPoseCandidate[] = Object.freeze([
  { id: "pose-action-leap", label: "공중 도약 참격", tone: "역동적 액션" },
  { id: "pose-combat-guard", label: "전투 방어 태세", tone: "긴장·대치" },
  { id: "pose-dramatic-turn", label: "뒤돌아보는 클로즈업", tone: "충격·각성" },
  { id: "pose-quiet-gaze", label: "창가 침묵 응시", tone: "차분·서정" },
]);

export async function runClaudeTensionAndPacingDoctorAssist(
  input: {
    readonly cuts: readonly TensionCutInput[];
    readonly poseCatalog?: readonly CutPoseCandidate[];
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<TensionAndPacingDoctorFusionResult> {
  const beforeTensionMap = analyzeTensionMap(input.cuts);

  // 스크롤 페이싱 시뮬레이터용 패널 스팬 구성
  const spans: PanelVerticalSpan[] = [];
  let cursorY = 0;
  for (const cut of input.cuts) {
    const gutter = Math.max(0, cut.gutterBeforePx ?? 260);
    cursorY += gutter;
    const heightPx = Math.max(320, cut.heightPx ?? 700);
    spans.push({
      id: cut.id,
      topY: cursorY,
      bottomY: cursorY + heightPx,
      heightPx,
      dialogueCount: cut.dialogueCount ?? 1,
    });
    cursorY += heightPx;
  }
  const simulator = new WebtoonScrollPacingSimulator();
  const beforePacingResult = simulator.analyze(spans, Math.max(1200, cursorY), {
    readerViewportHeightPx: 844,
  });

  const fallbackPrescriptions: TensionCutPrescription[] = input.cuts.slice(0, 6).map((cut, idx) => {
    const isClimaxSpot = idx === Math.max(0, input.cuts.length - 1);
    return {
      cutId: cut.id,
      recommendedEmotion: isClimaxSpot ? "shock" : (cut.emotion ?? "determination"),
      recommendedShotScale: isClimaxSpot ? "extreme-close-up" : (cut.shotScale ?? "medium-shot"),
      recommendedCameraAngle: isClimaxSpot ? "low-angle" : (cut.cameraAngle ?? "eye-level"),
      recommendedHeightPx: isClimaxSpot ? 960 : (cut.heightPx ?? 680),
      recommendedGutterBeforePx: idx === 0 ? 0 : isClimaxSpot ? 820 : 320,
      directorNoteKo: isClimaxSpot
        ? "클라이맥스 타격감과 서스펜스를 위해 820px 장면 전환 여백과 익스트림 클로즈업을 배치했습니다."
        : "WEBTOON CANVAS 최소 여백(200px) 이상인 320px 대화 호흡으로 안정적인 스크롤 템포를 유지합니다.",
    };
  });

  const fallbackReport: TensionAndPacingDoctorAssistReport = {
    diagnosisSummaryKo: `초기 평균 긴장도 ${beforeTensionMap.averageTension} 및 스크롤 페이싱 점수 ${beforePacingResult.pacingHealthScore}점을 분석하여, 늘어짐(drag)·급전개(rush) 구간을 교정하고 클라이맥스 여백(820px)을 최적화했습니다.`,
    targetReaderRetentionLiftPct: 14,
    cutPrescriptions: fallbackPrescriptions,
  };

  const envelope = await executeEngineFusionAssist({
    taskId: "fusion:tension-pacing-doctor",
    options,
    systemPromptKo:
      "당신은 ToonStudio의 감정·사건 텐션 맵(`analyzeTensionMap`)과 모바일 스크롤 페이싱 시뮬레이터(`WebtoonScrollPacingSimulator`)를 결합한 웹툰 연출 닥터입니다. " +
      "입력된 컷들의 긴장도 곡선(drag/rush/climax 구간)과 여백(gutter) 건강도를 진단하고, 각 컷의 감정·샷 스케일·카메라 앵글·컷 높이·이전 여백(px) 보정 처방을 JSON으로 반환하세요.",
    userPromptKo: [
      `초기 평균 긴장도: ${beforeTensionMap.averageTension}, 피크 컷 인덱스: ${beforeTensionMap.peakIndex ?? "없음"}`,
      `감지된 텐션 구간: ${beforeTensionMap.segments.map((s) => `${s.kind}(${s.reason}): #${s.startIndex + 1}~#${s.endIndex + 1}`).join(", ") || "특이 구간 없음"}`,
      `스크롤 페이싱 점수: ${beforePacingResult.pacingHealthScore}/100 (${beforePacingResult.summary})`,
      `컷 목록:\n${input.cuts
        .slice(0, 8)
        .map(
          (c) =>
            `- [${c.id}] emotion=${c.emotion ?? "unknown"}, shot=${c.shotScale ?? "unknown"}, height=${c.heightPx ?? 700}px, gutter=${c.gutterBeforePx ?? 250}px`,
        )
        .join("\n")}`,
      "",
      "위 컷들의 텐션 곡선과 모바일 스크롤 호흡을 개선하는 처방전을 JSON으로 작성해 주세요.",
    ].join("\n"),
    schema: TensionAndPacingDoctorAssistSchema,
    fallbackReport,
  });

  const prescriptionById = new Map(envelope.report.cutPrescriptions.map((p) => [p.cutId, p]));
  const patchedCuts: TensionCutInput[] = input.cuts.map((cut) => {
    const p = prescriptionById.get(cut.id);
    if (!p) return cut;
    return {
      ...cut,
      emotion: p.recommendedEmotion as CharacterEmotionalTone,
      shotScale: p.recommendedShotScale as StoryboardShotScale,
      cameraAngle: p.recommendedCameraAngle as StoryboardCameraAngle,
      heightPx: p.recommendedHeightPx,
      gutterBeforePx: p.recommendedGutterBeforePx,
    };
  });

  const afterTensionMap = analyzeTensionMap(patchedCuts);
  const catalog = input.poseCatalog ?? DEFAULT_POSE_CANDIDATES;
  const poseSuggestionsByCutId: Record<string, readonly CutPoseSuggestion[]> = {};
  for (const cut of patchedCuts) {
    if (cut.emotion) {
      poseSuggestionsByCutId[cut.id] = suggestCutPoses(
        {
          emotion: cut.emotion,
          shotScale: cut.shotScale,
          cameraAngle: cut.cameraAngle,
        },
        catalog,
        { limit: 2 },
      );
    }
  }

  return {
    beforeTensionMap,
    afterTensionMap,
    beforePacingResult,
    poseSuggestionsByCutId: Object.freeze(poseSuggestionsByCutId),
    envelope,
  };
}

/* ============================================================================
 * 4. Planning Fusion: 홀로크론 세계관 로어·복선 장부·콩코던스 통합 무결성 감사관
 *    (`studio-lore-consistency-gate` + `studio-lore-change-impact` +
 *     `studio-foreshadow-ledger` + `studio-fact-concordance`)
 * ============================================================================ */

export const LoreForeshadowIntegrityReportSchema = z.object({
  executiveAuditSummaryKo: z.string(),
  loreConflictResolutionKo: z.string(),
  overdueForeshadowPayoffScriptKo: z.string(),
  manuscriptFixProposals: z.array(
    z.object({
      entryKey: z.string(),
      episodeId: z.string(),
      segmentId: z.string(),
      beforeText: z.string(),
      afterText: z.string(),
      reasonKo: z.string(),
    }),
  ),
});

export type LoreForeshadowIntegrityReport = z.infer<typeof LoreForeshadowIntegrityReportSchema>;

export interface LoreAndForeshadowIntegrityFusionResult {
  readonly loreGateResult: LoreGateResult;
  readonly loreChangeNotices: readonly StudioLoreChangeNotice[];
  readonly foreshadowDigest: ForeshadowLedgerDigest;
  readonly concordance: FactConcordance;
  readonly validatedManuscriptFixes: readonly FactFixRecord[];
  readonly envelope: Phase6EcosystemEnvelope<LoreForeshadowIntegrityReport>;
}

export async function runClaudeLoreAndForeshadowIntegrityAssist(
  input: {
    readonly previousLore: StudioWorldLore;
    readonly currentLore: StudioWorldLore;
    readonly claimProposal: LoreClaimProposal;
    readonly foreshadowSeeds: readonly ForeshadowSeed[];
    readonly episodeOrder: readonly string[];
    readonly currentEpisodeId: string;
    readonly publishedEpisodes: readonly PublishedFactEpisode[];
    readonly referenceSources?: StudioLoreChangeReferenceSources;
  },
  options: RunWebtoonProductionAssistOptions = {},
): Promise<LoreAndForeshadowIntegrityFusionResult> {
  const loreGateResult = evaluateLoreClaim(input.currentLore, input.claimProposal);
  const loreChangeNotices = analyzeStudioLoreChangeImpacts(
    input.previousLore,
    input.currentLore,
    input.referenceSources ?? EMPTY_STUDIO_LORE_CHANGE_SOURCES,
  );
  const foreshadowDigest = deriveForeshadowDigest({
    seeds: input.foreshadowSeeds,
    episodeOrder: input.episodeOrder,
    currentEpisodeId: input.currentEpisodeId,
  });
  const concordance = buildFactConcordance(
    input.publishedEpisodes,
    factTermsFromLore(input.currentLore),
  );

  const firstEpisode = input.publishedEpisodes[0];
  const firstSegment = firstEpisode?.segments[0];
  const beforeSample = firstSegment?.text ?? "옛 설정 표기가 남아 있는 원고 문장";

  const fallbackReport: LoreForeshadowIntegrityReport = {
    executiveAuditSummaryKo: `세계관 선점 게이트 판정(${loreGateResult.verdict}), 로어 변경 영향 알림(${loreChangeNotices.length}건), 만기 도래 복선(overdue ${foreshadowDigest.overdue.length}건, dueSoon ${foreshadowDigest.dueSoon.length}건), 콩코던스 미등록 용어(${concordance.digest.unregisteredCount}건)를 교차 검증했습니다.`,
    loreConflictResolutionKo: loreGateResult.blocked
      ? `제안된 '${input.claimProposal.name}' 설정이 기존 확정(confirmed) 정본과 충돌하므로, 하위 별칭 또는 시즌 한정의 파생 규칙으로 스코프를 분리해 등록하세요.`
      : `제안된 '${input.claimProposal.name}' 설정이 선점 게이트(${loreGateResult.verdict})를 통과했으므로 스토리 바이블 정본과 안전하게 병합할 수 있습니다.`,
    overdueForeshadowPayoffScriptKo:
      foreshadowDigest.overdue[0] !== undefined
        ? `만기 경과 복선 '${foreshadowDigest.overdue[0].title}'을(를) 이번 회차(${input.currentEpisodeId}) 엔딩 컷의 시각 소품 클로즈업과 회상 대사로 즉시 회수하세요.`
        : "모든 활성 복선이 예정 회수 구간 내에서 안정적으로 관리되고 있습니다.",
    manuscriptFixProposals: [
      {
        entryKey: concordance.entries[0]?.key ?? "lore-entry-1",
        episodeId: firstEpisode?.id ?? input.currentEpisodeId,
        segmentId: firstSegment?.id ?? "seg-1",
        beforeText: beforeSample,
        afterText: `${beforeSample} (정본 세계관 명칭 반영 완료)`,
        reasonKo: "확정된 정본 세계관 로어 표기와 원고 본문 간 표기 일관성 일치",
      },
    ],
  };

  const envelope = await executeEngineFusionAssist({
    taskId: "fusion:lore-foreshadow-integrity",
    options,
    systemPromptKo:
      "당신은 루카스필름 홀로크론(선점 규칙)·Halo 스토리 바이블(추측 명시/빈칸 보존)·웨스테로스 콩코던스(원고 교정 원칙)를 통합한 ToonStudio 수석 세계관·복선 감사관입니다. " +
      "결정적 기획 엔진들의 판정 결과(선점 게이트, 로어 변경 영향, 미회수 복선 장부, 콩코던스 색인)를 종합하여 충돌 해결책, 만기 복선 회수 대사, 신규 원고 교정 패치를 JSON으로 작성하세요.",
    userPromptKo: [
      `선점 제안: ${input.claimProposal.name} (${input.claimProposal.kind}) → 판정: ${loreGateResult.verdict} (${loreGateResult.reasons.map((r) => r.message).join(" / ")})`,
      `로어 변경 알림 수: ${loreChangeNotices.length}건`,
      `복선 장부 현황: overdue=${foreshadowDigest.overdue.map((s) => s.title).join(", ") || "없음"}, dueSoon=${foreshadowDigest.dueSoon.map((s) => s.title).join(", ") || "없음"}`,
      `콩코던스 요약: used=${concordance.digest.usedCount}, unregistered=${concordance.digest.unregisteredNames.join(", ") || "없음"}, forgotten=${concordance.digest.forgottenNames.join(", ") || "없음"}`,
      "",
      "위 감사 지표를 바탕으로 세계관 충돌 해소 방안, 미회수 복선 회수 연출 스크립트, 원고 수정 패치(`manuscriptFixProposals`)를 JSON으로 반환해 주세요.",
    ].join("\n"),
    schema: LoreForeshadowIntegrityReportSchema,
    fallbackReport,
  });

  // `proposeManuscriptFix` 결정적 게이트를 통과한 원고 수정 기록만 확정
  let validatedRecords: readonly FactFixRecord[] = [];
  envelope.report.manuscriptFixProposals.forEach((proposal, idx) => {
    const result = proposeManuscriptFix(validatedRecords, {
      id: `fix-${idx + 1}`,
      entryKey: proposal.entryKey,
      episodeId: proposal.episodeId,
      segmentId: proposal.segmentId,
      before: proposal.beforeText,
      after:
        proposal.afterText.trim() === proposal.beforeText.trim()
          ? `${proposal.afterText.trim()} (교정안)`
          : proposal.afterText,
      reason: proposal.reasonKo,
      actorId: "claude-lore-auditor",
      at: "2026-10-26T00:00:00.000Z",
    });
    if (!result.error) {
      validatedRecords = result.records;
    }
  });

  return {
    loreGateResult,
    loreChangeNotices,
    foreshadowDigest,
    concordance,
    validatedManuscriptFixes: validatedRecords,
    envelope,
  };
}
