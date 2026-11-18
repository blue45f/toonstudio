/**
 * Blender 5.3 2인 시선 교차·키 차이(188×164cm 24cm 갭 · 0.74m 테이블 OTS · 2.40m 포털 대치)
 * 180도 연출축(Axis-of-Action) 가이드 내장 듀오 VRM 마네킹 V29(3종, CC0-1.0) 카탈로그.
 */

import type { StudioHybridDccPrecisionBgKitItem } from "./studio-hybrid-dcc-architectural-primitives";

export const STUDIO_HYBRID_DCC_BLENDER_V29_DUO_KIT: readonly StudioHybridDccPrecisionBgKitItem[] =
  Object.freeze([
    {
      id: "webtoon-duo-rofan-gaze-24cm-gap-v29",
      fileName: "webtoon-duo-rofan-gaze-24cm-gap-v29.glb",
      glbUrl:
        "/studio-assets/blender-duo-eyeline-ots-v29/webtoon-duo-rofan-gaze-24cm-gap-v29.glb",
      previewUrl:
        "/studio-assets/blender-duo-eyeline-ots-v29/thumbnails/webtoon-duo-rofan-gaze-24cm-gap-v29.png",
      label: [
        "188×164cm(24cm 갭) 로판 시선 교차 듀오 베이",
        "188x164cm (24cm gap) Rofan eye-line duo bay",
      ],
      hint: [
        "24cm 키 차이 눈맞춤(±15°)·180도 연출축 레일",
        "24cm height-gap gaze beam & 180-deg axis rail",
      ],
      triangles: 12332,
    },
    {
      id: "webtoon-duo-ots-table-dialogue-v29",
      fileName: "webtoon-duo-ots-table-dialogue-v29.glb",
      glbUrl:
        "/studio-assets/blender-duo-eyeline-ots-v29/webtoon-duo-ots-table-dialogue-v29.glb",
      previewUrl:
        "/studio-assets/blender-duo-eyeline-ots-v29/thumbnails/webtoon-duo-ots-table-dialogue-v29.png",
      label: [
        "0.74m 테이블 오버더숄더(OTS) 대화 듀오 베이",
        "0.74m table over-the-shoulder dialogue duo bay",
      ],
      hint: [
        "182×168cm 착석 마주보기·어깨 걸침 안전각",
        "Seated OTS dialogue pair & wrist datum snap",
      ],
      triangles: 12332,
    },
    {
      id: "webtoon-duo-action-standoff-clash-v29",
      fileName: "webtoon-duo-action-standoff-clash-v29.glb",
      glbUrl:
        "/studio-assets/blender-duo-eyeline-ots-v29/webtoon-duo-action-standoff-clash-v29.glb",
      previewUrl:
        "/studio-assets/blender-duo-eyeline-ots-v29/thumbnails/webtoon-duo-action-standoff-clash-v29.png",
      label: [
        "2.40m 포털 검극 대치·180도 연출축 듀오 베이",
        "2.40m portal clash standoff & 180-deg duo bay",
      ],
      hint: [
        "186×180cm 포털 대치 구도·비산 파편 28개",
        "Portal standoff clash pair & 180-deg safety rail",
      ],
      triangles: 14868,
    },
  ]);
