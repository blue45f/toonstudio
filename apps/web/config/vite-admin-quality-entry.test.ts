import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { build } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { ADMIN_QUALITY_BASE, adminQualityEntryPlugin } from "./vite-admin-quality-entry";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "toonstudio-admin-entry-"));
  temporaryDirectories.push(repositoryRoot);
  const webRoot = path.join(repositoryRoot, "apps/web");
  const adminRoot = path.join(repositoryRoot, "apps/admin-web");
  await mkdir(webRoot, { recursive: true });
  await mkdir(adminRoot, { recursive: true });
  await writeFile(path.join(webRoot, "index.html"), '<!doctype html><title>Web fixture</title><script type="module" src="./main.js"></script>');
  await writeFile(path.join(webRoot, "main.js"), 'document.body.dataset.surface="web";');
  await writeFile(path.join(adminRoot, "index.html"), '<!doctype html><title>Admin fixture</title><script type="module" src="./main.js"></script>');
  await writeFile(path.join(adminRoot, "main.js"), 'document.body.dataset.surface="admin";');
  await writeFile(path.join(adminRoot, "vite.config.ts"), `export default { root: ${JSON.stringify(adminRoot)}, logLevel: "silent" };`);
  return { repositoryRoot, webRoot };
}

describe("관리자 검증 보드의 독립 빌드 조립", () => {
  it("실제 하위 빌드를 사용자 지정 출력 경로에 넣고 Web 문서·manifest를 보존한다", async () => {
    const { repositoryRoot, webRoot } = await fixture();
    const outDir = path.join(repositoryRoot, ".qa/preview/dist");
    await build({
      configFile: false,
      root: webRoot,
      logLevel: "silent",
      plugins: [adminQualityEntryPlugin({ repositoryRoot })],
      build: { outDir, manifest: true },
    });

    const webHtml = await readFile(path.join(outDir, "index.html"), "utf8");
    const adminHtml = await readFile(path.join(outDir, "admin/platform/quality/index.html"), "utf8");
    const manifest = JSON.parse(await readFile(path.join(outDir, ".vite/manifest.json"), "utf8")) as Record<string, { src?: string }>;
    expect(webHtml).toContain("Web fixture");
    expect(webHtml).not.toContain(ADMIN_QUALITY_BASE);
    expect(adminHtml).toContain("Admin fixture");
    expect(adminHtml).toMatch(/src="\/admin\/platform\/quality\/assets\//u);
    expect(Object.keys(manifest)).toEqual(["index.html"]);
    expect(manifest["index.html"].src).toBe("index.html");
    await expect(readFile(path.join(outDir, "admin/platform/quality/.vite/manifest.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("관리자 빌드가 실패하면 Web 빌드도 실패시켜 누락된 진입점을 성공으로 보고하지 않는다", async () => {
    const { repositoryRoot, webRoot } = await fixture();
    await expect(build({
      configFile: false,
      root: webRoot,
      logLevel: "silent",
      plugins: [adminQualityEntryPlugin({ repositoryRoot, buildAdmin: async () => { throw new Error("관리자 빌드 실패 fixture"); } })],
      build: { outDir: path.join(repositoryRoot, "dist"), manifest: true },
    })).rejects.toThrow("관리자 빌드 실패 fixture");
  });
});
