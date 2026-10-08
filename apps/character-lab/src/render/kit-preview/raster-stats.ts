/**
 * 렌더 결과 래스터 통계(순수). 셰이더가 준비되기 전에 그린 프레임은 완전 빈 이미지가 되므로(Babylon은 isReady=false 재질의
 * 메시를 그리지 않는다) 뷰어는 `coverage`로 빈 프레임을 걸러 다시 그린다. straight-alpha RGBA(top-down, 8비트)를 받는다.
 */

export interface RasterStats {
  /** 캐릭터가 차지하는 픽셀 비율 0..1(투명 배경이면 알파 > 8, 단색 배경이면 배경과 다른 픽셀) */
  readonly coverage: number;
  /** 네 모서리의 알파(좌상·우상·좌하·우하) */
  readonly cornerAlphas: readonly [number, number, number, number];
}

const ALPHA_THRESHOLD = 8;
const COLOR_THRESHOLD = 10;

/** `background`가 null이면 투명 배경 기준. */
export function measureRaster(rgba: Uint8ClampedArray, width: number, height: number, background: readonly [number, number, number] | null): RasterStats {
  const total = width * height;
  let covered = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    if (background === null) {
      if ((rgba[offset + 3] ?? 0) > ALPHA_THRESHOLD) covered += 1;
    } else {
      const dr = Math.abs((rgba[offset] ?? 0) - background[0]);
      const dg = Math.abs((rgba[offset + 1] ?? 0) - background[1]);
      const db = Math.abs((rgba[offset + 2] ?? 0) - background[2]);
      if (Math.max(dr, dg, db) > COLOR_THRESHOLD) covered += 1;
    }
  }
  const alphaAt = (x: number, y: number): number => rgba[(y * width + x) * 4 + 3] ?? 0;
  return {
    coverage: total === 0 ? 0 : covered / total,
    cornerAlphas: [alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)],
  };
}

/** 빈 프레임으로 볼 하한(캐릭터가 화면의 0.1%도 못 채우면 빈 것으로 본다) */
export const EMPTY_FRAME_COVERAGE = 0.001;
