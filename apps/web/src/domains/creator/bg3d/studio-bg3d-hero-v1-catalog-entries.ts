/**
 * Wave 4 Blender 5.3 5대 웹툰 히어로 배경(6개 씬) Desktop(8노드 컷어웨이) · Mobile(4노드)
 * 듀얼 에셋 카탈로그 및 Rights BOM 메타데이터 레지스트리.
 *
 * - 기존 `studio-bg3d-environment-definition.ts`의 `StudioBg3dEnvironmentAsset` 계약을 100% 준수한다.
 * - `tools/blender/webtoon_hero_bg/cutaway_assembly.py`의 정규 Desktop 8노드 / Mobile 4노드 및
 *   `glbforge` (`desktop-hero` / `mobile-hero` 100/100 실측 검증) 예산·코덱 규칙(meshopt 허용, Draco 금지)을 고정한다.
 * - 12개 GLB(`apps/web/public/assets/3d/environments/hero-v1/*.glb`) 및 6개 512×512 썸네일의
 *   실측 바이트 크기와 SHA-256 해시를 핀 고정한다.
 */

import {
  defineEnvironment,
  type StudioBg3dEnvironmentAsset,
  type StudioBg3dEnvironmentCamera,
  type StudioBg3dEnvironmentProvenance,
  type StudioBg3dEnvironmentTheme,
} from "./studio-bg3d-environment-definition";

export const BG3D_HERO_V1_SLUGS = Object.freeze([
  "kr_modern_apartment_living",
  "kr_atelier_cafe_interior",
  "kr_highschool_classroom_corridor",
  "kr_school_rooftop_hero",
  "kr_seoul_alley_street_hero",
  "rofan_imperial_palace_hall_balcony",
] as const);

export type Bg3dHeroV1Slug = (typeof BG3D_HERO_V1_SLUGS)[number];
export type Bg3dHeroDeviceTier = "desktop" | "mobile";

export const HERO_V1_DESKTOP_NODE_NAMES = Object.freeze([
  "BG_Floor",
  "BG_Wall_North",
  "BG_Wall_South",
  "BG_Wall_West",
  "BG_Wall_East",
  "BG_Ceiling",
  "BG_Furniture_Hero",
  "BG_Props_Clutter",
] as const);

export const HERO_V1_MOBILE_NODE_NAMES = Object.freeze([
  "BG_Shell_Fixed",
  "BG_Cutaway_Front",
  "BG_Ceiling",
  "BG_Furnishings",
] as const);

export interface Bg3dHeroTierBudget {
  readonly tier: Bg3dHeroDeviceTier;
  readonly glbforgeProfile: "desktop-hero" | "mobile-hero";
  readonly maxTriangles: number;
  readonly maxDrawCalls: number;
  readonly maxMaterials: number;
  readonly maxFileSizeBytes: number;
  readonly nodeNames: readonly string[];
  readonly allowedExtensions: readonly string[];
  readonly forbiddenExtensions: readonly string[];
}

export const HERO_V1_DESKTOP_BUDGET: Bg3dHeroTierBudget = Object.freeze({
  tier: "desktop",
  glbforgeProfile: "desktop-hero",
  maxTriangles: 500_000,
  maxDrawCalls: 8,
  maxMaterials: 4,
  maxFileSizeBytes: 20 * 1024 * 1024,
  nodeNames: HERO_V1_DESKTOP_NODE_NAMES,
  allowedExtensions: Object.freeze([
    "EXT_meshopt_compression",
    "KHR_mesh_quantization",
    "KHR_texture_basisu",
  ]),
  forbiddenExtensions: Object.freeze(["KHR_draco_mesh_compression"]),
});

export const HERO_V1_MOBILE_BUDGET: Bg3dHeroTierBudget = Object.freeze({
  tier: "mobile",
  glbforgeProfile: "mobile-hero",
  maxTriangles: 150_000,
  maxDrawCalls: 4,
  maxMaterials: 2,
  maxFileSizeBytes: 6 * 1024 * 1024,
  nodeNames: HERO_V1_MOBILE_NODE_NAMES,
  allowedExtensions: Object.freeze([
    "EXT_meshopt_compression",
    "KHR_mesh_quantization",
    "KHR_texture_basisu",
  ]),
  forbiddenExtensions: Object.freeze(["KHR_draco_mesh_compression"]),
});

