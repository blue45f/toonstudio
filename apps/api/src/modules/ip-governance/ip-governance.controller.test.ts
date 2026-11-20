import { describe, expect, it, vi } from "vitest";

import { IpGovernanceNotificationService } from "./ip-governance-notification.service";
import { IpGovernanceController } from "./ip-governance.controller";
import {
  IP_GOVERNANCE_SCHEMA_SQL,
  IpGovernanceRepository,
} from "./ip-governance.repository";
import { IpGovernanceService } from "./ip-governance.service";

import type { Pool } from "pg";

describe("IpGovernanceController fullstack lifecycle, persistence & creator alerts", () => {
  it("issues trust seal with TDMRep headers, emits creator hold alert on revocation, and restores settlement on reissue", async () => {
    const repository = new IpGovernanceRepository();
    const notifications = new IpGovernanceNotificationService();
    const service = new IpGovernanceService(repository, notifications);
    const controller = new IpGovernanceController(service);

    const headers = new Map<string, string>();
    const resMock = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    };

    const issued = await controller.getTitleTrustSeal("empress-sword", "황녀의 검", resMock);
    expect(issued.effectiveStatus).toBe("active");
    expect(issued.effectiveLevel).toBe("verified-10-stage");
    expect(headers.get("TDM-Reservation")).toBe("1");
    expect(headers.get("X-ToonStudio-Seal-Digest")).toBe(issued.seal.sealDigestHash);

    const revoked = await controller.revokeTitleTrustSeal("empress-sword", {
      reasonCode: "font-license-expired",
      reasonDetail: "타이틀 폰트 만료",
    });
    expect(revoked.effectiveStatus).toBe("revoked");
    expect(revoked.effectiveLevel).toBe("unverified");

    const holdAlerts = controller.getTitleCreatorAlerts("empress-sword");
    expect(holdAlerts.length).toBe(1);
    expect(holdAlerts[0].kind).toBe("revocation-hold");
    expect(holdAlerts[0].remediationGuide).toContain("Pretendard");

    const held = await controller.executeTitleEscrowSettlement("empress-sword", {
      grossRevenueKrw: 10_000_000,
      unrecoupedAdvanceKrw: 2_000_000,
      creatorSplitPercent: 60,
    });
    expect(held.action).toBe("hold");
    expect(held.creatorPayoutKrw).toBe(0);

    const reissued = await controller.reissueTitleTrustSeal("empress-sword", {
      replacementAssetLabel: "Pretendard Commercial (OFL)",
      evidenceReferenceId: "LIC-OFL-2026-01",
    });
    expect(reissued.effectiveStatus).toBe("active");
    expect(reissued.supersededSealDigestHash).toBe(issued.seal.sealDigestHash);
    expect(reissued.seal.sealDigestHash).not.toBe(issued.seal.sealDigestHash);

    const restoredAlerts = controller.getTitleCreatorAlerts("empress-sword");
    expect(restoredAlerts.length).toBe(2);
    expect(restoredAlerts[0].kind).toBe("reissuance-restored");

    const released = await controller.executeTitleEscrowSettlement("empress-sword", {
      grossRevenueKrw: 10_000_000,
      unrecoupedAdvanceKrw: 2_000_000,
      creatorSplitPercent: 60,
    });
    expect(released.action).toBe("release");
    expect(released.advanceRecoupedKrw).toBe(2_000_000);
    expect(released.creatorPayoutKrw).toBe(4_800_000);
    expect(released.studioShareKrw).toBe(3_200_000);
  });

  it("persists seals and revocations through injected PostgreSQL Pool when configured", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    const fakePool = { query: queryMock } as unknown as Pool;
    const repo = new IpGovernanceRepository(fakePool);
    const service = new IpGovernanceService(repo, new IpGovernanceNotificationService());

    expect(IP_GOVERNANCE_SCHEMA_SQL).toContain("ip_governance_trust_seals");
    expect(IP_GOVERNANCE_SCHEMA_SQL).toContain("ip_governance_revocations");

    await service.issueTrustSeal({ slug: "pg-test-title", seriesTitle: "PG 영속화 테스트작" });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ip_governance_trust_seals"),
      expect.arrayContaining(["pg-test-title"]),
    );
  });
});
