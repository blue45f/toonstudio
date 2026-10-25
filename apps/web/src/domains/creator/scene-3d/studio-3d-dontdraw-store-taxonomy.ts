/**
 * studio-3d-dontdraw-store-taxonomy.ts
 *
 * 돈드로우(DontDraw, https://www.dontdraw.com/) · 에이콘3D(ACON3D) · 텀블벅(Tumblbug)
 * REA 역공학 증거(`ev_4d76ddc32c5f1ca5607359ca2709b6b494cf22fe54edc0f0db16eb7bd085aca8`,
 * `ev_8dc39f905d683f4d7df6c3d9ede00202816e2dfb78a01ff98315b0a6da97c95c`) 기반
 * 웹툰 3D 배경·소품·360도 파노라마 분류 체계(Taxonomy) 및 다중 포맷 번들 검증 엔진.
 */

export type DontDrawAssetFormatBadgeId =
  | "skp"
  | "cs3o"
  | "cs3c"
  | "clip"
  | "laf"
  | "db"
  | "blend"
  | "fbx"
  | "obj"
  | "mtl"
  | "pdf";

export type DontDrawTopCategoryId =
  | "bg-modern"
  | "bg-fantasy"
  | "bg-east-west"
  | "package-bundle"
  | "props-materials"
  | "panorama-360";

export interface DontDrawSubCategorySpec {
  readonly id: string;
  readonly cateNo: number;
  readonly parentId: DontDrawTopCategoryId;
  readonly label: string;
  readonly keywords: readonly string[];
  readonly recommendedFovDeg: number;
}

export interface DontDrawTopCategorySpec {
  readonly id: DontDrawTopCategoryId;
  readonly cateNo: number;
  readonly label: string;
  readonly description: string;
  readonly subCategories: readonly DontDrawSubCategorySpec[];
}

export interface DontDrawAssetFormatSpec {
  readonly id: DontDrawAssetFormatBadgeId;
  readonly extension: `.${string}`;
  readonly label: string;
  readonly targetApplication: "SketchUp" | "ClipStudioPaint" | "Blender" | "Universal3D" | "GuideDoc";
  readonly supportsDynamicRigOrComponents: boolean;
}

export interface DontDrawPanorama360DomePreset {
  readonly id: string;
  readonly title: string;
  readonly categoryId: DontDrawTopCategoryId;
  readonly timeOfDay: "morning" | "day" | "sunset" | "night";
  readonly resolutionPx: readonly [number, number];
  readonly equirectangularAspectRatio: "2:1";
  readonly horizonElevationDeg: number;
  readonly defaultSunAzimuthDeg: number;
  readonly compatibleFormats: readonly DontDrawAssetFormatBadgeId[];
}

export interface DontDrawAssetBundleValidationResult {
  readonly isValid: boolean;
  readonly supportedFormats: readonly DontDrawAssetFormatBadgeId[];
  readonly unknownFormats: readonly string[];
  readonly supportsSketchUpDirect: boolean;
  readonly supportsClipStudioDirect: boolean;
  readonly supportsBlenderOrFbxPipeline: boolean;
  readonly hasLicenseGuidePdf: boolean;
  readonly recommendedImportRoute:
    | "sketchup-skp-to-glb"
    | "clipstudio-cs3o-direct"
    | "universal-fbx-obj"
    | "unsupported";
}

