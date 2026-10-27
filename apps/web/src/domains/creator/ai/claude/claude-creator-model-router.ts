export type ClaudeModelId =
  | "claude-haiku-5-5"
  | "claude-sonnet-5-5"
  | "claude-opus-5-5";

export type ClaudeEffortLevel = "low" | "medium" | "high";

export interface ClaudeCreateOptions {
  readonly model?: ClaudeModelId | (string & {});
  readonly effort?: ClaudeEffortLevel;
  readonly maxTokens?: number;
  readonly temperature?: number;
}
export type CreatorClaudeTaskId = ClaudeCreatorTaskId;

/**
 * 작업 특성별 최적의 Claude 모델 티어를 자동 배정하는 Task-Aware Smart Model Router.
 *
 * 무조건 최고가 모델(Opus 5.5)을 강제하지 않고, 각 AI 보조 기능의 추론 복잡도·응답 지연시간·
 * 크레딧 효율에 맞춰 3단계 프로필(`fast-inline`, `creative-production`, `deep-architecture`)로
 * 자동 라우팅합니다. 호출자가 `options.model`을 명시한 경우에는 호출자의 선택을 그대로 존중합니다.
 */
export type ClaudeCreatorTaskProfile =
  | "fast-inline"
  | "creative-production"
  | "deep-architecture";

export type ClaudeCreatorTaskDomain =
  | "core-dialog"
  | "storyboard-production"
  | "nextgen-studio"
  | "competitor-suite"
  | "phase6-ecosystem"
  | "engine-fusion"
  | "n7-llm-runner"
  | "art-director"
  | "localize";

export type ClaudeCreatorTaskId =
  // 1. Core Dialogs (4)
  | "core:art-director"
  | "core:command-plan"
  | "core:localize"
  | "core:alt-text"
  // 2. Storyboard & Production Suite (16)
  | "production:storyboard-cut-breakdown"
  | "production:scroll-rhythm-doctor"
  | "production:color-mood-script"
  | "production:continuity-foreshadow"
  | "production:sfx-typo-director"
  | "production:multi-character-crowd-wardrobe-lock"
  | "production:weather-particle-time-progression-lock"
  | "production:panel-border-gutter-tension-lock"
  | "production:hand-prop-grip-anatomy-continuity-lock"
  | "production:hair-silhouette-ahoge-parting-lock"
  | "production:eyewear-jewelry-reflection-rig-lock"
  | "production:vehicle-steed-carriage-harness-lock"
  | "production:magic-aura-elemental-sigil-geometry-lock"
  | "production:food-tableware-banquet-prop-continuity"
  | "production:mirror-water-window-reflection-axis-lock"
  | "production:combat-bloodstain-dust-tatter-decay-lock"
  // 3. Next-Gen Suite (8)
  | "nextgen:retention-simulator"
  | "nextgen:ooc-voice-doctor"
  | "nextgen:audio-cuesheet-director"
  | "nextgen:3d-asset-placement"
  | "nextgen:visual-continuity-linter"
  | "nextgen:multi-episode-canon-vault"
  | "nextgen:footwear-floor-contact-stride-lock"
  | "nextgen:crowd-silhouette-depth-fog-lock"
  // 4. Phase 5 Competitor Full Suite (7)
  | "competitor:beluga-clipstudio-production"
  | "competitor:onoma-kakaopage-ip"
  | "competitor:llamagen-manga-ai"
  | "competitor:turnaround-orthographic-sheet-lock"
  | "competitor:background-perspective-prop-scale-lock"
  | "competitor:speech-bubble-tail-occlusion-lock"
  | "competitor:action-weapon-motion-arc-smear-lock"
  // 5. Phase 6 Global & Domestic 20-Competitor + Webtoon Consistency Ecosystem Suite (10)
  | "ecosystem:novelai-multi-char-vibe"
  | "ecosystem:mangaflow-identity-verification"
  | "ecosystem:glimnavi-color-hint-stroke"
  | "ecosystem:snaptoon-3d-environment-shader"
  | "ecosystem:novel-adaptation-ip-expansion"
  | "ecosystem:tooncrafter-inbetween-stitch"
  | "ecosystem:asymmetric-costume-prop-wound-ledger"
  | "ecosystem:camera-axis-eyeline-height-lock"
  | "ecosystem:cross-cut-color-script-albedo-lock"
  | "ecosystem:micro-expression-acting-continuity"
  // 6. Phase 6 Domain Engine Fusion (4)
  | "fusion:localization-qa-copyfit"
  | "fusion:sfx-envelope-warp"
  | "fusion:tension-pacing-doctor"
  | "fusion:lore-foreshadow-integrity"
  // 7. N7 & Master Storyboard Runners (9)
  | "runner:master-storyboard-pipeline"
  | "runner:story-seed"
  | "runner:plot-development"
  | "runner:writer-room"
  | "runner:canon-consistency"
  | "runner:dialogue-suggest"
  | "runner:dialogue-translate"
  | "runner:prompt-enhancer"
  | "runner:shading-assist"
  // 8. Phase 7 REA 100-Platform Deep Internalization & Creative AI Suite (16)
  | "rea15:glimnavi-relight-lineart-v23"
  | "rea15:kaistory-single-envelope-kaion-quiz"
  | "rea15:snaptoon-frameo-shaper-3d-lighting"
  | "rea15:manhwa-komiko-anifusion-flow"
  | "rea15:creative-dopamine-scroll-ux-synthesizer"
  | "rea15:tootoon-gentoon-tooning-kr-suite"
  | "rea15:krea-spline-lumiere-realtime-shader"
  | "rea15:ltx-boords-cascadeur-rive-animatic"
  | "rea15:cotrans-vroid-skybox-world-localizer"
  | "rea15:storyboarder-dreams-krita-artbreeder-director"
  | "rea15:niji-pixai-civitai-lora-sref-director"
  | "rea15:tripo-meshy-heroforge-suno-elevenlabs-osmu"
  | "rea15:runway-luma-pika-viggle-live2d-spine-motion"
  | "rea15:sketchup-blender-petalica-magma-recraft-studio"
  | "rea15:tapas-tappytoon-ridi-postype-sudowrite-novelcrafter"
  | "rea15:mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle"
  // 9. Wave 15~17 Webtoon Consistency & Production AI Engines (6 — Total 80 Tasks)
  | "ecosystem:collar-tie-lapel-neckline-symmetry-lock"
  | "ecosystem:tattoo-stigma-curse-mark-uv-topology-lock"
  | "ecosystem:companion-pet-familiar-mascot-scale-lock"
  | "ecosystem:interior-room-furniture-door-hinge-geography-lock"
  | "ecosystem:scroll-pace-silent-beat-panel-height-rhythm"
  | "ecosystem:subsurface-scattering-skin-tear-sweat-specular-lock"
  // 10. Wave 18~20 Webtoon Consistency & Production AI Engines (6 — Total 86 Tasks)
  | "domain:prop-screen-ui-hologram-text-consistency"
  | "domain:braid-ponytail-ribbon-accessory-knot-lock"
  | "domain:cape-cloak-hem-lining-wind-flutter-lock"
  | "domain:sword-hilt-guard-gem-scabbard-engraving-lock"
  | "domain:character-age-flashback-growth-proportion-lock"
  | "domain:multi-plane-parallax-depth-blur-bokeh-lock"
  // 11. Wave 21~23 Webtoon Consistency & Audio/Physics AI Engines (6 — Total 92 Tasks)
  | "runner:gaze-saccade-pupil-highlight-lock"
  | "runner:breath-frost-cigarette-smoke-plume-lock"
  | "runner:wet-fabric-rain-translucency-drape-lock"
  | "runner:cast-shadow-sundial-azimuth-elevation-lock"
  | "runner:impact-debris-crater-shatter-persistence-lock"
  | "runner:binaural-spatial-audio-foley-lufs-director"
  // 12. Wave 24~26 Webtoon Consistency, Heraldry, Prepress & Eyetrack AI Engines (8 — Total 100 Tasks)
  | "production:button-zipper-belt-buckle-fastener-lock"
  | "production:speedline-impact-frame-radial-focus-lock"
  | "production:wound-bandage-cast-healing-stage-lock"
  | "production:heraldry-crest-guild-emblem-geometry-lock"
  | "production:musical-instrument-fingering-bowing-lock"
  | "production:variable-font-balloon-diamond-copyfit-lock"
  | "production:tankobon-print-bleed-cmyk-tac300-proof-lock"
  | "production:eyetrack-scroll-velocity-aoi-heatmap-director"
  // 13. Wave 27~29 Traditional/Tactical/Medical/Culinary/Merch/Sentiment AI Engines (8 — Total 108 Tasks)
  | "art-director:traditional-clothing-collar-knot-goreum-lock"
  | "art-director:firearm-tactical-slide-ejection-finger-lock"
  | "art-director:martial-arts-qigong-meridian-aura-trajectory-lock"
  | "art-director:medical-icu-vital-monitor-sterile-rig-lock"
  | "art-director:culinary-knife-pinch-grip-plating-steam-lock"
  | "art-director:acrylic-stand-photocard-dieline-white-plate-lock"
  | "art-director:east-asian-palace-dancheong-roof-bracket-lock"
  | "art-director:reader-comment-sentiment-catharsis-cliff-director"
  // 14. Wave 30~32 Creature/Urban/RTL-Shaping/AnimeSettei/OTT/Royalty AI Engines (8 — Total 116 Tasks)
  | "localize:lunar-phase-star-conjunction-sky-lock"
  | "localize:emoticon-24pack-chibi-proportion-spec-lock"
  | "localize:quadruped-creature-hock-wing-membrane-lock"
  | "localize:k-urban-convenience-metro-rooftop-prop-lock"
  | "localize:thai-vietnamese-arabic-rtl-balloon-shaping-lock"
  | "localize:anime-settei-3tone-color-model-sheet-lock"
  | "localize:ott-live-action-8ep-showrunner-pitch-director"
  | "localize:global-ip-mg-rs-royalty-waterfall-director"
  // 15. Wave 33~35 LensOptics/DraperyBRDF/SportsBiomech/ScreentoneGpen/VTuberRPG/AudiotoonErgo AI Engines (8 — Total 124 Tasks)
  | "cost-cap:lhd-rhd-cockpit-seatbelt-drivetrain-lock"
  | "cost-cap:screentone-lpi-moire-gpen-hierarchy-lock"
  | "cost-cap:anamorphic-fisheye-dutch-lens-optics-lock"
  | "cost-cap:drapery-7folds-velvet-satin-brdf-lock"
  | "cost-cap:sports-biomechanics-gait-grip-edge-lock"
  | "cost-cap:vtuber-arkit52-vn-sprite-canbadge-lock"
  | "cost-cap:gacha-ssr-splash-rpg-skill-cutscene-director"
  | "cost-cap:audiotoon-adr-timecode-tactile-ergo-director"
  // 16. Wave 36~38 RoFanAristocracy/CastleWaltz/HunterRaid/CyberpunkTactical/ShamanOccult/ForensicMystery AI Engines (8 — Total 132 Tasks)
  | "cost-cap:rofan-corset-sash-signet-etiquette-lock"
  | "cost-cap:pocket-watch-iiii-chess-baduk-board-lock"
  | "cost-cap:castle-clockwise-stair-carriage-waltz-lock"
  | "cost-cap:hunter-gate-raid-party-inventory-potion-lock"
  | "cost-cap:cyberpunk-prosthetic-mecha-nvg-molle-lock"
  | "cost-cap:shaman-gut-exorcism-talisman-onmyoji-lock"
  | "cost-cap:forensic-luminol-blood-spatter-autopsy-director"
  | "cost-cap:locked-room-alibi-cipher-archaeology-director"
  // 17. Wave 39~41 Esports/Courtroom/KpopStage/Aerospace/MartialSports/FineArts/BotanyCraft/HeavyMachineryErp AI Engines (8 — Total 140 Tasks)
  | "cost-cap:esports-hud-gamer-keyboard-mouse-lock"
  | "cost-cap:courtroom-trial-prison-handcuff-lock"
  | "cost-cap:kpop-stage-choreo-lightstick-iem-lock"
  | "cost-cap:aviation-cockpit-zerog-submarine-lock"
  | "cost-cap:archery-fencing-boxing-stance-cue-lock"
  | "cost-cap:orchestra-piano-guitar-tea-calligraphy-lock"
  | "cost-cap:botanical-flora-blacksmith-alchemy-director"
  | "cost-cap:heavy-machinery-signboard-tax-erp-director"
  // 18. Wave 42~44 DentalXray/RetroHardware/LabScience/EquestrianHorology/FilmBroadcast/CampusTabletop/AmusementSki/PropPaywall AI Engines (8 — Total 148 Tasks)
  | "localize:dental-ophthalmology-xray-marker-lock"
  | "localize:rotary-phone-turntable-camera-instant-lock"
  | "localize:chemistry-microscope-centrifuge-astronomy-lock"
  | "localize:equestrian-falconry-horology-gemstone-lock"
  | "localize:film-slate-boom-cstand-broadcast-tally-lock"
  | "localize:school-csat-omr-tcg-dice-mahjong-lock"
  | "localize:amusement-coaster-ferris-camping-ski-director"
  | "localize:hourglass-candle-scale-book-paywall-director"
  // 19. Wave 45~47 JoseonGatKatana/MensSuitHeel/SiegeHwacha/HanokOndol/ZombieLockpick/CyberServerCctv/ZoologyPupil/SignLanguageIsbn AI Engines (8 — Total 156 Tasks)
  | "localize:joseon-gat-binyeo-katana-saya-lock"
  | "localize:mens-suit-button-tie-heel-eyeglass-lock"
  | "localize:hwacha-geobukseon-trebuchet-joust-lock"
  | "localize:hanok-ondol-bongsu-watermill-matchlock-lock"
  | "localize:zombie-barricade-gasmask-lockpick-laser-lock"
  | "localize:cyber-terminal-server-cctv-rooftop-lock"
  | "localize:animal-pupil-spider-octopus-shark-director"
  | "localize:sign-language-hearing-aid-isbn-archive-director"
  // 20. Wave 48~50 MurimPlumBagua/XianxiaSwordInn/CasinoHoldemAuction/GrandPianoWhisky/SupercarF1Yacht/DeepSeaSpacesuit/VolcanoGlacierDesert/CarrierBunkerBsl4 AI Engines (8 — Total 164 Tasks)
  | "localize:murim-plum-sword-tang-clan-bagua-lock"
  | "localize:xianxia-flying-sword-inn-bamboo-scroll-lock"
  | "localize:casino-baccarat-holdem-chips-auction-lock"
  | "localize:grand-piano-lid-violin-cigar-whisky-lock"
  | "localize:supercar-door-f1-halo-yacht-jet-lock"
  | "localize:deep-sea-submersible-spacesuit-cryopod-lock"
  | "localize:volcano-lava-glacier-crevasse-desert-director"
  | "localize:aircraft-carrier-catapult-bunker-bsl4-director"
  // 21. Wave 51~53 AncientMythology/KoreanMilitary/SteampunkAirship/FloatingIslandDragon/KoreanMarketBbq/KoreanWeddingHwatu/Autonomous7StagePipeline/Supreme1020Meta AI Engines (8 — Total 172 Tasks)
  | "art-director:ancient-mythology-trireme-khopesh-rune-lock"
  | "art-director:korean-military-beret-k2-rifle-dogtag-lock"
  | "art-director:steampunk-airship-automaton-diving-plague-lock"
  | "art-director:floating-island-world-tree-dragon-mimic-lock"
  | "art-director:korean-market-bunsik-bbq-jjimjilbang-lock"
  | "art-director:korean-wedding-paebaek-jesa-hwatu-transit-lock"
  | "art-director:autonomous-7stage-pipeline-dna-hash-psd-director"
  | "art-director:toonstudio-1020-platform-supreme-meta-director"
  // 22. Wave 54~56 AgeOfSail/WesternLocomotive/NoirSpy/SurgicalBdna/BridgeKeystoneHanok/StreamerBlender/GitKanbanSuperchat/Omniverse1080Supreme AI Engines (8 — Total 180 Tasks)
  | "art-director:age-of-sail-galleon-wheel-cannon-cutlass-lock"
  | "art-director:western-revolver-winchester-saloon-locomotive-lock"
  | "art-director:noir-trenchcoat-fedora-venetian-blind-spy-lock"
  | "art-director:surgical-light-ecmo-triage-blood-bag-bdna-lock"
  | "art-director:suspension-bridge-arch-keystone-hanok-door-tbm-lock"
  | "art-director:streamer-mic-ringlight-cintiq-blender-node-lock"
  | "art-director:git-diff-kanban-discord-superchat-shorts-director"
  | "art-director:toonstudio-1080-omniverse-dcf-stroke-supreme-director"
  // 23. Wave 57~59 JongmyoGayageum/HahoeLianpuToga/PipeOrganHarp/F1WrcSkydiving/MarshallerLighthouseClock/GlassblowingLuthierLoupe/3dgsNerfControlnet4Facs/HyperSynthesis1140LegalOst AI Engines (8 — Total 188 Tasks)
  | "alt-text:jongmyo-gayageum-geomungo-daegeum-janggu-lock"
  | "alt-text:hahoe-mask-lianpu-kabuki-toga-thurible-lock"
  | "alt-text:pipe-organ-pedal-harp-accordion-bagpipe-lock"
  | "alt-text:f1-kerb-wrc-rollcage-skydiving-surfing-yacht-lock"
  | "alt-text:marshaller-lighthouse-antarctic-observatory-clock-lock"
  | "alt-text:glassblowing-luthier-diamond-loupe-shoemaker-lock"
  | "alt-text:3dgs-nerf-controlnet4-facs-sfx3d-saccade-director"
  | "alt-text:toonstudio-1140-hyper-synthesis-legal-ost-director";