export interface Bg3dHeroRightsBom {
  readonly licenseId: "CC0-1.0";
  readonly originLabel: "ToonStudio Original";
  readonly licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/";
  readonly commercialUse: true;
  readonly attributionRequired: false;
  readonly externalResources: 0;
  readonly generatorPackage: "tools/blender/webtoon_hero_bg";
}

export interface Bg3dHeroCameraPreset {
  readonly id: "establishing" | "dialogue-ots" | "dramatic-low";
  readonly labelKo: string;
  readonly camera: StudioBg3dEnvironmentCamera;
}

export interface StudioBg3dHeroV1SceneEntry {
  readonly slug: Bg3dHeroV1Slug;
  readonly labelKo: string;
  readonly genreKo: string;
  readonly theme: StudioBg3dEnvironmentTheme;
  readonly desktopAsset: StudioBg3dEnvironmentAsset;
  readonly mobileAsset: StudioBg3dEnvironmentAsset;
  readonly cutawayEnabledWalls: readonly ("north" | "south" | "west" | "east" | "ceiling")[];
  readonly cameraPresets: readonly [Bg3dHeroCameraPreset, Bg3dHeroCameraPreset, Bg3dHeroCameraPreset];
  readonly rightsBom: Bg3dHeroRightsBom;
  readonly deliveryStatus: "staged-contract" | "verified-on-disk";
}

export interface Bg3dHeroManifestHydrationRecord {
  readonly slug: Bg3dHeroV1Slug;
  readonly desktopByteSize: number;
  readonly desktopSha256: `sha256:${string}`;
  readonly mobileByteSize: number;
  readonly mobileSha256: `sha256:${string}`;
}

export const HERO_V1_RIGHTS_BOM: Bg3dHeroRightsBom = Object.freeze({
  licenseId: "CC0-1.0",
  originLabel: "ToonStudio Original",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  commercialUse: true,
  attributionRequired: false,
  externalResources: 0,
  generatorPackage: "tools/blender/webtoon_hero_bg",
});

const HERO_V1_PROVENANCE: StudioBg3dEnvironmentProvenance = Object.freeze({
  origin: "original-procedural",
  author: "ToonStudio",
  generator: "tools/blender/webtoon_hero_bg",
  blenderVersion: "5.3",
  license: "CC0-1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  attributionRequired: false,
  commercialUse: true,
  externalResources: 0,
});

