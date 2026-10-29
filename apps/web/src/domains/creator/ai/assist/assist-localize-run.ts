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
  ASSIST_DEFAULT_MODEL_ID,
  assistModelInfo,
  assistModelSupportsEffort,
  estimateAssistCostUsd,
  type AssistTokenUsage,
} from "@/shared/ai/assist/assist-models";
import { resolveAssistRequestModel } from "@/shared/ai/assist/assist-protocol";
import { resolveAssistRoute, type AssistRoute } from "@/shared/ai/assist/assist-route";
import { cleanSingleLineText } from "@/shared/ai/assist/assist-text";
import { assistParse } from "@/shared/ai/assist/assist-transport";
import { toAssistTokenUsage } from "@/shared/ai/assist/assist-usage-meter";

import { resolveCreatorTaskModelRoute, type AssistCreatorTaskId } from "./assist-creator-model-router";
import { estimateStructuredCostCapUsd } from "./assist-feature-cost-cap";
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
} from "./assist-localize";

import type { RunWave30LocalizeAssistOptions, Wave30LocalizeAssistInput, Wave30LocalizeAssistResult } from "./assist-alt-text";
import type { AssistEffortDepth } from "@/shared/ai/assist/assist-effort-presets";
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
  readonly usage: AssistTokenUsage;
  /** 모든 묶음의 추정 비용 합계. 단가를 모르는 모델이면 null. */
  readonly estimatedUsd: number | null;
  readonly chunks: LocalizeChunkStatus;
}

export interface LocalizeRunOptions {
  /** 비우면 연결의 기본 모델을 쓴다. */
  readonly model?: string;
  readonly depth: AssistEffortDepth;
  readonly signal?: AbortSignal;
  /** 사용자가 "이번 한 번만 예산을 넘어도 진행"을 직접 고른 요청이면 true. 모든 묶음의 예산 판정을 건너뛴다. */
  readonly budgetOverride?: boolean;
  /** 묶음 하나가 끝날 때마다 그때까지의 결과로 불린다(줄이 많을 때 먼저 끝난 줄을 바로 보여 주려고). */
  readonly onProgress?: (result: LocalizeRunResult) => void;
}

const ZERO_USAGE: AssistTokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

function addUsage(left: AssistTokenUsage, right: AssistTokenUsage): AssistTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  };
}

export async function runLocalize(
  route: Pick<AssistRoute, "apiKey" | "revision" | "model">,
  input: LocalizeInput,
  options: LocalizeRunOptions,
): Promise<LocalizeRunResult> {
  const requested = resolveAssistRequestModel(options.model, route.model);
  const plan = planLocalizeChunks(input.lines.length);
  const parts: Array<{ chunk: LocalizeChunk; view: LocalizeResultView }> = [];
  let usage = ZERO_USAGE;
  let estimatedUsd: number | null = 0;
  let model = requested;

  const snapshot = (error?: string): LocalizeRunResult => ({
    view: mergeLocalizeViews(parts),
    model: assistModelInfo(model)?.id ?? model,
    usage,
    estimatedUsd,
    chunks: { total: plan.length, done: parts.length, ...(error ? { error } : {}) },
  });

  for (const chunk of plan) {
    try {
      const params = buildLocalizeChunkRequest(requested, input, options.depth, chunk);
      const { message, parsed } = await assistParse(route, params, LocalizeSchema, {
        signal: options.signal,
        timeoutMs: LOCALIZE_TIMEOUT_MS,
        // 실행 전 확인에 보인 값과 같은 함수로 잰 상한이다. 전송 계층이 묶음마다 예산 판정과 진행 중 예약에 쓴다.
        capUsd: estimateStructuredCostCapUsd({ model: requested, request: params, schema: LocalizeSchema }),
        budgetOverride: options.budgetOverride,
      });
      model = message.model || requested;
      const chunkUsage = toAssistTokenUsage(message.usage);
      usage = addUsage(usage, chunkUsage);
      const chunkUsd = estimateAssistCostUsd(model, chunkUsage)?.usd ?? null;
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
export function estimateLocalizeCostCapUsd(model: string, input: LocalizeInput, depth: AssistEffortDepth): number | null {
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
  readonly taskId: AssistCreatorTaskId;
  readonly systemPrompt: string;
  readonly userInstruction: string;
  readonly input: Wave30LocalizeAssistInput;
  readonly schema: TSchema;
  readonly options: RunWave30LocalizeAssistOptions;
  readonly normalize: (parsed: z.infer<TSchema>) => TOut;
  readonly fallback: () => TOut;
}): Promise<Wave30LocalizeAssistResult<TOut>> {
  const { taskId, systemPrompt, userInstruction, input, schema, options, normalize, fallback } = params;
  const activeRoute = options.route !== undefined ? options.route : resolveAssistRoute();
  const taskRoute = resolveCreatorTaskModelRoute(taskId, { model: options.model as never });
  if (!activeRoute) {
    if (options.fallbackOnError !== false) {
      return Object.freeze({ taskId, source: "deterministic-fallback", model: taskRoute.model, data: fallback(), usage: null, estimatedUsd: null });
    }
    throw new Error("사용 가능한 Claude 연결이 없습니다.");
  }
  const requestedModel = resolveAssistRequestModel(options.model ?? taskRoute.model, activeRoute.model || ASSIST_DEFAULT_MODEL_ID);
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: 1_600,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: `${cleanSingleLineText(input.episodeTitle, 100)} (${cleanSingleLineText(input.genre, 60)})\n장면: ${cleanSingleLineText(input.scriptSummary, 400)}\n${userInstruction}`,
    }],
    ...(assistModelSupportsEffort(requestedModel) ? { output_config: { effort: "low" as const } } : {}),
  };
  try {
    const { message, parsed } = await assistParse(activeRoute, request, schema, {
      signal: options.signal,
      capUsd: estimateStructuredCostCapUsd({ model: requestedModel, request, schema }),
      budgetOverride: options.budgetOverride,
    });
    const actualModel = message.model || requestedModel;
    const usage = toAssistTokenUsage(message.usage);
    return Object.freeze({
      taskId,
      source: "claude-live",
      model: assistModelInfo(actualModel)?.id ?? actualModel,
      data: normalize(parsed),
      usage,
      estimatedUsd: estimateAssistCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false && !options.signal?.aborted) {
      return Object.freeze({ taskId, source: "deterministic-fallback", model: requestedModel, data: fallback(), usage: null, estimatedUsd: null });
    }
    throw error;
  }
}

