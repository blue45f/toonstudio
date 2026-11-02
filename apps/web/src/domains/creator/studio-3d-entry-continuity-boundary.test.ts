import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const host = readFileSync(
  new URL("./StudioCuttoonEditorHost.tsx", import.meta.url),
  "utf8",
);
const admission = readFileSync(
  new URL("./studio-interactive-3d-surface.ts", import.meta.url),
  "utf8",
);

const routedBg3dEntry = readFileSync(
  new URL("./studio-cuttoon-editor/runtime/useStudioBg3dRoutedEntry.ts", import.meta.url),
  "utf8",
);

describe("Studio 3D entry continuity boundary", () => {
  it("keeps seeded asset insertion on the routed open-edge path", () => {
    const start = host.indexOf("function openStudioObjectInsert(");
    const end = host.indexOf("function clearStudioObjectInsertSeeds()", start);
    const source = host.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(source).toContain("resolveStudioObjectInsertOpenSeed(request)");
    expect(source).toContain("setPoserVrmOpen(true)");
    expect(source).toContain("setBg3dOpen(true)");
    expect(source).not.toContain('navigateStudio2dSurface("bg3d")');
  });

  it("allows routed 3D requests to replace another visible Studio surface", () => {
    const start = host.indexOf(
      "const upgradeRoutedSurface = useEffectEvent((surface: Studio2dWorkspaceSurface)",
    );
    const end = host.indexOf("const downgradeRoutedSurface", start);
    const source = host.slice(start, end);

    expect(source).toContain('surface === "bg3d"');
    expect(source).toContain('surface === "poser"');
    expect(source).toContain('surface === "character"');
    expect(source).toContain("requestsInteractiveThreeD");
    expect(source).toContain("navigateStudio2dSurface(surface)");
  });

  it("BG 진입을 한 번 배선하고 새 hook의 route·준비 판정 뒤에만 다른 3D 표면을 닫는다", () => {
    const start = host.indexOf("  useStudioBg3dRoutedEntry({");
    const end = host.indexOf('  useRoutedSurfacePanelSync("animation"', start);
    const source = host.slice(start, end);
    const peerStart = host.indexOf('} else if (studioRoute.surface === "poser")');
    const peerEnd = host.indexOf('} else if (studioRoute.surface === "animation")', peerStart);
    const peers = host.slice(peerStart, peerEnd);
    const earlyStart = host.indexOf("const previousRoutedSurfaceRef");
    const earlyEnd = host.indexOf("const hybridDccReturnFocusRef", earlyStart);

    expect(start).toBeGreaterThan(host.indexOf("const [autosaveChecked,"));
    expect(start).toBeGreaterThan(host.indexOf("const routedSurfacePanelSyncRef"));
    expect(end).toBeGreaterThan(start);
    expect(host.match(/useStudioBg3dRoutedEntry\(\{/gu)).toHaveLength(1);
    expect(host.slice(earlyStart, earlyEnd)).not.toContain("setBg3dOpen(true)");
    expect(source).toContain("routedSurface: studioRoute.surface");
    expect(source).toContain("workHydrated, sourceHydrationPending");
    expect(source).toContain("autosaveChecked, hasAutosave");
    expect(source).toContain("wasOpen: () => routedSurfacePanelSyncRef.current.bg3d");
    expect(source).toContain("setPoserVrmOpen(false)");
    expect(source).toContain("setCharacterShaperOpen(false)");
    expect(source).toContain("setMannequinPoserOpen(false)");
    expect(source).toContain("setBg3dOpen(true)");
    expect(routedBg3dEntry).toContain('routedSurface !== "bg3d"');
    expect(routedBg3dEntry).toContain("if (!warmEntry && !sourceReady) return;");
    expect(routedBg3dEntry).toContain("if (!warmEntry) resetColdSourceEvent();");
    expect(routedBg3dEntry).toContain("openEntryEvent();");
    expect(peers).toContain("setBg3dOpen(false)");
    expect(peers).toContain("setPoserVrmOpen(true)");
    expect(peers).toContain("setCharacterShaperOpen(true)");
  });

  it("uses the current route to admit exactly one heavyweight renderer", () => {
    expect(host).toContain("routedSurface: studioRoute.surface");
    expect(admission).toContain('routedSurface === "bg3d"');
    expect(admission).toContain('routedSurface === "character"');
    expect(admission).toContain('routedSurface === "poser"');
    expect(admission).toContain("CLOSED_INTERACTIVE_3D_SURFACES");
  });

  it("returns route-less mannequin entry to canvas before it takes renderer ownership", () => {
    expect(host).toContain("const normalizeMannequinRoute = useEffectEvent");
    expect(host).toContain('navigateStudio2dSurface("canvas")');
    expect(admission).toContain(
      "return { ...CLOSED_INTERACTIVE_3D_SURFACES, mannequinPoserOpen: true }",
    );
  });
});
