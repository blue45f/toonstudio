import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import {
  classifyLicenseExpression,
  evaluateSoloCommercialReadiness,
  formatSoloCommercialReadinessKo,
} from "./verify-solo-commercial-readiness.mjs";

const { describe, test } = process.env.VITEST
  ? await import("vitest")
  : await import("node:test");

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts/verify-solo-commercial-readiness.mjs");

function withTempFixture(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "toonstudio-solo-readiness-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("verify-solo-commercial-readiness (1인 기업 상용 라이선스·OpenSSF 태세 가드)", () => {
  test("실제 저장소에서 1초 이내에 통과하고 Remotion 3인 경계·p5/opencascade.js LGPL·OpenSSF 태세를 보고한다", () => {
    const report = evaluateSoloCommercialReadiness({ rootDir: REPO_ROOT, teamSize: 1 });

    assert.equal(report.ok, true, `예상치 못한 차단 위반: ${JSON.stringify(report.blockers)}`);
    assert.ok(report.elapsedMs < 1000, `1초 이내 완료 필요 (실측 ${report.elapsedMs}ms)`);
    assert.equal(report.remotionBoundary.detected, true);
    assert.equal(report.remotionBoundary.status, "free-solo-eligible");
    assert.match(report.remotionBoundary.noticeKo, /3인 이하 무료/u);

    const lgplNames = new Set(report.lgplPackages.map((item) => item.name));
    assert.ok(lgplNames.has("opencascade.js"), "opencascade.js LGPL 상태 리포트가 필요합니다");
    assert.ok(lgplNames.has("p5"), "p5 LGPL 상태 리포트가 필요합니다");

    const occt = report.lgplPackages.find((item) => item.name === "opencascade.js");
    assert.equal(occt?.boundaryDocPresent, true);
    assert.equal(occt?.status, "tracked-lgpl-boundary");

    const p5 = report.lgplPackages.find((item) => item.name === "p5");
    assert.match(p5?.license ?? "", /LGPL/u);
    assert.match(p5?.installedVia ?? "", /p5\.brush/u);

    assert.equal(report.securityPosture.openssfWorkflowPresent, true);
    assert.equal(report.securityPosture.openssfUsesReadAll, false);
    assert.equal(report.securityPosture.openssfScheduleOnlyOrManual, true);
    assert.equal(report.securityPosture.openssfPinnedActions, true);
    assert.equal(report.securityPosture.openssfRetentionDaysValid, true);
    assert.equal(report.securityPosture.openssfSarifUploadPresent, true);
    assert.equal(report.securityPosture.status, "ready");

    const summaryText = formatSoloCommercialReadinessKo(report);
    assert.match(summaryText, /1인 기업 상용 준비 통과/u);
    assert.match(summaryText, /opencascade\.js/u);
    assert.match(summaryText, /p5@/u);
  });

  test("PNPM 중첩 피어의 버전과 직접 부모 출처를 괄호·패치 메타데이터와 구분한다", () => {
    const cases = [
      { key: "p5.brush@2.2.1(patch_hash=fixture)(p5@2.3.1(typescript@6.0.3))", via: "p5.brush@2.2.1" },
      { key: "@studio/brush@1.0.0(@studio/runtime@2.0.0(p5@2.3.1(typescript@6.0.3)))", via: "@studio/runtime@2.0.0" },
      { key: "brush-host@1.0.0(p5@2.3.1)(typescript@6.0.3)", via: "brush-host@1.0.0" },
    ];
    for (const { key, via } of cases) withTempFixture((dir) => {
      writeJson(path.join(dir, "package.json"), { name: "fixture-nested-peers" });
      writeFileSync(path.join(dir, "pnpm-lock.yaml"),
        `lockfileVersion: '9.0'\npackages:\n  p5@2.3.1:\n    resolution: {integrity: sha512-fixture}\nsnapshots:\n  '${key}':\n    dependencies: {}\n`, "utf8");
      const report = evaluateSoloCommercialReadiness({ rootDir: dir, includeNodeModules: false });
      assert.equal(report.ok, true);
      const p5 = report.lgplPackages.find(item => item.name === "p5");
      assert.equal(p5?.version, "2.3.1");
      assert.equal(p5?.installedVia, `peer/transitive via ${via}`);
      assert.match(p5?.license ?? "", /LGPL/u);
    });
  });

  test("SPDX 분류기는 GPL·AGPL·SSPL·CC-BY-NC를 차단하고 LGPL 및 허용적 OR 이중 라이선스는 오탐하지 않는다", () => {
    assert.equal(classifyLicenseExpression("GPL-3.0-only").status, "blocked");
    assert.deepEqual(classifyLicenseExpression("GPL-3.0-only").blockedCategories, ["GPL"]);

    assert.equal(classifyLicenseExpression("AGPL-3.0-or-later").status, "blocked");
    assert.deepEqual(classifyLicenseExpression("AGPL-3.0-or-later").blockedCategories, ["AGPL"]);

    assert.equal(classifyLicenseExpression("SSPL-1.0").status, "blocked");
    assert.deepEqual(classifyLicenseExpression("SSPL-1.0").blockedCategories, ["SSPL"]);

    assert.equal(classifyLicenseExpression("CC-BY-NC-4.0").status, "blocked");
    assert.deepEqual(classifyLicenseExpression("CC-BY-NC-4.0").blockedCategories, ["CC-BY-NC"]);

    assert.equal(classifyLicenseExpression("(MIT AND GPL-2.0-only)").status, "blocked");
    assert.equal(classifyLicenseExpression("(BSD-3-Clause OR GPL-2.0)").status, "permissive");
    assert.equal(classifyLicenseExpression("LGPL-2.1-only").status, "lgpl");
    assert.equal(classifyLicenseExpression("LGPL-3.0-or-later").status, "lgpl");
    assert.equal(classifyLicenseExpression("MIT").status, "permissive");
  });

  test("package.json 또는 pnpm-lock.yaml에 mixbox가 유입되면 즉시 차단한다", () => {
    withTempFixture((dir) => {
      writeJson(path.join(dir, "package.json"), {
        name: "fixture-mixbox-pkg",
        dependencies: { mixbox: "2.0.0" },
      });
      const report = evaluateSoloCommercialReadiness({ rootDir: dir, includeNodeModules: false });
      assert.equal(report.ok, false);
      assert.ok(report.blockers.some((b) => b.code === "BLOCKED_PACKAGE_MIXBOX"));
    });

    withTempFixture((dir) => {
      writeJson(path.join(dir, "package.json"), { name: "fixture-mixbox-lock" });
      writeFileSync(
        path.join(dir, "pnpm-lock.yaml"),
        "lockfileVersion: '9.0'\npackages:\n  '@scrtwpns/mixbox@2.0.0':\n    resolution: {integrity: sha512-test}\n",
        "utf8",
      );
      const report = evaluateSoloCommercialReadiness({ rootDir: dir, includeNodeModules: false });
      assert.equal(report.ok, false);
      assert.ok(report.blockers.some((b) => b.code === "BLOCKED_PACKAGE_MIXBOX"));
    });
  });

  test("설치된 패키지에 GPL·AGPL·SSPL·CC-BY-NC 라이선스가 유입되면 모두 차단한다", () => {
    const forbiddenCases = [
      { pkg: "bad-gpl", license: "GPL-3.0-only", category: "GPL" },
      { pkg: "bad-agpl", license: "AGPL-3.0-only", category: "AGPL" },
      { pkg: "bad-sspl", license: "SSPL-1.0", category: "SSPL" },
      { pkg: "bad-nc", license: "CC-BY-NC-4.0", category: "CC-BY-NC" },
    ];

    for (const item of forbiddenCases) {
      withTempFixture((dir) => {
        writeJson(path.join(dir, "package.json"), {
          name: "fixture-license-block",
          dependencies: { [item.pkg]: "1.0.0" },
        });
        writeJson(path.join(dir, "node_modules", item.pkg, "package.json"), {
          name: item.pkg,
          version: "1.0.0",
          license: item.license,
        });

        const report = evaluateSoloCommercialReadiness({ rootDir: dir });
        assert.equal(report.ok, false, `${item.license}는 차단되어야 합니다`);
        assert.ok(
          report.blockers.some((b) => b.category === item.category && b.packageName === item.pkg),
          `${item.category} 위반 항목 누락`,
        );
      });
    }
  });

  test("Remotion은 3인 이하 무료 경계로 안내하고 4인 이상에서는 상업 라이선스 차단을 발생시킨다", () => {
    withTempFixture((dir) => {
      writeJson(path.join(dir, "package.json"), {
        name: "fixture-remotion",
        dependencies: { remotion: "4.0.543", "@remotion/player": "4.0.543" },
      });

      const solo = evaluateSoloCommercialReadiness({
        rootDir: dir,
        teamSize: 3,
        includeNodeModules: false,
      });
      assert.equal(solo.ok, true);
      assert.equal(solo.remotionBoundary.status, "free-solo-eligible");

      const team4 = evaluateSoloCommercialReadiness({
        rootDir: dir,
        teamSize: 4,
        includeNodeModules: false,
      });
      assert.equal(team4.ok, false);
      assert.equal(team4.remotionBoundary.status, "commercial-license-required");
      assert.ok(team4.blockers.some((b) => b.code === "REMOTION_COMMERCIAL_LICENSE_REQUIRED"));
    });
  });

  test("CLI(--json 및 --out)가 실제 저장소에서 1초 이내 정상 종료하고 유효한 JSON을 출력한다", () => {
    withTempFixture((dir) => {
      const outFile = path.join(dir, "readiness.json");
      const raw = execFileSync(
        process.execPath,
        [SCRIPT_PATH, "--json", "--out", outFile],
        { cwd: REPO_ROOT, encoding: "utf8" },
      );
      const parsed = JSON.parse(raw);
      const fromDisk = JSON.parse(readFileSync(outFile, "utf8"));
      assert.equal(parsed.ok, true);
      assert.equal(fromDisk.ok, true);
      assert.ok(parsed.elapsedMs < 1000, `CLI 실행 1초 미만 필요 (실측 ${parsed.elapsedMs}ms)`);
      assert.equal(parsed.remotionBoundary.detected, true);
    });
  });

  test("의존성 없는 가드를 먼저 실행하고 YAML 계약 테스트 전에 잠긴 개발 의존성을 설치한다", () => {
    const workflowPath = path.join(REPO_ROOT, ".github/workflows/openssf-scorecard.yml");
    const parsed = parseYaml(readFileSync(workflowPath, "utf8"));
    const steps = parsed.jobs?.["solo-commercial-readiness"]?.steps ?? [];
    const guardIndex = steps.findIndex((step) =>
      step.run?.startsWith("node scripts/verify-solo-commercial-readiness.mjs "),
    );
    const pnpmIndex = steps.findIndex((step) =>
      step.uses?.startsWith("pnpm/action-setup@"),
    );
    const installIndex = steps.findIndex((step) =>
      /\bpnpm\b[^\n]*\binstall\b/u.test(step.run ?? ""),
    );
    const testIndex = steps.findIndex((step) =>
      step.run === "node --test scripts/verify-solo-commercial-readiness.test.mjs",
    );

    assert.ok(guardIndex >= 0, "설치 전 독립 실행 가드가 필요합니다");
    assert.ok(pnpmIndex > guardIndex, "기존 가드를 의존성 설치 없이 먼저 실행해야 합니다");
    assert.ok(installIndex > pnpmIndex, "pnpm 준비 후 테스트 의존성을 설치해야 합니다");
    assert.ok(testIndex > installIndex, "YAML을 사용하는 Node 테스트 전에 의존성 설치가 필요합니다");
    assert.match(steps[pnpmIndex].uses, /@[a-f0-9]{40}$/u, "pnpm 준비 액션은 SHA로 고정합니다");
    assert.equal(steps[pnpmIndex].with?.run_install, false, "중복 자동 설치를 하지 않습니다");
    assert.match(steps[installIndex].run, /--filter\s+toonstudio\b/u);
    assert.match(steps[installIndex].run, /--dev\b/u, "계약 검사에 필요한 개발 의존성만 설치합니다");
    assert.match(steps[installIndex].run, /--frozen-lockfile\b/u, "기존 잠금 버전을 사용해야 합니다");
    assert.match(steps[installIndex].run, /--ignore-scripts\b/u, "불필요한 설치 후 빌드를 실행하지 않습니다");
    assert.equal(steps[installIndex]["continue-on-error"], undefined);
    assert.equal(steps[testIndex]["continue-on-error"], undefined);
  });

  test(".github/workflows/openssf-scorecard.yml은 주간 오프피크 schedule+dispatch 전용·최소 권한·retention-days: 5·SARIF 업로드 계약을 만족한다", () => {
    const workflowPath = path.join(REPO_ROOT, ".github/workflows/openssf-scorecard.yml");
    const source = readFileSync(workflowPath, "utf8");
    const parsed = parseYaml(source);

    assert.equal(parsed.on.push, undefined, "main push 트리거 홍수 금지");
    assert.equal(parsed.on.pull_request, undefined, "PR 트리거 홍수 금지");
    assert.ok(Array.isArray(parsed.on.schedule) && parsed.on.schedule.length === 1);
    assert.ok(Object.hasOwn(parsed.on, "workflow_dispatch"));

    assert.notEqual(parsed.permissions, "read-all", "permissions: read-all 금지");
    assert.deepEqual(parsed.permissions, {}, "최상위 permissions는 빈 객체({})로 최소화");
    assert.ok(typeof parsed.concurrency?.group === "string" && parsed.concurrency.group.length > 0);

    const scorecardJob = parsed.jobs?.scorecard;
    assert.ok(scorecardJob, "scorecard 잡 필요");
    assert.deepEqual(scorecardJob.permissions, {
      "security-events": "write",
      contents: "read",
      actions: "read",
    });

    const uploadSteps = Object.values(parsed.jobs ?? {}).flatMap((job) =>
      (job.steps ?? []).filter(
        (step) => typeof step.uses === "string" && step.uses.startsWith("actions/upload-artifact@"),
      ),
    );
    assert.ok(uploadSteps.length >= 2);
    for (const step of uploadSteps) {
      assert.equal(step.with?.["retention-days"], 5);
    }

    const sarifUpload = (scorecardJob.steps ?? []).find(
      (step) =>
        typeof step.uses === "string" &&
        step.uses.startsWith("github/codeql-action/upload-sarif@"),
    );
    assert.ok(sarifUpload, "SARIF 업로드 단계가 필요합니다");
  });

  test("모든 워크플로는 최상위 쓰기 권한·비고정 npm/pip 설치·curl 파이프 실행을 허용하지 않는다", () => {
    const workflowsDir = path.join(REPO_ROOT, ".github/workflows");
    const files = readdirSync(workflowsDir).filter((name) => /\.ya?ml$/u.test(name)).sort();
    const violations = [];

    for (const file of files) {
      const parsed = parseYaml(readFileSync(path.join(workflowsDir, file), "utf8"));
      if (typeof parsed.permissions === "string") {
        violations.push(`${file}: 문자열 최상위 permissions(${parsed.permissions}) 금지`);
      } else {
        for (const [scope, level] of Object.entries(parsed.permissions ?? {})) {
          if (level === "write") {
            violations.push(`${file}: 최상위 쓰기 권한(${scope}: write)은 잡 단위로 내려야 합니다`);
          }
        }
      }
      for (const [jobId, job] of Object.entries(parsed.jobs ?? {})) {
        for (const step of job?.steps ?? []) {
          if (typeof step?.run !== "string") continue;
          for (const rawLine of step.run.split("\n")) {
            const line = rawLine.trim();
            if (line.startsWith("#")) continue;
            if (/\bnpm\s+(?:install|i|update|install-test)\b/u.test(line)) {
              violations.push(`${file} (${jobId}): 비고정 npm 설치 금지 -> ${line}`);
            }
            if (/\bpip3?\s+install\b/u.test(line) && !/--require-hashes\b/u.test(line)) {
              violations.push(`${file} (${jobId}): --require-hashes 없는 pip 설치 금지 -> ${line}`);
            }
            if (/\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z|da|a)?sh\b/u.test(line)) {
              violations.push(`${file} (${jobId}): 다운로드 즉시 셸 파이프 실행 금지 -> ${line}`);
            }
          }
        }
      }
    }

    assert.deepEqual(violations, [], `OpenSSF Scorecard 회귀 감지:\n${violations.join("\n")}`);
  });

  test("SECURITY.md는 비공개 취약점 제보 URL과 협조적 공개 원칙·기한을 명시하고 promo-render lockfile이 제품 버전과 일치한다", () => {
    const policy = readFileSync(path.join(REPO_ROOT, "SECURITY.md"), "utf8");
    assert.match(policy, /https:\/\/github\.com\/blue45f\/toonstudio\/security\/advisories\/new/u);
    assert.match(policy, /vulnerability/iu);
    assert.match(policy, /disclos/iu);
    assert.match(policy, /\b90\b/u);

    const promoSource = readFileSync(
      path.join(REPO_ROOT, "apps/web/src/domains/creator/promo/promo-remotion.ts"),
      "utf8",
    );
    const versionMatch = promoSource.match(/PROMO_REMOTION_VERSION\s*=\s*"([^"]+)"/u);
    assert.ok(versionMatch?.[1], "PROMO_REMOTION_VERSION 선언이 필요합니다");
    const promoToolPkg = JSON.parse(
      readFileSync(path.join(REPO_ROOT, ".github/ci-tools/promo-render/package.json"), "utf8"),
    );
    assert.equal(promoToolPkg.dependencies.remotion, versionMatch[1]);
    assert.equal(promoToolPkg.dependencies["@remotion/cli"], versionMatch[1]);
  });
});
