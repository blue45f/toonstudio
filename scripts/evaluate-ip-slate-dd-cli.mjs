#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RESTRICTED_LICENSES = new Set(["CC-BY-NC", "GPL-3.0"]);

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 슬레이트 후보 작품 배열 JSON을 입력받아 저작권 보류작 자동 제외,
 * 집중도 상한 기반 분산 자본 배분, 펀드 DD 해시를 무의존성으로 산출하는 CLI 엔진.
 */
export function evaluateSlateDdFromJson(rawJson) {
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: "유효한 슬레이트 입력 JSON이 아닙니다." };
  }

  const fundName = typeof payload.fundName === "string" ? payload.fundName : "ToonStudio IP Slate";
  const targetSlateBudgetKrw = Number.isFinite(payload.targetSlateBudgetKrw)
    ? Math.max(0, Math.round(payload.targetSlateBudgetKrw))
    : 10_000_000;
  const maxConcentrationPercent = Number.isFinite(payload.maxSingleTitleConcentrationPercent)
    ? payload.maxSingleTitleConcentrationPercent
    : 50;
  const submissions = Array.isArray(payload.submissions) ? payload.submissions : [];

  const maxPerTitleKrw = Math.floor((targetSlateBudgetKrw * maxConcentrationPercent) / 100);
  let remainingBudget = targetSlateBudgetKrw;
  let rightsBlockedCount = 0;
  const allocations = [];

  for (const sub of submissions) {
    const rightsBom = Array.isArray(sub.pack?.rightsBom) ? sub.pack.rightsBom : [];
    const blocked = rightsBom.some((entry) => RESTRICTED_LICENSES.has(entry.license));
    if (blocked) {
      rightsBlockedCount += 1;
      continue;
    }
    const epCount = Number.isInteger(sub.episodeCount) && sub.episodeCount > 0 ? sub.episodeCount : 3;
    const fee = Number.isFinite(sub.proposedEpisodeFeeKrw) ? sub.proposedEpisodeFeeKrw : 2_000_000;
    const limit = epCount >= 3 ? Math.min(50_000_000, Math.round(fee * 3)) : Math.min(15_000_000, Math.round(fee * 1.5));
    const allocatedCapitalKrw = Math.max(0, Math.min(limit, maxPerTitleKrw, remainingBudget));
    remainingBudget -= allocatedCapitalKrw;
    allocations.push({
      submissionId: sub.submissionId ?? "SUB",
      seriesTitle: sub.seriesTitle ?? "Untitled",
      approvedAdvanceLimitKrw: limit,
      allocatedCapitalKrw,
    });
  }

  const totalAllocatedCapitalKrw = allocations.reduce((s, a) => s + a.allocatedCapitalKrw, 0);
  const cleanRatioPercent =
    submissions.length > 0
      ? Math.round(((submissions.length - rightsBlockedCount) / submissions.length) * 100)
      : 0;
  const decision =
    totalAllocatedCapitalKrw > 0 && cleanRatioPercent >= 60 ? "investable" : "rejected";

  const ddPackageHash = fnv1aHex(
    JSON.stringify({ fundName, decision, totalAllocatedCapitalKrw, allocations }),
  );

  return {
    ok: decision === "investable",
    fundName,
    decision,
    totalSubmissions: submissions.length,
    rightsBlockedCount,
    cleanRatioPercent,
    targetSlateBudgetKrw,
    totalAllocatedCapitalKrw,
    allocations,
    ddPackageHash,
    summary: `${fundName} · ${decision.toUpperCase()} · 클린율 ${cleanRatioPercent}% · 배정 ${totalAllocatedCapitalKrw.toLocaleString("ko-KR")}원 (${ddPackageHash})`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const filePath = args.find((a) => !a.startsWith("--"));
  if (!filePath) {
    console.error("Usage: node scripts/evaluate-ip-slate-dd-cli.mjs <slate-input.json> [--json]");
    process.exit(2);
  }
  const result = evaluateSlateDdFromJson(readFileSync(filePath, "utf8"));
  console.log(asJson ? JSON.stringify(result, null, 2) : result.summary ?? result.error);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
