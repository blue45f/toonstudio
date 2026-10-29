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
  const activeRoute = options.route !== undefined ? options.route : resolveClaudeRoute();
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

// ── Wave 60~62: Modern History Hardware, Traditional Fermentation/Folk Games & 1,200-Platform Grand Millennium Directors (8 Tasks) ──

export interface ClaudeEnigmaMorseDarkroomLetterpressPhonograph {
  readonly trenchPeriscopeAndEnigma3RotorPlugboardKo: string;
  readonly morseStraightKeyAndDarkroom3TraySafelightKo: string;
  readonly letterpressMirrorTypeVacuumTubeAndPhonographCrankKo: string;
  readonly vintageHardwareAccuracyScore: number;
  readonly overallPromptKo: string;
}
const EnigmaMorseDarkroomSchema = z.object({ trenchPeriscopeAndEnigma3RotorPlugboardKo: z.string(), morseStraightKeyAndDarkroom3TraySafelightKo: z.string(), letterpressMirrorTypeVacuumTubeAndPhonographCrankKo: z.string(), vintageHardwareAccuracyScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeEnigmaMorseDarkroomLetterpressPhonographDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeEnigmaMorseDarkroomLetterpressPhonograph>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:enigma-morse-darkroom-letterpress-phonograph-lock",
    systemPrompt: "당신은 근현대사·시대극 웹툰의 참호 잠망경·에니그마 암호기·모스 전건·필름 암실·활판 인쇄·진공관·축음기 기구학 고증 감독입니다.",
    userInstruction: "1차대전 참호 잠망경 45도 상하 거울과 에니그마 3로터/전면 플러그보드/상단 램프보드(자기 치환 불가) 구조, 모스 전건 2지 파지와 흑백 필름 암실 적색 안전등·3트레이(현상→정지→정착) 집게 분리, 활판 인쇄 납활자 좌우 반전(Mirror-reversed) 조판·진공관 주황색 히터 필라멘트·축음기 우측 태엽 크랭크를 고정하세요.",
    input,
    schema: EnigmaMorseDarkroomSchema,
    options,
    normalize: (p) => Object.freeze({
      trenchPeriscopeAndEnigma3RotorPlugboardKo: cleanSingleLineText(p.trenchPeriscopeAndEnigma3RotorPlugboardKo, 220),
      morseStraightKeyAndDarkroom3TraySafelightKo: cleanSingleLineText(p.morseStraightKeyAndDarkroom3TraySafelightKo, 220),
      letterpressMirrorTypeVacuumTubeAndPhonographCrankKo: cleanSingleLineText(p.letterpressMirrorTypeVacuumTubeAndPhonographCrankKo, 220),
      vintageHardwareAccuracyScore: clampWave57(p.vintageHardwareAccuracyScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      trenchPeriscopeAndEnigma3RotorPlugboardKo: "참호 잠망경 45° 상하 반사경 시야각 및 에니그마 상단 3~4로터·중단 램프보드·하단 키보드·전면 플러그보드(자기자신 치환 불가) 고증",
      morseStraightKeyAndDarkroom3TraySafelightKo: "모스 전건(Straight Key) 엄지·검지·중지 손목 스냅 타전 및 암실 620nm 적색 안전등·현상→정지→정착 3트레이 전용 집게 분리 고정",
      letterpressMirrorTypeVacuumTubeAndPhonographCrankKo: "활판 인쇄 납활자 좌우 거울상(Mirror-reversed) 조판·진공관 하단 주황색 필라멘트/녹색 매직아이·축음기 본체 우측 태엽 크랭크 고정",
      vintageHardwareAccuracyScore: 96,
      overallPromptKo: "참호 잠망경·에니그마·모스 전건·암실 3트레이·좌우반전 납활자·축음기 완료",
    }),
  });
}

