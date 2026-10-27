/**
 * AI 번역·현지화 실행 — 요청 생성 → Claude 구조화 출력 호출 → 번호 검증을 한 번에 묶는다.
 *
 * - 줄이 `LOCALIZE_CHUNK_LINES`(25)를 넘으면 같은 크기의 묶음으로 나눠 **차례로** 보낸다. 한 요청이 길어져 잘리는 일을 구조적으로 막고,
 *   묶음마다 전송 계층의 예산 판정을 받으며, 끝난 묶음은 곧바로 `onProgress`로 알린다.
 * - 첫 묶음이 아닌 곳에서 실패하면 이미 번역된 줄을 버리지 않고 돌려준다(`chunks.error`). 첫 묶음 실패·중단은 던진다.
 * - 자동 재시도·모델 대체는 없다. 묶음으로 나눈 것은 재시도가 아니라 서로 다른 줄을 보내는 별개 요청이다.
 * - 묶음마다 제한 시간은 5분이다(`LOCALIZE_TIMEOUT_MS`).
 */
import { z } from "zod";

import {
  CLAUDE_DEFAULT_MODEL_ID,
  claudeModelInfo,
  claudeModelSupportsEffort,
  estimateClaudeCostUsd,
  type ClaudeTokenUsage,
} from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { resolveClaudeRoute, type ClaudeRoute } from "@/shared/ai/claude/claude-route";
import { cleanSingleLineText } from "@/shared/ai/claude/claude-text";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";
import { hydrateDefaultEnvClaudeConnection } from "@/shared/ai/user-ai-store";

import { resolveCreatorTaskModelRoute, type ClaudeCreatorTaskId } from "./claude-creator-model-router";
import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";
import {
  buildLocalizeChunkRequest,
  LOCALIZE_TIMEOUT_MS,
  LocalizeSchema,
  mergeLocalizeViews,
  normalizeLocalizeResult,
  planLocalizeChunks,
  type LocalizeChunk,
  type LocalizeInput,
  type LocalizeResultView,
} from "./claude-localize";

import type { RunWave30LocalizeAssistOptions, Wave30LocalizeAssistInput, Wave30LocalizeAssistResult } from "./claude-alt-text";
import type { ClaudeEffortDepth } from "@/shared/ai/claude/claude-effort-presets";
import type Anthropic from "@anthropic-ai/sdk";

export interface LocalizeChunkStatus {
  /** 보낸 묶음 수(전체). 한 번에 보낸 경우 1. */
  readonly total: number;
  /** 끝난 묶음 수. `total`보다 작으면 번역하지 못한 줄이 남아 있다. */
  readonly done: number;
  /** 묶음 중간에 멈춘 이유(사용자에게 보여도 안전한 문장). 없으면 오류 없이 끝났거나 사용자가 멈췄다. */
  readonly error?: string;
}

export interface LocalizeRunResult {
  /** 끝난 묶음의 줄만 담는다. 남은 줄은 화면이 `withMissingLocalizeLines`로 채운다. */
  readonly view: LocalizeResultView;
  readonly model: string;
  /** 모든 묶음의 합계. */
  readonly usage: ClaudeTokenUsage;
  /** 모든 묶음의 추정 비용 합계. 단가를 모르는 모델이면 null. */
  readonly estimatedUsd: number | null;
  readonly chunks: LocalizeChunkStatus;
}

export interface LocalizeRunOptions {
  /** 비우면 연결의 기본 모델을 쓴다. */
  readonly model?: string;
  readonly depth: ClaudeEffortDepth;
  readonly signal?: AbortSignal;
  /** 사용자가 "이번 한 번만 예산을 넘어도 진행"을 직접 고른 요청이면 true. 모든 묶음의 예산 판정을 건너뛴다. */
  readonly budgetOverride?: boolean;
  /** 묶음 하나가 끝날 때마다 그때까지의 결과로 불린다(줄이 많을 때 먼저 끝난 줄을 바로 보여 주려고). */
  readonly onProgress?: (result: LocalizeRunResult) => void;
}

const ZERO_USAGE: ClaudeTokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

function addUsage(left: ClaudeTokenUsage, right: ClaudeTokenUsage): ClaudeTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  };
}

