import assert from "node:assert/strict";
import test from "node:test";

import { verifyRightsBomReceiptJson } from "./verify-rights-bom-receipt-cli.mjs";

test("verifyRightsBomReceiptJson validates commercial-cleared receipt and cross-checks pack hash", () => {
  const pack = {
    schemaVersion: 2,
    id: "cli-test-pack",
    name: "CLI 검증 팩",
    platformId: "naver-webtoon",
    rightsBom: [{ assetLabel: "CC0 배경 조명", license: "CC0" }],
  };

  // Compute expected receipt via canonical structure
  const canonical = JSON.stringify({
    packId: pack.id,
    packName: pack.name,
    platformId: pack.platformId,
    clearedForCommercialExport: true,
    assets: [{ assetLabel: "CC0 배경 조명", license: "CC0", commercialStatus: "cleared" }],
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const integrityHash = `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;

  const receipt = {
    receiptSchemaVersion: 1,
    generatedAtIso: "2026-11-19T19:45:00.000Z",
    packId: pack.id,
    packName: pack.name,
    platformId: pack.platformId,
    clearedForCommercialExport: true,
    blockedLicenses: [],
    assets: [{ assetLabel: "CC0 배경 조명", license: "CC0", commercialStatus: "cleared" }],
    integrityHash,
  };

  const pass = verifyRightsBomReceiptJson(JSON.stringify(receipt), JSON.stringify(pack));
  assert.equal(pass.ok, true);
  assert.equal(pass.integrityVerified, true);

  const tampered = verifyRightsBomReceiptJson(
    JSON.stringify(receipt),
    JSON.stringify({ ...pack, name: "변조됨" }),
  );
  assert.equal(tampered.ok, false);
  assert.equal(tampered.integrityVerified, false);
});