export const AssistJoseonGatBinyeoKatanaSchema = z.object({
  traditionalAccessoryIntegrityScore: z.number().int().min(0).max(100),
  gatYangtaeMeshAndGatgeunKo: z.string(),
  binyeoLeftToRightInsertionKo: z.string(),
  katanaSayaEdgeUpvsTachiEdgeDownKo: z.string(),
});
export type AssistJoseonGatBinyeoKatana = z.infer<typeof AssistJoseonGatBinyeoKatanaSchema>;

export async function runAssistJoseonGatBinyeoKatanaSayaDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistJoseonGatBinyeoKatana>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:joseon-gat-binyeo-katana-saya-lock",
    systemPrompt: "당신은 사극/동양판타지 웹툰의 조선 흑립(갓) 양태 반투명 투과·비녀 좌→우 꽂기·일본도 카타나(날 위쪽) vs 타치(날 아래쪽) 패용 구분 감독입니다.",
    userInstruction: "갓 양태/총모자 망사 투과 및 갓끈 규칙, 비녀 좌우 방향, 카타나와 타치 검집 패용 방향을 JSON으로 작성하세요.",
    input,
    schema: AssistJoseonGatBinyeoKatanaSchema,
    options,
    normalize: (p) => Object.freeze({ traditionalAccessoryIntegrityScore: clampWave45(p.traditionalAccessoryIntegrityScore, 0, 100, 99), gatYangtaeMeshAndGatgeunKo: cleanSingleLineText(p.gatYangtaeMeshAndGatgeunKo, 180), binyeoLeftToRightInsertionKo: cleanSingleLineText(p.binyeoLeftToRightInsertionKo, 180), katanaSayaEdgeUpvsTachiEdgeDownKo: cleanSingleLineText(p.katanaSayaEdgeUpvsTachiEdgeDownKo, 180) }),
    fallback: () => Object.freeze({ traditionalAccessoryIntegrityScore: 99, gatYangtaeMeshAndGatgeunKo: "조선 흑립(갓) 총모자와 양태는 말총 대나무 세공 망사(불투명도 65%)로 상투와 이마 윤곽이 비치며 턱 아래 죽절 갓끈과 망건 관자 고정", binyeoLeftToRightInsertionKo: "여인 쪽머리의 비녀는 착용자 기준 왼쪽에서 오른쪽으로 꽂아 굵은 잠두(봉황/용머리 장식)가 왼쪽, 뾰족한 끝이 오른쪽으로 돌출되도록 고정", katanaSayaEdgeUpvsTachiEdgeDownKo: "일본도 타치(태도)는 칼날이 아래로 향하게 허리에 매달고, 우치카타나는 칼날이 위(하늘)를 향하도록 좌측 오비(허리띠)에 꽂아 발도술 궤적 일치" }),
  });
}

export const AssistMensSuitTieHeelEyeglassSchema = z.object({
  modernTailoringIntegrityScore: z.number().int().min(0).max(100),
  suitBottomButtonUnbuttonedRuleKo: z.string(),
  tieBeltTipAlignmentAndDimpleKo: z.string(),
  stilettoAnkleStrapAndNosePadKo: z.string(),
});
export type AssistMensSuitTieHeelEyeglass = z.infer<typeof AssistMensSuitTieHeelEyeglassSchema>;

export async function runAssistMensSuitBottomButtonTieHeelStrapDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistMensSuitTieHeelEyeglass>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:mens-suit-button-tie-heel-eyeglass-lock",
    systemPrompt: "당신은 현대 오피스/재벌물 웹툰의 남성 정장 하단 단추 언버튼(Unbuttoned) 규칙·넥타이 벨트 버클 기장·스틸레토 힐 외측 버클·안경 코받침 고정기입니다.",
    userInstruction: "남성 수트/조끼 맨 아래 단추 오픈 규칙, 넥타이 딤플과 기장, 하이힐 스트랩 버클 및 안경 코받침 디테일을 JSON으로 작성하세요.",
    input,
    schema: AssistMensSuitTieHeelEyeglassSchema,
    options,
    normalize: (p) => Object.freeze({ modernTailoringIntegrityScore: clampWave45(p.modernTailoringIntegrityScore, 0, 100, 99), suitBottomButtonUnbuttonedRuleKo: cleanSingleLineText(p.suitBottomButtonUnbuttonedRuleKo, 180), tieBeltTipAlignmentAndDimpleKo: cleanSingleLineText(p.tieBeltTipAlignmentAndDimpleKo, 180), stilettoAnkleStrapAndNosePadKo: cleanSingleLineText(p.stilettoAnkleStrapAndNosePadKo, 180) }),
    fallback: () => Object.freeze({ modernTailoringIntegrityScore: 99, suitBottomButtonUnbuttonedRuleKo: "남성 싱글 브레스티드 2버튼/3버튼 재킷과 베스트(조끼)의 가장 아래 단추는 항상 풀어 두어 V존과 벤트 라인이 자연스럽게 벌어지도록 고정", tieBeltTipAlignmentAndDimpleKo: "넥타이 매듭 바로 아래 중앙 딤플(보조개 주름)을 유지하고 대검(앞쪽 넓은 끝) 끝단이 벨트 버클 중앙에 정확히 닿도록 기장 고정", stilettoAnkleStrapAndNosePadKo: "스틸레토 힐 발목 스트랩 금속 버클은 항상 바깥쪽 복숭아뼈 측면에 위치하며 금속테 안경은 콧대 실리콘 코받침(Nose Pad)과 귀 뒤 팁을 생략 없이 유지" }),
  });
}

export const AssistHwachaGeobukseonTrebuchetSchema = z.object({
  siegeWarfareIntegrityScore: z.number().int().min(0).max(100),
  hwachaSingijeonAndGeobukseonOarKo: z.string(),
  trebuchetCounterweightSlingKo: z.string(),
  joustingLeftSidePassLanceKo: z.string(),
});
export type AssistHwachaGeobukseonTrebuchet = z.infer<typeof AssistHwachaGeobukseonTrebuchetSchema>;

