import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSpeculationRules,
  buildSpeculationRulesJson,
  runWhenDocumentActivated,
  STUDIO_PRERENDER_URLS,
} from "./speculation-rules";

// 이 repo의 lib 테스트 환경에는 DOM 전역이 없다 — 모듈이 실제로 만지는 표면
// (HTMLScriptElement.supports, document.head/querySelector/createElement)만 가짜로 둔다.
interface FakeScriptElement {
  type: string;
  textContent: string;
}

function createFakeDocument() {
  const scripts: FakeScriptElement[] = [];
  return {
    scripts,
    head: {
      appendChild: (el: FakeScriptElement) => {
        scripts.push(el);
      },
    },
    querySelector: (selector: string) =>
      selector.includes("speculationrules") ? (scripts[0] ?? null) : null,
    createElement: (): FakeScriptElement => ({ type: "", textContent: "" }),
  };
}

function stubEnvironment(supportsResult: boolean) {
  const fakeDocument = createFakeDocument();
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("HTMLScriptElement", {
    supports: (type: string) => supportsResult && type === "speculationrules",
  });
  return fakeDocument;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildSpeculationRules", () => {
  it("list 규칙에 moderate eagerness로 담는다", () => {
    const rules = buildSpeculationRules(["/studio"]);
    expect(rules.prerender).toEqual([
      { source: "list", urls: ["/studio"], eagerness: "moderate" },
    ]);
    expect(JSON.parse(buildSpeculationRulesJson(["/studio"]))).toEqual(rules);
  });

  it("외부 URL·중복·프로토콜 상대 경로는 버린다", () => {
    const rules = buildSpeculationRules([
      "/studio",
      "/studio",
      "https://example.com/studio",
      "//example.com/studio",
      "studio",
    ]);
    expect(rules.prerender[0].urls).toEqual(["/studio"]);
  });
});

describe("installSpeculationRules", () => {
  it("지원 환경 + 켜짐이면 스크립트를 한 번만 주입한다", async () => {
    vi.resetModules();
    const fakeDocument = stubEnvironment(true);
    const mod = await import("./speculation-rules");
    const installed = mod.installSpeculationRules({
      urls: ["/studio"],
      isEnabled: () => true,
    });
    expect(installed).toBe(true);
    expect(fakeDocument.scripts).toHaveLength(1);
    expect(fakeDocument.scripts[0].type).toBe("speculationrules");
    expect(JSON.parse(fakeDocument.scripts[0].textContent).prerender[0].urls).toEqual(["/studio"]);
    expect(
      mod.installSpeculationRules({ urls: ["/studio"], isEnabled: () => true }),
    ).toBe(false);
  });

  it("설정이 꺼져 있으면 주입하지 않는다", async () => {
    vi.resetModules();
    const fakeDocument = stubEnvironment(true);
    const mod = await import("./speculation-rules");
    expect(
      mod.installSpeculationRules({ urls: ["/studio"], isEnabled: () => false }),
    ).toBe(false);
    expect(fakeDocument.scripts).toHaveLength(0);
  });

  it("미지원 환경에서는 조용히 주입하지 않는다", async () => {
    vi.resetModules();
    const fakeDocument = stubEnvironment(false);
    const mod = await import("./speculation-rules");
    expect(
      mod.installSpeculationRules({ urls: ["/studio"], isEnabled: () => true }),
    ).toBe(false);
    expect(fakeDocument.scripts).toHaveLength(0);
  });

  it("대상 URL이 비면 주입하지 않는다", async () => {
    vi.resetModules();
    const fakeDocument = stubEnvironment(true);
    const mod = await import("./speculation-rules");
    expect(
      mod.installSpeculationRules({ urls: ["https://example.com"], isEnabled: () => true }),
    ).toBe(false);
    expect(fakeDocument.scripts).toHaveLength(0);
  });
});

describe("프리렌더 활성화 경계", () => {
  function fakeDocument(prerendering: boolean | undefined) {
    const listeners: Array<{ type: string; listener: () => void; once: boolean }> = [];
    const doc = {
      prerendering,
      addEventListener: (type: string, listener: () => void, options?: { once?: boolean }) => {
        listeners.push({ type, listener, once: options?.once === true });
      },
    };
    return { doc: doc as unknown as Document, listeners };
  }

  it("프리렌더가 아니면 곧바로 동기로 실행한다", () => {
    const task = vi.fn();
    runWhenDocumentActivated(task, fakeDocument(false).doc);
    runWhenDocumentActivated(task, fakeDocument(undefined).doc);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("프리렌더 중이면 prerenderingchange 한 번에만 실행한다", () => {
    const task = vi.fn();
    const { doc, listeners } = fakeDocument(true);
    runWhenDocumentActivated(task, doc);
    expect(task).not.toHaveBeenCalled();
    expect(listeners).toEqual([expect.objectContaining({ type: "prerenderingchange", once: true })]);
    listeners[0]!.listener();
    expect(task).toHaveBeenCalledOnce();
  });

  it("CSP 가 규칙을 허용하는 동안 앱 부팅은 활성화 경계 뒤에 있다", () => {
    // CSP 가 규칙 해시를 허용하면 Chromium 이 /studio 를 숨은 채 실행한다. 이때 앱이 그대로 부팅하면
    // 페이지뷰가 집계되고 로컬 SQLite 소유 잠금을 숨은 문서가 쥔다(2026-10-23 감사).
    const policy = readFileSync(new URL("../../../../../config/http-response-headers.json", import.meta.url), "utf8");
    const main = readFileSync(new URL("../../app/main.tsx", import.meta.url), "utf8");
    const rules = buildSpeculationRulesJson(STUDIO_PRERENDER_URLS);
    expect(policy).toContain(`'sha256-${createHash("sha256").update(rules).digest("base64")}'`);
    expect(main).toContain("urls: STUDIO_PRERENDER_URLS,");
    expect(main).toContain("runWhenDocumentActivated(bootApplication);");
    const bootStart = main.indexOf("function bootApplication(): void {");
    expect(bootStart).toBeGreaterThan(-1);
    expect(main.indexOf("createRoot(")).toBeGreaterThan(bootStart);
    expect(main.indexOf("installStaticCatalog();")).toBeGreaterThan(bootStart);
  });
});
