import { describe, expect, it } from "vitest";

import { decideNotificationReach } from "./notification-reach";

import type { ProductionNotificationPolicy } from "./types";

const policy: ProductionNotificationPolicy = {
  id: "policy",
  projectId: "p",
  assignmentId: "owner",
  channels: ["in-app"],
  digest: "immediate",
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  enabled: true,
  dueSoonHours: 48,
  escalationHours: 24,
  updatedAt: "2026-09-21T00:00:00.000Z",
};

describe("decideNotificationReach (G1 도달 설계 정본)", () => {
  it("정책이 없으면 기본 도달 — 즉시 표시", () => {
    expect(decideNotificationReach({ policy: undefined, type: "mention", urgency: "info", quiet: "quiet" })).toBe("deliver-now");
  });
  it("정책이 꺼져 있으면 off", () => {
    expect(decideNotificationReach({ policy: { ...policy, enabled: false }, type: "mention", urgency: "critical", quiet: "active" })).toBe("off");
  });
  it("유형별 끄기는 긴급도보다 우선한다", () => {
    expect(decideNotificationReach({ policy: { ...policy, mutedTypes: ["due-soon"] }, type: "due-soon", urgency: "critical", quiet: "active" })).toBe("muted");
    expect(decideNotificationReach({ policy: { ...policy, mutedTypes: ["due-soon"] }, type: "mention", urgency: "info", quiet: "active" })).toBe("deliver-now");
  });
  it("조용 시간에는 보류하되 critical은 즉시 도달한다", () => {
    expect(decideNotificationReach({ policy, type: "review", urgency: "warning", quiet: "quiet" })).toBe("hold-quiet");
    expect(decideNotificationReach({ policy, type: "overdue", urgency: "critical", quiet: "quiet" })).toBe("deliver-now");
  });
  it("묶음 주기가 daily/weekly면 digest, 조용 시간 판정이 먼저다", () => {
    expect(decideNotificationReach({ policy: { ...policy, digest: "daily" }, type: "review", urgency: "info", quiet: "active" })).toBe("digest");
    expect(decideNotificationReach({ policy: { ...policy, digest: "weekly" }, type: "review", urgency: "info", quiet: "quiet" })).toBe("hold-quiet");
  });
});
