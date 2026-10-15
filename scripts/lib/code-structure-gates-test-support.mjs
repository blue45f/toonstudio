/**
 * 코드 구조 가드레일(소스 파일 크기·Studio 진입 그래프) 테스트 공용 도우미.
 *
 * 임시 git 저장소를 만들고 CLI 를 실제 프로세스로 실행한다. 훅이 주입한 GIT_* 환경 변수와 사용자 설정이
 * 호출자의 저장소/인덱스를 건드리지 않도록 격리한다.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import path from "node:path";

export function isolatedEnvironment(environment = process.env) {
  return {
    ...Object.fromEntries(Object.entries(environment).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: devNull,
  };
}

export function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: isolatedEnvironment() });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} 실패: ${result.stderr}`);
  return result.stdout.trim();
}

export function writeTree(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents, "utf8");
  }
}

/** 파일 트리를 가진 임시 git 저장소(인덱스에 add 만 한 상태)를 만든다. 테스트 종료 시 지운다. */
export function createRepository(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), "toonstudio-code-structure-"));
  (t.onTestFinished ?? t.after.bind(t))(() => rmSync(root, { force: true, recursive: true }));
  git(root, ["init", "--quiet"]);
  writeTree(root, files);
  git(root, ["add", "-A"]);
  return root;
}

/** CLI 스크립트를 별도 프로세스로 실행한다. */
export function runCli(script, root, args = []) {
  const result = spawnSync(process.execPath, [script, "--root", root, ...args], {
    cwd: root, encoding: "utf8", env: isolatedEnvironment(), timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

/** 줄 수를 정확히 맞춘 소스 텍스트. */
export function linesOf(count, line = "export const value = 1;") {
  return `${Array.from({ length: count }, () => line).join("\n")}\n`;
}
