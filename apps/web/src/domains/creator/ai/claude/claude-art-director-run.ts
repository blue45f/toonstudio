/**
 * AI 아트 디렉터 실행 — 요청 생성 → Claude 구조화 출력 호출 → 정규화를 한 번에 묶는다.
 *
 * 전송·사용량 기록·거절/잘림 처리는 `claudeParse`가 맡고, 이 모듈은 결과를 화면에 올릴 값으로 바꾼다.
 * 자동 재시도·모델 대체는 없다 — 실패하면 사유를 그대로 올리고 사용자가 다시 누른다.
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

import {
  ArtDirectorReviewSchema,
  buildArtDirectorRequest,
  estimateArtDirectorCostCapUsd,
  normalizeArtDirectorReview,
  type ArtDirectorContext,
  type ArtDirectorImageInput,
  type ArtDirectorReview,
} from "./claude-art-director";
import { resolveCreatorTaskModelRoute, type ClaudeCreatorTaskId } from "./claude-creator-model-router";
import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";

import type { RunWave30LocalizeAssistOptions, Wave30LocalizeAssistInput, Wave30LocalizeAssistResult } from "./claude-alt-text";
import type Anthropic from "@anthropic-ai/sdk";

export interface ArtDirectorRunResult {
  readonly review: ArtDirectorReview;
  /** 실제로 응답한 모델. 요청한 모델과 날짜 접미사만 다를 수 있다. */
  readonly model: string;
  readonly usage: ClaudeTokenUsage;
  /** 공개 가격표 기준 추정 비용. 단가를 모르는 모델이면 null. */
  readonly estimatedUsd: number | null;
}

export interface ArtDirectorRunOptions {
  /** 비우면 연결의 기본 모델을 쓴다. */
  readonly model?: string;
  readonly signal?: AbortSignal;
  /** 사용자가 "이번 한 번만 예산을 넘어도 진행"을 직접 고른 요청이면 true. 전송 계층의 예산 판정을 건너뛴다. */
  readonly budgetOverride?: boolean;
}

export async function runArtDirectorReview(
  route: Pick<ClaudeRoute, "apiKey" | "revision" | "model">,
  image: ArtDirectorImageInput,
  context: ArtDirectorContext,
  options: ArtDirectorRunOptions = {},
): Promise<ArtDirectorRunResult> {
  const requested = resolveClaudeRequestModel(options.model, route.model);
  const { message, parsed } = await claudeParse(
    route,
    buildArtDirectorRequest(requested, image, context),
    ArtDirectorReviewSchema,
    {
      signal: options.signal,
      // 실행 전 확인에 보인 값과 같은 함수로 잰 상한이다. 전송 계층이 예산 판정과 진행 중 예약에 쓴다.
      capUsd: estimateArtDirectorCostCapUsd(requested, image, context),
      budgetOverride: options.budgetOverride,
    },
  );
  const model = message.model || requested;
  const usage = toClaudeTokenUsage(message.usage);
  return {
    review: normalizeArtDirectorReview(parsed, image),
    model: claudeModelInfo(model)?.id ?? model,
    usage,
    estimatedUsd: estimateClaudeCostUsd(model, usage)?.usd ?? null,
  };
}

// ============================================================================
// Wave 51~53 (1,020대 플랫폼 내재화): 고대신화(삼단노선/코페시/룬)·한국군(베레모/K2/군번줄)·스팀펑크(비행선/오토마타/잠수모/흑사병)·판타지지형(부유섬/세계수/드래곤/미믹)·한국생활(전통시장/분식/고깃집/찜질방)·한국전통/교통(폐백/제사상/화투/개찰구)·7단자율파이프라인/100화DNA·1020대플랫폼수프림메타 8종
// ============================================================================