export interface ClaudeCreatorProfileSpec {
  readonly profile: ClaudeCreatorTaskProfile;
  readonly labelKo: string;
  readonly model: ClaudeModelId;
  readonly effort: ClaudeEffortLevel;
  readonly defaultMaxTokens: number;
  readonly defaultTemperature: number;
  readonly summaryKo: string;
}

export const CLAUDE_CREATOR_TASK_PROFILES: Readonly<
  Record<ClaudeCreatorTaskProfile, ClaudeCreatorProfileSpec>
> = Object.freeze({
  "fast-inline": {
    profile: "fast-inline",
    labelKo: "초고속 인라인 보조 (Haiku 5.5)",
    model: "claude-haiku-5-5",
    effort: "low",
    defaultMaxTokens: 3_072,
    defaultTemperature: 0.2,
    summaryKo:
      "캔버스 조작·대체 텍스트·단문 대사 윤문·효과음 워프·채색 힌트·3D 툰셰이더 프리셋 등 즉각적인 인라인 반응이 중요한 작업",
  },
  "creative-production": {
    profile: "creative-production",
    labelKo: "표준 크리에이티브 연출·검수 (Sonnet 5.5)",
    model: "claude-sonnet-5-5",
    effort: "low",
    defaultMaxTokens: 4_096,
    defaultTemperature: 0.25,
    summaryKo:
      "콘티 컷 분해·아트 디렉팅·다국어 카피피팅·스크롤 호흡/텐션 진단·다중 캐릭터 공간 분리·인비트윈 동화 설계 등 균형 잡힌 연출 작업",
  },
  "deep-architecture": {
    profile: "deep-architecture",
    labelKo: "심층 서사·세계관·IP 아키텍처 (Opus 5.5)",
    model: "claude-opus-5-5",
    effort: "medium",
    defaultMaxTokens: 6_144,
    defaultTemperature: 0.3,
    summaryKo:
      "장편 세계관 로어/복선 무결성 감사·웹소설 원작 각색 및 2차 IP OSMU 확장·독자 이탈률 예측·6사 마스터 콘티 설계 등 고난도 다중 제약 추론 작업",
  },
});

export interface ClaudeCreatorTaskRoute {
  readonly taskId: ClaudeCreatorTaskId;
  readonly labelKo: string;
  readonly domain: ClaudeCreatorTaskDomain;
  readonly profile: ClaudeCreatorTaskProfile;
  readonly model: ClaudeModelId;
  readonly effort: ClaudeEffortLevel;
  readonly maxTokens: number;
  readonly rationaleKo: string;
}

function defineRoute(
  taskId: ClaudeCreatorTaskId,
  labelKo: string,
  domain: ClaudeCreatorTaskDomain,
  profile: ClaudeCreatorTaskProfile,
  rationaleKo: string,
  maxTokensOverride?: number,
): ClaudeCreatorTaskRoute {
  const spec = CLAUDE_CREATOR_TASK_PROFILES[profile];
  return Object.freeze({
    taskId,
    labelKo,
    domain,
    profile,
    model: spec.model,
    effort: spec.effort,
    maxTokens: maxTokensOverride ?? spec.defaultMaxTokens,
    rationaleKo,
  });
}

export const CLAUDE_CREATOR_TASK_ROUTES: Readonly<
  Record<ClaudeCreatorTaskId, ClaudeCreatorTaskRoute>
