export type ClaudeModelId =
  | "claude-haiku-5-5"
  | "claude-sonnet-5-5"
  | "claude-opus-5-5";

export type ClaudeEffortLevel = "low" | "medium" | "high";

export interface ClaudeCreateOptions {
  readonly model?: ClaudeModelId;
  readonly effort?: ClaudeEffortLevel;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

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
  | "n7-llm-runner";

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
  | "localize:global-ip-mg-rs-royalty-waterfall-director";

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
  "core:art-director": defineRoute(
    "core:art-director",
    "AI 아트 디렉터 피드백",
    "core-dialog",
    "creative-production",
    "페이지 구도·명암·4레이어 액션 매핑은 Sonnet 5.5의 시각 연출 분석이 최적",
    2_048,
  ),
  "core:command-plan": defineRoute(
    "core:command-plan",
    "AI 자연어 캔버스 커맨드 플랜",
    "core-dialog",
    "fast-inline",
    "자연어 명령→캔버스 액션 변환은 지연시간 최소화를 위해 Haiku 5.5 배치",
    1_536,
  ),
  "core:localize": defineRoute(
    "core:localize",
    "AI 다국어 식자·문화권 번역",
    "core-dialog",
    "creative-production",
    "문화권 뉘앙스 보존 및 42자 말풍선 예산 준수는 Sonnet 5.5가 최적",
    2_048,
  ),
  "core:alt-text": defineRoute(
    "core:alt-text",
    "AI 접근성 대체 텍스트·오디오툰 내레이션",
    "core-dialog",
    "fast-inline",
    "컷별 대체 텍스트 및 오디오 내레이션 생성은 Haiku 5.5로 빠르게 처리",
    1_200,
  ),

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
  "nextgen:retention-simulator": defineRoute(
    "nextgen:retention-simulator",
    "독자 이탈 구간·별점 예측 시뮬레이터",
    "nextgen-studio",
    "deep-architecture",
    "컷별 스크롤 잔존율·쿠키 결제 전환율 예측은 Opus 5.5 심층 추론 적용",
    3_072,
  ),
  "nextgen:ooc-voice-doctor": defineRoute(
    "nextgen:ooc-voice-doctor",
    "캐릭터 보이스 OOC(캐붕) 실시간 교정기",
    "nextgen-studio",
    "creative-production",
    "화자별 존대/반말 레지스터 및 말버릇 교정은 Sonnet 5.5 적용",
    2_048,
  ),
  "nextgen:audio-cuesheet-director": defineRoute(
    "nextgen:audio-cuesheet-director",
    "웹툰 BGM·오디오툰 큐시트 디렉터",
    "nextgen-studio",
    "creative-production",
    "스크롤 구간별 BGM BPM·폴리 사운드·성우 디렉팅은 Sonnet 5.5 적용",
    2_048,
  ),
  "nextgen:3d-asset-placement": defineRoute(
    "nextgen:3d-asset-placement",
    "3D 배경·소품·카메라 렌즈 배치 추천기",
    "nextgen-studio",
    "creative-production",
    "18~85mm 렌즈 화각·소실점·3D 에셋 배치는 Sonnet 5.5 적용",
    2_048,
  ),
  "nextgen:visual-continuity-linter": defineRoute(
    "nextgen:visual-continuity-linter",
    "전 회차 컷간 작붕(비대칭 흉터·검집 반전·소품 증발·부상 초기화·그림자 방향) 자동 검출 린터",
    "nextgen-studio",
    "deep-architecture",
    "다중 컷 사이의 해부학적 좌우 반전·소품 증발·배경 투시·부상 누적 불일치 정밀 감사는 Opus 5.5 심층 추론 적용",
    4_096,
  ),
  "nextgen:multi-episode-canon-vault": defineRoute(
    "nextgen:multi-episode-canon-vault",
    "장편 연재(1~100화) 캐릭터·세계관·복선·비주얼 캐논 메모리 볼트 디렉터",
    "nextgen-studio",
    "creative-production",
    "회차 간 시간 경과·인물 호칭·복장/외형 변천사·미회수 떡밥 캐논 볼트 동기화는 Sonnet 5.5 적용",
    4_096,
  ),
  "nextgen:footwear-floor-contact-stride-lock": defineRoute("nextgen:footwear-floor-contact-stride-lock", "구두·부츠·군화 굽 높이(Heel Height) & 계단/경사로/바닥 접지 보폭(Stride Mechanics) 연속성 감독", "nextgen-studio", "fast-inline", "컷간 신발 굽 높이·부츠 버클/끈 디테일 증발 방지 및 계단/경사로 발바닥 접지 각도 고정은 Haiku 5.5 적용", 2_560),
  "nextgen:crowd-silhouette-depth-fog-lock": defineRoute("nextgen:crowd-silhouette-depth-fog-lock", "전경·중경·원경 군중(Crowd) 실루엣 밀도 & 대기 원근(Atmospheric Depth Fog)·선 굵기 감쇠 일관성 감독", "nextgen-studio", "creative-production", "주연(1.0x)·중경 엑스트라(0.65x)·원경 군중(0.35x) 선 굵기 계층 및 대기 원근 안개 채도 감쇠 고정은 Sonnet 5.5 적용", 3_584),

