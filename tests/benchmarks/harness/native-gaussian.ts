/**
 * 벤치마크용 독립 Gaussian RGBA8 필터.
 * 표준 exp(-x²/(2σ²))를 반경 4σ에서 정규화하고 두 축으로 분리한다.
 * 경계는 clamp, 색 채널은 premultiplied alpha로 계산한다.
 * 외부 라이브러리의 코드·가중치·근사 커널은 사용하지 않는다.
 */
export function gaussianBlurRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  sigma: number,
): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Gaussian 입력의 폭·높이는 양의 정수여야 합니다.");
  }
  if (!Number.isSafeInteger(width * height * 4) || rgba.length !== width * height * 4) {
    throw new RangeError("Gaussian 입력은 폭×높이×4 길이의 RGBA8 버퍼여야 합니다.");
  }
  if (!Number.isFinite(sigma) || sigma < 0 || sigma > 64) {
    throw new RangeError("Gaussian sigma는 0 이상 64 이하의 유한값이어야 합니다.");
  }
  if (sigma === 0) return rgba.slice();

  const radius = Math.ceil(4 * sigma);
  const kernel = new Float64Array(radius * 2 + 1);
  let total = 0;
  for (let delta = -radius; delta <= radius; delta += 1) {
    const weight = Math.exp(-0.5 * (delta / sigma) ** 2);
    kernel[delta + radius] = weight;
    total += weight;
  }
  for (let index = 0; index < kernel.length; index += 1) kernel[index] /= total;

  const horizontal = new Float64Array(rgba.length);
  const output = new Uint8Array(rgba.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      for (let delta = -radius; delta <= radius; delta += 1) {
        const source = (y * width + Math.min(width - 1, Math.max(0, x + delta))) * 4;
        const weight = kernel[delta + radius];
        const weightedAlpha = rgba[source + 3] * weight;
        horizontal[target] += rgba[source] * weightedAlpha;
        horizontal[target + 1] += rgba[source + 1] * weightedAlpha;
        horizontal[target + 2] += rgba[source + 2] * weightedAlpha;
        horizontal[target + 3] += weightedAlpha;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let delta = -radius; delta <= radius; delta += 1) {
        const source = (Math.min(height - 1, Math.max(0, y + delta)) * width + x) * 4;
        const weight = kernel[delta + radius];
        red += horizontal[source] * weight;
        green += horizontal[source + 1] * weight;
        blue += horizontal[source + 2] * weight;
        alpha += horizontal[source + 3] * weight;
      }
      const target = (y * width + x) * 4;
      output[target + 3] = Math.round(alpha);
      if (output[target + 3] > 0) {
        output[target] = Math.round(red / alpha);
        output[target + 1] = Math.round(green / alpha);
        output[target + 2] = Math.round(blue / alpha);
      }
    }
  }
  return output;
}
