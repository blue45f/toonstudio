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
    defineArchetype("char_shounen_student_rigged", "소년만화 남학생 (AI 리깅 완료)", "daily-school", 7.5, "07aa3fdac972cee5e5110e41bdf0b3c3", "45a2e66c-4e1d-4396-8cfc-a3b69b8b68e5", "bd6ef160-8005-4446-a34d-cd0497e5e2c5"),
    defineArchetype("char_highschool_boy_hoodie_rigged", "웹툰 남고생 후드 교복 (AI 리깅 완료)", "daily-school", 8.0, "118b31c63cb802ef53334fb21271c353", "d6eade4c-8c73-44c2-97fc-9b443f3ec8d0", "c14f6faa-e217-4ca5-923f-1c9f5fae01f3"),
    defineArchetype("char_gym_uniform_girl_rigged", "학교 체육복 여학생 (AI 리깅 완료)", "daily-school", 7.5, "3e6ef54f70305dae6d902e22a4b99e96", "6452d3b6-f756-4f83-8ae2-0520dcf60833", "fd9861e7-d0c1-473e-bc5d-f3e5d30f841a"),
    defineArchetype("char_office_worker_male_rigged", "오피스 웹툰 남성 직장인 (AI 리깅 완료)", "daily-school", 8.5, "b849ef0d16d8fad2b668e1f096e205d9", "4efdc990-26bf-4148-912c-35a605a57d2d", "55d6f514-1c3d-4df5-ab3a-f2758fb6b1f2"),
    defineArchetype("char_office_worker_female_rigged", "오피스 웹툰 여성 직장인 (AI 리깅 완료)", "daily-school", 8.0, "5ff731a0f1820f2a26858bb68d965d6c", "b3c90753-f085-4c73-a395-f79c772a9ed3", "247b9304-ca0f-4906-8b32-cd52eaeae33e"),
    defineArchetype("char_street_fashion_male_rigged", "스트릿 캐주얼 청년 (AI 리깅 완료)", "daily-school", 8.0, "a909d67a6b26eeb8a41c976e4eed77e3", "4058d121-72a1-4a2b-9bc7-aa654f2fe80d", "a429b13e-be5e-40c0-b7f0-6f295f2e6ecb"),
    defineArchetype("char_street_fashion_female_rigged", "스트릿 캐주얼 여성 (AI 리깅 완료)", "daily-school", 8.0, "354a869ad4aacd38fa53aba860e11f7d", "955737d0-8f92-472a-b68d-5ec2159aa28d", "a6e7c619-ee3c-4e9c-b82f-852474fbb8c6"),
    defineArchetype("char_barista_woman_rigged", "카페 바리스타 여성 (AI 리깅 완료)", "daily-school", 7.5, "69f67757d2a197c1eb1ba142524142d6", "7e638b8d-c9a0-4802-ad85-c3d8cce15d29", "3038503c-dc63-4103-a22e-c682d7ba95fc"),
    defineArchetype("char_convenience_clerk_rigged", "편의점 알바생 청년 (AI 리깅 완료)", "daily-school", 8.0, "6c4a47e016394e21c4923fe2eefea467", "6299583d-3a1c-4ac9-aa6f-e83557166566", "5de8a259-dc0a-4a29-9319-802a5684a18b"),
    defineArchetype("char_kpop_idol_female_rigged", "K-POP 여자 아이돌 무대의상 (AI 리깅 완료)", "daily-school", 8.5, "22e31ceabaee048334b08c6b18531e11", "4cb7056d-08b1-4200-bf4e-233c61f3da2b", "48ec3d05-58ba-43f7-8731-66304b8cb17a"),
    defineArchetype("char_kpop_idol_male_rigged", "K-POP 남자 아이돌 무대의상 (AI 리깅 완료)", "daily-school", 8.5, "1f8cf972c0d0948f2b35399139a85365", "b57c3d93-2ce6-4b7c-b0c4-20d0d2c51801", "95ef6349-ba6b-49c4-9c82-2042b7ebb146"),
    defineArchetype("char_doctor_male_rigged", "한국 대학병원 남성 의사 (AI 리깅 완료)", "daily-school", 8.5, "042d6fcf17b0eea7cf517b4b453dc14e", "6074e077-4ea3-4a14-ad11-655b55d75ecd", "eb6144b7-08d1-4d60-ada4-04dbee121bf4"),
    defineArchetype("char_nurse_female_rigged", "한국 대학병원 여성 간호사 (AI 리깅 완료)", "daily-school", 8.0, "51c101fc7996e642d6f57e1bdd57e9a0", "e19dc6ea-0366-408b-8b5d-b1d7e0327c69", "5cf2a521-a0dc-407d-a40d-e3502a8c475b"),
    defineArchetype("char_police_officer_male_rigged", "한국 남성 경찰관 제복 (AI 리깅 완료)", "daily-school", 8.5, "605e15e3799c1d0885349ed0a869a1ce", "958eac35-737a-4d1c-bd9d-06ae1996f32b", "6f25f20d-82cf-46cf-8bd9-ca57f7aa1b22"),
    defineArchetype("char_firefighter_female_rigged", "한국 여성 소방관 기동복 (AI 리깅 완료)", "daily-school", 8.0, "ded59b8eb8cbeeeffc67159efdf4589f", "164c81ea-fa97-4c6c-855c-f1efb03cfb84", "9d668e3a-7943-4f3a-a9b3-8c386b5b9f42"),
    defineArchetype("char_anime_chef_male_rigged", "레스토랑 남성 셰프 조리복 (AI 리깅 완료)", "daily-school", 7.5, "9de04f0ab16b2a03086d8bc870d7e091", "2c50b03b-41c7-4e9a-b946-198760520e5c", "2e86ec1b-7373-4f34-b978-a16a9539f552"),
    defineArchetype("char_highschool_teacher_female_rigged", "고등학교 여성 교사 정장 (AI 리깅 완료)", "daily-school", 8.0, "4072dc42d2717f448200ac3a31d3dff1", "de31589a-30e2-43d0-a1d8-b326495ddfe5", "dd0e712e-5d6a-4e11-9f9a-5480706fae9d"),
    defineArchetype("char_elderly_grandfather_rigged", "한국 인자한 할아버지 일상복 (AI 리깅 완료)", "daily-school", 7.5, "89389238df694b2d362198307f198374", "6d8aa4af-087c-456e-9072-4bd31c218ca0", "9bab9b43-36ca-402b-ad4b-6a7557ce5190"),
    defineArchetype("char_elderly_grandmother_rigged", "한국 다정한 할머니 일상복 (AI 리깅 완료)", "daily-school", 7.0, "876b36dd524fc1996fabf1e97a14273b", "0747f009-81f2-4eee-91f3-8fbdc1ec4c01", "84a33d0d-7c33-44c6-b8ab-e6be45607294"),
    defineArchetype("char_chibi_elementary_boy_rigged", "SD 초등학생 남자아이 (AI 리깅 완료)", "daily-school", 4.5, "f65ba87dd37d521ee745c8bffc2d0fb8", "e0a6ec91-946a-4739-af82-bb6fcf10a3a6", "be4e4d04-e33f-4ec6-b4d3-e9d0f0cf21ea"),
    defineArchetype("char_chibi_elementary_girl_rigged", "SD 초등학생 여자아이 (AI 리깅 완료)", "daily-school", 4.5, "6ef850ec78a446ba7a1973b7b81cb613", "0de9cd45-b32e-4605-b107-83f67348c7b9", "eeefd1de-7c1e-4f5c-aba3-e46848f6414f"),
    defineArchetype("char_soccer_player_male_rigged", "스포츠 웹툰 남성 축구선수 (AI 리깅 완료)", "daily-school", 8.0, "167833a4c3f4e54152b035a944159293", "779b1c2e-d20e-41af-91bf-a94b63a07210", "175bcc46-fe7f-41d7-b962-dcbab73353dd"),
    defineArchetype("char_basketball_player_female_rigged", "스포츠 웹툰 여성 농구선수 (AI 리깅 완료)", "daily-school", 7.5, "8739f103fc0ca8622350cf2153e1d5db", "89cc10d0-aa0a-491c-84d5-ff5c754fbe45", "1f4063c6-251e-4586-944a-ce5909896d36"),
    defineArchetype("char_watercolor_village_girl_rigged", "수채화 동화풍 마을 소녀 (AI 리깅 완료)", "romance-fantasy", 7.0, "015f684aa3e3f3a5fd0533f552bc5c29", "50de5e4a-709c-47a1-91d7-b83f848cbb91", "b1ff164e-016c-4f02-aa22-fbcf856e4c3c"),
    defineArchetype("char_watercolor_fisherman_rigged", "수채화 동화풍 노인 어부 (AI 리깅 완료)", "daily-school", 7.0, "914a2cd98dc8b8eb92cda1abe18ac0f8", "3b51d254-a803-4430-9de3-cdf7a82c52ad", "d5d9203c-c0ee-48b4-acd5-a8cdd19be637"),
    defineArchetype("char_inkwash_wandering_swordsman_rigged", "수묵담채화 유랑 검객 (AI 리깅 완료)", "murim", 8.5, "e0ffc71c29db1a272bcf69b2e59480c5", "239dce29-8e95-4c81-a206-73c62c232b3f", "48cb05dc-ae59-4b1b-885a-aa12f1f429fe"),
    defineArchetype("char_inkwash_noblewoman_rigged", "수묵담채화 동양 귀부인 (AI 리깅 완료)", "joseon-historical", 8.0, "2006bc1c4a9ab8f689752131e38eb04a", "e0f4fb2e-18e8-485e-ae26-b519930b4f43", "3d529317-e627-4898-b6a2-65a5c27d5950"),
    defineArchetype("char_comic_vigilante_hero_rigged", "아메리칸 코믹스 마스크 히어로 (AI 리깅 완료)", "hunter-action", 8.5, "b945b6334c7927f09e6336de9ad5e816", "ce8fceea-9742-432e-b18c-ef3d61f98b6e", "a0eea933-aca8-4866-b1f0-6a8af9b843cf"),
    defineArchetype("char_comic_noir_detective_female_rigged", "하드보일드 누아르 여성 탐정 (AI 리깅 완료)", "hunter-action", 8.0, "9263e124d759989c2f12054440890d1e", "367ebd25-64a9-41df-83e7-fd3a2eb421d8", "ec187659-6d79-4c68-a4e3-c0330b66a6f7"),
    defineArchetype("char_retro90s_teen_girl_rigged", "90년대 레트로 애니풍 소녀 (AI 리깅 완료)", "daily-school", 7.5, "7ccdcd49590a7bda0f0a48dca11a48de", "677d5c29-39e8-4bbd-9be5-0169a5d07991", "70bea7c9-2a9d-4f25-b46d-b166c3662f38"),
    defineArchetype("char_retro90s_mecha_pilot_rigged", "90년대 레트로 메카 파일럿 소년 (AI 리깅 완료)", "cyberpunk", 7.5, "8fdbcfa4cefbccfa2b5e32cdf4a595da", "1f794cc5-4bca-4239-b81c-0b790634e30e", "25180a8c-5083-4ddb-8ecf-2ec3b3b69dff"),
    defineArchetype("char_lowpoly_knight_rigged", "로우폴리 플랫셰이딩 기사 (AI 리깅 완료)", "romance-fantasy", 7.5, "8d2e424d4e575c94faf537f27cace258", "be1ae9a4-4156-4f6b-8d2f-c8d86c707775", "864a7bb1-e8eb-4824-bd56-2b5fe750eabd"),
    defineArchetype("char_lowpoly_elf_archer_rigged", "로우폴리 플랫셰이딩 엘프 궁수 (AI 리깅 완료)", "romance-fantasy", 7.5, "82cfd42f52e624b2f87068959f7b9e05", "6d4c57dd-79de-4e0c-94fe-37cc1f7a21fd", "65abb095-25c7-41a6-9418-eac64f083de8"),
    defineArchetype("char_painterly_korean_male_lead_rigged", "반실사 일러스트풍 한국 남주인공 (AI 리깅 완료)", "romance-fantasy", 8.5, "833a537e8c304cb21a7d29eef41ccc69", "4f1aae56-fc05-40d0-9e9f-0874bc8a77e5", "bc81c655-565d-4b3c-a66c-de8c789fe7c1"),
    defineArchetype("char_painterly_korean_female_lead_rigged", "반실사 일러스트풍 한국 여주인공 (AI 리깅 완료)", "romance-fantasy", 8.0, "cf27dd5fe0b79721408d299cc7c4d39b", "1d726af9-7377-45a4-a5ec-2be0e357067c", "e1c94fe7-f759-4468-a5f1-e51a1f04f1f4"),
    defineArchetype("char_stylized3d_cheerful_girl_rigged", "스타일라이즈드 3D 애니풍 소녀 (AI 리깅 완료)", "daily-school", 6.5, "642df675d02a62a62362cd25b35f3e77", "594a4457-5b77-4264-936a-b4f07b545522", "4a7620f2-c8aa-4b4d-9bee-25c8fdeb2880"),
    defineArchetype("char_stylized3d_chubby_man_rigged", "스타일라이즈드 3D 친근한 청년 (AI 리깅 완료)", "daily-school", 6.5, "df5c4cece0f626aa607041315b3f757f", "99588781-8bd8-4c3e-9d3a-158a299ea7da", "2c5bba51-fb44-455d-8950-ba1d19d2f4c3"),
    defineArchetype("char_flatvector_pro_woman_rigged", "플랫 벡터 일러스트 커리어우먼 (AI 리깅 완료)", "daily-school", 8.0, "25d193263c0e67782acf96ce1dc92ea9", "6566ec00-5bf3-4391-a3a5-0cbff21969d9", "1c8dff60-b2f3-41bd-8796-e45404402d45"),
    defineArchetype("char_flatvector_young_man_rigged", "플랫 벡터 일러스트 청년 (AI 리깅 완료)", "daily-school", 8.0, "0b4363ac87f7c58842a6804de24917a0", "c42326dc-da30-46d1-8304-a3512a3e6c5b", "e7230b47-2631-4565-8f37-4ae057913aec"),
    defineArchetype("char_plussize_korean_man_rigged", "한국 플러스사이즈 체형 청년 (AI 리깅 완료)", "daily-school", 7.5, "249288bcee7db2ab620e2f00543a9d88", "230c7131-fc73-4c46-893c-f98b7d9af807", "5e0ec76a-f555-4143-849c-c523965556b4"),
    defineArchetype("char_plussize_korean_woman_rigged", "한국 플러스사이즈 체형 여성 (AI 리깅 완료)", "daily-school", 7.5, "15c4655305b9c3576860247aced63d22", "c3503430-5b12-4c27-9981-4df2472f9f6e", "a53fba50-1e92-478c-89c8-4dbfe9e8dda1"),
    defineArchetype("char_taekwondo_athlete_male_rigged", "한국 태권도 도복 청년 선수 (AI 리깅 완료)", "daily-school", 8.0, "6bb3f2ccfccac4596385da439ae3fab6", "568cb9ea-e873-4d9f-9e8f-ca46bd8e8294", "59541e58-04e0-4f65-8099-586086c4f6de"),
    defineArchetype("char_kendo_practitioner_female_rigged", "검도 호구·하카마 여성 검사 (AI 리깅 완료)", "daily-school", 7.5, "1667b090be85afc2385401a2827cf012", "00a01291-1302-4166-b18d-4b906c1b2a8a", "2a61a610-c527-4630-b53c-49d876a756d3"),
    defineArchetype("char_joseon_scholar_seonbi_rigged", "조선시대 젊은 선비 도포·갓 (AI 리깅 완료)", "joseon-historical", 8.0, "b6ae2a1c3790aa2a394a1093212401f0", "d55f5b7f-332e-4521-a4f2-ebbf136dff1d", "87a6adb8-6e52-4b5e-b4e5-8346c715cd9e"),
    defineArchetype("char_joseon_modern_hanbok_woman_rigged", "모던 개량한복 한국 여성 (AI 리깅 완료)", "joseon-historical", 8.0, "8bf48e8ae2b8d9a9e4067168d7d524a2", "db48fd52-5bfd-492b-8baa-67fc467a2eea", "2c029734-83a5-4768-8532-533193895be8"),
    defineArchetype("char_shounen_samurai_rigged", "소년만화풍 일본 사무라이 무사 (AI 리깅 완료)", "murim", 8.0, "05bb6c3a880a8e938c7affa43e9c52cc", "53c04675-6469-4d4a-8646-f75199eda569", "539f1534-3597-4e66-be11-fc78ec26123f"),
    defineArchetype("char_anime_shrine_maiden_miko_rigged", "애니풍 신사 무녀 미코 (AI 리깅 완료)", "romance-fantasy", 7.5, "874db59797d5b211d253427c7a2248d2", "b1816493-a452-4890-8a68-bb3974c24323", "e6555388-5de5-4241-ac38-0f632eedc74a"),
    defineArchetype("char_korean_chaebol_heir_rigged", "한국 재벌 3세 수트 후계자 (AI 리깅 완료)", "daily-school", 8.5, "dff8514498f4c8382016e323b5b15a7c", "a63099a8-b0bd-4c68-9ed6-60239a4987c4", "60b568a8-3f54-4ccc-89cb-49506ac0bbbc"),
    defineArchetype("char_fantasy_female_mage_rigged", "판타지 웹툰 여성 대마법사 (AI 리깅 완료)", "romance-fantasy", 8.5, "3decc3b1496b3d539801f4de046c9ae6", "a53e5264-aff1-49bc-9aa1-1efa0a1a1e19", "6efb33f9-c5cf-4bf6-9d48-9f467f98b2a8"),
    defineArchetype("char_fantasy_male_knight_rigged", "판타지 웹툰 남성 성기사 (AI 리깅 완료)", "romance-fantasy", 8.5, "fdee15d7aaf3816ad83a7b4a6aaf0391", "8a90627d-5a72-4e15-8a2f-8dd3c8d52967", "95ab26ea-cb8e-41f7-a2de-1270b44fbd0f"),
    defineArchetype("char_anime_catgirl_rigged", "애니풍 고양이귀 네코미미 소녀 (AI 리깅 완료)", "romance-fantasy", 7.5, "ec74fdc5983dd45fb26d24497ca506d8", "de503575-fddf-470c-b7eb-d84fa9ce39e5", "b55fda04-78ae-4194-b6be-6f5e4d0d4867"),
    defineArchetype("char_webtoon_demon_lord_rigged", "판타지 웹툰 마왕 (9등신 · AI 리깅 완료)", "hunter-action", 9.0, "7faf7e0b32b00f05dda922c54d11ada5", "39565bf9-e13c-4f69-86d1-d274f2134db3", "510b3d82-6062-441d-9172-92cc67205ef9"),
    defineArchetype("char_vampire_noblewoman_rigged", "뱀파이어 귀족 영애 (9등신 · AI 리깅 완료)", "romance-fantasy", 9.0, "abc53452a3420ea8b884be130a8e41c7", "209a24dd-33d2-4410-84e5-6e2eb8726f14", "192fd79a-9d50-4392-9d04-a3944ff04f63"),
    defineArchetype("char_dark_elf_ranger_rigged", "다크엘프 레인저 궁수 (AI 리깅 완료)", "hunter-action", 8.0, "7a2b82e9c4078b60e20d65bdb17e306d", "9ce9be7f-85c5-4ec4-a38b-142cdf2e4d6a", "e2b0cc00-7b1f-4ca5-b118-4083f3096e8a"),
    defineArchetype("char_dragon_horned_girl_rigged", "용족 뿔 드래곤걸 소녀 (AI 리깅 완료)", "romance-fantasy", 7.5, "3ae7d081b2856b5b946806e155066ae9", "54cabb92-af05-4be8-bbc5-7d24bcefb1a1", "0b440c7d-2aab-4706-8df6-a7023ffa94e4"),
    defineArchetype("char_cyber_ninja_rigged", "사이버 닌자 전술 슈트 (AI 리깅 완료)", "cyberpunk", 8.0, "b74b1a78016e1e2a9255fcc9a12b5f65", "4c726db2-a55e-4c2e-a9ae-0b38ab8cfb70", "d9ae00ae-333e-40f8-a573-f37b0ec6cbef"),
    defineArchetype("char_scifi_space_marine_rigged", "SF 스페이스 마린 강화복 (AI 리깅 완료)", "cyberpunk", 8.5, "420692c2b98d666a95eb6c6de925391c", "db27714b-c3d8-41ed-be66-d00f6e0c4f0a", "7b17b848-cf59-43c6-892a-c6cfa1276e91"),
    defineArchetype("char_steampunk_inventor_girl_rigged", "스팀펑크 발명가 소녀 (AI 리깅 완료)", "romance-fantasy", 7.5, "eef0118479b57b269c1aa13640da7d5e", "e696be75-001a-47cc-9d49-c8ab01f6fc35", "5a881bee-424c-47d5-8e05-0cc3104aff59"),
    defineArchetype("char_pirate_captain_rigged", "소년만화 해적선장 코트 (AI 리깅 완료)", "romance-fantasy", 8.0, "21d6c3cc1e69d5dde438760cfe1acade", "a84d8bf9-9c61-4701-9ea5-12feb90ad695", "94015ff9-8065-4429-a92d-7ccd1e644b0f"),
    defineArchetype("char_student_council_president", "학생회장 여고생 (레퍼런스 cd1e75d3 · AI 리깅 완료)", "daily-school", 8.0, "a54047a0d6416c8f23abf6f6c9bbc01b", "cd1e75d3-5efa-4f46-afb6-59920e080fb7", "58923776-91f0-4b60-a985-835d204f9a24"),
    defineArchetype("char_delinquent_highschool_boy_rigged", "학원 액션 웹툰 터프 남고생 (AI 리깅 완료)", "hunter-action", 8.5, "ff973b32f5f61b48eea83087f8a27269", "9be205d7-2540-4f12-9f19-5cf149235ad2", "49ba4470-ae24-44fe-a87b-892c1dcc841e"),
    defineArchetype("char_maid_cafe_waitress_rigged", "메이드 카페 프릴 웨이트리스 (AI 리깅 완료)", "daily-school", 7.5, "930dd9fa7509a81105829ae31ba3b771", "8677553e-1bc4-4c65-bce2-6f0f12dd02a0", "01c5497f-09e4-4379-a93e-690992b17b87"),
    defineArchetype("char_elderly_butler_rigged", "노련한 저택 노집사 연미복 (AI 리깅 완료)", "romance-fantasy", 8.0, "96a040ebee3ca73c6e450af689120a10", "014e1ddf-4482-4d3f-847b-85c4a2596d36", "363c8d01-5176-40fa-b4f3-f8c33ebd16fb"),
    defineArchetype("char_korean_game_streamer_rigged", "한국 게임 스트리머 청년 (AI 리깅 완료)", "cyberpunk", 8.0, "5009b2be266d72e0b826af32e13f73f7", "cd5fad7f-ddd8-44ce-b1e3-bd1eb0ffc253", "d5a2fb52-e2e9-4090-9a81-3bc1c8f3b97b"),
    defineArchetype("char_tired_webtoon_artist_rigged", "마감 중인 웹툰 작가 여성 (AI 리깅 완료)", "daily-school", 7.5, "0efbacb201c991e53263cf0d4a9820bf", "021d24f4-b367-48e3-be80-2c1cb5aea219", "8b6e4c1d-d4d4-45c7-b4db-5573903d289d"),
    defineArchetype("char_rofan_northern_grand_duke", "로판 북부대공 남주인공 (9등신)", "romance-fantasy", 9.0, "66c49d14c884db6c9fb0a6171993b0bb", "15a993cd-e4f2-417c-9bea-b5c677000701"),
    defineArchetype("char_rofan_villainess_empress", "로판 악녀 황후 여주인공 (8.5등신)", "romance-fantasy", 8.5, "303605d34e6f180b134888d65caeefb9", "5b199d6b-8cae-4dca-9b69-35c09e0bfd3f"),
    defineArchetype("char_hunter_shadow_necromancer", "S급 그림자 군주 네크로맨서 헌터", "hunter-action", 8.5, "baa34553a21fda004eadf0d8a3dc8fb1", "39565bf9-5041-4402-98c1-44df3b155b14"),
    defineArchetype("char_murim_mount_hua_sword_saint", "화산파 매화검존 청년 무사", "murim", 8.5, "9079215875dc0a037fdcd62634edb41a", "239dce29-7f4b-4b64-9a8d-7781c2e78102"),
    defineArchetype("char_murim_heavenly_demon", "천마신교 교주 (9등신 무림 절대자)", "murim", 9.0, "a89b041976e2f1ab8f4bad7d85e1c1ad", "53c04675-8722-4157-88ef-72185c914209"),
    defineArchetype("char_magical_girl_starlight_idol", "마법소녀 스타라이트 아이돌", "romance-fantasy", 7.5, "5457be2365acaf780b71a4d19e7136d7", "a858bce1-b921-4d04-a2e0-a8db046f74a8"),
    defineArchetype("char_apocalypse_scout_girl", "아포칼립스 생존 정찰병 소녀", "hunter-action", 8.0, "c4462cdf5cae41e4283d8f638a5b9b04", "e09ccaaf-8f58-4c39-bae5-574c0e99c146"),
    defineArchetype("char_royal_academy_alchemist", "왕립 아카데미 연금술사 소년", "romance-fantasy", 7.5, "656ab3bf8700d4aca5ad762ab622e046", "a53e5264-281b-4729-88cb-9146c2d73920"),
    defineArchetype("char_chibi_azure_dragon_mascot", "SD 치비 청룡 신수 마스코트 (2.5등신)", "romance-fantasy", 2.5, "02d4a5f99392d2506d7043d8dfafb64e", "230cff6a-266b-4453-99ab-c9e356f77f4e"),
    defineArchetype("char_chibi_ninetail_spirit_fox", "SD 치비 백구미호 영수 마스코트 (2.5등신)", "murim", 2.5, "4be5070e39a65603057876210917bb20", "e0a6ec91-319f-491b-94cf-5714c99e7104"),
    defineArchetype("char_hunter_guild_master_turnaround", "헌터 길드마스터 화이트골드 코트 (턴어라운드 아키타입)", "hunter-action", 8.5, "f84ff2c70716f017930a8a12b0fa3fc6", "84c76613-fc8e-497e-9754-72e709e9f965"),
  ]);