export async function runAssistHwachaGeobukseonTrebuchetJoustDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistHwachaGeobukseonTrebuchet>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:hwacha-geobukseon-trebuchet-joust-lock",
    systemPrompt: "당신은 전쟁/공성전 웹툰의 조선 신기전 화차(100발)·거북선 2층 구조/8자 노젓기·트레뷰셋 평형추 투석기·마상창시합 좌측 교차 고증 디렉터입니다.",
    userInstruction: "화차 신기전과 거북선 포구/노 구조, 평형추 트레뷰셋 투석 메커니즘, 마상창시합 좌측 통행 규칙을 JSON으로 작성하세요.",
    input,
    schema: AssistHwachaGeobukseonTrebuchetSchema,
    options,
    normalize: (p) => Object.freeze({ siegeWarfareIntegrityScore: clampWave45(p.siegeWarfareIntegrityScore, 0, 100, 98), hwachaSingijeonAndGeobukseonOarKo: cleanSingleLineText(p.hwachaSingijeonAndGeobukseonOarKo, 180), trebuchetCounterweightSlingKo: cleanSingleLineText(p.trebuchetCounterweightSlingKo, 180), joustingLeftSidePassLanceKo: cleanSingleLineText(p.joustingLeftSidePassLanceKo, 180) }),
    fallback: () => Object.freeze({ siegeWarfareIntegrityScore: 98, hwachaSingijeonAndGeobukseonOarKo: "조선 화차 신기전 틀 100구멍에서 약통 심지가 순차 점화되어 백색 화약 연기가 후방 분출되고, 거북선은 상장(포갑판)과 하장(격군 노 공간) 2층 분리 구조 유지", trebuchetCounterweightSlingKo: "트레뷰셋 투석기는 짧은 팔의 육중한 중력 평형추(Counterweight)가 수직 낙하할 때 긴 팔 끝의 가죽 슬링(Sling)이 원심력으로 돌을 사출", joustingLeftSidePassLanceKo: "마상창시합(Jousting)은 중앙 분리벽(Tilt)을 각 기사의 왼쪽에 두고 교차 질주하며 오른손에 쥔 랜스를 말 목 너머 좌측 대각선으로 겨누도록 고정" }),
  });
}

export const AssistHanokOndolBongsuMatchlockSchema = z.object({
  historicalTechIntegrityScore: z.number().int().min(0).max(100),
  hanokAgungiGulddukAndGiwaKo: z.string(),
  bongsu5TorchCodeAndWatermillKo: z.string(),
  matchlockSerpentinePanSmokeKo: z.string(),
});
export type AssistHanokOndolBongsuMatchlock = z.infer<typeof AssistHanokOndolBongsuMatchlockSchema>;

export async function runAssistHanokOndolBongsuWatermillMatchlockDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistHanokOndolBongsuMatchlock>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:hanok-ondol-bongsu-watermill-matchlock-lock",
    systemPrompt: "당신은 사극/대체역사 웹툰의 한옥 아궁이-구들-굴뚝 배치·암키와/수키와·봉수대 5연 횃불 신호·수차 물레방아 회전·조총 화승 격발 고증 디렉터입니다.",
    userInstruction: "한옥 온돌 굴뚝과 기와 구조, 봉수대 연조 신호와 물레방아 회전 방향, 화승총(조총) 화접 백연 격발 원리를 JSON으로 작성하세요.",
    input,
    schema: AssistHanokOndolBongsuMatchlockSchema,
    options,
    normalize: (p) => Object.freeze({ historicalTechIntegrityScore: clampWave45(p.historicalTechIntegrityScore, 0, 100, 98), hanokAgungiGulddukAndGiwaKo: cleanSingleLineText(p.hanokAgungiGulddukAndGiwaKo, 180), bongsu5TorchCodeAndWatermillKo: cleanSingleLineText(p.bongsu5TorchCodeAndWatermillKo, 180), matchlockSerpentinePanSmokeKo: cleanSingleLineText(p.matchlockSerpentinePanSmokeKo, 180) }),
    fallback: () => Object.freeze({ historicalTechIntegrityScore: 98, hanokAgungiGulddukAndGiwaKo: "한옥 부엌 아궁이 반대편 외벽에 독립 굴뚝을 배치하고 지붕은 넓은 암키와 위에 반원형 수키와를 덮고 처마 끝에 수막새·암막새 문양 고정", bongsu5TorchCodeAndWatermillKo: "봉수대 5개 화두(평시 1연·적 출현 2연·접근 3연·국경 돌파 4연·교전 5연) 규칙과 상사식 물레방아의 낙수 방향 정회전 일치", matchlockSerpentinePanSmokeKo: "조총(화승총) 방아쇠 당김 시 용두(Serpentine)의 불붙은 화승이 화접(Flash Pan) 점화약을 먼저 태워 얼굴 옆 백연이 솟은 직후 총구 화염 분출" }),
  });
}

export const AssistZombieBarricadeGasMaskLockpickSchema = z.object({
  survivalTacticalIntegrityScore: z.number().int().min(0).max(100),
  inwardDoorWedgeAndPlankNailKo: z.string(),
  gasMaskCanisterAndGeigerTubeKo: z.string(),
  lockpickTensionWrenchAndLaserGridKo: z.string(),
});
export type AssistZombieBarricadeGasMaskLockpick = z.infer<typeof AssistZombieBarricadeGasMaskLockpickSchema>;

export async function runAssistZombieBarricadeGasMaskLockpickLaserDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistZombieBarricadeGasMaskLockpick>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:zombie-barricade-gasmask-lockpick-laser-lock",
    systemPrompt: "당신은 아포칼립스/첩보 스릴러 웹툰의 문 개폐 방향 바리케이드·방독면 정화통/가이거 계수기·락픽 2도구(텐션렌치+픽)·레이저 산란 물리 디렉터입니다.",
    userInstruction: "문 경첩/바리케이드 물리, 방독면 정화통 및 방사능 계수기, 자물쇠 락픽 2도구 파지, 보안 레이저 산란 연출을 JSON으로 작성하세요.",
    input,
    schema: AssistZombieBarricadeGasMaskLockpickSchema,
    options,
    normalize: (p) => Object.freeze({ survivalTacticalIntegrityScore: clampWave45(p.survivalTacticalIntegrityScore, 0, 100, 99), inwardDoorWedgeAndPlankNailKo: cleanSingleLineText(p.inwardDoorWedgeAndPlankNailKo, 180), gasMaskCanisterAndGeigerTubeKo: cleanSingleLineText(p.gasMaskCanisterAndGeigerTubeKo, 180), lockpickTensionWrenchAndLaserGridKo: cleanSingleLineText(p.lockpickTensionWrenchAndLaserGridKo, 180) }),
    fallback: () => Object.freeze({ survivalTacticalIntegrityScore: 99, inwardDoorWedgeAndPlankNailKo: "안쪽으로 열리는 문(경첩 노출 측)만 하단 쐐기(Door Wedge)와 의자 받침이 유효하며, 바깥쪽으로 열리는 문은 좌우 문설주(Door Frame)에 판자를 못질해야 고정됨", gasMaskCanisterAndGeigerTubeKo: "방독면 정화통은 사격 시 개머리판 견착을 방해하지 않도록 비주류 손 방향(오른손잡이는 좌측 뺨)에 결합하고 가이거 계수기는 원통형 GM 프로브 케이블 연결", lockpickTensionWrenchAndLaserGridKo: "핀 텀블러 자물쇠 해정은 반드시 아래쪽 텐션 렌치(회전 토크 유지)와 위쪽 픽(핀 들어올리기) 2개 도구를 동시에 사용하며 보안 레이저는 분무/연막 산란 시에만 가시화" }),
  });
}

