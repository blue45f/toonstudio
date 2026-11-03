/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/lib/i18n-core";

import { createEmptyCharacterRecipe } from "../../character-shaper/character-shaper-recipe";
import { readStudioVrmFingerCurlDegrees } from "../../vrm/studio-vrm-finger-curl";
import { applyFingerRotations } from "../../vrm/studio-vrm-poser-utils";
import { createCharacterDocumentV2, projectCharacterRecipeV1 } from "../document/character-document-v2";
import { migrateCharacterDocumentV2ToV3 } from "../document/character-document-v3";
import { CharacterDocumentV3Repository } from "../document/character-document-v3-repository";
import { captureCharacterPoseRuntimeV3 } from "../pose-v3/character-pose-runtime-adapter";
import { createAuthoringPoseVrm } from "../runtime/__fixtures__/character-authoring-vrm";
import { useCharacterAuthoringAuthority } from "./use-character-authoring-authority";
import { useCharacterAuthoringInputs } from "./use-character-authoring-inputs";

import type { StudioVrmPhotoPoseApplyPayload } from "../../vrm/StudioVrmPhotoPoseScanner";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

afterEach(cleanup);

function fixture(legacyFingers = false) {
  const vrm = createAuthoringPoseVrm();
  const nativeFingers = legacyFingers ? { leftIndexProximal: [0, 0, -0.2] as const } : {};
  applyFingerRotations(vrm, nativeFingers);
  const recipe = createEmptyCharacterRecipe();
  const initial = { ...migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:input-test", model: { assetId: "hero", assetVersion: "1", contentSha256: null,
      mode: "canonical", topologyFamily: "toon-standard", topologyRevision: "v1", rigRevision: "v1", morphRevision: "v1", rendererRevision: "v1" },
    compatibility: { grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "v1" },
    recipe: projectCharacterRecipeV1(recipe), colors: recipe.colors, now: "2026-09-27T00:00:00.000Z",
  })), pose: captureCharacterPoseRuntimeV3({ source: vrm, poseId: "before", generationId: 0, includeFingers: !legacyFingers }) };
  const rows = new Map<string, string>();
  const repository = new CharacterDocumentV3Repository({ storeFactory: async () => ({
    get: async (key) => rows.get(key) ?? null,
    set: async (key, value) => { rows.set(key, value); }, delete: async (key) => { rows.delete(key); },
  }) });
  const host: StudioVrmPoserHost = { vrm, status: "ready", activeModelId: "hero", setJointHandleStatus: vi.fn(), setWebcamActive: vi.fn(), updateFingerCurl: vi.fn(), fingerEdits: nativeFingers };
  const hook = renderHook(({ h }) => {
    const [fingerEdits, setFingerEdits] = useState(nativeFingers);
    const native: StudioVrmPoserHost = legacyFingers ? { ...h, fingerEdits, setFingerEdits } : h;
    const authoring = useCharacterAuthoringAuthority(initial, "input-test", { repository, autosave: false, synchronizeProjection: false });
    return { authoring, native, input: useCharacterAuthoringInputs(native, authoring, true) };
  }, { initialProps: { h: host } });
  return { hook, host, vrm, rows, repository, initial };
}

const payload: StudioVrmPhotoPoseApplyPayload = {
  sourceName: "pose.png", bones: { leftUpperArm: [0.2, 0.3, 0.4] },
  fingerEdits: { leftIndexProximal: [0, 0.1, 0.5] }, detectedHandSides: ["left"], landmarks: [], worldLandmarks: [],
  confidence: { overall: 0.9, coverage: 0.9, quality: "high", lowConfidenceGroups: [],
    groups: { torso: 1, leftArm: 1, rightArm: 1, leftLeg: 1, rightLeg: 1 },
    joints: { leftShoulder: 1, rightShoulder: 1, leftElbow: 1, rightElbow: 1, leftWrist: 1, rightWrist: 1,
      leftHip: 1, rightHip: 1, leftKnee: 1, rightKnee: 1, leftAnkle: 1, rightAnkle: 1 } },
};

async function ready(f: ReturnType<typeof fixture>) {
  await waitFor(() => expect(f.hook.result.current.authoring.hydrated).toBe(true));
}

