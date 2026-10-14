import { describe, expect, it } from "vitest";

import { betaOpenEventGateEligible, betaOpenEventGateVariant } from "./beta-open-event-gate-policy";

describe("betaOpenEventGateEligible", () => {
  it("keeps the public product orientation screen unobstructed", () => {
    expect(betaOpenEventGateEligible("/")).toBe(false);
  });

  it("does not cover the event directory or event detail itself", () => {
    expect(betaOpenEventGateEligible("/events")).toBe(false);
    expect(betaOpenEventGateEligible("/events/beta-open")).toBe(false);
  });

  it("does not cover the promotional video players", () => {
    expect(betaOpenEventGateEligible("/product-tour")).toBe(false);
    expect(betaOpenEventGateEligible("/brand-film/")).toBe(false);
  });

  it("can still surface the campaign from a public discovery page", () => {
    expect(betaOpenEventGateEligible("/discover")).toBe(true);
  });

  it("never interrupts private creation workflows", () => {
    expect(betaOpenEventGateEligible("/home")).toBe(false);
    expect(betaOpenEventGateEligible("/studio/space")).toBe(false);
  });
});

describe("betaOpenEventGateVariant", () => {
  it("shrinks to a compact banner on rail and grid discovery surfaces", () => {
    expect(betaOpenEventGateVariant("/discover")).toBe("compact");
    expect(betaOpenEventGateVariant("/explore")).toBe("compact");
    expect(betaOpenEventGateVariant("/ranking")).toBe("compact");
    expect(betaOpenEventGateVariant("/calendar")).toBe("compact");
    expect(betaOpenEventGateVariant("/market/browse")).toBe("compact");
    expect(betaOpenEventGateVariant("/showcase")).toBe("compact");
  });

  it("shrinks on discovery detail surfaces that continue the rail flow", () => {
    expect(betaOpenEventGateVariant("/title/some-work")).toBe("compact");
    expect(betaOpenEventGateVariant("/author/some-creator")).toBe("compact");
  });

  it("keeps the full card on content surfaces", () => {
    expect(betaOpenEventGateVariant("/learn")).toBe("full");
    expect(betaOpenEventGateVariant("/features")).toBe("full");
  });

  it("has no variant where the gate never mounts", () => {
    expect(betaOpenEventGateVariant("/")).toBeNull();
    expect(betaOpenEventGateVariant("/events/beta-open")).toBeNull();
    expect(betaOpenEventGateVariant("/product-tour")).toBeNull();
    expect(betaOpenEventGateVariant("/home")).toBeNull();
  });
});
