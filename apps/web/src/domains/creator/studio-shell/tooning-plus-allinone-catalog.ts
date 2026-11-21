import type { StudioDefaultWorkspaceId } from "../studio-workspaces";

export type TooningLocale = "ko" | "en";

export type TooningGenreId = "rofan" | "school" | "action" | "daily" | "edu";
export type TooningToneId = "serious" | "comic" | "tense" | "touching";
export type TooningBeatStageId = "intro" | "rise" | "twist" | "climax";
export type TooningSpeakerPosition = "left" | "center" | "right";
export type TooningBubbleStyleId = "normal" | "shout" | "thought" | "narration";
export type TooningProductionMode = "solo" | "team";

export type TooningCharacterId =
  | "seoyeon"
  | "doyun"
  | "harin"
  | "jiho"
  | "taeo"
  | "yuna"
  | "bomi"
  | "mentor-min";

export type TooningPoseId =
  | "walk"
  | "run"
  | "surprise"
  | "point"
  | "draw-sword"
  | "desk-sit"
  | "crossed-arms"
  | "wave-hi"
  | "kneel-plea"
  | "midair-leap"
  | "lean-whisper"
  | "victory-cheer";

export type TooningExpressionId =
  | "bright-smile"
  | "shock"
  | "tears"
  | "anger"
  | "shy"
  | "smirk"
  | "focus"
  | "panic"
  | "relief"
  | "sparkle-awe";

export type TooningCameraId =
  | "full-wide"
  | "medium-bust"
  | "close-up"
  | "extreme-eyes"
  | "low-hero"
  | "high-overhead"
  | "dutch-tilt"
  | "over-shoulder";

export type TooningBackgroundId =
  | "imperial-hall"
  | "school-rooftop"
  | "city-night"
  | "cozy-cafe"
  | "crystal-rift"
  | "bright-classroom";

export type TooningSfxId =
  | "dugeun"
  | "kwang"
  | "beonjjeok"
  | "seureureuk"
  | "ungseong"
  | "banjjak";

export type TooningTeamStageId =
  | "story"
  | "conti"
  | "bg3d"
  | "lineart"
  | "coloring"
  | "lettering";

export interface TooningGenreSpec {
  readonly id: TooningGenreId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly taglineKo: string;
  readonly taglineEn: string;
  readonly defaultBackgroundId: TooningBackgroundId;
  readonly defaultCastIds: readonly [TooningCharacterId, TooningCharacterId, TooningCharacterId];
  readonly accentOklch: string;
}

export interface TooningToneSpec {
  readonly id: TooningToneId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly defaultExpressionId: TooningExpressionId;
  readonly defaultBubbleStyle: TooningBubbleStyleId;
  readonly defaultSfxId: TooningSfxId;
  readonly accentOklch: string;
}

export interface TooningCharacterSpec {
  readonly id: TooningCharacterId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly roleKo: string;
  readonly roleEn: string;
  readonly hairStyle: "wave" | "parted" | "ponytail" | "layered" | "spiky" | "bob" | "bun" | "neat";
  readonly hasGlasses: boolean;
  readonly hairOklch: string;
  readonly outfitOklch: string;
  readonly accentOklch: string;
  readonly skinOklch: string;
  readonly rigAssetKey: string;
}

export interface TooningPoseSpec {
  readonly id: TooningPoseId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly rigClipKey: string;
  readonly torsoTiltDeg: number;
  readonly leftArmDeg: number;
  readonly rightArmDeg: number;
  readonly legSpread: number;
  readonly bodyLiftY: number;
  readonly propKind: "none" | "sword" | "desk" | "spark";
  readonly suggestedSfxId: TooningSfxId;
}

export interface TooningExpressionSpec {
  readonly id: TooningExpressionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly browCurve: "happy" | "raised" | "sad" | "angry" | "neutral";
  readonly eyeShape: "smile" | "wide" | "tear" | "sharp" | "shy" | "star" | "open";
  readonly mouthShape: "grin" | "open-o" | "wobble" | "grit" | "small" | "smirk" | "line";
  readonly overlayFx: "none" | "blush" | "sweat" | "tears" | "anger-vein" | "sparkle";
  readonly blendshapePreset: Readonly<Record<string, number>>;
  readonly suggestedBubbleStyle: TooningBubbleStyleId;
}

export interface TooningCameraSpec {
  readonly id: TooningCameraId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly zoom: number;
  readonly offsetY: number;
  readonly tiltDeg: number;
  readonly showSpeedlines: boolean;
  readonly lensMm: number;
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
}

export interface TooningBackgroundSpec {
  readonly id: TooningBackgroundId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly skyTopOklch: string;
  readonly skyBottomOklch: string;
  readonly groundOklch: string;
  readonly accentOklch: string;
  readonly scene3dTemplateKey: string;
  readonly lightingMoodKo: string;
  readonly lightingMoodEn: string;
}