export const DONTDRAW_ASSET_FORMAT_BADGES: readonly DontDrawAssetFormatSpec[] = [
  {
    id: "skp",
    extension: ".skp",
    label: "SketchUp 3D 배경 원본 (SKP)",
    targetApplication: "SketchUp",
    supportsDynamicRigOrComponents: true,
  },
  {
    id: "cs3o",
    extension: ".cs3o",
    label: "클립스튜디오 3D 오브젝트 (CS3O)",
    targetApplication: "ClipStudioPaint",
    supportsDynamicRigOrComponents: true,
  },
  {
    id: "cs3c",
    extension: ".cs3c",
    label: "클립스튜디오 3D 캐릭터·인체 (CS3C)",
    targetApplication: "ClipStudioPaint",
    supportsDynamicRigOrComponents: true,
  },
  {
    id: "clip",
    extension: ".clip",
    label: "클립스튜디오 전용 캔버스·소재 (CLIP)",
    targetApplication: "ClipStudioPaint",
    supportsDynamicRigOrComponents: false,
  },
  {
    id: "laf",
    extension: ".laf",
    label: "클립스튜디오 오토액션 세트 (LAF)",
    targetApplication: "ClipStudioPaint",
    supportsDynamicRigOrComponents: false,
  },
  {
    id: "db",
    extension: ".db",
    label: "소재 카탈로그 데이터베이스 (DB)",
    targetApplication: "ClipStudioPaint",
    supportsDynamicRigOrComponents: false,
  },
  {
    id: "blend",
    extension: ".blend",
    label: "Blender 3D 프로젝트 (BLEND)",
    targetApplication: "Blender",
    supportsDynamicRigOrComponents: true,
  },
  {
    id: "fbx",
    extension: ".fbx",
    label: "범용 3D 메쉬·리깅 (FBX)",
    targetApplication: "Universal3D",
    supportsDynamicRigOrComponents: true,
  },
  {
    id: "obj",
    extension: ".obj",
    label: "범용 정적 3D 지오메트리 (OBJ)",
    targetApplication: "Universal3D",
    supportsDynamicRigOrComponents: false,
  },
  {
    id: "mtl",
    extension: ".mtl",
    label: "OBJ 재질 정의 사이드카 (MTL)",
    targetApplication: "Universal3D",
    supportsDynamicRigOrComponents: false,
  },
  {
    id: "pdf",
    extension: ".pdf",
    label: "사용 설명서·카탈로그·라이선스 보증서 (PDF)",
    targetApplication: "GuideDoc",
    supportsDynamicRigOrComponents: false,
  },
] as const;

