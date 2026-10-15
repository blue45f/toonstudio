import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MANAGED_BLOCK_HEADER,
  applyEnvUpdates,
  assertGitIgnored,
  formatEnvAssignment,
  inspectEnvFile,
  parseEnvValue,
  readEnvFileText,
  readEnvValues,
  writeEnvFileAtomic,
} from "./env-file.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

function withTemporaryDirectory(work) {
  const directory = mkdtempSync(join(tmpdir(), "local-fullstack-env-"));
  try {
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("parseEnvValue / readEnvValues", () => {
  it("따옴표·export·주석·마지막 대입 우선 규칙을 해석한다", () => {
    const text = [
      "# 주석",
      "OTHER_SERVICE_TOKEN=keep-this-line",
      "export TOONSTUDIO_LOCAL_A=plain # 뒤 주석",
      'TOONSTUDIO_LOCAL_B="with space and \\"quote\\""',
      "TOONSTUDIO_LOCAL_C='single quoted'",
      "TOONSTUDIO_LOCAL_A=last-wins",
      "",
    ].join("\n");
    const values = readEnvValues(text, ["TOONSTUDIO_LOCAL_A", "TOONSTUDIO_LOCAL_B", "TOONSTUDIO_LOCAL_C", "TOONSTUDIO_LOCAL_MISSING"]);
    assert.equal(values.TOONSTUDIO_LOCAL_A, "last-wins");
    assert.equal(values.TOONSTUDIO_LOCAL_B, 'with space and "quote"');
    assert.equal(values.TOONSTUDIO_LOCAL_C, "single quoted");
    assert.equal(values.TOONSTUDIO_LOCAL_MISSING, undefined);
    assert.equal(values.OTHER_SERVICE_TOKEN, undefined, "요청하지 않은 키는 읽지 않는다");
  });

  it("따옴표 없는 값의 ` #` 앞까지만 값으로 본다", () => {
    assert.equal(parseEnvValue("abc#def # comment"), "abc#def");
  });
});

describe("formatEnvAssignment", () => {
  it("URL·base64url 값은 그대로, 공백·따옴표가 있으면 이스케이프한다", () => {
    assert.equal(formatEnvAssignment("K", "postgresql://u:p@127.0.0.1:1/db"), "K=postgresql://u:p@127.0.0.1:1/db");
    assert.equal(formatEnvAssignment("K", "a b"), 'K="a b"');
    assert.equal(formatEnvAssignment("K", 'a"b\\c'), 'K="a\\"b\\\\c"');
  });

  it("줄바꿈이 있는 값은 거부한다", () => {
    assert.throws(() => formatEnvAssignment("K", "a\nb"), /줄바꿈/u);
  });
});

describe("applyEnvUpdates: 다른 줄은 보존하고 하네스 키만 갱신", () => {
  const existing = [
    "# 운영 비밀 저장소(다른 작업이 쓰는 값)",
    "CLOUDFLARE_API_TOKEN=do-not-touch",
    "export RENDER_API_KEY=also-do-not-touch",
    "",
    "TOONSTUDIO_LOCAL_TEST_EMAIL=old@example.test",
    "",
  ].join("\n");

  it("새 키는 관리 블록 머리말과 함께 추가하고 기존 줄은 바이트 그대로 둔다", () => {
    const result = applyEnvUpdates(existing, { TOONSTUDIO_LOCAL_TEST_PASSWORD: "new-secret-value" });
    assert.deepEqual(result.added, ["TOONSTUDIO_LOCAL_TEST_PASSWORD"]);
    assert.deepEqual(result.replaced, []);
    for (const preserved of existing.split("\n").filter(Boolean)) {
      assert.ok(result.text.includes(preserved), `보존 실패: ${preserved.slice(0, 20)}`);
    }
    assert.ok(result.text.includes(MANAGED_BLOCK_HEADER));
    assert.ok(result.text.endsWith("TOONSTUDIO_LOCAL_TEST_PASSWORD=new-secret-value\n"));
  });

  it("이미 있는 키는 제자리에서 교체하고 export 접두어를 유지한다", () => {
    const text = "FIRST=1\nexport TOONSTUDIO_LOCAL_X=old\nLAST=2\n";
    const result = applyEnvUpdates(text, { TOONSTUDIO_LOCAL_X: "new" });
    assert.equal(result.text, "FIRST=1\nexport TOONSTUDIO_LOCAL_X=new\nLAST=2\n");
    assert.deepEqual(result.replaced, ["TOONSTUDIO_LOCAL_X"]);
  });

  it("값이 같으면 아무것도 바꾸지 않는다(멱등)", () => {
    const first = applyEnvUpdates("", { TOONSTUDIO_LOCAL_X: "v", TOONSTUDIO_LOCAL_Y: "w" });
    const second = applyEnvUpdates(first.text, { TOONSTUDIO_LOCAL_X: "v", TOONSTUDIO_LOCAL_Y: "w" });
    assert.equal(second.text, first.text);
    assert.deepEqual(second.added, []);
    assert.deepEqual(second.replaced, []);
  });

  it("마지막 줄 개행이 없거나 CRLF 인 파일도 깨뜨리지 않는다", () => {
    const noNewline = applyEnvUpdates("A=1", { TOONSTUDIO_LOCAL_X: "v" });
    assert.ok(noNewline.text.startsWith("A=1\n"));
    assert.ok(noNewline.text.includes("TOONSTUDIO_LOCAL_X=v"));
    const crlf = applyEnvUpdates("A=1\r\nTOONSTUDIO_LOCAL_X=old\r\n", { TOONSTUDIO_LOCAL_X: "new" });
    assert.ok(crlf.text.startsWith("A=1\r\nTOONSTUDIO_LOCAL_X=new\r\n"));
  });

  it("머리말은 중복해서 추가하지 않는다", () => {
    const first = applyEnvUpdates("", { TOONSTUDIO_LOCAL_X: "1" });
    const second = applyEnvUpdates(first.text, { TOONSTUDIO_LOCAL_Z: "2" });
    assert.equal(second.text.split(MANAGED_BLOCK_HEADER).length - 1, 1);
  });
});

describe("writeEnvFileAtomic / inspectEnvFile", () => {
  it("새 파일은 0600 으로 만들고 임시 파일을 남기지 않는다", () => {
    withTemporaryDirectory((directory) => {
      const target = join(directory, ".env.infrastructure.local");
      writeEnvFileAtomic(target, "A=1\n");
      assert.equal(statSync(target).mode & 0o777, 0o600);
      assert.equal(readEnvFileText(target), "A=1\n");
      assert.deepEqual(readdirSync(directory), [".env.infrastructure.local"]);
      assert.deepEqual(inspectEnvFile(target), { exists: true, mode: "600", private: true });
    });
  });

  it("권한이 느슨한 기존 파일도 쓰기 후 0600 으로 교정한다", () => {
    withTemporaryDirectory((directory) => {
      const target = join(directory, ".env.infrastructure.local");
      writeFileSync(target, "OLD=1\n", { mode: 0o644 });
      chmodSync(target, 0o644);
      assert.equal(inspectEnvFile(target).private, false);
      writeEnvFileAtomic(target, "NEW=1\n");
      assert.equal(statSync(target).mode & 0o777, 0o600);
    });
  });

  it("심볼릭 링크는 링크가 아니라 실제 대상 파일을 갱신한다", () => {
    withTemporaryDirectory((directory) => {
      const real = join(directory, "real.env");
      const link = join(directory, "link.env");
      writeFileSync(real, "A=1\n");
      symlinkSync(real, link);
      writeEnvFileAtomic(link, "B=2\n");
      assert.equal(readFileSync(real, "utf8"), "B=2\n");
      assert.ok(statSync(link).isFile());
    });
  });

  it("파일이 없으면 빈 텍스트로 읽는다", () => {
    withTemporaryDirectory((directory) => {
      assert.equal(readEnvFileText(join(directory, "missing.env")), "");
      assert.equal(existsSync(join(directory, "missing.env")), false);
    });
  });

  it("없는 디렉터리에도 0700 으로 만들어 쓴다", () => {
    withTemporaryDirectory((directory) => {
      const nested = join(directory, "a", "b");
      mkdirSync(directory, { recursive: true });
      writeEnvFileAtomic(join(nested, "x.env"), "A=1\n");
      assert.equal(readFileSync(join(nested, "x.env"), "utf8"), "A=1\n");
    });
  });
});

describe("assertGitIgnored", () => {
  const run = (status, error) => () => ({ status, error });

  it("git 이 무시하면 통과한다", () => {
    assert.deepEqual(assertGitIgnored("/repo/.env.infrastructure.local", { runCommand: run(0) }), { status: "ignored" });
  });

  it("저장소 안인데 무시되지 않으면 쓰기 전에 중단한다", () => {
    assert.throws(
      () => assertGitIgnored("/repo/.env.infrastructure.local", { runCommand: run(1) }),
      /무시되지 않습니다/u,
    );
  });

  it("저장소가 아니거나 git 이 없으면 상태만 돌려준다", () => {
    assert.deepEqual(assertGitIgnored("/tmp/x.env", { runCommand: run(128) }), { status: "not-a-repository" });
    assert.deepEqual(assertGitIgnored("/tmp/x.env", { runCommand: run(null, new Error("ENOENT")) }), { status: "git-unavailable" });
  });

  it("실제 git 으로 .env* 규칙이 이 하네스의 비밀 파일을 무시하는지 확인한다", () => {
    const repositoryRoot = join(import.meta.dirname, "..", "..", "..");
    const result = assertGitIgnored(join(repositoryRoot, ".env.infrastructure.local"));
    assert.ok(["ignored", "git-unavailable"].includes(result.status), result.status);
  });
});
