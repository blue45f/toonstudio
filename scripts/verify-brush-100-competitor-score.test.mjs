import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import { fileURLToPath } from "node:url";

import {
  analyzeStampBufferMetrics,
  evaluateAllBrushesCompetitorScore,
  scoreVisualTextureFidelity,
} from "./verify-brush-100-competitor-score.mjs";

const SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "verify-brush-100-competitor-score.mjs",
);

function makeFlatAlphaDisc(size, alphaValue) {
  const buf = new Float32Array(size * size);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    const ny = (y - half) / half;
    for (let x = 0; x < size; x += 1) {
      const nx = (x - half) / half;
      if (Math.hypot(nx, ny) <= 0.8) buf[y * size + x] = alphaValue;
    }
  }
  return buf;
}

test("12종 전 브러시가 Krita 5.2 + CSP 3.0 5대 실측 축에서 100.0 / 100을 달성한다", async () => {
  const report = await evaluateAllBrushesCompetitorScore();
  assert.equal(report.familyCount, 12);
  assert.equal(report.minScore, 100);
  assert.equal(report.avgScore, 100);
  for (const row of report.results) {
    assert.equal(row.total, 100, `${row.familyId} 감점: ${row.notes.join("; ")}`);
    assert.equal(row.metrics.nanCount, 0, `${row.familyId} NaN 출력 발생`);
    assert.ok(row.metrics.lateEarlyRatio <= 1.35, `${row.familyId} 장획 성능 저하: ${row.metrics.lateEarlyRatio}x`);
    assert.ok(row.metrics.avgFrameMs < 16.6, `${row.familyId} 프레임 예산 초과: ${row.metrics.avgFrameMs}ms`);
    assert.ok(row.metrics.emittedDabs10k >= 5000, `${row.familyId} 장획 dab 수 부족`);
    assert.ok(row.metrics.retainedHistory <= 64, `${row.familyId} 히스토리 누수`);
  }
});

test("적대적 검증: 단순 평면 알파 브러시 버퍼는 크레용/목탄/파스텔/초크/수채화 채점에서 즉시 감점된다", () => {
  const flatLow = makeFlatAlphaDisc(64, 0.45);
  const flatHigh = makeFlatAlphaDisc(64, 0.85);
  const metrics = analyzeStampBufferMetrics(flatLow, 64);
  assert.ok(metrics.stdDev < 0.01);
  assert.ok(metrics.entropyBits < 0.1);

  for (const familyId of ["crayon", "charcoal", "pastel", "chalk", "watercolor", "oil", "spray", "sumi-dry-rake"]) {
    const res = scoreVisualTextureFidelity(familyId, flatLow, flatHigh, 64, {
      lowPeakContrast: 0,
      lowDrySkip: 0,
      highDrySkip: 0,
      crumbCount: 0,
    });
    assert.ok(res.score <= 10, `${familyId} 평면 원판이 과도한 점수를 받음: ${res.score}/20`);
    assert.ok(res.notes.length > 0, `${familyId} 감점 사유가 기록되어야 한다`);
  }
});

test("적대적 검증: O(N^2) 히스토리 재스캔 루프는 뒤/앞 배율이 1.35x를 크게 초과하여 감지된다", () => {
  const runQuadratic = (chunks, perChunk) => {
    const history = [];
    const chunkMs = [];
    let sink = 0;
    for (let c = 0; c < chunks; c += 1) {
      const t0 = performance.now();
      for (let k = 0; k < perChunk; k += 1) {
        const x = c * perChunk + k;
        for (let i = 0; i < history.length; i += 1) {
          sink += Math.abs(history[i] - x);
        }
        history.push(x);
      }
      chunkMs.push(performance.now() - t0);
    }
    return { chunkMs, sink };
  };
  // JIT 예열 후 본 측정
  runQuadratic(10, 120);
  const { chunkMs, sink } = runQuadratic(10, 400);
  assert.ok(sink > 0);
  const ratio = chunkMs[9] / Math.max(0.05, chunkMs[0]);
  assert.ok(ratio > 2.5, `O(N^2) 루프의 뒤/앞 시간 배율이 감지 기준을 넘어야 한다: ${ratio.toFixed(2)}x`);
});

test("CLI --min-score 100 실행이 종료 코드 0으로 통과하고 12종 표를 출력한다", () => {
  const proc = spawnSync(process.execPath, [SCRIPT_PATH, "--min-score", "100"], {
    encoding: "utf8",
  });
  assert.equal(proc.status, 0, `stderr:\n${proc.stderr}\nstdout:\n${proc.stdout}`);
  assert.match(proc.stdout, /crayon/);
  assert.match(proc.stdout, /sumi-dry-rake/);
  assert.match(proc.stdout, /최소 100\.0점/);
});
