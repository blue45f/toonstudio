import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";


import { closeStudioInAppRouteModal } from "../scripts/lib/studio-inapp-route-modal";
import { createStudioQuickBrushStep } from "../scripts/lib/studio-quick-brush-interactions";
import { inspectStudioMobileWorkspaceMenuDormancy, waitForStudioShellHydration } from "../scripts/lib/studio-shell-interactions";

import { buildStudioReactFixture } from "./helpers/studio-react-fixture.mjs";

let tooltipBundle = "";
test.beforeAll(async () => { tooltipBundle = await buildStudioReactFixture(`
    import { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { AccessibleTooltipLayer } from "./shared/components/AccessibleTooltipLayer";
    function Fixture() {
      const [tool, setTool] = useState("select"), [clicks, setClicks] = useState(0);
      return <><AccessibleTooltipLayer/><div role="toolbar" aria-orientation="vertical" aria-label="그리기 도구" className="rail">
        <button title="선택 · V" aria-pressed={tool === "select"} onClick={() => setTool("select")}>선택</button>
        <button title="펜 · B" aria-pressed={tool === "pen"} onClick={() => { setTool("pen"); setClicks(n => n + 1); }}>펜</button>
      </div><output>{clicks}</output></>;
    }
    createRoot(document.getElementById("fixture")).render(<Fixture/>);
  `); });

async function tooltipFixture(page: Page, edge: "left" | "right") {
  const tools = readFileSync(new URL("../apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarityCoreTools.tsx", import.meta.url), "utf8");
  expect(tools).toMatch(/className="studio-drawing-clarity-tools" role="toolbar" aria-orientation="vertical"/u);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.setContent(`<html lang="ko"><style>
    body{margin:0;font:16px sans-serif}.rail{position:fixed;${edge}:16px;top:180px;display:flex;flex-direction:column;gap:4px}
    .rail button{box-sizing:border-box;width:48px;height:48px}output{position:fixed;top:10px;left:400px}
    [data-app-tooltip-layer]{box-sizing:border-box;position:fixed;z-index:240;pointer-events:auto;width:max-content;max-width:288px;
      padding:8px 10px;border:1px solid black;background:white;text-align:left}
    [data-app-tooltip-layer][data-positioned=false]{visibility:hidden}
    [data-app-tooltip-layer] span{display:block}[data-app-tooltip-arrow]{position:absolute;width:10px;height:10px}
  </style><div id="fixture"></div></html>`);
  await page.addScriptTag({ content: tooltipBundle });
  await expect(page.getByRole("button", { name: "선택", exact: true })).toBeVisible();
}

for (const edge of ["left", "right"] as const) {
  test(`${edge} 세로 도구막대 도움말이 떠 있어도 다음 도구를 첫 클릭으로 선택한다`, async ({ page }) => {
    await tooltipFixture(page, edge);
    await page.getByRole("button", { name: "선택", exact: true }).hover();
    const tooltip = page.getByRole("tooltip"), pen = page.getByRole("button", { name: "펜", exact: true });
    await expect(tooltip).toHaveAttribute("data-side", edge === "left" ? "right" : "left");
    const helpBox = await tooltip.boundingBox(), penBox = await pen.boundingBox();
    expect(helpBox).not.toBeNull(); expect(penBox).not.toBeNull();
    if (!helpBox || !penBox) throw new Error("도움말 또는 펜의 실측 상자가 없습니다.");
    expect(helpBox.x + helpBox.width <= penBox.x || helpBox.x >= penBox.x + penBox.width).toBe(true);
    await tooltip.hover();
    await page.waitForTimeout(250);
    await expect(tooltip).toBeVisible();
    await pen.click();
    await expect(pen).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("output")).toHaveText("1");
    await pen.press("Shift+Tab");
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
  });
}

test("현재 그리기 셸과 기존 상세 셸 각각의 실제 준비 신호를 기다린다", async ({ page }) => {
  await page.setContent('<div data-studio-editor="true" data-studio-drawing-clarity="true"><button data-studio-clarity-more-trigger="true">더보기</button></div>');
  await waitForStudioShellHydration(page, 500);
  await page.setContent('<div data-studio-editor="true"><main data-studio-canvas-viewport="true">작업 캔버스</main><button hidden data-studio-command-bar-settings-trigger="true">설정</button></div>');
  await waitForStudioShellHydration(page, 500);
});

test("로딩 표지나 이전 숨은 셸만 있으면 준비 성공으로 판단하지 않는다", async ({ page }) => {
  await page.setContent('<div hidden data-studio-editor="true"><button data-studio-command-bar-settings-trigger="true">이전</button></div><div data-studio-editor="true" data-studio-drawing-clarity="true"><span data-studio-menubar-loading="true">로딩</span></div>');
  await expect(waitForStudioShellHydration(page, 150)).rejects.toThrow();
});

