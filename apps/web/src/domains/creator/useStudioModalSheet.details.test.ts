// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activateStudioModalSheet } from "./useStudioModalSheet";

/**
 * 접이식(`<details>`/`<summary>`)이 든 모달의 Tab 순환을 진짜 DOM 으로 확인한다.
 * `useStudioModalSheet.test.ts` 의 가짜 DOM 은 선택자를 해석하지 못해 summary 와 닫힌 details 의 본문을
 * 구별할 수 없다. jsdom 은 레이아웃이 없어 `getClientRects` 가 늘 비므로 다른 모달 시험처럼 "보이는
 * 요소"로 고정한다 — 실제 브라우저(Chromium·Firefox·WebKit)도 닫힌 details 본문의 `getClientRects` 는
 * 값을 돌려주므로 이 고정이 오히려 실제와 같다.
 */

type Child = Node | string;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

interface Fixture {
  readonly dialog: HTMLElement;
  readonly first: HTMLButtonElement;
  readonly apply: HTMLButtonElement;
  readonly table: HTMLDetailsElement;
  readonly tableSummary: HTMLElement;
  readonly tableRegion: HTMLElement;
  readonly notes: HTMLDetailsElement;
  readonly notesSummary: HTMLElement;
  readonly notesBodyButton: HTMLButtonElement;
  readonly notesRegion: HTMLElement;
  readonly deactivate: () => void;
}

/** 모달: [닫기, 적용, 표 접이식(요약+가로 스크롤 영역), 계산 접이식(요약+버튼+가로 스크롤 영역)] — 둘 다 닫힌 채로 시작. */
function mountDialog(): Fixture {
  const trigger = h("button", {}, "열기");
  const first = h("button", {}, "닫기");
  const apply = h("button", {}, "적용");
  const tableSummary = h("summary", {}, "표로 보기");
  const tableRegion = h("div", { role: "region", tabindex: "0", "aria-label": "표" }, "표 본문");
  const table = h("details", {}, tableSummary, tableRegion);
  const notesSummary = h("summary", {}, "계산 방법");
  const notesBodyButton = h("button", {}, "본문 안 버튼");
  const notesRegion = h("div", { role: "region", tabindex: "0", "aria-label": "계수 표" }, "계수 표 본문");
  const notes = h("details", {}, notesSummary, notesBodyButton, notesRegion);
  const dialog = h("div", { role: "dialog", "aria-modal": "true", tabindex: "-1" }, first, apply, table, notes);
  const root = h("div", {}, trigger, dialog);
  document.body.append(root);
  trigger.focus();
  const deactivate = activateStudioModalSheet({
    dialog,
    document,
    onDismiss: vi.fn(),
    returnFocus: trigger,
    root,
  });
  return {
    dialog, first, apply, table, tableSummary, tableRegion,
    notes, notesSummary, notesBodyButton, notesRegion, deactivate,
  };
}

/** 지금 포커스가 있는 곳에서 키를 누른다. 반환값은 모달 훅이 그 입력을 가로챘는지(preventDefault) 여부다. */
function press(key: string, shiftKey = false): { readonly intercepted: boolean } {
  const target = document.activeElement ?? document.body;
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return { intercepted: event.defaultPrevented };
}

/** 레이아웃이 없는 jsdom 에서 크기 질의가 한 칸짜리 목록을 돌려주게 해 모든 요소를 "보이는" 것으로 만든다. */
const VISIBLE_RECTS: DOMRectList = Object.assign([new DOMRect()], {
  item: (index: number): DOMRect | null => (index === 0 ? new DOMRect() : null),
});

let fixture: Fixture | null = null;

function mounted(): Fixture {
  fixture = mountDialog();
  return fixture;
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(VISIBLE_RECTS);
});

