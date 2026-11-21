/**
 * Wave 4 Blender 5.3 VRM 1.0 웹툰 히어로 아바타 8종 메타데이터 · MToon `screenCoordinates` · Rights BOM 레지스트리.
 *
 * - 기존 `vrm-library.ts`의 `SampleVrm` 및 `BundledVrmLicenseNotice` 계약을 100% 준수한다.
 * - 레거시 VRM 0.x(`worldCoordinates`)와 달리 전 종 VRM 1.0 규격 + `screenCoordinates` 외곽선 모드로
 *   배경 3D LT 선화와 화면 비율에 상관없이 일관된 웹툰 선 두께를 보장한다.
 * - `apps/web/public/vrm/toonstudio-hero-v1/manifest.json`의 실측 바이트 크기와 SHA-256 해시를 핀 고정한다.
 */

import type { BundledVrmLicenseNotice, SampleVrm, VrmContentHash } from "./vrm-library";

export const VRM_HERO_V1_ARCHETYPE_IDS = Object.freeze([
  "romance-female",
  "romance-male",
  "academy-female",
  "academy-male",
  "rofan-empress",
  "rofan-duke",
  "action-hunter",
  "chibi-mascot",
] as const);

export type VrmHeroV1ArchetypeId = (typeof VRM_HERO_V1_ARCHETYPE_IDS)[number];

export const VRM_1_0_STANDARD_EXPRESSION_KEYS = Object.freeze([
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "aa",
  "ih",
  "ou",
  "ee",
  "oh",
  "blink",
  "blinkLeft",
  "blinkRight",
  "lookUp",
  "lookDown",
  "lookLeft",
  "lookRight",
  "neutral",
] as const);

export interface HeroVrmMtoonContract {
  readonly vrmSpecVersion: "1.0";
  readonly outlineWidthMode: "screenCoordinates";
  readonly outlineWidthFactor: number;
  readonly shadingShiftFactor: number;
  readonly shadingToonyFactor: number;
  readonly springBoneHairEnabled: boolean;
  readonly springBoneClothEnabled: boolean;
}

export interface HeroVrmRightsBom {
  readonly licenseId: "CC0-1.0";
  readonly originLabel: "ToonStudio Original";
  readonly licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/";
  readonly commercialUse: true;
  readonly attributionRequired: false;
  readonly externalResources: 0;
  readonly blenderVersion: "5.3";
  readonly vrmAddonVersion: "4.5.0";
}

export interface StudioVrmHeroV1CatalogEntry {
  readonly archetypeId: VrmHeroV1ArchetypeId;
  readonly sampleVrm: SampleVrm;
  readonly genreKo: string;
  readonly summaryKo: string;
  readonly heightM: number;
  readonly headBodyRatio: number;
  readonly mtoonContract: HeroVrmMtoonContract;
  readonly expressionKeys: readonly string[];
  readonly rightsBom: HeroVrmRightsBom;
  readonly byteSize: number;
  readonly contentHash: VrmContentHash | null;
  readonly deliveryStatus: "staged-contract" | "verified-on-disk";
}

export interface VrmHeroManifestHydrationRecord {
  readonly archetypeId: VrmHeroV1ArchetypeId;
  readonly byteSize: number;
  readonly contentHash: VrmContentHash;
}

export const HERO_VRM_V1_RIGHTS_BOM: HeroVrmRightsBom = Object.freeze({
  licenseId: "CC0-1.0",
  originLabel: "ToonStudio Original",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  commercialUse: true,
  attributionRequired: false,
  externalResources: 0,
  blenderVersion: "5.3",
  vrmAddonVersion: "4.5.0",
});

export const HERO_VRM_V1_LICENSE_NOTICE: BundledVrmLicenseNotice = Object.freeze({
  label: "CC0 1.0 (ToonStudio Original)",
  summary: "상업 웹툰 연재·변형·2D 리터칭에 출처 표기 없이 자유롭게 사용할 수 있는 자체 제작 VRM 1.0 모델입니다.",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
});

