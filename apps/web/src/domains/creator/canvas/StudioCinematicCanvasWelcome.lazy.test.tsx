// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_CREATION_MODE_EVENT } from "../studio-creation-mode";
import { StudioCinematicCanvasWelcome } from "./StudioCinematicCanvasWelcome";
import { STUDIO_CANVAS_START_DOCK_STORAGE_KEY } from "./studio-canvas-start-dock-preference";
import { useStudioCanvasStartDockExpanded } from "./studio-canvas-start-dock-state";

// 실제 lazy·동적 import·선택지는 유지하고 네트워크 완료 시점만 통제한다.
const chunks = vi.hoisted(() => ({
  pending: [] as { resolve: () => void; reject: (error: Error) => void }[],
  requested: vi.fn(),
}));
vi.mock("@/shared/lib/chunk-load-recovery", () => ({
  loadChunkWithReloadRecovery: async <T,>(load: () => Promise<T>, chunkId: string) => {
    chunks.requested(chunkId);
    await new Promise<void>((resolve, reject) => chunks.pending.push({ resolve, reject }));
    return load();
  },
}));

beforeEach(() => {
  window.localStorage.clear();
  chunks.pending = [];
  chunks.requested.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function openWays() {
  const button = screen.getByRole("button", { name: "다른 시작 방법" });
  button.focus();
  fireEvent.click(button);
  return button;
}

async function completeChunk() {
  const chunk = chunks.pending.shift();
  if (!chunk) throw new Error("완료할 지연 청크가 없습니다.");
  await act(async () => { chunk.resolve(); });
}

async function loadWays() {
  openWays();
  await completeChunk();
  await screen.findByRole("heading", { name: "첫 장면을 어떻게 시작할까요?" });
}

describe("시작 방법 지연 경계", () => {
  it("초회 네 버튼은 즉시 사용하고 닫힌 선택지 청크는 요청하지 않는다", () => {
    render(<button>캔버스</button>);
    const canvas = screen.getByRole("button", { name: "캔버스" });
    canvas.focus();
    const { container } = render(<StudioCinematicCanvasWelcome pageKey="one" visible onOpenTutorial={vi.fn()} />);
    expect(chunks.requested).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(canvas);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(container.querySelectorAll("[data-canvas-start-mode], [data-canvas-scene-example]")).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("펼치기 로딩에 이름을 붙이고 완료 전후 초점과 dockOpen 계약을 지킨다", async () => {
    const dock = renderHook(() => useStudioCanvasStartDockExpanded());
    render(<StudioCinematicCanvasWelcome pageKey="one" visible onOpenTutorial={vi.fn()} />);
    expect(dock.result.current).toBe(true);
    const trigger = openWays();
    expect(chunks.requested).toHaveBeenCalledExactlyOnceWith("StudioCanvasStartMethods");
    expect(screen.getByRole("status").textContent).toBe("시작 방법을 불러오는 중…");
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(document.activeElement).toBe(trigger);
    expect(document.getElementById(trigger.getAttribute("aria-controls") ?? "")).toBeTruthy();
    await completeChunk();
    await screen.findByRole("heading");
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole("status")).toBeNull();
    expect(dock.result.current).toBe(true);
    fireEvent.click(trigger);
    expect(dock.result.current).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "시작 안내 닫기" }));
    expect(dock.result.current).toBe(false);
  });

  it("로딩 중 다른 시작 방법을 다시 접으면 늦은 완료가 닫힌 패널을 되살리지 않는다", async () => {
    render(<StudioCinematicCanvasWelcome pageKey="one" visible />);
    const trigger = openWays();
    fireEvent.click(trigger);
    await completeChunk();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await loadWays();
    expect(screen.getByRole("heading")).toBeTruthy();
  });

  it("로딩 중 Escape·닫기·재열기를 반복해도 초점과 선택지가 살아 있다", async () => {
    render(<StudioCinematicCanvasWelcome pageKey="one" visible />);
    for (const close of ["Escape", "click", "Escape"]) {
      if (screen.queryByRole("button", { name: "다른 시작 방법" })) openWays();
      else fireEvent.click(screen.getByRole("button", { name: /시작 방법 보기/u }));
      const trigger = screen.getByRole("button", { name: "다른 시작 방법" });
      expect(document.activeElement).toBe(trigger);
      if (close === "Escape") fireEvent.keyDown(trigger, { key: "Escape" });
      else fireEvent.click(screen.getByRole("button", { name: "시작 안내 닫기" }));
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /시작 방법 보기/u }));
      await completeChunk();
      expect(screen.queryByRole("heading")).toBeNull();
    }
    fireEvent.click(screen.getByRole("button", { name: /시작 방법 보기/u }));
    await completeChunk();
    const action = await screen.findByRole("button", { name: /캐릭터 배치/u });
    action.focus();
    fireEvent.keyDown(action, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /시작 방법 보기/u }));
  });

  it.each(["draw", "tutorial"])("로딩 중 %s 즉시 실행은 한 번만 호출되고 늦은 완료로 재등장하지 않는다", async (action) => {
    const tutorial = vi.fn();
    const listener = vi.fn();
    window.addEventListener(STUDIO_CREATION_MODE_EVENT, listener);
    try {
      render(<StudioCinematicCanvasWelcome pageKey="one" visible onOpenTutorial={tutorial} />);
      openWays();
      fireEvent.click(screen.getByRole("button", { name: action === "draw" ? "바로 그리기" : "사용법 따라 하기" }));
      await completeChunk();
      expect(screen.queryByRole("region")).toBeNull();
      expect(tutorial).toHaveBeenCalledTimes(action === "tutorial" ? 1 : 0);
      expect(listener).toHaveBeenCalledTimes(action === "draw" ? 1 : 0);
      if (action === "draw") expect(listener.mock.calls[0]?.[0].detail).toEqual({ mode: "draw" });
    } finally {
      window.removeEventListener(STUDIO_CREATION_MODE_EVENT, listener);
    }
  });

  it("예시 펼침은 다른 시작 방법의 임시 접기에는 유지하고 도크 닫기에는 초기화한다", async () => {
    render(<StudioCinematicCanvasWelcome pageKey="one" visible />);
    await loadWays();
    fireEvent.click(screen.getByRole("button", { name: "예시 장면" }));
    expect(screen.getByRole("list", { name: "예시 장면" }).children).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "다른 시작 방법" }));
    await loadWays();
    expect(screen.getByRole("list", { name: "예시 장면" }).children).toHaveLength(6);
    const background = screen.getByRole("button", { name: "배경 도구 열기" });
    background.focus();
    fireEvent.keyDown(background, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /시작 방법 보기/u }));
    await completeChunk();
    await screen.findByRole("heading");
    expect(screen.queryByRole("list", { name: "예시 장면" })).toBeNull();
  });

  it("지연된 선택지의 사용법 콜백도 원래 순서로 한 번 실행한다", async () => {
    const tutorial = vi.fn();
    render(<StudioCinematicCanvasWelcome pageKey="one" visible onOpenTutorial={tutorial} />);
    await loadWays();
    fireEvent.click(screen.getByRole("button", { name: "처음이라면 사용법 따라 하기" }));
    expect(tutorial).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region")).toBeNull();
    expect(window.localStorage.getItem(STUDIO_CANVAS_START_DOCK_STORAGE_KEY)).toBe("collapsed");
  });

  it("청크 오류는 선택지 안에서 알리고 재시도 중 초점과 즉시 실행 버튼을 남긴다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<StudioCinematicCanvasWelcome pageKey="one" visible onOpenTutorial={vi.fn()} />);
    const trigger = openWays();
    const chunk = chunks.pending.shift();
    if (!chunk) throw new Error("실패시킬 지연 청크가 없습니다.");
    await act(async () => { chunk.reject(new Error("시험용 청크 오류")); });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole("button", { name: "바로 그리기" })).toBeTruthy();
    expect(window.localStorage.getItem(STUDIO_CANVAS_START_DOCK_STORAGE_KEY)).toBeNull();
    const retry = screen.getByRole("button", { name: "시작 방법 다시 불러오기" });
    retry.focus();
    fireEvent.click(retry);
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole("status")).toBeTruthy();
    await completeChunk();
    await screen.findByRole("heading");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("로딩 중 visible=false가 되면 늦은 청크 완료도 안전 표시 경계를 넘지 않는다", async () => {
    const view = render(<StudioCinematicCanvasWelcome pageKey="one" visible />);
    openWays();
    view.rerender(<StudioCinematicCanvasWelcome pageKey="one" visible={false} />);
    await completeChunk();
    expect(view.container.childElementCount).toBe(0);
    view.rerender(<StudioCinematicCanvasWelcome pageKey="one" visible />);
    await completeChunk();
    await screen.findByRole("heading");
  });
});

it("예시 목록은 Tab 초점·기본 화살표 스크롤·Escape 복귀를 제공한다", async () => {
  render(<StudioCinematicCanvasWelcome pageKey="examples-keyboard" visible />);
  await loadWays();
  fireEvent.click(screen.getByRole("button", { name: "예시 장면" }));
  const list = screen.getByRole("list", { name: "예시 장면" });
  expect(list.tabIndex).toBe(0);
  expect(list.getAttribute("data-studio-shortcut-boundary")).toBe("true");
  list.focus();
  expect(document.activeElement).toBe(list);
  const arrow = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
  list.dispatchEvent(arrow);
  expect(arrow.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(list);
  fireEvent.keyDown(list, { key: "Escape" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /시작 방법 보기/u }));
});
