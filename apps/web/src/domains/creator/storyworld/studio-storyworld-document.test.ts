import { describe, expect, it } from "vitest";

import { STORYWORLD_DEMO_PROJECT } from "./studio-storyworld-causality";
import {
  STORYWORLD_DOCUMENT_LIMITS,
  STORYWORLD_DOCUMENT_MAX_TEXT_LENGTH,
  friendlyStoryworldFileError,
  normalizeStoryworldProject,
  parseStoryworldProject,
} from "./studio-storyworld-document";

/** 1판 문서: 개연성 점검용 필드가 하나도 없는, 이전에 저장된 모양 그대로. */
const V1_DOCUMENT = {
  schemaVersion: 1,
  id: "legacy",
  title: "예전 이야기",
  characters: [{ id: "haeun", name: "하은", aliases: ["은이"], initialFactIds: ["f1"] }],
  facts: [{ id: "f1", label: "열쇠가 있다", subjectId: "haeun", key: "key", initialValue: true }],
  scenes: [
    { id: "s1", title: "첫 장면", order: 10, participantIds: ["haeun"], timeIndex: 1 },
    {
      id: "s2",
      title: "둘째 장면",
      order: 20,
      preconditions: [{ factId: "f1", comparator: "equals", value: true }],
      dependsOnSceneIds: ["s1"],
    },
  ],
  setupContracts: [{ id: "umbrella", label: "우산", payoffDueByOrder: 30 }],
};

describe("스토리월드 문서 읽기: 버전 정규화", () => {
  it("1판 문서는 필드를 더하지 않고 버전 표시만 2로 올린다", () => {
    const project = parseStoryworldProject(JSON.stringify(V1_DOCUMENT));
    expect(project.schemaVersion).toBe(2);
    expect({ ...project, schemaVersion: 1 }).toEqual(V1_DOCUMENT);
    for (const scene of project.scenes) {
      expect(scene).not.toHaveProperty("plausibility");
      expect(scene).not.toHaveProperty("source");
      expect(scene).not.toHaveProperty("episodeNumber");
    }
  });

  it("2판 문서는 저장 후 다시 읽어도 그대로다(왕복)", () => {
    const project = parseStoryworldProject(JSON.stringify(STORYWORLD_DEMO_PROJECT));
    expect(project).toEqual(STORYWORLD_DEMO_PROJECT);
    expect(parseStoryworldProject(JSON.stringify(project))).toEqual(project);
  });

  it("1판 문서를 정규화해도 원본 객체는 바뀌지 않는다", () => {
    const original = structuredClone(V1_DOCUMENT);
    normalizeStoryworldProject(original);
    expect(original).toEqual(V1_DOCUMENT);
    expect(original.schemaVersion).toBe(1);
  });

  it("알 수 없는 버전은 거절한다", () => {
    expect(() => parseStoryworldProject(JSON.stringify({ ...V1_DOCUMENT, schemaVersion: 3 }))).toThrow(/schemaVersion/u);
    expect(() => parseStoryworldProject(JSON.stringify({ ...V1_DOCUMENT, schemaVersion: 0 }))).toThrow(/schemaVersion/u);
    expect(() => parseStoryworldProject(JSON.stringify({ ...V1_DOCUMENT, schemaVersion: "2" }))).toThrow(/schemaVersion/u);
  });

  it("1판 문서에 2판 필드가 섞여 있어도 같은 규칙으로 검증한다", () => {
    const mixed = { ...V1_DOCUMENT, scenes: [{ ...V1_DOCUMENT.scenes[0], episodeNumber: 0 }] };
    expect(() => normalizeStoryworldProject(mixed)).toThrow(/episodeNumber/u);
  });
});

