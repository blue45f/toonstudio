/**
 * Curated environment catalog for Studio BG3D.
 *
 * Original CC0 scenes and explicitly licensed provider-generated scenes share the same immutable
 * deployment metadata. Runtime bytes still pass through the same SHA-256,
 * GLB structure, device-budget, and Three.js admission path as a user-imported model.
 */

import refinedV6Manifest from "../../../../public/assets/3d/environments/refined-v6/manifest.json";
import refinedV6RenderPassesReport from "../../../../public/assets/3d/environments/refined-v6/render-passes-report.json";
import expansionV1Manifest from "../../../../public/assets/3d/environments/expansion-v1/manifest.json";
import webtoonV7Manifest from "../../../../public/assets/3d/environments/webtoon-v7/manifest.json";
import authoredV1Manifest from "../../../../public/assets/3d/environments/authored-v1/manifest.json";

export const STUDIO_BG3D_ENVIRONMENT_PACK_ID =
  "toonstudio-bg3d-environment-pack-v1" as const;
export const STUDIO_BG3D_ENVIRONMENT_PACK_VERSION = 1 as const;

export type StudioBg3dEnvironmentTheme =
  | "home"
  | "hospitality"
  | "urban"
  | "education"
  | "healthcare"
  | "heritage"
  | "retail"
  | "transit"
  | "fantasy"
  | "science-fiction";

export interface StudioBg3dEnvironmentProvenance {
  readonly origin:
    | "original-procedural"
    | "original-procedural-with-cc0-sources"
    | "ai-generated-free-wallet";
  readonly author: "ToonStudio";
  readonly generator:
    | "scripts/blender/generate_environment_pack_v3.py"
    | "scripts/blender/generate_environment_pack_v4.py"
    | "scripts/blender/generate_environment_pack_v5.py"
    | "scripts/blender/refine_studio_environments_v6.py"
    | "scripts/blender/generate_studio_environment_expansion_v1.py"
    | "scripts/blender/generate_environment_pack_v7.py"
    | "scripts/generate_self_authored_environment_pack_v1.py"
    | "official-tripo-mcp";
  readonly blenderVersion: "5.2";
  readonly license: "CC0-1.0" | "Tripo Terms of Service - Free User Output";
  readonly licenseUrl:
    | "https://creativecommons.org/publicdomain/zero/1.0/"
    | "https://www.tripo3d.ai/terms";
  readonly attributionRequired: false;
  readonly commercialUse: true;
  readonly externalResources: 0;
  readonly sources?: readonly string[];
  readonly provider?: "Tripo";
  readonly providerModelVersion?: "v3.0-20250812";
  readonly providerTaskId?: string;
  readonly promptSha256?: `sha256:${string}`;
  readonly nonExclusive?: true;
  readonly providerRetainsRights?: true;
  readonly billingMode?: "free-api-wallet";
  readonly paymentMethodUsed?: false;
  readonly creditCost?: number;
}

export interface StudioBg3dEnvironmentAsset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly theme: StudioBg3dEnvironmentTheme;
  readonly tags: readonly string[];
  readonly fileName: `${string}.glb`;
  readonly url: `/assets/3d/environments/${string}.glb`;
  readonly thumbnailUrl: `/assets/3d/environments/${string}.png`;
  readonly byteSize: number;
  readonly sha256: `sha256:${string}`;
  /** Width, height, and depth in the glTF Y-up metre convention. */
  readonly bounds: readonly [number, number, number];
  readonly camera: {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
    readonly fovDegrees: number;
  };
  readonly normalization: "authored-metres";
  readonly provenance: StudioBg3dEnvironmentProvenance;
}

const V3_PROVENANCE = Object.freeze({
  origin: "original-procedural",
  author: "ToonStudio",
  generator: "scripts/blender/generate_environment_pack_v3.py",
  blenderVersion: "5.2",
  license: "CC0-1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  attributionRequired: false,
  commercialUse: true,
  externalResources: 0,
} as const);

const V4_PROVENANCE = Object.freeze({
  ...V3_PROVENANCE,
  generator: "scripts/blender/generate_environment_pack_v4.py",
} as const);

const V5_PROVENANCE = Object.freeze({
  ...V3_PROVENANCE,
  generator: "scripts/blender/generate_environment_pack_v5.py",
} as const);

const WEBTOON_V7_PROVENANCE = Object.freeze({
  ...V3_PROVENANCE,
  generator: "scripts/blender/generate_environment_pack_v7.py",
} as const);

function defineEnvironment(
  input: Omit<StudioBg3dEnvironmentAsset, "normalization" | "provenance">,
  provenance: StudioBg3dEnvironmentProvenance = V3_PROVENANCE,
): StudioBg3dEnvironmentAsset {
  return Object.freeze({
    ...input,
    tags: Object.freeze([...input.tags]),
    bounds: Object.freeze([...input.bounds]) as readonly [number, number, number],
    camera: Object.freeze({
      position: Object.freeze([...input.camera.position]) as readonly [number, number, number],
      target: Object.freeze([...input.camera.target]) as readonly [number, number, number],
      fovDegrees: input.camera.fovDegrees,
    }),
    normalization: "authored-metres",
    provenance,
  });
}

