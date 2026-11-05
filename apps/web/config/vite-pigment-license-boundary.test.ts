import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { build } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { pigmentLicenseBoundaryPlugin } from "./vite-pigment-license-boundary";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function bundle(source: string, external: string[] = []) {
  const root = await mkdtemp(path.join(tmpdir(), "toonstudio-pigment-boundary-"));
  temporary.push(root);
  await writeFile(path.join(root, "entry.ts"), source);
  await mkdir(path.join(root, "pigment"));
  await writeFile(path.join(root, "pigment/latent-pigment-fixture.ts"), "export const provider = 'toonstudio-latent-pigment-v1';");
  const operation = build({
    configFile: false, root, logLevel: "silent", plugins: [pigmentLicenseBoundaryPlugin()],
    build: { outDir: "dist", rolldownOptions: { external }, lib: { entry: path.join(root, "entry.ts"), formats: ["es"] } },
  });
  return { root, operation };
}

describe("외부 안료의 실제 번들 경계", () => {
  it.each([
    'import "mixbox";',
    'export const load = () => import("mixbox");',
    'import "/node_modules/.pnpm/mixbox@2.0.0/node_modules/mixbox/mixbox.esm.js";',
  ])("실제 번들러에서 외부 정적·지연·직접 경로를 거부한다: %s", async (source) => {
    const { operation } = await bundle(source);
    await expect(operation).rejects.toThrow("외부 Mixbox 패키지");
  });

  it("자체 모듈과 저장 호환 문자열을 허용하고 모듈 감사 결과를 남긴다", async () => {
    const { root, operation } = await bundle('export { provider } from "./pigment/latent-pigment-fixture"; export const legacyNode = "pigment-mixbox";');
    await operation;
    const report = JSON.parse(await readFile(path.join(root, "dist/legal/pigment-bundle-audit.json"), "utf8"));
    expect(report.forbiddenModules).toEqual([]);
    expect(report.checkedModules).toBeGreaterThanOrEqual(2);
    expect(report.internalPigmentChunks).toHaveLength(1);
  });

  it("외부화 설정으로 resolve 단계를 건너뛴 패키지도 최종 청크에서 거부한다", async () => {
    const { operation } = await bundle('export const load = () => import("mixbox");', ["mixbox"]);
    await expect(operation).rejects.toThrow("외부 Mixbox 모듈");
  });
});
