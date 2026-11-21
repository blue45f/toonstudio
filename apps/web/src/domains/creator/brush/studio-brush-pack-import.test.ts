/**
 * Brush pack import — bytes to drawn pixels.
 *
 * The contract this file defends is "registered means drawable". A parser that
 * returns a `BrushProgramIR` proves nothing on its own: the failure this suite
 * exists to catch is an import that lands in the library, applies to the pen,
 * and then deposits nothing (or deposits at a wrong size/opacity) because the
 * IR never reached the fields the dab planner reads.
 *
 * So every format goes: real corpus bytes → import → snapshot → the same
 * `planStudioDynamicBrushDabs` the pen uses → rasterized coverage.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateRawSync, deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { planStudioDynamicBrushDabs } from "./studio-brush-dynamics";
import { createBrush, writeBrushJson } from "./studio-brush-library";
import {
  BRUSH_SOURCE_ARCHIVE_MAX_BYTES,
  BRUSH_SOURCE_ARCHIVE_MAX_CHARACTERS,
} from "./studio-brush-original-source";
import {
  KRITA_REFERENCE_MAX_DIAMETER_PX,
  MYPAINT_LOG_RADIUS_SCALE,
  STUDIO_BRUSH_PACK_ACCEPT,
  STUDIO_BRUSH_PACK_MAX_STROKE_WIDTH,
  StudioBrushProgramImportError,
  importStudioBrushJsonText,
  importStudioCspToolBytes,
  importStudioKppBytes,
  importStudioMybBytes,
  importStudioProcreateBrushsetBytes,
  studioBrushPackFormatOf,
  studioBrushSnapshotFromProgram,
} from "./studio-brush-pack-import";
import {
  buildAuthoredSutFixture,
  readAuthoredSutWithNodeSqlite,
} from "../../../../../../tests/corpus/formats/csp-sut-fixtures";

import type { StudioBrushSnapshot } from "./studio-brush-library";

function corpusBytes(relative: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../../../../../tests/corpus/brushes/${relative}`, import.meta.url))),
  );
}

/**
 * The drawability probe: run the imported snapshot through the production dab
 * planner over a diagonal stroke with a rising pressure ramp, then stamp every
 * dab into a coverage grid. Non-zero cells are pixels the artist would see.
 */
function drawCoverage(snapshot: StudioBrushSnapshot): {
  dabCount: number;
  coveredPixels: number;
  minSize: number;
  maxSize: number;
} {
  const points: number[] = [];
  const pressures: number[] = [];
  const samples = 24;
  for (let index = 0; index < samples; index += 1) {
    const t = index / (samples - 1);
    points.push(20 + t * 160, 20 + t * 160);
    pressures.push(0.05 + t * 0.95);
  }
  const dabs = planStudioDynamicBrushDabs({
    points,
    pressures,
    baseWidth: snapshot.strokeWidth,
    baseOpacity: snapshot.brushOpacity,
    settings: snapshot.brushDynamics,
  });

  const width = 220;
  const height = 220;
  const grid = new Uint8Array(width * height);
  let minSize = Number.POSITIVE_INFINITY;
  let maxSize = 0;
  for (const dab of dabs) {
    minSize = Math.min(minSize, dab.size);
    maxSize = Math.max(maxSize, dab.size);
    if (dab.opacity <= 0 || dab.size <= 0) continue;
    const radius = dab.size / 2;
    const left = Math.max(0, Math.floor(dab.x - radius));
    const right = Math.min(width - 1, Math.ceil(dab.x + radius));
    const top = Math.max(0, Math.floor(dab.y - radius));
    const bottom = Math.min(height - 1, Math.ceil(dab.y + radius));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const dx = x + 0.5 - dab.x;
        const dy = y + 0.5 - dab.y;
        if (dx * dx + dy * dy <= radius * radius) grid[y * width + x] = 1;
      }
    }
  }
  return {
    dabCount: dabs.length,
    coveredPixels: grid.reduce((sum, cell) => sum + cell, 0),
    minSize: Number.isFinite(minSize) ? minSize : 0,
    maxSize,
  };
}

