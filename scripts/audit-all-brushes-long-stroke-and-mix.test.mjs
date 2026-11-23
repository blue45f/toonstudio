import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRasterCanvas2D,
  parseCliArgs,
  runLongStrokeAndMixAudit,
} from "./audit-all-brushes-long-stroke-and-mix.mjs";

test("parseCliArgs가 기본값과 모든 옵션을 정확히 파싱하고 미지 인자를 거부한다", () => {
  assert.deepEqual(parseCliArgs([]), {
    check: false,
    help: false,
    renderSheetsDir: null,
    strokeLengthPx: 4000,
    minCacheHitRate: 0.9,
  });
  assert.deepEqual(
    parseCliArgs(["--check", "--render-sheets", "/tmp/out", "--stroke-length", "3200", "--min-hit-rate", "0.92"]),
    {
      check: true,
      help: false,
      renderSheetsDir: "/tmp/out",
      strokeLengthPx: 3200,
      minCacheHitRate: 0.92,
    },
  );
  assert.throws(() => parseCliArgs(["--render-sheets"]), /값이 필요/u);
  assert.throws(() => parseCliArgs(["--unknown-flag"]), /알 수 없는 인자/u);
});

test("createRasterCanvas2D가 ImageData 굽기와 쌍선형 drawImage 스케일 합성을 정확히 수행한다", () => {
  const tip = createRasterCanvas2D(8, 8, null);
  const img = tip.ctx.createImageData(8, 8);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 200;
    img.data[i + 1] = 40;
    img.data[i + 2] = 20;
    img.data[i + 3] = 255;
  }
  tip.ctx.putImageData(img, 0, 0);

  const dst = createRasterCanvas2D(32, 32, [255, 255, 255]);
  dst.ctx.globalAlpha = 0.5;
  dst.ctx.drawImage(tip.canvas, 8, 8, 16, 16);
  const centerIdx = (16 * 32 + 16) * 4;
  assert.ok(dst.rgba[centerIdx] < 240 && dst.rgba[centerIdx] > 210);
  assert.ok(dst.rgba[centerIdx + 1] < 180);
  assert.equal(dst.stats.drawImageCalls, 1);
});

test("runLongStrokeAndMixAudit가 전 브러시 70종(코어 10 + 마스터 60)·혼합 4시나리오·시각 PNG 2장을 통과 검증한다", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "toonstudio-brush-mix-audit-"));
  try {
    const report = await runLongStrokeAndMixAudit({
      strokeLengthPx: 3200,
      minCacheHitRate: 0.9,
      renderSheetsDir: tmpDir,
    });
    assert.equal(report.passed, true, JSON.stringify(report.summary));
    assert.equal(report.summary.coreStampCount, 10);
    assert.equal(report.summary.globalMasterCount, 60);
    assert.equal(report.summary.mixedScenarioCount, 4);
    assert.equal(report.summary.coreCliffCount, 0);
    assert.equal(report.summary.coreLowHitCount, 0);
    assert.equal(report.summary.coreThrashCount, 0);
    assert.equal(report.summary.pencilCachedOk, true);
    assert.equal(report.summary.gmCliffCount, 0);
    assert.equal(report.summary.gmEmptyCount, 0);
    assert.equal(report.summary.mixFailedCount, 0);
    assert.ok(report.summary.minCoreCacheHitRate >= 0.9);
    assert.equal(report.renderedSheets.length, 2);

    for (const sheetPath of report.renderedSheets) {
      const bytes = fs.readFileSync(sheetPath);
      // PNG 시그니처(89 50 4E 47 0D 0A 1A 0A) 및 충분한 픽셀 엔트로피 확인
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.ok(bytes.length > 8_000, `${sheetPath} too small: ${bytes.length}B`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
