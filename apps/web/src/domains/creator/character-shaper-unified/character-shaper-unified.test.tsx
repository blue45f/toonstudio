// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CharacterShaperLandingPage } from "../CharacterShaperLandingPage";
import {
  applyBodyBasePreset,
  applyHandPose15DofPreset,
  buildCharacterShaperHandoffPayload,
  CHARACTER_BODY_BASE_PRESETS,
  CHARACTER_PROPORTION_AXIS_SPECS,
  CHARACTER_SHAPER_HANDOFF_SCHEMA,
  clampProportionAxes,
  computeMetricHeightMeters,
  countHandPoseDof,
  createCharacterShaperUnifiedState,
  filterPageConsolidationGroups,
  HAND_POSE_15DOF_PRESETS,
  PAGE_CONSOLIDATION_AUDIT_MAP,
  summarizePageConsolidationAudit,
  updateHairScalpFit,
  updateOutfitLayers,
  updateProportionAxis,
  updatePropSocket,
  validateCharacterExportCompliance,
  type CharacterShaperUnifiedState,
} from "./character-shaper-unified-engine";
import { StudioCharacterShaperUnifiedPanel } from "./StudioCharacterShaperUnifiedPanel";

afterEach(() => {
  cleanup();
});

function readLocalSource(filename: string): string {
  return readFileSync(
    path.resolve(process.cwd(), "apps/web/src/domains/creator/character-shaper-unified", filename),
    "utf8",
  );
}

