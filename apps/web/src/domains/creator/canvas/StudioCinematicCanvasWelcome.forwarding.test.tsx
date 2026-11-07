// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_CREATION_MODE_EVENT } from "../studio-creation-mode";
import { StudioCinematicCanvasWelcome } from "./StudioCinematicCanvasWelcome";
import type { StudioCanvasStartMethodsProps } from "./StudioCanvasStartMethods";

type ForwardedProps = StudioCanvasStartMethodsProps & {
  loadingLabel: string;
  errorLabel: string;
  retryLabel: string;
  onRestoreFocus: () => void;
};
const chunks = vi.hoisted(() => ({
  pending: [] as { resolve: () => void; reject: (error: Error) => void }[],
  props: [] as ForwardedProps[],
}));
vi.mock("@/shared/lib/chunk-load-recovery", () => ({
  loadChunkWithReloadRecovery: async <T,>(load: () => Promise<T>) => {
    await new Promise<void>((resolve, reject) => chunks.pending.push({ resolve, reject }));
    return load();
  },
}));
// 경계의 실제 전달 값을 관측하되 원래 child 렌더/이벤트는 그대로 실행한다.
vi.mock("./StudioCanvasStartMethods", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./StudioCanvasStartMethods")>();
  return { ...actual, StudioCanvasStartMethods: (props: ForwardedProps) => {
    chunks.props.push(props);
    return <actual.StudioCanvasStartMethods {...props} />;
  } };
});

beforeEach(() => { window.localStorage.clear(); chunks.pending = []; chunks.props = []; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });
function more() { return screen.getByRole("button", { name: "다른 시작 방법" }); }
async function complete(error?: Error) {
  const chunk = chunks.pending.shift();
  if (!chunk) throw new Error("대기 중인 청크가 없습니다.");
  await act(async () => { if (error) chunk.reject(error); else chunk.resolve(); });
}
async function open() {
  more().focus(); fireEvent.click(more()); await complete();
  await screen.findByRole("heading", { name: "첫 장면을 어떻게 시작할까요?" });
}
function noBoundaryPropsInDom(container: HTMLElement) {
  const names = ["loadinglabel", "errorlabel", "retrylabel", "onrestorefocus"];
  for (const element of container.querySelectorAll("*")) {
    for (const name of names) expect(element.hasAttribute(name)).toBe(false);
  }
  expect(container.textContent).not.toContain("시작 방법을 불러오는 중");
  expect(container.textContent).not.toContain("시작 방법을 불러오지 못했어요");
  expect(container.textContent).not.toContain("시작 방법 다시 불러오기");
}

describe("시작 방법 경계의 props 전달", () => {
  it("초기4행동을 유지하고 실제 child로 전달된 boundary-only 값은 DOM에 내보내지 않는다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<StudioCinematicCanvasWelcome pageKey="forward" visible onOpenTutorial={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(chunks.pending).toHaveLength(0);
    await open();
    const props = chunks.props.at(-1)!;
    expect(Object.keys(props).sort()).toEqual(["scenesOpen", "onToggleScenes", "onLaunch", "onOpenTutorial", "onCloseWithEscape", "loadingLabel", "errorLabel", "retryLabel", "onRestoreFocus"].sort());
    expect(props.scenesOpen).toBe(false);
    expect(props.loadingLabel).toBe("시작 방법을 불러오는 중…");
    expect(typeof props.onRestoreFocus).toBe("function");
    noBoundaryPropsInDom(container);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each(["draw", "story", "character", "background", "assets", "ai"])("%s 실제 버튼의 원래 이벤트를 정확히 한 번 전달한다", async (mode) => {
    const listener = vi.fn(); window.addEventListener(STUDIO_CREATION_MODE_EVENT, listener);
    try {
      const { container } = render(<StudioCinematicCanvasWelcome pageKey={mode} visible />);
      await open(); noBoundaryPropsInDom(container);
      fireEvent.click(container.querySelector(`[data-canvas-start-mode="${mode}"]`)!);
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]?.[0].detail).toEqual({ mode });
      expect(container.childElementCount).toBe(0);
    } finally { window.removeEventListener(STUDIO_CREATION_MODE_EVENT, listener); }
  });

  it("설명 토글은 기존 값을 갱신하고 실제 tutorial callback도 한 번만 실행한다", async () => {
    const tutorial = vi.fn();
    const { container } = render(<StudioCinematicCanvasWelcome pageKey="tutorial" visible onOpenTutorial={tutorial} />);
    await open();
    const toggle = screen.getByRole("button", { name: "예시 장면" });
    fireEvent.click(toggle); expect(chunks.props.at(-1)?.scenesOpen).toBe(true);
    expect(screen.getByRole("list", { name: "예시 장면" }).children).toHaveLength(6);
    fireEvent.click(toggle); expect(chunks.props.at(-1)?.scenesOpen).toBe(false);
    noBoundaryPropsInDom(container);
    fireEvent.click(screen.getByRole("button", { name: "처음이라면 사용법 따라 하기" }));
    expect(tutorial).toHaveBeenCalledOnce(); expect(container.childElementCount).toBe(0);
  });

  it("첫 로딩 실패·명시retry·Escape·재열기에서도 focus와 boundary 경계를 보존한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<StudioCinematicCanvasWelcome pageKey="retry" visible />);
    const trigger = more(); trigger.focus(); fireEvent.click(trigger);
    expect(screen.getByRole("status")).toBeTruthy();
    await complete(new Error("loading failed"));
    expect(screen.getByRole("alert")).toBeTruthy(); expect(document.activeElement).toBe(trigger);
    const retry = screen.getByRole("button", { name: "시작 방법 다시 불러오기" }); retry.focus(); fireEvent.click(retry);
    expect(document.activeElement).toBe(trigger); await complete();
    const action = await screen.findByRole("button", { name: /캐릭터 배치/u });
    noBoundaryPropsInDom(container); action.focus(); fireEvent.keyDown(action, { key: "Escape" });
    const reopen = screen.getByRole("button", { name: /시작 방법 보기/u });
    expect(document.activeElement).toBe(reopen); fireEvent.click(reopen); await complete();
    await screen.findByRole("heading"); expect(document.activeElement).toBe(more());
    noBoundaryPropsInDom(container);
  });
});