const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function buildHeroSceneEntry(spec: {
  readonly slug: Bg3dHeroV1Slug;
  readonly labelKo: string;
  readonly genreKo: string;
  readonly descriptionKo: string;
  readonly theme: StudioBg3dEnvironmentTheme;
  readonly tags: readonly string[];
  readonly bounds: readonly [number, number, number];
  readonly desktopByteSize: number;
  readonly desktopSha256: `sha256:${string}`;
  readonly mobileByteSize: number;
  readonly mobileSha256: `sha256:${string}`;
  readonly cutawayEnabledWalls: readonly ("north" | "south" | "west" | "east" | "ceiling")[];
  readonly cameraPresets: readonly [Bg3dHeroCameraPreset, Bg3dHeroCameraPreset, Bg3dHeroCameraPreset];
}): StudioBg3dHeroV1SceneEntry {
  const baseTags = [...spec.tags, "hero-v1", "cutaway-8node", "cc0"];
  const desktopAsset = defineEnvironment(
    {
      id: `ts-bg3d-hero-v1-${spec.slug}-desktop`,
      name: spec.labelKo,
      description: spec.descriptionKo,
      theme: spec.theme,
      tags: [...baseTags, "desktop-hero"],
      fileName: `${spec.slug}.glb`,
      url: `/assets/3d/environments/hero-v1/${spec.slug}.glb`,
      thumbnailUrl: `/assets/3d/environments/hero-v1/thumbnails/${spec.slug}.png`,
      byteSize: spec.desktopByteSize,
      sha256: spec.desktopSha256,
      bounds: spec.bounds,
      camera: spec.cameraPresets[0].camera,
      detailCamera: {
        ...spec.cameraPresets[1].camera,
        subject: { ko: spec.cameraPresets[1].labelKo, en: "Dialogue framing" },
      },
    },
    HERO_V1_PROVENANCE,
  );

  const mobileAsset = defineEnvironment(
    {
      id: `ts-bg3d-hero-v1-${spec.slug}-mobile`,
      name: `${spec.labelKo} (모바일 경량)`,
      description: `${spec.descriptionKo} — 모바일 4노드·2재질 아틀라스 경량본`,
      theme: spec.theme,
      tags: [...baseTags, "mobile-hero"],
      fileName: `${spec.slug}-mobile.glb`,
      url: `/assets/3d/environments/hero-v1/${spec.slug}-mobile.glb`,
      thumbnailUrl: `/assets/3d/environments/hero-v1/thumbnails/${spec.slug}.png`,
      byteSize: spec.mobileByteSize,
      sha256: spec.mobileSha256,
      bounds: spec.bounds,
      camera: spec.cameraPresets[0].camera,
      detailCamera: {
        ...spec.cameraPresets[1].camera,
        subject: { ko: spec.cameraPresets[1].labelKo, en: "Dialogue framing" },
      },
    },
    HERO_V1_PROVENANCE,
  );

  return Object.freeze({
    slug: spec.slug,
    labelKo: spec.labelKo,
    genreKo: spec.genreKo,
    theme: spec.theme,
    desktopAsset,
    mobileAsset,
    cutawayEnabledWalls: Object.freeze([...spec.cutawayEnabledWalls]),
    cameraPresets: spec.cameraPresets,
    rightsBom: HERO_V1_RIGHTS_BOM,
    deliveryStatus: "verified-on-disk",
  });
}

