/**
 * Next-Gen Virtual Webtoon Studio Engine Types & Static Catalog Data (Nano Banana v11 + REA Competitor Benchmarks).
 */

export type NanoBananaStudioThemeId =
  | "seoul-editorial-hq"
  | "cyber-neon-lab"
  | "hanok-botanical-atelier"
  | "lofi-cat-storyhouse"
  | "romance-palace-conservatory"
  | "murim-bamboo-pavilion"
  | "scifi-orbital-command"
  | "brooklyn-indie-comics-loft";

export type NanoBananaCreatorPersonaId =
  | "line-artist"
  | "cgi-director"
  | "colorist"
  | "chief-pd"
  | "story-writer"
  | "action-mocap-actor"
  | "sound-letterer"
  | "studio-cat-mascot";

export type CreatorPersonaPose = "idle" | "work";

export type StudioLightingMoodId =
  | "dawn-ink"
  | "daylight-studio"
  | "golden-sunset"
  | "midnight-crunch-fever";

export type EpisodeCutPipelineStage =
  | "storyboard"
  | "line-art"
  | "base-color"
  | "shading-vfx"
  | "typeset-approved";

export type StudioSoundscapeChannelId =
  | "wacom-pen-asmr"
  | "mech-keyboard-thock"
  | "espresso-lofi-pad"
  | "rooftop-rain-breeze"
  | "page-flip-chime";

export interface NextGenCompetitorReaBenchmark {
  readonly id: string;
  readonly competitorName: string;
  readonly reverseEngineeredMechanism: string;
  readonly toonStudioSuperiorUpgradeKo: string;
  readonly latencyOrPhysicsMetric: string;
}

export interface NanoBananaStudioThemeSpec {
  readonly id: NanoBananaStudioThemeId;
  readonly titleKo: string;
  readonly subtitleKo: string;
  readonly atmosphereTagKo: string;
  readonly recommendedLightingId: StudioLightingMoodId;
  readonly assetUrl: string;
  readonly signatureFeaturesKo: readonly string[];
  readonly acousticReverbProfileKo: string;
}

export interface NanoBananaCreatorPersonaSpec {
  readonly id: NanoBananaCreatorPersonaId;
  readonly nameKo: string;
  readonly roleTitleKo: string;
  readonly specialtyKo: string;
  readonly signatureGearKo: string;
  readonly idleSpriteUrl: string;
  readonly workSpriteUrl: string;
  readonly defaultDeskId: string;
  readonly homePosition: { readonly x: number; readonly y: number };
}

export interface StudioColliderBox {
  readonly id: string;
  readonly labelKo: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isSolidObstacle: boolean;
  readonly interactiveKind:
    | "cut-desk"
    | "hologram-table"
    | "broadcast-booth"
    | "espresso-lounge";
  readonly boundEpisodeCutId?: string;
}

export interface AvatarPhysicsState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly facingAngleRad: number;
  readonly speedPxPerSec: number;
  readonly ghostModeGKey: boolean;
  readonly activeProximityObjectId: string | null;
  readonly activeProximityDistancePx: number | null;
  readonly cornerSlideEventsCount: number;
  readonly xKeyTriggeredObjectId: string | null;
}

export interface CharacterSecondaryMotionFrame {
  readonly bobOffsetYPx: number;
  readonly breathScaleX: number;
  readonly breathScaleY: number;
  readonly stylusTiltDeg: number;
  readonly isBlinking: boolean;
  readonly motionPhaseLabelKo: string;
}

export interface SpatialAudioEvaluation {
  readonly distancePx: number;
  readonly rawDistanceGain: number;
  readonly directionalConeGain: number;
  readonly wallAttenuationDb: number;
  readonly finalGain: number;
  readonly stereoPan: number;
  readonly audibleStatusKo: string;
}

export interface StudioSoundscapeChannel {
  readonly id: StudioSoundscapeChannelId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly synthWaveformSummary: string;
  readonly gainPercent: number;
  readonly muted: boolean;
}

