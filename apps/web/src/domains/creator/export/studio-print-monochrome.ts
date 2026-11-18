/**
 * CSP 모노크롬 1비트·그레이스케일 망점 인쇄 래스터라이저 (layerpropusetone, exportprintsettings).
 *
 * 역공학 근거(REA evidence_id):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_4571415adae1548e2078cdaf17fdc17fc7b43d1c9bdbbb5a58461c885bbdd64d
 *
 * 클린룸 수학 구현 원칙:
 * - 알파 채널을 백지(255, 255, 255) 위에 합성한 뒤 BT.709 표준 휘도(Y = 0.2126R + 0.7152G + 0.0722B)로 변환한다.
 * - "monochrome-1bit" 모드에서는 진한 먹선(luma <= solidInkThreshold)을 망점 분해 없이 순흑(0)으로 보존해
 *   인쇄소 출력 시 펜선 가장자리가 톱니처럼 깨지는 현상을 방지한다.
 * - 중간 톤은 목표 LPI·DPI·회전각(angleDeg)의 AM 하프톤 셀(dot / line / cross) 스팟 함수로 이진화한다.
 */

export type PrintMonochromeMode = "grayscale" | "monochrome-1bit";

export type PrintHalftoneSpotShape = "dot" | "line" | "cross";

export interface PrintMonochromeRasterOptions {
  readonly mode: PrintMonochromeMode;
  /** 망점 선수 (Lines Per Inch, 10..200, 기본 60). */
  readonly lpi?: number;
  /** 출력 인쇄 해상도 (Dots Per Inch, 72..2400, 기본 600). */
  readonly dpi?: number;
  /** AM 하프톤 격자 회전각 (도, 기본 45°). */
  readonly angleDeg?: number;
  /** 망점 셀 형태 ("dot" 원형 | "line" 만선 | "cross" 십자교차). */
  readonly spotShape?: PrintHalftoneSpotShape;
  /** 순흑 먹선 보존 임계값(0..255, 기본 45). 이 값 이하 휘도는 망점화 없이 순흑 처리된다. */
  readonly solidInkThreshold?: number;
  /** 순백 하이라이트 컷오프(0..255, 기본 250). 이 값 이상 휘도는 순백 종이로 유지된다. */
  readonly whiteCutoffThreshold?: number;
}

export interface PrintMonochromeRasterResult {
  readonly mode: PrintMonochromeMode;
  readonly width: number;
  readonly height: number;
  readonly cellSizePx: number;
  /** 화면 미리보기 및 PNG/캔버스 출력용 불투명 RGBA 바이트(길이 width * height * 4). */
  readonly rgbaBytes: Uint8Array;
  /** 8비트 DeviceGray 바이트(0=검정, 255=흰색, 길이 width * height). */
  readonly grayBytes: Uint8Array;
  /**
   * PDF DeviceGray /BitsPerComponent 1 규격 패킹 바이트(행 단위 바이트 정렬, MSB 우선,
   * 비트가 0=검정 잉크, 1=흰 종이; grayscale 모드에서는 빈 배열).
   */
  readonly packedDeviceGray1BitBytes: Uint8Array;
  /** 전체 화소 대비 먹(검정) 커버리지 비율(0..1). */
  readonly inkCoverageRatio: number;
}

/** ITU-R BT.709 표준 휘도 계수. */
export const BT709_LUMA_R = 0.2126;
export const BT709_LUMA_G = 0.7152;
export const BT709_LUMA_B = 0.0722;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function fractCentered(value: number): number {
  const f = value - Math.floor(value);
  return f - 0.5;
}

/**
 * 셀 중심 로컬 좌표 (fu, fv) ∈ [-0.5, 0.5)^2 에서 연속 AM 망점 임계값 τ ∈ [0, 1]을 평가한다.
 * 어두움(darkness = 1 - luma/255)이 τ 이상이면 검정 잉크를 찍는다.
 */
export function evaluateAmHalftoneThreshold(
  fu: number,
  fv: number,
  spotShape: PrintHalftoneSpotShape,
): number {
  if (spotShape === "line") {
    return clamp(Math.abs(fv) * 2, 0, 1);
  }
  if (spotShape === "cross") {
    const m = Math.min(Math.abs(fu), Math.abs(fv));
    const rem = 1 - 2 * m;
    return clamp(1 - rem * rem, 0, 1);
  }
  // Euclidean 코사인 원형 망점: 중심(0,0)에서 0, 50%에서 체커보드 대칭, 모서리(±0.5,±0.5)에서 1.
  const cosTerm = Math.cos(2 * Math.PI * fu) + Math.cos(2 * Math.PI * fv);
  return clamp(0.5 - 0.25 * cosTerm, 0, 1);
}

