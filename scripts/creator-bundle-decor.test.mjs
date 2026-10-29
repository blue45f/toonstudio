import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import nodeTest from "node:test";
import { fileURLToPath } from "node:url";
import { test as vitestTest } from "vitest";

import { DECOR_PUBLIC_ROOT, DECOR_SELECTION, resolveDecorSources } from "./generate-creator-bundle-decor.mjs";
import { loadPackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import { RENDER_PACK_DIR } from "./lib/creator-bundle-render-rights.mjs";

const test = process.env.VITEST ? vitestTest : nodeTest;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = () => JSON.parse(readFileSync(join(ROOT, RENDER_PACK_DIR, "manifest.json"), "utf8"));
const sha256 = (body) => createHash("sha256").update(body).digest("hex");

test("장식 파생은 원장 CC0 권리·검수 상태·1536 원본 해시가 모두 일치해야 한다", () => {
  const ledger = loadPackRightsLedger();
  assert.equal(resolveDecorSources({ manifest: source(), ledger }).length, 3);
  for (const override of [
    { curationStatus: "draft-pending-render" }, { visualReviewed: false }, { kind: "background" },
    { sha256: "0".repeat(64) }, { sourceModelSha256: null }, { width: 384 },
    { rights: { ...source().assets.find((slot) => slot.id === DECOR_SELECTION[0].sourceId).rights, status: "licensed" } },
  ]) {
    const manifest = source();
    Object.assign(manifest.assets.find((slot) => slot.id === DECOR_SELECTION[0].sourceId), override);
    assert.throws(() => resolveDecorSources({ manifest, ledger }), /장식 원본/u);
  }
  const held = structuredClone(ledger);
  const park = held.packs.find((pack) => pack.id === "cbv1-008-cute-park-pack");
  park.serve = "hold";
  park.holdReason = "evidence-incomplete";
  park.holdLabel = "권리 확인 중인 팩입니다.";
  delete park.grant;
  assert.throws(() => resolveDecorSources({ manifest: source(), ledger: held }), /장식 원본/u);
});

test("공개 장식 3개는 출처·crop 경계·바닥 anchor·WebP 실물 해시와 일치하고 원본을 보존한다", () => {
  const outputRoot = join(ROOT, "apps/web/public", DECOR_PUBLIC_ROOT);
  const manifest = JSON.parse(readFileSync(join(outputRoot, "manifest.json"), "utf8"));
  const sources = resolveDecorSources({ manifest: source(), ledger: loadPackRightsLedger() });
  assert.equal(manifest.schema, "toonstudio.virtual-bundle-decor.v1");
  assert.deepEqual(manifest.recipe, {
    alphaThreshold: 0, bbox: "left-top-right-bottom-exclusive", resized: false,
    format: "lossless-webp", anchor: "bottom-center",
  });
  assert.deepEqual(manifest.assets.map((asset) => asset.id), DECOR_SELECTION.map((asset) => asset.id));
  assert.deepEqual(manifest.assets.map((asset) => asset.trimBbox), [
    [369, 220, 1141, 1293], [166, 294, 1370, 1252], [269, 528, 1267, 1051],
  ]);
  assert.deepEqual(readdirSync(outputRoot).sort(), ["manifest.json", ...manifest.assets.map((asset) => asset.path)].sort());
  for (const [index, asset] of manifest.assets.entries()) {
    const slot = sources[index].slot;
    assert.equal(asset.sourceRenderId, slot.id);
    assert.equal(asset.sourceBodySha256, slot.sha256);
    assert.equal(asset.sourceModelSha256, slot.sourceModelSha256);
    assert.deepEqual(asset.rights, slot.rights);
    assert.deepEqual(asset.license, slot.license);
    assert.equal(asset.sourceImagePath, `/assets/studio/bundle-renders-v1/${slot.path}`);
    assert.deepEqual(asset.sourceSize, [1536, 1536]);
    assert.equal(sha256(readFileSync(sources[index].sourcePath)), asset.sourceBodySha256);
    const [left, top, right, bottom] = asset.trimBbox;
    assert.ok(left >= 0 && top >= 0 && right <= 1536 && bottom <= 1536);
    assert.equal(asset.width, right - left);
    assert.equal(asset.height, bottom - top);
    assert.ok(asset.width < 1536 && asset.height < 1536);
    assert.deepEqual(asset.bottomAnchor, [asset.width / 2, asset.height]);
    const body = readFileSync(join(outputRoot, asset.path));
    assert.equal(body.length, asset.bytes);
    assert.equal(sha256(body), asset.sha256);
    assert.equal(body.subarray(0, 4).toString(), "RIFF");
    assert.equal(body.subarray(8, 16).toString(), "WEBPVP8L");
    const size = body.readUInt32LE(21);
    assert.equal((size & 0x3fff) + 1, asset.width);
    assert.equal(((size >>> 14) & 0x3fff) + 1, asset.height);
  }
});
