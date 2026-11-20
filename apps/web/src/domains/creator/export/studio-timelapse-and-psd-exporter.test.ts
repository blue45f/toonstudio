import { describe, expect, it } from "vitest";

import {
  buildStrokeTimelapseSchedule,
  buildWebtoonPsdExportManifest,
} from "./studio-timelapse-and-psd-exporter";

describe("studio-timelapse-and-psd-exporter (F09 · F10 / T11)", () => {
  it("compresses long idle gaps and schedules deterministic 0.5x~4x WebM timelapse frames", () => {
    const schedule = buildStrokeTimelapseSchedule(
      [
        { strokeId: "s-1", layerId: "l-line", startedAtMs: 0, durationMs: 400 },
        // 15초 유휴 정지 구간 -> 기본 800ms로 자동 압축된 뒤 2x 배속 적용(400ms 간격)
        { strokeId: "s-2", layerId: "l-color", startedAtMs: 15_400, durationMs: 600 },
      ],
      2,
      {
        maxIdleGapMs: 800,
        isTypeSupported: (mime) => mime === "video/webm;codecs=vp9",
      },
    );

    expect(schedule.mimeType).toBe("video/webm;codecs=vp9");
    expect(schedule.totalFrames).toBe(2);
    expect(schedule.frames[0]).toEqual({
      strokeId: "s-1",
      layerId: "l-line",
      replayAtMs: 0,
      replayDurationMs: 200,
    });
    expect(schedule.frames[1]).toEqual({
      strokeId: "s-2",
      layerId: "l-color",
      replayAtMs: 600,
      replayDurationMs: 300,
    });
    expect(schedule.totalReplayDurationMs).toBe(900);
  });

  it("organizes manuscript layers into 4 non-destructive PSD folder groups and preserves Rights BOM IDs", () => {
    const manifest = buildWebtoonPsdExportManifest({
      widthPx: 800,
      heightPx: 12800,
      layers: [
        { id: "1", name: "교실 3D 배경", role: "bg3d", visible: true, opacity: 1, rightsBomAssetId: "bom-classroom-01" },
        { id: "2", name: "캐릭터 밑색", role: "color", visible: true, opacity: 1 },
        { id: "3", name: "셀 그림자", role: "shading", visible: true, opacity: 0.5, blendMode: "multiply", clippingMask: true },
        { id: "4", name: "주인공 펜선", role: "line", visible: true, opacity: 1 },
        { id: "5", name: "1컷 대사", role: "text", visible: true, opacity: 1 },
      ],
    });

    expect(manifest.totalLayerCount).toBe(5);
    expect(manifest.preservedRightsBomIds).toEqual(["bom-classroom-01"]);
    expect(manifest.groups.map((g) => [g.groupId, g.layers.length])).toEqual([
      ["dialogue-sfx", 1],
      ["line-art", 1],
      ["color-shading", 2],
      ["bg3d-stage", 1],
    ]);
    expect(manifest.groups[2]?.layers[1]).toMatchObject({
      name: "셀 그림자",
      opacityByte: 128,
      blendMode: "multiply",
      clippingMask: true,
    });
  });
});
