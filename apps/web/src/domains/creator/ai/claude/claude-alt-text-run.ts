/**
 * AI 대체 텍스트 실행 — 요청 생성 → Claude 구조화 출력 호출 → 검증을 한 번에 묶는다.
 *
 * 전송·사용량 기록·거절/잘림 처리는 `claudeParse`가 맡는다. 자동 재시도·모델 대체는 없다 — 실패하면 사유를 그대로 올리고
 * 사용자가 다시 누른다.
 */
import { z } from "zod";

import { CLAUDE_DEFAULT_MODEL_ID, claudeModelInfo, claudeModelSupportsEffort, estimateClaudeCostUsd, type ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { resolveClaudeRoute, type ClaudeRoute } from "@/shared/ai/claude/claude-route";
import { cleanSingleLineText } from "@/shared/ai/claude/claude-text";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";
import { hydrateDefaultEnvClaudeConnection } from "@/shared/ai/user-ai-store";

import {
  AltTextSchema,
  buildAltTextRequest,
  estimateAltTextCostCapUsd,
  normalizeAltText,
  type AltTextContext,
  type AltTextView,
  type RunWave30LocalizeAssistOptions,
  type Wave30LocalizeAssistInput,
  type Wave30LocalizeAssistResult,
} from "./claude-alt-text";
import { resolveCreatorTaskModelRoute, type ClaudeCreatorTaskId } from "./claude-creator-model-router";
import { estimateStructuredCostCapUsd } from "./claude-feature-cost-cap";

import type { ArtDirectorImageInput } from "./claude-art-director";
import type Anthropic from "@anthropic-ai/sdk";

export { estimateAltTextCostCapUsd } from "./claude-alt-text";

export interface AltTextRunResult {
  readonly view: AltTextView;
  /** 요청한 범위. 결과를 화면에 올릴 때 어떤 칸을 보일지 정한다. */
  readonly scope: AltTextContext["scope"];
  /** 실제로 응답한 모델. 요청한 모델과 날짜 접미사만 다를 수 있다. */
  readonly model: string;
  readonly usage: ClaudeTokenUsage;
  /** 공개 가격표 기준 추정 비용. 단가를 모르는 모델이면 null. */
  readonly estimatedUsd: number | null;
}

export interface AltTextRunOptions {
  /** 비우면 연결의 기본 모델을 쓴다. */
  readonly model?: string;
  readonly signal?: AbortSignal;
  /** 사용자가 "이번 한 번만 예산을 넘어도 진행"을 직접 고른 요청이면 true. 전송 계층의 예산 판정을 건너뛴다. */
  readonly budgetOverride?: boolean;
}

export async function runAltText(
  route: Pick<ClaudeRoute, "apiKey" | "revision" | "model">,
  image: ArtDirectorImageInput,
  context: AltTextContext,
  options: AltTextRunOptions = {},
): Promise<AltTextRunResult> {
  const requested = resolveClaudeRequestModel(options.model, route.model);
  const { message, parsed } = await claudeParse(
    route,
    buildAltTextRequest(requested, image, context),
    AltTextSchema,
    {
      signal: options.signal,
      // 실행 전 확인에 보인 값과 같은 함수로 잰 상한이다. 전송 계층이 예산 판정과 진행 중 예약에 쓴다.
      capUsd: estimateAltTextCostCapUsd(requested, image, context.scope, context),
      budgetOverride: options.budgetOverride,
    },
  );
  const model = message.model || requested;
  const usage = toClaudeTokenUsage(message.usage);
  return {
    view: normalizeAltText(parsed, context.scope),
    scope: context.scope,
    model: claudeModelInfo(model)?.id ?? model,
    usage,
    estimatedUsd: estimateClaudeCostUsd(model, usage)?.usd ?? null,
  };
}

// ============================================================================
// Wave 57~59 (1,140대 플랫폼 내재화): 국악/종묘제례악·탈춤/경극/가부키/토가/향로·오르간/하프/아코디언/백파이프·F1/WRC/스카이다이빙/서핑/요트·항공유도/등대/남극/천문대/시계탑·유리공예/루시어/보석감정/수제화·3DGS/NeRF/ControlNet4/FACS/시선히트맵·1140대하이퍼신세시스/독소조항스캐너 8종
// ============================================================================

function clampWave57(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

async function executeWave57AltTextDirector<TSchema extends z.ZodTypeAny, TOut>(params: {
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

export interface ClaudeJongmyoGayageumGeomungoDaegeumJanggu {
  readonly pyeonjongPyeongyeongChukEoRitualKo: string;
  readonly gayageum12AnjokAndGeomungoSuldaeKo: string;
  readonly daegeumCheonggongAndJangguLeftRightKo: string;
  readonly koreanCourtMusicAccuracyScore: number;
  readonly overallPromptKo: string;
}
const JongmyoGayageumSchema = z.object({ pyeonjongPyeongyeongChukEoRitualKo: z.string(), gayageum12AnjokAndGeomungoSuldaeKo: z.string(), daegeumCheonggongAndJangguLeftRightKo: z.string(), koreanCourtMusicAccuracyScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeJongmyoGayageumGeomungoDaegeumJangguDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeJongmyoGayageumGeomungoDaegeumJanggu>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:jongmyo-gayageum-geomungo-daegeum-janggu-lock",
    systemPrompt: "당신은 한국 궁중 제례악 및 전통 국악기(종묘제례악 편종/편경/축/어·가야금 12현 안족·거문고 술대·대금 청공·장구 궁편/열편) 고증 디렉터입니다.",
    userInstruction: "종묘제례악 편종/편경 16개 2단 배열과 시작 악기 축(Chuk)·끝 악기 호랑이 어(Eo), 가야금 12현 기러기발 안족(Anjok) 사선 배치와 거문고 오른손 대나무 술대(Suldae)/16괘, 대금 청공 가리개와 장구 좌측 궁편(궁채)/우측 열편(열채) 및 해금 두 줄 사이 활대 고정 지침을 생성하세요.",
    input,
    schema: JongmyoGayageumSchema,
    options,
    normalize: (p) => Object.freeze({
      pyeonjongPyeongyeongChukEoRitualKo: cleanSingleLineText(p.pyeonjongPyeongyeongChukEoRitualKo, 220),
      gayageum12AnjokAndGeomungoSuldaeKo: cleanSingleLineText(p.gayageum12AnjokAndGeomungoSuldaeKo, 220),
      daegeumCheonggongAndJangguLeftRightKo: cleanSingleLineText(p.daegeumCheonggongAndJangguLeftRightKo, 220),
      koreanCourtMusicAccuracyScore: clampWave57(p.koreanCourtMusicAccuracyScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      pyeonjongPyeongyeongChukEoRitualKo: "종묘제례악 편종(청동종 16개)·편경(ㄱ자 경돌 16개) 상하 2단 8개씩 배열 및 시작을 알리는 네모 나무상자 축(柷)·끝을 알리는 톱니 등 호랑이 어(敔) 고증",
      gayageum12AnjokAndGeomungoSuldaeKo: "가야금 12명주실 기러기발 안족(雁足) 사선 배열 및 거문고 6현·16괘 위 왼손 명주실 골무 운지와 오른손 대나무 술대 타현 구분 고정",
      daegeumCheonggongAndJangguLeftRightKo: "대금 취구 아래 갈대 속청을 붙이는 청공(淸孔) 위치 및 장구 좌측 궁편(두꺼운 가죽·둥근 궁채)/우측 열편(얇은 가죽·납작한 열채) 좌우 반전 차단",
      koreanCourtMusicAccuracyScore: 96,
      overallPromptKo: "종묘제례악 편종/편경/축/어·가야금 안족·거문고 술대·장구 궁편/열편 고증 완료",
    }),
  });
}

export interface ClaudeHahoeMaskLianpuKabukiTogaThurible {
  readonly hahoeSplitChinAndPekingLianpuColorKo: string;
  readonly kabukiKumadoriAndNohHannyaShadowKo: string;
  readonly romanTogaLeftShoulderAndThurible4ChainKo: string;
  readonly ritualTheaterAccuracyScore: number;
  readonly overallPromptKo: string;
}
const HahoeLianpuTogaSchema = z.object({ hahoeSplitChinAndPekingLianpuColorKo: z.string(), kabukiKumadoriAndNohHannyaShadowKo: z.string(), romanTogaLeftShoulderAndThurible4ChainKo: z.string(), ritualTheaterAccuracyScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeHahoeMaskLianpuKabukiTogaThuribleDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeHahoeMaskLianpuKabukiTogaThurible>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:hahoe-mask-lianpu-kabuki-toga-thurible-lock",
    systemPrompt: "당신은 동서양 전통 가면극·제의·고전 복식(하회탈 분리 턱·경극 검프·가부키 쿠마도리/노멘·로마 토가 좌측 어깨·성당 향로/신사 도리이) 고증 디렉터입니다.",
    userInstruction: "하회탈 양반탈의 끈으로 연결된 분리형 턱 구조와 경극 검프(Lianpu) 색상별 성격(적=충의/흑=강직/백=간신), 가부키 쿠마도리 분장과 노가쿠 한냐/코오모테 탈 각도 음영, 고대 로마 토가 좌측 어깨 드레이프(오른팔 노출) 및 성당 향로(사슬 4줄)·신사 도리이/시데 고정 지침을 생성하세요.",
    input,
    schema: HahoeLianpuTogaSchema,
    options,
    normalize: (p) => Object.freeze({
      hahoeSplitChinAndPekingLianpuColorKo: cleanSingleLineText(p.hahoeSplitChinAndPekingLianpuColorKo, 220),
      kabukiKumadoriAndNohHannyaShadowKo: cleanSingleLineText(p.kabukiKumadoriAndNohHannyaShadowKo, 220),
      romanTogaLeftShoulderAndThurible4ChainKo: cleanSingleLineText(p.romanTogaLeftShoulderAndThurible4ChainKo, 220),
      ritualTheaterAccuracyScore: clampWave57(p.ritualTheaterAccuracyScore, 0, 100, 95),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      hahoeSplitChinAndPekingLianpuColorKo: "하회탈 양반탈 분리형 아랫턱(고개를 젖히면 활짝 웃고 숙이면 입이 닫힘) 및 경극 검프 색상 코드(붉은색=충절, 검은색=직언/무용, 흰색=간교) 고정",
      kabukiKumadoriAndNohHannyaShadowKo: "가부키 쿠마도리 혈관 분장(붉은 스지쿠마=영웅, 푸른 쿠게쿠마=원령/악역)과 미에(見得) 사시 시선 및 노가쿠 한냐 탈 뿔/눈물 각도 음영 고정",
      romanTogaLeftShoulderAndThurible4ChainKo: "고대 로마 토가(Toga) 좌측 어깨 걸침(오른팔 자유 노출)·성당 향로(Thurible) 외곽 3줄+중앙 뚜껑 1줄 사슬·티베트 마니차 시계방향 회전 고정",
      ritualTheaterAccuracyScore: 95,
      overallPromptKo: "하회탈 분리 턱·경극 검프·가부키 쿠마도리·로마 토가 좌측 어깨·향로 고증 완료",
    }),
  });
}

export interface ClaudePipeOrganPedalHarpAccordionBagpipe {
  readonly pipeOrganManualsStopsAndPedalboardKo: string;
  readonly pedalHarp47StringRedCBlueFRightShoulderKo: string;
  readonly accordionRightKeysLeftBassAndBagpipe3DroneKo: string;
  readonly classicalInstrumentScore: number;
  readonly overallPromptKo: string;
}
const PipeOrganHarpSchema = z.object({ pipeOrganManualsStopsAndPedalboardKo: z.string(), pedalHarp47StringRedCBlueFRightShoulderKo: z.string(), accordionRightKeysLeftBassAndBagpipe3DroneKo: z.string(), classicalInstrumentScore: z.number(), overallPromptKo: z.string() });
export async function runClaudePipeOrganPedalHarpAccordionBagpipeDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudePipeOrganPedalHarpAccordionBagpipe>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:pipe-organ-pedal-harp-accordion-bagpipe-lock",
    systemPrompt: "당신은 클래식/유럽 악기(파이프 오르간 다단 건반/스톱/발건반·콘서트 하프 47현 적색 C/청색 F·아코디언 좌우·백파이프 3드론) 구조 디렉터입니다.",
    userInstruction: "대성당 파이프 오르간의 계단식 다단 매뉴얼 건반·좌우 스톱 노브·32노트 오목 방사형 발건반, 콘서트 페달 하프 47현 중 C음(빨간 줄)·F음(파란/검은 줄) 배열과 오른쪽 어깨 밀착, 피아노 아코디언 오른손 건반/왼손 스트라델라 베이스 버튼 및 백파이프 3개 숄더 드론 구조를 설계하세요.",
    input,
    schema: PipeOrganHarpSchema,
    options,
    normalize: (p) => Object.freeze({
      pipeOrganManualsStopsAndPedalboardKo: cleanSingleLineText(p.pipeOrganManualsStopsAndPedalboardKo, 220),
      pedalHarp47StringRedCBlueFRightShoulderKo: cleanSingleLineText(p.pedalHarp47StringRedCBlueFRightShoulderKo, 220),
      accordionRightKeysLeftBassAndBagpipe3DroneKo: cleanSingleLineText(p.accordionRightKeysLeftBassAndBagpipe3DroneKo, 220),
      classicalInstrumentScore: clampWave57(p.classicalInstrumentScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      pipeOrganManualsStopsAndPedalboardKo: "파이프 오르간 3~4단 계단식 손건반(Manuals)·양측 음색 스톱 노브(Drawknobs)·하단 32건반 오목 방사형 페달보드 및 전면 파사드 파이프 대칭 고정",
      pedalHarp47StringRedCBlueFRightShoulderKo: "콘서트 그랜드 하프 47현 중 모든 도(C) 현은 빨간색·파(F) 현은 검정/파란색 규칙, 하단 7개 반음 페달 홈 및 연주자 우측 어깨 공명통 밀착 고정",
      accordionRightKeysLeftBassAndBagpipe3DroneKo: "아코디언 연주자 기준 오른손 수직 피아노 건반·왼손 베이스 코드 버튼 배열 고정 및 스코틀랜드 백파이프 좌측 겨드랑이 백·어깨 3드론·양손 챈터 고증",
      classicalInstrumentScore: 96,
      overallPromptKo: "파이프 오르간 다단 건반·하프 적청 기준현·아코디언 좌우·백파이프 3드론 완료",
    }),
  });
}

export interface ClaudeF1KerbWrcRollcageSkydivingSurfingYacht {
  readonly f1ApexKerbTireCompoundAndWrcRollcageKo: string;
  readonly skydivingLeftAltimeterRightPilotAndParagliderKo: string;
  readonly surfboardRearLeash3FinAndYachtHikeOutKo: string;
  readonly extremeMotorsportAccuracyScore: number;
  readonly overallPromptKo: string;
}
const F1WrcSkydivingSchema = z.object({ f1ApexKerbTireCompoundAndWrcRollcageKo: z.string(), skydivingLeftAltimeterRightPilotAndParagliderKo: z.string(), surfboardRearLeash3FinAndYachtHikeOutKo: z.string(), extremeMotorsportAccuracyScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeF1KerbWrcRollcageSkydivingSurfingYachtDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeF1KerbWrcRollcageSkydivingSurfingYacht>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:f1-kerb-wrc-rollcage-skydiving-surfing-yacht-lock",
    systemPrompt: "당신은 모터스포츠·항공/해양 익스트림 스포츠(F1 연석/컴파운드·WRC 롤케이지/페이스노트·스카이다이빙 고도계/파일럿슈트·서핑 리쉬코드·요트 하이크아웃) 디렉터입니다.",
    userInstruction: "F1 서킷 코너 에이펙스 연석(Kerb)과 타이어 컴파운드 색띠(Soft=Red/Medium=Yellow/Hard=White) 및 WRC 랠리카 롤케이지/코드라이버 페이스노트, 스카이다이빙 왼손목 고도계와 우측 하단 파일럿 슈트/패러글라이딩 라이저, 서핑보드 뒷발목 리쉬코드/3핀 및 요트 풍상측 하이크아웃 물리 고증을 생성하세요.",
    input,
    schema: F1WrcSkydivingSchema,
    options,
    normalize: (p) => Object.freeze({
      f1ApexKerbTireCompoundAndWrcRollcageKo: cleanSingleLineText(p.f1ApexKerbTireCompoundAndWrcRollcageKo, 220),
      skydivingLeftAltimeterRightPilotAndParagliderKo: cleanSingleLineText(p.skydivingLeftAltimeterRightPilotAndParagliderKo, 220),
      surfboardRearLeash3FinAndYachtHikeOutKo: cleanSingleLineText(p.surfboardRearLeash3FinAndYachtHikeOutKo, 220),
      extremeMotorsportAccuracyScore: clampWave57(p.extremeMotorsportAccuracyScore, 0, 100, 97),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      f1ApexKerbTireCompoundAndWrcRollcageKo: "F1 코너 에이펙스 적백 연석·피렐리 타이어 사이드월 색상(적=소프트, 황=미디엄, 백=하드) 및 WRC 랠리카 FIA 롤케이지·조수석 페이스노트·수직 핸드브레이크 고정",
      skydivingLeftAltimeterRightPilotAndParagliderKo: "스카이다이빙 왼손목 아날로그/디지털 고도계·오른손 우측 하단 BOC 파일럿 슈트 투척·양궁 리커브 스태빌라이저 및 패러글라이딩 브레이크 토글 고정",
      surfboardRearLeash3FinAndYachtHikeOutKo: "서핑보드 하단 쓰러스터 3핀(곡면이 바깥쪽)·뒷발목(Rear Ankle) 리쉬코드 스트랩 및 세일링 요트 풍상측(바람 불어오는 쪽) 하이크아웃 체중 균형 고정",
      extremeMotorsportAccuracyScore: 97,
      overallPromptKo: "F1 연석/타이어·WRC 롤케이지·스카이다이빙 고도계·서핑 뒷발 리쉬·요트 완료",
    }),
  });
}

