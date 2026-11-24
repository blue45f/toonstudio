/**
 * visual-integrity-oracle-engine.ts
 *
 * 렌더링 파이프라인 시각적 무결성 검증 오라클(Visual Integrity Verification Oracle).
 * 4대 핵심 지표 커널(`visual-integrity-metrics.ts`)을 통합해:
 * - 라이브 프리뷰 vs 커밋 캔버스 패리티 판정(pass/warn/fail) 및 타일 핫스팟 좌표 리포트
 * - 12대 매체 텍스처 무결성 회귀 게이트(입자 질감 보존율 포함)
 * - 실제 RGBA 타일 합성기 및 정상/변조 시나리오 주입기
 * 를 제공한다.
 */

import {
  BRUSH_QUALITY_12_FAMILIES,
  BRUSH_QUALITY_FAMILY_SPECS,
  renderBrushFamilyStampBuffer,
  type BrushQualityDualTextureId,
  type BrushQualityFamilyId,
} from "../drawing/brush-quality-soak-guard";

import {
  assertMatchingBuffers,
  assertValidTileBuffer,
  buildLuminancePlane,
  byteAt,
  clampByte,
  clampNumber,
  computeDeltaEMap,
  computeSsimOnSubrect,
  computeTextureGrainEnergy,
  detectPremultipliedAlphaHalo,
  evaluatePsnrAndPixelError,
  ORACLE_DEFAULT_BACKDROP_RGB,
  ORACLE_HALO_DIP_FAIL_MIN,
  ORACLE_HALO_DIP_WARN_MIN,
  ORACLE_HALO_RATIO_PASS_MAX,
  ORACLE_HALO_RATIO_WARN_MAX,
  summarizeDeltaEMap,
  type AlphaHaloAuditResult,
  type AlphaHaloHotspot,
  type Ciede2000TileResult,
  type PsnrPixelErrorResult,
  type RgbaTileBuffer,
  type SsimResult,
} from "./visual-integrity-metrics";

export {
  computeCiede2000,
  computeSsim,
  computeTextureGrainEnergy,
  detectPremultipliedAlphaHalo,
  evaluateCiede2000Tile,
  evaluatePsnrAndPixelError,
  ORACLE_DEFAULT_BACKDROP_RGB,
  srgbToLab,
  srgbToXyz,
  xyzToLab,
  type AlphaHaloAuditResult,
  type AlphaHaloHotspot,
  type Ciede2000TileResult,
  type LabColor,
  type PsnrPixelErrorResult,
  type RgbaAlphaMode,
  type RgbaTileBuffer,
  type SsimResult,
  type XyzColor,
} from "./visual-integrity-metrics";

export type OracleGateStatus = "pass" | "warn" | "fail";
export type VisualFaultScenarioId =
  | "clean-parity"
  | "premultiplied-alpha-halo"
  | "color-gamut-shift"
  | "texture-grain-blur"
  | "commit-tile-offset";

export interface PixelCoordinateError {
  readonly x: number;
  readonly y: number;
  readonly deltaE: number;
  readonly absDiff: number;
}

export interface TileErrorHotspot {
  readonly tileX: number;
  readonly tileY: number;
  readonly originX: number;
  readonly originY: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly status: OracleGateStatus;
  readonly ssim: number;
  readonly meanDeltaE: number;
  readonly maxDeltaE: number;
  readonly maxAbsDiff: number;
  readonly rmse: number;
  readonly haloPixelCount: number;
  readonly peakErrorPixel: PixelCoordinateError;
}

export interface OracleGateThresholds {
  readonly ssimPassMin: number;
  readonly ssimWarnMin: number;
  readonly meanDeltaEPassMax: number;
  readonly meanDeltaEWarnMax: number;
  readonly p95DeltaEPassMax: number;
  readonly p95DeltaEWarnMax: number;
  readonly psnrPassMinDb: number;
  readonly psnrWarnMinDb: number;
  readonly maxAbsDiffPassMax: number;
  readonly maxAbsDiffWarnMax: number;
  readonly haloRatioPassMax: number;
  readonly haloRatioWarnMax: number;
  readonly haloDipWarnMin: number;
  readonly haloDipFailMin: number;
  readonly grainRetentionPassMin: number;
  readonly grainRetentionWarnMin: number;
}

