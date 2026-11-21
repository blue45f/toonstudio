/**
 * 다채로운 소두(5.5~6등신) 다중 프레임 캐릭터 스프라이트 · 10종 표정 · 20종 확장 동작(체조 3종·댄스 3종 포함) ·
 * 8종 기본 VFX + 20종 드라마틱 VFX · 20인 한국 웹툰 대표 아키타입 마스터 캐스트 정적 카탈로그·타입 정의.
 */
import type { IllustratedCreatorPersonaId } from "./studio-virtual-office-nextgen-engine-data";
import type { StudioDramaticVfxId, StudioWellnessOrDanceActionId } from "./studio-virtual-space-dramatic-vfx-catalog";

export type DynamicSpriteExpressionId =
  | "bright-smile"
  | "sparkle-star"
  | "focused-flame"
  | "joyful-wink"
  | "smug-grin"
  | "shocked-eureka"
  | "caffeine-overdrive"
  | "deadline-panic"
  | "zen-flow"
  | "collab-heart";

export type DynamicSpriteDirection = "down" | "up" | "left" | "right";

export type DynamicSpriteActionId =
  | "idle-breathe"
  | "walk-stride"
  | "sprint-afterimage"
  | "tablet-combo-draw"
  | "dcc-3d-sculpt"
  | "whiteboard-laser-pitch"
  | "espresso-power-charge"
  | "victory-jump-cheer"
  | "highfive-team-sync"
  | "awakening-skill-burst";

export type DynamicSpriteExtendedActionId =
  | DynamicSpriteActionId
  | "chair-sit"
  | "wave-greet"
  | "clap-cheer"
  | "think-ponder"
  | StudioWellnessOrDanceActionId;

export type StudioDiversityExtraPersonaId =
  | "bg-architect"
  | "editorial-chief"
  | "lighting-director"
  | "junior-inker";

export type StudioFullSpritePersonaId = IllustratedCreatorPersonaId | StudioDiversityExtraPersonaId;

/** 한국 웹툰 대표 장르·아키타입 확장 8인 식별자 (기존 12인 + 확장 8인 = 20인 마스터 캐스트). */
export type StudioWebtoonArchetypePersonaId =
  | "rofan-duchess"
  | "rofan-crown-prince"
  | "modern-hunter-awakener"
  | "seoul-academy-student"
  | "cyberpunk-hacker"
  | "murim-swordsman"
  | "atelier-barista"
  | "companion-corgi-director";

/** 기존 12인 + 한국 웹툰 확장 8인 전체(20인) 식별자. */
export type StudioMasterSpritePersonaId = StudioFullSpritePersonaId | StudioWebtoonArchetypePersonaId;

export type DynamicSpriteVfxId =
  | "neon-magic-circle"
  | "manga-speedlines"
  | "prism-stardust-burst"
  | "holo-floating-monitors"
  | "crimson-ink-slash"
  | "fever-lightning-flames"
  | "biophilic-sakura-wind"
  | "collab-tether-beam";

export type PracticalCollabZoneId =
  | "zone-line-atelier"
  | "zone-3d-blender-sketchup"
  | "zone-color-sound-stage"
  | "zone-pd-storyboard-warroom";

export type PracticalTaskStatus = "todo" | "in-progress" | "review-ready" | "approved";

export type DynamicSpriteHairSilhouette =
  | "beret-spiky"
  | "cyber-ponytail"
  | "aurora-twintail"
  | "scholar-wave"
  | "executive-bob"
  | "visor-undercut"
  | "headphone-hood"
  | "astral-cat-halo"
  | "royal-tiara-curls"
  | "imperial-crown-sweep"
  | "hunter-spiky-aura"
  | "academy-ribbon-long"
  | "murim-topknot-ribbon"
  | "barista-beret-bun"
  | "corgi-ears-hood";

export type DynamicSpriteOutfitSilhouette =
  | "ink-cape-coat"
  | "holo-trench"
  | "prism-atelier-apron"
  | "scroll-vest"
  | "tailored-director-suit"
  | "neon-mocap-suit"
  | "sonic-street-parka"
  | "starlight-mascot-cape"
  | "rofan-ballgown-cape"
  | "imperial-uniform-mantle"
  | "hunter-mana-coat"
  | "seoul-academy-blazer"
  | "murim-hanbok-robe"
  | "cafe-barista-apron"
  | "cozy-companion-cardigan";

export type DynamicSpritePropKind =
  | "stylus-pen"
  | "tablet-deck"
  | "rose-quill"
  | "mana-blade"
  | "murim-sword"
  | "coffee-dripper"
  | "sketchbook"
  | "holo-gizmo"
  | "color-wand"
  | "director-baton"
  | "sound-brush";

export type DynamicSpriteCompanionKind = "cheese-cat" | "welsh-corgi" | "holo-drone" | "none";

export interface DynamicSpriteExpressionSpec {
  readonly id: DynamicSpriteExpressionId;
  readonly labelKo: string;
  readonly badgeEmoji: string;
  readonly descriptionKo: string;
  readonly eyeStyle:
    | "crescent-bright"
    | "star-pupil"
    | "fierce-slant"
    | "wink-happy"
    | "smug-half"
    | "wide-shock"
    | "neon-ring"
    | "panic-spiral"
    | "closed-zen"
    | "heart-glow";
  readonly mouthStyle:
    | "open-smile"
    | "cat-grin"
    | "firm-line"
    | "cheer-laugh"
    | "smirk"
    | "surprised-o"
    | "hyper-grin"
    | "wavy-panic"
    | "calm-smile"
    | "talk-sync";
  readonly blushOpacity: number;
  readonly sweatDrop: boolean;
}

export interface DynamicSpriteActionSpec {
  readonly id: DynamicSpriteActionId;
  readonly labelKo: string;
  readonly badgeEmoji: string;
  readonly frameCount: 8;
  readonly defaultFps: number;
  readonly workContextKo: string;
  readonly recommendedVfxId: DynamicSpriteVfxId;
  readonly recommendedDramaticVfxId?: StudioDramaticVfxId;
}

export interface DynamicSpriteVfxSpec {
  readonly id: DynamicSpriteVfxId;
  readonly labelKo: string;
  readonly badgeEmoji: string;
  readonly primaryColorHex: string;
  readonly secondaryColorHex: string;
  readonly descriptionKo: string;
}