export interface TooningSfxSpec {
  readonly id: TooningSfxId;
  readonly textKo: string;
  readonly textEn: string;
  readonly moodKo: string;
  readonly moodEn: string;
  readonly fillOklch: string;
  readonly strokeOklch: string;
  readonly tiltDeg: number;
}

export interface TooningBubbleStyleSpec {
  readonly id: TooningBubbleStyleId;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface TooningTeamStageSpec {
  readonly id: TooningTeamStageId;
  readonly order: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly roleOwnerKo: string;
  readonly roleOwnerEn: string;
  readonly soloOwnerKo: string;
  readonly soloOwnerEn: string;
  readonly workspacePreset: StudioDefaultWorkspaceId;
  readonly accentOklch: string;
  readonly minutesPerCut: number;
  readonly checklistKo: readonly string[];
  readonly checklistEn: readonly string[];
}

export interface TooningSampleScenarioSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly genreId: TooningGenreId;
  readonly toneId: TooningToneId;
  readonly keywordKo: string;
  readonly keywordEn: string;
  readonly cutCount: 4 | 6 | 8;
  readonly castIds: readonly [TooningCharacterId, TooningCharacterId, TooningCharacterId];
}

export const TOONING_GENRES: readonly TooningGenreSpec[] = Object.freeze([
  {
    id: "rofan",
    labelKo: "로판",
    labelEn: "Romance Fantasy",
    taglineKo: "화려한 황실 무도회와 운명적 계약",
    taglineEn: "Imperial banquet drama and fated vows",
    defaultBackgroundId: "imperial-hall",
    defaultCastIds: ["seoyeon", "doyun", "yuna"],
    accentOklch: "oklch(0.67 0.19 16)",
  },
  {
    id: "school",
    labelKo: "학원",
    labelEn: "School Drama",
    taglineKo: "노을 진 옥상과 설레는 청춘 에피소드",
    taglineEn: "Sunset rooftop confessions and campus life",
    defaultBackgroundId: "school-rooftop",
    defaultCastIds: ["harin", "jiho", "bomi"],
    accentOklch: "oklch(0.67 0.17 242)",
  },
  {
    id: "action",
    labelKo: "액션",
    labelEn: "Action",
    taglineKo: "균열 속 검격과 폭발적인 각성 연출",
    taglineEn: "Rift battles and high-impact awakenings",
    defaultBackgroundId: "crystal-rift",
    defaultCastIds: ["taeo", "yuna", "doyun"],
    accentOklch: "oklch(0.69 0.2 38)",
  },
  {
    id: "daily",
    labelKo: "일상",
    labelEn: "Slice of Life",
    taglineKo: "공감 100% 카페·오피스 4컷 툰",
    taglineEn: "Relatable cafe and studio everyday moments",
    defaultBackgroundId: "cozy-cafe",
    defaultCastIds: ["bomi", "harin", "jiho"],
    accentOklch: "oklch(0.73 0.16 82)",
  },
  {
    id: "edu",
    labelKo: "교육웹툰",
    labelEn: "Educational",
    taglineKo: "핵심 개념을 4~8컷 이야기로 쉽게 전달",
    taglineEn: "Turn clear lessons into visual comic stories",
    defaultBackgroundId: "bright-classroom",
    defaultCastIds: ["mentor-min", "harin", "jiho"],
    accentOklch: "oklch(0.68 0.16 156)",
  },
]);

export const TOONING_TONES: readonly TooningToneSpec[] = Object.freeze([
  {
    id: "serious",
    labelKo: "진지",
    labelEn: "Serious",
    hintKo: "묵직한 감정선과 절제된 구도",
    hintEn: "Grounded pacing and weighty framing",
    defaultExpressionId: "focus",
    defaultBubbleStyle: "normal",
    defaultSfxId: "seureureuk",
    accentOklch: "oklch(0.64 0.13 255)",
  },
  {
    id: "comic",
    labelKo: "코믹",
    labelEn: "Comedic",
    hintKo: "경쾌한 반전과 과장된 리액션",
    hintEn: "Snappy punchlines and lively reactions",
    defaultExpressionId: "panic",
    defaultBubbleStyle: "shout",
    defaultSfxId: "ungseong",
    accentOklch: "oklch(0.74 0.17 75)",
  },
  {
    id: "tense",
    labelKo: "긴장",
    labelEn: "Tense",
    hintKo: "더치 앵글과 숨 막히는 대치",
    hintEn: "Dutch tilt framing and urgent beats",
    defaultExpressionId: "shock",
    defaultBubbleStyle: "shout",
    defaultSfxId: "kwang",
    accentOklch: "oklch(0.66 0.2 26)",
  },
  {
    id: "touching",
    labelKo: "감동",
    labelEn: "Heartwarming",
    hintKo: "따뜻한 시선과 여운 남는 클로즈업",
    hintEn: "Warm framing and gentle emotional beats",
    defaultExpressionId: "bright-smile",
    defaultBubbleStyle: "thought",
    defaultSfxId: "dugeun",
    accentOklch: "oklch(0.68 0.17 156)",
  },
]);

