// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeStudioSoakBrushSurfaces, selectStudioSoakDesktopBrush } from "./studio-soak-brush-selection";
import { shouldChurnStudioSoakHistory } from "./studio-soak-evidence";
import { clickStudioSoakHistoryAction } from "./studio-soak-history-ui";
import { readStudioSoakLayerCount, waitForStudioSoakLayerCount } from "./studio-soak-layer-count";

import type { Locator, Page } from "playwright";

const source = readFileSync(resolve(__dirname, "../verify-studio-five-hour-soak.mts"), "utf8");
const ast = ts.createSourceFile("soak.mts", source, ts.ScriptTarget.ESNext, true);
function harnessFunction(name: string, globals: Record<string, unknown>) {
  const node = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!node) throw new Error("실제 소크 함수 없음: " + name);
  const compiled = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(compiled + "\n" + name, globals) as (...args: unknown[]) => Promise<unknown>;
}

/** 실제 CSS·숨김·클릭 후 DOM 변화를 읽는 최소 Locator이며 브라우저 레이아웃 측정을 대신하지 않는다. */
function fixture(html: string) {
  document.body.innerHTML = html;
  let now = 0;
  const events: string[] = [];
  const state = { onWait: (_ms: number) => undefined as void, onClick: (_node: HTMLElement) => undefined as void };
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const visible = (element: HTMLElement) => {
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  };
  const resolvers = new WeakMap<object, () => HTMLElement[]>();
  const locator = (resolve: () => HTMLElement[]): Locator => {
    const next = (read: () => HTMLElement[]) => locator(read);
    const single = () => {
      const nodes = resolve();
      if (nodes.length !== 1) throw new Error("조작 대상 " + nodes.length + "개");
      return nodes[0]!;
    };
    const result = {
      locator: (selector: string) => next(() => resolve().flatMap((node) => [...node.querySelectorAll<HTMLElement>(selector)])),
      and: (other: Locator) => next(() => {
        const matches = new Set(resolvers.get(other)!());
        return resolve().filter((node) => matches.has(node));
      }),
      getByRole: (role: string, options?: { name?: string | RegExp; exact?: boolean }) => next(() => {
        const selector = role === "button" ? 'button, [role="button"]'
          : role === "searchbox" ? 'input[type="search"], [role="searchbox"]' : '[role="' + role + '"]';
        return resolve().flatMap((node) => [...node.querySelectorAll<HTMLElement>(selector)]).filter((node) => {
          const name = node.getAttribute("aria-label") ?? node.textContent ?? "";
          return options?.name === undefined || (typeof options.name === "string" ? name === options.name : options.name.test(name));
        });
      }),
      filter: ({ visible: expected }: { visible: boolean }) => next(() => resolve().filter((node) => visible(node) === expected)),
      first: () => next(() => resolve().slice(0, 1)),
      count: async () => resolve().length,
      isVisible: async () => resolve().length === 0 ? false : visible(single()),
      isDisabled: async () => (single() as HTMLButtonElement).disabled,
      getAttribute: async (name: string) => single().getAttribute(name),
      evaluate: async (read: (element: HTMLElement) => unknown) => read(single()),
      waitFor: async ({ state: expected = "visible" }: { state?: string }) => {
        if (expected === "hidden") {
          if (resolve().some(visible)) throw new Error("표면이 닫히지 않았습니다");
        } else {
          const node = single();
          if (expected === "visible" && !visible(node)) throw new Error("표면이 보이지 않습니다");
        }
      },
      scrollIntoViewIfNeeded: async () => { single(); },
      fill: async (value: string) => {
        const node = single() as HTMLInputElement;
        node.value = value; events.push("search:" + value);
        node.dispatchEvent(new Event("input", { bubbles: true }));
      },
      click: async () => {
        const node = single() as HTMLButtonElement;
        if (!visible(node) || node.disabled) throw new Error("조작 불가능한 버튼입니다");
        events.push(node.id || "click"); node.click(); state.onClick(node);
      },
    } as unknown as Locator;
    resolvers.set(result, resolve);
    return result;
  };
  const page = {
    locator: (selector: string) => locator(() => [...document.querySelectorAll<HTMLElement>(selector)]),
    keyboard: { press: async (key: string) => {
      events.push(key); document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    } },
    waitForTimeout: async (ms: number) => { now += ms; state.onWait(ms); },
  } as unknown as Page;
  return { page, state, events, now: () => now };
}

