import { expect, test } from "@playwright/test";

import { openStudioExportPanel, openStudioLayerNavigator, openStudioMainMenu, runStudioClarityAction, visibleStudioControl } from "../scripts/lib/studio-shell-interactions";
import { auditPage, auditSkipLinks } from "../scripts/qa/verify-studio-cross-browser-matrix.mjs";

test("표시된 셸 하나만 선택하고 두 조작 대상이 보이면 실패한다", async ({ page }) => {
  await page.setContent('<button data-tool hidden>이전 도구</button><button data-tool>현재 도구</button>');
  const control = await visibleStudioControl(page.locator("[data-tool]"), "도구", 1_000);
  await expect(control).toHaveText("현재 도구");
  await page.locator("[data-tool]").first().evaluate((node) => node.removeAttribute("hidden"));
  await expect(visibleStudioControl(page.locator("[data-tool]"), "모호한 도구", 1_000)).rejects.toThrow();
});

test("더보기의 실제 분류를 통해 명령에 도달한다", async ({ page }) => {
  await page.setContent(`<summary data-studio-clarity-more-trigger="true"
    onclick="setTimeout(() => document.querySelector('[data-studio-drawing-task-browser]').hidden=false, 20)">더보기</summary>
    <section data-studio-drawing-task-browser="true" hidden>
      <button data-drawing-task-category="workspace" onclick="this.hidden=true;document.querySelector('[data-studio-clarity-action]').hidden=false">화면과 도움말</button>
      <button data-studio-clarity-action="status" hidden onclick="document.querySelector('output').textContent='진단 열림'">저장·화면 문제 해결</button>
    </section><output></output>`);
  await runStudioClarityAction(page, "status");
  await expect(page.locator("output")).toHaveText("진단 열림");
});

test("다른 작업 분류가 열려 있으면 뒤로 돌아간 뒤 필요한 명령을 고른다", async ({ page }) => {
  await page.setContent(`<section data-studio-drawing-task-browser="true">
    <button aria-label="원고 도구 분류로 돌아가기" onclick="this.hidden=true;document.querySelector('[data-drawing-task-category]').hidden=false">뒤로</button>
    <button data-drawing-task-category="document" hidden onclick="document.querySelector('[data-studio-clarity-action]').hidden=false">원고와 레이어</button>
    <button data-studio-clarity-action="layers" hidden onclick="document.querySelector('output').textContent='레이어 열림'">레이어·속성 보기</button>
    </section><output></output>`);
  await runStudioClarityAction(page, "layers");
  await expect(page.locator("output")).toHaveText("레이어 열림");
  await expect(runStudioClarityAction(page, "missing-action")).rejects.toThrow("알 수 없는");
});

test("메뉴를 열 때 캔버스 선택 영역을 해제하지 않는다", async ({ page }) => {
  await page.setContent(`<div data-studio-editor="true" data-studio-drawing-clarity="true">
    <summary data-studio-clarity-more-trigger="true" onclick="document.querySelector('[data-studio-drawing-task-browser]').hidden=false">더보기</summary>
    <section data-studio-drawing-task-browser="true" hidden>
      <button data-drawing-task-category="workspace" onclick="document.querySelector('[data-studio-clarity-action]').hidden=false">화면과 도움말</button>
      <button data-studio-clarity-action="windows" hidden onclick="document.querySelector('[data-studio-drawing-project-tools]').hidden=false;this.closest('section').hidden=true">프로젝트 도구 열기</button>
    </section>
    <section data-studio-drawing-project-tools="true" hidden><nav data-studio-main-menu="true"><button data-studio-main-menu-trigger="view"
      onkeydown="if(event.key==='ArrowDown'){event.preventDefault();document.querySelector('[data-studio-main-menu-panel]').hidden=false}">보기</button></nav></section>
    <div data-studio-main-menu-panel="true" hidden><div role="menu">동반 창</div></div>
    <output data-selection="active">선택 영역</output>
    </div>`);
  await page.evaluate(() => document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.querySelector("output")?.setAttribute("data-selection", "cleared");
  }));
  const menu = await openStudioMainMenu(page, "view");
  await expect(menu).toHaveText("동반 창");
  await expect(page.locator("output")).toHaveAttribute("data-selection", "active");
});

