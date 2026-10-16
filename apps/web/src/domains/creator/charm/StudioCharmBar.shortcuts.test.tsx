// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isStudioUndoRedoChord, shouldHandleStudioEditEvent } from "../studio-edit-controls";
import { announcementText, barHarness, chipButtons, resetCharmBarHarness } from "./studio-charm-bar-harness.test-fixture";
import { createStudioCharmId } from "./studio-charm-model";

import { useI18n } from "@/shared/lib/i18n";

/**
 * 참 바에서 누른 키가 편집기의 전역 단축키로 새지 않는지 확인한다.
 *
 * 전역 디스패처(`studio-page-shortcut-dispatcher.ts`)는 `defaultPrevented` 이거나 `data-studio-shortcut-boundary` 안이
 * 아닌 키를 캔버스 편집 명령으로 실행한다. 경계가 없으면 칩에서 Backspace 가 선택한 캔버스 요소를 지우고 Shift+방향키가
 * 10px 이동시킨다. 반대로 Delete 는 참을 영구히 빼는데, 방금 붙인 요소가 선택돼 있어 그 요소를 지우려던 사용자의 참이
 * 사라진다(문서 되돌리기로 복구되지 않는다). 그래서 빼기는 순서 편집 중에만 동작한다.
 * 전역 쪽 판정은 실제 디스패처가 쓰는 같은 함수·선택자로 흉내 내고, 선택자가 그대로인지는 호스트 계약 시험이 지킨다.
 */

const FOCUS = createStudioCharmId("fx", "radial-focus");
const SPEED = createStudioCharmId("fx", "speed-lines");
const SWEAT = createStudioCharmId("fx", "sweat-drop");

/** 실제 디스패처(`studio-page-shortcut-dispatcher.ts`)의 경계 선택자와 같다. */
const SHORTCUT_BOUNDARY_SELECTOR = "[data-studio-shortcut-boundary='true'], [aria-modal='true']";

interface GlobalShortcutProbe {
  /** 전역 편집 명령까지 닿았을 키(디스패처가 실행했을 키). */
  readonly reached: string[];
  readonly dispose: () => void;
}

function installGlobalShortcutProbe(): GlobalShortcutProbe {
  const reached: string[] = [];
  const listener = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const typing = target !== null && (
      target.tagName === "INPUT"
      || target.tagName === "TEXTAREA"
      || target.tagName === "SELECT"
      || target.isContentEditable
      || target.getAttribute("role") === "textbox"
    );
    const insideShortcutBoundary = target !== null && target.closest(SHORTCUT_BOUNDARY_SELECTOR) !== null;
    if (!shouldHandleStudioEditEvent({
      typing,
      editing: false,
      insideShortcutBoundary,
      undoRedoIntent: isStudioUndoRedoChord(event),
      timelapseCapturing: false,
    })) return;
    reached.push(`${event.ctrlKey ? "Ctrl+" : ""}${event.shiftKey ? "Shift+" : ""}${event.key}`);
  };
  window.addEventListener("keydown", listener);
  return { reached, dispose: () => window.removeEventListener("keydown", listener) };
}

let probe: GlobalShortcutProbe;

beforeEach(() => {
  useI18n.getState().setLang("ko");
  resetCharmBarHarness();
  probe = installGlobalShortcutProbe();
});

afterEach(() => {
  probe.dispose();
  cleanup();
});

async function renderThree() {
  const h = await barHarness([FOCUS, SPEED, SWEAT]);
  h.renderBar();
  await waitFor(() => expect(chipButtons()).toHaveLength(3));
  return h;
}

function startEditing(): void {
  fireEvent.click(screen.getByRole("button", { name: "참 바 메뉴" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "참 바 메뉴" })).getByRole("button", { name: "순서·삭제 편집" }));
}

