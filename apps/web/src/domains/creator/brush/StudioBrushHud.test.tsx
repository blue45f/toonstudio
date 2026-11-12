// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_POINTER_DISTANCE_BUDGETS_PX } from "../studio-oncanvas-command-surfaces";

import { StudioBrushHud, type StudioBrushHudHandlers } from "./StudioBrushHud";

function handlers(overrides: Partial<StudioBrushHudHandlers> = {}): StudioBrushHudHandlers {
  return {
    onStrokeWidthChange: vi.fn(),
    onOpacityChange: vi.fn(),
    onOpenColorWheel: vi.fn(),
    onToggleEraser: vi.fn(),
    ...overrides,
  };
}

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.getBoundingClientRect = () =>
    ({ left: 224, top: 44, width: 900, height: 800, right: 1124, bottom: 844, x: 224, y: 44 }) as DOMRect;
  document.body.append(host);
  return host;
}

function renderHud(
  props: Partial<Parameters<typeof StudioBrushHud>[0]> = {},
  bag: StudioBrushHudHandlers = handlers()
) {
  const host = mountHost();
  const ref = createRef<HTMLDivElement>();
  (ref as { current: HTMLDivElement | null }).current = host;
  const result = render(
    <StudioBrushHud
      visible
      strokeWidth={12}
      brushOpacity={0.8}
      color="#7c5cfc"
      eraserActive={false}
      handedness="right"
      canvasHostRef={ref}
      stableHandlers={bag}
      {...props}
    />
  );
  return { ...result, host, bag };
}

/** The HUD is a pointer affordance: it stays out of the a11y tree until the
 * pointer is actually over the canvas. Tests that assert on its controls have to
 * bring it on screen first. */
function revealHud(host: HTMLElement) {
  fireEvent.pointerMove(host, { clientX: 600, clientY: 400 });
  flushFrames();
  return host;
}

let rafQueue: FrameRequestCallback[] = [];

beforeEach(() => {
  rafQueue = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Visibility is written imperatively, so state assertions read the node directly. */
function hudNode(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-studio-brush-hud="true"]');
  if (!node) throw new Error("brush HUD not mounted");
  return node;
}

function flushFrames() {
  const queued = rafQueue;
  rafQueue = [];
  for (const callback of queued) callback(0);
}

describe("StudioBrushHud", () => {
  it("renders 크기·불투명도·색·펜/지우개 as one reachable toolbar", () => {
    const { host } = renderHud();
    revealHud(host);
    const hud = screen.getByRole("toolbar", { name: "브러시 HUD" });
    expect(hud.dataset.studioShortcutBoundary).toBe("true");
    expect(screen.getByRole("slider", { name: "캔버스 브러시 크기" })).toHaveProperty(
      "ariaValueText",
      "12px"
    );
    expect(screen.getByRole("slider", { name: "캔버스 브러시 불투명도" })).toHaveProperty(
      "ariaValueText",
      "80%"
    );
    expect(screen.getByRole("button", { name: /색 선택/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: "지우개로 전환" })).toBeTruthy();
  });

  it("keeps the whole cluster inside the 80px budget", () => {
    const { host } = renderHud();
    revealHud(host);
    const hud = screen.getByRole("toolbar", { name: "브러시 HUD" });
    const extent = Number.parseFloat(hud.style.width);
    // A 2×2 cluster placed at radius r: the far cell centre is
    // hypot(cellOffset, r + cellOffset). The DOM only carries the extent, so the
    // budget check is the cluster's own half-diagonal plus the tether radius.
    expect(Math.hypot(extent / 2, extent / 2)).toBeLessThan(
      STUDIO_POINTER_DISTANCE_BUDGETS_PX.brushHud
    );
  });

  it("hides for the duration of a stroke and comes back on lift", () => {
    const { host } = renderHud();
    const hud = hudNode();

    revealHud(host);
    expect(hud.style.visibility).toBe("visible");

    fireEvent.pointerDown(host, { clientX: 600, clientY: 400 });
    flushFrames();
    expect(hud.style.visibility).toBe("hidden");

    fireEvent.pointerMove(host, { clientX: 640, clientY: 440 });
    flushFrames();
    expect(hud.style.visibility).toBe("hidden");

    fireEvent.pointerUp(host, { clientX: 640, clientY: 440 });
    flushFrames();
    expect(hud.style.visibility).toBe("visible");
  });

  it("hides once the pointer leaves the canvas", () => {
    const { host } = renderHud();
    const hud = hudNode();
    revealHud(host);
    expect(hud.style.visibility).toBe("visible");
    // A panel floating over the canvas host is not the canvas.
    fireEvent.pointerMove(document.body, { clientX: 20, clientY: 20 });
    flushFrames();
    expect(hud.style.visibility).toBe("hidden");
  });

  it("routes value edits to the shared setters", () => {
    const bag = handlers();
    const { host } = renderHud({}, bag);
    revealHud(host);
    fireEvent.keyDown(screen.getByRole("slider", { name: "캔버스 브러시 크기" }), {
      key: "ArrowRight",
    });
    expect(bag.onStrokeWidthChange).toHaveBeenCalledWith(13);

    fireEvent.keyDown(screen.getByRole("slider", { name: "캔버스 브러시 불투명도" }), {
      key: "ArrowLeft",
    });
    expect(bag.onOpacityChange).toHaveBeenCalledWith(0.79);

    fireEvent.click(screen.getByRole("button", { name: "지우개로 전환" }));
    expect(bag.onToggleEraser).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /색 선택/u }));
    expect(bag.onOpenColorWheel).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while no drawing tool is active", () => {
    renderHud({ visible: false });
    expect(document.querySelector('[data-studio-brush-hud="true"]')).toBeNull();
  });
});

