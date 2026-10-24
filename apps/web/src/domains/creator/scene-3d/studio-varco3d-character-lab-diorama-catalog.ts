/**
 * Real VARCO 3D Cloud (https://3d.varco.ai, Flow 70a90b59-8678-4d35-a5f1-4d1ea39195a7)
 * Character Labs modular wardrobe/wig/weapon/wing catalog, rigged webtoon character
 * archetypes, isometric cutaway 3D background dioramas, and Korean webtoon 3D props.
 */

export type StudioVarco3dCharacterLabSlot =
  | "head-hair"
  | "outfit-set"
  | "head-accessory"
  | "weapon-r"
  | "weapon-l"
  | "back-wings";

export type StudioVarco3dWebtoonGenre =
  | "daily-school"
  | "romance-fantasy"
  | "murim"
  | "hunter-action"
  | "cyberpunk"
  | "joseon-historical";

export type StudioVarco3dTurnaroundAngle = "front" | "back" | "left" | "right";

export type StudioVarco3dAttachBoneName =
  | "mixamorig:Head"
  | "mixamorig:Spine2"
  | "mixamorig:RightHand"
  | "mixamorig:LeftHand";

export interface StudioVarco3dMultiviewTurnaround {
  readonly taskId: string;
  readonly frontPath: string;
  readonly backPath: string;
  readonly leftPath: string;
  readonly rightPath: string;
}

export interface StudioVarco3dCharacterLabModularItem {
  readonly id: string;
  readonly slot: StudioVarco3dCharacterLabSlot;
  readonly genre: StudioVarco3dWebtoonGenre;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly attachBoneName: StudioVarco3dAttachBoneName;
  readonly referenceImagePath: string;
  readonly multiviewTurnaround: StudioVarco3dMultiviewTurnaround;
  readonly polygonBudget: number;
  readonly pbrRoughness: number;
  readonly pbrMetallic: number;
}

export interface StudioVarco3dCharacterArchetypeEntry {
  readonly id: string;
  readonly labelKo: string;
  readonly genre: StudioVarco3dWebtoonGenre;
  readonly headTallRatio: number;
  readonly referenceImagePath: string;
  readonly meshTaskId: string;
  readonly rigTaskId: string | null;
}

export interface StudioVarco3dIsometricDioramaEntry {
  readonly id: string;
  readonly labelKo: string;
  readonly genre: StudioVarco3dWebtoonGenre;
  readonly referenceImagePath: string;
  readonly meshTaskId: string;
  readonly cameraFovDeg: number;
  readonly cameraElevationDeg: number;
  readonly cameraAzimuthDeg: number;
  readonly ambientKelvin: number;
}

export type StudioVarco3dPropCategory =
  | "school"
  | "street"
  | "traditional"
  | "vehicle"
  | "interior";

export interface StudioVarco3dWebtoonPropEntry {
  readonly id: string;
  readonly labelKo: string;
  readonly category: StudioVarco3dPropCategory;
  readonly referenceImagePath: string;
  readonly meshTaskId: string;
  readonly footprintMeters: readonly [number, number, number];
}

export const STUDIO_VARCO3D_CLOUD_BASE_URL = "https://3d.varco.ai" as const;
export const STUDIO_VARCO3D_ACTIVE_FLOW_ID = "70a90b59-8678-4d35-a5f1-4d1ea39195a7" as const;

const MV_SET_A = {
  backPath: "/api/objects/8b23d71cda5b9b8fb0c466e8962cfe4b.png",
  leftPath: "/api/objects/07f7044d3bb661a4059eb6019de69d3c.png",
  rightPath: "/api/objects/54fb417e408722a409c9ebfba769ac0f.png",
} as const;

const MV_SET_B = {
  backPath: "/api/objects/dde18bc5536fb96025dbd6fa43ac068f.png",
  leftPath: "/api/objects/95cb31cf3d9ce50e9ef78e61d64ff451.png",
  rightPath: "/api/objects/fb5b1cf517fb740a38e400515eaf9f48.png",
} as const;

function defineModularItem(
  id: string,
  slot: StudioVarco3dCharacterLabSlot,
  genre: StudioVarco3dWebtoonGenre,
  labelKo: string,
  labelEn: string,
  attachBoneName: StudioVarco3dAttachBoneName,
  referenceHash: string,
  taskId: string,
  frontHash: string,
  mvSet: typeof MV_SET_A | typeof MV_SET_B,
  polygonBudget: number,
  pbrRoughness: number,
  pbrMetallic: number,
): StudioVarco3dCharacterLabModularItem {
  return {
    id,
    slot,
    genre,
    labelKo,
    labelEn,
    attachBoneName,
    referenceImagePath: `/api/objects/${referenceHash}.png`,
    multiviewTurnaround: {
      taskId,
      frontPath: `/api/objects/${frontHash}.png`,
      ...mvSet,
    },
    polygonBudget,
    pbrRoughness,
    pbrMetallic,
  };
}

