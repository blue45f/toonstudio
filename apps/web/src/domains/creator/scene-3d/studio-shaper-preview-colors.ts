import type { ShaperAppearanceCategory } from "./studio-shaper-model";

/** 아이템 기본 색상 (사용자가 색상을 고르기 전 미리보기에 사용). */
export const DEFAULT_ITEM_COLORS: Record<ShaperAppearanceCategory, string> = {
  hair: "#5b4636",
  accessories: "#1f2937",
  top: "#4f6fb3",
  bottom: "#374151",
  shoes: "#7c2d12",
};

// 의상 견본의 안감·스티치와 표정 도안은 편집기 테마가 바뀌어도 같은 색으로 표시한다.
export const PREVIEW_PIGMENT = {
  shadow: "oklch(0 0 0)",
  highlight: "oklch(1 0 0)",
  tie: "oklch(0.50542 0.19049 27.518)",
  skin: "oklch(0.89720 0.05371 67.051)",
  contour: "oklch(0.51306 0.07769 53.030)",
  ink: "oklch(0.30199 0.03080 51.662)",
  mouth: "oklch(0.40839 0.11647 38.172)",
} as const;
