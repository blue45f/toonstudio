/**
 * 도구별 분위기 클립 12편 — 각 도구의 소개·진입 표면에 까는 배경 영상.
 * 전부 생성형 AI로 만든 배경 영상이라 실제 제품 화면 캡처가 아니다.
 * 배선한 표면에서는 그 성격을 배지로 밝힌다(다른 장식 영상 표면과 같은 계약).
 * 이 파일이 12편 인벤토리의 정본이다.
 *
 * 배선 1편:
 * - production(제작 허브 랜딩 /production의 도입 히어로): 그라데이션 밴드와
 *   블러 장식만 있던 히어로라, 기능 요약 페이지 CTA 배경(브랜드 클립 파도)과
 *   같은 문법으로 배경에 깔았다. 소비 모듈은 도메인 경계 안쪽인
 *   domains/creator/production-hub/ProductionLandingBackdrop.tsx다.
 *
 * 자산만 반입하고 삽입을 보류한 11편 — 도구 목적지가 소개 랜딩이 아니라
 * 작업 화면으로 바로 이어지거나, 이미 전용 아트로 한 구성을 이룬 표면이라
 * 영상 배경을 얹을 자리가 없다:
 * - canvas·comic·bg3d·publish: /studio/* 경로가 StudioRouter 에디터로
 *   직행한다. 에디터 UI에 장식 영상을 끼우는 것은 이 변경의 경계 밖이다.
 * - poser: /studio/poser 독립 도구(데생 인형·매직 포저) 화면으로 직행한다.
 *   같은 사유로 보류한다.
 * - shaper: /shaper가 캐릭터 만들기(생성·편집 폼)로 직행한다. 같은 사유.
 * - ailab: /studio/ai-lab가 PersonalInferencePage(외부 AI Runtime 개발자
 *   프리뷰 도구 화면)로 직행한다. 같은 사유.
 * - story: /story-lab은 대체 텍스트를 가진 마스트헤드 아트(콘텐츠 이미지)를
 *   단 기획 워크시트다. 작업 폼 표면이고 마스트헤드는 장식 배경이 아니라
 *   내용 이미지라 영상으로 대체하지 않는다.
 * - learn: /learn 홈 히어로가 콘셉트 아트 피겨와 캡션으로 이뤄진 분할
 *   히어로라 전용 아트 구성과 겹친다(랜딩 히어로 클립 보류 선례와 같은 판단).
 * - collab: /collaborate 헤더가 워크플로 일러스트를 전폭 배경으로 깐 전용
 *   무대라 같은 사유로 보류한다.
 * - community: /community가 공용 SitePageHeader의 배너 아트(워크플로
 *   일러스트와 캡션)를 쓰는 표면이라, 공용 컴포넌트 변경은 이 변경의
 *   범위를 넘고 전용 아트와도 겹친다.
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

/** 삽입 보류 중 — 자산만 반입한 스테이징 클립(파일 상단 주석 참고). */
export const TOOL_CLIPS_STAGED = [
  { toolId: "canvas", src: "/brand/tool-clips/tool-canvas.mp4", width: 1344, height: 768 },
  { toolId: "story", src: "/brand/tool-clips/tool-story.mp4", width: 1344, height: 768 },
  { toolId: "comic", src: "/brand/tool-clips/tool-comic.mp4", width: 1344, height: 768 },
  { toolId: "bg3d", src: "/brand/tool-clips/tool-bg3d.mp4", width: 1344, height: 768 },
  { toolId: "poser", src: "/brand/tool-clips/tool-poser.mp4", width: 1344, height: 768 },
  { toolId: "shaper", src: "/brand/tool-clips/tool-shaper.mp4", width: 1344, height: 768 },
  { toolId: "ailab", src: "/brand/tool-clips/tool-ailab.mp4", width: 1344, height: 768 },
  { toolId: "publish", src: "/brand/tool-clips/tool-publish.mp4", width: 1344, height: 768 },
  { toolId: "learn", src: "/brand/tool-clips/tool-learn.mp4", width: 1344, height: 768 },
  { toolId: "collab", src: "/brand/tool-clips/tool-collab.mp4", width: 1344, height: 768 },
  { toolId: "community", src: "/brand/tool-clips/tool-community.mp4", width: 1344, height: 768 },
] as const;
