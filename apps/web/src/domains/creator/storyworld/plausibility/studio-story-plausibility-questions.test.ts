import { describe, expect, it } from "vitest";

import { analyzeStoryworldProject, type StoryworldProject } from "../studio-storyworld-causality";
import { parseStoryworldProject } from "../studio-storyworld-document";
import { DOJIN, HAEUN, makeStory } from "./studio-story-plausibility-golden-fixtures";
import {
  PLAUSIBILITY_QUESTIONS,
  isToggleFact,
  markQuestion,
  plausibilityQuestionnaireProgress,
  plausibilitySceneProgress,
  setSceneCause,
  setSceneCoincidence,
  setSceneConsequence,
  setSceneInformation,
  setSceneMotives,
  setSceneRoles,
  skipScene,
} from "./studio-story-plausibility-questions";
import { computePlausibilityCoverage, plausibilityQuestionStatus } from "./studio-story-plausibility-status";

const BASE: StoryworldProject = makeStory("q", "질문지", {
  characters: [HAEUN, DOJIN],
  facts: [
    { id: "culprit", label: "범인은 도진이다", subjectId: "world", key: "culprit", initialValue: true },
    { id: "door-open", label: "문이 열렸다", subjectId: "world", key: "door", initialValue: false },
    { id: "gold", label: "금화 수", subjectId: "world", key: "gold", initialValue: 3 },
  ],
  scenes: [
    { id: "s1", title: "의뢰", order: 10, timeIndex: 1, locationId: "사무실", participantIds: ["haeun"] },
    { id: "s2", title: "추궁", order: 20, timeIndex: 2, locationId: "사무실", participantIds: ["haeun", "dojin"], knowledgeUses: [{ characterId: "haeun", factId: "culprit" }] },
    { id: "s3", title: "결말", order: 30, timeIndex: 3, locationId: "사무실", participantIds: ["haeun"] },
  ],
});

function scene(project: StoryworldProject, id: string) {
  const found = project.scenes.find((item) => item.id === id);
  if (!found) throw new Error(`장면이 없습니다: ${id}`);
  return found;
}

function codes(project: StoryworldProject): readonly string[] {
  return analyzeStoryworldProject(project).issues.map((issue) => issue.code);
}

describe("질문 목록과 진행 상태", () => {
  it("질문 여섯 개가 정해진 순서로 있고 각각 안내문이 있다", () => {
    expect(PLAUSIBILITY_QUESTIONS.map((question) => question.id)).toEqual(["roles", "motive", "cause", "information", "coincidence", "consequence"]);
    for (const question of PLAUSIBILITY_QUESTIONS) {
      expect(question.prompt.endsWith("?")).toBe(true);
      expect(question.help.length).toBeGreaterThan(10);
    }
  });

  it("답하지 않은 문서는 모든 칸이 미답이고 첫 장면이 다음 차례다", () => {
    const progress = plausibilityQuestionnaireProgress(BASE);
    expect(progress.totalScenes).toBe(3);
    expect(progress.completeScenes).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.nextSceneId).toBe("s1");
    expect(progress.scenes[0]?.statuses.motive).toBe("unanswered");
  });

  it("구조 필드에 이미 데이터가 있으면 질문에 답한 것으로 본다", () => {
    expect(plausibilityQuestionStatus(scene(BASE, "s2"), "information")).toBe("answered");
    expect(plausibilityQuestionStatus(scene(BASE, "s1"), "information")).toBe("unanswered");
  });

  it("건너뛴 칸은 진행으로는 세지만 점검 가능 범위로는 세지 않는다", () => {
    const skipped = skipScene(BASE, "s1");
    const progress = plausibilitySceneProgress(scene(skipped, "s1"));
    expect(progress.complete).toBe(true);
    expect(progress.handled).toBe(6);
    const before = computePlausibilityCoverage(BASE).coveredCells;
    const after = computePlausibilityCoverage(skipped).coveredCells;
    expect(after).toBe(before);
    expect(plausibilityQuestionnaireProgress(skipped).nextSceneId).toBe("s2");
  });

  it("모두 답하면 다음 차례는 null이다", () => {
    let project = BASE;
    for (const id of ["s1", "s2", "s3"]) project = skipScene(project, id);
    const progress = plausibilityQuestionnaireProgress(project);
    expect(progress.nextSceneId).toBeNull();
    expect(progress.percent).toBe(100);
  });
});