export interface OracleGateReason {
  readonly metric:
    | "ssim"
    | "ciede2000-mean"
    | "ciede2000-p95"
    | "psnr"
    | "max-abs-diff"
    | "alpha-halo"
    | "texture-grain";
  readonly severity: "warn" | "fail";
  readonly actual: number;
  readonly threshold: number;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface LiveCommittedParityInput {
  readonly livePreview: RgbaTileBuffer;
  readonly committedCanvas: RgbaTileBuffer;
  readonly mediumId?: BrushQualityFamilyId;
  readonly tileGridSize?: number;
  readonly backdropRgb?: readonly [number, number, number];
  readonly thresholds?: Partial<OracleGateThresholds>;
}

export interface LiveCommittedParityReport {
  readonly status: OracleGateStatus;
  readonly width: number;
  readonly height: number;
  readonly mediumId?: BrushQualityFamilyId;
  readonly ssim: SsimResult;
  readonly ciede2000: Ciede2000TileResult;
  readonly psnr: PsnrPixelErrorResult;
  readonly alphaHalo: AlphaHaloAuditResult;
  readonly grainRetentionRatio: number;
  readonly tileGridSize: number;
  readonly tileGridCols: number;
  readonly tileGridRows: number;
  readonly tileHotspots: readonly TileErrorHotspot[];
  readonly flaggedHotspots: readonly TileErrorHotspot[];
  readonly reasons: readonly OracleGateReason[];
  readonly remediationHintsKo: readonly string[];
  readonly remediationHintsEn: readonly string[];
}

export interface Media12Profile {
  readonly familyId: BrushQualityFamilyId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly dualTextureId: BrushQualityDualTextureId;
  readonly paperGrainBite: number;
  readonly pigmentRgb: readonly [number, number, number];
}

export interface MediaIntegrityEntry {
  readonly familyId: BrushQualityFamilyId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly dualTextureId: BrushQualityDualTextureId;
  readonly status: OracleGateStatus;
  readonly audit: LiveCommittedParityReport;
  readonly worstHotspot: TileErrorHotspot | null;
}

export interface Media12RegressionGateOptions {
  readonly tileSize?: number;
  readonly tileGridSize?: number;
  readonly faultScenario?: VisualFaultScenarioId;
  readonly candidateBuffers?: Partial<Record<BrushQualityFamilyId, RgbaTileBuffer>>;
  readonly referenceBuffers?: Partial<Record<BrushQualityFamilyId, RgbaTileBuffer>>;
  readonly thresholds?: Partial<OracleGateThresholds>;
}

export interface Media12RegressionGateReport {
  readonly overallStatus: OracleGateStatus;
  readonly scenarioId: VisualFaultScenarioId;
  readonly tileSize: number;
  readonly passCount: number;
  readonly warnCount: number;
  readonly failCount: number;
  readonly meanSsim: number;
  readonly meanDeltaE: number;
  readonly maxP95DeltaE: number;
  readonly minPsnrDb: number;
  readonly totalHaloPixels: number;
  readonly mediaResults: readonly MediaIntegrityEntry[];
  readonly worstMedia: readonly BrushQualityFamilyId[];
  readonly elapsedMs: number;
}

export const DEFAULT_VISUAL_ORACLE_THRESHOLDS: Readonly<OracleGateThresholds> = Object.freeze({
  ssimPassMin: 0.985,
  ssimWarnMin: 0.95,
  meanDeltaEPassMax: 1.0,
  meanDeltaEWarnMax: 2.3,
  p95DeltaEPassMax: 2.0,
  p95DeltaEWarnMax: 4.5,
  psnrPassMinDb: 38,
  psnrWarnMinDb: 30,
  maxAbsDiffPassMax: 4,
  maxAbsDiffWarnMax: 16,
  haloRatioPassMax: ORACLE_HALO_RATIO_PASS_MAX,
  haloRatioWarnMax: ORACLE_HALO_RATIO_WARN_MAX,
  haloDipWarnMin: ORACLE_HALO_DIP_WARN_MIN,
  haloDipFailMin: ORACLE_HALO_DIP_FAIL_MIN,
  grainRetentionPassMin: 0.88,
  grainRetentionWarnMin: 0.75,
});

const MEDIA_EN_LABELS: Readonly<Record<BrushQualityFamilyId, string>> = Object.freeze({
  crayon: "Wax Crayon",
  pencil: "Graphite Pencil (2B)",
  "g-pen": "G-Pen / Manga Ink",
  charcoal: "Dry Charcoal",
  pastel: "Soft Pastel",
  chalk: "Mineral Chalk",
  watercolor: "Watercolor Wash",
  oil: "Oil Impasto",
  marker: "Alcohol Marker",
  airbrush: "Airbrush",
  spray: "Spray Splatter",
  "sumi-dry-rake": "Sumi Dry Rake",
});

const MEDIA_PIGMENTS_RGB: Readonly<Record<BrushQualityFamilyId, readonly [number, number, number]>> = Object.freeze({
  crayon: [232, 166, 54],
  pencil: [84, 88, 96],
  "g-pen": [24, 28, 36],
  charcoal: [70, 68, 74],
  pastel: [232, 144, 126],
  chalk: [148, 204, 236],
  watercolor: [66, 152, 218],
  oil: [224, 122, 56],
  marker: [236, 178, 66],
  airbrush: [158, 134, 224],
  spray: [216, 78, 96],
  "sumi-dry-rake": [48, 54, 66],
});

export const MEDIA_12_PROFILES: readonly Media12Profile[] = Object.freeze(
  BRUSH_QUALITY_12_FAMILIES.map((familyId) => {
    const spec = BRUSH_QUALITY_FAMILY_SPECS[familyId];
    return Object.freeze({
      familyId,
      labelKo: spec.labelKo,
      labelEn: MEDIA_EN_LABELS[familyId],
      dualTextureId: spec.dualTextureId,
      paperGrainBite: spec.paperGrainBite,
      pigmentRgb: MEDIA_PIGMENTS_RGB[familyId],
    });
  }),
);

function worstStatus(a: OracleGateStatus, b: OracleGateStatus): OracleGateStatus {
  if (a === "fail" || b === "fail") return "fail";
  if (a === "warn" || b === "warn") return "warn";
  return "pass";
}

function buildTileHotspots(
  reference: RgbaTileBuffer,
  candidate: RgbaTileBuffer,
  refLuma: Float64Array,
  candLuma: Float64Array,
  deltaEMap: Float64Array,
  haloHotspots: readonly AlphaHaloHotspot[],
  tileGridSize: number,
  thresholds: OracleGateThresholds,
): Readonly<{ cols: number; rows: number; tiles: readonly TileErrorHotspot[] }> {
  const { width, height } = reference;
  const step = Math.max(4, Math.min(Math.trunc(tileGridSize), Math.max(width, height)));
  const cols = Math.ceil(width / step);
  const rows = Math.ceil(height / step);
  const tiles: TileErrorHotspot[] = [];

  for (let ty = 0; ty < rows; ty += 1) {
    const oy = ty * step;
    const th = Math.min(step, height - oy);
    for (let tx = 0; tx < cols; tx += 1) {
      const ox = tx * step;
      const tw = Math.min(step, width - ox);
      const tileSsim = computeSsimOnSubrect(refLuma, candLuma, width, ox, oy, tw, th, Math.min(8, tw, th));

      let sumDe = 0;
      let maxDe = 0;
      let maxAbs = 0;
      let sumSq = 0;
      let peakX = ox;
      let peakY = oy;
      let peakDe = 0;
      let peakAbs = 0;
      const pixCount = tw * th;

      for (let y = oy; y < oy + th; y += 1) {
        for (let x = ox; x < ox + tw; x += 1) {
          const idx = y * width + x;
          const de = deltaEMap[idx] ?? 0;
          sumDe += de;
          const off = idx * 4;
          const dr = Math.abs(byteAt(reference.data, off) - byteAt(candidate.data, off));
          const dg = Math.abs(byteAt(reference.data, off + 1) - byteAt(candidate.data, off + 1));
          const db = Math.abs(byteAt(reference.data, off + 2) - byteAt(candidate.data, off + 2));
          const da = Math.abs(byteAt(reference.data, off + 3) - byteAt(candidate.data, off + 3));
          sumSq += dr * dr + dg * dg + db * db + da * da;
          const pixMaxAbs = Math.max(dr, dg, db, da);
          if (pixMaxAbs > maxAbs) maxAbs = pixMaxAbs;
          if (de > maxDe) maxDe = de;
          if (de > peakDe || (de === peakDe && pixMaxAbs > peakAbs)) {
            peakDe = de;
            peakAbs = pixMaxAbs;
            peakX = x;
            peakY = y;
          }
        }
      }

      const haloCount = haloHotspots.filter(
        (h) => h.x >= ox && h.x < ox + tw && h.y >= oy && h.y < oy + th,
      ).length;
      const meanDe = pixCount > 0 ? sumDe / pixCount : 0;
      const tileRmse = Math.sqrt(sumSq / Math.max(1, pixCount * 4));

      let tileStatus: OracleGateStatus = "pass";
      if (
        tileSsim.score < thresholds.ssimWarnMin
        || meanDe > thresholds.meanDeltaEWarnMax
        || maxAbs > thresholds.maxAbsDiffWarnMax
        || haloCount >= 3
      ) {
        tileStatus = "fail";
      } else if (
        tileSsim.score < thresholds.ssimPassMin
        || meanDe > thresholds.meanDeltaEPassMax
        || maxAbs > thresholds.maxAbsDiffPassMax
        || haloCount > 0
      ) {
        tileStatus = "warn";
      }

      tiles.push({
        tileX: tx,
        tileY: ty,
        originX: ox,
        originY: oy,
        tileWidth: tw,
        tileHeight: th,
        status: tileStatus,
        ssim: tileSsim.score,
        meanDeltaE: meanDe,
        maxDeltaE: maxDe,
        maxAbsDiff: maxAbs,
        rmse: tileRmse,
        haloPixelCount: haloCount,
        peakErrorPixel: { x: peakX, y: peakY, deltaE: peakDe, absDiff: peakAbs },
      });
    }
  }
  return { cols, rows, tiles };
}

/** ⑤ 라이브 프리뷰 vs 커밋 캔버스 패리티 통합 검증 및 타일 핫스팟 리포트. */
export function evaluateLiveVsCommittedParity(input: LiveCommittedParityInput): LiveCommittedParityReport {
  assertMatchingBuffers(input.livePreview, input.committedCanvas);
  const thresholds: OracleGateThresholds = {
    ...DEFAULT_VISUAL_ORACLE_THRESHOLDS,
    ...input.thresholds,
  };
  const backdrop = input.backdropRgb ?? ORACLE_DEFAULT_BACKDROP_RGB;
  const tileGridSize = input.tileGridSize
    ?? Math.min(16, Math.max(4, Math.min(input.livePreview.width, input.livePreview.height)));

  const refLuma = buildLuminancePlane(input.livePreview, backdrop);
  const candLuma = buildLuminancePlane(input.committedCanvas, backdrop);
  const ssim = computeSsimOnSubrect(
    refLuma,
    candLuma,
    input.livePreview.width,
    0,
    0,
    input.livePreview.width,
    input.livePreview.height,
    8,
  );
  const deltaEMap = computeDeltaEMap(input.livePreview, input.committedCanvas, backdrop);
  const ciede2000 = summarizeDeltaEMap(deltaEMap, input.livePreview.width);
  const psnr = evaluatePsnrAndPixelError(input.livePreview, input.committedCanvas);
  const alphaHalo = detectPremultipliedAlphaHalo(input.committedCanvas, {
    reference: input.livePreview,
    maxHotspots: 24,
    haloRatioPassMax: thresholds.haloRatioPassMax,
    haloRatioWarnMax: thresholds.haloRatioWarnMax,
    haloDipWarnMin: thresholds.haloDipWarnMin,
    haloDipFailMin: thresholds.haloDipFailMin,
  });

  const refGrain = computeTextureGrainEnergy(input.livePreview);
  const candGrain = computeTextureGrainEnergy(input.committedCanvas);
  const grainRetentionRatio = refGrain < 1e-4 ? 1 : candGrain / refGrain;

  const reasons: OracleGateReason[] = [];
  const hintsKo: string[] = [];
  const hintsEn: string[] = [];
  let status: OracleGateStatus = "pass";

  const pushReason = (reason: OracleGateReason): void => {
    status = worstStatus(status, reason.severity);
    reasons.push(reason);
  };

  const checkMin = (
    metric: OracleGateReason["metric"],
    actual: number,
    passMin: number,
    warnMin: number,
    labelKo: string,
    labelEn: string,
    fmt: (v: number) => string,
  ): "pass" | "warn" | "fail" => {
    if (actual < warnMin) {
      pushReason({
        metric, severity: "fail", actual, threshold: warnMin,
        messageKo: `${labelKo} ${fmt(actual)}가 실패 기준(${fmt(warnMin)}) 미만입니다.`,
        messageEn: `${labelEn} ${fmt(actual)} fell below fail threshold (${fmt(warnMin)}).`,
      });
      return "fail";
    }
    if (actual < passMin) {
      pushReason({
        metric, severity: "warn", actual, threshold: passMin,
        messageKo: `${labelKo} ${fmt(actual)}가 통과 기준(${fmt(passMin)}) 미만입니다.`,
        messageEn: `${labelEn} ${fmt(actual)} fell below pass threshold (${fmt(passMin)}).`,
      });
      return "warn";
    }
    return "pass";
  };

  const checkMax = (
    metric: OracleGateReason["metric"],
    actual: number,
    passMax: number,
    warnMax: number,
    labelKo: string,
    labelEn: string,
    fmt: (v: number) => string,
  ): "pass" | "warn" | "fail" => {
    if (actual > warnMax) {
      pushReason({
        metric, severity: "fail", actual, threshold: warnMax,
        messageKo: `${labelKo} ${fmt(actual)}가 허용 상한(${fmt(warnMax)})을 초과했습니다.`,
        messageEn: `${labelEn} ${fmt(actual)} exceeded fail limit (${fmt(warnMax)}).`,
      });
      return "fail";
    }
    if (actual > passMax) {
      pushReason({
        metric, severity: "warn", actual, threshold: passMax,
        messageKo: `${labelKo} ${fmt(actual)}가 경고 기준(${fmt(passMax)})을 넘었습니다.`,
        messageEn: `${labelEn} ${fmt(actual)} exceeded warn limit (${fmt(passMax)}).`,
      });
      return "warn";
    }
    return "pass";
  };

  checkMin("ssim", ssim.score, thresholds.ssimPassMin, thresholds.ssimWarnMin, "SSIM", "SSIM", (v) => v.toFixed(4));
  const meanDeVerdict = checkMax(
    "ciede2000-mean", ciede2000.meanDeltaE, thresholds.meanDeltaEPassMax, thresholds.meanDeltaEWarnMax,
    "평균 CIEDE2000 ΔE", "Mean CIEDE2000 ΔE", (v) => v.toFixed(2),
  );
  if (meanDeVerdict === "fail") {
    hintsKo.push("sRGB/Display-P3 색공간 변환 또는 커밋 경로 색보정 행렬 불일치를 점검하세요.");
    hintsEn.push("Inspect sRGB/Display-P3 conversion or commit-path color matrix mismatch.");
  }
  checkMax(
    "ciede2000-p95", ciede2000.p95DeltaE, thresholds.p95DeltaEPassMax, thresholds.p95DeltaEWarnMax,
    "p95 CIEDE2000 ΔE", "p95 CIEDE2000 ΔE", (v) => v.toFixed(2),
  );
  checkMin("psnr", psnr.psnrDb, thresholds.psnrPassMinDb, thresholds.psnrWarnMinDb, "PSNR", "PSNR", (v) => `${v.toFixed(2)} dB`);
  checkMax(
    "max-abs-diff", psnr.maxAbsDiff, thresholds.maxAbsDiffPassMax, thresholds.maxAbsDiffWarnMax,
    "최대 절대 픽셀 오차", "Max absolute pixel diff", (v) => `${Math.round(v)}`,
  );

  if (alphaHalo.severity === "fail") {
    pushReason({
      metric: "alpha-halo", severity: "fail", actual: alphaHalo.haloPixelRatio, threshold: thresholds.haloRatioWarnMax,
      messageKo: `프리멀티플라이 알파 헤일로 탐지(${alphaHalo.haloPixelCount}px · 최대 휘도 함몰 ${alphaHalo.maxLuminanceDip.toFixed(1)}).`,
      messageEn: `Premultiplied alpha halo detected (${alphaHalo.haloPixelCount}px · max luminance dip ${alphaHalo.maxLuminanceDip.toFixed(1)}).`,
    });
    hintsKo.push("반투명 경계 이중 프리멀티플라이 또는 직선 알파 블러 경로를 프리멀티플라이 합성으로 통일하세요.");
    hintsEn.push("Unify semi-transparent edge blending to prevent double premultiplication or straight-alpha black bleed.");
  } else if (alphaHalo.severity === "warn") {
    pushReason({
      metric: "alpha-halo", severity: "warn", actual: alphaHalo.haloPixelRatio, threshold: thresholds.haloRatioPassMax,
      messageKo: `경계부 약한 알파 어두워짐 경고(${alphaHalo.haloPixelCount}px).`,
      messageEn: `Mild semi-transparent edge darkening warning (${alphaHalo.haloPixelCount}px).`,
    });
  }

  const isTexturedMedium = input.mediumId
    ? BRUSH_QUALITY_FAMILY_SPECS[input.mediumId].paperGrainBite >= 0.45
    : refGrain >= 6;
  if (isTexturedMedium) {
    const grainVerdict = checkMin(
      "texture-grain", grainRetentionRatio, thresholds.grainRetentionPassMin, thresholds.grainRetentionWarnMin,
      "매체 질감 보존율", "Medium grain retention", (v) => `${(v * 100).toFixed(1)}%`,
    );
    if (grainVerdict === "fail") {
      hintsKo.push("커밋 단계 리샘플링/블러 필터가 종이결·브러시 입자를 뭉개지 않는지 확인하세요.");
      hintsEn.push("Check commit-stage resampling or blur filters that attenuate paper tooth and grain.");
    }
  }

  if (ssim.structure < 0.9 && ssim.luminance > 0.96) {
    hintsKo.push("휘도는 유사하나 구조(Structure) 항이 급락했습니다. 라이브·커밋 좌표 오프셋이나 타일 경계 정렬을 확인하세요.");
    hintsEn.push("Luminance matches while SSIM structure dropped sharply. Check live-vs-commit subpixel offset or tile alignment.");
  }

  const grid = buildTileHotspots(
    input.livePreview,
    input.committedCanvas,
    refLuma,
    candLuma,
    deltaEMap,
    alphaHalo.hotspotCoordinates,
    tileGridSize,
    thresholds,
  );
  const flaggedHotspots = grid.tiles
    .filter((t) => t.status !== "pass")
    .sort((a, b) => (b.maxDeltaE - a.maxDeltaE) || (b.maxAbsDiff - a.maxAbsDiff) || (a.ssim - b.ssim));

  return {
    status,
    width: input.livePreview.width,
    height: input.livePreview.height,
    mediumId: input.mediumId,
    ssim,
    ciede2000,
    psnr,
    alphaHalo,
    grainRetentionRatio,
    tileGridSize,
    tileGridCols: grid.cols,
    tileGridRows: grid.rows,
    tileHotspots: grid.tiles,
    flaggedHotspots,
    reasons,
    remediationHintsKo: hintsKo,
    remediationHintsEn: hintsEn,
  };
}

/** 12대 매체 실제 커널 기반 표준 RGBA8 타일 버퍼 생성. */
export function synthesizeMediumRgbaTile(
  familyId: BrushQualityFamilyId,
  options?: Readonly<{
    size?: number;
    pressure01?: number;
    seed?: number;
    pigmentRgb?: readonly [number, number, number];
  }>,
): RgbaTileBuffer {
  const size = Math.max(16, Math.min(128, Math.trunc(options?.size ?? 32)));
  const stamp = renderBrushFamilyStampBuffer({
    familyId,
    size,
    pressure01: options?.pressure01 ?? 0.68,
    velocity01: 0.3,
    tilt01: 0.25,
    directionRadians: 0.35,
    seed: options?.seed ?? 0x2026,
  });
  const pigment = options?.pigmentRgb ?? MEDIA_PIGMENTS_RGB[familyId];
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const a = clampByte((stamp.buffer[i] ?? 0) * 255);
    const off = i * 4;
    if (a > 0) {
      data[off] = pigment[0];
      data[off + 1] = pigment[1];
      data[off + 2] = pigment[2];
      data[off + 3] = a;
    }
  }
  return { width: size, height: size, data, alphaMode: "straight", label: `${familyId}-golden` };
}

