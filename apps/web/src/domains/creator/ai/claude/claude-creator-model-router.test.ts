import { describe, expect, it } from "vitest";

import {
  CLAUDE_CREATOR_TASK_PROFILES,
  CLAUDE_CREATOR_TASK_ROUTES,
  resolveCreatorTaskModelRoute,
  summarizeCreatorModelRouterCatalog,
} from "./claude-creator-model-router";
import {
  runClaudeAmusementCoasterFerrisCampingSkiDirector,
  runClaudeChemistryMicroscopeCentrifugeAstronomyDirector,
  runClaudeDentalOphthalmologyXrayMarkerDirector,
  runClaudeEquestrianFalconryHorologyGemstoneDirector,
  runClaudeFilmSetClapperboardBroadcastSwitchDirector,
  runClaudeHourglassCandleScaleBookGutterPaywallDirector,
  runClaudeRotaryPhoneTurntableCameraInstantDirector,
  runClaudeSchoolCsatOmrTcgDiceMahjongDirector,
} from "./claude-alt-text";
import {
  runClaudeAnamorphicFisheyeLensOpticsDirector,
  runClaudeArcheryFencingCombatStanceCueDirector,
  runClaudeAudiotoonAdrTactileErgonomicsDirector,
  runClaudeAviationCockpitZeroGSubmarineDirector,
  runClaudeBotanicalFloraBlacksmithAlchemyDirector,
  runClaudeCastleClockwiseStairCarriageWaltzDirector,
  runClaudeCourtroomTrialPrisonHandcuffDirector,
  runClaudeCyberpunkProstheticMechaTacticalDirector,
  runClaudeDrapery7FoldsMaterialBrdfDirector,
  runClaudeEsportsHudGamerPeripheralsDirector,
  runClaudeForensicLuminolAutopsySceneDirector,
  runClaudeGachaSsrSplashRpgSkillCutsceneDirector,
  runClaudeHeavyMachinerySignboardTaxErpDirector,
  runClaudeHunterGateRaidPartyInventoryDirector,
  runClaudeKpopStageChoreoLightstickIemDirector,
  runClaudeLockedRoomAlibiCipherArchaeologyDirector,
  runClaudeOrchestraPianoGuitarTeaCalligraphyDirector,
  runClaudePocketWatchIiiiChessBadukBoardDirector,
  runClaudeRofanCorsetSashSignetEtiquetteDirector,
  runClaudeScreentoneMoireGpenHierarchyDirector,
  runClaudeShamanGutExorcismTalismanDirector,
  runClaudeSportsBiomechanicsGaitGripDirector,
  runClaudeVehicleCockpitSeatbeltDrivetrainDirector,
  runClaudeVtuberArkit52VnSpriteMerchDirector,
} from "./claude-feature-cost-cap";
import {
  runClaudeAircraftCarrierCatapultBunkerBsl4Director,
  runClaudeAnimalPupilSpider8LegOctopusSharkDirector,
  runClaudeCasinoBaccaratHoldemChipsAuctionDirector,
  runClaudeCyberTerminalServerRackCctvRooftopDirector,
  runClaudeDeepSeaSubmersibleSpacesuitCryoPodDirector,
  runClaudeGrandPianoLidViolinCigarWhiskyDirector,
  runClaudeHanokOndolBongsuWatermillMatchlockDirector,
  runClaudeHwachaGeobukseonTrebuchetJoustDirector,
  runClaudeJoseonGatBinyeoKatanaSayaDirector,
  runClaudeMensSuitBottomButtonTieHeelStrapDirector,
  runClaudeMurimPlumBlossomTangClanBaguaDirector,
  runClaudeSignLanguageHearingAidLegalDepositDirector,
  runClaudeSupercarDoorF1HaloYachtPrivateJetDirector,
  runClaudeVolcanoLavaGlacierCrevasseDesertDuneDirector,
  runClaudeXianxiaFlyingSwordInnBambooScrollDirector,
  runClaudeZombieBarricadeGasMaskLockpickLaserDirector,
} from "./claude-localize-run";
import {
  runClaudeAncientMythologyTriremeKhopeshRuneDirector,
  runClaudeAutonomous7StagePipelineDnaHashPsdDirector,
  runClaudeFloatingIslandWorldTreeDragonMimicGolemDirector,
  runClaudeKoreanMarketBunsikBbqJjimjilbangDirector,
  runClaudeKoreanMilitaryBeretK2RifleDogtagDirector,
  runClaudeKoreanWeddingPaebaekJesaHwatuTransitDirector,
  runClaudeSteampunkAirshipAutomatonDivingPlagueDirector,
  runClaudeToonstudio1020PlatformSupremeMetaDirector,
} from "./claude-art-director-run";