export const TOONING_CHARACTERS: readonly TooningCharacterSpec[] = Object.freeze([
  {
    id: "seoyeon",
    nameKo: "서연",
    nameEn: "Seoyeon",
    roleKo: "로판 영애",
    roleEn: "Noble Heroine",
    hairStyle: "wave",
    hasGlasses: false,
    hairOklch: "oklch(0.78 0.13 78)",
    outfitOklch: "oklch(0.63 0.19 14)",
    accentOklch: "oklch(0.84 0.14 85)",
    skinOklch: "oklch(0.91 0.04 65)",
    rigAssetKey: "cast_rofan_seoyeon_v1",
  },
  {
    id: "doyun",
    nameKo: "도윤",
    nameEn: "Doyun",
    roleKo: "북부 공작",
    roleEn: "Northern Duke",
    hairStyle: "parted",
    hasGlasses: false,
    hairOklch: "oklch(0.27 0.04 265)",
    outfitOklch: "oklch(0.36 0.11 258)",
    accentOklch: "oklch(0.78 0.12 85)",
    skinOklch: "oklch(0.89 0.04 64)",
    rigAssetKey: "cast_rofan_doyun_v1",
  },
  {
    id: "harin",
    nameKo: "하린",
    nameEn: "Harin",
    roleKo: "학생회장",
    roleEn: "Class Lead",
    hairStyle: "ponytail",
    hasGlasses: false,
    hairOklch: "oklch(0.38 0.09 36)",
    outfitOklch: "oklch(0.56 0.14 248)",
    accentOklch: "oklch(0.74 0.18 35)",
    skinOklch: "oklch(0.9 0.045 64)",
    rigAssetKey: "cast_school_harin_v1",
  },
  {
    id: "jiho",
    nameKo: "지호",
    nameEn: "Jiho",
    roleKo: "전학생",
    roleEn: "Transfer Student",
    hairStyle: "layered",
    hasGlasses: false,
    hairOklch: "oklch(0.3 0.03 240)",
    outfitOklch: "oklch(0.55 0.13 195)",
    accentOklch: "oklch(0.84 0.08 210)",
    skinOklch: "oklch(0.88 0.045 62)",
    rigAssetKey: "cast_school_jiho_v1",
  },
  {
    id: "taeo",
    nameKo: "태오",
    nameEn: "Taeo",
    roleKo: "헌터 검사",
    roleEn: "Blade Hunter",
    hairStyle: "spiky",
    hasGlasses: false,
    hairOklch: "oklch(0.24 0.03 260)",
    outfitOklch: "oklch(0.52 0.19 28)",
    accentOklch: "oklch(0.76 0.17 50)",
    skinOklch: "oklch(0.87 0.045 60)",
    rigAssetKey: "cast_action_taeo_v1",
  },
  {
    id: "yuna",
    nameKo: "유나",
    nameEn: "Yuna",
    roleKo: "전략가",
    roleEn: "Tactician",
    hairStyle: "bob",
    hasGlasses: false,
    hairOklch: "oklch(0.54 0.16 292)",
    outfitOklch: "oklch(0.45 0.14 278)",
    accentOklch: "oklch(0.78 0.14 166)",
    skinOklch: "oklch(0.91 0.035 66)",
    rigAssetKey: "cast_action_yuna_v1",
  },
  {
    id: "bomi",
    nameKo: "봄이",
    nameEn: "Bomi",
    roleKo: "디자이너",
    roleEn: "Designer",
    hairStyle: "bun",
    hasGlasses: false,
    hairOklch: "oklch(0.46 0.11 54)",
    outfitOklch: "oklch(0.72 0.16 68)",
    accentOklch: "oklch(0.65 0.18 35)",
    skinOklch: "oklch(0.9 0.042 65)",
    rigAssetKey: "cast_daily_bomi_v1",
  },
  {
    id: "mentor-min",
    nameKo: "민선생",
    nameEn: "Mentor Min",
    roleKo: "안내 멘토",
    roleEn: "Guide Mentor",
    hairStyle: "neat",
    hasGlasses: true,
    hairOklch: "oklch(0.32 0.04 230)",
    outfitOklch: "oklch(0.56 0.14 162)",
    accentOklch: "oklch(0.82 0.12 95)",
    skinOklch: "oklch(0.89 0.04 64)",
    rigAssetKey: "cast_edu_mentor_min_v1",
  },
]);