/** RGBA 픽셀을 흰 종이 위에 알파 합성한 뒤 BT.709 휘도(0..255 부동소수점)를 반환한다. */
export function compositeOverWhiteBt709Luma(
  r: number,
  g: number,
  b: number,
  a: number,
): number {
  const alpha = clamp(a / 255, 0, 1);
  const invAlpha = 1 - alpha;
  const cr = r * alpha + 255 * invAlpha;
  const cg = g * alpha + 255 * invAlpha;
  const cb = b * alpha + 255 * invAlpha;
  return BT709_LUMA_R * cr + BT709_LUMA_G * cg + BT709_LUMA_B * cb;
}

/**
 * RGBA 페이지 래스터를 출판 인쇄용 BT.709 그레이스케일 또는 1비트 모노크롬 AM 망점으로 변환한다.
 */
export function rasterizePageForMonochromePrint(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: PrintMonochromeRasterOptions,
): PrintMonochromeRasterResult {
  const w = Math.round(width);
  const h = Math.round(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error("인쇄 변환할 페이지 가로·세로 크기가 올바르지 않습니다.");
  }
  if (rgba.length !== w * h * 4) {
    throw new Error("RGBA 픽셀 버퍼 길이가 이미지 크기와 일치하지 않습니다.");
  }

  const lpi = clamp(options.lpi ?? 60, 10, 200);
  const dpi = clamp(options.dpi ?? 600, 72, 2400);
  const cellSizePx = Math.max(1.5, dpi / lpi);
  const angleRad = ((options.angleDeg ?? 45) * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const spotShape: PrintHalftoneSpotShape = options.spotShape ?? "dot";
  const solidInkThreshold = clamp(options.solidInkThreshold ?? 45, 0, 254);
  const whiteCutoff = clamp(
    options.whiteCutoffThreshold ?? 250,
    solidInkThreshold + 1,
    255,
  );

  const pixelCount = w * h;
  const rgbaBytes = new Uint8Array(pixelCount * 4);
  const grayBytes = new Uint8Array(pixelCount);

  if (options.mode === "grayscale") {
    let darknessSum = 0;
    for (let p = 0; p < pixelCount; p += 1) {
      const i = p * 4;
      const luma = compositeOverWhiteBt709Luma(
        rgba[i]!,
        rgba[i + 1]!,
        rgba[i + 2]!,
        rgba[i + 3]!,
      );
      const gray = clamp(Math.round(luma), 0, 255);
      grayBytes[p] = gray;
      rgbaBytes[i] = gray;
      rgbaBytes[i + 1] = gray;
      rgbaBytes[i + 2] = gray;
      rgbaBytes[i + 3] = 255;
      darknessSum += 1 - gray / 255;
    }

    return {
      mode: "grayscale",
      width: w,
      height: h,
      cellSizePx,
      rgbaBytes,
      grayBytes,
      packedDeviceGray1BitBytes: new Uint8Array(0),
      inkCoverageRatio: pixelCount > 0 ? darknessSum / pixelCount : 0,
    };
  }

  const rowStrideBytes = Math.ceil(w / 8);
  const packed1Bit = new Uint8Array(rowStrideBytes * h);
  // 기본값을 흰 종이(비트 1 -> 0xff)로 채운 뒤 먹 픽셀만 비트를 0으로 내린다.
  packed1Bit.fill(0xff);

  let blackPixelCount = 0;

  for (let y = 0; y < h; y += 1) {
    const rowByteBase = y * rowStrideBytes;
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      const i = p * 4;
      const luma = compositeOverWhiteBt709Luma(
        rgba[i]!,
        rgba[i + 1]!,
        rgba[i + 2]!,
        rgba[i + 3]!,
      );

      let isInkBlack: boolean;
      if (luma <= solidInkThreshold) {
        // 진한 펜선은 망점 격자로 쪼개지 않고 선명한 순흑 잉크로 보존한다.
        isInkBlack = true;
      } else if (luma >= whiteCutoff) {
        isInkBlack = false;
      } else {
        const darkness = 1 - luma / 255;
        const pxCenter = x + 0.5;
        const pyCenter = y + 0.5;
        const u = (pxCenter * cosA + pyCenter * sinA) / cellSizePx;
        const v = (-pxCenter * sinA + pyCenter * cosA) / cellSizePx;
        const threshold = evaluateAmHalftoneThreshold(
          fractCentered(u),
          fractCentered(v),
          spotShape,
        );
        isInkBlack = darkness >= threshold;
      }

      const grayVal = isInkBlack ? 0 : 255;
      grayBytes[p] = grayVal;
      rgbaBytes[i] = grayVal;
      rgbaBytes[i + 1] = grayVal;
      rgbaBytes[i + 2] = grayVal;
      rgbaBytes[i + 3] = 255;

      if (isInkBlack) {
        blackPixelCount += 1;
        const byteIdx = rowByteBase + (x >> 3);
        const bitMask = 0x80 >> (x & 7);
        packed1Bit[byteIdx]! &= ~bitMask;
      }
    }
  }

  return {
    mode: "monochrome-1bit",
    width: w,
    height: h,
    cellSizePx,
    rgbaBytes,
    grayBytes,
    packedDeviceGray1BitBytes: packed1Bit,
    inkCoverageRatio: pixelCount > 0 ? blackPixelCount / pixelCount : 0,
  };
}
