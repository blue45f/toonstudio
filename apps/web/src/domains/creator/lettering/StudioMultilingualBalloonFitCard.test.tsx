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

  it("4개 국어 리플로우 솔버, 일본어 세로쓰기(Tategaki) 글리프 회전/치환, SFX 메타데이터, CSV/XLIFF 왕복 역주입이 동작한다", () => {
    const onReinject = vi.fn();
    render(
      <StudioMultilingualBalloonFitCard
        sourceText="오늘 자정에 탑 꼭대기에서 만나지 않으면 계약은 전부 무효가 됩니다"
        boxWidthPx={150}
        boxHeightPx={95}
        fontSizePx={20}
        cutId="cut-008"
        bubbleId="b-08"
        speaker="수연"
        localizedTexts={{
          ko: "오늘 자정에 탑 꼭대기에서 만나지 않으면 계약은 전부 무효가 됩니다",
          en: "If we do not meet at the top of the tower before midnight, the entire contract becomes void.",
          ja: "「待って…本当に（コーヒー）——行くのー？」",
          es: "Si no nos reunimos en la cima de la torre antes de medianoche, todo el contrato quedará anulado.",
        }}
        onReinjectDialogue={onReinject}
      />,
    );

    expect(screen.getByTestId("multilingual-reflow-solver-section")).toBeTruthy();
    expect(screen.getByTestId("reflow-sfx-metadata-strip").textContent).toContain("비손상 레이어 분리");

    // 스페인어 선택 시 빨간 넘침 배지 분류 확인
    fireEvent.click(screen.getByTestId("reflow-locale-btn-es"));
    expect(screen.getByTestId("reflow-overflow-badge").getAttribute("data-badge-tone")).toBe("red");

    // 일본어 선택 시 세로쓰기(Tategaki) 글리프 회전/치환 요약 표시
    fireEvent.click(screen.getByTestId("reflow-locale-btn-ja"));
    expect(screen.getByTestId("reflow-tategaki-toggle")).toBeTruthy();
    expect(screen.getByTestId("reflow-tategaki-summary").textContent).toContain("90° 회전");
    expect(screen.getByTestId("reflow-tategaki-summary").textContent).toContain("﹁");

    // CSV 추출 및 왕복 역주입
    fireEvent.click(screen.getByTestId("reflow-export-csv"));
    expect(screen.getByTestId("reflow-interchange-preview").textContent).toContain("cut-008");
    fireEvent.click(screen.getByTestId("reflow-roundtrip-reinject"));
    expect(screen.getByTestId("reflow-reinject-status").textContent).toContain("CSV 역주입 완료");
    expect(onReinject).toHaveBeenCalledTimes(1);

    // XLIFF 1.2 추출 및 왕복 역주입
    fireEvent.click(screen.getByTestId("reflow-export-xliff"));
    expect(screen.getByTestId("reflow-interchange-preview").textContent).toContain('<xliff version="1.2"');
    fireEvent.click(screen.getByTestId("reflow-roundtrip-reinject"));
    expect(screen.getByTestId("reflow-reinject-status").textContent).toContain("XLIFF 역주입 완료");
    expect(onReinject).toHaveBeenCalledTimes(2);
  });
});
