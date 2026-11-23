import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  encodeRgbPng,
  parseCliArgs,
  runFullBrushCatalogAuditCli,
} from "./audit-full-brush-catalog-uniqueness-and-naming.mjs";

const SCRIPT_PATH = fileURLToPath(
  new URL("./audit-full-brush-catalog-uniqueness-and-naming.mjs", import.meta.url),
);

test("parseCliArgs는 --check/--json/--no-png/--out-png 옵션을 정확히 파싱하고 잘못된 인자를 거부한다", () => {
  const parsed = parseCliArgs(["--check", "--json", "--no-png"]);
  assert.equal(parsed.check, true);
  assert.equal(parsed.json, true);
  assert.equal(parsed.noPng, true);

  const withOut = parseCliArgs(["--out-png", "tmp/sheet.png"]);
  assert.ok(withOut.outPng.endsWith(path.join("tmp", "sheet.png")));

  assert.throws(() => parseCliArgs(["--unknown-flag"]), /알 수 없는 옵션/u);
  assert.throws(() => parseCliArgs(["--out-png"]), /경로가 필요합니다/u);
});

test("encodeRgbPng는 유효한 PNG 시그니처와 IHDR 크기를 기록한다", () => {
  const rgb = new Uint8Array(8 * 4 * 3).fill(128);
  const png = encodeRgbPng(8, 4, rgb);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(png.readUInt32BE(16), 8);
  assert.equal(png.readUInt32BE(20), 4);
});

test("runFullBrushCatalogAuditCli는 194종 전수 감사와 고해상도 12대 매체 PNG 시트를 정상 생성한다", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toonstudio-brush-audit-"));
  const outPng = path.join(tempDir, "parity-sheet.png");
  try {
    const result = await runFullBrushCatalogAuditCli(["--check", "--out-png", outPng]);
    assert.equal(result.ok, true);
    assert.equal(result.totalBrushes, 194);
    assert.ok(result.totalBrushes > 100);
    assert.equal(Object.keys(result.categoryDistribution).length, 12);
    for (const [cat, count] of Object.entries(result.categoryDistribution)) {
      assert.ok(count > 0, `매체 카테고리 누락: ${cat}`);
    }
    assert.equal(result.namingParityRate01, 1);
    assert.equal(result.alignedCount, 194);
    assert.equal(result.mismatchCount, 0);
    assert.ok(result.duplicatePairCount > 0);
    assert.ok(result.duplicateClusterCount > 0);
    assert.equal(result.strategySeparation.allMutuallyDistinct, true);
    assert.equal(result.pngPath, outPng);
    assert.ok(result.pngBytes > 40_000);

    const pngBytes = fs.readFileSync(outPng);
    assert.deepEqual([...pngBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(pngBytes.readUInt32BE(16), 1660);
    assert.equal(pngBytes.readUInt32BE(20), 1546);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CLI 프로세스 --check --json --no-png가 종료 코드 0과 100% 정합 JSON 보고서를 출력한다", () => {
  const child = spawnSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", SCRIPT_PATH, "--check", "--json", "--no-png"],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  assert.equal(child.status, 0, child.stderr);
  const parsed = JSON.parse(child.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.totalBrushes, 194);
  assert.equal(parsed.namingParityRate01, 1);
  assert.equal(parsed.alignedCount, 194);
  assert.equal(parsed.mismatchCount, 0);
  assert.equal(parsed.pngPath, null);
  assert.deepEqual(parsed.topMismatches, []);
});
