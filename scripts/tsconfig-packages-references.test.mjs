import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));
}

test("tsconfig.packages.json이 독립 리프 패키지 6개를 프로젝트 참조로 구성한다", () => {
  const solution = readJson("tsconfig.packages.json");
  assert.deepEqual(solution.files, []);
  assert.ok(Array.isArray(solution.references) && solution.references.length >= 6);

  const expectedLeafPaths = [
    "./packages/core",
    "./packages/play-core",
    "./packages/product-tour-film",
    "./packages/studio-command-registry",
    "./packages/studio-engine-thorvg",
    "./packages/studio-project-model",
  ];
  const actualPaths = solution.references.map((ref) => ref.path);
  for (const expected of expectedLeafPaths) {
    assert.ok(actualPaths.includes(expected), `누락된 리프 패키지 참조: ${expected}`);
  }
});

test("참조된 모든 리프 패키지는 composite·declaration·emitDeclarationOnly·incremental과 격리 캐시 출력 경로를 지킨다", () => {
  const solution = readJson("tsconfig.packages.json");

  for (const ref of solution.references) {
    const pkgRel = ref.path.replace(/^\.\//u, "");
    const pkgName = pkgRel.split("/").at(-1);
    const tsConfig = readJson(`${pkgRel}/tsconfig.json`);
    const pkgManifest = readJson(`${pkgRel}/package.json`);
    const opts = tsConfig.compilerOptions ?? {};

    assert.equal(opts.composite, true, `${pkgRel}: composite=true 필요`);
    assert.equal(opts.declaration, true, `${pkgRel}: declaration=true 필요`);
    assert.equal(opts.emitDeclarationOnly, true, `${pkgRel}: emitDeclarationOnly=true 필요`);
    assert.equal(opts.incremental, true, `${pkgRel}: incremental=true 필요`);
    assert.notEqual(opts.noEmit, true, `${pkgRel}: composite 프로젝트는 noEmit=true 금지`);
    assert.equal(opts.rootDir, "src", `${pkgRel}: rootDir은 src여야 함`);
    assert.equal(
      opts.outDir,
      `../../node_modules/.cache/ts-project-refs/${pkgName}`,
      `${pkgRel}: outDir은 소스 트리를 오염시키지 않는 node_modules/.cache 하위여야 함`,
    );
    assert.equal(
      opts.tsBuildInfoFile,
      `../../node_modules/.cache/ts-project-refs/${pkgName}/tsconfig.tsbuildinfo`,
      `${pkgRel}: tsBuildInfoFile은 격리 캐시 하위여야 함`,
    );

    // 독립 리프 패키지는 다른 @toonstudio/* 워크스페이스 의존성이 없어야 한다.
    const deps = {
      ...(pkgManifest.dependencies ?? {}),
      ...(pkgManifest.peerDependencies ?? {}),
    };
    const workspaceDeps = Object.entries(deps).filter(
      ([name, version]) => name.startsWith("@toonstudio/") || String(version).startsWith("workspace:"),
    );
    assert.deepEqual(
      workspaceDeps,
      [],
      `${pkgRel}: 독립 리프 패키지에 워크스페이스 의존성이 존재함: ${JSON.stringify(workspaceDeps)}`,
    );
  }
});

test("루트 tsconfig.json은 typecheck-shards 호환을 위해 noEmit=true·incremental=false 계약을 유지한다", () => {
  const rootTs = readJson("tsconfig.json");
  assert.equal(rootTs.compilerOptions?.noEmit, true);
  assert.equal(rootTs.compilerOptions?.incremental, false);
  assert.notEqual(rootTs.compilerOptions?.composite, true);
});

test("tsc -b tsconfig.packages.json 증분 빌드가 정상 종료하고 리프 패키지 tsbuildinfo 캐시를 생성한다", () => {
  const tscBin = join(ROOT, "node_modules", "typescript", "bin", "tsc");
  const result = spawnSync(process.execPath, [tscBin, "-b", "tsconfig.packages.json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const solution = readJson("tsconfig.packages.json");
  for (const ref of solution.references) {
    const pkgName = ref.path.replace(/^\.\//u, "").split("/").at(-1);
    const buildInfoPath = join(
      ROOT,
      "node_modules",
      ".cache",
      "ts-project-refs",
      pkgName,
      "tsconfig.tsbuildinfo",
    );
    assert.ok(existsSync(buildInfoPath), `tsbuildinfo 누락: ${buildInfoPath}`);
  }
});
