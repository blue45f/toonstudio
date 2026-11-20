import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { IpGovernanceController } from "./ip-governance.controller";
import { IpGovernanceRepository } from "./ip-governance.repository";
import { IpGovernanceService } from "./ip-governance.service";

describe("IpGovernanceController fullstack lifecycle & RBAC", () => {
  it("enforces RBAC on revoke/reissue, emits TDMRep headers, holds escrow on revocation, and restores settlement on reissue", () => {
    const repository = new IpGovernanceRepository();
    const service = new IpGovernanceService(repository);
    const controller = new IpGovernanceController(service);

    const headers = new Map<string, string>();
    const resMock = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    };

    const issued = controller.getTitleTrustSeal("empress-sword", "황녀의 검", resMock);
    expect(issued.effectiveStatus).toBe("active");
    expect(issued.effectiveLevel).toBe("verified-10-stage");
    expect(headers.get("TDM-Reservation")).toBe("1");
    expect(headers.get("X-ToonStudio-Seal-Digest")).toBe(issued.seal.sealDigestHash);

    expect(() =>
      controller.revokeTitleTrustSeal(
        "empress-sword",
        { reasonCode: "font-license-expired", reasonDetail: "권한 없음 테스트" },
        "reader",
      ),
    ).toThrow(ForbiddenException);

    const revoked = controller.revokeTitleTrustSeal(
      "empress-sword",
      {
        reasonCode: "font-license-expired",
        reasonDetail: "타이틀 폰트 만료",
      },
      "legal-ops",
    );
    expect(revoked.effectiveStatus).toBe("revoked");
    expect(revoked.effectiveLevel).toBe("unverified");

    const held = controller.executeTitleEscrowSettlement("empress-sword", {
      grossRevenueKrw: 10_000_000,
      unrecoupedAdvanceKrw: 2_000_000,
      creatorSplitPercent: 60,
    });
    expect(held.action).toBe("hold");
    expect(held.creatorPayoutKrw).toBe(0);

    const reissued = controller.reissueTitleTrustSeal(
      "empress-sword",
      {
        replacementAssetLabel: "Pretendard Commercial (OFL)",
        evidenceReferenceId: "LIC-OFL-2026-01",
      },
      "studio-admin",
    );
    expect(reissued.effectiveStatus).toBe("active");
    expect(reissued.supersededSealDigestHash).toBe(issued.seal.sealDigestHash);
    expect(reissued.seal.sealDigestHash).not.toBe(issued.seal.sealDigestHash);

    const released = controller.executeTitleEscrowSettlement("empress-sword", {
      grossRevenueKrw: 10_000_000,
      unrecoupedAdvanceKrw: 2_000_000,
      creatorSplitPercent: 60,
    });
    expect(released.action).toBe("release");
    expect(released.advanceRecoupedKrw).toBe(2_000_000);
    expect(released.creatorPayoutKrw).toBe(4_800_000);
    expect(released.studioShareKrw).toBe(3_200_000);
  });
});
