import { describe, expect, it } from "vitest";

import {
  TIMELAPSE_DEFAULT_MAX_DURATION_MS,
  TIMELAPSE_PLAYBACK_RATES,
  advanceTimelapsePlayback,
  compressTimelapseIdleGaps,
  computeTimelapseActivityHeatmap,
  createTimelapseSession,
  decodeTimelapseStrokeDelta,
  encodeTimelapseStrokeDelta,
  endTimelapseSession,
  estimateTimelapseExportSize,
  formatBytes,
  formatTimelapseTime,
  getMediaRecorderExportGuide,
  getTimelapseDurationMs,
  getTimelapseProgress,
  getTimelapseStats,
  getVisibleStrokes,
  measureStrokeDeltaCompression,
  recordStroke,
  removeTimelapseStrokeById,
  validateTimelapseStroke,
  type TimelapseStroke,
} from "./studio-timelapse";

function makeStroke(
  id: string,
  startedAtMs: number,
  sampleCount: number,
  stepMs = 100,
): TimelapseStroke {
  const samples = Array.from({ length: sampleCount }, (_, i) => ({
    timeMs: startedAtMs + i * stepMs,
    x: i * 10,
    y: i * 5,
    pressure: 0.5,
  }));
  return {
    id,
    color: "#1a1a2e",
    width: 4,
    startedAtMs,
    endedAtMs: startedAtMs + (sampleCount - 1) * stepMs,
    samples,
  };
}

describe("createTimelapseSession", () => {
  it("기본 최대 5분", () => {
    expect(createTimelapseSession().maxDurationMs).toBe(
      TIMELAPSE_DEFAULT_MAX_DURATION_MS,
    );
    expect(TIMELAPSE_DEFAULT_MAX_DURATION_MS).toBe(5 * 60 * 1000);
  });

  it("재생 속도 1x/2x/4x/8x", () => {
    expect([...TIMELAPSE_PLAYBACK_RATES]).toEqual([1, 2, 4, 8]);
  });
});

describe("recordStroke", () => {
  it("스트로크를 기록한다 (불변 스냅샷)", () => {
    const s0 = createTimelapseSession();
    const s1 = recordStroke(s0, makeStroke("a", 0, 5));
    expect(s1.strokes).toHaveLength(1);
    expect(s0.strokes).toHaveLength(0);
  });

  it("유효하지 않은 스트로크는 무시된다", () => {
    const s0 = createTimelapseSession();
    const bad = { ...makeStroke("b", 0, 3), width: -1 };
    expect(recordStroke(s0, bad).strokes).toHaveLength(0);
  });

  it("최대 길이를 초과한 샘플은 잘린다", () => {
    const s0 = createTimelapseSession({ maxDurationMs: 10_000 });
    const s1 = recordStroke(s0, makeStroke("c", 9000, 50, 100)); // ~13900ms
    expect(s1.strokes).toHaveLength(1);
    const last = s1.strokes[0].samples[s1.strokes[0].samples.length - 1];
    expect(last.timeMs).toBeLessThanOrEqual(10_000);
  });

  it("종료된 세션에는 기록되지 않는다", () => {
    const s0 = endTimelapseSession(createTimelapseSession(), 1000);
    expect(recordStroke(s0, makeStroke("d", 2000, 3)).strokes).toHaveLength(0);
  });
});

describe("validateTimelapseStroke", () => {
  it("샘플 시각이 단조 증가하지 않으면 실패", () => {
    const stroke = makeStroke("e", 0, 3);
    const bad = {
      ...stroke,
      samples: [
        { timeMs: 200, x: 0, y: 0 },
        { timeMs: 100, x: 1, y: 1 },
      ],
    };
    expect(validateTimelapseStroke(bad).ok).toBe(false);
  });

  it("빈 id·빈 샘플은 실패", () => {
    expect(validateTimelapseStroke({ ...makeStroke("f", 0, 3), id: "" }).ok).toBe(false);
    expect(validateTimelapseStroke({ ...makeStroke("g", 0, 3), samples: [] }).ok).toBe(false);
  });
});

