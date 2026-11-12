/**
 * SHAPER 2×2 4컷 종합 캐릭터 설정시트(전신 정면 · 전신 35° 반측면 · 상반신 바스트컷 · 얼굴 클로즈업)
 * 투명 PNG 격자 합성 내보내기.
 *
 * 보장 규약:
 * 1. 종횡비 보존 클램프(`clampQuadSheetCellSize`): 셀 크기가 2048px(시트 총합 4096px)를 넘을 때 가로·세로를 독립 절삭하지 않고
 *    동일 배율로 비례 축소해 `2:3`(웹툰 세로컷), `16:9`, `1:1` 비율 왜곡을 막는다.
 * 2. 잘림 방지 화각 여유(`buildQuadSheetPanels`): T-포즈 양팔 끝·정수리 헤어 볼륨·35° 회전 시 전방 돌출 원근 확대를 고려해
 *    패널별·종횡비별 안전 `distanceScale` 여유를 부여한다.
 * 3. 투명 배경 straight-alpha 정규화(`stitchGrid2x2Rasters`): `alpha === 0` 픽셀의 잔여 RGB 바이트를 0으로 정리한다.
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

/** 기본(1:1 기준) 4패널 안전 프레이밍 명세. T-포즈 손끝·정수리 헤어·전방 원근 돌출이 잘리지 않는 거리 배율을 기본값으로 둔다. */
export const QUAD_SHEET_PANEL_SPECS: readonly [
  QuadSheetPanelSpec,
  QuadSheetPanelSpec,
  QuadSheetPanelSpec,
  QuadSheetPanelSpec,
] = Object.freeze([
  { id: "front-full", labelKo: "전신 0° 정면", camera: { ...DEFAULT_FRAMING, mode: "full-body", yawDeg: 0, pitchDeg: 0, distanceScale: 1.15 } },
  { id: "quarter-full", labelKo: "전신 35° 반측면", camera: { ...DEFAULT_FRAMING, mode: "full-body", yawDeg: 35, pitchDeg: 0, distanceScale: 1.18 } },
  { id: "bust-cut", labelKo: "상반신 바스트컷", camera: { ...DEFAULT_FRAMING, mode: "bust", yawDeg: -15, pitchDeg: 0, distanceScale: 1.24 } },
  { id: "face-closeup", labelKo: "얼굴 클로즈업", camera: { ...DEFAULT_FRAMING, mode: "face", yawDeg: 10, pitchDeg: -6, distanceScale: 1.28 } },
]);

/** 셀 종횡비(`cellWidth / cellHeight`)에 맞춰 극단적인 세로형/가로형 셀에서도 머리·어깨·손끝이 잘리지 않도록 거리 배율을 보정한다. */
export function buildQuadSheetPanels(
  cellWidth: number,
  cellHeight: number,
): readonly [QuadSheetPanelSpec, QuadSheetPanelSpec, QuadSheetPanelSpec, QuadSheetPanelSpec] {
  const safeW = Math.max(1, cellWidth);
  const safeH = Math.max(1, cellHeight);
  const aspect = safeW / safeH;
  // 세로로 매우 좁거나(<0.75) 가로로 매우 넓은(>1.5) 셀에서 회전 돌출부가 가장자리에 닿지 않게 추가 여유(최대 +12%)를 둔다.
  const narrowBoost = aspect < 0.75 ? Math.min(1.12, 1 + (0.75 - aspect) * 0.22) : 1;
  const wideBoost = aspect > 1.5 ? Math.min(1.1, 1 + (aspect - 1.5) * 0.08) : 1;
  const ratioBoost = Number((narrowBoost * wideBoost).toFixed(4));

  const scalePanel = (spec: QuadSheetPanelSpec): QuadSheetPanelSpec => ({
    ...spec,
    camera: {
      ...spec.camera,
      distanceScale: Number((spec.camera.distanceScale * ratioBoost).toFixed(4)),
    },
  });

  return [
    scalePanel(QUAD_SHEET_PANEL_SPECS[0]),
    scalePanel(QUAD_SHEET_PANEL_SPECS[1]),
    scalePanel(QUAD_SHEET_PANEL_SPECS[2]),
    scalePanel(QUAD_SHEET_PANEL_SPECS[3]),
  ];
}

export interface ClampedQuadSheetSize {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly wasScaledDown: boolean;
}

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

/**
 * 요청 해상도에서 2×2 종합 시트(총 폭·높이 ≤ 4096px)에 들어가는 안전한 셀 크기를 종횡비를 유지한 채 계산한다.
 */
export function clampQuadSheetCellSize(width: number, height: number): ClampedQuadSheetSize {
  const maxCellDim = Math.floor(MAX_PNG_EXPORT_DIMENSION / 2);
  const reqW = Number.isFinite(width) ? Math.max(MIN_EXPORT_DIMENSION, Math.floor(width)) : 512;
  const reqH = Number.isFinite(height) ? Math.max(MIN_EXPORT_DIMENSION, Math.floor(height)) : 512;
  if (reqW <= maxCellDim && reqH <= maxCellDim) {
    return { cellWidth: reqW, cellHeight: reqH, wasScaledDown: false };
  }
  const scale = Math.min(maxCellDim / reqW, maxCellDim / reqH);
  const cellWidth = Math.min(maxCellDim, Math.max(MIN_EXPORT_DIMENSION, Math.round(reqW * scale)));
  const cellHeight = Math.min(maxCellDim, Math.max(MIN_EXPORT_DIMENSION, Math.round(reqH * scale)));
  return { cellWidth, cellHeight, wasScaledDown: true };
}

