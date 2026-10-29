/**
 * ai-webtoon-storyboard-assist.ts
 *
 * Claude Messages API(구조화 출력 `assistParse`)와 로컬 결정적 마스터 파이프라인을 결합한
 * 웹툰 스토리보드·대사·아트디렉팅·다국어 식자 통합 AI 보조 도우미 모듈.
 *
 * 특징:
 * 1. 사용자가 등록한 키가 없어도 ToonStudio AI 관리형 경로(서버가 운영 고성능 모델 → 무료 모델 순으로 처리)로
 *    별도 설정 없이 즉시 호출 가능. 키를 등록하면 그 키로 실행한다.
 * 2. Claude 구조화 출력(`AiStoryboardAssistSchema`)으로
 *    - 엔딩 클리프행어 훅 한 줄(`cliffhangerHookLine`)
 *    - 캐릭터 관계성 서브텍스트 대사 리라이팅(`subtextDialogueUpgrade`)
 *    - 리얼드로우형 18~85mm 렌즈·4레이어(선화/밑색/명암/3D) 연출 노트(`cutDirectingNotes`)
 *    - 글로벌 K-웹툰(EN/JA/ES) 말풍선 현지화 코칭(`globalLocalizationNotes`)
 *    을 생성하고 검증한다.
 * 3. 오프라인이거나 네트워크 호출이 불가능한 환경에서는 마스터 파이프라인 기반 결정적 폴백을 반환한다.
 */
import { z } from "zod";

import {
  ASSIST_DEFAULT_MODEL_ID,
  assistModelInfo,
  assistModelSupportsEffort,
  EMPTY_ASSIST_TOKEN_USAGE,
  estimateAssistCostUsd,
  type AssistTokenUsage,
} from "@/shared/ai/assist/assist-models";
import { resolveAssistRequestModel } from "@/shared/ai/assist/assist-protocol";
import { resolveAssistRoute, type AssistRoute } from "@/shared/ai/assist/assist-route";
import { cleanSingleLineText } from "@/shared/ai/assist/assist-text";
import { assistParse } from "@/shared/ai/assist/assist-transport";
import { toAssistTokenUsage } from "@/shared/ai/assist/assist-usage-meter";

import {
  runWebtoonStoryboardMasterPipeline,
  type CharacterRelationshipDynamicId,
  type GenvasPosePresetId,
} from "../studio-webtoon-storyboard-pipeline";

import {
  resolveCreatorTaskModelRoute,
  type AssistCreateOptions,
} from "./assist-creator-model-router";
import { estimateStructuredCostCapUsd } from "./assist-feature-cost-cap";

import type { ArtDirectorReview } from "./assist-art-director";
import type { LocalizeResultView } from "./assist-localize";
import type Anthropic from "@anthropic-ai/sdk";

export const AI_STORYBOARD_ASSIST_MAX_OUTPUT_TOKENS = 4_000;

export const AiStoryboardAssistSchema = z.object({
  cliffhangerHookLine: z.string(),
  subtextDialogueUpgrade: z.array(
    z.object({
      speaker: z.string(),
      line: z.string(),
      subtextNote: z.string(),
    }),
  ),
  cutDirectingNotes: z.array(
    z.object({
      cutNumber: z.number(),
      lensMm: z.number(),
      poseAndCameraNote: z.string(),
      fourLayerDirective: z.string(),
    }),
  ),
  globalLocalizationNotes: z.array(z.string()),
});

export type AiStoryboardAssistRaw = z.infer<typeof AiStoryboardAssistSchema>;

export interface AiStoryboardAssistInput {
  readonly genre?: string;
  readonly coreConflict?: string;
  readonly scriptText?: string;
  readonly artistLabel?: string;
  readonly triggerWord?: string;
  readonly relationshipDynamic?: CharacterRelationshipDynamicId;
  readonly posePresetId?: GenvasPosePresetId;
  readonly protagonistName?: string;
  readonly partnerName?: string;
}

