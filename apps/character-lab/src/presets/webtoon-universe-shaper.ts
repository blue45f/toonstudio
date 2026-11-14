/**
 * 웹툰 세계관 3D 셰이퍼(Shaper) 프리셋 & 연속 슬라이더·보간 커스터마이저 (`apps/character-lab/src/presets/webtoon-universe-shaper.ts`).
 *
 * - 16대 한국 웹툰 캐릭터 아키타입을 캐릭터 랩 v3 레시피(`CharacterRecipe`) 계약 위에 통합한다.
 * - 화풍 팩(`ArtStylePack`) + 코디 세트(`LookSet`) + 15개 슬롯 어휘 프리셋 + 얼굴 15축·체형 9축·파츠 형태 값·헤어 색 흐름·VARCO 3D 소품 바인딩을 하나로 묶는다.
 * - `applyShaperFineSlidersToRecipe`와 `blendWebtoonUniverseRecipes`로 3D 세이퍼 수준의 연속 슬라이더 조작과 실시간 블렌딩을 제공한다.
 */
import {
  BODY_PARAM_KEYS,
  FACE_PARAM_KEYS,
  PROPORTION_KEYS,
  characterRecipeSchema,
  clampParam,
  clampProportion,
  cloneLook,
  describeRecipeIssues,
  failVisible,
  mergeLook,
  normalizeParamValues,
} from "../contracts";

import { ART_STYLE_PACK_REVISION, artStylePack } from "./art-style-packs";
import { composeLookSetLook, lookSetById } from "./look-sets";
import {
  WEBTOON_SHAPER_COMPARE_POSE_OPTIONS,
  type WebtoonShaperComparePoseMode,
  type WebtoonUniverseShaperId,
} from "./shaper-quick-sculpt-presets";

import type {
  AccessoryAnchor,
  ArtStyleId,
  BodyParamKey,
  ChannelColors,
  CharacterRecipe,
  ExpressionWeights,
  FaceParamKey,
  HairColor,
  HandPosePair,
  LabFailure,
  PartParams,
  PartShapeValues,
  Pose,
  PresetCatalog,
  Proportion,
  RecipeSlots,
  RecipeSource,
  StyleFigure,
} from "../contracts";

export * from "./shaper-quick-sculpt-presets";

export interface Varco3dLabAccessoryBinding {
  readonly varcoAssetId: string;
  readonly labelKo: string;
  readonly anchor: AccessoryAnchor;
  readonly glbArtifactName: string;
}

