/**
 * Blender 5.3 건축 기준선 차폐형 기상(비·눈·폭풍 해무 & 젖은 바닥 스페큘러 파문) ·
 * 듀얼 포컬(24mm×85mm) · 다국어(KO/EN/JA) 슬롯 호환 V24(3종, CC0-1.0) 카탈로그.
 */

import type { StudioHybridDccPrecisionBgKitItem } from "./studio-hybrid-dcc-architectural-primitives";

export const STUDIO_HYBRID_DCC_BLENDER_V24_WEATHER_KIT: readonly StudioHybridDccPrecisionBgKitItem[] =
  Object.freeze([
    {
      id: "webtoon-weather-eaves-rain-ripples-15pct-v24",
      fileName: "webtoon-weather-eaves-rain-ripples-15pct-v24.glb",
      glbUrl: "/studio-assets/blender-weather-occlusion-motion-v24/webtoon-weather-eaves-rain-ripples-15pct-v24.glb",
      previewUrl: "/studio-assets/blender-weather-occlusion-motion-v24/thumbnails/webtoon-weather-eaves-rain-ripples-15pct-v24.png",
      label: ["15% 처마 차폐 폭우·문턱 빗물 파문 베이", "15% eaves-occluded rain & threshold ripples bay"],
      hint: ["2.4m 상인방 차폐 폭우·0.38m 바닥 파문", "2.4m lintel-occluded rain & 4 wet ripples"],
      triangles: 8928,
    },
    {
      id: "webtoon-weather-rofan-blossom-snow-65pct-v24",
      fileName: "webtoon-weather-rofan-blossom-snow-65pct-v24.glb",
      glbUrl: "/studio-assets/blender-weather-occlusion-motion-v24/webtoon-weather-rofan-blossom-snow-65pct-v24.glb",
      previewUrl: "/studio-assets/blender-weather-occlusion-motion-v24/thumbnails/webtoon-weather-rofan-blossom-snow-65pct-v24.png",
      label: ["65% 로판 설화 눈보라·난간 서리 차폐 베이", "65% Rofan occluded snowdrift & frost sill bay"],
      hint: ["2.4m 아치 차폐 설화·0.77m 서리 파문", "Arch-occluded snow crystals & 7 frost ripples"],
      triangles: 10160,
    },
    {
      id: "webtoon-weather-abyss-storm-mist-100pct-v24",
      fileName: "webtoon-weather-abyss-storm-mist-100pct-v24.glb",
      glbUrl: "/studio-assets/blender-weather-occlusion-motion-v24/webtoon-weather-abyss-storm-mist-100pct-v24.glb",
      previewUrl: "/studio-assets/blender-weather-occlusion-motion-v24/thumbnails/webtoon-weather-abyss-storm-mist-100pct-v24.png",
      label: ["100% 각성 폭풍 해무·전면 수막 파문 베이", "100% tempest storm surge & wet ripple floor"],
      hint: ["8600K 폭풍 역광·1.04m 전면 수막 파문", "Tempest halo & 10 specular floor ripples"],
      triangles: 10248,
    },
  ]);