test("출고 패널을 실제 버튼으로 열고 이미 열린 패널을 다시 닫지 않는다", async ({ page }) => {
  await page.setContent(`<button hidden data-studio-clarity-export-btn="true">이전 출고</button>
    <button data-studio-clarity-export-btn="true" onclick="const panel=document.querySelector('[data-studio-export-menu-panel]');panel.hidden=!panel.hidden">출고</button>
    <section data-studio-export-menu-panel="true" hidden><div data-studio-export-basic="true">
      <button aria-pressed="true">PNG</button><button aria-pressed="true">2×</button><button>현재 페이지 PNG 다운로드</button>
    </div></section>`);
  await expect(await openStudioExportPanel(page)).toBeVisible();
  const panel = await openStudioExportPanel(page);
  await expect(panel.getByRole("button", { name: "PNG", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("button", { name: "2×", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("닫힌 details와 비포커스 skip link는 숨김이며 열린 컨트롤의 넘침은 계속 실패한다", async ({ page }) => {
  await page.setContent(`<style>.skip{position:absolute;width:44px;height:44px;left:-100px;clip:rect(0px,0px,0px,0px)}.skip:focus{left:0;clip:auto}</style>
    <details><summary>정렬</summary><select style="position:absolute;left:-120px;width:100px;height:44px" aria-label="정렬"><option>A</option></select></details>
    <a class="skip" data-studio-skip-link="true" href="#canvas" onclick="event.preventDefault();document.getElementById('canvas').focus()">캔버스로 이동</a>
    <main id="canvas" tabindex="-1">원고</main>`);
  expect((await auditPage(page)).offscreen).toEqual([]);
  expect(await auditSkipLinks(page)).toEqual([]);
  await page.locator("summary").click();
  const expanded = await auditPage(page);
  expect(expanded.offscreen).toHaveLength(1);
  expect(expanded.offscreen[0]).toContain("select");
});

test("포커스해도 숨은 링크와 실제 이동하지 않는 skip target은 각각 실패한다", async ({ page }) => {
  await page.setContent(`<style>a{position:absolute;left:-100px;width:44px;height:44px;clip:rect(0px,0px,0px,0px)}</style>
    <a data-studio-skip-link="true" href="#missing" onclick="event.preventDefault()">캔버스로 이동</a>`);
  const failures = await auditSkipLinks(page);
  expect(failures).toHaveLength(2);
  expect(failures[0]).toContain("not visible on keyboard focus");
  expect(failures[1]).toContain("did not focus its target");
});

test("닫힌 레이어 패널을 실제 더보기로 열고 이미 열린 탭을 다시 닫지 않는다", async ({ page }) => {
  await page.setContent(`<summary data-studio-clarity-more-trigger="true"
    onclick="document.querySelector('[data-studio-drawing-task-browser]').hidden=false">더보기</summary>
    <section data-studio-drawing-task-browser="true" hidden>
      <button data-drawing-task-category="document" onclick="document.querySelector('[data-studio-clarity-action]').hidden=false">원고와 레이어</button>
      <button data-studio-clarity-action="layers" hidden onclick="document.querySelector('aside').hidden=false;this.closest('section').hidden=true">레이어·속성 보기</button>
    </section>
    <aside data-testid="studio-inspector-navigator" hidden><button data-studio-inspector-primary-tab="layers"
      aria-selected="false" onclick="this.setAttribute('aria-selected',this.getAttribute('aria-selected')==='true'?'false':'true')">레이어</button></aside>`);
  await openStudioLayerNavigator(page, 2_000);
  await expect(page.locator('[data-studio-inspector-primary-tab="layers"]')).toHaveAttribute("aria-selected", "true");
  await openStudioLayerNavigator(page, 2_000);
  await expect(page.locator('[data-studio-inspector-primary-tab="layers"]')).toHaveAttribute("aria-selected", "true");
});

test("분할 레이어에는 제거된 탭을 요구하지 않고 실제 탭 선택 실패는 거부한다", async ({ page }) => {
  await page.setContent('<section data-studio-inspector-layers-split="true">레이어 목록</section>');
  await openStudioLayerNavigator(page, 1_000);
  // 이미 보이는 목록은 추가 시간이 필요 없고, 닫힌 탭은 아래에서 실제로 선택되어야 한다.
  await openStudioLayerNavigator(page, 0);
  await page.setContent(`<aside data-testid="studio-inspector-navigator"><button
    data-studio-inspector-primary-tab="layers" aria-selected="false">동작하지 않는 레이어 탭</button></aside>`);
  await expect(openStudioLayerNavigator(page, 1_000)).rejects.toThrow();
});
