/**
 * 코디 세트(레시피 v3 "내 룩" 섹션의 시작 레시피, 2026-10-23 S-1). 장르별 24세트: 교복 6·캐주얼 6·직장/직업 4·운동 3·판타지/전통풍 3·홈웨어 2.
 *
 * 세트 = 레시피 **의상 구역** 부분 patch: 상의·하의·신발·액세서리 슬롯 프리셋 + 겹쳐 입기 층(이너·아우터·레그웨어) + 추가 소품(앵커) +
 * 의상 채널 색 + 표면(재질·패턴) + (선택) 헤어 색 흐름. 프리셋 id는 현재 어휘에 실제로 있는 것만 쓴다(헤어 7·상 5·하 5·신발 4·소품 6,
 * `contracts/preset-vocabulary.ts`). 레이어 의미는 어휘 프리셋을 그 층에 입힌 것이다(예: 아우터 `top/blazer` = 재킷·가운·코트 역할,
 * 레그웨어 `bottom/slacks` + 니트 재질 = 레깅스·스타킹 역할, 레그웨어 `bottom/shorts` = 속바지).
 *
 * 적용은 `composeLookSetLook(세트, 지금 레시피)`가 만든 look/1 문서 하나(`look-preset/apply`, history 1단계)다. 의상 구역만 바꾸고
 * 의상 밖 사용자 값(피부·헤어 모양·얼굴·몸·입술 같은 의상 밖 채널 색·표면, 형태 값)은 그대로 둔다. 헤어 슬롯은 세트에 넣지 않는다(옷이 아니다).
 * 세트의 상의·하의 형태 값(partParams)은 지우지 않는다 — 새 파츠에 그 형태 키가 없으면 플래너가 skippedShapes·미지원 사유로 알린다.
 */
import { z } from "zod";

import {
  ACCESSORY_ANCHORS,
  CHANNEL_KEYS,
  CHARACTER_LOOK_FORMAT,
  CHARACTER_LOOK_NAME_MAX,
  DEFAULT_ACCESSORY_OFFSET,
  MAX_EXTRA_ACCESSORIES,
  OUTFIT_CHANNEL_KEYS,
  accessoryOffsetSchema,
  characterLookSchema,
  describeRecipeIssues,
  failVisible,
  hairColorSchema,
  hexColorSchema,
  isLayerPreset,
  isPresetId,
  isVocabularyPresetId,
  presetSlot,
  surfaceSchema,
} from "../contracts";

import { accessoryAnchorsFor } from "./accessory-anchors";

import type {
  AccessoryAnchor,
  AccessoryOffset,
  AccessoryStyleId,
  BottomStyleId,
  ChannelKey,
  CharacterLook,
  CharacterRecipe,
  HairColor,
  LabFailure,
  MaterialPresetId,
  PatternKind,
  PresetId,
  ShoesStyleId,
  SlotKind,
  Surface,
  TopStyleId,
  Wardrobe,
  WardrobeLayer,
} from "../contracts";

// ---------------------------------------------------------------- 장르

export const LOOK_SET_GENRES = ["school", "casual", "work", "sport", "fantasy-traditional", "home"] as const;
export type LookSetGenre = (typeof LOOK_SET_GENRES)[number];

export const LOOK_SET_GENRE_LABELS_KO: Readonly<Record<LookSetGenre, string>> = {
  school: "교복",
  casual: "캐주얼",
  work: "직장·직업",
  sport: "운동",
  "fantasy-traditional": "판타지·전통풍",
  home: "홈웨어",
};

/** 장르별 최소 세트 수(S-1 완료 조건) */
export const LOOK_SET_MIN_PER_GENRE: Readonly<Record<LookSetGenre, number>> = { school: 6, casual: 6, work: 4, sport: 3, "fantasy-traditional": 3, home: 2 };

// ---------------------------------------------------------------- 모양

export interface LookSetAccessory {
  readonly presetId: PresetId;
  readonly anchor: AccessoryAnchor;
  readonly offset?: AccessoryOffset;
}

