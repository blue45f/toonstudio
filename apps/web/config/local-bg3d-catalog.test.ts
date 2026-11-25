import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveConfig } from "vite";
import { afterEach, expect, it } from "vitest";

import { localBg3dCatalogPlugin, readLocalBg3dCatalog } from "./local-bg3d-catalog";

const tempRoots: string[] = [];
afterEach(() => { for (const dir of tempRoots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function testFiles() {
  const dir = mkdtempSync(join(tmpdir(), "studio-local-catalog-"));
  tempRoots.push(dir);
  const repository = join(dir, "repo");
  mkdirSync(repository);
  return { repository, file: join(dir, "catalog.json") };
}
const example = {
  id: "test-shape", name: "테스트 도형", usage: "테스트", fileName: "sample.glb",
  hash: "sha256:" + "a".repeat(64), byteSize: 32, rightsNote: "테스트", attributionText: null,
  cameraPosition: [2, 2, 2], cameraTarget: [0, 0, 0], modelPosition: [0, 0, 0],
};

it("명시적인 로컬 개발 서버에만 목록 공급자를 등록한다", () => {
  const missing = "/nonexistent/local-test-catalog.json";
  expect(localBg3dCatalogPlugin({ command: "serve", mode: "development" }, undefined, ".")).toBeUndefined();
  expect(localBg3dCatalogPlugin({ command: "serve", mode: "production" }, missing, ".")).toBeUndefined();
  expect(localBg3dCatalogPlugin({ command: "serve", mode: "development", isPreview: true }, missing, ".")).toBeUndefined();
  for (const mode of ["development", "test", "production"]) {
    expect(localBg3dCatalogPlugin({ command: "build", mode }, missing, ".")).toBeUndefined();
  }
  expect(localBg3dCatalogPlugin({ command: "serve", mode: "development" }, missing, ".")?.enforce).toBe("pre");
});

it("저장소 외부의 JSON 장면 메타데이터만 개발 모듈로 읽는다", () => {
  const { repository, file } = testFiles();
  writeFileSync(file, JSON.stringify([example]));
  expect(readLocalBg3dCatalog(file, repository)).toContain(JSON.stringify([example]));
  const tracked = join(repository, "example.json");
  writeFileSync(tracked, JSON.stringify([example]));
  expect(() => readLocalBg3dCatalog(tracked, repository)).toThrow(/저장소 밖/u);
  const linked = join(repository, "..", "link.json");
  symlinkSync(tracked, linked);
  expect(() => readLocalBg3dCatalog(linked, repository)).toThrow(/저장소 밖/u);
  for (const rows of [[example, example], [{ ...example, fileName: "../sample.glb" }],
    [{ ...example, binaryPath: "/private/example.glb" }], [{ ...example, cameraTarget: [1, 2] }]]) {
    writeFileSync(file, JSON.stringify(rows));
    expect(() => readLocalBg3dCatalog(file, repository)).toThrow(/필드/u);
  }
});

it("외부에서 접속할 수 있는 개발 서버에서는 개인 목록을 열지 않는다", async () => {
  const { repository, file } = testFiles();
  const plugin = localBg3dCatalogPlugin({ command: "serve", mode: "development" }, file, repository);
  for (const host of [true, "0.0.0.0", "::"]) {
    await expect(resolveConfig({ configFile: false, server: { host }, plugins: [plugin] }, "serve"))
      .rejects.toThrow(/이 기기/u);
  }
  await expect(resolveConfig({ configFile: false, server: { host: "127.0.0.1" }, plugins: [plugin] }, "serve"))
    .resolves.toMatchObject({ server: { host: "127.0.0.1" } });
});
