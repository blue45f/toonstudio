// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EngineeringDiagramFrame } from "./EngineeringDiagramFrame";
import { FIXTURE_GRAPH } from "./engineering-diagram.fixtures";

beforeEach(() => {
  // jsdom 은 <dialog> 의 showModal/close 를 구현하지 않는다.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

describe("EngineeringDiagramFrame", () => {
  it("평소에는 도식 하나만 그리고, '크게 보기'를 누르면 대화상자에 한 번 더 그린다", () => {
    const { container } = render(<EngineeringDiagramFrame diagram={FIXTURE_GRAPH} />);
    expect(container.querySelectorAll("figure.eng-dia")).toHaveLength(1);
    expect(container.querySelector("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /크게 보기|Enlarge/u }));
    const dialog = container.querySelector("dialog.eng-dia-zoom") as HTMLDialogElement;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.getAttribute("aria-label")).toBeTruthy();
    expect(container.querySelectorAll("figure.eng-dia")).toHaveLength(2);
  });

  it("닫기 버튼과 배경 클릭으로 닫히고 포커스가 '크게 보기' 버튼으로 돌아온다", () => {
    const { container } = render(<EngineeringDiagramFrame diagram={FIXTURE_GRAPH} />);
    const trigger = screen.getByRole("button", { name: /크게 보기|Enlarge/u });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /^(닫기|Close)$/u }));
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const dialog = container.querySelector("dialog") as HTMLDialogElement;
    fireEvent.click(dialog);
    expect(container.querySelector("dialog")).toBeNull();
  });
});
