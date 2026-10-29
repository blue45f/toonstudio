/**
 * 다채로운 소두(5.5~6등신) 다중 프레임 캐릭터 스프라이트 · 10종 표정 · 10종 역동적 동작 ·
 * 8종 화려한 특수효과(VFX) 및 4대 실무 업무 협업 존 정적 카탈로그·타입 정의.
 */
import type { IllustratedCreatorPersonaId } from "./studio-virtual-office-nextgen-engine-data";

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
}

export interface DynamicSpriteVfxSpec {
  readonly id: DynamicSpriteVfxId;
  readonly labelKo: string;
  readonly badgeEmoji: string;
  readonly primaryColorHex: string;
  readonly secondaryColorHex: string;
  readonly descriptionKo: string;
}

export interface DynamicCreatorPersonaSpriteSpec {
  readonly personaId: IllustratedCreatorPersonaId;
  readonly characterNameKo: string;
  readonly roleTitleKo: string;
  readonly personalityTraitKo: string;
  readonly headToBodyRatio: number;
  readonly headTallUnits: number;
  readonly hairSilhouette:
    | "beret-spiky"
    | "cyber-ponytail"
    | "aurora-twintail"
    | "scholar-wave"
    | "executive-bob"
    | "visor-undercut"
    | "headphone-hood"
    | "astral-cat-halo";
  readonly outfitSilhouette:
    | "ink-cape-coat"
    | "holo-trench"
    | "prism-atelier-apron"
    | "scroll-vest"
    | "tailored-director-suit"
    | "neon-mocap-suit"
    | "sonic-street-parka"
    | "starlight-mascot-cape";
  readonly primaryHex: string;
  readonly secondaryHex: string;
  readonly accentHex: string;
  readonly hairHex: string;
  readonly skinHex: string;
  readonly eyeHex: string;
  readonly signatureWeaponKo: string;
  readonly defaultExpressionId: DynamicSpriteExpressionId;
  readonly defaultActionId: DynamicSpriteActionId;
  readonly defaultVfxId: DynamicSpriteVfxId;
  readonly defaultZoneId: PracticalCollabZoneId;
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
  readonly personaId: IllustratedCreatorPersonaId;
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
  readonly pairedWithPersonaId: IllustratedCreatorPersonaId | null;
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
  readonly authorPersonaId: IllustratedCreatorPersonaId;
  readonly targetTaskCode: string;
  readonly noteKo: string;
  readonly resolved: boolean;
}

export interface PracticalSpriteWorkspaceState {
  readonly selectedPersonaId: IllustratedCreatorPersonaId;
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
  { id: "bright-smile", labelKo: "환한 미소", badgeEmoji: "😊", descriptionKo: "맑은 하이라이트 눈빛과 홍조 띤 밝은 미소", eyeStyle: "crescent-bright", mouthStyle: "open-smile", blushOpacity: 0.45, sweatDrop: false },
  { id: "sparkle-star", labelKo: "영감 폭발 별눈", badgeEmoji: "🤩", descriptionKo: "아이디어가 떠올라 반짝이는 황금 별동공", eyeStyle: "star-pupil", mouthStyle: "cheer-laugh", blushOpacity: 0.55, sweatDrop: false },
  { id: "focused-flame", labelKo: "초집중 불꽃 눈빛", badgeEmoji: "🔥", descriptionKo: "마감 퀄리티를 끌어올리는 날카로운 몰입 시선", eyeStyle: "fierce-slant", mouthStyle: "firm-line", blushOpacity: 0.15, sweatDrop: false },
  { id: "joyful-wink", labelKo: "승리 윙크", badgeEmoji: "😉", descriptionKo: "컷 검수 통과 후 상쾌한 윙크와 미소", eyeStyle: "wink-happy", mouthStyle: "cat-grin", blushOpacity: 0.5, sweatDrop: false },
  { id: "smug-grin", labelKo: "자신만만 씨익", badgeEmoji: "😏", descriptionKo: "어려운 구도와 3D 투시를 완벽히 해결한 표정", eyeStyle: "smug-half", mouthStyle: "smirk", blushOpacity: 0.25, sweatDrop: false },
  { id: "shocked-eureka", labelKo: "유레카 깜짝!", badgeEmoji: "⚡", descriptionKo: "극적인 연출 반전을 발견한 놀람 표정", eyeStyle: "wide-shock", mouthStyle: "surprised-o", blushOpacity: 0.2, sweatDrop: true },
  { id: "caffeine-overdrive", labelKo: "카페인 풀충전 각성", badgeEmoji: "☕", descriptionKo: "에스프레소 충전 후 네온 링이 도는 초고속 각성", eyeStyle: "neon-ring", mouthStyle: "hyper-grin", blushOpacity: 0.35, sweatDrop: false },
  { id: "deadline-panic", labelKo: "마감 스퍼트 비상", badgeEmoji: "💦", descriptionKo: "마감 직전 초고속 손놀림과 송골송골 땀방울", eyeStyle: "panic-spiral", mouthStyle: "wavy-panic", blushOpacity: 0.3, sweatDrop: true },
  { id: "zen-flow", labelKo: "무아지경 평온 몰입", badgeEmoji: "🧘", descriptionKo: "완벽한 리듬으로 선화와 채색을 이어가는 평온함", eyeStyle: "closed-zen", mouthStyle: "calm-smile", blushOpacity: 0.3, sweatDrop: false },
  { id: "collab-heart", labelKo: "협업 환호 하트눈", badgeEmoji: "💖", descriptionKo: "팀원과 호흡을 맞춰 시너지를 내는 응원 표정", eyeStyle: "heart-glow", mouthStyle: "talk-sync", blushOpacity: 0.65, sweatDrop: false },
];

