import { describe, expect, it } from "vitest";

import {
  STUDIO_SEVEN_STANDARD_MENUS,
  STUDIO_UI_V2_CHROME_CONSTANTS,
  evaluateCanvasViewportRatio,
} from "./studio-ui-v2-chrome-contract";

describe("studio-ui-v2-chrome-contract (AC-019)", () => {
  it("표준 메뉴는 정확히 7개 그룹으로 압축되고 상단바 44px·좌측 레일 48px 계약을 유지한다", () => {
    expect(STUDIO_SEVEN_STANDARD_MENUS).toHaveLength(7);
    expect(STUDIO_UI_V2_CHROME_CONSTANTS.desktopTopBarHeightPx).toBe(44);
    expect(STUDIO_UI_V2_CHROME_CONSTANTS.desktopLeftToolRailWidthPx).toBe(48);
  });

  it("데스크톱 1440×900(82%+) 및 모바일 390×844(88%+) 캔버스 시야 비율을 정확히 판정한다", () => {
    const desktopPass = evaluateCanvasViewportRatio({
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
      topBarHeightPx: 44,
      leftRailWidthPx: 48,
      rightPanelWidthPx: 120,
      bottomDockHeightPx: 0,
    });
    expect(desktopPass.passed).toBe(true);
    expect(desktopPass.ratio).toBeGreaterThanOrEqual(0.82);

    const mobilePass = evaluateCanvasViewportRatio({
      viewportWidthPx: 390,
      viewportHeightPx: 844,
      topBarHeightPx: 0,
      leftRailWidthPx: 0,
      rightPanelWidthPx: 0,
      bottomDockHeightPx: 72,
    });
    expect(mobilePass.passed).toBe(true);
    expect(mobilePass.ratio).toBeGreaterThanOrEqual(0.88);
  });
});