export interface WebtoonUniverseShaperPreset {
  readonly id: WebtoonUniverseShaperId;
  readonly labelKo: string;
  readonly genreKo: string;
  readonly descriptionKo: string;
  readonly artStyleId: ArtStyleId;
  readonly figure: StyleFigure;
  readonly proportionOverride?: Proportion;
  readonly lookSetId: string;
  readonly slots: Partial<RecipeSlots>;
  readonly face: Readonly<Partial<Record<FaceParamKey, number>>>;
  readonly body: Readonly<Partial<Record<BodyParamKey, number>>>;
  readonly partParams: PartParams;
  readonly hairColor: HairColor;
  readonly expression: ExpressionWeights;
  readonly baseColors: Partial<ChannelColors>;
  readonly varcoBinding: Varco3dLabAccessoryBinding;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const WEBTOON_UNIVERSE_SHAPER_PRESETS: readonly WebtoonUniverseShaperPreset[] = deepFreeze<readonly WebtoonUniverseShaperPreset[]>([
  {
    id: "school-romance",
    labelKo: "학원 로맨스 주인공",
    genreKo: "학원·청춘 로맨스",
    descriptionKo: "부드러운 단발과 타탄 블레이저 교복, 따뜻한 아몬드 눈매의 학원 로맨스 주인공",
    artStyleId: "kr-webtoon-romance",
    figure: "feminine",
    lookSetId: "school-blazer-plaid",
    slots: {
      "face-shape": "face-shape/oval", eyes: "eyes/almond", irises: "irises/soft-gradient",
      nose: "nose/button", mouth: "mouth/smile-corner", ears: "ears/standard",
      hair: "hair/soft-bob", body: "body/slim", expression: "expression/smile",
      pose: "pose/hands-on-hips", "hand-pose": "hand-pose/peace",
    },
    face: { faceShape: -0.34, jawWidth: -0.46, chinLength: -0.16, cheekVolume: 0.16, eyeSize: 0.62, eyeSpacing: 0.06, eyeTilt: 0.12, noseHeight: 0.14, noseWidth: -0.36, mouthWidth: -0.26, lipFullness: 0.22 },
    body: { height: 0.14, headSize: -0.18, shoulderWidth: -0.26, waist: -0.36, legLength: 0.38, neckLength: 0.22 },
    partParams: { hair: { length: -0.2, volume: 0.25, curl: 0.15 }, bottom: { flare: 0.3 } },
    hairColor: { gradient: [0.55, 1], tipMix: 0.2, accent: "none" },
    expression: { mouthSmile: 0.2 },
    baseColors: { skin: "#fbe5d6", iris: "#7b5a44", hair: "#4a3226", brow: "#3b261c", "hair-tip": "#b88f6b" },
    varcoBinding: { varcoAssetId: "classroom-podium-desk", labelKo: "VARCO 학원물 교탁 & 출석부 소품", anchor: "hand-r", glbArtifactName: "classroom-podium-desk.glb" },
  },
  {
    id: "romance-fantasy-noble",
    labelKo: "로판 황실 귀족 영애",
    genreKo: "로맨스 판타지",
    descriptionKo: "반짝이는 별빛 홍채와 로맨스 장발, 황실 실크 로브와 루비 티아라 코디",
    artStyleId: "jp-shoujo-soft",
    figure: "feminine",
    lookSetId: "fantasy-mage-robe",
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/wide", irises: "irises/star-highlight",
      nose: "nose/high-bridge", mouth: "mouth/full", ears: "ears/standard",
      hair: "hair/romance-long", body: "body/slim", expression: "expression/smile",
      pose: "pose/idle", "hand-pose": "hand-pose/relaxed",
    },
    face: { faceShape: -0.4, jawWidth: -0.5, chinLength: -0.14, eyeSize: 0.74, eyeSpacing: 0.08, eyeTilt: 0.18, noseHeight: 0.24, noseWidth: -0.38, mouthWidth: -0.28, lipFullness: 0.3 },
    body: { height: 0.25, headSize: -0.2, shoulderWidth: -0.28, waist: -0.38, legLength: 0.42, neckLength: 0.25 },
    partParams: { hair: { length: 0.85, volume: 0.6, curl: 0.55 } },
    hairColor: { gradient: [0.45, 1], tipMix: 0.55, accent: "inner" },
    expression: { mouthSmile: 0.15 },
    baseColors: { skin: "#fff0e8", iris: "#4a5fa8", hair: "#f2dcb4", brow: "#b98a6a", "hair-tip": "#f2b8c6", "hair-accent": "#c9b8e8" },
    varcoBinding: { varcoAssetId: "shaper-rofan-tiara", labelKo: "VARCO 황녀 루비 티아라", anchor: "head-top", glbArtifactName: "shaper-rofan-tiara.glb" },
  },
  {
    id: "murim-swordsman",
    labelKo: "무협 문파 청옥 검객",
    genreKo: "무협·동양 액션",
    descriptionKo: "수묵풍 날카로운 눈매와 액션 포니테일, 전통풍 의복과 청옥 장검을 패용한 검객",
    artStyleId: "ink-wash",
    figure: "masculine",
    lookSetId: "traditional-jeogori",
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/narrow", irises: "irises/round-small",
      nose: "nose/straight", mouth: "mouth/thin", ears: "ears/standard",
      hair: "hair/action-pony", body: "body/athletic", expression: "expression/neutral",
      pose: "pose/point", "hand-pose": "hand-pose/fist",
    },
    face: { faceShape: -0.36, jawWidth: -0.2, eyeSize: -0.14, eyeTilt: 0.48, noseHeight: 0.4, noseWidth: -0.2, noseDepth: 0.25, mouthWidth: -0.1, lipFullness: -0.15 },
    body: { height: 0.45, headSize: -0.26, shoulderWidth: 0.42, chestDepth: 0.3, waist: -0.22, legLength: 0.38, neckLength: 0.18 },
    partParams: { hair: { length: 0.65, volume: 0.35 } },
    hairColor: { gradient: [0.6, 1], tipMix: 0, accent: "none" },
    expression: { browDown: 0.2 },
    baseColors: { skin: "#e6dfd2", iris: "#2b2b33", hair: "#1b1b1d", brow: "#1b1b1d" },
    varcoBinding: { varcoAssetId: "shaper-murim-jade-sword", labelKo: "VARCO 무협 청옥 검패 & 장검", anchor: "waist", glbArtifactName: "shaper-murim-jade-sword.glb" },
  },
  {
    id: "modern-noir-specialist",
    labelKo: "현대 느와르 전문가",
    genreKo: "현대·스릴러·오피스",
    descriptionKo: "9등신 장신 비율과 레이어드 숏컷, 차콜 핀스트라이프 수트를 입은 냉철한 전문가",
    artStyleId: "jp-seinen-real",
    figure: "masculine",
    lookSetId: "work-office-suit",
    slots: {
      "face-shape": "face-shape/square", eyes: "eyes/upturned", irises: "irises/round-small",
      nose: "nose/high-bridge", mouth: "mouth/thin", ears: "ears/standard",
      hair: "hair/short-layered", body: "body/tall", expression: "expression/neutral",
      pose: "pose/arms-crossed", "hand-pose": "hand-pose/relaxed",
    },
    face: { faceShape: -0.32, jawWidth: -0.16, chinLength: 0.12, cheekVolume: -0.22, eyeSize: -0.12, eyeTilt: 0.35, noseHeight: 0.45, noseWidth: -0.18 },
    body: { height: 0.6, headSize: -0.3, shoulderWidth: 0.4, chestDepth: 0.26, waist: -0.22, legLength: 0.45, neckLength: 0.2 },
    partParams: { hair: { length: -0.35, volume: 0.15 } },
    hairColor: { gradient: [0.6, 1], tipMix: 0, accent: "none" },
    expression: {},
    baseColors: { skin: "#ddb89a", iris: "#3b2e27", hair: "#1b1a1c", brow: "#1b1a1c" },
    varcoBinding: { varcoAssetId: "noir-neon-streetlamp", labelKo: "VARCO 느와르 주철 가로등 프롭", anchor: "hand-l", glbArtifactName: "noir-neon-streetlamp.glb" },
  },
  {
    id: "hunter-awakener",
    labelKo: "헌터 S급 각성자",
    genreKo: "헌터·판타지 액션",
    descriptionKo: "세로 고양이 동공과 울프컷, 강철 기사풍 전투복과 마나 건틀릿을 착용한 각성자",
    artStyleId: "kr-webtoon-action",
    figure: "masculine",
    lookSetId: "fantasy-knight",
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/upturned", irises: "irises/cat",
      nose: "nose/straight", mouth: "mouth/small", ears: "ears/pointed",
      hair: "hair/wolf-layered", body: "body/athletic", expression: "expression/angry",
      pose: "pose/run", "hand-pose": "hand-pose/fist",
    },
    face: { faceShape: -0.4, jawWidth: -0.24, eyeSize: 0.04, eyeTilt: 0.46, noseHeight: 0.36, noseWidth: -0.2, earAngle: 0.3 },
    body: { height: 0.55, headSize: -0.28, shoulderWidth: 0.5, chestDepth: 0.35, waist: -0.25, legLength: 0.44, neckLength: 0.2 },
    partParams: { hair: { length: 0.25, volume: 0.45 } },
    hairColor: { gradient: [0.5, 1], tipMix: 0.45, accent: "streak" },
    expression: { browDown: 0.25 },
    baseColors: { skin: "#e0b896", iris: "#3b82f6", hair: "#121216", brow: "#121216", "hair-tip": "#25406f", "hair-accent": "#60a5fa" },
    varcoBinding: { varcoAssetId: "shaper-hunter-mana-gauntlet", labelKo: "VARCO S급 마나 건틀릿", anchor: "wrist-r", glbArtifactName: "shaper-hunter-mana-gauntlet.glb" },
  },
  {
    id: "cyberpunk-runner",
    labelKo: "사이버펑크 네온 러너",
    genreKo: "SF·사이버펑크",
    descriptionKo: "히메컷 투톤 네온 헤어와 스트리트 레이어드 재킷, AR 홀로그램 바이저 러너",
    artStyleId: "jp-anime-cel",
    figure: "feminine",
    lookSetId: "casual-street-layered",
    slots: {
      "face-shape": "face-shape/heart", eyes: "eyes/upturned", irises: "irises/star-highlight",
      nose: "nose/small", mouth: "mouth/smile-corner", ears: "ears/standard",
      hair: "hair/hime-cut", body: "body/slim", expression: "expression/wink",
      pose: "pose/peace", "hand-pose": "hand-pose/rock",
    },
    face: { faceShape: -0.34, jawWidth: -0.44, chinLength: -0.14, eyeSize: 0.62, eyeSpacing: 0.08, eyeTilt: 0.35, noseWidth: -0.32, mouthWidth: -0.22, lipFullness: 0.18 },
    body: { height: 0.16, headSize: -0.18, shoulderWidth: -0.24, waist: -0.32, legLength: 0.38, neckLength: 0.2 },
    partParams: { hair: { length: 0.4, volume: 0.5 } },
    hairColor: { gradient: [0.4, 1], tipMix: 0.75, accent: "streak" },
    expression: { mouthSmile: 0.25 },
    baseColors: { skin: "#f8d6c2", iris: "#ec4899", hair: "#1e2430", brow: "#1e2430", "hair-tip": "#06b6d4", "hair-accent": "#ec4899" },
    varcoBinding: { varcoAssetId: "shaper-cyber-visor", labelKo: "VARCO 사이버펑크 네온 AR 바이저", anchor: "face", glbArtifactName: "shaper-cyber-visor.glb" },
  },
  {
    id: "medical-drama-surgeon",
    labelKo: "메디컬 드라마 전문의",
    genreKo: "메디컬·전문직 드라마",
    descriptionKo: "지적인 안경과 단정한 장발, 흰 가운과 셔츠 레이어드의 대학병원 전문의",
    artStyleId: "kr-webtoon-romance",
    figure: "feminine",
    lookSetId: "work-lab-coat",
    slots: {
      "face-shape": "face-shape/oval", eyes: "eyes/almond", irises: "irises/soft-gradient",
      nose: "nose/straight", mouth: "mouth/thin", ears: "ears/standard",
      hair: "hair/romance-long", body: "body/standard", expression: "expression/neutral",
      pose: "pose/idle", "hand-pose": "hand-pose/open",
    },
    face: { faceShape: -0.28, jawWidth: -0.36, chinLength: -0.08, eyeSize: 0.38, eyeTilt: 0.08, noseHeight: 0.3, noseWidth: -0.26, mouthWidth: -0.18 },
    body: { height: 0.22, headSize: -0.18, shoulderWidth: -0.2, waist: -0.26, legLength: 0.34, neckLength: 0.2 },
    partParams: { hair: { length: 0.55, volume: 0.2 } },
    hairColor: { gradient: [0.6, 1], tipMix: 0, accent: "none" },
    expression: { mouthSmile: 0.08 },
    baseColors: { skin: "#f3d3bd", iris: "#4a3226", hair: "#2b1d16", brow: "#2b1d16" },
    varcoBinding: { varcoAssetId: "medical-iv-monitor", labelKo: "VARCO 메디컬 바이탈 차트 소품", anchor: "hand-l", glbArtifactName: "medical-iv-monitor.glb" },
  },
  {
    id: "sd-daily-mascot",
    labelKo: "일상 개그 SD 마스코트",
    genreKo: "일상·개그·SD",
    descriptionKo: "3등신 귀여운 비례와 트윈테일, 테라코타 후드티와 반바지 차림의 SD 마스코트",
    artStyleId: "sd-chibi",
    figure: "feminine",
    lookSetId: "casual-hoodie-shorts",
    slots: {
      "face-shape": "face-shape/round", eyes: "eyes/round", irises: "irises/round-large",
      nose: "nose/small", mouth: "mouth/smile-corner", ears: "ears/small",
      hair: "hair/twin-tail", body: "body/petite", expression: "expression/joy",
      pose: "pose/wave", "hand-pose": "hand-pose/peace",
    },
    face: { faceShape: 0.65, jawWidth: 0.4, cheekVolume: 0.8, eyeSize: 0.9, eyeSpacing: 0.25, noseHeight: -0.5, lipFullness: 0.25 },
    body: { height: -0.8, headSize: 0.85, legLength: -0.65, armLength: -0.5, neckLength: -0.7 },
    partParams: { hair: { length: 0.35, volume: 0.75, curl: 0.4 } },
    hairColor: { gradient: [0.5, 1], tipMix: 0.35, accent: "none" },
    expression: { mouthSmile: 0.35 },
    baseColors: { skin: "#ffe8da", iris: "#a0663c", hair: "#ff9fb8", brow: "#a0663c", "hair-tip": "#ffe8da" },
    varcoBinding: { varcoAssetId: "cafe-espresso-bar", labelKo: "VARCO 카페 디저트 트레이 소품", anchor: "hand-r", glbArtifactName: "cafe-espresso-bar.glb" },
  },
  {
    id: "northern-grand-duke",
    labelKo: "로판 북부대공 냉미남",
    genreKo: "로맨스 판타지",
    descriptionKo: "8.5등신 장신 비율과 흑발 시스루 울프컷, 날카로운 V라인과 적안 삼백안의 북부대공",
    artStyleId: "kr-webtoon-romance",
    figure: "masculine",
    proportionOverride: { headsTall: 8.5, legRatio: 0.54, armRatio: 0.46, shoulderHeads: 2.35, headWidthRatio: 0.71, handScale: 1.04 },
    lookSetId: "fantasy-knight",
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/narrow", irises: "irises/round-small",
      nose: "nose/high-bridge", mouth: "mouth/thin", ears: "ears/standard",
      hair: "hair/wolf-layered", body: "body/tall", expression: "expression/neutral",
      pose: "pose/arms-crossed", "hand-pose": "hand-pose/relaxed",
    },
    face: { faceShape: -0.52, jawWidth: -0.38, chinLength: 0.12, cheekVolume: -0.26, eyeSize: -0.16, eyeTilt: 0.38, noseHeight: 0.46, noseWidth: -0.2, noseDepth: 0.32, lipFullness: -0.15 },
    body: { height: 0.62, headSize: -0.32, shoulderWidth: 0.52, chestDepth: 0.32, waist: -0.24, legLength: 0.48, neckLength: 0.22 },
    partParams: { hair: { length: 0.15, volume: 0.35 }, outer: { fit: 0.2 } },
    hairColor: { gradient: [0.55, 1], tipMix: 0.25, accent: "inner" },
    expression: { browDown: 0.22, eyeSquint: 0.12 },
    baseColors: { skin: "#f7e8e0", iris: "#b91c1c", hair: "#0f1117", brow: "#0f1117", "hair-tip": "#1e293b", "hair-accent": "#334155", outer: "#11131a", "outer-trim": "#d4af37" },
    varcoBinding: { varcoAssetId: "shaper-northern-duke-cape-brooch", labelKo: "VARCO 북부대공 루비 망토 브로치", anchor: "neck", glbArtifactName: "shaper-northern-duke-cape-brooch.glb" },
  },
  {
    id: "school-male-lead",
    labelKo: "학원 청춘 남주인공",
    genreKo: "학원·청춘 로맨스",
    descriptionKo: "8등신 모델형 비례와 다정한 강아지상 눈매, 단정한 교복 블레이저 코디의 남주인공",
    artStyleId: "kr-webtoon-romance",
    figure: "masculine",
    proportionOverride: { headsTall: 8, legRatio: 0.52, armRatio: 0.45, shoulderHeads: 2.08, headWidthRatio: 0.74, handScale: 1 },
    lookSetId: "school-blazer-slacks",
    slots: {
      "face-shape": "face-shape/oval", eyes: "eyes/droopy", irises: "irises/soft-gradient",
      nose: "nose/straight", mouth: "mouth/smile-corner", ears: "ears/standard",
      hair: "hair/short-layered", body: "body/tall", expression: "expression/smile",
      pose: "pose/idle", "hand-pose": "hand-pose/open",
    },
    face: { faceShape: -0.28, jawWidth: -0.26, cheekVolume: 0.06, eyeSize: 0.28, eyeTilt: -0.22, noseHeight: 0.3, noseWidth: -0.2, mouthWidth: -0.1, lipFullness: 0.12 },
    body: { height: 0.44, headSize: -0.26, shoulderWidth: 0.36, chestDepth: 0.2, waist: -0.2, legLength: 0.4, neckLength: 0.2 },
    partParams: { hair: { bangs: 0.25, volume: 0.28 } },
    hairColor: { gradient: [0.6, 1], tipMix: 0.18, accent: "none" },
    expression: { mouthSmile: 0.24, browInnerUp: 0.08 },
    baseColors: { skin: "#f9e3d2", iris: "#5c4033", hair: "#2c221e", brow: "#2c221e", "hair-tip": "#5a4236" },
    varcoBinding: { varcoAssetId: "shaper-school-headphones", labelKo: "VARCO 학원 남주 무선 헤드셋", anchor: "neck", glbArtifactName: "shaper-school-headphones.glb" },
  },
  {
    id: "kpop-idol-center",
    labelKo: "K-POP 아이돌 센터",
    genreKo: "연예계·아이돌",
    descriptionKo: "7.8등신 무대 비례와 투톤 시크릿 옴브레 트윈테일, 별빛 하이라이트 홍채의 아이돌 센터",
    artStyleId: "jp-shoujo-soft",
    figure: "feminine",
    proportionOverride: { headsTall: 7.8, legRatio: 0.53, armRatio: 0.44, shoulderHeads: 1.72, headWidthRatio: 0.74, handScale: 0.96 },
    lookSetId: "school-sailor-navy",
    slots: {
      "face-shape": "face-shape/heart", eyes: "eyes/wide", irises: "irises/star-highlight",
      nose: "nose/button", mouth: "mouth/smile-corner", ears: "ears/small",
      hair: "hair/twin-tail", body: "body/slim", expression: "expression/wink",
      pose: "pose/peace", "hand-pose": "hand-pose/peace",
    },
    face: { faceShape: -0.36, jawWidth: -0.48, chinLength: -0.16, cheekVolume: 0.18, eyeSize: 0.72, eyeSpacing: 0.08, eyeTilt: 0.2, noseHeight: 0.18, noseWidth: -0.38, mouthWidth: -0.28, lipFullness: 0.28 },
    body: { height: 0.22, headSize: -0.18, shoulderWidth: -0.28, waist: -0.38, legLength: 0.42, neckLength: 0.22 },
    partParams: { hair: { length: 0.78, volume: 0.65, curl: 0.45 }, bottom: { flare: 0.4 } },
    hairColor: { gradient: [0.46, 1], tipMix: 0.62, accent: "inner" },
    expression: { mouthSmile: 0.32, eyeWide: 0.12 },
    baseColors: { skin: "#fff1ea", iris: "#a855f7", hair: "#fdf2f8", brow: "#d8b4c8", "hair-tip": "#93c5fd", "hair-accent": "#f472b6" },
    varcoBinding: { varcoAssetId: "shaper-idol-handmic", labelKo: "VARCO 아이돌 센터 크리스탈 핸드마이크", anchor: "hand-r", glbArtifactName: "shaper-idol-handmic.glb" },
  },
  {
    id: "archmage-tower-master",
    labelKo: "마탑주 대마법사",
    genreKo: "판타지·회귀물",
    descriptionKo: "8등신 신비형 비례와 은발 보랏빛 그라데이션 장발, 금빛 별빛 홍채와 성좌 로브",
    artStyleId: "jp-anime-cel",
    figure: "masculine",
    proportionOverride: { headsTall: 8, legRatio: 0.52, armRatio: 0.45, shoulderHeads: 2.02, headWidthRatio: 0.74, handScale: 1 },
    lookSetId: "fantasy-mage-robe",
    slots: {
      "face-shape": "face-shape/long", eyes: "eyes/almond", irises: "irises/star-highlight",
      nose: "nose/high-bridge", mouth: "mouth/smile-corner", ears: "ears/pointed",
      hair: "hair/romance-long", body: "body/slim", expression: "expression/smile",
      pose: "pose/point", "hand-pose": "hand-pose/open",
    },
    face: { faceShape: -0.36, jawWidth: -0.32, chinLength: 0.06, eyeSize: 0.32, eyeTilt: 0.14, noseHeight: 0.36, noseWidth: -0.22, earAngle: 0.28 },
    body: { height: 0.4, headSize: -0.24, shoulderWidth: 0.24, waist: -0.24, legLength: 0.38, neckLength: 0.22 },
    partParams: { hair: { length: 0.82, volume: 0.42 } },
    hairColor: { gradient: [0.44, 1], tipMix: 0.58, accent: "inner" },
    expression: { mouthSmile: 0.16, browOuterUp: 0.12 },
    baseColors: { skin: "#fcf4ef", iris: "#f59e0b", hair: "#e2e8f0", brow: "#94a3b8", "hair-tip": "#818cf8", "hair-accent": "#c084fc" },
    varcoBinding: { varcoAssetId: "shaper-archmage-grimoire", labelKo: "VARCO 마탑주 성좌 마도서", anchor: "hand-l", glbArtifactName: "shaper-archmage-grimoire.glb" },
  },
  {
    id: "shadow-assassin-hunter",
    labelKo: "S급 그림자 암살자",
    genreKo: "헌터·판타지 액션",
    descriptionKo: "8.2등신 슬림 근육형 비례와 비대칭 숏단발, 날렵한 고양이 눈매의 그림자 암살자",
    artStyleId: "kr-webtoon-action",
    figure: "feminine",
    proportionOverride: { headsTall: 8.2, legRatio: 0.54, armRatio: 0.45, shoulderHeads: 1.9, headWidthRatio: 0.72, handScale: 0.98 },
    lookSetId: "casual-street-layered",
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/upturned", irises: "irises/cat",
      nose: "nose/high-bridge", mouth: "mouth/thin", ears: "ears/standard",
      hair: "hair/soft-bob", body: "body/athletic", expression: "expression/neutral",
      pose: "pose/run", "hand-pose": "hand-pose/fist",
    },
    face: { faceShape: -0.44, jawWidth: -0.42, chinLength: -0.1, eyeSize: 0.36, eyeTilt: 0.5, noseHeight: 0.34, noseWidth: -0.28, noseDepth: 0.24, mouthWidth: -0.18, lipFullness: -0.05 },
    body: { height: 0.38, headSize: -0.22, shoulderWidth: -0.14, waist: -0.34, hip: 0.16, legLength: 0.44, neckLength: 0.2 },
    partParams: { hair: { length: -0.25, bangs: 0.35, volume: 0.18 } },
    hairColor: { gradient: [0.48, 1], tipMix: 0.5, accent: "streak" },
    expression: { browDown: 0.18, eyeSquint: 0.15 },
    baseColors: { skin: "#f1dcd0", iris: "#10b981", hair: "#111827", brow: "#111827", "hair-tip": "#4f46e5", "hair-accent": "#2dd4bf" },
    varcoBinding: { varcoAssetId: "shaper-shadow-twin-dagger", labelKo: "VARCO 그림자 마석 단검", anchor: "hand-r", glbArtifactName: "shaper-shadow-twin-dagger.glb" },
  },
  {
    id: "joseon-crown-prince",
    labelKo: "조선 왕실 세자",
    genreKo: "궁중·전통 사극",
    descriptionKo: "7.8등신 단아한 한복 비례와 흑단 하이포니테일, 기품 있는 눈매의 왕실 세자",
    artStyleId: "ink-wash",
    figure: "masculine",
    proportionOverride: { headsTall: 7.8, legRatio: 0.5, armRatio: 0.44, shoulderHeads: 2.02, headWidthRatio: 0.75, handScale: 1 },
    lookSetId: "traditional-jeogori",
    slots: {
      "face-shape": "face-shape/oval", eyes: "eyes/almond", irises: "irises/soft-gradient",
      nose: "nose/straight", mouth: "mouth/small", ears: "ears/standard",
      hair: "hair/action-pony", body: "body/standard", expression: "expression/smile",
      pose: "pose/idle", "hand-pose": "hand-pose/relaxed",
    },
    face: { faceShape: -0.28, jawWidth: -0.22, eyeSize: 0.14, eyeTilt: 0.16, noseHeight: 0.34, noseWidth: -0.18, noseDepth: 0.2, mouthWidth: -0.1, lipFullness: 0.08 },
    body: { height: 0.36, headSize: -0.22, shoulderWidth: 0.28, chestDepth: 0.16, waist: -0.18, legLength: 0.34, neckLength: 0.18 },
    partParams: { hair: { length: 0.55, volume: 0.22 } },
    hairColor: { gradient: [0.65, 1], tipMix: 0, accent: "none" },
    expression: { mouthSmile: 0.12 },
    baseColors: { skin: "#f5e4d4", iris: "#29201b", hair: "#141316", brow: "#141316", top: "#1e3a5f", "top-trim": "#d4af37", bottom: "#f3e9d8" },
    varcoBinding: { varcoAssetId: "shaper-joseon-folding-fan", labelKo: "VARCO 왕실 백접선 부채", anchor: "hand-r", glbArtifactName: "shaper-joseon-folding-fan.glb" },
  },
  {
    id: "sports-high-ace",
    labelKo: "열혈 스포츠 에이스",
    genreKo: "스포츠·청춘 드라마",
    descriptionKo: "8등신 탄탄한 피지컬과 생동감 있는 미소, 애슬레틱 트레이닝 핏의 고교 에이스",
    artStyleId: "jp-shounen-ink",
    figure: "masculine",
    proportionOverride: { headsTall: 8, legRatio: 0.53, armRatio: 0.46, shoulderHeads: 2.22, headWidthRatio: 0.74, handScale: 1.04 },
    lookSetId: "sport-track",
    slots: {
      "face-shape": "face-shape/square", eyes: "eyes/wide", irises: "irises/round-large",
      nose: "nose/straight", mouth: "mouth/wide", ears: "ears/standard",
      hair: "hair/short-layered", body: "body/athletic", expression: "expression/laugh",
      pose: "pose/wave", "hand-pose": "hand-pose/thumbs-up",
    },
    face: { faceShape: -0.18, jawWidth: -0.08, eyeSize: 0.36, eyeTilt: 0.22, noseHeight: 0.24, noseWidth: -0.14, mouthWidth: 0.18 },
    body: { height: 0.46, headSize: -0.26, shoulderWidth: 0.44, chestDepth: 0.34, waist: -0.2, legLength: 0.4, neckLength: 0.16 },
    partParams: { hair: { length: -0.3, volume: 0.32 } },
    hairColor: { gradient: [0.55, 1], tipMix: 0.3, accent: "streak" },
    expression: { mouthSmile: 0.42, jawOpen: 0.15 },
    baseColors: { skin: "#e8be9e", iris: "#d97706", hair: "#ea580c", brow: "#9a3412", "hair-tip": "#fbbf24", "hair-accent": "#fef08a" },
    varcoBinding: { varcoAssetId: "shaper-sports-ace-band", labelKo: "VARCO 에이스 캡틴 스포츠 테이핑", anchor: "wrist-l", glbArtifactName: "shaper-sports-ace-band.glb" },
  },
  {
    id: "villainess-empress",
    labelKo: "로판 흑막 황후",
    genreKo: "로맨스 판타지",
    descriptionKo: "8등신 글래머 실루엣과 히메컷, 루비 적안과 도도한 냉소 표정의 흑막 황후",
    artStyleId: "kr-webtoon-romance",
    figure: "feminine",
    proportionOverride: { headsTall: 8, legRatio: 0.53, armRatio: 0.44, shoulderHeads: 1.82, headWidthRatio: 0.73, handScale: 0.98 },
    lookSetId: "work-office-skirt",
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/upturned", irises: "irises/cat",
      nose: "nose/high-bridge", mouth: "mouth/full", ears: "ears/standard",
      hair: "hair/hime-cut", body: "body/curvy", expression: "expression/pout",
      pose: "pose/hands-on-hips", "hand-pose": "hand-pose/point",
    },
    face: { faceShape: -0.44, jawWidth: -0.46, chinLength: -0.1, eyeSize: 0.54, eyeSpacing: 0.06, eyeTilt: 0.48, noseHeight: 0.34, noseWidth: -0.32, noseDepth: 0.24, mouthWidth: -0.2, lipFullness: 0.36 },
    body: { height: 0.32, headSize: -0.2, shoulderWidth: -0.18, chestDepth: 0.28, waist: -0.4, hip: 0.32, legLength: 0.42, neckLength: 0.24 },
    partParams: { hair: { length: 0.72, bangs: 0.4, volume: 0.48 } },
    hairColor: { gradient: [0.45, 1], tipMix: 0.52, accent: "inner" },
    expression: { mouthSmile: 0.18, browOuterUp: 0.22, eyeSquint: 0.14 },
    baseColors: { skin: "#fff3ee", iris: "#dc2626", hair: "#18121e", brow: "#18121e", "hair-tip": "#7f1d1d", "hair-accent": "#be123c", outer: "#450a0a", bottom: "#2a0808", accessory: "#fbbf24" },
    varcoBinding: { varcoAssetId: "shaper-empress-ruby-goblet", labelKo: "VARCO 황후 루비 성배 & 레이스 부채", anchor: "hand-l", glbArtifactName: "shaper-empress-ruby-goblet.glb" },
  },
]);

