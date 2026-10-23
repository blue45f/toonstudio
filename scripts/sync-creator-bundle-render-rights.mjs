#!/usr/bin/env node
/**
 * sync-creator-bundle-render-rights.mjs
 *
 * 렌더 이미지 전달 경로(bundle-renders-v1)의 매니페스트를 팩별 권리 원장(config/creator-bundle-pack-rights.json)에 대조하고,
 * 원장이 연 팩의 완성 슬롯에 원장 투영 `rights` 블록을 스탬프한다 (판정 규칙은 scripts/lib/creator-bundle-render-rights.mjs).
 *
 *   --check (기본)  쓰기 없이 대조한다. 문제가 하나라도 있으면 종료 코드 1.
 *                   · 닫힌 팩(hold·증빙 부족·원장에 없는 팩)에서 파생한 슬롯이 완성 상태
 *                   · rights 블록이 없거나 원장 투영과 다름, 초안·닫힌 슬롯에 낡은 블록이 남음
 *                   · 전달 대상이 아닌 파일이 공개 폴더에 있음 (이 폴더는 빌드 때 그대로 공개된다)
 *   --write         스탬프로 고칠 수 있는 문제(블록 누락·불일치·낡은 블록)만 고친다. 닫힌 슬롯·고아 파일처럼 스탬프로 풀 수 없는
 *                   문제가 있으면 아무것도 쓰지 않고 종료 코드 1.
 *
 *   --files         공개 폴더의 파일을 어디서 읽을지. git(CI에서 쓰는 모드): 추적 파일의 인덱스 — 스파스 체크아웃에서도 전체가 보이고
 *                   심볼릭 링크를 가려낸다. fs: 디스크 전체(빌드 산출물 점검용). auto(기본): git 작업 트리 안이면 git ∪ fs, 아니면 fs.
 *
 * 팩을 열지(allow) 않고 원장도 고치지 않는다. 이미지 업로드·배포도 하지 않는다.
 *
 * 사용법 (레포 루트에서 실행):
 *   node scripts/sync-creator-bundle-render-rights.mjs [--check | --write] [--pack-rights <원장>] \
 *     [--pack-dir <렌더 팩 폴더>] [--files auto|git|fs] [--json]
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import {
  findRenderFileProblems,
  listRenderPackFiles,
  planRenderManifestRights,
  RENDER_MANIFEST_FILE,
  RENDER_PACK_DIR,
  serializeRenderManifest,
} from "./lib/creator-bundle-render-rights.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "usage: node scripts/sync-creator-bundle-render-rights.mjs [--check | --write] [--pack-rights <path>] [--pack-dir <dir>] [--files auto|git|fs] [--json]";
/** 스탬프만으로 고칠 수 있는 문제 코드. 그 밖(닫힌 슬롯·고아 파일·형식 오류)은 사람이 매니페스트나 폴더를 고쳐야 한다. */
const STAMPABLE_CODES = new Set(["rights-missing", "rights-drift", "rights-stale"]);

function parseArgs(argv) {
  const options = { write: false, packRightsPath: undefined, packDir: resolve(REPO_ROOT, RENDER_PACK_DIR), filesMode: "auto", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue; // `pnpm run … -- --write` 형태의 맨 `--`
    if (arg === "--check") options.write = false;
    else if (arg === "--write") options.write = true;
    else if (arg === "--pack-rights") options.packRightsPath = resolve(argv[++i] ?? "");
    else if (arg === "--pack-dir") options.packDir = resolve(argv[++i] ?? "");
    else if (arg === "--files") options.filesMode = argv[++i] ?? "";
    else if (arg === "--json") options.json = true;
    else {
      console.error(`알 수 없는 옵션입니다: ${arg}\n${USAGE}`);
      process.exit(2);
    }
  }
  if (!["auto", "git", "fs"].includes(options.filesMode)) {
    console.error(`--files는 auto|git|fs 중 하나여야 합니다.\n${USAGE}`);
    process.exit(2);
  }
  return options;
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

function main(argv) {
  const options = parseArgs(argv);
  const manifestPath = join(options.packDir, RENDER_MANIFEST_FILE);
  let ledger;
  try {
    ledger = options.packRightsPath ? loadPackRightsLedger(options.packRightsPath) : loadPackRightsLedger();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`렌더 매니페스트를 읽을 수 없습니다 (${manifestPath}): ${error instanceof Error ? error.message : String(error)}`);
  }

  const plan = planRenderManifestRights(ledger, manifest);
  let listing;
  try {
    listing = listRenderPackFiles(options.packDir, { mode: options.filesMode });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const problems = [
    ...plan.problems,
    ...findRenderFileProblems(plan.slots, listing.files),
    ...listing.irregular.map((file) => ({
      code: "irregular-file",
      slotId: null,
      message: `${file}은(는) 일반 파일이 아닙니다 (심볼릭 링크 등) — 이 폴더에 둘 수 없습니다.`,
    })),
  ];

  let written = false;
  if (options.write) {
    // 스탬프로 풀 수 없는 문제(닫힌 완성 슬롯·고아 파일·형식 오류)가 하나라도 있으면 아무것도 쓰지 않는다.
    if (problems.every((problem) => STAMPABLE_CODES.has(problem.code))) {
      const next = serializeRenderManifest(plan.stamped);
      if (next !== serializeRenderManifest(manifest)) {
        const temporary = `${manifestPath}.tmp-${process.pid}`;
        writeFileSync(temporary, next);
        renameSync(temporary, manifestPath);
        written = true;
      }
      problems.length = 0;
    }
  }

  const summary = { ...plan.summary, files: listing.files.length, source: listing.source, written };
  if (options.json) {
    console.log(JSON.stringify({ problems, summary }, null, 2));
  } else {
    console.log(`렌더 매니페스트: ${manifestPath}`);
    console.log(`슬롯 ${summary.total}개 — 초안 ${summary.draft} · 전달 ${summary.delivered} · 닫힘(완성인데 미개방) ${summary.closed} · 폴더 파일 ${summary.files}개(${summary.source})`);
    for (const problem of problems.slice(0, 40)) console.log(`  문제 [${problem.code}]${problem.slotId ? ` ${problem.slotId}` : ""}: ${problem.message}`);
    if (problems.length > 40) console.log(`  … 외 ${problems.length - 40}건`);
    if (written) console.log("rights 블록을 스탬프했습니다.");
    else if (options.write && problems.length === 0) console.log("스탬프할 변경이 없습니다 (이미 원장과 같습니다).");
  }
  if (problems.length > 0) process.exit(1);
}

main(process.argv.slice(2));
