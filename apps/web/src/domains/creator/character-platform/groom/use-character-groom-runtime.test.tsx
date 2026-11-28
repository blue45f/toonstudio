// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { MToonMaterial } from "@pixiv/three-vrm";
import { Group, Mesh, Scene, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCharacterDocumentV2 } from "../document/character-document-v2";
import { migrateCharacterDocumentV2ToV3, parseCharacterDocumentV3, serializeCharacterDocumentV3 } from "../document/character-document-v3";
import { executeCharacterAuthoringTaskInBrowser } from "../runtime/character-authoring-worker-client";
import { executeCharacterAuthoringTask } from "../runtime/character-authoring-worker-runtime";
import { addCharacterGroomGroup, addCharacterGroomGuide } from "./character-groom-edit";
import { useCharacterGroomRuntime } from "./use-character-groom-runtime";

import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import type { CharacterAuthoringWorkerResultPayload } from "../runtime/character-authoring-worker-protocol";

vi.mock("../runtime/character-authoring-worker-client", () => ({ executeCharacterAuthoringTaskInBrowser: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function fixture(metaVersion: "0" | "1" = "1") {
  const scene = new Scene();
  const modelRoot = new Group();
  const head = new Group();
  const normalizedHead = new Group();
  modelRoot.add(head, normalizedHead); scene.add(modelRoot);
  const h = { status: "ready", vrm: { scene: modelRoot, meta: { metaVersion }, humanoid: {
    getRawBoneNode: () => head,
    getNormalizedBoneNode: (bone: string) => bone === "head" ? normalizedHead : null,
  } },
    captureRef: { current: { scene } }, texturePaintInvalidateRef: { current: vi.fn() }, captureSceneGeneration: 1,
  } as unknown as StudioVrmPoserHost;
  const initial = migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:groom-hook",
    model: { assetId: "model:test", assetVersion: "1", contentSha256: null, mode: "canonical", topologyFamily: "family:test", topologyRevision: "topology:test", rigRevision: "rig:1", morphRevision: "morph:1", rendererRevision: "renderer:1" },
    compatibility: { grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "manifest:1" },
    recipe: { version: 2, slots: {}, accessories: [], handPose: {} },
    colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null },
  }));
  const document = { ...initial, groom: addCharacterGroomGroup(initial.groom, "헤어") };
  return { scene, modelRoot, head, normalizedHead, h, document };
}

