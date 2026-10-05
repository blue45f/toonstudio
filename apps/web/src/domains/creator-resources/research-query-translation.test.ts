import { describe, expect, it, vi } from "vitest";

import {
  containsHangul,
  resolveResearchQueryTranslation,
  translateResearchQuerySync,
} from "./research-query-translation";

import type { ResearchQueryTranslator } from "./research-query-translation";

describe("containsHangul", () => {
  it("한글 음절·자모를 감지하고 영문·숫자·기호는 통과시킨다", () => {
    expect(containsHangul("숲")).toBe(true);
    expect(containsHangul("forest 숲")).toBe(true);
    expect(containsHangul("ㄱ")).toBe(true);
    expect(containsHangul("forest")).toBe(false);
    expect(containsHangul("37.5665,126.9780")).toBe(false);
    expect(containsHangul("")).toBe(false);
  });
});

describe("translateResearchQuerySync — 1차 사전 층", () => {
  it("영문만 입력하면 종전과 완전히 동일하게 통과한다", () => {
    const result = translateResearchQuerySync("forest cabin");
    expect(result.source).toBe("not-needed");
    expect(result.effectiveQuery).toBe("forest cabin");
    expect(result.modelAttempted).toBe(false);
  });

  it("빈 입력과 공백만 있는 입력은 변환 없이 빈 검색어로 둔다", () => {
    expect(translateResearchQuerySync("").effectiveQuery).toBe("");
    expect(translateResearchQuerySync("   ").source).toBe("not-needed");
    expect(translateResearchQuerySync("   ").effectiveQuery).toBe("");
  });

  it("사전으로 완전히 풀리는 한글 검색어를 영문으로 바꾼다", () => {
    const result = translateResearchQuerySync("숲속 오두막");
    expect(result.source).toBe("dictionary");
    expect(result.effectiveQuery).toBe("forest cabin");
    expect(result.unresolved).toEqual([]);
  });

  it("기존 사전의 구 단위 매핑도 그대로 재사용한다", () => {
    expect(translateResearchQuerySync("중세 갑옷").effectiveQuery).toBe("medieval armor");
    expect(translateResearchQuerySync("비 오는 골목").effectiveQuery).toBe("rain alley");
  });

  it("한영 혼합 입력에서는 한글 부분만 사전으로 바꾼다", () => {
    const result = translateResearchQuerySync("NASA 우주 사진");
    expect(result.source).toBe("dictionary");
    expect(result.effectiveQuery).toBe("NASA space photograph");
  });

  it("사전에 없는 표현이 섞이면 부분 변환하고 남은 조각을 보고한다", () => {
    const result = translateResearchQuerySync("안개 낀 등대");
    expect(result.source).toBe("dictionary");
    expect(result.effectiveQuery).toBe("fog 낀 lighthouse");
    expect(result.unresolved).toEqual(["낀"]);
  });

  it("사전으로 전혀 풀리지 않는 한글은 원문 폴백 상태로 보고한다", () => {
    const result = translateResearchQuerySync("울창한 밀림");
    expect(result.source).toBe("original");
    expect(result.effectiveQuery).toBe("울창한 밀림");
    expect(result.unresolved).toEqual(expect.arrayContaining(["울창한", "밀림"]));
  });

  it("특수문자가 붙은 한글 토큰은 지어내지 않고 원문으로 남긴다", () => {
    const result = translateResearchQuerySync("숲!@#");
    expect(result.source).toBe("original");
    expect(result.effectiveQuery).toBe("숲!@#");
  });

  it("특수문자만 있는 입력은 변환 대상이 아니다", () => {
    const result = translateResearchQuerySync("!@#$%");
    expect(result.source).toBe("not-needed");
    expect(result.effectiveQuery).toBe("!@#$%");
  });
});

