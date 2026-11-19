import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`${width}px 아이디어 보드에서 두 카드를 기존 회차 대본 끝에 한 번만 추가한다`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const original = "비가 그칠 때까지 기다려.  ";
    const cards = ["복도 끝의 조명이 꺼진다.", "유리가 창문을 열고 뒤를 돌아본다."];
    const expected = original + "\n\n" + cards.join("\n");
    const body = page.getByRole("textbox", { name: "대본", exact: true });
    const saved = page.getByText("이 기기에 대본 저장됨", { exact: true });
    const board = page.getByRole("region", { name: "기획 무드보드" });
    await page.goto("/studio/p/board-script/story?view=script&uiMode=focus", { waitUntil: "domcontentloaded" });
    await body.fill(original);
    await expect(saved).toBeVisible();
    await page.locator("summary").filter({ hasText: "프로젝트 메뉴" }).click();
    await page.getByRole("link", { name: "아이디어 보드", exact: true }).click();
    const form = board.getByRole("form", { name: "카드 더하기" }).first();
    for (const card of cards) {
      await form.getByLabel("내용").fill(card);
      await form.getByRole("button", { name: "카드 더하기", exact: true }).click();
    }
    const connections = board.getByRole("region", { name: "카드 연결" });
    await connections.getByRole("button", { name: "카드 연결하기" }).click();
    const use = connections.getByRole("link", { name: "대본에서 열기" });
    const href = await use.getAttribute("href");
    if (!href) throw new Error("연결한 카드의 원고 주소가 없습니다.");
    const url = new URL(href, page.url());
    expect(url.searchParams.getAll("boardCard")).toHaveLength(2);
    for (const card of cards) expect(decodeURIComponent(url.search)).not.toContain(card);
    await use.click();
    const excerpt = page.getByRole("region", { name: "아이디어 보드에서 가져온 카드" });
    const append = excerpt.getByRole("button", { name: "이 회차 대본 끝에 추가" });
    await expect(body).toHaveValue(original);
    await expect(excerpt).toContainText(cards.join("\n"));
    await append.click();
    await expect(body).toHaveValue(expected);
    await expect(append).toBeDisabled();
    await expect(saved).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(body).toHaveValue(expected);
    await expect(append).toBeDisabled();
    await testInfo.attach("카드에서 대본까지", { body: await excerpt.screenshot(), contentType: "image/png" });
    const returnToBoard = page.getByRole("link", { name: "아이디어 보드", exact: true });
    if (!await returnToBoard.isVisible()) await page.locator("summary").filter({ hasText: "프로젝트 메뉴" }).click();
    await returnToBoard.click();
    await expect(board).toBeVisible();
    for (const card of cards) await expect(board.getByText(card, { exact: true }).first()).toBeVisible();
  });
}

test("손상된 보드를 기기 DB 복구본으로 열고 원래 데이터도 보존한다", async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const project = "idea-checkpoint";
  const key = "toonstudio:moodboard:v1:" + project;
  await page.goto("/studio/p/" + project + "/story?view=references&uiMode=focus", { waitUntil: "domcontentloaded" });
  const board = page.getByRole("region", { name: "기획 무드보드" });
  const add = board.getByRole("form", { name: "카드 더하기" }).first();
  await add.getByLabel("내용").fill("등대지기가 남긴 메모");
  await add.getByRole("button", { name: "카드 더하기", exact: true }).click();
  const open = page.locator("summary").filter({ hasText: /^보드 복구본$/u });
  await open.click();
  await page.getByRole("button", { name: "현재 보드를 복구본으로 저장" }).click();
  await expect(page.getByRole("status").filter({ hasText: "복구본을 이 기기에 저장했어요." })).toBeVisible();
  const initial = await page.evaluate(k => localStorage.getItem(k), key);
  expect(initial).toContain("등대지기가 남긴 메모");
  // 방금 만든 작업의 브라우저 캐시만 손상시킨다. 재시작한 페이지는 독립된 SQLite 복구본을 읽어야 한다.
  await page.evaluate(k => localStorage.setItem(k, "damaged-test-board"), key);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(board.getByRole("alert")).toBeVisible();
  await open.click();
  await board.getByRole("button", { name: "이 복구본으로 되돌리기" }).click();
  await expect(board.getByText("등대지기가 남긴 메모", { exact: true })).toBeVisible();
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe(initial);
  expect(await page.evaluate(k => Object.keys(localStorage).some(name =>
    name.startsWith(k + ":damaged:") && localStorage.getItem(name) === "damaged-test-board"), key)).toBe(true);
  await info.attach("복구한 모바일 아이디어 보드", { body: await board.screenshot(), contentType: "image/png" });
});