export const STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS: readonly StudioVarco3dCharacterLabModularItem[] =
  Object.freeze([
    defineModularItem("charlab_wig_idol_twintails", "head-hair", "daily-school", "아이돌 리본 트윈테일 가발", "K-Pop Idol Ribbon Twin-Tails Wig", "mixamorig:Head", "806ccb1e7afbfe4701983a0f2249bc71", "2aeb993c-4d7b-4ee3-bd02-fe1103c1288a", "3e46113ff7e0439ceddc0c12604d8b91", MV_SET_A, 18500, 0.42, 0.05),
    defineModularItem("charlab_wig_male_wolfcut", "head-hair", "daily-school", "남주 시스루 울프컷 가발", "Male Lead Layered Wolf-Cut Wig", "mixamorig:Head", "ee921d48b14a0b34fd8ab74d4262a2e8", "a2b43c76-68eb-401b-8391-cc904a150ddf", "ee921d48b14a0b34fd8ab74d4262a2e8", MV_SET_A, 14200, 0.48, 0.04),
    defineModularItem("charlab_wig_rofan_hime_wave", "head-hair", "romance-fantasy", "로판 황녀 진주 히메웨이브 가발", "Rofan Noblewoman Pearl Hime-Wave Wig", "mixamorig:Head", "7af8249b7dcc90c35afe5d82e9b55bd0", "f18a1134-2161-40a1-a1d4-d1a080cb8d53", "741a9a3f7fdef6f86c574d3f000b8d20", MV_SET_B, 22400, 0.36, 0.12),
    defineModularItem("charlab_wig_murim_jade_ponytail", "head-hair", "murim", "무림 옥관 하이 포니테일 가발", "Murim Jade-Crown High Ponytail Wig", "mixamorig:Head", "9e085568815e25db4c4db344d55c2a7f", "95f54a99-c8c2-4f0a-9730-dcf98f233b68", "9e085568815e25db4c4db344d55c2a7f", MV_SET_B, 19600, 0.4, 0.18),
    defineModularItem("charlab_wig_cyber_neon_bob", "head-hair", "cyberpunk", "사이버펑크 네온 옴브레 단발 가발", "Cyberpunk Neon Ombre Asymmetric Bob", "mixamorig:Head", "e5d5f69d367beefd139c6b69c80161fb", "a862bf36-157c-41f2-a682-9a90f09592b8", "e5d5f69d367beefd139c6b69c80161fb", MV_SET_A, 15800, 0.32, 0.25),
    defineModularItem("charlab_outfit_school_blazer", "outfit-set", "daily-school", "네이비 금장 블레이저 교복 세트", "High School Navy Gold-Crest Blazer Uniform", "mixamorig:Spine2", "94d3dc20098ebfbf39be2105c8c68b30", "1ce18023-8e57-4ffc-99c6-a7dac55df00e", "94d3dc20098ebfbf39be2105c8c68b30", MV_SET_B, 34000, 0.65, 0.1),
    defineModularItem("charlab_outfit_rofan_crimson_gown", "outfit-set", "romance-fantasy", "로판 황실 크림슨 금사 자수 드레스", "Rofan Imperial Crimson & Gold Ballgown", "mixamorig:Spine2", "d854a2a7f870fc68c1ca858678ded295", "6283a372-9b58-4ba5-bf2f-3cb551282423", "d854a2a7f870fc68c1ca858678ded295", MV_SET_A, 48000, 0.38, 0.35),
    defineModularItem("charlab_outfit_northern_duke_cape", "outfit-set", "romance-fantasy", "북부대공 흑은 모피 하프케이프 제복", "Northern Grand Duke Fur-Collar Cape Uniform", "mixamorig:Spine2", "76a4e574d95baba1075279c33e3a7815", "2cc94d41-9454-43e1-902c-aea80a033826", "76a4e574d95baba1075279c33e3a7815", MV_SET_B, 44500, 0.45, 0.42),
    defineModularItem("charlab_outfit_murim_mount_hua_robe", "outfit-set", "murim", "화산파 매화 자수 도포 & 가죽완갑", "Mount Hua Sect Plum-Blossom Martial Robe", "mixamorig:Spine2", "ae7dd076e5d0673ffbd55bf6df7092f7", "f06c0148-7e74-4a7b-a585-caa418d35335", "ae7dd076e5d0673ffbd55bf6df7092f7", MV_SET_A, 39200, 0.54, 0.16),
    defineModularItem("charlab_outfit_hunter_raid_armor", "outfit-set", "hunter-action", "S급 헌터 마나코어 전술 레이드 아머", "S-Rank Hunter Mana-Core Tactical Raid Armor", "mixamorig:Spine2", "701f221dcb19d4cb240b872e83c24cd5", "50c8e464-8251-402a-adcd-a194905bc661", "701f221dcb19d4cb240b872e83c24cd5", MV_SET_B, 46800, 0.28, 0.68),
    defineModularItem("charlab_outfit_cyber_techwear", "outfit-set", "cyberpunk", "사이버펑크 홀로그램 크롭 테크웨어", "Cyberpunk Holographic Cropped Techwear Set", "mixamorig:Spine2", "e6575e70a79a3501c113022a99993a98", "166ebd71-45f7-48da-81a3-c532317336ee", "e6575e70a79a3501c113022a99993a98", MV_SET_A, 37400, 0.34, 0.44),
    defineModularItem("charlab_outfit_joseon_royal_durumagi", "outfit-set", "joseon-historical", "조선 왕실 금박 운문단 두루마기 한복", "Joseon Royal Indigo-Gold Embroidered Durumagi", "mixamorig:Spine2", "66e0b34cf3d74b7438b47396116ef601", "466dc073-ce2a-42ad-8663-d5928eef2c26", "66e0b34cf3d74b7438b47396116ef601", MV_SET_B, 41200, 0.46, 0.24),
    defineModularItem("charlab_acc_rofan_ruby_tiara", "head-accessory", "romance-fantasy", "로판 황실 루비 필리그리 티아라", "Rofan Imperial Ruby & Diamond Filigree Tiara", "mixamorig:Head", "bee45fccc3ba5f313e10996dc8a0c526", "8acd6d9b-a002-4ddf-98d1-e97e5850f85f", "bee45fccc3ba5f313e10996dc8a0c526", MV_SET_A, 12400, 0.16, 0.88),
    defineModularItem("charlab_weapon_paladin_greatsword", "weapon-r", "romance-fantasy", "성기사 태양문양 사파이어 대검", "Holy Paladin Sunburst Sapphire Greatsword", "mixamorig:RightHand", "20f9bce509fc742e8c0921f095610a61", "ccf99460-4932-4715-9f9c-807e5b19aa0d", "20f9bce509fc742e8c0921f095610a61", MV_SET_B, 16800, 0.2, 0.85),
    defineModularItem("charlab_weapon_shadow_twin_daggers", "weapon-l", "hunter-action", "S급 그림자 암살자 마나 쌍단검", "S-Rank Shadow Assassin Purple-Mana Twin Daggers", "mixamorig:LeftHand", "e32ce5fc0542c1a0359595e3a325c86b", "b32d0a49-3493-4ec3-adda-5ced0e7f2e3d", "e32ce5fc0542c1a0359595e3a325c86b", MV_SET_A, 14500, 0.24, 0.78),
    defineModularItem("charlab_weapon_archmage_astrolabe_staff", "weapon-r", "romance-fantasy", "대마법사 아스트롤라베 마나 지팡이", "Archmage Celestial Astrolabe Mana Staff", "mixamorig:RightHand", "4b3eb0b40ddcb09920d3659337d53c25", "1fed16d7-0095-435c-afac-a813cf9c5024", "4b3eb0b40ddcb09920d3659337d53c25", MV_SET_B, 19200, 0.22, 0.82),
    defineModularItem("charlab_weapon_murim_jade_sword", "weapon-r", "murim", "무림 천옥 청련 장검 & 검집", "Murim Heavenly Jade Longsword & Scabbard", "mixamorig:RightHand", "a5548b2902988ca642a569103f149419", "6e9e77f6-1f06-4862-9c15-8002da188eb9", "a5548b2902988ca642a569103f149419", MV_SET_A, 15600, 0.26, 0.74),
    defineModularItem("charlab_acc_cyber_ar_visor", "head-accessory", "cyberpunk", "사이버펑크 네온 HUD 전술 바이저 헤드셋", "Cyberpunk Neon HUD Tactical AR Visor Headset", "mixamorig:Head", "54730ecf1c2444d6f49e8cf866c5548d", "932b0c67-4e0b-4eb0-a5fe-ab1e9d9a4784", "54730ecf1c2444d6f49e8cf866c5548d", MV_SET_B, 11800, 0.18, 0.64),
    defineModularItem("charlab_wings_archangel_six", "back-wings", "romance-fantasy", "대천사 순백 금빛 깃털 날개 파츠", "Archangel White & Gold Feathered Back Wings", "mixamorig:Spine2", "802f2f89f30b3413913c0cc7d755fc64", "f3cee0b5-3e72-4bd5-a226-3dd1ed0e7432", "802f2f89f30b3413913c0cc7d755fc64", MV_SET_A, 28400, 0.44, 0.22),
    defineModularItem("charlab_wings_demon_lord_dragon", "back-wings", "hunter-action", "마왕 흑요석 홍염 드래곤 날개 파츠", "Demon Lord Obsidian & Crimson Vein Dragon Wings", "mixamorig:Spine2", "1667a5abc941d0f813bf02dc3068961c", "df4fed16-d540-496d-83bc-05627475ee87", "1667a5abc941d0f813bf02dc3068961c", MV_SET_B, 29600, 0.35, 0.38),
  ]);

