/**
 * Real VARCO 3D Cloud (https://3d.varco.ai, Flow 70a90b59-8678-4d35-a5f1-4d1ea39195a7)
 * Character Labs modular wardrobe/wig/weapon/wing catalog, rigged webtoon character
 * archetypes, isometric cutaway 3D background dioramas, and Korean webtoon 3D props.
 */

export type StudioAsset3dCharacterLabSlot =
  | "head-hair"
  | "outfit-set"
  | "head-accessory"
  | "weapon-r"
  | "weapon-l"
  | "back-wings";

export type StudioAsset3dWebtoonGenre =
  | "daily-school"
  | "romance-fantasy"
  | "murim"
  | "hunter-action"
  | "cyberpunk"
  | "joseon-historical";

export type StudioAsset3dTurnaroundAngle = "front" | "back" | "left" | "right";

export type StudioAsset3dAttachBoneName =
  | "mixamorig:Head"
  | "mixamorig:Spine2"
  | "mixamorig:RightHand"
  | "mixamorig:LeftHand";

export interface StudioAsset3dMultiviewTurnaround {
  readonly taskId: string;
  readonly frontPath: string;
  readonly backPath: string;
  readonly leftPath: string;
  readonly rightPath: string;
}

export interface StudioAsset3dCharacterLabModularItem {
  readonly id: string;
  readonly slot: StudioAsset3dCharacterLabSlot;
  readonly genre: StudioAsset3dWebtoonGenre;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly attachBoneName: StudioAsset3dAttachBoneName;
  readonly referenceImagePath: string;
  readonly multiviewTurnaround: StudioAsset3dMultiviewTurnaround;
  readonly polygonBudget: number;
  readonly pbrRoughness: number;
  readonly pbrMetallic: number;
}

export interface StudioAsset3dCharacterArchetypeEntry {
  readonly id: string;
  readonly labelKo: string;
  readonly genre: StudioAsset3dWebtoonGenre;
  readonly headTallRatio: number;
  readonly referenceImagePath: string;
  readonly meshTaskId: string;
  readonly rigTaskId: string | null;
}

export interface StudioAsset3dIsometricDioramaEntry {
  readonly id: string;
  readonly labelKo: string;
  readonly genre: StudioAsset3dWebtoonGenre;
  readonly referenceImagePath: string;
  readonly meshTaskId: string;
  readonly cameraFovDeg: number;
  readonly cameraElevationDeg: number;
  readonly cameraAzimuthDeg: number;
  readonly ambientKelvin: number;
}

export type StudioAsset3dPropCategory =
  | "school"
  | "street"
  | "traditional"
  | "vehicle"
  | "interior";

export interface StudioAsset3dWebtoonPropEntry {
  readonly id: string;
  readonly labelKo: string;
  readonly category: StudioAsset3dPropCategory;
  readonly referenceImagePath: string;
  readonly meshTaskId: string;
  readonly footprintMeters: readonly [number, number, number];
}

