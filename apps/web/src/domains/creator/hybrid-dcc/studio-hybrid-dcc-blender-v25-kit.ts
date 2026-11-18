/**
 * Blender 5.3 개구부 기류 연동 드레이프 패브릭(Wind-Coupled Drape) ·
 * 하프 미러 유리 반사창(Fresnel 12~29%) · 단행본(B5/A5 3mm 도련) 호환 V25(3종, CC0-1.0) 카탈로그.
 */

import type { StudioHybridDccPrecisionBgKitItem } from "./studio-hybrid-dcc-architectural-primitives";

export const STUDIO_HYBRID_DCC_BLENDER_V25_DRAPE_KIT: readonly StudioHybridDccPrecisionBgKitItem[] =
  Object.freeze([
    {
      id: "webtoon-wind-drape-halfmirror-rain-15pct-v25",
      fileName: "webtoon-wind-drape-halfmirror-rain-15pct-v25.glb",
      glbUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/webtoon-wind-drape-halfmirror-rain-15pct-v25.glb",
      previewUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/thumbnails/webtoon-wind-drape-halfmirror-rain-15pct-v25.png",
      label: [
        "15% 미풍 린넨 커튼·하프 미러 반사창 베이",
        "15% breeze linen drape & half-mirror glass bay",
      ],
      hint: [
        "2.2m/s 기류 0.19m 펄럭임·Fresnel 29% 반사창",
        "0.19m linen billow & 29% Fresnel reflection",
      ],
      triangles: 10040,
    },
    {
      id: "webtoon-wind-drape-rofan-velvet-65pct-v25",
      fileName: "webtoon-wind-drape-rofan-velvet-65pct-v25.glb",
      glbUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/webtoon-wind-drape-rofan-velvet-65pct-v25.glb",
      previewUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/thumbnails/webtoon-wind-drape-rofan-velvet-65pct-v25.png",
      label: [
        "65% 돌풍 로판 벨벳 휘장·하프 미러 베이",
        "65% gust Rofan velvet drape & half-mirror bay",
      ],
      hint: [
        "6.1m/s 기류 0.54m 벨벳 휘장·Fresnel 19%",
        "0.54m velvet billow & 19% Fresnel reflection",
      ],
      triangles: 11272,
    },
    {
      id: "webtoon-wind-drape-tempest-cape-100pct-v25",
      fileName: "webtoon-wind-drape-tempest-cape-100pct-v25.glb",
      glbUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/webtoon-wind-drape-tempest-cape-100pct-v25.glb",
      previewUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/thumbnails/webtoon-wind-drape-tempest-cape-100pct-v25.png",
      label: [
        "100% 폭풍 각성 비단 휘장·수막 반사 베이",
        "100% tempest silk drape & specular mirror bay",
      ],
      hint: [
        "8.8m/s 폭풍 0.78m 비단 휘장·Fresnel 12%",
        "0.78m silk billow & 12% Fresnel reflection",
      ],
      triangles: 11360,
    },
  ]);