> = Object.freeze({
  // 1. Core Dialogs
  "core:art-director": defineRoute("core:art-director", "AI 아트 디렉터 피드백", "core-dialog", "creative-production", "페이지 구도·명암·4레이어 액션 매핑은 Sonnet 5.5의 시각 연출 분석이 최적", 2_048),
  "core:command-plan": defineRoute("core:command-plan", "AI 자연어 캔버스 커맨드 플랜", "core-dialog", "fast-inline", "자연어 명령→캔버스 액션 변환은 지연시간 최소화를 위해 Haiku 5.5 배치", 1_536),
  "core:localize": defineRoute("core:localize", "AI 다국어 식자·문화권 번역", "core-dialog", "creative-production", "문화권 뉘앙스 보존 및 42자 말풍선 예산 준수는 Sonnet 5.5가 최적", 2_048),
  "core:alt-text": defineRoute("core:alt-text", "AI 접근성 대체 텍스트·오디오툰 내레이션", "core-dialog", "fast-inline", "컷별 대체 텍스트 및 오디오 내레이션 생성은 Haiku 5.5로 빠르게 처리", 1_200),

  // 2. Storyboard & Production Suite
  "production:storyboard-cut-breakdown": defineRoute("production:storyboard-cut-breakdown", "웹툰 컷 콘티 브레이크다운", "storyboard-production", "creative-production", "대본→컷 구도·카메라·조명·말풍선 분해는 Sonnet 5.5 표준 연출 티어", 2_560),
  "production:scroll-rhythm-doctor": defineRoute("production:scroll-rhythm-doctor", "모바일 스크롤 호흡·시선 유도 닥터", "storyboard-production", "creative-production", "390×844 뷰포트 여백·시선 S-curve 진단은 Sonnet 5.5 적용", 2_048),
  "production:color-mood-script": defineRoute("production:color-mood-script", "컬러·조명 무드 스크립트 디렉터", "storyboard-production", "creative-production", "감정선 기반 HEX 팔레트·4레이어 조명 설계는 Sonnet 5.5 적용", 2_048),
  "production:continuity-foreshadow": defineRoute("production:continuity-foreshadow", "설정 연속성·복선 감수 어시스턴트", "storyboard-production", "deep-architecture", "다중 컷 의상·소품 연속성 및 복선 회수 감수는 Opus 5.5 심층 추론 적용", 3_072),
  "production:sfx-typo-director": defineRoute("production:sfx-typo-director", "효과음(SFX)·타이포 연출 디렉터", "storyboard-production", "creative-production", "의성어/의태어 타이포그래피·워프·배치 연출은 Sonnet 5.5 적용", 2_048),
  "production:multi-character-crowd-wardrobe-lock": defineRoute("production:multi-character-crowd-wardrobe-lock", "다중 등장인물·조연·엑스트라 제복/문장(Crest)/계급장 복식 규율 일관성 디렉터", "storyboard-production", "creative-production", "학원·황궁·기사단·길드 제복 컬러코드·견장/휘장 위치·신분별 소품 혼선 차단은 Sonnet 5.5 적용", 3_072),
  "production:weather-particle-time-progression-lock": defineRoute("production:weather-particle-time-progression-lock", "컷간 날씨(비·눈·안개)·젖은 머리카락/의상 투과도·시간 경과(그림자 길이·노을→야간) 물리 연속성 고정기", "storyboard-production", "fast-inline", "컷간 강우/강설 파티클 밀도·젖은 의상/모발 광택 지속 시간·태양 고도각에 따른 그림자 비율 잠금은 Haiku 5.5 적용", 2_560),
  "production:panel-border-gutter-tension-lock": defineRoute("production:panel-border-gutter-tension-lock", "컷 테두리(사선·오버랩·프레임리스 블리드) 두께 & 컷간 여백(Gutter) 배경색 그라데이션 연속성 디렉터", "storyboard-production", "fast-inline", "긴장도에 따른 컷 테두리 두께/기울기(Deg)·프레임 돌파(Pop-out) 레이어·컷간 여백(Gutter) 그라데이션 색상 잠금은 Haiku 5.5 적용", 2_560),
  "production:hand-prop-grip-anatomy-continuity-lock": defineRoute("production:hand-prop-grip-anatomy-continuity-lock", "손가락 관절 해부학·소품 파지법(검자루·찻잔·스마트폰 Grip) & 양손 교대 연속성 고정기", "storyboard-production", "creative-production", "AI 작화에서 가장 흔한 육손/관절 역꺾임 방지·소품별 정밀 파지(Grip) 해부학·컷간 주손(왼손/오른손) 반전 차단은 Sonnet 5.5 적용", 3_584),
  "production:hair-silhouette-ahoge-parting-lock": defineRoute("production:hair-silhouette-ahoge-parting-lock", "캐릭터 헤어 실루엣·가르마(좌/우 Parting)·바보털(Ahoge)·뒷머리 기장 & 바람 탄성 일관성 고정기", "storyboard-production", "fast-inline", "컷간 앞머리 가르마 좌우 반전 방지·시그니처 바보털(Ahoge)/옆머리 가닥 수·뒷머리 기장 비율 고정은 Haiku 5.5 적용", 2_560),
  "production:eyewear-jewelry-reflection-rig-lock": defineRoute("production:eyewear-jewelry-reflection-rig-lock", "안경테·모노클·귀걸이·티아라·목걸이 금속 반사율(Specular) & 귀/콧대 착용 접점(Anchor) 연속성 고정기", "storyboard-production", "fast-inline", "모노클 체인 위치·안경다리 귀걸이 접점 증발 방지·보석 굴절/금박 하이라이트 레이어 잠금은 Haiku 5.5 적용", 2_560),
  "production:vehicle-steed-carriage-harness-lock": defineRoute("production:vehicle-steed-carriage-harness-lock", "말(마필)·마차·자동차·메카닉 탑승물 스케일 & 고삐/안장/운전석 착석 자세(Seated Posture) 연속성 감독", "storyboard-production", "creative-production", "로판 마차/전투마 등자·고삐 파지·차량 좌핸들/우핸들 규격 및 탑승자 상체 비례 일관성은 Sonnet 5.5 적용", 3_584),
  "production:magic-aura-elemental-sigil-geometry-lock": defineRoute("production:magic-aura-elemental-sigil-geometry-lock", "마법진(Sigil) 기하 문양·오러(Aura) 색상/파티클 궤적·속성 이펙트 발광 레이어(Add/Glow) 일관성 디렉터", "storyboard-production", "creative-production", "캐릭터 고유 마법진 다각형 꼭짓점 수·룬 문자 링·검기/오러 코어-글로우 HEX 색온도 고정은 Sonnet 5.5 적용", 3_584),
  "production:food-tableware-banquet-prop-continuity": defineRoute("production:food-tableware-banquet-prop-continuity", "로판 다과회·현대 카페·주점 식기(찻잔/커틀러리/디저트) 배치 & 섭취 진행도(음료 수위) 연속성 고정기", "storyboard-production", "fast-inline", "대화 컷 사이 찻잔/와인잔 수위 역전 방지·포크/나이프 좌우 위치·테이블 소품 증발 차단은 Haiku 5.5 적용", 2_560),
  "production:mirror-water-window-reflection-axis-lock": defineRoute("production:mirror-water-window-reflection-axis-lock", "거울·유리창·수면 반사상(Reflection) 시점 벡터·좌우 대칭축 & 반투명 프레넬(Fresnel) 물리 일관성 감독", "storyboard-production", "deep-architecture", "거울/유리창/수면에 비친 인물의 시점 법선 벡터·비대칭 흉터/가르마의 반사 대칭 규칙·프레넬 투과율 감사는 Opus 5.5 적용", 4_096),
  "production:combat-bloodstain-dust-tatter-decay-lock": defineRoute("production:combat-bloodstain-dust-tatter-decay-lock", "전투 혈흔(Blood Spatter)·먼지/그을음·의상 찢어짐(Tatter) 비가역 누적 & 세탁/치유 시점 타임라인 원장 감독", "storyboard-production", "creative-production", "전투 컷 진행에 따른 혈흔/그을음/소매 파열의 비가역 누적 및 치유/환복 전 자동 초기화 방지는 Sonnet 5.5 적용", 3_584),

  // 3. Next-Gen Suite
  "nextgen:retention-simulator": defineRoute("nextgen:retention-simulator", "독자 이탈 구간·별점 예측 시뮬레이터", "nextgen-studio", "deep-architecture", "컷별 스크롤 잔존율·쿠키 결제 전환율 예측은 Opus 5.5 심층 추론 적용", 3_072),
  "nextgen:ooc-voice-doctor": defineRoute("nextgen:ooc-voice-doctor", "캐릭터 보이스 OOC(캐붕) 실시간 교정기", "nextgen-studio", "creative-production", "화자별 존대/반말 레지스터 및 말버릇 교정은 Sonnet 5.5 적용", 2_048),
  "nextgen:audio-cuesheet-director": defineRoute("nextgen:audio-cuesheet-director", "웹툰 BGM·오디오툰 큐시트 디렉터", "nextgen-studio", "creative-production", "스크롤 구간별 BGM BPM·폴리 사운드·성우 디렉팅은 Sonnet 5.5 적용", 2_048),
  "nextgen:3d-asset-placement": defineRoute("nextgen:3d-asset-placement", "3D 배경·소품·카메라 렌즈 배치 추천기", "nextgen-studio", "creative-production", "18~85mm 렌즈 화각·소실점·3D 에셋 배치는 Sonnet 5.5 적용", 2_048),
  "nextgen:visual-continuity-linter": defineRoute("nextgen:visual-continuity-linter", "전 회차 컷간 작붕(비대칭 흉터·검집 반전·소품 증발·부상 초기화·그림자 방향) 자동 검출 린터", "nextgen-studio", "deep-architecture", "다중 컷 사이의 해부학적 좌우 반전·소품 증발·배경 투시·부상 누적 불일치 정밀 감사는 Opus 5.5 심층 추론 적용", 4_096),
  "nextgen:multi-episode-canon-vault": defineRoute("nextgen:multi-episode-canon-vault", "장편 연재(1~100화) 캐릭터·세계관·복선·비주얼 캐논 메모리 볼트 디렉터", "nextgen-studio", "creative-production", "회차 간 시간 경과·인물 호칭·복장/외형 변천사·미회수 떡밥 캐논 볼트 동기화는 Sonnet 5.5 적용", 4_096),
  "nextgen:footwear-floor-contact-stride-lock": defineRoute("nextgen:footwear-floor-contact-stride-lock", "구두·부츠·군화 굽 높이(Heel Height) & 계단/경사로/바닥 접지 보폭(Stride Mechanics) 연속성 감독", "nextgen-studio", "fast-inline", "컷간 신발 굽 높이·부츠 버클/끈 디테일 증발 방지 및 계단/경사로 발바닥 접지 각도 고정은 Haiku 5.5 적용", 2_560),
  "nextgen:crowd-silhouette-depth-fog-lock": defineRoute("nextgen:crowd-silhouette-depth-fog-lock", "전경·중경·원경 군중(Crowd) 실루엣 밀도 & 대기 원근(Atmospheric Depth Fog)·선 굵기 감쇠 일관성 감독", "nextgen-studio", "creative-production", "주연(1.0x)·중경 엑스트라(0.65x)·원경 군중(0.35x) 선 굵기 계층 및 대기 원근 안개 채도 감쇠 고정은 Sonnet 5.5 적용", 3_584),

  // 4. Phase 5 Competitor Full Suite
  "competitor:beluga-clipstudio-production": defineRoute("competitor:beluga-clipstudio-production", "벨루가 & 클립스튜디오 7공정·포즈·음영 디렉터", "competitor-suite", "creative-production", "7단계 작화 공정·3D 관절 포즈·그림자 해칭 설계는 Sonnet 5.5 적용", 2_560),
  "competitor:onoma-kakaopage-ip": defineRoute("competitor:onoma-kakaopage-ip", "오노마AI & 카카오페이지 IP 가치·런칭 패키저", "competitor-suite", "deep-architecture", "글로벌 팬덤 타깃·2차 영상화 가치·키비주얼/트레일러 설계는 Opus 5.5 적용", 3_072),
  "competitor:llamagen-manga-ai": defineRoute("competitor:llamagen-manga-ai", "LlamaGen & 다쉬툰 만화 스크린톤·페이지 변환기", "competitor-suite", "creative-production", "세로 웹툰→출판 만화 페이지 레이아웃·모아레 방지 스크린톤 설계는 Sonnet 5.5 적용", 2_560),
  "competitor:turnaround-orthographic-sheet-lock": defineRoute("competitor:turnaround-orthographic-sheet-lock", "360° 5뷰(정면·좌/우 측면·후면·반측면) 턴어라운드 정투영 비율 & 장신구/문양 기하 일관성 고정기", "competitor-suite", "creative-production", "5방향 정투영 등신대 기준선(정수리·눈·어깨·골반·발끝) 정렬 및 비대칭 장신구/등문양 360도 기하 락은 Sonnet 5.5 적용", 3_584),
  "competitor:background-perspective-prop-scale-lock": defineRoute("competitor:background-perspective-prop-scale-lock", "3D 배경 투시 그리드(1/2/3점 소실점) ↔ 2D 인물 발 접지(Foot Contact) · 가구/문틀/소품 인체 비례 일관성 감독", "competitor-suite", "deep-architecture", "3D 배경 지평선(Eye-Line)·소실점과 2D 캐릭터 발바닥 접지 각도·문틀/책상/마차 대비 인체 스케일 왜곡 교정은 Opus 5.5 적용", 4_096),
  "competitor:speech-bubble-tail-occlusion-lock": defineRoute("competitor:speech-bubble-tail-occlusion-lock", "말풍선·효과음(SFX) 안면/눈빛/핵심 액션 비가림(Anti-Occlusion) 안전 영역 & 화자 입 방향 꼬리 벡터 고정기", "competitor-suite", "fast-inline", "인물 얼굴·동공·손동작 가림 0% 보장 여백 좌표 계산 및 화자 입 중심 말풍선 꼬리 벡터 잠금은 Haiku 5.5 적용", 2_560),
  "competitor:action-weapon-motion-arc-smear-lock": defineRoute("competitor:action-weapon-motion-arc-smear-lock", "검격·마법·타격 궤적(Motion Arc) 연속성 · 잔상(Smear Frame) · 타격 역경직(Hit-Stop) 물리 일관성 감독", "competitor-suite", "creative-production", "연속 전투 컷 사이의 검기 궤적 벡터 일치·잔상(Smear) 왜곡률·집중선 수렴점·역경직 연출은 Sonnet 5.5 적용", 3_584),

  // 5. Phase 6 Global & Domestic 20-Competitor + Webtoon Consistency Ecosystem Suite
  "ecosystem:novelai-multi-char-vibe": defineRoute(
    "ecosystem:novelai-multi-char-vibe",
    "NovelAI V4.5/V5 다중 캐릭터 공간 좌표 & Vibe Transfer 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "2인 이상 캐릭터 X/Y 바운딩박스 분리·속성 혼선 차단·Vibe Transfer·로어북 트리거는 Sonnet 5.5 적용",
    4_096,
  ),
  "ecosystem:mangaflow-identity-verification": defineRoute(
    "ecosystem:mangaflow-identity-verification",
    "MangaFlow & DiffSensei 캐릭터 동일성 검증·말풍선 꼬리 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "Grounding DINO + ArcFace 동일성 점수 진단 및 화자 입 위치 벡터 꼬리 배치는 Sonnet 5.5 적용",
    4_096,
  ),
  "ecosystem:glimnavi-color-hint-stroke": defineRoute(
    "ecosystem:glimnavi-color-hint-stroke",
    "그림나비(Glimnavi) 브러시 컬러 힌트 스트로크 자동 채색 디렉터",
    "phase6-ecosystem",
    "fast-inline",
    "선화 끊김(Gap) 허용치 및 영역별 브러시 색상 힌트 스트로크 좌표 추천은 Haiku 5.5로 즉각 응답",
    3_072,
  ),
  "ecosystem:snaptoon-3d-environment-shader": defineRoute(
    "ecosystem:snaptoon-3d-environment-shader",
    "스냅툰(Snaptoon) & 에이콘3D 배경 툰셰이더·환경광 디렉터",
    "phase6-ecosystem",
    "fast-inline",
    "3D 배경 시간대별 태양광·창문 발광·블룸·안개·저장 카메라 북마크 매칭은 Haiku 5.5로 즉각 응답",
    3_072,
  ),
  "ecosystem:novel-adaptation-ip-expansion": defineRoute(
    "ecosystem:novel-adaptation-ip-expansion",
    "더컬쳐툰·마이닝5000·Storyflow 웹소설 각색 & 2차 IP OSMU 디렉터",
    "phase6-ecosystem",
    "deep-architecture",
    "웹소설 산문 압축 각색·서사 아키타입 매핑·드라마/애니/게임/오디오웹툰 OSMU 스코어카드는 Opus 5.5 적용",
    6_144,
  ),
  "ecosystem:tooncrafter-inbetween-stitch": defineRoute(
    "ecosystem:tooncrafter-inbetween-stitch",
    "ToonCrafter 인비트윈 동화 보간 & Krita/Comistitch 무한 캔버스 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "시작·끝 키프레임 중간 동화 보간·Krita 인페인팅 마스크·Comistitch 안전 분할선 계산은 Sonnet 5.5 적용",
    4_096,
  ),
  "ecosystem:asymmetric-costume-prop-wound-ledger": defineRoute(
    "ecosystem:asymmetric-costume-prop-wound-ledger",
    "비대칭 복식·흉터·무기 파지 비례·부상 누적 연속성 원장 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "신체 좌우(Anatomical L/R) 기준 비대칭 흉터·견장·검집 미러링 방지 및 손 대비 무기 스케일·부상 누적 락은 Sonnet 5.5 적용",
    4_096,
  ),
  "ecosystem:camera-axis-eyeline-height-lock": defineRoute(
    "ecosystem:camera-axis-eyeline-height-lock",
    "180도 시선 축(180° Rule)·다중 인물 키 차이(Height Delta)·원근 소실점 일관성 감독",
    "phase6-ecosystem",
    "deep-architecture",
    "컷간 180도 카메라 축 침범 방지·로우/하이앵글 신장 차이 원근 보정·오버더숄더 시선 벡터 감사는 Opus 5.5 적용",
    4_096,
  ),
  "ecosystem:cross-cut-color-script-albedo-lock": defineRoute(
    "ecosystem:cross-cut-color-script-albedo-lock",
    "컷간 피부톤·의상 고유색(Albedo) 드리프트 방지 & 시간대 환경광(LUT) 일관성 고정기",
    "phase6-ecosystem",
    "fast-inline",
    "컷간 캐릭터 고유색(Albedo HEX)과 역광/야간 색온도(Kelvin) 분리 및 Delta-E 색상 흔들림 제어는 Haiku 5.5 적용",
    3_072,
  ),
  "ecosystem:micro-expression-acting-continuity": defineRoute(
    "ecosystem:micro-expression-acting-continuity",
    "컷간 미세 표정(FACS 근육)·시선 궤적·호흡 감정선 연속성 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "연속된 대화/액션 컷 사이의 안면 근육(FACS)·동공 수축·시선 이동 궤적·감정 관성 설계는 Sonnet 5.5 적용",
    4_096,
  ),

  // 6. Phase 6 Domain Engine Fusion
  "fusion:localization-qa-copyfit": defineRoute(
    "fusion:localization-qa-copyfit",
    "MQM 다국어 번역 품질 감사 & 말풍선 넘침 무손실 카피피팅 어시스턴트",
    "engine-fusion",
    "creative-production",
    "결정적 MQM/Overflow 게이트 위에서 넘침·금칙 위반 대사만 정밀 카피피팅하므로 Sonnet 5.5가 최적",
    4_096,
  ),
  "fusion:sfx-envelope-warp": defineRoute(
    "fusion:sfx-envelope-warp",
    "웹툰 효과음(SFX) 렉시콘 & Catmull-Rom 엔벨로프 왜곡 디렉터",
    "engine-fusion",
    "fast-inline",
    "48종 SFX 사전 검색 + 10종 Catmull-Rom 엔벨로프 왜곡 파라미터 생성은 Haiku 5.5로 초고속 처리",
    3_072,
  ),
  "fusion:tension-pacing-doctor": defineRoute(
    "fusion:tension-pacing-doctor",
    "텐션 맵 & 모바일 스크롤 페이싱 시뮬레이터 연동 연출 닥터",
    "engine-fusion",
    "creative-production",
    "drag/rush/climax 구간 여백·컷 높이·포즈 프리셋 보정 및 전후 재시뮬레이션은 Sonnet 5.5 적용",
    4_096,
  ),
  "fusion:lore-foreshadow-integrity": defineRoute(
    "fusion:lore-foreshadow-integrity",
    "홀로크론 세계관 로어·복선 장부·콩코던스 통합 무결성 감사관",
    "engine-fusion",
    "deep-architecture",
    "세계관 선점 충돌·만기 미회수 복선 회수 대사·원고 교정 패치 생성은 Opus 5.5 심층 추론 적용",
    6_144,
  ),

  // 7. N7 & Master Storyboard Runners
  "runner:master-storyboard-pipeline": defineRoute(
    "runner:master-storyboard-pipeline",
    "6사 벤치마크 통합 마스터 콘티 파이프라인",
    "n7-llm-runner",
    "deep-architecture",
    "6대 경쟁사 통합 마스터 콘티·세계관·레이어 설계는 Opus 5.5 심층 추론 적용",
    3_584,
  ),
  "runner:story-seed": defineRoute(
    "runner:story-seed",
    "기획 스토리 씨앗(로그라인·훅·아크) 생성",
    "n7-llm-runner",
    "deep-architecture",
    "작품 초기 핵심 로그라인·상업적 차별화 훅·초반 아크 설계는 Opus 5.5 적용",
    2_560,
  ),
  "runner:plot-development": defineRoute(
    "runner:plot-development",
    "기승전결 플롯 디벨롭먼트",
    "n7-llm-runner",
    "deep-architecture",
    "기승전결 4단 아크·전환점·클리프행어 설계는 Opus 5.5 적용",
    2_560,
  ),
  "runner:writer-room": defineRoute(
    "runner:writer-room",
    "작가실 6보조 에이전트(브레인스토밍·대사·페이싱·전환·클리프행어)",
    "n7-llm-runner",
    "creative-production",
    "작가실 대화형 씬/대사/전환 제안은 반응성과 품질 균형이 뛰어난 Sonnet 5.5 적용",
    2_048,
  ),
  "runner:canon-consistency": defineRoute(
    "runner:canon-consistency",
    "캐릭터·세계관 캐논 일관성 판정",
    "n7-llm-runner",
    "deep-architecture",
    "스토리 바이블 사실 대조 및 모순 검출은 Opus 5.5 심층 추론 적용",
    2_560,
  ),
  "runner:dialogue-suggest": defineRoute(
    "runner:dialogue-suggest",
    "말풍선 대사 3톤 윤문 추천",
    "n7-llm-runner",
    "fast-inline",
    "선택된 말풍선의 즉각적인 대사 3종 윤문은 Haiku 5.5로 지연 없이 응답",
    1_200,
  ),
  "runner:dialogue-translate": defineRoute(
    "runner:dialogue-translate",
    "다국어 대사 일괄 번역",
    "n7-llm-runner",
    "creative-production",
    "용어집·화자 레지스터 준수 다국어 번역은 Sonnet 5.5 적용",
    2_048,
  ),
  "runner:prompt-enhancer": defineRoute(
    "runner:prompt-enhancer",
    "작화 생성 프롬프트 고도화",
    "n7-llm-runner",
    "fast-inline",
    "카메라·조명·화풍 태그 보강 프롬프트 생성은 Haiku 5.5로 즉시 처리",
    1_200,
  ),
  "runner:shading-assist": defineRoute(
    "runner:shading-assist",
    "4레이어 채색·조명 셰이딩 어시스트",
    "n7-llm-runner",
    "fast-inline",
    "광원 방위각·고도각·림라이트 수치 추천은 Haiku 5.5로 즉시 처리",
    1_200,
  ),

  // 8. Phase 7 REA 15-Platform Deep Internalization & Creative AI Suite
  "rea15:glimnavi-relight-lineart-v23": defineRoute("rea15:glimnavi-relight-lineart-v23", "그림나비(GlimNavi) Studio v2.3 5종 선화·6종 프리셋·컬러 분리·Relight 디렉터", "phase6-ecosystem", "fast-inline", "선화 v1.0~v2.3 버전·6종 선화 프리셋·컬러 레이어 분리·AI 그림자/조명/명암 파라미터 산출은 Haiku 5.5로 즉각 처리", 3_072),
  "rea15:kaistory-single-envelope-kaion-quiz": defineRoute("rea15:kaistory-single-envelope-kaion-quiz", "카이스토리(KAISTORY) 4단 단일 데이터 엔벨로프 & KAION 웹툰 학습카드·독자 퀴즈 디렉터", "phase6-ecosystem", "creative-production", "conti→design→editor→story 단일 프로젝트 엔벨로프와 KAION 학습카드·독자 몰입 퀴즈 생성은 Sonnet 5.5 적용", 4_096),
  "rea15:snaptoon-frameo-shaper-3d-lighting": defineRoute("rea15:snaptoon-frameo-shaper-3d-lighting", "Snaptoon·Frameo·NAVER SHAPER·Plask·Posemaniacs 3D 포즈·스포트라이트 콘 디렉터", "phase6-ecosystem", "creative-production", "Snapboard 3D→AI 변환·Frameo 스포트라이트 콘(--cursor-angle/--cone-spread)·SHAPER 3D 표면 드로잉/포즈·해부학 리그는 Sonnet 5.5 적용", 4_096),
  "rea15:manhwa-komiko-anifusion-flow": defineRoute("rea15:manhwa-komiko-anifusion-flow", "ManhwaAI 6대 화풍/5대 톤·Komiko 레이어 분리/인비트윈·Anifusion 노드 플로우 디렉터", "phase6-ecosystem", "creative-production", "6대 만화 화풍·5대 절차적 효과톤·비파괴 레이어 분리·노드 플로우 그래프 설계는 Sonnet 5.5 적용", 4_096),
  "rea15:creative-dopamine-scroll-ux-synthesizer": defineRoute("rea15:creative-dopamine-scroll-ux-synthesizer", "웹툰 독자 도파민·스크롤 정지 히트맵 시뮬레이터 & 39대 플랫폼 UI/UX 테마 토큰 합성기", "phase6-ecosystem", "deep-architecture", "컷별 독자 도파민 곡선·스크롤 정지 시간(ms)·클리프행어 훅 강도 예측 및 39대 REA UI/UX 테마 합성은 Opus 5.5 심층 추론 적용", 6_144),
  "rea15:tootoon-gentoon-tooning-kr-suite": defineRoute("rea15:tootoon-gentoon-tooning-kr-suite", "TooToon 5-Studio(fabulator~emporium) · GenToon 리더/굿즈 · Tooning 6부위 캐릭터 디렉터", "phase6-ecosystem", "creative-production", "TooToon 5대 모듈·GenToon 뷰어/굿즈 수익화·Tooning Plus 6부위 캐릭터 조합 설계는 Sonnet 5.5 적용", 4_096),
  "rea15:krea-spline-lumiere-realtime-shader": defineRoute("rea15:krea-spline-lumiere-realtime-shader", "Krea 실시간 디렉터 · Spline 3D/Hana 스타일 트랜스퍼 · Lumiere/Graphite/PixiEditor 셰이더 디렉터", "phase6-ecosystem", "fast-inline", "실시간 i2i 브러시·Spline 3D 스타일 전이·Lumiere Kuwahara/Halation 셰이더·비파괴 노드 파라미터 산출은 Haiku 5.5로 즉각 처리", 3_072),
  "rea15:ltx-boords-cascadeur-rive-animatic": defineRoute("rea15:ltx-boords-cascadeur-rive-animatic", "LTX Studio · Boords 애니매틱 · Cascadeur 물리 오토포징 · Rive/Jitter 상태머신 디렉터", "phase6-ecosystem", "deep-architecture", "프리비즈 애니매틱 카메라 시퀀스·Cascadeur 무게중심/탄도 물리 궤적·Rive 인터랙티브 상태머신 설계는 Opus 5.5 심층 추론 적용", 6_144),
  "rea15:cotrans-vroid-skybox-world-localizer": defineRoute("rea15:cotrans-vroid-skybox-world-localizer", "Cotrans 식자 인페인팅 · VRoid 3D VRM 아바타 · Blockade Skybox 360° 월드 로컬라이저", "phase6-ecosystem", "creative-production", "다국어 식자 LaMa/AOT 인페인팅 마스크·VRoid VRM 본/외곽선·360도 파노라마 스카이박스 환경 매칭은 Sonnet 5.5 적용", 4_096),
  "rea15:storyboarder-dreams-krita-artbreeder-director": defineRoute("rea15:storyboarder-dreams-krita-artbreeder-director", "WonderUnit Shot Generator · Procreate Dreams 퍼포밍 · Krita Diffusion · Artbreeder 유전자 디렉터", "phase6-ecosystem", "deep-architecture", "3D Shot Generator 카메라·Procreate Dreams 실시간 퍼포밍 키프레임·Krita Live Diffusion·Artbreeder 유전자 교배 통합 설계는 Opus 5.5 심층 추론 적용", 6_144),
  "rea15:niji-pixai-civitai-lora-sref-director": defineRoute("rea15:niji-pixai-civitai-lora-sref-director", "NijiJourney V6 · PixAI · Civitai · TensorArt · WaifuLabs · Picrew · CHARAT LoRA/Sref/파츠 디렉터", "phase6-ecosystem", "creative-production", "Niji V6 --sref/--cref 가중치·PixAI/Civitai/SeaArt/TensorArt LoRA 스택·WaifuLabs 4단 그리드·Picrew/CHARAT 파츠 레이어 설계는 Sonnet 5.5 적용", 4_096),
  "rea15:tripo-meshy-heroforge-suno-elevenlabs-osmu": defineRoute("rea15:tripo-meshy-heroforge-suno-elevenlabs-osmu", "Tripo3D · Meshy 7 · HeroForge 3D 소품/갑주 · Suno V6 OST · ElevenLabs 더빙 · MANGA Plus 디렉터", "phase6-ecosystem", "deep-architecture", "Tripo3D/Meshy 7/HeroForge 3D 판타지 소품·갑주 메쉬·Suno V6 스템 OST·ElevenLabs 다중 성우 더빙·MANGA Plus 글로벌 투고 패키징은 Opus 5.5 심층 추론 적용", 6_144),
  "rea15:runway-luma-pika-viggle-live2d-spine-motion": defineRoute("rea15:runway-luma-pika-viggle-live2d-spine-motion", "Runway Gen-4.5 · Luma Ray 2 · Pika 2.2 · Viggle JST-2 · Live2D Cubism · Spine 2D 무빙툰 디렉터", "phase6-ecosystem", "deep-architecture", "Runway Multi-Motion Brush·Luma Start/End 키프레임·Pika 물리 이펙트·Viggle JST-2 모션 전이·Live2D ArtMesh/Spine 2D IK 본 리깅 통합 설계는 Opus 5.5 심층 추론 적용", 6_144),
  "rea15:sketchup-blender-petalica-magma-recraft-studio": defineRoute("rea15:sketchup-blender-petalica-magma-recraft-studio", "SketchUp 3D · Blender Grease Pencil · Petalica 채색 · Magma 30인 협업 · Recraft SVG · Cara Glaze 디렉터", "phase6-ecosystem", "creative-production", "SketchUp 동적 컴포넌트/은선·Blender Grease Pencil 3D 스트로크·Petalica 3종 채색·Magma 멀티유저 협업·Recraft SVG 벡터·Cara Glaze 보호 설계는 Sonnet 5.5 적용", 4_096),
  "rea15:tapas-tappytoon-ridi-postype-sudowrite-novelcrafter": defineRoute("rea15:tapas-tappytoon-ridi-postype-sudowrite-novelcrafter", "Tapas · Tappytoon · RIDI · Postype 글로벌/노블코믹스 연재 & Sudowrite · Novelcrafter · Campfire 코덱스 디렉터", "phase6-ecosystem", "deep-architecture", "북미/유럽/한국 4대 연재 플랫폼(Tapas·Tappytoon·RIDI·Postype) 규격·수익화 퍼널과 Sudowrite/Novelcrafter/Campfire 세계관 코덱스·씬 비트 매트릭스 통합 설계는 Opus 5.5 심층 추론 적용", 6_144),
  "rea15:mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle": defineRoute("rea15:mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle", "Mixamo 모션 · Marvelous 의상 · Substance 재질 · Coolors/Adobe 배색 · 눈누/Blambot 식자 · ToonBoom/TVPaint/Moho · Eagle 에셋 디렉터", "phase6-ecosystem", "creative-production", "Mixamo 3D 모션캡처·Marvelous 의상 주름·Substance 툰 머티리얼·Coolors/Adobe 배색·눈누/Blambot 한영 식자·ToonBoom/TVPaint/Moho 작화·PureRef/Milanote/Eagle 에셋 관리는 Sonnet 5.5 적용", 4_096),
  "ecosystem:collar-tie-lapel-neckline-symmetry-lock": defineRoute("ecosystem:collar-tie-lapel-neckline-symmetry-lock", "의상 칼라·넥타이 매듭·로판 리본·갑옷 목깃(Gorget) 대칭 및 단추 풀림 단계 고정기", "phase6-ecosystem", "fast-inline", "슛/역슛 전환 시 셔츠 풀어헤친 단추 개수·넥타이 매듭·로판 크라바트 브로치·갑옷 목깃 대칭 고정은 Haiku 5.5 적용", 3_072),
  "ecosystem:tattoo-stigma-curse-mark-uv-topology-lock": defineRoute("ecosystem:tattoo-stigma-curse-mark-uv-topology-lock", "문신·성흔(Stigma)·마안·저주 낙인 신체 UV 곡면 왜곡 및 발광 단계 고정기", "phase6-ecosystem", "creative-production", "근육 수축·단축법(Foreshortening) 각도에서 문신·성흔·저주 문양의 신체 해부학적 UV 좌표 및 발광 단계 고정은 Sonnet 5.5 적용", 4_096),
  "ecosystem:companion-pet-familiar-mascot-scale-lock": defineRoute("ecosystem:companion-pet-familiar-mascot-scale-lock", "소환수·신수·마스코트·반려동물 체구 비례(어깨/손바닥 대비) 및 뿔·날개·꼬리 수 고정기", "phase6-ecosystem", "fast-inline", "소형 신수·사역마·반려동물이 컷마다 크기가 변하거나 뿔/꼬리 개수가 바뀌는 작붕 방지는 Haiku 5.5 적용", 3_072),
  "ecosystem:interior-room-furniture-door-hinge-geography-lock": defineRoute("ecosystem:interior-room-furniture-door-hinge-geography-lock", "실내 방 구조·가구 배치·창문 채광 방향·문 경첩(Hinge) 개폐 궤적 평면도 고정 감독", "phase6-ecosystem", "deep-architecture", "역앵글 전환 시 방문 손잡이/경첩 방향·창문 위치·책상/침대 동선이 뒤집히는 공간 작붕 차단은 Opus 5.5 심층 추론 적용", 6_144),
  "ecosystem:scroll-pace-silent-beat-panel-height-rhythm": defineRoute("ecosystem:scroll-pace-silent-beat-panel-height-rhythm", "무대사 감정 여운 컷(Silent Beat) 세로 픽셀 호흡·페이드 여백 리듬 디렉터", "phase6-ecosystem", "creative-production", "모바일 세로 스크롤에서 대사 없는 시선 교환·여운 컷의 세로 픽셀 높이(px)와 암전 그라데이션 호흡 설계는 Sonnet 5.5 적용", 4_096),
  "ecosystem:subsurface-scattering-skin-tear-sweat-specular-lock": defineRoute("ecosystem:subsurface-scattering-skin-tear-sweat-specular-lock", "역광 귀·손가락 피하산란(SSS 붉은 투과광) 및 눈물·땀방울 굴절 하이라이트 고정기", "phase6-ecosystem", "creative-production", "강한 역광 클로즈업에서 귀바퀴/손가락 끝 피하산란(SSS) 붉은 투과광과 눈물/땀방울 굴절 스페큘러 일관성 고정은 Sonnet 5.5 적용", 4_096),
  "domain:prop-screen-ui-hologram-text-consistency": defineRoute("domain:prop-screen-ui-hologram-text-consistency", "스마트폰 화면·게임 상태창(Status Window)·홀로그램 UI·간판 텍스트/시각 연속성 고정기", "n7-llm-runner", "fast-inline", "현대물 스마트폰 채팅/배터리/시각·판타지 상태창 스탯 수치·홀로그램 UI 레이아웃 연속성 고정은 Haiku 5.5 적용", 3_072),
  "domain:braid-ponytail-ribbon-accessory-knot-lock": defineRoute("domain:braid-ponytail-ribbon-accessory-knot-lock", "땋은 머리(Braid) 마디 수·포니테일 결속 높이·비녀/헤어핀/리본 매듭 위치 고정기", "n7-llm-runner", "fast-inline", "땋은 머리 교차 마디 개수·포니테일 높이·비녀/리본 매듭 좌우 방향이 컷마다 바뀌는 작붕 방지는 Haiku 5.5 적용", 3_072),
  "domain:cape-cloak-hem-lining-wind-flutter-lock": defineRoute("domain:cape-cloak-hem-lining-wind-flutter-lock", "망토·코트 자락 겉감/안감(Lining) 배색·금박 문양·바람 펄럭임 위상 고정기", "n7-llm-runner", "creative-production", "망토/롱코트 겉감·안감 색상 반전 방지 및 밑단 금박 문양·바람 방향별 펄럭임 위상(Phase) 고정은 Sonnet 5.5 적용", 4_096),
  "domain:sword-hilt-guard-gem-scabbard-engraving-lock": defineRoute("domain:sword-hilt-guard-gem-scabbard-engraving-lock", "도검 코등이(Crossguard)·자루 보석·칼집(Scabbard) 패용 위치·룬 각인 고정기", "n7-llm-runner", "creative-production", "검 코등이 비대칭 장식·폼멜 보석·칼집 패용 좌우 허리 위치·도신 룬 각인 방향 고정은 Sonnet 5.5 적용", 4_096),
  "domain:character-age-flashback-growth-proportion-lock": defineRoute("domain:character-age-flashback-growth-proportion-lock", "과거 회상(유년기/소년기)·현재·타임스킵 연령대별 두신비·하관·흉터 타임라인 고정기", "n7-llm-runner", "creative-production", "유년기 회상과 현재 시점 전환 시 두신비(5.5~8등신)·안면 하관 비율·시대별 흉터 유무 고정은 Sonnet 5.5 적용", 4_096),
  "domain:multi-plane-parallax-depth-blur-bokeh-lock": defineRoute("domain:multi-plane-parallax-depth-blur-bokeh-lock", "전경(Out-of-focus)·중경(인물)·원경(보케) 3평면 피사계 심도(DoF) 블러 감독", "n7-llm-runner", "deep-architecture", "전경 나뭇잎/창살·중경 인물·원경 도시 야경 보케 3평면 조리개(f-stop) 블러 반경 및 색수차 일관성 설계는 Opus 5.5 심층 추론 적용", 6_144),
  "runner:gaze-saccade-pupil-highlight-lock": defineRoute("runner:gaze-saccade-pupil-highlight-lock", "동공 하이라이트(Catchlight) 광원 각도·사시 방지·시선 도약(Saccade) 궤적 고정기", "n7-llm-runner", "fast-inline", "양안 동공 수렴각(Vergence) 사시 작붕 방지 및 주광원 방향 캐치라이트 시계방향 각도 고정은 Haiku 5.5 적용", 3_072),
  "runner:breath-frost-cigarette-smoke-plume-lock": defineRoute("runner:breath-frost-cigarette-smoke-plume-lock", "겨울 입김(Breath Frost)·담배 연기·찻잔 수증기 확산 농도·풍향 드리프트 연속성 고정기", "n7-llm-runner", "fast-inline", "겨울 야외 입김·담배 연기·온천 수증기의 컷 간 풍향 드리프트 각도와 투명도 감쇠율 고정은 Haiku 5.5 적용", 3_072),
  "runner:wet-fabric-rain-translucency-drape-lock": defineRoute("runner:wet-fabric-rain-translucency-drape-lock", "우중(비/수중) 젖은 셔츠·의상 피부 밀착 주름·반투명 투과도·건조 단계 비가역 고정기", "n7-llm-runner", "creative-production", "비를 맞거나 물에 젖은 의상의 피부 밀착 텐션 주름·피부톤 비침(Translucency)·다음 컷 급속 건조 작붕 방지는 Sonnet 5.5 적용", 4_096),
  "runner:cast-shadow-sundial-azimuth-elevation-lock": defineRoute("runner:cast-shadow-sundial-azimuth-elevation-lock", "야외 태양 방위각(Azimuth)·고도각(Elevation) 기반 인물·건물 바닥 그림자 길이·방향 고정기", "n7-llm-runner", "creative-production", "동일 시간대 야외 씬에서 태양 방위각/고도각에 따른 인물·건물 바닥 투영 그림자(Cast Shadow) 길이 배율과 각도 고정은 Sonnet 5.5 적용", 4_096),
  "runner:impact-debris-crater-shatter-persistence-lock": defineRoute("runner:impact-debris-crater-shatter-persistence-lock", "전투 타격 바닥 크레이터·벽면 균열·유리 파편 잔해 위치 지속성(원상복구 방지) 고정기", "n7-llm-runner", "creative-production", "전투 중 파손된 바닥 크레이터·기둥 균열·깨진 유리창 파편이 다음 컷에서 멀쩡히 원상복구되는 배경 작붕 차단은 Sonnet 5.5 적용", 4_096),
  "runner:binaural-spatial-audio-foley-lufs-director": defineRoute("runner:binaural-spatial-audio-foley-lufs-director", "무빙툰·오디오툰 3D 바이노럴 폴리(발소리/옷깃/검풍)·대사 사이드체인 더킹(-8dB)·-14 LUFS 마스터 감독", "n7-llm-runner", "deep-architecture", "컷 내 화자/타격 좌우 패닝(Binaural Panning)·폴리 사운드 레이어·성우 대사 -8dB 사이드체인 더킹·-14 LUFS 음량 마스터링 설계는 Opus 5.5 심층 추론 적용", 6_144),
  "production:button-zipper-belt-buckle-fastener-lock": defineRoute("production:button-zipper-belt-buckle-fastener-lock", "의상 여밈 방향(남성 좌상우하·여성 우상좌하·한복 동정)·벨트 버클·지퍼 슬라이더 고정기", "storyboard-production", "fast-inline", "남성복/여성복/전통복 앞여밈 겹침 방향(Left-over-Right) 및 벨트 버클 프롱 방향 좌우 반전 차단은 Haiku 5.5 적용", 3_072),
  "production:speedline-impact-frame-radial-focus-lock": defineRoute("production:speedline-impact-frame-radial-focus-lock", "집중선(Focus Line) 수렴 중심점·배경 유선(Speed Line) 각도·흑백 임팩트 프레임 감독", "storyboard-production", "fast-inline", "방사형 집중선 수렴 중심(얼굴/타격점) 이탈 방지 및 속도선 벡터 각도·흑백 반전 임팩트 프레임 설계는 Haiku 5.5 적용", 3_072),
  "production:wound-bandage-cast-healing-stage-lock": defineRoute("production:wound-bandage-cast-healing-stage-lock", "붕대 감긴 방향·깁스/안대 착용 부위·회차별 상처 회복 단계(출혈→봉합→붕대→흉터) 타임라인 고정기", "storyboard-production", "creative-production", "붕대 나선 감김 방향·안대/깁스 좌우 위치·회차 경과에 따른 상처 치유 단계 역행 방지는 Sonnet 5.5 적용", 4_096),
  "production:heraldry-crest-guild-emblem-geometry-lock": defineRoute("production:heraldry-crest-guild-emblem-geometry-lock", "가문 문장(Heraldry Crest)·황실 국장·길드 엠블럼·교복 배지 기하 도안 및 봉랍 반전 방지기", "storyboard-production", "creative-production", "공작가/황실 문장 방패 분할·사자/독수리 방향(Dexter/Sinister)·깃발/봉랍/마차 문장 좌우 반전 차단은 Sonnet 5.5 적용", 4_096),
  "production:musical-instrument-fingering-bowing-lock": defineRoute("production:musical-instrument-fingering-bowing-lock", "바이올린(좌턱/우손 활)·피아노 건반 옥타브·기타 프렛·플루트 연주 파지 해부학 고정기", "storyboard-production", "creative-production", "현악기/건반악기/관악기 연주 컷에서 활 쥐는 손(오른손)과 운지 손(왼손)이 좌우 반전되는 고증 오류 차단은 Sonnet 5.5 적용", 4_096),
  "production:variable-font-balloon-diamond-copyfit-lock": defineRoute("production:variable-font-balloon-diamond-copyfit-lock", "말풍선 내부 다이아몬드 줄바꿈(Diamond Rag)·가변 폰트 자폭(wdth)/굵기(wght) 광학 조판 고정기", "storyboard-production", "creative-production", "말풍선 타원 곡률에 맞춘 가운데 줄이 길고 첫/끝줄이 짧은 다이아몬드 행갈이 및 가변 폰트 자폭 보간은 Sonnet 5.5 적용", 4_096),
  "production:tankobon-print-bleed-cmyk-tac300-proof-lock": defineRoute("production:tankobon-print-bleed-cmyk-tac300-proof-lock", "세로 웹툰 → 종이 단행본(A5/신서판) 재편집 컷 분할·재단선(Bleed 3mm)·CMYK TAC≤300% 감리 감독", "storyboard-production", "deep-architecture", "세로 스크롤 원고의 단행본 페이지네이션 컷 재배치·안쪽 제책 여백(Gutter)·리치블랙 TAC 300% 인쇄 감리는 Opus 5.5 심층 추론 적용", 6_144),
  "production:eyetrack-scroll-velocity-aoi-heatmap-director": defineRoute("production:eyetrack-scroll-velocity-aoi-heatmap-director", "모바일 스크롤 속도(px/s) 감속 구간·아이트래킹 관심영역(AOI 1→2→3) 시선 도약 스캔패스 총괄 감독", "storyboard-production", "deep-architecture", "첫 시선 고정점(1st Fixation)→말풍선→액션 타격점 Z-스캔패스 설계 및 Fast-Skim 이탈 절벽 방지는 Opus 5.5 심층 추론 적용", 6_144),
  "art-director:traditional-clothing-collar-knot-goreum-lock": defineRoute("art-director:traditional-clothing-collar-knot-goreum-lock", "한복(우임·동정·고름)·기모노(우전)·한푸(교령우임) 전통복식 여밈 방향 및 좌임(수의) 작붕 방지기", "art-director", "fast-inline", "동아시아 전통복식(한복·기모노·한푸) 착용 시 좌측 옷깃이 위로 올라오는 우임 원칙 및 매듭 고정은 Haiku 5.5 적용", 3_072),
  "art-director:firearm-tactical-slide-ejection-finger-lock": defineRoute("art-director:firearm-tactical-slide-ejection-finger-lock", "총기 탄피 배출구(우측)·슬라이드 후퇴고정·비사격 방아쇠 울외 손가락(Trigger Discipline) 고정기", "art-director", "fast-inline", "현대/느와르/헌터물 총기 탄피 배출구 좌우 반전 차단 및 슬라이드 스톱·방아쇠 울외 검지 고정은 Haiku 5.5 적용", 3_072),
  "art-director:martial-arts-qigong-meridian-aura-trajectory-lock": defineRoute("art-director:martial-arts-qigong-meridian-aura-trajectory-lock", "무협 내공 단전(기해혈)·12경맥 기혈 발광·왼손 검결(Jianjue)·보법 무게중심 고정 디렉터", "art-director", "creative-production", "무협 운기조식/검기 발현 시 경맥 경로·내공 오러 색상·왼손 검결 수인·하체 보법 중심 고정은 Sonnet 5.5 적용", 4_096),
  "art-director:medical-icu-vital-monitor-sterile-rig-lock": defineRoute("art-director:medical-icu-vital-monitor-sterile-rig-lock", "중환자실(ICU) 바이탈 모니터(ECG/SpO2/ABP 수치)·기관삽관·수술실 무균 가운/메스 파지 고정 디렉터", "art-director", "creative-production", "의학/스릴러 웹툰 ICU 모니터 파형/수치 정합성·멸균 구역 접촉 금지·무영등 반사 고정은 Sonnet 5.5 적용", 4_096),
  "art-director:culinary-knife-pinch-grip-plating-steam-lock": defineRoute("art-director:culinary-knife-pinch-grip-plating-steam-lock", "요리 셰프 나이프 핀치 그립·왼손 고양이손(Claw Grip)·플레이팅 소스·김(Steam) 레이어 고정기", "art-director", "creative-production", "요리/카페 웹툰 칼 파지 해부학·도마 위 재료 단면·음식 수증기 및 글레이즈 광택 고정은 Sonnet 5.5 적용", 4_096),
  "art-director:acrylic-stand-photocard-dieline-white-plate-lock": defineRoute("art-director:acrylic-stand-photocard-dieline-white-plate-lock", "웹툰 IP 아크릴 스탠드 칼선(2mm 오프셋)·화이트 백판·발판 결합 홈(12×3mm)·홀로그램 포토카드 설계기", "art-director", "creative-production", "아크릴 스탠드 레이저 칼선(CutLine)·배면 백판(0.2mm 축소)·3T 발판 꽂이 공차·포토카드 R3 재단선 설계는 Sonnet 5.5 적용", 4_096),
  "art-director:east-asian-palace-dancheong-roof-bracket-lock": defineRoute("art-director:east-asian-palace-dancheong-roof-bracket-lock", "동아시아 궁궐/사찰 목조건축 공포(포작)·추녀마루 잡상·단청 오방색(뇌록색)·기와 골 원근 총괄 감독", "art-director", "deep-architecture", "사극/무협 전통 건축물의 다포 공포 구조·처마 반전 곡률·단청 뇌록색/석간주 배색·기와 골 소실점 감리는 Opus 5.5 심층 추론 적용", 6_144),
  "art-director:reader-comment-sentiment-catharsis-cliff-director": defineRoute("art-director:reader-comment-sentiment-catharsis-cliff-director", "연재 직후 예상 독자 댓글 감성(고구마 피로도 vs 사이다 카타르시스)·별점 방어 대사 처방 총괄 감독", "art-director", "deep-architecture", "회차별 독자 고구마 누적 피로도와 사이다 해소 비율 시뮬레이션 및 캐릭터 붕괴/별점 하락 방어 처방은 Opus 5.5 심층 추론 적용", 6_144),
  "localize:lunar-phase-star-conjunction-sky-lock": defineRoute("localize:lunar-phase-star-conjunction-sky-lock", "초승달/그믐달 어두운 면(지구조) 내부 별 침범(Star-in-Moon) 작붕 차단 및 달 볼록면 광원 고정기", "localize", "fast-inline", "초승달 안쪽 그림자 영역에 배경 별이 찍히는 천문학 작붕 차단 및 달 위상 연속성 고정은 Haiku 5.5 적용", 3_072),
  "localize:emoticon-24pack-chibi-proportion-spec-lock": defineRoute("localize:emoticon-24pack-chibi-proportion-spec-lock", "카카오/라인/OGQ 웹툰 캐릭터 2.5등신 SD 치비 이모티콘 24종(360×360px 24fps) 기획 고정기", "localize", "fast-inline", "웹툰 캐릭터의 시그니처 표정 기반 2.5등신 SD 이모티콘 24종 구성 및 다크모드 외곽선 시인성 검증은 Haiku 5.5 적용", 3_072),
  "localize:quadruped-creature-hock-wing-membrane-lock": defineRoute("localize:quadruped-creature-hock-wing-membrane-lock", "드래곤/마수/늑대/전투마 뒷다리 발목 관절(Hock)·지행성 보행·날개 4지 비막 접힘 해부학 고정 디렉터", "localize", "creative-production", "사족보행 동물/신수의 뒷다리 발목(Hock) 꺾임 방향과 드래곤 날개 손가락 비막 접힘 구조 고정은 Sonnet 5.5 적용", 4_096),
  "localize:k-urban-convenience-metro-rooftop-prop-lock": defineRoute("localize:k-urban-convenience-metro-rooftop-prop-lock", "한국형 일상 공간(지하철 7인석/스크린도어·편의점 파라솔·옥탑방 녹색 우레탄·교실 채광) 고증 디렉터", "localize", "creative-production", "K-웹툰 특유의 한국 도시/학원/주거 공간 비례와 소품 배치가 컷마다 달라지는 배경 오류 차단은 Sonnet 5.5 적용", 4_096),
  "localize:thai-vietnamese-arabic-rtl-balloon-shaping-lock": defineRoute("localize:thai-vietnamese-arabic-rtl-balloon-shaping-lock", "태국어/베트남어 2단 성조 잘림 방지(행간 155%)·아랍어 RTL 말풍선 순서 미러링(흉터 보존) 디렉터", "localize", "creative-production", "동남아 복합 성조 문자 상하단 클리핑 방지 및 중동 RTL 말풍선 순서 역전·캐릭터 비대칭 보존은 Sonnet 5.5 적용", 4_096),
  "localize:anime-settei-3tone-color-model-sheet-lock": defineRoute("localize:anime-settei-3tone-color-model-sheet-lock", "웹툰 그라데이션 원고 → TV 애니메이션 3단 셀 채색 지정표(Normal/1-Shadow/Hi HEX) 변환 디렉터", "localize", "creative-production", "웹툰 원작 애니메이션화 시 브러시 그라데이션을 셀 작화용 노멀/그림자/하이라이트 3단 색지정표로 변환은 Sonnet 5.5 적용", 4_096),
  "localize:ott-live-action-8ep-showrunner-pitch-director": defineRoute("localize:ott-live-action-8ep-showrunner-pitch-director", "웹툰 원작 넷플릭스/OTT 8부작 실사 드라마 각색 쇼러너 바이블·세트장 압축·VFX 예산 총괄 감독", "localize", "deep-architecture", "웹툰 70화 분량을 8부작 드라마 회차별 엔딩 훅과 로케이션/VFX 예산 티어로 재설계하는 바이블은 Opus 5.5 심층 추론 적용", 6_144),
  "localize:global-ip-mg-rs-royalty-waterfall-director": defineRoute("localize:global-ip-mg-rs-royalty-waterfall-director", "글로벌 연재·출판·영상화 계약 미니멈 개런티(MG 선차감/후차감)·러닝개런티(RS) 워터폴 정산 감사 감독", "localize", "deep-architecture", "MG 선차감/후차감 수식 비교와 2차 저작물 권리 귀속·RS 정산 워터폴 시뮬레이션은 Opus 5.5 심층 추론 적용", 6_144),
  "cost-cap:lhd-rhd-cockpit-seatbelt-drivetrain-lock": defineRoute("cost-cap:lhd-rhd-cockpit-seatbelt-drivetrain-lock", "차량 좌우핸들(LHD/RHD)·3점식 안전벨트 대각선·오토바이 스로틀/클러치·자전거 우측 체인링 고정기", "core-dialog", "fast-inline", "운전석 좌우핸들·안전벨트 어깨 대각선·오토바이/자전거 구동계 좌우 반전 차단은 Haiku 5.5 적용", 3_072),
  "cost-cap:screentone-lpi-moire-gpen-hierarchy-lock": defineRoute("cost-cap:screentone-lpi-moire-gpen-hierarchy-lock", "만화 망점 스크린톤(60L 45° 모아레 방지)·G펜(실루엣 4.5px)/마루펜(내부 1.4px) 선굵기 위계 고정기", "core-dialog", "fast-inline", "모바일 축소 시 망점 모아레 간섭 방지 및 G펜/마루펜 3단 선굵기 위계 고정은 Haiku 5.5 적용", 3_072),
  "cost-cap:anamorphic-fisheye-dutch-lens-optics-lock": defineRoute("cost-cap:anamorphic-fisheye-dutch-lens-optics-lock", "시네마틱 렌즈 광학(아나모픽 2x 타원 보케·8mm 어안 5점 투시·200mm 망원 압축·스플릿 디옵터) 디렉터", "core-dialog", "creative-production", "아나모픽 수평 플레어·어안 구면 격자·망원 공간 압축·더치 틸트 중력 분리는 Sonnet 5.5 적용", 4_096),
  "cost-cap:drapery-7folds-velvet-satin-brdf-lock": defineRoute("cost-cap:drapery-7folds-velvet-satin-brdf-lock", "번 호가스 7대 의상 주름(파이프·지그재그·나선·반잠금) 인장 기점 및 벨벳·실크·시스루 재질 BRDF 디렉터", "core-dialog", "creative-production", "관절 굴곡 주름 기점과 벨벳 역프레넬·실크 이방성 하이라이트·시스루 접선 불투명도 설계는 Sonnet 5.5 적용", 4_096),
  "cost-cap:sports-biomechanics-gait-grip-edge-lock": defineRoute("cost-cap:sports-biomechanics-gait-grip-edge-lock", "스포츠·액션 인체역학(질주 교차보행·배구 활시위 스파이크·농구 가이드핸드·피겨 에지·볼링 그립) 고증 디렉터", "core-dialog", "creative-production", "질주 시 같은 쪽 팔다리 동시 전진 작붕 차단 및 구기/빙상/무도 종목별 파지·축발 고증은 Sonnet 5.5 적용", 4_096),
  "cost-cap:vtuber-arkit52-vn-sprite-canbadge-lock": defineRoute("cost-cap:vtuber-arkit52-vn-sprite-canbadge-lock", "웹툰 IP 버튜버(Live2D ARKit 52)·비주얼노벨 스탠딩(3단 눈깜빡임/5모음)·58mm 캔배지/렌티큘러 디렉터", "core-dialog", "creative-production", "버튜버 블렌드셰이프·비주얼노벨 표정 파츠 시트·캔배지 6mm 말림 도련·렌티큘러 설계는 Sonnet 5.5 적용", 4_096),
  "cost-cap:gacha-ssr-splash-rpg-skill-cutscene-director": defineRoute("cost-cap:gacha-ssr-splash-rpg-skill-cutscene-director", "웹툰 원작 수집형 RPG 게임 SSR 5평면 스플래시 아트·3초 궁극기 컷신·타격 히트스톱 총괄 감독", "core-dialog", "deep-architecture", "웹툰 캐릭터의 모바일 RPG SSR 가챠 일러스트 5평면 레이어 분리와 3초 필살기 연출 설계는 Opus 5.5 심층 추론 적용", 6_144),
  "cost-cap:audiotoon-adr-timecode-tactile-ergo-director": defineRoute("cost-cap:audiotoon-adr-timecode-tactile-ergo-director", "오디오웹툰 성우 ADR 타임코드 대본·시각장애인 촉각 그래픽 양각선(2.5mm)·작가 손목 필압 피로도 총괄 감독", "core-dialog", "deep-architecture", "성우 호흡/마이크 거리 타임코드 대본·점자 촉각 그래픽 단순화·주간 70컷 펜 터치 예산 관리는 Opus 5.5 심층 추론 적용", 6_144),
  "cost-cap:rofan-corset-sash-signet-etiquette-lock": defineRoute("cost-cap:rofan-corset-sash-signet-etiquette-lock", "로판 코르셋 전면 버스(Busk)/후면 레이싱·대훈장 어깨띠(우어깨→좌골반)·인장반지 음각·찻잔 노핑키 고정기", "core-dialog", "fast-inline", "로판 복식 코르셋 앞뒤·훈장띠 대각선·인장반지 음각·다과회 찻잔 파지 에티켓 고정은 Haiku 5.5 적용", 3_072),
  "cost-cap:pocket-watch-iiii-chess-baduk-board-lock": defineRoute("cost-cap:pocket-watch-iiii-chess-baduk-board-lock", "로마자 시계 4시(IIII) 표기·체스판 우하단 백색칸(White-on-Right)·바둑돌 검중지 파지·트럼프 인덱스 고정기", "core-dialog", "fast-inline", "회중시계 IIII 표기·체스판 h1 백색칸·바둑돌 착점 손모양·트럼프 부채꼴 인덱스 고정은 Haiku 5.5 적용", 3_072),
  "cost-cap:castle-clockwise-stair-carriage-waltz-lock": defineRoute("cost-cap:castle-clockwise-stair-carriage-waltz-lock", "중세 성탑 시계방향 나선계단·4두 마차 작은 앞바퀴/C스프링·무도회 왈츠 프레임(남성 오른손=좌견갑골) 디렉터", "core-dialog", "creative-production", "성탑 나선계단 회전방향·마차 앞뒷바퀴 크기차·왈츠 남녀 손 위치·스테인드글라스 색광 투영은 Sonnet 5.5 적용", 4_096),
  "cost-cap:hunter-gate-raid-party-inventory-potion-lock": defineRoute("cost-cap:hunter-gate-raid-party-inventory-potion-lock", "헌터 등급별 게이트 색상·5인 던전 레이드 진형·아공간 인벤토리 금빛 파문·포션병 액체 수평면(Meniscus) 디렉터", "core-dialog", "creative-production", "게이트 등급 스펙트럼·탱딜힐 5인 파티 공간 진형·아공간 차폐 평면·포션 액체 중력 수평 고정은 Sonnet 5.5 적용", 4_096),
  "cost-cap:cyberpunk-prosthetic-mecha-nvg-molle-lock": defineRoute("cost-cap:cyberpunk-prosthetic-mecha-nvg-molle-lock", "사이버펑크 신경포트/기계의수 파팅라인·강화복 어깨장갑 자기충돌 방지·방탄복 탄창 방향·4안 야투경 디렉터", "core-dialog", "creative-production", "의체 결합부·강화복 관절 가동범위·전술 방탄복 탄창 삽탄 방향·야투경 녹색 반사광은 Sonnet 5.5 적용", 4_096),
  "cost-cap:shaman-gut-exorcism-talisman-onmyoji-lock": defineRoute("cost-cap:shaman-gut-exorcism-talisman-onmyoji-lock", "한국 무속 왼손 칠성방울/오른손 부채·괴황지 경면주사 부적·구마 사제 보라 영대·음양사 구자수인 고증 디렉터", "core-dialog", "creative-production", "무당 방울/부채 좌우 지물·부적 탄화 발광·구마 사제 영대/십자가·구자호신법 수인 고정은 Sonnet 5.5 적용", 4_096),
  "cost-cap:forensic-luminol-blood-spatter-autopsy-director": defineRoute("cost-cap:forensic-luminol-blood-spatter-autopsy-director", "과학수사 루미놀 425nm 청백색 발광·증거 번호판 위치 불변·취조실 단방향 거울 명암·폴리그라프 총괄 감독", "core-dialog", "deep-architecture", "루미놀 혈흔 반응 파장·사건현장 증거텐트 평면도·취조실 거울 물리 조건·거짓말탐지기 감리는 Opus 5.5 심층 추론 적용", 6_144),
  "cost-cap:locked-room-alibi-cipher-archaeology-director": defineRoute("cost-cap:locked-room-alibi-cipher-archaeology-director", "추리물 밀실 트릭 평면도·알리바이 타임테이블·레터로킹 암호봉인·유적 발굴 격자/미술품 UV 감정 총괄 감독", "core-dialog", "deep-architecture", "밀실 건축 기하 트릭·시야각/열차 알리바이 매트릭스·고전 암호/미술품 UV 형광 감정은 Opus 5.5 심층 추론 적용", 6_144),

  // 17. Wave 39~41 Esports/Courtroom/KpopStage/Aerospace/MartialSports/FineArts/BotanyCraft/HeavyMachineryErp AI Engines (8)
  "cost-cap:esports-hud-gamer-keyboard-mouse-lock": defineRoute("cost-cap:esports-hud-gamer-keyboard-mouse-lock", "프로게이머 e스포츠 중계 HUD 킬로그/미니맵 시야 연속성 & 왼손 키보드(WASD/QWER)·오른손 마우스 그립 고정기", "core-dialog", "fast-inline", "중계 화면 킬스코어/골드/미니맵 안개 일치 및 게이머 왼손 키보드·오른손 마우스 좌우 반전 차단은 Haiku 5.5로 즉각 검증", 2_560),
  "cost-cap:courtroom-trial-prison-handcuff-lock": defineRoute("cost-cap:courtroom-trial-prison-handcuff-lock", "한국 형사법정 좌측 검사석/우측 변호인석 배치·구치소 아크릴 타공 통화구·수갑 열쇠구멍 및 경찰 바디캠 고정기", "core-dialog", "fast-inline", "법정 판사석/방청석 시점별 검사·변호인석 반전 방지 및 구치소 수용번호 명찰·수갑 결박 해부학은 Haiku 5.5 적용", 2_560),
  "cost-cap:kpop-stage-choreo-lightstick-iem-lock": defineRoute("cost-cap:kpop-stage-choreo-lightstick-iem-lock", "K-POP 아이돌 커스텀 인이어(IEM) 귀뒤 루프·볼 헤드셋 마이크·5/7인조 V자 칼군무·응원봉 파도/DMX 레이저 디렉터", "core-dialog", "creative-production", "아이돌 무대 인이어/마이크 착용·군무 대형 블로킹·객석 블루투스 응원봉 발광 연출은 Sonnet 5.5 적용", 4_096),
  "cost-cap:aviation-cockpit-zerog-submarine-lock": defineRoute("cost-cap:aviation-cockpit-zerog-submarine-lock", "항공기 좌 기장석/우 부기장석·전투기 애프터버너 마하 다이아몬드·우주 무중력 구형 물방울·잠수함 적색조명 디렉터", "core-dialog", "creative-production", "항공 조종석 좌우·초음속 충격파 마디·무중력 표면장력·잠수함 전투조명/범선 풍향기 일치는 Sonnet 5.5 적용", 4_096),
  "cost-cap:archery-fencing-boxing-stance-cue-lock": defineRoute("cost-cap:archery-fencing-boxing-stance-cue-lock", "국궁(엄지 깍지+우측 화살) vs 양궁(3지+좌측 화살)·펜싱 3종목 유효면·복싱 스탠스·당구 브릿지/클라이밍 매듭 디렉터", "core-dialog", "creative-production", "동서양 궁술 화살 거치 좌우 구분·펜싱 장비·격투기 오소독스/사우스포 반전 차단은 Sonnet 5.5 적용", 4_096),
  "cost-cap:orchestra-piano-guitar-tea-calligraphy-lock": defineRoute("cost-cap:orchestra-piano-guitar-tea-calligraphy-lock", "88건반 피아노 검은건반(2-3 주기)·기타 프렛/드럼 교차 팔·오케스트라 지휘·다도 다완 회전·서예 쌍구법 디렉터", "core-dialog", "creative-production", "피아노/기타/드럼 연주 해부학·동양 다도/소믈리에 매너·서예 쌍구법/물레 반시계 회전 고증은 Sonnet 5.5 적용", 4_096),
  "cost-cap:botanical-flora-blacksmith-alchemy-director": defineRoute("cost-cap:botanical-flora-blacksmith-alchemy-director", "벚꽃 5꽃잎 끝 홈/단풍잎·대나무 빈 단면·대장간 왼손 집게/오른손 해머·스테인드글라스 투영광·연금술 총괄 감독", "core-dialog", "deep-architecture", "식물 계절 해부학·대장간 담금질/테일러 가봉·성당 색수차 투영광·마탑 연금술 기구 감리는 Opus 5.5 심층 추론 적용", 6_144),
  "cost-cap:heavy-machinery-signboard-tax-erp-director": defineRoute("cost-cap:heavy-machinery-signboard-tax-erp-director", "굴착기 3절 유압 링크/전철 팬터그래프·네온사인 유리관/간판 외계어 차단·여권 MRZ·웹툰 3.3% 세무/어시 ERP 총괄 감독", "core-dialog", "deep-architecture", "중장비 기구학·배경 한글 간판 외계어 방지·여권/화폐 소품·웹툰 스튜디오 세무/어시 정산 ERP는 Opus 5.5 심층 추론 적용", 6_144),

  // 18. Wave 42~44 DentalXray/RetroHardware/LabScience/EquestrianHorology/FilmBroadcast/CampusTabletop/AmusementSki/PropPaywall AI Engines (8)
  "localize:dental-ophthalmology-xray-marker-lock": defineRoute("localize:dental-ophthalmology-xray-marker-lock", "치과 치경 반사·안과 세극등·정형외과 X-ray 좌우 납 마커(L/R) 반전 차단 및 구급차 제세동기 패들 위치 고정기", "core-dialog", "fast-inline", "치과/안과 검진 기구·X-ray 좌우 마커·AED 패들 대각선 부착 위치 고정은 Haiku 5.5로 즉각 검증", 2_560),
  "localize:rotary-phone-turntable-camera-instant-lock": defineRoute("localize:rotary-phone-turntable-camera-instant-lock", "다이얼 전화기 4시 핑거스톱·LP 턴테이블 우측 톤암·필름 카메라 우측 와인딩 레버·폴라로이드 하단 여백 고정기", "core-dialog", "fast-inline", "다이얼 전화기·타자기·LP 턴테이블 톤암·필름 카메라·즉석사진 하단 여백 좌우/상하 반전 방지는 Haiku 5.5 적용", 2_560),
  "localize:chemistry-microscope-centrifuge-astronomy-lock": defineRoute("localize:chemistry-microscope-centrifuge-astronomy-lock", "화학 뷰렛 적정/흄후드·현미경 대물렌즈 배율 색띠·원심분리기 대칭 밸런스·적도의 망원경 추봉/일기도 디렉터", "core-dialog", "creative-production", "이공계 실험실 초자류·현미경 배율·원심분리기 대칭·천체망원경 및 일기도 고저기압 고증은 Sonnet 5.5 적용", 4_096),
  "localize:equestrian-falconry-horology-gemstone-lock": defineRoute("localize:equestrian-falconry-horology-gemstone-lock", "승마 발볼 등자 밟기·매사냥 왼손 시치·시계 맞물린 기어 반대 회전·보석 프롱(4발/6발) 수량·조향사 디렉터", "core-dialog", "creative-production", "승마 등자 발볼 지지·매사냥 토시·스팀펑크 기어 회전 물리·보석 프롱 수량 고정은 Sonnet 5.5 적용", 4_096),
  "localize:film-slate-boom-cstand-broadcast-tally-lock": defineRoute("localize:film-slate-boom-cstand-broadcast-tally-lock", "영화 촬영장 슬레이트 Scene/Take 일치·붐마이크·C-스탠드 우측 조임 법칙·부조정실 녹색 프리뷰/적색 탈리 디렉터", "core-dialog", "creative-production", "촬영장 슬레이트·C-스탠드 모래주머니·방송국 부조정실 프리뷰/프로그램 모니터 일치는 Sonnet 5.5 적용", 4_096),
  "localize:school-csat-omr-tcg-dice-mahjong-lock": defineRoute("localize:school-csat-omr-tcg-dice-mahjong-lock", "한국 수능 OMR 답안지/학사모 술 방향·TCG 카드 90도 탭·주사위 마주보는 면 합(7/21)·마작 13패 고정 디렉터", "core-dialog", "creative-production", "수능 OMR/아날로그 시계·TCG 매트/탭 상태·주사위 마주보는 면 규칙·마작 손패 13장 고정은 Sonnet 5.5 적용", 4_096),
  "localize:amusement-coaster-ferris-camping-ski-director": defineRoute("localize:amusement-coaster-ferris-camping-ski-director", "롤러코스터 3륜 업스톱 휠·대관람차 곤돌라 중력 수평·인형뽑기 3발 집게·캠핑 텐트 45도 팩·스노보드 스탠스 총괄 감독", "core-dialog", "deep-architecture", "유원지 어트랙션 기구학·관람차 중력 수평·캠핑/설상 스포츠 장비 고증은 Opus 5.5 심층 추론 적용", 6_144),
  "localize:hourglass-candle-scale-book-paywall-director": defineRoute("localize:hourglass-candle-scale-book-paywall-director", "모래시계 34도 안식각·기울어진 촛대 수직 불꽃·천칭 저울·펼친 책 M자 곡면 왜곡 및 유료 쿠키 전환율 총괄 감독", "core-dialog", "deep-architecture", "모래시계/촛불/천칭/우산 물리·펼친 책 제본선 왜곡 투영·유료 미리보기 전환 훅 설계는 Opus 5.5 심층 추론 적용", 6_144),

  // 19. Wave 45~47 JoseonGatKatana/MensSuitHeel/SiegeHwacha/HanokOndol/ZombieLockpick/CyberServerCctv/ZoologyPupil/SignLanguageIsbn AI Engines (8)
  "localize:joseon-gat-binyeo-katana-saya-lock": defineRoute("localize:joseon-gat-binyeo-katana-saya-lock", "조선 흑립(갓) 양태 망사 투과·비녀 좌→우 꽂기·일본도 카타나(날 위쪽) vs 타치(날 아래쪽) 패용 고정기", "core-dialog", "fast-inline", "갓 양태 반투명 투과·비녀 좌우 방향·카타나/타치 칼날 패용 방향 반전 방지는 Haiku 5.5로 즉각 검증", 2_560),
  "localize:mens-suit-button-tie-heel-eyeglass-lock": defineRoute("localize:mens-suit-button-tie-heel-eyeglass-lock", "남성 정장 하단 단추 언버튼 규칙·넥타이 벨트 기장/딤플·스틸레토 힐 외측 버클·안경 코받침 고정기", "core-dialog", "fast-inline", "남성 수트/조끼 맨 아래 단추 오픈·넥타이 딤플/기장·구두 외측 버클·안경 코받침 고정은 Haiku 5.5 적용", 2_560),
  "localize:hwacha-geobukseon-trebuchet-joust-lock": defineRoute("localize:hwacha-geobukseon-trebuchet-joust-lock", "조선 신기전 화차(100발)·거북선 2층 포갑판/8자 노·트레뷰셋 평형추 투석기·마상창시합 좌측 교차 디렉터", "core-dialog", "creative-production", "화차 신기전/거북선 구조·트레뷰셋 평형추 투석·마상창시합 좌측 통행 고증은 Sonnet 5.5 적용", 4_096),
  "localize:hanok-ondol-bongsu-watermill-matchlock-lock": defineRoute("localize:hanok-ondol-bongsu-watermill-matchlock-lock", "한옥 아궁이-구들-굴뚝 배치·암키와/수키와·봉수대 5연 횃불 신호·물레방아 회전·조총 화승 격발 디렉터", "core-dialog", "creative-production", "한옥 온돌/기와·봉수대 5연 신호·물레방아 회전·조총 화접 점화 백연 고증은 Sonnet 5.5 적용", 4_096),
  "localize:zombie-barricade-gasmask-lockpick-laser-lock": defineRoute("localize:zombie-barricade-gasmask-lockpick-laser-lock", "문 개폐 방향 바리케이드·방독면 정화통/가이거 계수기·락픽 2도구(텐션렌치+픽)·보안 레이저 산란 디렉터", "core-dialog", "creative-production", "문 경첩 방향별 바리케이드·방독면 비주류손 정화통·락픽 2도구 파지·레이저 산란은 Sonnet 5.5 적용", 4_096),
  "localize:cyber-terminal-server-cctv-rooftop-lock": defineRoute("localize:cyber-terminal-server-cctv-rooftop-lock", "리눅스 터미널 유효 구문/IPv4 범위(0~255)·42U 서버랙 패치케이블·야간 CCTV 적외선 링·옥상 실외기 디렉터", "core-dialog", "creative-production", "해킹 터미널 CLI/유효 IPv4·42U 서버랙 배선·CCTV IR LED·옥상 설비 고증은 Sonnet 5.5 적용", 4_096),
  "localize:animal-pupil-spider-octopus-shark-director": defineRoute("localize:animal-pupil-spider-octopus-shark-director", "초식동물 수평 동공 vs 야행성 수직 동공·거미 두흉부 8다리·문어 2열 빨판·상어 수직 꼬리지느러미 총괄 감독", "core-dialog", "deep-architecture", "동물 동공 형태·절지동물 두흉부 다리 부착·두족류 빨판·어류/포유류 꼬리지느러미 감리는 Opus 5.5 심층 추론 적용", 6_144),
  "localize:sign-language-hearing-aid-isbn-archive-director": defineRoute("localize:sign-language-hearing-aid-isbn-archive-director", "한국수어(KSL) 수형/비수지 신호·보청기/인공와우/흰지팡이 고증 및 단행본 ISBN-13·도서관 납본 총괄 감독", "core-dialog", "deep-architecture", "한국수어 수동 화살표/비수지 신호·보청기/흰지팡이 고증·단행본 ISBN-13/납본 규격은 Opus 5.5 심층 추론 적용", 6_144),

  // 20. Wave 48~50 MurimPlumBagua/XianxiaSwordInn/CasinoHoldemAuction/GrandPianoWhisky/SupercarF1Yacht/DeepSeaSpacesuit/VolcanoGlacierDesert/CarrierBunkerBsl4 AI Engines (8)
  "localize:murim-plum-sword-tang-clan-bagua-lock": defineRoute("localize:murim-plum-sword-tang-clan-bagua-lock", "화산파 5꽃잎 매화검기·남궁세가 뇌전대검·사천당가 암기/독침·제갈세가 기문둔갑 팔진도·무당 불진/개방 타구봉 고정기", "core-dialog", "fast-inline", "무협 문파별 고유 검기/암기/진법/지물 시그니처 혼동 방지는 Haiku 5.5로 즉각 검증", 2_560),
  "localize:xianxia-flying-sword-inn-bamboo-scroll-lock": defineRoute("localize:xianxia-flying-sword-inn-bamboo-scroll-lock", "선협 어검비행 스탠스·연단로·객잔 2층 중정 난간/붉은천 술독·대나무 45도 절단·죽간/전서구/촌관척 진맥 고정기", "core-dialog", "fast-inline", "어검비행 균형·객잔 2층 중정 구조·대나무 사선 절단·죽간/진맥 고증은 Haiku 5.5 적용", 2_560),
  "localize:casino-baccarat-holdem-chips-auction-lock": defineRoute("localize:casino-baccarat-holdem-chips-auction-lock", "카지노 바카라 카드 쪼기(Squeeze)·텍사스 홀덤 5커뮤니티 카드·칩 액면가 색상 스택·미술품 경매장 패들 디렉터", "core-dialog", "creative-production", "바카라 카드 변 기호·홀덤 플랍/턴/리버·칩 액면가 스택·경매 패들 번호 고정은 Sonnet 5.5 적용", 4_096),
  "localize:grand-piano-lid-violin-cigar-whisky-lock": defineRoute("localize:grand-piano-lid-violin-cigar-whisky-lock", "그랜드피아노 우측 덮개 지지대·바이올린 좌측 턱받침/f홀·시가 커터/위스키 아이스볼·네이키드 에스프레소 디렉터", "core-dialog", "creative-production", "그랜드피아노 우측 개방·바이올린 구조·시가/위스키 아이스볼·바텀리스 포타필터는 Sonnet 5.5 적용", 4_096),
  "localize:supercar-door-f1-halo-yacht-jet-lock": defineRoute("localize:supercar-door-f1-halo-yacht-jet-lock", "슈퍼카 시저/걸윙 도어 경첩·F1 티타늄 헤일로/DRS·폴로 오른손 스틱·슈퍼요트 티크 데크·프라이빗 제트 디렉터", "core-dialog", "creative-production", "슈퍼카 도어 경첩·F1 헤일로·폴로 오른손 규칙·요트/전용기 실내 구조는 Sonnet 5.5 적용", 4_096),
  "localize:deep-sea-submersible-spacesuit-cryopod-lock": defineRoute("localize:deep-sea-submersible-spacesuit-cryopod-lock", "심해 잠수정 반구형 아크릴창/생물발광·우주정거장 7면 큐폴라/EVA 금도금 바이저·동면 포드 성에/체렌코프 광 디렉터", "core-dialog", "creative-production", "심해 잠수정 관측창·ISS 큐폴라/EVA 우주복·동면 캡슐 성에·체렌코프 청색광은 Sonnet 5.5 적용", 4_096),
  "localize:volcano-lava-glacier-crevasse-desert-director": defineRoute("localize:volcano-lava-glacier-crevasse-desert-director", "화산 용암 냉각 흑각/백열 균열·빙하 크레바스 청색 산란광/피켈 제동·사막 사구 34도 안식각/쇄빙선 총괄 감독", "core-dialog", "deep-architecture", "화산 용암 흑체복사·빙하 크레바스 다중산란·사막 사구 경사각·쇄빙선 물리는 Opus 5.5 심층 추론 적용", 6_144),
  "localize:aircraft-carrier-catapult-bunker-bsl4-director": defineRoute("localize:aircraft-carrier-catapult-bunker-bsl4-director", "항공모함 캐터펄트/어레스팅 와이어·수송기 강하 신호등·지하 벙커 방폭문 핸드휠·BSL-4 양압복/냉각탑 총괄 감독", "core-dialog", "deep-architecture", "항모 이착함 장치·수송기 정적줄·방공호 방폭문 기구학·BSL-4 양압복 감리는 Opus 5.5 심층 추론 적용", 6_144),

  // 21. Wave 51~53 AncientMythology/KoreanMilitary/SteampunkAirship/FloatingIslandDragon/KoreanMarketBbq/KoreanWeddingHwatu/Autonomous7StagePipeline/Supreme1020Meta AI Engines (8)
  "art-director:ancient-mythology-trireme-khopesh-rune-lock": defineRoute("art-director:ancient-mythology-trireme-khopesh-rune-lock", "그리스 삼단노선/코린트 주두·바이킹 롱쉽/룬 문자·이집트 코페시(외측 날)/우레우스·아즈텍 마쿠아후이틀 고정기", "core-dialog", "fast-inline", "고대 신화 선박·주두 양식·코페시 외측 날·룬 문자/히에로글리프 고증은 Haiku 5.5로 즉각 검증", 2_560),
  "art-director:korean-military-beret-k2-rifle-dogtag-lock": defineRoute("art-director:korean-military-beret-k2-rifle-dogtag-lock", "한국 육군 베레모 모표(왼눈 위)/우측 풀림·군번줄 2개(긴줄+짧은줄)·K2 소총 좌측 조정간/우측 장전손잡이 고정기", "core-dialog", "fast-inline", "한국군 베레모 기울기·군번줄 2매 구조·K2 소총 좌우 부품 반전 차단은 Haiku 5.5 적용", 2_560),
  "art-director:steampunk-airship-automaton-diving-plague-lock": defineRoute("art-director:steampunk-airship-automaton-diving-plague-lock", "스팀펑크 비행선 하부 곤돌라·부르동 압력계/보일러 수위관·태엽 오토마타·12볼트 구리 잠수모·흑사병 부리 마스크 디렉터", "core-dialog", "creative-production", "스팀펑크 비행선/압력계·태엽 오토마타·고전 잠수복·흑사병 의사 복식 고증은 Sonnet 5.5 적용", 4_096),
  "art-director:floating-island-world-tree-dragon-mimic-lock": defineRoute("art-director:floating-island-world-tree-dragon-mimic-lock", "부유섬 역원추 암반/폭포·세계수 판근/발광 잎맥·드래곤 레어 금화 34도 안식각·미믹 사슬 방향(앞쪽=미믹)·골렘 디렉터", "core-dialog", "creative-production", "부유섬 하부 지형·세계수 판근·드래곤 금화 산·미믹 사슬 식별법·골렘 관절은 Sonnet 5.5 적용", 4_096),
  "art-director:korean-market-bunsik-bbq-jjimjilbang-lock": defineRoute("art-director:korean-market-bunsik-bbq-jjimjilbang-lock", "전통시장 빨간 다라이/접시저울·분식집 사각 철판·고깃집 자바라 동파이프 후드·찜질방 양머리/식혜·코인세탁소 디렉터", "core-dialog", "creative-production", "한국 전통시장/분식집/고깃집 후드/찜질방 양머리/코인세탁소 생활 소품 고증은 Sonnet 5.5 적용", 4_096),
  "art-director:korean-wedding-paebaek-jesa-hwatu-transit-lock": defineRoute("art-director:korean-wedding-paebaek-jesa-hwatu-transit-lock", "전통 폐백 연지곤지/돌잡이·제사상 홍동백서/어동육서·화투 12월 패(5광/고도리)·지하철 우측 개찰구 태그/KTX 디렉터", "core-dialog", "creative-production", "폐백/제사상 진설 방위·화투 12월 화초/광·지하철 우측 단말기/KTX 좌석 고증은 Sonnet 5.5 적용", 4_096),
  "art-director:autonomous-7stage-pipeline-dna-hash-psd-director": defineRoute("art-director:autonomous-7stage-pipeline-dna-hash-psd-director", "7단 자율 에이전트 파이프라인·100화 캐릭터 DNA 해시 원장·인접 컷 3D 카메라 프러스텀·시맨틱 5그룹 PSD 총괄 감독", "core-dialog", "deep-architecture", "웹툰 7단 자율 파이프라인·100화 캐릭터 DNA 원장·카메라 프러스텀·Trapped-Ball 밑색 분리는 Opus 5.5 심층 추론 적용", 6_144),
  "art-director:toonstudio-1020-platform-supreme-meta-director": defineRoute("art-director:toonstudio-1020-platform-supreme-meta-director", "1,020대 글로벌 웹툰 AI 플랫폼 UI/UX 메타 오케스트레이터·12개국 동시연재 용어집·주파수 워터마크·쇼츠 PV 총괄 감독", "core-dialog", "deep-architecture", "1,020대 플랫폼 UI/UX 통합·12개국 용어집·비가시 워터마크·9:16 쇼츠 PV 설계는 Opus 5.5 심층 추론 적용", 6_144),

  // 22. Wave 54~56 AgeOfSail/WesternLocomotive/NoirSpy/SurgicalBdna/BridgeKeystoneHanok/StreamerBlender/GitKanbanSuperchat/Omniverse1080Supreme AI Engines (8)
  "art-director:age-of-sail-galleon-wheel-cannon-cutlass-lock": defineRoute("art-director:age-of-sail-galleon-wheel-cannon-cutlass-lock", "대항해시대 갈레온 가로돛/사다리줄·조타륜 왕살(King Spoke)·함포 브리칭 로프·커틀러스 바스켓 가드·보물지도 나침반 고정기", "core-dialog", "fast-inline", "범선 삭구/조타륜·함포 반동 로프·커틀러스 손등 가드·나침반 북쪽 백합 문양 고정은 Haiku 5.5로 즉각 검증", 2_560),
  "art-director:western-revolver-winchester-saloon-locomotive-lock": defineRoute("art-director:western-revolver-winchester-saloon-locomotive-lock", "서부극 콜트 리볼버 우측 추출봉/패닝·윈체스터 우측 급탄구·살룬 양방향 스윙도어·보안관 배지(좌가슴)·증기기관차 배장기 고정기", "core-dialog", "fast-inline", "콜트 리볼버/윈체스터 좌우 구조·살룬 스윙도어·보안관 별 배지·증기기관차 커넥팅 로드 고정은 Haiku 5.5 적용", 2_560),
  "art-director:noir-trenchcoat-fedora-venetian-blind-spy-lock": defineRoute("art-director:noir-trenchcoat-fedora-venetian-blind-spy-lock", "누아르 트렌치코트 우측 건플랩/D링·페도라 핀치·베네치안 블라인드 그림자·톰슨 드럼탄창·소음기 동축·미녹스 카메라 디렉터", "core-dialog", "creative-production", "트렌치코트 건플랩·베네치안 블라인드 줄무늬 그림자·톰슨/소음기 총기·냉전 스파이 소품 고증은 Sonnet 5.5 적용", 4_096),
  "art-director:surgical-light-ecmo-triage-blood-bag-bdna-lock": defineRoute("art-director:surgical-light-ecmo-triage-blood-bag-bdna-lock", "수술실 무영등·마취기 벨로우즈·ECMO 정맥/동맥혈 색상·트리아지 4색 태그·수혈 점적통 50% 수위·오른나사 B-DNA 디렉터", "core-dialog", "creative-production", "수술실 무영등/ECMO·응급 트리아지 태그·수혈 점적통·오른나사 B-DNA 이중나선 회전 방향 고정은 Sonnet 5.5 적용", 4_096),
  "art-director:suspension-bridge-arch-keystone-hanok-door-tbm-lock": defineRoute("art-director:suspension-bridge-arch-keystone-hanok-door-tbm-lock", "현수교(포물선+수직 행어) vs 사장교(직선 사선)·아치 중앙 쐐기 종석·고딕 플라잉 버트레스·한옥 들어열개문 걸쇠·TBM 디렉터", "core-dialog", "creative-production", "현수교/사장교 구분·석조 아치 종석·한옥 대청마루 들어열개문·엘리베이터 균형추/TBM 터널 고증은 Sonnet 5.5 적용", 4_096),
  "art-director:streamer-mic-ringlight-cintiq-blender-node-lock": defineRoute("art-director:streamer-mic-ringlight-cintiq-blender-node-lock", "사이드 어드레스 콘덴서 마이크(측면 수음)·링라이트 도넛 캐치라이트·15키 스트림덱·신티크 왼손 투어박스·블렌더 노드 디렉터", "core-dialog", "creative-production", "스트리머 마이크 측면 수음·링라이트 눈동자 도넛 반사·작가 타블렛/투어박스·3D 노드 소켓 색상은 Sonnet 5.5 적용", 4_096),
  "art-director:git-diff-kanban-discord-superchat-shorts-director": defineRoute("art-director:git-diff-kanban-discord-superchat-shorts-director", "깃 브랜치/PR Diff(초록+/빨강-)·웹툰 6단 마감 칸반·디스코드 발화 그린 링·슈퍼챗 금액 티어·9:16 숏폼 세이프존 총괄 감독", "core-dialog", "deep-architecture", "개발자 깃 Diff·웹툰 마감 칸반·디스코드/슈퍼챗 UI·9:16 숏폼 세이프존 총괄 설계는 Opus 5.5 심층 추론 적용", 6_144),
  "art-director:toonstudio-1080-omniverse-dcf-stroke-supreme-director": defineRoute("art-director:toonstudio-1080-omniverse-dcf-stroke-supreme-director", "1,080대 웹툰 AI 플랫폼 옴니버스 수프림 엔진·180대 스마트 라우팅·쿠키 미리보기 UX·웹툰 IP DCF 가치평가·선화 예측 총괄 감독", "core-dialog", "deep-architecture", "1,080대 플랫폼 UI/UX 통합·180개 스마트 라우팅·웹툰 IP DCF 가치평가·신경망 선화 예측은 Opus 5.5 심층 추론 적용", 6_144),
  // 23. Wave 57~59 JongmyoGayageum/HahoeLianpuToga/PipeOrganHarp/F1WrcSkydiving/MarshallerLighthouseClock/GlassblowingLuthierLoupe/3dgsNerfControlnet4Facs/HyperSynthesis1140LegalOst AI Engines (8)
  "alt-text:jongmyo-gayageum-geomungo-daegeum-janggu-lock": defineRoute("alt-text:jongmyo-gayageum-geomungo-daegeum-janggu-lock", "종묘제례악 편종/편경 16개·축/어·가야금 12현 안족·거문고 오른손 술대·대금 청공·장구 궁편(좌)/열편(우) 고정기", "core-dialog", "fast-inline", "종묘제례악 편종/편경·가야금 안족·거문고 술대·장구 좌우 궁편/열편 구분은 Haiku 5.5로 즉각 검증", 2_560),
  "alt-text:hahoe-mask-lianpu-kabuki-toga-thurible-lock": defineRoute("alt-text:hahoe-mask-lianpu-kabuki-toga-thurible-lock", "하회탈 양반 분리 턱·경극 검프 색상(적/흑/백)·가부키 쿠마도리/노멘·로마 토가 좌측 어깨 드레이프·성당 4사슬 향로 고정기", "core-dialog", "fast-inline", "하회탈 분리 턱·경극 검프 색상·가부키/노멘·로마 토가 좌측 어깨·성당 향로 사슬 고정은 Haiku 5.5 적용", 2_560),
  "alt-text:pipe-organ-pedal-harp-accordion-bagpipe-lock": defineRoute("alt-text:pipe-organ-pedal-harp-accordion-bagpipe-lock", "파이프 오르간 다단 건반/스톱/발건반·콘서트 하프 47현(빨간 C/파란 F)·아코디언 좌우·백파이프 3드론 디렉터", "core-dialog", "creative-production", "파이프 오르간 건반·하프 적청 기준현/오른쪽 어깨·아코디언 좌우·백파이프 3드론 고증은 Sonnet 5.5 적용", 4_096),
  "alt-text:f1-kerb-wrc-rollcage-skydiving-surfing-yacht-lock": defineRoute("alt-text:f1-kerb-wrc-rollcage-skydiving-surfing-yacht-lock", "F1 연석/타이어 컴파운드·WRC 롤케이지/페이스노트·스카이다이빙 왼손목 고도계·서핑 뒷발목 리쉬코드·요트 하이크아웃 디렉터", "core-dialog", "creative-production", "F1/WRC 모터스포츠·스카이다이빙 고도계·서핑 뒷발 리쉬·요트 하이크아웃 물리 고증은 Sonnet 5.5 적용", 4_096),
  "alt-text:marshaller-lighthouse-antarctic-observatory-clock-lock": defineRoute("alt-text:marshaller-lighthouse-antarctic-observatory-clock-lock", "항공기 유도 마샬러 수신호·원양어선 양승기·등대 프레넬 렌즈·남극 2량 설상차·천문대 돔 슬릿·시계탑 탈진기 디렉터", "core-dialog", "creative-production", "공항 마샬러·등대 프레넬 렌즈·남극 설상차·천문대 돔·시계탑 내부 탈진기 역투시 고증은 Sonnet 5.5 적용", 4_096),
  "alt-text:glassblowing-luthier-diamond-loupe-shoemaker-lock": defineRoute("alt-text:glassblowing-luthier-diamond-loupe-shoemaker-lock", "유리공예 파이프 회전·바이올린 루시어 썸플레인/사운드포스트·보석 감정 10배율 루페 눈가 밀착·수제화 구두골/고서 제책 디렉터", "core-dialog", "creative-production", "유리공예 파이프·루시어 사운드포스트·보석 루페 눈가 밀착·수제화 구두골·고서 제책 고증은 Sonnet 5.5 적용", 4_096),
  "alt-text:3dgs-nerf-controlnet4-facs-sfx3d-saccade-director": defineRoute("alt-text:3dgs-nerf-controlnet4-facs-sfx3d-saccade-director", "3D 가우시안 스플래팅(3DGS)/NeRF 다중 컷 조명·4채널 ControlNet·FACS 뒤센 미소·3D SFX 워프·도약 안구운동(Saccade) 히트맵 총괄 감독", "core-dialog", "deep-architecture", "3DGS/NeRF 조명장·ControlNet 4중 믹서·FACS 안면 근육·독자 시선 히트맵/스크롤 텐션 설계는 Opus 5.5 심층 추론 적용", 6_144),
  "alt-text:toonstudio-1140-hyper-synthesis-legal-ost-director": defineRoute("alt-text:toonstudio-1140-hyper-synthesis-legal-ost-director", "1,140대 웹툰 AI 플랫폼 하이퍼 신세시스·188대 스마트 라우팅·70컷 게이지·PSD 차분 백업·계약서 독소조항 AI 법률 스캐너 총괄 감독", "core-dialog", "deep-architecture", "1,140대 플랫폼 UI/UX 초융합·188개 스마트 라우팅·PSD 차분 백업·계약서 독소조항 법률 스캐너는 Opus 5.5 심층 추론 적용", 6_144),
});

