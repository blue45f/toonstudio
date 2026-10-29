/**
 * 구조화 출력을 쓰는 Claude 보조 기능들의 비용 상한(USD) 계산 — 요청 틀은 `claude-cost-cap`에, 이 기능들만의 보탬(스키마·이미지 크기)은 여기에 둔다.
 *
 * 실행 전 확인(preflight)과 실제 실행이 **같은 함수**로 같은 요청을 재므로 화면에 보인 "최대 비용"과 예산 판정에 쓰인 값이 어긋나지 않는다.
 * 이미지 본문(base64)은 글자 수로 세지 않고 크기로 센다 — 그래서 본문을 비운 요청으로 미리 계산해도 실행 때와 값이 같다.
 */
import { z } from "zod";

import { claudeImageTokenBound, estimateClaudeRequestCostCapUsd, utf8Length } from "@/shared/ai/claude/claude-cost-cap";
import {
  CLAUDE_DEFAULT_MODEL_ID,
  claudeModelInfo,
  claudeModelSupportsEffort,
  estimateClaudeCostUsd,
} from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { resolveClaudeRoute, type ClaudeRoute } from "@/shared/ai/claude/claude-route";
import { cleanSingleLineText } from "@/shared/ai/claude/claude-text";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage, type ClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";

import { resolveCreatorTaskModelRoute, type ClaudeCreatorTaskId } from "./claude-creator-model-router";

import type Anthropic from "@anthropic-ai/sdk";

const schemaTokenCache = new WeakMap<object, number>();
const FALLBACK_SCHEMA_TOKENS = 2_500;

/**
 * 구조화 출력 스키마가 프롬프트에 덧붙는 입력 토큰의 상한. 스키마를 JSON으로 바꾼 글의 UTF-8 바이트 수를 쓴다
 * (토큰은 바이트보다 많을 수 없다). 바꾸지 못하는 스키마는 넉넉한 고정값을 쓴다.
 */
export function claudeSchemaTokenBound(schema: z.ZodType): number {
  const cached = schemaTokenCache.get(schema);
  if (cached !== undefined) return cached;
  let tokens = FALLBACK_SCHEMA_TOKENS;
  try {
    tokens = utf8Length(JSON.stringify(z.toJSONSchema(schema)));
  } catch {
    // 바꿀 수 없는 스키마는 고정값을 쓴다.
  }
  schemaTokenCache.set(schema, tokens);
  return tokens;
}

export interface FeatureCostCapInput {
  readonly model: string;
  readonly request: Pick<Anthropic.MessageCreateParamsNonStreaming, "system" | "messages" | "output_config" | "max_tokens">;
  readonly schema: z.ZodType;
  /** 요청에 이미지가 하나 들어 있으면 그 크기. 크기가 이상하면 null을 돌려준다. */
  readonly image?: { readonly width: number; readonly height: number };
}

/** 구조화 출력 요청 한 번이 낼 수 있는 비용의 상한(USD). 단가를 모르는 모델이거나 이미지 크기가 이상하면 null. */
export function estimateStructuredCostCapUsd({ model, request, schema, image }: FeatureCostCapInput): number | null {
  if (image && !(image.width > 0 && image.height > 0)) return null;
  return estimateClaudeRequestCostCapUsd(model, request, {
    extraInputTokens: claudeSchemaTokenBound(schema),
    ...(image ? { imageTokens: [claudeImageTokenBound(image.width, image.height)] } : {}),
  });
}

/* ============================================================================
 * Wave 33~35 Webtoon Consistency, Lens Optics, Drapery BRDF, Sports Biomechanics,
 * Screentone/G-Pen, VTuber/RPG Splash & Audiotoon/Ergonomics AI Directors (8 Engines)
 * ============================================================================ */

export interface Wave33CostCapAssistInput {
  readonly episodeTitle: string;
  readonly genre: string;
  readonly scriptSummary: string;
  readonly targetCutCount?: number;
}

export interface RunWave33CostCapAssistOptions {
  readonly route?: ClaudeRoute | null;
  readonly model?: string;
  readonly signal?: AbortSignal;
  readonly budgetOverride?: boolean;
  readonly fallbackOnError?: boolean;
}

export interface Wave33CostCapAssistResult<T> {
  readonly taskId: ClaudeCreatorTaskId;
  readonly source: "claude-live" | "deterministic-fallback";
  readonly model: string;
  readonly data: T;
  readonly usage: ClaudeTokenUsage | null;
  readonly estimatedUsd: number | null;
}

function clampWave33(val: number, min: number, max: number, def: number): number {
  return Number.isFinite(val) ? Math.max(min, Math.min(max, Math.round(val))) : def;
}

async function executeWave33CostCapTask<T>(params: {
  readonly taskId: ClaudeCreatorTaskId;
  readonly systemPrompt: string;
  readonly userInstruction: string;
  readonly input: Wave33CostCapAssistInput;
  readonly schema: z.ZodType<T>;
  readonly options: RunWave33CostCapAssistOptions;
  readonly normalize: (parsed: T) => T;
  readonly fallback: () => T;
}): Promise<Wave33CostCapAssistResult<T>> {
  const { taskId, systemPrompt, userInstruction, input, schema, options, normalize, fallback } = params;
  const routed = resolveCreatorTaskModelRoute(taskId, {
    model: options.model as "claude-haiku-5-5" | "claude-sonnet-5-5" | "claude-opus-5-5" | undefined,
  });
  const requestedModel = resolveClaudeRequestModel(routed.model, CLAUDE_DEFAULT_MODEL_ID);
  const activeRoute = options.route !== undefined ? options.route : resolveClaudeRoute();
  if (!activeRoute) {
    return Object.freeze({ taskId, source: "deterministic-fallback", model: requestedModel, data: fallback(), usage: null, estimatedUsd: null });
  }
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: requestedModel,
    max_tokens: 2_048,
    system: systemPrompt,
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

export const ClaudeVehicleCockpitDrivetrainSchema = z.object({
  vehicleContinuityScore: z.number().int().min(0).max(100),
  lhdRhdSteeringAndShifterRuleKo: z.string(),
  seatbeltDiagonalStrapRuleKo: z.string(),
  motorcycleAndBicycleDriveSideKo: z.string(),
});
export type ClaudeVehicleCockpitDrivetrain = z.infer<typeof ClaudeVehicleCockpitDrivetrainSchema>;

export async function runClaudeVehicleCockpitSeatbeltDrivetrainDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeVehicleCockpitDrivetrain>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:lhd-rhd-cockpit-seatbelt-drivetrain-lock",
    systemPrompt: "당신은 웹툰 차량 운전석 좌우핸들(LHD vs RHD)·3점식 안전벨트 대각선 방향·오토바이/자전거 구동계 좌우 반전 작붕을 차단하는 메카닉 고증 감독입니다.",
    userInstruction: "운전석 핸들/기어봉 좌우 규칙, 운전석/조수석 안전벨트 어깨 대각선 규칙, 오토바이/자전거 체인링 우측 구동계 규칙을 JSON으로 작성하세요.",
    input,
    schema: ClaudeVehicleCockpitDrivetrainSchema,
    options,
    normalize: (p) => Object.freeze({ vehicleContinuityScore: clampWave33(p.vehicleContinuityScore, 0, 100, 99), lhdRhdSteeringAndShifterRuleKo: cleanSingleLineText(p.lhdRhdSteeringAndShifterRuleKo, 180), seatbeltDiagonalStrapRuleKo: cleanSingleLineText(p.seatbeltDiagonalStrapRuleKo, 180), motorcycleAndBicycleDriveSideKo: cleanSingleLineText(p.motorcycleAndBicycleDriveSideKo, 180) }),
    fallback: () => Object.freeze({ vehicleContinuityScore: 99, lhdRhdSteeringAndShifterRuleKo: "한국·미국 배경은 좌핸들(LHD: 운전석 좌측, 오른손 기어 조작) 고정 및 캔버스 좌우 반전으로 우핸들화되는 작붕 차단", seatbeltDiagonalStrapRuleKo: "좌핸들 기준 운전석은 왼쪽 어깨→오른쪽 골반(\\), 조수석은 오른쪽 어깨→왼쪽 골반(/) 3점식 안전벨트 사선 고정", motorcycleAndBicycleDriveSideKo: "오토바이 오른손 스로틀·왼손 클러치 고정 및 자전거 체인·크랭크·변속기(Derailleur)는 반드시 우측(Drive-Side) 고정" }),
  });
}