export interface LookSet {
  /** kebab-case. 룩 문서 id는 `set-<id>` */
  readonly id: string;
  readonly genre: LookSetGenre;
  readonly nameKo: string;
  readonly descriptionKo: string;
  readonly slots: { readonly top: PresetId; readonly bottom: PresetId; readonly shoes: PresetId; readonly accessory: PresetId | null };
  readonly layers: { readonly inner: PresetId | null; readonly outer: PresetId | null; readonly legwear: PresetId | null };
  /** 추가 소품(`wardrobe.accessories`, 순서대로 acc-1부터) */
  readonly accessories: readonly LookSetAccessory[];
  /** 의상 채널 색(`OUTFIT_CHANNEL_KEYS`만). 기본 의상 채널 4개(상의·하의·신발·액세서리)는 반드시 정한다. */
  readonly colors: Readonly<Partial<Record<ChannelKey, string>>>;
  /** 의상 채널 표면(재질·패턴) */
  readonly surfaces: Readonly<Partial<Record<ChannelKey, Surface>>>;
  /** 헤어 색 흐름(선택). 없으면 사용자 값을 그대로 둔다. */
  readonly hairColor?: HairColor;
}

const OUTFIT_CHANNEL_SET: ReadonlySet<ChannelKey> = new Set(OUTFIT_CHANNEL_KEYS);
const REQUIRED_OUTFIT_CHANNELS = ["top", "bottom", "shoes", "accessory"] as const satisfies readonly ChannelKey[];

const vocabularyPreset = (slot: SlotKind) =>
  z.custom<PresetId>((value) => isPresetId(value) && presetSlot(value) === slot && isVocabularyPresetId(value), { message: `${slot}/<어휘 이름> 프리셋이어야 합니다.` });
const layerPreset = (layer: WardrobeLayer) =>
  z.custom<PresetId>((value) => isLayerPreset(layer, value) && isVocabularyPresetId(value), { message: `${layer} 층에 입힐 수 없는 프리셋입니다.` });

/** 세트 하나의 스키마(계약 조각 스키마로 만든다 — 시험이 모든 세트를 통과시킨다) */
export const lookSetSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{2,46}$/u, "세트 id는 kebab-case여야 합니다."),
    genre: z.enum(LOOK_SET_GENRES),
    nameKo: z.string().regex(/[가-힣]/u, "세트 이름에 한글이 있어야 합니다.").max(CHARACTER_LOOK_NAME_MAX),
    descriptionKo: z.string().regex(/[가-힣]/u, "세트 설명에 한글이 있어야 합니다."),
    slots: z.object({ top: vocabularyPreset("top"), bottom: vocabularyPreset("bottom"), shoes: vocabularyPreset("shoes"), accessory: vocabularyPreset("accessory").nullable() }).strict(),
    layers: z.object({ inner: layerPreset("inner").nullable(), outer: layerPreset("outer").nullable(), legwear: layerPreset("legwear").nullable() }).strict(),
    accessories: z
      .array(z.object({ presetId: vocabularyPreset("accessory"), anchor: z.enum(ACCESSORY_ANCHORS), offset: accessoryOffsetSchema.optional() }).strict())
      .max(MAX_EXTRA_ACCESSORIES),
    colors: z.partialRecord(z.enum(CHANNEL_KEYS), hexColorSchema),
    surfaces: z.partialRecord(z.enum(CHANNEL_KEYS), surfaceSchema),
    hairColor: hairColorSchema.optional(),
  })
  .strict()
  .superRefine((set, ctx) => {
    for (const key of Object.keys(set.colors) as ChannelKey[]) {
      if (!OUTFIT_CHANNEL_SET.has(key)) ctx.addIssue({ code: "custom", message: `의상 채널이 아닌 색입니다: ${key}`, path: ["colors", key] });
    }
    for (const key of REQUIRED_OUTFIT_CHANNELS) {
      if (set.colors[key] === undefined) ctx.addIssue({ code: "custom", message: `기본 의상 채널 ${key}의 색이 없습니다.`, path: ["colors", key] });
    }
    for (const [key, surface] of Object.entries(set.surfaces) as Array<[ChannelKey, Surface | undefined]>) {
      if (!OUTFIT_CHANNEL_SET.has(key)) ctx.addIssue({ code: "custom", message: `의상 채널이 아닌 표면입니다: ${key}`, path: ["surfaces", key] });
      const ink = surface?.pattern?.inkChannel;
      if (ink !== undefined && (ink === key || !OUTFIT_CHANNEL_SET.has(ink))) {
        ctx.addIssue({ code: "custom", message: `패턴 두 번째 색은 바탕과 다른 의상 채널이어야 합니다: ${key} → ${ink}`, path: ["surfaces", key, "pattern", "inkChannel"] });
      }
    }
    set.accessories.forEach((accessory, index) => {
      if (!accessoryAnchorsFor(accessory.presetId).includes(accessory.anchor)) {
        ctx.addIssue({ code: "custom", message: `${accessory.presetId}는 앵커 ${accessory.anchor}에 어울리지 않습니다.`, path: ["accessories", index, "anchor"] });
      }
    });
  });