export const TOONING_POSES: readonly TooningPoseSpec[] = Object.freeze([
  { id: "walk", labelKo: "걷기", labelEn: "Walking", rigClipKey: "pose_walk_cycle_01", torsoTiltDeg: 4, leftArmDeg: -26, rightArmDeg: 28, legSpread: 16, bodyLiftY: 0, propKind: "none", suggestedSfxId: "seureureuk" },
  { id: "run", labelKo: "달리기", labelEn: "Running", rigClipKey: "pose_sprint_dash_02", torsoTiltDeg: 14, leftArmDeg: -58, rightArmDeg: 64, legSpread: 28, bodyLiftY: -6, propKind: "spark", suggestedSfxId: "seureureuk" },
  { id: "surprise", labelKo: "놀람", labelEn: "Startled", rigClipKey: "pose_recoil_shock_03", torsoTiltDeg: -10, leftArmDeg: -118, rightArmDeg: 118, legSpread: 18, bodyLiftY: -4, propKind: "spark", suggestedSfxId: "kwang" },
  { id: "point", labelKo: "손짓", labelEn: "Pointing", rigClipKey: "pose_point_forward_04", torsoTiltDeg: 5, leftArmDeg: -18, rightArmDeg: 95, legSpread: 12, bodyLiftY: 0, propKind: "none", suggestedSfxId: "beonjjeok" },
  { id: "draw-sword", labelKo: "검 뽑기", labelEn: "Drawing Blade", rigClipKey: "pose_blade_unsheathe_05", torsoTiltDeg: 11, leftArmDeg: -42, rightArmDeg: 126, legSpread: 26, bodyLiftY: -2, propKind: "sword", suggestedSfxId: "beonjjeok" },
  { id: "desk-sit", labelKo: "책상 앉기", labelEn: "At Desk", rigClipKey: "pose_seated_desk_06", torsoTiltDeg: 6, leftArmDeg: -38, rightArmDeg: 42, legSpread: 8, bodyLiftY: 14, propKind: "desk", suggestedSfxId: "ungseong" },
  { id: "crossed-arms", labelKo: "팔짱 끼기", labelEn: "Arms Crossed", rigClipKey: "pose_arms_folded_07", torsoTiltDeg: -2, leftArmDeg: 26, rightArmDeg: -26, legSpread: 10, bodyLiftY: 0, propKind: "none", suggestedSfxId: "seureureuk" },
  { id: "wave-hi", labelKo: "손 흔들기", labelEn: "Waving", rigClipKey: "pose_wave_greet_08", torsoTiltDeg: -4, leftArmDeg: -136, rightArmDeg: 24, legSpread: 12, bodyLiftY: 0, propKind: "none", suggestedSfxId: "banjjak" },
  { id: "kneel-plea", labelKo: "무릎 꿇기", labelEn: "Kneeling", rigClipKey: "pose_kneel_vow_09", torsoTiltDeg: 8, leftArmDeg: -34, rightArmDeg: 52, legSpread: 18, bodyLiftY: 18, propKind: "none", suggestedSfxId: "dugeun" },
  { id: "midair-leap", labelKo: "공중 도약", labelEn: "Mid-Air Leap", rigClipKey: "pose_air_leap_10", torsoTiltDeg: 16, leftArmDeg: -124, rightArmDeg: 132, legSpread: 32, bodyLiftY: -18, propKind: "spark", suggestedSfxId: "kwang" },
  { id: "lean-whisper", labelKo: "다가가 속삭임", labelEn: "Leaning In", rigClipKey: "pose_lean_whisper_11", torsoTiltDeg: 12, leftArmDeg: -24, rightArmDeg: 66, legSpread: 14, bodyLiftY: 2, propKind: "none", suggestedSfxId: "dugeun" },
  { id: "victory-cheer", labelKo: "만세 환호", labelEn: "Victory Cheer", rigClipKey: "pose_cheer_jump_12", torsoTiltDeg: -3, leftArmDeg: -148, rightArmDeg: 148, legSpread: 22, bodyLiftY: -10, propKind: "spark", suggestedSfxId: "banjjak" },
]);

