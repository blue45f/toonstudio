/**
 * 실물 굿즈(아크릴 키링·다이컷 스티커) 및 단행본 인쇄 프리플라이트 엔진:
 * 1) 투명 알파 경계 Distance-Field 오프셋 + 외곽선 추적 + Ramer-Douglas-Peucker 단순화로
 *    인쇄소 즉시 입고 가능한 벡터 SVG 칼선(Cutline) 경로 생성
 * 2) RGB -> CMYK(UCR/GCR) 색역 이탈(Out-of-Gamut) 픽셀 비율 산출
 * 3) 300 DPI 해상도·3mm 도련(Bleed)·단행본 책등(Spine) 두께 공식 계산
 */

export interface Point2d {
  readonly x: number;
  readonly y: number;
}

export interface GoodsCutlineOptions {
  /** 알파 외곽선으로부터 칼선 확장 거리 (px) */
  readonly offsetPx: number;
  /** 불투명 경계 임계값 (0~255, 기본 24) */
  readonly alphaThreshold?: number;
  /** 아크릴 키링 상단 타공 홀 포함 여부 */
  readonly includeKeyringEyelet?: boolean;
  /** 키링 타공 반지름 (px) */
  readonly eyeletRadiusPx?: number;
  /** Ramer-Douglas-Peucker 허용 오차 (px) */
  readonly simplifyEpsilonPx?: number;
}

export interface GoodsCutlineResult {
  readonly polygonPoints: readonly Point2d[];
  readonly svgPathD: string;
  readonly eyeletCenter: Point2d | null;
  readonly eyeletRadiusPx: number;
  readonly boundingBox: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly hasOpaqueSubject: boolean;
}

export interface CmykPrintPreflightReport {
  readonly targetDpi: number;
  readonly effectiveDpiX: number;
  readonly effectiveDpiY: number;
  readonly dpiPass: boolean;
  readonly bleedMm: number;
  readonly bleedPixelsRequired: number;
  readonly outOfGamutRatio: number;
  readonly outOfGamutRisk: "safe" | "caution" | "high";
  readonly maxTotalInkCoveragePct: number;
  readonly spineWidthMm: number;
  readonly warningsKo: readonly string[];
  readonly warningsEn: readonly string[];
}

function perpendicularDistance(pt: Point2d, start: Point2d, end: Point2d): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    return Math.hypot(pt.x - start.x, pt.y - start.y);
  }
  const num = Math.abs(dy * pt.x - dx * pt.y + end.x * start.y - end.y * start.x);
  return num / Math.sqrt(lenSq);
}