export const ClaudeScreentoneMoireGpenSchema = z.object({
  inkingIntegrityScore: z.number().int().min(0).max(100),
  screentoneLpiAndAngleRuleKo: z.string(),
  gpenThreeTierLineWeightKo: z.string(),
  sumiDryBrushAndSplatterKo: z.string(),
});
export type ClaudeScreentoneMoireGpen = z.infer<typeof ClaudeScreentoneMoireGpenSchema>;

export async function runClaudeScreentoneMoireGpenHierarchyDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeScreentoneMoireGpen>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:screentone-lpi-moire-gpen-hierarchy-lock",
    systemPrompt: "당신은 웹툰/만화 망점 스크린톤(60L 45° 모아레 방지)과 G펜(실루엣)·마루펜(내부 디테일) 3단 선굵기 위계를 감독하는 펜선 디렉터입니다.",
    userInstruction: "스크린톤 선수와 각도(모아레 방지), G펜/마루펜 3단 선굵기 위계, 갈필(Kasuri) 및 먹물 비산 방향 규칙을 JSON으로 작성하세요.",
    input,
    schema: ClaudeScreentoneMoireGpenSchema,
    options,
    normalize: (p) => Object.freeze({ inkingIntegrityScore: clampWave33(p.inkingIntegrityScore, 0, 100, 98), screentoneLpiAndAngleRuleKo: cleanSingleLineText(p.screentoneLpiAndAngleRuleKo, 180), gpenThreeTierLineWeightKo: cleanSingleLineText(p.gpenThreeTierLineWeightKo, 180), sumiDryBrushAndSplatterKo: cleanSingleLineText(p.sumiDryBrushAndSplatterKo, 160) }),
    fallback: () => Object.freeze({ inkingIntegrityScore: 98, screentoneLpiAndAngleRuleKo: "60선(60 LPI) 망점 45° 회전 고정 및 2종 중첩 시 각도 차이 0° 유지로 모바일 리사이즈 모아레(Moiré) 격자 간섭 차단", gpenThreeTierLineWeightKo: "1단 외곽 실루엣 G펜(4.5px) → 2단 의상 주름/턱선(2.6px) → 3단 홍채/머리카락 잔결 마루펜(1.3px) 위계 고정", sumiDryBrushAndSplatterKo: "검기 타격 순간 모필 갈필(Kasuri) 붓털 갈라짐 방향을 검 궤적 접선 벡터와 일치" }),
  });
}

export const ClaudeAnamorphicFisheyeLensSchema = z.object({
  lensOpticsScore: z.number().int().min(0).max(100),
  anamorphicBokehAndFlareKo: z.string(),
  fisheyeAndTelephotoRuleKo: z.string(),
  dutchTiltAndSplitDiopterKo: z.string(),
});
export type ClaudeAnamorphicFisheyeLens = z.infer<typeof ClaudeAnamorphicFisheyeLensSchema>;

export async function runClaudeAnamorphicFisheyeLensOpticsDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeAnamorphicFisheyeLens>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:anamorphic-fisheye-dutch-lens-optics-lock",
    systemPrompt: "당신은 웹툰 시네마틱 카메라 렌즈 광학(아나모픽 2x 타원 보케·8mm 어안 5점 투시·200mm 망원 공간 압축·더치 틸트·스플릿 디옵터) 촬영 감독입니다.",
    userInstruction: "아나모픽 타원 보케와 수평 플레어, 어안/망원 렌즈 왜곡 규칙, 더치 틸트 중력 분리 및 스플릿 디옵터 연출을 JSON으로 작성하세요.",
    input,
    schema: ClaudeAnamorphicFisheyeLensSchema,
    options,
    normalize: (p) => Object.freeze({ lensOpticsScore: clampWave33(p.lensOpticsScore, 0, 100, 97), anamorphicBokehAndFlareKo: cleanSingleLineText(p.anamorphicBokehAndFlareKo, 180), fisheyeAndTelephotoRuleKo: cleanSingleLineText(p.fisheyeAndTelephotoRuleKo, 180), dutchTiltAndSplitDiopterKo: cleanSingleLineText(p.dutchTiltAndSplitDiopterKo, 180) }),
    fallback: () => Object.freeze({ lensOpticsScore: 97, anamorphicBokehAndFlareKo: "아나모픽 2.0x 스퀴즈 렌즈 기준 배경 빛망울을 1:2 수직 타원형 보케로 렌더링하고 광원에서 수평 시안 스트릭 플레어 방사", fisheyeAndTelephotoRuleKo: "위협 클로즈업은 14mm 초광각 단축법(3.2x) 적용, 등 뒤 거대 보름달/성채 대치는 200mm 망원 공간 압축 적용", dutchTiltAndSplitDiopterKo: "카메라를 22° 기울인 더치 틸트 컷에서도 빗줄기·눈물·귀걸이는 지구 중력 방향(-22° 역보정) 유지 + 스플릿 디옵터 전후방 동시 초점" }),
  });
}

export const ClaudeDrapery7FoldsBrdfSchema = z.object({
  fabricPhysicsScore: z.number().int().min(0).max(100),
  hogarthFoldTensionOriginKo: z.string(),
  velvetAndSilkBrdfSpecKo: z.string(),
  sheerOrganzaAndKnitUvKo: z.string(),
});
export type ClaudeDrapery7FoldsBrdf = z.infer<typeof ClaudeDrapery7FoldsBrdfSchema>;

export async function runClaudeDrapery7FoldsMaterialBrdfDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeDrapery7FoldsBrdf>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:drapery-7folds-velvet-satin-brdf-lock",
    systemPrompt: "당신은 번 호가스 7대 의상 주름 역학(파이프·지그재그·나선·반잠금·다이퍼)과 로판 벨벳·실크·시스루·니트 재질 BRDF 셰이딩 감독입니다.",
    userInstruction: "관절 인장 기점별 주름 분류, 벨벳(역프레넬)/실크(이방성) 광택 규칙, 시스루 오간자/니트 곡면 UV 규칙을 JSON으로 작성하세요.",
    input,
    schema: ClaudeDrapery7FoldsBrdfSchema,
    options,
    normalize: (p) => Object.freeze({ fabricPhysicsScore: clampWave33(p.fabricPhysicsScore, 0, 100, 98), hogarthFoldTensionOriginKo: cleanSingleLineText(p.hogarthFoldTensionOriginKo, 180), velvetAndSilkBrdfSpecKo: cleanSingleLineText(p.velvetAndSilkBrdfSpecKo, 180), sheerOrganzaAndKnitUvKo: cleanSingleLineText(p.sheerOrganzaAndKnitUvKo, 180) }),
    fallback: () => Object.freeze({ fabricPhysicsScore: 98, hogarthFoldTensionOriginKo: "어깨·단추 고정점은 방사형 인장 주름, 팔꿈치·무릎 오금은 나선(Spiral)+반잠금(Half-Lock) 지그재그 주름으로 기점 통일", velvetAndSilkBrdfSpecKo: "벨벳 망토는 정면 코어를 가장 어둡게 깔고 외곽 접선에 역프레넬 은빛 윤기 부여, 실크 드레스는 날카로운 이방성 띠 하이라이트 적용", sheerOrganzaAndKnitUvKo: "시스루 베일은 정면 투과율 75%·접선 주름 불투명도 90% 물리 감쇠 적용 및 니트 꽈배기 무늬의 팔 원기둥 3D 곡면 추종" }),
  });
}

export const ClaudeSportsBiomechanicsSchema = z.object({
  biomechanicsScore: z.number().int().min(0).max(100),
  contraLateralSprintGaitKo: z.string(),
  ballSportsGripAndReleaseKo: z.string(),
  combatAndSkatingEdgeRuleKo: z.string(),
});
export type ClaudeSportsBiomechanics = z.infer<typeof ClaudeSportsBiomechanicsSchema>;

