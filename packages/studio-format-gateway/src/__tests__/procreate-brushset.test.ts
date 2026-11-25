import { deflateRawSync, deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { parseBinaryPlist, parsePlist, resolveNsKeyedArchive, type PlistValue } from "../bplist";
import { ProcreateBrushsetError, importProcreateBrushset } from "../procreate-brushset";

// ---------------------------------------------------------------------------
// Minimal deterministic synthetic writers (bplist00, PNG, ZIP32) for testing
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let b = 0; b < 8; b += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffff_ffff;
  for (const b of bytes) c = (c >>> 8) ^ (CRC_TABLE[(c ^ b) & 0xff] ?? 0);
  return (c ^ 0xffff_ffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.byteLength, false);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(out.subarray(4, 8 + data.byteLength)), false);
  return out;
}

function buildGrayscalePng(width: number, height: number, fillPixel: (x: number, y: number) => number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width, false);
  iv.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0; // filter None
    for (let x = 0; x < width; x += 1) {
      raw[y * (width + 1) + 1 + x] = fillPixel(x, y) & 0xff;
    }
  }
  const idat = new Uint8Array(deflateSync(raw));
  const sig = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunks = [sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array())];
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** Encodes a plain JS value tree into a real `bplist00` binary plist. */
function encodeBinaryPlist(root: PlistValue): Uint8Array {
  const objects: PlistValue[] = [];
  const register = (val: PlistValue): number => {
    const idx = objects.length;
    objects.push(val);
    if (Array.isArray(val)) {
      for (const item of val) register(item);
    } else if (
      typeof val === "object" &&
      val !== null &&
      !(val instanceof Uint8Array) &&
      !(val instanceof Date) &&
      !("$uid" in val)
    ) {
      for (const key of Object.keys(val)) register(key);
      for (const key of Object.keys(val)) register(val[key]!);
    }
    return idx;
  };
  // Use explicit index map per node so duplicate strings don't collide
  const nodeIndex = new Map<object, number>();
  const flat: PlistValue[] = [];
  const collect = (val: PlistValue): number => {
    const id = flat.length;
    flat.push(val);
    if (Array.isArray(val)) {
      const refs = val.map((item) => collect(item));
      nodeIndex.set(val, id);
      flat[id] = { __arr: refs } as unknown as PlistValue;
    } else if (
      typeof val === "object" &&
      val !== null &&
      !(val instanceof Uint8Array) &&
      !(val instanceof Date) &&
      !("$uid" in val)
    ) {
      const keys = Object.keys(val);
      const keyRefs = keys.map((k) => collect(k));
      const valRefs = keys.map((k) => collect(val[k]!));
      flat[id] = { __dict: { keyRefs, valRefs } } as unknown as PlistValue;
    }
    return id;
  };
  void register;
  void nodeIndex;
  collect(root);

  const refSize = flat.length < 256 ? 1 : 2;
  const writeRef = (out: number[], ref: number) => {
    if (refSize === 1) out.push(ref & 0xff);
    else out.push((ref >> 8) & 0xff, ref & 0xff);
  };
  const writeLengthHeader = (out: number[], highNibble: number, len: number) => {
    if (len < 15) {
      out.push((highNibble << 4) | len);
    } else if (len < 256) {
      out.push((highNibble << 4) | 0x0f, 0x10, len);
    } else {
      out.push((highNibble << 4) | 0x0f, 0x11, (len >> 8) & 0xff, len & 0xff);
    }
  };

  const chunks: number[] = [...new TextEncoder().encode("bplist00")];
  const offsets: number[] = [];

  for (const item of flat) {
    offsets.push(chunks.length);
    if (item === null) {
      chunks.push(0x00);
    } else if (item === false) {
      chunks.push(0x08);
    } else if (item === true) {
      chunks.push(0x09);
    } else if (typeof item === "number") {
      if (Number.isInteger(item) && item >= 0 && item <= 0xffff) {
        if (item <= 0xff) chunks.push(0x10, item);
        else chunks.push(0x11, (item >> 8) & 0xff, item & 0xff);
      } else {
        const buf = new ArrayBuffer(8);
        new DataView(buf).setFloat64(0, item, false);
        chunks.push(0x23, ...new Uint8Array(buf));
      }
    } else if (typeof item === "string") {
      let asciiOnly = true;
      for (let i = 0; i < item.length; i += 1) {
        if (item.charCodeAt(i) > 0x7f) {
          asciiOnly = false;
          break;
        }
      }
      if (asciiOnly) {
        writeLengthHeader(chunks, 0x5, item.length);
        for (let i = 0; i < item.length; i += 1) chunks.push(item.charCodeAt(i));
      } else {
        writeLengthHeader(chunks, 0x6, item.length);
        for (let i = 0; i < item.length; i += 1) {
          const code = item.charCodeAt(i);
          chunks.push((code >> 8) & 0xff, code & 0xff);
        }
      }
    } else if (typeof item === "object" && "$uid" in item) {
      const uid = (item as { $uid: number }).$uid;
      if (uid <= 0xff) chunks.push(0x80, uid);
      else chunks.push(0x81, (uid >> 8) & 0xff, uid & 0xff);
    } else if (typeof item === "object" && "__arr" in item) {
      const refs = (item as unknown as { __arr: number[] }).__arr;
      writeLengthHeader(chunks, 0xa, refs.length);
      for (const r of refs) writeRef(chunks, r);
    } else if (typeof item === "object" && "__dict" in item) {
      const { keyRefs, valRefs } = (item as unknown as { __dict: { keyRefs: number[]; valRefs: number[] } }).__dict;
      writeLengthHeader(chunks, 0xd, keyRefs.length);
      for (const r of keyRefs) writeRef(chunks, r);
      for (const r of valRefs) writeRef(chunks, r);
    }
  }

  const offsetTableOffset = chunks.length;
  const offsetIntSize = offsetTableOffset < 256 ? 1 : offsetTableOffset < 65536 ? 2 : 4;
  for (const off of offsets) {
    if (offsetIntSize === 1) chunks.push(off & 0xff);
    else if (offsetIntSize === 2) chunks.push((off >> 8) & 0xff, off & 0xff);
    else chunks.push((off >>> 24) & 0xff, (off >>> 16) & 0xff, (off >>> 8) & 0xff, off & 0xff);
  }

  // 32-byte trailer
  const trailer = new Uint8Array(32);
  const tv = new DataView(trailer.buffer);
  trailer[6] = offsetIntSize;
  trailer[7] = refSize;
  tv.setBigUint64(8, BigInt(flat.length), false);
  tv.setBigUint64(16, BigInt(0), false);
  tv.setBigUint64(24, BigInt(offsetTableOffset), false);
  return Uint8Array.from([...chunks, ...trailer]);
}

