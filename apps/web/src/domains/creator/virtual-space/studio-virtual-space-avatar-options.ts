import type { StudioDramaticVfxId } from "./studio-virtual-space-dramatic-vfx-catalog";
import type { StudioMasterSpritePersonaId } from "./studio-virtual-space-dynamic-sprite-catalog";
import type {
  StudioVirtualAvatarAccessory,
  StudioVirtualAvatarHairStyle,
  StudioVirtualAvatarOutfitStyle,
  StudioVirtualAvatarProfile,
} from "./studio-virtual-space-model";

/**
 * 아바타 꾸미기 옵션 카탈로그
 *
 * `studioVirtualAvatarProfile()`의 해시 기반 기본값과 호환되도록 기존 색상 값을
 * 그대로 유지하고, 뒤에 새 옵션을 추가한다. 기존 사용자의 기본 아바타가 바뀌지 않는다.
 */

/** 색상 옵션 (미리보기 스와치용). */
export interface StudioAvatarColorOption {
  readonly value: string;
  readonly labelKo: string;
  readonly labelEn: string;
}

/** 피부색 12종. 앞의 4개는 기존 해시 풀과 동일하다. */
export const STUDIO_AVATAR_SKIN_OPTIONS: readonly StudioAvatarColorOption[] = [
  { value: "oklch(0.91 0.055 55)", labelKo: "밝은 살구", labelEn: "Light peach" },
  { value: "oklch(0.86 0.07 48)", labelKo: "살구", labelEn: "Peach" },
  { value: "oklch(0.78 0.08 52)", labelKo: "따뜻한 베이지", labelEn: "Warm beige" },
  { value: "oklch(0.68 0.075 50)", labelKo: "브론즈", labelEn: "Bronze" },
  { value: "oklch(0.95 0.04 70)", labelKo: "포슬린", labelEn: "Porcelain" },
  { value: "oklch(0.82 0.09 35)", labelKo: "허니", labelEn: "Honey" },
  { value: "oklch(0.6 0.07 45)", labelKo: "딥 브론즈", labelEn: "Deep bronze" },
  { value: "oklch(0.52 0.065 40)", labelKo: "에스프레소", labelEn: "Espresso" },
  { value: "oklch(0.88 0.06 25)", labelKo: "로즈 베이지", labelEn: "Rose beige" },
  { value: "oklch(0.74 0.055 95)", labelKo: "올리브", labelEn: "Olive" },
  { value: "oklch(0.93 0.05 20)", labelKo: "핑크 포슬린", labelEn: "Pink porcelain" },
  { value: "oklch(0.58 0.08 35)", labelKo: "모카", labelEn: "Mocha" },
];

/** 헤어 색상 옵션 (하이라이트 포함). 앞의 6개는 기존 해시 풀과 동일하다. */
export interface StudioAvatarHairColorOption extends StudioAvatarColorOption {
  readonly highlight: string;
}

export const STUDIO_AVATAR_HAIR_COLOR_OPTIONS: readonly StudioAvatarHairColorOption[] = [
  { value: "oklch(0.31 0.055 25)", highlight: "oklch(0.56 0.12 25)", labelKo: "다크 브라운", labelEn: "Dark brown" },
  { value: "oklch(0.36 0.07 300)", highlight: "oklch(0.58 0.13 300)", labelKo: "미드나잇 퍼플", labelEn: "Midnight purple" },
  { value: "oklch(0.72 0.1 335)", highlight: "oklch(0.86 0.1 340)", labelKo: "핑크", labelEn: "Pink" },
  { value: "oklch(0.72 0.11 235)", highlight: "oklch(0.86 0.1 235)", labelKo: "스카이 블루", labelEn: "Sky blue" },
  { value: "oklch(0.77 0.12 95)", highlight: "oklch(0.9 0.11 95)", labelKo: "블론드", labelEn: "Blond" },
  { value: "oklch(0.58 0.12 155)", highlight: "oklch(0.77 0.12 155)", labelKo: "민트", labelEn: "Mint" },
  { value: "oklch(0.55 0.16 30)", highlight: "oklch(0.75 0.14 40)", labelKo: "레드", labelEn: "Red" },
  { value: "oklch(0.8 0.03 250)", highlight: "oklch(0.92 0.02 250)", labelKo: "실버", labelEn: "Silver" },
  { value: "oklch(0.68 0.1 295)", highlight: "oklch(0.84 0.09 300)", labelKo: "라벤더", labelEn: "Lavender" },
  { value: "oklch(0.78 0.11 55)", highlight: "oklch(0.88 0.1 65)", labelKo: "피치", labelEn: "Peach" },
  { value: "oklch(0.34 0.09 255)", highlight: "oklch(0.55 0.11 250)", labelKo: "딥 네이비", labelEn: "Deep navy" },
  { value: "oklch(0.62 0.02 260)", highlight: "oklch(0.8 0.015 255)", labelKo: "애쉬 그레이", labelEn: "Ash gray" },
  { value: "oklch(0.6 0.13 165)", highlight: "oklch(0.79 0.12 165)", labelKo: "에메랄드", labelEn: "Emerald" },
  { value: "oklch(0.66 0.13 70)", highlight: "oklch(0.83 0.11 75)", labelKo: "카라멜", labelEn: "Caramel" },
];