  // 4. Phase 5 Competitor Full Suite
  "competitor:beluga-clipstudio-production": defineRoute(
    "competitor:beluga-clipstudio-production",
    "벨루가 & 클립스튜디오 7공정·포즈·음영 디렉터",
    "competitor-suite",
    "creative-production",
    "7단계 작화 공정·3D 관절 포즈·그림자 해칭 설계는 Sonnet 5.5 적용",
    2_560,
  ),
  "competitor:onoma-kakaopage-ip": defineRoute(
    "competitor:onoma-kakaopage-ip",
    "오노마AI & 카카오페이지 IP 가치·런칭 패키저",
    "competitor-suite",
    "deep-architecture",
    "글로벌 팬덤 타깃·2차 영상화 가치·키비주얼/트레일러 설계는 Opus 5.5 적용",
    3_072,
  ),
  "competitor:llamagen-manga-ai": defineRoute(
    "competitor:llamagen-manga-ai",
    "LlamaGen & 다쉬툰 만화 스크린톤·페이지 변환기",
    "competitor-suite",
    "creative-production",
    "세로 웹툰→출판 만화 페이지 레이아웃·모아레 방지 스크린톤 설계는 Sonnet 5.5 적용",
    2_560,
  ),
  "competitor:turnaround-orthographic-sheet-lock": defineRoute(
    "competitor:turnaround-orthographic-sheet-lock",
    "360° 5뷰(정면·좌/우 측면·후면·반측면) 턴어라운드 정투영 비율 & 장신구/문양 기하 일관성 고정기",
    "competitor-suite",
    "creative-production",
    "5방향 정투영 등신대 기준선(정수리·눈·어깨·골반·발끝) 정렬 및 비대칭 장신구/등문양 360도 기하 락은 Sonnet 5.5 적용",
    3_584,
  ),
  "competitor:background-perspective-prop-scale-lock": defineRoute(
    "competitor:background-perspective-prop-scale-lock",
    "3D 배경 투시 그리드(1/2/3점 소실점) ↔ 2D 인물 발 접지(Foot Contact) · 가구/문틀/소품 인체 비례 일관성 감독",
    "competitor-suite",
    "deep-architecture",
    "3D 배경 지평선(Eye-Line)·소실점과 2D 캐릭터 발바닥 접지 각도·문틀/책상/마차 대비 인체 스케일 왜곡 교정은 Opus 5.5 적용",
    4_096,
  ),
  "competitor:speech-bubble-tail-occlusion-lock": defineRoute(
    "competitor:speech-bubble-tail-occlusion-lock",
    "말풍선·효과음(SFX) 안면/눈빛/핵심 액션 비가림(Anti-Occlusion) 안전 영역 & 화자 입 방향 꼬리 벡터 고정기",
    "competitor-suite",
    "fast-inline",
    "인물 얼굴·동공·손동작 가림 0% 보장 여백 좌표 계산 및 화자 입 중심 말풍선 꼬리 벡터 잠금은 Haiku 5.5 적용",
    2_560,
  ),
  "competitor:action-weapon-motion-arc-smear-lock": defineRoute(
    "competitor:action-weapon-motion-arc-smear-lock",
    "검격·마법·타격 궤적(Motion Arc) 연속성 · 잔상(Smear Frame) · 타격 역경직(Hit-Stop) 물리 일관성 감독",
    "competitor-suite",
    "creative-production",
    "연속 전투 컷 사이의 검기 궤적 벡터 일치·잔상(Smear) 왜곡률·집중선 수렴점·역경직 연출은 Sonnet 5.5 적용",
    3_584,
  ),

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
  const resolvedModel = options.model ?? baseRoute.model;
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
