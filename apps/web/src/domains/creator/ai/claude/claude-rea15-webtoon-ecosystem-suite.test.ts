import { describe, expect, it, vi } from "vitest";

import { claudeParse } from "@/shared/ai/claude/claude-transport";

import {
  buildLocalCotransVroidSkyboxWorldLocalizerReport,
  buildLocalCreativeDopamineAndUxSynthesizerReport,
  buildLocalGlimnaviRelightAndLineartV23Report,
  buildLocalKaistorySingleEnvelopeAndKaionReport,
  buildLocalKreaSplineLumiereRealtimeShaderReport,
  buildLocalLtxBoordsCascadeurRiveAnimaticReport,
  buildLocalManhwaKomikoAnifusionFlowReport,
  buildLocalMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport,
  buildLocalNijiPixaiCivitaiLoraSrefDirectorReport,
  buildLocalRunwayLumaPikaViggleLive2dSpineMotionReport,
  buildLocalSketchupBlenderPetalicaMagmaRecraftStudioReport,
  buildLocalSnaptoonFrameoShaper3dDirectorReport,
  buildLocalStoryboarderDreamsKritaArtbreederDirectorReport,
  buildLocalTapasTappytoonRidiPostypeSudowriteNovelcrafterReport,
  buildLocalTootoonGentoonTooningKrSuiteReport,
  buildLocalTripoMeshyHeroforgeSunoElevenlabsOsmuReport,
  buildRea15ThemeCssVariables,
  getRea15PlatformTheme,
  listRea15PlatformThemes,
  runCotransVroidSkyboxWorldLocalizerAssist,
  runCreativeDopamineAndUxSynthesizerAssist,
  runGlimnaviRelightAndLineartV23Assist,
  runKaistorySingleEnvelopeAndKaionAssist,
  runKreaSplineLumiereRealtimeShaderAssist,
  runLtxBoordsCascadeurRiveAnimaticAssist,
  runManhwaKomikoAnifusionFlowAssist,
  runMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleAssist,
  runNijiPixaiCivitaiLoraSrefDirectorAssist,
  runRea15WebtoonEcosystemFullSuite,
  runRunwayLumaPikaViggleLive2dSpineMotionAssist,
  runSketchupBlenderPetalicaMagmaRecraftStudioAssist,
  runSnaptoonFrameoShaper3dDirectorAssist,
  runStoryboarderDreamsKritaArtbreederDirectorAssist,
  runTapasTappytoonRidiPostypeSudowriteNovelcrafterAssist,
  runTootoonGentoonTooningKrSuiteAssist,
  runTripoMeshyHeroforgeSunoElevenlabsOsmuAssist,
} from "./claude-rea15-webtoon-ecosystem-suite";
import type { WebtoonProductionAssistInput } from "./claude-webtoon-production-schemas";

vi.mock("@/shared/ai/claude/claude-transport", () => ({
  claudeParse: vi.fn(),
}));

const SAMPLE_INPUT: WebtoonProductionAssistInput = {
  genre: "판타지 액션",
  coreConflict: "봉인된 고대 유물의 각성과 황궁 결전",
  protagonistName: "서진",
  partnerName: "하윤",
  artistLabel: "K-웹툰 마스터 화풍",
  triggerWord: "ts_master_webtoon",
  relationshipDynamic: "fated-rivals",
  posePresetId: "pose-dynamic-slash",
  scriptText: "서진: 이 봉인을 여는 순간 우리의 시간은 되돌릴 수 없어.\n하윤: 그래도 멈추지 않아.",
};

const TEST_ROUTE = {
  apiKey: "sk-ant-test-key",
  revision: 1,
  model: "claude-opus-5-5",
};

