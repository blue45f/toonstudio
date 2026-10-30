import { readFile } from "node:fs/promises";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { capturePageEvidence } from "./helpers/capture-page-evidence";

interface Coverage {
  height: number;
  coveredHeight: number;
  observedDocumentHeight: number;
  grewDuringCapture: boolean;
  shrankDuringCapture: boolean;
  restartCount: number;
  successfulAttempt: number;
  discardedAttempts: { phase: string; files: string[] }[];
  tiles: { file: string; x: number; y: number; width: number; height: number }[];
}

async function installDocument(page: Page, height = 5100): Promise<void> {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.setContent(`<!doctype html><html lang="ko"><head><style>
    html, body { margin: 0; scroll-behavior: auto; overflow-anchor: none; }
    #sheet { position: relative; width: 100%; height: ${height}px; background: linear-gradient(white, lightblue); }
    h1, p { margin: 0; padding: 12px; font: 18px sans-serif; }
    #tail { position: absolute; bottom: 0; }
  </style></head><body><main id="sheet"><h1 id="heading">문서 시작</h1>
    <p id="tail">문서 마지막 내용</p></main></body></html>`);
}

function getCoverage(info: TestInfo, name: string): Coverage {
  const body = info.attachments.find((attachment) => attachment.name === `${name}-coverage`)?.body;
  if (!body) throw new Error("화면 기록의 완료 증거가 없습니다.");
  return JSON.parse(body.toString());
}

async function expectCompleteCoverage(info: TestInfo, coverage: Coverage): Promise<void> {
  expect(coverage.coveredHeight).toBe(coverage.height);
  expect(coverage.tiles[0]?.y).toBe(0);
  let covered = 0;
  const discarded = coverage.discardedAttempts.flatMap((attempt) => attempt.files);
  for (const tile of coverage.tiles) {
    expect(tile.y).toBeLessThanOrEqual(covered);
    expect(tile.y + tile.height).toBeGreaterThan(covered);
    expect({ x: tile.x, width: tile.width, height: tile.height }).toEqual({ x: 0, width: 390, height: 900 });
    expect(discarded).not.toContain(tile.file);
    const bytes = await readFile(info.outputPath(tile.file));
    // 완료 목록이 실제 JPEG 파일을 가리키는지 확인한다. 그림을 대체하지 않는다.
    expect([...bytes.subarray(0, 2)]).toEqual([255, 216]);
    covered = tile.y + tile.height;
  }
  expect(covered).toBeGreaterThanOrEqual(coverage.height);
}

test("안정된 긴 문서의 모든 구간을 기록하고 원래 화면 위치를 복원한다", async ({ page }, info) => {
  await installDocument(page);
  await page.evaluate(() => scrollTo({ top: 350, behavior: "instant" }));
  await capturePageEvidence(page, info, "stable-page");
  const coverage = getCoverage(info, "stable-page");
  expect(coverage.height).toBe(5100);
  expect(coverage.restartCount).toBe(0);
  expect(coverage.tiles.length).toBeGreaterThan(5);
  await expectCompleteCoverage(info, coverage);
  expect(await page.evaluate(() => ({ y: scrollY, width: innerWidth, height: innerHeight })))
    .toEqual({ y: 350, width: 390, height: 900 });
});

test("계속 늘어나는 피드는 시작 시점의 경계까지 누락 없이 유한하게 기록한다", async ({ page }, info) => {
  await installDocument(page, 2400);
  await page.evaluate(() => {
    const sheet = document.getElementById("sheet");
    if (!sheet) throw new Error("검증 문서가 없습니다.");
    addEventListener("scroll", () => { if (scrollY > 0) sheet.style.height = `${sheet.offsetHeight + 900}px`; });
  });
  await capturePageEvidence(page, info, "growing-page");
  const coverage = getCoverage(info, "growing-page");
  expect(coverage.height).toBe(2400);
  expect(coverage.observedDocumentHeight).toBeGreaterThan(2400);
  expect(coverage.grewDuringCapture).toBe(true);
  expect(coverage.restartCount).toBe(0);
  expect(coverage.tiles.length).toBeLessThan(10);
  await expectCompleteCoverage(info, coverage);
});

for (const threshold of [0, 2000]) {
  test(`스크롤 ${threshold}px 이후 문서가 줄면 이전 타일을 분리하고 처음부터 다시 기록한다`, async ({ page }, info) => {
    await installDocument(page);
    await page.evaluate((limit) => {
      const sheet = document.getElementById("sheet");
      const heading = document.getElementById("heading");
      if (!sheet || !heading) throw new Error("검증 문서가 없습니다.");
      let changed = false;
      addEventListener("scroll", () => {
        if (changed || scrollY <= limit) return;
        changed = true;
        sheet.style.height = "2100px";
        heading.textContent = "재배치 후 문서 시작";
      });
    }, threshold);
    await capturePageEvidence(page, info, "shrinking-page");
    const coverage = getCoverage(info, "shrinking-page");
    expect(coverage.height).toBe(2100);
    expect(coverage.shrankDuringCapture).toBe(true);
    expect(coverage.restartCount).toBe(1);
    expect(coverage.successfulAttempt).toBe(2);
    expect(coverage.discardedAttempts[0]?.phase).toBe("scroll");
    expect(coverage.discardedAttempts[0]?.files.length).toBeGreaterThan(0);
    expect(coverage.tiles).toHaveLength(3);
    expect(coverage.tiles.every((tile) => tile.file.includes("-attempt-2-"))).toBe(true);
    await expectCompleteCoverage(info, coverage);
    await expect(page.locator("#heading")).toHaveText("재배치 후 문서 시작");
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });
}

