import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { compactOfflineDrawingHtml } from "../../apps/web/config/compact-offline-drawing-html";

const code = "\nconst message = '복구 준비';\ndocument.body.dataset.ready = message;\n";
const hash = (value) => createHash("sha256").update(value).digest("base64");
const html = (body = code) => `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash(body)}'; connect-src 'none'"></head><body><script type="module">${body}</script></body></html>`;

describe("긴급 복구 HTML 압축의 CSP 경계", () => {
  it("같은 원본의 빌드는 재현 가능하며 재압축한 코드도 정확한 CSP를 갖는다", async () => {
    const result = await compactOfflineDrawingHtml(html());
    expect(await compactOfflineDrawingHtml(html())).toBe(result);
    for (const candidate of [result, await compactOfflineDrawingHtml(result)]) {
      const output = candidate.match(/<script type="module">([\s\S]*?)<\/script>/u)?.[1];
      expect(output).toBeDefined();
      expect(candidate).toContain(`script-src 'sha256-${hash(output)}'`);
      expect(candidate).not.toContain("unsafe-inline");
      expect(candidate).toContain("connect-src 'none'");
    }
  });

  it.each([
    ["다른 해시", html().replace(hash(code), hash("other"))],
    ["인라인 전체 허용", html().replace(`'sha256-${hash(code)}'`, "'unsafe-inline'")],
    ["복수 script-src", html().replace("connect-src", "script-src 'self'; connect-src")],
  ])("%s인 원본을 새 해시로 덮어 정상화하지 않는다", async (_name, source) => {
    await expect(compactOfflineDrawingHtml(source)).rejects.toThrow("기존 CSP 해시");
  });

  it.each([
    ["외부 모듈", html().replace('type="module"', 'type="module" src="/runtime.js"')],
    ["복수 모듈", html().replace("</body>", '<script type="module">void 0;</script></body>')],
    ["CSP 누락", html().replace(/<meta[^>]+>/u, "")],
    ["복수 CSP", html().replace("</head>", '<meta http-equiv="Content-Security-Policy" content="default-src none"></head>')],
  ])("%s 구조에서는 압축을 거부한다", async (_name, source) => {
    await expect(compactOfflineDrawingHtml(source)).rejects.toThrow("모듈 하나");
  });
});