/**
 * 동일한 크기를 가진 4개의 래스터(좌상·우상·좌하·우하)를 2×2 단일 top-down straight-alpha RGBA8 래스터로 합성한다.
 */
export function stitchGrid2x2Rasters(
  cells: readonly [CapturedRaster, CapturedRaster, CapturedRaster, CapturedRaster],
): CapturedRaster {
  const [tl, tr, bl, br] = cells;
  const w = tl.width;
  const h = tl.height;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    throw new Error(`2×2 기준 셀 크기(${w}×${h})가 양의 정수가 아닙니다.`);
  }
  const expectedLen = w * h * 4;
  for (const cell of cells) {
    if (cell.width !== w || cell.height !== h) {
      throw new Error(`2×2 셀 크기(${cell.width}×${cell.height})가 기준 셀(${w}×${h})과 다릅니다.`);
    }
    if (cell.rgba.length !== expectedLen) {
      throw new Error(`2×2 셀 RGBA 바이트 길이(${cell.rgba.length})가 예상 길이(${expectedLen})와 다릅니다.`);
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
      // 투명 배경 straight-alpha 보장: alpha === 0 픽셀의 잔여 RGB를 0으로 정리한다.
      for (let i = dstStart; i < dstStart + rowBytes; i += 4) {
        if (out[i + 3] === 0) {
          out[i] = 0;
          out[i + 1] = 0;
          out[i + 2] = 0;
        }
      }
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
  const maxCellDim = Math.floor(MAX_PNG_EXPORT_DIMENSION / 2);

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
        `2×2 종합 설정시트 크기(${totalWidth}×${totalHeight}px, 셀당 ${cellWidth}×${cellHeight}px)가 허용 범위(셀당 ${MIN_EXPORT_DIMENSION}..${maxCellDim}px, 전체 최대 ${MAX_PNG_EXPORT_DIMENSION}×${MAX_PNG_EXPORT_DIMENSION}px)를 벗어납니다. 해상도를 줄여 다시 시도하세요.`,
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
      return {
        ok: false,
        failure: toFailure(
          "export-settle",
          `2×2 설정시트 캡처 전 물리 settle(${settleSteps}스텝)에 실패했습니다. 물리 settle 스텝을 0으로 낮추거나 물리 설정을 확인하세요.`,
          error,
          started,
        ),
      };
    }
  }

  const panelSpecs = buildQuadSheetPanels(cellWidth, cellHeight);
  const capturedCells: CapturedRaster[] = [];
  let lastProvenance = undefined;
  const expectedCellBytes = cellWidth * cellHeight * 4;

  for (const spec of panelSpecs) {
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
            `2×2 설정시트(${spec.labelKo}) 캡처에서 엔진이 요청 셀 크기 ${cellWidth}×${cellHeight}px 대신 ${captured.width}×${captured.height}px를 반환했습니다. 해상도를 낮추어 다시 시도하세요.`,
            undefined,
            started,
          ),
        };
      }
      const lit = captured.passes.lit;
      if (!lit) {
        return {
          ok: false,
          failure: failVisible(
            "export-missing-lit",
            `2×2 설정시트(${spec.labelKo}) 캡처에 lit 렌더 패스가 없습니다. 렌더 엔진 상태를 확인한 뒤 다시 시도하세요.`,
            undefined,
            started,
          ),
        };
      }
      if (lit.width !== cellWidth || lit.height !== cellHeight || lit.rgba.length !== expectedCellBytes) {
        return {
          ok: false,
          failure: failVisible(
            "export-capture-corrupt",
            `2×2 설정시트(${spec.labelKo}) RGBA 버퍼 크기(${lit.rgba.length} B)가 셀 해상도(${cellWidth}×${cellHeight}px, ${expectedCellBytes} B)와 일치하지 않습니다.`,
            undefined,
            started,
          ),
        };
      }
      capturedCells.push(lit);
      lastProvenance = captured.provenance;
    } catch (error) {
      return {
        ok: false,
        failure: toFailure(
          "export-capture",
          `2×2 종합 설정시트(${spec.labelKo}) 캡처에 실패했습니다. 해상도를 줄이거나 렌더 엔진을 다시 확인하세요.`,
          error,
          started,
        ),
      };
    }
  }

  const [tl, tr, bl, br] = capturedCells;
  if (!tl || !tr || !bl || !br || !lastProvenance) {
    return {
      ok: false,
      failure: failVisible(
        "export-missing-lit",
        "2×2 종합 설정시트 4컷 캡처 결과가 비어 있습니다. 렌더 엔진 상태를 확인하세요.",
        undefined,
        started,
      ),
    };
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
    return {
      ok: false,
      failure: toFailure(
        "export-png-encode",
        "2×2 종합 설정시트 투명 PNG 인코딩에 실패했습니다. 해상도를 낮추어 다시 시도하세요.",
        error,
        started,
      ),
    };
  }
}
