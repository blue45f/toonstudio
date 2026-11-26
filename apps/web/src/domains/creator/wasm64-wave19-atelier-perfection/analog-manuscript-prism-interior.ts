/**
 * 아날로그 만화 원고지·칼끝 톤 깎기·화이트 수정액 커널 및
 * 코시 파장 분산 프리즘·2-삼각형 의사 3D 실내 매핑 통합 모듈.
 *
 * - 외부 서버 호출 0회(₩0), 로컬 TypedArray 연산만으로 완결 동작한다.
 * - 상업지 B4·동인지 A4·단행본 겸용 원고 규격의 내측 테두리·재단선·도련선·모서리 톰보 좌표를
 *   실제 mm 치수와 인쇄 DPI 기준으로 생성하고, 아트나이프 방향성 톤 깎기와 불투명 화이트 수정액의
 *   물감 테두리 두께감·붓 튀김 입자를 물리적으로 합성한다.
 */

export {
  createBrilliantGemPolyhedron,
  createEquilateralPrismPolyhedron,
  evaluateCauchyRefractiveIndex,
  PRISM_MATERIAL_PRESETS,
  renderInteriorMappedFacadeBuffer,
  sampleInteriorMappedFacadePoint,
  SPECTRAL_WAVELENGTHS_NM,
  traceSpectralPrismRay,
  type CauchyMaterialSpec,
  type ConvexCrystalPolyhedron,
  type CrystalFacetPlane,
  type InteriorFacadeConfig,
  type InteriorFacadeRenderOptions,
  type InteriorFacadeRenderReport,
  type InteriorFacadeSample,
  type InteriorSurfaceHitKind,
  type PrismMaterialPresetId,
  type SpectralBandRayResult,
  type SpectralPrismTraceInput,
  type SpectralPrismTraceResult,
  type Vec3,
} from "./prism-interior-optics";

export type ManuscriptFormatPresetId = "b4-commercial" | "a4-doujin" | "kr-page-comic";