afterEach(() => {
  fixture?.deactivate();
  fixture = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("모달 포커스 순환 — 접이식의 summary", () => {
  it("summary 가 순환에 들어 있어, 그 앞 마지막 버튼에서 누른 Tab 을 가로채지 않고 브라우저가 summary 로 보낸다", () => {
    const { apply } = mounted();
    apply.focus();
    expect(press("Tab").intercepted).toBe(false);
  });

  it("DOM 끝의 summary 에서 Tab 을 누르면 처음 컨트롤로, 처음 컨트롤에서 Shift+Tab 을 누르면 그 summary 로 돈다", () => {
    const { first, notesSummary } = mounted();

    notesSummary.focus();
    expect(press("Tab").intercepted).toBe(true);
    expect(document.activeElement).toBe(first);

    expect(press("Tab", true).intercepted).toBe(true);
    expect(document.activeElement).toBe(notesSummary);
  });

  it("첫 summary 는 마지막이 아니라서 Tab 을 가로채지 않는다(둘째 summary 로 가는 길을 막지 않는다)", () => {
    const { tableSummary } = mounted();
    tableSummary.focus();
    expect(press("Tab").intercepted).toBe(false);
  });
});

describe("모달 포커스 순환 — 닫힌 details 의 본문", () => {
  it("닫힌 details 안의 버튼·tabindex 영역은 레이아웃이 남아 있어도 '마지막 요소'가 되지 못한다", () => {
    const { first, notesSummary, notesBodyButton, notesRegion } = mounted();
    expect(notesBodyButton.closest("details")?.open).toBe(false);
    expect(notesRegion.closest("details")?.open).toBe(false);

    // 숨은 본문이 마지막으로 잡히면 summary 의 Tab 은 가로채지지 않고 모달 밖으로 샌다
    notesSummary.focus();
    expect(press("Tab").intercepted).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("펼치면 본문이 DOM 순서대로 순환에 들어오고, 마지막은 그 본문의 끝 요소가 된다", () => {
    const { first, notes, notesSummary, notesRegion } = mounted();
    notes.open = true;

    notesSummary.focus();
    expect(press("Tab").intercepted).toBe(false);

    notesRegion.focus();
    expect(press("Tab").intercepted).toBe(true);
    expect(document.activeElement).toBe(first);

    expect(press("Tab", true).intercepted).toBe(true);
    expect(document.activeElement).toBe(notesRegion);
  });

  it("앞의 접이식만 펼쳐도 뒤의 닫힌 접이식 본문은 계속 순환 밖이다", () => {
    const { first, table, tableRegion, notesSummary } = mounted();
    table.open = true;

    tableRegion.focus();
    expect(press("Tab").intercepted).toBe(false);

    notesSummary.focus();
    expect(press("Tab").intercepted).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("summary 안의 컨트롤은 닫혀 있어도 닿는다", () => {
    const { first, dialog } = mounted();
    const inner = h("a", { href: "#도움말" }, "도움말");
    const summary = h("summary", {}, "설명 ", inner);
    const details = h("details", {}, summary, h("p", {}, "본문"));
    dialog.append(details);

    inner.focus();
    // 마지막 요소이므로 Tab 이 처음으로 돌아간다 — 순환 후보에 들어 있다는 뜻이다
    expect(press("Tab").intercepted).toBe(true);
    expect(document.activeElement).toBe(first);
  });
});

describe("모달 포커스 순환 — 포커스를 못 받는 summary", () => {
  it("둘째 summary 와 details 밖의 summary 는 브라우저가 tabIndex -1 로 돌려주므로 순환에서 빠진다", () => {
    const { dialog, first, table, notesSummary } = mounted();
    const second = h("summary", {}, "두 번째 summary");
    table.append(second);
    const stray = h("summary", {}, "떠도는 summary");
    dialog.append(stray);
    expect(second.tabIndex).toBe(-1);
    expect(stray.tabIndex).toBe(-1);

    // 끝에 떠도는 summary 가 있어도 마지막 요소는 여전히 계산 접이식의 summary 다
    notesSummary.focus();
    expect(press("Tab").intercepted).toBe(true);
    expect(document.activeElement).toBe(first);
  });
});
