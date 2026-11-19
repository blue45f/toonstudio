/** 독립된 로컬 PostgreSQL과 API에서 두 계정이 정식 공간 메뉴로 투표한다. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "@playwright/test";
import { studioSpacePollSnapshot, type StudioSpacePollCommand } from "@toonstudio/contracts/studio-space-poll";
import pg from "pg";
import { chromium, type BrowserContext, type Page } from "playwright";

import { validateIsolatedMarketApiTarget } from "./isolated-market-api.mjs";
import { createStudioReviewHostActor, createStudioReviewHostFixture } from "./studio-review-host-steps";

const target = validateIsolatedMarketApiTarget({
  rawApiUrl: process.env.STUDIO_QA_BASE_URL, rawDatabaseUrl: process.env.TEST_DATABASE_URL,
});
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(root, process.env.STUDIO_QA_OUTPUT ?? ".qa/studio-space-poll");
const origin = new URL(target.apiOrigin);
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

async function openPoll(page: Page, work: string, name: string, place = "") {
  const address = new URL(`/studio/p/${encodeURIComponent(work)}/space`, origin);
  address.searchParams.set("stage", "2d");
  if (place) address.searchParams.set("place", place);
  await page.goto(address.href, { waitUntil: "domcontentloaded" });
  const more = button(page, "더보기");
  const enter = page.getByRole("button", { name: /^(선택하고 입장|이 캐릭터로 바로 입장)$/u });
  const startHere = button(page, "처음부터 시작");
  await more.or(enter).or(startHere).first().waitFor({ timeout: 90_000 });
  if (await startHere.isVisible()) {
    await startHere.click();
  } else if (await enter.isVisible()) {
    await page.locator("#studio-virtual-nickname").fill(name);
    await button(page, "하늘 캐릭터 선택").click();
    await enter.click();
  }
  await more.waitFor();
  const tour = button(page, "다음부터 보지 않기");
  if (await tour.isVisible()) await tour.click();
  await more.click();
  const response = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname.endsWith("/space-poll"));
  await page.locator('[data-menu-item="poll"]:visible').click();
  const r = await response;
  assert.equal(r.status(), 200);
  const world = new URL(r.url()).searchParams.get("world");
  assert.ok(world, "정식 공간이 서버에 보낸 장소 범위");
  return world;
}

async function createPoll(page: Page, question: string, anonymous: boolean) {
  const form = page.getByRole("region", { name: "투표 만들기" });
  await form.getByPlaceholder(/다음 스프린트 주제/u).fill(question);
  await form.getByRole("button", { name: "다음", exact: true }).click();
  await form.getByLabel("선택지 1", { exact: true }).fill("첫 장면");
  await form.getByLabel("선택지 2", { exact: true }).fill("다음 장면");
  await form.getByRole("button", { name: "다음", exact: true }).click();
  const toggle = form.getByRole("button", { name: /익명 투표/u });
  if ((await toggle.getAttribute("aria-pressed") === "true") !== anonymous) await toggle.click();
  await form.getByRole("button", { name: "다음", exact: true }).click();
  await button(page, "투표 시작").click();
  await page.getByRole("heading", { name: question, exact: true }).waitFor();
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223", { noDefaults: true, isLocal: true });
const pool = new pg.Pool({ connectionString: target.databaseUrl, max: 1 });
const contexts: BrowserContext[] = [];
const checks: string[] = [], errors: string[] = [];
let passed = false;
await mkdir(output, { recursive: true });
try {
  const owner = await browser.newContext({ locale: "ko-KR", viewport: { width: 1360, height: 900 } });
  contexts.push(owner);
  const member = await browser.newContext({ locale: "ko-KR", viewport: { width: 390, height: 844 } });
  contexts.push(member);
  const fixture = await createStudioReviewHostFixture(owner, pool, origin);
  const { accountId } = await createStudioReviewHostActor(member, pool, origin);
  await pool.query('UPDATE "user" SET name=$2 WHERE id=$1', [fixture.actorId, "투표 진행자"]);
  await pool.query('UPDATE "user" SET name=$2 WHERE id=$1', [accountId, "투표 참여자"]);
  const api = origin.origin + "/api";
  const team = `${api}/creator/works/${fixture.workId}/team`;
  const poll = `${api}/studio-project-graph/works/${fixture.workId}/space-poll`;
  const { headers } = fixture;
  const read = async (ctx: BrowserContext, world: string) => {
    const response = await ctx.request.get(poll, { params: { world }, headers });
    assert.equal(response.status(), 200);
    assert.match(response.headers()["cache-control"] ?? "", /no-store/u);
    return studioSpacePollSnapshot.parse(await response.json());
  };
  const write = async (ctx: BrowserContext, command: StudioSpacePollCommand, status: number) => {
    const response = await ctx.request.post(poll, { headers, data: command });
    assert.equal(response.status(), status, command.action);
  };
  const unauthenticated = await fetch(poll + "?world=outside");
  assert.equal(unauthenticated.status, 403);
  const outside = await member.request.get(poll, { params: { world: "unrelated" }, headers });
  assert.equal(outside.status(), 403);
  assert.equal((await owner.request.post(team, { headers, data: { userId: accountId, role: "commenter" } })).status(), 201);
  const inbox = await member.request.get(`${api}/creator/team/invitations?limit=50`, { headers });
  const invitation = (await inbox.json() as { workId: string; invitationId: string }[]).find(i => i.workId === fixture.workId);
  assert.ok(invitation);
  assert.equal((await member.request.post(team + "/invitations/respond", {
    headers, data: { action: "accept", invitationId: invitation.invitationId },
  })).status(), 201);
  checks.push("외부 계정 거부와 초대·수락");
  const a = await owner.newPage(), b = await member.newPage();
  for (const page of [a, b]) { page.setDefaultTimeout(30_000); page.on("pageerror", error => errors.push(error.name)); }
  const world = await openPoll(a, fixture.workId, "투표 진행자");
  assert.equal(await openPoll(b, fixture.workId, "투표 참여자"), world);
  await expect(b.getByText("진행 중인 투표가 없어요.")).toBeVisible();
  await createPoll(a, "원고 검수 순서", true);
  await b.getByRole("heading", { name: "원고 검수 순서" }).waitFor();
  await button(a, '"첫 장면"에 투표').click();
  await button(b, '"다음 장면"에 투표').click();
  await expect(b.getByText("총 2표 · 참여 2명", { exact: true })).toBeVisible();
  const anonymous = await read(member, world);
  assert.ok(anonymous.poll?.anonymous);
  assert.deepEqual(anonymous.poll.options.map(o => [o.count, o.voters]), [[1, []], [1, []]]);
  assert.ok(anonymous.didVote && !anonymous.canVote && !anonymous.canCreate && !anonymous.canClose);
  assert.ok(!JSON.stringify(anonymous).includes(accountId));
  assert.ok(!JSON.stringify(anonymous).includes(fixture.actorId));
  const id = anonymous.poll.id;
  const vote = { action: "vote", world, id, optionIndex: 1 } as const;
  await Promise.all([write(member, vote, 200), write(member, { ...vote, optionIndex: 0 }, 409)]);
  await write(member, { action: "close", world, id }, 403);
  await b.screenshot({ path: path.join(output, "anonymous-mobile.png") });
  assert.equal(await openPoll(b, fixture.workId, "투표 참여자"), world);
  await expect(button(b, '"다음 장면"에 투표')).toBeDisabled();
  checks.push("익명집계·재입장·재시도·이중 선택 차단");
  await button(a, "투표 마감하기").click();
  await button(a, "새 투표 만들기").click();
  await createPoll(a, "다음 회차 편집", false);
  await b.getByRole("heading", { name: "다음 회차 편집" }).waitFor();
  await button(b, '"첫 장면"에 투표').click();
  await expect(b.getByText("투표 완료", { exact: true })).toBeVisible();
  const named = await read(owner, world);
  assert.ok(named.poll && !named.poll.anonymous);
  assert.deepEqual(named.poll.options[0].voters, ["투표 참여자"]);
  assert.deepEqual(named.poll.options.map(o => o.count), [1, 0]);
  await b.getByText("투표자 1명", { exact: true }).click();
  await expect(b.getByText("투표 참여자", { exact: true }).last()).toBeVisible();
  await b.screenshot({ path: path.join(output, "named-mobile.png") });
  const different = await openPoll(b, fixture.workId, "투표 참여자", "creator-cafe");
  assert.notEqual(different, world);
  assert.equal((await read(member, different)).poll, null);
  assert.equal((await read(member, world)).poll?.id, named.poll.id);
  checks.push("마감·새 기명 투표·표 이름·장소 격리");
  assert.equal((await owner.request.patch(team+"/members/"+accountId, { headers, data: { role: "viewer" } })).status(), 200);
  const viewer = await read(member, different);
  assert.ok(!viewer.canCreate && !viewer.canClose && !viewer.canVote);
  await write(member, { action: "create", world: different, id: randomUUID(), previousId: null,
    question: "열람자가 시작", options: ["하나", "둘"], anonymous: true, closesInMs: null }, 403);
  await write(member, { action: "vote", world, id: named.poll.id, optionIndex: 0 }, 403);
  const expiring = { action: "create", world: different, id: randomUUID(), previousId: null, question: "마감 시간 확인",
    options: ["오전", "오후"], anonymous: true, closesInMs: 1000 } as const;
  await write(owner, { ...expiring, options: [...expiring.options] }, 200);
  const limited = await read(member, different);
  assert.equal(limited.canVote, false);
  await expect.poll(async () => (await read(owner, different)).canVote, { timeout: 8000 }).toBe(false);
  await write(owner, { action: "vote", world: different, id: expiring.id, optionIndex: 0 }, 409);
  checks.push("열람 역할 투표·생성 금지와 서버 시각 마감");
  assert.deepEqual(errors, []);
  passed = true;
} finally {
  await writeFile(path.join(output, "report.json"), JSON.stringify({ passed, checks, pageErrors: errors }, null, 2));
  await Promise.allSettled(contexts.map(ctx => ctx.close()));
  await pool.end();
  await browser.close();
}