export async function runClaudeSportsBiomechanicsGaitGripDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeSportsBiomechanics>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:sports-biomechanics-gait-grip-edge-lock",
    systemPrompt: "당신은 액션·스포츠 웹툰의 인체역학(질주 교차 보행·배구 스파이크·농구 슈팅핸드·피겨 스케이트 에지·볼링/골프 그립) 고증 감독입니다.",
    userInstruction: "질주 시 팔다리 교차 보행 규칙, 구기 종목 파지/릴리즈 해부학, 무도 축발 및 빙상 에지 규칙을 JSON으로 작성하세요.",
    input,
    schema: ClaudeSportsBiomechanicsSchema,
    options,
    normalize: (p) => Object.freeze({ biomechanicsScore: clampWave33(p.biomechanicsScore, 0, 100, 98), contraLateralSprintGaitKo: cleanSingleLineText(p.contraLateralSprintGaitKo, 180), ballSportsGripAndReleaseKo: cleanSingleLineText(p.ballSportsGripAndReleaseKo, 180), combatAndSkatingEdgeRuleKo: cleanSingleLineText(p.combatAndSkatingEdgeRuleKo, 180) }),
    fallback: () => Object.freeze({ biomechanicsScore: 98, contraLateralSprintGaitKo: "전력 질주 시 오른발이 전방 리드할 때 반드시 왼팔이 전방 스윙하는 교차 보행(Contra-lateral Gait) 고정(동측 팔다리 전진 작붕 차단)", ballSportsGripAndReleaseKo: "농구 슈팅핸드(오른손 거위목 스냅)+가이드핸드(왼손 측면 분리), 볼링공 중지·약지·엄지 삽입, 오른손 골퍼 왼손 장갑 단독 착용 고정", combatAndSkatingEdgeRuleKo: "태권도 돌려차기 시 바닥 축발 뒤꿈치 180° 회전 및 피겨 악셀(전방 도약)/러츠(후방 아웃에지) 빙판 궤적 고증" }),
  });
}

export const ClaudeVtuberVnSpriteMerchSchema = z.object({
  ipAssetReadinessScore: z.number().int().min(0).max(100),
  vtuberArkitBlendshapeSpecKo: z.string(),
  vnSpriteBlinkAndMouthSheetKo: z.string(),
  canBadgeAndLenticularSpecKo: z.string(),
});
export type ClaudeVtuberVnSpriteMerch = z.infer<typeof ClaudeVtuberVnSpriteMerchSchema>;

export async function runClaudeVtuberArkit52VnSpriteMerchDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeVtuberVnSpriteMerch>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:vtuber-arkit52-vn-sprite-canbadge-lock",
    systemPrompt: "당신은 웹툰 캐릭터의 버튜버(Live2D ARKit 52)·비주얼노벨 스탠딩 스프라이트·58mm 캔배지 및 렌티큘러 엽서 제작을 총괄하는 IP 기술 감독입니다.",
    userInstruction: "Live2D VBridger ARKit 52 파츠 분리, 비주얼노벨 눈깜빡임/5모음 입모양 시트, 58mm 캔배지 도련 및 렌티큘러 규격을 JSON으로 작성하세요.",
    input,
    schema: ClaudeVtuberVnSpriteMerchSchema,
    options,
    normalize: (p) => Object.freeze({ ipAssetReadinessScore: clampWave33(p.ipAssetReadinessScore, 0, 100, 97), vtuberArkitBlendshapeSpecKo: cleanSingleLineText(p.vtuberArkitBlendshapeSpecKo, 180), vnSpriteBlinkAndMouthSheetKo: cleanSingleLineText(p.vnSpriteBlinkAndMouthSheetKo, 180), canBadgeAndLenticularSpecKo: cleanSingleLineText(p.canBadgeAndLenticularSpecKo, 180) }),
    fallback: () => Object.freeze({ ipAssetReadinessScore: 97, vtuberArkitBlendshapeSpecKo: "Live2D PSD 눈꺼풀·공막·홍채·하이라이트·윗입술·아랫입술·구강내부·혀 등 84개 레이어 분리 및 CheekPuff/JawOpen 물리 연동", vnSpriteBlinkAndMouthSheetKo: "스탠딩 일러스트 눈깜빡임 3프레임(Open·Half·Closed) + 대사 립싱크용 5모음(아·이·우·에·오)+닫힌입 델타 스프라이트 시트 생성", canBadgeAndLenticularSpecKo: "58mm 캔배지 외곽 6mm 말림 도련(총 70mm 원형 재단, 안면 50mm 안전원 내부 배치) 및 75 LPI 2-Flip 렌티큘러 실루엣 정렬" }),
  });
}

export const ClaudeGachaSsrRpgCutsceneSchema = z.object({
  gameAdaptationScore: z.number().int().min(0).max(100),
  fivePlaneSplashArtParallaxKo: z.string(),
  ultimateSkillCutsceneCameraKo: z.string(),
  hitboxAndHitStopFrameSpecKo: z.string(),
});
export type ClaudeGachaSsrRpgCutscene = z.infer<typeof ClaudeGachaSsrRpgCutsceneSchema>;

export async function runClaudeGachaSsrSplashRpgSkillCutsceneDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeGachaSsrRpgCutscene>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:gacha-ssr-splash-rpg-skill-cutscene-director",
    systemPrompt: "당신은 웹툰 원작 모바일 수집형 RPG의 SSR 캐릭터 5평면 스플래시 아트·3초 궁극기 컷신 카메라·타격 히트스톱(Hit-Stop)을 설계하는 게임 아트 총괄 감독입니다.",
    userInstruction: "SSR 스플래시 아트 5평면 패럴랙스 분리, 3초 궁극기 카메라 워크, 히트박스 및 타격 역경직 프레임을 JSON으로 작성하세요.",
    input,
    schema: ClaudeGachaSsrRpgCutsceneSchema,
    options,
    normalize: (p) => Object.freeze({ gameAdaptationScore: clampWave33(p.gameAdaptationScore, 0, 100, 97), fivePlaneSplashArtParallaxKo: cleanSingleLineText(p.fivePlaneSplashArtParallaxKo, 180), ultimateSkillCutsceneCameraKo: cleanSingleLineText(p.ultimateSkillCutsceneCameraKo, 180), hitboxAndHitStopFrameSpecKo: cleanSingleLineText(p.hitboxAndHitStopFrameSpecKo, 180) }),
    fallback: () => Object.freeze({ gameAdaptationScore: 97, fivePlaneSplashArtParallaxKo: "L1 배경 성좌 문양 → L2 거대 소환수/잔상 → L3 캐릭터 본체 → L4 전경 검기 슬래시 → L5 불꽃/마나 파티클 5평면 자이로 패럴랙스 분리", ultimateSkillCutsceneCameraKo: "0.0~0.8초 안면 마안 개안 익스트림 클로즈업 → 0.8~1.8초 180° 오빗 카메라 줌아웃 → 1.8~3.0초 전화면 공간 절단 피니시", hitboxAndHitStopFrameSpecKo: "60fps 기준 타격 임팩트 순간 5프레임(83ms) 역경직(Hit-Stop) + 1프레임 흑백 반전 임팩트 플래시 + 카메라 Y축 쉐이크 부여" }),
  });
}

export const ClaudeAudiotoonAdrTactileErgoSchema = z.object({
  productionAccessibilityScore: z.number().int().min(0).max(100),
  adrTimecodeAndBreathCueKo: z.string(),
  brailleTactileLineSimplifyKo: z.string(),
  artistWristStrokeBudgetKo: z.string(),
});
export type ClaudeAudiotoonAdrTactileErgo = z.infer<typeof ClaudeAudiotoonAdrTactileErgoSchema>;

export async function runClaudeAudiotoonAdrTactileErgonomicsDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeAudiotoonAdrTactileErgo>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:audiotoon-adr-timecode-tactile-ergo-director",
    systemPrompt: "당신은 오디오웹툰 성우 ADR 타임코드 대본·시각장애인용 촉각 그래픽 양각선(2.5mm 간격) 변환·주간 70컷 작가 손목 필압 피로도(Stroke Budget)를 총괄하는 감독입니다.",
    userInstruction: "성우 호흡/마이크 근접 타임코드 큐, 점자 촉각 그래픽 선 단순화 규칙, 작가 손목 보호를 위한 컷당 펜 터치 예산을 JSON으로 작성하세요.",
    input,
    schema: ClaudeAudiotoonAdrTactileErgoSchema,
    options,
    normalize: (p) => Object.freeze({ productionAccessibilityScore: clampWave33(p.productionAccessibilityScore, 0, 100, 98), adrTimecodeAndBreathCueKo: cleanSingleLineText(p.adrTimecodeAndBreathCueKo, 180), brailleTactileLineSimplifyKo: cleanSingleLineText(p.brailleTactileLineSimplifyKo, 180), artistWristStrokeBudgetKo: cleanSingleLineText(p.artistWristStrokeBudgetKo, 180) }),
    fallback: () => Object.freeze({ productionAccessibilityScore: 98, adrTimecodeAndBreathCueKo: "[00:14.20] (짧은 들숨 #Inhale) → 근접 마이크 독백(-16 LUFS) → [00:17.80] 검집 결속 금속 폴리 사운드 정밀 동기화", brailleTactileLineSimplifyKo: "시각장애인 촉각 도서 변환 시 배경 해칭/스크린톤을 100% 제거하고 인물 실루엣 양각선(최소 간격 2.5mm, 높이 0.5mm)과 점자 말풍선 배치", artistWristStrokeBudgetKo: "주간 70컷 연재 기준 컷당 수동 펜 스트로크 상한을 180회로 제한하고 초과 배경/체인은 3D 스냅 및 리본 브러시로 자동 전환해 손목 터널 증후군 예방" }),
  });
}

