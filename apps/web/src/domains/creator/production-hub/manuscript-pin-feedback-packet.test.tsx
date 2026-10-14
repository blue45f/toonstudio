// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ManuscriptPinFeedback } from "./ManuscriptPinFeedback";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderFeedback(overrides: Partial<React.ComponentProps<typeof ManuscriptPinFeedback>> = {}) {
  const handlers = {
    onAddPin: vi.fn(),
    onAddReply: vi.fn(),
    onToggleResolve: vi.fn(),
    onDeletePin: vi.fn(),
  };
  const utils = render(
    <ManuscriptPinFeedback
      imageSrc="https://example.com/manuscript.png"
      pageId="page-1"
      pins={[]}
      currentActorId="user-1"
      currentActorName="나"
      {...handlers}
      {...overrides}
    />,
  );
  return { ...utils, handlers };
}

function enterPlacingAndDropPin(container: HTMLElement) {
  fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
  const canvas = container.querySelector(".manuscript-pin-canvas") as HTMLElement;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
  });
  fireEvent.click(canvas, { clientX: 300, clientY: 400 });
}

describe("ManuscriptPinFeedback 핀 피드백 패킷 장착", () => {
  it("pin-first 단계(storyboard)에서는 핀 찍기 전에 '어디를' 안내를 띄운다", () => {
    renderFeedback({ stageId: "storyboard" });
    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    expect(screen.getByText(/고칠 곳을 그림 위에 핀으로 찍어 주세요/)).toBeTruthy();
  });

  it("단계를 넘기지 않으면 기본값도 pin-first라 같은 안내를 띄운다", () => {
    renderFeedback();
    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    expect(screen.getByText(/고칠 곳을 그림 위에 핀으로 찍어 주세요/)).toBeTruthy();
  });

  it("pin-or-text 단계(review)에서는 핀 우선 안내를 띄우지 않는다", () => {
    renderFeedback({ stageId: "review" });
    fireEvent.click(screen.getByRole("button", { name: /핀 꽂기/ }));
    expect(screen.queryByText(/고칠 곳을 그림 위에 핀으로 찍어 주세요/)).toBeNull();
  });

  it("작성 폼은 패킷 안내를 보여 주고, 본문이 없으면 제출을 막고, 레퍼런스 안내는 권장으로만 남는다", () => {
    const { handlers, container } = renderFeedback({ stageId: "storyboard" });
    enterPlacingAndDropPin(container);

    // 본문이 비어 있으면 '무엇을' 안내가 보이고 제출 버튼이 막힌다
    expect(screen.getByText(/무엇을 고칠지 한 줄이라도 적어 주세요/)).toBeTruthy();
    const submit = screen.getByRole("button", { name: "핀 꽂기" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(handlers.onAddPin).not.toHaveBeenCalled();

    // 본문을 채우면 제출 가능. 레퍼런스 안내는 제출을 막지 않는 권장으로 남는다
    fireEvent.change(screen.getByPlaceholderText(/이 위치에 대한 피드백/), {
      target: { value: "여기 표정을 더 날카롭게" },
    });
    expect(screen.getByText(/원하는 느낌의 레퍼런스를 하나 붙이면 왕복이 줄어요/)).toBeTruthy();
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    expect(handlers.onAddPin).toHaveBeenCalledWith({
      x: 0.3,
      y: 0.5,
      body: "여기 표정을 더 날카롭게",
      urgent: false,
    });
  });

  it("pin-or-text 단계에서도 본문 없는 제출은 패킷 평가로 막힌다", () => {
    const { handlers, container } = renderFeedback({ stageId: "review" });
    enterPlacingAndDropPin(container);
    const submit = screen.getByRole("button", { name: "핀 꽂기" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(handlers.onAddPin).not.toHaveBeenCalled();
  });
});
