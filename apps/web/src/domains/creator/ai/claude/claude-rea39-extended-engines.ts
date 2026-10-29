import { cleanSingleLineText } from "@/shared/ai/claude/claude-text";

import { executeRea15Engine } from "./claude-rea15-webtoon-ecosystem-suite";
import {
  CotransVroidSkyboxWorldLocalizerSchema,
  KreaSplineLumiereRealtimeShaderSchema,
  LtxBoordsCascadeurRiveAnimaticSchema,
  MixamoMarvelousCoolorsNoonnuBlambotToonboomEagleSchema,
  NijiPixaiCivitaiLoraSrefDirectorSchema,
  RunwayLumaPikaViggleLive2dSpineMotionSchema,
  SketchupBlenderPetalicaMagmaRecraftStudioSchema,
  StoryboarderDreamsKritaArtbreederDirectorSchema,
  TapasTappytoonRidiPostypeSudowriteNovelcrafterSchema,
  TootoonGentoonTooningKrSuiteSchema,
  TripoMeshyHeroforgeSunoElevenlabsOsmuSchema,
  type CotransVroidSkyboxWorldLocalizerReport,
  type KreaSplineLumiereRealtimeShaderReport,
  type LtxBoordsCascadeurRiveAnimaticReport,
  type MixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport,
  type NijiPixaiCivitaiLoraSrefDirectorReport,
  type Rea15Envelope,
  type RunwayLumaPikaViggleLive2dSpineMotionReport,
  type SketchupBlenderPetalicaMagmaRecraftStudioReport,
  type StoryboarderDreamsKritaArtbreederDirectorReport,
  type TapasTappytoonRidiPostypeSudowriteNovelcrafterReport,
  type TootoonGentoonTooningKrSuiteReport,
  type TripoMeshyHeroforgeSunoElevenlabsOsmuReport,
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
      { moduleId: "fabulator", routePath: "/fabulator", stageTitleKo: "Fabulator — 세계관·대본 집필 스튜디오", deliverableSummaryKo: `${genre} 에피소드 기승전결 대본 및 ${protagonist}·${partner} 대사 지문 구조화` },
      { moduleId: "character-studio", routePath: "/character-studio", stageTitleKo: "Character Studio — 캐릭터 시트 & 시드 앵커", deliverableSummaryKo: `${protagonist}·${partner} 표정 6종 및 전투 복식 컬러 시드 고정` },
      { moduleId: "visual-studio", routePath: "/visual-studio", stageTitleKo: "Visual Studio — 콘티 & 카메라 레이아웃", deliverableSummaryKo: "세로 스크롤 컷 분할 및 소실점·말풍선 동선 배치" },
      { moduleId: "artifex", routePath: "/artifex", stageTitleKo: "Artifex — 최종 작화·채색·후보정", deliverableSummaryKo: "선화 정리, 셀 셰이딩, 역광 글로우 합성 완료" },
      { moduleId: "emporium", routePath: "/emporium", stageTitleKo: "Emporium — 3D 배경·브러시·소품 에셋 마켓 연동", deliverableSummaryKo: "황궁 결전 3D 배경 및 고대 유물 이펙트 브러시 번들 마운트" },
    ],
    gentoonReaderAndCommerce: {
      readingDirection: "vertical-scroll-1",
      paperHex: "#f4ebfc",
      inkHex: "#40215f",
      violetAccentHex: "#7646bd",
      recommendedGoodsItems: [
        { skuId: "goods-acrylic-diorama-01", goodsNameKo: `${protagonist} × ${partner} 각성 결전 아크릴 디오라마 스탠드`, targetSupporterTierKo: "로열 서포터즈 (/supporters)", estimatedMarginPct: 64 },
        { skuId: "goods-lenticular-card-02", goodsNameKo: "고대 유물 봉인 해제 렌티큘러 포토카드 세트", targetSupporterTierKo: "얼리버드 독자 펀딩 (/goods/orders)", estimatedMarginPct: 72 },
      ],
    },
    tooningSixPartCharacterRecipe: [
      { partRoute: "/character-make-basic", partLabelKo: "기본 체형·비율 (8등신 웹툰 주연)", selectedPresetSummaryKo: `${protagonist} 슬림 근육형 8등신 베이스 체형`, consistencyLockScorePct: 98 },
      { partRoute: "/character-make-face", partLabelKo: "얼굴·눈매·표정 파츠", selectedPresetSummaryKo: "날카로운 청안(Cyan) 눈매 + 각성 문양 레이어", consistencyLockScorePct: 96 },
      { partRoute: "/character-make-body", partLabelKo: "의상·전투복 파츠", selectedPresetSummaryKo: "다크 네이비 롱코트 & 은장 견장 세트", consistencyLockScorePct: 95 },
      { partRoute: "/character-make-hand", partLabelKo: "손 동작·파지 파츠", selectedPresetSummaryKo: "검자루 파지 및 마력 방출 제스처 프리셋", consistencyLockScorePct: 94 },
      { partRoute: "/character-make-hair", partLabelKo: "헤어 전면·후면 레이어", selectedPresetSummaryKo: "바람에 흩날리는 흑발 레이어드 컷", consistencyLockScorePct: 97 },
      { partRoute: "/character-make-etc", partLabelKo: "소품·오라·귀걸이 파츠", selectedPresetSummaryKo: "고대 유물 파편 홀로그램 오라 파츠", consistencyLockScorePct: 95 },
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
      { shotNumber: 1, cameraMove: "dolly-in", durationMs: 1800, voiceoverBeatKo: `${protagonist}: "이 봉인을 여는 순간, 우리의 시간은 되돌릴 수 없어."`, visualTransitionKo: "전경 유물 파편 블러 처리 후 주연 눈동자 익스트림 클로즈업으로 달리 인" },
      { shotNumber: 2, cameraMove: "dutch-tilt-push", durationMs: 2100, voiceoverBeatKo: `${partner}: "그래도 멈추지 않아. 끝까지 볼 거야."`, visualTransitionKo: "18도 더치 틸트 회전과 함께 두 인물의 대립 구도를 대각선 분할" },
      { shotNumber: 3, cameraMove: "tracking-orbit", durationMs: 2400, voiceoverBeatKo: "유물 코어 폭발음(SFX) 및 공중 도약 액션 비트", visualTransitionKo: "카메라가 180도 트래킹 오빗하며 슬로모션 충격파 프레임을 포착" },
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
        { stateName: "Idle_Tension_Breathing", triggerConditionKo: "뷰포트 진입 0% ~ 64% 구간", meshDeformationSummaryKo: "흉곽 호흡 메쉬 미세 수축·팽창 및 안광 파티클 24fps 루프", loopFps: 24 },
        { stateName: "Relic_Awaken_Burst", triggerConditionKo: "스크롤 진행률 65% 돌파 시 즉시 전이", meshDeformationSummaryKo: "헤어·망토 메쉬 외곽 팽창 + 충격파 링 60fps 버스트 재생", loopFps: 60 },
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

/* ============================================================================
 * 9. Cotrans 식자 인페인팅 · VRoid 3D VRM 아바타 · Blockade Skybox 360° 월드 로컬라이저
 * ============================================================================ */

export function buildLocalCotransVroidSkyboxWorldLocalizerReport(
  input: WebtoonProductionAssistInput = {},
): CotransVroidSkyboxWorldLocalizerReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";

  return {
    worldLocalizerSummaryKo: `Cotrans Manga Image Translator의 CTD 말풍선 검출 + LaMa 512px 배경 인페인팅, VRoid Studio의 VRM-1.0 파라메트릭 아바타(MToon 림셰이드·스프링본), Blockade Labs Skybox AI의 8K 360° 파노라마 깊이맵 배경을 통합한 월드·식자 파이프라인입니다.`,
    cotransLetteringAndInpaint: {
      ocrDetectorModel: "ctd-comic-text-detector",
      inpaintingModel: "lama-large-512px",
      balloonMaskDilatePx: 6,
      localizedRegions: [
        { regionId: "balloon-cut01-01", sourceKoText: `${protagonist}: 이 봉인을 여는 순간, 우리의 시간은 되돌릴 수 없어.`, translatedEnText: "The moment we break this seal, our time can never be turned back.", translatedJaText: "この封印を解いた瞬間、俺たちの時間は二度と戻せない。", verticalTypesetting: true },
        { regionId: "balloon-cut01-02", sourceKoText: `${partner}: 그래도 멈추지 않아. 끝까지 볼 거야.`, translatedEnText: "Even so, I won't stop. I'll see it through to the end.", translatedJaText: "それでも止まらない。最後まで見届けるから。", verticalTypesetting: true },
      ],
    },
    vroidParametricAvatar: {
      vrmSpecVersion: "VRM-1.0",
      rimShadeWidthPct: 44,
      outlineWidthMm: 1.4,
      hairSpringBoneStiffness: 0.72,
      expressionBlendshapePresetKo: `${protagonist} 결의에 찬 눈매(Funnel 25% + AngryBrow 40%)`,
    },
    skybox360Environment: {
      equirectangularResolution: "8192x4096-8K",
      depthMapParallaxStrengthPct: 68,
      horizonPitchOffsetDeg: -12,
      skyboxStylePresetKo: "Anime Sanctum Ruins Twilight 360° HDRI",
      ambientIblTintHex: "#38BDF8",
    },
  };
}