describe("getTimelapseDurationMs", () => {
  it("종료 전에는 마지막 스트로크 종료 시각", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 5)); // 400ms
    s = recordStroke(s, makeStroke("b", 1000, 3)); // 1200ms
    expect(getTimelapseDurationMs(s)).toBe(1200);
  });

  it("종료 후에는 종료 시각", () => {
    const s = endTimelapseSession(recordStroke(createTimelapseSession(), makeStroke("a", 0, 5)), 3000);
    expect(getTimelapseDurationMs(s)).toBe(3000);
  });
});

describe("getVisibleStrokes (스크럽/시크)", () => {
  it("재생 시각 이전 스트로크만 보인다", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 5)); // 0~400ms
    s = recordStroke(s, makeStroke("b", 1000, 5)); // 1000~1400ms
    expect(getVisibleStrokes(s, 500).map((x) => x.id)).toEqual(["a"]);
    expect(getVisibleStrokes(s, 2000).map((x) => x.id)).toEqual(["a", "b"]);
    expect(getVisibleStrokes(s, -100)).toHaveLength(0);
  });

  it("진행 중인 스트로크는 시각까지 샘플이 잘린다", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 10, 100)); // 0~900ms
    const visible = getVisibleStrokes(s, 250);
    expect(visible).toHaveLength(1);
    expect(visible[0].samples.length).toBe(3); // 0,100,200
    expect(visible[0].endedAtMs).toBe(250);
  });
});

describe("getTimelapseProgress", () => {
  it("진행률 0..1", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 5)); // 400ms
    expect(getTimelapseProgress(s, 200)).toBeCloseTo(0.5, 5);
    expect(getTimelapseProgress(s, 9999)).toBe(1);
    expect(getTimelapseProgress(createTimelapseSession(), 100)).toBe(0);
  });
});

describe("advanceTimelapsePlayback", () => {
  it("rate 배율로 재생 위치가 전진한다", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 100, 100)); // 9900ms
    const tick = advanceTimelapsePlayback(s, 0, 4, 250);
    expect(tick.playbackTimeMs).toBe(1000);
    expect(tick.finished).toBe(false);
  });

  it("끝에 도달하면 finished", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 5)); // 400ms
    const tick = advanceTimelapsePlayback(s, 300, 8, 250);
    expect(tick.playbackTimeMs).toBe(400);
    expect(tick.finished).toBe(true);
  });
});

describe("estimateTimelapseExportSize", () => {
  it("비트레이트 기반 추정", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 600, 100)); // 59900ms ≈ 60초
    const est = estimateTimelapseExportSize(s, { fps: 30 });
    expect(est.frameCount).toBeGreaterThan(1700);
    // 60초 × 2.5Mbps / 8 ≈ 18.75MB
    expect(est.bytes).toBeGreaterThan(15 * 1024 * 1024);
    expect(est.bytes).toBeLessThan(25 * 1024 * 1024);
    expect(est.humanReadable).toMatch(/MB/);
  });
});

describe("formatBytes / formatTimelapseTime", () => {
  it("바이트 표기", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("시각 표기", () => {
    expect(formatTimelapseTime(0)).toBe("00:00.000");
    expect(formatTimelapseTime(61500)).toBe("01:01.500");
  });
});

describe("getTimelapseStats", () => {
  it("스트로크·샘플 수 집계", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 5));
    s = recordStroke(s, makeStroke("b", 1000, 7));
    const stats = getTimelapseStats(s);
    expect(stats.strokeCount).toBe(2);
    expect(stats.sampleCount).toBe(12);
    expect(stats.isEnded).toBe(false);
  });
});

describe("getMediaRecorderExportGuide", () => {
  it("한/영 가이드가 단계별로 있다", () => {
    const ko = getMediaRecorderExportGuide("ko");
    const en = getMediaRecorderExportGuide("en");
    expect(ko.length).toBeGreaterThanOrEqual(5);
    expect(en.length).toBeGreaterThanOrEqual(5);
    expect(ko.join(" ")).toContain("MediaRecorder");
    expect(en.join(" ")).toContain("captureStream");
  });
});