export interface StudioVarco3dRetargetedMotionTaskPreset {
  readonly animTaskId: string;
  readonly sourceRigTaskId: string;
  readonly archetypeId: string;
  readonly animationFbx: string;
  readonly labelKo: string;
  readonly inPlaceAnimation: boolean;
}

export const STUDIO_VARCO3D_RETARGETED_MOTION_TASKS: readonly StudioVarco3dRetargetedMotionTaskPreset[] =
  Object.freeze([
    { animTaskId: "cf5cbba3-4987-49b7-a1d1-079ccfcb09b8", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "standing_idle_1", labelKo: "기본 스탠딩 아이들 (standing_idle_1)", inPlaceAnimation: true },
    { animTaskId: "2f07eb6d-8f4c-4624-9610-93559d1f4aad", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "walk", labelKo: "자연스러운 보행 루프 (walk)", inPlaceAnimation: true },
    { animTaskId: "cccdfa9f-df58-4803-bc80-4c60c675c46e", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "run", labelKo: "경쾌한 러닝 루프 (run)", inPlaceAnimation: true },
    { animTaskId: "559118f7-f8eb-483f-a266-ca4bf170872f", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "sprint", labelKo: "전력 질주 스프린트 (sprint)", inPlaceAnimation: true },
    { animTaskId: "c244d922-2f40-4ae7-b342-c03e37015d7f", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "jump_in_place", labelKo: "제자리 점프 (jump_in_place)", inPlaceAnimation: true },
    { animTaskId: "0e818fc7-3998-40ad-a15e-34dcc75beed2", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "kneel_combat_idle", labelKo: "전투 무릎 대기 자세 (kneel_combat_idle)", inPlaceAnimation: true },
    { animTaskId: "c628bc00-3cf5-4dcb-9862-63072b0b40a4", sourceRigTaskId: "51d4a5fb-2e12-40ad-a049-c2fc20f61f3c", archetypeId: "char_highschool_girl_rigged", animationFbx: "standing_idle_1", labelKo: "여고생 스탠딩 아이들 (standing_idle_1)", inPlaceAnimation: true },
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
