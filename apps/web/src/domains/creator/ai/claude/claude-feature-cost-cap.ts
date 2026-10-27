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
import { hydrateDefaultEnvClaudeConnection } from "@/shared/ai/user-ai-store";

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
  hydrateDefaultEnvClaudeConnection();
  const routed = resolveCreatorTaskModelRoute(taskId, {
    model: options.model as "claude-haiku-5-5" | "claude-sonnet-5-5" | "claude-opus-5-5" | undefined,
  });
  const requestedModel = resolveClaudeRequestModel(routed.model || CLAUDE_DEFAULT_MODEL_ID);
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
