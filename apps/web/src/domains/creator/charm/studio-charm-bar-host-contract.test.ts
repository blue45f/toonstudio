import { readFileSync } from "node:fs";

import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

import { BUBBLE_VARIANTS } from "../studio-assets";
import { isStudioUndoRedoChord, shouldHandleStudioEditEvent } from "../studio-edit-controls";
import { studioCharmBubbleFootprint } from "./studio-charm-insert";
import {
  analyzeHostCommand,
  historyWritesOf,
  indexHostFunctions,
  parseHostSource,
  withDeclarationBefore,
  withStatementInFunction,
  type HostFunctionIndex,
} from "./studio-charm-host-writes.test-support";

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

/**
 * 각 명령이 본문(중첩 함수 포함)에서 이름으로 부를 수 있다고 사람이 검토한 함수. 쓰기 판정 방법과 한계는
 * `studio-charm-host-writes.test-support.ts` 에 있다. 목록에 없는 새 호출이 생기면 시험이 실패한다:
 * 그 호출이 문서를 바꾸는지(되돌리기 한 단계가 유지되는지) 확인한 뒤 여기에 더한다.
 * `reject`·`resolve`·`String` 은 파일을 읽는 Promise 콜백 안의 호출이다.
 * `t` 는 오류 문구를 만드는 번역 함수다(2026-10-22 검토: 문서·히스토리를 바꾸지 않는 순수 문자열 조회).
 */
const REVIEWED_CALLEES: Readonly<Record<string, readonly string[]>> = {
  addRenderedImage: ["setError", "createCanvasImageElement", "uid", "nextAssetInsertionPlacement", "addEl"],
  addSticker: ["setMenu", "spawnCenter", "addEl", "uid"],
  addBubble: ["setMenu", "spawnCenter", "uid", "addEl", "setPendingLetteringEdit"],
  addBuiltinRasterAsset: [
    "captureStudioMutationTicket",
    "nextAssetInsertionPlacement",
    "setBuiltinRasterBusyId",
    "setError",
    "resolveAssetUrl",
    "fetch",
    "verifyStudioRasterAssetBlob",
    "reject",
    "resolve",
    "String",
    "t",
    "canApplyStudioMutation",
    "createCanvasImageElement",
    "uid",
    "buildStudioRasterAssetElements",
    "commit",
    "setSelectedId",
    "setTool",
    "setMenu",
  ],
  addSfxPreset: ["setMenu", "captureStudioMutationTicket", "spawnCenter", "canApplyStudioMutation", "addEl", "uid", "createSfxTextConfig"],
  openStudioObjectInsert: [
    "resolveStudioObjectInsertOpenSeed",
    "setBg3dSeedTemplateId",
    "setBg3dSeedPrimitiveKind",
    "setPoserSeedPropId",
    "setPoserInitialDataUrl",
    "setPoserInitialElementId",
    "setPoserVrmOpen",
    "setBg3dInitialDataUrl",
    "setBg3dInitialScene",
    "setBg3dInitialElementId",
    "setBg3dOpen",
  ],
};

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

let hostSource: string;
let hostIndex: HostFunctionIndex;

