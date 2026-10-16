import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// 검증 스크립트가 tmpdir() 아래 임시 디렉터리 이름을 시각(Date.now)·프로세스 번호·난수만으로 정하면,
// 같은 시스템의 다른 사용자가 이름을 미리 만들어 두거나 심볼릭 링크로 바꿔치기할 수 있다(CWE-377).
// fs.mkdtempSync(join(tmpdir(), "이름-")) 는 무작위 접미사와 0700 권한으로 디렉터리를 새로 만든다.
const PREDICTABLE_TEMP_PATH =
  /tmpdir\(\),[^`\n]*`[^`\n]*\$\{(?:Date\.now\(\)|process\.pid|Math\.random\(\))\}/u;

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCANNED_ROOTS = ["scripts", "tools"] as const;
const SCRIPT_FILE = /\.(?:mjs|cjs|js|mts|cts|ts|tsx)$/u;
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);
const BACKTICK = "`";

// 이 파일 자체가 같은 규칙에 걸리지 않도록 예시 줄은 조각을 이어 붙여 만든다.
function templateTempPath(expression: string): string {
  return ["join(tmpdir(), ", BACKTICK, "toonstudio-x-$", "{", expression, "}", BACKTICK, ");"].join("");
}

function scriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRECTORIES.has(entry.name) ? [] : scriptFiles(path);
    return entry.isFile() && SCRIPT_FILE.test(entry.name) ? [path] : [];
  });
}

describe("예측 가능한 임시 경로 금지", () => {
  it("탐지 규칙이 시각·프로세스·난수 기반 이름만 잡고 mkdtemp 는 통과시킨다", () => {
    const bad = [
      templateTempPath("Date.now()"),
      `  ?? ${templateTempPath("Date.now()")}`,
      templateTempPath("process.pid"),
      templateTempPath("Math.random()"),
    ];
    const good = [
      'const out = mkdtempSync(join(tmpdir(), "toonstudio-x-"));',
      '?? join(tmpdir(), "toonstudio-fixed-name");',
      ["const stamp = ", BACKTICK, "run-$", "{Date.now()}", BACKTICK, ";"].join(""),
    ];
    for (const line of bad) expect(PREDICTABLE_TEMP_PATH.test(line), line).toBe(true);
    for (const line of good) expect(PREDICTABLE_TEMP_PATH.test(line), line).toBe(false);
  });

  it("scripts/ 와 tools/ 의 스크립트는 임시 디렉터리 이름을 예측 가능하게 만들지 않는다", () => {
    const offenders: string[] = [];
    for (const root of SCANNED_ROOTS) {
      for (const file of scriptFiles(join(REPOSITORY_ROOT, root))) {
        readFileSync(file, "utf8").split("\n").forEach((line, index) => {
          if (PREDICTABLE_TEMP_PATH.test(line)) {
            offenders.push(`${relative(REPOSITORY_ROOT, file)}:${index + 1}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
