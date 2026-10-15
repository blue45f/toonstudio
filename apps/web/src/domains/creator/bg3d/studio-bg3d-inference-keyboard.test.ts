import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_INFERENCE_VCB_ATTRIBUTE,
  attachStudioBg3dInferenceKeyboard,
  resolveStudioBg3dInferenceKeyContext,
} from "./studio-bg3d-inference-keyboard";
import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";

import type {
  StudioBg3dInferenceKeyTargetLike,
  StudioBg3dInferenceKeyboardEventLike,
  StudioBg3dInferenceKeyboardWindowLike,
} from "./studio-bg3d-inference-keyboard";

function target(
  tagName: string,
  attrs: Record<string, string> = {},
  extra: Partial<StudioBg3dInferenceKeyTargetLike> = {},
  ancestorSelectors: readonly string[] = [],
): StudioBg3dInferenceKeyTargetLike {
  return {
    tagName,
    getAttribute: (name) => attrs[name] ?? null,
    closest: (selector) => {
      for (const part of selector.split(",")) {
        const normalized = part.trim();
        if (ancestorSelectors.includes(normalized)) return {};
        const match = /^\[([\w-]+)(?:="([^"]*)")?\]$/u.exec(normalized);
        if (match) {
          const value = attrs[match[1] ?? ""];
          if (value !== undefined && (match[2] === undefined || match[2] === value)) return {};
        }
      }
      return null;
    },
    ...extra,
  };
}

describe("키 소유권 판정", () => {
  it("대상이 없거나 일반 요소(body·버튼)면 방향키를 가로챌 수 있다", () => {
    expect(resolveStudioBg3dInferenceKeyContext(null, "ArrowRight", "")).toEqual({
      fromVcb: false,
      foreignEditable: false,
      widgetOwnsArrows: false,
    });
    expect(resolveStudioBg3dInferenceKeyContext(target("BODY"), "ArrowRight", "").widgetOwnsArrows).toBe(false);
    expect(resolveStudioBg3dInferenceKeyContext(target("BUTTON"), "ArrowUp", "").widgetOwnsArrows).toBe(false);
  });

  it("다른 텍스트 입력·textarea·contenteditable은 외부 입력이고 방향키도 소유한다", () => {
    for (const element of [
      target("INPUT", {}, { type: "text" }),
      target("INPUT", {}, { type: "number" }),
      target("TEXTAREA"),
      target("DIV", {}, { isContentEditable: true }),
    ]) {
      const context = resolveStudioBg3dInferenceKeyContext(element, "ArrowLeft", "");
      expect(context.foreignEditable).toBe(true);
      expect(context.widgetOwnsArrows).toBe(true);
    }
  });

  it("탭 목록·라디오 그룹·슬라이더·select는 방향키를 소유하지만 외부 입력은 아니다", () => {
    const tab = resolveStudioBg3dInferenceKeyContext(target("BUTTON", {}, {}, ['[role="tablist"]']), "ArrowRight", "");
    expect(tab).toEqual({ fromVcb: false, foreignEditable: false, widgetOwnsArrows: true });
    expect(resolveStudioBg3dInferenceKeyContext(target("SELECT"), "ArrowDown", "").widgetOwnsArrows).toBe(true);
    expect(
      resolveStudioBg3dInferenceKeyContext(target("INPUT", {}, { type: "range" }), "ArrowRight", "").widgetOwnsArrows,
    ).toBe(true);
    expect(
      resolveStudioBg3dInferenceKeyContext(target("DIV", {}, {}, ['[role="listbox"]']), "ArrowDown", "").widgetOwnsArrows,
    ).toBe(true);
    expect(
      resolveStudioBg3dInferenceKeyContext(target("DIV", { "data-bg3d-arrow-owner": "" }), "ArrowDown", "").widgetOwnsArrows,
    ).toBe(true);
  });

  it("우리 입력창: ↑/↓ 는 항상 잠금 키, ←/→ 는 입력이 비어 있을 때만 잠금 키", () => {
    const vcb = target("INPUT", { [STUDIO_BG3D_INFERENCE_VCB_ATTRIBUTE]: "true" }, { type: "text" });
    expect(resolveStudioBg3dInferenceKeyContext(vcb, "ArrowRight", "")).toEqual({
      fromVcb: true,
      foreignEditable: false,
      widgetOwnsArrows: false,
    });
    expect(resolveStudioBg3dInferenceKeyContext(vcb, "ArrowRight", "2.4").widgetOwnsArrows).toBe(true);
    expect(resolveStudioBg3dInferenceKeyContext(vcb, "ArrowLeft", "2.4").widgetOwnsArrows).toBe(true);
    expect(resolveStudioBg3dInferenceKeyContext(vcb, "ArrowUp", "2.4").widgetOwnsArrows).toBe(false);
    expect(resolveStudioBg3dInferenceKeyContext(vcb, "ArrowDown", "2.4").widgetOwnsArrows).toBe(false);
  });

  it("입력창 안쪽 자손에서 발생한 키도 입력창으로 본다", () => {
    const inner = target("SPAN", {}, {}, [`[${STUDIO_BG3D_INFERENCE_VCB_ATTRIBUTE}="true"]`]);
    expect(resolveStudioBg3dInferenceKeyContext(inner, "Enter", "").fromVcb).toBe(true);
  });
});

function fakeWindow() {
  const listeners = new Map<string, EventListener[]>();
  const win: StudioBg3dInferenceKeyboardWindowLike = {
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener));
    },
  };
  return {
    win,
    count: () => [...listeners.values()].reduce((sum, list) => sum + list.length, 0),
    fire(type: string, event: Partial<StudioBg3dInferenceKeyboardEventLike> & { key?: string }) {
      const spies = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
      const full = { key: "", ...event, ...spies } as StudioBg3dInferenceKeyboardEventLike;
      for (const listener of listeners.get(type) ?? []) listener(full as unknown as Event);
      return spies;
    },
  };
}

