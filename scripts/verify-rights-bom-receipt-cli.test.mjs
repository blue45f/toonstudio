import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  formatRightsVerificationSarif,
  verifyRightsBomDirectory,
  verifyRightsBomReceiptJson,
} from "./verify-rights-bom-receipt-cli.mjs";

function makeFnv1a(canonical) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

test("verifyRightsBomReceiptJson validates commercial-cleared receipt and cross-checks pack hash", () => {
  const pack = {
    schemaVersion: 2,
    id: "cli-test-pack",
    name: "CLI 검증 팩",
    platformId: "naver-webtoon",
    rightsBom: [{ assetLabel: "CC0 배경 조명", license: "CC0" }],
  };

  const canonical = JSON.stringify({
    packId: pack.id,
    packName: pack.name,
    platformId: pack.platformId,
    clearedForCommercialExport: true,
    assets: [{ assetLabel: "CC0 배경 조명", license: "CC0", commercialStatus: "cleared" }],
  });

  const receipt = {
    receiptSchemaVersion: 1,
    generatedAtIso: "2026-11-19T19:45:00.000Z",
    packId: pack.id,
    packName: pack.name,
    platformId: pack.platformId,
    clearedForCommercialExport: true,
    blockedLicenses: [],
    assets: [{ assetLabel: "CC0 배경 조명", license: "CC0", commercialStatus: "cleared" }],
    integrityHash: makeFnv1a(canonical),
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
  assert.equal(tampered.ruleId, "rights-bom/hash-mismatch");
});

test("verifyRightsBomDirectory scans a folder and emits SARIF 2.1.0 findings for restricted receipts", () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "toonstudio-rights-cli-"));
  try {
    const cleanReceipt = {
      receiptSchemaVersion: 1,
      generatedAtIso: "2026-11-19T19:50:00.000Z",
      packId: "ep01",
      packName: "1화 클린 팩",
      platformId: "naver-webtoon",
      clearedForCommercialExport: true,
      blockedLicenses: [],
      assets: [{ assetLabel: "CC0 배경", license: "CC0", commercialStatus: "cleared" }],
      integrityHash: "fnv1a-12345678",
    };
    const blockedReceipt = {
      receiptSchemaVersion: 1,
      generatedAtIso: "2026-11-19T19:50:00.000Z",
      packId: "ep02",
      packName: "2화 비상업 포함 팩",
      platformId: "kakao-page",
      clearedForCommercialExport: false,
      blockedLicenses: ["CC-BY-NC"],
      assets: [{ assetLabel: "비상업 소품", license: "CC-BY-NC", commercialStatus: "blocked" }],
      integrityHash: "fnv1a-abcdef01",
    };

    writeFileSync(path.join(tmpDir, "ep01-rights-bom-receipt.json"), JSON.stringify(cleanReceipt));
    writeFileSync(path.join(tmpDir, "ep02-rights-bom-receipt.json"), JSON.stringify(blockedReceipt));

    const batch = verifyRightsBomDirectory(tmpDir);
    assert.equal(batch.ok, false);
    assert.equal(batch.total, 2);
    assert.equal(batch.passed, 1);
    assert.equal(batch.failed, 1);

    const sarif = formatRightsVerificationSarif(batch);
    assert.equal(sarif.version, "2.1.0");
    assert.equal(sarif.runs[0].results.length, 1);
    assert.equal(sarif.runs[0].results[0].ruleId, "rights-bom/restricted-commercial-license");
    assert.equal(
      sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri,
      "ep02-rights-bom-receipt.json",
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
