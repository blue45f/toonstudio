import { describe, expect, it } from "vitest";

import type { StoryworldProject } from "../studio-storyworld-causality";
import { DOJIN, HAEUN, makeStory } from "./studio-story-plausibility-golden-fixtures";
import {
  PLAUSIBILITY_MOTIVE_ROW_LIMIT,
  applyCauseDraft,
  applyCoincidenceDraft,
  applyConsequenceDraft,
  applyInformationRows,
  applyMotiveRows,
  applyRolesDraft,
  causeDraftFromScene,
  coincidenceDraftFromScene,
  consequenceDraftFromScene,
  earlierScenes,
  informationRowsFromScene,
  motiveRowsFromScene,
  motiveRowsToMotives,
  rolesDraftFromScene,
  sceneById,
} from "./studio-story-plausibility-question-drafts";

const BASE: StoryworldProject = makeStory("q", "초안", {
  characters: [HAEUN, DOJIN, { id: "mina", name: "미나" }],
  facts: [
    { id: "culprit", label: "범인은 도진이다", subjectId: "world", key: "culprit", initialValue: true },
    { id: "door", label: "문이 열렸다", subjectId: "world", key: "door", initialValue: false },
    { id: "gold", label: "금화", subjectId: "world", key: "gold", initialValue: 3 },
  ],
  scenes: [
    { id: "s1", title: "의뢰", order: 10, participantIds: ["haeun"] },
    { id: "s2", title: "추궁", order: 20, participantIds: ["haeun", "dojin"], knowledgeUses: [{ characterId: "haeun", factId: "culprit" }] },
    { id: "s3", title: "결말", order: 30, participantIds: ["haeun"] },
    { id: "off", title: "빼 둔 장면", order: 15, disabled: true },
  ],
});

const scene = (project: StoryworldProject, id: string) => {
  const found = sceneById(project, id);
  if (!found) throw new Error(`장면이 없습니다: ${id}`);
  return found;
};

describe("앞 장면 찾기", () => {
  it("사용 중인 앞 장면만 순서대로 돌려준다", () => {
    expect(earlierScenes(BASE, "s3").map((item) => item.id)).toEqual(["s1", "s2"]);
    expect(earlierScenes(BASE, "s1")).toEqual([]);
    expect(earlierScenes(BASE, "없는 장면")).toEqual([]);
  });
});

describe("장면 성격", () => {
  it("문서 → 초안 → 문서 왕복이 같다", () => {
    const next = applyRolesDraft(BASE, "s3", ["resolution", "decision"]);
    expect(rolesDraftFromScene(scene(next, "s3"))).toEqual(["decision", "resolution"]);
    expect(rolesDraftFromScene(scene(BASE, "s3"))).toEqual([]);
  });
});

describe("동기", () => {
  it("참여자마다 한 줄이고, 기록한 동기가 있으면 그 값에서 시작한다", () => {
    const rows = motiveRowsFromScene(BASE, scene(BASE, "s2"));
    expect(rows.map((row) => row.characterId)).toEqual(["haeun", "dojin"]);
    expect(rows.every((row) => row.basis === "")).toBe(true);
    const next = applyMotiveRows(BASE, "s2", [
      { characterId: "haeun", basis: "event", causeSceneId: "s1", note: " 의뢰가 계기 " },
      { characterId: "dojin", basis: "", causeSceneId: "", note: "" },
    ]);
    const again = motiveRowsFromScene(next, scene(next, "s2"));
    expect(again.find((row) => row.characterId === "haeun")).toEqual({ characterId: "haeun", basis: "event", causeSceneId: "s1", note: "의뢰가 계기" });
    expect(again.find((row) => row.characterId === "dojin")?.basis).toBe("");
  });

  it("참여자가 없으면 전체 인물에서 고르고, 줄 수에 상한이 있다", () => {
    const rows = motiveRowsFromScene(BASE, { id: "x", title: "x", order: 1 });
    expect(rows.map((row) => row.characterId)).toEqual(["haeun", "dojin", "mina"]);
    const many = makeStory("many", "많은 인물", {
      characters: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `인물${i}` })),
      scenes: [{ id: "s", title: "s", order: 1 }],
    });
    expect(motiveRowsFromScene(many, scene(many, "s"))).toHaveLength(PLAUSIBILITY_MOTIVE_ROW_LIMIT);
  });

  it("고르지 않은 줄은 문서에 넘기지 않는다", () => {
    expect(motiveRowsToMotives([{ characterId: "haeun", basis: "", causeSceneId: "", note: "" }])).toEqual([]);
    expect(motiveRowsToMotives([{ characterId: "haeun", basis: "goal", causeSceneId: "s1", note: "" }])).toEqual([{ characterId: "haeun", basis: "goal" }]);
  });
});