const PRESET_MAP: ReadonlyMap<WebtoonUniverseShaperId, WebtoonUniverseShaperPreset> = new Map(
  WEBTOON_UNIVERSE_SHAPER_PRESETS.map((p) => [p.id, p]),
);

export function webtoonUniverseShaperPreset(
  id: WebtoonUniverseShaperId,
): WebtoonUniverseShaperPreset {
  return PRESET_MAP.get(id) ?? WEBTOON_UNIVERSE_SHAPER_PRESETS[0]!;
}

function cleanPartParams(raw: PartParams): PartParams {
  const result: PartParams = {};
  for (const [scopeKey, shapeMap] of Object.entries(raw)) {
    if (!shapeMap) continue;
    const cleanedShapes: Record<string, number> = {};
    for (const [shapeName, weight] of Object.entries(shapeMap)) {
      const clamped = clampParam(weight);
      if (clamped !== 0) cleanedShapes[shapeName] = Number(clamped.toFixed(4));
    }
    if (Object.keys(cleanedShapes).length > 0) {
      result[scopeKey as keyof PartParams] = cleanedShapes as PartShapeValues;
    }
  }
  return result;
}

export interface ComposeWebtoonUniverseOptions {
  readonly catalog?: PresetCatalog;
  readonly poseMode?: WebtoonShaperComparePoseMode;
}