/** 실제 RGBA 픽셀 바이트에 검증용 시각 결함 시나리오를 주입한다. */
export function injectVisualFaultScenario(
  reference: RgbaTileBuffer,
  scenarioId: VisualFaultScenarioId,
): RgbaTileBuffer {
  assertValidTileBuffer(reference, "reference");
  const { width, height } = reference;
  const out = new Uint8ClampedArray(reference.data);

  if (scenarioId === "clean-parity") {
    return { width, height, data: out, alphaMode: reference.alphaMode ?? "straight", label: `${reference.label ?? "tile"}-clean` };
  }

  if (scenarioId === "premultiplied-alpha-halo") {
    for (let i = 0; i < width * height; i += 1) {
      const off = i * 4;
      const a = byteAt(out, off + 3);
      if (a > 0 && a < 255) {
        const factor = a / 255;
        out[off] = clampByte(byteAt(out, off) * factor);
        out[off + 1] = clampByte(byteAt(out, off + 1) * factor);
        out[off + 2] = clampByte(byteAt(out, off + 2) * factor);
      }
    }
    return { width, height, data: out, alphaMode: "straight", label: `${reference.label ?? "tile"}-halo` };
  }

  if (scenarioId === "color-gamut-shift") {
    for (let i = 0; i < width * height; i += 1) {
      const off = i * 4;
      if (byteAt(out, off + 3) === 0) continue;
      out[off] = clampByte(byteAt(out, off) * 1.18 + 18);
      out[off + 1] = clampByte(byteAt(out, off + 1) * 0.9);
      out[off + 2] = clampByte(byteAt(out, off + 2) * 0.76);
    }
    return { width, height, data: out, alphaMode: reference.alphaMode ?? "straight", label: `${reference.label ?? "tile"}-gamut-shift` };
  }

  if (scenarioId === "texture-grain-blur") {
    const src = reference.data;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumA = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = clampNumber(y + dy, 0, height - 1);
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = clampNumber(x + dx, 0, width - 1);
            const nOff = (ny * width + nx) * 4;
            const na = byteAt(src, nOff + 3);
            sumR += byteAt(src, nOff) * na;
            sumG += byteAt(src, nOff + 1) * na;
            sumB += byteAt(src, nOff + 2) * na;
            sumA += na;
            count += 1;
          }
        }
        const outOff = (y * width + x) * 4;
        if (sumA > 0) {
          out[outOff] = clampByte(sumR / sumA);
          out[outOff + 1] = clampByte(sumG / sumA);
          out[outOff + 2] = clampByte(sumB / sumA);
          out[outOff + 3] = clampByte(sumA / count);
        } else {
          out[outOff] = 0;
          out[outOff + 1] = 0;
          out[outOff + 2] = 0;
          out[outOff + 3] = 0;
        }
      }
    }
    return { width, height, data: out, alphaMode: "straight", label: `${reference.label ?? "tile"}-blur` };
  }

  // commit-tile-offset: 라이브 프리뷰 대비 커밋 캔버스 우하단 2px 정렬 어긋남
  const shifted = new Uint8ClampedArray(width * height * 4);
  const shiftX = 2;
  const shiftY = 2;
  for (let y = 0; y < height; y += 1) {
    const sy = y - shiftY;
    if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < width; x += 1) {
      const sx = x - shiftX;
      if (sx < 0 || sx >= width) continue;
      const srcOff = (sy * width + sx) * 4;
      const dstOff = (y * width + x) * 4;
      shifted[dstOff] = byteAt(reference.data, srcOff);
      shifted[dstOff + 1] = byteAt(reference.data, srcOff + 1);
      shifted[dstOff + 2] = byteAt(reference.data, srcOff + 2);
      shifted[dstOff + 3] = byteAt(reference.data, srcOff + 3);
    }
  }
  return { width, height, data: shifted, alphaMode: reference.alphaMode ?? "straight", label: `${reference.label ?? "tile"}-offset` };
}

