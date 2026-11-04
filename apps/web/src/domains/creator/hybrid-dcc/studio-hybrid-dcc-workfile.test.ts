import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalStudioCommandJson, serializeStudioCommandJournal } from "../studio-command-journal";

import { createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { workspaceTransformComponents } from "./studio-hybrid-dcc-component-transform";
import { createStudioHybridDccOpfsPorts, hybridDccRecoverFromJournal, restoreStudioHybridDccStateFromSnapshot } from "./studio-hybrid-dcc-document";
import { workspaceAddActiveModifier, workspacePatchActiveModifier, workspaceRefreshModifierPreviews, workspaceUndoWithModifierPreviews } from "./studio-hybrid-dcc-modifier-workspace";
import {
  createStudioHybridDccWorkspace,
  synchronizeWorkspaceGeometryAuthority,
  workspaceAddUnitCube,
  workspaceCommitActiveObjectTransform,
  workspaceComponentSelectionSource,
  workspaceRedo,
  workspaceUndo,
  workspaceUvUnwrapActive,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import { encodeStudioHybridDccWorkspacePersistenceEnvelope } from "./studio-hybrid-dcc-workspace-persistence";
import {
  decodeStudioHybridDccWorkfile,
  encodeStudioHybridDccWorkfile,
  STUDIO_HYBRID_DCC_WORKFILE_FORMAT,
  STUDIO_HYBRID_DCC_WORKFILE_MAX_BYTES,
  StudioHybridDccWorkfileError,
  type StudioHybridDccWorkfileErrorCode,
} from "./studio-hybrid-dcc-workfile";

import type { StudioOpfsRecoveryJournalAdapter } from "../studio-opfs-recovery-journal";

const PORTABLE_SCOPE = { userId: "portable-toon3d", workId: "portable-workspace-v1" };
const encoder = new TextEncoder();

function cube(documentId = "source-workfile") {
  return workspaceAddUnitCube(createStudioHybridDccWorkspace(documentId), "cube");
}

function translate(workspace: StudioHybridDccWorkspace, x: number) {
  const source = workspaceComponentSelectionSource(workspace)!;
  const selection = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "vertex", operation: "replace", ids: source.mesh.vertices.map(({ id }) => id), source,
  });
  if (!selection.ok) throw new Error("테스트 정점 선택에 실패했습니다.");
  return workspaceTransformComponents(workspace, selection.value, {
    kind: "translate", value: { x, y: 0, z: 0 },
  }).workspace;
}

async function fixture() {
  let workspace = translate(cube(), 2);
  workspace = workspaceCommitActiveObjectTransform(workspace, {
    revision: 1, position: [3, 4, 5], rotationEulerRad: [0.1, 0.2, 0.3], scale: [2, 1, 0.5],
  });
  workspace = workspaceUvUnwrapActive(workspace, "box");
  workspace = await workspaceAddActiveModifier(workspace, "array");
  workspace = await workspacePatchActiveModifier(workspace, workspace.session.state.geometry.records.cube!.modifierStack.modifiers[0]!.id, {
    useConstantOffset: false, useRelativeOffset: true, relativeOffset: { x: 1.5, y: 0, z: 0 },
  });
  workspace = await workspaceUndoWithModifierPreviews(workspace);
  return workspace;
}

function parsed(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(canonicalStudioCommandJson(value, STUDIO_HYBRID_DCC_WORKFILE_MAX_BYTES));
}

/** 내부 checksum까지 정상인 잘못된 데이터를 만들어 정밀 decoder와 이력 검증을 직접 통과시킨다. */
function fileFor(workspace: StudioHybridDccWorkspace, scope = PORTABLE_SCOPE): Uint8Array {
  const persistence = encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace, scope, savedAt: 0 });
  return jsonBytes({
    format: STUDIO_HYBRID_DCC_WORKFILE_FORMAT, version: 1,
    workspaceByteLength: persistence.bytes.byteLength,
    workspaceHash: `sha256:${createHash("sha256").update(persistence.bytes).digest("hex")}`,
    workspace: persistence.envelope,
  });
}

