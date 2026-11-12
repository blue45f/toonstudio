// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getActiveEditorStatusSlot,
  getActiveModalStatusSlot,
  getActiveServiceStatusSlot,
  registerEditorStatusSlot,
  registerModalStatusSlot,
  subscribeModalStatusSlot,
} from "./modal-status-slot";

const releases: (() => void)[] = [];
afterEach(() => {
  for (const release of releases.splice(0).reverse()) release();
});

function editor() {
  const element = document.createElement("div");
  const summary = document.createElement("span");
  releases.push(registerEditorStatusSlot(element, summary));
  return { element, summary };
}

describe("서비스 알림 자리의 모달 우선순위와 편집기 복귀", () => {
  it("편집기 자리가 나중에 등록돼도 이미 열린 모달의 알림을 빼앗지 않는다", () => {
    const modal = document.createElement("div");
    releases.push(registerModalStatusSlot(modal));
    const fallback = editor();

    expect(getActiveServiceStatusSlot()).toMatchObject({ kind: "modal", element: modal });
    expect(getActiveEditorStatusSlot()).toMatchObject({ kind: "editor", ...fallback });
    expect(getActiveModalStatusSlot()).toBe(modal);
  });

  it("상위 모달을 닫으면 아래 모달, 마지막 모달을 닫으면 같은 편집기 자리로 돌아온다", () => {
    const fallback = editor();
    const lower = document.createElement("div");
    const upper = document.createElement("div");
    const closeLower = registerModalStatusSlot(lower);
    const closeUpper = registerModalStatusSlot(upper);
    releases.push(closeLower, closeUpper);

    expect(getActiveModalStatusSlot()).toBe(upper);
    closeUpper();
    expect(getActiveModalStatusSlot()).toBe(lower);
    closeLower();
    expect(getActiveServiceStatusSlot()).toMatchObject({ kind: "editor", ...fallback });
  });

  it("편집기 교체와 해제 뒤에는 이전 편집기로 복귀하고 마지막에는 기본 배치로 돌아간다", () => {
    const first = editor();
    const second = editor();
    expect(getActiveEditorStatusSlot()?.element).toBe(second.element);
    releases[1]?.();
    expect(getActiveEditorStatusSlot()?.element).toBe(first.element);
    releases[0]?.();
    expect(getActiveServiceStatusSlot()).toBeNull();
    expect(getActiveEditorStatusSlot()).toBeNull();
  });

  it("등록·해제 때 구독자에게 알리고 이미 해제한 자리는 다시 알리지 않는다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeModalStatusSlot(listener);
    releases.push(unsubscribe);
    const close = registerModalStatusSlot(document.createElement("div"));
    releases.push(close);
    expect(listener).toHaveBeenCalledTimes(1);
    close();
    close();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
