/**
 * Konva의 Blur/Brighten/Contrast/HSL/Pixelate 내장 필터를 attrs-기반으로 포팅한 순수 버전.
 * 알고리즘은 konva/lib/filters/*.js를 그대로 옮긴 것(verbatim) — 결과가 달라지면 안 되므로
 * studio-konva-native-filters.test.ts가 실제 Konva 함수와 픽셀 단위로 동일한지 검증한다.
 * 기준 버전은 konva 10.9 이다(HSL 계수·색상 래핑, Pixelate·Blur 의 알파 가중 평균과 pixelRatio 인자가
 * 10.3 과 달라졌다). Konva 를 올리면 이 시험이 먼저 깨지므로 그때 같은 방식으로 다시 옮긴다.
 *
 * 왜 필요한가: 실제 Konva 필터는 `this.blurRadius()`처럼 Konva.Node에 Factory로 부착된
 * getter 메서드를 읽는다 — Worker(DOM 없음)에서는 이 메서드가 존재하는 진짜 Konva 노드를
 * 만들 수 없다. 이 파일의 버전은 `this.attrs.blurRadius`처럼 값을 직접 읽어 Konva 노드든
 * 순수 { attrs } 객체든 동일하게 동작하고, konva 패키지를 전혀 import하지 않아 Worker
 * 모듈 그래프에 안전하게 들어간다.
 */
import type { StudioImageDataLike } from "../studio-filters";

type NativeFilterThis = { attrs?: Record<string, unknown> };

function attrNumber(attrs: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = attrs?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// konva/lib/filters/Brighten.js verbatim (attrs 기반).
export function nativeBrighten(this: NativeFilterThis, imageData: StudioImageDataLike): void {
  const brightness = attrNumber(this.attrs, "brightness", 0) * 255;
  const data = imageData.data;
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    data[i] += brightness;
    data[i + 1] += brightness;
    data[i + 2] += brightness;
  }
}

// konva/lib/filters/Contrast.js verbatim (attrs 기반).
export function nativeContrast(this: NativeFilterThis, imageData: StudioImageDataLike): void {
  const adjust = Math.pow((attrNumber(this.attrs, "contrast", 0) + 100) / 100, 2);
  const data = imageData.data;
  const nPixels = data.length;
  let red: number;
  let green: number;
  let blue: number;
  for (let i = 0; i < nPixels; i += 4) {
    red = data[i];
    green = data[i + 1];
    blue = data[i + 2];
    red /= 255;
    red -= 0.5;
    red *= adjust;
    red += 0.5;
    red *= 255;
    green /= 255;
    green -= 0.5;
    green *= adjust;
    green += 0.5;
    green *= 255;
    blue /= 255;
    blue -= 0.5;
    blue *= adjust;
    blue += 0.5;
    blue *= 255;
    red = red < 0 ? 0 : red > 255 ? 255 : red;
    green = green < 0 ? 0 : green > 255 ? 255 : green;
    blue = blue < 0 ? 0 : blue > 255 ? 255 : blue;
    data[i] = red;
    data[i + 1] = green;
    data[i + 2] = blue;
  }
}