describe("resolveResearchQueryTranslation — 폴백 사다리", () => {
  const loaderOf = (translator: ResearchQueryTranslator | null) => vi.fn(async () => translator);

  it("사전으로 완결되면 모델 로더를 호출하지 않는다", async () => {
    const loadTranslator = loaderOf(async () => "unused");
    const result = await resolveResearchQueryTranslation("숲속 오두막", loadTranslator);
    expect(result.source).toBe("dictionary");
    expect(result.effectiveQuery).toBe("forest cabin");
    expect(loadTranslator).not.toHaveBeenCalled();
  });

  it("영문 입력에서는 모델 로더를 호출하지 않는다", async () => {
    const loadTranslator = loaderOf(async () => "unused");
    const result = await resolveResearchQueryTranslation("forest cabin", loadTranslator);
    expect(result.source).toBe("not-needed");
    expect(loadTranslator).not.toHaveBeenCalled();
  });

  it("사전이 못 푸는 문장은 모델 번역으로 보강한다", async () => {
    const loadTranslator = loaderOf(async (text: string) => {
      expect(text).toBe("울창한 밀림");
      return "dense jungle";
    });
    const result = await resolveResearchQueryTranslation("울창한 밀림", loadTranslator);
    expect(result.source).toBe("model");
    expect(result.effectiveQuery).toBe("dense jungle");
    expect(result.modelAttempted).toBe(true);
    expect(result.unresolved).toEqual([]);
  });

  it("부분 변환 상태에서도 모델이 성공하면 모델 결과를 쓴다", async () => {
    const loadTranslator = loaderOf(async () => "foggy lighthouse");
    const result = await resolveResearchQueryTranslation("안개 낀 등대", loadTranslator);
    expect(result.source).toBe("model");
    expect(result.effectiveQuery).toBe("foggy lighthouse");
  });

  it("모델 로드 실패(null)면 사전 부분 결과를 유지한다", async () => {
    const result = await resolveResearchQueryTranslation("안개 낀 등대", loaderOf(null));
    expect(result.source).toBe("dictionary");
    expect(result.effectiveQuery).toBe("fog 낀 lighthouse");
    expect(result.modelAttempted).toBe(true);
  });

  it("모델 로드 실패 시 사전이 못 푼 입력은 원문으로 검색한다", async () => {
    const result = await resolveResearchQueryTranslation("울창한 밀림", loaderOf(null));
    expect(result.source).toBe("original");
    expect(result.effectiveQuery).toBe("울창한 밀림");
    expect(result.modelAttempted).toBe(true);
  });

  it("번역기가 던져도 폴백한다", async () => {
    const throwing: ResearchQueryTranslator = async () => {
      throw new Error("모델 로드 실패 흉내");
    };
    const result = await resolveResearchQueryTranslation("울창한 밀림", loaderOf(throwing));
    expect(result.source).toBe("original");
    expect(result.effectiveQuery).toBe("울창한 밀림");
  });

  it("모델 출력에 한글이 남으면 채택하지 않는다", async () => {
    const result = await resolveResearchQueryTranslation("울창한 밀림", loaderOf(async () => "dense 밀림"));
    expect(result.source).toBe("original");
    expect(result.effectiveQuery).toBe("울창한 밀림");
  });

  it("모델 출력이 원문과 같거나 너무 길면 채택하지 않는다", async () => {
    const same = await resolveResearchQueryTranslation("울창한 밀림", loaderOf(async (text) => text));
    expect(same.source).toBe("original");
    const tooLong = await resolveResearchQueryTranslation("울창한 밀림", loaderOf(async () => "a ".repeat(60).trim()));
    expect(tooLong.source).toBe("original");
  });

  it("로더 자체가 던져도 검색은 원문으로 진행된다", async () => {
    const brokenLoader = async (): Promise<ResearchQueryTranslator | null> => {
      throw new Error("동적 import 실패 흉내");
    };
    const result = await resolveResearchQueryTranslation("울창한 밀림", brokenLoader);
    expect(result.source).toBe("original");
    expect(result.modelAttempted).toBe(true);
  });
});