test("모바일은 실제 더보기와 창 배치를 요청한 뒤에만 숨은 경량 관리자를 마운트한다", async ({ page }) => {
  await page.setContent(`<div data-studio-editor="true" data-studio-drawing-clarity="true">
    <button data-studio-clarity-more-trigger="true" onclick="document.querySelector('[data-studio-drawing-task-browser]').hidden=false">더보기</button>
    <div data-studio-drawing-task-browser="true" hidden>
      <button data-drawing-task-category="workspace" onclick="document.querySelector('[data-studio-clarity-action]').hidden=false">창 배치</button>
      <button data-studio-clarity-action="windows" hidden>프로젝트·창</button>
    </div></div>`);
  await page.locator('[data-studio-clarity-action="windows"]').evaluate(button => {
    button.addEventListener("click", () => {
      const editor = document.querySelector('[data-studio-editor="true"]');
      if (!editor) throw new Error("편집기 없음");
      const taskBrowser = editor.querySelector('[data-studio-drawing-task-browser="true"]');
      if (!(taskBrowser instanceof HTMLElement)) throw new Error("작업 분류 없음");
      taskBrowser.hidden = true;
      const panel = document.createElement("section");
      panel.id = "studio-drawing-clarity-panel-commands";
      panel.dataset.studioDrawingProjectTools = "true";
      panel.setAttribute("aria-labelledby", "studio-project-tools-heading");
      panel.innerHTML = '<h2 id="studio-project-tools-heading">프로젝트·창 도구</h2><span data-testid="studio-workspace-menu-gate"><button hidden aria-haspopup="dialog" aria-label="작업공간: 기본">작업공간</button></span>';
      editor.append(panel);
    });
  });
  const result = await inspectStudioMobileWorkspaceMenuDormancy(page);
  expect(result).toMatchObject({ ok: true, gateCount: 1, triggerCount: 1, heavyMenuCount: 0, dialogCount: 0,
    beforeIntent: { gateCount: 0, triggerCount: 0, heavyMenuCount: 0, dialogCount: 0 } });
  await expect(page.locator('[data-studio-editor="true"]')).toHaveAttribute("data-studio-drawing-clarity", "true");
  await expect(page.locator('[data-studio-drawing-project-tools="true"]')).toBeVisible();
});

test("스토리보드를 정상 닫고 가려졌던 편집기 복귀 버튼으로 홈에 돌아간다", async ({ page }) => {
  await page.route("http://studio-fixture.test/**", async route => {
    const home = new URL(route.request().url()).pathname === "/studio";
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: home ? "<h1>작업 홈</h1>" : `
      <button data-studio-editor-return="lane" onclick="location.assign('/studio')">이전</button>
      <div role="dialog" aria-modal="true" aria-label="스토리보드 컨트롤 룸" style="position:fixed;inset:0;background:white">
        <button aria-label="닫기" onclick="this.parentElement.remove()">×</button>
      </div>` });
  });
  await page.goto("http://studio-fixture.test/studio/comic");
  expect(await page.evaluate(() => document.characterSet)).toBe("UTF-8");
  await expect(page.getByRole("dialog", { name: "스토리보드 컨트롤 룸", exact: true })).toBeVisible();
  const editorReturn = page.locator("[data-studio-editor-return]");
  await expect(editorReturn.click({ trial: true, timeout: 150 })).rejects.toThrow();
  expect(await closeStudioInAppRouteModal(page, "comic")).toBe("스토리보드 컨트롤 룸");
  await editorReturn.click();
  await expect(page).toHaveURL("http://studio-fixture.test/studio");
  await expect(page.getByRole("heading", { name: "작업 홈" })).toBeVisible();
});

for (const appliesSelection of [true, false]) {
  test(`여덟 개 빠른 브러시 중 클릭한 식별자의 재개방 후 실제 선택을 검사한다: ${appliesSelection}`, async ({ page }) => {
    await page.setContent(`<button onclick="document.querySelector('#settings').hidden=false">브러시 설정</button>
      <section id="settings" hidden><div data-studio-brush-tray="true">
        <button hidden role="option" data-studio-brush-chip="pencil" aria-selected="false">숨은 이전 연필</button>
        ${["pen", "pencil", "marker", "crayon", "oil", "ink", "wash", "eraser"].map(id =>
          `<button role="option" data-studio-brush-chip="${id}" aria-selected="${id === "pen"}">${id}</button>`).join("")}
      </div></section><output>0</output>`);
    await page.locator('[data-studio-brush-tray="true"]').evaluate((tray, applies) => {
      for (const button of tray.querySelectorAll('button:not([hidden])')) button.addEventListener("click", () => {
        const output = document.querySelector("output"), sheet = document.querySelector("#settings");
        if (!output || !(sheet instanceof HTMLElement)) throw new Error("빠른 브러시 fixture가 없습니다.");
        output.textContent = String(Number(output.textContent) + 1);
        if (applies) for (const option of tray.querySelectorAll('[role="option"]')) {
          option.setAttribute("aria-selected", String(option === button));
        }
        tray.prepend(button);
        sheet.hidden = true;
      });
    }, appliesSelection);
    const step = createStudioQuickBrushStep({
      openSettings: async currentPage => {
        const sheet = currentPage.locator("#settings");
        if (!(await sheet.isVisible())) await currentPage.getByRole("button", { name: "브러시 설정", exact: true }).click();
        await expect(sheet).toBeVisible();
        return sheet;
      },
      click: async locator => { await locator.click(); },
      settle: async () => undefined,
    });
    if (appliesSelection) await expect(step.run(page)).resolves.toBe("ok");
    else await expect(step.run(page)).rejects.toThrow("pencil 선택이 적용되지 않았습니다");
    await expect(page.locator("output")).toHaveText("1");
    await expect(page.getByRole("option", { name: "pencil", exact: true })).toHaveAttribute("aria-selected", String(appliesSelection));
  });
}