describe("brush pack format sniffing", () => {
  it("routes every extension the file inputs advertise", () => {
    expect(studioBrushPackFormatOf("Studio.abr")).toBe("abr");
    expect(studioBrushPackFormatOf("wash-soft.myb")).toBe("myb");
    expect(studioBrushPackFormatOf("ink.KPP")).toBe("kpp");
    expect(studioBrushPackFormatOf("ink.sut")).toBe("sut");
    expect(studioBrushPackFormatOf("group.sutg")).toBe("sutg");
    expect(studioBrushPackFormatOf("paint.bundle")).toBe("bundle");
    expect(studioBrushPackFormatOf("watercolor.brushset")).toBe("brushset");
    expect(studioBrushPackFormatOf("saved.json")).toBe("json");
    expect(studioBrushPackFormatOf("nameless", "application/x-photoshop")).toBe("abr");
    expect(studioBrushPackFormatOf("nameless", "application/x-krita-resourcebundle"))
      .toBe("bundle");
    expect(studioBrushPackFormatOf("nameless", "application/x-procreate-brushset"))
      .toBe("brushset");
  });

  it("advertises .myb, .kpp, and .brushset on the accept list, so the picker can offer them", () => {
    for (const extension of [".json", ".abr", ".myb", ".kpp", ".sut", ".sutg", ".bundle", ".brushset"]) {
      expect(STUDIO_BRUSH_PACK_ACCEPT).toContain(extension);
    }
  });
});

describe("libmypaint .myb import draws", () => {
  it("turns ink-crisp.myb into a brush that deposits pixels", () => {
    const result = importStudioMybBytes(corpusBytes("myb/ink-crisp.myb"), "ink-crisp.myb");
    expect(result.format).toBe("myb");
    expect(result.brushes).toHaveLength(1);

    const [brush] = result.brushes;
    const snapshot = brush!.snapshot;
    // radius_logarithmic 1.45 with a +0.25 pressure delta → the widest dab is
    // exp(1.70) in radius. The gateway stores that as (1.45 + 0.25) / 6, so the
    // scale constant is what turns the LUT tap back into log-radius.
    const widestTap = (1.45 + 0.25) / MYPAINT_LOG_RADIUS_SCALE;
    expect(snapshot.strokeWidth).toBe(
      Math.round(2 * Math.exp(widestTap * MYPAINT_LOG_RADIUS_SCALE)),
    );
    expect(snapshot.strokeWidth).toBeGreaterThan(0);
    expect(snapshot.brushOpacity).toBeGreaterThan(0.5);

    const drawn = drawCoverage(snapshot);
    expect(drawn.dabCount).toBeGreaterThan(0);
    expect(drawn.coveredPixels).toBeGreaterThan(500);
    // Pressure genuinely reaches the geometry: thin at the start, thick at the end.
    expect(drawn.maxSize).toBeGreaterThan(drawn.minSize);
  });

  it("carries slow_tracking into the stabilizer and names every unmapped setting", () => {
    const result = importStudioMybBytes(corpusBytes("myb/wash-soft.myb"), "wash-soft.myb");
    const snapshot = result.brushes[0]!.snapshot;
    // slow_tracking 1.8 → strength 0.18 → 2 on the 0..10 stabilizer slider.
    expect(snapshot.stabilizer).toBe(2);

    // dabs_per_actual_radius 3.4 → 100 / (2 × 3.4) = 15% spacing, not the
    // 10% default the old `dabs_per_radius` misspelling silently produced.
    expect(snapshot.brushDynamics?.spacingRatio).toBeCloseTo(0.15);

    // The honest ledger: libmypaint settings the common IR does NOT carry.
    // smudge (→ mixing) and dabs_per_actual_radius (→ spacing) are applied,
    // so naming them here would be a false loss report.
    expect(result.unmapped).toContain("myb:smudge_length");
    expect(result.unmapped).toContain("myb:color_h");
    expect(result.unmapped).not.toContain("myb:smudge");
    expect(result.unmapped).not.toContain("myb:dabs_per_actual_radius");
    expect(result.unmapped.every((entry) => entry.length > 0)).toBe(true);

    expect(drawCoverage(snapshot).coveredPixels).toBeGreaterThan(500);
  });

  it("refuses a non-v3 document loudly instead of registering a fake brush", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 2, settings: {} }));
    expect(() => importStudioMybBytes(bytes, "old.myb")).toThrow(StudioBrushProgramImportError);
  });

  it("propagates the myb parser code as params.causeCode alongside the detail passthrough (R21)", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 2, settings: {} }));
    let caught: unknown;
    try { importStudioMybBytes(bytes, "old.myb"); } catch (error) { caught = error; }
    expect(caught).toMatchObject({
      name: "StudioBrushProgramImportError",
      code: "mybReadFailed",
      format: "myb",
      params: { causeCode: "myb:unsupported-version" },
      cause: expect.objectContaining({ name: "MybParseError", code: "unsupported-version" }),
    });
    expect((caught as StudioBrushProgramImportError).params?.detail).toContain("unsupported .myb version 2");
  });

  it("propagates invalid-utf8 for bytes that are not UTF-8 JSON (R21)", () => {
    let caught: unknown;
    try { importStudioMybBytes(new Uint8Array([0xff, 0xfe, 0xfd]), "bad.myb"); } catch (error) { caught = error; }
    expect(caught).toMatchObject({
      code: "mybReadFailed",
      params: { causeCode: "myb:invalid-utf8" },
      cause: expect.objectContaining({ name: "MybParseError", code: "invalid-utf8" }),
    });
  });
});

