/**
 * Studio 진입 그래프 가드레일 — 모듈 하나의 import/export 간선 추출.
 *
 * TypeScript 파서(ts.createSourceFile)로 AST 를 읽어 정규식 오탐을 피한다. 번들러가 실제로 남기는
 * 간선만 "정적"으로 센다.
 *
 * - 정적 간선: `import x from`, `import "x"`, `export … from`, `export * from`, `import x = require()`.
 * - 제외(번들러가 지우는 것): `import type …`, `export type … from`, 지정자가 전부 `type` 인 `export { type A } from`.
 * - 정적으로 남는 것: `import { type A } from "x"` 는 tsconfig `verbatimModuleSyntax: true` 에서
 *   `import "x"` 로 남아 모듈을 그래프에 계속 끌어온다. 타입만 필요하면 `import type { A } from "x"` 를 써야 한다.
 * - 지연 간선: 리터럴 인자를 가진 `import("x")`. 타입 위치의 `import("x").Foo` 는 간선이 아니다.
 */
import ts from "typescript";

const SCRIPT_KIND_BY_EXTENSION = new Map([
  [".tsx", ts.ScriptKind.TSX],
  [".ts", ts.ScriptKind.TS],
  [".mts", ts.ScriptKind.TS],
  [".cts", ts.ScriptKind.TS],
  [".jsx", ts.ScriptKind.JSX],
  [".js", ts.ScriptKind.JS],
  [".mjs", ts.ScriptKind.JS],
  [".cjs", ts.ScriptKind.JS],
]);

// import( 가 한 번도 없으면 AST 전체를 순회할 필요가 없다(대부분의 파일). 문자열·주석 안의 일치는 순회 뒤 걸러진다.
const DYNAMIC_IMPORT_HINT = /\bimport\s*\(/u;

/** 확장자로 ScriptKind 를 정한다. 알 수 없으면 TS 로 읽는다. */
export function scriptKindFor(fileName) {
  const dot = fileName.lastIndexOf(".");
  const extension = dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
  return SCRIPT_KIND_BY_EXTENSION.get(extension) ?? ts.ScriptKind.TS;
}

/** `import type …` 인지(TS 5.9+ 는 phaseModifier, 이전 버전은 isTypeOnly). */
export function isTypeOnlyImportClause(clause) {
  if (!clause) return false;
  if (clause.phaseModifier !== undefined) return clause.phaseModifier === ts.SyntaxKind.TypeKeyword;
  return clause.isTypeOnly === true;
}

function stringLiteralText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function isTypeOnlyExportDeclaration(statement) {
  if (statement.isTypeOnly) return true;
  const clause = statement.exportClause;
  if (!clause || !ts.isNamedExports(clause) || clause.elements.length === 0) return false;
  return clause.elements.every((element) => element.isTypeOnly);
}

function collectDynamicImports(sourceFile) {
  const specifiers = [];
  let opaque = 0;
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = stringLiteralText(node.arguments[0]);
      if (specifier === null) opaque += 1;
      else specifiers.push(specifier);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { specifiers, opaque };
}

/**
 * 소스 텍스트에서 간선을 뽑는다.
 *
 * @param {string} text 파일 내용
 * @param {string} fileName 확장자로 ScriptKind 를 고르는 데만 쓴다
 * @returns {{ static: string[], dynamic: string[], typeOnly: string[], opaqueDynamic: number }}
 *   모두 소스 등장 순서이며 중복은 제거한다(결정적 순서).
 */
export function scanModuleEdges(text, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName, text, ts.ScriptTarget.Latest, false, scriptKindFor(fileName),
  );
  const staticSpecifiers = new Set();
  const typeOnlySpecifiers = new Set();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = stringLiteralText(statement.moduleSpecifier);
      if (specifier === null) continue;
      (isTypeOnlyImportClause(statement.importClause) ? typeOnlySpecifiers : staticSpecifiers).add(specifier);
    } else if (ts.isExportDeclaration(statement)) {
      const specifier = stringLiteralText(statement.moduleSpecifier);
      if (specifier === null) continue;
      (isTypeOnlyExportDeclaration(statement) ? typeOnlySpecifiers : staticSpecifiers).add(specifier);
    } else if (
      ts.isImportEqualsDeclaration(statement)
      && ts.isExternalModuleReference(statement.moduleReference)
    ) {
      const specifier = stringLiteralText(statement.moduleReference.expression);
      if (specifier === null) continue;
      (statement.isTypeOnly ? typeOnlySpecifiers : staticSpecifiers).add(specifier);
    }
  }

  let dynamic = { specifiers: [], opaque: 0 };
  if (DYNAMIC_IMPORT_HINT.test(text)) dynamic = collectDynamicImports(sourceFile);

  return {
    static: [...staticSpecifiers],
    dynamic: [...new Set(dynamic.specifiers)],
    typeOnly: [...typeOnlySpecifiers],
    opaqueDynamic: dynamic.opaque,
  };
}
