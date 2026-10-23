import { afterEach, describe, expect, it } from "vitest";

import {
  clearRecentRequests,
  pushRecentRequest,
  RECENT_REQUEST_LIMIT,
  recentRequests,
  resetRecentRequestsForTests,
} from "./claude-assist-recents";

describe("최근 요청", () => {
  afterEach(resetRecentRequestsForTests);

  it("가장 최근 것을 맨 앞에 두고 같은 글은 앞으로 옮긴다", () => {
    pushRecentRequest("plan", "격자 켜 줘");
    pushRecentRequest("plan", "브러시로 바꿔 줘");
    pushRecentRequest("plan", "격자 켜 줘");

    expect(recentRequests("plan")).toEqual(["격자 켜 줘", "브러시로 바꿔 줘"]);
  });

  it("공백을 정리하고 빈 글·너무 긴 글은 기억하지 않는다", () => {
    pushRecentRequest("plan", "  격자   켜\n줘  ");
    pushRecentRequest("plan", "   ");
    pushRecentRequest("plan", "가".repeat(401));

    expect(recentRequests("plan")).toEqual(["격자 켜 줘"]);
  });

  it("상한을 넘으면 오래된 것부터 버린다", () => {
    for (let index = 0; index < RECENT_REQUEST_LIMIT + 3; index += 1) pushRecentRequest("plan", `요청 ${index}`);

    const list = recentRequests("plan");
    expect(list).toHaveLength(RECENT_REQUEST_LIMIT);
    expect(list[0]).toBe(`요청 ${RECENT_REQUEST_LIMIT + 2}`);
    expect(list).not.toContain("요청 0");
  });

  it("종류마다 따로 기억하고 한 종류만 지울 수 있다", () => {
    pushRecentRequest("plan", "계획 요청");
    pushRecentRequest("explain", "질문");

    clearRecentRequests("plan");

    expect(recentRequests("plan")).toEqual([]);
    expect(recentRequests("explain")).toEqual(["질문"]);
  });
});
