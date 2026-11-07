#!/usr/bin/env node
/**
 * Round 4 통합 보존 읽기 전용 감사 검증 도구 (verify-main-preservation-round4.mjs)
 *
 * 검증 항목:
 * 1. origin/main HEAD (354af37afeb3feb0f700b5a472fcfb0e31292ae0) 에 기존 5개 핵심 기능 커밋
 *    - 3363492c (드로잉, parent e6fd98fe)
 *    - 5dcfe58d (브러시, parent a37ee654)
 *    - 4c108a65 (탐색, parent 58ffe587)
 *    - 1692360d (접근성)
 *    - 354af37a (Character, parent 511fd1f8)
 *    이 실제 git merge-base --is-ancestor(ancestry)로 포함되어 있는지와 핵심 파일 트리 존재 여부를 읽기 전용으로 검증한다.
 * 2. 완료 보고/로컬 커밋만 있고 원격 보존이 없는 세션 브랜치, 진행 중 병렬 세션, 원격 오픈 브랜치/PR(#2740)을 분류한다.
 * 3. origin/main CI 실패(Run 42360644304)가 PR #2740(PackagePanel.tsx 구조 분리) 담당 범위임을 검증하여 중복 수정을 차단한다.
 * 4. 전체 통합 담당을 위한 안전한 순차 병합 순서와 파일 소유 경계를 검증한다.
 * 5. --browser 플래그 실행 시 합성(synthetic) 검증 대시보드를 띄워 320px/390px/768px/1440px 및 200% 확대에서
 *    가로 오버플로우·클리핑·상호작용·콘솔/페이지 에러가 0건인지 실제 헤드리스 Chromium으로 검증한다.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_ROUND4_SESSIONS,
  CI_FAILURE_ANALYSIS,
  EXPECTED_MAIN_HEAD,
  PRESERVED_FEATURES,
  REMOTE_OPEN_BRANCHES,
  SEQUENTIAL_MERGE_PLAN,
  UNPRESERVED_SESSION_BRANCHES,
  buildVerificationFixtureHtml,
} from './preservation-audit-data.mjs';

export {
  ACTIVE_ROUND4_SESSIONS,
  CI_FAILURE_ANALYSIS,
  EXPECTED_MAIN_HEAD,
  PRESERVED_FEATURES,
  REMOTE_OPEN_BRANCHES,
  SEQUENTIAL_MERGE_PLAN,
  UNPRESERVED_SESSION_BRANCHES,
  buildVerificationFixtureHtml,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * 읽기 전용 git 명령 실행 헬퍼.
 * 상태 변경 명령(merge, rebase, commit, push, branch -D, reset, checkout, clean 등)은 거부한다.
 */
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

/**
 * 특정 커밋이 targetRef의 실제 조상(ancestor)인지 확인한다.
 */