export const TOONING_EXPRESSIONS: readonly TooningExpressionSpec[] = Object.freeze<readonly TooningExpressionSpec[]>([
  { id: "bright-smile", labelKo: "환한 미소", labelEn: "Bright Smile", browCurve: "happy", eyeShape: "smile", mouthShape: "grin", overlayFx: "sparkle", blendshapePreset: { smile: 0.92, browUp: 0.35, cheekBlush: 0.25 }, suggestedBubbleStyle: "normal" },
  { id: "shock", labelKo: "충격", labelEn: "Shocked", browCurve: "raised", eyeShape: "wide", mouthShape: "open-o", overlayFx: "sweat", blendshapePreset: { jawOpen: 0.85, eyeWide: 0.95, browUp: 0.9 }, suggestedBubbleStyle: "shout" },
  { id: "tears", labelKo: "눈물", labelEn: "Tearful", browCurve: "sad", eyeShape: "tear", mouthShape: "wobble", overlayFx: "tears", blendshapePreset: { browInnerUp: 0.88, tearGloss: 0.95, mouthFrown: 0.45 }, suggestedBubbleStyle: "thought" },
  { id: "anger", labelKo: "분노", labelEn: "Fierce Anger", browCurve: "angry", eyeShape: "sharp", mouthShape: "grit", overlayFx: "anger-vein", blendshapePreset: { browDown: 0.95, mouthSnarl: 0.78, eyeSquint: 0.6 }, suggestedBubbleStyle: "shout" },
  { id: "shy", labelKo: "수줍음", labelEn: "Shy Blush", browCurve: "happy", eyeShape: "shy", mouthShape: "small", overlayFx: "blush", blendshapePreset: { cheekBlush: 0.92, smile: 0.42, gazeSide: 0.5 }, suggestedBubbleStyle: "thought" },
  { id: "smirk", labelKo: "여유 미소", labelEn: "Confident Smirk", browCurve: "neutral", eyeShape: "sharp", mouthShape: "smirk", overlayFx: "none", blendshapePreset: { smirkRight: 0.82, eyeSquint: 0.35 }, suggestedBubbleStyle: "normal" },
  { id: "focus", labelKo: "진지 집중", labelEn: "Focused", browCurve: "neutral", eyeShape: "open", mouthShape: "line", overlayFx: "none", blendshapePreset: { browDown: 0.35, gazeLock: 0.9 }, suggestedBubbleStyle: "normal" },
  { id: "panic", labelKo: "당황", labelEn: "Panicked", browCurve: "raised", eyeShape: "wide", mouthShape: "wobble", overlayFx: "sweat", blendshapePreset: { browUp: 0.78, sweatDrop: 0.9, jawOpen: 0.45 }, suggestedBubbleStyle: "shout" },
  { id: "relief", labelKo: "안도", labelEn: "Relieved", browCurve: "happy", eyeShape: "smile", mouthShape: "small", overlayFx: "none", blendshapePreset: { smile: 0.55, browRelax: 0.85 }, suggestedBubbleStyle: "thought" },
  { id: "sparkle-awe", labelKo: "반짝 감탄", labelEn: "Starry Awe", browCurve: "raised", eyeShape: "star", mouthShape: "grin", overlayFx: "sparkle", blendshapePreset: { eyeStar: 1.0, smile: 0.8, browUp: 0.5 }, suggestedBubbleStyle: "normal" },
]);

export const TOONING_CAMERAS: readonly TooningCameraSpec[] = Object.freeze([
  { id: "full-wide", labelKo: "풀 샷 전경", labelEn: "Full Wide", zoom: 0.86, offsetY: 6, tiltDeg: 0, showSpeedlines: false, lensMm: 24, elevationDeg: 4, azimuthDeg: 0 },
  { id: "medium-bust", labelKo: "상반신 미디엄", labelEn: "Medium Bust", zoom: 1.06, offsetY: 16, tiltDeg: 0, showSpeedlines: false, lensMm: 35, elevationDeg: 0, azimuthDeg: 10 },
  { id: "close-up", labelKo: "감정 클로즈업", labelEn: "Close-Up", zoom: 1.38, offsetY: 34, tiltDeg: 0, showSpeedlines: false, lensMm: 50, elevationDeg: 2, azimuthDeg: 8 },
  { id: "extreme-eyes", labelKo: "눈빛 강조 컷", labelEn: "Extreme Eyes", zoom: 1.65, offsetY: 46, tiltDeg: -2, showSpeedlines: true, lensMm: 85, elevationDeg: 0, azimuthDeg: 0 },
  { id: "low-hero", labelKo: "로우 앵글", labelEn: "Low Angle", zoom: 1.12, offsetY: 8, tiltDeg: 0, showSpeedlines: true, lensMm: 28, elevationDeg: -22, azimuthDeg: -14 },
  { id: "high-overhead", labelKo: "하이 앵글", labelEn: "High Angle", zoom: 0.94, offsetY: -6, tiltDeg: 0, showSpeedlines: false, lensMm: 28, elevationDeg: 26, azimuthDeg: 14 },
  { id: "dutch-tilt", labelKo: "더치 앵글", labelEn: "Dutch Tilt", zoom: 1.16, offsetY: 14, tiltDeg: -9, showSpeedlines: true, lensMm: 35, elevationDeg: -8, azimuthDeg: 18 },
  { id: "over-shoulder", labelKo: "어깨너머 시선", labelEn: "Over Shoulder", zoom: 1.22, offsetY: 20, tiltDeg: 2, showSpeedlines: false, lensMm: 50, elevationDeg: 4, azimuthDeg: 32 },
]);

