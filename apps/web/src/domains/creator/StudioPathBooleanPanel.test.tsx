// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPathBooleanPanel, type StudioPathBooleanPanelProps } from "./StudioPathBooleanPanel";

afterEach(cleanup);

const OP_LABELS = ["합치기", "빼기", "교차", "제외"];

function props(overrides: Partial<StudioPathBooleanPanelProps> = {}): StudioPathBooleanPanelProps {
  return {
    busy: false,
    unavailableReason: null,
    onApply: vi.fn(),
    ...overrides,
  };
}

describe("StudioPathBooleanPanel", () => {
  it("4개 연산 버튼을 렌더하고 클릭 시 해당 op 로 onApply 를 호출한다", () => {
    const onApply = vi.fn();
    render(<StudioPathBooleanPanel {...props({ onApply })} />);
    for (const label of OP_LABELS) {
      expect(screen.getByRole("button", { name: label }).hasAttribute("disabled")).toBe(false);
    }
    fireEvent.click(screen.getByRole("button", { name: "빼기" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith("subtract");
  });

  it("unavailableReason 이 있으면 버튼을 잠그고 사유를 보여준다", () => {
    const onApply = vi.fn();
    const reason = "캔버스에서 도형 2개를 함께 선택하세요(드래그 선택).";
    render(<StudioPathBooleanPanel {...props({ onApply, unavailableReason: reason })} />);
    for (const label of OP_LABELS) {
      expect(screen.getByRole("button", { name: label }).hasAttribute("disabled")).toBe(true);
    }
    expect(screen.getByRole("status").textContent).toContain(reason);
    fireEvent.click(screen.getByRole("button", { name: "합치기" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("busy 면 버튼을 잠그고 진행 문구를 보여준다", () => {
    render(<StudioPathBooleanPanel {...props({ busy: true })} />);
    expect(screen.getByRole("button", { name: "교차" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("도형을 결합하는 중...");
  });
});

describe("StudioPathBooleanPanel — 빠른 결합(다각형) 명시 선택 섹션", () => {
  it("섹션을 넘기지 않으면 빠른 결합 버튼이 렌더되지 않는다(기존 패널과 동일)", () => {
    render(<StudioPathBooleanPanel {...props()} />);
    expect(screen.queryByRole("button", { name: /빠른 결합으로/ })).toBeNull();
    expect(screen.queryByText(/빠른 결합 \(다각형\)/)).toBeNull();
  });

  it("빠른 결합 버튼은 기본 onApply 가 아니라 섹션 onApply 로만 나간다", () => {
    const onApply = vi.fn();
    const onFastApply = vi.fn();
    render(
      <StudioPathBooleanPanel
        {...props({ onApply, fastCombineSection: { onApply: onFastApply } })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "빠른 결합으로 합치기" }));
    expect(onFastApply).toHaveBeenCalledTimes(1);
    expect(onFastApply).toHaveBeenCalledWith("union");
    expect(onApply).not.toHaveBeenCalled();
    // 기본 버튼은 여전히 기본 콜백만 호출한다 — 명시 선택이 기본 동선을 바꾸지 않는다.
    fireEvent.click(screen.getByRole("button", { name: "합치기" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith("union");
    expect(onFastApply).toHaveBeenCalledTimes(1);
  });

  it("섹션 unavailableReason 이 있으면 빠른 결합 버튼만 잠기고 사유를 보여준다", () => {
    const onFastApply = vi.fn();
    const reason = "빠른 결합은 사용할 수 없어요.";
    render(
      <StudioPathBooleanPanel
        {...props({
          fastCombineSection: { onApply: onFastApply, unavailableReason: reason },
        })}
      />
    );
    expect(
      screen.getByRole("button", { name: "빠른 결합으로 빼기" }).hasAttribute("disabled")
    ).toBe(true);
    expect(screen.getByRole("button", { name: "빼기" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "빠른 결합으로 빼기" }));
    expect(onFastApply).not.toHaveBeenCalled();
  });
});
