import { describe, expect, it } from "vitest";

import { serializeStudioCommandJournal } from "../studio-command-journal";
import { hashStudioEditableMesh, serializeStudioEditableMesh, type StudioMeshVec3 } from "../studio-editable-half-edge-mesh";
import type { StudioOpfsRecoveryJournalAdapter } from "../studio-opfs-recovery-journal";

import { createStudioHybridDccOpfsPorts, hybridDccRecoverFromJournal, hybridDccSetAssetToonMaterial } from "./studio-hybrid-dcc-document";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import { createStudioHybridDccDefaultToonMaterial } from "./materials/studio-hybrid-dcc-toon-material";
import {
  appendStudioSculptStrokeSample,
  cancelStudioSculptStrokeSession,
  readStudioSculptStrokePreview,
  sealStudioSculptStrokeSession,
  type StudioSculptStrokeReceipt,
} from "./studio-hybrid-dcc-sculpt-stroke-session";
import { commitStudioHybridDccSculptStroke, createStudioHybridDccSculptStrokeSession } from "./studio-hybrid-dcc-sculpt-stroke-workspace";
import { workspaceUnwrapUvActive } from "./studio-hybrid-dcc-uv-edit";
import {
  createStudioHybridDccWorkspace,
  synchronizeWorkspaceGeometryAuthority,
  workspaceAddUnitCube,
  workspaceCommitActiveObjectTransform,
  workspaceRedo,
  workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "./studio-hybrid-dcc-workfile";

const BRUSH = { kind: "grab", radius: 2, strength: .035, direction: { x: .3, y: .2, z: .1 } } satisfies Parameters<typeof createStudioHybridDccSculptStrokeSession>[1];
const POINTS: readonly StudioMeshVec3[] = [
  { x: .4, y: .3, z: .5 }, { x: .5, y: .4, z: .3 }, { x: .3, y: .5, z: .4 },
];

function fixture(documentId = "sculpt-stroke") {
  const cube = workspaceUnwrapUvActive(workspaceAddUnitCube(createStudioHybridDccWorkspace(documentId), "cube"));
  const placed = workspaceCommitActiveObjectTransform(cube, {
    revision: 1, position: [3, 4, 5], rotationEulerRad: [.1, .2, .3], scale: [2, 1, .5],
  });
  return synchronizeWorkspaceGeometryAuthority(placed, hybridDccSetAssetToonMaterial(
    placed.session, "cube", [0], createStudioHybridDccDefaultToonMaterial(),
  ));
}

function record(workspace: StudioHybridDccWorkspace) {
  const value = workspace.session.state.geometry.records.cube;
  if (!value) throw new Error("조형 회귀의 cube 정본이 없습니다.");
  return value;
}

function stroke(workspace: StudioHybridDccWorkspace) {
  const session = createStudioHybridDccSculptStrokeSession(workspace, BRUSH);
  for (const point of POINTS) {
    const step = appendStudioSculptStrokeSample(session, point);
    if (!step.ok) throw new Error(step.detail);
  }
  const preview = readStudioSculptStrokePreview(session), receipt = sealStudioSculptStrokeSession(session);
  if (!preview || !receipt) throw new Error("조형 회귀의 최종 미리보기/receipt가 없습니다.");
  return { session, preview, receipt };
}

function glb(workspace: StudioHybridDccWorkspace) {
  const current = record(workspace);
  const exported = exportStudioHybridDccMeshGlb({ mesh: current.mesh, sourceHash: current.meshHash,
    sourceRevision: current.revision, assetId: current.assetId,
  });
  if (!exported.ok) throw new Error("조형 회귀의 GLB 내보내기가 거부됐습니다.");
  return exported.bytes;
}

/** 실제 OPFS와 같은 ports를 메모리에 연결한다. 브라우저·파일시스템에는 쓰지 않는다. */
class MemoryOpfsAdapter implements StudioOpfsRecoveryJournalAdapter {
  readonly kind = "fake-opfs" as const;
  readonly files = new Map<string, Uint8Array>();
  async read(key: string) { return this.files.get(key)?.slice() ?? null; }
  async writeAtomic(key: string, bytes: Uint8Array) { this.files.set(key, bytes.slice()); }
  async remove(key: string) { this.files.delete(key); }
  async list(prefix: string) { return [...this.files.keys()].filter((key) => key.startsWith(prefix)); }
  async size(key: string) { return this.files.get(key)?.byteLength ?? null; }
  async estimateQuota() { return { usage: [...this.files.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0), quota: 100_000_000 }; }
  async withExclusiveLock<T>(_key: string, _signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> { return operation(); }
}

describe("조형 gesture 최종 workspace 반영", () => {
  it("여러 sample은 원본·저널을 유지하고 최종 geometry/bridge 한 번·undo 한 번으로 확정된다", () => {
    const original = fixture(), beforeMesh = serializeStudioEditableMesh(record(original).mesh);
    const beforeState = original.session.state, beforeJournal = serializeStudioCommandJournal(original.session.journal);
    const beforeUndo = original.session.undoStack, beforeBridge = original.bridge, beforeBom = original.bom;
    const { preview, receipt } = stroke(original);
    expect(original.session.state).toBe(beforeState); expect(original.session.undoStack).toBe(beforeUndo);
    expect(original.bridge).toBe(beforeBridge); expect(original.bom).toBe(beforeBom);
    expect(serializeStudioCommandJournal(original.session.journal)).toBe(beforeJournal);
    expect(serializeStudioEditableMesh(record(original).mesh)).toEqual(beforeMesh);
    const next = commitStudioHybridDccSculptStroke(original, receipt);
    expect(record(next).mesh).toBe(preview.mesh); expect(record(next).meshHash).toBe(preview.meshHash);
    expect(record(next).revision).toBe(record(original).revision + 1);
    expect(next.session.state.commandCount).toBe(original.session.state.commandCount + 1);
    expect(next.session.undoStack).toHaveLength(beforeUndo.length + 1);
    expect(next.bridge.commandSequence).toBe(beforeBridge.commandSequence + 1);
    expect(next.bridge.set.objects.find(({ id }) => id === "cube")?.geometryHash).toBe(preview.meshHash);
    expect(next.session.state.objectTransforms).toEqual(original.session.state.objectTransforms);
    expect(next.session.state.materials).toEqual(original.session.state.materials);
    expect(record(next).mesh.uvLayer).toBeDefined();
    const undone = workspaceUndo(next), redone = workspaceRedo(undone);
    expect(serializeStudioEditableMesh(record(undone).mesh)).toEqual(beforeMesh);
    expect(serializeStudioEditableMesh(record(redone).mesh)).toEqual(serializeStudioEditableMesh(preview.mesh));
    expect(redone.session.state.stateHash).toBe(next.session.state.stateHash);
    expect(serializeStudioCommandJournal(original.session.journal)).toBe(beforeJournal);
    expect(original.session.state).toBe(beforeState);
    expect(() => commitStudioHybridDccSculptStroke(original, receipt)).toThrow(/사용된/u);
  });

  it(".toon3d 재진입·undo/redo 및 GLB는 마지막 candidate와 같은 정본 메시를 사용한다", () => {
    const original = fixture(), { preview, receipt } = stroke(original);
    const next = commitStudioHybridDccSculptStroke(original, receipt);
    const file = encodeStudioHybridDccWorkfile(next), beforeFile = file.slice();
    const reopened = decodeStudioHybridDccWorkfile(file, { documentId: "sculpt-stroke-opened" });
    expect(file).toEqual(beforeFile);
    expect(serializeStudioEditableMesh(record(reopened).mesh)).toEqual(serializeStudioEditableMesh(preview.mesh));
    expect(record(reopened).meshHash).toBe(hashStudioEditableMesh(preview.mesh));
    expect(reopened.session.state.materials).toEqual(next.session.state.materials);
    expect(serializeStudioEditableMesh(record(workspaceUndo(reopened)).mesh)).toEqual(serializeStudioEditableMesh(record(original).mesh));
    expect(serializeStudioEditableMesh(record(workspaceRedo(workspaceUndo(reopened))).mesh)).toEqual(serializeStudioEditableMesh(preview.mesh));
    expect(glb(reopened)).toEqual(glb(next)); expect(glb(next)).not.toEqual(glb(original));
  });

  it("미리보기/확정 자체는 OPFS에 쓰지 않고 명시 checkpoint가 최종 geometry·UV·재질을 복원한다", async () => {
    const original = fixture("sculpt-opfs"), adapter = new MemoryOpfsAdapter();
    const ports = createStudioHybridDccOpfsPorts({ adapter, documentId: original.session.state.documentId,
      now: () => 1_000, randomToken: () => "sculpt-checkpoint",
    });
    const { preview, receipt } = stroke(original);
    expect(adapter.files.size).toBe(0);
    const next = commitStudioHybridDccSculptStroke(original, receipt);
    expect(adapter.files.size).toBe(0);
    const recovered = await hybridDccRecoverFromJournal(next.session, ports);
    expect(recovered.checkpointFound).toBe(true); expect(recovered.meshHashesEqual).toBe(true);
    const restored = synchronizeWorkspaceGeometryAuthority(next, recovered.session);
    expect(serializeStudioEditableMesh(record(restored).mesh)).toEqual(serializeStudioEditableMesh(preview.mesh));
    expect(restored.session.state.materials).toEqual(next.session.state.materials);
    expect(glb(restored)).toEqual(glb(next));
    expect(record(original).meshHash).not.toBe(record(restored).meshHash);
  });

  it.each(["빈 gesture", "강도 0", "mask 0", "취소", "잘못된 sample"])("%s은 원본 workspace·저널·undo를 그대로 둔다", (kind) => {
    const original = fixture(), state = original.session.state, journal = serializeStudioCommandJournal(original.session.journal);
    const undo = original.session.undoStack, bridge = original.bridge;
    const session = createStudioHybridDccSculptStrokeSession(original, { ...BRUSH, strength: kind === "강도 0" ? 0 : BRUSH.strength },
      kind === "mask 0" ? new Float32Array(record(original).mesh.vertices.length) : undefined);
    if (kind !== "빈 gesture") {
      const first = POINTS.at(0);
      if (!first) throw new Error("조형 회귀의 시작점이 없습니다.");
      expect(appendStudioSculptStrokeSample(session, first).ok).toBe(true);
    }
    if (kind === "취소") cancelStudioSculptStrokeSession(session);
    if (kind === "잘못된 sample") expect(appendStudioSculptStrokeSample(session, { x: Infinity, y: 0, z: 0 }).ok).toBe(false);
    const receipt = sealStudioSculptStrokeSession(session);
    expect(receipt).toBeNull(); expect(commitStudioHybridDccSculptStroke(original, receipt)).toBe(original);
    expect(original.session.state).toBe(state); expect(original.session.undoStack).toBe(undo); expect(original.bridge).toBe(bridge);
    expect(serializeStudioCommandJournal(original.session.journal)).toBe(journal);
  });

  it("다른 workspace identity·document scope·선택·같은 mesh의 새 문서 상태를 거부한다", () => {
    const cases: readonly ((workspace: StudioHybridDccWorkspace) => StudioHybridDccWorkspace)[] = [
      (workspace) => ({ ...workspace }),
      (workspace) => ({ ...workspace, session: { ...workspace.session, state: { ...workspace.session.state, documentId: "other" } } }),
      (workspace) => { workspace.activeAssetId = null; return workspace; },
      (workspace) => { workspace.session = { ...workspace.session, state: { ...workspace.session.state } }; return workspace; },
      (workspace) => { const current = record(workspace); workspace.session = { ...workspace.session, state: { ...workspace.session.state,
        geometry: { ...workspace.session.state.geometry, records: { ...workspace.session.state.geometry.records, cube: { ...current, revision: current.revision + 1 } } },
      } }; return workspace; },
    ];
    for (const change of cases) {
      const original = fixture(), originalState = original.session.state, before = serializeStudioCommandJournal(original.session.journal);
      const { receipt } = stroke(original), changed = change(original), changedState = changed.session.state;
      expect(() => commitStudioHybridDccSculptStroke(changed, receipt)).toThrow(/선택|버전|오브젝트/u);
      expect(changed.session.state).toBe(changedState);
      expect(serializeStudioCommandJournal(changed.session.journal)).toBe(before);
      expect(originalState.commandCount).toBe(changed.session.state.commandCount);
      expect(() => commitStudioHybridDccSculptStroke(original, receipt)).toThrow(/사용된/u);
    }
  });

  it("발급 receipt 복사·seal 뒤 cancel·stale source hash는 문서를 바꾸지 않는다", () => {
    const original = fixture(), before = original.session.state, journal = serializeStudioCommandJournal(original.session.journal);
    const { session, receipt } = stroke(original);
    const copied: StudioSculptStrokeReceipt = { ...receipt };
    expect(() => commitStudioHybridDccSculptStroke(original, copied)).toThrow(/발급/u);
    cancelStudioSculptStrokeSession(session);
    expect(() => commitStudioHybridDccSculptStroke(original, receipt)).toThrow(/취소/u);
    const corrupt = { ...original, session: { ...original.session, state: { ...original.session.state,
      geometry: { ...original.session.state.geometry, records: { ...original.session.state.geometry.records, cube: { ...record(original), meshHash: "stale" } } },
    } } };
    expect(() => createStudioHybridDccSculptStrokeSession(corrupt, BRUSH)).toThrow(/해시/u);
    expect(original.session.state).toBe(before); expect(serializeStudioCommandJournal(original.session.journal)).toBe(journal);
  });
});
