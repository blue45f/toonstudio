#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Waves 60–69: BG3D 폴리곤·브러시 잠금·인간 창작 기여도·CRDT 충돌 무의존성 독립 CLI.
 */
export function verifyCreativeLineageJson(rawJson) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 제작 리니지 JSON이 아닙니다." };
  }
  if (!payload || !payload.bg3d) {
    return { ok: false, summary: "필수 필드(bg3d)가 누락되었습니다." };
  }
  if (
    payload.bg3d.triangleCount > 250_000 ||
    payload.bg3d.textureMemoryMb > 256 ||
    !payload.brushPackLocked ||
    (payload.unresolvedCrdtConflicts ?? 0) > 0 ||
    (payload.humanStrokeRatioPercent ?? 0) < 50
  ) {
    return { ok: false, summary: "제작 리니지 사전 게이트 미달 (3D 예산/브러시 잠금/CRDT/창작 기여도 확인 필요)" };
  }
  return {
    ok: true,
    summary: `제작 리니지 게이트 통과 (인간 기여도 ${payload.humanStrokeRatioPercent}%)`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/verify-creative-lineage-cli.mjs <lineage.json>");
    process.exit(2);
  }
  const res = verifyCreativeLineageJson(readFileSync(target, "utf8"));
  console.log(res.summary);
  if (!res.ok) process.exitCode = 1;
}