export interface ClaudeMarshallerLighthouseAntarcticObservatoryClock {
  readonly airportMarshallerWandAndTunaLonglinerHaulerKo: string;
  readonly fresnelLighthouseLensAndAntarcticHagglundsKo: string;
  readonly observatoryDomeSlitAndClockTowerEscapementKo: string;
  readonly specialFacilityAccuracyScore: number;
  readonly overallPromptKo: string;
}
const MarshallerLighthouseSchema = z.object({ airportMarshallerWandAndTunaLonglinerHaulerKo: z.string(), fresnelLighthouseLensAndAntarcticHagglundsKo: z.string(), observatoryDomeSlitAndClockTowerEscapementKo: z.string(), specialFacilityAccuracyScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeMarshallerLighthouseAntarcticObservatoryClockDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeMarshallerLighthouseAntarcticObservatoryClock>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:marshaller-lighthouse-antarctic-observatory-clock-lock",
    systemPrompt: "당신은 특수 직업·극지/천문/해양 시설(항공기 유도 마샬러·원양어선 양승기·등대 프레넬 렌즈·남극 설상차·천문대 돔 슬릿·시계탑 이스케이프먼트) 고증 디렉터입니다.",
    userInstruction: "공항 주기장 마샬러(Marshaller) 양손 경광봉 수신호(머리 위 X자 교차=정지)와 원양어선 우현 양승기(Line Hauler), 등대 1등 동심원 프레넬 렌즈와 남극 기지 2량 굴절 무한궤도 설상차(Hägglunds)/라디오존데, 천문대 돔 슬릿 개구부와 시계탑 내부 탈진기(Escapement)/외벽 바늘 역투시 고증을 생성하세요.",
    input,
    schema: MarshallerLighthouseSchema,
    options,
    normalize: (p) => Object.freeze({
      airportMarshallerWandAndTunaLonglinerHaulerKo: cleanSingleLineText(p.airportMarshallerWandAndTunaLonglinerHaulerKo, 220),
      fresnelLighthouseLensAndAntarcticHagglundsKo: cleanSingleLineText(p.fresnelLighthouseLensAndAntarcticHagglundsKo, 220),
      observatoryDomeSlitAndClockTowerEscapementKo: cleanSingleLineText(p.observatoryDomeSlitAndClockTowerEscapementKo, 220),
      specialFacilityAccuracyScore: clampWave57(p.specialFacilityAccuracyScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      airportMarshallerWandAndTunaLonglinerHaulerKo: "항공기 유도 마샬러 주황 경광봉 수신호(머리 위 X자=정지, 목 그어 넘기기=엔진 정지)·노란 바퀴 고임목(Chocks) 및 원양어선 우현 양승기 롤러 고정",
      fresnelLighthouseLensAndAntarcticHagglundsKo: "등대 1등 프레넬 렌즈 동심원 계단식 프리즘 황동 프레임·기상 라디오존데(기구-주황낙하산-백색센서) 및 남극 기지 전후 2량 굴절 설상차 고정",
      observatoryDomeSlitAndClockTowerEscapementKo: "천문대 반구형 돔 슬릿 개방 방향과 8m 육각 세그먼트 주경 지향각 일치 및 시계탑 내부 그레이엄 탈진기(Escapement)·실내에서 본 시계판 반전 고증",
      specialFacilityAccuracyScore: 96,
      overallPromptKo: "공항 마샬러·등대 프레넬 렌즈·남극 설상차·천문대 돔·시계탑 탈진기 완료",
    }),
  });
}

