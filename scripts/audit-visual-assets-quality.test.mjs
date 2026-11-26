import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  classify2dAsset,
  classify3dAsset,
  parse3dAssetBuffer,
  parseImageDimensions,
  parseJpegDimensions,
  parsePngDimensions,
  parseSvgMetrics,
  parseWebpDimensions,
  renderAuditMarkdown,
  runVisualAssetAudit,
} from "./audit-visual-assets-quality.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

function makePngHeader(width, height, padBytes = 0) {
  const buf = Buffer.alloc(24 + padBytes);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function makeJpegHeader(width, height) {
  const buf = Buffer.alloc(20);
  buf[0] = 0xff; buf[1] = 0xd8;
  buf[2] = 0xff; buf[3] = 0xc0;
  buf.writeUInt16BE(11, 4);
  buf[6] = 8;
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  return buf;
}

function makeGlb(jsonObj, binPayload = Buffer.alloc(0)) {
  const jsonRaw = Buffer.from(JSON.stringify(jsonObj), "utf8");
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (binPayload.length % 4)) % 4;
  const binChunk = binPayload.length > 0 ? Buffer.concat([binPayload, Buffer.alloc(binPad, 0)]) : Buffer.alloc(0);
  const totalLen = 12 + 8 + jsonChunk.length + (binChunk.length > 0 ? 8 + binChunk.length : 0);
  const out = Buffer.alloc(totalLen);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  if (binChunk.length > 0) {
    const o = 20 + jsonChunk.length;
    out.writeUInt32LE(binChunk.length, o);
    out.writeUInt32LE(0x004e4942, o + 4);
    binChunk.copy(out, o + 8);
  }
  return out;
}

test("parse3dAssetBuffer extracts geometry, transformed bounds, minY, embedded texture dim, and VRM version", () => {
  const png = makePngHeader(1024, 512);
  const glb = makeGlb({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, scale: [1, 0.5, 1], translation: [0, 0.02, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    accessors: [
      { count: 4, min: [-0.5, 0, -0.5], max: [0.5, 2, 0.5] },
      { count: 6 },
    ],
    materials: [{ name: "toon-skin" }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 0, mimeType: "image/png" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: png.length }],
    extensions: { VRMC_vrm: { specVersion: "1.0" } },
  }, png);

  const parsed = parse3dAssetBuffer(glb, ".vrm");
  assert.equal(parsed.parseError, null);
  assert.equal(parsed.vertices, 4);
  assert.equal(parsed.triangles, 2);
  assert.equal(parsed.nodes, 1);
  assert.equal(parsed.materials, 1);
  assert.equal(parsed.textures, 1);
  assert.equal(parsed.maxTextureDim, 1024);
  assert.deepEqual(parsed.bbox, { width: 1, height: 1, depth: 1 });
  assert.equal(parsed.minY, 0.02);
  assert.equal(parsed.vrmVersion, "1.0");

  const bad = parse3dAssetBuffer(Buffer.from("not-a-glb"), ".glb");
  assert.ok(bad.parseError);
});

test("2D image header parsers handle PNG, JPEG, WebP (VP8X/VP8L/VP8), and SVG wireframe detection", () => {
  assert.deepEqual(parsePngDimensions(makePngHeader(800, 600)), { width: 800, height: 600, detectedFormat: "png" });
  assert.deepEqual(parseJpegDimensions(makeJpegHeader(1920, 1080)), { width: 1920, height: 1080, detectedFormat: "jpg" });
  assert.equal(parseImageDimensions(makeJpegHeader(640, 360)).detectedFormat, "jpg");

  const vp8x = Buffer.alloc(30);
  vp8x.write("RIFF", 0, "ascii"); vp8x.write("WEBP", 8, "ascii"); vp8x.write("VP8X", 12, "ascii");
  vp8x[24] = 1439 & 0xff; vp8x[25] = (1439 >> 8) & 0xff; vp8x[26] = 0;
  vp8x[27] = 899 & 0xff; vp8x[28] = (899 >> 8) & 0xff; vp8x[29] = 0;
  assert.deepEqual(parseWebpDimensions(vp8x), { width: 1440, height: 900, detectedFormat: "webp" });

  const vp8l = Buffer.alloc(25);
  vp8l.write("RIFF", 0, "ascii"); vp8l.write("WEBP", 8, "ascii"); vp8l.write("VP8L", 12, "ascii");
  vp8l[20] = 0x2f;
  vp8l.writeUInt32LE(511 | (255 << 14), 21);
  assert.deepEqual(parseWebpDimensions(vp8l), { width: 512, height: 256, detectedFormat: "webp" });

  const wireframe = parseSvgMetrics(`<svg viewBox="0 0 720 560"><rect width="720" height="560"/><path d="M0 0h10"/><path d="M1 1h10"/></svg>`, "studio-scene.svg");
  assert.equal(wireframe.isWireframeScene, true);
  assert.equal(wireframe.shapeCount, 3);
  const icon = parseSvgMetrics(`<svg viewBox="0 0 64 64"><path d="M0 0h10"/><rect width="8" height="8"/></svg>`, "favicon.svg");
  assert.equal(icon.isWireframeScene, false);
});

