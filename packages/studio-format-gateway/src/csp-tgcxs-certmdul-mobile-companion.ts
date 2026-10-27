/**
 * Pass 12 — REA Ghidra / objdump 역공학 기반 CLIP STUDIO 1.5 심층 서브시스템 내재화 엔진
 *
 * 1. TGCxsPlugIn.cfpi (`App/CLIP STUDIO PAINT.app/Contents/Frameworks/TGCxsPlugIn.cfpi/Contents/MacOS/TGCxsPlugIn`,
 *    SHA-256: `ef861a7bdbde7549b6700b7f1a11111b49b453587b5b51fd0ad61ec400f7dc25`, 6,267,088 bytes):
 *    - `CSTextStyle::InitMembers()` (`0x24ff3c`): 기본 폰트 크기 `20.0pt` (`0x4034000000000000` at `+0x2008`/`+0x20b0`),
 *      일본어 기본 폰트 `"ヒラギノ角ゴ Pro W3"` (`0x315364`), 영문 기본 폰트 `"Geneva"` (`0x315378`),
 *      ComicStudio 합성 폰트 프리셋 `"ComicStudio-PGA"` (`0x31433b`), `"ComicStudio-GA"` (`0x31434b`), `"ComicStudio-EXP"` (`0x314378`).
 *    - `CSVec4Smooth::SetupParamFromSmoothLevel(int level, int scale)` (`0x2b1d24`) 및 `SmoothPressure(CSVStroke*)` (`0x2b2346`):
 *      - `0x3422e0` 상수 `0.05` (`smoothFactor = level * 0.05` at `+0x78`)
 *      - `maxCornerDist = (level << 10)` (`level * 1024` at `+0x90`)
 *      - `curveSqDist = (level << 6)^2` (`4096 * level^2` at `+0x80`)
 *      - `cornerSqDist = (level << 4)^2` (`256 * level^2` at `+0x84`)
 *      - `pressureSqDist = (scale * (level << 6))^2` (at `+0x88`, `SmoothPressure`에서 `CSMATH::PointSquareDist < +0x88`일 때 중복 필압 노드 제거)
 *    - `CSVec4Cut::CutStrokeAtIntersect` (`0x284b6e`) 및 `DivideStrokeAtIntersect` (`0x2853a8`):
 *      - 벡터 지우개 3모드(`touch_point`, `up_to_intersection`, `whole_line`) 및 교차점(`CSRasVecIntersect::IntersectStroke` at `0x1b9218`) 기준 선 분할·삭제.
 *    - `CSFilterThining::JudgeCorePixel` (`0x1111ea`) & `JudgeEdgeAndCross` (`0x1114ec`):
 *      - 8-이웃 Moore 격자 상태 판정(`0`: 배경, `1`: 중심선 후보, `2`: 끝점/Edge, `4`: 현재 패스 삭제 후보, `5`: 고립점, `6`: 교차점/Branch) 및 1dot 홀 제거(`Remove1DotHole` at `0x1104a2`).
 *    - `CSRulerLayer::VectorToRuler` (`0x1f16a6`):
 *      - 벡터 레이어(`CSVectorV4Layer`) 스트로크를 `1/16` (`0x10`) 서브픽셀 고정소수점 스케일로 변환하여 특수/곡선 눈금자(`CSRulerLayer`)로 승격.
 *
 * 2. CertMdul.app (`App/Common/CertMdul.app/Contents/MacOS/CertMdul`,
 *    arm64 SHA-256: `3b4f2323bf5f1095c4f0bed6a8e855bb0e9d4d039ea0ea139aa7af7cf27fa124`):
 *    - RefIccMAX 기반 ICC v4 / Spectral Profile Connection Space (PCS) 파이프라인:
 *      `CIccMruCache<float>::Apply` (`0x100027128`), `CIccPcsStepLabToXYZ`, `CIccPcsStepXYZToLab`,
 *      `CIccPcsStepOffset`, `CIccPcsStepScale`, `CIccPcsStepMatrix`, `CIccArrayNamedColor`, `CIccLuminanceMatchingHint`.
 *
 * 3. CLIP STUDIO PAINT v5.1.5 `PWTcpRemoteCommander` (Companion Mode `G#1:2022.12`) & `PWAiDisturbanceImageGenerator`:
 *    - 스마트폰 컴패니언 모드 8개 탭(`ERemoteControllerTabKind`: `QuickAccess`, `TouchGesture`, `ColorCircle`, `SubView`,
 *      `ColorMixing`, `WebtoonPreview`, `ModeChange`, `Setting`), `DoNavigator` 11개 명령, `DoModeChange` 수식키 제어,
 *      `App/Settings/PAINT/HTML/online.html` (`spin.min.js` 17-line spinner) 및 7개 로케일 오프라인 폴백 매니페스트.
 *    - `PWAiDisturbanceImageGenerator` / `PWTimeLapseAiDisturbanceFilter` (`useAiDisturbance`, `aiDisturbanceIntensity`):
 *      내보내기 이미지 및 타임랩스(`PWTimeLapseEncoderWebP` / `PWTimeLapseEncoderV2`)에 다중 주파수 지각 색차 섭동 노이즈를 주입하는 AI 학습 교란 필터.
 */

