import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { getCharacterDocumentV3Repository } from "../character-platform/document/character-document-v3-repository";
import { linkedCutCameraMatches, readLinkedCutPngSize } from "../vrm/studio-vrm-linked-cut-frame";

import type { useCharacterPlatformWorkbench } from "../character-platform/ui/use-character-platform-workbench";
import type { StudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { StudioVrmProjectionAttachmentStatus } from "../vrm/StudioVrmWardrobePropsProjection";

export interface LinkedCutCaptureRequest {
  readonly documentId: string;
  readonly revision: number;
  readonly onFailure: (reason: string) => void;
}

type Workbench = ReturnType<typeof useCharacterPlatformWorkbench>;
type Props = {
  request?: LinkedCutCaptureRequest;
  scene?: StudioVrmSceneDocument;
  src?: string;
  documentId?: string;
  h: StudioVrmPoserHost;
  controller: Workbench;
};

export function useLinkedCutCapture(props: Props) {
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const propReceipts = useRef(new Map<string, string>());
  const wardrobeReceipts = useRef(new Map<string, string>());
  const onLinkedCutPropStatus = useCallback((uid: string, propId: string, status: StudioVrmProjectionAttachmentStatus) => {
    if (status === "ready") propReceipts.current.set(uid, propId);
    else propReceipts.current.delete(uid);
  }, []);
  const onLinkedCutWardrobeStatus = useCallback((slot: string, itemId: string, status: StudioVrmProjectionAttachmentStatus) => {
    if (status === "ready") wardrobeReceipts.current.set(slot, itemId);
    else wardrobeReceipts.current.delete(slot);
  }, []);
  const attachmentsReady = useCallback((h: StudioVrmPoserHost) =>
    (h.vrmPropItems ?? []).every((item: { uid: string; propId: string }) => propReceipts.current.get(item.uid) === item.propId)
    && Object.entries(h.wardrobeState ?? {}).every(([slot, value]) =>
      !value || wardrobeReceipts.current.get(slot) === (value as { itemId: string }).itemId), []);

  const active = useRef<{ started: boolean } | null>(null);
  const documentId = props.request?.documentId;
  const revision = props.request?.revision;
  const { scene, src } = props;

  useEffect(() => {
    if (!documentId || revision === undefined) return;
    const ticket = { started: false };
    active.current = ticket;
    let frame = 0;
    let stableFrames = 0;
    let waitingFor = "저장한 컷의 3D 장면";
    function fail(reason: string) {
      if (active.current !== ticket) return;
      active.current = null;
      latest.current.request?.onFailure(reason);
    }
    const pixels = readLinkedCutPngSize(src);
    const tick = () => {
      if (active.current !== ticket) return;
      const { h, controller, documentId: boundId } = latest.current;
      const { authoring } = controller;
      if (!scene || scene.characterDocumentId !== documentId || !pixels) {
        fail("저장된 컷의 캐릭터 연결 또는 원본 PNG 크기를 확인할 수 없습니다.");
        return;
      }
      if (h.status === "error" || (ticket.started && h.error) || authoring.persistenceError) {
        fail(authoring.persistenceError || h.error || "저장한 3D 장면을 다시 그릴 수 없습니다.");
        return;
      }
      if (!ticket.started) {
        const doc = authoring.authority.getSnapshot().document;
        if (authoring.hydrated && boundId === documentId && doc.documentId === documentId && doc.revision !== revision) {
          fail("캐릭터 원본이 바뀌어 이 컷의 갱신을 중단했습니다.");
          return;
        }
        const capture = h.captureRef?.current;
        const root = h.vrm?.scene;
        const attached = root && capture?.scene?.getObjectById(root.id) === root;
        const restored = boundId === documentId && authoring.hydrated && doc.documentId === documentId && doc.revision === revision;
        const problem = controller.hostRuntime.error ?? controller.poseRuntime.runtimeError;
        if (restored && (problem || controller.hostRuntime.unsupported.length || doc.surfaceInk.layers.some(layer => layer.strokes.length))) {
          fail(problem || "현재 3D 화면에서 표면 펜선 또는 외부 아틀라스 복원을 확인할 수 없습니다.");
          return;
        }
        const complete = restored && !controller.binding.busyReason && !authoring.snapshot.previewDocument
          && !h.vrmContextLost && h.status === "ready" && attached && capture.gl && capture.camera
          && h.pendingCameraRestoreFrameRef?.current == null && !h.pendingPoseDataRef?.current
          && linkedCutCameraMatches(scene.camera, h.viewportApiRef?.current?.readCamera() ?? null)
          && attachmentsReady(h);
        waitingFor = controller.binding.busyReason || (!attachmentsReady(h) ? "헤어·의상·소품 장착" : "캐릭터와 컷 카메라 복원");
        stableFrames = complete ? stableFrames + 1 : 0;
        if (stableFrames >= 2) {
          ticket.started = true;
          waitingFor = "컷 PNG 렌더링";
          h.handleLinkedCutInsert({ source: scene, pixels });
        } else if (restored) {
          // Demand-driven R3F attachments and two-hand grips need an actual viewport tick.
          h.texturePaintInvalidateRef?.current?.();
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const deadline = window.setTimeout(() => fail(waitingFor + " 시간이 초과되어 기존 컷을 보존했습니다."), 60_000);
    return () => {
      if (active.current === ticket) active.current = null;
      cancelAnimationFrame(frame);
      window.clearTimeout(deadline);
    };
  }, [attachmentsReady, documentId, revision, scene, src]);

  const admitOutput = useCallback(async () => {
    const ticket = active.current;
    const { request, controller, h } = latest.current;
    if (!ticket?.started || !request) return false;
    const stored = await getCharacterDocumentV3Repository().load(request.documentId);
    const now = latest.current;
    const current = now.controller.authoring.authority.getSnapshot();
    return active.current === ticket && now.scene === scene && now.documentId === request.documentId
      && now.request?.revision === request.revision && now.h.vrm === h.vrm && now.controller.authoring.authority === controller.authoring.authority
      && stored?.revision === request.revision && stored.documentId === request.documentId && stored.model.assetId === current.document.model.assetId
      && current.document.documentId === request.documentId && current.document.revision === request.revision
      && !current.previewDocument && attachmentsReady(now.h);
  }, [attachmentsReady, scene]);

  return { admitOutput, onLinkedCutPropStatus, onLinkedCutWardrobeStatus };
}
