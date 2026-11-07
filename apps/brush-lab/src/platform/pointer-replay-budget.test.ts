// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { DEFAULT_INPUT_CONFIG, InputPipeline } from "../engine/input/input-pipeline";
import { applyStrokeStream } from "../engine/input/stages/chain";
import { createCornerGateStage } from "../engine/input/stages/corner-gate";
import { createLazyBrushStageFromPct } from "../engine/input/stages/lazy-brush";
import { createPenSpringStageFromPct } from "../engine/input/stages/pen-spring";

import {
  MAX_HEAP_DELTA_BYTES,
  MAX_REPLAY_SEEDS,
  MAX_WALL_MS,
  runSeededPointerReplay,
} from "./pointer-replay-harness";
import { createSpeedPressureSimulator } from "./pressure-sim";

// 실제 벽시계 예산은 필수 직렬 성능 레인에서 측정한다. 결정적 포인터 계약은
// pointer-capture.test.ts에 남겨 병렬 루트 레인의 수집·커버리지를 유지한다.
describe("합성 포인터 이벤트 스트림 리플레이 예산(실기기 펜 하드웨어 검증 아님)", () => {
  it(`시드 1..${MAX_REPLAY_SEEDS} 유계 리플레이 스위트: 수명주기·predicted 격리·리스너/캡처 정리·파이프라인 연동을 검증한다`, () => {
    const startWallMs = performance.now();
    const startHeapBytes = typeof process !== "undefined" && typeof process.memoryUsage === "function" ? process.memoryUsage().heapUsed : 0;

    const pipeline = new InputPipeline(DEFAULT_INPUT_CONFIG);
    const speedSim = createSpeedPressureSimulator();
    const lazyGate = createCornerGateStage(createLazyBrushStageFromPct(60));
    const penGate = createCornerGateStage(createPenSpringStageFromPct(60));

    let totalStrokes = 0;

    for (let seed = 1; seed <= MAX_REPLAY_SEEDS; seed += 1) {
      const closeOpen = seed % 2 === 0;
      const result = runSeededPointerReplay(seed, {
        maxEvents: 48,
        closeOpenStrokeBeforeDetach: closeOpen,
      });

      expect(result.validation.valid, `seed=${seed} violations: ${result.validation.violations.join("; ")}`).toBe(true);
      expect(result.validation.predictedInCanonicalCount, `seed=${seed}`).toBe(0);
      if (closeOpen) {
        expect(result.validation.downCount, `seed=${seed}`).toBe(result.validation.upCount);
      } else {
        expect(result.validation.downCount - result.validation.upCount).toBeGreaterThanOrEqual(0);
        expect(result.validation.downCount - result.validation.upCount).toBeLessThanOrEqual(1);
      }
      expect(result.activeElementListenersAfterDetach, `seed=${seed} el listeners`).toBe(0);
      expect(result.activeWindowListenersAfterDetach, `seed=${seed} win listeners`).toBe(0);
      expect(result.activeCapturedPointersAfterDetach, `seed=${seed} captures`).toBe(0);
      expect(result.postDetachSampleCount, `seed=${seed} post-detach samples`).toBe(0);
      expect(result.touchActionRestored, `seed=${seed} touchAction`).toBe(true);

      // 각 완결된 획을 SpeedPressureSimulator + 단계 + InputPipeline에 통과시켜 유한성·단조성 확인
      for (const stroke of result.validation.strokes) {
        const lastSample = stroke[stroke.length - 1];
        if (!lastSample || lastSample.phase !== "up") {
          // 열린 채 detach된 획은 cancel(reset) 후 다음 획에 누수가 없는지 확인
          speedSim.apply(stroke);
          speedSim.reset();
          lazyGate.apply(stroke);
          lazyGate.reset();
          penGate.apply(stroke);
          penGate.reset();
          pipeline.push(stroke);
          pipeline.reset();
          continue;
        }
        totalStrokes += 1;
        const pressured = speedSim.apply(stroke);
        const stagedLazy = applyStrokeStream(lazyGate, pressured);
        const stagedPen = applyStrokeStream(penGate, pressured);
        const modeled = [...pipeline.push(stagedLazy).committed, ...pipeline.finish()];

        for (const seq of [pressured, stagedLazy, stagedPen, modeled]) {
          for (let i = 0; i < seq.length; i += 1) {
            const s = seq[i];
            expect(Number.isFinite(s?.x), `seed=${seed}`).toBe(true);
            expect(Number.isFinite(s?.y), `seed=${seed}`).toBe(true);
            expect(Number.isFinite(s?.tMs), `seed=${seed}`).toBe(true);
            expect(Number.isFinite(s?.pressure), `seed=${seed}`).toBe(true);
          }
        }
        for (let i = 1; i < modeled.length; i += 1) {
          expect(modeled[i]?.tMs, `seed=${seed} modeled monotonic`).toBeGreaterThanOrEqual(modeled[i - 1]?.tMs ?? 0);
        }
      }
    }

    const elapsedWallMs = performance.now() - startWallMs;
    const endHeapBytes = typeof process !== "undefined" && typeof process.memoryUsage === "function" ? process.memoryUsage().heapUsed : 0;
    const heapDeltaBytes = Math.max(0, endHeapBytes - startHeapBytes);

    expect(totalStrokes).toBeGreaterThan(30);
    expect(elapsedWallMs).toBeLessThan(MAX_WALL_MS);
    expect(heapDeltaBytes).toBeLessThan(MAX_HEAP_DELTA_BYTES);
  });
});
