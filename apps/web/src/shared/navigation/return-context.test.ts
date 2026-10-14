import { describe, expect, it } from "vitest";

import {
  buildReturnContextHref,
  describeReturnContext,
  parseReturnContext,
  sanitizeReturnTo,
} from "./return-context";

describe("parseReturnContext", () => {
  it("최소 계약(returnTo·intent)만으로 맥락을 읽는다", () => {
    const context = parseReturnContext("returnTo=%2Fmarket%2Fresource%2Fr-1&intent=apply-market-resource");
    expect(context).toEqual({ returnTo: "/market/resource/r-1", intent: "apply-market-resource" });
  });

  it("단계·프로젝트·회차 식별자를 함께 읽는다", () => {
    const context = parseReturnContext(
      "returnTo=%2Flearn%2Fstory-board&intent=lesson-practice&stageId=storyboard&projectId=proj-1&episodeId=ep-3",
    );
    expect(context).toEqual({
      returnTo: "/learn/story-board",
      intent: "lesson-practice",
      stageId: "storyboard",
      projectId: "proj-1",
      episodeId: "ep-3",
    });
  });

  it("returnTo에 쿼리가 있어도 유지한다", () => {
    const context = parseReturnContext(
      new URLSearchParams({ returnTo: "/studio/publish?projectId=p-1", intent: "continue-work" }),
    );
    expect(context?.returnTo).toBe("/studio/publish?projectId=p-1");
  });

  it.each([
    ["외부 URL", "returnTo=https%3A%2F%2Fevil.test%2Fmarket&intent=continue-work"],
    ["프로토콜 상대 URL", "returnTo=%2F%2Fevil.test%2Fmarket&intent=continue-work"],
    ["상대 경로", "returnTo=market%2Fresource%2Fr-1&intent=continue-work"],
    ["해시 포함", "returnTo=%2Flearn%23top&intent=lesson-practice"],
    ["중첩 returnTo", "returnTo=%2Fstudio%3FreturnTo%3D%252Flearn&intent=continue-work"],
    ["intent 없음", "returnTo=%2Flearn"],
    ["모르는 intent", "returnTo=%2Flearn&intent=teleport"],
    ["모르는 stageId", "returnTo=%2Flearn&intent=lesson-practice&stageId=polish"],
    ["깨진 projectId", "returnTo=%2Flearn&intent=lesson-practice&projectId=bad%20id"],
    ["깨진 episodeId", "returnTo=%2Flearn&intent=lesson-practice&episodeId=%2Fetc"],
    ["파라미터 없음", ""],
  ])("안전하지 않거나 어긋난 계약은 버린다: %s", (_label, search) => {
    expect(parseReturnContext(search)).toBeNull();
  });
});

describe("sanitizeReturnTo", () => {
  it("내부 경로는 정규형으로 돌려주고 백슬래시는 거부한다", () => {
    expect(sanitizeReturnTo("/market/resource/r-1")).toBe("/market/resource/r-1");
    expect(sanitizeReturnTo("/market\\resource")).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
  });
});

describe("buildReturnContextHref", () => {
  it("기존 쿼리를 보존하면서 계약 파라미터를 싣는다", () => {
    const href = buildReturnContextHref("/studio?installMarketResource=r-1&assetMarket=community", {
      returnTo: "/market/resource/r-1",
      intent: "apply-market-resource",
    });
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/studio");
    expect(url.searchParams.get("installMarketResource")).toBe("r-1");
    expect(url.searchParams.get("assetMarket")).toBe("community");
    expect(parseReturnContext(url.searchParams)).toEqual({
      returnTo: "/market/resource/r-1",
      intent: "apply-market-resource",
    });
  });

  it("검증에 실패하는 복귀 대상이면 맥락 없이 기존 href를 돌려준다", () => {
    expect(
      buildReturnContextHref("/studio", { returnTo: "https://evil.test/", intent: "continue-work" }),
    ).toBe("/studio");
  });
});

describe("describeReturnContext", () => {
  it("의도·단계로 배너 한 줄과 복귀 행동 라벨을 만든다", () => {
    expect(
      describeReturnContext({ returnTo: "/x", intent: "apply-market-resource", stageId: "art" }, "ko"),
    ).toEqual({ title: "마켓 소재 적용 중 · 작화 단계", returnLabel: "끝나면 리소스로 돌아가기" });
    expect(describeReturnContext({ returnTo: "/x", intent: "lesson-practice" }, "en")).toEqual({
      title: "Lesson practice in progress",
      returnLabel: "Back to the lesson when done",
    });
  });
});