/* ============================================================================
 * Wave 36~38 RoFan Aristocracy, Castle/Waltz, Hunter/Dungeon, Cyberpunk/Military,
 * Shaman/Exorcism, Forensic Luminol & Locked-Room Mystery AI Directors (8 Engines)
 * ============================================================================ */

export const ClaudeRofanCorsetSashEtiquetteSchema = z.object({
  aristocracyEtiquetteScore: z.number().int().min(0).max(100),
  corsetBuskAndOrderSashRuleKo: z.string(),
  signetRingIntaglioAndNibKo: z.string(),
  teacupAndStemwareHoldRuleKo: z.string(),
});
export type ClaudeRofanCorsetSashEtiquette = z.infer<typeof ClaudeRofanCorsetSashEtiquetteSchema>;

export async function runClaudeRofanCorsetSashSignetEtiquetteDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeRofanCorsetSashEtiquette>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:rofan-corset-sash-signet-etiquette-lock",
    systemPrompt: "당신은 로맨스판타지(로판) 서양 귀족 복식(코르셋 버스/레이싱·대훈장 어깨띠)·인장반지 음각·다과회 찻잔 에티켓 고증 감독입니다.",
    userInstruction: "코르셋 앞뒤 구조와 대훈장 어깨띠 대각선, 인장반지 음각/만년필 펜촉 방향, 찻잔/와인잔 파지 매너를 JSON으로 작성하세요.",
    input,
    schema: ClaudeRofanCorsetSashEtiquetteSchema,
    options,
    normalize: (p) => Object.freeze({ aristocracyEtiquetteScore: clampWave33(p.aristocracyEtiquetteScore, 0, 100, 99), corsetBuskAndOrderSashRuleKo: cleanSingleLineText(p.corsetBuskAndOrderSashRuleKo, 180), signetRingIntaglioAndNibKo: cleanSingleLineText(p.signetRingIntaglioAndNibKo, 180), teacupAndStemwareHoldRuleKo: cleanSingleLineText(p.teacupAndStemwareHoldRuleKo, 180) }),
    fallback: () => Object.freeze({ aristocracyEtiquetteScore: 99, corsetBuskAndOrderSashRuleKo: "코르셋 전면은 금속 버스(Busk) 잠금쇠·후면은 십자 끈(Back Lacing) 고정 및 황실 대훈장 어깨띠(Order Sash) 우어깨→좌골반 사선 고정", signetRingIntaglioAndNibKo: "인장 반지(Signet Ring)는 좌우반전 음각(Intaglio)·봉랍은 양각 정방향 고정 및 만년필 펜촉 숨구멍(Breather Hole) 상방 노출 고정", teacupAndStemwareHoldRuleKo: "다과회 찻잔 손잡이는 엄지·검지로 집고 새끼손가락을 세우지 않으며(No Pinky Up), 샴페인/와인잔은 볼이 아닌 스템(다리) 파지 고정" }),
  });
}

export const ClaudePocketWatchChessBadukSchema = z.object({
  propPrecisionScore: z.number().int().min(0).max(100),
  romanWatchDialFourRuleKo: z.string(),
  chessWhiteOnRightAndQueenKo: z.string(),
  badukStoneGripAndCardFanKo: z.string(),
});
export type ClaudePocketWatchChessBaduk = z.infer<typeof ClaudePocketWatchChessBadukSchema>;

export async function runClaudePocketWatchIiiiChessBadukBoardDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudePocketWatchChessBaduk>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:pocket-watch-iiii-chess-baduk-board-lock",
    systemPrompt: "당신은 회중시계 로마자 4시(IIII) 표기·체스판 우하단 백색칸(White-on-Right)·바둑 착점 파지·트럼프 부채꼴 인덱스를 감리하는 소품 감독입니다.",
    userInstruction: "로마자 시계 4시 표기 규칙, 체스판 우하단 칸 색상 및 퀸 배치, 바둑돌 파지법과 트럼프 카드 펼침 방향을 JSON으로 작성하세요.",
    input,
    schema: ClaudePocketWatchChessBadukSchema,
    options,
    normalize: (p) => Object.freeze({ propPrecisionScore: clampWave33(p.propPrecisionScore, 0, 100, 99), romanWatchDialFourRuleKo: cleanSingleLineText(p.romanWatchDialFourRuleKo, 180), chessWhiteOnRightAndQueenKo: cleanSingleLineText(p.chessWhiteOnRightAndQueenKo, 180), badukStoneGripAndCardFanKo: cleanSingleLineText(p.badukStoneGripAndCardFanKo, 180) }),
    fallback: () => Object.freeze({ propPrecisionScore: 99, romanWatchDialFourRuleKo: "전통 회중시계·괘종시계 로마자 다이얼의 4시 방향은 VIII과의 대칭 균형을 위해 'IV'가 아닌 'IIII'로 표기 고정", chessWhiteOnRightAndQueenKo: "체스판 대국자 기준 우측 하단 모서리(h1/a8)는 반드시 밝은 칸(White-on-Right)이며 백퀸은 백색 칸(d1)·흑퀸은 흑색 칸(d8) 배치 고정", badukStoneGripAndCardFanKo: "19줄 바둑판 9화점 정합성 유지 및 검지(하)·중지(상) 사이에 바둑돌을 끼워 착점, 트럼프 부채꼴 펼침 시 좌상단 인덱스 노출 고정" }),
  });
}

export const ClaudeCastleStairCarriageWaltzSchema = z.object({
  historicalStagingScore: z.number().int().min(0).max(100),
  spiralStairAndPortcullisKo: z.string(),
  landauCarriageWheelAndSpringKo: z.string(),
  waltzClosedFrameHandRuleKo: z.string(),
});
export type ClaudeCastleStairCarriageWaltz = z.infer<typeof ClaudeCastleStairCarriageWaltzSchema>;

export async function runClaudeCastleClockwiseStairCarriageWaltzDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeCastleStairCarriageWaltz>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:castle-clockwise-stair-carriage-waltz-lock",
    systemPrompt: "당신은 중세 성탑 시계방향 나선계단·로판 4두 마차(작은 앞바퀴/C-스프링)·무도회 왈츠 홀드 프레임을 감독하는 시대극 연출 디렉터입니다.",
    userInstruction: "중세 성탑 나선계단 감김 방향, 마차 앞뒷바퀴 크기 차이와 현가장치, 무도회 왈츠 남녀 손 위치를 JSON으로 작성하세요.",
    input,
    schema: ClaudeCastleStairCarriageWaltzSchema,
    options,
    normalize: (p) => Object.freeze({ historicalStagingScore: clampWave33(p.historicalStagingScore, 0, 100, 98), spiralStairAndPortcullisKo: cleanSingleLineText(p.spiralStairAndPortcullisKo, 180), landauCarriageWheelAndSpringKo: cleanSingleLineText(p.landauCarriageWheelAndSpringKo, 180), waltzClosedFrameHandRuleKo: cleanSingleLineText(p.waltzClosedFrameHandRuleKo, 180) }),
    fallback: () => Object.freeze({ historicalStagingScore: 98, spiralStairAndPortcullisKo: "중세 성탑 나선계단은 수비병의 오른손 검격 공간 확보를 위해 올라갈 때 시계방향(Clockwise)으로 감기는 구조 고정", landauCarriageWheelAndSpringKo: "귀족 사륜마차(Landau)는 조향 회전각 확보를 위해 앞바퀴 직경이 뒷바퀴보다 작고 C-스프링/판스프링에 차체가 현가되는 비례 고정", waltzClosedFrameHandRuleKo: "무도회 왈츠 클로즈드 프레임에서 남성 오른손은 여성 왼쪽 견갑골 하단 지지, 남성 왼손과 여성 오른손은 눈높이 결합 고정" }),
  });
}

export const ClaudeHunterGateRaidInventorySchema = z.object({
  dungeonContinuityScore: z.number().int().min(0).max(100),
  gateRankColorAndConstellationKo: z.string(),
  fiveManRaidSpatialFormationKo: z.string(),
  subspaceRippleAndPotionMeniscusKo: z.string(),
});
export type ClaudeHunterGateRaidInventory = z.infer<typeof ClaudeHunterGateRaidInventorySchema>;

