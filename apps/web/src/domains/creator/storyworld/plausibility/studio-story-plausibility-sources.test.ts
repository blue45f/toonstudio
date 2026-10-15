import { describe, expect, it } from "vitest";

import { createForeshadowSeed, upsertForeshadowSeed, writeStudioForeshadowLedger } from "../../planning/studio-foreshadow-ledger";
import { ensureStudioProjectPlanning, saveStudioEpisodePlan } from "../../planning/studio-planning-store";
import { emptyWorldLore, upsertLoreEntry, withLoreEntryDefaults } from "../../planning/studio-world-lore";
import { writeStudioWorldLore } from "../../planning/studio-world-lore-store";
import type { StudioProjectDiagnosticSourceStorage } from "../../studio-project-diagnostic-source-store";
import type { StoryworldProject } from "../studio-storyworld-causality";
import { DOJIN, HAEUN, makeStory } from "./studio-story-plausibility-golden-fixtures";
import {
  PLAUSIBILITY_NAME_CHECK_CHUNK,
  PLAUSIBILITY_NAME_CHECK_MAX_SCENE_CHARS,
  buildPlausibilityNameDictionary,
  loadPlausibilityExtras,
  loadPlausibilityNameChecks,
} from "./studio-story-plausibility-sources";
import { buildPlausibilityReport } from "./studio-story-plausibility-report";

const NOW = "2026-10-15T00:00:00.000Z";

function memoryStorage(): StudioProjectDiagnosticSourceStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

const noYield = () => Promise.resolve();

/** 이름 표기 검사는 세 글자 이상 이름의 한 글자 차이만 찾는다(두 글자 이름은 오탐이 많아 제외). */
const ARCADIA = { id: "arcadia", name: "아르카디아" };
const SECOND = { id: "moa", name: "모아나이" };

function manuscriptProject(texts: Record<string, string>): { project: StoryworldProject; manuscripts: Map<string, string> } {
  const copy = "copy-1";
  const parts = Object.entries(texts);
  let offset = 0;
  const body: string[] = [];
  const scenes = parts.map(([id, text], index) => {
    const start = offset;
    body.push(text);
    offset += text.length + 1;
    return {
      id,
      title: `장면 ${index + 1}`,
      order: (index + 1) * 10,
      locationId: "시장",
      participantIds: ["arcadia"],
      source: { excerpt: text.slice(0, 40), boundary: "scene-number" as const, copy, start, end: start + text.length },
    };
  });
  return {
    project: makeStory("ms", "원고 이야기", { characters: [ARCADIA, SECOND], scenes }),
    manuscripts: new Map([[copy, body.join("\n")]]),
  };
}

describe("고유명사 사전", () => {
  it("인물(별칭 포함), 장면에 쓰인 장소, 세계관 항목을 모은다", () => {
    const project = makeStory("d", "사전", {
      characters: [{ ...HAEUN, aliases: ["은이"] }, DOJIN],
      scenes: [
        { id: "s1", title: "a", order: 10, locationId: "시장" },
        { id: "s2", title: "b", order: 20, locationId: "시장" },
        { id: "s3", title: "c", order: 30, locationId: " 금고 " },
        { id: "s4", title: "d", order: 40 },
      ],
    });
    const dictionary = buildPlausibilityNameDictionary(project, [{ id: "lore-1", name: "별빛 길드", aliases: ["별길"] }]);
    expect(dictionary.map((entry) => `${entry.sourceKind}:${entry.canonical}`)).toEqual([
      "character:하은", "character:도진", "location:금고", "location:시장", "lore:별빛 길드",
    ]);
    expect(dictionary[0]?.aliases).toEqual(["은이"]);
    expect(dictionary.at(-1)?.aliases).toEqual(["별길"]);
  });
});

