import { describe, expect, it } from "vitest";

import { buildStudioStoryAdaptationPlan, buildWriterRoomFromStoryAdaptation, createStudioStoryDevelopmentDocument } from "../studio-story-adaptation";
import { parseScreenplay } from "../studio-screenplay-import";
import { matchNamedStudioScene, readStudioStorySceneSources } from "./studio-story-scene-source";

describe("회차 대본의 장면 구성", () => {
  it("장면 제목, 장소, 빈 줄을 둔 지문과 대사를 한 장면으로 내보낸다", () => {
    const source = "머리말.\r\n\r\n장면 7 — 폐역 / 새벽\r\n등불이 꺼진다.\r\n\r\n“조용히.”\r\n\r\nScene 8 - 부두\r\n배가 멀어진다.";
    const normalized = source.replaceAll("\r\n", "\n");
    const { headings } = readStudioStorySceneSources(source);
    expect(headings.map(scene => normalized.slice(scene.start, scene.end))).toEqual(["장면 7 — 폐역 / 새벽", "Scene 8 - 부두"]);
    const plan = buildStudioStoryAdaptationPlan(source);
    expect(plan.scenes.map(scene => scene.heading)).toEqual(["Scene 1", ...headings.map(scene => scene.heading)]);
    expect(plan.beats.map(beat => beat.summary)).toEqual(["머리말.", "등불이 꺼진다.", "“조용히.”", "배가 멀어진다."]);
    expect(plan.scenes[1]?.beatIds).toHaveLength(2);
    expect(parseScreenplay(source).scenes.slice(-2).map(scene => scene.location)).toEqual(["폐역 / 새벽", "부두"]);
    const base = createStudioStoryDevelopmentDocument();
    const development = { ...base, chapters: [...base.chapters, { id: "two", title: "사라진 배", body: source, status: "draft" as const }] };
    const writer = buildWriterRoomFromStoryAdaptation({ development, plan, chapterId: "two" });
    expect(writer.stages["episode-outline"].title).toBe("사라진 배");
    expect(writer.stages.scenes.items.map(scene => scene.heading)).toEqual(plan.scenes.map(scene => scene.heading));
    expect(() => buildWriterRoomFromStoryAdaptation({ development, plan, chapterId: "missing" })).toThrow();
  });
  it("일반 산문·숫자 목록은 종전대로 처리하고 공백 장면과 65번째 장면을 구분한다", () => {
    expect(["장면을 고른다.", "Scene 13th", "내부에서 문을 닫는다.", "1. 우산", "장면 1의 사람"].map(matchNamedStudioScene)).toEqual([null,null,null,null,null]);
    expect(buildStudioStoryAdaptationPlan("첫 문단.\n\n둘째 문단.").scenes).toHaveLength(2);
    const empty = buildStudioStoryAdaptationPlan("INT. 지하 통로\n\nS#2 부두\n배가 뜬다.");
    expect(empty.scenes.map(scene => scene.heading)).toEqual(["S#2 부두"]);
    expect(empty.warnings).toContain("empty-scene");
    const chapters = Array.from({ length: 65 }, (_, i) => `장면 ${i + 1} — 보관실\n상자를 연다.`);
    expect(buildStudioStoryAdaptationPlan(chapters.slice(0,64).join("\n")).warnings).not.toContain("scene-limit-reached");
    const plan = buildStudioStoryAdaptationPlan(chapters.join("\n"));
    expect(plan.scenes).toHaveLength(64);
    expect(plan.warnings).toContain("scene-limit-reached");
  });
});
