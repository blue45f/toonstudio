/**
 * LT "내부선 억제"의 윤곽 근접도 계산.
 *
 * 정의(자세한 설명과 한계는 docs/features/bg3d-lineart-quality.md):
 * - 윤곽선 = 알파 윤곽(투명 배경과 맞닿은 경계)과 깊이 윤곽(앞 물체가 뒤 면을 가리는 경계)이다.
 * - 내부선 = 그 밖의 선, 곧 명암·재질 경계, 법선(모서리) 선, 깊이 굴곡, 재질선 레이어다.
 * - 억제 강도 s(0..1)는 내부선의 농도에 `1 - s × (1 - 근접도)` 를 곱한다. 근접도는 그 픽셀이 윤곽선에서 얼마나
 *   가까운지(0..1)다. 윤곽선 자체는 그대로이고, 윤곽에 붙어 있는 내부선(접촉선 후보)은 거리에 따라 덜 줄며,
 *   윤곽에서 `BAND_PX` 이상 떨어진 내부선은 `1 - s` 배가 된다.
 * - 근접도는 윤곽 근거를 `BAND_PX` 픽셀 안쪽으로 번지게 한 것이다. 번짐 가중치는 가로·세로 각각 거리 k 에서
 *   `1 - k / (BAND_PX + 1)` 이고 둘의 곱을 쓴다(0.75 → 0.5 → 0.25 의 대각 감쇠). 정수 연산(0..256 가중치)이라
 *   플랫폼과 무관하게 같은 바이트가 나온다.
 *
 * 수용 영역은 `BAND_PX` 픽셀이다. 근접도는 윤곽 근거 계산(1픽셀)에 이어 번지는 것뿐이라 휘도 능선 계산(4픽셀)과
 * 병렬로 놓이고, 타일 헤일로(12픽셀) 안에서 전체 프레임 결과와 같다.
 */

/** 윤곽 근접 대역 반폭(px). 출력 해상도와 무관한 고정값이라 타일 경계에서도 같은 결과를 낸다. */
export const STUDIO_BG3D_LT_OUTLINE_BAND_PX = 3;

const WEIGHT_SCALE = 256;

/** k = 0..BAND_PX 의 가중치(256 기준). `256 × (1 - k / (BAND_PX + 1))`. */
const BAND_WEIGHTS: readonly number[] = Array.from(
  { length: STUDIO_BG3D_LT_OUTLINE_BAND_PX + 1 },
  (_, offset) => Math.round(WEIGHT_SCALE * (1 - offset / (STUDIO_BG3D_LT_OUTLINE_BAND_PX + 1)))
);

/**
 * 윤곽 근거(0..255)를 밴드 안으로 번지게 해 근접도(0..255)를 만든다. 입력은 바꾸지 않는다.
 * 윤곽 픽셀의 근접도는 근거 값 그대로이고, 번진 값은 겹치면 최대값을 쓴다.
 */
export function buildStudioBg3dLtOutlineProximity(
  evidence: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  if (evidence.length !== width * height) {
    throw new RangeError("LT outline evidence length must equal width * height.");
  }
  const band = STUDIO_BG3D_LT_OUTLINE_BAND_PX;
  const horizontal = new Uint8ClampedArray(evidence.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const value = evidence[row + x]!;
      if (value === 0) continue;
      const first = Math.max(0, x - band);
      const last = Math.min(width - 1, x + band);
      for (let target = first; target <= last; target += 1) {
        const candidate = (value * BAND_WEIGHTS[Math.abs(target - x)]! + WEIGHT_SCALE / 2) >> 8;
        if (candidate > horizontal[row + target]!) horizontal[row + target] = candidate;
      }
    }
  }
  const proximity = new Uint8ClampedArray(evidence.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const value = horizontal[row + x]!;
      if (value === 0) continue;
      const first = Math.max(0, y - band);
      const last = Math.min(height - 1, y + band);
      for (let target = first; target <= last; target += 1) {
        const index = target * width + x;
        const candidate = (value * BAND_WEIGHTS[Math.abs(target - y)]! + WEIGHT_SCALE / 2) >> 8;
        if (candidate > proximity[index]!) proximity[index] = candidate;
      }
    }
  }
  return proximity;
}

/**
 * 내부선에 곱할 배율(0..1). `proximity` 는 0..255, `strength` 는 0..1.
 * 근접도 255(윤곽 위)이면 1, 근접도 0(윤곽에서 멀다)이면 `1 - strength`.
 */
export function studioBg3dLtInteriorLineFactor(proximity: number, strength: number): number {
  return 1 - strength * (1 - proximity / 255);
}
