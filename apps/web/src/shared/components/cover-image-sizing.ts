/**
 * 표지 <img>의 sizes·그리드 priority 판정 — cover-image.tsx(컴포넌트 파일)에서 분리한 순수 모듈.
 *
 * 컴포넌트 파일은 컴포넌트만 내보내야 Fast Refresh가 동작한다(react-refresh/only-export-components).
 * 상수·순수 함수는 이 파일이 정본이며, 표지를 그리는 쪽(CoverImage·TitlePoster)과 그리드 호출부
 * (TitleCard·CoverCard)가 여기서 직접 가져간다.
 */

// 표지 그리드 표준(§5.2 (5): 2열 →(640) 3열 →(1024) 4열 →(1280) 5열, 컨테이너
// standard 82.5rem)에서 도출한 sizes — 그리드 표지는 호출자가 손으로 적지 않고
// 부품이 자동 부여한다(S3-16). 1280px 이상은 컨테이너 상한 기준 (82.5rem-간격)/5 ≈ 16rem.
export const COVER_GRID_SIZES =
  "(max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 16rem";

// 대형(hero) 포스터의 sizes — 상세·스포트라이트처럼 그리드가 아닌 단독 대형 표지용.
export const COVER_HERO_SIZES = "(max-width: 639px) 50vw, 20rem";

// 표지 그리드의 첫 행 개수 — 가장 넓은 구간(5열)의 첫 행. 첫 행 priority 판정은
// 개별 카드 호출자가 아니라 그리드(목록을 렌더링하는 쪽)가 index로 도출한다(S3-16).
export const COVER_GRID_FIRST_ROW_COUNT = 5;

// 그리드 index(0-base)가 첫 행인지 — 첫 행 표지만 priority(eager·fetchPriority high).
export function coverGridPriority(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < COVER_GRID_FIRST_ROW_COUNT;
}

// sizes 자동 부여 — 명시 sizes가 없고 srcSet만 있으면 그리드 표준 sizes를 붙인다.
// (srcSet이 있을 때만 sizes가 의미를 가지므로, srcSet이 없으면 undefined를 유지한다.
//  포스터 계열은 TitlePoster가 size 기준으로 기본 sizes를 먼저 채워 넣는다.)
export function resolveCoverSizes(sizes: string | undefined, srcSet: string | undefined): string | undefined {
  return sizes ?? (srcSet ? COVER_GRID_SIZES : undefined);
}