function defineArchetype(
  id: string,
  labelKo: string,
  genre: StudioVarco3dWebtoonGenre,
  headTallRatio: number,
  referenceHash: string,
  meshTaskId: string,
  rigTaskId: string | null = null,
): StudioVarco3dCharacterArchetypeEntry {
  return {
    id,
    labelKo,
    genre,
    headTallRatio,
    referenceImagePath: `/api/objects/${referenceHash}.png`,
    meshTaskId,
    rigTaskId,
  };
}

export const STUDIO_VARCO3D_RIGGED_CHARACTER_ARCHETYPES: readonly StudioVarco3dCharacterArchetypeEntry[] =
  Object.freeze([
    defineArchetype("char_highschool_girl_rigged", "한국 웹툰 여고생 (T-Pose · AI 리깅 완료)", "daily-school", 8.0, "83e0247dc5636b3c8fe7db6cfa7aa8a9", "dc1a5579-9c94-43b3-be49-c4159a84edf7", "51d4a5fb-2e12-40ad-a049-c2fc20f61f3c"),
    defineArchetype("char_shounen_student_rigged", "소년만화 남학생 (AI 리깅 완료)", "daily-school", 7.5, "07aa3fdac972234b60b42bd4ca75a0be", "45a2e66c-6947-4ef0-80ee-ec7c95dc0f02", "bd6ef160-d335-4435-b28f-610479d4e5a0"),
    defineArchetype("char_highschool_boy_hoodie_rigged", "웹툰 남고생 후드 교복 (AI 리깅 완료)", "daily-school", 8.0, "118b31c63cb88ea558735899bf4e9a63", "d6eade4c-d82e-4556-bc07-b0bd307c5522", "c14f6faa-eb75-46aa-8687-bc77023c6c61"),
    defineArchetype("char_gym_uniform_girl_rigged", "학교 체육복 여학생 (AI 리깅 완료)", "daily-school", 7.5, "3e6ef54f70300f66fd567770e101c7fc", "6452d3b6-1359-4b1b-910b-18a8fc98f220", "fd9861e7-598c-4484-b1c5-58df92cc7211"),
    defineArchetype("char_office_worker_male_rigged", "오피스 웹툰 남성 직장인 (AI 리깅 완료)", "daily-school", 8.5, "b849ef0d16d887e03f26cb637ca98a93", "4efdc990-883f-44a8-9cc8-4209cc22959d", "55d6f514-6b3e-4eb6-b022-2df140b4ec26"),
    defineArchetype("char_office_worker_female_rigged", "오피스 웹툰 여성 직장인 (AI 리깅 완료)", "daily-school", 8.0, "5ff731a0f182e2ca3722b7d50f3cb1df", "b3c90753-0d1c-4347-98b0-fb99cb71c229", "247b9304-953a-4747-8483-53fb128c5c8b"),
    defineArchetype("char_street_fashion_male_rigged", "스트릿 캐주얼 청년 (AI 리깅 완료)", "daily-school", 8.0, "a909d67a6b267fd857b4ca96e6271739", "4058d121-2bc2-46c2-96d2-7cd3c15cd87a", "a429b13e-8d14-4d00-93bf-77d64602ef82"),
    defineArchetype("char_street_fashion_female_rigged", "스트릿 캐주얼 여성 (AI 리깅 완료)", "daily-school", 8.0, "354a869ad4aa0b8ab4a17e7902181137", "955737d0-94ec-48c4-9431-5ab58f254f02", "a6e7c619-6c5f-4ff2-8873-bc76c6e18f82"),
    defineArchetype("char_barista_woman_rigged", "카페 바리스타 여성 (AI 리깅 완료)", "daily-school", 7.5, "69f67757d2a167905ff3c1b0c46be814", "7e638b8d-443c-44aa-9b63-6e9eb8cf4dc5", "3038503c-6d86-45a3-9775-18d21872cc67"),
    defineArchetype("char_convenience_clerk_rigged", "편의점 알바생 청년 (AI 리깅 완료)", "daily-school", 8.0, "6c4a47e01639b1cf70fd2cf8d3c99c8c", "6299583d-b9bd-4c9a-9f88-589f8cd5cf4a", "5de8a259-0f69-4138-8884-8f36df23bf12"),
    defineArchetype("char_kpop_idol_female_rigged", "K-POP 여자 아이돌 무대의상 (AI 리깅 완료)", "daily-school", 8.5, "22e31ceabaee7e9a3fb31fc924112f1d", "4cb7056d-401c-4bd0-9a91-a214c7034cf8", "48ec3d05-88cf-4bd6-97fd-bf5a905cf334"),
    defineArchetype("char_kpop_idol_male_rigged", "K-POP 남자 아이돌 무대의상 (AI 리깅 완료)", "daily-school", 8.5, "1f8cf972c0d01730b8df021bc5978d99", "b57c3d93-95c8-4528-887b-910b95cf8bf9", "95ef6349-9072-415d-a583-e78bf864c45c"),
    defineArchetype("char_student_council_president", "학생회장 여고생 (레퍼런스 아키타입 cd1e75d3)", "daily-school", 8.0, "a54047a0d6412361f0b56d9eb3cb2302", "cd1e75d3-5efa-4f46-afb6-59920e080fb7"),
    defineArchetype("char_rofan_northern_grand_duke", "로판 북부대공 남주인공 (8.5등신)", "romance-fantasy", 8.5, "66c49d14c88488c1a9f10bc7fd981928", "15a993cd-e4f2-417c-9bea-b5c677000701"),
    defineArchetype("char_rofan_villainess_empress", "로판 악녀 황후 여주인공 (8등신)", "romance-fantasy", 8.0, "303605d34e6fc04d378cb0338818c37a", "5b199d6b-8cae-4dca-9b69-35c09e0bfd3f"),
    defineArchetype("char_hunter_shadow_necromancer", "S급 그림자 군주 네크로맨서 헌터", "hunter-action", 8.5, "baa34553a21fbc32ef95758705e1a036", "39565bf9-5041-4402-98c1-44df3b155b14"),
    defineArchetype("char_murim_mount_hua_sword_saint", "화산파 매화검존 청년 무사", "murim", 8.5, "9079215875dc7ab024d277cb60b67d75", "239dce29-7f4b-4b64-9a8d-7781c2e78102"),
    defineArchetype("char_murim_heavenly_demon", "천마신교 교주 (9등신 무림 절대자)", "murim", 9.0, "a89b041976e2eb400f3c6a0993e86187", "53c04675-8722-4157-88ef-72185c914209"),
    defineArchetype("char_magical_girl_starlight_idol", "마법소녀 스타라이트 아이돌", "romance-fantasy", 7.5, "5457be2365ac10c559f3c37f432c805e", "a858bce1-b921-4d04-a2e0-a8db046f74a8"),
    defineArchetype("char_apocalypse_scout_girl", "아포칼립스 생존 정찰병 소녀", "hunter-action", 8.0, "c4462cdf5caef5886ab2d94e61573026", "e09ccaaf-8f58-4c39-bae5-574c0e99c146"),
    defineArchetype("char_royal_academy_alchemist", "왕립 아카데미 연금술사 소년", "romance-fantasy", 7.0, "656ab3bf8700bd7669573ef4fb8d218a", "a53e5264-281b-4729-88cb-9146c2d73920"),
    defineArchetype("char_chibi_azure_dragon_mascot", "SD 치비 청룡 신수 마스코트 (2.5등신)", "romance-fantasy", 2.5, "02d4a5f9939278a4e9358d915c26706f", "230cff6a-266b-4453-99ab-c9e356f77f4e"),
    defineArchetype("char_chibi_ninetail_spirit_fox", "SD 치비 백구미호 영수 마스코트 (2.5등신)", "murim", 2.5, "4be5070e39a6d85b0c0154df9b8853a6", "e0a6ec91-319f-491b-94cf-5714c99e7104"),
  ]);

