import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compactBootstrapAssets } from "../../apps/web/config/compact-bootstrap-assets";
import { planStudioServiceWorkerPrecache } from "../../apps/web/src/app/service-worker/studio-service-worker-precache-plan";
import { verifyStaticCspContract } from "../verify-static-csp.mjs";

const root = new URL("../../", import.meta.url);
const bootstrapFiles = ["bootstrap-compat.js", "bootstrap-theme.js"];
const svgFiles = ["brand/production-os-hero.svg", "brand/production-os-workspace.svg"];
const files = [...bootstrapFiles, ...svgFiles];
let directory;
const original = {};
const compact = {};

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "bootstrap-assets-"));
  for (const file of files) {
    original[file] = await readFile(new URL(`apps/web/public/${file}`, root), "utf8");
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await writeFile(path.join(directory, file), original[file]);
  }
  await compactBootstrapAssets(directory);
  for (const file of files) compact[file] = await readFile(path.join(directory, file), "utf8");
});
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function compatResult(source, supported, delayed) {
  const dom = new JSDOM(delayed ? "<body></body>" : '<body><div id="root"></div></body>');
  const { window } = dom;
  const config = { retained: true };
  window.__zod_globalConfig = config;
  const createElement = window.document.createElement.bind(window.document);
  window.document.createElement = (tag) => {
    const element = createElement(tag);
    if (tag === "script" && supported) element.noModule = false;
    return element;
  };
  const context = { window, document: window.document, Promise, fetch() {}, Symbol, WebAssembly: supported ? {} : undefined };
  runInNewContext(source, context);
  if (delayed) window.document.body.innerHTML = '<div id="root"></div>';
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  runInNewContext(source, context);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  const result = { html: window.document.body.innerHTML, config: { ...config }, sameConfig: window.__zod_globalConfig === config };
  dom.window.close();
  return result;
}

function themeResult(source, state, pathname, dark, contrast, blocked) {
  const attributes = {};
  const style = {};
  const meta = {};
  runInNewContext(source, {
    localStorage: { getItem() { if (blocked) throw new Error("blocked"); return state; } },
    location: { pathname },
    window: { matchMedia: (query) => ({ matches: query.includes("color-scheme") ? dark : contrast }) },
    document: {
      documentElement: { setAttribute: (key, value) => { attributes[key] = value; }, style },
      querySelector: () => ({ setAttribute: (key, value) => { meta[key] = value; } }),
    },
  });
  return { attributes, style, meta };
}

describe("빌드 bootstrap 압축 계약", () => {
  it("원본과 경로를 유지하며 bootstrap JS만 총 2,000바이트 이상 줄이고 산출물 지문을 갱신한다", async () => {
    for (const file of files) {
      expect(await readFile(new URL(`apps/web/public/${file}`, root), "utf8")).toBe(original[file]);
      const hash = (value) => createHash("sha256").update(value).digest("hex");
      expect(hash(compact[file])).not.toBe(hash(original[file]));
    }
    const saved = bootstrapFiles.reduce((sum, file) => sum + Buffer.byteLength(original[file]) - Buffer.byteLength(compact[file]), 0);
    expect(saved).toBeGreaterThanOrEqual(2000);
  });

  it.each(svgFiles)("%s의 구조 공백 절감은 bootstrap JS 보증과 별도로 확인한다", (file) => {
    expect(Buffer.byteLength(compact[file])).toBeLessThan(Buffer.byteLength(original[file]));
  });

  it("precache 계획이 압축된 실제 바이트와 fingerprint를 사용한다", async () => {
    const config = await readFile(new URL("apps/web/vite.config.ts", root), "utf8");
    expect(config.indexOf("await compactBootstrapAssets(outDir)")).toBeLessThan(config.indexOf("const plan = planStudioServiceWorkerPrecache"));
    const assets = { "entry.js": "entry", ...compact };
    const plan = planStudioServiceWorkerPrecache({
      manifest: { "index.html": { file: "entry.js", isEntry: true } },
      appEntryKey: "index.html",
      staticCriticalUrls: files.map((file) => `/${file}`),
      sizeOf: (url) => Buffer.byteLength(assets[url.slice(1)]),
      fingerprintOf: (url) => createHash("sha256").update(assets[url.slice(1)]).digest("hex"),
    });
    expect(plan.criticalBytes).toBe(Object.values(assets).reduce((sum, value) => sum + Buffer.byteLength(value), 0));
    expect(plan.criticalFingerprints).toContain(`/bootstrap-compat.js:${createHash("sha256").update(compact[files[0]]).digest("hex")}`);
    expect(plan.violations).toEqual([]);
  });

  it("classic parser-blocking 로딩 순서, CSP hash, ES5 및 Zod 설정을 보존한다", async () => {
    const fixture = {
      html: await readFile(new URL("apps/web/index.html", root), "utf8"),
      responsePolicy: JSON.parse(await readFile(new URL("config/http-response-headers.json", root), "utf8")),
      bootstrapCompatSource: compact[files[0]],
    };
    expect(() => verifyStaticCspContract(fixture)).not.toThrow();
    expect(compact[files[0]]).not.toMatch(/`|=>/u);
  });

  it.each([[true, false], [true, true], [false, false], [false, true]])(
    "지원=%s 지연 DOM=%s의 구형 안내와 재실행 동작을 보존한다", (supported, delayed) => {
      expect(compatResult(compact[files[0]], supported, delayed)).toEqual(compatResult(original[files[0]], supported, delayed));
    },
  );

  it("모든 테마와 Studio 상속·시스템 대비·손상 저장소의 첫 페인트를 보존한다", () => {
    const themes = ["aurora", "blossom", "starlight", "dark", "light", "graphite", "midnight", "sepia", "contrast", "system"];
    const states = [null, "broken", ...themes.flatMap((preference) => ["inherit", ...themes].map((studioPreference) => JSON.stringify({ state: { preference, studioPreference } })))];
    for (const state of states) for (const pathname of ["/settings", "/studio/project/1"]) {
      for (const dark of [false, true]) for (const contrast of [false, true]) {
        const args = [state, pathname, dark, contrast, false];
        expect(themeResult(compact[files[1]], ...args)).toEqual(themeResult(original[files[1]], ...args));
      }
    }
    expect(themeResult(compact[files[1]], null, "/studio", false, false, true)).toEqual(themeResult(original[files[1]], null, "/studio", false, false, true));
  });
});
