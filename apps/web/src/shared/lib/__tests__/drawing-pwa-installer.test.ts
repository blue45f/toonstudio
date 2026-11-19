import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";

const html = readFileSync("apps/web/public/draw-app/install.html", "utf8");
const script = readFileSync("apps/web/public/draw-app/install.js", "utf8");
const sessions: JSDOM[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) session.window.close();
});

async function openInstaller(register: () => Promise<unknown>) {
  const session = new JSDOM(html, { url: "https://example.test/draw-app/install.html", runScripts: "outside-only" });
  sessions.push(session);
  const { window } = session;
  Object.defineProperty(window.navigator, "serviceWorker", { value: { register } });
  window.eval(script);
  await new Promise<void>((resolve) => window.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
  const button = window.document.querySelector("button");
  const help = window.document.querySelector<HTMLElement>("#install-help");
  const warning = window.document.querySelector<HTMLElement>("#offline-status");
  if (!button || !help || !warning) throw new Error("설치 안내에 필요한 요소가 없습니다.");
  function offer(outcome: "accepted" | "dismissed") {
    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new window.Event("beforeinstallprompt", { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome }),
    });
    window.dispatchEvent(event);
    return prompt;
  }
  return { window, button, help, warning, offer };
}

it("오프라인 준비가 끝나기 전에도 수동 설치 안내를 열고 닫을 수 있다", async () => {
  const { button, help } = await openInstaller(() => new Promise(() => undefined));
  expect(button.disabled).toBe(false);
  expect(help.hidden).toBe(true);
  button.click();
  expect(help.hidden).toBe(false);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  button.click();
  expect(help.hidden).toBe(true);
});

it("오프라인 실패 메시지를 보존하고 설치 취소 후 새 요청을 수락한다", async () => {
  const { window, button, help, warning, offer } = await openInstaller(async () => { throw new Error("offline"); });
  expect(warning.hidden).toBe(false);
  const first = offer("dismissed");
  button.click();
  await vi.waitFor(() => expect(button.textContent).toContain("설치 방법"));
  expect(first).toHaveBeenCalledOnce();
  button.click();
  expect(help.hidden).toBe(false);
  const second = offer("accepted");
  expect(help.hidden).toBe(true);
  button.click();
  await vi.waitFor(() => expect(button.textContent).toBe("작품 보관함 열기"));
  expect(second).toHaveBeenCalledOnce();
  expect(warning.hidden).toBe(false);
  window.dispatchEvent(new window.Event("appinstalled"));
  expect(button.disabled).toBe(false);
  expect(button.hasAttribute("aria-expanded")).toBe(false);
});
