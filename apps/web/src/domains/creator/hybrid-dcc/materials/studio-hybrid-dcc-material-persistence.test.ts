import { describe, expect, it } from "vitest";

import { canonicalStudioCommandJson } from "../../studio-command-journal";
import { calculateStudioCrc32 } from "../../studio-crc32";
import { sha256HexPortable } from "../../studio-sha256";
import { createStudioHybridDccOpfsPorts, hybridDccRecoverFromJournal, hybridDccSetAssetToonMaterial } from "../studio-hybrid-dcc-document";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "../studio-hybrid-dcc-workfile";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube, workspaceRedo, workspaceUndo } from "../studio-hybrid-dcc-workspace";

import { createStudioHybridDccDefaultToonMaterial, hashStudioHybridDccToonMaterial, studioToonMaterialObject } from "./studio-hybrid-dcc-toon-material";

import type { StudioOpfsRecoveryJournalAdapter } from "../../studio-opfs-recovery-journal";
import type { StudioHybridDccWorkspace } from "../studio-hybrid-dcc-workspace";

const ENCODER = new TextEncoder();
const MATERIAL = createStudioHybridDccDefaultToonMaterial();
function apply(workspace: StudioHybridDccWorkspace, shift: number) {
  return synchronizeWorkspaceGeometryAuthority(workspace, hybridDccSetAssetToonMaterial(workspace.session, "cube", [0], { ...MATERIAL, shadingShift: shift }));
}
function fixture() {
  let workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("material-source"), "cube");
  workspace = apply(workspace, .1); workspace = apply(workspace, .3); workspace = apply(workspace, .6);
  return workspaceUndo(workspace);
}
function activeShift(workspace: StudioHybridDccWorkspace): number | undefined {
  const table = workspace.session.state.materials; const id = table?.bindings.cube?.["0"];
  return id ? table?.definitions[id]?.shadingShift : undefined;
}
class MemoryAdapter implements StudioOpfsRecoveryJournalAdapter {
  readonly kind = "fake-opfs" as const; readonly files = new Map<string, Uint8Array>();
  async read(path: string) { return this.files.get(path)?.slice() ?? null; }
  async writeAtomic(path: string, bytes: Uint8Array) { this.files.set(path, bytes.slice()); }
  async remove(path: string) { this.files.delete(path); }
  async list(prefix: string) { return [...this.files.keys()].filter((path) => path.startsWith(prefix)); }
  async size(path: string) { return this.files.get(path)?.byteLength ?? null; }
  async estimateQuota() { return { usage: [...this.files.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0), quota: 100_000_000 }; }
  async withExclusiveLock<T>(_name: string, _signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> { return operation(); }
}

/** checksum이 모두 유효한 파일 내부의 정본만 바꿔 material parser/stateHash 검사를 검증한다. */
function corruptMaterial(bytes: Uint8Array, where: "current" | "undo" | "redo", validIdentity = false): Uint8Array {
  const file = studioToonMaterialObject(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  const envelope = studioToonMaterialObject(file.workspace); const payload = studioToonMaterialObject(envelope.payload);
  const session = studioToonMaterialObject(payload.session);
  const stack = where === "current" ? null : session[where === "undo" ? "undoStack" : "redoStack"];
  if (stack !== null && !Array.isArray(stack)) throw new Error("파일 이력 fixture가 없습니다.");
  const state = studioToonMaterialObject(stack === null ? session.state : stack.at(-1));
  const table = studioToonMaterialObject(state.materials); const definitions = studioToonMaterialObject(table.definitions);
  const id = Object.keys(definitions)[0]; if (!id) throw new Error("이력 재질이 없습니다.");
  if (validIdentity) {
    const material = { ...MATERIAL, shadingShift: .8 }; const newId = hashStudioHybridDccToonMaterial(material);
    delete definitions[id]; definitions[newId] = material;
    const bindings = studioToonMaterialObject(table.bindings);
    for (const asset of Object.values(bindings)) {
      const slots = studioToonMaterialObject(asset);
      for (const slot of Object.keys(slots)) if (slots[slot] === id) slots[slot] = newId;
    }
  } else definitions[id] = { ...studioToonMaterialObject(definitions[id]), shadingShift: .8 };
  const encodedPayload = ENCODER.encode(canonicalStudioCommandJson(payload));
  envelope.payloadByteLength = encodedPayload.length; envelope.payloadCrc32 = calculateStudioCrc32(encodedPayload);
  envelope.sourceHash = `sha256:${sha256HexPortable(encodedPayload)}`;
  const encodedEnvelope = ENCODER.encode(canonicalStudioCommandJson(envelope));
  file.workspaceByteLength = encodedEnvelope.length; file.workspaceHash = `sha256:${sha256HexPortable(encodedEnvelope)}`;
  return ENCODER.encode(canonicalStudioCommandJson(file));
}

describe("툰 재질 작업파일·checkpoint 복원", () => {
  it("다른 documentId의 현재·undo·redo와 후속 편집에서 실제 slot/내용 ID를 보존한다", () => {
    const source = fixture(); const originalHash = source.session.state.stateHash;
    const geometryHash = source.session.state.geometry.records.cube?.meshHash;
    const bytes = encodeStudioHybridDccWorkfile(source);
    const reopened = decodeStudioHybridDccWorkfile(bytes, { documentId: "material-target" });
    expect(reopened.session.state.documentId).toBe("material-target"); expect(source.session.state.stateHash).toBe(originalHash);
    expect(reopened.session.state.materials).toEqual(source.session.state.materials); expect(activeShift(reopened)).toBe(.3);
    expect(reopened.session.state.geometry.records.cube?.meshHash).toBe(geometryHash);
    expect(activeShift(workspaceUndo(reopened))).toBe(.1);
    expect(activeShift(workspaceRedo(reopened))).toBe(.6);
    const edited = apply(reopened, -.4); expect(activeShift(edited)).toBe(-.4);
    expect(activeShift(workspaceUndo(edited))).toBe(.3); expect(activeShift(workspaceRedo(workspaceUndo(edited)))).toBe(-.4);
    expect(edited.session.state.materials?.bindings.cube?.["0"]).toBe(hashStudioHybridDccToonMaterial({ ...MATERIAL, shadingShift: -.4 }));
  });

  it.each(["current", "undo", "redo"] as const)("모든 checksum이 유효해도 %s의 재질 내용 ID 변조는 파일 열기에서 거부한다", (where) => {
    const source = fixture(); const before = source.session.state; const journal = source.session.journal;
    const bytes = corruptMaterial(encodeStudioHybridDccWorkfile(source), where);
    expect(() => decodeStudioHybridDccWorkfile(bytes, { documentId: "material-target" })).toThrow();
    expect(source.session.state).toBe(before); expect(source.session.journal).toBe(journal);
  });

  it("정상 DTO·내용 ID·binding으로 교체해도 원래 stateHash와 다르면 파일 열기를 거부한다", () => {
    const bytes = corruptMaterial(encodeStudioHybridDccWorkfile(fixture()), "current", true);
    expect(() => decodeStudioHybridDccWorkfile(bytes, { documentId: "material-target" })).toThrow();
  });

  it("실제 OPFS checkpoint 복원 뒤에도 재질과 content ID를 유지하고 다음 변경을 undo한다", async () => {
    const source = apply(workspaceAddUnitCube(createStudioHybridDccWorkspace("material-opfs"), "cube"), .2);
    let nonce = 0;
    const ports = createStudioHybridDccOpfsPorts({ adapter: new MemoryAdapter(), documentId: "material-opfs",
      now: () => 100, randomToken: () => (++nonce).toString(16).padStart(32, "0") });
    const recovered = await hybridDccRecoverFromJournal(source.session, ports);
    expect(recovered.checkpointFound).toBe(true); expect(recovered.session.state.stateHash).toBe(source.session.state.stateHash);
    expect(recovered.session.state.materials).toEqual(source.session.state.materials);
    const workspace = synchronizeWorkspaceGeometryAuthority(source, recovered.session);
    const changed = apply(workspace, .7); expect(activeShift(changed)).toBe(.7);
    expect(activeShift(workspaceUndo(changed))).toBe(.2);
    const reopened = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(workspace), { documentId: "material-opfs-target" });
    expect(activeShift(reopened)).toBe(.2);
  });
});
