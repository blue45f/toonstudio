/**
 * 트리 셰이킹 & 초기(Eager) 번들 다이어트 분석기 — TypeScript AST 모듈 스캐너.
 *
 * 각 1부 모듈에서 정적 import, re-export, 로컬 값 export 크기, 식별자 값/타입 사용량,
 * 네임스페이스(`import * as`) 멤버 접근 패턴을 정확히 추출한다.
 */
import ts from "typescript";

import { isTypeOnlyImportClause, scriptKindFor } from "./studio-eager-graph-scan.mjs";

const INDEX_FILE_PATTERN = /(?:^|\/)index\.[cm]?[jt]sx?$/u;

function stringLiteralText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function hasExportModifier(node) {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function hasDefaultModifier(node) {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword),
  );
}

function collectBindingNames(nameNode, out) {
  if (ts.isIdentifier(nameNode)) {
    out.push(nameNode.text);
  } else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
    for (const element of nameNode.elements) {
      if (ts.isBindingElement(element)) collectBindingNames(element.name, out);
    }
  }
}

function isNonReferenceIdentifier(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isQualifiedName(parent) && parent.right === node) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true;
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return true;
  if (ts.isPropertySignature(parent) && parent.name === node) return true;
  if (ts.isMethodSignature(parent) && parent.name === node) return true;
  if (ts.isGetAccessorDeclaration(parent) && parent.name === node) return true;
  if (ts.isSetAccessorDeclaration(parent) && parent.name === node) return true;
  if (ts.isEnumMember(parent) && parent.name === node) return true;
  if (ts.isJsxAttribute(parent) && parent.name === node) return true;
  if (ts.isLabeledStatement(parent) && parent.label === node) return true;
  if (ts.isBreakOrContinueStatement(parent) && parent.label === node) return true;
  if (ts.isBindingElement(parent) && (parent.propertyName === node || parent.name === node)) return true;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isParameter(parent) && parent.name === node) return true;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return true;
  if (ts.isFunctionExpression(parent) && parent.name === node) return true;
  if (ts.isClassDeclaration(parent) && parent.name === node) return true;
  if (ts.isClassExpression(parent) && parent.name === node) return true;
  if (ts.isInterfaceDeclaration(parent) && parent.name === node) return true;
  if (ts.isTypeAliasDeclaration(parent) && parent.name === node) return true;
  if (ts.isEnumDeclaration(parent) && parent.name === node) return true;
  if (ts.isTypeParameterDeclaration(parent) && parent.name === node) return true;
  if (ts.isModuleDeclaration(parent) && parent.name === node) return true;
  return false;
}

function isInTypeOnlyContext(node) {
  let current = node.parent;
  while (current) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isTypeAliasDeclaration(current) || ts.isInterfaceDeclaration(current)) return true;
    if (ts.isHeritageClause(current)) {
      if (current.token === ts.SyntaxKind.ImplementsKeyword) return true;
      if (current.token === ts.SyntaxKind.ExtendsKeyword && ts.isInterfaceDeclaration(current.parent)) return true;
      return false;
    }
    current = current.parent;
  }
  return false;
}

function isTypeOnlyExportDeclaration(statement) {
  if (statement.isTypeOnly) return true;
  const clause = statement.exportClause;
  if (!clause || !ts.isNamedExports(clause) || clause.elements.length === 0) return false;
  return clause.elements.every((element) => element.isTypeOnly);
}

/**
 * 단일 모듈의 정적 import/re-export/로컬 export 및 식별자 사용 현황을 AST로 추출한다.
 */