function defineDiorama(
  id: string,
  labelKo: string,
  genre: StudioVarco3dWebtoonGenre,
  referenceHash: string,
  meshTaskId: string,
  cameraFovDeg: number,
  cameraElevationDeg: number,
  cameraAzimuthDeg: number,
  ambientKelvin: number,
): StudioVarco3dIsometricDioramaEntry {
  return {
    id,
    labelKo,
    genre,
    referenceImagePath: `/api/objects/${referenceHash}.png`,
    meshTaskId,
    cameraFovDeg,
    cameraElevationDeg,
    cameraAzimuthDeg,
    ambientKelvin,
  };
}

export const STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES: readonly StudioVarco3dIsometricDioramaEntry[] =
  Object.freeze([
    defineDiorama("diorama_school_hallway", "한국 고등학교 복도 아이소메트릭 디오라마", "daily-school", "50ba0888a46c04f1cf6f32d18932805b", "0c2f14f6-81a2-49a9-9f43-6582a10f9d12", 32, 30, 45, 5400),
    defineDiorama("diorama_school_rooftop", "학교 옥상 펜스 & 물탱크 디오라마", "daily-school", "2b9d8ac495e8246bc01f37fd0332b098", "c7a9eae5-43f1-4628-9214-75a8e4159c03", 35, 28, 40, 5800),
    defineDiorama("diorama_subway_car", "한국 지하철 객차 내부 디오라마", "daily-school", "e0a2cff4eb46b80d22d5742c3362f042", "849cf93f-65b4-4091-81a9-45c17d208b19", 30, 26, 35, 4800),
    defineDiorama("diorama_modern_cafe", "모던 브런치 카페 인테리어 디오라마", "daily-school", "3aa29161d2457089c5605cf3a4489a31", "37b095e1-92d8-4a15-82c4-56e391b74a22", 34, 32, 45, 3800),
    defineDiorama("diorama_studio_oneroom", "한국 자취방 원룸 오피스텔 디오라마", "daily-school", "41b54ee4e8fe519a67546958e3336339", "9b87979c-14c7-4789-9305-81f62e390d41", 34, 34, 45, 4200),
    defineDiorama("diorama_residential_alley", "한국 주택가 골목길 전신주 디오라마", "daily-school", "2412715fe590e3c6b922d73109033568", "c264ea1e-53a2-4982-8410-29d764e18f54", 36, 28, 50, 4600),
    defineDiorama("diorama_joseon_palace_hall", "조선 궁궐 근정전 어좌 대전 디오라마", "joseon-historical", "e7f1740a5f9d87100c9f9e52a16748a8", "4bc4a1f9-77d1-4285-9a21-38c491f07e62", 32, 30, 45, 4900),
    defineDiorama("diorama_traditional_market", "한국 전통시장 먹자골목 디오라마", "daily-school", "16883f7240cf83e980909850c5742f92", "df9ed57c-62b8-4510-89c3-14e872a65d90", 35, 30, 42, 3900),
    defineDiorama("diorama_hospital_room", "대학병원 입원실 병동 디오라마", "daily-school", "f6b6a6eee22c4a39543912b386796340", "23a95cce-81c4-4472-95b1-67f283e19a04", 32, 32, 45, 5600),
    defineDiorama("diorama_open_office", "현대 오픈플랜 IT 오피스 디오라마", "daily-school", "6162d26ef0042f12895524831f47c132", "6d5c00cc-39a7-4812-8b45-92e174c38f11", 33, 32, 45, 5200),
    defineDiorama("diorama_pc_bang", "한국 게이밍 PC방 네온 부스 디오라마", "cyberpunk", "77fdb40cdde73105069e8eb4731103c5", "345fd5e0-28b9-4163-9c54-71d293a48e25", 34, 30, 45, 6200),
    defineDiorama("diorama_school_gymnasium", "학교 실내 체육관 농구코트 디오라마", "daily-school", "efacc87de3a40219c6c563689d2f2278", "747b7a6e-91c2-4387-8d65-43f182b59c36", 36, 28, 45, 5300),
    defineDiorama("diorama_rofan_imperial_ballroom", "로판 황궁 대연회장 샹들리에 디오라마", "romance-fantasy", "a982215c44b3c02b8e858384a207671f", "ce0bcc22-7165-4a96-bc0c-a63e781b8a5f", 32, 30, 45, 3600),
    defineDiorama("diorama_hunter_boss_dungeon", "헌터물 고대 보스 던전 마나 제단 디오라마", "hunter-action", "8f20d69ac90754909ef20b47c8e99e81", "4d0e4ba6-d605-4040-ae11-8edc0b4866ff", 35, 32, 40, 6800),
    defineDiorama("diorama_murim_sect_courtyard", "무림 문파 연무장 청기와 정원 디오라마", "murim", "6a1ecc4bd9ac5a525f6127c727e11f3c", "27aea6e2-8196-4c7c-b38f-0e5101046f0e", 34, 30, 45, 5100),
    defineDiorama("diorama_cyberpunk_neon_alley", "사이버펑크 네온 야시장 골목 디오라마", "cyberpunk", "14cde21eccd006684f0d87846c6d0728", "7cc772c3-f322-4245-ac73-fe1cd30e071c", 35, 28, 48, 6500),
    defineDiorama("diorama_webtoon_creator_studio", "웹툰 작가 작업실 신티크 데스크 디오라마", "daily-school", "14cd6e61d3b37468484f39757766702b", "c98fd946-bf65-43fc-aeb2-382e2c293faa", 32, 34, 45, 4400),
    defineDiorama("diorama_chaebol_penthouse", "재벌 3세 럭셔리 펜트하우스 라운지 디오라마", "daily-school", "b61d8948b90b41d46e837356e5727488", "5e4c1fde-f1f2-4e15-9dfd-e727d8a19588", 32, 30, 45, 4100),
    defineDiorama("diorama_magic_academy_library", "판타지 마법 아카데미 원형 서고 디오라마", "romance-fantasy", "fe9c85182ad26a217a10602460949d65", "6d11aabf-a748-4d66-9f8b-df44bd950d0d", 34, 32, 45, 3900),
    defineDiorama("diorama_convenience_store_patio", "한국 편의점 야외 파라솔 테라스 디오라마", "daily-school", "5210a536b6e83287414708c7a9519707", "5089738c-4bee-4c01-864f-57fb1c45c5a5", 34, 30, 45, 5000),
    defineDiorama("diorama_kpop_concert_stage", "K-POP 음악방송 LED 콘서트 스테이지 디오라마", "cyberpunk", "66504bb7f3dc1e5a12361f097f31263c", "a56ece96-e303-486a-80d4-7102113c1a3e", 36, 26, 45, 6400),
    defineDiorama("diorama_apocalypse_overpass_camp", "아포칼립스 붕괴 고가도로 생존캠프 디오라마", "hunter-action", "2901bdda3e53075049689a38b7f400c3", "8ff24877-e73a-44c9-872f-1d52eb7630c4", 35, 30, 42, 4700),
  ]);