describe("참 바: 단축키 경계", () => {
  it("바 본체와 팝오버(메뉴·선택기)가 단축키 경계다", async () => {
    const h = await renderThree();
    const section = document.querySelector("[data-studio-charm-bar]");
    expect(section?.getAttribute("data-studio-shortcut-boundary")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "참 바 메뉴" }));
    expect(screen.getByRole("dialog", { name: "참 바 메뉴" }).getAttribute("data-studio-shortcut-boundary")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "참 고르기" }));
    expect(screen.getByRole("dialog", { name: "참 고르기" }).getAttribute("data-studio-shortcut-boundary")).toBe("true");
    expect(h.store.getSnapshot().state.charms).toEqual([FOCUS, SPEED, SWEAT]);
  });

  it("칩이 처리하지 않는 키(Backspace·Shift+방향키·글자·Esc)는 전역 편집 명령에 닿지 않는다", async () => {
    await renderThree();
    const chip = chipButtons()[0];
    chip.focus();
    fireEvent.keyDown(chip, { key: "Backspace" });
    fireEvent.keyDown(chip, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(chip, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(chip, { key: "b" });
    fireEvent.keyDown(chip, { key: "Escape" });
    fireEvent.keyDown(chip, { key: "Tab" });
    expect(probe.reached).toEqual([]);
  });

  it("칩이 처리한 키는 기본 동작이 막혀 전역으로 가지 않는다", async () => {
    await renderThree();
    const chip = chipButtons()[0];
    chip.focus();
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End", "Enter", " "]) {
      expect(fireEvent.keyDown(chip, { key }), key).toBe(false);
    }
    expect(probe.reached).toEqual([]);
  });

  it("되돌리기·다시 하기는 경계 안에서도 편집기로 통과한다(붙인 직후 바로 되돌릴 수 있다)", async () => {
    await renderThree();
    const chip = chipButtons()[0];
    chip.focus();
    fireEvent.keyDown(chip, { key: "z", ctrlKey: true });
    fireEvent.keyDown(chip, { key: "z", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(chip, { key: "y", ctrlKey: true });
    expect(probe.reached).toEqual(["Ctrl+z", "Ctrl+Shift+z", "Ctrl+y"]);
  });

  it("메뉴와 선택기 안에서 누른 키도 전역 편집 명령에 닿지 않는다", async () => {
    await renderThree();
    fireEvent.click(screen.getByRole("button", { name: "참 바 메뉴" }));
    const menuItem = within(screen.getByRole("dialog", { name: "참 바 메뉴" })).getByRole("button", { name: "단축키 안내" });
    fireEvent.keyDown(menuItem, { key: "Delete" });
    fireEvent.keyDown(menuItem, { key: "Backspace" });
    fireEvent.click(screen.getByRole("button", { name: "참 고르기" }));
    const picker = screen.getByRole("dialog", { name: "참 고르기" });
    const tile = await waitFor(() => {
      const found = picker.querySelector<HTMLButtonElement>("[data-studio-charm-pick]");
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    fireEvent.keyDown(tile, { key: "Delete" });
    fireEvent.keyDown(tile, { key: "ArrowRight", shiftKey: true });
    expect(probe.reached).toEqual([]);
  });

  it("바 밖에서 누른 키는 경계 밖이라 전역 명령으로 간다(바가 가로채지 않는다)", async () => {
    const h = await renderThree();
    const outside = document.createElement("div");
    document.body.append(outside);
    fireEvent.keyDown(outside, { key: "Delete" });
    outside.remove();
    expect(probe.reached).toEqual(["Delete"]);
    expect(h.store.getSnapshot().state.charms).toEqual([FOCUS, SPEED, SWEAT]);
  });
});

describe("참 바: 빼기는 순서 편집 중에만 동작한다", () => {
  it("편집 모드가 아닐 때 Delete·Backspace 는 참을 빼지 않고 빼는 방법을 알린다", async () => {
    const h = await renderThree();
    const chip = chipButtons()[1];
    chip.focus();
    expect(fireEvent.keyDown(chip, { key: "Delete" })).toBe(false);
    expect(h.store.getSnapshot().state.charms).toEqual([FOCUS, SPEED, SWEAT]);
    await waitFor(() => expect(announcementText()).toContain("순서·삭제 편집"));
    expect(announcementText()).toContain("Delete");
    fireEvent.keyDown(chip, { key: "Backspace" });
    expect(h.store.getSnapshot().state.charms).toEqual([FOCUS, SPEED, SWEAT]);
    expect(probe.reached).toEqual([]);
  });

  it("키를 누르고 있어도(repeat) 안내만 하고 참은 그대로다", async () => {
    const h = await renderThree();
    const chip = chipButtons()[0];
    chip.focus();
    fireEvent.keyDown(chip, { key: "Delete", repeat: true });
    expect(h.store.getSnapshot().state.charms).toEqual([FOCUS, SPEED, SWEAT]);
  });

  it("순서 편집 중에는 Delete 와 Backspace 가 포커스한 참을 뺀다", async () => {
    const h = await renderThree();
    startEditing();
    await waitFor(() => expect(screen.getByRole("group", { name: "선택한 참 편집" })).toBeTruthy());
    const second = chipButtons()[1];
    second.focus();
    fireEvent.keyDown(second, { key: "Delete" });
    await waitFor(() => expect(h.store.getSnapshot().state.charms).toEqual([FOCUS, SWEAT]));
    await waitFor(() => expect(announcementText()).toContain("참 바에서 뺐어요"));
    const first = chipButtons()[0];
    first.focus();
    fireEvent.keyDown(first, { key: "Backspace" });
    await waitFor(() => expect(h.store.getSnapshot().state.charms).toEqual([SWEAT]));
    expect(probe.reached).toEqual([]);
  });

  it("편집 도구 버튼에서 누른 Esc 도 순서 편집을 끝내고 포커스는 칩으로 돌아간다", async () => {
    await renderThree();
    startEditing();
    const group = await screen.findByRole("group", { name: "선택한 참 편집" });
    const tool = within(group).getByRole("button", { name: "순서 편집 끝내기" });
    tool.focus();
    await act(async () => {
      fireEvent.keyDown(tool, { key: "Escape" });
    });
    expect(screen.queryByRole("group", { name: "선택한 참 편집" })).toBeNull();
    await waitFor(() => expect(chipButtons().includes(document.activeElement as HTMLButtonElement)).toBe(true));
  });
});
