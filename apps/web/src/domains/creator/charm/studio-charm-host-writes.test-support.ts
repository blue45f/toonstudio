/**
 * 호스트 삽입 명령이 문서 히스토리를 몇 번 쌓는지 소스(AST)에서 세는 도구(시험 전용).
 *
 * "삽입 한 번 = 되돌리기 한 단계"는 참 명령(`addRenderedImage` 등)이 호출당 히스토리 커밋을 정확히 한 번 일으켜야
 * 성립한다. 직접 부르는 커밋 호출 이름만 세면 간접 쓰기(예: `addSticker` 에 `patchEl` 을 더하거나 `addBubble` 이
 * `addText()` 를 부르거나 `addRenderedImage` 가 `updateActivePage` 를 부르는 것)를 놓친다. 그래서 두 겹으로 본다.
 *
 * 1. 쓰기 폐포: 호스트 파일 안에서 선언된 함수(함수 선언, `const f = () => …`, `useCallback`)를 이름으로 찾아, 기본 쓰기
 *    (`commit`·`commitCoalesced`·`commitPages`)에 닿는 함수를 쓰기 함수로 본다. 명령이 부르는 쓰기 함수의 호출당 쓰기
 *    수를 호출 그래프를 따라 합산한다. 반복문·콜백 안의 쓰기 호출, 재귀는 몇 번 실행될지 알 수 없어 무한대로 본다.
 * 2. 허용 호출 목록: 명령 본문(중첩 함수 포함)이 이름으로 부르는 함수는 사람이 검토해 허용 목록에 올린 것뿐이어야 한다.
 *    목록에 없는 새 호출이 생기면, 그것이 문서를 바꾸는지 사람이 보게 된다.
 *
 * 한계(정직하게): 호스트 파일 밖에서 온 함수(import, 훅이 돌려준 함수, 위의 기본 쓰기 셋 외)의 내부, `ref.current.fn()` 같은
 * 멤버 호출, 동적 호출은 따라가지 못한다. 이런 호출은 허용 목록에 이름이 없으면 실패하지만, 이미 허용된 외부 함수 내부가
 * 바뀌는 것은 이 시험이 보지 못한다. 한 함수 안의 분기(if/else)는 호출 위치를 모두 더하므로 보수적으로 센다.
 */

import ts from "typescript";

type FunctionLike = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

/** 호스트가 히스토리를 한 칸 쌓는 기본 호출. 이름만으로 센다(훅에서 받아 오는 함수라 선언을 따라갈 수 없다). */
export const BASE_HISTORY_WRITERS: ReadonlySet<string> = new Set(["commit", "commitCoalesced", "commitPages"]);

export type HostFunctionIndex = ReadonlyMap<string, readonly FunctionLike[]>;

interface CallSite {
  readonly callee: string;
  /** 콜백·중첩 함수 안의 호출이다. */
  readonly nested: boolean;
  /** 반복문 안의 호출이다. */
  readonly inLoop: boolean;
}

export interface HostCommandAnalysis {
  readonly found: boolean;
  /** 호출당 히스토리 쓰기 수. 반복·콜백·재귀 안에서 쓰면 `Infinity`. */
  readonly writes: number;
  /** 허용 목록에 없는 호출 이름(중복 없이). */
  readonly unreviewed: readonly string[];
}

export function parseHostSource(source: string, name = "StudioCuttoonEditorHost.tsx"): ts.SourceFile {
  return ts.createSourceFile(name, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
}

function unwrapFunction(expression: ts.Expression): FunctionLike | null {
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "useCallback") {
    const [first] = expression.arguments;
    return first && (ts.isArrowFunction(first) || ts.isFunctionExpression(first)) ? first : null;
  }
  return null;
}

/** 파일 안의 모든 함수(중첩 포함)를 이름으로 모은다. 같은 이름이 여럿이면 모두 가진다. */
export function indexHostFunctions(file: ts.SourceFile): HostFunctionIndex {
  const index = new Map<string, FunctionLike[]>();
  const add = (name: string, fn: FunctionLike): void => {
    const list = index.get(name);
    if (list) list.push(fn);
    else index.set(name, [fn]);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) add(node.name.text, node);
    else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const fn = unwrapFunction(node.initializer);
      if (fn) add(node.name.text, fn);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return index;
}

function isLoop(node: ts.Node): boolean {
  return ts.isForStatement(node)
    || ts.isForInStatement(node)
    || ts.isForOfStatement(node)
    || ts.isWhileStatement(node)
    || ts.isDoStatement(node);
}

