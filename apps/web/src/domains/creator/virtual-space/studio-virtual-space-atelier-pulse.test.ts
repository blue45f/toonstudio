import { describe, expect, it } from "vitest";

import { computeStudioAtelierPulse } from "./studio-virtual-space-atelier-pulse";

describe("computeStudioAtelierPulse", () => {
  it("returns serene tempo with baseline atelier status when exploring alone", () => {
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
    expect(pulse.workStatusBadgeKo).toBe("작업 대기");
    expect("omniScore" in pulse).toBe(false);
    expect("quantumScore" in pulse).toBe(false);
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
    expect(pulse.workStatusBadgeKo).toBe("집중 작업 중");
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
    expect(pulse.workStatusBadgeKo).toBe("공동 작업 3명");
    expect(pulse.dimensions.deepWorkFlow).toBe(100);
    expect(pulse.dimensions.officePresence).toBeGreaterThanOrEqual(85);
    expect(pulse.recommendedZoneId).toBe("review");
    expect(pulse.recommendedRoutineKo).toContain("합평");
    expect(pulse.zoneResonance.sameZonePeerCount).toBe(2);
    expect(pulse.zoneResonance.focusedPeerCount).toBe(2);
    expect(pulse.badgeKo).toBe("공동 집중 200");
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
    expect(pulse.dimensions.reviewCollaboration).toBeGreaterThanOrEqual(85);
    expect(pulse.workStatusBadgeKo).toBe("근처 협업 1명");
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

    expect(pulse.dimensions.wellnessVitality).toBe(100);
    expect(pulse.recommendedZoneId).toBe("lounge");
  });
});