describe("encodeTimelapseStrokeDelta / decodeTimelapseStrokeDelta", () => {
  it("양자화 1차 차분 코덱이 서브픽셀(<= 0.015px) 정밀도로 복원하고 2.2배 이상의 페이로드 압축률을 달성한다", () => {
    const stroke: TimelapseStroke = {
      id: "stroke-sync-01",
      color: "#1e293b",
      width: 6.5,
      startedAtMs: 1200,
      endedAtMs: 1680,
      samples: Array.from({ length: 60 }, (_, idx) => ({
        timeMs: 1200 + idx * 8,
        x: 120.24 + idx * 1.37 + Math.sin(idx * 0.2) * 0.45,
        y: 240.68 + idx * 0.92 + Math.cos(idx * 0.2) * 0.35,
        pressure: 0.25 + (idx / 60) * 0.65,
      })),
    };

    const packet = encodeTimelapseStrokeDelta(stroke);
    const decoded = decodeTimelapseStrokeDelta(packet);
    expect(decoded.id).toBe(stroke.id);
    expect(decoded.samples).toHaveLength(stroke.samples.length);

    const metrics = measureStrokeDeltaCompression(stroke);
    expect(metrics.compressionRatio).toBeGreaterThanOrEqual(2.2);
    expect(metrics.maxCoordinateErrorPx).toBeLessThanOrEqual(0.015);
  });
});

describe("compressTimelapseIdleGaps, removeTimelapseStrokeById & computeTimelapseActivityHeatmap (Wave 11)", () => {
  it("유휴 공백(Dead-Air) 압축기가 스트로크 간 긴 정지 구간은 압축하고 각 스트로크 내부 필속은 보존한다", () => {
    let s = createTimelapseSession();
    // 첫 스트로크: 3,000ms 대기 후 400ms 동안 드로잉 (3000..3400ms)
    s = recordStroke(s, makeStroke("s1", 3000, 5, 100));
    // 두 번째 스트로크: 45,000ms 고민/휴식 후 600ms 동안 드로잉 (48400..49000ms)
    s = recordStroke(s, makeStroke("s2", 48400, 7, 100));
    s = endTimelapseSession(s, 60000);

    const compressed = compressTimelapseIdleGaps(s, {
      maxInitialDelayMs: 100,
      maxIdleGapMs: 300,
    });

    // 첫 스트로크는 100ms에서 시작하고 400ms 길이 유지 (100..500ms)
    expect(compressed.strokes[0]!.startedAtMs).toBe(100);
    expect(compressed.strokes[0]!.endedAtMs).toBe(500);
    // 두 번째 스트로크는 300ms 공백 뒤 800ms에서 시작하고 600ms 길이 유지 (800..1400ms)
    expect(compressed.strokes[1]!.startedAtMs).toBe(800);
    expect(compressed.strokes[1]!.endedAtMs).toBe(1400);
    // 내부 샘플 간격(100ms) 보존 확인
    expect(
      compressed.strokes[1]!.samples[2]!.timeMs - compressed.strokes[1]!.samples[1]!.timeMs,
    ).toBe(100);
    // 종료 후 후행 공백도 300ms로 압축 (1400 + 300 = 1700ms)
    expect(getTimelapseDurationMs(compressed)).toBe(1700);
  });

  it("removeTimelapseStrokeById로 실행 취소(Undo)된 스트로크를 제거하고 타임라인 활동 히트맵을 산출한다", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("s1", 0, 6, 50));
    s = recordStroke(s, makeStroke("s2-undo", 400, 4, 50));
    s = recordStroke(s, makeStroke("s3", 800, 8, 50));

    const pruned = removeTimelapseStrokeById(s, "s2-undo");
    expect(pruned.strokes.map((st) => st.id)).toEqual(["s1", "s3"]);

    const heatmap = computeTimelapseActivityHeatmap(pruned, 12);
    expect(heatmap.buckets).toHaveLength(12);
    expect(heatmap.peakSamplesPerBucket).toBeGreaterThan(0);
    expect(heatmap.totalInkTravelPx).toBeGreaterThan(100);
    expect(heatmap.activeRatio).toBeGreaterThan(0.15);
    expect(Math.max(...heatmap.buckets)).toBe(1);
  });
});