export interface GuideBoxPx {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type ManuscriptGuideRole =
  | "corner-tonbo"
  | "center-tonbo"
  | "spine-tick"
  | "ruler-tick";

export interface GuideLineSegmentPx {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly role: ManuscriptGuideRole;
}

export interface ManuscriptDimensionsMm {
  readonly presetId: ManuscriptFormatPresetId;
  readonly labelKo: string;
  readonly paperWidthMm: number;
  readonly paperHeightMm: number;
  readonly bleedWidthMm: number;
  readonly bleedHeightMm: number;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly innerFrameWidthMm: number;
  readonly innerFrameHeightMm: number;
  readonly tonboArmLengthMm: number;
  readonly tonboGapMm: number;
}

export interface ManuscriptTemplateOptions {
  readonly presetId?: ManuscriptFormatPresetId;
  readonly dpi?: number;
  readonly includeRulerTicks?: boolean;
}

export interface ManuscriptTemplateLayout {
  readonly presetId: ManuscriptFormatPresetId;
  readonly labelKo: string;
  readonly dpi: number;
  readonly mmToPxScale: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly paperRectPx: GuideBoxPx;
  readonly bleedRectPx: GuideBoxPx;
  readonly trimRectPx: GuideBoxPx;
  readonly innerFrameRectPx: GuideBoxPx;
  readonly guideCyanLinearRgb: readonly [number, number, number];
  readonly kentPaperBaseLinearRgb: readonly [number, number, number];
  readonly cornerTonboSegments: readonly GuideLineSegmentPx[];
  readonly centerTonboSegments: readonly GuideLineSegmentPx[];
  readonly rulerTickSegments: readonly GuideLineSegmentPx[];
  readonly serverCostKrw: 0;
}

export interface ToneKnifeStroke {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly bladeWidthPx: number;
  readonly pressure: number;
  readonly striationPitchPx?: number;
  readonly featherExponent?: number;
}

export interface ToneKnifeScrapeInput {
  readonly width: number;
  readonly height: number;
  readonly baseToneCoverage?: Float32Array;
  readonly baseDotDensity?: number;
  readonly screenLpi?: number;
  readonly screenAngleDeg?: number;
  readonly dpi?: number;
  readonly strokes: readonly ToneKnifeStroke[];
}

export interface ToneKnifeScrapeResult {
  readonly width: number;
  readonly height: number;
  readonly coverageBuffer: Float32Array;
  readonly scrapedPixelCount: number;
  readonly meanCoverageBefore: number;
  readonly meanCoverageAfter: number;
  readonly serverCostKrw: 0;
}

export interface WhiteoutStroke {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly brushRadiusPx: number;
  readonly opacity?: number;
  readonly ridgeThickness?: number;
  readonly splatterCount?: number;
  readonly splatterSpreadPx?: number;
  readonly seed?: number;
}

export interface WhiteoutCompositeInput {
  readonly width: number;
  readonly height: number;
  readonly inkLuminanceBuffer: Float32Array;
  readonly strokes: readonly WhiteoutStroke[];
}

export interface WhiteoutCompositeResult {
  readonly width: number;
  readonly height: number;
  readonly compositedLuminance: Float32Array;
  readonly pigmentRidgeHeightMap: Float32Array;
  readonly coveredInkPixelCount: number;
  readonly dropletCount: number;
  readonly serverCostKrw: 0;
}

export const MANUSCRIPT_DIMENSION_PRESETS: Readonly<
  Record<ManuscriptFormatPresetId, ManuscriptDimensionsMm>
> = Object.freeze({
  "b4-commercial": {
    presetId: "b4-commercial",
    labelKo: "상업지 B4 만화 원고용지",
    paperWidthMm: 257,
    paperHeightMm: 364,
    bleedWidthMm: 230,
    bleedHeightMm: 320,
    trimWidthMm: 220,
    trimHeightMm: 310,
    innerFrameWidthMm: 180,
    innerFrameHeightMm: 270,
    tonboArmLengthMm: 10,
    tonboGapMm: 3,
  },
  "a4-doujin": {
    presetId: "a4-doujin",
    labelKo: "동인지 A4 만화 원고용지",
    paperWidthMm: 210,
    paperHeightMm: 297,
    bleedWidthMm: 188,
    bleedHeightMm: 263,
    trimWidthMm: 182,
    trimHeightMm: 257,
    innerFrameWidthMm: 150,
    innerFrameHeightMm: 220,
    tonboArmLengthMm: 8,
    tonboGapMm: 3,
  },
  "kr-page-comic": {
    presetId: "kr-page-comic",
    labelKo: "단행본·페이지웹툰 겸용 원고용지",
    paperWidthMm: 210,
    paperHeightMm: 297,
    bleedWidthMm: 194,
    bleedHeightMm: 263,
    trimWidthMm: 188,
    trimHeightMm: 257,
    innerFrameWidthMm: 162,
    innerFrameHeightMm: 230,
    tonboArmLengthMm: 8,
    tonboGapMm: 3,
  },
});

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hashUint32(seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

function unitRandomFromHash(seed: number): number {
  return hashUint32(seed) / 4294967296;
}

function centeredRectPx(
  canvasW: number,
  canvasH: number,
  boxW: number,
  boxH: number,
  scale: number,
): GuideBoxPx {
  const width = Math.round(boxW * scale);
  const height = Math.round(boxH * scale);
  return {
    x: Math.round((canvasW - width) * 0.5),
    y: Math.round((canvasH - height) * 0.5),
    width,
    height,
  };
}

/**
 * 켄트지 미세 종이 섬유 반사율을 결정론적으로 샘플링한다.
 */
export function sampleKentPaperFiberReflectance(
  xPx: number,
  yPx: number,
  seed = 1901,
): number {
  const ix = Math.floor(xPx);
  const iy = Math.floor(yPx);
  const grainFine = unitRandomFromHash(
    Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed,
  );
  const grainStreak = unitRandomFromHash(
    Math.imul(ix >> 2, 2246822519) ^ Math.imul(iy, 3266489917) ^ (seed + 97),
  );
  return 0.968 + 0.022 * grainFine + 0.01 * grainStreak;
}

/**
 * 상업 인쇄·동인지 표준 B4/A4 만화 원고용지의 내측 기본 테두리, 재단선, 도련선,
 * 네 모서리 이중 톰보(재단+도련 직각 마크) 및 중앙 십자 톰보 벡터 선분을 생성한다.
 */
export function generateAnalogManuscriptTemplate(
  options: ManuscriptTemplateOptions = {},
): ManuscriptTemplateLayout {
  const presetId = options.presetId ?? "b4-commercial";
  const dpi = clamp(options.dpi ?? 600, 72, 2400);
  const includeRulerTicks = options.includeRulerTicks ?? true;
  const spec = MANUSCRIPT_DIMENSION_PRESETS[presetId];
  const mmToPxScale = dpi / 25.4;

  const canvasWidthPx = Math.max(64, Math.round(spec.paperWidthMm * mmToPxScale));
  const canvasHeightPx = Math.max(64, Math.round(spec.paperHeightMm * mmToPxScale));
  const paperRectPx: GuideBoxPx = { x: 0, y: 0, width: canvasWidthPx, height: canvasHeightPx };
  const bleedRectPx = centeredRectPx(
    canvasWidthPx, canvasHeightPx, spec.bleedWidthMm, spec.bleedHeightMm, mmToPxScale,
  );
  const trimRectPx = centeredRectPx(
    canvasWidthPx, canvasHeightPx, spec.trimWidthMm, spec.trimHeightMm, mmToPxScale,
  );
  const innerFrameRectPx = centeredRectPx(
    canvasWidthPx, canvasHeightPx, spec.innerFrameWidthMm, spec.innerFrameHeightMm, mmToPxScale,
  );

  const armPx = Math.max(4, Math.round(spec.tonboArmLengthMm * mmToPxScale));
  const cornerTonboSegments: GuideLineSegmentPx[] = [];
  const corners = [
    { tx: trimRectPx.x, ty: trimRectPx.y, bx: bleedRectPx.x, by: bleedRectPx.y, sx: -1, sy: -1 },
    {
      tx: trimRectPx.x + trimRectPx.width,
      ty: trimRectPx.y,
      bx: bleedRectPx.x + bleedRectPx.width,
      by: bleedRectPx.y,
      sx: 1,
      sy: -1,
    },
    {
      tx: trimRectPx.x,
      ty: trimRectPx.y + trimRectPx.height,
      bx: bleedRectPx.x,
      by: bleedRectPx.y + bleedRectPx.height,
      sx: -1,
      sy: 1,
    },
    {
      tx: trimRectPx.x + trimRectPx.width,
      ty: trimRectPx.y + trimRectPx.height,
      bx: bleedRectPx.x + bleedRectPx.width,
      by: bleedRectPx.y + bleedRectPx.height,
      sx: 1,
      sy: 1,
    },
  ] as const;

  for (const c of corners) {
    cornerTonboSegments.push(
      { x0: c.bx, y0: c.ty, x1: c.bx + c.sx * armPx, y1: c.ty, role: "corner-tonbo" },
      { x0: c.tx, y0: c.by, x1: c.tx, y1: c.by + c.sy * armPx, role: "corner-tonbo" },
      { x0: c.bx, y0: c.by, x1: c.bx + c.sx * armPx, y1: c.by, role: "corner-tonbo" },
      { x0: c.bx, y0: c.by, x1: c.bx, y1: c.by + c.sy * armPx, role: "corner-tonbo" },
    );
  }

  const midX = Math.round(canvasWidthPx * 0.5);
  const midY = Math.round(canvasHeightPx * 0.5);
  const gapPx = Math.max(2, Math.round(spec.tonboGapMm * mmToPxScale));
  const halfCrossPx = Math.max(3, Math.round(armPx * 0.5));
  const topCenterY = bleedRectPx.y - gapPx;
  const bottomCenterY = bleedRectPx.y + bleedRectPx.height + gapPx;
  const leftCenterX = bleedRectPx.x - gapPx;
  const rightCenterX = bleedRectPx.x + bleedRectPx.width + gapPx;

  const centerTonboSegments: GuideLineSegmentPx[] = [
    { x0: midX - halfCrossPx, y0: topCenterY, x1: midX + halfCrossPx, y1: topCenterY, role: "center-tonbo" },
    { x0: midX, y0: topCenterY - halfCrossPx, x1: midX, y1: bleedRectPx.y, role: "center-tonbo" },
    { x0: midX - halfCrossPx, y0: bottomCenterY, x1: midX + halfCrossPx, y1: bottomCenterY, role: "center-tonbo" },
    { x0: midX, y0: bleedRectPx.y + bleedRectPx.height, x1: midX, y1: bottomCenterY + halfCrossPx, role: "center-tonbo" },
    { x0: leftCenterX - halfCrossPx, y0: midY, x1: bleedRectPx.x, y1: midY, role: "center-tonbo" },
    { x0: leftCenterX, y0: midY - halfCrossPx, x1: leftCenterX, y1: midY + halfCrossPx, role: "center-tonbo" },
    { x0: bleedRectPx.x + bleedRectPx.width, y0: midY, x1: rightCenterX + halfCrossPx, y1: midY, role: "center-tonbo" },
    { x0: rightCenterX, y0: midY - halfCrossPx, x1: rightCenterX, y1: midY + halfCrossPx, role: "center-tonbo" },
    { x0: innerFrameRectPx.x, y0: midY, x1: innerFrameRectPx.x - gapPx, y1: midY, role: "spine-tick" },
    {
      x0: innerFrameRectPx.x + innerFrameRectPx.width,
      y0: midY,
      x1: innerFrameRectPx.x + innerFrameRectPx.width + gapPx,
      y1: midY,
      role: "spine-tick",
    },
  ];

  const rulerTickSegments: GuideLineSegmentPx[] = [];
  if (includeRulerTicks) {
    const stepMm = 10;
    const tickShortPx = Math.max(2, Math.round(1.5 * mmToPxScale));
    const countX = Math.floor(spec.innerFrameWidthMm / stepMm);
    for (let i = 1; i < countX; i += 1) {
      const rx = Math.round(innerFrameRectPx.x + i * stepMm * mmToPxScale);
      rulerTickSegments.push({ x0: rx, y0: bleedRectPx.y, x1: rx, y1: bleedRectPx.y - tickShortPx, role: "ruler-tick" });
    }
    const countY = Math.floor(spec.innerFrameHeightMm / stepMm);
    for (let j = 1; j < countY; j += 1) {
      const ry = Math.round(innerFrameRectPx.y + j * stepMm * mmToPxScale);
      rulerTickSegments.push({ x0: bleedRectPx.x, y0: ry, x1: bleedRectPx.x - tickShortPx, y1: ry, role: "ruler-tick" });
    }
  }

  return {
    presetId,
    labelKo: spec.labelKo,
    dpi,
    mmToPxScale,
    canvasWidthPx,
    canvasHeightPx,
    paperRectPx,
    bleedRectPx,
    trimRectPx,
    innerFrameRectPx,
    guideCyanLinearRgb: [0.56, 0.83, 0.96],
    kentPaperBaseLinearRgb: [0.985, 0.978, 0.955],
    cornerTonboSegments,
    centerTonboSegments,
    rulerTickSegments,
    serverCostKrw: 0,
  };
}

/**
 * 회전된 아날로그 망점 스크린톤 기본 밀도를 생성하고,
 * 디자인 나이프의 긁기 진행 방향과 칼결 줄무늬에 따라 망점 피복률을 깎아낸다.
 */
export function scrapeScreentoneWithKnife(input: ToneKnifeScrapeInput): ToneKnifeScrapeResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const totalPixels = width * height;
  const coverageBuffer = new Float32Array(totalPixels);

  if (input.baseToneCoverage && input.baseToneCoverage.length >= totalPixels) {
    for (let i = 0; i < totalPixels; i += 1) {
      coverageBuffer[i] = clamp01(input.baseToneCoverage[i] ?? 0);
    }
  } else {
    const baseDensity = clamp(input.baseDotDensity ?? 0.55, 0.02, 0.98);
    const lpi = clamp(input.screenLpi ?? 60, 10, 200);
    const dpi = clamp(input.dpi ?? 600, 72, 2400);
    const pitchPx = Math.max(2, dpi / lpi);
    const rad = ((input.screenAngleDeg ?? 45) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const dotRadiusNorm = Math.sqrt(baseDensity / Math.PI) * 1.12;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const u = (x * cosA + y * sinA) / pitchPx;
        const v = (-x * sinA + y * cosA) / pitchPx;
        const dist = Math.hypot(u - Math.floor(u) - 0.5, v - Math.floor(v) - 0.5);
        const cov = 1 - smoothstep(dotRadiusNorm - 0.08, dotRadiusNorm + 0.08, dist);
        coverageBuffer[y * width + x] = baseDensity * 0.55 + cov * 0.45 * baseDensity;
      }
    }
  }

