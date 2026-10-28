import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { submissionVisualFixture } from "../apps/web/src/domains/creator/production-hub/production-submission-visual-review.test-fixture";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

// 브라우저는 명시적인 API·이미지 fixture로 고정 버전 연결을 검사한다. 실제 저장·인가는 별도 DB HTTP 검증을 사용한다.
async function prepareProject(page: Page) {
  const fixture = submissionVisualFixture();
  const aggregate = JSON.parse(JSON.stringify(fixture.aggregate).replaceAll('"sample-project"', '"production-project"')) as ProductionProjectAggregate;
  const actor = { id: "visual-browser-owner", name: "검수자", email: null, image: null, role: "user" };
  let record = { aggregate: { ...aggregate, parties: aggregate.parties.map((party) => ({ ...party, accountUserId: actor.id })) },
    access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" } };
  const previewRequests: string[] = [];
  const writes: unknown[] = [];
  await page.addInitScript((user) => sessionStorage.setItem("toonstudio-auth-session", JSON.stringify({ user })), actor);
  await page.route("**/__collaboration-fixture/*.webp", (route) => route.fulfill({ contentType: "image/webp",
    path: resolve(process.cwd(), "apps/web/public/brand/studio-canvas-previews/romance.webp") }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/auth/session")) return route.fulfill({ json: { authenticated: true, user: actor } });
    if (path.endsWith("/me")) return route.fulfill({ json: { profile: { ...actor, avatar: null, bio: null, regionSettings: null } } });
    if (path.endsWith("/production/projects/production-project/commands")) {
      const body = route.request().postDataJSON() as { mutationId: string; expectedRevision: number; command: { type: string; clarification: ProductionProjectAggregate["clarifications"][number] } };
      writes.push(body);
      if (writes.length === 1) {
        expect(body.command.type).toBe("upsert-clarification");
        record = { ...record, aggregate: { ...record.aggregate, revision: record.aggregate.revision + 1,
          clarifications: [...record.aggregate.clarifications, body.command.clarification] } };
        return route.abort("failed");
      }
      expect(body).toEqual(writes[0]);
      return route.fulfill({ json: record });
    }
    if (path.endsWith("/production/projects/production-project")) return route.fulfill({ json: record });
    if (path.endsWith(`/studio-project-graph/works/${aggregate.workId}/project`)) return route.fulfill({ json: fixture.project });
    if (path.endsWith("/artifacts/artifact/revisions")) return route.fulfill({ json: fixture.revisions.artifact });
    if (path.endsWith("/artifacts/artifact/reviews")) return route.fulfill({ json: fixture.reviews.artifact });
    if (path.endsWith("/previews")) {
      previewRequests.push(url.href);
      const revisionId = path.includes("/input-review/") ? "input-revision" : "submitted-revision";
      expect(url.searchParams.get("revisionId")).toBe(revisionId);
      expect(url.searchParams.get("rootGraphHash")).toBe((revisionId === "input-revision" ? "b" : "a").repeat(64));
      const ordinal = url.searchParams.has("cursor") ? 1 : 0;
      return route.fulfill({ json: { ok: true, previews: [{ sha256: "d".repeat(64), ordinal, mediaType: "image/webp", byteLength: 700,
        url: `${url.origin}/__collaboration-fixture/${revisionId}-${ordinal}.webp`, expiresAt: Date.now() + 60_000, mapping: null }],
      nextCursor: ordinal === 0 ? "page-2" : null } });
    }
    if (path.endsWith("/health/capabilities")) return route.fulfill({ json: { status: "available", incidentId: null, retryAfterSeconds: null,
      checkedAt: new Date().toISOString(), capabilities: { publicCatalog: "available", authSession: "available", communityRead: "available",
        communityWrite: "available", marketplaceRead: "available", studioLocalEditing: "available", studioProjectRead: "available",
        studioCloudSave: "available", realtimeCollaboration: "available", publishing: "available", serverAi: "available" } } });
    return route.fulfill({ status: 404, json: { message: "이 브라우저 fixture 범위에 없는 API입니다." } });
  });
  return { previewRequests, writes, record: () => record };
}

test("실제 제출 이미지의 고정 버전·비교·모바일·접근성", async ({ page }, testInfo) => {
  const { previewRequests } = await prepareProject(page);
  await page.goto("/production/projects/production-project/review?task=target-task&episode=episode-12", { waitUntil: "domcontentloaded" });
  const panel = page.getByRole("region", { name: "고정 제출 원고 이미지", exact: true });
  await expect(panel).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[aria-hidden="true"][data-phase]')).toBeHidden();
  await panel.getByRole("button", { name: "제출 원고 이미지 열기", exact: true }).click();
  await expect(panel.getByRole("img", { name: "2차 제출본 · 1", exact: true })).toBeVisible();
  await panel.getByRole("combobox", { name: "비교 기준본", exact: true }).selectOption("input-revision");
  await expect(panel.getByRole("button", { name: "원고 나란히", exact: true })).toBeVisible();
  await panel.getByRole("combobox", { name: "이미지 순번", exact: true }).selectOption("1");
  await expect(panel.getByRole("img", { name: "2차 제출본 · 2", exact: true })).toBeVisible();
  await expect(panel.getByRole("img", { name: "2차 고정 입력본 · 2", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "원고 겹쳐 보기", exact: true }).click();
  await expect(panel.getByRole("slider", { name: "제출본 불투명도", exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: "이 고정본에 핀 의견 남기기", exact: true })).toHaveAttribute("href", /revision=submitted-revision/u);
  expect(previewRequests).toHaveLength(4);
  expect(previewRequests.every((value) => !value.includes("newer-head"))).toBe(true);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await panel.scrollIntoViewIfNeeded();
    const geometry = await panel.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
    await page.screenshot({ path: testInfo.outputPath(`submission-images-${width}.png`) });
  }
  const result = await new AxeBuilder({ page }).include('[aria-label="고정 제출 원고 이미지"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map((entry) => ({ id: entry.id, nodes: entry.nodes.map((node) => node.target) }))).toEqual([]);
});


test("응답 유실 후 새로고침해도 같은 요청으로 검수 질문을 한 번만 복구한다", async ({ page }) => {
  const fixture = await prepareProject(page);
  await page.goto("/production/projects/production-project/review?task=target-task&episode=episode-12", { waitUntil: "domcontentloaded" });
  const input = page.getByRole("textbox", { name: "검수 질문", exact: true });
  await expect(input).toBeEnabled({ timeout: 120_000 });
  await expect(page.locator('[aria-hidden="true"][data-phase]')).toBeHidden();
  await input.fill("응답 유실 후에도 보존할 실제 검수 질문");
  await page.getByRole("button", { name: "질문 추가", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "이전 저장의 응답" })).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  await expect(input).toHaveValue("응답 유실 후에도 보존할 실제 검수 질문");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "최신 상태 확인", exact: true })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "최신 상태 확인", exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(2);
  await expect(page.getByText(/응답을 받지 못했던 저장 결과를 확인했습니다/u)).toBeVisible();
  expect(fixture.record().aggregate.clarifications.filter((entry) => entry.question === "응답 유실 후에도 보존할 실제 검수 질문")).toHaveLength(1);
});
