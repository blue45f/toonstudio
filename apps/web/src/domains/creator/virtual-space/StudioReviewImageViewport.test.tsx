// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioReviewImageViewport } from "./StudioReviewImageViewport";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const view = (width: number, height: number, change = vi.fn()) =>
  <StudioReviewImageViewport renderWidth={width} renderHeight={height} label="검수 원고" onViewChange={change}>
    <img alt="고정 원고" src="/original.png" />
  </StudioReviewImageViewport>;

describe("긴 검수 원고의 표시 배율", () => {
  it("긴 세로 원고는 폭 맞춤으로 열고 키보드로 스크롤 영역에 접근한다", () => {
    const rendered = render(view(800, 16000));
    expect((screen.getByRole("combobox", { name: "원고 배율" }) as HTMLSelectElement).value).toBe("fit-width");
    expect(screen.getByRole("region", { name: "검수 원고" }).tabIndex).toBe(0);
    const stage = rendered.container.querySelector<HTMLElement>("[data-review-image-scale]");
    expect(stage?.style.width).toBe("100%");
    expect(stage?.style.aspectRatio).toBe("800 / 16000");
  });

  it("일반 페이지는 전체 보기로 열고 원본 파일 대신 표시 폭만 확대한다", () => {
    const change = vi.fn(), rendered = render(view(800, 1200, change));
    const select = screen.getByRole("combobox", { name: "원고 배율" });
    expect((select as HTMLSelectElement).value).toBe("fit-page");
    fireEvent.change(select, { target: { value: "200" } });
    expect(rendered.container.querySelector<HTMLElement>("[data-review-image-scale]")?.style.width).toBe("200%");
    expect(screen.getByRole("img").getAttribute("src")).toBe("/original.png");
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("이미지 읽기 주소가 갱신돼도 같은 페이지의 배율을 초기화하지 않는다", () => {
    const rendered = render(view(800, 16000));
    fireEvent.change(screen.getByRole("combobox", { name: "원고 배율" }), { target: { value: "150" } });
    rendered.rerender(<StudioReviewImageViewport renderWidth={800} renderHeight={16000} label="검수 원고">
      <img alt="고정 원고" src="/renewed.png" />
    </StudioReviewImageViewport>);
    expect((screen.getByRole("combobox", { name: "원고 배율" }) as HTMLSelectElement).value).toBe("150");
    expect(screen.getByRole("img").getAttribute("src")).toBe("/renewed.png");
  });

  it("맨 위 이동은 viewport에만 적용하고 키보드 초점을 돌려준다", () => {
    const change = vi.fn();
    render(view(800, 16000, change));
    const region = screen.getByRole("region", { name: "검수 원고" }), scroll = vi.fn();
    Object.defineProperty(region, "scrollTo", { configurable: true, value: scroll });
    fireEvent.click(screen.getByRole("button", { name: "원고 맨 위로" }));
    expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0 });
    expect(document.activeElement).toBe(region);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("저장된 하단 의견은 정규화된 위치로 이동하고 같은 요청을 반복 적용하지 않는다", () => {
    const rendered = render(view(800, 16000));
    const region = screen.getByRole("region", { name: "검수 원고" }), scroll = vi.fn();
    Object.defineProperties(region, { scrollTo: { configurable: true, value: scroll },
      clientWidth: { configurable: true, value: 400 }, clientHeight: { configurable: true, value: 600 } });
    const stage = region.firstElementChild;
    if (!stage) throw new Error("원고 표시 stage가 없습니다.");
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 400, bottom: 8000,
      width: 400, height: 8000, x: 0, y: 0, toJSON: () => ({}) });
    const target = { x: 0.2, y: 0.75, request: 1 };
    const focused = () => <StudioReviewImageViewport renderWidth={800} renderHeight={16000} label="검수 원고" focusPoint={{ ...target }}>
      <img alt="고정 원고" src="/original.png" />
    </StudioReviewImageViewport>;
    rendered.rerender(focused());
    expect(scroll).toHaveBeenCalledWith({ left: 0, top: 5700 });
    expect(document.activeElement).toBe(region);
    rendered.rerender(focused());
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(target).toEqual({ x: 0.2, y: 0.75, request: 1 });
  });

  it("이동 도구에서는 마우스로 원고를 끌고 touch의 native scroll은 가로채지 않는다", () => {
    render(<StudioReviewImageViewport renderWidth={800} renderHeight={16000} label="검수 원고" panning>
      <img alt="고정 원고" src="/original.png" />
    </StudioReviewImageViewport>);
    const region = screen.getByRole("region", { name: "검수 원고" });
    region.scrollTop = 1000; region.scrollLeft = 300;
    const pointer = (type: string, x: number, y: number, pointerType = "mouse") => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
      Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: pointerType } });
      fireEvent(region, event); return event;
    };
    pointer("pointerdown", 200, 300); pointer("pointermove", 150, 200); pointer("pointerup", 150, 200);
    expect(region.scrollTop).toBe(1100); expect(region.scrollLeft).toBe(350);
    expect(document.activeElement).toBe(region);
    const touch = pointer("pointerdown", 200, 300, "touch");
    pointer("pointermove", 150, 200, "touch");
    expect(touch.defaultPrevented).toBe(false);
    expect(region.scrollTop).toBe(1100);
  });
});
