import { expect, test } from "@playwright/test";

test("게스트가 쓴 대본과 인물 기준을 창을 닫고 다시 열어 계속 편집한다", async ({ page, context }, info) => {
  await page.goto("/studio/compose/new", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/studio\/compose\/(?!new(?:$|\?))[^/?]+/);
  const url = page.url();
  const script = page.getByRole("textbox", { name: "이야기 또는 회차 대본" });
  const character = page.getByRole("textbox", { name: /캐릭터.*설명|인물.*설명|캐릭터.*기준/ }).first();
  const first = "폐역에 남은 두 사람. 해온은 수첩을 펴고 첫차 시간을 적는다.";
  const note = "해온은 귀 옆에 흰 머리핀을 꽂는다.";
  await script.fill(first);
  await character.fill(note);
  await page.getByRole("button", { name: "클라우드 저장", exact: true }).click();
  await expect(page.getByText(/로그인하면 AI 코믹 디렉터 세션을 클라우드에 저장/)).toBeVisible();
  const reopened = await context.newPage();
  await page.close();
  await reopened.goto(url, { waitUntil: "domcontentloaded" });
  const resumed = reopened.getByRole("textbox", { name: "이야기 또는 회차 대본" });
  await expect(resumed).toHaveValue(first);
  await expect(reopened.getByRole("textbox", { name: /캐릭터.*설명|인물.*설명|캐릭터.*기준/ }).first()).toHaveValue(note);
  await resumed.fill(first + "\n복선은 세 번째 컷에서 드러난다.");
  await reopened.reload({ waitUntil: "domcontentloaded" });
  await expect(resumed).toHaveValue(first + "\n복선은 세 번째 컷에서 드러난다.");
  const screenshot = info.outputPath("대본-재열기.png");
  await reopened.screenshot({ path: screenshot });
  await info.attach("대본-재열기.png", { path: screenshot, contentType: "image/png" });
});