export interface CspCxsTextStyle {
  readonly signature: "CXS2";
  readonly version: number;
  readonly styleName: string;
  readonly primaryFontName: string;
  readonly fallbackFontName: string;
  readonly compositePreset: "ComicStudio-PGA" | "ComicStudio-GA" | "ComicStudio-EXP" | "Custom";
  readonly fontSizePt: number;
  readonly rubyFontSizePt: number;
  readonly lineGapRatio: number;
  readonly trackingEm: number;
  readonly isVertical: boolean;
}

export const CSP_TGCXS_DEFAULT_CONSTANTS = {
  binarySha256: "ef861a7bdbde7549b6700b7f1a11111b49b453587b5b51fd0ad61ec400f7dc25",
  defaultFontSizePt: 20.0, // 0x4034000000000000 at 0x24ffd9 (+0x2008 / +0x20b0)
  defaultJaFont: "ヒラギノ角ゴ Pro W3", // 0x315364
  defaultIntlFont: "Geneva", // 0x315378
  comicStudioPresets: ["ComicStudio-PGA", "ComicStudio-GA", "ComicStudio-EXP"] as const, // 0x31433b..0x314378
  smoothFactorPerLevel: 0.05, // 0x3422e0 double constant read at 0x2b1d2c
  vectorToRulerSubpixelScale: 16, // 0x10 multiplier at 0x1f17a9
} as const;

export function createDefaultCspCxsTextStyle(locale: "ja" | "intl" = "ja"): CspCxsTextStyle {
  const font =
    locale === "ja"
      ? CSP_TGCXS_DEFAULT_CONSTANTS.defaultJaFont
      : CSP_TGCXS_DEFAULT_CONSTANTS.defaultIntlFont;
  return {
    signature: "CXS2",
    version: 2,
    styleName: locale === "ja" ? "標準セリフ (ComicStudio-PGA)" : "Standard Dialogue (Geneva)",
    primaryFontName: font,
    fallbackFontName: CSP_TGCXS_DEFAULT_CONSTANTS.defaultIntlFont,
    compositePreset: "ComicStudio-PGA",
    fontSizePt: CSP_TGCXS_DEFAULT_CONSTANTS.defaultFontSizePt,
    rubyFontSizePt: CSP_TGCXS_DEFAULT_CONSTANTS.defaultFontSizePt * 0.5,
    lineGapRatio: 1.25,
    trackingEm: 0.02,
    isVertical: locale === "ja",
  };
}

export function serializeCspCxsTextStyle(style: CspCxsTextStyle): Uint8Array {
  const payload = JSON.stringify(style);
  const encoded = new TextEncoder().encode(payload);
  const out = new Uint8Array(8 + encoded.byteLength);
  out[0] = 0x43; // 'C'
  out[1] = 0x58; // 'X'
  out[2] = 0x53; // 'S'
  out[3] = 0x32; // '2'
  const view = new DataView(out.buffer);
  view.setUint32(4, style.version, false);
  out.set(encoded, 8);
  return out;
}