export interface DynamicCreatorPersonaSpriteSpec<TId extends StudioMasterSpritePersonaId = StudioMasterSpritePersonaId> {
  readonly personaId: TId;
  readonly characterNameKo: string;
  readonly roleTitleKo: string;
  readonly personalityTraitKo: string;
  readonly archetypeGenreKo?: string;
  readonly headToBodyRatio: number;
  readonly headTallUnits: number;
  readonly hairSilhouette: DynamicSpriteHairSilhouette;
  readonly outfitSilhouette: DynamicSpriteOutfitSilhouette;
  readonly primaryHex: string;
  readonly secondaryHex: string;
  readonly accentHex: string;
  readonly hairHex: string;
  readonly skinHex: string;
  readonly eyeHex: string;
  /** 선명한 웹툰 잉크 윤곽선 색. */
  readonly inkOutlineHex?: string;
  /** 헤어 엔젤링 하이라이트 색. */
  readonly hairHighlightHex?: string;
  /** 의상 칼라·금장·레이스 트림 색. */
  readonly outfitTrimHex?: string;
  /** 시그니처 소품 종류. */
  readonly propKind?: DynamicSpritePropKind;
  /** 동행 반려 마스코트·드론 종류. */
  readonly companionKind?: DynamicSpriteCompanionKind;
  /** 캐릭터 기본 드라마틱 VFX 20종 연동 ID. */
  readonly dramaticVfxId?: StudioDramaticVfxId;
  readonly signatureWeaponKo: string;
  readonly defaultExpressionId: DynamicSpriteExpressionId;
  readonly defaultActionId: DynamicSpriteActionId;
  readonly defaultVfxId: DynamicSpriteVfxId;
  readonly defaultZoneId: PracticalCollabZoneId;
  /** 안경 등 개성 소품(선택). */
  readonly eyewear?: "glasses" | "round-glasses" | "none";
}

export interface DynamicSpriteFrameKinematics {
  readonly frameIndex: number;
  readonly headToBodyRatio: number;
  readonly headRadiusPx: number;
  readonly bodyOffsetY: number;
  readonly bodyLeanDeg: number;
  readonly headTiltDeg: number;
  readonly leftArmDeg: number;
  readonly rightArmDeg: number;
  readonly leftLegDeg: number;
  readonly rightLegDeg: number;
  readonly capeWavePx: number;
  readonly hairBouncePx: number;
  readonly weaponOrbitDeg: number;
  readonly isBlinkFrame: boolean;
  readonly mouthOpenRatio: number;
  readonly vfxPulseScale: number;
  readonly afterimageCount: number;
}

export interface PracticalCollaboratorLiveUnit {
  readonly personaId: StudioFullSpritePersonaId;
  readonly zoneId: PracticalCollabZoneId;
  readonly xPct: number;
  readonly yPct: number;
  readonly expressionId: DynamicSpriteExpressionId;
  readonly actionId: DynamicSpriteActionId;
  readonly vfxId: DynamicSpriteVfxId;
  readonly headTallUnits: number;
  readonly taskCode: string;
  readonly taskTitleKo: string;
  readonly dccToolBadge: string;
  readonly taskStatus: PracticalTaskStatus;
  readonly progressPercent: number;
  readonly pairedWithPersonaId: StudioFullSpritePersonaId | null;
  readonly statusBubbleKo: string;
}

export interface PracticalCollabZoneSpec {
  readonly id: PracticalCollabZoneId;
  readonly titleKo: string;
  readonly subtitleKo: string;
  readonly badgeEmoji: string;
  readonly accentHex: string;
  readonly floorRect: {
    readonly xPct: number;
    readonly yPct: number;
    readonly widthPct: number;
    readonly heightPct: number;
  };
}

export interface PracticalCanvasPinNote {
  readonly id: string;
  readonly zoneId: PracticalCollabZoneId;
  readonly authorPersonaId: StudioFullSpritePersonaId;
  readonly targetTaskCode: string;
  readonly noteKo: string;
  readonly resolved: boolean;
}

export interface PracticalSpriteWorkspaceState {
  readonly selectedPersonaId: StudioFullSpritePersonaId;
  readonly selectedZoneId: PracticalCollabZoneId;
  readonly globalFps: 8 | 12 | 24;
  readonly animationPaused: boolean;
  readonly teamComboCount: number;
  readonly feverAwakeningActive: boolean;
  readonly collaborators: readonly PracticalCollaboratorLiveUnit[];
  readonly canvasPins: readonly PracticalCanvasPinNote[];
  readonly lastCollabEventKo: string;
}

export const DYNAMIC_SPRITE_EXPRESSIONS: readonly DynamicSpriteExpressionSpec[] = [
  { id: "bright-smile", labelKo: "환한 미소", badgeEmoji: "😊", descriptionKo: "맑은 하이라이트 눈빛과 홍조 띤 밝은 미소", eyeStyle: "crescent-bright", mouthStyle: "open-smile", blushOpacity: 0.48, sweatDrop: false },
  { id: "sparkle-star", labelKo: "영감 폭발 별눈", badgeEmoji: "🤩", descriptionKo: "아이디어가 떠올라 반짝이는 황금 별동공", eyeStyle: "star-pupil", mouthStyle: "cheer-laugh", blushOpacity: 0.58, sweatDrop: false },
  { id: "focused-flame", labelKo: "초집중 불꽃 눈빛", badgeEmoji: "🔥", descriptionKo: "마감 퀄리티를 끌어올리는 날카로운 몰입 시선", eyeStyle: "fierce-slant", mouthStyle: "firm-line", blushOpacity: 0.16, sweatDrop: false },
  { id: "joyful-wink", labelKo: "승리 윙크", badgeEmoji: "😉", descriptionKo: "컷 검수 통과 후 상쾌한 윙크와 미소", eyeStyle: "wink-happy", mouthStyle: "cat-grin", blushOpacity: 0.52, sweatDrop: false },
  { id: "smug-grin", labelKo: "자신만만 씨익", badgeEmoji: "😏", descriptionKo: "어려운 구도와 3D 투시를 완벽히 해결한 표정", eyeStyle: "smug-half", mouthStyle: "smirk", blushOpacity: 0.25, sweatDrop: false },
  { id: "shocked-eureka", labelKo: "유레카 깜짝!", badgeEmoji: "⚡", descriptionKo: "극적인 연출 반전을 발견한 놀람 표정", eyeStyle: "wide-shock", mouthStyle: "surprised-o", blushOpacity: 0.22, sweatDrop: true },
  { id: "caffeine-overdrive", labelKo: "카페인 풀충전 각성", badgeEmoji: "☕", descriptionKo: "에스프레소 충전 후 네온 링이 도는 초고속 각성", eyeStyle: "neon-ring", mouthStyle: "hyper-grin", blushOpacity: 0.36, sweatDrop: false },
  { id: "deadline-panic", labelKo: "마감 스퍼트 비상", badgeEmoji: "💦", descriptionKo: "마감 직전 초고속 손놀림과 송골송골 땀방울", eyeStyle: "panic-spiral", mouthStyle: "wavy-panic", blushOpacity: 0.32, sweatDrop: true },
  { id: "zen-flow", labelKo: "무아지경 평온 몰입", badgeEmoji: "🧘", descriptionKo: "완벽한 리듬으로 선화와 채색을 이어가는 평온함", eyeStyle: "closed-zen", mouthStyle: "calm-smile", blushOpacity: 0.32, sweatDrop: false },
  { id: "collab-heart", labelKo: "협업 환호 하트눈", badgeEmoji: "💖", descriptionKo: "팀원과 호흡을 맞춰 시너지를 내는 응원 표정", eyeStyle: "heart-glow", mouthStyle: "talk-sync", blushOpacity: 0.65, sweatDrop: false },
];

