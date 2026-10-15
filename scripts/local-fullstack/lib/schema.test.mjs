import assert from "node:assert/strict";
import { join } from "node:path";

import { REPOSITORY_ROOT } from "./config.mjs";
import { GuardViolationError } from "./guard.mjs";
import { bootstrapArguments, computeSchemaFingerprint, resolveReleaseSha, runBootstrap } from "./schema.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("bootstrapArguments: 운영 부트스트랩을 일회용 loopback 모드로 호출", () => {
  it("--execute + --allow-loopback + 런타임 역할 + 릴리스 SHA + 확인 문구를 모두 포함한다", () => {
    const args = bootstrapArguments({ runtimeRole: "toonstudio_local_runtime", releaseSha: SHA, confirmation: "CONFIRM-TOKEN" });
    assert.deepEqual(args, [
      "--execute",
      "--allow-loopback",
      "--runtime-database-role", "toonstudio_local_runtime",
      "--release-sha", SHA,
      "--confirmation", "CONFIRM-TOKEN",
    ]);
  });

  it("SHA 형식이 틀리면 거부한다", () => {
    for (const bad of ["", "HEAD", "abc", SHA.toUpperCase(), `${SHA}0`]) {
      assert.throws(() => bootstrapArguments({ runtimeRole: "r", releaseSha: bad, confirmation: "c" }), /SHA/u, bad);
    }
  });
});

describe("resolveReleaseSha", () => {
  it("git rev-parse HEAD 결과가 40자리 SHA 일 때만 허용한다", () => {
    assert.equal(resolveReleaseSha("/repo", () => ({ status: 0, stdout: `${SHA}\n` })), SHA);
    assert.throws(() => resolveReleaseSha("/repo", () => ({ status: 128, stdout: "" })), /SHA/u);
    assert.throws(() => resolveReleaseSha("/repo", () => ({ status: 0, stdout: "not-a-sha" })), /SHA/u);
  });
});

describe("runBootstrap: 로컬이 아닌 DB 에는 어떤 프로세스도 띄우기 전에 중단", () => {
  it("원격 마이그레이션 URL 이면 GuardViolationError", async () => {
    const remote = ["postgresql://", "admin", ":", "remote-password-123456", "@", "db.example-project.supabase.co:5432", "/postgres"].join("");
    await assert.rejects(
      () => runBootstrap({
        repositoryRoot: REPOSITORY_ROOT,
        adminUrl: remote,
        runtimePassword: "runtime-password-123456",
        runtimeRole: "toonstudio_local_runtime",
        releaseSha: SHA,
        logPath: join(REPOSITORY_ROOT, "never-written.log"),
      }),
      (error) => {
        assert.ok(error instanceof GuardViolationError);
        assert.ok(!error.message.includes("remote-password"));
        return true;
      },
    );
  });
});

describe("computeSchemaFingerprint", () => {
  it("운영 부트스트랩 계약의 sha256 지문을 돌려준다(스키마·마이그레이션이 같으면 같은 값)", async () => {
    const first = await computeSchemaFingerprint(REPOSITORY_ROOT);
    const second = await computeSchemaFingerprint(REPOSITORY_ROOT);
    assert.match(first, /^[0-9a-f]{64}$/u);
    assert.equal(first, second);
  });
});
