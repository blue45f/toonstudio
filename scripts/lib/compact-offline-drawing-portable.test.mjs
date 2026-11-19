import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { compactOfflineDrawingPortableHtml } from "../../apps/web/config/compact-offline-drawing-portable";

const sourceUrl = new URL("../../apps/web/public/offline-draw/portable.html", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const hash = (script) => `'sha256-${createHash("sha256").update(script).digest("base64")}'`;

describe("단일 파일 긴급 복구 도구의 빌드 압축", () => {
  it("모듈과 일치하는 CSP 해시를 유지하고 문서·도구·스타일은 그대로 보존한다", async () => {
    const compact = await compactOfflineDrawingPortableHtml(source);
    const before = new JSDOM(source);
    const after = new JSDOM(compact);
    try {
      for (const dom of [before, after]) {
        const scripts = dom.window.document.querySelectorAll("script");
        expect(scripts).toHaveLength(1);
        expect(scripts[0].type).toBe("module");
        expect(scripts[0].hasAttribute("src")).toBe(false);
        const csp = dom.window.document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        const policy = csp.getAttribute("content");
        const scriptHash = hash(scripts[0].textContent);
        expect(policy).toContain(`script-src ${scriptHash};`);
        expect(policy).toContain("connect-src 'none'");
        csp.setAttribute("content", policy.replace(scriptHash, "'sha256-SCRIPT_HASH'"));
        scripts[0].textContent = "SCRIPT_BODY";
      }
      expect(after.serialize()).toBe(before.serialize());
      expect(Buffer.byteLength(source) - Buffer.byteLength(compact)).toBeGreaterThan(4096);
      expect(await compactOfflineDrawingPortableHtml(compact)).toBe(compact);
      expect(await readFile(sourceUrl, "utf8")).toBe(source);
    } finally {
      before.window.close();
      after.window.close();
    }
  });

  it("모듈 내용과 맞지 않는 해시를 덮어써 통과시키지 않는다", async () => {
    await expect(compactOfflineDrawingPortableHtml(source.replace("DOCUMENT_VERSION = 1", "DOCUMENT_VERSION = 2")))
      .rejects.toThrow("CSP 해시가 원본 모듈과 일치하지 않습니다");
  });

  it("새 스크립트나 외부 모듈이 추가된 다른 템플릿은 자동 변환하지 않는다", async () => {
    await expect(compactOfflineDrawingPortableHtml(source.replace("</body>", '<script src="/other.js"></script></body>')))
      .rejects.toThrow("단일 인라인 모듈이어야");
    await expect(compactOfflineDrawingPortableHtml(source.replace('<script type="module">', '<script type="module" src="/other.js">')))
      .rejects.toThrow("단일 인라인 모듈이어야");
  });
});
