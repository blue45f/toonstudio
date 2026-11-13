import { fireEvent, render, screen } from "@testing-library/react";
import { errors, type Locator, type Page } from "playwright";
import { expect, vi } from "vitest";
import { openMobileBrushSettings } from "../../../../../../scripts/lib/studio-mobile-brush-settings";
import {
  StudioMobileEditingDock,
  type StudioMobileEditingDockProps,
} from "../StudioMobileEditingDock";

type LateNoticePropsFactory = (
  overrides: Pick<StudioMobileEditingDockProps, "isMobile" | "setMobileSheet">,
) => StudioMobileEditingDockProps;

/** 실제 도크의 outside-pointer와 helper의 원래 시간 예산을 함께 재현한다. */
export async function runMobileDockLateNotice(
  createProps: LateNoticePropsFactory,
  alwaysInterrupt: boolean,
) {
  // 시트 요청 상태만 모델링한다. 실제 시트 렌더 완료 증거와는 구분한다.
  let requestedSheet: StudioMobileEditingDockProps["mobileSheet"] = null;
  const setMobileSheet = vi.fn<StudioMobileEditingDockProps["setMobileSheet"]>((update) => {
    requestedSheet = typeof update === "function" ? update(requestedSheet) : update;
  });
  render(
    <>
      <StudioMobileEditingDock {...createProps({ isMobile: true, setMobileSheet })} />
      <button type="button" aria-label="지연 안내의 정상 닫기">안내 닫기</button>
    </>,
  );
  const toggle = screen.getByRole("button", { name: "작업 메뉴" });
  fireEvent.click(toggle);
  const panel = document.querySelector<HTMLElement>('[data-studio-mobile-workspace-menu="true"]');
  const targetButton = screen.getByRole("button", { name: "브러시 설정 (굵기·색·프리셋)" });
  if (!panel) throw new Error("실제 도크 메뉴가 없습니다.");
  expect(panel.hidden).toBe(false);
  const close = screen.getByRole("button", { name: "지연 안내의 정상 닫기" });
  const betaSelector = '[data-studio-beta-notice="true"]';
  const sheetSelector = '[data-studio-sheet-id="draw"][data-studio-mobile-sheet="draw"][role="dialog"]:not([aria-hidden="true"]):not([inert])';
  const controlSelector = [
    ':scope[data-studio-mobile-primary-layout="simple"] [data-studio-mobile-primary-actions="true"] button[aria-controls="studio-mobile-draw-settings"][aria-pressed="true"]',
    '[data-studio-mobile-workspace-menu="true"] button[aria-controls="studio-mobile-draw-settings"]:not([data-studio-primary-action]):not([data-studio-mobile-tool])',
  ].join(", ");
  let noticeVisible = false;
  let attempts = 0;
  let normalTargetClicks = 0;
  let reopened = 0;
  const outsidePointerClosed: boolean[] = [];
  const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const surface = (selector: string) => {
    const current = {
      first: () => current,
      isVisible: async () => selector === '[data-studio-canvas-viewport="true"]'
        || selector === ".konvajs-content"
        || (selector === betaSelector && noticeVisible)
        || (selector === sheetSelector && requestedSheet === "draw"),
      waitFor: async (options: { state: string; timeout: number }) => {
        expect(selector).toBe(sheetSelector);
        expect(options.state).toBe("visible");
        expect(options.timeout).toBeGreaterThan(0);
        expect(requestedSheet).toBe("draw");
      },
      locator: () => ({
        click: async (options: { timeout: number }) => {
          expect(selector).toBe(betaSelector);
          expect(options.timeout).toBeGreaterThan(0);
          // 정상 click의 pointerdown이 실제 도크 document listener에 전달된다.
          fireEvent.pointerDown(close);
          outsidePointerClosed.push(panel.hidden === true);
          fireEvent.click(close);
          noticeVisible = false;
        },
      }),
      getByRole: () => ({
        click: async () => {
          throw new Error("보이지 않는 다른 안내를 닫으면 안 됩니다.");
        },
      }),
    };
    return current;
  };
  const page = { locator: surface, waitForTimeout: pause } as unknown as Page;
  const target = {
    click: async ({ timeout }: { timeout: number }) => {
      attempts += 1;
      if (attempts === 1 || alwaysInterrupt) {
        noticeVisible = true;
        await pause(timeout);
        throw new errors.TimeoutError("늦은 안내가 메뉴를 가림");
      }
      if (panel.hidden) {
        await pause(timeout);
        throw new errors.TimeoutError("도크 밖 안내 닫기로 메뉴가 접혀 대상이 숨겨짐");
      }
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      fireEvent.pointerDown(targetButton);
      fireEvent.click(targetButton);
      normalTargetClicks += 1;
    },
  } as unknown as Locator;
  const dock = {
    locator: (selector: string) => {
      if (selector === '[data-studio-mobile-workspace-toggle="true"]') return {
        getAttribute: async (name: string, options: { timeout: number }) => {
          expect(options.timeout).toBeGreaterThan(0);
          expect(options.timeout).toBeLessThanOrEqual(1_000);
          return toggle.getAttribute(name);
        },
        click: async () => {
          fireEvent.pointerDown(toggle);
          fireEvent.click(toggle);
          reopened += 1;
        },
      };
      if (selector === '[data-studio-mobile-workspace-menu="true"]') return {
        waitFor: async (options: { state: string; timeout: number }) => {
          expect(options.state).toBe("hidden");
          expect(options.timeout).toBeGreaterThan(0);
          expect(panel.hidden).toBe(true);
        },
      };
      if (selector === controlSelector) return {
        filter: (options: { visible: boolean }) => {
          expect(options).toEqual({ visible: true });
          return target;
        },
      };
      throw new Error(`예상하지 않은 도크 선택자: ${selector}`);
    },
  } as unknown as Locator;
  const started = Date.now();
  let finishedAt = -1;
  const result = openMobileBrushSettings(page, dock).then(
    () => {
      finishedAt = Date.now() - started;
      return { ok: true as const, error: null };
    },
    (error: unknown) => {
      finishedAt = Date.now() - started;
      return { ok: false as const, error };
    },
  );
  await vi.runAllTimersAsync();
  return {
    outcome: await result,
    finishedAt,
    attempts,
    reopened,
    normalTargetClicks,
    outsidePointerClosed,
    setMobileSheet,
  };
}
