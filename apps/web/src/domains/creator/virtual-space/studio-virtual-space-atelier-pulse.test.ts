import { describe, expect, it } from "vitest";

import { computeStudioAtelierPulse } from "./studio-virtual-space-atelier-pulse";

describe("computeStudioAtelierPulse", () => {
  it("returns serene tempo with baseline atelier score when exploring alone", () => {
    const pulse = computeStudioAtelierPulse({
      roomId: "commons",
      privateZone: false,
      selfActivity: "available",
      selfSeated: false,
      focusActive: false,
      peers: [],
    });

    expect(pulse.tempo).toBe("serene");
    expect(pulse.tone).toBe("violet");
    expect(pulse.synergyScore).toBeGreaterThanOrEqual(120);
    expect(pulse.synergyScore).toBeLessThanOrEqual(200);
    expect(pulse.quickActionId).toBe("start-focus");
    expect(pulse.badgeKo).toContain("아틀리에");
  });

  it("switches to focused-flow when focus session is active or seated in a creative zone", () => {
    const pulse = computeStudioAtelierPulse({
      roomId: "drawing",
      privateZone: false,
      selfActivity: "focused",
      selfUserStatus: "focusing",
      selfSeated: true,
      focusActive: true,
      focusPhase: "running",
      peers: [],
    });

    expect(pulse.tempo).toBe("focused-flow");
    expect(pulse.tone).toBe("emerald");
    expect(pulse.synergyScore).toBeGreaterThanOrEqual(170);
    expect(pulse.quickActionId).toBe("stop-focus");
    expect(pulse.badgeKo).toContain("집중 몰입");
  });

  it("escalates to creative-surge when focusing alongside focused teammates in a creative zone", () => {
    const pulse = computeStudioAtelierPulse({
      roomId: "writers",
      privateZone: false,
      selfActivity: "focused",
      selfSeated: true,
      focusActive: true,
      focusPhase: "running",
      peers: [
        { zoneId: "writers", activity: "focused", userStatus: "focusing", nearby: true },
        { zoneId: "writers", activity: "focused", userStatus: "focusing", nearby: false },
      ],
    });

    expect(pulse.tempo).toBe("creative-surge");
    expect(pulse.tone).toBe("rose");
    expect(pulse.synergyScore).toBe(200);
    expect(pulse.hyperScore).toBe(2000);
    expect(pulse.comboMultiplier).toBe(10);
    expect(pulse.hyperBadgeKo).toBe("하이퍼 포지 2,000pt");
    expect(pulse.dimensions.deepWorkFlow).toBe(400);
    expect(pulse.dimensions.officePresence).toBeGreaterThanOrEqual(300);
    expect(pulse.zoneResonance.sameZonePeerCount).toBe(2);
    expect(pulse.zoneResonance.focusedPeerCount).toBe(2);
    expect(pulse.badgeKo).toBe("창작 파동 200");
  });

  it("switches to ensemble-sync during review, meeting, or spotlight with nearby peers", () => {
    const pulse = computeStudioAtelierPulse({
      roomId: "review",
      privateZone: true,
      selfActivity: "reviewing",
      selfUserStatus: "in-meeting",
      selfSeated: true,
      focusActive: false,
      spotlightActive: true,
      peers: [
        { zoneId: "review", activity: "reviewing", userStatus: "in-meeting", nearby: true },
      ],
    });

    expect(pulse.tempo).toBe("ensemble-sync");
    expect(pulse.tone).toBe("amber");
    expect(pulse.quickActionId).toBe("open-review");
    expect(pulse.zoneResonance.reviewingPeerCount).toBe(1);
    expect(pulse.synergyScore).toBeGreaterThanOrEqual(180);
    expect(pulse.hyperScore).toBeGreaterThanOrEqual(1800);
    expect(pulse.dimensions.reviewCollaboration).toBeGreaterThanOrEqual(360);
  });

  it("rewards wellness vitality during break phase or lounge relaxation", () => {
    const pulse = computeStudioAtelierPulse({
      roomId: "lounge",
      privateZone: false,
      selfActivity: "available",
      selfSeated: true,
      focusActive: true,
      focusPhase: "break",
      peers: [{ zoneId: "lounge", activity: "available", nearby: true }],
    });

    expect(pulse.dimensions.wellnessVitality).toBe(400);
    expect(pulse.hyperScore).toBeGreaterThanOrEqual(1700);
  });
});