export interface AiStoryboardAssistView {
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly cliffhangerHookLine: string;
  readonly subtextDialogueUpgrade: ReadonlyArray<{
    readonly speaker: string;
    readonly line: string;
    readonly subtextNote: string;
  }>;
  readonly cutDirectingNotes: ReadonlyArray<{
    readonly cutNumber: number;
    readonly lensMm: 18 | 28 | 50 | 85;
    readonly poseAndCameraNote: string;
    readonly fourLayerDirective: string;
  }>;
  readonly globalLocalizationNotes: readonly string[];
  readonly usage: AssistTokenUsage;
  readonly estimatedUsd: number | null;
}

const SYSTEM_PROMPT = [
  "당신은 한국 웹툰 스튜디오의 수석 스토리보드 PD이자 대사 스크립트 닥터입니다.",
  "제작자의 기획·대본·화풍 설정을 바탕으로 즉시 콘티에 반영할 수 있는 고밀도 연출·대사 보강안을 JSON으로 답하세요.",
  "",
  "원칙",
  "- cliffhangerHookLine: 1화 엔딩에서 독자가 다음 화를 결제·스크롤하게 만드는 강렬한 한 줄 대사 또는 나레이션(80자 이내).",
  "- subtextDialogueUpgrade: 캐릭터 관계성 텐션과 행간(subtext)이 살아 있는 2~4줄의 티키타카 대사와 연출 의도.",
  "- cutDirectingNotes: 주요 컷(최대 4컷)의 카메라 초점거리(18, 28, 50, 85 중 하나), 포즈·앵글 지시, 4레이어(L1 3D배경 / L2 밑색 / L3 명암 / L4 선화) 분업 지시.",
  "- globalLocalizationNotes: 영어(EN)·일본어(JA 세로쓰기)·스페인어(ES) 말풍선 번역 팽창률 및 현지화 유의점 2~3개.",
  "- 모든 설명은 한국어 해요체 또는 간결한 프로덕션 노트 문체로 작성하세요.",
].join("\n");

function normalizeLensMm(raw: number): 18 | 28 | 50 | 85 {
  if (raw <= 22) return 18;
  if (raw <= 38) return 28;
  if (raw <= 68) return 50;
  return 85;
}

export function buildAiStoryboardAssistRequest(
  model: string,
  input: AiStoryboardAssistInput,
): Anthropic.MessageCreateParamsNonStreaming {
  const genre = cleanSingleLineText(input.genre ?? "판타지", 40) || "판타지";
  const conflict =
    cleanSingleLineText(input.coreConflict ?? "봉인된 기억의 각성과 세계의 균열", 160) ||
    "봉인된 기억의 각성과 세계의 균열";
  const artistLabel = cleanSingleLineText(input.artistLabel ?? "K-웹툰 작가 화풍", 60);
  const triggerWord = cleanSingleLineText(input.triggerWord ?? "custom_artist_style", 60);
  const scriptSnippet = cleanSingleLineText(input.scriptText ?? "", 500);

  const userLines = [
    `장르: ${genre}`,
    `핵심 갈등: ${conflict}`,
    `작가 화풍 모델: ${artistLabel} (${triggerWord})`,
    `캐릭터 관계성: ${input.relationshipDynamic ?? "fated-rivals"}`,
    `대표 포즈 프리셋: ${input.posePresetId ?? "pose-dynamic-slash"}`,
    ...(scriptSnippet ? [`현재 대본 초안: ${scriptSnippet}`] : []),
    "",
    "위 설정을 바탕으로 웹툰 스토리보드·대사·4레이어 연출 보강안을 JSON으로 작성해 주세요.",
  ];

  return {
    model,
    max_tokens: AI_STORYBOARD_ASSIST_MAX_OUTPUT_TOKENS,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userLines.join("\n") }],
    ...(assistModelSupportsEffort(model) ? { output_config: { effort: "low" as const } } : {}),
  };
}

