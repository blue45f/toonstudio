import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 제작 레시피(/learn/recipes) 라우트의 앱 진입 번들 경계.
 *
 * 라우트 표(creator-resources.routes.tsx)는 앱 진입 번들에 정적으로 들어간다. 학습 셸을
 * 표가 직접 import하면 셸이 끌어오는 학습 콘텐츠(learning-content)·진행 모델이 앱 진입
 * 폐포에 섞인다(2026-10-15 CI 실행 38658151982에서 앱 진입 청크 수 17 → 20의 원인 중 하나).
 * 셸과 레시피 화면은 LearnRecipesRoute 한 요소로 묶어 지연 로딩한다.
 */

function parse(fileName: string): ts.SourceFile {
  const text = readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
  return ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function staticSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  return sourceFile.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement)
    && !statement.importClause?.isTypeOnly
    && ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
}

function dynamicSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] !== undefined
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

const LEARN_SHELL = "@/domains/learn/public/learn-section-shell";

describe("제작 레시피 라우트 번들 경계", () => {
  it("라우트 표는 학습 셸을 정적으로 import하지 않는다", () => {
    const routes = parse("creator-resources.routes.tsx");
    expect(staticSpecifiers(routes)).not.toContain(LEARN_SHELL);
    expect(staticSpecifiers(routes)).toContain("./creator-resource-pages");
  });

  it("셸과 레시피 화면은 지연 로딩 선언 한 곳(LearnRecipesRoute)으로만 열린다", () => {
    const pages = parse("creator-resource-pages.ts");
    expect(dynamicSpecifiers(pages)).toContain("./learn-recipes-route");
    expect(staticSpecifiers(pages)).not.toContain("./learn-recipes-route");
    expect(staticSpecifiers(pages)).not.toContain(LEARN_SHELL);
  });

  it("학습 셸은 지연 로딩되는 레시피 라우트 요소만 소유한다", () => {
    const element = parse("learn-recipes-route.tsx");
    expect(staticSpecifiers(element)).toContain(LEARN_SHELL);
    expect(staticSpecifiers(element)).toContain("@/domains/creator-resources/RecipesPage");
  });
});