export interface ClaudeGlassblowingLuthierDiamondLoupeShoemaker {
  readonly glassblowingPipeRotationAndLuthierSoundpostKo: string;
  readonly gemologist10xLoupeAtEyeAndLockingTweezersKo: string;
  readonly shoemakerWoodenLastWeltAndBookSewingFrameKo: string;
  readonly masterArtisanCraftScore: number;
  readonly overallPromptKo: string;
}
const GlassblowingLuthierSchema = z.object({ glassblowingPipeRotationAndLuthierSoundpostKo: z.string(), gemologist10xLoupeAtEyeAndLockingTweezersKo: z.string(), shoemakerWoodenLastWeltAndBookSewingFrameKo: z.string(), masterArtisanCraftScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeGlassblowingLuthierDiamondLoupeShoemakerDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeGlassblowingLuthierDiamondLoupeShoemaker>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:glassblowing-luthier-diamond-loupe-shoemaker-lock",
    systemPrompt: "당신은 공예 명장 아틀리에(유리공예 블로잉 파이프·현악기 제작 루시어 사운드포스트·보석 감정 10배율 루페 눈가 밀착·수제화 구두골 굿이어 웰트·고서 복원 제책 틀) 고증 디렉터입니다.",
    userInstruction: "유리공예 블로잉 파이프 수평 회전과 글로리홀 재가열·루시어(현악기 장인) 초소형 썸플레인과 f홀 사운드포스트 세우기, 보석 감정사 10배율 트리플렛 루페 눈가 밀착 파지법(보석을 루페 쪽으로 가져옴), 수제화 구두골(Last) 굿이어 웰트 양손 바늘 교차 및 고서 제책 틀(Sewing Frame) 고증을 생성하세요.",
    input,
    schema: GlassblowingLuthierSchema,
    options,
    normalize: (p) => Object.freeze({
      glassblowingPipeRotationAndLuthierSoundpostKo: cleanSingleLineText(p.glassblowingPipeRotationAndLuthierSoundpostKo, 220),
      gemologist10xLoupeAtEyeAndLockingTweezersKo: cleanSingleLineText(p.gemologist10xLoupeAtEyeAndLockingTweezersKo, 220),
      shoemakerWoodenLastWeltAndBookSewingFrameKo: cleanSingleLineText(p.shoemakerWoodenLastWeltAndBookSewingFrameKo, 220),
      masterArtisanCraftScore: clampWave57(p.masterArtisanCraftScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      glassblowingPipeRotationAndLuthierSoundpostKo: "유리공예 블로잉 파이프 중력 처짐 방지 연속 회전·젖은 신문지 패드 성형 및 바이올린 루시어 황동 썸플레인(손가락 대패)·f홀 내부 사운드포스트 세우기 고정",
      gemologist10xLoupeAtEyeAndLockingTweezersKo: "보석 감정 10배율 루페는 반드시 눈가(광대뼈 위 2.5cm)에 고정하고 다른 손 슬라이딩 락 핀셋에 쥔 다이아몬드를 초점 거리로 가져오는 정통 자세 고정",
      shoemakerWoodenLastWeltAndBookSewingFrameKo: "수제화 목재 구두골(Last) 뒤집어 거치·휘어진 송곳(Awl)·굿이어 웰트 양손 교차 바느질 및 고서 복원 제책 틀(Sewing Frame) 수직 삼베실 묶음 봉제 고증",
      masterArtisanCraftScore: 96,
      overallPromptKo: "유리공예 파이프·루시어 대패·보석 루페 눈가 밀착·수제화 구두골·고서 제책 완료",
    }),
  });
}

