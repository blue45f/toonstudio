import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { clickPigmentBlockedPngExport } from "../../e2e/helpers/studio-pigment-blocked-export";

import { studioHistoryControlSelector } from "./studio-verify-history-controls.mjs";

import type { Locator, Page } from "@playwright/test";

function fixture({ mode = "clarity", switchBeforeClick = false, entryError, categoryError, exportError, downloadError, noOutcome = false }: {
  mode?: "clarity" | "legacy"; switchBeforeClick?: boolean; entryError?: Error; categoryError?: Error; exportError?: Error; downloadError?: Error; noOutcome?: boolean;
} = {}) {
  const state = { mode, task: false, category: null as "output" | null, panel: false, blocked: false };
  const calls: string[] = [];
  const outcomeError = new Error("실제 차단 또는 도구 선택 화면에 도착하지 않았습니다.");
  const blocked = {} as Locator;
  const arrived = {
    filter: (options: unknown) => { expect(options).toEqual({ visible: true }); return arrived; },
    first: () => arrived,
    waitFor: vi.fn(async (options: unknown) => {
      expect(options).toEqual({ state: "visible" }); calls.push("wait-actual-outcome");
      if (!state.task && !state.blocked) throw outcomeError;
    }),
  };
  const entry = { first() { if (switchBeforeClick) state.mode = "clarity"; return this; }, click: vi.fn(async () => {
    calls.push("entry-" + state.mode); if (entryError) throw entryError;
    if (!noOutcome) { if (state.mode === "clarity") state.task = true; else state.blocked = true; }
  }) };
  const chooseOutput = vi.fn(async () => {
    calls.push("choose-output"); expect(state.task).toBe(true);
    if (categoryError) throw categoryError;
    state.category = "output";
  });
  const exportAction = vi.fn(async () => {
    expect(state.category).toBe("output");
    calls.push("choose-export"); if (exportError) throw exportError;
    expect(state.task).toBe(true); state.task = false; state.panel = true;
  });
  const download = vi.fn(async () => {
    calls.push("request-current-png"); if (downloadError) throw downloadError;
    expect(state.panel).toBe(true); state.panel = false; state.blocked = true;
  });
  const task = {
    or: (other: Locator) => { expect(other).toBe(blocked); return arrived; },
    isVisible: async () => state.task,
    locator: (selector: string) => {
      expect(selector).toBe('[data-drawing-task-category="output"]');
      return { click: chooseOutput };
    },
    getByRole: (role: string, options: unknown) => {
      expect(role).toBe("button"); expect(options).toEqual({ name: "원고 내보내기", exact: true });
      return { click: exportAction };
    },
    waitFor: async (options: unknown) => { expect(options).toEqual({ state: "detached" }); expect(state.task).toBe(false); calls.push("tools-closed"); },
  };
  const panel = {
    waitFor: async ({ state: expected }: { state: string }) => {
      expect(state.panel).toBe(expected === "visible"); calls.push("panel-" + expected);
    },
    getByRole: (role: string, options: unknown) => {
      expect(role).toBe("button"); expect(options).toEqual({ name: "현재 페이지 PNG 다운로드", exact: true });
      return { click: download };
    },
  };
  const page = { locator: (selector: string) => {
    if (selector === 'button[data-studio-primary-action="export"]:visible, [data-studio-clarity-more-trigger="true"]:visible') return entry;
    if (selector === 'dialog[data-studio-drawing-task="tools"]') return task;
    if (selector === '[data-studio-export-menu-panel="true"]') return panel;
    throw new Error("허용하지 않은 우회 조작: " + selector);
  } } as unknown as Page;
  return { page, blocked, state, calls, chooseOutput, exportAction, download, outcomeError };
}

