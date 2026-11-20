// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildReaderTrustSeal } from "@/shared/lib/reader-trust-seal";

import { ReaderTrustSealBadge } from "./ReaderTrustSealBadge";

describe("ReaderTrustSealBadge", () => {
  it("renders verified 10-stage label in both compact pill and expandable card modes", () => {
    const seal = buildReaderTrustSeal({
      seriesTitle: "황녀의 검",
      verifiedStagesCount: 10,
      totalStagesCount: 10,
      commercialAssetsCleared: true,
      aiTrainingOptOut: true,
      voiceConsentVerified: true,
      globalLocalesCount: 3,
      masterAuditHash: "fnv1a-12345678",
    });

    const { rerender } = render(<ReaderTrustSealBadge seal={seal} compact />);
    expect(screen.getByTestId("reader-trust-seal-pill").textContent).toContain(
      "클린 IP 10단계 완전 인증작",
    );

    rerender(<ReaderTrustSealBadge seal={seal} />);
    const card = screen.getByTestId("reader-trust-seal-card");
    expect(card.textContent).toContain("정식 성우 음성권 계약 인증");
    expect(card.textContent).toContain("글로벌 3개국 현지화 검증");
  });
});
