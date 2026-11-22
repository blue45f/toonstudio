// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioMultilingualBalloonFitCard } from "./StudioMultilingualBalloonFitCard";
import { StudioLocalizationPanel } from "../studio-shell/StudioLocalizationPanel";

describe("StudioMultilingualBalloonFitCard & StudioLocalizationPanel wiring", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("renders all 5 locale diagnoses, highlights 390px readability guard, and invokes recommendation callback", () => {
    const onApply = vi.fn();
    render(
      <StudioMultilingualBalloonFitCard
        sourceText="오늘 밤 자정 전에 탑 꼭대기에서 만나지 않으면 계약은 전부 무효가 됩니다 알겠죠"
        boxWidthPx={200}
        boxHeightPx={130}
        fontSizePx={22}
        activeTargetLocale="en-US"
        onApplyRecommendation={onApply}
      />,
    );

    expect(screen.getByTestId("multilingual-balloon-fit-card")).toBeTruthy();
    expect(screen.getByTestId("balloon-fit-locale-en").getAttribute("data-risk")).toBe("overflow");
    expect(screen.getByTestId("balloon-fit-locale-ja")).toBeTruthy();
    expect(screen.getByTestId("balloon-fit-locale-th")).toBeTruthy();
    expect(screen.getByTestId("balloon-fit-locale-es").getAttribute("data-risk")).toBe("overflow");
    expect(screen.getByTestId("balloon-fit-locale-zh")).toBeTruthy();
    expect(screen.getByText(/390px 모바일 가독성 하한/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /권장 여유값 반영/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const patch = onApply.mock.calls[0]?.[0] as { availableHeight: number; actualFontSize: number };
    expect(patch.availableHeight).toBeGreaterThan(130);
    expect(patch.actualFontSize).toBeGreaterThanOrEqual(20.5);
  });

  it("mounts the multilingual balloon fit diagnosis inside StudioLocalizationPanel when a dialogue unit is added", () => {
    render(<StudioLocalizationPanel projectId="proj-balloon-fit-1" />);

    fireEvent.change(screen.getByLabelText("새 원문"), {
      target: {
        value: "이 문장은 스페인어와 영어 번역 시 말풍선 높이가 부족할 수 있는지 미리 확인하는 긴 대사입니다",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(screen.getByTestId("multilingual-balloon-fit-card")).toBeTruthy();
    expect(screen.getByTestId("balloon-fit-locale-en")).toBeTruthy();
    expect(screen.getByTestId("balloon-fit-locale-es")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /권장 여유값 반영/ }));
    expect(screen.getByText(/배치 초안에 반영했습니다/)).toBeTruthy();
  });
});
