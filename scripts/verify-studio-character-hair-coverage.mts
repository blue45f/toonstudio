/**
 * 브라우저 증거: 캐릭터 셰이퍼 헤어 프리셋이 모델 두상을 실제로 덮는지 확인한다(A-01 민머리 회귀 방지).
 *
 * 모델 × 헤어 프리셋 × 시점(카메라 '상반신' 정면, '부위·방향 확대 검사' 후면)마다 '헤어 없음' 렌더와
 * 프리셋 렌더를 찍고 머리 영역에서 바뀐 픽셀 비율을 잰다. 정면은 뷰포트 위 35% 띠, 후면은 전신을 담는
 * 프레이밍이라 그 띠의 가운데 40% 폭만 본다. 헤어 색은 측정용 마젠타로 바꿔 둔다 — 어두운 머리 ×
 * 어두운 두상(오리온)처럼 색이 비슷하면 헤어가 있어도 픽셀 차가 안 잡혔다. 판정은
 * `scripts/lib/studio-hair-coverage.mts`.
 *
 * 임계 근거(2026-10-23, Apple M2 Max · ANGLE Metal): `scripts/lib/studio-hair-coverage.mts` 머리말.
 *
 * 필수 CI 가 아니다(실 GPU 브라우저에서 VRM 10종을 차례로 불러 10×13×2 기준 수십 분). 실행:
 *   pnpm build && pnpm exec tsx scripts/verify-studio-character-hair-coverage.mts
 *   떠 있는 서버 재사용: TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:5173 pnpm exec tsx scripts/verify-studio-character-hair-coverage.mts
 *   범위 줄이기: TOONSPECTRUM_HAIR_COVERAGE_MODELS="루미,시온" TOONSPECTRUM_HAIR_COVERAGE_PRESETS="short,pixie"
 *   임계(백분율): TOONSPECTRUM_HAIR_COVERAGE_FRONT=5 TOONSPECTRUM_HAIR_COVERAGE_BACK=5
 *   GPU 경로: macOS 기본 native(Metal), 그 밖은 swiftshader. TOONSPECTRUM_CHARACTER_GPU_LANE 로 바꾼다.
 * 결과: $TOONSPECTRUM_VERIFY_DIR(기본 OS 임시 폴더/toonspectrum-hair-coverage)/hair-coverage.json + 촬영 PNG.
 */
import { type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import {
  DEFAULT_HAIR_COVERAGE_THRESHOLDS,
  evaluateHairCoverage,
  readHairCoverageThreshold,
  type HairCoverageSample,
  type HairCoverageView,
} from "./lib/studio-hair-coverage.mjs";
import {
  findFreePort,
  spawnVitePreview,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

const OUT_DIR = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "toonspectrum-hair-coverage");
const RESULT_PATH = join(OUT_DIR, "hair-coverage.json");
const QUICKSTART_KEY = "toonstudio-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonstudio-studio-mobile-hint-dismissed";
const DIALOG = '[data-character-shaper="true"]';

/** A-01 에서 민머리로 보고된 5종 + 극단 체형 3종 + 일반 2종. */
const DEFAULT_MODELS = [
  "루미", "시온", "비타", "비비", "쿼터니어스 캐주얼 (여성)",
  "오리온 (로봇)", "시드상 (마스코트)", "쿼터니어스 정장 (남성)", "시노", "루빈",
];
const DEFAULT_PRESETS = [
  "short", "pixie", "bob", "wolf", "long", "wavy", "hime",
  "ponytail", "twintail", "half-up", "bun", "braid", "twin-braid",
];
const VIEWS: readonly HairCoverageView[] = ["front", "back"];
/** 측정용 헤어 색. 피부·옷·배경 어디에도 흔치 않은 색이라 헤어가 덮은 픽셀이 확실히 바뀐다. */
const PROBE_HAIR_COLOR = "#FF00FF";

const SWIFTSHADER_ARGS = [
  "--no-sandbox",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];
const GPU_LANE = process.env.TOONSPECTRUM_CHARACTER_GPU_LANE
  ?? (process.platform === "darwin" ? "native" : "swiftshader");
if (GPU_LANE !== "native" && GPU_LANE !== "swiftshader") {
  throw new Error("TOONSPECTRUM_CHARACTER_GPU_LANE must be native or swiftshader");
}

function listFromEnv(name: string, fallback: readonly string[]): string[] {
  const raw = process.env[name];
  const values = (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return values.length > 0 ? values : [...fallback];
}

/**
 * native 는 Playwright 의 전체 Chrome for Testing(새 headless)을 쓴다 — 기본 headless shell 은
 * macOS 에서도 SwiftShader 로 그려 실 GPU 경로를 못 본다. 지정 바이너리가 있으면 그것을 쓴다.
 */
function launchOptions(): Parameters<typeof chromium.launch>[0] {
  const explicit = process.env.TOONSPECTRUM_CHROMIUM_PATH;
  const executablePath = explicit && existsSync(explicit) ? explicit : undefined;
  if (GPU_LANE === "native") {
    return executablePath
      ? { headless: true, executablePath, args: ["--no-sandbox", "--ignore-gpu-blocklist"] }
      : { headless: true, channel: "chromium", args: ["--no-sandbox", "--ignore-gpu-blocklist"] };
  }
  return { headless: true, args: SWIFTSHADER_ARGS, ...(executablePath ? { executablePath } : {}) };
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9가-힣]+/g, "_").replace(/^_|_$/g, "") || "x";
}

