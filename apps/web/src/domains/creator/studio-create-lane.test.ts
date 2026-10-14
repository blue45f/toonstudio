import { describe, expect, it } from "vitest";

import {
  resolveStudioCreateLane,
  studioCreateExplicitLane,
  studioCreateLanding,
  studioCreateLaneForStartPoint,
  studioCreateLaneSpec,
} from "./studio-create-lane";

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe("studio-create-lane (BLUEPRINT §2.3 레인 계약)", () => {
  it("명시된 ?lane=이 start·template 추론보다 우선한다", () => {
    expect(resolveStudioCreateLane(params("lane=blank&start=idea"))).toBe("blank");
    expect(resolveStudioCreateLane(params("lane=idea&template=webtoon-vertical-episode"))).toBe("idea");
    expect(studioCreateExplicitLane(params("lane=storyboard"))).toBe("storyboard");
  });

  it("모르는 ?lane= 값은 추론으로 떨어지지 않고 레인 없음으로 본다", () => {
    expect(resolveStudioCreateLane(params("lane=unknown&start=idea"))).toBeNull();
    expect(studioCreateExplicitLane(params("lane=unknown"))).toBeNull();
  });

  it("?template= 진입은 템플릿 레인으로 추론한다(캔버스 규격은 템플릿이 결정)", () => {
    expect(resolveStudioCreateLane(params("template=webtoon-vertical-episode"))).toBe("template");
    expect(studioCreateLaneSpec("template")).toMatchObject({ startPoint: null, landing: "editor" });
  });

  it("start 파라미터만으로는 이야기/콘티 레인을 추론한다", () => {
    expect(resolveStudioCreateLane(params("start=idea"))).toBe("idea");
    expect(resolveStudioCreateLane(params("start=script"))).toBe("idea");
    expect(resolveStudioCreateLane(params("start=storyboard"))).toBe("storyboard");
    expect(resolveStudioCreateLane(params("start=files"))).toBeNull();
  });

  it("레인 없는 딥링크는 null이라 기존 동작을 유지한다", () => {
    expect(resolveStudioCreateLane(params(""))).toBeNull();
    expect(resolveStudioCreateLane(params("kind=illustration"))).toBeNull();
    expect(studioCreateLanding(null)).toBeNull();
  });

  it("레인별 첫 단계 초기값과 착지가 명세대로다: 이야기→기획, 콘티·빈 캔버스·템플릿→에디터", () => {
    expect(studioCreateLaneSpec("idea")).toMatchObject({ startPoint: "idea", landing: "planning" });
    expect(studioCreateLaneSpec("storyboard")).toMatchObject({ startPoint: "storyboard", landing: "editor" });
    expect(studioCreateLaneSpec("blank")).toMatchObject({ startPoint: null, landing: "editor" });
    expect(studioCreateLanding("idea")).toBe("planning");
    expect(studioCreateLanding("storyboard")).toBe("editor");
    expect(studioCreateLanding("blank")).toBe("editor");
    expect(studioCreateLanding("template")).toBe("editor");
  });

  it("양식 안에서 재료를 바꾸면 레인이 따라가되, files는 가져오기 착지를 위해 레인을 바꾸지 않는다", () => {
    expect(studioCreateLaneForStartPoint("idea")).toBe("idea");
    expect(studioCreateLaneForStartPoint("script")).toBe("idea");
    expect(studioCreateLaneForStartPoint("storyboard")).toBe("storyboard");
    expect(studioCreateLaneForStartPoint("files")).toBeNull();
  });
});