export const DYNAMIC_SPRITE_ACTIONS: readonly DynamicSpriteActionSpec[] = [
  { id: "idle-breathe", labelKo: "리듬 호흡·망토 흔들림", badgeEmoji: "🌬️", frameCount: 8, defaultFps: 8, workContextKo: "대기 중 자연스러운 8프레임 호흡과 머리카락·코트 흔들림", recommendedVfxId: "biophilic-sakura-wind" },
  { id: "walk-stride", labelKo: "경쾌한 8프레임 워킹", badgeEmoji: "🏃", frameCount: 8, defaultFps: 12, workContextKo: "부서 간 이동 시 팔다리 교차 스윙과 경쾌한 바운스", recommendedVfxId: "neon-magic-circle" },
  { id: "sprint-afterimage", labelKo: "초고속 마감 질주(잔상)", badgeEmoji: "⚡", frameCount: 8, defaultFps: 24, workContextKo: "긴급 합평 호출 시 3중 네온 잔상을 남기는 대시", recommendedVfxId: "manga-speedlines" },
  { id: "tablet-combo-draw", labelKo: "신티크 초고속 작화 콤보", badgeEmoji: "✒️", frameCount: 8, defaultFps: 12, workContextKo: "듀얼 펜타블렛 위에서 검기처럼 펜선을 긋는 고속 작화", recommendedVfxId: "crimson-ink-slash" },
  { id: "dcc-3d-sculpt", labelKo: "3D 스케치업·블렌더 조형", badgeEmoji: "🧊", frameCount: 8, defaultFps: 12, workContextKo: "공중의 3D 성채·배경 홀로그램 메쉬를 양손으로 회전·조형", recommendedVfxId: "holo-floating-monitors" },
  { id: "whiteboard-laser-pitch", labelKo: "화이트보드 레이저 브리핑", badgeEmoji: "📊", frameCount: 8, defaultFps: 12, workContextKo: "콘티 동선과 연출 프레임을 레이저 포인터로 지휘", recommendedVfxId: "collab-tether-beam" },
  { id: "espresso-power-charge", labelKo: "아메리카노 원샷 충전", badgeEmoji: "☕", frameCount: 8, defaultFps: 12, workContextKo: "카페인 급속 충전으로 집중력 버프 오라 활성화", recommendedVfxId: "fever-lightning-flames" },
  { id: "victory-jump-cheer", labelKo: "컷 승인 점프 환호", badgeEmoji: "🎉", frameCount: 8, defaultFps: 12, workContextKo: "원고 컷 최종 승인 시 하이점프와 양팔 만세 세리머니", recommendedVfxId: "prism-stardust-burst" },
  { id: "highfive-team-sync", labelKo: "팀원 하이파이브 공명", badgeEmoji: "🙌", frameCount: 8, defaultFps: 12, workContextKo: "파트 인계 및 공동 작업 시 파트너와 하이파이브", recommendedVfxId: "collab-tether-beam" },
  { id: "awakening-skill-burst", labelKo: "작가 각성 궁극기 폭발", badgeEmoji: "🌟", frameCount: 8, defaultFps: 24, workContextKo: "공중 부유 + 전신 아스트랄 윙과 다중 마법진 전개", recommendedVfxId: "prism-stardust-burst" },
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

export const DYNAMIC_CREATOR_SPRITE_CAST: readonly DynamicCreatorPersonaSpriteSpec[] = [
  { personaId: "line-artist", characterNameKo: "강하루 (수석 선화 장인)", roleTitleKo: "메인 선화 · 액션 펜터치 디렉터", personalityTraitKo: "타협 없는 0.1mm 칼선 장인 · 마감 피버 시 검기 같은 초고속 펜터치 발동", headToBodyRatio: 0.172, headTallUnits: 5.8, hairSilhouette: "beret-spiky", outfitSilhouette: "ink-cape-coat", primaryHex: "#f43f5e", secondaryHex: "#1e1b4b", accentHex: "#fda4af", hairHex: "#1e293b", skinHex: "#ffe4d6", eyeHex: "#e11d48", signatureWeaponKo: "크림슨 광선 스타일러스 창 & 듀얼 신티크", defaultExpressionId: "focused-flame", defaultActionId: "tablet-combo-draw", defaultVfxId: "crimson-ink-slash", defaultZoneId: "zone-line-atelier" },
  { personaId: "cgi-director", characterNameKo: "윤진 (3D·스케치업·블렌더 감독)", roleTitleKo: "수석 3D 배경 · CAD · 지오메트리 노드 설계자", personalityTraitKo: "복잡한 판타지 성채와 3점 투시를 손끝 기즈모로 즉시 구축하는 공간 마에스트로", headToBodyRatio: 0.17, headTallUnits: 5.9, hairSilhouette: "cyber-ponytail", outfitSilhouette: "holo-trench", primaryHex: "#0ea5e9", secondaryHex: "#0f172a", accentHex: "#67e8f9", hairHex: "#0284c7", skinHex: "#ffedd5", eyeHex: "#38bdf8", signatureWeaponKo: "3축 홀로그램 기즈모 오브 & 스케치업 레이저 커터", defaultExpressionId: "smug-grin", defaultActionId: "dcc-3d-sculpt", defaultVfxId: "holo-floating-monitors", defaultZoneId: "zone-3d-blender-sketchup" },
  { personaId: "colorist", characterNameKo: "한미아 (채색·라이팅 연금술사)", roleTitleKo: "수석 디지털 채색 · 글로우 후보정 스페셜리스트", personalityTraitKo: "한 줄기 역광과 오로라 그라데이션으로 감정을 폭발시키는 색채 마법사", headToBodyRatio: 0.175, headTallUnits: 5.7, hairSilhouette: "aurora-twintail", outfitSilhouette: "prism-atelier-apron", primaryHex: "#ec4899", secondaryHex: "#311042", accentHex: "#f9a8d4", hairHex: "#db2777", skinHex: "#fff1f2", eyeHex: "#f472b6", signatureWeaponKo: "프리즘 에어브러시 완드 & 플로팅 컬러 오브", defaultExpressionId: "sparkle-star", defaultActionId: "awakening-skill-burst", defaultVfxId: "prism-stardust-burst", defaultZoneId: "zone-color-sound-stage" },
  { personaId: "story-writer", characterNameKo: "서이안 (콘티·세계관 작가)", roleTitleKo: "메인 스토리보드 · 컷 연출 · 대사 설계 작가", personalityTraitKo: "수백 장의 부유 스크롤을 동시에 전개하며 회수율 100% 복선을 짜는 설계자", headToBodyRatio: 0.172, headTallUnits: 5.8, hairSilhouette: "scholar-wave", outfitSilhouette: "scroll-vest", primaryHex: "#eab308", secondaryHex: "#1c1917", accentHex: "#fef08a", hairHex: "#78350f", skinHex: "#ffedd5", eyeHex: "#ca8a04", signatureWeaponKo: "황금 만년필 지휘봉 & 6연장 홀로그램 콘티 스크롤", defaultExpressionId: "shocked-eureka", defaultActionId: "whiteboard-laser-pitch", defaultVfxId: "manga-speedlines", defaultZoneId: "zone-pd-storyboard-warroom" },
  { personaId: "chief-pd", characterNameKo: "박슬기 (총괄 프로듀서)", roleTitleKo: "총괄 웹툰 PD · 일정·품평·글로벌 런칭 지휘", personalityTraitKo: "전 파트 병목을 단번에 해결하고 팀 전체에 마감 버프를 걸어주는 카리스마 리더", headToBodyRatio: 0.168, headTallUnits: 6.0, hairSilhouette: "executive-bob", outfitSilhouette: "tailored-director-suit", primaryHex: "#10b981", secondaryHex: "#064e3b", accentHex: "#6ee7b7", hairHex: "#111827", skinHex: "#ffe4d6", eyeHex: "#059669", signatureWeaponKo: "마스터 칸반 홀로패드 & 지휘 레이저 배턴", defaultExpressionId: "collab-heart", defaultActionId: "highfive-team-sync", defaultVfxId: "collab-tether-beam", defaultZoneId: "zone-pd-storyboard-warroom" },
  { personaId: "action-mocap-actor", characterNameKo: "레오 (액션·모션캡처 디렉터)", roleTitleKo: "역동적 카메라 워크 · 3D VRM 모션캡처 액터", personalityTraitKo: "고난도 무협·판타지 액션을 직접 시연해 실시간 3D 본(Bone) 데이터로 전송", headToBodyRatio: 0.166, headTallUnits: 6.0, hairSilhouette: "visor-undercut", outfitSilhouette: "neon-mocap-suit", primaryHex: "#f97316", secondaryHex: "#18181b", accentHex: "#fdba74", hairHex: "#ea580c", skinHex: "#fed7aa", eyeHex: "#fb923c", signatureWeaponKo: "광학 트래킹 듀얼 블레이드 & 부스터 부츠", defaultExpressionId: "caffeine-overdrive", defaultActionId: "sprint-afterimage", defaultVfxId: "fever-lightning-flames", defaultZoneId: "zone-3d-blender-sketchup" },
  { personaId: "sound-letterer", characterNameKo: "유나 (사운드·식자 아티스트)", roleTitleKo: "웹툰 효과음(SFX) · 타이포그래피 식자 · BGM 디렉터", personalityTraitKo: "글자 자체가 살아 움직이는 역동적 의성어·의태어 레터링과 공간 음향 연출", headToBodyRatio: 0.175, headTallUnits: 5.7, hairSilhouette: "headphone-hood", outfitSilhouette: "sonic-street-parka", primaryHex: "#8b5cf6", secondaryHex: "#2e1065", accentHex: "#c4b5fd", hairHex: "#6d28d9", skinHex: "#ffe4e6", eyeHex: "#a855f7", signatureWeaponKo: "네온 음파 캘리그라피 브러시 & 헤드셋", defaultExpressionId: "joyful-wink", defaultActionId: "victory-jump-cheer", defaultVfxId: "neon-magic-circle", defaultZoneId: "zone-color-sound-stage" },
  { personaId: "studio-cat-mascot", characterNameKo: "소피아 & 치즈냥 (AI 코파일럿)", roleTitleKo: "AI 자동 채색·3D 보정 어시스턴트 & 힐링 마스코트", personalityTraitKo: "작은 얼굴에 반짝이는 고양이 귀와 홀로그램 드론으로 전 데스크를 넘나들며 자동 보조", headToBodyRatio: 0.18, headTallUnits: 5.5, hairSilhouette: "astral-cat-halo", outfitSilhouette: "starlight-mascot-cape", primaryHex: "#14b8a6", secondaryHex: "#134e4a", accentHex: "#99f6e4", hairHex: "#f59e0b", skinHex: "#fff7ed", eyeHex: "#2dd4bf", signatureWeaponKo: "AI 오토컬러 드론 & 에스프레소 배달 트레이", defaultExpressionId: "bright-smile", defaultActionId: "espresso-power-charge", defaultVfxId: "biophilic-sakura-wind", defaultZoneId: "zone-line-atelier" },
];

export const PRACTICAL_COLLAB_ZONES: readonly PracticalCollabZoneSpec[] = [
  { id: "zone-line-atelier", titleKo: "✒️ 선화·펜터치 집중 아틀리에", subtitleKo: "듀얼 5K 신티크 · 실시간 필압 브러시 동기화 · AI 밑색 보조", badgeEmoji: "✒️", accentHex: "#f43f5e", floorRect: { xPct: 4, yPct: 8, widthPct: 44, heightPct: 39 } },
  { id: "zone-3d-blender-sketchup", titleKo: "🧊 스케치업·블렌더 3D 배경 합동 스튜디오", subtitleKo: "Push/Pull 건축 모델링 · 그리즈펜슬 2.5D · VRM 액션 모션캡처", badgeEmoji: "🧊", accentHex: "#0ea5e9", floorRect: { xPct: 52, yPct: 8, widthPct: 44, heightPct: 39 } },
  { id: "zone-color-sound-stage", titleKo: "🎨 채색·툰셰이더·사운드 식자 부스", subtitleKo: "EEVEE Shader-to-RGB 라이팅 · 효과음 레터링 · 크로마 후보정", badgeEmoji: "🎨", accentHex: "#ec4899", floorRect: { xPct: 4, yPct: 53, widthPct: 44, heightPct: 39 } },
  { id: "zone-pd-storyboard-warroom", titleKo: "🎬 콘티 피칭·실시간 합평 워룸", subtitleKo: "전 파트 실시간 컷 검수 · 캔버스 핀 피드백 · 마감 스프린트 지휘", badgeEmoji: "🎬", accentHex: "#10b981", floorRect: { xPct: 52, yPct: 53, widthPct: 44, heightPct: 39 } },
];

export function getDynamicCreatorPersonaSpec(
  personaId: IllustratedCreatorPersonaId,
): DynamicCreatorPersonaSpriteSpec {
  return (
    DYNAMIC_CREATOR_SPRITE_CAST.find((item) => item.personaId === personaId) ??
    DYNAMIC_CREATOR_SPRITE_CAST[0]
  );
}