test("classify3dAsset and classify2dAsset assign deterministic 4-tier heuristic grades", () => {
  const base3d = { ext: ".glb", bytes: 400_000, triangles: 2400, textures: 2, minY: 0, maxTextureDim: 1024, parseError: null, isReferencedInCode: true, refSource: "code-direct", isExactDup: false, isShadowDup: false };
  assert.equal(classify3dAsset({ ...base3d, webPath: "/assets/3d/hero_desk.glb" }).grade, "HERO_KEEP");
  assert.equal(classify3dAsset({ ...base3d, webPath: "/assets/3d/polyhaven.glb", bytes: 12 * 1048576 }).grade, "OPTIMIZE_HEAVY_OR_DUP");
  assert.equal(classify3dAsset({ ...base3d, webPath: "/models/varco3d/shaper-rofan-tiara.glb", bytes: 2900, triangles: 56, textures: 0 }).grade, "UPGRADE_LOW_CRAFT");
  assert.equal(classify3dAsset({ ...base3d, webPath: "/assets/studio/cc0-20260906/assets/kenney-nature/tree.glb" }).grade, "QUARANTINE_OFF_STYLE");
  assert.equal(classify3dAsset({ ...base3d, ext: ".vrm", webPath: "/vrm/CoolBanana.vrm" }).grade, "QUARANTINE_OFF_STYLE");
  assert.equal(classify3dAsset({ ...base3d, webPath: "/assets/3d/orphan.glb", isReferencedInCode: false, refSource: "orphan" }).grade, "QUARANTINE_OFF_STYLE");

  const base2d = { ext: ".webp", bytes: 45_000, width: 1024, height: 1024, detectedFormat: "webp", formatMismatch: false, svg: null, parseError: null, isReferencedInCode: true, refSource: "code-direct", isExactDup: false };
  assert.equal(classify2dAsset({ ...base2d, webPath: "/brand/hero.webp" }).grade, "HERO_KEEP");
  assert.equal(classify2dAsset({ ...base2d, ext: ".png", bytes: 420_000, detectedFormat: "png", webPath: "/brand/huge.png" }).grade, "OPTIMIZE_HEAVY_OR_DUP");
  assert.equal(classify2dAsset({ ...base2d, ext: ".svg", bytes: 5500, width: 720, height: 560, svg: { isWireframeScene: true, shapeCount: 40 }, webPath: "/brand/studio-scene.svg" }).grade, "UPGRADE_LOW_CRAFT");
  assert.equal(classify2dAsset({ ...base2d, webPath: "/assets/virtual-studio/characters-lpc-v1/hero.png" }).grade, "QUARANTINE_OFF_STYLE");
  assert.equal(classify2dAsset({ ...base2d, webPath: "/brand/orphan.webp", isReferencedInCode: false, refSource: "orphan" }).grade, "QUARANTINE_OFF_STYLE");
});