async function waitShaperIdle(page: Page, timeout = 180_000): Promise<void> {
  await page.waitForFunction((dialog) => {
    const root = document.querySelector(dialog);
    if (!root) return false;
    const upperBody = [...root.querySelectorAll("button")].find((button) => button.textContent?.trim() === "상반신");
    if (!upperBody || (upperBody as HTMLButtonElement).disabled) return false;
    const cards = [...root.querySelectorAll("[data-character-slot-card]")];
    return cards.length > 0 && !cards.some((card) => /복원하는 중|불러오는 중/.test(card.getAttribute("title") ?? ""));
  }, DIALOG, { timeout });
}

async function openShaper(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/studio/character`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForSelector(DIALOG, { timeout: 300_000 });
  await page.waitForSelector(`${DIALOG} [data-character-shaper-viewport] canvas`, { timeout: 120_000 });
  await waitShaperIdle(page);
}

async function selectCard(page: Page, id: string): Promise<boolean> {
  const card = page.locator(`${DIALOG} [data-character-slot-card="${id}"]`).first();
  if ((await card.count()) === 0) return false;
  if ((await card.getAttribute("data-character-slot-card-availability")) === "unavailable") return false;
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute("data-character-slot-card-selected") === "true",
    `${DIALOG} [data-character-slot-card="${id}"]`,
    { timeout: 20_000 },
  );
  // 헤어 교체는 짧은 전환 애니메이션 뒤에 확정된다.
  await page.waitForTimeout(1_300);
  return true;
}

async function setView(page: Page, view: HairCoverageView): Promise<void> {
  if (view === "front") {
    await page.locator(DIALOG).getByRole("group", { name: "카메라 프리셋" })
      .getByRole("button", { name: "상반신", exact: true }).click();
  } else {
    await page.locator(DIALOG).getByRole("combobox", { name: "부위·방향 확대 검사" }).selectOption("back");
  }
  await page.waitForTimeout(1_000);
}

async function viewportShot(page: Page): Promise<Buffer> {
  return page.locator(`${DIALOG} [data-character-shaper-viewport] canvas`).first().screenshot();
}

/** 기준 촬영 전에 절차형 헤어 카드가 하나도 선택돼 있지 않은지 확인한다(기준이 민머리여야 비교가 된다). */
async function assertNoProceduralHair(page: Page, model: string): Promise<void> {
  const selected = await page.locator(`${DIALOG} [data-character-slot-card^="hair:"][data-character-slot-card-selected="true"]`)
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-character-slot-card") ?? ""));
  const procedural = selected.filter((id) => id !== "hair:none" && id !== "hair:original");
  if (procedural.length > 0) throw new Error(`${model}: 기준 촬영 전에 절차형 헤어(${procedural.join(", ")})가 씌워져 있다`);
}

async function setProbeHairColor(page: Page): Promise<void> {
  for (const label of ["헤어 기본색", "모발 끝 색"]) {
    const input = page.locator(DIALOG).getByLabel(`${label} HEX 값`, { exact: true }).first();
    // 부하가 높으면 모델 교체 직후 인스펙터가 늦게 다시 그려진다.
    await input.waitFor({ state: "visible", timeout: 90_000 });
    await input.scrollIntoViewIfNeeded();
    await input.fill(PROBE_HAIR_COLOR);
    await input.press("Enter");
    await page.waitForTimeout(600);
  }
}

/**
 * 두 PNG 를 페이지 안에서 풀어 머리 영역에서 바뀐 픽셀 비율을 잰다(이미지 디코딩을 Node 밖에 둔다).
 * 머리 영역 = 위 35% 띠, 후면은 그 띠의 가운데 40% 폭.
 */
async function crownChange(page: Page, base: Buffer, shot: Buffer, view: HairCoverageView): Promise<number> {
  return page.evaluate(async ({ a, b, centerOnly }) => {
    const load = (encoded: string) => createImageBitmap(
      new Blob([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))], { type: "image/png" }),
    );
    const [first, second] = await Promise.all([load(a), load(b)]);
    const width = Math.min(first.width, second.width);
    const height = Math.min(first.height, second.height);
    const read = (bitmap: ImageBitmap) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D context unavailable");
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, width, height).data;
    };
    const left = read(first);
    const right = read(second);
    const rows = Math.max(1, Math.floor(height * 0.35));
    const x0 = centerOnly ? Math.floor(width * 0.3) : 0;
    const x1 = centerOnly ? Math.ceil(width * 0.7) : width;
    let changed = 0;
    for (let y = 0; y < rows; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const offset = (y * width + x) * 4;
        const delta = Math.abs(left[offset] - right[offset])
          + Math.abs(left[offset + 1] - right[offset + 1])
          + Math.abs(left[offset + 2] - right[offset + 2]);
        if (delta > 40) changed += 1;
      }
    }
    first.close();
    second.close();
    return changed / (rows * (x1 - x0));
  }, { a: base.toString("base64"), b: shot.toString("base64"), centerOnly: view === "back" });
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const models = listFromEnv("TOONSPECTRUM_HAIR_COVERAGE_MODELS", DEFAULT_MODELS);
  const presets = listFromEnv("TOONSPECTRUM_HAIR_COVERAGE_PRESETS", DEFAULT_PRESETS);
  const thresholds = {
    front: readHairCoverageThreshold(process.env.TOONSPECTRUM_HAIR_COVERAGE_FRONT, DEFAULT_HAIR_COVERAGE_THRESHOLDS.front),
    back: readHairCoverageThreshold(process.env.TOONSPECTRUM_HAIR_COVERAGE_BACK, DEFAULT_HAIR_COVERAGE_THRESHOLDS.back),
  };
  let preview: ChildProcess | null = null;
  let origin = process.env.TOONSPECTRUM_VERIFY_ORIGIN ?? "";
  if (!origin) {
    const port = await findFreePort();
    preview = spawnVitePreview({ port, runner: "pnpm-exec", logPath: join(OUT_DIR, "preview.log") });
    origin = `http://127.0.0.1:${port}`;
    await waitForServer(`${origin}/`, { timeoutMs: 60_000 });
  }
  const browser: Browser = await chromium.launch(launchOptions());
  const samples: HairCoverageSample[] = [];
  const skipped: { model: string; preset: string; reason: string }[] = [];
  const evidence: Record<string, unknown> = {
    status: "running", origin, capturedAt: new Date().toISOString(), lane: GPU_LANE,
    models, presets, thresholds, samples, skipped,
  };
  let page: Page | null = null;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
    await context.addInitScript({ content: "globalThis.__name ??= (value) => value;" });
    await context.addInitScript(([quickStart, mobileHint]) => {
      try {
        localStorage.setItem(quickStart, "1");
        localStorage.setItem(mobileHint, "1");
      } catch {
        // 저장소가 막힌 브라우저에서는 안내가 떠도 측정에는 지장이 없다.
      }
    }, [QUICKSTART_KEY, MOBILE_HINT_KEY]);
    page = await context.newPage();
    await openShaper(page, origin);
    evidence.renderer = await page.locator(`${DIALOG} [data-character-shaper-viewport] canvas`).first().evaluate((canvas) => {
      const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
      const extension = gl?.getExtension("WEBGL_debug_renderer_info");
      return gl && extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : "unknown";
    });
    const dialog = page.locator(DIALOG);
    for (const model of models) {
      await dialog.getByRole("combobox", { name: "모델", exact: true }).selectOption({ label: model });
      await page.waitForTimeout(800);
      await waitShaperIdle(page);
      // 카테고리 이름은 바뀐 뒤 "헤어 변경됨" 이 되므로 데이터 속성으로 고른다.
      await dialog.locator('[data-character-category="hair"]').first().click();
      // 기준 = 절차형 헤어가 없는 상태. 원본 헤어 메시가 있는 모델은 「헤어 없음」(민머리)을 고르고,
      // 없는 모델(오리온 등)은 「헤어 없음」·「원본 유지」가 둘 다 막혀 있어 모델을 막 불러온 상태가 기준이다.
      const baseline = (await selectCard(page, "hair:none")) ? "none" : "loaded";
      if (baseline === "loaded") await assertNoProceduralHair(page, model);
      const bases = new Map<HairCoverageView, Buffer>();
      for (const view of VIEWS) {
        await setView(page, view);
        const base = await viewportShot(page);
        bases.set(view, base);
        writeFileSync(join(OUT_DIR, `${slug(model)}-${view}-${baseline}.png`), base);
      }
      // 색 조절은 절차형 헤어가 있을 때 화면에 보인다. 첫 프리셋을 씌운 뒤 측정용 색으로 바꾼다
      // (스타일을 바꿔도 색은 유지된다).
      if (!(await selectCard(page, `hair:${presets[0] ?? "short"}`))) throw new Error(`${model}: 첫 헤어 카드를 고를 수 없다`);
      await setProbeHairColor(page);
      for (const view of VIEWS) {
        await setView(page, view);
        const base = bases.get(view);
        if (!base) throw new Error(`${model} ${view}: 기준 촬영이 없다`);
        for (const preset of presets) {
          if (!(await selectCard(page, `hair:${preset}`))) {
            skipped.push({ model, preset, reason: "card unavailable" });
            continue;
          }
          const shot = await viewportShot(page);
          writeFileSync(join(OUT_DIR, `${slug(model)}-${view}-${preset}.png`), shot);
          const crown = await crownChange(page, base, shot, view);
          samples.push({ model, preset, view, crown: Number(crown.toFixed(4)) });
          console.log(`${model} ${view} ${preset} 정수리 변화 ${(crown * 100).toFixed(2)}% (기준 ${baseline})`);
        }
      }
    }
    const verdict = evaluateHairCoverage(samples, thresholds);
    evidence.verdict = verdict;
    evidence.status = verdict.passed ? "passed" : "failed";
    for (const failure of verdict.failures) {
      console.error(`미달: ${failure.model} ${failure.view} ${failure.preset} ${(failure.crown * 100).toFixed(2)}% < ${(failure.threshold * 100).toFixed(1)}%`);
    }
    console.log(`hair coverage ${evidence.status} (${verdict.checked}건) → ${RESULT_PATH}`);
    if (!verdict.passed) process.exitCode = 1;
  } finally {
    if (evidence.status === "running") {
      evidence.status = "failed";
      // 측정 도중 멈췄으면 그 순간 화면을 남긴다(선택자·로딩 문제를 바로 보이게).
      await page?.screenshot({ path: join(OUT_DIR, "aborted.png") }).catch(() => undefined);
    }
    writeFileSync(RESULT_PATH, JSON.stringify(evidence, null, 2));
    await browser.close();
    if (preview) await stopChildProcess(preview);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
