import { resolveStudioWetPaperBakeProgramIdForBrush } from "../../apps/web/src/domains/creator/brush/wet-paper/studio-watercolor-settled-surface";

import type { StudioLongBrushQualityFinding, StudioLongBrushQualityFrame, StudioLongBrushQualityResult, StudioLongBrushQualityTransition } from "../studio-brush-long-matrix-quality";
import type { Page } from "playwright";

/** 먹 번짐과 백런은 정착하며 안료가 최초 붓자리를 벗어나는 프로그램이다. */
export function studioLongBrushHasSettledDiffusion(brushId: string): boolean {
  const program = resolveStudioWetPaperBakeProgramIdForBrush(brushId);
  return program === "moxi-sumi-dispersion" || program === "curtis-watercolor-backrun";
}

export function measureLongBrushBoundsDrift(
  leftBounds: StudioLongBrushQualityFrame["bounds"],
  rightBounds: StudioLongBrushQualityFrame["bounds"],
) {
  return leftBounds && rightBounds
    ? Math.max(
        Math.abs(leftBounds.left - rightBounds.left),
        Math.abs(leftBounds.top - rightBounds.top),
        Math.abs(leftBounds.right - rightBounds.right),
        Math.abs(leftBounds.bottom - rightBounds.bottom),
      )
    : null;
}

export function normalizeWetPaperBounds(
  measured: StudioLongBrushQualityResult["transitions"],
  width: number | undefined,
): StudioLongBrushQualityResult["transitions"] {
  const settledBounds = (value: StudioLongBrushQualityTransition) => (
    width !== undefined && Number.isFinite(width) && width > 0 && value.boundsDriftPx !== null
      ? { ...value, normalizedBoundsDrift: value.boundsDriftPx / Math.max(4, width) }
      : value
  );
  // 물리가 포인터를 뗀 첫 캡처 전에 끝난 경우 두 이미지가 완전히 같아야 정착으로 본다.
  return {
    liveToReleased: measured.releasedToSettled.rawChangedPixels === 0
      ? settledBounds(measured.liveToReleased) : measured.liveToReleased,
    liveToSettled: settledBounds(measured.liveToSettled),
    releasedToSettled: settledBounds(measured.releasedToSettled),
  };
}

export function wetPaperDiffusionFindings(
  frames: StudioLongBrushQualityResult["frames"],
  width: number | undefined,
): StudioLongBrushQualityFinding[] {
  if (width === undefined || !frames.live.bounds || !frames.settled.bounds) return [];
  // 가로 장획의 먹 번짐과 백런은 정착할 때 적어도 한쪽 붓끝 바깥에 안료를 남긴다.
  const extension = Math.max(frames.live.bounds.left - frames.settled.bounds.left,
    frames.settled.bounds.right - frames.live.bounds.right);
  if (extension > 1) return [];
  return [{ level: "error", code: "missing-settled-diffusion", message: "정착 후에도 붓끝 바깥에 안료가 보이지 않습니다." }];
}

export async function waitForWetPaperFrame(
  page: Page,
  capture: () => Promise<Buffer>,
  accepts: (frame: Buffer) => boolean | Promise<boolean>,
  failure: string,
): Promise<Buffer> {
  const deadline = performance.now() + 15_000;
  do {
    const candidate = await capture();
    if (await accepts(candidate)) return candidate;
    await page.waitForTimeout(120);
  } while (performance.now() < deadline);
  throw new Error(failure);
}