export interface StudioLightingMoodSpec {
  readonly id: StudioLightingMoodId;
  readonly labelKo: string;
  readonly colorTempKelvin: number;
  readonly descriptionKo: string;
  readonly ambientPresetGains: Readonly<Record<StudioSoundscapeChannelId, number>>;
}

export interface LiveEpisodeCutDeskBinding {
  readonly deskId: string;
  readonly episodeCode: string;
  readonly cutNumber: string;
  readonly cutTitleKo: string;
  readonly assignedPersonaId: NanoBananaCreatorPersonaId;
  readonly stage: EpisodeCutPipelineStage;
  readonly progressPercent: number;
  readonly x: number;
  readonly y: number;
  readonly reviewCommentKo: string;
}

export interface CompanionPetFollowerState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly trailingDistancePx: number;
  readonly activeSpriteUrl: string;
  readonly petNameKo: string;
}

export interface WebAudioSynthPingTelemetry {
  readonly channelId: StudioSoundscapeChannelId;
  readonly carrierHz: number;
  readonly durationMs: number;
  readonly gainLinear: number;
  readonly statusKo: string;
}

export interface NextGenVirtualStudioEngineState {
  readonly activeThemeId: NanoBananaStudioThemeId;
  readonly themes: readonly NanoBananaStudioThemeSpec[];
  readonly activePersonaId: NanoBananaCreatorPersonaId;
  readonly activePersonaPose: CreatorPersonaPose;
  readonly personas: readonly NanoBananaCreatorPersonaSpec[];
  readonly themesAtlasUrl: string;
  readonly castCleanAtlasUrl: string;
  readonly v12ThemesAtlasUrl: string;
  readonly v12CastCleanAtlasUrl: string;
  readonly lightingMoodId: StudioLightingMoodId;
  readonly deadlineCrunchFeverEnabled: boolean;
  readonly physics: AvatarPhysicsState;
  readonly companionFollower: CompanionPetFollowerState;
  readonly waypointPath: readonly { readonly x: number; readonly y: number }[];
  readonly lastSynthesizedAudioPing: WebAudioSynthPingTelemetry | null;
  readonly colliders: readonly StudioColliderBox[];
  readonly soundscapeChannels: readonly StudioSoundscapeChannel[];
  readonly masterAudioMuted: boolean;
  readonly cutDesks: readonly LiveEpisodeCutDeskBinding[];
  readonly selectedCutDeskId: string;
  readonly elapsedSimulationMs: number;
}

export const NEXTGEN_COMPETITOR_REA_BENCHMARKS: readonly NextGenCompetitorReaBenchmark[] =
  [
    {
      id: "gather-town-v2-engine",
      competitorName: "Gather Town (v2 Engine)",
      reverseEngineeredMechanism:
        "32px 타일맵 충돌 마스크 + 'G'키 고스트 통과(Ghost Mode) + 'X'키 근접 오브젝트 인터랙션(64px 반경) + 프라이빗 존 오디오",
      toonStudioSuperiorUpgradeKo:
        "60fps 서브타일 스프링-댐퍼 가감속 물리엔진 + 책상 모서리 자동 미끄러짐(Corner-Sliding AABB) + 원고 컷 데스크 직결('X'키 즉시 합평)",
      latencyOrPhysicsMetric: "충돌 모서리 끼임 0% · 16.6ms 서브픽셀 보간",
    },
    {
      id: "zep-phaser-sprite-engine",
      competitorName: "ZEP (Phaser 3 Arcade Engine)",
      reverseEngineeredMechanism:
        "4방향 스프라이트 시트 상태머신(idle/run/sit) + 스포트라이트 확성기 브로드캐스트 + 미니앱 위젯 오버레이",
      toonStudioSuperiorUpgradeKo:
        "8인 직군별 캐릭터 캐스트(선화·3D·채색·PD) + 호흡 스케일·눈깜빡임·펜 드로잉 진동 2차 물리 모션",
      latencyOrPhysicsMetric: "4직군×2포즈 투명 RGBA + 4채널 프로시저럴 모션",
    },
    {
      id: "workadventure-tiled-companion",
      competitorName: "WorkAdventure & Topia",
      reverseEngineeredMechanism:
        "Tiled JSON 레이어 트리거(silent/jitsi Zone) + 컴패니언 팔로워 스프링 추적 + 공간 사운드스케이프 존",
      toonStudioSuperiorUpgradeKo:
        "웹툰 5단계 파이프라인(콘티→선화→밑색→명암→식자) 실시간 데스크 링 게이지 + 5채널 웹툰 작화 ASMR 사운드스케이프 신디사이저",
      latencyOrPhysicsMetric: "실시간 컷 공정 동기화 · WebAudio 5채널 믹서",
    },
    {
      id: "ovice-kumospace-acoustics",
      competitorName: "oVice & Kumospace",
      reverseEngineeredMechanism:
        "아바타 시선 방향 보이스 콘(Voice Cone) 지향성 감쇠 + 방음벽 -28dB 차음 + 가구 좌석 자석 스냅(Seat Snap)",
      toonStudioSuperiorUpgradeKo:
        "역제곱/코사인 HRTF 스테레오 패닝([-1, +1]) + 4대 웹툰 스튜디오 테마별 공간 잔향(Reverb) + 마감 피버 타임 채광 동기화",
      latencyOrPhysicsMetric: "-28dB 방음벽 차음 + 스테레오 HRTF 패닝",
    },
  ];

