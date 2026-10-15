import { describe, expect, it } from "vitest";

import {
  MY_STORY_CUT_ROLES,
  MY_STORY_SLOT_IDS,
  MY_STORY_TEMPLATE_IDS,
  MY_STORY_TONES,
  type MyStoryCutCount,
} from "./my-story-model";
import {
  MY_STORY_TEMPLATES,
  myStorySkeleton,
  myStoryTemplateById,
  resolveMyStoryCutCount,
  resolveMyStoryToneId,
} from "./my-story-templates";

describe("주제 템플릿 팩 6종", () => {
  it("회고·가족·동네·경력·안전 수칙·금융 상식 순서로 6종이 있다", () => {
    expect(MY_STORY_TEMPLATES.map((template) => template.id)).toEqual([
      "retrospective",
      "family",
      "neighborhood",
      "career",
      "safety",
      "finance",
    ]);
    expect(MY_STORY_TEMPLATES.map((template) => template.id)).toEqual([...MY_STORY_TEMPLATE_IDS]);
  });

  it.each(MY_STORY_TEMPLATES.map((template) => [template.id, template] as const))(
    "%s: 질문 6~8문항, 칸 중복 없음, 한국어·영어 문구와 예시가 모두 있다",
    (_id, template) => {
      expect(template.questions.length).toBeGreaterThanOrEqual(6);
      expect(template.questions.length).toBeLessThanOrEqual(8);
      const slots = template.questions.map((question) => question.slot);
      expect(new Set(slots).size).toBe(slots.length);
      for (const slot of slots) expect(MY_STORY_SLOT_IDS).toContain(slot);
      for (const question of template.questions) {
        for (const text of [
          question.labelKo, question.labelEn, question.promptKo, question.promptEn,
          question.exampleKo, question.exampleEn,
        ]) {
          expect(text.trim().length).toBeGreaterThan(0);
        }
        expect(question.promptKo).toMatch(/[가-힣]/u);
        // 영어 문구는 한국어를 그대로 복사한 것이 아니어야 한다.
        expect(question.promptEn).not.toMatch(/[가-힣]/u);
      }
      for (const text of [template.titleKo, template.titleEn, template.summaryKo, template.summaryEn, template.defaultTitleKo, template.defaultTitleEn]) {
        expect(text.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it.each(MY_STORY_TEMPLATES.map((template) => [template.id, template] as const))(
    "%s: 컷 구조 골격이 컷 수와 맞고, 모든 칸이 컷에 배치되며, 나레이션·대사 칸은 컷 요약 안에 있다",
    (_id, template) => {
      expect(template.cutCounts.length).toBeGreaterThan(0);
      const questionSlots = new Set(template.questions.map((question) => question.slot));
      for (const cutCount of [4, 8] as const satisfies readonly MyStoryCutCount[]) {
        const skeleton = template.skeletons[cutCount];
        if (!template.cutCounts.includes(cutCount)) {
          expect(skeleton).toBeNull();
          continue;
        }
        expect(skeleton).not.toBeNull();
        expect(skeleton?.length).toBe(cutCount);
        const used = new Set<string>();
        for (const def of skeleton ?? []) {
          expect(MY_STORY_CUT_ROLES[def.role]).toBeDefined();
          expect(def.from.length).toBeGreaterThan(0);
          for (const slot of def.from) {
            expect(questionSlots.has(slot)).toBe(true);
            used.add(slot);
          }
          // 나레이션·말풍선 후보는 그 컷 요약에 모인 답변에서만 가져온다 — 요약이 원문 보존의 기준이다.
          if (def.narrate) expect(def.from).toContain(def.narrate);
          if (def.say) expect(def.from).toContain(def.say);
        }
        // 어떤 답변도 컷에 배치되지 않고 버려지면 안 된다.
        for (const slot of questionSlots) expect(used.has(slot)).toBe(true);
      }
    },
  );

  it("회고·가족·경력은 8컷과 4컷, 동네·안전 수칙·금융 상식은 4컷 골격을 가진다", () => {
    const counts = Object.fromEntries(MY_STORY_TEMPLATES.map((template) => [template.id, template.cutCounts]));
    expect(counts).toEqual({
      retrospective: [8, 4],
      family: [8, 4],
      neighborhood: [4],
      career: [8, 4],
      safety: [4],
      finance: [4],
    });
  });

  it("톤 프리셋과 나레이션·말풍선 기본값이 템플릿마다 정해져 있다", () => {
    for (const template of MY_STORY_TEMPLATES) {
      expect(template.toneIds.length).toBeGreaterThan(0);
      for (const toneId of template.toneIds) expect(MY_STORY_TONES[toneId].id).toBe(toneId);
      expect(template.narration.maxChars).toBeGreaterThanOrEqual(20);
      expect(template.narration.maxChars).toBeLessThanOrEqual(60);
      expect(template.balloon.maxChars).toBeGreaterThanOrEqual(10);
      expect(["top", "bottom"]).toContain(template.narration.position);
      expect(["dialogue", "thought"]).toContain(template.balloon.kind);
    }
  });

  it("사실 확인 책임이 사용자에게 있는 안전·금융 팩만 주의 문구를 가진다", () => {
    const withCaution = MY_STORY_TEMPLATES.filter((template) => template.cautionKo).map((template) => template.id);
    expect(withCaution).toEqual(["safety", "finance"]);
    for (const id of withCaution) {
      const template = myStoryTemplateById(id);
      expect(template?.cautionEn).toBeTruthy();
    }
  });

  it("조회·보정 함수: 모르는 값은 null/기본값으로 돌린다", () => {
    expect(myStoryTemplateById("family")?.id).toBe("family");
    expect(myStoryTemplateById("nope")).toBeNull();
    expect(myStoryTemplateById(null)).toBeNull();
    const neighborhood = myStoryTemplateById("neighborhood");
    const retrospective = myStoryTemplateById("retrospective");
    expect(neighborhood && resolveMyStoryCutCount(neighborhood, 8)).toBe(4);
    expect(retrospective && resolveMyStoryCutCount(retrospective, undefined)).toBe(8);
    expect(retrospective && resolveMyStoryCutCount(retrospective, 4)).toBe(4);
    expect(retrospective && resolveMyStoryToneId(retrospective, "clear-guide")).toBe("warm-memory");
    expect(retrospective && resolveMyStoryToneId(retrospective, "steady-record")).toBe("steady-record");
    expect(neighborhood && myStorySkeleton(neighborhood, 8).cutCount).toBe(4);
    expect(retrospective && myStorySkeleton(retrospective, 4).cuts).toHaveLength(4);
  });
});
