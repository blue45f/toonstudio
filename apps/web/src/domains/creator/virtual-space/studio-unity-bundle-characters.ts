/**
 * studio-unity-bundle-characters.ts
 *
 * itch.io "Creator Bundle: Volume 1" 의 캐릭터 팩 전용 카탈로그.
 * studio-unity-bundle-catalog.ts (팩 전수 분류) 를 대체하지 않고, 캐릭터가
 * 포함된 팩만 골라 팩 페이지에서 실제로 확인한 스펙(리그·애니메이션·
 * 모듈러·폴리곤·텍스처·포맷)과 ToonStudio 캐릭터 표면별 활용 판정을
 * 데이터로 고정한다.
 *
 * 표기 원칙: 팩 페이지에서 읽은 것만 적는다. 확인되지 않은 항목은
 * null + note 의 "미확인" 표기로 정직하게 남긴다. 실제 모델 파일은 이
 * 레포에 없으며, 본 이름·리타깃 성립 같은 항목은 인제스션 후 실물로만
 * 확정된다 (상세는 um-character-review/NOTES.md).
 *
 * 사용 원칙 (사용자 확정): 서비스 안에서만 사용·이용되는 구조.
 * 단 RG Poly 캐릭터 팩 2종은 팩 페이지·itch 메타데이터에 CC0 가 명시돼
 * 있어 라이선스 제약 자체가 없다 (아래 license 필드 참조).
 */

export type UnityBundleCharacterLicense = "CC0" | "EmaceArt Asset License";

export type UnityBundleCharacterSurface =
  | "avatar-skin"
  | "crowd"
  | "pose-reference"
  | "vrm-conversion"
  | "character-lab-fixture";

export type UnityBundleSurfaceVerdict = "yes" | "conditional" | "no";

export interface UnityBundleCharacterPack {
  /** studio-unity-bundle-catalog.ts 의 팩 id 재사용 */
  packId: string;
  title: string;
  creator: "EmaceArt" | "RG Poly";
  /** 팩 페이지에서 확인한 라이선스 표기 */
  license: UnityBundleCharacterLicense;
  sourceUrl: string;
  characters: {
    /** 기본 캐릭터 모델 수. 페이지 미표기면 null */
    baseModels: number | null;
    /** 색상·의상 등 전체 변형 수. 페이지 미표기면 null */
    variations: number | null;
    note: string;
  };
  rig: {
    /** 페이지 표기 그대로의 리그 성격 */
    kind: "shared-skeleton" | "custom" | "generic" | "custom-humanoid" | "unknown";
    /** 본 수. 페이지 미표기면 null */
    bones: number | null;
    /** 손가락·눈·입 본 포함이 페이지에 명시된 경우만 true/false, 아니면 null */
    fingersEyesMouth: boolean | null;
    /** Unity Humanoid 아바타 네이티브 호환 여부. 페이지 명시 기준, 아니면 null(미확인) */
    unityHumanoidNative: boolean | null;
    note: string;
  };
  animations: {
    /** 페이지 표기 총수. 목록만 있고 총수가 없으면 null */
    count: number | null;
    countLabel: string;
    kinds: readonly string[];
  };
  modular: {
    /** 교체 파츠 수(의상·헤어·액세서리 합산 표기가 있을 때). 없으면 null */
    parts: number | null;
    note: string;
  };
  /** 캐릭터 1체 폴리곤 표기. 페이지 미표기면 null */
  polycountPerCharacter: string | null;
  /** 텍스처 방식 표기. 페이지 미표기면 null */
  textures: string | null;
  /** 페이지에서 확인한 포맷만. 명시가 없으면 null */
  formats: readonly string[] | null;
  surfaces: Record<UnityBundleCharacterSurface, UnityBundleSurfaceVerdict>;
  /** 투입 전에 필요한 변환·준비 작업 */
  conversionWork: readonly string[];
}

