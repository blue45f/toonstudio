import type { BgViewportApi } from "./studio-bg3d-camera-application";
import {
  normalizeStudioBg3dSceneDocument,
  type StudioBg3dModelAttachment,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";

export const MAX_STUDIO_BG3D_UNAPPLIED_DRAFT_ENTRIES = 16;

export interface StudioBg3dUnappliedDraftEntry {
  readonly document: StudioBg3dSceneDocument;
  readonly lineArtPreview: boolean;
  readonly savedAt: number;
}

const unappliedDraftByScope = new Map<string, StudioBg3dUnappliedDraftEntry>();

function normalizeDraftScopeKey(scopeKey: string | null | undefined): string | null {
  const trimmed = typeof scopeKey === "string" ? scopeKey.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

export function readStudioBg3dUnappliedDraft(
  scopeKey: string | null | undefined,
): StudioBg3dUnappliedDraftEntry | null {
  const key = normalizeDraftScopeKey(scopeKey);
  if (!key) return null;
  return unappliedDraftByScope.get(key) ?? null;
}

export function saveStudioBg3dUnappliedDraft(
  scopeKey: string | null | undefined,
  input: {
    readonly document: StudioBg3dSceneDocument;
    readonly lineArtPreview?: boolean;
    readonly savedAt?: number;
  },
): StudioBg3dUnappliedDraftEntry | null {
  const key = normalizeDraftScopeKey(scopeKey);
  if (!key) return null;
  const entry: StudioBg3dUnappliedDraftEntry = Object.freeze({
    document: normalizeStudioBg3dSceneDocument(input.document),
    lineArtPreview: Boolean(input.lineArtPreview),
    savedAt: input.savedAt ?? Date.now(),
  });
  unappliedDraftByScope.delete(key);
  unappliedDraftByScope.set(key, entry);
  while (unappliedDraftByScope.size > MAX_STUDIO_BG3D_UNAPPLIED_DRAFT_ENTRIES) {
    const oldestKey = unappliedDraftByScope.keys().next().value;
    if (oldestKey === undefined) break;
    unappliedDraftByScope.delete(oldestKey);
  }
  return entry;
}

export function clearStudioBg3dUnappliedDraft(
  scopeKey: string | null | undefined,
): void {
  const key = normalizeDraftScopeKey(scopeKey);
  if (!key) return;
  unappliedDraftByScope.delete(key);
}

/** Test isolation only. */
export function resetStudioBg3dUnappliedDraftsForTests(): void {
  unappliedDraftByScope.clear();
}

export function isStudioBg3dUnappliedDraftEligible(props: {
  readonly operation?: "insert" | "update";
  readonly initialScene?: StudioBg3dSceneDocument;
  readonly initialDataUrl?: string;
  readonly seedSceneTemplateId?: string | null;
  readonly seedPrimitiveKind?: string | null;
  readonly seedModelSourceId?: string | null;
}): boolean {
  const operation = props.operation ?? "insert";
  return (
    operation === "insert"
    && !props.initialScene
    && !props.initialDataUrl
    && !props.seedSceneTemplateId
    && !props.seedPrimitiveKind
    && !props.seedModelSourceId
  );
}

export function resolveStudioBg3dPropsWithUnappliedDraft<T extends Record<string, unknown>>(
  props: T,
): {
  readonly effectiveProps: T;
  readonly unappliedDraftEligible: boolean;
  readonly restoredDraft: StudioBg3dUnappliedDraftEntry | null;
} {
  const eligible = isStudioBg3dUnappliedDraftEligible(props as {
    readonly operation?: "insert" | "update";
    readonly initialScene?: StudioBg3dSceneDocument;
    readonly initialDataUrl?: string;
    readonly seedSceneTemplateId?: string | null;
    readonly seedPrimitiveKind?: string | null;
    readonly seedModelSourceId?: string | null;
  });
  if (!eligible) {
    return {
      effectiveProps: props,
      unappliedDraftEligible: false,
      restoredDraft: null,
    };
  }
  const scopeKey = typeof props.sharedStageSessionScopeKey === "string"
    ? props.sharedStageSessionScopeKey
    : null;
  const restoredDraft = readStudioBg3dUnappliedDraft(scopeKey);
  if (!restoredDraft) {
    return {
      effectiveProps: props,
      unappliedDraftEligible: true,
      restoredDraft: null,
    };
  }
  return {
    effectiveProps: {
      ...props,
      initialScene: restoredDraft.document,
    },
    unappliedDraftEligible: true,
    restoredDraft,
  };
}

export interface StudioBg3dUnappliedDraftHostSnapshot {
  readonly unappliedDraftEligible?: boolean;
  readonly sharedStageSessionScopeKey?: string;
  readonly primitives?: readonly BgPrimitive[];
  readonly customModels?: readonly BgCustomModelInstance[];
  readonly lineArtPreview?: boolean;
  readonly isRestoringScene?: boolean;
  readonly modelRenderer?: unknown;
  readonly sceneBaseDocument?: StudioBg3dSceneDocument;
  readonly viewportApiRef?: { readonly current: Pick<BgViewportApi, "readView"> | null };
  readonly attachmentByStorageModelIdRef?: {
    readonly current: ReadonlyMap<string, StudioBg3dModelAttachment>;
  };
}

/**
 * Saves or clears the unapplied `"insert"` draft when the artist returns to 2D without applying.
 * If the renderer never finished starting/hydrating (`modelRenderer == null || isRestoringScene`),
 * an empty runtime array must NOT wipe an already-saved draft for the same scope.
 */
export function persistStudioBg3dUnappliedDraftFromHost(
  host: StudioBg3dUnappliedDraftHostSnapshot,
): void {
  if (!host.unappliedDraftEligible) return;
  const scopeKey = normalizeDraftScopeKey(host.sharedStageSessionScopeKey);
  if (!scopeKey || !host.sceneBaseDocument) return;
  const primitives = host.primitives ?? [];
  const customModels = host.customModels ?? [];
  const lineArtPreview = Boolean(host.lineArtPreview);
  if (primitives.length === 0 && customModels.length === 0 && !lineArtPreview) {
    if (!host.isRestoringScene && host.modelRenderer != null) {
      clearStudioBg3dUnappliedDraft(scopeKey);
    }
    return;
  }
  const currentView = host.viewportApiRef?.current?.readView() ?? host.sceneBaseDocument.camera;
  const adapted = tryAdaptStudioBg3dRuntimeToDocument({
    primitives,
    customModels,
    attachmentByStorageModelId: host.attachmentByStorageModelIdRef?.current ?? new Map(),
    baseDocument: {
      ...host.sceneBaseDocument,
      camera: currentView,
    },
  });
  if (!adapted.ok) return;
  saveStudioBg3dUnappliedDraft(scopeKey, {
    document: adapted.value.document,
    lineArtPreview,
  });
}