export async function runCotransVroidSkyboxWorldLocalizerAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<CotransVroidSkyboxWorldLocalizerReport>> {
  const fallbackReport = buildLocalCotransVroidSkyboxWorldLocalizerReport(input);
  return executeRea15Engine({
    taskId: "rea15:cotrans-vroid-skybox-world-localizer",
    input,
    options,
    systemPromptKo:
      "당신은 Cotrans Manga Translator(CTD/DBNet 말풍선 검출·LaMa/AOT 인페인팅·세로쓰기 식자), VRoid Studio(VRM 1.0 MToon 외곽선·스프링본·블렌드셰이프), Blockade Labs Skybox AI(8K 360° 파노라마·깊이맵 패럴랙스) 통합 디렉터입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 대본의 2개 핵심 말풍선 다국어(KO/EN/JA) 인페인팅·식자 사양, VRoid VRM 캐릭터 셰이더/물리 수치, 그리고 Skybox AI 360° 배경 환경광 사양을 생성하세요.",
    schema: CotransVroidSkyboxWorldLocalizerSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 10. WonderUnit Shot Generator · Procreate Dreams 퍼포밍 · Krita Diffusion · Artbreeder 유전자 디렉터
 * ============================================================================ */

export function buildLocalStoryboarderDreamsKritaArtbreederDirectorReport(
  input: WebtoonProductionAssistInput = {},
): StoryboarderDreamsKritaArtbreederDirectorReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";

  return {
    directorExecutiveSummaryKo: `WonderUnit Storyboarder의 3D Shot Generator와 ComicAI/AI Comic Factory의 컷 분할 템플릿, Procreate Dreams의 실시간 터치 퍼포밍(Performing) 키프레임 트랙, Krita Live Diffusion ControlNet 스택, Artbreeder 유전자(Gene) 슬라이더 및 Pixiv Sketch 브러시 스트로크를 결합한 마스터 작화·연출 사양입니다.`,
    shotGeneratorAndComicFactory: {
      lensMm: 24,
      cameraHeightCm: 135,
      comicGridTemplateKo: "세로 3단 비대칭 다이나믹 블리드 + 대각선 슬래시 거터",
      inkLineCleanlinessPct: 96,
      storyboardThatPropCount: 5,
    },
    procreateDreamsPerformingTrack: {
      performingRecordSamplingHz: 120,
      warpMeshGridSubdivisions: 16,
      flipbookOnionSkinFrames: 4,
      liveMotionGestureSummaryKo: `${protagonist}의 검격 궤적을 120Hz 실시간 터치 퍼포밍으로 기록해 카메라 셰이크와 망토 워프 메쉬를 동기화`,
    },
    kritaLiveDiffusionAndArtbreederGenes: {
      kritaControlNetStack: ["Lineart-Anime-v1.1", "Depth-Anything-V2", "IP-Adapter-FaceID-PlusV2"],
      livePaintingLatencyMs: 85,
      artbreederGeneSliders: [
        {
          geneNameKo: "샤프 다크 판타지 선화 밀도",
          weightNormalized: 0.84,
          visualEffectKo: "턱선·눈매 잉크 펜선 대비 강화 및 미세 크로스해칭 추가",
        },
        {
          geneNameKo: "시네마틱 청록 역광 채도",
          weightNormalized: 0.72,
          visualEffectKo: "어두운 배경 대비 유물 발광 시안-바이올렛 색수차 강조",
        },
      ],
      pixivSketchBrushSyncNoteKo: "G펜 필압 곡선(감도 88%) 및 수채 경계 블렌딩 브러시 프리셋 동기화 완료",
    },
  };
}

export async function runStoryboarderDreamsKritaArtbreederDirectorAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<StoryboarderDreamsKritaArtbreederDirectorReport>> {
  const fallbackReport = buildLocalStoryboarderDreamsKritaArtbreederDirectorReport(input);
  return executeRea15Engine({
    taskId: "rea15:storyboarder-dreams-krita-artbreeder-director",
    input,
    options,
    systemPromptKo:
      "당신은 WonderUnit Storyboarder(3D Shot Generator), ComicAI/AI Comic Factory/StoryboardThat, Procreate Dreams(120Hz 실시간 Performing·Flipbook), Krita AI Diffusion(ControlNet), Artbreeder(Gene Splicer), Pixiv Sketch를 통합 지휘하는 마스터 작화·애니메이션 감독입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 장면을 위한 Shot Generator 카메라·코믹 그리드 사양, Procreate Dreams 실시간 퍼포밍 트랙, Krita ControlNet 스택 및 Artbreeder 유전자 슬라이더 2종을 설계하세요.",
    schema: StoryboarderDreamsKritaArtbreederDirectorSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 11. Wave 5: NijiJourney V6 · PixAI · Civitai · TensorArt · WaifuLabs · Picrew · CHARAT 디렉터
 * ============================================================================ */

export function buildLocalNijiPixaiCivitaiLoraSrefDirectorReport(
  input: WebtoonProductionAssistInput = {},
): NijiPixaiCivitaiLoraSrefDirectorReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    loraAndSrefSummaryKo: `NijiJourney V6(--style expressive·--sref·--cref), Civitai·PixAI.Art·SeaArt·Tensor.Art의 Illustrious/NoobAI 다중 LoRA 가중치 스택, Moescape Tavern 페르소나 훅, 그리고 Waifu Labs 4단 잠재 그리드 및 Picrew/CHARAT 파츠 레이어 Z-order를 통합한 ${genre} 캐릭터·화풍 일관성 디렉팅 사양입니다.`,
    nijiJourneyV6Spec: {
      nijiStyleMode: "expressive",
      srefCode: "sref-4829103744",
      styleWeightSw: 240,
      characterWeightCw: 95,
      compiledNijiPrompt: `${protagonist} and ${partner} standing in a shattered celestial sanctum, dramatic cyan rim light, manhwa vertical composition, sharp cel-shading --niji 6 --style expressive --sref 4829103744 --sw 240 --cw 95 --ar 9:16`,
    },
    civitaiPixaiTensorLoraStack: {
      baseCheckpointModel: "Illustrious-XL-v1.1-Manhwa-Tune",
      loraAdapters: [
        {
          loraNameKo: "K-Webtoon S-Rank Lineart & RimLight v2",
          platformSource: "Civitai / Tensor.Art",
          weight: 0.75,
          triggerWords: "kwebtoon_line, crisp_cel_shade, glowing_cyan_rim",
        },
        {
          loraNameKo: "PixAI Dynamic Action Speedline & Aura",
          platformSource: "PixAI.Art / SeaArt AI",
          weight: 0.55,
          triggerWords: "mana_vortex, slash_motion_blur, dramatic_backlight",
        },
      ],
      controlNetPreprocessor: "AnyLine + Depth-Anything-V2 + OpenPose-Full (Weight 0.85)",
      moescapeTavernPersonaHookKo: `${protagonist} 냉철한 반말 어조와 ${partner}의 결단력 있는 대사 턴을 Moescape Tavern 롤플레이 시뮬레이터로 사전 검증 완료`,
    },
    waifuLabsPicrewCharatModularParts: {
      waifuLabs4StepSeedGridKo:
        "Step 1 초기 실루엣 시드(#09) → Step 2 청록/보라 야간 팔레트(#14) → Step 3 날카로운 눈매 디테일(#03) → Step 4 전투 스탠스 포즈(#11)",
      picrewLayerZOrder: [
        "01_back_cloak_wing",
        "02_base_body_neck",
        "03_uniform_armor_torso",
        "04_face_expression_eyes",
        "05_front_hair_bangs",
        "06_foreground_mana_weapon_fx",
      ],
      charatPngTuberExpressions: [
        "idle_calm_blink",
        "speaking_determined",
        "awakened_glow_eyes",
        "shocked_combat_alert",
      ],
      paletteSwapHexList: ["#0D111A", "#A855F7", "#E879F9", "#38BDF8", "#FF477E"],
    },
  };
}

export async function runNijiPixaiCivitaiLoraSrefDirectorAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<NijiPixaiCivitaiLoraSrefDirectorReport>> {
  const fallbackReport = buildLocalNijiPixaiCivitaiLoraSrefDirectorReport(input);
  return executeRea15Engine({
    taskId: "rea15:niji-pixai-civitai-lora-sref-director",
    input,
    options,
    systemPromptKo:
      "당신은 NijiJourney V6(--style/--sref/--cref), Civitai·PixAI.Art·SeaArt AI·Tensor.Art(Illustrious/SDXL 체크포인트·다중 LoRA·ControlNet), Moescape AI, Waifu Labs(4단계 16-그리드), Picrew·CHARAT(파츠 레이어 Z-order & PNGTuber 표정 시트)를 통합 지휘하는 서브컬처·웹툰 캐릭터 화풍 총괄 디렉터입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 대본과 장르에 최적화된 NijiJourney V6 프롬프트/가중치, Civitai/PixAI/TensorArt LoRA 스택 2종 및 ControlNet 구성, 그리고 WaifuLabs 4단 시드 그리드와 Picrew/CHARAT 모듈형 파츠 레이어 사양을 생성하세요.",
    schema: NijiPixaiCivitaiLoraSrefDirectorSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 12. Wave 5: Tripo3D · Meshy 7 · HeroForge 3D 소품/갑주 · Suno V6 OST · ElevenLabs 더빙 · MANGA Plus 디렉터
 * ============================================================================ */

export function buildLocalTripoMeshyHeroforgeSunoElevenlabsOsmuReport(
  input: WebtoonProductionAssistInput = {},
): TripoMeshyHeroforgeSunoElevenlabsOsmuReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    osmuExecutiveSummaryKo: `Tripo 3D·Meshy 7·Hero Forge의 3D 판타지 무기/갑주/성소 소품 쿼드 메쉬 및 툰 텍스처 베이킹과 Suno V6 에피소드 테마 OST, ElevenLabs 다중 성우 감정 더빙/폴리 SFX, 그리고 슈에이샤 MANGA Plus Creators 글로벌 동시 연재 패키지를 통합한 입체 제작·OSMU 사양입니다.`,
    tripoMeshyHeroforge3dPropSpec: {
      targetPropAndArmorNameKo: `${protagonist}의 각성 아케인 성검 & ${partner}의 크로노스 성유물 갑주`,
      tripoQuadPolyCount: 28_500,
      meshyTextureStyle: "toon-cel-pbr",
      heroforgePosePresetKo: "HeroForge Dynamic Low-Angle Blade Draw + Floating Rune Base",
      toonOutlineThicknessMm: 1.35,
    },
    sunoAndElevenLabsAudioScore: {
      sunoV6TrackTitleKo: `${genre} — Sanctum Awakening (Suno V6 Orchestral Hybrid OST)`,
      sunoGenreAndBpmTags: "Dark Orchestral Hybrid, Choir, Synth Arpeggio, C Minor, 134 BPM",
      stemSeparationChannels: ["Vocals/Choir", "Strings & Brass", "Taiko Percussion", "Sub-Bass & Drone"],
      elevenLabsVoiceCast: [
        {
          characterNameKo: protagonist,
          voiceTimbreKo: "중저음의 절제된 긴장감과 폭발적 각성 톤을 오가는 남성 주연 보이스",
          stabilityPct: 68,
          styleExaggerationPct: 82,
        },
        {
          characterNameKo: partner,
          voiceTimbreKo: "선명하고 단호한 호흡과 미세한 떨림이 공존하는 여성 주연 보이스",
          stabilityPct: 74,
          styleExaggerationPct: 78,
        },
      ],
      foleySfxPromptKo:
        "Shattering ancient stone seal followed by resonant crystalline sword unsheathing and deep mana hum",
    },
    mangaPlusCreatorsGlobalRelease: {
      readingMode: "vertical-scroll",
      localizedLanguages: ["ko-KR", "en-US", "ja-JP", "es-ES"],
      shueishaMonthlyAwardTargetScore: 95,
      globalPromoHookKo:
        "3D 아케인 유물 연출과 Suno V6·ElevenLabs 오디오툰 트랙을 결합한 MANGA Plus Creators 글로벌 동시 런칭",
    },
  };
}

export async function runTripoMeshyHeroforgeSunoElevenlabsOsmuAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<TripoMeshyHeroforgeSunoElevenlabsOsmuReport>> {
  const fallbackReport = buildLocalTripoMeshyHeroforgeSunoElevenlabsOsmuReport(input);
  return executeRea15Engine({
    taskId: "rea15:tripo-meshy-heroforge-suno-elevenlabs-osmu",
    input,
    options,
    systemPromptKo:
      "당신은 Tripo 3D(쿼드 리토폴로지·오토리깅), Meshy 7(Text/Image-to-3D·PBR/툰 텍스처), Hero Forge(판타지 갑주·무기·포토부스), Suno V6(웹툰 OST·스템 분리), ElevenLabs(다중 성우 더빙·폴리 SFX), MANGA Plus Creators by SHUEISHA(글로벌 투고·어워드) 통합 총괄 프로듀서입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 장면을 위한 Tripo3D/Meshy 7/HeroForge 3D 무기·소품 메쉬 사양, Suno V6 OST 및 ElevenLabs 주연 2인 보이스/폴리 SFX 큐시트, 그리고 MANGA Plus Creators 글로벌 투고 전략을 설계하세요.",
    schema: TripoMeshyHeroforgeSunoElevenlabsOsmuSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 13. Wave 6: Runway Gen-4.5 · Luma Ray 2 · Pika 2.2 · Viggle JST-2 · Live2D Cubism · Spine 2D 무빙툰 디렉터
 * ============================================================================ */

export function buildLocalRunwayLumaPikaViggleLive2dSpineMotionReport(
  input: WebtoonProductionAssistInput = {},
): RunwayLumaPikaViggleLive2dSpineMotionReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    movingToonExecutiveSummaryKo: `Runway Gen-4.5 Multi-Motion Brush(5영역 X/Y/Z/Ambient 제어), Luma Dream Machine Ray 2 Start/End 키프레임 모핑, Pika 2.2 Pikaffects 물리 타격, Viggle JST-2 3D 모션 전이(/mix), 그리고 Live2D Cubism 5 ArtMesh/Warp 디포머와 Spine 2D IK 본 스켈레탈 리그를 통합한 ${genre} 무빙툰·숏폼 트레일러 연출 사양입니다.`,
    motionBrushAndCameraRig: {
      runwayMotionBrushVectors: [
        {
          regionNameKo: `${protagonist} 망토·앞머리 역풍 레이어`,
          horizontalX: 4.2,
          verticalY: -1.5,
          proximityZ: 0.8,
          ambientNoise: 3.4,
        },
        {
          regionNameKo: `${partner} 아케인 마력 오라 파티클`,
          horizontalX: -2.1,
          verticalY: 5.6,
          proximityZ: 2.5,
          ambientNoise: 4.8,
        },
      ],
      lumaStartEndKeyframeLock: {
        startKeyframePromptKo: `컷 #14: ${protagonist}이(가) 검자루를 쥔 로우앵글 정지 구도`,
        endKeyframePromptKo: `컷 #15: 청록색 검기가 화면 대각선을 가르며 ${partner}와 교차하는 클라이맥스`,
        cameraOrbitAndDollyKo: "Fast Dolly-In + 18° Counter-Clockwise Dutch Roll Orbit",
      },
      pikaffectsAndPhysics: {
        effectPreset: "mana-shatter",
        lipSyncPhonemeFps: 24,
      },
      viggleJst2MotionTransfer: {
        commandMode: "/mix",
        drivingMotionSourceKo: "고속 검술 발도 & 공중 회전 착지 스턴트 레퍼런스 영상 (60fps)",
        backgroundPlateMode: "toon-bg-lock",
      },
    },
    live2dAndSpine2dRig: {
      live2dArtMeshVertexCount: 1_840,
      warpDeformerGrid: "8x8 Bezier Warp Deformer + Head XYZ Rotation Deformer",
      eyeBlinkAndLipSyncParams: [
        "ParamEyeLOpen",
        "ParamEyeROpen",
        "ParamEyeBallX",
        "ParamMouthOpenY",
        "ParamBreath",
      ],
      spine2dIkConstraints: [
        "IK_SwordArm_TwoBone",
        "IK_FootGroundPin_Left",
        "IK_FootGroundPin_Right",
        "TransformConstraint_ShoulderFollow",
      ],
      hairAndCapePhysicsDamping: 0.86,
    },
  };
}

export async function runRunwayLumaPikaViggleLive2dSpineMotionAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<RunwayLumaPikaViggleLive2dSpineMotionReport>> {
  const fallbackReport = buildLocalRunwayLumaPikaViggleLive2dSpineMotionReport(input);
  return executeRea15Engine({
    taskId: "rea15:runway-luma-pika-viggle-live2d-spine-motion",
    input,
    options,
    systemPromptKo:
      "당신은 Runway Gen-4.5(Multi-Motion Brush), Luma Dream Machine(Start/End Keyframe), Pika Art(Pikaffects·립싱크), Viggle AI(JST-2 /mix 모션 전이), Live2D Cubism 5(ArtMesh·Warp Deformer), Spine 2D(IK 본 스켈레탈 리깅)를 통합 지휘하는 무빙툰·모션 그래픽 총괄 감독입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 대본과 캐릭터를 바탕으로 Runway 모션 브러시 2개 영역 벡터, Luma 시작/끝 키프레임, Pikaffects/Viggle JST-2 모션 전이 설정, 그리고 Live2D Cubism ArtMesh 및 Spine 2D IK 본 리깅 사양을 설계하세요.",
    schema: RunwayLumaPikaViggleLive2dSpineMotionSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 14. Wave 6: 공간 모델러 · Blender Grease Pencil · Petalica 채색 · Magma 30인 협업 · Recraft SVG · Cara Glaze 디렉터
 * ============================================================================ */

export function buildLocalSketchupBlenderPetalicaMagmaRecraftStudioReport(
  input: WebtoonProductionAssistInput = {},
): SketchupBlenderPetalicaMagmaRecraftStudioReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    hybridStudioExecutiveSummaryKo: `공간 모델러의 제작 계획 예시입니다. SketchUp Dynamic Components·3D Warehouse의 동적 배경·은선 기능을 참고하고, Blender Grease Pencil 3.0 3D 카메라 공간 2D 작화, Pixiv Petalica Paint(Satsuki 셀채색)·OpenArt·Playground AI 스티커 합성, Magma 30인 실시간 분업 캔버스, Recraft V3 CanvasKit 순수 SVG 문양 벡터, Cara Glaze/NoAI 창작자 보호를 결합하는 ${genre} 하이브리드 스튜디오 사양을 제안합니다.`,
    sketchupAndGreasePencil3d: {
      warehouseDynamicComponentKo:
        "황궁 대신전 아치형 성문 & 스테인드글라스 채광창 설계 예시 (SketchUp Dynamic Components 참고; 문·창문 힌지 0°~115°)",
      hiddenLineStyleAndShadowTime: "Hidden Line 1.2px + Shadow Study 17:45 Sunset (Azimuth 248°, Altitude 16°)",
      greasePencilStrokeLayers: [
        "GP_01_3D_Perspective_Guide",
        "GP_02_Hero_Ink_Lineart",
        "GP_03_RimLight_Accent_Stroke",
        "GP_04_Foreground_Speedline_FX",
      ],
      cameraPlane3dProjectionNoteKo:
        "3D 성전 기둥 배열에 Grease Pencil 2D 캐릭터 스트로크를 Z-Depth 투영하여 카메라 패닝 시 완벽한 원근 시차 유지",
    },
    petalicaAndOpenArtColorStudio: {
      petalicaModelStyle: "Satsuki",
      colorHintStrokeCount: 14,
      lineSimplifyLevel: 2,
      openArtDirectorConsistencyScorePct: 96,
      playgroundMixedCanvasStickerSpecKo: `${protagonist}·${partner} 감정 데코 스티커 및 마법진 글로우 오버레이(Playground Radial Dot Grid 22px 캔버스 합성)`,
    },
    magmaRecraftCaraProduction: {
      magmaCollaboratorRoles: [
        "1. 콘티/3D 배치 디렉터 (Layer Lock: BG_3D)",
        "2. 메인 선화 작가 (Layer Lock: Ink_Main)",
        "3. Petalica 밑색/명암 어시스턴트 (Layer Lock: Cel_Color)",
        "4. 식자/Recraft SVG 타이포 디자이너 (Layer Lock: SFX_Vector)",
      ],
      recraftCanvaskitSvgEmblemKo:
        "황실 성유물 12각 기하학 마법진 & 에피소드 타이틀 로고 (Recraft V3 Skia CanvasKit 무손실 SVG 패스)",
      caraGlazeProtectionStrength: "balanced-shield",
      noAiMetaTagEnabled: true,
    },
  };
}

export async function runSketchupBlenderPetalicaMagmaRecraftStudioAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<SketchupBlenderPetalicaMagmaRecraftStudioReport>> {
  const fallbackReport = buildLocalSketchupBlenderPetalicaMagmaRecraftStudioReport(input);
  return executeRea15Engine({
    taskId: "rea15:sketchup-blender-petalica-magma-recraft-studio",
    input,
    options,
    systemPromptKo:
      "당신은 공간 모델러의 제작 계획을 제안하는 통합 프로덕션 디렉터입니다. SketchUp Dynamic Components·3D Warehouse(동적 구성요소·은선), Blender Grease Pencil 3.0(3D 공간 2D 작화), Pixiv Petalica Paint(Tanpopo/Satsuki/Canna 자동 채색)·ComicsMaker·OpenArt·Playground AI, Magma(30인 동시 협업 캔버스), Recraft V3(Skia CanvasKit SVG 벡터), Cara(Glaze 적대적 워터마킹·NoAI 보호)를 참고하세요. 외부 제품의 참고 기능과 공간 모델러에서 실제 확인한 구현 범위를 구분하고, 제안만으로 기능이 실행·완료됐다고 서술하지 마세요. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 장면을 위한 공간 모델러/Blender Grease Pencil 레이어 설계, Petalica/OpenArt/Playground 채색·스티커 사양, 그리고 Magma 분업 역할·Recraft SVG 벡터·Cara Glaze 원화 보호 파이프라인을 생성하세요.",
    schema: SketchupBlenderPetalicaMagmaRecraftStudioSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 15. Wave 7: Tapas · Tappytoon · RIDI · Postype 글로벌 연재 · Sudowrite · Novelcrafter · Campfire 코덱스
 * ============================================================================ */

export function buildLocalTapasTappytoonRidiPostypeSudowriteNovelcrafterReport(
  input: WebtoonProductionAssistInput = {},
): TapasTappytoonRidiPostypeSudowriteNovelcrafterReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const partner = cleanSingleLineText(input.partnerName ?? "하윤", 30) || "하윤";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    publishingAndCodexSummaryKo: `Tapas(Wait Until Free·Ink 후원), Tappytoon(Club 멤버십·북미/유럽 로컬라이징), 리디북스 웹툰(리디셀렉트·노블코믹스), 포스타입(크리에이터 멤버십·팬딩) 글로벌 연재 수익 모델과 Sudowrite Story Engine, Novelcrafter Codex, Campfire 세계관 타임라인, Milanote·PureRef 무드보드를 결합한 ${genre} 노벨투웹툰(Novel-to-Webtoon) 총괄 사양입니다.`,
    globalPublishingEconomics: {
      tapasWaitUntilFreeHours: 24,
      tapasInkPerEpisode: 375,
      tappytoonClubPointBundleKo: "Tappytoon Club 월정액 패스 + 에피소드당 300 Points 조기 해금",
      ridiWaitFreeAndNoblesseTierKo: "리디 기다리면 무료(24시간 주기) + 원작 웹소설 합본 크로스 프로모션",
      postypeMembershipMonthlyKrw: 9900,
    },
    novelToWebtoonStoryCodex: {
      sudowriteStoryEngineBeatKo: `${protagonist}의 내면 독백 3문단을 세로 스크롤 4컷 비주얼 액션 비트와 말풍선 28자 이내 대사로 압축 각색`,
      novelcrafterCodexEntries: [
        `[Character] ${protagonist} — 각성 등급 S, 시그니처 무기: 아케인 성검`,
        `[Character] ${partner} — 크로노스 성유물 계승자, 시간 역행 제약 조건 보유`,
        "[Location] 황궁 대신전 지하 봉인소 — 고대 룬 기둥 12개 및 역광 채광 구조",
      ],
      campfireTimelineArcKo: "제1막 봉인 균열(1~12화) → 제2막 성유물 각성 결전(13~35화) → 제3막 신계 침공 반격(36~60화)",
      milanoteAndPurerefMoodboardSpecKo:
        "Milanote 4열 캐릭터·배경·조명·톤앤매너 보드 + PureRef 알파 오버레이(투명도 85%, Always-on-Top) 작화 레퍼런스 동기화",
    },
  };
}

export async function runTapasTappytoonRidiPostypeSudowriteNovelcrafterAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<TapasTappytoonRidiPostypeSudowriteNovelcrafterReport>> {
  const fallbackReport = buildLocalTapasTappytoonRidiPostypeSudowriteNovelcrafterReport(input);
  return executeRea15Engine({
    taskId: "rea15:tapas-tappytoon-ridi-postype-sudowrite-novelcrafter",
    input,
    options,
    systemPromptKo:
      "당신은 Tapas·Tappytoon·리디북스 웹툰·포스타입(글로벌 연재·BM·팬덤 멤버십) 및 Sudowrite·Novelcrafter·Campfire·Milanote·PureRef(웹소설 원작 각색 코덱스·무드보드) 통합 총괄 프로듀서입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 작품을 위한 Tapas/Tappytoon/리디/포스타입 글로벌 연재 수익화 지표와 Sudowrite/Novelcrafter/Campfire/Milanote/PureRef 노벨투웹툰 각색 코덱스 사양을 설계하세요.",
    schema: TapasTappytoonRidiPostypeSudowriteNovelcrafterSchema,
    fallbackReport,
  });
}

/* ============================================================================
 * 16. Wave 7: Mixamo · Marvelous · Substance 3D · Coolors · 눈누/Blambot 식자 · ToonBoom/TVPaint/Moho · Eagle
 * ============================================================================ */

export function buildLocalMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport(
  input: WebtoonProductionAssistInput = {},
): MixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport {
  const protagonist = cleanSingleLineText(input.protagonistName ?? "서진", 30) || "서진";
  const genre = cleanSingleLineText(input.genre ?? "판타지 액션", 40) || "판타지 액션";

  return {
    productionPipelineSummaryKo: `Adobe Mixamo 3D 모션캡처 FBX 리타게팅, Marvelous Designer 패턴 의상 주름 시뮬레이션, Substance 3D 툰 PBR 재질, Coolors·Adobe Color 감정 팔레트, 눈누·Blambot 한영 웹툰 식자/효과음 타이포그래피, Toon Boom Harmony·TVPaint·Moho 2D 작화 애니메이션, Eagle 스마트 컬러 에셋 라이브러리를 통합한 ${genre} 하이엔드 제작 파이프라인입니다.`,
    mixamoMarvelousSubstance3dRig: {
      mixamoMocapFbxClipKo: `${protagonist} Sword & Shield Slash Combo (Mixamo 60fps FBX Auto-Rig + Root Motion Lock)`,
      marvelousClothPatternWeftWarpKo: "롱코트 및 망토 2D 패턴(Weft 42 / Warp 48, 바람 저항 650mm/s²) 실시간 주름 노말맵 추출",
      substanceStylizedToonMaterialKo: "Substance 3D Stylized Brushed Metal + Edge Wear Curvature Mask + Halftone Shadow Ramp",
    },
    colorHarmonyAndWebtoonTypography: {
      coolorsAndAdobeColorMoodHexes: ["#0B0F19", "#1E293B", "#00A8C2", "#A855F7", "#F43F5E"],
      wcagContrastRatio: 15.4,
      noonnuDialogueAndSfxFontsKo: [
        "대사 기본: 프리텐다드(Pretendard Medium) 자간 -2% / 행간 142%",
        "독백/회상: 마루부리(MaruBuri SemiBold) 명조 감성 연출",
        "효과음(SFX): 삼립호빵체 & 평창평화체 외곽선 4px 기울기 -12°",
      ],
      blambotEnglishLetteringFont: "Blambot Anime Ace 3.0 BB (Dialogue) + Disasterrama BB (Impact SFX)",
    },
    toonBoomTvpaintMohoAndEagleHub: {
      toonBoomHarmonyNodeCompositeKo: "Harmony Line-Art / Color-Art 서브레이어 분리 + Cutter·Glow·Peg 카메라 Z-Depth 노드 합성",
      tvpaintCtgColorAndMohoSmartBoneKo: "TVPaint CTG(Color & Texture Generator) 자동 밑색 채우기 + Moho 14 Smart Bone 다이얼 표정/관절 보간",
      eagleSmartFolderColorTags: [
        "Eagle Smart Folder: #00A8C2 [아케인 마법진/이펙트 브러시]",
        "Eagle Smart Folder: #A855F7 [황궁 3D 배경 & 조명 프리셋]",
        "Eagle Smart Folder: #F43F5E [액션 동세 & 망토 주름 레퍼런스]",
      ],
    },
  };
}

export async function runMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleAssist(
  input: WebtoonProductionAssistInput = {},
  options: RunWebtoonProductionAssistOptions = {},
): Promise<Rea15Envelope<MixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport>> {
  const fallbackReport = buildLocalMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport(input);
  return executeRea15Engine({
    taskId: "rea15:mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle",
    input,
    options,
    systemPromptKo:
      "당신은 Mixamo(3D 모캡 리타게팅), Marvelous Designer(3D 의상 주름), Substance 3D(툰 PBR 재질), Coolors·Adobe Color(색채학 무드스크립트), 눈누·Blambot(한영 웹툰 식자/SFX 폰트), Toon Boom Harmony·TVPaint·Moho(2D 애니메이션), Eagle(에셋 DAM) 통합 테크니컬 디렉터입니다. JSON 스키마에 맞춰 응답하세요.",
    userDirectiveKo:
      "현재 장면을 위한 Mixamo/Marvelous/Substance 3D 의상·모션·재질 사양, Coolors/Adobe Color 팔레트 및 눈누/Blambot 한영 식자 사양, 그리고 ToonBoom/TVPaint/Moho 애니메이션 및 Eagle 스마트 에셋 태그를 생성하세요.",
    schema: MixamoMarvelousCoolorsNoonnuBlambotToonboomEagleSchema,
    fallbackReport,
  });
}

export type Rea15WorkbenchTabId =
  | "glimnavi-relight-v23"
  | "kaistory-envelope-kaion"
  | "snaptoon-frameo-shaper-3d"
  | "manhwa-komiko-anifusion"
  | "creative-dopamine-ux"
  | "tootoon-gentoon-tooning-kr"
  | "krea-spline-lumiere-shader"
  | "ltx-boords-cascadeur-rive"
  | "cotrans-vroid-skybox-localizer"
  | "storyboarder-dreams-krita-artbreeder"
  | "niji-pixai-civitai-lora-sref"
  | "tripo-meshy-heroforge-suno-osmu"
  | "runway-luma-pika-viggle-live2d-spine"
  | "sketchup-blender-petalica-magma-recraft"
  | "tapas-tappytoon-ridi-postype-sudowrite-novelcrafter"
  | "mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle";

export const REA15_TABS: readonly {
  readonly id: Rea15WorkbenchTabId;
  readonly labelKo: string;
  readonly badgeKo: string;
  readonly tierBadgeKo: string;
}[] = [
  { id: "glimnavi-relight-v23", labelKo: "선화 v1.0~v2.3 · 컬러 분리 · Relight", badgeKo: "그림나비 Studio v2.3", tierBadgeKo: "Haiku 5.5" },
  { id: "kaistory-envelope-kaion", labelKo: "4단 단일 엔벨로프 · KAION 학습 퀴즈", badgeKo: "KAISTORY · KAITOON", tierBadgeKo: "Sonnet 5.5" },
  { id: "snaptoon-frameo-shaper-3d", labelKo: "3D 스포트라이트 콘 · SHAPER 직접 드로잉", badgeKo: "Snaptoon · Frameo · SHAPER", tierBadgeKo: "Sonnet 5.5" },
  { id: "manhwa-komiko-anifusion", labelKo: "6화풍/5톤 · 레이어 분리 · 노드 플로우", badgeKo: "ManhwaAI · Komiko · Anifusion", tierBadgeKo: "Sonnet 5.5" },
  { id: "creative-dopamine-ux", labelKo: "독자 도파민 히트맵 · UI 테마 합성기", badgeKo: "창의적 AI 특화", tierBadgeKo: "Opus 5.5" },
  { id: "tootoon-gentoon-tooning-kr", labelKo: "TooToon 5스튜디오 · GenToon 굿즈 · Tooning 6부위", badgeKo: "TooToon · GenToon · Tooning", tierBadgeKo: "Sonnet 5.5" },
  { id: "krea-spline-lumiere-shader", labelKo: "실시간 디렉터 · 3D 스타일 전이 · WebGPU 셰이더", badgeKo: "Krea · Spline · Lumiere", tierBadgeKo: "Haiku 5.5" },
  { id: "ltx-boords-cascadeur-rive", labelKo: "프리비즈 애니매틱 · 물리 포징 · Rive 상태머신", badgeKo: "LTX · Boords · Cascadeur · Rive", tierBadgeKo: "Opus 5.5" },
  { id: "cotrans-vroid-skybox-localizer", labelKo: "식자 인페인팅 · VRM 3D 아바타 · 360° 스카이박스", badgeKo: "Cotrans · VRoid · Skybox AI", tierBadgeKo: "Sonnet 5.5" },
  { id: "storyboarder-dreams-krita-artbreeder", labelKo: "3D Shot Generator · 퍼포밍 트랙 · ControlNet/유전자", badgeKo: "Storyboarder · Dreams · Krita · Artbreeder", tierBadgeKo: "Opus 5.5" },
  { id: "niji-pixai-civitai-lora-sref", labelKo: "Niji V6 (--sref/--cref) · LoRA 스택 · Picrew 파츠", badgeKo: "Niji · Civitai · PixAI · Picrew", tierBadgeKo: "Sonnet 5.5" },
  { id: "tripo-meshy-heroforge-suno-osmu", labelKo: "3D 프롭/미니어처 · Suno OST · ElevenLabs · MANGA Plus", badgeKo: "Tripo3D · Suno · ElevenLabs · OSMU", tierBadgeKo: "Opus 5.5" },
  { id: "runway-luma-pika-viggle-live2d-spine", labelKo: "모션 브러시 · 키프레임 모핑 · JST-2 · Live2D/Spine 2D", badgeKo: "Runway · Luma · Pika · Viggle · Live2D · Spine", tierBadgeKo: "Opus 5.5" },
  { id: "sketchup-blender-petalica-magma-recraft", labelKo: "공간 모델러/Grease Pencil · Petalica · Magma 협업 · Recraft SVG", badgeKo: "공간 모델러 · Blender · Petalica · Magma · Recraft", tierBadgeKo: "Sonnet 5.5" },
  { id: "tapas-tappytoon-ridi-postype-sudowrite-novelcrafter", labelKo: "Tapas/Tappytoon/리디/포스타입 · Sudowrite/Novelcrafter 코덱스", badgeKo: "Tapas · Tappytoon · RIDI · Sudowrite · Novelcrafter", tierBadgeKo: "Opus 5.5" },
  { id: "mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle", labelKo: "Mixamo/Marvelous 3D · Coolors · 눈누/Blambot · ToonBoom/Eagle", badgeKo: "Mixamo · Marvelous · Coolors · 눈누 · ToonBoom · Eagle", tierBadgeKo: "Sonnet 5.5" },
];