export async function runClaudeHunterGateRaidPartyInventoryDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeHunterGateRaidInventory>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:hunter-gate-raid-party-inventory-potion-lock",
    systemPrompt: "당신은 헌터/성좌/던전 웹툰의 등급별 게이트 색상·5인 레이드 파티 진형·아공간 인벤토리 파문·포션 액체 수평면(Meniscus) 감독입니다.",
    userInstruction: "게이트 등급별 색상과 성좌 알림창, 5인 레이드 전후열 진형, 아공간 무기 수납 파문과 포션 수평면 규칙을 JSON으로 작성하세요.",
    input,
    schema: ClaudeHunterGateRaidInventorySchema,
    options,
    normalize: (p) => Object.freeze({ dungeonContinuityScore: clampWave33(p.dungeonContinuityScore, 0, 100, 98), gateRankColorAndConstellationKo: cleanSingleLineText(p.gateRankColorAndConstellationKo, 180), fiveManRaidSpatialFormationKo: cleanSingleLineText(p.fiveManRaidSpatialFormationKo, 180), subspaceRippleAndPotionMeniscusKo: cleanSingleLineText(p.subspaceRippleAndPotionMeniscusKo, 180) }),
    fallback: () => Object.freeze({ dungeonContinuityScore: 98, gateRankColorAndConstellationKo: "일반 게이트(청색) → 고위험 변이(자색) → S급 레드게이트/던전브레이크(진홍색+금빛 왜곡) 스펙트럼 및 성좌 후원창 안면 비가림 배치", fiveManRaidSpatialFormationKo: "전열 메인탱커(12시 보스 어그로 고정) · 측면 근딜/암살자(3시/9시 백어택) · 후열 마법사/힐러(6시 캐스팅 보호) 5인 진형 고정", subspaceRippleAndPotionMeniscusKo: "아공간 인벤토리 금빛 파문 평면에서 무기 단면 클리핑 마스크 적용 및 기울어진 포션 유리병 내부 액체 수면의 지구 지평선 수평 유지" }),
  });
}

export const ClaudeCyberpunkMechaTacticalSchema = z.object({
  sciFiTacticalScore: z.number().int().min(0).max(100),
  neuralJackAndProstheticSeamKo: z.string(),
  pauldronClearanceAndMechaCockpitKo: z.string(),
  plateCarrierMagAndQuadNvgKo: z.string(),
});
export type ClaudeCyberpunkMechaTactical = z.infer<typeof ClaudeCyberpunkMechaTacticalSchema>;

export async function runClaudeCyberpunkProstheticMechaTacticalDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeCyberpunkMechaTactical>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:cyberpunk-prosthetic-mecha-nvg-molle-lock",
    systemPrompt: "당신은 사이버펑크 기계의수 파팅라인·강화복 어깨장갑 가동범위·전술 방탄복 탄창 방향·4안 야간투시경을 감독하는 SF/밀리터리 디렉터입니다.",
    userInstruction: "신경포트/기계의수 결합선, 강화복 어깨장갑 자기충돌 방지와 메카 콕핏, 방탄복 탄창 방향과 야투경 반사광을 JSON으로 작성하세요.",
    input,
    schema: ClaudeCyberpunkMechaTacticalSchema,
    options,
    normalize: (p) => Object.freeze({ sciFiTacticalScore: clampWave33(p.sciFiTacticalScore, 0, 100, 98), neuralJackAndProstheticSeamKo: cleanSingleLineText(p.neuralJackAndProstheticSeamKo, 180), pauldronClearanceAndMechaCockpitKo: cleanSingleLineText(p.pauldronClearanceAndMechaCockpitKo, 180), plateCarrierMagAndQuadNvgKo: cleanSingleLineText(p.plateCarrierMagAndQuadNvgKo, 180) }),
    fallback: () => Object.freeze({ sciFiTacticalScore: 98, neuralJackAndProstheticSeamKo: "후두부 신경 데이터포트 광케이블 장력 유지 및 생체 삼각근↔티타늄 기계의수 결합 파팅라인·전완근 방열 슬릿 위치 고정", pauldronClearanceAndMechaCockpitKo: "강화복 상완 거상 시 어깨장갑(Pauldron)이 2단 힌지로 외측 슬라이드되어 헬멧 관통(Self-Collision) 작붕 원천 차단", plateCarrierMagAndQuadNvgKo: "전술 방탄복 전면 3연장 탄창은 탄두 하향·곡률 좌측(오른손 맥풀 파지용) 고정 및 4안 야투경(GPNVG-18) 안면 초록 반사광 부여" }),
  });
}

export const ClaudeShamanExorcismTalismanSchema = z.object({
  occultAuthenticityScore: z.number().int().min(0).max(100),
  shamanBellAndFanHandRuleKo: z.string(),
  cinnabarTalismanAndKujiInKo: z.string(),
  exorcismStoleAndCrucifixRuleKo: z.string(),
});
export type ClaudeShamanExorcismTalisman = z.infer<typeof ClaudeShamanExorcismTalismanSchema>;

export async function runClaudeShamanGutExorcismTalismanDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeShamanExorcismTalisman>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:shaman-gut-exorcism-talisman-onmyoji-lock",
    systemPrompt: "당신은 한국 무속(왼손 방울/오른손 부채)·괴황지 경면주사 부적·가톨릭 구마 사제 영대·음양사 구자수인 고증을 담당하는 오컬트 감독입니다.",
    userInstruction: "무당 방울/부채 좌우 파지 규칙, 노란 괴황지 부적과 구자호신법 수인, 구마 사제 보라색 영대와 십자가 파지를 JSON으로 작성하세요.",
    input,
    schema: ClaudeShamanExorcismTalismanSchema,
    options,
    normalize: (p) => Object.freeze({ occultAuthenticityScore: clampWave33(p.occultAuthenticityScore, 0, 100, 99), shamanBellAndFanHandRuleKo: cleanSingleLineText(p.shamanBellAndFanHandRuleKo, 180), cinnabarTalismanAndKujiInKo: cleanSingleLineText(p.cinnabarTalismanAndKujiInKo, 180), exorcismStoleAndCrucifixRuleKo: cleanSingleLineText(p.exorcismStoleAndCrucifixRuleKo, 180) }),
    fallback: () => Object.freeze({ occultAuthenticityScore: 99, shamanBellAndFanHandRuleKo: "한국 전통 굿거리에서 무당은 왼손에 칠성방울(요령)을 흔들고 오른손에 삼불제석 부채를 펼치는 좌우 지물 원칙 고정", cinnabarTalismanAndKujiInKo: "괴황지(노란 한지) 위 경면주사 붉은 부적 획순 유지 및 소각 시 청적색 탄화 발광, 구자호신법(임병투자개진열재전) 손가락 교차 고증", exorcismStoleAndCrucifixRuleKo: "구마 사제는 검은 수단 위 보라색 영대(Stole) 착용, 오른손 십자가 눈높이 거양, 왼손 구마경식서/성수채 파지 고정" }),
  });
}

export const ClaudeForensicLuminolAutopsySchema = z.object({
  forensicRigorScore: z.number().int().min(0).max(100),
  luminolBlueGlowAndEvidenceTentKo: z.string(),
  interrogationMirrorLightingRuleKo: z.string(),
  polygraphAndAutopsySuiteSpecKo: z.string(),
});
export type ClaudeForensicLuminolAutopsy = z.infer<typeof ClaudeForensicLuminolAutopsySchema>;

