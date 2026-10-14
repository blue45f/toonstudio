// ColorDrop 배선 전용 정적 렌더 검증. 기본 패널 계약은 StudioFloodFillPanel.test.tsx가 고정한다.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_ADVANCED_FILL_SETTINGS } from "./studio-advanced-fill-settings";
import {
  StudioFloodFillPanel,
  type StudioFloodFillPanelProps,
} from "./StudioFloodFillPanel";

const noop = () => {
  // 정적 렌더 테스트에서는 콜백을 실행하지 않는다.
};

function renderPanel(overrides: Partial<StudioFloodFillPanelProps> = {}): string {
  const props: StudioFloodFillPanelProps = {
    active: true,
    busy: false,
    fillColor: "#ff6b6b",
    settings: { ...DEFAULT_STUDIO_ADVANCED_FILL_SETTINGS },
    referenceLayerCount: 0,
    visibleRasterCount: 0,
    selectedIsReference: false,
    onToggleActive: noop,
    onFillColorChange: noop,
    onSettingsChange: noop,
    onToggleSelectedReference: noop,
    onResetSettings: noop,
    ...overrides,
  };
  return renderToStaticMarkup(<StudioFloodFillPanel {...props} />);
}

describe("StudioFloodFillPanel ColorDrop gesture surface", () => {
  it("shows the tolerance as a percent next to the raw value and explains the drag gesture", () => {
    const html = renderPanel();

    // 기본 허용 오차 32 = 13%.
    expect(html).toContain("32 · 13%");
    expect(html).toContain("누른 채 옆으로 드래그하면 허용 오차를 %로 조절하며 미리볼");
    expect(html).not.toContain("임계값 드래그 중");
    // 제스처 안내는 슬라이더를 추가하지 않는다 (기존 range 개수 계약 유지).
    expect(html.match(/type="range"/g)).toHaveLength(4);
  });

  it("announces the live percent and the restore value while a drag is in progress", () => {
    const html = renderPanel({ colorDropGesture: { percent: 73, startPercent: 13 } });

    expect(html).toContain("임계값 드래그 중 73%");
    expect(html).toContain("취소하면 13%로 돌아갑니다");
  });
});