/** ⑤ 12대 매체 텍스처 무결성 회귀 게이트 전수 감사 실행. */
export function evaluate12MediaTextureIntegrityGate(
  options?: Media12RegressionGateOptions,
): Media12RegressionGateReport {
  const started = performance.now();
  const tileSize = Math.max(16, Math.min(128, Math.trunc(options?.tileSize ?? 32)));
  const tileGridSize = options?.tileGridSize ?? Math.max(8, Math.floor(tileSize / 2));
  const scenarioId: VisualFaultScenarioId = options?.faultScenario ?? "clean-parity";

  const mediaResults: MediaIntegrityEntry[] = [];
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  let overallStatus: OracleGateStatus = "pass";
  let sumSsim = 0;
  let sumMeanDeltaE = 0;
  let maxP95DeltaE = 0;
  let minPsnrDb = Number.POSITIVE_INFINITY;
  let totalHaloPixels = 0;

  for (const profile of MEDIA_12_PROFILES) {
    const refBuf = options?.referenceBuffers?.[profile.familyId]
      ?? synthesizeMediumRgbaTile(profile.familyId, { size: tileSize });
    const candBuf = options?.candidateBuffers?.[profile.familyId]
      ?? injectVisualFaultScenario(refBuf, scenarioId);

    const audit = evaluateLiveVsCommittedParity({
      livePreview: refBuf,
      committedCanvas: candBuf,
      mediumId: profile.familyId,
      tileGridSize,
      thresholds: options?.thresholds,
    });

    overallStatus = worstStatus(overallStatus, audit.status);
    if (audit.status === "pass") passCount += 1;
    else if (audit.status === "warn") warnCount += 1;
    else failCount += 1;

    sumSsim += audit.ssim.score;
    sumMeanDeltaE += audit.ciede2000.meanDeltaE;
    if (audit.ciede2000.p95DeltaE > maxP95DeltaE) maxP95DeltaE = audit.ciede2000.p95DeltaE;
    if (audit.psnr.psnrDb < minPsnrDb) minPsnrDb = audit.psnr.psnrDb;
    totalHaloPixels += audit.alphaHalo.haloPixelCount;

    mediaResults.push({
      familyId: profile.familyId,
      labelKo: profile.labelKo,
      labelEn: profile.labelEn,
      dualTextureId: profile.dualTextureId,
      status: audit.status,
      audit,
      worstHotspot: audit.flaggedHotspots[0] ?? audit.tileHotspots[0] ?? null,
    });
  }

  const worstMedia = [...mediaResults]
    .filter((entry) => entry.status !== "pass")
    .sort((a, b) => (a.audit.ssim.score - b.audit.ssim.score) || (b.audit.ciede2000.meanDeltaE - a.audit.ciede2000.meanDeltaE))
    .map((entry) => entry.familyId);

  return {
    overallStatus,
    scenarioId,
    tileSize,
    passCount,
    warnCount,
    failCount,
    meanSsim: sumSsim / MEDIA_12_PROFILES.length,
    meanDeltaE: sumMeanDeltaE / MEDIA_12_PROFILES.length,
    maxP95DeltaE,
    minPsnrDb,
    totalHaloPixels,
    mediaResults,
    worstMedia,
    elapsedMs: Math.max(0, performance.now() - started),
  };
}