export type ComposeWebtoonUniverseRecipeResult =
  | { readonly ok: true; readonly recipe: CharacterRecipe; readonly preset: WebtoonUniverseShaperPreset }
  | { readonly ok: false; readonly failure: LabFailure };

export function composeWebtoonUniverseRecipe(
  presetId: WebtoonUniverseShaperId,
  baseRecipe: CharacterRecipe,
  now?: number,
  options?: ComposeWebtoonUniverseOptions,
): ComposeWebtoonUniverseRecipeResult {
  const preset = webtoonUniverseShaperPreset(presetId);
  const stylePack = artStylePack(preset.artStyleId);
  const lookSet = lookSetById(preset.lookSetId);
  if (!lookSet) {
    return {
      ok: false,
      failure: failVisible(
        "webtoon-universe-lookset-missing",
        `세계관 프리셋 "${preset.labelKo}"의 코디 세트(${preset.lookSetId})를 찾을 수 없습니다.`,
        undefined,
        now,
      ),
    };
  }

  const nextSource: RecipeSource =
    baseRecipe.source.kind === "kit"
      ? { ...baseRecipe.source, baseId: preset.figure === "masculine" ? "male" : "female" }
      : baseRecipe.source;
  const sourceAlignedBase: CharacterRecipe = nextSource === baseRecipe.source ? baseRecipe : { ...baseRecipe, source: nextSource };

  const composedLook = composeLookSetLook(lookSet, sourceAlignedBase, now);
  if (!composedLook.ok) return composedLook;

  const lookPayload = composedLook.look.payload;
  const mergedColors: ChannelColors = {
    ...sourceAlignedBase.colors,
    ...(lookPayload.colors ?? {}),
    ...preset.baseColors,
  };

  const targetProportion: Proportion = preset.proportionOverride
    ? structuredClone(preset.proportionOverride)
    : structuredClone(stylePack.proportion[preset.figure]);

  const poseOption = WEBTOON_SHAPER_COMPARE_POSE_OPTIONS.find((item) => item.mode === (options?.poseMode ?? "preset"));
  const mergedSlots: RecipeSlots = {
    ...sourceAlignedBase.slots,
    ...preset.slots,
    ...(lookPayload.slots ?? {}),
    ...(poseOption?.poseSlotId ? { pose: poseOption.poseSlotId } : {}),
    ...(poseOption?.handPoseSlotId ? { "hand-pose": poseOption.handPoseSlotId } : {}),
  };

  let resolvedPose: Pose = sourceAlignedBase.pose;
  let resolvedHandPose: HandPosePair = sourceAlignedBase.handPose;
  if (options?.catalog) {
    const poseEntry = mergedSlots.pose ? options.catalog.get(mergedSlots.pose) : undefined;
    if (poseEntry?.patch.pose) {
      resolvedPose = structuredClone(poseEntry.patch.pose);
    }
    const handEntry = mergedSlots["hand-pose"] ? options.catalog.get(mergedSlots["hand-pose"]) : undefined;
    if (handEntry?.patch.handPose) {
      resolvedHandPose = {
        left: structuredClone(handEntry.patch.handPose.left),
        right: structuredClone(handEntry.patch.handPose.right),
      };
    }
  }

  const candidate: CharacterRecipe = {
    ...sourceAlignedBase,
    slots: mergedSlots,
    pose: resolvedPose,
    handPose: resolvedHandPose,
    face: normalizeParamValues(preset.face),
    body: normalizeParamValues(preset.body),
    colors: mergedColors,
    expression: {},
    wardrobe: lookPayload.wardrobe ? structuredClone(lookPayload.wardrobe) : structuredClone(sourceAlignedBase.wardrobe),
    partParams: cleanPartParams(preset.partParams),
    surfaces: lookPayload.surfaces ? structuredClone(lookPayload.surfaces) : structuredClone(sourceAlignedBase.surfaces),
    hairColor: structuredClone(preset.hairColor),
    style: {
      packId: stylePack.id,
      packRevision: ART_STYLE_PACK_REVISION,
      proportion: targetProportion,
      neutralFacs: { ...preset.expression },
    },
    shading: {
      ...sourceAlignedBase.shading,
      mode: "toon",
      toon: {
        ...sourceAlignedBase.shading.toon,
        rampSteps: stylePack.toon.rampSteps,
        rim: stylePack.toon.rim,
        outline: stylePack.toon.outline,
      },
      look: cloneLook(stylePack.look),
    },
  };

  const checked = characterRecipeSchema.safeParse(candidate);
  if (!checked.success) {
    return {
      ok: false,
      failure: failVisible(
        "webtoon-universe-recipe-invalid",
        `세계관 프리셋 "${preset.labelKo}" 레시피 생성에 실패했습니다: ${describeRecipeIssues(checked.error.issues)}`,
        undefined,
        now,
      ),
    };
  }
  return { ok: true, recipe: checked.data, preset };
}

