#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RESTRICTED_LICENSES = new Set(["CC-BY-NC", "GPL-3.0"]);
const VALID_LICENSES = new Set(["CC0", "MIT", "COMMERCIAL", "CC-BY-NC", "GPL-3.0"]);

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 외부 편집자 · 플랫폼 담당자 · CI 파이프라인에서 `rights-bom-receipt.json` 파일을
 * 독립 검증하는 zero-dependency 검증기.
 */
export function verifyRightsBomReceiptJson(rawReceiptJson, rawPackJson = null) {
  let receipt;
  try {
    receipt = JSON.parse(rawReceiptJson);
  } catch {
    return {
      ok: false,
      validFormat: false,
      clearedForCommercialExport: false,
      integrityVerified: null,
      summary: "JSON 파싱 실패: 올바른 rights-bom-receipt.json 파일이 아닙니다.",
    };
  }

  if (
    !receipt ||
    typeof receipt !== "object" ||
    receipt.receiptSchemaVersion !== 1 ||
    typeof receipt.packId !== "string" ||
    typeof receipt.packName !== "string" ||
    typeof receipt.integrityHash !== "string" ||
    !/^fnv1a-[0-9a-f]{8}$/.test(receipt.integrityHash) ||
    !Array.isArray(receipt.assets) ||
    !Array.isArray(receipt.blockedLicenses)
  ) {
    return {
      ok: false,
      validFormat: false,
      clearedForCommercialExport: false,
      integrityVerified: null,
      summary: "스키마 불일치: receiptSchemaVersion: 1 필수 필드가 누락되었습니다.",
    };
  }

  for (const asset of receipt.assets) {
    if (!asset || typeof asset.license !== "string" || !VALID_LICENSES.has(asset.license)) {
      return {
        ok: false,
        validFormat: false,
        clearedForCommercialExport: false,
        integrityVerified: null,
        summary: "알 수 없는 라이선스 코드가 포함되어 있습니다.",
      };
    }
  }

  let integrityVerified = null;
  if (rawPackJson !== null) {
    try {
      const pack = JSON.parse(rawPackJson);
      const assets = Array.isArray(pack.rightsBom)
        ? pack.rightsBom.map((entry) => ({
            assetLabel: entry.assetLabel,
            license: entry.license,
            commercialStatus: RESTRICTED_LICENSES.has(entry.license) ? "blocked" : "cleared",
          }))
        : [];
      const cleared = !assets.some((entry) => entry.commercialStatus === "blocked");
      const canonical = JSON.stringify({
        packId: pack.id,
        packName: pack.name,
        platformId: pack.platformId,
        clearedForCommercialExport: cleared,
        assets,
      });
      integrityVerified = fnv1aHex(canonical) === receipt.integrityHash;
    } catch {
      integrityVerified = false;
    }
  }

  const hasBlocked =
    !receipt.clearedForCommercialExport ||
    receipt.blockedLicenses.length > 0 ||
    receipt.assets.some((asset) => RESTRICTED_LICENSES.has(asset.license));

  if (integrityVerified === false) {
    return {
      ok: false,
      validFormat: true,
      clearedForCommercialExport: false,
      integrityVerified: false,
      summary: "무결성 해시 불일치: 발급 이후 팩 또는 라이선스가 변조되었습니다.",
    };
  }

  if (hasBlocked) {
    return {
      ok: false,
      validFormat: true,
      clearedForCommercialExport: false,
      integrityVerified,
      summary: `상업 연재 제한 라이선스 감지 (${receipt.blockedLicenses.join(", ")})`,
    };
  }

  return {
    ok: true,
    validFormat: true,
    clearedForCommercialExport: true,
    integrityVerified,
    summary: `상업 연재 클린 검증 통과 (${receipt.packName} · ${receipt.integrityHash})`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const packFlagIdx = args.indexOf("--pack");
  const packPath = packFlagIdx !== -1 ? args[packFlagIdx + 1] : null;
  const receiptPath = args.find((arg, idx) => !arg.startsWith("--") && idx !== packFlagIdx + 1);

  if (!receiptPath) {
    console.error("Usage: node scripts/verify-rights-bom-receipt-cli.mjs <receipt.json> [--pack <pack.json>] [--json]");
    process.exit(2);
  }

  const rawReceipt = readFileSync(receiptPath, "utf8");
  const rawPack = packPath ? readFileSync(packPath, "utf8") : null;
  const result = verifyRightsBomReceiptJson(rawReceipt, rawPack);
  console.log(asJson ? JSON.stringify(result, null, 2) : result.summary);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
