/**
 * 시드 테스트 계정 로그인 보조.
 *
 * - 자격증명은 로컬 풀스택 하네스와 같은 방식(프로세스 환경변수 → .env.infrastructure.local)으로 읽기만 한다.
 * - 값은 비공개 필드에 두고 입력 동작(fillEmail/fillPassword)으로만 쓴다. 로그·JSON·예외 메시지로 나가지 않는다.
 * - 로그인 자격증명을 보내기 전에 대상 origin 이 loopback 인지 하네스의 가드(assertLocalOrigin)로 확인한다.
 * - 로그인 상태(쿠키)는 메모리의 storageState 로만 들고 있고 파일로 저장하지 않는다.
 */
import { ENV_KEYS } from "../local-fullstack/lib/config.mjs";
import { assertLocalOrigin } from "../local-fullstack/lib/guard.mjs";
import { collectSecretValues, loadHarnessValues } from "../local-fullstack/lib/harness-env.mjs";

import { contextOptions } from "./measure.mjs";
import { setMeasurementPreferences } from "./page-probes.mjs";

const SIGNED_IN_HEADING = /이미 로그인되어 있어요|already signed in/iu;

class AuditCredentials {
  #email;
  #password;
  #secrets;

  constructor(email, password, secrets) {
    this.#email = email;
    this.#password = password;
    this.#secrets = secrets;
  }

  /** 출력 마스킹에 쓸 비밀 문자열 목록(계정 식별자 포함). */
  get secrets() {
    return [...this.#secrets];
  }

  async fillEmail(locator) {
    await locator.fill(this.#email);
  }

  async fillPassword(locator) {
    await locator.fill(this.#password);
  }

  toJSON() {
    return { available: true };
  }

  toString() {
    return "[AuditCredentials]";
  }
}

/**
 * 시드 테스트 계정 자격증명을 읽는다. 없으면 이유(값 없음)만 돌려준다.
 * @param {{ environment?: NodeJS.ProcessEnv, envFilePath?: string }} [options]
 */
export function loadAuditCredentials({ environment = process.env, envFilePath } = {}) {
  let values;
  try {
    ({ values } = loadHarnessValues({ environment, ...(envFilePath ? { envFilePath } : {}) }));
  } catch (error) {
    return { ok: false, reason: `자격증명 파일을 읽지 못했습니다(${error?.code ?? "오류"}).`, secrets: [] };
  }
  const email = values[ENV_KEYS.testEmail];
  const password = values[ENV_KEYS.testPassword];
  const secrets = collectSecretValues(values).map((entry) => entry.value);
  if (!email || !password) {
    return {
      ok: false,
      reason: `시드 테스트 계정 키(${ENV_KEYS.testEmail}, ${ENV_KEYS.testPassword})가 없습니다. 'node scripts/local-fullstack/cli.mjs up' 으로 로컬 풀스택을 먼저 띄우세요.`,
      secrets,
      defaults: { webOrigin: values[ENV_KEYS.webOrigin], apiOrigin: values[ENV_KEYS.apiOrigin] },
    };
  }
  return {
    ok: true,
    credentials: new AuditCredentials(email, password, secrets),
    secrets,
    defaults: { webOrigin: values[ENV_KEYS.webOrigin], apiOrigin: values[ENV_KEYS.apiOrigin] },
  };
}

/** 자격증명을 보내도 되는 origin 인지(loopback http). 아니면 false. */
export function canSendCredentials(baseUrl) {
  try {
    assertLocalOrigin(new URL(baseUrl).origin, "감사 대상 origin");
    return true;
  } catch {
    return false;
  }
}

/** 로그인 화면에서 이메일·비밀번호를 입력하고 로그인한다. 성공 판정은 "이미 로그인되어 있어요" 제목이다. */
export async function signInWithForm(page, baseUrl, credentials, { timeoutMs = 120_000 } = {}) {
  assertLocalOrigin(new URL(baseUrl).origin, "감사 대상 origin");
  await page.goto(new URL("/auth/login", baseUrl).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const form = page.locator('[data-auth-form="true"]');
  await form.waitFor({ timeout: timeoutMs });
  await credentials.fillEmail(form.locator('input[type="email"]'));
  await credentials.fillPassword(form.locator('input[autocomplete="current-password"]'));
  await form.locator('button[type="submit"]').click();
  await page.getByRole("heading", { name: SIGNED_IN_HEADING }).waitFor({ timeout: timeoutMs });
}

/** 새 컨텍스트에서 로그인하고 쿠키·저장소 상태를 메모리로 돌려준다(파일로 쓰지 않는다). */
export async function captureAuthState(browser, baseUrl, credentials, viewport, { timeoutMs = 120_000 } = {}) {
  const context = await browser.newContext(contextOptions(viewport));
  try {
    await context.addInitScript(setMeasurementPreferences);
    const page = await context.newPage();
    await signInWithForm(page, baseUrl, credentials, { timeoutMs });
    return await context.storageState();
  } finally {
    await context.close();
  }
}

/** 저장된 로그인 상태가 서버에서 아직 유효한지 확인한다. */
export async function isSessionAuthenticated(browser, baseUrl, storageState) {
  const context = await browser.newContext({ storageState });
  try {
    const response = await context.request.get(new URL("/api/auth/session", baseUrl).href, { timeout: 20_000 });
    if (!response.ok()) return false;
    const body = await response.json();
    return body?.authenticated === true;
  } catch {
    return false;
  } finally {
    await context.close();
  }
}
