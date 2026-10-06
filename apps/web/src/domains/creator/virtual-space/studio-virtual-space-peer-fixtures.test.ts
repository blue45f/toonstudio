import { describe, expect, it } from "vitest";

import type { StudioBuildPlacementRequest } from "./studio-virtual-space-build-mode";
import {
  mergeStudioPeerPlacedFixtures,
  studioFixtureWireItemsFromRequests,
  studioPlacedRequestsFromWireItems,
} from "./studio-virtual-space-peer-fixtures";

function request(refId: string, x: number, y: number, rotation: StudioBuildPlacementRequest["rotation"] = 0): StudioBuildPlacementRequest {
  return {
    entryId: `furniture:${refId}`,
    category: "furniture",
    refId,
    point: { x, y },
    rotation,
  };
}

describe("배치 가구 와이어 변환", () => {
  it("요청 목록이 튜플로 왕복되고 카탈로그에 없는 항목은 버려진다", () => {
    const requests = [request("floor-lamp", 320, 416), request("whiteboard", 512, 256, 90)];
    const items = studioFixtureWireItemsFromRequests(requests);
    expect(items).toEqual([
      ["furniture:floor-lamp", 320, 416, 0],
      ["furniture:whiteboard", 512, 256, 90],
    ]);
    expect(studioPlacedRequestsFromWireItems(items)).toEqual(requests);
    expect(studioPlacedRequestsFromWireItems([
      ["furniture:nope", 100, 100, 0],
      ["furniture:floor-lamp", 100, 100, 0],
    ])).toEqual([request("floor-lamp", 100, 100)]);
  });

  it("고정물 층에서 빠지는 커피 머신도 데이터로서는 왕복한다", () => {
    const coffee = request("coffee-machine", 200, 200);
    expect(studioPlacedRequestsFromWireItems(studioFixtureWireItemsFromRequests([coffee]))).toEqual([coffee]);
    const merged = mergeStudioPeerPlacedFixtures({
      selfSessionId: "session-a",
      localRequests: [coffee],
      peerSets: [],
    });
    expect(merged).toEqual([]);
  });
});

describe("피어 배치 가구 합성", () => {
  it("로컬 배치만 있으면 전부 자기 소유로 합성된다", () => {
    const merged = mergeStudioPeerPlacedFixtures({
      selfSessionId: "session-a",
      localRequests: [request("floor-lamp", 320, 416)],
      peerSets: [],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.fixture.objectId).toBe("build:floor-lamp@320,416");
    expect(merged[0]?.ownerSessionId).toBe("session-a");
    expect(merged[0]?.own).toBe(true);
  });

  it("피어 배치는 소유를 구분해 합성되고, 배치 없는 피어(구버전)는 빈 목록이다", () => {
    const merged = mergeStudioPeerPlacedFixtures({
      selfSessionId: "session-a",
      localRequests: [],
      peerSets: [{ sessionId: "session-b", requests: [request("display-screen", 640, 300)] }],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.fixture.objectId).toBe("build:display-screen@640,300");
    expect(merged[0]?.ownerSessionId).toBe("session-b");
    expect(merged[0]?.own).toBe(false);
    expect(mergeStudioPeerPlacedFixtures({
      selfSessionId: "session-a",
      localRequests: [request("floor-lamp", 320, 416)],
      peerSets: [],
    })).toHaveLength(1);
  });

  it("같은 스펙·같은 좌표는 소유가 달라도 하나로 수렴하고 자기 쪽이 남는다", () => {
    const merged = mergeStudioPeerPlacedFixtures({
      selfSessionId: "session-b",
      localRequests: [request("floor-lamp", 100, 100)],
      peerSets: [{ sessionId: "session-a", requests: [request("floor-lamp", 100, 100)] }],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.ownerSessionId).toBe("session-b");
    expect(merged[0]?.own).toBe(true);
  });

  it("같은 좌표에 다른 스펙이 겹치면 세션 id가 가장 작은 소유자만 남는다 (양쪽에서 같은 결과)", () => {
    const fromB = mergeStudioPeerPlacedFixtures({
      selfSessionId: "session-b",
      localRequests: [request("whiteboard", 100, 100)],
      peerSets: [{ sessionId: "session-a", requests: [request("floor-lamp", 100, 100)] }],
    });
    expect(fromB.map((owned) => owned.fixture.objectId)).toEqual(["build:floor-lamp@100,100"]);
    expect(fromB[0]?.own).toBe(false);
    // 상대 화면에서 같은 입력을 넣으면 승자는 같고 own만 뒤집힌다.
    const fromA = mergeStudioPeerPlacedFixtures({
      selfSessionId: "session-a",
      localRequests: [request("floor-lamp", 100, 100)],
      peerSets: [{ sessionId: "session-b", requests: [request("whiteboard", 100, 100)] }],
    });
    expect(fromA.map((owned) => owned.fixture.objectId)).toEqual(["build:floor-lamp@100,100"]);
    expect(fromA[0]?.own).toBe(true);
  });

  it("자기 세션과 같은 피어 세트는 무시하고, 서로 다른 좌표는 전부 남는다", () => {
    const merged = mergeStudioPeerPlacedFixtures({
      selfSessionId: "session-a",
      localRequests: [request("floor-lamp", 100, 100)],
      peerSets: [
        { sessionId: "session-a", requests: [request("whiteboard", 500, 500)] },
        { sessionId: "session-b", requests: [request("neon-sign-open", 700, 200)] },
      ],
    });
    expect(merged.map((owned) => owned.fixture.objectId)).toEqual([
      "build:floor-lamp@100,100",
      "build:neon-sign-open@700,200",
    ]);
  });
});