export const STUDIO_BG3D_ENVIRONMENT_ASSETS_V3 = Object.freeze([
  defineEnvironment({
    id: "ts-bg3d-compact_apartment_interior-v1",
    name: "콤팩트 아파트",
    description: "주방·거실·침실·식사 공간이 한 프레임에 이어지는 오픈 월 소형 주거 세트",
    theme: "home",
    tags: ["apartment", "interior", "home", "아파트", "원룸", "실내"],
    fileName: "compact_apartment_interior.glb",
    url: "/assets/3d/environments/compact_apartment_interior.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/compact_apartment_interior.png",
    byteSize: 1_520_948,
    sha256: "sha256:c5409d3c3050725fa14afc67f5d63168ead262d352bcd7294018dd8cf11cdde9",
    bounds: [7, 3.2, 6],
    camera: { position: [8.8, 6.8, 9.6], target: [0, 1.25, 0], fovDegrees: 44 },
  }),
  defineEnvironment({
    id: "ts-bg3d-stylized_cafe_interior-v1",
    name: "스타일라이즈드 카페",
    description: "서비스 바·에스프레소 머신·진열장·12석 테이블을 갖춘 밝은 카페 세트",
    theme: "hospitality",
    tags: ["cafe", "coffee", "restaurant", "카페", "커피숍", "실내"],
    fileName: "stylized_cafe_interior.glb",
    url: "/assets/3d/environments/stylized_cafe_interior.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/stylized_cafe_interior.png",
    byteSize: 2_476_104,
    sha256: "sha256:f0e038d48f6906c1316e3cbb633cb92c72a0053091acdb28a83d11b74e9cee2a",
    bounds: [9, 3.6, 7],
    camera: { position: [11.4, 8.1, 12.8], target: [0, 1.35, 0.4], fovDegrees: 44 },
  }),
  defineEnvironment({
    id: "ts-bg3d-urban_neon_alley-v1",
    name: "어반 네온 골목",
    description: "양면 건물·비상계단·배관·간판·젖은 노면을 따라 전후 이동 가능한 야간 골목",
    theme: "urban",
    tags: ["alley", "neon", "cyberpunk", "street", "골목", "야경", "도시"],
    fileName: "urban_neon_alley.glb",
    url: "/assets/3d/environments/urban_neon_alley.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/urban_neon_alley.png",
    byteSize: 2_971_100,
    sha256: "sha256:4506e1d3fe34bfcd2dd754f237047c33d5a749218cdf7fb71266b98374e358e3",
    bounds: [6.8, 7, 14],
    camera: { position: [0, 5.7, 19], target: [0, 2.55, -1], fovDegrees: 44 },
  }),
  defineEnvironment({
    id: "ts-bg3d-classroom_art_studio-v1",
    name: "미술 교실 스튜디오",
    description: "8개 이젤·드로잉 스툴·조각대·물감 수납·개수대를 갖춘 미술 수업 공간",
    theme: "education",
    tags: ["classroom", "art", "studio", "school", "교실", "미술실", "학교"],
    fileName: "classroom_art_studio.glb",
    url: "/assets/3d/environments/classroom_art_studio.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/classroom_art_studio.png",
    byteSize: 2_167_224,
    sha256: "sha256:b0e14d9e45b8181798a09fc675d6c3aadf46bae5a2b24200fe751518c55016d8",
    bounds: [10, 4, 8],
    camera: { position: [12.8, 9.4, 14.2], target: [0, 1.45, 0], fovDegrees: 44 },
  }),
  defineEnvironment({
    id: "ts-bg3d-fantasy_ruin_courtyard-v1",
    name: "판타지 유적 안뜰",
    description: "부서진 열주·3개 석조 아치·룬 분수·덩굴이 둘러싼 원형 판타지 코트야드",
    theme: "fantasy",
    tags: ["fantasy", "ruin", "courtyard", "magic", "판타지", "유적", "마법"],
    fileName: "fantasy_ruin_courtyard.glb",
    url: "/assets/3d/environments/fantasy_ruin_courtyard.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/fantasy_ruin_courtyard.png",
    byteSize: 2_081_960,
    sha256: "sha256:cd7b7aaa142c473b8373c9d666edc2d130ee0735a2290502489d721f1d87cb22",
    bounds: [11.4, 6, 11.4],
    camera: { position: [14.7, 11.2, 16.5], target: [0, 2, 0], fovDegrees: 44 },
  }),
  defineEnvironment({
    id: "ts-bg3d-scifi_command_corridor-v1",
    name: "SF 커맨드 복도",
    description: "반복 리브·서비스 패널·12석 지휘 베이·홀로그램을 잇는 장거리 우주선 복도",
    theme: "science-fiction",
    tags: ["scifi", "corridor", "command", "spaceship", "SF", "우주선", "복도"],
    fileName: "scifi_command_corridor.glb",
    url: "/assets/3d/environments/scifi_command_corridor.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/scifi_command_corridor.png",
    byteSize: 3_486_400,
    sha256: "sha256:a2eff1b6d07f8e09ef2f1deebc240dd5ccb591384bce59d5f092cc4dd0d59821",
    bounds: [7, 4.5, 16],
    camera: { position: [0, 4.9, 20.5], target: [0, 2, -2.8], fovDegrees: 44 },
  }),
] as const satisfies readonly StudioBg3dEnvironmentAsset[]);

