/**
 * claude-webtoon-storyboard-assist.ts
 *
 * Claude Messages API(구조화 출력 `claudeParse`)와 로컬 결정적 마스터 파이프라인을 결합한
 * 웹툰 스토리보드·대사·아트디렉팅·다국어 식자 통합 AI 보조 도우미 모듈.
 *
 * 특징:
 * 1. 로컬 `.env*`에 설정된 Claude API 키(`ANTHROPIC_API_KEY` / `VITE_ANTHROPIC_API_KEY` 등)를
 *    `hydrateDefaultEnvClaudeConnection()`으로 자동 인식해 별도 설정 없이도 즉시 호출 가능.
 * 2. Claude 구조화 출력(`ClaudeStoryboardAssistSchema`)으로
 *    - 엔딩 클리프행어 훅 한 줄(`cliffhangerHookLine`)
 *    - 캐릭터 관계성 서브텍스트 대사 리라이팅(`subtextDialogueUpgrade`)
 *    - 리얼드로우형 18~85mm 렌즈·4레이어(선화/밑색/명암/3D) 연출 노트(`cutDirectingNotes`)
 *    - 글로벌 K-웹툰(EN/JA/ES) 말풍선 현지화 코칭(`globalLocalizationNotes`)
 *    을 생성하고 검증한다.
 * 3. 오프라인이거나 네트워크 호출이 불가능한 환경에서는 마스터 파이프라인 기반 결정적 폴백을 반환한다.
 */
import { z } from "zod";

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
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";
import { hydrateDefaultEnvClaudeConnection } from "@/shared/ai/user-ai-store";

import {
  runWebtoonStoryboardMasterPipeline,
  type CharacterRelationshipDynamicId,
  type GenvasPosePresetId,
} from "../studio-webtoon-storyboard-pipeline";

import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";

import type { ArtDirectorReview } from "./claude-art-director";
import type { LocalizeResultView } from "./claude-localize";
import type Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_STORYBOARD_ASSIST_MAX_OUTPUT_TOKENS = 4_000;

export const ClaudeStoryboardAssistSchema = z.object({
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

export type ClaudeStoryboardAssistRaw = z.infer<typeof ClaudeStoryboardAssistSchema>;

export interface ClaudeStoryboardAssistInput {
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

export interface ClaudeStoryboardAssistView {
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
  readonly usage: ClaudeTokenUsage;
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

export function buildClaudeStoryboardAssistRequest(
  model: string,
  input: ClaudeStoryboardAssistInput,
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
    max_tokens: CLAUDE_STORYBOARD_ASSIST_MAX_OUTPUT_TOKENS,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userLines.join("\n") }],
    ...(claudeModelSupportsEffort(model) ? { output_config: { effort: "low" as const } } : {}),
  };
}

export function normalizeClaudeStoryboardAssist(
  raw: ClaudeStoryboardAssistRaw,
  model: string,
  usage: ClaudeTokenUsage = EMPTY_CLAUDE_TOKEN_USAGE,
  source: "claude-live" | "deterministic-fallback" = "claude-live",
): ClaudeStoryboardAssistView {
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
    model: claudeModelInfo(model)?.id ?? model,
    cliffhangerHookLine,
    subtextDialogueUpgrade: Object.freeze(subtextDialogueUpgrade),
    cutDirectingNotes: Object.freeze(cutDirectingNotes),
    globalLocalizationNotes: Object.freeze(globalLocalizationNotes),
    usage,
    estimatedUsd: estimateClaudeCostUsd(model, usage)?.usd ?? null,
  });
}

/**
 * 네트워크 호출 없이도 즉시 동작하는 결정적(Deterministic) 스토리보드 보조 코칭 생성기.
 */
export function buildDeterministicStoryboardAssistFallback(
  input: ClaudeStoryboardAssistInput = {},
): ClaudeStoryboardAssistView {
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

  const raw: ClaudeStoryboardAssistRaw = {
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

  return normalizeClaudeStoryboardAssist(
    raw,
    "claude-haiku-5-5",
    EMPTY_CLAUDE_TOKEN_USAGE,
    "deterministic-fallback",
  );
}

export interface RunClaudeStoryboardAssistOptions {
  readonly route?: Pick<ClaudeRoute, "apiKey" | "revision" | "model"> | null;
  readonly model?: string;
  readonly signal?: AbortSignal;
  readonly budgetOverride?: boolean;
  readonly fallbackOnError?: boolean;
}

/**
 * Claude 구조화 출력(`claudeParse`)을 통해 스토리보드·대사·4레이어 연출 코칭을 실행한다.
 * 활성 연결이 없으면 로컬 `.env*`의 Claude API 키(`hydrateDefaultEnvClaudeConnection`)를 먼저 시도하고,
 * `fallbackOnError !== false`이면 오류 시 결정적 폴백으로 안전하게 복구한다.
 */
export async function runClaudeWebtoonStoryboardAssist(
  input: ClaudeStoryboardAssistInput,
  options: RunClaudeStoryboardAssistOptions = {},
): Promise<ClaudeStoryboardAssistView> {
  let activeRoute = options.route ?? resolveClaudeRoute();
  if (!activeRoute) {
    hydrateDefaultEnvClaudeConnection();
    activeRoute = resolveClaudeRoute();
  }
  if (!activeRoute) {
    if (options.fallbackOnError !== false) {
      return buildDeterministicStoryboardAssistFallback(input);
    }
    throw new Error("사용 가능한 Claude 연결이 없습니다. AI 설정에서 키를 연결하거나 환경변수를 확인하세요.");
  }

  const requestedModel = resolveClaudeRequestModel(
    options.model,
    activeRoute.model || CLAUDE_DEFAULT_MODEL_ID,
  );
  const request = buildClaudeStoryboardAssistRequest(requestedModel, input);

  try {
    const { message, parsed } = await claudeParse(
      activeRoute,
      request,
      ClaudeStoryboardAssistSchema,
      {
        signal: options.signal,
        capUsd: estimateStructuredCostCapUsd({
          model: requestedModel,
          request,
          schema: ClaudeStoryboardAssistSchema,
        }),
        budgetOverride: options.budgetOverride,
      },
    );
    const actualModel = message.model || requestedModel;
    const usage = toClaudeTokenUsage(message.usage);
    return normalizeClaudeStoryboardAssist(parsed, actualModel, usage, "claude-live");
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