export function normalizeAiStoryboardAssist(
  raw: AiStoryboardAssistRaw,
  model: string,
  usage: AssistTokenUsage = EMPTY_ASSIST_TOKEN_USAGE,
  source: "claude-live" | "deterministic-fallback" = "claude-live",
): AiStoryboardAssistView {
  const cliffhangerHookLine =
    cleanSingleLineText(raw.cliffhangerHookLine ?? "", 160) ||
    "가장 믿었던 동료의 그림자 속에서 봉인된 진실이 눈을 뜬다.";

  const subtextDialogueUpgrade = (raw.subtextDialogueUpgrade ?? [])
    .slice(0, 4)
    .map((item) => ({
      speaker: cleanSingleLineText(item.speaker ?? "", 40) || "주인공",
      line: cleanSingleLineText(item.line ?? "", 140),
      subtextNote: cleanSingleLineText(item.subtextNote ?? "", 140),
    }))
    .filter((item) => item.line.length > 0);

  const cutDirectingNotes = (raw.cutDirectingNotes ?? []).slice(0, 4).map((item, idx) => ({
    cutNumber: Number.isFinite(item.cutNumber) ? Math.max(1, Math.round(item.cutNumber)) : idx + 1,
    lensMm: normalizeLensMm(item.lensMm),
    poseAndCameraNote: cleanSingleLineText(item.poseAndCameraNote ?? "", 180),
    fourLayerDirective: cleanSingleLineText(item.fourLayerDirective ?? "", 180),
  }));

  const globalLocalizationNotes = (raw.globalLocalizationNotes ?? [])
    .map((note) => cleanSingleLineText(note ?? "", 180))
    .filter(Boolean)
    .slice(0, 3);

  return Object.freeze({
    source,
    model: assistModelInfo(model)?.id ?? model,
    cliffhangerHookLine,
    subtextDialogueUpgrade: Object.freeze(subtextDialogueUpgrade),
    cutDirectingNotes: Object.freeze(cutDirectingNotes),
    globalLocalizationNotes: Object.freeze(globalLocalizationNotes),
    usage,
    estimatedUsd: estimateAssistCostUsd(model, usage)?.usd ?? null,
  });
}

/**
 * 네트워크 호출 없이도 즉시 동작하는 결정적(Deterministic) 스토리보드 보조 코칭 생성기.
 */
export function buildDeterministicStoryboardAssistFallback(
  input: AiStoryboardAssistInput = {},
): AiStoryboardAssistView {
  const master = runWebtoonStoryboardMasterPipeline({
    scriptText: input.scriptText,
    storylineInput: {
      genre: input.genre,
      coreConflict: input.coreConflict,
    },
    relationshipDynamic: input.relationshipDynamic,
    posePresetId: input.posePresetId,
    protagonistName: input.protagonistName,
    partnerName: input.partnerName,
  });

  const raw: AiStoryboardAssistRaw = {
    cliffhangerHookLine: master.storylineArc.nextEpisodeHook,
    subtextDialogueUpgrade: master.dialogueExchange.beats.map((beat) => ({
      speaker: beat.speaker,
      line: beat.text,
      subtextNote: `${master.fabulatorNarrativeChain.relationshipLabel} · SFX(${beat.suggestedSfx})`,
    })),
    cutDirectingNotes: master.enrichedCuts.slice(0, 3).map((item) => ({
      cutNumber: item.cutPlan.cutNumber,
      lensMm: item.productionLayers.lensFocalLengthMm,
      poseAndCameraNote: `${item.cutPlan.shotScale} / ${item.cutPlan.cameraAngle} · ${master.genvasCharacterPoseLock.posePreset.foreshorteningGuide}`,
      fourLayerDirective: item.productionLayers.layers
        .map((l) => `${l.layerLabelKo}(${l.blendMode})`)
        .join(" + "),
    })),
    globalLocalizationNotes: [
      "영문(EN)·스페인어(ES) 번역 시 35~42% 글자 폭 팽창에 대비해 말풍선 좌우 패딩을 확보하세요.",
      "일본어(JA) 라인망가·픽코마 연재용 세로쓰기(타테구미)를 위해 세로 타원형 말풍선 비율을 유지하세요.",
    ],
  };

  return normalizeAiStoryboardAssist(
    raw,
    "claude-haiku-5-5",
    EMPTY_ASSIST_TOKEN_USAGE,
    "deterministic-fallback",
  );
}

