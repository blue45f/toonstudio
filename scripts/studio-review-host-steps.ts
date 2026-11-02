import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";


import { hashPassword } from "../apps/api/src/server/password";
import { createEmptyStudioAiImageReferenceDocument } from "../apps/web/src/domains/creator/ai/studio-ai-image-reference-roles";
import { createEmptyStudioAiProvenanceDocument } from "../apps/web/src/domains/creator/ai/studio-ai-provenance";
import { createEmptyStudioCharacterBible } from "../apps/web/src/domains/creator/studio-character-bible";
import { createEmptyStudioCommentsDocument } from "../apps/web/src/domains/creator/studio-comments";
import { createEmptyStudioPublicationAnalyticsDocument } from "../apps/web/src/domains/creator/studio-publication-analytics";
import { DEFAULT_STUDIO_PUBLISH_COMPLIANCE } from "../apps/web/src/domains/creator/studio-publish-compliance";
import { DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS } from "../apps/web/src/domains/creator/studio-publish-package";
import { createDefaultStudioReferenceBoardDocument } from "../apps/web/src/domains/creator/studio-reference-board";
import { createEmptyStudioReleaseSchedule } from "../apps/web/src/domains/creator/studio-release-schedule";
import { buildStudioSavePayload } from "../apps/web/src/domains/creator/studio-save-payload";
import { createEmptyStudioWriterRoomDocument } from "../apps/web/src/domains/creator/studio-writer-room";

import type { Pool } from "pg";
import type { BrowserContext, Page } from "playwright";

export const STUDIO_REVIEW_HOST_TITLE = "검수 캡처 실편집기 검증";

/** Synthetic empty source/account setup; auth and source writes use actual Core endpoints. */
export async function createStudioReviewHostFixture(context: BrowserContext, pool: Pool, origin: URL) {
  const title = STUDIO_REVIEW_HOST_TITLE;
  const headers = { "x-toonstudio-csrf": "1", Origin: origin.origin, Referer: `${origin.origin}/studio` };
const snapshot = {
  title, description: "Synthetic full Host capture fixture", tagsText: "", linkedTitleId: null,
  linkedSeriesId: null, linkedChallengeId: null,
  pagesList: [
    { id: "qa-page-one", elements: [], bg: "#b9dce8", bgGrad: null, canvasH: 1080 },
    { id: "qa-page-two", elements: [], bg: "#f2c9ad", bgGrad: null, canvasH: 1080 },
  ], master: undefined, characterBible: createEmptyStudioCharacterBible(),
  writerRoom: createEmptyStudioWriterRoomDocument(), aiProvenance: createEmptyStudioAiProvenanceDocument(),
  comments: createEmptyStudioCommentsDocument(), releaseSchedule: createEmptyStudioReleaseSchedule(),
  publicationAnalytics: createEmptyStudioPublicationAnalyticsDocument(),
  referenceBoard: createDefaultStudioReferenceBoardDocument(), aiImageReferences: createEmptyStudioAiImageReferenceDocument(),
  currentPageId: "qa-page-one", webtoonTheme: "classic" as const, panelGutter: 24,
  publishPack: { profile: "generic" as const, aiUsage: "none" as const, disclosure: "",
    compliance: DEFAULT_STUDIO_PUBLISH_COMPLIANCE, packageSettings: DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS, packageCredits: "" },
};
const payload = buildStudioSavePayload({ ...snapshot, cover: "", pageImages: [], status: "draft",
  document: { ...snapshot, width: 720 } });
  const accountId = randomUUID(), email = `qa-review-host-${accountId}@example.test`, password = `Qa-${accountId}-pw`;
  // A new verified fixture account avoids sending external signup email. Login,
  // session cookies and every source/collaboration ACL still use the actual API.
  await pool.query('INSERT INTO "user" (id, name, email, "emailVerified", "passwordHash", "createdAt") VALUES ($1, $2, $3, NOW(), $4, NOW())',
    [accountId, "검수 작가", email, await hashPassword(password)]);
  console.log("Seeded disposable verified account.");
  const login = await context.request.post(`${origin.origin}/api/auth/login`, { headers, data: { email, password } });
  assert(login.ok(), `Local login returned ${login.status()}`);
  assert.equal((await login.json()).ok, true, "Authenticate through the actual local API");
  console.log("Authenticated through the local API.");
  const created = await context.request.post(`${origin.origin}/api/creator/works`, { headers, data: payload });
  assert([200, 201].includes(created.status()), `Create returned ${created.status()}: ${await created.text()}`);
  const workId = (await created.json()).id; assert.equal(typeof workId, "string");
  const source = await context.request.get(`${origin.origin}/api/creator/works/${workId}/team/document`, { headers });
  assert.equal(source.status(), 200); const saved = await source.json();
  return { workId, actorId: accountId, headers, initialSaved: saved };
}

