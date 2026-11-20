/**
 * Wave V2-W3A Blender 5.3 신규 한국 웹툰 핵심 3D 배경 6씬 (`hero-v2`) Desktop(8노드 컷어웨이) · Mobile(4노드)
 * 듀얼 에셋 카탈로그 + 3계층 Freestyle SVG + 3시간대 조명 프리셋 + 통합 12씬 레지스트리.
 *
 * - 기존 `STUDIO_BG3D_HERO_V1_ENTRIES`(6씬)의 하위 호환 계약을 유지하면서 신규 6씬(`hero-v2`)과
 *   전체 12씬(`STUDIO_BG3D_HERO_ALL_ENTRIES`)을 동일한 `StudioBg3dEnvironmentAsset` 규격으로 노출한다.
 * - 모든 12개 GLB는 `EXT_meshopt_compression` + 2048px 알베도(1024px 노멀/ORM, 52~76 MiB 디코드)로
 *   `validateStudioBg3dGlb` 입문 게이트를 100% 통과한다.
 */

import {
  defineEnvironment,
  type StudioBg3dEnvironmentAsset,
  type StudioBg3dEnvironmentProvenance,
  type StudioBg3dEnvironmentTheme,
} from "./studio-bg3d-environment-definition";
import {
  HERO_V1_RIGHTS_BOM,
  STUDIO_BG3D_HERO_V1_ENTRIES,
  type Bg3dHeroCameraPreset,
  type Bg3dHeroDeviceTier,
  type Bg3dHeroRightsBom,
  type StudioBg3dHeroV1SceneEntry,
} from "./studio-bg3d-hero-v1-catalog-entries";

export const BG3D_HERO_V2_SLUGS = Object.freeze([
  "kr_modern_office_suite",
  "kr_seoul_subway_train_platform",
  "kr_hospital_ward_corridor",
  "rofan_noble_study_parlor",
  "kr_rooftop_studio_oneroom",
  "kr_convenience_store_night",
] as const);

export type Bg3dHeroV2Slug = (typeof BG3D_HERO_V2_SLUGS)[number];
export type Bg3dHeroAnySlug = StudioBg3dHeroV1SceneEntry["slug"] | Bg3dHeroV2Slug;

export const BG3D_HERO_LIGHTING_PRESET_IDS = Object.freeze([
  "day_5600k",
  "sunset_3200k",
  "night_moon_8500k",
] as const);

export type Bg3dHeroLightingPresetId = (typeof BG3D_HERO_LIGHTING_PRESET_IDS)[number];

export interface Bg3dHeroFreestyleSvgMeta {
  readonly url: string;
  readonly byteSize: number;
  readonly pathCount: number;
  readonly strokeWidths: readonly ["0.55", "1.1", "2.0"];
}

export interface StudioBg3dHeroV2SceneEntry {
  readonly slug: Bg3dHeroV2Slug;
  readonly labelKo: string;
  readonly genreKo: string;
  readonly theme: StudioBg3dEnvironmentTheme;
  readonly desktopAsset: StudioBg3dEnvironmentAsset;
  readonly mobileAsset: StudioBg3dEnvironmentAsset;
  readonly cutawayEnabledWalls: readonly ("north" | "south" | "west" | "east" | "ceiling")[];
  readonly cameraPresets: readonly [Bg3dHeroCameraPreset, Bg3dHeroCameraPreset, Bg3dHeroCameraPreset];
  readonly freestyleSvg: Bg3dHeroFreestyleSvgMeta;
  readonly lightingPresetIds: readonly Bg3dHeroLightingPresetId[];
  readonly rightsBom: Bg3dHeroRightsBom;
  readonly deliveryStatus: "verified-on-disk";
}

