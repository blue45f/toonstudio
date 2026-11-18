// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBrushAdvancedCspSection } from "./StudioBrushAdvancedCspSection";

afterEach(cleanup);

describe("StudioBrushAdvancedCspSection", () => {
  it("기본 상태에서는 항등원 변경 시 undefined를 내보내고 활성화 시 정규화 확장을 전달한다", () => {
    const onChange = vi.fn();
    render(<StudioBrushAdvancedCspSection value={undefined} onChange={onChange} />);

    const sharpCheckbox = screen.getByLabelText("모서리를 뾰족하게");
    fireEvent.click(sharpCheckbox);
    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0]![0];
    expect(updated?.sharpCorner.enabled).toBe(true);

    // 다시 끄면 모든 기능이 기본 상태이므로 undefined 전달 (기존 스냅샷 바이트 불변 보장)
    onChange.mockClear();
    render(<StudioBrushAdvancedCspSection value={updated} onChange={onChange} />);
    const toggles = screen.getAllByLabelText("모서리를 뾰족하게");
    fireEvent.click(toggles[toggles.length - 1]!);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("장식 패턴 모티프 선택 시 리본 연결 및 반복 순서 컨트롤을 노출한다", () => {
    const onChange = vi.fn();
    render(<StudioBrushAdvancedCspSection value={undefined} onChange={onChange} />);

    const motifSelect = screen.getByLabelText("장식 패턴 모티프");
    fireEvent.change(motifSelect, { target: { value: "lace" } });
    const next = onChange.mock.calls[0]![0];
    expect(next?.patternBrush.motif).toBe("lace");

    cleanup();
    render(<StudioBrushAdvancedCspSection value={next} onChange={onChange} />);
    expect(screen.getByText("1개 켜짐")).toBeTruthy();
    expect(screen.getByLabelText("리본처럼 선을 따라 연속 연결")).toBeTruthy();
    expect(screen.getByLabelText("패턴 반복 순서")).toBeTruthy();
  });
});
