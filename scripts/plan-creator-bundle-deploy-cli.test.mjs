import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { test as vitestTest } from "vitest";

import { fixtureLedger, ledgerEntry, selfContainedGlb } from "./lib/creator-bundle-pack-rights-test-support.mjs";
import {
  assetEntry,
  cliLedger,
  cliThemePacks,
  REAL_ALLOWED,
  REAL_HELD,
  SELF_CONTAINED,
  sha256Of,
  themePacksFor,
  withTempRoot,
  writeTree,
} from "./lib/plan-creator-bundle-deploy-test-support.mjs";
import { BUNDLE_V2_INDEX_KEY } from "./plan-creator-bundle-deploy.mjs";

// 배포 플래너 CLI(plan-creator-bundle-deploy.mjs)의 종료 코드·출력·쓰기·업로드 동작 테스트.
// 업로드 경로를 시험할 때도 PATH를 가짜 pnpm 한 개뿐인 폴더로 제한해 실제 pnpm·wrangler·R2에 닿을 수 없게 한다.
// 루트 `vitest run`(scripts/**/*.test.mjs 수집)과 `node --test` 양쪽에서 같은 파일이 돈다.
const test = process.env.VITEST ? vitestTest : nodeTest;

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "plan-creator-bundle-deploy.mjs");

test("CLI dry-run은 hold를 제외하고 sha256 키를 출력하며 아무것도 쓰지 않는다", () => {
  withTempRoot((root) => {
    const rel = `${REAL_ALLOWED.ingestPackIds[0]}/a.glb`;
    writeTree(root, { [rel]: SELF_CONTAINED });
    const themePacks = cliThemePacks([
      assetEntry("allowed-m001", 0, rel, SELF_CONTAINED),
      assetEntry("held-m001", 1, `${REAL_HELD.ingestPackIds[0]}/h1.glb`, selfContainedGlb("held")),
    ]);
    const themePacksPath = join(root, "theme-packs.json");
    const ledgerPath = join(root, "ledger.json");
    const outPath = join(root, "manifest-out.json");
    writeFileSync(themePacksPath, JSON.stringify(themePacks));
    writeFileSync(ledgerPath, JSON.stringify(cliLedger()));
    const result = spawnSync(process.execPath, [
      SCRIPT, "--dry-run", "--asset-root", root, "--theme-packs", themePacksPath,
      "--pack-rights", ledgerPath, "--out", outPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`assets/studio/bundle-v2/${sha256Of(SELF_CONTAINED)}\\.glb`));
    assert.match(result.stdout, /제외: Old Town — Courtyards — 에셋 1개 \(hold\)/);
    assert.match(result.stdout, /이 도구는 R2 객체를 지우지 않습니다/);
    assert.match(result.stdout, /dry-run: 매니페스트를 쓰지 않고 업로드도 하지 않았습니다/);
    assert.throws(() => readFileSync(outPath), /ENOENT/);
  });
});

test("CLI는 잘못된 원장이면 계획 단계 이전에 종료 코드 2로 닫는다", () => {
  withTempRoot((root) => {
    const themePacksPath = join(root, "theme-packs.json");
    const ledgerPath = join(root, "ledger.json");
    writeFileSync(themePacksPath, JSON.stringify(themePacksFor([])));
    writeFileSync(ledgerPath, JSON.stringify({ schema: "other" }));
    const result = spawnSync(process.execPath, [
      SCRIPT, "--dry-run", "--asset-root", root, "--theme-packs", themePacksPath, "--pack-rights", ledgerPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /권리 원장이 올바르지 않습니다/);
  });
});

test("CLI는 pnpm run 형태의 맨 -- 를 건너뛰고 옵션을 읽는다", () => {
  withTempRoot((root) => {
    const rel = `${REAL_ALLOWED.ingestPackIds[0]}/a.glb`;
    writeTree(root, { [rel]: SELF_CONTAINED });
    const themePacksPath = join(root, "theme-packs.json");
    const ledgerPath = join(root, "ledger.json");
    writeFileSync(themePacksPath, JSON.stringify(cliThemePacks([assetEntry("allowed-m001", 0, rel, SELF_CONTAINED)])));
    writeFileSync(ledgerPath, JSON.stringify(cliLedger()));
    const result = spawnSync(process.execPath, [
      SCRIPT, "--dry-run", "--", "--asset-root", root, "--theme-packs", themePacksPath, "--pack-rights", ledgerPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`assets/studio/bundle-v2/${sha256Of(SELF_CONTAINED)}\\.glb`));
  });
});

/**
 * 가짜 pnpm 한 개만 든 폴더를 PATH의 전부로 쓴다 — 어떤 경로로도 실제 pnpm·wrangler에 닿지 못한다.
 * 호출 인자는 로그에 한 줄씩 남고, exitCode로 업로드 실패를 흉내 낸다.
 */
function fakePnpm(root, exitCode = 0) {
  const bin = join(root, "fake-bin");
  const log = join(root, "pnpm-calls.log");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "pnpm"), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexit ${exitCode}\n`, { mode: 0o755 });
  return {
    env: { PATH: bin, HOME: root },
    calls: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []),
  };
}

function runPlanner(root, mode, { themePacks, ledger, pnpm }) {
  const themePacksPath = join(root, "theme-packs.json");
  const ledgerPath = join(root, "ledger.json");
  const outPath = join(root, "manifest-out.json");
  writeFileSync(themePacksPath, JSON.stringify(themePacks));
  writeFileSync(ledgerPath, JSON.stringify(ledger));
  const result = spawnSync(process.execPath, [
    SCRIPT, mode, "--asset-root", root, "--theme-packs", themePacksPath, "--pack-rights", ledgerPath, "--out", outPath,
  ], { encoding: "utf8", env: pnpm.env });
  return { result, outPath };
}

test("CLI --write·--production은 열린 팩이 없으면 종료 코드 1로 거부하고 매니페스트도 업로드도 만들지 않는다", () => {
  for (const mode of ["--write", "--production"]) {
    withTempRoot((root) => {
      const allHold = fixtureLedger([
        ledgerEntry({ ...REAL_ALLOWED, serve: "hold" }),
        ledgerEntry({ ...REAL_HELD, serve: "hold" }),
      ]);
      const rel = `${REAL_ALLOWED.ingestPackIds[0]}/a.glb`;
      writeTree(root, { [rel]: SELF_CONTAINED });
      const themePacks = themePacksFor([assetEntry("allowed-m001", 0, rel, SELF_CONTAINED)], [REAL_ALLOWED, REAL_HELD], allHold);
      const pnpm = fakePnpm(root);
      const { result, outPath } = runPlanner(root, mode, { themePacks, ledger: allHold, pnpm });
      assert.equal(result.status, 1, `${mode}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /배포할 GLB가 없습니다/);
      assert.equal(existsSync(outPath), false, `${mode}: 거부했는데 매니페스트가 써졌습니다.`);
      assert.deepEqual(pnpm.calls(), [], `${mode}: 거부했는데 업로드를 시도했습니다.`);
    });
  }
});

