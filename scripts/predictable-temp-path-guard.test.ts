import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 검증 스크립트가 `os.tmpdir()` 아래 경로 이름을 시각·프로세스 번호·난수만으로 정하는 코드를 막는 가드(CWE-377).
 * 같은 시스템의 다른 사용자가 그 이름을 미리 만들어 두거나 심볼릭 링크로 바꿔치기할 수 있기 때문이다.
 * `fs.mkdtempSync(join(tmpdir(), "이름-"))` 는 무작위 접미사와 0700 권한으로 디렉터리를 새로 만든다.
 *
 * 이 가드가 막는 것 — `tmpdir()` 에서 이어지는 경로 표현식 안에 시각·프로세스·난수 값이 들어간 경우
 *   (`Date.now()`, `new Date()`, `performance.now()`, `process.pid`, `process.hrtime()`, `Math.random()`).
 *   - `join`/`resolve` 의 인자, 문자열 `+` 연결, 템플릿 리터럴 보간 어디에 있어도 잡는다.
 *   - 여러 줄로 나눈 식, `.toString(36)`·`String(...)` 같은 가공, `os.tmpdir()` 호출도 잡는다.
 *   - 코드 구조(AST)로 판정하므로 주석이나 문자열 안의 같은 글자는 잡지 않는다.
 *   - `mkdtemp`/`mkdtempSync` 의 인자는 예외다. 접두사에 시각이 들어 있어도 mkdtemp 가 무작위 접미사를 붙인다.
 *
 * 이 가드가 막지 않는 것 — 예측 가능한 이름이라도 아래는 이 규칙의 범위 밖이며 남아 있다(2026-10-16 기준, scripts/·tools/).
 *   - 고정 이름 `join(tmpdir(), "toonstudio-…")`: 비시험 스크립트 42곳.
 *     예: scripts/verify-studio-brushes.mts:144, scripts/probe-stroke-wobble.mts:22, scripts/verify-playground-creative.mjs:9.
 *   - `"/tmp/…"` 고정 경로 리터럴: 비시험 스크립트 20곳(17개 파일).
 *     예: scripts/qa-studio-unified-workflow.mjs:8, scripts/verify-studio-long-session.mts:35.
 *     (시험 파일의 `/tmp/…` 는 존재하지 않는 경로를 흉내 낸 값이라 세지 않았다.)
 *   - `tmpdir()` 를 변수에 담아 두었다가 다른 문장에서 이름을 조합하는 경우, `process.env.TMPDIR` 같은 다른 원천.
 * 고정 이름은 같은 위치에 결과를 덮어쓰며 재사용하려는 의도가 많아 한꺼번에 바꾸지 않았다. 별도 정리 대상이다.
 */

const TEMP_DIRECTORY_FUNCTION = "tmpdir";
const PATH_JOINERS: ReadonlySet<string> = new Set(["join", "resolve"]);
const MKDTEMP_FUNCTIONS: ReadonlySet<string> = new Set(["mkdtemp", "mkdtempSync"]);
// 호출하면 시각·프로세스·난수에서 값이 나오는 함수(공백을 뺀 호출 대상 텍스트).
const PREDICTABLE_CALLS: ReadonlySet<string> = new Set([
  "Date.now",
  "performance.now",
  "Math.random",
  "process.hrtime",
  "process.hrtime.bigint",
]);
const PREDICTABLE_PROPERTIES: ReadonlySet<string> = new Set(["process.pid", "process.ppid"]);

function calleeName(call: ts.CallExpression): string | null {
  const { expression } = call;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function compactText(node: ts.Node, file: ts.SourceFile): string {
  return node.getText(file).replace(/\s+/gu, "");
}

function isTempDirectoryCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node)
    && node.arguments.length === 0
    && calleeName(node) === TEMP_DIRECTORY_FUNCTION;
}

/**
 * `tmpdir()` 호출에서 시작해, 그 결과로 경로 이름을 만드는 식 전체를 찾는다. join/resolve 의 인자이거나 `+` 연결, 템플릿 리터럴
 * 보간, 괄호·타입 단언으로 이어지는 동안 위로 올라간다. 변수에 담기거나 다른 호출의 인자가 되면 거기서 멈춘다.
 */
