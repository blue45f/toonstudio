// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StudioTextEditOverlay from "../lettering/StudioTextEditOverlay";
import { StudioAppSettingsPanel } from "../StudioAppSettingsPanel";
import { StudioShortcutsHelp } from "../StudioShortcutsHelp";
import {
  defaultStudioAppSettings,
  listStudioShortcutConflicts,
} from "../studio-app-settings";
import {
  STUDIO_SHORTCUT_CONTEXT_RULES,
  autoResolveStudioShortcutConflicts,
  resolveStudioShortcutConflictDetails,
  resolveStudioShortcutRowConflictStatus,
} from "./studio-shortcut-conflict-guide";

import type { El } from "../studio-element-model";
import type Konva from "konva";

import { useI18n } from "@/shared/lib/i18n";

describe("studio-shortcut-conflict-guide", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    useI18n.getState().setLang("ko");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("distinguishes canvas vs text-editing behavior with visible UI alternatives for shared keys", () => {
    const ids = STUDIO_SHORTCUT_CONTEXT_RULES.map((rule) => rule.id);
    expect(ids).toContain("single-letter-tools");
    expect(ids).toContain("space-pan-vs-spacebar");
    expect(ids).toContain("enter-vs-mod-enter");
    expect(ids).toContain("escape-cancel");
    expect(ids).toContain("delete-backspace");

    for (const rule of STUDIO_SHORTCUT_CONTEXT_RULES) {
      expect(rule.canvasBehaviorKo).not.toBe(rule.textEditBehaviorKo);
      expect(rule.visibleAlternativeKo.length).toBeGreaterThan(5);
    }
  });

  it("identifies the actual dispatch winner, shadowed action, and visible alternative path on collision", () => {
    const base = defaultStudioAppSettings().shortcuts;
    const conflicted = {
      ...base,
      "flip-canvas": "Shift+H", // collides with flip-selection-h ("Shift+H")
      "quick-hud": "Space", // collides with tool-hand ("Space")
    };

    const details = resolveStudioShortcutConflictDetails(conflicted);
    expect(details).toHaveLength(2);

    const shiftH = details.find((group) => group.chordKey === "Shift+H");
    expect(shiftH?.winner.actionId).toBe("flip-canvas");
    expect(shiftH?.shadowed.map((item) => item.actionId)).toEqual(["flip-selection-h"]);
    expect(shiftH?.shadowed[0]?.visibleAlternativeKo).toContain("가로 반전");

    const space = details.find((group) => group.chordKey === "Space");
    expect(space?.winner.actionId).toBe("tool-hand");
    expect(space?.shadowed.map((item) => item.actionId)).toEqual(["quick-hud"]);
    expect(space?.shadowed[0]?.canRestoreDefaultWithoutConflict).toBe(true);

    expect(resolveStudioShortcutRowConflictStatus(conflicted, "flip-canvas")?.role).toBe("winner");
    expect(resolveStudioShortcutRowConflictStatus(conflicted, "flip-selection-h")?.role).toBe("shadowed");

    const resolved = autoResolveStudioShortcutConflicts(conflicted);
    expect(listStudioShortcutConflicts(resolved).size).toBe(0);
    expect(resolved["flip-canvas"]).toBe("Shift+H");
    expect(resolved["flip-selection-h"]).toBe("");
    expect(resolved["tool-hand"]).toBe("Space");
    expect(resolved["quick-hud"]).toBe("Shift+Space");
  });

  it("renders context comparison, active conflict winner/shadowed details, and 1-click actions in StudioShortcutsHelp", () => {
    const onApplyShortcuts = vi.fn();
    const onOpenShortcutSettings = vi.fn();
    const shortcuts = {
      ...defaultStudioAppSettings().shortcuts,
      "tool-fill": "B", // collides with tool-pen ("B")
    };

    render(
      <StudioShortcutsHelp
        open
        onClose={() => undefined}
        shortcuts={shortcuts}
        onApplyShortcuts={onApplyShortcuts}
        onOpenShortcutSettings={onOpenShortcutSettings}
      />,
    );

    expect(
      screen.getByText("캔버스 조작 vs 텍스트·말풍선 편집 중 같은 키의 실제 동작"),
    ).toBeTruthy();

    const banner = document.querySelector<HTMLElement>(
      '[data-studio-shortcut-conflict-banner="true"]',
    );
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("펜");
    expect(banner?.textContent).toContain("색 채우기");
    expect(banner?.textContent).toContain("좌측 도구막대 「색 채우기」 버튼 클릭");

    fireEvent.click(within(banner!).getByRole("button", { name: "중복 자동 정리" }));
    expect(onApplyShortcuts).toHaveBeenCalledTimes(1);
    const cleaned = onApplyShortcuts.mock.calls[0]?.[0];
    expect(cleaned["tool-pen"]).toBe("B");
    expect(cleaned["tool-fill"]).toBe("G");

    fireEvent.click(within(banner!).getByRole("button", { name: "단축키 설정에서 변경" }));
    expect(onOpenShortcutSettings).toHaveBeenCalledTimes(1);
  });

  it("exposes per-row conflict role, visible fallback path, and 1-click unbind/default in Shortcut Settings", () => {
    const onChange = vi.fn();
    const settings = defaultStudioAppSettings();
    const conflictedSettings = {
      ...settings,
      shortcuts: {
        ...settings.shortcuts,
        "tool-fill": "B",
      },
    };

    render(
      <StudioAppSettingsPanel
        open
        settings={conflictedSettings}
        initialTab="shortcuts"
        onClose={() => undefined}
        onChange={onChange}
        onResetAll={() => undefined}
      />,
    );

    expect(screen.getByText(/중복 · 우선 실행됨/u)).toBeTruthy();
    expect(screen.getByText(/중복 · 펜에 가려짐/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "기본키(G)" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]?.shortcuts["tool-fill"]).toBe("G");
  });

  it("provides a visible context guide bar and blur-safe Finish/Cancel buttons during inline text editing", () => {
    const context = {
      font: "",
      measureText: (value: string) => ({ width: [...value].length * 20 }),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (((id: string) => (id === "2d" ? context : null)) as typeof HTMLCanvasElement.prototype.getContext),
    );

    const state = {
      text: "초기 대사",
      fontSize: 22,
      lineHeight: 1.35,
      letterSpacing: 0,
      width: 240,
      height: 120,
      x: 12,
      y: 12,
    };
    const accessor = <K extends keyof typeof state>(key: K) =>
      ((v?: (typeof state)[K]) => {
        if (v === undefined) return state[key];
        state[key] = v;
        return undefined;
      }) as unknown as () => (typeof state)[K];
    const fakeNode = {
      text: accessor("text"),
      fontSize: accessor("fontSize"),
      lineHeight: accessor("lineHeight"),
      letterSpacing: accessor("letterSpacing"),
      width: accessor("width"),
      height: accessor("height"),
      x: accessor("x"),
      y: accessor("y"),
      fontFamily: () => "Pretendard",
      fontStyle: () => "normal",
      align: () => "center",
      fill: () => "#111111",
      getAbsoluteTransform: () => ({ getMatrix: () => [1, 0, 0, 1, 0, 0] }),
      getLayer: () => ({ batchDraw: () => undefined }),
    };

    const el = {
      id: "bubble-guide-1",
      type: "bubble",
      variant: "speech",
      text: "초기 대사",
      x: 0,
      y: 0,
      width: 280,
      height: 180,
      rotation: 0,
      fill: "#ffffff",
      textFill: "#111111",
      fontSize: 22,
      align: "center",
    } as El;

    const onCommit = vi.fn();
    const onCancel = vi.fn();

    render(
      <StudioTextEditOverlay
        elementId={el.id}
        elementById={new Map([[el.id, el]])}
        nodeRefsRef={{ current: { [el.id]: { findOne: () => fakeNode } as unknown as Konva.Node } }}
        effScale={1}
        stageOriginOffsetX={0}
        stageOriginOffsetY={0}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );

    const guide = document.querySelector('[data-studio-text-edit-shortcut-guide="true"]');
    expect(guide).not.toBeNull();
    expect(guide?.textContent).toContain("단일 키");
    expect(guide?.textContent).toContain("B·V·Space");

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "b v 임시 입력" } });

    const cancelBtn = screen.getByRole("button", { name: "취소 (Esc)" });
    fireEvent.mouseDown(cancelBtn);
    fireEvent.click(cancelBtn);
    fireEvent.blur(textbox);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