export async function runClaudeForensicLuminolAutopsySceneDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeForensicLuminolAutopsy>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:forensic-luminol-blood-spatter-autopsy-director",
    systemPrompt: "당신은 과학수사 루미놀 425nm 청백색 발광·사건현장 노란 증거 번호판·취조실 단방향 거울 물리 조건·부검실/폴리그라프를 총괄하는 법의학 감독입니다.",
    userInstruction: "루미놀 혈흔 발광 색상과 증거 번호판 고정, 취조실 단방향 거울 조도 조건, 거짓말탐지기 센서 및 부검실 고증을 JSON으로 작성하세요.",
    input,
    schema: ClaudeForensicLuminolAutopsySchema,
    options,
    normalize: (p) => Object.freeze({ forensicRigorScore: clampWave33(p.forensicRigorScore, 0, 100, 99), luminolBlueGlowAndEvidenceTentKo: cleanSingleLineText(p.luminolBlueGlowAndEvidenceTentKo, 180), interrogationMirrorLightingRuleKo: cleanSingleLineText(p.interrogationMirrorLightingRuleKo, 180), polygraphAndAutopsySuiteSpecKo: cleanSingleLineText(p.polygraphAndAutopsySuiteSpecKo, 180) }),
    fallback: () => Object.freeze({ forensicRigorScore: 99, luminolBlueGlowAndEvidenceTentKo: "암실 루미놀 혈흔 반응은 425nm 파장의 창백한 청백색(#38BDF8) 화학발광으로 표현하며 현장 노란 증거 번호판(1~9) 좌표 불변 고정", interrogationMirrorLightingRuleKo: "단방향 거울(Two-Way Mirror) 작동 원리상 취조실은 고조도 밝은 조명, 형사 참관실은 암실 조명을 유지해 역투과 작붕 차단", polygraphAndAutopsySuiteSpecKo: "폴리그라프 흉부/복부 호흡 벨트 2줄·손끝 EDA 센서·혈압 커프 3종 동시 착용 및 부검실 타공 스테인리스 배수 테이블 고증" }),
  });
}

export const ClaudeLockedRoomCipherArchaeologySchema = z.object({
  mysteryLogicScore: z.number().int().min(0).max(100),
  lockedRoomFloorplanAndSightlineKo: z.string(),
  corkboardRedYarnAndCipherRuleKo: z.string(),
  archaeologyGridAndArtUvAuditKo: z.string(),
});
export type ClaudeLockedRoomCipherArchaeology = z.infer<typeof ClaudeLockedRoomCipherArchaeologySchema>;

export async function runClaudeLockedRoomAlibiCipherArchaeologyDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeLockedRoomCipherArchaeology>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:locked-room-alibi-cipher-archaeology-director",
    systemPrompt: "당신은 본격 추리물 밀실 트릭 평면도·용의자 시야각/알리바이 매트릭스·레터로킹 고전 암호·유적 발굴 격자/미술품 UV 감정을 총괄하는 미스터리 감독입니다.",
    userInstruction: "밀실 트릭 아이소메트릭 평면도와 시야각, 코르크보드 붉은 실 현수선과 암호/레터로킹, 유적 발굴 격자 및 미술품 UV 형광 감정을 JSON으로 작성하세요.",
    input,
    schema: ClaudeLockedRoomCipherArchaeologySchema,
    options,
    normalize: (p) => Object.freeze({ mysteryLogicScore: clampWave33(p.mysteryLogicScore, 0, 100, 98), lockedRoomFloorplanAndSightlineKo: cleanSingleLineText(p.lockedRoomFloorplanAndSightlineKo, 180), corkboardRedYarnAndCipherRuleKo: cleanSingleLineText(p.corkboardRedYarnAndCipherRuleKo, 180), archaeologyGridAndArtUvAuditKo: cleanSingleLineText(p.archaeologyGridAndArtUvAuditKo, 180) }),
    fallback: () => Object.freeze({ mysteryLogicScore: 98, lockedRoomFloorplanAndSightlineKo: "밀실 사건 해명용 아이소메트릭 단면도에서 문 잠금쇠·환기구 치수·목격자 시야각 콘(Sightline Cone)과 열차 시각표 알리바이 일치", corkboardRedYarnAndCipherRuleKo: "수사 코르크보드 압정 간 붉은 실 중력 현수선(Catenary Sag) 적용 및 알베르티 암호 원판 정렬·봉랍 레터로킹 접기 순서 고정", archaeologyGridAndArtUvAuditKo: "발굴 트렌치 1×1m 수평 실 격자·북쪽 화살표 스케일 보드 배치 및 유화 위작 UV 조사 시 후대 덧칠 부위 암자색 형광 검출" }),
  });
}

// ============================================================================
// Wave 39~41: e스포츠·K-POP콘서트·법정·항공우주·궁술펜싱·악기다도·식물대장간·중장비세무 8대 감독
// ============================================================================

export const ClaudeEsportsHudPeripheralsSchema = z.object({
  esportsContinuityScore: z.number().int().min(0).max(100),
  mobaHudKillfeedMinimapRuleKo: z.string(),
  keyboardWasdAndMouseGripRuleKo: z.string(),
  boothHeadsetAndMonitorBezelKo: z.string(),
});
export type ClaudeEsportsHudPeripherals = z.infer<typeof ClaudeEsportsHudPeripheralsSchema>;

export async function runClaudeEsportsHudGamerPeripheralsDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeEsportsHudPeripherals>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:esports-hud-gamer-keyboard-mouse-lock",
    systemPrompt: "당신은 프로게이머·인방 웹툰의 e스포츠 중계 HUD 킬로그/미니맵 시야 연속성과 왼손 키보드(WASD/QWER)·오른손 마우스 그립 좌우 고증을 담당하는 감독입니다.",
    userInstruction: "중계 화면 킬스코어·골드·미니맵 안개 연속성, 왼손 틸트 키보드와 오른손 마우스 파지 고정, 방음 부스 헤드셋 마이크 방향을 JSON으로 작성하세요.",
    input,
    schema: ClaudeEsportsHudPeripheralsSchema,
    options,
    normalize: (p) => Object.freeze({ esportsContinuityScore: clampWave33(p.esportsContinuityScore, 0, 100, 99), mobaHudKillfeedMinimapRuleKo: cleanSingleLineText(p.mobaHudKillfeedMinimapRuleKo, 180), keyboardWasdAndMouseGripRuleKo: cleanSingleLineText(p.keyboardWasdAndMouseGripRuleKo, 180), boothHeadsetAndMonitorBezelKo: cleanSingleLineText(p.boothHeadsetAndMonitorBezelKo, 180) }),
    fallback: () => Object.freeze({ esportsContinuityScore: 99, mobaHudKillfeedMinimapRuleKo: "중계 화면 상단 팀 킬스코어·글로벌 골드 격차·미니맵 전장의 안개(Fog of War) 와드 시야가 전후 전투 컷과 100% 수치 일치하도록 고정", keyboardWasdAndMouseGripRuleKo: "게이머 1인칭/부스 컷에서 왼손 15° 틸트 기계식 키보드(QWER/WASD) 운지와 오른손 초경량 마우스 클로 그립 좌우 반전 원천 차단", boothHeadsetAndMonitorBezelKo: "경기석 방음 헤드셋 붐마이크 좌측 입꼬리 밀착 + 내부 커스텀 인이어 이중 착용 및 240Hz 모니터 암 각도 고정" }),
  });
}

export const ClaudeCourtroomPrisonHandcuffSchema = z.object({
  legalRealismScore: z.number().int().min(0).max(100),
  koreanCourtroomSeatLayoutRuleKo: z.string(),
  prisonPartitionAndInmateBadgeKo: z.string(),
  handcuffKeyholeAndBodycamRuleKo: z.string(),
});
export type ClaudeCourtroomPrisonHandcuff = z.infer<typeof ClaudeCourtroomPrisonHandcuffSchema>;

export async function runClaudeCourtroomTrialPrisonHandcuffDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeCourtroomPrisonHandcuff>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:courtroom-trial-prison-handcuff-lock",
    systemPrompt: "당신은 한국 형사법정 좌석 배치(판사석 기준 좌측 검사·우측 변호인)·구치소 접견실 아크릴 격벽·수갑 열쇠구멍 및 경찰 바디캠 고증 감독입니다.",
    userInstruction: "한국 법정 검사석/변호인석 배치 규칙, 구치소 아크릴 타공 통화구와 수용번호 명찰, 수갑 열쇠구멍 및 바디캠 LED 고증을 JSON으로 작성하세요.",
    input,
    schema: ClaudeCourtroomPrisonHandcuffSchema,
    options,
    normalize: (p) => Object.freeze({ legalRealismScore: clampWave33(p.legalRealismScore, 0, 100, 99), koreanCourtroomSeatLayoutRuleKo: cleanSingleLineText(p.koreanCourtroomSeatLayoutRuleKo, 180), prisonPartitionAndInmateBadgeKo: cleanSingleLineText(p.prisonPartitionAndInmateBadgeKo, 180), handcuffKeyholeAndBodycamRuleKo: cleanSingleLineText(p.handcuffKeyholeAndBodycamRuleKo, 180) }),
    fallback: () => Object.freeze({ legalRealismScore: 99, koreanCourtroomSeatLayoutRuleKo: "한국 형사법정에서 판사석 정면 기준 좌측이 검사석, 우측이 변호인·피고인석(방청석에서 바라보면 좌측 변호인·우측 검사)으로 역앵글 좌우 반전 차단", prisonPartitionAndInmateBadgeKo: "구치소 접견실 투명 아크릴 격벽 하단 원형 타공 통화구 배열 및 수용복 좌측 가슴 수용번호 명찰(미결수/기결수 색상 구분) 고정", handcuffKeyholeAndBodycamRuleKo: "체포 시 등뒤 손등 마주보기(Back-to-Back) 수갑 결박·열쇠구멍 상향 정렬 및 경찰 조끼 중앙 바디캠 녹색 작동 LED 고정" }),
  });
}

