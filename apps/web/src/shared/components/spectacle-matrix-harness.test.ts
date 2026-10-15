/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { URL as NodeUrl } from "node:url";
import { Script } from "node:vm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * 테마×표면 스크린샷 매트릭스 하네스(spectacle-matrix.html)의 보안 계약.
 * 하네스는 ?theme=<값> 쿼리를 읽어 템플릿 문자열로 DOM 에 넣는다. 쿼리 값이 검증 전 원문 그대로
 * innerHTML 로 들어가면 링크 한 번으로 스크립트가 실행되는 DOM XSS 가 된다(CodeQL js/xss).
 */
const html = readFileSync(new NodeUrl("./spectacle-matrix.html", import.meta.url), "utf8");

function inlineScript(): string {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map((match) => match[1] ?? "");
  expect(blocks).toHaveLength(1);
  return blocks[0] ?? "";
}

function runHarness(search: string): void {
  history.replaceState(null, "", `/spectacle-matrix.html${search}`);
  new Script(inlineScript()).runInNewContext({ document, location, URLSearchParams });
}

beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-design-theme");
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("spectacle-matrix 하네스 쿼리 처리", () => {
  it("허용 목록의 테마 이름은 그대로 렌더한다", () => {
    runHarness("?theme=dark");
    expect(document.documentElement.getAttribute("data-design-theme")).toBe("dark");
    const heading = document.querySelector("[data-matrix-theme]");
    expect(heading?.getAttribute("data-matrix-theme")).toBe("dark");
    expect(heading?.textContent).toBe("theme: dark");
    expect(document.querySelector('nav a[aria-current="true"]')?.textContent).toBe("dark");
  });

  it("쿼리가 없으면 기본 테마(aurora)로 렌더한다", () => {
    runHarness("");
    expect(document.documentElement.getAttribute("data-design-theme")).toBe("aurora");
    expect(document.querySelector("[data-matrix-theme]")?.getAttribute("data-matrix-theme")).toBe("aurora");
  });

  it.each([
    "?theme=%3Cimg%20src%3Dx%20onerror%3Dwindow.__pwned%3D1%3E",
    "?theme=%22%3E%3Cscript%3Ewindow.__pwned%3D1%3C%2Fscript%3E",
    "?theme=aurora%22%20onfocus%3D%22window.__pwned%3D1%22%20autofocus%20x%3D%22",
  ])("허용 목록에 없는 값은 마크업이 아니라 기본 테마로만 취급한다: %s", (search) => {
    runHarness(search);
    const stage = document.querySelector("main.mx-stage");
    expect(stage).not.toBeNull();
    // 주입된 요소·속성이 하나도 생기지 않아야 한다.
    expect(stage?.querySelector("img, script, [onerror], [onfocus], [autofocus]")).toBeNull();
    expect(document.querySelector("[data-matrix-theme]")?.getAttribute("data-matrix-theme")).toBe("aurora");
    expect(document.querySelector("[data-matrix-theme]")?.textContent).toBe("theme: aurora");
    expect(document.documentElement.getAttribute("data-design-theme")).toBe("aurora");
    expect(Reflect.get(globalThis, "__pwned")).toBeUndefined();
  });
});