function expectCode(operation: () => unknown, code: StudioHybridDccWorkfileErrorCode): void {
  let error: unknown;
  try { operation(); } catch (cause) { error = cause; }
  expect(error).toBeInstanceOf(StudioHybridDccWorkfileError);
  expect(error).toMatchObject({ code });
}

class FakeOpfsAdapter implements StudioOpfsRecoveryJournalAdapter {
  readonly kind = "fake-opfs" as const;
  readonly files = new Map<string, Uint8Array>();
  async read(path: string) { return this.files.get(path)?.slice() ?? null; }
  async writeAtomic(path: string, bytes: Uint8Array) { this.files.set(path, bytes.slice()); }
  async remove(path: string) { this.files.delete(path); }
  async list(prefix: string) { return [...this.files.keys()].filter((path) => path.startsWith(prefix)); }
  async size(path: string) { return this.files.get(path)?.byteLength ?? null; }
  async estimateQuota() { return { usage: [...this.files.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0), quota: 100_000_000 }; }
  async withExclusiveLock<T>(_name: string, _signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> { return operation(); }
}

describe("native .toon3d 작업파일", () => {
  it("원본과 undo/redo 이력을 바꾸지 않고 결정적인 portable 바이트를 만든다", async () => {
    const workspace = await fixture();
    const state = JSON.stringify(workspace.session.state);
    const journal = serializeStudioCommandJournal(workspace.session.journal);
    const statistics = workspace.session.journal.verificationStats;
    const cache = workspace.session.state.geometry.records.cube!.renderCache;
    const bytes = encodeStudioHybridDccWorkfile(workspace);
    expect(encodeStudioHybridDccWorkfile(workspace)).toEqual(bytes);
    expect(JSON.stringify(workspace.session.state)).toBe(state);
    expect(serializeStudioCommandJournal(workspace.session.journal)).toBe(journal);
    expect(workspace.session.journal.verificationStats).toEqual(statistics);
    expect(workspace.session.state.geometry.records.cube!.renderCache).toBe(cache);
    expect(parsed(bytes).format).toBe(STUDIO_HYBRID_DCC_WORKFILE_FORMAT);
  });

  it("다른 문서 ID로 현재·undo·redo·BOM을 재결합하고 실제 좌표와 옵션을 되돌리고 다시 실행한다", async () => {
    const original = await fixture();
    const bytes = encodeStudioHybridDccWorkfile(original);
    const beforeBytes = bytes.slice();
    const imported = decodeStudioHybridDccWorkfile(bytes, { documentId: "current-workspace" });
    expect(bytes).toEqual(beforeBytes);
    expect(imported.session.state.documentId).toBe("current-workspace");
    expect(imported.bom.documentId).toBe("current-workspace");
    expect(imported.session.state.stateHash).not.toBe(original.session.state.stateHash);
    expect(imported.session.state.geometry.records.cube!.meshHash).toBe(original.session.state.geometry.records.cube!.meshHash);
    expect(imported.session.state.objectTransforms).toEqual(original.session.state.objectTransforms);
    expect(imported.lastUvMap).toEqual(original.lastUvMap);
    for (const snapshot of [...imported.session.undoStack, ...imported.session.redoStack]) {
      expect(snapshot.documentId).toBe("current-workspace");
      expect(restoreStudioHybridDccStateFromSnapshot(snapshot).stateHash).toBe(snapshot.stateHash);
    }
    expect(serializeStudioCommandJournal(imported.session.journal)).toBe(serializeStudioCommandJournal(original.session.journal));
    expect(imported.session.journal).not.toBe(original.session.journal);
    const redone = workspaceRedo(imported);
    expect(redone.session.state.documentId).toBe("current-workspace");
    expect(redone.session.state.geometry.records.cube!.modifierStack.modifiers[0]).toMatchObject({
      kind: "array", useConstantOffset: false, useRelativeOffset: true, relativeOffset: { x: 1.5, y: 0, z: 0 },
    });
    const undone = workspaceUndo(redone);
    expect(undone.session.state.stateHash).toBe(imported.session.state.stateHash);
    const edited = translate(undone, 1);
    expect(edited.session.state.geometry.records.cube!.mesh.vertices[0]!.position.x)
      .toBe(imported.session.state.geometry.records.cube!.mesh.vertices[0]!.position.x + 1);
    expect(workspaceUndo(edited).session.state.stateHash).toBe(imported.session.state.stateHash);
    expect(workspaceRedo(workspaceUndo(edited)).session.state.stateHash).toBe(edited.session.state.stateHash);
    expect(decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(edited), { documentId: "third-workspace" }).session.state.documentId)
      .toBe("third-workspace");
  });

  it("파생 cache는 재사용하지 않고 새 문서에서 같은 modifier 결과를 다시 생성한다", async () => {
    const original = await fixture();
    const originalCache = original.session.state.geometry.records.cube!.renderCache!;
    const imported = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(original), { documentId: "cache-target" });
    expect(imported.session.state.geometry.records.cube!.renderCache).toBeNull();
    expect(imported.clothRuntimeCache).toBeNull();
    expect(imported.bridge.set.id).not.toBe(original.bridge.set.id);
    expect(imported.bridge.shots.every((shot) => Object.keys(shot.passHashes).length === 0 && shot.dirtyPasses.length > 0)).toBe(true);
    const refreshed = await workspaceRefreshModifierPreviews(imported);
    expect(refreshed.session.state.geometry.records.cube!.renderCache!.positions).toEqual(originalCache.positions);
    expect(refreshed.session.state.geometry.records.cube!.renderCache!.derivedFromHash).toBe(originalCache.derivedFromHash);
    expect(refreshed.session.state.documentId).toBe("cache-target");
  });

