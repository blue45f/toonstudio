/**
 * scripts/audit-brush-filter-visual-uniqueness.mjs 단위·통합 검증 테스트.
 *
 * - CLI 인자 파싱 · 소프트웨어 2D 래스터라이저 · 순수 Node PNG 인코더 검증
 * - 60종 브러시(1,770쌍) + 36종 필터(630쌍) 전수 변별력 통과 및 컨택트시트 생성 검증
 * - `--check` 실패 시 한글 진단 메시지와 non-zero 종료 코드 검증
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeNormalizedRgbaRmse,
  createSoftwareCanvas2D,
  encodeRgbaToPng,
  parseCliArgs,
  runBrushFilterVisualAudit,
} from "./audit-brush-filter-visual-uniqueness.mjs";

const { describe, it } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

const SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "audit-brush-filter-visual-uniqueness.mjs",
);
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe("audit-brush-filter-visual-uniqueness 단위 계약", () => {
  it("parseCliArgs가 기본값·옵션·오류를 정확히 처리한다", () => {
    const defaults = parseCliArgs([]);
    assert.equal(defaults.check, false);
    assert.equal(defaults.renderSheetsDir, null);
    assert.equal(defaults.brushRmseThreshold, 0.035);
    assert.equal(defaults.sameInkRmseThreshold, 0.035);
    assert.equal(defaults.filterRmseThreshold, 0.035);

    const parsed = parseCliArgs([
      "--check",
      "--render-sheets",
      "/tmp/out",
      "--brush-rmse-threshold",
      "0.05",
      "--same-ink-rmse-threshold",
      "0.04",
      "--filter-rmse-threshold",
      "0.045",
    ]);
    assert.equal(parsed.check, true);
    assert.equal(parsed.renderSheetsDir, "/tmp/out");
    assert.equal(parsed.brushRmseThreshold, 0.05);
    assert.equal(parsed.sameInkRmseThreshold, 0.04);
    assert.equal(parsed.filterRmseThreshold, 0.045);

    assert.throws(() => parseCliArgs(["--render-sheets"]), /값이 필요/);
    assert.throws(() => parseCliArgs(["--unknown-flag"]), /알 수 없는 인자/);
  });

  it("createSoftwareCanvas2D와 computeNormalizedRgbaRmse가 결정론적 픽셀 렌더링 및 거리를 계산한다", () => {
    const a = createSoftwareCanvas2D(32, 32, [255, 255, 255]);
    const b = createSoftwareCanvas2D(32, 32, [255, 255, 255]);
    assert.equal(computeNormalizedRgbaRmse(a.data, b.data, false), 0);

    a.ctx.fillStyle = "rgba(20, 30, 40, 1)";
    a.ctx.beginPath();
    a.ctx.ellipse(16, 16, 10, 6, 0.3, 0, Math.PI * 2);
    a.ctx.fill();
    a.ctx.strokeStyle = "rgba(200, 40, 60, 0.9)";
    a.ctx.lineWidth = 2;
    a.ctx.beginPath();
    a.ctx.moveTo(2, 2);
    a.ctx.lineTo(30, 30);
    a.ctx.stroke();

    const rmse = computeNormalizedRgbaRmse(a.data, b.data, false);
    assert.ok(rmse > 0.2, `예상보다 작은 변화량: ${rmse}`);

    a.ctx.clearRect(0, 0, 32, 32);
    assert.equal(computeNormalizedRgbaRmse(a.data, b.data, false), 0);

    const black = new Uint8ClampedArray([0, 0, 0, 255]);
    const white = new Uint8ClampedArray([255, 255, 255, 255]);
    assert.equal(computeNormalizedRgbaRmse(black, white, false), 1);
  });

  it("encodeRgbaToPng가 유효한 PNG 헤더와 IHDR 크기를 기록한다", () => {
    const rgba = new Uint8ClampedArray(12 * 8 * 4);
    rgba.fill(180);
    const png = encodeRgbaToPng(rgba, 12, 8);
    assert.ok(png.subarray(0, 8).equals(PNG_MAGIC));
    assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
    assert.equal(png.readUInt32BE(16), 12);
    assert.equal(png.readUInt32BE(20), 8);
    assert.equal(png.subarray(png.length - 8, png.length - 4).toString("ascii"), "IEND");
  });
});

describe("60종 글로벌 브러시(1,770쌍) + 36종 RGBA 필터(630쌍) 전수 시각 변별력 감사", () => {
  it("전수 쌍 변별력 임계치(0.035)를 100% 충족하고 3종의 컨택트시트 PNG를 생성한다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "toonstudio-visual-audit-"));
    try {
      const report = await runBrushFilterVisualAudit({
        renderSheetsDir: tmpDir,
        brushWidth: 160,
        brushHeight: 48,
        filterWidth: 96,
        filterHeight: 64,
      });

      assert.equal(report.passed, true);
      assert.equal(report.brushes.count, 60);
      assert.equal(report.brushes.pairCount, 1770);
      assert.equal(report.brushes.violationCount, 0);
      assert.equal(report.brushes.sameInkViolationCount, 0);
      assert.equal(report.brushes.weakItemCount, 0);
      assert.ok(report.brushes.minRmse >= 0.035, `브러시 최소 RMSE 부족: ${report.brushes.minRmse}`);
      assert.ok(
        report.brushes.minSameInkRmse >= 0.035,
        `브러시 동일잉크 최소 RMSE 부족: ${report.brushes.minSameInkRmse}`,
      );

      assert.equal(report.filters.count, 36);
      assert.equal(report.filters.pairCount, 630);
      assert.equal(report.filters.violationCount, 0);
      assert.equal(report.filters.weakItemCount, 0);
      assert.ok(report.filters.minRmse >= 0.035, `필터 최소 RMSE 부족: ${report.filters.minRmse}`);
      assert.ok(
        report.filters.minVsOriginalRmse >= 0.035,
        `필터 원본 대비 최소 변화량 부족: ${report.filters.minVsOriginalRmse}`,
      );

      assert.equal(report.renderedSheets.length, 3);
      for (const sheetPath of report.renderedSheets) {
        assert.ok(fs.existsSync(sheetPath), `시트 파일 누락: ${sheetPath}`);
        const bytes = fs.readFileSync(sheetPath);
        assert.ok(bytes.length > 2048, `PNG 파일 크기가 너무 작음: ${sheetPath}`);
        assert.ok(bytes.subarray(0, 8).equals(PNG_MAGIC), `유효하지 않은 PNG 시그니처: ${sheetPath}`);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("CLI가 JSON 출력과 --check 성공/실패 종료 코드를 올바르게 반환한다", () => {
    const stdout = execFileSync(process.execPath, [SCRIPT_PATH, "--check"], {
      encoding: "utf8",
    });
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.passed, true);
    assert.equal(parsed.brushes.pairCount, 1770);
    assert.equal(parsed.filters.pairCount, 630);

    const failRun = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--check", "--brush-rmse-threshold", "0.99"],
      { encoding: "utf8" },
    );
    assert.equal(failRun.status, 1);
    assert.match(failRun.stderr, /변별력 감사 실패/);
  });
});
