import { cleanSingleLineText } from "@/shared/ai/claude/claude-text";

import { executeRea15Engine } from "./claude-rea15-webtoon-ecosystem-suite";
import {
  KreaSplineLumiereRealtimeShaderSchema,
  LtxBoordsCascadeurRiveAnimaticSchema,
  TootoonGentoonTooningKrSuiteSchema,
  type KreaSplineLumiereRealtimeShaderReport,
  type LtxBoordsCascadeurRiveAnimaticReport,
  type Rea15Envelope,
  type TootoonGentoonTooningKrSuiteReport,
} from "./claude-rea15-webtoon-ecosystem-schemas";
import type {
  RunWebtoonProductionAssistOptions,
  WebtoonProductionAssistInput,
} from "./claude-webtoon-production-schemas";

/* ============================================================================
 * 6. TooToon 5-Studio(fabulator~emporium) · GenToon 뷰어/굿즈 · Tooning Plus 6부위 캐릭터 디렉터
 * ============================================================================ */

export function buildLocalTootoonGentoonTooningKrSuiteReport(
  input: WebtoonProductionAssistInput = {},
): TootoonGentoonTooningKrSuiteReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    suiteSummaryKo: `TooToon(오노마AI)의 5대 스튜디오 모듈(/fabulator·/character-studio·/visual-studio·/artifex·/emporium), GenToon의 읽기 방향·뷰어 토큰(--reading-direction:1, --paper:#f4ebfc, --ink:#40215f) 및 굿즈 수익화, Tooning Plus의 6부위 모듈형 캐릭터 빌더(/character-make-*)를 결합한 K-웹툰 전 주기 제작 사양입니다.`,
    tootoonFiveStudios: [
      {
        moduleId: "fabulator",
        routePath: "/fabulator",
        stageTitleKo: "Fabulator — 세계관·대본 집필 스튜디오",
        deliverableSummaryKo: `${genre} 에피소드 기승전결 대본 및 ${protagonist}·${partner} 대사 지문 구조화`,
      },
      {
        moduleId: "character-studio",
        routePath: "/character-studio",
        stageTitleKo: "Character Studio — 캐릭터 시트 & 시드 앵커",
        deliverableSummaryKo: `${protagonist}·${partner} 표정 6종 및 전투 복식 컬러 시드 고정`,
      },
      {
        moduleId: "visual-studio",
        routePath: "/visual-studio",
        stageTitleKo: "Visual Studio — 콘티 & 카메라 레이아웃",
        deliverableSummaryKo: "세로 스크롤 컷 분할 및 소실점·말풍선 동선 배치",
      },
      {
        moduleId: "artifex",
        routePath: "/artifex",
        stageTitleKo: "Artifex — 최종 작화·채색·후보정",
        deliverableSummaryKo: "선화 정리, 셀 셰이딩, 역광 글로우 합성 완료",
      },
      {
        moduleId: "emporium",
        routePath: "/emporium",
        stageTitleKo: "Emporium — 3D 배경·브러시·소품 에셋 마켓 연동",
        deliverableSummaryKo: "황궁 결전 3D 배경 및 고대 유물 이펙트 브러시 번들 마운트",
      },
    ],
    gentoonReaderAndCommerce: {
      readingDirection: "vertical-scroll-1",
      paperHex: "#f4ebfc",
      inkHex: "#40215f",
      violetAccentHex: "#7646bd",
      recommendedGoodsItems: [
        {
          skuId: "goods-acrylic-diorama-01",
          goodsNameKo: `${protagonist} × ${partner} 각성 결전 아크릴 디오라마 스탠드`,
          targetSupporterTierKo: "로열 서포터즈 (/supporters)",
          estimatedMarginPct: 64,
        },
        {
          skuId: "goods-lenticular-card-02",
          goodsNameKo: "고대 유물 봉인 해제 렌티큘러 포토카드 세트",
          targetSupporterTierKo: "얼리버드 독자 펀딩 (/goods/orders)",
          estimatedMarginPct: 72,
        },
      ],
    },
    tooningSixPartCharacterRecipe: [
      {
        partRoute: "/character-make-basic",
        partLabelKo: "기본 체형·비율 (8등신 웹툰 주연)",
        selectedPresetSummaryKo: `${protagonist} 슬림 근육형 8등신 베이스 체형`,
        consistencyLockScorePct: 98,
      },
      {
        partRoute: "/character-make-face",
        partLabelKo: "얼굴·눈매·표정 파츠",
        selectedPresetSummaryKo: "날카로운 청안(Cyan) 눈매 + 각성 문양 레이어",
        consistencyLockScorePct: 96,
      },
      {
        partRoute: "/character-make-body",
        partLabelKo: "의상·전투복 파츠",
        selectedPresetSummaryKo: "다크 네이비 롱코트 & 은장 견장 세트",
        consistencyLockScorePct: 95,
      },
      {
        partRoute: "/character-make-hand",
        partLabelKo: "손 동작·파지 파츠",
        selectedPresetSummaryKo: "검자루 파지 및 마력 방출 제스처 프리셋",
        consistencyLockScorePct: 94,
      },
      {
        partRoute: "/character-make-hair",
        partLabelKo: "헤어 전면·후면 레이어",
        selectedPresetSummaryKo: "바람에 흩날리는 흑발 레이어드 컷",
        consistencyLockScorePct: 97,
      },
      {
        partRoute: "/character-make-etc",
        partLabelKo: "소품·오라·귀걸이 파츠",
        selectedPresetSummaryKo: "고대 유물 파편 홀로그램 오라 파츠",
        consistencyLockScorePct: 95,
      },
    ],
  };
}

