/**
 * SHAPER 2×2 4컷 종합 캐릭터 설정시트(전신 정면 · 전신 35° 반측면 · 상반신 바스트컷 · 얼굴 클로즈업)
 * 투명 PNG 격자 합성 내보내기.
 */
import { DEFAULT_FRAMING, failVisible, isLabFailure } from "../contracts";

import { MAX_PNG_EXPORT_DIMENSION, MAX_SETTLE_STEPS, MIN_EXPORT_DIMENSION, exportFileName } from "./export-session";
import { PNG_MIME, encodePng } from "./png-encoder";

import type { ExportDeps, ExportOutcome } from "./export-session";
import type { CameraFraming, CapturedRaster, CharacterEngine, LabFailure } from "../contracts";

export interface QuadSheetPanelSpec {
  readonly id: "front-full" | "quarter-full" | "bust-cut" | "face-closeup";
  readonly labelKo: string;
  readonly camera: CameraFraming;
}

export const QUAD_SHEET_PANEL_SPECS: readonly [
  QuadSheetPanelSpec,
  QuadSheetPanelSpec,
  QuadSheetPanelSpec,
  QuadSheetPanelSpec,
] = Object.freeze([
  { id: "front-full", labelKo: "전신 0° 정면", camera: { ...DEFAULT_FRAMING, mode: "full-body", yawDeg: 0, pitchDeg: 0, distanceScale: 1 } },
  { id: "quarter-full", labelKo: "전신 35° 반측면", camera: { ...DEFAULT_FRAMING, mode: "full-body", yawDeg: 35, pitchDeg: 0, distanceScale: 1 } },
  { id: "bust-cut", labelKo: "상반신 바스트컷", camera: { ...DEFAULT_FRAMING, mode: "bust", yawDeg: -15, pitchDeg: 0, distanceScale: 1 } },
  { id: "face-closeup", labelKo: "얼굴 클로즈업", camera: { ...DEFAULT_FRAMING, mode: "face", yawDeg: 10, pitchDeg: -6, distanceScale: 1 } },
]);

export interface ExportQuadReferenceSheetOptions {
  /** 2×2 격자의 셀 1칸 너비(px). 전체 시트 너비 = cellWidth × 2 (최대 4096px) */
  readonly cellWidth: number;
  /** 2×2 격자의 셀 1칸 높이(px). 전체 시트 높이 = cellHeight × 2 (최대 4096px) */
  readonly cellHeight: number;
  readonly settleSteps?: number;
}

const defaultNow = (): number => Date.now();

function toFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

/** 요청 해상도에서 2×2 종합 시트(총 폭·높이 ≤ 4096px)에 들어가는 안전한 셀 크기를 계산한다. */
export function clampQuadSheetCellSize(
  width: number,
  height: number,
): { readonly cellWidth: number; readonly cellHeight: number } {
  const maxCellDim = Math.floor(MAX_PNG_EXPORT_DIMENSION / 2);
  const safeW = Number.isFinite(width) ? Math.min(maxCellDim, Math.max(MIN_EXPORT_DIMENSION, Math.floor(width))) : 512;
  const safeH = Number.isFinite(height) ? Math.min(maxCellDim, Math.max(MIN_EXPORT_DIMENSION, Math.floor(height))) : 512;
  return { cellWidth: safeW, cellHeight: safeH };
}

/** 동일한 크기를 가진 4개의 래스터(좌상·우상·좌하·우하)를 2×2 단일 top-down RGBA8 래스터로 합성한다. */
export function stitchGrid2x2Rasters(
  cells: readonly [CapturedRaster, CapturedRaster, CapturedRaster, CapturedRaster],
): CapturedRaster {
  const [tl, tr, bl, br] = cells;
  const w = tl.width;
  const h = tl.height;
  for (const cell of [tr, bl, br]) {
    if (cell.width !== w || cell.height !== h) {
      throw new Error(`2×2 셀 크기(${cell.width}×${cell.height})가 기준 셀(${w}×${h})과 다릅니다.`);
    }
  }
  const totalWidth = w * 2;
  const totalHeight = h * 2;
  const out = new Uint8ClampedArray(totalWidth * totalHeight * 4);
  const rowBytes = w * 4;

  const copyCell = (cell: CapturedRaster, colIndex: 0 | 1, rowIndex: 0 | 1): void => {
    const baseX = colIndex * w;
    const baseY = rowIndex * h;
    for (let y = 0; y < h; y += 1) {
      const srcStart = y * rowBytes;
      const dstStart = ((baseY + y) * totalWidth + baseX) * 4;
      out.set(cell.rgba.subarray(srcStart, srcStart + rowBytes), dstStart);
    }
  };

  copyCell(tl, 0, 0);
  copyCell(tr, 1, 0);
  copyCell(bl, 0, 1);
  copyCell(br, 1, 1);

  return { width: totalWidth, height: totalHeight, rgba: out };
}

