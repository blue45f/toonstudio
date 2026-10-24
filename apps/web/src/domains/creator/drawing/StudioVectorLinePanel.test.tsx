// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioVectorLinePanel } from "./StudioVectorLinePanel";
import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

function outlinePathD(container: HTMLElement): string | null {
  const svg = container.querySelector('svg[aria-label="선폭 편집 데모"]');
  const filled = svg?.querySelector('path[fill^="url("]');
  return filled?.getAttribute("d") ?? null;
}

describe("StudioVectorLinePanel", () => {
  it("10초 규칙 헤드라인을 렌더링한다", () => {
    render(<StudioVectorLinePanel />);
    expect(
      screen.getByText("그은 뒤에도 선 굵기를 손으로 어루만지듯 조절하세요"),
    ).toBeTruthy();
    expect(screen.getByRole("img", { name: "선폭 편집 데모" })).toBeTruthy();
  });

  it("영어 로케일에서는 영어 카피를 보여준다", () => {
    useI18n.getState().setLang("en");
    render(<StudioVectorLinePanel />);
    expect(
      screen.getByText("Reshape line weight by hand, even after you draw"),
    ).toBeTruthy();
  });

  it("구간 선택 버튼이 aria-pressed 로 동작한다", () => {
    render(<StudioVectorLinePanel />);
    const middle = screen.getByRole("button", { name: "중간" });
    expect(middle.getAttribute("aria-pressed")).toBe("true");

    const all = screen.getByRole("button", { name: "전체" });
    fireEvent.click(all);
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(middle.getAttribute("aria-pressed")).toBe("false");
  });

  it("굵게를 누르면 외곽선 path 가 바뀌고 상태 문구가 표시된다", () => {
    const { container } = render(<StudioVectorLinePanel />);
    const before = outlinePathD(container);
    expect(before).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "굵게" }));

    const after = outlinePathD(container);
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
    expect(screen.getByText("구간 선폭 늘이기")).toBeTruthy();
  });

  it("실행 취소/다시 실행이 before/after 를 오간다", () => {
    const { container } = render(<StudioVectorLinePanel />);
    const original = outlinePathD(container);

    fireEvent.click(screen.getByRole("button", { name: "테이퍼" }));
    const tapered = outlinePathD(container);
    expect(tapered).not.toBe(original);

    const undoButton = screen.getByRole("button", { name: "실행 취소" });
    expect(undoButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(undoButton);
    expect(outlinePathD(container)).toBe(original);

    const redoButton = screen.getByRole("button", { name: "다시 실행" });
    fireEvent.click(redoButton);
    expect(outlinePathD(container)).toBe(tapered);
  });

  it("편집 전에는 실행 취소가 비활성화되어 있다", () => {
    render(<StudioVectorLinePanel />);
    expect(
      screen.getByRole("button", { name: "실행 취소" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "다시 실행" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("3단계 안내를 렌더링한다", () => {
    render(<StudioVectorLinePanel />);
    expect(screen.getByText("선을 그립니다")).toBeTruthy();
    expect(screen.getByText("조절할 구간을 선택합니다")).toBeTruthy();
    expect(screen.getByText("굵기를 어루만지듯 바꿉니다")).toBeTruthy();
  });

  it("곡선 집기 및 교차점 정리 버튼이 동작하고 실행 취소와 호환된다", () => {
    const { container } = render(<StudioVectorLinePanel />);
    const before = outlinePathD(container);

    fireEvent.click(screen.getByRole("button", { name: "곡선 집기" }));
    const afterPinch = outlinePathD(container);
    expect(afterPinch).not.toBe(before);
    expect(screen.getByText("가우시안 곡선 집기 적용")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "교차점 정리" }));
    const afterTrim = outlinePathD(container);
    expect(afterTrim).not.toBe(afterPinch);
    expect(screen.getByText("교차점 너머 삐침 선분 정리")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(outlinePathD(container)).toBe(afterPinch);
  });
});

