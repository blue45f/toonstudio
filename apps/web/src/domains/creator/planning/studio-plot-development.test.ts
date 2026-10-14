import { describe, expect, it } from "vitest";

import {
  applyDevelopmentSuggestion,
  inferPlotStage,
  nextEpisodeSeedFromSuggestion,
  suggestNextDevelopments,
} from "./studio-plot-development";

describe("inferPlotStage", () => {
  it("빈 기획은 도입 단계에서 시작한다", () => {
    expect(inferPlotStage([]).id).toBe("opening");
    expect(inferPlotStage(["  "]).id).toBe("opening");
  });

  it("turningPoints 개수만큼 단계가 전진한다", () => {
    expect(inferPlotStage(["a"]).id).toBe("inciting");
    expect(inferPlotStage(["a", "b", "c"]).id).toBe("midpoint");
    expect(inferPlotStage(["a", "b", "c", "d", "e", "f", "g", "h", "i"]).id).toBe("hook");
  });

  it("마지막 비트의 후반 신호어는 한 단계만 당긴다", () => {
    expect(inferPlotStage(["a", "조력자의 정체가 드러난다"]).id).toBe("midpoint");
    expect(inferPlotStage(["a", "평범한 하루"]).id).toBe("escalation");
  });
});

describe("suggestNextDevelopments", () => {
  it("같은 입력은 항상 같은 제안을 만든다 (결정적)", () => {
    const input = { genre: "판타지", turningPoints: ["평범한 물건이 빛난다"], coreConflict: "힘과 대가" };
    expect(suggestNextDevelopments(input)).toEqual(suggestNextDevelopments(input));
  });

  it("제안은 최대 3개, 현재 단계 라벨을 단다", () => {
    const suggestions = suggestNextDevelopments({ turningPoints: [] });
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((s) => s.stage === "opening")).toBe(true);
    expect(suggestions.every((s) => s.stageLabel === "도입")).toBe(true);
  });

  it("장르 풍미가 공통 틀보다 먼저 제안된다", () => {
    const suggestions = suggestNextDevelopments({
      genre: "스릴러",
      turningPoints: ["목격", "추적", "증거 발견", "용의자 특정"],
    });
    expect(suggestions[0]?.stage).toBe("complication");
    expect(suggestions[0]?.title).toBe("조력자의 거짓말");
  });

  it("모르는 장르는 공통 라이브러리로 폴백한다", () => {
    const suggestions = suggestNextDevelopments({ genre: "사이버펑크", turningPoints: [] });
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("이미 turningPoints에 있는 전개는 다시 제안하지 않는다", () => {
    const first = suggestNextDevelopments({ turningPoints: [] });
    const applied = applyDevelopmentSuggestion([], first[0]!);
    const next = suggestNextDevelopments({ turningPoints: applied.turningPoints });
    expect(next.every((s) => s.text !== first[0]!.text)).toBe(true);
  });

  it("무시한 제안은 빠지고 다음 후보가 그 자리를 채운다", () => {
    const base = suggestNextDevelopments({ turningPoints: ["a", "b", "c", "d", "e", "f"] });
    const dismissedId = base[0]!.id;
    const after = suggestNextDevelopments(
      { turningPoints: ["a", "b", "c", "d", "e", "f"] },
      { dismissedIds: [dismissedId] },
    );
    expect(after.some((s) => s.id === dismissedId)).toBe(false);
    expect(after[0]?.id).toBe(base[1]?.id);
  });

  it("핵심 갈등이 제안 문장과 근거에 반영된다", () => {
    const suggestions = suggestNextDevelopments({
      turningPoints: ["a", "b"],
      coreConflict: "복수의 맹세와 지키고 싶은 사람들",
    });
    expect(suggestions.some((s) => s.text.includes("복수의 맹세"))).toBe(true);
    expect(suggestions[0]?.rationale).toContain("복수의 맹세");
  });
});

describe("applyDevelopmentSuggestion — 순환 루프", () => {
  it("고른 제안만 끝에 덧붙이고 원본은 바꾸지 않는다", () => {
    const original = Object.freeze(["첫 사건"]);
    const suggestion = suggestNextDevelopments({ turningPoints: original })[0]!;
    const result = applyDevelopmentSuggestion(original, suggestion);
    expect(result.applied).toBe(true);
    expect(result.turningPoints).toEqual(["첫 사건", suggestion.text]);
    expect(original).toEqual(["첫 사건"]);
  });

  it("같은 제안을 두 번 넣으면 두 번째는 적용되지 않는다", () => {
    const suggestion = suggestNextDevelopments({ turningPoints: [] })[0]!;
    const once = applyDevelopmentSuggestion([], suggestion);
    const twice = applyDevelopmentSuggestion(once.turningPoints, suggestion);
    expect(twice.applied).toBe(false);
    expect(twice.turningPoints).toBe(once.turningPoints);
  });

  it("적용하면 다음 제안의 단계가 전진하는 순환이 된다", () => {
    let points: readonly string[] = [];
    const stages: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const suggestion = suggestNextDevelopments({ turningPoints: points })[0]!;
      stages.push(suggestion.stage);
      points = applyDevelopmentSuggestion(points, suggestion).turningPoints;
    }
    expect(stages).toEqual(["opening", "inciting", "escalation"]);
    expect(points).toHaveLength(3);
  });
});

describe("nextEpisodeSeedFromSuggestion — F-7 합류", () => {
  it("hook 단계 제안은 다음 회차 씨앗을 품는다", () => {
    const suggestions = suggestNextDevelopments({
      turningPoints: ["a", "b", "c", "d", "e", "f", "g"],
    });
    expect(suggestions.every((s) => s.stage === "hook")).toBe(true);
    expect(suggestions[0]?.nextEpisodeSeed).toBeTruthy();
    expect(nextEpisodeSeedFromSuggestion(suggestions[0])).toBe(suggestions[0]!.nextEpisodeSeed);
  });

  it("씨앗이 없으면 cliffhanger에서만 만들고, 재료가 없으면 지어내지 않는다", () => {
    expect(nextEpisodeSeedFromSuggestion(null, "문이 열린다")).toContain("문이 열린다");
    expect(nextEpisodeSeedFromSuggestion(null, "  ")).toBe("");
    expect(nextEpisodeSeedFromSuggestion(undefined)).toBe("");
  });
});
