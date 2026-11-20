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

function distributeKrwExact(netAmountKrw, participants) {
  const raw = participants.map((p, idx) => {
    const exact = (netAmountKrw * p.sharePercent) / 100;
    const floored = Math.floor(exact);
    return { idx, ...p, floored, remainder: exact - floored };
  });
  let remaining = netAmountKrw - raw.reduce((s, x) => s + x.floored, 0);
  const sorted = [...raw].sort((a, b) =>
    b.remainder !== a.remainder ? b.remainder - a.remainder : a.idx - b.idx,
  );
  for (let i = 0; i < sorted.length && remaining > 0; i += 1) {
    sorted[i].floored += 1;
    remaining -= 1;
  }
  return raw.map((item) => ({
    displayName: item.displayName,
    role: item.role,
    sharePercent: item.sharePercent,
    payoutKrw: item.floored,
  }));
}

/**
 * 워크플로우 팩 JSON을 입력받아 상업 클린 여부·1원 오차 없는 정산액·MG 선정산 한도를
 * 외부 의존성 없이 계산하는 독립 CLI 엔진.
 */
export function simulateEpisodeSettlementFromPackJson(rawPackJson, options = {}) {
  const episodeFeeKrw = Number.isFinite(options.episodeFeeKrw) ? options.episodeFeeKrw : 2_000_000;
  const episodeCount = Number.isInteger(options.episodeCount) && options.episodeCount > 0 ? options.episodeCount : 3;
  const platformFeeBps = Number.isInteger(options.platformFeeBps) ? options.platformFeeBps : 500;
  const participants = options.participants ?? [
    { role: "story", displayName: "원작자", sharePercent: 50 },
    { role: "art", displayName: "작화가", sharePercent: 35 },
    { role: "bg3d-assistant", displayName: "3D·배경 어시스턴트", sharePercent: 15 },
  ];

  let pack;
  try {
    pack = JSON.parse(rawPackJson);
  } catch {
    return { ok: false, error: "올바른 Workflow Pack JSON 형식이 아닙니다." };
  }

  const rightsBom = Array.isArray(pack.rightsBom) ? pack.rightsBom : [];
  const blockedLicenses = [
    ...new Set(rightsBom.map((e) => e.license).filter((lic) => RESTRICTED_LICENSES.has(lic))),
  ];
  const clearedForCommercialExport = blockedLicenses.length === 0;

  if (!clearedForCommercialExport) {
    return {
      ok: false,
      packId: pack.id ?? "unknown",
      packName: pack.name ?? "unknown",
      status: "held",
      blockedLicenses,
      approvedAdvanceLimitKrw: 0,
      summary: `상업 연재 제한 라이선스(${blockedLicenses.join(", ")}) 감지로 정산·선정산 보류`,
    };
  }

  const platformFeeKrw = Math.round((episodeFeeKrw * platformFeeBps) / 10_000);
  const netDistributableKrw = Math.max(0, episodeFeeKrw - platformFeeKrw);
  const payouts = distributeKrwExact(netDistributableKrw, participants);
  const reliabilityTier = episodeCount >= 3 ? "tier-a-verified" : "tier-b-provisional";
  const approvedAdvanceLimitKrw =
    reliabilityTier === "tier-a-verified"
      ? Math.min(50_000_000, Math.round(episodeFeeKrw * 3))
      : Math.min(15_000_000, Math.round(episodeFeeKrw * 1.5));

  const simulationHash = fnv1aHex(
    JSON.stringify({
      packId: pack.id,
      episodeFeeKrw,
      episodeCount,
      platformFeeBps,
      payouts,
      approvedAdvanceLimitKrw,
    }),
  );

  return {
    ok: true,
    packId: pack.id,
    packName: pack.name,
    status: "ready-for-release",
    episodeCount,
    episodeFeeKrw,
    platformFeeKrw,
    netDistributableKrw,
    payouts,
    reliabilityTier,
    approvedAdvanceLimitKrw,
    simulationHash,
    summary: `${pack.name} · ${reliabilityTier} · 1화 순정산 ${netDistributableKrw.toLocaleString("ko-KR")}원 · 선정산 한도 ${approvedAdvanceLimitKrw.toLocaleString("ko-KR")}원 (${simulationHash})`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const feeIdx = args.indexOf("--fee");
  const epIdx = args.indexOf("--episodes");
  const packPath = args.find(
    (arg, idx) => !arg.startsWith("--") && idx !== feeIdx + 1 && idx !== epIdx + 1,
  );
  if (!packPath) {
    console.error(
      "Usage: node scripts/simulate-episode-settlement-cli.mjs <pack.json> [--fee 2000000] [--episodes 3] [--json]",
    );
    process.exit(2);
  }
  const result = simulateEpisodeSettlementFromPackJson(readFileSync(packPath, "utf8"), {
    episodeFeeKrw: feeIdx !== -1 ? Number.parseInt(args[feeIdx + 1], 10) : 2_000_000,
    episodeCount: epIdx !== -1 ? Number.parseInt(args[epIdx + 1], 10) : 3,
  });
  console.log(asJson ? JSON.stringify(result, null, 2) : result.summary ?? result.error);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
