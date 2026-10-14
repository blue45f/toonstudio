import { describe, expect, it } from "vitest";

import { createPropInstance, parseVrmProps, propDefById, serializeVrmProps } from "./studio-vrm-props";

describe("소품 장착 기본값 = 그립 프리셋", () => {
  it("양손 소품(검)은 장착 즉시 반대 손 양손 그립이 기본으로 켜진다", () => {
    const sword = createPropInstance("sword", "grip-default-sword")!;
    expect(sword.rig?.secondary).toEqual({
      enabled: true,
      anchorId: "secondary",
      bone: "leftHand",
      influence: 0.82,
    });
  });

  it("주 손이 왼손인 양손 소품(책)은 보조 손이 오른손이 된다", () => {
    const book = createPropInstance("book", "grip-default-book")!;
    expect(book.bone).toBe("leftHand");
    expect(book.rig?.secondary).toEqual({
      enabled: true,
      anchorId: "secondary",
      bone: "rightHand",
      influence: 0.65,
    });
  });

  it("보조 앵커가 없는 한손 소품은 secondary가 생기지 않는다", () => {
    for (const id of ["smartphone", "mug", "mic"]) {
      expect(createPropInstance(id, `grip-single-${id}`)!.rig?.secondary, id).toBeUndefined();
    }
    // 기존 고정 테스트(스마트폰 rig 전체 동등성)와 정합: rig 키 구성이 종전과 같다.
    expect(createPropInstance("smartphone", "grip-single-phone")!.rig).toEqual({
      version: 2,
      mode: "auto",
      anchorId: "primary",
      autoScale: true,
      autoFingerPose: true,
      gripFit: 1,
      deltaPosition: [0, 0, 0],
      deltaRotationDeg: [0, 0, 0],
      deltaScale: 1,
    });
  });

  it("몸 소품(백팩·숄더백)은 손 그립 기본값이 붙지 않는다", () => {
    for (const id of ["backpack", "shoulderbag"]) {
      expect(createPropInstance(id, `grip-body-${id}`)!.rig?.secondary, id).toBeUndefined();
    }
    expect(propDefById("shoulderbag")?.defaultBone).toBe("chest");
  });

  it("기본 양손 그립은 직렬화 라운드트립에서 보존된다", () => {
    const sword = createPropInstance("sword", "grip-roundtrip")!;
    const parsed = parseVrmProps(serializeVrmProps([sword]));
    expect(parsed.items[0].rig?.secondary).toEqual(sword.rig?.secondary);
  });
});