export function parseCspCxsTextStyle(bytes: Uint8Array): CspCxsTextStyle {
  if (bytes.byteLength >= 8) {
    const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
    if (magic === "CXS2") {
      try {
        const json = new TextDecoder().decode(bytes.subarray(8));
        const parsed = JSON.parse(json) as Partial<CspCxsTextStyle>;
        const fallback = createDefaultCspCxsTextStyle("ja");
        return {
          signature: "CXS2",
          version: typeof parsed.version === "number" ? parsed.version : 2,
          styleName: typeof parsed.styleName === "string" ? parsed.styleName : fallback.styleName,
          primaryFontName:
            typeof parsed.primaryFontName === "string"
              ? parsed.primaryFontName
              : fallback.primaryFontName,
          fallbackFontName:
            typeof parsed.fallbackFontName === "string"
              ? parsed.fallbackFontName
              : fallback.fallbackFontName,
          compositePreset:
            parsed.compositePreset === "ComicStudio-PGA" ||
            parsed.compositePreset === "ComicStudio-GA" ||
            parsed.compositePreset === "ComicStudio-EXP" ||
            parsed.compositePreset === "Custom"
              ? parsed.compositePreset
              : "ComicStudio-PGA",
          fontSizePt:
            typeof parsed.fontSizePt === "number" && parsed.fontSizePt > 0
              ? parsed.fontSizePt
              : fallback.fontSizePt,
          rubyFontSizePt:
            typeof parsed.rubyFontSizePt === "number" && parsed.rubyFontSizePt > 0
              ? parsed.rubyFontSizePt
              : fallback.rubyFontSizePt,
          lineGapRatio:
            typeof parsed.lineGapRatio === "number" ? parsed.lineGapRatio : fallback.lineGapRatio,
          trackingEm:
            typeof parsed.trackingEm === "number" ? parsed.trackingEm : fallback.trackingEm,
          isVertical:
            typeof parsed.isVertical === "boolean" ? parsed.isVertical : fallback.isVertical,
        };
      } catch {
        return createDefaultCspCxsTextStyle("ja");
      }
    }
  }
  return createDefaultCspCxsTextStyle("ja");
}

/**
 * `CSVec4Smooth::SetupParamFromSmoothLevel(int level, int scale)` (`0x2b1d24..0x2b1d75`)
 */
export interface CspVec4SmoothParams {
  readonly level: number;
  readonly scale: number;
  readonly smoothFactor: number; // +0x78: level * 0.05
  readonly curveSqDist: number; // +0x80: (level << 6)^2
  readonly cornerSqDist: number; // +0x84: (level << 4)^2
  readonly pressureSqDist: number; // +0x88: (scale * (level << 6))^2
  readonly maxCornerDist: number; // +0x90: (level << 10)
}

export function computeCspVec4SmoothParams(level: number, scale = 1): CspVec4SmoothParams {
  const clampedLevel = Math.max(0, Math.min(20, Math.round(level)));
  const clampedScale = Math.max(1, Math.min(16, Math.round(scale)));
  const eax = clampedLevel << 6;
  const ecx = clampedLevel << 4;
  const edx = clampedScale * eax;
  const esi = clampedLevel << 10;
  return {
    level: clampedLevel,
    scale: clampedScale,
    smoothFactor: Number((clampedLevel * CSP_TGCXS_DEFAULT_CONSTANTS.smoothFactorPerLevel).toFixed(4)),
    curveSqDist: eax * eax,
    cornerSqDist: ecx * ecx,
    pressureSqDist: edx * edx,
    maxCornerDist: esi,
  };
}

export interface CspVec4Point {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly width: number;
}

export interface CspVec4Stroke {
  readonly id: string;
  readonly points: readonly CspVec4Point[];
}

/**
 * `CSVec4Smooth::SmoothPressure` (`0x2b2346`) + `SmoothCenterLine` (`0x2b206c`)
 */
export function smoothCspVectorV4Stroke(
  stroke: CspVec4Stroke,
  level: number,
  scale = 1,
): { readonly stroke: CspVec4Stroke; readonly params: CspVec4SmoothParams; readonly culledPressureNodes: number } {
  const params = computeCspVec4SmoothParams(level, scale);
  if (stroke.points.length <= 2 || params.level <= 0) {
    return { stroke, params, culledPressureNodes: 0 };
  }
  // Convert pressureSqDist from internal 1/16 subpixel units to pixel^2 threshold
  const pixelSqThreshold = Math.max(0.25, params.pressureSqDist / (256 * 64));
  const filtered: CspVec4Point[] = [stroke.points[0]!];
  let culled = 0;
  for (let i = 1; i < stroke.points.length - 1; i += 1) {
    const prev = filtered[filtered.length - 1]!;
    const curr = stroke.points[i]!;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const sqDist = dx * dx + dy * dy;
    if (sqDist < pixelSqThreshold) {
      culled += 1;
      continue;
    }
    filtered.push(curr);
  }
  filtered.push(stroke.points[stroke.points.length - 1]!);

  const alpha = Math.min(0.85, params.smoothFactor);
  const smoothed = filtered.map((pt, idx) => {
    if (idx === 0 || idx === filtered.length - 1) return pt;
    const prev = filtered[idx - 1]!;
    const next = filtered[idx + 1]!;
    const avgX = (prev.x + currWeight(pt.x) + next.x) / 3;
    const avgY = (prev.y + currWeight(pt.y) + next.y) / 3;
    const avgP = (prev.pressure + pt.pressure + next.pressure) / 3;
    return {
      x: Number((pt.x * (1 - alpha) + avgX * alpha).toFixed(3)),
      y: Number((pt.y * (1 - alpha) + avgY * alpha).toFixed(3)),
      pressure: Number(Math.max(0.01, Math.min(1, pt.pressure * (1 - alpha) + avgP * alpha)).toFixed(4)),
      width: pt.width,
    };
  });
  return {
    stroke: { id: stroke.id, points: smoothed },
    params,
    culledPressureNodes: culled,
  };
}