export const DYNAMIC_SPRITE_ACTIONS: readonly DynamicSpriteActionSpec[] = [
  { id: "idle-breathe", labelKo: "리듬 호흡·망토 흔들림", badgeEmoji: "🌬️", frameCount: 8, defaultFps: 8, workContextKo: "대기 중 자연스러운 8프레임 호흡과 머리카락·코트 흔들림", recommendedVfxId: "biophilic-sakura-wind", recommendedDramaticVfxId: "grass-petal-ripple" },
  { id: "walk-stride", labelKo: "경쾌한 8프레임 워킹", badgeEmoji: "🏃", frameCount: 8, defaultFps: 12, workContextKo: "부서 간 이동 시 팔다리 교차 스윙과 경쾌한 바운스", recommendedVfxId: "neon-magic-circle", recommendedDramaticVfxId: "wood-step-ripple" },
  { id: "sprint-afterimage", labelKo: "초고속 마감 질주(잔상)", badgeEmoji: "⚡", frameCount: 8, defaultFps: 24, workContextKo: "긴급 합평 호출 시 3중 네온 잔상을 남기는 대시", recommendedVfxId: "manga-speedlines", recommendedDramaticVfxId: "dash-speedlines" },
  { id: "tablet-combo-draw", labelKo: "신티크 초고속 작화 콤보", badgeEmoji: "✒️", frameCount: 8, defaultFps: 12, workContextKo: "듀얼 펜타블렛 위에서 검기처럼 펜선을 긋는 고속 작화", recommendedVfxId: "crimson-ink-slash", recommendedDramaticVfxId: "ink-calligraphy-slash" },
  { id: "dcc-3d-sculpt", labelKo: "3D 배경 조형", badgeEmoji: "🧊", frameCount: 8, defaultFps: 12, workContextKo: "공중의 3D 성채·배경 홀로그램 메쉬를 양손으로 회전·조형", recommendedVfxId: "holo-floating-monitors", recommendedDramaticVfxId: "cyber-holo-grid" },
  { id: "whiteboard-laser-pitch", labelKo: "화이트보드 레이저 브리핑", badgeEmoji: "📊", frameCount: 8, defaultFps: 12, workContextKo: "콘티 동선과 연출 프레임을 레이저 포인터로 지휘", recommendedVfxId: "collab-tether-beam", recommendedDramaticVfxId: "eureka-spark-aura" },
  { id: "espresso-power-charge", labelKo: "아메리카노 원샷 충전", badgeEmoji: "☕", frameCount: 8, defaultFps: 12, workContextKo: "카페인 급속 충전으로 집중력 버프 오라 활성화", recommendedVfxId: "fever-lightning-flames", recommendedDramaticVfxId: "coffee-healing-steam" },
  { id: "victory-jump-cheer", labelKo: "컷 승인 점프 환호", badgeEmoji: "🎉", frameCount: 8, defaultFps: 12, workContextKo: "원고 컷 최종 승인 시 하이점프와 양팔 만세 세리머니", recommendedVfxId: "prism-stardust-burst", recommendedDramaticVfxId: "deadline-confetti-fireworks" },
  { id: "highfive-team-sync", labelKo: "팀원 하이파이브 공명", badgeEmoji: "🙌", frameCount: 8, defaultFps: 12, workContextKo: "파트 인계 및 공동 작업 시 파트너와 하이파이브", recommendedVfxId: "collab-tether-beam", recommendedDramaticVfxId: "highfive-shockwave" },
  { id: "awakening-skill-burst", labelKo: "작가 각성 궁극기 폭발", badgeEmoji: "🌟", frameCount: 8, defaultFps: 24, workContextKo: "공중 부유 + 전신 아스트랄 윙과 다중 마법진 전개", recommendedVfxId: "prism-stardust-burst", recommendedDramaticVfxId: "martial-fantasy-magic-circle" },
];

export const DYNAMIC_SPRITE_VFX_PRESETS: readonly DynamicSpriteVfxSpec[] = [
  { id: "neon-magic-circle", labelKo: "네온 기하학 마법진", badgeEmoji: "🔮", primaryColorHex: "#38bdf8", secondaryColorHex: "#818cf8", descriptionKo: "발밑과 등 뒤에서 다중 회전하는 사이버 마법진 링" },
  { id: "manga-speedlines", labelKo: "웹툰 방사형 집중선", badgeEmoji: "💥", primaryColorHex: "#facc15", secondaryColorHex: "#f97316", descriptionKo: "만화 하이라이트 컷처럼 터져 나오는 역동적 집중선" },
  { id: "prism-stardust-burst", labelKo: "프리즘 스타더스트 폭발", badgeEmoji: "✨", primaryColorHex: "#f472b6", secondaryColorHex: "#38bdf8", descriptionKo: "다채로운 다이아몬드 별빛과 오로라 크로마 입자" },
  { id: "holo-floating-monitors", labelKo: "3D 부유 홀로그램 창", badgeEmoji: "🖥️", primaryColorHex: "#2dd4bf", secondaryColorHex: "#60a5fa", descriptionKo: "주변을 공전하는 3D 와이어프레임·레이어 홀로그램 패널" },
  { id: "crimson-ink-slash", labelKo: "크림슨 펜터치 검기", badgeEmoji: "⚔️", primaryColorHex: "#fb7185", secondaryColorHex: "#f43f5e", descriptionKo: "스타일러스 궤적을 따라 불꽃처럼 휘몰아치는 먹물 검기" },
  { id: "fever-lightning-flames", labelKo: "피버 플라즈마 화염·번개", badgeEmoji: "⚡", primaryColorHex: "#a855f7", secondaryColorHex: "#f59e0b", descriptionKo: "마감 스퍼트 시 솟구치는 플라즈마 번개와 오로라 화염" },
  { id: "biophilic-sakura-wind", labelKo: "바이오필릭 벚꽃·반딧불", badgeEmoji: "🌸", primaryColorHex: "#f9a8d4", secondaryColorHex: "#4ade80", descriptionKo: "집중력을 높여주는 벚꽃잎과 에메랄드 반딧불이 선회" },
  { id: "collab-tether-beam", labelKo: "협업 시너지 공명 링", badgeEmoji: "🔗", primaryColorHex: "#34d399", secondaryColorHex: "#38bdf8", descriptionKo: "팀원 간 실시간 페어링과 콤보 버프를 시각화하는 파동" },
];