export interface RunAiStoryboardAssistOptions {
  readonly route?: Pick<AssistRoute, "apiKey" | "revision" | "model"> | null;
  readonly model?: string;
  readonly signal?: AbortSignal;
  readonly budgetOverride?: boolean;
  readonly fallbackOnError?: boolean;
}

/**
 * Claude 구조화 출력(`assistParse`)을 통해 스토리보드·대사·4레이어 연출 코칭을 실행한다.
 * 등록한 키가 없으면 ToonStudio AI 관리형 경로로 실행하고,
 * `fallbackOnError !== false`이면 오류 시 결정적 폴백으로 안전하게 복구한다.
 */
export async function runAiWebtoonStoryboardAssist(
  input: AiStoryboardAssistInput,
  options: RunAiStoryboardAssistOptions = {},
): Promise<AiStoryboardAssistView> {
  const activeRoute = options.route ?? resolveAssistRoute();
  if (!activeRoute) {
    if (options.fallbackOnError !== false) {
      return buildDeterministicStoryboardAssistFallback(input);
    }
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }

  const requestedModel = resolveAssistRequestModel(
    options.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request = buildAiStoryboardAssistRequest(requestedModel, input);

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AiStoryboardAssistSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AiStoryboardAssistSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return normalizeAiStoryboardAssist(parsed, actualModel, usage, "claude-live");
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicStoryboardAssistFallback(input);
    }
    throw error;
  }
}

export interface ArtDirectorLayerActionItem {
  readonly issueId: string;
  readonly targetLayerId: "background-3d" | "base-flat-color" | "cel-shading-light" | "line-art-ink";
  readonly targetLayerLabelKo: string;
  readonly actionSummaryKo: string;
}

/**
 * AI 아트 디렉터(`ArtDirectorReview`)의 이슈 목록을 리얼드로우(RealDraw) 4레이어 공정별 수정 지시로 매핑한다.
 */
export function mapArtDirectorIssuesToProductionLayers(
  review: Pick<ArtDirectorReview, "issues">,
): readonly ArtDirectorLayerActionItem[] {
  return Object.freeze(
    review.issues.map((issue): ArtDirectorLayerActionItem => {
      if (
        issue.category === "perspective" ||
        issue.category === "composition" ||
        issue.category === "pacing"
      ) {
        return {
          issueId: issue.id,
          targetLayerId: "background-3d",
          targetLayerLabelKo: "L1. 3D·배경 카메라 레이어",
          actionSummaryKo: `[${issue.title}] ${issue.fix}`,
        };
      }
      if (issue.category === "color") {
        return {
          issueId: issue.id,
          targetLayerId: "base-flat-color",
          targetLayerLabelKo: "L2. 밑색 분리 레이어 (Flat ID)",
          actionSummaryKo: `[${issue.title}] ${issue.fix}`,
        };
      }
      if (issue.category === "contrast") {
        return {
          issueId: issue.id,
          targetLayerId: "cel-shading-light",
          targetLayerLabelKo: "L3. 명암·조명 레이어 (Shading & Rim)",
          actionSummaryKo: `[${issue.title}] ${issue.fix}`,
        };
      }
      return {
        issueId: issue.id,
        targetLayerId: "line-art-ink",
        targetLayerLabelKo: "L4. 마스터 선화·식자 레이어",
        actionSummaryKo: `[${issue.title}] ${issue.fix}`,
      };
    }),
  );
}

export interface LocalizeWebtoonBubbleHealth {
  readonly totalLines: number;
  readonly mobileSafeLineCount: number;
  readonly mobileOverflowLineIndices: readonly number[];
  readonly readinessScore: number;
}

/**
 * AI 번역·현지화(`LocalizeResultView`) 결과가 모바일 말풍선 가독성 기준(1말풍선 표시폭 56칸 이내)에 적합한지 평가한다.
 */
