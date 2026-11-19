/** 격리 QA의 작품 소유자와 초대를 수락한 편집자가 직접 그린 보드를 두 화면에서 비교한다. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { expect } from "@playwright/test";
import pg from "pg";
import { chromium, type BrowserContext, type Page } from "playwright";

import { validateIsolatedMarketApiTarget } from "./isolated-market-api.mjs";
import { createStudioReviewHostFixture, inviteStudioReviewHostEditor } from "./studio-review-host-steps";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({ options: { output: { type: "string" } } });
const output = path.resolve(root, values.output ?? process.env.STUDIO_QA_OUTPUT ?? ".qa/studio-space-board");
const timeout = 45_000;
const noteA = "소유자 · 포즈 선 검토";
const noteB = "편집자 · 동선 확인";
const laterNote = "편집자 · 자리 비운 사이 수정";
const surface = (page: Page) => page.getByRole("img", { name: "직접 그리는 공유 보드", exact: true });
const panel = (page: Page) => page.getByRole("region", { name: "P2P 공유 화이트보드", exact: true });
const participants = (page: Page) => panel(page).locator(".studio-p2p-board-participants");
const strokePaths = (page: Page) => surface(page).locator("polyline").evaluateAll(nodes =>
  nodes.map(node => node.getAttribute("points") ?? "").sort());

async function enterSpace(page: Page, stage: URL, nickname: string) {
  page.setDefaultTimeout(timeout);
  await page.goto(stage.href, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: /공개 닉네임/u }).fill(nickname);
  await page.getByRole("button", { name: "하늘 캐릭터 선택", exact: true }).click();
  await page.getByRole("button", { name: "선택하고 입장", exact: true }).click();
  await page.locator('[data-space-toggle="map"]:visible').first().waitFor();
  assert.equal(new URL(page.url()).pathname, stage.pathname);
}

async function openBoard(page: Page) {
  const tour = page.getByRole("button", { name: "다음부터 보지 않기", exact: true });
  if (await tour.isVisible()) await tour.click();
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  const label = { name: "공유 화이트보드", exact: true };
  await page.getByRole("button", label).or(page.getByRole("menuitem", label)).click();
  await panel(page).locator('[data-board-available="true"]').waitFor();
}

async function drawStroke(page: Page, reverse: boolean) {
  const svg = surface(page);
  await svg.scrollIntoViewIfNeeded();
  const box = await svg.boundingBox();
  assert(box && box.width > 100 && box.height > 80, "보드의 입력 영역을 찾지 못했어요.");
  const relative = (x: number) => box.x + box.width * (reverse ? 1 - x : x);
  await page.mouse.move(relative(.1), box.y + box.height * .2);
  await page.mouse.down();
  await page.mouse.move(relative(.42), box.y + box.height * .7, { steps: 30 });
  await page.mouse.move(relative(.86), box.y + box.height * .32, { steps: 30 });
  await page.mouse.up();
  await page.mouse.move(relative(.91), box.y + box.height * .82);
}

async function cancelTouch(page: Page) {
  const box = await surface(page).boundingBox();
  assert(box);
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x: box.x + box.width * .42, y: box.y + box.height * .54 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{ x: box.x + box.width * .65, y: box.y + box.height * .6 }],
    });
    await expect(surface(page).locator("polyline")).toHaveCount(2);
    await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(surface(page).locator("polyline")).toHaveCount(1);
  } finally { await client.detach(); }
}

async function addNote(page: Page, note: string) {
  await panel(page).getByRole("textbox", { name: "메모", exact: true }).fill(note);
  await panel(page).getByRole("button", { name: "메모 놓기", exact: true }).click();
}

async function requireBoth(pages: Page[], count: number, notes: string[]) {
  for (const page of pages) {
    await expect(participants(page)).toHaveText("2", { timeout });
    await expect(surface(page).locator("polyline")).toHaveCount(count, { timeout });
    for (const note of notes) await expect(panel(page).getByText(note, { exact: true })).toBeVisible({ timeout });
  }
}

async function verify() {
  const target = validateIsolatedMarketApiTarget({
    rawApiUrl: process.env.STUDIO_QA_BASE_URL, rawDatabaseUrl: process.env.TEST_DATABASE_URL,
  });
  const origin = new URL(target.apiOrigin);
  const ready = await fetch(new URL("/api/health/ready", origin));
  assert.equal(ready.status, 200, "격리 QA API와 DB를 준비한 뒤 다시 실행해 주세요.");
  const caps = await fetch(new URL("/api/health/capabilities", origin)).then(r => r.json());
  assert.equal(caps.capabilities?.realtimeCollaboration, "available", "QA 실시간 협업 연결을 확인해 주세요.");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223", { noDefaults: true, isLocal: true, timeout });
  const pool = new pg.Pool({ connectionString: target.databaseUrl, max: 1 });
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  const start = Date.now();
  try {
    const owner = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ko-KR" });
    contexts.push(owner);
    const editor = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: "ko-KR" });
    contexts.push(editor);
    const { workId, headers } = await createStudioReviewHostFixture(owner, pool, origin);
    await inviteStudioReviewHostEditor(owner, editor, pool, origin, workId, headers);
    const pages = await Promise.all([owner.newPage(), editor.newPage()]);
    const [a, b] = pages;
    for (const page of pages) page.on("pageerror", error => errors.push(error.name));
    const stage = new URL(`/studio/p/${encodeURIComponent(workId)}/space?stage=2d`, origin);
    await Promise.all([enterSpace(a, stage, "보드 작업자"), enterSpace(b, stage, "보드 편집자")]);
    await openBoard(a);
    await expect(participants(a)).toHaveText("1");
    await expect(surface(b)).toHaveCount(0);
    await drawStroke(a, false);
    await addNote(a, noteA);
    const first = await strokePaths(a);
    assert.equal(first.length, 1);
    const points = first[0]!.split(" ").map(pair => pair.split(",").map(Number));
    assert(points.length >= 3 && points.length <= 48);
    const near = (actual: number[], x: number, y: number) => Math.abs(actual[0]! - x) <= 12 && Math.abs(actual[1]! - y) <= 12;
    assert(near(points[0]!, 100, 120) && near(points.at(-1)!, 860, 192) && points.some(point => near(point, 420, 420)),
      "손을 뗀 끝점과 선이 꺾인 지점을 보존해야 해요.");

    console.log("소유자가 먼저 그린 뒤 편집자가 모바일 메뉴로 보드에 합류합니다.");
    await openBoard(b);
    await requireBoth(pages, 1, [noteA]);
    assert.deepEqual(await strokePaths(b), first);
    await cancelTouch(b);
    await drawStroke(b, true);
    await addNote(b, noteB);
    await requireBoth(pages, 2, [noteA, noteB]);
    const shared = await strokePaths(a);
    assert.deepEqual(await strokePaths(b), shared);
    assert.equal(new Set(shared).size, 2);

    await a.getByRole("button", { name: "패널 닫기", exact: true }).click();
    await expect(surface(a)).toHaveCount(0);
    await addNote(b, laterNote);
    await openBoard(a);
    await requireBoth(pages, 2, [noteA, noteB, laterNote]);
    for (const page of pages) assert.deepEqual(await strokePaths(page), shared);
    assert.deepEqual(errors, []);
    await mkdir(output, { recursive: true });
    await Promise.all([a.screenshot({ path: path.join(output, "owner-board.png") }), b.screenshot({ path: path.join(output, "editor-board.png") })]);
    const report = { roles: ["owner", "editor"], joinedAfterStroke: true, touchCancelDiscarded: true,
      firstStrokePoints: points.length, samePathsAfterReopen: true, participants: 2, strokes: 2, notes: 3,
      pageErrors: errors.length, elapsedMs: Date.now() - start };
    await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
    await browser.close();
    await pool.end();
  }
}

await verify();