export const AssistCyberTerminalServerCctvRooftopSchema = z.object({
  urbanInfraIntegrityScore: z.number().int().min(0).max(100),
  bashCliSyntaxAndPrivateIpv4Ko: z.string(),
  serverRack42UPatchAndUpsKo: z.string(),
  cctvIrLedRingAndRooftopAcUnitKo: z.string(),
});
export type AssistCyberTerminalServerCctvRooftop = z.infer<typeof AssistCyberTerminalServerCctvRooftopSchema>;

export async function runAssistCyberTerminalServerRackCctvRooftopDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistCyberTerminalServerCctvRooftop>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:cyber-terminal-server-cctv-rooftop-lock",
    systemPrompt: "당신은 현대 추리/사이버 해킹 웹툰의 리눅스 터미널 유효 구문/IPv4 범위(0~255)·42U 서버랙 패치케이블·CCTV 적외선 IR 링·옥상 실외기 고증 디렉터입니다.",
    userInstruction: "해킹 터미널 CLI와 유효 IP 표기, 데이터센터 42U 서버랙 배선, 야간 CCTV 적외선 LED 및 건물 옥상 설비를 JSON으로 작성하세요.",
    input,
    schema: AssistCyberTerminalServerCctvRooftopSchema,
    options,
    normalize: (p) => Object.freeze({ urbanInfraIntegrityScore: clampWave45(p.urbanInfraIntegrityScore, 0, 100, 99), bashCliSyntaxAndPrivateIpv4Ko: cleanSingleLineText(p.bashCliSyntaxAndPrivateIpv4Ko, 180), serverRack42UPatchAndUpsKo: cleanSingleLineText(p.serverRack42UPatchAndUpsKo, 180), cctvIrLedRingAndRooftopAcUnitKo: cleanSingleLineText(p.cctvIrLedRingAndRooftopAcUnitKo, 180) }),
    fallback: () => Object.freeze({ urbanInfraIntegrityScore: 99, bashCliSyntaxAndPrivateIpv4Ko: "터미널 화면에 300.999.1.1 같은 가짜 IP 대신 RFC1918 사설 대역(10.x / 192.168.x) 또는 문서용 대역(203.0.113.x)과 실제 ssh/nmap/journalctl 구문 표기", serverRack42UPatchAndUpsKo: "19인치 42U 표준 서버랙 전면 타공 도어 내부에 상단 ToR 스위치·중단 블레이드 서버·하단 무정전 전원장치(UPS) 및 RJ45/LC 광케이블 번들 정렬", cctvIrLedRingAndRooftopAcUnitKo: "야간 CCTV 카메라는 렌즈 둘레에 붉게 미광이 도는 850nm IR LED 링을 그리고, 빌딩 옥상에는 냉각팬 실외기·동파방지 보온재 배관·피뢰침·비상구 유도등 배치" }),
  });
}

export const AssistAnimalPupilSpiderOctopusSharkSchema = z.object({
  zoologicalAnatomyIntegrityScore: z.number().int().min(0).max(100),
  goatHorizontalVsCatVerticalPupilKo: z.string(),
  spiderCephalothorax8LegAndSnakeTongueKo: z.string(),
  octopus8ArmSuctionAndSharkVerticalTailKo: z.string(),
});
export type AssistAnimalPupilSpiderOctopusShark = z.infer<typeof AssistAnimalPupilSpiderOctopusSharkSchema>;

export async function runAssistAnimalPupilSpider8LegOctopusSharkDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistAnimalPupilSpiderOctopusShark>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:animal-pupil-spider-octopus-shark-director",
    systemPrompt: "당신은 판타지 마수/동물 웹툰의 초식동물 수평 동공 vs 야행성 수직 동공·거미 두흉부 8다리 부착·문어 8다리 2열 빨판·상어 수직 꼬리지느러미 총괄 감독입니다.",
    userInstruction: "염소/말 수평 동공과 고양이/독사 수직 동공 구분, 거미 두흉부 8다리와 뱀 열감지 기관, 문어/오징어 다리와 상어/고래 꼬리지느러미 차이를 JSON으로 작성하세요.",
    input,
    schema: AssistAnimalPupilSpiderOctopusSharkSchema,
    options,
    normalize: (p) => Object.freeze({ zoologicalAnatomyIntegrityScore: clampWave45(p.zoologicalAnatomyIntegrityScore, 0, 100, 99), goatHorizontalVsCatVerticalPupilKo: cleanSingleLineText(p.goatHorizontalVsCatVerticalPupilKo, 180), spiderCephalothorax8LegAndSnakeTongueKo: cleanSingleLineText(p.spiderCephalothorax8LegAndSnakeTongueKo, 180), octopus8ArmSuctionAndSharkVerticalTailKo: cleanSingleLineText(p.octopus8ArmSuctionAndSharkVerticalTailKo, 180) }),
    fallback: () => Object.freeze({ zoologicalAnatomyIntegrityScore: 99, goatHorizontalVsCatVerticalPupilKo: "염소·양·말 등 초식동물은 파노라마 시야를 위한 직사각형 수평 동공을 유지하고, 고양이·여우·살무사는 매복 거리 측정을 위한 수직 슬릿 동공으로 구분", spiderCephalothorax8LegAndSnakeTongueKo: "거미형 몬스터의 다리 8개(4쌍)는 배(Abdomen)가 아닌 앞쪽 머리가슴(두흉부)에 모두 부착되며, 독사는 입을 다문 채 앞턱 홈(Lingual Fossa)으로 갈라진 혀를 날름거림", octopus8ArmSuctionAndSharkVerticalTailKo: "문어는 8개 팔 안쪽에 자루 없는 2열 지그재그 빨판을 배열하고, 상어(어류)는 수직 꼬리지느러미 좌우 유영, 고래/돌고래(포유류)는 수평 꼬리지느러미 상하 유영으로 고정" }),
  });
}

export const AssistSignLanguageHearingAidArchiveSchema = z.object({
  inclusivityAndArchiveIntegrityScore: z.number().int().min(0).max(100),
  kslHandshapeNonManualMarkerKo: z.string(),
  bteHearingAidCochlearCoilAndCaneKo: z.string(),
  isbn13BarcodeAndLegalDepositSpecKo: z.string(),
});
export type AssistSignLanguageHearingAidArchive = z.infer<typeof AssistSignLanguageHearingAidArchiveSchema>;