/** 의상 색상 12종. 앞의 6개는 기존 해시 풀과 동일하다. */
export const STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS: readonly StudioAvatarColorOption[] = [
  { value: "oklch(0.63 0.2 300)", labelKo: "바이올렛", labelEn: "Violet" },
  { value: "oklch(0.68 0.18 355)", labelKo: "로즈", labelEn: "Rose" },
  { value: "oklch(0.68 0.17 235)", labelKo: "코발트", labelEn: "Cobalt" },
  { value: "oklch(0.72 0.16 155)", labelKo: "포레스트", labelEn: "Forest" },
  { value: "oklch(0.76 0.17 85)", labelKo: "머스타드", labelEn: "Mustard" },
  { value: "oklch(0.6 0.16 20)", labelKo: "브릭", labelEn: "Brick" },
  { value: "oklch(0.45 0.1 255)", labelKo: "네이비", labelEn: "Navy" },
  { value: "oklch(0.8 0.06 75)", labelKo: "베이지", labelEn: "Beige" },
  { value: "oklch(0.62 0.09 110)", labelKo: "카키", labelEn: "Khaki" },
  { value: "oklch(0.74 0.09 295)", labelKo: "라벤더", labelEn: "Lavender" },
  { value: "oklch(0.58 0.13 190)", labelKo: "틸", labelEn: "Teal" },
  { value: "oklch(0.72 0.09 350)", labelKo: "더스티 핑크", labelEn: "Dusty pink" },
];

/** 포인트 색상 10종. 앞의 6개는 기존 해시 풀과 동일하다. */
export const STUDIO_AVATAR_ACCENT_OPTIONS: readonly StudioAvatarColorOption[] = [
  { value: "oklch(0.78 0.19 335)", labelKo: "핫핑크", labelEn: "Hot pink" },
  { value: "oklch(0.78 0.17 250)", labelKo: "페리윙클", labelEn: "Periwinkle" },
  { value: "oklch(0.82 0.17 145)", labelKo: "라임", labelEn: "Lime" },
  { value: "oklch(0.86 0.16 85)", labelKo: "레몬", labelEn: "Lemon" },
  { value: "oklch(0.72 0.18 25)", labelKo: "코럴", labelEn: "Coral" },
  { value: "oklch(0.72 0.18 295)", labelKo: "그레이프", labelEn: "Grape" },
  { value: "oklch(0.8 0.13 220)", labelKo: "스카이", labelEn: "Sky" },
  { value: "oklch(0.8 0.13 50)", labelKo: "피치", labelEn: "Peach" },
  { value: "oklch(0.76 0.14 190)", labelKo: "민트 소다", labelEn: "Mint soda" },
  { value: "oklch(0.7 0.16 310)", labelKo: "오키드", labelEn: "Orchid" },
];

/** 키 + 라벨 옵션. */
export interface StudioAvatarKeyOption<TKey extends string> {
  readonly key: TKey;
  readonly labelKo: string;
  readonly labelEn: string;
}