function clampWave51(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

async function executeWave51ArtDirector<TSchema extends z.ZodTypeAny, TOut>(params: {
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
    const actualModel = claudeModelInfo(message.model || requestedModel)?.id ?? (message.model || requestedModel);
    const usage = toClaudeTokenUsage(message.usage);
    return Object.freeze({
      taskId,
      source: "claude-live",
      model: actualModel,
      data: normalize(parsed),
      usage,
      estimatedUsd: estimateClaudeCostUsd(actualModel, usage)?.usd ?? null,
    });
  } catch (error) {
    if (options.fallbackOnError !== false) {
      return Object.freeze({ taskId, source: "deterministic-fallback", model: requestedModel, data: fallback(), usage: null, estimatedUsd: null });
    }
    throw error;
  }
}

export interface ClaudeAncientMythologyTriremeKhopeshRune {
  readonly trireme3TierOarsAndCorinthianCapitalKo: string;
  readonly vikingLongshipClinkerAndElderFutharkKo: string;
  readonly egyptianKhopeshOuterEdgeAndMacuahuitlKo: string;
  readonly mythologyAccuracyScore: number;
  readonly overallPromptKo: string;
}
const AncientMythologySchema = z.object({
  trireme3TierOarsAndCorinthianCapitalKo: z.string(),
  vikingLongshipClinkerAndElderFutharkKo: z.string(),
  egyptianKhopeshOuterEdgeAndMacuahuitlKo: z.string(),
  mythologyAccuracyScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeAncientMythologyTriremeKhopeshRuneDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeAncientMythologyTriremeKhopeshRune>> {
  return executeWave51ArtDirector({
    taskId: "art-director:ancient-mythology-trireme-khopesh-rune-lock",
    systemPrompt: "당신은 고대 신화·문명(그리스 삼단노선/주두·바이킹 롱쉽/룬 문자·이집트 코페시/히에로글리프·아즈텍 마쿠아후이틀) 고증 디렉터입니다.",
    userInstruction: "삼단노선 3단 노(Thranite/Zygitai/Thalamian) 엇갈림과 코린트식 아칸서스 주두, 바이킹 롱쉽 클링커 겹침 널판과 엘더 푸타르크 24자 룬, 이집트 코페시 볼록한 외측 날(Outer Edge)과 흑요석 마쿠아후이틀 고증을 설계하세요.",
    input,
    schema: AncientMythologySchema,
    options,
    normalize: (p) => Object.freeze({
      trireme3TierOarsAndCorinthianCapitalKo: cleanSingleLineText(p.trireme3TierOarsAndCorinthianCapitalKo, 220),
      vikingLongshipClinkerAndElderFutharkKo: cleanSingleLineText(p.vikingLongshipClinkerAndElderFutharkKo, 220),
      egyptianKhopeshOuterEdgeAndMacuahuitlKo: cleanSingleLineText(p.egyptianKhopeshOuterEdgeAndMacuahuitlKo, 220),
      mythologyAccuracyScore: clampWave51(p.mythologyAccuracyScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      trireme3TierOarsAndCorinthianCapitalKo: "그리스 삼단노선(Trireme) 청동 충각(Embolon)·3단 노 엇갈림 배열 및 도리스/이오니아/코린트식 아칸서스 주두 구분 고정",
      vikingLongshipClinkerAndElderFutharkKo: "바이킹 롱쉽 클링커(Clinker) 겹침 선체·현측 원형 방패 거치 및 엘더 푸타르크(Elder Futhark) 24자 룬 문자 각인",
      egyptianKhopeshOuterEdgeAndMacuahuitlKo: "이집트 코페시(Khopesh) 낫검은 오목한 안쪽이 아닌 볼록한 바깥쪽(Outer Edge)에 날이 서며, 아즈텍 마쿠아후이틀 흑요석 날 파편 고증",
      mythologyAccuracyScore: 96,
      overallPromptKo: "고대 그리스·노르드·이집트·메소아메리카 신화 무구 및 건축 양식 고증 고정 완료",
    }),
  });
}

export interface ClaudeKoreanMilitaryBeretK2RifleDogtag {
  readonly rokBeretInsigniaLeftEyeAndRightPullKo: string;
  readonly dogtagLongShortChainAndRankInsigniaKo: string;
  readonly k2RifleLeftSelectorAndRightChargingHandleKo: string;
  readonly militaryAccuracyScore: number;
  readonly overallPromptKo: string;
}
const KoreanMilitarySchema = z.object({
  rokBeretInsigniaLeftEyeAndRightPullKo: z.string(),
  dogtagLongShortChainAndRankInsigniaKo: z.string(),
  k2RifleLeftSelectorAndRightChargingHandleKo: z.string(),
  militaryAccuracyScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeKoreanMilitaryBeretK2RifleDogtagDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeKoreanMilitaryBeretK2RifleDogtag>> {
  return executeWave51ArtDirector({
    taskId: "art-director:korean-military-beret-k2-rifle-dogtag-lock",
    systemPrompt: "당신은 한국 현대 군복무·총기(육군 베레모·인식표 군번줄·K2 소총) 고증 디렉터입니다.",
    userInstruction: "한국 육군 베레모 모표 왼쪽 눈 위 위치 및 우측 귀 방향 풀림(Pull), 인식표(군번줄) 긴 줄 1개+짧은 보조줄 1개 2매 구조, K2 소총 좌측 조정간(안전-단발-연발-3점사) 및 우측 장전손잡이/탄피배출구 좌우 반전 차단을 설계하세요.",
    input,
    schema: KoreanMilitarySchema,
    options,
    normalize: (p) => Object.freeze({
      rokBeretInsigniaLeftEyeAndRightPullKo: cleanSingleLineText(p.rokBeretInsigniaLeftEyeAndRightPullKo, 220),
      dogtagLongShortChainAndRankInsigniaKo: cleanSingleLineText(p.dogtagLongShortChainAndRankInsigniaKo, 220),
      k2RifleLeftSelectorAndRightChargingHandleKo: cleanSingleLineText(p.k2RifleLeftSelectorAndRightChargingHandleKo, 220),
      militaryAccuracyScore: clampWave51(p.militaryAccuracyScore, 0, 100, 97),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      rokBeretInsigniaLeftEyeAndRightPullKo: "한국 육군 베레모 모표(철모/무궁화)는 왼쪽 눈썹 바로 위에 정렬하고 천은 오른쪽 귀 아래로 자연스럽게 내려오도록 각잡기 고정",
      dogtagLongShortChainAndRankInsigniaKo: "군번줄(인식표)은 큰 볼체인 목걸이에 본판 1매 + 그에 매달린 짧은 보조줄에 부판 1매(총 2매) 구조 및 디지털 전투복 계급장 벨크로 고정",
      k2RifleLeftSelectorAndRightChargingHandleKo: "K2/K2C1 소총은 우측면에 장전손잡이·탄피배출구·우측 접철식 개머리판이 위치하고 좌측면에 360도 조정간이 위치(거울반전 엄금)",
      militaryAccuracyScore: 97,
      overallPromptKo: "한국군 베레모 모표·군번줄 2매·K2 소총 좌우 구조 무결성 고정 완료",
    }),
  });
}

export interface ClaudeSteampunkAirshipAutomatonDivingPlague {
  readonly airshipVentralGondolaAndBourdonGaugeKo: string;
  readonly windupAutomatonKeyAndCopperDivingHelmetKo: string;
  readonly plagueDoctorBeakMaskAndNixieTubeKo: string;
  readonly steampunkAccuracyScore: number;
  readonly overallPromptKo: string;
}
const SteampunkAirshipSchema = z.object({
  airshipVentralGondolaAndBourdonGaugeKo: z.string(),
  windupAutomatonKeyAndCopperDivingHelmetKo: z.string(),
  plagueDoctorBeakMaskAndNixieTubeKo: z.string(),
  steampunkAccuracyScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeSteampunkAirshipAutomatonDivingPlagueDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeSteampunkAirshipAutomatonDivingPlague>> {
  return executeWave51ArtDirector({
    taskId: "art-director:steampunk-airship-automaton-diving-plague-lock",
    systemPrompt: "당신은 스팀펑크·다크판타지 기구학(비행선 곤돌라·부르동 압력계·태엽 오토마타·구리 잠수모·흑사병 의사 마스크) 디렉터입니다.",
    userInstruction: "비행선 하부 곤돌라 현수 리깅과 부르동관 압력계/보일러 수위 유리관, 태엽 오토마타 등쪽 태엽 키(Winding Key)와 12볼트 구리 잠수모 4창 구조, 흑사병 의사 부리 마스크(허브 수납부) 및 닉시관 발광을 설계하세요.",
    input,
    schema: SteampunkAirshipSchema,
    options,
    normalize: (p) => Object.freeze({
      airshipVentralGondolaAndBourdonGaugeKo: cleanSingleLineText(p.airshipVentralGondolaAndBourdonGaugeKo, 220),
      windupAutomatonKeyAndCopperDivingHelmetKo: cleanSingleLineText(p.windupAutomatonKeyAndCopperDivingHelmetKo, 220),
      plagueDoctorBeakMaskAndNixieTubeKo: cleanSingleLineText(p.plagueDoctorBeakMaskAndNixieTubeKo, 220),
      steampunkAccuracyScore: clampWave51(p.steampunkAccuracyScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      airshipVentralGondolaAndBourdonGaugeKo: "스팀펑크 비행선 가스낭 하부 트러스 곤돌라 현수 케이블 및 황동 부르동 압력계(적색 한계선)·보일러 수위 유리관 고정",
      windupAutomatonKeyAndCopperDivingHelmetKo: "오토마타 등쪽 황동 태엽 감기 키(Winding Key)·유성기어 관절 및 고전 12볼트 브레스트플레이트 구리 잠수모 4면 관측창 고증",
      plagueDoctorBeakMaskAndNixieTubeKo: "흑사병 의사 가죽 부리 마스크(향초 수납 끝단·원형 유리 렌즈·황동 리벳)·왁스 롱코트 및 닉시관(Nixie Tube) 주황색 음극 글로우",
      steampunkAccuracyScore: 96,
      overallPromptKo: "스팀펑크 비행선·압력계·태엽 오토마타·잠수모·흑사병 마스크 기구학 고정 완료",
    }),
  });
}

export interface ClaudeFloatingIslandWorldTreeDragonMimic {
  readonly floatingIslandInvertedConeAndWorldTreeKo: string;
  readonly dragonHoard34DegCoinSlopeAndSlimeRefractionKo: string;
  readonly mimicChainForwardRuleAndGolemJointGapKo: string;
  readonly fantasyWorldAccuracyScore: number;
  readonly overallPromptKo: string;
}
const FloatingIslandSchema = z.object({
  floatingIslandInvertedConeAndWorldTreeKo: z.string(),
  dragonHoard34DegCoinSlopeAndSlimeRefractionKo: z.string(),
  mimicChainForwardRuleAndGolemJointGapKo: z.string(),
  fantasyWorldAccuracyScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeFloatingIslandWorldTreeDragonMimicGolemDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeFloatingIslandWorldTreeDragonMimic>> {
  return executeWave51ArtDirector({
    taskId: "art-director:floating-island-world-tree-dragon-mimic-lock",
    systemPrompt: "당신은 하이판타지 지형·몬스터 생태(부유섬·세계수·드래곤 레어·미믹·슬라임·바위 골렘) 디렉터입니다.",
    userInstruction: "부유섬 하부 역원추형 현무암 주상절리와 낙하 폭포 안개, 세계수 판근(Buttress Root)과 발광 잎맥, 드래곤 레어 금화 산(안식각 34도)과 슬라임 반투명 코어 굴절, 보물상자 미믹 사슬 방향(앞쪽 향함=미믹, 뒤쪽 감김=진짜 상자) 및 바위 골렘 마력 룬 연결부를 설계하세요.",
    input,
    schema: FloatingIslandSchema,
    options,
    normalize: (p) => Object.freeze({
      floatingIslandInvertedConeAndWorldTreeKo: cleanSingleLineText(p.floatingIslandInvertedConeAndWorldTreeKo, 220),
      dragonHoard34DegCoinSlopeAndSlimeRefractionKo: cleanSingleLineText(p.dragonHoard34DegCoinSlopeAndSlimeRefractionKo, 220),
      mimicChainForwardRuleAndGolemJointGapKo: cleanSingleLineText(p.mimicChainForwardRuleAndGolemJointGapKo, 220),
      fantasyWorldAccuracyScore: clampWave51(p.fantasyWorldAccuracyScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      floatingIslandInvertedConeAndWorldTreeKo: "부유섬 하부 역원추형(Inverted Cone) 암반 단면·노출 뿌리·허공 분산 폭포 및 세계수 거대 판근(Buttress Root)·청록 발광 잎맥 고정",
      dragonHoard34DegCoinSlopeAndSlimeRefractionKo: "드래곤 레어 금화 더미 34도 안식각 경사면·역린 및 슬라임 반투명 젤리 굴절(IOR 1.38)·부유 마석 코어(Nucleus) 위치 고정",
      mimicChainForwardRuleAndGolemJointGapKo: "미믹 식별 법칙(우측 사슬이 앞쪽으로 뻗으면 미믹, 뒤쪽 둥글게 말리면 일반 보물상자) 및 바위 골렘 관절 부유 유격·청색 마력 사슬",
      fantasyWorldAccuracyScore: 96,
      overallPromptKo: "부유섬·세계수·드래곤 금화 산·미믹 사슬 법칙·골렘 관절 고증 고정 완료",
    }),
  });
}

export interface ClaudeKoreanMarketBunsikBbqJjimjilbang {
  readonly marketRedBasinScaleAndBunsikTteokbokkiPanKo: string;
  readonly kbbqCopperExhaustPipeAndMelamineStoolKo: string;
  readonly jjimjilbangSheepTowelLockerAndCoinLaundryKo: string;
  readonly koreanLifeAccuracyScore: number;
  readonly overallPromptKo: string;
}
const KoreanMarketSchema = z.object({
  marketRedBasinScaleAndBunsikTteokbokkiPanKo: z.string(),
  kbbqCopperExhaustPipeAndMelamineStoolKo: z.string(),
  jjimjilbangSheepTowelLockerAndCoinLaundryKo: z.string(),
  koreanLifeAccuracyScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeKoreanMarketBunsikBbqJjimjilbangDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeKoreanMarketBunsikBbqJjimjilbang>> {
  return executeWave51ArtDirector({
    taskId: "art-director:korean-market-bunsik-bbq-jjimjilbang-lock",
    systemPrompt: "당신은 한국 일상·자영업 배경(전통시장·분식집·고깃집·찜질방·코인세탁소) 생활 고증 디렉터입니다.",
    userInstruction: "전통시장 빨간 고무 다라이/녹색 바가지/접시저울과 분식집 사각 스테인리스 떡볶이 철판/어묵탕 격자, 고깃집 자바라 동파이프 연기 흡입 후드/원형 드럼통 식탁, 찜질방 양머리 수건/손목 락커키/맥반석 계란 및 코인세탁소 전면 드럼창을 설계하세요.",
    input,
    schema: KoreanMarketSchema,
    options,
    normalize: (p) => Object.freeze({
      marketRedBasinScaleAndBunsikTteokbokkiPanKo: cleanSingleLineText(p.marketRedBasinScaleAndBunsikTteokbokkiPanKo, 220),
      kbbqCopperExhaustPipeAndMelamineStoolKo: cleanSingleLineText(p.kbbqCopperExhaustPipeAndMelamineStoolKo, 220),
      jjimjilbangSheepTowelLockerAndCoinLaundryKo: cleanSingleLineText(p.jjimjilbangSheepTowelLockerAndCoinLaundryKo, 220),
      koreanLifeAccuracyScore: clampWave51(p.koreanLifeAccuracyScore, 0, 100, 97),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      marketRedBasinScaleAndBunsikTteokbokkiPanKo: "전통시장 빨간 고무 다라이·아날로그 접시저울·알전구 및 분식집 사각 스테인리스 떡볶이 철판·어묵 꼬치 격자 통·초록 멜라민 그릇 고정",
      kbbqCopperExhaustPipeAndMelamineStoolKo: "한국 고깃집 상하 신축 자바라 동파이프 배기 후드·원형 스테인리스 드럼통 식탁·수납형 원형 의자·초록 소주병/은색 수저통 고증",
      jjimjilbangSheepTowelLockerAndCoinLaundryKo: "찜질방 양머리 수건 롤·스프링 손목 락커키·식혜/맥반석 계란 및 24시 코인세탁소 대형 전면 유리 드럼창·플라스틱 빨래바구니",
      koreanLifeAccuracyScore: 97,
      overallPromptKo: "한국 전통시장·분식집·고깃집 후드·찜질방 양머리·코인세탁소 생활 소품 고증 완료",
    }),
  });
}

export interface ClaudeKoreanWeddingPaebaekJesaHwatuTransit {
  readonly paebaekJokduriAndJesaHongdongbaekseoKo: string;
  readonly hwatu12Months5KwangGodoriAndBlanketKo: string;
  readonly subwayRightTurnstileTagAndKtxSeatKo: string;
  readonly traditionTransitScore: number;
  readonly overallPromptKo: string;
}
const KoreanWeddingSchema = z.object({
  paebaekJokduriAndJesaHongdongbaekseoKo: z.string(),
  hwatu12Months5KwangGodoriAndBlanketKo: z.string(),
  subwayRightTurnstileTagAndKtxSeatKo: z.string(),
  traditionTransitScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeKoreanWeddingPaebaekJesaHwatuTransitDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeKoreanWeddingPaebaekJesaHwatuTransit>> {
  return executeWave51ArtDirector({
    taskId: "art-director:korean-wedding-paebaek-jesa-hwatu-transit-lock",
    systemPrompt: "당신은 한국 전통 의례(폐백/돌잡이/제사상)·화투 12월 패·대중교통(지하철/KTX) 고증 디렉터입니다.",
    userInstruction: "전통 혼례 폐백 활옷/족두리/연지곤지 및 제사상 홍동백서(동쪽 붉은 과일, 서쪽 흰 과일)/어동육서 진설, 화투 12월 화초(5광·고도리·홍단/청단/초단)와 초록 담요, 한국 지하철 개찰구 우측 카드 태그 단말기 및 KTX 회전 좌석/버스 하차벨을 설계하세요.",
    input,
    schema: KoreanWeddingSchema,
    options,
    normalize: (p) => Object.freeze({
      paebaekJokduriAndJesaHongdongbaekseoKo: cleanSingleLineText(p.paebaekJokduriAndJesaHongdongbaekseoKo, 220),
      hwatu12Months5KwangGodoriAndBlanketKo: cleanSingleLineText(p.hwatu12Months5KwangGodoriAndBlanketKo, 220),
      subwayRightTurnstileTagAndKtxSeatKo: cleanSingleLineText(p.subwayRightTurnstileTagAndKtxSeatKo, 220),
      traditionTransitScore: clampWave51(p.traditionTransitScore, 0, 100, 97),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      paebaekJokduriAndJesaHongdongbaekseoKo: "폐백 활옷·족두리·연지곤지·밤대추 던지기 및 제사상 병풍 앞 5열 진설(홍동백서·어동육서·두동미서·좌포우혜) 방위 고정",
      hwatu12Months5KwangGodoriAndBlanketKo: "화투 48장 12월 화초(1월 송학·3월 벚꽃·8월 공산·11월 오동·12월 비 5광 및 2/4/8월 고도리, 뒷면 붉은 오돌토돌 질감) 고정",
      subwayRightTurnstileTagAndKtxSeatKo: "한국 지하철 게이트 진입 시 우측 상단 교통카드 단말기 태그, 시내버스 빨간 STOP 하차벨 및 KTX 객실 접이식 테이블/회전 좌석 고증",
      traditionTransitScore: 97,
      overallPromptKo: "폐백/제사상 홍동백서·화투 12월 패·지하철 우측 단말기/KTX 고증 고정 완료",
    }),
  });
}

export interface ClaudeAutonomous7StagePipelineDnaHashPsd {
  readonly sevenStageAgentPipelineAnd100EpDnaHashKo: string;
  readonly adjacentPanel3dCameraFrustumAndGazeKo: string;
  readonly semantic5GroupPsdAndTrappedBallFlatKo: string;
  readonly pipelineAutonomyScore: number;
  readonly overallPromptKo: string;
}
const Autonomous7StageSchema = z.object({
  sevenStageAgentPipelineAnd100EpDnaHashKo: z.string(),
  adjacentPanel3dCameraFrustumAndGazeKo: z.string(),
  semantic5GroupPsdAndTrappedBallFlatKo: z.string(),
  pipelineAutonomyScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeAutonomous7StagePipelineDnaHashPsdDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeAutonomous7StagePipelineDnaHashPsd>> {
  return executeWave51ArtDirector({
    taskId: "art-director:autonomous-7stage-pipeline-dna-hash-psd-director",
    systemPrompt: "당신은 차세대 웹툰 7단 자율 에이전트 파이프라인·100화 캐릭터 DNA 해시 원장·시맨틱 PSD 총괄 감독입니다.",
    userInstruction: "대본→콘티→선화→밑색→명암→후보정→식자 7단 자율 파이프라인과 100화 연재 캐릭터 DNA 해시 원장(흉터·점·가르마·안경·복장 손상 상태 이월), 인접 컷 3D 카메라 프러스텀(180도 축 유지) 및 시맨틱 5그룹 PSD·Trapped-Ball 워터셰드 밑색 분리를 설계하세요.",
    input,
    schema: Autonomous7StageSchema,
    options,
    normalize: (p) => Object.freeze({
      sevenStageAgentPipelineAnd100EpDnaHashKo: cleanSingleLineText(p.sevenStageAgentPipelineAnd100EpDnaHashKo, 220),
      adjacentPanel3dCameraFrustumAndGazeKo: cleanSingleLineText(p.adjacentPanel3dCameraFrustumAndGazeKo, 220),
      semantic5GroupPsdAndTrappedBallFlatKo: cleanSingleLineText(p.semantic5GroupPsdAndTrappedBallFlatKo, 220),
      pipelineAutonomyScore: clampWave51(p.pipelineAutonomyScore, 0, 100, 98),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      sevenStageAgentPipelineAnd100EpDnaHashKo: "대본→콘티→선화→밑색→명암→후보정→식자 7단 자율 에이전트 체인 및 100화 연재 캐릭터 DNA 해시 원장(흉터/가르마/복장 이월) 고정",
      adjacentPanel3dCameraFrustumAndGazeKo: "인접 컷 간 3D 카메라 프러스텀(Frustum) 궤적 솔버로 180도 액션축 침범 원천 차단 및 컷 간 시선(Eyeline) 벡터 정렬",
      semantic5GroupPsdAndTrappedBallFlatKo: "Trapped-Ball 워터셰드 끊긴 선화 자동 폐합(3px Gap-Closing) 밑색 분리 및 5그룹 시맨틱 PSD(대사/SFX/인물/배경/조명) 납품 검증",
      pipelineAutonomyScore: 98,
      overallPromptKo: "7단 자율 파이프라인·100화 DNA 원장·카메라 프러스텀·시맨틱 PSD 아키텍처 완성",
    }),
  });
}

export interface ClaudeToonstudio1020PlatformSupremeMeta {
  readonly supreme1020PlatformUiUxSynthesisKo: string;
  readonly twelveLocaleSimulpubGlossaryAndCopyfitKo: string;
  readonly spreadSpectrumWatermarkAnd60sShortsPvKo: string;
  readonly supremeMetaScore: number;
  readonly overallPromptKo: string;
}
const Supreme1020MetaSchema = z.object({
  supreme1020PlatformUiUxSynthesisKo: z.string(),
  twelveLocaleSimulpubGlossaryAndCopyfitKo: z.string(),
  spreadSpectrumWatermarkAnd60sShortsPvKo: z.string(),
  supremeMetaScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeToonstudio1020PlatformSupremeMetaDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeToonstudio1020PlatformSupremeMeta>> {
  return executeWave51ArtDirector({
    taskId: "art-director:toonstudio-1020-platform-supreme-meta-director",
    systemPrompt: "당신은 ToonStudio 1,020대 글로벌 웹툰 AI 플랫폼 UI/UX 수프림 메타 오케스트레이터·12개국 동시연재·보안/PV 총괄 감독입니다.",
    userInstruction: "1,020대 웹툰 AI 플랫폼 UI/UX 디자인 토큰 통합 및 172개 스마트 라우팅 오케스트레이션, 한·미·일·중·프·독·서·태·인니·베·대만·아랍 12개국 동시연재 고유명사 용어집/말풍선 카피피팅, 주파수 영역 비가시 포렌식 워터마크 및 9:16 60초 쇼츠 PV 자동 합성을 설계하세요.",
    input,
    schema: Supreme1020MetaSchema,
    options,
    normalize: (p) => Object.freeze({
      supreme1020PlatformUiUxSynthesisKo: cleanSingleLineText(p.supreme1020PlatformUiUxSynthesisKo, 220),
      twelveLocaleSimulpubGlossaryAndCopyfitKo: cleanSingleLineText(p.twelveLocaleSimulpubGlossaryAndCopyfitKo, 220),
      spreadSpectrumWatermarkAnd60sShortsPvKo: cleanSingleLineText(p.spreadSpectrumWatermarkAnd60sShortsPvKo, 220),
      supremeMetaScore: clampWave51(p.supremeMetaScore, 0, 100, 99),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      supreme1020PlatformUiUxSynthesisKo: "1,020대 글로벌·국내 웹툰 AI 보조 플랫폼 UI/UX 테마 토큰(WCAG AAA 명암비·도파민 페이스메이커) 및 172개 태스크 스마트 라우팅 통합",
      twelveLocaleSimulpubGlossaryAndCopyfitKo: "12개국(KR/EN/JA/ZH/ES/FR/DE/TH/ID/VI/TW/AR) 동시연재 고유명사/호칭 용어집 고정 및 세로쓰기·RTL·말풍선 자동 줄바꿈 카피피팅",
      spreadSpectrumWatermarkAnd60sShortsPvKo: "크롭/압축 내성 주파수 대역 확산(Spread-Spectrum) 비가시 워터마크 삽입 및 9:16 쇼츠/릴스/틱톡 60초 2.5D 패럴랙스 PV 자동 생성",
      supremeMetaScore: 99,
      overallPromptKo: "1,020대 웹툰 AI 플랫폼 UI/UX 수프림 메타 오케스트레이터·12개국 동시연재·보안/PV 통합 완료",
    }),
  });
}
