import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { readStudioPageCompositionSource } from "../studio-cuttoon-editor/read-studio-cuttoon-editor-source";

const source = readStudioPageCompositionSource();
const binding = readFileSync(new URL("./studio-crdt-frontier-reconciliation-binding.ts", import.meta.url), "utf8");
function assertSynchronousInitialProjection(text: string): void {
  const ast = ts.createSourceFile("binding.ts", text, ts.ScriptTarget.Latest, true);
  const arrows = new Map<string, ts.ArrowFunction>();
  const declarations: ts.VariableDeclaration[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      declarations.push(node);
      if (node.initializer && ts.isArrowFunction(node.initializer)) arrows.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collect);
  };
  collect(ast);
  const entry = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && node.name?.text === "bindStudioCrdtFrontierReconciliation");
  if (!entry?.body) throw new Error("최초 frontier 진입점이 없습니다.");
  const read = declarations.find((node) => node.initializer && ts.isCallExpression(node.initializer)
    && ts.isPropertyAccessExpression(node.initializer.expression) && node.initializer.expression.name.text === "studioOfflineDocumentFrontier");
  const initial = entry.body.statements.filter(ts.isExpressionStatement).map((node) => node.expression).find((node): node is ts.CallExpression =>
    ts.isCallExpression(node) && node.arguments[0]?.getText(ast) === read?.name.getText(ast) && node.arguments[1]?.kind === ts.SyntaxKind.NullKeyword);
  if (!initial || !ts.isIdentifier(initial.expression)) throw new Error("읽은 최초 frontier를 전체 범위로 동기 전달해야 합니다.");
  const dispatch = arrows.get(initial.expression.text);
  if (!dispatch || !ts.isBlock(dispatch.body) || dispatch.modifiers?.some((node) => node.kind === ts.SyntaxKind.AsyncKeyword)) throw new Error("최초 frontier 전달은 동기 함수여야 합니다.");
  const plain = dispatch.body.statements.find((node): node is ts.IfStatement => ts.isIfStatement(node)
    && ts.isPrefixUnaryExpression(node.expression) && node.expression.operator === ts.SyntaxKind.ExclamationToken
    && node.expression.getText(ast).includes("bg3dLtBundleReferences"));
  if (!plain || !ts.isBlock(plain.thenStatement)) throw new Error("번들 없는 frontier의 동기 경로가 없습니다.");
  const forward = plain.thenStatement.statements.filter(ts.isExpressionStatement).map((node) => node.expression).find(ts.isCallExpression);
  if (!forward || !ts.isIdentifier(forward.expression) || !plain.thenStatement.statements.some(ts.isReturnStatement)) throw new Error("일반 frontier는 비동기 분기로 진행하지 않아야 합니다.");
  const reachesReady = (name: string, seen = new Set<string>()): boolean => {
    if (seen.has(name)) return false;
    seen.add(name); const fn = arrows.get(name);
    if (!fn || fn.modifiers?.some((node) => node.kind === ts.SyntaxKind.AsyncKeyword)) return false;
    let ready = false;
    const visit = (node: ts.Node): void => {
      if (ts.isAwaitExpression(node)) throw new Error("일반 frontier의 준비 경로에는 await가 없어야 합니다.");
      if (ts.isCallExpression(node)) {
        if (node.expression.getText(ast) === "input.setReconciled") ready = true;
        else if (ts.isIdentifier(node.expression) && arrows.has(node.expression.text)) ready ||= reachesReady(node.expression.text, seen);
      }
      ts.forEachChild(node, visit);
    };
    visit(fn.body); return ready;
  };
  expect(reachesReady(forward.expression.text)).toBe(true);
}

describe("Studio 최초 CRDT frontier layout 경계", () => {
  it("기존 동기 projection은 첫 editable paint 이전 layout effect에서 실행한다", () => {
    const call = source.indexOf("return runtime.bindFrontierReconciliation({");
    expect(call).toBeGreaterThan(-1);
    expect(source.slice(call - 210, call)).toContain("useLayoutEffect(() => {");
    assertSynchronousInitialProjection(binding);
    const renamed = (asynchronous: string) => `function bindStudioCrdtFrontierReconciliation(input) {
      const observed = offline.studioOfflineDocumentFrontier(input.document);
      const ready = () => input.setReconciled(input.document);
      const next = ${asynchronous}() => ready();
      const begin = (frontier) => { if (!frontier.pages.some((page) => page.bg3dLtBundleReferences)) { next(); return; } };
      begin(observed, null);
    }`;
    assertSynchronousInitialProjection(renamed(""));
    expect(() => assertSynchronousInitialProjection(renamed("async "))).toThrow();
  });
});