export async function runLocalize(
  route: Pick<ClaudeRoute, "apiKey" | "revision" | "model">,
  input: LocalizeInput,
  options: LocalizeRunOptions,
): Promise<LocalizeRunResult> {
  const requested = resolveClaudeRequestModel(options.model, route.model);
  const plan = planLocalizeChunks(input.lines.length);
  const parts: Array<{ chunk: LocalizeChunk; view: LocalizeResultView }> = [];
  let usage = ZERO_USAGE;
  let estimatedUsd: number | null = 0;
  let model = requested;

  const snapshot = (error?: string): LocalizeRunResult => ({
    view: mergeLocalizeViews(parts),
    model: claudeModelInfo(model)?.id ?? model,
    usage,
    estimatedUsd,
    chunks: { total: plan.length, done: parts.length, ...(error ? { error } : {}) },
  });

  for (const chunk of plan) {
    try {
      const params = buildLocalizeChunkRequest(requested, input, options.depth, chunk);
      const { message, parsed } = await claudeParse(route, params, LocalizeSchema, {
        signal: options.signal,
        timeoutMs: LOCALIZE_TIMEOUT_MS,
        // 실행 전 확인에 보인 값과 같은 함수로 잰 상한이다. 전송 계층이 묶음마다 예산 판정과 진행 중 예약에 쓴다.
        capUsd: estimateStructuredCostCapUsd({ model: requested, request: params, schema: LocalizeSchema }),
        budgetOverride: options.budgetOverride,
      });
      model = message.model || requested;
      const chunkUsage = toClaudeTokenUsage(message.usage);
      usage = addUsage(usage, chunkUsage);
      const chunkUsd = estimateClaudeCostUsd(model, chunkUsage)?.usd ?? null;
      estimatedUsd = estimatedUsd === null || chunkUsd === null ? null : estimatedUsd + chunkUsd;
      parts.push({ chunk, view: normalizeLocalizeResult(parsed, { lines: input.lines.slice(chunk.start, chunk.end) }) });
    } catch (error) {
      // 첫 묶음 실패나 사용자의 중단은 결과가 없거나 사용자가 정한 것이라 그대로 올린다.
      if (parts.length === 0 || options.signal?.aborted) throw error;
      return snapshot(error instanceof Error ? error.message : String(error));
    }
    options.onProgress?.(snapshot());
  }
  return snapshot();
}

/**
 * 이번 번역이 낼 수 있는 비용의 상한(USD) — 묶음마다 잰 상한의 합. 출력은 줄 수에 맞춘 `max_tokens`가 하드 상한이고, 입력은 보내는 글의 UTF-8 바이트 수(토큰은
 * 바이트보다 많을 수 없다)에 스키마·틀을 더해 센다. 한글은 글자당 약 1.4~1.6토큰이라 "글자당 1토큰"은 상한이 못 된다(2026-10-22 실측).
 * 실행 전 확인과 실제 실행이 같은 함수를 쓴다. 단가를 모르는 모델은 null.
 */
export function estimateLocalizeCostCapUsd(model: string, input: LocalizeInput, depth: ClaudeEffortDepth): number | null {
  let total = 0;
  for (const chunk of planLocalizeChunks(input.lines.length)) {
    const cap = estimateStructuredCostCapUsd({ model, request: buildLocalizeChunkRequest(model, input, depth, chunk), schema: LocalizeSchema });
    if (cap === null) return null;
    total += cap;
  }
  return total;
}

// ============================================================================
// Wave 45~47 (900대 플랫폼 내재화): 조선갓/비녀/카타나·남성정장/구두/안경·신기전/거북선/투석기·한옥온돌/봉수대/조총·좀비바리케이드/방독면/락픽·사이버터미널/서버랙/CCTV·동물동공/거미8다리/문어·수어/보청기/ISBN납본 8종
// ============================================================================

