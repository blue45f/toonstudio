#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Waves 70–79: IP 마켓플레이스 수익 워터폴 및 정산 합계(1원 오차 0) 무의존성 독립 CLI.
 */
export function verifyIpMarketplaceSettlementJson(rawJson) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, summary: "유효한 IP 마켓플레이스 정산 JSON이 아닙니다." };
  }
  if (!payload || typeof payload.totalGrossRevenueKrw !== "number") {
    return { ok: false, summary: "필수 필드(totalGrossRevenueKrw)가 누락되었습니다." };
  }
  const sum =
    (payload.advanceRecoupedKrw ?? 0) +
    (payload.creatorPayoutKrw ?? 0) +
    (payload.studioShareKrw ?? 0);
  if (sum !== payload.totalGrossRevenueKrw) {
    return {
      ok: false,
      summary: `정산 합계 불일치 (총액 ${payload.totalGrossRevenueKrw} != 분배합 ${sum})`,
    };
  }
  return {
    ok: true,
    summary: `IP 마켓플레이스 워터폴 1원 정산 검증 통과 (${payload.totalGrossRevenueKrw.toLocaleString("ko-KR")}원)`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/verify-ip-marketplace-cli.mjs <settlement.json>");
    process.exit(2);
  }
  const res = verifyIpMarketplaceSettlementJson(readFileSync(target, "utf8"));
  console.log(res.summary);
  if (!res.ok) process.exitCode = 1;
}