// konva/lib/filters/HSL.js verbatim (attrs 기반).
export function nativeHSL(this: NativeFilterThis, imageData: StudioImageDataLike): void {
  const data = imageData.data;
  const nPixels = data.length;
  const v = 1;
  const s = Math.pow(2, attrNumber(this.attrs, "saturation", 0));
  const h = (((attrNumber(this.attrs, "hue", 0) % 360) + 360) % 360);
  const l = attrNumber(this.attrs, "luminance", 0) * 127;
  const vsu = v * s * Math.cos((h * Math.PI) / 180);
  const vsw = v * s * Math.sin((h * Math.PI) / 180);
  const rr = 0.299 * v + 0.701 * vsu + 0.168 * vsw;
  const rg = 0.587 * v - 0.587 * vsu + 0.33 * vsw;
  const rb = 0.114 * v - 0.114 * vsu - 0.497 * vsw;
  const gr = 0.299 * v - 0.299 * vsu - 0.328 * vsw;
  const gg = 0.587 * v + 0.413 * vsu + 0.035 * vsw;
  const gb = 0.114 * v - 0.114 * vsu + 0.292 * vsw;
  const br = 0.299 * v - 0.3 * vsu + 1.25 * vsw;
  const bg = 0.587 * v - 0.588 * vsu - 1.05 * vsw;
  const bb = 0.114 * v + 0.886 * vsu - 0.203 * vsw;
  let r: number, g: number, b: number, a: number;
  for (let i = 0; i < nPixels; i += 4) {
    r = data[i + 0];
    g = data[i + 1];
    b = data[i + 2];
    a = data[i + 3];
    data[i + 0] = rr * r + rg * g + rb * b + l;
    data[i + 1] = gr * r + gg * g + gb * b + l;
    data[i + 2] = br * r + bg * g + bb * b + l;
    data[i + 3] = a;
  }
}

// konva/lib/filters/Pixelate.js verbatim (attrs 기반, Util.error 대신 무시하고 return).
// 10.9: 알파로 가중한 평균(투명 픽셀이 블록을 어둡게 하지 않는다)과 pixelRatio 인자.
export function nativePixelate(this: NativeFilterThis, imageData: StudioImageDataLike, pixelRatio = 1): void {
  const pixelSize = Math.ceil(attrNumber(this.attrs, "pixelSize", 8) * pixelRatio);
  const width = imageData.width;
  const height = imageData.height;
  const nBinsX = Math.ceil(width / pixelSize);
  const nBinsY = Math.ceil(height / pixelSize);
  const data = imageData.data;
  if (pixelSize <= 0) return;

  for (let xBin = 0; xBin < nBinsX; xBin += 1) {
    for (let yBin = 0; yBin < nBinsY; yBin += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      const xBinStart = xBin * pixelSize;
      const xBinEnd = Math.min(xBinStart + pixelSize, width);
      const yBinStart = yBin * pixelSize;
      const yBinEnd = Math.min(yBinStart + pixelSize, height);
      for (let x = xBinStart; x < xBinEnd; x += 1) {
        for (let y = yBinStart; y < yBinEnd; y += 1) {
          const i = (width * y + x) * 4;
          const a = data[i + 3];
          red += data[i + 0] * a;
          green += data[i + 1] * a;
          blue += data[i + 2] * a;
          alpha += a;
        }
      }
      if (alpha) {
        red = red / alpha;
        green = green / alpha;
        blue = blue / alpha;
      }
      alpha = alpha / ((xBinEnd - xBinStart) * (yBinEnd - yBinStart));
      for (let x = xBinStart; x < xBinEnd; x += 1) {
        for (let y = yBinStart; y < yBinEnd; y += 1) {
          const i = (width * y + x) * 4;
          data[i + 0] = red;
          data[i + 1] = green;
          data[i + 2] = blue;
          data[i + 3] = alpha;
        }
      }
    }
  }
}

// --- konva/lib/filters/Blur.js verbatim (stack blur, attrs 기반) ---

class NativeBlurStack {
  r = 0;
  g = 0;
  b = 0;
  a = 0;
  next: NativeBlurStack | null = null;
}

