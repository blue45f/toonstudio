import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULTS, ENV_KEYS, PROCESS_ENV, stackPaths } from "./config.mjs";
import {
  assertPrerequisites,
  createRedactingForwarder,
  loadContext,
  redactForOutput,
  resolvePorts,
  scanForSecrets,
} from "./commands.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

function withTemporaryDirectory(work) {
  const directory = mkdtempSync(join(tmpdir(), "local-fullstack-commands-"));
  try {
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const SECRET = "Zq4-forwarder-secret-0123456789abcdef";

describe("resolvePorts: 인자 > 환경변수 > 기존 값 > 기본값", () => {
  const existing = {
    [ENV_KEYS.migrationDatabaseUrl]: ["postgresql://", "u", ":", "p-0123456789", "@127.0.0.1:55500/db"].join(""),
    [ENV_KEYS.apiOrigin]: "http://127.0.0.1:4200",
    [ENV_KEYS.webOrigin]: "http://127.0.0.1:5300",
  };

  it("기본값", () => {
    assert.deepEqual(resolvePorts({}, {}, {}), { pg: DEFAULTS.pgPort, api: DEFAULTS.apiPort, web: DEFAULTS.webPort });
  });

  it("비밀 파일의 기존 값이 기본값보다 우선한다", () => {
    assert.deepEqual(resolvePorts({}, {}, existing), { pg: 55500, api: 4200, web: 5300 });
  });

  it("환경변수가 기존 값보다, 인자가 환경변수보다 우선한다", () => {
    const environment = { [PROCESS_ENV.pgPort]: "55600", [PROCESS_ENV.apiPort]: "4300" };
    assert.deepEqual(resolvePorts({}, environment, existing), { pg: 55600, api: 4300, web: 5300 });
    assert.deepEqual(resolvePorts({ pgPort: "55700", webPort: "5400" }, environment, existing), { pg: 55700, api: 4300, web: 5400 });
  });

  it("범위를 벗어난 포트는 거부한다", () => {
    assert.throws(() => resolvePorts({ pgPort: "80" }, {}, {}), /포트/u);
    assert.throws(() => resolvePorts({ apiPort: "70000" }, {}, {}), /포트/u);
    assert.throws(() => resolvePorts({ webPort: "abc" }, {}, {}), /포트/u);
  });
});

describe("createRedactingForwarder: 줄 단위로 비밀을 가린다", () => {
  function collect() {
    const written = [];
    const collected = [];
    return {
      target: { write: (text) => written.push(text) },
      collected,
      written,
      forwarder: null,
    };
  }

  it("청크 경계에 걸쳐 쪼개진 비밀값도 가리고, 마지막 미완성 줄은 flush 로 내보낸다", () => {
    withTemporaryDirectory((directory) => {
      const envFile = join(directory, "harness.env");
      writeFileSync(envFile, `${ENV_KEYS.testPassword}=${SECRET}\n`);
      loadContext({}, { [PROCESS_ENV.envFile]: envFile, [PROCESS_ENV.stackDir]: join(directory, "stack") });

      const sink = collect();
      sink.forwarder = createRedactingForwarder(sink.target, (text) => sink.collected.push(text));
      const half = Math.floor(SECRET.length / 2);
      sink.forwarder.write(Buffer.from(`로그인 실패: ${SECRET.slice(0, half)}`));
      assert.deepEqual(sink.written, [], "줄이 끝나기 전에는 내보내지 않는다");
      sink.forwarder.write(Buffer.from(`${SECRET.slice(half)} 입력\n다음 줄 일부`));
      sink.forwarder.flush();

      const output = sink.written.join("");
      assert.ok(!output.includes(SECRET), "비밀값이 출력됨");
      assert.ok(!output.includes(SECRET.slice(0, half)), "비밀값 앞부분이 출력됨");
      assert.match(output, /로그인 실패: \[REDACTED\] 입력\n다음 줄 일부$/u);
      assert.equal(sink.collected.join(""), output);
      assert.equal(redactForOutput(`x ${SECRET} y`), "x [REDACTED] y");
    });
  });
});

describe("scanForSecrets", () => {
  it("중첩 디렉터리에서 비밀값 건수를 세고 짧은 값·없는 경로는 무시한다", () => {
    withTemporaryDirectory((directory) => {
      mkdirSync(join(directory, "logs", "nested"), { recursive: true });
      writeFileSync(join(directory, "logs", "a.log"), `${SECRET} ... ${SECRET}\n`);
      writeFileSync(join(directory, "logs", "nested", "b.log"), `앞 ${SECRET} 뒤\n`);
      writeFileSync(join(directory, "logs", "clean.log"), "깨끗함\n");
      const findings = scanForSecrets({
        secrets: [{ key: "TEST_KEY", value: SECRET }, { key: "SHORT", value: "abc" }, { key: "EMPTY", value: "" }],
        targets: [join(directory, "logs"), join(directory, "missing")],
      });
      assert.equal(findings.length, 2);
      assert.deepEqual(
        findings.map((finding) => [finding.path.replace(directory, ""), finding.key, finding.count]).sort(),
        [["/logs/a.log", "TEST_KEY", 2], ["/logs/nested/b.log", "TEST_KEY", 1]],
      );
    });
  });
});

describe("assertPrerequisites: 파일을 만들기 전에 필요한 도구를 한꺼번에 확인", () => {
  it("psql·git 이 없으면 시작하지 않고 누락 항목을 모두 안내한다", () => {
    withTemporaryDirectory((directory) => {
      const emptyBin = join(directory, "empty-bin");
      mkdirSync(emptyBin);
      const originalPath = process.env.PATH;
      process.env.PATH = emptyBin;
      try {
        assert.throws(
          () => assertPrerequisites(stackPaths(join(directory, "stack")), { noWeb: true }),
          (error) => {
            assert.match(error.message, /사전 조건을 만족하지 못해/u);
            assert.match(error.message, /psql/u);
            assert.match(error.message, /git/u);
            assert.match(error.message, /npm/u);
            return true;
          },
        );
      } finally {
        process.env.PATH = originalPath;
      }
    });
  });
});
