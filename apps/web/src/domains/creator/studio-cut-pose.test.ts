import { describe, expect, it } from "vitest";

import {
  applyCutPoseRecommendation,
  buildCutPoseContext,
  cutPoseName,
  poseCatalogFromAdvancedPresets,
  readCutPoseId,
  undoCutPoseChange,
  withCutPose,
  type CutPoseCarrier,
} from "./studio-cut-pose";
import type { PoseCatalogEntry } from "./scene-3d/studio-pose-suggestion";

interface TestPage extends CutPoseCarrier {
  elements: readonly string[];
}

function page(id: string, extra: Partial<TestPage> = {}): TestPage {
  return { id, elements: [], ...extra };
}

const PAGES: readonly TestPage[] = Object.freeze([
  page("cut-1", { name: "도입", note: "카페에서 고백을 듣고 놀라는 장면" }),
  page("cut-2", { name: "대치", shotType: "two-shot" }),
  page("cut-3", { name: "클로징", posePresetId: "daily-standing-casual" }),
]);

describe("withCutPose", () => {
  it("포즈를 설정하면 새 배열·새 페이지 객체로 반영되고 원본은 그대로다", () => {
    const next = withCutPose(PAGES, "cut-1", "dramatic-shock-stepback");
    expect(next).not.toBe(PAGES);
    expect(readCutPoseId(next[0]!)).toBe("dramatic-shock-stepback");
    expect(readCutPoseId(PAGES[0]!)).toBeUndefined();
    expect(next[1]).toBe(PAGES[1]);
  });

  it("null 로 지우면 posePresetId 키 자체가 사라진다 (레거시 직렬화 형태 유지)", () => {
    const next = withCutPose(PAGES, "cut-3", null);
    expect("posePresetId" in next[2]!).toBe(false);
  });

  it("같은 값·없는 컷·빈 값 지우기는 원본 참조를 그대로 반환한다", () => {
    expect(withCutPose(PAGES, "cut-3", "daily-standing-casual")).toBe(PAGES);
    expect(withCutPose(PAGES, "missing", "daily-standing-casual")).toBe(PAGES);
    expect(withCutPose(PAGES, "cut-1", null)).toBe(PAGES);
    expect(withCutPose(PAGES, "cut-1", "  ")).toBe(PAGES);
  });

  it("공백이 섞인 id 는 trim 해서 저장한다", () => {
    const next = withCutPose(PAGES, "cut-1", " action-sword-slash ");
    expect(readCutPoseId(next[0]!)).toBe("action-sword-slash");
  });
});

describe("applyCutPoseRecommendation + undoCutPoseChange (적용 왕복·되돌리기)", () => {
  it("적용하면 before/after 기록이 나오고, 되돌리면 적용 전 상태로 돌아간다", () => {
    const { pages: applied, change } = applyCutPoseRecommendation(PAGES, "cut-1", "dramatic-shock-stepback");
    expect(change).toEqual({ pageId: "cut-1", before: null, after: "dramatic-shock-stepback" });
    expect(readCutPoseId(applied[0]!)).toBe("dramatic-shock-stepback");

    const reverted = undoCutPoseChange(applied, change!);
    expect("posePresetId" in reverted[0]!).toBe(false);
  });

  it("기존 포즈가 있던 컷은 되돌리기에서 그 포즈로 복원된다", () => {
    const { pages: applied, change } = applyCutPoseRecommendation(PAGES, "cut-3", "action-sword-slash");
    expect(change).toEqual({ pageId: "cut-3", before: "daily-standing-casual", after: "action-sword-slash" });
    const reverted = undoCutPoseChange(applied, change!);
    expect(readCutPoseId(reverted[2]!)).toBe("daily-standing-casual");
  });

  it("적용 뒤 포즈가 또 바뀌었으면 되돌리기가 덮지 않는다", () => {
    const { pages: applied, change } = applyCutPoseRecommendation(PAGES, "cut-1", "dramatic-shock-stepback");
    const changedAgain = withCutPose(applied, "cut-1", "daily-coffee-sip");
    expect(undoCutPoseChange(changedAgain, change!)).toBe(changedAgain);
  });

  it("같은 포즈 재적용·없는 컷·빈 id 는 change null + 원본 참조", () => {
    const same = applyCutPoseRecommendation(PAGES, "cut-3", "daily-standing-casual");
    expect(same.change).toBeNull();
    expect(same.pages).toBe(PAGES);
    expect(applyCutPoseRecommendation(PAGES, "missing", "x").change).toBeNull();
    expect(applyCutPoseRecommendation(PAGES, "cut-1", " ").change).toBeNull();
  });
});

describe("buildCutPoseContext", () => {
  it("메모를 장면 설명으로 쓰고, 투샷이면 2인을 단정한다", () => {
    expect(buildCutPoseContext(PAGES[0]!)).toEqual({
      sceneDescription: "카페에서 고백을 듣고 놀라는 장면",
    });
    expect(buildCutPoseContext(PAGES[1]!)).toEqual({
      sceneDescription: "대치",
      figures: 2,
    });
  });

  it("메모·이름이 모두 없으면 빈 맥락이다 (지어내지 않음)", () => {
    expect(buildCutPoseContext(page("cut-x"))).toEqual({});
  });
});

describe("poseCatalogFromAdvancedPresets + cutPoseName", () => {
  const catalog: PoseCatalogEntry[] = poseCatalogFromAdvancedPresets([
    {
      id: "dramatic-shock-stepback",
      name: "경악하며 뒷걸음질",
      category: "dramatic",
      gender: "any",
      figures: 1,
      tags: ["놀람"],
      description: "충격 장면용",
    },
  ]);

  it("메타 부분집합을 카탈로그 항목으로 그대로 옮긴다", () => {
    expect(catalog).toEqual([
      {
        id: "dramatic-shock-stepback",
        name: "경악하며 뒷걸음질",
        category: "dramatic",
        gender: "any",
        figures: 1,
        tags: ["놀람"],
        description: "충격 장면용",
      },
    ]);
  });

  it("적용 포즈 이름은 카탈로그에서 찾고, 없으면 id·미적용이면 null", () => {
    expect(cutPoseName({ posePresetId: "dramatic-shock-stepback" }, catalog)).toBe("경악하며 뒷걸음질");
    expect(cutPoseName({ posePresetId: "legacy-pose" }, catalog)).toBe("legacy-pose");
    expect(cutPoseName({}, catalog)).toBeNull();
  });
});