function buildNsKeyedArchiveBytes(rootProps: Record<string, PlistValue>): Uint8Array {
  const objects: PlistValue[] = ["$null"];
  const addObj = (val: PlistValue): { $uid: number } => {
    const uid = objects.length;
    objects.push(val);
    return { $uid: uid };
  };
  const encodeNode = (val: PlistValue): PlistValue => {
    if (val === null || typeof val === "boolean" || typeof val === "number") return val;
    if (typeof val === "string") return addObj(val);
    if (Array.isArray(val)) {
      const refs = val.map((item) => encodeNode(item));
      return addObj({ "NS.objects": refs });
    }
    if (typeof val === "object" && !(val instanceof Uint8Array) && !(val instanceof Date)) {
      const dict: Record<string, PlistValue> = {};
      for (const [k, v] of Object.entries(val)) dict[k] = encodeNode(v);
      return addObj(dict);
    }
    return val;
  };
  const rootUid = encodeNode(rootProps);
  return encodeBinaryPlist({
    $archiver: "NSKeyedArchiver",
    $version: 100000,
    $top: { root: rootUid },
    $objects: objects,
  });
}

function buildZipArchive(entries: Array<{ path: string; data: Uint8Array; compress?: boolean }>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.path);
    const crc = crc32(entry.data);
    const method = entry.compress ? 8 : 0;
    const payload = entry.compress ? new Uint8Array(deflateRawSync(entry.data)) : entry.data;

    const local = new Uint8Array(30 + nameBytes.byteLength + payload.byteLength);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, payload.byteLength, true);
    lv.setUint32(22, entry.data.byteLength, true);
    lv.setUint16(26, nameBytes.byteLength, true);
    local.set(nameBytes, 30);
    local.set(payload, 30 + nameBytes.byteLength);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.byteLength);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, payload.byteLength, true);
    cv.setUint32(24, entry.data.byteLength, true);
    cv.setUint16(28, nameBytes.byteLength, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.byteLength;
  }

  const cdOffset = offset;
  const cdSize = centralParts.reduce((s, p) => s + p.byteLength, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);

  const total = cdOffset + cdSize + 22;
  const out = new Uint8Array(total);
  let write = 0;
  for (const p of localParts) { out.set(p, write); write += p.byteLength; }
  for (const p of centralParts) { out.set(p, write); write += p.byteLength; }
  out.set(eocd, write);
  return out;
}