export const TOONING_BACKGROUNDS: readonly TooningBackgroundSpec[] = Object.freeze([
  {
    id: "imperial-hall",
    labelKo: "황실 대연회장",
    labelEn: "Imperial Hall",
    skyTopOklch: "oklch(0.32 0.08 16)",
    skyBottomOklch: "oklch(0.56 0.11 58)",
    groundOklch: "oklch(0.42 0.07 42)",
    accentOklch: "oklch(0.84 0.14 86)",
    scene3dTemplateKey: "bg3d_imperial_ballroom_gold",
    lightingMoodKo: "샹들리에 따뜻한 황금 역광",
    lightingMoodEn: "Warm golden chandelier rim light",
  },
  {
    id: "school-rooftop",
    labelKo: "노을 학교 옥상",
    labelEn: "School Rooftop",
    skyTopOklch: "oklch(0.52 0.15 248)",
    skyBottomOklch: "oklch(0.76 0.16 52)",
    groundOklch: "oklch(0.45 0.03 250)",
    accentOklch: "oklch(0.86 0.14 68)",
    scene3dTemplateKey: "bg3d_school_rooftop_sunset",
    lightingMoodKo: "방과 후 주황 노을 사광",
    lightingMoodEn: "After-school sunset warm side light",
  },
  {
    id: "city-night",
    labelKo: "네온 도심 야경",
    labelEn: "Neon City Night",
    skyTopOklch: "oklch(0.2 0.06 264)",
    skyBottomOklch: "oklch(0.34 0.11 232)",
    groundOklch: "oklch(0.24 0.03 260)",
    accentOklch: "oklch(0.78 0.16 196)",
    scene3dTemplateKey: "bg3d_seoul_rooftop_night",
    lightingMoodKo: "시안 간판 반사 야간 조명",
    lightingMoodEn: "Cool cyan storefront night bounce",
  },
  {
    id: "cozy-cafe",
    labelKo: "햇살 카페 창가",
    labelEn: "Sunlit Cafe",
    skyTopOklch: "oklch(0.86 0.05 84)",
    skyBottomOklch: "oklch(0.75 0.08 70)",
    groundOklch: "oklch(0.54 0.07 58)",
    accentOklch: "oklch(0.68 0.15 152)",
    scene3dTemplateKey: "bg3d_window_cafe_daylight",
    lightingMoodKo: "창가 자연 채광 소프트 톤",
    lightingMoodEn: "Soft daylight window fill",
  },
  {
    id: "crystal-rift",
    labelKo: "판타지 수정 균열",
    labelEn: "Crystal Rift",
    skyTopOklch: "oklch(0.22 0.11 286)",
    skyBottomOklch: "oklch(0.42 0.17 24)",
    groundOklch: "oklch(0.26 0.05 275)",
    accentOklch: "oklch(0.76 0.19 36)",
    scene3dTemplateKey: "bg3d_dungeon_crystal_rift",
    lightingMoodKo: "균열 마력 고대비 림라이트",
    lightingMoodEn: "High-contrast rift rim lighting",
  },
  {
    id: "bright-classroom",
    labelKo: "밝은 교실·강단",
    labelEn: "Bright Classroom",
    skyTopOklch: "oklch(0.92 0.03 215)",
    skyBottomOklch: "oklch(0.86 0.04 165)",
    groundOklch: "oklch(0.74 0.05 78)",
    accentOklch: "oklch(0.56 0.14 156)",
    scene3dTemplateKey: "bg3d_edu_classroom_board",
    lightingMoodKo: "균일한 실내 교육용 확산광",
    lightingMoodEn: "Even high-clarity indoor studio light",
  },
]);

