#!/usr/bin/env node
/**
 * verify-creator-bundle-pack-rights.mjs
 *
 * Creator Bundle 팩별 권리 원장(config/creator-bundle-pack-rights.json)을 검증하고 상태를 보여 준다.
 *   1) 원장 스키마·증빙·고유성 검증과 생성기 팩 정의(팩 42·군중 5·보류 14) 완전성 대조 (실패하면 종료 코드 1)
 *   2) 묶음별 allow/hold 개수와, hold 팩이 allow가 되려면 아직 모자란 증빙 종류 요약
 *   3) --library-root를 주면 원장이 기록한 로컬 라이선스 문서(79개 + zip 안 사본)의 sha256을 실물과 다시 대조
 *
 * 읽기 전용이다. 어떤 파일도 쓰지 않고, 팩을 열지(allow) 정하지도 않는다.
 *
 * 사용법 (레포 루트에서 실행):
 *   node scripts/verify-creator-bundle-pack-rights.mjs [--pack-rights <원장 경로>] \
 *     [--library-root <~/3d-asset-library>] [--json]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CATALOG_PACKS, CROWD_PACKS, PENDING_PACKS } from "./generate-creator-bundle-theme-packs.mjs";
import {
  checkLedgerCoversDefs,
  DEFAULT_PACK_RIGHTS_PATH,
  missingEvidenceKinds,
  requiredEvidenceKinds,
  summarizePackRightsLedger,
  validatePackRightsLedger,
  verifyLocalLicenseEvidence,
} from "./lib/creator-bundle-pack-rights.mjs";

const USAGE = "usage: node scripts/verify-creator-bundle-pack-rights.mjs [--pack-rights <path>] [--library-root <dir>] [--json]";

function parseArgs(argv) {
  const options = { packRightsPath: DEFAULT_PACK_RIGHTS_PATH, libraryRoot: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue; // `pnpm run verify:… -- --library-root …` 형태의 맨 `--`
    if (arg === "--pack-rights") options.packRightsPath = resolve(argv[++i] ?? "");
    else if (arg === "--library-root") options.libraryRoot = resolve(argv[++i] ?? "");
    else if (arg === "--json") options.json = true;
    else {
      console.error(`알 수 없는 옵션입니다: ${arg}\n${USAGE}`);
      process.exit(2);
    }
  }
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(options.packRightsPath, "utf8"));
  } catch (error) {
    console.error(`권리 원장을 읽을 수 없습니다 (${options.packRightsPath}): ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  const problems = [
    ...validatePackRightsLedger(ledger),
    // 생성기의 팩 정의(팩 42·군중 5·보류 14)를 원장이 빠짐없이, 같은 묶음으로 덮는지도 본다.
    ...checkLedgerCoversDefs(ledger, { pack: CATALOG_PACKS, crowd: CROWD_PACKS, pending: PENDING_PACKS }),
  ];
  const summary = summarizePackRightsLedger(ledger);
  const holds = (Array.isArray(ledger.packs) ? ledger.packs : [])
    .filter((entry) => entry !== null && typeof entry === "object" && entry.serve !== "allow")
    .map((entry) => ({
      group: entry.group,
      title: entry.title,
      licenseClass: entry.licenseClass,
      reviewRecommendedHold: entry.reviewRecommendedHold === true,
      missing: missingEvidenceKinds(ledger, entry),
    }));
  const evidence = options.libraryRoot
    ? verifyLocalLicenseEvidence({ ledger, libraryRoot: options.libraryRoot })
    : null;
  const failed = problems.length > 0 || (evidence !== null && evidence.mismatches.length > 0);

  if (options.json) {
    console.log(JSON.stringify({ problems, summary, holds, evidence }, null, 2));
  } else {
    console.log(`원장: ${options.packRightsPath}`);
    console.log(`팩 ${summary.total}개 (${Object.entries(summary.byGroup).map(([group, count]) => `${group} ${count}`).join(" · ")}) — allow ${summary.allow} · hold ${summary.hold}`);
    for (const problem of problems.slice(0, 30)) console.log(`  문제: ${problem}`);
    if (problems.length > 30) console.log(`  … 외 ${problems.length - 30}건`);
    for (const hold of holds) {
      // pending 묶음은 미수신이라 serve를 allow로 바꿔도 열리지 않는다(검증기가 거부한다). 편입 뒤에 소유자가 정한다.
      // grant는 열 때 소유자가 채우므로 "증빙 충족"은 열 준비가 끝났다는 뜻이 아니다.
      let ready = "증빙 충족 — 소유자가 grant를 채워 열 수 있음";
      if (hold.group === "pending") ready = "증빙 충족 — 단 미수신(인제스션·CATALOG_PACKS 편입 전)이라 편입한 뒤에야 소유자가 열 수 있음";
      if (requiredEvidenceKinds(hold.licenseClass) === null) ready = "라이선스 분류를 알 수 없어 열 수 없음";
      const need = hold.missing.length === 0 ? ready : `부족: ${hold.missing.join(", ")}`;
      console.log(`  hold [${hold.group}] ${hold.title} (${hold.licenseClass})${hold.reviewRecommendedHold ? " ★검토 권고 hold" : ""} — ${need}`);
    }
    if (evidence) {
      console.log(`로컬 라이선스 문서 재대조: ${evidence.checked}건 중 불일치 ${evidence.mismatches.length}건`);
      for (const mismatch of evidence.mismatches.slice(0, 30)) {
        console.log(`  ${mismatch.reason}: ${mismatch.path}`);
      }
    }
  }
  if (failed) process.exit(1);
}

main(process.argv.slice(2));