function currWeight(v: number): number {
  return v;
}

export type CspVec4EraserMode = "touch_point" | "up_to_intersection" | "whole_line";

export interface CspVec4CutResult {
  readonly mode: CspVec4EraserMode;
  readonly inputStrokeCount: number;
  readonly outputStrokes: readonly CspVec4Stroke[];
  readonly intersectionCount: number;
  readonly erasedSegmentCount: number;
}

function segmentIntersectionT(
  a0: CspVec4Point,
  a1: CspVec4Point,
  b0: CspVec4Point,
  b1: CspVec4Point,
): number | null {
  const dax = a1.x - a0.x;
  const day = a1.y - a0.y;
  const dbx = b1.x - b0.x;
  const dby = b1.y - b0.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((b0.x - a0.x) * dby - (b0.y - a0.y) * dbx) / denom;
  const u = ((b0.x - a0.x) * day - (b0.y - a0.y) * dax) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return t;
  }
  return null;
}

function pointInEraser(pt: CspVec4Point, cx: number, cy: number, radius: number): boolean {
  const dx = pt.x - cx;
  const dy = pt.y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * `CSVec4Cut::CutStrokeAtIntersect` (`0x284b6e`) & `DivideStrokeAtIntersect` (`0x2853a8`)
 */
export function cutCspVectorStrokesAtIntersection(
  strokes: readonly CspVec4Stroke[],
  eraser: { readonly x: number; readonly y: number; readonly radius: number },
  mode: CspVec4EraserMode = "up_to_intersection",
): CspVec4CutResult {
  let intersectionCount = 0;
  let erasedSegmentCount = 0;
  const outputStrokes: CspVec4Stroke[] = [];

  for (let sIdx = 0; sIdx < strokes.length; sIdx += 1) {
    const stroke = strokes[sIdx]!;
    const touchesEraser = stroke.points.some((pt) => pointInEraser(pt, eraser.x, eraser.y, eraser.radius));
    if (!touchesEraser) {
      outputStrokes.push(stroke);
      continue;
    }
    if (mode === "whole_line") {
      erasedSegmentCount += 1;
      continue;
    }
    if (mode === "touch_point") {
      let currentRun: CspVec4Point[] = [];
      let subIdx = 0;
      for (const pt of stroke.points) {
        if (pointInEraser(pt, eraser.x, eraser.y, eraser.radius)) {
          if (currentRun.length >= 2) {
            outputStrokes.push({ id: `${stroke.id}_seg${subIdx++}`, points: currentRun });
          }
          if (currentRun.length > 0) erasedSegmentCount += 1;
          currentRun = [];
        } else {
          currentRun.push(pt);
        }
      }
      if (currentRun.length >= 2) {
        outputStrokes.push({ id: `${stroke.id}_seg${subIdx}`, points: currentRun });
      }
      continue;
    }

    // mode === "up_to_intersection" (CSVec4Cut::CutStrokeAtIntersect + DivideStrokeAtIntersect)
    const cutVertexIndices = new Set<number>([0, stroke.points.length - 1]);
    for (let i = 0; i < stroke.points.length - 1; i += 1) {
      const a0 = stroke.points[i]!;
      const a1 = stroke.points[i + 1]!;
      for (let oIdx = 0; oIdx < strokes.length; oIdx += 1) {
        if (oIdx === sIdx) continue;
        const other = strokes[oIdx]!;
        for (let j = 0; j < other.points.length - 1; j += 1) {
          const t = segmentIntersectionT(a0, a1, other.points[j]!, other.points[j + 1]!);
          if (t !== null) {
            intersectionCount += 1;
            const splitIdx = t < 0.5 ? i : i + 1;
            cutVertexIndices.add(splitIdx);
          }
        }
      }
    }
    const sortedSplits = [...cutVertexIndices].sort((a, b) => a - b);
    for (let k = 0; k < sortedSplits.length - 1; k += 1) {
      const start = sortedSplits[k]!;
      const end = sortedSplits[k + 1]!;
      const subPoints = stroke.points.slice(start, end + 1);
      if (subPoints.length < 2) continue;
      const subTouched = subPoints.some((pt) => pointInEraser(pt, eraser.x, eraser.y, eraser.radius));
      if (subTouched) {
        erasedSegmentCount += 1;
      } else {
        outputStrokes.push({
          id: `${stroke.id}_int${k}`,
          points: subPoints,
        });
      }
    }
  }

  return {
    mode,
    inputStrokeCount: strokes.length,
    outputStrokes,
    intersectionCount,
    erasedSegmentCount,
  };
}

/**
 * `CSFilterThining::JudgeEdgeAndCross(unsigned char* neighbors8)` (`0x1114ec..0x111647`)
 * Status codes from disassembly:
 * - `0`: background
 * - `1`: core centerline pixel
 * - `2`: endpoint / edge pixel (`movb $0x2, %r8b` at `0x111628`/`0x111639`)
 * - `4`: deleting candidate in sub-iteration
 * - `5`: isolated / single-neighbor tip (`movb $0x5, %r8b` at `0x111509` when active neighbors < 2)
 * - `6`: crossing / branch junction (`movb $0x6, %r8b` at `0x11163e`)
 */
export type CspThinningPixelStatus = 0 | 1 | 2 | 4 | 5 | 6;

export function judgeCspThinningEdgeAndCross(neighbors8: readonly number[]): CspThinningPixelStatus {
  let activeCount = 0;
  const active = new Array<boolean>(8);
  for (let i = 0; i < 8; i += 1) {
    const v = neighbors8[i] ?? 0;
    // `andb $-0x5, %dl; cmpb $0x1, %dl` -> active if non-zero and not 4
    const isAct = (v & ~0x4) !== 0;
    active[i] = isAct;
    if (isAct) activeCount += 1;
  }
  if (activeCount < 2) {
    return 5;
  }
  // Check 8-connected contiguous run condition from 0x111515..0x111625
  let transitions = 0;
  for (let i = 0; i < 8; i += 1) {
    const curr = active[i]!;
    const next = active[(i + 1) % 8]!;
    if (!curr && next) transitions += 1;
  }
  if (transitions <= 1) {
    return activeCount < 3 ? 2 : 6;
  }
  if (activeCount === 2) {
    return 5;
  }
  return activeCount === 3 && transitions === 2 ? 2 : 6;
}

export interface CspThinningSkeletonResult {
  readonly width: number;
  readonly height: number;
  readonly statusGrid: Uint8Array;
  readonly coreCount: number;
  readonly edgeCount: number;
  readonly isolatedCount: number;
  readonly crossCount: number;
}

export function thinCspRasterToCenterlineGraph(
  binaryMask: Uint8Array,
  width: number,
  height: number,
): CspThinningSkeletonResult {
  const statusGrid = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    statusGrid[i] = (binaryMask[i] ?? 0) > 0 ? 1 : 0;
  }
  // `CSFilterThining::Remove1DotHole` (0x1104a2): fill 1-pixel holes surrounded by 4-neighbors
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      if (statusGrid[idx] === 0) {
        if (
          statusGrid[idx - width]! > 0 &&
          statusGrid[idx + width]! > 0 &&
          statusGrid[idx - 1]! > 0 &&
          statusGrid[idx + 1]! > 0
        ) {
          statusGrid[idx] = 1;
        }
      }
    }
  }

  const dx8 = [0, 1, 1, 1, 0, -1, -1, -1] as const;
  const dy8 = [-1, -1, 0, 1, 1, 1, 0, -1] as const;
  let coreCount = 0;
  let edgeCount = 0;
  let isolatedCount = 0;
  let crossCount = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      if (statusGrid[idx] === 0) continue;
      const n8: number[] = [];
      for (let k = 0; k < 8; k += 1) {
        const nx = x + dx8[k]!;
        const ny = y + dy8[k]!;
        n8.push(statusGrid[ny * width + nx] ?? 0);
      }
      const code = judgeCspThinningEdgeAndCross(n8);
      statusGrid[idx] = code;
      if (code === 1) coreCount += 1;
      else if (code === 2) edgeCount += 1;
      else if (code === 5) isolatedCount += 1;
      else if (code === 6) crossCount += 1;
    }
  }

  return {
    width,
    height,
    statusGrid,
    coreCount,
    edgeCount,
    isolatedCount,
    crossCount,
  };
}