describe("이름 표기 검사 읽기", () => {
  it("장면 원문마다 표기 흔들림을 찾고, 발견이 있는 장면만 묶음에 담는다", async () => {
    const { project, manuscripts } = manuscriptProject({
      s1: "아르카디아가 시장을 걸었다. 모아나이가 따라왔다.",
      s2: "아르카디야가 문을 열었다.",
    });
    const result = await loadPlausibilityNameChecks({
      project, manuscripts, dictionary: buildPlausibilityNameDictionary(project), yieldToHost: noYield,
    });
    expect(result.batches.map((batch) => batch.sceneId)).toEqual(["s2"]);
    expect(result.batches[0]?.findings[0]).toMatchObject({ code: "name-variant", found: "아르카디야가" });
    expect(result.missingCopyScenes).toBe(0);
    expect(result.truncatedScenes).toBe(0);
  });

  it("미등록 이름 후보는 개연성 문제가 아니라서 기본으로 끈다", async () => {
    const { project, manuscripts } = manuscriptProject({ s1: "마루가 뛰었다. 마루가 짖었다. 마루가 잤다. 아르카디아가 웃었다." });
    const result = await loadPlausibilityNameChecks({
      project, manuscripts, dictionary: buildPlausibilityNameDictionary(project), yieldToHost: noYield,
    });
    expect(result.batches).toEqual([]);
  });

  it("사본이 없거나 위치가 맞지 않는 장면은 건너뛰고 센다", async () => {
    const { project } = manuscriptProject({ s1: "아르카디야가 걸었다.", s2: "모아나이가 웃었다." });
    const result = await loadPlausibilityNameChecks({
      project, manuscripts: new Map(), dictionary: buildPlausibilityNameDictionary(project), yieldToHost: noYield,
    });
    expect(result.batches).toEqual([]);
    expect(result.missingCopyScenes).toBe(2);
    const short = await loadPlausibilityNameChecks({
      project, manuscripts: new Map([["copy-1", "너무 짧음"]]), dictionary: buildPlausibilityNameDictionary(project), yieldToHost: noYield,
    });
    expect(short.missingCopyScenes).toBe(2);
  });

  it("출처가 없는 장면과 사용하지 않는 장면은 검사 대상이 아니다", async () => {
    const { project, manuscripts } = manuscriptProject({ s1: "아르카디야가 걸었다." });
    const mixed: StoryworldProject = {
      ...project,
      scenes: [
        ...project.scenes.map((scene) => ({ ...scene, disabled: true })),
        { id: "plain", title: "직접 쓴 장면", order: 99, participantIds: ["arcadia"] },
      ],
    };
    const result = await loadPlausibilityNameChecks({
      project: mixed, manuscripts, dictionary: buildPlausibilityNameDictionary(mixed), yieldToHost: noYield,
    });
    expect(result).toEqual({ batches: [], truncatedScenes: 0, missingCopyScenes: 0 });
  });

  it("아주 긴 장면은 앞부분만 검사하고 센다", async () => {
    const long = `아르카디야가 걸었다. ${"가".repeat(PLAUSIBILITY_NAME_CHECK_MAX_SCENE_CHARS + 500)}`;
    const { project, manuscripts } = manuscriptProject({ s1: long });
    const result = await loadPlausibilityNameChecks({
      project, manuscripts, dictionary: buildPlausibilityNameDictionary(project), yieldToHost: noYield,
    });
    expect(result.truncatedScenes).toBe(1);
    expect(result.batches[0]?.text.length).toBe(PLAUSIBILITY_NAME_CHECK_MAX_SCENE_CHARS);
  });

  it("장면 묶음마다 제어권을 돌려주고 진행을 알린다", async () => {
    const texts: Record<string, string> = {};
    for (let i = 0; i < PLAUSIBILITY_NAME_CHECK_CHUNK * 2 + 3; i += 1) texts[`s${i}`] = "아르카디아가 걸었다.";
    const { project, manuscripts } = manuscriptProject(texts);
    let yields = 0;
    const progress: number[] = [];
    await loadPlausibilityNameChecks({
      project, manuscripts, dictionary: buildPlausibilityNameDictionary(project),
      yieldToHost: () => { yields += 1; return Promise.resolve(); },
      onProgress: (done) => progress.push(done),
    });
    expect(yields).toBe(2);
    expect(progress.at(-1)).toBe(PLAUSIBILITY_NAME_CHECK_CHUNK * 2 + 3);
  });

  it("취소 신호가 켜지면 AbortError로 멈춘다", async () => {
    const { project, manuscripts } = manuscriptProject({ s1: "하은이 걸었다." });
    const controller = new AbortController();
    controller.abort();
    await expect(loadPlausibilityNameChecks({
      project, manuscripts, dictionary: buildPlausibilityNameDictionary(project), signal: controller.signal, yieldToHost: noYield,
    })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("장면 600개짜리 원고도 정해진 시간 안에 끝난다", async () => {
    const texts: Record<string, string> = {};
    for (let i = 0; i < 600; i += 1) texts[`s${i}`] = `아르카디아가 시장을 걸었다. 모아나이가 따라왔다. ${"비가 내리고 바람이 불었다. ".repeat(60)}`;
    const { project, manuscripts } = manuscriptProject(texts);
    const started = Date.now();
    const result = await loadPlausibilityNameChecks({
      project, manuscripts, dictionary: buildPlausibilityNameDictionary(project), yieldToHost: noYield,
    });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(result.missingCopyScenes).toBe(0);
  });
});

describe("출처 읽기", () => {
  it("작품 id가 없으면 기획 저장소 출처를 읽지 않고 원고만 검사한다", async () => {
    const { project, manuscripts } = manuscriptProject({ s1: "아르카디야가 걸었다." });
    const result = await loadPlausibilityExtras({ project, workId: null, storage: memoryStorage(), manuscripts, yieldToHost: noYield });
    expect(result.extras.foreshadow).toBeUndefined();
    expect(result.extras.lore).toBeUndefined();
    expect(result.extras.nameChecks).toHaveLength(1);
    expect(result.notices).toEqual([]);
  });

  it("저장된 것이 하나도 없으면 아무 출처도 연결하지 않는다", async () => {
    const { extras, notices } = await loadPlausibilityExtras({
      project: makeStory("e", "빈", { scenes: [] }), workId: "work-1", storage: memoryStorage(),
    });
    expect(extras).toEqual({});
    expect(notices).toEqual([]);
  });

  it("복선 장부와 기획 순서를 읽어 기한이 지난 복선을 알린다", async () => {
    const storage = memoryStorage();
    const initial = ensureStudioProjectPlanning(storage, "work-1", NOW);
    const first = initial.plans[0];
    if (!first) throw new Error("초기 기획이 필요합니다.");
    for (const number of [2, 3]) {
      saveStudioEpisodePlan(storage, "work-1", { ...first, id: `work-1:episode-plan-${number}`, episodeId: `work-1:episode-${number}`, episodeNumber: number, title: `${number}화` });
    }
    const seed = createForeshadowSeed({
      id: "seed-1", projectId: "work-1", title: "숨긴 편지",
      plantedIn: { episodeId: "work-1:episode-1" },
      expectedPayoff: { fromEpisodeId: "work-1:episode-2", toEpisodeId: "work-1:episode-2" },
      now: NOW,
    });
    writeStudioForeshadowLedger(storage, { schemaVersion: 1, projectId: "work-1", seeds: upsertForeshadowSeed([], seed) });

    const project = makeStory("f", "복선", {
      scenes: [{ id: "s1", title: "편지를 숨기다", order: 10, episodeNumber: 1, participantIds: ["haeun"] }],
    });
    const { extras } = await loadPlausibilityExtras({ project, workId: "work-1", storage });
    expect(extras.foreshadow?.totalCount).toBe(1);
    expect(extras.foreshadow?.overdue.map((item) => item.id)).toEqual(["seed-1"]);
    expect(extras.foreshadow?.episodes.map((episode) => episode.episodeNumber)).toEqual([1, 2, 3]);
    const report = buildPlausibilityReport({ project, generatedAtIso: NOW, extras });
    expect(report.findings.some((finding) => finding.source.module === "foreshadow-ledger" && finding.source.code === "overdue")).toBe(true);
  });

  it("기획 저장소가 없는데 복선이 있으면 기한을 따지지 못했다고 알린다", async () => {
    const storage = memoryStorage();
    const seed = createForeshadowSeed({ id: "seed-1", projectId: "work-1", title: "편지", plantedIn: { episodeId: "ep-1" }, now: NOW });
    writeStudioForeshadowLedger(storage, { schemaVersion: 1, projectId: "work-1", seeds: [seed] });
    const { extras, notices } = await loadPlausibilityExtras({ project: makeStory("f", "복선", { scenes: [] }), workId: "work-1", storage });
    expect(extras.foreshadow).toMatchObject({ totalCount: 1, overdue: [], dueSoon: [] });
    expect(notices.join(" ")).toContain("회수 기한을 따지지 못했어요");
  });

  it("세계관 설정을 검증하고, 인물 목록을 모르면 인물 연결은 판정하지 않는다", async () => {
    const storage = memoryStorage();
    let lore = emptyWorldLore("work-1");
    lore = upsertLoreEntry(lore, withLoreEntryDefaults({
      id: "lore-place-1", kind: "place", name: "별빛 거리", aliases: [], summary: "", details: "", eraLabel: "", timelineOrder: null,
      relatedEntryIds: [], characterIds: ["없는-인물"], origin: "authored",
    }));
    writeStudioWorldLore(storage, lore);
    const { extras, notices } = await loadPlausibilityExtras({ project: makeStory("l", "설정", { scenes: [] }), workId: "work-1", storage });
    expect(extras.lore?.entryCount).toBe(1);
    expect(extras.lore?.issues.some((issue) => issue.code === "lore-character-reference")).toBe(false);
    expect(extras.lore?.entryNames).toEqual({ "lore-place-1": "별빛 거리" });
    expect(notices).toEqual([]);
  });

  it("원고 사본이 비어 있으면 이름 검사를 연결하지 않는다", async () => {
    const { project } = manuscriptProject({ s1: "아르카디야가 걸었다." });
    const { extras } = await loadPlausibilityExtras({ project, workId: null, storage: null, manuscripts: new Map() });
    expect(extras.nameChecks).toBeUndefined();
  });

  it("사본을 찾을 수 없는 장면 수를 작가의 말로 알린다", async () => {
    const { project } = manuscriptProject({ s1: "아르카디야가 걸었다.", s2: "모아나이가 웃었다." });
    const { notices } = await loadPlausibilityExtras({
      project, workId: null, storage: null, manuscripts: new Map([["다른-사본", "내용"]]), yieldToHost: noYield,
    });
    expect(notices).toEqual(["장면 2개는 원고 사본을 찾을 수 없어서 이름 표기를 검사하지 못했어요."]);
  });
});
