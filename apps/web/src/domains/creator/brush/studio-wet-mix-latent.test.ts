/**
 * 혼색 브러시의 `latent-pigment`(잠재 안료 표 고속 경로) 방식과 Worker 프로토콜 시험.
 * 표는 첫 잠재 안료 획에서만 굽는다는 것도 확인하므로 이 파일은 다른 시험과 모듈 상태를 나누지 않는다.
 */
import { describe, expect, it } from "vitest";

import { isLatentPigmentTableBaked } from "../brush-lab/pigment/latent-pigment-table";
import { assertStudioRetouchWorkerRequest } from "../studio-retouch-worker-protocol";
import { applyStudioRetouchWorkerRequest } from "../studio-retouch-worker-runtime";

import { wetMixStroke, type WetMixSettings } from "./studio-wet-mix";
import { STUDIO_WET_MIX_MODELS } from "./studio-wet-mix-model";

function flatImage(w: number, h: number, rgba: readonly [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let index = 0; index < w * h; index += 1) data.set(rgba, index * 4);
  return data;
}

function settings(overrides: Partial<WetMixSettings> = {}): WetMixSettings {
  return {
    radiusPx: 6,
    hardness: 1,
    strength: 1,
    wetness: 0.5,
    pickup: 1,
    paintColor: { r: 0, g: 0x50, b: 0xdc },
    ...overrides,
  };
}

const YELLOW = [255, 0xe0, 0, 255] as const;
const STROKE = [{ x: 4, y: 16 }, { x: 28, y: 16 }];
const greenness = (data: Uint8ClampedArray, offset: number): number => data[offset + 1] - (data[offset] + data[offset + 2]) / 2;

describe("wetMixStroke 의 latent-pigment 방식", () => {
  it("다른 방식만 쓰면 표를 굽지 않고, 잠재 안료 획에서 처음 굽는다", () => {
    wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings());
    wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings({ mixModel: "spectral-wgm" }));
    wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings({ mixModel: "ryb" }));
    expect(isLatentPigmentTableBaked()).toBe(false);
    wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings({ mixModel: "latent-pigment" }));
    expect(isLatentPigmentTableBaked()).toBe(true);
  });

  it("방식을 생략하면 명시적 lerp 와 바이트 단위로 같다(기본값 유지)", () => {
    const implicit = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings());
    const explicit = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings({ mixModel: "lerp" }));
    expect(Buffer.from(implicit).equals(Buffer.from(explicit))).toBe(true);
  });

  it("혼색율 0 은 현재 색만 얹으므로 lerp 와 바이트 단위로 같다", () => {
    const lerp = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings({ wetness: 0, mixModel: "lerp" }));
    const latent = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings({ wetness: 0, mixModel: "latent-pigment" }));
    expect(Buffer.from(latent).equals(Buffer.from(lerp))).toBe(true);
  });

  it("혼색율 1 로 평평한 바닥을 지나가면 바닥색이 그대로 남는다(무손실 끝점)", () => {
    const data = flatImage(32, 32, [120, 64, 200, 255]);
    wetMixStroke(data, 32, 32, STROKE, settings({ wetness: 1, mixModel: "latent-pigment" }));
    expect(Buffer.from(data).equals(Buffer.from(flatImage(32, 32, [120, 64, 200, 255])))).toBe(true);
  });

  it("노랑 바닥에 파랑을 한 번 찍어 반반 섞으면 lerp 보다 초록 쪽이다(안료다운 방향)", () => {
    // 탭 한 번 = 도장 1개: 머금은 색 = 바닥(노랑), 얹는 색 = 섞는 방식(파랑, 노랑, 0.5). 두 방식의 덮임은 같다.
    const tap = [{ x: 16, y: 16 }];
    const lerp = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, tap, settings({ mixModel: "lerp" }));
    const latent = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, tap, settings({ mixModel: "latent-pigment" }));
    const centre = (16 * 32 + 16) * 4;
    expect(latent[centre + 3]).toBe(255);
    expect(latent[centre + 1]).toBeGreaterThan(latent[centre]);
    expect(latent[centre + 1]).toBeGreaterThan(latent[centre + 2]);
    expect(greenness(latent, centre)).toBeGreaterThan(greenness(lerp, centre));
  });

  it("결정적이다 — 같은 입력은 같은 바이트를 낸다", () => {
    const first = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings({ mixModel: "latent-pigment" }));
    const second = wetMixStroke(flatImage(32, 32, YELLOW), 32, 32, STROKE, settings({ mixModel: "latent-pigment" }));
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });
});

describe("리터치 Worker 프로토콜과 런타임", () => {
  function request(mixModel: unknown) {
    return {
      kind: "wet-mix" as const,
      data: flatImage(16, 16, YELLOW),
      w: 16,
      h: 16,
      points: [{ x: 2, y: 8 }, { x: 14, y: 8 }],
      settings: { ...settings({ radiusPx: 4 }), mixModel },
    };
  }

  it("패널이 고르는 네 방식과 생략을 받고, 그 밖의 값은 거부한다", () => {
    for (const model of [...STUDIO_WET_MIX_MODELS, undefined]) {
      expect(() => assertStudioRetouchWorkerRequest(request(model))).not.toThrow();
    }
    for (const model of ["kubelka", "LERP", 3, null]) {
      expect(() => assertStudioRetouchWorkerRequest(request(model))).toThrow("혼색 모델이 올바르지 않습니다.");
    }
  });

  it("Worker 단일 실행 런타임의 잠재 안료 결과는 직접 호출과 같다", () => {
    const typed = { ...request(undefined), settings: settings({ radiusPx: 4, mixModel: "latent-pigment" }) };
    const viaRuntime = applyStudioRetouchWorkerRequest(typed);
    const direct = request(undefined);
    wetMixStroke(direct.data, 16, 16, direct.points, settings({ radiusPx: 4, mixModel: "latent-pigment" }));
    expect(viaRuntime.kind).toBe("wet-mix");
    expect(Buffer.from(viaRuntime.data).equals(Buffer.from(direct.data))).toBe(true);
  });
});