export function parseModuleTreeshakeInfo(file, text, resolver) {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  const imports = [];
  const reexports = [];
  const localValueExports = new Map();
  const namespaceBindings = new Set();

  for (const statement of sourceFile.statements) {
    const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
    const stmtBytes = Buffer.byteLength(text.slice(statement.getFullStart(), statement.getEnd()), "utf8");

    if (ts.isImportDeclaration(statement)) {
      const specifier = stringLiteralText(statement.moduleSpecifier);
      if (specifier === null) continue;
      if (isTypeOnlyImportClause(statement.importClause)) continue;
      const resolved = resolver.resolve(specifier, file);
      const clause = statement.importClause;

      if (!clause) {
        imports.push({
          line,
          specifier,
          resolved,
          isSideEffectOnly: true,
          isInlineTypeOnly: false,
          defaultBinding: null,
          namespaceBinding: null,
          namedBindings: [],
        });
        continue;
      }

      const defaultBinding = clause.name ? clause.name.text : null;
      let namespaceBinding = null;
      const namedBindings = [];
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          namespaceBinding = clause.namedBindings.name.text;
          namespaceBindings.add(namespaceBinding);
        } else if (ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            namedBindings.push({
              localName: element.name.text,
              importedName: (element.propertyName ?? element.name).text,
              isTypeOnly: element.isTypeOnly === true,
            });
          }
        }
      }

      const isInlineTypeOnly =
        !defaultBinding &&
        !namespaceBinding &&
        namedBindings.length > 0 &&
        namedBindings.every((binding) => binding.isTypeOnly);

      imports.push({
        line,
        specifier,
        resolved,
        isSideEffectOnly: false,
        isInlineTypeOnly,
        defaultBinding,
        namespaceBinding,
        namedBindings,
      });
    } else if (ts.isExportDeclaration(statement)) {
      const specifier = stringLiteralText(statement.moduleSpecifier);
      if (specifier !== null) {
        if (isTypeOnlyExportDeclaration(statement)) continue;
        const resolved = resolver.resolve(specifier, file);
        const clause = statement.exportClause;
        if (!clause) {
          reexports.push({ line, specifier, resolved, kind: "star", namespaceName: null, exportedNames: [] });
        } else if (ts.isNamespaceExport(clause)) {
          reexports.push({
            line,
            specifier,
            resolved,
            kind: "namespace",
            namespaceName: clause.name.text,
            exportedNames: [{ exportedName: clause.name.text, originalName: "*" }],
          });
        } else if (ts.isNamedExports(clause)) {
          const exportedNames = clause.elements
            .filter((element) => !element.isTypeOnly)
            .map((element) => ({
              exportedName: element.name.text,
              originalName: (element.propertyName ?? element.name).text,
            }));
          reexports.push({ line, specifier, resolved, kind: "named", namespaceName: null, exportedNames });
        }
      } else if (!statement.isTypeOnly && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (!element.isTypeOnly) localValueExports.set(element.name.text, stmtBytes);
        }
      }
    } else if (ts.isExportAssignment(statement)) {
      localValueExports.set("default", stmtBytes);
    } else if (hasExportModifier(statement)) {
      if (ts.isVariableStatement(statement)) {
        const names = [];
        for (const decl of statement.declarationList.declarations) collectBindingNames(decl.name, names);
        const perNameBytes = Math.max(1, Math.round(stmtBytes / Math.max(1, names.length)));
        for (const name of names) localValueExports.set(name, perNameBytes);
      } else if (
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)
      ) {
        const exportName = hasDefaultModifier(statement) ? "default" : statement.name?.text;
        if (exportName) localValueExports.set(exportName, stmtBytes);
      }
    }
  }

  const usage = new Map();
  const namespaceUsage = new Map(
    [...namespaceBindings].map((name) => [name, { members: new Set(), dynamicUse: false }]),
  );

  const recordUse = (name, isType) => {
    let entry = usage.get(name);
    if (!entry) {
      entry = { valueUses: 0, typeUses: 0 };
      usage.set(name, entry);
    }
    if (isType) entry.typeUses += 1;
    else entry.valueUses += 1;
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) return;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const localName = (element.propertyName ?? element.name).text;
          const isType = node.isTypeOnly === true || element.isTypeOnly === true;
          recordUse(localName, isType);
          if (!isType && namespaceUsage.has(localName)) {
            namespaceUsage.get(localName).dynamicUse = true;
          }
        }
      }
      return;
    }

    if (ts.isIdentifier(node) && !isNonReferenceIdentifier(node)) {
      const name = node.text;
      const inType = isInTypeOnlyContext(node);
      recordUse(name, inType);

      if (!inType && namespaceUsage.has(name)) {
        const parent = node.parent;
        if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
          namespaceUsage.get(name).members.add(parent.name.text);
        } else {
          namespaceUsage.get(name).dynamicUse = true;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  for (const statement of sourceFile.statements) visit(statement);

  return {
    file,
    statementCount: sourceFile.statements.length,
    imports,
    reexports,
    localValueExports,
    usage,
    namespaceUsage,
    isIndexFile: INDEX_FILE_PATTERN.test(file),
  };
}