const SHA256_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function buildHeroVrmEntry(spec: {
  readonly archetypeId: VrmHeroV1ArchetypeId;
  readonly nameKo: string;
  readonly genreKo: string;
  readonly summaryKo: string;
  readonly heightM: number;
  readonly headBodyRatio: number;
  readonly outlineWidthFactor: number;
  readonly springBoneClothEnabled: boolean;
  readonly byteSize: number;
  readonly contentHash: VrmContentHash;
}): StudioVrmHeroV1CatalogEntry {
  // CC0-1.0 자체 제작 모델은 카드 고지 의무가 없으므로 sampleVrm.licenseNotice는 생략한다.
  const sampleVrm: SampleVrm = Object.freeze({
    id: `ts-vrm-hero-v1-${spec.archetypeId}`,
    name: spec.nameKo,
    url: `/vrm/toonstudio-hero-v1/${spec.archetypeId}.vrm`,
    thumbnailUrl: `/assets/3d/characters/thumbnails/toonstudio-hero-v1/${spec.archetypeId}.png`,
    visibility: "default",
  });

  return Object.freeze({
    archetypeId: spec.archetypeId,
    sampleVrm,
    genreKo: spec.genreKo,
    summaryKo: spec.summaryKo,
    heightM: spec.heightM,
    headBodyRatio: spec.headBodyRatio,
    mtoonContract: Object.freeze({
      vrmSpecVersion: "1.0",
      outlineWidthMode: "screenCoordinates",
      outlineWidthFactor: spec.outlineWidthFactor,
      shadingShiftFactor: -0.15,
      shadingToonyFactor: 0.9,
      springBoneHairEnabled: true,
      springBoneClothEnabled: spec.springBoneClothEnabled,
    }),
    expressionKeys: VRM_1_0_STANDARD_EXPRESSION_KEYS,
    rightsBom: HERO_VRM_V1_RIGHTS_BOM,
    byteSize: spec.byteSize,
    contentHash: spec.contentHash,
    deliveryStatus: "verified-on-disk",
  });
}

export const STUDIO_VRM_HERO_V1_ENTRIES: readonly StudioVrmHeroV1CatalogEntry[] = Object.freeze([
  buildHeroVrmEntry({
    archetypeId: "romance-female",
    nameKo: "서연 (로맨스 여성 주연)",
    genreKo: "현대 로맨스",
    summaryKo: "7.2등신 한국 현대 로맨스 비율, 레이어드 롱헤어와 카디건·스커트 착장 대응",
    heightM: 1.6614,
    headBodyRatio: 7.2,
    outlineWidthFactor: 0.0022,
    springBoneClothEnabled: true,
    byteSize: 4_331_868,
    contentHash: "sha256:5d6279f2748b8b23f69989023a603908ffc61b6563dc5b225fa4459044d85e5c",
  }),
  buildHeroVrmEntry({
    archetypeId: "romance-male",
    nameKo: "도윤 (오피스 로맨스 남주)",
    genreKo: "현대 로맨스",
    summaryKo: "8.0등신 넓은 어깨·슬림 수트 실루엣, 쉼표 숏헤어와 오피스 코트·수트 착장 대응",
    heightM: 1.8432,
    headBodyRatio: 8.0,
    outlineWidthFactor: 0.0022,
    springBoneClothEnabled: true,
    byteSize: 4_471_640,
    contentHash: "sha256:da0fda1a3eda886e85cb1e3ef9c4911f36b1e15cbe3242bbd8e6425ea0cb83b7",
  }),
  buildHeroVrmEntry({
    archetypeId: "academy-female",
    nameKo: "하늘 (한국 학원 교복 여주)",
    genreKo: "학원물·청춘",
    summaryKo: "6.8등신 청춘 학원 비율, 소프트 단발·교복 블레이저·플리츠 스커트 대응",
    heightM: 1.5729,
    headBodyRatio: 6.8,
    outlineWidthFactor: 0.0024,
    springBoneClothEnabled: true,
    byteSize: 4_801_212,
    contentHash: "sha256:da7db2e857d85c1891728cc7743d23a03eafab80581ada0cba15ee9427085c15",
  }),
  buildHeroVrmEntry({
    archetypeId: "academy-male",
    nameKo: "지후 (한국 학원 교복 남주)",
    genreKo: "학원물·청춘",
    summaryKo: "7.4등신 소년 비율, 댄디 투블럭 헤어와 교복 블레이저·슬랙스 대응",
    heightM: 1.5766,
    headBodyRatio: 7.4,
    outlineWidthFactor: 0.0024,
    springBoneClothEnabled: false,
    byteSize: 4_696_288,
    contentHash: "sha256:951576dd3911fbcb008ecbcd161b903dd2fd993df8bfd12e8ed61a93687bdcbe",
  }),
  buildHeroVrmEntry({
    archetypeId: "rofan-empress",
    nameKo: "아리아 (로판 제국 황녀)",
    genreKo: "로맨스판타지",
    summaryKo: "7.6등신 우아한 귀족 두상과 긴 목선, 브레이드 크라운 헤어 및 로판 코르셋 드레스 리깅",
    heightM: 1.6849,
    headBodyRatio: 7.6,
    outlineWidthFactor: 0.002,
    springBoneClothEnabled: true,
    byteSize: 4_370_660,
    contentHash: "sha256:9b02a08a7323dadd901eba7f348a3a5b3703c7169450be6e75b717ca7bad44d4",
  }),
  buildHeroVrmEntry({
    archetypeId: "rofan-duke",
    nameKo: "카시안 (로판 북부대공)",
    genreKo: "로맨스판타지",
    summaryKo: "8.2등신 장신 귀족 비율, 날카로운 턱선과 제국 케이프 제복 스프링본 리깅",
    heightM: 1.842,
    headBodyRatio: 8.2,
    outlineWidthFactor: 0.002,
    springBoneClothEnabled: true,
    byteSize: 4_647_524,
    contentHash: "sha256:23d60b6daeed3db5e980592295f3a7de024fc36868e2e5989e1e7e4cf5249f07",
  }),
  buildHeroVrmEntry({
    archetypeId: "action-hunter",
    nameKo: "강혁 (액션 각성 헌터)",
    genreKo: "액션·판타지",
    summaryKo: "7.8등신 탄탄한 근육 밸런스, 울프 레이어드 헤어와 테크웨어 하네스 리깅",
    heightM: 1.8763,
    headBodyRatio: 7.8,
    outlineWidthFactor: 0.0026,
    springBoneClothEnabled: true,
    byteSize: 4_704_580,
    contentHash: "sha256:465d6f0db7e5df98faef868c4cad390d46ce2fc27aac55c30ad231e0c4c69dc3",
  }),
  buildHeroVrmEntry({
    archetypeId: "chibi-mascot",
    nameKo: "모찌 (SD 웹툰 마스코트)",
    genreKo: "개그·일상·SD컷",
    summaryKo: "3.0등신 데포르메 SD 비율, 트윈테일·후디 착장과 과장 표정 블렌드셰이프 리깅",
    heightM: 1.0638,
    headBodyRatio: 3.0,
    outlineWidthFactor: 0.0032,
    springBoneClothEnabled: false,
    byteSize: 3_935_620,
    contentHash: "sha256:c5dca262b8e638ae685178904032ff06c935152be3a7629eb47137c7b8d9dee9",
  }),
]);

