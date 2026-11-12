import { describe, expect, it } from "vitest";

import { fakeEnv } from "../../bench/testing/synthetic-images";
import { presetById } from "../../engine/presets/catalog";

import { CONTRACT_INIT } from "./bristle-lane-contract";
import { BristlePbdLane } from "./bristle-pbd-lane";
import { mapProgramToBristle } from "./bristle-program-mapping";

import type { RawSample } from "../../engine/core/types";

describe("Wave 37 물리 강모 레인 통합", () => {
  it("물리 붓털 레인(bristle-pbd)의 기본 옵션은 비트 단위로 불변이고, Wave 37 옵트인 시 급선회 부채꼴·기울기·테이퍼가 실제 픽셀과 한글 영수증을 바꾼다", async () => {
    const curveSamples: RawSample[] = Array.from({ length: 28 }, (_, idx) => {
      const theta = (idx / 27) * Math.PI * 0.95;
      return {
        x: 64 + Math.cos(theta) * 34,
        y: 64 + Math.sin(theta) * 34,
        pressure: idx > 22 ? 0.12 : 0.72,
        tiltXDeg: 32,
        tiltYDeg: 18,
        twistDeg: 0,
        tMs: idx * 8,
        pointerType: "pen",
        phase: idx === 0 ? "down" : idx === 27 ? "up" : "move",
        source: "raw",
      };
    });

    const program = presetById("charcoal");
    const defaultMap = mapProgramToBristle(program);
    const enhancedMap = mapProgramToBristle(program, {
      enableTurnFanSplay: true,
      enableTiltSizeShading: true,
      enableStrokeTaper: true,
    });
    expect(defaultMap.dabResponse.turnFanSplayGain).toBeUndefined();
    expect(enhancedMap.dabResponse.turnFanSplayGain).toBeGreaterThan(0);
    expect(enhancedMap.mappedKo.some((s) => s.includes("급선회 원심 부채꼴 벌어짐"))).toBe(true);
    expect(enhancedMap.mappedKo.some((s) => s.includes("스타일러스 기울기 측면 셰이딩"))).toBe(true);
    expect(enhancedMap.mappedKo.some((s) => s.includes("입필·출필 테이퍼"))).toBe(true);

    const runLane = async (enableWave37: boolean) => {
      const lane = new BristlePbdLane(
        enableWave37
          ? {
              enableTurnFanSplay: true,
              enableTiltSizeShading: true,
              enableStrokeTaper: true,
            }
          : {},
      );
      await lane.init(fakeEnv(), { ...CONTRACT_INIT, width: 128, height: 128 });
      lane.beginStroke(program, 20261110);
      lane.addSamples(curveSamples);
      await lane.endStroke();
      const linear = await lane.readbackLinear();
      lane.dispose();
      if (!linear) throw new Error("물리 붓털 레인의 선형 픽셀을 읽지 못했습니다.");
      return linear;
    };

    const baseA = await runLane(false);
    const baseB = await runLane(false);
    expect(baseA).toEqual(baseB);

    const enhanced = await runLane(true);
    let diffPixels = 0;
    for (let i = 0; i < baseA.length; i += 4) {
      if (Math.abs((baseA[i + 3] ?? 0) - (enhanced[i + 3] ?? 0)) > 1e-4) {
        diffPixels += 1;
      }
    }
    expect(diffPixels).toBeGreaterThan(20);
  });
});
