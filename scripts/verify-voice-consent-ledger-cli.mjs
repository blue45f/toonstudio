#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 무빙툰·보이스 웹툰 외주 스튜디오 및 플랫폼 CI에서 성우 AI 음성권 원장 JSON의
 * 계약 만료일·허용 로케일·AI 음성 복제 및 학습 재사용 위반 여부를 무의존성으로 검증한다.
 */
export function verifyVoiceConsentLedgerJson(rawJson, expectedReceiptHash = null) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 성우 음성권 원장 JSON이 아닙니다." };
  }

  if (
    !payload ||
    typeof payload.sourceReceiptIntegrityHash !== "string" ||
    !Array.isArray(payload.contracts) ||
    !payload.request
  ) {
    return { ok: false, summary: "필수 필드(contracts, request, sourceReceiptIntegrityHash)가 누락되었습니다." };
  }

  if (expectedReceiptHash && payload.sourceReceiptIntegrityHash !== expectedReceiptHash) {
    return { ok: false, summary: "원작 Rights BOM 증명서 해시와 성우 원장의 원본 해시가 불일치합니다." };
  }

  const releaseTime = Date.parse(payload.request.releaseAtIso);
  const blockedActors = [];
  let totalRoyaltyKrw = 0;

  for (const c of payload.contracts) {
    const expiryTime = Date.parse(c.consentExpiresAtIso);
    const unauthorizedLocale = (payload.request.targetLocales ?? []).some(
      (loc) => !(c.allowedLocales ?? []).includes(loc),
    );
    const expired = Number.isNaN(expiryTime) || (!Number.isNaN(releaseTime) && releaseTime > expiryTime);
    const cloneBlocked = Boolean(payload.request.usesAiVoiceClone && !c.allowAiVoiceClone);
    const trainBlocked = Boolean(
      payload.request.usesModelTrainingReuse && !c.allowModelTrainingReuse,
    );

    if (!c.voiceActorName?.trim() || expired || unauthorizedLocale || cloneBlocked || trainBlocked) {
      blockedActors.push(c.voiceActorName ?? c.contractId ?? "unknown");
    } else {
      totalRoyaltyKrw += Math.max(0, Math.round(c.royaltyPerEpisodeKrw ?? 0));
    }
  }

  if (blockedActors.length > 0) {
    return {
      ok: false,
      blockedActors,
      totalRoyaltyKrw: 0,
      summary: `성우 AI 음성권 위반 감지: ${blockedActors.join(", ")}`,
    };
  }

  return {
    ok: true,
    blockedActors: [],
    totalRoyaltyKrw,
    summary: `성우 AI 음성권(${payload.contracts.length}인) 검증 통과 · 회당 로열티 ${totalRoyaltyKrw.toLocaleString("ko-KR")}원`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const hashIdx = args.indexOf("--source-hash");
  const expectedHash = hashIdx !== -1 ? args[hashIdx + 1] : null;
  const targetPath = args.find((a, i) => !a.startsWith("--") && i !== hashIdx + 1);
  if (!targetPath) {
    console.error(
      "Usage: node scripts/verify-voice-consent-ledger-cli.mjs <voice-ledger.json> [--source-hash fnv1a-...] [--json]",
    );
    process.exit(2);
  }
  const result = verifyVoiceConsentLedgerJson(readFileSync(targetPath, "utf8"), expectedHash);
  console.log(asJson ? JSON.stringify(result, null, 2) : result.summary);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
