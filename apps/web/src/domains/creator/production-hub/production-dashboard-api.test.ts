import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProductionProject } from "./production-api";
import { getProductionProjectCollabRecord } from "./production-dashboard-api";

const http = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/platform/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/api")>();
  return { ...actual, api: { ...actual.api, get: (...args: unknown[]) => http.get(...args) } };
});

describe("production dashboard API", () => {
  beforeEach(() => {
    http.get.mockReset();
    http.get.mockResolvedValue({ aggregate: {} });
  });

  it("협업 알림용 얇은 읽기는 전체 제작 클라이언트와 같은 엔드포인트를 쓴다", async () => {
    // 랜딩은 전체 제작 클라이언트(production-api)를 정적으로 가져오지 않으므로 두 경로가 갈라지지 않게 맞물려 둔다.
    // 퍼센트 인코딩이 필요한 id 로 경로 조립이 같은지 확인한다.
    const projectId = "project/with space?x=1";
    await getProductionProject(projectId);
    await getProductionProjectCollabRecord(projectId);

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(http.get.mock.calls[1]?.[0]).toBe(http.get.mock.calls[0]?.[0]);
    expect(http.get.mock.calls[1]?.[0]).toBe("/production/projects/project%2Fwith%20space%3Fx%3D1");
  });

  it("서버 응답을 가공하지 않고 그대로 돌려준다", async () => {
    const record = { aggregate: { projectId: "p-1", title: "작품", parties: [], assignments: [], reviewDecisions: [], handoffs: [] } };
    http.get.mockResolvedValueOnce(record);

    await expect(getProductionProjectCollabRecord("p-1")).resolves.toBe(record);
  });

  it("요청 실패는 호출자가 격리할 수 있게 그대로 거부한다", async () => {
    http.get.mockRejectedValueOnce(new Error("network"));

    await expect(getProductionProjectCollabRecord("p-1")).rejects.toThrow("network");
  });
});
