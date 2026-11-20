#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifySealReissuanceRecordJson } from "./verify-seal-reissuance-cli.mjs";

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function computeBatchDigest(payload) {
  return fnv1aHex(
    JSON.stringify({
      batchSchemaVersion: payload.batchSchemaVersion,
      totalCount: payload.totalCount,
      unchangedActiveCount: payload.unchangedActiveCount,
      reissuedCount: payload.reissuedCount,
      unresolvedCount: payload.unresolvedCount,
      reissuedChainHashes: payload.reissuedRecords.map((r) => ({
        episodeKey: r.episodeKey,
        reissuanceChainHash: r.record.reissuanceChainHash,
      })),
      executedAtIso: payload.executedAtIso,
    }),
  );
}

/**
 * 스튜디오·레이블 단위 포트폴리오 배치 재발급 결과 JSON의 개별 재발급 서명과
 * 통합 배치 무결성 해시(batchReissuanceDigestHash)를 무의존성으로 검증한다.
 */
export function verifyPortfolioBatchReissuanceJson(rawJson, options = {}) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 포트폴리오 배치 재발급 JSON이 아닙니다." };
  }

  if (
    !payload ||
    payload.batchSchemaVersion !== 1 ||
    !Array.isArray(payload.reissuedRecords) ||
    !Array.isArray(payload.unresolvedRecords) ||
    typeof payload.batchReissuanceDigestHash !== "string"
  ) {
    return {
      ok: false,
      summary: "필수 필드(batchSchemaVersion, reissuedRecords, unresolvedRecords, batchReissuanceDigestHash)가 누락되었습니다.",
    };
  }

  if (!options.allowPartial && payload.unresolvedCount > 0) {
    return {
      ok: false,
      unresolvedCount: payload.unresolvedCount,
      summary: `미해결 회차 ${payload.unresolvedCount}건이 남아 있어 배치 승인이 차단되었습니다.`,
    };
  }

  for (const item of payload.reissuedRecords) {
    const check = verifySealReissuanceRecordJson(JSON.stringify(item.record));
    if (!check.ok) {
      return {
        ok: false,
        failedEpisodeKey: item.episodeKey,
        summary: `개별 재발급 검증 실패 (${item.episodeKey}): ${check.summary}`,
      };
    }
  }

  const expectedBatchDigest = computeBatchDigest(payload);
  if (payload.batchReissuanceDigestHash !== expectedBatchDigest) {
    return {
      ok: false,
      expectedBatchDigest,
      actualBatchDigest: payload.batchReissuanceDigestHash,
      summary: `배치 무결성 해시 위변조 감지 (기대: ${expectedBatchDigest}, 실제: ${payload.batchReissuanceDigestHash})`,
    };
  }

  return {
    ok: true,
    reissuedCount: payload.reissuedCount,
    batchReissuanceDigestHash: payload.batchReissuanceDigestHash,
    summary: `포트폴리오 배치 재발급 검증 통과 (${payload.reissuedCount}/${payload.totalCount}화 재발급 · ${payload.batchReissuanceDigestHash})`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const allowPartial = args.includes("--allow-partial");
  const targetPath = args.find((a) => !a.startsWith("--"));
  if (!targetPath) {
    console.error(
      "Usage: node scripts/verify-portfolio-batch-reissuance-cli.mjs <batch-reissuance.json> [--allow-partial] [--json]",
    );
    process.exit(2);
  }
  const result = verifyPortfolioBatchReissuanceJson(readFileSync(targetPath, "utf8"), {
    allowPartial,
  });
  console.log(asJson ? JSON.stringify(result, null, 2) : result.summary);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
