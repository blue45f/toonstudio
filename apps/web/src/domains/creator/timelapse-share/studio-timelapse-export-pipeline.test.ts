import { describe, expect, it } from "vitest";

import {
  createTimelapseSession,
  endTimelapseSession,
  recordStroke,
  type TimelapseStroke,
} from "../drawing/studio-timelapse";
import {
  planTimelapseReplayFrames,
  restoreTimelapseSessionFromArchive,
  runTimelapseExportPipeline,
} from "./studio-timelapse-export-pipeline";

function makeLongStroke(id: string, startMs: number, sampleCount = 48): TimelapseStroke {
  const samples = [];
  for (let i = 0; i < sampleCount; i += 1) {
    samples.push({
      timeMs: startMs + i * 16,
      x: 40 + i * 3.25,
      y: 80 + Math.sin(i * 0.2) * 15,
      pressure: 0.4 + (i % 5) * 0.1,
    });
  }
  return {
    id,
    color: "currentColor",
    width: 4.5,
    startedAtMs: startMs,
    endedAtMs: startMs + (sampleCount - 1) * 16,
    samples,
  };
}

describe("studio-timelapse-export-pipeline", () => {
  it("Undo 스트로크 정리 · 유휴 공백 제거 · 2배 이상 델타 압축 · 15/30초 배속을 일괄 실행한다", () => {
    let session = createTimelapseSession({ maxDurationMs: 120_000 });
    // 시작 대기 3,000ms + 스트로크 1 + 10,000ms 유휴 공백 + Undo될 스트로크 + 12,000ms 공백 + 스트로크 3
    session = recordStroke(session, makeLongStroke("s-1", 3_000, 60));
    session = recordStroke(session, makeLongStroke("s-undo", 14_000, 40));
    session = recordStroke(session, makeLongStroke("s-2", 28_000, 60));
    session = endTimelapseSession(session, 40_000);

    const result = runTimelapseExportPipeline(session, {
      targetDurationPreset: 15,
      maxIdleGapMs: 300,
      maxInitialDelayMs: 100,
      undoneStrokeIds: ["s-undo"],
      fps: 30,
      heatmapBuckets: 16,
    });

    expect(result.archive.prunedUndoCount).toBe(1);
    expect(result.compactedSession.strokes.map((s) => s.id)).toEqual(["s-1", "s-2"]);
    expect(result.archive.removedIdleMs).toBeGreaterThan(25_000);
    expect(result.idleTimeSavedRatio).toBeGreaterThan(0.6);
    expect(result.archive.compressionRatio).toBeGreaterThanOrEqual(2.0);
    expect(result.archive.maxCoordinateErrorPx).toBeLessThanOrEqual(0.02);
    expect(result.heatmap.buckets).toHaveLength(16);
    expect(result.heatmap.totalInkTravelPx).toBeGreaterThan(200);

    // 복원 라운드트립 검증
    const restored = restoreTimelapseSessionFromArchive(result.archive);
    expect(restored.strokes).toHaveLength(2);
    expect(restored.strokes[0]!.samples).toHaveLength(60);

    // 프레임 스케줄 검증
    const schedule = planTimelapseReplayFrames(result);
    expect(schedule.length).toBe(result.frameCount);
    expect(schedule[0]!.progress01).toBe(0);
    expect(schedule[schedule.length - 1]!.progress01).toBe(1);
  });
});
