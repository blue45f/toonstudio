import { createHash } from "node:crypto";

import { transformWithEsbuild } from "vite";

const scriptHash = (source: string): string => createHash("sha256").update(source).digest("base64");

/** 독립 복구 HTML의 모듈만 압축하고, 동일 코드만 허용하도록 기존 CSP 해시를 교체한다. */
export async function compactOfflineDrawingHtml(source: string): Promise<string> {
  const scripts = [...source.matchAll(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/giu)];
  const policies = [...source.matchAll(/(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/giu)];
  const script = scripts[0];
  const policy = policies[0];
  if (scripts.length !== 1 || !script || !/^<script\s+type=["']module["']\s*>$/iu.test(script[1] ?? "")
    || policies.length !== 1 || !policy) {
    throw new Error("긴급 복구 HTML은 CSP 하나와 외부 의존성이 없는 모듈 하나를 포함해야 합니다.");
  }
  const originalCode = script[2] ?? "";
  const originalPolicy = policy[2] ?? "";
  const originalHash = scriptHash(originalCode);
  const scriptDirectives = originalPolicy.split(";").map((entry) => entry.trim()).filter((entry) => /^script-src(?:\s|$)/u.test(entry));
  if (scriptDirectives.length !== 1 || scriptDirectives[0] !== `script-src 'sha256-${originalHash}'`) {
    throw new Error("긴급 복구 HTML의 기존 CSP 해시가 실행 코드와 일치하지 않습니다.");
  }
  const { code } = await transformWithEsbuild(originalCode, "offline-draw/portable.js", {
    loader: "js",
    format: "esm",
    target: "es2020",
    minify: true,
    legalComments: "inline",
    sourcemap: false,
  });
  const compactPolicy = originalPolicy.replace(`'sha256-${originalHash}'`, `'sha256-${scriptHash(code)}'`);
  return source.replace(script[0], () => `${script[1]}${code}${script[3]}`)
    .replace(policy[0], () => `${policy[1]}${compactPolicy}${policy[3]}`);
}
