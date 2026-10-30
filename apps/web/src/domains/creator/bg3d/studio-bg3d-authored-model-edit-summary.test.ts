import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import * as ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { summarizeStudioBg3dAuthoredModelEditSource, type StudioBg3dAuthoredModelEditSummaryHost } from "./studio-bg3d-authored-model-edit-summary";
import { studioBg3dModelCacheKey, studioBg3dModelRuntimeVariant } from "./studio-bg3d-model-material-variant";
import { STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT, STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY } from "./studio-bg3d-primitive-edit-authoring-keys";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";

// 이 테스트가 통과하려면 summary의 type import가 실제 source/codec/저장 권위를 실행하지 않아야 한다.
vi.mock("./studio-bg3d-authored-model-edit-source", () => { throw Error("source는 UI summary에서 열면 안 됩니다."); });
vi.mock("./studio-bg3d-primitive-edit-authoring-glb", () => { throw Error("GLB replay는 UI summary에서 열면 안 됩니다."); });
vi.mock("./studio-bg3d-model-library-loader", () => { throw Error("저장 I/O는 UI summary에서 열면 안 됩니다."); });

function fixture() {
  const model = { id: "selected", modelId: "asset", name: "재편집 모델", position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number], tags: ["실내"] };
  const live: { current: StudioBg3dPrimitiveEditRuntime } = { current: { primitives: [], customModels: [model], document: createDefaultStudioBg3dSceneDocument() } };
  const userData: Record<string, unknown> = { [STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY]: { format: STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT, version: 1 } };
  const cache = new Map([[studioBg3dModelCacheKey(model.modelId, "webgl"), { root: { userData }, runtimeVariant: studioBg3dModelRuntimeVariant("webgl"), record: { id: model.modelId } }]]), selected = { current: new Set([model.id]) };
  const session: { current: object | null } = { current: {} }; let locked = false;
  const host: StudioBg3dAuthoredModelEditSummaryHost = { open: true, selectedIds: new Set(["stale-render"]), selectedIdsRef: selected,
    physicsRuntimeSourceRef: live, modalAssetSessionRef: session, modelRootCacheRef: { current: cache }, isPrimitiveEditInteractionLocked: () => locked };
  return { host, model, live, userData, cache, selected, session, lock: () => { locked = true; } };
}

function emittedRuntimeImports(path: string): readonly string[] {
  const require = createRequire(import.meta.url);
  const source = readFileSync(require.resolve(path), "utf8");
  const emitted = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true } }).outputText;
  const module = ts.createSourceFile("runtime-boundary.js", emitted, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node)) {
      expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
      expect(ts.isIdentifier(node.expression) && node.expression.text === "require").toBe(false);
    }
    ts.forEachChild(node, visit);
  };
  visit(module);
  return imports;
}