function mountStartGuide(host: HTMLElement, state = "true") {
  const guide = document.createElement("section");
  guide.dataset.studioCinematicCanvasWelcome = state;
  const button = document.createElement("button");
  const label = document.createElement("span");
  label.textContent = "다른 시작 방법";
  button.append(label);
  guide.append(button);
  host.append(guide);
  return { guide, button, label };
}

describe("시작 도크와 실제 그리기 영역 구분", () => {
  it.each(["true", "collapsed"])("%s 시작 도크의 중첩 버튼 이동·클릭으로 HUD를 띄우지 않는다", (state) => {
    const { host } = renderHud();
    const { button, label } = mountStartGuide(host, state);
    const clicked = vi.fn();
    button.addEventListener("click", clicked);
    expect(fireEvent.pointerMove(label, { clientX: 600, clientY: 400 })).toBe(true);
    flushFrames();
    expect(hudNode().style.visibility).toBe("hidden");
    expect(fireEvent.pointerDown(label, { clientX: 600, clientY: 400 })).toBe(true);
    flushFrames();
    expect(fireEvent.pointerUp(label, { clientX: 600, clientY: 400 })).toBe(true);
    flushFrames();
    fireEvent.click(label);
    expect(clicked).toHaveBeenCalledOnce();
    expect(hudNode().style.visibility).toBe("hidden");
    expect(hudNode().style.pointerEvents).toBe("none");
  });

  it("이미 커서를 따르던 HUD의 근접 latch보다 시작 도크 UI를 우선한다", () => {
    const { host } = renderHud();
    const { label } = mountStartGuide(host);
    revealHud(host);
    expect(hudNode().style.visibility).toBe("visible");
    fireEvent.pointerMove(label, { clientX: 600, clientY: 400 });
    flushFrames();
    expect(hudNode().style.visibility).toBe("hidden");
    fireEvent.pointerDown(label, { clientX: 600, clientY: 400 });
    fireEvent.pointerUp(label, { clientX: 600, clientY: 400 });
    flushFrames();
    expect(hudNode().style.visibility).toBe("hidden");
  });

  it("도크에서 벗어나면 실제 캔버스 추적과 스트로크 동안 숨김을 그대로 복구한다", () => {
    const { host } = renderHud();
    const { label } = mountStartGuide(host);
    revealHud(host);
    fireEvent.pointerMove(label, { clientX: 600, clientY: 400 });
    flushFrames();
    revealHud(host);
    expect(hudNode().style.visibility).toBe("visible");
    fireEvent.pointerDown(host, { clientX: 600, clientY: 400 });
    flushFrames();
    expect(hudNode().style.visibility).toBe("hidden");
    fireEvent.pointerMove(host, { clientX: 640, clientY: 440 });
    flushFrames();
    expect(hudNode().style.visibility).toBe("hidden");
    fireEvent.pointerUp(host, { clientX: 640, clientY: 440 });
    flushFrames();
    expect(hudNode().style.visibility).toBe("visible");
  });

  it("시작 도크의 실측 사각형도 HUD 배치 장애물로 고려한다", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const { host } = renderHud();
    const { guide } = mountStartGuide(host);
    guide.getBoundingClientRect = () => new DOMRect(550, 300, 100, 90);
    revealHud(host);
    const values = hudNode().style.transform.match(/translate3d\(([-\d]+)px, ([-\d]+)px/u);
    expect(values).not.toBeNull();
    if (!values) throw new Error("HUD 위치가 없습니다.");
    const left = Number(values[1]), top = Number(values[2]);
    const size = Number.parseFloat(hudNode().style.width);
    const overlap = Math.max(0, Math.min(left + size, 650) - Math.max(left, 550))
      * Math.max(0, Math.min(top + size, 390) - Math.max(top, 300));
    expect(overlap).toBe(0);
  });
});


