import { readGenericWorkflowMapsFromAttachments } from "../bg3d/studio-bg3d-model-runtime-admission";
import {
  prepareStudioScene3dCutAssets,
  type StudioScene3dCutAssetPreparation,
  type StudioScene3dPreparedCutAssets,
} from "./studio-scene3d-cut-assets";
import { applyOrDeferStudioBg3dHistoryCamera } from "../bg3d/studio-bg3d-camera-history-transition";
import { isStudioBg3dSceneEditReady } from "../bg3d/studio-bg3d-scene-edit-readiness";
import {
  isStudioBg3dPhysicsTransientPhase,
  type StudioBg3dPhysicsPhase,
} from "../bg3d/studio-bg3d-physics-ui";
import {
  createStudioScene3dAuthority,
  projectStudioScene3dAuthorityToSources,
} from "./studio-scene3d-authority";
import { hashStudioScene3dCommandState } from "./studio-scene3d-command-core";
import {
  materializeStudioScene3dVersionedCut,
  parseStudioScene3dCutSource,
} from "./studio-scene3d-shot-versions";
import type { StudioScene3dCutHost } from "./studio-scene3d-cut-session";
import { hydrateStudioBg3dDocumentToRuntime } from "../bg3d/studio-bg3d-scene-runtime";
import {
  createStudioBg3dHistorySnapshot,
  resolveDeviceQuality,
  type StudioBg3dHistorySnapshot,
} from "../bg3d/studio-bg3d-editor-derivations";
import {
  parseStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
  type StudioBg3dCameraSettings,
} from "../bg3d/studio-bg3d-scene-document";
import type { StudioBg3dCanonicalDocumentMutation } from "../bg3d/useStudioBg3dCanonicalDocumentState";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { StudioShared3dCharacterSource, StudioShared3dSceneSession } from "../studio-shared-3d-scene-bridge";