export function evaluateLocalizeWebtoonBubbleHealth(
  view: Pick<LocalizeResultView, "lines">,
): LocalizeWebtoonBubbleHealth {
  const totalLines = view.lines.length;
  if (totalLines === 0) {
    return Object.freeze({
      totalLines: 0,
      mobileSafeLineCount: 0,
      mobileOverflowLineIndices: Object.freeze([]),
      readinessScore: 100,
    });
  }
  const mobileOverflowLineIndices: number[] = [];
  for (const line of view.lines) {
    const candidate = line.shorter ?? line.translation;
    if ([...candidate].length > 42) {
      mobileOverflowLineIndices.push(line.index);
    }
  }
  const mobileSafeLineCount = totalLines - mobileOverflowLineIndices.length;
  const readinessScore = Math.max(
    0,
    Math.min(100, Math.round((mobileSafeLineCount / totalLines) * 100)),
  );
  return Object.freeze({
    totalLines,
    mobileSafeLineCount,
    mobileOverflowLineIndices: Object.freeze(mobileOverflowLineIndices),
    readinessScore,
  });
}

/* ============================================================================
 * Wave 10: 컷 테두리·사선 프레임·여백(Gutter) 그라데이션 연속성 디렉터
 *          & 손가락 관절 해부학·소품 파지(Grip) 양손 연속성 고정기
 * ============================================================================ */

export const AssistPanelBorderGutterLockSchema = z.object({
  sequenceTitleKo: z.string(),
  overallTensionCurveScore: z.number(),
  panelBorderSpecs: z
    .array(
      z.object({
        cutNumber: z.number(),
        frameStyle: z.enum([
          "rectangular-standard",
          "diagonal-slash-cut",
          "frameless-full-bleed",
          "overlapping-inset",
          "shattered-impact-frame",
        ]),
        borderThicknessPx: z.number(),
        diagonalTiltDeg: z.number(),
        popOutBreakthroughElementKo: z.string(),
        gutterHeightPx: z.number(),
        gutterGradientFromHex: z.string(),
        gutterGradientToHex: z.string(),
      }),
    )
    .min(2)
    .max(6),
  scrollTransitionNoteKo: z.string(),
});

export type AssistPanelBorderGutterLockView = z.infer<
  typeof AssistPanelBorderGutterLockSchema
> & {
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly taskId: "production:panel-border-gutter-tension-lock";
};

export interface PanelBorderGutterLockInput {
  readonly sceneSummaryKo: string;
  readonly cutCount?: number;
  readonly peakTensionCutIndex?: number;
  readonly moodMode?: "daylight-romance" | "abyss-combat" | "flashback-fade";
}

export function buildDeterministicPanelBorderGutterLock(
  input: PanelBorderGutterLockInput,
): AssistPanelBorderGutterLockView {
  const cutCount = Math.max(2, Math.min(6, input.cutCount ?? 3));
  const peakIdx = input.peakTensionCutIndex ?? 2;
  const isDark = (input.moodMode ?? "abyss-combat") === "abyss-combat";
  const panelBorderSpecs = Array.from({ length: cutCount }, (_, idx) => {
    const cutNumber = idx + 1;
    const isPeak = cutNumber === peakIdx;
    return {
      cutNumber,
      frameStyle: isPeak
        ? ("diagonal-slash-cut" as const)
        : cutNumber === cutCount
          ? ("frameless-full-bleed" as const)
          : ("rectangular-standard" as const),
      borderThicknessPx: isPeak ? 4 : cutNumber === cutCount ? 0 : 2,
      diagonalTiltDeg: isPeak ? -14 : 0,
      popOutBreakthroughElementKo: isPeak
        ? "검기 궤적과 캐릭터 앞머리가 상단 컷 테두리 바깥 여백으로 48px 돌파(Z-Index Pop-Out)"
        : "패널 내부 표준 마스킹 유지",
      gutterHeightPx: isPeak ? 260 : 160,
      gutterGradientFromHex: isDark ? "#111318" : "#FFFFFF",
      gutterGradientToHex: isPeak ? "#050608" : isDark ? "#1B1F2A" : "#F5F3FF",
    };
  });

  return Object.freeze({
    source: "deterministic-fallback",
    model: "claude-haiku-5-5",
    taskId: "production:panel-border-gutter-tension-lock",
    sequenceTitleKo: cleanSingleLineText(input.sceneSummaryKo, 120) || "클라이맥스 사선 컷 & 여백 암전 시퀀스",
    overallTensionCurveScore: 95,
    panelBorderSpecs,
    scrollTransitionNoteKo:
      "클라이맥스 타격 컷에서 -14° 사선 프레임과 260px 암전 그라데이션 여백(Gutter)을 결합해 모바일 스크롤 체류 시간을 극대화합니다.",
  });
}

