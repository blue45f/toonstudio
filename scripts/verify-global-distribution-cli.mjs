#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Waves 40–49: 글로벌 동시연재 배급 게이트(워터마크·SFX 권리·플랫폼 규격·식자 넘침) 무의존성 독립 CLI.
 */
export function verifyGlobalDistributionPlanJson(rawJson) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 글로벌 배급 JSON이 아닙니다." };
  }
  if (!payload || !Array.isArray(payload.targets) || payload.targets.length === 0) {
    return { ok: false, summary: "필수 필드(targets)가 누락되었습니다." };
  }
  if (!payload.watermarkPolicyEnabled || Number.isNaN(Date.parse(payload.simulpubReleaseUtcIso))) {
    return { ok: false, summary: "동시연재 릴리스 시각 또는 워터마크 정책이 미충족되었습니다." };
  }
  const failed = payload.targets.filter(
    (t) =>
      !t.sfxAssetsCleared ||
      !t.platformSpecMatched ||
      (t.bubbleOverflowCount ?? 0) > 0 ||
      (t.gutterPx ?? 0) < 24,
  );
  if (failed.length > 0) {
    return {
      ok: false,
      summary: `글로벌 배급 차단 권역: ${failed.map((f) => f.locale).join(", ")}`,
    };
  }
  return {
    ok: true,
    clearedCount: payload.targets.length,
    summary: `글로벌 동시연재 배급 검증 통과 (${payload.targets.length}개 권역)`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/verify-global-distribution-cli.mjs <plan.json>");
    process.exit(2);
  }
  const res = verifyGlobalDistributionPlanJson(readFileSync(target, "utf8"));
  console.log(res.summary);
  if (!res.ok) process.exitCode = 1;
}