describe("손가락·사진·웹캠 UI 입력의 V3 연결", () => {
  it("영어에서는 손가락 편집 이력에 등록된 영어 문구를 사용한다", async () => {
    const previous = useI18n.getState().lang;
    act(() => { useI18n.setState({ lang: "en" }); });
    try {
      const f = fixture(); await ready(f);
      act(() => { f.hook.result.current.input.updateFingerCurl("left", 35, "index"); });
      expect(f.hook.result.current.authoring.snapshot.recentLabels[0]).toBe("Finger curl");
    } finally {
      act(() => { useI18n.setState({ lang: previous }); });
    }
  });
  it("손가락 원본이 생략된 이전 문서도 undo·redo에서 호환 저장값까지 복원한다", async () => {
    const f = fixture(true); await ready(f);
    const baseline = f.hook.result.current.native.fingerEdits;
    act(() => { f.hook.result.current.input.updateFingerCurl("left", 35, "index"); });
    expect(readStudioVrmFingerCurlDegrees(f.hook.result.current.native.fingerEdits, "left", "index")).toBe(35);
    act(() => { f.hook.result.current.authoring.undo(); });
    expect(f.hook.result.current.native.fingerEdits).toEqual(baseline);
    act(() => { f.hook.result.current.authoring.redo(); });
    expect(readStudioVrmFingerCurlDegrees(f.hook.result.current.native.fingerEdits, "left", "index")).toBe(35);
  });
  it("손가락 슬라이더가 이력 한 건을 만들고 undo·redo·저장 복원에서 표시값도 돌아온다", async () => {
    const f = fixture(); await ready(f);
    const before = f.hook.result.current.authoring.snapshot.document;
    const curl = () => readStudioVrmFingerCurlDegrees(f.hook.result.current.input.fingerEdits, "left", "index");
    act(() => { f.hook.result.current.input.updateFingerCurl("left", 35, "index"); });
    const edited = f.hook.result.current.authoring.snapshot.document.pose;
    expect(f.host.updateFingerCurl).not.toHaveBeenCalled();
    expect(f.vrm.humanoid.getNormalizedBoneNode("leftIndexProximal")?.quaternion.toArray()).toEqual(before.pose.bones.leftIndexProximal);
    expect(edited.bones.leftMiddleProximal).toEqual(before.pose.bones.leftMiddleProximal);
    expect(edited.bones.rightIndexProximal).toEqual(before.pose.bones.rightIndexProximal);
    expect(f.hook.result.current.authoring.snapshot.historyLength).toBe(1);
    expect(f.hook.result.current.authoring.snapshot.canUndo).toBe(true);
    expect(curl()).toBe(35);
    act(() => { f.hook.result.current.authoring.undo(); });
    expect(f.hook.result.current.authoring.snapshot.document.pose).toEqual(before.pose);
    expect(curl()).toBe(0);
    act(() => { f.hook.result.current.authoring.redo(); });
    expect(f.hook.result.current.authoring.snapshot.document.pose).toEqual(edited);
    expect(curl()).toBe(35);
    await act(async () => { expect(await f.hook.result.current.authoring.saveNow()).toBe(true); });
    f.hook.unmount();
    const restored = renderHook(() => {
      const authoring = useCharacterAuthoringAuthority(f.initial, "input-test", {
        repository: f.repository, autosave: false, synchronizeProjection: false,
      });
      return { authoring, input: useCharacterAuthoringInputs(f.host, authoring, true) };
    });
    await waitFor(() => expect(restored.result.current.authoring.hydrated).toBe(true));
    // JSON 저장은 -0을 0으로 정규화하므로 저장 형식 전체를 비교한다.
    expect(JSON.stringify(restored.result.current.authoring.snapshot.document.pose)).toBe(JSON.stringify(edited));
    expect(readStudioVrmFingerCurlDegrees(restored.result.current.input.fingerEdits, "left", "index")).toBe(35);
  });
  it("같은 값과 잠긴 손가락은 이력을 만들지 않고 새 편집은 redo를 지운다", async () => {
    const f = fixture(); await ready(f);
    act(() => { f.hook.result.current.input.updateFingerCurl("left", 0, "index"); });
    expect(f.hook.result.current.authoring.snapshot.historyLength).toBe(0);
    for (const value of [20, 40, 15]) act(() => { f.hook.result.current.input.updateFingerCurl("left", value, "index"); });
    expect(f.hook.result.current.authoring.snapshot.historyLength).toBe(3);
    act(() => { f.hook.result.current.authoring.undo(); });
    expect(readStudioVrmFingerCurlDegrees(f.hook.result.current.input.fingerEdits, "left", "index")).toBe(40);
    act(() => { f.hook.result.current.input.updateFingerCurl("left", 10, "index"); });
    expect(f.hook.result.current.authoring.snapshot.canRedo).toBe(false);
    f.hook.rerender({ h: { ...f.host, lockedPoseBones: ["leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal"] } });
    const before = f.hook.result.current.authoring.snapshot.document;
    act(() => { f.hook.result.current.input.updateFingerCurl("left", 60, "index"); });
    expect(f.hook.result.current.authoring.snapshot.document).toBe(before);
  });
  it("웹캠 미리보기의 손가락을 저장된 원본으로 덮어쓰지 않는다", async () => {
    const f = fixture(); await ready(f);
    act(() => { f.hook.result.current.input.updateFingerCurl("left", 35, "index"); });
    const before = f.hook.result.current.authoring.snapshot.document;
    const tracked = { leftIndexProximal: [0, 0, -0.9] as const };
    const setter = vi.fn();
    f.hook.rerender({ h: { ...f.host, webcamActive: true, fingerEdits: tracked, setFingerEdits: setter } });
    expect(f.hook.result.current.input.fingerEdits).toBe(tracked);
    expect(setter).not.toHaveBeenCalled();
    act(() => { f.hook.result.current.input.updateFingerCurl("left", 60, "index"); });
    expect(f.hook.result.current.authoring.snapshot.document).toBe(before);
  });
  it("사진 입력이 문서에 먼저 반영되고 한 번의 undo·redo와 저장·복원으로 유지된다", async () => {
    const f = fixture(); await ready(f);
    const before = f.hook.result.current.authoring.snapshot.document;
    act(() => { expect(f.hook.result.current.input.handlePhotoPoseApply(payload)).toBe(true); });
    const pose = f.hook.result.current.authoring.snapshot.document.pose;
    expect(pose.source).toBe("photo");
    expect(pose.bones.leftIndexProximal).not.toEqual(before.pose.bones.leftIndexProximal);
    expect(f.vrm.humanoid.getNormalizedBoneNode("leftUpperArm")?.quaternion.toArray()).toEqual(before.pose.bones.leftUpperArm);
    expect(f.hook.result.current.authoring.snapshot.historyLength).toBe(1);
    act(() => { f.hook.result.current.authoring.undo(); });
    expect(f.hook.result.current.authoring.snapshot.document.pose).toEqual(before.pose);
    act(() => { f.hook.result.current.authoring.redo(); });
    expect(f.hook.result.current.authoring.snapshot.document.pose).toEqual(pose);
    await act(async () => { expect(await f.hook.result.current.authoring.saveNow()).toBe(true); });
    f.hook.unmount();
    const restored = renderHook(() => useCharacterAuthoringAuthority(f.initial, "input-test", {
      repository: f.repository, autosave: false, synchronizeProjection: false,
    }));
    await waitFor(() => expect(restored.result.current.hydrated).toBe(true));
    expect(restored.result.current.snapshot.document.pose).toEqual(pose);
  });
  it("웹캠의 실제 뼈대와 표정을 함께 확정하고 중지한다", async () => {
    const f = fixture(); await ready(f);
    f.vrm.humanoid.getNormalizedBoneNode("rightUpperArm")?.rotation.set(0.1, 0.2, 0.3);
    f.hook.rerender({ h: { ...f.host, webcamActive: true, trackingDataRef: { current: { expressions: { happy: 0.8 } } } } });
    act(() => { expect(f.hook.result.current.input.handleCapturePose()).toBe(true); });
    expect(f.hook.result.current.authoring.snapshot.document.pose.source).toBe("webcam");
    expect(f.hook.result.current.authoring.snapshot.document.expression.weights.happy).toBe(0.8);
    expect(f.host.setWebcamActive).toHaveBeenCalledWith(false);
    expect(f.hook.result.current.authoring.snapshot.historyLength).toBe(1);
    act(() => { f.hook.result.current.authoring.undo(); });
    expect(f.hook.result.current.authoring.snapshot.document.expression.weights.happy).toBeUndefined();
  });
  it.each([{ isCapturing: true }, { isSharingPose: true }, { persistentIkReconciling: true }, { activeModelId: "other" }])("사용할 수 없는 상태 %j에서는 문서를 변경하지 않는다", async (patch) => {
    const f = fixture(); await ready(f);
    f.hook.rerender({ h: { ...f.host, ...patch } });
    const before = f.hook.result.current.authoring.snapshot.document;
    act(() => { expect(f.hook.result.current.input.handlePhotoPoseApply(payload)).toBe(false); });
    act(() => { f.hook.result.current.input.updateFingerCurl("left", 35, "index"); });
    expect(f.hook.result.current.authoring.snapshot.document).toBe(before);
    expect(f.hook.result.current.authoring.snapshot.historyLength).toBe(0);
    expect(f.host.setJointHandleStatus).toHaveBeenCalled();
  });
  it("이전 VRM 인스턴스의 늦은 결과를 새 모델에 적용하지 않는다", async () => {
    const f = fixture(); await ready(f);
    const staleApply = f.hook.result.current.input.handlePhotoPoseApply;
    f.hook.rerender({ h: { ...f.host, vrm: createAuthoringPoseVrm() } });
    act(() => { expect(staleApply(payload)).toBe(false); });
    expect(f.hook.result.current.authoring.snapshot.historyLength).toBe(0);
    expect(f.host.setJointHandleStatus).toHaveBeenLastCalledWith(expect.stringContaining("이전 캐릭터"));
  });
});
