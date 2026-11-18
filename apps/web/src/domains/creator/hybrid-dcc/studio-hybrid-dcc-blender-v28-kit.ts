/**
 * Blender 5.3 VRM 1.0 해부학 관절 가동범위 포즈 마네킹(1.10m 난간 · 0.74m 착석 · 1.32m 포털 돌파)
 * 공통 건축 기준선 무오차 스냅 V28(3종, CC0-1.0) 카탈로그.
 */

import type { StudioHybridDccPrecisionBgKitItem } from "./studio-hybrid-dcc-architectural-primitives";

export const STUDIO_HYBRID_DCC_BLENDER_V28_VRM_KIT: readonly StudioHybridDccPrecisionBgKitItem[] =
  Object.freeze([
    {
      id: "webtoon-vrm-pose-railing-lean-110cm-v28",
      fileName: "webtoon-vrm-pose-railing-lean-110cm-v28.glb",
      glbUrl:
        "/studio-assets/blender-vrm-pose-mannequin-v28/webtoon-vrm-pose-railing-lean-110cm-v28.glb",
      previewUrl:
        "/studio-assets/blender-vrm-pose-mannequin-v28/thumbnails/webtoon-vrm-pose-railing-lean-110cm-v28.png",
      label: [
        "1.10m 난간 기대기 사색 VRM 마네킹 베이",
        "1.10m railing lean VRM 1.0 mannequin bay",
      ],
      hint: [
        "8등신 18관절 제한·1.10m 난간 팔꿈치 접지",
        "8-head 18-bone VRM snapped to 1.10m railing",
      ],
      triangles: 10212,
    },
    {
      id: "webtoon-vrm-pose-desk-seated-74cm-v28",
      fileName: "webtoon-vrm-pose-desk-seated-74cm-v28.glb",
      glbUrl:
        "/studio-assets/blender-vrm-pose-mannequin-v28/webtoon-vrm-pose-desk-seated-74cm-v28.glb",
      previewUrl:
        "/studio-assets/blender-vrm-pose-mannequin-v28/thumbnails/webtoon-vrm-pose-desk-seated-74cm-v28.png",
      label: [
        "0.74m 테이블 착석 대사 VRM 마네킹 베이",
        "0.74m seated dialogue VRM 1.0 mannequin bay",
      ],
      hint: [
        "8등신 착석 무릎 88°·0.74m 테이블 손목 접지",
        "Seated VRM wrists grounded on 0.74m table",
      ],
      triangles: 10212,
    },
    {
      id: "webtoon-vrm-pose-portal-stride-132cm-v28",
      fileName: "webtoon-vrm-pose-portal-stride-132cm-v28.glb",
      glbUrl:
        "/studio-assets/blender-vrm-pose-mannequin-v28/webtoon-vrm-pose-portal-stride-132cm-v28.glb",
      previewUrl:
        "/studio-assets/blender-vrm-pose-mannequin-v28/thumbnails/webtoon-vrm-pose-portal-stride-132cm-v28.png",
      label: [
        "1.32m 문고리 그립 돌파 VRM 마네킹 베이",
        "1.32m portal stride VRM 1.0 mannequin bay",
      ],
      hint: [
        "8등신 돌파 액션·1.32m 문고리·2.40m 통과",
        "Dynamic stride gripping 1.32m portal latch",
      ],
      triangles: 12748,
    },
  ]);