describe("답 기록: 공통 규칙", () => {
  it("원본 문서를 바꾸지 않는다", () => {
    const before = JSON.stringify(BASE);
    setSceneRoles(BASE, "s1", ["decision"]);
    setSceneMotives(BASE, "s1", [{ characterId: "haeun", basis: "goal" }]);
    setSceneCause(BASE, "s2", { sceneIds: ["s1"], factIds: [] });
    setSceneInformation(BASE, "s2", [{ characterId: "haeun", factId: "culprit", source: { kind: "initial" } }]);
    setSceneCoincidence(BASE, "s3", { kind: "clue", clue: "foreshadowed", clueSceneIds: ["s1"] });
    setSceneConsequence(BASE, "s1", { established: ["door-open"], ended: [], revealedToReader: [] });
    skipScene(BASE, "s1");
    expect(JSON.stringify(BASE)).toBe(before);
  });

  it("바뀐 것이 없으면 같은 객체를 돌려준다", () => {
    const once = setSceneRoles(BASE, "s1", ["decision"]);
    expect(setSceneRoles(once, "s1", ["decision"])).toBe(once);
    const marked = markQuestion(BASE, "s1", "motive", "not-applicable");
    expect(markQuestion(marked, "s1", "motive", "not-applicable")).toBe(marked);
    expect(setSceneRoles(BASE, "없는 장면", ["decision"])).toBe(BASE);
  });

  it("값이 undefined인 키를 남기지 않는다(같은 내용이면 같은 JSON)", () => {
    const project = setSceneCause(BASE, "s2", { sceneIds: [], factIds: [] });
    expect(Object.keys(scene(project, "s2"))).not.toContain("dependsOnSceneIds");
    expect(Object.keys(scene(project, "s2"))).not.toContain("preconditions");
  });

  it("답한 문서는 저장·불러오기 검증을 그대로 통과한다", () => {
    let project = setSceneRoles(BASE, "s3", ["resolution", "decision"]);
    project = setSceneMotives(project, "s3", [{ characterId: "haeun", basis: "event", causeSceneId: "s1", note: "  의뢰가 계기  " }]);
    project = setSceneCoincidence(project, "s3", { kind: "clue", clue: "foreshadowed", clueSceneIds: ["s1"] });
    project = setSceneConsequence(project, "s3", { established: ["door-open"], ended: [], revealedToReader: ["culprit"] });
    project = markQuestion(project, "s1", "information", "unknown");
    expect(parseStoryworldProject(JSON.stringify(project))).toEqual(project);
  });
});

describe("1. 장면 성격", () => {
  it("선택한 성격을 정해진 순서로 기록하고 질문을 ‘답함’으로 표시한다", () => {
    const project = setSceneRoles(BASE, "s3", ["resolution", "decision"]);
    expect(scene(project, "s3").plausibility).toEqual({ roles: ["decision", "resolution"], answers: { roles: "answered" } });
  });

  it("아무것도 고르지 않아도 답으로 센다(일반 장면)", () => {
    const project = setSceneRoles(BASE, "s1", []);
    expect(plausibilityQuestionStatus(scene(project, "s1"), "roles")).toBe("answered");
  });
});

describe("2. 동기", () => {
  it("없는 인물과 중복 인물은 버리고, 메모는 다듬어 500자로 자른다", () => {
    const project = setSceneMotives(BASE, "s2", [
      { characterId: "haeun", basis: "goal", note: `  ${"가".repeat(700)}  ` },
      { characterId: "haeun", basis: "emotion" },
      { characterId: "ghost", basis: "goal" },
    ]);
    const motives = scene(project, "s2").plausibility?.motives ?? [];
    expect(motives).toHaveLength(1);
    expect(motives[0]?.characterId).toBe("haeun");
    expect(Array.from(motives[0]?.note ?? "")).toHaveLength(500);
  });

  it("앞선 사건이 동기이면 그 장면을 원인으로도 이어 준다(뒤에 있는 장면은 이어 주지 않는다)", () => {
    const before = setSceneMotives(BASE, "s3", [{ characterId: "haeun", basis: "event", causeSceneId: "s1" }]);
    expect(scene(before, "s3").dependsOnSceneIds).toEqual(["s1"]);
    const after = setSceneMotives(BASE, "s1", [{ characterId: "haeun", basis: "event", causeSceneId: "s3" }]);
    expect(scene(after, "s1").dependsOnSceneIds).toBeUndefined();
    expect(scene(after, "s1").plausibility?.motives?.[0]?.causeSceneId).toBe("s3");
  });

  it("자기 자신을 동기로 지정할 수 없다", () => {
    const project = setSceneMotives(BASE, "s2", [{ characterId: "haeun", basis: "event", causeSceneId: "s2" }]);
    expect(scene(project, "s2").plausibility?.motives?.[0]).not.toHaveProperty("causeSceneId");
  });

  it("모두 ‘모름’이면 답 상태는 unknown, 하나라도 고르면 answered", () => {
    const unknown = setSceneMotives(BASE, "s2", [{ characterId: "haeun", basis: "unknown" }]);
    expect(scene(unknown, "s2").plausibility?.answers?.motive).toBe("unknown");
    expect(plausibilityQuestionStatus(scene(unknown, "s2"), "motive")).toBe("unknown");
    const answered = setSceneMotives(BASE, "s2", [{ characterId: "haeun", basis: "unknown" }, { characterId: "dojin", basis: "goal" }]);
    expect(scene(answered, "s2").plausibility?.answers?.motive).toBe("answered");
  });
});