export const STUDIO_ASSET3D_CLOUD_BASE_URL = "https://3d.varco.ai" as const;
export const STUDIO_ASSET3D_ACTIVE_FLOW_ID = "70a90b59-8678-4d35-a5f1-4d1ea39195a7" as const;

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
  slot: StudioAsset3dCharacterLabSlot,
  genre: StudioAsset3dWebtoonGenre,
  labelKo: string,
  labelEn: string,
  attachBoneName: StudioAsset3dAttachBoneName,
  referenceHash: string,
  taskId: string,
  frontHash: string,
  mvSet: typeof MV_SET_A | typeof MV_SET_B,
  polygonBudget: number,
  pbrRoughness: number,
  pbrMetallic: number,
): StudioAsset3dCharacterLabModularItem {
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

export const STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS: readonly StudioAsset3dCharacterLabModularItem[] =
  Object.freeze([
    defineModularItem("charlab_wig_idol_twintails", "head-hair", "daily-school", "아이돌 리본 트윈테일 가발", "K-Pop Idol Ribbon Twin-Tails Wig", "mixamorig:Head", "806ccb1e7afbfe4701983a0f2249bc71", "2aeb993c-4d7b-4ee3-bd02-fe1103c1288a", "3e46113ff7e0439ceddc0c12604d8b91", MV_SET_A, 18500, 0.42, 0.05),
    defineModularItem("charlab_wig_male_wolfcut", "head-hair", "daily-school", "남주 시스루 울프컷 가발", "Male Lead Layered Wolf-Cut Wig", "mixamorig:Head", "ee921d48b14a0b34fd8ab74d4262a2e8", "a2b43c76-68eb-401b-8391-cc904a150ddf", "ee921d48b14a0b34fd8ab74d4262a2e8", MV_SET_A, 14200, 0.48, 0.04),
    defineModularItem("charlab_wig_rofan_hime_wave", "head-hair", "romance-fantasy", "로판 황녀 진주 히메웨이브 가발", "Rofan Noblewoman Pearl Hime-Wave Wig", "mixamorig:Head", "7af8249b7dcc90c35afe5d82e9b55bd0", "f18a1134-2161-40a1-a1d4-d1a080cb8d53", "741a9a3f7fdef6f86c574d3f000b8d20", MV_SET_B, 22400, 0.36, 0.12),
    defineModularItem("charlab_wig_murim_jade_ponytail", "head-hair", "murim", "무림 옥관 하이 포니테일 가발", "Murim Jade-Crown High Ponytail Wig", "mixamorig:Head", "9e085568815e25db4c4db344d55c2a7f", "95f54a99-c8c2-4f0a-9730-dcf98f233b68", "9e085568815e25db4c4db344d55c2a7f", MV_SET_B, 19600, 0.4, 0.18),
    defineModularItem("charlab_wig_cyber_neon_bob", "head-hair", "cyberpunk", "사이버펑크 네온 옴브레 단발 가발", "Cyberpunk Neon Ombre Asymmetric Bob", "mixamorig:Head", "e5d5f69d367beefd139c6b69c80161fb", "a862bf36-157c-41f2-a682-9a90f09592b8", "e5d5f69d367beefd139c6b69c80161fb", MV_SET_A, 15800, 0.32, 0.25),
    defineModularItem("charlab_outfit_school_blazer", "outfit-set", "daily-school", "네이비 금장 블레이저 교복 세트", "High School Navy Gold-Crest Blazer Uniform", "mixamorig:Spine2", "94d3dc20098ebfbf39be2105c8c68b30", "1ce18023-8e57-4ffc-99c6-a7dac55df00e", "94d3dc20098ebfbf39be2105c8c68b30", MV_SET_B, 34000, 0.65, 0.1),
    defineModularItem("charlab_outfit_rofan_crimson_gown", "outfit-set", "romance-fantasy", "로판 황실 크림슨 금사 자수 드레스", "Rofan Imperial Crimson & Gold Ballgown", "mixamorig:Spine2", "d854a2a7f870fc68c1ca858678ded295", "6283a372-9b58-4ba5-bf2f-3cb551282423", "d854a2a7f870fc68c1ca858678ded295", MV_SET_A, 48000, 0.38, 0.35),
    defineModularItem("charlab_outfit_northern_duke_cape", "outfit-set", "romance-fantasy", "북부대공 흑은 모피 하프케이프 제복", "Northern Grand Duke Fur-Collar Cape Uniform", "mixamorig:Spine2", "76a4e574d95baba1075279c33e3a7815", "2cc94d41-9454-43e1-902c-aea80a033826", "76a4e574d95baba1075279c33e3a7815", MV_SET_B, 44500, 0.45, 0.42),
    defineModularItem("charlab_outfit_murim_mount_hua_robe", "outfit-set", "murim", "화산파 매화 자수 도포 & 가죽완갑", "Mount Hua Sect Plum-Blossom Martial Robe", "mixamorig:Spine2", "ae7dd076e5d07c1f8831ceb8319d2506", "f06c0148-7e74-4a7b-a585-caa418d35335", "ae7dd076e5d07c1f8831ceb8319d2506", MV_SET_A, 39200, 0.54, 0.16),
    defineModularItem("charlab_outfit_hunter_raid_armor", "outfit-set", "hunter-action", "S급 헌터 마나코어 전술 레이드 아머", "S-Rank Hunter Mana-Core Tactical Raid Armor", "mixamorig:Spine2", "701f221dcb197405ce8bba2010c81de7", "50c8e464-8251-402a-adcd-a194905bc661", "701f221dcb197405ce8bba2010c81de7", MV_SET_B, 46800, 0.28, 0.68),
    defineModularItem("charlab_outfit_cyber_techwear", "outfit-set", "cyberpunk", "사이버펑크 홀로그램 크롭 테크웨어", "Cyberpunk Holographic Cropped Techwear Set", "mixamorig:Spine2", "e6575e70a79a046d775546596d6f33d8", "166ebd71-45f7-48da-81a3-c532317336ee", "e6575e70a79a046d775546596d6f33d8", MV_SET_A, 37400, 0.34, 0.44),
    defineModularItem("charlab_outfit_joseon_royal_durumagi", "outfit-set", "joseon-historical", "조선 왕실 금박 운문단 두루마기 한복", "Joseon Royal Indigo-Gold Embroidered Durumagi", "mixamorig:Spine2", "66e0b34cf3d7f82d4d8cd04f6650403c", "466dc073-ce2a-42ad-8663-d5928eef2c26", "66e0b34cf3d7f82d4d8cd04f6650403c", MV_SET_B, 41200, 0.46, 0.24),
    defineModularItem("charlab_acc_rofan_ruby_tiara", "head-accessory", "romance-fantasy", "로판 황실 루비 필리그리 티아라", "Rofan Imperial Ruby & Diamond Filigree Tiara", "mixamorig:Head", "bee45fccc3ba0d128ec6a489c66edf14", "8acd6d9b-a002-4ddf-98d1-e97e5850f85f", "bee45fccc3ba0d128ec6a489c66edf14", MV_SET_A, 12400, 0.16, 0.88),
    defineModularItem("charlab_weapon_paladin_greatsword", "weapon-r", "romance-fantasy", "성기사 태양문양 사파이어 대검", "Holy Paladin Sunburst Sapphire Greatsword", "mixamorig:RightHand", "20f9bce509fc3ba67c9984ac576d345c", "ccf99460-4932-4715-9f9c-807e5b19aa0d", "20f9bce509fc3ba67c9984ac576d345c", MV_SET_B, 16800, 0.2, 0.85),
    defineModularItem("charlab_weapon_shadow_twin_daggers", "weapon-l", "hunter-action", "S급 그림자 암살자 마나 쌍단검", "S-Rank Shadow Assassin Purple-Mana Twin Daggers", "mixamorig:LeftHand", "e32ce5fc0542f2f4f7cd115dd66e48e3", "b32d0a49-3493-4ec3-adda-5ced0e7f2e3d", "e32ce5fc0542f2f4f7cd115dd66e48e3", MV_SET_A, 14500, 0.24, 0.78),
    defineModularItem("charlab_weapon_archmage_astrolabe_staff", "weapon-r", "romance-fantasy", "대마법사 아스트롤라베 마나 지팡이", "Archmage Celestial Astrolabe Mana Staff", "mixamorig:RightHand", "4b3eb0b40ddc67c2b8d9851393e9aa08", "1fed16d7-0095-435c-afac-a813cf9c5024", "4b3eb0b40ddc67c2b8d9851393e9aa08", MV_SET_B, 19200, 0.22, 0.82),
    defineModularItem("charlab_weapon_murim_jade_sword", "weapon-r", "murim", "무림 천옥 청련 장검 & 검집", "Murim Heavenly Jade Longsword & Scabbard", "mixamorig:RightHand", "a5548b290298b396e65969ed7e25fd04", "6e9e77f6-1f06-4862-9c15-8002da188eb9", "a5548b290298b396e65969ed7e25fd04", MV_SET_A, 15600, 0.26, 0.74),
    defineModularItem("charlab_acc_cyber_ar_visor", "head-accessory", "cyberpunk", "사이버펑크 네온 HUD 전술 바이저 헤드셋", "Cyberpunk Neon HUD Tactical AR Visor Headset", "mixamorig:Head", "54730ecf1c24f343603084a033326b85", "932b0c67-4e0b-4eb0-a5fe-ab1e9d9a4784", "54730ecf1c24f343603084a033326b85", MV_SET_B, 11800, 0.18, 0.64),
    defineModularItem("charlab_wings_archangel_six", "back-wings", "romance-fantasy", "대천사 순백 금빛 깃털 날개 파츠", "Archangel White & Gold Feathered Back Wings", "mixamorig:Spine2", "802f2f89f30bfc6a7d82f822361406bd", "f3cee0b5-3e72-4bd5-a226-3dd1ed0e7432", "802f2f89f30bfc6a7d82f822361406bd", MV_SET_A, 28400, 0.44, 0.22),
    defineModularItem("charlab_wings_demon_lord_dragon", "back-wings", "hunter-action", "마왕 흑요석 홍염 드래곤 날개 파츠", "Demon Lord Obsidian & Crimson Vein Dragon Wings", "mixamorig:Spine2", "1667a5abc94133900dc58763f86168cd", "df4fed16-d540-496d-83bc-05627475ee87", "1667a5abc94133900dc58763f86168cd", MV_SET_B, 29600, 0.35, 0.38),
  ]);

function defineArchetype(
  id: string,
  labelKo: string,
  genre: StudioAsset3dWebtoonGenre,
  headTallRatio: number,
  referenceHash: string,
  meshTaskId: string,
  rigTaskId: string | null = null,
): StudioAsset3dCharacterArchetypeEntry {
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

export const STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES: readonly StudioAsset3dCharacterArchetypeEntry[] =
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

export interface StudioAsset3dRetargetedMotionTaskPreset {
  readonly animTaskId: string;
  readonly sourceRigTaskId: string;
  readonly archetypeId: string;
  readonly animationFbx: string;
  readonly labelKo: string;
  readonly inPlaceAnimation: boolean;
}

export const STUDIO_ASSET3D_RETARGETED_MOTION_TASKS: readonly StudioAsset3dRetargetedMotionTaskPreset[] =
  Object.freeze([
    { animTaskId: "cf5cbba3-4987-49b7-a1d1-079ccfcb09b8", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "standing_idle_1", labelKo: "기본 스탠딩 아이들 (standing_idle_1)", inPlaceAnimation: true },
    { animTaskId: "2f07eb6d-8f4c-4624-9610-93559d1f4aad", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "walk", labelKo: "자연스러운 보행 루프 (walk)", inPlaceAnimation: true },
    { animTaskId: "cccdfa9f-df58-4803-bc80-4c60c675c46e", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "run", labelKo: "경쾌한 러닝 루프 (run)", inPlaceAnimation: true },
    { animTaskId: "559118f7-f8eb-483f-a266-ca4bf170872f", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "sprint", labelKo: "전력 질주 스프린트 (sprint)", inPlaceAnimation: true },
    { animTaskId: "c244d922-2f40-4ae7-b342-c03e37015d7f", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "jump_in_place", labelKo: "제자리 점프 (jump_in_place)", inPlaceAnimation: true },
    { animTaskId: "0e818fc7-3998-40ad-a15e-34dcc75beed2", sourceRigTaskId: "58923776-91f0-4b60-a985-835d204f9a24", archetypeId: "char_student_council_president", animationFbx: "kneel_combat_idle", labelKo: "전투 무릎 대기 자세 (kneel_combat_idle)", inPlaceAnimation: true },
    { animTaskId: "c628bc00-3cf5-4dcb-9862-63072b0b40a4", sourceRigTaskId: "51d4a5fb-2e12-40ad-a049-c2fc20f61f3c", archetypeId: "char_highschool_girl_rigged", animationFbx: "standing_idle_1", labelKo: "여고생 스탠딩 아이들 (standing_idle_1)", inPlaceAnimation: true },
    { animTaskId: "a6c00091-fcf5-4cdc-bdfd-312bdc78e6b5", sourceRigTaskId: "48ec3d05-58ba-43f7-8731-66304b8cb17a", archetypeId: "char_kpop_idol_female_rigged", animationFbx: "shuffle_dance", labelKo: "K-POP 여돌 셔플 댄스 (shuffle_dance)", inPlaceAnimation: true },
    { animTaskId: "5e5fd069-b587-4a8b-8d6f-cc48ec759353", sourceRigTaskId: "95ef6349-ba6b-49c4-9c82-2042b7ebb146", archetypeId: "char_kpop_idol_male_rigged", animationFbx: "arm_wave_dance", labelKo: "K-POP 남돌 암웨이브 댄스 (arm_wave_dance)", inPlaceAnimation: true },
    { animTaskId: "0768ae4d-1ebd-41b9-b9a0-5cfbdd24366d", sourceRigTaskId: "48cb05dc-ae59-4b1b-885a-aa12f1f429fe", archetypeId: "char_inkwash_wandering_swordsman_rigged", animationFbx: "forward_roll", labelKo: "무림 검객 전방 구르기 (forward_roll)", inPlaceAnimation: true },
    { animTaskId: "8a50371c-efa5-4f94-9fd7-867a02e11c40", sourceRigTaskId: "6efb33f9-c5cf-4bf6-9d48-9f467f98b2a8", archetypeId: "char_fantasy_female_mage_rigged", animationFbx: "gesture_talk", labelKo: "대마법사 제스처 대화 (gesture_talk)", inPlaceAnimation: true },
    { animTaskId: "2bb16da9-ab0c-47d5-a2d8-b6cf44a5d106", sourceRigTaskId: "95ab26ea-cb8e-41f7-a2de-1270b44fbd0f", archetypeId: "char_fantasy_male_knight_rigged", animationFbx: "crouch_kneel_idle", labelKo: "성기사 충성 서약 무릎 자세 (crouch_kneel_idle)", inPlaceAnimation: true },
    { animTaskId: "c2a9290b-2caf-426f-9f39-0208d8c038e9", sourceRigTaskId: "510b3d82-6062-441d-9172-92cc67205ef9", archetypeId: "char_webtoon_demon_lord_rigged", animationFbx: "dragon_wing_idle", labelKo: "판타지 마왕 드래곤윙 위압 (dragon_wing_idle)", inPlaceAnimation: true },
    { animTaskId: "6d9f0a46-d6a5-46d2-ba3f-1ea41969e8a5", sourceRigTaskId: "d9ae00ae-333e-40f8-a573-f37b0ec6cbef", archetypeId: "char_cyber_ninja_rigged", animationFbx: "rope_swing_down", labelKo: "사이버 닌자 와이어 강하 (rope_swing_down)", inPlaceAnimation: true },
    { animTaskId: "6b2a2a98-104a-4c2f-898d-2be59e8f40d1", sourceRigTaskId: "87a6adb8-6e52-4b5e-b4e5-8346c715cd9e", archetypeId: "char_joseon_scholar_seonbi_rigged", animationFbx: "explain_talk", labelKo: "조선 선비 강론 대화 (explain_talk)", inPlaceAnimation: true },
    { animTaskId: "c43c1ead-5ed8-438a-ad1a-5f76ef05972a", sourceRigTaskId: "1f4063c6-251e-4586-944a-ce5909896d36", archetypeId: "char_basketball_player_female_rigged", animationFbx: "basketball_shot", labelKo: "스포츠 농구 슛 점프 (basketball_shot)", inPlaceAnimation: true },
    { animTaskId: "e6a20f8b-354b-4773-969d-3870d2f621f8", sourceRigTaskId: "3038503c-dc63-4103-a22e-c682d7ba95fc", archetypeId: "char_barista_woman_rigged", animationFbx: "drink", labelKo: "카페 바리스타 시음 (drink)", inPlaceAnimation: true },
    { animTaskId: "d978a37e-3979-412e-806e-fbede5d5ca0a", sourceRigTaskId: "55d6f514-1c3d-4df5-ab3a-f2758fb6b1f2", archetypeId: "char_office_worker_male_rigged", animationFbx: "sit_on_chair", labelKo: "오피스 직장인 착석 (sit_on_chair)", inPlaceAnimation: true },
  ]);

function defineDiorama(
  id: string,
  labelKo: string,
  genre: StudioAsset3dWebtoonGenre,
  referenceHash: string,
  meshTaskId: string,
  cameraFovDeg: number,
  cameraElevationDeg: number,
  cameraAzimuthDeg: number,
  ambientKelvin: number,
): StudioAsset3dIsometricDioramaEntry {
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

export const STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES: readonly StudioAsset3dIsometricDioramaEntry[] =
  Object.freeze([
    defineDiorama("diorama_school_hallway", "한국 고등학교 복도 아이소메트릭 디오라마", "daily-school", "50ba0888a46c94a833ed8c393cf83b74", "0c2f14f6-5dc3-4fba-9d2c-691cb6b779e0", 32, 30, 45, 5400),
    defineDiorama("diorama_school_rooftop", "학교 옥상 펜스 & 물탱크 디오라마", "daily-school", "2b9d8ac495e8d561c5c845b8f3b21389", "c7a9eae5-d210-404a-92df-793cc9ea5c25", 35, 28, 40, 5800),
    defineDiorama("diorama_subway_car", "한국 지하철 객차 내부 디오라마", "daily-school", "e0a2cff4eb463ded23d26f3ad2b90333", "849cf93f-78fe-4dcf-91e5-de0694419926", 30, 26, 35, 4800),
    defineDiorama("diorama_modern_cafe", "모던 브런치 카페 인테리어 디오라마", "daily-school", "3aa29161d245143e07f3db144d8e12ba", "37b095e1-b791-48d0-b625-4b77cf2472bd", 34, 32, 45, 3800),
    defineDiorama("diorama_studio_oneroom", "한국 자취방 원룸 오피스텔 디오라마", "daily-school", "41b54ee4e8feb125287a885275e5d83e", "9b87979c-f014-4bba-a86d-926350ced109", 34, 34, 45, 4200),
    defineDiorama("diorama_residential_alley", "한국 주택가 골목길 전신주 디오라마", "daily-school", "2412715fe59011b75cde9bbc9c479a25", "c264ea1e-134e-4136-88fb-b138b6b2325f", 36, 28, 50, 4600),
    defineDiorama("diorama_joseon_palace_hall", "조선 궁궐 근정전 어좌 대전 디오라마", "joseon-historical", "e7f1740a5f9d9d63959071561bb6c9c8", "4bc4a1f9-13d2-4719-ba42-f70cb5175078", 32, 30, 45, 4900),
    defineDiorama("diorama_traditional_market", "한국 전통시장 먹자골목 디오라마", "daily-school", "16883f7240cff16dc50b0fd8eeda46e5", "df9ed57c-aea3-4129-89e9-fbe4b01fbe15", 35, 30, 42, 3900),
    defineDiorama("diorama_hospital_room", "대학병원 입원실 병동 디오라마", "daily-school", "f6b6a6eee22c54554b903ad0110ce7de", "23a95cce-44c8-4570-937e-45c0e824765f", 32, 32, 45, 5600),
    defineDiorama("diorama_open_office", "현대 오픈플랜 IT 오피스 디오라마", "daily-school", "6162d26ef00445bcb019f1617aabf24c", "6d5c00cc-0c56-46b1-82a4-f45015988cbc", 33, 32, 45, 5200),
    defineDiorama("diorama_pc_bang", "한국 게이밍 PC방 네온 부스 디오라마", "cyberpunk", "77fdb40cdde7c122de079050bdab2c28", "345fd5e0-921b-4512-b250-d824eea9b4a8", 34, 30, 45, 6200),
    defineDiorama("diorama_school_gymnasium", "학교 실내 체육관 농구코트 디오라마", "daily-school", "efacc87de3a4d385ceffa2e6c6e685ca", "747b7a6e-59c8-4cac-9a89-460b3799cbdd", 36, 28, 45, 5300),
    defineDiorama("diorama_rofan_imperial_ballroom", "로판 황궁 대연회장 샹들리에 디오라마", "romance-fantasy", "a982215c44b3a9a78919631aa24738eb", "ce0bcc22-7165-4a96-bc0c-a63e781b8a5f", 32, 30, 45, 3600),
    defineDiorama("diorama_hunter_boss_dungeon", "헌터물 고대 보스 던전 마나 제단 디오라마", "hunter-action", "8f20d69ac9074f4e6b733c0b089386be", "4d0e4ba6-d605-4040-ae11-8edc0b4866ff", 35, 32, 40, 6800),
    defineDiorama("diorama_murim_sect_courtyard", "무림 문파 연무장 청기와 정원 디오라마", "murim", "6a1ecc4bd9ac0a4a7ba459268d784e6b", "27aea6e2-8196-4c7c-b38f-0e5101046f0e", 34, 30, 45, 5100),
    defineDiorama("diorama_cyberpunk_neon_alley", "사이버펑크 네온 야시장 골목 디오라마", "cyberpunk", "14cde21eccd094f9d05c89787c470f4a", "7cc772c3-f322-4245-ac73-fe1cd30e071c", 35, 28, 48, 6500),
    defineDiorama("diorama_webtoon_creator_studio", "웹툰 작가 작업실 신티크 데스크 디오라마", "daily-school", "14cd6e61d3b30598900547a355cbfbf8", "c98fd946-bf65-43fc-aeb2-382e2c293faa", 32, 34, 45, 4400),
    defineDiorama("diorama_chaebol_penthouse", "재벌 3세 럭셔리 펜트하우스 라운지 디오라마", "daily-school", "b61d8948b90b601edba20f41cc639134", "5e4c1fde-f1f2-4e15-9dfd-e727d8a19588", 32, 30, 45, 4100),
    defineDiorama("diorama_magic_academy_library", "판타지 마법 아카데미 원형 서고 디오라마", "romance-fantasy", "fe9c85182ad2e0982aed35933bffc9cc", "6d11aabf-a748-4d66-9f8b-df44bd950d0d", 34, 32, 45, 3900),
    defineDiorama("diorama_convenience_store_patio", "한국 편의점 야외 파라솔 테라스 디오라마", "daily-school", "5210a536b6e8c4c348a5bf6a121e92b5", "5089738c-4bee-4c01-864f-57fb1c45c5a5", 34, 30, 45, 5000),
    defineDiorama("diorama_kpop_concert_stage", "K-POP 음악방송 LED 콘서트 스테이지 디오라마", "cyberpunk", "66504bb7f3dc894cf8ade8d7e71c6785", "a56ece96-e303-486a-80d4-7102113c1a3e", 36, 26, 45, 6400),
    defineDiorama("diorama_apocalypse_overpass_camp", "아포칼립스 붕괴 고가도로 생존캠프 디오라마", "hunter-action", "2901bdda3e53455cc7dfa27deec001cf", "8ff24877-e73a-44c9-872f-1d52eb7630c4", 35, 30, 42, 4700),
  ]);

function defineProp(
  id: string,
  labelKo: string,
  category: StudioAsset3dPropCategory,
  referenceHash: string,
  meshTaskId: string,
  footprintMeters: readonly [number, number, number],
): StudioAsset3dWebtoonPropEntry {
  return {
    id,
    labelKo,
    category,
    referenceImagePath: `/api/objects/${referenceHash}.png`,
    meshTaskId,
    footprintMeters,
  };
}

export const STUDIO_ASSET3D_WEBTOON_PROP_ASSETS: readonly StudioAsset3dWebtoonPropEntry[] =
  Object.freeze([
    defineProp("prop_school_desk_chair", "한국 학교 교실 책걸상 세트", "school", "236c3728030293040055f68ff542c99a", "bd873629-5449-468b-865c-5a8405f7f902", [0.7, 0.8, 0.78]),
    defineProp("prop_school_steel_lockers", "교실 후면 3연동 철제 사물함", "school", "5fbe2cbda772d8147e79e76826aec6d9", "b3abd7a9-8514-4e46-aaae-b7f7664a7cfd", [1.2, 0.5, 1.85]),
    defineProp("prop_commuter_bicycle", "통학용 바구니 시티 자전거", "vehicle", "ce91957bb132f4753db6f138278874b0", "ee849e81-5173-4e91-916a-621c6d69c84c", [1.75, 0.58, 1.05]),
    defineProp("prop_bus_stop_shelter", "한국 도심 유리 버스정류장 쉘터", "street", "a774f6337e36fa7949ac79c1a2785344", "505d8db5-0acb-4456-8173-8309b85db6d3", [3.6, 1.6, 2.5]),
    defineProp("prop_street_lamp_post", "가로수길 아치형 가로등", "street", "fbb9d34263c24cb18afb04a5d4b0fc98", "be230e27-7675-404f-a29e-a2bd17ad8b38", [0.6, 0.6, 4.2]),
    defineProp("prop_wooden_park_bench", "공원 주물 팔걸이 원목 벤치", "street", "bf7e7087fb11dd42e8e4a732c92416b9", "fbf08650-72d5-4add-87ad-8714e8a50f8b", [1.6, 0.68, 0.82]),
    defineProp("prop_hanok_main_gate", "전통 한옥 기와 솟을대문", "traditional", "255da29a95d2917a3374013cfd37f980", "a95ceae8-127a-49a4-9ca3-542a4530b9ea", [3.4, 1.4, 3.2]),
    defineProp("prop_red_torii_gate", "신사 붉은 도리이 게이트", "traditional", "dfc22982f915cf71b060862ff250019b", "916f6c64-353c-4f59-9874-5358a5d4c686", [3.2, 0.8, 3.6]),
    defineProp("prop_cherry_blossom_tree", "만개한 봄 벚꽃나무", "street", "19cfd6810ebabc1911d8df76e5b51561", "3df3abe1-b363-49af-9943-d35c13aa26f2", [3.8, 3.8, 4.5]),
    defineProp("prop_autumn_ginkgo_tree", "가을 황금빛 은행나무", "street", "b8a767b70031ad3e194a0895067abfb3", "801f6534-dcb0-49af-94ca-9c97a2bfe3f4", [3.5, 3.5, 4.8]),
    defineProp("prop_apartment_keypad_door", "한국 아파트 디지털 도어락 현관문", "interior", "a93aada71ee5b1bba0d5e676bee3627c", "562955f7-774a-4871-ab88-2d9efd85e0cf", [1.05, 0.18, 2.15]),
    defineProp("prop_convenience_snack_shelf", "편의점 진열 매대 (과자·음료)", "interior", "89f3c54f1fbc0a5e603bca8e5bfcd145", "94510582-6afb-4be8-81c1-4cc3fc1ffa51", [1.4, 0.55, 1.75]),
    defineProp("prop_pojangmacha_cart", "한국 포장마차 주황 천막 리어카", "street", "c298c5584f4b372ad1e7e041476096ca", "5afa06f9-fb87-414c-800c-999879303d5d", [2.6, 1.9, 2.3]),
    defineProp("prop_city_bus", "한국 시내버스 차량", "vehicle", "3c39f448aa7fb647a1df0c86c9811ad7", "bb48e190-7c7b-428b-b718-2b4f94bf279f", [9.2, 2.45, 3.1]),
    defineProp("prop_yellow_sedan_taxi", "도심 영업용 세단 택시", "vehicle", "d3c4ab748b69b21048d7b7d1245eee24", "37585d0f-89a8-42cf-a756-25b4298b9683", [4.75, 1.84, 1.48]),
    defineProp("prop_white_hatchback_car", "화이트 컴팩트 해치백 승용차", "vehicle", "535c031e3ef6d4e58c84224f80a04e9d", "81d2684c-67a7-4086-a7b8-19222a205007", [4.15, 1.78, 1.52]),
    defineProp("prop_delivery_scooter", "배달통 장착 배달 스쿠터 오토바이", "vehicle", "df32d6b92e77cdbd3ccd9fb09d6ab476", "a1372bdf-db8d-4335-acdc-56e35037f46a", [1.92, 0.72, 1.15]),
    defineProp("prop_cafe_table_set", "카페 원목 원형 테이블 & 의자 2석 세트", "interior", "8297995ab2f2604a84925785bd9325d7", "9cbf89da-bae1-411f-bd81-d6b03453a700", [1.5, 0.9, 0.76]),
    defineProp("prop_teal_fabric_sofa", "거실 3인용 틸 패브릭 소파", "interior", "ff0f8a8ad8b883a0504c0f965e49ba43", "5a3302a8-21c8-41c8-a9c9-52e34cc9774f", [2.1, 0.92, 0.84]),
    defineProp("prop_wooden_single_bed", "원룸 원목 프레임 싱글 침대", "interior", "b6be6151912332db6257bd884909ff87", "e37235e6-061a-408c-976b-a9bfe3868a61", [1.05, 2.08, 0.88]),
    defineProp("prop_dual_monitor_office_desk", "듀얼 모니터 오피스 데스크 세트", "interior", "f71b4299f96f4d07bcb8f3050facb272", "24bf4272-3861-4c2b-9efd-38d7f34b0a33", [1.4, 0.75, 1.18]),
  ]);

export interface StudioAsset3dCompletedTurnaroundSheet extends StudioAsset3dMultiviewTurnaround {
  readonly referenceImagePath: string;
}

function defineTurnaroundSheet(
  taskId: string,
  refHash: string,
  frontHash: string,
  backHash: string,
  leftHash: string,
  rightHash: string,
): StudioAsset3dCompletedTurnaroundSheet {
  return {
    taskId,
    referenceImagePath: `/api/objects/${refHash}.png`,
    frontPath: `/api/objects/${frontHash}.png`,
    backPath: `/api/objects/${backHash}.png`,
    leftPath: `/api/objects/${leftHash}.png`,
    rightPath: `/api/objects/${rightHash}.png`,
  };
}

export const STUDIO_ASSET3D_COMPLETED_TURNAROUND_SHEETS: readonly StudioAsset3dCompletedTurnaroundSheet[] =
  Object.freeze([
    defineTurnaroundSheet("2aeb993c-4d7b-4ee3-bd02-fe1103c1288a", "806ccb1e7afbfe4701983a0f2249bc71", "3e46113ff7e0439ceddc0c12604d8b91", "8b23d71cda5b9b8fb0c466e8962cfe4b", "07f7044d3bb661a4059eb6019de69d3c", "54fb417e408722a409c9ebfba769ac0f"),
    defineTurnaroundSheet("95f54a99-c8c2-4f0a-9730-dcf98f233b68", "806ccb1e7afbfe4701983a0f2249bc71", "741a9a3f7fdef6f86c574d3f000b8d20", "dde18bc5536fb96025dbd6fa43ac068f", "95cb31cf3d9ce50e9ef78e61d64ff451", "fb5b1cf517fb740a38e400515eaf9f48"),
    defineTurnaroundSheet("a2b43c76-68eb-401b-8391-cc904a150ddf", "ee921d48b14a0b34fd8ab74d4262a2e8", "edc63aa485afd2e5efc708c7fbf458a5", "7f87e7ea8b3c4ac3cdd3c1aae2a1ebcf", "aba55e17c8478ee79a05974e5cfb2d91", "61d9441af254686060dc26580d80cb46"),
    defineTurnaroundSheet("f18a1134-2161-40a1-a1d4-d1a080cb8d53", "7af8249b7dcc90c35afe5d82e9b55bd0", "4e1c1367e813504ceab621639707bfce", "363ebb88171149cf500891de3ab38842", "0088492c15c1dd3fa93b4b5185f23260", "94058e6c5df120f1861f3e80cc826dea"),
    defineTurnaroundSheet("a862bf36-157c-41f2-a682-9a90f09592b8", "83e0247dc5636b3c8fe7db6cfa7aa8a9", "c4c6f921950143659d7dfdd05484cca6", "74153844bc518345298545079afe64c1", "0c06765659e3d6aa2af5f392b003a29c", "f2e8a29c453a3ac6158f45f4b4058eab"),
    defineTurnaroundSheet("88a25861-222a-41c7-8f6d-7ea2d3654893", "118b31c63cb802ef53334fb21271c353", "c852f66e7f50b2b691d042ff1b69c302", "9f8bd26b695dae48ef77b2c82fb5d09b", "b4aa13ee4ec34cb3c2dfbb8e72d4d943", "c429df1a6d2c5919e4377fd9481e2232"),
    defineTurnaroundSheet("71c2e285-ae67-4c4f-b8da-f3e26cb4060e", "3e6ef54f70305dae6d902e22a4b99e96", "be77053f6645a36513b20428b07d00f0", "3f62de7050a618157a8682e4b5140e1d", "4b8b76fee65d87c0947eab4bf95aa59e", "0a79e93efea941fad5b9cfa3a284ddfb"),
    defineTurnaroundSheet("6eb1aa31-a7ae-477f-989e-aef95f6b9e17", "b849ef0d16d8fad2b668e1f096e205d9", "a189a2b5c75c4fb24c67bbfc382153b9", "dda0b1f8a45f77161cd053ba00fa8ea6", "a401cb879a0c22c2bf271fe5f9a72494", "c09245bb858b9499ee0d124ba0ca8cc8"),
    defineTurnaroundSheet("175130d4-f388-462d-b81e-30489b9fb452", "5ff731a0f1820f2a26858bb68d965d6c", "c37964d55a20119540f145c582124fd1", "96884d425a55ac5e32dfa84fa803fd0c", "e383101dc411bf81df2d4e007ef6ddc9", "8d71e7a49e4664876c978a53507f9814"),
    defineTurnaroundSheet("d7397009-ee87-4b88-be73-0436f35a442f", "a909d67a6b26eeb8a41c976e4eed77e3", "339feae4532ddf34fe652c3a9691d7c8", "329f1e66e6ff25889b8b7d816f689f34", "66be8f8f3a8881ca304d49894c9c6ea7", "5a901bd873f0d1222054f9daff931e10"),
    defineTurnaroundSheet("e004bb6d-c232-4a1e-9713-4bc1527295b9", "354a869ad4aacd38fa53aba860e11f7d", "c18f3cf5e47e59da2cb3cd176c043fd0", "0ecc49d1732517c2542bf9c9389f459c", "3add179fe2dda0d04370b1833aa99589", "355cfbb93231fe265abf7600b764dd44"),
    defineTurnaroundSheet("3d9b42f3-6525-47c5-ab53-7ace454de7b3", "69f67757d2a197c1eb1ba142524142d6", "a8462c1143dca00a1cb4f96ad4040311", "767af18ddedb8f1662874603307cd5a6", "a7f7e10189f0b51be785a51d29d9196e", "48b19838682a2886c4d85873277dbe22"),
    defineTurnaroundSheet("1291351b-da0c-44fb-a347-2af286cd5fa3", "6c4a47e016394e21c4923fe2eefea467", "e3656860d9b8686e3226d815d9be2d6d", "7150c7b7e234bf73b81b45cea6f46569", "1133ada9afdabc75b0c2047f99b3eaa7", "b66cb57972bc2462fb958d241a754787"),
    defineTurnaroundSheet("abf9e72c-25ed-4a80-80ef-9a1d080f0723", "22e31ceabaee048334b08c6b18531e11", "a608de3e586b88f8a9f4ff4d0037d994", "7af8bd77142358d88d49e50ccb9d37fc", "2b915c0914877352ec2c9593ce200dc4", "ce2348158204db107c9b9a6daecea4b2"),
    defineTurnaroundSheet("863529f3-44ff-4992-b171-25e0e9a89f30", "1f8cf972c0d0948f2b35399139a85365", "6be195d58119332353b960405201b083", "d126150cd7e4f54fc1bea2e4073a5a2a", "5296016c0ad5ae0f63bb182cfdb567e3", "bcfca0dbab86ee715199222a9b4d909f"),
    defineTurnaroundSheet("7abb6ea8-0660-45b5-b379-17fe98530400", "042d6fcf17b0eea7cf517b4b453dc14e", "a5162370ec08d39ef029e5e5c6815acd", "fff45343a604d2707e19e51359c65687", "d5ff46baf0182c5281345a9a3d6eff11", "6c05d292b6ad14f8756d757b27f550c1"),
    defineTurnaroundSheet("853f098a-780e-4358-8cf6-d3c0b6b632a5", "51c101fc7996e642d6f57e1bdd57e9a0", "7e614a7cb1a2352b154708ecd35d58b8", "bff697122fa8f40ef63322bbda2f7b49", "3c84dbc249947f3d577811a4fed9fe81", "f11da5a3f33eaa6775b52ec73be472b9"),
    defineTurnaroundSheet("d5a34bfb-0750-42ea-9d02-770ca72fecba", "605e15e3799c1d0885349ed0a869a1ce", "015058522c7dbaac69805a64530d83fb", "c6b596aebc8d073a9c9ad4e7d68fdecb", "e987ea55ecff54211bcfeccd9b40c562", "c1bfc76e943c3841b73d1e788e1a06d7"),
    defineTurnaroundSheet("78b09913-a54a-4367-9a2d-323b029c04e8", "ded59b8eb8cbeeeffc67159efdf4589f", "763b4b23c3a339072e3a384455614ca4", "d1f7619e92111d45cb815d602ee2b17b", "078bc5bd27658ba78954751e69d9c678", "f6e0999a91b7bb259e13df28f9c3d41b"),
    defineTurnaroundSheet("c3430f64-4d8a-4b2f-a8ca-2fcfff718298", "9de04f0ab16b2a03086d8bc870d7e091", "70e8cdf65240aa24471b9808511f57ca", "e232145ffb7feac426817482fb04fd60", "904220950734fea6708c706cf379387c", "001860260c0e6dc9a59a84c0028f9d75"),
    defineTurnaroundSheet("e911ddc0-4c04-4ff1-ba3e-614f143a323f", "4072dc42d2717f448200ac3a31d3dff1", "933508fa0ce6aad3aebb3c306ecc737c", "6fc5ac7750f2cb473ff40d2250c938a2", "bed723bd4b5ed547db8503995b20b7ff", "c68af493d02ee40de3a80171703f5911"),
    defineTurnaroundSheet("6e6d7ae4-4657-428a-9bf3-699dbd53c30c", "89389238df694b2d362198307f198374", "d128f52fe93b64ec8108d966f187aa51", "ad587207510c24b2ecccecfd7c9bdbbf", "2da8c59aab166fa60835061630ea53cd", "920d6f0e2046b1e861111b2659c0423e"),
    defineTurnaroundSheet("15be5f97-9adf-4728-9af1-b23ae8db5828", "876b36dd524fc1996fabf1e97a14273b", "321b15524d24d0d07cacd085d1a82db5", "b03572f7d5485ddada8a1a26fc2c4581", "6e2d9131613c5fa5f08fbac437bacaa9", "4bafd092b8c91c66c6ae762be315eec1"),
    defineTurnaroundSheet("6871de5c-9532-4790-9627-88d03bf380f5", "f65ba87dd37d521ee745c8bffc2d0fb8", "08b57b060118640aaba804ef0abc2a3b", "4482d5710a91f872efbdde4c7a185a64", "273cff6eaa7aad012bdd41f42a12b88c", "9b351c94435be67205aefd945d7a07dd"),
    defineTurnaroundSheet("31298178-e181-466c-96ed-8409a8b6a4e9", "6ef850ec78a446ba7a1973b7b81cb613", "053fc52938b58b7d7cb4700703eea04a", "478f9e8593c3eeeb4a799f2214037547", "ab4181f08fb32dcc06f6699f4a8d7692", "6255d59a9e5cf4e52707225239f02dfe"),
    defineTurnaroundSheet("28f98934-96b4-4310-8d65-b8909dc29c7c", "167833a4c3f4e54152b035a944159293", "690fa6c2c68189b67aaa36ecb6c3a335", "ad16715bef4ab163fdee3ff2a0205bf6", "537c850f51811942535bc8eadfb1d30e", "07c3f3b06751734697015ea362934070"),
    defineTurnaroundSheet("3ca15b08-a618-4a00-af03-344c043dabab", "8739f103fc0ca8622350cf2153e1d5db", "8aed5691ef1b6314d5023f5c8861b4ec", "97030e4077556ec4b1f57254fd4c4732", "d4864f7c57605777d2aecaf464b23fc7", "3042fbccbc211d66ec02bc7b5f79facd"),
    defineTurnaroundSheet("c5730e12-c9c6-4208-acd8-0882cd0c72ac", "50ba0888a46c94a833ed8c393cf83b74", "cc5c1f5a6649f4e87e7f45dfff37a7ab", "2a4b95ce97f30988b92fa26bba85d4af", "4405c3ed246fbdfe025833959377c8aa", "0d8e1c1cd5583794f9d82d7169c37187"),
    defineTurnaroundSheet("a5987805-3843-42ce-92f1-8b324bfef1ba", "2b9d8ac495e8d561c5c845b8f3b21389", "3356d9ad9ced9646beb5a88d4e7f3ab2", "dc66c627d0ad0993b24da24ec1171fe1", "fe56626d87a99d637a1f57cfa982c539", "4ce2b6c6475c89a30ac1e5a9c4db3235"),
    defineTurnaroundSheet("f5474631-4f9d-4e20-b6d6-adb8bf2f0d99", "e0a2cff4eb463ded23d26f3ad2b90333", "a71feb53a9391b23c1fff62490e5ead5", "157d87e6a5e3604926fef85637133bb8", "6aa27a1d3fc247a473acf372038403db", "fa6e8d39b5cecd3f713f80a91796dcb6"),
    defineTurnaroundSheet("1fc57182-e8c8-436f-a438-db19a98ec8ef", "3aa29161d245143e07f3db144d8e12ba", "44a23a2d601c6a9a1ca40d64c7fbdd6d", "f2f27aa5ceccc32e21918b211f56f8bc", "b32a1efbd5be4706a79792d4f28af8da", "e495f8e22d325649a761c9a992fc83fa"),
    defineTurnaroundSheet("982a572f-45d4-4bd2-85e8-d468db2d4fdc", "41b54ee4e8feb125287a885275e5d83e", "29dd1e62b4df05d1a0846df085a589aa", "14a38a525a5ee2e7b01e16ee3144e18d", "9becd3a62b24d6d674bac74471039f2a", "cf954c90d7efa47a55c83a7cc5bf33e1"),
    defineTurnaroundSheet("f79d5896-8a21-4980-b599-579206f4b3db", "2412715fe59011b75cde9bbc9c479a25", "d719c1864f5ab966e756af2e698a6383", "8449d50b5cfffb32fed7052db67fbe11", "cbac271d651bc0d5f85a6860b5cf207e", "ec11cf4565ba93c8e3d7dba4feb227a1"),
    defineTurnaroundSheet("1606ae10-0ab5-4f9f-992e-7c0386e8fa7f", "e7f1740a5f9d9d63959071561bb6c9c8", "205bfe0ef600a00282b12becfa8ea812", "f8370627b7885c07d67f9829e7545ca5", "36a48db9392a3476c98f2c442fa3ed06", "a89ac1b4b2d75899f8027a9fe08dc7e9"),
    defineTurnaroundSheet("36c1cfc0-4757-427d-a851-71c0251dac8f", "16883f7240cff16dc50b0fd8eeda46e5", "a23e24596f50d3d00790bbbb5386facd", "d61f808ad841e3007f47208498db1919", "749d6a2ee1040988e927b805d1f260cb", "149d92089581f612bf4251e9a01bb57c"),
    defineTurnaroundSheet("61238180-24a5-49f1-b235-dca19e2f7f61", "f6b6a6eee22c54554b903ad0110ce7de", "15c4514d310a3626b1babcba87dbcea2", "dda211efeb45735006237fa835d0b3ea", "bb6eff1bd995a2bd974881cadc3fe828", "eb757c971a89aa3e79600723368a8119"),
    defineTurnaroundSheet("980d031b-ea87-4661-aaf7-b2eeb1512d7a", "6162d26ef00445bcb019f1617aabf24c", "e1957270c4b72700f809f0eed4181797", "e01831584612f9d3b02dca3ed4361904", "b97ace20c7aeef5530b36b95bd4a87d7", "f5eaa8757a60af87c93b3a56e3526ffb"),
    defineTurnaroundSheet("4bc99848-b7b9-42b8-bf68-82e6705c9590", "77fdb40cdde7c122de079050bdab2c28", "f535689ba5bd8244cd973daca92f947c", "580f371ade08a75aa68f82ffb5787a6a", "f5b81778b4fbb5f45a38426e956c86c8", "55d4f23ffa0c17ca677185e28b553510"),
    defineTurnaroundSheet("e5505b05-484e-4f1a-a32d-2db2633a66cf", "efacc87de3a4d385ceffa2e6c6e685ca", "71d031f5d9f0b654a42999dbec50ba42", "e2fb7347aec82598dc27918efba938a7", "7995efe3fb49c063a8e5f563d88fbf7f", "513720b686c0984608dde3145ee43629"),
    defineTurnaroundSheet("a1361927-2e20-4d13-98e5-970d48d087a8", "015f684aa3e3f3a5fd0533f552bc5c29", "4ebd0093241909ccba39572bf5dcca6b", "c3fe6a7955ac35b0a0c4b03b8a199562", "78191e86554dd80844ff23a66fa5beee", "20ffc89027e40d49edf530d3c44b9228"),
  ]);

export function findAsset3dTurnaroundForReferenceImage(
  referenceImagePath: string,
): StudioAsset3dCompletedTurnaroundSheet | null {
  return (
    STUDIO_ASSET3D_COMPLETED_TURNAROUND_SHEETS.find(
      (entry) => entry.referenceImagePath === referenceImagePath,
    ) ?? null
  );
}

export interface StudioAsset3dCharacterLabLoadoutSummary {
  readonly archetype: StudioAsset3dCharacterArchetypeEntry;
  readonly equippedItems: readonly StudioAsset3dCharacterLabModularItem[];
  readonly totalPolygonBudget: number;
  readonly attachedBones: readonly string[];
  readonly genreSynergyScore: number;
  readonly primaryTurnaround: StudioAsset3dMultiviewTurnaround | null;
}

export function resolveAsset3dTurnaroundViewUrl(
  turnaround: StudioAsset3dMultiviewTurnaround,
  angle: StudioAsset3dTurnaroundAngle,
): string {
  const pathByAngle: Record<StudioAsset3dTurnaroundAngle, string> = {
    front: turnaround.frontPath,
    back: turnaround.backPath,
    left: turnaround.leftPath,
    right: turnaround.rightPath,
  };
  return `${STUDIO_ASSET3D_CLOUD_BASE_URL}${pathByAngle[angle]}`;
}

export function composeAsset3dCharacterLabLoadout(input: {
  readonly archetypeId: string;
  readonly itemIds: readonly string[];
}): StudioAsset3dCharacterLabLoadoutSummary {
  const archetype =
    STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES.find((entry) => entry.id === input.archetypeId) ??
    STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES[0]!;

  const bySlot = new Map<StudioAsset3dCharacterLabSlot, StudioAsset3dCharacterLabModularItem>();
  for (const itemId of input.itemIds) {
    const item = STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS.find((entry) => entry.id === itemId);
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
    primaryTurnaround:
      equippedItems[0]?.multiviewTurnaround ??
      findAsset3dTurnaroundForReferenceImage(archetype.referenceImagePath),
  };
}

export interface StudioAsset3dDioramaPlacementPlan {
  readonly diorama: StudioAsset3dIsometricDioramaEntry;
  readonly props: readonly StudioAsset3dWebtoonPropEntry[];
  readonly totalFootprintAreaSqMeters: number;
  readonly recommendedShadowBias: number;
  readonly varcoAssetPortalUrl: string;
  readonly turnaroundSheet: StudioAsset3dCompletedTurnaroundSheet | null;
  readonly mappedBg3dTemplateId: string;
}

export function mapAsset3dDioramaToBg3dTemplateId(dioramaId: string): string {
  const diorama =
    STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES.find((entry) => entry.id === dioramaId) ??
    STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES[0]!;
  if (
    diorama.id === "diorama_modern_cafe" ||
    diorama.id === "diorama_studio_oneroom" ||
    diorama.id === "diorama_chaebol_penthouse" ||
    diorama.id === "diorama_webtoon_creator_studio" ||
    diorama.id === "diorama_open_office"
  ) {
    return "modern-cafe-terrace";
  }
  if (
    diorama.id === "diorama_convenience_store_patio" ||
    diorama.id === "diorama_residential_alley" ||
    diorama.id === "diorama_traditional_market" ||
    diorama.id === "diorama_subway_car" ||
    diorama.id === "diorama_hospital_room"
  ) {
    return "convenience-store-night";
  }
  switch (diorama.genre) {
    case "romance-fantasy":
      return "rofan-palace-ballroom";
    case "murim":
      return "murim-bamboo-pavilion";
    case "hunter-action":
      return "hunter-dungeon-boss-gate";
    case "cyberpunk":
      return "cyberpunk-neon-alley";
    case "joseon-historical":
      return "joseon-palace-courtyard";
    case "daily-school":
    default:
      return "school-classroom-sunset";
  }
}

export function evaluateAsset3dDioramaScenePlacement(input: {
  readonly dioramaId: string;
  readonly propIds: readonly string[];
}): StudioAsset3dDioramaPlacementPlan {
  const diorama =
    STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES.find((entry) => entry.id === input.dioramaId) ??
    STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES[0]!;

  const props = input.propIds
    .map((propId) => STUDIO_ASSET3D_WEBTOON_PROP_ASSETS.find((entry) => entry.id === propId))
    .filter((entry): entry is StudioAsset3dWebtoonPropEntry => Boolean(entry));

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
    varcoAssetPortalUrl: `${STUDIO_ASSET3D_CLOUD_BASE_URL}/myAssets/${diorama.meshTaskId}`,
    turnaroundSheet: findAsset3dTurnaroundForReferenceImage(diorama.referenceImagePath),
    mappedBg3dTemplateId: mapAsset3dDioramaToBg3dTemplateId(diorama.id),
  };
}

export type StudioAsset3dMannequinPosePresetId =
  | "standing"
  | "walking"
  | "running"
  | "sitting"
  | "action"
  | "contrapposto"
  | "dramatic"
  | "webtoon-lookback";

export interface StudioAsset3dArchetypeMannequinApplication {
  readonly archetype: StudioAsset3dCharacterArchetypeEntry;
  readonly motionTask: StudioAsset3dRetargetedMotionTaskPreset | null;
  readonly posePresetId: StudioAsset3dMannequinPosePresetId;
  readonly mannequinSliders: {
    readonly heightCm: number;
    readonly headCount: number;
    readonly build: number;
    readonly shoulderWidth: number;
    readonly hipWidth: number;
  };
  readonly bodySliders: {
    readonly heightHeads: number;
    readonly shoulderWidthRatio: number;
    readonly waistRatio: number;
    readonly hipRatio: number;
    readonly legLengthRatio: number;
    readonly armLengthRatio: number;
    readonly muscleMass: number;
    readonly neckLengthRatio: number;
  };
}

export function resolveAsset3dArchetypeMannequinApplication(input: {
  readonly archetypeId: string;
  readonly animTaskId?: string | null;
}): StudioAsset3dArchetypeMannequinApplication {
  const archetype =
    STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES.find((entry) => entry.id === input.archetypeId) ??
    STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES[0]!;
  const motionTask = input.animTaskId
    ? (STUDIO_ASSET3D_RETARGETED_MOTION_TASKS.find((entry) => entry.animTaskId === input.animTaskId) ??
      null)
    : (STUDIO_ASSET3D_RETARGETED_MOTION_TASKS.find((entry) => entry.archetypeId === archetype.id) ??
      null);

  const fbx = motionTask?.animationFbx ?? "standing_idle_1";
  let posePresetId: StudioAsset3dMannequinPosePresetId = "standing";
  if (fbx === "walk") posePresetId = "walking";
  else if (fbx === "run" || fbx === "sprint") posePresetId = "running";
  else if (fbx === "sit_on_chair" || fbx === "crouch_kneel_idle") posePresetId = "sitting";
  else if (
    fbx === "kneel_combat_idle" ||
    fbx === "forward_roll" ||
    fbx === "rope_swing_down" ||
    fbx === "basketball_shot" ||
    fbx === "jump_in_place"
  ) {
    posePresetId = "action";
  } else if (fbx === "dragon_wing_idle" || fbx === "shuffle_dance" || fbx === "arm_wave_dance") {
    posePresetId = "dramatic";
  } else if (fbx === "gesture_talk" || fbx === "explain_talk" || fbx === "drink") {
    posePresetId = "contrapposto";
  }

  const clampedHeads = Math.min(9.5, Math.max(3.0, archetype.headTallRatio));
  const isAthletic =
    archetype.genre === "hunter-action" ||
    archetype.genre === "murim" ||
    archetype.headTallRatio >= 8.5;
  const heightCm =
    archetype.headTallRatio <= 4.5
      ? 125
      : archetype.headTallRatio >= 8.5
        ? 185
        : archetype.headTallRatio >= 8.0
          ? 176
          : 168;

  return {
    archetype,
    motionTask,
    posePresetId,
    mannequinSliders: {
      heightCm,
      headCount: clampedHeads,
      build: isAthletic ? 1.8 : 0.9,
      shoulderWidth: isAthletic ? 1.16 : 0.98,
      hipWidth: isAthletic ? 0.96 : 1.0,
    },
    bodySliders: {
      heightHeads: clampedHeads,
      shoulderWidthRatio: isAthletic ? 1.16 : 1.02,
      waistRatio: isAthletic ? 0.88 : 0.92,
      hipRatio: 0.98,
      legLengthRatio: clampedHeads >= 8.5 ? 0.56 : clampedHeads <= 6.5 ? 0.46 : 0.52,
      armLengthRatio: clampedHeads >= 8.5 ? 1.05 : 1.0,
      muscleMass: isAthletic ? 0.62 : 0.32,
      neckLengthRatio: clampedHeads >= 8.5 ? 1.08 : 1.0,
    },
  };
}

export interface StudioAsset3dLocalGlbAsset {
  readonly id: string;
  readonly labelKo: string;
  readonly publicUrl: `/models/varco3d/${string}.glb`;
  readonly source: "3d.varco.ai/api/models" | "varco3d-worldbuild";
  readonly modelId: string;
  readonly category:
    | "character_pipeline"
    | "character_featured"
    | "character_shaper"
    | "diorama"
    | "prop"
    | "worldbuild_diorama"
    | "showcase";
  readonly stage: string;
}

export const STUDIO_ASSET3D_LOCAL_GLB_ASSETS: readonly StudioAsset3dLocalGlbAsset[] = [
  { id: "varco_char_student_council_coarse", labelKo: "학원물 학생회장 (Coarse 메쉬)", publicUrl: "/models/varco3d/varco_char_student_council_coarse.glb", source: "3d.varco.ai/api/models", modelId: "462f9a1fbc40957845144b044459b1f2c5d9888a7a47eaa80ae41f8a1f202e4b", category: "character_pipeline", stage: "coarse" },
  { id: "varco_char_student_council_remesh_quad", labelKo: "학원물 학생회장 (Quad 리메쉬)", publicUrl: "/models/varco3d/varco_char_student_council_remesh_quad.glb", source: "3d.varco.ai/api/models", modelId: "502e0f6ca423eea9bd03458c81016396ed8d276dbef077308103143a85f3651c", category: "character_pipeline", stage: "remesh_quad" },
  { id: "varco_char_student_council_remesh_tri", labelKo: "학원물 학생회장 (Tri 리메쉬)", publicUrl: "/models/varco3d/varco_char_student_council_remesh_tri.glb", source: "3d.varco.ai/api/models", modelId: "3da8b9c8310ff93db24635ed7826f86ee4542c912f3b7c1fb5caeec1d35b29d0", category: "character_pipeline", stage: "remesh_tri" },
  { id: "varco_char_student_council_highpoly", labelKo: "학원물 학생회장 (HighPoly)", publicUrl: "/models/varco3d/varco_char_student_council_highpoly.glb", source: "3d.varco.ai/api/models", modelId: "ece362870eecb83390d1d84022f0d28bb5ccf796fb3b367c5d62d6376a3d6212", category: "character_pipeline", stage: "highpoly" },
  { id: "varco_char_student_council_pbr", labelKo: "학원물 학생회장 (4K PBR 텍스처)", publicUrl: "/models/varco3d/varco_char_student_council_pbr.glb", source: "3d.varco.ai/api/models", modelId: "b583069f434b589a491857c45ca5b76f32d2eb99e5aee3bf0bfc86e784df959d", category: "character_pipeline", stage: "pbr_textured" },
  { id: "varco_char_student_council_rigged", labelKo: "학원물 학생회장 (mixamo52 AI 리깅)", publicUrl: "/models/varco3d/varco_char_student_council_rigged.glb", source: "3d.varco.ai/api/models", modelId: "6df9274b69f28be22edcb31cccf53d6a7115eb6ddaaa12223b5bd462826c0c9e", category: "character_pipeline", stage: "rigged_mixamo52" },
  { id: "varco_char_student_council_standing_idle", labelKo: "학원물 학생회장 (Standing Idle 모션)", publicUrl: "/models/varco3d/varco_char_student_council_standing_idle.glb", source: "3d.varco.ai/api/models", modelId: "2ca3bd80793e92c40b8a4943d64f7301b815780cab6a9e2e4a2c2f1fc993f635", category: "character_pipeline", stage: "animated_standing_idle_1" },
  { id: "varco_diorama_hallway_remesh_quad", labelKo: "고등학교 복도 디오라마 (Quad 리메쉬)", publicUrl: "/models/varco3d/varco_diorama_hallway_remesh_quad.glb", source: "3d.varco.ai/api/models", modelId: "240d44460015d3733d6033cfd6e479acabd11a73083ce404e61853dc1d5fae65", category: "diorama", stage: "remesh_quad" },
  { id: "varco_prop_school_desk_remesh_quad", labelKo: "교실 책걸상 프롭 (Quad 리메쉬)", publicUrl: "/models/varco3d/varco_prop_school_desk_remesh_quad.glb", source: "3d.varco.ai/api/models", modelId: "037e45ce67daa757286a9ea5a4cfb75680abc2654995239482c12d96b78c14b9", category: "prop", stage: "remesh_quad" },
  { id: "varco_featured_character_pbr_a", labelKo: "VARCO 피처드 캐릭터 A (PBR)", publicUrl: "/models/varco3d/varco_featured_character_pbr_a.glb", source: "3d.varco.ai/api/models", modelId: "454118c968415f270ddf25cdadaa449e74c66cb7c1f2472426e4a3e5811a6094", category: "character_featured", stage: "pbr_textured" },
  { id: "varco_featured_character_pbr_b", labelKo: "VARCO 피처드 캐릭터 B (PBR)", publicUrl: "/models/varco3d/varco_featured_character_pbr_b.glb", source: "3d.varco.ai/api/models", modelId: "43731d1bf6fbbd054df3c887c8a9901737d2cecd41a301baeba6b26154c86409", category: "character_featured", stage: "pbr_textured" },
  { id: "varco_showcase_mesh_a", labelKo: "VARCO 쇼케이스 메쉬 A", publicUrl: "/models/varco3d/varco_showcase_mesh_a.glb", source: "3d.varco.ai/api/models", modelId: "f9f3ddb72db71d977ebdb1e34058c48b4139ac7f0a5f710f090532ae17ff8d44", category: "showcase", stage: "highpoly" },
  { id: "varco_showcase_mesh_b", labelKo: "VARCO 쇼케이스 메쉬 B", publicUrl: "/models/varco3d/varco_showcase_mesh_b.glb", source: "3d.varco.ai/api/models", modelId: "0bc4ab20be8941d38bc82d9af5cc9a12a1f3a25da0160c2a4020842452810fb5", category: "showcase", stage: "highpoly" },
  { id: "varco_showcase_mesh_c", labelKo: "VARCO 쇼케이스 메쉬 C", publicUrl: "/models/varco3d/varco_showcase_mesh_c.glb", source: "3d.varco.ai/api/models", modelId: "b440ca03db8242161ffa308b7deb217a37af9eebb99189672e7d2d0bd38d5092", category: "showcase", stage: "highpoly" },
  { id: "cafe-espresso-bar", labelKo: "카페 에스프레소 바 월드빌드", publicUrl: "/models/varco3d/cafe-espresso-bar.glb", source: "varco3d-worldbuild", modelId: "cafe-espresso-bar", category: "worldbuild_diorama", stage: "pbr_ready" },
  { id: "classroom-podium-desk", labelKo: "교실 교탁·칠판 월드빌드", publicUrl: "/models/varco3d/classroom-podium-desk.glb", source: "varco3d-worldbuild", modelId: "classroom-podium-desk", category: "worldbuild_diorama", stage: "pbr_ready" },
  { id: "cyberpunk-holo-kiosk", labelKo: "사이버펑크 홀로그램 키오스크", publicUrl: "/models/varco3d/cyberpunk-holo-kiosk.glb", source: "varco3d-worldbuild", modelId: "cyberpunk-holo-kiosk", category: "worldbuild_diorama", stage: "pbr_ready" },
  { id: "hunter-awakening-altar", labelKo: "헌터 각성 제단 월드빌드", publicUrl: "/models/varco3d/hunter-awakening-altar.glb", source: "varco3d-worldbuild", modelId: "hunter-awakening-altar", category: "worldbuild_diorama", stage: "pbr_ready" },
  { id: "medical-iv-monitor", labelKo: "응급실 바이탈 모니터·폴대", publicUrl: "/models/varco3d/medical-iv-monitor.glb", source: "varco3d-worldbuild", modelId: "medical-iv-monitor", category: "worldbuild_diorama", stage: "pbr_ready" },
  { id: "murim-sword-rack", labelKo: "무림 연무장 검가대", publicUrl: "/models/varco3d/murim-sword-rack.glb", source: "varco3d-worldbuild", modelId: "murim-sword-rack", category: "worldbuild_diorama", stage: "pbr_ready" },
  { id: "noir-neon-streetlamp", labelKo: "느와르 뒷골목 네온 가로등", publicUrl: "/models/varco3d/noir-neon-streetlamp.glb", source: "varco3d-worldbuild", modelId: "noir-neon-streetlamp", category: "worldbuild_diorama", stage: "pbr_ready" },
  { id: "rofan-golden-throne", labelKo: "로판 황금 알현실 왕좌", publicUrl: "/models/varco3d/rofan-golden-throne.glb", source: "varco3d-worldbuild", modelId: "rofan-golden-throne", category: "worldbuild_diorama", stage: "pbr_ready" },
  { id: "shaper-cyber-visor", labelKo: "캐릭터 셰이퍼: 사이버 바이저", publicUrl: "/models/varco3d/shaper-cyber-visor.glb", source: "varco3d-worldbuild", modelId: "shaper-cyber-visor", category: "character_shaper", stage: "pbr_ready" },
  { id: "shaper-hunter-mana-gauntlet", labelKo: "캐릭터 셰이퍼: 마나 건틀릿", publicUrl: "/models/varco3d/shaper-hunter-mana-gauntlet.glb", source: "varco3d-worldbuild", modelId: "shaper-hunter-mana-gauntlet", category: "character_shaper", stage: "pbr_ready" },
  { id: "shaper-murim-jade-sword", labelKo: "캐릭터 셰이퍼: 비취 보검", publicUrl: "/models/varco3d/shaper-murim-jade-sword.glb", source: "varco3d-worldbuild", modelId: "shaper-murim-jade-sword", category: "character_shaper", stage: "pbr_ready" },
  { id: "shaper-rofan-tiara", labelKo: "캐릭터 셰이퍼: 황실 티아라", publicUrl: "/models/varco3d/shaper-rofan-tiara.glb", source: "varco3d-worldbuild", modelId: "shaper-rofan-tiara", category: "character_shaper", stage: "pbr_ready" },
] as const;

export function resolveAsset3dLocalGlbAsset(
  idOrModelId: string,
): StudioAsset3dLocalGlbAsset {
  return (
    STUDIO_ASSET3D_LOCAL_GLB_ASSETS.find(
      (item) => item.id === idOrModelId || item.modelId === idOrModelId,
    ) ?? STUDIO_ASSET3D_LOCAL_GLB_ASSETS[5]!
  );
}