export interface ShaperFineSliderPatch {
  readonly face?: Readonly<Partial<Record<FaceParamKey, number>>>;
  readonly body?: Readonly<Partial<Record<BodyParamKey, number>>>;
  readonly proportion?: Readonly<Partial<Proportion>>;
  readonly partParams?: PartParams;
  readonly hairColor?: Readonly<Partial<HairColor>>;
  readonly outlineWidthMm?: number;
  readonly rampSoftness?: number;
  readonly rimStrength?: number;
}

export function applyShaperFineSlidersToRecipe(
  recipe: CharacterRecipe,
  patch: ShaperFineSliderPatch,
  now?: number,
): ComposeWebtoonUniverseRecipeResult {
  const nextFace = patch.face ? normalizeParamValues({ ...recipe.face, ...patch.face }) : recipe.face;
  const nextBody = patch.body ? normalizeParamValues({ ...recipe.body, ...patch.body }) : recipe.body;

  let nextProportion = recipe.style.proportion;
  if (patch.proportion) {
    const baseProp: Proportion = nextProportion ?? {
      headsTall: 7.5, legRatio: 0.48, armRatio: 0.44, shoulderHeads: 1.8, headWidthRatio: 0.78, handScale: 1,
    };
    const updated = { ...baseProp };
    for (const key of PROPORTION_KEYS) {
      const val = patch.proportion[key];
      if (val !== undefined) updated[key] = clampProportion(key, val);
    }
    nextProportion = updated;
  }

  const nextPartParams = patch.partParams ? cleanPartParams({ ...recipe.partParams, ...patch.partParams }) : recipe.partParams;
  const gStart = patch.hairColor?.gradient
    ? Math.max(0, Math.min(1, patch.hairColor.gradient[0]))
    : recipe.hairColor.gradient[0];
  const gEnd = patch.hairColor?.gradient
    ? Math.max(gStart, Math.min(1, patch.hairColor.gradient[1]))
    : recipe.hairColor.gradient[1];

  const nextHairColor: HairColor = patch.hairColor
    ? {
        gradient: [gStart, gEnd],
        tipMix: patch.hairColor.tipMix !== undefined ? Math.max(0, Math.min(1, patch.hairColor.tipMix)) : recipe.hairColor.tipMix,
        accent: patch.hairColor.accent ?? recipe.hairColor.accent,
      }
    : recipe.hairColor;

  const nextLook = mergeLook(recipe.shading.look, {
    ...(patch.outlineWidthMm !== undefined ? { line: { widthMm: Math.max(0, Math.min(20, patch.outlineWidthMm)) } } : {}),
    ...(patch.rampSoftness !== undefined ? { ramp: { softness: Math.max(0, Math.min(1, patch.rampSoftness)) } } : {}),
    ...(patch.rimStrength !== undefined ? { rim: { strength: Math.max(0, Math.min(2, patch.rimStrength)) } } : {}),
  });

  const candidate: CharacterRecipe = {
    ...recipe,
    face: nextFace,
    body: nextBody,
    partParams: nextPartParams,
    hairColor: nextHairColor,
    style: { ...recipe.style, proportion: nextProportion },
    shading: { ...recipe.shading, look: nextLook },
  };

  const checked = characterRecipeSchema.safeParse(candidate);
  if (!checked.success) {
    return {
      ok: false,
      failure: failVisible(
        "shaper-fine-slider-invalid",
        `3D 셰이퍼 슬라이더 적용 결과가 유효하지 않습니다: ${describeRecipeIssues(checked.error.issues)}`,
        undefined,
        now,
      ),
    };
  }
  return { ok: true, recipe: checked.data, preset: webtoonUniverseShaperPreset("school-romance") };
}