export const STUDIO_BG3D_ENVIRONMENT_ASSETS_V4 = Object.freeze([
  defineEnvironment({
    id: "ts-bg3d-hospital_emergency_nurse_station-v1",
    name: "병원 응급실 · 간호 스테이션",
    description: "중앙 간호 스테이션·3개 응급 베이·환자 침대·바이탈 모니터·IV·약품장을 갖춘 의료 세트",
    theme: "healthcare",
    tags: ["hospital", "emergency", "nurse station", "병원", "응급실", "간호 스테이션"],
    fileName: "hospital_emergency_nurse_station.glb",
    url: "/assets/3d/environments/hospital_emergency_nurse_station.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/hospital_emergency_nurse_station.png",
    byteSize: 2_263_556,
    sha256: "sha256:7c08f38b2dfdeb418fadfca4ee24f0e73b92f9b20abcde11f29a67d5dae9a8e6",
    bounds: [12, 4.2, 9],
    camera: { position: [14.2, 9.4, 14.5], target: [0, 1.35, -1], fovDegrees: 46 },
  }, V4_PROVENANCE),
  defineEnvironment({
    id: "ts-bg3d-korean_school_rooftop-v1",
    name: "한국 학교 옥상",
    description: "안전 펜스·계단실·물탱크·태양광 패널·실외기·벤치와 화단이 있는 한국형 학교 옥상",
    theme: "education",
    tags: ["school", "rooftop", "korea", "학교", "옥상", "한국"],
    fileName: "korean_school_rooftop.glb",
    url: "/assets/3d/environments/korean_school_rooftop.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/korean_school_rooftop.png",
    byteSize: 1_871_832,
    sha256: "sha256:00a2ca9dd79b1e4957e94df7e2e9824e7c404e85f98bc45dc4691934d3e18115",
    bounds: [15, 4, 12],
    camera: { position: [18, 12, 18.5], target: [0, 1.15, -0.2], fovDegrees: 46 },
  }, V4_PROVENANCE),
  defineEnvironment({
    id: "ts-bg3d-hanok_market_courtyard-v1",
    name: "한옥 장터 안마당",
    description: "삼면 한옥·격자문·기와지붕·장터 좌판·등롱·옹기가 둘러싼 전통 시장 안마당",
    theme: "heritage",
    tags: ["hanok", "market", "courtyard", "korea", "한옥", "장터", "안마당"],
    fileName: "hanok_market_courtyard.glb",
    url: "/assets/3d/environments/hanok_market_courtyard.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/hanok_market_courtyard.png",
    byteSize: 2_335_872,
    sha256: "sha256:64540cd8540a6e8768152ae78bb908b97853aea064a263b9c43cd9b2373fe766",
    bounds: [16, 4.2, 13],
    camera: { position: [18.5, 11.8, 19], target: [0, 1.45, -0.7], fovDegrees: 46 },
  }, V4_PROVENANCE),
] as const satisfies readonly StudioBg3dEnvironmentAsset[]);

export const STUDIO_BG3D_ENVIRONMENT_ASSETS_V5 = Object.freeze([
  defineEnvironment({
    id: "ts-bg3d-korean_convenience_store_night-v1",
    name: "한국 편의점 · 야간",
    description: "유리 전면·야간 간판·냉장고·진열대·계산대·즉석조리 코너를 갖춘 한국형 편의점 실내",
    theme: "retail",
    tags: ["convenience store", "retail", "night", "korea", "편의점", "야간", "매장"],
    fileName: "korean_convenience_store_night.glb",
    url: "/assets/3d/environments/korean_convenience_store_night.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/korean_convenience_store_night.png",
    byteSize: 3_748_664,
    sha256: "sha256:e31665694ca5ab05e09736d24623a4bfe14cc07b9f60bec261445f7dcf6f476e",
    bounds: [10, 3.8, 8.9],
    camera: { position: [8.8, 8.4, 17.8], target: [0, 1.35, 0.15], fovDegrees: 43 },
  }, V5_PROVENANCE),
  defineEnvironment({
    id: "ts-bg3d-seoul_subway_platform-v1",
    name: "서울 지하철 승강장",
    description: "스크린도어·선로·점자 블록·노선 안내·벤치·기둥·CCTV를 따라 깊게 이동 가능한 도시철도 승강장",
    theme: "transit",
    tags: ["subway", "platform", "transit", "seoul", "지하철", "승강장", "서울"],
    fileName: "seoul_subway_platform.glb",
    url: "/assets/3d/environments/seoul_subway_platform.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/seoul_subway_platform.png",
    byteSize: 3_734_156,
    sha256: "sha256:d5670f9e0240402fbf69308bbbdfb936775c6a3c30420bd693f5747b71598669",
    bounds: [13.9, 4.5, 20],
    camera: { position: [-2.3, 2.25, 9.25], target: [0.2, 1.75, -3], fovDegrees: 38 },
  }, V5_PROVENANCE),
  defineEnvironment({
    id: "ts-bg3d-fantasy_alchemist_workshop_library-v1",
    name: "판타지 연금술 공방 · 서재",
    description: "벽면 서재·중앙 연금술대·가마솥·증류기·포션 선반·수정과 약초가 채워진 마법 공방",
    theme: "fantasy",
    tags: ["fantasy", "alchemy", "workshop", "library", "연금술", "공방", "서재", "판타지"],
    fileName: "fantasy_alchemist_workshop_library.glb",
    url: "/assets/3d/environments/fantasy_alchemist_workshop_library.glb",
    thumbnailUrl: "/assets/3d/environments/thumbnails/fantasy_alchemist_workshop_library.png",
    byteSize: 3_610_428,
    sha256: "sha256:c8aa1be5f39a09b369f21fef47455f1070117947973fdee73c4b24c7e6bf675c",
    bounds: [12, 5.8, 10],
    camera: { position: [15.2, 10.6, 17], target: [0, 2.05, -0.25], fovDegrees: 46 },
  }, V5_PROVENANCE),
] as const satisfies readonly StudioBg3dEnvironmentAsset[]);

export const STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS = Object.freeze([
  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_V3,
  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_V4,
  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_V5,
] as const satisfies readonly StudioBg3dEnvironmentAsset[]);

const REFINED_V6_BY_FILE = new Map(
  refinedV6Manifest.records.map((record) => [record.fileName, record] as const),
);

/** New selection uses the revised bytes. Historical IDs and hashes remain resolvable below. */
export const STUDIO_BG3D_ENVIRONMENT_ASSETS_V6 = Object.freeze(
  STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS.map((original) => {
    const refined = REFINED_V6_BY_FILE.get(original.fileName);
    if (!refined) throw new Error(`Missing refined environment metadata: ${original.fileName}`);
    return defineEnvironment({
      ...original,
      id: original.id.replace(/-v1$/u, "-v6"),
      url: refined.url as StudioBg3dEnvironmentAsset["url"],
      thumbnailUrl: refined.thumbnailUrl as StudioBg3dEnvironmentAsset["thumbnailUrl"],
      byteSize: refined.byteSize,
      sha256: refined.sha256 as `sha256:${string}`,
      bounds: refined.bounds as [number, number, number],
    }, Object.freeze({
      ...V3_PROVENANCE,
      origin: "original-procedural-with-cc0-sources",
      generator: "scripts/blender/refine_studio_environments_v6.py",
      sources: Object.freeze([...refined.sources]),
    }));
  }),
);