export interface ClaudeOceanLiner4FunnelStreetcarBiplaneSemaphore {
  readonly airshipMooringMastAndOceanLiner4thDummyFunnelKo: string;
  readonly vintageStreetcarTrolleyPoleAndBiplaneStrutWireKo: string;
  readonly railwaySemaphore45DegAndPigeonLegCapsuleKo: string;
  readonly earlyAviationTransportScore: number;
  readonly overallPromptKo: string;
}
const OceanLinerBiplaneSchema = z.object({ airshipMooringMastAndOceanLiner4thDummyFunnelKo: z.string(), vintageStreetcarTrolleyPoleAndBiplaneStrutWireKo: z.string(), railwaySemaphore45DegAndPigeonLegCapsuleKo: z.string(), earlyAviationTransportScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeOceanLiner4FunnelStreetcarBiplaneSemaphoreDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeOceanLiner4FunnelStreetcarBiplaneSemaphore>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:ocean-liner-4funnel-streetcar-biplane-semaphore-lock",
    systemPrompt: "당신은 근대 교통·항공·철도·통신 웹툰의 비행선 계류탑·4굴뚝 호화여객선·노면전차·복엽기·철도 완목신호기·전서구 고증 감독입니다.",
    userInstruction: "경식 비행선 기수 콘(Nose Cone) 계류탑 도킹과 20세기 초 4굴뚝 여객선의 1~3번 보일러 매연 및 4번 더미 환기 굴뚝 무연 원칙, 노면전차 후방 경사 트롤리 폴과 복엽기 상하 주익 지주(Strut)/X자 장선(Flying Wire)·동조 기관총, 철도 완목신호기 각도(수평 정지/45도 진행)와 전서구 발목 알루미늄 통신통을 고정하세요.",
    input,
    schema: OceanLinerBiplaneSchema,
    options,
    normalize: (p) => Object.freeze({
      airshipMooringMastAndOceanLiner4thDummyFunnelKo: cleanSingleLineText(p.airshipMooringMastAndOceanLiner4thDummyFunnelKo, 220),
      vintageStreetcarTrolleyPoleAndBiplaneStrutWireKo: cleanSingleLineText(p.vintageStreetcarTrolleyPoleAndBiplaneStrutWireKo, 220),
      railwaySemaphore45DegAndPigeonLegCapsuleKo: cleanSingleLineText(p.railwaySemaphore45DegAndPigeonLegCapsuleKo, 220),
      earlyAviationTransportScore: clampWave57(p.earlyAviationTransportScore, 0, 100, 95),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      airshipMooringMastAndOceanLiner4thDummyFunnelKo: "경식 비행선 기수 콘 계류탑 풍향 360° 회전 도킹 및 4굴뚝 호화여객선 1~3번 보일러 매연·4번 더미 환기 굴뚝 무연(No-Smoke) 고증",
      vintageStreetcarTrolleyPoleAndBiplaneStrutWireKo: "근대 노면전차 후방 경사 트롤리 폴 가선 접촉 및 복엽기 상하 주익 수직 지주(Strut)·X자 강선(Flying/Landing Wire)·프로펠러 동조 사격 고정",
      railwaySemaphore45DegAndPigeonLegCapsuleKo: "철도 완목신호기 수평(적색 정지)·45°(녹색 진행) 블레이드 각도 및 군용 전서구 발목 초경량 알루미늄 캡슐(부리 물기 금지) 고정",
      earlyAviationTransportScore: 95,
      overallPromptKo: "비행선 계류탑·4굴뚝 여객선 4번 무연·전차 트롤리폴·복엽기 지주·완목신호기 완료",
    }),
  });
}

