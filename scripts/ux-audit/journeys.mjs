/**
 * 핵심 사용자 여정 스크립트(6개). 각 여정은 단계 수(사용자 조작 횟수)·소요 시간·성공 여부를 잰다.
 *
 * - "조작"은 사용자가 직접 하는 이동·클릭·입력이다. 기다림과 확인은 세지 않는다.
 * - 막히면 막힌 단계 이름·원인(첫 줄)과 그 시점의 스크린샷을 남긴다. 막힌 것도 정직한 측정 결과이므로 점수에는 실패로 반영한다.
 * - 여정마다 새 브라우저 컨텍스트를 쓴다(저장소가 섞이지 않는다). 로그인 상태는 메모리의 storageState 로만 전달한다.
 * - 선택자는 접근 가능한 이름(역할+이름)을 우선한다. 이름이 바뀌어 실패하면 그 자체가 접근성·문구 회귀 신호지만,
 *   도구 오탐과 구분하려고 실패 원인에 마지막으로 기다린 대상을 남긴다.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { JOURNEY_ORDER } from "./journey-meta.mjs";
import { contextOptions } from "./measure.mjs";
import { setMeasurementPreferences } from "./page-probes.mjs";
import { RUBRIC } from "./rubric.mjs";
import { firstLine } from "./util.mjs";

const STEP_TIMEOUT_MS = 60_000;
const EDITOR_SELECTORS = Object.freeze({
  modes: '[role="tablist"][aria-label="작업 모드"]',
  canvas: '[aria-label="캔버스 작업영역"]',
});

/** 에디터가 열렸는지: 작업 모드 탭과 캔버스 작업영역이 모두 보인다. */
async function waitForEditor(page, timeout = STEP_TIMEOUT_MS) {
  await page.locator(EDITOR_SELECTORS.modes).first().waitFor({ state: "visible", timeout });
  await page.locator(EDITOR_SELECTORS.canvas).first().waitFor({ state: "visible", timeout });
}

/**
 * 시작 버튼을 누른 뒤: 곧바로 에디터가 열리면 그대로 끝, 프로젝트 화면이 먼저 나오면 "이어서 그리기"를 눌러 에디터로 들어간다.
 * 두 번째 경우는 사용자 조작이 한 번 더 필요하므로 count() 로 센다.
 */
async function enterEditorFromProject(page, count) {
  const editor = page.locator(EDITOR_SELECTORS.canvas).first();
  const continueLink = page.getByRole("link", { name: "이어서 그리기" }).first();
  await Promise.race([
    editor.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS }),
    continueLink.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS }),
  ]);
  if (!(await editor.isVisible())) {
    count();
    await continueLink.click();
  }
  await waitForEditor(page);
}

/** 터미널 색 코드(ESC[...m). 제어 문자를 정규식 리터럴에 쓰지 않으려고 문자 코드로 만든다. */
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu");

/** Playwright 의 클릭 실패 로그에서 "다른 요소가 포인터를 가로챈다"는 줄을 뽑아 원인 설명으로 쓴다. */
function obstructionReason(error) {
  const text = error instanceof Error ? error.message : String(error);
  const lines = text.replace(ANSI_ESCAPE, "").split("\n").map((line) => line.trim());
  const hit = lines.find((line) => /intercepts pointer events/u.test(line));
  if (!hit) return firstLine(error);
  const tag = hit.match(/<([a-z][a-z0-9-]*)/u)?.[1] ?? "요소";
  const name = hit.match(/aria-label="([^"]+)"/u)?.[1];
  const classes = (hit.match(/class="([^"]+)"/u)?.[1] ?? "").split(/\s+/u).filter(Boolean).slice(0, 2).map((entry) => `.${entry}`).join("");
  return `${tag}${classes}${name ? ` "${name}"` : ""} 가 클릭을 가로챔`;
}

const startButton = (page) => page.getByRole("button", { name: /시작$/ }).last();