function enclosingPathExpression(start: ts.Node): ts.Node {
  let current = start;
  for (;;) {
    const parent = current.parent;
    const continues = ts.isParenthesizedExpression(parent)
      || ts.isAsExpression(parent)
      || ts.isNonNullExpression(parent)
      || ts.isTemplateSpan(parent)
      || ts.isTemplateExpression(parent)
      || (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken)
      || (ts.isCallExpression(parent)
        && PATH_JOINERS.has(calleeName(parent) ?? "")
        && parent.arguments.some((argument) => argument === current));
    if (!continues) return current;
    current = parent;
  }
}

function isMkdtempArgument(node: ts.Node): boolean {
  const parent = node.parent;
  return ts.isCallExpression(parent)
    && MKDTEMP_FUNCTIONS.has(calleeName(parent) ?? "")
    && parent.arguments.some((argument) => argument === node);
}

function containsPredictableValue(node: ts.Node, file: ts.SourceFile): boolean {
  if (ts.isCallExpression(node) && PREDICTABLE_CALLS.has(compactText(node.expression, file))) return true;
  if (ts.isNewExpression(node) && compactText(node.expression, file) === "Date") return true;
  if (ts.isPropertyAccessExpression(node) && PREDICTABLE_PROPERTIES.has(compactText(node, file))) return true;
  return ts.forEachChild(node, (child) => containsPredictableValue(child, file) || undefined) === true;
}

/** 소스에서 예측 가능한 이름으로 임시 경로를 만드는 `tmpdir()` 호출의 줄 번호(1부터)를 모두 돌려준다. */
function findPredictableTempPathLines(source: string, fileName = "snippet.mts"): number[] {
  if (!source.includes(TEMP_DIRECTORY_FUNCTION)) return [];
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (isTempDirectoryCall(node)) {
      const pathExpression = enclosingPathExpression(node);
      if (!isMkdtempArgument(pathExpression) && containsPredictableValue(pathExpression, file)) {
        lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return lines;
}

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCANNED_ROOTS = ["scripts", "tools"] as const;
const SCRIPT_FILE = /\.(?:mjs|cjs|js|mts|cts|ts|tsx)$/u;
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(["node_modules", ".git"]);

function scriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRECTORIES.has(entry.name) ? [] : scriptFiles(path);
    return entry.isFile() && SCRIPT_FILE.test(entry.name) ? [path] : [];
  });
}