export const STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1 = Object.freeze(
  expansionV1Manifest.assets.map((asset) => defineEnvironment({
    id: asset.id,
    name: asset.name,
    description: asset.description,
    theme: asset.theme as StudioBg3dEnvironmentTheme,
    tags: asset.tags,
    fileName: asset.fileName as `${string}.glb`,
    url: asset.url as `/assets/3d/environments/${string}.glb`,
    thumbnailUrl: asset.thumbnailUrl as `/assets/3d/environments/${string}.png`,
    byteSize: asset.byteSize,
    sha256: asset.sha256 as `sha256:${string}`,
    bounds: asset.bounds as [number, number, number],
    camera: {
      position: asset.camera.position as [number, number, number],
      target: asset.camera.target as [number, number, number],
      fovDegrees: asset.camera.fovDegrees,
    },
  }, Object.freeze({
    ...V3_PROVENANCE,
    origin: "original-procedural-with-cc0-sources",
    generator: "scripts/blender/generate_studio_environment_expansion_v1.py",
    sources: Object.freeze([...new Set([
      ...asset.sourceModels.map(({ sourceUrl }) => sourceUrl),
      ...asset.sourceMaterials.map(({ sourceUrl }) => sourceUrl),
    ])]),
  }))),
);

export const STUDIO_BG3D_ENVIRONMENT_ASSETS_WEBTOON_V7 = Object.freeze(
  webtoonV7Manifest.assets.map((asset) => defineEnvironment({
    id: asset.id,
    name: asset.name,
    description: asset.description,
    theme: asset.theme as StudioBg3dEnvironmentTheme,
    tags: asset.tags,
    fileName: asset.fileName as `${string}.glb`,
    url: asset.url as `/assets/3d/environments/${string}.glb`,
    thumbnailUrl: asset.thumbnailUrl as `/assets/3d/environments/${string}.png`,
    byteSize: asset.byteSize,
    sha256: asset.sha256 as `sha256:${string}`,
    bounds: asset.bounds as [number, number, number],
    camera: {
      position: asset.camera.position as [number, number, number],
      target: asset.camera.target as [number, number, number],
      fovDegrees: asset.camera.fovDegrees,
    },
  }, WEBTOON_V7_PROVENANCE)),
);

const MCP_FREE_V1_PROVENANCE_BASE = Object.freeze({
  origin: "ai-generated-free-wallet",
  author: "ToonStudio",
  generator: "official-tripo-mcp",
  blenderVersion: "5.2",
  license: "Tripo Terms of Service - Free User Output",
  licenseUrl: "https://www.tripo3d.ai/terms",
  attributionRequired: false,
  commercialUse: true,
  externalResources: 0,
  provider: "Tripo",
  providerModelVersion: "v3.0-20250812",
  billingMode: "free-api-wallet",
  paymentMethodUsed: false,
  nonExclusive: true,
  providerRetainsRights: true,
} as const);