/** `vrm-library.ts`의 기본 번들 픽커에 바로 합칠 수 있는 `SampleVrm` 배열. */
export const STUDIO_VRM_HERO_V1_SAMPLES: readonly SampleVrm[] = Object.freeze(
  STUDIO_VRM_HERO_V1_ENTRIES.map((entry) => entry.sampleVrm),
);

export function getVrmHeroV1EntryByArchetype(
  archetypeId: VrmHeroV1ArchetypeId,
): StudioVrmHeroV1CatalogEntry | undefined {
  return STUDIO_VRM_HERO_V1_ENTRIES.find((entry) => entry.archetypeId === archetypeId);
}

export function hydrateVrmHeroV1FromManifest(
  records: readonly VrmHeroManifestHydrationRecord[],
): StudioVrmHeroV1CatalogEntry[] {
  const byId = new Map(records.map((r) => [r.archetypeId, r]));
  return STUDIO_VRM_HERO_V1_ENTRIES.map((entry) => {
    const rec = byId.get(entry.archetypeId);
    if (!rec) return entry;
    return Object.freeze({
      ...entry,
      byteSize: rec.byteSize,
      contentHash: rec.contentHash,
      deliveryStatus: "verified-on-disk",
    });
  });
}

/** 8종 히어로 아바타의 VRM 1.0 · MToon `screenCoordinates` · 실측 해시 · Rights BOM 계약을 검증한다. */
export function validateVrmHeroV1CatalogContracts(): {
  readonly ok: boolean;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const ids = new Set<string>();
  const hashes = new Set<string>();
  for (const entry of STUDIO_VRM_HERO_V1_ENTRIES) {
    if (ids.has(entry.sampleVrm.id)) issues.push(`중복 VRM ID: ${entry.sampleVrm.id}`);
    ids.add(entry.sampleVrm.id);
    if (entry.deliveryStatus === "verified-on-disk") {
      if (entry.byteSize <= 0) issues.push(`실측 바이트 누락: ${entry.archetypeId}`);
      if (!entry.contentHash || !SHA256_HASH_PATTERN.test(entry.contentHash)) {
        issues.push(`유효하지 않은 SHA-256: ${entry.archetypeId}`);
      } else if (hashes.has(entry.contentHash)) {
        issues.push(`중복 SHA-256: ${entry.archetypeId}`);
      } else {
        hashes.add(entry.contentHash);
      }
    }
    if (entry.mtoonContract.vrmSpecVersion !== "1.0") {
      issues.push(`VRM 1.0 아님: ${entry.archetypeId}`);
    }
    if (entry.mtoonContract.outlineWidthMode !== "screenCoordinates") {
      issues.push(`MToon screenCoordinates 미적용: ${entry.archetypeId}`);
    }
    if (entry.rightsBom.licenseId !== "CC0-1.0" || entry.rightsBom.externalResources !== 0) {
      issues.push(`Rights BOM 위반: ${entry.archetypeId}`);
    }
    if (entry.expressionKeys.length < 18) {
      issues.push(`표정 키 부족: ${entry.archetypeId}`);
    }
  }
  return { ok: issues.length === 0, issues };
}