describe("스토리월드 문서 읽기: 새 선택 필드", () => {
  const withScene = (extra: Record<string, unknown>) => ({
    ...V1_DOCUMENT,
    schemaVersion: 2,
    scenes: [{ id: "s1", title: "장면", order: 10, ...extra }],
  });

  it("회차 번호·연도·나이·태어난 해를 그대로 받는다", () => {
    const project = normalizeStoryworldProject({
      ...withScene({ episodeNumber: 3, storyYear: 2025, statedAges: [{ characterId: "haeun", age: 25 }] }),
      characters: [{ id: "haeun", name: "하은", birthYear: 2000 }],
    });
    expect(project.scenes[0]).toMatchObject({ episodeNumber: 3, storyYear: 2025, statedAges: [{ characterId: "haeun", age: 25 }] });
    expect(project.characters[0]?.birthYear).toBe(2000);
  });

  it.each([
    ["episodeNumber 소수", { episodeNumber: 1.5 }, /episodeNumber/u],
    ["episodeNumber 문자열", { episodeNumber: "1" }, /episodeNumber/u],
    ["storyYear 소수", { storyYear: 2025.5 }, /storyYear/u],
    ["나이 음수", { statedAges: [{ characterId: "haeun", age: -1 }] }, /age/u],
    ["나이 인물 없음", { statedAges: [{ age: 20 }] }, /characterId/u],
    ["장면 성격 이름 오류", { plausibility: { roles: ["villain"] } }, /roles\[0\]/u],
    ["답 상태 오류", { plausibility: { answers: { motive: "maybe" } } }, /answers\.motive/u],
    ["질문 이름 오류", { plausibility: { answers: { fun: "answered" } } }, /질문 이름/u],
    ["동기 근거 오류", { plausibility: { motives: [{ characterId: "haeun", basis: "love" }] } }, /basis/u],
    ["우연 단서 오류", { plausibility: { coincidence: { clue: "yes" } } }, /clue/u],
    ["원고 출처 경계 오류", { source: { excerpt: "x", boundary: "magic" } }, /boundary/u],
    ["원고 출처 발췌 없음", { source: { boundary: "start" } }, /excerpt/u],
    ["plausibility가 배열", { plausibility: [] }, /plausibility/u],
  ])("구조가 틀린 값은 위치를 알려 거절한다: %s", (_name, extra, pattern) => {
    expect(() => normalizeStoryworldProject(withScene(extra))).toThrow(pattern);
  });

  it("오류 메시지에 장면 위치가 들어 있다", () => {
    expect(() => normalizeStoryworldProject(withScene({ plausibility: { roles: ["villain"] } })))
      .toThrow("scenes[0].plausibility.roles[0]");
  });

  it("길이가 긴 문자열은 거절하지 않고 잘라서 받는다", () => {
    const project = normalizeStoryworldProject(withScene({
      source: {
        excerpt: "가".repeat(2000),
        boundary: "heading",
        marker: "나".repeat(500),
        timeCues: Array.from({ length: 20 }, (_, i) => `${i}일 뒤 ${"다".repeat(100)}`),
      },
      plausibility: { motives: [{ characterId: "haeun", basis: "goal", note: "라".repeat(2000) }] },
    }));
    const scene = project.scenes[0];
    expect(Array.from(scene?.source?.excerpt ?? "")).toHaveLength(480);
    expect(Array.from(scene?.source?.marker ?? "")).toHaveLength(120);
    expect(scene?.source?.timeCues).toHaveLength(8);
    for (const cue of scene?.source?.timeCues ?? []) expect(Array.from(cue).length).toBeLessThanOrEqual(40);
    expect(Array.from(scene?.plausibility?.motives?.[0]?.note ?? "")).toHaveLength(500);
  });

  it("원고 사본 표시(copy)는 그대로 받고, 길면 자르며, 공백뿐이면 버린다", () => {
    const kept = normalizeStoryworldProject(withScene({ source: { excerpt: "x", boundary: "start", copy: "  fp-3f9a1c  " } }));
    expect(kept.scenes[0]?.source?.copy).toBe("fp-3f9a1c");
    const clipped = normalizeStoryworldProject(withScene({ source: { excerpt: "x", boundary: "start", copy: "가".repeat(500) } }));
    expect(Array.from(clipped.scenes[0]?.source?.copy ?? "")).toHaveLength(120);
    const blank = normalizeStoryworldProject(withScene({ source: { excerpt: "x", boundary: "start", copy: "   " } }));
    expect(blank.scenes[0]?.source).not.toHaveProperty("copy");
  });

  it("원고 사본 표시(copy)가 문자열이 아니면 위치를 알려 거절한다", () => {
    expect(() => normalizeStoryworldProject(withScene({ source: { excerpt: "x", boundary: "start", copy: 7 } })))
      .toThrow("scenes[0].source.copy");
  });

  it("장면 성격은 정해진 순서로 중복 없이 정리한다", () => {
    const project = normalizeStoryworldProject(withScene({ plausibility: { roles: ["resolution", "decision", "resolution"] } }));
    expect(project.scenes[0]?.plausibility?.roles).toEqual(["decision", "resolution"]);
  });

  it("빈 문자열 시간 표현은 버리고, 동기 수는 24개로 제한한다", () => {
    const project = normalizeStoryworldProject(withScene({
      source: { excerpt: "x", boundary: "start", timeCues: ["  ", "다음 날", "다음 날"] },
      plausibility: { motives: Array.from({ length: 40 }, () => ({ characterId: "haeun", basis: "goal" })) },
    }));
    expect(project.scenes[0]?.source?.timeCues).toEqual(["다음 날"]);
    expect(project.scenes[0]?.plausibility?.motives).toHaveLength(24);
  });
});

describe("스토리월드 문서 읽기: 한도와 오류 안내", () => {
  it("장면 수가 한도를 넘으면 한도 안내와 함께 거절한다", () => {
    const scenes = Array.from({ length: STORYWORLD_DOCUMENT_LIMITS.scenes + 1 }, (_, i) => ({ id: `s${i}`, title: `장면 ${i}`, order: i }));
    expect(() => normalizeStoryworldProject({ ...V1_DOCUMENT, scenes })).toThrow(/로컬 분석 한도/u);
  });

  it("텍스트가 1MB를 넘으면 JSON을 읽기 전에 거절한다", () => {
    expect(() => parseStoryworldProject("x".repeat(STORYWORLD_DOCUMENT_MAX_TEXT_LENGTH + 1))).toThrow(/1MB/u);
  });

  it("JSON이 아니면 JSON 오류를 던지고 안내문은 작가의 말로 바뀐다", () => {
    let caught: unknown = null;
    try {
      parseStoryworldProject("{ 이건 JSON이 아님");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(friendlyStoryworldFileError(caught)).toMatch(/읽을 수 없습니다/u);
  });

  it.each([
    [new Error("스토리월드 JSON은 1MB 이하여야 합니다."), /1MB 초과/u],
    [new Error("schemaVersion은 1 또는 2이어야 합니다."), /이 화면에서 저장한 설정 파일/u],
    [new Error("characters, facts, scenes는 배열이어야 합니다."), /빠졌거나 형식이 다른/u],
    ["문자열 오류", /읽을 수 없습니다/u],
  ])("불러오기 오류를 작가 언어로 바꾼다 (%#)", (caught, pattern) => {
    const message = friendlyStoryworldFileError(caught);
    expect(message).toMatch(pattern);
    expect(message).not.toMatch(/schemaVersion|undefined|\[object/u);
  });
});