export interface Claude3dgsNerfControlnet4FacsSfx3dSaccade {
  readonly gaussianSplatting3dgsAndNerfRelightingLockKo: string;
  readonly controlnet4WayMixerAndFacsDuchenneSmileKo: string;
  readonly sfx3dMeshWarpAndSaccadeGazeTensionGraphKo: string;
  readonly neuralRenderingPipelineScore: number;
  readonly overallPromptKo: string;
}
const Neural3dgsControlnetSchema = z.object({ gaussianSplatting3dgsAndNerfRelightingLockKo: z.string(), controlnet4WayMixerAndFacsDuchenneSmileKo: z.string(), sfx3dMeshWarpAndSaccadeGazeTensionGraphKo: z.string(), neuralRenderingPipelineScore: z.number(), overallPromptKo: z.string() });
export async function runClaude3dgsNerfControlnet4FacsSfx3dSaccadeDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<Claude3dgsNerfControlnet4FacsSfx3dSaccade>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:3dgs-nerf-controlnet4-facs-sfx3d-saccade-director",
    systemPrompt: "당신은 차세대 AI 웹툰 렌더링·안면 근육(FACS)·독자 시선/스크롤 텐션(3D 가우시안 스플래팅·NeRF 조명장·4채널 ControlNet·FACS 뒤센 미소·3D SFX 워프·도약 안구운동 히트맵) 총괄 감독입니다.",
    userInstruction: "실사 스캔 3D 가우시안 스플래팅(3DGS) 배경의 웹툰 선화/셀셰이딩 변환과 NeRF 구면조화함수(SH) 다중 컷 조명 일관성, ControlNet 4채널(Lineart+Depth+OpenPose+IP-Adapter) 가중치 믹서와 FACS(AU6 눈가 주름 동반 진짜 미소 vs AU12 가짜 미소), 말풍선 배경 인페인팅/3D SFX 메쉬 워프 및 독자 시선(Saccade) 히트맵·70컷 스크롤 텐션 그래프를 설계하세요.",
    input,
    schema: Neural3dgsControlnetSchema,
    options,
    normalize: (p) => Object.freeze({
      gaussianSplatting3dgsAndNerfRelightingLockKo: cleanSingleLineText(p.gaussianSplatting3dgsAndNerfRelightingLockKo, 220),
      controlnet4WayMixerAndFacsDuchenneSmileKo: cleanSingleLineText(p.controlnet4WayMixerAndFacsDuchenneSmileKo, 220),
      sfx3dMeshWarpAndSaccadeGazeTensionGraphKo: cleanSingleLineText(p.sfx3dMeshWarpAndSaccadeGazeTensionGraphKo, 220),
      neuralRenderingPipelineScore: clampWave57(p.neuralRenderingPipelineScore, 0, 100, 98),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      gaussianSplatting3dgsAndNerfRelightingLockKo: "실시간 3D 가우시안 스플래팅(3DGS) 배경 외곽선/셀셰이딩 변환 및 NeRF 구면조화함수(SH) 조명장 공유를 통한 다중 컷 그림자 방향 100% 정합",
      controlnet4WayMixerAndFacsDuchenneSmileKo: "ControlNet 4중 믹서(Lineart 0.85·Depth 0.50·OpenPose 0.90·IP-Adapter 0.80) 및 FACS 안면 근육(AU6 안륜근 수축 진짜 미소 vs AU12 가짜 미소) 정밀 제어",
      sfx3dMeshWarpAndSaccadeGazeTensionGraphKo: "말풍선 제거 영역 배경 투시선 인페인팅 복원·타격 궤적 3D 베벨 효과음(SFX) 워핑 및 독자 도약 안구운동(Saccade) 히트맵·70컷 여백 텐션 그래프 검증",
      neuralRenderingPipelineScore: 98,
      overallPromptKo: "3DGS/NeRF 배경 조명·4채널 ControlNet·FACS 미세표정·Saccade 히트맵 완료",
    }),
  });
}

