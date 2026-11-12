/**
 * 일반 셸 탐색의 명시된 예외: 1180px 전에는 모바일·태블릿 하단 탐색을 사용한다.
 * 구현 계획 reconstruction-20261112 §2의 기존 경계를 보존하며, 주 메뉴·전체 메뉴·
 * 지연 로드 자리·본문 안전 여백이 같은 순간에 전환한다. Workspace의 768px 경계는 별개다.
 * CSS 미디어와 Tailwind 정적 클래스는 layout-token-contract의 교차 검사로 이 값과 맞춘다.
 */
export const LAYOUT_SITE_NAVIGATION = {
  desktopMin: "1180px",
  mobileMax: "1179px",
  mobileQuery: "(max-width: 1179px)",
} as const;
