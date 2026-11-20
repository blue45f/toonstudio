import { describe, expect, it } from "vitest";

import { evaluateWave100GrandMastery } from "./studio-wave100-master-governance";

describe("studio-wave100-master-governance (Waves 90–100)", () => {
  it("passes Wave 100 Grand Mastery when all regulatory, DR, ZK, archival, and creator health gates pass", () => {
    const proof = evaluateWave100GrandMastery({
      seriesTitle: "황녀의 검",
      completedWavesCount: 100,
      euAiActDisclosureReady: true,
      incidentKillSwitchArmed: true,
      federationInteropVersion: 1,
      zkProofMetadataReady: true,
      coldStorageRetentionYears: 10,
      replicatedRegionsCount: 3,
      isoAuditTrailExportable: true,
      creatorWeeklyHours: 40,
      masterReceiptHash: "fnv1a-bc0b4c27",
    });

    expect(proof.grandMasteryPassed).toBe(true);
    expect(proof.waveMilestone).toBe(100);
    expect(proof.creatorHealthGrade).toBe("sustainable");
    expect(proof.wave100GrandDigestHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });

  it("blocks Grand Mastery when creator burnout or single-region DR risk is detected", () => {
    const blocked = evaluateWave100GrandMastery({
      seriesTitle: "황녀의 검",
      completedWavesCount: 100,
      euAiActDisclosureReady: true,
      incidentKillSwitchArmed: true,
      federationInteropVersion: 1,
      zkProofMetadataReady: true,
      coldStorageRetentionYears: 5,
      replicatedRegionsCount: 1,
      isoAuditTrailExportable: true,
      creatorWeeklyHours: 68,
      masterReceiptHash: "fnv1a-bc0b4c27",
    });

    expect(blocked.grandMasteryPassed).toBe(false);
    expect(blocked.creatorHealthGrade).toBe("burnout-risk");
    expect(blocked.blockers.length).toBe(3);
  });
});