export const STUDIO_BG3D_ENVIRONMENT_ASSETS_MCP_FREE_V1 = Object.freeze([
  defineEnvironment({
    id: "ts-bg3d-webtoon_neighborhood_bus_stop-mcp-v1",
    name: "웹툰 동네 버스 정류장",
    description: "유리 패널·목재 벤치·노선 안내판·안전 볼라드와 낮은 승강장 기단이 결합된 한국형 동네 정류장 모듈",
    theme: "transit",
    tags: ["webtoon", "bus stop", "shelter", "bench", "transit", "웹툰", "버스 정류장", "벤치", "교통"],
    fileName: "webtoon_neighborhood_bus_stop.glb",
    url: "/assets/3d/environments/mcp-free-v1/webtoon_neighborhood_bus_stop.glb",
    thumbnailUrl: "/assets/3d/environments/mcp-free-v1/thumbnails/webtoon_neighborhood_bus_stop.png",
    byteSize: 558_552,
    sha256: "sha256:6d4ad1dda9d7655c59634f3a513ccf142ac70d3d6e4eefdc5427a0a9e2f4f0d4",
    bounds: [4.225898, 2.65, 1.719861],
    camera: { position: [6.128, 3.296, 6.846], target: [0.0, 1.139, 0.0], fovDegrees: 50 },
  }, Object.freeze({
    ...MCP_FREE_V1_PROVENANCE_BASE,
    providerTaskId: "bac1b4ec-3c54-42a2-a07a-431e1bd5ba8a",
    promptSha256: "sha256:e311a8bebe4759de3384422b49253292a7b68cd979e052664245e127ce7ab809",
    creditCost: 20,
  })),
  defineEnvironment({
    id: "ts-bg3d-webtoon_school_gate_module-mcp-v1",
    name: "웹툰 한국 학교 정문",
    description: "석재·벽돌 문주, 슬라이딩 철문, 보행자 출입구와 담장 날개를 묶은 학교 정문 배경 모듈",
    theme: "education",
    tags: ["webtoon", "school", "gate", "education", "korea", "웹툰", "학교", "정문", "담장"],
    fileName: "webtoon_school_gate_module.glb",
    url: "/assets/3d/environments/mcp-free-v1/webtoon_school_gate_module.glb",
    thumbnailUrl: "/assets/3d/environments/mcp-free-v1/thumbnails/webtoon_school_gate_module.png",
    byteSize: 504_080,
    sha256: "sha256:c2f456cf2c9cb2367523b656d9004afc1ed2fc190988ec1c31bb6e5b2b0685ad",
    bounds: [2.344587, 3.8, 8.928126],
    camera: { position: [12.946, 6.964, 14.464], target: [0.0, 1.634, 0.0], fovDegrees: 50 },
  }, Object.freeze({
    ...MCP_FREE_V1_PROVENANCE_BASE,
    providerTaskId: "ffee2ca3-7508-41de-862d-398a0cfbb885",
    promptSha256: "sha256:eda9a48e1f75a64701feaf5e3f536242cf628a08e4eff6597a31cf4aed7ec5de",
    creditCost: 20,
  })),
  defineEnvironment({
    id: "ts-bg3d-webtoon_rooftop_stairwell_entry-mcp-v1",
    name: "웹툰 학교 옥상 계단실",
    description: "방화문·차양·배관·환기 설비와 옥상 안전 난간이 결합된 한국 학교 옥상 계단실 모듈",
    theme: "education",
    tags: ["webtoon", "school", "rooftop", "stairwell", "utility", "웹툰", "학교", "옥상", "계단실"],
    fileName: "webtoon_rooftop_stairwell_entry.glb",
    url: "/assets/3d/environments/mcp-free-v1/webtoon_rooftop_stairwell_entry.glb",
    thumbnailUrl: "/assets/3d/environments/mcp-free-v1/thumbnails/webtoon_rooftop_stairwell_entry.png",
    byteSize: 523_092,
    sha256: "sha256:b42cf8c3a9e1a432ddeaaff186484335806a2710edbfd1e71ec6f39f90fe2027",
    bounds: [4.015864, 3.25, 3.945795],
    camera: { position: [5.823, 3.835, 6.506], target: [0.0, 1.397, 0.0], fovDegrees: 50 },
  }, Object.freeze({
    ...MCP_FREE_V1_PROVENANCE_BASE,
    providerTaskId: "a596c8ae-0832-4b71-939d-ff25b09c7239",
    promptSha256: "sha256:6a76fe3ab8f97ad9333b8dc591c2ef0afacd8d7d664fdb48ee36c69a8d35a8bb",
    creditCost: 20,
  })),
  defineEnvironment({
    id: "ts-bg3d-webtoon_alley_food_cart-mcp-v1",
    name: "웹툰 골목 포장마차 카트",
    description: "스테인리스 조리대·붉은 차양·진열대·버너·수납과 간이 의자를 갖춘 이동식 골목 포장마차",
    theme: "urban",
    tags: ["webtoon", "street food", "food cart", "alley", "urban", "웹툰", "포장마차", "노점", "골목"],
    fileName: "webtoon_alley_food_cart.glb",
    url: "/assets/3d/environments/mcp-free-v1/webtoon_alley_food_cart.glb",
    thumbnailUrl: "/assets/3d/environments/mcp-free-v1/thumbnails/webtoon_alley_food_cart.png",
    byteSize: 507_984,
    sha256: "sha256:0a13d34e593a66bb8c6f6d23607c81f9734f2bfe02bd8cb3f71eec6c3f1f9176",
    bounds: [1.437837, 2.55, 2.758248],
    camera: { position: [3.999, 3.009, 4.468], target: [0.0, 1.096, 0.0], fovDegrees: 50 },
  }, Object.freeze({
    ...MCP_FREE_V1_PROVENANCE_BASE,
    providerTaskId: "cbed629d-f46b-4441-90ac-b9a858fbf8f4",
    promptSha256: "sha256:f97639eab3a12cc7f86dd1d2ba87ac9ce5b4a519b19b833eac5e4c1db8332b16",
    creditCost: 20,
  })),
  defineEnvironment({
    id: "ts-bg3d-webtoon_one_room_furniture_cluster-mcp-v1",
    name: "웹툰 원룸 가구 클러스터",
    description: "싱글 침대·책상·의자·옷장·책장·조명과 작은 생활 소품을 한 번에 배치하는 원룸 세트",
    theme: "home",
    tags: ["webtoon", "one room", "furniture", "bed", "desk", "home", "웹툰", "원룸", "가구", "침실"],
    fileName: "webtoon_one_room_furniture_cluster.glb",
    url: "/assets/3d/environments/mcp-free-v1/webtoon_one_room_furniture_cluster.glb",
    thumbnailUrl: "/assets/3d/environments/mcp-free-v1/thumbnails/webtoon_one_room_furniture_cluster.png",
    byteSize: 372_552,
    sha256: "sha256:953c7e60731da5a44788b803aa7216d017e931ea95773bcda22c2dc793558306",
    bounds: [3.370431, 2.25, 3.451774],
    camera: { position: [5.005, 2.692, 5.592], target: [0.0, 0.968, 0.0], fovDegrees: 50 },
  }, Object.freeze({
    ...MCP_FREE_V1_PROVENANCE_BASE,
    providerTaskId: "55215331-81a2-4da1-b0d5-f24dd3ae9ed8",
    promptSha256: "sha256:f5b1d0e4c62537ac54e2308b0be4114a8b5e620a22cb183131168c3bf136390c",
    creditCost: 20,
  })),
  defineEnvironment({
    id: "ts-bg3d-webtoon_apartment_lobby_module-mcp-v1",
    name: "웹툰 아파트 공동현관",
    description: "유리 출입문·석재 포털·택배함·인터폰·벤치·공지판으로 구성된 현대 아파트 공동현관 모듈",
    theme: "home",
    tags: ["webtoon", "apartment", "lobby", "entrance", "parcel locker", "웹툰", "아파트", "공동현관", "택배함"],
    fileName: "webtoon_apartment_lobby_module.glb",
    url: "/assets/3d/environments/mcp-free-v1/webtoon_apartment_lobby_module.glb",
    thumbnailUrl: "/assets/3d/environments/mcp-free-v1/thumbnails/webtoon_apartment_lobby_module.png",
    byteSize: 385_340,
    sha256: "sha256:12bb5e578e8a2872b2a89be084ab5be4c458fd18021bab6c830c1d9aa1de01e4",
    bounds: [3.123389, 3.4, 4.464115],
    camera: { position: [6.473, 4.012, 7.232], target: [0.0, 1.462, 0.0], fovDegrees: 50 },
  }, Object.freeze({
    ...MCP_FREE_V1_PROVENANCE_BASE,
    providerTaskId: "b9cd1dda-a94b-401c-a1d5-953b590e517c",
    promptSha256: "sha256:05d5e9cc79c2e809d550751b2a313db2a11505273f30c8bcad8bad7350930fa2",
    creditCost: 20,
  })),
  defineEnvironment({
    id: "ts-bg3d-webtoon_hanok_courtyard_gate-mcp-v1",
    name: "웹툰 한옥 안마당 대문",
    description: "목재 기둥·기와지붕·격자문·석재 문턱·담장 날개와 옹기를 갖춘 한옥 대문 배경 모듈",
    theme: "heritage",
    tags: ["webtoon", "hanok", "gate", "heritage", "korea", "웹툰", "한옥", "대문", "기와"],
    fileName: "webtoon_hanok_courtyard_gate.glb",
    url: "/assets/3d/environments/mcp-free-v1/webtoon_hanok_courtyard_gate.glb",
    thumbnailUrl: "/assets/3d/environments/mcp-free-v1/thumbnails/webtoon_hanok_courtyard_gate.png",
    byteSize: 582_212,
    sha256: "sha256:4c4377f95484d8d62c3f60616eb55abe57d7aa333afa0c2f8adf45de62b1d0f6",
    bounds: [3.271805, 4.2, 5.911444],
    camera: { position: [8.572, 4.956, 9.577], target: [0.0, 1.806, 0.0], fovDegrees: 50 },
  }, Object.freeze({
    ...MCP_FREE_V1_PROVENANCE_BASE,
    providerTaskId: "e982cb33-bfaa-499d-94cb-2fb5a12faca5",
    promptSha256: "sha256:d0e16f64ea0db0be8cc800daf68ebbeb02c8b10d752b3ac06c48c57bdc015774",
    creditCost: 20,
  })),
  defineEnvironment({
    id: "ts-bg3d-webtoon_convenience_store_fixture_cluster-mcp-v1",
    name: "웹툰 편의점 집기 클러스터",
    description: "상품 진열대·음료 냉장고·계산대·전자레인지 선반·분리수거함과 장바구니를 묶은 편의점 집기 세트",
    theme: "retail",
    tags: ["webtoon", "convenience store", "retail", "shelves", "refrigerator", "웹툰", "편의점", "진열대", "계산대"],
    fileName: "webtoon_convenience_store_fixture_cluster.glb",
    url: "/assets/3d/environments/mcp-free-v1/webtoon_convenience_store_fixture_cluster.glb",
    thumbnailUrl: "/assets/3d/environments/mcp-free-v1/thumbnails/webtoon_convenience_store_fixture_cluster.png",
    byteSize: 517_588,
    sha256: "sha256:03064ae4c4fdf2ea68a2c1a2b7d3751a9955dca20b19683fe2b7d5416910d4b1",
    bounds: [3.246023, 2.35, 2.434732],
    camera: { position: [4.707, 2.773, 5.259], target: [0.0, 1.01, 0.0], fovDegrees: 50 },
  }, Object.freeze({
    ...MCP_FREE_V1_PROVENANCE_BASE,
    providerTaskId: "59122562-e8ec-487d-b624-365f225a4b78",
    promptSha256: "sha256:5c1d6116b6a53410a6de4eeaccba956fa0642829e36437bb4435937deeb9bc8e",
    creditCost: 20,
  })),
  defineEnvironment({
    id: "ts-bg3d-webtoon_neighborhood_police_box-mcp-v1",
    name: "웹툰 동네 지구대 외관",
    description: "유리 출입구·차양·경사로·보안 설비·자전거 거치대와 화단을 갖춘 소형 지구대 외관 모듈",
    theme: "urban",
    tags: ["webtoon", "police box", "public building", "urban", "korea", "웹툰", "지구대", "파출소", "공공건물"],
    fileName: "webtoon_neighborhood_police_box.glb",
    url: "/assets/3d/environments/mcp-free-v1/webtoon_neighborhood_police_box.glb",
    thumbnailUrl: "/assets/3d/environments/mcp-free-v1/thumbnails/webtoon_neighborhood_police_box.png",
    byteSize: 425_964,
    sha256: "sha256:97cde696597ed3714ec31be37138b56785cbfe057a58618c3433738ef2f4a23d",
    bounds: [6.167993, 4.0, 5.013998],
    camera: { position: [8.944, 4.811, 9.992], target: [0.0, 1.72, 0.0], fovDegrees: 50 },
  }, Object.freeze({
    ...MCP_FREE_V1_PROVENANCE_BASE,
    providerTaskId: "ac5d3688-c21a-46a4-a349-afacbaae2992",
    promptSha256: "sha256:e7d1c08a539bcbc127620048c367246634dd5063b2831f4325ea2fdb7022c133",
    creditCost: 20,
  })),
  defineEnvironment({
    id: "ts-bg3d-webtoon_riverside_park_pavilion-mcp-v1",
    name: "웹툰 한강 공원 쉼터",
    description: "곡면 금속 지붕·목재 천장·벤치·피크닉 테이블·음수대와 자전거 거치대를 갖춘 강변 공원 쉼터",
    theme: "urban",
    tags: ["webtoon", "riverside", "park", "pavilion", "bench", "웹툰", "한강", "공원", "쉼터"],
    fileName: "webtoon_riverside_park_pavilion.glb",
    url: "/assets/3d/environments/mcp-free-v1/webtoon_riverside_park_pavilion.glb",
    thumbnailUrl: "/assets/3d/environments/mcp-free-v1/thumbnails/webtoon_riverside_park_pavilion.png",
    byteSize: 443_732,
    sha256: "sha256:9cd7c287d364dd6a0bf3575bedd4d69c1af07c778b9dc7b9641491c3e22daed5",
    bounds: [4.503227, 3.55, 4.400464],
    camera: { position: [6.53, 4.189, 7.295], target: [0.0, 1.526, 0.0], fovDegrees: 50 },
  }, Object.freeze({
    ...MCP_FREE_V1_PROVENANCE_BASE,
    providerTaskId: "dc0f0bda-cda2-47be-b636-ee7aea460ebb",
    promptSha256: "sha256:32b174e45483652ff377cd67aac663cfd4c2296f685678525608e42a5c716547",
    creditCost: 20,
  })),
]);


