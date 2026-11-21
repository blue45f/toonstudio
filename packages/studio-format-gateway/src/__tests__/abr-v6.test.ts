import { describe, expect, it } from "vitest";

import { AbrParseError, importAbr, importAbrV6 } from "../abr";

import type { AbrV6DescriptorBrush } from "../abr-v6";

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function i16(value: number): number[] {
  return u16(value & 0xffff);
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function f64(value: number): number[] {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, false);
  return [...new Uint8Array(buf)];
}

function ascii(text: string): number[] {
  return [...text].map((ch) => ch.charCodeAt(0) & 0xff);
}

function psdKey(key: string): number[] {
  return key.length === 4 ? [...u32(0), ...ascii(key)] : [...u32(key.length), ...ascii(key)];
}

function unicodeStr(text: string): number[] {
  const units = [...text].map((ch) => ch.charCodeAt(0));
  units.push(0); // trailing NUL
  const out = [...u32(units.length)];
  for (const unit of units) out.push(...u16(unit));
  return out;
}

function descObj(classId: string, entries: Array<[string, number[]]>): number[] {
  const out = [...unicodeStr(""), ...psdKey(classId), ...u32(entries.length)];
  for (const [key, val] of entries) out.push(...psdKey(key), ...val);
  return out;
}

function untF(unit: string, value: number): number[] {
  return [...ascii("UntF"), ...ascii(unit), ...f64(value)];
}

function boolItem(value: boolean): number[] {
  return [...ascii("bool"), value ? 1 : 0];
}

function longItem(value: number): number[] {
  return [...ascii("long"), ...u32(value >>> 0)];
}

function textItem(value: string): number[] {
  return [...ascii("TEXT"), ...unicodeStr(value)];
}

function enumItem(enumType: string, value: string): number[] {
  return [...ascii("enum"), ...psdKey(enumType), ...psdKey(value)];
}

function objcItem(classId: string, entries: Array<[string, number[]]>): number[] {
  return [...ascii("Objc"), ...descObj(classId, entries)];
}

function listItem(items: number[][]): number[] {
  const out = [...ascii("VlLs"), ...u32(items.length)];
  for (const item of items) out.push(...item);
  return out;
}

function dynamicsObj(controlIdx: number, jitterPct: number, minPct: number, steps = 0): number[] {
  return objcItem("brVr", [
    ["bVTy", longItem(controlIdx)],
    ["fStp", longItem(steps)],
    ["jitter", untF("#Prc", jitterPct)],
    ["Mnm ", untF("#Prc", minPct)],
  ]);
}

function section8bim(key: string, body: number[]): number[] {
  const padded = [...body];
  while (padded.length % 4 !== 0) padded.push(0);
  return [...ascii("8BIM"), ...ascii(key), ...u32(body.length), ...padded];
}

function encodePackBitsRow(row: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < row.length) {
    let run = 1;
    while (i + run < row.length && run < 128 && row[i + run] === row[i]) run += 1;
    if (run >= 3) {
      out.push((257 - run) & 0xff, row[i]!);
      i += run;
    } else {
      const start = i;
      while (i < row.length && i - start < 128) {
        if (i + 2 < row.length && row[i] === row[i + 1] && row[i] === row[i + 2]) break;
        i += 1;
      }
      const len = i - start;
      out.push(len - 1);
      for (let k = start; k < i; k += 1) out.push(row[k]!);
    }
  }
  return out;
}

function buildSampRecord(
  id: string,
  width: number,
  height: number,
  alpha: Uint8Array,
  options: { subversion?: 1 | 2; compress?: 0 | 1; depth?: 8 | 16 } = {},
): number[] {
  const subversion = options.subversion ?? 2;
  const compress = options.compress ?? 0;
  const depth = options.depth ?? 8;
  const body: number[] = [
    id.length,
    ...ascii(id),
    ...new Array<number>(subversion === 1 ? 10 : 264).fill(0),
    ...u32(0), // top
    ...u32(0), // left
    ...u32(height), // bottom
    ...u32(width), // right
    ...i16(depth),
    compress,
  ];
  if (depth === 8 && compress === 0) {
    for (const byte of alpha) body.push(byte);
  } else if (depth === 8 && compress === 1) {
    const encodedRows: number[][] = [];
    for (let y = 0; y < height; y += 1) {
      encodedRows.push(encodePackBitsRow(alpha.subarray(y * width, (y + 1) * width)));
    }
    for (const r of encodedRows) body.push(...u16(r.length));
    for (const r of encodedRows) body.push(...r);
  } else if (depth === 16 && compress === 0) {
    for (const byte of alpha) body.push(byte, byte);
  }
  const padded = [...body];
  while (padded.length % 4 !== 0) padded.push(0);
  return [...u32(body.length), ...padded];
}

