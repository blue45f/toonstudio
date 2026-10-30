import { describe, expect, it } from "vitest";

import { createStudioHybridDccDefaultToonMaterial, hashStudioHybridDccToonMaterial, normalizeStudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

describe("툰 재질의 순수 DTO", () => {
  it("sRGB hex·범위를 정규화하고 detached 불변 DTO와 내용 ID를 만든다", () => {
    const source = { ...createStudioHybridDccDefaultToonMaterial(), baseColorSrgb: "#ABCDEF", outline: { enabled: true, mode: "screenCoordinates", width: .01, colorSrgb: "#123ABC" } };
    const material = normalizeStudioHybridDccToonMaterial(source);
    expect(material.baseColorSrgb).toBe("#abcdef"); expect(material.outline.colorSrgb).toBe("#123abc");
    expect(material.outline.width).toBe(.01); // 화면 높이의 1%이며 px 단위가 아니다.
    expect(Object.isFrozen(material)).toBe(true); expect(Object.isFrozen(material.outline)).toBe(true);
    source.outline.width = .02; expect(material.outline.width).toBe(.01);
    expect(hashStudioHybridDccToonMaterial(material)).toMatch(/^toon-material:sha256:[0-9a-f]{64}$/u);
    expect(hashStudioHybridDccToonMaterial({ ...material, baseColorSrgb: "#ABCDEF" })).toBe(hashStudioHybridDccToonMaterial(material));
    expect(hashStudioHybridDccToonMaterial({ ...material, shadingShift: .2 })).not.toBe(hashStudioHybridDccToonMaterial(material));
  });

  it("default·양 끝 범위·0 폭·규격에 임의 상한 없는 유한 Float32 폭을 허용한다", () => {
    const material = createStudioHybridDccDefaultToonMaterial();
    expect(material).toMatchObject({ version: 1, model: "toon", shadingShift: 0, shadingToony: .9,
      outline: { enabled: true, mode: "worldCoordinates", width: .003 } });
    expect(normalizeStudioHybridDccToonMaterial({ ...material, shadingShift: -1, shadingToony: 0, outline: { ...material.outline, width: 0 } }).outline.width).toBe(0);
    expect(normalizeStudioHybridDccToonMaterial({ ...material, shadingShift: 1, shadingToony: 1, outline: { ...material.outline, width: 100 } }).outline.width).toBe(100);
  });

  it.each([
    { version: 2 }, { model: "pbr" }, { baseColorSrgb: "red" }, { shadeColorSrgb: "#fff" }, { extra: true },
    { shadingShift: NaN }, { shadingShift: 1.01 }, { shadingToony: -1 }, { shadingToony: Infinity },
    { outline: { enabled: true, mode: "pixels", width: 1, colorSrgb: "#000000" } },
    { outline: { enabled: true, mode: "worldCoordinates", width: -1, colorSrgb: "#000000" } },
    { outline: { enabled: true, mode: "worldCoordinates", width: 1e40, colorSrgb: "#000000" } },
    { outline: { enabled: "true", mode: "worldCoordinates", width: 1, colorSrgb: "#000000" } },
    { outline: { enabled: true, mode: "worldCoordinates", width: 1, colorSrgb: "#000000", injected: true } },
  ])("손상·범위 밖·알 수 없는 필드를 거부한다: %j", (patch) => {
    expect(() => normalizeStudioHybridDccToonMaterial({ ...createStudioHybridDccDefaultToonMaterial(), ...patch })).toThrow();
  });

  it("상속 필드와 getter를 정본 데이터로 실행하거나 수입하지 않는다", () => {
    expect(() => normalizeStudioHybridDccToonMaterial(Object.create(createStudioHybridDccDefaultToonMaterial()))).toThrow();
    let called = false;
    const value = { ...createStudioHybridDccDefaultToonMaterial() };
    Object.defineProperty(value, "baseColorSrgb", { get() { called = true; return "#ffffff"; } });
    expect(() => normalizeStudioHybridDccToonMaterial(value)).toThrow(); expect(called).toBe(false);
  });
});