/**
 * 전신 정면 · 전신 35° 반측면 · 상반신 바스트컷 · 얼굴 클로즈업을 2×2 격자 한 장의 투명 PNG로 내보낸다.
 */
export async function exportQuadReferenceSheetPng(
  engine: CharacterEngine,
  options: ExportQuadReferenceSheetOptions,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const { cellWidth, cellHeight } = options;
  const totalWidth = cellWidth * 2;
  const totalHeight = cellHeight * 2;

  if (
    !Number.isInteger(cellWidth) ||
    !Number.isInteger(cellHeight) ||
    cellWidth < MIN_EXPORT_DIMENSION ||
    cellHeight < MIN_EXPORT_DIMENSION ||
    totalWidth > MAX_PNG_EXPORT_DIMENSION ||
    totalHeight > MAX_PNG_EXPORT_DIMENSION
  ) {
    return {
      ok: false,
      failure: failVisible(
        "export-quad-sheet-size",
        `2×2 종합 설정시트 크기(${totalWidth}×${totalHeight}px, 셀당 ${cellWidth}×${cellHeight}px)가 허용 범위(${MIN_EXPORT_DIMENSION}..${MAX_PNG_EXPORT_DIMENSION}px)를 벗어납니다.`,
        undefined,
        started,
      ),
    };
  }

  const settleSteps = Math.min(MAX_SETTLE_STEPS, Math.max(0, Math.floor(options.settleSteps ?? 0)));
  if (settleSteps > 0) {
    try {
      await engine.settle(settleSteps);
    } catch (error) {
      return { ok: false, failure: toFailure("export-settle", "2×2 설정시트 캡처 전 물리 settle에 실패했습니다.", error, started) };
    }
  }

  const capturedCells: CapturedRaster[] = [];
  let lastProvenance = undefined;

  for (const spec of QUAD_SHEET_PANEL_SPECS) {
    try {
      const captured = await engine.renderPasses({
        width: cellWidth,
        height: cellHeight,
        passes: ["lit"],
        transparentBackground: true,
        settleSteps: 0,
        camera: spec.camera,
      });
      if (captured.width !== cellWidth || captured.height !== cellHeight) {
        return {
          ok: false,
          failure: failVisible(
            "export-capture-size",
            `엔진이 셀 크기 ${cellWidth}×${cellHeight} 대신 ${captured.width}×${captured.height}를 반환했습니다.`,
            undefined,
            started,
          ),
        };
      }
      const lit = captured.passes.lit;
      if (!lit) {
        return { ok: false, failure: failVisible("export-missing-lit", `${spec.labelKo} 캡처에 lit 패스가 없습니다.`, undefined, started) };
      }
      capturedCells.push(lit);
      lastProvenance = captured.provenance;
    } catch (error) {
      return { ok: false, failure: toFailure("export-capture", `2×2 종합 설정시트(${spec.labelKo}) 캡처에 실패했습니다.`, error, started) };
    }
  }

  const [tl, tr, bl, br] = capturedCells;
  if (!tl || !tr || !bl || !br || !lastProvenance) {
    return { ok: false, failure: failVisible("export-missing-lit", "2×2 종합 설정시트 캡처 결과가 비어 있습니다.", undefined, started) };
  }

  try {
    const stitched = stitchGrid2x2Rasters([tl, tr, bl, br]);
    const bytes = await encodePng(stitched, { filter: "adaptive" });
    const baseName = exportFileName("png", lastProvenance.recipeDigest, stitched.width, stitched.height);
    const fileName = baseName.replace(/\.png$/u, "-quad-sheet.png");
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "png",
        fileName,
        mime: PNG_MIME,
        bytes: bytes.length,
        width: stitched.width,
        height: stitched.height,
        settleSteps,
        provenance: lastProvenance,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return { ok: false, failure: toFailure("export-png-encode", "2×2 종합 설정시트 PNG 인코딩에 실패했습니다.", error, started) };
  }
}