export interface ClaudeToonstudio1140HyperSynthesisLegalOst {
  readonly hyperSynthesis1140PlatformAnd188TaskRoutingKo: string;
  readonly episode70CutQuotaPsdDeltaAndOstVoiceMatchKo: string;
  readonly unfairContractLegalScannerAndBirthdayCafeSpecKo: string;
  readonly hyperSynthesisMasterScore: number;
  readonly overallPromptKo: string;
}
const HyperSynthesis1140Schema = z.object({ hyperSynthesis1140PlatformAnd188TaskRoutingKo: z.string(), episode70CutQuotaPsdDeltaAndOstVoiceMatchKo: z.string(), unfairContractLegalScannerAndBirthdayCafeSpecKo: z.string(), hyperSynthesisMasterScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeToonstudio1140HyperSynthesisLegalOstDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeToonstudio1140HyperSynthesisLegalOst>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:toonstudio-1140-hyper-synthesis-legal-ost-director",
    systemPrompt: "당신은 ToonStudio 1,140대 글로벌 웹툰 AI 플랫폼 하이퍼 신세시스 마스터 엔진·원고 차분 백업·OST/성우 매칭·계약서 독소조항 스캐너 총괄 감독입니다.",
    userInstruction: "1,140대 글로벌·국내 웹툰 AI 보조 플랫폼 UI/UX 디자인 토큰과 188대 태스크 스마트 라우팅 초융합, 에피소드 최소 70컷 세이프티 게이지·어시스턴트 필압 동기화·대용량 PSD 청크 차분 백업·웹툰 OST 앨범/성우 음색 매칭, 연재/OSMU 계약서 독소조항 AI 법률 스캐너 및 생일 카페 컵홀더/지하철 조명광고/글로벌 웹툰 어워드 출품 패키지를 설계하세요.",
    input,
    schema: HyperSynthesis1140Schema,
    options,
    normalize: (p) => Object.freeze({
      hyperSynthesis1140PlatformAnd188TaskRoutingKo: cleanSingleLineText(p.hyperSynthesis1140PlatformAnd188TaskRoutingKo, 220),
      episode70CutQuotaPsdDeltaAndOstVoiceMatchKo: cleanSingleLineText(p.episode70CutQuotaPsdDeltaAndOstVoiceMatchKo, 220),
      unfairContractLegalScannerAndBirthdayCafeSpecKo: cleanSingleLineText(p.unfairContractLegalScannerAndBirthdayCafeSpecKo, 220),
      hyperSynthesisMasterScore: clampWave57(p.hyperSynthesisMasterScore, 0, 100, 99),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      hyperSynthesis1140PlatformAnd188TaskRoutingKo: "글로벌·국내 1,140대 웹툰 AI 보조 플랫폼 UI/UX 디자인 토큰 및 188개 태스크(Haiku 48 · Sonnet 94 · Opus 46) 스마트 라우팅 하이퍼 신세시스 통합",
      episode70CutQuotaPsdDeltaAndOstVoiceMatchKo: "회당 70컷/세로 픽셀 세이프티 게이지·스튜디오 G펜 필압 곡선 SHA-256 동기화·대용량 PSD 블록 차분 백업·OST 8초 스포티파이 캔버스 및 성우 포먼트 매칭",
      unfairContractLegalScannerAndBirthdayCafeSpecKo: "문체부 표준계약서 기반 연재/OSMU 독소조항(포괄적 권리양도·불투명 MG 차감) AI 법률 스캐너 및 생일 카페 컵홀더·지하철 와이드칼라(+30% 밝기) 규격 고정",
      hyperSynthesisMasterScore: 99,
      overallPromptKo: "1,140대 하이퍼 신세시스 엔진·188개 스마트 라우팅·계약서 독소조항 스캐너 완성",
    }),
  });
}
