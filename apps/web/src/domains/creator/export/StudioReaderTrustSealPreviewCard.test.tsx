// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { StudioReaderTrustSealPreviewCard } from "./StudioReaderTrustSealPreviewCard";

describe("StudioReaderTrustSealPreviewCard", () => {
  it("renders a verified 10-stage ReaderTrustSealBadge and toggles compact mode", () => {
    render(
      <StudioReaderTrustSealPreviewCard
        seriesTitle="별빛 연대기"
        pack={BUILTIN_STUDIO_WORKFLOW_PACKS[0]}
      />,
    );

    expect(screen.getByTestId("studio-reader-trust-seal-preview-card")).toBeTruthy();
    expect(screen.getByTestId("reader-trust-seal-digest-status").textContent).toContain(
      "서명 해시 검증됨",
    );
    expect(screen.getByTestId("reader-trust-seal-card").textContent).toContain(
      "클린 IP 10단계 완전 인증작",
    );

    const toggle = screen.getByLabelText("카드용 컴팩트 배지 보기");
    fireEvent.click(toggle);
    expect(screen.getByTestId("reader-trust-seal-pill").textContent).toContain(
      "클린 IP 10단계 완전 인증작",
    );
  });
});