test("header-only asset audit does not claim rendering, topology, rights or reclaimed bytes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "toonstudio-audit-scope-"));
  try {
    const assetDir = path.join(tmp, "apps/web/public/brand");
    fs.mkdirSync(assetDir, { recursive: true });
    const assetPath = path.join(assetDir, "header-only.png");
    const original = makePngHeader(1024, 1024);
    fs.writeFileSync(assetPath, original);
    const audit = runVisualAssetAudit(tmp);
    assert.deepEqual(audit.scope, {
      analysis: "header-json-metadata-heuristics", referenceCheck: "static-literal-and-manifest-scan",
      rendered: false, topologyValidated: false, rightsValidated: false, runtimeReferencesValidated: false,
      assetFilesModified: false, assetFilesDeleted: 0, reclaimedBytes: 0,
      savingsBasis: "candidate-source-bytes-and-unverified-compression-ratios",
    });
    assert.deepEqual(fs.readFileSync(assetPath), original);
    const md = renderAuditMarkdown(audit);
    assert.match(md, /헤더·메타데이터 휴리스틱/);
    assert.match(md, /렌더링·위상·권리 검증을 수행하지 않습니다/);
    assert.match(md, /실제 회수 용량은 0바이트/);
    assert.doesNotMatch(md, /100% 실측|실측 회수|즉시 안전 삭제|무위험 즉시 정리/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("JSON and dry-run CLI preserve the unverified scope and write no report or asset files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "toonstudio-audit-json-"));
  try {
    const output = execFileSync(process.execPath, [path.join(import.meta.dirname, "audit-visual-assets-quality.mjs"), "--root", tmp, "--json"], { encoding: "utf8" });
    const report = JSON.parse(output);
    assert.equal(report.scope?.analysis, "header-json-metadata-heuristics");
    assert.equal(report.scope?.assetFilesModified, false);
    assert.equal(report.scope?.reclaimedBytes, 0);
    assert.equal(report.summary.totalFiles, 0);
    const preview = execFileSync(process.execPath, [path.join(import.meta.dirname, "audit-visual-assets-quality.mjs"), "--root", tmp, "--dry-run"], { encoding: "utf8" });
    assert.match(preview, /렌더·위상·권리는 미검증/);
    assert.match(preview, /실제 회수 용량 0바이트/);
    assert.deepEqual(fs.readdirSync(tmp), []);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("runVisualAssetAudit and renderAuditMarkdown audit a synthetic workspace end-to-end", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "toonstudio-visual-audit-"));
  try {
    fs.mkdirSync(path.join(tmp, "apps/web/src"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "apps/web/public/models/varco3d"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "apps/web/public/brand"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "apps/web/public/assets/virtual-studio/style-packs-v5/ink/objects"), { recursive: true });

    fs.writeFileSync(path.join(tmp, "apps/web/src/index.ts"), [
      `export const A = "/models/varco3d/shaper-rofan-tiara.glb";`,
      `export const B = "/brand/studio-scene.svg";`,
      `export const C = "/brand/dup-a.png";`,
      `const STYLE_TOKEN = "ink";`,
      "export const ROOT = `/assets/virtual-studio/style-packs-v5/${STYLE_TOKEN}/objects`;",
    ].join("\n"));

    const dummyGlb = makeGlb({ asset: { version: "2.0" }, meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ count: 12, min: [0, 0, 0], max: [1, 1, 1] }] });
    fs.writeFileSync(path.join(tmp, "apps/web/public/models/varco3d/shaper-rofan-tiara.glb"), dummyGlb);
    fs.writeFileSync(path.join(tmp, "apps/web/public/brand/studio-scene.svg"), `<svg viewBox="0 0 720 560"><rect width="720" height="560"/><path d="M0 0h100"/></svg>`);
    const bigPng = makePngHeader(1024, 1024, 340_000);
    fs.writeFileSync(path.join(tmp, "apps/web/public/brand/dup-a.png"), bigPng);
    fs.writeFileSync(path.join(tmp, "apps/web/public/brand/dup-b.png"), bigPng);
    fs.writeFileSync(path.join(tmp, "apps/web/public/assets/virtual-studio/style-packs-v5/ink/objects/desk.png"), makePngHeader(256, 256, 1000));
    fs.writeFileSync(path.join(tmp, "apps/web/public/brand/orphan.png"), makePngHeader(256, 256, 500));

    const audit = runVisualAssetAudit(tmp);
    assert.equal(audit.summary.all3d.count, 1);
    assert.equal(audit.summary.all3d.grades.UPGRADE_LOW_CRAFT, 1);
    assert.equal(audit.summary.all2d.count, 5);
    assert.equal(audit.summary.exactDupGroups, 1);
    assert.equal(audit.items2d.find((x) => x.webPath.endsWith("/desk.png")).isReferencedInCode, true);
    assert.equal(audit.items2d.find((x) => x.webPath.endsWith("/orphan.png")).grade, "QUARANTINE_OFF_STYLE");
    assert.ok(audit.summary.estSavingsBytes <= audit.summary.totalBytes);

    const md = renderAuditMarkdown(audit);
    assert.match(md, /## 1\. 전사 에셋 요약/);
    assert.match(md, /shaper-rofan-tiara\.glb/);
    assert.match(md, /studio-scene\.svg/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
