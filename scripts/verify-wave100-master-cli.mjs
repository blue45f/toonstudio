#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Waves 90–100: EU AI Act·킬스위치·10년 콜드 아카이브·다중 리전 DR·창작자 지속가능성 Wave 100 마스터 CLI.
 */
export function verifyWave100MasterJson(rawJson) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 Wave 100 마스터 JSON이 아닙니다." };
  }
  if (
    !payload ||
    (payload.completedWavesCount ?? 0) < 100 ||
    !payload.euAiActDisclosureReady ||
    !payload.incidentKillSwitchArmed ||
    (payload.coldStorageRetentionYears ?? 0) < 10 ||
    (payload.replicatedRegionsCount ?? 0) < 2 ||
    (payload.creatorWeeklyHours ?? 99) > 58
  ) {
    return {
      ok: false,
      summary: "Wave 100 그랜드 마스터리 필수 요건 미충족",
    };
  }
  return {
    ok: true,
    summary: `Wave 100 Grand Mastery 검증 통과 (리전 ${payload.replicatedRegionsCount} · 보존 ${payload.coldStorageRetentionYears}년)`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/verify-wave100-master-cli.mjs <wave100.json>");
    process.exit(2);
  }
  const res = verifyWave100MasterJson(readFileSync(target, "utf8"));
  console.log(res.summary);
  if (!res.ok) process.exitCode = 1;
}
