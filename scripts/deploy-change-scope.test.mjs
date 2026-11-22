import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildRecommendedDeployCommand,
  classifyDeployChangedFiles,
  findLatestLedgerDeploySha,
  formatDeployScopeLines,
  planSmartDeploySelection,
  resolveChangedFilesBetweenRefs,
  resolveDeployBaseSha,
} from "./lib/deploy-change-scope.mjs";
import {
  parseCloudDispatchArgs,
  printCloudStatus,
  resolveSmartDispatchFields,
} from "./dispatch-cloud-deploy.mjs";
import { REQUIRED_ONPOD_CONFIRM } from "./cloud-deploy-onpod.mjs";

const { describe, test } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

const SHA_BASE = "1".repeat(40);
const SHA_TARGET = "2".repeat(40);

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "toonstudio-deploy-scope-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("deploy-change-scope 변경 영역 분류 및 스마트 배포 계획", () => {
  test("웹 전용 변경은 webChanged만 true로 분류하고 API·마이그레이션은 false를 유지한다", () => {
    const scope = classifyDeployChangedFiles([
      "apps/web/src/domains/creator/BrushPanel.tsx",
      "packages/studio-engine-skia/src/brush.ts",
      "deploy/cloudflare-static/src/index.ts",
      "scripts/build-static-catalog.ts",
    ]);
    assert.equal(scope.webChanged, true);
    assert.equal(scope.apiChanged, false);
    assert.equal(scope.apexChanged, false);
    assert.equal(scope.migrationsChanged, false);
    assert.equal(
      buildRecommendedDeployCommand(scope),
      "pnpm run deploy:cloud -- --web --watch",
    );
  });

  test("API 전용 변경은 apiChanged만 true로 분류하고 정적 웹은 false를 유지한다", () => {
    const scope = classifyDeployChangedFiles([
      "apps/api/src/modules/auth/auth.service.ts",
      "deploy/onpod/README.md",
      "deploy/trust/supabase-prod-ca-2021.crt",
    ]);
    assert.equal(scope.webChanged, false);
    assert.equal(scope.apiChanged, true);
    assert.equal(scope.apexChanged, false);
    assert.equal(scope.migrationsChanged, false);
    assert.equal(
      buildRecommendedDeployCommand(scope),
      "pnpm run deploy:cloud -- --api-image --watch",
    );
  });

  test("DB 스키마·마이그레이션 변경은 migrationsChanged와 apiChanged를 함께 표시한다", () => {
    const scope = classifyDeployChangedFiles([
      "apps/api/src/platform/database/migrations/0099_add_studio_index.sql",
      "apps/api/src/platform/database/schema/works.schema.ts",
    ]);
    assert.equal(scope.webChanged, false);
    assert.equal(scope.apiChanged, true);
    assert.equal(scope.migrationsChanged, true);
  });

  test("공유 패키지·루트 의존성·카탈로그 스냅샷 변경은 fail-safe로 web·api 양쪽에 반영한다", () => {
    for (const sharedFile of [
      "packages/contracts/src/auth.ts",
      "packages/core/src/ranking.ts",
      "pnpm-lock.yaml",
      "package.json",
      "apps/api/data/catalog.json.gz",
    ]) {
      const scope = classifyDeployChangedFiles([sharedFile]);
      assert.equal(scope.webChanged, true, `${sharedFile} must mark webChanged`);
      assert.equal(scope.apiChanged, true, `${sharedFile} must mark apiChanged`);
    }
  });

  test("문서·테스트·CI 워크플로 전용 변경은 모든 운영 배포 단위를 false로 분류한다", () => {
    const scope = classifyDeployChangedFiles([
      "docs/operations/ai-deployment-quickstart.md",
      ".github/workflows/lighthouse-ci.yml",
      "apps/web/src/domains/creator/BrushPanel.test.tsx",
      "apps/api/src/modules/auth/auth.service.spec.ts",
      "scripts/workflow-quota-hygiene.test.mjs",
    ]);
    assert.equal(scope.webChanged, false);
    assert.equal(scope.apiChanged, false);
    assert.equal(scope.apexChanged, false);
    assert.equal(scope.migrationsChanged, false);
    assert.equal(buildRecommendedDeployCommand(scope), null);
  });

  test("Apex 리다이렉트 Worker 변경만 있으면 apexChanged만 true로 분류한다", () => {
    const scope = classifyDeployChangedFiles(["deploy/cloudflare-apex-redirect/src/index.ts"]);
    assert.equal(scope.webChanged, false);
    assert.equal(scope.apiChanged, false);
    assert.equal(scope.apexChanged, true);
    assert.equal(
      buildRecommendedDeployCommand(scope),
      "pnpm run deploy:cloud -- --apex --watch",
    );
  });

  test("로컬 배포 원장에서 targetSha 이전의 가장 최근 배포 SHA를 우선 탐색한다", () => {
    withTempDir((dir) => {
      const ledgerDir = path.join(dir, "ledger");
      mkdirSync(path.join(ledgerDir, "cloudflare-static"), { recursive: true });
      const olderSha = "3".repeat(40);
      const newerSha = "4".repeat(40);
      writeFileSync(
        path.join(ledgerDir, "cloudflare-static", `${olderSha}.json`),
        JSON.stringify({ sha: olderSha, recordedAt: "2026-11-20T01:00:00.000Z" }),
      );
      writeFileSync(
        path.join(ledgerDir, "cloudflare-static", `${newerSha}.json`),
        JSON.stringify({ sha: newerSha, recordedAt: "2026-11-21T12:00:00.000Z" }),
      );
      writeFileSync(
        path.join(ledgerDir, "cloudflare-static", `${SHA_TARGET}.json`),
        JSON.stringify({ sha: SHA_TARGET, recordedAt: "2026-11-22T00:00:00.000Z" }),
      );

      const found = findLatestLedgerDeploySha({
        cwd: dir,
        env: { TOONSPECTRUM_DEPLOY_LEDGER_DIR: ledgerDir },
        excludeSha: SHA_TARGET,
      });
      assert.equal(found?.sha, newerSha);

      const resolved = resolveDeployBaseSha({
        rootDir: dir,
        targetSha: SHA_TARGET,
        execEnv: { TOONSPECTRUM_DEPLOY_LEDGER_DIR: ledgerDir },
      });
      assert.equal(resolved.baseSha, newerSha);
      assert.equal(resolved.source, "local-deploy-ledger:cloudflare-static");

      const explicit = resolveDeployBaseSha({
        rootDir: dir,
        targetSha: SHA_TARGET,
        explicitBaseSha: SHA_BASE,
        execEnv: { TOONSPECTRUM_DEPLOY_LEDGER_DIR: ledgerDir },
      });
      assert.equal(explicit.baseSha, SHA_BASE);
      assert.equal(explicit.source, "explicit-base-sha");
    });
  });

  test("로컬 git diff 실패 시 GitHub compare API로 자동 폴백한다", () => {
    const calls = [];
    const result = resolveChangedFilesBetweenRefs({
      rootDir: process.cwd(),
      baseSha: SHA_BASE,
      targetSha: SHA_TARGET,
      repoSlug: "blue45f/toonstudio",
      execFileImpl(bin, args) {
        calls.push([bin, args[0]]);
        if (bin === "git") throw new Error("shallow clone");
        return "apps/web/src/app/App.tsx\ndocs/README.md\n";
      },
    });
    assert.deepEqual(calls, [["git", "diff"], ["gh", "api"]]);
    assert.equal(result.ok, true);
    assert.equal(result.source, "github-compare");
    assert.deepEqual(result.changedFiles, ["apps/web/src/app/App.tsx", "docs/README.md"]);
  });

  test("--smart는 웹 전용 변경에서 API 빌드·onpod 교체를 안전하게 건너뛴다", () => {
    const requested = parseCloudDispatchArgs([
      "--web",
      "--api-image",
      "--api-onpod",
      "--confirm-onpod",
      "--smart",
      `--base-sha=${SHA_BASE}`,
    ]);
    const logs = [];
    const resolved = resolveSmartDispatchFields(requested, SHA_TARGET, {
      log: (line) => logs.push(line),
      execFileImpl(bin, args) {
        assert.equal(bin, "git");
        assert.equal(args[0], "diff");
        return "apps/web/src/domains/creator/StudioCanvas.tsx\n";
      },
    });
    assert.equal(resolved.shouldDispatch, true);
    assert.deepEqual(resolved.fields, {
      ref: SHA_TARGET,
      deploy_web: "true",
      deploy_apex_redirect: "false",
      build_api_image: "false",
      deploy_api_onpod: "false",
      sync_api_env_onpod: "false",
      sync_worker_secrets: "false",
      onpod_confirm: REQUIRED_ONPOD_CONFIRM,
    });
    assert.ok(logs.some((line) => line.includes("[smart skip] apiImage")));
    assert.ok(logs.some((line) => line.includes("[smart skip] apiOnpod")));
  });

  test("--smart는 API 전용 변경에서 웹 전체 재배포를 건너뛰고, --confirm-onpod 유무에 따라 onpod 반영을 안전하게 분기한다", () => {
    const apiScope = classifyDeployChangedFiles(["apps/api/src/modules/creator/creator.controller.ts"]);

    const withoutConfirm = planSmartDeploySelection({
      requestedOptions: parseCloudDispatchArgs(["--smart"]),
      scope: apiScope,
    });
    assert.equal(withoutConfirm.shouldDispatch, true);
    assert.equal(withoutConfirm.effectiveOptions.web, false);
    assert.equal(withoutConfirm.effectiveOptions.apiImage, true);
    assert.equal(withoutConfirm.effectiveOptions.apiOnpod, false);
    assert.ok(withoutConfirm.warnings.some((w) => w.includes("--confirm-onpod")));

    const withConfirm = planSmartDeploySelection({
      requestedOptions: parseCloudDispatchArgs(["--smart", "--confirm-onpod"]),
      scope: apiScope,
    });
    assert.equal(withConfirm.effectiveOptions.web, false);
    assert.equal(withConfirm.effectiveOptions.apiImage, true);
    assert.equal(withConfirm.effectiveOptions.apiOnpod, true);
  });

  test("운영 배포 대상 변경이 없으면 --smart는 워크플로 디스패치 자체를 생략한다", () => {
    const requested = parseCloudDispatchArgs(["--smart", `--base-sha=${SHA_BASE}`]);
    const logs = [];
    const resolved = resolveSmartDispatchFields(requested, SHA_TARGET, {
      log: (line) => logs.push(line),
      execFileImpl: () => "docs/operations/guide.md\n.github/workflows/bundle-visualizer.yml\n",
    });
    assert.equal(resolved.shouldDispatch, false);
    assert.equal(resolved.fields, null);
    assert.ok(logs.some((line) => line.includes("건너뜁니다")));
  });

  test("--sync-worker-secrets가 명시된 경우에는 웹 변경이 없어도 --web 단위를 보존한다", () => {
    const apiOnly = classifyDeployChangedFiles(["apps/api/src/main.ts"]);
    const plan = planSmartDeploySelection({
      requestedOptions: parseCloudDispatchArgs(["--web", "--sync-worker-secrets", "--smart"]),
      scope: apiOnly,
    });
    assert.equal(plan.shouldDispatch, true);
    assert.equal(plan.effectiveOptions.web, true);
    assert.equal(plan.effectiveOptions.syncWorkerSecrets, true);
  });

  test("diff 조회 실패(unknownScope) 시 단독 --smart는 fail-closed로 중단하고, 명시 플래그는 안전하게 유지한다", () => {
    const standalone = planSmartDeploySelection({
      requestedOptions: parseCloudDispatchArgs(["--smart"]),
      scope: null,
      unknownScope: true,
    });
    assert.equal(standalone.shouldDispatch, false);
    assert.match(standalone.blockedReason, /변경 범위를 확인하지 못했습니다/u);

    const explicit = planSmartDeploySelection({
      requestedOptions: parseCloudDispatchArgs(["--web", "--api-image", "--smart"]),
      scope: null,
      unknownScope: true,
    });
    assert.equal(explicit.shouldDispatch, true);
    assert.equal(explicit.effectiveOptions.web, true);
    assert.equal(explicit.effectiveOptions.apiImage, true);
    assert.ok(explicit.warnings.some((w) => w.includes("모든 배포 단위를 유지")));
  });

  test("--status / deploy:doctor 진단 출력에 변경 영역 요약과 권장 최소 배포 명령이 포함된다", async () => {
    const lines = [];
    const scope = classifyDeployChangedFiles([
      "apps/web/src/domains/catalog/RankingPage.tsx",
      "apps/api/src/platform/database/migrations/0100_test.sql",
    ]);
    await printCloudStatus({
      targetSha: SHA_TARGET,
      baseSha: SHA_BASE,
      localOAuth: false,
      log: (line) => lines.push(line),
      resolveOriginMainShaImpl: () => SHA_TARGET,
      inspectGitHubEnvironmentStatusImpl: () => ({
        ghReady: true,
        environmentExists: true,
        configuredVariables: ["CLOUDFLARE_ACCOUNT_ID"],
        configuredSecrets: ["CLOUDFLARE_API_TOKEN", "ONPOD_DEPLOY_TOKEN"],
      }),
      inspectCommitRequiredGatesImpl: () => ({
        sha: SHA_TARGET,
        runId: 999,
        runAttempt: 1,
        runStatus: "success",
        gates: { core: "success", verify: "success" },
        allGreen: true,
      }),
      inspectDeployChangeScopeImpl: () => ({
        unknownScope: false,
        baseSha: SHA_BASE,
        baseShaSource: "explicit-base-sha",
        diffSource: "git-diff",
        scope,
      }),
    });

    const output = lines.join("\n");
    assert.match(output, /webChanged=true, apiChanged=true, apexChanged=false, migrationsChanged=true/u);
    assert.match(output, /pnpm run deploy:cloud -- --web --api-image --watch/u);
    assert.match(output, /DB 마이그레이션\/스키마 변경 감지/u);

    const unknownLines = formatDeployScopeLines({ unknownScope: true });
    assert.match(unknownLines[0], /--base-sha/u);
  });
});
