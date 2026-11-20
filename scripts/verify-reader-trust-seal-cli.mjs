#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function computeSealDigest(payload) {
  return fnv1aHex(
    JSON.stringify({
      seriesTitle: payload.seriesTitle,
      level: payload.level,
      verifiedStagesCount: payload.verifiedStagesCount,
      totalStagesCount: payload.totalStagesCount,
      commercialAssetsCleared: payload.commercialAssetsCleared,
      aiTrainingOptOut: payload.aiTrainingOptOut,
      voiceConsentVerified: payload.voiceConsentVerified,
      globalLocalesCount: payload.globalLocalesCount,
      masterAuditHash: payload.masterAuditHash,
    }),
  );
}

/**
 * 독자 열람 페이지·웹툰 플랫폼 CMS 배포 파이프라인에서
 * reader-trust-seal.json 페이로드의 서명 해시(sealDigestHash) 위변조 여부와
 * 10단계 완전 인증·상업 에셋 클리어 기준을 무의존성으로 검증한다.
 */
export function verifyReaderTrustSealJson(rawJson, options = {}) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 Reader Trust Seal JSON이 아닙니다." };
  }

  if (
    !payload ||
    payload.sealSchemaVersion !== 1 ||
    typeof payload.seriesTitle !== "string" ||
    typeof payload.level !== "string" ||
    typeof payload.masterAuditHash !== "string" ||
    typeof payload.sealDigestHash !== "string"
  ) {
    return {
      ok: false,
      summary: "필수 필드(sealSchemaVersion, seriesTitle, level, masterAuditHash, sealDigestHash)가 누락되었습니다.",
    };
  }

  const expectedDigest = computeSealDigest(payload);
  if (payload.sealDigestHash !== expectedDigest) {
    return {
      ok: false,
      expectedDigest,
      actualDigest: payload.sealDigestHash,
      summary: `Reader Trust Seal 해시 위변조 감지 (기대: ${expectedDigest}, 실제: ${payload.sealDigestHash})`,
    };
  }

  if (options.expectedMasterHash && payload.masterAuditHash !== options.expectedMasterHash) {
    return {
      ok: false,
      summary: "10단계 마스터 감사 해시(masterAuditHash)가 기준 해시와 일치하지 않습니다.",
    };
  }

  if (options.requireTenStage && payload.level !== "verified-10-stage") {
    return {
      ok: false,
      level: payload.level,
      summary: `10단계 완전 인증 필수 게이트 미달 (현재 등급: ${payload.level})`,
    };
  }

  if (payload.level === "unverified" || !payload.commercialAssetsCleared) {
    return {
      ok: false,
      level: payload.level,
      summary: `상업 연재 미인증 상태입니다 (현재 등급: ${payload.level})`,
    };
  }

  return {
    ok: true,
    level: payload.level,
    sealDigestHash: payload.sealDigestHash,
    summary: `Reader Trust Seal 검증 통과 (${payload.seriesTitle} · ${payload.level} · ${payload.verifiedStagesCount}/${payload.totalStagesCount}단계 · ${payload.sealDigestHash})`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const requireTenStage = args.includes("--require-10-stage");
  const hashIdx = args.indexOf("--master-hash");
  const expectedMasterHash = hashIdx !== -1 ? args[hashIdx + 1] : null;
  const targetPath = args.find((a, i) => !a.startsWith("--") && i !== hashIdx + 1);
  if (!targetPath) {
    console.error(
      "Usage: node scripts/verify-reader-trust-seal-cli.mjs <reader-trust-seal.json> [--master-hash fnv1a-...] [--require-10-stage] [--json]",
    );
    process.exit(2);
  }
  const result = verifyReaderTrustSealJson(readFileSync(targetPath, "utf8"), {
    expectedMasterHash,
    requireTenStage,
  });
  console.log(asJson ? JSON.stringify(result, null, 2) : result.summary);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