export async function runAssistSignLanguageHearingAidLegalDepositDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistSignLanguageHearingAidArchive>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:sign-language-hearing-aid-isbn-archive-director",
    systemPrompt: "당신은 배리어프리/드라마 웹툰의 한국수어(KSL) 수형/비수지 신호·보청기/인공와우/흰지팡이 고증 및 단행본 ISBN-13 부가기호·국립중앙도서관 납본 총괄 감독입니다.",
    userInstruction: "한국수어 수형과 궤적 화살표 연출, 귀걸이형 보청기/인공와우 및 시각장애인 흰지팡이 고증, 단행본 ISBN-13 및 납본 아카이브 규격을 JSON으로 작성하세요.",
    input,
    schema: AssistSignLanguageHearingAidArchiveSchema,
    options,
    normalize: (p) => Object.freeze({ inclusivityAndArchiveIntegrityScore: clampWave45(p.inclusivityAndArchiveIntegrityScore, 0, 100, 99), kslHandshapeNonManualMarkerKo: cleanSingleLineText(p.kslHandshapeNonManualMarkerKo, 180), bteHearingAidCochlearCoilAndCaneKo: cleanSingleLineText(p.bteHearingAidCochlearCoilAndCaneKo, 180), isbn13BarcodeAndLegalDepositSpecKo: cleanSingleLineText(p.isbn13BarcodeAndLegalDepositSpecKo, 180) }),
    fallback: () => Object.freeze({ inclusivityAndArchiveIntegrityScore: 99, kslHandshapeNonManualMarkerKo: "한국수어(KSL) 대사 컷은 손가락 수형(Handshape)·수위(가슴/얼굴 접점)·수동(반투명 잔상과 이동 화살표)에 눈썹/입모양 비수지 신호(Non-Manual Marker)를 결합", bteHearingAidCochlearCoilAndCaneKo: "귀걸이형(BTE) 보청기 투명 음향 튜브와 인공와우 측두부 원형 자석 코일 위치를 고정하고, 시각장애인용 접이식 흰지팡이 하단 적색 반사 테이프와 롤러 팁 고증", isbn13BarcodeAndLegalDepositSpecKo: "웹툰 단행본 뒷표지 ISBN-13(979-11) 및 5자리 한국문헌번호 부가기호(07810 만화 분류) 바코드 규격과 국립중앙도서관 디지털 납본용 PDF/A-1b 메타데이터 완비" }),
  });
}

// ============================================================================
// Wave 48~50 (960대 플랫폼 내재화): 무협화산당가제갈·선협어검객잔죽간·카지노바카라홀덤·그랜드피아노시가위스키·슈퍼카F1요트제트기·심해잠수정우주복콜드슬립·화산용암빙하사막·항공모함방공호BSL4 8종
// ============================================================================

export const AssistMurimPlumTangClanBaguaSchema = z.object({
  murimSectIntegrityScore: z.number().int().min(0).max(100),
  mountHwa5PetalPlumQiAndNamgungLightningKo: z.string(),
  tangClanPoisonNeedleAndZhugeBaguaArrayKo: z.string(),
  wudangTaijiBuljinAndBeggarsBambooStaffKo: z.string(),
});
export type AssistMurimPlumTangClanBagua = z.infer<typeof AssistMurimPlumTangClanBaguaSchema>;

export async function runAssistMurimPlumBlossomTangClanBaguaDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistMurimPlumTangClanBagua>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:murim-plum-sword-tang-clan-bagua-lock",
    systemPrompt: "당신은 무협 웹툰의 화산파 5꽃잎 매화검기·남궁세가 뇌전대검·사천당가 암기/만독불침·제갈세가 기문둔갑 팔진도·무당 태극/개방 타구봉 문파 시그니처 고정기입니다.",
    userInstruction: "화산파 매화검기와 남궁세가 뇌전대검, 사천당가 독침/암기와 제갈세가 팔진도, 무당파 불진과 개방 타구봉 규칙을 JSON으로 작성하세요.",
    input,
    schema: AssistMurimPlumTangClanBaguaSchema,
    options,
    normalize: (p) => Object.freeze({ murimSectIntegrityScore: clampWave45(p.murimSectIntegrityScore, 0, 100, 99), mountHwa5PetalPlumQiAndNamgungLightningKo: cleanSingleLineText(p.mountHwa5PetalPlumQiAndNamgungLightningKo, 180), tangClanPoisonNeedleAndZhugeBaguaArrayKo: cleanSingleLineText(p.tangClanPoisonNeedleAndZhugeBaguaArrayKo, 180), wudangTaijiBuljinAndBeggarsBambooStaffKo: cleanSingleLineText(p.wudangTaijiBuljinAndBeggarsBambooStaffKo, 180) }),
    fallback: () => Object.freeze({ murimSectIntegrityScore: 99, mountHwa5PetalPlumQiAndNamgungLightningKo: "화산파 매화검법은 검끝 궤적마다 5꽃잎 홍매화 검기(`#F43F5E`)가 피어나고, 남궁세가 제왕검형은 양손 중검에 청백색 뇌전 스파크 아크를 결합", tangClanPoisonNeedleAndZhugeBaguaArrayKo: "사천당가는 손목/허벅지 가죽 암기낭에서 비도·독침 사출 및 자색 독기(`#A855F7`)를 유지하고, 제갈세가는 학우선 부채 지휘와 8방위 기문둔갑 돌기둥 배열 고정", wudangTaijiBuljinAndBeggarsBambooStaffKo: "무당파는 백색 말총 불진(먼지털이)과 태극 음양어 회전 와류를, 개방은 에메랄드빛 대나무 마디 타구봉과 허리 표주박 호리병 매듭을 일관되게 유지" }),
  });
}

export const AssistXianxiaFlyingSwordInnBambooSchema = z.object({
  orientalFantasyStagingScore: z.number().int().min(0).max(100),
  flyingSwordSurfStanceAndPillCauldronKo: z.string(),
  gaekjanMezzanineWineJarAndBambooCutKo: z.string(),
  bambooSlipJukganPigeonAndPulseWristKo: z.string(),
});
export type AssistXianxiaFlyingSwordInnBamboo = z.infer<typeof AssistXianxiaFlyingSwordInnBambooSchema>;