function clampWave45(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

async function executeWave45LocalizeDirector<TSchema extends z.ZodTypeAny, TOut>(params: {
  readonly taskId: ClaudeCreatorTaskId;
  readonly systemPrompt: string;
  readonly userInstruction: string;
  readonly input: Wave30LocalizeAssistInput;
  readonly schema: TSchema;
  readonly options: RunWave30LocalizeAssistOptions;
  readonly normalize: (parsed: z.infer<TSchema>) => TOut;
  readonly fallback: () => TOut;
}): Promise<Wave30LocalizeAssistResult<TOut>> {
  const { taskId, systemPrompt, userInstruction, input, schema, options, normalize, fallback } = params;
  const activeRoute = options.route !== undefined ? options.route : (hydrateDefaultEnvClaudeConnection(), resolveClaudeRoute());
  const taskRoute = resolveCreatorTaskModelRoute(taskId, { model: options.model as never });
  if (!activeRoute) {
    if (options.fallbackOnError !== false) {
      return Object.freeze({ taskId, source: "deterministic-fallback", model: taskRoute.model, data: fallback(), usage: null, estimatedUsd: null });
    }
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const requestedModel = resolveClaudeRequestModel(options.model ?? taskRoute.model, activeRoute.model || CLAUDE_DEFAULT_MODEL_ID);
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: 1_600,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: `${cleanSingleLineText(input.episodeTitle, 100)} (${cleanSingleLineText(input.genre, 60)})\n장면: ${cleanSingleLineText(input.scriptSummary, 400)}\n${userInstruction}`,
    }],
    ...(claudeModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };
  try {
    const { message, parsed } = await claudeParse(activeRoute, request, schema, {
      signal: options.signal,
      capUsd: estimateStructuredCostCapUsd({ model: requestedModel, request, schema }),
      budgetOverride: options.budgetOverride,
    });
    const actualModel = message.model || requestedModel;
    const usage = toClaudeTokenUsage(message.usage);
    return Object.freeze({
      taskId,
      source: "claude-live",
      model: claudeModelInfo(actualModel)?.id ?? actualModel,
      data: normalize(parsed),
      usage,
      estimatedUsd: estimateClaudeCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return Object.freeze({ taskId, source: "deterministic-fallback", model: requestedModel, data: fallback(), usage: null, estimatedUsd: null });
    }
    throw error;
  }
}

export const ClaudeJoseonGatBinyeoKatanaSchema = z.object({
  traditionalAccessoryIntegrityScore: z.number().int().min(0).max(100),
  gatYangtaeMeshAndGatgeunKo: z.string(),
  binyeoLeftToRightInsertionKo: z.string(),
  katanaSayaEdgeUpvsTachiEdgeDownKo: z.string(),
});
export type ClaudeJoseonGatBinyeoKatana = z.infer<typeof ClaudeJoseonGatBinyeoKatanaSchema>;

export async function runClaudeJoseonGatBinyeoKatanaSayaDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeJoseonGatBinyeoKatana>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:joseon-gat-binyeo-katana-saya-lock",
    systemPrompt: "당신은 사극/동양판타지 웹툰의 조선 흑립(갓) 양태 반투명 투과·비녀 좌→우 꽂기·일본도 카타나(날 위쪽) vs 타치(날 아래쪽) 패용 구분 감독입니다.",
    userInstruction: "갓 양태/총모자 망사 투과 및 갓끈 규칙, 비녀 좌우 방향, 카타나와 타치 검집 패용 방향을 JSON으로 작성하세요.",
    input,
    schema: ClaudeJoseonGatBinyeoKatanaSchema,
    options,
    normalize: (p) => Object.freeze({ traditionalAccessoryIntegrityScore: clampWave45(p.traditionalAccessoryIntegrityScore, 0, 100, 99), gatYangtaeMeshAndGatgeunKo: cleanSingleLineText(p.gatYangtaeMeshAndGatgeunKo, 180), binyeoLeftToRightInsertionKo: cleanSingleLineText(p.binyeoLeftToRightInsertionKo, 180), katanaSayaEdgeUpvsTachiEdgeDownKo: cleanSingleLineText(p.katanaSayaEdgeUpvsTachiEdgeDownKo, 180) }),
    fallback: () => Object.freeze({ traditionalAccessoryIntegrityScore: 99, gatYangtaeMeshAndGatgeunKo: "조선 흑립(갓) 총모자와 양태는 말총 대나무 세공 망사(불투명도 65%)로 상투와 이마 윤곽이 비치며 턱 아래 죽절 갓끈과 망건 관자 고정", binyeoLeftToRightInsertionKo: "여인 쪽머리의 비녀는 착용자 기준 왼쪽에서 오른쪽으로 꽂아 굵은 잠두(봉황/용머리 장식)가 왼쪽, 뾰족한 끝이 오른쪽으로 돌출되도록 고정", katanaSayaEdgeUpvsTachiEdgeDownKo: "일본도 타치(태도)는 칼날이 아래로 향하게 허리에 매달고, 우치카타나는 칼날이 위(하늘)를 향하도록 좌측 오비(허리띠)에 꽂아 발도술 궤적 일치" }),
  });
}

