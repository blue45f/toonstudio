import { describe, expect, it } from "vitest";

import {
  suggestStudioPoses,
  type PoseCatalogEntry,
} from "./studio-pose-suggestion";

/** 실재 고급 포즈 라이브러리 메타 부분집합 (main 실측 id·태그 구조). */
const CATALOG: readonly PoseCatalogEntry[] = Object.freeze([
  { id: "action-hero-landing", name: "히어로 3점 착지", category: "action", gender: "any", figures: 1, tags: ["착지", "영웅"], description: "" },
  { id: "action-sword-slash", name: "일도양단 발도세", category: "action", gender: "any", figures: 1, tags: ["검", "전투"], description: "" },
  { id: "daily-sitting-chair", name: "의자에 턱 괴고 앉기", category: "daily", gender: "any", figures: 1, tags: ["앉기", "생각"], description: "" },
  { id: "daily-coffee-sip", name: "머그잔 마시기", category: "daily", gender: "any", figures: 1, tags: ["카페", "커피"], description: "" },
  { id: "dramatic-shock-stepback", name: "경악하며 뒷걸음질", category: "dramatic", gender: "any", figures: 1, tags: ["놀람", "충격"], description: "" },
  { id: "dramatic-romantic-hug", name: "로맨스 포옹", category: "dramatic", gender: "any", figures: 2, tags: ["포옹", "고백"], description: "" },
  { id: "dramatic-wall-slam-kabe-don", name: "벽치기 카베동", category: "dramatic", gender: "male", figures: 2, tags: ["벽치기", "심쿵"], description: "" },
]);

describe("suggestStudioPoses", () => {
  it("감정이 주입되면 친화 프리셋이 1순위로 온다", () => {
    const result = suggestStudioPoses(CATALOG, { emotion: "shock-gasp" });
    expect(result.resolvedEmotion).toBe("shock-gasp");
    expect(result.suggestions[0]?.presetId).toBe("dramatic-shock-stepback");
    expect(result.suggestions[0]?.reasons).toContain("emotion-match");
  });

  it("대사만으로 감정을 약식 판정한다", () => {
    const result = suggestStudioPoses(CATALOG, { dialogue: "뭐…? 말도 안 돼!" });
    expect(result.resolvedEmotion).toBe("shock-gasp");
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("장면 설명 키워드가 태그와 맞으면 keyword-match 근거가 붙는다", () => {
    const result = suggestStudioPoses(CATALOG, {
      sceneDescription: "카페에서 커피를 마시는 장면",
    });
    const coffee = result.suggestions.find((s) => s.presetId === "daily-coffee-sip");
    expect(coffee).toBeDefined();
    expect(coffee?.reasons).toContain("keyword-match");
    expect(coffee?.matchedTags).toContain("카페");
  });

  it("인원 조건과 다른 프리셋은 제외한다 (fail-closed)", () => {
    const result = suggestStudioPoses(CATALOG, {
      emotion: "romance-blush",
      figures: 1,
    });
    expect(
      result.suggestions.every((s) => s.presetId !== "dramatic-romantic-hug"),
    ).toBe(true);
  });

  it("성별 조건: female이면 male 전용 프리셋이 빠진다", () => {
    const result = suggestStudioPoses(CATALOG, {
      emotion: "romance-blush",
      gender: "female",
    });
    expect(
      result.suggestions.every((s) => s.presetId !== "dramatic-wall-slam-kabe-don"),
    ).toBe(true);
  });

  it("빈 카탈로그와 무근거 맥락에서는 빈 결과를 반환한다", () => {
    expect(suggestStudioPoses([], { emotion: "rage-shout" }).suggestions).toEqual([]);
    expect(suggestStudioPoses(CATALOG, {}).suggestions).toEqual([]);
  });

  it("limit을 존중하고 결과는 동결된다", () => {
    const result = suggestStudioPoses(CATALOG, { emotion: "neutral-calm", limit: 2 });
    expect(result.suggestions.length).toBeLessThanOrEqual(2);
    expect(Object.isFrozen(result.suggestions)).toBe(true);
  });
});