describe("claude-rea15-webtoon-ecosystem-suite (Phase 7 100대 웹툰 AI 플랫폼 REA 내재화 & 16대 창의적 AI 스위트)", () => {
  it("0. 1,200대 플랫폼 UI/UX 테마 토큰 카탈로그 및 CSS 변수 생성을 검증한다", () => {
    const themes = listRea15PlatformThemes();
    expect(themes).toHaveLength(1200);

    const enigma = getRea15PlatformTheme("ww2-enigma-3rotor-plugboard-lampboard-cipher");
    expect(enigma.accentPrimaryHex).toBe("#d97706");

    const jangdokdae = getRea15PlatformTheme("korean-jangdokdae-meju-straw-rope-charcoal-chili");
    expect(jangdokdae.accentPrimaryHex).toBe("#92400e");

    const grand1200 = getRea15PlatformTheme("toonstudio-1200-platform-grand-millennium-engine");
    expect(grand1200.accentPrimaryHex).toBe("#fbbf24");

    const jongmyo = getRea15PlatformTheme("jongmyo-jeryeak-pyeonjong-pyeongyeong-chuk-eo");
    expect(jongmyo.accentPrimaryHex).toBe("#eab308");

    const f1Kerb = getRea15PlatformTheme("f1-circuit-apex-kerb-drs-zone-pit-board");
    expect(f1Kerb.accentPrimaryHex).toBe("#ef4444");

    const hyper1140 = getRea15PlatformTheme("toonstudio-1140-platform-hyper-synthesis-engine");
    expect(hyper1140.accentPrimaryHex).toBe("#00f5d4");

    const galleon = getRea15PlatformTheme("galleon-square-rig-shroud-ratline-quarterdeck");
    expect(galleon.accentPrimaryHex).toBe("#b45309");

    const bdna = getRea15PlatformTheme("crispr-cas9-right-handed-b-dna-double-helix");
    expect(bdna.accentPrimaryHex).toBe("#06b6d4");

    const omniverse1080 = getRea15PlatformTheme("toonstudio-1080-platform-omniverse-supreme-engine");
    expect(omniverse1080.accentPrimaryHex).toBe("#fbbf24");

    const trireme = getRea15PlatformTheme("greek-olympus-bireme-trireme-corinthian-column");
    expect(trireme.accentPrimaryHex).toBe("#eab308");

    const jjimjilbang = getRea15PlatformTheme("jjimjilbang-sheep-head-towel-locker-key-sikye");
    expect(jjimjilbang.accentPrimaryHex).toBe("#f59e0b");

    const supreme1020 = getRea15PlatformTheme("toonstudio-1020-platform-supreme-meta-orchestrator");
    expect(supreme1020.accentPrimaryHex).toBe("#00f5d4");

    const murimPlum = getRea15PlatformTheme("murim-plum-blossom-sword-qi-petal");
    expect(murimPlum.accentPrimaryHex).toBe("#f43f5e");

    const grandPiano = getRea15PlatformTheme("grand-piano-lid-prop-stick-right-side-damper");
    expect(grandPiano.accentPrimaryHex).toBe("#f8fafc");

    const cherenkov = getRea15PlatformTheme("particle-accelerator-torus-cherenkov-blue-glow");
    expect(cherenkov.accentPrimaryHex).toBe("#00b4d8");

    const joseonGat = getRea15PlatformTheme("joseon-gat-manggeon-gwanja-amber-string");
    expect(joseonGat.accentPrimaryHex).toBe("#1e293b");

    const hwachaRocket = getRea15PlatformTheme("joseon-hwacha-singijeon-multi-rocket");
    expect(hwachaRocket.accentPrimaryHex).toBe("#ef4444");

    const kslSign = getRea15PlatformTheme("sign-language-ksl-asl-handshape-nonmanual");
    expect(kslSign.accentPrimaryHex).toBe("#14b8a6");

    const dentalChart = getRea15PlatformTheme("dental-fdi-tooth-chart-mirror-handpiece");
    expect(dentalChart.accentPrimaryHex).toBe("#38bdf8");

    const csatOmr = getRea15PlatformTheme("korean-csat-omr-card-computer-pen-clock");
    expect(csatOmr.accentPrimaryHex).toBe("#ec4899");

    const paywallRoi = getRea15PlatformTheme("webtoon-episode-cliffhanger-paywall-conversion");
    expect(paywallRoi.accentPrimaryHex).toBe("#10b981");

    const esportsHud = getRea15PlatformTheme("esports-moba-hud-minimap-killfeed");
    expect(esportsHud.accentPrimaryHex).toBe("#3b82f6");

    const piano88 = getRea15PlatformTheme("piano-88key-2-3-blackkey-pedal-rig");
    expect(piano88.accentPrimaryHex).toBe("#f8fafc");

    const taxErp = getRea15PlatformTheme("webtoon-studio-tax-withholding-erp-ledger");
    expect(taxErp.accentPrimaryHex).toBe("#6366f1");

    const rofanCorset = getRea15PlatformTheme("rofan-corset-busk-back-lacing");
    expect(rofanCorset.accentPrimaryHex).toBe("#ec4899");

    const hunterGate = getRea15PlatformTheme("hunter-rank-gate-color-spectrum");
    expect(hunterGate.accentPrimaryHex).toBe("#ef4444");

    const pocketWatchIiii = getRea15PlatformTheme("antique-pocket-watch-roman-iiii");
    expect(pocketWatchIiii.accentPrimaryHex).toBe("#eab308");

    const anamorphicRig = getRea15PlatformTheme("anamorphic-oval-bokeh-flare-rig");
    expect(anamorphicRig.accentPrimaryHex).toBe("#38bdf8");

    const lhdCockpit = getRea15PlatformTheme("lhd-rhd-steering-wiper-stalk-lock");
    expect(lhdCockpit.accentPrimaryHex).toBe("#3b82f6");

    const gachaSplash = getRea15PlatformTheme("gacha-ssr-splash-art-parallax-rig");
    expect(gachaSplash.accentPrimaryHex).toBe("#fbbf24");

    const kreaWan = getRea15PlatformTheme("krea-wan-14b-toon-motion");
    expect(kreaWan.accentPrimaryHex).toBe("#a855f7");

    const creatureAnat = getRea15PlatformTheme("terryl-whitlatch-creature-anat");
    expect(creatureAnat.accentPrimaryHex).toBe("#10b981");

    const seoulMetro = getRea15PlatformTheme("seoul-metro-cabin-handrail-spec");
    expect(seoulMetro.accentPrimaryHex).toBe("#10b981");

    const netflixBible = getRea15PlatformTheme("netflix-live-action-series-bible");
    expect(netflixBible.accentPrimaryHex).toBe("#e50914");

    const hanbokDb = getRea15PlatformTheme("hanbok-advancement-center-db");
    expect(hanbokDb.accentPrimaryHex).toBe("#6366f1");

    const imfdbFirearm = getRea15PlatformTheme("imfdb-firearm-slide-lock");
    expect(imfdbFirearm.accentPrimaryHex).toBe("#ef4444");

    const acrylicStand = getRea15PlatformTheme("artioscad-acrylic-stand-slot");
    expect(acrylicStand.accentPrimaryHex).toBe("#38bdf8");

    const metArmor = getRea15PlatformTheme("met-museum-armor-collection");
    expect(metArmor.accentPrimaryHex).toBe("#d97706");

    const faceitArkit = getRea15PlatformTheme("faceit-blender-arkit-52");
    expect(faceitArkit.accentPrimaryHex).toBe("#3b82f6");

    const tobiiAoi = getRea15PlatformTheme("tobii-pro-lab-saccade-aois");
    expect(tobiiAoi.accentPrimaryHex).toBe("#3b82f6");

    const worldLabs = getRea15PlatformTheme("world-labs-marble-3d-scene");
    expect(worldLabs.accentPrimaryHex).toBe("#0ea5e9");

    const qwenVl = getRea15PlatformTheme("qwen-2-5-vl-manga-ocr");
    expect(qwenVl.accentPrimaryHex).toBe("#8b5cf6");

    const vrayToon = getRea15PlatformTheme("vray-toon-cel-material");
    expect(vrayToon.accentPrimaryHex).toBe("#00a8ff");

    const kyleBrushes = getRea15PlatformTheme("kyle-t-webster-megapack");
    expect(kyleBrushes.accentPrimaryHex).toBe("#f59e0b");

    const epidemicBgm = getRea15PlatformTheme("epidemic-sound-webtoon-bgm");
    expect(epidemicBgm.accentPrimaryHex).toBe("#00e5ff");

    const warudoStage = getRea15PlatformTheme("warudo-3d-stage-camera");
    expect(warudoStage.accentPrimaryHex).toBe("#38bdf8");

    const typeNetwork = getRea15PlatformTheme("type-network-variable-balloon");
    expect(typeNetwork.accentPrimaryHex).toBe("#38bdf8");

    const naverPainter = getRea15PlatformTheme("naver-webtoon-ai-painter");
    expect(naverPainter.accentPrimaryHex).toBe("#00dc64");

    const embergen = getRea15PlatformTheme("embergen-realtime-fire-smoke");
    expect(embergen.accentPrimaryHex).toBe("#f97316");

    const moveAi = getRea15PlatformTheme("move-ai-multicam-mocap");
    expect(moveAi.accentPrimaryHex).toBe("#00f5d4");

    const kitbash = getRea15PlatformTheme("kitbash3d-cargo-worlds");
    expect(kitbash.accentPrimaryHex).toBe("#f59e0b");

    const anchorpoint = getRea15PlatformTheme("anchorpoint-art-asset-git");
    expect(anchorpoint.accentPrimaryHex).toBe("#6366f1");

    const piccoma = getRea15PlatformTheme("piccoma-smartoon-studio");
    expect(piccoma.accentPrimaryHex).toBe("#ffd600");

    const manta = getRea15PlatformTheme("manta-comics-studio");
    expect(manta.accentPrimaryHex).toBe("#6c3ce9");

    const glazeShield = getRea15PlatformTheme("glaze-nightshade-shield");
    expect(glazeShield.coreWorkflowKo).toContain("Style Cloaking");

    const redice = getRea15PlatformTheme("redice-studio-action");
    expect(redice.accentPrimaryHex).toBe("#ef4444");

    const fluxKontext = getRea15PlatformTheme("flux-1-kontext-character");
    expect(fluxKontext.coreWorkflowKo).toContain("In-Context");

    const worldAnvil = getRea15PlatformTheme("world-anvil-chronicle");
    expect(worldAnvil.coreWorkflowKo).toContain("Bloodline Tree");

    const sandoll = getRea15PlatformTheme("sandoll-cloud-webtoon-font");
    expect(sandoll.accentPrimaryHex).toBe("#0066ff");

    const kakaoAlive = getRea15PlatformTheme("kakao-webtoon-alive");
    expect(kakaoAlive.accentPrimaryHex).toBe("#ffdc00");

    const comfyIpAdapter = getRea15PlatformTheme("comfyui-ipadapter-controlnet");
    expect(comfyIpAdapter.coreWorkflowKo).toContain("IP-Adapter FaceID");

    const glimnavi = getRea15PlatformTheme("glimnavi");
    expect(glimnavi.reaEvidenceId).toContain("ev_f2c78ddd");
    expect(glimnavi.surfaceHex).toBe("#f6f7fb");

    const tootoon = getRea15PlatformTheme("tootoon");
    expect(tootoon.keyRoutes).toContain("/fabulator");
    expect(tootoon.keyRoutes).toContain("/artifex");

    const gentoon = getRea15PlatformTheme("gentoon");
    expect(gentoon.surfaceHex).toBe("#f4ebfc");

    const vroid = getRea15PlatformTheme("vroid-studio");
    expect(vroid.reaEvidenceId).toContain("ev_c576d121");

    const niji = getRea15PlatformTheme("nijijourney");
    expect(niji.reaEvidenceId).toContain("ev_ec281b4f");

    const pixai = getRea15PlatformTheme("pixai-art");
    expect(pixai.reaEvidenceId).toContain("ev_d3bb1ab0");

    const suno = getRea15PlatformTheme("suno-ai");
    expect(suno.reaEvidenceId).toContain("ev_d9164326");

    const picrew = getRea15PlatformTheme("picrew-me");
    expect(picrew.reaEvidenceId).toContain("ev_a0338d95");

    const runway = getRea15PlatformTheme("runwayml");
    expect(runway.reaEvidenceId).toContain("ev_c274761a");

    const live2d = getRea15PlatformTheme("live2d-cubism");
    expect(live2d.reaEvidenceId).toContain("ev_ebe606c4");

    const recraft = getRea15PlatformTheme("recraft-ai");
    expect(recraft.reaEvidenceId).toContain("ev_0ade0975");

    const viggle = getRea15PlatformTheme("viggle-ai");
    expect(viggle.reaEvidenceId).toContain("ev_b9fbb288");

    const tapas = getRea15PlatformTheme("tapas-io");
    expect(tapas.reaEvidenceId).toContain("ev_60987ef5");

    const mixamo = getRea15PlatformTheme("mixamo");
    expect(mixamo.reaEvidenceId).toContain("ev_93ff1c37");

    const eagle = getRea15PlatformTheme("eagle-cool");
    expect(eagle.reaEvidenceId).toContain("ev_bb317c12");

    const cssVars = buildRea15ThemeCssVariables("frameo");
    expect(cssVars["--rea15-surface"]).toBe("#09090b");
    expect(cssVars["--rea15-accent-primary"]).toBe("#423be5");
  });

  it("1. 그림나비(GlimNavi) Studio v2.3 5종 선화·6종 프리셋·컬러 분리·Relight 디렉터(Haiku 5.5)를 검증한다", async () => {
    const local = buildLocalGlimnaviRelightAndLineartV23Report(SAMPLE_INPUT);
    expect(local.selectedLineartVersion).toBe("v2.3-balanced");
    expect(local.separatedColorLayers.length).toBeGreaterThanOrEqual(4);
    expect(local.exportReadiness.downloadPsdReady).toBe(true);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-haiku-4-5",
        usage: { input_tokens: 210, output_tokens: 330 },
      } as never,
      parsed: local,
    });

    const live = await runGlimnaviRelightAndLineartV23Assist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("fast-inline");
    expect(live.routedModel).toBe("claude-haiku-5-5");
    expect(live.report.colorLayerSeparationEnabled).toBe(true);
  });

  it("2. KAISTORY 4단 단일 데이터 엔벨로프 & KAION 학습카드·독자 퀴즈(Sonnet 5.5)를 검증한다", async () => {
    const local = buildLocalKaistorySingleEnvelopeAndKaionReport(SAMPLE_INPUT);
    expect(local.subdomainStages).toHaveLength(4);
    expect(local.kaionLearningCards.length).toBeGreaterThanOrEqual(2);
    expect(local.speakerTtsAndMultilingualTracks).toHaveLength(2);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 260, output_tokens: 420 },
      } as never,
      parsed: local,
    });

    const live = await runKaistorySingleEnvelopeAndKaionAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.routedModel).toBe("claude-sonnet-5-5");
    expect(live.report.offlineFirstSyncStatus).toBe("synced-local-authoritative");
  });

  it("3. Snaptoon · Frameo 스포트라이트 콘 · NAVER SHAPER 3D 직접 드로잉 디렉터(Sonnet 5.5)를 검증한다", async () => {
    const local = buildLocalSnaptoonFrameoShaper3dDirectorReport(SAMPLE_INPUT);
    expect(local.frameoSpotlightShader.cursorAngleDeg).toBe(45);
    expect(local.frameoSpotlightShader.coneSpreadDeg).toBe(25);
    expect(local.shaperAndPoseRig.layeredPsdPassNames.length).toBeGreaterThanOrEqual(4);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 240, output_tokens: 380 },
      } as never,
      parsed: local,
    });

    const live = await runSnaptoonFrameoShaper3dDirectorAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.report.snaptoonBridge.preservedLineFidelityPct).toBeGreaterThanOrEqual(90);
  });

  it("4. ManhwaAI 6대 화풍/5대 톤 · Komiko 레이어 분리/인비트윈 · Anifusion 노드 플로우 디렉터를 검증한다", async () => {
    const local = buildLocalManhwaKomikoAnifusionFlowReport(SAMPLE_INPUT);
    expect(local.manhwaStylePreset).toBe("full-color");
    expect(local.activeToneOverlays).toHaveLength(3);
    expect(local.anifusionNodeFlowGraph).toHaveLength(5);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 250, output_tokens: 390 },
      } as never,
      parsed: local,
    });

    const live = await runManhwaKomikoAnifusionFlowAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.report.komikoLayerSplitterAndInbetween.inbetweenFrameCount).toBe(4);
  });

  it("5. [창의적 AI] 웹툰 독자 도파민·스크롤 정지 히트맵 시뮬레이터 & UI/UX 테마 합성기(Opus 5.5)를 검증한다", async () => {
    const local = buildLocalCreativeDopamineAndUxSynthesizerReport(SAMPLE_INPUT);
    expect(local.overallDopaminePeakScore).toBeGreaterThanOrEqual(90);
    expect(local.cutScrollHeatmap).toHaveLength(3);
    expect(local.synthesizedUiUxTheme.wcagContrastRatio).toBeGreaterThanOrEqual(7);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 320, output_tokens: 510 },
      } as never,
      parsed: local,
    });

    const live = await runCreativeDopamineAndUxSynthesizerAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("deep-architecture");
    expect(live.routedModel).toBe("claude-opus-5-5");
    expect(live.report.cliffhangerHookPowerPct).toBeGreaterThanOrEqual(90);
  });

  it("6. TooToon 5-Studio · GenToon 뷰어/굿즈 · Tooning 6부위 캐릭터 디렉터(Sonnet 5.5)를 검증한다", async () => {
    const local = buildLocalTootoonGentoonTooningKrSuiteReport(SAMPLE_INPUT);
    expect(local.tootoonFiveStudios).toHaveLength(5);
    expect(local.tooningSixPartCharacterRecipe).toHaveLength(6);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 240, output_tokens: 410 },
      } as never,
      parsed: local,
    });

    const live = await runTootoonGentoonTooningKrSuiteAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.routedModel).toBe("claude-sonnet-5-5");
    expect(live.report.gentoonReaderAndCommerce.paperHex).toBe("#f4ebfc");
  });

  it("7. Krea 실시간 디렉터 · Spline 3D/Hana 스타일 전이 · Lumiere/Graphite/PixiEditor 셰이더 디렉터(Haiku 5.5)를 검증한다", async () => {
    const local = buildLocalKreaSplineLumiereRealtimeShaderReport(SAMPLE_INPUT);
    expect(local.kreaRealtimeDirector.activeRoute).toBe("/realtime-director");
    expect(local.lumiereAndNodeGraphShaders.kuwaharaPaintRadiusPx).toBe(4);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-haiku-4-5",
        usage: { input_tokens: 190, output_tokens: 310 },
      } as never,
      parsed: local,
    });

    const live = await runKreaSplineLumiereRealtimeShaderAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("fast-inline");
    expect(live.routedModel).toBe("claude-haiku-5-5");
    expect(live.report.spline3dAndHanaBridge.activeRoute).toBe("/ai-style-transfer");
  });

  it("8. LTX Studio · Boords 애니매틱 · Cascadeur 물리 오토포징 · Rive/Jitter 상태머신 디렉터(Opus 5.5)를 검증한다", async () => {
    const local = buildLocalLtxBoordsCascadeurRiveAnimaticReport(SAMPLE_INPUT);
    expect(local.ltxAndBoordsAnimaticShots).toHaveLength(3);
    expect(local.cascadeurPhysicsRig.autoPosingConfidencePct).toBeGreaterThanOrEqual(90);
    expect(local.riveAndJitterStateMachine.states).toHaveLength(2);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 310, output_tokens: 520 },
      } as never,
      parsed: local,
    });

    const live = await runLtxBoordsCascadeurRiveAnimaticAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("deep-architecture");
    expect(live.routedModel).toBe("claude-opus-5-5");
    expect(live.report.riveAndJitterStateMachine.scrollTriggerThresholdPct).toBe(65);
  });

  it("9. Cotrans 식자 인페인팅 · VRoid 3D VRM 아바타 · Blockade Skybox 360° 월드 로컬라이저(Sonnet 5.5)를 검증한다", async () => {
    const local = buildLocalCotransVroidSkyboxWorldLocalizerReport(SAMPLE_INPUT);
    expect(local.cotransLetteringAndInpaint.inpaintingModel).toBe("lama-large-512px");
    expect(local.vroidParametricAvatar.vrmSpecVersion).toBe("VRM-1.0");
    expect(local.skybox360Environment.equirectangularResolution).toBe("8192x4096-8K");

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 230, output_tokens: 390 },
      } as never,
      parsed: local,
    });

    const live = await runCotransVroidSkyboxWorldLocalizerAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.routedModel).toBe("claude-sonnet-5-5");
    expect(live.report.cotransLetteringAndInpaint.localizedRegions).toHaveLength(2);
  });

  it("10. WonderUnit Shot Generator · Procreate Dreams 퍼포밍 · Krita Diffusion · Artbreeder 유전자 디렉터(Opus 5.5)를 검증한다", async () => {
    const local = buildLocalStoryboarderDreamsKritaArtbreederDirectorReport(SAMPLE_INPUT);
    expect(local.procreateDreamsPerformingTrack.performingRecordSamplingHz).toBe(120);
    expect(local.kritaLiveDiffusionAndArtbreederGenes.kritaControlNetStack).toHaveLength(3);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 290, output_tokens: 480 },
      } as never,
      parsed: local,
    });

    const live = await runStoryboarderDreamsKritaArtbreederDirectorAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("deep-architecture");
    expect(live.routedModel).toBe("claude-opus-5-5");
    expect(live.report.shotGeneratorAndComicFactory.inkLineCleanlinessPct).toBeGreaterThanOrEqual(90);
  });

  it("11. Niji 6 (--sref/--cref) · Civitai/Tensor/SeaArt/PixAI LoRA 스택 · Picrew/WaifuLabs/Charat 캐릭터 디렉터(Sonnet 5.5)를 검증한다", async () => {
    const local = buildLocalNijiPixaiCivitaiLoraSrefDirectorReport(SAMPLE_INPUT);
    expect(local.nijiJourneyV6Spec.nijiStyleMode).toBe("expressive");
    expect(local.civitaiPixaiTensorLoraStack.loraAdapters).toHaveLength(2);
    expect(local.waifuLabsPicrewCharatModularParts.paletteSwapHexList).toHaveLength(5);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 240, output_tokens: 390 },
      } as never,
      parsed: local,
    });

    const live = await runNijiPixaiCivitaiLoraSrefDirectorAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.routedModel).toBe("claude-sonnet-5-5");
    expect(live.report.nijiJourneyV6Spec.characterWeightCw).toBe(95);
  });

  it("12. Tripo3D/Meshy/HeroForge 3D 프롭 · Suno OST · ElevenLabs 더빙 · MANGA Plus 글로벌 OSMU 디렉터(Opus 5.5)를 검증한다", async () => {
    const local = buildLocalTripoMeshyHeroforgeSunoElevenlabsOsmuReport(SAMPLE_INPUT);
    expect(local.tripoMeshyHeroforge3dPropSpec.tripoQuadPolyCount).toBe(28_500);
    expect(local.sunoAndElevenLabsAudioScore.stemSeparationChannels).toHaveLength(4);
    expect(local.mangaPlusCreatorsGlobalRelease.localizedLanguages).toContain("en-US");

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 290, output_tokens: 470 },
      } as never,
      parsed: local,
    });

    const live = await runTripoMeshyHeroforgeSunoElevenlabsOsmuAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("deep-architecture");
    expect(live.routedModel).toBe("claude-opus-5-5");
    expect(live.report.mangaPlusCreatorsGlobalRelease.readingMode).toBe("vertical-scroll");
  });

  it("13. Runway Gen-3 · Luma · Pika · Viggle 모션 · Live2D Cubism · Spine 2D 무빙툰 디렉터(Opus 5.5)를 검증한다", async () => {
    const local = buildLocalRunwayLumaPikaViggleLive2dSpineMotionReport(SAMPLE_INPUT);
    expect(local.motionBrushAndCameraRig.runwayMotionBrushVectors).toHaveLength(2);
    expect(local.motionBrushAndCameraRig.viggleJst2MotionTransfer.commandMode).toBe("/mix");
    expect(local.live2dAndSpine2dRig.live2dArtMeshVertexCount).toBe(1840);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 300, output_tokens: 490 },
      } as never,
      parsed: local,
    });

    const live = await runRunwayLumaPikaViggleLive2dSpineMotionAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("deep-architecture");
    expect(live.routedModel).toBe("claude-opus-5-5");
    expect(live.report.live2dAndSpine2dRig.spine2dIkConstraints).toHaveLength(4);
  });

  it("14. SketchUp 3D · Blender Grease Pencil · Petalica 채색 · Magma 멀티협업 · Recraft/Cara 보호 스튜디오(Sonnet 5.5)를 검증한다", async () => {
    const local = buildLocalSketchupBlenderPetalicaMagmaRecraftStudioReport(SAMPLE_INPUT);
    expect(local.sketchupAndGreasePencil3d.greasePencilStrokeLayers).toHaveLength(4);
    expect(local.petalicaAndOpenArtColorStudio.petalicaModelStyle).toBe("Satsuki");
    expect(local.magmaRecraftCaraProduction.noAiMetaTagEnabled).toBe(true);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 250, output_tokens: 410 },
      } as never,
      parsed: local,
    });

    const live = await runSketchupBlenderPetalicaMagmaRecraftStudioAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.routedModel).toBe("claude-sonnet-5-5");
    expect(live.report.magmaRecraftCaraProduction.magmaCollaboratorRoles).toHaveLength(4);
  });

  it("15. Tapas · Tappytoon · RIDI · Postype 글로벌 연재 & Sudowrite · Novelcrafter · Campfire 코덱스(Opus 5.5)를 검증한다", async () => {
    const local = buildLocalTapasTappytoonRidiPostypeSudowriteNovelcrafterReport(SAMPLE_INPUT);
    expect(local.globalPublishingEconomics.tapasWaitUntilFreeHours).toBe(24);
    expect(local.novelToWebtoonStoryCodex.novelcrafterCodexEntries).toHaveLength(3);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 260, output_tokens: 430 },
      } as never,
      parsed: local,
    });

    const live = await runTapasTappytoonRidiPostypeSudowriteNovelcrafterAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("deep-architecture");
    expect(live.routedModel).toBe("claude-opus-5-5");
    expect(live.report.globalPublishingEconomics.postypeMembershipMonthlyKrw).toBe(9900);
  });

  it("16. Mixamo · Marvelous · Substance 3D · Coolors · 눈누/Blambot 식자 · ToonBoom/TVPaint/Moho · Eagle(Sonnet 5.5)를 검증한다", async () => {
    const local = buildLocalMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport(SAMPLE_INPUT);
    expect(local.colorHarmonyAndWebtoonTypography.coolorsAndAdobeColorMoodHexes).toHaveLength(5);
    expect(local.toonBoomTvpaintMohoAndEagleHub.eagleSmartFolderColorTags).toHaveLength(3);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 240, output_tokens: 390 },
      } as never,
      parsed: local,
    });

    const live = await runMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleAssist(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.routedModel).toBe("claude-sonnet-5-5");
    expect(live.report.colorHarmonyAndWebtoonTypography.wcagContrastRatio).toBeGreaterThanOrEqual(7);
  });

  it("17. runRea15WebtoonEcosystemFullSuite 16대 통합 번들 오케스트레이터 및 폴백 안정성을 검증한다", async () => {
    vi.mocked(claudeParse).mockRejectedValueOnce(new Error("simulated network timeout"));
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-sonnet-4-6", usage: { input_tokens: 200, output_tokens: 300 } } as never,
      parsed: buildLocalKaistorySingleEnvelopeAndKaionReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-sonnet-4-6", usage: { input_tokens: 200, output_tokens: 300 } } as never,
      parsed: buildLocalSnaptoonFrameoShaper3dDirectorReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-sonnet-4-6", usage: { input_tokens: 200, output_tokens: 300 } } as never,
      parsed: buildLocalManhwaKomikoAnifusionFlowReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-opus-4-6", usage: { input_tokens: 250, output_tokens: 400 } } as never,
      parsed: buildLocalCreativeDopamineAndUxSynthesizerReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-sonnet-4-6", usage: { input_tokens: 220, output_tokens: 340 } } as never,
      parsed: buildLocalTootoonGentoonTooningKrSuiteReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-haiku-4-5", usage: { input_tokens: 180, output_tokens: 290 } } as never,
      parsed: buildLocalKreaSplineLumiereRealtimeShaderReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-opus-4-6", usage: { input_tokens: 260, output_tokens: 420 } } as never,
      parsed: buildLocalLtxBoordsCascadeurRiveAnimaticReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-sonnet-4-6", usage: { input_tokens: 220, output_tokens: 350 } } as never,
      parsed: buildLocalCotransVroidSkyboxWorldLocalizerReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-opus-4-6", usage: { input_tokens: 270, output_tokens: 430 } } as never,
      parsed: buildLocalStoryboarderDreamsKritaArtbreederDirectorReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-sonnet-4-6", usage: { input_tokens: 230, output_tokens: 360 } } as never,
      parsed: buildLocalNijiPixaiCivitaiLoraSrefDirectorReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-opus-4-6", usage: { input_tokens: 280, output_tokens: 440 } } as never,
      parsed: buildLocalTripoMeshyHeroforgeSunoElevenlabsOsmuReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-opus-4-6", usage: { input_tokens: 290, output_tokens: 450 } } as never,
      parsed: buildLocalRunwayLumaPikaViggleLive2dSpineMotionReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-sonnet-4-6", usage: { input_tokens: 240, output_tokens: 380 } } as never,
      parsed: buildLocalSketchupBlenderPetalicaMagmaRecraftStudioReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-opus-4-6", usage: { input_tokens: 260, output_tokens: 410 } } as never,
      parsed: buildLocalTapasTappytoonRidiPostypeSudowriteNovelcrafterReport(SAMPLE_INPUT),
    });
    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: { model: "claude-sonnet-4-6", usage: { input_tokens: 240, output_tokens: 380 } } as never,
      parsed: buildLocalMixamoMarvelousCoolorsNoonnuBlambotToonboomEagleReport(SAMPLE_INPUT),
    });

    const bundle = await runRea15WebtoonEcosystemFullSuite(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(bundle.liveEngineCount).toBe(15);
    expect(bundle.fallbackEngineCount).toBe(1);
    expect(bundle.glimnaviRelightLineart.source).toBe("local-fallback");
    expect(bundle.creativeDopamineUxSynthesizer.source).toBe("claude-live");
    expect(bundle.tootoonGentoonTooningKrSuite.source).toBe("claude-live");
    expect(bundle.kreaSplineLumiereRealtimeShader.source).toBe("claude-live");
    expect(bundle.ltxBoordsCascadeurRiveAnimatic.source).toBe("claude-live");
    expect(bundle.cotransVroidSkyboxLocalizer.source).toBe("claude-live");
    expect(bundle.storyboarderDreamsKritaArtbreeder.source).toBe("claude-live");
    expect(bundle.nijiPixaiCivitaiLoraSrefDirector.source).toBe("claude-live");
    expect(bundle.tripoMeshyHeroforgeSunoElevenlabsOsmu.source).toBe("claude-live");
    expect(bundle.runwayLumaPikaViggleLive2dSpineMotion.source).toBe("claude-live");
    expect(bundle.sketchupBlenderPetalicaMagmaRecraftStudio.source).toBe("claude-live");
    expect(bundle.tapasTappytoonRidiPostypeSudowriteNovelcrafter.source).toBe("claude-live");
    expect(bundle.mixamoMarvelousCoolorsNoonnuBlambotToonboomEagle.source).toBe("claude-live");
  });
});