export const DYNAMIC_CREATOR_SPRITE_CAST: readonly DynamicCreatorPersonaSpriteSpec<IllustratedCreatorPersonaId>[] = [
  { personaId: "line-artist", characterNameKo: "강하루 (수석 선화 장인)", roleTitleKo: "메인 선화 · 액션 펜터치 디렉터", personalityTraitKo: "타협 없는 0.1mm 칼선 장인 · 마감 피버 시 검기 같은 초고속 펜터치 발동", archetypeGenreKo: "웹툰 수석 선화", headToBodyRatio: 0.172, headTallUnits: 5.8, hairSilhouette: "beret-spiky", outfitSilhouette: "ink-cape-coat", primaryHex: "#f43f5e", secondaryHex: "#1e1b4b", accentHex: "#fda4af", hairHex: "#1e293b", skinHex: "#ffe4d6", eyeHex: "#e11d48", inkOutlineHex: "#17142b", hairHighlightHex: "#94a3b8", outfitTrimHex: "#fecdd3", propKind: "stylus-pen", companionKind: "none", dramaticVfxId: "ink-calligraphy-slash", signatureWeaponKo: "크림슨 광선 스타일러스 창 & 듀얼 신티크", defaultExpressionId: "focused-flame", defaultActionId: "tablet-combo-draw", defaultVfxId: "crimson-ink-slash", defaultZoneId: "zone-line-atelier" },
  { personaId: "cgi-director", characterNameKo: "윤진 (3D 배경 감독)", roleTitleKo: "수석 3D 배경 · CAD · 지오메트리 노드 설계자", personalityTraitKo: "복잡한 판타지 성채와 3점 투시를 손끝 기즈모로 즉시 구축하는 공간 마에스트로", archetypeGenreKo: "배경 3D 아티스트", headToBodyRatio: 0.17, headTallUnits: 5.9, hairSilhouette: "cyber-ponytail", outfitSilhouette: "holo-trench", primaryHex: "#0ea5e9", secondaryHex: "#0f172a", accentHex: "#67e8f9", hairHex: "#0284c7", skinHex: "#ffedd5", eyeHex: "#38bdf8", inkOutlineHex: "#0c192c", hairHighlightHex: "#7dd3fc", outfitTrimHex: "#bae6fd", propKind: "holo-gizmo", companionKind: "holo-drone", dramaticVfxId: "cyber-holo-grid", signatureWeaponKo: "3축 홀로그램 기즈모 오브 & 공간 모델링 레이저 커터", defaultExpressionId: "smug-grin", defaultActionId: "dcc-3d-sculpt", defaultVfxId: "holo-floating-monitors", defaultZoneId: "zone-3d-blender-sketchup" },
  { personaId: "colorist", characterNameKo: "한미아 (채색·라이팅 연금술사)", roleTitleKo: "수석 디지털 채색 · 글로우 후보정 스페셜리스트", personalityTraitKo: "한 줄기 역광과 오로라 그라데이션으로 감정을 폭발시키는 색채 마법사", archetypeGenreKo: "채색 마스터", headToBodyRatio: 0.175, headTallUnits: 5.7, hairSilhouette: "aurora-twintail", outfitSilhouette: "prism-atelier-apron", primaryHex: "#ec4899", secondaryHex: "#311042", accentHex: "#f9a8d4", hairHex: "#db2777", skinHex: "#fff1f2", eyeHex: "#f472b6", inkOutlineHex: "#2e0f3a", hairHighlightHex: "#fbcfe8", outfitTrimHex: "#fef08a", propKind: "color-wand", companionKind: "none", dramaticVfxId: "rofan-rose-petals", signatureWeaponKo: "프리즘 에어브러시 완드 & 플로팅 컬러 오브", defaultExpressionId: "sparkle-star", defaultActionId: "awakening-skill-burst", defaultVfxId: "prism-stardust-burst", defaultZoneId: "zone-color-sound-stage" },
  { personaId: "story-writer", characterNameKo: "서이안 (콘티·세계관 작가)", roleTitleKo: "메인 스토리보드 · 컷 연출 · 대사 설계 작가", personalityTraitKo: "수백 장의 부유 스크롤을 동시에 전개하며 회수율 100% 복선을 짜는 설계자", archetypeGenreKo: "콘티 스토리 작가", headToBodyRatio: 0.172, headTallUnits: 5.8, hairSilhouette: "scholar-wave", outfitSilhouette: "scroll-vest", primaryHex: "#eab308", secondaryHex: "#1c1917", accentHex: "#fef08a", hairHex: "#78350f", skinHex: "#ffedd5", eyeHex: "#ca8a04", inkOutlineHex: "#291a0d", hairHighlightHex: "#fcd34d", outfitTrimHex: "#fef3c7", propKind: "sketchbook", companionKind: "none", dramaticVfxId: "eureka-spark-aura", signatureWeaponKo: "황금 만년필 지휘봉 & 6연장 홀로그램 콘티 스크롤", defaultExpressionId: "shocked-eureka", defaultActionId: "whiteboard-laser-pitch", defaultVfxId: "manga-speedlines", defaultZoneId: "zone-pd-storyboard-warroom" },
  { personaId: "chief-pd", characterNameKo: "박슬기 (총괄 프로듀서)", roleTitleKo: "총괄 웹툰 PD · 일정·품평·글로벌 런칭 지휘", personalityTraitKo: "전 파트 병목을 단번에 해결하고 팀 전체에 마감 버프를 걸어주는 카리스마 리더", archetypeGenreKo: "스타 웹툰 PD", headToBodyRatio: 0.168, headTallUnits: 6.0, hairSilhouette: "executive-bob", outfitSilhouette: "tailored-director-suit", primaryHex: "#10b981", secondaryHex: "#064e3b", accentHex: "#6ee7b7", hairHex: "#111827", skinHex: "#ffe4d6", eyeHex: "#059669", inkOutlineHex: "#062c22", hairHighlightHex: "#64748b", outfitTrimHex: "#d1fae5", propKind: "director-baton", companionKind: "none", dramaticVfxId: "highfive-shockwave", signatureWeaponKo: "마스터 칸반 홀로패드 & 지휘 레이저 배턴", defaultExpressionId: "collab-heart", defaultActionId: "highfive-team-sync", defaultVfxId: "collab-tether-beam", defaultZoneId: "zone-pd-storyboard-warroom" },
  { personaId: "action-mocap-actor", characterNameKo: "레오 (액션·모션캡처 디렉터)", roleTitleKo: "역동적 카메라 워크 · 3D VRM 모션캡처 액터", personalityTraitKo: "고난도 무협·판타지 액션을 직접 시연해 실시간 3D 본(Bone) 데이터로 전송", archetypeGenreKo: "액션 모캡 디렉터", headToBodyRatio: 0.166, headTallUnits: 6.0, hairSilhouette: "visor-undercut", outfitSilhouette: "neon-mocap-suit", primaryHex: "#f97316", secondaryHex: "#18181b", accentHex: "#fdba74", hairHex: "#ea580c", skinHex: "#fed7aa", eyeHex: "#fb923c", inkOutlineHex: "#1c120b", hairHighlightHex: "#fed7aa", outfitTrimHex: "#ffedd5", propKind: "mana-blade", companionKind: "none", dramaticVfxId: "focus-flame-aura", signatureWeaponKo: "광학 트래킹 듀얼 블레이드 & 부스터 부츠", defaultExpressionId: "caffeine-overdrive", defaultActionId: "sprint-afterimage", defaultVfxId: "fever-lightning-flames", defaultZoneId: "zone-3d-blender-sketchup" },
  { personaId: "sound-letterer", characterNameKo: "유나 (사운드·식자 아티스트)", roleTitleKo: "웹툰 효과음(SFX) · 타이포그래피 식자 · BGM 디렉터", personalityTraitKo: "글자 자체가 살아 움직이는 역동적 의성어·의태어 레터링과 공간 음향 연출", archetypeGenreKo: "사운드·식자 아티스트", headToBodyRatio: 0.175, headTallUnits: 5.7, hairSilhouette: "headphone-hood", outfitSilhouette: "sonic-street-parka", primaryHex: "#8b5cf6", secondaryHex: "#2e1065", accentHex: "#c4b5fd", hairHex: "#6d28d9", skinHex: "#ffe4e6", eyeHex: "#a855f7", inkOutlineHex: "#1e0b40", hairHighlightHex: "#ddd6fe", outfitTrimHex: "#ede9fe", propKind: "sound-brush", companionKind: "none", dramaticVfxId: "rhythm-note-wave", signatureWeaponKo: "네온 음파 캘리그라피 브러시 & 헤드셋", defaultExpressionId: "joyful-wink", defaultActionId: "victory-jump-cheer", defaultVfxId: "neon-magic-circle", defaultZoneId: "zone-color-sound-stage" },
  { personaId: "studio-cat-mascot", characterNameKo: "소피아 & 치즈냥 (AI 코파일럿)", roleTitleKo: "AI 자동 채색·3D 보정 어시스턴트 & 힐링 마스코트", personalityTraitKo: "작은 얼굴에 반짝이는 고양이 귀와 치즈냥 동행으로 전 데스크를 누비는 힐링 코파일럿", archetypeGenreKo: "반려 고양이 마스코트 동행", headToBodyRatio: 0.18, headTallUnits: 5.5, hairSilhouette: "astral-cat-halo", outfitSilhouette: "starlight-mascot-cape", primaryHex: "#14b8a6", secondaryHex: "#134e4a", accentHex: "#99f6e4", hairHex: "#f59e0b", skinHex: "#fff7ed", eyeHex: "#2dd4bf", inkOutlineHex: "#0f2e2b", hairHighlightHex: "#fde68a", outfitTrimHex: "#fef3c7", propKind: "tablet-deck", companionKind: "cheese-cat", dramaticVfxId: "mascot-clover-blessing", signatureWeaponKo: "AI 오토컬러 드론 & 에스프레소 배달 트레이", defaultExpressionId: "bright-smile", defaultActionId: "espresso-power-charge", defaultVfxId: "biophilic-sakura-wind", defaultZoneId: "zone-line-atelier" },
];

