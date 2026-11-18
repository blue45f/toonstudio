import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { prepareStudioBg3dViewportCapture, studioBg3dSceneHistoryControl } from "../scripts/lib/studio-bg3d-ui-interactions";

import { createBg3dCompositorSampler } from "./studio-bg3d-compositor-sampler";

const recoveryCss = readFileSync(new URL("../apps/web/src/domains/creator/bg3d/studio-bg3d-mobile-workspace.css", import.meta.url), "utf8");

test("3D 장면 Undo/Redo는 컷 프로젝트의 별도 기록을 건드리지 않는다", async ({ page }) => {
  await page.setContent(`<div role="dialog">
    <button onclick="this.dataset.used='true'">실행 취소</button>
    <button onclick="this.dataset.used='true'">다시 실행</button>
    <div data-testid="studio-bg3d-viewport">
      <button onclick="this.dataset.used='true'">실행 취소</button>
      <button onclick="this.dataset.used='true'">다시 실행</button>
    </div></div>`);
  const dialog = page.getByRole("dialog");
  for (const action of ["undo", "redo"] as const) await (await studioBg3dSceneHistoryControl(dialog, action)).click();
  await expect(dialog.locator(":scope > button[data-used]")).toHaveCount(0);
  await expect(dialog.getByTestId("studio-bg3d-viewport").locator("button[data-used]")).toHaveCount(2);
});

test("장면 기록 조작이 둘이면 첫 버튼을 임의로 선택하지 않는다", async ({ page }) => {
  await page.setContent('<div role="dialog"><div data-testid="studio-bg3d-viewport"><button>실행 취소</button><button>실행 취소</button></div></div>');
  await expect(studioBg3dSceneHistoryControl(page.getByRole("dialog"), "undo", 500)).rejects.toThrow();
});

test("장면 Undo가 비활성이면 다른 기록으로 우회하지 않는다", async ({ page }) => {
  await page.setContent(`<div role="dialog"><button onclick="this.dataset.used='true'">실행 취소</button>
    <div data-testid="studio-bg3d-viewport"><button disabled>실행 취소</button></div></div>`);
  const undo = await studioBg3dSceneHistoryControl(page.getByRole("dialog"), "undo");
  await expect(undo).toBeDisabled();
  await expect(page.locator("[data-used]")).toHaveCount(0);
});

test("장면 캡처 준비는 실제 접기 조작만 사용하며 반복해도 다시 열지 않는다", async ({ page }) => {
  await page.setContent(`<div role="dialog">
    <details open data-testid="scene3d-cut-panel"><summary>컷 버전 · 원본 고정</summary><p>보존된 컷</p></details>
    <div data-testid="studio-bg3d-viewport"><canvas width="320" height="180" data-scene="original"></canvas></div>
    <section data-testid="studio-bg3d-asset-shelf"><button onclick="this.parentElement.hidden=true">쉘프 접기</button></section>
    </div>`);
  for (let attempt = 0; attempt < 2; attempt += 1) await prepareStudioBg3dViewportCapture(page.getByRole("dialog"));
  await expect(page.getByTestId("scene3d-cut-panel")).not.toHaveAttribute("open");
  await expect(page.getByTestId("studio-bg3d-asset-shelf")).toBeHidden();
  await expect(page.locator("canvas")).toHaveAttribute("data-scene", "original");
  await expect(page.getByText("보존된 컷")).toHaveCount(1);
});

for (const width of [360, 1440]) {
  for (const phase of ["probing", "unavailable"] as const) {
    test(`정밀 3D ${width}px ${phase}에서 뷰포트 도구가 복구 경로를 가리지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 640 });
      await page.setContent(`<style>${recoveryCss}</style><div data-studio-bg3d-workspace>
        <div data-testid="studio-bg3d-viewport" style="position:relative;width:320px;height:280px">
          <div data-testid="studio-bg3d-engine-${phase}">
            <button style="width:160px;height:48px" onclick="this.dataset.selected='webgl2'">WebGL2로 계속</button>
          </div>
          <div data-bg3d-viewport-control="true" style="position:absolute;inset:0;z-index:10">
            <button disabled style="width:160px;height:48px">줄자 측정 시작</button>
          </div>
        </div></div>`);
      await page.getByRole("button", { name: "WebGL2로 계속", exact: true }).click();
      await expect(page.locator('[data-selected="webgl2"]')).toHaveCount(1);
      await expect(page.locator("[data-bg3d-viewport-control]")).toBeHidden();
      await page.getByTestId(`studio-bg3d-engine-${phase}`).evaluate((gate) => gate.remove());
      await expect(page.locator("[data-bg3d-viewport-control]")).toBeVisible();
    });
  }
}

test("화면 안에 있어도 스크롤 조상에 잘린 캔버스는 픽셀 증거로 거절한다", async ({ page }) => {
  await page.setContent(`<div id="scroll" style="width:320px;height:80px;overflow:auto">
    <canvas width="300" height="240" style="width:300px;height:240px"></canvas></div>
    <button onclick="document.getElementById('scroll').style.height='260px'">패널 접기</button>`);
  await expect(createBg3dCompositorSampler(page, "canvas")).rejects.toThrow("clipped");
  await page.getByRole("button", { name: "패널 접기", exact: true }).click();
  const sampler = await createBg3dCompositorSampler(page, "canvas");
  try {
    const shot = await sampler.capture();
    expect(shot.png.byteLength).toBeGreaterThan(0);
    await page.locator("canvas").screenshot();
    await sampler.assertUnchanged();
    await page.locator("#scroll").evaluate((element) => { element.scrollTop = 20; element.style.height = "80px"; });
    await expect(sampler.assertUnchanged()).rejects.toThrow("clipped");
  } finally {
    await sampler.dispose();
  }
  for (const border of [0, 1]) {
    await page.setContent(`<div style="width:300.4px;height:180.4px;overflow:hidden;border:${border}px solid black">
      <canvas width="300" height="180" style="display:block;width:100%;height:100%"></canvas></div>`);
    const fractionalSampler = await createBg3dCompositorSampler(page, "canvas");
    try {
      expect((await fractionalSampler.capture()).png.byteLength).toBeGreaterThan(0);
      await fractionalSampler.assertUnchanged();
    } finally {
      await fractionalSampler.dispose();
    }
  }
});