describe("Krita .kpp import draws", () => {
  it("turns a paintbrush preset's diameter and opacity into drawable settings", () => {
    const result = importStudioKppBytes(
      corpusBytes("kpp/paintbrush-ink-basic.kpp"),
      "paintbrush-ink-basic.kpp",
    );
    expect(result.format).toBe("kpp");
    const snapshot = result.brushes[0]!.snapshot;
    expect(snapshot.strokeWidth).toBeGreaterThanOrEqual(1);
    expect(snapshot.strokeWidth).toBeLessThanOrEqual(80);
    expect(snapshot.brushOpacity).toBeGreaterThan(0);

    const drawn = drawCoverage(snapshot);
    expect(drawn.dabCount).toBeGreaterThan(0);
    expect(drawn.coveredPixels).toBeGreaterThan(200);
  });

  it("keeps the pressure curve preset drawable and pressure-reactive", () => {
    const result = importStudioKppBytes(
      corpusBytes("kpp/paintbrush-pressure-curve.kpp"),
      "paintbrush-pressure-curve.kpp",
    );
    const snapshot = result.brushes[0]!.snapshot;
    const drawn = drawCoverage(snapshot);
    expect(drawn.coveredPixels).toBeGreaterThan(200);
    expect(drawn.maxSize).toBeGreaterThanOrEqual(drawn.minSize);
  });

  it("routes a mypaintbrush preset through the myb lane and still draws", () => {
    const result = importStudioKppBytes(
      corpusBytes("kpp/mypaint-wash-soft.kpp"),
      "mypaint-wash-soft.kpp",
    );
    const snapshot = result.brushes[0]!.snapshot;
    expect(drawCoverage(snapshot).coveredPixels).toBeGreaterThan(200);
    // Delegated myb settings stay traceable through the kpp prefix.
    expect(result.unmapped.some((entry) => entry.startsWith("kpp:"))).toBe(true);
  });

  it("refuses bytes that are not a Krita preset", () => {
    expect(() => importStudioKppBytes(new Uint8Array([1, 2, 3, 4]), "broken.kpp")).toThrow(
      StudioBrushProgramImportError,
    );
  });

  it("propagates the kpp parser code as params.causeCode alongside the detail passthrough (R21)", () => {
    let caught: unknown;
    try { importStudioKppBytes(new Uint8Array([1, 2, 3, 4]), "broken.kpp"); } catch (error) { caught = error; }
    expect(caught).toMatchObject({
      name: "StudioBrushProgramImportError",
      code: "kppReadFailed",
      format: "kpp",
      params: { causeCode: "kpp:not-png" },
      cause: expect.objectContaining({ name: "KppParseError", code: "not-png" }),
    });
    expect((caught as StudioBrushProgramImportError).params?.detail).toContain("PNG signature");
  });
});