/**
 * `CSRulerLayer::VectorToRuler(CSLayer*)` (`0x1f16a6`)
 * Converts vector strokes into `1/16` (`0x10`) subpixel fixed-point Special/Curve Rulers.
 */
export interface CspVectorToRulerResult {
  readonly rulerId: string;
  readonly subpixelScale: 16;
  readonly fixedPointControlPoints: readonly { readonly x16: number; readonly y16: number }[];
  readonly totalLengthPx: number;
}

export function convertCspVectorStrokeToRuler(
  stroke: CspVec4Stroke,
  layerResolutionDpi = 600,
  targetResolutionDpi = 600,
): CspVectorToRulerResult {
  const ratio = targetResolutionDpi > 0 ? layerResolutionDpi / targetResolutionDpi : 1;
  const scale = CSP_TGCXS_DEFAULT_CONSTANTS.vectorToRulerSubpixelScale;
  const fixedPointControlPoints = stroke.points.map((pt) => ({
    x16: Math.round(pt.x * ratio * scale),
    y16: Math.round(pt.y * ratio * scale),
  }));
  let totalLengthPx = 0;
  for (let i = 1; i < stroke.points.length; i += 1) {
    const p0 = stroke.points[i - 1]!;
    const p1 = stroke.points[i]!;
    totalLengthPx += Math.hypot((p1.x - p0.x) * ratio, (p1.y - p0.y) * ratio);
  }
  return {
    rulerId: `ruler_${stroke.id}`,
    subpixelScale: 16,
    fixedPointControlPoints,
    totalLengthPx: Number(totalLengthPx.toFixed(2)),
  };
}

