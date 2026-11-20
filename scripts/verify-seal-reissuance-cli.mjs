#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyReaderTrustSealJson } from "./verify-reader-trust-seal-cli.mjs";

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function computeReissuanceChainHash(record) {
  return fnv1aHex(
    JSON.stringify({
      reissuanceSchemaVersion: record.reissuanceSchemaVersion,
      supersedesSealDigestHash: record.supersedesSealDigestHash,
      resolvedRevocationId: record.resolvedRevocationId,
      remediationProof: record.remediationProof,
      reissuedSealDigestHash: record.reissuedSeal.sealDigestHash,
      reissuedMasterAuditHash: record.reissuedSeal.masterAuditHash,
      reissuedAtIso: record.reissuedAtIso,
    }),
  );
}

/**
 * 철회 또는 만료된 트러스트 배지의 재발급 레코드(seal-reissuance-record.json)에서
 * 대체 에셋 증빙, 신규 배지 서명 해시, 그리고 이전 배지 승계 해시(reissuanceChainHash)를 무의존성으로 검증한다.
 */
export function verifySealReissuanceRecordJson(rawJson, expectedSupersededHash = null) {
  let record;
  try {
    record = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 배지 재발급 레코드 JSON이 아닙니다." };
  }

  if (
    !record ||
    record.reissuanceSchemaVersion !== 1 ||
    typeof record.supersedesSealDigestHash !== "string" ||
    !record.remediationProof ||
    !record.reissuedSeal ||
    typeof record.reissuanceChainHash !== "string"
  ) {
    return {
      ok: false,
      summary: "필수 필드(reissuanceSchemaVersion, supersedesSealDigestHash, remediationProof, reissuedSeal, reissuanceChainHash)가 누락되었습니다.",
    };
  }

  if (
    expectedSupersededHash &&
    record.supersedesSealDigestHash !== expectedSupersededHash
  ) {
    return {
      ok: false,
      summary: "이전 철회 배지 해시(supersedesSealDigestHash)가 기대값과 일치하지 않습니다.",
    };
  }

  if (
    !record.remediationProof.replacementAssetLabel?.trim() ||
    !record.remediationProof.evidenceReferenceId?.trim()
  ) {
    return {
      ok: false,
      summary: "복구 증빙(replacementAssetLabel, evidenceReferenceId)이 비어 있습니다.",
    };
  }

  const sealCheck = verifyReaderTrustSealJson(JSON.stringify(record.reissuedSeal), {
    requireTenStage: false,
  });
  if (!sealCheck.ok) {
    return {
      ok: false,
      summary: `재발급된 신규 배지 검증 실패: ${sealCheck.summary}`,
    };
  }

  if (record.reissuedSeal.sealDigestHash === record.supersedesSealDigestHash) {
    return {
      ok: false,
      summary: "재발급 배지 해시가 기존 철회 배지 해시와 동일합니다.",
    };
  }

  const expectedChainHash = computeReissuanceChainHash(record);
  if (record.reissuanceChainHash !== expectedChainHash) {
    return {
      ok: false,
      summary: `재발급 체인 해시 위변조 감지 (기대: ${expectedChainHash}, 실제: ${record.reissuanceChainHash})`,
    };
  }

  return {
    ok: true,
    reissuedSealDigestHash: record.reissuedSeal.sealDigestHash,
    reissuanceChainHash: record.reissuanceChainHash,
    summary: `트러스트 배지 재발급 레코드 검증 통과 (${record.remediationProof.replacementAssetLabel} · ${record.reissuanceChainHash})`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const prevIdx = args.indexOf("--supersedes");
  const expectedSupersededHash = prevIdx !== -1 ? args[prevIdx + 1] : null;
  const targetPath = args.find((a, i) => !a.startsWith("--") && i !== prevIdx + 1);
  if (!targetPath) {
    console.error(
      "Usage: node scripts/verify-seal-reissuance-cli.mjs <reissuance-record.json> [--supersedes fnv1a-...] [--json]",
    );
    process.exit(2);
  }
  const result = verifySealReissuanceRecordJson(
    readFileSync(targetPath, "utf8"),
    expectedSupersededHash,
  );
  console.log(asJson ? JSON.stringify(result, null, 2) : result.summary);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