export const PRACTICAL_COLLAB_ZONES: readonly PracticalCollabZoneSpec[] = [
  { id: "zone-line-atelier", titleKo: "✒️ 선화·펜터치 집중 아틀리에", subtitleKo: "듀얼 5K 신티크 · 실시간 필압 브러시 동기화 · AI 밑색 보조", badgeEmoji: "✒️", accentHex: "#f43f5e", floorRect: { xPct: 4, yPct: 8, widthPct: 44, heightPct: 39 } },
  { id: "zone-3d-blender-sketchup", titleKo: "🧊 ToonStudio 3D 배경 합동 스튜디오", subtitleKo: "Push/Pull 건축 모델링 · 그리즈펜슬 2.5D · VRM 액션 모션캡처", badgeEmoji: "🧊", accentHex: "#0ea5e9", floorRect: { xPct: 52, yPct: 8, widthPct: 44, heightPct: 39 } },
  { id: "zone-color-sound-stage", titleKo: "🎨 채색·툰셰이더·사운드 식자 부스", subtitleKo: "EEVEE Shader-to-RGB 라이팅 · 효과음 레터링 · 크로마 후보정", badgeEmoji: "🎨", accentHex: "#ec4899", floorRect: { xPct: 4, yPct: 53, widthPct: 44, heightPct: 39 } },
  { id: "zone-pd-storyboard-warroom", titleKo: "🎬 콘티 피칭·실시간 합평 워룸", subtitleKo: "전 파트 실시간 컷 검수 · 캔버스 핀 피드백 · 마감 스프린트 지휘", badgeEmoji: "🎬", accentHex: "#10b981", floorRect: { xPct: 52, yPct: 53, widthPct: 44, heightPct: 39 } },
];

