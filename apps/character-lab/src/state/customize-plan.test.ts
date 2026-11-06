import { describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, createDefaultRecipe, createPresetCatalog } from "../contracts";
import { vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { materialPresetFor, presetUnavailableReasonKo } from "./apply-plan";
import { addNeutralFacs, layerUnavailableReasonKo, planCustomization } from "./customize-plan";
import { FACS_ANTAGONISTS, relaxAntagonists } from "./facs-antagonists";

describe("state/customize-plan & facs-antagonists", () => {
  it("addNeutralFacs는 길항 관계가 없는 중립 표정을 더하고 1로 클램프한다", () => {
    expect(addNeutralFacs({ browDown: 0.9, mouthSmile: 0.4 }, { browDown: 0.2, eyeSquint: 0.3 })).toEqual({
      browDown: 1,
      mouthSmile: 0.4,
      eyeSquint: 0.3,
    });
  });

  it("addNeutralFacs는 사용자의 명시 표정과 길항 관계인 화풍 중립 표정(예: mouthFrown 활성 시 mouthSmile)을 억제한다", () => {
    expect(addNeutralFacs({ mouthFrown: 0.8 }, { mouthSmile: 0.25, eyeSquint: 0.2 })).toEqual({
      mouthFrown: 0.8,
      eyeSquint: 0.2,
    });
    expect(addNeutralFacs({ browDown: 0.7 }, { browInnerUp: 0.3, browOuterUp: 0.25, mouthSmile: 0.15 })).toEqual({
      browDown: 0.7,
      mouthSmile: 0.15,
    });
    expect(addNeutralFacs({ eyeWide: 0.6 }, { eyeBlinkLeft: 0.2, eyeSquint: 0.3 })).toEqual({
      eyeWide: 0.6,
    });
    expect(addNeutralFacs({ jawOpen: 0.5 }, { mouthPress: 0.4 })).toEqual({
      jawOpen: 0.5,
    });
  });

  it("relaxAntagonists는 대칭 길항 테이블을 따르고 단일 유닛 지정도 지원한다", () => {
    expect(FACS_ANTAGONISTS.mouthSmile).toContain("mouthFrown");
    expect(FACS_ANTAGONISTS.mouthFrown).toContain("mouthSmile");
    expect(relaxAntagonists({ mouthSmile: 0.3, cheekPuff: 0.2 }, "mouthFrown")).toEqual({ cheekPuff: 0.2 });
  });

  it("layerUnavailableReasonKo와 planCustomization은 미지원 층 사유를 한글로 반환한다", () => {
    const catalog = createPresetCatalog(vocabularyCatalogEntries());
    const base = createDefaultRecipe();
    const recipe = {
      ...base,
      wardrobe: { ...base.wardrobe, outer: "top/blazer" as const },
    };
    const caps = {
      ...ALL_AVAILABLE_CAPABILITIES,
      top: { status: "unavailable" as const, reasonKo: "상의 슬롯 미지원" },
    };
    expect(layerUnavailableReasonKo("outer", caps)).toBe("상의 슬롯 미지원");
    const planned = planCustomization({
      recipe,
      capabilities: caps,
      catalog,
      unsupportedSlots: new Set(["top"]),
      presetUnavailableReason: presetUnavailableReasonKo,
      materialPresetFor,
    });
    expect(planned.unsupportedCustom).toEqual([{ kind: "layer", key: "outer", reasonKo: "상의 슬롯 미지원" }]);
  });
});