// ---------------------------------------------------------------- 데이터 도우미

interface LookSetDraft {
  readonly id: string;
  readonly genre: LookSetGenre;
  readonly nameKo: string;
  readonly descriptionKo: string;
  readonly top: TopStyleId;
  readonly bottom: BottomStyleId;
  readonly shoes: ShoesStyleId;
  readonly accessory: AccessoryStyleId | null;
  readonly inner?: TopStyleId;
  readonly outer?: TopStyleId;
  readonly legwear?: BottomStyleId;
  readonly accessories?: ReadonlyArray<readonly [AccessoryStyleId, AccessoryAnchor]>;
  readonly colors: Readonly<Partial<Record<ChannelKey, string>>>;
  readonly surfaces?: Readonly<Partial<Record<ChannelKey, Surface>>>;
  readonly hairColor?: HairColor;
}

function lookSet(draft: LookSetDraft): LookSet {
  return {
    id: draft.id,
    genre: draft.genre,
    nameKo: draft.nameKo,
    descriptionKo: draft.descriptionKo,
    slots: { top: `top/${draft.top}`, bottom: `bottom/${draft.bottom}`, shoes: `shoes/${draft.shoes}`, accessory: draft.accessory === null ? null : `accessory/${draft.accessory}` },
    layers: {
      inner: draft.inner ? `top/${draft.inner}` : null,
      outer: draft.outer ? `top/${draft.outer}` : null,
      legwear: draft.legwear ? `bottom/${draft.legwear}` : null,
    },
    accessories: (draft.accessories ?? []).map(([name, anchor]) => ({ presetId: `accessory/${name}`, anchor })),
    colors: draft.colors,
    surfaces: draft.surfaces ?? {},
    ...(draft.hairColor ? { hairColor: draft.hairColor } : {}),
  };
}

/** 재질만 */
function mat(material: MaterialPresetId): Surface {
  return { material, pattern: null };
}

