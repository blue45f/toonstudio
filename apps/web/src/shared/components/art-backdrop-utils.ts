/**
 * ArtBackdrop 의 배경 그라디언트 계산 — art-backdrop.tsx(컴포넌트 파일)에서 분리한 순수 함수.
 * 컴포넌트 파일이 컴포넌트만 내보내야 Fast Refresh 가 동작한다(react-refresh/only-export-components).
 */

/** 사전 계산 틴트 쌍 → 배경 그라디언트. TitlePoster와 같은 혼합 비율(88%/82%)을 쓴다. */
export function artBackdropBackground(cover: readonly [string, string]): string {
  const [from, to] = cover;
  return `linear-gradient(150deg, color-mix(in oklch, ${from} 88%, oklch(0.24 0.012 66)), color-mix(in oklch, ${to} 82%, oklch(0.15 0.008 70)))`;
}
