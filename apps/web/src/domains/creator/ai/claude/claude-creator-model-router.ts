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
  // 2. Storyboard & Production Suite (7)
  | "production:storyboard-cut-breakdown"
  | "production:scroll-rhythm-doctor"
  | "production:color-mood-script"
  | "production:continuity-foreshadow"
  | "production:sfx-typo-director"
  | "production:multi-character-crowd-wardrobe-lock"
  | "production:weather-particle-time-progression-lock"
  // 3. Next-Gen Suite (6)
  | "nextgen:retention-simulator"
  | "nextgen:ooc-voice-doctor"
  | "nextgen:audio-cuesheet-director"
  | "nextgen:3d-asset-placement"
  | "nextgen:visual-continuity-linter"
  | "nextgen:multi-episode-canon-vault"
  // 4. Phase 5 Competitor Full Suite (5)
  | "competitor:beluga-clipstudio-production"
  | "competitor:onoma-kakaopage-ip"
  | "competitor:llamagen-manga-ai"
  | "competitor:turnaround-orthographic-sheet-lock"
  | "competitor:background-perspective-prop-scale-lock"
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
  | "rea15:mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle";

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
  "production:storyboard-cut-breakdown": defineRoute(
    "production:storyboard-cut-breakdown",
    "웹툰 컷 콘티 브레이크다운",
    "storyboard-production",
    "creative-production",
    "대본→컷 구도·카메라·조명·말풍선 분해는 Sonnet 5.5 표준 연출 티어",
    2_560,
  ),
  "production:scroll-rhythm-doctor": defineRoute(
    "production:scroll-rhythm-doctor",
    "모바일 스크롤 호흡·시선 유도 닥터",
    "storyboard-production",
    "creative-production",
    "390×844 뷰포트 여백·시선 S-curve 진단은 Sonnet 5.5 적용",
    2_048,
  ),
  "production:color-mood-script": defineRoute(
    "production:color-mood-script",
    "컬러·조명 무드 스크립트 디렉터",
    "storyboard-production",
    "creative-production",
    "감정선 기반 HEX 팔레트·4레이어 조명 설계는 Sonnet 5.5 적용",
    2_048,
  ),
  "production:continuity-foreshadow": defineRoute(
    "production:continuity-foreshadow",
    "설정 연속성·복선 감수 어시스턴트",
    "storyboard-production",
    "deep-architecture",
    "다중 컷 의상·소품 연속성 및 복선 회수 감수는 Opus 5.5 심층 추론 적용",
    3_072,
  ),
  "production:sfx-typo-director": defineRoute(
    "production:sfx-typo-director",
    "효과음(SFX)·타이포 연출 디렉터",
    "storyboard-production",
    "creative-production",
    "의성어/의태어 타이포그래피·워프·배치 연출은 Sonnet 5.5 적용",
    2_048,
  ),
  "production:multi-character-crowd-wardrobe-lock": defineRoute(
    "production:multi-character-crowd-wardrobe-lock",
    "다중 등장인물·조연·엑스트라 제복/문장(Crest)/계급장 복식 규율 일관성 디렉터",
    "storyboard-production",
    "creative-production",
    "학원·황궁·기사단·길드 제복 컬러코드·견장/휘장 위치·신분별 소품 혼선 차단은 Sonnet 5.5 적용",
    3_072,
  ),
  "production:weather-particle-time-progression-lock": defineRoute(
    "production:weather-particle-time-progression-lock",
    "컷간 날씨(비·눈·안개)·젖은 머리카락/의상 투과도·시간 경과(그림자 길이·노을→야간) 물리 연속성 고정기",
    "storyboard-production",
    "fast-inline",
    "컷간 강우/강설 파티클 밀도·젖은 의상/모발 광택 지속 시간·태양 고도각에 따른 그림자 비율 잠금은 Haiku 5.5 적용",
    2_560,
  ),

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
  "rea15:glimnavi-relight-lineart-v23": defineRoute(
    "rea15:glimnavi-relight-lineart-v23",
    "그림나비(GlimNavi) Studio v2.3 5종 선화·6종 프리셋·컬러 분리·Relight 디렉터",
    "phase6-ecosystem",
    "fast-inline",
    "선화 v1.0~v2.3 버전·6종 선화 프리셋·컬러 레이어 분리·AI 그림자/조명/명암 파라미터 산출은 Haiku 5.5로 즉각 처리",
    3_072,
  ),
  "rea15:kaistory-single-envelope-kaion-quiz": defineRoute(
    "rea15:kaistory-single-envelope-kaion-quiz",
    "카이스토리(KAISTORY) 4단 단일 데이터 엔벨로프 & KAION 웹툰 학습카드·독자 퀴즈 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "conti→design→editor→story 단일 프로젝트 엔벨로프와 KAION 학습카드·독자 몰입 퀴즈 생성은 Sonnet 5.5 적용",
    4_096,
  ),
  "rea15:snaptoon-frameo-shaper-3d-lighting": defineRoute(
    "rea15:snaptoon-frameo-shaper-3d-lighting",
    "Snaptoon·Frameo·NAVER SHAPER·Plask·Posemaniacs 3D 포즈·스포트라이트 콘 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "Snapboard 3D→AI 변환·Frameo 스포트라이트 콘(--cursor-angle/--cone-spread)·SHAPER 3D 표면 드로잉/포즈·해부학 리그는 Sonnet 5.5 적용",
    4_096,
  ),
  "rea15:manhwa-komiko-anifusion-flow": defineRoute(
    "rea15:manhwa-komiko-anifusion-flow",
    "ManhwaAI 6대 화풍/5대 톤·Komiko 레이어 분리/인비트윈·Anifusion 노드 플로우 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "6대 만화 화풍·5대 절차적 효과톤·비파괴 레이어 분리·노드 플로우 그래프 설계는 Sonnet 5.5 적용",
    4_096,
  ),
  "rea15:creative-dopamine-scroll-ux-synthesizer": defineRoute(
    "rea15:creative-dopamine-scroll-ux-synthesizer",
    "웹툰 독자 도파민·스크롤 정지 히트맵 시뮬레이터 & 39대 플랫폼 UI/UX 테마 토큰 합성기",
    "phase6-ecosystem",
    "deep-architecture",
    "컷별 독자 도파민 곡선·스크롤 정지 시간(ms)·클리프행어 훅 강도 예측 및 39대 REA UI/UX 테마 합성은 Opus 5.5 심층 추론 적용",
    6_144,
  ),
  "rea15:tootoon-gentoon-tooning-kr-suite": defineRoute(
    "rea15:tootoon-gentoon-tooning-kr-suite",
    "TooToon 5-Studio(fabulator~emporium) · GenToon 리더/굿즈 · Tooning 6부위 캐릭터 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "TooToon 5대 모듈·GenToon 뷰어/굿즈 수익화·Tooning Plus 6부위 캐릭터 조합 설계는 Sonnet 5.5 적용",
    4_096,
  ),
  "rea15:krea-spline-lumiere-realtime-shader": defineRoute(
    "rea15:krea-spline-lumiere-realtime-shader",
    "Krea 실시간 디렉터 · Spline 3D/Hana 스타일 트랜스퍼 · Lumiere/Graphite/PixiEditor 셰이더 디렉터",
    "phase6-ecosystem",
    "fast-inline",
    "실시간 i2i 브러시·Spline 3D 스타일 전이·Lumiere Kuwahara/Halation 셰이더·비파괴 노드 파라미터 산출은 Haiku 5.5로 즉각 처리",
    3_072,
  ),
  "rea15:ltx-boords-cascadeur-rive-animatic": defineRoute(
    "rea15:ltx-boords-cascadeur-rive-animatic",
    "LTX Studio · Boords 애니매틱 · Cascadeur 물리 오토포징 · Rive/Jitter 상태머신 디렉터",
    "phase6-ecosystem",
    "deep-architecture",
    "프리비즈 애니매틱 카메라 시퀀스·Cascadeur 무게중심/탄도 물리 궤적·Rive 인터랙티브 상태머신 설계는 Opus 5.5 심층 추론 적용",
    6_144,
  ),
  "rea15:cotrans-vroid-skybox-world-localizer": defineRoute(
    "rea15:cotrans-vroid-skybox-world-localizer",
    "Cotrans 식자 인페인팅 · VRoid 3D VRM 아바타 · Blockade Skybox 360° 월드 로컬라이저",
    "phase6-ecosystem",
    "creative-production",
    "다국어 식자 LaMa/AOT 인페인팅 마스크·VRoid VRM 본/외곽선·360도 파노라마 스카이박스 환경 매칭은 Sonnet 5.5 적용",
    4_096,
  ),
  "rea15:storyboarder-dreams-krita-artbreeder-director": defineRoute(
    "rea15:storyboarder-dreams-krita-artbreeder-director",
    "WonderUnit Shot Generator · Procreate Dreams 퍼포밍 · Krita Diffusion · Artbreeder 유전자 디렉터",
    "phase6-ecosystem",
    "deep-architecture",
    "3D Shot Generator 카메라·Procreate Dreams 실시간 퍼포밍 키프레임·Krita Live Diffusion·Artbreeder 유전자 교배 통합 설계는 Opus 5.5 심층 추론 적용",
    6_144,
  ),
  "rea15:niji-pixai-civitai-lora-sref-director": defineRoute(
    "rea15:niji-pixai-civitai-lora-sref-director",
    "NijiJourney V6 · PixAI · Civitai · TensorArt · WaifuLabs · Picrew · CHARAT LoRA/Sref/파츠 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "Niji V6 --sref/--cref 가중치·PixAI/Civitai/SeaArt/TensorArt LoRA 스택·WaifuLabs 4단 그리드·Picrew/CHARAT 파츠 레이어 설계는 Sonnet 5.5 적용",
    4_096,
  ),
  "rea15:tripo-meshy-heroforge-suno-elevenlabs-osmu": defineRoute(
    "rea15:tripo-meshy-heroforge-suno-elevenlabs-osmu",
    "Tripo3D · Meshy 7 · HeroForge 3D 소품/갑주 · Suno V6 OST · ElevenLabs 더빙 · MANGA Plus 디렉터",
    "phase6-ecosystem",
    "deep-architecture",
    "Tripo3D/Meshy 7/HeroForge 3D 판타지 소품·갑주 메쉬·Suno V6 스템 OST·ElevenLabs 다중 성우 더빙·MANGA Plus 글로벌 투고 패키징은 Opus 5.5 심층 추론 적용",
    6_144,
  ),
  "rea15:runway-luma-pika-viggle-live2d-spine-motion": defineRoute(
    "rea15:runway-luma-pika-viggle-live2d-spine-motion",
    "Runway Gen-4.5 · Luma Ray 2 · Pika 2.2 · Viggle JST-2 · Live2D Cubism · Spine 2D 무빙툰 디렉터",
    "phase6-ecosystem",
    "deep-architecture",
    "Runway Multi-Motion Brush·Luma Start/End 키프레임·Pika 물리 이펙트·Viggle JST-2 모션 전이·Live2D ArtMesh/Spine 2D IK 본 리깅 통합 설계는 Opus 5.5 심층 추론 적용",
    6_144,
  ),
  "rea15:sketchup-blender-petalica-magma-recraft-studio": defineRoute(
    "rea15:sketchup-blender-petalica-magma-recraft-studio",
    "SketchUp 3D · Blender Grease Pencil · Petalica 채색 · Magma 30인 협업 · Recraft SVG · Cara Glaze 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "SketchUp 동적 컴포넌트/은선·Blender Grease Pencil 3D 스트로크·Petalica 3종 채색·Magma 멀티유저 협업·Recraft SVG 벡터·Cara Glaze 보호 설계는 Sonnet 5.5 적용",
    4_096,
  ),
  "rea15:tapas-tappytoon-ridi-postype-sudowrite-novelcrafter": defineRoute(
    "rea15:tapas-tappytoon-ridi-postype-sudowrite-novelcrafter",
    "Tapas · Tappytoon · RIDI · Postype 글로벌/노블코믹스 연재 & Sudowrite · Novelcrafter · Campfire 코덱스 디렉터",
    "phase6-ecosystem",
    "deep-architecture",
    "북미/유럽/한국 4대 연재 플랫폼(Tapas·Tappytoon·RIDI·Postype) 규격·수익화 퍼널과 Sudowrite/Novelcrafter/Campfire 세계관 코덱스·씬 비트 매트릭스 통합 설계는 Opus 5.5 심층 추론 적용",
    6_144,
  ),
  "rea15:mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle": defineRoute(
    "rea15:mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle",
    "Mixamo 모션 · Marvelous 의상 · Substance 재질 · Coolors/Adobe 배색 · 눈누/Blambot 식자 · ToonBoom/TVPaint/Moho · Eagle 에셋 디렉터",
    "phase6-ecosystem",
    "creative-production",
    "Mixamo 3D 모션캡처·Marvelous 의상 주름·Substance 툰 머티리얼·Coolors/Adobe 배색·눈누/Blambot 한영 식자·ToonBoom/TVPaint/Moho 작화·PureRef/Milanote/Eagle 에셋 관리는 Sonnet 5.5 적용",
    4_096,
  ),
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
