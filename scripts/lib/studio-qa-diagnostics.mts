/** 선택형 QA 진단. 텍스트·파일명·DOM·네트워크 trace를 저장하지 않는다. */
import { writeFileSync } from "node:fs";

import { observeStudioQa } from "./studio-qa-browser-observer.mjs";

import type { Browser, BrowserContext } from "playwright";


type Kind = "layout" | "inputs";
const installed = new WeakMap<BrowserContext, "ready" | "unavailable">();

export async function installStudioQaDiagnostics(context: BrowserContext, kind: Kind): Promise<void> {
  if (process.env.TOONSTUDIO_QA_DIAGNOSTICS !== "1") return;
  try {
    await context.addInitScript({ content: `(${observeStudioQa.toString()})(${JSON.stringify(kind)})` });
    installed.set(context, "ready");
  } catch {
    installed.set(context, "unavailable");
  }
}

/** 기존 데스크톱 group 검증기의 context 설정을 한 곳에서 유지한다. */
export async function createStudioGroupQaContext(browser: Browser, locale: string): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, locale,
  });
  await installStudioQaDiagnostics(context, "inputs");
  return context;
}

/** 닫힌 페이지·수집 오류·정지된 renderer도 원래 검증 오류를 덮지 않는다. */
export async function collectStudioQaDiagnostics(context: BrowserContext): Promise<unknown> {
  const state = installed.get(context);
  if (!state) return undefined;
  installed.delete(context);
  if (state !== "ready") return { status: "unavailable" };
  const pages = context.pages().slice(0, 4);
  return Promise.all(pages.map(async (page) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        page.evaluate("globalThis.__studioQaDiagnostics?.finish() ?? null"),
        new Promise((resolve) => { timer = setTimeout(() => resolve({ status: "timeout" }), 1500); }),
      ]);
    } catch {
      return { status: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  }));
}

export async function saveStudioQaDiagnostics(context: BrowserContext, path: string): Promise<void> {
  const report = await collectStudioQaDiagnostics(context);
  if (report === undefined) return;
  try {
    writeFileSync(path, JSON.stringify({ schema: 1, pages: report }, null, 2));
  } catch {
    console.warn("선택형 QA 진단을 저장하지 못했습니다. 출력 디렉터리의 쓰기 권한과 여유 공간을 확인하세요.");
  }
}

export async function closeStudioGroupQaContext(context: BrowserContext, path: string): Promise<void> {
  try {
    await saveStudioQaDiagnostics(context, path);
  } finally {
    await context.close();
  }
}