export const ClaudeMensSuitTieHeelEyeglassSchema = z.object({
  modernTailoringIntegrityScore: z.number().int().min(0).max(100),
  suitBottomButtonUnbuttonedRuleKo: z.string(),
  tieBeltTipAlignmentAndDimpleKo: z.string(),
  stilettoAnkleStrapAndNosePadKo: z.string(),
});
export type ClaudeMensSuitTieHeelEyeglass = z.infer<typeof ClaudeMensSuitTieHeelEyeglassSchema>;

export async function runClaudeMensSuitBottomButtonTieHeelStrapDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeMensSuitTieHeelEyeglass>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:mens-suit-button-tie-heel-eyeglass-lock",
    systemPrompt: "당신은 현대 오피스/재벌물 웹툰의 남성 정장 하단 단추 언버튼(Unbuttoned) 규칙·넥타이 벨트 버클 기장·스틸레토 힐 외측 버클·안경 코받침 고정기입니다.",
    userInstruction: "남성 수트/조끼 맨 아래 단추 오픈 규칙, 넥타이 딤플과 기장, 하이힐 스트랩 버클 및 안경 코받침 디테일을 JSON으로 작성하세요.",
    input,
    schema: ClaudeMensSuitTieHeelEyeglassSchema,
    options,
    normalize: (p) => Object.freeze({ modernTailoringIntegrityScore: clampWave45(p.modernTailoringIntegrityScore, 0, 100, 99), suitBottomButtonUnbuttonedRuleKo: cleanSingleLineText(p.suitBottomButtonUnbuttonedRuleKo, 180), tieBeltTipAlignmentAndDimpleKo: cleanSingleLineText(p.tieBeltTipAlignmentAndDimpleKo, 180), stilettoAnkleStrapAndNosePadKo: cleanSingleLineText(p.stilettoAnkleStrapAndNosePadKo, 180) }),
    fallback: () => Object.freeze({ modernTailoringIntegrityScore: 99, suitBottomButtonUnbuttonedRuleKo: "남성 싱글 브레스티드 2버튼/3버튼 재킷과 베스트(조끼)의 가장 아래 단추는 항상 풀어 두어 V존과 벤트 라인이 자연스럽게 벌어지도록 고정", tieBeltTipAlignmentAndDimpleKo: "넥타이 매듭 바로 아래 중앙 딤플(보조개 주름)을 유지하고 대검(앞쪽 넓은 끝) 끝단이 벨트 버클 중앙에 정확히 닿도록 기장 고정", stilettoAnkleStrapAndNosePadKo: "스틸레토 힐 발목 스트랩 금속 버클은 항상 바깥쪽 복숭아뼈 측면에 위치하며 금속테 안경은 콧대 실리콘 코받침(Nose Pad)과 귀 뒤 팁을 생략 없이 유지" }),
  });
}

export const ClaudeHwachaGeobukseonTrebuchetSchema = z.object({
  siegeWarfareIntegrityScore: z.number().int().min(0).max(100),
  hwachaSingijeonAndGeobukseonOarKo: z.string(),
  trebuchetCounterweightSlingKo: z.string(),
  joustingLeftSidePassLanceKo: z.string(),
});
export type ClaudeHwachaGeobukseonTrebuchet = z.infer<typeof ClaudeHwachaGeobukseonTrebuchetSchema>;