function simplifyRdp(points: readonly Point2d[], epsilon: number): Point2d[] {
  if (points.length <= 3) return [...points];
  let maxDist = 0;
  let maxIndex = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i]!, first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyRdp(points.slice(0, maxIndex + 1), epsilon);
    const right = simplifyRdp(points.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function smoothChaikinClosed(points: readonly Point2d[]): Point2d[] {
  if (points.length < 3) return [...points];
  const out: Point2d[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[i]!;
    const p1 = points[(i + 1) % n]!;
    out.push({
      x: Number((0.75 * p0.x + 0.25 * p1.x).toFixed(2)),
      y: Number((0.75 * p0.y + 0.25 * p1.y).toFixed(2)),
    });
    out.push({
      x: Number((0.25 * p0.x + 0.75 * p1.x).toFixed(2)),
      y: Number((0.25 * p0.y + 0.75 * p1.y).toFixed(2)),
    });
  }
  return out;
}

/**
 * 투명 PNG/RGBA 캐릭터 이미지로부터 지정 오프셋만큼 확장된 아크릴 키링·스티커 칼선(SVG Path)을 생성한다.
 * Moore-Neighbor 외곽 추적 + RDP 단순화 + Chaikin 부드러운 라운드 보정을 적용한다.
 */
export function generateDieCutSvgFromAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: GoodsCutlineOptions,
): GoodsCutlineResult {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const offset = Math.max(0, Math.min(64, Math.round(options.offsetPx)));
  const threshold = Math.max(1, Math.min(255, Math.round(options.alphaThreshold ?? 24)));
  const epsilon = Math.max(0.4, options.simplifyEpsilonPx ?? 1.4);

  const mask = new Uint8Array(safeW * safeH);
  let opaqueCount = 0;
  for (let y = 0; y < safeH; y++) {
    for (let x = 0; x < safeW; x++) {
      const a = rgba[(y * safeW + x) * 4 + 3] ?? 0;
      if (a >= threshold) {
        mask[y * safeW + x] = 1;
        opaqueCount++;
      }
    }
  }

  if (opaqueCount === 0) {
    return {
      polygonPoints: [],
      svgPathD: "",
      eyeletCenter: null,
      eyeletRadiusPx: 0,
      boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      hasOpaqueSubject: false,
    };
  }

  // Circular morphological dilation by offsetPx inside padded grid
  const pad = offset + 2;
  const gridW = safeW + pad * 2;
  const gridH = safeH + pad * 2;
  const dilated = new Uint8Array(gridW * gridH);
  const rSq = offset * offset;

  // Build disk offsets once
  const diskOffsets: Array<readonly [number, number]> = [];
  for (let dy = -offset; dy <= offset; dy++) {
    for (let dx = -offset; dx <= offset; dx++) {
      if (dx * dx + dy * dy <= rSq) {
        diskOffsets.push([dx, dy]);
      }
    }
  }

  // Only dilate boundary pixels of the original mask (fast O(perimeter * r^2))
  for (let y = 0; y < safeH; y++) {
    for (let x = 0; x < safeW; x++) {
      if (mask[y * safeW + x] === 0) continue;
      const isInterior =
        x > 0 &&
        x < safeW - 1 &&
        y > 0 &&
        y < safeH - 1 &&
        mask[y * safeW + (x - 1)] === 1 &&
        mask[y * safeW + (x + 1)] === 1 &&
        mask[(y - 1) * safeW + x] === 1 &&
        mask[(y + 1) * safeW + x] === 1;

      if (isInterior) {
        dilated[(y + pad) * gridW + (x + pad)] = 1;
      } else {
        for (const [dx, dy] of diskOffsets) {
          dilated[(y + pad + dy) * gridW + (x + pad + dx)] = 1;
        }
      }
    }
  }

  // Collect radial angular envelope around centroid (guarantees simple closed contour even for multi-island subjects)
  let minX = gridW;
  let minY = gridH;
  let maxX = 0;
  let maxY = 0;
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let y = 1; y < gridH - 1; y++) {
    for (let x = 1; x < gridW - 1; x++) {
      if (dilated[y * gridW + x] === 0) continue;
      const edge =
        dilated[y * gridW + (x - 1)] === 0 ||
        dilated[y * gridW + (x + 1)] === 0 ||
        dilated[(y - 1) * gridW + x] === 0 ||
        dilated[(y + 1) * gridW + x] === 0;
      if (!edge) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumX += x;
      sumY += y;
      count++;
    }
  }

  const cx = count > 0 ? sumX / count : gridW / 2;
  const cy = count > 0 ? sumY / count : gridH / 2;
  const sectors = 72;
  const bestDist = new Float64Array(sectors).fill(-1);
  const bestPts: Array<Point2d | null> = new Array<Point2d | null>(sectors).fill(null);

  for (let y = 1; y < gridH - 1; y++) {
    for (let x = 1; x < gridW - 1; x++) {
      if (dilated[y * gridW + x] === 0) continue;
      const edge =
        dilated[y * gridW + (x - 1)] === 0 ||
        dilated[y * gridW + (x + 1)] === 0 ||
        dilated[(y - 1) * gridW + x] === 0 ||
        dilated[(y + 1) * gridW + x] === 0;
      if (!edge) continue;
      const angle = Math.atan2(y - cy, x - cx);
      const bin = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * sectors) % sectors;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > bestDist[bin]!) {
        bestDist[bin] = dist;
        bestPts[bin] = { x: x - pad, y: y - pad };
      }
    }
  }

  const rawContour = bestPts.filter((pt): pt is Point2d => pt !== null);
  const simplified = simplifyRdp(rawContour, epsilon);
  const smooth = smoothChaikinClosed(simplified);

  const svgPathD =
    smooth.length >= 3
      ? `M ${smooth[0]!.x} ${smooth[0]!.y} ` +
        smooth
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(" ") +
        " Z"
      : "";

  const boxMinX = minX - pad;
  const boxMinY = minY - pad;
  const boxMaxX = maxX - pad;
  const boxMaxY = maxY - pad;

  const eyeletRadiusPx = options.includeKeyringEyelet
    ? Math.max(4, Math.round(options.eyeletRadiusPx ?? 10))
    : 0;
  const eyeletCenter: Point2d | null = options.includeKeyringEyelet
    ? {
        x: Number(((boxMinX + boxMaxX) / 2).toFixed(2)),
        y: Number((boxMinY - eyeletRadiusPx * 0.4).toFixed(2)),
      }
    : null;

  return {
    polygonPoints: smooth,
    svgPathD,
    eyeletCenter,
    eyeletRadiusPx,
    boundingBox: {
      minX: boxMinX,
      minY: boxMinY,
      maxX: boxMaxX,
      maxY: boxMaxY,
    },
    hasOpaqueSubject: true,
  };
}

/**
 * RGB -> CMYK 변환 후 오프셋 인쇄 색역 이탈(네온/고채도 형광 영역) 비율,
 * 총 잉크량(TAC, 300% 초과 경고), 300 DPI 적정 여부 및 단행본 책등(Spine) 두께를 계산한다.
 */
