import type { Page } from "playwright";

export const CHARACTER_SHAPER_DIALOG = '[data-character-shaper="true"]';
const CAMERA_SELECT_NAMES = ["부위·방향 확대 검사", "카메라 렌즈 초점거리", "카메라 조작 방식", "시선 추적 모드"];

/** Outer overflow:hidden can hide broken children without increasing document.scrollWidth. */
export async function mobileChromeBounds(page: Page, exportOpen: boolean, cameraExtrasOpen: boolean) {
  return page.evaluate(({ dialogSelector, exportOpen, cameraExtrasOpen, expectedSelects }) => {
    const root = document.querySelector<HTMLElement>(`${dialogSelector} [data-character-shaper-surface]`);
    if (!root) throw new Error("character dialog surface missing");
    const frame = root.getBoundingClientRect();
    const violations: string[] = [];
    const controls: { name: string; x: number; y: number; width: number; height: number }[] = [];
    const selectors = [
      "[data-character-shaper-summary] button",
      "[data-character-shaper-dock] button",
      ...(exportOpen ? ["[data-character-export-sheet] select"] : [
        '[aria-label="뷰포트 보기 설정"] button',
        '[data-testid="shaper-camera-extras-toggle"]',
        ...(cameraExtrasOpen ? ["[data-character-camera-selects] select"] : []),
        "[data-character-quality-trigger]",
      ]),
    ];
    if (!exportOpen) {
      const visibleSelects = [...root.querySelectorAll("[data-character-camera-selects] select")]
        .filter((select) => select.getClientRects().length > 0);
      const names = new Set(visibleSelects.map((select) => select.getAttribute("aria-label")));
      if (cameraExtrasOpen
        ? visibleSelects.length !== expectedSelects.length || expectedSelects.some((name) => !names.has(name))
        : visibleSelects.length !== 0) {
        violations.push("세부 카메라 설정의 펼침 상태와 표시한 선택 필드가 다릅니다.");
      }
    }
    const elements = new Set(selectors.flatMap((selector) => [...root.querySelectorAll<HTMLElement>(selector)]));
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      const name = element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName;
      controls.push({ name, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      if (rect.width < 43.5 || rect.height < 43.5) violations.push(`${name}: target smaller than 44px`);
      if (rect.left < frame.left - 0.5 || rect.right > frame.right + 0.5 || rect.top < frame.top - 0.5 || rect.bottom > frame.bottom + 0.5) {
        violations.push(`${name}: outside dialog surface`);
      }
      let ancestor = element.parentElement;
      while (ancestor && root.contains(ancestor)) {
        const style = getComputedStyle(ancestor);
        const bounds = ancestor.getBoundingClientRect();
        if (/(hidden|clip|auto|scroll)/u.test(style.overflowX) && (rect.left < bounds.left - 0.5 || rect.right > bounds.right + 0.5)) {
          violations.push(`${name}: horizontally clipped by ${ancestor.tagName}`);
        }
        if (/(hidden|clip|auto|scroll)/u.test(style.overflowY) && (rect.top < bounds.top - 0.5 || rect.bottom > bounds.bottom + 0.5)) {
          violations.push(`${name}: vertically clipped by ${ancestor.tagName}`);
        }
        ancestor = ancestor.parentElement;
      }
      // 높이 44px인 캡슐형 펼침 버튼의 6px 대각점은 둥근 모서리 바깥이다.
      const inset = element.matches('[data-testid="shaper-camera-extras-toggle"]') ? 8 : 6;
      for (const [x, y] of [[rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + inset, rect.top + inset], [rect.right - inset, rect.bottom - inset]]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || (hit !== element && !element.contains(hit))) {
          violations.push(`${name}: tap intercepted by ${hit?.getAttribute("aria-label") || hit?.tagName || "nothing"}`);
          break;
        }
      }
    }
    if (!exportOpen && !root.querySelector("[data-character-quality-launcher] [data-character-quality-trigger]")) {
      violations.push("mobile quality launcher must be in the sheet header");
    }
    const cameraBar = root.querySelector<HTMLElement>("[data-character-shaper-camera-bar]");
    const sceneCanvas = root.querySelector<HTMLCanvasElement>("[data-character-shaper-viewport] canvas");
    const barBounds = cameraBar?.getBoundingClientRect();
    const canvasBounds = sceneCanvas?.getBoundingClientRect();
    if (!barBounds || !canvasBounds) violations.push("mobile camera controls or scene canvas missing");
    else if (barBounds.bottom > canvasBounds.top + 0.5) {
      violations.push("camera controls cover the character canvas");
    }
    const sheet = root.querySelector<HTMLElement>("[data-character-export-sheet]");
    if (exportOpen) {
      if (!sheet) violations.push("export sheet missing");
      else {
        const bounds = sheet.getBoundingClientRect();
        if (bounds.left < frame.left || bounds.right > frame.right || sheet.scrollWidth > sheet.clientWidth + 1) {
          violations.push("export sheet or its content overflows the dialog");
        }
        const help = sheet.querySelector<HTMLElement>("[data-character-export-size-help]");
        if (!help || help.scrollWidth > help.clientWidth + 1) violations.push("export resolution help is clipped");
      }
    }
    return { width: innerWidth, exportOpen, cameraExtrasOpen, controls, cameraBarBottom: barBounds?.bottom, canvasTop: canvasBounds?.top, canvasHeight: canvasBounds?.height, violations };
  }, { dialogSelector: CHARACTER_SHAPER_DIALOG, exportOpen, cameraExtrasOpen, expectedSelects: CAMERA_SELECT_NAMES });
}