describe("원인", () => {
  it("원인 장면과 사실 전제를 되살리고, 폼이 다루지 못하는 전제는 세어 알린다", () => {
    const next = applyCauseDraft(BASE, "s3", { sceneIds: ["s2"], factIds: ["door"] });
    expect(causeDraftFromScene(scene(next, "s3"))).toEqual({ sceneIds: ["s2"], factIds: ["door"], otherPreconditionCount: 0 });
    const withOther: StoryworldProject = {
      ...next,
      scenes: next.scenes.map((item) => item.id === "s3"
        ? { ...item, preconditions: [...(item.preconditions ?? []), { factId: "gold", comparator: "greater-than" as const, value: 1 }] }
        : item),
    };
    expect(causeDraftFromScene(scene(withOther, "s3")).otherPreconditionCount).toBe(1);
  });
});

describe("정보", () => {
  it("처음부터·앞 장면·이 장면·모름을 가려 되살린다", () => {
    let project = applyInformationRows(BASE, "s2", [{ characterId: "haeun", factId: "culprit", source: "scene", sceneId: "s1" }]);
    expect(informationRowsFromScene(project, scene(project, "s2"))).toEqual([{ characterId: "haeun", factId: "culprit", source: "scene", sceneId: "s1" }]);

    project = applyInformationRows(BASE, "s2", [{ characterId: "haeun", factId: "culprit", source: "initial", sceneId: "" }]);
    expect(informationRowsFromScene(project, scene(project, "s2"))[0]?.source).toBe("initial");

    project = applyInformationRows(BASE, "s2", [{ characterId: "haeun", factId: "culprit", source: "unknown", sceneId: "" }]);
    expect(informationRowsFromScene(project, scene(project, "s2"))[0]?.source).toBe("unknown");

    project = applyInformationRows(BASE, "s2", [{ characterId: "dojin", factId: "culprit", source: "here", sceneId: "" }]);
    expect(informationRowsFromScene(project, scene(project, "s2")).find((row) => row.characterId === "dojin")?.source).toBe("here");
  });

  it("앞 장면을 고르지 않은 ‘앞 장면에서’는 모름으로 기록한다", () => {
    const project = applyInformationRows(BASE, "s2", [{ characterId: "haeun", factId: "culprit", source: "scene", sceneId: "" }]);
    expect(scene(project, "s2").knowledgeUses).toEqual([{ characterId: "haeun", factId: "culprit" }]);
    expect(informationRowsFromScene(project, scene(project, "s2"))[0]?.source).toBe("unknown");
  });

  it("인물이나 사실을 정하지 않은 줄은 건너뛴다", () => {
    const project = applyInformationRows(BASE, "s2", [{ characterId: "", factId: "culprit", source: "initial", sceneId: "" }]);
    expect(project.characters.find((item) => item.id === "haeun")?.initialFactIds).toBeUndefined();
  });
});

describe("우연·단서", () => {
  it.each(["not-coincidence", "none", "unknown"] as const)("%s 답이 왕복한다", (choice) => {
    const next = applyCoincidenceDraft(BASE, "s3", { choice, clueSceneIds: [] });
    expect(coincidenceDraftFromScene(scene(next, "s3")).choice).toBe(choice);
  });

  it("앞에 단서가 있다는 답은 단서 장면과 함께 왕복한다", () => {
    const next = applyCoincidenceDraft(BASE, "s3", { choice: "foreshadowed", clueSceneIds: ["s1", "s2"] });
    expect(coincidenceDraftFromScene(scene(next, "s3"))).toEqual({ choice: "foreshadowed", clueSceneIds: ["s1", "s2"] });
  });

  it("고르지 않았으면 문서를 바꾸지 않고, 답이 없는 장면은 unset이다", () => {
    expect(applyCoincidenceDraft(BASE, "s3", { choice: "unset", clueSceneIds: [] })).toBe(BASE);
    expect(coincidenceDraftFromScene(scene(BASE, "s3"))).toEqual({ choice: "unset", clueSceneIds: [] });
  });
});

describe("결과", () => {
  it("성립·종료·독자 공개가 왕복하고 숫자 사실은 다루지 않는다", () => {
    const next = applyConsequenceDraft(BASE, "s2", { established: ["door"], ended: [], revealedToReader: ["culprit"] });
    expect(consequenceDraftFromScene(next, scene(next, "s2"))).toEqual({ established: ["door"], ended: [], revealedToReader: ["culprit"] });
    const ended = applyConsequenceDraft(BASE, "s2", { established: [], ended: ["door", "gold"], revealedToReader: [] });
    expect(consequenceDraftFromScene(ended, scene(ended, "s2")).ended).toEqual(["door"]);
  });
});