test("실제 screenshot의 애니메이션 종료로 높이가 줄어도 처음부터 다시 기록한다", async ({ page }, info) => {
  await installDocument(page);
  await page.evaluate(() => {
    const sheet = document.getElementById("sheet");
    if (!sheet) throw new Error("검증 문서가 없습니다.");
    let started = false;
    addEventListener("scroll", () => {
      if (started || scrollY <= 0) return;
      started = true;
      // 높이는 촬영 전까지 그대로이고, Playwright가 애니메이션을 끝낼 때만 바뀐다.
      const animation = sheet.animate([{ opacity: 1 }, { opacity: 0.99 }], { duration: 60_000 });
      animation.onfinish = () => { sheet.style.height = "2100px"; };
    });
  });
  await capturePageEvidence(page, info, "animation-shrink");
  const coverage = getCoverage(info, "animation-shrink");
  expect(coverage.height).toBe(2100);
  expect(coverage.restartCount).toBe(1);
  expect(coverage.discardedAttempts[0]?.phase).toBe("screenshot");
  expect(coverage.tiles).toHaveLength(3);
  await expectCompleteCoverage(info, coverage);
});

test("문서가 계속 줄면 재시작 상한에서 실패하고 완료 기록을 만들지 않는다", async ({ page }, info) => {
  await installDocument(page, 12_000);
  await page.evaluate(() => {
    const sheet = document.getElementById("sheet");
    if (!sheet) throw new Error("검증 문서가 없습니다.");
    let armed = true;
    addEventListener("scroll", () => {
      if (scrollY === 0) { armed = true; return; }
      if (!armed) return;
      armed = false;
      sheet.style.height = `${sheet.offsetHeight - 1000}px`;
    });
  });
  await expect(capturePageEvidence(page, info, "unstable-page")).rejects.toThrow("3회 재시작 후 화면 기록을 중단");
  expect(info.attachments.some((attachment) => attachment.name === "unstable-page-coverage")).toBe(false);
  const body = info.attachments.find((attachment) => attachment.name === "unstable-page-capture-failure")?.body;
  if (!body) throw new Error("중단된 캡처의 진단 기록이 없습니다.");
  const failure = JSON.parse(body.toString());
  expect(failure.status).toBe("incomplete");
  expect(failure.discardedAttempts).toHaveLength(4);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("스크롤이 멈추면 같은 아래쪽 화면을 반복 촬영하지 않고 실패한다", async ({ page }, info) => {
  await installDocument(page);
  await page.evaluate(() => {
    // 움직이지 않는 스크롤 환경만 재현한다. screenshot은 실제 브라우저 호출이다.
    window.scrollTo = () => undefined;
  });
  let screenshots = 0;
  const screenshot = page.screenshot.bind(page);
  page.screenshot = async (options) => { screenshots += 1; return screenshot(options); };
  try {
    await expect(capturePageEvidence(page, info, "stalled-page")).rejects.toThrow("Screenshot scroll made no forward progress");
    expect(screenshots).toBe(1);
    expect(info.attachments.some((attachment) => attachment.name === "stalled-page-coverage")).toBe(false);
  } finally {
    page.screenshot = screenshot;
  }
});

test("촬영 자체의 오류는 재시작으로 숨기지 않고 원래 스크롤을 복원한다", async ({ page }, info) => {
  await installDocument(page);
  await page.evaluate(() => scrollTo({ top: 350, behavior: "instant" }));
  const screenshot = page.screenshot.bind(page);
  let calls = 0;
  page.screenshot = async (options) => {
    calls += 1;
    if (calls === 2) throw new Error("검증용 screenshot 실패");
    return screenshot(options);
  };
  try {
    await expect(capturePageEvidence(page, info, "failed-shot")).rejects.toThrow("검증용 screenshot 실패");
    expect(calls).toBe(2);
    expect(info.attachments.some((attachment) => attachment.name === "failed-shot-coverage")).toBe(false);
    expect(await page.evaluate(() => scrollY)).toBe(350);
  } finally {
    page.screenshot = screenshot;
  }
});

test("가로 넘침은 그대로 오류로 판정해 캡처 누락을 성공으로 처리하지 않는다", async ({ page }, info) => {
  await installDocument(page);
  await page.locator("#sheet").evaluate((element) => { element.style.width = "800px"; });
  await expect(capturePageEvidence(page, info, "wide-page")).rejects.toThrow("Screenshot horizontal overflow");
  expect(info.attachments.some((attachment) => attachment.name === "wide-page-coverage")).toBe(false);
});
