#!/usr/bin/env node
/**
 * 시각 회귀 비교 단계 (표준 CLI) — 감사 스크립트들이 캡처한 스크린샷 폴더를
 * 베이스라인 폴더와 odiff 표준 판정(lib/visual-regression-odiff.mjs)으로 비교한다.
 *
 * 사용법:
 *   node scripts/compare-visual-regression.mjs <baselineDir> <actualDir> [diffDir]
 * 환경변수:
 *   VISUAL_MAX_DIFF_PERCENTAGE  허용 픽셀 diff 비율 % (기본 0.1, lib 상수와 동일)
 * 종료 코드: 0=전부 통과, 1=회귀/누락 있음, 2=사용법·입력 오류.
 * 산출: <actualDir>/visual-regression-report.json (이름순 정렬, 시각 필드 없음 — 재현 가능)
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ODIFF_MAX_DIFF_PERCENTAGE,
  compareScreenshotWithOdiff,
  pairScreenshotsByName,
  summarizeVerdicts,
} from "./lib/visual-regression-odiff.mjs";

const [baselineDirArg, actualDirArg, diffDirArg] = process.argv.slice(2);
if (!baselineDirArg || !actualDirArg) {
  console.error("사용법: node scripts/compare-visual-regression.mjs <baselineDir> <actualDir> [diffDir]");
  process.exit(2);
}
const maxDiffPercentage = process.env.VISUAL_MAX_DIFF_PERCENTAGE === undefined
  ? ODIFF_MAX_DIFF_PERCENTAGE
  : Number(process.env.VISUAL_MAX_DIFF_PERCENTAGE);
if (!Number.isFinite(maxDiffPercentage) || maxDiffPercentage < 0 || maxDiffPercentage > 100) {
  console.error(`VISUAL_MAX_DIFF_PERCENTAGE는 0..100 사이여야 합니다: ${process.env.VISUAL_MAX_DIFF_PERCENTAGE}`);
  process.exit(2);
}

const baselineDir = path.resolve(baselineDirArg);
const actualDir = path.resolve(actualDirArg);
const diffDir = diffDirArg ? path.resolve(diffDirArg) : path.join(actualDir, "visual-diff");

async function listPngs(dir) {
  try {
    return (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".png")).sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}

const [baselineNames, actualNames] = await Promise.all([listPngs(baselineDir), listPngs(actualDir)]);
if (baselineNames === null || actualNames === null) {
  console.error(`입력 폴더를 읽지 못했습니다: baseline=${baselineDir} actual=${actualDir}`);
  process.exit(2);
}
await mkdir(diffDir, { recursive: true });

const pairs = pairScreenshotsByName(baselineNames, actualNames, { baselineDir, actualDir, diffDir });
const verdicts = [];
for (const pair of pairs) {
  if (pair.missing) {
    verdicts.push({
      name: pair.name,
      pass: false,
      status: "file-not-exists",
      reason: "file-not-exists",
      diffCount: null,
      diffPercentage: null,
      maxDiffPercentage,
      missingSide: pair.missing,
    });
    continue;
  }
  const verdict = await compareScreenshotWithOdiff(pair.baselinePath, pair.actualPath, pair.diffPath, { maxDiffPercentage });
  // 리포트에 절대경로를 남기지 않는다 — 같은 입력이면 리포트 바이트까지 재현돼야 한다.
  const { baselinePath: _baseline, actualPath: _actual, diffPath: _diff, ...portable } = verdict;
  verdicts.push({ name: pair.name, ...portable });
}

const summary = summarizeVerdicts(verdicts);
const report = { engine: "odiff-bin", maxDiffPercentage, summary, verdicts };
await writeFile(path.join(actualDir, "visual-regression-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(summary));
if (!summary.pass) process.exitCode = 1;