export async function runAssistPanelBorderGutterTensionDirector(
  input: PanelBorderGutterLockInput,
  options: AssistCreateOptions & {
    readonly route?: AssistRoute | null;
    readonly fallbackOnError?: boolean;
    readonly signal?: AbortSignal;
  } = {},
): Promise<AssistPanelBorderGutterLockView> {
  const taskRoute = resolveCreatorTaskModelRoute(
    "production:panel-border-gutter-tension-lock",
    options,
  );
  const activeRoute = options.route ?? resolveAssistRoute();
  if (!activeRoute) {
    if (options.fallbackOnError !== false) {
      return buildDeterministicPanelBorderGutterLock(input);
    }
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }

  const requestedModel = resolveAssistRequestModel(
    taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: taskRoute.maxTokens,
    system:
      "당신은 한국 웹툰 연출 감독입니다. 컷별 프레임 형태(직사각형/사선/프레임리스/오버랩), 테두리 두께(px), 사선 각도(deg), 컷 밖 돌출(Pop-out) 요소, 컷간 여백(Gutter) 그라데이션 HEX를 JSON으로 설계하세요.",
    messages: [
      {
        role: "user",
        content: `장면: ${input.sceneSummaryKo}\n컷 수: ${input.cutCount ?? 3}\n최고조 컷 번호: ${input.peakTensionCutIndex ?? 2}\n무드: ${input.moodMode ?? "abyss-combat"}`,
      },
    ],
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistPanelBorderGutterLockSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistPanelBorderGutterLockSchema,
        }),
      },
    );
    return Object.freeze({
      ...parsed,
      source: "claude-live",
      model: message.model || requestedModel,
      taskId: "production:panel-border-gutter-tension-lock",
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicPanelBorderGutterLock(input);
    }
    throw error;
  }
}

export const AssistHandPropGripLockSchema = z.object({
  characterName: z.string(),
  propNameKo: z.string(),
  dominantHand: z.enum(["right-hand", "left-hand", "two-handed"]),
  anatomyConsistencyScore: z.number(),
  cutGripDirectives: z
    .array(
      z.object({
        cutNumber: z.number(),
        activeHand: z.enum(["right-hand", "left-hand", "two-handed"]),
        gripArchetype: z.enum([
          "sword-saber-hammer-grip",
          "teacup-delicate-pinch",
          "smartphone-onehand-cradle",
          "bowstring-three-finger-draw",
          "spellbook-open-palm-support",
        ]),
        thumbAndIndexArticulationKo: z.string(),
        wristAngleDeg: z.number(),
        propContactAnchorKo: z.string(),
        negativeAnatomyGuardPrompt: z.string(),
      }),
    )
    .min(2)
    .max(5),
  mirroringPreventionRuleKo: z.string(),
});

export type AssistHandPropGripLockView = z.infer<typeof AssistHandPropGripLockSchema> & {
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly taskId: "production:hand-prop-grip-anatomy-continuity-lock";
};

export interface HandPropGripLockInput {
  readonly characterName: string;
  readonly propNameKo: string;
  readonly dominantHand?: "right-hand" | "left-hand" | "two-handed";
  readonly cutActionsKo?: readonly string[];
}