export const DONTDRAW_STORE_TAXONOMY: readonly DontDrawTopCategorySpec[] = [
  {
    id: "bg-modern",
    cateNo: 10002,
    label: "3D 배경 · 현대",
    description: "현대물·학원물·오피스·스릴러 웹툰을 위한 도시·주거·학교·관공서·상업시설 3D 배경",
    subCategories: [
      {
        id: "modern-city-street",
        cateNo: 10012,
        parentId: "bg-modern",
        label: "도시/마을/거리",
        keywords: ["도시", "거리", "골목", "횡단보도", "번화가", "빌딩숲"],
        recommendedFovDeg: 50,
      },
      {
        id: "modern-residence",
        cateNo: 10013,
        parentId: "bg-modern",
        label: "주거 내/외부",
        keywords: ["아파트", "자취방", "오피스텔", "거실", "침실", "펜트하우스", "주택"],
        recommendedFovDeg: 45,
      },
      {
        id: "modern-office-broadcast",
        cateNo: 10014,
        parentId: "bg-modern",
        label: "회사/공장/방송",
        keywords: ["사무실", "회의실", "대표실", "방송국", "스튜디오", "공장", "창고"],
        recommendedFovDeg: 42,
      },
      {
        id: "modern-school-public",
        cateNo: 10015,
        parentId: "bg-modern",
        label: "교육/공공/관공서",
        keywords: ["학교", "교실", "복도", "옥상", "경찰서", "취조실", "법원", "병원", "응급실"],
        recommendedFovDeg: 40,
      },
      {
        id: "modern-restaurant-cafe",
        cateNo: 10016,
        parentId: "bg-modern",
        label: "식당/카페",
        keywords: ["카페", "레스토랑", "포장마차", "술집", "베이커리", "주방"],
        recommendedFovDeg: 42,
      },
      {
        id: "modern-commercial-culture",
        cateNo: 10017,
        parentId: "bg-modern",
        label: "상가/문화",
        keywords: ["백화점", "편의점", "영화관", "공연장", "전시관", "체육관"],
        recommendedFovDeg: 46,
      },
      {
        id: "modern-lodging-travel",
        cateNo: 10018,
        parentId: "bg-modern",
        label: "숙박/여행",
        keywords: ["호텔", "리조트", "공항", "기차역", "여객선", "캠핑장"],
        recommendedFovDeg: 48,
      },
      {
        id: "modern-nature-park",
        cateNo: 10019,
        parentId: "bg-modern",
        label: "자연/공원",
        keywords: ["공원", "산책로", "강변", "해변", "숲길"],
        recommendedFovDeg: 52,
      },
      {
        id: "modern-misc",
        cateNo: 10020,
        parentId: "bg-modern",
        label: "현대 기타",
        keywords: ["지하주차장", "엘리베이터", "지하철", "비상계단"],
        recommendedFovDeg: 48,
      },
    ],
  },
  {
    id: "bg-fantasy",
    cateNo: 10003,
    label: "3D 배경 · 판타지",
    description: "로맨스판타지·회빙환·액션판타지 웹툰을 위한 황궁·영지·아카데미·연회장·던전 3D 배경",
    subCategories: [
      {
        id: "fantasy-city-village",
        cateNo: 10021,
        parentId: "bg-fantasy",
        label: "도시/마을/거리",
        keywords: ["성채도시", "중세거리", "광장", "상점가", "항구도시"],
        recommendedFovDeg: 50,
      },
      {
        id: "fantasy-imperial-mansion",
        cateNo: 10022,
        parentId: "bg-fantasy",
        label: "주거/저택/황실",
        keywords: ["황실", "황궁", "알현실", "공작저", "대공저", "집무실", "침전"],
        recommendedFovDeg: 38,
      },
      {
        id: "fantasy-academy-office",
        cateNo: 10023,
        parentId: "bg-fantasy",
        label: "교육/공공/사무",
        keywords: ["아카데미", "마법학회", "대도서관", "신전", "기사단", "훈련장"],
        recommendedFovDeg: 42,
      },
      {
        id: "fantasy-banquet-commercial",
        cateNo: 10024,
        parentId: "bg-fantasy",
        label: "상가/문화/연회",
        keywords: ["연회장", "무도회장", "오페라하우스", "의상실", "보석상", "주점"],
        recommendedFovDeg: 44,
      },
      {
        id: "fantasy-garden-greenhouse",
        cateNo: 10025,
        parentId: "bg-fantasy",
        label: "자연/정원/온실",
        keywords: ["유리온실", "황실정원", "미로정원", "분수대", "티파티", "가제보"],
        recommendedFovDeg: 40,
      },
      {
        id: "fantasy-dungeon-underground",
        cateNo: 10026,
        parentId: "bg-fantasy",
        label: "던전/지하/기타",
        keywords: ["던전", "보스방", "지하감옥", "고대유적", "마법진", "동굴"],
        recommendedFovDeg: 54,
      },
    ],
  },
  {
    id: "bg-east-west",
    cateNo: 10004,
    label: "3D 배경 · 동/서양 시대극",
    description: "동양 사극·무협·선협 및 서양 고전 시대극 전용 건축·거리·내실 배경",
    subCategories: [
      {
        id: "east-joseon-murim",
        cateNo: 10041,
        parentId: "bg-east-west",
        label: "동양 사극/무협",
        keywords: ["조선", "한옥", "궁궐", "저막", "주막", "객잔", "무림맹", "누각"],
        recommendedFovDeg: 38,
      },
      {
        id: "west-classical-victorian",
        cateNo: 10042,
        parentId: "bg-east-west",
        label: "서양 근세/빅토리아",
        keywords: ["빅토리아", "증기기관차", "고딕성당", "살롱", "시계탑"],
        recommendedFovDeg: 44,
      },
    ],
  },
  {
    id: "package-bundle",
    cateNo: 10005,
    label: "3D 배경 · 올인원 패키지",
    description: "장르별 내·외부 세트를 통합 구성한 시즌/에피소드 전용 패키지 번들",
    subCategories: [
      {
        id: "package-genre-fullset",
        cateNo: 10051,
        parentId: "package-bundle",
        label: "장르 풀세트 패키지",
        keywords: ["패키지", "풀세트", "번들", "합본", "올인원"],
        recommendedFovDeg: 42,
      },
    ],
  },
  {
    id: "props-materials",
    cateNo: 10006,
    label: "3D 소품/소재",
    description: "캐릭터 손·포즈와 직접 상호작용하는 탈것, 무기, 장신구, 음식/식기 CS3O·SKP 소재",
    subCategories: [
      {
        id: "props-vehicles",
        cateNo: 10008,
        parentId: "props-materials",
        label: "탈것 (마차/자동차)",
        keywords: ["마차", "황실마차", "세단", "스포츠카", "오토바이", "전함", "선박"],
        recommendedFovDeg: 45,
      },
      {
        id: "props-weapons",
        cateNo: 10009,
        parentId: "props-materials",
        label: "무기 (도검/마법구/총기)",
        keywords: ["장검", "레이피어", "단검", "마법지팡이", "활", "권총", "창"],
        recommendedFovDeg: 35,
      },
      {
        id: "props-costume-jewelry",
        cateNo: 10010,
        parentId: "props-materials",
        label: "의상/장신구",
        keywords: ["티아라", "왕관", "목걸이", "영애모자", "부채", "안경", "회중시계"],
        recommendedFovDeg: 32,
      },
      {
        id: "props-food-tableware",
        cateNo: 10011,
        parentId: "props-materials",
        label: "음식/식기/주방",
        keywords: ["홍차", "찻잔", "디저트", "스테이크", "와인잔", "국밥", "수라상"],
        recommendedFovDeg: 34,
      },
    ],
  },
  {
    id: "panorama-360",
    cateNo: 10035,
    label: "360도 파노라마",
    description: "클립스튜디오 및 3D 스카이돔에서 회전 카메라 배경으로 즉시 사용하는 Equirectangular 360° 환경맵",
    subCategories: [
      {
        id: "panorama-sky-city-fantasy",
        cateNo: 10035,
        parentId: "panorama-360",
        label: "360도 전방위 파노라마 스카이돔",
        keywords: ["파노라마", "360도", "스카이돔", "하늘", "야경", "노을", "우주"],
        recommendedFovDeg: 60,
      },
    ],
  },
] as const;