describe("useCharacterGroomRuntime 준비와 복원", () => {
  // 두 원본 배포 VRM의 rest 머리 회전과 얼굴 전방으로 구버전 가이드와 신형 가이드를 한 그룹에서 재생한다.
  it.each([
    { name: "루미", meta: "1" as const, rotation: [0.5, 0.5, 0.5, 0.5] as const, front: 1, originalHairColor: "#6d4b3a" },
    { name: "시온", meta: "0" as const, rotation: [0, 0, 0, 1] as const, front: -1, originalHairColor: "#131b2a" },
  ])("$name 원본 축에서 새 가이드의 정수리·이마·폭을 맞추고 이전 가이드의 원시 좌표를 보존한다", async ({ meta, rotation, front, originalHairColor }) => {
    const f = fixture(meta);
    f.head.quaternion.fromArray(rotation);
    f.head.position.y = f.normalizedHead.position.y = 1.4;
    vi.mocked(executeCharacterAuthoringTaskInBrowser).mockImplementation(async (task) => executeCharacterAuthoringTask(task));
    const originalHairMaterial = { baseColor: originalHairColor, rimColor: "#000000" };
    const hook = renderHook(({ document }) => useCharacterGroomRuntime({ h: f.h, document, modelKey: "model:test", originalHairMaterial }), { initialProps: { document: f.document } });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    const fit = hook.result.current.readGuideHeadFit?.();
    if (!fit) throw new Error("두상 실측 결과가 없습니다.");
    expect(fit.frontSign).toBe(front);
    const mixed = addCharacterGroomGuide(f.document.groom, f.document.groom.groups[0].groupId, fit);
    const [legacy, added] = mixed.groups[0].guides;
    expect(legacy).toEqual(f.document.groom.groups[0].guides[0]);
    expect(added.coordinateSpace).toBe("anatomical-head");
    const saved = serializeCharacterDocumentV3({ ...f.document, groom: mixed });
    const restored = parseCharacterDocumentV3(JSON.parse(saved));
    expect(restored.groom).toEqual(mixed);
    hook.rerender({ document: restored });
    await waitFor(() => expect(hook.result.current.guideCount).toBe(2));
    const [oldMesh, newMesh] = f.head.children[0].children;
    if (!(oldMesh instanceof Mesh) || !(newMesh instanceof Mesh)) throw new Error("새 가이드와 이전 가이드가 모두 필요합니다.");
    function worldRow(mesh: Mesh, row: number) {
      const pos = mesh.geometry.getAttribute("position");
      const left = mesh.localToWorld(new Vector3().fromBufferAttribute(pos, row * 2));
      const right = mesh.localToWorld(new Vector3().fromBufferAttribute(pos, row * 2 + 1));
      return { center: left.clone().lerp(right, 0.5), width: left.distanceTo(right), across: right.sub(left).normalize() };
    }
    const legacyRoot = f.head.localToWorld(new Vector3(...legacy.points[0].position));
    expect(worldRow(oldMesh, 0).center.distanceTo(legacyRoot)).toBeLessThan(1e-6);
    const root = worldRow(newMesh, 0);
    const tip = worldRow(newMesh, newMesh.geometry.getAttribute("position").count / 2 - 1);
    const [x, y, z] = added.points[0].position;
    const expected = f.normalizedHead.localToWorld(new Vector3(front * x, y, front * z));
    expect(root.center.distanceTo(expected)).toBeLessThan(1e-6);
    expect(root.center.y - tip.center.y).toBeGreaterThan(fit.radiusY * 0.8);
    expect(tip.center.y).toBeGreaterThan(f.normalizedHead.position.y + fit.eyeCenter[1]);
    expect(front * tip.center.z).toBeGreaterThan(fit.faceFront);
    expect(tip.width).toBeLessThan(root.width * 0.3);
    expect(Math.abs(root.across.x)).toBeGreaterThan(0.85);
    expect(root.width).toBeLessThan(worldRow(newMesh, 6).width * 0.5);
    expect(root.center.y).toBeLessThan(f.normalizedHead.position.y + fit.center[1] + fit.radiusY * 0.92);
    if (!(oldMesh.material instanceof MToonMaterial) || !(newMesh.material instanceof MToonMaterial)) throw new Error("원본과 신규 가닥의 MToon 재질이 필요합니다.");
    expect(oldMesh.material.color.getHexString()).toBe("32251f");
    expect(newMesh.material.color.getHexString()).toBe(originalHairColor.slice(1));
    expect(newMesh.material.parametricRimColorFactor.getHexString()).toBe("000000");

    const geometry = newMesh.geometry;
    const indices = geometry.getIndex();
    if (!indices) throw new Error("삼각형 인덱스가 없습니다.");
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    for (let index = 0; index < indices.count; index += 3) {
      const a = new Vector3().fromBufferAttribute(positions, indices.getX(index));
      const b = new Vector3().fromBufferAttribute(positions, indices.getX(index + 1));
      const c = new Vector3().fromBufferAttribute(positions, indices.getX(index + 2));
      const faceNormal = b.sub(a).cross(c.sub(a)).normalize();
      expect(faceNormal.dot(new Vector3().fromBufferAttribute(normals, indices.getX(index)))).toBeGreaterThan(0.75);
    }
    for (let row = 0; row < positions.count; row += 2) {
      const left = new Vector3().fromBufferAttribute(positions, row);
      const across = new Vector3().fromBufferAttribute(positions, row + 1).sub(left).normalize();
      expect(new Vector3().fromBufferAttribute(normals, row).dot(across)).toBeLessThan(-0.2);
      expect(new Vector3().fromBufferAttribute(normals, row + 1).dot(across)).toBeGreaterThan(0.2);
    }

    const dyed = { ...restored, look: { ...restored.look, colors: { ...restored.look.colors, hairBase: "#c19684" } } };
    hook.rerender({ document: dyed });
    const currentMaterial = () => {
      const mesh = f.head.children[0]?.children[1];
      if (!(mesh instanceof Mesh) || !(mesh.material instanceof MToonMaterial)) throw new Error("헤어 재질을 찾을 수 없습니다.");
      return mesh.material;
    };
    await waitFor(() => expect(currentMaterial().color.getHexString()).toBe("c19684"));
    hook.rerender({ document: { ...dyed, look: { ...dyed.look, materialOverrides: [{
      materialId: mixed.groups[0].materialId, baseColor: "#885544", shadowColor: "#332211", outlineColor: "#2b2131", opacity: 0.6,
    }] } } });
    await waitFor(() => expect(currentMaterial().color.getHexString()).toBe("885544"));
    expect(currentMaterial().shadeColorFactor.getHexString()).toBe("332211");
    expect(currentMaterial().outlineColorFactor.getHexString()).toBe("2b2131");
    expect(currentMaterial().opacity).toBeCloseTo(0.6);
  });

  it("문서 복원 전에는 Worker와 파생 메시를 만들지 않고 복원 후 실제 준비를 표시한다", async () => {
    const f = fixture();
    vi.mocked(executeCharacterAuthoringTaskInBrowser).mockImplementation(async (task) => executeCharacterAuthoringTask(task));
    const hook = renderHook(({ enabled }) => useCharacterGroomRuntime({ h: f.h, document: f.document, modelKey: "model:test", enabled }), { initialProps: { enabled: false } });
    expect(hook.result.current.status).toBe("idle");
    expect(executeCharacterAuthoringTaskInBrowser).not.toHaveBeenCalled();
    expect(f.head.children).toHaveLength(0);
    hook.rerender({ enabled: true });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    expect(f.head.children[0]?.children).toHaveLength(1);
    hook.rerender({ enabled: false });
    expect(hook.result.current.status).toBe("idle");
    expect(f.head.children).toHaveLength(0);
  });

  it("미리보기 취소 후 늦은 Worker가 돌아와도 원본 메시와 현재 준비 상태를 덮어쓰지 않는다", async () => {
    const f = fixture();
    const requests: { readonly resolve: (value: CharacterAuthoringWorkerResultPayload) => void; readonly payload: CharacterAuthoringWorkerResultPayload }[] = [];
    vi.mocked(executeCharacterAuthoringTaskInBrowser).mockImplementation((task) => new Promise((resolve) => {
      requests.push({ resolve, payload: executeCharacterAuthoringTask(task) });
    }));
    const hook = renderHook(({ document }) => useCharacterGroomRuntime({ h: f.h, document, modelKey: "model:test" }), { initialProps: { document: f.document } });
    const first = requests[0];
    if (!first) throw new Error("첫 요청이 없습니다.");
    await act(async () => { first.resolve(first.payload); });
    expect(hook.result.current.status).toBe("ready");
    const preview = { ...f.document, groom: { ...f.document.groom, groups: f.document.groom.groups.map((group) => ({ ...group, profile: { ...group.profile, lengthScale: 2 } })) } };
    hook.rerender({ document: preview });
    expect(hook.result.current.status).toBe("building");
    hook.rerender({ document: f.document });
    expect(hook.result.current.status).toBe("building");
    const second = requests[1]; const third = requests[2];
    if (!second || !third) throw new Error("취소와 복원 요청이 없습니다.");
    await act(async () => { third.resolve(third.payload); });
    const restored = f.head.children[0]?.children[0];
    await act(async () => { second.resolve(second.payload); });
    expect(hook.result.current.status).toBe("ready");
    expect(f.head.children[0]?.children[0]).toBe(restored);
  });

  it("모델이 capture 장면에서 빠지면 메시·준비 상태를 해제하고 재부착 때 복원한다", async () => {
    const f = fixture();
    vi.mocked(executeCharacterAuthoringTaskInBrowser).mockImplementation(async (task) => executeCharacterAuthoringTask(task));
    const hook = renderHook(() => useCharacterGroomRuntime({ h: f.h, document: f.document, modelKey: "model:test" }));
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    act(() => { f.scene.remove(f.modelRoot); });
    expect(hook.result.current.status).toBe("idle");
    expect(f.head.children).toHaveLength(0);
    act(() => { f.scene.add(f.modelRoot); });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    expect(f.head.children[0]?.children).toHaveLength(1);
  });
});
