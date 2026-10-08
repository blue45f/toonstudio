import { describe, expect, it } from "vitest";

import { PAINTABLE_PART_ROLES, PART_ROLES } from "../contracts";

import { KIT_UV_STABLE_PAINT_ROLES, KIT_VARIANT_UV_PAINT_ROLES, kitPaintWarningKo, kitPaintWarningsForLayers } from "./paint-kit-warning";
import { createPaintLayer } from "./paint-layer";

import type { CharacterSource } from "../contracts";

const OTHER_SOURCES: readonly CharacterSource["kind"][] = ["procedural", "package"];

describe("kitPaintWarningKo", () => {
  it("키트에서 변형마다 UV가 달라지는 5개 역할만 경고한다(피부·머리는 고정)", () => {
    expect(KIT_UV_STABLE_PAINT_ROLES).toEqual(["skin", "head"]);
    expect(KIT_VARIANT_UV_PAINT_ROLES).toEqual(["hair", "top", "bottom", "shoes", "accessory"]);
    expect(kitPaintWarningKo("kit", "skin")).toBeNull();
    expect(kitPaintWarningKo("kit", "head")).toBeNull();
    expect(kitPaintWarningKo("kit", "top")).toBe("상의 변형을 바꾸면 UV가 달라져 그림이 어긋납니다. 변형을 확정한 뒤에 칠하세요.");
    expect(kitPaintWarningKo("kit", "hair")).toMatch(/^헤어 변형을 바꾸면 UV가 달라져 그림이 어긋납니다/u);
  });

  it("페인트 가능 역할 전부가 안전(null) 또는 경고(한글 문구) 중 하나로 판정된다", () => {
    for (const role of PAINTABLE_PART_ROLES) {
      const message = kitPaintWarningKo("kit", role);
      if (KIT_UV_STABLE_PAINT_ROLES.includes(role)) expect(message).toBeNull();
      else expect(message).toMatch(/[가-힣]/u);
    }
    expect([...KIT_UV_STABLE_PAINT_ROLES, ...KIT_VARIANT_UV_PAINT_ROLES].sort()).toEqual([...PAINTABLE_PART_ROLES].sort());
  });

  it("페인트 불가 역할(속옷·안구 등)과 키트가 아닌 소스에는 경고하지 않는다", () => {
    for (const role of PART_ROLES) {
      if (PAINTABLE_PART_ROLES.includes(role)) continue;
      expect(kitPaintWarningKo("kit", role)).toBeNull();
    }
    for (const kind of OTHER_SOURCES) {
      for (const role of PART_ROLES) expect(kitPaintWarningKo(kind, role)).toBeNull();
    }
  });
});

describe("kitPaintWarningsForLayers", () => {
  it("칠한 픽셀이 있는 변형 의존 레이어만 입력 순서대로 경고한다", () => {
    const painted = (part: Parameters<typeof createPaintLayer>[0]) => {
      const layer = createPaintLayer(part, 16);
      layer.rgba[3] = 255;
      return layer;
    };
    const layers = [painted("skin"), painted("top"), createPaintLayer("bottom", 16), painted("hair"), painted("shoes")];
    const warnings = kitPaintWarningsForLayers("kit", layers);
    expect(warnings.map((w) => w.part)).toEqual(["top", "hair", "shoes"]);
    expect(warnings[0]?.messageKo).toBe(kitPaintWarningKo("kit", "top"));
    expect(kitPaintWarningsForLayers("procedural", layers)).toEqual([]);
    expect(kitPaintWarningsForLayers("package", layers)).toEqual([]);
    expect(kitPaintWarningsForLayers("kit", [])).toEqual([]);
  });
});