export interface ResolvedCreatorTaskRoute extends ClaudeCreatorTaskRoute {
  readonly explicitOverride: boolean;
  readonly mergedOptions: ClaudeCreateOptions;
}

/**
 * 기능별 `taskId`와 호출자 `options`를 받아 최적의 Claude 모델·effort·maxTokens가 채워진
 * `mergedOptions`와 라우팅 메타데이터를 반환합니다.
 * 호출자가 `options.model`이나 `options.effort`를 명시한 경우 그 값을 그대로 유지합니다.
 */
export function resolveCreatorTaskModelRoute(
  taskId: ClaudeCreatorTaskId,
  options: ClaudeCreateOptions = {},
): ResolvedCreatorTaskRoute {
  const baseRoute = CLAUDE_CREATOR_TASK_ROUTES[taskId];
  const profileSpec = CLAUDE_CREATOR_TASK_PROFILES[baseRoute.profile];
  const explicitOverride = options.model !== undefined;
  const resolvedModel = (options.model as ClaudeModelId | undefined) ?? baseRoute.model;
  const resolvedEffort = options.effort ?? baseRoute.effort;
  const resolvedMaxTokens = options.maxTokens ?? baseRoute.maxTokens;
  const resolvedTemperature = options.temperature ?? profileSpec.defaultTemperature;

  return Object.freeze({
    ...baseRoute,
    model: resolvedModel,
    effort: resolvedEffort,
    maxTokens: resolvedMaxTokens,
    explicitOverride,
    mergedOptions: {
      ...options,
      model: resolvedModel,
      effort: resolvedEffort,
      maxTokens: resolvedMaxTokens,
      temperature: resolvedTemperature,
    },
  });
}

export interface CreatorModelRouterSummary {
  readonly totalTasks: number;
  readonly byProfile: Readonly<Record<ClaudeCreatorTaskProfile, number>>;
  readonly byModel: Readonly<Record<ClaudeModelId, number>>;
  readonly routes: readonly ClaudeCreatorTaskRoute[];
}

export function summarizeCreatorModelRouterCatalog(): CreatorModelRouterSummary {
  const routes = Object.values(CLAUDE_CREATOR_TASK_ROUTES);
  const byProfile: Record<ClaudeCreatorTaskProfile, number> = {
    "fast-inline": 0,
    "creative-production": 0,
    "deep-architecture": 0,
  };
  const byModel: Record<ClaudeModelId, number> = {
    "claude-haiku-5-5": 0,
    "claude-sonnet-5-5": 0,
    "claude-opus-5-5": 0,
  };
  for (const route of routes) {
    byProfile[route.profile] += 1;
    byModel[route.model] += 1;
  }
  return Object.freeze({
    totalTasks: routes.length,
    byProfile: Object.freeze(byProfile),
    byModel: Object.freeze(byModel),
    routes: Object.freeze(routes),
  });
}