export const TOONING_SFX_PRESETS: readonly TooningSfxSpec[] = Object.freeze([
  { id: "dugeun", textKo: "두근", textEn: "BA-DUMP", moodKo: "설렘·긴장", moodEn: "Heartbeat", fillOklch: "oklch(0.66 0.21 16)", strokeOklch: "oklch(0.98 0.01 85)", tiltDeg: -10 },
  { id: "kwang", textKo: "쾅!", textEn: "CRASH!", moodKo: "충격·폭발", moodEn: "Heavy Impact", fillOklch: "oklch(0.66 0.22 32)", strokeOklch: "oklch(0.18 0.02 60)", tiltDeg: -14 },
  { id: "beonjjeok", textKo: "번쩍", textEn: "FLASH!", moodKo: "각성·검격", moodEn: "Sudden Gleam", fillOklch: "oklch(0.82 0.18 86)", strokeOklch: "oklch(0.22 0.04 60)", tiltDeg: 12 },
  { id: "seureureuk", textKo: "스르륵", textEn: "WHOOSH", moodKo: "등장·전환", moodEn: "Swift Motion", fillOklch: "oklch(0.72 0.15 232)", strokeOklch: "oklch(0.98 0.01 85)", tiltDeg: -6 },
  { id: "ungseong", textKo: "웅성웅성", textEn: "MURMUR", moodKo: "소동·군중", moodEn: "Crowd Buzz", fillOklch: "oklch(0.68 0.16 296)", strokeOklch: "oklch(0.98 0.01 85)", tiltDeg: 6 },
  { id: "banjjak", textKo: "샤방—", textEn: "SPARKLE", moodKo: "환호·완성", moodEn: "Bright Shine", fillOklch: "oklch(0.75 0.17 152)", strokeOklch: "oklch(0.19 0.03 150)", tiltDeg: -8 },
]);

export const TOONING_BUBBLE_STYLES: readonly TooningBubbleStyleSpec[] = Object.freeze([
  { id: "normal", labelKo: "일반 말풍선", labelEn: "Speech" },
  { id: "shout", labelKo: "외침 말풍선", labelEn: "Shout" },
  { id: "thought", labelKo: "생각 구름", labelEn: "Thought" },
  { id: "narration", labelKo: "나레이션 박스", labelEn: "Narration" },
]);

export const TOONING_TEAM_STAGES: readonly TooningTeamStageSpec[] = Object.freeze([
  {
    id: "story",
    order: 1,
    labelKo: "스토리",
    labelEn: "Story",
    roleOwnerKo: "스토리 작가",
    roleOwnerEn: "Story Writer",
    soloOwnerKo: "1인 작가 · 1단계",
    soloOwnerEn: "Solo Creator · Stage 1",
    workspacePreset: "storyboard",
    accentOklch: "oklch(0.68 0.19 36)",
    minutesPerCut: 5,
    checklistKo: ["기승전결 컷별 핵심 대사 확정", "화자별 말투·감정 톤 통일"],
    checklistEn: ["Lock per-panel beat dialogue", "Verify consistent speaker voice"],
  },
  {
    id: "conti",
    order: 2,
    labelKo: "콘티",
    labelEn: "Storyboard",
    roleOwnerKo: "콘티 연출가",
    roleOwnerEn: "Storyboard Artist",
    soloOwnerKo: "1인 작가 · 2단계",
    soloOwnerEn: "Solo Creator · Stage 2",
    workspacePreset: "storyboard",
    accentOklch: "oklch(0.74 0.16 74)",
    minutesPerCut: 7,
    checklistKo: ["컷 간 시선 흐름 및 여백 호흡 점검", "말풍선 꼬리 방향과 화자 위치 확정"],
    checklistEn: ["Check scroll rhythm and eye flow", "Confirm bubble tail anchor sides"],
  },
  {
    id: "bg3d",
    order: 3,
    labelKo: "3D배경",
    labelEn: "3D Stage",
    roleOwnerKo: "3D 배경 담당",
    roleOwnerEn: "3D Stage Artist",
    soloOwnerKo: "1인 작가 · 3단계",
    soloOwnerEn: "Solo Creator · Stage 3",
    workspacePreset: "pose-3d",
    accentOklch: "oklch(0.66 0.16 236)",
    minutesPerCut: 8,
    checklistKo: ["컷별 카메라 화각·투시 각도 동기화", "배경 조명 무드와 인물 포즈 스냅샷 출력"],
    checklistEn: ["Sync per-panel camera lens and angle", "Render background lighting and pose pass"],
  },
  {
    id: "lineart",
    order: 4,
    labelKo: "선화",
    labelEn: "Line Art",
    roleOwnerKo: "선화 담당",
    roleOwnerEn: "Line Artist",
    soloOwnerKo: "1인 작가 · 4단계",
    soloOwnerEn: "Solo Creator · Stage 4",
    workspacePreset: "lineart",
    accentOklch: "oklch(0.64 0.16 286)",
    minutesPerCut: 12,
    checklistKo: ["3D 포즈 가이드 위 표정·머리카락 선화 정리", "실루엣 강약 및 클로즈업 눈매 보강"],
    checklistEn: ["Ink hair and expression over 3D pose guide", "Refine silhouette weights on close-ups"],
  },
  {
    id: "coloring",
    order: 5,
    labelKo: "채색",
    labelEn: "Coloring",
    roleOwnerKo: "채색 어시스턴트",
    roleOwnerEn: "Color Assistant",
    soloOwnerKo: "1인 작가 · 5단계",
    soloOwnerEn: "Solo Creator · Stage 5",
    workspacePreset: "coloring",
    accentOklch: "oklch(0.67 0.18 14)",
    minutesPerCut: 10,
    checklistKo: ["캐릭터 고유 팔레트 밑색 일괄 적용", "배경 광원 방향 기준 명암·림라이트 마무리"],
    checklistEn: ["Apply locked cast base color palettes", "Finish directional shadows and rim lights"],
  },
  {
    id: "lettering",
    order: 6,
    labelKo: "식자",
    labelEn: "Lettering",
    roleOwnerKo: "식자·편집 담당",
    roleOwnerEn: "Letterer & Editor",
    soloOwnerKo: "1인 작가 · 6단계",
    soloOwnerEn: "Solo Creator · Stage 6",
    workspacePreset: "lettering",
    accentOklch: "oklch(0.68 0.16 156)",
    minutesPerCut: 5,
    checklistKo: ["말풍선 줄바꿈 및 가독성 여백 최종 검수", "효과음 레이어 배치 후 연재 규격 내보내기"],
    checklistEn: ["Proof bubble line breaks and safe margins", "Place SFX overlays and export episode"],
  },
]);

