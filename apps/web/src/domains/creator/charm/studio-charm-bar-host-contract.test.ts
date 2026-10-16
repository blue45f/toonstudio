import { readFileSync } from "node:fs";

import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

import { BUBBLE_VARIANTS } from "../studio-assets";
import { studioCharmBubbleFootprint } from "./studio-charm-insert";

/**
 * 참 바가 기대는 편집기 호스트의 계약을 소스에서 고정한다.
 *
 * 참 바는 호스트 삽입 명령을 한 번 부르는 것으로 붙이기를 끝낸다(`studio-charm-insert.test.ts`).
 * "삽입 한 번 = 되돌리기 한 단계" 가 성립하려면 그 명령들이 각각 히스토리 커밋을 정확히 한 번만 일으켜야 한다.
 * 호스트(`StudioCuttoonEditorHost.tsx`)는 거대한 클로저라 마운트하지 않고, 같은 소스를 AST 로 읽어 확인한다.
 * 이 계약이 깨지면 참 바의 되돌리기 보증이 조용히 사라지므로 시험이 먼저 실패해야 한다.
 */

const CREATOR = "../";
const HOST_SOURCE = `${CREATOR}StudioCuttoonEditorHost.tsx`;

/** 문서 히스토리를 한 칸 쌓는 호스트 호출. `addEl` 은 내부에서 `commit` 을 한 번 부른다. */
const HISTORY_WRITERS: ReadonlySet<string> = new Set(["addEl", "commit", "commitCoalesced", "commitPages"]);

/** 참 바가 부르는 호스트 삽입 명령(`StudioCharmHostCommands`)과 그 명령이 일으켜야 하는 커밋 수. */
const CHARM_INSERT_COMMANDS: readonly { readonly name: string; readonly writes: number }[] = [
  { name: "addRenderedImage", writes: 1 },
  { name: "addSticker", writes: 1 },
  { name: "addBubble", writes: 1 },
  { name: "addBuiltinRasterAsset", writes: 1 },
  { name: "addSfxPreset", writes: 1 },
  // 3D 오브젝트는 문서를 바꾸지 않고 3D 도구를 연다. 문서 변경은 그 도구가 끝난 뒤의 일이다.
  { name: "openStudioObjectInsert", writes: 0 },
];

interface WriteCount {
  /** 함수 본문에서 바로(중첩 함수 밖에서) 부르는 히스토리 쓰기 호출 수. */
  readonly direct: number;
  /** 반복문 안에서 부르는 호출 수. 0 이어야 한다(여러 번 실행될 수 있다). */
  readonly inLoop: number;
  /** 콜백·중첩 함수 안에서 부르는 호출 수. 0 이어야 한다(몇 번 실행될지 알 수 없다). */
  readonly deferred: number;
}

function sourceFileOf(relativePath: string): ts.SourceFile {
  const url = new URL(relativePath, import.meta.url);
  return ts.createSourceFile(
    url.pathname,
    readFileSync(url, "utf8"),
    ts.ScriptTarget.Latest,
    false,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function findFunctions(file: ts.SourceFile, name: string): ts.FunctionDeclaration[] {
  const found: ts.FunctionDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function calleeName(call: ts.CallExpression): string | null {
  return ts.isIdentifier(call.expression) ? call.expression.text : null;
}

function isLoop(node: ts.Node): boolean {
  return ts.isForStatement(node)
    || ts.isForInStatement(node)
    || ts.isForOfStatement(node)
    || ts.isWhileStatement(node)
    || ts.isDoStatement(node);
}

function countHistoryWrites(fn: ts.FunctionDeclaration): WriteCount {
  let direct = 0;
  let inLoop = 0;
  let deferred = 0;
  const visit = (node: ts.Node, loopDepth: number, nested: boolean): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node);
      if (callee && HISTORY_WRITERS.has(callee)) {
        if (nested) deferred += 1;
        else if (loopDepth > 0) inLoop += 1;
        else direct += 1;
      }
    }
    const enteringNested = ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node);
    ts.forEachChild(node, (child) => visit(child, isLoop(node) ? loopDepth + 1 : loopDepth, nested || enteringNested));
  };
  if (fn.body) ts.forEachChild(fn.body, (child) => visit(child, 0, false));
  return { direct, inLoop, deferred };
}


