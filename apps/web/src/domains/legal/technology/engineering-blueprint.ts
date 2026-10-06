/**
 * 블루프린트 격자 패턴. 기술 문서 도서관의 머리말과 챕터 카드 커버가 같은 결을 쓴다.
 * 시안의 블루프린트풍 다이어그램 커버를 전용 아트 없이 CSS 패턴으로 대체한 것이다.
 */
export const BLUEPRINT_GRID_STYLE = {
  backgroundImage:
    "linear-gradient(to right, color-mix(in oklab, var(--color-accent) 12%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-accent) 12%, transparent) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
} as const;
