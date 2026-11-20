#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyReaderTrustSealJson } from "./verify-reader-trust-seal-cli.mjs";

/**
 * 원작 Reader Trust Seal의 실시간 철회 원장(Revocation Ledger) 대조 및
 * 2차 파생 IP(무빙툰·굿즈·노블라이즈·영상화) 저작권 승계 적격성을 무의존성으로 검증한다.
 */
export function verifySealRevocationAndDerivativeJson(rawJson, expectedMasterHash = null) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 철회·파생 IP 검증 JSON이 아닙니다." };
  }

  if (!payload || !payload.seal || !Array.isArray(payload.requests)) {
    return {
      ok: false,
      summary: "필수 필드(seal, requests)가 누락되었습니다.",
    };
  }

  const sealCheck = verifyReaderTrustSealJson(JSON.stringify(payload.seal), {
    expectedMasterHash,
  });
  if (!sealCheck.ok) {
    return {
      ok: false,
      summary: `원작 트러스트 배지 검증 실패: ${sealCheck.summary}`,
    };
  }

  const asOfMs = Date.parse(payload.asOfIso ?? new Date().toISOString());
  const revocations = Array.isArray(payload.revocations) ? payload.revocations : [];
  const activeRevocation = revocations.find((entry) => {
    const hashMatch =
      (entry.sealDigestHash && entry.sealDigestHash === payload.seal.sealDigestHash) ||
      (entry.masterAuditHash && entry.masterAuditHash === payload.seal.masterAuditHash);
    if (!hashMatch) return false;
    const revMs = Date.parse(entry.revokedAtIso);
    if (Number.isNaN(revMs) || Number.isNaN(asOfMs)) return true;
    return asOfMs >= revMs;
  });

  if (activeRevocation) {
    return {
      ok: false,
      revoked: true,
      reasonCode: activeRevocation.reasonCode,
      summary: `트러스트 배지 철회 감지(${activeRevocation.reasonCode}): 파생 IP 승계 차단`,
    };
  }

  if (payload.expiresAtIso) {
    const expMs = Date.parse(payload.expiresAtIso);
    if (!Number.isNaN(expMs) && !Number.isNaN(asOfMs) && asOfMs > expMs) {
      return {
        ok: false,
        expired: true,
        summary: `트러스트 배지 유효기간 만료(${payload.expiresAtIso}): 파생 IP 승계 차단`,
      };
    }
  }

  const blockedProjects = [];
  for (const req of payload.requests) {
    if (req.requiresVoiceSynthesis && !payload.seal.voiceConsentVerified) {
      blockedProjects.push(`${req.projectTitle}(성우권 미인증)`);
    } else if (req.medium === "video-adaptation" && payload.seal.level !== "verified-10-stage") {
      blockedProjects.push(`${req.projectTitle}(10단계 완전 인증 필수)`);
    } else if (Array.isArray(req.targetLocales) && req.targetLocales.length > 0 && payload.seal.globalLocalesCount <= 0) {
      blockedProjects.push(`${req.projectTitle}(글로벌 현지화 미검증)`);
    }
  }

  if (blockedProjects.length > 0) {
    return {
      ok: false,
      blockedProjects,
      summary: `파생 IP 승계 차단: ${blockedProjects.join(", ")}`,
    };
  }

  return {
    ok: true,
    clearedCount: payload.requests.length,
    summary: `철회 원장 클린 및 파생 IP ${payload.requests.length}건 승계 통과 (${payload.seal.sealDigestHash})`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const hashIdx = args.indexOf("--master-hash");
  const expectedMasterHash = hashIdx !== -1 ? args[hashIdx + 1] : null;
  const targetPath = args.find((a, i) => !a.startsWith("--") && i !== hashIdx + 1);
  if (!targetPath) {
    console.error(
      "Usage: node scripts/verify-seal-revocation-and-derivative-cli.mjs <payload.json> [--master-hash fnv1a-...] [--json]",
    );
    process.exit(2);
  }
  const result = verifySealRevocationAndDerivativeJson(
    readFileSync(targetPath, "utf8"),
    expectedMasterHash,
  );
  console.log(asJson ? JSON.stringify(result, null, 2) : result.summary);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
