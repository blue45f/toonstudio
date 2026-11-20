// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCreatorGovernanceAlertsBanner } from "./StudioCreatorGovernanceAlertsBanner";

describe("StudioCreatorGovernanceAlertsBanner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders live revocation-hold alerts with remediation guidance fetched from the API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        {
          alertId: "ALT-1234",
          slug: "empress-sword",
          kind: "revocation-hold",
          reasonCode: "font-license-expired",
          title: "[정산 보류 안내] 황녀의 검 — 타이틀 폰트 만료",
          remediationGuide: "Pretendard(OFL)로 교체 후 재발급해 주세요.",
          createdAtIso: "2026-11-20T06:00:00.000Z",
        },
      ],
    } as Response);

    render(<StudioCreatorGovernanceAlertsBanner titleSlug="empress-sword" />);

    await waitFor(() => {
      expect(screen.getByTestId("creator-alerts-count-badge").textContent).toContain("보류 알림 1건");
    });
    expect(screen.getByTestId("creator-alerts-list").textContent).toContain("Pretendard(OFL)");
  });
});
