import { describe, expect, it } from "vitest";

import { STORYWORLD_DEMO_PROJECT, type StoryworldProject } from "../studio-storyworld-causality";
import { analyzeStoryworldProject } from "../studio-storyworld-causality";
import { extractManuscript, type ManuscriptNameEntry } from "./studio-story-manuscript-extractor";
import {
  buildManuscriptRegister,
  buildProjectFromManuscript,
  manuscriptFingerprint,
} from "./studio-story-manuscript-project";

const TEXT = [
  "1화 비 내리는 시장",
  "",
  "장면 1. 기억 시장",
  "하은이 걸었다. 다음 날 아침이 밝았다.",
  "",
  "장면 2",
  "도진이 금고 앞에서 하은에게 말했다.",
].join("\n");

const BASE: StoryworldProject = {
  schemaVersion: 2,
  id: "mine",
  title: "내 이야기",
  characters: [
    { id: "haeun", name: "하은", aliases: ["은이"], goal: "동생 찾기", initialFactIds: ["f1"] },
    { id: "dojin", name: "도진" },
  ],
  facts: [{ id: "f1", label: "열쇠가 있다", subjectId: "haeun", key: "key" }],
  scenes: [{ id: "old-1", title: "옛 장면", order: 5, participantIds: ["haeun"] }],
  setupContracts: [{ id: "umbrella", label: "우산" }],
};

describe("등록부 만들기", () => {
  it("스토리월드 인물·장소를 먼저 두고 바이블 이름을 id 기준으로 합친다", () => {
    const register = buildManuscriptRegister({
      project: { ...BASE, scenes: [{ id: "s", title: "t", order: 1, locationId: "기억 시장" }] },
      bibleCharacters: [
        { id: "haeun", name: "하은", aliases: ["하은아"] },
        { id: "mina", name: "미나", aliases: [] },
      ],
      bibleLocations: [{ id: "loc-1", name: "금고" }],
      loreLocations: [{ id: "lore-1", name: "옛 도서관", aliases: ["도서관"] }],
    });
    expect(register.map((entry) => `${entry.kind}:${entry.refId}`)).toEqual([
      "character:haeun",
      "character:dojin",
      "character:mina",
      "location:기억 시장",
      "location:금고",
      "location:옛 도서관",
    ]);
    expect(register[0]?.aliases).toEqual(["은이", "하은아"]);
  });

  it("이름은 같지만 id가 다른 인물은 합치지 않는다(동명이인 후보)", () => {
    const register = buildManuscriptRegister({
      project: BASE,
      bibleCharacters: [{ id: "bible-haeun", name: "하은", aliases: [] }],
    });
    expect(register.filter((entry) => entry.name === "하은")).toHaveLength(2);
  });
});

