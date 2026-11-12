/**
 * SHAPER 웹툰 캐릭터 4방향 설정표(Turnaround Sheet: 0° 정면 · 35° 반측면 · 90° 측면 · 180° 후면)
 * 투명 PNG 가로 합성 내보내기.
 */
import { DEFAULT_FRAMING, failVisible, isLabFailure } from "../contracts";

import { MAX_PNG_EXPORT_DIMENSION, MAX_SETTLE_STEPS, MIN_EXPORT_DIMENSION, exportFileName } from "./export-session";
import { PNG_MIME, encodePng } from "./png-encoder";

import type { ExportDeps, ExportOutcome } from "./export-session";
import type { CameraFramingMode, CapturedRaster, CharacterEngine, LabFailure } from "../contracts";

export const TURNAROUND_YAW_ANGLES_DEG = [0, 35, 90, 180] as const;

export interface ExportTurnaroundSheetOptions {
  /** 컷 1장당 너비(px). 전체 시트 너비 = panelWidth × 4 (최대 4096px) */
  readonly panelWidth: number;
  /** 시트 높이(px, 최대 4096px) */
  readonly panelHeight: number;
  readonly framingMode?: CameraFramingMode;
  readonly settleSteps?: number;
  /** 4방향 순차 캡처 진행 콜백(1..4, 총 4컷, 현재 각도 라벨) */
  readonly onProgress?: (stepIndex: number, totalSteps: number, labelKo: string) => void;
}

const defaultNow = (): number => Date.now();

function toFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

/** 요청 해상도에서 4방향 가로 시트(총 폭 ≤ 4096px)에 들어가는 안전한 단일 컷 크기를 계산한다. */
export function clampTurnaroundPanelSize(width: number, height: number): { readonly panelWidth: number; readonly panelHeight: number } {
  const maxPanelWidth = Math.floor(MAX_PNG_EXPORT_DIMENSION / TURNAROUND_YAW_ANGLES_DEG.length);
  const safeW = Number.isFinite(width) ? Math.min(maxPanelWidth, Math.max(MIN_EXPORT_DIMENSION, Math.floor(width))) : 512;
  const safeH = Number.isFinite(height) ? Math.min(MAX_PNG_EXPORT_DIMENSION, Math.max(MIN_EXPORT_DIMENSION, Math.floor(height))) : 768;
  return { panelWidth: safeW, panelHeight: safeH };
}

/** 동일한 높이를 가진 래스터 배열을 좌→우 가로 스트립 하나(top-down RGBA8)로 이어 붙인다. */
export function stitchHorizontalRasters(panels: readonly CapturedRaster[]): CapturedRaster {
  const first = panels[0];
  if (!first) {
    throw new Error("합성할 패널 래스터가 비어 있습니다.");
  }
  const height = first.height;
  let totalWidth = 0;
  for (const panel of panels) {
    if (panel.height !== height) {
      throw new Error(`패널 높이(${panel.height})가 기준 높이(${height})와 다릅니다.`);
    }
    totalWidth += panel.width;
  }
  const out = new Uint8ClampedArray(totalWidth * height * 4);
  let offsetX = 0;
  for (const panel of panels) {
    const rowBytes = panel.width * 4;
    for (let y = 0; y < height; y += 1) {
      const srcStart = y * rowBytes;
      const dstStart = (y * totalWidth + offsetX) * 4;
      out.set(panel.rgba.subarray(srcStart, srcStart + rowBytes), dstStart);
    }
    offsetX += panel.width;
  }
  return { width: totalWidth, height, rgba: out };
}

/**
 * 0°·35°·90°·180° 4방향 시점을 연속 캡처해 한 장의 투명 배경 캐릭터 설정표 PNG로 내보낸다.
 */
export async function exportTurnaroundSheetPng(
  engine: CharacterEngine,
  options: ExportTurnaroundSheetOptions,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const { panelWidth, panelHeight } = options;
  const totalWidth = panelWidth * TURNAROUND_YAW_ANGLES_DEG.length;

  if (
    !Number.isInteger(panelWidth) ||
    !Number.isInteger(panelHeight) ||
    panelWidth < MIN_EXPORT_DIMENSION ||
    panelHeight < MIN_EXPORT_DIMENSION ||
    totalWidth > MAX_PNG_EXPORT_DIMENSION ||
    panelHeight > MAX_PNG_EXPORT_DIMENSION
  ) {
    return {
      ok: false,
      failure: failVisible(
        "export-turnaround-size",
        `4방향 설정시트 크기(${totalWidth}×${panelHeight}px, 컷당 ${panelWidth}×${panelHeight}px)가 허용 범위(${MIN_EXPORT_DIMENSION}..${MAX_PNG_EXPORT_DIMENSION}px)를 벗어납니다.`,
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
      return { ok: false, failure: toFailure("export-settle", "설정시트 캡처 전 물리 settle에 실패했습니다.", error, started) };
    }
  }

  const mode: CameraFramingMode = options.framingMode === "custom" || !options.framingMode ? "full-body" : options.framingMode;
  const panels: CapturedRaster[] = [];
  let lastProvenance = undefined;

  for (let idx = 0; idx < TURNAROUND_YAW_ANGLES_DEG.length; idx += 1) {
    const yawDeg = TURNAROUND_YAW_ANGLES_DEG[idx];
    if (yawDeg === undefined) continue;
    options.onProgress?.(idx + 1, TURNAROUND_YAW_ANGLES_DEG.length, `${yawDeg}° 시점`);
    try {
      const captured = await engine.renderPasses({
        width: panelWidth,
        height: panelHeight,
        passes: ["lit"],
        transparentBackground: true,
        settleSteps: 0,
        camera: { ...DEFAULT_FRAMING, mode, yawDeg, pitchDeg: 0, distanceScale: 1 },
      });
      if (captured.width !== panelWidth || captured.height !== panelHeight) {
        return {
          ok: false,
          failure: failVisible(
            "export-capture-size",
            `엔진이 컷 크기 ${panelWidth}×${panelHeight} 대신 ${captured.width}×${captured.height}를 반환했습니다.`,
            undefined,
            started,
          ),
        };
      }
      const lit = captured.passes.lit;
      if (!lit) {
        return { ok: false, failure: failVisible("export-missing-lit", `시점 ${yawDeg}° 캡처에 lit 패스가 없습니다.`, undefined, started) };
      }
      panels.push(lit);
      lastProvenance = captured.provenance;
    } catch (error) {
      return { ok: false, failure: toFailure("export-capture", `4방향 설정시트(${yawDeg}°) 캡처에 실패했습니다.`, error, started) };
    }
  }

  if (!lastProvenance) {
    return { ok: false, failure: failVisible("export-missing-lit", "4방향 설정시트 캡처 결과가 비어 있습니다.", undefined, started) };
  }

  try {
    const stitched = stitchHorizontalRasters(panels);
    const bytes = await encodePng(stitched, { filter: "adaptive" });
    const baseName = exportFileName("png", lastProvenance.recipeDigest, stitched.width, stitched.height);
    const fileName = baseName.replace(/\.png$/u, "-turnaround.png");
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
    return { ok: false, failure: toFailure("export-png-encode", "4방향 설정시트 PNG 인코딩에 실패했습니다.", error, started) };
  }
}
