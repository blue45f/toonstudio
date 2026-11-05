import { materializeStudioAuthoringFromCrdt, readStudioCrdtScopedRecords } from "@toonstudio/contracts/studio-crdt-authoring";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { hasValidStudioCrdtRootSchema } from "../../../../../../apps/api/src/modules/creator/studio-crdt-root-schema";
import { normalizeStudioBrushDynamicsSettings, STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4 } from "../../../../../../apps/web/src/domains/creator/brush/studio-brush-dynamics";
import { createBrushStudioV6Program } from "../../../../../../apps/web/src/domains/creator/brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6MaterialReceipt } from "../../../../../../apps/web/src/domains/creator/brush-lab/brush-studio-v6-material-receipt";
import { StudioCrdtDocument } from "../../../../../../apps/web/src/domains/creator/live/studio-crdt-document";
import { studioDrawElementToCrdtStroke, studioCrdtStrokeToDrawElement, studioPageToCrdtPage, type StudioCrdtCompatibleDrawElement } from "../../../../../../apps/web/src/domains/creator/live/studio-crdt-page-bridge";

function archivedStroke(version: 1 | 2 = 2): StudioCrdtCompatibleDrawElement {
  const material = createBrushStudioV6MaterialReceipt({ ...createBrushStudioV6Program("mixbox-pigment-spray"), licenseProfile: "noncommercial-full" });
  return { id: "archive-id", type: "draw", kind: "freehand", mode: "pen", points: [1, 2, 3, 4], pressures: [0.4, 0.7], tiltXs: [0, 0], tiltYs: [0, 0], twists: [0, 0], speeds: [0, 0], tangentialPressures: [0, 0], stroke: "#123456", strokeWidth: 20,
    hidden: true, groupId: "archive-group", name: "원본 이름", clipBelow: true,
    legacyPigmentArchive: { version: 1, sourceElementId: "source-id", sourceGroupId: "original-group", sourceIndex: 1, sourceHidden: false },
    brushEnginePrograms: { version: 1, material: version === 1
      ? { version: 1, seed: material.seed, slots: material.slots, tuning: material.tuning, input: material.input }
      : { ...material, runtime: { ...material.runtime, bindings: material.runtime.bindings.map((binding) => binding.nodeIds.includes("pigment-mixbox")
        ? { providerId: "mixbox-js-v2", version: "2.0.0", license: "CC-BY-NC-4.0", rights: "noncommercial", execution: "native", nodeIds: ["pigment-mixbox"] } : binding) } } } };
}
function ySnapshot(document: StudioCrdtDocument): Y.Doc {
  const result = new Y.Doc(); Y.applyUpdate(result, document.encodeStateAsUpdate()); return result;
}
function persisted(source: StudioCrdtCompatibleDrawElement) {
  const document = new StudioCrdtDocument();
  const page = { id: "page-1", elements: [], groups: [], bg: "#fff", bgGrad: null, canvasH: 900 };
  document.addPage(studioPageToCrdtPage(page));
  document.addLayerGroup({ id: "archive-group", pageId: page.id, payload: { version: 1, props: { name: "보관 원본", hidden: true, locked: true } } });
  const record = document.addStroke(studioDrawElementToCrdtStroke(page.id, source));
  return { document, page, record };
}