export async function runClaudeHwachaGeobukseonTrebuchetJoustDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeHwachaGeobukseonTrebuchet>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:hwacha-geobukseon-trebuchet-joust-lock",
    systemPrompt: "당신은 전쟁/공성전 웹툰의 조선 신기전 화차(100발)·거북선 2층 구조/8자 노젓기·트레뷰셋 평형추 투석기·마상창시합 좌측 교차 고증 디렉터입니다.",
    userInstruction: "화차 신기전과 거북선 포구/노 구조, 평형추 트레뷰셋 투석 메커니즘, 마상창시합 좌측 통행 규칙을 JSON으로 작성하세요.",
    input,
    schema: ClaudeHwachaGeobukseonTrebuchetSchema,
    options,
    normalize: (p) => Object.freeze({ siegeWarfareIntegrityScore: clampWave45(p.siegeWarfareIntegrityScore, 0, 100, 98), hwachaSingijeonAndGeobukseonOarKo: cleanSingleLineText(p.hwachaSingijeonAndGeobukseonOarKo, 180), trebuchetCounterweightSlingKo: cleanSingleLineText(p.trebuchetCounterweightSlingKo, 180), joustingLeftSidePassLanceKo: cleanSingleLineText(p.joustingLeftSidePassLanceKo, 180) }),
    fallback: () => Object.freeze({ siegeWarfareIntegrityScore: 98, hwachaSingijeonAndGeobukseonOarKo: "조선 화차 신기전 틀 100구멍에서 약통 심지가 순차 점화되어 백색 화약 연기가 후방 분출되고, 거북선은 상장(포갑판)과 하장(격군 노 공간) 2층 분리 구조 유지", trebuchetCounterweightSlingKo: "트레뷰셋 투석기는 짧은 팔의 육중한 중력 평형추(Counterweight)가 수직 낙하할 때 긴 팔 끝의 가죽 슬링(Sling)이 원심력으로 돌을 사출", joustingLeftSidePassLanceKo: "마상창시합(Jousting)은 중앙 분리벽(Tilt)을 각 기사의 왼쪽에 두고 교차 질주하며 오른손에 쥔 랜스를 말 목 너머 좌측 대각선으로 겨누도록 고정" }),
  });
}

export const ClaudeHanokOndolBongsuMatchlockSchema = z.object({
  historicalTechIntegrityScore: z.number().int().min(0).max(100),
  hanokAgungiGulddukAndGiwaKo: z.string(),
  bongsu5TorchCodeAndWatermillKo: z.string(),
  matchlockSerpentinePanSmokeKo: z.string(),
});
export type ClaudeHanokOndolBongsuMatchlock = z.infer<typeof ClaudeHanokOndolBongsuMatchlockSchema>;

export async function runClaudeHanokOndolBongsuWatermillMatchlockDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeHanokOndolBongsuMatchlock>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:hanok-ondol-bongsu-watermill-matchlock-lock",
    systemPrompt: "당신은 사극/대체역사 웹툰의 한옥 아궁이-구들-굴뚝 배치·암키와/수키와·봉수대 5연 횃불 신호·수차 물레방아 회전·조총 화승 격발 고증 디렉터입니다.",
    userInstruction: "한옥 온돌 굴뚝과 기와 구조, 봉수대 연조 신호와 물레방아 회전 방향, 화승총(조총) 화접 백연 격발 원리를 JSON으로 작성하세요.",
    input,
    schema: ClaudeHanokOndolBongsuMatchlockSchema,
    options,
    normalize: (p) => Object.freeze({ historicalTechIntegrityScore: clampWave45(p.historicalTechIntegrityScore, 0, 100, 98), hanokAgungiGulddukAndGiwaKo: cleanSingleLineText(p.hanokAgungiGulddukAndGiwaKo, 180), bongsu5TorchCodeAndWatermillKo: cleanSingleLineText(p.bongsu5TorchCodeAndWatermillKo, 180), matchlockSerpentinePanSmokeKo: cleanSingleLineText(p.matchlockSerpentinePanSmokeKo, 180) }),
    fallback: () => Object.freeze({ historicalTechIntegrityScore: 98, hanokAgungiGulddukAndGiwaKo: "한옥 부엌 아궁이 반대편 외벽에 독립 굴뚝을 배치하고 지붕은 넓은 암키와 위에 반원형 수키와를 덮고 처마 끝에 수막새·암막새 문양 고정", bongsu5TorchCodeAndWatermillKo: "봉수대 5개 화두(평시 1연·적 출현 2연·접근 3연·국경 돌파 4연·교전 5연) 규칙과 상사식 물레방아의 낙수 방향 정회전 일치", matchlockSerpentinePanSmokeKo: "조총(화승총) 방아쇠 당김 시 용두(Serpentine)의 불붙은 화승이 화접(Flash Pan) 점화약을 먼저 태워 얼굴 옆 백연이 솟은 직후 총구 화염 분출" }),
  });
}