/** 20종 확장 동작 카탈로그 (기본 10종 + 오피스 4종 + 작가 건강 체조 3종 + 신나는 댄스 3종). */
export const STUDIO_EXTENDED_SPRITE_ACTIONS: readonly (Omit<DynamicSpriteActionSpec, "id"> & { readonly id: DynamicSpriteExtendedActionId })[] = [
  ...DYNAMIC_SPRITE_ACTIONS,
  { id: "chair-sit", labelKo: "의자 착석·원고 작업", badgeEmoji: "🪑", frameCount: 8, defaultFps: 8, workContextKo: "작업 데스크에 안정감 있게 앉아 호흡하며 타이핑·작화", recommendedVfxId: "biophilic-sakura-wind", recommendedDramaticVfxId: "wood-step-ripple" },
  { id: "wave-greet", labelKo: "반갑게 손 흔들기", badgeEmoji: "👋", frameCount: 8, defaultFps: 12, workContextKo: "동료와 눈을 맞추며 자연스럽게 오른손을 흔들어 인사", recommendedVfxId: "collab-tether-beam", recommendedDramaticVfxId: "highfive-shockwave" },
  { id: "clap-cheer", labelKo: "박수·칭찬 리액션", badgeEmoji: "👏", frameCount: 8, defaultFps: 12, workContextKo: "합평 발표나 마감 완료 후 경쾌하게 박수로 응원", recommendedVfxId: "prism-stardust-burst", recommendedDramaticVfxId: "deadline-confetti-fireworks" },
  { id: "think-ponder", labelKo: "구도·연출 고민 중", badgeEmoji: "🤔", frameCount: 8, defaultFps: 8, workContextKo: "턱을 괴고 다음 컷 구도와 대사를 깊이 고민하는 모션", recommendedVfxId: "holo-floating-monitors", recommendedDramaticVfxId: "eureka-spark-aura" },
  { id: "neck-shoulder-stretch", labelKo: "목·어깨 체조", badgeEmoji: "💆", frameCount: 8, defaultFps: 8, workContextKo: "고개 기울이기와 어깨 회전으로 장시간 작화 피로를 부드럽게 해소", recommendedVfxId: "biophilic-sakura-wind", recommendedDramaticVfxId: "mint-healing-spark" },
  { id: "wrist-roll-break", labelKo: "손목 풀기 체조", badgeEmoji: "👐", frameCount: 8, defaultFps: 8, workContextKo: "50분 작업 뒤 30초 손목 회전으로 펜 잡는 손의 긴장을 푸는 리커버리", recommendedVfxId: "biophilic-sakura-wind", recommendedDramaticVfxId: "mint-healing-spark" },
  { id: "standing-gymnastics", labelKo: "전신 스트레칭 체조", badgeEmoji: "🤸", frameCount: 8, defaultFps: 12, workContextKo: "양팔을 크게 뻗어 허리와 등 근육을 깨우는 스튜디오 활력 체조", recommendedVfxId: "collab-tether-beam", recommendedDramaticVfxId: "mint-healing-spark" },
  { id: "groove-dance", labelKo: "리듬 댄스", badgeEmoji: "🎵", frameCount: 8, defaultFps: 12, workContextKo: "경쾌한 비트에 맞춰 고개와 어깨를 흔드는 리듬 음표 댄스", recommendedVfxId: "neon-magic-circle", recommendedDramaticVfxId: "rhythm-note-wave" },
  { id: "deadline-victory-dance", labelKo: "마감 축하 댄스", badgeEmoji: "🪩", frameCount: 8, defaultFps: 12, workContextKo: "회차 마감 직후 무대 스포트라이트 아래서 펼치는 환호 댄스", recommendedVfxId: "prism-stardust-burst", recommendedDramaticVfxId: "stage-spotlight-ring" },
  { id: "sync-group-dance", labelKo: "팀 동기화 댄스", badgeEmoji: "🕺", frameCount: 8, defaultFps: 12, workContextKo: "동료들과 박자를 맞춰 함께 추는 하모니 웨이브 팀 군무", recommendedVfxId: "collab-tether-beam", recommendedDramaticVfxId: "team-harmony-wave" },
];

export const STUDIO_DIVERSITY_SPRITE_EXTRA_CAST: readonly DynamicCreatorPersonaSpriteSpec<StudioDiversityExtraPersonaId>[] = [
  { personaId: "bg-architect", characterNameKo: "아마라 (배경 원화 디렉터)", roleTitleKo: "건축 투시 · 자연 배경 · 실내 라이트 설계", personalityTraitKo: "따뜻한 채광과 실사급 투시로 장면의 공간감을 완성하는 배경 장인", archetypeGenreKo: "배경 3D·건축 원화", headToBodyRatio: 0.169, headTallUnits: 5.9, hairSilhouette: "scholar-wave", outfitSilhouette: "holo-trench", primaryHex: "#0d9488", secondaryHex: "#134e4a", accentHex: "#5eead4", hairHex: "#27272a", skinHex: "#d69e72", eyeHex: "#0f766e", inkOutlineHex: "#0c2b28", hairHighlightHex: "#71717a", outfitTrimHex: "#ccfbf1", propKind: "sketchbook", companionKind: "none", dramaticVfxId: "grass-petal-ripple", signatureWeaponKo: "투시 자 & 건축 스케치 패드", defaultExpressionId: "zen-flow", defaultActionId: "dcc-3d-sculpt", defaultVfxId: "biophilic-sakura-wind", defaultZoneId: "zone-3d-blender-sketchup", eyewear: "round-glasses" },
  { personaId: "editorial-chief", characterNameKo: "정호 (베테랑 편집장)", roleTitleKo: "수석 편집장 · AD 아트디렉터 · 마감 품질 검수", personalityTraitKo: "20년 경력의 침착한 시선으로 회차 템포와 아트 방향을 다듬는 AD 편집장", archetypeGenreKo: "AD 아트디렉터", headToBodyRatio: 0.166, headTallUnits: 6.0, hairSilhouette: "executive-bob", outfitSilhouette: "tailored-director-suit", primaryHex: "#475569", secondaryHex: "#0f172a", accentHex: "#cbd5e1", hairHex: "#64748b", skinHex: "#f3cdb0", eyeHex: "#334155", inkOutlineHex: "#0f172a", hairHighlightHex: "#e2e8f0", outfitTrimHex: "#f8fafc", propKind: "director-baton", companionKind: "none", dramaticVfxId: "marble-starlight-ripple", signatureWeaponKo: "레드라인 검수 펜 & 회차 타임라인 보드", defaultExpressionId: "smug-grin", defaultActionId: "whiteboard-laser-pitch", defaultVfxId: "collab-tether-beam", defaultZoneId: "zone-pd-storyboard-warroom", eyewear: "glasses" },
  { personaId: "lighting-director", characterNameKo: "누르 (라이팅·합성 감독)", roleTitleKo: "분위기 조명 · 후보정 · 색보정 아티스트", personalityTraitKo: "시간대별 자연광과 역광 대비로 컷의 감정을 살리는 색보정 전문가", archetypeGenreKo: "채색·라이팅 마스터", headToBodyRatio: 0.172, headTallUnits: 5.8, hairSilhouette: "cyber-ponytail", outfitSilhouette: "prism-atelier-apron", primaryHex: "#6366f1", secondaryHex: "#1e1b4b", accentHex: "#a5b4fc", hairHex: "#312e81", skinHex: "#c68b59", eyeHex: "#818cf8", inkOutlineHex: "#141038", hairHighlightHex: "#c7d2fe", outfitTrimHex: "#e0e7ff", propKind: "color-wand", companionKind: "none", dramaticVfxId: "entrance-spotlight-beam", signatureWeaponKo: "스펙트럼 컬러 휠 & 광원 브러시", defaultExpressionId: "bright-smile", defaultActionId: "tablet-combo-draw", defaultVfxId: "prism-stardust-burst", defaultZoneId: "zone-color-sound-stage" },
  { personaId: "junior-inker", characterNameKo: "도윤 (신입 선화·어시스턴트)", roleTitleKo: "밑선 정리 · 말풍선 배치 · 톤 보정 어시스턴트", personalityTraitKo: "빠른 손과 밝은 에너지로 마감 팀의 빈틈을 메우는 열정 신입", archetypeGenreKo: "어시스턴트 선화", headToBodyRatio: 0.178, headTallUnits: 5.6, hairSilhouette: "beret-spiky", outfitSilhouette: "sonic-street-parka", primaryHex: "#2563eb", secondaryHex: "#1e3a8a", accentHex: "#93c5fd", hairHex: "#3f2e21", skinHex: "#fde2c8", eyeHex: "#1d4ed8", inkOutlineHex: "#122152", hairHighlightHex: "#a16207", outfitTrimHex: "#dbeafe", propKind: "stylus-pen", companionKind: "none", dramaticVfxId: "dash-speedlines", signatureWeaponKo: "정밀 잉크 펜 & 말풍선 가이드", defaultExpressionId: "joyful-wink", defaultActionId: "walk-stride", defaultVfxId: "manga-speedlines", defaultZoneId: "zone-line-atelier" },
];

