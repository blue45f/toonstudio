import { describe, expect, it } from "vitest";

import { verifyReaderTrustSealDigest } from "@/shared/lib/reader-trust-seal";

import { buildFallbackTitleTrustSeal } from "./use-title-trust-seal";

describe("use-title-trust-seal", () => {
  it("builds a deterministic tamper-evident ReaderTrustSealPayload and active liveStatus for any title", () => {
    const result = buildFallbackTitleTrustSeal("empress-sword", "황녀의 검");
    expect(result.seal.seriesTitle).toBe("황녀의 검");
    expect(result.seal.level).toBe("verified-10-stage");
    expect(verifyReaderTrustSealDigest(result.seal)).toBe(true);
    expect(result.liveStatus.effectiveStatus).toBe("active");
    expect(result.liveStatus.effectiveLevel).toBe("verified-10-stage");
  });
});
