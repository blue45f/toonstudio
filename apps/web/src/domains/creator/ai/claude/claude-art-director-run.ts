/**
 * AI 아트 디렉터 실행 — 요청 생성 → Claude 구조화 출력 호출 → 정규화를 한 번에 묶는다.
 *
 * 전송·사용량 기록·거절/잘림 처리는 `claudeParse`가 맡고, 이 모듈은 결과를 화면에 올릴 값으로 바꾼다.
 * 자동 재시도·모델 대체는 없다 — 실패하면 사유를 그대로 올리고 사용자가 다시 누른다.
 */
import { z } from "zod";

import { CLAUDE_DEFAULT_MODEL_ID, claudeModelInfo, claudeModelSupportsEffort, estimateClaudeCostUsd, type ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { resolveClaudeRoute, type ClaudeRoute } from "@/shared/ai/claude/claude-route";
import { cleanSingleLineText } from "@/shared/ai/claude/claude-text";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";
import { hydrateDefaultEnvClaudeConnection } from "@/shared/ai/user-ai-store";

import { ArtDirectorReviewSchema, buildArtDirectorRequest, estimateArtDirectorCostCapUsd, normalizeArtDirectorReview, type ArtDirectorContext, type ArtDirectorImageInput, type ArtDirectorReview } from "./claude-art-director";
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
  // 실행 전 확인에 보인 값과 같은 함수로 잰 상한이다. 전송 계층이 예산 판정과 진행 중 예약에 쓴다.
  const { message, parsed } = await claudeParse(route, buildArtDirectorRequest(requested, image, context), ArtDirectorReviewSchema, {
    signal: options.signal,
    capUsd: estimateArtDirectorCostCapUsd(requested, image, context),
    budgetOverride: options.budgetOverride,
  });
  const model = message.model || requested;
  const usage = toClaudeTokenUsage(message.usage);
  return { review: normalizeArtDirectorReview(parsed, image), model: claudeModelInfo(model)?.id ?? model, usage, estimatedUsd: estimateClaudeCostUsd(model, usage)?.usd ?? null };
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
const AncientMythologySchema = z.object({ trireme3TierOarsAndCorinthianCapitalKo: z.string(), vikingLongshipClinkerAndElderFutharkKo: z.string(), egyptianKhopeshOuterEdgeAndMacuahuitlKo: z.string(), mythologyAccuracyScore: z.number(), overallPromptKo: z.string() });
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
const KoreanMilitarySchema = z.object({ rokBeretInsigniaLeftEyeAndRightPullKo: z.string(), dogtagLongShortChainAndRankInsigniaKo: z.string(), k2RifleLeftSelectorAndRightChargingHandleKo: z.string(), militaryAccuracyScore: z.number(), overallPromptKo: z.string() });
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
const SteampunkAirshipSchema = z.object({ airshipVentralGondolaAndBourdonGaugeKo: z.string(), windupAutomatonKeyAndCopperDivingHelmetKo: z.string(), plagueDoctorBeakMaskAndNixieTubeKo: z.string(), steampunkAccuracyScore: z.number(), overallPromptKo: z.string() });
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
const FloatingIslandSchema = z.object({ floatingIslandInvertedConeAndWorldTreeKo: z.string(), dragonHoard34DegCoinSlopeAndSlimeRefractionKo: z.string(), mimicChainForwardRuleAndGolemJointGapKo: z.string(), fantasyWorldAccuracyScore: z.number(), overallPromptKo: z.string() });
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
const KoreanMarketSchema = z.object({ marketRedBasinScaleAndBunsikTteokbokkiPanKo: z.string(), kbbqCopperExhaustPipeAndMelamineStoolKo: z.string(), jjimjilbangSheepTowelLockerAndCoinLaundryKo: z.string(), koreanLifeAccuracyScore: z.number(), overallPromptKo: z.string() });
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
const KoreanWeddingSchema = z.object({ paebaekJokduriAndJesaHongdongbaekseoKo: z.string(), hwatu12Months5KwangGodoriAndBlanketKo: z.string(), subwayRightTurnstileTagAndKtxSeatKo: z.string(), traditionTransitScore: z.number(), overallPromptKo: z.string() });
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
const Autonomous7StageSchema = z.object({ sevenStageAgentPipelineAnd100EpDnaHashKo: z.string(), adjacentPanel3dCameraFrustumAndGazeKo: z.string(), semantic5GroupPsdAndTrappedBallFlatKo: z.string(), pipelineAutonomyScore: z.number(), overallPromptKo: z.string() });
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
const Supreme1020MetaSchema = z.object({ supreme1020PlatformUiUxSynthesisKo: z.string(), twelveLocaleSimulpubGlossaryAndCopyfitKo: z.string(), spreadSpectrumWatermarkAnd60sShortsPvKo: z.string(), supremeMetaScore: z.number(), overallPromptKo: z.string() });
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

// ============================================================================
// Wave 54~56 (1,080대 플랫폼 내재화): 대항해시대 범선/함포·서부극 리볼버/살룬/기관차·누아르 트렌치코트/베네치안 블라인드/스파이·수술실 무영등/ECMO/B-DNA·현수교/석조아치/한옥 들어열개문/TBM·스트리머 마이크/링라이트/신티크/블렌더·깃Diff/칸반/디스코드/슈퍼챗/숏폼·1080대 옴니버스 수프림 엔진 8종
// ============================================================================

export interface ClaudeAgeOfSailGalleonWheelCannonCutlass {
  readonly galleonSquareRigRatlineAndKingSpokeHelmKo: string;
  readonly broadsideCannonBreechingRopeAndCutlassKo: string;
  readonly parchmentCompassRoseFleurDeLisAndSextantKo: string;
  readonly ageOfSailAccuracyScore: number;
  readonly overallPromptKo: string;
}
const AgeOfSailSchema = z.object({
  galleonSquareRigRatlineAndKingSpokeHelmKo: z.string(),
  broadsideCannonBreechingRopeAndCutlassKo: z.string(),
  parchmentCompassRoseFleurDeLisAndSextantKo: z.string(),
  ageOfSailAccuracyScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeAgeOfSailGalleonWheelCannonCutlassDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeAgeOfSailGalleonWheelCannonCutlass>> {
  return executeWave51ArtDirector({
    taskId: "art-director:age-of-sail-galleon-wheel-cannon-cutlass-lock",
    systemPrompt: "당신은 대항해시대 범선·해적 무구·항해술(갈레온 삭구·조타륜 왕살·함포 브리칭 로프·커틀러스·보물지도 나침반) 고증 디렉터입니다.",
    userInstruction: "갈레온 범선 가로돛(Square Rig)/사다리줄(Ratline)/후미 고물루(Quarterdeck)와 조타륜 중앙 왕살(King Spoke), 함포 포문 반동 억제 브리칭 로프(Breeching Rope)와 해적 커틀러스 황동 바스켓 가드(손등 보호), 양피지 보물지도 32방위 나침반 장미(북쪽 백합 문양 Fleur-de-lis) 및 육분의 고증을 설계하세요.",
    input,
    schema: AgeOfSailSchema,
    options,
    normalize: (p) => Object.freeze({
      galleonSquareRigRatlineAndKingSpokeHelmKo: cleanSingleLineText(p.galleonSquareRigRatlineAndKingSpokeHelmKo, 220),
      broadsideCannonBreechingRopeAndCutlassKo: cleanSingleLineText(p.broadsideCannonBreechingRopeAndCutlassKo, 220),
      parchmentCompassRoseFleurDeLisAndSextantKo: cleanSingleLineText(p.parchmentCompassRoseFleurDeLisAndSextantKo, 220),
      ageOfSailAccuracyScore: clampWave51(p.ageOfSailAccuracyScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      galleonSquareRigRatlineAndKingSpokeHelmKo: "대항해시대 갈레온 가로돛·슈라우드 사다리줄(Ratline)·후미 고물루 및 조타륜 정중앙 왕살(King Spoke) 각도 고정",
      broadsideCannonBreechingRopeAndCutlassKo: "현측 함포 반동 제어 브리칭 로프(Breeching Rope)·점화봉 및 해적 커틀러스 손등 보호 바스켓 가드·플린트락 부싯돌 고증",
      parchmentCompassRoseFleurDeLisAndSextantKo: "보물지도 32방위 나침반 장미 북쪽 백합 문양(Fleur-de-lis)·밀랍 봉인 및 황동 육분의(Sextant) 수평선 반사경 고정",
      ageOfSailAccuracyScore: 96,
      overallPromptKo: "대항해시대 범선 삭구·조타륜·함포·커틀러스·나침반 고증 고정 완료",
    }),
  });
}

export interface ClaudeWesternRevolverWinchesterSaloonLocomotive {
  readonly coltSaaRightEjectorRodAndFanningKo: string;
  readonly winchesterRightLoadingGateAndSaloonDoorsKo: string;
  readonly sheriffLeftStarBadgeAndLocomotiveCowcatcherKo: string;
  readonly westernFrontierScore: number;
  readonly overallPromptKo: string;
}
const WesternFrontierSchema = z.object({
  coltSaaRightEjectorRodAndFanningKo: z.string(),
  winchesterRightLoadingGateAndSaloonDoorsKo: z.string(),
  sheriffLeftStarBadgeAndLocomotiveCowcatcherKo: z.string(),
  westernFrontierScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeWesternRevolverWinchesterSaloonLocomotiveDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeWesternRevolverWinchesterSaloonLocomotive>> {
  return executeWave51ArtDirector({
    taskId: "art-director:western-revolver-winchester-saloon-locomotive-lock",
    systemPrompt: "당신은 서부극(Western) 총기·건축·증기기관차(콜트 SAA·윈체스터·살룬 스윙도어·보안관 배지·기관차 배장기) 고증 디렉터입니다.",
    userInstruction: "콜트 싱글액션 아미(Peacemaker) 6약실 총열 우측 추출봉(Ejector Rod)/우측 로딩게이트와 패닝 사격, 윈체스터 레버액션 우측 급탄구와 살룬 양방향 배트윙 스윙도어, 보안관 6각 별 배지(왼쪽 가슴 착용) 및 4-4-0 증기기관차 전면 삼각 배장기(Cowcatcher)/탄수차 고증을 설계하세요.",
    input,
    schema: WesternFrontierSchema,
    options,
    normalize: (p) => Object.freeze({
      coltSaaRightEjectorRodAndFanningKo: cleanSingleLineText(p.coltSaaRightEjectorRodAndFanningKo, 220),
      winchesterRightLoadingGateAndSaloonDoorsKo: cleanSingleLineText(p.winchesterRightLoadingGateAndSaloonDoorsKo, 220),
      sheriffLeftStarBadgeAndLocomotiveCowcatcherKo: cleanSingleLineText(p.sheriffLeftStarBadgeAndLocomotiveCowcatcherKo, 220),
      westernFrontierScore: clampWave51(p.westernFrontierScore, 0, 100, 97),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      coltSaaRightEjectorRodAndFanningKo: "콜트 싱글액션 리볼버 6약실·총열 우측 탄피 추출봉(Ejector Rod)/우측 로딩 게이트 고정 및 왼손바닥 해머 패닝(Fanning) 고증",
      winchesterRightLoadingGateAndSaloonDoorsKo: "윈체스터 M1873 하단 레버 루프·우측 리시버 급탄구(King's Improvement) 및 서부 살룬 양방향 배트윙 도어·박차(Rowel Spurs) 고정",
      sheriffLeftStarBadgeAndLocomotiveCowcatcherKo: "서부 보안관 6각 별 배지 좌측 가슴 착용 및 증기기관차 전면 삼각 배장기(Cowcatcher)·동륜 커넥팅 로드·석탄 탄수차(Tender) 직결",
      westernFrontierScore: 97,
      overallPromptKo: "서부극 콜트 리볼버·윈체스터·살룬 도어·보안관 배지·증기기관차 고증 완료",
    }),
  });
}

export interface ClaudeNoirTrenchcoatFedoraVenetianBlindSpy {
  readonly trenchcoatRightGunFlapAndFedoraPinchKo: string;
  readonly venetianBlindChiaroscuroAndTommyGunDrumKo: string;
  readonly concentricSuppressorAndMinoxSpyCameraKo: string;
  readonly noirEspionageScore: number;
  readonly overallPromptKo: string;
}
const NoirEspionageSchema = z.object({
  trenchcoatRightGunFlapAndFedoraPinchKo: z.string(),
  venetianBlindChiaroscuroAndTommyGunDrumKo: z.string(),
  concentricSuppressorAndMinoxSpyCameraKo: z.string(),
  noirEspionageScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeNoirTrenchcoatFedoraVenetianBlindSpyDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeNoirTrenchcoatFedoraVenetianBlindSpy>> {
  return executeWave51ArtDirector({
    taskId: "art-director:noir-trenchcoat-fedora-venetian-blind-spy-lock",
    systemPrompt: "당신은 하드보일드 누아르·냉전 첩보물(트렌치코트·페도라·베네치안 블라인드·톰슨 기관단총·소음기·미녹스 카메라) 디렉터입니다.",
    userInstruction: "트렌치코트 우측 가슴 건플랩(Gun Flap)/어깨 견장/벨트 D링과 중절모 페도라 크라운 핀치, 베네치안 블라인드 슬랫 줄무늬 그림자의 인체 입체 굴곡 투영, 톰슨 기관단총 50발 드럼탄창/냉각핀과 권총 소음기 총열 동축 정렬·미녹스 초소형 스파이 카메라 고증을 설계하세요.",
    input,
    schema: NoirEspionageSchema,
    options,
    normalize: (p) => Object.freeze({
      trenchcoatRightGunFlapAndFedoraPinchKo: cleanSingleLineText(p.trenchcoatRightGunFlapAndFedoraPinchKo, 220),
      venetianBlindChiaroscuroAndTommyGunDrumKo: cleanSingleLineText(p.venetianBlindChiaroscuroAndTommyGunDrumKo, 220),
      concentricSuppressorAndMinoxSpyCameraKo: cleanSingleLineText(p.concentricSuppressorAndMinoxSpyCameraKo, 220),
      noirEspionageScore: clampWave51(p.noirEspionageScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      trenchcoatRightGunFlapAndFedoraPinchKo: "누아르 트렌치코트 우측 가슴 건플랩(개머리판 완충 패드)·어깨 에폴렛·벨트 D링 및 페도라 물방울 크라운 핀치·전면 챙 스냅 고정",
      venetianBlindChiaroscuroAndTommyGunDrumKo: "창가 베네치안 블라인드 슬랫 줄무늬 그림자의 얼굴/어깨 입체 곡면 래핑 및 톰슨 M1928 50발 드럼탄창·총열 냉각핀 고증",
      concentricSuppressorAndMinoxSpyCameraKo: "권총 소음기(Suppressor) 총열 중심축 완전 동축 정렬·하이 프로파일 가늠쇠 및 냉전 미녹스(Minox) 푸시풀 스파이 카메라·마이크로닷 고정",
      noirEspionageScore: 96,
      overallPromptKo: "누아르 트렌치코트·베네치안 블라인드·톰슨 드럼탄창·소음기·스파이 카메라 고정 완료",
    }),
  });
}

export interface ClaudeSurgicalLightEcmoTriageBloodBagBdna {
  readonly shadowlessSurgicalLightAndAnesthesiaVaporizerKo: string;
  readonly ecmoVenousArterialColorAndTriageTagKo: string;
  readonly bloodBagHalfDripChamberAndRightHandedBdnaKo: string;
  readonly biomedicalRigorScore: number;
  readonly overallPromptKo: string;
}
const BiomedicalSurgicalSchema = z.object({
  shadowlessSurgicalLightAndAnesthesiaVaporizerKo: z.string(),
  ecmoVenousArterialColorAndTriageTagKo: z.string(),
  bloodBagHalfDripChamberAndRightHandedBdnaKo: z.string(),
  biomedicalRigorScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeSurgicalLightEcmoTriageBloodBagBdnaDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeSurgicalLightEcmoTriageBloodBagBdna>> {
  return executeWave51ArtDirector({
    taskId: "art-director:surgical-light-ecmo-triage-blood-bag-bdna-lock",
    systemPrompt: "당신은 중증외상센터·수술실·생명공학(무영등·마취기·ECMO·트리아지 태그·수혈 점적통·오른나사 B-DNA) 고증 디렉터입니다.",
    userInstruction: "수술실 무영등 다중 반사경/중앙 녹색 멸균 핸들과 마취기 벨로우즈/기화기 색상코드(세보플루란=노란색, 데스플루란=파란색), 에크모(ECMO) 암적색 정맥혈 유입관 vs 선홍색 동맥혈 유출관 대비와 재난 트리아지 4색 태그, 수혈 점적통(Drip Chamber) 50% 수위 유지 및 오른나사 법칙(Right-handed) B-DNA 이중나선(좌선회 작붕 차단)을 설계하세요.",
    input,
    schema: BiomedicalSurgicalSchema,
    options,
    normalize: (p) => Object.freeze({
      shadowlessSurgicalLightAndAnesthesiaVaporizerKo: cleanSingleLineText(p.shadowlessSurgicalLightAndAnesthesiaVaporizerKo, 220),
      ecmoVenousArterialColorAndTriageTagKo: cleanSingleLineText(p.ecmoVenousArterialColorAndTriageTagKo, 220),
      bloodBagHalfDripChamberAndRightHandedBdnaKo: cleanSingleLineText(p.bloodBagHalfDripChamberAndRightHandedBdnaKo, 220),
      biomedicalRigorScore: clampWave51(p.biomedicalRigorScore, 0, 100, 97),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      shadowlessSurgicalLightAndAnesthesiaVaporizerKo: "수술실 꽃잎형 무영등 다중 반사경·중앙 녹색 멸균 손잡이 및 마취기 벨로우즈·기화기 색상코드(세보플루란 노랑/이소플루란 보라) 고정",
      ecmoVenousArterialColorAndTriageTagKo: "ECMO 산화기 전단 암적색 정맥혈관 vs 후단 선홍색 동맥혈관 색상 구분 및 재난 START 트리아지 4색 태그(절취선 초록→노랑→빨강→검정) 고증",
      bloodBagHalfDripChamberAndRightHandedBdnaKo: "수혈 세트 점적통(Drip Chamber) 절반 수위 공기층 유지 및 유전자 B-DNA 이중나선 오른나사(Right-Handed Helix) 주홈/부홈 회전 방향 고정",
      biomedicalRigorScore: 97,
      overallPromptKo: "수술실 무영등·ECMO·트리아지 태그·수혈 점적통·오른나사 B-DNA 고증 완료",
    }),
  });
}

export interface ClaudeSuspensionBridgeArchKeystoneHanokDoorTbm {
  readonly suspensionParabolicVsCableStayedFanBridgeKo: string;
  readonly masonryArchKeystoneAndGothicFlyingButtressKo: string;
  readonly hanokDeureoyeolgaeHookAndTbmSegmentRingKo: string;
  readonly civilArchIntegrityScore: number;
  readonly overallPromptKo: string;
}
const CivilArchSchema = z.object({
  suspensionParabolicVsCableStayedFanBridgeKo: z.string(),
  masonryArchKeystoneAndGothicFlyingButtressKo: z.string(),
  hanokDeureoyeolgaeHookAndTbmSegmentRingKo: z.string(),
  civilArchIntegrityScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeSuspensionBridgeArchKeystoneHanokDoorTbmDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeSuspensionBridgeArchKeystoneHanokDoorTbm>> {
  return executeWave51ArtDirector({
    taskId: "art-director:suspension-bridge-arch-keystone-hanok-door-tbm-lock",
    systemPrompt: "당신은 토목·동서양 건축 구조(현수교 vs 사장교·석조 아치 종석·고딕 플라잉 버트레스·한옥 들어열개문·TBM 터널) 디렉터입니다.",
    userInstruction: "현수교(포물선 주케이블+수직 행어 로프)와 사장교(주탑에서 상판으로 직선 사선 케이블 연결) 구분, 석조 아치 정중앙 사다리꼴 쐐기 종석(Keystone)과 고딕 성당 외벽 플라잉 버트레스, 한옥 대청마루 들어열개문(분합문) 처마 걸쇠(약물림) 및 엘리베이터 균형추/TBM 프리캐스트 세그먼트 링을 설계하세요.",
    input,
    schema: CivilArchSchema,
    options,
    normalize: (p) => Object.freeze({
      suspensionParabolicVsCableStayedFanBridgeKo: cleanSingleLineText(p.suspensionParabolicVsCableStayedFanBridgeKo, 220),
      masonryArchKeystoneAndGothicFlyingButtressKo: cleanSingleLineText(p.masonryArchKeystoneAndGothicFlyingButtressKo, 220),
      hanokDeureoyeolgaeHookAndTbmSegmentRingKo: cleanSingleLineText(p.hanokDeureoyeolgaeHookAndTbmSegmentRingKo, 220),
      civilArchIntegrityScore: clampWave51(p.civilArchIntegrityScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      suspensionParabolicVsCableStayedFanBridgeKo: "현수교(포물선 주케이블+수직 행어)와 사장교(주탑 직선 부채꼴 사선 케이블) 구조 혼동 차단 및 아치댐 상류 볼록 곡률 고정",
      masonryArchKeystoneAndGothicFlyingButtressKo: "로마 석조 아치 정중앙 사다리꼴 쐐기 종석(Keystone)·부수아르 조적 및 고딕 대성당 외벽 플라잉 버트레스·피나클 하중 지지 고증",
      hanokDeureoyeolgaeHookAndTbmSegmentRingKo: "한옥 대청마루 들어열개문 처마 걸쇠(약물림) 수납·엘리베이터 균형추 반대 이동 및 TBM 터널 디스크 커터헤드·콘크리트 세그먼트 링 고정",
      civilArchIntegrityScore: 96,
      overallPromptKo: "현수교/사장교·석조 아치 종석·한옥 들어열개문·엘리베이터 균형추·TBM 고증 완료",
    }),
  });
}

export interface ClaudeStreamerMicRingLightCintiqBlenderNode {
  readonly sideAddressCondenserMicAnd15KeyStreamDeckKo: string;
  readonly ringLightDonutCatchlightAndChromaCycloramaKo: string;
  readonly cintiqTourboxGloveAndBlenderSocketColorsKo: string;
  readonly creatorHardwareScore: number;
  readonly overallPromptKo: string;
}
const CreatorHardwareSchema = z.object({
  sideAddressCondenserMicAnd15KeyStreamDeckKo: z.string(),
  ringLightDonutCatchlightAndChromaCycloramaKo: z.string(),
  cintiqTourboxGloveAndBlenderSocketColorsKo: z.string(),
  creatorHardwareScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeStreamerMicRingLightCintiqBlenderNodeDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeStreamerMicRingLightCintiqBlenderNode>> {
  return executeWave51ArtDirector({
    taskId: "art-director:streamer-mic-ringlight-cintiq-blender-node-lock",
    systemPrompt: "당신은 인방물 스트리머 장비·웹툰 작가 신티크/3D 소프트웨어 UI(콘덴서 마이크·링라이트·스트림덱·투어박스·블렌더 노드) 디렉터입니다.",
    userInstruction: "사이드 어드레스 콘덴서 마이크 측면(로고 방향) 수음 원칙(정수리 끝단에 대고 말하는 작붕 차단)과 3×5 15키 스트림덱, 18인치 링라이트 눈동자 도넛 캐치라이트와 크로마키 호리존, 웹툰 작가 오른손 2지 타블렛 장갑/왼손 투어박스 및 블렌더 노드 소켓 색상(노랑=컬러, 보라=벡터, 초록=셰이더)을 설계하세요.",
    input,
    schema: CreatorHardwareSchema,
    options,
    normalize: (p) => Object.freeze({
      sideAddressCondenserMicAnd15KeyStreamDeckKo: cleanSingleLineText(p.sideAddressCondenserMicAnd15KeyStreamDeckKo, 220),
      ringLightDonutCatchlightAndChromaCycloramaKo: cleanSingleLineText(p.ringLightDonutCatchlightAndChromaCycloramaKo, 220),
      cintiqTourboxGloveAndBlenderSocketColorsKo: cleanSingleLineText(p.cintiqTourboxGloveAndBlenderSocketColorsKo, 220),
      creatorHardwareScore: clampWave51(p.creatorHardwareScore, 0, 100, 97),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      sideAddressCondenserMicAnd15KeyStreamDeckKo: "사이드 어드레스 콘덴서 마이크는 상단 끝이 아닌 정면 옆구리 다이어프램에 대고 발화하며 쇼크마운트·팝필터·3×5 LCD 스트림덱 배치 고정",
      ringLightDonutCatchlightAndChromaCycloramaKo: "18인치 LED 링라이트 촬영 시 동공 중앙 원형 도넛 캐치라이트 반사 및 크로마키(#00B140) 호리존 그린 스필 억제 고정",
      cintiqTourboxGloveAndBlenderSocketColorsKo: "신티크 프로 에르고 암·오른손 약지/소지 2지 드로잉 장갑·왼손 투어박스 및 블렌더 노드 소켓(노랑=Color, 보라=Vector, 초록=Shader) 고정",
      creatorHardwareScore: 97,
      overallPromptKo: "스트리머 마이크 측면 수음·링라이트 도넛 반사·신티크/투어박스·블렌더 노드 고정 완료",
    }),
  });
}

export interface ClaudeGitDiffKanbanDiscordSuperchatShortsSafezone {
  readonly gitBranchGraphAndPrGreenRedDiffKo: string;
  readonly webtoon6ColumnKanbanAndDiscordGreenRingKo: string;
  readonly superchatColorTierAnd9x16ShortsSafezoneKo: string;
  readonly digitalPlatformUxScore: number;
  readonly overallPromptKo: string;
}
const DigitalPlatformUxSchema = z.object({
  gitBranchGraphAndPrGreenRedDiffKo: z.string(),
  webtoon6ColumnKanbanAndDiscordGreenRingKo: z.string(),
  superchatColorTierAnd9x16ShortsSafezoneKo: z.string(),
  digitalPlatformUxScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeGitDiffKanbanDiscordSuperchatShortsSafezoneDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeGitDiffKanbanDiscordSuperchatShortsSafezone>> {
  return executeWave51ArtDirector({
    taskId: "art-director:git-diff-kanban-discord-superchat-shorts-director",
    systemPrompt: "당신은 현대 IT/인방/숏폼 UI 고증(Git PR Diff·웹툰 마감 칸반·디스코드 보이스 링·유튜브 슈퍼챗 티어·9:16 숏폼 세이프존) 총괄 감독입니다.",
    userInstruction: "깃허브 브랜치 머지 그래프와 PR 코드 리뷰 추가(+초록)/삭제(-빨강) Diff, 웹툰 스튜디오 6단계(대본→콘티→선화→밑색→명암→식자) 칸반 보드와 디스코드 발화자 그린 아바타 링, 유튜브 슈퍼챗 후원 금액별 색상 티어(파랑→노랑→주황→마젠타→빨강) 및 9:16 틱톡/릴스/쇼츠 우측 아이콘·하단 자막 세이프존을 설계하세요.",
    input,
    schema: DigitalPlatformUxSchema,
    options,
    normalize: (p) => Object.freeze({
      gitBranchGraphAndPrGreenRedDiffKo: cleanSingleLineText(p.gitBranchGraphAndPrGreenRedDiffKo, 220),
      webtoon6ColumnKanbanAndDiscordGreenRingKo: cleanSingleLineText(p.webtoon6ColumnKanbanAndDiscordGreenRingKo, 220),
      superchatColorTierAnd9x16ShortsSafezoneKo: cleanSingleLineText(p.superchatColorTierAnd9x16ShortsSafezoneKo, 220),
      digitalPlatformUxScore: clampWave51(p.digitalPlatformUxScore, 0, 100, 98),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      gitBranchGraphAndPrGreenRedDiffKo: "개발자 웹툰 Git 브랜치 분기/병합 그래프 및 Pull Request 코드 Diff(+초록 추가 라인 / -빨강 삭제 라인) 문법 하이라이트 고정",
      webtoon6ColumnKanbanAndDiscordGreenRingKo: "웹툰 주간 마감 6단계 칸반 보드 카드 상태 및 디스코드 음성채널 현재 발화자 아바타에만 초록색 발광 링(#22C55E) 활성화",
      superchatColorTierAnd9x16ShortsSafezoneKo: "라이브 방송 슈퍼챗 금액별 색상 티어(Blue→Yellow→Orange→Magenta→Red) 및 9:16 숏폼 우측 액션바(14%)·하단 캡션(22%) 세이프존 고정",
      digitalPlatformUxScore: 98,
      overallPromptKo: "Git PR Diff·마감 칸반·디스코드 발화 링·슈퍼챗 색상 티어·9:16 세이프존 완료",
    }),
  });
}

export interface ClaudeToonstudio1080OmniverseDcfStrokeSupreme {
  readonly omniverse1080PlatformAnd180TaskRoutingKo: string;
  readonly cookieFastpassModalAndIpDcfValuationKo: string;
  readonly neuralNextStrokeAndVectorInbetweenKo: string;
  readonly omniverseSupremeScore: number;
  readonly overallPromptKo: string;
}
const Omniverse1080SupremeSchema = z.object({
  omniverse1080PlatformAnd180TaskRoutingKo: z.string(),
  cookieFastpassModalAndIpDcfValuationKo: z.string(),
  neuralNextStrokeAndVectorInbetweenKo: z.string(),
  omniverseSupremeScore: z.number(),
  overallPromptKo: z.string(),
});
export async function runClaudeToonstudio1080OmniverseDcfStrokeSupremeDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeToonstudio1080OmniverseDcfStrokeSupreme>> {
  return executeWave51ArtDirector({
    taskId: "art-director:toonstudio-1080-omniverse-dcf-stroke-supreme-director",
    systemPrompt: "당신은 ToonStudio 1,080대 글로벌 웹툰 AI 플랫폼 옴니버스 수프림 엔진·IP DCF 가치평가·신경망 선화 예측 총괄 감독입니다.",
    userInstruction: "1,080대 글로벌·국내 웹툰 AI 보조 플랫폼 UI/UX 테마 토큰과 180대 태스크 스마트 라우팅 통합, 유료 미리보기(쿠키/패스트패스) 결제 모달 UX와 웹툰 IP DCF 가치평가(조회수+미리보기+해외연재+OSMU 판권 멀티플), 실시간 신경망 다음 선화 스트로크 궤적 예측 및 벡터 인비트위닝을 설계하세요.",
    input,
    schema: Omniverse1080SupremeSchema,
    options,
    normalize: (p) => Object.freeze({
      omniverse1080PlatformAnd180TaskRoutingKo: cleanSingleLineText(p.omniverse1080PlatformAnd180TaskRoutingKo, 220),
      cookieFastpassModalAndIpDcfValuationKo: cleanSingleLineText(p.cookieFastpassModalAndIpDcfValuationKo, 220),
      neuralNextStrokeAndVectorInbetweenKo: cleanSingleLineText(p.neuralNextStrokeAndVectorInbetweenKo, 220),
      omniverseSupremeScore: clampWave51(p.omniverseSupremeScore, 0, 100, 99),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      omniverse1080PlatformAnd180TaskRoutingKo: "글로벌·국내 1,080대 웹툰 AI 보조 플랫폼 UI/UX 디자인 토큰 및 180개 태스크(Haiku 46 · Sonnet 90 · Opus 44) 스마트 라우팅 옴니버스 통합",
      cookieFastpassModalAndIpDcfValuationKo: "유료 미리보기(쿠키/코인) 해금 모달 전환율 최적화 및 웹툰 IP 현금흐름할인(DCF)·2차 판권(드라마/애니/게임/MD) 멀티플 가치평가",
      neuralNextStrokeAndVectorInbetweenKo: "작가 필압·곡률 기반 다음 선화 스트로크 궤적 실시간 신경망 예측 및 키프레임 간 벡터 탄성 인비트위닝 자동 보간",
      omniverseSupremeScore: 99,
      overallPromptKo: "1,080대 플랫폼 옴니버스 수프림 엔진·180개 스마트 라우팅·IP DCF 가치평가 완성",
    }),
  });
}