// 아래 예시 코드는 모두 문자열이다. 이 파일을 같은 규칙으로 스캔해도 따옴표 안의 글자는 코드로 보지 않는다.
describe("시각·프로세스 번호·난수로 만든 임시 경로 이름 금지", () => {
  it.each([
    ["한 줄 템플릿 리터럴: 시각", "join(tmpdir(), `toonstudio-x-${Date.now()}`);"],
    ["한 줄 템플릿 리터럴: 프로세스 번호", "join(tmpdir(), `toonstudio-x-${process.pid}`);"],
    ["한 줄 템플릿 리터럴: 난수", "join(tmpdir(), `toonstudio-x-${Math.random()}`);"],
    ["난수를 36진수 문자열로 가공", "join(tmpdir(), `toonstudio-x-${Math.random().toString(36).slice(2)}`);"],
    ["시각을 36진수 문자열로 가공", "join(tmpdir(), `toonstudio-x-${Date.now().toString(36)}`);"],
    ["hrtime 도 시각 원천", "join(tmpdir(), `toonstudio-x-${process.hrtime.bigint()}`);"],
    ["new Date() 로 만든 시각 문자열", "join(tmpdir(), `toonstudio-x-${new Date().toISOString()}`);"],
    [
      "여러 줄로 나눈 join(실제로 한 곳에 남아 있던 모양)",
      [
        "const scratch = process.env.X",
        "  ?? join(",
        "    tmpdir(),",
        "    `toonstudio-studio-x-${Date.now()}-${randomUUID().slice(0, 8)}`,",
        "  );",
      ].join("\n"),
    ],
    ["문자열 + 연결", 'const dir = join(tmpdir(), "toonstudio-x-" + Date.now());'],
    ["+ 연결을 join 바깥에서", 'const dir = join(tmpdir(), "x-") + process.pid;'],
    ["tmpdir() 에 직접 + 연결", 'const dir = tmpdir() + "/toonstudio-" + Math.random();'],
    ["join 인자를 따로 둔 형태", 'const dir = join(tmpdir(), "toonstudio", String(process.pid));'],
    ["os.tmpdir() 와 path.join", "const dir = path.join(os.tmpdir(), `x-${Date.now()}`);"],
    ["템플릿 안에서 tmpdir() 를 보간", "const dir = `${tmpdir()}/x-${Date.now()}`;"],
    ["괄호와 타입 단언으로 감싼 식", 'const dir = (join(tmpdir(), "x-" + Date.now()) as string);'],
  ])("잡는다: %s", (_name, source) => {
    expect(findPredictableTempPathLines(source), source).toHaveLength(1);
  });

  it.each([
    ["mkdtempSync 로 무작위 접미사를 받는다", 'const out = mkdtempSync(join(tmpdir(), "toonstudio-x-"));'],
    ["여러 줄 mkdtempSync", ["const out = mkdtempSync(", '  join(tmpdir(), "toonstudio-x-"),', ");"].join("\n")],
    ["fs.promises.mkdtemp 와 path.join", 'const out = await fs.promises.mkdtemp(path.join(os.tmpdir(), "x-"));'],
    [
      "mkdtemp 접두사에 시각이 있어도 무작위 접미사가 붙는다",
      "const out = mkdtempSync(join(tmpdir(), `x-${Date.now()}-`));",
    ],
    ["환경 변수가 없을 때만 mkdtemp", 'const dir = process.env.DIR ?? mkdtempSync(join(tmpdir(), "x-"));'],
    ["시각을 tmpdir 경로와 무관한 곳에 쓴다", 'const started = Date.now();\nconst out = mkdtempSync(join(tmpdir(), "x-"));'],
    [
      "tmpdir() 아래 고정 파일을 쓰고 시각은 다른 인자에 쓴다",
      'writeFileSync(join(tmpdir(), "report.json"), JSON.stringify({ at: Date.now() }));',
    ],
    ["주석 안의 예시", "// join(tmpdir(), `x-${Date.now()}`) 는 금지"],
    ["문자열 안의 예시", "const note = 'join(tmpdir(), `x-${Date.now()}`)';"],
    ["tmpdir 를 쓰지 않는 코드", "const stamp = `run-${Date.now()}`;"],
  ])("통과시킨다: %s", (_name, source) => {
    expect(findPredictableTempPathLines(source), source).toEqual([]);
  });

  it("범위 밖(탐지하지 않음): 고정 이름과 /tmp 직접 경로, 변수에 담아 둔 tmpdir()", () => {
    // 아래는 예측 가능한 이름이지만 이 가드의 규칙이 아니다(파일 머리 주석의 "막지 않는 것" 참고).
    for (const source of [
      'const dir = join(tmpdir(), "toonstudio-fixed-name");',
      'const dir = "/tmp/toonstudio-fixed-name";',
      'const base = tmpdir();\nconst dir = join(base, "x-" + Date.now());',
      'const dir = join(process.env.TMPDIR ?? "/var/tmp", "x-" + Date.now());',
    ]) {
      expect(findPredictableTempPathLines(source), source).toEqual([]);
    }
  });

  it("줄 번호는 tmpdir() 호출 위치를 가리킨다", () => {
    const source = ["const a = 1;", "", "const b = join(", "  tmpdir(),", '  "x-" + Date.now(),', ");"].join("\n");
    expect(findPredictableTempPathLines(source)).toEqual([4]);
  });

  it("scripts/ 와 tools/ 의 스크립트는 임시 디렉터리 이름을 시각·프로세스·난수로 만들지 않는다", () => {
    const offenders: string[] = [];
    for (const root of SCANNED_ROOTS) {
      for (const file of scriptFiles(join(REPOSITORY_ROOT, root))) {
        const source = readFileSync(file, "utf8");
        for (const line of findPredictableTempPathLines(source, file)) {
          offenders.push(`${relative(REPOSITORY_ROOT, file)}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
