import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_SKP_UNITS,
  assessStudioBg3dSkpSize,
  classifyStudioBg3dSkpMaxExtent,
  describeStudioBg3dSkpDeclaredUnits,
  isStudioBg3dSkpUnit,
  maxStudioBg3dSkpExtent,
  studioBg3dSkpUnitScaleFactor,
} from "./studio-bg3d-skp-unit";

describe("studioBg3dSkpUnitScaleFactor", () => {
  it("treats inch as the OpenSKP baseline and derives the other units from 0.0254", () => {
    expect(studioBg3dSkpUnitScaleFactor("inch")).toBe(1);
    expect(studioBg3dSkpUnitScaleFactor("m")).toBeCloseTo(39.37007874015748, 12);
    expect(studioBg3dSkpUnitScaleFactor("cm")).toBeCloseTo(0.3937007874015748, 12);
    expect(studioBg3dSkpUnitScaleFactor("mm")).toBeCloseTo(0.03937007874015748, 12);
  });

  it("keeps the unit list in the m, cm, mm, inch order that the dialog shows", () => {
    expect([...STUDIO_BG3D_SKP_UNITS]).toEqual(["m", "cm", "mm", "inch"]);
    expect(isStudioBg3dSkpUnit("mm")).toBe(true);
    expect(isStudioBg3dSkpUnit("feet")).toBe(false);
    expect(isStudioBg3dSkpUnit(undefined)).toBe(false);
  });
});

describe("classifyStudioBg3dSkpMaxExtent", () => {
  it("flags a few millimetres as too small and a few kilometres as too large", () => {
    expect(classifyStudioBg3dSkpMaxExtent(0.004)).toBe("too-small");
    expect(classifyStudioBg3dSkpMaxExtent(3000)).toBe("too-large");
  });

  it("uses inclusive lower and exclusive-upper bounds exactly at 1 cm and 1 km", () => {
    expect(classifyStudioBg3dSkpMaxExtent(0.00999)).toBe("too-small");
    expect(classifyStudioBg3dSkpMaxExtent(0.01)).toBe("ok");
    expect(classifyStudioBg3dSkpMaxExtent(999.999)).toBe("ok");
    expect(classifyStudioBg3dSkpMaxExtent(1000)).toBe("too-large");
  });

  it("does not hide impossible values", () => {
    expect(classifyStudioBg3dSkpMaxExtent(Number.NaN)).toBe("too-small");
    expect(classifyStudioBg3dSkpMaxExtent(0)).toBe("too-small");
    expect(classifyStudioBg3dSkpMaxExtent(Number.POSITIVE_INFINITY)).toBe("too-large");
  });

  it("measures the largest axis regardless of sign", () => {
    expect(maxStudioBg3dSkpExtent([1, -7, 3])).toBe(7);
  });
});

describe("assessStudioBg3dSkpSize", () => {
  it("accepts a normal room-sized model and recommends nothing", () => {
    const assessment = assessStudioBg3dSkpSize([4, 2.5, 3.2]);
    expect(assessment.level).toBe("ok");
    expect(assessment.recommendedUnit).toBeNull();
    expect(assessment.candidates.map((candidate) => candidate.unit)).toEqual(["m", "cm", "mm", "inch"]);
  });

  it("recommends metres for a model that came out a few millimetres wide", () => {
    const assessment = assessStudioBg3dSkpSize([0.004, 0.003, 0.002]);
    expect(assessment.level).toBe("too-small");
    expect(assessment.recommendedUnit).toBe("m");
    const metres = assessment.candidates.find((candidate) => candidate.unit === "m");
    expect(metres?.maxExtentMeters).toBeCloseTo(0.1575, 4);
    expect(metres?.plausible).toBe(true);
    expect(assessment.candidates.find((candidate) => candidate.unit === "mm")?.plausible).toBe(false);
  });

  it("recommends millimetres for a model that came out a few kilometres wide", () => {
    const assessment = assessStudioBg3dSkpSize([3000, 10, 5]);
    expect(assessment.level).toBe("too-large");
    expect(assessment.recommendedUnit).toBe("mm");
    expect(assessment.candidates.find((candidate) => candidate.unit === "mm")?.maxExtentMeters).toBeCloseTo(118.11, 2);
  });

  it("prefers the unit the file declares when that unit gives a plausible size", () => {
    // 1200 m → cm 472 m 와 mm 47 m 가 모두 그럴듯하다. 선언이 없으면 3m 에 가까운 mm.
    expect(assessStudioBg3dSkpSize([1200, 5, 5]).recommendedUnit).toBe("mm");
    expect(assessStudioBg3dSkpSize([1200, 5, 5], "cm").recommendedUnit).toBe("cm");
  });

  it("ignores a declared unit whose result is not plausible", () => {
    expect(assessStudioBg3dSkpSize([3000, 10, 5], "m").recommendedUnit).toBe("mm");
  });

  it("returns no recommendation when no unit makes the size plausible", () => {
    const assessment = assessStudioBg3dSkpSize([1e-9, 1e-9, 1e-9]);
    expect(assessment.level).toBe("too-small");
    expect(assessment.recommendedUnit).toBeNull();
    expect(assessment.candidates.every((candidate) => !candidate.plausible)).toBe(true);
  });

  it("scales every candidate size from the same OpenSKP baseline", () => {
    const assessment = assessStudioBg3dSkpSize([1, 2, 3]);
    const cm = assessment.candidates.find((candidate) => candidate.unit === "cm");
    expect(cm?.sizeMeters[2]).toBeCloseTo(3 * studioBg3dSkpUnitScaleFactor("cm"), 12);
    expect(assessment.candidates.find((candidate) => candidate.unit === "inch")?.sizeMeters).toEqual([1, 2, 3]);
  });
});

describe("describeStudioBg3dSkpDeclaredUnits", () => {
  it("maps the display-unit strings that SketchUp files can carry to labels", () => {
    expect(describeStudioBg3dSkpDeclaredUnits("Millimeter")).toEqual({ raw: "Millimeter", label: "밀리미터", unit: "mm" });
    expect(describeStudioBg3dSkpDeclaredUnits("Centimeters").unit).toBe("cm");
    expect(describeStudioBg3dSkpDeclaredUnits("Meters").unit).toBe("m");
    expect(describeStudioBg3dSkpDeclaredUnits("Inches").unit).toBe("inch");
  });

  it("recognises feet and yards for display but gives no m/cm/mm/inch mapping", () => {
    expect(describeStudioBg3dSkpDeclaredUnits("Decimal Feet")).toEqual({ raw: "Decimal Feet", label: "피트", unit: null });
    expect(describeStudioBg3dSkpDeclaredUnits("Yards").label).toBe("야드");
  });

  it("keeps an unknown string as raw text without inventing a label", () => {
    expect(describeStudioBg3dSkpDeclaredUnits("Furlong")).toEqual({ raw: "Furlong", label: null, unit: null });
  });

  it("returns nothing for legacy files (no value) and non-string values", () => {
    for (const value of [null, undefined, 3, {}, "", "   "]) {
      expect(describeStudioBg3dSkpDeclaredUnits(value)).toEqual({ raw: null, label: null, unit: null });
    }
  });

  it("strips control characters and caps the text length", () => {
    expect(describeStudioBg3dSkpDeclaredUnits("Mil\u0000li\u0007meter").raw).toBe("Millimeter");
    expect(Array.from(describeStudioBg3dSkpDeclaredUnits("m".repeat(200)).raw ?? "").length).toBe(40);
  });
});