describe("character-shaper-unified-engine", () => {
  it("provides all 6 Korean webtoon body base presets with valid initial states", () => {
    const ids = CHARACTER_BODY_BASE_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual([
      "rofan-noble",
      "modern-hunter",
      "seoul-academy",
      "murim-martial",
      "chibi-sd",
      "athletic-hero",
    ]);

    for (const id of ids) {
      const state = createCharacterShaperUnifiedState(id);
      expect(state.bodyBaseId).toBe(id);
      expect(state.unitScaleMeters).toBe(1.0);
      expect(state.floorGroundingY).toBe(0);
      expect(state.metricHeightMeters).toBeGreaterThanOrEqual(1.05);
      expect(state.metricHeightMeters).toBeLessThanOrEqual(2.05);
    }
  });

  it("synchronizes proportions, hair, outfit, hand pose, and prop when switching base preset", () => {
    const initial = createCharacterShaperUnifiedState("rofan-noble");
    const customNamed: CharacterShaperUnifiedState = { ...initial, characterId: "hero-custom-01" };
    const switched = applyBodyBasePreset(customNamed, "modern-hunter");

    expect(switched.bodyBaseId).toBe("modern-hunter");
    expect(switched.characterId).toBe("hero-custom-01");
    expect(switched.proportions.headRatio).toBe(8.0);
    expect(switched.hair.presetId).toBe("wolf-cut");
    expect(switched.outfit.midLayer).toBe("hunter-vest");
    expect(switched.handPose15Dof.presetId).toBe("weapon-grip");
    expect(switched.propSocket.propId).toBe("longsword");
  });

  it("defines exactly 8 proportion axes with headRatio bounded between 5.5 and 8.5", () => {
    expect(CHARACTER_PROPORTION_AXIS_SPECS).toHaveLength(8);
    const headRatio = CHARACTER_PROPORTION_AXIS_SPECS.find((spec) => spec.id === "headRatio");
    expect(headRatio).toBeDefined();
    expect(headRatio?.min).toBe(5.5);
    expect(headRatio?.max).toBe(8.5);
  });

  it("clamps out-of-range, NaN, and Infinity values safely across all 8 axes", () => {
    const clamped = clampProportionAxes({
      headRatio: 12.4,
      shoulderWidth: -5,
      waistTaper: Number.NaN,
      legRatio: Number.POSITIVE_INFINITY,
      headScale: Number.NEGATIVE_INFINITY,
      eyeScale: 3.2,
      jawSharpness: -2.9,
      muscleVolume: 0.4444,
    });

    expect(clamped.headRatio).toBe(8.5);
    expect(clamped.shoulderWidth).toBe(-1);
    expect(clamped.waistTaper).toBe(0);
    expect(clamped.legRatio).toBe(0);
    expect(clamped.headScale).toBe(0);
    expect(clamped.eyeScale).toBe(1);
    expect(clamped.jawSharpness).toBe(-1);
    expect(clamped.muscleVolume).toBe(0.44);
  });

  it("updates a single proportion axis and recalculates metric height immediately", () => {
    const initial = createCharacterShaperUnifiedState("seoul-academy");
    const taller = updateProportionAxis(initial, "headRatio", 8.4);

    expect(taller.proportions.headRatio).toBe(8.4);
    expect(taller.metricHeightMeters).toBeGreaterThan(initial.metricHeightMeters);
    expect(taller.proportions.eyeScale).toBe(initial.proportions.eyeScale);
  });

  it("computes realistic metric height ordering between chibi-sd and athletic-hero", () => {
    const chibi = createCharacterShaperUnifiedState("chibi-sd");
    const hero = createCharacterShaperUnifiedState("athletic-hero");

    expect(computeMetricHeightMeters(chibi.proportions)).toBeLessThan(1.3);
    expect(computeMetricHeightMeters(hero.proportions)).toBeGreaterThan(1.75);
  });

  it("updates hair scalp fit presets and clamps offset, volume, and physics damping", () => {
    const initial = createCharacterShaperUnifiedState("rofan-noble");
    const switched = updateHairScalpFit(initial, { presetId: "martial-topknot" });
    expect(switched.hair.presetId).toBe("martial-topknot");
    expect(switched.hair.scalpOffsetMm).toBe(1.8);

    const clamped = updateHairScalpFit(switched, {
      scalpOffsetMm: 99,
      volumeScale: 0.1,
      strandPhysicsDamping: Number.NaN,
    });
    expect(clamped.hair.scalpOffsetMm).toBe(8.0);
    expect(clamped.hair.volumeScale).toBe(0.7);
    expect(clamped.hair.strandPhysicsDamping).toBe(0.5);
  });

  it("updates 3-tier outfit layers and clamps cloth clearance", () => {
    const initial = createCharacterShaperUnifiedState("seoul-academy");
    const updated = updateOutfitLayers(initial, {
      baseLayer: "tactical-undersuit",
      midLayer: "murim-dobok",
      outerLayer: "armor-mantle",
      clothClearanceMm: 0.2,
    });

    expect(updated.outfit.baseLayer).toBe("tactical-undersuit");
    expect(updated.outfit.midLayer).toBe("murim-dobok");
    expect(updated.outfit.outerLayer).toBe("armor-mantle");
    expect(updated.outfit.clothClearanceMm).toBe(2.0);
  });

  it("verifies all 6 hand pose presets expose exactly 15 finite DOF across 5 fingers", () => {
    const base = createCharacterShaperUnifiedState("rofan-noble");
    expect(HAND_POSE_15DOF_PRESETS).toHaveLength(6);

    for (const preset of HAND_POSE_15DOF_PRESETS) {
      const posed = applyHandPose15DofPreset(base, preset.id, "right");
      const dof = countHandPoseDof(posed.handPose15Dof);
      expect(posed.handPose15Dof.activeHand).toBe("right");
      expect(dof.totalDof).toBe(15);
      expect(dof.finiteDof).toBe(15);
      expect(Number.isFinite(dof.averageCurlDeg)).toBe(true);
    }
  });

  it("updates prop socket attachment and clamps scale and grip tightness", () => {
    const initial = createCharacterShaperUnifiedState("murim-martial");
    const updated = updatePropSocket(initial, {
      socketId: "back-holster",
      propId: "mana-staff",
      scale: 4.5,
      gripTightness: -0.5,
    });

    expect(updated.propSocket.socketId).toBe("back-holster");
    expect(updated.propSocket.propId).toBe("mana-staff");
    expect(updated.propSocket.scale).toBe(1.8);
    expect(updated.propSocket.gripTightness).toBe(0);
  });

  it("passes VRM 1.0 and GLB 2.0 export compliance checks for clean states", () => {
    const state = createCharacterShaperUnifiedState("athletic-hero");
    for (const format of ["vrm-1.0", "glb-2.0"] as const) {
      const report = validateCharacterExportCompliance(state, format);
      expect(report.passed).toBe(true);
      expect(report.format).toBe(format);
      expect(report.nonManifoldEdges).toBe(0);
      expect(report.looseVertices).toBe(0);
      expect(report.nanCount).toBe(0);
      expect(report.unitScaleMeters).toBe(1.0);
      expect(report.floorGroundingY).toBe(0);
      expect(report.handDofCount).toBe(15);
      expect(report.checks.every((check) => check.passed)).toBe(true);
    }
  });

  it("flags compliance failures when topology, NaN, grounding, or clearance is violated", () => {
    const base = createCharacterShaperUnifiedState("rofan-noble");
    const broken: CharacterShaperUnifiedState = {
      ...base,
      floorGroundingY: 0.15,
      hair: { ...base.hair, scalpOffsetMm: 0.1 },
      proportions: { ...base.proportions, headRatio: Number.NaN },
      topologyAudit: { ...base.topologyAudit, nonManifoldEdges: 3, looseVertices: 2 },
    };

    const report = validateCharacterExportCompliance(broken, "vrm-1.0");
    expect(report.passed).toBe(false);
    expect(report.nonManifoldEdges).toBe(3);
    expect(report.nanCount).toBe(1);
    expect(report.checks.find((item) => item.id === "manifold")?.passed).toBe(false);
    expect(report.checks.find((item) => item.id === "finite-numeric")?.passed).toBe(false);
    expect(report.checks.find((item) => item.id === "metric-grounding")?.passed).toBe(false);
    expect(report.checks.find((item) => item.id === "clearance")?.passed).toBe(false);
  });

  it("builds deterministic toonstudio.character-shaper-handoff.v1 payloads for 2D canvas and 3D stage", () => {
    const state = createCharacterShaperUnifiedState("modern-hunter");
    const canvasPayload = buildCharacterShaperHandoffPayload(
      state,
      "studio-canvas-2d",
      "vrm-1.0",
      "2026-11-22T00:00:00.000Z",
    );
    const canvasPayloadRepeat = buildCharacterShaperHandoffPayload(
      state,
      "studio-canvas-2d",
      "vrm-1.0",
      "2026-11-22T01:00:00.000Z",
    );
    const stagePayload = buildCharacterShaperHandoffPayload(
      state,
      "studio-bg3d-stage",
      "glb-2.0",
      "2026-11-22T00:00:00.000Z",
    );

    expect(canvasPayload.schema).toBe(CHARACTER_SHAPER_HANDOFF_SCHEMA);
    expect(canvasPayload.source).toBe("toonstudio-internal-shaper");
    expect(canvasPayload.targetRoute).toBe("/studio");
    expect(canvasPayload.exportSpec.passed).toBe(true);
    expect(canvasPayload.checksum).toBe(canvasPayloadRepeat.checksum);

    expect(stagePayload.targetRoute).toBe("/studio/bg3d");
    expect(stagePayload.exportSpec.format).toBe("glb-2.0");
    expect(stagePayload.checksum).not.toBe(canvasPayload.checksum);
  });

  it("models all 4 ToonStudio page consolidation audit groups and canonical targets accurately", () => {
    expect(PAGE_CONSOLIDATION_AUDIT_MAP).toHaveLength(4);

    const byId = new Map(PAGE_CONSOLIDATION_AUDIT_MAP.map((group) => [group.id, group]));

    const discover = byId.get("discover-consolidation");
    expect(discover?.canonicalPath).toBe("/discover");
    expect(discover?.routes.map((route) => route.path)).toEqual(["/discover", "/explore", "/hub"]);

    const support = byId.get("support-consolidation");
    expect(support?.canonicalPath).toBe("/studio/support");
    expect(support?.routes.map((route) => route.path)).toEqual(["/studio/support", "/support", "/help"]);

    const materials = byId.get("materials-assets-separation");
    expect(materials?.routes.map((route) => route.path)).toEqual([
      "/research/materials",
      "/market",
      "/studio/assets",
    ]);

    const collab = byId.get("collaboration-convergence");
    expect(collab?.canonicalPath).toBe("/production");
    expect(collab?.routes.map((route) => route.path)).toEqual([
      "/production",
      "/studio/space",
      "/team",
      "/collaborate",
    ]);
  });

  it("summarizes total routes and dispositions across the 4 audit groups", () => {
    const summary = summarizePageConsolidationAudit(PAGE_CONSOLIDATION_AUDIT_MAP);
    expect(summary.groupCount).toBe(4);
    expect(summary.totalRoutesAudited).toBe(13);
    expect(summary.canonicalAnchorCount).toBe(3);
    expect(summary.redirectOrAbsorbCount).toBe(4);
    expect(summary.distinctRoleCount).toBe(6);
  });

  it("filters page consolidation groups by single-canonical vs role-split strategies", () => {
    const single = filterPageConsolidationGroups(PAGE_CONSOLIDATION_AUDIT_MAP, "single-canonical");
    const split = filterPageConsolidationGroups(PAGE_CONSOLIDATION_AUDIT_MAP, "role-split");
    const all = filterPageConsolidationGroups(PAGE_CONSOLIDATION_AUDIT_MAP, "all");

    expect(single.map((group) => group.id)).toEqual(["discover-consolidation", "support-consolidation"]);
    expect(split.map((group) => group.id)).toEqual([
      "materials-assets-separation",
      "collaboration-convergence",
    ]);
    expect(all).toHaveLength(4);
  });
});

