import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  createStudioDurabilityViewportAudit, studioDurabilityDocumentRoi, type StudioDurabilityRect,
} from "./studio-durability-viewport";

import type { Page } from "playwright";

// 편집 도구의 그림자만 제외한다. 카메라, 종이, 확정한 잉크와 그리는 중인 잉크는 화면과 같은 조건으로 캡처한다.
const STUDIO_BRUSH_HISTORY_SCREEN_STYLE = `
  body :not([data-studio-document-renderer], [data-studio-document-renderer] *, :has([data-studio-document-renderer])) {
    visibility: hidden !important;
  }
`;

export async function prepareStudioBrushHistoryEvidence(page: Page, clip: StudioDurabilityRect) {
  const audit = createStudioDurabilityViewportAudit(page, STUDIO_BRUSH_HISTORY_SCREEN_STYLE);
  const region = studioDurabilityDocumentRoi(await audit.measure(), clip);
  const capture = async (phase: string) => {
    const png = await audit.capture(region, phase);
    if (!png) throw new Error("브러시 내역 비교에 필요한 원고 영역을 캡처하지 못했습니다.");
    return png;
  };
  return { before: await capture("before"), capture };
}

export function hasMeaningfulPixelChange(diff: { changedPixels: number; maxChannelDelta: number }): boolean {
  return diff.changedPixels >= 4 && diff.maxChannelDelta >= 4;
}

/** 같은 원고 영역에서 먼저 획이 보였고, 복구 후 모든 바이트가 일치해야 통과한다. */
export function matchesStudioBrushHistoryBaseline(
  before: Buffer,
  restored: Buffer,
  painted: { changedPixels: number; maxChannelDelta: number },
): boolean {
  return hasMeaningfulPixelChange(painted) && before.equals(restored);
}

/** 편집기 그림자와 무관하게 정착 안료가 Undo 뒤 같은 원고 영역에서 사라졌는지 판정한다. */
export async function verifySettledBrushUndo(input: {
  surface: Awaited<ReturnType<typeof prepareStudioBrushHistoryEvidence>>;
  settled: Buffer;
  presetId: string;
  screenDiff: { changedPixels: number };
  directory: string;
  log: (message: string) => void;
  compare: (first: Buffer, second: Buffer) => Promise<{ changedPixels: number; maxChannelDelta: number }>;
}): Promise<true> {
  const { surface, settled, presetId, screenDiff, directory, log, compare } = input;
  const painted = await compare(surface.before, settled);
  const restored = await surface.capture("undo");
  if (!matchesStudioBrushHistoryBaseline(surface.before, restored, painted)) {
    writeFileSync(join(directory, "06-undo-baseline-document.png"), surface.before);
    writeFileSync(join(directory, "07-undo-document.png"), restored);
    const documentDiff = await compare(surface.before, restored);
    throw new Error(`${presetId}: 정착 안료 Undo가 원고를 복구하지 못했습니다. `
      + `원고 픽셀 비교: ${JSON.stringify(documentDiff)}; 화면 차이: ${screenDiff.changedPixels}`);
  }
  if (screenDiff.changedPixels > 3) {
    log(`${presetId}: long Undo restored exact document pixels despite ${screenDiff.changedPixels} changed screen pixels`);
  }
  return true;
}
