import { describe, expect, it } from "vitest";

import {
  absoluteXcfCompositeValue,
  describeXcfLayerMode,
  XCF_COLOR_SPACES,
  XCF_COMPOSITE_MODES,
  XCF_LAYER_MODES,
} from "../xcf-layer-modes";

describe("XCF 레이어 모드 표", () => {
  it("0부터 61까지가 빠짐없이 한 번씩 정의된다", () => {
    expect(XCF_LAYER_MODES.map((mode) => mode.id)).toEqual(Array.from({ length: 62 }, (_, id) => id));
    expect(new Set(XCF_LAYER_MODES.map((mode) => mode.id)).size).toBe(62);
  });

  it("도입 버전 경계는 XCF 0·2·9·10이다", () => {
    const versionOf = (id: number) => describeXcfLayerMode(id)?.introducedInVersion;

    expect([0, 18].map(versionOf)).toEqual([0, 0]);
    expect([19, 22].map(versionOf)).toEqual([2, 2]);
    expect([23, 27].map(versionOf)).toEqual([9, 9]);
    expect([28, 61].map(versionOf)).toEqual([10, 10]);
  });

  it("구형 집합(0~22)만 legacy이고 23 이상은 아니다", () => {
    expect(XCF_LAYER_MODES.filter((mode) => mode.legacy).map((mode) => mode.id)).toEqual(
      Array.from({ length: 23 }, (_, id) => id),
    );
  });

  it("알려진 모드는 이름을, 모르는 값은 null을 돌려준다", () => {
    expect(describeXcfLayerMode(0)?.name).toBe("Normal");
    expect(describeXcfLayerMode(3)?.name).toBe("Multiply");
    expect(describeXcfLayerMode(30)?.name).toBe("Multiply");
    expect(describeXcfLayerMode(61)?.name).toBe("Pass through");
    expect(describeXcfLayerMode(62)).toBeNull();
    expect(describeXcfLayerMode(-1)).toBeNull();
  });

  it("합성 속성 표와 자동(음수) 표기의 절댓값 규칙을 담는다", () => {
    expect([...XCF_COMPOSITE_MODES.keys()]).toEqual([1, 2, 3, 4]);
    expect(XCF_COMPOSITE_MODES.get(2)).toBe("clip-to-backdrop");
    expect([...XCF_COLOR_SPACES.keys()]).toEqual([1, 2, 3, 4]);
    expect(XCF_COLOR_SPACES.get(4)).toBe("rgb-perceptual");
    expect(absoluteXcfCompositeValue(-1)).toBe(1);
    expect(absoluteXcfCompositeValue(3)).toBe(3);
  });
});