  it("파일의 협업 참여자·잠금·원격 actor 상태는 새 작업 범위로 가져오지 않는다", () => {
    const workspace = cube();
    const bytes = fileFor({ ...workspace, collab: {
      revision: 4, roomId: "foreign-room", epoch: 99,
      peers: [{ peerId: "remote-owner", displayName: "원격", color: "#000", selection: ["cube"], lastSeenAt: 0 }],
      ops: [{ kind: "lock", peerId: "remote-owner", assetId: "cube", at: 0 }],
      locks: { cube: "remote-owner" },
    } });
    const imported = decodeStudioHybridDccWorkfile(bytes, { documentId: "local-owner-document" });
    expect(imported.collab).toMatchObject({ peers: [], ops: [], locks: {}, epoch: 0 });
    expect(imported.collab.roomId).not.toBe("foreign-room");
    expect(imported.session.undoStack).toHaveLength(workspace.session.undoStack.length);
  });

  it.each([
    ["format", "toonstudio.toon3d", "INVALID_FORMAT"],
    ["version", 99, "UNSUPPORTED_VERSION"],
    ["workspaceHash", `sha256:${"0".repeat(64)}`, "INTEGRITY_FAILED"],
    ["workspaceByteLength", 1, "INTEGRITY_FAILED"],
    ["unexpected", "injected", "INVALID_FORMAT"],
  ] as const)("%s 변조를 거부한다", (key, value, code) => {
    const record = parsed(encodeStudioHybridDccWorkfile(cube()));
    record[key] = value;
    expectCode(() => decodeStudioHybridDccWorkfile(jsonBytes(record), { documentId: "target" }), code);
  });

  it("올바른 외부 hash가 있어도 내부 메시·문서·다른 계정 scope가 손상되면 거부한다", () => {
    const original = cube();
    const corrupt = { ...original, session: { ...original.session, state: {
      ...original.session.state, stateHash: `sha256:${"0".repeat(64)}`,
    } } };
    expectCode(() => decodeStudioHybridDccWorkfile(fileFor(corrupt), { documentId: "target" }), "INVALID_WORKSPACE");
    expectCode(() => decodeStudioHybridDccWorkfile(fileFor(original, { userId: "foreign-user", workId: "foreign-work" }), { documentId: "target" }), "INVALID_WORKSPACE");
  });