export interface ClaudeDavyLampRickshawDivingDressSwitchboardSundial {
  readonly coalMineDavyLampCanaryAndRickshawShaftsKo: string;
  readonly gasStreetlightMantleAndVintageBoxingTurnbuckleKo: string;
  readonly divingDress12BoltSwitchboardPatchAndSundialGnomonKo: string;
  readonly industrialAgePropScore: number;
  readonly overallPromptKo: string;
}
const DavyLampSwitchboardSchema = z.object({ coalMineDavyLampCanaryAndRickshawShaftsKo: z.string(), gasStreetlightMantleAndVintageBoxingTurnbuckleKo: z.string(), divingDress12BoltSwitchboardPatchAndSundialGnomonKo: z.string(), industrialAgePropScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeDavyLampRickshawDivingDressSwitchboardSundialDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeDavyLampRickshawDivingDressSwitchboardSundial>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:davy-lamp-rickshaw-diving-dress-switchboard-sundial-lock",
    systemPrompt: "당신은 근대 산업·시대극 웹툰의 탄광 데이비 안전등·인력거·가스 가로등·클래식 복싱 링·12볼트 잠수복·수동 전화교환대·해시계 고증 감독입니다.",
    userInstruction: "탄광 데이비 철망 안전등(메탄 푸른 불꽃)과 카나리아 새장·개화기 인력거 평행 채(Shafts)와 대구경 바퀴, 가스 가로등 점등 장대와 클래식 복싱 링 3~4줄 로프 턴버클·아이언 스웰(Enswell), 12볼트 황동 잠수 헬멧 4창/2인 핸드펌프·수동 전화교환대 1/4인치 패치코드·해시계 영침(Gnomon) 위도 각도를 설계하세요.",
    input,
    schema: DavyLampSwitchboardSchema,
    options,
    normalize: (p) => Object.freeze({
      coalMineDavyLampCanaryAndRickshawShaftsKo: cleanSingleLineText(p.coalMineDavyLampCanaryAndRickshawShaftsKo, 220),
      gasStreetlightMantleAndVintageBoxingTurnbuckleKo: cleanSingleLineText(p.gasStreetlightMantleAndVintageBoxingTurnbuckleKo, 220),
      divingDress12BoltSwitchboardPatchAndSundialGnomonKo: cleanSingleLineText(p.divingDress12BoltSwitchboardPatchAndSundialGnomonKo, 220),
      industrialAgePropScore: clampWave57(p.industrialAgePropScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      coalMineDavyLampCanaryAndRickshawShaftsKo: "탄광 데이비 철망 안전등 메탄 감지 푸른 불꽃·카나리아 새장 및 개화기 인력거 전면 평행 손잡이 채(Shafts)·대구경 살바퀴·접이식 차양 고정",
      gasStreetlightMantleAndVintageBoxingTurnbuckleKo: "가스 가로등 백열 맨틀 점등 장대·황혼 노출계 및 클래식 복싱 링 코너 턴버클·가죽 글러브 손목 끈·세컨드 금속 아이언 스웰(Enswell) 고증",
      divingDress12BoltSwitchboardPatchAndSundialGnomonKo: "12볼트 황동 잠수모 4관측창·17kg 납 구두·2인 트윈 실린더 공기펌프 및 수동 전화교환대 1/4인치 잭 패치·해시계 영침 위도(37.5°) 정렬",
      industrialAgePropScore: 96,
      overallPromptKo: "탄광 안전등·인력거·복싱 턴버클·12볼트 잠수복·수동 교환대·해시계 완료",
    }),
  });
}

export interface ClaudeJangdokdaeKimjangHanjiOnggiNajeonchilgi {
  readonly jangdokdaeMejuStrawRopeAndKimjangBuriedOnggiKo: string;
  readonly hanjiOebalTteugiBellowsAndOnggiPaddleAnvilKo: string;
  readonly najeonchilgiMotherOfPearlAndHapjukseonFanKo: string;
  readonly koreanTraditionalCraftScore: number;
  readonly overallPromptKo: string;
}
const JangdokdaeHanjiOnggiSchema = z.object({ jangdokdaeMejuStrawRopeAndKimjangBuriedOnggiKo: z.string(), hanjiOebalTteugiBellowsAndOnggiPaddleAnvilKo: z.string(), najeonchilgiMotherOfPearlAndHapjukseonFanKo: z.string(), koreanTraditionalCraftScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeJangdokdaeKimjangHanjiOnggiNajeonchilgiDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeJangdokdaeKimjangHanjiOnggiNajeonchilgi>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:jangdokdae-kimjang-hanji-onggi-najeonchilgi-lock",
    systemPrompt: "당신은 한국 전통 발효·공예 웹툰의 장독대(금줄·숯·고추)·김장독·한지 외발뜨기·대장간 풀무·옹기 수레/도개비·나전칠기·합죽선 고증 감독입니다.",
    userInstruction: "한국 장독대 옹기 배흘림 곡선·왼새끼 금줄(숯·붉은 고추·한지)과 겨울 땅속 김장독 반매립(목 부분 노출)·짚 주저리, 전통 한지 외발뜨기 전후 좌우 흘림 물질·대장간 상자형 풀무(풍구) 왕복 피스톤·옹기 타래 쌓기(외벽 수레+내벽 도개비), 나전칠기 자개 무지개 간섭광과 전주 합죽선 살대/선추를 설계하세요.",
    input,
    schema: JangdokdaeHanjiOnggiSchema,
    options,
    normalize: (p) => Object.freeze({
      jangdokdaeMejuStrawRopeAndKimjangBuriedOnggiKo: cleanSingleLineText(p.jangdokdaeMejuStrawRopeAndKimjangBuriedOnggiKo, 220),
      hanjiOebalTteugiBellowsAndOnggiPaddleAnvilKo: cleanSingleLineText(p.hanjiOebalTteugiBellowsAndOnggiPaddleAnvilKo, 220),
      najeonchilgiMotherOfPearlAndHapjukseonFanKo: cleanSingleLineText(p.najeonchilgiMotherOfPearlAndHapjukseonFanKo, 220),
      koreanTraditionalCraftScore: clampWave57(p.koreanTraditionalCraftScore, 0, 100, 97),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      jangdokdaeMejuStrawRopeAndKimjangBuriedOnggiKo: "장독대 옹기 배흘림·왼새끼 금줄(숯·건고추·한지) 결속·메주 짚 끈 매달기 및 겨울 김장독 어깨선 땅속 반매립·원추형 짚 주저리 덮개 고정",
      hanjiOebalTteugiBellowsAndOnggiPaddleAnvilKo: "한지 외발뜨기 외줄 걸이 앞뒤·좌우 교차 물질(섬유 무방향 교직)·대장간 상자형 목제 풀무 피스톤·옹기 외벽 수레(방망이)+내벽 도개비(맞벽돌) 성형",
      najeonchilgiMotherOfPearlAndHapjukseonFanKo: "나전칠기 흑색 정제 옻칠 위 전복 자개 줄음질/끊음질 각도별 청록·자주 이리데선스 및 전주 합죽선 대나무 마디 살대·고리 선추(Fan Pendant) 고정",
      koreanTraditionalCraftScore: 97,
      overallPromptKo: "장독대 금줄·김장독 반매립·한지 외발뜨기·옹기 수레/도개비·나전칠기·합죽선 완료",
    }),
  });
}

