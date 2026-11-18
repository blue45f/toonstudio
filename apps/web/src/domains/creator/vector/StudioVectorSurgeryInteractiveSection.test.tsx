// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVectorSurgeryInteractiveSection } from "./StudioVectorSurgeryInteractiveSection";

afterEach(cleanup);

describe("StudioVectorSurgeryInteractiveSection", () => {
  it("베지어 곡선 추가 및 7종 벡터선 수술·교차점 삭제 버튼이 실제 DrawEl 상태를 갱신하고 콜백을 호출한다", () => {
    const onStrokesChange = vi.fn();
    render(<StudioVectorSurgeryInteractiveSection onStrokesChange={onStrokesChange} />);

    // 초기 샘플 3개 획
    expect(screen.getByText(/획 3개/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "곡선 획 추가" }));
    expect(onStrokesChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/획 4개/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "벡터선 집기" }));
    fireEvent.click(screen.getByRole("button", { name: "일부 다시 그리기" }));
    fireEvent.click(screen.getByRole("button", { name: "선폭 다시 그리기" }));
    fireEvent.click(screen.getByRole("button", { name: "선폭 굵게 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "모서리 곡률 전환" }));
    fireEvent.click(screen.getByRole("button", { name: "절반 지점 분할" }));
    fireEvent.click(screen.getByRole("button", { name: "벡터선 연결" }));
    fireEvent.click(screen.getByRole("button", { name: "교차점까지 삭제" }));

    expect(onStrokesChange.mock.calls.length).toBeGreaterThanOrEqual(8);
  });
});
