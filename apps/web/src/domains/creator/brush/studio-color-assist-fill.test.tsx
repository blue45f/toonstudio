// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { computeStudioFloodFillBleedPreview } from "./studio-flood-fill-bleed-preview";
import { DEFAULT_STUDIO_ADVANCED_FILL_SETTINGS } from "../studio-advanced-fill-settings";
import { StudioFloodFillPanel } from "../StudioFloodFillPanel";

describe("P1-12 채색 보조 (참조 레이어 · 틈 닫기 · 번짐 범위 미리보기 · 실행 취소)", () => {
  afterEach(() => {
    cleanup();
  });

  it("확장 픽셀·허용 오차·선 틈 메우기에 따라 실시간 번짐 반경과 누수 위험도를 계산한다", () => {
    const tight = computeStudioFloodFillBleedPreview({
      tolerance: 24,
      expansionPx: 1,
      closeGapPx: 6,
      antiAlias: true,
      leakGuard: true,
    });
    expect(tight.gapSealed).toBe(true);
    expect(tight.riskLevel).toBe("safe");
    expect(tight.summaryText).toContain("선 안쪽 +1px 번짐");
    expect(tight.summaryText).toContain("틈 닫기 6px");

    const wideOpen = computeStudioFloodFillBleedPreview({
      tolerance: 200,
      expansionPx: 10,
      closeGapPx: 0,
      antiAlias: true,
      leakGuard: true,
    });
    expect(wideOpen.gapSealed).toBe(false);
    expect(wideOpen.riskLevel).toBe("wide");
    expect(wideOpen.bleedRingRadiusSvg).toBeGreaterThan(tight.bleedRingRadiusSvg);
  });

  it("패널에서 참조 레이어 지정·틈 닫기·번짐 범위 미리보기 SVG·채우기 실행 취소가 동작한다", () => {
    const onToggleReference = vi.fn();
    const onUndoFill = vi.fn();
    const onSettingsChange = vi.fn();

    const { container } = render(
      <StudioFloodFillPanel
        active
        busy={false}
        fillColor="#4f46e5"
        settings={{
          ...DEFAULT_STUDIO_ADVANCED_FILL_SETTINGS,
          referenceScope: "reference",
          expansionPx: 3,
          closeGapPx: 8,
          tolerance: 40,
        }}
        referenceLayerCount={2}
        visibleRasterCount={4}
        selectedIsReference={false}
        canToggleSelectedReference
        canUndoFill
        onUndoFill={onUndoFill}
        onToggleActive={vi.fn()}
        onFillColorChange={vi.fn()}
        onSettingsChange={onSettingsChange}
        onToggleSelectedReference={onToggleReference}
        onResetSettings={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-studio-fill-bleed-preview="true"]')).toBeTruthy();
    expect(screen.getByText("번짐 범위 미리보기")).toBeTruthy();
    expect(screen.getByText(/선 안쪽 \+3px 번짐 · 틈 닫기 8px/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /선택 레이어를 참조로 설정/ }));
    expect(onToggleReference).toHaveBeenCalledTimes(1);

    const undoBtn = screen.getByRole("button", { name: "채우기 실행 취소" });
    expect(undoBtn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(undoBtn);
    expect(onUndoFill).toHaveBeenCalledTimes(1);
  });
});
