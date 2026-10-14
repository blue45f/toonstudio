import { describe, expect, it } from "vitest";

import {
  applyStudioLaunchDensity,
  readStudioLaunchDensity,
  readStudioLaunchPrimaryTool,
  STUDIO_LAUNCH_DENSITY_BY_UI_MODE,
} from "./studio-launch-mode";

describe("studio launch density mapping (BLUEPRINT §4.1: existing uiMode mapping, pinned)", () => {
  it("declares the full uiMode alias table in one place", () => {
    expect(STUDIO_LAUNCH_DENSITY_BY_UI_MODE).toEqual({
      focus: "focus",
      simple: "focus",
      basic: "simple",
      standard: "simple",
      full: "full",
      studio: "full",
    });
  });

  it("maps each declared alias and rejects anything else", () => {
    expect(readStudioLaunchDensity("?uiMode=focus")).toBe("focus");
    // Legacy alias: uiMode=simple has always launched the focused canvas.
    expect(readStudioLaunchDensity("?uiMode=simple")).toBe("focus");
    expect(readStudioLaunchDensity("?uiMode=basic")).toBe("simple");
    expect(readStudioLaunchDensity("?uiMode=standard")).toBe("simple");
    expect(readStudioLaunchDensity("?uiMode=full")).toBe("full");
    expect(readStudioLaunchDensity("?uiMode=studio")).toBe("full");
    expect(readStudioLaunchDensity("?uiMode=expert")).toBeNull();
    expect(readStudioLaunchDensity("")).toBeNull();
    expect(readStudioLaunchDensity("?other=full")).toBeNull();
  });

  it("treats a repeated uiMode as no hint at all", () => {
    expect(readStudioLaunchDensity("?uiMode=full&uiMode=focus")).toBeNull();
  });

  it("applies an explicit launch density once and leaves other settings untouched", () => {
    const settings = { general: { densityMode: "simple" as const }, other: 1 };
    const applied = applyStudioLaunchDensity(settings, "full");
    expect(applied.general.densityMode).toBe("full");
    expect(applied.other).toBe(1);
    expect(applyStudioLaunchDensity(settings, null)).toBe(settings);
    expect(applyStudioLaunchDensity(settings, "simple")).toBe(settings);
  });

  it("keeps the startTool hint behavior unchanged", () => {
    expect(readStudioLaunchPrimaryTool("?startTool=draw")).toBe("draw");
    expect(readStudioLaunchPrimaryTool("?startTool=select")).toBe("select");
    expect(readStudioLaunchPrimaryTool("?startTool=hand")).toBeNull();
    expect(readStudioLaunchPrimaryTool("?startTool=draw&startTool=select")).toBeNull();
  });
});