describe("참 바 호스트 계약: 삽입 한 번 = 되돌리기 한 단계", () => {
  beforeAll(() => {
    hostSource = readFileSync(new URL(HOST_SOURCE, import.meta.url), "utf8");
    hostIndex = indexHostFunctions(host);
  });

  it.each(CHARM_INSERT_COMMANDS)("$name 은 간접 호출까지 따라가도 히스토리 커밋을 $writes 번만 일으킨다", ({ name, writes }) => {
    expect(findFunctions(host, name), `${name} 선언은 호스트에 하나뿐이어야 한다`).toHaveLength(1);
    const analysis = analyzeHostCommand(hostIndex, name, new Set(REVIEWED_CALLEES[name]));
    expect(analysis.writes, `${name} 의 호출당 히스토리 쓰기 수(반복·콜백 안이면 무한대)`).toBe(writes);
    expect(analysis.unreviewed, `${name} 이 검토하지 않은 새 호출을 한다 — 되돌리기 한 단계가 유지되는지 보고 REVIEWED_CALLEES 에 더하세요`).toEqual([]);
  });

  it("addEl 은 커밋을 정확히 한 번 부르고 선택·도구 전환은 히스토리를 쌓지 않는다", () => {
    expect(findFunctions(host, "addEl")).toHaveLength(1);
    expect(historyWritesOf(hostIndex, "addEl")).toBe(1);
    const analysis = analyzeHostCommand(hostIndex, "addEl", new Set(["commit", "setSelectedId", "setTool"]));
    expect(analysis.unreviewed).toEqual([]);
  });

  describe("간접 쓰기도 잡는다(호스트 사본에 호출을 더해 확인)", () => {
    function analyzeMutated(source: string, command: string) {
      const file = parseHostSource(source);
      return analyzeHostCommand(indexHostFunctions(file), command, new Set(REVIEWED_CALLEES[command]));
    }
    const mutate = (functionName: string, statement: string) => withStatementInFunction(hostSource, host, functionName, statement);

    it("변형하지 않은 사본은 통과한다(대조군)", () => {
      for (const { name, writes } of CHARM_INSERT_COMMANDS) {
        const analysis = analyzeMutated(hostSource, name);
        expect({ name, writes: analysis.writes, unreviewed: analysis.unreviewed }).toEqual({ name, writes, unreviewed: [] });
      }
    });

    it("addSticker 가 patchEl 을 더 부르면 쓰기 2번이고 검토하지 않은 호출로 걸린다", () => {
      const analysis = analyzeMutated(mutate("addSticker", 'patchEl("x", { x: 1 });'), "addSticker");
      expect(analysis.writes).toBe(2);
      expect(analysis.unreviewed).toEqual(["patchEl"]);
    });

    it("addBubble 이 addText() 를 더 부르면 쓰기 2번이다", () => {
      const analysis = analyzeMutated(mutate("addBubble", "addText();"), "addBubble");
      expect(analysis.writes).toBe(2);
      expect(analysis.unreviewed).toEqual(["addText"]);
    });

    it("addRenderedImage 가 updateActivePage 를 더 부르면 쓰기 2번이다", () => {
      const analysis = analyzeMutated(mutate("addRenderedImage", "updateActivePage({});"), "addRenderedImage");
      expect(analysis.writes).toBe(2);
      expect(analysis.unreviewed).toEqual(["updateActivePage"]);
    });

    it("이미 허용된 도우미(spawnCenter)가 내부에서 커밋하게 바뀌어도 폐포가 잡는다", () => {
      const analysis = analyzeMutated(mutate("spawnCenter", "commit([]);"), "addSticker");
      expect(analysis.unreviewed).toEqual([]);
      expect(analysis.writes).toBe(2);
    });

    it("새 도우미 함수를 거쳐 쓰는 경우도 잡는다", () => {
      const withHelper = withDeclarationBefore(
        mutate("addSfxPreset", "sneakyWrite();"),
        host,
        "addSfxPreset",
        "function sneakyWrite() { updateActivePage({}); }",
      );
      const analysis = analyzeMutated(withHelper, "addSfxPreset");
      expect(analysis.writes).toBe(2);
      expect(analysis.unreviewed).toEqual(["sneakyWrite"]);
    });

    it("반복문이나 콜백 안에서 부르면 몇 번일지 알 수 없어 무한대로 본다", () => {
      expect(analyzeMutated(mutate("addBubble", "for (const n of [1, 2]) { addEl(n); }"), "addBubble").writes).toBe(Number.POSITIVE_INFINITY);
      expect(analyzeMutated(mutate("addSticker", "queueMicrotask(() => addEl(1));"), "addSticker").writes).toBe(Number.POSITIVE_INFINITY);
    });

    it("스스로를 다시 부르는 재귀도 무한대로 본다", () => {
      expect(analyzeMutated(mutate("addSticker", "addSticker(emoji);"), "addSticker").writes).toBe(Number.POSITIVE_INFINITY);
    });
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
    expect(workspace.match(/<StudioCharmBarSlotLazy\b/gu)).toHaveLength(1);
    expect(workspace).toContain("<StudioCharmBarSlotLazy session={s} />");
    expect(workspace.indexOf("<StudioCharmBarSlotLazy")).toBeLessThan(workspace.indexOf("<StudioCuttoonEditorCanvasColumn"));
    // 슬롯을 정적으로 가져오면 슬롯과 순수 모듈 8개가 Studio 첫 청크 그래프에 묶여 번들 래칫(check:studio-bundle)을 깬다.
    expect(workspace).not.toMatch(/from\s+["']\.\.\/charm\/StudioCharmBarSlot["']/u);
    expect(workspace).toContain('from "../charm/StudioCharmBarSlotLazy"');
  });
});

describe("참 바 호스트 계약: 전역 단축키 경계", () => {
  // `StudioCharmBar.shortcuts.test.tsx` 는 전역 쪽 판정을 같은 함수·선택자로 흉내 낸다. 그 전제가 실제 디스패처와 같은지 여기서 지킨다.
  it("전역 디스패처는 이미 처리된 키와 단축키 경계 안의 키를 편집 명령으로 실행하지 않는다", () => {
    const source = readFileSync(new URL(`${CREATOR}studio-page-shortcut-dispatcher.ts`, import.meta.url), "utf8");
    expect(source).toContain("if (e.defaultPrevented) return;");
    expect(source).toContain(`target.closest("[data-studio-shortcut-boundary='true'], [aria-modal='true']")`);
    expect(source).toContain("shouldHandleStudioEditEvent({");
    expect(source).toMatch(/insideShortcutBoundary,\n/u);
    expect(source).toContain("undoRedoIntent: isStudioUndoRedoChord(e)");
  });

  it("경계 안에서는 되돌리기·다시 하기만 통과하고 Delete·Backspace·Shift+방향키는 실행되지 않는다", () => {
    const inside = (event: { readonly key: string; readonly ctrlKey?: boolean; readonly metaKey?: boolean }) => shouldHandleStudioEditEvent({
      typing: false,
      editing: false,
      insideShortcutBoundary: true,
      undoRedoIntent: isStudioUndoRedoChord(event),
      timelapseCapturing: false,
    });
    expect(inside({ key: "Delete" })).toBe(false);
    expect(inside({ key: "Backspace" })).toBe(false);
    expect(inside({ key: "ArrowRight" })).toBe(false);
    expect(inside({ key: "z", ctrlKey: true })).toBe(true);
    expect(inside({ key: "y", metaKey: true })).toBe(true);
  });
});

/** 인터페이스 멤버 이름(속성)을 선언 순서대로 읽는다. */
function interfaceMemberNames(relativePath: string, interfaceName: string): string[] {
  const file = sourceFileOf(relativePath);
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) names.push(member.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

describe("참 바 호스트 계약: 슬롯이 읽는 세션 필드", () => {
  // 작업공간 파일은 `@ts-nocheck` 라서 컴파일러가 슬롯에 넘기는 세션 필드를 검사하지 못한다. 이름이 호스트와 어긋나면
  // 조용히 `undefined` 를 읽으므로, 선언한 필드가 호스트가 뷰에 넘기는 속성인지 소스에서 직접 대조한다.
  const sessionFields = (): string[] => [
    ...interfaceMemberNames("./studio-charm-host-bridge.ts", "StudioCharmHostSession"),
    ...interfaceMemberNames("./StudioCharmBarSlot.tsx", "StudioCharmSlotSession"),
  ];

  it("슬롯이 읽는 세션 필드는 모두 호스트가 뷰에 넘기는 속성이다", () => {
    const source = readFileSync(new URL(HOST_SOURCE, import.meta.url), "utf8");
    const fields = sessionFields();
    expect(fields.length).toBeGreaterThan(15);
    expect(new Set(fields).size, "필드 이름은 겹치지 않는다").toBe(fields.length);
    for (const name of fields) {
      expect(source, `${name} 는 호스트가 뷰에 넘기는 속성이어야 한다`).toMatch(new RegExp(`\\n\\s+${name}=\\{`, "u"));
    }
  });

  it("기능 문서가 말하는 세션 필드 개수가 실제 선언과 같다", () => {
    const doc = readFileSync(new URL("../../../../../../docs/features/studio-charm-bar.md", import.meta.url), "utf8");
    expect(doc).toContain(`세션 필드 ${sessionFields().length}개`);
  });
});

describe("참 바 호스트 계약: 편집 잠금 값", () => {
  // 참 바는 호스트가 파생한 잠금 값만 읽는다(`studioCharmLock`). 시험 픽스처(`deriveHostLockFields`)가 같은 식을 쓴다.
  it("호스트가 잠금 값을 파생하는 식이 시험 픽스처와 같고, 공동 편집 안내는 함수다", () => {
    const source = readFileSync(new URL(HOST_SOURCE, import.meta.url), "utf8");
    expect(source).toMatch(/const pageEditLocked = reviewBoundPage && isPageReviewLocked\(activePage\.review\);/u);
    expect(source).toMatch(
      /const activeSurfaceReviewLocked =\s*collaborationDocumentLocked \|\| \(pageEditLocked && !masterEditMode\);/u,
    );
    expect(source).toMatch(/const collaborationLockMessage = useCallback\(\s*\(\) =>\s*describeStudioCollaborationLock\(/u);
  });

  it("호스트는 잠금 값을 뷰 세션에 같은 이름으로 넘긴다", () => {
    const source = readFileSync(new URL(HOST_SOURCE, import.meta.url), "utf8");
    for (const name of [
      "activeSurfaceReviewLocked",
      "collaborationDocumentLocked",
      "collaborationLockMessage",
      "masterEditMode",
      "pageEditLocked",
    ]) {
      expect(source, `${name} 는 세션에 넘어가야 한다`).toMatch(new RegExp(`\\n\\s+${name}=\\{${name}\\}\\n`, "u"));
    }
  });

  it("문서 변경은 공동 편집 잠금이면 막고, 마스터 편집 중에는 페이지 검토 잠금을 보지 않고 마스터에 쓴다", () => {
    const source = readFileSync(new URL(`${CREATOR}studio-cuttoon-editor/studio-deferred-stroke-commit.ts`, import.meta.url), "utf8");
    const collaboration = source.indexOf("if (collaborationAccessRef.current.locked) {");
    const master = source.indexOf("if (masterEditMode) {");
    const pageLock = source.indexOf("if (pageEditLocked) {");
    expect(collaboration).toBeGreaterThan(-1);
    expect(master).toBeGreaterThan(collaboration);
    expect(pageLock).toBeGreaterThan(master);
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
