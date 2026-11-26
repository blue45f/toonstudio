import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  TeamCreditSubwalletService,
  type TeamAssistantQuotaRecord,
  type TeamSubwalletStore,
} from "./team-credit-subwallet.service";

function createMemoryQuotaStore(): TeamSubwalletStore {
  let rows: TeamAssistantQuotaRecord[] = [];
  return {
    listAll: async () => [...rows],
    saveAll: async (next) => {
      rows = [...next];
    },
  };
}

describe("TeamCreditSubwalletService (팀 공용 크레딧 지갑 외주 어시별 한도 배정 및 회수)", () => {
  it("PD가 외주 어시스턴트에게 회차 한도를 배정하고, 한도 내 차감 뒤 납품 완료 시 잔여 한도를 즉시 회수한다", async () => {
    const service = new TeamCreditSubwalletService(createMemoryQuotaStore());

    const allocated = await service.allocateQuota("pd-owner-1", {
      workspaceId: "ep48-review-room",
      assistantUserId: "assist-luna",
      assistantNickname: "펜선장인_루나",
      roleKo: "선화 어시스턴트",
      limitCredits: 300,
    });
    expect(allocated.limitCredits).toBe(300);
    expect(allocated.remainingCredits).toBe(300);
    expect(allocated.status).toBe("active");

    const afterSpend = await service.spendWithinQuota(
      "assist-luna",
      allocated.allocationId,
      { amountCredits: 120, featureLabel: "클라우드 스냅샷 백업" },
    );
    expect(afterSpend.usedCredits).toBe(120);
    expect(afterSpend.remainingCredits).toBe(180);

    // 한도(300C) 초과 사용 차단
    await expect(
      service.spendWithinQuota("assist-luna", allocated.allocationId, {
        amountCredits: 200,
      }),
    ).rejects.toThrow(ForbiddenException);

    // 제3자 무단 차감 차단
    await expect(
      service.spendWithinQuota("stranger-1", allocated.allocationId, {
        amountCredits: 10,
      }),
    ).rejects.toThrow(ForbiddenException);

    // 납품 완료 시 원클릭 한도 회수
    const revoked = await service.revokeQuota(
      "pd-owner-1",
      allocated.allocationId,
    );
    expect(revoked.status).toBe("revoked");
    expect(revoked.remainingCredits).toBe(0);
    expect(revoked.releasedCredits).toBe(180);

    // 회수 후 추가 사용 즉시 차단
    await expect(
      service.spendWithinQuota("assist-luna", allocated.allocationId, {
        amountCredits: 10,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
