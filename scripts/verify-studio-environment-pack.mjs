// Validates a released Studio environment pack: every manifest record must
// pair its GLB (size + SHA-256 verified) and thumbnail with a complete Cycles
// render-pass set (beauty/depth/normal/AO) produced by
// scripts/blender/refine_studio_environments_v6.py. Dependency-free so the CI
// pack-contracts job can run it without a workspace install.
//
// Usage: node scripts/verify-studio-environment-pack.mjs [--pack <dir>]
//        [--allow-missing-passes]
// Exit code 1 with one line per failure when the pack is incomplete.

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const packFlag = args.indexOf("--pack");
const packDir = packFlag >= 0
  ? path.resolve(args[packFlag + 1])
  : path.join(root, "apps/web/public/assets/3d/environments/refined-v6");
const allowMissingPasses = args.includes("--allow-missing-passes");

const RENDER_PASS_KINDS = ["beauty", "depth", "normal", "ao"];
const PASS_BIT_DEPTH = { beauty: 8, depth: 16, normal: 16, ao: 8 };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngHeader(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
  };
}

const failures = [];
const fail = (message) => failures.push(message);

async function requireFile(relative, label) {
  const target = path.join(packDir, relative);
  try {
    const info = await stat(target);
    if (!info.isFile() || info.size === 0) {
      fail(`${label} is empty or not a file: ${relative}`);
      return null;
    }
    return info;
  } catch {
    fail(`${label} is missing: ${relative}`);
    return null;
  }
}

const manifestPath = path.join(packDir, "manifest.json");
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  console.error(`environment pack manifest is missing or invalid JSON: ${manifestPath}`);
  process.exit(1);
}
if (!Array.isArray(manifest.records) || manifest.records.length === 0) {
  console.error("environment pack manifest has no records");
  process.exit(1);
}

let passSets = 0;
for (const record of manifest.records) {
  const label = record.fileName ?? "<unnamed record>";
  const glbInfo = await requireFile(record.fileName, `${label} GLB`);
  if (glbInfo) {
    if (record.byteSize !== glbInfo.size) {
      fail(`${label} byteSize mismatch: manifest ${record.byteSize} != file ${glbInfo.size}`);
    }
    const digest = createHash("sha256").update(await readFile(path.join(packDir, record.fileName))).digest("hex");
    if (record.sha256 !== `sha256:${digest}`) fail(`${label} sha256 mismatch with manifest`);
  }
  const thumbnail = String(record.thumbnailUrl ?? "").split("/").slice(-2).join("/");
  if (thumbnail) await requireFile(thumbnail, `${label} thumbnail`);

  const passes = record.renderPasses;
  if (!passes) {
    if (!allowMissingPasses) fail(`${label} has no renderPasses entry in the manifest`);
    continue;
  }
  if (passes.engine !== "CYCLES") fail(`${label} renderPasses.engine must be CYCLES, got ${passes.engine}`);
  const headers = {};
  for (const kind of RENDER_PASS_KINDS) {
    const relative = passes.files?.[kind];
    if (!relative) {
      fail(`${label} renderPasses.files.${kind} is missing`);
      continue;
    }
    if (!relative.startsWith(`${passes.directory}/`)) {
      fail(`${label} pass ${kind} is outside its pass directory: ${relative}`);
    }
    const info = await requireFile(relative, `${label} pass ${kind}`);
    if (!info) continue;
    const header = readPngHeader(await readFile(path.join(packDir, relative)));
    if (!header) {
      fail(`${label} pass ${kind} is not a PNG: ${relative}`);
      continue;
    }
    if (header.bitDepth !== PASS_BIT_DEPTH[kind]) {
      fail(`${label} pass ${kind} bit depth must be ${PASS_BIT_DEPTH[kind]}, got ${header.bitDepth}`);
    }
    if (Array.isArray(passes.resolution)
      && (header.width !== passes.resolution[0] || header.height !== passes.resolution[1])) {
      fail(`${label} pass ${kind} is ${header.width}x${header.height}, manifest resolution is ${passes.resolution.join("x")}`);
    }
    headers[kind] = header;
  }
  const kinds = Object.keys(headers);
  if (kinds.length > 1) {
    const first = headers[kinds[0]];
    for (const kind of kinds.slice(1)) {
      if (headers[kind].width !== first.width || headers[kind].height !== first.height) {
        fail(`${label} pass dimensions differ: ${kind} ${headers[kind].width}x${headers[kind].height} != ${kinds[0]} ${first.width}x${first.height}`);
      }
    }
  }
  if (kinds.length === RENDER_PASS_KINDS.length) passSets += 1;
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`environment pack validation failed: ${failures.length} problem(s) in ${packDir}`);
  process.exit(1);
}
console.log(JSON.stringify({
  pack: path.relative(root, packDir),
  records: manifest.records.length,
  passSets,
  passesPerSet: RENDER_PASS_KINDS,
}));
