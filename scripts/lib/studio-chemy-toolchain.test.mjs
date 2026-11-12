import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { loadStudioChemyBrowserToolchain } from "./studio-chemy-toolchain.mjs";

const manifest = JSON.parse(readFileSync(new URL("../fixtures/studio-chemy-v1-pressure/original-source-manifest.json", import.meta.url), "utf8"));

function fixture(t, playwrightVersion = manifest.dependencies.playwright.version) {
  const directory = mkdtempSync(join(tmpdir(), "toon-chemy-toolchain-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [name, version, source] of [
    ["playwright", playwrightVersion, 'export const chromium = { marker: "isolated-frozen-browser", launch() {} };'],
    ["vite", manifest.dependencies.vite.version, 'export function createServer() { return "isolated-frozen-server"; }'],
  ]) {
    const moduleDirectory = join(directory, "node_modules", name);
    mkdirSync(moduleDirectory, { recursive: true });
    writeFileSync(join(moduleDirectory, "package.json"), JSON.stringify({ name, version, type: "module", exports: { ".": "./index.mjs", "./package.json": "./package.json" } }));
    writeFileSync(join(moduleDirectory, "index.mjs"), source);
  }
  return directory;
}

test("제품 설치와 구분한 별도 경로의 고정 Playwright·Vite를 함께 선택한다", async (t) => {
  const selected = await loadStudioChemyBrowserToolchain(fixture(t));
  assert.equal(selected.chromium.marker, "isolated-frozen-browser");
  assert.equal(selected.createServer(), "isolated-frozen-server");
});

test("일반 브라우저 패키지로 올라가면 고정 골든 실행 전에 거부한다", async (t) => {
  await assert.rejects(loadStudioChemyBrowserToolchain(fixture(t, "1.65.0")), /playwright 1\.64\.1.*실제 1\.65\.0/u);
});

test("CommonJS Playwright의 기본 export에서도 Chromium API를 고른다", async (t) => {
  const directory = fixture(t);
  const moduleDirectory = join(directory, "node_modules/playwright");
  const metadata = JSON.parse(readFileSync(join(moduleDirectory, "package.json"), "utf8"));
  writeFileSync(join(moduleDirectory, "package.json"), JSON.stringify({ ...metadata, exports: { ".": "./index.cjs", "./package.json": "./package.json" } }));
  writeFileSync(join(moduleDirectory, "index.cjs"), 'module.exports = { chromium: { marker: "commonjs-frozen-browser", launch() {} } };');
  assert.equal((await loadStudioChemyBrowserToolchain(directory)).chromium.marker, "commonjs-frozen-browser");
});

test("고정 Vite 버전도 브라우저와 별도로 검증한다", async (t) => {
  const directory = fixture(t);
  const packageFile = join(directory, "node_modules/vite/package.json");
  const metadata = JSON.parse(readFileSync(packageFile, "utf8"));
  writeFileSync(packageFile, JSON.stringify({ ...metadata, version: "8.3.6" }));
  await assert.rejects(loadStudioChemyBrowserToolchain(directory), /vite 8\.3\.4.*실제 8\.3\.6/u);
});

test("CI의 별도 설치도 고정 원래 manifest의 모든 도구 버전을 따른다", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/studio-material-morphology.yml", import.meta.url), "utf8");
  for (const name of ["playwright", "vite", "spectral.js", "colormix"]) {
    assert.ok(workflow.includes(`${name}@${manifest.dependencies[name].version}`));
  }
  assert.match(workflow, /TOONSPECTRUM_CHEMY_TOOLCHAIN_DIR: \$\{\{ runner\.temp \}\}\/studio-chemy-toolchain/u);
  assert.ok(workflow.includes('node "$TOONSPECTRUM_CHEMY_TOOLCHAIN_DIR/node_modules/playwright/cli.js" install --with-deps chromium'));
});
