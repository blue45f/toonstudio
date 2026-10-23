/**
 * 도구별 분위기 클립 12편 — 각 도구의 소개·진입 표면에 까는 배경 영상.
 * 전부 생성형 AI로 만든 배경 영상이라 실제 제품 화면 캡처가 아니다.
 * 배선한 표면에서는 그 성격을 배지로 밝힌다(다른 장식 영상 표면과 같은 계약).
 * 이 파일이 12편 인벤토리의 정본이다.
 *
 * 배선 11편:
 * - production(제작 허브 랜딩 /production의 도입 히어로): 그라데이션 밴드와
 *   블러 장식만 있던 히어로라, 기능 요약 페이지 CTA 배경(브랜드 클립 파도)과
 *   같은 문법으로 배경에 깔았다. 소비 모듈은 도메인 경계 안쪽인
 *   domains/creator/production-hub/ProductionLandingBackdrop.tsx다.
 * - story·canvas·bg3d·ailab·collab·learn·community(기능 요약 페이지 /features의
 *   카테고리 헤더 밴드): 도구 목적지 자체는 에디터·작업 화면으로 직행해 배경을
 *   얹을 수 없지만, 기능 지도에서는 카테고리마다 헤더 밴드라는 소개 슬롯이
 *   있어 같은 페이지 CTA 밴드와 같은 문법(영상+스크림+배지)으로 1:1 배선했다.
 *   매핑은 아래 FEATURE_OVERVIEW_CATEGORY_CLIPS가 정본이다(plan→story,
 *   draw→canvas, three-d→bg3d, ai→ailab, production→collab, learn→learn,
 *   community→community).
 *
 * comic·shaper·publish 3편은 도구 목적지(에디터·폼 직행)에는 얹을 수 없어,
 * /about/workflow의 단계 패널 배경으로 재배선했다(script→comic,
 * world→shaper, release→publish). 단계와의 매핑 정본은
 * domains/marketing/public/workflow-stages.ts의 WORKFLOW_STAGE_CLIPS다.
 *
 * 자산만 반입하고 삽입을 보류한 1편:
 * - poser: /studio/poser 독립 도구(데생 인형·매직 포저) 화면으로 직행하고,
 *   포즈를 주제로 한 소개 표면은 제품 투어 3D 챕터뿐인데 그 카드에는 이미
 *   같은 주제(턴테이블 마네킹)의 챕터 배경 루프가 깔려 있어 중복을 피했다.
 *
 * 세로 변형 7편(canvas·bg3d·shaper·story·comic·publish·collab)은 위 12편과
 * 별도로, 소셜 카드에 바로 쓸 수 있게 같은 주제를 세로(9:16)로 다시 그린
 * 것이다. 표면에는 배선하지 않고 홍보 영상 자료실에만 수록한다(TOOL_CLIPS_VERTICAL).
 */
export interface ToolClip {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

/** 도구 클립 id — 투어 챕터 feature 링크가 가리키는 도구와 맞춘다. */
export type ToolClipId =
  | "canvas"
  | "story"
  | "comic"
  | "bg3d"
  | "poser"
  | "shaper"
  | "ailab"
  | "publish"
  | "learn"
  | "collab"
  | "community"
  | "production";

export interface ToolSurfaceClip extends ToolClip {
  readonly toolId: ToolClipId;
}

/**
 * 표면에 배선한 도구 클립 — 제작 허브 랜딩 히어로의 배경.
 * 소비 모듈: domains/creator/production-hub/ProductionLandingBackdrop.tsx.
 */
export const TOOL_SURFACE_CLIPS: readonly ToolSurfaceClip[] = [
  { toolId: "production", src: "/brand/tool-clips/tool-production.mp4", width: 1344, height: 768 },
];

export function toolSurfaceClip(toolId: string): ToolSurfaceClip | undefined {
  return TOOL_SURFACE_CLIPS.find((clip) => clip.toolId === toolId);
}

export interface FeatureOverviewCategoryClip extends ToolClip {
  /** features-overview-data의 카테고리 id. */
  readonly categoryId: string;
  readonly toolId: ToolClipId;
}

/**
 * 기능 요약 페이지(/features) 카테고리 헤더 밴드의 배경 클립 — 카테고리가
 * 대표하는 도구의 분위기를 그린 생성형 AI 영상이라 실제 제품 화면이 아니다.
 * 그 성격은 밴드 안의 배지로 밝힌다(같은 페이지 CTA 밴드와 같은 문구).
 * 카테고리 id는 features-overview-data.ts의 FEATURE_OVERVIEW_CATEGORIES와 맞춘다.
 */
export const FEATURE_OVERVIEW_CATEGORY_CLIPS: readonly FeatureOverviewCategoryClip[] = [
  { categoryId: "plan", toolId: "story", src: "/brand/tool-clips/tool-story.mp4", width: 1344, height: 768 },
  { categoryId: "draw", toolId: "canvas", src: "/brand/tool-clips/tool-canvas.mp4", width: 1344, height: 768 },
  { categoryId: "three-d", toolId: "bg3d", src: "/brand/tool-clips/tool-bg3d.mp4", width: 1344, height: 768 },
  { categoryId: "ai", toolId: "ailab", src: "/brand/tool-clips/tool-ailab.mp4", width: 1344, height: 768 },
  { categoryId: "production", toolId: "collab", src: "/brand/tool-clips/tool-collab.mp4", width: 1344, height: 768 },
  { categoryId: "learn", toolId: "learn", src: "/brand/tool-clips/tool-learn.mp4", width: 1344, height: 768 },
  { categoryId: "community", toolId: "community", src: "/brand/tool-clips/tool-community.mp4", width: 1344, height: 768 },
];

export function featureOverviewCategoryClip(categoryId: string): FeatureOverviewCategoryClip | undefined {
  return FEATURE_OVERVIEW_CATEGORY_CLIPS.find((clip) => clip.categoryId === categoryId);
}

/** 삽입 보류 중 — 자산만 반입한 스테이징 클립(파일 상단 주석 참고). */
export const TOOL_CLIPS_STAGED = [
  { toolId: "poser", src: "/brand/tool-clips/tool-poser.mp4", width: 1344, height: 768 },
] as const;

export interface ToolVerticalClip extends ToolClip {
  readonly toolId: ToolClipId;
}

/**
 * 도구 클립의 세로(9:16) 변형 — 가로본과 같은 주제를 세로로 다시 그린
 * 생성형 AI 영상이다. 표면에 배선하지 않고 소셜 카드 소재로 쓰기 위해
 * 홍보 영상 자료실에만 수록한다.
 */
export const TOOL_CLIPS_VERTICAL: readonly ToolVerticalClip[] = [
  { toolId: "canvas", src: "/brand/tool-clips/tool-canvas-vertical.mp4", width: 768, height: 1344 },
  { toolId: "bg3d", src: "/brand/tool-clips/tool-bg3d-vertical.mp4", width: 768, height: 1344 },
  { toolId: "shaper", src: "/brand/tool-clips/tool-shaper-vertical.mp4", width: 768, height: 1344 },
  { toolId: "story", src: "/brand/tool-clips/tool-story-vertical.mp4", width: 768, height: 1344 },
  { toolId: "comic", src: "/brand/tool-clips/tool-comic-vertical.mp4", width: 768, height: 1344 },
  { toolId: "publish", src: "/brand/tool-clips/tool-publish-vertical.mp4", width: 768, height: 1344 },
  { toolId: "collab", src: "/brand/tool-clips/tool-collab-vertical.mp4", width: 768, height: 1344 },
];