describe("원고 → 문서 초안", () => {
  const register: readonly ManuscriptNameEntry[] = buildManuscriptRegister({
    project: BASE,
    bibleLocations: [{ id: "x", name: "기억 시장" }, { id: "y", name: "금고" }],
  });
  const extraction = extractManuscript(TEXT, register);

  it("새 초안(replace)은 장면 뼈대만 만들고 의미 필드는 비워 둔다", () => {
    const { project, addedSceneIds, skippedSceneCount } = buildProjectFromManuscript(BASE, extraction.scenes, register, {}, {
      mode: "replace",
      copyId: manuscriptFingerprint(TEXT),
    });
    expect(project.schemaVersion).toBe(2);
    expect(project.scenes.map((scene) => scene.id)).toEqual(addedSceneIds);
    expect(project.scenes.map((scene) => scene.title)).toEqual(["기억 시장", "장면 2"]);
    expect(project.scenes.map((scene) => scene.order)).toEqual([10, 20]);
    expect(project.scenes.map((scene) => scene.episodeNumber)).toEqual([1, 1]);
    expect(project.scenes[0]).toMatchObject({ participantIds: ["haeun"], locationId: "기억 시장" });
    expect(project.scenes[1]).toMatchObject({ participantIds: ["dojin", "haeun"], locationId: "금고" });
    expect(project.scenes[0]?.source).toMatchObject({ boundary: "scene-number", timeCues: ["다음 날 아침"], copy: manuscriptFingerprint(TEXT) });
    expect(project.metadata?.manuscriptFingerprint).toBeUndefined();
    for (const scene of project.scenes) {
      expect(scene.preconditions).toBeUndefined();
      expect(scene.effects).toBeUndefined();
      expect(scene.knowledgeUses).toBeUndefined();
      expect(scene.reveals).toBeUndefined();
      expect(scene.emotionalBeats).toBeUndefined();
      expect(scene.timeIndex).toBeUndefined();
      expect(scene.plausibility).toBeUndefined();
    }
    expect(project.facts).toEqual([]);
    expect(project.setupContracts).toBeUndefined();
    expect(project.characters.find((c) => c.id === "haeun")).toEqual({ id: "haeun", name: "하은", aliases: ["은이"], goal: "동생 찾기" });
    expect(skippedSceneCount).toBe(0);
    // 빈 데이터로는 문제를 만들지 않는다(참조도 끊기지 않는다).
    expect(analyzeStoryworldProject(project).issues.filter((issue) => issue.axis === "canon" || issue.axis === "character-knowledge")).toEqual([]);
  });

  it("덧붙이기(append)는 기존 장면·사실·복선을 그대로 두고 뒤에 장면을 더한다", () => {
    const { project } = buildProjectFromManuscript(BASE, extraction.scenes, register, {}, { mode: "append" });
    expect(project.scenes.map((scene) => scene.id)).toEqual(["old-1", "ms-1", "ms-2"]);
    expect(project.scenes.map((scene) => scene.order)).toEqual([5, 15, 25]);
    expect(project.facts).toEqual(BASE.facts);
    expect(project.setupContracts).toEqual(BASE.setupContracts);
    expect(project.characters[0]?.initialFactIds).toEqual(["f1"]);
  });

  it("바이블에만 있는 인물은 장면에 나올 때 새 인물로 추가한다", () => {
    const withBible = buildManuscriptRegister({ project: BASE, bibleCharacters: [{ id: "mina", name: "미나", aliases: ["미나야"] }] });
    const text = "장면 1\n미나가 문을 열었다.";
    const result = buildProjectFromManuscript(BASE, extractManuscript(text, withBible).scenes, withBible, {}, { mode: "append" });
    expect(result.addedCharacterIds).toEqual(["mina"]);
    expect(result.project.characters.at(-1)).toEqual({ id: "mina", name: "미나", aliases: ["미나야"] });
  });

  it("동명이인은 자동 배정하지 않고, 사용자가 고르면 그대로 따른다", () => {
    const twins = buildManuscriptRegister({
      project: { ...BASE, characters: [{ id: "a", name: "민준" }, { id: "b", name: "민준", description: "다른 사람" }] },
    });
    const text = "장면 1\n민준이 웃었다.";
    const extracted = extractManuscript(text, twins);
    const auto = buildProjectFromManuscript(null, extracted.scenes, twins, {}, { mode: "replace" });
    expect(auto.project.scenes[0]?.participantIds).toBeUndefined();
    expect(auto.unresolvedCharacterScenes).toBe(1);
    const picked = buildProjectFromManuscript(null, extracted.scenes, twins, {
      [extracted.scenes[0]?.key ?? ""]: { participantRefIds: ["b"], title: "  내가 고친 제목  ", locationName: null },
    }, { mode: "replace" });
    expect(picked.project.scenes[0]).toMatchObject({ participantIds: ["b"], title: "내가 고친 제목" });
    expect(picked.project.scenes[0]?.locationId).toBeUndefined();
    expect(picked.unresolvedCharacterScenes).toBe(0);
  });

  it("예시 프로젝트를 바꿀 때는 예시 id를 이어받지 않는다", () => {
    const { project } = buildProjectFromManuscript(STORYWORLD_DEMO_PROJECT, extraction.scenes, register, {}, { mode: "replace" });
    expect(project.id).toBe("manuscript-draft");
  });

  it("장면 수가 문서 한도(256)를 넘으면 한도까지만 만들고 나머지를 알린다", () => {
    const text = Array.from({ length: 300 }, (_, i) => `장면 ${i + 1}\n본문 ${i}`).join("\n\n");
    const many = extractManuscript(text, []);
    const first = buildProjectFromManuscript(null, many.scenes, [], {}, { mode: "replace" });
    expect(first.project.scenes).toHaveLength(256);
    expect(first.skippedSceneCount).toBe(44);
    const second = buildProjectFromManuscript(null, many.scenes, [], {}, { mode: "replace", sliceStart: 256 });
    expect(second.project.scenes).toHaveLength(44);
    expect(second.skippedSceneCount).toBe(256);
  });

  it("만든 초안은 저장·불러오기와 같은 검증을 통과한다(JSON 왕복)", async () => {
    const { project } = buildProjectFromManuscript(BASE, extraction.scenes, register, {}, { mode: "replace" });
    const { parseStoryworldProject } = await import("../studio-storyworld-document");
    expect(parseStoryworldProject(JSON.stringify(project))).toEqual(project);
  });
});
