// Fixture tests for scripts/verify-studio-environment-pack.mjs: builds a
// minimal environment pack on disk and checks the verifier accepts a complete
// GLB + Cycles pass pairing and rejects incomplete ones. Run with:
//   node --test scripts/verify-studio-environment-pack.test.mjs

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const verifier = path.resolve(import.meta.dirname, "verify-studio-environment-pack.mjs");
const WIDTH = 8;
const HEIGHT = 6;

function pngBytes(bitDepth) {
  // Signature + IHDR only: the verifier reads dimensions and bit depth from
  // the header, so a full encoder is unnecessary here.
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = 6; // color type RGBA
  const chunk = Buffer.concat([
    Buffer.from([0, 0, 0, 13]),
    Buffer.from("IHDR", "ascii"),
    ihdr,
    Buffer.from([0, 0, 0, 0]),
  ]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk]);
}

async function buildPack({ omitPass = null, sha256Override = null } = {}) {
  const pack = await mkdtemp(path.join(tmpdir(), "env-pack-"));
  const glb = Buffer.from("glTF-fixture-bytes");
  await writeFile(path.join(pack, "scene_a.glb"), glb);
  await mkdir(path.join(pack, "thumbnails"), { recursive: true });
  await writeFile(path.join(pack, "thumbnails", "scene_a.png"), pngBytes(8));
  const files = {};
  for (const [kind, depth] of [["beauty", 8], ["depth", 16], ["normal", 16], ["ao", 8]]) {
    files[kind] = `passes/scene_a/${kind}0001.png`;
    if (kind === omitPass) continue;
    await mkdir(path.join(pack, "passes", "scene_a"), { recursive: true });
    await writeFile(path.join(pack, "passes", "scene_a", `${kind}0001.png`), pngBytes(depth));
  }
  const manifest = {
    schema: "toonstudio.environment-refinement.v6",
    records: [{
      fileName: "scene_a.glb",
      byteSize: glb.length,
      sha256: sha256Override ?? `sha256:${createHash("sha256").update(glb).digest("hex")}`,
      url: "/assets/3d/environments/refined-v6/scene_a.glb",
      thumbnailUrl: "/assets/3d/environments/refined-v6/thumbnails/scene_a.png",
      renderPasses: {
        engine: "CYCLES",
        directory: "passes/scene_a",
        files,
        colorDepth: { beauty: "8", depth: "16", normal: "16", ao: "8" },
        resolution: [WIDTH, HEIGHT],
      },
    }],
  };
  await writeFile(path.join(pack, "manifest.json"), JSON.stringify(manifest, null, 2));
  return pack;
}

function runVerifier(pack) {
  return spawnSync(process.execPath, [verifier, "--pack", pack], { encoding: "utf8" });
}

test("accepts a GLB paired with a complete Cycles pass set", async () => {
  const pack = await buildPack();
  try {
    const result = runVerifier(pack);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout.trim());
    assert.equal(summary.records, 1);
    assert.equal(summary.passSets, 1);
    assert.deepEqual(summary.passesPerSet, ["beauty", "depth", "normal", "ao"]);
  } finally {
    await rm(pack, { recursive: true, force: true });
  }
});

test("rejects a pack whose depth pass file is missing", async () => {
  const pack = await buildPack({ omitPass: "depth" });
  try {
    const result = runVerifier(pack);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /pass depth is missing/);
  } finally {
    await rm(pack, { recursive: true, force: true });
  }
});

test("rejects a pack whose GLB digest does not match the manifest", async () => {
  const pack = await buildPack({ sha256Override: `sha256:${"0".repeat(64)}` });
  try {
    const result = runVerifier(pack);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sha256 mismatch/);
  } finally {
    await rm(pack, { recursive: true, force: true });
  }
});
