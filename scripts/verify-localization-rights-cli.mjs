#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RESTRICTED_LICENSES = new Set(["CC-BY-NC", "GPL-3.0"]);

/**
 * 글로벌 번역·식자 외주 벤더 및 플랫폼 CI에서 현지화 매니페스트 JSON의
 * 식자 폰트·효과음 라이선스, AI 번역 감수 여부, 더빙 동의 여부를 무의존성으로 검증한다.
 */
export function verifyLocalizationManifestJson(rawJson, expectedSourceReceiptHash = null) {
  let manifest;
  try {
    manifest = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 글로벌 현지화 매니페스트 JSON이 아닙니다." };
  }

  if (
    !manifest ||
    manifest.localizationSchemaVersion !== 1 ||
    typeof manifest.sourceReceiptIntegrityHash !== "string" ||
    !Array.isArray(manifest.tracks)
  ) {
    return { ok: false, summary: "localizationSchemaVersion: 1 필수 필드가 누락되었습니다." };
  }

  if (
    expectedSourceReceiptHash &&
    manifest.sourceReceiptIntegrityHash !== expectedSourceReceiptHash
  ) {
    return {
      ok: false,
      summary: "원작 Rights BOM 증명서 해시와 현지화 매니페스트의 원본 해시가 일치하지 않습니다.",
    };
  }

  const blockedLocales = [];
  for (const track of manifest.tracks) {
    const blocked =
      !track.translatorLabel?.trim() ||
      RESTRICTED_LICENSES.has(track.letteringFontLicense) ||
      RESTRICTED_LICENSES.has(track.sfxAssetLicense) ||
      (track.aiTranslationUsed && !track.humanPostEdited) ||
      (track.includesVoiceDubbing && !track.voiceActorConsentVerified);
    if (blocked) {
      blockedLocales.push(track.locale ?? "unknown");
    }
  }

  if (blockedLocales.length > 0) {
    return {
      ok: false,
      blockedLocales,
      summary: `글로벌 배포 보류 로케일 감지: ${blockedLocales.join(", ")}`,
    };
  }

  return {
    ok: true,
    blockedLocales: [],
    summary: `전 로케일(${manifest.tracks.length}개) 글로벌 현지화 저작권 검증 통과 (${manifest.localizationChainHash ?? "verified"})`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const receiptIdx = args.indexOf("--source-hash");
  const expectedHash = receiptIdx !== -1 ? args[receiptIdx + 1] : null;
  const targetPath = args.find((a, i) => !a.startsWith("--") && i !== receiptIdx + 1);
  if (!targetPath) {
    console.error(
      "Usage: node scripts/verify-localization-rights-cli.mjs <localization-manifest.json> [--source-hash fnv1a-...] [--json]",
    );
    process.exit(2);
  }
  const result = verifyLocalizationManifestJson(readFileSync(targetPath, "utf8"), expectedHash);
  console.log(asJson ? JSON.stringify(result, null, 2) : result.summary);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