/** 실제 캔버스 바깥에 카메라 도구 공간을 예약하는지 안정된 resize 뒤에 확인한다. */
export async function cameraChromeBounds(page: Page, layout: "desktop" | "tablet") {
  await page.waitForFunction(({ dialogSelector, layout }) =>
    document.querySelector(dialogSelector)?.getAttribute("data-character-shaper-layout") === layout,
  { dialogSelector: CHARACTER_SHAPER_DIALOG, layout });
  await page.waitForTimeout(300);
  return page.evaluate(async ({ dialogSelector, expectedSelects }) => {
    const root = document.querySelector<HTMLElement>(dialogSelector);
    const bars = root?.querySelectorAll<HTMLElement>("[data-character-shaper-camera-bar]");
    const bar = bars?.item(0);
    const canvas = root?.querySelector<HTMLCanvasElement>("[data-character-shaper-viewport] canvas");
    if (!root || bars?.length !== 1 || !bar || !canvas) throw new Error("카메라 도구나 캐릭터 캔버스가 없거나 중복되었습니다.");
    // 크기가 연속 세 프레임 동안 같아야 resize 이후 배치로 판정한다.
    let previous = "";
    let stableFrames = 0;
    for (let frame = 0; frame < 60 && stableFrames < 3; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const bounds = canvas.getBoundingClientRect();
      const signature = [bounds.x, bounds.y, bounds.width, bounds.height, bar.getBoundingClientRect().bottom].join(",");
      stableFrames = signature === previous ? stableFrames + 1 : 0;
      previous = signature;
    }
    if (stableFrames < 3) throw new Error("resize 이후 카메라 도구와 캔버스 크기가 안정되지 않았습니다.");
    const barBounds = bar.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    const cameraButtons = root.querySelectorAll<HTMLElement>('[aria-label="카메라 프리셋"] button');
    const cameraSelects = root.querySelectorAll<HTMLElement>("[data-character-camera-selects] select");
    const violations: string[] = [];
    const controls = [...cameraButtons, ...cameraSelects].map((control) => {
      const bounds = control.getBoundingClientRect();
      if (!bar.contains(control)) violations.push("카메라 조작 도구가 예약된 bar 바깥에 있습니다.");
      return { name: control.getAttribute("aria-label") || control.textContent?.trim() || control.tagName,
        x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, bottom: bounds.bottom };
    });
    const selectNames = new Set([...cameraSelects].map((select) => select.getAttribute("aria-label")));
    if (cameraButtons.length !== 5 || cameraSelects.length !== expectedSelects.length
      || expectedSelects.some((name) => !selectNames.has(name))) {
      violations.push("카메라 프리셋이나 선택 필드가 없거나 중복되었습니다.");
    }
    if (canvasBounds.width <= 0 || canvasBounds.height <= 0) violations.push("캐릭터 캔버스의 면적이 없습니다.");
    if (barBounds.bottom > canvasBounds.top + 0.5) violations.push("카메라 도구가 캐릭터 캔버스를 가립니다.");
    for (const control of controls) {
      if (control.bottom > canvasBounds.top + 0.5) violations.push(`${control.name}: 캐릭터 캔버스를 가립니다.`);
      if (control.width < 43.5 || control.height < 43.5) violations.push(`${control.name}: 조작 영역이 44px보다 작습니다.`);
      if (control.x < barBounds.left - 0.5 || control.x + control.width > barBounds.right + 0.5) {
        violations.push(`${control.name}: 카메라 도구 영역을 벗어납니다.`);
      }
    }
    return { width: innerWidth, layout: root.getAttribute("data-character-shaper-layout"),
      cameraBarBottom: barBounds.bottom, canvasTop: canvasBounds.top,
      canvasWidth: canvasBounds.width, canvasHeight: canvasBounds.height, controls, violations };
  }, { dialogSelector: CHARACTER_SHAPER_DIALOG, expectedSelects: CAMERA_SELECT_NAMES });
}