/** 헤어스타일 18종. 앞의 12종은 기존 순서 그대로다. */
export const STUDIO_AVATAR_HAIR_STYLE_OPTIONS: readonly StudioAvatarKeyOption<StudioVirtualAvatarHairStyle>[] = [
  { key: "bob", labelKo: "단발", labelEn: "Bob" },
  { key: "long", labelKo: "긴 머리", labelEn: "Long" },
  { key: "short", labelKo: "짧은 머리", labelEn: "Short" },
  { key: "twin", labelKo: "트윈테일", labelEn: "Twin tails" },
  { key: "wave", labelKo: "웨이브", labelEn: "Wavy" },
  { key: "crop", labelKo: "크롭", labelEn: "Crop" },
  { key: "ponytail", labelKo: "포니테일", labelEn: "Ponytail" },
  { key: "bun", labelKo: "번", labelEn: "Bun" },
  { key: "curly", labelKo: "곱슬", labelEn: "Curly" },
  { key: "braid", labelKo: "브레이드", labelEn: "Braid" },
  { key: "pigtails", labelKo: "양갈래", labelEn: "Pigtails" },
  { key: "mohawk", labelKo: "모히칸", labelEn: "Mohawk" },
  { key: "hime", labelKo: "히메컷", labelEn: "Hime" },
  { key: "side-part", labelKo: "가르마", labelEn: "Side part" },
  { key: "shaggy", labelKo: "샤기컷", labelEn: "Shaggy" },
  { key: "undercut", labelKo: "투블록", labelEn: "Undercut" },
  { key: "double-bun", labelKo: "양쪽 번", labelEn: "Double buns" },
  { key: "wolf", labelKo: "울프컷", labelEn: "Wolf cut" },
];

/** 의상 스타일 18종. 앞의 12종은 기존 순서 그대로다. */
export const STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS: readonly StudioAvatarKeyOption<StudioVirtualAvatarOutfitStyle>[] = [
  { key: "hoodie", labelKo: "후드티", labelEn: "Hoodie" },
  { key: "tee", labelKo: "티셔츠", labelEn: "T-shirt" },
  { key: "jacket", labelKo: "재킷", labelEn: "Jacket" },
  { key: "dress", labelKo: "드레스", labelEn: "Dress" },
  { key: "suit", labelKo: "수트", labelEn: "Suit" },
  { key: "sweater", labelKo: "스웨터", labelEn: "Sweater" },
  { key: "uniform", labelKo: "유니폼", labelEn: "Uniform" },
  { key: "apron", labelKo: "앞치마", labelEn: "Apron" },
  { key: "coat", labelKo: "코트", labelEn: "Coat" },
  { key: "sportswear", labelKo: "스포츠웨어", labelEn: "Sportswear" },
  { key: "cardigan", labelKo: "가디건", labelEn: "Cardigan" },
  { key: "overalls", labelKo: "멜빵바지", labelEn: "Overalls" },
  { key: "blazer", labelKo: "블레이저", labelEn: "Blazer" },
  { key: "turtleneck", labelKo: "터틀넥", labelEn: "Turtleneck" },
  { key: "denim", labelKo: "데님 재킷", labelEn: "Denim jacket" },
  { key: "polo", labelKo: "폴로 셔츠", labelEn: "Polo shirt" },
  { key: "hanbok", labelKo: "한복", labelEn: "Hanbok" },
  { key: "sailor", labelKo: "세일러복", labelEn: "Sailor uniform" },
];