export function buildDeterministicHandPropGripLock(
  input: HandPropGripLockInput,
): AssistHandPropGripLockView {
  const dominantHand = input.dominantHand ?? "right-hand";
  const actions =
    input.cutActionsKo && input.cutActionsKo.length >= 2
      ? input.cutActionsKo
      : ["검자루를 뽑아 정안세로 겨눔", "대각선 참격 후 검을 거두며 손목 회전"];
  const isTea = /찻잔|티컵|잔|와인/.test(input.propNameKo);
  const isPhone = /스마트폰|휴대폰|폰/.test(input.propNameKo);
  const gripArchetype = isTea
    ? ("teacup-delicate-pinch" as const)
    : isPhone
      ? ("smartphone-onehand-cradle" as const)
      : ("sword-saber-hammer-grip" as const);

  return Object.freeze({
    source: "deterministic-fallback",
    model: "claude-sonnet-5-5",
    taskId: "production:hand-prop-grip-anatomy-continuity-lock",
    characterName: cleanSingleLineText(input.characterName, 80) || "강하준",
    propNameKo: cleanSingleLineText(input.propNameKo, 80) || "청류검(장검)",
    dominantHand,
    anatomyConsistencyScore: 97,
    cutGripDirectives: actions.slice(0, 4).map((action, idx) => ({
      cutNumber: idx + 1,
      activeHand: dominantHand,
      gripArchetype,
      thumbAndIndexArticulationKo: `${action} — 엄지 첫마디(IP joint)가 검지 두 번째 마디 위를 감싸 쥐고 새끼손가락이 자루 하단 폼멜을 견고히 지지(5지 관절 고정)`,
      wristAngleDeg: idx % 2 === 0 ? 15 : -22,
      propContactAnchorKo: `${input.propNameKo || "소품"} 무게중심 축이 손바닥 생명선 홈(Thenar crease)을 관통하도록 접점 잠금`,
      negativeAnatomyGuardPrompt:
        "extra fingers, 6 fingers, polydactyly, fused knuckles, backwards thumb, floating sword hilt, mirrored left-right hand swap",
    })),
    mirroringPreventionRuleKo: `${input.characterName || "캐릭터"}의 주사용 손(${dominantHand})을 전 컷 고정하며, 카메라가 180도 회전해도 해부학적 오른손/왼손 반전이 발생하지 않도록 엄지 방향(내측/외측)을 잠급니다.`,
  });
}

export async function runAssistHandPropGripAnatomyDirector(
  input: HandPropGripLockInput,
  options: AssistCreateOptions & {
    readonly route?: AssistRoute | null;
    readonly fallbackOnError?: boolean;
    readonly signal?: AbortSignal;
  } = {},
): Promise<AssistHandPropGripLockView> {
  const taskRoute = resolveCreatorTaskModelRoute(
    "production:hand-prop-grip-anatomy-continuity-lock",
    options,
  );
  const activeRoute = options.route ?? resolveAssistRoute();
  if (!activeRoute) {
    if (options.fallbackOnError !== false) {
      return buildDeterministicHandPropGripLock(input);
    }
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }

  const requestedModel = resolveAssistRequestModel(
    taskRoute.model,
    activeRoute.model || ASSIST_DEFAULT_MODEL_ID,
  );
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: taskRoute.maxTokens,
    system:
      "당신은 웹툰 인체 해부학·작화 감독입니다. AI 생성 시 흔히 발생하는 육손/손가락 기형과 컷간 왼손·오른손 반전을 막기 위해, 컷별 5손가락 관절 파지법(Grip)과 소품 접점, 네거티브 가드 프롬프트를 JSON으로 설계하세요.",
    messages: [
      {
        role: "user",
        content: `캐릭터: ${input.characterName}\n소품: ${input.propNameKo}\n주사용 손: ${input.dominantHand ?? "right-hand"}\n컷별 동작: ${(input.cutActionsKo ?? []).join(" -> ") || "소품 파지 후 연속 액션"}`,
      },
    ],
  };

  try {
    const { message, parsed } = await assistParse(
      activeRoute,
      request,
      AssistHandPropGripLockSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: AssistHandPropGripLockSchema,
        }),
      },
    );
    return Object.freeze({
      ...parsed,
      source: "claude-live",
      model: message.model || requestedModel,
      taskId: "production:hand-prop-grip-anatomy-continuity-lock",
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return buildDeterministicHandPropGripLock(input);
    }
    throw error;
  }
}