export const STUDIO_BG3D_HERO_V1_ENTRIES: readonly StudioBg3dHeroV1SceneEntry[] = Object.freeze([
  buildHeroSceneEntry({
    slug: "kr_modern_apartment_living",
    labelKo: "한국 현대 원룸·아파트 거실",
    genreKo: "현대 로맨스·일상",
    descriptionKo: "베란다 통창·패브릭 소파·주방 아일랜드·우드 몰딩과 8노드 컷어웨이를 갖춘 한국형 아파트 거실",
    theme: "home",
    tags: ["아파트", "거실", "원룸", "현대", "주거", "실내"],
    bounds: [8.4, 2.824, 6.21],
    desktopByteSize: 4_825_616,
    desktopSha256: "sha256:ffce62b057ac90365057b6fdcb0641f38ee83cda7662866ec1100b1ba152c803",
    mobileByteSize: 2_730_404,
    mobileSha256: "sha256:fdf1136b4b6770000351910a9f2fa847a46e62ff973ac14f30fd565d5e7fd106",
    cutawayEnabledWalls: ["north", "south", "west", "east", "ceiling"],
    cameraPresets: [
      { id: "establishing", labelKo: "거실 전경 28mm", camera: { position: [1.65, 1.52, 2.35], target: [-2.15, 1.22, -0.45], fovDegrees: 65 } },
      { id: "dialogue-ots", labelKo: "소파 대화 35mm", camera: { position: [-2.65, 1.44, 2.2], target: [-0.85, 1.16, -0.15], fovDegrees: 54 } },
      { id: "dramatic-low", labelKo: "창가 시점 50mm", camera: { position: [-0.9, 1.46, 1.65], target: [-1.65, 1.32, -1.95], fovDegrees: 40 } },
    ],
  }),
  buildHeroSceneEntry({
    slug: "kr_atelier_cafe_interior",
    labelKo: "감성 아틀리에 카페 실내",
    genreKo: "현대 드라마·로맨스",
    descriptionKo: "에스프레소 바·우드 아치 창틀·펜던트 조명·2인/4인 테이블이 배치된 서울 감성 카페 세트",
    theme: "hospitality",
    tags: ["카페", "커피숍", "대화", "데이트", "실내"],
    bounds: [10.032, 3.3, 7.62],
    desktopByteSize: 5_316_812,
    desktopSha256: "sha256:751beefe2082bb2a09bcf856b4fab0a2882a44248c0059bc6448fe5c82464fc8",
    mobileByteSize: 3_191_328,
    mobileSha256: "sha256:6c4a01791d276a3610f9cdfabd6c9ab71729cab918d81a270d7c7ba98bdafd77",
    cutawayEnabledWalls: ["north", "south", "west", "east", "ceiling"],
    cameraPresets: [
      { id: "establishing", labelKo: "카페 홀 전경 24mm", camera: { position: [3.55, 1.52, 2.25], target: [-1.55, 1.25, -1.1], fovDegrees: 74 } },
      { id: "dialogue-ots", labelKo: "에스프레소 바 주문 35mm", camera: { position: [0.95, 1.48, 0.35], target: [-2.35, 1.28, -1.65], fovDegrees: 54 } },
      { id: "dramatic-low", labelKo: "창가 2인석 대화 50mm", camera: { position: [-2.15, 1.32, 0.25], target: [-3.15, 1.15, 1.28], fovDegrees: 40 } },
    ],
  }),
  buildHeroSceneEntry({
    slug: "kr_highschool_classroom_corridor",
    labelKo: "한국 고등학교 교실·복도",
    genreKo: "학원물·청춘",
    descriptionKo: "칠판·교탁·창가 6열 책걸상·복도 미닫이문과 창문 채광 그림자를 갖춘 한국 고등학교 교실",
    theme: "education",
    tags: ["교실", "복도", "학교", "학원물", "창가"],
    bounds: [9.6, 3.0, 9.2],
    desktopByteSize: 4_584_172,
    desktopSha256: "sha256:2ebe4885f5215636575a1513e588481fac003669a2b31e018b04b72641021dd3",
    mobileByteSize: 2_441_564,
    mobileSha256: "sha256:d2c2e919a92385caf42dc9a3378d4a7c2a0d67a7a980cdcf0877c6486ec99b75",
    cutawayEnabledWalls: ["north", "south", "west", "east", "ceiling"],
    cameraPresets: [
      { id: "establishing", labelKo: "교실·복도 3/4 전경", camera: { position: [-8.4, 5.35, 8.5], target: [0.25, 1.08, -0.05], fovDegrees: 55 } },
      { id: "dialogue-ots", labelKo: "교실 정면 칠판 시점", camera: { position: [0.0, 2.1, 10.8], target: [0.0, 1.25, 1.0], fovDegrees: 58 } },
      { id: "dramatic-low", labelKo: "창가 줄 측면 24mm", camera: { position: [-3.88, 1.72, -1.05], target: [4.55, 1.38, -0.92], fovDegrees: 73 } },
    ],
  }),
  buildHeroSceneEntry({
    slug: "kr_school_rooftop_hero",
    labelKo: "학교 옥상 히어로 세트",
    genreKo: "학원물·액션·고백",
    descriptionKo: "철망 펜스·물탱크실·철제 출입문·벤치·난간 베벨 디테일이 살아있는 한국 학교 옥상",
    theme: "education",
    tags: ["옥상", "학교", "펜스", "고백", "액션", "실외"],
    bounds: [14.0, 4.492, 11.0],
    desktopByteSize: 4_254_932,
    desktopSha256: "sha256:4f0b25ae22ce60df4b67c8971a41c8ce852793c799278269f54e57eb93678658",
    mobileByteSize: 2_039_000,
    mobileSha256: "sha256:68782ce12723453b682b5df14d5f5de0d958728cced8f95ddeb705a4fafafee0",
    cutawayEnabledWalls: ["south", "west"],
    cameraPresets: [
      { id: "establishing", labelKo: "옥상 철망 광각 24mm", camera: { position: [9.6, 5.8, 9.4], target: [-0.4, 1.7, -0.6], fovDegrees: 73 } },
      { id: "dialogue-ots", labelKo: "펜스 옆 투샷 35mm", camera: { position: [3.4, 1.55, 3.5], target: [-2.6, 1.72, -2.2], fovDegrees: 54 } },
      { id: "dramatic-low", labelKo: "철망 인물 클로즈업 85mm", camera: { position: [-1.8, 1.52, 2.2], target: [-5.2, 1.65, 3.8], fovDegrees: 24 } },
    ],
  }),
  buildHeroSceneEntry({
    slug: "kr_seoul_alley_street_hero",
    labelKo: "서울 도심 골목·거리",
    genreKo: "액션·스릴러·현대",
    descriptionKo: "다세대 빌라 외벽·외부 계단·전신주·에어컨 실외기·아스팔트 경계석이 정교한 서울 골목길",
    theme: "urban",
    tags: ["골목", "거리", "서울", "액션", "추격", "실외"],
    bounds: [8.0, 7.469, 16.0],
    desktopByteSize: 4_559_724,
    desktopSha256: "sha256:c70b0ca0804cb49a8ff9717a58852864a04e876b03aff418332fa56019766f3f",
    mobileByteSize: 2_453_152,
    mobileSha256: "sha256:425c44235f1ffa48cc9b252413576ff5c994ddd5ebce2e78ab0fafd016c739a2",
    cutawayEnabledWalls: ["west", "east"],
    cameraPresets: [
      { id: "establishing", labelKo: "골목 종심 1점 투시 24mm", camera: { position: [0.15, 1.72, 7.4], target: [-0.1, 2.55, -4.2], fovDegrees: 73 } },
      { id: "dialogue-ots", labelKo: "가로등 대치 35mm", camera: { position: [-1.15, 1.56, 2.8], target: [1.05, 2.45, -4.8], fovDegrees: 54 } },
      { id: "dramatic-low", labelKo: "추격전 로우앵글 20mm", camera: { position: [0.45, 0.85, 6.2], target: [-0.4, 3.8, -3.5], fovDegrees: 84 } },
    ],
  }),
  buildHeroSceneEntry({
    slug: "rofan_imperial_palace_hall_balcony",
    labelKo: "로판 황궁 대연회장·발코니",
    genreKo: "로맨스판타지·무도회",
    descriptionKo: "플루티드 대리석 열주·아치형 테라스 발코니·대계단·샹들리에와 컷어웨이 벽체를 갖춘 황궁 홀",
    theme: "fantasy",
    tags: ["로판", "황궁", "궁전", "무도회", "발코니", "판타지"],
    bounds: [14.002, 8.5, 18.0656],
    desktopByteSize: 6_179_592,
    desktopSha256: "sha256:94a33abbfbf7b5efe87fa8deec16754b73dc0e750f46e139f84edd230c63f324",
    mobileByteSize: 3_827_276,
    mobileSha256: "sha256:48ba57299f64066f18dc5e6577f0cad0e32e4c8012c731f9ad0a20c1321ac581",
    cutawayEnabledWalls: ["north", "south", "west", "east", "ceiling"],
    cameraPresets: [
      { id: "establishing", labelKo: "대연회장 전경 24mm", camera: { position: [3.67, 1.95, 7.2], target: [1.27, 2.75, -4.8], fovDegrees: 65 } },
      { id: "dialogue-ots", labelKo: "발코니 달빛 독대 35mm", camera: { position: [-5.65, 1.65, 5.2], target: [-5.85, 1.55, -0.2], fovDegrees: 45 } },
      { id: "dramatic-low", labelKo: "대계단 등장 로우앵글 50mm", camera: { position: [2.07, 1.25, -0.6], target: [1.27, 2.35, -6.8], fovDegrees: 32 } },
    ],
  }),
]);