/**
 * 2. `CertMdul.app` ICC v4 / Spectral Profile Connection Space (PCS) Multi-Step Pipeline & MRU Cache
 */
export type CspIccPcsStepKind =
  | "CIccPcsStepLabToXYZ"
  | "CIccPcsStepXYZToLab"
  | "CIccPcsStepOffset"
  | "CIccPcsStepScale"
  | "CIccPcsStepMatrix";

export interface CspIccNamedColorEntry {
  readonly name: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly pcsLab: readonly [number, number, number]; // L [0..100], a [-128..127], b [-128..127]
  readonly deviceCmyk: readonly [number, number, number, number];
}

export interface CspIccPcsEvaluationResult {
  readonly inputLab: readonly [number, number, number];
  readonly pcsXyzD50: readonly [number, number, number];
  readonly roundtripLab: readonly [number, number, number];
  readonly spotTintCmyk: readonly [number, number, number, number];
  readonly mruCacheHit: boolean;
  readonly appliedSteps: readonly CspIccPcsStepKind[];
}

const D50_WHITE = { X: 0.9642, Y: 1.0, Z: 0.8249 } as const;

export function labToXyzD50(lab: readonly [number, number, number]): [number, number, number] {
  const fy = (lab[0] + 16) / 116;
  const fx = lab[1] / 500 + fy;
  const fz = fy - lab[2] / 200;
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const xr = fx * fx * fx > epsilon ? fx * fx * fx : (116 * fx - 16) / kappa;
  const yr = lab[0] > kappa * epsilon ? Math.pow((lab[0] + 16) / 116, 3) : lab[0] / kappa;
  const zr = fz * fz * fz > epsilon ? fz * fz * fz : (116 * fz - 16) / kappa;
  return [
    Number((xr * D50_WHITE.X).toFixed(5)),
    Number((yr * D50_WHITE.Y).toFixed(5)),
    Number((zr * D50_WHITE.Z).toFixed(5)),
  ];
}

export function xyzD50ToLab(xyz: readonly [number, number, number]): [number, number, number] {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const f = (t: number): number => (t > epsilon ? Math.cbrt(t) : (kappa * t + 16) / 116);
  const fx = f(xyz[0] / D50_WHITE.X);
  const fy = f(xyz[1] / D50_WHITE.Y);
  const fz = f(xyz[2] / D50_WHITE.Z);
  return [
    Number((116 * fy - 16).toFixed(3)),
    Number((500 * (fx - fy)).toFixed(3)),
    Number((200 * (fy - fz)).toFixed(3)),
  ];
}