function defineProp(
  id: string,
  labelKo: string,
  category: StudioVarco3dPropCategory,
  referenceHash: string,
  meshTaskId: string,
  footprintMeters: readonly [number, number, number],
): StudioVarco3dWebtoonPropEntry {
  return {
    id,
    labelKo,
    category,
    referenceImagePath: `/api/objects/${referenceHash}.png`,
    meshTaskId,
    footprintMeters,
  };
}

export const STUDIO_VARCO3D_WEBTOON_PROP_ASSETS: readonly StudioVarco3dWebtoonPropEntry[] =
  Object.freeze([
    defineProp("prop_school_desk_chair", "한국 학교 교실 책걸상 세트", "school", "236c37280302579207b8097023e08f41", "bd873629-42a1-48f0-9c12-34e871b29a01", [0.7, 0.8, 0.78]),
    defineProp("prop_school_steel_lockers", "교실 후면 3연동 철제 사물함", "school", "5fbe2cbda772b0f6b977234828397a4f", "b3abd7a9-51c2-49a1-8d23-45f982c30b12", [1.2, 0.5, 1.85]),
    defineProp("prop_commuter_bicycle", "통학용 바구니 시티 자전거", "vehicle", "ce91957bb1328d708045201053937258", "ee849e81-62d3-40b2-9e34-56a093d41c23", [1.75, 0.58, 1.05]),
    defineProp("prop_bus_stop_shelter", "한국 도심 유리 버스정류장 쉘터", "street", "a774f6337e36b70006825c245983599a", "505d8db5-73e4-41c3-8f45-67b104e52d34", [3.6, 1.6, 2.5]),
    defineProp("prop_street_lamp_post", "가로수길 아치형 가로등", "street", "fbb9d34263c277694b457b428024831e", "be230e27-84f5-42d4-9a56-78c215f63e45", [0.6, 0.6, 4.2]),
    defineProp("prop_wooden_park_bench", "공원 주물 팔걸이 원목 벤치", "street", "bf7e7087fb11b9342423438982834b85", "fbf08650-95a6-43e5-8b67-89d326a74f56", [1.6, 0.68, 0.82]),
    defineProp("prop_hanok_main_gate", "전통 한옥 기와 솟을대문", "traditional", "255da29a95d220832888121f87b47c2b", "a95ceae8-06b7-44f6-9c78-90e437b85a67", [3.4, 1.4, 3.2]),
    defineProp("prop_red_torii_gate", "신사 붉은 도리이 게이트", "traditional", "dfc22982f915472818916645172185c5", "916f6c64-17c8-45a7-8d89-01f548c96b78", [3.2, 0.8, 3.6]),
    defineProp("prop_cherry_blossom_tree", "만개한 봄 벚꽃나무", "street", "19cfd6810eba809641098468831802f7", "3df3abe1-28d9-46b8-9e90-12a659d07c89", [3.8, 3.8, 4.5]),
    defineProp("prop_autumn_ginkgo_tree", "가을 황금빛 은행나무", "street", "b8a767b7003152142624322253907323", "801f6534-39e0-47c9-8f01-23b760e18d90", [3.5, 3.5, 4.8]),
    defineProp("prop_apartment_keypad_door", "한국 아파트 디지털 도어락 현관문", "interior", "a93aada71ee5b9703667562802483365", "562955f7-40f1-48d0-9a12-34c871f29e01", [1.05, 0.18, 2.15]),
    defineProp("prop_convenience_snack_shelf", "편의점 진열 매대 (과자·음료)", "interior", "89f3c54f1fbc20105396045848636619", "94510582-51a2-49e1-8b23-45d982a30f12", [1.4, 0.55, 1.75]),
    defineProp("prop_pojangmacha_cart", "한국 포장마차 주황 천막 리어카", "street", "c298c5584f4b67181938840702762246", "5afa06f9-62b3-40f2-9c34-56e093b41a23", [2.6, 1.9, 2.3]),
    defineProp("prop_city_bus", "한국 시내버스 차량", "vehicle", "3c39f448aa7f95830286307500733902", "bb48e190-73c4-41a3-8d45-67f104c52b34", [9.2, 2.45, 3.1]),
    defineProp("prop_yellow_sedan_taxi", "도심 영업용 세단 택시", "vehicle", "d3c4ab748b6910326384705204200926", "37585d0f-84d5-42b4-9e56-78a215d63c45", [4.75, 1.84, 1.48]),
    defineProp("prop_white_hatchback_car", "화이트 컴팩트 해치백 승용차", "vehicle", "535c031e3ef663413610821258217397", "81d2684c-95e6-43c5-8f67-89b326e74d56", [4.15, 1.78, 1.52]),
    defineProp("prop_delivery_scooter", "배달통 장착 배달 스쿠터 오토바이", "vehicle", "df32d6b92e7779033319956615199015", "a1372bdf-06f7-44d6-9a78-90c437f85e67", [1.92, 0.72, 1.15]),
    defineProp("prop_cafe_table_set", "카페 원목 원형 테이블 & 의자 2석 세트", "interior", "8297995ab2f277125052687733325107", "9cbf89da-17a8-45e7-8b89-01d548a96f78", [1.5, 0.9, 0.76]),
    defineProp("prop_teal_fabric_sofa", "거실 3인용 틸 패브릭 소파", "interior", "ff0f8a8ad8b882723641335318455078", "5a3302a8-28b9-46f8-9c90-12e659b07a89", [2.1, 0.92, 0.84]),
    defineProp("prop_wooden_single_bed", "원룸 원목 프레임 싱글 침대", "interior", "b6be6151912339711101319196215145", "e37235e6-39c0-47a9-8d01-23f760c18b90", [1.05, 2.08, 0.88]),
    defineProp("prop_dual_monitor_office_desk", "듀얼 모니터 오피스 데스크 세트", "interior", "f71b4299f96f24921849982499562800", "24bf4272-40d1-48b0-9e12-34a871d29c01", [1.4, 0.75, 1.18]),
  ]);