export interface ClaudeWineBarriqueCheeseJamonChocolatePotStill {
  readonly oakWineBarrique225LAndParmigianoSoundingHammerKo: string;
  readonly jamoneroBlackHoofClampAndChocolateMarbleTemperingKo: string;
  readonly copperMashTunHydrometerAndWhiskyPotStillSwanNeckKo: string;
  readonly gastronomyFermentationCraftScore: number;
  readonly overallPromptKo: string;
}
const WineCheesePotStillSchema = z.object({ oakWineBarrique225LAndParmigianoSoundingHammerKo: z.string(), jamoneroBlackHoofClampAndChocolateMarbleTemperingKo: z.string(), copperMashTunHydrometerAndWhiskyPotStillSwanNeckKo: z.string(), gastronomyFermentationCraftScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeWineBarriqueCheeseJamonChocolatePotStillDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeWineBarriqueCheeseJamonChocolatePotStill>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:wine-barrique-cheese-jamon-chocolate-pot-still-lock",
    systemPrompt: "당신은 미식·양조·로판 웹툰의 오크 와인 배럴·치즈 숙성고·이베리코 하몽 카빙·쇼콜라티에 템퍼링·맥주 당화조·위스키 단식 증류기 고증 감독입니다.",
    userInstruction: "225L 오크 와인 배럴(바리크) 6~8줄 철제 후프·상단 마개구멍(Bunghole)/글라스 시음 피펫과 파르미지아노 치즈 휠 타음 해머·아몬드형 치즈 나이프, 이베리코 하몽 흑색 발굽(Pata Negra) 거치대(하모네로)·유연한 장검형 칼(Cuchillo Jamonero)과 초콜릿 대리석 판 템퍼링, 맥주 당화조 비중계와 위스키 구리 포트 스틸 백조목(Swan Neck)·스피릿 세이프를 설계하세요.",
    input,
    schema: WineCheesePotStillSchema,
    options,
    normalize: (p) => Object.freeze({
      oakWineBarrique225LAndParmigianoSoundingHammerKo: cleanSingleLineText(p.oakWineBarrique225LAndParmigianoSoundingHammerKo, 220),
      jamoneroBlackHoofClampAndChocolateMarbleTemperingKo: cleanSingleLineText(p.jamoneroBlackHoofClampAndChocolateMarbleTemperingKo, 220),
      copperMashTunHydrometerAndWhiskyPotStillSwanNeckKo: cleanSingleLineText(p.copperMashTunHydrometerAndWhiskyPotStillSwanNeckKo, 220),
      gastronomyFermentationCraftScore: clampWave57(p.gastronomyFermentationCraftScore, 0, 100, 96),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      oakWineBarrique225LAndParmigianoSoundingHammerKo: "225L 보르도 오크 배럴 6~8줄 철제 후프·상단 마개(Bunghole)·유리 시음관(Wine Thief) 및 파르미지아노 치즈 타음 해머·물방울형 치즈 나이프 고정",
      jamoneroBlackHoofClampAndChocolateMarbleTemperingKo: "이베리코 하몽 검은 발굽(Pata Negra) 하모네로 클램프 거치·좁고 긴 쿠치요 하모네로 수평 슬라이싱 및 쇼콜라티에 대리석 템퍼링(31~32°C) 고증",
      copperMashTunHydrometerAndWhiskyPotStillSwanNeckKo: "크래프트 브루어리 구리 당화조·비중계(Hydrometer) 눈금 및 싱글몰트 구리 단식 증류기(Pot Still) 백조목(Swan Neck) 경사각·황동 스피릿 세이프 고정",
      gastronomyFermentationCraftScore: 96,
      overallPromptKo: "오크 와인배럴·치즈 해머·이베리코 하모네로·초콜릿 템퍼링·위스키 증류기 완료",
    }),
  });
}