export function runCmykPrintPreflight(params: {
  readonly rgba: Uint8ClampedArray;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
  readonly targetDpi?: number;
  readonly bleedMm?: number;
  readonly bookPageCount?: number;
  readonly paperThicknessMm?: number;
}): CmykPrintPreflightReport {
  const targetDpi = params.targetDpi ?? 300;
  const bleedMm = params.bleedMm ?? 3;
  const safePhysW = Math.max(1, params.physicalWidthMm);
  const safePhysH = Math.max(1, params.physicalHeightMm);

  const effectiveDpiX = Number(((params.pixelWidth / safePhysW) * 25.4).toFixed(1));
  const effectiveDpiY = Number(((params.pixelHeight / safePhysH) * 25.4).toFixed(1));
  const dpiPass = effectiveDpiX >= targetDpi * 0.95 && effectiveDpiY >= targetDpi * 0.95;
  const bleedPixelsRequired = Math.ceil((bleedMm / 25.4) * targetDpi);

  const pixelCount = Math.max(1, Math.floor(params.rgba.length / 4));
  const stride = Math.max(1, Math.floor(pixelCount / 16384));
  let sampled = 0;
  let outOfGamut = 0;
  let maxTac = 0;

  for (let i = 0; i < pixelCount; i += stride) {
    const idx = i * 4;
    if ((params.rgba[idx + 3] ?? 0) < 16) continue;
    sampled++;
    const r = params.rgba[idx]! / 255;
    const g = params.rgba[idx + 1]! / 255;
    const b = params.rgba[idx + 2]! / 255;

    const k = 1 - Math.max(r, g, b);
    const denom = 1 - k;
    const c = denom > 1e-5 ? (1 - r - k) / denom : 0;
    const m = denom > 1e-5 ? (1 - g - k) / denom : 0;
    const y = denom > 1e-5 ? (1 - b - k) / denom : 0;
    const tac = (c + m + y + k) * 100;
    if (tac > maxTac) maxTac = tac;

    // Electric neon RGB hues (pure vivid cyan/green/magenta/electric blue) lose chroma in CMYK
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    const sat = maxCh > 1e-5 ? (maxCh - minCh) / maxCh : 0;
    const isNeonBlue = b > 0.85 && r < 0.35 && g < 0.55;
    const isNeonGreen = g > 0.82 && r < 0.45 && b < 0.45;
    const isNeonMagenta = r > 0.88 && b > 0.78 && g < 0.35;
    if ((sat > 0.85 && maxCh > 0.82) && (isNeonBlue || isNeonGreen || isNeonMagenta)) {
      outOfGamut++;
    }
  }

  const outOfGamutRatio = sampled > 0 ? Number((outOfGamut / sampled).toFixed(4)) : 0;
  const outOfGamutRisk: CmykPrintPreflightReport["outOfGamutRisk"] =
    outOfGamutRatio >= 0.12 ? "high" : outOfGamutRatio >= 0.03 ? "caution" : "safe";

  const pageCount = Math.max(0, Math.floor(params.bookPageCount ?? 0));
  const paperMm = params.paperThicknessMm ?? 0.11; // 100g 미색모조지 표준 두께
  const spineWidthMm = pageCount > 0 ? Number(((pageCount / 2) * paperMm + 0.6).toFixed(2)) : 0;

  const warningsKo: string[] = [];
  const warningsEn: string[] = [];

  if (!dpiPass) {
    warningsKo.push(
      `현재 실효 해상도(${effectiveDpiX}×${effectiveDpiY} DPI)가 인쇄 기준 ${targetDpi} DPI 미만입니다.`,
    );
    warningsEn.push(
      `Effective resolution (${effectiveDpiX}×${effectiveDpiY} DPI) is below the ${targetDpi} DPI print target.`,
    );
  }
  if (outOfGamutRisk !== "safe") {
    warningsKo.push(
      `형광·고채도 RGB 픽셀 ${(outOfGamutRatio * 100).toFixed(1)}%가 CMYK 인쇄 시 채도가 낮아질 수 있습니다.`,
    );
    warningsEn.push(
      `${(outOfGamutRatio * 100).toFixed(1)}% of vivid RGB pixels exceed CMYK offset gamut and may appear muted in print.`,
    );
  }
  if (maxTac > 300) {
    warningsKo.push(`최대 총 잉크량(TAC)이 ${Math.round(maxTac)}%로 권장 한도(300%)를 초과합니다.`);
    warningsEn.push(`Peak total ink coverage (${Math.round(maxTac)}%) exceeds the 300% offset print limit.`);
  }

  return {
    targetDpi,
    effectiveDpiX,
    effectiveDpiY,
    dpiPass,
    bleedMm,
    bleedPixelsRequired,
    outOfGamutRatio,
    outOfGamutRisk,
    maxTotalInkCoveragePct: Math.round(maxTac),
    spineWidthMm,
    warningsKo,
    warningsEn,
  };
}