export async function openStudioReviewHost(page: Page, origin: URL, workId: string) {
  const title = STUDIO_REVIEW_HOST_TITLE;
  await page.goto(`${origin.origin}/studio?id=${workId}`, { waitUntil: "domcontentloaded" });
  console.log("Navigated to the actual Studio Host.");
  await page.getByRole("heading", { name: title, exact: true }).waitFor({ timeout: 60_000 });
  const onboarding = page.getByRole("heading", { name: "나에게 맞는 작업 환경 만들기", exact: true });
  if (await onboarding.isVisible()) {
    await page.getByRole("button", { name: "나중에 설정", exact: true }).first().click();
    await onboarding.waitFor({ state: "hidden" });
  }
  const gate = page.getByRole("button", { name: "나중에 보기", exact: true });
  if (await gate.isVisible()) await gate.click();
}

/** Original three-pen-strokes-per-page acceptance remains unchanged. */
export async function selectStudioReviewHostPage(page: Page, ordinal: number) {
  const pageButton = page.locator([
    `[data-testid="studio-page-item"][data-page-index="${ordinal}"] button[aria-pressed]:visible`,
    `button[data-studio-page-sequence-item="true"][aria-label^="${ordinal + 1}번 페이지"]:visible`,
  ].join(", ")).first();
  if (!(await pageButton.isVisible())) {
    const pageNavigationLauncher = page.locator([
      'button[title="페이지 목록 펼치기"]:visible',
      'button[aria-label="페이지 목록 열기"]:visible',
      'button[aria-label^="페이지 시퀀스 열기"]:visible',
    ].join(", ")).first();
    await pageNavigationLauncher.waitFor({ state: "visible", timeout: 30_000 });
    await pageNavigationLauncher.click();
    await pageButton.waitFor({ state: "visible", timeout: 5_000 });
  }
  await pageButton.click();
}

async function dismissStudioReviewPenObstructions(page: Page) {
  const guide = page.getByRole("button", { name: "시작 안내 닫기", exact: true }).first();
  const quickStart = page.locator('button[data-studio-quickstart-dismiss="true"]:visible').first();
  const sequence = page.locator('button[data-studio-page-sequence-close="true"]:visible').first();
  for (const close of [guide, quickStart, sequence]) {
    if (await close.isVisible()) {
      await close.click();
      await close.waitFor({ state: "hidden" });
    }
  }
}

type StudioReviewPenPoint = { x: number; y: number };

async function assertStudioReviewPenTargets(page: Page, points: StudioReviewPenPoint[]) {
  assert(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)), "펜 입력 좌표가 유한해야 해요.");
  // 문자열 평가는 브라우저 밖 TS 변환기의 보조 함수에 의존하지 않으며 DOM만 읽는다.
  const clear = await page.evaluate<boolean>(`(() => {
    const points = ${JSON.stringify(points)};
    return points.every((point) => {
      const target = document.elementFromPoint(point.x, point.y);
      return target?.tagName === "CANVAS"
        && !!target.closest('[data-studio-canvas-cursor]')
        && !target.closest('button,input,textarea,a,[role="dialog"]');
    });
  })()`);
  assert(clear, "펜 입력 경로를 UI가 가리고 있어요. 안내·페이지 패널을 닫고 다시 확인해 주세요.");
}

