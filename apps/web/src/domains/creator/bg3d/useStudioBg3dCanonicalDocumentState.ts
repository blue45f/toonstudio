import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import {
  normalizeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import { syncLinkedCloneAppearance } from "./studio-bg3d-linked-clones";

export interface StudioBg3dCanonicalDocumentSnapshot {
  readonly revision: number;
  readonly primitives: BgPrimitive[];
  readonly customModels: BgCustomModelInstance[];
  readonly document: StudioBg3dSceneDocument;
}

export interface StudioBg3dCanonicalDocumentMutation {
  readonly primitives?: readonly BgPrimitive[];
  readonly customModels?: readonly BgCustomModelInstance[];
  readonly document?: StudioBg3dSceneDocument;
}

export interface StudioBg3dCanonicalDocumentState {
  readonly primitives: BgPrimitive[];
  readonly setPrimitives: Dispatch<SetStateAction<BgPrimitive[]>>;
  readonly customModels: BgCustomModelInstance[];
  readonly setCustomModels: Dispatch<SetStateAction<BgCustomModelInstance[]>>;
  readonly sceneBaseDocument: StudioBg3dSceneDocument;
  readonly setSceneBaseDocument: Dispatch<SetStateAction<StudioBg3dSceneDocument>>;
  readonly canonicalRevision: number;
  readonly liveSceneRef: MutableRefObject<StudioBg3dCanonicalDocumentSnapshot>;
  readonly replaceCanonicalDocumentState: (
    mutation: StudioBg3dCanonicalDocumentMutation,
  ) => StudioBg3dCanonicalDocumentSnapshot;
}

function resolveAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === "function"
    ? (action as (value: T) => T)(current)
    : action;
}

function copyPrimitives(values: readonly BgPrimitive[]): BgPrimitive[] {
  return [...values];
}

function copyModels(values: readonly BgCustomModelInstance[]): BgCustomModelInstance[] {
  return [...values];
}

/**
 * Owns every persisted BG3D mutation behind one synchronous revision fence. UI/session state stays
 * outside this hook; renderer and history readers consume `liveSceneRef` so several React setters
 * can never expose a mixed primitive/model/document revision.
 */
export function useStudioBg3dCanonicalDocumentState(input: {
  readonly initialDocument: StudioBg3dSceneDocument;
}): StudioBg3dCanonicalDocumentState {
  const initialDocumentRef = useRef<StudioBg3dSceneDocument | null>(null);
  initialDocumentRef.current ??= normalizeStudioBg3dSceneDocument(input.initialDocument);
  const [primitives, setPrimitivesState] = useState<BgPrimitive[]>([]);
  const [customModels, setCustomModelsState] = useState<BgCustomModelInstance[]>([]);
  const [sceneBaseDocument, setSceneBaseDocumentState] = useState(initialDocumentRef.current);
  const [canonicalRevision, setCanonicalRevision] = useState(0);
  const liveSceneRef = useRef<StudioBg3dCanonicalDocumentSnapshot>({
    primitives: [],
    customModels: [],
    document: initialDocumentRef.current,
    revision: 0,
  });

  const replaceCanonicalDocumentState = useCallback((
    mutation: StudioBg3dCanonicalDocumentMutation,
  ): StudioBg3dCanonicalDocumentSnapshot => {
    const current = liveSceneRef.current;
    const hasPrimitives = mutation.primitives !== undefined;
    const hasModels = mutation.customModels !== undefined;
    const hasDocument = mutation.document !== undefined;
    // 연결 복제 동기화: 링크가 있는 커밋에서만 원본 외형을 복제본에 반영한다. 링크가 없으면
    // sync가 입력 배열을 그대로 돌려줘 기존 no-op 판정이 유지된다.
    const synced = syncLinkedCloneAppearance({
      primitives: hasPrimitives ? (mutation.primitives ?? []) : current.primitives,
      customModels: hasModels ? (mutation.customModels ?? []) : current.customModels,
    });
    const nextPrimitives = hasPrimitives || synced.changed
      ? copyPrimitives(synced.primitives)
      : current.primitives;
    const nextModels = hasModels || synced.changed
      ? copyModels(synced.customModels)
      : current.customModels;
    const nextDocument = hasDocument
      ? mutation.document === current.document
        ? current.document
        : normalizeStudioBg3dSceneDocument(mutation.document ?? current.document)
      : current.document;

    if (
      !synced.changed
      && (!hasPrimitives || mutation.primitives === current.primitives)
      && (!hasModels || mutation.customModels === current.customModels)
      && nextDocument === current.document
    ) return current;

    const next: StudioBg3dCanonicalDocumentSnapshot = {
      primitives: nextPrimitives,
      customModels: nextModels,
      document: nextDocument,
      revision: current.revision + 1,
    };
    liveSceneRef.current = next;
    if (nextPrimitives !== current.primitives) setPrimitivesState(nextPrimitives);
    if (nextModels !== current.customModels) setCustomModelsState(nextModels);
    if (nextDocument !== current.document) setSceneBaseDocumentState(nextDocument);
    setCanonicalRevision(next.revision);
    return next;
  }, []);

  const setPrimitives = useCallback<Dispatch<SetStateAction<BgPrimitive[]>>>((action) => {
    const current = liveSceneRef.current.primitives;
    const next = resolveAction(action, current);
    if (next === current) return;
    replaceCanonicalDocumentState({ primitives: next });
  }, [replaceCanonicalDocumentState]);

  const setCustomModels = useCallback<Dispatch<SetStateAction<BgCustomModelInstance[]>>>((action) => {
    const current = liveSceneRef.current.customModels;
    const next = resolveAction(action, current);
    if (next === current) return;
    replaceCanonicalDocumentState({ customModels: next });
  }, [replaceCanonicalDocumentState]);

  const setSceneBaseDocument = useCallback<Dispatch<SetStateAction<StudioBg3dSceneDocument>>>((action) => {
    const current = liveSceneRef.current.document;
    const next = resolveAction(action, current);
    if (next === current) return;
    replaceCanonicalDocumentState({ document: next });
  }, [replaceCanonicalDocumentState]);

  return {
    primitives,
    setPrimitives,
    customModels,
    setCustomModels,
    sceneBaseDocument,
    setSceneBaseDocument,
    canonicalRevision,
    liveSceneRef,
    replaceCanonicalDocumentState,
  };
}