interface BubbleSize {
  width: number;
  height: number;
}

/** 호스트 `addBubble` 이 변종마다 정하는 크기를 AST 에서 읽는다. 키 "default" 는 변종이 따로 정하지 않을 때의 크기다. */
function readHostBubbleSizes(fn: ts.FunctionDeclaration): Map<string, BubbleSize> {
  const numeric = (node: ts.Expression | undefined): number => (node && ts.isNumericLiteral(node) ? Number(node.text) : Number.NaN);
  const defaults: BubbleSize = { width: Number.NaN, height: Number.NaN };
  const statements = fn.body?.statements ?? [];
  for (const statement of statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      if (declaration.name.text === "width") defaults.width = numeric(declaration.initializer);
      if (declaration.name.text === "height") defaults.height = numeric(declaration.initializer);
    }
  }
  const sizes = new Map<string, BubbleSize>([["default", defaults]]);
  const visit = (node: ts.IfStatement): void => {
    const condition = node.expression;
    if (ts.isBinaryExpression(condition) && ts.isIdentifier(condition.left) && condition.left.text === "variant" && ts.isStringLiteral(condition.right)) {
      const size: BubbleSize = { ...defaults };
      for (const inner of ts.isBlock(node.thenStatement) ? node.thenStatement.statements : []) {
        if (!ts.isExpressionStatement(inner) || !ts.isBinaryExpression(inner.expression)) continue;
        const { left, right } = inner.expression;
        if (ts.isIdentifier(left) && left.text === "width") size.width = numeric(right);
        if (ts.isIdentifier(left) && left.text === "height") size.height = numeric(right);
      }
      sizes.set(condition.right.text, size);
    }
    if (node.elseStatement && ts.isIfStatement(node.elseStatement)) visit(node.elseStatement);
  };
  for (const statement of statements) if (ts.isIfStatement(statement)) visit(statement);
  return sizes;
}

let host: ts.SourceFile;

beforeAll(() => {
  host = sourceFileOf(HOST_SOURCE);
});

describe("참 바 호스트 계약: 삽입 한 번 = 되돌리기 한 단계", () => {
  it.each(CHARM_INSERT_COMMANDS)("$name 은 히스토리 커밋을 $writes 번만 일으킨다", ({ name, writes }) => {
    const declarations = findFunctions(host, name);
    expect(declarations, `${name} 선언은 호스트에 하나뿐이어야 한다`).toHaveLength(1);
    const counted = countHistoryWrites(declarations[0]);
    expect(counted.direct, `${name} 의 커밋 호출 수`).toBe(writes);
    expect(counted.inLoop, `${name} 의 반복문 안 커밋`).toBe(0);
    expect(counted.deferred, `${name} 의 콜백 안 커밋`).toBe(0);
  });

  it("addEl 은 커밋을 정확히 한 번 부르고 선택·도구 전환은 히스토리를 쌓지 않는다", () => {
    const declarations = findFunctions(host, "addEl");
    expect(declarations).toHaveLength(1);
    expect(countHistoryWrites(declarations[0])).toEqual({ direct: 1, inLoop: 0, deferred: 0 });
  });

  it("addRenderedImage 는 참이 쓰는 7번째 인자(계획된 위치)를 받아 배치에 그대로 쓴다", () => {
    const [declaration] = findFunctions(host, "addRenderedImage");
    const parameters = declaration.parameters.map((parameter) => parameter.name.getText(host));
    expect(parameters).toEqual([
      "src",
      "width",
      "height",
      "aiProvenance",
      "isAnimatedGif",
      "elementPatch",
      "insertionPlacement",
    ]);
    expect(declaration.body?.getText(host)).toContain("insertionPlacement ?? nextAssetInsertionPlacement()");
  });
});