function library(id: string, hidden = false) {
  return '<div id="' + id + '" data-studio-brush-library="true" data-studio-brush-catalog-session="true"'
    + (hidden ? " hidden" : "") + '><input type="search">'
    + '<button id="' + id + '-wrong" data-studio-brush-select="other" aria-pressed="false">같은 표시 이름</button>'
    + '<button id="' + id + '-pen" data-studio-brush-select="pen" aria-pressed="false">같은 표시 이름</button></div>';
}
const pill = '<div data-studio-draw-options="true"><button id="pill" data-studio-brush-active-pill="true">브러시</button></div>';
const floating = (hidden = true) => '<section id="floating" role="dialog" data-studio-brush-floating="paint"'
  + (hidden ? " hidden" : "") + '><button id="close" aria-label="브러시 전체 라이브러리 닫기"></button>'
  + library("floating-library") + "</section>";
const dock = (hidden = false) => '<aside id="dock" data-studio-brush-workbench-dock="true"'
  + (hidden ? " hidden" : "") + ">" + library("docked-library") + "</aside>";

function brushFixture(options: { docked?: boolean; pending?: boolean; selectOther?: boolean; keepOpen?: boolean; hiddenDock?: boolean } = {}) {
  const f = fixture(pill + floating() + (options.docked || options.hiddenDock ? dock(!options.docked) : ""));
  document.getElementById("pill")!.onclick = () => { document.getElementById("floating")!.hidden = false; };
  document.getElementById("close")!.onclick = () => {
    if (!options.keepOpen) document.getElementById("floating")!.hidden = true;
  };
  for (const id of ["floating-library", "docked-library"]) {
    const root = document.getElementById(id);
    if (!root) continue;
    root.querySelector<HTMLElement>('[data-studio-brush-select="pen"]')!.onclick = () => {
      root.setAttribute("data-studio-brush-selection-pending", String(options.pending ?? false));
      root.querySelector('[data-studio-brush-select="' + (options.selectOther ? "other" : "pen") + '"]')!.setAttribute("aria-pressed", "true");
    };
  }
  const ensurePenReady = vi.fn(async () => true);
  const select = harnessFunction("selectBrush", {
    closeBrushSurfaces: closeStudioSoakBrushSurfaces, selectStudioSoakDesktopBrush, ensurePenReady,
  });
  return { ...f, ensurePenReady, select: () => select(f.page, { id: "pen", name: "매끈한 펜" }) };
}

afterEach(() => { vi.restoreAllMocks(); document.onkeydown = null; document.body.replaceChildren(); });