export function blendWebtoonUniverseRecipes(
  fromId: WebtoonUniverseShaperId,
  toId: WebtoonUniverseShaperId,
  t: number,
  baseRecipe: CharacterRecipe,
  now?: number,
  options?: ComposeWebtoonUniverseOptions,
): ComposeWebtoonUniverseRecipeResult {
  const alpha = Number.isNaN(t) ? 0.5 : Math.max(0, Math.min(1, t));
  const fromRes = composeWebtoonUniverseRecipe(fromId, baseRecipe, now, options);
  if (!fromRes.ok) return fromRes;
  const toRes = composeWebtoonUniverseRecipe(toId, baseRecipe, now, options);
  if (!toRes.ok) return toRes;

  const a = fromRes.recipe;
  const b = toRes.recipe;
  const dominant = alpha < 0.5 ? a : b;
  const dominantPreset = alpha < 0.5 ? fromRes.preset : toRes.preset;
  const lerp = (x: number, y: number) => Number((x + (y - x) * alpha).toFixed(4));

  const blendedFace: Partial<Record<FaceParamKey, number>> = {};
  for (const key of FACE_PARAM_KEYS) {
    const v = lerp(a.face[key] ?? 0, b.face[key] ?? 0);
    if (v !== 0) blendedFace[key] = v;
  }

  const blendedBody: Partial<Record<BodyParamKey, number>> = {};
  for (const key of BODY_PARAM_KEYS) {
    const v = lerp(a.body[key] ?? 0, b.body[key] ?? 0);
    if (v !== 0) blendedBody[key] = v;
  }

  let blendedProportion: Proportion | null = null;
  if (a.style.proportion && b.style.proportion) {
    blendedProportion = {
      headsTall: clampProportion("headsTall", lerp(a.style.proportion.headsTall, b.style.proportion.headsTall)),
      legRatio: clampProportion("legRatio", lerp(a.style.proportion.legRatio, b.style.proportion.legRatio)),
      armRatio: clampProportion("armRatio", lerp(a.style.proportion.armRatio, b.style.proportion.armRatio)),
      shoulderHeads: clampProportion("shoulderHeads", lerp(a.style.proportion.shoulderHeads, b.style.proportion.shoulderHeads)),
      headWidthRatio: clampProportion("headWidthRatio", lerp(a.style.proportion.headWidthRatio, b.style.proportion.headWidthRatio)),
      handScale: clampProportion("handScale", lerp(a.style.proportion.handScale, b.style.proportion.handScale)),
    };
  }

  const hairShapesA = a.partParams.hair ?? {};
  const hairShapesB = b.partParams.hair ?? {};
  const blendedHairShapes: Record<string, number> = {};
  for (const k of new Set([...Object.keys(hairShapesA), ...Object.keys(hairShapesB)])) {
    blendedHairShapes[k] = lerp(hairShapesA[k] ?? 0, hairShapesB[k] ?? 0);
  }

  const g0 = lerp(a.hairColor.gradient[0], b.hairColor.gradient[0]);
  const g1 = Math.max(g0, lerp(a.hairColor.gradient[1], b.hairColor.gradient[1]));

  const fineResult = applyShaperFineSlidersToRecipe(
    dominant,
    {
      face: blendedFace,
      body: blendedBody,
      ...(blendedProportion ? { proportion: blendedProportion } : {}),
      partParams: { ...dominant.partParams, hair: blendedHairShapes },
      hairColor: { gradient: [g0, g1], tipMix: lerp(a.hairColor.tipMix, b.hairColor.tipMix), accent: dominant.hairColor.accent },
      outlineWidthMm: lerp(a.shading.look.line.widthMm, b.shading.look.line.widthMm),
      rampSoftness: lerp(a.shading.look.ramp.softness, b.shading.look.ramp.softness),
      rimStrength: lerp(a.shading.look.rim.strength, b.shading.look.rim.strength),
    },
    now,
  );
  if (!fineResult.ok) return fineResult;
  return { ok: true, recipe: fineResult.recipe, preset: dominantPreset };
}