describe("보조 협업 UI와 실제 스크롤포트 경계", () => {
  it.each(["studioCollaborationSummary", "studioCollaborationBody"])("%s의 pointerup을 원고 위 획 종료로 오인하지 않는다", (attribute) => {
    const { host, bag } = renderHud();
    const control = document.createElement(attribute === "studioCollaborationSummary" ? "summary" : "div");
    control.dataset[attribute] = "true";
    const label = document.createElement("span");
    label.textContent = "함께 작업";
    control.append(label); host.append(control);
    const clicked = vi.fn(); control.addEventListener("click", clicked);
    revealHud(host); expect(hudNode().style.visibility).toBe("visible");
    for (const dispatch of [fireEvent.pointerMove, fireEvent.pointerDown, fireEvent.pointerUp]) {
      expect(dispatch(label, { clientX: 600, clientY: 400 })).toBe(true);
      flushFrames();
      expect(hudNode().style.visibility).toBe("hidden");
      expect(hudNode().style.pointerEvents).toBe("none");
    }
    fireEvent.click(label); expect(clicked).toHaveBeenCalledOnce();
    expect(bag.onStrokeWidthChange).not.toHaveBeenCalled();
    revealHud(host); expect(hudNode().style.visibility).toBe("visible");
    fireEvent.pointerDown(host, { clientX: 600, clientY: 400 }); flushFrames();
    expect(hudNode().style.visibility).toBe("hidden");
    fireEvent.pointerUp(host, { clientX: 600, clientY: 400 }); flushFrames();
    expect(hudNode().style.visibility).toBe("visible");
  });

  it("폭 변경으로 이전 anchor가 캔버스 밖이 되면 HUD를 숨기고 유효한 위치에서 다시 추적한다", () => {
    const { host } = renderHud(); revealHud(host);
    expect(hudNode().style.visibility).toBe("visible");
    host.getBoundingClientRect = () => new DOMRect(224, 500, 900, 344);
    fireEvent(window, new Event("resize")); flushFrames();
    expect(hudNode().style.visibility).toBe("hidden");
    fireEvent.pointerMove(host, { clientX: 600, clientY: 600 }); flushFrames();
    expect(hudNode().style.visibility).toBe("visible");
  });

  it("DOM 자식이더라도 현재 스크롤포트 위에서 끝난 접촉에 HUD를 표시하지 않는다", () => {
    const { host } = renderHud();
    host.getBoundingClientRect = () => new DOMRect(0, 254, 320, 590);
    const child = document.createElement("div"); host.append(child);
    fireEvent.pointerDown(child, { clientX: 260, clientY: 220 }); flushFrames();
    fireEvent.pointerUp(child, { clientX: 260, clientY: 220 }); flushFrames();
    expect(hudNode().style.visibility).toBe("hidden");
    expect(hudNode().style.pointerEvents).toBe("none");
  });
});
