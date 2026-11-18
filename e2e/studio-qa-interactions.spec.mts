import { expect, test } from "@playwright/test";

import { openStudioAllTools, openStudioBg3dEnginePanel, openStudioBg3dProfessionalMode, selectStudioBg3dTaskTab } from "../scripts/lib/studio-bg3d-ui-interactions";
import { openStudioBrushCatalogThroughUi, selectStudioBrushCatalogItemThroughUi, waitForStudioSelectedBrushThroughUi } from "../scripts/lib/studio-brush-catalog-interactions";
import { installStudioOfflinePreviewFixture } from "../scripts/lib/studio-offline-preview-fixture.mjs";
import { setStudioPrimaryColorThroughUi } from "../scripts/lib/studio-primary-color-interactions";
import { clickStudioToolThroughUi } from "../scripts/lib/studio-tool-interactions";

test.describe("Studio QA의 실제 표시 UI 조작", () => {
  test("주 색은 compact 입력의 이벤트로 바꾸며 숨긴 기존 색상 UI를 건드리지 않는다", async ({ page }) => {
    await page.setContent(`
      <section hidden data-studio-draw-options="true">
        <div data-studio-dual-color-well="true" data-studio-primary-color="#111111"><button>주 색</button></div>
      </section>
      <section data-studio-draw-options="true">
        <input type="color" aria-label="주 색 선택" value="#111111">
      </section><output id="selected"></output>
    `);
    await page.locator('input[type="color"]').evaluate(input => {
      input.addEventListener("input", () => {
        const output = document.querySelector("output");
        if (output && input instanceof HTMLInputElement) output.textContent = input.value;
      });
    });
    await setStudioPrimaryColorThroughUi(page, "#A1B2C3");
    await expect(page.locator("output")).toHaveText("#a1b2c3");
    await expect(page.locator('[data-studio-dual-color-well="true"]')).toHaveAttribute("data-studio-primary-color", "#111111");
  });

  test("저장된 배치에서는 색상 팝업 적용과 닫힘까지 확인한다", async ({ page }) => {
    await page.setContent(`
      <section data-studio-draw-options="true">
        <div data-studio-dual-color-well="true" data-studio-primary-color="#111111"><button id="open">주 색</button></div>
      </section>
      <div hidden role="dialog" aria-label="주 색 선택">
        <input aria-label="헥스 색상 코드"><button id="apply">색상 적용</button>
      </div>
    `);
    await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      document.querySelector("#open")?.addEventListener("click", () => { if (dialog) dialog.hidden = false; });
      document.querySelector("#apply")?.addEventListener("click", () => {
        const input = dialog?.querySelector("input");
        const well = document.querySelector<HTMLElement>("[data-studio-dual-color-well]");
        if (input && well) well.dataset.studioPrimaryColor = input.value;
        dialog?.remove();
      });
    });
    await setStudioPrimaryColorThroughUi(page, "#3957ad");
    await expect(page.locator('[data-studio-dual-color-well="true"]')).toHaveAttribute("data-studio-primary-color", "#3957ad");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("같은 색상 입력이 둘 이상 보이거나 형식이 틀리면 조작 성공으로 처리하지 않는다", async ({ page }) => {
    await page.setContent('<section data-studio-draw-options="true"><input type="color" aria-label="주 색 선택"><input type="color" aria-label="주 색 선택"></section>');
    await expect(setStudioPrimaryColorThroughUi(page, "red")).rejects.toThrow("#RRGGBB");
    await expect(setStudioPrimaryColorThroughUi(page, "#abcdef")).rejects.toThrow(/strict mode|기대: 1개/u);
    await expect(page.locator('input[type="color"]').nth(0)).toHaveValue("#000000");
    await expect(page.locator('input[type="color"]').nth(1)).toHaveValue("#000000");
  });

  for (const presentation of ["direct", "dock", "mobile"] as const) {
    test(`${presentation} 카탈로그 진입은 표시된 전체 목록을 열고 도킹 목록과 구분한다`, async ({ page }) => {
      await page.setContent(`
        <button id="trigger">브러시 선택 열기</button>
        ${presentation === "dock" ? `<aside hidden data-studio-brush-workbench-dock="true">
          <div data-studio-brush-catalog-session="true" data-studio-brush-workbench="true"><input type="search" aria-label="전체 브러시 검색"></div>
          <button id="expand">확장 보기</button></aside>` : ""}
        <div hidden id="full" role="dialog" ${presentation === "mobile" ? "" : 'data-studio-brush-floating="paint"'}>
          <section data-studio-brush-catalog-session="true"><input type="search" aria-label="전체 브러시 검색"></section>
        </div>
      `);
      await page.evaluate(mode => {
        const full = document.querySelector<HTMLElement>("#full");
        const dock = document.querySelector<HTMLElement>("aside");
        document.querySelector("#trigger")?.addEventListener("click", () => {
          if (mode === "dock" && dock) dock.hidden = false;
          else if (full) full.hidden = false;
        });
        document.querySelector("#expand")?.addEventListener("click", () => { if (full) full.hidden = false; });
      }, presentation);
      const catalog = await openStudioBrushCatalogThroughUi(page, page.locator("#trigger"));
      await catalog.getByRole("searchbox", { name: "전체 브러시 검색" }).fill("연필");
      await expect(page.locator('#full input[type="search"]')).toHaveValue("연필");
      if (presentation === "dock") await expect(page.locator('aside input[type="search"]')).toHaveValue("");
    });
  }

  test("이미 열린 라이브러리를 토글하여 닫거나 중복 전체 목록에서 임의 선택하지 않는다", async ({ page }) => {
    await page.setContent('<button id="trigger">선택</button><section data-studio-brush-catalog-session="true"><input type="search"></section>');
    await page.locator("#trigger").evaluate(button => { button.addEventListener("click", () => button.setAttribute("data-clicked", "true")); });
    await openStudioBrushCatalogThroughUi(page, page.locator("#trigger"));
    await expect(page.locator("#trigger")).not.toHaveAttribute("data-clicked");
    await page.locator("section").evaluate(section => section.after(section.cloneNode(true)));
    await expect(openStudioBrushCatalogThroughUi(page, page.locator("#trigger"))).rejects.toThrow(/strict mode|기대: 1개/u);
  });

  test("데스크톱 브러시 선택은 숨은 이전 pill 대신 현재 표시를 확인한다", async ({ page }) => {
    await page.setContent(`<section id="surface">
      <button hidden data-studio-brush-active-pill="true" aria-label="현재 도구 매끈한 펜, 6px">이전 도구</button>
      <button data-studio-brush-active-pill="true" aria-label="현재 도구 수채 번짐, 28px">수채 번짐</button>
    </section>`);
    const selected = await waitForStudioSelectedBrushThroughUi(
      page.locator("#surface"), { id: "watercolor", name: "수채 번짐" }, false,
    );
    await expect(selected).toHaveText("수채 번짐");
  });

  test("모바일 브러시 선택은 표시된 tray의 실제 ID로 확인한다", async ({ page }) => {
    await page.setContent(`<button hidden data-studio-brush-active-pill="true" aria-label="현재 도구 매끈한 펜, 6px">이전 도구</button>
      <section id="mobile"><div data-studio-brush-tray="true" data-studio-active-brush-id="watercolor">현재 브러시 수채 번짐</div></section>`);
    const selected = await waitForStudioSelectedBrushThroughUi(
      page.locator("#mobile"), { id: "watercolor", name: "수채 번짐" }, true,
    );
    await expect(selected).toHaveAttribute("data-studio-active-brush-id", "watercolor");
    await expect(page.locator('[data-studio-brush-active-pill="true"]')).toBeHidden();
  });

  test("숨은 브러시 ID만 맞고 현재 모바일 선택이 다르면 성공하지 않는다", async ({ page }) => {
    page.setDefaultTimeout(500);
    await page.setContent(`<section id="mobile">
      <div hidden data-studio-brush-tray="true" data-studio-active-brush-id="watercolor">수채 번짐</div>
      <div data-studio-brush-tray="true" data-studio-active-brush-id="pen">매끈한 펜</div>
    </section>`);
    await expect(waitForStudioSelectedBrushThroughUi(
      page.locator("#mobile"), { id: "watercolor", name: "수채 번짐" }, true,
    )).rejects.toThrow(/Timeout/u);
  });

  test("현재 브러시 표시가 중복되면 임의의 일치 항목으로 통과하지 않는다", async ({ page }) => {
    await page.setContent(`<section id="surface">
      <button data-studio-brush-active-pill="true" aria-label="현재 도구 매끈한 펜, 6px">매끈한 펜</button>
      <button data-studio-brush-active-pill="true" aria-label="현재 도구 수채 번짐, 28px">수채 번짐</button>
    </section>`);
    await expect(waitForStudioSelectedBrushThroughUi(
      page.locator("#surface"), { id: "watercolor", name: "수채 번짐" }, false,
    )).rejects.toThrow(/strict mode|기대: 1개/u);
  });

  test("가상 카탈로그는 재료 ID 대신 이름으로 좁히고 정확한 브러시 ID를 클릭한다", async ({ page }) => {
    await page.setContent(`<section id="catalog"><input type="search" aria-label="전체 브러시 검색">
      <button data-studio-brush-select="oil-filbert">유화 필버트 선택</button>
      <button hidden data-studio-brush-select="oil">유화 선택</button></section><output></output>`);
    await page.evaluate(() => {
      const input = document.querySelector("input");
      const oil = document.querySelector<HTMLButtonElement>('[data-studio-brush-select="oil"]');
      input?.addEventListener("input", () => { if (oil) oil.hidden = input.value !== "유화"; });
      for (const button of document.querySelectorAll<HTMLButtonElement>("button")) {
        button.addEventListener("click", () => {
          const output = document.querySelector("output");
          if (output) output.textContent = button.dataset.studioBrushSelect ?? "";
        });
      }
    });
    await selectStudioBrushCatalogItemThroughUi(page.locator("#catalog"), { id: "oil", name: "유화" });
    await expect(page.getByRole("searchbox")).toHaveValue("유화");
    await expect(page.locator("output")).toHaveText("oil");
  });

  test("그리기 도구는 숨긴 rail을 제외한 유일한 활성 UI에서 실제 클릭한다", async ({ page }) => {
    await page.setContent('<div hidden><button data-studio-rail-tool-id="pen" aria-pressed="false">펜</button></div><button id="active" data-studio-rail-tool-id="pen" aria-pressed="false">펜</button>');
    await page.locator("#active").evaluate(button => { button.addEventListener("click", () => button.setAttribute("aria-pressed", "true")); });
    await clickStudioToolThroughUi(page, "pen");
    await expect(page.locator("#active")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[hidden] button")).toHaveAttribute("aria-pressed", "false");
  });

  test("도구가 중복 표시되거나 비활성이면 숨은 버튼 강제 클릭으로 우회하지 않는다", async ({ page }) => {
    page.setDefaultTimeout(500);
    await page.setContent('<button data-studio-rail-tool-id="select" aria-pressed="false">선택</button><button data-studio-rail-tool-id="select" aria-pressed="false">선택</button>');
    await expect(clickStudioToolThroughUi(page, "select")).rejects.toThrow(/strict mode|기대: 1개/u);
    await page.setContent('<button disabled data-studio-rail-tool-id="select" aria-pressed="false">선택</button>');
    await expect(clickStudioToolThroughUi(page, "select")).rejects.toThrow(/not enabled|Timeout/u);
    await expect(page.locator("button")).toHaveAttribute("aria-pressed", "false");
  });

  test("3D는 장면 도우미에서 정밀 편집으로 진입하고 작업 그룹과 재진입을 복원한다", async ({ page }) => {
    await page.setContent(`<div role="dialog" aria-label="장면 도우미" data-studio-bg3d-experience="simple">
      <div role="group" aria-label="3D 편집 모드">
        <button data-experience="simple" aria-pressed="true">장면 도우미</button><button data-experience="pro" aria-pressed="false">정밀 편집</button>
      </div><section id="professional" hidden><div role="group" aria-label="3D 작업 선택">
        <button data-task="build">장면 만들기</button><button data-task="compose">구도·작화</button><button data-task="layers">장면 레이어</button>
      </div><div id="tasks" role="tablist"></div>
      <div id="camera-controls" hidden><button role="tab" id="bg3d-view-tab-camera" aria-selected="false">카메라</button></div></section>
    </div>`);
    await page.evaluate(() => {
      const tabs: Record<string, string[]> = { build: ["templates", "shapes", "models"], compose: ["view", "lt"], layers: ["layers"] };
      const list = document.querySelector("#tasks");
      for (const button of document.querySelectorAll<HTMLElement>("[data-experience]")) {
        button.addEventListener("click", () => {
          const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
          const professional = document.querySelector<HTMLElement>("#professional");
          if (!dialog || !professional) throw new Error("정밀 편집 표면이 없습니다.");
          dialog.dataset.studioBg3dExperience = button.dataset.experience;
          dialog.setAttribute("aria-label", button.dataset.experience === "pro" ? "정밀 3D 편집" : "장면 도우미");
          professional.hidden = button.dataset.experience !== "pro";
          for (const mode of dialog.querySelectorAll<HTMLElement>("[data-experience]")) mode.setAttribute("aria-pressed", String(mode === button));
        });
      }
      const render = (task: string) => {
        if (!list) throw new Error("작업 탭 목록이 없습니다.");
        list.innerHTML = (tabs[task] ?? []).map((id, index) => `<button role="tab" id="bg3d-tab-${id}" aria-selected="${index === 0}">${id}</button>`).join("");
        const camera = document.querySelector<HTMLElement>("#camera-controls");
        if (camera) camera.hidden = task !== "compose";
        for (const button of document.querySelectorAll<HTMLElement>("[data-task]")) button.setAttribute("aria-pressed", String(button.dataset.task === task));
      };
      for (const button of document.querySelectorAll<HTMLElement>("[data-task]")) {
        button.addEventListener("click", () => render(button.dataset.task ?? ""));
      }
      list?.addEventListener("click", event => {
        const selected = event.target instanceof Element ? event.target.closest("button") : null;
        if (!selected) return;
        for (const button of list.querySelectorAll("button")) button.setAttribute("aria-selected", String(button === selected));
      });
      document.querySelector("#bg3d-view-tab-camera")?.addEventListener("click", event => {
        if (event.currentTarget instanceof Element) event.currentTarget.setAttribute("aria-selected", "true");
      });
      render("build");
    });
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.getByRole("group", { name: "3D 작업 선택" })).toBeHidden();
    await openStudioBg3dProfessionalMode(dialog);
    await expect(dialog).toHaveAttribute("data-studio-bg3d-experience", "pro");
    await selectStudioBg3dTaskTab(dialog, "shapes");
    await openStudioBg3dEnginePanel(dialog);
    await expect(dialog.locator("#bg3d-tab-view")).toHaveAttribute("aria-selected", "true");
    await expect(dialog.locator("#bg3d-view-tab-camera")).toHaveAttribute("aria-selected", "true");
    await selectStudioBg3dTaskTab(dialog, "layers");
    await selectStudioBg3dTaskTab(dialog, "shapes");
    await expect(dialog.locator("#bg3d-tab-shapes")).toHaveAttribute("aria-selected", "true");
    await expect(dialog.locator('[data-task="build"]')).toHaveAttribute("aria-pressed", "true");
    await expect(selectStudioBg3dTaskTab(dialog, "missing")).rejects.toThrow("알 수 없는 3D 작업 탭");
    await dialog.getByRole("button", { name: "장면 도우미", exact: true }).click();
    await expect(dialog.getByRole("group", { name: "3D 작업 선택" })).toBeHidden();
    await openStudioBg3dProfessionalMode(dialog);
    await openStudioBg3dEnginePanel(dialog);
    await expect(dialog.locator("#bg3d-tab-view")).toHaveAttribute("aria-selected", "true");
  });

  test("전체 도구는 숨은 저장 배치의 trigger를 제외하고 현재 compact 버튼으로 연다", async ({ page }) => {
    await page.setContent(`<div hidden data-studio-tool-rail-settings="true"><button aria-label="전체 도구">전체</button></div>
      <button data-studio-rail-all-tools="true">전체 도구</button>
      <div hidden role="dialog" aria-label="전체 도구"><input type="search" aria-label="전체 도구 검색"></div>`);
    await page.locator("[data-studio-rail-all-tools]").evaluate(button => {
      button.addEventListener("click", () => {
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
        if (dialog) dialog.hidden = false;
      });
    });
    const catalog = await openStudioAllTools(page);
    await catalog.getByRole("searchbox", { name: "전체 도구 검색" }).fill("bg3d");
    await expect(catalog.getByRole("searchbox")).toHaveValue("bg3d");
  });

  test("offline fixture는 실제 POST 401만 구분하고 GET 401과 query 502를 실패 증거로 남긴다", async ({ page, context }) => {
    const origin = "http://127.0.0.1:4173";
    await context.route(`${origin}/**`, route => {
      const path = new URL(route.request().url()).pathname;
      return path === "/"
        ? route.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><title>API 경계 검증</title><link rel="icon" href="data:,">' })
        : route.fulfill({ status: path.endsWith("capabilities") ? 502 : 401, contentType: "application/json", body: "{}" });
    });
    const fixture = await installStudioOfflinePreviewFixture(context, origin);
    const consoleDetails: { text: string, expected: boolean }[] = [];
    page.on("console", message => {
      if (message.type() === "error") consoleDetails.push({
        text: message.text(), expected: fixture.isExpectedConsole(message.text(), message.location().url),
      });
    });
    await page.goto(origin);
    expect(await page.evaluate(async () => (await fetch("/api/studio-realtime/tickets", { method: "POST" })).status)).toBe(401);
    await expect.poll(() => fixture.responses.length).toBe(1);
    expect(fixture.unexpectedResponses).toEqual([]);
    await expect.poll(() => consoleDetails.filter(item => item.expected).length).toBe(1);
    expect(await page.evaluate(async () => (await fetch("/api/studio-realtime/tickets")).status)).toBe(401);
    expect(await page.evaluate(async () => (await fetch("/api/health/capabilities?real=1")).status)).toBe(502);
    await expect.poll(() => fixture.unexpectedResponses.length).toBe(2);
    expect(fixture.unexpectedResponses).toEqual([
      expect.objectContaining({ url: `${origin}/api/studio-realtime/tickets`, method: "GET", status: 401 }),
      expect.objectContaining({ url: `${origin}/api/health/capabilities?real=1`, method: "GET", status: 502 }),
    ]);
    await expect.poll(() => consoleDetails.filter(item => !item.expected).length).toBe(2);
  });
});