export const UNITY_BUNDLE_CHARACTER_SURFACE_LABELS: Record<UnityBundleCharacterSurface, string> = {
  "avatar-skin": "가상스튜디오 아바타 스킨",
  crowd: "배경 군중·엑스트라",
  "pose-reference": "마네킹·포즈 레퍼런스",
  "vrm-conversion": "VRM 변환 투입",
  "character-lab-fixture": "character-lab 테스트 소재",
};

export const UNITY_BUNDLE_CHARACTER_PACKS: readonly UnityBundleCharacterPack[] = [
  {
    packId: "cbv1-003-cartoon-characters-1",
    title: "Cartoon Characters 1 (Cartoon City Massive Pack — Characters)",
    creator: "RG Poly",
    license: "CC0",
    sourceUrl: "https://rg-poly.itch.io/cartoon-city-massive-pack-characters",
    characters: {
      baseModels: 27,
      variations: 306,
      note: "단독 캐릭터 페이지 표기 308 models. Cartoon City 본편 페이지 표기는 캐릭터 27종·306변형으로, 번들의 Cartoon City 팩 내장 캐릭터와 동일 콘텐츠로 보인다 (파일 동일성은 실물 대조 필요). 좀비 캐릭터 포함.",
    },
    rig: {
      kind: "shared-skeleton",
      bones: null,
      fingersEyesMouth: null,
      unityHumanoidNative: null,
      note: "페이지 표기: fully rigged, 전 캐릭터 공용 스켈레톤·공용 애니메이션 세트. City 본편 페이지에 'Humanoid Armature' 표기가 있으나 Unity Humanoid 아바타 호환 여부는 페이지로 확정 불가 (미확인).",
    },
    animations: {
      count: null,
      countLabel: "40+",
      kinds: [
        "walk (A/B/C)",
        "idle (A/B)",
        "jump (A/B/C + start/in-air/falling)",
        "running (A/B)",
        "fight punch (A/B/C)",
        "fight hit (A/B/C)",
        "fight idle / pose / combo",
        "fight death / death",
        "looking around",
        "armed pistol (idle/hit/shoot/walk)",
        "zombie (attack/death/hit/idle/scream/walk)",
      ],
    },
    modular: {
      parts: null,
      note: "페이지 표기: 색상 변형·의상(outfits)·피부톤(skin tones) 변형. 파츠 단위 교체 구조인지는 미확인.",
    },
    polycountPerCharacter: null,
    textures:
      "City 본편 페이지 기준: 오브젝트 약 95%가 공용 1024×1024 아틀라스 1장(머티리얼 3종), 캐릭터는 헤어 머티리얼 분리(헤어 색상 교체 용이).",
    formats: ["fbx", "godot", "blend"],
    surfaces: {
      "avatar-skin": "conditional",
      crowd: "yes",
      "pose-reference": "yes",
      "vrm-conversion": "conditional",
      "character-lab-fixture": "yes",
    },
    conversionWork: [
      "실물 FBX에서 본 이름·구조를 확인해 Unity Humanoid 매핑 성립 여부를 확정",
      "공용 스켈레톤이라 스킨 교체는 모델 스왑 + 팔레트/헤어 색상 교체로 설계 가능 (변형 306종)",
      "VRM 투입 시 휴머노이드 본 매핑 + T-pose 정렬 오프라인 변환 필요 (CC0라 변환본 취급에 라이선스 제약 없음)",
    ],
  },
  {
    packId: "cbv1-007-cartoon-characters-2",
    title: "Cartoon Characters 2 — Low Poly Cute",
    creator: "RG Poly",
    license: "CC0",
    sourceUrl: "https://rg-poly.itch.io/characters-2",
    characters: {
      baseModels: 21,
      variations: 886,
      note: "변형 886종은 색상 변형 중심(페이지 표기). 무료판은 애니메이션 없는 캐릭터 10종(FBX·Blend).",
    },
    rig: {
      kind: "unknown",
      bones: null,
      fingersEyesMouth: null,
      unityHumanoidNative: null,
      note: "페이지에 리그 구조 표기 없음. 애니메이션 40종이 붙어 있어 리깅 자체는 전제되나 본 구조·Humanoid 호환은 미확인.",
    },
    animations: {
      count: 40,
      countLabel: "40",
      kinds: ["페이지에 종류 목록 없음 (총수만 표기)"],
    },
    modular: {
      parts: null,
      note: "모델 교체 + 색상 변형 방식. 의상 파츠 분리 여부는 미확인.",
    },
    polycountPerCharacter: "평균 2,468",
    textures: "텍스처 2장 1024×1024, 머티리얼 4종.",
    formats: ["godot", "fbx", "unity-fbx"],
    surfaces: {
      "avatar-skin": "conditional",
      crowd: "yes",
      "pose-reference": "yes",
      "vrm-conversion": "conditional",
      "character-lab-fixture": "yes",
    },
    conversionWork: [
      "실물에서 본 구조를 확인해 Humanoid 매핑·리타깃 성립 여부를 확정",
      "군중 다수 배치 시 평균 2,468폴리곤 기준 수량·LOD 관리",
      "VRM 투입 시 휴머노이드 본 매핑 오프라인 변환 필요 (CC0라 라이선스 제약 없음)",
    ],
  },
  {
    packId: "cbv1-002-slavic-medieval-villagers",
    title: "Slavic Medieval Villagers — Modular Low Poly Characters",
    creator: "EmaceArt",
    license: "EmaceArt Asset License",
    sourceUrl: "https://emaceart.itch.io/slavic-medieval-villagers-modular-low-poly-characters",
    characters: {
      baseModels: 2,
      variations: null,
      note: "Village Man / Village Woman 2개 원형, 프리팹 23종. Slavica 메가팩 내장 캐릭터와 중복되는 콘텐츠 (아래 cbv1-021 항목 참조).",
    },
    rig: {
      kind: "custom",
      bones: 63,
      fingersEyesMouth: true,
      unityHumanoidNative: false,
      note: "페이지 명시: 커스텀 리그 63본(손가락·눈·입 포함), Unity Humanoid·Mecanim 네이티브 비호환. 애니메이션 컨버터로 Humanoid 변환 가능함을 페이지가 명시.",
    },
    animations: {
      count: 25,
      countLabel: "25",
      kinds: ["idle 5", "walk 5", "sit 3", "작업 소품 연동 모션 등 기타"],
    },
    modular: {
      parts: 24,
      note: "여성 파츠 8(반다나 3·드레스 3·헤어 2) + 남성 파츠 16(조끼 4·신발 3·헤어 2·모자 2·수염 2·바지 2·셔츠 1), 작업 소품 액세서리 8종(도끼·빗자루·주전자·상자·양동이·망치·머그·갈퀴) 별도.",
    },
    polycountPerCharacter: "약 1K (소품 포함 약 4K)",
    textures: "머티리얼 4종·컬러 텍스처 4장, 단일 팔레트 워크플로.",
    formats: null,
    surfaces: {
      "avatar-skin": "conditional",
      crowd: "yes",
      "pose-reference": "yes",
      "vrm-conversion": "conditional",
      "character-lab-fixture": "conditional",
    },
    conversionWork: [
      "Generic 애니메이션 그대로 쓰거나, 페이지가 안내하는 컨버터 경로로 Humanoid 변환 후 무대 아바타 애니메이션 세트와 리타깃",
      "VRM 투입 시 63본 중 휴머노이드 본 매핑(손가락 본 보유는 유리) + 표정 본(눈·입)을 VRM 표정으로 연결하는 오프라인 변환 필요",
      "EmaceArt 라이선스: 변환본도 서비스 내 전용 유지 — 아바타 VRM 다운로드·내보내기 제공 금지",
    ],
  },
  {
    packId: "cbv1-021-slavica-medieval-village",
    title: "Slavica — Slavic Medieval Village (내장 캐릭터)",
    creator: "EmaceArt",
    license: "EmaceArt Asset License",
    sourceUrl: "https://emaceart.itch.io/slavica",
    characters: {
      baseModels: 2,
      variations: null,
      note: "남성 프리팹 14종(애니메이션 15)·여성 프리팹 13종(애니메이션 10), 테마 액세서리 11종. 단독 Villagers 팩과 캐릭터 콘텐츠가 겹친다 — 인제스션 시 중복 수확 주의.",
    },
    rig: {
      kind: "custom",
      bones: null,
      fingersEyesMouth: null,
      unityHumanoidNative: false,
      note: "페이지 명시: characters use a custom rig, not Unity Humanoid — 애니메이션 컨버터 에셋이 변환을 담당한다고 표기.",
    },
    animations: {
      count: 25,
      countLabel: "25 (남 15 + 여 10)",
      kinds: ["페이지에 종류 목록 없음 (프리팹별 수만 표기)"],
    },
    modular: {
      parts: null,
      note: "페이지 표기: 의상 20·헤어스타일 4·수염 4 (모듈러 남녀 캐릭터).",
    },
    polycountPerCharacter: null,
    textures: "팩 전체 단일 컬러 팔레트 아틀라스(4K 아틀라스 텍스처 표기, 캐릭터 전용인지는 미확인).",
    formats: ["unity", "glb", "fbx"],
    surfaces: {
      "avatar-skin": "conditional",
      crowd: "yes",
      "pose-reference": "yes",
      "vrm-conversion": "conditional",
      "character-lab-fixture": "conditional",
    },
    conversionWork: [
      "Villagers 단독 팩과 중복 — 어느 한쪽만 인제스션 대상으로 지정",
      "Humanoid 변환(컨버터) 또는 Generic 유지 중 택일 후 무대 투입",
      "EmaceArt 라이선스: 변환본도 서비스 내 전용 유지",
    ],
  },
  {
    packId: "cbv1-009-art-deco-victorian-citizens",
    title: "ART DECO Victorian Citizens — Modular Low Poly Characters",
    creator: "EmaceArt",
    license: "EmaceArt Asset License",
    sourceUrl: "https://emaceart.itch.io/art-deco-victorian-citizens-modular-low-poly-characters",
    characters: {
      baseModels: 3,
      variations: null,
      note: "Citizen Male / Citizen Female / Butcher 3개 원형, 각 전용 스킨. Harboria 내장 캐릭터 10종 중 시민 3종과 동일 인물 (아래 cbv1-005 항목 참조).",
    },
    rig: {
      kind: "custom",
      bones: 60,
      fingersEyesMouth: null,
      unityHumanoidNative: false,
      note: "페이지 명시: 커스텀 리그 60본, Unity Humanoid·Mecanim 네이티브 비호환, 애니메이션 컨버터로 Humanoid 변환 가능. 손가락·눈·입 본 포함 여부는 페이지 미표기 (미확인).",
    },
    animations: {
      count: 21,
      countLabel: "21 (남 4 + 여 11 + 도축업자 6)",
      kinds: ["idle", "walk", "sit", "leaning"],
    },
    modular: {
      parts: 30,
      note: "여성 8(드레스 2·헤어 3·모자 3) + 남성 15(수염 3·헤어 4·모자 3·콧수염 5) + Butcher 7(앞치마 3·셔츠 2·헤어 2), 액세서리 5종(지팡이·식칼 2·우산 2) 별도.",
    },
    polycountPerCharacter: "약 1K (소품 포함 약 4K)",
    textures: "머티리얼 6종·컬러 텍스처 6장, 단일 팔레트 워크플로.",
    formats: null,
    surfaces: {
      "avatar-skin": "conditional",
      crowd: "yes",
      "pose-reference": "yes",
      "vrm-conversion": "conditional",
      "character-lab-fixture": "conditional",
    },
    conversionWork: [
      "Harboria 내장분과 중복 — 어느 한쪽만 인제스션 대상으로 지정",
      "Humanoid 변환(컨버터) 또는 Generic 유지 중 택일 후 무대 투입",
      "EmaceArt 라이선스: 변환본도 서비스 내 전용 유지 — 아바타 VRM 다운로드·내보내기 제공 금지",
    ],
  },
  {
    packId: "cbv1-005-harboria-victorian-town",
    title: "Harboria — Victorian Town (내장 캐릭터)",
    creator: "EmaceArt",
    license: "EmaceArt Asset License",
    sourceUrl: "https://emaceart.itch.io/harboria",
    characters: {
      baseModels: 10,
      variations: null,
      note: "시민 3종(Citizen Male/Female, Butcher — Victorian Citizens 단독 팩과 동일) + 몬스터 7종, 부착물(attachments) 35종.",
    },
    rig: {
      kind: "generic",
      bones: null,
      fingersEyesMouth: null,
      unityHumanoidNative: false,
      note: "페이지 명시: characters use a generic rig, not the Humanoid mechanism — 애니메이션 변환 가이드가 팩에 포함됨.",
    },
    animations: {
      count: 24,
      countLabel: "24",
      kinds: ["페이지에 종류 목록 없음 (총수만 표기)"],
    },
    modular: {
      parts: 35,
      note: "부착물 35종 표기. 의상 파츠 교체 구조의 상세는 미확인.",
    },
    polycountPerCharacter: "시민 3종 각 약 1K (몬스터는 페이지 미표기)",
    textures: "팩 전체 아틀라스 3장 4K (World/Walls/Posters — 캐릭터 전용 아님).",
    formats: ["unity", "fbx"],
    surfaces: {
      "avatar-skin": "conditional",
      crowd: "yes",
      "pose-reference": "yes",
      "vrm-conversion": "conditional",
      "character-lab-fixture": "conditional",
    },
    conversionWork: [
      "몬스터 7종은 아바타보다 배경 연출·이벤트 NPC 쪽이 적합",
      "시민 3종은 Victorian Citizens 단독 팩과 중복 — 한쪽만 지정",
      "Generic 리그 애니메이션 변환 가이드(팩 동봉) 기준으로 변환 또는 Generic 유지",
      "EmaceArt 라이선스: 변환본도 서비스 내 전용 유지",
    ],
  },
  {
    packId: "cbv1-010-philipp-modular-character",
    title: "PHILIPP — Stylized Modular Low Poly Character",
    creator: "EmaceArt",
    license: "EmaceArt Asset License",
    sourceUrl: "https://emaceart.itch.io/philipp-stylized-modular-low-poly-character",
    characters: {
      baseModels: 2,
      variations: null,
      note: "Tourist / Sportsman 2개 원형, 각 스킨 2종, 프리팹 12종(애니메이터·애니메이션 컴포넌트 부착 완료 표기).",
    },
    rig: {
      kind: "custom-humanoid",
      bones: null,
      fingersEyesMouth: null,
      unityHumanoidNative: null,
      note: "페이지 표기: custom humanoid rig. 다른 EmaceArt 팩과 달리 Humanoid 비호환 명시가 없어 매핑 성립 여지는 있으나 페이지로 확정 불가 (미확인).",
    },
    animations: {
      count: 10,
      countLabel: "10",
      kinds: ["idle 5 (카메라·병 소품 연동 포함)", "sit 2 (지도·단순)", "walk 2", "run 1"],
    },
    modular: {
      parts: 20,
      note: "의상 10(관광객 5 + 러너 5: 모자·티셔츠·바지·신발·목걸이) + 액세서리 6(가방 2·카메라·고글·병·지도) + 추가 4(수염 2·헤어(대머리 옵션)·눈썹).",
    },
    polycountPerCharacter: "약 1K",
    textures: "단일 컬러 아틀라스 텍스처, 스탠다드 셰이더.",
    formats: null,
    surfaces: {
      "avatar-skin": "conditional",
      crowd: "yes",
      "pose-reference": "yes",
      "vrm-conversion": "conditional",
      "character-lab-fixture": "conditional",
    },
    conversionWork: [
      "단일 대표 캐릭터라 아바타 기본 스킨·튜토리얼 안내자·데모 장면 주인공 용도가 적합",
      "Humanoid 매핑 성립을 실물로 확인하면 VRM 변환 파일럿 1순위 후보",
      "EmaceArt 라이선스: 변환본도 서비스 내 전용 유지",
    ],
  },
] as const;
