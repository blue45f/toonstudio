import { VRM } from "@pixiv/three-vrm";
import { Quaternion } from "three";
import { useEffect, useMemo, useRef } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { getStudioHumanoidBoneDescriptor, isStudioHumanoidBoneName } from "../../studio-humanoid-bones";
import { assertCharacterPoseConstraintAdmission } from "../runtime/character-pose-constraint-admission";
import { clampStudioVrmJointDegrees } from "../../vrm/studio-vrm-pose-editing";
import { createStudioVrmFingerCurlPose } from "../../vrm/studio-vrm-hand-poses";
import { captureCharacterPoseRuntimeV3 } from "../pose-v3/character-pose-runtime-adapter";
import { validateCharacterDocumentV3 } from "../document/character-document-v3";
import { planCharacterPoseAuthoringInput } from "../runtime/character-pose-authoring-input";
import { projectCharacterFingerAuthoringEdits } from "../runtime/character-finger-authoring-projection";

import type { CharacterDocumentV3 } from "../document/character-document-v3";
import type { CharacterAuthoringAuthorityHookResult } from "./use-character-authoring-authority";
import type { StudioVrmPhotoPoseApplyPayload } from "../../vrm/StudioVrmPhotoPoseScanner";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import type { StudioVrmFingerName } from "../../vrm/studio-vrm-finger-curl";
import type { FingerRotationMap } from "../../vrm/studio-vrm-poser-utils";