/** 함수 본문에서 이름으로 부르는 호출(식별자 호출만). `a.b()`·`import()` 같은 호출은 세지 않는다. */
function callSitesOf(fn: FunctionLike): CallSite[] {
  const sites: CallSite[] = [];
  const visit = (node: ts.Node, nested: boolean, loopDepth: number): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      sites.push({ callee: node.expression.text, nested, inLoop: loopDepth > 0 });
    }
    const entersFunction = ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node);
    ts.forEachChild(node, (child) => visit(child, nested || entersFunction, isLoop(node) ? loopDepth + 1 : loopDepth));
  };
  const { body } = fn;
  if (!body) return sites;
  if (ts.isBlock(body)) ts.forEachChild(body, (child) => visit(child, false, 0));
  else visit(body, false, 0);
  return sites;
}

/** 함수 하나를 한 번 부를 때 쌓이는 히스토리 쓰기 수. 호스트 파일 밖의 함수는 0 으로 본다(위 한계). */
function writesPerCall(name: string, index: HostFunctionIndex, memo: Map<string, number>, stack: ReadonlySet<string>): number {
  if (BASE_HISTORY_WRITERS.has(name)) return 1;
  const known = memo.get(name);
  if (known !== undefined) return known;
  const declarations = index.get(name);
  if (!declarations) return 0;
  if (stack.has(name)) return Number.POSITIVE_INFINITY;
  const nextStack = new Set(stack).add(name);
  let worst = 0;
  for (const declaration of declarations) {
    let total = 0;
    for (const site of callSitesOf(declaration)) {
      const calleeWrites = writesPerCall(site.callee, index, memo, nextStack);
      if (calleeWrites > 0 && (site.nested || site.inLoop)) total = Number.POSITIVE_INFINITY;
      else total += calleeWrites;
    }
    worst = Math.max(worst, total);
  }
  memo.set(name, worst);
  return worst;
}

/** 명령 하나의 호출당 쓰기 수와, 허용 목록 밖의 호출을 분석한다. */
export function analyzeHostCommand(
  index: HostFunctionIndex,
  command: string,
  reviewedCallees: ReadonlySet<string>,
): HostCommandAnalysis {
  const declarations = index.get(command);
  if (!declarations || declarations.length === 0) return { found: false, writes: 0, unreviewed: [] };
  const memo = new Map<string, number>();
  let writes = 0;
  const unreviewed = new Set<string>();
  for (const declaration of declarations) {
    let total = 0;
    for (const site of callSitesOf(declaration)) {
      if (!reviewedCallees.has(site.callee)) unreviewed.add(site.callee);
      const calleeWrites = writesPerCall(site.callee, index, memo, new Set([command]));
      if (calleeWrites > 0 && (site.nested || site.inLoop)) total = Number.POSITIVE_INFINITY;
      else total += calleeWrites;
    }
    writes = Math.max(writes, total);
  }
  return { found: true, writes, unreviewed: [...unreviewed] };
}

/** 함수 하나가 (간접 호출을 포함해) 호출당 쌓는 히스토리 쓰기 수. */
export function historyWritesOf(index: HostFunctionIndex, name: string): number {
  return writesPerCall(name, index, new Map(), new Set());
}

/** 시험에서 변형 소스를 만들 때 쓴다: 함수 본문 첫 줄 앞에 문장을 끼워 넣은 소스를 돌려준다. */
export function withStatementInFunction(source: string, file: ts.SourceFile, functionName: string, statement: string): string {
  const declaration = indexHostFunctions(file).get(functionName)?.[0];
  const body = declaration?.body;
  if (!body || !ts.isBlock(body)) throw new Error(`${functionName} 본문을 찾지 못했습니다`);
  const insertAt = body.getStart(file) + 1;
  return `${source.slice(0, insertAt)}\n${statement}\n${source.slice(insertAt)}`;
}

/** 시험에서 변형 소스를 만들 때 쓴다: 함수 선언 앞에 새 선언을 끼워 넣은 소스를 돌려준다. */
export function withDeclarationBefore(source: string, file: ts.SourceFile, functionName: string, declaration: string): string {
  const target = indexHostFunctions(file).get(functionName)?.[0];
  if (!target) throw new Error(`${functionName} 선언을 찾지 못했습니다`);
  const insertAt = target.getStart(file);
  return `${source.slice(0, insertAt)}${declaration}\n${source.slice(insertAt)}`;
}
