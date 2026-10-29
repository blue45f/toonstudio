import { describe, expect, it } from "vitest";

import {
  ASSIST_CREATOR_TASK_PROFILES,
  ASSIST_CREATOR_TASK_ROUTES,
  resolveCreatorTaskModelRoute,
  summarizeCreatorModelRouterCatalog,
} from "./assist-creator-model-router";
import {
  runAssistAmusementCoasterFerrisCampingSkiDirector,
  runAssistChemistryMicroscopeCentrifugeAstronomyDirector,
  runAssistDentalOphthalmologyXrayMarkerDirector,
  runAssistEquestrianFalconryHorologyGemstoneDirector,
  runAssistFilmSetClapperboardBroadcastSwitchDirector,
  runAssistHourglassCandleScaleBookGutterPaywallDirector,
  runAssistRotaryPhoneTurntableCameraInstantDirector,
  runAssistSchoolCsatOmrTcgDiceMahjongDirector,
} from "./assist-alt-text";
import {
  runAssistAnamorphicFisheyeLensOpticsDirector,
  runAssistArcheryFencingCombatStanceCueDirector,
  runAssistAudiotoonAdrTactileErgonomicsDirector,
  runAssistAviationCockpitZeroGSubmarineDirector,
  runAssistBotanicalFloraBlacksmithAlchemyDirector,
  runAssistCastleClockwiseStairCarriageWaltzDirector,
  runAssistCourtroomTrialPrisonHandcuffDirector,
  runAssistCyberpunkProstheticMechaTacticalDirector,
  runAssistDrapery7FoldsMaterialBrdfDirector,
  runAssistEsportsHudGamerPeripheralsDirector,
  runAssistForensicLuminolAutopsySceneDirector,
  runAssistGachaSsrSplashRpgSkillCutsceneDirector,
  runAssistHeavyMachinerySignboardTaxErpDirector,
  runAssistHunterGateRaidPartyInventoryDirector,
  runAssistKpopStageChoreoLightstickIemDirector,
  runAssistLockedRoomAlibiCipherArchaeologyDirector,
  runAssistOrchestraPianoGuitarTeaCalligraphyDirector,
  runAssistPocketWatchIiiiChessBadukBoardDirector,
  runAssistRofanCorsetSashSignetEtiquetteDirector,
  runAssistScreentoneMoireGpenHierarchyDirector,
  runAssistShamanGutExorcismTalismanDirector,
  runAssistSportsBiomechanicsGaitGripDirector,
  runAssistVehicleCockpitSeatbeltDrivetrainDirector,
  runAssistVtuberArkit52VnSpriteMerchDirector,
} from "./assist-feature-cost-cap";
import {
  runAssistAircraftCarrierCatapultBunkerBsl4Director,
  runAssistAnimalPupilSpider8LegOctopusSharkDirector,
  runAssistCasinoBaccaratHoldemChipsAuctionDirector,
  runAssistCyberTerminalServerRackCctvRooftopDirector,
  runAssistDeepSeaSubmersibleSpacesuitCryoPodDirector,
  runAssistGrandPianoLidViolinCigarWhiskyDirector,
  runAssistHanokOndolBongsuWatermillMatchlockDirector,
  runAssistHwachaGeobukseonTrebuchetJoustDirector,
  runAssistJoseonGatBinyeoKatanaSayaDirector,
  runAssistMensSuitBottomButtonTieHeelStrapDirector,
  runAssistMurimPlumBlossomTangClanBaguaDirector,
  runAssistSignLanguageHearingAidLegalDepositDirector,
  runAssistSupercarDoorF1HaloYachtPrivateJetDirector,
  runAssistVolcanoLavaGlacierCrevasseDesertDuneDirector,
  runAssistXianxiaFlyingSwordInnBambooScrollDirector,
  runAssistZombieBarricadeGasMaskLockpickLaserDirector,
} from "./assist-localize-run";
import {
  runAssistAgeOfSailGalleonWheelCannonCutlassDirector,
  runAssistAncientMythologyTriremeKhopeshRuneDirector,
  runAssistAutonomous7StagePipelineDnaHashPsdDirector,
  runAssistFloatingIslandWorldTreeDragonMimicGolemDirector,
  runAssistGitDiffKanbanDiscordSuperchatShortsSafezoneDirector,
  runAssistKoreanMarketBunsikBbqJjimjilbangDirector,
  runAssistKoreanMilitaryBeretK2RifleDogtagDirector,
  runAssistKoreanWeddingPaebaekJesaHwatuTransitDirector,
  runAssistNoirTrenchcoatFedoraVenetianBlindSpyDirector,
  runAssistSteampunkAirshipAutomatonDivingPlagueDirector,
  runAssistStreamerMicRingLightCintiqBlenderNodeDirector,
  runAssistSurgicalLightEcmoTriageBloodBagBdnaDirector,
  runAssistSuspensionBridgeArchKeystoneHanokDoorTbmDirector,
  runAssistToonstudio1020PlatformSupremeMetaDirector,
  runAssistToonstudio1080OmniverseDcfStrokeSupremeDirector,
  runAssistWesternRevolverWinchesterSaloonLocomotiveDirector,
} from "./assist-art-director-run";
import {
  runAssist3dgsNerfControlnet4FacsSfx3dSaccadeDirector,
  runAssistBangpaeyeonSsireumSatbaTaekkyeonMaedeupDirector,
  runAssistCrossover1000EpParadoxWrinkleBakerSfxRedrawDirector,
  runAssistDavyLampRickshawDivingDressSwitchboardSundialDirector,
  runAssistEnigmaMorseDarkroomLetterpressPhonographDirector,
  runAssistF1KerbWrcRollcageSkydivingSurfingYachtDirector,
  runAssistGlassblowingLuthierDiamondLoupeShoemakerDirector,
  runAssistHahoeMaskLianpuKabukiTogaThuribleDirector,
  runAssistJangdokdaeKimjangHanjiOnggiNajeonchilgiDirector,
  runAssistJongmyoGayageumGeomungoDaegeumJangguDirector,
  runAssistMarshallerLighthouseAntarcticObservatoryClockDirector,
  runAssistOceanLiner4FunnelStreetcarBiplaneSemaphoreDirector,
  runAssistPipeOrganPedalHarpAccordionBagpipeDirector,
  runAssistToonstudio1140HyperSynthesisLegalOstDirector,
  runAssistToonstudio1200GrandMillenniumSimulpubChromaDirector,
  runAssistWineBarriqueCheeseJamonChocolatePotStillDirector,
} from "./assist-alt-text-run";