export async function runAssistXianxiaFlyingSwordInnBambooScrollDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistXianxiaFlyingSwordInnBamboo>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:xianxia-flying-sword-inn-bamboo-scroll-lock",
    systemPrompt: "당신은 무협/선협 웹툰의 어검비행 스탠스·삼족 연단로·객잔 2층 중정 난간/붉은천 술독·대나무 45도 절단·죽간/전서구/촌관척 진맥 고정기입니다.",
    userInstruction: "선협 어검비행 자세와 연단로, 객잔 2층 난간과 대나무 사선 절단 물리, 죽간 우→좌 펼침과 전서구/진맥 고증을 JSON으로 작성하세요.",
    input,
    schema: AssistXianxiaFlyingSwordInnBambooSchema,
    options,
    normalize: (p) => Object.freeze({ orientalFantasyStagingScore: clampWave45(p.orientalFantasyStagingScore, 0, 100, 99), flyingSwordSurfStanceAndPillCauldronKo: cleanSingleLineText(p.flyingSwordSurfStanceAndPillCauldronKo, 180), gaekjanMezzanineWineJarAndBambooCutKo: cleanSingleLineText(p.gaekjanMezzanineWineJarAndBambooCutKo, 180), bambooSlipJukganPigeonAndPulseWristKo: cleanSingleLineText(p.bambooSlipJukganPigeonAndPulseWristKo, 180) }),
    fallback: () => Object.freeze({ orientalFantasyStagingScore: 99, flyingSwordSurfStanceAndPillCauldronKo: "어검비행 시 검신 중앙에 앞발·코등이 쪽에 뒷발을 둔 측면 서핑 균형 자세와 왼손 검결(Jianjue) 수인을 고정하고 삼족 연단로 화구와 뇌겁 번개 연출", gaekjanMezzanineWineJarAndBambooCutKo: "객잔 2층 목조 회랑 난간에서 1층 중정 탁자를 내려다보는 부감 투시와 붉은 천 봉인 도자기 술독, 대나무 숲 45도 사선 절단면 슬라이딩 물리 고정", bambooSlipJukganPigeonAndPulseWristKo: "고대 비급 죽간은 위아래 2줄 엮음 끈을 따라 우→좌로 펼치며 전서구 발목 대나무 서신통과 신의 진맥 시 손목 요골동맥 위 촌·관·척 3지 접점 유지" }),
  });
}

export const AssistCasinoBaccaratHoldemAuctionSchema = z.object({
  highSocietyGamingScore: z.number().int().min(0).max(100),
  baccaratSqueezeAndHoldem5CommunityKo: z.string(),
  clayChipDenominationStackIntegrityKo: z.string(),
  auctionGavelPodiumAndPaddleNumberKo: z.string(),
});
export type AssistCasinoBaccaratHoldemAuction = z.infer<typeof AssistCasinoBaccaratHoldemAuctionSchema>;

export async function runAssistCasinoBaccaratHoldemChipsAuctionDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistCasinoBaccaratHoldemAuction>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:casino-baccarat-holdem-chips-auction-lock",
    systemPrompt: "당신은 도박/재벌 스릴러 웹툰의 카지노 바카라 카드 쪼기(Squeeze)·텍사스 홀덤 5커뮤니티 카드·칩 액면가 색상 스택·미술품 경매장 의사봉/패들 디렉터입니다.",
    userInstruction: "바카라 카드 쪼기와 텍사스 홀덤 플랍-턴-리버 5장 배치, 카지노 칩 액면가 색상, 경매장 패들 번호 연속성을 JSON으로 작성하세요.",
    input,
    schema: AssistCasinoBaccaratHoldemAuctionSchema,
    options,
    normalize: (p) => Object.freeze({ highSocietyGamingScore: clampWave45(p.highSocietyGamingScore, 0, 100, 98), baccaratSqueezeAndHoldem5CommunityKo: cleanSingleLineText(p.baccaratSqueezeAndHoldem5CommunityKo, 180), clayChipDenominationStackIntegrityKo: cleanSingleLineText(p.clayChipDenominationStackIntegrityKo, 180), auctionGavelPodiumAndPaddleNumberKo: cleanSingleLineText(p.auctionGavelPodiumAndPaddleNumberKo, 180) }),
    fallback: () => Object.freeze({ highSocietyGamingScore: 98, baccaratSqueezeAndHoldem5CommunityKo: "바카라 카드 쪼기(Squeeze) 시 긴 변 기호 수(2줄/3줄/4줄)와 숫자 일치, 텍사스 홀덤은 번 카드 분리 후 Flop(3장)-Turn(1장)-River(1장) 총 5장 커뮤니티 카드 정렬", clayChipDenominationStackIntegrityKo: "카지노 칩 스택은 20개 단위 기둥 높이를 맞추고 흑색($100)·보라($500)·황색($1,000)·사각형 플라크(고액권) 색상과 베팅 금액 대사가 일치하도록 고정", auctionGavelPodiumAndPaddleNumberKo: "경매장 경매사 포디움 원형 사운드블록과 의사봉(Gavel), VIP 응찰자의 양면 번호 패들 숫자가 컷이 바뀌어도 절대 변하지 않도록 고정" }),
  });
}

export const AssistGrandPianoViolinCigarWhiskySchema = z.object({
  luxuryConnoisseurScore: z.number().int().min(0).max(100),
  grandPianoRightPropStickAndViolinChinrestKo: z.string(),
  cigarGuillotineAshAndWhiskyIceSphereKo: z.string(),
  bottomlessPortafilterAndMichelinTweezersKo: z.string(),
});
export type AssistGrandPianoViolinCigarWhisky = z.infer<typeof AssistGrandPianoViolinCigarWhiskySchema>;

export async function runAssistGrandPianoLidViolinCigarWhiskyDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistGrandPianoViolinCigarWhisky>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:grand-piano-lid-violin-cigar-whisky-lock",
    systemPrompt: "당신은 음악/미식/느와르 웹툰의 그랜드피아노 우측 덮개 지지대·바이올린 좌측 턱받침/f홀·시가 커터/위스키 아이스볼·네이키드 에스프레소/미슐랭 핀셋 디렉터입니다.",
    userInstruction: "그랜드피아노 상판 개방 방향과 바이올린 구조, 시가 커팅/회백색 재와 위스키 아이스볼, 에스프레소 추출 및 파인다이닝 핀셋을 JSON으로 작성하세요.",
    input,
    schema: AssistGrandPianoViolinCigarWhiskySchema,
    options,
    normalize: (p) => Object.freeze({ luxuryConnoisseurScore: clampWave45(p.luxuryConnoisseurScore, 0, 100, 99), grandPianoRightPropStickAndViolinChinrestKo: cleanSingleLineText(p.grandPianoRightPropStickAndViolinChinrestKo, 180), cigarGuillotineAshAndWhiskyIceSphereKo: cleanSingleLineText(p.cigarGuillotineAshAndWhiskyIceSphereKo, 180), bottomlessPortafilterAndMichelinTweezersKo: cleanSingleLineText(p.bottomlessPortafilterAndMichelinTweezersKo, 180) }),
    fallback: () => Object.freeze({ luxuryConnoisseurScore: 99, grandPianoRightPropStickAndViolinChinrestKo: "그랜드 피아노 상판 덮개 지지대(Prop Stick)는 반드시 연주자 기준 우측(객석 방향)에서 열리며, 바이올린은 테일피스 좌측 턱받침과 대칭 f홀·활 송진 가루 고정", cigarGuillotineAshAndWhiskyIceSphereKo: "시가는 기요틴 커터로 캡 숄더만 절단하고 끝단에 원통형 회백색 재(Ash)를 유지하며, 올드패션드 위스키 잔 내부 투명 구형 아이스볼 굴절과 글렌케언 잔 구분", bottomlessPortafilterAndMichelinTweezersKo: "바텀리스 포타필터 중앙으로 모이는 황금빛 타이거 스킨 에스프레소 줄기와 파인다이닝 주방 보온등(Heat Lamp) 아래 핀셋(Tweezers) 플레이팅 고정" }),
  });
}

