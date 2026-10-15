import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleEdges {
  readonly dynamicImports: readonly string[];
  readonly source: string;
  readonly typeOnlyImports: readonly string[];
  readonly valueImports: readonly string[];
}

function moduleEdges(relativePath: string): ModuleEdges {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const dynamicImports: string[] = [];
  const typeOnlyImports: string[] = [];
  const valueImports: string[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (node.importClause?.isTypeOnly) {
        typeOnlyImports.push(node.moduleSpecifier.text);
      } else {
        valueImports.push(node.moduleSpecifier.text);
      }
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return { dynamicImports, source, typeOnlyImports, valueImports };
}

const SYNC_COMMAND_START = "async function applyPathBooleanCombineSync(op: StudioPathBooleanOp)";
/** 팩토리 반환문 — 줄바꿈·들여쓰기에 무관하게 세 명령이 모두 노출되는지 본다. */
const FACTORY_RETURN =
  /return\s*\{\s*applyPaperVectorRefinement,\s*applyPathBooleanCombine,\s*applyPathBooleanCombineSync,?\s*\};/u;

function pathBooleanHandler(): string {
  // The async command bodies moved verbatim into the StudioPage vector-ops factory module.
  // 기본(CanvasKit Worker) 결합 본문은 명시 선택 전용 동기(다각형) 결합 명령 직전에서 끝난다.
  const vectorOps = moduleEdges("../studio-page-vector-ops.ts").source;
  const start = vectorOps.indexOf(
    "async function applyPathBooleanCombine(op: StudioPathBooleanOp)",
  );
  const end = vectorOps.indexOf(SYNC_COMMAND_START, start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return vectorOps.slice(start, end);
}

/** 명시 선택 전용 동기(다각형) 결합 명령 본문 — 팩토리 반환문 직전까지. */
function syncPolygonHandler(): string {
  const vectorOps = moduleEdges("../studio-page-vector-ops.ts").source;
  const start = vectorOps.indexOf(SYNC_COMMAND_START);
  const end = start < 0 ? -1 : start + vectorOps.slice(start).search(FACTORY_RETURN);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return vectorOps.slice(start, end);
}

describe("CanvasKit PathOps product entry boundary", () => {
  it("keeps the heavy Worker client graph behind one analyzable dynamic import", () => {
    const page = moduleEdges("../StudioCuttoonEditorHost.tsx");
    const vectorOps = moduleEdges("../studio-page-vector-ops.ts");
    const workerClient = "./studio-quality-worker-client";

    expect(vectorOps.valueImports).toContain(
      "./render/studio-canvaskit-path-boolean-document-adapter",
    );
    expect(vectorOps.valueImports).not.toContain(workerClient);
    expect(vectorOps.typeOnlyImports).toContain(workerClient);
    expect(
      vectorOps.dynamicImports.filter((specifier) => specifier === workerClient),
    ).toEqual([workerClient]);
    expect(page.valueImports).toContain("./studio-page-vector-ops");
    expect(page.valueImports).not.toContain(workerClient);
    expect(page.dynamicImports).not.toContain(workerClient);
  });

  it("flushes settled ink, calls CanvasKit, revalidates authority, and commits once", () => {
    const handler = pathBooleanHandler();
    const flushAt = handler.indexOf("flushPendingStrokeCommitsRef.current()");
    const ticketAt = handler.indexOf("captureStudioMutationTicket()");
    const importAt = handler.indexOf(
      'await import("./studio-quality-worker-client")',
    );
    const pathOpsAt = handler.indexOf(
      "await combineStudioShapesWithCanvasKit(",
    );
    const staleAt = handler.indexOf(
      "studioVectorAsyncCommandStaleReason(snapshot",
    );
    const commitAt = handler.indexOf("const committed = commit(");

    expect(flushAt).toBeGreaterThan(0);
    expect(ticketAt).toBeGreaterThan(flushAt);
    expect(importAt).toBeGreaterThan(ticketAt);
    expect(pathOpsAt).toBeGreaterThan(importAt);
    expect(staleAt).toBeGreaterThan(pathOpsAt);
    expect(commitAt).toBeGreaterThan(staleAt);
    expect(handler.match(/\bcommit\(/gu)).toHaveLength(1);
    expect(handler).toContain("sourceElements: selectionEls");
    expect(handler).toContain("elements: latestElements");
    expect(handler).toContain("mutationAllowed");
    expect(handler).toContain("reviewLocked: activeSurfaceReviewLockedRef.current");
  });

  it("fails closed without rerunning the operation through polygon-clipping", () => {
    const handler = pathBooleanHandler();

    expect(handler).not.toContain("fallbackAllowed");
    expect(handler).not.toContain("polygon-clipping");
    expect(handler).not.toContain("combineStudioShapes(baseSpec, topSpec, op)");
    expect(handler.match(/combineStudioShapesWithCanvasKit\(/gu)).toHaveLength(1);
    // 같은 모듈의 동기(다각형) 엔진은 패널에서 명시 선택했을 때만 도는 별개 명령이다.
    // CanvasKit 실패를 받아 자동으로 이어 실행하는 경로가 이 본문에 생기면 안 된다.
    expect(handler).not.toContain("combineStudioShapesSync");
    expect(handler).not.toContain("applyPathBooleanCombineSync");
    expect(handler).toContain("if (!result.ok)");
    expect(handler).toContain("pathBooleanClientRef.current?.dispose()");
    expect(handler).toContain("원본 도형을 유지했어요");
    expect(handler).toContain("다른 엔진은 자동으로 실행하지 않았습니다");
  });

  it("keeps the polygon sync combine an explicit command that never touches the Worker client", () => {
    const vectorOps = moduleEdges("../studio-page-vector-ops.ts").source;
    const sync = syncPolygonHandler();

    expect(vectorOps).toMatch(FACTORY_RETURN);
    expect(sync).toContain("combineStudioShapesSync(");
    expect(sync).not.toContain("combineStudioShapesWithCanvasKit");
    expect(sync).not.toContain("studio-quality-worker-client");
    expect(sync).not.toContain("pathBooleanClientRef.current =");
    // 단일 commit, Undo 규율은 기본 결합과 같다 — 정점 상한을 넘으면 아무것도 선점하지 않고 기존 경로로 위임한다.
    expect(sync.match(/\bcommit\(/gu)).toHaveLength(1);
    expect(sync).toContain("return applyPathBooleanCombine(op);");
  });

  it("owns cancellation, Worker lifetime, timeline cleanup, and selection ref synchronization", () => {
    // 984251d8c 가 취소/수명 관리 effect 들을 이 런타임 훅으로 옮겼다.
    const page = moduleEdges(
      "../studio-cuttoon-editor/runtime/useStudioVectorOperationRuntime.ts",
    ).source;
    const handler = pathBooleanHandler();

    expect(page).toContain("pathBooleanAbortRef.current?.abort()");
    expect(page).toContain("pathBooleanClientRef.current?.dispose()");
    expect(handler).toContain("removeTrack(document, id)");
    expect(handler).toContain("applyGroupSelectionState({");
    expect(handler).toContain("Skia 고품질 경로");
  });
});