function buildSyntheticAbrV6(version: 6 | 7 | 9 | 10, subversion: 1 | 2, width: number, height: number, compress: 0 | 1 = 1): Uint8Array {
  const alpha = new Uint8Array(width * height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const radius = Math.min(width, height) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dist = Math.hypot(x - cx, y - cy) / Math.max(1, radius);
      alpha[y * width + x] = dist <= 1 ? Math.round((1 - dist * 0.5) * 255) : 0;
    }
  }
  const sampRec = buildSampRecord("tip-guid-512", width, height, alpha, { subversion, compress, depth: 8 });
  const brushDesc = objcItem("brushPreset", [
    ["Nm  ", textItem("Photopea Parity Oil")],
    ["Brsh", objcItem("sampledBrush", [
      ["Dmtr", untF("#Pxl", 320)],
      ["Hrdn", untF("#Prc", 75)],
      ["Angl", untF("#Ang", -15)],
      ["Rndn", untF("#Prc", 60)],
      ["Spcn", untF("#Prc", 18)],
      ["Intr", boolItem(true)],
      ["sampledData", textItem("tip-guid-512")],
    ])],
    ["Wtdg", boolItem(true)],
    ["Nose", boolItem(true)],
    ["useTipDynamics", boolItem(true)],
    ["szVr", dynamicsObj(2, 10, 25)],
    ["angleDynamics", dynamicsObj(3, 40, 0)],
    ["roundnessDynamics", dynamicsObj(2, 5, 30)],
    ["useScatter", boolItem(true)],
    ["scatterDynamics", dynamicsObj(2, 65, 0)],
    ["countDynamics", dynamicsObj(0, 15, 0)],
    ["Cnt ", longItem(3)],
    ["bothAxes", boolItem(true)],
    ["useTexture", boolItem(true)],
    ["Txtr", objcItem("Ptrn", [
      ["Idnt", textItem("canvas-grain-01")],
      ["Nm  ", textItem("Cold Press")],
    ])],
    ["textureDepth", untF("#Prc", 82)],
    ["minimumDepth", untF("#Prc", 20)],
    ["textureScale", untF("#Prc", 150)],
    ["textureBrightness", longItem(15)],
    ["textureContrast", longItem(30)],
    ["textureBlendMode", enumItem("BlnM", "height")],
    ["InvT", boolItem(true)],
    ["TxtC", boolItem(true)],
    ["textureDepthDynamics", dynamicsObj(2, 25, 10)],
    ["dualBrush", objcItem("dualBrush", [
      ["useDualBrush", boolItem(true)],
      ["Flip", boolItem(false)],
      ["BlnM", enumItem("BlnM", "Mltp")],
      ["Spcn", untF("#Prc", 30)],
      ["Cnt ", longItem(2)],
      ["useScatter", boolItem(true)],
      ["Brsh", objcItem("computedBrush", [
        ["Dmtr", untF("#Pxl", 160)],
        ["Hrdn", untF("#Prc", 40)],
        ["Rndn", untF("#Prc", 80)],
        ["Spcn", untF("#Prc", 30)],
      ])],
    ])],
    ["useColorDynamics", boolItem(true)],
    ["clVr", dynamicsObj(2, 35, 15)],
    ["H   ", untF("#Prc", 20)],
    ["Strt", untF("#Prc", 30)],
    ["Brgh", untF("#Prc", 15)],
    ["purity", untF("#Prc", 10)],
    ["colorDynamicsPerTip", boolItem(true)],
    ["usePaintDynamics", boolItem(true)],
    ["opVr", dynamicsObj(2, 12, 20)],
    ["prVr", dynamicsObj(2, 8, 30)],
    ["wtVr", dynamicsObj(2, 5, 10)],
    ["mxVr", dynamicsObj(2, 5, 15)],
    ["useBrushPose", boolItem(true)],
    ["overridePoseAngle", boolItem(true)],
    ["overridePoseTiltX", boolItem(true)],
    ["overridePoseTiltY", boolItem(true)],
    ["overridePosePressure", boolItem(true)],
    ["brushPosePressure", untF("#Prc", 65)],
    ["brushPoseTiltX", longItem(25)],
    ["brushPoseTiltY", longItem(-10)],
    ["brushPoseAngle", longItem(45)],
  ]);

  const descRoot = [
    ...u32(16),
    ...descObj("null", [
      ["Brsh", listItem([brushDesc])],
    ]),
  ];

  return Uint8Array.from([
    ...u16(version),
    ...u16(subversion),
    ...section8bim("samp", sampRec),
    ...section8bim("desc", descRoot),
  ]);
}

