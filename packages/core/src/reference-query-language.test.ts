import { describe, expect, it } from "vitest";

import { resolveGbifSpeciesAlias, resolveReferenceQuery } from "./reference-query-language";

describe("resolveGbifSpeciesAlias — GBIF 서버 별칭표 (F-B14-1)", () => {
  it("한글 종명을 학명으로 해석한다", () => {
    expect(resolveGbifSpeciesAlias("여우")).toBe("Vulpes vulpes");
    expect(resolveGbifSpeciesAlias("호랑이")).toBe("Panthera tigris");
    expect(resolveGbifSpeciesAlias("붉은여우")).toBe("Vulpes vulpes");
    expect(resolveGbifSpeciesAlias("은행나무")).toBe("Ginkgo biloba");
  });

  it("서버 별칭 적용 조건과 같이 NFKC 정규화와 앞뒤 공백을 흡수한다", () => {
    expect(resolveGbifSpeciesAlias(" 여우 ")).toBe("Vulpes vulpes");
  });

  it("별칭 범위 밖 질의는 null이라 클라이언트 사전 보강 대상이 된다", () => {
    expect(resolveGbifSpeciesAlias("사슴")).toBeNull();
    expect(resolveGbifSpeciesAlias("여우 사진")).toBeNull();
    expect(resolveGbifSpeciesAlias("Vulpes vulpes")).toBeNull();
    expect(resolveGbifSpeciesAlias("")).toBeNull();
  });

  it("클라이언트 사전의 영문 일반명 변환과 역할이 갈린다", () => {
    // 사전은 여우→fox(일반명)로 바꾸지만, GBIF 매칭은 일반명을 확정하지 못한다.
    // 별칭표가 있는 질의는 사전이 아니라 서버 별칭 해석이 우선해야 한다.
    expect(resolveReferenceQuery("여우").providerQuery).toBe("fox");
    expect(resolveGbifSpeciesAlias("여우")).toBe("Vulpes vulpes");
  });
});