export const DONTDRAW_360_PANORAMA_DOME_PRESETS: readonly DontDrawPanorama360DomePreset[] = [
  {
    id: "pano-seoul-night-skyline",
    title: "현대 서울 도심 야경 360° 파노라마 돔",
    categoryId: "panorama-360",
    timeOfDay: "night",
    resolutionPx: [8192, 4096],
    equirectangularAspectRatio: "2:1",
    horizonElevationDeg: 0,
    defaultSunAzimuthDeg: 210,
    compatibleFormats: ["cs3o", "clip", "skp", "obj"],
  },
  {
    id: "pano-imperial-garden-sunset",
    title: "로판 황실 대정원 노을 360° 파노라마 돔",
    categoryId: "panorama-360",
    timeOfDay: "sunset",
    resolutionPx: [8192, 4096],
    equirectangularAspectRatio: "2:1",
    horizonElevationDeg: -4,
    defaultSunAzimuthDeg: 265,
    compatibleFormats: ["cs3o", "clip", "skp", "blend"],
  },
  {
    id: "pano-highschool-rooftop-day",
    title: "현대 고등학교 옥상 청명한 정오 360° 파노라마 돔",
    categoryId: "panorama-360",
    timeOfDay: "day",
    resolutionPx: [8192, 4096],
    equirectangularAspectRatio: "2:1",
    horizonElevationDeg: 2,
    defaultSunAzimuthDeg: 145,
    compatibleFormats: ["cs3o", "clip", "skp"],
  },
  {
    id: "pano-murim-cliff-morning",
    title: "무협 운해 절벽 새벽 안개 360° 파노라마 돔",
    categoryId: "panorama-360",
    timeOfDay: "morning",
    resolutionPx: [8192, 4096],
    equirectangularAspectRatio: "2:1",
    horizonElevationDeg: -8,
    defaultSunAzimuthDeg: 85,
    compatibleFormats: ["cs3o", "clip", "skp", "fbx"],
  },
] as const;

const KNOWN_FORMAT_SET = new Set<string>(DONTDRAW_ASSET_FORMAT_BADGES.map((item) => item.id));

/**
 * 돈드로우·에이콘3D·텀블벅 소재 패키지의 파일 확장자/포맷 배지 목록을 검증하고
 * 최적의 ToonStudio 반입 파이프라인 경로를 판정한다.
 */
