#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Wave 1000 그랜드 밀레니엄(10 Centuries · 1,000 Waves · WebGPU · 30개국 · 다중 리전 DR) 무의존성 독립 CLI.
 */
export function verifyWave1000MillenniumJson(rawJson) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 Wave 1000 밀레니엄 JSON이 아닙니다." };
  }
  if (
    !payload ||
    (payload.totalWavesVerified ?? 0) < 1000 ||
    !payload.dagAcyclic ||
    (payload.webgpuFrameTimeMs ?? 99) > 16.6 ||
    (payload.supportedLocalesCount ?? 0) < 12 ||
    (payload.activeRegionsCount ?? 0) < 3 ||
    !payload.autoReissuanceEnabled
  ) {
    return { ok: false, summary: "Wave 1000 그랜드 밀레니엄 필수 요건 미충족" };
  }
  return {
    ok: true,
    summary: `Wave 1000 Grand Millennium 검증 통과 (${payload.totalWavesVerified} Waves · ${payload.supportedLocalesCount} Locales · ${payload.activeRegionsCount} Regions)`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/verify-wave1000-millennium-cli.mjs <wave1000.json>");
    process.exit(2);
  }
  const res = verifyWave1000MillenniumJson(readFileSync(target, "utf8"));
  console.log(res.summary);
  if (!res.ok) process.exitCode = 1;
}