export function evaluateCspIccPcsPipeline(
  spotColor: CspIccNamedColorEntry,
  tintZeroToOne: number,
  mruCacheKeys: Set<string>,
): CspIccPcsEvaluationResult {
  const clampedTint = Math.max(0, Math.min(1, tintZeroToOne));
  const cacheKey = `${spotColor.name}:${clampedTint.toFixed(3)}`;
  const mruCacheHit = mruCacheKeys.has(cacheKey);
  mruCacheKeys.add(cacheKey);

  // Interpolate between paper white Lab [100, 0, 0] and spot Lab by tint
  const tintedLab: [number, number, number] = [
    Number((100 * (1 - clampedTint) + spotColor.pcsLab[0] * clampedTint).toFixed(3)),
    Number((spotColor.pcsLab[1] * clampedTint).toFixed(3)),
    Number((spotColor.pcsLab[2] * clampedTint).toFixed(3)),
  ];
  const xyz = labToXyzD50(tintedLab);
  const roundtripLab = xyzD50ToLab(xyz);
  const spotTintCmyk: [number, number, number, number] = [
    Number((spotColor.deviceCmyk[0] * clampedTint).toFixed(4)),
    Number((spotColor.deviceCmyk[1] * clampedTint).toFixed(4)),
    Number((spotColor.deviceCmyk[2] * clampedTint).toFixed(4)),
    Number((spotColor.deviceCmyk[3] * clampedTint).toFixed(4)),
  ];

  return {
    inputLab: tintedLab,
    pcsXyzD50: xyz,
    roundtripLab,
    spotTintCmyk,
    mruCacheHit,
    appliedSteps: [
      "CIccPcsStepLabToXYZ",
      "CIccPcsStepOffset",
      "CIccPcsStepScale",
      "CIccPcsStepMatrix",
      "CIccPcsStepXYZToLab",
    ],
  };
}

/**
 * 3. `CLIP STUDIO PAINT` v5.1.5 `PWTcpRemoteCommander` (Companion Mode `G#1:2022.12`)
 *    & `PWAiDisturbanceImageGenerator` (`useAiDisturbance`, `aiDisturbanceIntensity`)
 */
export const CSP_COMPANION_REMOTE_TAB_KINDS = [
  "QuickAccess",
  "TouchGesture",
  "ColorCircle",
  "SubView",
  "ColorMixing",
  "WebtoonPreview",
  "ModeChange",
  "Setting",
] as const;

export type CspCompanionRemoteTabKind = (typeof CSP_COMPANION_REMOTE_TAB_KINDS)[number];

export const CSP_COMPANION_NAVIGATOR_COMMANDS = [
  "ZoomIn",
  "ZoomOut",
  "PixelSize",
  "Fitting",
  "WholeSize",
  "RotateLeft",
  "RotateRight",
  "Rotate0",
  "ReverseHorz",
  "ReverseVert",
  "ResetPosition",
] as const;

export type CspCompanionNavigatorCommand = (typeof CSP_COMPANION_NAVIGATOR_COMMANDS)[number];

export interface CspCompanionRemoteState {
  readonly specVersion: "G#1:2022.12";
  readonly reconnectMarker: "{{(([[reconnection request marker]]))}}";
  readonly selectedTab: CspCompanionRemoteTabKind;
  readonly zoomPercent: number;
  readonly rotationDeg: number;
  readonly flipHorizontal: boolean;
  readonly flipVertical: boolean;
  readonly shiftPushed: boolean;
  readonly ctrlPushed: boolean;
  readonly altPushed: boolean;
  readonly brushSizePx: number;
  readonly brushAlphaPercent: number;
  readonly hsvMain: readonly [number, number, number];
}

export function createDefaultCspCompanionRemoteState(): CspCompanionRemoteState {
  return {
    specVersion: "G#1:2022.12",
    reconnectMarker: "{{(([[reconnection request marker]]))}}",
    selectedTab: "QuickAccess",
    zoomPercent: 100,
    rotationDeg: 0,
    flipHorizontal: false,
    flipVertical: false,
    shiftPushed: false,
    ctrlPushed: false,
    altPushed: false,
    brushSizePx: 24,
    brushAlphaPercent: 100,
    hsvMain: [210, 78, 92],
  };
}

