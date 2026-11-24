import ts from "typescript";

import { compact } from "./studio-browser-kv-findings";

export function receiverAndMethod(expression: ts.LeftHandSideExpression, sourceFile: ts.SourceFile) {
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return null;
  const method = ts.isPropertyAccessExpression(expression) ? expression.name.text
    : ts.isStringLiteralLike(expression.argumentExpression) ? expression.argumentExpression.text : undefined;
  if (method === undefined) return null;
  return { expression: expression.expression, receiver: compact(expression.expression.getText(sourceFile)), method };
}

/** 후보가 있는 파일에서만 선언을 해석한다. 외부 모듈과 표준 라이브러리는 로드하지 않는다. */
function localChecker(sourceFile: ts.SourceFile): ts.TypeChecker {
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, types: [] };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => name === sourceFile.fileName ? sourceFile : undefined;
  host.fileExists = (name) => name === sourceFile.fileName;
  host.readFile = (name) => name === sourceFile.fileName ? sourceFile.text : undefined;
  return ts.createProgram([sourceFile.fileName], options, host).getTypeChecker();
}

function isUnshadowedMap(name: ts.Node, checker: ts.TypeChecker): boolean {
  // 표준 라이브러리를 제외했으므로 여기서 찾은 심볼은 Map을 가린 선언이다.
  return ts.isIdentifier(name) && name.text === "Map"
    && !checker.resolveName(name.text, name, ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Alias, false);
}

export function createMemoryMapReceiverCheck(sourceFile: ts.SourceFile) {
  let checker: ts.TypeChecker | undefined;
  return (receiver: ts.Expression): boolean => {
    while (ts.isParenthesizedExpression(receiver) || ts.isNonNullExpression(receiver)) receiver = receiver.expression;
    let name: ts.Node = receiver;
    if (!ts.isIdentifier(receiver)) {
      if (!ts.isPropertyAccessExpression(receiver) && !ts.isElementAccessExpression(receiver)) return false;
      if (receiver.expression.kind !== ts.SyntaxKind.ThisKeyword) return false;
      if (ts.isElementAccessExpression(receiver) && !ts.isStringLiteralLike(receiver.argumentExpression)) return false;
      name = ts.isPropertyAccessExpression(receiver) ? receiver.name : receiver.argumentExpression;
    }
    checker ??= localChecker(sourceFile);
    const declaration = checker.getSymbolAtLocation(name)?.valueDeclaration;
    if (!declaration || !(ts.isPropertyDeclaration(declaration) || ts.isVariableDeclaration(declaration))) return false;
    if (ts.isVariableDeclaration(declaration) && !(declaration.parent.flags & ts.NodeFlags.Const)) return false;
    if (ts.isPropertyDeclaration(declaration)) {
      if (!(ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Readonly) || ts.isIdentifier(receiver)) return false;
      if (checker.getTypeAtLocation(receiver.expression).getSymbol()?.valueDeclaration !== declaration.parent) return false;
    }
    const initializer = declaration.initializer;
    if (!initializer || !ts.isNewExpression(initializer) || !isUnshadowedMap(initializer.expression, checker)) return false;
    // readonly 필드에도 생성자에서 더 넓은 타입의 저장소를 재할당할 수 있다.
    return !declaration.type || (ts.isTypeReferenceNode(declaration.type) && isUnshadowedMap(declaration.type.typeName, checker));
  };
}