export const NANO_BANANA_V11_STUDIO_THEMES: readonly NanoBananaStudioThemeSpec[] =
  [
    {
      id: "seoul-editorial-hq",
      titleKo: "서울 K-웹툰 플래그십 편집 스튜디오",
      subtitleKo: "와콤 신티크 프로 포드 · 3D 홀로그램 리뷰 홀 · 에스프레소 북카페",
      atmosphereTagKo: "모던 에디토리얼 · 프로덕션 코어",
      recommendedLightingId: "daylight-studio",
      assetUrl: "/assets/virtual-studio/nano-banana-v11/themes/seoul-editorial-hq.webp",
      signatureFeaturesKo: [
        "듀얼 와콤 신티크 프로 27 작화 데스크 클러스터",
        "중앙 3D 배경 홀로그램 턴테이블 합평 아레나",
        "방음 편집장 피드백 부스 & 스페셜티 에스프레소 바",
      ],
      acousticReverbProfileKo: "흡음 우드 슬랫 패널 (RT60 0.28s · 명료한 음성 합평)",
    },
    {
      id: "cyber-neon-lab",
      titleKo: "사이버펑크 네온 액션·VFX 웹툰 랩",
      subtitleKo: "시안/마젠타 LED 콘티 월 · 언리얼 3D 렌더 랙 · 네온 나이트 루프탑",
      atmosphereTagKo: "하이테크 액션 · 판타지 VFX 특화",
      recommendedLightingId: "midnight-crunch-fever",
      assetUrl: "/assets/virtual-studio/nano-banana-v11/themes/cyber-neon-lab.webp",
      signatureFeaturesKo: [
        "시안·마젠타 네온 이펙트 브러시 테스트 월",
        "실시간 언리얼 엔진 레이트레이싱 배경 렌더 노드",
        "도쿄·네오서울 야경 루프탑 휴식 테라스",
      ],
      acousticReverbProfileKo: "신스 앰비언트 룸 (RT60 0.42s · 몰입형 로우엔드)",
    },
    {
      id: "hanok-botanical-atelier",
      titleKo: "한옥 & 보태니컬 전통 판타지 화실",
      subtitleKo: "서까래 목조 아틀리에 · 창호지 자연광 · 수묵/디지털 하이브리드 화판",
      atmosphereTagKo: "동양 판타지 · 무협 · 사극 웹툰 특화",
      recommendedLightingId: "dawn-ink",
      assetUrl:
        "/assets/virtual-studio/nano-banana-v11/themes/hanok-botanical-atelier.webp",
      signatureFeaturesKo: [
        "전통 한옥 서까래와 현대식 신티크 원목 데스크 조화",
        "창호지 확산 채광 & 실내 소나무 수경 연못 정원",
        "다도(茶道) 스토리텔링 좌식 회의 마루",
      ],
      acousticReverbProfileKo: "한지·원목 자연 공명 (RT60 0.34s · 차분한 수경 백색소음)",
    },
    {
      id: "lofi-cat-storyhouse",
      titleKo: "코지 로파이 다락방 & 캣카페 스토리하우스",
      subtitleKo: "노을빛 천창 · 원목 만화책 서가 · 고양이 캣타워 · 어쿠스틱 핀보드",
      atmosphereTagKo: "일상 · 로맨스 · 드라마 스토리 작가실",
      recommendedLightingId: "golden-sunset",
      assetUrl:
        "/assets/virtual-studio/nano-banana-v11/themes/lofi-cat-storyhouse.webp",
      signatureFeaturesKo: [
        "따뜻한 골든아워 천창 채광과 빈티지 바이닐 턴테이블",
        "스튜디오 마스코트 고양이 캣타워 & 낮잠 쿠션 존",
        "에피소드 복선·인물관계도 코르크 핀보드 월",
      ],
      acousticReverbProfileKo: "코지 패브릭 다락방 (RT60 0.22s · 포근한 로파이 감쇠)",
    },
    {
      id: "romance-palace-conservatory",
      titleKo: "로맨스판타지 크리스탈 온실 & 바로크 살롱",
      subtitleKo: "크리스탈 샹들리에 · 장미 글래스하우스 · 골드 신티크 포드 · 티파티 합평 라운지",
      atmosphereTagKo: "로맨스판타지 · 황실 · 시대극 특화 (v12)",
      recommendedLightingId: "daylight-studio",
      assetUrl:
        "/assets/virtual-studio/nano-banana-v12/themes/romance-palace-conservatory.webp",
      signatureFeaturesKo: [
        "유럽풍 아치형 유리 온실과 사계절 만개한 로즈 가든",
        "로코코 골드 몰딩 커스텀 와콤 신티크 작화 데스크",
        "홍차·마카롱 티파티 테이블 의상·장신구 레퍼런스 살롱",
      ],
      acousticReverbProfileKo: "글래스 온실 하모닉 잔향 (RT60 0.38s · 클래식 챔버)",
    },
    {
      id: "murim-bamboo-pavilion",
      titleKo: "무협 청죽림 폭포 정자 & 먹향 화실",
      subtitleKo: "청죽림 폭포 계곡 · 족자 원고 월 · 수묵 디지털 화판 · 검술 동세 마당",
      atmosphereTagKo: "정통 무협 · 동양 판타지 · 액션 특화 (v12)",
      recommendedLightingId: "dawn-ink",
      assetUrl:
        "/assets/virtual-studio/nano-banana-v12/themes/murim-bamboo-pavilion.webp",
      signatureFeaturesKo: [
        "대나무 숲 폭포수가 흐르는 개방형 전통 목조 정자",
        "붓터치 먹선 브러시 전용 한지 질감 디지털 화판",
        "초식·검기 연출 검토용 족자 스크롤 프리뷰 월",
      ],
      acousticReverbProfileKo: "대숲 바람 & 계곡 폭포 백색소음 (RT60 0.31s · 자연 개방형)",
    },
    {
      id: "scifi-orbital-command",
      titleKo: "SF 궤도 우주정거장 브릿지 스튜디오",
      subtitleKo: "성운 파노라마 뷰포트 · 무중력 홀로그램 콘티 링 · 메카닉 3D 프린팅 베이",
      atmosphereTagKo: "SF · 사이버펑크 · 아포칼립스 특화 (v12)",
      recommendedLightingId: "midnight-crunch-fever",
      assetUrl:
        "/assets/virtual-studio/nano-banana-v12/themes/scifi-orbital-command.webp",
      signatureFeaturesKo: [
        "안드로메다 성운이 내려다보이는 곡면 궤도 관측 창",
        "중앙 360도 무중력 홀로그램 스토리보드 프로젝션 링",
        "엑소슈트·메카닉 리깅 검수용 3D 베이",
      ],
      acousticReverbProfileKo: "무향 코어 브릿지 (RT60 0.24s · 초저역 우주 앰비언트)",
    },
    {
      id: "brooklyn-indie-comics-loft",
      titleKo: "브루클린 인디 코믹스 & 그래픽노블 브릭 로프트",
      subtitleKo: "노출 적벽돌 · 아치형 산업용 창 · 리소그래프 인쇄기 · 네온 에스프레소 바",
      atmosphereTagKo: "인디 코믹스 · 스릴러 · 느와르 특화 (v12)",
      recommendedLightingId: "golden-sunset",
      assetUrl:
        "/assets/virtual-studio/nano-banana-v12/themes/brooklyn-indie-comics-loft.webp",
      signatureFeaturesKo: [
        "석양이 비치는 대형 아치 창문과 빈티지 노출 적벽돌 월",
        "단행본 가제본 테스트용 리소그래프 & 컬러 교정 프린터",
        "네온 CAFE 사인 바 테이블 & 심야 스토리 브레인스토밍 소파",
      ],
      acousticReverbProfileKo: "브릭 로프트 어쿠스틱 (RT60 0.33s · 바이닐 재즈 감성)",
    },
  ];

