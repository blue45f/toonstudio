// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioCinematicCanvasWelcome } from "./StudioCinematicCanvasWelcome";
import { STUDIO_CANVAS_START_DOCK_STORAGE_KEY } from "./studio-canvas-start-dock-preference";

const css = readFileSync(resolve(process.cwd(), "apps/web/src/domains/creator/canvas/studio-canvas-start-dock.css"), "utf8");
const foregroundSelector = 'body:has([data-studio-mobile-sheet]:not([hidden]):not([aria-hidden="true"])) .studio-canvas-start';

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("모바일 시트가 시작 안내보다 전경 입력을 소유한다", () => {
  it("모바일 범위에서만 시작 안내의 표시·포인터·키보드 접근을 함께 비운다", () => {
    const mobileCss = css.split("@media (max-width: 63.999rem) {")[1]?.split("@media (prefers-reduced-motion: reduce)")[0];
    const rule = mobileCss?.split(`${foregroundSelector} {`)[1]?.split("}")[0];
    expect(rule).toContain("visibility: hidden;");
    expect(rule).toContain("pointer-events: none;");
    expect(css.split(foregroundSelector)).toHaveLength(2);
  });

  it.each([true, false])("접힘=%s 상태에서 시트 표시 규칙을 따르고 닫힌 뒤 시작 경로를 보존한다", async (initiallyCollapsed) => {
    render(<StudioCinematicCanvasWelcome pageKey="mobile-foreground" visible initiallyCollapsed={initiallyCollapsed} />);
    const welcome = document.querySelector("[data-studio-cinematic-canvas-welcome]");
    expect(welcome).not.toBeNull();
    const presentation = welcome?.getAttribute("data-studio-cinematic-canvas-welcome");
    const sheet = document.createElement("section");
    document.body.append(sheet);
    try {
      for (const surface of ["tools", "colors", "draw", "pages", "props"]) {
        sheet.dataset.studioMobileSheet = surface;
        sheet.hidden = true;
        sheet.setAttribute("aria-hidden", "true");
        expect(welcome?.matches(foregroundSelector)).toBe(false);
        sheet.hidden = false;
        expect(welcome?.matches(foregroundSelector)).toBe(false);
        sheet.setAttribute("aria-hidden", "false");
        expect(welcome?.matches(foregroundSelector)).toBe(true);
        expect(welcome?.getAttribute("data-studio-cinematic-canvas-welcome")).toBe(presentation);
        sheet.hidden = true;
        expect(welcome?.matches(foregroundSelector)).toBe(false);
      }
      expect(window.localStorage.getItem(STUDIO_CANVAS_START_DOCK_STORAGE_KEY)).toBeNull();
      if (initiallyCollapsed) fireEvent.click(screen.getByRole("button", { name: /시작 방법 보기/u }));
      else fireEvent.click(screen.getByRole("button", { name: "다른 시작 방법" }));
      await screen.findByRole("heading", { name: "첫 장면을 어떻게 시작할까요?" });
      fireEvent.click(screen.getByRole("button", { name: "시작 안내 닫기" }));
      expect(screen.getByRole("button", { name: /시작 방법 보기/u })).toBe(document.activeElement);
    } finally {
      sheet.remove();
    }
  });
});