export interface StudioVarco3dCharacterLabLoadoutSummary {
  readonly archetype: StudioVarco3dCharacterArchetypeEntry;
  readonly equippedItems: readonly StudioVarco3dCharacterLabModularItem[];
  readonly totalPolygonBudget: number;
  readonly attachedBones: readonly string[];
  readonly genreSynergyScore: number;
  readonly primaryTurnaround: StudioVarco3dMultiviewTurnaround | null;
}

export function resolveVarco3dTurnaroundViewUrl(
  turnaround: StudioVarco3dMultiviewTurnaround,
  angle: StudioVarco3dTurnaroundAngle,
): string {
  const pathByAngle: Record<StudioVarco3dTurnaroundAngle, string> = {
    front: turnaround.frontPath,
    back: turnaround.backPath,
    left: turnaround.leftPath,
    right: turnaround.rightPath,
  };
  return `${STUDIO_VARCO3D_CLOUD_BASE_URL}${pathByAngle[angle]}`;
}

export function composeVarco3dCharacterLabLoadout(input: {
  readonly archetypeId: string;
  readonly itemIds: readonly string[];
}): StudioVarco3dCharacterLabLoadoutSummary {
  const archetype =
    STUDIO_VARCO3D_RIGGED_CHARACTER_ARCHETYPES.find((entry) => entry.id === input.archetypeId) ??
    STUDIO_VARCO3D_RIGGED_CHARACTER_ARCHETYPES[0]!;

  const bySlot = new Map<StudioVarco3dCharacterLabSlot, StudioVarco3dCharacterLabModularItem>();
  for (const itemId of input.itemIds) {
    const item = STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS.find((entry) => entry.id === itemId);
    if (item) {
      bySlot.set(item.slot, item);
    }
  }

  const equippedItems = [...bySlot.values()];
  const baseCharacterPolygons = 65000;
  const totalPolygonBudget = equippedItems.reduce(
    (sum, item) => sum + item.polygonBudget,
    baseCharacterPolygons,
  );
  const attachedBones = [...new Set(equippedItems.map((item) => item.attachBoneName))];
  const matchingGenreCount = equippedItems.filter((item) => item.genre === archetype.genre).length;
  const genreSynergyScore =
    equippedItems.length === 0
      ? 100
      : Math.round(60 + (matchingGenreCount / equippedItems.length) * 40);

  return {
    archetype,
    equippedItems,
    totalPolygonBudget,
    attachedBones,
    genreSynergyScore,
    primaryTurnaround: equippedItems[0]?.multiviewTurnaround ?? null,
  };
}