export const ClaudeZombieBarricadeGasMaskLockpickSchema = z.object({
  survivalTacticalIntegrityScore: z.number().int().min(0).max(100),
  inwardDoorWedgeAndPlankNailKo: z.string(),
  gasMaskCanisterAndGeigerTubeKo: z.string(),
  lockpickTensionWrenchAndLaserGridKo: z.string(),
});
export type ClaudeZombieBarricadeGasMaskLockpick = z.infer<typeof ClaudeZombieBarricadeGasMaskLockpickSchema>;

export async function runClaudeZombieBarricadeGasMaskLockpickLaserDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeZombieBarricadeGasMaskLockpick>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:zombie-barricade-gasmask-lockpick-laser-lock",
    systemPrompt: "당신은 아포칼립스/첩보 스릴러 웹툰의 문 개폐 방향 바리케이드·방독면 정화통/가이거 계수기·락픽 2도구(텐션렌치+픽)·레이저 산란 물리 디렉터입니다.",
    userInstruction: "문 경첩/바리케이드 물리, 방독면 정화통 및 방사능 계수기, 자물쇠 락픽 2도구 파지, 보안 레이저 산란 연출을 JSON으로 작성하세요.",
    input,
    schema: ClaudeZombieBarricadeGasMaskLockpickSchema,
    options,
    normalize: (p) => Object.freeze({ survivalTacticalIntegrityScore: clampWave45(p.survivalTacticalIntegrityScore, 0, 100, 99), inwardDoorWedgeAndPlankNailKo: cleanSingleLineText(p.inwardDoorWedgeAndPlankNailKo, 180), gasMaskCanisterAndGeigerTubeKo: cleanSingleLineText(p.gasMaskCanisterAndGeigerTubeKo, 180), lockpickTensionWrenchAndLaserGridKo: cleanSingleLineText(p.lockpickTensionWrenchAndLaserGridKo, 180) }),
    fallback: () => Object.freeze({ survivalTacticalIntegrityScore: 99, inwardDoorWedgeAndPlankNailKo: "안쪽으로 열리는 문(경첩 노출 측)만 하단 쐐기(Door Wedge)와 의자 받침이 유효하며, 바깥쪽으로 열리는 문은 좌우 문설주(Door Frame)에 판자를 못질해야 고정됨", gasMaskCanisterAndGeigerTubeKo: "방독면 정화통은 사격 시 개머리판 견착을 방해하지 않도록 비주류 손 방향(오른손잡이는 좌측 뺨)에 결합하고 가이거 계수기는 원통형 GM 프로브 케이블 연결", lockpickTensionWrenchAndLaserGridKo: "핀 텀블러 자물쇠 해정은 반드시 아래쪽 텐션 렌치(회전 토크 유지)와 위쪽 픽(핀 들어올리기) 2개 도구를 동시에 사용하며 보안 레이저는 분무/연막 산란 시에만 가시화" }),
  });
}

export const ClaudeCyberTerminalServerCctvRooftopSchema = z.object({
  urbanInfraIntegrityScore: z.number().int().min(0).max(100),
  bashCliSyntaxAndPrivateIpv4Ko: z.string(),
  serverRack42UPatchAndUpsKo: z.string(),
  cctvIrLedRingAndRooftopAcUnitKo: z.string(),
});
export type ClaudeCyberTerminalServerCctvRooftop = z.infer<typeof ClaudeCyberTerminalServerCctvRooftopSchema>;

