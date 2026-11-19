#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RESTRICTED_LICENSES = new Set(["CC-BY-NC", "GPL-3.0"]);
const VALID_LICENSES = new Set(["CC0", "MIT", "COMMERCIAL", "CC-BY-NC", "GPL-3.0"]);
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * PNG 바이너리 버퍼에서 `ToonStudioRightsBOM` tEXt 청크를 추출한다 (zero-dependency).
 */
export function extractPngRightsTextChunk(pngBytes, keyword = "ToonStudioRightsBOM") {
  if (!pngBytes || pngBytes.length < PNG_SIGNATURE.length) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (pngBytes[i] !== PNG_SIGNATURE[i]) return null;
  }

  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= pngBytes.length) {
    const length =
      ((pngBytes[offset] << 24) |
        (pngBytes[offset + 1] << 16) |
        (pngBytes[offset + 2] << 8) |
        pngBytes[offset + 3]) >>>
      0;
    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7],
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > pngBytes.length) break;

    if (type === "tEXt") {
      const data = pngBytes.subarray(dataStart, dataEnd);
      const nullIdx = data.indexOf(0);
      if (nullIdx !== -1) {
        let chunkKey = "";
        for (let i = 0; i < nullIdx; i += 1) {
          chunkKey += String.fromCharCode(data[i]);
        }
        if (chunkKey === keyword) {
          return new TextDecoder().decode(data.subarray(nullIdx + 1));
        }
      }
    }
    if (type === "IEND") break;
    offset = dataEnd + 4;
  }
  return null;
}

/**
 * 내보낸 웹툰 PNG 바이너리 내부의 `ToonStudioRightsBOM` 메타데이터 청크를 직접 검증한다.
 */
export function verifyRightsBomPngBuffer(pngBytes, rawPackJson = null) {
  const embedded = extractPngRightsTextChunk(pngBytes, "ToonStudioRightsBOM");
  if (!embedded) {
    return {
      ok: false,
      validFormat: false,
      clearedForCommercialExport: false,
      integrityVerified: null,
      ruleId: "rights-bom/missing-png-chunk",
      summary: "PNG 내부에서 ToonStudioRightsBOM tEXt 청크를 찾을 수 없습니다.",
    };
  }
  return verifyRightsBomReceiptJson(embedded, rawPackJson);
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
      ruleId: "rights-bom/invalid-json",
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
      ruleId: "rights-bom/invalid-schema",
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
        ruleId: "rights-bom/unknown-license",
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
      ruleId: "rights-bom/hash-mismatch",
      summary: "무결성 해시 불일치: 발급 이후 팩 또는 라이선스가 변조되었습니다.",
    };
  }

  if (hasBlocked) {
    return {
      ok: false,
      validFormat: true,
      clearedForCommercialExport: false,
      integrityVerified,
      ruleId: "rights-bom/restricted-commercial-license",
      summary: `상업 연재 제한 라이선스 감지 (${receipt.blockedLicenses.join(", ")})`,
    };
  }

  return {
    ok: true,
    validFormat: true,
    clearedForCommercialExport: true,
    integrityVerified,
    ruleId: null,
    summary: `상업 연재 클린 검증 통과 (${receipt.packName} · ${receipt.integrityHash})`,
  };
}

/**
 * 에피소드 제출 디렉터리 내 모든 `*rights-bom-receipt*.json` 파일을 일괄 검증한다.
 */
export function verifyRightsBomDirectory(dirPath, rawPackJson = null) {
  const entries = readdirSync(dirPath)
    .filter((name) => {
      const full = path.join(dirPath, name);
      return statSync(full).isFile() && /rights-bom-receipt.*\.json$/i.test(name);
    })
    .sort();

  const items = entries.map((filename) => {
    const filePath = path.join(dirPath, filename);
    const rawReceipt = readFileSync(filePath, "utf8");
    const result = verifyRightsBomReceiptJson(rawReceipt, rawPackJson);
    return {
      file: filename,
      filePath,
      ...result,
    };
  });

  const passed = items.filter((item) => item.ok).length;
  const failed = items.length - passed;

  return {
    ok: items.length > 0 && failed === 0,
    directory: dirPath,
    total: items.length,
    passed,
    failed,
    items,
  };
}

