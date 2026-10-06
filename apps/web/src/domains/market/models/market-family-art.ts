import type { MarketResourceFamilyId } from "./market-resource-taxonomy";

export interface MarketFamilyArt {
  readonly image: string;
  readonly position: string;
  /** 아트 위에 겹치는 한 줄 해설 — 탐색 예시 캡션이나 타일 보조 문구로 쓴다. */
  readonly label: readonly [string, string];
}

/**
 * 작업군별 대표 아트 — 기존 브랜드 아트(atelier 시리즈·CC0 배경·3D 환경 썸네일) 재사용.
 * 마켓 홈 카테고리 타일과 작업군 탐색기가 같은 아트를 공유한다.
 */
export const MARKET_FAMILY_ART = {
  template: { image: "/brand/atelier-process.webp", position: "12% 45%", label: ["컷의 시작 · 구도와 이야기", "Where a panel starts · composition and story"] },
  "2d": { image: "/assets/studio/cc0-20260906/assets/polyhaven-background-wooden-lounge/background.webp", position: "50% 50%", label: ["장면의 재료 · 배경과 소품", "Scene materials · backgrounds and props"] },
  "3d": { image: "/assets/3d/environments/refined-v6/thumbnails/classroom_art_studio.png", position: "50% 55%", label: ["공간의 기준 · 구도와 투시", "Space as reference · composition and perspective"] },
  brush: { image: "/brand/atelier-materials.webp", position: "5% 40%", label: ["선의 표정 · 필치와 질감", "Expressive lines · strokes and texture"] },
  look: { image: "/brand/atelier-world.webp", position: "20% 20%", label: ["장면의 온도 · 색과 빛", "Scene temperature · color and light"] },
} as const satisfies Record<MarketResourceFamilyId, MarketFamilyArt>;
