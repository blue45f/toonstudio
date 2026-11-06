import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { transformWithEsbuild } from "vite";

import { compactSvgStructureWhitespace } from "./compact-svg-structure";

const BOOTSTRAP_FILES = ["bootstrap-compat.js", "bootstrap-theme.js"] as const;
const OFFLINE_DRAW_JS_FILES = [
  "offline-draw/model.js",
  "offline-draw/storage.js",
  "offline-draw/editor.js",
  "offline-draw/cache.js",
  "offline-draw/bootstrap.js",
] as const;
const STRUCTURAL_SVG_FILES = ["brand/production-os-hero.svg", "brand/production-os-workspace.svg"] as const;

/** 공개 원본은 유지하고, precache 크기·지문 계산 전에 빌드 복사본만 압축한다. */
export async function compactBootstrapAssets(outDir: string): Promise<void> {
  const outputs = await Promise.all(BOOTSTRAP_FILES.map(async (filename) => {
    const source = await readFile(path.join(outDir, filename), "utf8");
    // Oxc의 출력은 문자열을 template literal로 바꿀 수 있어 구형 브라우저 안내에 부적합하다.
    // 이 두 classic script에만 기존 Vite의 ES5 지원 변환기를 사용한다.
    const result = await transformWithEsbuild(source, filename, {
      target: "es5",
      minify: true,
      legalComments: "inline",
      sourcemap: false,
    });
    return { filename, code: result.code };
  }));
  for (const { filename, code } of outputs) {
    await writeFile(path.join(outDir, filename), code);
  }
  const presentOfflineDrawFiles = OFFLINE_DRAW_JS_FILES.filter((filename) =>
    existsSync(path.join(outDir, filename)),
  );
  const offlineDrawOutputs = await Promise.all(presentOfflineDrawFiles.map(async (filename) => {
    const source = await readFile(path.join(outDir, filename), "utf8");
    const result = await transformWithEsbuild(source, filename, {
      target: "es2020",
      minify: true,
      legalComments: "inline",
      sourcemap: false,
    });
    return { filename, code: result.code };
  }));
  for (const { filename, code } of offlineDrawOutputs) {
    await writeFile(path.join(outDir, filename), code);
  }
  for (const filename of STRUCTURAL_SVG_FILES) {
    const source = await readFile(path.join(outDir, filename), "utf8");
    await writeFile(path.join(outDir, filename), compactSvgStructureWhitespace(source));
  }
}