export function validateDontDrawAssetFormatBundle(
  rawFormats: readonly string[],
): DontDrawAssetBundleValidationResult {
  const supported: DontDrawAssetFormatBadgeId[] = [];
  const unknown: string[] = [];

  for (const raw of rawFormats) {
    const normalized = raw.trim().replace(/^\./u, "").toLowerCase();
    if (!normalized) continue;
    if (KNOWN_FORMAT_SET.has(normalized)) {
      const badge = normalized as DontDrawAssetFormatBadgeId;
      if (!supported.includes(badge)) {
        supported.push(badge);
      }
    } else if (!unknown.includes(normalized)) {
      unknown.push(normalized);
    }
  }

  const supportsSketchUpDirect = supported.includes("skp");
  const supportsClipStudioDirect =
    supported.includes("cs3o") || supported.includes("cs3c") || supported.includes("clip");
  const supportsBlenderOrFbxPipeline =
    supported.includes("blend") || supported.includes("fbx") || supported.includes("obj");
  const hasLicenseGuidePdf = supported.includes("pdf");

  let recommendedImportRoute: DontDrawAssetBundleValidationResult["recommendedImportRoute"] =
    "unsupported";
  if (supportsSketchUpDirect) {
    recommendedImportRoute = "sketchup-skp-to-glb";
  } else if (supportsClipStudioDirect) {
    recommendedImportRoute = "clipstudio-cs3o-direct";
  } else if (supportsBlenderOrFbxPipeline) {
    recommendedImportRoute = "universal-fbx-obj";
  }

  return {
    isValid: supported.length > 0 && unknown.length === 0,
    supportedFormats: supported,
    unknownFormats: unknown,
    supportsSketchUpDirect,
    supportsClipStudioDirect,
    supportsBlenderOrFbxPipeline,
    hasLicenseGuidePdf,
    recommendedImportRoute,
  };
}

export interface DontDrawTaxonomyMatchResult {
  readonly topCategoryId: DontDrawTopCategoryId;
  readonly topCategoryLabel: string;
  readonly subCategoryId: string;
  readonly subCategoryLabel: string;
  readonly cateNo: number;
  readonly matchedKeywords: readonly string[];
  readonly recommendedFovDeg: number;
  readonly recommendedPanoramaDome: DontDrawPanorama360DomePreset;
}

/**
 * 대본/지문 텍스트에서 돈드로우 2계층 배경·소품 카테고리와 360도 파노라마 돔을 자동 추천한다.
 */
export function matchDontDrawStoreCategoryByScript(
  scriptText: string,
): DontDrawTaxonomyMatchResult {
  const normalized = scriptText.trim().toLowerCase();

  let bestSub: DontDrawSubCategorySpec = DONTDRAW_STORE_TAXONOMY[1]!.subCategories[1]!;
  let bestTop: DontDrawTopCategorySpec = DONTDRAW_STORE_TAXONOMY[1]!;
  let bestMatched: string[] = [];

  for (const top of DONTDRAW_STORE_TAXONOMY) {
    for (const sub of top.subCategories) {
      const hits = sub.keywords.filter((kw) => normalized.includes(kw.toLowerCase()));
      if (hits.length > bestMatched.length) {
        bestMatched = hits;
        bestSub = sub;
        bestTop = top;
      }
    }
  }

  let panorama = DONTDRAW_360_PANORAMA_DOME_PRESETS[0]!;
  if (bestTop.id === "bg-fantasy") {
    panorama = DONTDRAW_360_PANORAMA_DOME_PRESETS[1]!;
  } else if (bestSub.id === "modern-school-public") {
    panorama = DONTDRAW_360_PANORAMA_DOME_PRESETS[2]!;
  } else if (bestTop.id === "bg-east-west") {
    panorama = DONTDRAW_360_PANORAMA_DOME_PRESETS[3]!;
  }

  return {
    topCategoryId: bestTop.id,
    topCategoryLabel: bestTop.label,
    subCategoryId: bestSub.id,
    subCategoryLabel: bestSub.label,
    cateNo: bestSub.cateNo,
    matchedKeywords: bestMatched,
    recommendedFovDeg: bestSub.recommendedFovDeg,
    recommendedPanoramaDome: panorama,
  };
}