export interface ClaudeBangpaeyeonSsireumSatbaTaekkyeonMaedeup {
  readonly bangpaeyeonCenterHoleReelAndPaengiSsolmaeKo: string;
  readonly danoSwingStandingWaitAndSsireumSatbaRightLoopKo: string;
  readonly taekkyeonPumbalkiTriangleAndTraditionalMaedeupKo: string;
  readonly koreanFolkSportCraftScore: number;
  readonly overallPromptKo: string;
}
const BangpaeyeonSsireumSchema = z.object({ bangpaeyeonCenterHoleReelAndPaengiSsolmaeKo: z.string(), danoSwingStandingWaitAndSsireumSatbaRightLoopKo: z.string(), taekkyeonPumbalkiTriangleAndTraditionalMaedeupKo: z.string(), koreanFolkSportCraftScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeBangpaeyeonSsireumSatbaTaekkyeonMaedeupDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeBangpaeyeonSsireumSatbaTaekkyeonMaedeup>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:bangpaeyeon-ssireum-satba-taekkyeon-maedeup-lock",
    systemPrompt: "당신은 한국 전통 민속놀이·무예·장신구 웹툰의 방패연·팽이·썰매·단오 그네·씨름 샅바·택견 품밟기·전통 매듭 고증 감독입니다.",
    userInstruction: "방패연 중앙 방구멍(풍속 조절 홀)·5대나무 살(머릿살/허릿살/장살/중살)·8각 얼레와 얼음 팽이/양손 송곳 썰매, 단오 그네 두 줄 동아줄 입승(선 자세) 구르기·치마폭 역포물선과 전통 씨름 샅바(허리+오른쪽 허벅지 루프, 오른어깨 맞대기), 택견 역삼각형 품밟기(이크에크)·능청거리기 및 한국 전통 매듭(국화·매화·잠자리 좌우대칭)을 설계하세요.",
    input,
    schema: BangpaeyeonSsireumSchema,
    options,
    normalize: (p) => Object.freeze({
      bangpaeyeonCenterHoleReelAndPaengiSsolmaeKo: cleanSingleLineText(p.bangpaeyeonCenterHoleReelAndPaengiSsolmaeKo, 220),
      danoSwingStandingWaitAndSsireumSatbaRightLoopKo: cleanSingleLineText(p.danoSwingStandingWaitAndSsireumSatbaRightLoopKo, 220),
      taekkyeonPumbalkiTriangleAndTraditionalMaedeupKo: cleanSingleLineText(p.taekkyeonPumbalkiTriangleAndTraditionalMaedeupKo, 220),
      koreanFolkSportCraftScore: clampWave57(p.koreanFolkSportCraftScore, 0, 100, 97),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      bangpaeyeonCenterHoleReelAndPaengiSsolmaeKo: "방패연 중앙 원형 방구멍·5대나무 살·4가닥 목줄·8각 얼레 및 겨울 팽이 강철 축 촉·전통 얼음 썰매 양손 송곳(얼음지치기) 추진 자세 고정",
      danoSwingStandingWaitAndSsireumSatbaRightLoopKo: "단오 그네 두 줄 동아줄 입승(서서 타기) 무릎 굽힘-폄 펌핑 및 전통 씨름 샅바(허리+오른쪽 다리 루프) 착용·오른어깨 맞대기 파지 고정",
      taekkyeonPumbalkiTriangleAndTraditionalMaedeupKo: "택견 역삼각형(品) 품밟기 3점 스텝·유연한 손바닥 활개짓 및 한국 전통 매듭(동심결·국화·잠자리) 외줄 양끝 좌우 100% 대칭 구조 고정",
      koreanFolkSportCraftScore: 97,
      overallPromptKo: "방패연 방구멍/얼레·단오 그네·씨름 오른다리 샅바·택견 품밟기·전통 매듭 완료",
    }),
  });
}