/**
 * GitHub Code Scanning / 외부 CI 파이프라인 연동을 위한 SARIF 2.1.0 리포트를 생성한다.
 */
export function formatRightsVerificationSarif(batchResult) {
  const results = batchResult.items
    .filter((item) => !item.ok)
    .map((item) => ({
      ruleId: item.ruleId ?? "rights-bom/verification-failed",
      level: "error",
      message: { text: item.summary },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: item.file },
          },
        },
      ],
    }));

  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "ToonStudio Rights BOM Verifier",
            version: "3.0.0",
            rules: [
              {
                id: "rights-bom/restricted-commercial-license",
                shortDescription: { text: "상업 연재 제한 라이선스(NC/GPL) 포함" },
              },
              {
                id: "rights-bom/hash-mismatch",
                shortDescription: { text: "Rights BOM 증명서 무결성 해시 불일치" },
              },
              {
                id: "rights-bom/invalid-schema",
                shortDescription: { text: "Rights BOM 증명서 스키마 불일치" },
              },
              {
                id: "rights-bom/missing-png-chunk",
                shortDescription: { text: "PNG 내부 ToonStudioRightsBOM tEXt 청크 누락" },
              },
            ],
          },
        },
        results,
      },
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const asSarif = args.includes("--sarif");
  const packFlagIdx = args.indexOf("--pack");
  const packPath = packFlagIdx !== -1 ? args[packFlagIdx + 1] : null;
  const dirFlagIdx = args.indexOf("--dir");
  const dirPath = dirFlagIdx !== -1 ? args[dirFlagIdx + 1] : null;
  const rawPack = packPath ? readFileSync(packPath, "utf8") : null;

  if (dirPath) {
    const batch = verifyRightsBomDirectory(dirPath, rawPack);
    if (asSarif) {
      console.log(JSON.stringify(formatRightsVerificationSarif(batch), null, 2));
    } else if (asJson) {
      console.log(JSON.stringify(batch, null, 2));
    } else {
      console.log(
        `Rights BOM 디렉터리 검증: 총 ${batch.total}건 (통과 ${batch.passed} / 실패 ${batch.failed})`,
      );
      for (const item of batch.items) {
        console.log(`- [${item.ok ? "PASS" : "FAIL"}] ${item.file}: ${item.summary}`);
      }
    }
    if (!batch.ok) {
      process.exitCode = 1;
    }
  } else {
    const targetPath = args.find(
      (arg, idx) => !arg.startsWith("--") && idx !== packFlagIdx + 1 && idx !== dirFlagIdx + 1,
    );

    if (!targetPath) {
      console.error(
        "Usage: node scripts/verify-rights-bom-receipt-cli.mjs <receipt.json|cut.png> [--pack <pack.json>] [--json|--sarif]\n" +
          "   or: node scripts/verify-rights-bom-receipt-cli.mjs --dir <folder> [--pack <pack.json>] [--json|--sarif]",
      );
      process.exit(2);
    }

    const result = /\.png$/i.test(targetPath)
      ? verifyRightsBomPngBuffer(readFileSync(targetPath), rawPack)
      : verifyRightsBomReceiptJson(readFileSync(targetPath, "utf8"), rawPack);

    if (asSarif) {
      const singleBatch = {
        ok: result.ok,
        directory: path.dirname(targetPath),
        total: 1,
        passed: result.ok ? 1 : 0,
        failed: result.ok ? 0 : 1,
        items: [{ file: path.basename(targetPath), filePath: targetPath, ...result }],
      };
      console.log(JSON.stringify(formatRightsVerificationSarif(singleBatch), null, 2));
    } else {
      console.log(asJson ? JSON.stringify(result, null, 2) : result.summary);
    }
    if (!result.ok) {
      process.exitCode = 1;
    }
  }
}