const MUL_TABLE = [
  512, 512, 456, 512, 328, 456, 335, 512, 405, 328, 271, 456, 388, 335, 292,
  512, 454, 405, 364, 328, 298, 271, 496, 456, 420, 388, 360, 335, 312, 292,
  273, 512, 482, 454, 428, 405, 383, 364, 345, 328, 312, 298, 284, 271, 259,
  496, 475, 456, 437, 420, 404, 388, 374, 360, 347, 335, 323, 312, 302, 292,
  282, 273, 265, 512, 497, 482, 468, 454, 441, 428, 417, 405, 394, 383, 373,
  364, 354, 345, 337, 328, 320, 312, 305, 298, 291, 284, 278, 271, 265, 259,
  507, 496, 485, 475, 465, 456, 446, 437, 428, 420, 412, 404, 396, 388, 381,
  374, 367, 360, 354, 347, 341, 335, 329, 323, 318, 312, 307, 302, 297, 292,
  287, 282, 278, 273, 269, 265, 261, 512, 505, 497, 489, 482, 475, 468, 461,
  454, 447, 441, 435, 428, 422, 417, 411, 405, 399, 394, 389, 383, 378, 373,
  368, 364, 359, 354, 350, 345, 341, 337, 332, 328, 324, 320, 316, 312, 309,
  305, 301, 298, 294, 291, 287, 284, 281, 278, 274, 271, 268, 265, 262, 259,
  257, 507, 501, 496, 491, 485, 480, 475, 470, 465, 460, 456, 451, 446, 442,
  437, 433, 428, 424, 420, 416, 412, 408, 404, 400, 396, 392, 388, 385, 381,
  377, 374, 370, 367, 363, 360, 357, 354, 350, 347, 344, 341, 338, 335, 332,
  329, 326, 323, 320, 318, 315, 312, 310, 307, 304, 302, 299, 297, 294, 292,
  289, 287, 285, 282, 280, 278, 275, 273, 271, 269, 267, 265, 263, 261, 259,
];
const SHG_TABLE = [
  9, 11, 12, 13, 13, 14, 14, 15, 15, 15, 15, 16, 16, 16, 16, 17, 17, 17, 17, 17,
  17, 17, 18, 18, 18, 18, 18, 18, 18, 18, 18, 19, 19, 19, 19, 19, 19, 19, 19,
  19, 19, 19, 19, 19, 19, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20,
  20, 20, 20, 20, 20, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21,
  21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 22, 22, 22, 22, 22, 22,
  22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22,
  22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 23, 23, 23, 23, 23, 23, 23,
  23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
  23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
  23, 23, 23, 23, 23, 23, 23, 23, 23, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  24, 24, 24, 24, 24, 24, 24,
];

// 가로 패스는 알파로 곱한 색을 흐려야 투명 픽셀의 색이 이웃으로 번지지 않는다. 세로 패스가 다시 알파로 나눈다.
function nativePremultiply(channel: number, alpha: number): number {
  return alpha === 255 ? channel : (channel * alpha) / 255;
}

// 논리 반경의 최대값. 고해상도 캐시는 더 큰 커널이 필요하다.
const NATIVE_BLUR_MAX_RADIUS = 180;