export const STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1 = Object.freeze(
  authoredV1Manifest.assets.map((asset) => defineEnvironment({
    id: asset.id,
    name: asset.name,
    description: asset.description,
    theme: asset.theme as StudioBg3dEnvironmentTheme,
    tags: asset.tags,
    fileName: asset.fileName as `${string}.glb`,
    url: asset.url as `/assets/3d/environments/${string}.glb`,
    thumbnailUrl: asset.thumbnailUrl as `/assets/3d/environments/${string}.png`,
    byteSize: asset.byteSize,
    sha256: asset.sha256 as `sha256:${string}`,
    bounds: asset.bounds as [number, number, number],
    camera: {
      position: asset.camera.position as [number, number, number],
      target: asset.camera.target as [number, number, number],
      fovDegrees: asset.camera.fovDegrees,
    },
  }, Object.freeze({
    ...V3_PROVENANCE,
    generator: "scripts/generate_self_authored_environment_pack_v1.py",
  }))),
);

export const STUDIO_BG3D_ENVIRONMENT_ASSETS = Object.freeze([
  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_V6,
  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1,
  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_WEBTOON_V7,
  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_MCP_FREE_V1,
]);

/** 100% CC0-1.0 자체 제작/CC0 합성 환경 에셋 카탈로그 (31종: V6 12 + Expansion 6 + Webtoon V7 3 + Authored V1 10). */
export const STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS = Object.freeze([
  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_V6,
  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1,
  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_WEBTOON_V7,
  ...STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1,
]);