describe("3. 원인", () => {
  it("원인 장면과 사실 전제를 기존 필드에 기록해 엔진이 그대로 쓴다", () => {
    const project = setSceneCause(BASE, "s3", { sceneIds: ["s2", "s3", "없는"], factIds: ["door-open", "없는"] });
    expect(scene(project, "s3").dependsOnSceneIds).toEqual(["s2"]);
    expect(scene(project, "s3").preconditions).toEqual([{ factId: "door-open", comparator: "equals", value: true }]);
    // 문이 아직 열리지 않았으므로(처음 값 거짓) 엔진이 전제가 어긋났다고 알린다.
    expect(codes(project)).toContain("contradicted-precondition");
  });

  it("끊어진 참조는 지우지 않고 남겨 엔진이 계속 알리게 한다", () => {
    const dangling: StoryworldProject = {
      ...BASE,
      scenes: BASE.scenes.map((item) => item.id === "s3" ? { ...item, preconditions: [{ factId: "삭제된 사실", comparator: "equals" as const, value: true }] } : item),
    };
    const project = setSceneCause(dangling, "s3", { sceneIds: ["s1"], factIds: [] });
    expect(scene(project, "s3").preconditions).toEqual([{ factId: "삭제된 사실", comparator: "equals", value: true }]);
  });

  it("원인이 없다고 비우면 전제가 사라지고 답은 남는다", () => {
    const withCause = setSceneCause(BASE, "s3", { sceneIds: ["s1"], factIds: ["door-open"] });
    const cleared = setSceneCause(withCause, "s3", { sceneIds: [], factIds: [] });
    expect(scene(cleared, "s3").dependsOnSceneIds).toBeUndefined();
    expect(scene(cleared, "s3").preconditions).toBeUndefined();
    expect(plausibilityQuestionStatus(scene(cleared, "s3"), "cause")).toBe("answered");
  });
});

