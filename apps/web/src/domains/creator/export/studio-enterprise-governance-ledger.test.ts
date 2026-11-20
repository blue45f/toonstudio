import { describe, expect, it } from "vitest";

import {
  buildEnterpriseQuarterlyRollup,
  buildTakedownResponsePacket,
  createCoAuthorSplitAmendment,
  decideEscrowHoldOrRelease,
  evaluateLabelPolicyCompliance,
  evaluateRecoverySlaAlerts,
  traceImpactedEpisodesByAsset,
} from "./studio-enterprise-governance-ledger";

describe("studio-enterprise-governance-ledger (Waves 31–39)", () => {
  it("evaluates label policies, asset impact graphs, SLA alerts, escrow guards, amendments, takedown packets, and quarterly rollup", () => {
    const policyCheck = evaluateLabelPolicyCompliance(
      {
        labelId: "LBL-KR-01",
        labelName: "프리미엄 웹툰 레이블",
        requireCommercialAssets: true,
        requireAiTrainingOptOut: true,
        requireVoiceConsent: true,
        maxRecoverySlaHours: 24,
      },
      { commercialCleared: true, aiOptOut: true, voiceConsentVerified: false },
    );
    expect(policyCheck.compliant).toBe(false);
    expect(policyCheck.violations).toContain("성우 음성권 미인증");

    const impacted = traceImpactedEpisodesByAsset(
      [
        { assetId: "FONT-01", assetLabel: "타이틀 폰트", usedInEpisodes: ["ep-02", "ep-01"] },
        { assetId: "BG-01", assetLabel: "궁전 3D", usedInEpisodes: ["ep-03"] },
      ],
      ["FONT-01"],
    );
    expect(impacted).toEqual(["ep-01", "ep-02"]);

    const slaAlerts = evaluateRecoverySlaAlerts(
      [
        { episodeKey: "ep-01", elapsedHours: 10 },
        { episodeKey: "ep-02", elapsedHours: 30 },
      ],
      24,
    );
    expect(slaAlerts[0].severity).toBe("ok");
    expect(slaAlerts[1].severity).toBe("breached");

    const d1 = decideEscrowHoldOrRelease({
      episodeKey: "ep-01",
      amountKrw: 2_000_000,
      sealActive: true,
    });
    const d2 = decideEscrowHoldOrRelease({
      episodeKey: "ep-02",
      amountKrw: 2_000_000,
      sealActive: false,
    });
    expect(d1.action).toBe("release");
    expect(d2.action).toBe("hold");

    const amendment = createCoAuthorSplitAmendment({
      amendmentId: "AMD-01",
      episodeKey: "ep-01",
      previousSplits: { story: 50, art: 50 },
      nextSplits: { story: 45, art: 40, bg3d: 15 },
    });
    expect(amendment.validSum100).toBe(true);
    expect(amendment.amendmentHash).toMatch(/^fnv1a-/);

    const packet = buildTakedownResponsePacket({
      ticketId: "DMCA-99",
      episodeKey: "ep-01",
      masterAuditHash: "fnv1a-12345678",
      receiptVerified: true,
      sealActive: true,
    });
    expect(packet.cleanEvidenceReady).toBe(true);

    const rollup = buildEnterpriseQuarterlyRollup({
      quarterLabel: "2026-Q4",
      labelId: "LBL-KR-01",
      escrowDecisions: [d1, d2],
      slaAlerts,
    });
    expect(rollup.heldEscrowKrw).toBe(2_000_000);
    expect(rollup.releasedEscrowKrw).toBe(2_000_000);
    expect(rollup.breachedSlaCount).toBe(1);
    expect(rollup.complianceRiskScore).toBe(50);
    expect(rollup.auditorSnapshotHash).toMatch(/^fnv1a-/);
  });
});
