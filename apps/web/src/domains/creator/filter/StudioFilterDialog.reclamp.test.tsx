// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioUiPreferencesRepository } from "../studio-ui-preferences-sqlite";

import { StudioFilterDialog } from "./StudioFilterDialog";

const MARGIN = 12;
const PANEL = { width: 544, height: 275 };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

/**
 * 가운데 정렬된 패널은 적용된 translate 만큼만 움직인다. 브라우저의 getBoundingClientRect 가
 * "마지막으로 화면에 반영된 translate" 를 반영하는 관계를 그대로 흉내 낸다 — React 가 새 위치를
 * 반영하기 전에는 사각형도 옛 위치를 가리킨다.
 */
function appliedTranslate(dialog: HTMLElement) {
  // 가운데(0, 0)에서는 인라인 translate 가 아예 없다.
  const [x = "", y = ""] = dialog.style.translate.split(" ");
  return { x: Number.parseFloat(x) || 0, y: Number.parseFloat(y) || 0 };
}

function stubDialogRect(dialog: HTMLElement) {
  vi.spyOn(dialog, "getBoundingClientRect").mockImplementation(() => {
    const applied = appliedTranslate(dialog);
    // 좁은 화면에서는 패널 너비가 화면 너비에서 양쪽 여백을 뺀 값으로 줄어든다.
    const width = Math.min(PANEL.width, window.innerWidth - MARGIN * 2);
    const left = (window.innerWidth - width) / 2 + applied.x;
    const top = (window.innerHeight - PANEL.height) / 2 + applied.y;
    return {
      left, top, right: left + width, bottom: top + PANEL.height,
      width, height: PANEL.height, x: left, y: top, toJSON: () => ({}),
    };
  });
}

function setupDialog() {
  const values = new Map<string, string>();
  const repository = createStudioUiPreferencesRepository({
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  });
  render(
    <StudioFilterDialog
      activeKey="reclamp-regression"
      kind="motion-blur"
      image={{}}
      rootRef={createRef<HTMLElement>()}
      acquireUiPreferences={async () => repository}
      onPreview={vi.fn()}
      onApply={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  const dialog = screen.getByRole("dialog");
  const handle = screen.getByRole("button", { name: /필터 창 옮기기/u });
  stubDialogRect(dialog);
  // 모듈에 남은 이전 시험의 위치를 지우고 가운데로 되돌린다.
  fireEvent.keyDown(handle, { key: "Enter" });
  return { dialog, handle };
}

function expectWithinViewport(dialog: HTMLElement, width: number, height: number) {
  const box = dialog.getBoundingClientRect();
  expect(box.top).toBeGreaterThanOrEqual(MARGIN - 0.5);
  expect(box.left).toBeGreaterThanOrEqual(MARGIN - 0.5);
  expect(box.bottom).toBeLessThanOrEqual(height - MARGIN + 0.5);
  expect(box.right).toBeLessThanOrEqual(width - MARGIN + 0.5);
}

describe("필터 창 위치 보정", () => {
  it("창이 작아져 크기 변경 알림이 한 프레임에 두 번 와도 패널을 화면 밖으로 밀지 않는다", () => {
    setViewport(430, 932);
    const { dialog, handle } = setupDialog();
    expectWithinViewport(dialog, 430, 932);

    // 세로로 긴 화면 아래쪽에 크게 옮겨 둔다(48px × 4 + 12px).
    for (let step = 0; step < 4; step += 1) {
      fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    }
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(appliedTranslate(dialog).y).toBe(204);

    // 가로로 누운 작은 화면으로 줄인다. 창 resize 와 ResizeObserver 알림은 React 가 첫 보정을
    // 화면에 반영하기 전에 연달아 도착하므로, 같은 갱신 안에서 두 번 발생시킨다.
    act(() => {
      setViewport(568, 320);
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    });

    expectWithinViewport(dialog, 568, 320);
  });

  it("보정 알림이 한 번만 와도 같은 결과로 화면 안에 들어온다", () => {
    setViewport(430, 932);
    const { dialog, handle } = setupDialog();
    for (let step = 0; step < 4; step += 1) {
      fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    }

    act(() => {
      setViewport(568, 320);
      window.dispatchEvent(new Event("resize"));
    });

    expectWithinViewport(dialog, 568, 320);
  });

  it("위로 올려 둔 패널도 줄어든 화면에서 위쪽 여백 안에 남는다", () => {
    setViewport(844, 390);
    const { dialog, handle } = setupDialog();
    for (let step = 0; step < 3; step += 1) {
      fireEvent.keyDown(handle, { key: "ArrowUp", shiftKey: true });
    }

    act(() => {
      setViewport(568, 320);
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    });

    expectWithinViewport(dialog, 568, 320);
  });
});
