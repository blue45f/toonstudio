import { describe, expect, it, vi } from "vitest";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import { buildSketchUpArchitecturalComponentPrimitives } from "./studio-bg3d-sketchup-full-engine";
import {
  createStudioBg3dWorkbenchInsertionCommand,
  createStudioBg3dWorkbenchInsertionFromHost,
  type StudioBg3dAddGeneratedParts,
} from "./studio-bg3d-workbench-insertion";

const CAMERA = { position: [4, 3, 6], target: [0, 0, 0], fovDegrees: 45 } as const;

function box(id: string): BgPrimitive {
  return { id, kind: "box", position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff" };
}

describe("전문 작업대의 정본 장면 삽입 명령", () => {
  it("같은 건축 요소를 두 번 추가해도 기존 노드와 ID가 겹치지 않고 한 묶음씩 전달한다", () => {
    const source = buildSketchUpArchitecturalComponentPrimitives({
      kind: "staircase-straight", stepOrBayCount: 8,
      widthMeters: 2, heightMeters: 3, depthMeters: 4,
    }).primitives;
    const before = structuredClone(source);
    let scene: BgPrimitive[] = [box("existing")];
    const addGeneratedParts = vi.fn<StudioBg3dAddGeneratedParts>((build) => {
      const added = build(scene.length, CAMERA);
      scene = [...scene, ...added];
      return added;
    });
    const command = createStudioBg3dWorkbenchInsertionCommand({
      canInsert: () => true,
      readExistingIds: () => scene.map(({ id }) => id),
      addGeneratedParts,
    });
    expect(command(source, "계단")).toBe(true);
    expect(command(source, "계단")).toBe(true);
    expect(addGeneratedParts).toHaveBeenCalledTimes(2);
    expect(scene).toHaveLength(1 + source.length * 2);
    expect(new Set(scene.map(({ id }) => id)).size).toBe(scene.length);
    expect(scene.slice(1).every(({ id }) => !source.some((primitive) => primitive.id === id))).toBe(true);
    expect(scene[1]?.position).toEqual(source[0]?.position);
    expect(source).toEqual(before);
  });

  it("복제 묶음 안의 부모와 연결 원본을 새 ID로 옮기고 입력 배열·태그를 공유하지 않는다", () => {
    const parent = { ...box("parent"), tags: ["건물"] };
    const child = { ...box("child"), parentId: "parent", linkedSourceId: "parent" };
    const source = [parent, child];
    let accepted: BgPrimitive[] = [];
    const command = createStudioBg3dWorkbenchInsertionCommand({
      canInsert: () => true,
      readExistingIds: () => [],
      createId: vi.fn().mockReturnValueOnce("new-parent").mockReturnValueOnce("new-child"),
      addGeneratedParts: (build) => { accepted = build(0, CAMERA); return accepted; },
    });
    expect(command(source, "건물")).toBe(true);
    expect(accepted[1]).toMatchObject({ id: "new-child", parentId: "new-parent", linkedSourceId: "new-parent" });
    expect(accepted[0]?.position).not.toBe(parent.position);
    expect(accepted[0]?.tags).not.toBe(parent.tags);
    expect(source[1]?.parentId).toBe("parent");
  });

  it("장면 예산 거부를 그대로 반환하고 빈 묶음·중복 원본 ID·ID 충돌에는 커밋하지 않는다", () => {
    const addGeneratedParts = vi.fn<StudioBg3dAddGeneratedParts>(() => false);
    const ports = { canInsert: () => true, readExistingIds: () => ["existing"], addGeneratedParts };
    const command = createStudioBg3dWorkbenchInsertionCommand(ports);
    expect(command([box("source")], "계단")).toBe(false);
    expect(addGeneratedParts).toHaveBeenCalledTimes(1);
    expect(command([], "빈 결과")).toBe(false);
    expect(command([box("same"), box("same")], "중복")).toBe(false);
    expect(createStudioBg3dWorkbenchInsertionCommand({ ...ports, createId: () => "existing" })([box("source")], "충돌")).toBe(false);
    expect(addGeneratedParts).toHaveBeenCalledTimes(1);
  });

  it("열린 호스트의 실행 시점 잠금을 확인하고 잠금 해제 뒤 공식 추가 경로를 사용한다", () => {
    const addGeneratedParts = vi.fn<StudioBg3dAddGeneratedParts>((build) => build(0, CAMERA));
    const host = {
      open: true, modelRenderer: {}, isRestoringScene: false, isCapturing: false,
      isBatchRenderingShots: false, physicsInteractionLocked: false, isUploadingModel: false,
      isSavingTemplate: false, applyingTemplateId: null as string | null,
      hasPendingClone: false, hasCloneFailure: false,
      physicsRuntimeSourceRef: { current: { primitives: [box("existing")], customModels: [] } },
      addGeneratedParts,
    };
    const command = createStudioBg3dWorkbenchInsertionFromHost(host);
    const booleanLocks = ["isRestoringScene", "isCapturing", "isBatchRenderingShots", "physicsInteractionLocked", "isUploadingModel", "isSavingTemplate", "hasPendingClone", "hasCloneFailure"] as const;
    for (const key of booleanLocks) {
      host[key] = true;
      expect(command([box("source")], "계단")).toBe(false);
      host[key] = false;
    }
    host.applyingTemplateId = "pending-template";
    expect(command([box("source")], "계단")).toBe(false);
    host.applyingTemplateId = null;
    host.open = false;
    expect(command([box("source")], "계단")).toBe(false);
    host.open = true;
    expect(addGeneratedParts).not.toHaveBeenCalled();
    expect(command([box("source")], "계단")).toBe(true);
    expect(addGeneratedParts).toHaveBeenCalledTimes(1);
    expect(createStudioBg3dWorkbenchInsertionFromHost({})([box("source")], "계단")).toBe(false);
  });
});