/** 라이브 BG3D 카탈로그 최상단에 노출되는 Blender 5.3 히어로 배경 6종 (Desktop 8노드). */
export const STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1: readonly StudioBg3dEnvironmentAsset[] = Object.freeze(
  STUDIO_BG3D_HERO_V1_ENTRIES.map((entry) => entry.desktopAsset),
);

/** 모바일·경량 디바이스 런타임 해석용 히어로 배경 6종 (Mobile 4노드·2재질 아틀라스). */
export const STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V1_MOBILE: readonly StudioBg3dEnvironmentAsset[] = Object.freeze(
  STUDIO_BG3D_HERO_V1_ENTRIES.map((entry) => entry.mobileAsset),
);

export function getBg3dHeroV1EntryBySlug(slug: Bg3dHeroV1Slug): StudioBg3dHeroV1SceneEntry | undefined {
  return STUDIO_BG3D_HERO_V1_ENTRIES.find((entry) => entry.slug === slug);
}

export function selectBg3dHeroV1AssetForTier(
  slug: Bg3dHeroV1Slug,
  tier: Bg3dHeroDeviceTier,
): StudioBg3dEnvironmentAsset | undefined {
  const entry = getBg3dHeroV1EntryBySlug(slug);
  if (!entry) return undefined;
  return tier === "desktop" ? entry.desktopAsset : entry.mobileAsset;
}

