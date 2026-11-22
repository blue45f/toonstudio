const { afterEach, describe, test } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_REPOSITORY_ROOT,
  DEFAULT_REQUIRED_INFRA_KEYS,
  REQUIRED_VERIFIED_DIST_FILES,
  checkMigrationManifestDrift,
  formatDeployPreflightDriftReport,
  inspectInfrastructureEnvPresence,
  runDeployPreflightDriftChecks,
  validateBuildMetaSha,
  validateStandingApproval,
} from "./deploy-preflight-drift.mjs";

const tempRoots = [];

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempRepo() {
  const root = mkdtempSync(join(tmpdir(), "toonstudio-preflight-drift-"));
  tempRoots.push(root);
  return root;
}

function writeMigrations(root, sqlFiles, manifestLines) {
  const migrationDir = join(root, "apps/api/src/platform/database/migrations");
  const scriptsDir = join(root, "scripts");
  mkdirSync(migrationDir, { recursive: true });
  mkdirSync(scriptsDir, { recursive: true });
  for (const name of sqlFiles) {
    writeFileSync(join(migrationDir, name), "-- migration fixture\nSELECT 1;\n", "utf8");
  }
  writeFileSync(
    join(scriptsDir, "production-database-migrations.manifest"),
    `${manifestLines.join("\n")}\n`,
    "utf8",
  );
}

function writeStandingApprovals(root, rootApproval, staticApproval) {
  mkdirSync(join(root, "deploy/cloudflare-static"), { recursive: true });
  if (rootApproval !== null) {
    writeFileSync(
      join(root, "deploy/STANDING_APPROVAL.json"),
      typeof rootApproval === "string" ? rootApproval : `${JSON.stringify(rootApproval, null, 2)}\n`,
      "utf8",
    );
  }
  if (staticApproval !== null && staticApproval !== undefined) {
    writeFileSync(
      join(root, "deploy/cloudflare-static/STANDING_APPROVAL.json"),
      typeof staticApproval === "string" ? staticApproval : `${JSON.stringify(staticApproval, null, 2)}\n`,
      "utf8",
    );
  }
}