/** 손가락·사진·추적 확정은 호스트를 먼저 변경하지 않고 V3 명령으로 들어온다. */
export function useCharacterAuthoringInputs(h: StudioVrmPoserHost, authoring: CharacterAuthoringAuthorityHookResult, enabled: boolean): StudioVrmPoserHost {
  const bt = useBilingual("CharacterAuthoringInputs");
  const latest = useRef({ h, authoring, enabled });
  latest.current = { h, authoring, enabled };
  const sequence = useRef(0);
  const baseline = useRef<{ owner: typeof authoring.authority; vrm: unknown; fingers: FingerRotationMap | undefined; ready: boolean }>({
    owner: authoring.authority, vrm: h.vrm, fingers: h.fingerEdits, ready: false,
  });
  if (!enabled || !baseline.current.ready || baseline.current.owner !== authoring.authority || baseline.current.vrm !== h.vrm) {
    baseline.current = { owner: authoring.authority, vrm: h.vrm, fingers: h.fingerEdits, ready: h.status === "ready" };
  }
  const notice = (message: string) => {
    const setter: unknown = latest.current.h.setJointHandleStatus;
    if (typeof setter === "function") setter(message);
  };
  const context = (tracking = false) => {
    const current = latest.current;
    const host = current.h;
    if (current.authoring.authority !== authoring.authority || host.vrm !== h.vrm) throw new Error("이전 캐릭터의 입력 결과입니다. 현재 캐릭터에서 다시 시도해 주세요.");
    const snapshot = current.authoring.authority.getSnapshot();
    if (!current.enabled || !current.authoring.hydrated || host.status !== "ready" || !(host.vrm instanceof VRM)
      || snapshot.previewDocument || host.isCapturing || host.isSharingPose || host.isThumbnailCapturing
      || (!tracking && host.webcamActive) || host.persistentIkReconciling
      || host.jointIkTransactionRef?.current || host.pendingPersistentIkCommandRef?.current
      || typeof host.texturePaintSnapshotRef?.current?.activePointerId === "number"
      || (typeof host.activeModelId === "string" && host.activeModelId !== snapshot.document.model.assetId)) {
      throw new Error("현재 작업과 미리보기를 마친 뒤 준비된 캐릭터에 적용해 주세요.");
    }
    return { host, source: host.vrm, owner: current.authoring, document: snapshot.document };
  };
  const withCustomHands = (document: CharacterDocumentV3, pose: CharacterDocumentV3["pose"], side?: "left" | "right"): CharacterDocumentV3 => {
    const handPose = { ...document.recipe.handPose };
    for (const [name, rotation] of Object.entries(pose.bones)) {
      if (!isStudioHumanoidBoneName(name) || getStudioHumanoidBoneDescriptor(name).region !== "finger") continue;
      if (side && !name.startsWith(side)) continue;
      const before = document.pose.bones[name];
      if (before && new Quaternion(...before).angleTo(new Quaternion(...rotation)) <= 1e-6) continue;
      delete handPose[name.startsWith("left") ? "left" : "right"];
    }
    return { ...document, recipe: { ...document.recipe, handPose }, pose };
  };
  const commit = (owner: CharacterAuthoringAuthorityHookResult, document: CharacterDocumentV3, label: string) => {
    const result = owner.dispatch({
      commandId: `character.input/${++sequence.current}`, label, source: "user",
      expectedDocumentId: document.documentId, expectedRevision: document.revision,
      operations: [{ kind: "restore-document", document: validateCharacterDocumentV3(document) }],
    });
    if (result.status !== "applied" && result.status !== "noop") throw new Error(result.reason ?? "입력을 적용하지 못했습니다.");
    notice(`${label}을 적용했습니다. 실행 취소로 이전 상태를 복원할 수 있습니다.`);
    return true;
  };
  const photo = (payload: StudioVrmPhotoPoseApplyPayload): boolean => {
    try {
      const current = context();
      const pose = planCharacterPoseAuthoringInput({ source: current.source, previous: current.document.pose,
        kind: "photo", bones: payload.bones, fingers: payload.fingerEdits, yOffset: payload.yOffset,
        confidence: payload.confidence.overall, lockedBones: current.host.lockedPoseBones,
        clampRotation: current.host.jointLimitsEnabled ? (bone, axis, radians) =>
          clampStudioVrmJointDegrees(bone, axis, radians * 180 / Math.PI) * Math.PI / 180 : undefined,
      });
      return commit(current.owner, withCustomHands(current.document, pose), "사진 포즈");
    } catch (error) {
      notice(error instanceof Error ? error.message : "사진 포즈를 적용하지 못했습니다.");
      return false;
    }
  };
  const curl = (side: "left" | "right", degrees: number, finger?: StudioVrmFingerName): void => {
    try {
      const current = context();
      const fingers = createStudioVrmFingerCurlPose(side, degrees, finger);
      const pose = planCharacterPoseAuthoringInput({ source: current.source, previous: current.document.pose,
        kind: "manual", bones: {}, fingers,
        lockedBones: current.host.lockedPoseBones,
        clampRotation: current.host.jointLimitsEnabled ? (bone, axis, radians) =>
          clampStudioVrmJointDegrees(bone, axis, radians * 180 / Math.PI) * Math.PI / 180 : undefined,
      });
      const changed = Object.keys(fingers).some((name) => {
        if (!isStudioHumanoidBoneName(name)) return false;
        const next = pose.bones[name];
        const before = current.document.pose.bones[name];
        const rotation = before ? new Quaternion(...before) : current.source.humanoid.getNormalizedBoneNode(name)?.quaternion;
        return next && rotation && rotation.angleTo(new Quaternion(...next)) > 1e-6;
      });
      if (!changed) return;
      commit(current.owner, withCustomHands(current.document, pose, side), bt("손가락 굽힘", "Finger curl"));
    } catch (error) {
      notice(error instanceof Error ? error.message : bt("손가락 굽힘을 적용하지 못했습니다.", "Could not apply finger curl."));
    }
  };
  const capture = (): boolean => {
    try {
      const current = context(true);
      if (!current.host.webcamActive || !current.host.trackingDataRef?.current) throw new Error("확정할 웹캠 추적 결과가 없습니다.");
      const observed = captureCharacterPoseRuntimeV3({ source: current.source, includeFingers: true,
        poseId: `webcam:${current.document.pose.generationId + 1}`, generationId: current.document.pose.generationId + 1 });
      const data: unknown = current.host.trackingDataRef.current;
      const raw: unknown = data && typeof data === "object" && "expressions" in data ? data.expressions : {};
      const weights = raw && typeof raw === "object" ? Object.fromEntries(Object.entries(raw).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0 && entry[1] <= 1,
      )) : {};
      const pose: CharacterDocumentV3["pose"] = { ...current.document.pose, ...observed, source: "webcam",
        contacts: current.document.pose.contacts, effectors: current.document.pose.effectors,
        fixedControllers: current.document.pose.fixedControllers, regionWeights: current.document.pose.regionWeights,
        stylization: current.document.pose.stylization };
      assertCharacterPoseConstraintAdmission(current.source, current.document.pose, pose);
      const accepted = commit(current.owner, { ...withCustomHands(current.document, pose),
        expression: { ...current.document.expression, activeEntryId: null, weights: { ...current.document.expression.weights, ...weights } },
      }, "웹캠 포즈와 표정");
      if (accepted && typeof current.host.setWebcamActive === "function") current.host.setWebcamActive(false);
      return accepted;
    } catch (error) {
      notice(error instanceof Error ? error.message : "웹캠 포즈를 확정하지 못했습니다.");
      return false;
    }
  };
  // 슬라이더도 같은 원본을 읽어야 undo·redo가 실제 뼈대와 표시값을 함께 복원한다.
  const pose = (authoring.snapshot.previewDocument ?? authoring.snapshot.document).pose;
  const source = h.vrm;
  const fallback = baseline.current.fingers;
  const tracking = Boolean(h.webcamActive);
  const projection = useMemo(() => {
    try {
      return { fingers: enabled && !tracking && authoring.hydrated && source instanceof VRM
        ? projectCharacterFingerAuthoringEdits(source, pose, fallback ?? {}) : null, error: null };
    } catch (error) {
      return { fingers: null, error: error instanceof Error ? error.message : bt("손가락 굽힘을 적용하지 못했습니다.", "Could not apply finger curl.") };
    }
  }, [enabled, tracking, authoring.hydrated, source, pose, fallback, bt]);
  const { fingers } = projection;
  const setFingerEdits: unknown = h.setFingerEdits;
  const setJointHandleStatus: unknown = h.setJointHandleStatus;
  useEffect(() => {
    if (projection.error && typeof setJointHandleStatus === "function") setJointHandleStatus(projection.error);
    if (!fingers || typeof setFingerEdits !== "function" || JSON.stringify(h.fingerEdits ?? {}) === JSON.stringify(fingers)) return;
    setFingerEdits(fingers);
  }, [fingers, projection.error, setFingerEdits, setJointHandleStatus, h.fingerEdits]);
  return enabled ? { ...h, fingerEdits: fingers ?? h.fingerEdits, updateFingerCurl: curl,
    handlePhotoPoseApply: photo, handleCapturePose: capture } : h;
}