export const NANO_BANANA_V11_CREATOR_PERSONAS: readonly NanoBananaCreatorPersonaSpec[] =
  [
    {
      id: "line-artist",
      nameKo: "한소율 (Lead Line Artist)",
      roleTitleKo: "메인 선화 · 다이내믹 콘티 작가",
      specialtyKo: "인체 데생 · 액션 연출 컷 분할 · 펜선 강약 제어",
      signatureGearKo:
        "민트/인디고 스튜디오 후디 · 핑크 노이즈캔슬링 헤드셋 · 와콤 프로 펜 3",
      idleSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/line-artist-idle.webp",
      workSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/line-artist-work.webp",
      defaultDeskId: "desk-ep43-c04",
      homePosition: { x: 140, y: 120 },
    },
    {
      id: "cgi-director",
      nameKo: "강태오 (3D & Unreal Director)",
      roleTitleKo: "3D 배경 · 언리얼 카메라 디렉터",
      specialtyKo: "스케치업/블렌더 에셋 빌드 · 3점 투시 카메라 매칭 · 라이팅 베이크",
      signatureGearKo:
        "사이버 바이저 스마트 글래스 · 테크 재킷 · 3D 기즈모 컨트롤 패드",
      idleSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/cgi-director-idle.webp",
      workSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/cgi-director-work.webp",
      defaultDeskId: "desk-ep43-c19",
      homePosition: { x: 340, y: 120 },
    },
    {
      id: "colorist",
      nameKo: "윤채린 (Colorist & VFX Lead)",
      roleTitleKo: "수석 채색 · 글로우 이펙트 작가",
      specialtyKo: "감성 라이팅 보정 · 마법/검기 VFX 레이어 · 캐릭터 피부톤 팔레트",
      signatureGearKo:
        "파스텔 아티스트 베레모 · 에이프런 가디건 · 홀로그램 컬러 휠 팔레트",
      idleSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/colorist-idle.webp",
      workSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/colorist-work.webp",
      defaultDeskId: "desk-ep43-c37",
      homePosition: { x: 140, y: 250 },
    },
    {
      id: "chief-pd",
      nameKo: "박서준 (Chief PD & Editor)",
      roleTitleKo: "총괄 프로듀서 · 연재 편집장",
      specialtyKo: "스크롤 호흡 검수 · 대사 식자 윤문 · 마감 일정 조율",
      signatureGearKo:
        "스마트 블레이저 · 더블샷 에스프레소 머그 · 적색 교정 스타일러스",
      idleSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/chief-pd-idle.webp",
      workSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/chief-pd-work.webp",
      defaultDeskId: "desk-ep43-c52",
      homePosition: { x: 340, y: 250 },
    },
    {
      id: "story-writer",
      nameKo: "서유진 (Lead Story & Lore Writer)",
      roleTitleKo: "메인 스토리 · 세계관 설정 작가 (v12)",
      specialtyKo: "장편 서사 복선 설계 · 대사 호흡 트리트먼트 · 세계관 그리모어 관리",
      signatureGearKo: "케이블 니트 가디건 · 라운드 안경 · 발광 세계관 설정집 & 만년필",
      idleSpriteUrl:
        "/assets/virtual-studio/nano-banana-v12/cast/story-writer-idle.webp",
      workSpriteUrl:
        "/assets/virtual-studio/nano-banana-v12/cast/story-writer-work.webp",
      defaultDeskId: "desk-ep43-c04",
      homePosition: { x: 92, y: 120 },
    },
    {
      id: "action-mocap-actor",
      nameKo: "류진우 (Action & Mocap Director)",
      roleTitleKo: "액션 콘티 · 모션캡처 무술 디렉터 (v12)",
      specialtyKo: "3D 관절 트래킹 액션 동세 · 타격감 카메라 쉐이크 · 검술 초식 설계",
      signatureGearKo: "광학 마커 모션캡처 수트 · 액션 트래킹 봉 · 초록 LED 센서 노드",
      idleSpriteUrl:
        "/assets/virtual-studio/nano-banana-v12/cast/action-mocap-actor-idle.webp",
      workSpriteUrl:
        "/assets/virtual-studio/nano-banana-v12/cast/action-mocap-actor-work.webp",
      defaultDeskId: "desk-ep43-c19",
      homePosition: { x: 396, y: 120 },
    },
    {
      id: "sound-letterer",
      nameKo: "조하늘 (SFX & Lettering Artist)",
      roleTitleKo: "식자 · 음향효과 타이포그래피 디자이너 (v12)",
      specialtyKo: "타격음(POW/콰앙) 캘리그라피 · 말풍선 감정 폰트 연출 · 글로벌 다국어 식자",
      signatureGearKo: "네온 게이밍 헤드폰 · 스트릿 후디 · 홀로그램 SFX 레터링 브러시",
      idleSpriteUrl:
        "/assets/virtual-studio/nano-banana-v12/cast/sound-letterer-idle.webp",
      workSpriteUrl:
        "/assets/virtual-studio/nano-banana-v12/cast/sound-letterer-work.webp",
      defaultDeskId: "desk-ep43-c37",
      homePosition: { x: 92, y: 250 },
    },
    {
      id: "studio-cat-mascot",
      nameKo: "나비 & 펜봇 (Studio Mascot & Drone)",
      roleTitleKo: "스튜디오 마스코트 치즈냥이 & AI 펜 드론 팔로워 (v12)",
      specialtyKo: "작가 뒤를 졸졸 따라다니는 스프링 팔로워 · 마감 스트레스 힐링 · 브러시 배달",
      signatureGearKo: "미니 화가 베레모 · 치즈 태비 줄무늬 · 공중부양 AI 스타일러스 펜봇",
      idleSpriteUrl:
        "/assets/virtual-studio/nano-banana-v12/cast/studio-cat-mascot-idle.webp",
      workSpriteUrl:
        "/assets/virtual-studio/nano-banana-v12/cast/studio-cat-mascot-work.webp",
      defaultDeskId: "desk-ep43-c52",
      homePosition: { x: 164, y: 154 },
    },
  ];

