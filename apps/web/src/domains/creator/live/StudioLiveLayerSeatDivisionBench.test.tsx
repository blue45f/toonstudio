// @vitest-environment jsdom
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudioLiveLayerSeatDivisionBench } from "./StudioLiveLayerSeatDivisionBench";

describe("StudioLiveLayerSeatDivisionBench", () => {
  it("renders 5 webtoon layer seats and allows claiming, petitioning, handoff, and moderator takeover", () => {
    render(<StudioLiveLayerSeatDivisionBench />);

    const bench = screen.getByTestId("studio-live-layer-seat-division-bench");
    expect(bench).toBeTruthy();

    // Default selected layer is lineart and actor is user-ink (assigned)
    fireEvent.click(screen.getByTestId("layer-seat-claim-btn"));
    const bannerAfterClaim = screen.getByTestId("layer-seat-transition-banner");
    expect(bannerAfterClaim.getAttribute("data-banner-code")).toBe("claim-ok");

    // Switch actor to user-color (not assigned to lineart) and try claiming -> should fail closed with not-assigned
    fireEvent.change(screen.getByTestId("layer-seat-actor-select"), {
      target: { value: "user-color" },
    });
    fireEvent.click(screen.getByTestId("layer-seat-claim-btn"));
    expect(
      screen.getByTestId("layer-seat-transition-banner").getAttribute("data-banner-code")
    ).toBe("not-assigned");

    // Petition seat as user-color -> should succeed
    fireEvent.click(screen.getByTestId("layer-seat-request-btn"));
    expect(
      screen.getByTestId("layer-seat-transition-banner").getAttribute("data-banner-code")
    ).toBe("request-ok");

    // Switch back to user-ink and handoff seat to user-color
    fireEvent.change(screen.getByTestId("layer-seat-actor-select"), {
      target: { value: "user-ink" },
    });
    fireEvent.change(screen.getByTestId("layer-seat-handoff-target-select"), {
      target: { value: "user-color" },
    });
    fireEvent.click(screen.getByTestId("layer-seat-handoff-btn"));
    expect(
      screen.getByTestId("layer-seat-transition-banner").getAttribute("data-banner-code")
    ).toBe("handoff-ok");

    // Forced takeover without moderator capability fails closed
    fireEvent.click(screen.getByTestId("layer-seat-takeover-btn"));
    expect(
      screen.getByTestId("layer-seat-transition-banner").getAttribute("data-banner-code")
    ).toBe("missing-capability");

    // Forced takeover as moderator (user-pd) succeeds
    fireEvent.change(screen.getByTestId("layer-seat-actor-select"), {
      target: { value: "user-pd" },
    });
    fireEvent.click(screen.getByTestId("layer-seat-takeover-btn"));
    expect(
      screen.getByTestId("layer-seat-transition-banner").getAttribute("data-banner-code")
    ).toBe("takeover-ok");
  });
});
