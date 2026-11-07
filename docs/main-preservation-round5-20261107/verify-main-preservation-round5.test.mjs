import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  LATEST_MAIN_CI_STATUS,
  PR_2740_LATEST_STATUS,
  ROUND5_MAIN_HEAD,
  ROUND5_TARGET_COMMITS,
  buildRound5VerificationFixtureHtml,
  runReadOnlyGit,
  verifyAllRound5TargetCommits,
  verifyPr2740Evolution,
} from './verify-main-preservation-round5.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('runReadOnlyGit blocks mutating git subcommands and branch deletions', () => {
  for (const forbidden of [
    ['merge', 'origin/main'],
    ['rebase', 'origin/main'],
    ['commit', '-m', 'nope'],
    ['push', 'origin', 'main'],
    ['reset', '--hard'],
    ['clean', '-fd'],
    ['checkout', 'main'],
    ['switch', 'main'],
    ['worktree', 'prune'],
    ['branch', '-D', 'feat/temp'],
  ]) {
    assert.throws(
      () => runReadOnlyGit(forbidden),
      /금지된 git/,
      `Expected ${forbidden.join(' ')} to be rejected`,
    );
  }
});

test('verifyAllRound5TargetCommits confirms 65da4036, 01d8f995, 75f34f8d in ancestry and 4b1be6d4 missing', () => {
  const audit = verifyAllRound5TargetCommits(ROUND5_TARGET_COMMITS, ROUND5_MAIN_HEAD.fullSha);
  assert.equal(audit.mainHead.fullSha, '65da4036cec52f1d5b048855a51085c9b7503264');
  assert.equal(audit.includedCount, 3);
  assert.equal(audit.missingCount, 1);
  assert.equal(audit.allMatchExpectedAuditFindings, true);

  const byShort = new Map(audit.results.map((r) => [r.shortSha, r]));

  const charKbd = byShort.get('65da4036');
  assert.ok(charKbd);
  assert.equal(charKbd.inMainAncestry, true);
  assert.equal(charKbd.parentInMainAncestry, true);
  assert.equal(charKbd.presentFileCount, 26);
  assert.equal(charKbd.missingPaths.length, 0);

  const home200 = byShort.get('4b1be6d4');
  assert.ok(home200);
  assert.equal(home200.objectExistsInGit, false);
  assert.equal(home200.inMainAncestry, false);
  assert.equal(home200.status, 'MISSING_FROM_ORIGIN_MAIN_AND_REMOTE_REFS');
  assert.deepEqual(home200.ownerScope, [
    'apps/web/src/domains/home/',
    'scripts/bench-toon-home-200.mjs',
  ]);

  const brush = byShort.get('01d8f995');
  assert.ok(brush);
  assert.equal(brush.inMainAncestry, true);
  assert.equal(brush.parentInMainAncestry, true);
  assert.equal(brush.presentFileCount, 11);
  assert.equal(brush.missingPaths.length, 0);

  const catalog = byShort.get('75f34f8d');
  assert.ok(catalog);
  assert.equal(catalog.inMainAncestry, true);
  assert.equal(catalog.parentInMainAncestry, true);
  assert.equal(catalog.presentFileCount, 12);
  assert.equal(catalog.missingPaths.length, 0);
});

test('verifyPr2740Evolution confirms PR #2740 advanced from f508de8f to c4fce43c with green CI', () => {
  const pr = verifyPr2740Evolution(PR_2740_LATEST_STATUS, ROUND5_MAIN_HEAD.fullSha);
  assert.equal(pr.prNumber, 2740);
  assert.equal(pr.initialHeadShortSha, 'f508de8f');
  assert.equal(pr.latestHeadFullSha, 'c4fce43c307fa5f124105e8cfb4719c1b9998d93');
  assert.equal(pr.headCommitVerifiedInGit, true);
  assert.equal(pr.aheadOfMain, 6);
  assert.equal(pr.behindMain, 2);
  assert.equal(pr.ciConclusion, 'SUCCESS');
  assert.deepEqual(
    pr.commitsSince354af37a.map((c) => c.shortSha),
    ['f508de8f', '45f35ec2', '0474e1dc', 'abb378f1', '5a077ae0', 'c4fce43c'],
  );
});

test('LATEST_MAIN_CI_STATUS maps Run 42375861658 failures to dedicated owners with duplicateFixForbidden', () => {
  assert.equal(LATEST_MAIN_CI_STATUS.mainHeadSha, '65da4036cec52f1d5b048855a51085c9b7503264');
  assert.equal(LATEST_MAIN_CI_STATUS.ciRunId, 42375861658);
  assert.equal(LATEST_MAIN_CI_STATUS.conclusion, 'failure');
  assert.equal(LATEST_MAIN_CI_STATUS.failedItemsAndOwnership.length, 3);
  for (const item of LATEST_MAIN_CI_STATUS.failedItemsAndOwnership) {
    assert.equal(item.duplicateFixForbidden, true, `${item.id} must forbid duplicate fix`);
  }
});

test('Round 5 verification-report.json and browser viewports (320/390/768/1440/200%) pass with 0 overflow', () => {
  const reportPath = path.join(__dirname, 'verification-report.json');
  assert.equal(fs.existsSync(reportPath), true);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.allMatchExpectedAuditFindings, true);
  assert.equal(report.browserVerification.allViewportsPassed, true);
  assert.equal(report.browserVerification.viewports.length, 6);

  for (const vp of report.browserVerification.viewports) {
    assert.equal(vp.horizontalOverflowPx, 0);
    assert.equal(vp.renderedCommitCardCount, 4);
    assert.equal(vp.interactiveFilterSwitchPassed, true);
    assert.equal(vp.consoleErrorCount, 0);
    assert.equal(vp.pageErrorCount, 0);
    assert.equal(vp.passed, true);
  }

  const html = buildRound5VerificationFixtureHtml(report);
  assert.match(html, /Round 5 통합 보존 후속 감사 대시보드/);
});