export async function runClaudeCyberTerminalServerRackCctvRooftopDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeCyberTerminalServerCctvRooftop>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:cyber-terminal-server-cctv-rooftop-lock",
    systemPrompt: "당신은 현대 추리/사이버 해킹 웹툰의 리눅스 터미널 유효 구문/IPv4 범위(0~255)·42U 서버랙 패치케이블·CCTV 적외선 IR 링·옥상 실외기 고증 디렉터입니다.",
    userInstruction: "해킹 터미널 CLI와 유효 IP 표기, 데이터센터 42U 서버랙 배선, 야간 CCTV 적외선 LED 및 건물 옥상 설비를 JSON으로 작성하세요.",
    input,
    schema: ClaudeCyberTerminalServerCctvRooftopSchema,
    options,
    normalize: (p) => Object.freeze({ urbanInfraIntegrityScore: clampWave45(p.urbanInfraIntegrityScore, 0, 100, 99), bashCliSyntaxAndPrivateIpv4Ko: cleanSingleLineText(p.bashCliSyntaxAndPrivateIpv4Ko, 180), serverRack42UPatchAndUpsKo: cleanSingleLineText(p.serverRack42UPatchAndUpsKo, 180), cctvIrLedRingAndRooftopAcUnitKo: cleanSingleLineText(p.cctvIrLedRingAndRooftopAcUnitKo, 180) }),
    fallback: () => Object.freeze({ urbanInfraIntegrityScore: 99, bashCliSyntaxAndPrivateIpv4Ko: "터미널 화면에 300.999.1.1 같은 가짜 IP 대신 RFC1918 사설 대역(10.x / 192.168.x) 또는 문서용 대역(203.0.113.x)과 실제 ssh/nmap/journalctl 구문 표기", serverRack42UPatchAndUpsKo: "19인치 42U 표준 서버랙 전면 타공 도어 내부에 상단 ToR 스위치·중단 블레이드 서버·하단 무정전 전원장치(UPS) 및 RJ45/LC 광케이블 번들 정렬", cctvIrLedRingAndRooftopAcUnitKo: "야간 CCTV 카메라는 렌즈 둘레에 붉게 미광이 도는 850nm IR LED 링을 그리고, 빌딩 옥상에는 냉각팬 실외기·동파방지 보온재 배관·피뢰침·비상구 유도등 배치" }),
  });
}

export const ClaudeAnimalPupilSpiderOctopusSharkSchema = z.object({
  zoologicalAnatomyIntegrityScore: z.number().int().min(0).max(100),
  goatHorizontalVsCatVerticalPupilKo: z.string(),
  spiderCephalothorax8LegAndSnakeTongueKo: z.string(),
  octopus8ArmSuctionAndSharkVerticalTailKo: z.string(),
});
export type ClaudeAnimalPupilSpiderOctopusShark = z.infer<typeof ClaudeAnimalPupilSpiderOctopusSharkSchema>;

export async function runClaudeAnimalPupilSpider8LegOctopusSharkDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeAnimalPupilSpiderOctopusShark>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:animal-pupil-spider-octopus-shark-director",
    systemPrompt: "당신은 판타지 마수/동물 웹툰의 초식동물 수평 동공 vs 야행성 수직 동공·거미 두흉부 8다리 부착·문어 8다리 2열 빨판·상어 수직 꼬리지느러미 총괄 감독입니다.",
    userInstruction: "염소/말 수평 동공과 고양이/독사 수직 동공 구분, 거미 두흉부 8다리와 뱀 열감지 기관, 문어/오징어 다리와 상어/고래 꼬리지느러미 차이를 JSON으로 작성하세요.",
    input,
    schema: ClaudeAnimalPupilSpiderOctopusSharkSchema,
    options,
    normalize: (p) => Object.freeze({ zoologicalAnatomyIntegrityScore: clampWave45(p.zoologicalAnatomyIntegrityScore, 0, 100, 99), goatHorizontalVsCatVerticalPupilKo: cleanSingleLineText(p.goatHorizontalVsCatVerticalPupilKo, 180), spiderCephalothorax8LegAndSnakeTongueKo: cleanSingleLineText(p.spiderCephalothorax8LegAndSnakeTongueKo, 180), octopus8ArmSuctionAndSharkVerticalTailKo: cleanSingleLineText(p.octopus8ArmSuctionAndSharkVerticalTailKo, 180) }),
    fallback: () => Object.freeze({ zoologicalAnatomyIntegrityScore: 99, goatHorizontalVsCatVerticalPupilKo: "염소·양·말 등 초식동물은 파노라마 시야를 위한 직사각형 수평 동공을 유지하고, 고양이·여우·살무사는 매복 거리 측정을 위한 수직 슬릿 동공으로 구분", spiderCephalothorax8LegAndSnakeTongueKo: "거미형 몬스터의 다리 8개(4쌍)는 배(Abdomen)가 아닌 앞쪽 머리가슴(두흉부)에 모두 부착되며, 독사는 입을 다문 채 앞턱 홈(Lingual Fossa)으로 갈라진 혀를 날름거림", octopus8ArmSuctionAndSharkVerticalTailKo: "문어는 8개 팔 안쪽에 자루 없는 2열 지그재그 빨판을 배열하고, 상어(어류)는 수직 꼬리지느러미 좌우 유영, 고래/돌고래(포유류)는 수평 꼬리지느러미 상하 유영으로 고정" }),
  });
}

