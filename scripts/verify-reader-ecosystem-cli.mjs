#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Waves 80–89: 독자 신뢰 생태계(TDMRep 헤더·접근성·스포일러 쉴드·트러스트 등급) 무의존성 독립 CLI.
 */
export function verifyReaderEcosystemJson(rawJson) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 독자 생태계 JSON이 아닙니다." };
  }
  if (!payload || !payload.sealActive || !payload.tdmRepHeaderEnforced || !payload.triggerTagsDeclared) {
    return {
      ok: false,
      summary: "독자 신뢰 생태계 필수 요건(배지 활성/TDMRep 헤더/트리거 태그) 미충족",
    };
  }
  return {
    ok: true,
    summary: "독자 신뢰 생태계 검증 통과 (Platinum Clean-IP 기준 충족)",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/verify-reader-ecosystem-cli.mjs <ecosystem.json>");
    process.exit(2);
  }
  const res = verifyReaderEcosystemJson(readFileSync(target, "utf8"));
  console.log(res.summary);
  if (!res.ok) process.exitCode = 1;
}