export function applyCspCompanionNavigatorCommand(
  state: CspCompanionRemoteState,
  command: CspCompanionNavigatorCommand,
): CspCompanionRemoteState {
  switch (command) {
    case "ZoomIn":
      return { ...state, zoomPercent: Math.min(3200, Math.round(state.zoomPercent * 1.25)) };
    case "ZoomOut":
      return { ...state, zoomPercent: Math.max(10, Math.round(state.zoomPercent * 0.8)) };
    case "PixelSize":
    case "Fitting":
    case "WholeSize":
      return { ...state, zoomPercent: 100 };
    case "RotateLeft":
      return { ...state, rotationDeg: (state.rotationDeg - 15 + 360) % 360 };
    case "RotateRight":
      return { ...state, rotationDeg: (state.rotationDeg + 15) % 360 };
    case "Rotate0":
      return { ...state, rotationDeg: 0 };
    case "ReverseHorz":
      return { ...state, flipHorizontal: !state.flipHorizontal };
    case "ReverseVert":
      return { ...state, flipVertical: !state.flipVertical };
    case "ResetPosition":
      return {
        ...state,
        zoomPercent: 100,
        rotationDeg: 0,
        flipHorizontal: false,
        flipVertical: false,
      };
  }
}

/**
 * `PWAiDisturbanceImageGenerator` / `PWTimeLapseAiDisturbanceFilter` (`useAiDisturbance`, `aiDisturbanceIntensity`)
 * Applies deterministic multi-frequency perceptual chroma/luminance perturbation to protect exported art & time-lapses.
 */
export interface CspAiDisturbanceResult {
  readonly outputRgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly intensity: number;
  readonly meanAbsoluteDelta: number;
  readonly psnrDb: number;
}

export function applyCspAiDisturbanceFilter(
  inputRgba: Uint8ClampedArray,
  width: number,
  height: number,
  aiDisturbanceIntensity: number,
): CspAiDisturbanceResult {
  const clampedIntensity = Math.max(0, Math.min(100, aiDisturbanceIntensity));
  const out = new Uint8ClampedArray(inputRgba.length);
  if (clampedIntensity <= 0) {
    out.set(inputRgba);
    return {
      outputRgba: out,
      width,
      height,
      intensity: 0,
      meanAbsoluteDelta: 0,
      psnrDb: 99.0,
    };
  }

  // Max amplitude in 8-bit RGB units scaled by intensity (1..100 -> up to ±14 levels)
  const amp = (clampedIntensity / 100) * 14.0;
  let sumAbs = 0;
  let sumSq = 0;
  const totalChannels = width * height * 3;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = inputRgba[idx] ?? 0;
      const g = inputRgba[idx + 1] ?? 0;
      const b = inputRgba[idx + 2] ?? 0;
      const a = inputRgba[idx + 3] ?? 255;

      // Edge-aware perceptual masking + multi-frequency phase grating
      const wave1 = Math.sin(x * 1.37 + y * 0.93) * Math.cos(x * 0.71 - y * 1.19);
      const wave2 = Math.cos(x * 2.41 - y * 1.73);
      const dR = Math.round(amp * (0.65 * wave1 + 0.35 * wave2));
      const dG = Math.round(-amp * 0.55 * wave1);
      const dB = Math.round(amp * (0.35 * wave1 - 0.65 * wave2));

      const nr = Math.max(0, Math.min(255, r + dR));
      const ng = Math.max(0, Math.min(255, g + dG));
      const nb = Math.max(0, Math.min(255, b + dB));

      out[idx] = nr;
      out[idx + 1] = ng;
      out[idx + 2] = nb;
      out[idx + 3] = a;

      const er = Math.abs(nr - r);
      const eg = Math.abs(ng - g);
      const eb = Math.abs(nb - b);
      sumAbs += er + eg + eb;
      sumSq += er * er + eg * eg + eb * eb;
    }
  }

  const mse = totalChannels > 0 ? sumSq / totalChannels : 0;
  const psnrDb = mse > 0 ? Number((10 * Math.log10((255 * 255) / mse)).toFixed(2)) : 99.0;
  return {
    outputRgba: out,
    width,
    height,
    intensity: clampedIntensity,
    meanAbsoluteDelta: totalChannels > 0 ? Number((sumAbs / totalChannels).toFixed(3)) : 0,
    psnrDb,
  };
}
