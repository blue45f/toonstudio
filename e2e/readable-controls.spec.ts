import { expect, test } from "@playwright/test";

import { expectReadableControl } from "./helpers/expect-readable-control";

for (const background of ["white", "linear-gradient(120deg, #b39bff, rgb(148, 183, 255))"]) {
  test(`가독성 검사기가 읽을 수 있는 버튼을 통과시킨다: ${background}`, async ({ page }) => {
    await page.setContent(`<button style="background:${background};color:#121226;padding:12px">계속</button>`);
    await expectReadableControl(page.getByRole("button", { name: "계속" }));
  });
}

test("낮은 대비의 그라데이션을 배경 이미지가 있다는 이유만으로 통과시키지 않는다", async ({ page }) => {
  await page.setContent('<button style="background:linear-gradient(black, white);color:#777;padding:12px">계속</button>');
  await expect(expectReadableControl(page.getByRole("button", { name: "계속" }))).rejects.toThrow();
});

test("투명 배경이나 임의 이미지를 검증된 불투명 배경으로 처리하지 않는다", async ({ page }) => {
  await page.setContent('<button style="background:transparent;color:black;padding:12px">계속</button>');
  await expect(expectReadableControl(page.getByRole("button", { name: "계속" }))).rejects.toThrow("투명 배경");
});


test("투명 버튼은 실제 불투명 조상의 배경색까지 합성해 판정한다", async ({ page }) => {
  await page.setContent('<main style="background:white"><section style="background:rgba(255,255,255,0.5)"><button style="background:transparent;color:black;padding:12px">계속</button></section></main>');
  await expectReadableControl(page.getByRole("button", { name: "계속" }));
  await page.getByRole("button").evaluate((element) => { element.style.color = "#eee"; });
  await expect(expectReadableControl(page.getByRole("button", { name: "계속" }))).rejects.toThrow();
});
