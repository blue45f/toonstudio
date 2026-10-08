/**
 * 타일 아틀라스의 칸 가장자리 오염 측정.
 *
 * 손실 인코딩(WebP·JPEG)은 색차를 2×2로 줄이고 16px 블록 경계를 부드럽게 펴므로, 서로 다른 재질이 맞닿은 칸 경계에서 한쪽 칸의
 * 가장자리 줄이 이웃 칸의 색을 끌어온다(돌길 칸의 마지막 행이 이웃 모래 칸 쪽으로 R+10 G-2.5 B-14만큼 황갈색으로 틀어졌고 품질
 * 90~100에서 같았다). 타일은 칸마다 이 가장자리 줄까지 화면에 그리므로 모든 타일 경계에 옅은 실선이 생긴다.
 *
 * 이 함수는 칸마다 첫·마지막 행·열의 평균 부호 오차(복원 − 원본)에서 안쪽 줄의 평균 부호 오차를 뺀 값의 채널별 절댓값 최댓값을
 * 돌려준다. 인코딩 잡음은 안쪽과 가장자리에 고르게 퍼져 서로 상쇄되고, 이웃 색을 끌어온 편향만 남는다.
 */

/** 가장자리에서 5~9줄 떨어진 안쪽 줄(블록 경계 필터와 색차 번짐이 닿지 않는다). */
const INNER_DEPTHS = [4, 5, 6, 7, 8];

/**
 * @param {Uint8Array} truth 원본(행 우선, 채널 인터리브)
 * @param {Uint8Array} decoded 복원한 픽셀(같은 배치)
 * @param {{ width: number, height: number, cell: number, channels: number }} layout 아틀라스 크기, 칸 크기(정사각), 채널 수
 * @returns {number} 0~255 스케일의 최대 가장자리 편향
 */
export function atlasEdgeBias(truth, decoded, { width, height, cell, channels }) {
  if (truth.length !== decoded.length || truth.length !== width * height * channels) throw new Error("원본과 복원 이미지의 크기가 다릅니다.");
  /** 칸 안의 한 줄(가로면 행 offset, 세로면 열 offset)의 채널 평균 부호 오차. */
  const lineBias = (cx, cy, channel, offset, horizontal) => {
    let sum = 0;
    for (let k = 0; k < cell; k += 1) {
      const p = ((horizontal ? cy + offset : cy + k) * width + (horizontal ? cx + k : cx + offset)) * channels + channel;
      sum += decoded[p] - truth[p];
    }
    return sum / cell;
  };
  let worst = 0;
  for (let cy = 0; cy + cell <= height; cy += cell) {
    for (let cx = 0; cx + cell <= width; cx += cell) {
      for (let channel = 0; channel < channels; channel += 1) {
        for (const horizontal of [true, false]) {
          const inner = INNER_DEPTHS.reduce((total, depth) => total + lineBias(cx, cy, channel, depth, horizontal), 0) / INNER_DEPTHS.length;
          for (const offset of [0, cell - 1]) worst = Math.max(worst, Math.abs(lineBias(cx, cy, channel, offset, horizontal) - inner));
        }
      }
    }
  }
  return worst;
}