/** 12인 기본 다양성 크리에이터 스프라이트 캐스트(기존 8인 + 확장 4인, 하위 호환 고정). */
export const STUDIO_FULL_SPRITE_CAST: readonly DynamicCreatorPersonaSpriteSpec<StudioFullSpritePersonaId>[] = [
  ...DYNAMIC_CREATOR_SPRITE_CAST,
  ...STUDIO_DIVERSITY_SPRITE_EXTRA_CAST,
];

/** 한국 웹툰 대표 장르·아키타입 확장 8인 캐스트 (로판·현대헌터·서울학원물·사이버펑크·무협·바리스타·코기동행). */
export const STUDIO_WEBTOON_ARCHETYPE_EXTRA_CAST: readonly DynamicCreatorPersonaSpriteSpec<StudioWebtoonArchetypePersonaId>[] = [
  {
    personaId: "rofan-duchess",
    characterNameKo: "세라피나 (로판 영애·공녀)",
    roleTitleKo: "로맨스 판타지 주인공 · 황실 드레스 작화 뮤즈",
    personalityTraitKo: "황금 티아라와 장미빛 실크 망토를 두르고 우아한 깃펜으로 회귀 서사를 수놓는 공녀",
    archetypeGenreKo: "로판 공녀",
    headToBodyRatio: 0.172,
    headTallUnits: 5.8,
    hairSilhouette: "royal-tiara-curls",
    outfitSilhouette: "rofan-ballgown-cape",
    primaryHex: "#e11d48",
    secondaryHex: "#4c0519",
    accentHex: "#fde68a",
    hairHex: "#f59e0b",
    skinHex: "#fff1f2",
    eyeHex: "#10b981",
    inkOutlineHex: "#3b0719",
    hairHighlightHex: "#fef9c3",
    outfitTrimHex: "#fef08a",
    propKind: "rose-quill",
    companionKind: "none",
    dramaticVfxId: "rofan-rose-petals",
    signatureWeaponKo: "황실 장미 깃펜 & 금장 티아라",
    defaultExpressionId: "sparkle-star",
    defaultActionId: "awakening-skill-burst",
    defaultVfxId: "biophilic-sakura-wind",
    defaultZoneId: "zone-color-sound-stage",
  },
  {
    personaId: "rofan-crown-prince",
    characterNameKo: "카엘 (로판 북부대공·황태자)",
    roleTitleKo: "로판 황태자 · 제국 제복·갑주 연출 디렉터",
    personalityTraitKo: "흑발과 적안, 금장 견장 망토로 압도적 카리스마를 뿜는 북부대공형 캐릭터",
    archetypeGenreKo: "로판 황태자",
    headToBodyRatio: 0.164,
    headTallUnits: 6.1,
    hairSilhouette: "imperial-crown-sweep",
    outfitSilhouette: "imperial-uniform-mantle",
    primaryHex: "#1e3a8a",
    secondaryHex: "#0f172a",
    accentHex: "#facc15",
    hairHex: "#0f172a",
    skinHex: "#ffe4d6",
    eyeHex: "#dc2626",
    inkOutlineHex: "#090d1a",
    hairHighlightHex: "#64748b",
    outfitTrimHex: "#fde047",
    propKind: "mana-blade",
    companionKind: "none",
    dramaticVfxId: "martial-fantasy-magic-circle",
    signatureWeaponKo: "황실 금장 사브르 & 봉랍 인장",
    defaultExpressionId: "smug-grin",
    defaultActionId: "whiteboard-laser-pitch",
    defaultVfxId: "neon-magic-circle",
    defaultZoneId: "zone-pd-storyboard-warroom",
  },
  {
    personaId: "modern-hunter-awakener",
    characterNameKo: "성진 (현대 헌터 각성자)",
    roleTitleKo: "S급 헌터물 액션 · 다크 판타지 마나 이펙트 담당",
    personalityTraitKo: "네온 블루 마나 오라와 다크 롱코트를 휘날리며 마감 게이트를 돌파하는 각성자",
    archetypeGenreKo: "현대 헌터 각성자",
    headToBodyRatio: 0.166,
    headTallUnits: 6.0,
    hairSilhouette: "hunter-spiky-aura",
    outfitSilhouette: "hunter-mana-coat",
    primaryHex: "#2563eb",
    secondaryHex: "#09090b",
    accentHex: "#38bdf8",
    hairHex: "#18181b",
    skinHex: "#ffedd5",
    eyeHex: "#38bdf8",
    inkOutlineHex: "#09090b",
    hairHighlightHex: "#60a5fa",
    outfitTrimHex: "#7dd3fc",
    propKind: "mana-blade",
    companionKind: "none",
    dramaticVfxId: "focus-flame-aura",
    signatureWeaponKo: "청염 마나 쌍단검 & 상태창 홀로 HUD",
    defaultExpressionId: "focused-flame",
    defaultActionId: "sprint-afterimage",
    defaultVfxId: "fever-lightning-flames",
    defaultZoneId: "zone-line-atelier",
  },
  {
    personaId: "seoul-academy-student",
    characterNameKo: "하린 (서울 학원물 주인공)",
    roleTitleKo: "청춘 학원물 · 일상 로맨스 연출 · 표정 작화 담당",
    personalityTraitKo: "세련된 서울 명문고 교복 블레이저와 크로키북을 들고 캠퍼스를 누비는 청춘 캐릭터",
    archetypeGenreKo: "서울 학원물",
    headToBodyRatio: 0.176,
    headTallUnits: 5.7,
    hairSilhouette: "academy-ribbon-long",
    outfitSilhouette: "seoul-academy-blazer",
    primaryHex: "#3b82f6",
    secondaryHex: "#1e293b",
    accentHex: "#f472b6",
    hairHex: "#3b2314",
    skinHex: "#ffe8dc",
    eyeHex: "#4f46e5",
    inkOutlineHex: "#1e1b4b",
    hairHighlightHex: "#c08457",
    outfitTrimHex: "#f8fafc",
    propKind: "sketchbook",
    companionKind: "none",
    dramaticVfxId: "entrance-spotlight-beam",
    signatureWeaponKo: "서울 학원 크로키북 & 파스텔 젤펜",
    defaultExpressionId: "bright-smile",
    defaultActionId: "victory-jump-cheer",
    defaultVfxId: "prism-stardust-burst",
    defaultZoneId: "zone-color-sound-stage",
  },
  {
    personaId: "cyberpunk-hacker",
    characterNameKo: "네오-K (사이버펑크 해커)",
    roleTitleKo: "SF·사이버펑크 UI · 홀로그램 셰이더 테크니컬 아티스트",
    personalityTraitKo: "네온 바이저와 증강 태블릿 덱으로 미래 도시 서울의 데이터 스트림을 해킹하는 아티스트",
    archetypeGenreKo: "사이버펑크 해커",
    headToBodyRatio: 0.17,
    headTallUnits: 5.9,
    hairSilhouette: "visor-undercut",
    outfitSilhouette: "neon-mocap-suit",
    primaryHex: "#06b6d4",
    secondaryHex: "#0f172a",
    accentHex: "#e879f9",
    hairHex: "#7c3aed",
    skinHex: "#ffedd5",
    eyeHex: "#22d3ee",
    inkOutlineHex: "#0a0f1e",
    hairHighlightHex: "#c4b5fd",
    outfitTrimHex: "#67e8f9",
    propKind: "tablet-deck",
    companionKind: "holo-drone",
    dramaticVfxId: "cyber-holo-grid",
    signatureWeaponKo: "네온 증강 태블릿 덱 & 스캐너 드론",
    defaultExpressionId: "caffeine-overdrive",
    defaultActionId: "dcc-3d-sculpt",
    defaultVfxId: "holo-floating-monitors",
    defaultZoneId: "zone-3d-blender-sketchup",
  },
  {
    personaId: "murim-swordsman",
    characterNameKo: "청운 (정통 무협 협객)",
    roleTitleKo: "무협 검극 · 수묵 필압 브러시 · 타격 컷 마스터",
    personalityTraitKo: "비취 도포와 상투 리본을 휘날리며 수묵 일섬으로 액션 컷을 가르는 정통 무협 협객",
    archetypeGenreKo: "무협 협객",
    headToBodyRatio: 0.166,
    headTallUnits: 6.0,
    hairSilhouette: "murim-topknot-ribbon",
    outfitSilhouette: "murim-hanbok-robe",
    primaryHex: "#0f766e",
    secondaryHex: "#111827",
    accentHex: "#5eead4",
    hairHex: "#111827",
    skinHex: "#fde2c8",
    eyeHex: "#14b8a6",
    inkOutlineHex: "#081c1a",
    hairHighlightHex: "#475569",
    outfitTrimHex: "#f8fafc",
    propKind: "murim-sword",
    companionKind: "none",
    dramaticVfxId: "ink-calligraphy-slash",
    signatureWeaponKo: "청강검 & 수묵 필압 붓",
    defaultExpressionId: "zen-flow",
    defaultActionId: "tablet-combo-draw",
    defaultVfxId: "crimson-ink-slash",
    defaultZoneId: "zone-line-atelier",
  },
  {
    personaId: "atelier-barista",
    characterNameKo: "모카 (감성 카페 바리스타)",
    roleTitleKo: "스튜디오 라운지 바리스타 · 휴식·체조 웰니스 매니저",
    personalityTraitKo: "라떼아트와 따뜻한 스팀 하트로 마감에 지친 작가들의 컨디션을 챙기는 감성 바리스타",
    archetypeGenreKo: "감성 카페 바리스타",
    headToBodyRatio: 0.175,
    headTallUnits: 5.7,
    hairSilhouette: "barista-beret-bun",
    outfitSilhouette: "cafe-barista-apron",
    primaryHex: "#92400e",
    secondaryHex: "#451a03",
    accentHex: "#fde68a",
    hairHex: "#5b3a26",
    skinHex: "#ffedd5",
    eyeHex: "#b45309",
    inkOutlineHex: "#2e1204",
    hairHighlightHex: "#d97706",
    outfitTrimHex: "#fef3c7",
    propKind: "coffee-dripper",
    companionKind: "none",
    dramaticVfxId: "coffee-healing-steam",
    signatureWeaponKo: "핸드드립 서버 & 하트 라떼 머그",
    defaultExpressionId: "bright-smile",
    defaultActionId: "espresso-power-charge",
    defaultVfxId: "biophilic-sakura-wind",
    defaultZoneId: "zone-pd-storyboard-warroom",
    eyewear: "round-glasses",
  },
  {
    personaId: "companion-corgi-director",
    characterNameKo: "해피 & 웰시코기 (반려견 동행)",
    roleTitleKo: "힐링 일상툰 디렉터 · 반려 강아지 마스코트 듀오",
    personalityTraitKo: "복슬복슬한 웰시코기 단짝과 함께 스튜디오를 산책하며 행복 에너지를 전파하는 작가",
    archetypeGenreKo: "반려 강아지 마스코트 동행",
    headToBodyRatio: 0.178,
    headTallUnits: 5.6,
    hairSilhouette: "corgi-ears-hood",
    outfitSilhouette: "cozy-companion-cardigan",
    primaryHex: "#f59e0b",
    secondaryHex: "#78350f",
    accentHex: "#fef08a",
    hairHex: "#b45309",
    skinHex: "#fff3e6",
    eyeHex: "#d97706",
    inkOutlineHex: "#3b1b06",
    hairHighlightHex: "#fcd34d",
    outfitTrimHex: "#fffbeb",
    propKind: "tablet-deck",
    companionKind: "welsh-corgi",
    dramaticVfxId: "mascot-clover-blessing",
    signatureWeaponKo: "휴대용 드로잉 패드 & 코기 간식 파우치",
    defaultExpressionId: "joyful-wink",
    defaultActionId: "highfive-team-sync",
    defaultVfxId: "collab-tether-beam",
    defaultZoneId: "zone-line-atelier",
  },
];

/** 20인 한국 웹툰 대표 아키타입 마스터 스프라이트 캐스트 (기본 12인 + 웹툰 장르·동행 8인). */
export const STUDIO_WEBTOON_MASTER_SPRITE_CAST: readonly DynamicCreatorPersonaSpriteSpec[] = [
  ...STUDIO_FULL_SPRITE_CAST,
  ...STUDIO_WEBTOON_ARCHETYPE_EXTRA_CAST,
];

export function getDynamicCreatorPersonaSpec(
  personaId: StudioMasterSpritePersonaId,
): DynamicCreatorPersonaSpriteSpec {
  return (
    STUDIO_WEBTOON_MASTER_SPRITE_CAST.find((item) => item.personaId === personaId) ??
    DYNAMIC_CREATOR_SPRITE_CAST[0]
  );
}