  let sumBefore = 0;
  for (let i = 0; i < totalPixels; i += 1) sumBefore += coverageBuffer[i] ?? 0;
  const originalCopy = new Float32Array(coverageBuffer);

  for (let sIdx = 0; sIdx < input.strokes.length; sIdx += 1) {
    const stroke = input.strokes[sIdx]!;
    const dx = stroke.x1 - stroke.x0;
    const dy = stroke.y1 - stroke.y0;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-4) continue;

    const halfWidth = Math.max(1, stroke.bladeWidthPx * 0.5);
    const pressure = clamp01(stroke.pressure);
    if (pressure <= 0) continue;

    const pitch = Math.max(1.2, stroke.striationPitchPx ?? 3.0);
    const featherExp = clamp(stroke.featherExponent ?? 1.25, 0.3, 4.0);
    const tx = dx / segLen;
    const ty = dy / segLen;
    const nx = -ty;
    const ny = tx;

    const minX = Math.max(0, Math.floor(Math.min(stroke.x0, stroke.x1) - halfWidth - 1));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(stroke.x0, stroke.x1) + halfWidth + 1));
    const minY = Math.max(0, Math.floor(Math.min(stroke.y0, stroke.y1) - halfWidth - 1));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(stroke.y0, stroke.y1) + halfWidth + 1));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const rx = x + 0.5 - stroke.x0;
        const ry = y + 0.5 - stroke.y0;
        const along = rx * tx + ry * ty;
        if (along < 0 || along > segLen) continue;
        const perp = rx * nx + ry * ny;
        const normPerp = Math.abs(perp) / halfWidth;
        if (normPerp >= 1) continue;

        const directionalRamp = Math.pow(along / segLen, featherExp);
        const crossProfile = 1 - normPerp * normPerp;
        const striationWave = 0.62 + 0.38 * Math.cos(((perp + sIdx * 1.37) / pitch) * Math.PI * 2);
        const microChip =
          0.88 + 0.12 * unitRandomFromHash(Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ sIdx);
        const scrapeAmount = clamp01(
          pressure * (0.2 + 0.8 * directionalRamp) * crossProfile * striationWave * microChip,
        );
        const idx = y * width + x;
        coverageBuffer[idx] = Math.max(0, (coverageBuffer[idx] ?? 0) - scrapeAmount);
      }
    }
  }

  let scrapedPixelCount = 0;
  let sumAfter = 0;
  for (let i = 0; i < totalPixels; i += 1) {
    const afterVal = coverageBuffer[i] ?? 0;
    sumAfter += afterVal;
    if ((originalCopy[i] ?? 0) - afterVal > 1e-3) scrapedPixelCount += 1;
  }

  return {
    width,
    height,
    coverageBuffer,
    scrapedPixelCount,
    meanCoverageBefore: sumBefore / totalPixels,
    meanCoverageAfter: sumAfter / totalPixels,
    serverCostKrw: 0,
  };
}