/** 재질 + 패턴(크기 cm·각도°·두 번째 색 비율·두 번째 색 채널) */
function pat(material: MaterialPresetId, kind: PatternKind, scaleCm: number, angleDeg: number, ratio: number, inkChannel: ChannelKey): Surface {
  return { material, pattern: { kind, scaleCm, angleDeg, ratio, inkChannel } };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ---------------------------------------------------------------- 24세트(색 조합은 세트마다 다르다 — 시험이 확인)

/** 코디 세트(장르 순서 = LOOK_SET_GENRES, 깊이 동결) */
export const LOOK_SETS: readonly LookSet[] = deepFreeze([
  // ---- 교복 6
  lookSet({
    id: "school-sailor-navy",
    genre: "school",
    nameKo: "세일러 교복(남색 깃)",
    descriptionKo: "흰 세일러 상의에 남색 깃과 플리츠 스커트, 붉은 스카프 리본.",
    top: "sailor",
    bottom: "pleated-skirt",
    shoes: "loafers",
    accessory: "ribbon",
    colors: { top: "#f4f6fb", "top-trim": "#1f2d4f", "top-accent": "#c8323c", bottom: "#1f2d4f", shoes: "#2a211c", accessory: "#c8323c" },
    surfaces: { bottom: mat("cloth-cotton") },
  }),
  lookSet({
    id: "school-blazer-plaid",
    genre: "school",
    nameKo: "블레이저 교복(타탄 스커트)",
    descriptionKo: "흰 셔츠 위 남색 블레이저, 붉은 줄 타탄 플리츠 스커트와 리본.",
    top: "shirt",
    bottom: "pleated-skirt",
    shoes: "loafers",
    accessory: "ribbon",
    outer: "blazer",
    colors: {
      top: "#f7f7fb",
      outer: "#2d3447",
      "outer-trim": "#1b2030",
      "outer-accent": "#c9a24a",
      bottom: "#3d4f7a",
      "bottom-trim": "#a33a3a",
      shoes: "#1c1a19",
      accessory: "#a33a3a",
    },
    surfaces: { bottom: pat("cloth-cotton", "plaid", 6, 0, 0.35, "bottom-trim") },
  }),
  lookSet({
    id: "school-blazer-slacks",
    genre: "school",
    nameKo: "블레이저 교복(잔체크 슬랙스)",
    descriptionKo: "갈색 블레이저와 잔체크 슬랙스, 금색 단추.",
    top: "shirt",
    bottom: "slacks",
    shoes: "loafers",
    accessory: null,
    outer: "blazer",
    colors: {
      top: "#f2f4f8",
      outer: "#3a2e2a",
      "outer-trim": "#24201c",
      "outer-accent": "#b89a5a",
      bottom: "#4a4f5c",
      "bottom-trim": "#5f6575",
      shoes: "#2a211c",
      accessory: "#3a2e2a",
    },
    surfaces: { bottom: pat("cloth-cotton", "check", 2, 0, 0.2, "bottom-trim") },
  }),
  lookSet({
    id: "school-summer-gingham",
    genre: "school",
    nameKo: "하복(깅엄 스커트)",
    descriptionKo: "하늘색 깅엄 플리츠 스커트에 속바지, 흰 운동화와 남색 리본.",
    top: "shirt",
    bottom: "pleated-skirt",
    shoes: "sneakers",
    accessory: "ribbon",
    legwear: "shorts",
    colors: { top: "#f7f9fc", "top-trim": "#c9d6ea", bottom: "#6f8fb8", "bottom-trim": "#e8eef6", legwear: "#2b2f3a", shoes: "#f5f5f5", accessory: "#3c5a8a" },
    surfaces: { bottom: pat("cloth-cotton", "gingham", 3, 0, 0.5, "bottom-trim") },
  }),
  lookSet({
    id: "school-casual-uniform",
    genre: "school",
    nameKo: "생활복(후드 집업)",
    descriptionKo: "티셔츠 위 남색 후드 집업과 슬랙스, 흰 줄 포인트.",
    top: "tee",
    bottom: "slacks",
    shoes: "sneakers",
    accessory: null,
    outer: "hoodie",
    colors: { top: "#f1f1f4", outer: "#3c4c78", "outer-trim": "#e8e8ee", bottom: "#2f3550", shoes: "#f5f5f5", "shoes-lace": "#3c4c78", accessory: "#3c4c78" },
    surfaces: { outer: mat("cloth-knit") },
  }),
  lookSet({
    id: "school-stand-collar",
    genre: "school",
    nameKo: "스탠드 칼라 교복",
    descriptionKo: "검은 스탠드 칼라 상의에 금색 단추, 같은 색 슬랙스와 흰 셔츠.",
    top: "blazer",
    bottom: "slacks",
    shoes: "loafers",
    accessory: null,
    inner: "shirt",
    colors: { top: "#16181f", "top-trim": "#c9a24a", inner: "#f5f5f7", bottom: "#16181f", shoes: "#1c1a19", accessory: "#16181f" },
  }),

  // ---- 캐주얼 6
  lookSet({
    id: "casual-denim-tee",
    genre: "casual",
    nameKo: "데님 캐주얼",
    descriptionKo: "흰 티셔츠와 청바지, 남색 캡 모자.",
    top: "tee",
    bottom: "jeans",
    shoes: "sneakers",
    accessory: "cap",
    colors: { top: "#f1f1f4", bottom: "#3b4a6b", "bottom-trim": "#c9a24a", shoes: "#f5f5f5", "shoes-sole": "#e3e3e3", accessory: "#2f3b5c" },
    surfaces: { bottom: mat("cloth-denim") },
  }),
  lookSet({
    id: "casual-hoodie-shorts",
    genre: "casual",
    nameKo: "후드티와 반바지",
    descriptionKo: "테라코타 후드티에 반바지, 검은 레깅스를 겹쳐 입는다.",
    top: "hoodie",
    bottom: "shorts",
    shoes: "sneakers",
    accessory: null,
    legwear: "slacks",
    colors: { top: "#c96f53", "top-trim": "#f2e6dc", bottom: "#7d8db0", legwear: "#1f1f24", shoes: "#2b2b33", "shoes-lace": "#f2f2f2", accessory: "#c96f53" },
    surfaces: { legwear: mat("cloth-knit") },
  }),
  lookSet({
    id: "casual-breton-skirt",
    genre: "casual",
    nameKo: "줄무늬 티와 롱스커트",
    descriptionKo: "남색 줄무늬 티셔츠, 베이지 롱스커트, 금 귀걸이.",
    top: "tee",
    bottom: "long-skirt",
    shoes: "sandals",
    accessory: "earrings",
    colors: { top: "#fafafa", "top-trim": "#1f2d4f", bottom: "#c9b79c", shoes: "#c9a27a", accessory: "#d8b45a" },
    surfaces: { top: pat("cloth-cotton", "stripe", 2, 0, 0.4, "top-trim"), accessory: mat("metal") },
  }),
  lookSet({
    id: "casual-flannel-layered",
    genre: "casual",
    nameKo: "체크 셔츠 레이어드",
    descriptionKo: "붉은 타탄 셔츠를 흰 티셔츠 위에 겹쳐 입고 청바지와 부츠.",
    top: "shirt",
    bottom: "jeans",
    shoes: "boots",
    accessory: null,
    inner: "tee",
    colors: { top: "#a33a3a", "top-trim": "#1c1c22", inner: "#f2f2f2", bottom: "#2e3a52", shoes: "#2a211c", accessory: "#a33a3a" },
    surfaces: { top: pat("cloth-cotton", "plaid", 5, 0, 0.3, "top-trim"), bottom: mat("cloth-denim") },
  }),
  lookSet({
    id: "casual-floral-skirt",
    genre: "casual",
    nameKo: "꽃무늬 롱스커트",
    descriptionKo: "연분홍 블라우스와 꽃무늬 롱스커트, 같은 색 리본.",
    top: "shirt",
    bottom: "long-skirt",
    shoes: "loafers",
    accessory: "ribbon",
    colors: { top: "#f3e6ea", bottom: "#7a5a6a", "bottom-trim": "#e8c8d4", shoes: "#e8e2dc", accessory: "#7a5a6a" },
    surfaces: { top: mat("cloth-silk"), bottom: pat("cloth-silk", "flower", 4, 0, 0.3, "bottom-trim") },
  }),
  lookSet({
    id: "casual-street-layered",
    genre: "casual",
    nameKo: "스트리트 레이어드",
    descriptionKo: "검은 후드티 위 회색 재킷, 검은 청바지, 은 귀걸이와 초커, 끝을 물들인 헤어.",
    top: "hoodie",
    bottom: "jeans",
    shoes: "sneakers",
    accessory: "earrings",
    outer: "blazer",
    accessories: [["choker", "neck"]],
    colors: { top: "#2b2b33", outer: "#55606e", "outer-trim": "#2b2b33", bottom: "#1e2430", shoes: "#f5f5f5", "shoes-sole": "#2b2b33", accessory: "#c0c0c8" },
    surfaces: { bottom: mat("cloth-denim"), accessory: mat("metal") },
    hairColor: { gradient: [0.5, 1], tipMix: 0.5, accent: "streak" },
  }),

  // ---- 직장·직업 4
  lookSet({
    id: "work-office-suit",
    genre: "work",
    nameKo: "오피스 정장(바지)",
    descriptionKo: "차콜 핀스트라이프 재킷과 바지, 흰 셔츠.",
    top: "shirt",
    bottom: "slacks",
    shoes: "loafers",
    accessory: null,
    outer: "blazer",
    colors: {
      top: "#f7f7fb",
      outer: "#2b3040",
      "outer-trim": "#4a5160",
      "outer-accent": "#8a8f9c",
      bottom: "#2b3040",
      "bottom-trim": "#4a5160",
      shoes: "#1c1a19",
      accessory: "#2b3040",
    },
    surfaces: { outer: pat("cloth-cotton", "stripe", 1.2, 90, 0.08, "outer-trim"), bottom: pat("cloth-cotton", "stripe", 1.2, 90, 0.08, "bottom-trim") },
  }),
  lookSet({
    id: "work-office-skirt",
    genre: "work",
    nameKo: "오피스 정장(스커트)",
    descriptionKo: "카멜 재킷과 롱스커트에 어두운 스타킹, 금 귀걸이.",
    top: "shirt",
    bottom: "long-skirt",
    shoes: "loafers",
    accessory: "earrings",
    outer: "blazer",
    legwear: "slacks",
    colors: { top: "#eef0f6", outer: "#6d5a4b", "outer-trim": "#4f4036", bottom: "#6d5a4b", legwear: "#3a3236", shoes: "#2a211c", accessory: "#d8b45a" },
    surfaces: { legwear: mat("cloth-knit"), accessory: mat("metal") },
  }),
  lookSet({
    id: "work-barista",
    genre: "work",
    nameKo: "카페 바리스타",
    descriptionKo: "검은 셔츠와 슬랙스, 갈색 캡 모자.",
    top: "shirt",
    bottom: "slacks",
    shoes: "loafers",
    accessory: "cap",
    colors: { top: "#2b2b33", "top-trim": "#8a6a4a", bottom: "#2b2b33", shoes: "#3a2a1e", accessory: "#8a6a4a" },
    surfaces: { accessory: mat("cloth-cotton") },
  }),
  lookSet({
    id: "work-lab-coat",
    genre: "work",
    nameKo: "연구원 가운",
    descriptionKo: "흰 가운 아래 하늘색 셔츠와 남회색 바지, 안경.",
    top: "shirt",
    bottom: "slacks",
    shoes: "sneakers",
    accessory: "glasses",
    outer: "blazer",
    colors: { top: "#dfe7ef", outer: "#f5f6f8", "outer-trim": "#d9dde3", bottom: "#3a4150", shoes: "#f0f0f0", accessory: "#2a2a2e" },
    surfaces: { accessory: mat("metal") },
  }),

  // ---- 운동 3
  lookSet({
    id: "sport-track",
    genre: "sport",
    nameKo: "트레이닝복",
    descriptionKo: "파란 트랙 재킷과 바지에 흰 줄.",
    top: "tee",
    bottom: "slacks",
    shoes: "sneakers",
    accessory: null,
    outer: "hoodie",
    colors: {
      top: "#f2f2f2",
      outer: "#2f4f8f",
      "outer-trim": "#f2f2f2",
      "outer-accent": "#f2f2f2",
      bottom: "#2f4f8f",
      "bottom-trim": "#f2f2f2",
      shoes: "#f5f5f5",
      "shoes-lace": "#2f4f8f",
      accessory: "#2f4f8f",
    },
    surfaces: { outer: mat("cloth-knit"), bottom: pat("cloth-knit", "stripe", 8, 90, 0.12, "bottom-trim") },
  }),
  lookSet({
    id: "sport-running",
    genre: "sport",
    nameKo: "러닝",
    descriptionKo: "형광 주황 티셔츠와 검은 반바지·레깅스, 민트 운동화와 캡.",
    top: "tee",
    bottom: "shorts",
    shoes: "sneakers",
    accessory: "cap",
    legwear: "slacks",
    colors: { top: "#e85d3a", bottom: "#1f1f24", legwear: "#1f1f24", shoes: "#3cbf9a", "shoes-sole": "#f2f2f2", accessory: "#1f1f24" },
    surfaces: { legwear: mat("cloth-knit") },
  }),
  lookSet({
    id: "sport-tennis",
    genre: "sport",
    nameKo: "테니스",
    descriptionKo: "흰 셔츠와 플리츠 스커트에 초록 줄, 초록 헤어 리본.",
    top: "shirt",
    bottom: "pleated-skirt",
    shoes: "sneakers",
    accessory: "ribbon",
    colors: { top: "#f8f8f8", "top-trim": "#2f6f4f", bottom: "#f8f8f8", "bottom-trim": "#2f6f4f", shoes: "#f8f8f8", accessory: "#2f6f4f" },
    surfaces: { bottom: pat("cloth-cotton", "stripe", 1, 0, 0.1, "bottom-trim") },
  }),

  // ---- 판타지·전통풍 3
  lookSet({
    id: "fantasy-mage-robe",
    genre: "fantasy-traditional",
    nameKo: "마법사 로브",
    descriptionKo: "남보라 로브에 금빛 별점 무늬, 끝이 물드는 헤어.",
    top: "shirt",
    bottom: "long-skirt",
    shoes: "boots",
    accessory: "earrings",
    outer: "blazer",
    colors: { top: "#3a2f5a", outer: "#2a2140", "outer-trim": "#c9a24a", "outer-accent": "#c9a24a", bottom: "#2a2140", shoes: "#2a211c", accessory: "#c9a24a" },
    surfaces: { outer: pat("cloth-silk", "dot", 3, 0, 0.08, "outer-accent"), accessory: mat("metal") },
    hairColor: { gradient: [0.45, 1], tipMix: 0.6, accent: "inner" },
  }),
  lookSet({
    id: "traditional-jeogori",
    genre: "fantasy-traditional",
    nameKo: "전통풍 저고리·치마",
    descriptionKo: "상아색 저고리풍 상의에 남색 깃·붉은 고름, 붉은 치마와 댕기 리본.",
    top: "shirt",
    bottom: "long-skirt",
    shoes: "loafers",
    accessory: "ribbon",
    colors: { top: "#f3e9d8", "top-trim": "#2f5f8f", "top-accent": "#c8323c", bottom: "#c8323c", shoes: "#f2efe9", accessory: "#c8323c" },
    surfaces: { top: mat("cloth-silk"), bottom: mat("cloth-silk") },
  }),
  lookSet({
    id: "fantasy-knight",
    genre: "fantasy-traditional",
    nameKo: "기사풍",
    descriptionKo: "강철빛 갑옷 재킷과 금 테두리, 가죽 부츠.",
    top: "shirt",
    bottom: "slacks",
    shoes: "boots",
    accessory: null,
    outer: "blazer",
    colors: { top: "#d8d8de", outer: "#4a5568", "outer-trim": "#c9a24a", bottom: "#2f3542", shoes: "#3a2a1e", accessory: "#4a5568" },
    surfaces: { outer: mat("metal"), shoes: mat("leather") },
  }),

  // ---- 홈웨어 2
  lookSet({
    id: "home-gingham-pajama",
    genre: "home",
    nameKo: "깅엄 파자마",
    descriptionKo: "하늘색 깅엄 파자마와 실내화.",
    top: "shirt",
    bottom: "slacks",
    shoes: "sandals",
    accessory: null,
    colors: { top: "#cfe0f2", "top-trim": "#ffffff", bottom: "#cfe0f2", "bottom-trim": "#ffffff", shoes: "#f2f2f2", accessory: "#cfe0f2" },
    surfaces: { top: pat("cloth-cotton", "gingham", 2.5, 0, 0.5, "top-trim"), bottom: pat("cloth-cotton", "gingham", 2.5, 0, 0.5, "bottom-trim") },
  }),
  lookSet({
    id: "home-knit-lounge",
    genre: "home",
    nameKo: "니트 라운지웨어",
    descriptionKo: "크림색 니트 후드와 반바지, 털 슬리퍼.",
    top: "hoodie",
    bottom: "shorts",
    shoes: "sandals",
    accessory: null,
    colors: { top: "#e8dccb", bottom: "#c8b8a2", shoes: "#d8c8b8", accessory: "#e8dccb" },
    surfaces: { top: mat("cloth-knit"), bottom: mat("cloth-knit") },
  }),
]);

const SET_BY_ID: ReadonlyMap<string, LookSet> = new Map(LOOK_SETS.map((set) => [set.id, set]));

export function lookSetById(id: string): LookSet | undefined {
  return SET_BY_ID.get(id);
}

export function lookSetsForGenre(genre: LookSetGenre): readonly LookSet[] {
  return LOOK_SETS.filter((set) => set.genre === genre);
}

// ---------------------------------------------------------------- 적용(look/1 문서 조립)

/** 세트의 옷장(층 + 추가 소품, id는 acc-1부터 순서대로) */
export function lookSetWardrobe(set: LookSet): Wardrobe {
  return {
    inner: set.layers.inner,
    outer: set.layers.outer,
    legwear: set.layers.legwear,
    accessories: set.accessories.map((accessory, index) => ({
      id: `acc-${index + 1}`,
      presetId: accessory.presetId,
      anchor: accessory.anchor,
      offset: structuredClone(accessory.offset ?? DEFAULT_ACCESSORY_OFFSET),
    })),
  };
}

export type ComposeLookSetResult = { readonly ok: true; readonly look: CharacterLook } | { readonly ok: false; readonly failure: LabFailure };

/**
 * 코디 세트를 지금 레시피에 입히는 look/1 문서(scope `full`)를 만든다 — 그대로 `look-preset/apply`로 보낸다.
 * - 슬롯은 상의·하의·신발·액세서리만 담는다(헤어·얼굴·몸 슬롯은 그대로).
 * - 색: 의상 채널은 세트 값으로 바꾸고(세트에 없는 의상 상속 채널은 상속으로 돌아간다), 의상 밖 채널(피부·입술 등)은 지금 레시피 값을 그대로 싣는다.
 * - 표면: 의상 채널은 세트 값, 의상 밖 채널은 지금 값. 옷장(층·추가 소품)은 세트로 바꾼다. 헤어 색 흐름은 세트에 있을 때만 바꾼다.
 * 결과는 계약 스키마로 다시 검사하고, 맞지 않으면 한글 사유의 실패를 돌려준다(throw 없음).
 */
export function composeLookSetLook(set: LookSet, recipe: CharacterRecipe, now?: number): ComposeLookSetResult {
  const colors: Partial<Record<ChannelKey, string>> = {};
  const surfaces: Partial<Record<ChannelKey, Surface>> = {};
  for (const key of CHANNEL_KEYS) {
    const outfit = OUTFIT_CHANNEL_SET.has(key);
    const color = outfit ? set.colors[key] : recipe.colors[key];
    if (color !== undefined) colors[key] = color;
    const surface = outfit ? set.surfaces[key] : recipe.surfaces[key];
    if (surface !== undefined) surfaces[key] = structuredClone(surface);
  }
  const look = {
    format: CHARACTER_LOOK_FORMAT,
    id: `set-${set.id}`,
    nameKo: set.nameKo,
    scope: "full" as const,
    payload: {
      slots: { top: set.slots.top, bottom: set.slots.bottom, shoes: set.slots.shoes, accessory: set.slots.accessory },
      colors,
      wardrobe: lookSetWardrobe(set),
      surfaces,
      ...(set.hairColor ? { hairColor: structuredClone(set.hairColor) } : {}),
    },
    locks: [],
  };
  const parsed = characterLookSchema.safeParse(look);
  if (!parsed.success) {
    return { ok: false, failure: failVisible("look-set-invalid", `코디 세트 "${set.nameKo}"로 룩을 만들 수 없습니다: ${describeRecipeIssues(parsed.error.issues)}`, undefined, now) };
  }
  return { ok: true, look: parsed.data };
}
