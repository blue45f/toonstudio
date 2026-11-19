import { createHash } from "node:crypto";

import { transformWithEsbuild } from "vite";

const scriptHash = (source: string): string =>
  `'sha256-${createHash("sha256").update(source).digest("base64")}'`;

/** 생성된 단일 파일 복구 도구의 모듈만 압축하고 해당 CSP 해시를 함께 갱신한다. */
export async function compactOfflineDrawingPortableHtml(source: string): Promise<string> {
  const script = /<script type="module">([\s\S]*?)<\/script>/u.exec(source);
  if (!script || source.match(/<script\b/giu)?.length !== 1) {
    throw new Error("긴급 복구 페이지는 단일 인라인 모듈이어야 합니다.");
  }
  const originalHash = scriptHash(script[1]);
  if (source.split(originalHash).length !== 2) {
    throw new Error("긴급 복구 페이지의 CSP 해시가 원본 모듈과 일치하지 않습니다.");
  }
  const result = await transformWithEsbuild(script[1], "offline-draw-portable.mjs", {
    loader: "js",
    format: "esm",
    target: "es2020",
    minifyWhitespace: true,
    charset: "utf8",
    legalComments: "inline",
    sourcemap: false,
  });
  if (/<\/script/iu.test(result.code)) {
    throw new Error("압축한 긴급 복구 모듈에 HTML 종료 구문이 포함됐습니다.");
  }
  return source
    .replace(script[0], `<script type="module">${result.code}</script>`)
    .replace(originalHash, scriptHash(result.code));
}