describe("4. 정보", () => {
  const leaking = "knowledge-leak";

  it("답하기 전에는 알 수 없는 사실을 쓰는 것으로 엔진이 오류를 낸다", () => {
    expect(codes(BASE)).toContain(leaking);
  });

  it("처음부터 알았다고 답하면 인물의 처음 지식에 기록해 오류가 사라진다", () => {
    const project = setSceneInformation(BASE, "s2", [{ characterId: "haeun", factId: "culprit", source: { kind: "initial" } }]);
    expect(project.characters.find((item) => item.id === "haeun")?.initialFactIds).toEqual(["culprit"]);
    expect(codes(project)).not.toContain(leaking);
  });

  it("앞 장면에서 알게 됐다고 답하면 그 장면의 공개 대상에 인물을 넣는다", () => {
    const project = setSceneInformation(BASE, "s2", [{ characterId: "haeun", factId: "culprit", source: { kind: "scene", sceneId: "s1" } }]);
    expect(scene(project, "s1").reveals).toEqual([{ factId: "culprit", audiences: ["haeun"] }]);
    expect(codes(project)).not.toContain(leaking);
  });

  it("뒤에 있는 장면을 출처로 고르면 기록하지 않고 오류가 남는다", () => {
    const project = setSceneInformation(BASE, "s2", [{ characterId: "haeun", factId: "culprit", source: { kind: "scene", sceneId: "s3" } }]);
    expect(scene(project, "s3").reveals).toBeUndefined();
    expect(codes(project)).toContain(leaking);
  });

  it("이 장면에서 알게 된다고 답하면 지식 사용으로 세지 않고 이 장면에서 공개한다", () => {
    const project = setSceneInformation(BASE, "s2", [{ characterId: "haeun", factId: "culprit", source: { kind: "here" } }]);
    expect(scene(project, "s2").knowledgeUses).toBeUndefined();
    expect(scene(project, "s2").reveals).toEqual([{ factId: "culprit", audiences: ["haeun"] }]);
  });

  it("모르겠다고 답하면 지식 사용을 남겨 엔진이 계속 알리게 한다", () => {
    const project = setSceneInformation(BASE, "s2", [{ characterId: "haeun", factId: "culprit", source: { kind: "unknown" } }]);
    expect(scene(project, "s2").knowledgeUses).toEqual([{ characterId: "haeun", factId: "culprit" }]);
    expect(codes(project)).toContain(leaking);
  });

  it("같은 인물·사실 행은 한 번만 기록하고, 없는 인물·사실은 버린다", () => {
    const project = setSceneInformation(BASE, "s2", [
      { characterId: "haeun", factId: "culprit", source: { kind: "initial" } },
      { characterId: "haeun", factId: "culprit", source: { kind: "here" } },
      { characterId: "ghost", factId: "culprit", source: { kind: "initial" } },
      { characterId: "haeun", factId: "없는 사실", source: { kind: "initial" } },
    ]);
    expect(project.characters.find((item) => item.id === "haeun")?.initialFactIds).toEqual(["culprit"]);
    expect(scene(project, "s2").knowledgeUses).toEqual([{ characterId: "haeun", factId: "culprit" }]);
  });

  it("가리키는 대상이 사라진 기존 지식 사용은 지우지 않는다", () => {
    const withDangling: StoryworldProject = {
      ...BASE,
      scenes: BASE.scenes.map((item) => item.id === "s2" ? { ...item, knowledgeUses: [{ characterId: "haeun", factId: "삭제된 사실" }] } : item),
    };
    const project = setSceneInformation(withDangling, "s2", []);
    expect(scene(project, "s2").knowledgeUses).toEqual([{ characterId: "haeun", factId: "삭제된 사실" }]);
  });
});

describe("5. 우연·단서", () => {
  it("앞에 단서가 있다고 답하면 복선 계약을 만들어 엔진의 순서 규칙이 지켜보게 한다", () => {
    const project = setSceneCoincidence(BASE, "s3", { kind: "clue", clue: "foreshadowed", clueSceneIds: ["s1"] });
    expect(project.setupContracts).toEqual([{ id: "clue:s3", label: "‘결말’의 단서" }]);
    expect(scene(project, "s1").setupIds).toEqual(["clue:s3"]);
    expect(scene(project, "s3").payoffIds).toEqual(["clue:s3"]);
    expect(scene(project, "s3").plausibility?.coincidence).toEqual({ clue: "foreshadowed", clueSceneIds: ["s1"] });
    expect(codes(project)).not.toContain("orphan-payoff");
  });

  it("단서 장면을 이 장면 뒤로 옮기면 엔진이 심기 전의 회수로 알린다", () => {
    const project = setSceneCoincidence(BASE, "s1", { kind: "clue", clue: "foreshadowed", clueSceneIds: ["s3"] });
    expect(codes(project)).toContain("orphan-payoff");
  });

  it("다시 답하면 이전 복선 계약을 깨끗이 지운다", () => {
    const first = setSceneCoincidence(BASE, "s3", { kind: "clue", clue: "foreshadowed", clueSceneIds: ["s1"] });
    const second = setSceneCoincidence(first, "s3", { kind: "not-coincidence" });
    expect(second.setupContracts).toBeUndefined();
    expect(scene(second, "s1").setupIds).toBeUndefined();
    expect(scene(second, "s3").payoffIds).toBeUndefined();
    expect(scene(second, "s3").plausibility?.coincidence).toBeUndefined();
    expect(scene(second, "s3").plausibility?.answers?.coincidence).toBe("not-applicable");
    const third = setSceneCoincidence(second, "s3", { kind: "clue", clue: "none", clueSceneIds: [] });
    expect(third.setupContracts).toBeUndefined();
    expect(scene(third, "s3").plausibility?.coincidence).toEqual({ clue: "none" });
  });

  it("‘모름’은 점검 불가로 남고, ‘단서 없음’은 점검할 수 있는 답이다", () => {
    const unknown = setSceneCoincidence(BASE, "s3", { kind: "clue", clue: "unknown", clueSceneIds: [] });
    expect(plausibilityQuestionStatus(scene(unknown, "s3"), "coincidence")).toBe("unknown");
    const none = setSceneCoincidence(BASE, "s3", { kind: "clue", clue: "none", clueSceneIds: [] });
    expect(plausibilityQuestionStatus(scene(none, "s3"), "coincidence")).toBe("answered");
  });

  it("단서 장면을 지정하지 않은 ‘있음’은 단서 없음으로 둔갑시키지 않고 계약도 만들지 않는다", () => {
    const project = setSceneCoincidence(BASE, "s3", { kind: "clue", clue: "foreshadowed", clueSceneIds: ["s3", "없는"] });
    expect(project.setupContracts).toBeUndefined();
    expect(scene(project, "s3").plausibility?.coincidence).toEqual({ clue: "foreshadowed" });
  });
});