describe("소크 실제 선택 함수와 floating·dock UI", () => {
  it("pill이 body의 floating 창만 열어도 정확한 ID를 선택하고 실제 닫기로 캔버스에 복귀한다", async () => {
    const f = brushFixture({ hiddenDock: true });
    await expect(f.select()).resolves.toBe(true);
    expect(f.ensurePenReady).toHaveBeenCalledExactlyOnceWith(f.page);
    expect(f.events).toEqual(["pill", "search:매끈한 펜", "floating-library-pen", "close"]);
    expect(document.getElementById("floating")!.hidden).toBe(true);
    expect(document.getElementById("docked-library-pen")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("이미 열린 dock는 pill로 확장하지 않고 현재 라이브러리에서 선택한다", async () => {
    const f = brushFixture({ docked: true });
    await expect(f.select()).resolves.toBe(true);
    expect(f.events).toEqual(["search:매끈한 펜", "docked-library-pen"]);
    expect(document.getElementById("dock")!.hidden).toBe(false);
    expect(document.getElementById("floating")!.hidden).toBe(true);
  });

  it("active만 먼저 바뀌면 pending 종료를 기다린 후 닫는다", async () => {
    const f = brushFixture({ pending: true });
    f.state.onWait = () => {
      expect(document.getElementById("floating")!.hidden).toBe(false);
      document.getElementById("floating-library")!.removeAttribute("data-studio-brush-selection-pending");
      f.events.push("applied");
    };
    await expect(f.select()).resolves.toBe(true);
    expect(f.events.slice(-2)).toEqual(["applied", "close"]);
  });

  it.each([{ pending: true }, { selectOther: true }])("선택이 확정되지 않으면 5초 뒤 성공·닫기로 바꾸지 않는다: %j", async (options) => {
    const f = brushFixture(options);
    await expect(f.select()).resolves.toBe(false);
    expect(f.now()).toBe(5_000);
    expect(f.events).not.toContain("close");
  });

  it("선택 확인 뒤 닫히지 않는 창은 성공을 반환하지 않는다", async () => {
    const f = brushFixture({ keepOpen: true });
    await expect(f.select()).rejects.toThrow("닫히지 않았습니다");
  });

  it("선택 중 floating이 사라져도 dock의 과거 활성 상태로 성공을 대신하지 않는다", async () => {
    const f = brushFixture({ hiddenDock: true });
    document.getElementById("floating-library-pen")!.onclick = () => {
      document.getElementById("floating")!.hidden = true;
      document.getElementById("dock")!.hidden = false;
      document.getElementById("docked-library-pen")!.setAttribute("aria-pressed", "true");
    };
    await expect(f.select()).rejects.toThrow("0개");
    expect(f.events).not.toContain("docked-library-pen");
  });

  it("두 visible 라이브러리나 동일 ID 버튼을 첫 번째 대상으로 임의 선택하지 않는다", async () => {
    const f = fixture(pill + floating(false) + dock());
    await expect(selectStudioSoakDesktopBrush(f.page, { id: "pen", name: "펜" })).rejects.toThrow("2개");
    document.getElementById("dock")!.hidden = true;
    const duplicate = document.getElementById("floating-library-pen")!.cloneNode(true);
    document.getElementById("floating-library")!.append(duplicate);
    await expect(selectStudioSoakDesktopBrush(f.page, { id: "pen", name: "펜" })).rejects.toThrow("2개");
    expect(f.events).not.toContain("floating-library-pen");
  });

  it("떠 있는 창을 닫은 뒤 남는 dock와 숨은 이전 창을 잘못 닫지 않는다", async () => {
    const f = brushFixture({ docked: true });
    document.getElementById("floating")!.hidden = false;
    await expect(closeStudioSoakBrushSurfaces(f.page)).resolves.toBe(true);
    expect(f.events).toEqual(["close"]);
    expect(document.getElementById("dock")!.hidden).toBe(false);
  });

  it("모바일 카탈로그와 그 아래 그리기 시트를 각각 실제 Escape로 닫는다", async () => {
    const f = fixture('<section id="draw" data-studio-mobile-sheet="draw">' + library("mobile-library") + "</section>");
    document.onkeydown = (event) => {
      if (event.key !== "Escape") return;
      const catalog = document.getElementById("mobile-library")!;
      if (!catalog.hidden) catalog.hidden = true;
      else document.getElementById("draw")!.hidden = true;
    };
    await expect(closeStudioSoakBrushSurfaces(f.page)).resolves.toBe(true);
    expect(f.events).toEqual(["Escape", "Escape"]);
    expect(document.getElementById("draw")!.hidden).toBe(true);
  });

  it("모바일 시트가 Escape 뒤에도 남으면 실패한다", async () => {
    const f = fixture('<section data-studio-mobile-sheet="draw"></section>');
    await expect(closeStudioSoakBrushSurfaces(f.page)).rejects.toThrow("닫히지 않았습니다");
  });
});

function historyFixture(locale: "ko" | "en" | "legacy" = "ko", noOp = false) {
  const name = locale === "en" ? ["Undo", "Redo"] : ["되돌리기 · 실행취소", "다시 · 다시실행"];
  const controls = locale === "legacy"
    ? '<button id="undo" data-studio-primary-action="undo"></button><button id="redo" data-studio-command-bar-command="redo"></button>'
    : '<div class="studio-drawing-clarity-history" role="toolbar" aria-label="편집 기록"><button id="undo" aria-label="' + name[0]
      + '"></button><button id="redo" aria-label="' + name[1] + '"></button></div>';
  const f = fixture('<div id="count" data-studio-layer-available-count="10"></div>' + controls
    + '<div hidden><button data-studio-primary-action="undo">숨은 이전 명령</button></div>');
  const state = { layers: 10, undos: 0, redos: 0 };
  const update = () => {
    document.getElementById("count")!.setAttribute("data-studio-layer-available-count", String(state.layers));
    (document.getElementById("undo") as HTMLButtonElement).disabled = state.layers === 0;
    (document.getElementById("redo") as HTMLButtonElement).disabled = state.layers === 10;
  };
  document.getElementById("undo")!.onclick = () => { if (!noOp) state.layers -= 1; state.undos += 1; update(); };
  document.getElementById("redo")!.onclick = () => { if (!noOp) state.layers += 1; state.redos += 1; update(); };
  update();
  const click = harnessFunction("clickStudioHistoryAction", { clickStudioSoakHistoryAction });
  const churn = harnessFunction("exerciseBoundedHistoryChurn", {
    clickStudioHistoryAction: click, readStudioAvailableLayerCount: readStudioSoakLayerCount,
    waitForStudioLayerCount: waitForStudioSoakLayerCount, HISTORY_CHURN_REDO_PROBES: 3,
  });
  return { ...f, history: state, churn: () => churn(f.page, 10, 0), update };
}

function mobileHistoryFixture(expanded = false) {
  const f = historyFixture();
  // 실제 제품 CSS로 접힌 행과 그 안으로 옮겨진 원래 도크 버튼의 가시성을 판정한다.
  const styles = readFileSync(resolve(__dirname, "../../apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css"), "utf8")
    .split("\n").filter((line) => line.startsWith("#studio-app-shell[") && line.includes("div#studio-mobile-edit-options.")).join("\n");
  if (!styles) throw new Error("실제 모바일 편집 행 CSS를 찾을 수 없습니다.");
  document.body.insertAdjacentHTML("beforeend", '<style>' + styles + '</style><main id="studio-app-shell" data-studio-drawing-clarity-mobile="true">'
    + '<header data-studio-drawing-clarity-mobile-header="true"><button id="edit" aria-controls="studio-mobile-edit-options">편집</button></header>'
    + '<div id="studio-mobile-edit-options" class="studio-drawing-clarity-mobile-context"></div></main>');
  const edit = document.getElementById("edit") as HTMLButtonElement;
  const row = document.getElementById("studio-mobile-edit-options")!;
  const history = document.querySelector<HTMLElement>(".studio-drawing-clarity-history")!;
  history.id = "studio-drawing-clarity-history-slot";
  row.append(history);
  for (const action of ["undo", "redo"]) document.getElementById(action)!.setAttribute("data-studio-primary-action", action);
  const setExpanded = (value: boolean) => {
    edit.setAttribute("aria-expanded", String(value));
    row.setAttribute("data-compact-expanded", String(value));
  };
  edit.onclick = () => setExpanded(edit.getAttribute("aria-expanded") !== "true");
  setExpanded(expanded);
  return { ...f, edit, row, setExpanded };
}

describe("현재 사용자 기록 버튼으로 실행하는 실제 bounded churn", () => {
  it.each(["ko", "en", "legacy"] as const)("%s UI에서 Undo 10회·Redo 3회·Undo 3회 뒤 실제 baseline으로 복귀한다", async (locale) => {
    const f = historyFixture(locale);
    await expect(f.churn()).resolves.toBe(16);
    expect(f.history).toEqual({ layers: 0, undos: 13, redos: 3 });
  });

  it("현재 Clarity 버튼이 있으면 함께 보이는 legacy 슬롯보다 현재 기록 영역을 조작한다", async () => {
    const f = historyFixture();
    document.body.insertAdjacentHTML("beforeend", '<button id="legacy" data-studio-primary-action="undo"></button>');
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).resolves.toBe(true);
    expect(f.events).toEqual(["undo"]);
  });

  it("disabled나 중복된 현재 Undo를 우회해서 다른 버튼으로 성공시키지 않는다", async () => {
    const f = historyFixture();
    (document.getElementById("undo") as HTMLButtonElement).disabled = true;
    await expect(f.churn()).rejects.toThrow("Undo became unavailable after 0 of 10");
    expect(f.history.undos).toBe(0);
    document.getElementById("undo")!.parentElement!.append(document.getElementById("undo")!.cloneNode(true));
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).rejects.toThrow("2개");
  });

  it("클릭 성공만으로 Undo를 증명하지 않고 실제 문서가 baseline에 돌아오지 않으면 실패한다", async () => {
    const f = historyFixture("ko", true);
    await expect(f.churn()).rejects.toThrow("Bounded undo ended at 10 layers instead of 0");
    expect(f.history).toEqual({ layers: 10, undos: 10, redos: 0 });
  });

  it("accumulate는 같은 획 수에서도 Undo 검사로 기록하지 않고 bounded만 실행한다", async () => {
    const f = historyFixture();
    if (shouldChurnStudioSoakHistory("accumulate", 10, 10)) await f.churn();
    expect(f.events).toEqual([]);
    if (shouldChurnStudioSoakHistory("bounded-churn", 10, 10)) await f.churn();
    expect(f.history.undos).toBe(13);
  });
});

describe("모바일 편집 행을 실제로 열고 원래 상태로 돌려놓는 기록 명령", () => {
  it("접힌 행의 Undo·Redo를 실행하는 bounded churn은 매번 실제 편집 버튼으로 열고 접는다", async () => {
    const f = mobileHistoryFixture();
    expect(await f.page.locator("#undo").isVisible()).toBe(false);
    await expect(f.churn()).resolves.toBe(16);
    expect(f.history).toEqual({ layers: 0, undos: 13, redos: 3 });
    expect(f.events).toEqual([...Array<string>(10).fill("undo"), ...Array<string>(3).fill("redo"), ...Array<string>(3).fill("undo")]
      .flatMap((action) => ["edit", action, "edit"]));
    expect(f.edit.getAttribute("aria-expanded")).toBe("false");
    expect(await f.page.locator("#studio-mobile-edit-options").isVisible()).toBe(false);
  });

  it.each([false, true])("처음부터 열린 행은 기록 클릭 실패 여부(%s)와 무관하게 그대로 둔다", async (fails) => {
    const f = mobileHistoryFixture(true);
    const failure = new Error("기록 클릭 실패");
    if (fails) f.state.onClick = () => { throw failure; };
    const result = clickStudioSoakHistoryAction(f.page, "undo");
    if (fails) await expect(result).rejects.toBe(failure);
    else await expect(result).resolves.toBe(true);
    expect(f.events).toEqual(["undo"]);
    expect(f.edit.getAttribute("aria-expanded")).toBe("true");
    expect(await f.page.locator("#studio-mobile-edit-options").isVisible()).toBe(true);
  });

  it("disabled Undo를 성공으로 바꾸지 않고 helper가 연 행은 접는다", async () => {
    const f = mobileHistoryFixture();
    (document.getElementById("undo") as HTMLButtonElement).disabled = true;
    await expect(f.churn()).rejects.toThrow("Undo became unavailable after 0 of 10");
    expect(f.events).toEqual(["edit", "edit"]);
    expect(f.history.undos).toBe(0);
    expect(await f.page.locator("#studio-mobile-edit-options").isVisible()).toBe(false);
  });

  it("중복 Undo의 모호성 실패 뒤에도 helper가 연 행을 접는다", async () => {
    const f = mobileHistoryFixture();
    const undo = document.getElementById("undo")!;
    undo.parentElement!.append(undo.cloneNode(true));
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).rejects.toThrow("2개");
    expect(f.events).toEqual(["edit", "edit"]);
    expect(f.history.undos).toBe(0);
    expect(await f.page.locator("#studio-mobile-edit-options").isVisible()).toBe(false);
  });

  it("중복 편집 toggle은 임의의 하나를 선택하지 않는다", async () => {
    const f = mobileHistoryFixture();
    f.edit.parentElement!.append(f.edit.cloneNode(true));
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).rejects.toThrow("2개");
    expect(f.events).toEqual([]);
    expect(f.history.undos).toBe(0);
  });

  it("기록 클릭의 원래 오류를 보존하면서 접힌 상태로 복귀한다", async () => {
    const f = mobileHistoryFixture();
    const failure = new Error("기록 클릭 실패");
    f.state.onClick = (node) => { if (node.id === "undo") throw failure; };
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).rejects.toBe(failure);
    expect(f.events).toEqual(["edit", "undo", "edit"]);
    expect(await f.page.locator("#studio-mobile-edit-options").isVisible()).toBe(false);
  });

  it("열기 버튼이 반응하지 않으면 숨은 Undo를 조작하지 않고 실패한다", async () => {
    const f = mobileHistoryFixture();
    f.edit.onclick = null;
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).rejects.toThrow("조작 대상 0개");
    expect(f.events).toEqual(["edit"]);
    expect(f.history.undos).toBe(0);
    expect(f.edit.getAttribute("aria-expanded")).toBe("false");
  });

  it("열기 클릭 뒤 행이 준비되지 않아도 바뀐 펼침 상태를 실제 버튼으로 복구한다", async () => {
    const f = mobileHistoryFixture();
    f.edit.onclick = () => {
      if (f.edit.getAttribute("aria-expanded") === "true") f.setExpanded(false);
      else f.edit.setAttribute("aria-expanded", "true");
    };
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).rejects.toThrow("조작 대상 0개");
    expect(f.events).toEqual(["edit", "edit"]);
    expect(f.history.undos).toBe(0);
    expect(f.edit.getAttribute("aria-expanded")).toBe("false");
  });

  it("기록을 실행해도 행을 접지 못하면 성공으로 반환하지 않는다", async () => {
    const f = mobileHistoryFixture();
    f.edit.onclick = () => { if (f.edit.getAttribute("aria-expanded") === "false") f.setExpanded(true); };
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).rejects.toThrow("조작 대상 0개");
    expect(f.events).toEqual(["edit", "undo", "edit"]);
    expect(f.history.undos).toBe(1);
    expect(await f.page.locator("#studio-mobile-edit-options").isVisible()).toBe(true);
  });

  it("접기 버튼의 aria만 바뀌고 행이 남으면 정리 실패로 보존한다", async () => {
    const f = mobileHistoryFixture();
    f.edit.onclick = () => {
      if (f.edit.getAttribute("aria-expanded") === "false") f.setExpanded(true);
      else f.edit.setAttribute("aria-expanded", "false");
    };
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).rejects.toThrow("표면이 닫히지 않았습니다");
    expect(f.events).toEqual(["edit", "undo", "edit"]);
    expect(f.edit.getAttribute("aria-expanded")).toBe("false");
    expect(await f.page.locator("#studio-mobile-edit-options").isVisible()).toBe(true);
  });

  it("명령 처리 중 행이 이미 접히면 정리 단계에서 다시 열지 않는다", async () => {
    const f = mobileHistoryFixture();
    f.state.onClick = (node) => { if (node.id === "undo") f.setExpanded(false); };
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).resolves.toBe(true);
    expect(f.events).toEqual(["edit", "undo"]);
    expect(f.history.undos).toBe(1);
    expect(await f.page.locator("#studio-mobile-edit-options").isVisible()).toBe(false);
  });

  it("기록과 접기 오류가 모두 생기면 둘 다 보존한다", async () => {
    const f = mobileHistoryFixture();
    const actionFailure = new Error("기록 클릭 실패"), closeFailure = new Error("편집 행 접기 실패");
    f.state.onClick = (node) => {
      if (node.id === "undo") throw actionFailure;
      if (node.id === "edit" && f.events.filter((event) => event === "edit").length === 2) throw closeFailure;
    };
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).rejects.toMatchObject({
      name: "AggregateError", errors: [actionFailure, closeFailure], cause: actionFailure,
    });
    expect(f.events).toEqual(["edit", "undo", "edit"]);
  });

  it("큰 화면의 숨은 모바일 toggle은 누르지 않고 보이는 기존 명령을 실행한다", async () => {
    const f = historyFixture("legacy");
    document.body.insertAdjacentHTML("beforeend", '<div hidden><button id="edit" aria-controls="studio-mobile-edit-options" aria-expanded="false">편집</button><div id="studio-mobile-edit-options"></div></div>');
    await expect(clickStudioSoakHistoryAction(f.page, "undo")).resolves.toBe(true);
    expect(f.events).toEqual(["undo"]);
  });
});
