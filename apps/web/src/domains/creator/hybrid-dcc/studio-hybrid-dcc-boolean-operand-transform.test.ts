import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { serializeStudioCommandJournal } from "../studio-command-journal";
import { createStudioUnitCubeMesh, serializeStudioEditableMesh, studioEditableMeshToTriangleSoup } from "../studio-editable-half-edge-mesh";
import { contentAddressStudioGeometryBytes } from "../studio-geometry-authority";
import type { StudioSolidBooleanBackend } from "../studio-mesh-modifier-stack";

import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { workspaceAddActiveModifier, workspaceApplyActiveModifierStack } from "./studio-hybrid-dcc-modifier-workspace";
import { hashStudioHybridDccObjectTransform, type StudioHybridDccObjectTransform } from "./studio-hybrid-dcc-object-transform";
import {
  createStudioHybridDccWorkspace,
  synchronizeWorkspaceGeometryAuthority,
  workspaceCommitObjectTransform,
  workspaceRedo,
  workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

/** 실제 workspace resolver/evaluator를 실행하고 backend 입력만 관측한다. CSG/WASM 품질 검사는 별도다. */
const observed = vi.hoisted(() => ({
  boolean: vi.fn<StudioSolidBooleanBackend["boolean"]>(async (input) => ({
    positions: new Float32Array(input.left.positions), indices: new Uint32Array(input.left.indices),
  })),
}));
vi.mock("../studio-solid-boolean-backend", () => ({
  createStudioDefaultSolidBooleanBackend: () => ({ boolean: observed.boolean }),
}));

const IDENTITY: StudioHybridDccObjectTransform = {
  revision: 1, position: [0, 0, 0], rotationEulerRad: [0, 0, 0], scale: [1, 1, 1],
};
const MIXED_TARGET: StudioHybridDccObjectTransform = {
  revision: 1, position: [1.2, -.3, .8], rotationEulerRad: [.37, -.21, .48], scale: [2, .7, 1.4],
};
const MIXED_CUTTER: StudioHybridDccObjectTransform = {
  revision: 1, position: [.3, .8, -.4], rotationEulerRad: [-.29, .43, -.32], scale: [.6, 1.3, .8],
};
const IDENTICAL_XY: StudioHybridDccObjectTransform = {
  revision: 1, position: [.25, -.5, .75], rotationEulerRad: [Math.PI / 2, Math.PI / 2, 0], scale: [1, 1, 1],
};
const CASES: readonly {
  readonly name: string;
  readonly target: StudioHybridDccObjectTransform;
  readonly cutter: StudioHybridDccObjectTransform;
  readonly mirrored: boolean;
}[] = [
  { name: "동일한 X/Y 90도 TRS의 상대 변환은 identity", target: IDENTICAL_XY, cutter: IDENTICAL_XY, mirrored: false },
  { name: "서로 다른 mixed Euler와 비균일 양수 scale", target: MIXED_TARGET, cutter: MIXED_CUTTER, mirrored: false },
  { name: "target만 음수 determinant", target: { ...MIXED_TARGET, scale: [-2, .7, 1.4] }, cutter: MIXED_CUTTER, mirrored: true },
  { name: "cutter만 음수 determinant", target: MIXED_TARGET, cutter: { ...MIXED_CUTTER, scale: [-.6, 1.3, .8] }, mirrored: true },
  { name: "둘 다 음수 determinant", target: { ...MIXED_TARGET, scale: [-2, .7, 1.4] }, cutter: { ...MIXED_CUTTER, scale: [-.6, 1.3, .8] }, mirrored: false },
];

function matrix(transform: StudioHybridDccObjectTransform): THREE.Matrix4 {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotationEulerRad, "XYZ"));
  return new THREE.Matrix4().compose(new THREE.Vector3(...transform.position), quaternion, new THREE.Vector3(...transform.scale));
}

function record(workspace: StudioHybridDccWorkspace, assetId: string) {
  const result = workspace.session.state.geometry.records[assetId];
  if (!result) throw new Error(`회귀 원본 ${assetId}가 없습니다.`);
  return result;
}

function fixture(target: StudioHybridDccObjectTransform, cutter: StudioHybridDccObjectTransform) {
  const empty = createStudioHybridDccWorkspace("boolean-target-local");
  const targetSession = hybridDccRegisterAsset(empty.session, "target", createStudioUnitCubeMesh(), {
    source: "licensed-target", creator: "target-creator", license: "CC-BY-4.0", useScope: "commercial", derivative: "modified",
  });
  const both = hybridDccRegisterAsset(targetSession, "cutter", createStudioUnitCubeMesh(), {
    source: "licensed-cutter", creator: "cutter-creator", license: "CC-BY-SA-4.0", useScope: "commercial", derivative: "modified",
  });
  const workspace = synchronizeWorkspaceGeometryAuthority({ ...empty, activeAssetId: "target" }, both);
  return workspaceCommitObjectTransform(workspaceCommitObjectTransform(workspace, "target", target), "cutter", cutter);
}

function operand(workspace: StudioHybridDccWorkspace) {
  const modifier = record(workspace, "target").modifierStack.modifiers.find((item) => item.kind === "boolean");
  if (!modifier || modifier.kind !== "boolean") throw new Error("실제 Boolean modifier가 없습니다.");
  return modifier;
}

