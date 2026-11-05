import { materializeStudioAuthoringFromCrdt } from "@toonstudio/contracts/studio-crdt-authoring";
import { STUDIO_LEGACY_PIGMENT_ARCHIVE_ELEMENT_EXTENSION_KEYS, STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY as CAP } from "@toonstudio/contracts/studio-legacy-pigment-archive";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { resolveCreatorCollaborationAccess } from "../../../../../../apps/api/src/modules/creator/creator-collaboration.policy";
import { hasValidStudioCrdtRootSchema } from "../../../../../../apps/api/src/modules/creator/studio-crdt-root-schema";
import { StudioCrdtService, StudioCrdtInvalidPayloadError } from "../../../../../../apps/api/src/modules/creator/studio-crdt.service";
import { assertStudioLegacyPigmentArchiveRestDocumentInTransaction } from "../../../../../../apps/api/src/modules/creator/studio-legacy-pigment-archive-rest-gate";
import { planLegacyPigmentStrokeCopies } from "../../../../../../apps/web/src/domains/creator/brush/studio-legacy-pigment-stroke-migration";
import { createBrushStudioV6Program } from "../../../../../../apps/web/src/domains/creator/brush-lab/brush-studio-v6-engine";
import { StudioCrdtDocument } from "../../../../../../apps/web/src/domains/creator/live/studio-crdt-document";
import { studioDrawElementToCrdtStroke, studioLayerGroupToCrdtGroup, studioPageToCrdtPage } from "../../../../../../apps/web/src/domains/creator/live/studio-crdt-page-bridge";

import { MemoryStudioCrdtRepository, MemoryStudioCrdtClusterLoadRepository, allowStoredRasterAssetReferences,
  allowStoredWorkAssetReferences } from "./studio-crdt.service.test-support";

import type { AppendStudioCrdtUpdateInput, ValidateStudioCrdtAppend, DrizzleStudioCrdtTransaction  } from "../../../../../../apps/api/src/modules/creator/studio-crdt.repository";
import type { StudioScopedAuthorization } from "../../../../../../apps/api/src/modules/creator/studio-scoped-write-store";
import type { DrawEl } from "../../../../../../apps/web/src/domains/creator/studio-element-model";


const durable = vi.hoisted(() => ({ snapshot: null as Uint8Array | null }));
vi.mock("../../../../../../apps/api/src/modules/creator/studio-crdt.repository", async (original) => ({
  ...await original<typeof import("../../../../../../apps/api/src/modules/creator/studio-crdt.repository")>(),
  loadStudioCrdtDocumentInTransaction: vi.fn(async () => ({ snapshot: durable.snapshot
    ? { workId: "work", snapshot: durable.snapshot, compactedSequence: 1n, updatedAt: new Date("2026-11-05T00:00:00.000Z") } : null, updates: [] })),
}));
const services: StudioCrdtService[] = [];
const documents: Y.Doc[] = [];
afterEach(() => { services.splice(0).forEach((service) => service.onModuleDestroy()); documents.splice(0).forEach((doc) => doc.destroy()); durable.snapshot = null; });