export interface StudioBg3dEnvironmentCyclesPasses {
  readonly environmentId: string;
  readonly stem: string;
  readonly engine: "CYCLES";
  readonly directoryUrl: `/assets/3d/environments/refined-v6/passes/${string}`;
  readonly files: {
    readonly beautyUrl: `/assets/3d/environments/refined-v6/passes/${string}/beauty0001.png`;
    readonly depthUrl: `/assets/3d/environments/refined-v6/passes/${string}/depth0001.png`;
    readonly normalUrl: `/assets/3d/environments/refined-v6/passes/${string}/normal0001.png`;
    readonly aoUrl: `/assets/3d/environments/refined-v6/passes/${string}/ao0001.png`;
  };
  readonly colorDepth: {
    readonly beauty: "8";
    readonly depth: "16";
    readonly normal: "16";
    readonly ao: "8";
  };
  readonly depthRange: readonly [number, number];
  readonly normalRange: readonly [number, number];
  readonly resolution: readonly [number, number];
  readonly samples: number;
}

const RAW_CYCLES_PASSES = refinedV6RenderPassesReport as Readonly<Record<string, {
  readonly engine: string;
  readonly directory: string;
  readonly files: { readonly beauty: string; readonly depth: string; readonly normal: string; readonly ao: string };
  readonly colorDepth: { readonly beauty: string; readonly depth: string; readonly normal: string; readonly ao: string };
  readonly depthRange: readonly number[];
  readonly normalRange: readonly number[];
  readonly resolution: readonly number[];
  readonly samples: number;
}>>;

export const STUDIO_BG3D_ENVIRONMENT_CYCLES_PASSES: readonly StudioBg3dEnvironmentCyclesPasses[] = Object.freeze(
  STUDIO_BG3D_ENVIRONMENT_ASSETS_V6.map((asset): StudioBg3dEnvironmentCyclesPasses => {
    const stem = asset.fileName.replace(/\.glb$/u, "");
    const entry = RAW_CYCLES_PASSES[stem];
    if (!entry) throw new Error(`Missing Cycles render pass report for V6 environment: ${stem}`);
    const base = "/assets/3d/environments/refined-v6" as const;
    return Object.freeze({
      environmentId: asset.id,
      stem,
      engine: "CYCLES",
      directoryUrl: `${base}/${entry.directory}` as `/assets/3d/environments/refined-v6/passes/${string}`,
      files: Object.freeze({
        beautyUrl: `${base}/${entry.files.beauty}` as `/assets/3d/environments/refined-v6/passes/${string}/beauty0001.png`,
        depthUrl: `${base}/${entry.files.depth}` as `/assets/3d/environments/refined-v6/passes/${string}/depth0001.png`,
        normalUrl: `${base}/${entry.files.normal}` as `/assets/3d/environments/refined-v6/passes/${string}/normal0001.png`,
        aoUrl: `${base}/${entry.files.ao}` as `/assets/3d/environments/refined-v6/passes/${string}/ao0001.png`,
      }),
      colorDepth: Object.freeze({ beauty: entry.colorDepth.beauty as "8", depth: entry.colorDepth.depth as "16", normal: entry.colorDepth.normal as "16", ao: entry.colorDepth.ao as "8" }),
      depthRange: Object.freeze([entry.depthRange[0] ?? 0.1, entry.depthRange[1] ?? 150]) as readonly [number, number],
      normalRange: Object.freeze([entry.normalRange[0] ?? -1, entry.normalRange[1] ?? 1]) as readonly [number, number],
      resolution: Object.freeze([entry.resolution[0] ?? 1000, entry.resolution[1] ?? 750]) as readonly [number, number],
      samples: entry.samples,
    });
  }),
);

const CYCLES_PASSES_BY_KEY = new Map<string, StudioBg3dEnvironmentCyclesPasses>(
  STUDIO_BG3D_ENVIRONMENT_CYCLES_PASSES.flatMap((passes) => [
    [passes.environmentId, passes] as const,
    [passes.environmentId.replace(/-v6$/u, "-v1"), passes] as const,
    [passes.stem, passes] as const,
    [`${passes.stem}.glb`, passes] as const,
  ]),
);