export const STUDIO_LIGHTING_MOODS: readonly StudioLightingMoodSpec[] = [
  {
    id: "dawn-ink",
    labelKo: "새벽 수묵 몰입광 (05:30 · 4200K)",
    colorTempKelvin: 4200,
    descriptionKo: "차분한 새벽 청백색 조명으로 콘티 구상과 스토리 집중도를 높이는 모드",
    ambientPresetGains: {
      "wacom-pen-asmr": 70,
      "mech-keyboard-thock": 35,
      "espresso-lofi-pad": 45,
      "rooftop-rain-breeze": 65,
      "page-flip-chime": 50,
    },
  },
  {
    id: "daylight-studio",
    labelKo: "정오 표준 색온도 채광 (13:00 · 6500K D65)",
    colorTempKelvin: 6500,
    descriptionKo: "채색·배경 후보정 왜곡을 방지하는 D65 색표준 주간 스튜디오 채광",
    ambientPresetGains: {
      "wacom-pen-asmr": 65,
      "mech-keyboard-thock": 55,
      "espresso-lofi-pad": 50,
      "rooftop-rain-breeze": 20,
      "page-flip-chime": 60,
    },
  },
  {
    id: "golden-sunset",
    labelKo: "노을 골든아워 브리핑 (18:00 · 3400K)",
    colorTempKelvin: 3400,
    descriptionKo: "따뜻한 석양 채광과 함께 팀 데일리 합평 및 커피챗을 진행하는 모드",
    ambientPresetGains: {
      "wacom-pen-asmr": 45,
      "mech-keyboard-thock": 40,
      "espresso-lofi-pad": 80,
      "rooftop-rain-breeze": 40,
      "page-flip-chime": 55,
    },
  },
  {
    id: "midnight-crunch-fever",
    labelKo: "마감 피버 네온 모드 (23:45 · 5000K Neon)",
    colorTempKelvin: 5000,
    descriptionKo:
      "연재 업로드 직전 전 직군 마감 집중력을 극대화하는 하이콘트라스트 피버 조명",
    ambientPresetGains: {
      "wacom-pen-asmr": 90,
      "mech-keyboard-thock": 85,
      "espresso-lofi-pad": 75,
      "rooftop-rain-breeze": 50,
      "page-flip-chime": 80,
    },
  },
];