export const ClaudeSignLanguageHearingAidArchiveSchema = z.object({
  inclusivityAndArchiveIntegrityScore: z.number().int().min(0).max(100),
  kslHandshapeNonManualMarkerKo: z.string(),
  bteHearingAidCochlearCoilAndCaneKo: z.string(),
  isbn13BarcodeAndLegalDepositSpecKo: z.string(),
});
export type ClaudeSignLanguageHearingAidArchive = z.infer<typeof ClaudeSignLanguageHearingAidArchiveSchema>;

export async function runClaudeSignLanguageHearingAidLegalDepositDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeSignLanguageHearingAidArchive>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:sign-language-hearing-aid-isbn-archive-director",
    systemPrompt: "당신은 배리어프리/드라마 웹툰의 한국수어(KSL) 수형/비수지 신호·보청기/인공와우/흰지팡이 고증 및 단행본 ISBN-13 부가기호·국립중앙도서관 납본 총괄 감독입니다.",
    userInstruction: "한국수어 수형과 궤적 화살표 연출, 귀걸이형 보청기/인공와우 및 시각장애인 흰지팡이 고증, 단행본 ISBN-13 및 납본 아카이브 규격을 JSON으로 작성하세요.",
    input,
    schema: ClaudeSignLanguageHearingAidArchiveSchema,
    options,
    normalize: (p) => Object.freeze({ inclusivityAndArchiveIntegrityScore: clampWave45(p.inclusivityAndArchiveIntegrityScore, 0, 100, 99), kslHandshapeNonManualMarkerKo: cleanSingleLineText(p.kslHandshapeNonManualMarkerKo, 180), bteHearingAidCochlearCoilAndCaneKo: cleanSingleLineText(p.bteHearingAidCochlearCoilAndCaneKo, 180), isbn13BarcodeAndLegalDepositSpecKo: cleanSingleLineText(p.isbn13BarcodeAndLegalDepositSpecKo, 180) }),
    fallback: () => Object.freeze({ inclusivityAndArchiveIntegrityScore: 99, kslHandshapeNonManualMarkerKo: "한국수어(KSL) 대사 컷은 손가락 수형(Handshape)·수위(가슴/얼굴 접점)·수동(반투명 잔상과 이동 화살표)에 눈썹/입모양 비수지 신호(Non-Manual Marker)를 결합", bteHearingAidCochlearCoilAndCaneKo: "귀걸이형(BTE) 보청기 투명 음향 튜브와 인공와우 측두부 원형 자석 코일 위치를 고정하고, 시각장애인용 접이식 흰지팡이 하단 적색 반사 테이프와 롤러 팁 고증", isbn13BarcodeAndLegalDepositSpecKo: "웹툰 단행본 뒷표지 ISBN-13(979-11) 및 5자리 한국문헌번호 부가기호(07810 만화 분류) 바코드 규격과 국립중앙도서관 디지털 납본용 PDF/A-1b 메타데이터 완비" }),
  });
}
