import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** 테스트가 사용하는 두 종류의 알려진 checkout 조건식만 해석한다. */
export function sparsePatterns(block, { shard = "studio-editing", eventName = "workflow_dispatch" } = {}) {
  const body = block.match(/sparse-checkout: \|\n((?: {12}[^\n]*\n)+)/u)?.[1];
  assert.ok(body, "초기 sparse checkout 선언이 필요합니다.");
  return body.split("\n").filter(Boolean).flatMap((raw) => {
    const line = raw.slice(12);
    if (!line.startsWith("${{")) {
      assert.match(line, /^!?\//u, `알 수 없는 sparse 패턴: ${line}`);
      return [line];
    }
    const conditional = line.match(/^\$\{\{ (matrix\.shard|github\.event_name) == '([a-z0-9_-]+)' && '(\/?[A-Za-z0-9_./*-]*)' \|\| '(\/?[A-Za-z0-9_./*-]*)' \}\}$/u);
    assert.ok(conditional, `지원하지 않는 checkout 조건식: ${line}`);
    const actual = conditional[1] === "matrix.shard" ? shard : eventName;
    const selected = actual === conditional[2] ? conditional[3] : conditional[4];
    return selected ? [selected] : [];
  });
}

/** 실제 사용자 Git 설정·토큰을 상속하지 않는 임시 저장소 전용 환경이다. */
export function fixtureGitEnvironment(root, additions = {}) {
  return {
    PATH: process.env.PATH,
    LANG: "C",
    LC_ALL: "C",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(root, "fixture-global.gitconfig"),
    GIT_TERMINAL_PROMPT: "0",
    ...additions,
  };
}

/** 문서 본문을 체크아웃하지 않는 lane도 Git 추적 정본의 누락은 거부한다. */
export function assertTrackedDocumentInputs(inputs, { cwd = fileURLToPath(new URL("../", import.meta.url)), env } = {}) {
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--",
    ...inputs.map((path) => `:(literal)${path.slice(1)}`)], { cwd, env, encoding: "utf8" });
  assert.equal(tracked.status, 0,
    `foundation 문서 정본이 Git 추적 목록에 없습니다: ${inputs.join(", ")}\n${tracked.error?.message ?? tracked.stderr}`);
}