describe("Boolean의 실제 workspace cutter→target-local 변환", () => {
  beforeEach(() => { observed.boolean.mockClear(); });

  it.each(CASES)("$name: 독립 Three Matrix4와 같은 좌표·winding을 backend에 전달한다", async ({ target, cutter, mirrored }) => {
    const original = fixture(target, cutter), beforeState = original.session.state;
    const beforeJournal = serializeStudioCommandJournal(original.session.journal);
    const targetBefore = serializeStudioEditableMesh(record(original, "target").mesh);
    const cutterBefore = serializeStudioEditableMesh(record(original, "cutter").mesh);
    const soup = studioEditableMeshToTriangleSoup(record(original, "cutter").mesh);
    const relative = matrix(target).invert().multiply(matrix(cutter));
    const preview = await workspaceAddActiveModifier(original, "boolean");
    const resolved = operand(preview), backendInput = observed.boolean.mock.calls.at(-1)?.[0];
    if (!backendInput) throw new Error("관측한 실제 evaluator backend 입력이 없습니다.");
    expect(resolved.operandAssetId).toBe("cutter"); expect(backendInput.operation).toBe("difference");
    expect(backendInput.right.positions).toEqual(resolved.operand.positions);
    expect(backendInput.right.indices).toEqual(resolved.operand.indices);
    for (let offset = 0; offset < soup.positions.length; offset += 3) {
      const x = soup.positions[offset], y = soup.positions[offset + 1], z = soup.positions[offset + 2];
      if (x === undefined || y === undefined || z === undefined) throw new Error("원본 cutter 코너가 없습니다.");
      const expected = new THREE.Vector3(x, y, z).applyMatrix4(relative);
      for (const [axis, value] of [expected.x, expected.y, expected.z].entries()) {
        // Float32 저장 뒤의 좌표를 독립 double matrix 결과와 비교한다. 원본 공식 재호출은 하지 않는다.
        const actual = resolved.operand.positions[offset + axis];
        if (actual === undefined) throw new Error("변환된 cutter 코너가 없습니다.");
        expect(actual).toBeCloseTo(Math.fround(value), 6);
      }
    }
    const expectedIndices = new Uint32Array(soup.indices);
    if (mirrored) for (let index = 0; index < expectedIndices.length; index += 3) {
      const b = expectedIndices[index + 1], c = expectedIndices[index + 2];
      if (b === undefined || c === undefined) throw new Error("winding 회귀의 triangle이 없습니다.");
      expectedIndices[index + 1] = c; expectedIndices[index + 2] = b;
    }
    expect(resolved.operand.indices).toEqual(expectedIndices);
    if (target === IDENTICAL_XY && cutter === IDENTICAL_XY) expect(resolved.operand.positions).toEqual(soup.positions);
    expect(original.session.state).toBe(beforeState);
    expect(serializeStudioCommandJournal(original.session.journal)).toBe(beforeJournal);
    expect(serializeStudioEditableMesh(record(original, "target").mesh)).toEqual(targetBefore);
    expect(serializeStudioEditableMesh(record(original, "cutter").mesh)).toEqual(cutterBefore);
    expect(record(preview, "target").mesh).toBe(record(original, "target").mesh);
  });

  it("수정된 경로의 권리 receipt와 적용 한 undo는 원본 license·TRS·cutter를 유지한다", async () => {
    const original = fixture(MIXED_TARGET, MIXED_CUTTER);
    const preview = await workspaceAddActiveModifier(original, "boolean"), modifier = operand(preview);
    const beforeJournal = serializeStudioCommandJournal(preview.session.journal);
    const beforeStack = record(preview, "target").modifierStack;
    const applied = await workspaceApplyActiveModifierStack(preview);
    expect(applied.session.state.commandCount).toBe(preview.session.state.commandCount + 1);
    expect(applied.session.undoStack).toHaveLength(preview.session.undoStack.length + 1);
    expect(applied.bridge.commandSequence).toBe(preview.bridge.commandSequence + 1);
    expect(record(applied, "target").modifierStack.modifiers).toHaveLength(0);
    expect(record(applied, "cutter")).toBe(record(preview, "cutter"));
    expect(applied.session.state.objectTransforms).toEqual(preview.session.state.objectTransforms);
    const rights = applied.session.state.rightsBom.find(({ assetId }) => assetId === "target");
    expect(rights?.license).toBe("CC-BY-4.0");
    expect(rights?.provenance).toContainEqual(expect.objectContaining({
      role: "boolean-operand", assetId: "cutter", modifierId: modifier.id, operation: "difference",
      source: "licensed-cutter", creator: "cutter-creator", license: "CC-BY-SA-4.0",
      sourceMeshHash: record(preview, "cutter").meshHash,
      objectTransformHash: hashStudioHybridDccObjectTransform(MIXED_CUTTER),
      resolvedOperandHash: contentAddressStudioGeometryBytes(modifier.operand.positions, modifier.operand.indices),
    }));
    const undone = workspaceUndo(applied), redone = workspaceRedo(undone);
    expect(record(undone, "target").modifierStack).toEqual(beforeStack);
    expect(undone.session.state.rightsBom).toEqual(preview.session.state.rightsBom);
    expect(redone.session.state.stateHash).toBe(applied.session.state.stateHash);
    expect(serializeStudioCommandJournal(preview.session.journal)).toBe(beforeJournal);
  });

  it("singular scale는 public transform 경계에서 원본·저널을 바꾸지 않고 거부한다", () => {
    const original = fixture(IDENTITY, IDENTITY), state = original.session.state;
    const journal = serializeStudioCommandJournal(original.session.journal);
    expect(() => workspaceCommitObjectTransform(original, "target", { ...IDENTITY, scale: [0, 1, 1] })).toThrow(/scale|zero/u);
    expect(original.session.state).toBe(state); expect(serializeStudioCommandJournal(original.session.journal)).toBe(journal);
  });
});
