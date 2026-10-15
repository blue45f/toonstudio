import { describe, expect, it } from "vitest";

import { extractManuscript, type ManuscriptNameEntry } from "./studio-story-manuscript-extractor";
import { buildManuscriptRegister, buildProjectFromManuscript } from "./studio-story-manuscript-project";
import {
  MANUSCRIPT_BOUNDARY_LABELS,
  autoParticipantRefs,
  effectiveLocationName,
  effectiveParticipantRefs,
  unresolvedMatches,
} from "./studio-story-plausibility-manuscript-edit";
import { makeStory } from "./studio-story-plausibility-golden-fixtures";

const project = makeStory("p", "동명이인", {
  characters: [{ id: "a", name: "민준" }, { id: "b", name: "민준", description: "다른 사람" }, { id: "c", name: "서연" }],
  scenes: [{ id: "old", title: "옛 장면", order: 1, locationId: "시장" }],
});
const register: readonly ManuscriptNameEntry[] = buildManuscriptRegister({ project });
const TEXT = "장면 1 시장\n민준이 서연에게 말했다.";
const [draft] = extractManuscript(TEXT, register).scenes;

describe("원고 미리보기 값 해석", () => {
  it("동명이인은 확정하지 않고 확정된 인물만 자동으로 넣는다", () => {
    if (!draft) throw new Error("장면이 필요합니다.");
    expect(autoParticipantRefs(draft, register)).toEqual(["c"]);
    expect(unresolvedMatches(draft, undefined).map((match) => match.surface)).toEqual(["민준"]);
  });

  it("작가가 정한 값이 있으면 그것이 최종이고 더 묻지 않는다", () => {
    if (!draft) throw new Error("장면이 필요합니다.");
    expect(effectiveParticipantRefs(draft, register, { participantRefIds: ["b", "c"] })).toEqual(["b", "c"]);
    expect(unresolvedMatches(draft, { participantRefIds: ["b", "c"] })).toEqual([]);
    expect(effectiveParticipantRefs(draft, register, { participantRefIds: [] })).toEqual([]);
  });

  it("장소는 추출기가 정한 값, 작가가 정한 값(없음 포함) 순으로 쓴다", () => {
    if (!draft) throw new Error("장면이 필요합니다.");
    expect(effectiveLocationName(draft, register, undefined)).toBe("시장");
    expect(effectiveLocationName(draft, register, { locationName: null })).toBeNull();
    expect(effectiveLocationName(draft, register, { locationName: "금고" })).toBe("금고");
    expect(effectiveLocationName(draft, register, { title: "제목만 고침" })).toBe("시장");
  });

  it("화면의 해석이 초안 만들기 결과와 같다", () => {
    if (!draft) throw new Error("장면이 필요합니다.");
    const overrides = { [draft.key]: { participantRefIds: ["b", "c"], locationName: null } };
    const { project: built } = buildProjectFromManuscript(project, [draft], register, overrides, { mode: "append" });
    const added = built.scenes.at(-1);
    expect(added?.participantIds).toEqual(effectiveParticipantRefs(draft, register, overrides[draft.key]));
    expect(added?.locationId).toBeUndefined();
    const auto = buildProjectFromManuscript(project, [draft], register, {}, { mode: "append" }).project.scenes.at(-1);
    expect(auto?.participantIds).toEqual(autoParticipantRefs(draft, register));
  });

  it("경계 종류마다 작가의 말 이름표가 있다", () => {
    expect(Object.keys(MANUSCRIPT_BOUNDARY_LABELS).sort()).toEqual(["blank-lines", "heading", "manual", "scene-number", "separator", "start"]);
  });
});