describe("character-shaper-unified architecture and styling guards", () => {
  it("contains zero imports from character-lab or brush-lab apps/packages", () => {
    for (const file of [
      "character-shaper-unified-presets.ts",
      "page-consolidation-audit-model.ts",
      "character-shaper-unified-engine.ts",
      "CharacterShaperSilhouettePreview.tsx",
      "CharacterShaperAuditTab.tsx",
      "StudioCharacterShaperUnifiedPanel.tsx",
    ]) {
      const source = readLocalSource(file);
      expect(source).not.toMatch(/from\s+["'][^"']*(?:character-lab|brush-lab)/u);
      expect(source).not.toMatch(/import\(\s*["'][^"']*(?:character-lab|brush-lab)/u);
      expect(source).not.toContain(": any");
    }
  });

  it("uses OKLCH tokens without raw HEX, rgb, or transition-all and honors reduced motion", () => {
    const css = readLocalSource("character-shaper-unified.css");
    expect(css).toContain("oklch(");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgba?\(/u);
    expect(css).not.toContain("transition-all");
    expect(css).not.toMatch(/transition\s*:\s*all\b/u);
  });
});

describe("StudioCharacterShaperUnifiedPanel interactions", () => {
  it("renders initial rofan-noble preset, live silhouette stage, and passing VRM 1.0 compliance", () => {
    render(<StudioCharacterShaperUnifiedPanel />);

    expect(screen.getByTestId("studio-character-shaper-unified-panel")).toBeTruthy();
    expect(screen.getByTestId("csu-silhouette-stage")).toBeTruthy();
    expect(screen.getByTestId("csu-base-rofan-noble").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("csu-compliance-badge").textContent).toContain("VRM 1.0 규격 통과");
  });

  it("switches between the 6 webtoon body bases and updates height badge", () => {
    render(<StudioCharacterShaperUnifiedPanel />);

    fireEvent.click(screen.getByTestId("csu-base-chibi-sd"));
    expect(screen.getByTestId("csu-base-chibi-sd").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("csu-height-badge").textContent).toContain("SD 데포르메");
    expect(screen.getByTestId("csu-axis-value-headRatio").textContent).toBe("5.5등신");

    fireEvent.click(screen.getByTestId("csu-base-athletic-hero"));
    expect(screen.getByTestId("csu-base-athletic-hero").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("csu-axis-value-headRatio").textContent).toBe("8.2등신");
  });

  it("updates 8-axis sliders live and reflects head ratio and shoulder width changes", () => {
    render(<StudioCharacterShaperUnifiedPanel />);

    const headRatioSlider = screen.getByLabelText("등신 비율");
    fireEvent.change(headRatioSlider, { target: { value: "8.5" } });
    expect(screen.getByTestId("csu-axis-value-headRatio").textContent).toBe("8.5등신");

    const shoulderSlider = screen.getByLabelText("어깨 폭");
    fireEvent.change(shoulderSlider, { target: { value: "0.75" } });
    expect(screen.getByTestId("csu-axis-value-shoulderWidth").textContent).toBe("+75%");
  });

  it("updates hair scalp fit and 3-layer outfit controls", () => {
    render(<StudioCharacterShaperUnifiedPanel />);

    fireEvent.change(screen.getByLabelText("헤어 스타일"), { target: { value: "wolf-cut" } });
    fireEvent.change(screen.getByLabelText("두피 밀착 간격"), { target: { value: "3.2" } });
    fireEvent.change(screen.getByLabelText("이너 레이어"), { target: { value: "tactical-undersuit" } });
    fireEvent.change(screen.getByLabelText("미들 레이어"), { target: { value: "hunter-vest" } });
    fireEvent.change(screen.getByLabelText("아우터 레이어"), { target: { value: "long-trench" } });

    expect(screen.getAllByText(/3\.2mm/).length).toBeGreaterThan(0);
    expect((screen.getByLabelText("아우터 레이어") as HTMLSelectElement).value).toBe("long-trench");
  });

  it("switches 15-DOF hand pose preset and active hand side", () => {
    render(<StudioCharacterShaperUnifiedPanel />);

    fireEvent.click(screen.getByTestId("csu-hand-fist-clench"));
    expect(screen.getByTestId("csu-hand-fist-clench").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("csu-finger-summary").textContent).toContain("검지 88°");

    const rightHandBtn = screen.getByRole("button", { name: "오른손만" });
    fireEvent.click(rightHandBtn);
    expect(rightHandBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("updates prop socket, prop item, and prop scale and reflects in SVG stage", () => {
    render(<StudioCharacterShaperUnifiedPanel />);

    fireEvent.change(screen.getByLabelText("소품 부착 소켓"), { target: { value: "back-holster" } });
    fireEvent.change(screen.getByLabelText("장착 소품"), { target: { value: "mana-staff" } });
    fireEvent.change(screen.getByLabelText("소품 배율"), { target: { value: "1.35" } });

    expect(screen.getByTestId("csu-silhouette-stage").textContent).toContain("마법 지팡이");
    expect(screen.getByText("×1.35")).toBeTruthy();
  });

  it("dispatches one-click handoff payloads for 2D canvas and 3D background stage with GLB format", () => {
    render(<StudioCharacterShaperUnifiedPanel />);

    fireEvent.click(screen.getByTestId("csu-handoff-canvas-btn"));
    const status = screen.getByTestId("csu-handoff-status");
    expect(status.textContent).toContain("스튜디오 2D 캔버스 투입 페이로드");
    expect(status.textContent).toContain(CHARACTER_SHAPER_HANDOFF_SCHEMA);
    expect(status.textContent).toContain("/studio");

    fireEvent.click(screen.getByRole("button", { name: "GLB 2.0" }));
    fireEvent.click(screen.getByTestId("csu-handoff-bg3d-btn"));
    expect(screen.getByTestId("csu-handoff-status").textContent).toContain("3D 배경 스테이지 배치 페이로드");
    expect(screen.getByTestId("csu-handoff-status").textContent).toContain("/studio/bg3d");
    expect(screen.getByTestId("csu-handoff-status").textContent).toContain("glb-2.0");
  });

  it("restores current base defaults when clicking the reset button", () => {
    render(<StudioCharacterShaperUnifiedPanel />);

    fireEvent.change(screen.getByLabelText("등신 비율"), { target: { value: "6.0" } });
    expect(screen.getByTestId("csu-axis-value-headRatio").textContent).toBe("6.0등신");

    fireEvent.click(screen.getByRole("button", { name: "현재 베이스 기본값 복원" }));
    expect(screen.getByTestId("csu-axis-value-headRatio").textContent).toBe("7.8등신");
  });

  it("navigates to the page consolidation map tab via keyboard and filters the 4 groups", () => {
    render(<StudioCharacterShaperUnifiedPanel />);

    const shaperTab = screen.getByRole("tab", { name: "통합 3D 캐릭터 셰이퍼" });
    fireEvent.keyDown(shaperTab, { key: "ArrowRight" });

    const auditPanel = screen.getByTestId("csu-audit-tabpanel");
    expect(within(auditPanel).getByTestId("csu-audit-group-discover-consolidation")).toBeTruthy();
    expect(within(auditPanel).getByTestId("csu-audit-group-support-consolidation")).toBeTruthy();
    expect(within(auditPanel).getByTestId("csu-audit-group-materials-assets-separation")).toBeTruthy();
    expect(within(auditPanel).getByTestId("csu-audit-group-collaboration-convergence")).toBeTruthy();

    fireEvent.click(screen.getByTestId("csu-audit-filter-single-canonical"));
    expect(screen.queryByTestId("csu-audit-group-materials-assets-separation")).toBeNull();
    expect(screen.getByTestId("csu-audit-group-discover-consolidation")).toBeTruthy();
    expect(screen.getByTestId("csu-audit-group-support-consolidation")).toBeTruthy();

    fireEvent.click(screen.getByTestId("csu-audit-filter-role-split"));
    expect(screen.queryByTestId("csu-audit-group-discover-consolidation")).toBeNull();
    expect(screen.getByTestId("csu-audit-group-materials-assets-separation")).toBeTruthy();
    expect(screen.getByTestId("csu-audit-group-collaboration-convergence")).toBeTruthy();
  });

  it("mounts StudioCharacterShaperUnifiedPanel lazily only when CharacterShaperLandingPage disclosure opens", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/assets/characters/new?guide=1"]}>
        <CharacterShaperLandingPage />
      </MemoryRouter>,
    );

    const disclosure = screen.getByTestId("studio-character-shaper-unified-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-character-shaper-unified-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    expect(await screen.findByTestId("studio-character-shaper-unified-panel")).toBeTruthy();
  });
});