export const ClaudeKpopStageLightstickIemSchema = z.object({
  stageProductionScore: z.number().int().min(0).max(100),
  customIemLoopAndCheekMicRuleKo: z.string(),
  choreoVFormationAndTrapdoorLiftKo: z.string(),
  lightstickOceanAndDmxLaserRuleKo: z.string(),
});
export type ClaudeKpopStageLightstickIem = z.infer<typeof ClaudeKpopStageLightstickIemSchema>;

export async function runClaudeKpopStageChoreoLightstickIemDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeKpopStageLightstickIem>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:kpop-stage-choreo-lightstick-iem-lock",
    systemPrompt: "당신은 K-POP 아이돌 웹툰의 커스텀 인이어(IEM) 귀 뒤 케이블 루프·볼 헤드셋 마이크·칼군무 V자 대형·콘서트 응원봉 중앙제어 조명 감독입니다.",
    userInstruction: "커스텀 인이어와 볼 헤드셋 마이크 착용법, 5/7인조 V자 칼군무 대형과 무대 리프트, 객석 응원봉 파도와 DMX 레이저 연출을 JSON으로 작성하세요.",
    input,
    schema: ClaudeKpopStageLightstickIemSchema,
    options,
    normalize: (p) => Object.freeze({ stageProductionScore: clampWave33(p.stageProductionScore, 0, 100, 99), customIemLoopAndCheekMicRuleKo: cleanSingleLineText(p.customIemLoopAndCheekMicRuleKo, 180), choreoVFormationAndTrapdoorLiftKo: cleanSingleLineText(p.choreoVFormationAndTrapdoorLiftKo, 180), lightstickOceanAndDmxLaserRuleKo: cleanSingleLineText(p.lightstickOceanAndDmxLaserRuleKo, 180) }),
    fallback: () => Object.freeze({ stageProductionScore: 99, customIemLoopAndCheekMicRuleKo: "무대 위 아이돌 커스텀 인이어(IEM) 케이블은 귓바퀴 위에서 뒤로 넘어가는 오버이어 루프 구조를 유지하며 살구색 볼 밀착 와이어 마이크 방향 고정", choreoVFormationAndTrapdoorLiftKo: "군무 대형 전환 시 센터 중심 V자/대각선 블로킹 바닥 넘버 마커 정렬 및 무대 중앙 유압 리프트(Trapdoor) 승강 높이 일치", lightstickOceanAndDmxLaserRuleKo: "아레나 객석 블루투스 응원봉 중앙제어 발광 색상(#EC4899→#38BDF8) 파도와 상부 트러스 DMX 무빙라이트 볼류메트릭 헤이즈 광선 일치" }),
  });
}

export const ClaudeAviationZeroGSubmarineSchema = z.object({
  aerospacePhysicsScore: z.number().int().min(0).max(100),
  airlinerAndFighterAfterburnerKo: z.string(),
  zeroGravityHairAndDropletSphereKo: z.string(),
  submarineRedLightAndTallshipSailKo: z.string(),
});
export type ClaudeAviationZeroGSubmarine = z.infer<typeof ClaudeAviationZeroGSubmarineSchema>;

export async function runClaudeAviationCockpitZeroGSubmarineDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeAviationZeroGSubmarine>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:aviation-cockpit-zerog-submarine-lock",
    systemPrompt: "당신은 항공기 조종석(좌 기장/우 부기장)·전투기 마하 다이아몬드·우주 무중력 표면장력·잠수함 적색 전투조명 및 범선 풍향 고증 감독입니다.",
    userInstruction: "여객기/전투기 조종석과 애프터버너 충격파 마디, 우주 무중력 모발 부유와 구형 액체 방울, 잠수함 적색 조명과 범선 풍향기 일치를 JSON으로 작성하세요.",
    input,
    schema: ClaudeAviationZeroGSubmarineSchema,
    options,
    normalize: (p) => Object.freeze({ aerospacePhysicsScore: clampWave33(p.aerospacePhysicsScore, 0, 100, 99), airlinerAndFighterAfterburnerKo: cleanSingleLineText(p.airlinerAndFighterAfterburnerKo, 180), zeroGravityHairAndDropletSphereKo: cleanSingleLineText(p.zeroGravityHairAndDropletSphereKo, 180), submarineRedLightAndTallshipSailKo: cleanSingleLineText(p.submarineRedLightAndTallshipSailKo, 180) }),
    fallback: () => Object.freeze({ aerospacePhysicsScore: 99, airlinerAndFighterAfterburnerKo: "여객기 조종석 좌측 기장석·우측 부기장석 및 중앙 스로틀 레버 고정, 전투기 애프터버너 배기구 초음속 마하 다이아몬드(Shock Diamonds) 마디 고증", zeroGravityHairAndDropletSphereKo: "우주선 무중력(Micro-G) 구간에서 머리카락/옷자락 무작위 부유 실루엣 및 눈물·혈액이 표면장력으로 완전한 구형(Sphere) 방울을 유지하도록 고정", submarineRedLightAndTallshipSailKo: "잠수함 야간 잠항 시 암적응용 적색 전투조명(Rig for Red) 적용 및 범선 돛 배면 부풀림 방향과 돗대 풍향기(Pennant) 벡터 일치" }),
  });
}

export const ClaudeArcheryFencingCombatCueSchema = z.object({
  martialSportsScore: z.number().int().min(0).max(100),
  gakgungThumbVsRecurveDrawRuleKo: z.string(),
  fencingTargetAndBoxingStanceKo: z.string(),
  billiardsBridgeAndClimbingKnotKo: z.string(),
});
export type ClaudeArcheryFencingCombatCue = z.infer<typeof ClaudeArcheryFencingCombatCueSchema>;

export async function runClaudeArcheryFencingCombatStanceCueDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeArcheryFencingCombatCue>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:archery-fencing-boxing-stance-cue-lock",
    systemPrompt: "당신은 동양 국궁(엄지 깍지+우측 화살 거치) vs 서양 양궁(3지 당김+좌측 거치), 펜싱 3종목 유효면, 복싱 스탠스, 당구 브릿지/클라이밍 매듭 감독입니다.",
    userInstruction: "국궁과 양궁의 화살 거치 방향 차이, 펜싱 플러레/에페/사브르 장비와 복싱 오소독스/사우스포 고정, 당구 브릿지와 클라이밍 8자 매듭을 JSON으로 작성하세요.",
    input,
    schema: ClaudeArcheryFencingCombatCueSchema,
    options,
    normalize: (p) => Object.freeze({ martialSportsScore: clampWave33(p.martialSportsScore, 0, 100, 99), gakgungThumbVsRecurveDrawRuleKo: cleanSingleLineText(p.gakgungThumbVsRecurveDrawRuleKo, 180), fencingTargetAndBoxingStanceKo: cleanSingleLineText(p.fencingTargetAndBoxingStanceKo, 180), billiardsBridgeAndClimbingKnotKo: cleanSingleLineText(p.billiardsBridgeAndClimbingKnotKo, 180) }),
    fallback: () => Object.freeze({ martialSportsScore: 99, gakgungThumbVsRecurveDrawRuleKo: "한국 전통 국궁(각궁)은 오른손 엄지 깍지 당김+활 우측면 화살 거치, 서양 양궁(리커브)은 3손가락 당김+활 좌측면 화살 거치로 동서양 궁술 혼동 차단", fencingTargetAndBoxingStanceKo: "펜싱 플러레(몸통 전도조끼)·에페(전신+원형 큰 가드)·사브르(상체+마스크) 구분 및 격투기 오소독스(왼발 앞)/사우스포(오른발 앞) 컷 간 반전 차단", billiardsBridgeAndClimbingKnotKo: "당구 왼손 오픈/클로즈 브릿지 지지점과 수구-목적구 90도 분리각 고증, 클라이밍 안전벨트 8자 매듭(Figure-8) 및 잠금 카라비너 게이트 고정" }),
  });
}