export const DEFAULT_STUDIO_COLLIDERS: readonly StudioColliderBox[] = [
  {
    id: "collider-desk-c04",
    labelKo: "선화 데스크 #1 (EP.43 C04)",
    x: 110,
    y: 90,
    width: 64,
    height: 44,
    isSolidObstacle: true,
    interactiveKind: "cut-desk",
    boundEpisodeCutId: "desk-ep43-c04",
  },
  {
    id: "collider-desk-c19",
    labelKo: "3D 배경 데스크 #2 (EP.43 C19)",
    x: 310,
    y: 90,
    width: 64,
    height: 44,
    isSolidObstacle: true,
    interactiveKind: "cut-desk",
    boundEpisodeCutId: "desk-ep43-c19",
  },
  {
    id: "collider-desk-c37",
    labelKo: "채색·VFX 데스크 #3 (EP.43 C37)",
    x: 110,
    y: 220,
    width: 64,
    height: 44,
    isSolidObstacle: true,
    interactiveKind: "cut-desk",
    boundEpisodeCutId: "desk-ep43-c37",
  },
  {
    id: "collider-desk-c52",
    labelKo: "총괄 PD 검수 데스크 #4 (EP.43 C52)",
    x: 310,
    y: 220,
    width: 64,
    height: 44,
    isSolidObstacle: true,
    interactiveKind: "cut-desk",
    boundEpisodeCutId: "desk-ep43-c52",
  },
  {
    id: "collider-hologram-center",
    labelKo: "중앙 3D 홀로그램 턴테이블",
    x: 215,
    y: 155,
    width: 56,
    height: 56,
    isSolidObstacle: true,
    interactiveKind: "hologram-table",
  },
];

export const PIPELINE_STAGE_ORDER: readonly EpisodeCutPipelineStage[] = [
  "storyboard",
  "line-art",
  "base-color",
  "shading-vfx",
  "typeset-approved",
];

export const PIPELINE_STAGE_LABELS_KO: Readonly<
  Record<EpisodeCutPipelineStage, string>
> = {
  storyboard: "1단계: 콘티·러프",
  "line-art": "2단계: 펜선·선화",
  "base-color": "3단계: 밑색·플랫",
  "shading-vfx": "4단계: 명암·이펙트",
  "typeset-approved": "5단계: 식자·검수완료",
};
