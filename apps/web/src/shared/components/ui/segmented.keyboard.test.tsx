// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Segmented, UnderlineTabs, type SegItem } from "./segmented";

type Choice = "want" | "reading" | "paused" | "done" | "dropped";
const choices: SegItem<Choice>[] = [
  { value: "want", label: "관심" }, { value: "reading", label: "보는 중" },
  { value: "paused", label: "보류" }, { value: "done", label: "완독" }, { value: "dropped", label: "하차" },
];
const tab = (name: string) => screen.getByRole("tab", { name });

function Tabs({ variant, value = "want", onChange }: {
  variant: "segmented" | "underline";
  value?: Choice;
  onChange: (value: Choice) => void;
}) {
  return variant === "segmented"
    ? <Segmented items={choices} value={value} onChange={onChange} />
    : <UnderlineTabs items={choices} value={value} onChange={onChange} />;
}

afterEach(cleanup);

describe.each(["segmented", "underline"] as const)("%s의 부모 선택 반영이 늦을 때 키보드 이동", (variant) => {
  it("부모 value가 아직 관심이어도 연속 오른쪽 키는 실제 초점에서 보류까지 이동한다", () => {
    const change = vi.fn<(value: Choice) => void>();
    render(<Tabs variant={variant} onChange={change} />);
    tab("관심").focus();
    fireEvent.keyDown(tab("관심"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("보는 중"));
    fireEvent.keyDown(tab("보는 중"), { key: "ArrowRight" });
    expect(change.mock.calls.map(([value]) => value)).toEqual(["reading", "paused"]);
    expect(document.activeElement).toBe(tab("보류"));
    // 선택의 진실원천은 부모다. 키 처리가 aria-selected를 임의로 바꾸지 않는다.
    expect(tab("관심").getAttribute("aria-selected")).toBe("true");
  });

  it("왼쪽 키는 첫 항목에서 끝으로 순환한 뒤 실제 초점에서 계속 이동한다", () => {
    const change = vi.fn<(value: Choice) => void>();
    render(<Tabs variant={variant} onChange={change} />);
    fireEvent.keyDown(tab("관심"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tab("하차"));
    fireEvent.keyDown(tab("하차"), { key: "ArrowLeft" });
    expect(change.mock.calls.map(([value]) => value)).toEqual(["dropped", "done"]);
    expect(document.activeElement).toBe(tab("완독"));
  });

  it("Home·End와 세로 방향키도 현재 초점을 이어서 사용한다", () => {
    const change = vi.fn<(value: Choice) => void>();
    render(<Tabs variant={variant} onChange={change} />);
    fireEvent.keyDown(tab("관심"), { key: "End" });
    fireEvent.keyDown(tab("하차"), { key: "ArrowUp" });
    fireEvent.keyDown(tab("완독"), { key: "Home" });
    fireEvent.keyDown(tab("관심"), { key: "ArrowDown" });
    fireEvent.keyDown(tab("보는 중"), { key: "ArrowDown" });
    expect(change.mock.calls.map(([value]) => value)).toEqual(["dropped", "done", "want", "reading", "paused"]);
    expect(document.activeElement).toBe(tab("보류"));
  });

  it("네이티브 disabled 또는 aria-disabled인 탭은 키보드 선택과 순환에서 건너뛴다", () => {
    const change = vi.fn<(value: Choice) => void>();
    render(<Tabs variant={variant} onChange={change} />);
    // 두 컴포넌트가 실제 렌더한 버튼의 비활성 상태를 시험하는 단위 fixture다.
    tab("보는 중").setAttribute("disabled", "");
    tab("보류").setAttribute("aria-disabled", "true");
    fireEvent.keyDown(tab("관심"), { key: "ArrowRight" });
    expect(change).toHaveBeenLastCalledWith("done");
    expect(document.activeElement).toBe(tab("완독"));
    fireEvent.keyDown(tab("완독"), { key: "End" });
    fireEvent.keyDown(tab("하차"), { key: "ArrowRight" });
    expect(change).toHaveBeenLastCalledWith("want");
    expect(document.activeElement).toBe(tab("관심"));
  });

  it("전부 비활성이면 선택 콜백을 실행하지 않는다", () => {
    const change = vi.fn<(value: Choice) => void>();
    render(<Tabs variant={variant} onChange={change} />);
    for (const node of screen.getAllByRole("tab")) node.setAttribute("aria-disabled", "true");
    fireEvent.keyDown(tab("관심"), { key: "Home" });
    expect(change).not.toHaveBeenCalled();
  });

  it("프로그램의 value 변경은 선택 표시와 Tab 진입점을 유지하며 초점을 강제로 옮기지 않는다", () => {
    const change = vi.fn<(value: Choice) => void>();
    const view = render(<Tabs variant={variant} onChange={change} />);
    view.rerender(<Tabs variant={variant} value="paused" onChange={change} />);
    expect(tab("보류").getAttribute("aria-selected")).toBe("true");
    expect(tab("보류").getAttribute("tabindex")).toBe("0");
    expect(tab("관심").getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).not.toBe(tab("보류"));
    fireEvent.keyDown(tab("보류"), { key: "ArrowRight" });
    expect(change).toHaveBeenLastCalledWith("done");
  });

  it("포인터 선택과 지원하지 않는 키의 기본 동작을 유지한다", () => {
    const change = vi.fn<(value: Choice) => void>();
    render(<Tabs variant={variant} onChange={change} />);
    expect(fireEvent.keyDown(tab("관심"), { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(tab("관심"), { key: "Escape" })).toBe(true);
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(tab("완독"));
    expect(change).toHaveBeenCalledExactlyOnceWith("done");
  });

  it("모션 감소 설정에서도 부모 갱신을 기다리지 않고 연속 키로 조작한다", () => {
    const change = vi.fn<(value: Choice) => void>();
    render(<MotionConfig reducedMotion="always"><Tabs variant={variant} onChange={change} /></MotionConfig>);
    fireEvent.keyDown(tab("관심"), { key: "ArrowRight" });
    fireEvent.keyDown(tab("보는 중"), { key: "ArrowRight" });
    expect(change.mock.calls.map(([value]) => value)).toEqual(["reading", "paused"]);
    expect(document.activeElement).toBe(tab("보류"));
  });
});