describe("claude-creator-model-router (Task-Aware Smart Model Router)", () => {
  it("3단계 프로필(fast-inline, creative-production, deep-architecture)을 정의하고 전체 AI 작업을 최적 모델로 매핑한다", () => {
    expect(CLAUDE_CREATOR_TASK_PROFILES["fast-inline"].model).toBe("claude-haiku-5-5");
    expect(CLAUDE_CREATOR_TASK_PROFILES["creative-production"].model).toBe("claude-sonnet-5-5");
    expect(CLAUDE_CREATOR_TASK_PROFILES["deep-architecture"].model).toBe("claude-opus-5-5");

    const summary = summarizeCreatorModelRouterCatalog();
    expect(summary.totalTasks).toBe(Object.keys(CLAUDE_CREATOR_TASK_ROUTES).length);
    expect(summary.byModel["claude-haiku-5-5"]).toBeGreaterThanOrEqual(6);
    expect(summary.byModel["claude-sonnet-5-5"]).toBeGreaterThanOrEqual(12);
    expect(summary.byModel["claude-opus-5-5"]).toBeGreaterThanOrEqual(7);
  });

  it("작업 특성에 맞춰 기본 모델과 effort를 자동 선택하고, 명시적 model 오버라이드는 그대로 존중한다", () => {
    const fastRoute = resolveCreatorTaskModelRoute("ecosystem:glimnavi-color-hint-stroke");
    expect(fastRoute.profile).toBe("fast-inline");
    expect(fastRoute.model).toBe("claude-haiku-5-5");
    expect(fastRoute.effort).toBe("low");
    expect(fastRoute.explicitOverride).toBe(false);

    const creativeRoute = resolveCreatorTaskModelRoute("ecosystem:novelai-multi-char-vibe");
    expect(creativeRoute.profile).toBe("creative-production");
    expect(creativeRoute.model).toBe("claude-sonnet-5-5");
    expect(creativeRoute.effort).toBe("low");

    const deepRoute = resolveCreatorTaskModelRoute("fusion:lore-foreshadow-integrity");
    expect(deepRoute.profile).toBe("deep-architecture");
    expect(deepRoute.model).toBe("claude-opus-5-5");
    expect(deepRoute.effort).toBe("medium");

    const overridden = resolveCreatorTaskModelRoute("ecosystem:glimnavi-color-hint-stroke", {
      model: "claude-opus-5-5",
      effort: "high",
    });
    expect(overridden.explicitOverride).toBe(true);
    expect(overridden.model).toBe("claude-opus-5-5");
    expect(overridden.effort).toBe("high");
  });

  it("웹툰 일관성 확보(Webtoon Consistency) 전용 121대 창의 AI 작업을 포함한 총 172개 라우팅 카탈로그를 검증한다", () => {
    const summary = summarizeCreatorModelRouterCatalog();
    expect(summary.totalTasks).toBe(172);
    expect(summary.byProfile["fast-inline"]).toBe(44);
    expect(summary.byProfile["creative-production"]).toBe(86);
    expect(summary.byProfile["deep-architecture"]).toBe(42);

    expect(resolveCreatorTaskModelRoute("art-director:ancient-mythology-trireme-khopesh-rune-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:korean-military-beret-k2-rifle-dogtag-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:steampunk-airship-automaton-diving-plague-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:floating-island-world-tree-dragon-mimic-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:korean-market-bunsik-bbq-jjimjilbang-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:korean-wedding-paebaek-jesa-hwatu-transit-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:autonomous-7stage-pipeline-dna-hash-psd-director").model).toBe("claude-opus-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:toonstudio-1020-platform-supreme-meta-director").model).toBe("claude-opus-5-5");

    expect(resolveCreatorTaskModelRoute("localize:murim-plum-sword-tang-clan-bagua-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("localize:xianxia-flying-sword-inn-bamboo-scroll-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("localize:casino-baccarat-holdem-chips-auction-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("localize:grand-piano-lid-violin-cigar-whisky-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("localize:supercar-door-f1-halo-yacht-jet-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("localize:deep-sea-submersible-spacesuit-cryopod-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("localize:volcano-lava-glacier-crevasse-desert-director").model).toBe("claude-opus-5-5");
    expect(resolveCreatorTaskModelRoute("localize:aircraft-carrier-catapult-bunker-bsl4-director").model).toBe("claude-opus-5-5");

    expect(resolveCreatorTaskModelRoute("localize:joseon-gat-binyeo-katana-saya-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("localize:mens-suit-button-tie-heel-eyeglass-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("localize:hwacha-geobukseon-trebuchet-joust-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("localize:hanok-ondol-bongsu-watermill-matchlock-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("localize:zombie-barricade-gasmask-lockpick-laser-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("localize:cyber-terminal-server-cctv-rooftop-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("localize:animal-pupil-spider-octopus-shark-director").model).toBe("claude-opus-5-5");
    expect(resolveCreatorTaskModelRoute("localize:sign-language-hearing-aid-isbn-archive-director").model).toBe("claude-opus-5-5");

    expect(
      resolveCreatorTaskModelRoute("localize:dental-ophthalmology-xray-marker-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:rotary-phone-turntable-camera-instant-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:chemistry-microscope-centrifuge-astronomy-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:equestrian-falconry-horology-gemstone-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:film-slate-boom-cstand-broadcast-tally-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:school-csat-omr-tcg-dice-mahjong-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:amusement-coaster-ferris-camping-ski-director").model,
    ).toBe("claude-opus-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:hourglass-candle-scale-book-paywall-director").model,
    ).toBe("claude-opus-5-5");

    expect(
      resolveCreatorTaskModelRoute("cost-cap:esports-hud-gamer-keyboard-mouse-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:courtroom-trial-prison-handcuff-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:kpop-stage-choreo-lightstick-iem-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:aviation-cockpit-zerog-submarine-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:archery-fencing-boxing-stance-cue-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:orchestra-piano-guitar-tea-calligraphy-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:botanical-flora-blacksmith-alchemy-director").model,
    ).toBe("claude-opus-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:heavy-machinery-signboard-tax-erp-director").model,
    ).toBe("claude-opus-5-5");

    expect(
      resolveCreatorTaskModelRoute("cost-cap:rofan-corset-sash-signet-etiquette-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:pocket-watch-iiii-chess-baduk-board-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:castle-clockwise-stair-carriage-waltz-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:hunter-gate-raid-party-inventory-potion-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:cyberpunk-prosthetic-mecha-nvg-molle-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:shaman-gut-exorcism-talisman-onmyoji-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:forensic-luminol-blood-spatter-autopsy-director").model,
    ).toBe("claude-opus-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:locked-room-alibi-cipher-archaeology-director").model,
    ).toBe("claude-opus-5-5");

    expect(
      resolveCreatorTaskModelRoute("cost-cap:lhd-rhd-cockpit-seatbelt-drivetrain-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:screentone-lpi-moire-gpen-hierarchy-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:anamorphic-fisheye-dutch-lens-optics-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:drapery-7folds-velvet-satin-brdf-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:sports-biomechanics-gait-grip-edge-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:vtuber-arkit52-vn-sprite-canbadge-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:gacha-ssr-splash-rpg-skill-cutscene-director").model,
    ).toBe("claude-opus-5-5");
    expect(
      resolveCreatorTaskModelRoute("cost-cap:audiotoon-adr-timecode-tactile-ergo-director").model,
    ).toBe("claude-opus-5-5");

    expect(
      resolveCreatorTaskModelRoute("localize:lunar-phase-star-conjunction-sky-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:emoticon-24pack-chibi-proportion-spec-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:quadruped-creature-hock-wing-membrane-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:k-urban-convenience-metro-rooftop-prop-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:thai-vietnamese-arabic-rtl-balloon-shaping-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:anime-settei-3tone-color-model-sheet-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:ott-live-action-8ep-showrunner-pitch-director").model,
    ).toBe("claude-opus-5-5");
    expect(
      resolveCreatorTaskModelRoute("localize:global-ip-mg-rs-royalty-waterfall-director").model,
    ).toBe("claude-opus-5-5");

    expect(
      resolveCreatorTaskModelRoute("art-director:traditional-clothing-collar-knot-goreum-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("art-director:firearm-tactical-slide-ejection-finger-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("art-director:martial-arts-qigong-meridian-aura-trajectory-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("art-director:medical-icu-vital-monitor-sterile-rig-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("art-director:culinary-knife-pinch-grip-plating-steam-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("art-director:acrylic-stand-photocard-dieline-white-plate-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("art-director:east-asian-palace-dancheong-roof-bracket-lock").model,
    ).toBe("claude-opus-5-5");
    expect(
      resolveCreatorTaskModelRoute("art-director:reader-comment-sentiment-catharsis-cliff-director").model,
    ).toBe("claude-opus-5-5");

    expect(
      resolveCreatorTaskModelRoute("production:button-zipper-belt-buckle-fastener-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:speedline-impact-frame-radial-focus-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:wound-bandage-cast-healing-stage-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:heraldry-crest-guild-emblem-geometry-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:musical-instrument-fingering-bowing-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:variable-font-balloon-diamond-copyfit-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:tankobon-print-bleed-cmyk-tac300-proof-lock").model,
    ).toBe("claude-opus-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:eyetrack-scroll-velocity-aoi-heatmap-director").model,
    ).toBe("claude-opus-5-5");

    expect(
      resolveCreatorTaskModelRoute("runner:gaze-saccade-pupil-highlight-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("runner:breath-frost-cigarette-smoke-plume-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("runner:wet-fabric-rain-translucency-drape-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("runner:cast-shadow-sundial-azimuth-elevation-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("runner:impact-debris-crater-shatter-persistence-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("runner:binaural-spatial-audio-foley-lufs-director").model,
    ).toBe("claude-opus-5-5");

    expect(
      resolveCreatorTaskModelRoute("domain:prop-screen-ui-hologram-text-consistency").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("domain:braid-ponytail-ribbon-accessory-knot-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("domain:cape-cloak-hem-lining-wind-flutter-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("domain:sword-hilt-guard-gem-scabbard-engraving-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("domain:character-age-flashback-growth-proportion-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("domain:multi-plane-parallax-depth-blur-bokeh-lock").model,
    ).toBe("claude-opus-5-5");

    expect(
      resolveCreatorTaskModelRoute("nextgen:footwear-floor-contact-stride-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("nextgen:crowd-silhouette-depth-fog-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("ecosystem:collar-tie-lapel-neckline-symmetry-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("ecosystem:tattoo-stigma-curse-mark-uv-topology-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("ecosystem:companion-pet-familiar-mascot-scale-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("ecosystem:interior-room-furniture-door-hinge-geography-lock").model,
    ).toBe("claude-opus-5-5");
    expect(
      resolveCreatorTaskModelRoute("ecosystem:scroll-pace-silent-beat-panel-height-rhythm").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("ecosystem:subsurface-scattering-skin-tear-sweat-specular-lock").model,
    ).toBe("claude-sonnet-5-5");

    expect(
      resolveCreatorTaskModelRoute("ecosystem:asymmetric-costume-prop-wound-ledger").model,
    ).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("ecosystem:camera-axis-eyeline-height-lock").model).toBe(
      "claude-opus-5-5",
    );
    expect(
      resolveCreatorTaskModelRoute("ecosystem:cross-cut-color-script-albedo-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("ecosystem:micro-expression-acting-continuity").model,
    ).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("nextgen:visual-continuity-linter").model).toBe(
      "claude-opus-5-5",
    );
    expect(resolveCreatorTaskModelRoute("nextgen:multi-episode-canon-vault").model).toBe(
      "claude-sonnet-5-5",
    );
    expect(
      resolveCreatorTaskModelRoute("competitor:turnaround-orthographic-sheet-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("competitor:background-perspective-prop-scale-lock").model,
    ).toBe("claude-opus-5-5");
    expect(
      resolveCreatorTaskModelRoute("competitor:speech-bubble-tail-occlusion-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("competitor:action-weapon-motion-arc-smear-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:multi-character-crowd-wardrobe-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:weather-particle-time-progression-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:panel-border-gutter-tension-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:hand-prop-grip-anatomy-continuity-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:hair-silhouette-ahoge-parting-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:eyewear-jewelry-reflection-rig-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:vehicle-steed-carriage-harness-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:magic-aura-elemental-sigil-geometry-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:food-tableware-banquet-prop-continuity").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:mirror-water-window-reflection-axis-lock").model,
    ).toBe("claude-opus-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:combat-bloodstain-dust-tatter-decay-lock").model,
    ).toBe("claude-sonnet-5-5");
  });

  it("Wave 33~35 8대 렌즈광학·7대주름BRDF·인체역학·망점G펜·버튜버·SSR스플래시·ADR촉각점자 감독 폴백 동작을 검증한다", async () => {
    const sample = {
      episodeTitle: "황궁 추격전과 각성",
      genre: "판타지 액션",
      scriptSummary: "아나모픽 야간 추격전 후 벨벳 망토를 휘날리며 3초 궁극기 컷신으로 보스를 격파한다.",
    };
    const r1 = await runClaudeVehicleCockpitSeatbeltDrivetrainDirector(sample, { route: null });
    const r2 = await runClaudeScreentoneMoireGpenHierarchyDirector(sample, { route: null });
    const r3 = await runClaudeAnamorphicFisheyeLensOpticsDirector(sample, { route: null });
    const r4 = await runClaudeDrapery7FoldsMaterialBrdfDirector(sample, { route: null });
    const r5 = await runClaudeSportsBiomechanicsGaitGripDirector(sample, { route: null });
    const r6 = await runClaudeVtuberArkit52VnSpriteMerchDirector(sample, { route: null });
    const r7 = await runClaudeGachaSsrSplashRpgSkillCutsceneDirector(sample, { route: null });
    const r8 = await runClaudeAudiotoonAdrTactileErgonomicsDirector(sample, { route: null });

    expect(r1.data.vehicleContinuityScore).toBeGreaterThanOrEqual(95);
    expect(r2.data.inkingIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(r3.data.lensOpticsScore).toBeGreaterThanOrEqual(95);
    expect(r4.data.fabricPhysicsScore).toBeGreaterThanOrEqual(95);
    expect(r5.data.biomechanicsScore).toBeGreaterThanOrEqual(95);
    expect(r6.data.ipAssetReadinessScore).toBeGreaterThanOrEqual(95);
    expect(r7.data.gameAdaptationScore).toBeGreaterThanOrEqual(95);
    expect(r8.data.productionAccessibilityScore).toBeGreaterThanOrEqual(95);

    const w1 = await runClaudeRofanCorsetSashSignetEtiquetteDirector(sample, { route: null });
    const w2 = await runClaudePocketWatchIiiiChessBadukBoardDirector(sample, { route: null });
    const w3 = await runClaudeCastleClockwiseStairCarriageWaltzDirector(sample, { route: null });
    const w4 = await runClaudeHunterGateRaidPartyInventoryDirector(sample, { route: null });
    const w5 = await runClaudeCyberpunkProstheticMechaTacticalDirector(sample, { route: null });
    const w6 = await runClaudeShamanGutExorcismTalismanDirector(sample, { route: null });
    const w7 = await runClaudeForensicLuminolAutopsySceneDirector(sample, { route: null });
    const w8 = await runClaudeLockedRoomAlibiCipherArchaeologyDirector(sample, { route: null });

    expect(w1.data.aristocracyEtiquetteScore).toBeGreaterThanOrEqual(95);
    expect(w2.data.propPrecisionScore).toBeGreaterThanOrEqual(95);
    expect(w3.data.historicalStagingScore).toBeGreaterThanOrEqual(95);
    expect(w4.data.dungeonContinuityScore).toBeGreaterThanOrEqual(95);
    expect(w5.data.sciFiTacticalScore).toBeGreaterThanOrEqual(95);
    expect(w6.data.occultAuthenticityScore).toBeGreaterThanOrEqual(95);
    expect(w7.data.forensicRigorScore).toBeGreaterThanOrEqual(95);
    expect(w8.data.mysteryLogicScore).toBeGreaterThanOrEqual(95);

    const x1 = await runClaudeEsportsHudGamerPeripheralsDirector(sample, { route: null });
    const x2 = await runClaudeCourtroomTrialPrisonHandcuffDirector(sample, { route: null });
    const x3 = await runClaudeKpopStageChoreoLightstickIemDirector(sample, { route: null });
    const x4 = await runClaudeAviationCockpitZeroGSubmarineDirector(sample, { route: null });
    const x5 = await runClaudeArcheryFencingCombatStanceCueDirector(sample, { route: null });
    const x6 = await runClaudeOrchestraPianoGuitarTeaCalligraphyDirector(sample, { route: null });
    const x7 = await runClaudeBotanicalFloraBlacksmithAlchemyDirector(sample, { route: null });
    const x8 = await runClaudeHeavyMachinerySignboardTaxErpDirector(sample, { route: null });

    expect(x1.data.esportsContinuityScore).toBeGreaterThanOrEqual(95);
    expect(x2.data.legalRealismScore).toBeGreaterThanOrEqual(95);
    expect(x3.data.stageProductionScore).toBeGreaterThanOrEqual(95);
    expect(x4.data.aerospacePhysicsScore).toBeGreaterThanOrEqual(95);
    expect(x5.data.martialSportsScore).toBeGreaterThanOrEqual(95);
    expect(x6.data.fineArtsRigorScore).toBeGreaterThanOrEqual(95);
    expect(x7.data.craftBotanyScore).toBeGreaterThanOrEqual(95);
    expect(x8.data.industrialErpScore).toBeGreaterThanOrEqual(95);

    const y1 = await runClaudeDentalOphthalmologyXrayMarkerDirector(sample, { route: null });
    const y2 = await runClaudeRotaryPhoneTurntableCameraInstantDirector(sample, { route: null });
    const y3 = await runClaudeChemistryMicroscopeCentrifugeAstronomyDirector(sample, { route: null });
    const y4 = await runClaudeEquestrianFalconryHorologyGemstoneDirector(sample, { route: null });
    const y5 = await runClaudeFilmSetClapperboardBroadcastSwitchDirector(sample, { route: null });
    const y6 = await runClaudeSchoolCsatOmrTcgDiceMahjongDirector(sample, { route: null });
    const y7 = await runClaudeAmusementCoasterFerrisCampingSkiDirector(sample, { route: null });
    const y8 = await runClaudeHourglassCandleScaleBookGutterPaywallDirector(sample, { route: null });

    expect(y1.data.medicalSpecialtyScore).toBeGreaterThanOrEqual(95);
    expect(y2.data.retroHardwareScore).toBeGreaterThanOrEqual(95);
    expect(y3.data.labScienceScore).toBeGreaterThanOrEqual(95);
    expect(y4.data.nobilityCraftScore).toBeGreaterThanOrEqual(95);
    expect(y5.data.broadcastSetScore).toBeGreaterThanOrEqual(95);
    expect(y6.data.campusTabletopScore).toBeGreaterThanOrEqual(95);
    expect(y7.data.leisurePhysicsScore).toBeGreaterThanOrEqual(95);
    expect(y8.data.propPhysicsPaywallScore).toBeGreaterThanOrEqual(95);

    const z1 = await runClaudeJoseonGatBinyeoKatanaSayaDirector(sample, { route: null });
    const z2 = await runClaudeMensSuitBottomButtonTieHeelStrapDirector(sample, { route: null });
    const z3 = await runClaudeHwachaGeobukseonTrebuchetJoustDirector(sample, { route: null });
    const z4 = await runClaudeHanokOndolBongsuWatermillMatchlockDirector(sample, { route: null });
    const z5 = await runClaudeZombieBarricadeGasMaskLockpickLaserDirector(sample, { route: null });
    const z6 = await runClaudeCyberTerminalServerRackCctvRooftopDirector(sample, { route: null });
    const z7 = await runClaudeAnimalPupilSpider8LegOctopusSharkDirector(sample, { route: null });
    const z8 = await runClaudeSignLanguageHearingAidLegalDepositDirector(sample, { route: null });

    expect(z1.data.traditionalAccessoryIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z2.data.modernTailoringIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z3.data.siegeWarfareIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z4.data.historicalTechIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z5.data.survivalTacticalIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z6.data.urbanInfraIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z7.data.zoologicalAnatomyIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z8.data.inclusivityAndArchiveIntegrityScore).toBeGreaterThanOrEqual(95);

    const m1 = await runClaudeMurimPlumBlossomTangClanBaguaDirector(sample, { route: null });
    const m2 = await runClaudeXianxiaFlyingSwordInnBambooScrollDirector(sample, { route: null });
    const m3 = await runClaudeCasinoBaccaratHoldemChipsAuctionDirector(sample, { route: null });
    const m4 = await runClaudeGrandPianoLidViolinCigarWhiskyDirector(sample, { route: null });
    const m5 = await runClaudeSupercarDoorF1HaloYachtPrivateJetDirector(sample, { route: null });
    const m6 = await runClaudeDeepSeaSubmersibleSpacesuitCryoPodDirector(sample, { route: null });
    const m7 = await runClaudeVolcanoLavaGlacierCrevasseDesertDuneDirector(sample, { route: null });
    const m8 = await runClaudeAircraftCarrierCatapultBunkerBsl4Director(sample, { route: null });

    expect(m1.data.murimSectIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(m2.data.orientalFantasyStagingScore).toBeGreaterThanOrEqual(95);
    expect(m3.data.highSocietyGamingScore).toBeGreaterThanOrEqual(95);
    expect(m4.data.luxuryConnoisseurScore).toBeGreaterThanOrEqual(95);
    expect(m5.data.prestigeMobilityScore).toBeGreaterThanOrEqual(95);
    expect(m6.data.extremeHabitatScore).toBeGreaterThanOrEqual(95);
    expect(m7.data.planetaryGeophysicsScore).toBeGreaterThanOrEqual(95);
    expect(m8.data.strategicFacilityScore).toBeGreaterThanOrEqual(95);

    const n1 = await runClaudeAncientMythologyTriremeKhopeshRuneDirector(sample, { route: null });
    const n2 = await runClaudeKoreanMilitaryBeretK2RifleDogtagDirector(sample, { route: null });
    const n3 = await runClaudeSteampunkAirshipAutomatonDivingPlagueDirector(sample, { route: null });
    const n4 = await runClaudeFloatingIslandWorldTreeDragonMimicGolemDirector(sample, { route: null });
    const n5 = await runClaudeKoreanMarketBunsikBbqJjimjilbangDirector(sample, { route: null });
    const n6 = await runClaudeKoreanWeddingPaebaekJesaHwatuTransitDirector(sample, { route: null });
    const n7 = await runClaudeAutonomous7StagePipelineDnaHashPsdDirector(sample, { route: null });
    const n8 = await runClaudeToonstudio1020PlatformSupremeMetaDirector(sample, { route: null });

    expect(n1.data.mythologyAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(n2.data.militaryAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(n3.data.steampunkAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(n4.data.fantasyWorldAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(n5.data.koreanLifeAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(n6.data.traditionTransitScore).toBeGreaterThanOrEqual(95);
    expect(n7.data.pipelineAutonomyScore).toBeGreaterThanOrEqual(95);
    expect(n8.data.supremeMetaScore).toBeGreaterThanOrEqual(95);
  });
});