/** Wave 4 Blender export 실측 매니페스트로 바이트 크기와 SHA-256을 검증 주입한다. */
export function hydrateBg3dHeroV1FromManifest(
  records: readonly Bg3dHeroManifestHydrationRecord[],
): StudioBg3dHeroV1SceneEntry[] {
  const bySlug = new Map(records.map((r) => [r.slug, r]));
  return STUDIO_BG3D_HERO_V1_ENTRIES.map((entry) => {
    const rec = bySlug.get(entry.slug);
    if (!rec) return entry;
    return Object.freeze({
      ...entry,
      desktopAsset: Object.freeze({
        ...entry.desktopAsset,
        byteSize: rec.desktopByteSize,
        sha256: rec.desktopSha256,
      }),
      mobileAsset: Object.freeze({
        ...entry.mobileAsset,
        byteSize: rec.mobileByteSize,
        sha256: rec.mobileSha256,
      }),
      deliveryStatus: "verified-on-disk",
    });
  });
}

/** 6개 씬의 카탈로그 무결성(중복 ID/해시 0, 실측 SHA-256, CC0 Rights BOM, 8노드/4노드 예산 계약)을 검증한다. */
export function validateBg3dHeroV1CatalogContracts(): {
  readonly ok: boolean;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const ids = new Set<string>();
  const hashes = new Set<string>();
  for (const entry of STUDIO_BG3D_HERO_V1_ENTRIES) {
    for (const asset of [entry.desktopAsset, entry.mobileAsset]) {
      if (ids.has(asset.id)) issues.push(`중복 에셋 ID: ${asset.id}`);
      ids.add(asset.id);
      if (hashes.has(asset.sha256)) issues.push(`중복 SHA-256: ${asset.id}`);
      hashes.add(asset.sha256);
      if (entry.deliveryStatus === "verified-on-disk") {
        if (asset.byteSize <= 0) issues.push(`실측 바이트 누락: ${asset.id}`);
        if (!SHA256_DIGEST_PATTERN.test(asset.sha256)) issues.push(`유효하지 않은 SHA-256: ${asset.id}`);
      }
      if (asset.provenance.license !== "CC0-1.0" || asset.provenance.externalResources !== 0) {
        issues.push(`Rights BOM 위반: ${asset.id}`);
      }
      if (asset.provenance.blenderVersion !== "5.3") {
        issues.push(`Blender 5.3 버전 불일치: ${asset.id}`);
      }
    }
    if (entry.cameraPresets.length !== 3) {
      issues.push(`카메라 프리셋 부족: ${entry.slug}`);
    }
  }
  return { ok: issues.length === 0, issues };
}