describe("assist-creator-model-router (Task-Aware Smart Model Router)", () => {
  it("3단계 프로필(fast-inline, creative-production, deep-architecture)을 정의하고 전체 AI 작업을 최적 모델로 매핑한다", () => {
    expect(ASSIST_CREATOR_TASK_PROFILES["fast-inline"].model).toBe("claude-haiku-5-5");
    expect(ASSIST_CREATOR_TASK_PROFILES["creative-production"].model).toBe("claude-sonnet-5-5");
    expect(ASSIST_CREATOR_TASK_PROFILES["deep-architecture"].model).toBe("claude-opus-5-5");

    const summary = summarizeCreatorModelRouterCatalog();
    expect(summary.totalTasks).toBe(Object.keys(ASSIST_CREATOR_TASK_ROUTES).length);
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

  it("웹툰 일관성 확보(Webtoon Consistency) 전용 145대 창의 AI 작업을 포함한 총 196개 라우팅 카탈로그를 검증한다", () => {
    const summary = summarizeCreatorModelRouterCatalog();
    expect(summary.totalTasks).toBe(196);
    expect(summary.byProfile["fast-inline"]).toBe(50);
    expect(summary.byProfile["creative-production"]).toBe(98);
    expect(summary.byProfile["deep-architecture"]).toBe(48);

    expect(resolveCreatorTaskModelRoute("alt-text:enigma-morse-darkroom-letterpress-phonograph-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:ocean-liner-4funnel-streetcar-biplane-semaphore-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:davy-lamp-rickshaw-diving-dress-switchboard-sundial-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:jangdokdae-kimjang-hanji-onggi-najeonchilgi-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:wine-barrique-cheese-jamon-chocolate-pot-still-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:bangpaeyeon-ssireum-satba-taekkyeon-maedeup-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:crossover-1000ep-paradox-wrinkle-baker-sfx-redraw-director").model).toBe("claude-opus-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:toonstudio-1200-grand-millennium-simulpub-chroma-director").model).toBe("claude-opus-5-5");

    expect(resolveCreatorTaskModelRoute("alt-text:jongmyo-gayageum-geomungo-daegeum-janggu-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:hahoe-mask-lianpu-kabuki-toga-thurible-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:pipe-organ-pedal-harp-accordion-bagpipe-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:f1-kerb-wrc-rollcage-skydiving-surfing-yacht-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:marshaller-lighthouse-antarctic-observatory-clock-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:glassblowing-luthier-diamond-loupe-shoemaker-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:3dgs-nerf-controlnet4-facs-sfx3d-saccade-director").model).toBe("claude-opus-5-5");
    expect(resolveCreatorTaskModelRoute("alt-text:toonstudio-1140-hyper-synthesis-legal-ost-director").model).toBe("claude-opus-5-5");

    expect(resolveCreatorTaskModelRoute("art-director:age-of-sail-galleon-wheel-cannon-cutlass-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:western-revolver-winchester-saloon-locomotive-lock").model).toBe("claude-haiku-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:noir-trenchcoat-fedora-venetian-blind-spy-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:surgical-light-ecmo-triage-blood-bag-bdna-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:suspension-bridge-arch-keystone-hanok-door-tbm-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:streamer-mic-ringlight-cintiq-blender-node-lock").model).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:git-diff-kanban-discord-superchat-shorts-director").model).toBe("claude-opus-5-5");
    expect(resolveCreatorTaskModelRoute("art-director:toonstudio-1080-omniverse-dcf-stroke-supreme-director").model).toBe("claude-opus-5-5");

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
    const r1 = await runAssistVehicleCockpitSeatbeltDrivetrainDirector(sample, { route: null });
    const r2 = await runAssistScreentoneMoireGpenHierarchyDirector(sample, { route: null });
    const r3 = await runAssistAnamorphicFisheyeLensOpticsDirector(sample, { route: null });
    const r4 = await runAssistDrapery7FoldsMaterialBrdfDirector(sample, { route: null });
    const r5 = await runAssistSportsBiomechanicsGaitGripDirector(sample, { route: null });
    const r6 = await runAssistVtuberArkit52VnSpriteMerchDirector(sample, { route: null });
    const r7 = await runAssistGachaSsrSplashRpgSkillCutsceneDirector(sample, { route: null });
    const r8 = await runAssistAudiotoonAdrTactileErgonomicsDirector(sample, { route: null });

    expect(r1.data.vehicleContinuityScore).toBeGreaterThanOrEqual(95);
    expect(r2.data.inkingIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(r3.data.lensOpticsScore).toBeGreaterThanOrEqual(95);
    expect(r4.data.fabricPhysicsScore).toBeGreaterThanOrEqual(95);
    expect(r5.data.biomechanicsScore).toBeGreaterThanOrEqual(95);
    expect(r6.data.ipAssetReadinessScore).toBeGreaterThanOrEqual(95);
    expect(r7.data.gameAdaptationScore).toBeGreaterThanOrEqual(95);
    expect(r8.data.productionAccessibilityScore).toBeGreaterThanOrEqual(95);

    const w1 = await runAssistRofanCorsetSashSignetEtiquetteDirector(sample, { route: null });
    const w2 = await runAssistPocketWatchIiiiChessBadukBoardDirector(sample, { route: null });
    const w3 = await runAssistCastleClockwiseStairCarriageWaltzDirector(sample, { route: null });
    const w4 = await runAssistHunterGateRaidPartyInventoryDirector(sample, { route: null });
    const w5 = await runAssistCyberpunkProstheticMechaTacticalDirector(sample, { route: null });
    const w6 = await runAssistShamanGutExorcismTalismanDirector(sample, { route: null });
    const w7 = await runAssistForensicLuminolAutopsySceneDirector(sample, { route: null });
    const w8 = await runAssistLockedRoomAlibiCipherArchaeologyDirector(sample, { route: null });

    expect(w1.data.aristocracyEtiquetteScore).toBeGreaterThanOrEqual(95);
    expect(w2.data.propPrecisionScore).toBeGreaterThanOrEqual(95);
    expect(w3.data.historicalStagingScore).toBeGreaterThanOrEqual(95);
    expect(w4.data.dungeonContinuityScore).toBeGreaterThanOrEqual(95);
    expect(w5.data.sciFiTacticalScore).toBeGreaterThanOrEqual(95);
    expect(w6.data.occultAuthenticityScore).toBeGreaterThanOrEqual(95);
    expect(w7.data.forensicRigorScore).toBeGreaterThanOrEqual(95);
    expect(w8.data.mysteryLogicScore).toBeGreaterThanOrEqual(95);

    const x1 = await runAssistEsportsHudGamerPeripheralsDirector(sample, { route: null });
    const x2 = await runAssistCourtroomTrialPrisonHandcuffDirector(sample, { route: null });
    const x3 = await runAssistKpopStageChoreoLightstickIemDirector(sample, { route: null });
    const x4 = await runAssistAviationCockpitZeroGSubmarineDirector(sample, { route: null });
    const x5 = await runAssistArcheryFencingCombatStanceCueDirector(sample, { route: null });
    const x6 = await runAssistOrchestraPianoGuitarTeaCalligraphyDirector(sample, { route: null });
    const x7 = await runAssistBotanicalFloraBlacksmithAlchemyDirector(sample, { route: null });
    const x8 = await runAssistHeavyMachinerySignboardTaxErpDirector(sample, { route: null });

    expect(x1.data.esportsContinuityScore).toBeGreaterThanOrEqual(95);
    expect(x2.data.legalRealismScore).toBeGreaterThanOrEqual(95);
    expect(x3.data.stageProductionScore).toBeGreaterThanOrEqual(95);
    expect(x4.data.aerospacePhysicsScore).toBeGreaterThanOrEqual(95);
    expect(x5.data.martialSportsScore).toBeGreaterThanOrEqual(95);
    expect(x6.data.fineArtsRigorScore).toBeGreaterThanOrEqual(95);
    expect(x7.data.craftBotanyScore).toBeGreaterThanOrEqual(95);
    expect(x8.data.industrialErpScore).toBeGreaterThanOrEqual(95);

    const y1 = await runAssistDentalOphthalmologyXrayMarkerDirector(sample, { route: null });
    const y2 = await runAssistRotaryPhoneTurntableCameraInstantDirector(sample, { route: null });
    const y3 = await runAssistChemistryMicroscopeCentrifugeAstronomyDirector(sample, { route: null });
    const y4 = await runAssistEquestrianFalconryHorologyGemstoneDirector(sample, { route: null });
    const y5 = await runAssistFilmSetClapperboardBroadcastSwitchDirector(sample, { route: null });
    const y6 = await runAssistSchoolCsatOmrTcgDiceMahjongDirector(sample, { route: null });
    const y7 = await runAssistAmusementCoasterFerrisCampingSkiDirector(sample, { route: null });
    const y8 = await runAssistHourglassCandleScaleBookGutterPaywallDirector(sample, { route: null });

    expect(y1.data.medicalSpecialtyScore).toBeGreaterThanOrEqual(95);
    expect(y2.data.retroHardwareScore).toBeGreaterThanOrEqual(95);
    expect(y3.data.labScienceScore).toBeGreaterThanOrEqual(95);
    expect(y4.data.nobilityCraftScore).toBeGreaterThanOrEqual(95);
    expect(y5.data.broadcastSetScore).toBeGreaterThanOrEqual(95);
    expect(y6.data.campusTabletopScore).toBeGreaterThanOrEqual(95);
    expect(y7.data.leisurePhysicsScore).toBeGreaterThanOrEqual(95);
    expect(y8.data.propPhysicsPaywallScore).toBeGreaterThanOrEqual(95);

    const z1 = await runAssistJoseonGatBinyeoKatanaSayaDirector(sample, { route: null });
    const z2 = await runAssistMensSuitBottomButtonTieHeelStrapDirector(sample, { route: null });
    const z3 = await runAssistHwachaGeobukseonTrebuchetJoustDirector(sample, { route: null });
    const z4 = await runAssistHanokOndolBongsuWatermillMatchlockDirector(sample, { route: null });
    const z5 = await runAssistZombieBarricadeGasMaskLockpickLaserDirector(sample, { route: null });
    const z6 = await runAssistCyberTerminalServerRackCctvRooftopDirector(sample, { route: null });
    const z7 = await runAssistAnimalPupilSpider8LegOctopusSharkDirector(sample, { route: null });
    const z8 = await runAssistSignLanguageHearingAidLegalDepositDirector(sample, { route: null });

    expect(z1.data.traditionalAccessoryIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z2.data.modernTailoringIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z3.data.siegeWarfareIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z4.data.historicalTechIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z5.data.survivalTacticalIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z6.data.urbanInfraIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z7.data.zoologicalAnatomyIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(z8.data.inclusivityAndArchiveIntegrityScore).toBeGreaterThanOrEqual(95);

    const m1 = await runAssistMurimPlumBlossomTangClanBaguaDirector(sample, { route: null });
    const m2 = await runAssistXianxiaFlyingSwordInnBambooScrollDirector(sample, { route: null });
    const m3 = await runAssistCasinoBaccaratHoldemChipsAuctionDirector(sample, { route: null });
    const m4 = await runAssistGrandPianoLidViolinCigarWhiskyDirector(sample, { route: null });
    const m5 = await runAssistSupercarDoorF1HaloYachtPrivateJetDirector(sample, { route: null });
    const m6 = await runAssistDeepSeaSubmersibleSpacesuitCryoPodDirector(sample, { route: null });
    const m7 = await runAssistVolcanoLavaGlacierCrevasseDesertDuneDirector(sample, { route: null });
    const m8 = await runAssistAircraftCarrierCatapultBunkerBsl4Director(sample, { route: null });

    expect(m1.data.murimSectIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(m2.data.orientalFantasyStagingScore).toBeGreaterThanOrEqual(95);
    expect(m3.data.highSocietyGamingScore).toBeGreaterThanOrEqual(95);
    expect(m4.data.luxuryConnoisseurScore).toBeGreaterThanOrEqual(95);
    expect(m5.data.prestigeMobilityScore).toBeGreaterThanOrEqual(95);
    expect(m6.data.extremeHabitatScore).toBeGreaterThanOrEqual(95);
    expect(m7.data.planetaryGeophysicsScore).toBeGreaterThanOrEqual(95);
    expect(m8.data.strategicFacilityScore).toBeGreaterThanOrEqual(95);

    const n1 = await runAssistAncientMythologyTriremeKhopeshRuneDirector(sample, { route: null });
    const n2 = await runAssistKoreanMilitaryBeretK2RifleDogtagDirector(sample, { route: null });
    const n3 = await runAssistSteampunkAirshipAutomatonDivingPlagueDirector(sample, { route: null });
    const n4 = await runAssistFloatingIslandWorldTreeDragonMimicGolemDirector(sample, { route: null });
    const n5 = await runAssistKoreanMarketBunsikBbqJjimjilbangDirector(sample, { route: null });
    const n6 = await runAssistKoreanWeddingPaebaekJesaHwatuTransitDirector(sample, { route: null });
    const n7 = await runAssistAutonomous7StagePipelineDnaHashPsdDirector(sample, { route: null });
    const n8 = await runAssistToonstudio1020PlatformSupremeMetaDirector(sample, { route: null });

    expect(n1.data.mythologyAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(n2.data.militaryAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(n3.data.steampunkAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(n4.data.fantasyWorldAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(n5.data.koreanLifeAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(n6.data.traditionTransitScore).toBeGreaterThanOrEqual(95);
    expect(n7.data.pipelineAutonomyScore).toBeGreaterThanOrEqual(95);
    expect(n8.data.supremeMetaScore).toBeGreaterThanOrEqual(95);

    const p1 = await runAssistAgeOfSailGalleonWheelCannonCutlassDirector(sample, { route: null });
    const p2 = await runAssistWesternRevolverWinchesterSaloonLocomotiveDirector(sample, { route: null });
    const p3 = await runAssistNoirTrenchcoatFedoraVenetianBlindSpyDirector(sample, { route: null });
    const p4 = await runAssistSurgicalLightEcmoTriageBloodBagBdnaDirector(sample, { route: null });
    const p5 = await runAssistSuspensionBridgeArchKeystoneHanokDoorTbmDirector(sample, { route: null });
    const p6 = await runAssistStreamerMicRingLightCintiqBlenderNodeDirector(sample, { route: null });
    const p7 = await runAssistGitDiffKanbanDiscordSuperchatShortsSafezoneDirector(sample, { route: null });
    const p8 = await runAssistToonstudio1080OmniverseDcfStrokeSupremeDirector(sample, { route: null });

    expect(p1.data.ageOfSailAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(p2.data.westernFrontierScore).toBeGreaterThanOrEqual(95);
    expect(p3.data.noirEspionageScore).toBeGreaterThanOrEqual(95);
    expect(p4.data.biomedicalRigorScore).toBeGreaterThanOrEqual(95);
    expect(p5.data.civilArchIntegrityScore).toBeGreaterThanOrEqual(95);
    expect(p6.data.creatorHardwareScore).toBeGreaterThanOrEqual(95);
    expect(p7.data.digitalPlatformUxScore).toBeGreaterThanOrEqual(95);
    expect(p8.data.omniverseSupremeScore).toBeGreaterThanOrEqual(95);

    const q1 = await runAssistJongmyoGayageumGeomungoDaegeumJangguDirector(sample, { route: null });
    const q2 = await runAssistHahoeMaskLianpuKabukiTogaThuribleDirector(sample, { route: null });
    const q3 = await runAssistPipeOrganPedalHarpAccordionBagpipeDirector(sample, { route: null });
    const q4 = await runAssistF1KerbWrcRollcageSkydivingSurfingYachtDirector(sample, { route: null });
    const q5 = await runAssistMarshallerLighthouseAntarcticObservatoryClockDirector(sample, { route: null });
    const q6 = await runAssistGlassblowingLuthierDiamondLoupeShoemakerDirector(sample, { route: null });
    const q7 = await runAssist3dgsNerfControlnet4FacsSfx3dSaccadeDirector(sample, { route: null });
    const q8 = await runAssistToonstudio1140HyperSynthesisLegalOstDirector(sample, { route: null });

    expect(q1.data.koreanCourtMusicAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(q2.data.ritualTheaterAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(q3.data.classicalInstrumentScore).toBeGreaterThanOrEqual(95);
    expect(q4.data.extremeMotorsportAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(q5.data.specialFacilityAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(q6.data.masterArtisanCraftScore).toBeGreaterThanOrEqual(95);
    expect(q7.data.neuralRenderingPipelineScore).toBeGreaterThanOrEqual(95);
    expect(q8.data.hyperSynthesisMasterScore).toBeGreaterThanOrEqual(95);

    const s1 = await runAssistEnigmaMorseDarkroomLetterpressPhonographDirector(sample, { route: null });
    const s2 = await runAssistOceanLiner4FunnelStreetcarBiplaneSemaphoreDirector(sample, { route: null });
    const s3 = await runAssistDavyLampRickshawDivingDressSwitchboardSundialDirector(sample, { route: null });
    const s4 = await runAssistJangdokdaeKimjangHanjiOnggiNajeonchilgiDirector(sample, { route: null });
    const s5 = await runAssistWineBarriqueCheeseJamonChocolatePotStillDirector(sample, { route: null });
    const s6 = await runAssistBangpaeyeonSsireumSatbaTaekkyeonMaedeupDirector(sample, { route: null });
    const s7 = await runAssistCrossover1000EpParadoxWrinkleBakerSfxRedrawDirector(sample, { route: null });
    const s8 = await runAssistToonstudio1200GrandMillenniumSimulpubChromaDirector(sample, { route: null });

    expect(s1.data.vintageHardwareAccuracyScore).toBeGreaterThanOrEqual(95);
    expect(s2.data.earlyAviationTransportScore).toBeGreaterThanOrEqual(95);
    expect(s3.data.industrialAgePropScore).toBeGreaterThanOrEqual(95);
    expect(s4.data.koreanTraditionalCraftScore).toBeGreaterThanOrEqual(95);
    expect(s5.data.gastronomyFermentationCraftScore).toBeGreaterThanOrEqual(95);
    expect(s6.data.koreanFolkSportCraftScore).toBeGreaterThanOrEqual(95);
    expect(s7.data.advancedPipelineIntelligenceScore).toBeGreaterThanOrEqual(95);
    expect(s8.data.grandMillenniumMasterScore).toBeGreaterThanOrEqual(95);
  });
});