describe("BrushProgramIR → snapshot mapping surfaces what it cannot carry", () => {
  const baseProgram = {
    id: "test:program",
    name: "Test",
    stabilizer: { kind: "ema" as const, strength: 0.5, predictionMs: 0 },
    sizeDynamics: [{ input: "constant" as const, curve: [0.024, 0.024], min: 0, max: 1 }],
    flowDynamics: [{ input: "constant" as const, curve: [0.8, 0.8], min: 0, max: 1 }],
    geometry: {
      kind: "perfect-freehand" as const,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      capStart: true,
      capEnd: true,
    },
    tip: { kind: "round" as const, hardness: 0.9, spacingPct: 12, angleJitterDeg: 0 },
    mixing: { kind: "none" as const, strength: 0 },
    output: { target: "vector-path" as const, bake: "editable-proxy" as const },
    providerPreference: ["hokusai-natural-media"],
  };

  it("reads the Krita diameter reference rather than guessing a size", () => {
    const { snapshot } = studioBrushSnapshotFromProgram(baseProgram);
    expect(snapshot.strokeWidth).toBe(Math.round(0.024 * KRITA_REFERENCE_MAX_DIAMETER_PX));
    expect(snapshot.brushOpacity).toBeCloseTo(0.8, 5);
    expect(snapshot.stabilizer).toBe(5);
  });

  it("preserves smudge/wet mixing, tilt dynamics, angle jitter, and flags only truly missing image assets or random inputs", () => {
    const { snapshot, unmapped, warnings } = studioBrushSnapshotFromProgram({
      ...baseProgram,
      mixing: { kind: "smudge", strength: 0.4 },
      tip: { kind: "image", hardness: 1, spacingPct: 10, angleJitterDeg: 15 },
      sizeDynamics: [
        ...baseProgram.sizeDynamics,
        { input: "tiltAltitude", curve: [0, 1], min: 0, max: 1 },
        { input: "random", curve: [0, 1], min: 0, max: 1 },
      ],
    });
    expect(snapshot.brushId).toBe("web-smudge-trail");
    expect(snapshot.brushDynamics.angle.jitter).toEqual({ mode: "add", amount: 15 });
    expect(snapshot.brushDynamics.width.mappings.some((m) => m.source === "tilt-magnitude")).toBe(true);
    expect(unmapped).not.toContain("mixing.smudge");
    expect(unmapped).not.toContain("tip.angleJitterDeg");
    expect(unmapped).not.toContain("sizeDynamics(tiltAltitude)");
    expect(unmapped).toContain("tip.image");
    expect(unmapped).toContain("sizeDynamics(random)");
    expect(warnings.some((w) => w.code === "warn.imageTipFallback")).toBe(true);
  });

  it("preserves non-linear pressure LUTs via fitted cubic Bezier curveLUT without linear flattening", () => {
    const { snapshot, warnings } = studioBrushSnapshotFromProgram({
      ...baseProgram,
      sizeDynamics: [
        { input: "constant", curve: [0.36, 0.36], min: 0, max: 1 },
        { input: "pressure", curve: [0, 0.02, 0.05, 0.1, 0.2, 0.45, 0.75, 1], min: 0, max: 1 },
      ],
    });
    expect(STUDIO_BRUSH_PACK_MAX_STROKE_WIDTH).toBe(500);
    expect(snapshot.strokeWidth).toBe(360);
    expect(warnings.some((warning) => warning.code === "warn.sizeCurveApproximated")).toBe(false);
    const pressureMap = snapshot.brushDynamics.width.mappings.find((m) => m.source === "pressure")!;
    expect(pressureMap.curveMode).toBe("bezier");
    expect(pressureMap.curveControlPoints).toHaveLength(4);
    expect(pressureMap.curveLUT).toBeInstanceOf(Float32Array);
    // Mid-pressure response stays concave (< 0.35), not linearly flattened to 0.50.
    expect(pressureMap.curveLUT![128]).toBeLessThan(0.35);
  });

  it("routes media families (watercolor, oil, pencil, charcoal, airbrush, ink) to appropriate brush lanes", () => {
    const routeOf = (
      name: string,
      overrides: Partial<Parameters<typeof studioBrushSnapshotFromProgram>[0]> = {},
    ) => studioBrushSnapshotFromProgram({ ...baseProgram, name, ...overrides }).snapshot;

    expect(routeOf("투명 수채 워시", { mixing: { kind: "wet", strength: 0.7 } })).toMatchObject({
      brushId: "watercolor",
      enginePrograms: { watercolor: { wetEdgeBloomProgramId: "edge-bloom" } },
    });
    expect(routeOf("유화 평붓 Oil")).toMatchObject({
      brushId: "oil",
      enginePrograms: { oil: { bristlePhysics: true, impastoRelief: true } },
    });
    expect(routeOf("2B 흑연 연필 Pencil").brushId).toBe("erodible-pencil");
    expect(routeOf("거친 목탄 Charcoal").brushId).toBe("charcoal");
    expect(routeOf("소프트 에어브러시", { tip: { kind: "round", hardness: 0.15, spacingPct: 10, angleJitterDeg: 0 } }).brushId).toBe("airbrush");
    expect(routeOf("G펜 잉크").brushId).toBe("ink-particle");
  });
});

