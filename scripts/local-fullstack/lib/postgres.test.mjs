import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { stackPaths } from "./config.mjs";
import {
  assertCanRunPostgres,
  embeddedPostgresPackageSuffix,
  ensureEmbeddedPostgres,
  initdbArguments,
  installedEmbeddedVersion,
  pickMappedIdentity,
  postgresServerArguments,
  resolveBinaries,
  unprivilegedCommand,
} from "./postgres.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

function withTemporaryStack(work) {
  const directory = mkdtempSync(join(tmpdir(), "local-fullstack-pg-"));
  try {
    return work(stackPaths(directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function fakeInstall(paths, version, suffix = embeddedPostgresPackageSuffix()) {
  const binaryDirectory = join(paths.tools, "node_modules", "@embedded-postgres", suffix, "native", "bin");
  mkdirSync(binaryDirectory, { recursive: true });
  for (const name of ["initdb", "postgres"]) writeFileSync(join(binaryDirectory, name), "#!/bin/sh\n");
  mkdirSync(join(paths.tools, "node_modules", "embedded-postgres"), { recursive: true });
  writeFileSync(join(paths.tools, "node_modules", "embedded-postgres", "package.json"), JSON.stringify({ name: "embedded-postgres", version }));
}

describe("PostgreSQL 서버 인자: loopback 전용·일회용 설정", () => {
  const args = postgresServerArguments({ dataDirectory: "/data", port: 55452 });
  const settings = args.filter((value, index) => args[index - 1] === "-c");

  it("127.0.0.1 에서만 listen 하고 unix 소켓을 만들지 않는다", () => {
    assert.ok(settings.includes("listen_addresses=127.0.0.1"));
    assert.ok(settings.includes("unix_socket_directories="));
    assert.ok(!settings.some((setting) => /listen_addresses=(\*|0\.0\.0\.0|::)/u.test(setting)));
    assert.deepEqual(args.slice(0, 4), ["-D", "/data", "-p", "55452"]);
  });

  it("일회용 DB 이므로 fsync 를 끄고, 오류 시 쿼리 본문(해시 등)을 로그에 남기지 않는다", () => {
    for (const setting of ["fsync=off", "synchronous_commit=off", "full_page_writes=off", "log_min_error_statement=panic", "log_statement=none"]) {
      assert.ok(settings.includes(setting), setting);
    }
  });

  it("initdb 인자는 비밀번호 파일 경로만 받고 비밀번호 값은 싣지 않는다", () => {
    const initdb = initdbArguments({ dataDirectory: "/data", adminUser: "admin_role", passwordFile: "/tmp/pwfile" });
    assert.ok(initdb.includes("--pwfile"));
    assert.ok(initdb.includes("--auth=scram-sha-256"));
    assert.ok(initdb.includes("--username"));
    assert.ok(!initdb.some((value) => /password=/iu.test(value)));
  });
});

describe("root 실행 우회(unshare -U)", () => {
  const passwd = [
    "root:x:0:0:root:/root:/bin/bash",
    "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin",
    "postgres:x:102:104:PostgreSQL administrator:/var/lib/postgresql:/bin/bash",
    "ubuntu:x:1000:1000:Ubuntu:/home/ubuntu:/bin/bash",
    "nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin",
  ].join("\n");

  it("매핑 대상은 uid 1000 이상 일반 사용자를 우선하고 없으면 nobody, 그것도 없으면 1000", () => {
    assert.deepEqual(pickMappedIdentity(passwd), { uid: 1000, gid: 1000 });
    assert.deepEqual(pickMappedIdentity("root:x:0:0::/root:/bin/sh\nnobody:x:65534:65534::/:/bin/false"), { uid: 65534, gid: 65534 });
    assert.deepEqual(pickMappedIdentity("root:x:0:0::/root:/bin/sh"), { uid: 1000, gid: 1000 });
    assert.deepEqual(pickMappedIdentity(""), { uid: 1000, gid: 1000 });
  });

  it("root 면 unshare 로 감싸고 인자 배열을 그대로 보존한다", () => {
    const wrapped = unprivilegedCommand("/bin/postgres", ["-D", "/d y"], { uid: 0, platform: "linux", passwdText: passwd });
    assert.equal(wrapped.command, "unshare");
    assert.deepEqual(wrapped.args, ["-U", "--map-user=1000", "--map-group=1000", "--", "/bin/postgres", "-D", "/d y"]);
  });

  it("비root 이거나 Windows 면 그대로 실행한다", () => {
    assert.deepEqual(unprivilegedCommand("/bin/postgres", ["-D", "/d"], { uid: 1000, platform: "linux" }), { command: "/bin/postgres", args: ["-D", "/d"] });
    assert.deepEqual(unprivilegedCommand("/bin/postgres", [], { uid: 0, platform: "win32" }), { command: "/bin/postgres", args: [] });
  });

  it("우회가 동작하지 않는 환경이면 복구 방법을 안내하는 오류를 낸다", () => {
    if (process.getuid?.() !== 0) return;
    assert.throws(
      () => assertCanRunPostgres({ runCommand: () => ({ status: 1, stdout: "", error: new Error("blocked") }) }),
      /unshare|비root/u,
    );
  });
});

describe("embedded-postgres 설치(스택 디렉터리 안에만)", () => {
  it("바이너리 경로는 tools/node_modules/@embedded-postgres/<플랫폼>/native/bin 이다", () => {
    withTemporaryStack((paths) => {
      const binaries = resolveBinaries(paths, { platform: "linux", arch: "x64" });
      assert.equal(binaries.postgres, join(paths.tools, "node_modules", "@embedded-postgres", "linux-x64", "native", "bin", "postgres"));
      assert.throws(() => resolveBinaries(paths, { platform: "freebsd", arch: "x64" }), /지원하지 않/u);
    });
  });

  it("같은 버전이 이미 있으면 npm 을 실행하지 않는다", () => {
    withTemporaryStack((paths) => {
      fakeInstall(paths, "17.10.0-beta.17");
      let called = 0;
      const result = ensureEmbeddedPostgres({
        paths,
        version: "17.10.0-beta.17",
        runCommand: () => {
          called += 1;
          return { status: 0 };
        },
      });
      assert.equal(result.installed, false);
      assert.equal(called, 0);
      assert.equal(installedEmbeddedVersion(paths), "17.10.0-beta.17");
    });
  });

  it("없으면 정확한 버전을 --prefix 로 스택 디렉터리에 설치하고 --ignore-scripts 를 쓰지 않는다", () => {
    withTemporaryStack((paths) => {
      const calls = [];
      const result = ensureEmbeddedPostgres({
        paths,
        version: "17.10.0-beta.17",
        runCommand: (command, args, options) => {
          calls.push({ command, args, options });
          fakeInstall(paths, "17.10.0-beta.17");
          return { status: 0, stdout: "", stderr: "" };
        },
      });
      assert.equal(result.installed, true);
      assert.equal(calls.length, 1);
      const { args, options } = calls[0];
      assert.ok(args.includes("embedded-postgres@17.10.0-beta.17"));
      assert.equal(args[args.indexOf("--prefix") + 1], paths.tools);
      assert.ok(args.includes("--save-exact"));
      assert.ok(!args.includes("--ignore-scripts"), "postinstall(심볼릭 링크 복원)이 필요하다");
      // 설치 프로세스에는 호출 셸의 토큰이 전달되지 않는다.
      assert.equal(options.env.GH_TOKEN, undefined);
      assert.ok(existsSync(join(paths.tools, "package.json")));
      assert.equal(JSON.parse(readFileSync(join(paths.tools, "package.json"), "utf8")).private, true);
    });
  });

  it("버전이 다르면 다시 설치하고, 설치 실패는 한글 오류로 알린다", () => {
    withTemporaryStack((paths) => {
      fakeInstall(paths, "16.0.0");
      assert.throws(
        () => ensureEmbeddedPostgres({ paths, version: "17.10.0-beta.17", runCommand: () => ({ status: 1, stderr: "E404" }) }),
        /설치에 실패/u,
      );
    });
  });

  it("바이너리에 실행 권한을 보장한다", () => {
    withTemporaryStack((paths) => {
      const result = ensureEmbeddedPostgres({
        paths,
        version: "17.10.0-beta.17",
        runCommand: () => {
          fakeInstall(paths, "17.10.0-beta.17");
          const binaries = resolveBinaries(paths);
          chmodSync(binaries.postgres, 0o644);
          return { status: 0 };
        },
      });
      assert.ok(result.installed);
    });
  });
});