const HERO_V2_PROVENANCE: StudioBg3dEnvironmentProvenance = Object.freeze({
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

function buildHeroV2SceneEntry(spec: {
  readonly slug: Bg3dHeroV2Slug;
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
  readonly svgByteSize: number;
  readonly svgPathCount: number;
  readonly cutawayEnabledWalls: readonly ("north" | "south" | "west" | "east" | "ceiling")[];
  readonly cameraPresets: readonly [Bg3dHeroCameraPreset, Bg3dHeroCameraPreset, Bg3dHeroCameraPreset];
}): StudioBg3dHeroV2SceneEntry {
  const baseTags = [...spec.tags, "hero-v2", "cutaway-8node", "freestyle-svg-3tier", "cc0"];
  const thumbUrl = `/assets/3d/environments/hero-v2/${spec.slug}/thumbnail.png` as const;

  const desktopAsset = defineEnvironment(
    {
      id: `ts-bg3d-hero-v2-${spec.slug}-desktop`,
      name: spec.labelKo,
      description: spec.descriptionKo,
      theme: spec.theme,
      tags: [...baseTags, "desktop-hero"],
      fileName: "desktop.glb",
      url: `/assets/3d/environments/hero-v2/${spec.slug}/desktop.glb`,
      thumbnailUrl: thumbUrl,
      byteSize: spec.desktopByteSize,
      sha256: spec.desktopSha256,
      bounds: spec.bounds,
      camera: spec.cameraPresets[0].camera,
      detailCamera: {
        ...spec.cameraPresets[1].camera,
        subject: { ko: spec.cameraPresets[1].labelKo, en: "Dialogue framing" },
      },
    },
    HERO_V2_PROVENANCE,
  );

  const mobileAsset = defineEnvironment(
    {
      id: `ts-bg3d-hero-v2-${spec.slug}-mobile`,
      name: `${spec.labelKo} (모바일 경량)`,
      description: `${spec.descriptionKo} — 모바일 4노드·2재질 아틀라스 경량본`,
      theme: spec.theme,
      tags: [...baseTags, "mobile-hero"],
      fileName: "mobile.glb",
      url: `/assets/3d/environments/hero-v2/${spec.slug}/mobile.glb`,
      thumbnailUrl: thumbUrl,
      byteSize: spec.mobileByteSize,
      sha256: spec.mobileSha256,
      bounds: spec.bounds,
      camera: spec.cameraPresets[0].camera,
      detailCamera: {
        ...spec.cameraPresets[1].camera,
        subject: { ko: spec.cameraPresets[1].labelKo, en: "Dialogue framing" },
      },
    },
    HERO_V2_PROVENANCE,
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
    freestyleSvg: Object.freeze({
      url: `/assets/3d/environments/hero-v2/${spec.slug}/freestyle.svg`,
      byteSize: spec.svgByteSize,
      pathCount: spec.svgPathCount,
      strokeWidths: Object.freeze(["0.55", "1.1", "2.0"] as const),
    }),
    lightingPresetIds: BG3D_HERO_LIGHTING_PRESET_IDS,
    rightsBom: HERO_V1_RIGHTS_BOM,
    deliveryStatus: "verified-on-disk",
  });
}

export const STUDIO_BG3D_HERO_V2_ENTRIES: readonly StudioBg3dHeroV2SceneEntry[] = Object.freeze([
  buildHeroV2SceneEntry({
    slug: "kr_modern_office_suite",
    labelKo: "한국 현대 오피스·회의실",
    genreKo: "현대 로맨스·오피스 드라마",
    descriptionKo: "통유리 커튼월·6인 듀얼모니터 워크스테이션·유리 회의실 화이트보드·대표실·탕비실을 갖춘 서울 오피스",
    theme: "urban",
    tags: ["오피스", "회사", "사무실", "회의실", "현대", "실내"],
    bounds: [12.0, 3.2, 8.9187],
    desktopByteSize: 4_055_544,
    desktopSha256: "sha256:93a8f17c88d3a8f16b2356a30f4f402de115f7bd811e61ef63f3e82f40439203",
    mobileByteSize: 1_874_852,
    mobileSha256: "sha256:f7381eb76c44a7b5fb9a4fd663b0c9f00aee9bccf5b4707be449a4c835fa9097",
    svgByteSize: 547_883,
    svgPathCount: 2_982,
    cutawayEnabledWalls: ["north", "south", "west", "east", "ceiling"],
    cameraPresets: [
      { id: "establishing", labelKo: "오픈 오피스 전경 24mm", camera: { position: [-2.85, 1.55, 2.85], target: [2.4, 1.32, -1.65], fovDegrees: 73 } },
      { id: "dialogue-ots", labelKo: "유리 회의실 화이트보드 35mm", camera: { position: [2.75, 1.48, -0.45], target: [5.55, 1.45, -1.88], fovDegrees: 54 } },
      { id: "dramatic-low", labelKo: "대표실 코너 대면 50mm", camera: { position: [-2.75, 1.42, -0.85], target: [-4.45, 1.32, -2.85], fovDegrees: 40 } },
    ],
  }),
  buildHeroV2SceneEntry({
    slug: "kr_seoul_subway_train_platform",
    labelKo: "서울 지하철 2호선 객실·승강장",
    genreKo: "현대 로맨스·스릴러·일상",
    descriptionKo: "2호선 그린라인 전동차 객실·28개 손잡이·일반/노약자석·스크린도어·열차 도착 전광판·점자블록 승강장 세트",
    theme: "urban",
    tags: ["지하철", "전동차", "승강장", "서울", "출퇴근", "2호선"],
    bounds: [16.0, 3.4, 6.5],
    desktopByteSize: 4_022_612,
    desktopSha256: "sha256:528fa4fe3b59dbb4614d2495696d7cf7bc0438b02c33b88c3784ac1c826a1f88",
    mobileByteSize: 1_800_104,
    mobileSha256: "sha256:a1465d8fd275257fc3988281acc402248965e1fb69a8ae8a2777c48cbcd117b7",
    svgByteSize: 630_666,
    svgPathCount: 3_452,
    cutawayEnabledWalls: ["north", "south", "west", "east", "ceiling"],
    cameraPresets: [
      { id: "establishing", labelKo: "전동차 객실 내부 통로 28mm", camera: { position: [-6.2, 1.52, -1.72], target: [5.5, 1.42, -1.72], fovDegrees: 65 } },
      { id: "dialogue-ots", labelKo: "승강장 스크린도어 대기 35mm", camera: { position: [-3.6, 1.56, 1.85], target: [1.4, 1.52, -0.4], fovDegrees: 54 } },
      { id: "dramatic-low", labelKo: "출입문 탑승 대면 50mm", camera: { position: [0.15, 1.48, 1.65], target: [0.0, 1.38, -2.4], fovDegrees: 40 } },
    ],
  }),
  buildHeroV2SceneEntry({
    slug: "kr_hospital_ward_corridor",
    labelKo: "종합병원 병실·복도·간호사실",
    genreKo: "메디컬·드라마·스릴러",
    descriptionKo: "전동 병상 2대·주름 프라이버시 커튼·IV 링거 스탠드·심전도 모니터·L자 간호사실·휠체어 복도 세트",
    theme: "urban",
    tags: ["병원", "병실", "복도", "간호사실", "메디컬", "실내"],
    bounds: [12.0, 3.1, 8.52],
    desktopByteSize: 3_857_792,
    desktopSha256: "sha256:f8f93f67e62b52d89af2623fe884e736a2b1fd42fda845be2322a545864aab6b",
    mobileByteSize: 1_637_208,
    mobileSha256: "sha256:434ca72c95228d4c776ec830354394213eef9bcf50e9f5ddbc6d120d300bd613",
    svgByteSize: 244_199,
    svgPathCount: 1_317,
    cutawayEnabledWalls: ["north", "south", "west", "east", "ceiling"],
    cameraPresets: [
      { id: "establishing", labelKo: "복도 & 간호사실 28mm", camera: { position: [-4.4, 1.54, 2.38], target: [3.85, 1.45, 0.45], fovDegrees: 65 } },
      { id: "dialogue-ots", labelKo: "2인실 병실 대화 35mm", camera: { position: [-1.85, 1.48, -0.15], target: [-4.45, 1.15, -2.05], fovDegrees: 54 } },
      { id: "dramatic-low", labelKo: "간호사실 접수 대면 50mm", camera: { position: [3.75, 1.5, 2.2], target: [3.85, 1.35, -0.6], fovDegrees: 40 } },
    ],
  }),
  buildHeroV2SceneEntry({
    slug: "rofan_noble_study_parlor",
    labelKo: "로판 북부대공 서재·응접실",
    genreKo: "로맨스판타지·귀족",
    descriptionKo: "아치형 3베이 대형 서가·이동식 사다리·3단 크리스털 샹들리에·대리석 벽난로·집무책상·티타임 응접실",
    theme: "fantasy",
    tags: ["로판", "서재", "응접실", "북부대공", "벽난로", "판타지"],
    bounds: [11.7745, 4.4, 9.1781],
    desktopByteSize: 4_697_472,
    desktopSha256: "sha256:d4972f7f90388147e3e62aaf5855f8dd2685ab5ee6096cc3c354ac195c54104f",
    mobileByteSize: 2_610_544,
    mobileSha256: "sha256:8e8fc086b768207d2f1ec292543571632314892794685211723e96f48df381a4",
    svgByteSize: 817_214,
    svgPathCount: 4_394,
    cutawayEnabledWalls: ["north", "south", "west", "east", "ceiling"],
    cameraPresets: [
      { id: "establishing", labelKo: "북부대공 서재 광각 28mm", camera: { position: [2.45, 1.66, 2.95], target: [-2.15, 1.88, -1.15], fovDegrees: 65 } },
      { id: "dialogue-ots", labelKo: "티타임 응접 대화 35mm", camera: { position: [1.85, 1.48, 2.65], target: [-2.65, 1.38, 0.95], fovDegrees: 54 } },
      { id: "dramatic-low", labelKo: "벽난로 클로즈업 50mm", camera: { position: [-0.85, 1.56, 1.65], target: [-5.1, 1.75, 0.35], fovDegrees: 40 } },
    ],
  }),
  buildHeroV2SceneEntry({
    slug: "kr_rooftop_studio_oneroom",
    labelKo: "한국 옥탑방 원룸·야외 테라스",
    genreKo: "현대 일상·청춘·로맨스",
    descriptionKo: "슬라이딩 테라스 문·스트링 전구 옥탑 마당·캠핑 의자·빨래 건조대·작업 PC 책상·주방·침대 원룸 세트",
    theme: "home",
    tags: ["옥탑방", "원룸", "자취방", "테라스", "일상", "청춘"],
    bounds: [9.5, 2.8, 7.5],
    desktopByteSize: 3_770_584,
    desktopSha256: "sha256:ea4e14295080f20b411522296b95d4b84d571bcf43158a9ee7766cee255fb980",
    mobileByteSize: 1_700_820,
    mobileSha256: "sha256:78b3ce035261995e4c2f2df7bce28cf38f6ea83f14775bb6fa9f1c3e56b36d22",
    svgByteSize: 328_258,
    svgPathCount: 1_763,
    cutawayEnabledWalls: ["north", "south", "west", "east", "ceiling"],
    cameraPresets: [
      { id: "establishing", labelKo: "옥탑 원룸 실내 광각 28mm", camera: { position: [-3.45, 1.48, 1.85], target: [0.35, 1.28, -1.95], fovDegrees: 65 } },
      { id: "dialogue-ots", labelKo: "옥탑 테라스 스트링 전구 35mm", camera: { position: [4.05, 1.54, 2.85], target: [1.1, 1.35, -1.4], fovDegrees: 54 } },
      { id: "dramatic-low", labelKo: "작업 책상 마감 클로즈업 50mm", camera: { position: [-1.85, 1.36, -1.15], target: [-0.95, 1.12, -2.95], fovDegrees: 40 } },
    ],
  }),
  buildHeroV2SceneEntry({
    slug: "kr_convenience_store_night",
    labelKo: "한국 24시 편의점 야간 세트",
    genreKo: "현대 일상·청춘·스릴러",
    descriptionKo: "야외 파라솔 테이블·24시 간판·창가 컵라면 시식 바·4도어 음료 냉장고·스낵 진열대·계산대 POS 세트",
    theme: "hospitality",
    tags: ["편의점", "야간", "24시", "컵라면", "알바", "현대"],
    bounds: [11.0, 3.2, 8.0],
    desktopByteSize: 4_247_096,
    desktopSha256: "sha256:4a730f82e550372cdd280425d337f31d746e66223dd9573e1b4d7024d69675b8",
    mobileByteSize: 2_146_812,
    mobileSha256: "sha256:1c613f4660fabf20528de2ea496c724fb6f58c9db68abb477261d3324b525282",
    svgByteSize: 371_213,
    svgPathCount: 2_045,
    cutawayEnabledWalls: ["north", "south", "west", "east", "ceiling"],
    cameraPresets: [
      { id: "establishing", labelKo: "야간 편의점 전면 간판 28mm", camera: { position: [3.2, 1.72, 6.8], target: [-0.2, 1.75, 0.8], fovDegrees: 65 } },
      { id: "dialogue-ots", labelKo: "계산대 카운터 대화 35mm", camera: { position: [-0.85, 1.54, 0.35], target: [-3.4, 1.38, -1.65], fovDegrees: 54 } },
      { id: "dramatic-low", labelKo: "창가 컵라면 시식 바 50mm", camera: { position: [1.15, 1.42, 0.45], target: [3.55, 1.16, 1.35], fovDegrees: 40 } },
    ],
  }),
]);

export const STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V2: readonly StudioBg3dEnvironmentAsset[] = Object.freeze(
  STUDIO_BG3D_HERO_V2_ENTRIES.map((entry) => entry.desktopAsset),
);

export const STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_V2_MOBILE: readonly StudioBg3dEnvironmentAsset[] = Object.freeze(
  STUDIO_BG3D_HERO_V2_ENTRIES.map((entry) => entry.mobileAsset),
);

/** 리마스터 v1(6씬) + 신규 v2(6씬) 전체 12개 웹툰 히어로 3D 배경 통합 카탈로그. */
export const STUDIO_BG3D_HERO_ALL_ENTRIES: readonly (StudioBg3dHeroV1SceneEntry | StudioBg3dHeroV2SceneEntry)[] = Object.freeze([
  ...STUDIO_BG3D_HERO_V1_ENTRIES,
  ...STUDIO_BG3D_HERO_V2_ENTRIES,
]);

export const STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_ALL: readonly StudioBg3dEnvironmentAsset[] = Object.freeze(
  STUDIO_BG3D_HERO_ALL_ENTRIES.map((entry) => entry.desktopAsset),
);

export const STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_ALL_MOBILE: readonly StudioBg3dEnvironmentAsset[] = Object.freeze(
  STUDIO_BG3D_HERO_ALL_ENTRIES.map((entry) => entry.mobileAsset),
);

export function getBg3dHeroV2EntryBySlug(slug: Bg3dHeroV2Slug): StudioBg3dHeroV2SceneEntry | undefined {
  return STUDIO_BG3D_HERO_V2_ENTRIES.find((entry) => entry.slug === slug);
}

export function selectBg3dHeroV2AssetForTier(
  slug: Bg3dHeroV2Slug,
  tier: Bg3dHeroDeviceTier,
): StudioBg3dEnvironmentAsset | undefined {
  const entry = getBg3dHeroV2EntryBySlug(slug);
  if (!entry) return undefined;
  return tier === "desktop" ? entry.desktopAsset : entry.mobileAsset;
}

export function validateBg3dHeroV2CatalogContracts(): {
  readonly ok: boolean;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const ids = new Set<string>();
  const hashes = new Set<string>();
  for (const entry of STUDIO_BG3D_HERO_ALL_ENTRIES) {
    for (const asset of [entry.desktopAsset, entry.mobileAsset]) {
      if (ids.has(asset.id)) issues.push(`중복 에셋 ID: ${asset.id}`);
      ids.add(asset.id);
      if (hashes.has(asset.sha256)) issues.push(`중복 SHA-256: ${asset.id}`);
      hashes.add(asset.sha256);
      if (asset.byteSize <= 0) issues.push(`실측 바이트 누락: ${asset.id}`);
      if (!SHA256_DIGEST_PATTERN.test(asset.sha256)) issues.push(`유효하지 않은 SHA-256: ${asset.id}`);
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
