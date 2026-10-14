import { describe, expect, it } from "vitest";

import {
  STUDIO_AUTOMATION_CHANNELS,
  STUDIO_AUTOMATION_EXTERNAL_ALLOWLIST,
  evaluateStudioAutomationChannelReadiness,
  isStudioAutomationExternalCommandAllowed,
  studioAutomationChannelVerdict,
  type StudioAutomationReadinessSignals,
} from "./studio-automation-channel";
import type { StudioMacroCommand } from "./studio-macro-recorder";

describe("automation channel decision table", () => {
  it("fixes the verdicts: MCP and remote agent API deferred, CLI not applicable", () => {
    expect(studioAutomationChannelVerdict("mcp-server")).toBe("deferred");
    expect(studioAutomationChannelVerdict("remote-agent-api")).toBe("deferred");
    expect(studioAutomationChannelVerdict("cli")).toBe("not-applicable");
    expect(studioAutomationChannelVerdict("in-app-macro")).toBe("adopted");
    expect(studioAutomationChannelVerdict("auto-action-json-file")).toBe("adopted");
    expect(studioAutomationChannelVerdict("hardware-bridge-loopback")).toBe("conditional");
    expect(studioAutomationChannelVerdict("json-import-gesture")).toBe("conditional");
  });

  it("has unique ids and a stated basis for every channel", () => {
    const ids = STUDIO_AUTOMATION_CHANNELS.map((channel) => channel.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const channel of STUDIO_AUTOMATION_CHANNELS) {
      expect(channel.basis.length).toBeGreaterThan(0);
      expect(channel.labelKo.length).toBeGreaterThan(0);
    }
  });
});

describe("external execution allowlist", () => {
  it("is exactly the macro recorder allowlist in auto-action types", () => {
    expect(STUDIO_AUTOMATION_EXTERNAL_ALLOWLIST.map((entry) => entry.autoActionType)).toEqual([
      "element.set-opacity",
      "element.set-hidden",
      "element.set-locked",
      "element.set-blend-mode",
      "lettering.set-size",
      "lettering.set-color",
      "lettering.set-font",
      "page.set-background",
      "page.apply-grade-preset",
    ]);
    // Every macro command type is represented exactly once: if the recorder
    // grows a type, this exhaustiveness check fails until the decision is
    // revisited for the new type.
    const macroTypes: readonly StudioMacroCommand["type"][] = [
      "set-opacity",
      "set-hidden",
      "set-locked",
      "set-blend-mode",
      "lettering-font-size",
      "lettering-color",
      "lettering-font",
      "page-set-background",
      "page-apply-grade-preset",
    ];
    expect(
      [...STUDIO_AUTOMATION_EXTERNAL_ALLOWLIST.map((entry) => entry.macroType)].sort(),
    ).toEqual([...macroTypes].sort());
  });

  it("allows only allowlisted types and fails closed on everything else", () => {
    expect(isStudioAutomationExternalCommandAllowed("element.set-opacity")).toBe(true);
    expect(isStudioAutomationExternalCommandAllowed("page.apply-grade-preset")).toBe(true);
    // Catalog/navigation/publish commands are not externally executable.
    expect(isStudioAutomationExternalCommandAllowed("view.zoom-in")).toBe(false);
    expect(isStudioAutomationExternalCommandAllowed("file.export")).toBe(false);
    expect(isStudioAutomationExternalCommandAllowed("")).toBe(false);
    expect(isStudioAutomationExternalCommandAllowed(undefined)).toBe(false);
    expect(isStudioAutomationExternalCommandAllowed(null)).toBe(false);
  });
});

describe("readiness gate", () => {
  const allMet: StudioAutomationReadinessSignals = {
    macroUiWired: true,
    catalogTypedPayloadCoverage: 0.9,
    externalPrincipalAuthReady: true,
    auditReceiptReady: true,
    demandSignalCount: 5,
  };

  it("stays deferred today: no signal met lists every prerequisite", () => {
    const result = evaluateStudioAutomationChannelReadiness({
      macroUiWired: false,
      catalogTypedPayloadCoverage: 0,
      externalPrincipalAuthReady: false,
      auditReceiptReady: false,
      demandSignalCount: 0,
    });
    expect(result.verdict).toBe("deferred");
    expect(result.unmet).toEqual([
      "macro-ui-wired",
      "catalog-typed-payloads",
      "external-principal-auth",
      "audit-receipt",
      "demand-signal",
    ]);
  });

  it("all signals met only reopens review — it never auto-adopts", () => {
    const result = evaluateStudioAutomationChannelReadiness(allMet);
    expect(result.verdict).toBe("ready-for-review");
    expect(result.unmet).toEqual([]);
  });

  it("coverage threshold is a hard boundary and NaN fails closed", () => {
    expect(
      evaluateStudioAutomationChannelReadiness({
        ...allMet,
        catalogTypedPayloadCoverage: 0.8,
      }).verdict,
    ).toBe("ready-for-review");
    expect(
      evaluateStudioAutomationChannelReadiness({
        ...allMet,
        catalogTypedPayloadCoverage: 0.79,
      }).unmet,
    ).toEqual(["catalog-typed-payloads"]);
    expect(
      evaluateStudioAutomationChannelReadiness({
        ...allMet,
        catalogTypedPayloadCoverage: Number.NaN,
      }).unmet,
    ).toEqual(["catalog-typed-payloads"]);
  });

  it("a single missing prerequisite keeps the verdict deferred", () => {
    expect(
      evaluateStudioAutomationChannelReadiness({ ...allMet, auditReceiptReady: false }),
    ).toEqual({ verdict: "deferred", unmet: ["audit-receipt"] });
    expect(
      evaluateStudioAutomationChannelReadiness({ ...allMet, demandSignalCount: 2 }).unmet,
    ).toEqual(["demand-signal"]);
  });
});