function nativeFilterGaussBlurRGBA(imageData: StudioImageDataLike, radius: number): void {
  const pixels = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  let p: number, yi: number, yw: number;
  let r_sum: number, g_sum: number, b_sum: number, a_sum: number;
  let r_out_sum: number, g_out_sum: number, b_out_sum: number, a_out_sum: number;
  let r_in_sum: number, g_in_sum: number, b_in_sum: number, a_in_sum: number;
  let pr: number, pg: number, pb: number, pa: number, rbs: number;

  const div = radius + radius + 1;
  const widthMinus1 = width - 1;
  const heightMinus1 = height - 1;
  const radiusPlus1 = radius + 1;
  const sumFactor = (radiusPlus1 * (radiusPlus1 + 1)) / 2;
  const stackStart = new NativeBlurStack();
  // 높은 해상도에서 32비트 정수가 넘치지 않도록 부동소수점으로 정규화한다.
  const normalization = radius <= NATIVE_BLUR_MAX_RADIUS
    ? MUL_TABLE[radius] / 2 ** SHG_TABLE[radius]
    : 1 / (radiusPlus1 * radiusPlus1);

  let stackEnd: NativeBlurStack | null = null;
  let stack: NativeBlurStack = stackStart;
  let stackIn: NativeBlurStack | null;
  let stackOut: NativeBlurStack | null;

  for (let i = 1; i < div; i++) {
    stack = stack.next = new NativeBlurStack();
    if (i === radiusPlus1) stackEnd = stack;
  }
  stack.next = stackStart;

  yw = yi = 0;
  for (let y = 0; y < height; y++) {
    r_in_sum = g_in_sum = b_in_sum = a_in_sum = r_sum = g_sum = b_sum = a_sum = 0;
    pa = pixels[yi + 3];
    pr = nativePremultiply(pixels[yi], pa);
    pg = nativePremultiply(pixels[yi + 1], pa);
    pb = nativePremultiply(pixels[yi + 2], pa);
    r_out_sum = radiusPlus1 * pr;
    g_out_sum = radiusPlus1 * pg;
    b_out_sum = radiusPlus1 * pb;
    a_out_sum = radiusPlus1 * pa;
    r_sum += sumFactor * pr;
    g_sum += sumFactor * pg;
    b_sum += sumFactor * pb;
    a_sum += sumFactor * pa;
    stack = stackStart;
    for (let i = 0; i < radiusPlus1; i++) {
      stack.r = pr;
      stack.g = pg;
      stack.b = pb;
      stack.a = pa;
      stack = stack.next!;
    }
    for (let i = 1; i < radiusPlus1; i++) {
      p = yi + ((widthMinus1 < i ? widthMinus1 : i) << 2);
      pa = pixels[p + 3];
      r_sum += (stack.r = pr = nativePremultiply(pixels[p], pa)) * (rbs = radiusPlus1 - i);
      g_sum += (stack.g = pg = nativePremultiply(pixels[p + 1], pa)) * rbs;
      b_sum += (stack.b = pb = nativePremultiply(pixels[p + 2], pa)) * rbs;
      a_sum += (stack.a = pa) * rbs;
      r_in_sum += pr;
      g_in_sum += pg;
      b_in_sum += pb;
      a_in_sum += pa;
      stack = stack.next!;
    }
    stackIn = stackStart;
    stackOut = stackEnd;
    for (let x = 0; x < width; x++) {
      pixels[yi] = Math.floor(r_sum * normalization);
      pixels[yi + 1] = Math.floor(g_sum * normalization);
      pixels[yi + 2] = Math.floor(b_sum * normalization);
      pixels[yi + 3] = Math.floor(a_sum * normalization);
      r_sum -= r_out_sum;
      g_sum -= g_out_sum;
      b_sum -= b_out_sum;
      a_sum -= a_out_sum;
      r_out_sum -= stackIn!.r;
      g_out_sum -= stackIn!.g;
      b_out_sum -= stackIn!.b;
      a_out_sum -= stackIn!.a;
      p = (yw + ((p = x + radius + 1) < widthMinus1 ? p : widthMinus1)) << 2;
      pa = pixels[p + 3];
      r_in_sum += stackIn!.r = nativePremultiply(pixels[p], pa);
      g_in_sum += stackIn!.g = nativePremultiply(pixels[p + 1], pa);
      b_in_sum += stackIn!.b = nativePremultiply(pixels[p + 2], pa);
      a_in_sum += stackIn!.a = pa;
      r_sum += r_in_sum;
      g_sum += g_in_sum;
      b_sum += b_in_sum;
      a_sum += a_in_sum;
      stackIn = stackIn!.next;
      r_out_sum += pr = stackOut!.r;
      g_out_sum += pg = stackOut!.g;
      b_out_sum += pb = stackOut!.b;
      a_out_sum += pa = stackOut!.a;
      r_in_sum -= pr;
      g_in_sum -= pg;
      b_in_sum -= pb;
      a_in_sum -= pa;
      stackOut = stackOut!.next;
      yi += 4;
    }
    yw += width;
  }

  for (let x = 0; x < width; x++) {
    g_in_sum = b_in_sum = a_in_sum = r_in_sum = g_sum = b_sum = a_sum = r_sum = 0;
    yi = x << 2;
    r_out_sum = radiusPlus1 * (pr = pixels[yi]);
    g_out_sum = radiusPlus1 * (pg = pixels[yi + 1]);
    b_out_sum = radiusPlus1 * (pb = pixels[yi + 2]);
    a_out_sum = radiusPlus1 * (pa = pixels[yi + 3]);
    r_sum += sumFactor * pr;
    g_sum += sumFactor * pg;
    b_sum += sumFactor * pb;
    a_sum += sumFactor * pa;
    stack = stackStart;
    for (let i = 0; i < radiusPlus1; i++) {
      stack.r = pr;
      stack.g = pg;
      stack.b = pb;
      stack.a = pa;
      stack = stack.next!;
    }
    // 이 패스는 둘째 행에서 시작하는데, 높이가 1픽셀인 이미지에는 둘째 행이 없다.
    let yp = Math.min(1, heightMinus1) * width;
    for (let i = 1; i <= radius; i++) {
      yi = (yp + x) << 2;
      r_sum += (stack.r = pr = pixels[yi]) * (rbs = radiusPlus1 - i);
      g_sum += (stack.g = pg = pixels[yi + 1]) * rbs;
      b_sum += (stack.b = pb = pixels[yi + 2]) * rbs;
      a_sum += (stack.a = pa = pixels[yi + 3]) * rbs;
      r_in_sum += pr;
      g_in_sum += pg;
      b_in_sum += pb;
      a_in_sum += pa;
      stack = stack.next!;
      if (i < heightMinus1) yp += width;
    }
    yi = x;
    stackIn = stackStart;
    stackOut = stackEnd;
    for (let y = 0; y < height; y++) {
      p = yi << 2;
      pixels[p + 3] = pa = Math.floor(a_sum * normalization);
      if (pa > 0) {
        pa = 255 / pa;
        pixels[p] = Math.floor(r_sum * normalization) * pa;
        pixels[p + 1] = Math.floor(g_sum * normalization) * pa;
        pixels[p + 2] = Math.floor(b_sum * normalization) * pa;
      } else {
        pixels[p] = pixels[p + 1] = pixels[p + 2] = 0;
      }
      r_sum -= r_out_sum;
      g_sum -= g_out_sum;
      b_sum -= b_out_sum;
      a_sum -= a_out_sum;
      r_out_sum -= stackIn!.r;
      g_out_sum -= stackIn!.g;
      b_out_sum -= stackIn!.b;
      a_out_sum -= stackIn!.a;
      p = (x + ((p = y + radiusPlus1) < heightMinus1 ? p : heightMinus1) * width) << 2;
      r_sum += r_in_sum += stackIn!.r = pixels[p];
      g_sum += g_in_sum += stackIn!.g = pixels[p + 1];
      b_sum += b_in_sum += stackIn!.b = pixels[p + 2];
      a_sum += a_in_sum += stackIn!.a = pixels[p + 3];
      stackIn = stackIn!.next;
      r_out_sum += pr = stackOut!.r;
      g_out_sum += pg = stackOut!.g;
      b_out_sum += pb = stackOut!.b;
      a_out_sum += pa = stackOut!.a;
      r_in_sum -= pr;
      g_in_sum -= pg;
      b_in_sum -= pb;
      a_in_sum -= pa;
      stackOut = stackOut!.next;
      yi += width;
    }
  }
}

// konva/lib/filters/Blur.js verbatim (attrs 기반). 10.9: 논리 반경은 180 까지이고 pixelRatio 만큼 커널을 키운다.
export function nativeBlur(this: NativeFilterThis, imageData: StudioImageDataLike, pixelRatio = 1): void {
  // 손상된 저장본의 Infinity/거대값(attrNumber 가 유한하지 않은 값은 걸러낸다)이나 비정상 pixelRatio 가
  // 거대한 커널을 만들지 않게, 곱한 반경을 정수 테이블 한계의 두 배(360)로 제한한다.
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const radius = Math.min(
    NATIVE_BLUR_MAX_RADIUS * 2,
    Math.round(Math.min(attrNumber(this.attrs, "blurRadius", 0), NATIVE_BLUR_MAX_RADIUS) * ratio),
  );
  if (radius > 0) nativeFilterGaussBlurRGBA(imageData, radius);
}
