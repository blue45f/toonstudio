import { expect, test } from "@playwright/test";

import { addMoodboardCard, createDefaultStudioProjectMoodboard, serializeMoodboard, studioMoodboardStorageKey, type MoodboardCard } from "../apps/web/src/domains/creator/planning/studio-moodboard";

for (const width of [390, 1440]) {
  test(`${width}px 아이디어 보드에서 두 카드를 기존 회차 대본 끝에 한 번만 추가한다`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const original = "비가 그칠 때까지 기다려.  ";
    const cards = ["복도 끝의 조명이 꺼진다.", "유리가 창문을 열고 뒤를 돌아본다."];
    const expected = original + "\n\n" + cards.join("\n");
    const body = page.getByRole("textbox", { name: "대본", exact: true });
    const saved = page.getByText("이 기기에 대본 저장됨", { exact: true });
    const board = page.getByRole("region", { name: "아이디어 보드" });
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

test("손상된 보드를 기기 DB 복구본으로 열고 원래 데이터도 보존한다", async ({ page, baseURL }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const project = "idea-checkpoint";
  const key = studioMoodboardStorageKey(project);
  const initialBoard = createDefaultStudioProjectMoodboard(project);
  const legacyCard = "항구의 옛 풍경";
  const reference = new URL("/assets/virtual-studio/office-themes-v1/tidal-atelier.png", baseURL!).href;
  const sample: readonly MoodboardCard[] = [
    { id: "old-image", kind: "image", ref: reference, text: "물빛 작업실 색감" },
    { id: "old-note", kind: "note", text: legacyCard },
    { id: "old-link", kind: "link", ref: reference },
    { id: "old-sketch", kind: "sketch", text: "등대 구도", strokes: [
      { color: "#17746a", size: 7, points: [{ x: 0.2, y: 0.6 }, { x: 0.48, y: 0.25 }, { x: 0.6, y: 0.55 }] },
    ] },
    { id: "old-task", kind: "todo", text: "등대 불빛 그리기", done: false },
  ];
  const legacy = serializeMoodboard(sample.reduce((board, card, i) =>
    addMoodboardCard(board, board.columns[Math.min(2, Math.floor(i / 2))]!.id, card), initialBoard));
  const receiptKey = "qa-board-worker-receipts";
  const damaged = "damaged-test-board";
  const trigger = "손상 재현용 마지막 저장";
  await page.addInitScript(({ origin, key, legacy, trigger, damaged, receiptKey }) => {
    if (location.origin !== origin) return;
    if (!sessionStorage.getItem(receiptKey)) {
      localStorage.setItem(key, legacy);
      sessionStorage.setItem(receiptKey, "[]");
    }
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, transfers?: Transferable[] | StructuredSerializeOptions) {
      const [namespace, entry, value] = message?.args ?? [];
      if (namespace === "studio-project-moodboards" && typeof entry === "string"
        && (entry === key || entry.startsWith(key + ":damaged:"))) {
        const corrupt = message.method === "kvSet" && entry === key && typeof value === "string" && value.includes(trigger);
        if (corrupt) message = { ...message, args: [namespace, entry, damaged] };
        const method = message.method;
        const written = message.args[2];
        const ack = (event: MessageEvent) => {
          if (event.data?.requestId !== message.requestId) return;
          this.removeEventListener("message", ack);
          if (event.data.kind !== "success") return;
          const history = JSON.parse(sessionStorage.getItem(receiptKey)!) as object[];
          history.push({ method, entry, raw: method === "kvSet" ? written : event.data.value });
          sessionStorage.setItem(receiptKey, JSON.stringify(history));
        };
        this.addEventListener("message", ack);
      }
      post.call(this, message, Array.isArray(transfers) ? { transfer: transfers } : transfers);
    };
  }, { origin: new URL(baseURL!).origin, key, legacy, trigger, damaged, receiptKey });
  const url = (id: string) => "/studio/p/" + id + "/story?view=references&uiMode=focus";
  const board = page.getByRole("region", { name: "아이디어 보드" });
  const add = board.getByRole("form", { name: "카드 더하기" }).first();
  const saved = page.getByRole("group", { name: "보드 변경 기록" }).getByText("이 기기에 저장됨", { exact: true });
  const column = board.getByRole("region", { name: "레퍼런스 열" });
  const records = () => page.evaluate(k => JSON.parse(sessionStorage.getItem(k)!) as {
    method: string; entry: string; raw: string | null;
  }[], receiptKey);
  await page.goto(url(project), { waitUntil: "domcontentloaded" });
  await expect(column.getByText(legacyCard, { exact: true })).toBeVisible();
  const jump = board.getByRole("navigation", { name: "보드 열 바로가기" });
  const jumps = jump.getByRole("button");
  await expect(jumps).toHaveCount(3);
  await expect(page.locator('[data-studio-project-shell="focused-board"]')).toBeVisible();
  await expect(jumps.first()).toBeInViewport({ ratio: 1 });
  await expect(jumps.last()).toBeInViewport({ ratio: 1 });
  const initialScroll = await jump.evaluate(element => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.scrollTop !== 0) return parent.scrollTop;
    }
    return window.scrollY;
  });
  expect(initialScroll).toBe(0);
  const referenceImage = board.getByRole("img", { name: "물빛 작업실 색감" });
  await expect.poll(() => referenceImage.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
  const art = board.locator("li[data-moodboard-kind] .studio-tool-art img[data-ready=true]");
  await expect(art).toHaveCount(5);
  const colors = await board.locator("li[data-moodboard-kind]").evaluateAll(cards => cards.map(card => ({
    kind: (card as HTMLElement).dataset.moodboardKind,
    color: getComputedStyle(card).borderInlineStartColor,
    artwork: card.querySelector<HTMLElement>("[data-studio-tool-art]")?.dataset.studioToolArt,
  })));
  expect(new Set(colors.map(row => row.color)).size).toBe(5);
  expect(new Set(colors.map(row => row.artwork)).size).toBe(5);
  await info.attach("390px-보드-열-바로가기.png", { body: await page.screenshot(), contentType: "image/png" });
  const last = board.getByRole("heading", { name: /^할 일/ });
  const before = await last.boundingBox();
  const sizes = await jumps.evaluateAll(buttons => buttons.map(button => {
    const { width, height } = button.getBoundingClientRect();
    return { width, height };
  }));
  expect(sizes.every(size => size.width >= 44 && size.height >= 44)).toBe(true);
  await jumps.last().click();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  const after = await last.boundingBox();
  expect(before!.y).toBeGreaterThan(after!.y);
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth).toBe(390);
  await info.attach("390px-보드-마지막-열.png", { body: await page.screenshot(), contentType: "image/png" });
  await info.attach("390px-보드-탐색.json", { body: JSON.stringify({ sizes, colors, before, after, pageWidth, initialScroll }), contentType: "application/json" });
  expect(await records()).toContainEqual({ method: "kvSet", entry: key, raw: legacy });
  const card = "등대지기가 남긴 메모";
  await add.getByLabel("내용").fill(card);
  await add.getByRole("button", { name: "카드 더하기", exact: true }).click();
  await expect(saved).toBeVisible();
  const original = (await records()).filter(item => item.method === "kvSet" && item.entry === key).at(-1)?.raw;
  expect(original).toContain(card);
  const open = page.locator("summary").filter({ hasText: /^보드 복구본$/u });
  await open.click();
  await page.getByRole("button", { name: "현재 보드를 복구본으로 저장" }).click();
  await expect(page.getByRole("status").filter({ hasText: "복구본을 이 기기에 저장했어요." })).toBeVisible();
  // 이 시험이 소유한 보드 한 건만 실제 SQLite Worker에 손상 데이터로 기록한다.
  await add.getByLabel("내용").fill(trigger);
  await add.getByRole("button", { name: "카드 더하기", exact: true }).click();
  await expect.poll(records).toContainEqual({ method: "kvSet", entry: key, raw: damaged });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(board.getByRole("alert")).toBeVisible();
  await open.click();
  await board.getByRole("button", { name: "이 복구본으로 되돌리기" }).click();
  await expect(column.getByText(card, { exact: true })).toBeVisible();
  const restored = await records();
  expect(restored.some(item => item.entry.startsWith(key + ":damaged:") && item.method === "kvSet" && item.raw === damaged)).toBe(true);
  expect(restored.at(-1)).toEqual({ method: "kvGet", entry: key, raw: original });
  await page.goto(url(project + "-other"), { waitUntil: "domcontentloaded" });
  await expect(add).toBeVisible();
  await expect(column.getByText(card, { exact: true })).toHaveCount(0);
  await page.goto(url(project), { waitUntil: "domcontentloaded" });
  await expect(column.getByText(card, { exact: true })).toBeVisible();
  await expect(column.getByText(legacyCard, { exact: true })).toBeVisible();
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe(legacy);
  await info.attach("복구한 모바일 아이디어 보드", { body: await board.screenshot(), contentType: "image/png" });
});