describe("CSP .sut lossless import & Procreate .brushset end-to-end drawability", () => {
  it("imports authored CSP .sut with auto-linked Material PNG tip, 180px wash width, and drawable pixels", async () => {
    const sutBytes = buildAuthoredSutFixture({ group: true });
    const result = await importStudioCspToolBytes(
      sutBytes,
      "authored.sutg",
      "sutg",
      readAuthoredSutWithNodeSqlite,
    );
    expect(result.brushes).toHaveLength(2);
    const ink = result.brushes[0]!;
    const wash = result.brushes[1]!;
    expect(ink.snapshot.brushDynamics.tip.alphaMapBase64).toBeTruthy();
    expect(ink.snapshot.brushDynamics.width.mappings[0]?.curveMode).toBe("bezier");
    expect(wash.snapshot.strokeWidth).toBe(180);
    expect(wash.snapshot.brushId).toBe("watercolor");
    expect(drawCoverage(ink.snapshot).coveredPixels).toBeGreaterThan(200);
    expect(drawCoverage(wash.snapshot).coveredPixels).toBeGreaterThan(200);
  });

  it("imports a Procreate .brushset ZIP with Shape.png, Wet Mix, Dual Brush, and Taper and draws", async () => {
    const crcTable = (() => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let b = 0; b < 8; b += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[i] = c >>> 0;
      }
      return t;
    })();
    const crc32 = (buf: Uint8Array) => {
      let c = 0xffff_ffff;
      for (const b of buf) c = (c >>> 8) ^ (crcTable[(c ^ b) & 0xff] ?? 0);
      return (c ^ 0xffff_ffff) >>> 0;
    };
    const pngChunk = (type: string, data: Uint8Array) => {
      const out = new Uint8Array(12 + data.byteLength);
      const dv = new DataView(out.buffer);
      dv.setUint32(0, data.byteLength, false);
      for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
      out.set(data, 8);
      dv.setUint32(8 + data.byteLength, crc32(out.subarray(4, 8 + data.byteLength)), false);
      return out;
    };
    // 16×16 white circle Shape.png
    const ihdr = new Uint8Array(13);
    new DataView(ihdr.buffer).setUint32(0, 16, false);
    new DataView(ihdr.buffer).setUint32(4, 16, false);
    ihdr[8] = 8;
    ihdr[9] = 0;
    const raw = new Uint8Array(16 * 17);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        raw[y * 17 + 1 + x] = Math.hypot(x - 7.5, y - 7.5) <= 6.5 ? 255 : 0;
      }
    }
    const shapePng = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...pngChunk("IHDR", ihdr),
      ...pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
      ...pngChunk("IEND", new Uint8Array()),
    ]);
    const manifest = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>name</key><string>Procreate Set</string><key>brushes</key><array><string>WET1</string></array></dict></plist>`);
    const archiveXml = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>name</key><string>Procreate Watercolor</string>
  <key>maxSize</key><real>0.9</real>
  <key>maxOpacity</key><real>0.85</real>
  <key>plotSpacing</key><real>0.14</real>
  <key>plotJitter</key><real>0.15</real>
  <key>paintDilution</key><real>0.65</real>
  <key>paintPull</key><real>0.55</real>
  <key>pressureTaperStartLength</key><real>0.15</real>
  <key>pressureTaperEndLength</key><real>0.25</real>
  <key>taperSize</key><real>0.8</real>
  <key>pressureSizeCurve</key><array><string>{0, 0.1}</string><string>{0.5, 0.25}</string><string>{1, 1}</string></array>
</dict></plist>`);

    const zipEntries = [
      { path: "brushset.plist", data: manifest },
      { path: "WET1/Brush.archive", data: archiveXml },
      { path: "WET1/Shape.png", data: shapePng },
    ];
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;
    for (const entry of zipEntries) {
      const nameBytes = new TextEncoder().encode(entry.path);
      const crc = crc32(entry.data);
      const payload = new Uint8Array(deflateRawSync(entry.data));
      const local = new Uint8Array(30 + nameBytes.byteLength + payload.byteLength);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 8, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, payload.byteLength, true);
      lv.setUint32(22, entry.data.byteLength, true);
      lv.setUint16(26, nameBytes.byteLength, true);
      local.set(nameBytes, 30);
      local.set(payload, 30 + nameBytes.byteLength);
      locals.push(local);

      const central = new Uint8Array(46 + nameBytes.byteLength);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 8, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, payload.byteLength, true);
      cv.setUint32(24, entry.data.byteLength, true);
      cv.setUint16(28, nameBytes.byteLength, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centrals.push(central);
      offset += local.byteLength;
    }
    const cdSize = centrals.reduce((s, p) => s + p.byteLength, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, zipEntries.length, true);
    ev.setUint16(10, zipEntries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    const zipBytes = Uint8Array.from([
      ...locals.flatMap((p) => [...p]),
      ...centrals.flatMap((p) => [...p]),
      ...eocd,
    ]);

    const imported = await importStudioProcreateBrushsetBytes(zipBytes, "watercolor.brushset");
    expect(imported.format).toBe("brushset");
    expect(imported.brushes).toHaveLength(1);
    const snap = imported.brushes[0]!.snapshot;
    expect(snap.brushId).toBe("watercolor");
    expect(snap.strokeWidth).toBe(180);
    expect(snap.enginePrograms?.watercolor?.wetEdgeBloomProgramId).toBe("edge-bloom");
    expect(snap.brushDynamics.tip.alphaMapBase64).toBeTruthy();
    expect(snap.brushDynamics.taper).toMatchObject({ enabled: true, startLength: 0.15, endLength: 0.25 });
    expect(snap.brushDynamics.scatterRatio).toBeCloseTo(0.3, 4);
    expect(drawCoverage(snap).coveredPixels).toBeGreaterThan(200);
  });
});