export const ClaudeOrchestraTeaCalligraphySchema = z.object({
  fineArtsRigorScore: z.number().int().min(0).max(100),
  piano88KeyGuitarDrumRuleKo: z.string(),
  teaCeremonyAndSommelierEtiquetteKo: z.string(),
  calligraphyBrushAndPotteryWheelKo: z.string(),
});
export type ClaudeOrchestraTeaCalligraphy = z.infer<typeof ClaudeOrchestraTeaCalligraphySchema>;

export async function runClaudeOrchestraPianoGuitarTeaCalligraphyDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeOrchestraTeaCalligraphy>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:orchestra-piano-guitar-tea-calligraphy-lock",
    systemPrompt: "당신은 피아노 검은건반(2-3 반복)·기타 프렛/드럼 교차 팔·오케스트라 지휘·동양 다도/소믈리에·서예 쌍구법 및 물레 반시계 회전을 담당하는 예술 고증 감독입니다.",
    userInstruction: "피아노 건반 배열과 기타/드럼 연주 자세, 동양 다도 다완 정면 회전과 와인잔 스템 파지, 서예 쌍구법 붓 파지와 도자기 물레 회전을 JSON으로 작성하세요.",
    input,
    schema: ClaudeOrchestraTeaCalligraphySchema,
    options,
    normalize: (p) => Object.freeze({ fineArtsRigorScore: clampWave33(p.fineArtsRigorScore, 0, 100, 99), piano88KeyGuitarDrumRuleKo: cleanSingleLineText(p.piano88KeyGuitarDrumRuleKo, 180), teaCeremonyAndSommelierEtiquetteKo: cleanSingleLineText(p.teaCeremonyAndSommelierEtiquetteKo, 180), calligraphyBrushAndPotteryWheelKo: cleanSingleLineText(p.calligraphyBrushAndPotteryWheelKo, 180) }),
    fallback: () => Object.freeze({ fineArtsRigorScore: 99, piano88KeyGuitarDrumRuleKo: "피아노 검은 건반 2개-3개 주기 배열 고정·기타 3/5/7/9/12프렛 마크와 6현 유지·드럼 오른팔(하이햇)/왼팔(스네어) 교차 타격 및 지휘자 좌측 제1바이올린 배치", teaCeremonyAndSommelierEtiquetteKo: "동양 다도에서 다완(찻사발) 정면 문양을 손님 쪽으로 돌려 내는 예법과 소믈리에 와인잔 보울 온도 상승 방지를 위한 스템(기둥) 파지 고정", calligraphyBrushAndPotteryWheelKo: "서예 붓대를 지면과 수직으로 세우는 쌍구법(雙鉤法) 파지·낙관 좌하단 주인 날인 및 도자기 물레 반시계 방향 회전 중심잡기 고증" }),
  });
}

export const ClaudeBotanicalBlacksmithAlchemySchema = z.object({
  craftBotanyScore: z.number().int().min(0).max(100),
  cherryBlossomNotchAndBambooHollowKo: z.string(),
  blacksmithAnvilQuenchAndTailorKo: z.string(),
  stainedGlassCausticAndAlchemyOrreryKo: z.string(),
});
export type ClaudeBotanicalBlacksmithAlchemy = z.infer<typeof ClaudeBotanicalBlacksmithAlchemySchema>;

export async function runClaudeBotanicalFloraBlacksmithAlchemyDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeBotanicalBlacksmithAlchemy>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:botanical-flora-blacksmith-alchemy-director",
    systemPrompt: "당신은 식물학 고증(벚꽃 5꽃잎 끝 홈·단풍 장상열·대나무 빈 단면)·대장간 단조/담금질·의상실 가봉·성당 스테인드글라스 투영광·연금술 증류기를 총괄하는 감독입니다.",
    userInstruction: "벚꽃잎 끝 홈과 대나무 절단면 고증, 대장간 왼손 집게/오른손 해머 단조와 의상실 마네킹 가봉, 스테인드글라스 투영광과 연금술 기구를 JSON으로 작성하세요.",
    input,
    schema: ClaudeBotanicalBlacksmithAlchemySchema,
    options,
    normalize: (p) => Object.freeze({ craftBotanyScore: clampWave33(p.craftBotanyScore, 0, 100, 99), cherryBlossomNotchAndBambooHollowKo: cleanSingleLineText(p.cherryBlossomNotchAndBambooHollowKo, 180), blacksmithAnvilQuenchAndTailorKo: cleanSingleLineText(p.blacksmithAnvilQuenchAndTailorKo, 180), stainedGlassCausticAndAlchemyOrreryKo: cleanSingleLineText(p.stainedGlassCausticAndAlchemyOrreryKo, 180) }),
    fallback: () => Object.freeze({ craftBotanyScore: 99, cherryBlossomNotchAndBambooHollowKo: "봄 벚꽃잎 끝 오목 홈(Apical Notch) 5꽃잎 구조와 가을 단풍잎 손바닥 갈래 구분, 무협 대나무 절단 시 마디 격벽과 속이 빈 원통 단면(Hollow Culm) 고증", blacksmithAnvilQuenchAndTailorKo: "대장간 왼손 집게(Tongs) 적열 강철 고정·오른손 해머 타격·담금질 수증기 폭발 연출 및 테일러 샵 마네킹 시침핀·목 줄자 눈금 고정", stainedGlassCausticAndAlchemyOrreryKo: "고딕 성당 스테인드글라스 납선(Lead Came) 문양과 바닥/인물 위 색수차 투영광(Caustics) 일치, 마탑 알렘빅 증류기·아스트롤라베 동심원 고증" }),
  });
}

export const ClaudeHeavyMachinerySignboardErpSchema = z.object({
  industrialErpScore: z.number().int().min(0).max(100),
  excavatorForkliftPantographRuleKo: z.string(),
  neonElectrodeAndSignboardOrthoKo: z.string(),
  passportCurrencyAndWebtoonTaxErpKo: z.string(),
});
export type ClaudeHeavyMachinerySignboardErp = z.infer<typeof ClaudeHeavyMachinerySignboardErpSchema>;

export async function runClaudeHeavyMachinerySignboardTaxErpDirector(
  input: Wave33CostCapAssistInput,
  options: RunWave33CostCapAssistOptions = {},
): Promise<Wave33CostCapAssistResult<ClaudeHeavyMachinerySignboardErp>> {
  return executeWave33CostCapTask({
    taskId: "cost-cap:heavy-machinery-signboard-tax-erp-director",
    systemPrompt: "당신은 중장비(굴착기 유압 3절 링크/지게차 후륜조향/전철 팬터그래프)·네온사인 유리관/간판 외계어 방지·여권 MRZ/화폐·웹툰 세무(3.3% 원천징수/면세)/어시 정산 ERP 총괄 감독입니다.",
    userInstruction: "굴착기 유압 실린더와 전철 팬터그래프 접지, 네온사인 전극과 간판 한글 외계어 차단, 여권 MRZ/돈다발 띠지 및 웹툰 세무/어시 정산 ERP를 JSON으로 작성하세요.",
    input,
    schema: ClaudeHeavyMachinerySignboardErpSchema,
    options,
    normalize: (p) => Object.freeze({ industrialErpScore: clampWave33(p.industrialErpScore, 0, 100, 99), excavatorForkliftPantographRuleKo: cleanSingleLineText(p.excavatorForkliftPantographRuleKo, 180), neonElectrodeAndSignboardOrthoKo: cleanSingleLineText(p.neonElectrodeAndSignboardOrthoKo, 180), passportCurrencyAndWebtoonTaxErpKo: cleanSingleLineText(p.passportCurrencyAndWebtoonTaxErpKo, 180) }),
    fallback: () => Object.freeze({ industrialErpScore: 99, excavatorForkliftPantographRuleKo: "굴착기 붐-암-버킷 3절 링크 유압 피스톤 직선도·창고 지게차 후륜 조향 회전축·전철 지붕 팬터그래프 전차선 접지 및 송전탑 3상 현수선 고정", neonElectrodeAndSignboardOrthoKo: "느와르 네온사인 굴곡 유리관 양끝 흑색 전극 캡·벽면 지지대 묘사 및 거리 간판 한글·한자·가나 문자의 AI 외계어(Gibberish) 깨짐 원천 차단", passportCurrencyAndWebtoonTaxErpKo: "여권 하단 2줄 MRZ 기계판독 코드·돈다발 100장 띠지 고정 및 한국 웹툰 고료 3.3% 원천징수·ISBN/ISSN 부가세 면세·어시 컷당 정산 ERP 자동화" }),
  });
}