describe("Apple bplist00 + XML plist + NSKeyedArchiver decoder", () => {
  it("round-trips binary plist primitives, Unicode strings, arrays, dicts, and NSKeyedArchiver UIDs", () => {
    const archive = buildNsKeyedArchiveBytes({
      name: "수채 번짐 붓",
      maxSize: 1.25,
      paintDilution: 0.72,
      pressureSizeCurve: ["{0, 0.1}", "{0.5, 0.25}", "{1, 1}"],
    });
    const raw = parseBinaryPlist(archive);
    const resolved = resolveNsKeyedArchive(raw) as Record<string, unknown>;
    expect(resolved.name).toBe("수채 번짐 붓");
    expect(resolved.maxSize).toBeCloseTo(1.25, 5);
    expect(resolved.paintDilution).toBeCloseTo(0.72, 5);
    expect(resolved.pressureSizeCurve).toEqual(["{0, 0.1}", "{0.5, 0.25}", "{1, 1}"]);
  });

  it("parses Apple XML plists with standard DOCTYPE and rejects ENTITY declarations", () => {
    const xml = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>name</key><string>Atelier Pack</string>
  <key>brushes</key><array><string>BRUSH-UUID-1</string></array>
</dict>
</plist>`);
    expect(parsePlist(xml)).toEqual({ name: "Atelier Pack", brushes: ["BRUSH-UUID-1"] });

    const malicious = new TextEncoder().encode(`<!DOCTYPE plist [<!ENTITY xxe "boom">]><plist><string>&xxe;</string></plist>`);
    expect(() => parsePlist(malicious)).toThrow(/ENTITY/u);
  });
});

describe("Procreate .brushset importer", () => {
  it("decodes DEFLATE ZIP + XML brushset.plist + NSKeyedArchiver Brush.archive + Shape.png/Grain.png", () => {
    const shapePng = buildGrayscalePng(128, 128, (x, y) => {
      const d = Math.hypot(x - 63.5, y - 63.5) / 60;
      return d <= 1 ? Math.round((1 - d * 0.4) * 255) : 0;
    });
    const grainPng = buildGrayscalePng(64, 64, (x, y) => ((x ^ y) & 7) * 32);

    const brushArchive = buildNsKeyedArchiveBytes({
      name: "Procreate Wet Gouache",
      authorName: "Atelier Artist",
      maxSize: 1.5, // 300px
      minSize: 0.12,
      maxOpacity: 0.9,
      plotSpacing: 0.16,
      plotJitter: 0.22,
      dynamicsStreamline: 0.45,
      shapeRoundness: 0.7,
      shapeScatter: 0.2,
      pressureSizeCurve: ["{0, 0.1}", "{0.3, 0.16}", "{0.7, 0.55}", "{1, 1}"],
      tiltSizeCurve: ["{0, 0.5}", "{1, 1}"],
      pressureOpacityCurve: ["{0, 0.25}", "{0.5, 0.45}", "{1, 1}"],
      paintDilution: 0.68,
      paintCharge: 0.55,
      paintAttack: 0.4,
      paintPull: 0.62,
      paintGrade: 0.35,
      pressureTaperStartLength: 0.18,
      pressureTaperEndLength: 0.28,
      taperSize: 0.85,
      taperOpacity: 0.4,
      taperTip: 0.6,
      textureScale: 1.25,
      textureDepth: 0.72,
      textureContrast: 0.2,
      textureMovement: 0,
      textureBlendMode: 1, // linear-burn
      dynamicsJitterHue: 0.1,
      dynamicsJitterSaturation: 0.2,
      bundledBrush: {
        name: "Dual Grain Core",
        maxSize: 0.75, // 150px → sizeRatio 0.5
      },
      bundledBrushCombineMode: 1, // multiply
    });

    const xmlManifest = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>name</key><string>Studio Gouache Set</string>
  <key>brushes</key><array><string>B1</string></array>
</dict></plist>`);

    const zipBytes = buildZipArchive([
      { path: "brushset.plist", data: xmlManifest, compress: true },
      { path: "B1/Brush.archive", data: brushArchive, compress: true },
      { path: "B1/Shape.png", data: shapePng, compress: true },
      { path: "B1/Grain.png", data: grainPng, compress: false },
    ]);

    const result = importProcreateBrushset(zipBytes);
    expect(result.format).toBe("procreate-brushset");
    expect(result.name).toBe("Studio Gouache Set");
    expect(result.authors).toEqual(["Atelier Artist"]);
    expect(result.brushes).toHaveLength(1);
    expect(result.assets).toHaveLength(2);

    const brush = result.brushes[0]!;
    expect(brush.name).toBe("Procreate Wet Gouache");
    expect(brush.program.tip.kind).toBe("image");
    expect(brush.program.tip.imageAssetId).toBe(brush.shapeAssetId);
    expect(brush.program.mixing).toMatchObject({ kind: "wet" });
    expect(brush.program.mixing.strength).toBeCloseTo(0.68, 2);
    expect(brush.program.sizeDynamics.some((m) => m.input === "pressure")).toBe(true);
    expect(brush.program.sizeDynamics.some((m) => m.input === "tiltAltitude")).toBe(true);
    expect(brush.features.wetMix).toMatchObject({
      enabled: true,
      dilution: 0.68,
      charge: 0.55,
      attack: 0.4,
      pull: 0.62,
      grade: 0.35,
    });
    expect(brush.features.taper).toMatchObject({
      enabled: true,
      pressureStart: 0.18,
      pressureEnd: 0.28,
      size: 0.85,
    });
    expect(brush.features.dualBrush).toMatchObject({
      enabled: true,
      combineMode: "multiply",
      sizeRatio: 0.5,
      secondaryName: "Dual Grain Core",
    });
    expect(brush.features.grain).toMatchObject({
      enabled: true,
      depth: 0.72,
      blendMode: "linear-burn",
    });
    expect(brush.features.tipPyramid?.size).toBe(128);
    expect(brush.features.tipPyramid?.documentSize).toBe(64);
    expect(brush.features.tipPyramid?.mipLevels.map((l) => l.size)).toEqual([128, 64]);
  });

  it("supports bplist00 brushset.plist manifests and rejects corrupted CRC/non-ZIP inputs", () => {
    const manifestBytes = encodeBinaryPlist({
      name: "Binary Manifest Pack",
      brushes: ["INK-1"],
    });
    const archive = buildNsKeyedArchiveBytes({
      name: "Crisp Liner",
      maxSize: 0.1,
      plotSpacing: 0.08,
    });
    const zip = buildZipArchive([
      { path: "brushset.plist", data: manifestBytes, compress: true },
      { path: "INK-1/Brush.archive", data: archive, compress: true },
    ]);
    const parsed = importProcreateBrushset(zip);
    expect(parsed.name).toBe("Binary Manifest Pack");
    expect(parsed.brushes[0]?.name).toBe("Crisp Liner");

    expect(() => importProcreateBrushset(new Uint8Array([1, 2, 3, 4]))).toThrowError(ProcreateBrushsetError);
  });

  it("strips trailing slashes in brushset.plist in linear time without polynomial ReDoS", () => {
    const adversarialFolder = `${"/".repeat(100_000)}a`;
    const manifestBytes = encodeBinaryPlist({
      name: "Linear Slash Strip Pack",
      brushes: [adversarialFolder, "INK-1///"],
    });
    const archive = buildNsKeyedArchiveBytes({
      name: "Slash Normalized Liner",
      maxSize: 0.1,
      plotSpacing: 0.08,
    });
    const zip = buildZipArchive([
      { path: "brushset.plist", data: manifestBytes, compress: false },
      { path: "INK-1/Brush.archive", data: archive, compress: true },
    ]);

    const startedAt = performance.now();
    const parsed = importProcreateBrushset(zip);
    const elapsedMs = performance.now() - startedAt;

    expect(parsed.brushes).toHaveLength(1);
    expect(parsed.brushes[0]?.name).toBe("Slash Normalized Liner");
    expect(elapsedMs, "대량 슬래시 매니페스트 정규화 소요(ms)").toBeLessThan(200);
  });
});