describe("ABR v6/v7/v9/v10 8BIM container parser (Photopea parity)", () => {
  it("decodes v6.2 PackBits RLE 512px sampled tips with R8 MIP pyramid and all Photopea descriptors", async () => {
    const bytes = buildSyntheticAbrV6(6, 2, 512, 512, 1);
    const scanned = importAbr(bytes);
    expect(scanned.version).toBe(6);
    expect(scanned.subversion).toBe(2);
    expect(scanned.sectionKeys).toEqual(["samp", "desc"]);

    const result = await importAbrV6(bytes);

    expect(result.version).toBe(6);
    expect(result.subversion).toBe(2);
    expect(result.sectionKeys).toEqual(["samp", "desc"]);
    expect(result.samples).toHaveLength(1);

    const tip = result.samples![0]!;
    expect(tip.id).toBe("tip-guid-512");
    expect(tip.width).toBe(512);
    expect(tip.height).toBe(512);
    expect(tip.pyramid.size).toBe(512);
    expect(tip.pyramid.documentSize).toBe(64);
    expect(tip.pyramid.mipLevels.map((lvl) => lvl.size)).toEqual([512, 256, 128, 64]);
    expect(tip.alpha[256 * 512 + 256]).toBe(255);

    expect(result.brushes).toHaveLength(1);
    const brush = result.brushes[0] as AbrV6DescriptorBrush;
    expect(brush.kind).toBe("v6-descriptor");
    expect(brush.name).toBe("Photopea Parity Oil");
    expect(brush.diameterPx).toBe(320);
    expect(brush.wetEdges).toBe(true);
    expect(brush.noise).toBe(true);
    expect(brush.dualBrush).toMatchObject({
      enabled: true,
      blendMode: "multiply",
      diameterPx: 160,
    });
    expect(brush.texture).toMatchObject({
      id: "canvas-grain-01",
      blendMode: "height",
      depth: 0.82,
      scale: 1.5,
      invert: true,
      textureEachTip: true,
    });
    expect(brush.colorDynamics).toMatchObject({
      hue: 0.2,
      saturation: 0.3,
      brightness: 0.15,
      perTip: true,
    });
    expect(brush.scatter).toMatchObject({ count: 3, bothAxes: true });
    expect(brush.brushPose).toMatchObject({
      overrideAngle: true,
      overrideTiltX: true,
      overridePressure: true,
      pressure: 0.65,
      tiltX: 25,
      tiltY: -10,
      angle: 45,
    });
    expect(brush.opacityDynamics).toMatchObject({ control: "pen pressure", minimum: 0.2 });
    expect(brush.flowDynamics).toMatchObject({ control: "pen pressure", minimum: 0.3 });
  });

  it("supports v7, v9, and v10 headers (including subversion 1 and raw 8-bit tips)", async () => {
    for (const version of [7, 9, 10] as const) {
      const bytes = buildSyntheticAbrV6(version, 1, 32, 32, 0);
      const parsed = await importAbrV6(bytes);
      expect(parsed.version).toBe(version);
      expect(parsed.subversion).toBe(1);
      expect(parsed.samples).toHaveLength(1);
      expect(parsed.brushes).toHaveLength(1);
    }
  });

  it("retains explicit unsupported-version gating on 4-byte stubs and unknown versions", () => {
    expect(() => importAbr(new Uint8Array([0, 6, 0, 2]))).toThrowError(AbrParseError);
    expect(() => importAbr(new Uint8Array([0, 8, 0, 2, 0x38, 0x42, 0x49, 0x4d]))).toThrowError(AbrParseError);
  });

  it("throws truncated on cut-off v6 8BIM sections", () => {
    const valid = buildSyntheticAbrV6(6, 2, 16, 16, 0);
    let caught: unknown;
    try {
      importAbr(valid.slice(0, 24));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AbrParseError);
    expect((caught as AbrParseError).code).toBe("truncated");
  });
});
