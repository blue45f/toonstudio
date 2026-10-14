import { describe, expect, it } from "vitest";

import { planStudioStoryboard } from "./studio-storyboard-planner";
import {
  appendScreenplayBeats,
  buildScreenplayImportDraft,
  parseScreenplay,
  screenplayToStoryBeats,
} from "./studio-screenplay-import";

const SCRIPT = [
  "S#1 카페 - 낮",
  "지훈이 창가에 앉아 있다.",
  "지훈: 오늘도 늦었네.",
  "민아: 미안, 차가 막혀서.",
  "// 여기는 조용히 시작",
  "S#2 거리 - 밤",
  "두 사람이 걷는다.",
  "S#3 빈 방",
  "S#4 전화 부스",
  "지훈: 여보세요?",
].join("\n");

describe("parseScreenplay", () => {
  it("씬·지문·대사·메모를 나누고 통계를 낸다", () => {
    const parsed = parseScreenplay(SCRIPT);
    expect(parsed.stats.sceneCount).toBe(4);
    expect(parsed.stats.dialogueCount).toBe(3);
    expect(parsed.stats.actionCount).toBe(2);
    expect(parsed.stats.speakers).toEqual(["민아", "지훈"]);
    expect(parsed.scenes[0]?.location).toBe("카페 - 낮");
  });

  it("빈 씬과 대사만 있는 씬을 이슈로 보고한다", () => {
    const parsed = parseScreenplay(SCRIPT);
    const kinds = parsed.issues.map((issue) => issue.kind);
    expect(kinds).toContain("empty-scene");
    expect(kinds).toContain("dialogue-only-scene");
    const empty = parsed.issues.find((issue) => issue.kind === "empty-scene");
    expect(empty?.line).toBe(8);
  });

  it("콜론이 있어도 화자 후보에 공백이 있으면 지문으로 본다", () => {
    const parsed = parseScreenplay(["S#1 방", "시간은 오후 3시: 약속 시간이 지났다."].join("\n"));
    expect(parsed.stats.dialogueCount).toBe(0);
    expect(parsed.stats.actionCount).toBe(1);
  });
});

describe("screenplayToStoryBeats", () => {
  it("씬별 비트와 대사 목록을 만들고 메모는 비트로 가지 않는다", () => {
    const draft = buildScreenplayImportDraft(SCRIPT);
    // 씬1: setup 1 + dialogue 2, 씬2: setup 1, 씬3: 없음(빈 씬), 씬4: dialogue 1
    expect(draft.beats).toHaveLength(5);
    expect(draft.beats.map((beat) => beat.kind)).toEqual([
      "setup",
      "dialogue",
      "dialogue",
      "setup",
      "dialogue",
    ]);
    expect(draft.beats.map((beat) => beat.order)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(draft.beats.map((beat) => beat.id)).size).toBe(5);
    expect(draft.scenes[0]?.dialogueLines).toEqual([
      { speaker: "지훈", text: "오늘도 늦었네." },
      { speaker: "민아", text: "미안, 차가 막혀서." },
    ]);
    expect(draft.scenes[0]?.notes).toEqual(["여기는 조용히 시작"]);
    expect(draft.scenes[2]?.beatIds).toEqual([]);
    expect(draft.scenes[0]?.panelCountEstimate).toBe(2);
  });

  it("변환된 비트는 플래너 계약을 그대로 통과한다", () => {
    const draft = buildScreenplayImportDraft(SCRIPT, {
      characterIdByName: { 지훈: "char-jihoon", 민아: "char-mina" },
    });
    const plan = planStudioStoryboard(draft.beats);
    expect(plan.shots).toHaveLength(draft.beats.length);
    expect(plan.warnings).toEqual([]);
    const firstDialogue = draft.beats.find((beat) => beat.kind === "dialogue");
    expect(firstDialogue?.characterIds).toEqual(["char-jihoon"]);
    expect(firstDialogue?.dialogue).toBe("오늘도 늦었네.");
  });

  it("캐릭터 매핑이 없으면 characterIds를 지어내지 않고 플래너 경고로 드러난다", () => {
    const draft = buildScreenplayImportDraft(SCRIPT);
    const dialogueBeat = draft.beats.find((beat) => beat.kind === "dialogue");
    expect(dialogueBeat?.characterIds).toEqual([]);
    const plan = planStudioStoryboard(draft.beats);
    expect(plan.status).toBe("review");
    expect(plan.warnings.some((warning) => warning.startsWith("character-missing:"))).toBe(true);
  });

  it("장소 매핑과 sceneId 커스텀을 적용하고 잘못된 옵션은 throw 한다", () => {
    const parsed = parseScreenplay(SCRIPT);
    const draft = screenplayToStoryBeats(parsed, {
      locationIdByName: { "카페 - 낮": "loc-cafe" },
      sceneIdFor: (scene) => `episode-scene-${scene.index + 1}`,
      startOrder: 10,
    });
    expect(draft.beats[0]?.locationId).toBe("loc-cafe");
    expect(draft.beats[0]?.sceneId).toBe("episode-scene-1");
    expect(draft.beats[0]?.order).toBe(10);
    expect(() => screenplayToStoryBeats(parsed, { idPrefix: "bad prefix!" })).toThrow();
    expect(() => screenplayToStoryBeats(parsed, { startOrder: -1 })).toThrow();
  });
});

describe("appendScreenplayBeats", () => {
  it("기존 비트 뒤에 order를 이어 매기고 id 충돌은 접미사로 피한다", () => {
    const first = buildScreenplayImportDraft(SCRIPT);
    const second = buildScreenplayImportDraft(SCRIPT);
    const merged = appendScreenplayBeats(first.beats, second.beats);
    expect(merged).toHaveLength(10);
    expect(new Set(merged.map((beat) => beat.id)).size).toBe(10);
    expect(new Set(merged.map((beat) => beat.order)).size).toBe(10);
    expect(merged[5]?.order).toBe(5);
    expect(() => planStudioStoryboard(merged)).not.toThrow();
    // 원본 불변
    expect(first.beats).toHaveLength(5);
    expect(appendScreenplayBeats(first.beats, [])).toBe(first.beats);
  });
});
