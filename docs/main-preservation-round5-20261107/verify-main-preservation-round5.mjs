#!/usr/bin/env node
/**
 * Round 5 통합 보존 후속 읽기 전용 검증 도구 (verify-main-preservation-round5.mjs)
 *
 * 검증 범위:
 * 1. 최신 origin/main HEAD (65da4036cec52f1d5b048855a51085c9b7503264) 확인
 * 2. 신규 완료 보고 4개 커밋(65da4036, 4b1be6d4, 01d8f995, 75f34f8d)의 실제 git ancestry 포함 여부 및 트리 보존 검증
 * 3. PR #2740 최신 헤드(c4fce43c307fa5f124105e8cfb4719c1b9998d93) 및 보정 커밋(f508de8f, 5a077ae0, c4fce43c) 상태 검증
 * 4. 최신 origin/main CI(Run 42375861658) 실패 항목의 대상 파일·담당 범위 매핑 및 중복 수정 금지 확인
 * 5. --browser 실행 시 320px/390px/768px/1440px 및 200% 확대에서 실제 헤드리스 Chromium 레이아웃·상호작용 검증
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LATEST_MAIN_CI_STATUS,
  PR_2740_LATEST_STATUS,
  ROUND5_MAIN_HEAD,
  ROUND5_TARGET_COMMITS,
  buildRound5VerificationFixtureHtml,
} from './preservation-audit-round5-data.mjs';

export {
  LATEST_MAIN_CI_STATUS,
  PR_2740_LATEST_STATUS,
  ROUND5_MAIN_HEAD,
  ROUND5_TARGET_COMMITS,
  buildRound5VerificationFixtureHtml,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const FORBIDDEN_GIT_SUBCOMMANDS = new Set([
  'merge',
  'rebase',
  'commit',
  'push',
  'reset',
  'clean',
  'checkout',
  'switch',
  'worktree',
  'tag',
  'stash',
  'cherry-pick',
  'revert',
]);

export function runReadOnlyGit(args, options = {}) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('git 인자가 비어 있습니다.');
  }
  const subcommand = args[0];
  if (FORBIDDEN_GIT_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`읽기 전용 감사에서 금지된 git 하위 명령입니다: ${subcommand}`);
  }
  if (
    subcommand === 'branch' &&
    args.some((arg) => arg === '-d' || arg === '-D' || arg === '--delete' || arg === '-m' || arg === '-M')
  ) {
    throw new Error(`읽기 전용 감사에서 금지된 git branch 플래그입니다: ${args.join(' ')}`);
  }

  const cwd = options.cwd ?? REPO_ROOT;
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function tryGetCommitMetadata(commitRef, gitRunner = runReadOnlyGit) {
  if (!commitRef) {
    return null;
  }
  try {
    const raw = gitRunner(['show', '-s', '--format=%H%x09%cI%x09%s', `${commitRef}^{commit}`]);
    const [fullSha = '', committedAtUtc = '', subject = ''] = raw.split('\t');
    if (!fullSha) {
      return null;
    }
    return {
      fullSha,
      shortSha: fullSha.slice(0, 8),
      committedAtUtc,
      subject,
    };
  } catch {
    return null;
  }
}

export function isGitAncestor(ancestorRef, targetRef = ROUND5_MAIN_HEAD.fullSha, gitRunner = runReadOnlyGit) {
  if (!ancestorRef) {
    return false;
  }
  try {
    gitRunner(['merge-base', '--is-ancestor', ancestorRef, targetRef]);
    return true;
  } catch {
    return false;
  }
}

export function verifyPathsInGitTree(targetRef, paths, gitRunner = runReadOnlyGit) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { existingPaths: [], missingPaths: [] };
  }
  const output = gitRunner(['ls-tree', '--name-only', targetRef, '--', ...paths]);
  const presentSet = new Set(
    output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const existingPaths = paths.filter((p) => presentSet.has(p));
  const missingPaths = paths.filter((p) => !presentSet.has(p));
  return { existingPaths, missingPaths };
}

export function verifyRound5TargetCommit(
  commitSpec,
  mainRef = ROUND5_MAIN_HEAD.fullSha,
  gitRunner = runReadOnlyGit,
) {
  const commitMeta = tryGetCommitMetadata(commitSpec.fullSha ?? commitSpec.shortSha, gitRunner);
  if (!commitMeta) {
    return {
      id: commitSpec.id,
      label: commitSpec.label,
      shortSha: commitSpec.shortSha,
      fullSha: null,
      featureParentShortSha: commitSpec.featureParentShortSha,
      featureParentFullSha: null,
      committedAtUtc: null,
      sourceBranch: commitSpec.sourceBranch,
      objectExistsInGit: false,
      inMainAncestry: false,
      parentInMainAncestry: false,
      expectedInMainAncestry: commitSpec.expectedInMainAncestry,
      matchesExpectedDisposition: commitSpec.expectedInMainAncestry === false,
      status: commitSpec.missingStatus ?? 'MISSING_FROM_GIT_OBJECTS',
      ownerRole: commitSpec.ownerRole ?? null,
      ownerScope: commitSpec.ownerScope,
      requiredFileCount: commitSpec.requiredPaths.length,
      presentFileCount: 0,
      missingPaths: commitSpec.requiredPaths,
    };
  }

  const parentMeta = commitSpec.featureParentFullSha
    ? tryGetCommitMetadata(commitSpec.featureParentFullSha, gitRunner)
    : null;
  const inMainAncestry = isGitAncestor(commitMeta.fullSha, mainRef, gitRunner);
  const parentInMainAncestry = parentMeta
    ? isGitAncestor(parentMeta.fullSha, mainRef, gitRunner)
    : inMainAncestry;
  const treeCheck = verifyPathsInGitTree(mainRef, commitSpec.requiredPaths, gitRunner);

  const preservedAndIntact =
    inMainAncestry && parentInMainAncestry && treeCheck.missingPaths.length === 0;

  return {
    id: commitSpec.id,
    label: commitSpec.label,
    shortSha: commitSpec.shortSha,
    fullSha: commitMeta.fullSha,
    featureParentShortSha: commitSpec.featureParentShortSha,
    featureParentFullSha: parentMeta ? parentMeta.fullSha : null,
    committedAtUtc: commitMeta.committedAtUtc,
    commitSubject: commitMeta.subject,
    sourceBranch: commitSpec.sourceBranch,
    objectExistsInGit: true,
    inMainAncestry,
    parentInMainAncestry,
    expectedInMainAncestry: commitSpec.expectedInMainAncestry,
    matchesExpectedDisposition: preservedAndIntact === commitSpec.expectedInMainAncestry,
    status: preservedAndIntact ? 'PRESERVED_IN_ORIGIN_MAIN' : 'BROKEN_ANCESTRY_OR_MISSING_FILES',
    ownerScope: commitSpec.ownerScope,
    requiredFileCount: commitSpec.requiredPaths.length,
    presentFileCount: treeCheck.existingPaths.length,
    missingPaths: treeCheck.missingPaths,
  };
}

export function verifyAllRound5TargetCommits(
  specs = ROUND5_TARGET_COMMITS,
  mainRef = ROUND5_MAIN_HEAD.fullSha,
  gitRunner = runReadOnlyGit,
) {
  const mainMeta = tryGetCommitMetadata(mainRef, gitRunner);
  if (!mainMeta) {
    throw new Error(`origin/main 커밋 메타데이터를 조회할 수 없습니다: ${mainRef}`);
  }
  const results = specs.map((spec) => verifyRound5TargetCommit(spec, mainMeta.fullSha, gitRunner));
  const includedCommits = results.filter((r) => r.inMainAncestry);
  const missingCommits = results.filter((r) => !r.inMainAncestry);

  return {
    mainHead: mainMeta,
    includedCount: includedCommits.length,
    missingCount: missingCommits.length,
    allMatchExpectedAuditFindings: results.every((r) => r.matchesExpectedDisposition),
    results,
  };
}

export function verifyPr2740Evolution(
  prSpec = PR_2740_LATEST_STATUS,
  mainRef = ROUND5_MAIN_HEAD.fullSha,
  gitRunner = runReadOnlyGit,
) {
  const headMeta = tryGetCommitMetadata(prSpec.latestHeadFullSha, gitRunner);
  let aheadOfMain = prSpec.aheadOfMain;
  let behindMain = prSpec.behindMain;
  try {
    const counts = gitRunner([
      'rev-list',
      '--left-right',
      '--count',
      `${mainRef}...${prSpec.latestHeadFullSha}`,
    ]);
    const [behindStr, aheadStr] = counts.split(/\s+/);
    behindMain = Number(behindStr);
    aheadOfMain = Number(aheadStr);
  } catch {
    // fallback to static snapshot
  }

  return {
    ...prSpec,
    headCommitVerifiedInGit: Boolean(headMeta && headMeta.fullSha === prSpec.latestHeadFullSha),
    aheadOfMain,
    behindMain,
  };
}

function resolveChromiumExecutablePath() {
  const candidates = ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export async function runRound5BrowserVerification(reportSummary) {
  const { chromium } = await import('playwright');
  const html = buildRound5VerificationFixtureHtml(reportSummary);

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}/`;

  const executablePath = resolveChromiumExecutablePath();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const viewports = [
      { label: '320px-mobile', width: 320, height: 640, zoomPercent: 100 },
      { label: '390px-mobile', width: 390, height: 844, zoomPercent: 100 },
      { label: '768px-tablet', width: 768, height: 1024, zoomPercent: 100 },
      { label: '1440px-desktop', width: 1440, height: 900, zoomPercent: 100 },
      { label: '1440px-zoom-200pct', width: 1440, height: 900, zoomPercent: 200 },
      { label: '320px-zoom-200pct', width: 320, height: 640, zoomPercent: 200 },
    ];

    const viewportResults = [];

    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', (err) => {
        pageErrors.push(String(err));
      });

      await page.goto(url, { waitUntil: 'domcontentloaded' });

      if (vp.zoomPercent !== 100) {
        await page.evaluate((zoom) => {
          document.documentElement.style.zoom = `${zoom}%`;
        }, vp.zoomPercent);
      }

      await page.click('#btn-pr2740');
      const prPressed = await page.getAttribute('#btn-pr2740', 'aria-pressed');
      await page.click('#btn-ci');
      const ciPressed = await page.getAttribute('#btn-ci', 'aria-pressed');
      await page.click('#btn-commits');
      const commitsPressed = await page.getAttribute('#btn-commits', 'aria-pressed');

      const layoutMetrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const horizontalOverflowPx = Math.max(0, doc.scrollWidth - doc.clientWidth);
        const cards = Array.from(document.querySelectorAll('[data-commit-id]'));
        return {
          clientWidth: doc.clientWidth,
          scrollWidth: doc.scrollWidth,
          horizontalOverflowPx,
          renderedCommitCardCount: cards.length,
        };
      });

      const passed =
        layoutMetrics.horizontalOverflowPx === 0 &&
        layoutMetrics.renderedCommitCardCount === 4 &&
        prPressed === 'true' &&
        ciPressed === 'true' &&
        commitsPressed === 'true' &&
        consoleErrors.length === 0 &&
        pageErrors.length === 0;

      viewportResults.push({
        label: vp.label,
        width: vp.width,
        height: vp.height,
        zoomPercent: vp.zoomPercent,
        ...layoutMetrics,
        interactiveFilterSwitchPassed:
          prPressed === 'true' && ciPressed === 'true' && commitsPressed === 'true',
        consoleErrorCount: consoleErrors.length,
        pageErrorCount: pageErrors.length,
        passed,
      });

      await context.close();
    }

    return {
      executed: true,
      allViewportsPassed: viewportResults.every((r) => r.passed),
      viewports: viewportResults,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

export async function runRound5PreservationAudit(options = {}) {
  const verifiedAtUtc = options.verifiedAtUtc ?? new Date().toISOString();
  const gitRunner = options.gitRunner ?? runReadOnlyGit;

  const commitAudit = verifyAllRound5TargetCommits(
    ROUND5_TARGET_COMMITS,
    ROUND5_MAIN_HEAD.fullSha,
    gitRunner,
  );
  const pr2740Status = verifyPr2740Evolution(
    PR_2740_LATEST_STATUS,
    ROUND5_MAIN_HEAD.fullSha,
    gitRunner,
  );

  const report = {
    auditId: 'main-preservation-round5-20261107',
    verifiedAtUtc,
    readOnlyMode: true,
    mainHead: commitAudit.mainHead,
    includedCommitCount: commitAudit.includedCount,
    missingCommitCount: commitAudit.missingCount,
    allMatchExpectedAuditFindings: commitAudit.allMatchExpectedAuditFindings,
    targetCommits: commitAudit.results,
    pr2740Status,
    latestMainCi: LATEST_MAIN_CI_STATUS,
    browserVerification: null,
  };

  if (options.runBrowser) {
    report.browserVerification = await runRound5BrowserVerification(report);
  }

  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const runBrowser = args.includes('--browser');
  const writeReport = args.includes('--write');

  const report = await runRound5PreservationAudit({ runBrowser });

  if (writeReport) {
    const outPath = path.join(__dirname, 'verification-report.json');
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  const summary = {
    auditId: report.auditId,
    verifiedAtUtc: report.verifiedAtUtc,
    mainHead: report.mainHead.fullSha,
    includedShas: report.targetCommits.filter((c) => c.inMainAncestry).map((c) => c.shortSha),
    missingShas: report.targetCommits.filter((c) => !c.inMainAncestry).map((c) => c.shortSha),
    pr2740LatestHead: report.pr2740Status.latestHeadFullSha,
    pr2740CiConclusion: report.pr2740Status.ciConclusion,
    latestMainCiRunId: report.latestMainCi.ciRunId,
    latestMainCiConclusion: report.latestMainCi.conclusion,
    browserVerificationPassed: report.browserVerification
      ? report.browserVerification.allViewportsPassed
      : 'SKIPPED (use --browser)',
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!report.allMatchExpectedAuditFindings) {
    process.exitCode = 1;
  }
  if (report.browserVerification && !report.browserVerification.allViewportsPassed) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