const AUTHORED_V1_BY_KEY = new Map(
  STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1.flatMap((asset) => [
    [asset.id, asset] as const,
    [asset.fileName, asset] as const,
    [asset.fileName.replace(/\.glb$/u, ""), asset] as const,
    [asset.url, asset] as const,
    [`/assets/3d/environments/mcp-free-v1/${asset.fileName}`, asset] as const,
    [asset.sha256, asset] as const,
  ]),
);

const RESOLVABLE_ENVIRONMENT_ASSETS = [...STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS, ...STUDIO_BG3D_ENVIRONMENT_ASSETS];
const ENVIRONMENT_BY_ID = new Map(RESOLVABLE_ENVIRONMENT_ASSETS.map((asset) => [asset.id, asset] as const));
const ENVIRONMENT_BY_URL = new Map(
  [...STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1, ...RESOLVABLE_ENVIRONMENT_ASSETS].map((asset) => [asset.url, asset] as const),
);
const ENVIRONMENT_BY_HASH = new Map(
  [...STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1, ...RESOLVABLE_ENVIRONMENT_ASSETS].map((asset) => [asset.sha256, asset] as const),
);

export function getStudioBg3dEnvironmentAsset(id: string): StudioBg3dEnvironmentAsset | null {
  return ENVIRONMENT_BY_ID.get(id) ?? null;
}

export function getStudioBg3dEnvironmentAssetByHash(hash: string): StudioBg3dEnvironmentAsset | null {
  return ENVIRONMENT_BY_HASH.get(hash as `sha256:${string}`) ?? null;
}

export function isStudioBg3dEnvironmentAssetId(id: string): boolean {
  return ENVIRONMENT_BY_ID.has(id);
}

/** V6 환경 ID, 레거시 V1 ID, 또는 파일 스템으로 Cycles 멀티패스(beauty/depth/normal/ao) 정보를 조회한다. */
export function getStudioBg3dEnvironmentCyclesPasses(environmentIdOrStem: string): StudioBg3dEnvironmentCyclesPasses | null {
  return CYCLES_PASSES_BY_KEY.get(environmentIdOrStem.trim()) ?? null;
}

export interface StudioBg3dCyclesCompositorLayerDescriptor {
  readonly pass: "beauty" | "ao" | "normal" | "depth";
  readonly label: string;
  readonly url: `/assets/3d/environments/refined-v6/passes/${string}.png`;
  readonly blendMode: "normal" | "multiply";
  readonly opacity: number;
  readonly visible: boolean;
}

/** V6 환경의 Cycles 멀티패스(beauty/ao/normal/depth)를 2D 캔버스 합성 레이어 스택 플랜으로 변환한다. */
export function buildStudioBg3dCyclesCompositorLayerPlan(
  environmentIdOrStem: string,
): readonly StudioBg3dCyclesCompositorLayerDescriptor[] | null {
  const passes = getStudioBg3dEnvironmentCyclesPasses(environmentIdOrStem);
  if (!passes) return null;
  return Object.freeze([
    Object.freeze({ pass: "beauty", label: `${passes.stem} · Beauty`, url: passes.files.beautyUrl, blendMode: "normal", opacity: 1, visible: true }),
    Object.freeze({ pass: "ao", label: `${passes.stem} · Ambient Occlusion`, url: passes.files.aoUrl, blendMode: "multiply", opacity: 0.35, visible: true }),
    Object.freeze({ pass: "normal", label: `${passes.stem} · Normal Guide`, url: passes.files.normalUrl, blendMode: "normal", opacity: 0.5, visible: false }),
    Object.freeze({ pass: "depth", label: `${passes.stem} · Depth Mist Guide`, url: passes.files.depthUrl, blendMode: "normal", opacity: 0.4, visible: false }),
  ]);
}

/** Tripo MCP 환경(`*-mcp-v1`), URL, 해시, 또는 파일명을 자체 제작 CC0(`authored-v1`) 대응 환경으로 변환한다. */
export function resolveStudioBg3dCc0CounterpartEnvironment(idOrFileName: string): StudioBg3dEnvironmentAsset | null {
  const trimmed = idOrFileName.trim();
  const authored = AUTHORED_V1_BY_KEY.get(trimmed);
  if (authored) return authored;
  const asset = ENVIRONMENT_BY_ID.get(trimmed) ?? ENVIRONMENT_BY_URL.get(trimmed as `/assets/3d/environments/${string}.glb`) ?? ENVIRONMENT_BY_HASH.get(trimmed as `sha256:${string}`);
  if (!asset) return null;
  if (asset.provenance.license === "CC0-1.0") return asset;
  return AUTHORED_V1_BY_KEY.get(asset.fileName) ?? null;
}

/** 환경 ID·해시·URL을 런타임 GLB URL로 해석하며, `preferCc0Counterpart: true`면 상업 배포 안전 CC0(`authored-v1`) URL로 자동 치환한다. */
export function resolveStudioBg3dEnvironmentUrl(
  idOrUrl: string,
  options?: { readonly preferCc0Counterpart?: boolean },
): `/assets/3d/environments/${string}.glb` | null {
  const trimmed = idOrUrl.trim();
  if (options?.preferCc0Counterpart) {
    return resolveStudioBg3dCc0CounterpartEnvironment(trimmed)?.url ?? null;
  }
  const asset = ENVIRONMENT_BY_ID.get(trimmed) ?? ENVIRONMENT_BY_URL.get(trimmed as `/assets/3d/environments/${string}.glb`) ?? ENVIRONMENT_BY_HASH.get(trimmed as `sha256:${string}`);
  return asset?.url ?? AUTHORED_V1_BY_KEY.get(trimmed)?.url ?? null;
}

