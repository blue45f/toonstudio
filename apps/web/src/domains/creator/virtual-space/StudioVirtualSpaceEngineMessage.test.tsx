// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEngineMessage } from "./StudioVirtualSpaceEngineMessage";

afterEach(cleanup);

const base = { failure: false, ready: false, loadProgress: null, slowLoad: false, onRetry: () => undefined } as const;

describe("월드 로딩·실패 안내 카드", () => {
  it("준비되면 아무것도 그리지 않는다", () => {
    const { container } = render(<StudioVirtualSpaceEngineMessage {...base} ready />);
    expect(container.firstChild).toBeNull();
  });

  it("로딩 중에는 상태 영역에 문구를 보이고, 진행률을 모르면 막대를 그리지 않는다", () => {
    const { container } = render(<StudioVirtualSpaceEngineMessage {...base} />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain("스튜디오 불러오는 중…");
    expect(container.querySelector("progress")).toBeNull();
    expect(container.querySelector(".studio-vspace-engine-slow")).toBeNull();
  });

  it("진행률이 있으면 막대를 값과 함께 보이되 스크린 리더에는 숨긴다", () => {
    const { container } = render(<StudioVirtualSpaceEngineMessage {...base} loadProgress={42} />);
    const bar = container.querySelector("progress");
    expect(bar?.getAttribute("value")).toBe("42");
    expect(bar?.getAttribute("max")).toBe("100");
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
  });

  it("연결이 느리면 안내 문구를 더한다", () => {
    render(<StudioVirtualSpaceEngineMessage {...base} slowLoad />);
    expect(screen.getByRole("status").textContent).toContain("연결이 느려 조금 더 걸리고 있어요.");
  });

  it("실패하면 경고 영역에 다시 시도 버튼을 보이고, 누르면 재시도를 부른다", () => {
    const onRetry = vi.fn();
    render(<StudioVirtualSpaceEngineMessage {...base} failure onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("공간을 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("실패는 준비 상태보다 우선한다", () => {
    render(<StudioVirtualSpaceEngineMessage {...base} failure ready />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
