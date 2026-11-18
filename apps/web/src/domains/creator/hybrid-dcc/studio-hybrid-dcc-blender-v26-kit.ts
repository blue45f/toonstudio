/**
 * Blender 5.3 전투·감정 격화 3단계 소품 파손·흔적(Intact 0% → Cracked 50% → Shattered 100%)
 * 공통 기준선(0.74m 테이블) 호환 V26(3종, CC0-1.0) 카탈로그.
 */

import type { StudioHybridDccPrecisionBgKitItem } from "./studio-hybrid-dcc-architectural-primitives";

export const STUDIO_HYBRID_DCC_BLENDER_V26_AFTERMATH_KIT: readonly StudioHybridDccPrecisionBgKitItem[] =
  Object.freeze([
    {
      id: "webtoon-aftermath-intact-salon-table-v26",
      fileName: "webtoon-aftermath-intact-salon-table-v26.glb",
      glbUrl:
        "/studio-assets/blender-aftermath-damage-v26/webtoon-aftermath-intact-salon-table-v26.glb",
      previewUrl:
        "/studio-assets/blender-aftermath-damage-v26/thumbnails/webtoon-aftermath-intact-salon-table-v26.png",
      label: [
        "0% 온전 정적 살롱 다과상·반사창 베이",
        "0% intact calm salon table & mirror bay",
      ],
      hint: [
        "0.74m 정적 테이블·파편 0개·프레넬 반사창",
        "Pristine 0.74m table, 0 shards & mirror glass",
      ],
      triangles: 9644,
    },
    {
      id: "webtoon-aftermath-cracked-fissure-bay-v26",
      fileName: "webtoon-aftermath-cracked-fissure-bay-v26.glb",
      glbUrl:
        "/studio-assets/blender-aftermath-damage-v26/webtoon-aftermath-cracked-fissure-bay-v26.glb",
      previewUrl:
        "/studio-assets/blender-aftermath-damage-v26/thumbnails/webtoon-aftermath-cracked-fissure-bay-v26.png",
      label: [
        "50% 균열 유리 금·전도 의자·파편 베이",
        "50% cracked glass fissure & tipped chair bay",
      ],
      hint: [
        "스파이더웹 유리 균열·전도 의자·파편 14개",
        "Spiderweb fissures, tipped chair & 14 chips",
      ],
      triangles: 10720,
    },
    {
      id: "webtoon-aftermath-shattered-tempest-ruin-v26",
      fileName: "webtoon-aftermath-shattered-tempest-ruin-v26.glb",
      glbUrl:
        "/studio-assets/blender-aftermath-damage-v26/webtoon-aftermath-shattered-tempest-ruin-v26.glb",
      previewUrl:
        "/studio-assets/blender-aftermath-damage-v26/thumbnails/webtoon-aftermath-shattered-tempest-ruin-v26.png",
      label: [
        "100% 파열 비산 프리즘 파편·크레이터 베이",
        "100% shattered prism shards & crater bay",
      ],
      hint: [
        "비산 프리즘 파편 28개·전복 테이블·충격흔",
        "28 suspended prism shards & impact crater",
      ],
      triangles: 11780,
    },
  ]);