  it("외부 checksum을 다시 계산해도 위조된 undo 그룹·과거 문서 ID·시계를 받지 않는다", async () => {
    const original = await fixture();
    const missingGroup = { ...original, session: { ...original.session,
      undoGroupStack: original.session.undoGroupStack.map((_id, index) => `forged-${index}`),
    } };
    expectCode(() => decodeStudioHybridDccWorkfile(fileFor(missingGroup), { documentId: "target" }), "INVALID_HISTORY");
    const foreignHistory = { ...original, session: { ...original.session,
      undoStack: original.session.undoStack.map((snapshot) => {
        const state = restoreStudioHybridDccStateFromSnapshot({ ...snapshot, documentId: "foreign-history" });
        return { ...snapshot, documentId: state.documentId, stateHash: state.stateHash };
      }),
    } };
    expectCode(() => decodeStudioHybridDccWorkfile(fileFor(foreignHistory), { documentId: "target" }), "INVALID_WORKSPACE");
    const oldClock = { ...original, session: { ...original.session, lamport: original.session.state.commandCount } };
    expectCode(() => decodeStudioHybridDccWorkfile(fileFor(oldClock), { documentId: "target" }), "INVALID_HISTORY");
  });

  it("완료되지 않은 저널 명령은 내보내지 않는다", () => {
    const original = cube();
    original.session.journal.beginTransaction({ id: "unfinished", actorId: "local", lamport: 2, transactionId: "open", groupId: "open-group" });
    expectCode(() => encodeStudioHybridDccWorkfile(original), "INVALID_HISTORY");
  });

  it("UTF-8 오류·잘린 JSON·중복/추가 key·파일 크기 초과를 거부한다", () => {
    expectCode(() => decodeStudioHybridDccWorkfile(new Uint8Array([0xff]), { documentId: "target" }), "INVALID_FORMAT");
    expectCode(() => decodeStudioHybridDccWorkfile(encoder.encode("{"), { documentId: "target" }), "INVALID_FORMAT");
    const record = parsed(encodeStudioHybridDccWorkfile(cube()));
    Object.defineProperty(record, "__proto__", { value: { polluted: true }, enumerable: true });
    expectCode(() => decodeStudioHybridDccWorkfile(jsonBytes(record), { documentId: "target" }), "INVALID_FORMAT");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const valid = encodeStudioHybridDccWorkfile(cube());
    const validText = new TextDecoder().decode(valid);
    const duplicate = encoder.encode(`{"version":1,${validText.slice(1)}`);
    expectCode(() => decodeStudioHybridDccWorkfile(duplicate, { documentId: "target" }), "INVALID_FORMAT");
    expectCode(() => decodeStudioHybridDccWorkfile(new Uint8Array(STUDIO_HYBRID_DCC_WORKFILE_MAX_BYTES + 1), { documentId: "target" }), "PAYLOAD_TOO_LARGE");
  });

  it.each(["", " target", "target\n", "x".repeat(257)])("신뢰할 현재 문서 ID가 없으면 파일 내용을 열지 않는다", (documentId) => {
    expectCode(() => decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(cube()), { documentId }), "INVALID_DOCUMENT_ID");
  });

  it("실제 OPFS checkpoint 복원으로 이전 command record가 없는 작업도 재결합 후 편집·undo한다", async () => {
    const original = translate(cube("checkpoint-source"), 2);
    let token = 0;
    const ports = createStudioHybridDccOpfsPorts({
      adapter: new FakeOpfsAdapter(), documentId: original.session.state.documentId,
      now: () => 100, randomToken: () => (++token).toString(16).padStart(32, "0"),
    });
    const recovery = await hybridDccRecoverFromJournal(original.session, ports);
    expect(recovery.checkpointFound).toBe(true);
    expect(recovery.session.journal.length).toBe(0);
    expect(recovery.session.undoStack).toEqual([]);
    expect(recovery.session.state.commandCount).toBeGreaterThan(0);
    const recovered = synchronizeWorkspaceGeometryAuthority(original, recovery.session);
    const imported = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(recovered), { documentId: "checkpoint-target" });
    expect(imported.session.undoStack).toEqual([]);
    const edited = translate(imported, 1);
    expect(edited.session.state.geometry.records.cube!.mesh.vertices[0]!.position.x)
      .toBe(original.session.state.geometry.records.cube!.mesh.vertices[0]!.position.x + 1);
    expect(workspaceUndo(edited).session.state.stateHash).toBe(imported.session.state.stateHash);
    expect(workspaceRedo(workspaceUndo(edited)).session.state.documentId).toBe("checkpoint-target");
  });
});
