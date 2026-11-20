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
