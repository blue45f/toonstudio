import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import { fileURLToPath } from "node:url";

import {
  BRUSH_SOAK_TIMING_MIN_WINDOW_MS,
  BRUSH_SOAK_TIMING_SAMPLE_COUNT,
  analyzeStampBufferMetrics,
  evaluateAllBrushesCompetitorScore,
  measureBrushSoakTiming,
  scoreVisualTextureFidelity,
  summarizeBrushSoakTimingSamples,
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
  assert.equal(report.minScore, 100, JSON.stringify(report));
  assert.equal(report.avgScore, 100);
  for (const row of report.results) {
    assert.equal(row.total, 100, `${row.familyId} 감점: ${row.notes.join("; ")}`);
    assert.equal(row.metrics.nanCount, 0, `${row.familyId} NaN 출력 발생`);
    assert.ok(row.metrics.lateEarlyRatio <= 1.35, `${row.familyId} 장획 성능 저하: ${row.metrics.lateEarlyRatio}x`);
    assert.ok(row.metrics.avgFrameMs < 16.6, `${row.familyId} 프레임 예산 초과: ${row.metrics.avgFrameMs}ms`);
    assert.ok(row.metrics.p99FrameMs < 16.6, `${row.familyId} p99 프레임 예산 초과: ${row.metrics.p99FrameMs}ms`);
    assert.equal(row.metrics.soakTiming.samples.length, BRUSH_SOAK_TIMING_SAMPLE_COUNT);
    for (const [index, sample] of row.metrics.soakTiming.samples.entries()) {
      assert.equal(sample.run, index + 1);
      assert.ok(sample.strokes >= 1);
      assert.ok(sample.earlyMs >= BRUSH_SOAK_TIMING_MIN_WINDOW_MS);
      assert.ok(sample.lateMs >= BRUSH_SOAK_TIMING_MIN_WINDOW_MS);
    }
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

test("장획 측정: CI의 앞·뒤 표본을 다른 실행과 섞지 않고 원래 짝의 중앙 배율을 계산한다", () => {
  const samples = [
    [2.4781, 0.8375], [0.9143, 0.5304], [0.5260, 0.4638], [0.6491, 0.4532],
    [0.4228, 0.7358], [0.2803, 0.4942], [0.2843, 0.3064],
  ].map(([earlyMs, lateMs], index) => ({ run: index + 1, earlyMs, lateMs }));
  const original = structuredClone(samples);
  const unpaired = samples.map((s) => s.lateMs).sort((a, b) => a - b)[1]
    / samples.map((s) => s.earlyMs).sort((a, b) => a - b)[1];
  assert.ok(unpaired > 1.35);
  const { lateEarlyRatio } = summarizeBrushSoakTimingSamples(samples);
  assert.equal(lateEarlyRatio, 0.4638 / 0.5260);
  assert.ok(lateEarlyRatio < 1.35);
  assert.deepEqual(samples, original, "원시 표본의 실행 순서와 짝은 변경하지 않아야 한다");
});

test("장획 측정: 지속적인 1.36배·2배·이차 증가와 다수 표본의 저하를 그대로 감지한다", () => {
  for (const ratio of [1.36, 2, 19]) {
    const samples = Array.from({ length: BRUSH_SOAK_TIMING_SAMPLE_COUNT }, (_, index) => ({
      earlyMs: 10 + index,
      lateMs: (10 + index) * ratio,
    }));
    assert.ok(summarizeBrushSoakTimingSamples(samples).lateEarlyRatio > 1.35);
  }
  const majorityRegression = [0.9, 1.0, 1.1, 1.36, 1.4, 1.5, 1.8]
    .map((ratio) => ({ earlyMs: 10, lateMs: ratio * 10 }));
  assert.equal(summarizeBrushSoakTimingSamples(majorityRegression).lateEarlyRatio, 1.36);
});

test("장획 측정: 통과 여부와 무관하게 양쪽 창의 최소 작업량과 7개 표본을 전부 측정한다", () => {
  for (const lateMs of [0.5, 1, 2]) {
    let calls = 0;
    const diagnostics = { processedPoints: 10_000 };
    const result = measureBrushSoakTiming(() => {
      calls += 1;
      return { earlyMs: 1, lateMs, avgFrameMs: 0.01, p99FrameMs: 0.02, diagnostics };
    });
    const strokesPerSample = Math.ceil(BRUSH_SOAK_TIMING_MIN_WINDOW_MS / Math.min(1, lateMs));
    assert.equal(result.timingSamples.length, 7);
    assert.equal(calls, 16 + 7 * strokesPerSample, "예열 뒤 모든 표본을 수집하며 성공 시 조기 종료하지 않는다");
    assert.deepEqual(result.timingSamples, Array.from({ length: 7 }, (_, index) => ({
      run: index + 1,
      strokes: strokesPerSample,
      earlyMs: strokesPerSample,
      lateMs: strokesPerSample * lateMs,
    })));
    assert.equal(result.lateEarlyRatio, lateMs);
    assert.equal(result.finalDiag, diagnostics);
  }
});

test("장획 측정: 0·음수·비유한 시계와 표본 부족을 통과로 보정하지 않는다", () => {
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    for (const field of ["earlyMs", "lateMs"]) {
      const sample = { earlyMs: 10, lateMs: 10, [field]: invalid };
      assert.throws(() => summarizeBrushSoakTimingSamples(Array(7).fill(sample)), /유효하지/);
      assert.throws(() => measureBrushSoakTiming(() => sample), /유효하지/);
    }
  }
  assert.throws(() => summarizeBrushSoakTimingSamples([]), /7개 짝 표본/);
});

test("장획 측정: 최소 시간에 도달하지 못하는 작업은 반복 상한에서 실패한다", () => {
  let calls = 0;
  assert.throws(() => measureBrushSoakTiming(() => {
    calls += 1;
    return { earlyMs: 0.001, lateMs: 0.001, avgFrameMs: 0.0001, p99FrameMs: 0.0001 };
  }), /10ms에 도달하지 못했습니다/);
  assert.equal(calls, 16 + 512);
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
  const samples = Array.from({ length: BRUSH_SOAK_TIMING_SAMPLE_COUNT }, () => {
    const { chunkMs, sink } = runQuadratic(10, 400);
    assert.ok(sink > 0);
    return { earlyMs: chunkMs[0], lateMs: chunkMs[9] };
  });
  const { lateEarlyRatio: ratio } = summarizeBrushSoakTimingSamples(samples);
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