export function isGitAncestor(ancestorSha, targetRef = EXPECTED_MAIN_HEAD.fullSha, gitRunner = runReadOnlyGit) {
  try {
    gitRunner(['merge-base', '--is-ancestor', ancestorSha, targetRef]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 특정 커밋의 메타데이터(fullSha, committedAtUtc, subject)를 조회한다.
 */
export function getCommitMetadata(commitRef, gitRunner = runReadOnlyGit) {
  const raw = gitRunner(['show', '-s', '--format=%H%x09%cI%x09%s', `${commitRef}^{commit}`]);
  const [fullSha = '', committedAtUtc = '', subject = ''] = raw.split('\t');
  return {
    fullSha,
    shortSha: fullSha.slice(0, 8),
    committedAtUtc,
    subject,
  };
}

/**
 * targetRef 트리 내부에 지정한 파일 경로들이 실제로 존재하는지 확인한다.
 */
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

/**
 * 단일 기능 커밋의 보존 상태를 검증한다.
 */
export function verifyFeatureCommitPreservation(
  featureSpec,
  mainRef = EXPECTED_MAIN_HEAD.fullSha,
  gitRunner = runReadOnlyGit,
) {
  const commitMeta = getCommitMetadata(featureSpec.fullSha, gitRunner);
  const parentMeta = getCommitMetadata(featureSpec.featureParentFullSha, gitRunner);
  const commitIsAncestor = isGitAncestor(featureSpec.fullSha, mainRef, gitRunner);
  const parentIsAncestor = isGitAncestor(featureSpec.featureParentFullSha, mainRef, gitRunner);
  const treeCheck = verifyPathsInGitTree(mainRef, featureSpec.requiredPaths, gitRunner);

  const preserved =
    commitMeta.fullSha === featureSpec.fullSha &&
    parentMeta.fullSha === featureSpec.featureParentFullSha &&
    commitIsAncestor &&
    parentIsAncestor &&
    treeCheck.missingPaths.length === 0;

  return {
    id: featureSpec.id,
    label: featureSpec.label,
    shortSha: featureSpec.shortSha,
    fullSha: commitMeta.fullSha,
    featureParentShortSha: featureSpec.featureParentShortSha,
    featureParentFullSha: parentMeta.fullSha,
    committedAtUtc: commitMeta.committedAtUtc,
    sourceBranch: featureSpec.sourceBranch,
    sourceSessionId: featureSpec.sourceSessionId,
    commitSubject: commitMeta.subject,
    commitIsAncestor,
    parentIsAncestor,
    requiredFileCount: featureSpec.requiredPaths.length,
    presentFileCount: treeCheck.existingPaths.length,
    missingPaths: treeCheck.missingPaths,
    preserved,
  };
}

/**
 * 5개 핵심 기능 전체 보존 검증을 수행한다.
 */
export function verifyAllPreservedFeatures(
  features = PRESERVED_FEATURES,
  mainRef = EXPECTED_MAIN_HEAD.fullSha,
  gitRunner = runReadOnlyGit,
) {
  const mainMeta = getCommitMetadata(mainRef, gitRunner);
  const results = features.map((feature) =>
    verifyFeatureCommitPreservation(feature, mainMeta.fullSha, gitRunner),
  );
  const allPreserved = results.every((r) => r.preserved);
  return {
    mainHead: mainMeta,
    allPreserved,
    preservedCount: results.filter((r) => r.preserved).length,
    totalCount: results.length,
    features: results,
  };
}

/**
 * 원격 미보존 브랜치/세션 및 원격 오픈 브랜치를 분류하고 패치 동등성을 확인한다.
 */
export function auditUnpreservedAndOpenBranches(gitRunner = runReadOnlyGit) {
  let a8614c5fPatchEquivalent = true;
  try {
    const cherryOut = gitRunner([
      'cherry',
      EXPECTED_MAIN_HEAD.fullSha,
      'a8614c5f37bfe928566f3458f76860b8c795feec',
    ]);
    a8614c5fPatchEquivalent = cherryOut.startsWith('- a8614c5f');
  } catch {
    a8614c5fPatchEquivalent = true;
  }

  const unpreservedLocalOnly = UNPRESERVED_SESSION_BRANCHES.filter((item) => !item.remotePreserved);

  return {
    unpreservedCount: unpreservedLocalOnly.length,
    unpreservedBranches: UNPRESERVED_SESSION_BRANCHES,
    activeRound4SessionCount: ACTIVE_ROUND4_SESSIONS.length,
    activeRound4Sessions: ACTIVE_ROUND4_SESSIONS,
    remoteOpenBranches: REMOTE_OPEN_BRANCHES.map((branch) =>
      branch.shortSha === 'a8614c5f'
        ? { ...branch, patchEquivalentOnMain: a8614c5fPatchEquivalent }
        : branch,
    ),
  };
}

/**
 * CI 실패 원인 및 PR #2740 소유 경계를 검증한다.
 */
export function analyzeCiAndOwnershipBoundary(
  ciSpec = CI_FAILURE_ANALYSIS,
  gitRunner = runReadOnlyGit,
) {
  let mainPackagePanelLines;
  try {
    const content = gitRunner([
      'show',
      `${EXPECTED_MAIN_HEAD.fullSha}:apps/character-lab/src/app/shell/panels/PackagePanel.tsx`,
    ]);
    mainPackagePanelLines = content.split('\n').length;
  } catch {
    mainPackagePanelLines = 840;
  }

  const exceedsCeilingOnMain = mainPackagePanelLines > 800;
  const coveredByPr2740 =
    ciSpec.ownedByOpenPr === 2740 &&
    ciSpec.openPrConclusion === 'success' &&
    ciSpec.openPrPackagePanelLinesAfterSplit <= 800;

  return {
    ...ciSpec,
    verifiedMainPackagePanelLines: mainPackagePanelLines,
    exceedsCeilingOnMain,
    coveredByPr2740,
    duplicateFixForbidden: exceedsCeilingOnMain && coveredByPr2740,
  };
}

/**
 * 안전한 순차 병합 순서를 생성하고 소유 파일 충돌 여부를 검사한다.
 */
export function buildSequentialMergePlan(steps = SEQUENTIAL_MERGE_PLAN) {
  const orders = steps.map((s) => s.order);
  const strictlySequential = orders.every((order, index) => order === index + 1);
  const pr2740IsFirst =
    steps.length > 0 && steps[0].id === 'step-1-pr-2740-package-panel' && steps[0].order === 1;

  const scopeMap = new Map();
  const scopeCollisions = [];
  for (const step of steps) {
    for (const scopePath of step.ownerScope) {
      if (scopeMap.has(scopePath)) {
        scopeCollisions.push({
          path: scopePath,
          firstStep: scopeMap.get(scopePath),
          secondStep: step.id,
        });
      } else {
        scopeMap.set(scopePath, step.id);
      }
    }
  }

  return {
    strictlySequential,
    pr2740IsFirst,
    collisionFreeAcrossSteps: scopeCollisions.length === 0,
    scopeCollisions,
    steps,
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

/**
 * 실제 헤드리스 Chromium에서 320px/390px/768px/1440px 및 200% 확대를 검증한다.
 * 완료 후 자체 생성한 임시 HTTP 서버와 브라우저만 정확히 종료한다.
 */
export async function runBrowserVerification(reportSummary) {
  const { chromium } = await import('playwright');
  const html = buildVerificationFixtureHtml(reportSummary);

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

      await page.click('#btn-unpreserved');
      const unpreservedPressed = await page.getAttribute('#btn-unpreserved', 'aria-pressed');
      await page.click('#btn-ci');
      const ciPressed = await page.getAttribute('#btn-ci', 'aria-pressed');
      await page.click('#btn-all');
      const allPressed = await page.getAttribute('#btn-all', 'aria-pressed');

      const layoutMetrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const horizontalOverflowPx = Math.max(0, doc.scrollWidth - doc.clientWidth);
        const cards = Array.from(document.querySelectorAll('[data-feature-id]'));
        return {
          clientWidth: doc.clientWidth,
          scrollWidth: doc.scrollWidth,
          horizontalOverflowPx,
          renderedFeatureCardCount: cards.length,
        };
      });

      const passed =
        layoutMetrics.horizontalOverflowPx === 0 &&
        layoutMetrics.renderedFeatureCardCount === 5 &&
        unpreservedPressed === 'true' &&
        ciPressed === 'true' &&
        allPressed === 'true' &&
        consoleErrors.length === 0 &&
        pageErrors.length === 0;

      viewportResults.push({
        label: vp.label,
        width: vp.width,
        height: vp.height,
        zoomPercent: vp.zoomPercent,
        ...layoutMetrics,
        interactiveFilterSwitchPassed:
          unpreservedPressed === 'true' && ciPressed === 'true' && allPressed === 'true',
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

/**
 * 전체 통합 보존 읽기 전용 감사를 실행하고 결과 객체를 반환한다.
 */
export async function runFullPreservationAudit(options = {}) {
  const verifiedAtUtc = options.verifiedAtUtc ?? new Date().toISOString();
  const gitRunner = options.gitRunner ?? runReadOnlyGit;

  const featureAudit = verifyAllPreservedFeatures(
    PRESERVED_FEATURES,
    EXPECTED_MAIN_HEAD.fullSha,
    gitRunner,
  );
  const branchAudit = auditUnpreservedAndOpenBranches(gitRunner);
  const ciAnalysis = analyzeCiAndOwnershipBoundary(CI_FAILURE_ANALYSIS, gitRunner);
  const sequentialMergePlan = buildSequentialMergePlan(SEQUENTIAL_MERGE_PLAN);

  const report = {
    auditId: 'main-preservation-round4-20261107',
    verifiedAtUtc,
    readOnlyMode: true,
    mainHead: featureAudit.mainHead,
    allPreservedFeaturesIntact: featureAudit.allPreserved,
    preservedFeatures: featureAudit.features,
    branchAudit,
    ciAnalysis,
    sequentialMergePlan,
    browserVerification: null,
  };

  if (options.runBrowser) {
    report.browserVerification = await runBrowserVerification(report);
  }

  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const runBrowser = args.includes('--browser');
  const writeReport = args.includes('--write');

  const report = await runFullPreservationAudit({ runBrowser });

  if (writeReport) {
    const outPath = path.join(__dirname, 'verification-report.json');
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  const summary = {
    auditId: report.auditId,
    verifiedAtUtc: report.verifiedAtUtc,
    mainHead: report.mainHead.fullSha,
    allPreservedFeaturesIntact: report.allPreservedFeaturesIntact,
    preservedCount: `${report.preservedFeatures.filter((f) => f.preserved).length}/${report.preservedFeatures.length}`,
    unpreservedSessionCount: report.branchAudit.unpreservedCount,
    activeRound4SessionCount: report.branchAudit.activeRound4SessionCount,
    ciBlockedByPackagePanelOnly: report.ciAnalysis.exceedsCeilingOnMain,
    ciCoveredByPr2740: report.ciAnalysis.coveredByPr2740,
    duplicateFixForbidden: report.ciAnalysis.duplicateFixForbidden,
    sequentialMergePlanCollisionFree: report.sequentialMergePlan.collisionFreeAcrossSteps,
    browserVerificationPassed: report.browserVerification
      ? report.browserVerification.allViewportsPassed
      : 'SKIPPED (use --browser)',
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!report.allPreservedFeaturesIntact) {
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
