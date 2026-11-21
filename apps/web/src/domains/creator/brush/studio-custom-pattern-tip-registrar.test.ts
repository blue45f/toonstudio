import { describe, expect, it } from "vitest";

import {
  CustomPatternTipRegistrationError,
  StudioCustomPatternTipRegistry,
  computeSelectionContentBounds,
  deserializeCustomPatternTip,
  registerCustomPatternTipFromPixels,
  serializeCustomPatternTip,
  type PatternTipStorageLike,
} from "./studio-custom-pattern-tip-registrar";

function makeCanvasPixels(width: number, height: number, fillRect?: { x: number; y: number; w: number; h: number; rgba: [number, number, number, number] }) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  if (fillRect) {
    for (let y = fillRect.y; y < fillRect.y + fillRect.h; y += 1) {
      for (let x = fillRect.x; x < fillRect.x + fillRect.w; x += 1) {
        const o = (y * width + x) * 4;
        rgba[o] = fillRect.rgba[0];
        rgba[o + 1] = fillRect.rgba[1];
        rgba[o + 2] = fillRect.rgba[2];
        rgba[o + 3] = fillRect.rgba[3];
      }
    }
  }
  return { width, height, rgba };
}

describe("studio-custom-pattern-tip-registrar", () => {
  it("선택 영역 마스크로 바운딩 박스를 자르고 스탬프 팁을 정사각 알파 맵으로 등록·직렬화한다", () => {
    const source = makeCanvasPixels(40, 40, { x: 8, y: 12, w: 16, h: 10, rgba: [20, 20, 20, 200] });
    const mask = new Uint8Array(40 * 40);
    for (let y = 12; y < 22; y += 1) {
      for (let x = 10; x < 20; x += 1) mask[y * 40 + x] = 255;
    }

    const bounds = computeSelectionContentBounds({ ...source, selectionMask: mask });
    expect(bounds).toEqual({ x: 10, y: 12, width: 10, height: 10 });

    const tip = registerCustomPatternTipFromPixels(
      { ...source, selectionMask: mask },
      { name: "별 스탬프", mode: "stamp", targetSize: 32, tags: ["효과", "장식"] },
    );
    expect(tip.width).toBe(32);
    expect(tip.height).toBe(32);
    expect(tip.mode).toBe("stamp");
    expect(tip.rgbaBase64).toBeUndefined();

    const roundtrip = deserializeCustomPatternTip(serializeCustomPatternTip(tip));
    expect(roundtrip.tipId).toBe(tip.tipId);
    expect(roundtrip.alphaMapBase64).toBe(tip.alphaMapBase64);
  });

  it("풀컬러 리본 팁을 종횡비 유지 + 좌우 심리스 블렌드로 생성한다", () => {
    const source = makeCanvasPixels(64, 32, { x: 0, y: 4, w: 64, h: 24, rgba: [220, 80, 120, 255] });
    const tip = registerCustomPatternTipFromPixels(source, {
      name: "레이스 리본",
      mode: "ribbon",
      colorMode: "full-color-rgba",
      targetSize: 32,
      ribbonSeamlessOverlapPx: 6,
    });
    expect(tip.mode).toBe("ribbon");
    expect(tip.width).toBeGreaterThan(tip.height);
    expect(tip.rgbaBase64).toBeTruthy();
    expect(tip.ribbonSeamlessOverlapPx).toBe(6);
  });

  it("빈 선택 영역이나 손상된 직렬화 문자열에 명시적 오류를 던진다", () => {
    const empty = makeCanvasPixels(16, 16);
    expect(() => registerCustomPatternTipFromPixels(empty, { name: "빈 팁", mode: "stamp" })).toThrow(
      CustomPatternTipRegistrationError,
    );
    expect(() => deserializeCustomPatternTip("{not-json")).toThrow(CustomPatternTipRegistrationError);
  });

  it("레지스트리가 콘텐츠 해시 중복을 병합하고 스토리지 왕복 복원을 지원한다", () => {
    const store = new Map<string, string>();
    const storage: PatternTipStorageLike = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    };
    const registry = new StudioCustomPatternTipRegistry({ storage });
    const src = makeCanvasPixels(24, 24, { x: 4, y: 4, w: 12, h: 12, rgba: [0, 0, 0, 255] });
    const first = registerCustomPatternTipFromPixels(src, { name: "초기 이름", mode: "stamp", targetSize: 32 });
    const dup = registerCustomPatternTipFromPixels(src, { name: "수정된 이름", mode: "stamp", targetSize: 32, tags: ["선화"] });

    registry.register(first);
    const merged = registry.register(dup);
    expect(registry.list()).toHaveLength(1);
    expect(merged.name).toBe("수정된 이름");

    const restored = new StudioCustomPatternTipRegistry({ storage });
    expect(restored.list({ tag: "선화" })).toHaveLength(1);
    expect(restored.get(merged.tipId)?.name).toBe("수정된 이름");
  });

  it("기본 저장소는 메모리이며 주입 저장소 실패를 숨기거나 기존 원본을 지우지 않는다", () => {
    const source = makeCanvasPixels(24, 24, { x: 4, y: 4, w: 12, h: 12, rgba: [0, 0, 0, 255] });
    const tip = registerCustomPatternTipFromPixels(source, { name: "보존할 팁", mode: "stamp", targetSize: 32 });
    const memory = new StudioCustomPatternTipRegistry();
    memory.register(tip);
    expect(memory.get(tip.tipId)).toEqual(tip);
    expect(new StudioCustomPatternTipRegistry().list()).toEqual([]);

    const stored = new Map([["toonstudio:custom-pattern-tips:v1", JSON.stringify([tip])]]);
    const storage: PatternTipStorageLike = {
      getItem: (key) => stored.get(key) ?? null,
      setItem: () => { throw new Error("저장 거부"); },
    };
    const registry = new StudioCustomPatternTipRegistry({ storage });
    expect(() => registry.register({ ...tip, name: "메모리 편집" })).toThrow("저장 거부");
    expect(registry.get(tip.tipId)?.name).toBe("메모리 편집");
    expect(new StudioCustomPatternTipRegistry({ storage }).get(tip.tipId)?.name).toBe("보존할 팁");
  });
});