describe("app-private .json stays on one reporting shape", () => {
  it("imports a round-tripped saved brush", () => {
    const saved = createBrush("내 펜", {
      ...importStudioMybBytes(corpusBytes("myb/ink-crisp.myb"), "ink-crisp.myb").brushes[0]!
        .snapshot,
    });
    const result = importStudioBrushJsonText(writeBrushJson(saved), "내 펜.json");
    expect(result.format).toBe("json");
    expect(result.brushes[0]!.snapshot.strokeWidth).toBe(saved.strokeWidth);
    expect(drawCoverage(result.brushes[0]!.snapshot).coveredPixels).toBeGreaterThan(100);
  });

  it("rejects JSON text over the archive character ceiling in this lane itself", () => {
    const oversized = "x".repeat(BRUSH_SOURCE_ARCHIVE_MAX_CHARACTERS + 1);
    expect(() => importStudioBrushJsonText(oversized, "huge.json"))
      .toThrow(expect.objectContaining({ name: "StudioBrushProgramImportError", code: "jsonTooLarge" }));
  });

  it("rejects JSON text over the archive byte ceiling even under the character ceiling", () => {
    // "붓"은 UTF-8 3바이트: 문자 수는 한도 아래지만 바이트 수는 한도를 넘는다.
    const charCount = Math.floor(BRUSH_SOURCE_ARCHIVE_MAX_BYTES / 3) + 1;
    expect(charCount).toBeLessThanOrEqual(BRUSH_SOURCE_ARCHIVE_MAX_CHARACTERS);
    expect(() => importStudioBrushJsonText("붓".repeat(charCount), "huge.json"))
      .toThrow(expect.objectContaining({ name: "StudioBrushProgramImportError", code: "jsonTooLarge" }));
  });
});