describe("참 바 호스트 계약: 명령 전달과 놓기", () => {
  it("참이 쓰는 명령은 모두 도구 벨트 안정 핸들러 묶음에 들어 있다", () => {
    let handlerNames: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "useStudioStableHandlers"
        && node.typeArguments?.some((argument) => argument.getText(host) === "StudioToolBeltContentHandlers")
      ) {
        const [bag] = node.arguments;
        if (bag && ts.isObjectLiteralExpression(bag)) {
          handlerNames = bag.properties.flatMap((property) => (
            ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property)
              ? [property.name.getText(host)]
              : []
          ));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(host);
    expect(handlerNames.length).toBeGreaterThan(10);
    for (const { name } of CHARM_INSERT_COMMANDS) {
      expect(handlerNames, `${name} 는 studioToolBeltContentHandlers 에 있어야 한다`).toContain(name);
    }
  });

  it("안정 핸들러는 인자를 모두 그대로 전달한다(7번째 인자도 잘리지 않는다)", () => {
    const source = readFileSync(new URL(`${CREATOR}studio-stable-handlers.ts`, import.meta.url), "utf8");
    expect(source).toContain("(...args: unknown[])");
    expect(source).toContain("[key](...args)");
  });

  it("캔버스 놓기는 참이 쓰는 세 가지 끌기 계약을 모두 읽는다", () => {
    const source = readFileSync(new URL(HOST_SOURCE, import.meta.url), "utf8");
    const drop = source.slice(source.indexOf("const onWrapDrop = async"));
    expect(drop).toContain("e.dataTransfer.getData(STUDIO_ASSET_DRAG_MIME)");
    expect(drop).toContain("e.dataTransfer.getData(STUDIO_INSERT_DRAG_MIME)");
    expect(drop).toContain("e.dataTransfer.getData(STUDIO_OBJECT_INSERT_DRAG_MIME)");
    // 놓은 요소도 하나의 addEl(= 커밋 한 번)로 들어간다.
    const placeAt = drop.slice(drop.indexOf("const placeAt = ("), drop.indexOf("// 1) 외부 이미지 파일 드롭") + 1);
    expect(placeAt.match(/\baddEl\(/gu)).toHaveLength(1);
  });

  it("호스트는 슬롯이 읽는 선택과 요소 목록을 뷰 세션에 그대로 넘긴다(연달아 붙일 때 선택 이어 받기의 전제)", () => {
    const source = readFileSync(new URL(HOST_SOURCE, import.meta.url), "utf8");
    // 호스트의 addEl 은 새 요소를 문서에 넣고 곧바로 선택한다. 슬롯은 이 둘을 비교해 "방금 붙인 요소"를 알아본다.
    expect(source).toMatch(/\n\s+selected=\{selected\}\n/u);
    expect(source).toMatch(/\n\s+elements=\{elements\}\n/u);
    const [addEl] = findFunctions(host, "addEl");
    const body = addEl.body?.getText(host) ?? "";
    expect(body).toContain("setSelectedId(el.id)");
  });

  it("작업공간은 참 바 슬롯을 캔버스 열 앞에 한 번만 두고 세션을 그대로 넘긴다", () => {
    const workspace = readFileSync(
      new URL(`${CREATOR}studio-cuttoon-editor/StudioCuttoonEditorWorkspace.tsx`, import.meta.url),
      "utf8",
    );
    expect(workspace.match(/<StudioCharmBarSlot\b/gu)).toHaveLength(1);
    expect(workspace).toContain("<StudioCharmBarSlot session={s} />");
    expect(workspace.indexOf("<StudioCharmBarSlot")).toBeLessThan(workspace.indexOf("<StudioCuttoonEditorCanvasColumn"));
  });
});

describe("참 바 호스트 계약: 놓이는 크기(격자 스냅의 전제)", () => {
  it("말풍선 크기표가 호스트 addBubble 이 변종마다 정하는 크기와 같다", () => {
    const [declaration] = findFunctions(host, "addBubble");
    const hostSizes = readHostBubbleSizes(declaration);
    expect(hostSizes.get("default")).toEqual({ width: 260, height: 140 });
    for (const { id } of BUBBLE_VARIANTS) {
      expect(studioCharmBubbleFootprint(id), `${id} 말풍선 크기`).toEqual(hostSizes.get(id) ?? hostSizes.get("default"));
    }
  });

  it("스티커는 호스트가 중심 기준 80×80 으로 놓는다", () => {
    const [declaration] = findFunctions(host, "addSticker");
    const body = declaration.body?.getText(host) ?? "";
    expect(body).toContain("spawnCenter({ width: 80, height: 80");
    expect(body).toContain("x: cx - 40, y: cy - 40");
  });
});
