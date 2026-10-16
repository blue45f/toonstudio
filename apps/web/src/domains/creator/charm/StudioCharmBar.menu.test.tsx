// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { announcementText, barHarness, chipButtons, resetCharmBarHarness } from "./studio-charm-bar-harness.test-fixture";
import { createStudioCharmId } from "./studio-charm-model";
import { STUDIO_CHARM_STARTER_PACK } from "./studio-charm-starter-pack";

import { useI18n } from "@/shared/lib/i18n";

/**
 * `⋯` 메뉴와 `+` 선택기를 키보드만으로 쓸 수 있는지 확인한다.
 *
 * 팝오버는 body 끝 포털이라, 포커스를 옮기지 않으면 Tab 으로는 문서의 나머지를 다 지나야 닿는다(사실상 닿지 못한다).
 * 그래서 열리면 첫 항목으로 포커스를 옮기고, 방향키로 오가고, Esc·Tab 으로 닫으면 트리거로 돌려보낸다.
 * jsdom 에는 브라우저의 Tab 이동이 없어서 `pressTab` 이 같은 규칙(문서 순서의 다음 탭 정지점)으로 흉내 낸다.
 */

const FOCUS = createStudioCharmId("fx", "radial-focus");
const SPEED = createStudioCharmId("fx", "speed-lines");

const MENU_ITEMS = ["순서·삭제 편집", "기본 참 다시 담기", "단축키 안내", "참 바 닫기"] as const;

function tabStops(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter(
    (element) => !element.hasAttribute("disabled") && element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true",
  );
}

/** 브라우저의 Tab: 앱이 막지 않았다면 문서 순서의 다음(Shift 면 이전) 탭 정지점으로 옮긴다. 문서 끝을 지나면 페이지를 벗어난다. */
function pressTab(shift = false): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (!fireEvent.keyDown(active, { key: "Tab", shiftKey: shift })) return;
  const stops = tabStops();
  const next = stops[stops.indexOf(active) + (shift ? -1 : 1)];
  if (next) next.focus();
  else active.blur();
}

/** 키보드로 포커스 중인 버튼을 누른다. jsdom 은 Enter·Space 에서 click 을 만들지 않아 직접 click 한다. */
function activateFocused(): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) throw new Error("포커스된 요소가 없습니다");
  fireEvent.keyDown(active, { key: "Enter" });
  fireEvent.click(active);
}

function menuTrigger(): HTMLButtonElement {
  return screen.getByRole("button", { name: "참 바 메뉴" }) as HTMLButtonElement;
}

function pickerTrigger(): HTMLButtonElement {
  return screen.getByRole("button", { name: "참 고르기" }) as HTMLButtonElement;
}

function menuDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "참 바 메뉴" });
}

function itemOf(name: string): HTMLButtonElement {
  return within(menuDialog()).getByRole("button", { name }) as HTMLButtonElement;
}

/** 키보드 사용자처럼 트리거에 포커스를 두고 눌러 메뉴를 연다. */
function openMenuWithKeyboard(): void {
  const trigger = menuTrigger();
  trigger.focus();
  fireEvent.click(trigger);
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  resetCharmBarHarness();
});

afterEach(() => {
  cleanup();
});

async function renderTwo() {
  const h = await barHarness([FOCUS, SPEED]);
  h.renderBar();
  await waitFor(() => expect(chipButtons()).toHaveLength(2));
  return h;
}

