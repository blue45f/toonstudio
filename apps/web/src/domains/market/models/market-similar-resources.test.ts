import { describe, expect, it } from "vitest";

import {
  scoreSimilarMarketResources,
  sortMarketResourcesForDisplay,
} from "./market-similar-resources";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

describe("market-similar-resources", () => {
  it("동일 종류·공유 태그·호환 엔진 기반으로 자기 자신을 제외한 유사 소재를 정렬한다", () => {
    const target = CREATOR_MARKETPLACE_STARTER_RECORDS[0]!;
    const results = scoreSimilarMarketResources(
      target,
      CREATOR_MARKETPLACE_STARTER_RECORDS,
      4,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(4);
    expect(results.some((item) => item.id === target.id)).toBe(false);
    expect(results[0]?.kind).toBe(target.kind);
  });

  it("현재 불러온 목록에 대해 보조 정렬(이름순·경량순·구성 항목순)을 결정론적으로 적용한다", () => {
    const sample = CREATOR_MARKETPLACE_STARTER_RECORDS.slice(0, 5);
    expect(sortMarketResourcesForDisplay(sample, "server")).toBe(sample);

    const byByteSize = sortMarketResourcesForDisplay(sample, "byteSizeAsc");
    for (let index = 1; index < byByteSize.length; index += 1) {
      expect(byByteSize[index]!.manifestByteSize).toBeGreaterThanOrEqual(
        byByteSize[index - 1]!.manifestByteSize,
      );
    }

    const byName = sortMarketResourcesForDisplay(sample, "nameAsc");
    for (let index = 1; index < byName.length; index += 1) {
      expect(
        byName[index - 1]!.name.localeCompare(byName[index]!.name, "ko-KR"),
      ).toBeLessThanOrEqual(0);
    }
  });
});