/** 액세서리 16종. 앞의 10종은 기존 순서 그대로다. */
export const STUDIO_AVATAR_ACCESSORY_OPTIONS: readonly StudioAvatarKeyOption<StudioVirtualAvatarAccessory>[] = [
  { key: "none", labelKo: "없음", labelEn: "None" },
  { key: "beret", labelKo: "베레모", labelEn: "Beret" },
  { key: "bow", labelKo: "리본", labelEn: "Bow" },
  { key: "cat", labelKo: "고양이 귀", labelEn: "Cat ears" },
  { key: "headphones", labelKo: "헤드폰", labelEn: "Headphones" },
  { key: "leaf", labelKo: "잎사귀", labelEn: "Leaf" },
  { key: "star", labelKo: "별 핀", labelEn: "Star pin" },
  { key: "glasses", labelKo: "안경", labelEn: "Glasses" },
  { key: "cap", labelKo: "캡모자", labelEn: "Cap" },
  { key: "headband", labelKo: "헤어밴드", labelEn: "Headband" },
  { key: "sunglasses", labelKo: "선글라스", labelEn: "Sunglasses" },
  { key: "beanie", labelKo: "비니", labelEn: "Beanie" },
  { key: "backpack", labelKo: "백팩", labelEn: "Backpack" },
  { key: "tote", labelKo: "토트백", labelEn: "Tote bag" },
  { key: "scarf", labelKo: "목도리", labelEn: "Scarf" },
  { key: "flower", labelKo: "꽃핀", labelEn: "Flower pin" },
];

/** 표정 4종. */
export type StudioAvatarExpression = "bright" | "calm" | "sparkle" | "smile";

export const STUDIO_AVATAR_EXPRESSION_OPTIONS: readonly StudioAvatarKeyOption<StudioAvatarExpression>[] = [
  { key: "bright", labelKo: "밝음", labelEn: "Bright" },
  { key: "calm", labelKo: "차분", labelEn: "Calm" },
  { key: "sparkle", labelKo: "반짝", labelEn: "Sparkle" },
  { key: "smile", labelKo: "미소", labelEn: "Smile" },
];

export type StudioWebtoonAvatarGenreId =
  | "rofan"
  | "hunter-action"
  | "academy-romance"
  | "cyberpunk-3d"
  | "murim"
  | "studio-pro"
  | "cafe-companion";

export interface StudioWebtoonAvatarArchetypePreset {
  readonly id: string;
  readonly personaId: StudioMasterSpritePersonaId;
  readonly genreId: StudioWebtoonAvatarGenreId;
  readonly genreKo: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly taglineKo: string;
  readonly companionLabelKo?: string;
  readonly recommendedDramaticVfxId: StudioDramaticVfxId;
  readonly profile: StudioVirtualAvatarProfile;
}

function buildPresetProfile(input: {
  readonly skinIdx: number;
  readonly hairColorIdx: number;
  readonly outfitColorIdx: number;
  readonly accentIdx: number;
  readonly hairStyle: StudioVirtualAvatarHairStyle;
  readonly outfitStyle: StudioVirtualAvatarOutfitStyle;
  readonly accessory: StudioVirtualAvatarAccessory;
  readonly expression: StudioAvatarExpression;
}): StudioVirtualAvatarProfile {
  const skin = STUDIO_AVATAR_SKIN_OPTIONS[input.skinIdx] ?? STUDIO_AVATAR_SKIN_OPTIONS[0];
  const hair = STUDIO_AVATAR_HAIR_COLOR_OPTIONS[input.hairColorIdx] ?? STUDIO_AVATAR_HAIR_COLOR_OPTIONS[0];
  const outfit = STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS[input.outfitColorIdx] ?? STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS[0];
  const accent = STUDIO_AVATAR_ACCENT_OPTIONS[input.accentIdx] ?? STUDIO_AVATAR_ACCENT_OPTIONS[0];
  return Object.freeze({
    skin: skin.value,
    hair: hair.value,
    hairHighlight: hair.highlight,
    outfit: outfit.value,
    accent: accent.value,
    hairStyle: input.hairStyle,
    outfitStyle: input.outfitStyle,
    accessory: input.accessory,
    expression: input.expression,
  });
}

