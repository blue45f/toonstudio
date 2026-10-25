import { describe, expect, it } from "vitest";

import {
  analyzeSuneungQuestionTrend,
  canDeleteCurriculumNode,
  compileKaionMaterialPrompt,
  extractMaterialKeywords,
  KAION_DEFAULT_CURRICULUM_NODES,
  KAION_DEFAULT_QUESTIONS,
  recommendRelatedQuestions,
  resolveCurriculumBreadcrumb,
} from "./kaistory-kaion-curriculum";

describe("kaistory-kaion-curriculum", () => {
  it("6단계 교육과정 경로(학교급 > 학년 > 과목 > 대단원 > 중단원 > 세부개념)를 정확히 추적한다", () => {
    const breadcrumb = resolveCurriculumBreadcrumb(
      "concept-inertia-law",
      KAION_DEFAULT_CURRICULUM_NODES,
    );
    expect(breadcrumb.map((node) => node.level)).toEqual([
      "school_level",
      "grade",
      "subject",
      "unit",
      "sub_unit",
      "concept",
    ]);
    expect(breadcrumb.map((node) => node.name)).toEqual([
      "중학교",
      "중학교 1학년",
      "물리",
      "여러 가지 힘과 운동",
      "관성과 알짜힘",
      "뉴턴 제1법칙(관성의 법칙)",
    ]);
  });

  it("하위 노드나 학습자료·문제가 연결된 교육과정 노드의 삭제를 차단한다 (Bottom-Up 안전 검증)", () => {
    const blockedParent = canDeleteCurriculumNode({
      targetNodeId: "subj-physics",
      nodes: KAION_DEFAULT_CURRICULUM_NODES,
      materials: [],
      questions: [],
    });
    expect(blockedParent.canDelete).toBe(false);
    expect(blockedParent.childNodeCount).toBeGreaterThan(0);
    expect(blockedParent.reasonKo).toContain("하위 항목을 먼저 삭제해야 합니다");

    const blockedLeafWithQuestions = canDeleteCurriculumNode({
      targetNodeId: "concept-inertia-law",
      nodes: KAION_DEFAULT_CURRICULUM_NODES,
      materials: [],
      questions: KAION_DEFAULT_QUESTIONS,
    });
    expect(blockedLeafWithQuestions.canDelete).toBe(false);
    expect(blockedLeafWithQuestions.linkedQuestionCount).toBe(3);

    const deletableLeaf = canDeleteCurriculumNode({
      targetNodeId: "concept-inertia-law",
      nodes: KAION_DEFAULT_CURRICULUM_NODES,
      materials: [],
      questions: [],
    });
    expect(deletableLeaf.canDelete).toBe(true);
  });

  it("학습자료 텍스트에서 주요 키워드를 추출하고 AI 문항 생성 프롬프트를 조립한다", () => {
    const keywords = extractMaterialKeywords(
      "관성의 법칙은 알짜힘 $F=0$ 조건에서 등속 직선 운동을 유지하는 성질이다.",
    );
    expect(keywords).toContain("관성의");
    expect(keywords).toContain("알짜힘");

    const concept = KAION_DEFAULT_CURRICULUM_NODES.find((n) => n.id === "concept-inertia-law")!;
    const breadcrumb = resolveCurriculumBreadcrumb(concept.id, KAION_DEFAULT_CURRICULUM_NODES);
    const prompt = compileKaionMaterialPrompt({
      concept,
      breadcrumb,
      keywords: ["관성", "알짜힘"],
      targetDifficulty: "HARD",
      targetQuestionType: "ESSAY",
    });
    expect(prompt).toContain("중학교 > 중학교 1학년 > 물리");
    expect(prompt).toContain("서술형 (AI 채점)");
    expect(prompt).toContain("관성, 알짜힘");
  });

  it("세부개념과 키워드 일치도를 기준으로 최대 10개의 연관 문제를 추천하고 수능 기출 트렌드를 반환한다", () => {
    const related = recommendRelatedQuestions({
      conceptId: "concept-inertia-law",
      keywords: ["관성", "안전벨트"],
      questionBank: KAION_DEFAULT_QUESTIONS,
      limit: 10,
    });
    expect(related).toHaveLength(3);
    expect(related[0]?.id).toBe("q-inertia-essay-3");

    const trend = analyzeSuneungQuestionTrend("물리학");
    expect(trend.subjectName).toBe("물리학I");
    expect(trend.coreConceptFrequency.length).toBeGreaterThanOrEqual(3);
  });
});
