import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ hasTouch: true, isMobile: true });

async function choose(page: Page, trigger: Locator, filename: string, contents: Buffer, mimeType: string) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), trigger.tap()]);
  await chooser.setFiles({ name: filename, mimeType, buffer: contents });
}

for (const [lang, width] of [["ko", 390], ["en", 320]] as const) {
  test(`가져오기 첫 화면에서 원본 파일을 선택하고 손상된 파일을 교체한다 (${lang}, ${width}px)`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(({ language, origin }) => {
      if (location.origin === origin) localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: language }, version: 0 }));
    }, { language: lang, origin: new URL(baseURL!).origin });
    await page.goto("/studio/import", { waitUntil: "domcontentloaded" });

    const picker = page.getByLabel(lang === "ko" ? "파일 선택" : "Choose file", { exact: true });
    const button = picker.locator("..");
    await expect(button).toBeVisible();
    expect(await picker.getAttribute("accept")).toBeNull();
    const bounds = await button.evaluate(label => {
      const { x, y, width: w, height: h } = label.getBoundingClientRect();
      return { x, y, w, h, scrollY, hit: label.contains(document.elementFromPoint(x + w / 2, y + h / 2)) };
    });
    expect(bounds.scrollY).toBe(0);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.w).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.h).toBeLessThanOrEqual(844);
    expect(bounds.h).toBeGreaterThanOrEqual(44);
    expect(bounds.w).toBeGreaterThanOrEqual(44);
    expect(bounds.hit).toBe(true);
    await info.attach("첫 화면 파일 선택 영역", { body: JSON.stringify(bounds), contentType: "application/json" });
    await page.screenshot({ path: info.outputPath("파일-선택-첫-화면.png") });

    await choose(page, button, "unknown.xyz", Buffer.from("unsupported"), "application/octet-stream");
    const next = page.getByRole("button", { name: lang === "ko" ? "편집기에서 가져오기" : "Import in editor" });
    await expect(next).toBeDisabled();
    await choose(page, button, "작업 원본.toonstudio", Buffer.from("broken"), "application/octet-stream");
    const restore = page.getByRole("button", { name: lang === "ko" ? "프로젝트 복원" : "Restore project" });
    await restore.tap();
    await expect(page.getByRole("alert").filter({ hasText: lang === "ko" ? "내 작업과 원고" : "manuscripts remain untouched" })).toBeVisible();
    await expect(restore).toBeDisabled();
    const replace = page.getByRole("button", { name: lang === "ko" ? "다른 호환 파일 선택" : "Choose compatible file" });
    await choose(page, replace, "윤곽.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+6qIAAAAASUVORK5CYII=", "base64"), "image/png");
    await expect(page.getByText("윤곽.png", { exact: true })).toBeVisible();
    await expect(next).toBeEnabled();
    await next.tap();
    await expect(page).toHaveURL(/\/studio\/canvas\?[^#]*importHandoff=/);
  });
}