/** 여정 정의. run 은 { page, context, step, count, friction, url, credentials } 를 받는다(friction: 완주는 했지만 막힌 곳을 우회한 기록). */
const DEFINITIONS = Object.freeze({
  "new-work-to-editor": {
    authenticated: true,
    async run({ page, step, count, url }) {
      await step("새 작품 화면 열기", async () => {
        await page.goto(url("/studio/new"), { waitUntil: "domcontentloaded" });
        await page.getByRole("textbox", { name: "프로젝트 이름" }).waitFor({ timeout: STEP_TIMEOUT_MS });
      }, { action: true });
      await step("프로젝트 이름 입력", () => page.getByRole("textbox", { name: "프로젝트 이름" }).fill("UX 감사 시험 작품"), { action: true });
      await step("시작 버튼 누르기", async () => {
        await startButton(page).click();
        await page.waitForURL(/\/studio\/p\//u, { timeout: STEP_TIMEOUT_MS });
      }, { action: true });
      await step("에디터 진입", () => enterEditorFromProject(page, count));
    },
  },
  "open-example-project": {
    authenticated: true,
    async run({ page, step, url }) {
      const exampleLink = page.getByRole("link", { name: "예제 · 첫 웹툰 한 컷 이어서 작업" });
      await step("스튜디오 라이브러리 열기", async () => {
        await page.goto(url("/studio"), { waitUntil: "domcontentloaded" });
        await exampleLink.waitFor({ timeout: STEP_TIMEOUT_MS });
      }, { action: true });
      await step("예제 프로젝트 열기", async () => {
        await exampleLink.click();
        await waitForEditor(page);
      }, { action: true });
    },
  },
  "template-to-work": {
    authenticated: true,
    async run({ page, step, count, url }) {
      await step("템플릿 화면 열기", async () => {
        await page.goto(url("/studio/templates"), { waitUntil: "domcontentloaded" });
        await page.getByRole("link", { name: "이 템플릿으로 시작" }).first().waitFor({ timeout: STEP_TIMEOUT_MS });
      }, { action: true });
      await step("4컷·컷툰 템플릿 선택", async () => {
        const card = page.locator("article").filter({ hasText: "4컷·컷툰" }).first();
        await card.getByRole("link", { name: "이 템플릿으로 시작" }).click();
        await page.getByRole("textbox", { name: "프로젝트 이름" }).waitFor({ timeout: STEP_TIMEOUT_MS });
      }, { action: true });
      await step("시작 버튼 누르기", async () => {
        await startButton(page).click();
        await page.waitForURL(/\/studio\/p\//u, { timeout: STEP_TIMEOUT_MS });
      }, { action: true });
      await step("에디터 진입", () => enterEditorFromProject(page, count));
    },
  },
  "settings-roundtrip": {
    authenticated: true,
    async run({ page, step, count, friction, url }) {
      const theme = page.getByRole("radio", { name: "페이퍼" });
      await step("설정 화면 열기", async () => {
        await page.goto(url("/settings"), { waitUntil: "domcontentloaded" });
        await theme.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
      }, { action: true });
      await step("테마(페이퍼) 선택", async () => {
        // 라디오는 sr-only 이고 카드 라벨이 클릭을 받는다. 사용자와 같게 카드를 누른다.
        await page.locator("label").filter({ has: theme }).first().click();
        if (!(await theme.isChecked())) throw new Error("테마를 눌렀지만 라디오가 선택되지 않음");
      }, { action: true });
      await step("다른 화면(제작)으로 이동", async () => {
        await page.getByRole("link", { name: "제작", exact: true }).first().click();
        await page.waitForURL(/\/studio/u, { timeout: STEP_TIMEOUT_MS });
      }, { action: true });
      await step("설정으로 돌아오기", async () => {
        try {
          await page.getByRole("link", { name: "환경 설정" }).first().click({ timeout: 10_000 });
        } catch (error) {
          // 사용자는 링크를 누를 수 없으면 뒤로 가기로 돌아온다. 완주는 하되 마찰로 기록해 효율에서 반영한다.
          friction(`'환경 설정' 링크를 누를 수 없어 뒤로 가기로 우회: ${obstructionReason(error)}`);
          count();
          await page.goBack({ waitUntil: "domcontentloaded" });
        }
        await page.waitForURL(/\/settings/u, { timeout: STEP_TIMEOUT_MS });
        await theme.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
        if (!(await theme.isChecked())) throw new Error("돌아온 설정 화면에서 선택한 테마가 유지되지 않음");
      }, { action: true });
    },
  },
  "error-recovery": {
    authenticated: false,
    async run({ page, context, step, count, friction, url }) {
      let blocked = true;
      await context.route("**/api/**", (route) => (blocked ? route.abort("internetdisconnected") : route.continue()));
      const errorAlerts = () => page.locator('[role="alert"]').filter({ hasText: "불러오지 못" });
      const retryName = /재시도|다시 시도|다시 불러오기/u;
      await step("네트워크를 막고 커뮤니티 화면 열기", async () => {
        await page.goto(url("/community"), { waitUntil: "domcontentloaded" });
        await errorAlerts().first().waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
        // 오류가 실제로 안내되기까지 다른 비동기 영역도 같은 실패를 보여 줄 시간을 준다.
        await page.waitForTimeout(3_000);
      }, { action: true });
      await step("모든 오류 안내에 재시도 수단이 있는지 확인", async () => {
        const total = await errorAlerts().count();
        for (let index = 0; index < total; index += 1) {
          const retry = errorAlerts().nth(index).getByRole("button", { name: retryName });
          if ((await retry.count()) === 0) throw new Error(`오류 안내 ${index + 1}/${total}번에 재시도 버튼이 없음`);
        }
        blocked = false;
        if (total > 1) friction(`같은 원인(네트워크 차단)의 오류 안내가 ${total}곳에 따로 떠 있어 각각 재시도해야 함`);
      });
      await step("재시도를 눌러 오류 안내가 모두 사라질 때까지", async () => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          if ((await errorAlerts().count()) === 0) return;
          count();
          await errorAlerts().first().getByRole("button", { name: retryName }).first().click();
          await page.waitForTimeout(2_500);
        }
        if ((await errorAlerts().count()) > 0) throw new Error("재시도를 4번 눌러도 오류 안내가 남아 있음");
      });
    },
  },
  "login-logout": {
    authenticated: false,
    async run({ page, step, url, credentials }) {
      const form = page.locator('[data-auth-form="true"]');
      await step("로그인 화면 열기", async () => {
        await page.goto(url("/auth/login"), { waitUntil: "domcontentloaded" });
        await form.waitFor({ timeout: STEP_TIMEOUT_MS });
      }, { action: true });
      await step("이메일 입력", () => credentials.fillEmail(form.locator('input[type="email"]')), { action: true });
      await step("비밀번호 입력", () => credentials.fillPassword(form.locator('input[autocomplete="current-password"]')), { action: true });
      await step("로그인 누르기", async () => {
        await form.locator('button[type="submit"]').click();
        await page.getByRole("heading", { name: /이미 로그인되어 있어요|already signed in/iu }).waitFor({ timeout: STEP_TIMEOUT_MS });
      }, { action: true });
      await step("내 공간으로 이동", async () => {
        await page.getByRole("link", { name: "내 공간으로" }).click();
        await page.getByRole("button", { name: /계정 메뉴/u }).waitFor({ timeout: STEP_TIMEOUT_MS });
      }, { action: true });
      await step("계정 메뉴 열기", () => page.getByRole("button", { name: /계정 메뉴/u }).click(), { action: true });
      await step("로그아웃 누르기", async () => {
        await page.getByRole("menuitem", { name: /로그아웃|sign out|log out/iu }).click();
        await page.getByRole("button", { name: /^(로그인|log ?in|sign ?in)$/iu }).first().waitFor({ timeout: STEP_TIMEOUT_MS });
        const response = await page.request.get(url("/api/auth/session"));
        const body = await response.json();
        if (body?.authenticated !== false) throw new Error("로그아웃 뒤에도 서버 세션이 남아 있음");
      }, { action: true });
    },
  },
});

