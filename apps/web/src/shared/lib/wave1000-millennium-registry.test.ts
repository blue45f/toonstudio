import { describe, expect, it } from "vitest";

import {
  buildWave1000MillenniumProof,
  MILLENNIUM_CENTURY_SPECS,
  verifyMillenniumDagAcyclic,
} from "./wave1000-millennium-registry";

describe("wave1000-millennium-registry (Waves 1–1000)", () => {
  it("verifies acyclic 10-century DAG covering all 1,000 waves deterministically", () => {
    expect(MILLENNIUM_CENTURY_SPECS.length).toBe(10);
    expect(verifyMillenniumDagAcyclic()).toBe(true);

    const proof = buildWave1000MillenniumProof({ masterReceiptHash: "fnv1a-bc0b4c27" });
    expect(proof.totalCenturies).toBe(10);
    expect(proof.totalWavesVerified).toBe(1000);
    expect(proof.dagAcyclic).toBe(true);
    expect(proof.centuries[0].waveStart).toBe(1);
    expect(proof.centuries[9].waveEnd).toBe(1000);
    expect(proof.wave1000MillenniumRootHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });

  it("detects cyclic dependency corruption in century DAG", () => {
    const cyclic = [
      { ...MILLENNIUM_CENTURY_SPECS[0], dependsOnCenturies: [2] },
      { ...MILLENNIUM_CENTURY_SPECS[1], dependsOnCenturies: [1] },
    ];
    expect(verifyMillenniumDagAcyclic(cyclic)).toBe(false);
  });
});