describe("deploy-preflight-drift", () => {
  describe("실제 저장소 기본 계약 검증", () => {
    test("현재 저장소의 migration manifest와 STANDING_APPROVAL.json이 드리프트 없이 통과한다", () => {
      const migrationReport = checkMigrationManifestDrift({ rootDir: DEFAULT_REPOSITORY_ROOT });
      assert.equal(migrationReport.ok, true, migrationReport.issues.join("\n"));
      assert.ok(migrationReport.manifestCount > 0);
      assert.equal(migrationReport.manifestCount, migrationReport.diskCount);
      assert.deepEqual(migrationReport.missingFiles, []);
      assert.deepEqual(migrationReport.unregisteredFiles, []);
      assert.deepEqual(migrationReport.orderMismatches, []);
      assert.deepEqual(migrationReport.sequenceGaps, []);

      const approvalReport = validateStandingApproval({
        rootDir: DEFAULT_REPOSITORY_ROOT,
        requiredScope: "cloudflare-static-production",
      });
      assert.equal(approvalReport.ok, true, approvalReport.issues.join("\n"));
      assert.equal(approvalReport.mode, "standing-approval");
      assert.equal(approvalReport.scopeAuthorized, true);
      assert.equal(approvalReport.staticApprovalValid, true);
    });
  });

  describe("checkMigrationManifestDrift", () => {
    test("manifest와 디스크 SQL 파일이 0001부터 연속 일치하면 통과한다", () => {
      const root = createTempRepo();
      const files = [
        "0001_init_ledger.sql",
        "0002_creator_work.sql",
        "0003_studio_review.sql",
      ];
      writeMigrations(
        root,
        files,
        files.map((name) => `apps/api/src/platform/database/migrations/${name}`),
      );

      const report = checkMigrationManifestDrift({ rootDir: root });
      assert.equal(report.ok, true);
      assert.equal(report.manifestCount, 3);
      assert.equal(report.diskCount, 3);
      assert.deepEqual(report.issues, []);
    });

    test("디스크에 누락된 SQL 파일과 manifest 미등록 SQL 파일을 각각 탐지한다", () => {
      const root = createTempRepo();
      writeMigrations(
        root,
        ["0001_init.sql", "0003_unregistered.sql"],
        [
          "apps/api/src/platform/database/migrations/0001_init.sql",
          "apps/api/src/platform/database/migrations/0002_missing_on_disk.sql",
        ],
      );

      const report = checkMigrationManifestDrift({ rootDir: root });
      assert.equal(report.ok, false);
      assert.deepEqual(report.missingFiles, [
        "apps/api/src/platform/database/migrations/0002_missing_on_disk.sql",
      ]);
      assert.deepEqual(report.unregisteredFiles, [
        "apps/api/src/platform/database/migrations/0003_unregistered.sql",
      ]);
      assert.ok(report.issues.some((issue) => issue.includes("누락된 SQL 파일")));
      assert.ok(report.issues.some((issue) => issue.includes("미등록된 SQL 파일")));
    });

    test("manifest 순서 뒤바뀜과 번호 연속성 공백을 탐지한다", () => {
      const root = createTempRepo();
      writeMigrations(
        root,
        ["0001_first.sql", "0002_second.sql", "0004_gap.sql"],
        [
          "apps/api/src/platform/database/migrations/0002_second.sql",
          "apps/api/src/platform/database/migrations/0001_first.sql",
          "apps/api/src/platform/database/migrations/0004_gap.sql",
        ],
      );

      const report = checkMigrationManifestDrift({ rootDir: root });
      assert.equal(report.ok, false);
      assert.equal(report.orderMismatches.length, 2);
      assert.equal(report.orderMismatches[0].index, 0);
      assert.equal(
        report.orderMismatches[0].expected,
        "apps/api/src/platform/database/migrations/0001_first.sql",
      );
      assert.equal(
        report.orderMismatches[0].actual,
        "apps/api/src/platform/database/migrations/0002_second.sql",
      );
      assert.ok(report.sequenceGaps.some((gap) => gap.expectedSequence === 3 && gap.actualSequence === 4));
    });

    test("중복 항목, 경로 탈출, 비정규 SQL 파일명을 차단한다", () => {
      const root = createTempRepo();
      writeMigrations(
        root,
        ["0001_init.sql", "scratch_note.sql"],
        [
          "apps/api/src/platform/database/migrations/0001_init.sql",
          "apps/api/src/platform/database/migrations/0001_init.sql",
          "apps/api/src/platform/database/migrations/../../secret.sql",
        ],
      );

      const report = checkMigrationManifestDrift({ rootDir: root });
      assert.equal(report.ok, false);
      assert.deepEqual(report.duplicateEntries, [
        "apps/api/src/platform/database/migrations/0001_init.sql",
      ]);
      assert.deepEqual(report.invalidEntries, [
        "apps/api/src/platform/database/migrations/../../secret.sql",
      ]);
      assert.deepEqual(report.nonCanonicalFiles, [
        "apps/api/src/platform/database/migrations/scratch_note.sql",
      ]);
    });

    test("manifest 파일이 없으면 fail-closed로 실패한다", () => {
      const root = createTempRepo();
      const report = checkMigrationManifestDrift({ rootDir: root });
      assert.equal(report.ok, false);
      assert.ok(report.issues.some((issue) => issue.includes("manifest 파일이 없습니다")));
    });
  });

  describe("validateStandingApproval", () => {
    const validRootApproval = {
      grantedAt: "2026-10-16",
      grantedBy: "저장소 소유자",
      note: "상시 승인 범위에 포함된 배포 단위는 매 릴리스 별도 승인 없이 배포한다.",
      scopes: [
        "cloudflare-static-production",
        "core-api-container-release",
      ],
    };
    const validStaticApproval = {
      grantedAt: "2026-10-13",
      grantedBy: "저장소 소유자",
      note: "정적 웹 상시 승인 파일",
      scope: "cloudflare-static-production",
    };

    test("유효한 상시 승인 파일과 요청 scope를 승인한다", () => {
      const root = createTempRepo();
      writeStandingApprovals(root, validRootApproval, validStaticApproval);

      const report = validateStandingApproval({
        rootDir: root,
        requiredScope: "cloudflare-static-production",
      });
      assert.equal(report.ok, true);
      assert.equal(report.mode, "standing-approval");
      assert.equal(report.scopeAuthorized, true);
      assert.equal(report.staticApprovalValid, true);
    });

    test("상시 승인 범위 밖의 배포 단위(onpod 등)는 명시 승인 모드로 차단한다", () => {
      const root = createTempRepo();
      writeStandingApprovals(root, validRootApproval, validStaticApproval);

      const report = validateStandingApproval({
        rootDir: root,
        requiredScope: "onpod-core-api-image-deploy",
      });
      assert.equal(report.ok, false);
      assert.equal(report.mode, "explicit-approval-required");
      assert.equal(report.scopeAuthorized, false);
      assert.ok(report.issues.some((issue) => issue.includes("상시 승인 범위 밖")));
    });

    test("파일 삭제 또는 JSON 파손 시 명시 승인 방식으로 fail-closed 복귀한다", () => {
      const missingRoot = createTempRepo();
      const missingReport = validateStandingApproval({ rootDir: missingRoot });
      assert.equal(missingReport.ok, false);
      assert.equal(missingReport.mode, "explicit-approval-required");

      const brokenRoot = createTempRepo();
      writeStandingApprovals(brokenRoot, "{broken-json", null);
      const brokenReport = validateStandingApproval({ rootDir: brokenRoot });
      assert.equal(brokenReport.ok, false);
      assert.equal(brokenReport.mode, "explicit-approval-required");
    });

    test("금지된 파괴적 scope 및 잘못된 달력 날짜를 거부한다", () => {
      const root = createTempRepo();
      writeStandingApprovals(
        root,
        {
          grantedAt: "2026-02-31",
          grantedBy: "저장소 소유자",
          note: "짧음",
          scopes: [
            "cloudflare-static-production",
            "production-database-migrations",
            "database-repair-mode",
          ],
        },
        validStaticApproval,
      );

      const report = validateStandingApproval({ rootDir: root });
      assert.equal(report.ok, false);
      assert.ok(report.issues.some((issue) => issue.includes("grantedAt")));
      assert.ok(report.issues.some((issue) => issue.includes("note")));
      assert.ok(report.issues.some((issue) => issue.includes("production-database-migrations")));
      assert.ok(report.issues.some((issue) => issue.includes("database-repair-mode")));
    });
  });

  describe("validateBuildMetaSha", () => {
    const shaA = "a".repeat(40);
    const shaB = "b".repeat(40);

    test("gitSha와 buildId가 승인 SHA와 일치하면 통과한다", () => {
      const root = createTempRepo();
      for (const rel of REQUIRED_VERIFIED_DIST_FILES) {
        const full = join(root, rel);
        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, "ok\n", "utf8");
      }
      writeFileSync(
        join(root, "dist/.vite/build-meta.json"),
        JSON.stringify({ gitSha: shaA, buildId: "0123456789abcdef", catalogSource: "static" }),
        "utf8",
      );

      const report = validateBuildMetaSha({
        rootDir: root,
        expectedSha: shaA,
        expectedCatalogSource: "static",
        requireDistArtifacts: true,
      });
      assert.equal(report.ok, true);
      assert.equal(report.actualSha, shaA);
      assert.equal(report.buildId, "0123456789abcdef");
      assert.deepEqual(report.missingArtifacts, []);
    });

    test("gitSha 불일치·build-meta 누락·필수 산출물 누락을 모두 차단한다", () => {
      const root = createTempRepo();
      mkdirSync(join(root, "dist/.vite"), { recursive: true });
      writeFileSync(
        join(root, "dist/.vite/build-meta.json"),
        JSON.stringify({ gitSha: shaB, buildId: "short" }),
        "utf8",
      );

      const mismatch = validateBuildMetaSha({
        rootDir: root,
        expectedSha: shaA,
        requireDistArtifacts: true,
      });
      assert.equal(mismatch.ok, false);
      assert.ok(mismatch.issues.some((issue) => issue.includes("일치하지 않습니다")));
      assert.ok(mismatch.issues.some((issue) => issue.includes("buildId")));
      assert.ok(mismatch.missingArtifacts.includes("dist/index.html"));

      const missingRoot = createTempRepo();
      const missing = validateBuildMetaSha({ rootDir: missingRoot, expectedSha: shaA });
      assert.equal(missing.ok, false);
      assert.ok(missing.issues.some((issue) => issue.includes("build-meta.json 파일이 없습니다")));
    });
  });

  describe("inspectInfrastructureEnvPresence", () => {
    test("값·부분 문자열을 전혀 노출하지 않고 boolean 존재·마스킹 상태만 반환한다", () => {
      const root = createTempRepo();
      const envPath = join(root, ".env.infrastructure.local");
      const sentinelValues = [
        "synthetic-fixture-val-alpha-901234567890",
        "synthetic-fixture-val-beta-890123456789",
        "synthetic-fixture-val-gamma-789012345678",
        "synthetic-fixture-val-delta-678901234567",
        "synthetic-fixture-val-epsilon-567890123456",
        "synthetic-fixture-val-zeta-456789012345",
        "synthetic-fixture-val-eta-345678901234",
        "synthetic-fixture-val-theta-234567890123",
      ];
      const lines = DEFAULT_REQUIRED_INFRA_KEYS.map((key, idx) => `${key}=${sentinelValues[idx]}`);
      lines.push("ONPOD_API_ENV_EXTRA_FLAG=true");
      writeFileSync(envPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
      chmodSync(envPath, 0o600);

      const report = inspectInfrastructureEnvPresence({ rootDir: root });
      assert.equal(report.ok, true);
      assert.equal(report.fileExists, true);
      assert.equal(report.permissionsSafe, true);
      assert.deepEqual(report.missingRequiredKeys, []);
      assert.deepEqual(report.placeholderRequiredKeys, []);
      assert.equal(report.onpodApiEnvKeyCount, 6);

      for (const reqKey of DEFAULT_REQUIRED_INFRA_KEYS) {
        const entry = report.keys.find((item) => item.key === reqKey);
        assert.equal(entry?.present, true);
        assert.equal(entry?.maskedState, "present");
        assert.equal(entry?.maskedValue, "<masked>");
      }

      const serialized = JSON.stringify(report);
      const formatted = formatDeployPreflightDriftReport({
        ok: true,
        migrationManifest: { ok: true, manifestCount: 1, diskCount: 1, issues: [] },
        standingApproval: { ok: true, mode: "standing-approval", scopes: ["a"], issues: [] },
        buildMeta: { skipped: true, ok: true, issues: [] },
        infrastructureEnv: report,
        blockingIssues: [],
      });
      for (const sentinel of sentinelValues) {
        assert.equal(serialized.includes(sentinel), false);
        assert.equal(formatted.includes(sentinel), false);
      }
    });

    test("누락 키·자리표시자 값·넓은 파일 권한(0644)을 정확히 보고한다", () => {
      const root = createTempRepo();
      const envPath = join(root, ".env.infrastructure.local");
      writeFileSync(
        envPath,
        [
          "CLOUDFLARE_ACCOUNT_ID=change-me",
          "CLOUDFLARE_API_TOKEN=<placeholder-token>",
          "ONPOD_DEPLOY_TOKEN=fixture-present-value-ok",
        ].join("\n"),
        { encoding: "utf8", mode: 0o644 },
      );
      chmodSync(envPath, 0o644);

      const report = inspectInfrastructureEnvPresence({
        rootDir: root,
        requiredKeys: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "ONPOD_DEPLOY_TOKEN", "ONPOD_API_ENV_AUTH_SESSION_SECRET"],
        optionalKeys: ["CORE_ORIGIN_SECRET"],
      });
      assert.equal(report.ok, false);
      assert.equal(report.permissionsSafe, false);
      assert.deepEqual(report.missingRequiredKeys, ["ONPOD_API_ENV_AUTH_SESSION_SECRET"]);
      assert.deepEqual(report.placeholderRequiredKeys, ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
      assert.ok(report.warnings.some((warning) => warning.includes("chmod 600")));

      const serialized = JSON.stringify(report);
      assert.equal(serialized.includes("fixture-present-value-ok"), false);
      assert.equal(serialized.includes("<placeholder-token>"), false);
      assert.equal(serialized.includes("change-me"), false);
    });

    test(".env.infrastructure.local이 없으면 fileExists=false와 누락 필수 키 목록을 반환한다", () => {
      const root = createTempRepo();
      const report = inspectInfrastructureEnvPresence({
        rootDir: root,
        requiredKeys: ["CLOUDFLARE_ACCOUNT_ID", "ONPOD_DEPLOY_TOKEN"],
        optionalKeys: [],
      });
      assert.equal(report.ok, false);
      assert.equal(report.fileExists, false);
      assert.deepEqual(report.missingRequiredKeys, ["CLOUDFLARE_ACCOUNT_ID", "ONPOD_DEPLOY_TOKEN"]);
      assert.equal(report.keys[0].maskedState, "missing");
      assert.equal(report.keys[0].maskedValue, null);
    });
  });

  describe("runDeployPreflightDriftChecks 통합 점검", () => {
    test("모든 드리프트 항목과 build-meta SHA가 일치하면 종합 통과한다", () => {
      const root = createTempRepo();
      const sha = "c".repeat(40);
      writeMigrations(
        root,
        ["0001_init.sql"],
        ["apps/api/src/platform/database/migrations/0001_init.sql"],
      );
      writeStandingApprovals(
        root,
        {
          grantedAt: "2026-10-16",
          grantedBy: "저장소 소유자",
          note: "배포 전 드리프트 통합 검증 테스트용 상시 승인 파일",
          scopes: ["cloudflare-static-production"],
        },
        {
          grantedAt: "2026-10-13",
          grantedBy: "저장소 소유자",
          note: "정적 웹 상시 승인",
          scope: "cloudflare-static-production",
        },
      );
      mkdirSync(join(root, "dist/.vite"), { recursive: true });
      writeFileSync(
        join(root, "dist/.vite/build-meta.json"),
        JSON.stringify({ gitSha: sha, buildId: "abcdef012345" }),
        "utf8",
      );

      const report = runDeployPreflightDriftChecks({
        rootDir: root,
        expectedSha: sha,
        requiredScope: "cloudflare-static-production",
      });
      assert.equal(report.ok, true);
      assert.deepEqual(report.blockingIssues, []);
      assert.match(formatDeployPreflightDriftReport(report), /종합 판정: 통과/u);
    });
  });
});