/**
 * 여정 하나를 실행한다.
 * @param {string} id
 * @param {{ browser: import("playwright").Browser, baseUrl: string, credentials: object | null, storageState: object | null,
 *   viewport: object, outDir: string | null, redact: (text: string) => string }} env
 */
export async function runJourney(id, env) {
  const definition = DEFINITIONS[id];
  const label = RUBRIC.journeys.items.find((item) => item.id === id)?.label ?? id;
  const { browser, baseUrl, credentials, storageState, viewport, outDir, redact } = env;
  if (!definition) return { id, label, skipped: true, skipReason: "정의되지 않은 여정" };
  if ((definition.authenticated && !storageState) || (id === "login-logout" && !credentials)) {
    return { id, label, skipped: true, skipReason: "로그인 상태 또는 자격증명 없음(로컬 풀스택·시드 계정 필요)" };
  }
  const context = await browser.newContext(contextOptions(viewport, definition.authenticated ? storageState : undefined));
  const steps = [];
  const frictions = [];
  let actions = 0;
  let failure = null;
  try {
    await context.addInitScript(setMeasurementPreferences);
    const page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    const count = () => {
      actions += 1;
    };
    const friction = (note) => {
      frictions.push(redact(note));
    };
    const step = async (name, body, { action = false } = {}) => {
      const startedAt = Date.now();
      if (action) count();
      try {
        const value = await body();
        steps.push({ name, ms: Date.now() - startedAt, ok: true, action });
        return value;
      } catch (error) {
        steps.push({ name, ms: Date.now() - startedAt, ok: false, action, error: redact(firstLine(error)) });
        throw error;
      }
    };
    const url = (path) => new URL(path, baseUrl).href;
    try {
      await definition.run({ page, context, step, count, friction, url, credentials });
    } catch (error) {
      failure = { step: steps.at(-1)?.name ?? "시작", reason: redact(firstLine(error)) };
      if (outDir) {
        mkdirSync(outDir, { recursive: true });
        const screenshot = join(outDir, `${id}-막힌지점.jpg`);
        await page.screenshot({ path: screenshot, type: "jpeg", quality: 60 }).then(() => {
          failure.screenshot = screenshot;
        }, () => undefined);
      }
      failure.url = redact(new URL(page.url(), baseUrl).pathname);
    }
  } finally {
    await context.close().catch(() => undefined);
  }
  return {
    id,
    label,
    skipped: false,
    viewportId: viewport.id,
    success: failure === null,
    actions,
    totalMs: steps.reduce((total, entry) => total + entry.ms, 0),
    steps,
    frictions,
    ...(failure ? { blockedAt: failure } : {}),
  };
}

/**
 * 여정 묶음 실행. 한 여정이 실패해도 다음 여정을 계속한다.
 * @param {readonly string[]} ids
 * @param {Parameters<typeof runJourney>[1]} env
 * @param {(line: string) => void} [log]
 */
export async function runJourneys(ids, env, log = () => undefined) {
  const results = [];
  for (const id of JOURNEY_ORDER.filter((entry) => ids.includes(entry))) {
    log(`여정 시작: ${id}`);
    const result = await runJourney(id, env);
    results.push(result);
    log(result.skipped
      ? `  건너뜀 — ${result.skipReason}`
      : `  ${result.success ? "성공" : "실패"} · 조작 ${result.actions}회 · ${Math.round(result.totalMs / 100) / 10}초${result.blockedAt ? ` · 막힌 곳: ${result.blockedAt.step} — ${result.blockedAt.reason}` : ""}`);
  }
  return results;
}
