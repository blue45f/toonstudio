import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  REHEARSAL_SCHEMA,
  SW_PRECACHE_BUDGET_BYTES,
  buildZeroProductionWriteEnv,
  evaluateReleaseRehearsalVerdict,
  inspectLocalBuildGate,
  inspectLocalFullStackSmokeGate,
  inspectServiceWorkerBudgetGate,
  inspectStudioBundleGate,
  isRemoteUrlTarget,
  parseRehearsalArgs,
  runLocalReleaseRehearsal,
} from "./local-release-rehearsal.mjs";

function makeTempFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "toonstudio-rehearsal-test-"));
  const distPath = path.join(dir, "dist");
  mkdirSync(path.join(distPath, ".vite"), { recursive: true });
  mkdirSync(path.join(distPath, "assets"), { recursive: true });
  mkdirSync(path.join(dir, "scripts"), { recursive: true });
  writeFileSync(path.join(dir, "scripts", "verify-local-full-stack.mjs"), "export {};\n");
  writeFileSync(path.join(dir, "scripts", "validate-app-boundaries.mjs"), "process.exit(0);\n");
  writeFileSync(path.join(dir, "scripts", "check-source-file-size.mjs"), "process.exit(0);\n");
  writeFileSync(path.join(dir, "scripts", "check-studio-eager-graph.mjs"), "process.exit(0);\n");
  writeFileSync(path.join(dir, "scripts", "check-unconnected-code.mjs"), "process.exit(0);\n");
  return { dir, distPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("local-release-rehearsal (T-064)", () => {
  it("CLI 인자를 정확히 파싱하고 잘못된 인자는 거부한다", () => {
    const parsed = parseRehearsalArgs(["--mode=execute", "--dist-dir", "custom-dist", "--skip=local-fullstack-smoke"]);
    assert.equal(parsed.mode, "execute");
    assert.equal(parsed.distDir, "custom-dist");
    assert.equal(parsed.skip.has("local-fullstack-smoke"), true);

    assert.throws(() => parseRehearsalArgs(["--mode=production"]), /inspect 또는 execute/u);
    assert.throws(() => parseRehearsalArgs(["--skip=unknown-gate"]), /알 수 없는 게이트/u);
  });

  it("운영 토큰과 원격 DB/API 주소를 자식 환경변수에서 완전히 제거한다", () => {
    assert.equal(isRemoteUrlTarget("https://toonstudio-api.onpod.ai"), true);
    assert.equal(isRemoteUrlTarget("postgresql://user:pw@db.example.com:5432/app"), true);
    assert.equal(isRemoteUrlTarget("postgresql://postgres:pw@127.0.0.1:5432/local"), false);
    assert.equal(isRemoteUrlTarget("http://localhost:4019"), false);

    const { env, strippedKeys } = buildZeroProductionWriteEnv({
      PATH: "/usr/bin",
      CLOUDFLARE_API_TOKEN: "secret-cf",
      ONPOD_DEPLOY_TOKEN: "secret-onpod",
      R2_ACCESS_KEY_ID: "secret-r2",
      DATABASE_URL: "postgresql://user:pw@toonstudio-db.db.onpod.local:5432/prod",
      CORE_API_ORIGIN: "https://toonstudio-api.onpod.ai",
      LOCAL_SAFE_FLAG: "yes",
    });

    assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
    assert.equal(env.ONPOD_DEPLOY_TOKEN, undefined);
    assert.equal(env.R2_ACCESS_KEY_ID, undefined);
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(env.CORE_API_ORIGIN, undefined);
    assert.equal(env.LOCAL_SAFE_FLAG, "yes");
    assert.equal(env.TOONSTUDIO_LOCAL_REHEARSAL_DRY_RUN, "1");
    assert.equal(env.TOONSTUDIO_FORBID_REMOTE_WRITES, "1");
    assert.ok(strippedKeys.includes("CLOUDFLARE_API_TOKEN"));
    assert.ok(strippedKeys.includes("ONPOD_DEPLOY_TOKEN"));
    assert.ok(strippedKeys.includes("DATABASE_URL"));
  });

  it("로컬 빌드 산출물 누락 및 SHA 불일치를 BLOCKED 사유로 잡아낸다", () => {
    const fixture = makeTempFixture();
    try {
      const missingRes = inspectLocalBuildGate({
        root: fixture.dir,
        distPath: fixture.distPath,
        headSha: "a".repeat(40),
      });
      assert.equal(missingRes.status, "fail");
      assert.ok(missingRes.details.missing.length >= 2);

      writeFileSync(path.join(fixture.distPath, "index.html"), "<!doctype html>\n");
      writeFileSync(path.join(fixture.distPath, ".vite", "manifest.json"), "{}");
      writeFileSync(
        path.join(fixture.distPath, ".vite", "build-meta.json"),
        JSON.stringify({ gitSha: "b".repeat(40) }),
      );
      const mismatchRes = inspectLocalBuildGate({
        root: fixture.dir,
        distPath: fixture.distPath,
        headSha: "a".repeat(40),
      });
      assert.equal(mismatchRes.status, "fail");
      assert.equal(mismatchRes.details.shaMatchesHead, false);

      writeFileSync(
        path.join(fixture.distPath, ".vite", "build-meta.json"),
        JSON.stringify({ gitSha: "a".repeat(40) }),
      );
      const okRes = inspectLocalBuildGate({
        root: fixture.dir,
        distPath: fixture.distPath,
        headSha: "a".repeat(40),
      });
      assert.equal(okRes.status, "pass");
    } finally {
      fixture.cleanup();
    }
  });

  it("스튜디오 번들 매니페스트에서 테스트·원본 TS 누출을 검출한다", () => {
    const fixture = makeTempFixture();
    try {
      writeFileSync(
        path.join(fixture.distPath, ".vite", "manifest.json"),
        JSON.stringify({
          "index.html": { file: "assets/index-12345678.js" },
          "src/foo.test.ts": { file: "assets/foo.test-12345678.js", src: "src/foo.test.ts" },
        }),
      );
      const leaked = inspectStudioBundleGate({
        root: fixture.dir,
        distPath: fixture.distPath,
        mode: "inspect",
        env: {},
        runCommand: () => ({ ok: true, exitCode: 0, durationMs: 1, stdout: "", stderr: "" }),
      });
      assert.equal(leaked.status, "fail");
      assert.deepEqual(leaked.details.emittedTestAssets, ["src/foo.test.ts"]);
    } finally {
      fixture.cleanup();
    }
  });

  it("서비스 워커 프리캐시 예산을 실측하고 초과 시 fail을 반환한다", () => {
    const fixture = makeTempFixture();
    try {
      writeFileSync(path.join(fixture.distPath, "assets", "app.js"), "console.log('ok');\n");
      writeFileSync(
        path.join(fixture.distPath, ".vite", "manifest.json"),
        JSON.stringify({
          "index.html": { file: "assets/app.js", css: [] },
        }),
      );
      const passRes = inspectServiceWorkerBudgetGate({
        distPath: fixture.distPath,
        budgets: SW_PRECACHE_BUDGET_BYTES,
      });
      assert.equal(passRes.status, "pass");
      assert.ok(passRes.details.criticalBytes > 0);

      const failRes = inspectServiceWorkerBudgetGate({
        distPath: fixture.distPath,
        budgets: { criticalBytes: 5, warmBytes: 512 },
      });
      assert.equal(failRes.status, "fail");
      assert.equal(failRes.details.criticalWithin, false);
    } finally {
      fixture.cleanup();
    }
  });

  it("원격 DATABASE_URL이 주입되면 로컬 풀스택 스모크 게이트가 즉시 차단(fail-closed)한다", () => {
    const fixture = makeTempFixture();
    try {
      const blocked = inspectLocalFullStackSmokeGate({
        root: fixture.dir,
        mode: "inspect",
        env: {},
        runCommand: () => ({ ok: true, exitCode: 0, durationMs: 1, stdout: "", stderr: "" }),
        sourceEnv: { DATABASE_URL: "postgresql://u:p@remote.db.internal:5432/prod" },
      });
      assert.equal(blocked.status, "fail");
      assert.equal(blocked.details.remoteDatabaseBlocked, true);
    } finally {
      fixture.cleanup();
    }
  });

  it("모든 게이트가 통과하면 READY, 하나라도 실패하면 BLOCKED 판정 JSON을 출력한다", () => {
    const fixture = makeTempFixture();
    try {
      const sha = "c".repeat(40);
      writeFileSync(path.join(fixture.distPath, "index.html"), "<!doctype html>\n");
      writeFileSync(path.join(fixture.distPath, "assets", "entry.js"), "export const ready = true;\n");
      writeFileSync(
        path.join(fixture.distPath, ".vite", "manifest.json"),
        JSON.stringify({
          "index.html": { file: "assets/entry.js", css: [], imports: [] },
        }),
      );
      writeFileSync(
        path.join(fixture.distPath, ".vite", "build-meta.json"),
        JSON.stringify({ gitSha: sha }),
      );

      const fakeRunner = (cmd, args) => {
        if (cmd === "git" && args[0] === "rev-parse") {
          return { ok: true, exitCode: 0, durationMs: 1, stdout: `${sha}\n`, stderr: "" };
        }
        if (cmd === "git" && args[0] === "status") {
          return { ok: true, exitCode: 0, durationMs: 1, stdout: "", stderr: "" };
        }
        return { ok: true, exitCode: 0, durationMs: 2, stdout: "ok\n", stderr: "" };
      };

      const readyReport = runLocalReleaseRehearsal(
        { root: fixture.dir, distDir: "dist", mode: "inspect", skip: new Set() },
        { runCommand: fakeRunner, sourceEnv: { PATH: process.env.PATH ?? "" } },
      );

      assert.equal(readyReport.schema, REHEARSAL_SCHEMA);
      assert.equal(readyReport.verdict, "READY");
      assert.equal(readyReport.zeroProductionWrites, true);
      assert.equal(readyReport.remoteMutationCalls, 0);
      assert.equal(readyReport.deploymentAuthorized, false);
      assert.equal(readyReport.summary.passedCount, 5);
      assert.equal(readyReport.summary.failedCount, 0);

      const blockedVerdict = evaluateReleaseRehearsalVerdict({
        gates: [
          { id: "local-build", status: "pass", reasonKo: "ok" },
          { id: "architecture-boundaries", status: "fail", reasonKo: "경계 위반", nextCommand: "pnpm run validate:app-boundaries" },
        ],
        zeroProductionWrites: true,
        remoteMutationCalls: 0,
        git: { sha, dirty: false, dirtyCount: 0 },
        mode: "inspect",
      });
      assert.equal(blockedVerdict.verdict, "BLOCKED");
      assert.equal(blockedVerdict.blockingReasons.length, 1);
      assert.deepEqual(blockedVerdict.nextCommands, ["pnpm run validate:app-boundaries"]);
    } finally {
      fixture.cleanup();
    }
  });
});
