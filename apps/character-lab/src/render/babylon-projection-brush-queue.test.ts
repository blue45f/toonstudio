import { describe, expect, it } from "vitest";

import { createNullEngineHarness, installFakeUvBrushReplay } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

describe("투영 페인트 준비 대기 브러시 보존", () => {
  it("같은 크기·다른 크기로 필압이 바뀌어도 각 대기 dab의 원래 비트맵을 재생한다(GPU 픽셀 검증 아님)", async () => {
    const harness = await createNullEngineHarness({ size: 64, lane: "webgl2" });
    let ready = false;
    const replayed: Uint8Array[] = [];
    const restoreReplay = installFakeUvBrushReplay(() => ready, (bytes) => replayed.push(bytes));
    try {
      await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
      await harness.engine.setBetaFeature("uvProjectionPaint", true);
      const port = harness.engine.projectionPaint();
      if (!port) throw new Error("투영 포트 없음");
      const chest = harness.engine.jointHandles().find((handle) => handle.bone === "chest");
      if (!chest) throw new Error("가슴 핸들 없음");
      const camera = harness.engine.viewportCamera();
      const x = chest.screen[0] / camera.width * 2 - 1;
      const y = 1 - chest.screen[1] / camera.height * 2;
      expect(port.begin("skin", 32, 32, { targetPart: "skin", ignoreOccludingParts: true })).toBe(true);
      const bitmaps = [
        { size: 4, rgba: new Uint8Array(4 * 4 * 4).fill(32), key: "low-pressure" },
        { size: 4, rgba: new Uint8Array(4 * 4 * 4).fill(192), key: "high-pressure" },
        { size: 8, rgba: new Uint8Array(8 * 8 * 4).fill(255), key: "large-brush" },
      ];
      for (const bitmap of bitmaps) {
        port.setBrush(bitmap, bitmap.size);
        expect(port.stamp(x, y).hit).toBe(true);
      }
      expect(replayed).toEqual([]);
      ready = true;
      // 가짜 재생은 GPU RTT를 만들지 않으므로 readback은 명시적으로 실패한다. 검사 대상은 그 직전의 업로드 순서다.
      await expect(port.flush()).rejects.toThrow("readback을 지원하지 않아");
      expect(replayed).toEqual(bitmaps.map((bitmap) => bitmap.rgba));
      // 캐시된 마지막 텍스처를 바꿔도 앞서 재생한 바이트 스냅샷은 그대로다.
      port.setBrush(bitmaps[0]!, 4);
      expect(port.stamp(x, y).hit).toBe(true);
      expect(replayed.at(-1)).toEqual(bitmaps[0]?.rgba);
    } finally {
      restoreReplay();
      harness.dispose();
    }
  });
});