function fixture(sparse = false, retainLayerMetadata = false) {
  const program = createBrushStudioV6Program("mixbox-pigment-spray");
  const metadata: Pick<DrawEl, "psdGroupId" | "psdRasterSourceId" | "psdSource" | "psdFolderPath" | "colorizeMask" | "colorizeMaskEnabled" | "linked3dCorrection" | "sketch"> = {
    sketch: { enabled: true, roughness: 2, bowing: 1.5, fillStyle: "cross-hatch" },
    psdGroupId: "psd-folder", psdRasterSourceId: "original-raster",
    psdSource: { version: 1, hash: `sha256:${"a".repeat(64)}`, name: "original.psd", bytes: 100 },
    psdFolderPath: [{ id: "psd-folder", name: "원본 폴더" }],
    colorizeMask: { hints: [{ id: "hint", colorHex: "#ffff00", points: [{ x: 1, y: 2 }], radiusPx: 3 }],
      params: { gapCloseHintPx: 8, edgeDetectionPx: 0, cleanupPercent: 30, limitToLayerBounds: true }, bakedRevision: null },
    colorizeMaskEnabled: false,
    linked3dCorrection: { kind: "toonstudio.linked-3d-correction", version: 1, bundleId: "source-bundle", pass: "line", sourcePassRevision: 1,
      sourceHash: `sha256:${"a".repeat(64)}`, baseGeometryHash: `sha256:${"b".repeat(64)}`, topologyHash: `sha256:${"c".repeat(64)}`,
      objectIdentityHash: `sha256:${"d".repeat(64)}`, basePassRootHash: `sha256:${"e".repeat(64)}` },
  };
  const source: DrawEl = { id: "source", type: "draw", name: "원본", points: [1, 2, 3, 4],
    ...(sparse ? {} : { kind: "freehand", mode: "pen", pressures: [0.4, 0.7], tiltXs: [0, 0], tiltYs: [0, 0], twists: [0, 0], speeds: [0, 0], tangentialPressures: [0, 0] }),
    ...(retainLayerMetadata ? metadata : {}),
    stroke: "#ffff00", strokeWidth: 20,
    brushEnginePrograms: { version: 1, material: { version: 1, seed: program.seed, slots: program.slots, tuning: program.tuning, input: program.input } } };
  let sequence = 0;
  const plan = planLegacyPigmentStrokeCopies([source], [], () => `archive-${++sequence}`);
  const page = { id: "page", bg: "#ffffff", bgGrad: null, canvasH: 1080 };
  const before = { pagesList: [{ ...page, elements: [source], groups: [] }] };
  const after = { pagesList: [{ ...page, elements: plan.elements, groups: plan.groups }] };
  const local = new StudioCrdtDocument();
  local.addPage(studioPageToCrdtPage(page));
  for (const group of plan.groups) local.addLayerGroup(studioLayerGroupToCrdtGroup(page.id, group));
  for (const element of plan.elements) {
    if (element.type !== "draw") throw new Error("검증 획이 없습니다.");
    local.addStroke(studioDrawElementToCrdtStroke(page.id, element));
  }
  documents.push(local.doc);
  return { source, before, after, plan, local };
}
class LockedBaselineRepository extends MemoryStudioCrdtRepository {
  baseline: unknown;
  override appendUpdate(input: AppendStudioCrdtUpdateInput, validate: ValidateStudioCrdtAppend) {
    return super.appendUpdate(input, (current, transaction) => {
      const authorization: StudioScopedAuthorization = {
        work: { workId: input.workId, actorUserId: input.actorUserId, revision: 1, document: this.baseline,
          work: { id: input.workId, userId: input.actorUserId }, now: "2026-11-05T00:00:00.000Z",
          access: resolveCreatorCollaborationAccess({ actorUserId: input.actorUserId, ownerUserId: input.actorUserId }) },
        policy: { policyVersion: 0, targets: [], grants: [], ownership: {} }, targets: [], grants: [], context: null,
      };
      return validate(current, transaction, authorization);
    });
  }
}
function harness(baseline: unknown) {
  const repository = new LockedBaselineRepository(); repository.baseline = baseline;
  const service = new StudioCrdtService(repository, allowStoredRasterAssetReferences, allowStoredWorkAssetReferences, new MemoryStudioCrdtClusterLoadRepository());
  services.push(service); return { service, repository };
}
const update = (id: number, data: Uint8Array, readerCapabilities: readonly string[] = [CAP]) => ({
  workId: "work", actorUserId: "owner", updateId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(id).padStart(12, "0")}`, data, readerCapabilities,
});

describe("이전 혼색 원본의 실제 Y·서버 append 보존", () => {
  it("실제 UI planner 결과가 wire v7과 서버 admission·영속 로그를 통과하고 복원 원본을 유지한다", async () => {
    const f = fixture(), h = harness(f.before);
    expect(f.local.getStroke(f.plan.archiveIds[0]!)?.payload.version).toBe(7);
    expect(hasValidStudioCrdtRootSchema(f.local.doc)).toBe(true);
    const data = f.local.encodeStateAsUpdate();
    await expect(h.service.applyUpdateBytes(update(1, data, []))).rejects.toMatchObject({
      name: "StudioBg3dReaderUpgradeRequiredError", requiredReaderCapabilities: [CAP],
    });
    expect(h.repository.receipts.size).toBe(0); expect(h.repository.updates.size).toBe(0);
    expect(h.repository.nextSequence).toBe(1n);
    await expect(h.service.applyUpdateBytes(update(1, data))).resolves.toMatchObject({
      duplicate: false, serverSequence: "1", requiredReaderCapabilities: [CAP],
    });
    const stored = new Y.Doc(); documents.push(stored);
    for (const row of h.repository.updates.get("work") ?? []) Y.applyUpdate(stored, row.payload);
    const persisted = materializeStudioAuthoringFromCrdt({ baseline: f.before, doc: stored });
    // 그룹 접힘은 기존 협업 계약에서도 로컬 UI 상태다. 복원 대상 획 본문은 모두 exact 비교한다.
    expect(JSON.parse(JSON.stringify(persisted))).toEqual({ pagesList: [{ ...f.after.pagesList[0],
      groups: f.plan.groups.map(({ collapsed: _collapsed, ...group }) => group) }] });
    expect(h.repository.receipts.size).toBe(1);
  });
  it("같은 append transaction에서 얻은 baseline-only 보관 원본의 구 v6 필드 제거를 거절한다", async () => {
    const f = fixture(), h = harness(f.before), incoming = new Y.Doc(); documents.push(incoming);
    Y.applyUpdate(incoming, f.local.encodeStateAsUpdate());
    const archive = incoming.getMap<Y.Map<unknown>>("strokes").get(f.plan.archiveIds[0]!)!;
    const extensions = { ...archive.get("extensions") as Record<string, unknown> }; delete extensions.legacyPigmentArchive;
    archive.set("extensions", extensions); archive.set("payloadVersion", 6);
    expect(hasValidStudioCrdtRootSchema(incoming)).toBe(true);
    h.repository.beforeAppend = async () => { h.repository.baseline = f.after; };
    await expect(h.service.applyUpdateBytes(update(2, Y.encodeStateAsUpdate(incoming)))).rejects.toBeInstanceOf(StudioCrdtInvalidPayloadError);
    expect(h.repository.receipts.size).toBe(0); expect(h.repository.updates.size).toBe(0);
  });
  it("보관 원본의 후속 출처 변조는 유효한 JSON·wire여도 영속하지 않는다", async () => {
    const f = fixture(), h = harness(f.before);
    await h.service.applyUpdateBytes(update(3, f.local.encodeStateAsUpdate()));
    const baseline = f.local.encodeStateVector();
    const archive = f.local.doc.getMap<Y.Map<unknown>>("strokes").get(f.plan.archiveIds[0]!)!;
    const extensions = structuredClone(archive.get("extensions") as Record<string, unknown>);
    Object.assign(extensions.legacyPigmentArchive as Record<string, unknown>, { sourceIndex: 2 }); archive.set("extensions", extensions);
    expect(hasValidStudioCrdtRootSchema(f.local.doc)).toBe(true);
    await expect(h.service.applyUpdateBytes(update(4, f.local.encodeStateAsUpdate(baseline)))).rejects.toBeInstanceOf(StudioCrdtInvalidPayloadError);
    expect(h.repository.receipts.size).toBe(1); expect(h.repository.updates.get("work")).toHaveLength(1);
  });
  it("정확한 undo 이후에도 raw 보관 원본은 유지하며 후속 활성 획 편집을 허용한다", async () => {
    const f = fixture(), h = harness(f.before);
    await h.service.applyUpdateBytes(update(5, f.local.encodeStateAsUpdate()));
    h.repository.baseline = f.after;
    const beforeUndo = f.local.encodeStateVector();
    f.local.deleteStroke(f.plan.archiveIds[0]!);
    f.local.upsertStroke(studioDrawElementToCrdtStroke("page", f.source));
    f.local.deleteLayerGroup("page", f.plan.groups[0]!.id);
    await expect(h.service.applyUpdateBytes(update(6, f.local.encodeStateAsUpdate(beforeUndo)))).resolves.toMatchObject({ duplicate: false });
    const beforeEdit = f.local.encodeStateVector();
    f.local.upsertStroke(studioDrawElementToCrdtStroke("page", { ...f.source, name: "undo 후 수정" }));
    await expect(h.service.applyUpdateBytes(update(7, f.local.encodeStateAsUpdate(beforeEdit)))).resolves.toMatchObject({ duplicate: false });
    expect(h.repository.receipts.size).toBe(3);
  });
  it("REST도 잠근 baseline과 최신 durable Y를 함께 사용해 아직 baseline에 없는 원본 strip을 거절한다", async () => {
    const f = fixture(); durable.snapshot = f.local.encodeStateAsUpdate();
    const stripped = structuredClone(f.after);
    Reflect.deleteProperty(stripped.pagesList[0]!.elements[0]!, "legacyPigmentArchive");
    const transaction = {} as DrizzleStudioCrdtTransaction;
    await expect(assertStudioLegacyPigmentArchiveRestDocumentInTransaction(transaction, "work", stripped, f.before, [CAP])).rejects.toThrow(/복원 정보/u);
  });
  it("REST 신규 보관 자료가 실제 최신 팀 원본과 다르면 오래된 baseline을 근거로 승인하지 않는다", async () => {
    const f = fixture(), latest = new StudioCrdtDocument(); documents.push(latest.doc);
    latest.addPage(studioPageToCrdtPage(f.before.pagesList[0]!));
    latest.addStroke(studioDrawElementToCrdtStroke("page", { ...f.source, name: "먼저 저장한 팀 수정" }));
    durable.snapshot = latest.encodeStateAsUpdate();
    await expect(assertStudioLegacyPigmentArchiveRestDocumentInTransaction({} as DrizzleStudioCrdtTransaction, "work", f.after, f.before, [CAP])).rejects.toThrow(/원본과 일치/u);
  });
  it("sparse 원문의 실제 v6 게시 뒤 v7 보관·원본 undo까지 기본 채널 생성과 원문 보존을 구분한다", async () => {
    const f = fixture(true), h = harness(f.before), local = new StudioCrdtDocument(); documents.push(local.doc);
    local.addPage(studioPageToCrdtPage(f.before.pagesList[0]!));
    local.addStroke(studioDrawElementToCrdtStroke("page", f.source));
    await h.service.applyUpdateBytes(update(10, local.encodeStateAsUpdate()));
    const beforeMigration = local.encodeStateVector();
    local.addLayerGroup(studioLayerGroupToCrdtGroup("page", f.plan.groups[0]!));
    const archive = f.plan.elements[0], copy = f.plan.elements[1];
    if (archive?.type !== "draw" || copy?.type !== "draw") throw new Error("보관 획이 없습니다.");
    local.upsertStroke(studioDrawElementToCrdtStroke("page", copy));
    local.upsertStroke(studioDrawElementToCrdtStroke("page", archive), { beforeStrokeId: copy.id });
    await expect(h.service.applyUpdateBytes(update(11, local.encodeStateAsUpdate(beforeMigration)))).resolves.toMatchObject({ duplicate: false });
    const persisted = materializeStudioAuthoringFromCrdt({ baseline: f.before, doc: local.doc });
    expect(JSON.parse(JSON.stringify((persisted as typeof f.after).pagesList[0]!.elements[0]))).toEqual(archive);
    h.repository.baseline = f.after;
    const beforeUndo = local.encodeStateVector(); local.deleteStroke(archive.id);
    local.upsertStroke(studioDrawElementToCrdtStroke("page", f.source)); local.deleteLayerGroup("page", f.plan.groups[0]!.id);
    await expect(h.service.applyUpdateBytes(update(12, local.encodeStateAsUpdate(beforeUndo)))).resolves.toMatchObject({ duplicate: false });
    expect(h.repository.receipts.size).toBe(3);
  });
  it("PSD·채색 마스크·연결 3D의 기존 7개 필드를 v7 원본에 exact 보관한다", async () => {
    const f = fixture(false, true), h = harness(f.before);
    expect(hasValidStudioCrdtRootSchema(f.local.doc)).toBe(true);
    await expect(h.service.applyUpdateBytes(update(20, f.local.encodeStateAsUpdate()))).resolves.toMatchObject({ duplicate: false });
    const restored = materializeStudioAuthoringFromCrdt({ baseline: f.before, doc: f.local.doc }) as typeof f.after;
    expect(JSON.parse(JSON.stringify(restored.pagesList[0]!.elements[0]))).toEqual(f.plan.elements[0]);
    expect(restored.pagesList[0]!.elements[0]).toMatchObject({ psdSource: f.source.psdSource, colorizeMask: f.source.colorizeMask,
      colorizeMaskEnabled: false, linked3dCorrection: f.source.linked3dCorrection });
    expect(f.local.getStroke(f.source.id)?.payload.version).toBe(7);
    expect(restored.pagesList[0]!.elements[1]).toMatchObject({ psdSource: f.source.psdSource, colorizeMask: f.source.colorizeMask,
      colorizeMaskEnabled: false, linked3dCorrection: f.source.linked3dCorrection });
  });
  it("기존 v6가 7개 필드를 생략한 원고도 권위 baseline을 확인해 원본과 활성 v7 사본에 보존한다", async () => {
    const f = fixture(false, true), h = harness(f.before), local = new StudioCrdtDocument(); documents.push(local.doc);
    local.addPage(studioPageToCrdtPage(f.before.pagesList[0]!));
    const old = studioDrawElementToCrdtStroke("page", f.source);
    const extensions = { ...old.payload.extensions };
    for (const key of STUDIO_LEGACY_PIGMENT_ARCHIVE_ELEMENT_EXTENSION_KEYS) delete extensions[key];
    local.addStroke({ ...old, payload: { ...old.payload, version: 6, extensions } });
    await h.service.applyUpdateBytes(update(21, local.encodeStateAsUpdate()));
    const beforeMigration = local.encodeStateVector();
    local.addLayerGroup(studioLayerGroupToCrdtGroup("page", f.plan.groups[0]!));
    const archive = f.plan.elements[0], copy = f.plan.elements[1];
    if (archive?.type !== "draw" || copy?.type !== "draw") throw new Error("보관 획이 없습니다.");
    local.upsertStroke(studioDrawElementToCrdtStroke("page", copy));
    local.upsertStroke(studioDrawElementToCrdtStroke("page", archive), { beforeStrokeId: copy.id });
    await expect(h.service.applyUpdateBytes(update(22, local.encodeStateAsUpdate(beforeMigration)))).resolves.toMatchObject({ duplicate: false });
    const restored = materializeStudioAuthoringFromCrdt({ baseline: f.before, doc: local.doc }) as typeof f.after;
    expect(JSON.parse(JSON.stringify(restored.pagesList[0]!.elements[0]))).toEqual(archive);
    expect(restored.pagesList[0]!.elements[1]).toMatchObject({ psdSource: f.source.psdSource, colorizeMask: f.source.colorizeMask,
      colorizeMaskEnabled: false, linked3dCorrection: f.source.linked3dCorrection });
  });
  it("REST의 구 reader는 전체 archive ID 누락도 거절하고 지원 reader의 명시 삭제는 허용한다", async () => {
    const f = fixture(); durable.snapshot = f.local.encodeStateAsUpdate();
    const removed = { pagesList: [{ ...f.before.pagesList[0], elements: [f.plan.elements[1]], groups: [] }] };
    const transaction = {} as DrizzleStudioCrdtTransaction;
    await expect(assertStudioLegacyPigmentArchiveRestDocumentInTransaction(transaction, "work", removed, f.before, []))
      .rejects.toMatchObject({ response: { code: "studio_legacy_pigment_archive_reader_upgrade_required" } });
    await expect(assertStudioLegacyPigmentArchiveRestDocumentInTransaction(transaction, "work", removed, f.before, [CAP])).resolves.toBeUndefined();
  });
  it("같은 작품의 서버 revision 명시 복원은 reader를 확인한 뒤 이전 snapshot 전체를 허용한다", async () => {
    const f = fixture(); durable.snapshot = f.local.encodeStateAsUpdate();
    const historical = structuredClone(f.before); historical.pagesList[0]!.elements[0]!.name = "더 이전 서버 snapshot";
    const transaction = {} as DrizzleStudioCrdtTransaction;
    await expect(assertStudioLegacyPigmentArchiveRestDocumentInTransaction(transaction, "work", historical, f.after, [], true))
      .rejects.toMatchObject({ response: { code: "studio_legacy_pigment_archive_reader_upgrade_required" } });
    await expect(assertStudioLegacyPigmentArchiveRestDocumentInTransaction(transaction, "work", historical, f.after, [CAP], true)).resolves.toBeUndefined();
  });
  it("기존 그룹 삭제에 따른 archive 소속 해제와 원소 자체 삭제를 기존 append 권한 아래 허용한다", async () => {
    const f = fixture(), h = harness(f.before);
    await h.service.applyUpdateBytes(update(30, f.local.encodeStateAsUpdate())); h.repository.baseline = f.after;
    const archive = f.plan.elements[0]; if (archive?.type !== "draw") throw new Error("보관 원본이 없습니다.");
    const detached = { ...archive }; delete detached.groupId;
    const beforeDetach = f.local.encodeStateVector();
    f.local.upsertStroke(studioDrawElementToCrdtStroke("page", detached)); f.local.deleteLayerGroup("page", f.plan.groups[0]!.id);
    await expect(h.service.applyUpdateBytes(update(31, f.local.encodeStateAsUpdate(beforeDetach)))).resolves.toMatchObject({ duplicate: false });
    const beforeDelete = f.local.encodeStateVector(); f.local.deleteStroke(archive.id);
    await expect(h.service.applyUpdateBytes(update(32, f.local.encodeStateAsUpdate(beforeDelete)))).resolves.toMatchObject({ duplicate: false });
    expect(h.repository.receipts.size).toBe(3);
  });
  it("외부 파일로 저장된 archive baseline을 첫 Y 초기화에서 새 source 이주로 오인하지 않는다", async () => {
    const f = fixture(true, true), h = harness(f.after);
    await expect(h.service.applyUpdateBytes(update(40, f.local.encodeStateAsUpdate()))).resolves.toMatchObject({ duplicate: false });
    expect(h.repository.receipts.size).toBe(1);
  });
});