function distanceToSegment2D(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return Math.hypot(px - x0, py - y0);
  const t = clamp01(((px - x0) * dx + (py - y0) * dy) / lenSq);
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/**
 * 먹선·스크린톤 버퍼 위에 고불투명 화이트 수정액 획과 물감 가장자리 두께감(Ridge),
 * 붓 끝에서 튀는 미세 화이트 스플래터 입자를 합성한다.
 */
export function applyOpaqueWhiteoutStrokes(
  input: WhiteoutCompositeInput,
): WhiteoutCompositeResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const totalPixels = width * height;
  const compositedLuminance = new Float32Array(totalPixels);
  const pigmentRidgeHeightMap = new Float32Array(totalPixels);

  for (let i = 0; i < totalPixels; i += 1) {
    compositedLuminance[i] = clamp01(input.inkLuminanceBuffer[i] ?? 1);
  }

  let totalDroplets = 0;

  for (let sIdx = 0; sIdx < input.strokes.length; sIdx += 1) {
    const stroke = input.strokes[sIdx]!;
    const radius = Math.max(0.75, stroke.brushRadiusPx);
    const opacity = clamp(stroke.opacity ?? 0.98, 0.1, 1.0);
    const ridgeStrength = clamp01(stroke.ridgeThickness ?? 0.65);

    const minX = Math.max(0, Math.floor(Math.min(stroke.x0, stroke.x1) - radius - 2));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(stroke.x0, stroke.x1) + radius + 2));
    const minY = Math.max(0, Math.floor(Math.min(stroke.y0, stroke.y1) - radius - 2));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(stroke.y0, stroke.y1) + radius + 2));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dist = distanceToSegment2D(x + 0.5, y + 0.5, stroke.x0, stroke.y0, stroke.x1, stroke.y1);
        if (dist > radius + 1.0) continue;
        const mask = 1 - smoothstep(Math.max(0, radius - 0.9), radius + 0.5, dist);
        const alpha = mask * opacity;
        const idx = y * width + x;
        compositedLuminance[idx] = (compositedLuminance[idx] ?? 1) * (1 - alpha) + 0.992 * alpha;

        const rimBump = Math.exp(-Math.pow((dist / radius - 0.78) / 0.22, 2));
        const heightSample = mask * (0.45 + 0.55 * rimBump * ridgeStrength);
        if (heightSample > (pigmentRidgeHeightMap[idx] ?? 0)) {
          pigmentRidgeHeightMap[idx] = heightSample;
        }
      }
    }

    const splatterCount = Math.max(0, Math.floor(stroke.splatterCount ?? 0));
    const spread = Math.max(2, stroke.splatterSpreadPx ?? radius * 3.5);
    const baseSeed = ((stroke.seed ?? 7717) + sIdx * 104729) >>> 0;
    const baseAngle = Math.atan2(stroke.y1 - stroke.y0, stroke.x1 - stroke.x0);

    for (let d = 0; d < splatterCount; d += 1) {
      const r1 = unitRandomFromHash(baseSeed + d * 3 + 1);
      const r2 = unitRandomFromHash(baseSeed + d * 3 + 2);
      const r3 = unitRandomFromHash(baseSeed + d * 3 + 3);
      const angle = baseAngle + (r1 - 0.5) * 1.35;
      const travel = radius + (0.2 + 0.8 * r2) * spread;
      const dropX = stroke.x1 + Math.cos(angle) * travel;
      const dropY = stroke.y1 + Math.sin(angle) * travel;
      const dropRadius = Math.max(0.65, radius * (0.14 + 0.34 * r3));

      const dMinX = Math.max(0, Math.floor(dropX - dropRadius - 1));
      const dMaxX = Math.min(width - 1, Math.ceil(dropX + dropRadius + 1));
      const dMinY = Math.max(0, Math.floor(dropY - dropRadius - 1));
      const dMaxY = Math.min(height - 1, Math.ceil(dropY + dropRadius + 1));
      if (dMinX > dMaxX || dMinY > dMaxY) continue;

      totalDroplets += 1;
      for (let py = dMinY; py <= dMaxY; py += 1) {
        for (let px = dMinX; px <= dMaxX; px += 1) {
          const dist = Math.hypot(px + 0.5 - dropX, py + 0.5 - dropY);
          if (dist > dropRadius + 0.6) continue;
          const dropAlpha =
            (1 - smoothstep(Math.max(0, dropRadius - 0.5), dropRadius + 0.4, dist)) * opacity;
          const idx = py * width + px;
          compositedLuminance[idx] = (compositedLuminance[idx] ?? 1) * (1 - dropAlpha) + 0.995 * dropAlpha;
          const dropHeight = dropAlpha * (0.55 + 0.45 * ridgeStrength);
          if (dropHeight > (pigmentRidgeHeightMap[idx] ?? 0)) {
            pigmentRidgeHeightMap[idx] = dropHeight;
          }
        }
      }
    }
  }

  let coveredInkPixelCount = 0;
  for (let i = 0; i < totalPixels; i += 1) {
    if (clamp01(input.inkLuminanceBuffer[i] ?? 1) < 0.5 && (compositedLuminance[i] ?? 1) > 0.85) {
      coveredInkPixelCount += 1;
    }
  }

  return {
    width,
    height,
    compositedLuminance,
    pigmentRidgeHeightMap,
    coveredInkPixelCount,
    dropletCount: totalDroplets,
    serverCostKrw: 0,
  };
}