export interface StudioVarco3dDioramaPlacementPlan {
  readonly diorama: StudioVarco3dIsometricDioramaEntry;
  readonly props: readonly StudioVarco3dWebtoonPropEntry[];
  readonly totalFootprintAreaSqMeters: number;
  readonly recommendedShadowBias: number;
  readonly varcoAssetPortalUrl: string;
}

export function evaluateVarco3dDioramaScenePlacement(input: {
  readonly dioramaId: string;
  readonly propIds: readonly string[];
}): StudioVarco3dDioramaPlacementPlan {
  const diorama =
    STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES.find((entry) => entry.id === input.dioramaId) ??
    STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES[0]!;

  const props = input.propIds
    .map((propId) => STUDIO_VARCO3D_WEBTOON_PROP_ASSETS.find((entry) => entry.id === propId))
    .filter((entry): entry is StudioVarco3dWebtoonPropEntry => Boolean(entry));

  const totalFootprintAreaSqMeters = Number(
    props
      .reduce((sum, prop) => sum + prop.footprintMeters[0] * prop.footprintMeters[1], 0)
      .toFixed(2),
  );

  return {
    diorama,
    props,
    totalFootprintAreaSqMeters,
    recommendedShadowBias: diorama.cameraElevationDeg >= 32 ? -0.0004 : -0.0006,
    varcoAssetPortalUrl: `${STUDIO_VARCO3D_CLOUD_BASE_URL}/myAssets/${diorama.meshTaskId}`,
  };
}