export interface StudioScene3dCutBg3dEditorHost {
  readonly setGenericModelSourceFormats?: (
    value: ReturnType<
      typeof readGenericWorkflowMapsFromAttachments
    >["sourceFormats"]
  ) => void;
  readonly setGenericModelClassifications?: (
    value: ReturnType<
      typeof readGenericWorkflowMapsFromAttachments
    >["classifications"]
  ) => void;
  readonly open: boolean;
  readonly modelRenderer?: StudioScene3dCutAssetPreparation["renderer"];
  readonly materialBackend?: StudioScene3dCutAssetPreparation["materialBackend"];
  readonly isMaterialBackendCurrent?: () => boolean;
  readonly modelRootCacheRef?: {
    current: StudioScene3dCutAssetPreparation["cache"];
  };
  readonly viewportHostRef?: { readonly current: HTMLElement | null };
  readonly physicsRuntimeSourceRef?: {
    readonly current: { readonly revision: number };
  };
  readonly attachmentByStorageModelIdRef?: {
    current: Map<string, StudioBg3dSceneDocument["attachments"][number]>;
  };
  readonly modalAssetSessionRef?: { readonly current: unknown };
  readonly physicsPhaseRef?: { readonly current: StudioBg3dPhysicsPhase };
  readonly physicsInteractionLocked?: boolean;
  readonly captureInFlightRef?: { readonly current: boolean };
  readonly sceneRestoreAbortRef?: { readonly current: AbortController | null };
  readonly modelImportAbortRef?: { readonly current: AbortController | null };
  readonly destructiveMutationGuardRef?: {
    readonly current: { readonly blocksClose: boolean };
  };
  readonly placementSessionRef?: {
    readonly current: { readonly phase: string };
  };
  readonly deletingModelId?: string | null;
  readonly isRestoringScene?: boolean;
  readonly isCapturing?: boolean;
  readonly isBatchRenderingShots?: boolean;
  readonly isTransforming?: boolean;
  readonly placementActive?: boolean;
  readonly applyingTemplateId?: string | null;
  readonly sharedStageSessionScopeKey?: string | null;
  readonly sharedSceneSession?: Pick<StudioShared3dSceneSession, "characters"> | null;
  readonly sharedCharacters?: readonly StudioShared3dCharacterSource[];
  readonly liveSharedSceneSession?: Pick<StudioShared3dSceneSession, "characters"> | null;
  readonly cutTeamDocument?: boolean;
  readonly cutWorkId?: string;
  readonly cutWorkResources?: import("./studio-team-vrm-cut-assets").StudioTeamVrmCutResources;
  readonly cutDocumentKey?: string;
  readonly targetHasLinkedCharacters?: boolean;
  readonly includeSharedCharactersInCapture?: boolean;
  readonly viewportBoxSize?: {
    readonly width: number;
    readonly height: number;
  };
  readonly sceneBaseDocument: StudioBg3dSceneDocument;
  readonly primitives: BgPrimitive[];
  readonly customModels: BgCustomModelInstance[];
  readonly storageModelIdByAttachmentIdRef: { current: Map<string, string> };
  readonly pendingInitialCameraRef: {
    current: StudioBg3dCameraSettings | null;
  };
  readonly viewportApiRef: {
    current: { applyView(camera: StudioBg3dCameraSettings): boolean } | null;
  };
  readCurrentCanonicalSceneForShot(): StudioBg3dSceneDocument | null;
  replaceCanonicalDocumentState(
    mutation: StudioBg3dCanonicalDocumentMutation
  ): unknown;
  commitImmediateHistoryTransition(
    primitives: readonly BgPrimitive[],
    models: readonly BgCustomModelInstance[],
    document: StudioBg3dSceneDocument,
    before: StudioBg3dHistorySnapshot,
    options: {
      commandId: string;
      label: string;
      source: "inspector";
      preserveBeforeCamera: boolean;
    }
  ): void;
  setLineArtPreview(value: boolean): void;
}
export function isStudioScene3dCutBg3dHost(
  value: unknown
): value is StudioScene3dCutBg3dEditorHost {
  if (value === null || typeof value !== "object") return false;
  return (
    "readCurrentCanonicalSceneForShot" in value &&
    typeof value.readCurrentCanonicalSceneForShot === "function" &&
    "replaceCanonicalDocumentState" in value &&
    typeof value.replaceCanonicalDocumentState === "function" &&
    "commitImmediateHistoryTransition" in value &&
    typeof value.commitImmediateHistoryTransition === "function" &&
    "setLineArtPreview" in value &&
    typeof value.setLineArtPreview === "function" &&
    "sceneBaseDocument" in value &&
    "storageModelIdByAttachmentIdRef" in value &&
    "viewportApiRef" in value &&
    "pendingInitialCameraRef" in value &&
    "primitives" in value &&
    "customModels" in value &&
    "open" in value
  );
}
/** 모드가 바뀌어도 같은 편집 호스트의 프로젝트 식별자를 유지한다. */
const anonymousIds = new WeakMap<object, string>();
export function studioScene3dCutProjectId(
  h: StudioScene3dCutBg3dEditorHost
): string {
  const pinned =
    h.sceneBaseDocument.pinnedVersionedCut?.source.scene.documentId;
  if (pinned) return pinned;
  if (h.sharedStageSessionScopeKey)
    return `cuts:${hashStudioScene3dCommandState({
      scope: h.sharedStageSessionScopeKey,
    })}`;
  // 독립 BG3D 페이지는 URL별 전용 작업 문서이며 다른 임시 modal과 공유하지 않는다.
  if (
    typeof window !== "undefined" &&
    /\/bg3d\/?$/u.test(window.location.pathname)
  )
    return `cuts:${hashStudioScene3dCommandState({
      path: window.location.pathname,
      query: window.location.search,
    })}`;
  let id = anonymousIds.get(h);
  if (!id) {
    id = `cuts:${crypto.randomUUID()}`;
    anonymousIds.set(h, id);
  }
  return id;
}
export function createStudioScene3dCutBg3dHost(
  h: StudioScene3dCutBg3dEditorHost
): StudioScene3dCutHost {
  const projectId = studioScene3dCutProjectId(h);
  const assetSession = h.modalAssetSessionRef?.current;
  const documentScope = h.cutDocumentKey, teamDocument = h.cutTeamDocument;
  const materialBackend = h.materialBackend, modelRenderer = h.modelRenderer, isMaterialBackendCurrent = h.isMaterialBackendCurrent;
  const invalidationReason = () => {
    if (documentScope !== h.cutDocumentKey || teamDocument !== h.cutTeamDocument) return "원고 또는 팀 접근 범위가 바뀌어 컷 작업을 중단했습니다.";
    if (isMaterialBackendCurrent?.() === false || h.materialBackend !== materialBackend || h.modelRenderer !== modelRenderer)
      return "표시 엔진이 바뀌어 이전 컷 준비를 중단했습니다.";
    if (h.modalAssetSessionRef?.current !== assetSession)
      return "편집 세션이 바뀌어 이전 컷 작업을 중단했습니다.";
    if (studioScene3dCutProjectId(h) !== projectId)
      return "다른 편집 세션으로 이동해 이전 컷 작업을 중단했습니다.";
    return null;
  };
  const blockedReason = () => {
    const stale = invalidationReason();
    if (stale) return stale;
    if (
      !isStudioBg3dSceneEditReady({
        open: h.open,
        modelRenderer: h.modelRenderer,
        isRestoringScene: Boolean(h.isRestoringScene),
      })
    )
      return "장면 복원과 렌더러 준비를 마친 뒤 컷을 편집하세요.";
    if (
      !h.open ||
      h.isRestoringScene ||
      h.isCapturing ||
      h.isBatchRenderingShots ||
      h.isTransforming ||
      h.placementActive ||
      h.applyingTemplateId ||
      h.physicsInteractionLocked ||
      h.captureInFlightRef?.current ||
      h.sceneRestoreAbortRef?.current ||
      h.modelImportAbortRef?.current ||
      h.destructiveMutationGuardRef?.current.blocksClose ||
      h.placementSessionRef?.current.phase === "preview" ||
      h.deletingModelId ||
      (h.physicsPhaseRef &&
        isStudioBg3dPhysicsTransientPhase(h.physicsPhaseRef.current))
    )
      return "장면 복원·출력·변형 작업을 마친 뒤 컷을 편집하세요.";
    // 같은 원고의 캐릭터는 연결 전에도 미리보기 후보로 나타난다. 배경만 고정할 때는 후보를 제외한다.
    const pinned = h.sceneBaseDocument.pinnedVersionedCut?.source.linkedVrm;
    if (pinned || h.targetHasLinkedCharacters || (h.sharedSceneSession?.characters.length && h.includeSharedCharactersInCapture !== false)) {
      if (h.cutTeamDocument && !h.cutWorkId) return "작품 파일 저장 권한을 확인한 뒤 연결 VRM 컷을 고정하거나 복원할 수 있습니다.";
      if (!h.cutDocumentKey || (pinned && pinned.documentScope !== h.cutDocumentKey))
        return "연결 VRM을 고정한 원고와 페이지를 확인할 수 없습니다. 해당 원고에서 컷을 열어 주세요.";
    }
    return null;
  };
  const aspect = () =>
    h.viewportBoxSize && h.viewportBoxSize.height > 0
      ? h.viewportBoxSize.width / h.viewportBoxSize.height
      : undefined;
  return {
    projectId,
    blockedReason,
    invalidationReason,
    readRevision: () => {
      const revision = h.physicsRuntimeSourceRef?.current.revision ?? h.sceneBaseDocument;
      const actors = h.sharedCharacters ?? h.sharedSceneSession?.characters;
      return actors?.length ? hashStudioScene3dCommandState({
        revision, actors: actors.map(({ sourceHash, placementHash }) => [sourceHash, placementHash]),
      }) : revision;
    },
    async verifySources(sources, signal) {
      const snapshots = sources.flatMap(source => source.linkedVrm ? [source.linkedVrm] : []);
      if (!snapshots.length) return;
      const { verifyStudioScene3dCutVrmAssets } = await import("./studio-scene3d-cut-vrm-assets");
      const verified = new Set<string>();
      for (const snapshot of snapshots) {
        const reason = invalidationReason();
        if (reason || (h.cutTeamDocument && !h.cutWorkId) || snapshot.documentScope !== h.cutDocumentKey)
          throw new Error(reason ?? "다른 원고나 팀 원고의 고정 VRM을 현재 컷 보관함에 쓸 수 없습니다.");
        const hash = hashStudioScene3dCommandState(snapshot);
        if (!verified.has(hash)) await verifyStudioScene3dCutVrmAssets(snapshot, signal, h.cutWorkResources);
        verified.add(hash);
      }
      const reason = invalidationReason();
      if (reason) throw new Error(reason);
    },
    readPinnedCut: () => h.sceneBaseDocument.pinnedVersionedCut ?? null,
    readSource(previous, refreshLinked = false) {
      const reason = blockedReason();
      if (reason) throw new Error(reason);
      const current = h.readCurrentCanonicalSceneForShot();
      if (!current) throw new Error("현재 장면을 손실 없이 읽을 수 없습니다.");
      const { pinnedVersionedCut: _pinned, ...legacyBg3d } = current;
      const now = previous?.scene.createdAt ?? "2026-09-27T00:00:00.000Z";
      const authority = createStudioScene3dAuthority({
        authorityId: projectId,
        bg3d: legacyBg3d,
        viewportAspectRatio: aspect(),
        revision: previous?.scene.revision ?? 0,
        now,
      });
      let scene = { ...authority.document, activeCameraId: "camera:main" };
      if (
        previous &&
        (hashStudioScene3dCommandState(scene) !==
          hashStudioScene3dCommandState(previous.scene) ||
          hashStudioScene3dCommandState({ value: legacyBg3d }) !==
            hashStudioScene3dCommandState({ value: previous.legacyBg3d }))
      )
        scene = { ...scene, revision: previous.scene.revision + 1 };
      const shared = (h.targetHasLinkedCharacters || h.includeSharedCharactersInCapture)
        ? (refreshLinked ? h.liveSharedSceneSession?.characters : h.sharedCharacters) ?? h.sharedSceneSession?.characters ?? [] : [];
      const pinned = refreshLinked ? undefined : current.pinnedVersionedCut?.source.linkedVrm;
      if (!shared.length && !pinned && h.targetHasLinkedCharacters) throw new Error("연결한 VRM 원본을 찾지 못했습니다. 원고의 연결 상태를 확인하세요.");
      const linkedVrm = shared.length ? { version: 1, documentScope: h.cutDocumentKey,
        characters: shared.map(({ elementId, label, stageTransform, scene: vrmScene }) => ({ elementId, label, stageTransform, vrmScene })) } : pinned;
      return parseStudioScene3dCutSource({ scene, characters: {}, legacyBg3d, linkedVrm });
    },
    async applySource(sourceInput, cut, signal) {
      signal.throwIfAborted();
      const reason = blockedReason();
      if (reason) throw new Error(reason);
      const source = parseStudioScene3dCutSource(sourceInput);
      if (source.linkedVrm && ((h.cutTeamDocument && !h.cutWorkId) || source.linkedVrm.documentScope !== h.cutDocumentKey))
        throw new Error("이 원고에서는 고정 VRM 원본을 복원할 수 없습니다. 고정한 로컬 원고와 페이지를 확인하세요.");
      if (source.scene.documentId !== projectId)
        throw new Error(
          "다른 장면의 컷은 현재 편집 세션에 적용할 수 없습니다."
        );
      if (!source.legacyBg3d)
        throw new Error("이 호스트에서 복원할 BG3D 원본이 없습니다.");
      if (source.scene.entities.some((entity) => entity.kind === "character"))
        throw new Error(
          "V3 캐릭터 원본의 뷰포트 적용 경로가 이 BG3D 호스트에 연결되지 않았습니다."
        );
      const authority = createStudioScene3dAuthority({
        authorityId: projectId,
        bg3d: source.legacyBg3d,
        viewportAspectRatio:
          source.scene.output.width / source.scene.output.height,
        revision: source.scene.revision,
        now: source.scene.createdAt,
      });
      const materialized = cut
        ? materializeStudioScene3dVersionedCut(cut).scene
        : source.scene;
      const projection = projectStudioScene3dAuthorityToSources(
        authority,
        materialized
      );
      if (
        projection.issues.length ||
        projection.characterTransformRequests.length
      )
        throw new Error(
          projection.issues[0]?.message ??
            "연결 캐릭터 원본 적용을 확인할 수 없습니다."
        );
      const document = parseStudioBg3dSceneDocument(
        JSON.stringify({
          ...projection.bg3d,
          ...(cut ? { pinnedVersionedCut: cut } : {}),
        })
      );
      if (!document)
        throw new Error(
          "컷 원본과 연결 참조가 BG3D 저장 예산 또는 검증 조건을 벗어났습니다."
        );
      const readInputRevision = () =>
        h.physicsRuntimeSourceRef?.current.revision ??
        hashStudioScene3dCommandState({
          scene: h.sceneBaseDocument,
          primitives: h.primitives,
          models: h.customModels,
        });
      const inputRevision = readInputRevision();
      let prepared: StudioScene3dPreparedCutAssets | undefined;
      try {
        if (source.linkedVrm) {
          const { verifyStudioScene3dCutVrmAssets } = await import("./studio-scene3d-cut-vrm-assets");
          await verifyStudioScene3dCutVrmAssets(source.linkedVrm, signal, h.cutWorkResources);
        }
        if (document.attachments.length) {
          if (
            !modelRenderer ||
            !h.modelRootCacheRef ||
            !h.attachmentByStorageModelIdRef
          )
            throw new Error("컷 모델을 복원할 렌더러가 준비되지 않았습니다.");
          prepared = await prepareStudioScene3dCutAssets({
            document,
            signal,
            quality: resolveDeviceQuality(
              document,
              h.viewportHostRef?.current ?? null
            ),
            renderer: modelRenderer, materialBackend,
            cache: h.modelRootCacheRef.current,
            isCurrent: () => blockedReason() === null,
            expectedInputRevision: inputRevision,
            readInputRevision,
          });
        }
        const hydrated = hydrateStudioBg3dDocumentToRuntime({
          document,
          storageModelIdByAttachmentId:
            prepared?.storageModelIdByAttachmentId ??
            h.storageModelIdByAttachmentIdRef.current,
        });
        if (
          !hydrated.ok ||
          hydrated.diagnostics.length ||
          hydrated.omittedDiagnosticCount ||
          hydrated.primitives.length + hydrated.customModels.length !==
            document.nodes.length
        )
          throw new Error(
            "컷의 모델 원본을 찾지 못했습니다. 해당 모델을 불러온 뒤 다시 시도하세요."
          );
        const before = h.readCurrentCanonicalSceneForShot();
        if (!before)
          throw new Error("장면 입력이 잠겨 컷 복귀를 중단했습니다.");
        signal.throwIfAborted();
        const reasonAfterPrepare = blockedReason();
        if (reasonAfterPrepare) throw new Error(reasonAfterPrepare);
        if (readInputRevision() !== inputRevision)
          throw new Error(
            "모델을 준비하는 동안 장면이 변경되어 컷 복귀를 중단했습니다."
          );
        if (prepared && h.attachmentByStorageModelIdRef) {
          for (const [
            storageId,
            attachment,
          ] of prepared.attachmentByStorageModelId) {
            const previous =
              h.attachmentByStorageModelIdRef.current.get(storageId);
            if (previous && previous.id !== attachment.id)
              throw new Error(
                "같은 모델의 첨부 식별자가 현재 장면과 충돌합니다. 원본 참조를 확인하세요."
              );
          }
        }
        if (prepared) {
          for (const [
            attachmentId,
            storageId,
          ] of prepared.storageModelIdByAttachmentId) {
            const previous =
              h.storageModelIdByAttachmentIdRef.current.get(attachmentId);
            if (previous && previous !== storageId)
              throw new Error(
                "같은 첨부 식별자가 다른 모델 원본에 연결되어 컷 복귀를 중단했습니다."
              );
          }
        }
        const reasonBeforeCommit = blockedReason();
        if (reasonBeforeCommit) throw new Error(reasonBeforeCommit);
        prepared?.commitCache();
        if (prepared) {
          h.storageModelIdByAttachmentIdRef.current = new Map([
            ...h.storageModelIdByAttachmentIdRef.current,
            ...prepared.storageModelIdByAttachmentId,
          ]);
          if (h.attachmentByStorageModelIdRef)
            h.attachmentByStorageModelIdRef.current = new Map([
              ...h.attachmentByStorageModelIdRef.current,
              ...prepared.attachmentByStorageModelId,
            ]);
        }
        h.commitImmediateHistoryTransition(
          hydrated.primitives,
          hydrated.customModels,
          document,
          createStudioBg3dHistorySnapshot({
            primitives: h.primitives,
            customModels: h.customModels,
            document: before,
          }),
          {
            commandId: "scene3d.cut.restore",
            label: cut ? `${cut.name} 고정 버전 복귀` : "컷 프로젝트 복원",
            source: "inspector",
            preserveBeforeCamera: true,
          }
        );
        h.replaceCanonicalDocumentState({
          primitives: hydrated.primitives,
          customModels: hydrated.customModels,
          document,
        });
        if (prepared && h.attachmentByStorageModelIdRef) {
          const workflow = readGenericWorkflowMapsFromAttachments(
            h.attachmentByStorageModelIdRef.current
          );
          h.setGenericModelSourceFormats?.(workflow.sourceFormats);
          h.setGenericModelClassifications?.(workflow.classifications);
        }
        const cameraStatus = applyOrDeferStudioBg3dHistoryCamera(
          h.viewportApiRef.current,
          h.pendingInitialCameraRef,
          document.camera
        );
        h.setLineArtPreview(document.output.line.enabled);
        return cameraStatus;
      } finally {
        prepared?.dispose();
      }
    },
  };
}