describe("authored model의 얇은 UI 보관 summary", () => {
  it.each(["webgl", "webgpu"] as const)("%s의 실제 key/stamp만 보관 힌트로 소비한다", (backend) => {
    const f = fixture(), gpuData = {};
    f.cache.set(studioBg3dModelCacheKey(f.model.modelId, "webgpu"), { root: { userData: gpuData },
      runtimeVariant: studioBg3dModelRuntimeVariant("webgpu"), record: { id: f.model.modelId } });
    const host = { ...f.host, materialBackend: backend,
      modelRenderer: backend === "webgpu" ? { isWebGPURenderer: true } : { isWebGLRenderer: true } };
    expect(summarizeStudioBg3dAuthoredModelEditSource(host).blockedReason === null).toBe(backend === "webgl");
  });

  it.each(["missing-stamp", "wrong-stamp", "wrong-record", "raw-alias"] as const)("%s는 보관 힌트가 있어도 거부한다", (kind) => {
    const f = fixture(), entry = f.cache.get(studioBg3dModelCacheKey(f.model.modelId, "webgl"));
    if (!entry) throw Error("fixture cache 없음");
    f.cache.clear();
    if (kind === "missing-stamp") Object.defineProperty(entry, "runtimeVariant", { value: undefined });
    if (kind === "wrong-stamp") entry.runtimeVariant = studioBg3dModelRuntimeVariant("webgpu");
    if (kind === "wrong-record") entry.record.id = "wrong";
    f.cache.set(kind === "raw-alias" ? f.model.modelId : studioBg3dModelCacheKey(f.model.modelId, "webgl"), entry);
    expect(summarizeStudioBg3dAuthoredModelEditSource(f.host).nodeId).toBeNull();
  });

  it("최신 selection ref와 최소 보관 식별자만 읽고 source 인증으로 취급하지 않는다", () => {
    const f = fixture();
    const mesh = vi.fn(() => { throw Error("전체 payload를 읽으면 안 됩니다."); });
    const hint = { format: STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT, version: 1 };
    Object.defineProperty(hint, "mesh", { get: mesh });
    f.userData[STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY] = hint;
    expect(summarizeStudioBg3dAuthoredModelEditSource(f.host)).toEqual({ nodeId: f.model.id, name: f.model.name, blockedReason: null });
    expect(mesh).not.toHaveBeenCalled(); expect(f.live.current.customModels[0]).toBe(f.model);
  });

  it.each(["closed", "session", "locked", "empty", "multiple", "other", "hidden", "hidden-tag", "model-lock", "parent", "child", "loading", "no-payload"] as const)("%s 상태를 현재 host에서 읽어 안내한다", (kind) => {
    const f = fixture(); let host = f.host;
    if (kind === "closed") host = { ...host, open: false };
    if (kind === "session") f.session.current = null;
    if (kind === "locked") f.lock();
    if (kind === "empty") f.selected.current = new Set();
    if (kind === "multiple") f.selected.current = new Set([f.model.id, "another"]);
    if (kind === "other") f.selected.current = new Set(["another"]);
    if (kind === "hidden") f.live.current = { ...f.live.current, customModels: [{ ...f.model, visible: false }] };
    if (kind === "hidden-tag") f.live.current = { ...f.live.current, document: { ...f.live.current.document, meta: { hiddenTags: ["실내"] } } };
    if (kind === "model-lock") f.live.current = { ...f.live.current, customModels: [{ ...f.model, locked: true }] };
    if (kind === "parent") f.live.current = { ...f.live.current, customModels: [{ ...f.model, parentId: "parent" }] };
    if (kind === "child") f.live.current = { ...f.live.current, customModels: [f.model, { ...f.model, id: "child", parentId: f.model.id }] };
    if (kind === "loading") f.cache.clear();
    if (kind === "no-payload") delete f.userData[STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY];
    expect(summarizeStudioBg3dAuthoredModelEditSource(host)).toMatchObject({ nodeId: null, blockedReason: expect.any(String) });
  });

  it.each([null, undefined, [], 42, { format: "foreign", version: 1 }, { format: STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT, version: 99 }])("malformed 보관 힌트 %s는 실제 capture에서 구체 거부하도록 남긴다", (hint) => {
    const f = fixture(); f.userData[STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY] = hint;
    expect(summarizeStudioBg3dAuthoredModelEditSource(f.host).blockedReason).toBeNull();
  });

  it("힌트 getter를 실행하거나 inherited marker를 인증하지 않는다", () => {
    const f = fixture(), getter = vi.fn(() => { throw Error("힌트 getter 실행 금지"); });
    Object.defineProperty(f.userData, STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY, { get: getter, configurable: true });
    expect(summarizeStudioBg3dAuthoredModelEditSource(f.host).blockedReason).toBeNull(); expect(getter).not.toHaveBeenCalled();
    delete f.userData[STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY];
    Object.setPrototypeOf(f.userData, { [STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY]: { format: STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT, version: 1 } });
    expect(summarizeStudioBg3dAuthoredModelEditSource(f.host).blockedReason).toContain("기존 GLB");
  });

  it("최신 cache 준비와 payload 부재를 구분하며 늦은 cache 준비를 같은 host에서 다시 읽는다", () => {
    const f = fixture(), entry = f.cache.get(studioBg3dModelCacheKey(f.model.modelId, "webgl")); f.cache.clear();
    expect(summarizeStudioBg3dAuthoredModelEditSource(f.host).blockedReason).toContain("캐시를 준비 중");
    if (!entry) throw Error("fixture cache 없음"); f.cache.set(studioBg3dModelCacheKey(f.model.modelId, "webgl"), entry);
    expect(summarizeStudioBg3dAuthoredModelEditSource(f.host).blockedReason).toBeNull();
    delete f.userData[STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY];
    expect(summarizeStudioBg3dAuthoredModelEditSource(f.host).blockedReason).toContain("기존 GLB");
  });

  it("summary의 emitted runtime import는 keys와 variant 조회 모듈 두 개로만 고정한다", () => {
    expect(emittedRuntimeImports("./studio-bg3d-authored-model-edit-summary.ts")).toEqual([
      "./studio-bg3d-primitive-edit-authoring-keys",
      "./studio-bg3d-model-material-variant",
    ]);
  });

  it("variant 조회 helper는 변환 뒤에도 Three·GLB·저장 모듈을 실행하는 의존성이 없다", () => {
    expect(emittedRuntimeImports("./studio-bg3d-model-material-variant.ts")).toEqual([]);
  });
});