export interface ClaudeCrossover1000EpParadoxWrinkleBakerSfxRedraw {
  readonly multiStudioCrossoverBridgeAnd1000EpParadoxSolverKo: string;
  readonly skeletonDraperyWrinkleBakerAndDaltonizationShaderKo: string;
  readonly sfxStrokeInpaintRedrawAndShortformWhipPanKeyframerKo: string;
  readonly advancedPipelineIntelligenceScore: number;
  readonly overallPromptKo: string;
}
const CrossoverParadoxWrinkleSchema = z.object({ multiStudioCrossoverBridgeAnd1000EpParadoxSolverKo: z.string(), skeletonDraperyWrinkleBakerAndDaltonizationShaderKo: z.string(), sfxStrokeInpaintRedrawAndShortformWhipPanKeyframerKo: z.string(), advancedPipelineIntelligenceScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeCrossover1000EpParadoxWrinkleBakerSfxRedrawDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeCrossover1000EpParadoxWrinkleBakerSfxRedraw>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:crossover-1000ep-paradox-wrinkle-baker-sfx-redraw-director",
    systemPrompt: "당신은 멀티 스튜디오 세계관 크로스오버·1,000화 연대기 패러독스 검증·3D 관절 주름 베이커·색각 이상 보정·글로벌 SFX 배경 복원·숏폼 휩팬 총괄 감독입니다.",
    userInstruction: "다작품 크로스오버 등신비/선화/전투력 밸런스 정규화와 1,000화 장편 연재 타임라인 패러독스(나이·계절·사망 시점 충돌) 자동 검출, 3D 리깅 관절 회전각 기반 의상 주름 노멀맵 베이킹과 적록 색맹(Deuteranopia) 달토니제이션 보정, 손글씨 효과음(SFX) 분리 후 가려진 배경 자동 인페인팅 복원 및 숏폼 휩팬(Whip-Pan)/크래시 줌 키프레이머를 설계하세요.",
    input,
    schema: CrossoverParadoxWrinkleSchema,
    options,
    normalize: (p) => Object.freeze({
      multiStudioCrossoverBridgeAnd1000EpParadoxSolverKo: cleanSingleLineText(p.multiStudioCrossoverBridgeAnd1000EpParadoxSolverKo, 220),
      skeletonDraperyWrinkleBakerAndDaltonizationShaderKo: cleanSingleLineText(p.skeletonDraperyWrinkleBakerAndDaltonizationShaderKo, 220),
      sfxStrokeInpaintRedrawAndShortformWhipPanKeyframerKo: cleanSingleLineText(p.sfxStrokeInpaintRedrawAndShortformWhipPanKeyframerKo, 220),
      advancedPipelineIntelligenceScore: clampWave57(p.advancedPipelineIntelligenceScore, 0, 100, 98),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      multiStudioCrossoverBridgeAnd1000EpParadoxSolverKo: "이종 웹툰 IP 크로스오버 등신비/선화 두께/파워 밸런스 정규화 및 1,000화 장편 회귀·타임슬립 연대기 DAG 패러독스(연령·생사 충돌) 무결성 검증",
      skeletonDraperyWrinkleBakerAndDaltonizationShaderKo: "3D 스켈레톤 관절 굴곡각 연동 의상 주름(지그재그·나선) 벡터 베이킹 및 모바일 뷰어 거리 적응형 식자·적록 색각이상 달토니제이션 명도 대비 보장",
      sfxStrokeInpaintRedrawAndShortformWhipPanKeyframerKo: "글로벌 로컬라이징용 원작 손글씨 SFX 알파 분리·하부 배경 투시선 인페인팅 복원 및 9:16 숏폼 휩팬(Whip-Pan)·크래시 줌 모션블러 키프레임 자동화",
      advancedPipelineIntelligenceScore: 98,
      overallPromptKo: "멀티IP 크로스오버·1000화 패러독스 검증·3D 주름 베이커·SFX 배경 복원 완료",
    }),
  });
}