describe("6. 결과", () => {
  it("성립·종료·독자 공개를 효과와 공개 필드에 기록한다", () => {
    const project = setSceneConsequence(BASE, "s2", { established: ["door-open"], ended: [], revealedToReader: ["culprit"] });
    expect(scene(project, "s2").effects).toEqual([{ factId: "door-open", op: "set", value: true }]);
    expect(scene(project, "s2").reveals).toEqual([{ factId: "culprit", audiences: ["reader"] }]);
  });

  it("숫자·문자 사실은 이 폼에서 다루지 않는다", () => {
    expect(isToggleFact(BASE, "gold")).toBe(false);
    expect(isToggleFact(BASE, "door-open")).toBe(true);
    expect(isToggleFact(BASE, "없는 사실")).toBe(false);
    const withGold: StoryworldProject = {
      ...BASE,
      scenes: BASE.scenes.map((item) => item.id === "s2" ? { ...item, effects: [{ factId: "gold", op: "decrement" as const, value: 1 }] } : item),
    };
    const project = setSceneConsequence(withGold, "s2", { established: ["gold", "door-open"], ended: [], revealedToReader: [] });
    expect(scene(project, "s2").effects).toEqual([
      { factId: "gold", op: "decrement", value: 1 },
      { factId: "door-open", op: "set", value: true },
    ]);
  });

  it("성립과 종료에 같은 사실이 있으면 성립이 이긴다", () => {
    const project = setSceneConsequence(BASE, "s2", { established: ["door-open"], ended: ["door-open"], revealedToReader: [] });
    expect(scene(project, "s2").effects).toEqual([{ factId: "door-open", op: "set", value: true }]);
  });

  it("독자 공개만 다루고 인물에게 알려지는 공개는 그대로 둔다", () => {
    const withReveal: StoryworldProject = {
      ...BASE,
      scenes: BASE.scenes.map((item) => item.id === "s2" ? { ...item, reveals: [{ factId: "culprit", audiences: ["dojin", "reader"] }] } : item),
    };
    const cleared = setSceneConsequence(withReveal, "s2", { established: [], ended: [], revealedToReader: [] });
    expect(scene(cleared, "s2").reveals).toEqual([{ factId: "culprit", audiences: ["dojin"] }]);
  });
});

describe("해당 없음·모름·건너뜀", () => {
  it("상태만 기록하고 구조 필드는 건드리지 않는다", () => {
    const project = markQuestion(BASE, "s1", "cause", "not-applicable");
    expect(scene(project, "s1")).toEqual({ ...scene(BASE, "s1"), plausibility: { answers: { cause: "not-applicable" } } });
    expect(plausibilityQuestionStatus(scene(project, "s1"), "cause")).toBe("not-applicable");
  });

  it("‘모름’은 점검 불가라 점검 가능 범위가 늘지 않는다", () => {
    const base = computePlausibilityCoverage(BASE).coveredCells;
    expect(computePlausibilityCoverage(markQuestion(BASE, "s1", "motive", "unknown")).coveredCells).toBe(base);
    expect(computePlausibilityCoverage(markQuestion(BASE, "s1", "motive", "not-applicable")).coveredCells).toBe(base + 1);
  });

  it("장면 건너뛰기는 이미 답한 질문을 덮어쓰지 않는다", () => {
    const answered = markQuestion(BASE, "s1", "cause", "not-applicable");
    const skipped = skipScene(answered, "s1");
    expect(scene(skipped, "s1").plausibility?.answers).toEqual({
      cause: "not-applicable",
      roles: "skipped",
      motive: "skipped",
      information: "skipped",
      coincidence: "skipped",
      consequence: "skipped",
    });
  });
});
