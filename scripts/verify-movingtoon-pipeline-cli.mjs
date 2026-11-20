#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Waves 50–59: 무빙툰 마스터 납품 패키지(오디오 스템 권리·WCAG 자막·모바일 예산) 무의존성 독립 CLI.
 */
export function verifyMovingToonPipelineJson(rawJson) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 무빙툰 파이프라인 JSON이 아닙니다." };
  }
  if (!payload || !Array.isArray(payload.audioStems) || !Array.isArray(payload.keyframes)) {
    return { ok: false, summary: "필수 필드(keyframes, audioStems)가 누락되었습니다." };
  }
  const uncleared = payload.audioStems.filter((s) => !s.licenseCleared);
  if (uncleared.length > 0) {
    return { ok: false, summary: `미승인 오디오 스템 ${uncleared.length}건 감지` };
  }
  if (!payload.captionsIncluded || payload.bundleSizeMb > payload.maxMobileBudgetMb) {
    return { ok: false, summary: "자막 누락 또는 모바일 데이터 예산 초과" };
  }
  return {
    ok: true,
    summary: `무빙툰 마스터 파이프라인 검증 통과 (키프레임 ${payload.keyframes.length}건 · 스템 ${payload.audioStems.length}건)`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/verify-movingtoon-pipeline-cli.mjs <movingtoon.json>");
    process.exit(2);
  }
  const res = verifyMovingToonPipelineJson(readFileSync(target, "utf8"));
  console.log(res.summary);
  if (!res.ok) process.exitCode = 1;
}
