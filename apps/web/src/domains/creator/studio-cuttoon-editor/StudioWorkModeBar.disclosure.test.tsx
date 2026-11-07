// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioWorkModeBar } from "../StudioWorkModeBar";

afterEach(cleanup);
describe("작업 단계 안내의 선택적 노출", () => {
  it("안내는 기본 접힘이며 반복해서 열고 닫아도 모드를 바꾸지 않는다", () => {
    const onModeChange = vi.fn();
    render(<StudioWorkModeBar mode="draw" onModeChange={onModeChange} />);
    expect(screen.queryByRole("region", {name:"작업 단계 안내"})).toBeNull();
    const toggle = screen.getByRole("button", {name:"가이드 보기"});
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    const guide = screen.getByRole("region", {name:"작업 단계 안내"});
    expect(screen.getByRole("button", {name:"가이드 숨기기"}).getAttribute("aria-controls")).toBe(guide.id);
    expect(guide.textContent).toContain("그리는 단계예요");
    expect(guide.querySelectorAll("kbd").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", {name:"가이드 숨기기"}));
    expect(screen.queryByRole("region", {name:"작업 단계 안내"})).toBeNull();
    fireEvent.click(screen.getByRole("button", {name:"가이드 보기"}));
    expect(screen.getByRole("region", {name:"작업 단계 안내"})).toBeTruthy();
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("접힌 상태에서도 7개 모드와 다음 단계 기능을 유지한다", () => {
    const onModeChange = vi.fn();
    render(<StudioWorkModeBar mode="draw" onModeChange={onModeChange} />);
    expect(screen.getAllByRole("tab")).toHaveLength(7);
    fireEvent.click(screen.getByRole("tab", {name:/채색/}));
    expect(onModeChange).toHaveBeenLastCalledWith("color");
    fireEvent.click(screen.getByRole("button", {name:"다음 단계: 채색"}));
    expect(onModeChange).toHaveBeenLastCalledWith("color");
  });

  it("회차 단계 제안과 거절은 안내 접힘과 독립적으로 유지한다", () => {
    const change = vi.fn(), dismiss = vi.fn();
    render(<StudioWorkModeBar mode="draw" suggestedMode="color" onModeChange={change} onDismissSuggestion={dismiss} />);
    expect(screen.getByText(/채색 모드로 바꿀까요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name:"그대로 두기"}));
    expect(dismiss).toHaveBeenCalledOnce();
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name:"바꾸기"}));
    expect(change).toHaveBeenCalledWith("color");
  });

  it("영문에서도 안내를 선택적으로 열고 닫을 수 있다", () => {
    render(<StudioWorkModeBar mode="draw" lang="en" onModeChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", {name:"Show guide"}));
    expect(screen.getByRole("region", {name:"Work stage guide"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name:"Hide guide"}));
    expect(screen.queryByRole("region", {name:"Work stage guide"})).toBeNull();
  });
});
