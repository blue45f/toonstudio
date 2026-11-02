import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import {
  createStudioBg3dHistorySnapshot,
  type StudioBg3dHistorySnapshot,
} from "./studio-bg3d-editor-derivations";
import {
  parseStudioBg3dMeasurementDocument,
  serializeStudioBg3dMeasurementDocument,
  type StudioBg3dMeasurementDocument,
} from "./studio-bg3d-measurement";
import {
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES,
  serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import type {
  StudioBg3dModelAttachment,
  StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document-types";
import { readStudioBg3dSceneMeasurements } from "./studio-bg3d-scene-measurements";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import type {
  StudioBg3dCanonicalDocumentMutation,
  StudioBg3dCanonicalDocumentSnapshot,
} from "./useStudioBg3dCanonicalDocumentState";

/** 가변 편집기 호스트는 각 속성을 호출 시점의 getter로 연결한다. */
export interface StudioBg3dMeasurementCommandHost {
  readonly open: boolean;
  readonly modelRenderer: unknown;
  readonly isRestoringScene: boolean;
  readonly isCapturing: boolean;
  readonly isBatchRenderingShots: boolean;
  readonly physicsInteractionLocked: boolean;
  readonly captureInFlightRef: { readonly current: boolean };
  readonly physicsRuntimeSourceRef: { readonly current: StudioBg3dCanonicalDocumentSnapshot };
  readonly modalAssetSessionRef: { readonly current: object | null };
  readonly attachmentByStorageModelIdRef: { readonly current: ReadonlyMap<string, StudioBg3dModelAttachment> };
  /** 두 쓰기 포트는 검증 후 동기적으로 완료하며 예외를 던지지 않는 생산자 계약이다. */
  replaceCanonicalDocumentState(mutation: StudioBg3dCanonicalDocumentMutation): unknown;
  commitImmediateHistoryTransition(
    primitives: readonly BgPrimitive[],
    customModels: readonly BgCustomModelInstance[],
    document: StudioBg3dSceneDocument,
    before: StudioBg3dHistorySnapshot,
    options: { readonly commandId: string; readonly label: string; readonly source: "menu" },
  ): void;
}

export type StudioBg3dMeasurementCommandFailureCode =
  | "scene-unavailable"
  | "source-changed"
  | "measurement-invalid"
  | "document-rejected";

export type StudioBg3dMeasurementCommandResult = {
  readonly ok: false;
  readonly code: StudioBg3dMeasurementCommandFailureCode;
  readonly messageKo: string;
} | {
  readonly ok: true;
  readonly changed: boolean;
  readonly document: StudioBg3dMeasurementDocument;
};

function failure(
  code: StudioBg3dMeasurementCommandFailureCode,
  messageKo: string,
): StudioBg3dMeasurementCommandResult {
  return { ok: false, code, messageKo };
}

function available(host: StudioBg3dMeasurementCommandHost): boolean {
  return host.open === true && host.modelRenderer != null && !host.isRestoringScene
    && !host.isCapturing && !host.isBatchRenderingShots && !host.physicsInteractionLocked
    && host.captureInFlightRef.current === false && host.modalAssetSessionRef.current !== null;
}

/**
 * 길이 안내선과 단위를 최신 장면의 한 revision, 한 history 전환으로 반영한다.
 * 런타임 어댑터는 저장 가능성만 검사하며 변환된 nodes로 현재 형상을 덮어쓰지 않는다.
 */
export function applyStudioBg3dMeasurementDocument(
  host: StudioBg3dMeasurementCommandHost,
  input: {
    readonly expectedCurrent: StudioBg3dMeasurementDocument;
    readonly next: StudioBg3dMeasurementDocument;
  },
): StudioBg3dMeasurementCommandResult {
  let prepared: {
    readonly document: StudioBg3dSceneDocument;
    readonly measurement: StudioBg3dMeasurementDocument;
    readonly changed: boolean;
    readonly before: StudioBg3dHistorySnapshot;
    readonly live: StudioBg3dCanonicalDocumentSnapshot;
    readonly revision: number;
    readonly sourceRef: StudioBg3dMeasurementCommandHost["physicsRuntimeSourceRef"];
    readonly sessionRef: StudioBg3dMeasurementCommandHost["modalAssetSessionRef"];
    readonly session: object;
    readonly renderer: unknown;
    readonly captureRef: StudioBg3dMeasurementCommandHost["captureInFlightRef"];
    readonly attachmentRef: StudioBg3dMeasurementCommandHost["attachmentByStorageModelIdRef"];
    readonly attachments: ReadonlyMap<string, StudioBg3dModelAttachment>;
    readonly currentSerialized: string;
  };
  try {
    if (!available(host)) return failure("scene-unavailable", "현재 장면의 편집 준비가 끝난 뒤 측정값을 다시 반영하세요.");
    const sourceRef = host.physicsRuntimeSourceRef;
    const live = sourceRef.current;
    const revision = live.revision;
    const sessionRef = host.modalAssetSessionRef;
    const session = sessionRef.current;
    const renderer = host.modelRenderer;
    const captureRef = host.captureInFlightRef;
    const attachmentRef = host.attachmentByStorageModelIdRef;
    const attachments = attachmentRef.current;
    if (!session || !Number.isSafeInteger(revision) || revision < 0) {
      return failure("scene-unavailable", "현재 장면의 편집 세션을 확인하지 못했습니다.");
    }
    const currentSerialized = serializeStudioBg3dMeasurementDocument(readStudioBg3dSceneMeasurements(live.document));
    const expectedSerialized = serializeStudioBg3dMeasurementDocument(input.expectedCurrent);
    const nextSerialized = serializeStudioBg3dMeasurementDocument(input.next);
    const measurement = nextSerialized === null ? null : parseStudioBg3dMeasurementDocument(nextSerialized);
    if (expectedSerialized === null || !measurement || nextSerialized === null) {
      return failure("measurement-invalid", "측정 문서의 형식 또는 64 KiB 용량 범위를 확인하세요.");
    }
    if (currentSerialized === null || expectedSerialized !== currentSerialized) {
      return failure("source-changed", "측정값이 다른 작업에서 바뀌었습니다. 최신 측정값에서 다시 시도하세요.");
    }
    const document: StudioBg3dSceneDocument = { ...live.document, measurements: measurement };
    if (!serializeStudioBg3dSceneDocument(live.document) || !serializeStudioBg3dSceneDocument(document)) {
      return failure("document-rejected", "측정값을 기존 장면 정보와 함께 손실 없이 저장할 수 없습니다.");
    }
    const adapted = tryAdaptStudioBg3dRuntimeToDocument({
      primitives: live.primitives,
      customModels: live.customModels,
      baseDocument: document,
      attachmentByStorageModelId: attachments,
    });
    if (!adapted.ok || adapted.value.diagnostics.length !== 0 || adapted.value.omittedDiagnosticCount !== 0
      || adapted.value.counts.inputPrimitives !== live.primitives.length
      || adapted.value.counts.inputCustomModels !== live.customModels.length
      || adapted.value.counts.emittedPrimitives !== live.primitives.length
      || adapted.value.counts.emittedCustomModels !== live.customModels.length
      || adapted.value.counts.droppedPrimitives !== 0 || adapted.value.counts.droppedCustomModels !== 0
      || new TextEncoder().encode(adapted.value.serialized).byteLength > STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES
      || serializeStudioBg3dSceneDocument(adapted.value.document) !== adapted.value.serialized
      || serializeStudioBg3dMeasurementDocument(readStudioBg3dSceneMeasurements(adapted.value.document)) !== nextSerialized) {
      return failure("document-rejected", "최신 오브젝트와 측정값을 장면의 저장 용량 안에서 손실 없이 저장할 수 없습니다.");
    }
    prepared = {
      document, measurement, changed: nextSerialized !== currentSerialized,
      before: createStudioBg3dHistorySnapshot(live), live, revision, sourceRef, sessionRef,
      session, renderer, captureRef, attachmentRef, attachments, currentSerialized,
    };
  } catch {
    return failure("document-rejected", "측정값을 반영하기 위한 장면 검증을 완료하지 못했습니다.");
  }

  // 검증 과정의 getter·어댑터가 원본을 바꿨더라도 이전 사본으로 commit하지 않는다.
  try {
    if (!available(host)) return failure("scene-unavailable", "장면의 편집 상태가 바뀌었습니다. 진행 중인 작업이 끝난 뒤 다시 시도하세요.");
    if (host.physicsRuntimeSourceRef !== prepared.sourceRef || prepared.sourceRef.current !== prepared.live
      || prepared.sourceRef.current.revision !== prepared.revision
      || host.modalAssetSessionRef !== prepared.sessionRef || prepared.sessionRef.current !== prepared.session
      || host.modelRenderer !== prepared.renderer || host.captureInFlightRef !== prepared.captureRef
      || host.attachmentByStorageModelIdRef !== prepared.attachmentRef || prepared.attachmentRef.current !== prepared.attachments
      || serializeStudioBg3dMeasurementDocument(readStudioBg3dSceneMeasurements(prepared.sourceRef.current.document)) !== prepared.currentSerialized) {
      return failure("source-changed", "검증 중 장면 또는 편집 세션이 바뀌어 측정값을 반영하지 않았습니다.");
    }
  } catch {
    return failure("source-changed", "최신 장면 상태를 확인하지 못해 측정값을 반영하지 않았습니다.");
  }
  if (!prepared.changed) return { ok: true, changed: false, document: prepared.measurement };

  // 검증 후 쓰기 포트 예외는 성공·검증 실패로 바꾸지 않고 호출자에게 그대로 전달한다.
  host.commitImmediateHistoryTransition(prepared.live.primitives, prepared.live.customModels, prepared.document, prepared.before, {
    commandId: "studio.bg3d.measurements.apply", label: "측정 안내선과 단위 변경", source: "menu",
  });
  host.replaceCanonicalDocumentState({ document: prepared.document });
  return { ok: true, changed: true, document: prepared.measurement };
}
