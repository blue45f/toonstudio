import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CI_FAILURE_ANALYSIS,
  EXPECTED_MAIN_HEAD,
  PRESERVED_FEATURES,
  SEQUENTIAL_MERGE_PLAN,
  analyzeCiAndOwnershipBoundary,
  auditUnpreservedAndOpenBranches,
  buildSequentialMergePlan,
  buildVerificationFixtureHtml,
  runReadOnlyGit,
  verifyAllPreservedFeatures,
  verifyFeatureCommitPreservation,
} from './verify-main-preservation-round4.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('runReadOnlyGit blocks mutating git subcommands and destructive branch flags', () => {
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
    ['branch', '--delete', 'feat/temp'],
  ]) {
    assert.throws(
      () => runReadOnlyGit(forbidden),
      /금지된 git/,
      `Expected ${forbidden.join(' ')} to be rejected in read-only audit mode`,
    );
  }
});

test('origin/main HEAD contains all 5 preserved feature commits in ancestry and file tree', () => {
  const result = verifyAllPreservedFeatures(PRESERVED_FEATURES, EXPECTED_MAIN_HEAD.fullSha);
  assert.equal(result.mainHead.fullSha, '354af37afeb3feb0f700b5a472fcfb0e31292ae0');
  assert.equal(result.allPreserved, true);
  assert.equal(result.preservedCount, 5);
  assert.equal(result.totalCount, 5);

  const expectedShas = ['3363492c', '5dcfe58d', '4c108a65', '1692360d', '354af37a'];
  assert.deepEqual(
    result.features.map((f) => f.shortSha),
    expectedShas,
  );

  for (const feature of result.features) {
    assert.equal(feature.commitIsAncestor, true, `${feature.shortSha} must be ancestor of main`);
    assert.equal(
      feature.parentIsAncestor,
      true,
      `${feature.featureParentShortSha} must be ancestor of main`,
    );
    assert.equal(feature.missingPaths.length, 0, `${feature.id} must have 0 missing files`);
    assert.equal(feature.presentFileCount, feature.requiredFileCount);
    assert.equal(feature.preserved, true);
  }
});

test('verifyFeatureCommitPreservation detects synthetic missing file or broken ancestry', () => {
  const sampleFeature = PRESERVED_FEATURES[0];
  const syntheticRunnerMissingFile = (args) => {
    if (args[0] === 'show') {
      const ref = args[3].replace('^{commit}', '');
      return `${ref}\t2026-11-07T07:15:48Z\tsynthetic subject`;
    }
    if (args[0] === 'merge-base') {
      return '';
    }
    if (args[0] === 'ls-tree') {
      return sampleFeature.requiredPaths.slice(1).join('\n');
    }
    return '';
  };

  const missingFileCheck = verifyFeatureCommitPreservation(
    sampleFeature,
    EXPECTED_MAIN_HEAD.fullSha,
    syntheticRunnerMissingFile,
  );
  assert.equal(missingFileCheck.preserved, false);
  assert.deepEqual(missingFileCheck.missingPaths, [sampleFeature.requiredPaths[0]]);
});

test('auditUnpreservedAndOpenBranches classifies unpreserved session commits and patch-equivalent remote branches', () => {
  const branchAudit = auditUnpreservedAndOpenBranches();
  assert.equal(branchAudit.unpreservedCount, 6);

  const responsiveAudit = branchAudit.unpreservedBranches.find(
    (b) => b.branch === 'qa/responsive-audit-20261107',
  );
  assert.ok(responsiveAudit);
  assert.equal(responsiveAudit.remotePreserved, false);
  assert.equal(responsiveAudit.ancestorOfOriginMain, false);
  assert.deepEqual(
    responsiveAudit.localCommits.map((c) => c.shortSha),
    ['d0f9aa0b', 'abebd404', '2466becc', '129fd16c'],
  );

  const a11ySweepRemote = branchAudit.remoteOpenBranches.find((b) => b.shortSha === 'a8614c5f');
  assert.ok(a11ySweepRemote);
  assert.equal(a11ySweepRemote.patchEquivalentOnMain, true);
  assert.equal(a11ySweepRemote.equivalentMainCommit, '5eb3810b90837e5e02baddf4b0880acdad1d76e8');
  assert.equal(a11ySweepRemote.disposition, 'DO_NOT_MERGE_ALREADY_IN_MAIN_AS_5EB3810B');
});

test('analyzeCiAndOwnershipBoundary confirms PackagePanel.tsx CI failure is owned by PR #2740', () => {
  const ci = analyzeCiAndOwnershipBoundary(CI_FAILURE_ANALYSIS);
  assert.equal(ci.mainWorkflowRunId, 42360644304);
  assert.equal(ci.verifiedMainPackagePanelLines, 840);
  assert.equal(ci.exceedsCeilingOnMain, true);
  assert.equal(ci.ownedByOpenPr, 2740);
  assert.equal(ci.openPrHeadSha, 'f508de8fd00b9bb6bb40efa85751c90a9dfd62b6');
  assert.equal(ci.openPrPackagePanelLinesAfterSplit, 708);
  assert.equal(ci.coveredByPr2740, true);
  assert.equal(ci.duplicateFixForbidden, true);
});

test('buildSequentialMergePlan enforces PR #2740 first and detects scope collisions', () => {
  const plan = buildSequentialMergePlan(SEQUENTIAL_MERGE_PLAN);
  assert.equal(plan.strictlySequential, true);
  assert.equal(plan.pr2740IsFirst, true);
  assert.equal(plan.collisionFreeAcrossSteps, true);
  assert.equal(plan.scopeCollisions.length, 0);

  const collidingPlan = buildSequentialMergePlan([
    ...SEQUENTIAL_MERGE_PLAN,
    {
      order: 6,
      id: 'step-6-colliding-synthetic',
      target: 'synthetic-branch',
      ownerScope: ['apps/character-lab/src/app/shell/panels/PackagePanel.tsx'],
      precondition: 'none',
      rationale: 'test collision',
    },
  ]);
  assert.equal(collidingPlan.collisionFreeAcrossSteps, false);
  assert.equal(collidingPlan.scopeCollisions.length, 1);
  assert.equal(
    collidingPlan.scopeCollisions[0].path,
    'apps/character-lab/src/app/shell/panels/PackagePanel.tsx',
  );
});

test('verification-report.json and synthetic HTML fixture include 320/390/768/1440 and 200% zoom results', () => {
  const reportPath = path.join(__dirname, 'verification-report.json');
  assert.equal(fs.existsSync(reportPath), true, 'verification-report.json must exist');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.allPreservedFeaturesIntact, true);
  assert.ok(report.browserVerification);
  assert.equal(report.browserVerification.allViewportsPassed, true);
  assert.equal(report.browserVerification.viewports.length, 6);

  for (const vp of report.browserVerification.viewports) {
    assert.equal(vp.horizontalOverflowPx, 0, `${vp.label} must have 0px horizontal overflow`);
    assert.equal(vp.renderedFeatureCardCount, 5);
    assert.equal(vp.interactiveFilterSwitchPassed, true);
    assert.equal(vp.consoleErrorCount, 0);
    assert.equal(vp.pageErrorCount, 0);
    assert.equal(vp.passed, true);
  }

  const html = buildVerificationFixtureHtml(report);
  assert.match(html, /Round 4 통합 보존 읽기 전용 감사 검증 대시보드/);
});