describe("외부 혼색 원본 출처의 실제 Y 저장·웹/서버 투영", () => {
  it.each([1, 2] as const)("V%i 원본을 v7로 복제·직렬화해 source identity와 외부 실행 영수증을 보존한다", (version) => {
    const source = archivedStroke(version), before = JSON.stringify(source), f = persisted(source);
    const peer = new StudioCrdtDocument(f.document.encodeStateAsUpdate()), raw = ySnapshot(peer);
    try {
      expect(f.record.payload.version).toBe(7);
      expect(hasValidStudioCrdtRootSchema(raw)).toBe(true);
      const decoded = studioCrdtStrokeToDrawElement(peer.getStroke(source.id)!);
      expect(decoded.legacyPigmentArchive).toEqual(source.legacyPigmentArchive);
      expect(decoded.brushEnginePrograms).toEqual(source.brushEnginePrograms);
      expect(decoded).toMatchObject({ hidden: true, clipBelow: true, name: source.name, groupId: "archive-group" });
      expect(studioDrawElementToCrdtStroke(f.page.id, decoded)).toEqual(studioDrawElementToCrdtStroke(f.page.id, source));
      const baseline = { pagesList: [f.page], originalMetadata: "유지" };
      const projected = materializeStudioAuthoringFromCrdt({ baseline, doc: raw });
      expect(projected).toMatchObject({ originalMetadata: "유지", pagesList: [{ elements: [{ legacyPigmentArchive: source.legacyPigmentArchive, brushEnginePrograms: source.brushEnginePrograms }] }] });
      expect(readStudioCrdtScopedRecords({ baseline, doc: raw }).find((entry) => entry.id === source.id)?.value.legacyPigmentArchive).toEqual(source.legacyPigmentArchive);
      expect(JSON.stringify(source)).toBe(before);
    } finally { raw.destroy(); peer.destroy(); f.document.destroy(); }
  });
  it.each([1, 2] as const)("V%i sparse 원본의 누락된 kind/mode/센서 채널을 Y 신규입력·재접속 뒤에도 만들지 않는다", (version) => {
    const source = archivedStroke(version);
    for (const key of ["kind", "mode", "pressures", "tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures"] as const) delete source[key];
    const f = persisted(source), peer = new StudioCrdtDocument(f.document.encodeStateAsUpdate()), raw = ySnapshot(peer);
    try {
      expect(hasValidStudioCrdtRootSchema(raw)).toBe(true);
      const decoded = studioCrdtStrokeToDrawElement(peer.getStroke(source.id)!);
      expect(decoded).toEqual({ id: source.id, type: source.type, points: source.points, stroke: source.stroke, strokeWidth: source.strokeWidth,
        name: source.name, hidden: source.hidden, groupId: source.groupId, clipBelow: source.clipBelow,
        brushEnginePrograms: source.brushEnginePrograms, legacyPigmentArchive: source.legacyPigmentArchive });
      for (const key of ["kind", "mode", "pressures", "tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures"]) {
        expect(decoded).not.toHaveProperty(key);
        expect(peer.getStroke(source.id)!.payload).not.toHaveProperty(key);
        expect(raw.getMap<Y.Map<unknown>>("strokes").get(source.id)!.has(key)).toBe(false);
      }
      const baseline = { pagesList: [f.page] };
      const record = readStudioCrdtScopedRecords({ baseline, doc: raw }).find((entry) => entry.id === source.id)!;
      expect(record.value).toEqual(decoded);
      expect(studioDrawElementToCrdtStroke(f.page.id, decoded)).toEqual(studioDrawElementToCrdtStroke(f.page.id, source));
    } finally { raw.destroy(); peer.destroy(); f.document.destroy(); }
  });
  it("보관 v7에서만 기존 PSD·힌트 마스크·3D 보정 메타데이터를 raw Y와 양쪽 투영에 보존한다", () => {
    const fields = {
      psdGroupId: "original-psd-folder", psdRasterSourceId: "original-psd-layer",
      psdSource: { version: 1, hash: `sha256:${"a".repeat(64)}`, name: "원본.psd", bytes: 26 },
      psdFolderPath: [{ id: "original-psd-folder", name: "원래 폴더" }],
      colorizeMask: { hints: [], params: { gapCloseHintPx: 8, edgeDetectionPx: 0, cleanupPercent: 30, limitToLayerBounds: true }, bakedRevision: null },
      colorizeMaskEnabled: false,
      linked3dCorrection: { kind: "toonstudio.linked-3d-correction", version: 1, bundleId: "original-3d-bundle", pass: "line", sourcePassRevision: 1,
        sourceHash: `sha256:${"a".repeat(64)}`, baseGeometryHash: `sha256:${"b".repeat(64)}`, topologyHash: `sha256:${"c".repeat(64)}`,
        objectIdentityHash: `sha256:${"d".repeat(64)}`, basePassRootHash: `sha256:${"e".repeat(64)}` },
    };
    const source = { ...archivedStroke(), ...fields }, f = persisted(source), raw = ySnapshot(f.document);
    try {
      expect(hasValidStudioCrdtRootSchema(raw)).toBe(true);
      const decoded = studioCrdtStrokeToDrawElement(f.record);
      expect(decoded).toMatchObject(fields);
      expect(readStudioCrdtScopedRecords({ baseline: { pagesList: [f.page] }, doc: raw }).find((record) => record.id === source.id)?.value).toMatchObject(fields);
      const plain = { ...source }; delete plain.legacyPigmentArchive;
      const active = { ...plain, brushEnginePrograms: { version: 1 as const, material: createBrushStudioV6MaterialReceipt(createBrushStudioV6Program("mixbox-pigment-spray")) } };
      const activeInput = studioDrawElementToCrdtStroke(f.page.id, active);
      expect(activeInput.payload.version).toBe(7);
      expect(activeInput.payload.extensions).toMatchObject(fields);
      expect(activeInput.payload.extensions).not.toHaveProperty("legacyPigmentArchive");
      const activeDocument = new StudioCrdtDocument();
      try {
        activeDocument.addStroke(activeInput);
        const activePeer = new StudioCrdtDocument(activeDocument.encodeStateAsUpdate()), activeRaw = ySnapshot(activePeer);
        try {
          expect(hasValidStudioCrdtRootSchema(activeRaw)).toBe(true);
          expect(studioCrdtStrokeToDrawElement(activePeer.getStroke(active.id)!)).toMatchObject(fields);
          expect(readStudioCrdtScopedRecords({ baseline: { pagesList: [f.page] }, doc: activeRaw }).find((record) => record.id === active.id)?.value).toMatchObject(fields);
        } finally { activeRaw.destroy(); activePeer.destroy(); }
      } finally { activeDocument.destroy(); }
    } finally { raw.destroy(); f.document.destroy(); }
  });
  it.each(["unknown-extension", "psd-version", "psd-folder-field", "correction-version", "colorize-type", "too-large"])("보관 v7의 손상·미지 확장·기존 metadata 크기 상한 초과를 서버가 거절한다: %s", (change) => {
    const f = persisted(archivedStroke()), raw = ySnapshot(f.document);
    try {
      const record = raw.getMap<Y.Map<unknown>>("strokes").get("archive-id")!, ext = structuredClone(record.get("extensions")) as Record<string, unknown>;
      if (change === "unknown-extension") ext.arbitrarySource = { future: true };
      if (change === "psd-version") ext.psdSource = { version: 2, hash: `sha256:${"a".repeat(64)}`, name: "x.psd", bytes: 26 };
      if (change === "psd-folder-field") ext.psdFolderPath = [{ id: "g", name: "x", arbitrary: true }];
      if (change === "correction-version") ext.linked3dCorrection = { version: 99 };
      if (change === "colorize-type") ext.colorizeMaskEnabled = "false";
      if (change === "too-large") ext.colorizeMask = { data: "x".repeat(17 * 1024) };
      record.set("extensions", ext);
      expect(hasValidStudioCrdtRootSchema(raw)).toBe(false);
    } finally { raw.destroy(); f.document.destroy(); }
  });
  it("일반 현재 프로그램은 v6으로 남고 v7도 taper continuation을 보존한다", () => {
    const archived = archivedStroke();
    archived.brushDynamics = normalizeStudioBrushDynamicsSettings({ depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4, seed: 43 });
    const f = persisted(archived), raw = ySnapshot(f.document);
    try {
      expect(hasValidStudioCrdtRootSchema(raw)).toBe(true);
      expect(studioCrdtStrokeToDrawElement(f.record).brushDynamics).toEqual(archived.brushDynamics);
      const normal = { ...archived, brushEnginePrograms: { version: 1 as const, material: createBrushStudioV6MaterialReceipt(createBrushStudioV6Program("mixbox-pigment-spray")) } };
      delete normal.legacyPigmentArchive;
      expect(studioDrawElementToCrdtStroke("page-1", normal).payload.version).toBe(6);
    } finally { raw.destroy(); f.document.destroy(); }
  });
  it.each([1, 2, 3, 4, 5, 6])("출처를 기존 wire v%i에 숨기거나 강등하면 웹·서버가 모두 거부한다", (version) => {
    const f = persisted(archivedStroke()), raw = ySnapshot(f.document), target = new StudioCrdtDocument();
    try {
      raw.getMap<Y.Map<unknown>>("strokes").get("archive-id")!.set("payloadVersion", version);
      expect(hasValidStudioCrdtRootSchema(raw)).toBe(false);
      target.applyUpdate(Y.encodeStateAsUpdate(raw));
      expect(target.getStroke("archive-id")).toBeNull();
      expect(() => materializeStudioAuthoringFromCrdt({ baseline: { pagesList: [f.page] }, doc: raw })).toThrow();
    } finally { raw.destroy(); target.destroy(); f.document.destroy(); }
  });
  it.each(["missing", "unknown-version", "extra-key", "visible", "ordinary-source"])("손상된 보관 봉투를 허용하거나 필드를 버리지 않는다: %s", (change) => {
    const f = persisted(archivedStroke()), raw = ySnapshot(f.document), target = new StudioCrdtDocument();
    try {
      const record = raw.getMap<Y.Map<unknown>>("strokes").get("archive-id")!, ext = structuredClone(record.get("extensions")) as Record<string, unknown>;
      if (change === "missing") delete ext.legacyPigmentArchive;
      if (change === "unknown-version") ext.legacyPigmentArchive = { ...archivedStroke().legacyPigmentArchive, version: 2 };
      if (change === "extra-key") ext.legacyPigmentArchive = { ...archivedStroke().legacyPigmentArchive, arbitrary: "x" };
      if (change === "visible") ext.hidden = false;
      if (change === "ordinary-source") ext.brushEnginePrograms = { version: 1, material: createBrushStudioV6MaterialReceipt(createBrushStudioV6Program("mixbox-pigment-spray")) };
      record.set("extensions", ext);
      expect(hasValidStudioCrdtRootSchema(raw)).toBe(false);
      target.applyUpdate(Y.encodeStateAsUpdate(raw));
      expect(target.getStroke("archive-id")).toBeNull();
    } finally { raw.destroy(); target.destroy(); f.document.destroy(); }
  });
});
