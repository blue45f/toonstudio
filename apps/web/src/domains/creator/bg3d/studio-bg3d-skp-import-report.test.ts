import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_SKP_REPORT_MAX_NAMES,
  STUDIO_BG3D_SKP_REPORT_MAX_NAME_CODE_POINTS,
} from "./studio-bg3d-skp-contract";
import { parseStudioBg3dSkpImportReport, type StudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import { analyzeStudioBg3dSkpMesh } from "./studio-bg3d-skp-mesh-analysis";
import {
  STUDIO_BG3D_SKP_UNAVAILABLE_NAME_LIST,
  applyStudioBg3dSkpUnitToReport,
  buildStudioBg3dSkpImportReport,
  buildStudioBg3dSkpNameList,
  createStudioBg3dSkpWarning,
  sanitizeStudioBg3dSkpName,
  type StudioBg3dSkpReportInput,
} from "./studio-bg3d-skp-report-builder";
import {
  STUDIO_BG3D_SKP_IMPORT_REPORT_KIND,
  STUDIO_BG3D_SKP_IMPORT_REPORT_VERSION,
} from "./studio-bg3d-skp-report-constants";
import { studioBg3dSkpUnitScaleFactor } from "./studio-bg3d-skp-unit";
import { createBoxPrimitive } from "./studio-bg3d-skp.test-fixture";

function reportInput(size: number, overrides: Partial<StudioBg3dSkpReportInput> = {}): StudioBg3dSkpReportInput {
  const stats = analyzeStudioBg3dSkpMesh([createBoxPrimitive({ size })], { orientationTriangleBudget: 1_000 });
  return {
    byteSize: 4_096,
    container: "vff",
    version: { raw: "21.0.339", major: 21, label: "SketchUp 2021" },
    declaredUnits: { raw: "Millimeter", label: "밀리미터", unit: "mm" },
    execution: "worker",
    elapsedMs: 123.4,
    textures: "none",
    metadataPass: "done",
    primitivesBeforeMerge: 3,
    stats,
    texturesReferenced: 0,
    texturesEmbedded: 0,
    sourceFaces: 6,
    instances: 2,
    components: buildStudioBg3dSkpNameList(["Chair", "Table"]),
    tags: buildStudioBg3dSkpNameList(["Untagged", "Furniture"]),
    scenes: buildStudioBg3dSkpNameList(["Front view"]),
    warnings: [],
    ...overrides,
  };
}

function buildReport(size: number, overrides: Partial<StudioBg3dSkpReportInput> = {}): StudioBg3dSkpImportReport {
  return buildStudioBg3dSkpImportReport(reportInput(size, overrides));
}

describe("buildStudioBg3dSkpImportReport", () => {
  it("produces a report that satisfies its own versioned schema and survives a JSON round trip", () => {
    const report = buildReport(3);
    expect(report.version).toBe(STUDIO_BG3D_SKP_IMPORT_REPORT_VERSION);
    expect(report.kind).toBe(STUDIO_BG3D_SKP_IMPORT_REPORT_KIND);
    expect(parseStudioBg3dSkpImportReport(report)).toEqual(report);
    expect(parseStudioBg3dSkpImportReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
  });

  it("records the OpenSKP coordinate facts and the baseline inch unit", () => {
    const report = buildReport(3);
    expect(report.coordinates).toEqual({
      sourceUnit: "inch",
      outputUnit: "meter",
      metersPerSourceUnit: 0.0254,
      sourceUpAxis: "z",
      outputUpAxis: "y",
    });
    expect(report.units).toEqual({ appliedUnit: "inch", scaleFactor: 1, userSelected: false });
  });

  it("carries counts, source facts and names exactly as given", () => {
    const report = buildReport(3, { textures: "embedded", texturesReferenced: 2, texturesEmbedded: 2 });
    expect(report.counts).toEqual({
      sourceFaces: 6,
      vertices: 24,
      triangles: 12,
      materials: 1,
      textures: 2,
      texturesReferenced: 2,
      instances: 2,
    });
    expect(report.source).toEqual({
      byteSize: 4_096,
      container: "vff",
      sketchupVersion: "21.0.339",
      sketchupMajor: 21,
      sketchupLabel: "SketchUp 2021",
      declaredUnits: "Millimeter",
    });
    expect(report.names.components.items).toEqual(["Chair", "Table"]);
    expect(report.names.scenes.items).toEqual(["Front view"]);
    expect(report.conversion.elapsedMs).toBe(123);
    expect(report.conversion.primitivesBeforeMerge).toBe(3);
    expect(report.conversion.primitivesAfterMerge).toBe(1);
    expect(report.conversion.hiddenFacesExcluded).toBe(true);
  });

  it("adds a size warning and a unit recommendation for a model that is a few millimetres wide", () => {
    const report = buildReport(0.004);
    expect(report.size?.level).toBe("too-small");
    expect(report.size?.recommendedUnit).toBe("m");
    expect(report.warnings).toContainEqual({ code: "size-abnormal", severity: "warning", count: null, detail: "too-small" });
  });

  it("prefers the unit the file declares when it gives a plausible size", () => {
    const report = buildReport(1_200, { declaredUnits: { raw: "Centimeter", label: "센티미터", unit: "cm" } });
    expect(report.size?.level).toBe("too-large");
    expect(report.size?.recommendedUnit).toBe("cm");
  });

  it("represents a geometry-less result with size null and an empty-scene warning", () => {
    const empty = analyzeStudioBg3dSkpMesh([], { orientationTriangleBudget: 1_000 });
    const report = buildStudioBg3dSkpImportReport({ ...reportInput(1), stats: empty, instances: 0 });
    expect(report.size).toBeNull();
    expect(report.counts.triangles).toBe(0);
    expect(report.warnings.map((warning) => warning.code)).toContain("empty-scene");
    expect(parseStudioBg3dSkpImportReport(report)).not.toBeNull();
  });

  it("keeps caller warnings and drops duplicate codes", () => {
    const report = buildReport(3, {
      warnings: [
        createStudioBg3dSkpWarning("flipped-faces", "warning", { count: 4 }),
        createStudioBg3dSkpWarning("flipped-faces", "warning", { count: 9 }),
      ],
    });
    expect(report.warnings.filter((warning) => warning.code === "flipped-faces")).toEqual([
      { code: "flipped-faces", severity: "warning", count: 4, detail: null },
    ]);
  });
});

describe("applyStudioBg3dSkpUnitToReport", () => {
  it("rescales the size from the OpenSKP baseline and clears the abnormal-size warning", () => {
    const tiny = buildReport(0.004);
    const fixed = applyStudioBg3dSkpUnitToReport(tiny, "m", { userSelected: true });
    expect(fixed.units).toEqual({ appliedUnit: "m", scaleFactor: studioBg3dSkpUnitScaleFactor("m"), userSelected: true });
    expect(fixed.size?.openSkpMeters).toEqual(tiny.size?.openSkpMeters);
    expect(fixed.size?.maxExtentMeters).toBeCloseTo(0.004 * 39.37007874015748, 6);
    expect(fixed.size?.level).toBe("ok");
    const codes = fixed.warnings.map((warning) => warning.code);
    expect(codes).not.toContain("size-abnormal");
    expect(codes).toContain("unit-override-applied");
    expect(parseStudioBg3dSkpImportReport(fixed)).not.toBeNull();
  });

  it("does not accumulate error when the unit is changed repeatedly", () => {
    const base = buildReport(0.004);
    const first = applyStudioBg3dSkpUnitToReport(base, "cm", { userSelected: true });
    const second = applyStudioBg3dSkpUnitToReport(first, "m", { userSelected: true });
    const direct = applyStudioBg3dSkpUnitToReport(base, "m", { userSelected: true });
    expect(second.size).toEqual(direct.size);
    const back = applyStudioBg3dSkpUnitToReport(second, "inch", { userSelected: false });
    expect(back.size).toEqual(base.size);
    expect(back.warnings).toEqual(base.warnings);
    expect(back.units).toEqual({ appliedUnit: "inch", scaleFactor: 1, userSelected: false });
  });

  it("keeps the abnormal-size warning when the chosen unit is still implausible", () => {
    const tiny = buildReport(0.004);
    const stillTiny = applyStudioBg3dSkpUnitToReport(tiny, "mm", { userSelected: true });
    expect(stillTiny.size?.level).toBe("too-small");
    expect(stillTiny.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["size-abnormal", "unit-override-applied"]),
    );
  });

  it("only records the unit when there is no geometry to measure", () => {
    const empty = analyzeStudioBg3dSkpMesh([], { orientationTriangleBudget: 1_000 });
    const report = buildStudioBg3dSkpImportReport({ ...reportInput(1), stats: empty, instances: 0 });
    const updated = applyStudioBg3dSkpUnitToReport(report, "cm", { userSelected: true });
    expect(updated.size).toBeNull();
    expect(updated.units.appliedUnit).toBe("cm");
  });
});

describe("report names", () => {
  it("removes control and bidi characters, collapses whitespace and trims", () => {
    expect(sanitizeStudioBg3dSkpName("  거실\u0000\n  의자‮  ")).toBe("거실 의자");
    expect(sanitizeStudioBg3dSkpName("​\u0007")).toBeNull();
    expect(sanitizeStudioBg3dSkpName("")).toBeNull();
    expect(sanitizeStudioBg3dSkpName(42)).toBeNull();
    expect(sanitizeStudioBg3dSkpName(null)).toBeNull();
  });

  it("truncates by code point so emoji are never split", () => {
    const name = sanitizeStudioBg3dSkpName("가".repeat(79) + "🏠🏠🏠");
    expect(name).not.toBeNull();
    const points = Array.from(name ?? "");
    expect(points).toHaveLength(STUDIO_BG3D_SKP_REPORT_MAX_NAME_CODE_POINTS);
    expect(points[points.length - 1]).toBe("…");
    expect(points[points.length - 2]).toBe("가");
  });

  it("keeps markup-like text as plain text rather than rewriting it", () => {
    expect(sanitizeStudioBg3dSkpName("Door <left>")).toBe("Door <left>");
  });

  it("de-duplicates names, keeps first-seen order and counts the distinct total", () => {
    const list = buildStudioBg3dSkpNameList(["의자", "Table", "의자", "", "Table", null, "램프"]);
    expect(list).toEqual({ available: true, items: ["의자", "Table", "램프"], total: 3, truncated: false });
  });

  it("truncates long lists to the cap but keeps the full distinct total", () => {
    const names = Array.from({ length: STUDIO_BG3D_SKP_REPORT_MAX_NAMES + 30 }, (_, index) => `부품 ${index}`);
    const list = buildStudioBg3dSkpNameList(names);
    expect(list.items).toHaveLength(STUDIO_BG3D_SKP_REPORT_MAX_NAMES);
    expect(list.total).toBe(STUDIO_BG3D_SKP_REPORT_MAX_NAMES + 30);
    expect(list.truncated).toBe(true);
  });

  it("distinguishes unreadable names from an empty list", () => {
    expect(STUDIO_BG3D_SKP_UNAVAILABLE_NAME_LIST.available).toBe(false);
    expect(buildStudioBg3dSkpNameList([]).available).toBe(true);
  });
});

describe("parseStudioBg3dSkpImportReport", () => {
  const valid = buildReport(3);

  it("rejects values that are not the current report version", () => {
    expect(parseStudioBg3dSkpImportReport({ ...valid, version: 2 })).toBeNull();
    expect(parseStudioBg3dSkpImportReport({ ...valid, kind: "something-else" })).toBeNull();
    expect(parseStudioBg3dSkpImportReport(null)).toBeNull();
    expect(parseStudioBg3dSkpImportReport("report")).toBeNull();
  });

  it("rejects a scale factor that does not belong to the applied unit", () => {
    expect(parseStudioBg3dSkpImportReport({ ...valid, units: { ...valid.units, appliedUnit: "m" } })).toBeNull();
  });

  it("rejects negative or fractional counts, non-finite sizes and oversized name lists", () => {
    expect(parseStudioBg3dSkpImportReport({ ...valid, counts: { ...valid.counts, triangles: -1 } })).toBeNull();
    expect(parseStudioBg3dSkpImportReport({ ...valid, counts: { ...valid.counts, vertices: 1.5 } })).toBeNull();
    expect(parseStudioBg3dSkpImportReport({
      ...valid,
      size: valid.size && { ...valid.size, meters: [Number.NaN, 1, 1] },
    })).toBeNull();
    expect(parseStudioBg3dSkpImportReport({
      ...valid,
      names: { ...valid.names, components: { available: true, items: ["a", "b"], total: 1, truncated: false } },
    })).toBeNull();
  });

  it("rejects an unknown warning code or severity", () => {
    expect(parseStudioBg3dSkpImportReport({
      ...valid,
      warnings: [{ code: "made-up", severity: "warning", count: null, detail: null }],
    })).toBeNull();
    expect(parseStudioBg3dSkpImportReport({
      ...valid,
      warnings: [{ code: "flipped-faces", severity: "fatal", count: null, detail: null }],
    })).toBeNull();
  });

  it("ignores unknown extra keys instead of failing, so additive fields stay readable", () => {
    const parsed = parseStudioBg3dSkpImportReport({ ...valid, futureField: 1 });
    expect(parsed).toEqual(valid);
  });
});