export const AssistSupercarF1HaloYachtJetSchema = z.object({
  prestigeMobilityScore: z.number().int().min(0).max(100),
  supercarScissorVsGullwingAndBrakeCaliperKo: z.string(),
  f1HaloTitaniumAndPoloRightHandMalletKo: z.string(),
  superyachtTeakDeckAndPrivateJetClubSeatKo: z.string(),
});
export type AssistSupercarF1HaloYachtJet = z.infer<typeof AssistSupercarF1HaloYachtJetSchema>;

export async function runAssistSupercarDoorF1HaloYachtPrivateJetDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistSupercarF1HaloYachtJet>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:supercar-door-f1-halo-yacht-jet-lock",
    systemPrompt: "당신은 재벌/모터스포츠 웹툰의 슈퍼카 시저/걸윙 도어 경첩·F1 티타늄 헤일로/DRS·폴로 오른손 스틱 규칙·슈퍼요트 티크 데크·프라이빗 제트 클럽시트 디렉터입니다.",
    userInstruction: "슈퍼카 시저도어/걸윙도어와 브레이크 캘리퍼, F1 헤일로와 폴로 오른손 파지 규칙, 슈퍼요트 갑판과 전용기 객실 구조를 JSON으로 작성하세요.",
    input,
    schema: AssistSupercarF1HaloYachtJetSchema,
    options,
    normalize: (p) => Object.freeze({ prestigeMobilityScore: clampWave45(p.prestigeMobilityScore, 0, 100, 99), supercarScissorVsGullwingAndBrakeCaliperKo: cleanSingleLineText(p.supercarScissorVsGullwingAndBrakeCaliperKo, 180), f1HaloTitaniumAndPoloRightHandMalletKo: cleanSingleLineText(p.f1HaloTitaniumAndPoloRightHandMalletKo, 180), superyachtTeakDeckAndPrivateJetClubSeatKo: cleanSingleLineText(p.superyachtTeakDeckAndPrivateJetClubSeatKo, 180) }),
    fallback: () => Object.freeze({ prestigeMobilityScore: 99, supercarScissorVsGullwingAndBrakeCaliperKo: "슈퍼카 시저도어(앞펜더 A필러 힌지 수직 상승)와 걸윙도어(루프 중앙 힌지)를 구분하고 휠 스포크 안쪽 대형 카본세라믹 브레이크 디스크와 캘리퍼 각도 고정", f1HaloTitaniumAndPoloRightHandMalletKo: "F1 오픈휠 머신 조종석 전면 Y자 티타늄 헤일로(Halo) 보호대와 리어윙 DRS 플랩을 유지하고, 승마 폴로 경기는 안전 규칙상 전원 오른손으로만 스틱(Mallet) 파지", superyachtTeakDeckAndPrivateJetClubSeatKo: "슈퍼요트 선미 티크 우드 데크 검은 코킹 줄눈 소실점과 수평선을 맞추고, 프라이빗 제트기는 마주보는 4인 클럽 가죽시트와 타원형 이중 창문 정렬" }),
  });
}

export const AssistDeepSeaSpacesuitCryoPodSchema = z.object({
  extremeHabitatScore: z.number().int().min(0).max(100),
  submersibleAcrylicDomeAndBioluminescenceKo: z.string(),
  issCupola7WindowAndEvaGoldVisorTetherKo: z.string(),
  cryosleepFrostPodAndCherenkovBlueGlowKo: z.string(),
});
export type AssistDeepSeaSpacesuitCryoPod = z.infer<typeof AssistDeepSeaSpacesuitCryoPodSchema>;

export async function runAssistDeepSeaSubmersibleSpacesuitCryoPodDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistDeepSeaSpacesuitCryoPod>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:deep-sea-submersible-spacesuit-cryopod-lock",
    systemPrompt: "당신은 SF/해양 스릴러 웹툰의 심해 잠수정 반구형 아크릴창/유압 집게·우주정거장 7면 큐폴라/금도금 우주복 바이저·동면 포드 성에/체렌코프 청색광 디렉터입니다.",
    userInstruction: "심해 잠수정 아크릴 관측창과 발광 생물, 우주정거장 큐폴라 창과 EVA 우주복 바이저/테더, 콜드슬립 캡슐과 체렌코프 발광을 JSON으로 작성하세요.",
    input,
    schema: AssistDeepSeaSpacesuitCryoPodSchema,
    options,
    normalize: (p) => Object.freeze({ extremeHabitatScore: clampWave45(p.extremeHabitatScore, 0, 100, 99), submersibleAcrylicDomeAndBioluminescenceKo: cleanSingleLineText(p.submersibleAcrylicDomeAndBioluminescenceKo, 180), issCupola7WindowAndEvaGoldVisorTetherKo: cleanSingleLineText(p.issCupola7WindowAndEvaGoldVisorTetherKo, 180), cryosleepFrostPodAndCherenkovBlueGlowKo: cleanSingleLineText(p.cryosleepFrostPodAndCherenkovBlueGlowKo, 180) }),
    fallback: () => Object.freeze({ extremeHabitatScore: 99, submersibleAcrylicDomeAndBioluminescenceKo: "심해 유인 잠수정 전면 두꺼운 반구형 아크릴 관측창 가장자리 굴절과 다관절 유압 매니퓰레이터 집게, 암흑 수중의 청록색 생물발광(Bioluminescence) 고정", issCupola7WindowAndEvaGoldVisorTetherKo: "우주정거장 7면 큐폴라(중앙 원형창+주변 6개 사다리꼴 창) 너머 지구 대기권 푸른 에어글로우 곡률과 선외우주복(EVA) 금도금 바이저 반사·안전 테더 후크 유지", cryosleepFrostPodAndCherenkovBlueGlowKo: "콜드슬립 동면 캡슐 유리창 테두리의 수지상 얼음 결정(Dendritic Frost)과 원자로 수조 내부 체렌코프 복사 특유의 청록색(`#00B4D8`) 수중 발광 고증" }),
  });
}