export async function authorStudioReviewHostSketches(page: Page, output: string) {
  // Actual pointer events through the existing pen tool author two different thumbnail sketches.
  // No browser globals, imported state setters, seeded draw elements or mocked save endpoints.
  const authoredGestures = [];
  for (let ordinal = 0; ordinal < 2; ordinal++) {
    await selectStudioReviewHostPage(page, ordinal);
    await page.waitForFunction((index) => document.querySelector([
      `[data-testid="studio-page-item"][data-page-index="${index}"] button[aria-current="page"]`,
      `button[data-studio-page-sequence-item="true"][aria-label^="${index + 1}번 페이지"][aria-current="page"]`,
    ].join(", ")) !== null, ordinal);
    const initialLayerCount = await page.locator('[data-studio-layer-row="true"]').count();
    await dismissStudioReviewPenObstructions(page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("b");
    await page.locator('[data-studio-draw-options="true"][data-studio-active-draw-mode="pen"]').waitFor();
    const size = page.getByRole("slider", { name: "브러시 크기", exact: true });
    await size.focus();
    await size.press("Home");
    for (let step = 1; step < 12; step++) await size.press("ArrowRight");
    assert.equal(await size.inputValue(), "12");
    await page.locator("[data-studio-canvas-viewport]").focus();
    await page.keyboard.press("KeyD");
    const colorWell = page.locator('[data-studio-dual-color-well="true"]:visible').first();
    await colorWell.waitFor({ state: "visible" });
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('[data-studio-dual-color-well="true"]')]
      .some((element) => element.offsetParent !== null && element.dataset.studioPrimaryColor?.toLowerCase() === "#1a1a1a"));
    const smartShape = page.getByRole("button", { name: "스마트 도형", exact: true });
    if (await smartShape.isVisible() && await smartShape.getAttribute("aria-pressed") === "true") await smartShape.click();
    const viewport = await page.locator("[data-studio-canvas-viewport]").boundingBox();
    const surface = await page.locator("[data-studio-canvas-cursor]").boundingBox();
    const screen = page.viewportSize();
    assert(viewport && surface && screen, "펜 입력에 사용할 캔버스와 브라우저 크기가 필요해요.");
    // 실제 C8 검증 영역을 사용하고 상단 도구·하단 상태 영역을 입력 범위에서 제외한다.
    const left = Math.max(viewport.x, surface.x, 0) + 70;
    const top = Math.max(viewport.y, surface.y, 0) + 130;
    const width = Math.min(360, Math.min(viewport.x + viewport.width, surface.x + surface.width, screen.width) - left - 120);
    const height = Math.min(285, Math.min(viewport.y + viewport.height, surface.y + surface.height, screen.height) - top - 240);
    assert(width > 200 && height > 200, "가려지지 않은 원고 영역이 부족해요. 작업 패널과 브라우저 크기를 확인해 주세요.");
    const gestures = ordinal === 0 ? [
      [[.18, .14], [.78, .14], [.78, .82], [.18, .82], [.18, .14]],
      [[.30, .60], [.40, .35], [.52, .58], [.63, .40], [.71, .63]],
      [[.33, .72], [.45, .67], [.57, .73], [.68, .68]],
    ] : [
      [[.20, .18], [.75, .27], [.68, .80], [.13, .71], [.20, .18]],
      [[.27, .52], [.33, .35], [.48, .32], [.60, .46], [.53, .62], [.36, .64], [.27, .52]],
      [[.32, .72], [.41, .78], [.53, .70], [.64, .73]],
    ];
    const canonicalLayerCounts: number[] = [];
    for (const [strokeIndex, gesture] of gestures.entries()) {
      const vertices = gesture.map(([x, y]) => ({ x: left + x! * width, y: top + y! * height }));
      const points = [vertices[0]!];
      for (let index = 1; index < vertices.length; index++) {
        const before = vertices[index - 1]!, after = vertices[index]!;
        for (let step = 1; step <= 12; step++) points.push({
          x: before.x + (after.x - before.x) * step / 12,
          y: before.y + (after.y - before.y) * step / 12,
        });
      }
      await assertStudioReviewPenTargets(page, points);
      await assertStudioReviewPenTargets(page, [points[0]!]);
      await page.mouse.move(points[0]!.x, points[0]!.y);
      await assertStudioReviewPenTargets(page, [points[0]!]);
      await page.mouse.down();
      try {
        for (const point of points.slice(1)) {
          await assertStudioReviewPenTargets(page, [point]);
          await page.mouse.move(point.x, point.y);
        }
        await assertStudioReviewPenTargets(page, [points.at(-1)!]);
      } finally {
        // 가림 검사가 실패해도 눌린 포인터는 해제하며 원래 실패 판정을 유지한다.
        await page.mouse.up();
      }
      await page.waitForFunction((expected) => document.querySelectorAll('[data-studio-layer-row="true"]').length === expected,
        initialLayerCount + strokeIndex + 1);
      const layerCount = await page.locator('[data-studio-layer-row="true"]').count();
      assert.equal(layerCount, initialLayerCount + strokeIndex + 1);
      canonicalLayerCounts.push(layerCount);
    }
    authoredGestures.push({ ordinal, gestures, visibleArea: { left, top, width, height },
      allPenTargetsVerified: true, canonicalLayerCounts });
    // Pointer-up may leave retained preview ink pending until the real deferred document commit.
    // Wait for its canonical layer rows before asking the capture authority to pin the source.
    await page.waitForFunction((expected) => document.querySelectorAll('[data-studio-layer-row="true"]').length === expected, initialLayerCount + 3);
    await page.mouse.move(15, 15);
    await page.screenshot({ path: path.join(output, `authored-page-${ordinal}.png`) });
  }
  console.log("Authored both manuscript sketches through the real pen tool.");
  return authoredGestures;
}

export async function requestStudioReviewHostCapture(page: Page) {
  await page.getByRole("button", { name: "프로젝트 센터", exact: true }).click();
  await page.getByRole("button", { name: "저장된 원고로 검수본 만들기", exact: true }).click();
  await page.getByRole("button", { name: "저장 후 다시 확인", exact: true }).click();
  await page.getByText("고정 검수본이 준비됐어요.", { exact: true }).waitFor({ timeout: 60_000 });
}
