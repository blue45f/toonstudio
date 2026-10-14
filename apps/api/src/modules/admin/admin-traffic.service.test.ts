import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminTrafficService } from "./admin-traffic.service";
import type { TrafficAnalyticsRepository } from "../traffic-analytics/traffic-analytics.repository";

const admin = vi.hoisted(() => vi.fn());
vi.mock("./admin-types", () => ({ requireAdminUser: admin }));

function fixture() {
  const repository: TrafficAnalyticsRepository = {
    persistPageView: vi.fn(), persistHeartbeat: vi.fn(), persistShareEvent: vi.fn(), cleanup: vi.fn(),
    persistWebVitals: vi.fn(), webVitalsSamples: vi.fn(async () => []),
    overview: vi.fn(async () => ({ status: "live" })), pulse: vi.fn(async () => ({ activeVisitors: 3 })), checkHealth: vi.fn(async () => true),
  };
  return { repository, service: new AdminTrafficService(repository) };
}

beforeEach(() => { admin.mockReset().mockResolvedValue(undefined); });

describe("관리자 트래픽 저장소 권한 경계", () => {
  it("관리자 확인 이후 선택된 repository만 읽고 기간·응답을 유지한다", async () => {
    const { repository, service } = fixture();
    await expect(service.getOverview("admin", "8")).resolves.toEqual({ status: "live" });
    expect(admin).toHaveBeenCalledWith("admin");
    expect(repository.overview).toHaveBeenCalledWith(expect.objectContaining({ days: 7, bucketSeconds: 21600 }));
  });

  it("pulse 캐시가 있어도 권한을 다시 확인하고 권한 없으면 저장소를 호출하지 않는다", async () => {
    const { repository, service } = fixture();
    await service.getPulse("admin");
    await service.getPulse("admin");
    expect(repository.pulse).toHaveBeenCalledTimes(1);
    admin.mockRejectedValue(new Error("forbidden"));
    await expect(service.getPulse("member")).rejects.toThrow("forbidden");
    await expect(service.getOverview("member", "7")).rejects.toThrow("forbidden");
    expect(repository.pulse).toHaveBeenCalledTimes(1);
    expect(repository.overview).not.toHaveBeenCalled();
  });

  it("CWV 리포트는 현재·직전 기간을 나란히 읽어 회귀까지 판정한다", async () => {
    const { repository, service } = fixture();
    const good = Array.from({ length: 30 }, () => ({ path: "/", lcpMs: 2_000, cls: 0.05, inpMs: 150 }));
    const bad = Array.from({ length: 30 }, () => ({ path: "/", lcpMs: 4_500, cls: 0.05, inpMs: 150 }));
    vi.mocked(repository.webVitalsSamples)
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce(good);
    const report = await service.getWebVitals("admin", "30");
    expect(admin).toHaveBeenCalledWith("admin");
    expect(repository.webVitalsSamples).toHaveBeenCalledTimes(2);
    expect(report.status).toBe("regressed");
    expect(report.windowDays).toBe(30);
    expect(report.alerts[0]).toMatchObject({ metric: "LCP", severity: "critical" });

    admin.mockRejectedValue(new Error("forbidden"));
    await expect(service.getWebVitals("member", "30")).rejects.toThrow("forbidden");
    expect(repository.webVitalsSamples).toHaveBeenCalledTimes(2);
  });

  it("선택 저장소의 장애를 비어 있는 PostgreSQL 결과로 바꾸지 않는다", async () => {
    const { repository, service } = fixture();
    vi.mocked(repository.overview).mockRejectedValue(new Error("unavailable"));
    await expect(service.getOverview("admin", "1")).rejects.toThrow("unavailable");
  });
});