/** 한국 웹툰 대표 18종 캐릭터 아키타입 아바타 프리셋 (기존 저장 포맷 100% 호환). */
export const STUDIO_WEBTOON_AVATAR_ARCHETYPE_PRESETS: readonly StudioWebtoonAvatarArchetypePreset[] = Object.freeze([
  {
    id: "archetype-rofan-duchess",
    personaId: "rofan-duchess",
    genreId: "rofan",
    genreKo: "로판",
    labelKo: "로판 공녀 세라피나",
    labelEn: "Rofan Duchess Seraphina",
    taglineKo: "금발 롤웨이브와 장미빛 드레스, 우아한 꽃핀 장식",
    recommendedDramaticVfxId: "rofan-rose-petals",
    profile: buildPresetProfile({ skinIdx: 4, hairColorIdx: 4, outfitColorIdx: 1, accentIdx: 3, hairStyle: "wave", outfitStyle: "dress", accessory: "flower", expression: "sparkle" }),
  },
  {
    id: "archetype-rofan-crown-prince",
    personaId: "rofan-crown-prince",
    genreId: "rofan",
    genreKo: "로판",
    labelKo: "로판 황태자 카엘",
    labelEn: "Rofan Crown Prince Kael",
    taglineKo: "딥 네이비 흑발·제국 수트와 황금 포인트 카리스마",
    recommendedDramaticVfxId: "martial-fantasy-magic-circle",
    profile: buildPresetProfile({ skinIdx: 0, hairColorIdx: 10, outfitColorIdx: 6, accentIdx: 3, hairStyle: "side-part", outfitStyle: "suit", accessory: "star", expression: "calm" }),
  },
  {
    id: "archetype-modern-hunter",
    personaId: "modern-hunter-awakener",
    genreId: "hunter-action",
    genreKo: "현대 헌터",
    labelKo: "현대 헌터 각성자 성진",
    labelEn: "Modern Hunter Awakener",
    taglineKo: "투블록 다크 롱코트에 각성 네온 스카이 포인트",
    recommendedDramaticVfxId: "focus-flame-aura",
    profile: buildPresetProfile({ skinIdx: 1, hairColorIdx: 10, outfitColorIdx: 6, accentIdx: 6, hairStyle: "undercut", outfitStyle: "coat", accessory: "none", expression: "calm" }),
  },
  {
    id: "archetype-seoul-academy",
    personaId: "seoul-academy-student",
    genreId: "academy-romance",
    genreKo: "서울 학원물",
    labelKo: "서울 학원물 하린",
    labelEn: "Seoul Academy Harin",
    taglineKo: "히메컷·세일러 교복과 분홍 리본의 청춘 실루엣",
    recommendedDramaticVfxId: "entrance-spotlight-beam",
    profile: buildPresetProfile({ skinIdx: 10, hairColorIdx: 0, outfitColorIdx: 2, accentIdx: 0, hairStyle: "hime", outfitStyle: "sailor", accessory: "bow", expression: "bright" }),
  },
  {
    id: "archetype-cyberpunk-hacker",
    personaId: "cyberpunk-hacker",
    genreId: "cyberpunk-3d",
    genreKo: "사이버펑크",
    labelKo: "사이버펑크 해커 네오-K",
    labelEn: "Cyberpunk Hacker Neo-K",
    taglineKo: "라벤더 울프컷·테크 재킷과 네온 선글라스",
    companionLabelKo: "스캐너 드론 동행",
    recommendedDramaticVfxId: "cyber-holo-grid",
    profile: buildPresetProfile({ skinIdx: 1, hairColorIdx: 8, outfitColorIdx: 10, accentIdx: 8, hairStyle: "wolf", outfitStyle: "jacket", accessory: "sunglasses", expression: "sparkle" }),
  },
  {
    id: "archetype-murim-swordsman",
    personaId: "murim-swordsman",
    genreId: "murim",
    genreKo: "무협",
    labelKo: "무협 협객 청운",
    labelEn: "Murim Swordsman Cheongun",
    taglineKo: "비취빛 한복 도포와 묵직한 검객 포니테일",
    recommendedDramaticVfxId: "ink-calligraphy-slash",
    profile: buildPresetProfile({ skinIdx: 2, hairColorIdx: 10, outfitColorIdx: 10, accentIdx: 8, hairStyle: "ponytail", outfitStyle: "hanbok", accessory: "headband", expression: "calm" }),
  },
  {
    id: "archetype-atelier-barista",
    personaId: "atelier-barista",
    genreId: "cafe-companion",
    genreKo: "감성 카페",
    labelKo: "감성 카페 바리스타 모카",
    labelEn: "Atelier Barista Mocha",
    taglineKo: "카라멜 번 헤어·앞치마·베레모와 따뜻한 라떼 스팀",
    recommendedDramaticVfxId: "coffee-healing-steam",
    profile: buildPresetProfile({ skinIdx: 5, hairColorIdx: 13, outfitColorIdx: 5, accentIdx: 7, hairStyle: "bun", outfitStyle: "apron", accessory: "beret", expression: "smile" }),
  },
  {
    id: "archetype-star-pd",
    personaId: "chief-pd",
    genreId: "studio-pro",
    genreKo: "스튜디오 프로",
    labelKo: "스타 웹툰 PD 박슬기",
    labelEn: "Star Webtoon PD",
    taglineKo: "단정한 단발·포레스트 블레이저와 명쾌한 프로듀싱",
    recommendedDramaticVfxId: "highfive-shockwave",
    profile: buildPresetProfile({ skinIdx: 0, hairColorIdx: 0, outfitColorIdx: 3, accentIdx: 2, hairStyle: "bob", outfitStyle: "blazer", accessory: "glasses", expression: "smile" }),
  },
  {
    id: "archetype-art-director",
    personaId: "editorial-chief",
    genreId: "studio-pro",
    genreKo: "스튜디오 프로",
    labelKo: "AD 아트디렉터 정호",
    labelEn: "Art Director Jeongho",
    taglineKo: "애쉬 그레이 가르마·테일러드 수트와 날카로운 검수 안목",
    recommendedDramaticVfxId: "marble-starlight-ripple",
    profile: buildPresetProfile({ skinIdx: 2, hairColorIdx: 11, outfitColorIdx: 6, accentIdx: 1, hairStyle: "side-part", outfitStyle: "suit", accessory: "glasses", expression: "calm" }),
  },
  {
    id: "archetype-bg3d-artist",
    personaId: "cgi-director",
    genreId: "cyberpunk-3d",
    genreKo: "3D 배경",
    labelKo: "배경 3D 아티스트 윤진",
    labelEn: "3D Background Artist Yunjin",
    taglineKo: "스카이 블루 포니테일과 3D 공간 모델링 트렌치",
    companionLabelKo: "홀로 드론 동행",
    recommendedDramaticVfxId: "cyber-holo-grid",
    profile: buildPresetProfile({ skinIdx: 1, hairColorIdx: 3, outfitColorIdx: 2, accentIdx: 6, hairStyle: "ponytail", outfitStyle: "coat", accessory: "headphones", expression: "sparkle" }),
  },
  {
    id: "archetype-color-master",
    personaId: "colorist",
    genreId: "studio-pro",
    genreKo: "채색 마스터",
    labelKo: "채색 마스터 한미아",
    labelEn: "Color Master Mia",
    taglineKo: "핑크 트윈테일·아틀리에 앞치마와 프리즘 광원 감각",
    recommendedDramaticVfxId: "rofan-rose-petals",
    profile: buildPresetProfile({ skinIdx: 10, hairColorIdx: 2, outfitColorIdx: 11, accentIdx: 0, hairStyle: "twin", outfitStyle: "apron", accessory: "star", expression: "sparkle" }),
  },
  {
    id: "archetype-line-master",
    personaId: "line-artist",
    genreId: "studio-pro",
    genreKo: "수석 선화",
    labelKo: "수석 선화 장인 강하루",
    labelEn: "Lead Line Artist Haru",
    taglineKo: "샤기컷·크림슨 코트와 작가 시그니처 베레모",
    recommendedDramaticVfxId: "ink-calligraphy-slash",
    profile: buildPresetProfile({ skinIdx: 0, hairColorIdx: 0, outfitColorIdx: 1, accentIdx: 4, hairStyle: "shaggy", outfitStyle: "coat", accessory: "beret", expression: "bright" }),
  },
  {
    id: "archetype-cat-companion",
    personaId: "studio-cat-mascot",
    genreId: "cafe-companion",
    genreKo: "반려 마스코트",
    labelKo: "소피아 & 치즈냥 동행",
    labelEn: "Sophia & Cheese Cat",
    taglineKo: "치즈냥 마스코트와 고양이 귀·민트 가디건 힐링 조합",
    companionLabelKo: "치즈냥 동행",
    recommendedDramaticVfxId: "mascot-clover-blessing",
    profile: buildPresetProfile({ skinIdx: 4, hairColorIdx: 4, outfitColorIdx: 10, accentIdx: 8, hairStyle: "double-bun", outfitStyle: "cardigan", accessory: "cat", expression: "bright" }),
  },
  {
    id: "archetype-corgi-companion",
    personaId: "companion-corgi-director",
    genreId: "cafe-companion",
    genreKo: "반려 마스코트",
    labelKo: "해피 & 웰시코기 동행",
    labelEn: "Happy & Welsh Corgi",
    taglineKo: "웰시코기 단짝과 포근한 머스타드 스웨터·목도리",
    companionLabelKo: "웰시코기 동행",
    recommendedDramaticVfxId: "mascot-clover-blessing",
    profile: buildPresetProfile({ skinIdx: 5, hairColorIdx: 13, outfitColorIdx: 4, accentIdx: 3, hairStyle: "bob", outfitStyle: "sweater", accessory: "scarf", expression: "smile" }),
  },
  {
    id: "archetype-story-architect",
    personaId: "story-writer",
    genreId: "studio-pro",
    genreKo: "콘티 작가",
    labelKo: "콘티·세계관 작가 서이안",
    labelEn: "Storyboard Writer Ian",
    taglineKo: "브라운 웨이브·베이지 터틀넥과 끝없는 서사 영감",
    recommendedDramaticVfxId: "eureka-spark-aura",
    profile: buildPresetProfile({ skinIdx: 1, hairColorIdx: 0, outfitColorIdx: 7, accentIdx: 3, hairStyle: "wave", outfitStyle: "turtleneck", accessory: "tote", expression: "bright" }),
  },
  {
    id: "archetype-sound-letterer",
    personaId: "sound-letterer",
    genreId: "studio-pro",
    genreKo: "식자·사운드",
    labelKo: "사운드·식자 아티스트 유나",
    labelEn: "Sound & Lettering Yuna",
    taglineKo: "미드나잇 퍼플·스트리트 후드와 헤드폰 리듬 감각",
    recommendedDramaticVfxId: "rhythm-note-wave",
    profile: buildPresetProfile({ skinIdx: 8, hairColorIdx: 1, outfitColorIdx: 0, accentIdx: 5, hairStyle: "pigtails", outfitStyle: "hoodie", accessory: "headphones", expression: "sparkle" }),
  },
  {
    id: "archetype-action-mocap",
    personaId: "action-mocap-actor",
    genreId: "hunter-action",
    genreKo: "액션 모캡",
    labelKo: "액션 모캡 디렉터 레오",
    labelEn: "Action Mocap Leo",
    taglineKo: "레드 숏컷·스포츠웨어와 역동적 캡모자 액션 포즈",
    recommendedDramaticVfxId: "dash-speedlines",
    profile: buildPresetProfile({ skinIdx: 3, hairColorIdx: 6, outfitColorIdx: 5, accentIdx: 4, hairStyle: "crop", outfitStyle: "sportswear", accessory: "cap", expression: "bright" }),
  },
  {
    id: "archetype-bg-architect",
    personaId: "bg-architect",
    genreId: "cyberpunk-3d",
    genreKo: "건축 배경",
    labelKo: "배경 원화 디렉터 아마라",
    labelEn: "Background Architect Amara",
    taglineKo: "에메랄드 감성·데님 재킷과 자연 채광 건축 스케치",
    recommendedDramaticVfxId: "grass-petal-ripple",
    profile: buildPresetProfile({ skinIdx: 6, hairColorIdx: 12, outfitColorIdx: 8, accentIdx: 2, hairStyle: "braid", outfitStyle: "denim", accessory: "leaf", expression: "calm" }),
  },
]);

export function resolveStudioWebtoonAvatarPreset(
  idOrPersonaId: string,
): StudioWebtoonAvatarArchetypePreset | null {
  return (
    STUDIO_WEBTOON_AVATAR_ARCHETYPE_PRESETS.find(
      (preset) => preset.id === idOrPersonaId || preset.personaId === idOrPersonaId,
    ) ?? null
  );
}
