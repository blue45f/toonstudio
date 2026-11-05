import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { ConflictException } from "@nestjs/common";
import * as reference from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { hashStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import * as workAsset from "@toonstudio/contracts/studio-work-asset-contract";
import ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as Y from "yjs";

import { bg3dBundleFixture } from "./studio-bg3d-bundle.test-fixture";
import * as facade from "./studio-crdt-bg3d-bundle";
import * as shape from "./studio-crdt-bg3d-shape";
import { activeStudioCrdtDeletionTargets } from "./studio-crdt-deletion-roots";
import { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";

// 442add3의 원본 순수 단락을 고정한다. import는 실행하지 않고 기존 함수 본문만 비교한다.
const before = readFileSync(new URL("./__fixtures__/studio-crdt-bg3d-shape-before.ts.txt", import.meta.url), "utf8");
const beforeFile = ts.createSourceFile("before.ts", before, ts.ScriptTarget.Latest, true);
const beforeFunctions = beforeFile.statements.filter((node) => !ts.isImportDeclaration(node))
  .map((node) => node.getText(beforeFile)).join("\n");
const baseline = runInNewContext(ts.transpileModule(beforeFunctions, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText + "\nexports", {
  exports: {}, Y, ConflictException, TextEncoder, Map, Set,
  ...reference, ...workAsset, activeStudioCrdtDeletionTargets, isBoundedStudioCrdtId,
}) as Pick<typeof facade, "snapshotStudioCrdtBg3dBundles" | "hasValidStudioCrdtBg3dBundleRoots"
  | "hasValidStudioBg3dImageReferenceProps" | "isValidStudioBg3dImageReferenceCandidate">;

const { manifest } = bg3dBundleFixture();
const manifestHash = hashStudioBg3dSixPassBundleManifest(manifest);
const revisionKey = JSON.stringify([manifest.pageId, manifest.bundleId, manifest.renderRevisionId]);
const headKey = JSON.stringify([manifest.pageId, manifest.bundleId]);

function document() {
  const doc = new Y.Doc();
  const revision = { version: 1, pageId: manifest.pageId, bundleId: manifest.bundleId,
    renderRevisionId: manifest.renderRevisionId, parentRevisionId: null, manifestHash };
  doc.getMap(shape.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).set(revisionKey, JSON.stringify(revision));
  doc.getMap(shape.STUDIO_BG3D_BUNDLE_ACTIVE_ROOT).set(headKey, manifest.renderRevisionId);
  for (const layer of manifest.layers) {
    const record = doc.getMap(`scene-element:${layer.elementId}`);
    for (const [key, value] of Object.entries({ id: layer.elementId, pageId: manifest.pageId,
      layerId: manifest.groupId, payloadVersion: 1, type: "reference", deleted: false })) record.set(key, value);
    for (const [key, value] of Object.entries({ elementType: "image", x: 0, y: 0, width: 1, height: 1,
      rotation: 0, opacity: 1, blendMode: "normal",
      src: layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}`
        : reference.studioBg3dSixPassArtifactSourceUri(layer.artifact.contentHash),
      bg3dLtBundleId: manifest.bundleId, bg3dLtRole: layer.role, bg3dLtRenderMode: "separated",
      bg3dLtBundleReference: { kind: "bg3d-sixpass-bundle", bundleId: manifest.bundleId,
        renderRevisionId: manifest.renderRevisionId, manifestHash, role: layer.role, elementId: layer.elementId } })) record.set(`prop:${key}`, value);
  }
  return doc;
}

function outcome(run: () => unknown) {
  try { return { ok: true, value: structuredClone(run()) }; }
  catch (error) {
    if (error === null || typeof error !== "object" || !("name" in error) || !("message" in error)) throw error;
    return { ok: false, name: error.name, message: error.message,
      status: error instanceof ConflictException ? error.getStatus() : null,
      response: error instanceof ConflictException ? structuredClone(error.getResponse()) : null };
  }
}

function body(source: ts.SourceFile, name: string): string {
  const declarations = source.statements.filter((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  expect(declarations, name).toHaveLength(1);
  return declarations[0]!.body!.getText(source);
}

describe("6패스 순수 shape 분리의 원본 동등성", () => {
  it("원본 fixture·상수·예산과 마스크 계약 확장 외 순수 함수 본문을 그대로 유지한다", () => {
    expect(createHash("sha256").update(before).digest("hex")).toBe("4db06fecf624253c05a7124bd26012bf6bbf906dab62a0751345e6dfb137ddec");
    const current = readFileSync(new URL("./studio-crdt-bg3d-shape.ts", import.meta.url), "utf8");
    const file = ts.createSourceFile("shape.ts", current, ts.ScriptTarget.Latest, true);
    // PR #2718의 유효 마스크 허용은 아래 동작 검사로 구분하고, 추출 전 fixture는 바꾸지 않는다.
    for (const name of ["object", "map", "props", "sourceHash", "isValidStudioBg3dImageReferenceCandidate"])
      expect(body(file, name), name).toBe(body(beforeFile, name));
    expect(body(file, "parseStudioCrdtBg3dRevision")).toBe(body(beforeFile, "parseRevision"));
    expect(body(file, "snapshotStudioCrdtBg3dShape")).toBe(body(beforeFile, "snapshotStudioCrdtBg3dBundles")
      .replace("parseRevision(raw)", "parseStudioCrdtBg3dRevision(raw, failure)"));
    expect(body(file, "hasValidStudioCrdtBg3dBundleRoots")).toBe(body(beforeFile, "hasValidStudioCrdtBg3dBundleRoots")
      .replace("snapshotStudioCrdtBg3dBundles(doc)", "snapshotStudioCrdtBg3dShape(doc)"));
    for (const declaration of beforeFile.statements.filter(ts.isVariableStatement)) {
      expect(current).toContain(declaration.getText(beforeFile));
    }
  });

  it("기존 public 상수·validator는 같은 객체를 재export하고 snapshot signature도 유지한다", () => {
    expect(facade.STUDIO_BG3D_IMAGE_PROPERTIES).toBe(shape.STUDIO_BG3D_IMAGE_PROPERTIES);
    expect(facade.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).toBe(shape.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT);
    expect(facade.STUDIO_BG3D_BUNDLE_ACTIVE_ROOT).toBe(shape.STUDIO_BG3D_BUNDLE_ACTIVE_ROOT);
    expect(facade.hasValidStudioBg3dImageReferenceProps).toBe(shape.hasValidStudioBg3dImageReferenceProps);
    expect(facade.isValidStudioBg3dImageReferenceCandidate).toBe(shape.isValidStudioBg3dImageReferenceCandidate);
    expect(facade.hasValidStudioCrdtBg3dBundleRoots).toBe(shape.hasValidStudioCrdtBg3dBundleRoots);
    expectTypeOf<facade.StudioCrdtBg3dRevisionReference>().toEqualTypeOf<shape.StudioCrdtBg3dRevisionReference>();
    expectTypeOf<facade.StudioCrdtBg3dBundleSnapshot>().toEqualTypeOf<shape.StudioCrdtBg3dBundleSnapshot>();
    expectTypeOf<typeof facade.snapshotStudioCrdtBg3dBundles>().toEqualTypeOf<(doc: Y.Doc) => shape.StudioCrdtBg3dBundleSnapshot>();
  });

  it.each<[string, (doc: Y.Doc) => void]>([
    ["정상 여섯 레이어", () => undefined],
    ["JSON 구문 오류", (doc) => { doc.getMap(shape.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).set(revisionKey, "{"); }],
    ["비문자열 revision", (doc) => { doc.getMap(shape.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).set(revisionKey, 1); }],
    ["1024바이트 초과", (doc) => { doc.getMap(shape.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).set(revisionKey, "x".repeat(1025)); }],
    ["revision shape 오류", (doc) => { doc.getMap(shape.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).set(revisionKey, "{}"); }],
    ["revision key 불일치", (doc) => { doc.getMap(shape.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).set("invalid-key", doc.getMap(shape.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).get(revisionKey)); }],
    ["없는 부모 revision", (doc) => { const roots = doc.getMap<string>(shape.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT); roots.set(revisionKey, JSON.stringify({ ...JSON.parse(roots.get(revisionKey)!), parentRevisionId: "missing" })); }],
    ["순환 부모 revision", (doc) => { const roots = doc.getMap<string>(shape.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT); roots.set(revisionKey, JSON.stringify({ ...JSON.parse(roots.get(revisionKey)!), parentRevisionId: manifest.renderRevisionId })); }],
    ["다른 활성 head", (doc) => { doc.getMap(shape.STUDIO_BG3D_BUNDLE_ACTIVE_ROOT).set(headKey, "missing"); }],
    ["head JSON 오류", (doc) => { doc.getMap(shape.STUDIO_BG3D_BUNDLE_ACTIVE_ROOT).set("{", "missing"); }],
    ["이미지 역할 불일치", (doc) => { doc.getMap("scene-element:element-color").set("prop:bg3dLtRole", "shadow"); }],
    ["미지원 namespace", (doc) => { doc.getMap("studio-bg3d-bundle-unknown").set("unexpected", true); }],
  ])("%s의 반환값·snapshot·409/code/message·SyntaxError를 원본과 동일하게 유지한다", (_name, mutate) => {
    const doc = document();
    try {
      mutate(doc);
      expect(shape.hasValidStudioCrdtBg3dBundleRoots(doc)).toBe(baseline.hasValidStudioCrdtBg3dBundleRoots(doc));
      expect(outcome(() => facade.snapshotStudioCrdtBg3dBundles(doc))).toEqual(outcome(() => baseline.snapshotStudioCrdtBg3dBundles(doc)));
    } finally { doc.destroy(); }
  });

  it("image props·candidate의 엄격한 거절과 기존 reference 위임 결과를 보존한다", () => {
    const doc = document();
    try {
      const values = Object.fromEntries([...doc.getMap("scene-element:element-color")]
        .filter(([key]) => key.startsWith("prop:")).map(([key, value]) => [key.slice(5), value]));
      for (const [key, value] of Object.entries({ src: "https://example.test/image.png", bg3dLtRole: "invalid",
        bg3dLtBundleReference: null, bg3dLtRenderMode: "flattened", blendMode: "invalid", unexpected: true })) {
        const changed = { ...values, [key]: value };
        expect(shape.hasValidStudioBg3dImageReferenceProps("element-color", changed)).toBe(baseline.hasValidStudioBg3dImageReferenceProps("element-color", changed));
        expect(shape.isValidStudioBg3dImageReferenceCandidate(key, value)).toBe(baseline.isValidStudioBg3dImageReferenceCandidate(key, value));
      }
      expect(shape.hasValidStudioBg3dImageReferenceProps("other-id", values)).toBe(false);
      expect(shape.hasValidStudioBg3dImageReferenceProps("legacy", {})).toBeUndefined();
      expect(shape.isValidStudioBg3dImageReferenceCandidate("unknown", true)).toBeUndefined();
    } finally { doc.destroy(); }
  });

  it.each([true, false, undefined])("PR #2718의 유효 마스크 계약 확장만 순수 shape와 기존 facade 양쪽에서 허용한다 (enabled=%s)", (enabled) => {
    const doc = document();
    try {
      const image = doc.getMap("scene-element:element-color");
      const original = Object.fromEntries([...image].filter(([key]) => key.startsWith("prop:")).map(([key, value]) => [key.slice(5), value]));
      const mask = { filterMaskSurfaceId: "filter-mask:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        ...(enabled === undefined ? {} : { filterMaskEnabled: enabled }) };
      const changed = { ...original, ...mask };
      expect(baseline.hasValidStudioBg3dImageReferenceProps("element-color", original)).toBe(true);
      expect(baseline.hasValidStudioBg3dImageReferenceProps("element-color", changed)).toBe(false);
      for (const validate of [shape.hasValidStudioBg3dImageReferenceProps, facade.hasValidStudioBg3dImageReferenceProps]) {
        expect(validate("element-color", original)).toBe(true);
        expect(validate("element-color", changed)).toBe(true);
      }
      for (const [key, value] of Object.entries(mask)) image.set(`prop:${key}`, value);
      expect(shape.hasValidStudioCrdtBg3dBundleRoots(doc)).toBe(true);
      expect(facade.snapshotStudioCrdtBg3dBundles(doc).images.get("element-color")?.props).toMatchObject(mask);
    } finally { doc.destroy(); }
  });

  it.each([
    { filterMaskEnabled: true },
    { filterMaskSurfaceId: "not-a-filter-mask" },
    { filterMaskSurfaceId: "filter-mask:v1:AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
    { filterMaskSurfaceId: "filter-mask:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", filterMaskEnabled: "true" },
    { filterMaskSurfaceId: "filter-mask:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", filterMaskEnabled: null },
    { filterMaskSurfaceId: "filter-mask:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", filterMaskUnexpected: true },
    { filterMaskSurfaceId: "filter-mask:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", width: 0 },
    { filterMaskSurfaceId: "filter-mask:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", src: "https://example.test/image.png" },
  ])("잘못된 마스크·미지원 속성·기존 이미지 계약 위반은 추출 전과 동일하게 거부한다: %j", (changes) => {
    const doc = document();
    try {
      const original = Object.fromEntries([...doc.getMap("scene-element:element-color")]
        .filter(([key]) => key.startsWith("prop:")).map(([key, value]) => [key.slice(5), value]));
      const changed = { ...original, ...changes };
      for (const validate of [baseline.hasValidStudioBg3dImageReferenceProps, shape.hasValidStudioBg3dImageReferenceProps, facade.hasValidStudioBg3dImageReferenceProps])
        expect(validate("element-color", changed)).toBe(false);
    } finally { doc.destroy(); }
  });

  it("snapshot의 Map과 props는 새 컨테이너이며 저장된 내부 reference 객체 공유는 원본과 같다", () => {
    const doc = document();
    try {
      const record = doc.getMap("scene-element:element-color"), stored = record.get("prop:bg3dLtBundleReference");
      for (const snapshot of [baseline.snapshotStudioCrdtBg3dBundles, facade.snapshotStudioCrdtBg3dBundles]) {
        const first = snapshot(doc), second = snapshot(doc);
        expect(first.revisions).not.toBe(second.revisions);
        expect(first.images.get("element-color")!.props).not.toBe(second.images.get("element-color")!.props);
        expect(first.images.get("element-color")!.props.bg3dLtBundleReference).toBe(stored);
        expect(first.images.get("element-color")!.ref).not.toBe(stored);
        expect(first.images.get("element-color")!.ref).toEqual(stored);
        first.revisions.clear();
        expect(second.revisions.size).toBe(1);
        expect(doc.getMap(shape.STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).size).toBe(1);
      }
    } finally { doc.destroy(); }
  });
});