describe("창 수준 키 라우팅", () => {
  function setup() {
    const service = createStudioBg3dInferenceService({ now: () => 0, scheduler: () => () => undefined });
    const dom = fakeWindow();
    const detach = attachStudioBg3dInferenceKeyboard({ window: dom.win, service });
    return { service, dom, detach };
  }

  it("세션이 처리한 키만 기본 동작과 전파를 막는다", () => {
    const { service, dom } = setup();
    service.begin("measure", { referencePoint: [0, 0, 0] });
    const handled = dom.fire("keydown", { key: "ArrowRight" });
    expect(handled.preventDefault).toHaveBeenCalledTimes(1);
    expect(handled.stopPropagation).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().session.lock).toEqual({ kind: "axis", axis: "x" });
    const ignored = dom.fire("keydown", { key: "a" });
    expect(ignored.preventDefault).not.toHaveBeenCalled();
    expect(ignored.stopPropagation).not.toHaveBeenCalled();
  });

  it("세션이 없으면 아무 키도 가로채지 않는다 (Esc가 모달 닫기로 간다)", () => {
    const { dom } = setup();
    const esc = dom.fire("keydown", { key: "Escape" });
    expect(esc.preventDefault).not.toHaveBeenCalled();
    expect(esc.stopPropagation).not.toHaveBeenCalled();
  });

  it("Esc는 세션이 있을 때 소비되어 모달로 전파되지 않는다", () => {
    const { service, dom } = setup();
    const cancel = vi.fn();
    service.begin("measure", { referencePoint: [0, 0, 0], handlers: { cancel } });
    const esc = dom.fire("keydown", { key: "Escape" });
    expect(esc.stopPropagation).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("다른 입력창에서 치는 글자·숫자·Backspace·Esc는 건드리지 않는다", () => {
    const { service, dom } = setup();
    service.begin("measure", { referencePoint: [0, 0, 0] });
    const other = target("INPUT", {}, { type: "text" });
    for (const key of ["2", "Backspace", "Escape", "ArrowRight", "Enter"]) {
      const spies = dom.fire("keydown", { key, target: other });
      expect(spies.preventDefault).not.toHaveBeenCalled();
    }
    expect(service.getSnapshot().session.vcb.text).toBe("");
    expect(service.getSnapshot().session.lock).toEqual({ kind: "none" });
  });

  it("한글 IME 조합 중에는 어떤 키도 가로채지 않는다", () => {
    const { service, dom } = setup();
    service.begin("measure", { referencePoint: [0, 0, 0] });
    const spies = dom.fire("keydown", { key: "ArrowRight", isComposing: true });
    expect(spies.preventDefault).not.toHaveBeenCalled();
    expect(service.getSnapshot().session.lock).toEqual({ kind: "none" });
  });

  it("탭 목록 안에서의 방향키는 위젯에 맡긴다", () => {
    const { service, dom } = setup();
    service.begin("measure", { referencePoint: [0, 0, 0] });
    const spies = dom.fire("keydown", {
      key: "ArrowRight",
      target: target("BUTTON", {}, {}, ['[role="tablist"]']),
    });
    expect(spies.preventDefault).not.toHaveBeenCalled();
    expect(service.getSnapshot().session.lock).toEqual({ kind: "none" });
  });

  it("입력창에서 Enter는 길이를 적용하고, 입력창에 글자가 있으면 ←/→ 는 커서 이동에 맡긴다", () => {
    const { service, dom } = setup();
    const applied = vi.fn();
    service.begin("wall", { referencePoint: [0, 0, 0], handlers: { applyLength: applied } });
    service.handleKey("key-down", { key: "ArrowRight" });
    service.setVcbText("2m");
    const vcb = target("INPUT", { [STUDIO_BG3D_INFERENCE_VCB_ATTRIBUTE]: "true" }, { type: "text" });
    const left = dom.fire("keydown", { key: "ArrowLeft", target: vcb });
    expect(left.preventDefault).not.toHaveBeenCalled();
    const up = dom.fire("keydown", { key: "ArrowUp", target: vcb });
    expect(up.preventDefault).toHaveBeenCalledTimes(1);
    const enter = dom.fire("keydown", { key: "Enter", target: vcb });
    expect(enter.preventDefault).toHaveBeenCalledTimes(1);
    expect(applied).toHaveBeenCalledTimes(1);
  });

  it("Shift 해제는 어디서든 반영하고, 창 blur는 modifier를 초기화한다", () => {
    const { service, dom } = setup();
    service.begin("measure", { referencePoint: [0, 0, 0] });
    dom.fire("keydown", { key: "Shift", shiftKey: true });
    expect(service.getSnapshot().session.shiftDown).toBe(true);
    dom.fire("keyup", { key: "Shift", target: target("INPUT", {}, { type: "text" }) });
    expect(service.getSnapshot().session.shiftDown).toBe(false);
    dom.fire("keydown", { key: "Shift", shiftKey: true });
    dom.fire("blur", {});
    expect(service.getSnapshot().session.shiftDown).toBe(false);
  });

  it("해제 함수가 모든 리스너를 제거한다", () => {
    const { service, dom, detach } = setup();
    expect(dom.count()).toBeGreaterThanOrEqual(3);
    detach();
    expect(dom.count()).toBe(0);
    service.begin("measure", { referencePoint: [0, 0, 0] });
    dom.fire("keydown", { key: "ArrowRight" });
    expect(service.getSnapshot().session.lock).toEqual({ kind: "none" });
  });
});