export async function runTootoonGentoonTooningKrSuiteAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<TootoonGentoonTooningKrSuiteReport>> {
  const fallbackReport = buildLocalTootoonGentoonTooningKrSuiteReport(input);
  return executeRea15Engine({
    taskId: "rea15:tootoon-gentoon-tooning-kr-suite",
    input,
    options,
    systemPromptKo:
      "당신은 국내 대표 웹툰 AI 플랫폼 TooToon(fabulator·character-studio·visual-studio·artifex·emporium), GenToon(--reading-direction, --paper, --ink, 서포터즈·굿즈 정산), Tooning Plus(6부위 캐릭터 파츠 조립 /character-make-*) 통합 프로듀서입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 작품을 위한 TooToon 5대 스튜디오 단계별 산출물, GenToon 뷰어 테마 및 서포터즈 굿즈 상품 2종, 그리고 Tooning Plus 6부위 캐릭터 파츠 레시피를 설계하세요.",
    schema: TootoonGentoonTooningKrSuiteSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 7. Krea 실시간 디렉터 · Spline 3D/Hana 스타일 전이 · Lumiere/Graphite/PixiEditor 셰이더 디렉터
 * ============================================================================ */

export function buildLocalKreaSplineLumiereRealtimeShaderReport(
  input: WebtoonProductionAssistInput = {},
): KreaSplineLumiereRealtimeShaderReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";

  return {
    realtimePipelineSummaryKo: `Krea의 실시간 디렉터(/realtime-director) 도형 블로킹, Spline 3D & Hana의 실시간 3D 스타일 트랜스퍼(/ai-style-transfer), Lumiere Graphics의 Kuwahara·Halation WebGPU 포스트프로세싱, Graphite/PixiEditor 비파괴 노드 그래프를 결합한 실시간 셰이더 파이프라인입니다.`,
    kreaRealtimeDirector: {
      activeRoute: "/realtime-director",
      i2iDenoiseStrength: 0.58,
      enhanceUpscaleFactor: 2,
      blockingPrimitiveCount: 6,
      directorCoachingKo: `${protagonist} 실루엣과 배경 기둥을 6개 3D 기본 도형으로 블로킹한 뒤 denoise 0.58로 실시간 선화·채색 합성을 구동합니다.`,
    },
    spline3dAndHanaBridge: {
      activeRoute: "/ai-style-transfer",
      styleTransferPresetKo: "Cel-Shaded Manhwa Ink & Rim Glow",
      cameraOrbitAzimuthDeg: -28,
      cameraOrbitElevationDeg: 16,
      interactiveStateTriggerKo: "마우스/스크롤 패럴랙스 시 배경 부유석 3D 레이어가 12deg 역방향 회전",
    },
    lumiereAndNodeGraphShaders: {
      kuwaharaPaintRadiusPx: 4,
      filmHalationIntensityPct: 38,
      anamorphicGlareStreakPct: 62,
      graphiteProceduralNodeCount: 7,
      pixiEditorFrameLoopCount: 12,
      compositeShaderNoteKo:
        "원경 배경에는 Kuwahara 반경 4px 회화 필터를 적용해 인물 선화와 공간감을 분리하고, 유물 발광부에는 Film Halation 38%와 아나모픽 플레어 62%를 비파괴 노드로 합성합니다.",
    },
  };
}

export async function runKreaSplineLumiereRealtimeShaderAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<KreaSplineLumiereRealtimeShaderReport>> {
  const fallbackReport = buildLocalKreaSplineLumiereRealtimeShaderReport(input);
  return executeRea15Engine({
    taskId: "rea15:krea-spline-lumiere-realtime-shader",
    input,
    options,
    systemPromptKo:
      "당신은 Krea AI(/realtime-director, /apps/enhance), Spline 3D(/3d-design, /hana, /ai-style-transfer), Lumiere Graphics(WebGPU Kuwahara·Halation·Glare), Graphite Editor(비파괴 노드), PixiEditor를 통합 제어하는 실시간 테크니컬 셰이더 디렉터입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 장면을 위한 Krea 실시간 블로킹/업스케일 파라미터, Spline 3D/Hana 스타일 트랜스퍼 카메라 궤도, 그리고 Lumiere/Graphite/PixiEditor 비파괴 WebGPU 포스트프로세싱 수치를 산출하세요.",
    schema: KreaSplineLumiereRealtimeShaderSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 8. LTX Studio · Boords 애니매틱 · Cascadeur 물리 오토포징 · Rive/Jitter 상태머신 디렉터
 * ============================================================================ */

export function buildLocalLtxBoordsCascadeurRiveAnimaticReport(
  input: WebtoonProductionAssistInput = {},
): LtxBoordsCascadeurRiveAnimaticReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";

  return {
    animaticExecutiveSummaryKo: `LTX Studio와 Boords의 프리비즈 애니매틱 카메라 시퀀서, Cascadeur의 무게중심(Center of Mass)·탄도 물리 기반 AutoPosing/AutoPhysics, Rive·Jitter의 스크롤 반응형 2D 메쉬 상태머신(State Machine)을 결합한 무빙툰·숏폼 프리비즈 사양입니다.`,
    ltxAndBoordsAnimaticShots: [
      {
        shotNumber: 1,
        cameraMove: "dolly-in",
        durationMs: 1800,
        voiceoverBeatKo: `${protagonist}: "이 봉인을 여는 순간, 우리의 시간은 되돌릴 수 없어."`,
        visualTransitionKo: "전경 유물 파편 블러 처리 후 주연 눈동자 익스트림 클로즈업으로 달리 인",
      },
      {
        shotNumber: 2,
        cameraMove: "dutch-tilt-push",
        durationMs: 2100,
        voiceoverBeatKo: `${partner}: "그래도 멈추지 않아. 끝까지 볼 거야."`,
        visualTransitionKo: "18도 더치 틸트 회전과 함께 두 인물의 대립 구도를 대각선 분할",
      },
      {
        shotNumber: 3,
        cameraMove: "tracking-orbit",
        durationMs: 2400,
        voiceoverBeatKo: "유물 코어 폭발음(SFX) 및 공중 도약 액션 비트",
        visualTransitionKo: "카메라가 180도 트래킹 오빗하며 슬로모션 충격파 프레임을 포착",
      },
    ],
    cascadeurPhysicsRig: {
      autoPosingConfidencePct: 96,
      centerOfMassHeightCm: 92,
      ballisticTrajectoryArcKo: "초속 7.8m/s 도약 후 정점 체공 0.28초 구간에서 검격 회전 모멘트 극대화",
      angularMomentumTorqueNm: 148,
      secondaryClothHairFollowThroughKo:
        "착지 직후 3프레임 지연(Follow-through)으로 롱코트 자락과 머리카락이 관성 궤적을 따라 감속",
    },
    riveAndJitterStateMachine: {
      stateMachineName: "SM_WebtoonCut_Climax_Interactive",
      scrollTriggerThresholdPct: 65,
      states: [
        {
          stateName: "Idle_Tension_Breathing",
          triggerConditionKo: "뷰포트 진입 0% ~ 64% 구간",
          meshDeformationSummaryKo: "흉곽 호흡 메쉬 미세 수축·팽창 및 안광 파티클 24fps 루프",
          loopFps: 24,
        },
        {
          stateName: "Relic_Awaken_Burst",
          triggerConditionKo: "스크롤 진행률 65% 돌파 시 즉시 전이",
          meshDeformationSummaryKo: "헤어·망토 메쉬 외곽 팽창 + 충격파 링 60fps 버스트 재생",
          loopFps: 60,
        },
      ],
    },
  };
}

export async function runLtxBoordsCascadeurRiveAnimaticAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<LtxBoordsCascadeurRiveAnimaticReport>> {
  const fallbackReport = buildLocalLtxBoordsCascadeurRiveAnimaticReport(input);
  return executeRea15Engine({
    taskId: "rea15:ltx-boords-cascadeur-rive-animatic",
    input,
    options,
    systemPromptKo:
      "당신은 LTX Studio·Boords(프리비즈 애니매틱 시퀀서), Cascadeur(AI AutoPosing & AutoPhysics 무게중심·탄도 물리), Rive·Jitter(인터랙티브 상태머신 무빙툰)를 통합 설계하는 시네마틱 액션·모션 디렉터입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 대본의 3개 핵심 샷 애니매틱 카메라 무빙·보이스오버 비트, Cascadeur 물리 기반 무게중심/탄도/관성 팔로우스루 수치, 그리고 Rive/Jitter 스크롤 반응형 상태머신(State Machine) 2개 상태를 설계하세요.",
    schema: LtxBoordsCascadeurRiveAnimaticSchema,
    fallbackReport,
  });
}