export const TOONING_SAMPLE_SCENARIOS: readonly TooningSampleScenarioSpec[] = Object.freeze([
  {
    id: "sample-rofan",
    labelKo: "로판 · 계약 무도회",
    labelEn: "Rofan · Fated Ball",
    genreId: "rofan",
    toneId: "touching",
    keywordKo: "황실 비밀 계약서",
    keywordEn: "Imperial Secret Pact",
    cutCount: 4,
    castIds: ["seoyeon", "doyun", "yuna"],
  },
  {
    id: "sample-school",
    labelKo: "학원 · 옥상 비밀 노트",
    labelEn: "School · Rooftop Note",
    genreId: "school",
    toneId: "comic",
    keywordKo: "사라진 축제 큐시트",
    keywordEn: "Missing Festival Cue Sheet",
    cutCount: 4,
    castIds: ["harin", "jiho", "bomi"],
  },
  {
    id: "sample-action",
    labelKo: "액션 · 수정 균열 각성",
    labelEn: "Action · Rift Awakening",
    genreId: "action",
    toneId: "tense",
    keywordKo: "봉인된 청룡의 검",
    keywordEn: "Sealed Azure Blade",
    cutCount: 4,
    castIds: ["taeo", "yuna", "doyun"],
  },
  {
    id: "sample-daily",
    labelKo: "일상 · 마감 전 카페",
    labelEn: "Daily · Deadline Cafe",
    genreId: "daily",
    toneId: "comic",
    keywordKo: "아이스 아메리카노 원샷",
    keywordEn: "Iced Coffee Deadline Sprint",
    cutCount: 4,
    castIds: ["bomi", "harin", "jiho"],
  },
  {
    id: "sample-edu",
    labelKo: "교육 · 저작권 4컷 가이드",
    labelEn: "Edu · Copyright 4-Cut",
    genreId: "edu",
    toneId: "serious",
    keywordKo: "창작물 출처 표기 원칙",
    keywordEn: "Creator Attribution Basics",
    cutCount: 4,
    castIds: ["mentor-min", "harin", "jiho"],
  },
]);

export function getTooningGenre(id: TooningGenreId): TooningGenreSpec {
  return TOONING_GENRES.find((item) => item.id === id) ?? TOONING_GENRES[0];
}

export function getTooningTone(id: TooningToneId): TooningToneSpec {
  return TOONING_TONES.find((item) => item.id === id) ?? TOONING_TONES[0];
}

export function getTooningCharacter(id: TooningCharacterId): TooningCharacterSpec {
  return TOONING_CHARACTERS.find((item) => item.id === id) ?? TOONING_CHARACTERS[0];
}

export function getTooningPose(id: TooningPoseId): TooningPoseSpec {
  return TOONING_POSES.find((item) => item.id === id) ?? TOONING_POSES[0];
}

export function getTooningExpression(id: TooningExpressionId): TooningExpressionSpec {
  return TOONING_EXPRESSIONS.find((item) => item.id === id) ?? TOONING_EXPRESSIONS[0];
}

export function getTooningCamera(id: TooningCameraId): TooningCameraSpec {
  return TOONING_CAMERAS.find((item) => item.id === id) ?? TOONING_CAMERAS[0];
}

export function getTooningBackground(id: TooningBackgroundId): TooningBackgroundSpec {
  return TOONING_BACKGROUNDS.find((item) => item.id === id) ?? TOONING_BACKGROUNDS[0];
}

export function getTooningSfx(id: TooningSfxId): TooningSfxSpec {
  return TOONING_SFX_PRESETS.find((item) => item.id === id) ?? TOONING_SFX_PRESETS[0];
}