export const AssistVolcanoGlacierDesertDuneSchema = z.object({
  planetaryGeophysicsScore: z.number().int().min(0).max(100),
  lavaCoolingBlackCrustAndIncandescentCrackKo: z.string(),
  glacierCrevasseBlueLightAndIceAxeArrestKo: z.string(),
  sandDune34DegSlipfaceAndIcebreakerBowKo: z.string(),
});
export type AssistVolcanoGlacierDesertDune = z.infer<typeof AssistVolcanoGlacierDesertDuneSchema>;

export async function runAssistVolcanoLavaGlacierCrevasseDesertDuneDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistVolcanoGlacierDesertDune>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:volcano-lava-glacier-crevasse-desert-director",
    systemPrompt: "당신은 재난/탐험 판타지 웹툰의 화산 용암 냉각 흑각/백열 균열·빙하 크레바스 청색 산란광/피켈 제동·사막 모래언덕 34도 안식각/쇄빙선 총괄 감독입니다.",
    userInstruction: "용암류 검은 냉각 껍질과 균열 발광, 빙하 크레바스 청색광과 아이젠/피켈 고증, 사막 모래언덕 경사각과 쇄빙선 선수 물리를 JSON으로 작성하세요.",
    input,
    schema: AssistVolcanoGlacierDesertDuneSchema,
    options,
    normalize: (p) => Object.freeze({ planetaryGeophysicsScore: clampWave45(p.planetaryGeophysicsScore, 0, 100, 99), lavaCoolingBlackCrustAndIncandescentCrackKo: cleanSingleLineText(p.lavaCoolingBlackCrustAndIncandescentCrackKo, 180), glacierCrevasseBlueLightAndIceAxeArrestKo: cleanSingleLineText(p.glacierCrevasseBlueLightAndIceAxeArrestKo, 180), sandDune34DegSlipfaceAndIcebreakerBowKo: cleanSingleLineText(p.sandDune34DegSlipfaceAndIcebreakerBowKo, 180) }),
    fallback: () => Object.freeze({ planetaryGeophysicsScore: 99, lavaCoolingBlackCrustAndIncandescentCrackKo: "화산 용암류 표면은 공기와 닿아 검회색 현무암 껍질로 굳고, 갈라진 균열 틈새 내부에서만 가장 밝은 황백색→주홍색(`#FF4500`) 흑체복사 백열광이 방출되도록 고정", glacierCrevasseBlueLightAndIceAxeArrestKo: "빙하 크레바스 심부는 적색광 흡수에 의한 고채도 청색 다중산란광을 띠며, 등반가 부츠 12발 아이젠(Crampon)과 피켈(Ice Axe) 피크 설벽 타격 방향 일치", sandDune34DegSlipfaceAndIcebreakerBowKo: "사막 초승달 사구(Barchan)는 바람받이 완경사 물결무늬와 바람그늘 34도 급경사(Slipface)를 구분하고, 극지 쇄빙선은 둥근 스푼형 선수로 해빙 위에 올라타 파쇄" }),
  });
}

export const AssistAircraftCarrierBunkerBsl4Schema = z.object({
  strategicFacilityScore: z.number().int().min(0).max(100),
  carrierCatapultJbdAnd3rdArrestingWireKo: z.string(),
  cargoRampStaticLineAndBunkerBlastDoorKo: z.string(),
  bsl4CoiledAirHoseAndCoolingTowerHyperbolaKo: z.string(),
});
export type AssistAircraftCarrierBunkerBsl4 = z.infer<typeof AssistAircraftCarrierBunkerBsl4Schema>;

export async function runAssistAircraftCarrierCatapultBunkerBsl4Director(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<AssistAircraftCarrierBunkerBsl4>> {
  return executeWave45LocalizeDirector({
    taskId: "localize:aircraft-carrier-catapult-bunker-bsl4-director",
    systemPrompt: "당신은 밀리터리/바이오 스릴러 웹툰의 항공모함 캐터펄트/어레스팅 와이어·수송기 강하 신호등·지하 방공호 방폭문 핸드휠·BSL-4 양압복/냉각탑 총괄 감독입니다.",
    userInstruction: "항공모함 제트편향판과 착함 와이어, 수송기 램프와 지하 벙커 방폭문 기구학, BSL-4 양압 실험복과 발전소 쌍곡면 냉각탑을 JSON으로 작성하세요.",
    input,
    schema: AssistAircraftCarrierBunkerBsl4Schema,
    options,
    normalize: (p) => Object.freeze({ strategicFacilityScore: clampWave45(p.strategicFacilityScore, 0, 100, 99), carrierCatapultJbdAnd3rdArrestingWireKo: cleanSingleLineText(p.carrierCatapultJbdAnd3rdArrestingWireKo, 180), cargoRampStaticLineAndBunkerBlastDoorKo: cleanSingleLineText(p.cargoRampStaticLineAndBunkerBlastDoorKo, 180), bsl4CoiledAirHoseAndCoolingTowerHyperbolaKo: cleanSingleLineText(p.bsl4CoiledAirHoseAndCoolingTowerHyperbolaKo, 180) }),
    fallback: () => Object.freeze({ strategicFacilityScore: 99, carrierCatapultJbdAnd3rdArrestingWireKo: "항공모함 이함 시 후방 제트화염편향판(JBD) 기립과 캐터펄트 증기 궤적을 유지하고, 착함 시 함재기 테일후크가 갑판 어레스팅 와이어를 V자로 당기는 장력 고정", cargoRampStaticLineAndBunkerBlastDoorKo: "수송기 후방 램프 개방 시 천장 와이어 정적줄(Static Line)과 적색→녹색 강하등을 고증하고, 지하 벙커 방폭문은 중앙 핸드휠 회전 시 사방 강철 빗장(Dogs) 연동", bsl4CoiledAirHoseAndCoolingTowerHyperbolaKo: "BSL-4 생물안전 연구소는 천장 노란 나선형 에어호스가 연결된 양압 우주복과 음압 글러브박스를 유지하고, 발전소 냉각탑은 쌍곡면 실루엣과 순백색 수증기 기둥 고정" }),
  });
}