export interface ClaudeToonstudio1200GrandMillenniumSimulpubChroma {
  readonly grandMillennium1200PlatformAnd196TaskRoutingKo: string;
  readonly themePark6DofHologramConcertAndTankobonSprayedEdgeKo: string;
  readonly simulpub6PlatformRoyaltySplitAndChroma444LosslessKo: string;
  readonly grandMillenniumMasterScore: number;
  readonly overallPromptKo: string;
}
const GrandMillennium1200Schema = z.object({ grandMillennium1200PlatformAnd196TaskRoutingKo: z.string(), themePark6DofHologramConcertAndTankobonSprayedEdgeKo: z.string(), simulpub6PlatformRoyaltySplitAndChroma444LosslessKo: z.string(), grandMillenniumMasterScore: z.number(), overallPromptKo: z.string() });
export async function runClaudeToonstudio1200GrandMillenniumSimulpubChromaDirector(
  input: Wave30LocalizeAssistInput,
  options: RunWave30LocalizeAssistOptions = {},
): Promise<Wave30LocalizeAssistResult<ClaudeToonstudio1200GrandMillenniumSimulpubChroma>> {
  return executeWave57AltTextDirector({
    taskId: "alt-text:toonstudio-1200-grand-millennium-simulpub-chroma-director",
    systemPrompt: "당신은 ToonStudio 1,200대 글로벌 웹툰 AI 플랫폼 그랜드 밀레니엄 마스터 엔진·테마파크/홀로그램 OSMU·6대 플랫폼 동시연재·Chroma 4:4:4 무손실 출고 총괄 감독입니다.",
    userInstruction: "1,200대 글로벌·국내 웹툰 AI 보조 플랫폼 UI/UX 디자인 토큰과 196대 태스크 스마트 라우팅(Haiku 50 · Sonnet 98 · Opus 48) 그랜드 밀레니엄 통합, 테마파크 6축 다크라이드·45도 페퍼스 고스트 홀로그램 콘서트·단행본 3면 분사 인쇄(Sprayed Edge)·4면 프로젝션 매핑, 한미일중태인니 6개국 동시연재 대시보드·지분 정산 원장·선화 컬러 번짐 없는 YUV 4:4:4 무손실 슬라이서를 설계하세요.",
    input,
    schema: GrandMillennium1200Schema,
    options,
    normalize: (p) => Object.freeze({
      grandMillennium1200PlatformAnd196TaskRoutingKo: cleanSingleLineText(p.grandMillennium1200PlatformAnd196TaskRoutingKo, 220),
      themePark6DofHologramConcertAndTankobonSprayedEdgeKo: cleanSingleLineText(p.themePark6DofHologramConcertAndTankobonSprayedEdgeKo, 220),
      simulpub6PlatformRoyaltySplitAndChroma444LosslessKo: cleanSingleLineText(p.simulpub6PlatformRoyaltySplitAndChroma444LosslessKo, 220),
      grandMillenniumMasterScore: clampWave57(p.grandMillenniumMasterScore, 0, 100, 99),
      overallPromptKo: cleanSingleLineText(p.overallPromptKo, 240),
    }),
    fallback: () => Object.freeze({
      grandMillennium1200PlatformAnd196TaskRoutingKo: "글로벌·국내 1,200대 웹툰 AI 보조 플랫폼 UI/UX 디자인 토큰 및 196개 태스크(Haiku 50 · Sonnet 98 · Opus 48) 그랜드 밀레니엄 아키텍처 완성",
      themePark6DofHologramConcertAndTankobonSprayedEdgeKo: "테마파크 6-DOF 다크라이드 동선·45° 페퍼스 고스트 홀로그램 콘서트·초판 홀로그램 넘버링/3면 분사 인쇄(Sprayed Edge)·4면 프로젝션 매핑",
      simulpub6PlatformRoyaltySplitAndChroma444LosslessKo: "한·미·일·중·태·인니 6개국 동시연재 KPI·작가 멘탈케어 악플 필터·스마트 컨트랙트 지분 정산·붉은 선화 번짐 0% YUV 4:4:4 무손실 슬라이서 고정",
      grandMillenniumMasterScore: 99,
      overallPromptKo: "1,200대 그랜드 밀레니엄 엔진·196개 스마트 라우팅·Chroma 4:4:4 무손실 완성",
    }),
  });
}