describe("이전 안료 원고의 실제 내보내기 차단 진입", () => {
  it("단순 화면에서 More→원고 내보내기→현재 PNG를 요청하고 실제 패널 닫힘을 확인한다", async () => {
    const f = fixture(); await clickPigmentBlockedPngExport(f.page, f.blocked);
    expect(f.calls).toEqual(["entry-clarity", "wait-actual-outcome", "choose-output", "choose-export", "tools-closed", "panel-visible", "request-current-png", "panel-hidden"]);
    expect(f.chooseOutput).toHaveBeenCalledOnce();
    expect(f.state.blocked).toBe(true); expect(f.exportAction).toHaveBeenCalledOnce(); expect(f.download).toHaveBeenCalledOnce();
  });

  it("기존 배치의 실제 버튼은 차단 결과까지 진행하고 More·추가 다운로드를 실행하지 않는다", async () => {
    const f = fixture({ mode: "legacy" }); await clickPigmentBlockedPngExport(f.page, f.blocked);
    expect(f.calls).toEqual(["entry-legacy", "wait-actual-outcome"]);
    expect(f.chooseOutput).not.toHaveBeenCalled();
    expect(f.state.blocked).toBe(true); expect(f.exportAction).not.toHaveBeenCalled(); expect(f.download).not.toHaveBeenCalled();
  });

  it("선택 후 실제 클릭 전에 단순 화면으로 바뀌어도 현재 진입점의 결과를 따라간다", async () => {
    const f = fixture({ mode: "legacy", switchBeforeClick: true });
    await clickPigmentBlockedPngExport(f.page, f.blocked);
    expect(f.calls[0]).toBe("entry-clarity"); expect(f.download).toHaveBeenCalledOnce(); expect(f.state.blocked).toBe(true);
  });

  it("진입 클릭 실패를 숨기거나 다른 기능으로 우회하지 않는다", async () => {
    const error = new Error("실제 진입 클릭 실패"), f = fixture({ entryError: error });
    await expect(clickPigmentBlockedPngExport(f.page, f.blocked)).rejects.toBe(error);
    expect(f.chooseOutput).not.toHaveBeenCalled();
    expect(f.exportAction).not.toHaveBeenCalled(); expect(f.download).not.toHaveBeenCalled();
  });

  it("출력 목적 선택 실패를 그대로 전하고 원고·PNG 내보내기를 실행하지 않는다", async () => {
    const error = new Error("실제 출력 목적 선택 실패"), f = fixture({ categoryError: error });
    await expect(clickPigmentBlockedPngExport(f.page, f.blocked)).rejects.toBe(error);
    expect(f.calls).toEqual(["entry-clarity", "wait-actual-outcome", "choose-output"]);
    expect(f.exportAction).not.toHaveBeenCalled(); expect(f.download).not.toHaveBeenCalled();
    expect(f.state).toMatchObject({ task: true, category: null, panel: false, blocked: false });
  });

  it("원고 내보내기 선택 실패를 유지한다", async () => {
    const error = new Error("실제 원고 내보내기 실패"), f = fixture({ exportError: error });
    await expect(clickPigmentBlockedPngExport(f.page, f.blocked)).rejects.toBe(error);
    expect(f.download).not.toHaveBeenCalled();
  });

  it("실제 PNG 요청 실패를 성공으로 바꾸지 않는다", async () => {
    const error = new Error("실제 PNG 클릭 실패"), f = fixture({ downloadError: error });
    await expect(clickPigmentBlockedPngExport(f.page, f.blocked)).rejects.toBe(error);
    expect(f.state.panel).toBe(true);
  });

  it("실제 차단이나 선택 화면이 나타나지 않으면 UI가 준비됐다고 가정하지 않는다", async () => {
    const f = fixture({ noOutcome: true });
    await expect(clickPigmentBlockedPngExport(f.page, f.blocked)).rejects.toBe(f.outcomeError);
    expect(f.exportAction).not.toHaveBeenCalled(); expect(f.download).not.toHaveBeenCalled();
  });
});

describe("안료 전환 뒤 공용 기록 selector", () => {
  it.each(["undo", "redo"] as const)("%s는 실제 KO·EN 단순 화면과 기존 기록 버튼만 찾는다", (kind) => {
    const ko = kind === "undo" ? "실행취소" : "다시실행";
    const caption = kind === "undo" ? "되돌리기" : "다시";
    const en = kind === "undo" ? "Undo" : "Redo";
    const other = kind === "undo" ? "redo" : "undo";
    const dom = new JSDOM(`<main>
      <button id="command" data-studio-command-bar-command="${kind}">기존 명령</button>
      <button id="primary" data-studio-primary-action="${kind}">기존 직접 버튼</button>
      <button id="legacy-ko" aria-label="${ko}">기존 이름</button>
      <div class="studio-drawing-clarity-history">
        <button id="clarity-ko" aria-label="${caption} · ${ko}">${caption}</button>
        <button id="clarity-en" aria-label="${en}">${en}</button>
        <button id="unrelated-suffix" aria-label="${en} later">다른 목적</button>
        <button id="other-command" data-studio-command-bar-command="${other}">반대 명령</button>
      </div>
      <button id="outside-ko" aria-label="${caption} · ${ko}">기록 영역 밖</button>
      <button id="outside-en" aria-label="${en}">기록 영역 밖</button>
      <div role="button" aria-label="${ko}">실제 버튼 아님</div>
    </main>`);
    try {
      const matches = [...dom.window.document.querySelectorAll(studioHistoryControlSelector(kind))];
      expect(matches.map(button => button.id)).toEqual(["command", "primary", "legacy-ko", "clarity-ko", "clarity-en"]);
      const disabled = dom.window.document.getElementById("clarity-ko") as HTMLButtonElement;
      disabled.disabled = true;
      expect(matches.filter(button => !(button as HTMLButtonElement).disabled).map(button => button.id))
        .toEqual(["command", "primary", "legacy-ko", "clarity-en"]);
    } finally { dom.window.close(); }
  });
});