describe("참 바 ⋯ 메뉴: 키보드", () => {
  it("열면 첫 항목에 포커스가 가고, Esc 로 닫으면 트리거로 돌아온다", async () => {
    await renderTwo();
    openMenuWithKeyboard();
    expect(menuTrigger().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(itemOf(MENU_ITEMS[0]));
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog", { name: "참 바 메뉴" })).toBeNull();
    expect(menuTrigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menuTrigger());
  });

  it("방향키로 네 항목을 오가고 Home·End 로 처음·끝에 가며 끝에서 순환한다", async () => {
    await renderTwo();
    openMenuWithKeyboard();
    const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document, { key });
    for (const name of MENU_ITEMS.slice(1)) {
      expect(press("ArrowDown")).toBe(false);
      expect(document.activeElement).toBe(itemOf(name));
    }
    press("ArrowDown");
    expect(document.activeElement).toBe(itemOf(MENU_ITEMS[0]));
    press("ArrowUp");
    expect(document.activeElement).toBe(itemOf(MENU_ITEMS[3]));
    press("Home");
    expect(document.activeElement).toBe(itemOf(MENU_ITEMS[0]));
    press("End");
    expect(document.activeElement).toBe(itemOf(MENU_ITEMS[3]));
  });

  it("Tab 만으로 네 항목 모두에 닿고, 끝에서 더 누르면 메뉴가 닫히며 트리거로 돌아온다", async () => {
    await renderTwo();
    openMenuWithKeyboard();
    const reached = [document.activeElement];
    for (let step = 0; step < 3; step += 1) {
      pressTab();
      reached.push(document.activeElement);
    }
    expect(reached).toEqual(MENU_ITEMS.map(itemOf));
    pressTab();
    expect(screen.queryByRole("dialog", { name: "참 바 메뉴" })).toBeNull();
    expect(document.activeElement).toBe(menuTrigger());
  });

  it("Shift+Tab 으로 첫 항목을 벗어나도 메뉴가 닫히며 트리거로 돌아온다", async () => {
    await renderTwo();
    openMenuWithKeyboard();
    pressTab(true);
    expect(screen.queryByRole("dialog", { name: "참 바 메뉴" })).toBeNull();
    expect(document.activeElement).toBe(menuTrigger());
  });

  it("참이 하나도 없어 첫 항목이 꺼져 있으면 첫 활성 항목에 포커스가 간다", async () => {
    const h = await barHarness([]);
    h.renderBar();
    await screen.findByText("고정한 참이 없어요");
    openMenuWithKeyboard();
    expect(itemOf("순서·삭제 편집").disabled).toBe(true);
    expect(document.activeElement).toBe(itemOf("기본 참 다시 담기"));
    pressTab();
    expect(document.activeElement).toBe(itemOf("단축키 안내"));
  });

  it("세 가지 항목(순서·삭제 편집, 단축키 안내, 참 바 닫기)을 키보드로 실행할 수 있다", async () => {
    const h = await renderTwo();

    openMenuWithKeyboard();
    pressTab();
    pressTab();
    expect(document.activeElement).toBe(itemOf("단축키 안내"));
    activateFocused();
    expect(itemOf("단축키 안내").getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("[data-studio-charm-shortcuts]")?.textContent).toContain("Delete · Backspace");
    // 안내는 메뉴를 열어 둔 채 펼쳐지고 포커스는 그 항목에 남는다.
    expect(screen.getByRole("dialog", { name: "참 바 메뉴" })).toBeTruthy();
    expect(document.activeElement).toBe(itemOf("단축키 안내"));

    pressTab();
    expect(document.activeElement).toBe(itemOf("참 바 닫기"));
    activateFocused();
    expect(h.store.getSnapshot().state.open).toBe(false);
  });

  it("순서·삭제 편집을 키보드로 시작하면 메뉴가 닫히고 포커스가 칩으로 가서 곧바로 편집할 수 있다", async () => {
    const h = await renderTwo();
    openMenuWithKeyboard();
    expect(document.activeElement).toBe(itemOf("순서·삭제 편집"));
    activateFocused();
    expect(screen.queryByRole("dialog", { name: "참 바 메뉴" })).toBeNull();
    expect(screen.getByRole("group", { name: "선택한 참 편집" })).toBeTruthy();
    expect(chipButtons().includes(document.activeElement as HTMLButtonElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document, { key: "Delete" });
    await waitFor(() => expect(h.store.getSnapshot().state.charms).toHaveLength(1));
    expect(announcementText()).toContain("참 바에서 뺐어요");
  });

  it("기본 참 다시 담기를 키보드로 실행하면 메뉴가 닫히고 포커스는 트리거로 돌아온다", async () => {
    const h = await renderTwo();
    openMenuWithKeyboard();
    pressTab();
    expect(document.activeElement).toBe(itemOf("기본 참 다시 담기"));
    activateFocused();
    await waitFor(() => expect(h.store.getSnapshot().state.charms).toEqual(expect.arrayContaining([...STUDIO_CHARM_STARTER_PACK])));
    expect(screen.queryByRole("dialog", { name: "참 바 메뉴" })).toBeNull();
    expect(document.activeElement).toBe(menuTrigger());
  });

  it("메뉴가 열린 채 + 버튼을 누르면 메뉴는 닫히고 선택기가 열려 검색창에 포커스가 간다", async () => {
    await renderTwo();
    openMenuWithKeyboard();
    pickerTrigger().focus();
    fireEvent.click(pickerTrigger());
    expect(screen.queryByRole("dialog", { name: "참 바 메뉴" })).toBeNull();
    expect(document.activeElement).toBe(within(screen.getByRole("dialog", { name: "참 고르기" })).getByRole("searchbox"));
  });
});

describe("참 고르기: 키보드", () => {
  it("Shift+Tab 으로 맨 앞을 벗어나면 닫히고 + 버튼으로 돌아온다", async () => {
    await renderTwo();
    pickerTrigger().focus();
    fireEvent.click(pickerTrigger());
    const dialog = screen.getByRole("dialog", { name: "참 고르기" });
    // 맨 앞 탭 정지점은 닫기 버튼이다. 검색창에서 Shift+Tab 하면 닫기 버튼으로, 거기서 한 번 더 하면 팝오버를 벗어난다.
    expect(document.activeElement).toBe(within(dialog).getByRole("searchbox"));
    pressTab(true);
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "참 고르기 닫기" }));
    pressTab(true);
    expect(screen.queryByRole("dialog", { name: "참 고르기" })).toBeNull();
    expect(document.activeElement).toBe(pickerTrigger());
  });

  it("맨 끝 항목에서 Tab 을 누르면 닫히고 + 버튼으로 돌아온다", async () => {
    await renderTwo();
    pickerTrigger().focus();
    fireEvent.click(pickerTrigger());
    const dialog = screen.getByRole("dialog", { name: "참 고르기" });
    const last = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")].at(-1);
    expect(last).toBeTruthy();
    last?.focus();
    pressTab();
    expect(screen.queryByRole("dialog", { name: "참 고르기" })).toBeNull();
    expect(document.activeElement).toBe(pickerTrigger());
  });
});