test("CLI --production은 theme-packs가 원장과 어긋나 있으면 거부하고, 같은 입력의 --write는 허용 팩의 매니페스트만 쓴다", () => {
  withTempRoot((root) => {
    const rel = `${REAL_ALLOWED.ingestPackIds[0]}/a.glb`;
    writeTree(root, { [rel]: SELF_CONTAINED }); // hold 팩의 실물은 만들지 않는다 — 제외된 팩은 읽지도 않는다.
    const themePacks = cliThemePacks([
      assetEntry("allowed-m001", 0, rel, SELF_CONTAINED),
      assetEntry("held-m001", 1, `${REAL_HELD.ingestPackIds[0]}/h1.glb`, selfContainedGlb("held")),
    ]);
    const pnpm = fakePnpm(root);
    const production = runPlanner(root, "--production", { themePacks, ledger: cliLedger(), pnpm });
    assert.equal(production.result.status, 1, production.result.stderr);
    assert.match(production.result.stderr, /--production 거부: theme-packs\.json이 권리 원장과 어긋나/);
    assert.equal(existsSync(production.outPath), false);
    assert.deepEqual(pnpm.calls(), []);

    const write = runPlanner(root, "--write", { themePacks, ledger: cliLedger(), pnpm });
    assert.equal(write.result.status, 0, write.result.stderr);
    const manifest = JSON.parse(readFileSync(write.outPath, "utf8"));
    assert.deepEqual(manifest.objects.map((object) => object.key), [
      `assets/studio/bundle-v2/${sha256Of(SELF_CONTAINED)}.glb`,
      BUNDLE_V2_INDEX_KEY,
    ]);
    assert.deepEqual(pnpm.calls(), [], "--write는 업로드하지 않는다");
  });
});

test("CLI --production은 GLB를 먼저, 배포 인덱스를 마지막에 올리고 업로드가 실패하면 거기서 멈춘다 (가짜 pnpm)", () => {
  const prepare = (root) => {
    const rel = `${REAL_ALLOWED.ingestPackIds[0]}/a.glb`;
    writeTree(root, { [rel]: SELF_CONTAINED });
    return cliThemePacks([assetEntry("allowed-m001", 0, rel, SELF_CONTAINED)]);
  };
  const glbKey = `assets/studio/bundle-v2/${sha256Of(SELF_CONTAINED)}.glb`;
  withTempRoot((root) => {
    const pnpm = fakePnpm(root);
    const { result } = runPlanner(root, "--production", { themePacks: prepare(root), ledger: cliLedger(), pnpm });
    assert.equal(result.status, 0, result.stderr);
    const calls = pnpm.calls();
    assert.equal(calls.length, 2);
    assert.match(calls[0], new RegExp(`^exec wrangler r2 object put \\S+/${glbKey.replaceAll(".", "\\.")} .*--remote --force$`));
    assert.ok(calls[1].includes(`/${BUNDLE_V2_INDEX_KEY} `), calls[1]);
    assert.match(result.stdout, /업로드 완료/);
  });
  withTempRoot((root) => {
    const pnpm = fakePnpm(root, 1);
    const { result } = runPlanner(root, "--production", { themePacks: prepare(root), ledger: cliLedger(), pnpm });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`업로드 실패: ${glbKey.replaceAll(".", "\\.")} \\(0/2 완료\\)`));
    assert.equal(pnpm.calls().length, 1, "첫 객체가 실패하면 배포 인덱스까지 가지 않는다");
  });
});
