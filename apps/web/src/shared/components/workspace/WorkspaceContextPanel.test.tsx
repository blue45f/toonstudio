// @vitest-environment jsdom
import { useEffect, useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { WorkspaceContextPanel } from "./WorkspaceContextPanel";

const original = Object.fromEntries(["showModal", "close"].map((name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]));
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => {
  cleanup();
  for (const [name, descriptor] of Object.entries(original)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
function Fixture() {
  const [open, setOpen] = useState(false); const input = useRef<HTMLInputElement>(null);
  return <><button type="button" onClick={() => setOpen(true)}>찾기</button>
    <WorkspaceContextPanel open={open} title="작품 찾기" onClose={() => setOpen(false)} initialFocusRef={open ? input : undefined}>
      {open ? <input ref={input} type="search" aria-label="제목" /> : null}
    </WorkspaceContextPanel></>;
}
function open() { render(<Fixture />); const trigger = screen.getByRole("button", { name: "찾기" }); trigger.focus(); fireEvent.click(trigger); return trigger; }
it("focuses search on opening and restores the invoker after React removes that input", () => {
  const trigger = open(); const input = screen.getByRole("searchbox");
  expect(document.activeElement).toBe(input);
  expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it("does not treat an IME composition Escape as a panel dismissal", () => {
  open(); fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape", isComposing: true });
  expect(screen.getByRole("dialog", { name: "작품 찾기" })).toBeTruthy();
});
it("keeps the native cancel path and restores focus without relying on native close", () => {
  const trigger = open();
  expect(fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false, cancelable: true }))).toBe(false);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("does not keep closed panel content in the document or accessibility tree", () => {
  render(
    <WorkspaceContextPanel open={false} title="숨긴 패널" onClose={() => undefined}>
      <p>숨겨야 하는 대용량 목록</p>
    </WorkspaceContextPanel>,
  );
  expect(screen.queryByText("숨겨야 하는 대용량 목록")).toBeNull();
});

function CompetingSiblingFocus({ active, onFocused }: {
  readonly active: boolean;
  readonly onFocused: (element: Element | null) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active) return;
    ref.current?.focus();
    onFocused(document.activeElement);
  }, [active, onFocused]);
  return <button ref={ref} type="button">안내 투어</button>;
}
function ExplicitInvokerFixture({ onCompetingFocus }: {
  readonly onCompetingFocus: (element: Element | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const invoker = useRef<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return <><button type="button" onClick={(event) => { invoker.current = event.currentTarget; setOpen(true); }}>작업 바로가기 열기</button>
    <CompetingSiblingFocus active={open} onFocused={onCompetingFocus} />
    <WorkspaceContextPanel open={open} title="작업 바로가기" onClose={() => setOpen(false)} initialFocusRef={open ? input : undefined} returnFocusRef={invoker}>
      {open ? <input ref={input} type="search" aria-label="작업 찾기" /> : null}
    </WorkspaceContextPanel></>;
}
it("restores the clicked invoker when an earlier sibling effect moved focus during the same opening commit", () => {
  const competingFocus: (Element | null)[] = [];
  render(<ExplicitInvokerFixture onCompetingFocus={(element) => competingFocus.push(element)} />);
  const trigger = screen.getByRole("button", { name: "작업 바로가기 열기" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(competingFocus).toEqual([screen.getByRole("button", { name: "안내 투어" })]);
  expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "작업 찾기" }));
  expect(fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" })).toBe(false);
  expect(screen.queryByRole("dialog", { name: "작업 바로가기" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
